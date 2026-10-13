/**
 * Worker loss through the channels, without Bun (Linux Gateway design note
 * §6.2; Founder act FOUNDER-ACT-20261012-BR-LINUX-GATEWAY-IMPLEMENTATION B3.4;
 * ipc-contract.md §2: any error on a worker channel is worker loss).
 *
 * The C2 supervisor launches `bunExecutable workerEntrypoint`. Here the
 * "Bun" is this Node and the entrypoint is a few lines that speak the frame
 * protocol, so these cases run in the default suite on any OS. The real Bun
 * worker is exercised by the Prerequisite C suite.
 *
 *   - a worker that closes fd 3 and stays alive: the next request's write
 *     fails with no 'error' event; that is worker loss, not a plain
 *     transport_write_failed with the supervisor left active;
 *   - a channel error after `hello` has answered but before the worker's
 *     exit is recorded: the handshake fails closed, never 'active';
 *   - a channel error during a graceful shutdown: the supervisor is 'lost'
 *     at once, and the exit is reported as a loss, not as graceful;
 *   - an exit before the handshake: the hello is rejected at once, not left
 *     to its timeout, and the exit is reported as a loss;
 *   - a signal exit already observed when shutdown starts waiting: shutdown
 *     returns at once, not after a reap timeout.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { C2SupervisorError, C2WorkerSupervisor } from '../packages/worker-supervisor/src/index.js';

const root = mkdtempSync(join(tmpdir(), 'buildroom-supervisor-loss-'));
after(() => rmSync(root, { recursive: true, force: true }));

/**
 * A stand-in worker. It answers every request with the generation `hello`
 * gave it. The mode arrives in the one variable the supervisor passes.
 * `close-control-after-hello`: after answering `hello` it closes fd 3 and
 * keeps running. `mute-shutdown`: it never answers `shutdown`.
 */
const WORKER = `
import net from 'node:net';
const mode = process.env.PREREQC_WORKER_DB_PATH;
const control = new net.Socket({ fd: 3, readable: true, writable: false });
const out = new net.Socket({ fd: 4, readable: false, writable: true });
let buffer = Buffer.alloc(0);
let generation = null;
function send(frame) {
  const body = Buffer.from(JSON.stringify(frame));
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.byteLength, 0);
  out.write(Buffer.concat([head, body]));
}
control.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32BE(0);
    if (buffer.length < 4 + length) break;
    const frame = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
    buffer = buffer.subarray(4 + length);
    if (frame.op === 'hello') generation = frame.params.generation;
    if (frame.op === 'shutdown' && mode === 'mute-shutdown') continue;
    send({ ok: true, id: frame.id, generation, result: {} });
    if (frame.op === 'hello' && mode === 'close-control-after-hello') control.destroy();
  }
});
control.on('error', () => undefined);
setInterval(() => undefined, 1000);
`;
const entrypoint = join(root, 'stand-in-worker.mjs');
writeFileSync(entrypoint, WORKER);

let occupancy = 0;
function supervisor(mode: string): C2WorkerSupervisor {
  occupancy += 1;
  return new C2WorkerSupervisor({
    occupancyKey: `channel-loss-${String(occupancy)}`,
    launch: { bunExecutable: process.execPath, workerEntrypoint: entrypoint, dbPath: mode },
    requestTimeoutMs: 5_000,
  });
}

function childOf(sup: C2WorkerSupervisor): ChildProcess {
  const child = (sup as unknown as { child: ChildProcess | null }).child;
  assert.ok(child !== null, 'the worker was spawned');
  return child;
}

