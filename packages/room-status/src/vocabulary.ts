/**
 * Room Status IR — closed vocabulary (Superlogical→MAD Session Operability
 * v0, Lane 1, branch build/room-status-ir-v0).
 *
 * EVOLVED, NOT VENDORED: the occupancy/agent-phase axes evolve the
 * Superlogical mechanisms (server-authoritative durable session state made
 * operator-readable). No Superlogical code and no libghostty bytes are
 * vendored here; the only structural debt acknowledged is conceptual.
 *
 * Authority boundary: this package is a READ MODEL over room state. It never
 * mints authority, never claims production occupancy, and never derives a
 * status from prose. Mutations flow only through a bound RoomStatusPublisher
 * (single writer); everything here is pure data + guards.
 *
 * Purity: zero I/O, zero dependencies, no clock, no randomness — like
 * `gateway-protocol/src/ipc-v2.ts`, the same guarantee `test/purity.test.ts`
 * enforces for the protocol package. Ordering comes from a caller-supplied
 * `observedSeq`, never a timestamp.
 */

/** Closed IR version set; parse rejects anything not listed (fail closed). */
export const ROOM_STATUS_IR_VERSIONS = [1] as const;
export type RoomStatusIrVersion = (typeof ROOM_STATUS_IR_VERSIONS)[number];
/** The version this build emits and validates. */
export const ROOM_STATUS_IR_VERSION: RoomStatusIrVersion = 1;

/**
 * Occupancy from the operator's seat. Evolved from Superlogical's
 * server-owned session lifecycle, narrowed to what a room can honestly
 * claim: ABSENT/PREPARED → `empty`, OCCUPIED/INTERRUPTED → `occupied`,
 * CLOSED → `closed` (see projection.ts for the full AE-01 mapping table).
 */
export const ROOM_OCCUPANCY = ['empty', 'occupied', 'closed'] as const;
export type RoomOccupancy = (typeof ROOM_OCCUPANCY)[number];

/**
 * Agent phase, room-level aggregate or per slot. `verifying` exists so an
 * EXITED execution is never rendered as success: there is no completion gate
 * on main (origin/main bcc68b4), so `completed` can only ever be published
 * by a caller carrying gate/handoff evidence — never inferred.
 */
export const AGENT_PHASES = [
  'idle',
  'running',
  'waiting_approval',
  'blocked',
  'verifying',
  'completed',
  'failed',
  'unknown',
] as const;
export type AgentPhase = (typeof AGENT_PHASES)[number];

/**
 * Closed block-reason codes. Deliberately NOT the AE-01 `BLOCK_REASONS` wire
 * vocabulary: those are Gateway plumbing faults (clock, disk, pgid…). This
 * set answers the operator question "why can't the agent proceed?" —
 * `other_named` is the honest catch-all; the AE-01 reason stays in the
 * source snapshot and is never discarded.
 */
export const ROOM_BLOCK_REASONS = [
  'policy_deny',
  'completion_gap',
  'backpressure',
  'hook_error',
  'human_hold',
  'other_named',
] as const;
export type RoomBlockReason = (typeof ROOM_BLOCK_REASONS)[number];

/** Closed evidence kinds. `sha` chips render as the commit/testament hash. */
export const EVIDENCE_REF_KINDS = ['path', 'sha', 'handoff', 'receipt'] as const;
export type EvidenceRefKind = (typeof EVIDENCE_REF_KINDS)[number];

export function isRoomOccupancy(value: unknown): value is RoomOccupancy {
  return typeof value === 'string' && (ROOM_OCCUPANCY as readonly string[]).includes(value);
}

export function isAgentPhase(value: unknown): value is AgentPhase {
  return typeof value === 'string' && (AGENT_PHASES as readonly string[]).includes(value);
}

export function isRoomBlockReason(value: unknown): value is RoomBlockReason {
  return typeof value === 'string' && (ROOM_BLOCK_REASONS as readonly string[]).includes(value);
}

export function isEvidenceRefKind(value: unknown): value is EvidenceRefKind {
  return typeof value === 'string' && (EVIDENCE_REF_KINDS as readonly string[]).includes(value);
}

export function isRoomStatusIrVersion(value: unknown): value is RoomStatusIrVersion {
  return typeof value === 'number' && (ROOM_STATUS_IR_VERSIONS as readonly number[]).includes(value);
}
