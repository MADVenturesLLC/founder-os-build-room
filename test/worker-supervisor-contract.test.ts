/**
 * Lane C — worker-supervisor CONTRACT (OMP→MAD Evolve Pack v0, Founder act
 * of 2026-09-13). Adopts the contract, not OMP code.
 *
 * Imports the additive contract modules by relative source path; the Phase 1
 * C2 supervisor (`packages/worker-supervisor/src/index.ts`) is neither
 * imported nor modified, and its SHA-256 at the base is pinned below.
 *
 * Proven here:
 *   - the contract types and constants load; restart policies outside the
 *     bounds are refused; backoff is deterministic and capped;
 *   - readiness is log-regex AND tcp-port — either alone is not ready;
 *   - `send` is refused before readiness, on unknown workers, while
 *     stopping, and for oversized frames;
 *   - missing the readiness deadline kills the worker and goes through the
 *     bounded restart path; exhausting the budget → `failed`, no spawn;
 *   - stop: SIGTERM → grace → SIGKILL, resolves only after exit, joins a
 *     concurrent stop, cancels a pending restart, never restarts after;
 *   - the real TCP probe against a loopback fixture; the regex probe;
 *   - static: the contract files import only node builtins and each other,
 *     contain no listener/second-daemon tokens, and index.ts is untouched.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOG_RING_LINES,
  MAX_SEND_FRAME_BYTES,
  NO_RESTART_POLICY,
  RESTART_POLICY_BOUNDS,
  WORKER_STATES,
  WORKER_SUPERVISOR_NON_GOALS,
  WorkerContractError,
  computeBackoffMs,
  isReady,
  validateReadinessSpec,
  validateRestartPolicy,
  type ExitRecord,
  type ReadinessSpec,
  type RestartPolicy,
  type WorkerOps,
} from '../packages/worker-supervisor/src/contract.js';
import { regexLogProbe, tcpPortProbe } from '../packages/worker-supervisor/src/contract-probes.js';
import {
  ContractStubSupervisor,
  type ProcessAdapter,
  type Scheduler,
  type SpawnedProcess,
  type WorkerLaunch,
} from '../packages/worker-supervisor/src/contract-stub.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGE_SRC = join(REPO_ROOT, 'packages', 'worker-supervisor', 'src');

/** Pinned at the lane base 736b12b33a20dd055d88ba0ec1e30621797cc959: the Phase 1 files this lane must not touch. */
const PHASE1_PINS: Record<string, string> = {
  'packages/worker-supervisor/src/index.ts': 'be7450db50ac1bb0aac234b0bef4ec7753fbbdbd76c3c6574f23ed9761719fa2',
  'packages/worker-supervisor/src/ipc-contract.md': '4c54c27aae3c7e7f09dcb85fbcc5036b7d5401ede5d0e028f938d2902a249aaf',
};

/* ------------------------------------------------------------------ */
/* Fakes                                                                */
/* ------------------------------------------------------------------ */

class FakeScheduler implements Scheduler {
  private current = 1_000_000;
  private nextId = 1;
  private readonly timers = new Map<number, { due: number; fn: () => void }>();
  now(): number {
    return this.current;
  }
  after(ms: number, fn: () => void): () => void {
    const id = this.nextId++;
    this.timers.set(id, { due: this.current + ms, fn });
    return () => {
      this.timers.delete(id);
    };
  }
  pending(): number {
    return this.timers.size;
  }
  /** Advance time, firing due timers in due order (timers a callback adds are honoured). */
  async advance(ms: number): Promise<void> {
    const target = this.current + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, t]) => t.due <= target).sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
      const next = due[0];
      if (next === undefined) break;
      this.timers.delete(next[0]);
      this.current = Math.max(this.current, next[1].due);
      next[1].fn();
      await flush();
    }
    this.current = target;
    await flush();
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

