/**
 * `@build-room/journal` — Phase 4 stop-gate §7.1–7.3 foundation.
 *
 * Proves at pin `ad23c6ea6117a54bce5be7208a5a5768ec5bfbc9`:
 *   §7.1  append-only, tamper-evident, reconstructable, singular
 *   §7.2  governed commands cannot bypass the required journal path
 *   §7.3  secrets and credentials are not persisted in journal records
 *
 * Serialization primitives (bytes / chain / envelope) steal mechanisms from
 * the post-pin PR #12 design; the in-memory store and fail-closed dispatch
 * are the minimal proof substrate this pin can support without Neon
 * migrations or rebasing onto later main journal PRs.
 */

export { GENESIS_CHAIN_HASH, chainHash } from './chain.js';

export {
  ENVELOPE_VERSION,
  SPEC_ID_A,
  encodeEnvelope,
  envelopeDigest,
  type NormalizedCommandEnvelope,
} from './envelope.js';

export {
  SPEC_ID_C_MIN,
  RECORD_CLASS_COMMAND,
  COMMAND_ID_PREFIX,
  COMMAND_EVENT_TYPES,
  encodeCommandEventRow,
  rowDigest,
  hexOf,
  bytesOfHex,
  ROW_FIELD_TAGS,
  type CommandEventRow,
  type CommandEventType,
} from './row.js';

export {
  REDACTED,
  redactArgv,
  containsCredentialMaterial,
} from './redact.js';

export {
  MemoryCommandJournal,
  JournalAppendError,
  getActiveJournal,
  resetActiveJournalForTests,
  type ChainedJournalRecord,
  type VerifyResult,
  type JournalAppendErrorCode,
} from './store.js';

export {
  dispatchGovernedCommand,
  executeWithoutJournal,
  normalizeForJournal,
  requireJournalOrThrow,
  DispatchError,
  type GovernedCommandRequest,
  type DispatchResult,
  type DispatchErrorCode,
} from './dispatch.js';

export {
  isHex64,
  sha256Hex,
  isCanonicalSeq,
  isCanonicalRecordedAt,
} from './bytes.js';
