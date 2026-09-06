// packages/worker-supervisor/src/index.ts
//
// BOUNDED PREREQUISITE-C REMEDIATION IMPLEMENTATION — NOT WIRED TO
// PRODUCTION GATEWAY.
//
// Authorized by the Founder-confirmed R4 changed-path manifest
// (2026-09-04) under the Prerequisite C remediation commission. This
// package is a bounded proof implementation of the Gateway half of the
// FDR-C C2 boundary:
//
//   COHESIVE SOCKETLESS SUPERVISED BUN BROKER/LEDGER WORKER
//
// It is NOT imported by gateway-daemon or any production path, it mints
// no authority, and it authorizes no Phase 1 functionality.
//
// TRANSPORT — truthful characterization per the Founder clarification
// (SHA 6a5dd5aeee056deb18c4ea49912565b9fd5d5063402f166dce2e2adbf8ed0f43):
//
//   Node child_process.spawn stdio 'pipe' channels are, on the measured
//   Unix/macOS runtime, unnamed AF_UNIX / SOCK_STREAM socketpair
//   descriptors created internally by Node/libuv. The two endpoints of
//   each channel are created connected to each other. They are unnamed:
//   no filesystem path, no bind(), no listen()/accept(), no TCP, not
//   independently addressable by pathname/host/port. Custody is by
//   inherited private descriptors only, subordinate to Gateway lifetime.
//
//   This implementation uses ONLY child_process.spawn stdio channels
//   (child fds 3/4/5). It never calls node:net, never creates a
//   filesystem Unix socket, never binds or listens, never uses the Node
//   child 'ipc' channel, and never creates broker.sock. The descriptors
//   are reported truthfully as AF_UNIX / SOCK_STREAM socketpairs, not as
//   pipe(2) or FIFO.
//
// CHANNELS (child-side fd numbers; parent holds the opposite ends):
//
//   fd 3  Gateway -> Worker  control + request frames. The Gateway holds
//                            the SOLE parent-side descriptor ownership of
//                            this channel (sole control-write capability).
//   fd 4  Worker -> Gateway  framed responses.
//   fd 5  Worker -> Gateway  scrubbed diagnostics (collected; never payloads).
//
// FRAMING: 4-byte big-endian unsigned length prefix + UTF-8 JSON payload.
//
// AUTHORITY (unchanged by transport choice): the Gateway alone owns
// generation/fencing, duplicate-worker prevention, stale-worker
// rejection, supervision, and fail-closed decisions. The Worker
// generation value minted here is an OPAQUE CORRELATION VALUE: the
// worker echoes it in responses; it carries no authority semantics.
//
// CREDENTIAL BOUNDARY: WORKER CREDENTIAL ACCESS: NONE. The worker's
// environment carries exactly one variable (PREREQC_WORKER_DB_PATH). No
// provider credential or Founder secret enters argv, environment,
// frames, logs, or persistence.
//
// DEPENDENCY TRUTHFULNESS: this file imports ONLY node: builtins.
// Per the Founder workspace/lockfile ruling (2026-09-05) the package
// manifest for this bounded proof tranche is WITHDRAWN: this directory
// is NOT an npm workspace member, holds no package identity, and
// requires no lockfile change. The module is consumed only through the
// root tsconfig include and a bounded relative-source import. Any
// future production package identity requires separate authorization.

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Explicit bounded input: the Worker executable/entrypoint is supplied by
 *  the caller. This module hard-codes NO filesystem paths. */
export interface WorkerLaunchDescriptor {
  /** Absolute path to the Bun executable (proof runtime). */
  readonly bunExecutable: string;
  /** Absolute path to the bounded C2 Worker entrypoint (.ts run by Bun). */
  readonly workerEntrypoint: string;
  /** Durable store path; Gateway owns the custody policy for this file. */
  readonly dbPath: string;
}

export interface SupervisorOptions {
  /** Gateway-owned occupancy key for duplicate-worker prevention. */
  readonly occupancyKey: string;
  readonly launch: WorkerLaunchDescriptor;
  /** Request timeout (ms); fail closed on expiry. Default 10_000. */
  readonly requestTimeoutMs?: number;
}

export interface C2Error {
  readonly code: string;
  readonly message: string;
}

export interface WorkerResponseFrame {
  readonly ok: boolean;
  readonly id: number | null;
  readonly generation: string | null;
  readonly result?: unknown;
  readonly error?: C2Error;
}