class FakeProcess implements SpawnedProcess {
  readonly kills: string[] = [];
  readonly writes: Buffer[] = [];
  writeResult = true;
  private stdout: ((line: string) => void) | null = null;
  private stderr: ((line: string) => void) | null = null;
  private exit: ((exit: ExitRecord) => void) | null = null;
  exited = false;
  constructor(readonly pid: number) {}
  write(data: Buffer): boolean {
    this.writes.push(data);
    return this.writeResult;
  }
  kill(signal: 'SIGTERM' | 'SIGKILL'): void {
    this.kills.push(signal);
  }
  onStdout(cb: (line: string) => void): void {
    this.stdout = cb;
  }
  onStderr(cb: (line: string) => void): void {
    this.stderr = cb;
  }
  onExit(cb: (exit: ExitRecord) => void): void {
    this.exit = cb;
  }
  emitStdout(line: string): void {
    this.stdout?.(line);
  }
  emitStderr(line: string): void {
    this.stderr?.(line);
  }
  emitExit(exit: ExitRecord): void {
    this.exited = true;
    this.exit?.(exit);
  }
}

class FakeAdapter implements ProcessAdapter {
  readonly spawned: FakeProcess[] = [];
  readonly attempts: number[] = [];
  spawn(_launch: WorkerLaunch, attempt: number): SpawnedProcess {
    const process = new FakeProcess(4000 + this.spawned.length);
    this.spawned.push(process);
    this.attempts.push(attempt);
    return process;
  }
  last(): FakeProcess {
    const p = this.spawned[this.spawned.length - 1];
    assert.ok(p !== undefined, 'a process was spawned');
    return p;
  }
}

const READINESS: ReadinessSpec = {
  log: { kind: 'log_regex', pattern: '^READY on port \\d+$' },
  tcp: { kind: 'tcp_port', host: '127.0.0.1', port: 43210, connectTimeoutMs: 100 },
  deadlineMs: 5_000,
  probeIntervalMs: 100,
};

const RESTARTS: RestartPolicy = { maxRestarts: 2, windowMs: 60_000, backoff: { initialMs: 1_000, multiplier: 2, maxMs: 10_000 } };

function launch(overrides: Partial<WorkerLaunch> = {}): WorkerLaunch {
  return { worker_id: 'w1', command: '/fixture/worker', args: [], readiness: READINESS, restart: NO_RESTART_POLICY, ...overrides };
}

interface Harness {
  readonly supervisor: ContractStubSupervisor;
  readonly adapter: FakeAdapter;
  readonly scheduler: FakeScheduler;
  tcpAccepting: boolean;
  tcpProbeCalls: number;
}

function harness(): Harness {
  const adapter = new FakeAdapter();
  const scheduler = new FakeScheduler();
  const h: Harness = {
    adapter,
    scheduler,
    tcpAccepting: false,
    tcpProbeCalls: 0,
    supervisor: new ContractStubSupervisor({
      adapter,
      scheduler,
      tcpProbe: () => {
        h.tcpProbeCalls += 1;
        return Promise.resolve(h.tcpAccepting);
      },
    }),
  };
  return h;
}

async function bringToReady(h: Harness, id = 'w1'): Promise<FakeProcess> {
  const process = h.adapter.last();
  process.emitStdout('READY on port 43210');
  h.tcpAccepting = true;
  await h.scheduler.advance(READINESS.probeIntervalMs);
  assert.equal(h.supervisor.ps().find((s) => s.worker_id === id)?.state, 'ready');
  return process;
}

/* ------------------------------------------------------------------ */
/* Contract loadability, policy bounds, backoff                         */
/* ------------------------------------------------------------------ */

