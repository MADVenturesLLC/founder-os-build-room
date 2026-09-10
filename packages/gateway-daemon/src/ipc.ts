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
} from '../../gateway-protocol/src/ipc-v2.js';
import {
  RoomRuntime,
  RoomRuntimeError,
  VIEWER_QUEUE_FRAMES,
  type OutFrame,
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
}

export type IpcRequest = { readonly op: 'status' } | { readonly op: 'tail'; readonly limit?: number };

/**
 * §16 — the socket is untrusted input. A peer that writes past this bound
 * without a newline is refused before its bytes are ever parsed; the handler's
 * memory cannot grow without limit because a peer simply wrote at it.
 */
const MAX_REQUEST_BYTES = 64 * 1024;

export class IpcServer {
  private server: Server | null = null;

  constructor(
    private readonly paths: GatewayPaths,
    private readonly handlers: IpcHandlers,
  ) {}

  async start(): Promise<void> {
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
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server === null) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await unlink(this.paths.socketPath).catch(() => undefined);
  }

  private serve(socket: Socket): void {
    // Explicit `Buffer` (not the Buffer<ArrayBuffer> inferred from alloc) so
    // subarray-derived rests assign cleanly under Node 22 typings.
    let buffered: Buffer = Buffer.alloc(0);
    let v2 = false;
    // v2 session identity, established only by a successful Hello answer.
    let v2RoomId: string | null = null;
    let v2ViewerId: string | null = null;

    const writeV2 = (type: number, body: unknown): void => {
      socket.write(encodeV2Frame(type, Buffer.from(JSON.stringify(body), 'utf8')));
    };
    const nack = (reason: string, detail?: string): void => {
      writeV2(FRAME_TYPE_CONTROL, detail === undefined ? { op: 'Nack', reason } : { op: 'Nack', reason, detail });
    };
    const disconnect = (reason: DisconnectReason): void => {
      writeV2(FRAME_TYPE_CONTROL, { op: 'Disconnect', reason });
      socket.destroy();
    };
    const drainViewer = (): void => {
      if (v2RoomId === null || v2ViewerId === null) return;
      const rooms = this.handlers.rooms?.();
      if (rooms === undefined) return;
      const frames: OutFrame[] = rooms.takeOutbox(v2RoomId, v2ViewerId);
      for (const frame of frames) socket.write(encodeV2Frame(frame.type, frame.payload));
      const pending = rooms.pendingDisconnect(v2RoomId, v2ViewerId);
      if (pending !== null) disconnect(pending);
    };

    const serveV2Frame = (type: number, payload: Buffer): void => {
      const rooms = this.handlers.rooms?.();
      if (rooms === undefined) {
        disconnect('internal_error');
        return;
      }
      if (type !== FRAME_TYPE_CONTROL) {
        // Projectors send control only; anything else (including reserved
        // 0x03) is unknown_frame_type → destroy THIS viewer socket (r4.1 §3).
        nack('unknown_frame_type', `frame type 0x${type.toString(16).padStart(2, '0')} is not 0x01 control`);
        disconnect('internal_error');
        return;
      }
      const parsed = parseControlPayload(payload);
      if (!parsed.ok) {
        nack(parsed.reason, parsed.detail);
        if (parsed.reason === 'invalid_request' || parsed.reason === 'unknown_op') return;
        disconnect('internal_error');
        return;
      }
      const record = parsed.value;
      const op = record['op'];
      if (typeof op === 'string' && isProjectorForbiddenOp(op)) {
        // AT-R4-16: recognized authority-minting attempts are REFUSED as
        // claim_rejected — observable, never silently unknown, never served.
        nack('claim_rejected', `${op} is not a projector API; the Gateway mints all authority`);
        return;
      }
      if (op === 'Hello') {
        // Version negotiation on the first frame (r4 §7.7).
        const requested = record['ipc_version'];
        if (typeof requested !== 'number' || !SUPPORTED_IPC_VERSIONS.includes(requested) || requested !== IPC_V2_VERSION) {
          // AT-R4-32: unsupported version → the v1-shaped error answer then
          // close. Never a PTY stream, never a half-negotiated session.
          socket.write(`${JSON.stringify({ error: 'ipc_version_unsupported', supported: [...SUPPORTED_IPC_VERSIONS] })}\n`);
          socket.destroy();
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
        // A connection that already joined another room is a protocol error;
        // Phase 1 serves one viewer session per connection.
        if (v2ViewerId !== null && v2ViewerId !== String(result.body['viewer_id'])) {
          nack('invalid_request', 'one viewer session per connection; leave before rejoining');
          return;
        }
        v2RoomId = roomId;
        v2ViewerId = String(result.body['viewer_id']);
        writeV2(FRAME_TYPE_CONTROL, result.body);
        drainViewer();
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
        drainViewer();
        // `leave` ≠ `occupancy_closed`: the viewer detaches, the room lives on.
        disconnect('leave');
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
        let result;
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
            // AT-R4-30: a revoked viewer's InputFrame ends the session.
            disconnect('stale_viewer');
            return;
          }
          return;
        }
        writeV2(FRAME_TYPE_CONTROL, result.body);
        drainViewer();
        return;
      }
      nack('unknown_op', `op ${String(op)} is not in the closed projector vocabulary`);
    };

    socket.on('data', (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (!v2) {
        // First-frame family detection (r4 §7.7): a structurally valid v2
        // Hello switches THIS connection to the mux for its lifetime. Any
        // other first bytes are v1, exactly as before.
        if (looksLikeV2Hello(buffered)) {
          v2 = true;
          const step = decodeV2Frames(buffered);
          buffered = step.rest;
          if (step.oversized) {
            socket.destroy();
            return;
          }
          for (const frame of step.frames) serveV2Frame(frame.type, frame.payload);
          return;
        }
        if (buffered.byteLength > MAX_REQUEST_BYTES) {
          socket.destroy();
          return;
        }
        let text = buffered.toString('utf8');
        let newline = text.indexOf('\n');
        while (newline !== -1) {
          const line = text.slice(0, newline);
          text = text.slice(newline + 1);
          socket.write(`${JSON.stringify(this.answer(line))}\n`);
          newline = text.indexOf('\n');
        }
        buffered = Buffer.from(text, 'utf8');
        return;
      }
      const step = decodeV2Frames(buffered);
      buffered = step.rest;
      if (step.oversized) {
        // r4 §7.7: oversized → destroy the VIEWER socket; occupancy continues.
        disconnect('frame_too_large');
        return;
      }
      for (const frame of step.frames) serveV2Frame(frame.type, frame.payload);
    });
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
      // AT-R4-01: the viewer dying detaches the VIEWER only — occupancy and
      // executions are untouched, receipts keep appending.
      if (v2RoomId !== null && v2ViewerId !== null) {
        try {
          this.handlers.rooms?.().viewerQuit(v2RoomId, v2ViewerId);
        } catch (error) {
          if (!(error instanceof RoomRuntimeError)) throw error;
          // room_unknown on close is benign (the room closed first).
        }
      }
    });
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

/** Send one request to a running daemon, or report that none is listening. */
export async function ipcRequest(
  socketPath: string,
  request: IpcRequest,
  timeoutMs = 2_000,
): Promise<{ readonly ok: true; readonly body: Record<string, unknown> } | { readonly ok: false; readonly reason: string }> {
  const { createConnection } = await import('node:net');

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
