/**
 * The Gateway's room worker (FOUNDER-ACT-20261117-BR-PHASE5-STEP1 B2, for B5
 * and C1 of FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING).
 *
 * Every daemon has one, because every daemon has a room runtime. It does two
 * things and nothing else:
 *
 *   - answers the control plane's request, carried as the poll answer's
 *     `room` member, that this Gateway mint a runtime room for a named
 *     lifecycle room: `RoomRuntime.createRoom(requestId)` mints it, born
 *     PREPARED, and the worker keeps lifecycle room -> runtime room so the
 *     daemon can send `runtime_room_minted`;
 *   - says which minted rooms' occupancy is due to be reported as
 *     `runtime_room_occupancy`: a room whose occupancy changed since it was
 *     last reported, and every room at least every `OCCUPANCY_REFRESH_TICKS`
 *     ticks.
 *
 * It never changes a room's occupancy and starts nothing in one: Builder
 * execution in a bound runtime room is step 4.
 *
 * ONE RUNTIME ROOM PER LIFECYCLE ROOM. A second request for a lifecycle room
 * this worker already minted for, whether the same request re-delivered or a
 * new one after the control plane lost its mailbox, is answered with the room
 * it already holds; it mints nothing. A request id `createRoom` already used
 * for another lifecycle room is refused, so no runtime room is ever reported
 * for two lifecycle rooms.
 *
 * NOTHING UNREADABLE IS ANSWERED, AND NOTHING THE CONTROL PLANE WOULD REFUSE
 * IS SENT. An absent, unknown or malformed `room` member is ignored: the
 * worker answers `null` and the lane carries on. Every payload is checked
 * against the protocol's own validator and size bound before it is offered
 * for sending, because the control plane refuses one that fails with
 * `400 invalid_request`, which halts the primary lane, heartbeats included.
 *
 * In memory, as the room runtime is: a daemon restart loses both the rooms and
 * this map, and the control plane, which keys its records by Gateway, then
 * holds rooms this daemon no longer has; its reads of them go stale and it
 * judges them by their receipt time.
 */

import {
  isValidRoomPayload,
  isValidRuntimeRoomId,
  validateRoomRequest,
  validateRuntimeRoomMintedPayload,
  validateRuntimeRoomOccupancyPayload,
  type OccupancyState,
  type RuntimeRoomMintedPayload,
  type RuntimeRoomOccupancyPayload,
} from '../../gateway-protocol/src/index.js';
import type { RoomRequestHandler } from './lanes.js';
import type { RoomRuntime } from './room-runtime.js';

/** An unchanged minted room's occupancy is reported again at least this often, in daemon ticks. */
export const OCCUPANCY_REFRESH_TICKS = 6;

export interface RoomWorkerDeps {
  /** The daemon's room runtime: the worker mints through it and reads occupancy from it, nothing more. */
  readonly rooms: Pick<RoomRuntime, 'createRoom' | 'snapshot'>;
  readonly log?: (level: 'info' | 'warn' | 'error', at: string, fields: Record<string, unknown>) => void;
}

interface MintedRoom {
  readonly lifecycleRoomId: string;
  readonly runtimeRoomId: string;
  /** The occupancy last reported and taken by the control plane, or `null` before any. */
  lastSent: OccupancyState | null;
  /** Ticks since that report. */
  ticksSinceSent: number;
  /** An occupancy the control plane refused, held back until the next refresh; `null` when none. */
  refused: OccupancyState | null;
}

export class GatewayRoomWorker implements RoomRequestHandler {
  private readonly byLifecycle = new Map<string, MintedRoom>();
  /** Runtime room -> the lifecycle room it was minted for. */
  private readonly byRuntime = new Map<string, string>();

  constructor(private readonly deps: RoomWorkerDeps) {}

  /** Lifecycle room -> runtime room, for every room this worker minted. */
  minted(): ReadonlyMap<string, string> {
    return new Map([...this.byLifecycle.values()].map((room) => [room.lifecycleRoomId, room.runtimeRoomId]));
  }

  /** One daemon tick has begun: every minted room is one tick further from its last report. */
  tick(): void {
    for (const room of this.byLifecycle.values()) room.ticksSinceSent += 1;
  }