describe('worker-supervisor contract · types, bounds, backoff', () => {
  it('the contract loads: closed state set, four-verb ops surface, non-goals as data', () => {
    assert.deepEqual([...WORKER_STATES], ['spawning', 'awaiting_readiness', 'ready', 'restarting', 'stopping', 'stopped', 'failed']);
    const ops: WorkerOps = new ContractStubSupervisor(harness().supervisor['deps' as never] as never);
    assert.deepEqual(Object.keys({ ps: ops.ps, logs: ops.logs, send: ops.send, stop: ops.stop }), ['ps', 'logs', 'send', 'stop']);
    assert.equal(WORKER_SUPERVISOR_NON_GOALS.length, 5);
    assert.ok(WORKER_SUPERVISOR_NON_GOALS.some((g) => /not an OMP process-supervisor clone/.test(g)));
    assert.ok(WORKER_SUPERVISOR_NON_GOALS.some((g) => /not the Phase 2 harness/.test(g)));
  });

  it('validateRestartPolicy accepts in-bounds policies and refuses each out-of-bounds field, unknown fields, and non-objects', () => {
    assert.deepEqual(validateRestartPolicy(NO_RESTART_POLICY), []);
    assert.deepEqual(validateRestartPolicy(RESTARTS), []);
    const bad = (patch: Record<string, unknown>, field: string): void => {
      const defects = validateRestartPolicy({ ...RESTARTS, ...patch });
      assert.ok(defects.some((d) => d.field === field), `${field}: ${JSON.stringify(defects)}`);
    };
    bad({ maxRestarts: RESTART_POLICY_BOUNDS.maxRestarts.max + 1 }, 'maxRestarts');
    bad({ maxRestarts: 1.5 }, 'maxRestarts');
    bad({ maxRestarts: -1 }, 'maxRestarts');
    bad({ windowMs: 10 }, 'windowMs');
    bad({ backoff: { ...RESTARTS.backoff, initialMs: 50 } }, 'backoff.initialMs');
    bad({ backoff: { ...RESTARTS.backoff, multiplier: 5 } }, 'backoff.multiplier');
    bad({ backoff: { ...RESTARTS.backoff, multiplier: 0.5 } }, 'backoff.multiplier');
    bad({ backoff: { ...RESTARTS.backoff, maxMs: 400_000 } }, 'backoff.maxMs');
    bad({ backoff: { initialMs: 5_000, multiplier: 2, maxMs: 1_000 } }, 'backoff');
    bad({ jitter: true }, 'jitter');
    assert.equal(validateRestartPolicy(null).length, 1);
    assert.equal(validateRestartPolicy('restart').length, 1);
    assert.ok(validateRestartPolicy({ maxRestarts: 1, windowMs: 60_000 }).some((d) => d.field === 'backoff'));
  });

  it('computeBackoffMs is exponential, capped, deterministic, and refuses a non-positive attempt', () => {
    const seq = [1, 2, 3, 4, 5, 6].map((attempt) => computeBackoffMs(RESTARTS, attempt));
    assert.deepEqual(seq, [1_000, 2_000, 4_000, 8_000, 10_000, 10_000]);
    assert.deepEqual(seq, [1, 2, 3, 4, 5, 6].map((attempt) => computeBackoffMs(RESTARTS, attempt)), 'no jitter');
    assert.throws(() => computeBackoffMs(RESTARTS, 0), (e: unknown) => e instanceof WorkerContractError && e.code === 'invalid_attempt');
  });

  it('validateReadinessSpec requires both probes, loopback host, and bounded timings', () => {
    assert.deepEqual(validateReadinessSpec(READINESS), []);
    assert.ok(validateReadinessSpec({ ...READINESS, log: undefined }).some((d) => d.field === 'log'));
    assert.ok(validateReadinessSpec({ ...READINESS, tcp: undefined }).some((d) => d.field === 'tcp'));
    assert.ok(validateReadinessSpec({ ...READINESS, tcp: { ...READINESS.tcp, host: '10.0.0.1' } }).some((d) => d.field === 'tcp.host'));
    assert.ok(validateReadinessSpec({ ...READINESS, tcp: { ...READINESS.tcp, port: 70_000 } }).some((d) => d.field === 'tcp.port'));
    assert.ok(validateReadinessSpec({ ...READINESS, log: { kind: 'log_regex', pattern: '(' } }).some((d) => d.field === 'log.pattern'));
    assert.ok(validateReadinessSpec({ ...READINESS, deadlineMs: 1 }).some((d) => d.field === 'deadlineMs'));
    assert.ok(validateReadinessSpec({ ...READINESS, probeIntervalMs: 0 }).some((d) => d.field === 'probeIntervalMs'));
  });

  it('isReady is the conjunction', () => {
    assert.equal(isReady({ log_matched: false, tcp_accepting: false }), false);
    assert.equal(isReady({ log_matched: true, tcp_accepting: false }), false);
    assert.equal(isReady({ log_matched: false, tcp_accepting: true }), false);
    assert.equal(isReady({ log_matched: true, tcp_accepting: true }), true);
  });
});