function exited(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

function codeOf(error: unknown): string {
  assert.ok(error instanceof C2SupervisorError, 'a classified supervisor error');
  return error.code;
}

describe('worker-supervisor-channel-loss · the stand-in worker', () => {
  it('handshakes and answers, so the cases below test loss and nothing else', async () => {
    const sup = supervisor('normal');
    try {
      await sup.start();
      assert.equal(sup.currentState(), 'active');
      const response = await sup.request('ping', {});
      assert.equal(response.ok, true);
    } finally {
      sup.dispose();
    }
  });
});

describe('worker-supervisor-channel-loss · a failed write is worker loss', () => {
  it('rejects worker_lost, goes lost and kills a worker that closed fd 3 and stayed alive', async () => {
    const sup = supervisor('close-control-after-hello');
    try {
      await sup.start();
      const child = childOf(sup);
      // Let the close reach the Gateway's end before the next write.
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(child.exitCode, null, 'the worker is still alive');
      await assert.rejects(() => sup.request('ping', {}), (error) => codeOf(error) === 'worker_lost');
      assert.equal(sup.currentState(), 'lost');
      await exited(child);
      assert.equal(child.signalCode, 'SIGKILL', 'the live worker was killed');
    } finally {
      sup.dispose();
    }
  });
});

describe('worker-supervisor-channel-loss · the handshake fails closed after a late channel error', () => {
  it('never reports active when a channel fails after hello answered', async () => {
    const sup = supervisor('normal');
    try {
      const starting = sup.start();
      const child = childOf(sup);
      const stdio = child.stdio as ReadonlyArray<Readable | Writable | null | undefined>;
      // This listener runs after the supervisor's own, which has just resolved
      // `hello`; the error lands before the handshake's continuation runs and
      // before the kill it causes has been observed as an exit.
      stdio[4]?.once('data', () => {
        stdio[3]?.emit('error', new Error('injected after hello'));
      });
      await assert.rejects(() => starting, (error) => codeOf(error) === 'worker_lost');
      assert.equal(sup.currentState(), 'lost');
      await exited(child);
    } finally {
      sup.dispose();
    }
  });
});

describe('worker-supervisor-channel-loss · a channel error during a graceful shutdown is loss', () => {
  it('goes lost at once, not shutting-down, and reports the exit as a loss', async () => {
    const sup = supervisor('normal');
    try {
      await sup.start();
      const child = childOf(sup);
      const stdio = child.stdio as ReadonlyArray<Readable | Writable | null | undefined>;
      const exitEvent = new Promise<{ graceful: boolean }>((resolve) => sup.once('worker-exit', resolve));
      let lostEmitted = false;
      sup.once('worker-lost', () => {
        lostEmitted = true;
      });
      const stopping = sup.shutdown();
      assert.equal(sup.currentState(), 'shutting-down');
      stdio[3]?.emit('error', new Error('injected during shutdown'));
      assert.equal(sup.currentState(), 'lost', 'a channel error is loss in every state but disposed');
      await stopping.catch(() => undefined);
      const exit = await exitEvent;
      assert.equal(exit.graceful, false);
      assert.equal(lostEmitted, true);
      assert.equal(sup.currentState(), 'lost');
    } finally {
      sup.dispose();
    }
  });
});

describe('worker-supervisor-channel-loss · an exit before the handshake is loss', () => {
  it('rejects the hello, leaves nothing pending, and reports the exit as a loss', async () => {
    const sup = supervisor('normal');
    try {
      const exitEvent = new Promise<{ graceful: boolean }>((resolve) => sup.once('worker-exit', resolve));
      let lostEmitted = false;
      sup.once('worker-lost', () => {
        lostEmitted = true;
      });
      const starting = sup.start();
      const child = childOf(sup);
      // The exit lands before the worker can answer hello: the handler sees 'starting'.
      child.emit('exit', 3, null);
      await assert.rejects(() => starting, (error) => codeOf(error) === 'worker_lost');
      const pending = (sup as unknown as { pending: Map<number, unknown> }).pending;
      assert.equal(pending.size, 0, 'the hello request is not left waiting for its timeout');
      assert.equal((await exitEvent).graceful, false);
      assert.equal(lostEmitted, true);
      assert.equal(sup.currentState(), 'lost');
    } finally {
      sup.dispose();
    }
  });
});

describe('worker-supervisor-channel-loss · shutdown after an observed signal exit', () => {
  it('returns at once instead of waiting out a reap timeout', async () => {
    const sup = supervisor('mute-shutdown');
    try {
      await sup.start();
      const child = childOf(sup);
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      const stopping = sup.shutdown();
      // The worker never answers shutdown; it dies by signal, and its exit is
      // observed before shutdown starts waiting for one.
      child.kill('SIGKILL');
      await exited;
      const began = Date.now();
      assert.equal(await stopping, -1, 'a signal exit reads as -1');
      assert.ok(Date.now() - began < 2_000, 'no reap timeout was waited out');
    } finally {
      sup.dispose();
    }
  });
});
