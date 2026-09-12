/**
 * AE-01 A2 — Founder Acceptance Run 02 enablement: the controlled fixture
 * acceptance Gateway (`test/support/phase1-acceptance-gateway.ts`).
 *
 * Mandated RED suites T1–T18 (AE-01 A2 final plan §17), in five slices:
 *
 *   A  isolation and dependencies   T1–T7
 *   B  Room and IPC                 T8–T11
 *   C  fixture output               T12
 *   D  lifecycle cleanup            T13–T16
 *   E  prohibited mechanisms and    T17–T18
 *      existing regressions
 *
 * CONTROLLED FIXTURE ACCEPTANCE ONLY. The Gateway under test is the REAL
 * `GatewayDaemon` over a host-temporary root; nothing here is production,
 * live occupancy, provider execution, or Room Runtime Phase 2.
 *
 * Forbidden-operation proofs distinguish an ATTEMPT (counted, refused) from
 * a COMPLETED external side effect (must stay zero): a rejection observed
 * here is the acceptance runner's own refusal, never an exception a
 * dependency happened to catch.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  Custody,
  ExecutionCardinalityError,
  GatewayDaemon,
  defaultGatewayDirectory,
  ipcRequest,
  type OutFrame,
} from '../packages/gateway-daemon/src/index.js';
import { FRAME_TYPE_CONTROL, FRAME_TYPE_VT_PATCH, decodeV2Frames, encodeV2Frame } from '../packages/gateway-protocol/src/index.js';
import {
  AcceptanceKeychainRunner,
  DEAD_END_CONTROL_PLANE_URL,
  FAILED_MARKER,
  FIXTURE_EXECUTION_IDS,
  FIXTURE_INTERVAL_MS,
  FIXTURE_ROOM_ID,
  NETWORK_FORBIDDEN,
  NetworkForbiddenError,
  READY_MARKER,
  SESSION_FILE_NAME,
  TEMP_ROOT_PREFIX,
  beginFixtureOutput,
  createAcceptanceGateway,
  fixtureTickText,
  runAcceptance,
  type AcceptanceGateway,
} from './support/phase1-acceptance-gateway.js';

/** The runner's SOURCE (not its build), for the static prohibited-mechanism proofs. */
const RUNNER_SOURCE_PATH = join(import.meta.dirname, '..', '..', 'test', 'support', 'phase1-acceptance-gateway.ts');
const CANONICAL_GATEWAY_DIRECTORY = defaultGatewayDirectory();

function runnerSource(): string {
  return readFileSync(RUNNER_SOURCE_PATH, 'utf8');
}

