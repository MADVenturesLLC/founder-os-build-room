/**
 * The runtime-room channel's control-plane side (FOUNDER-ACT-20261117-BR-PHASE5-STEP1
 * B2, for B5 and C1 of FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING).
 *
 * Three things cross the Gateway's signed channel here, and nothing else:
 *
 *   - the control plane's request that an enrolled Gateway mint a runtime
 *     room for a named lifecycle room, which waits in this mailbox until that
 *     Gateway's signed `planner_poll` collects it, as planner work does
 *     (the poll answer's `room` member);
 *   - the Gateway's signed `runtime_room_minted` report of the runtime room it
 *     minted for that request (`recordMinted`);
 *   - the Gateway's signed `runtime_room_occupancy` report of a minted runtime
 *     room's occupancy (`recordOccupancy`).
 *
 * The routes call `collect`, `recordMinted` and `recordOccupancy` only after
 * the message's signature, digest, payload, session and leadership fence all
 * hold (`session.ts`). Nothing here verifies anything; it only remembers what
 * verified traffic said. Nothing in production calls `requestMint` yet: the
 * lifecycle-room binding path does, and `mintedFor` and `occupancyOf` are what
 * it and the T17 guard read.
 *
 * A request is re-delivered on every poll of its Gateway until a minted report
 * answers it: the Gateway answers a repeat by request id with the room it
 * already minted, so a lost report costs a poll, not a second room. At most
 * one request is open per (Gateway, lifecycle room) pair.
 *
 * BELIEVED PER SESSION. A Gateway's daemon loses the rooms it minted when it
 * restarts, and every restart opens a new session, but so does a resync
 * that keeps them; the control plane cannot tell the two apart. So each
 * accepted session-start (`sessionStarted`) begins a new session for that
 * Gateway, and two reads believe only what was reported in the current one:
 * `mintedFor`, which a binding checks (lifecycle ruling B5), lists a runtime
 * room only once the Gateway has reported it minted in this session, and
 * `occupancyOf`, which the T17 guard reads (C1), answers only with a reading
 * reported in this session. Occupancy of a room minted in an earlier session
 * is still accepted, so a Gateway that kept the room re-establishes its
 * reading with its next report, and a mint request for a lifecycle room is
 * answered with the room the Gateway already holds. A Gateway that lost the
 * room reports nothing for it, and both reads refuse.
 *
 * IN MEMORY, LEADER-LOCAL, AND FAIL-CLOSED. Nothing here is durable and this
 * adds no migration. Everything is lost when the process restarts, and,
 * when the composition root passes `leaderTerm`, whenever this process loses
 * leadership: the first call after a demotion finds a new term and drops all
 * of it. Another leader starts from nothing too. Losing it can only refuse:
 * `mintedFor` then lists no room and `occupancyOf` reads `null`, so a binding
 * and the T17 guard that depend on them refuse until the Gateway reports
 * again. No answer is ever inferred from the absence of state here.
 *
 * Keys are (Gateway, runtime room) throughout: a report from one Gateway
 * never reads or writes what another Gateway reported.
 */

import { randomUUID } from 'node:crypto';
import {
  isValidGatewayId,
  isValidLifecycleRoomId,
  type OccupancyState,
  type RoomRequestWire,
  type RuntimeRoomMintedPayload,
  type RuntimeRoomOccupancyPayload,
} from '../../../gateway-protocol/src/index.js';

/** The one clock reading the channel takes: monotonic, from the gateway surface's adapter (§4). */
export interface RoomChannelClock {
  monotonicNow(): number;
}

export interface RoomChannelOptions {
  /** Mints request ids. Production: `crypto.randomUUID`. */
  readonly mintRequestId?: () => string;
  /**
   * The leadership term this process serves under, read on every call. A
   * change drops everything held. The composition root passes the leadership's
   * demotion counter; absent, the term never changes (restart-only loss).
   */
  readonly leaderTerm?: () => number;
}

/** The latest occupancy a Gateway reported for a runtime room, and when this process received it. */
export interface RoomOccupancyReading {
  readonly occupancy: OccupancyState;
  /** The gateway surface's monotonic clock at receipt; never a wall time. */
  readonly receivedAtMono: number;
}