export type SupervisorState =
  | 'idle' // constructed, not started
  | 'starting' // spawn + handshake in flight
  | 'active' // handshake complete; requests permitted
  | 'shutting-down' // graceful shutdown in flight
  | 'lost' // worker exited unexpectedly; fail-closed
  | 'disposed'; // terminal

export class C2SupervisorError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'C2SupervisorError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Gateway-owned occupancy registry (duplicate-worker prevention).
//
// The registry is Gateway-side state. The Worker never sees it, never
// votes on it, and never determines which generation is authoritative.
// ---------------------------------------------------------------------------

const OCCUPANCY_REGISTRY = new Map<string, C2WorkerSupervisor>();

// ---------------------------------------------------------------------------
// Framing codec (self-contained; no external dependency)
// ---------------------------------------------------------------------------

const MAX_FRAME_BYTES = 1024 * 1024;

export function encodeFrame(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const out = Buffer.alloc(4 + body.byteLength);
  out.writeUInt32BE(body.byteLength, 0);
  body.copy(out, 4);
  return out;
}

interface FrameDecodeStep {
  readonly frames: Buffer[];
  readonly rest: Buffer;
  /** True when a frame violates the contract (length bounds). */
  readonly broken: boolean;
}

export function decodeFrames(buffer: Buffer): FrameDecodeStep {
  const frames: Buffer[] = [];
  let rest = buffer;
  for (;;) {
    if (rest.byteLength < 4) return { frames, rest, broken: false };
    const length = rest.readUInt32BE(0);
    if (length === 0 || length > MAX_FRAME_BYTES) {
      return { frames, rest, broken: true };
    }
    if (rest.byteLength < 4 + length) return { frames, rest, broken: false };
    frames.push(Buffer.from(rest.subarray(4, 4 + length)));
    rest = Buffer.from(rest.subarray(4 + length));
  }
}

// ---------------------------------------------------------------------------
// Supervisor
// ---------------------------------------------------------------------------

interface PendingRequest {
  readonly op: string;
  readonly resolve: (frame: WorkerResponseFrame) => void;
  readonly reject: (err: C2SupervisorError) => void;
  readonly timer: NodeJS.Timeout;
}

export class C2WorkerSupervisor extends EventEmitter {
  readonly occupancyKey: string;
  private readonly launch: WorkerLaunchDescriptor;
  private readonly requestTimeoutMs: number;

  private child: ChildProcess | null = null;
  private control: Writable | null = null;
  private responseBuffer: Buffer = Buffer.alloc(0);
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private generation: string | null = null;
  private diagChunks: Buffer[] = [];
  private state: SupervisorState = 'idle';

  constructor(options: SupervisorOptions) {
    super();
    this.occupancyKey = options.occupancyKey;
    this.launch = options.launch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  }

  /** Current Gateway-minted opaque generation (correlation only). */
  currentGeneration(): string | null {
    return this.generation;
  }

  currentState(): SupervisorState {
    return this.state;
  }

  workerPid(): number | null {
    const pid = this.child?.pid;
    return typeof pid === 'number' ? pid : null;
  }

  /** Scrubbed diagnostic lines collected from the worker (fd 5). */
  diagnostics(): string {
    return Buffer.concat(this.diagChunks).toString('utf8');
  }

  // -------------------------------------------------------------------------
  // Lifecycle (Gateway-owned)
  // -------------------------------------------------------------------------

  /**
   * Spawn the bounded Bun worker over child_process stdio channels and
   * complete the hello handshake. Fails closed on duplicate occupancy,
   * spawn failure, handshake failure, or transport loss.
   */
  async start(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'lost') {
      throw new C2SupervisorError(
        'supervisor_state_invalid',
        `cannot start from state ${this.state}`,
      );
    }
    const incumbent = OCCUPANCY_REGISTRY.get(this.occupancyKey);
    if (incumbent !== undefined && incumbent !== this && incumbent.currentState() !== 'disposed') {
      // Gateway-side duplicate-worker prevention: a second worker for the
      // same governed occupancy is refused fail-closed. The Worker never
      // participates in this decision.
      throw new C2SupervisorError(
        'duplicate_worker',
        `occupancy ${this.occupancyKey} already has an active worker supervisor`,
      );
    }

    this.state = 'starting';
    this.generation = `gen-${randomUUID()}`;
    this.diagChunks = [];
    this.responseBuffer = Buffer.alloc(0);

