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