/** Construct a gateway for one proof and always tear its temporary root down. */
async function withGateway(body: (gateway: AcceptanceGateway) => Promise<void>): Promise<void> {
  const gateway = await createAcceptanceGateway();
  try {
    await body(gateway);
  } finally {
    if (gateway.isBooted()) await gateway.daemon.stop();
    await rm(gateway.tempRoot, { recursive: true, force: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Slice A — isolation and dependencies (T1–T7)
// ---------------------------------------------------------------------------

describe('Slice A — isolation and dependencies', () => {
  it('T1 the temporary root is a fresh mkdtemp under os.tmpdir() and never the canonical Gateway directory', async () => {
    await withGateway(async (gateway) => {
      assert.ok(gateway.tempRoot.startsWith(tmpdir()), `${gateway.tempRoot} is under ${tmpdir()}`);
      assert.ok(basename(gateway.tempRoot).startsWith(TEMP_ROOT_PREFIX), `basename carries ${TEMP_ROOT_PREFIX}`);
      assert.equal(statSync(gateway.tempRoot).mode & 0o777, 0o700, 'mkdtemp root is 0700');
      assert.notEqual(gateway.tempRoot, CANONICAL_GATEWAY_DIRECTORY);
      assert.ok(!gateway.tempRoot.startsWith(`${CANONICAL_GATEWAY_DIRECTORY}/`), 'not beneath the canonical directory');
      assert.ok(!CANONICAL_GATEWAY_DIRECTORY.startsWith(`${gateway.tempRoot}/`), 'the canonical directory is not beneath it');
    });
    // Two runs never share a root.
    const first = await createAcceptanceGateway();
    const second = await createAcceptanceGateway();
    try {
      assert.notEqual(first.tempRoot, second.tempRoot);
    } finally {
      await rm(first.tempRoot, { recursive: true, force: true });
      await rm(second.tempRoot, { recursive: true, force: true });
    }
  });

  it('T2 every GatewayPaths member and the session path resolve beneath the temporary root', async () => {
    await withGateway(async (gateway) => {
      const { paths } = gateway;
      assert.equal(paths.directory, gateway.tempRoot);
      for (const [name, path] of Object.entries({
        socketPath: paths.socketPath,
        statePath: paths.statePath,
        stagingLockPath: paths.stagingLockPath,
        sessionPath: gateway.sessionPath,
      })) {
        assert.equal(dirname(path), gateway.tempRoot, `${name} lives directly under the temporary root`);
        assert.ok(!path.startsWith(`${CANONICAL_GATEWAY_DIRECTORY}/`), `${name} is outside the canonical directory`);
      }
      assert.equal(basename(paths.socketPath), 'ipc.sock', 'the daemon\'s own socket name, no new endpoint');
      assert.equal(basename(gateway.sessionPath), SESSION_FILE_NAME);
    });
  });

  it('T3 custody is Custody over AcceptanceKeychainRunner; the real security-tool runner is never constructed', async () => {
    await withGateway(async (gateway) => {
      assert.ok(gateway.daemon instanceof GatewayDaemon, 'the REAL daemon class');
      assert.ok(gateway.deps.custody instanceof Custody, 'the REAL Custody class');
      assert.ok(gateway.deps.keychain instanceof AcceptanceKeychainRunner);
      // `Custody` keeps its runner private at compile time only; the instance
      // field is the one honest witness of what custody actually drives.
      assert.equal(Reflect.get(gateway.deps.custody, 'runner'), gateway.deps.keychain, 'custody drives the acceptance runner and nothing else');
    });
    const source = runnerSource();
    assert.ok(!/SecurityCommandRunner/.test(source), 'the runner source never names the real security-tool runner');
    assert.ok(!source.includes('/usr/bin/security'), 'the runner source never names the security binary');
    assert.equal((source.match(/new Custody\(/g) ?? []).length, 1, 'exactly one Custody construction');
    assert.match(source, /const keychain = new AcceptanceKeychainRunner\(\);/, 'the one runner is an AcceptanceKeychainRunner');
    assert.match(source, /new Custody\(keychain\)/, 'custody is Custody over that runner and nothing else');
    assert.equal((source.match(/new AcceptanceKeychainRunner\(\)/g) ?? []).length, 1, 'exactly one runner is ever constructed');
  });

  it('T4 find-generic-password answers ITEM_NOT_FOUND (44); only `reads` increments', async () => {
    await withGateway(async (gateway) => {
      const { keychain, custody } = gateway.deps;
      assert.deepEqual({ reads: keychain.reads, writes: keychain.writes, deletes: keychain.deletes }, { reads: 0, writes: 0, deletes: 0 });
      assert.equal(await custody.read('primary'), null, 'no item, no secret');
      assert.equal(await custody.read('staging'), null);
      const direct = await keychain.run(['find-generic-password', '-a', 'primary', '-s', 'any', '-w']);
      assert.equal(direct.code, 44);
      assert.equal(direct.stdout, '', 'nothing ever reads back');
      assert.deepEqual({ reads: keychain.reads, writes: keychain.writes, deletes: keychain.deletes }, { reads: 3, writes: 0, deletes: 0 });
    });
  });

  it('T5 add/write, delete, and unknown command shapes are refused by throwing; completed writes/deletes stay 0', async () => {
    await withGateway(async (gateway) => {
      const { keychain, custody } = gateway.deps;
      await assert.rejects(() => custody.createStaging('never-stored'), /refused/);
      await assert.rejects(() => keychain.run(['add-generic-password', '-U', '-a', 'primary', '-s', 'any', '-w'], 'x\nx\n'), /refused/);
      await assert.rejects(() => custody.delete('staging'), /refused/);
      await assert.rejects(() => keychain.run(['unknown-verb', '-a', 'primary']), /refused/);
      await assert.rejects(() => keychain.run([]), /refused/);
      // Attempts are counted separately from completed side effects: the
      // refusals above are attempts; nothing external ever completed.
      assert.deepEqual(
        { writes: keychain.writes, deletes: keychain.deletes },
        { writes: 0, deletes: 0 },
        'no completed write or delete',
      );
      assert.deepEqual(
        { attemptedWrites: keychain.attemptedWrites, attemptedDeletes: keychain.attemptedDeletes, attemptedUnknown: keychain.attemptedUnknown },
        { attemptedWrites: 2, attemptedDeletes: 1, attemptedUnknown: 2 },
        'every refused attempt is recorded',
      );
      // Nothing was stored: a read after the refused write still finds nothing.
      assert.equal(await custody.read('staging'), null);
    });
  });

  it('T6 the injected fetchImpl is never invoked through boot() and throws network_forbidden if called', async () => {
    await withGateway(async (gateway) => {
      await gateway.boot();
      await sleep(50);
      assert.equal(gateway.deps.network.invocations(), 0, 'boot() made no control-plane request');
      assert.match(DEAD_END_CONTROL_PLANE_URL, /^http:\/\/127\.0\.0\.1(:\d+)?$/, 'dead-end loopback base URL');
      await assert.rejects(
        () => gateway.deps.network.fetchImpl(`${DEAD_END_CONTROL_PLANE_URL}/gateway/enroll`, { method: 'POST' }),
        (error: unknown) => {
          assert.ok(error instanceof NetworkForbiddenError);
          assert.equal(error.code, NETWORK_FORBIDDEN);
          assert.equal(error.message, NETWORK_FORBIDDEN);
          return true;
        },
      );
      assert.equal(gateway.deps.network.invocations(), 1, 'the attempt is counted');
      // Through the REAL client the refusal is a transport event, never a request.
      const verdict = await gateway.deps.client.challenge();
      assert.equal(verdict.transport, true);
      assert.equal(verdict.status, 0);
      assert.match(verdict.detail ?? '', /network_forbidden/);
      assert.equal(gateway.deps.network.invocations(), 2);
    });
  });

  it('T7 GatewayDaemon.start() and tick() are never invoked: the heartbeat cadence never starts', async () => {
    await withGateway(async (gateway) => {
      let starts = 0;
      let ticks = 0;
      gateway.daemon.start = () => {
        starts += 1;
        throw new Error('start() is prohibited in the acceptance Gateway');
      };
      gateway.daemon.tick = () => {
        ticks += 1;
        throw new Error('tick() is prohibited in the acceptance Gateway');
      };
      await gateway.boot();
      await sleep(1_200);
      assert.equal(starts, 0);
      assert.equal(ticks, 0);
      assert.equal(gateway.deps.network.invocations(), 0, 'no cadence, no request');
    });
    const source = runnerSource();
    assert.ok(!/\.start\(\)/.test(source), 'the runner source never calls .start()');
    assert.ok(!/\.tick\(/.test(source), 'the runner source never calls .tick(');
    assert.ok(!/\bsetInterval\([^)]*heartbeat/i.test(source), 'no heartbeat interval of its own');
  });
});

// ---------------------------------------------------------------------------
// Slice B — Room and IPC (T8–T11)
// ---------------------------------------------------------------------------

/** A minimal IPC v2 client for the proofs (the TUI has its own consumer client). */
interface V2Client {
  readonly socket: Socket;
  send(body: unknown): void;
  next(timeoutMs?: number): Promise<{ type: number; body: Record<string, unknown> }>;
}

function connectV2(socketPath: string): Promise<V2Client> {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = createConnection(socketPath);
    let buffered: Buffer = Buffer.alloc(0);
    const queue: { type: number; body: Record<string, unknown> }[] = [];
    const waiters: ((frame: { type: number; body: Record<string, unknown> }) => void)[] = [];
    socket.on('data', (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      const step = decodeV2Frames(buffered);
      buffered = step.rest;
      for (const frame of step.frames) {
        const body = JSON.parse(frame.payload.toString('utf8')) as Record<string, unknown>;
        const waiter = waiters.shift();
        if (waiter) waiter({ type: frame.type, body });
        else queue.push({ type: frame.type, body });
      }
    });
    socket.on('error', (error) => rejectPromise(error));
    socket.on('connect', () => {
      resolvePromise({
        socket,
        send: (body) => socket.write(encodeV2Frame(FRAME_TYPE_CONTROL, Buffer.from(JSON.stringify(body), 'utf8'))),
        next: (timeoutMs = 3_000) =>
          new Promise((res, rej) => {
            const queued = queue.shift();
            if (queued) return res(queued);
            const timer = setTimeout(() => rej(new Error('no v2 frame within timeout')), timeoutMs);
            waiters.push((frame) => {
              clearTimeout(timer);
              res(frame);
            });
          }),
      });
    });
  });
}

async function nextOp(client: V2Client, op: string, max = 40): Promise<Record<string, unknown>> {
  for (let i = 0; i < max; i++) {
    const frame = await client.next();
    if (frame.body['op'] === op) return frame.body;
  }
  throw new Error(`no ${op} frame within ${String(max)} frames`);
}

/** TCP listeners owned by this process, per lsof; null when lsof is unavailable (environment-gated). */
function tcpListenersOfThisProcess(): string[] | null {
  try {
    const table = execFileSync('lsof', ['-a', '-p', String(process.pid), '-iTCP', '-sTCP:LISTEN', '-n', '-P'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return table.split('\n').filter((line) => line.includes('LISTEN'));
  } catch (error) {
    // lsof exits 1 when nothing matches: that IS the "no listener" answer.
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    return null;
  }
}

describe('Slice B — Room and IPC', () => {
  it('T8 fixture-room is created and occupied with exactly slot-a and slot-b before IPC is exposed', async () => {
    await withGateway(async (gateway) => {
      assert.equal(existsSync(gateway.paths.socketPath), false, 'no socket before boot');
      const snapshot = gateway.daemon.rooms.snapshot(FIXTURE_ROOM_ID);
      assert.ok(snapshot !== null, 'the fixture room exists before boot');
      assert.equal(snapshot.occupancy, 'OCCUPIED');
      assert.deepEqual(snapshot.executions.map((execution) => execution.execution_id), [...FIXTURE_EXECUTION_IDS]);
      assert.equal(snapshot.executions.every((execution) => execution.state === 'RUNNING'), true);
      assert.deepEqual(gateway.daemon.rooms.listRooms().map((room) => room.room_id), [FIXTURE_ROOM_ID], 'exactly one room');
      assert.equal(snapshot.viewers.length, 0, 'no viewer minted by the runner');
    });
  });

  it('T9 boot() opens a UNIX-domain socket at the temporary socketPath with mode 0600 and no TCP listener exists', async (t) => {
    await withGateway(async (gateway) => {
      await gateway.boot();
      const stat = statSync(gateway.paths.socketPath);
      assert.ok(stat.isSocket(), 'a UNIX-domain socket');
      assert.equal(stat.mode & 0o777, 0o600);
      assert.deepEqual(
        readdirSync(gateway.tempRoot).filter((entry) => entry.endsWith('.sock')),
        ['ipc.sock'],
        'the daemon\'s one socket and no other endpoint',
      );
      const listeners = tcpListenersOfThisProcess();
      if (listeners === null) {
        // Environment-gated: recorded as such, never relabeled a pass.
        t.diagnostic('T9 TCP-listener inspection: NOT EXECUTED (lsof unavailable); the static proof in T17 still applies');
      } else {
        t.diagnostic(`T9 TCP-listener inspection: executed via lsof (${String(listeners.length)} listeners)`);
        assert.deepEqual(listeners, [], 'no TCP listener in this process');
      }
    });
  });

  it('T10 IPC status (v1) and rooms (v2 FollowRoom) answer over the temporary socket', async () => {
    await withGateway(async (gateway) => {
      await gateway.boot();
      const status = await ipcRequest(gateway.paths.socketPath, { op: 'status' });
      assert.equal(status.ok, true);
      if (status.ok) {
        assert.equal(status.body['ok'], true);
        assert.deepEqual(status.body['primary'], { lane: 'IDLE', epoch: false }, 'no identity, no epoch: nothing enrolled');
        assert.deepEqual(status.body['staging'], { lane: 'INACTIVE' });
      }
      const client = await connectV2(gateway.paths.socketPath);
      try {
        client.send({ op: 'Hello', ipc_version: 2 });
        const hello = await client.next();
        assert.equal(hello.body['ok'], true);
        client.send({ op: 'FollowRoom', target: 'rooms' });
        const rooms = await nextOp(client, 'FollowRoom');
        const list = rooms['rooms'] as { room_id: string; occupancy: string; executions: { execution_id: string }[] }[];
        assert.equal(list.length, 1);
        assert.equal(list[0]!.room_id, FIXTURE_ROOM_ID);
        assert.equal(list[0]!.occupancy, 'OCCUPIED');
        assert.deepEqual(list[0]!.executions.map((execution) => execution.execution_id), [...FIXTURE_EXECUTION_IDS]);
      } finally {
        client.socket.destroy();
      }
      assert.equal(gateway.deps.network.invocations(), 0, 'serving IPC made no request');
      assert.deepEqual({ writes: gateway.deps.keychain.writes, deletes: gateway.deps.keychain.deletes }, { writes: 0, deletes: 0 });
    });
  });

  it('T11 a third execution identity is refused (harness only); the room keeps exactly two', async () => {
    await withGateway(async (gateway) => {
      assert.throws(
        () => gateway.daemon.rooms.registerFixtureExecution(FIXTURE_ROOM_ID, 'slot-c'),
        (error: unknown) => {
          assert.ok(error instanceof ExecutionCardinalityError);
          assert.equal(error.code, 'stream_limit_exceeded');
          return true;
        },
      );
      assert.deepEqual(gateway.daemon.rooms.snapshot(FIXTURE_ROOM_ID)!.executions.map((execution) => execution.execution_id), [...FIXTURE_EXECUTION_IDS]);
    });
  });
});

// ---------------------------------------------------------------------------
// Slice C — fixture output (T12)
// ---------------------------------------------------------------------------

interface ObservedPatch {
  readonly execution_id: string;
  readonly pty_output_seq: number;
  readonly vt_codec_version: string;
  readonly checkpoint_or_patch: { readonly kind: string; readonly text?: string };
}

function patchesOf(frames: readonly OutFrame[]): ObservedPatch[] {
  return frames
    .filter((frame) => frame.type === FRAME_TYPE_VT_PATCH)
    .map((frame) => JSON.parse(frame.payload.toString('utf8')) as ObservedPatch);
}

describe('Slice C — fixture output', () => {
  it('T12 every 500ms interval emits exactly slot-a then slot-b fixture ticks, zero-padded to four digits, via emitFixturePatch', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    await withGateway(async (gateway) => {
      const rooms = gateway.daemon.rooms;
      // A read-only viewer observes exactly what emitFixturePatch fans out.
      const joined = rooms.joinRoom(FIXTURE_ROOM_ID, 'k-t12', undefined, 'read');
      assert.equal(joined.ok, true);
      if (!joined.ok) throw new Error('unreachable');
      const viewerId = String(joined.body['viewer_id']);
      rooms.takeOutbox(FIXTURE_ROOM_ID, viewerId); // drain the join-time frames
      const observe = (): [string, string | undefined, number][] =>
        patchesOf(rooms.takeOutbox(FIXTURE_ROOM_ID, viewerId)).map((patch) => [
          patch.execution_id,
          patch.checkpoint_or_patch.text,
          patch.pty_output_seq,
        ]);

      const errors: unknown[] = [];
      const output = beginFixtureOutput(rooms, (error) => errors.push(error));
      try {
        assert.equal(FIXTURE_INTERVAL_MS, 500);
        t.mock.timers.tick(499);
        assert.deepEqual(observe(), [], 'nothing before the interval elapses');
        t.mock.timers.tick(1);
        assert.deepEqual(observe(), [
          ['slot-a', 'slot-a fixture tick 0001', 1],
          ['slot-b', 'slot-b fixture tick 0001', 1],
        ]);
        t.mock.timers.tick(1_000);
        assert.deepEqual(observe(), [
          ['slot-a', 'slot-a fixture tick 0002', 2],
          ['slot-b', 'slot-b fixture tick 0002', 2],
          ['slot-a', 'slot-a fixture tick 0003', 3],
          ['slot-b', 'slot-b fixture tick 0003', 3],
        ]);
        assert.equal(output.ticks(), 3);
      } finally {
        output.halt();
      }
      t.mock.timers.tick(5_000);
      assert.deepEqual(observe(), [], 'nothing after halt');
      assert.deepEqual(errors, []);

      const snapshot = rooms.snapshot(FIXTURE_ROOM_ID)!;
      assert.deepEqual(
        snapshot.executions.map((execution) => [execution.execution_id, execution.cursors.ptyOutputSeq, execution.cursors.durableCommittedSeq]),
        [['slot-a', 3, 3], ['slot-b', 3, 3]],
        'independent per-execution cursors advanced in lockstep with the ticks',
      );
    });
    assert.equal(fixtureTickText('slot-a', 12), 'slot-a fixture tick 0012');
    assert.equal(fixtureTickText('slot-b', 1234), 'slot-b fixture tick 1234');
    const source = runnerSource();
    assert.match(source, /rooms\.emitFixturePatch\(roomId, executionId, fixtureTickText\(executionId, sequence\)\)/, 'emission goes through emitFixturePatch');
    assert.match(source, /export const FIXTURE_INTERVAL_MS = 500;/);
  });
});

// ---------------------------------------------------------------------------
// Slice D — lifecycle cleanup (T13–T16)
// ---------------------------------------------------------------------------

/** The built runner, launched exactly as `npm run phase1:fixture` launches it. */
const RUNNER_ENTRY = join(import.meta.dirname, 'support', 'phase1-acceptance-gateway.js');

/** The READY block's fixed lines (final plan §16); SOCKET/SESSION follow. */
const EXPECTED_READY_LINES = [
  'CONTROLLED FIXTURE ACCEPTANCE',
  'NOT PRODUCTION',
  'NOT LIVE OCCUPANCY',
  'NO PROVIDER EXECUTION',
  '',
  'STATUS: READY',
  'ROOM: fixture-room',
  'EXECUTION 1: slot-a',
  'EXECUTION 2: slot-b',
];

interface RunnerProcess {
  readonly child: ChildProcess;
  stdout(): string;
  stderr(): string;
  ready(timeoutMs?: number): Promise<{ socketPath: string; sessionPath: string; tempRoot: string }>;
  exit(): Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  cleanup(): void;
}

function launchRunner(env: Record<string, string> = {}): RunnerProcess {
  const child = spawn(process.execPath, [RUNNER_ENTRY], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout!.on('data', (chunk: Buffer) => {
    out += chunk.toString('utf8');
  });
  child.stderr!.on('data', (chunk: Buffer) => {
    err += chunk.toString('utf8');
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise) => {
    child.once('exit', (code, signal) => resolvePromise({ code, signal }));
  });
  return {
    child,
    stdout: () => out,
    stderr: () => err,
    async ready(timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      while (!(out.includes(READY_MARKER) && /^SESSION: .+$/m.test(out))) {
        if (child.exitCode !== null) throw new Error(`runner exited early (${String(child.exitCode)}); stderr: ${err}`);
        if (Date.now() > deadline) throw new Error(`runner never printed READY; stdout: ${out} stderr: ${err}`);
        await sleep(25);
      }
      const socketPath = /^SOCKET: (.+)$/m.exec(out)![1]!;
      const sessionPath = /^SESSION: (.+)$/m.exec(out)![1]!;
      return { socketPath, sessionPath, tempRoot: dirname(socketPath) };
    },
    exit: () => exited,
    cleanup: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    },
  };
}

async function exitWithin(runner: RunnerProcess, ms = 10_000): Promise<number | null> {
  const outcome = await Promise.race([
    runner.exit().then((result) => ({ timedOut: false as const, ...result })),
    sleep(ms).then(() => ({ timedOut: true as const, code: null, signal: null })),
  ]);
  assert.equal(outcome.timedOut, false, `the runner exited within ${String(ms)}ms rather than hanging; stderr: ${runner.stderr()}`);
  return outcome.code;
}

describe('Slice D — lifecycle cleanup', () => {
  it('T13 SIGINT stops the timer, awaits daemon.stop(), removes the session file if present and the temporary root, exits 0', async () => {
    const runner = launchRunner();
    try {
      const { socketPath, sessionPath, tempRoot } = await runner.ready();
      // The READY block is printed exactly (final plan §16), then the literal Run 02 commands.
      const lines = runner.stdout().split('\n');
      assert.deepEqual(lines.slice(0, EXPECTED_READY_LINES.length), EXPECTED_READY_LINES);
      assert.equal(lines[EXPECTED_READY_LINES.length], `SOCKET: ${socketPath}`);
      assert.equal(lines[EXPECTED_READY_LINES.length + 1], `SESSION: ${sessionPath}`);
      assert.ok(tempRoot.startsWith(tmpdir()) && basename(tempRoot).startsWith(TEMP_ROOT_PREFIX), 'a fresh acceptance root');
      assert.equal(dirname(sessionPath), tempRoot, 'the session path is under the same root');
      for (const verb of ['rooms --json', 'join --room fixture-room', 'follow --json', 'leave']) {
        assert.ok(
          runner.stdout().includes(`madv-tui ${verb} --socket ${socketPath} --session ${sessionPath}`),
          `a literal example for ${verb} with explicit --socket and --session`,
        );
      }
      assert.ok(statSync(socketPath).isSocket(), 'IPC is being served');
      assert.equal(existsSync(sessionPath), false, 'the runner never creates the session file');
      const status = await ipcRequest(socketPath, { op: 'status' });
      assert.equal(status.ok, true);

      // Two synthetic streams are flowing through the real daemon.
      await sleep(FIXTURE_INTERVAL_MS + 200);
      const client = await connectV2(socketPath);
      try {
        client.send({ op: 'Hello', ipc_version: 2 });
        await client.next();
        client.send({ op: 'FollowRoom', target: FIXTURE_ROOM_ID });
        const follow = await nextOp(client, 'FollowRoom');
        const snapshot = follow['snapshot'] as { executions: { execution_id: string; cursors: { ptyOutputSeq: number } }[] };
        assert.deepEqual(snapshot.executions.map((execution) => execution.execution_id), [...FIXTURE_EXECUTION_IDS]);
        assert.ok(snapshot.executions.every((execution) => execution.cursors.ptyOutputSeq >= 1), 'both streams have ticked');
      } finally {
        client.socket.destroy();
      }

      // The TUI's first use would create the session file; simulate that so removal is exercised.
      writeFileSync(sessionPath, '{}\n');
      runner.child.kill('SIGINT');
      assert.equal(await exitWithin(runner), 0, `clean exit; stderr: ${runner.stderr()}`);
      assert.equal(existsSync(socketPath), false, 'the socket was closed and unlinked');
      assert.equal(existsSync(sessionPath), false, 'the session file was removed');
      assert.equal(existsSync(tempRoot), false, 'the temporary root was removed');
      assert.match(runner.stderr(), /cleanup settled/);
      assert.doesNotMatch(runner.stderr(), /FAILED/);
    } finally {
      runner.cleanup();
    }
  });

  it('T14 SIGTERM behaves identically', async () => {
    const runner = launchRunner();
    try {
      const { socketPath, sessionPath, tempRoot } = await runner.ready();
      writeFileSync(sessionPath, '{}\n');
      runner.child.kill('SIGTERM');
      assert.equal(await exitWithin(runner), 0, `clean exit; stderr: ${runner.stderr()}`);
      assert.equal(existsSync(socketPath), false);
      assert.equal(existsSync(sessionPath), false);
      assert.equal(existsSync(tempRoot), false);
      assert.match(runner.stderr(), /cleanup settled/);
    } finally {
      runner.cleanup();
    }
  });

  it('T15 a second signal during cleanup triggers no second stop or removal sequence (real process)', async () => {
    const runner = launchRunner();
    try {
      const { tempRoot } = await runner.ready();
      runner.child.kill('SIGINT');
      runner.child.kill('SIGINT');
      await sleep(20);
      runner.child.kill('SIGTERM');
      assert.equal(await exitWithin(runner), 0, `clean exit; stderr: ${runner.stderr()}`);
      assert.equal(existsSync(tempRoot), false);
      assert.equal((runner.stderr().match(/cleanup settled/g) ?? []).length, 1, 'exactly one cleanup');
      assert.doesNotMatch(runner.stderr(), /cleanup failed|FAILED/);
    } finally {
      runner.cleanup();
    }
  });

  it('T15 cleanup is one idempotent function: repeated signals join the same daemon.stop() and removal (in-process)', async () => {
    const signals = new EventEmitter();
    const exits: number[] = [];
    let out = '';
    let err = '';
    const handle = runAcceptance({
      signals,
      exit: (code) => exits.push(code),
      stdout: (text) => (out += text),
      stderr: (text) => (err += text),
    });
    const gateway = await handle.ready;
    assert.ok(out.includes(READY_MARKER));
    let stops = 0;
    const originalStop = gateway.daemon.stop.bind(gateway.daemon);
    gateway.daemon.stop = async () => {
      stops += 1;
      await sleep(150); // a slow stop, so the later signals land DURING cleanup
      await originalStop();
    };
    signals.emit('SIGINT');
    signals.emit('SIGINT');
    await sleep(20);
    signals.emit('SIGTERM');
    const code = await handle.done;
    assert.equal(code, 0);
    assert.deepEqual(exits, [0], 'exit reached exactly once, after cleanup');
    assert.equal(stops, 1, 'daemon.stop() ran exactly once');
    assert.equal(handle.cleanupRuns(), 1, 'the one cleanup body ran exactly once');
    assert.equal(existsSync(gateway.tempRoot), false);
    assert.equal(signals.listenerCount('SIGINT') + signals.listenerCount('SIGTERM'), 0, 'signal listeners released');
    // The output timer stopped: the fixture cursors are frozen after cleanup.
    const before = gateway.daemon.rooms.snapshot(FIXTURE_ROOM_ID)!.executions.map((execution) => execution.cursors.ptyOutputSeq);
    await sleep(FIXTURE_INTERVAL_MS * 2 + 100);
    const after = gateway.daemon.rooms.snapshot(FIXTURE_ROOM_ID)!.executions.map((execution) => execution.cursors.ptyOutputSeq);
    assert.deepEqual(after, before, 'no tick after the timer stopped');
    assert.match(err, /cleanup settled/);
  });

  it('T16 a failure before READY takes the same cleanup path, prints the FAILED marker, and exits non-zero (real process, no seam)', async () => {
    // A temporary directory that does not exist makes mkdtemp fail — a real
    // startup failure, provoked from outside the runner.
    const runner = launchRunner({ TMPDIR: join(tmpdir(), `ae01-absent-${randomUUID()}`) });
    try {
      const code = await exitWithin(runner);
      assert.notEqual(code, 0, 'non-zero exit');
      assert.equal(code, 1);
      assert.ok(!runner.stdout().includes(READY_MARKER), 'READY is never printed on failure');
      assert.ok(runner.stderr().includes(FAILED_MARKER), `the FAILED marker is printed; stderr: ${runner.stderr()}`);
      assert.match(runner.stderr(), /reason: .*ENOENT/);
      assert.match(runner.stderr(), /cleanup settled/);
    } finally {
      runner.cleanup();
    }
  });

  it('T16 a failure after boot() still awaits daemon.stop() before exit and removes everything (in-process ordering)', async () => {
    const gateway = await createAcceptanceGateway();
    // An occupied session path is a startup failure: the runner never clobbers a file it did not reserve.
    writeFileSync(gateway.sessionPath, 'occupied\n');
    let stopSettled = false;
    const originalStop = gateway.daemon.stop.bind(gateway.daemon);
    gateway.daemon.stop = async () => {
      await sleep(100);
      await originalStop();
      stopSettled = true;
    };
    const exits: { code: number; stopSettled: boolean }[] = [];
    let out = '';
    let err = '';
    const handle = runAcceptance({
      gateway,
      signals: new EventEmitter(),
      exit: (code) => exits.push({ code, stopSettled }),
      stdout: (text) => (out += text),
      stderr: (text) => (err += text),
    });
    await assert.rejects(handle.ready, /session path already exists/);
    const code = await handle.done;
    assert.equal(code, 1);
    assert.deepEqual(exits, [{ code: 1, stopSettled: true }], 'exit is reached only after daemon.stop() settled');
    assert.ok(!out.includes(READY_MARKER));
    assert.ok(err.includes(FAILED_MARKER));
    assert.match(err, /session path already exists/);
    assert.equal(handle.cleanupRuns(), 1);
    assert.equal(existsSync(gateway.paths.socketPath), false, 'the socket was unlinked by daemon.stop()');
    assert.equal(existsSync(gateway.tempRoot), false, 'the temporary root was removed');
  });
});

// ---------------------------------------------------------------------------
// Slice E — prohibited mechanisms and existing regressions (T17–T18)
// ---------------------------------------------------------------------------

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function sha256Of(relativePath: string): string {
  return createHash('sha256').update(readFileSync(join(REPO_ROOT, relativePath))).digest('hex');
}

/**
 * Pinned at the AE-01 A2 execution base (bb4d77e2bb2f5b50aed402e5d0dc1e1b2bbe4104).
 * The acceptance enablement adds no dependency and edits no existing Phase 1
 * suite; a later, separately authorized change to any of these updates its pin
 * deliberately in the same change.
 */
const REGRESSION_PINS: Record<string, string> = {
  'package-lock.json': '82a2ff7c9bb9430571fcb0180ea9cb270d30c098a020b97e45827a53169c2c38',
  'test/room-runtime-phase1-ipc.test.ts': '33ce996e00f098dd4fc0802624f973498b0562639d5230ad4851ae2fe2663c42',
  'test/room-runtime-phase1-runtime.test.ts': 'b93f375be4eb30d8735008eae86c18d4573d8e15c0067e36d9091784a82e087c',
  'test/room-runtime-phase1-protocol.test.ts': '6a0ec8d4bc1fd25330ce7e5bfe242f3d1b8951891cd484b485f5358e044f3c7b',
  'test/room-runtime-phase1-c2.storage.test.ts': '37d70e85c6ad61bcfa821b4f921e21243fc348e37aef5bce49645e40579a42a0',
};

const BASELINE_DEV_DEPENDENCIES = ['@types/express', '@types/node', '@types/pg', 'eslint', 'typescript', 'typescript-eslint'];
const PHASE1_FIXTURE_SCRIPT = 'npm run build && node dist/test/support/phase1-acceptance-gateway.js';

describe('Slice E — prohibited mechanisms and existing regressions', () => {
  it('T17 the runner source references no MADV_SOCKET_PATH, broker.sock, TCP listener, or plaintext custody fallback', () => {
    const source = runnerSource();
    for (const token of [
      'MADV_SOCKET_PATH',
      'broker.sock',
      'node:net',
      'node:http',
      'createServer',
      '.listen(',
      'process.env',
      'SecurityCommandRunner',
      '/usr/bin/security',
      'FileKeychainRunner',
      'fake-keychain',
      'KEYCHAIN_SERVICE',
      'writeFile',
      'appendFile',
      'readFile',
      'process.exit(',
    ]) {
      assert.ok(!source.includes(token), `runner source must not contain ${JSON.stringify(token)}`);
    }
    // Every import is a Node builtin or the existing gateway-daemon module, consumed read-only.
    const specifiers = [...source.matchAll(/^import[^;]*?from '([^']+)';/gms)].map((match) => match[1]!);
    assert.ok(specifiers.length > 0);
    for (const specifier of specifiers) {
      assert.ok(
        specifier.startsWith('node:') || specifier === '../../packages/gateway-daemon/src/index.js',
        `unexpected import ${specifier}`,
      );
    }
    // The one socket is the daemon's own, under the temporary root, opened by boot(); custody is exactly one Custody over one AcceptanceKeychainRunner.
    assert.match(source, /paths: gatewayPaths\(tempRoot\)/);
    assert.equal((source.match(/new Custody\(/g) ?? []).length, 1);
    assert.equal((source.match(/new ControlPlaneClient\(/g) ?? []).length, 1);
    assert.match(source, /new ControlPlaneClient\(DEAD_END_CONTROL_PLANE_URL, network\.fetchImpl\)/);
  });

  it('T18 existing Phase 1 suites and package-lock.json are unchanged; the only manifest change is the phase1:fixture script', () => {
    for (const [relativePath, expected] of Object.entries(REGRESSION_PINS)) {
      assert.equal(sha256Of(relativePath), expected, `${relativePath} is unchanged from the execution base`);
    }
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    assert.equal(manifest.scripts['phase1:fixture'], PHASE1_FIXTURE_SCRIPT);
    assert.equal(manifest.dependencies, undefined, 'no runtime dependency was added');
    assert.deepEqual(Object.keys(manifest.devDependencies).sort(), BASELINE_DEV_DEPENDENCIES, 'no dev dependency was added');
  });
});
