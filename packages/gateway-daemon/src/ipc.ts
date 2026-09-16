/**
 * The daemon's IPC socket (contract §15, §16; Room Runtime Phase 1 adds IPC v2).
 *
 * A unix domain socket under the 0700 gateway directory. This is the
 * EXISTING gateway IPC path (`ipc.sock`, paths.ts) — Phase 1 adds no second
 * daemon, no `broker.sock`, no `MADV_SOCKET_PATH`, no TCP listener, and no
 * new named endpoint (r3 §16 stops 4–7; r4 §9 Phase 1 failure column).
 *
 * TWO FAMILIES ON THE SAME PATH, NEVER MIXED AFTER HELLO (r4 §7.7):
 *
 *  - IPC v1 — newline-delimited JSON, ops `status|tail`, 64 KiB request cap,
 *    classified ring. PRESERVED UNCHANGED (AT-R4-31; stop condition 13).
 *    Nothing in the v2 path alters a v1 answer.
 *  - IPC v2 — a connection whose FIRST frame is a structurally valid v2
 *    Hello (`[u32be length][u8 type][payload]`, type 0x01, op `Hello`)
 *    switches that connection to the length-prefixed mux for its lifetime.
 *    Unsupported `ipc_version` → `{"error":"ipc_version_unsupported",
 *    "supported":[1,2]}` then close (AT-R4-32). A first frame that is not a
 *    v2 Hello is treated as v1 bytes, exactly as before.
 *
 * v1 remains read-only (`status`, `tail`). v2 adds the projector attach
 * family (`join/leave/follow/rooms` semantics via JoinRoom/LeaveRoom/
 * FollowRoom) served by the RoomRuntime; the Gateway remains the sole
 * authority — a projector mints nothing (r4 §7.15, AT-R4-16).
 */

import { createServer, type Server, type Socket } from 'node:net';
import { chmod, mkdir, unlink } from 'node:fs/promises';
import { setImmediate } from 'node:timers';
import { DIRECTORY_MODE, FILE_MODE, type GatewayPaths } from './paths.js';
import type { RingBuffer } from './ring-buffer.js';
import {
  FRAME_TYPE_CONTROL,
  IPC_V2_VERSION,
  MAX_V2_FRAME_BYTES,
  SUPPORTED_IPC_VERSIONS,
  decodeV2Frames,
  encodeV2Frame,
  isProjectorForbiddenOp,
  looksLikeV2Hello,
  parseControlPayload,
  type DisconnectReason,
  type V2Frame,
} from '../../gateway-protocol/src/ipc-v2.js';
import {
  RoomRuntime,
  RoomRuntimeError,
  VIEWER_QUEUE_FRAMES,
  type OutFrame,
  type RoomResult,
} from './room-runtime.js';

export interface IpcStatus {
  readonly primary: Record<string, unknown>;
  readonly staging: Record<string, unknown>;
}

export interface IpcHandlers {
  status(): IpcStatus;
  ring(): RingBuffer;
  /**
   * The Phase 1 room runtime. Optional so every existing v1-only caller and
   * suite constructs the server unchanged; when absent, v2 Hellos are refused
   * fail-closed (`internal_error`) rather than half-served.
   */
  rooms?(): RoomRuntime;
  /**
   * R5 §7 — the RoomRuntime's fan-out notification. Invoked after each
   * enqueue-relevant mutation; the adapter schedules coalesced, token-guarded
   * delivery. The runtime never owns sockets or timers.
   */
  onRoomEvent?(roomId: string): void;
}

export type IpcRequest = { readonly op: 'status' } | { readonly op: 'tail'; readonly limit?: number };

/**
 * §16 — the socket is untrusted input. A peer that writes past this bound
 * without a newline is refused before its bytes are ever parsed; the handler's
 * memory cannot grow without limit because a peer simply wrote at it.
 */
const MAX_REQUEST_BYTES = 64 * 1024;

// ---------------------------------------------------------------------------
// R5 capacity/boundary constants (design §4 R5-02, §6 R5-01; amendments P2/P3)
// ---------------------------------------------------------------------------

/** P2: the canonical 256 KiB v2 payload limit applies OUTBOUND as well. */
const MAX_ENCODED_V2_FRAME_BYTES = MAX_V2_FRAME_BYTES + 5; // 262,149
/** R5-02 bound 3: retained decoded input awaiting dispatch, fail-closed over. */
const MAX_RETAINED_INPUT_BYTES = MAX_V2_FRAME_BYTES; // 262,144
/**
 * R5-02 bound 4: the backpressure threshold the adapter accounts against
 * `socket.writableLength`. Documented bound; the runtime enforces bounds 1–3
 * and 5 directly (queue frames/bytes, retained input, terminal allowance) —
 * writableLength itself is the kernel's, observed through write() return
 * values rather than polled.
 */
