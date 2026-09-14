/**
 * Worker-supervisor CONTRACT (OMP→MAD Evolve Pack v0, Lane C, Founder act of
 * 2026-09-13). Adopts a contract, not OMP code.
 *
 * ADDITIVE. The Phase 1 C2 supervisor in `./index.ts` (the FDR-C C2 boundary
 * half, fixture-gated wiring under Room Runtime Phase 1) is not modified,
 * not imported here, and not re-exported from here. This file and its two
 * siblings (`contract-probes.ts`, `contract-stub.ts`) are pure contract +
 * a minimal stub that proves the contract is loadable and fails closed.
 *
 * READINESS is a conjunction: a worker is ready when its log has matched
 * the readiness regex AND its TCP port accepts a connection. Either alone
 * is `awaiting_readiness`. A worker that does not reach readiness within
 * the deadline is a failed start, never a "probably fine".
 *
 * RESTART is bounded: a policy declares `maxRestarts` within `windowMs`
 * and a deterministic exponential backoff (no jitter — replay must be
 * exact). A policy outside `RESTART_POLICY_BOUNDS` is refused at
 * construction; the supervisor never starts under a policy it cannot bound.
 *
 * STOP guarantees: SIGTERM, then SIGKILL after `graceMs`; `stop()` resolves
 * only after the exit was observed; a stopped worker is never restarted;
 * a second `stop()` joins the first.
 *
 * OPS SURFACE: `ps`, `logs`, `send`, `stop` — no more. `send` is refused
 * until readiness; every refusal names its reason.
 *
 * NON-GOALS (see the package README): not an OMP process-supervisor clone;
 * not the Phase 2 harness; not a production start path; no second daemon,
 * no broker socket file, no socket-path variable revival; no network
 * listener of its own.
 */

/* ------------------------------------------------------------------ */
/* Readiness                                                            */
/* ------------------------------------------------------------------ */

export interface LogReadinessSpec {
  readonly kind: 'log_regex';
  /** ECMAScript source, compiled once with the given flags plus `u`. */
  readonly pattern: string;
  readonly flags?: string;
}

export interface TcpReadinessSpec {
  readonly kind: 'tcp_port';
  /** Loopback only. A worker's readiness port is never remote. */
  readonly host: '127.0.0.1' | '::1';
  readonly port: number;
  readonly connectTimeoutMs: number;
}

/** Readiness = log-regex AND tcp port, within `deadlineMs` of spawn. */
export interface ReadinessSpec {
  readonly log: LogReadinessSpec;
  readonly tcp: TcpReadinessSpec;
  readonly deadlineMs: number;
  /** How often the TCP probe runs while awaiting readiness. */
  readonly probeIntervalMs: number;
}

export interface ReadinessProbeState {
  readonly log_matched: boolean;
  readonly tcp_accepting: boolean;
}

/** The conjunction, as one function so no caller can re-derive it as a disjunction. */
export function isReady(state: ReadinessProbeState): boolean {
  return state.log_matched && state.tcp_accepting;
}

export const READINESS_BOUNDS = {
  deadlineMs: { min: 100, max: 300_000 },
  probeIntervalMs: { min: 10, max: 10_000 },
  connectTimeoutMs: { min: 10, max: 30_000 },
  port: { min: 1, max: 65_535 },
  patternLength: { max: 512 },
} as const;

/* ------------------------------------------------------------------ */
/* Restart policy                                                       */
/* ------------------------------------------------------------------ */

export interface BackoffSpec {
  readonly initialMs: number;
  readonly multiplier: number;
  readonly maxMs: number;
}

export interface RestartPolicy {
  /** Restarts permitted within `windowMs`; 0 means never restart. */
  readonly maxRestarts: number;
  readonly windowMs: number;
  readonly backoff: BackoffSpec;
}

export const RESTART_POLICY_BOUNDS = {
  maxRestarts: { min: 0, max: 10 },
  windowMs: { min: 1_000, max: 3_600_000 },
  initialMs: { min: 100, max: 60_000 },
  multiplier: { min: 1, max: 4 },
  maxMs: { min: 100, max: 300_000 },
} as const;

/** The conservative default: never restart. A restart budget is opted into. */
export const NO_RESTART_POLICY: RestartPolicy = {
  maxRestarts: 0,
  windowMs: 60_000,
  backoff: { initialMs: 1_000, multiplier: 2, maxMs: 1_000 },
};

export interface PolicyDefect {
  readonly field: string;
  readonly message: string;
}

function inRange(value: unknown, range: { readonly min: number; readonly max: number }): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max;
}