/* ------------------------------------------------------------------ */
/* Stub: readiness and send                                             */
/* ------------------------------------------------------------------ */

describe('worker-supervisor stub · readiness = log-regex AND tcp port', () => {
  it('an invalid policy or readiness spec refuses start before any spawn', () => {
    const h = harness();
    assert.throws(() => h.supervisor.start(launch({ restart: { ...RESTARTS, maxRestarts: 99 } })), (e: unknown) => e instanceof WorkerContractError && e.code === 'invalid_policy');
    assert.throws(() => h.supervisor.start(launch({ readiness: { ...READINESS, deadlineMs: 0 } })), (e: unknown) => e instanceof WorkerContractError && e.code === 'invalid_readiness');
    assert.equal(h.adapter.spawned.length, 0);
    assert.deepEqual(h.supervisor.ps(), []);
  });

  it('log match alone is not ready; tcp alone is not ready; both → ready; send refused until then', async () => {
    const h = harness();
    h.supervisor.start(launch());
    const process = h.adapter.last();
    assert.equal(h.supervisor.ps()[0]?.state, 'awaiting_readiness');
    assert.deepEqual(await h.supervisor.send('w1', 'hello'), { ok: false, reason: 'not_ready' });

    process.emitStdout('booting');
    process.emitStdout('READY on port 43210');
    await h.scheduler.advance(READINESS.probeIntervalMs);
    assert.deepEqual(h.supervisor.ps()[0]?.readiness, { log_matched: true, tcp_accepting: false });
    assert.equal(h.supervisor.ps()[0]?.state, 'awaiting_readiness', 'log matched, port not accepting → not ready');
    assert.deepEqual(await h.supervisor.send('w1', 'hello'), { ok: false, reason: 'not_ready' });

    const h2 = harness();
    h2.supervisor.start(launch());
    h2.tcpAccepting = true;
    await h2.scheduler.advance(READINESS.probeIntervalMs);
    assert.deepEqual(h2.supervisor.ps()[0]?.readiness, { log_matched: false, tcp_accepting: true });
    assert.equal(h2.supervisor.ps()[0]?.state, 'awaiting_readiness', 'port accepting, log not matched → not ready');

    h.tcpAccepting = true;
    await h.scheduler.advance(READINESS.probeIntervalMs);
    assert.equal(h.supervisor.ps()[0]?.state, 'ready');
    assert.deepEqual(await h.supervisor.send('w1', 'hello'), { ok: true, bytes: 5 });
    assert.equal(process.writes.length, 1);
    assert.equal(process.writes[0]?.toString('utf8'), 'hello');
    assert.equal(h.scheduler.pending(), 0, 'probe and deadline timers are cleared once ready');
  });

  it('the readiness regex is honoured on stderr too, and the probe throwing counts as not accepting', async () => {
    const adapter = new FakeAdapter();
    const scheduler = new FakeScheduler();
    let throwing = true;
    const supervisor = new ContractStubSupervisor({
      adapter,
      scheduler,
      tcpProbe: () => (throwing ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve(true)),
    });
    supervisor.start(launch());
    adapter.last().emitStderr('READY on port 43210');
    await scheduler.advance(READINESS.probeIntervalMs);
    assert.deepEqual(supervisor.ps()[0]?.readiness, { log_matched: true, tcp_accepting: false });
    throwing = false;
    await scheduler.advance(READINESS.probeIntervalMs);
    assert.equal(supervisor.ps()[0]?.state, 'ready');
  });

  it('send refuses unknown workers, oversized frames, and failed writes', async () => {
    const h = harness();
    h.supervisor.start(launch());
    const process = await bringToReady(h);
    assert.deepEqual(await h.supervisor.send('nope', 'x'), { ok: false, reason: 'unknown_worker' });
    assert.deepEqual(await h.supervisor.send('w1', Buffer.alloc(MAX_SEND_FRAME_BYTES + 1)), { ok: false, reason: 'frame_too_large' });
    process.writeResult = false;
    assert.deepEqual(await h.supervisor.send('w1', 'x'), { ok: false, reason: 'write_failed' });
  });
});

/* ------------------------------------------------------------------ */
/* Stub: deadline, restart, failure                                     */
/* ------------------------------------------------------------------ */

