/**
 * AE-01 A2 — the controlled fixture acceptance Gateway for Founder
 * Acceptance Run 02 (Room Runtime Phase 1; final plan §7, §9–§16).
 *
 * CONTROLLED FIXTURE ACCEPTANCE — NOT PRODUCTION, NOT LIVE OCCUPANCY, NO
 * PROVIDER EXECUTION. This runner lets the Founder interact with the
 * already-landed Phase 1 runtime through its REAL Gateway-owned IPC boundary
 * inside a host-temporary root that is created fresh on every run and removed
 * on shutdown. It edits nothing under `packages/**`; it consumes the existing
 * daemon modules read-only.
 *
 * What is real: `GatewayDaemon` (which owns its `RoomRuntime` and
 * `IpcServer`), `Custody`, `ControlPlaneClient`, the daemon clock, and the
 * daemon's own `ipc.sock` under the temporary root.
 *
 * What is inert, by construction and by proof (T1–T18):
 *   - custody is `Custody` over exactly one `AcceptanceKeychainRunner`: reads
 *     answer "item not found", every write/delete/unknown command throws, and
 *     no external Keychain is ever touched;
 *   - the control-plane client is constructed with a dead-end loopback base
 *     URL and an injected `fetchImpl` that throws `network_forbidden` and
 *     counts invocations (required count through the whole run: 0);
 *   - `boot()` is permitted (it opens IPC); the heartbeat cadence is never
 *     started and no cadence iteration is ever driven, so the lanes never
 *     probe anything.
 *
 * Exactly one fixture room (`fixture-room`) with exactly two execution
 * identities (`slot-a`, `slot-b`) is created and occupied BEFORE IPC is
 * exposed. A synthetic text tick is emitted to both executions every
 * `FIXTURE_INTERVAL_MS` through `RoomRuntime.emitFixturePatch`.
 *
 * Lifecycle (final plan §15): SIGINT/SIGTERM → stop the output timer →
 * `daemon.stop()` → remove the session file if present → remove the
 * temporary root → exit 0. Cleanup is owned by exactly one idempotent
 * function, so a second signal during cleanup changes nothing. A failure
 * before READY takes the same cleanup path, prints the FAILED marker, and
 * exits non-zero. The runner never forces an exit: the exit code is published
 * only after every async cleanup step — `daemon.stop()` included — has
 * settled, and the process ends when its last handle closes.
 *
 * The runner reserves and prints a disposable session path under the
 * temporary root. It never creates, reads, or interprets that file — the TUI
 * (a read-only consumer at its observation pin) creates it on first use.
 *
 * Run 02 remains CLI-only: `rooms`, `join`, `follow`, `leave` and two-stream
 * observation are manual; input ownership and takeover are HARNESS ONLY.
 */

import type { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ControlPlaneClient,
  Custody,
  GatewayDaemon,
  ITEM_NOT_FOUND_EXIT,
  createDaemonClock,
  gatewayPaths,
  type CommandResult,
  type FetchLike,
  type GatewayDaemonDeps,
  type GatewayPaths,
  type KeychainRunner,
  type RoomRuntime,
} from '../../packages/gateway-daemon/src/index.js';

// ---------------------------------------------------------------------------
// Fixed identities (final plan §5, §9, §10)
// ---------------------------------------------------------------------------

export const FIXTURE_ROOM_ID = 'fixture-room';
export const FIXTURE_EXECUTION_IDS = ['slot-a', 'slot-b'] as const;
/** Synthetic-output cadence, fixed (final plan §10). */
export const FIXTURE_INTERVAL_MS = 500;
/** `mkdtemp(join(os.tmpdir(), TEMP_ROOT_PREFIX))` — one fresh root per run. */
export const TEMP_ROOT_PREFIX = 'gateway-ae01-';
/** The disposable TUI session path, reserved under the temporary root. */
export const SESSION_FILE_NAME = 'tui-session.json';
/** Dead-end loopback base URL: nothing listens, and the injected fetch never sends. */
export const DEAD_END_CONTROL_PLANE_URL = 'http://127.0.0.1:9';
/**
 * Any positive integer satisfies `GatewayDaemonDeps`; the value is inert
 * because the cadence is never started (final plan §7).
 */
export const INERT_HEARTBEAT_CADENCE_MS = 10_000;

export const NETWORK_FORBIDDEN = 'network_forbidden';
export const READY_MARKER = 'STATUS: READY';
export const FAILED_MARKER = 'CONTROLLED FIXTURE ACCEPTANCE — FAILED';