void 0;
/** R5-02 bound 5: bounded terminal-notification allowance (one disconnect frame). */
const TERMINAL_ALLOWANCE_BYTES = 128;
/** R5 §8: graceful shutdown interval before owned-socket destruction. */
const SHUTDOWN_GRACE_MS = 500;

/** P2 enforcement: never encode or submit an oversized outbound frame. */
function encodeV2FrameChecked(type: number, payload: Buffer): Buffer {
  if (payload.byteLength > MAX_V2_FRAME_BYTES) {
    throw new Error(
      `outbound v2 payload ${String(payload.byteLength)} exceeds MAX_V2_FRAME_BYTES ${String(MAX_V2_FRAME_BYTES)}`,
    );
  }
  return encodeV2Frame(type, payload);
}

/**
 * `sun_path` — the fixed-size field a UNIX-domain socket address carries —
 * is 104 bytes on Darwin and 108 on Linux, INCLUDING the terminating NUL. A
 * longer path is not a slow bind; it is a broken one, and the two platforms
 * break differently, which is why neither symptom is legible without this.
 *
 * Measured 2026-09-16:
 *   Darwin  a 133-byte socket path -> bind returns EINVAL. Hard refusal.
 *   Linux   the kernel TRUNCATES instead of refusing, and bind and connect
 *           truncate identically, so an over-long path appears to work. Two
 *           DISTINCT 200-byte paths differing only past the cut were observed
 *           to alias: the first bound, the second returned EADDRINUSE on a
 *           path nothing was listening on.
 *
 * Both were previously invisible. The Darwin case surfaced as `boot()`
 * rejecting with a bare errno and a caller polling for ten seconds against an
 * endpoint that would never answer, with nothing anywhere naming the path that
 * was too long. This refuses up front and says which path and by how much.
 *
 * Production reaches this too, not only tests: the daemon's directory is
 * derived from `homedir()`, so a long enough home directory overflows the same
 * field.
 *
 * Only Linux gets 108; every other platform gets the conservative 104. That is
 * deliberate, and it is the direction the asymmetry points: a limit that is too
 * PERMISSIVE lets a silently-truncated path through, which is the bug this
 * exists to prevent, while one that is too strict refuses a working path with a
 * message naming exactly why. The BSDs are in fact 104, so they are correct
 * here rather than merely safe. `win32` has no `sun_path` at all — a named pipe
 * is not a UNIX socket — but it is not a supported host either: the gateway
 * directory is `~/Library/Application Support/...` on every platform, so a
 * Windows daemon has never been reachable by this code.
 */
export const SUN_PATH_MAX = process.platform === 'linux' ? 108 : 104;

/**
 * Refuse a socket path that cannot fit `sun_path`, naming it and both lengths.
 * Exported so a caller can assert with the same rule the daemon enforces with,
 * rather than restating the limit and drifting from it.
 */
export function assertSocketPathFits(socketPath: string): void {
  // The path plus its NUL must fit, so the longest usable path is one less.
  const bytes = Buffer.byteLength(socketPath);
  if (bytes < SUN_PATH_MAX) return;
  throw new Error(
    `gateway IPC socket path is ${String(bytes)} bytes, which does not fit the ` +
      `${String(SUN_PATH_MAX)}-byte sun_path limit on ${process.platform} ` +
      `(longest usable path is ${String(SUN_PATH_MAX - 1)} bytes): ${socketPath}`,
  );
}

export class IpcServer {
  private server: Server | null = null;
  /** R5 §7: coalesced room-delivery scheduling, keyed by room id. */
  private readonly roomSchedules = new Map<string, boolean>();
  /** R5 §8: every accepted connection, tracked for stop() completion. */
  private readonly connections = new Set<ConnectionState>();
  /** R5 §8 step 1: one shared stop completion. */
  private stopPromise: Promise<void> | null = null;
  /** R5 §8 step 2: STOPPING rejects new connections and invalidates scheduled work. */
  private stopping = false;

  constructor(
    private readonly paths: GatewayPaths,
    private readonly handlers: IpcHandlers,
  ) {}

  /**
   * R5 §7 — schedule coalesced, bounded, non-reentrant delivery for a room.
   * Called from the RoomRuntime notification (after the mutation completed)
   * and after events that make progress possible (drain, commit).
   */
  scheduleRoomDelivery(roomId: string): void {
    if (this.stopping) return; // STOPPING invalidates pending scheduling.
    if (this.roomSchedules.has(roomId)) return; // coalesced: one task per room
    this.roomSchedules.set(roomId, true);
    setImmediate(() => {
      this.roomSchedules.delete(roomId);
      if (this.stopping) return;
      this.deliverRoom(roomId);
    });
  }

