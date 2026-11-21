/**
 * Two reads of the lifecycle log that the Gateway room routes make inside
 * their fenced transaction (FOUNDER-ACT-20261117-BR-PHASE5-STEP1 B2, for B5
 * and C1 of FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING). Both read the
 * log as that transaction sees it, and neither writes.
 *
 *   - `roomOpenForMint`: a mint request is delivered only while its
 *     lifecycle room is in BUILDING with no binding, so a request opened
 *     before the room bound, on any Gateway, is never handed out after.
 *   - `isBoundRuntimeRoom`: an occupancy report is taken only for the
 *     runtime room bound to that lifecycle room on that Gateway, the one
 *     room whose occupancy the act authorizes reporting.
 *
 * Both fail closed: a room with no rows, or a state they cannot read, is
 * neither open for a mint nor bound.
 */

import type { PoolClient } from 'pg';

/** Whether a mint may still be delivered for this lifecycle room: its state is BUILDING and it has no binding. */
export async function roomOpenForMint(client: PoolClient, lifecycleRoomId: string): Promise<boolean> {
  const { rows } = await client.query<{ bound: boolean; state: string | null }>(
    `SELECT EXISTS (SELECT 1 FROM build_room_events
                     WHERE room_id = $1::uuid AND event = 'runtime_room.bound') AS bound,
            (SELECT resulting_state FROM build_room_events
              WHERE room_id = $1::uuid AND resulting_state IS NOT NULL
              ORDER BY seq DESC LIMIT 1) AS state`,
    [lifecycleRoomId],
  );
  const row = rows[0];
  return row !== undefined && row.bound === false && row.state === 'BUILDING';
}

/** Whether this lifecycle room is bound to this runtime room on this Gateway. */
export async function isBoundRuntimeRoom(
  client: PoolClient,
  lifecycleRoomId: string,
  runtimeRoomId: string,
  gatewayId: string,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM build_room_events
      WHERE room_id = $1::uuid AND event = 'runtime_room.bound'
        AND payload->'binding'->>'runtimeRoomId' = $2
        AND payload->'binding'->>'gatewayId' = $3
      LIMIT 1`,
    [lifecycleRoomId, runtimeRoomId, gatewayId],
  );
  return rows.length > 0;
}
