/**
 * Room Status IR — package entry (Superlogical→MAD Session Operability v0,
 * Lane 1, branch build/room-status-ir-v0).
 *
 * A NEW sibling package, not an edit to any existing one. Like
 * `seat-output-schema` and `redaction`, this directory carries no package
 * manifest and is not a workspace member: the lockfile is pinned by AE-01
 * T18 and workspace membership needs its own authorization (Founder
 * workspace/lockfile ruling, 2026-09-05). It is consumed through the root
 * tsconfig include and relative source imports.
 *
 * Scope: a closed, evidence-backed read model of room/agent state for
 * operators and the projector — evolved from Superlogical's
 * server-authoritative durable session (no Superlogical bytes vendored).
 * It is NOT a second authority: Gateway remains the sole local authority;
 * this package reads what publishers publish and nothing else.
 */

export {
  AGENT_PHASES,
  EVIDENCE_REF_KINDS,
  ROOM_BLOCK_REASONS,
  ROOM_OCCUPANCY,
  ROOM_STATUS_IR_VERSION,
  ROOM_STATUS_IR_VERSIONS,
  isAgentPhase,
  isEvidenceRefKind,
  isRoomBlockReason,
  isRoomOccupancy,
  isRoomStatusIrVersion,
  type AgentPhase,
  type EvidenceRefKind,
  type RoomBlockReason,
  type RoomOccupancy,
  type RoomStatusIrVersion,
} from './vocabulary.js';

export {
  aggregateAgentPhase,
  parseRoomStatus,
  roomStatusEqual,
  RoomStatusParseError,
  assertNeverAgentPhase,
  type AgentSlotPhase,
  type EvidenceRef,
  type RoomStatus,
} from './status.js';

export {
  PublisherAlreadyBoundError,
  RoomStatusStore,
  bindPublisher,
  diffStatus,
  type RoomStatusDelta,
  type RoomStatusListener,
  type RoomStatusPublisher,
  type RoomStatusPublisherOptions,
} from './store.js';

export {
  AE01_BLOCK_REASON_TO_ROOM_BLOCK_REASON,
  EXECUTION_STATE_TO_AGENT_PHASE,
  OCCUPANCY_TO_ROOM_OCCUPANCY,
  projectRoomSnapshot,
  type ProjectRoomSnapshotOptions,
} from './projection.js';