describe('worker-supervisor stub · bounded restarts', () => {
  it('missing the readiness deadline kills the worker; without a restart budget it is failed, never respawned', async () => {
    const h = harness();
    h.supervisor.start(launch());
    const process = h.adapter.last();
    await h.scheduler.advance(READINESS.deadlineMs);
    assert.deepEqual(process.kills, ['SIGKILL']);
    assert.equal(h.supervisor.ps()[0]?.failure_reason, 'readiness_deadline_exceeded');
    process.emitExit({ code: null, signal: 'SIGKILL' });
    await flush();
    assert.equal(h.supervisor.ps()[0]?.state, 'failed');
    assert.match(h.supervisor.ps()[0]?.failure_reason ?? '', /exited_without_restart_budget/);
    await h.scheduler.advance(60_000);
    assert.equal(h.adapter.spawned.length, 1, 'no respawn without a budget');
  });

  it('an unexpected exit restarts after deterministic backoff, up to maxRestarts, then fails closed', async () => {
    const h = harness();
    h.supervisor.start(launch({ restart: RESTARTS }));
    await bringToReady(h);

    h.adapter.last().emitExit({ code: 1, signal: null });
    await flush();
    assert.equal(h.supervisor.ps()[0]?.state, 'restarting');
    assert.equal(h.supervisor.ps()[0]?.restarts, 1);
    await h.scheduler.advance(999);
    assert.equal(h.adapter.spawned.length, 1, 'not before the backoff elapses');
    await h.scheduler.advance(1);
    assert.equal(h.adapter.spawned.length, 2, 'respawned at initialMs');
    assert.deepEqual(h.adapter.attempts, [1, 2]);
    assert.equal(h.supervisor.ps()[0]?.state, 'awaiting_readiness', 'readiness is re-proven after every restart');
    assert.deepEqual(await h.supervisor.send('w1', 'x'), { ok: false, reason: 'not_ready' });

    await bringToReady(h);
    h.adapter.last().emitExit({ code: 1, signal: null });
    await flush();
    assert.equal(h.supervisor.ps()[0]?.restarts, 2);
    await h.scheduler.advance(2_000);
    assert.equal(h.adapter.spawned.length, 3, 'second restart at initialMs × multiplier');

    await bringToReady(h);
    h.adapter.last().emitExit({ code: 1, signal: null });
    await flush();
    assert.equal(h.supervisor.ps()[0]?.state, 'failed');
    assert.match(h.supervisor.ps()[0]?.failure_reason ?? '', /restart_budget_exhausted \(2 in 60000ms\)/);
    await h.scheduler.advance(120_000);
    assert.equal(h.adapter.spawned.length, 3, 'budget exhausted: no further spawn, ever');
    assert.deepEqual(await h.supervisor.send('w1', 'x'), { ok: false, reason: 'not_ready' });
  });

  it('the restart window rolls: restarts older than windowMs do not count', async () => {
    const h = harness();
    h.supervisor.start(launch({ restart: { ...RESTARTS, maxRestarts: 1 } }));
    await bringToReady(h);
    h.adapter.last().emitExit({ code: 1, signal: null });
    await h.scheduler.advance(1_000);
    assert.equal(h.adapter.spawned.length, 2);
    await bringToReady(h);
    await h.scheduler.advance(RESTARTS.windowMs); // the first restart ages out of the window
    h.adapter.last().emitExit({ code: 1, signal: null });
    await flush();
    assert.equal(h.supervisor.ps()[0]?.state, 'restarting', 'a fresh window admits one more restart');
  });
});

/* ------------------------------------------------------------------ */
/* Stub: stop guarantees                                                */
/* ------------------------------------------------------------------ */

