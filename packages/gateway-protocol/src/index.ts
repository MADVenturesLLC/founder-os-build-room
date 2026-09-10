/**
 * `@build-room/gateway-protocol` — the pure shared signed-message protocol.
 *
 * Zero I/O and zero dependencies, enforced by `test/purity.test.ts`: every
 * module specifier in this package is relative, and no Ed25519 operation and no
 * real clock lives here. Signing and verification happen in the daemon, the CLI
 * and the control plane; what they share is this package, so both sides derive
 * the signed bytes from one implementation rather than two that agree today.
 */

export {
  DOMAIN_SEPARATOR_BYTE,
  DOMAIN_TAG_PREFIX,
  HEX32_LENGTH,
  MAX_SEQUENCE,
  MIN_GENERATION,
  MIN_SEQUENCE,
  PROTOCOL_ID,
  PUBKEY_BASE64_LENGTH,
  PUBKEY_BYTE_LENGTH,
  PURPOSES,
  SIGNATURE_BASE64_LENGTH,
  SIGNATURE_BYTE_LENGTH,
  UUID_LENGTH,
  VERSION,
  isPurpose,
  type Purpose,
} from './constants.js';

export {
  bytesToLowercaseHex,
  decodeBase64Fixed,
  encodeBase64,
  encodeBase64Url,
  isCanonicalUuid,
  isLowercaseHex,
} from './encoding.js';

export {
  decodeTransportPubkey,
  decodeTransportSignature,
  isSafeInteger,
  isValidGatewayId,
  isValidGeneration,
  isValidHex32,
  isValidKeyId,
  isValidSequence,
  isValidTimestampMs,
  validateHeartbeat,
  validateSessionStart,
  type Envelope,
  type EnvelopeErrorCode,
  type EnvelopeResult,
  type HeartbeatEnvelope,
  type SessionStartEnvelope,
} from './envelope.js';

export {
  CanonicalInputError,
  heartbeatCanonicalArray,
  heartbeatSignedBytes,
  sessionStartCanonicalArray,
  sessionStartSignedBytes,
  signedBytesFor,
  type CanonicalElement,
  type HeartbeatCanonicalInput,
  type SessionStartCanonicalInput,
} from './canonical.js';

export {
  BOOT_CLEAN_READINGS_REQUIRED,
  ClockMonitor,
  WALL_SAFE_MAX_MS,
  WALL_SAFE_MIN_MS,
  readClockSafely,
  timestampWithinWindow,
  type Clock,
  type ClockAnomaly,
  type ClockReading,
  type ClockStatus,
  type ClockTolerances,
} from './clock.js';

/**
 * Room Runtime Phase 1 — the canonical IPC v2 vocabulary (Commission Final
 * r3 §10: canonical truth resides exclusively in this package).
 */
export {
  BLOCK_REASONS,
  DISCONNECT_REASONS,
  EXECUTION_STATES,
  EXECUTION_STREAM_LIMIT,
  FIXTURE_VT_CODEC_VERSION,
  FRAME_TYPE_CONTROL,
  FRAME_TYPE_RESERVED_03,
  FRAME_TYPE_VT_PATCH,
  INPUT_AUTHORITY_KINDS,
  IPC_V2_VERSION,
  MAX_V2_FRAME_BYTES,
  NACK_REASONS,
  OCCUPANCY_STATES,
  PROJECTOR_FORBIDDEN_OPS,
  PROJECTOR_REQUEST_OPS,
  RECEIPT_RUNGS,
  RECOVERY_KINDS,
  SUPPORTED_IPC_VERSIONS,
  V2_CONTROL_NAMES,
  VIEWER_ATTACHMENT_STATES,
  decodeV2Frames,
  encodeV2Frame,
  isProjectorForbiddenOp,
  isV2ControlName,
  looksLikeV2Hello,
  parseControlPayload,
  type BlockReason,
  type ControlParseResult,
  type DisconnectFrame,
  type DisconnectReason,
  type ExecutionCursors,
  type ExecutionFact,
  type ExecutionState,
  type FixtureVerificationResultFrame,
  type FollowRoomPayload,
  type GapFrame,
  type HelloAck,
  type HelloPayload,
  type InputAuthorityKind,
  type InputAuthorityState,
  type InputFramePayload,
  type JoinAck,
  type JoinRoomPayload,
  type LeaveRoomPayload,
  type NackFrame,
  type NackReason,
  type OccupancyState,
  type ProjectorForbiddenOp,
  type ProjectorRequest,
  type ProjectorRequestOp,
  type ReceiptRefFrame,
  type ReceiptRung,
  type RecoveryKind,
  type ResizeFramePayload,
  type RoomDeltaFrame,
  type RoomSnapshotBody,
  type RoomSnapshotFrame,
  type TakeoverInputPayload,
  type V2ControlName,
  type V2DecodeStep,
  type V2Frame,
  type ViewerAttachmentState,
  type ViewerFact,
  type VtPatchPayload,
} from './ipc-v2.js';