export class RoomChannelInputError extends Error {
  override readonly name = 'RoomChannelInputError';
}

/** A minted runtime room: the lifecycle room it was minted for, and the Gateway session that last reported it minted. */
interface MintedRoom {
  readonly lifecycleRoomId: string;
  session: number;
}

/** A reading as held: the reading, and the Gateway session it was reported in. */
interface HeldReading {
  readonly reading: RoomOccupancyReading;
  readonly session: number;
}

interface OpenMint {
  readonly gatewayId: string;
  readonly request: RoomRequestWire;
  delivered: boolean;
  /** Monotonic order of the last delivery; undelivered requests go first. */
  lastDelivery: number;
}

function pairKey(gatewayId: string, roomId: string): string {
  // Both members are fixed-format ids with no space in them.
  return `${gatewayId} ${roomId}`;
}

export class GatewayRoomChannel {
  /** Open mint requests by request id. */
  private readonly open = new Map<string, OpenMint>();
  /** (Gateway, lifecycle room) -> runtime rooms that Gateway reported minted for it, in report order. */
  private readonly minted = new Map<string, string[]>();
  /** (Gateway, runtime room) -> the lifecycle room it was reported minted for, and in which session. */
  private readonly mintedRooms = new Map<string, MintedRoom>();
  /** (Gateway, runtime room) -> the latest occupancy reported, and in which session. */
  private readonly occupancy = new Map<string, HeldReading>();
  /** Gateway -> its current session, counted from 0 by accepted session-starts. */
  private readonly sessions = new Map<string, number>();
  private deliveries = 0;
  private readonly mintRequestId: () => string;
  private readonly leaderTerm: () => number;
  private term: number;

  constructor(
    private readonly clock: RoomChannelClock,
    options: RoomChannelOptions = {},
  ) {
    this.mintRequestId = options.mintRequestId ?? randomUUID;
    this.leaderTerm = options.leaderTerm ?? (() => 0);
    this.term = this.leaderTerm();
  }

  /**
   * Ask `gatewayId` to mint a runtime room for `lifecycleRoomId`. At most one
   * request is open per pair: asking again while one is open returns that
   * request's id and opens nothing. Malformed ids throw, because the caller is
   * this control plane's own binding path and a malformed id is its defect.
   */
  requestMint(gatewayId: string, lifecycleRoomId: string): { readonly requestId: string } {
    this.syncTerm();
    if (!isValidGatewayId(gatewayId)) throw new RoomChannelInputError('gatewayId is not a canonical UUID');
    if (!isValidLifecycleRoomId(lifecycleRoomId)) {
      throw new RoomChannelInputError('lifecycleRoomId is not a canonical UUID');
    }
    for (const entry of this.open.values()) {
      if (entry.gatewayId === gatewayId && entry.request.lifecycleRoomId === lifecycleRoomId) {
        return { requestId: entry.request.requestId };
      }
    }
    const requestId = this.mintRequestId();
    if (this.open.has(requestId)) throw new RoomChannelInputError('minted request id is already open');
    this.open.set(requestId, {
      gatewayId,
      request: { kind: 'mint', requestId, lifecycleRoomId },
      delivered: false,
      lastDelivery: 0,
    });
    return { requestId };
  }

  /**
   * The request this Gateway's poll collects, marked delivered in the same
   * synchronous step: undelivered first, then the least recently delivered,
   * so one the Gateway cannot answer does not starve the others. Requests
   * addressed to another Gateway are never visible here.
   */
  collect(gatewayId: string): RoomRequestWire | null {
    this.syncTerm();
    let chosen: OpenMint | null = null;
    for (const entry of this.open.values()) {
      if (entry.gatewayId !== gatewayId) continue;
      if (chosen === null || entry.lastDelivery < chosen.lastDelivery) chosen = entry;
    }
    if (chosen === null) return null;
    chosen.delivered = true;
    this.deliveries += 1;
    chosen.lastDelivery = this.deliveries;
    return { ...chosen.request };
  }