describe('worker-supervisor stub · stop guarantees', () => {
  it('SIGTERM, then SIGKILL after grace; resolves only after the exit is observed; forced is reported', async () => {
    const h = harness();
    h.supervisor.start(launch({ restart: RESTARTS }));
    const process = await bringToReady(h);
    let settled = false;
    const stopping = h.supervisor.stop('w1', { graceMs: 500 }).then((r) => {
      settled = true;
      return r;
    });
    await flush();
    assert.deepEqual(process.kills, ['SIGTERM']);
    assert.equal(h.supervisor.ps()[0]?.state, 'stopping');
    assert.deepEqual(await h.supervisor.send('w1', 'x'), { ok: false, reason: 'stopping' });
    await h.scheduler.advance(499);
    assert.deepEqual(process.kills, ['SIGTERM']);
    assert.equal(settled, false, 'not resolved before the exit');
    await h.scheduler.advance(1);
    assert.deepEqual(process.kills, ['SIGTERM', 'SIGKILL']);
    assert.equal(settled, false, 'SIGKILL sent, still waiting for the exit');
    process.emitExit({ code: null, signal: 'SIGKILL' });
    const result = await stopping;
    assert.deepEqual(result, { ok: true, exit: { code: null, signal: 'SIGKILL' }, forced: true });
    assert.equal(h.supervisor.ps()[0]?.state, 'stopped');
    await h.scheduler.advance(60_000);
    assert.equal(h.adapter.spawned.length, 1, 'a stopped worker is never restarted, whatever its policy');
  });

  it('a graceful exit within grace is not forced, and the SIGKILL timer is cancelled', async () => {
    const h = harness();
    h.supervisor.start(launch());
    const process = await bringToReady(h);
    const stopping = h.supervisor.stop('w1', { graceMs: 500 });
    await flush();
    process.emitExit({ code: 0, signal: null });
    assert.deepEqual(await stopping, { ok: true, exit: { code: 0, signal: null }, forced: false });
    await h.scheduler.advance(1_000);
    assert.deepEqual(process.kills, ['SIGTERM']);
    assert.equal(h.scheduler.pending(), 0);
  });

  it('a second stop joins the first; a stop during a pending restart cancels it; unknown → not ok; bad grace → throws', async () => {
    const h = harness();
    h.supervisor.start(launch({ restart: RESTARTS }));
    const process = await bringToReady(h);
    const first = h.supervisor.stop('w1', { graceMs: 100 });
    const second = h.supervisor.stop('w1', { graceMs: 100 });
    assert.equal(first, second, 'the same promise');
    await flush();
    assert.deepEqual(process.kills, ['SIGTERM'], 'one SIGTERM, not two');
    process.emitExit({ code: 0, signal: null });
    await first;

    const h2 = harness();
    h2.supervisor.start(launch({ restart: RESTARTS }));
    await bringToReady(h2);
    h2.adapter.last().emitExit({ code: 1, signal: null });
    await flush();
    assert.equal(h2.supervisor.ps()[0]?.state, 'restarting');
    const result = await h2.supervisor.stop('w1', { graceMs: 100 });
    assert.equal(result.ok, true);
    assert.equal(h2.supervisor.ps()[0]?.state, 'stopped');
    await h2.scheduler.advance(60_000);
    assert.equal(h2.adapter.spawned.length, 1, 'the pending restart was cancelled');

    assert.deepEqual(await h.supervisor.stop('ghost', { graceMs: 100 }), { ok: false, reason: 'unknown_worker' });
    assert.throws(() => h.supervisor.stop('w1', { graceMs: 999_999 }), (e: unknown) => e instanceof WorkerContractError && e.code === 'invalid_grace');
  });
});

/* ------------------------------------------------------------------ */
/* Stub: ps and logs                                                    */
/* ------------------------------------------------------------------ */

