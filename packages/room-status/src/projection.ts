/**
 * Room Status IR — AE-01 room projection adapter (Superlogical→MAD Session
 * Operability v0, Lane 1 dogfood).
 *
 * Maps the canonical AE-01 `RoomSnapshotBody` (Gateway Phase 1, Table 9
 * axes) onto the RoomStatus IR WITHOUT claiming production occupancy: the
 * Phase 1 Gateway ships fixture occupancy only, and this adapter is a read
 * model over those facts — it never asserts a live room, never mints
 * authority, and never invents evidence.
 *
 * Load-bearing honesty decisions (each pinned by a test):
 *
 *  - `EXITED` → `verifying`, never `completed`. There is no completion gate
 *    on main (origin/main bcc68b4) and `EXITED` carries no success semantic;
 *    rendering it complete would be decorative green. `completed` is only
 *    ever publishable by a caller carrying gate/handoff evidence refs
 *    through the publisher's strict mode.
 *  - `FAILED_CLOSED` → `failed` (the one phase the wire proves on its own).
 *  - `INTERRUPTED` occupancy with no execution facts → phase `unknown`
 *    (fail-closed), not a guess.
 *  - AE-01 block reasons that have no operator-level equivalent map to
 *    `other_named`; the AE-01 name stays in the source snapshot. The mapping
 *    tables are total `Record`s, so a future AE-01 vocabulary addition
 *    fails THIS package's typecheck — closed-to-closed by construction.
 *
 * Purity: zero I/O, zero dependencies, no clock, no randomness. Reads only
 * the public type surface of `gateway-protocol` (ONE canonical protocol
 * owner; this package re-derives nothing the protocol owns).
 */

import type {
  BlockReason,
  ExecutionState,
  OccupancyState,
  RoomSnapshotBody,
} from '../../gateway-protocol/src/ipc-v2.js';
import { aggregateAgentPhase, parseRoomStatus } from './status.js';
import type { EvidenceRef, RoomStatus } from './status.js';
import { ROOM_STATUS_IR_VERSION } from './vocabulary.js';
import type { AgentPhase } from './vocabulary.js';

/** Occupancy mapping — total over the AE-01 closed set. */
export const OCCUPANCY_TO_ROOM_OCCUPANCY: Record<OccupancyState, 'empty' | 'occupied' | 'closed'> = {
  ABSENT: 'empty',
  PREPARED: 'empty',
  OCCUPIED: 'occupied',
  INTERRUPTED: 'occupied',
  CLOSED: 'closed',
};

/**
 * AE-01 block reason → operator-level block reason (null = no block).
 * `WAITING_FOUNDER` is the one true `human_hold`; plumbing faults read
 * `other_named` because "why can't the agent proceed" is answered honestly
 * as "an infrastructure guard tripped — see the Gateway reason".
 */
export const AE01_BLOCK_REASON_TO_ROOM_BLOCK_REASON: Record<BlockReason, 'policy_deny' | 'completion_gap' | 'backpressure' | 'hook_error' | 'human_hold' | 'other_named' | null> = {
  NONE: null,
  WAITING_FOUNDER: 'human_hold',
  CLOCK_UNRELIABLE: 'other_named',
  DISK: 'other_named',
  DUPLICATE: 'other_named',
  PGID_REUSE: 'other_named',
  CUSTODY: 'other_named',
  CRASH_LOOP: 'other_named',
  ADAPTER_HUNG: 'other_named',
};

/**
 * Execution state → slot phase. `EXITED` → `verifying` (see header): the
 * work ended, its correctness is UNDECIDED until a gate or handoff says
 * otherwise.
 */
export const EXECUTION_STATE_TO_AGENT_PHASE: Record<ExecutionState, AgentPhase> = {
  EMPTY: 'idle',
  LAUNCHING: 'running',
  RUNNING: 'running',
  EXITED: 'verifying',
  FAILED_CLOSED: 'failed',
};

export interface ProjectRoomSnapshotOptions {
  /** Evidence refs the CALLER vouches for (paths/SHAs/handoff/receipt ids). */
  readonly evidenceRefs?: readonly EvidenceRef[];
  /**
   * Strict mode: the projected record is validated with
   * `parseRoomStatus({ strict: true })`. Because the projection can never
   * emit `completed` (no gate on main), strict projection cannot fail on
   * evidence — but if a future change makes it able to, it fails LOUDLY at
   * the parse boundary instead of silently downgrading.
   */
  readonly strict?: boolean;
}

/**
 * Project one AE-01 room snapshot onto the RoomStatus IR. The output record
 * is fully validated and frozen; `observedSeq` carries the snapshot's
 * `room_seq` (the Gateway's own monotonic room-event cursor).
 */
export function projectRoomSnapshot(body: RoomSnapshotBody, options?: ProjectRoomSnapshotOptions): RoomStatus {
  const evidenceRefs = options?.evidenceRefs ?? [];
  const slotPhases = body.executions.map((execution) => ({
    slotId: execution.execution_id,
    phase: EXECUTION_STATE_TO_AGENT_PHASE[execution.state],
  }));
  const blockReason = AE01_BLOCK_REASON_TO_ROOM_BLOCK_REASON[body.block_reason];
  let aggregate: AgentPhase;
  if (blockReason !== null) {
    // A Gateway-level block reason is authoritative: the room IS blocked,
    // even when no execution facts survive to say what was interrupted.
    aggregate = 'blocked';
  } else if (slotPhases.length === 0) {
    // No executions and no block: a quiet room reads idle — EXCEPT an
    // interrupted room whose facts are gone, which stays unknown (fail
    // closed, no guess).
    aggregate = body.occupancy === 'INTERRUPTED' ? 'unknown' : 'idle';
  } else {
    aggregate = aggregateAgentPhase(slotPhases.map((slot) => slot.phase));
  }
  return parseRoomStatus(
    {
      irVersion: ROOM_STATUS_IR_VERSION,
      roomId: body.room_id,
      occupancy: OCCUPANCY_TO_ROOM_OCCUPANCY[body.occupancy],
      agentPhase: aggregate,
      ...(blockReason === null ? {} : { blockReason }),
      ...(slotPhases.length === 0 ? {} : { slotPhases }),
      evidenceRefs: evidenceRefs.map((ref) => ({ ...ref })),
      observedSeq: body.room_seq,
    },
    { strict: options?.strict === true },
  );
}