// ---------------------------------------------------------------------------
// Network: forbidden, counted (final plan §5, §9; T6)
// ---------------------------------------------------------------------------

export class NetworkForbiddenError extends Error {
  override readonly name = 'NetworkForbiddenError';
  readonly code = NETWORK_FORBIDDEN;
  constructor() {
    super(NETWORK_FORBIDDEN);
  }
}

export interface ForbiddenFetch {
  /** Injected into the REAL `ControlPlaneClient`; throws on every call. */
  readonly fetchImpl: FetchLike;
  /** Attempts so far. Required to remain 0 through the whole acceptance run. */
  invocations(): number;
}

export function createForbiddenFetch(): ForbiddenFetch {
  let count = 0;
  const fetchImpl: FetchLike = () => {
    count += 1;
    return Promise.reject(new NetworkForbiddenError());
  };
  return { fetchImpl, invocations: () => count };
}

// ---------------------------------------------------------------------------
// Custody: inert Keychain runner (final plan §9; T3–T5)
// ---------------------------------------------------------------------------

export class AcceptanceCustodyRefused extends Error {
  override readonly name = 'AcceptanceCustodyRefused';
  readonly code = 'acceptance_custody_refused';
  constructor(shape: string) {
    super(`acceptance custody refused: ${shape}`);
  }
}

/**
 * The only `KeychainRunner` the acceptance Gateway constructs. Reads answer
 * ITEM_NOT_FOUND (exit 44) so the daemon boots without any identity; every
 * write, delete, or unknown command shape throws before anything external
 * could happen.
 *
 * Two families of counters, deliberately separate: `reads`/`writes`/`deletes`
 * count COMPLETED operations (writes and deletes can only ever be 0);
 * `attempted*` count refused attempts, so a proof can show both that an
 * attempt was made and that nothing completed.
 */
export class AcceptanceKeychainRunner implements KeychainRunner {
  reads = 0;
  writes = 0;
  deletes = 0;
  attemptedWrites = 0;
  attemptedDeletes = 0;
  attemptedUnknown = 0;

  run(args: readonly string[], stdin?: string): Promise<CommandResult> {
    const command = args[0];
    if (command === 'find-generic-password') {
      this.reads += 1;
      return Promise.resolve({ code: ITEM_NOT_FOUND_EXIT, stdout: '', stderr: 'acceptance custody: no item' });
    }
    if (command === 'add-generic-password') {
      this.attemptedWrites += 1;
      // A secret offered on stdin is discarded unread; only the fact that one
      // was offered is recorded, never its bytes.
      return Promise.reject(new AcceptanceCustodyRefused(stdin === undefined ? 'write' : 'write (secret offered, discarded)'));
    }
    if (command === 'delete-generic-password') {
      this.attemptedDeletes += 1;
      return Promise.reject(new AcceptanceCustodyRefused('delete'));
    }
    this.attemptedUnknown += 1;
    return Promise.reject(new AcceptanceCustodyRefused(`unknown command shape ${JSON.stringify(command ?? null)}`));
  }
}

// ---------------------------------------------------------------------------
// Dependencies (final plan §7)
// ---------------------------------------------------------------------------

export interface AcceptanceDeps extends GatewayDaemonDeps {
  /** The one runner custody drives; exposed so proofs can read its counters. */
  readonly keychain: AcceptanceKeychainRunner;
  readonly network: ForbiddenFetch;
}

export function buildAcceptanceDeps(tempRoot: string): AcceptanceDeps {
  const keychain = new AcceptanceKeychainRunner();
  const network = createForbiddenFetch();
  return {
    paths: gatewayPaths(tempRoot),
    clock: createDaemonClock(),
    custody: new Custody(keychain),
    client: new ControlPlaneClient(DEAD_END_CONTROL_PLANE_URL, network.fetchImpl),
    heartbeatCadenceMs: INERT_HEARTBEAT_CADENCE_MS,
    keychain,
    network,
  };
}

export function createTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), TEMP_ROOT_PREFIX));
}

// ---------------------------------------------------------------------------
// Fixture output (final plan §10, §11 step 6; T12)
// ---------------------------------------------------------------------------

/** `slot-a fixture tick 0001` — zero-padded four-digit sequence numbers. */
export function fixtureTickText(executionId: string, sequence: number): string {
  return `${executionId} fixture tick ${String(sequence).padStart(4, '0')}`;
}