/** Well-formedness and bounds of a restart policy. Empty means valid. */
export function validateRestartPolicy(policy: unknown): PolicyDefect[] {
  const defects: PolicyDefect[] = [];
  if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) {
    return [{ field: '', message: 'restart policy must be an object' }];
  }
  const p = policy as Record<string, unknown>;
  if (!inRange(p.maxRestarts, RESTART_POLICY_BOUNDS.maxRestarts) || !Number.isInteger(p.maxRestarts)) {
    defects.push({ field: 'maxRestarts', message: `must be an integer in [${RESTART_POLICY_BOUNDS.maxRestarts.min}, ${RESTART_POLICY_BOUNDS.maxRestarts.max}]` });
  }
  if (!inRange(p.windowMs, RESTART_POLICY_BOUNDS.windowMs)) {
    defects.push({ field: 'windowMs', message: `must be in [${RESTART_POLICY_BOUNDS.windowMs.min}, ${RESTART_POLICY_BOUNDS.windowMs.max}]` });
  }
  const backoff = p.backoff;
  if (typeof backoff !== 'object' || backoff === null) {
    defects.push({ field: 'backoff', message: 'must be { initialMs, multiplier, maxMs }' });
    return defects;
  }
  const b = backoff as Record<string, unknown>;
  if (!inRange(b.initialMs, RESTART_POLICY_BOUNDS.initialMs)) {
    defects.push({ field: 'backoff.initialMs', message: `must be in [${RESTART_POLICY_BOUNDS.initialMs.min}, ${RESTART_POLICY_BOUNDS.initialMs.max}]` });
  }
  if (!inRange(b.multiplier, RESTART_POLICY_BOUNDS.multiplier)) {
    defects.push({ field: 'backoff.multiplier', message: `must be in [${RESTART_POLICY_BOUNDS.multiplier.min}, ${RESTART_POLICY_BOUNDS.multiplier.max}]` });
  }
  if (!inRange(b.maxMs, RESTART_POLICY_BOUNDS.maxMs)) {
    defects.push({ field: 'backoff.maxMs', message: `must be in [${RESTART_POLICY_BOUNDS.maxMs.min}, ${RESTART_POLICY_BOUNDS.maxMs.max}]` });
  }
  if (inRange(b.initialMs, RESTART_POLICY_BOUNDS.initialMs) && inRange(b.maxMs, RESTART_POLICY_BOUNDS.maxMs) && b.initialMs > b.maxMs) {
    defects.push({ field: 'backoff', message: 'initialMs exceeds maxMs' });
  }
  for (const key of Object.keys(p)) {
    if (!['maxRestarts', 'windowMs', 'backoff'].includes(key)) {
      defects.push({ field: key, message: 'unknown policy field' });
    }
  }
  return defects;
}

/**
 * Deterministic backoff for restart attempt `attempt` (1-based):
 * min(initialMs × multiplier^(attempt−1), maxMs). No jitter, on purpose.
 */
export function computeBackoffMs(policy: RestartPolicy, attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new WorkerContractError('invalid_attempt', `attempt must be a positive integer, got ${String(attempt)}`);
  }
  const raw = policy.backoff.initialMs * policy.backoff.multiplier ** (attempt - 1);
  return Math.min(Math.round(raw), policy.backoff.maxMs);
}