  /**
   * Answer one poll's `room` member with the minted report to send, or
   * `null`: nothing to answer (absent), nothing readable (unknown or
   * malformed), or nothing that could be sent.
   */
  handleRoom(raw: unknown): RuntimeRoomMintedPayload | null {
    if (raw === null || raw === undefined) return null;
    const request = validateRoomRequest(raw);
    if (request === null) {
      this.log('warn', 'room.request_ignored', {});
      return null;
    }

    let room = this.byLifecycle.get(request.lifecycleRoomId);
    if (room === undefined) {
      const created = this.deps.rooms.createRoom(request.requestId);
      if (!created.ok) {
        this.log('error', 'room.mint_failed', { reason: created.reason });
        return null;
      }
      const runtimeRoomId = created.body['room_id'];
      if (!isValidRuntimeRoomId(runtimeRoomId)) {
        this.log('error', 'room.mint_unreportable', {});
        return null;
      }
      const holder = this.byRuntime.get(runtimeRoomId);
      if (holder !== undefined && holder !== request.lifecycleRoomId) {
        // `createRoom` is idempotent by key alone: a request id reused for another lifecycle room.
        this.log('error', 'room.mint_conflict', { runtimeRoomId });
        return null;
      }
      room = { lifecycleRoomId: request.lifecycleRoomId, runtimeRoomId, lastSent: null, ticksSinceSent: 0, refused: null };
      this.byLifecycle.set(room.lifecycleRoomId, room);
      this.byRuntime.set(runtimeRoomId, room.lifecycleRoomId);
      this.log('info', 'room.minted', { runtimeRoomId });
    }

    const occupancy = this.occupancyOf(room);
    if (occupancy === null) return null;
    const payload: RuntimeRoomMintedPayload = {
      requestId: request.requestId,
      lifecycleRoomId: room.lifecycleRoomId,
      runtimeRoomId: room.runtimeRoomId,
      occupancy,
    };
    if (!sendable(payload, validateRuntimeRoomMintedPayload)) {
      this.log('error', 'room.report_invalid', { kind: 'runtime_room_minted' });
      return null;
    }
    return payload;
  }

  /** A minted report the control plane took: it carried the room's occupancy, so that counts as reported. */
  mintedSent(payload: RuntimeRoomMintedPayload): void {
    this.markSent(payload.lifecycleRoomId, payload.runtimeRoomId, payload.occupancy);
  }

  /**
   * The occupancy reports due now: each minted room whose occupancy differs
   * from the one last reported, then each not reported for
   * `OCCUPANCY_REFRESH_TICKS` ticks, longest waiting first.
   */
  dueOccupancy(): readonly RuntimeRoomOccupancyPayload[] {
    const due: { payload: RuntimeRoomOccupancyPayload; changed: boolean; waited: number }[] = [];
    for (const room of this.byLifecycle.values()) {
      const occupancy = this.occupancyOf(room);
      if (occupancy === null) continue;
      const changed = occupancy !== room.lastSent;
      const heldBack = occupancy === room.refused && room.ticksSinceSent < OCCUPANCY_REFRESH_TICKS;
      if (heldBack || (!changed && room.ticksSinceSent < OCCUPANCY_REFRESH_TICKS)) continue;
      const payload: RuntimeRoomOccupancyPayload = {
        lifecycleRoomId: room.lifecycleRoomId,
        runtimeRoomId: room.runtimeRoomId,
        occupancy,
      };
      if (!sendable(payload, validateRuntimeRoomOccupancyPayload)) {
        this.log('error', 'room.report_invalid', { kind: 'runtime_room_occupancy' });
        continue;
      }
      due.push({ payload, changed, waited: room.ticksSinceSent });
    }
    due.sort((a, b) => Number(b.changed) - Number(a.changed) || b.waited - a.waited);
    return due.map((entry) => entry.payload);
  }

  /** An occupancy report the control plane took. */
  occupancySent(payload: RuntimeRoomOccupancyPayload): void {
    this.markSent(payload.lifecycleRoomId, payload.runtimeRoomId, payload.occupancy);
  }

  /** An occupancy report the control plane refused: not delivered, and due again at the next refresh. */
  occupancyRefused(payload: RuntimeRoomOccupancyPayload): void {
    const room = this.byLifecycle.get(payload.lifecycleRoomId);
    if (room === undefined || room.runtimeRoomId !== payload.runtimeRoomId) return;
    room.refused = payload.occupancy;
    room.ticksSinceSent = 0;
  }

  private markSent(lifecycleRoomId: string, runtimeRoomId: string, occupancy: OccupancyState): void {
    const room = this.byLifecycle.get(lifecycleRoomId);
    if (room === undefined || room.runtimeRoomId !== runtimeRoomId) return;
    room.lastSent = occupancy;
    room.refused = null;
    room.ticksSinceSent = 0;
  }

  private occupancyOf(room: MintedRoom): OccupancyState | null {
    const snapshot = this.deps.rooms.snapshot(room.runtimeRoomId);
    if (snapshot === null) {
      this.log('error', 'room.unknown_to_runtime', { runtimeRoomId: room.runtimeRoomId });
      return null;
    }
    return snapshot.occupancy;
  }

  private log(level: 'info' | 'warn' | 'error', at: string, fields: Record<string, unknown>): void {
    this.deps.log?.(level, at, fields);
  }
}

/** Would the control plane take this payload? Its validator over the same JSON text, and the size bound. */
function sendable<T>(payload: T, validate: (value: unknown) => T | null): boolean {
  let text: string | undefined;
  try {
    text = JSON.stringify(payload);
  } catch {
    return false;
  }
  return typeof text === 'string' && isValidRoomPayload(text) && validate(JSON.parse(text)) !== null;
}