    const child = spawn(
      this.launch.bunExecutable,
      [this.launch.workerEntrypoint],
      {
        // fd 0/1/2 not inherited. fd 3 control+request (Gateway sole
        // writer), fd 4 responses, fd 5 diagnostics. Unix/macOS
        // implementation: unnamed AF_UNIX SOCK_STREAM socketpair
        // descriptors created internally by Node/libuv.
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
        // Credential boundary: the worker environment carries exactly one
        // variable. Nothing else from the Gateway environment is
        // inherited by the worker.
        env: { PREREQC_WORKER_DB_PATH: this.launch.dbPath },
      },
    );
    this.child = child;

    const stdio = child.stdio as ReadonlyArray<Readable | Writable | null | undefined>;
    const control = stdio[3];
    const response = stdio[4];
    const diag = stdio[5];
    if (
      control === undefined ||
      control === null ||
      response === undefined ||
      response === null ||
      diag === undefined ||
      diag === null ||
      typeof control === 'number'
    ) {
      this.failAllPending('transport_invalid', 'stdio channels 3/4/5 not established');
      child.kill('SIGKILL');
      this.state = 'lost';
      throw new C2SupervisorError('transport_invalid', 'stdio channels 3/4/5 not established');
    }
    // fd 3 is the Gateway's control/request channel: writable parent-side.
    this.control = control as Writable;

    response.on('data', (chunk: Buffer) => this.onResponseChunk(chunk));
    diag.on('data', (chunk: Buffer) => this.diagChunks.push(chunk));

    const lostBeforeHandshake = new Promise<never>((_, reject) => {
      child.once('exit', (code, signal) => {
        reject(
          new C2SupervisorError(
            'worker_lost',
            `worker exited before handshake (code=${String(code)} signal=${String(signal)})`,
          ),
        );
      });
    });

    try {
      const hello = await Promise.race([
        this.request('hello', { generation: this.generation }),
        lostBeforeHandshake,
      ]);
      if (!hello.ok) {
        throw new C2SupervisorError(
          hello.error?.code ?? 'handshake_failed',
          hello.error?.message ?? 'handshake rejected by worker',
        );
      }
    } catch (err) {
      this.state = 'lost';
      control.destroy();
      throw err instanceof C2SupervisorError
        ? err
        : new C2SupervisorError('handshake_failed', err instanceof Error ? err.message : String(err));
    }

    child.on('exit', (code, signal) => this.onChildExit(code, signal));