  /**
   * Record a verified `runtime_room_minted` report, closing the request it
   * answers. `false`, changing nothing, unless an open request with the
   * payload's request id was delivered to this Gateway and names the same
   * lifecycle room, and the runtime room is not one this Gateway already
   * reported minted for a different lifecycle room. The occupancy the report
   * carries is recorded as the room's first reading.
   */
  recordMinted(gatewayId: string, payload: RuntimeRoomMintedPayload): boolean {
    this.syncTerm();
    const entry = this.open.get(payload.requestId);
    if (entry === undefined || entry.gatewayId !== gatewayId || !entry.delivered) return false;
    if (entry.request.lifecycleRoomId !== payload.lifecycleRoomId) return false;
    const roomKey = pairKey(gatewayId, payload.runtimeRoomId);
    const earlier = this.mintedRooms.get(roomKey);
    if (earlier !== undefined && earlier.lifecycleRoomId !== payload.lifecycleRoomId) return false;

    const session = this.sessionOf(gatewayId);
    this.open.delete(payload.requestId);
    const lifecycleKey = pairKey(gatewayId, payload.lifecycleRoomId);
    const rooms = this.minted.get(lifecycleKey) ?? [];
    if (!rooms.includes(payload.runtimeRoomId)) rooms.push(payload.runtimeRoomId);
    this.minted.set(lifecycleKey, rooms);
    this.mintedRooms.set(roomKey, { lifecycleRoomId: payload.lifecycleRoomId, session });
    this.occupancy.set(roomKey, { reading: { occupancy: payload.occupancy, receivedAtMono: this.clock.monotonicNow() }, session });
    return true;
  }

  /**
   * The runtime rooms this Gateway reported minted for this lifecycle room in
   * its current session, oldest first; empty when none. A room reported in an
   * earlier session is listed again once the Gateway reports it minted again.
   */
  mintedFor(gatewayId: string, lifecycleRoomId: string): readonly string[] {
    this.syncTerm();
    const session = this.sessionOf(gatewayId);
    return (this.minted.get(pairKey(gatewayId, lifecycleRoomId)) ?? []).filter(
      (runtimeRoomId) => this.mintedRooms.get(pairKey(gatewayId, runtimeRoomId))?.session === session,
    );
  }

  /**
   * Record a verified `runtime_room_occupancy` report as the room's latest
   * reading, in the Gateway's current session. `false`, changing nothing,
   * unless this Gateway reported this runtime room minted for the payload's
   * lifecycle room, in this session or an earlier one.
   */
  recordOccupancy(gatewayId: string, payload: RuntimeRoomOccupancyPayload): boolean {
    this.syncTerm();
    const roomKey = pairKey(gatewayId, payload.runtimeRoomId);
    if (this.mintedRooms.get(roomKey)?.lifecycleRoomId !== payload.lifecycleRoomId) return false;
    this.occupancy.set(roomKey, {
      reading: { occupancy: payload.occupancy, receivedAtMono: this.clock.monotonicNow() },
      session: this.sessionOf(gatewayId),
    });
    return true;
  }

  /**
   * The latest occupancy this Gateway reported for this runtime room in its
   * current session, or `null` when it reported none in this session.
   */
  occupancyOf(gatewayId: string, runtimeRoomId: string): RoomOccupancyReading | null {
    this.syncTerm();
    const held = this.occupancy.get(pairKey(gatewayId, runtimeRoomId));
    if (held === undefined || held.session !== this.sessionOf(gatewayId)) return null;
    return { ...held.reading };
  }

  /**
   * Begin a new session for one Gateway, on its accepted session-start. What
   * it reported before stops being believed by `mintedFor` and `occupancyOf`
   * until it reports again; nothing else changes, and open requests stay
   * open. See "Believed per session" above.
   */
  sessionStarted(gatewayId: string): void {
    this.syncTerm();
    this.sessions.set(gatewayId, this.sessionOf(gatewayId) + 1);
  }

  private sessionOf(gatewayId: string): number {
    return this.sessions.get(gatewayId) ?? 0;
  }

  /** Drop everything held when the leadership term has moved since it was recorded. */
  private syncTerm(): void {
    const now = this.leaderTerm();
    if (now === this.term) return;
    this.term = now;
    this.open.clear();
    this.minted.clear();
    this.mintedRooms.clear();
    this.occupancy.clear();
    this.sessions.clear();
  }
}