describe('worker-supervisor stub · ps and logs', () => {
  it('ps reports every worker; logs are bounded, ordered, cursor-able, and unknown workers throw', async () => {
    const h = harness();
    h.supervisor.start(launch({ worker_id: 'a' }));
    h.supervisor.start(launch({ worker_id: 'b' }));
    assert.throws(() => h.supervisor.start(launch({ worker_id: 'a' })), (e: unknown) => e instanceof WorkerContractError && e.code === 'duplicate_worker');
    assert.deepEqual(h.supervisor.ps().map((s) => [s.worker_id, s.state, s.pid]), [['a', 'awaiting_readiness', 4000], ['b', 'awaiting_readiness', 4001]]);

    const a = h.adapter.spawned[0]!;
    for (let i = 0; i < LOG_RING_LINES + 50; i += 1) a.emitStdout(`line ${i}`);
    const all = h.supervisor.logs('a');
    assert.equal(all.length, LOG_RING_LINES);
    assert.equal(all[all.length - 1]?.text, `line ${LOG_RING_LINES + 49}`);
    const tail = h.supervisor.logs('a', { limit: 2 });
    assert.deepEqual(tail.map((l) => l.text), [`line ${LOG_RING_LINES + 48}`, `line ${LOG_RING_LINES + 49}`]);
    const afterSeq = h.supervisor.logs('a', { afterSeq: tail[0]!.seq });
    assert.deepEqual(afterSeq.map((l) => l.text), [`line ${LOG_RING_LINES + 49}`]);
    assert.ok(all.every((l, i) => i === 0 || l.seq > all[i - 1]!.seq));
    assert.equal(h.supervisor.logs('b')[0]?.stream, 'supervisor');
    assert.throws(() => h.supervisor.logs('ghost'), (e: unknown) => e instanceof WorkerContractError && e.code === 'unknown_worker');
  });
});

/* ------------------------------------------------------------------ */
/* Real probes against a loopback fixture                               */
/* ------------------------------------------------------------------ */

describe('worker-supervisor probes · loopback fixture', () => {
  let server: Server;
  let port: number;
  before(async () => {
    server = createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('tcpPortProbe connects to an accepting loopback port and reports false once it is closed', async () => {
    assert.equal(await tcpPortProbe({ kind: 'tcp_port', host: '127.0.0.1', port, connectTimeoutMs: 500 }), true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    assert.equal(await tcpPortProbe({ kind: 'tcp_port', host: '127.0.0.1', port, connectTimeoutMs: 500 }), false);
    server = createServer((socket) => socket.end()); // for the after() hook
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  it('regexLogProbe compiles once with the u flag and honours flags', () => {
    const probe = regexLogProbe({ kind: 'log_regex', pattern: '^ready', flags: 'i' });
    assert.equal(probe('READY on 1'), true);
    assert.equal(probe('not ready'), false);
  });
});

/* ------------------------------------------------------------------ */
/* Static                                                               */
/* ------------------------------------------------------------------ */

describe('worker-supervisor contract · static', () => {
  const CONTRACT_FILES = ['contract.ts', 'contract-probes.ts', 'contract-stub.ts'];

  it('the Phase 1 C2 supervisor and its IPC contract are byte-identical to the base', () => {
    for (const [file, expected] of Object.entries(PHASE1_PINS)) {
      const actual = createHash('sha256').update(readFileSync(join(REPO_ROOT, file))).digest('hex');
      assert.equal(actual, expected, `${file} was modified`);
    }
  });

  it('contract files import only node builtins and each other; no listener, second-daemon, or socket-path tokens', () => {
    for (const file of CONTRACT_FILES) {
      const source = readFileSync(join(PACKAGE_SRC, file), 'utf8');
      const specifiers = [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      for (const specifier of specifiers) {
        assert.ok(specifier.startsWith('node:') || /^\.\/contract(-probes|-stub)?\.js$/.test(specifier), `${file} imports ${specifier}`);
        assert.ok(specifier !== './index.js', `${file} must not import the Phase 1 supervisor`);
        if (specifier === 'node:net') assert.equal(file, 'contract-probes.ts', 'only the probe module touches node:net');
      }
      for (const token of ['createServer', '.listen(', 'broker.sock', 'MADV_SOCKET_PATH', 'process.env', 'child_process', 'node:fs']) {
        assert.ok(!source.includes(token), `${file} contains ${JSON.stringify(token)}`);
      }
    }
  });

  it('the in-package README states readiness semantics, backoff bounds, stop guarantees, and the non-goals', () => {
    const readme = readFileSync(join(REPO_ROOT, 'packages', 'worker-supervisor', 'README.md'), 'utf8');
    for (const needle of ['log-regex AND', 'RESTART_POLICY_BOUNDS', 'SIGTERM', 'SIGKILL', 'Non-goals', 'not an OMP process-supervisor clone', 'not the Phase 2 harness']) {
      assert.ok(readme.includes(needle), `README lacks ${JSON.stringify(needle)}`);
    }
  });
});
