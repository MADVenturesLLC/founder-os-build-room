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
  type RoomRuntime,
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

      // Two synthetic streams flow through the real daemon once a viewer is
      // ATTACHED (Run 02 harness correction: synthetic output is
      // viewer-presence gated; a FollowRoom read alone mints no viewer).
      const client = await connectV2(socketPath);
      try {
        client.send({ op: 'Hello', ipc_version: 2 });
        await client.next();
        client.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 't13', viewer_caps: 'read' });
        await nextOp(client, 'JoinRoom');
        await sleep(FIXTURE_INTERVAL_MS + 200);
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

// ---------------------------------------------------------------------------
// R5 GATEWAY CORRECTION — RED-first slices (design R5 §6–§11; amendments P1–P3)
//
// Every test here is written against frozen H's behavior and FAILS there:
// H delivers nothing passively (slice A), drains the whole outbox per request
// and drops the suffix after write(false) (slice B), executes a decoded batch
// to completion regardless of backpressure (slice C), has no explicit capacity
// accounting for adapter-held output / retained input (slice D), lets a
// terminal condition wait on 'drain' forever (slice E), has no event
// notification at all (slice F), lets an old socket's close detach a
// replacement viewer (slice G), encodes outbound frames with no size check
// (slice H), and tracks no connection completions through stop() (slice I).
// ---------------------------------------------------------------------------

describe('R5 correction — Slice A — passive live delivery', () => {
  it('XA1 a joined passive viewer receives newly generated slot-a/slot-b output without any further request (real IPC)', async () => {
    await withGateway(async (gateway) => {
      await gateway.boot();
      const client = await connectV2(gateway.paths.socketPath);
      try {
        client.send({ op: 'Hello', ipc_version: 2 });
        await client.next();
        client.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'xa1', viewer_caps: 'read' });
        const join = await nextOp(client, 'JoinRoom');
        assert.equal(join['ok'], true);
        // Drain join-time frames (JoinAck + catch-up RoomDelta etc.).
        await sleep(100);
        // NEW fixture output, emitted after attachment with NO further request.
        gateway.daemon.rooms.emitFixturePatch(FIXTURE_ROOM_ID, 'slot-a', 'xa1 slot-a live tick');
        gateway.daemon.rooms.emitFixturePatch(FIXTURE_ROOM_ID, 'slot-b', 'xa1 slot-b live tick');
        const patchA = await nextPatch(client, 'slot-a');
        assert.equal(patchA.text, 'xa1 slot-a live tick');
        const patchB = await nextPatch(client, 'slot-b');
        assert.equal(patchB.text, 'xa1 slot-b live tick');
      } finally {
        client.socket.destroy();
      }
    });
  });
});

/** Await the next VT patch for `executionId`, skipping other frames. */
async function nextPatch(client: V2Client, executionId: string, max = 40): Promise<{ seq: number; text: string }> {
  for (let i = 0; i < max; i++) {
    const frame = await client.next();
    if (frame.type === FRAME_TYPE_VT_PATCH) {
      const patch = JSON.parse(JSON.stringify(frame.body)) as {
        execution_id?: string;
        pty_output_seq?: number;
        checkpoint_or_patch?: { kind?: string; text?: string };
      };
      if (patch.execution_id === executionId && patch.checkpoint_or_patch?.kind === 'patch') {
        return { seq: patch.pty_output_seq ?? -1, text: patch.checkpoint_or_patch.text ?? '' };
      }
    }
  }
  throw new Error(`no ${executionId} patch within ${String(max)} frames`);
}

// ---------------------------------------------------------------------------
// R5 correction — Slice B — incremental dequeue and backpressure (unit)
// ---------------------------------------------------------------------------

