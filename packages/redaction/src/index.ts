/**
 * `packages/redaction` — the secret boundary (OMP→MAD Evolve Pack v0, Lane B).
 *
 * No package manifest, not a workspace member, lockfile unchanged (AE-01 T18
 * pins it; workspace membership needs its own authorization under the
 * Founder workspace/lockfile ruling of 2026-09-05). Consumed through the root
 * tsconfig include and relative source imports. Imports no other package.
 *
 * `scripts/secret-scan.sh` (gitleaks) remains the VERIFICATION layer; this
 * package is the CONTROL layer at the writers. Neither is the sole control.
 */

export {
  BUILTIN_SHAPES,
  BUILTIN_SHAPE_NAMES,
  ENV_NAME_HEURISTICS,
  MIN_FIXTURE_PASSWORD_LENGTH,
  MIN_REGISTERED_VALUE_LENGTH,
  SecretRegistry,
  SecretRegistryError,
  generateFixturePassword,
  looksLikeSecretName,
  type EnvLoadOptions,
  type GenerateFixturePasswordOptions,
  type LoadReport,
  type ManifestEntry,
  type RefusedEntry,
  type RegisteredSecret,
  type SecretManifest,
  type SecretSource,
  type ShapeRule,
} from './registry.js';

export {
  HmacKeyTooShortError,
  MAX_REDACT_DEPTH,
  MIN_HMAC_KEY_BYTES,
  REDACTION_MODES,
  RedactionModeNotWiredError,
  TOKEN_HMAC_HEX_CHARS,
  WIRED_REDACTION_MODES,
  createRedactor,
  type RedactedError,
  type RedactionMode,
  type Redactor,
  type RedactorOptions,
} from './redactor.js';

export {
  ITEM_NOT_FOUND_EXIT,
  InMemoryHmacKeyCustody,
  KeychainHmacKeyCustody,
  REDACTION_KEYCHAIN_ACCOUNT,
  REDACTION_KEYCHAIN_SERVICE,
  SecurityCommandRunner,
  UnavailableHmacKeyCustody,
  type CommandResult,
  type CommandRunner,
  type HmacKeyCustody,
  type HmacKeyLoad,
} from './key-custody.js';

export {
  EvidenceBundleWriter,
  HarnessLogSink,
  JournalAppendSink,
  RedactionBoundary,
  RedactionRefusedError,
  SinkWriteError,
  type BoundaryState,
  type HarnessStreams,
  type RedactionBoundaryDeps,
  type RefusalCode,
} from './sinks.js';