export interface FixtureOutput {
  /** Intervals emitted so far (each interval emits slot-a then slot-b). */
  ticks(): number;
  halt(): void;
}

/**
 * Emit one tick to each execution, slot-a then slot-b, every `intervalMs`.
 * The source never blocks on a viewer: `emitFixturePatch` fans out to bounded
 * per-viewer queues and disconnects an overflowing viewer on its own. An
 * emission failure (a stream that is no longer RUNNING) halts the timer and
 * is reported to the caller, never swallowed.
 */
export function beginFixtureOutput(
  rooms: RoomRuntime,
  onError: (error: unknown) => void,
  roomId: string = FIXTURE_ROOM_ID,
  intervalMs: number = FIXTURE_INTERVAL_MS,
): FixtureOutput {
  let sequence = 0;
  const timer = setInterval(() => {
    sequence += 1;
    try {
      for (const executionId of FIXTURE_EXECUTION_IDS) {
        rooms.emitFixturePatch(roomId, executionId, fixtureTickText(executionId, sequence));
      }
    } catch (error) {
      clearInterval(timer);
      onError(error);
    }
  }, intervalMs);
  return {
    ticks: () => sequence,
    halt: () => clearInterval(timer),
  };
}

// ---------------------------------------------------------------------------
// The acceptance Gateway (final plan §11 steps 1–5)
// ---------------------------------------------------------------------------

export interface AcceptanceGateway {
  readonly tempRoot: string;
  readonly paths: GatewayPaths;
  /** Reserved and printed; never created or read by the runner. */
  readonly sessionPath: string;
  readonly deps: AcceptanceDeps;
  /** The REAL daemon: owns the RoomRuntime and the IpcServer. */
  readonly daemon: GatewayDaemon;
  /** `daemon.boot()`: persisted state (none), custody (inert), then IPC opens. */
  boot(): Promise<void>;
  isBooted(): boolean;
}

/**
 * Construct the Gateway over a fresh temporary root, and create + occupy the
 * fixture room BEFORE anything can expose IPC. Booting is a separate step so
 * a proof can observe the room without a socket.
 *
 * Exactly one room with exactly two execution identities: `createFixtureRoom`
 * registers `slot-a` and `slot-b` and a third registration is a stop-class
 * `ExecutionCardinalityError` (harness only; never a projector operation).
 */
export async function createAcceptanceGateway(tempRoot?: string): Promise<AcceptanceGateway> {
  const root = tempRoot ?? (await createTempRoot());
  const deps = buildAcceptanceDeps(root);
  const daemon = new GatewayDaemon(deps);
  daemon.rooms.createFixtureRoom(FIXTURE_ROOM_ID);
  daemon.rooms.occupyFixtureRoom(FIXTURE_ROOM_ID);
  let booted = false;
  return {
    tempRoot: root,
    paths: deps.paths,
    sessionPath: join(root, SESSION_FILE_NAME),
    deps,
    daemon,
    boot: async () => {
      await daemon.boot();
      booted = true;
    },
    isBooted: () => booted,
  };
}

// ---------------------------------------------------------------------------
// Observability (final plan §16)
// ---------------------------------------------------------------------------

export function renderReadyBlock(gateway: AcceptanceGateway): string {
  return [
    'CONTROLLED FIXTURE ACCEPTANCE',
    'NOT PRODUCTION',
    'NOT LIVE OCCUPANCY',
    'NO PROVIDER EXECUTION',
    '',
    READY_MARKER,
    `ROOM: ${FIXTURE_ROOM_ID}`,
    `EXECUTION 1: ${FIXTURE_EXECUTION_IDS[0]}`,
    `EXECUTION 2: ${FIXTURE_EXECUTION_IDS[1]}`,
    `SOCKET: ${gateway.paths.socketPath}`,
    `SESSION: ${gateway.sessionPath}`,
  ].join('\n');
}