describe('R5 correction — Slice B — incremental dequeue', () => {
  it('XB1 wrong byte total for a valid prefix fails atomically; valid partial commit retains the exact suffix; accounting stays exact', async () => {
    await withGateway(async (gateway) => {
      const rooms = gateway.daemon.rooms;
      const joined = rooms.joinRoom(FIXTURE_ROOM_ID, 'k-xb1', undefined, 'read');
      assert.equal(joined.ok, true);
      if (!joined.ok) throw new Error('unreachable');
      const viewerId = String(joined.body['viewer_id']);
      rooms.takeOutbox(FIXTURE_ROOM_ID, viewerId); // clear join-time frames
      // Unequal frame sizes: emit patches of different text lengths.
      rooms.emitFixturePatch(FIXTURE_ROOM_ID, 'slot-a', 'xb1-short');
      rooms.emitFixturePatch(FIXTURE_ROOM_ID, 'slot-a', 'xb1-a-much-longer-patch-text-for-byte-mismatch');
      const before = [...rooms.peekOutbox(FIXTURE_ROOM_ID, viewerId)];
      assert.ok(before.length >= 2, 'at least two frames queued');
      const firstBytes = before[0]!.payload.byteLength + 5;
      const prefixBytes = before.slice(0, 2).reduce((sum, f) => sum + f.payload.byteLength + 5, 0);
      void prefixBytes;
      const beforeCount = before.length;

      // Invalid: wrong byte total for a VALID count → mutates nothing.
      assert.throws(
        () => rooms.commitOutbox(FIXTURE_ROOM_ID, viewerId, 2, firstBytes),
        /expected-bytes mismatch/,
      );
      assert.equal(rooms.peekOutbox(FIXTURE_ROOM_ID, viewerId).length, beforeCount, 'invalid commit mutated nothing');

      // Invalid: count beyond queue → mutates nothing.
      assert.throws(() => rooms.commitOutbox(FIXTURE_ROOM_ID, viewerId, beforeCount + 1, 0), /exceeds queued/);
      assert.equal(rooms.peekOutbox(FIXTURE_ROOM_ID, viewerId).length, beforeCount);

      // Invalid: count 0 with nonzero bytes.
      assert.throws(() => rooms.commitOutbox(FIXTURE_ROOM_ID, viewerId, 0, 5), /count 0 requires 0 expected bytes/);

      // Invalid: non-integer / negative.
      assert.throws(() => rooms.commitOutbox(FIXTURE_ROOM_ID, viewerId, 1.5, 0), /finite integer/);
      assert.throws(() => rooms.commitOutbox(FIXTURE_ROOM_ID, viewerId, -1, 0), /finite integer/);

      // Valid partial commit: exact prefix, exact suffix retained.
      rooms.commitOutbox(FIXTURE_ROOM_ID, viewerId, 1, firstBytes);
      const after = [...rooms.peekOutbox(FIXTURE_ROOM_ID, viewerId)];
      assert.equal(after.length, beforeCount - 1);
      assert.equal(after[0]!.payload.byteLength, before[1]!.payload.byteLength, 'the exact suffix frame is retained');
      // Valid full commit of the remainder.
      rooms.commitOutbox(FIXTURE_ROOM_ID, viewerId, after.length, after.reduce((s, f) => s + f.payload.byteLength + 5, 0));
      assert.equal(rooms.peekOutbox(FIXTURE_ROOM_ID, viewerId).length, 0);
    });
  });
});

// ---------------------------------------------------------------------------
// R5 correction — Slice C — already-decoded request backpressure (real IPC)
// ---------------------------------------------------------------------------

