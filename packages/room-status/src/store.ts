/**
 * Room Status IR — single-writer store, publisher binding, and subscribe/
 * diff read model (Superlogical→MAD Session Operability v0, Lane 1).
 *
 * Single-writer rule: status mutations happen ONLY through the one
 * `RoomStatusPublisher` bound to a store (`bindPublisher`; a second bind
 * throws). There is no dual-client truth and no other write path — the store
 * class exposes no public mutator. Snapshots are deeply frozen, so a
 * subscriber that mutates what it was handed fails loudly instead of
 * corrupting the read model.
 *
 * Trust boundary: the publisher re-validates every record through
 * `parseRoomStatus` before it lands, so the only write path is also the only
 * validation path — a hand-built object cannot skip the invariants by
 * casting. Projectors consume: `snapshot()` for poll, `subscribe()` for
 * push; both see the same frozen records. `diffStatus` is pure and reusable
 * for poll-based projectors that compute their own deltas.
 *
 * Purity: zero I/O, zero dependencies, no clock, no randomness.
 */

import { parseRoomStatus, roomStatusEqual, type RoomStatus } from './status.js';

/** What a subscriber receives: the room, the previous record (or null), the new record. */
export interface RoomStatusDelta {
  readonly roomId: string;
  readonly before: RoomStatus | null;
  readonly after: RoomStatus;
}

export type RoomStatusListener = (delta: RoomStatusDelta) => void;

/**
 * Read-mostly store. The ONLY writer is the `RoomStatusPublisher` returned
 * by `bindPublisher(store)`; `_applyPublished` is internal to this module's
 * binding mechanism and is not part of the public mutation surface.
 */
export class RoomStatusStore {
  private readonly statuses = new Map<string, RoomStatus>();
  private readonly listeners = new Map<string, Set<RoomStatusListener>>();

  /** The current frozen record for a room, or null when never published. */
  snapshot(roomId: string): RoomStatus | null {
    return this.statuses.get(roomId) ?? null;
  }

  /** All room ids that have a published status, sorted for determinism. */
  listRooms(): readonly string[] {
    return [...this.statuses.keys()].sort();
  }

  /** Subscribe to a room's transitions; returns an idempotent unsubscribe. */
  subscribe(roomId: string, listener: RoomStatusListener): () => void {
    let set = this.listeners.get(roomId);
    if (set === undefined) {
      set = new Set<RoomStatusListener>();
      this.listeners.set(roomId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /** @internal Called only by the module-local publisher binding. */
  _applyPublished(status: RoomStatus): RoomStatusDelta {
    const before = this.statuses.get(status.roomId) ?? null;
    this.statuses.set(status.roomId, status);
    const delta: RoomStatusDelta = { roomId: status.roomId, before, after: status };
    const set = this.listeners.get(status.roomId);
    if (set !== undefined) {
      for (const listener of set) {
        listener(delta);
      }
    }
    return delta;
  }
}

export interface RoomStatusPublisherOptions {
  /**
   * Strict mode rejects `completed` without evidence refs at publish time.
   * Parsed records keep their strictness history; the publisher enforces the
   * configured mode at its own boundary so the write path cannot be used to
   * smuggle an unparsable or evidence-free `completed` through.
   */
  readonly strict?: boolean;
}

/** The single writer for one store. Obtained only via `bindPublisher`. */
export interface RoomStatusPublisher {
  /**
   * Validate `next` through `parseRoomStatus`, and if the record differs
   * from the current snapshot, publish it and notify subscribers. Equal
   * records are a no-op (no phantom transitions). Returns the frozen stored
   * record.
   */
  publish(next: RoomStatus): RoomStatus;
}

/** Raised by `bindPublisher` when a store already has its one writer. */
export class PublisherAlreadyBoundError extends Error {
  constructor() {
    super('a RoomStatusPublisher is already bound to this store — single-writer rule');
    this.name = 'PublisherAlreadyBoundError';
  }
}

const boundStores = new WeakSet<RoomStatusStore>();

/**
 * Bind THE publisher for a store. A second bind on the same store throws
 * `PublisherAlreadyBoundError` — one store, one writer, by construction.
 * For test isolation, construct a fresh store.
 */
export function bindPublisher(store: RoomStatusStore, options?: RoomStatusPublisherOptions): RoomStatusPublisher {
  if (boundStores.has(store)) {
    throw new PublisherAlreadyBoundError();
  }
  boundStores.add(store);
  const strict = options?.strict === true;
  return {
    publish(next: RoomStatus): RoomStatus {
      // Re-validate at the trust boundary: `next` may be a previously parsed
      // record (parse is idempotent over its own output) or a forged cast —
      // either way the write path validates before it lands.
      const validated = parseRoomStatus(next, { strict });
      const current = store.snapshot(validated.roomId);
      if (current !== null && roomStatusEqual(current, validated)) {
        return current;
      }
      store._applyPublished(validated);
      return validated;
    },
  };
}

/**
 * Pure diff for poll-based projectors: null when equal, else the delta that
 * `subscribe` listeners would have received.
 */
export function diffStatus(before: RoomStatus | null, after: RoomStatus): RoomStatusDelta | null {
  if (before !== null && roomStatusEqual(before, after)) return null;
  return { roomId: after.roomId, before, after };
}
