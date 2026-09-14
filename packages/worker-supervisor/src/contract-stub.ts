/**
 * A MINIMAL stub supervisor that proves the contract in `./contract.ts` is
 * loadable and fails closed. It is not the production supervisor and not a
 * rewrite of the Phase 1 C2 supervisor (`./index.ts`, untouched).
 *
 * Everything impure is injected: the process adapter, the scheduler (clock +
 * timers), and the TCP probe. The stub itself opens no socket, spawns no
 * process, and reads no clock — so its suite is deterministic and runs
 * without a worker binary.
 *
 * Fail-closed behaviours the stub carries:
 *   - an invalid restart policy or readiness spec refuses `start` before any
 *     spawn;
 *   - readiness is log-regex AND tcp-port; `send` is refused until then;
 *   - a worker that misses its readiness deadline is killed, and the exit
 *     goes through the same bounded restart path as any other exit;
 *   - restarts beyond the policy → `failed`, no further spawn, ever;
 *   - `stop` is SIGTERM → grace → SIGKILL, resolves only after the exit is
 *     observed, joins a concurrent `stop`, and cancels any pending restart;
 *   - `logs` of an unknown worker throws; an empty list would be a lie.
 */

import {
  LOG_RING_LINES,
  MAX_SEND_FRAME_BYTES,
  STOP_BOUNDS,
  WorkerContractError,
  computeBackoffMs,
  isReady,
  validateReadinessSpec,
  validateRestartPolicy,
  type ExitRecord,
  type LogLine,
  type LogReadinessSpec,
  type LogStream,
  type LogsQuery,
  type ReadinessSpec,
  type RestartPolicy,
  type SendResult,
  type StopOptions,
  type StopResult,
  type WorkerOps,
  type WorkerState,
  type WorkerStatus,
} from './contract.js';
import { regexLogProbe, type LogProbe, type TcpProbe } from './contract-probes.js';

export interface WorkerLaunch {
  readonly worker_id: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly readiness: ReadinessSpec;
  readonly restart: RestartPolicy;
}

/** The process the stub supervises, behind an adapter so a suite can drive a fake. */
export interface SpawnedProcess {
  readonly pid: number;
  /** False when the write could not be accepted (closed stdin, backpressure refused). */
  write(data: Buffer): boolean;
  kill(signal: 'SIGTERM' | 'SIGKILL'): void;
  onStdout(callback: (line: string) => void): void;
  onStderr(callback: (line: string) => void): void;
  onExit(callback: (exit: ExitRecord) => void): void;
}

export interface ProcessAdapter {
  spawn(launch: WorkerLaunch, attempt: number): SpawnedProcess;
}

/** Injected time. `after` returns a cancel function. */
export interface Scheduler {
  now(): number;
  after(ms: number, fn: () => void): () => void;
}

export interface ContractStubDeps {
  readonly adapter: ProcessAdapter;
  readonly scheduler: Scheduler;
  readonly tcpProbe: TcpProbe;
  /** Defaults to `regexLogProbe`. */
  readonly logProbe?: (spec: LogReadinessSpec) => LogProbe;
}

interface StopHandle {
  readonly promise: Promise<StopResult>;
  readonly resolve: (result: StopResult) => void;
  cancelKill: (() => void) | null;
  forced: boolean;
}

interface Managed {
  readonly launch: WorkerLaunch;
  readonly logProbe: LogProbe;
  state: WorkerState;
  process: SpawnedProcess | null;
  generation: number;
  restarts: number;
  restartTimes: number[];
  readiness: { log_matched: boolean; tcp_accepting: boolean };
  lastExit: ExitRecord | null;
  failureReason: string | null;
  logs: LogLine[];
  logSeq: number;
  cancelProbe: (() => void) | null;
  cancelDeadline: (() => void) | null;
  cancelRestart: (() => void) | null;
  stopping: StopHandle | null;
}

export class ContractStubSupervisor implements WorkerOps {
  private readonly workers = new Map<string, Managed>();

  constructor(private readonly deps: ContractStubDeps) {}

  /** Validate, then spawn attempt 1. Throws before any spawn on an invalid policy or spec. */
  start(launch: WorkerLaunch): WorkerStatus {
    const policyDefects = validateRestartPolicy(launch.restart);
    if (policyDefects.length > 0) {
      throw new WorkerContractError('invalid_policy', policyDefects.map((d) => `${d.field}: ${d.message}`).join('; '));
    }
    const readinessDefects = validateReadinessSpec(launch.readiness);
    if (readinessDefects.length > 0) {
      throw new WorkerContractError('invalid_readiness', readinessDefects.map((d) => `${d.field}: ${d.message}`).join('; '));
    }
    if (this.workers.has(launch.worker_id)) {
      throw new WorkerContractError('duplicate_worker', `worker ${JSON.stringify(launch.worker_id)} already exists`);
    }
    const managed: Managed = {
      launch,
      logProbe: (this.deps.logProbe ?? regexLogProbe)(launch.readiness.log),
      state: 'spawning',
      process: null,
      generation: 0,
      restarts: 0,
      restartTimes: [],
      readiness: { log_matched: false, tcp_accepting: false },
      lastExit: null,
      failureReason: null,
      logs: [],
      logSeq: 0,
      cancelProbe: null,
      cancelDeadline: null,
      cancelRestart: null,
      stopping: null,
    };
    this.workers.set(launch.worker_id, managed);
    this.spawn(managed, 1);
    return this.status(managed);
  }