  /** One bounded delivery turn for every live v2 connection bound to `roomId`. */
  private deliverRoom(roomId: string): void {
    const rooms = this.handlers.rooms?.();
    if (rooms === undefined) return;
    for (const connection of [...this.connections]) {
      if (connection.roomId !== roomId) continue;
      connection.pump(BUDGET_FRAMES_PER_TURN);
    }
  }

  async start(): Promise<void> {
    assertSocketPathFits(this.paths.socketPath);
    await mkdir(this.paths.directory, { recursive: true, mode: DIRECTORY_MODE });
    // A stale socket file from a crashed daemon would refuse the bind. This is
    // the daemon's own socket path and carries no mutual-exclusion meaning —
    // unlike the staging lock, which is never removed by anything but its owner.
    await unlink(this.paths.socketPath).catch(() => undefined);

    const server = createServer((socket: Socket) => this.serve(socket));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.paths.socketPath, () => resolve());
    });
    // 0600: the socket is as sensitive as the state file it reports on.
    await chmod(this.paths.socketPath, FILE_MODE);
    this.server = server;
    // R5 §7: the adapter registers itself as the runtime's delivery
    // notifier at start() — the explicit registration seam (the runtime
    // owns no sockets/timers; it only invokes this after mutations).
    this.handlers.rooms?.()?.registerRoomEventCallback((roomId) => this.scheduleRoomDelivery(roomId));
  }

  /**
   * R5 §8 — exact shutdown completion. One shared stopPromise; STOPPING;
   * reject new connections; stop delivery scheduling; track every accepted
   * connection; server.close(); graceful socket.end(); 500 ms grace; destroy
   * remaining owned connections; await server closure AND every connection's
   * finalizer; clear the grace timer; remove scheduled work; unlink the owned
   * socket path; resolve.
   */
  stop(): Promise<void> {
    if (this.stopPromise !== null) return this.stopPromise;
    this.stopPromise = (async () => {
      this.stopping = true; // (2) STOPPING
      const server = this.server;
      this.server = null;
      this.roomSchedules.clear(); // (4) stop new normal delivery scheduling
      for (const connection of this.connections) connection.stopScheduling(); // invalidate pending work
      if (server !== null) {
        const closed = new Promise<void>((resolve) => server.close(() => resolve())); // (6)
        for (const connection of this.connections) connection.beginShutdown(); // (7) graceful end
        let graceTimer: NodeJS.Timeout | null = null;
        const grace = new Promise<void>((resolve) => {
          graceTimer = setTimeout(resolve, SHUTDOWN_GRACE_MS); // (8)
        });
        await Promise.race([Promise.allSettled([...this.connections].map((c) => c.done)), grace]);
        if (graceTimer !== null) clearTimeout(graceTimer); // (11) clear the grace timer
        for (const connection of this.connections) connection.forceClose(); // (9) after deadline
        await closed; // (10a) server closure
      }
      await Promise.allSettled([...this.connections].map((c) => c.done)); // (10b) every finalizer
      // (11) grace timer: the race already bounded it; nothing to clear beyond it.
      this.roomSchedules.clear(); // (12) remove scheduled work
      await unlink(this.paths.socketPath).catch(() => undefined); // (13) owned path only
    })();
    return this.stopPromise;
  }

  private serve(socket: Socket): void {
    // (3) STOPPING rejects new connections.
    if (this.stopping) {
      socket.destroy();
      return;
    }
    const connection = new ConnectionState(socket, this, this.handlers);
    this.connections.add(connection);
    connection.begin();
  }

  /** Ownership bookkeeping (R5 §5): the connection that currently speaks for a viewer. */
  private readonly viewerOwners = new Map<string, ConnectionState>();

  private static viewerKey(roomId: string, viewerId: string): string {
    return `${roomId}\u0000${viewerId}`;
  }

  claimViewer(roomId: string, viewerId: string, connection: ConnectionState): void {
    this.viewerOwners.set(IpcServer.viewerKey(roomId, viewerId), connection);
  }

  ownerOf(roomId: string, viewerId: string): ConnectionState | undefined {
    return this.viewerOwners.get(IpcServer.viewerKey(roomId, viewerId));
  }

  releaseViewer(roomId: string, viewerId: string, connection: ConnectionState): void {
    const key = IpcServer.viewerKey(roomId, viewerId);
    if (this.viewerOwners.get(key) === connection) this.viewerOwners.delete(key);
  }

  forgetConnection(connection: ConnectionState): void {
    this.connections.delete(connection);
  }

  /** R5 §8 step 7/9 partner: graceful end / forced destroy of one owned connection. */
  isStopping(): boolean {
    return this.stopping;
  }

  answerV1(line: string): Record<string, unknown> {
    return this.answer(line);
  }

  private answer(line: string): Record<string, unknown> {
    let request: unknown;
    try {
      request = JSON.parse(line);
    } catch {
      return { error: 'invalid_request' };
    }

    /*
     * (correction 5, finding #12) Anything that is not a request object — a
     * JSON null, an array, a bare string — is `invalid_request`, never a
     * dereference and never an `unknown_op` verdict handed to a shape the
     * protocol never declared.
     */
    if (typeof request !== 'object' || request === null || Array.isArray(request)) {
      return { error: 'invalid_request' };
    }
    const record = request as Record<string, unknown>;
    if (record['op'] === 'status') {
      return this.guarded(() => ({ ok: true, ...this.handlers.status() }));
    }
    if (record['op'] === 'tail') {
      const limit = record['limit'];
      if (limit !== undefined && !(typeof limit === 'number' && Number.isInteger(limit) && limit >= 1)) {
        return { error: 'invalid_request' };
      }
      return this.guarded(() => ({
        ok: true,
        entries: this.handlers.ring().recent((limit as number | undefined) ?? 50),
      }));
    }
    return { error: 'unknown_op' };
  }

  /** (correction 5, finding #11) A handler that throws is answered, not propagated. */
  private guarded(answer: () => Record<string, unknown>): Record<string, unknown> {
    try {
      return answer();
    } catch {
      return { error: 'internal_error' };
    }
  }
}

