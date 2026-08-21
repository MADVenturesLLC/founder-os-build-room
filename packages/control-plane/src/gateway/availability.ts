/**
 * Availability transitions, and the alternation invariant they must uphold
 * (contract §9, §18, completeness bar 2).
 *
 * The invariant: no gateway's availability history may contain two
 * `went_online` rows without an intervening `went_offline`, or two
 * `went_offline` rows without an intervening `went_online`. It matters because
 * this history is what anyone later reads to answer "how long was the gateway
 * down" — and a history with two consecutive onlines does not answer that
 * question, it just looks like it does.
 *
 * Three writers can append here — an accepted heartbeat, the staleness sweep,
 * and promotion reconciliation — so the rule cannot live in any one of them.
 * `nextTransitions` is the single decision function all three call.
 */

import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

export type Transition = 'went_online' | 'went_offline';

/** The latest durable transition for a gateway, or null when none is retained. */
export async function latestTransition(
  client: PoolClient,
  gatewayId: string,
): Promise<Transition | null> {
  /*
   * Ordered by `seq`, not `recorded_at`. A stale-liveness beat writes the
   * overdue offline and the new online in ONE transaction, so they share a
   * transaction-stable `recorded_at` and only `seq` distinguishes them.
   */
  const { rows } = await client.query<{ transition: Transition }>(
    'SELECT transition FROM gateway_availability_events WHERE gateway_id = $1 ORDER BY seq DESC LIMIT 1',
    [gatewayId],
  );
  return rows[0]?.transition ?? null;
}

export interface PlannedEdge {
  readonly transition: Transition;
  readonly occurredAt: Date;
  readonly lastHeartbeatAt: Date | null;
}

/**
 * Decide the edges an accepted heartbeat must write.
 *
 * The five cases of §9, expressed once:
 *
 *  - liveness fresh                     -> nothing; a steady beat is not an event
 *  - liveness absent or null            -> one `went_online`
 *  - liveness stale, latest is online   -> the overdue `went_offline` the
 *                                          sweeper has not written yet, THEN the
 *                                          new `went_online`
 *  - liveness stale, latest is offline  -> just the new `went_online`
 *  - liveness stale, no history at all  -> just the new `went_online`
 *
 * Every branch is then filtered through the global write condition, so a writer
 * cannot produce a same-direction pair even if a case were reasoned about
 * wrongly.
 */
export function planHeartbeatEdges(input: {
  readonly livenessWallMs: number | null;
  readonly isStale: boolean;
  readonly latest: Transition | null;
  readonly beatWallMs: number;
  readonly stalenessMs: number;
}): readonly PlannedEdge[] {
  const { livenessWallMs, isStale, latest, beatWallMs, stalenessMs } = input;

  // A beat inside the staleness threshold changes nothing durable.
  if (livenessWallMs !== null && !isStale) return [];

  const edges: PlannedEdge[] = [];
  let current = latest;

  if (livenessWallMs !== null && isStale && current === 'went_online') {
    /*
     * The gateway went quiet, came back, and the sweeper has not run. The
     * outage is real and must be recorded with the time it actually began —
     * the prior accepted beat plus the staleness threshold — not the time we
     * happened to notice.
     */
    const offlineAt = new Date(livenessWallMs + stalenessMs);
    edges.push({ transition: 'went_offline', occurredAt: offlineAt, lastHeartbeatAt: new Date(livenessWallMs) });
    current = 'went_offline';
  }

  if (current !== 'went_online') {
    const previous = edges[edges.length - 1];
    /*
     * Clamped so the online edge is never stamped before the offline edge it
     * follows. Without the clamp a beat arriving at exactly the threshold could
     * produce an online that precedes its own offline.
     */
    const onlineAt =
      previous === undefined
        ? new Date(beatWallMs)
        : new Date(Math.max(beatWallMs, previous.occurredAt.getTime()));
    edges.push({ transition: 'went_online', occurredAt: onlineAt, lastHeartbeatAt: null });
  }

  return edges;
}

export async function insertTransition(
  client: PoolClient,
  input: {
    readonly gatewayId: string;
    readonly transition: Transition;
    readonly occurredAt: Date;
    readonly lastHeartbeatAt: Date | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO gateway_availability_events
       (event_id, gateway_id, transition, occurred_at, last_heartbeat_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [randomUUID(), input.gatewayId, input.transition, input.occurredAt, input.lastHeartbeatAt],
  );
}