  ps(): readonly WorkerStatus[] {
    return [...this.workers.values()].map((m) => this.status(m));
  }

  logs(workerId: string, query: LogsQuery = {}): readonly LogLine[] {
    const managed = this.workers.get(workerId);
    if (managed === undefined) {
      throw new WorkerContractError('unknown_worker', `no worker ${JSON.stringify(workerId)}`);
    }
    const after = query.afterSeq ?? 0;
    const lines = managed.logs.filter((line) => line.seq > after);
    const limit = query.limit ?? lines.length;
    return lines.slice(Math.max(0, lines.length - limit));
  }

  async send(workerId: string, frame: Buffer | string): Promise<SendResult> {
    const managed = this.workers.get(workerId);
    if (managed === undefined) return { ok: false, reason: 'unknown_worker' };
    if (managed.stopping !== null || managed.state === 'stopping') return { ok: false, reason: 'stopping' };
    if (managed.state !== 'ready' || managed.process === null) return { ok: false, reason: 'not_ready' };
    const bytes = typeof frame === 'string' ? Buffer.from(frame, 'utf8') : frame;
    if (bytes.byteLength > MAX_SEND_FRAME_BYTES) return { ok: false, reason: 'frame_too_large' };
    if (!managed.process.write(bytes)) return { ok: false, reason: 'write_failed' };
    return { ok: true, bytes: bytes.byteLength };
  }

  stop(workerId: string, options: StopOptions): Promise<StopResult> {
    const managed = this.workers.get(workerId);
    if (managed === undefined) return Promise.resolve({ ok: false, reason: 'unknown_worker' });
    const grace = options.graceMs;
    if (typeof grace !== 'number' || !Number.isFinite(grace) || grace < STOP_BOUNDS.graceMs.min || grace > STOP_BOUNDS.graceMs.max) {
      throw new WorkerContractError('invalid_grace', `graceMs must be in [${STOP_BOUNDS.graceMs.min}, ${STOP_BOUNDS.graceMs.max}]`);
    }
    if (managed.stopping !== null) return managed.stopping.promise; // a second stop joins the first

    // No live process: a pending restart is cancelled, and the worker is
    // stopped right away. Nothing is ever respawned after stop().
    if (managed.process === null) {
      managed.cancelRestart?.();
      managed.cancelRestart = null;
      const wasFailed = managed.state === 'failed';
      managed.state = wasFailed ? 'failed' : 'stopped';
      this.pushLog(managed, 'supervisor', wasFailed ? 'stop: worker already failed' : 'stop: no live process; pending restart cancelled');
      return Promise.resolve({ ok: true, exit: managed.lastExit ?? { code: null, signal: null }, forced: false });
    }

    let resolve: (result: StopResult) => void = () => undefined;
    const promise = new Promise<StopResult>((r) => {
      resolve = r;
    });
    const handle: StopHandle = { promise, resolve, cancelKill: null, forced: false };
    managed.stopping = handle;
    managed.state = 'stopping';
    this.clearReadinessTimers(managed);
    const process = managed.process;
    this.pushLog(managed, 'supervisor', `stop: SIGTERM pid ${process.pid}; SIGKILL after ${grace}ms`);
    process.kill('SIGTERM');
    handle.cancelKill = this.deps.scheduler.after(grace, () => {
      handle.cancelKill = null;
      if (managed.process !== process) return; // already exited
      handle.forced = true;
      this.pushLog(managed, 'supervisor', `stop: grace elapsed; SIGKILL pid ${process.pid}`);
      process.kill('SIGKILL');
    });
    return promise;
  }

  /* ---------------------------------------------------------------- */