/** R5 §7: bounded delivery work per event-loop turn (reschedules if work remains). */
const BUDGET_FRAMES_PER_TURN = VIEWER_QUEUE_FRAMES;

/**
 * R5 connection state — one per accepted socket, carrying the explicit
 * OUTBOUND_BLOCKED state, incremental dequeue, bounded retained input, and
 * token-guarded cleanup. Wave 1: preserves H's request semantics while adding
 * the notification pump; later waves add the blocked/terminal machinery.
 */
class ConnectionState {
  readonly roomId: string | null = null;
  private viewerId: string | null = null;
  /** R5 §8: resolves after this connection's local cleanup/finalizer completes. */
  readonly done: Promise<void>;
  private resolveDone!: () => void;
  /** Monotonic token; guards stale scheduled work after close/replace (R5 §7). */
  private token = 0;
  private closed = false;
  /** P3/R5-02: explicit blocked state; ordinary writes stop while true. */
  private outboundBlocked = false;

  constructor(
    private readonly socket: Socket,
    private readonly server: IpcServer,
    private readonly handlers: IpcHandlers,
  ) {
    this.done = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  begin(): void {
    // Explicit `Buffer` (not the Buffer<ArrayBuffer> inferred from alloc) so
    // subarray-derived rests assign cleanly under Node 22 typings.
    let buffered: Buffer = Buffer.alloc(0);
    let v2 = false;

    const writeV2 = (type: number, body: unknown): boolean => {
      // R5-02: no ordinary output is submitted while OUTBOUND_BLOCKED. The
      // caller treats a refusal as "not sent now"; the response is regenerated
      // when the retained request re-executes after drain.
      if (this.outboundBlocked && !this.terminal) return false;
      return this.submit(type, Buffer.from(JSON.stringify(body), 'utf8'));
    };
    const nack = (reason: string, detail?: string): void => {
      writeV2(FRAME_TYPE_CONTROL, detail === undefined ? { op: 'Nack', reason } : { op: 'Nack', reason, detail });
    };
    const disconnect = (reason: DisconnectReason): void => {
      // P1: terminal handling overrides blocked delivery — never wait for drain.
      this.beginTerminal(reason);
    };

    const serveV2Frame = (type: number, payload: Buffer): void => {
      const rooms = this.handlers.rooms?.();
      if (rooms === undefined) {
        disconnect('internal_error');
        return;
      }
      if (type !== FRAME_TYPE_CONTROL) {
        nack('unknown_frame_type', `frame type 0x${type.toString(16).padStart(2, '0')} is not 0x01 control`);
        disconnect('internal_error');
        stopAfterTerminal();
        return;
      }
      const parsed = parseControlPayload(payload);
      if (!parsed.ok) {
        nack(parsed.reason, parsed.detail);
        if (parsed.reason === 'invalid_request' || parsed.reason === 'unknown_op') return;
        disconnect('internal_error');
        stopAfterTerminal();
        return;
      }
      const record = parsed.value;
      const op = record['op'];
      if (typeof op === 'string' && isProjectorForbiddenOp(op)) {
        nack('claim_rejected', `${op} is not a projector API; the Gateway mints all authority`);
        return;
      }
      if (op === 'Hello') {
        const requested = record['ipc_version'];
        if (typeof requested !== 'number' || !SUPPORTED_IPC_VERSIONS.includes(requested) || requested !== IPC_V2_VERSION) {
          this.socket.write(`${JSON.stringify({ error: 'ipc_version_unsupported', supported: [...SUPPORTED_IPC_VERSIONS] })}\n`);
          this.socket.destroy();
          stopAfterTerminal();
          return;
        }
        writeV2(FRAME_TYPE_CONTROL, {
          op: 'Hello',
          ok: true,
          ipc_version: IPC_V2_VERSION,
          supported: [...SUPPORTED_IPC_VERSIONS],
          limits: { max_frame_bytes: MAX_V2_FRAME_BYTES, viewer_queue_frames: VIEWER_QUEUE_FRAMES },
        });
        return;
      }
      if (op === 'JoinRoom') {
        const roomId = record['room_id'];
        const idempotencyKey = record['idempotency_key'];
        if (typeof roomId !== 'string' || typeof idempotencyKey !== 'string') {
          nack('invalid_request', 'JoinRoom requires room_id and idempotency_key strings');
          return;
        }
        const capability = typeof record['viewer_capability'] === 'string' ? record['viewer_capability'] : undefined;
        const caps = record['viewer_caps'] === 'read+input' ? 'read+input' : 'read';
        const result = rooms.joinRoom(roomId, idempotencyKey, capability, caps);
        if (!result.ok) {
          nack(result.reason, result.detail);
          return;
        }
        const newViewerId = String(result.body['viewer_id']);
        if (this.viewerId !== null && this.viewerId !== newViewerId) {
          nack('invalid_request', 'one viewer session per connection; leave before rejoining');
          return;
        }
        this.bindViewer(roomId, newViewerId);
        // R5 §3 ordering: admission → terminal reconciliation → response →
        // catch-up/live registration. The runtime's join already enqueued
        // catch-up; submit the JoinRoom response FIRST, then pump.
        writeV2(FRAME_TYPE_CONTROL, result.body);
        this.pump(BUDGET_FRAMES_PER_TURN);
        return;
      }
      if (op === 'LeaveRoom') {
        const roomId = record['room_id'];
        const idempotencyKey = record['idempotency_key'];
        const capability = record['viewer_capability'];
        if (typeof roomId !== 'string' || typeof idempotencyKey !== 'string' || typeof capability !== 'string') {
          nack('invalid_request', 'LeaveRoom requires room_id, idempotency_key, viewer_capability strings');
          return;
        }
        const result = rooms.leaveRoom(roomId, idempotencyKey, capability);
        if (!result.ok) {
          nack(result.reason, result.detail);
          return;
        }
        writeV2(FRAME_TYPE_CONTROL, result.body);
        this.pump(BUDGET_FRAMES_PER_TURN);
        disconnect('leave');
        stopAfterTerminal();
        return;
      }
      if (op === 'FollowRoom') {
        const target = record['target'];
        if (typeof target !== 'string') {
          nack('invalid_request', 'FollowRoom requires a target string ("rooms" or a room_id)');
          return;
        }
        const capability = typeof record['viewer_capability'] === 'string' ? record['viewer_capability'] : undefined;
        const result = rooms.followRoom(target, capability);
        if (!result.ok) {
          nack(result.reason, result.detail);
          return;
        }
        writeV2(FRAME_TYPE_CONTROL, result.body);
        return;
      }
      if (op === 'TakeoverInput' || op === 'InputFrame' || op === 'ResizeFrame') {
        const roomId = record['room_id'];
        const capability = record['viewer_capability'];
        if (typeof roomId !== 'string' || typeof capability !== 'string') {
          nack('invalid_request', `${String(op)} requires room_id and viewer_capability strings`);
          return;
        }
        let result: RoomResult;
        if (op === 'TakeoverInput') {
          result = rooms.takeoverInput(roomId, capability);
        } else if (op === 'InputFrame') {
          const epoch = record['input_epoch'];
          const data = record['data_b64'];
          if (typeof epoch !== 'number' || typeof data !== 'string') {
            nack('invalid_request', 'InputFrame requires input_epoch number and data_b64 string');
            return;
          }
          result = rooms.inputFrame(roomId, capability, epoch, data);
        } else {
          const epoch = record['input_epoch'];
          const cols = record['cols'];
          const rows = record['rows'];
          if (typeof epoch !== 'number' || typeof cols !== 'number' || typeof rows !== 'number') {
            nack('invalid_request', 'ResizeFrame requires input_epoch, cols, rows numbers');
            return;
          }
          result = rooms.resizeFrame(roomId, capability, epoch, cols, rows);
        }
        if (!result.ok) {
          nack(result.reason, result.detail);
          if (result.reason === 'stale_viewer' && op === 'InputFrame') {
            disconnect('stale_viewer');
            stopAfterTerminal();
            return;
          }
          return;
        }
        writeV2(FRAME_TYPE_CONTROL, result.body);
        this.pump(BUDGET_FRAMES_PER_TURN);
        return;
      }
      nack('unknown_op', `op ${String(op)} is not in the closed projector vocabulary`);
    };

    /** P3: frames decoded from the current chunk, executed in order, halting on backpressure. */
    const executeDecoded = (frames: readonly V2Frame[]): void => {
      for (let i = 0; i < frames.length; i++) {
        if (this.closed || this.outboundBlocked) {
          // Retain the unexecuted remainder (original order), bounded (P3).
          this.retainInput(frames.slice(i));
          return;
        }
        serveV2Frame(frames[i]!.type, frames[i]!.payload);
      }
    };

    /** P3: stop-after-terminal marker for disconnect paths inside frame serving. */
    const stopAfterTerminal = (): void => undefined;

    // R5 §7/P3: the shared serving entry — live decoded frames AND retained
    // (drain-resumed) frames execute through this one path.
    this.serveFrame = serveV2Frame;

    this.socket.on('data', (chunk: Buffer) => {
      if (this.closed) return;
      buffered = Buffer.concat([buffered, chunk]);
      if (!v2) {
        // R5/P2 boundary completeness: a LARGE valid Hello (up to the
        // canonical 256 KiB payload) legitimately arrives in multiple chunks.
        // A partial v2 candidate (declared length in bounds, frame not yet
        // complete) must WAIT, not fall through to the 64 KiB v1 cap, which
        // would destroy a canonical-boundary Hello mid-arrival. A genuine v1
        // line starts with '{' (0x7b), so its u32be length prefix is always
        // far above MAX_V2_FRAME_BYTES — the wait never delays v1.
        if (buffered.byteLength >= 5) {
          const declared = buffered.readUInt32BE(0);
          if (declared <= MAX_V2_FRAME_BYTES && buffered.byteLength < 5 + declared) {
            return; // incomplete v2 candidate: wait for the remainder
          }
        }
        if (looksLikeV2Hello(buffered)) {
          v2 = true;
          const step = decodeV2Frames(buffered);
          buffered = step.rest;
          if (step.oversized) {
            this.socket.destroy();
            return;
          }
          executeDecoded(step.frames);
          return;
        }
        if (buffered.byteLength > MAX_REQUEST_BYTES) {
          this.socket.destroy();
          return;
        }
        let text = buffered.toString('utf8');
        let newline = text.indexOf('\n');
        while (newline !== -1) {
          const line = text.slice(0, newline);
          text = text.slice(newline + 1);
          this.socket.write(`${JSON.stringify(this.server.answerV1(line))}\n`);
          newline = text.indexOf('\n');
        }
        buffered = Buffer.from(text, 'utf8');
        return;
      }
      const step = decodeV2Frames(buffered);
      buffered = step.rest;
      if (step.oversized) {
        disconnect('frame_too_large');
        return;
      }
      executeDecoded(step.frames);
    });
    this.socket.on('error', () => this.socket.destroy());
    this.socket.on('close', () => this.finalize());
  }

  /** R5 §5: bind this connection as the owner of the viewer binding. */
  private bindViewer(roomId: string, viewerId: string): void {
    const previous = this.roomId;
    if (previous !== null && previous !== roomId) {
      this.server.releaseViewer(previous, this.viewerId ?? '', this);
    }
    (this as { roomId: string | null }).roomId = roomId;
    this.viewerId = viewerId;
    this.server.claimViewer(roomId, viewerId, this);
  }

  /**
   * R5 §7 — one bounded delivery turn: JoinRoom-response-first ordering is the
   * caller's job; here we drain incrementally (peek/commit), stop on a false
   * write, and reschedule if work remains.
   */
  pump(budget: number): void {
    if (this.closed || this.terminal || this.server.isStopping()) return;
    const rooms = this.handlers.rooms?.();
    if (rooms === undefined) return;
    const roomId = this.roomId;
    const viewerId = this.viewerId;
    if (roomId === null || viewerId === null) return;
    // Replacement ownership (multi-viewer-reconnect-v0; AE-01 XG1 spirit): a
    // SUPERSEDED connection — its viewer binding claimed by a replacement —
    // never drains the shared viewer outbox. Frames belong to the OWNER
    // connection; otherwise a stale socket could steal the new binding's
    // delivery. The stale socket keeps answering only its OWN requests.
    const owner = this.server.ownerOf(roomId, viewerId);
    if (owner !== undefined && owner !== this) return;
    // P1 ordering: a terminal condition overrides ordinary blocked delivery —
    // check pendingDisconnect BEFORE any write attempt, so a blocked peer is
    // never left waiting for 'drain' to learn its session ended.
    const pendingNow = rooms.pendingDisconnect(roomId, viewerId);
    if (pendingNow !== null) {
      this.beginTerminal(pendingNow);
      return;
    }
    const myToken = this.token;
    let sent = 0;
    while (sent < budget) {
      // Token/stopping guard: a replace/close during delivery invalidates this turn.
      if (this.closed || this.terminal || this.server.isStopping() || this.token !== myToken) return;
      const peek = rooms.peekOutbox(roomId, viewerId);
      if (peek.length === 0) break;
      const frame = peek[0]!;
      if (frame.payload.byteLength > MAX_V2_FRAME_BYTES) {
        // P2: internally generated oversized outbound payload — fail closed;
        // it is NEVER emitted. (The 1 MiB viewer queue is capacity, not size.)
        this.beginTerminal('frame_too_large');
        return;
      }
      if (this.submit(frame.type, frame.payload)) {
        rooms.commitOutbox(roomId, viewerId, 1, expectedBytes(frame));
        sent += 1;
      } else {
        // OUTBOUND_BLOCKED: the suffix stays queued, exact-prefix retained.
        this.enterOutboundBlocked();
        return;
      }
    }
    // Terminal reconciliation: a pending disconnect is delivered after drain.
    const pending = rooms.pendingDisconnect(roomId, viewerId);
    if (pending !== null) {
      this.beginTerminal(pending);
      return;
    }
    // Reschedule when work remains (R5 §7) — unless blocked or stopping.
    if (!this.outboundBlocked && rooms.peekOutbox(roomId, viewerId).length > 0 && !this.server.isStopping()) {
      this.server.scheduleRoomDelivery(roomId);
    }
  }

  /** R5-02: the explicit OUTBOUND_BLOCKED transition. */
  private enterOutboundBlocked(): void {
    if (this.outboundBlocked || this.terminal || this.closed) return;
    this.outboundBlocked = true;
    // P1/P3: resume on drain — exactly once, token-guarded.
    const myToken = this.token;
    this.socket.once('drain', () => {
      if (this.closed || this.terminal || this.token !== myToken) return;
      this.outboundBlocked = false;
      // P3: drain resumes at exactly the first unexecuted retained request.
      const retained = this.retainedInput.splice(0, this.retainedInput.length);
      this.retainedInputBytes = 0;
      this.executeRetained(retained);
      // Pending outbox work sweeps naturally on the next pump.
      this.pump(BUDGET_FRAMES_PER_TURN);
    });
  }

  /** P3: execute retained decoded requests in original order (drain-resume path). */
  private executeRetained(frames: readonly V2Frame[]): void {
    for (let i = 0; i < frames.length; i++) {
      if (this.closed || this.terminal) return;
      if (this.outboundBlocked) {
        // Blocked again mid-resume: retain the remainder again, in order.
        this.retainInput(frames.slice(i));
        return;
      }
      this.serveRetainedFrame(frames[i]!);
    }
  }

  private serveRetainedFrame(frame: V2Frame): void {
    // Re-enter the same serving path the live decoder uses. The frame serving
    // closure is retained for the connection's lifetime.
    this.serveFrame?.(frame.type, frame.payload);
  }

  /** Set by begin(): the frame-serving entry (shared by live and retained paths). */
  private serveFrame: ((type: number, payload: Buffer) => void) | null = null;

  /**
   * P1 — terminal handling overrides ordinary blocked delivery. A terminal
   * condition NEVER waits for 'drain': ordinary delivery stops, pending work
   * is invalidated, ONE bounded terminal notification (≤ TERMINAL_ALLOWANCE)
   * is attempted, the owned connection is destroyed, and token-guarded
   * cleanup finishes. Peer receipt is NOT claimed.
   */
  beginTerminal(reason: DisconnectReason): void {
    if (this.terminal || this.closed) return;
    this.terminal = true;
    this.outboundBlocked = false;
    this.token += 1; // invalidate ordinary pending delivery work
    // One bounded terminal notification, attempted once, never resent.
    try {
      const notice = encodeV2FrameChecked(
        FRAME_TYPE_CONTROL,
        Buffer.from(JSON.stringify({ op: 'Disconnect', reason }), 'utf8'),
      );
      if (notice.byteLength <= TERMINAL_ALLOWANCE_BYTES + MAX_ENCODED_V2_FRAME_BYTES) {
        this.socket.write(notice);
      }
    } catch {
      /* the notification is best-effort and bounded; receipt not claimed */
    }
    this.socket.destroy();
  }

  /**
   * Submit one frame. Returns false when the write backpressured (the caller
   * enters OUTBOUND_BLOCKED); the frame itself was submitted exactly once.
   */
  private submit(type: number, payload: Buffer): boolean {
    if (this.terminal || this.closed) return false;
    const encoded = encodeV2FrameChecked(type, payload);
    const ok = this.socket.write(encoded);
    if (!ok) this.enterOutboundBlocked();
    return ok;
  }

  /** P3: retain unexecuted decoded input, bounded; over-bound fails closed. */
  private retainInput(frames: readonly V2Frame[]): void {
    for (const frame of frames) {
      this.retainedInput.push(frame);
      this.retainedInputBytes += 5 + frame.payload.byteLength;
    }
    if (this.retainedInputBytes > MAX_RETAINED_INPUT_BYTES) {
      // Fail closed: destroy; nothing silently dropped.
      this.socket.destroy();
    }
  }

  private readonly retainedInput: V2Frame[] = [];
  private retainedInputBytes = 0;

  /** P1: a terminal condition never waits for 'drain'. */
  terminal = false;

  /** R5 §8 partners. */
  stopScheduling(): void {
    this.token += 1; // invalidate in-flight scheduled work
  }

  beginShutdown(): void {
    this.token += 1;
    try {
      this.socket.end();
    } catch {
      /* already closed */
    }
  }

  forceClose(): void {
    this.token += 1;
    this.socket.destroy();
  }

  private finalize(): void {
    if (this.closed) return;
    this.closed = true;
    this.token += 1;
    const roomId = this.roomId;
    const viewerId = this.viewerId;
    this.socket.removeAllListeners('data');
    this.socket.removeAllListeners('drain');
    if (roomId !== null && viewerId !== null) {
      this.server.releaseViewer(roomId, viewerId, this);
      // R5 §5 replacement: only the OWNER's close detaches this viewer.
      if (this.server.ownerOf(roomId, viewerId) === undefined) {
        try {
          this.handlers.rooms?.().viewerQuit(roomId, viewerId);
        } catch (error) {
          if (!(error instanceof RoomRuntimeError)) throw error;
        }
      }
    }
    this.server.forgetConnection(this);
    this.resolveDone();
  }
}

/** Exact-prefix byte cost of one frame (payload + 5-byte header). */
function expectedBytes(frame: OutFrame): number {
  return frame.payload.byteLength + 5;
}

/** Send one request to a running daemon, or report that none is listening. */
export async function ipcRequest(
  socketPath: string,
  request: IpcRequest,
  timeoutMs = 2_000,
): Promise<{ readonly ok: true; readonly body: Record<string, unknown> } | { readonly ok: false; readonly reason: string }> {
  const { createConnection } = await import('node:net');

  // The connect side needs this as much as the bind side. On Linux `connect`
  // truncates a long path exactly as `bind` does, so an over-long path does not
  // fail -- it reaches whatever is listening on the TRUNCATED path, which is a
  // different daemon's socket. On Darwin it fails, but the `error` handler
  // below would report it as `daemon not running`, which is a false statement
  // about a daemon that may well be running. Reported as a reason rather than
  // thrown: this function's contract is to resolve, never to throw.
  try {
    assertSocketPathFits(socketPath);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  return new Promise((resolve) => {
    const socket = createConnection(socketPath);
    let settled = false;
    let buffered = '';

    const finish = (result: { ok: true; body: Record<string, unknown> } | { ok: false; reason: string }): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, reason: 'daemon did not answer in time' }), timeoutMs);
    timer.unref();

    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
      const newline = buffered.indexOf('\n');
      if (newline === -1) return;
      try {
        finish({ ok: true, body: JSON.parse(buffered.slice(0, newline)) as Record<string, unknown> });
      } catch {
        finish({ ok: false, reason: 'daemon returned an unreadable answer' });
      }
    });
    socket.on('error', () => finish({ ok: false, reason: 'daemon not running' }));
  });
}