/** Literal Run 02 commands with explicit `--socket` and `--session` (never a default path). */
export function renderCommandExamples(gateway: AcceptanceGateway): string {
  const target = `--socket ${gateway.paths.socketPath} --session ${gateway.sessionPath}`;
  return [
    'FOUNDER ACCEPTANCE RUN 02 (CLI-only: rooms, join, follow, leave and two-stream observation are manual;',
    'input ownership and takeover are HARNESS ONLY):',
    `  madv-tui rooms --json ${target}`,
    `  madv-tui join --room ${FIXTURE_ROOM_ID} ${target}`,
    `  madv-tui follow --json ${target}`,
    `  madv-tui leave ${target}`,
    'Stop this runner with Ctrl-C (SIGINT) or SIGTERM; the temporary root is removed on exit.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Lifecycle (final plan §15; T13–T16)
// ---------------------------------------------------------------------------

export interface RunOptions {
  readonly stdout?: (text: string) => void;
  readonly stderr?: (text: string) => void;
  /** Where SIGINT/SIGTERM arrive; `process` in the real runner. */
  readonly signals?: EventEmitter;
  /**
   * Called exactly once, after cleanup has fully settled. The real runner
   * publishes `process.exitCode` and lets the loop drain; it never forces
   * an exit.
   */
  readonly exit?: (code: number) => void;
  /** An already-constructed Gateway (proof injection); otherwise one is created. */
  readonly gateway?: AcceptanceGateway;
}

export interface RunHandle {
  /** Resolves once the READY block has been printed; rejects on a failure before READY. */
  readonly ready: Promise<AcceptanceGateway>;
  /** The exit code, after cleanup has settled and `exit` has been called. */
  readonly done: Promise<number>;
  /** How many times the one cleanup function actually ran its body (0 or 1). */
  cleanupRuns(): number;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runAcceptance(options: RunOptions = {}): RunHandle {
  const stdout = options.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
  const signals: EventEmitter = options.signals ?? process;
  const exit =
    options.exit ??
    ((code: number) => {
      process.exitCode = code;
    });

  let gateway: AcceptanceGateway | null = options.gateway ?? null;
  let output: FixtureOutput | null = null;
  let cleanupPromise: Promise<void> | null = null;
  let cleanupRuns = 0;
  let failure: unknown = null;

  let resolveReady!: (gateway: AcceptanceGateway) => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<AcceptanceGateway>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });
  ready.catch(() => undefined); // a failure is reported on stderr; callers observe `ready` if they care

  let resolveStopped!: () => void;
  const stopped = new Promise<void>((res) => {
    resolveStopped = res;
  });

  const onSignal = (): void => {
    resolveStopped();
  };

  /**
   * THE cleanup: idempotent and owned here alone. A second signal, a failure,
   * and the normal path all join the same promise; nothing ever runs a second
   * `daemon.stop()` or a second removal sequence.
   */
  const cleanup = (): Promise<void> => {
    if (cleanupPromise !== null) return cleanupPromise;
    cleanupPromise = (async () => {
      cleanupRuns += 1;
      output?.halt();
      output = null;
      if (gateway !== null && gateway.isBooted()) await gateway.daemon.stop();
      if (gateway !== null) {
        await rm(gateway.sessionPath, { force: true });
        await rm(gateway.tempRoot, { recursive: true, force: true });
      }
      signals.off('SIGINT', onSignal);
      signals.off('SIGTERM', onSignal);
    })();
    return cleanupPromise;
  };

  const fail = (error: unknown): void => {
    if (failure === null) failure = error;
    resolveStopped();
  };

  signals.on('SIGINT', onSignal);
  signals.on('SIGTERM', onSignal);

  const done = (async (): Promise<number> => {
    try {
      if (gateway === null) gateway = await createAcceptanceGateway();
      await gateway.boot();
      if (existsSync(gateway.sessionPath)) {
        // Reserved, never clobbered: a file already at the printed path is a startup failure.
        throw new Error(`session path already exists: ${gateway.sessionPath}`);
      }
      output = beginFixtureOutput(gateway.daemon.rooms, fail);
      stdout(`${renderReadyBlock(gateway)}\n\n${renderCommandExamples(gateway)}\n`);
      resolveReady(gateway);
    } catch (error) {
      fail(error);
    }
    await stopped;
    let code = failure === null ? 0 : 1;
    if (failure !== null) {
      stderr(`${FAILED_MARKER}\nreason: ${describe(failure)}\n`);
      rejectReady(failure);
    }
    try {
      await cleanup();
      stderr('acceptance: cleanup settled (output stopped, daemon stopped, temporary root removed)\n');
    } catch (error) {
      code = 1;
      stderr(`acceptance: cleanup failed: ${describe(error)}\n`);
    }
    // Only after every async step above has settled is the exit code published.
    exit(code);
    return code;
  })();

  return { ready, done, cleanupRuns: () => cleanupRuns };
}

// ---------------------------------------------------------------------------
// Executable entry: `npm run phase1:fixture`
// ---------------------------------------------------------------------------

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (invokedDirectly) {
  runAcceptance();
}