/** Well-formedness and bounds of a readiness spec. Empty means valid. */
export function validateReadinessSpec(spec: unknown): PolicyDefect[] {
  const defects: PolicyDefect[] = [];
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    return [{ field: '', message: 'readiness spec must be an object' }];
  }
  const s = spec as Record<string, unknown>;
  const log = s.log as Record<string, unknown> | undefined;
  if (typeof log !== 'object' || log === null || log.kind !== 'log_regex' || typeof log.pattern !== 'string') {
    defects.push({ field: 'log', message: 'must be { kind: "log_regex", pattern }' });
  } else {
    if (log.pattern.length === 0 || log.pattern.length > READINESS_BOUNDS.patternLength.max) {
      defects.push({ field: 'log.pattern', message: `must be 1..${READINESS_BOUNDS.patternLength.max} characters` });
    } else {
      try {
        new RegExp(log.pattern, `${typeof log.flags === 'string' ? log.flags.replace('u', '') : ''}u`);
      } catch (error) {
        defects.push({ field: 'log.pattern', message: `does not compile: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
  }
  const tcp = s.tcp as Record<string, unknown> | undefined;
  if (typeof tcp !== 'object' || tcp === null || tcp.kind !== 'tcp_port') {
    defects.push({ field: 'tcp', message: 'must be { kind: "tcp_port", host, port, connectTimeoutMs }' });
  } else {
    if (tcp.host !== '127.0.0.1' && tcp.host !== '::1') {
      defects.push({ field: 'tcp.host', message: 'must be a loopback address' });
    }
    if (!inRange(tcp.port, READINESS_BOUNDS.port) || !Number.isInteger(tcp.port)) {
      defects.push({ field: 'tcp.port', message: 'must be an integer in [1, 65535]' });
    }
    if (!inRange(tcp.connectTimeoutMs, READINESS_BOUNDS.connectTimeoutMs)) {
      defects.push({ field: 'tcp.connectTimeoutMs', message: `must be in [${READINESS_BOUNDS.connectTimeoutMs.min}, ${READINESS_BOUNDS.connectTimeoutMs.max}]` });
    }
  }
  if (!inRange(s.deadlineMs, READINESS_BOUNDS.deadlineMs)) {
    defects.push({ field: 'deadlineMs', message: `must be in [${READINESS_BOUNDS.deadlineMs.min}, ${READINESS_BOUNDS.deadlineMs.max}]` });
  }
  if (!inRange(s.probeIntervalMs, READINESS_BOUNDS.probeIntervalMs)) {
    defects.push({ field: 'probeIntervalMs', message: `must be in [${READINESS_BOUNDS.probeIntervalMs.min}, ${READINESS_BOUNDS.probeIntervalMs.max}]` });
  }
  return defects;
}

/* ------------------------------------------------------------------ */
/* Ops surface                                                          */
/* ------------------------------------------------------------------ */

export type WorkerState =
  | 'spawning'
  | 'awaiting_readiness'
  | 'ready'
  | 'restarting'
  | 'stopping'
  | 'stopped'
  | 'failed';

export const WORKER_STATES: readonly WorkerState[] = [
  'spawning',
  'awaiting_readiness',
  'ready',
  'restarting',
  'stopping',
  'stopped',
  'failed',
] as const;

export interface ExitRecord {
  readonly code: number | null;
  readonly signal: string | null;
}

export interface WorkerStatus {
  readonly worker_id: string;
  readonly state: WorkerState;
  readonly pid: number | null;
  readonly restarts: number;
  readonly readiness: ReadinessProbeState;
  readonly last_exit: ExitRecord | null;
  readonly failure_reason: string | null;
}

export type LogStream = 'stdout' | 'stderr' | 'supervisor';

export interface LogLine {
  readonly seq: number;
  readonly stream: LogStream;
  readonly text: string;
  readonly at_ms: number;
}

export interface LogsQuery {
  readonly limit?: number;
  readonly afterSeq?: number;
}

export type SendRefusal = 'unknown_worker' | 'not_ready' | 'stopping' | 'frame_too_large' | 'write_failed';

export type SendResult =
  | { readonly ok: true; readonly bytes: number }
  | { readonly ok: false; readonly reason: SendRefusal };

export type StopResult =
  | { readonly ok: true; readonly exit: ExitRecord; readonly forced: boolean }
  | { readonly ok: false; readonly reason: 'unknown_worker' };

export interface StopOptions {
  /** Milliseconds between SIGTERM and SIGKILL. */
  readonly graceMs: number;
}

export const STOP_BOUNDS = { graceMs: { min: 0, max: 60_000 } } as const;

export const MAX_SEND_FRAME_BYTES = 1024 * 1024;
export const LOG_RING_LINES = 1_000;

/** The ops surface: exactly these four verbs. */
export interface WorkerOps {
  ps(): readonly WorkerStatus[];
  /** Throws `WorkerContractError('unknown_worker')` — logs of a worker that does not exist are not an empty list. */
  logs(workerId: string, query?: LogsQuery): readonly LogLine[];
  send(workerId: string, frame: Buffer | string): Promise<SendResult>;
  stop(workerId: string, options: StopOptions): Promise<StopResult>;
}

export type WorkerContractErrorCode =
  | 'unknown_worker'
  | 'invalid_policy'
  | 'invalid_readiness'
  | 'invalid_attempt'
  | 'invalid_grace'
  | 'duplicate_worker';

export class WorkerContractError extends Error {
  override readonly name = 'WorkerContractError';
  constructor(
    readonly code: WorkerContractErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Documented non-goals, carried as data so a test can assert the README states them. */
export const WORKER_SUPERVISOR_NON_GOALS: readonly string[] = [
  'not an OMP process-supervisor clone: the contract is adopted, no OMP code is vendored',
  'not the Phase 2 harness and not a Phase 2 claim',
  'not a production start path; the Phase 1 C2 supervisor in index.ts is untouched',
  'no second daemon, no broker socket file, no socket-path environment variable revival',
  'no network listener of its own: the TCP readiness probe connects to a loopback port the worker opened',
] as const;
