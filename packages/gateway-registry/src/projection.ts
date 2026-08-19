/**
 * The pure projection reducer (contract §5 table 2).
 *
 * `gateway_current_state` is a read model and nothing more. It is mutable, but
 * every mutation happens in the same transaction as the event that caused it,
 * under the registry advisory lock — so the append-only event log is the record
 * and the table is a convenience. This reducer is what makes that claim
 * checkable rather than asserted: replaying the log through it must reproduce
 * the table exactly, column for column, and `projection:replay-equals-table`
 * fails the build if it ever stops doing so.
 *
 * The reducer applies; it does not adjudicate. Whether a `revoked` event may
 * follow a `denied` one is a precondition the control plane enforces under the
 * projection row lock before it writes the event. Re-deciding that here would
 * put the same rule in two places and invite the copies to disagree — the same
 * division the ledger already keeps between `@build-room/ledger` and the store.
 */

import { EVENT_RESULTING_STATE, type GatewayEventType, type GatewayState } from './vocabulary.js';

/** The minimum-necessary host descriptor of contract §8 step 4. */
export interface HostDescriptor {
  readonly hostname: string;
  readonly os: string;
  readonly arch: string;
}

/**
 * One row of `gateway_registry_events`, reduced to the members the projection
 * reads. `seq` is the deterministic total order — `recordedAt` is metadata and
 * is deliberately not represented here, because ordering by it would be
 * ordering by a value two rows in one transaction share.
 */
export interface GatewayRegistryEvent {
  readonly seq: number;
  readonly eventType: GatewayEventType;
  /** Null for `minted`, which precedes any gateway identity. */
  readonly gatewayId: string | null;
  readonly keyId: string | null;
  /** Standard padded base64 of the 32 raw public-key bytes, or null. */
  readonly pubkeyBase64: string | null;
  readonly hostDescriptor: HostDescriptor | null;
  readonly occurredAt: string;
  /** Carried by `key_received`; the expiry the awaiting row is stamped with. */
  readonly awaitingApprovalExpiresAt: string | null;
}

export interface GatewayProjectionRow {
  readonly gatewayId: string;
  readonly state: GatewayState;
  readonly keyId: string | null;
  readonly pubkeyBase64: string | null;
  readonly hostDescriptor: HostDescriptor | null;
  readonly stateSince: string;
  readonly lastEventSeq: number;
  readonly awaitingApprovalExpiresAt: string | null;
  /**
   * Held as a column rather than derived on read because the database's
   * partial unique index — the at-most-one-enrolled invariant of clause 5 — is
   * built on it. A CHECK constraint keeps it equal to `state = 'enrolled'`.
   */
  readonly isCurrentlyEnrolled: boolean;
}

export class ProjectionOrderError extends Error {
  override readonly name = 'ProjectionOrderError';
}

/**
 * Fold one event into the projection, returning a new map.
 *
 * Events with no gateway identity (`minted`) and events whose type produces no
 * state change move nothing.
 */
export function applyGatewayEvent(
  rows: ReadonlyMap<string, GatewayProjectionRow>,
  event: GatewayRegistryEvent,
): ReadonlyMap<string, GatewayProjectionRow> {
  const resulting = EVENT_RESULTING_STATE[event.eventType];
  if (resulting === null || event.gatewayId === null) return rows;

  const previous = rows.get(event.gatewayId);
  const next: GatewayProjectionRow = {
    gatewayId: event.gatewayId,
    state: resulting,
    /*
     * Identity members are carried forward when an event does not restate
     * them. `key_received` is the only event that establishes a key, a pubkey
     * and a host descriptor; `enrolled`, `denied`, `revoked` and `expired`
     * move the state of an identity that already has them.
     */
    keyId: event.keyId ?? previous?.keyId ?? null,
    pubkeyBase64: event.pubkeyBase64 ?? previous?.pubkeyBase64 ?? null,
    hostDescriptor: event.hostDescriptor ?? previous?.hostDescriptor ?? null,
    stateSince: event.occurredAt,
    lastEventSeq: event.seq,
    /*
     * The expiry belongs to the awaiting state and to no other. Once an
     * identity is enrolled, denied, revoked or expired, an approval deadline
     * describes nothing, so it is dropped rather than carried.
     */
    awaitingApprovalExpiresAt:
      resulting === 'awaiting_approval' ? event.awaitingApprovalExpiresAt : null,
    isCurrentlyEnrolled: resulting === 'enrolled',
  };

  const updated = new Map(rows);
  updated.set(event.gatewayId, next);
  return updated;
}

/**
 * Replay a whole log. The caller supplies events already ordered by `seq`, and
 * this refuses anything else rather than silently projecting a wrong answer:
 * an out-of-order replay would produce a state no sequence of events ever
 * reached, which is precisely the failure the equality test exists to catch.
 */
export function projectGatewayRegistry(
  events: readonly GatewayRegistryEvent[],
): ReadonlyMap<string, GatewayProjectionRow> {
  let rows: ReadonlyMap<string, GatewayProjectionRow> = new Map();
  let previousSeq = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    if (event.seq <= previousSeq) {
      throw new ProjectionOrderError(
        `events must be ordered by seq ascending; ${event.seq} followed ${previousSeq}`,
      );
    }
    previousSeq = event.seq;
    rows = applyGatewayEvent(rows, event);
  }

  return rows;
}

/**
 * The gateway currently enrolled, if any.
 *
 * At most one can exist — the database's partial unique index refuses a second
 * — so finding two here means the projection and the table have diverged, and
 * that is raised rather than resolved by picking one.
 */
export function currentlyEnrolled(
  rows: ReadonlyMap<string, GatewayProjectionRow>,
): GatewayProjectionRow | null {
  let found: GatewayProjectionRow | null = null;
  for (const row of rows.values()) {
    if (!row.isCurrentlyEnrolled) continue;
    if (found !== null) {
      throw new ProjectionOrderError(
        'two gateways project as enrolled; the at-most-one-enrolled invariant is broken',
      );
    }
    found = row;
  }
  return found;
}