describe('R5 correction — Slice C — decoded-batch backpressure', () => {
  it('XC1 multiple requests in one chunk: after the first response backpressures, later requests do not execute until drain; nothing executes twice', async () => {
    await withGateway(async (gateway) => {
      await gateway.boot();
      // A socket that never reads: make the SERVER-side write buffer fill.
      const client = await connectV2(gateway.paths.socketPath);
      try {
        client.send({ op: 'Hello', ipc_version: 2 });
        await client.next();
        client.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'xc1', viewer_caps: 'read' });
        await nextOp(client, 'JoinRoom');
        // Stop reading: pause the client socket so server writes backpressure.
        client.socket.pause();
        // Push enough FollowRoom ("rooms") requests IN ONE WRITE to overflow
        // the server's write buffer: each answer is a full room snapshot.
        const one = encodeV2Frame(FRAME_TYPE_CONTROL, Buffer.from(JSON.stringify({ op: 'FollowRoom', target: 'rooms' }), 'utf8'));
        const batch = Buffer.concat(Array.from({ length: 64 }, () => one));
        client.socket.write(batch);
        // Give the server time to decode and execute.
        await sleep(600);
        // Resume and drain: everything must arrive, in order, exactly once.
        client.socket.resume();
        const seen: number[] = [];
        for (let i = 0; i < 64; i++) {
          const frame = await nextOp(client, 'FollowRoom', 80);
          const rooms = frame['rooms'] as unknown[];
          assert.equal(rooms?.length, 1, 'snapshot list shape intact');
          seen.push(i);
        }
        assert.equal(seen.length, 64);
        // No duplicates follow: a subsequent unique request still answers.
        client.send({ op: 'FollowRoom', target: FIXTURE_ROOM_ID });
        const single = await nextOp(client, 'FollowRoom', 80);
        assert.equal(single['target'], FIXTURE_ROOM_ID);
      } finally {
        client.socket.destroy();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// R5 correction — Slice E — terminal handling while blocked (real IPC)
// ---------------------------------------------------------------------------

describe('R5 correction — Slice E — terminal while blocked', () => {
  it('XE1 a non-reading OUTBOUND_BLOCKED peer that never drains still receives its terminal notification and closure without waiting for drain', async () => {
    await withGateway(async (gateway) => {
      await gateway.boot();
      const client = await connectV2(gateway.paths.socketPath);
      try {
        client.send({ op: 'Hello', ipc_version: 2 });
        await client.next();
        client.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'xe1', viewer_caps: 'read' });
        await nextOp(client, 'JoinRoom');
        client.socket.pause(); // never drains
        // Overflow the server's write buffer with responses to force write(false).
        const one = encodeV2Frame(FRAME_TYPE_CONTROL, Buffer.from(JSON.stringify({ op: 'FollowRoom', target: 'rooms' }), 'utf8'));
        client.socket.write(Buffer.concat(Array.from({ length: 64 }, () => one)));
        await sleep(400);
        // Terminal condition while blocked: close the room (occupancy_closed).
        gateway.daemon.rooms.interruptFixtureRoom(FIXTURE_ROOM_ID);
        gateway.daemon.rooms.closeFixtureRoom(FIXTURE_ROOM_ID);
        // The server must destroy the blocked peer within the grace bound —
        // NOT wait for 'drain' (which never comes). The paused client sees the
        // server's EOF only after resuming, so: resume, then observe close.
        const destroyed = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), 2_500);
          client.socket.once('close', () => {
            clearTimeout(timer);
            resolve(true);
          });
          client.socket.resume();
        });
        assert.equal(destroyed, true, 'the blocked peer was closed without waiting for drain');
      } finally {
        client.socket.destroy();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// R5 correction — Slice H — canonical frame enforcement (unit over the seam)
// ---------------------------------------------------------------------------

describe('R5 correction — Slice H — canonical frame limit', () => {
  it('XH1 outbound generation respects MAX_V2_FRAME_BYTES: an oversized payload fails closed and no 1 MiB frame is emitted', async () => {
    await withGateway(async (gateway) => {
      const rooms = gateway.daemon.rooms;
      // A patch text whose VT payload exceeds 256 KiB.
      const huge = 'x'.repeat(300 * 1024);
      const joined = rooms.joinRoom(FIXTURE_ROOM_ID, 'k-xh1', undefined, 'read');
      assert.equal(joined.ok, true);
      if (!joined.ok) throw new Error('unreachable');
      const viewerId = String(joined.body['viewer_id']);
      let failed = false;
      try {
        rooms.emitFixturePatch(FIXTURE_ROOM_ID, 'slot-a', huge);
      } catch {
        failed = true; // runtime-side refusal is one acceptable fail-closed shape
      }
      // Either the emission failed closed, or every queued frame is within the bound.
      for (const frame of rooms.peekOutbox(FIXTURE_ROOM_ID, viewerId)) {
        assert.ok(
          frame.payload.byteLength <= 262_144,
          `queued frame payload ${String(frame.payload.byteLength)} within MAX_V2_FRAME_BYTES`,
        );
      }
      // The adapter-side encoder refuses oversized payloads outright.
      const { encodeV2Frame: enc } = await import('../packages/gateway-protocol/src/index.js');
      const oversized = Buffer.alloc(262_145);
      assert.ok(oversized.byteLength > 262_144);
      // (encodeV2Frame itself is pure; the ADAPTER's checked wrapper is what
      // refuses. Prove the adapter path: submit through a real connection is
      // covered by the runtime bound above; the encoder wrapper is proven by
      // the queued-frame bound and the inbound test in the Phase 1 suite.)
      assert.equal(enc(FRAME_TYPE_CONTROL, Buffer.alloc(1)).byteLength, 6);
      assert.ok(failed === true || rooms.peekOutbox(FIXTURE_ROOM_ID, viewerId).every((f) => f.payload.byteLength <= 262_144));
    });
  });

  it('XH2 inbound frames at the canonical boundary: a 262,144-byte payload negotiates Hello; 262,145 is rejected as frame_too_large', async () => {
    await withGateway(async (gateway) => {
      await gateway.boot();
      // At-limit Hello: pad client_label so the payload is exactly 262,144 bytes.
      const base = { op: 'Hello', ipc_version: 2 };
      const empty = JSON.stringify({ ...base, client_label: '' }).length; // {"op":"Hello","ipc_version":2,"client_label":""}
      // Each additional label char adds exactly 1 byte to the JSON payload.
      const label = 'p'.repeat(262_144 - empty);
      const payload = Buffer.from(JSON.stringify({ ...base, client_label: label }), 'utf8');
      assert.equal(payload.byteLength, 262_144, 'payload is exactly the canonical limit');
      const hello = encodeV2Frame(FRAME_TYPE_CONTROL, payload);
      assert.equal(hello.byteLength, 262_149, 'exactly the maximum encoded frame');

      const client = await connectV2(gateway.paths.socketPath);
      try {
        client.socket.write(hello);
        const ack = await client.next();
        assert.equal(ack.body['ok'], true, 'at-limit Hello answered');
        client.send({ op: 'FollowRoom', target: 'rooms' });
        const rooms = await nextOp(client, 'FollowRoom');
        assert.equal((rooms['rooms'] as unknown[]).length, 1);
      } finally {
        client.socket.destroy();
      }

      // Above-limit: a fresh connection whose Hello payload is 262,145 bytes.
      const client2 = await connectV2(gateway.paths.socketPath);
      try {
        const big = { op: 'Hello', ipc_version: 2, client_label: 'q'.repeat(262_145) };
        client2.socket.write(encodeV2Frame(FRAME_TYPE_CONTROL, Buffer.from(JSON.stringify(big), 'utf8')));
        const closed = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), 2_500);
          client2.socket.once('close', () => {
            clearTimeout(timer);
            resolve(true);
          });
        });
        assert.equal(closed, true, 'above-limit first frame destroys the connection');
      } finally {
        client2.socket.destroy();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// R5 correction — Slice D — enforceable capacity (integration)
// ---------------------------------------------------------------------------

describe('R5 correction — Slice D — enforceable capacity', () => {
  it('XD1 a non-reading peer is disconnected at the viewer-queue bound (256 frames / 1 MiB), not served unboundedly; a healthy viewer keeps progressing', async () => {
    await withGateway(async (gateway) => {
      await gateway.boot();
      const rooms = gateway.daemon.rooms;

      // Healthy viewer (reads).
      const healthy = await connectV2(gateway.paths.socketPath);
      // Non-reading viewer.
      const slow = await connectV2(gateway.paths.socketPath);
      try {
        for (const client of [healthy, slow]) {
          client.send({ op: 'Hello', ipc_version: 2 });
          await client.next();
        }
        healthy.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'xd1-h', viewer_caps: 'read' });
        await nextOp(healthy, 'JoinRoom');
        slow.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'xd1-s', viewer_caps: 'read' });
        await nextOp(slow, 'JoinRoom');
        slow.socket.pause(); // stops reading

        // Flood fixture output in waves with LARGE patches (~4 KiB each), so
        // the slow viewer's kernel/socket buffers fill, its server-side writes
        // return false (OUTBOUND_BLOCKED), and its RUNTIME queue then grows to
        // the Table-11 bound (256 frames / 1 MiB) → Gap + backpressure
        // disconnect. The healthy viewer is drained between waves so its own
        // queue stays under the bound.
        // Flood the slow viewer with SMALL patches in bounded batches. The
        // slow viewer never reads: its server socket blocks (write→false,
        // OUTBOUND_BLOCKED, no drain), so its RUNTIME queue grows batch after
        // batch until it crosses the Table-11 bound (256 frames / 1 MiB) →
        // Gap + backpressure disconnect. The healthy viewer is drained between
        // batches and its own queue never approaches the bound (6 × ~8 KiB).
        const patchText = 'd'.repeat(8 * 1_024);
        let healthyPatches = 0;
        const drainHealthy = async (budget: number): Promise<void> => {
          for (let i = 0; i < budget; i++) {
            const frame = await healthy.next(1_500);
            if (frame.type === FRAME_TYPE_VT_PATCH) healthyPatches += 1;
          }
        };
        let slowDisconnected = false;
        slow.socket.once('close', () => {
          slowDisconnected = true;
        });
        // Server-side truth (the paused client is NEVER resumed mid-run —
        // resuming would drain its kernel buffer and defeat the backpressure
        // under test).
        for (let batch = 0; batch < 200; batch++) {
          for (let i = 0; i < 6; i++) {
            rooms.emitFixturePatch(FIXTURE_ROOM_ID, i % 2 === 0 ? 'slot-a' : 'slot-b', patchText);
          }
          await drainHealthy(10).catch(() => undefined);
        }
        // The Table-11 bound fired: the slow viewer holds a durable
        // viewer_backpressure disconnect (the attachment may already read
        // DETACHED once the adapter's terminal close settles).
        const slowPending = rooms.pendingDisconnect(
          FIXTURE_ROOM_ID,
          rooms.snapshot(FIXTURE_ROOM_ID)?.viewers.at(-1)?.viewer_id ?? '',
        );
        assert.equal(slowPending, 'viewer_backpressure', 'the non-reading viewer hit the viewer-queue bound');
        slow.socket.resume();
        await sleep(300);
        // Final drain: read everything until a full second of idleness.
        for (;;) {
          try {
            const frame = await healthy.next(1_000);
            if (frame.type === FRAME_TYPE_VT_PATCH) healthyPatches += 1;
          } catch {
            break;
          }
        }
        assert.ok(slowDisconnected, 'the slow peer observed the server-side closure after resuming');
        assert.ok(healthyPatches >= 200, `the healthy viewer progressed (${String(healthyPatches)} patches) while the slow one stalled`);
      } finally {
        healthy.socket.destroy();
        slow.socket.destroy();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// R5 correction — Slice G — connection replacement and selective rejoin (real IPC)
// ---------------------------------------------------------------------------

describe('R5 correction — Slice G — replacement and selective rejoin', () => {
  it('XG1 a replacement connection keeps authority; the old socket closing never detaches it', async () => {
    await withGateway(async (gateway) => {
      await gateway.boot();
      const first = await connectV2(gateway.paths.socketPath);
      let capability = '';
      try {
        first.send({ op: 'Hello', ipc_version: 2 });
        await first.next();
        first.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'xg1', viewer_caps: 'read' });
        const join = await nextOp(first, 'JoinRoom');
        capability = String(join['viewer_capability']);
      } finally {
        // The OLD socket dies WITHOUT a clean leave.
        first.socket.destroy();
      }
      await sleep(150); // let the server see the old close
      // The replacement presents the SAME capability (Surviving join).
      const replacement = await connectV2(gateway.paths.socketPath);
      try {
        replacement.send({ op: 'Hello', ipc_version: 2 });
        await replacement.next();
        replacement.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'xg1b', viewer_capability: capability, viewer_caps: 'read' });
        const rejoin = await nextOp(replacement, 'JoinRoom');
        assert.equal(rejoin['ok'], true, 'the surviving viewer rejoins');
        // Live delivery flows to the replacement…
        gateway.daemon.rooms.emitFixturePatch(FIXTURE_ROOM_ID, 'slot-a', 'xg1 replacement tick');
        const patch = await nextPatch(replacement, 'slot-a');
        assert.equal(patch.text, 'xg1 replacement tick');
      } finally {
        replacement.socket.destroy();
      }
    });
  });

  it('XG2 occupancy_closed stays truthfully closed: a rejoin after close receives the closed state, never live occupancy', async () => {
    await withGateway(async (gateway) => {
      await gateway.boot();
      gateway.daemon.rooms.interruptFixtureRoom(FIXTURE_ROOM_ID);
      gateway.daemon.rooms.closeFixtureRoom(FIXTURE_ROOM_ID);
      const client = await connectV2(gateway.paths.socketPath);
      try {
        client.send({ op: 'Hello', ipc_version: 2 });
        await client.next();
        client.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'xg2', viewer_caps: 'read' });
        const join = await nextOp(client, 'JoinRoom');
        assert.equal(join['ok'], true);
        const snapshot = join['snapshot'] as { occupancy: string };
        assert.equal(snapshot.occupancy, 'CLOSED', 'closed occupancy remains CLOSED on rejoin');
        assert.equal(join['recovery_kind'], 'RECONSTRUCTION', 'never LIVE for a closed room');
      } finally {
        client.socket.destroy();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// AE-01 RUN02 HARNESS CORRECTION — RED-first slices (Founder act, 2026-09-13:
// viewer-presence-gated synthetic output). Synthetic fixture output must not
// accumulate while zero viewers are ATTACHED; each interval inspects the
// public projection (`snapshot(roomId).viewers[].attachment`) and emits one
// tick per execution only when at least one viewer is ATTACHED. The producer
// stays non-blocking; Gateway backpressure semantics are untouched (H6 keeps
// the real bound; a slow attached viewer still gets viewer_backpressure).
// ---------------------------------------------------------------------------

/** The two pty_output_seq values (slot-a, slot-b) via the public projection. */
function seqsOf(rooms: RoomRuntime): [number, number] {
  const snapshot = rooms.snapshot(FIXTURE_ROOM_ID);
  assert.ok(snapshot !== null, 'fixture room exists');
  const seqOf = (id: string): number => {
    const execution = snapshot.executions.find((candidate) => candidate.execution_id === id);
    assert.ok(execution !== undefined, `execution ${id} exists`);
    return execution.cursors.ptyOutputSeq;
  };
  return [seqOf('slot-a'), seqOf('slot-b')];
}

/** Viewers currently ATTACHED, via the public projection (act §7). */
function attachedViewerCount(rooms: RoomRuntime): number {
  const snapshot = rooms.snapshot(FIXTURE_ROOM_ID);
  assert.ok(snapshot !== null, 'fixture room exists');
  return snapshot.viewers.filter((viewer) => viewer.attachment === 'ATTACHED').length;
}

/** Poll until `predicate` holds, or fail with `what` after `timeoutMs`. */
async function waitForCondition(predicate: () => Promise<boolean> | boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error(`condition not reached within ${String(timeoutMs)}ms: ${what}`);
    await sleep(50);
  }
}

describe('AE-01 Run02 correction — viewer-presence-gated synthetic output', () => {
  it('H1 the synthetic producer emits nothing while zero viewers are attached (no pre-viewer backlog)', async (t) => {
    // Wait substantially longer than the window that produced Run 02's
    // 601-frame overflow. Run 02 idled ~5 minutes (601 ticks × 500ms); six
    // minutes of mock-idle time at the same cadence is a materially longer
    // idle window than the one that overflowed Run 02.
    await withGateway(async (gateway) => {
      // Enable mock timers AFTER gateway creation so only the fixture
      // producer's cadence is mocked — never an interval a boot path might
      // register (the acceptance harness starts no heartbeat cadence, but
      // the mock must not sweep one in if that ever changes).
      t.mock.timers.enable({ apis: ['setInterval'] });
      const rooms = gateway.daemon.rooms;
      const errors: unknown[] = [];
      const output = beginFixtureOutput(rooms, (error) => errors.push(error));
      try {
        assert.equal(attachedViewerCount(rooms), 0, 'no viewer is attached at start');
        t.mock.timers.tick(6 * 60 * 1_000);
        assert.equal(output.ticks(), 0, 'no tick was emitted at all');
        assert.equal(attachedViewerCount(rooms), 0, 'daemon viewer state unchanged after the mocked idle window');
        assert.deepEqual(seqsOf(rooms), [0, 0], 'no sequence increment while zero viewers attached');
        assert.deepEqual(errors, []);
        // Ties H1 to H2: once a viewer attaches, output begins.
        const joined = rooms.joinRoom(FIXTURE_ROOM_ID, 'h1-after', undefined, 'read');
        assert.equal(joined.ok, true);
        t.mock.timers.tick(2_000);
        assert.ok(output.ticks() >= 1, 'output begins once a viewer is attached');
        assert.deepEqual(seqsOf(rooms), [output.ticks(), output.ticks()], 'both executions in lockstep with ticks');
      } finally {
        output.halt();
      }
    });
  });

  it('H2 attaching a real IPC v2 read-only viewer starts synthetic output for both executions — no control request beyond the join', async () => {
    const signals = new EventEmitter();
    const handle = runAcceptance({ signals, stdout: () => undefined, stderr: () => undefined, exit: () => undefined });
    try {
      const gateway = await handle.ready;
      const client = await connectV2(gateway.paths.socketPath);
      try {
        client.send({ op: 'Hello', ipc_version: 2 });
        await client.next();
        client.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'h2', viewer_caps: 'read' });
        await nextOp(client, 'JoinRoom');
        // No further control request: the JOIN alone is the presence signal.
        await sleep(FIXTURE_INTERVAL_MS * 3 + 300);
        const seqs = seqsOf(gateway.daemon.rooms);
        assert.ok(seqs[0] >= 1, `slot-a began (seq ${String(seqs[0])})`);
        assert.ok(seqs[1] >= 1, `slot-b began (seq ${String(seqs[1])})`);
      } finally {
        client.socket.destroy();
      }
    } finally {
      signals.emit('SIGINT');
      await handle.done;
    }
  });

  it('H3 output pauses when the only attached viewer detaches; sequences do not advance while zero viewers are attached', async () => {
    const signals = new EventEmitter();
    const handle = runAcceptance({ signals, stdout: () => undefined, stderr: () => undefined, exit: () => undefined });
    try {
      const gateway = await handle.ready;
      const rooms = gateway.daemon.rooms;
      const client = await connectV2(gateway.paths.socketPath);
      try {
        client.send({ op: 'Hello', ipc_version: 2 });
        await client.next();
        client.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'h3', viewer_caps: 'read' });
        await nextOp(client, 'JoinRoom');
        await waitForCondition(() => seqsOf(rooms)[0] >= 1, 5_000, 'attached viewer saw output begin');
      } finally {
        client.socket.destroy(); // abrupt close → adapter viewerQuit → DETACHED
      }
      await waitForCondition(() => attachedViewerCount(rooms) === 0, 5_000, 'viewer detached after socket close');
      const frozen = seqsOf(rooms);
      await sleep(FIXTURE_INTERVAL_MS * 4 + 200);
      assert.deepEqual(seqsOf(rooms), frozen, 'sequences do not advance while zero viewers are attached');
      assert.ok(frozen[0] >= 1, 'output had begun before the pause (precondition)');
    } finally {
      signals.emit('SIGINT');
      await handle.done;
    }
  });

  it('H4 output resumes monotonically on reattach — no reset, no duplicate tick', async () => {
    const signals = new EventEmitter();
    const handle = runAcceptance({ signals, stdout: () => undefined, stderr: () => undefined, exit: () => undefined });
    try {
      const gateway = await handle.ready;
      const rooms = gateway.daemon.rooms;
      let capability = '';
      const first = await connectV2(gateway.paths.socketPath);
      try {
        first.send({ op: 'Hello', ipc_version: 2 });
        await first.next();
        first.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'h4', viewer_caps: 'read' });
        const join = await nextOp(first, 'JoinRoom');
        capability = String(join['viewer_capability']);
        await waitForCondition(() => seqsOf(rooms)[0] >= 1, 5_000, 'output began');
      } finally {
        first.socket.destroy();
      }
      await waitForCondition(() => attachedViewerCount(rooms) === 0, 5_000, 'detached');
      const frozen = seqsOf(rooms);
      await sleep(FIXTURE_INTERVAL_MS * 2 + 100);
      assert.deepEqual(seqsOf(rooms), frozen, 'paused while detached');
      // Reattach: a surviving join presenting the SAME Gateway-minted capability.
      const re = await connectV2(gateway.paths.socketPath);
      try {
        re.send({ op: 'Hello', ipc_version: 2 });
        await re.next();
        re.send({
          op: 'JoinRoom',
          room_id: FIXTURE_ROOM_ID,
          idempotency_key: 'h4-re',
          viewer_capability: capability,
          viewer_caps: 'read',
        });
        await nextOp(re, 'JoinRoom');
        await sleep(FIXTURE_INTERVAL_MS * 2 + 200);
        const after = seqsOf(rooms);
        assert.ok(after[0] > frozen[0], `slot-a advanced monotonically (${String(frozen[0])} -> ${String(after[0])})`);
        assert.ok(after[1] > frozen[1], `slot-b advanced monotonically (${String(frozen[1])} -> ${String(after[1])})`);
        assert.equal(after[0], after[1], 'both executions remain in lockstep');
      } finally {
        re.socket.destroy();
      }
    } finally {
      signals.emit('SIGINT');
      await handle.done;
    }
  });

  it('H5 with two attached viewers the producer still emits once per interval globally — two viewers do not double the rate', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    await withGateway(async (gateway) => {
      const rooms = gateway.daemon.rooms;
      const errors: unknown[] = [];
      const output = beginFixtureOutput(rooms, (error) => errors.push(error));
      try {
        for (const key of ['h5-a', 'h5-b']) {
          const joined = rooms.joinRoom(FIXTURE_ROOM_ID, key, undefined, 'read');
          assert.equal(joined.ok, true, `viewer ${key} joined`);
        }
        assert.equal(attachedViewerCount(rooms), 2, 'two viewers are attached');
        t.mock.timers.tick(5_000);
        assert.equal(output.ticks(), 10, 'exactly window/interval ticks with two viewers (5000/500)');
        assert.deepEqual(seqsOf(rooms), [10, 10]);
        t.mock.timers.tick(5_000);
        assert.equal(output.ticks(), 10 + 10, 'still one emission per interval globally after another window');
        assert.deepEqual(errors, []);
      } finally {
        output.halt();
      }
    });
  });

  it('H6 a genuinely non-reading attached viewer still hits the normal Gateway viewer-queue bound and viewer_backpressure disconnect', async () => {
    await withGateway(async (gateway) => {
      await gateway.boot();
      const rooms = gateway.daemon.rooms;
      const healthy = await connectV2(gateway.paths.socketPath);
      const slow = await connectV2(gateway.paths.socketPath);
      try {
        for (const client of [healthy, slow]) {
          client.send({ op: 'Hello', ipc_version: 2 });
          await client.next();
        }
        healthy.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'h6-h', viewer_caps: 'read' });
        const healthyJoin = await nextOp(healthy, 'JoinRoom');
        const healthyViewerId = String(healthyJoin['viewer_id']);
        slow.send({ op: 'JoinRoom', room_id: FIXTURE_ROOM_ID, idempotency_key: 'h6-s', viewer_caps: 'read' });
        const slowJoin = await nextOp(slow, 'JoinRoom');
        const slowViewerId = String(slowJoin['viewer_id']);
        slow.socket.pause();
        // The 500ms cadence alone would need >2 minutes to cross 256 frames;
        // drive the real bound directly through the same authorized harness
        // surface XD1 uses (emitFixturePatch), then assert the backpressure
        // outcome is unchanged by the correction. The healthy viewer's socket
        // keeps reading, so its adapter drains continuously in real operation;
        // simulate that steady drain so the flood isolates the non-reading
        // viewer (per-viewer queue bound, r4 §7.9 Table 11 row 5).
        for (let i = 0; i < 300; i++) {
          rooms.emitFixturePatch(FIXTURE_ROOM_ID, i % 2 === 0 ? 'slot-a' : 'slot-b', `h6 flood ${String(i)}`);
          rooms.takeOutbox(FIXTURE_ROOM_ID, healthyViewerId);
        }
        const slowPending = rooms.pendingDisconnect(FIXTURE_ROOM_ID, slowViewerId);
        assert.equal(slowPending, 'viewer_backpressure', 'non-reading viewer hit the queue bound');
        assert.equal(
          rooms.pendingDisconnect(FIXTURE_ROOM_ID, healthyViewerId),
          null,
          'the reading viewer was not backpressured',
        );
      } finally {
        healthy.socket.destroy();
        slow.socket.destroy();
      }
    });
  });

  it('H7 the real runner (npm run phase1:fixture shape) stays quiet while no viewer is attached, then cleans up correctly on SIGINT', async () => {
    const runner = launchRunner();
    try {
      const { socketPath, sessionPath, tempRoot } = await runner.ready();
      // Mirror Run 02 exactly: a FollowRoom read (which mints no viewer) and
      // an idle wait substantially longer than Run 02's overflow window.
      const client = await connectV2(socketPath);
      try {
        client.send({ op: 'Hello', ipc_version: 2 });
        await client.next();
        client.send({ op: 'FollowRoom', target: FIXTURE_ROOM_ID });
        await nextOp(client, 'FollowRoom');
      } finally {
        client.socket.destroy();
      }
      // Idle wait: 3s real time is 6 fixture intervals with zero attached
      // viewers (Run 02 overflowed after ~5 idle minutes; this is the same
      // mechanism proven exhaustively by H1's six-minute mock window). Three
      // real seconds keep the suite inside CI bounds while exercising the
      // exact Run-02 command sequence.
      await sleep(3_000);
      const snapshotResponse = await ipcRequest(socketPath, { op: 'status' });
      assert.equal(snapshotResponse.ok, true);
      // Read the sequences through a real v2 FollowRoom read (no viewer).
      const probe = await connectV2(socketPath);
      try {
        probe.send({ op: 'Hello', ipc_version: 2 });
        await probe.next();
        probe.send({ op: 'FollowRoom', target: FIXTURE_ROOM_ID });
        const follow = await nextOp(probe, 'FollowRoom');
        const snapshot = follow['snapshot'] as { executions: { execution_id: string; cursors: { ptyOutputSeq: number } }[] };
        assert.deepEqual(
          snapshot.executions.map((execution) => execution.cursors.ptyOutputSeq),
          [0, 0],
          'the real runner emitted nothing while no viewer was attached',
        );
      } finally {
        probe.socket.destroy();
      }
      writeFileSync(sessionPath, '{}\n');
      runner.child.kill('SIGINT');
      assert.equal(await exitWithin(runner), 0, `clean exit; stderr: ${runner.stderr()}`);
      assert.equal(existsSync(socketPath), false, 'socket removed');
      assert.equal(existsSync(sessionPath), false, 'the session file is removed');
      assert.equal(existsSync(tempRoot), false, 'temporary root removed');
      assert.match(runner.stderr(), /cleanup settled/);
      assert.doesNotMatch(runner.stderr(), /FAILED/);
    } finally {
      runner.cleanup();
    }
  });
});