    OCCUPANCY_REGISTRY.set(this.occupancyKey, this);
    this.state = 'active';
    this.emit('worker-active', { pid: this.workerPid(), generation: this.generation });
  }

  /**
   * Re-establish after loss with a FRESH Gateway-minted generation. The
   * old generation is permanently invalid; any response carrying it is
   * rejected as stale by the correlation check in onResponseChunk.
   */
  async restart(): Promise<void> {
    if (this.state !== 'lost') {
      throw new C2SupervisorError(
        'supervisor_state_invalid',
        `cannot restart from state ${this.state}`,
      );
    }
    this.state = 'idle';
    await this.start();
  }

  /**
   * Gateway-controlled normal shutdown: send the worker `shutdown`, await
   * its acknowledgement, then await process exit (reap). Returns the exit
   * code. Fails closed if the worker does not exit within the timeout.
   */
  async shutdown(): Promise<number> {
    if (this.state !== 'active') {
      throw new C2SupervisorError(
        'supervisor_state_invalid',
        `cannot shut down from state ${this.state}`,
      );
    }
    this.state = 'shutting-down';
    try {
      await this.request('shutdown', {});
    } catch {
      // The worker may exit as part of acknowledging; transport loss here
      // is expected on the shutdown path. Exit observation below decides.
    }
    return await this.awaitExit(this.requestTimeoutMs);
  }

  /** Terminate the worker with a signal (proof of fail-closed detection). */
  killWorker(signal: NodeJS.Signals): void {
    this.child?.kill(signal);
  }

  /** Terminal: destroy transport, release the occupancy registration. */
  dispose(): void {
    if (this.state === 'disposed') return;
    this.failAllPending('supervisor_disposed', 'supervisor disposed');
    this.control?.destroy();
    const child = this.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    if (OCCUPANCY_REGISTRY.get(this.occupancyKey) === this) {
      OCCUPANCY_REGISTRY.delete(this.occupancyKey);
    }
    this.state = 'disposed';
  }

  // -------------------------------------------------------------------------
  // Requests (Gateway-owned correlation + fencing checks)
  // -------------------------------------------------------------------------

  request(op: string, params: Record<string, unknown>): Promise<WorkerResponseFrame> {
    if (this.state !== 'active' && this.state !== 'starting' && this.state !== 'shutting-down') {
      return Promise.reject(
        new C2SupervisorError('supervisor_state_invalid', `cannot request in state ${this.state}`),
      );
    }
    if (this.control === null) {
      return Promise.reject(new C2SupervisorError('transport_invalid', 'no control channel'));
    }
    const id = this.nextId++;
    const frame = encodeFrame({ id, op, params });
    return new Promise<WorkerResponseFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new C2SupervisorError('request_timeout', `request ${op}#${id} timed out`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { op, resolve, reject, timer });
      this.control?.write(frame, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new C2SupervisorError('transport_write_failed', err.message));
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // Proof hooks (bounded; mint no authority; used only by the B5 suite)
  // -------------------------------------------------------------------------

  /**
   * BOUNDED PROOF HOOK: write raw bytes to the control channel without
   * framing. Used by the remediation suite to prove broken-transport
   * fail-closed behavior. Not a production capability.
   */
  sendRawControlFrame(bytes: Buffer): void {
    if (this.control === null) {
      throw new C2SupervisorError('transport_invalid', 'no control channel');
    }
    this.control.write(bytes);
  }

  /**
   * BOUNDED PROOF HOOK: route a forged response frame through the REAL
   * response decode + correlation + generation-fencing path. Used to
   * prove stale-generation rejection without requiring a live stale
   * worker. Returns the outcome observed on the real path.
   */
  ingestForgedResponseFrameForProof(frame: Buffer): void {
    this.onResponseChunk(frame);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private onResponseChunk(chunk: Buffer): void {
    this.responseBuffer = Buffer.concat([this.responseBuffer, chunk]);
    const { frames, rest, broken } = decodeFrames(this.responseBuffer);
    this.responseBuffer = rest;
    if (broken) {
      // Broken response framing: fail closed. Reject everything in flight.
      this.failAllPending('transport_broken', 'response framing violated');
      this.emit('transport-broken');
      this.child?.kill('SIGKILL');
      return;
    }
    for (const body of frames) {
      let parsed: WorkerResponseFrame;
      try {
        parsed = JSON.parse(body.toString('utf8')) as WorkerResponseFrame;
      } catch {
        this.failAllPending('transport_broken', 'undecodable response frame');
        this.emit('transport-broken');
        this.child?.kill('SIGKILL');
        return;
      }
      this.dispatchResponse(parsed);
    }
  }

  private dispatchResponse(frame: WorkerResponseFrame): void {
    const id = frame.id;
    if (typeof id !== 'number') {
      this.emit('unexpected-frame', frame);
      return;
    }
    const pending = this.pending.get(id);
    if (pending === undefined) {
      // No outstanding request for this id: stale or forged. Never honor.
      this.emit('unexpected-frame', frame);
      return;
    }
    // Gateway-owned fencing check: the response must carry the CURRENT
    // Gateway-minted generation. A response from any other generation is
    // stale (or forged) and is rejected fail-closed. The Worker does not
    // determine generation authority; this check is Gateway-side.
    if (frame.generation !== this.generation) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(
        new C2SupervisorError(
          'stale_generation',
          `response generation ${String(frame.generation)} does not match current ${String(this.generation)}`,
        ),
      );
      this.emit('stale-generation', {
        expected: this.generation,
        observed: frame.generation,
      });
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(frame);
  }

  private onChildExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.state === 'disposed') return;
    const wasShutdown = this.state === 'shutting-down';
    this.state = 'lost';
    this.failAllPending(
      'worker_lost',
      `worker exited (code=${String(code)} signal=${String(signal)})`,
    );
    this.emit('worker-exit', { code, signal, graceful: wasShutdown });
    if (!wasShutdown) {
      // Unexpected worker loss is surfaced; no silent success, no
      // authority expansion. Restart is a separate Gateway decision.
      this.emit('worker-lost', { code, signal });
    }
  }

  private failAllPending(code: string, message: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(new C2SupervisorError(code, message));
    }
  }

  private awaitExit(timeoutMs: number): Promise<number> {
    const child = this.child;
    if (child === null) {
      return Promise.reject(new C2SupervisorError('transport_invalid', 'no worker process'));
    }
    if (child.exitCode !== null) return Promise.resolve(child.exitCode);
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new C2SupervisorError('reap_timeout', 'worker did not exit within timeout'));
      }, timeoutMs);
      child.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code ?? -1);
      });
    });
  }
}