  private spawn(managed: Managed, attempt: number): void {
    managed.generation += 1;
    const generation = managed.generation;
    managed.state = 'spawning';
    managed.readiness = { log_matched: false, tcp_accepting: false };
    managed.failureReason = null;
    const process = this.deps.adapter.spawn(managed.launch, attempt);
    managed.process = process;
    managed.state = 'awaiting_readiness';
    this.pushLog(managed, 'supervisor', `spawned pid ${process.pid} (attempt ${attempt}); awaiting readiness (log regex AND tcp ${managed.launch.readiness.tcp.host}:${managed.launch.readiness.tcp.port})`);

    const onLine = (stream: LogStream) => (line: string): void => {
      if (managed.generation !== generation) return;
      this.pushLog(managed, stream, line);
      if (managed.state === 'awaiting_readiness' && !managed.readiness.log_matched && managed.logProbe(line)) {
        managed.readiness = { ...managed.readiness, log_matched: true };
        this.evaluateReadiness(managed);
      }
    };
    process.onStdout(onLine('stdout'));
    process.onStderr(onLine('stderr'));
    process.onExit((exit) => {
      if (managed.generation !== generation) return;
      this.onExit(managed, exit);
    });

    const spec = managed.launch.readiness;
    const probeOnce = (): void => {
      managed.cancelProbe = null;
      if (managed.generation !== generation || managed.state !== 'awaiting_readiness') return;
      void this.deps.tcpProbe(spec.tcp).then(
        (accepting) => {
          if (managed.generation !== generation || managed.state !== 'awaiting_readiness') return;
          managed.readiness = { ...managed.readiness, tcp_accepting: accepting };
          this.evaluateReadiness(managed);
          if (managed.state === 'awaiting_readiness') {
            managed.cancelProbe = this.deps.scheduler.after(spec.probeIntervalMs, probeOnce);
          }
        },
        () => {
          // A probe that throws is "not accepting", never "accepting".
          if (managed.generation !== generation || managed.state !== 'awaiting_readiness') return;
          managed.readiness = { ...managed.readiness, tcp_accepting: false };
          managed.cancelProbe = this.deps.scheduler.after(spec.probeIntervalMs, probeOnce);
        },
      );
    };
    managed.cancelProbe = this.deps.scheduler.after(spec.probeIntervalMs, probeOnce);

    managed.cancelDeadline = this.deps.scheduler.after(spec.deadlineMs, () => {
      managed.cancelDeadline = null;
      if (managed.generation !== generation || managed.state !== 'awaiting_readiness') return;
      managed.failureReason = 'readiness_deadline_exceeded';
      this.pushLog(managed, 'supervisor', `readiness deadline ${spec.deadlineMs}ms exceeded (log_matched=${managed.readiness.log_matched}, tcp_accepting=${managed.readiness.tcp_accepting}); SIGKILL pid ${process.pid}`);
      this.clearReadinessTimers(managed);
      process.kill('SIGKILL');
    });
  }

  private evaluateReadiness(managed: Managed): void {
    if (managed.state === 'awaiting_readiness' && isReady(managed.readiness)) {
      managed.state = 'ready';
      this.clearReadinessTimers(managed);
      this.pushLog(managed, 'supervisor', 'ready: log regex matched AND tcp port accepting');
    }
  }

  private onExit(managed: Managed, exit: ExitRecord): void {
    managed.lastExit = exit;
    managed.process = null;
    this.clearReadinessTimers(managed);
    this.pushLog(managed, 'supervisor', `exited code=${exit.code === null ? 'null' : exit.code} signal=${exit.signal ?? 'null'}`);

    const stopping = managed.stopping;
    if (stopping !== null) {
      stopping.cancelKill?.();
      stopping.cancelKill = null;
      managed.state = 'stopped';
      stopping.resolve({ ok: true, exit, forced: stopping.forced });
      return;
    }

    const policy = managed.launch.restart;
    const now = this.deps.scheduler.now();
    managed.restartTimes = managed.restartTimes.filter((t) => now - t < policy.windowMs);
    if (managed.restartTimes.length < policy.maxRestarts) {
      managed.restarts += 1;
      managed.restartTimes.push(now);
      const attempt = managed.restarts;
      const delay = computeBackoffMs(policy, attempt);
      managed.state = 'restarting';
      this.pushLog(managed, 'supervisor', `restart ${attempt}/${policy.maxRestarts} in ${delay}ms (deterministic backoff)`);
      managed.cancelRestart = this.deps.scheduler.after(delay, () => {
        managed.cancelRestart = null;
        if (managed.stopping !== null || managed.state !== 'restarting') return;
        this.spawn(managed, attempt + 1);
      });
      return;
    }
    managed.state = 'failed';
    managed.failureReason =
      policy.maxRestarts === 0 ? 'exited_without_restart_budget' : `restart_budget_exhausted (${policy.maxRestarts} in ${policy.windowMs}ms)`;
    this.pushLog(managed, 'supervisor', `failed: ${managed.failureReason}; no further spawn`);
  }

  private clearReadinessTimers(managed: Managed): void {
    managed.cancelProbe?.();
    managed.cancelProbe = null;
    managed.cancelDeadline?.();
    managed.cancelDeadline = null;
  }

  private pushLog(managed: Managed, stream: LogStream, text: string): void {
    managed.logSeq += 1;
    managed.logs.push({ seq: managed.logSeq, stream, text, at_ms: this.deps.scheduler.now() });
    if (managed.logs.length > LOG_RING_LINES) managed.logs.splice(0, managed.logs.length - LOG_RING_LINES);
  }

  private status(managed: Managed): WorkerStatus {
    return {
      worker_id: managed.launch.worker_id,
      state: managed.state,
      pid: managed.process?.pid ?? null,
      restarts: managed.restarts,
      readiness: { ...managed.readiness },
      last_exit: managed.lastExit,
      failure_reason: managed.failureReason,
    };
  }
}
