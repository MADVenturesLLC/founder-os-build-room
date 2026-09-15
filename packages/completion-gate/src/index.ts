/**
 * `@build-room/completion-gate` — package entry.
 *
 * Founder Act "MiMo→MAD Long-Horizon Core v0" (2026-09-15), Lane 1. An
 * independent verifier seat judging a worker's stop/completion claim against
 * a bound success-contract IR — the act's description of MiMo's Goal
 * verifier, evolved MAD-shaped. No MiMo/OpenCode source was available or
 * vendored; the IR shapes, the gap/verdict enums, and the evidence-bundle
 * format are this repository's own (see the Lane 1 handoff under
 * `docs/planning/mimo-evolve-v0/`).
 *
 * Placement: an additive sibling package under the act's preferred
 * placement, carrying a manifest and workspace membership under the act's
 * explicit lockfile instruction (the `build/spend-broker-v0` precedent).
 * It imports `packages/seat-registry` and `packages/seat-output-schema`
 * only through their public entries and modifies neither. Library-only:
 * nothing here is wired to gateway dispatch, daemon boot, or any hook.
 *
 * PURE: zero I/O, zero clock, zero environment. Validation is hand-rolled —
 * the repository has no zod and no dependency may be added.
 */

export {
  SUCCESS_CONTRACT_VERSION,
  TEST_EXPECTATIONS,
  SKIP_POLICIES,
  FORBIDDEN_CLAIM_KEYS,
  MAX_CONTRACT_LIST_ENTRIES,
  MAX_COMMAND_LENGTH,
  MAX_PATH_LENGTH,
  checkSuccessContract,
  isSuccessContract,
  type ArgusPacketBind,
  type ContractDefect,
  type ForbiddenClaimKey,
  type RequiredArtifact,
  type RequiredHandoff,
  type RequiredTest,
  type RequiredTestRun,
  type RequiredTestSkip,
  type SkipPolicy,
  type SuccessContract,
  type SuccessContractV1,
  type TestExpectation,
} from './contract.js';

export {
  EVIDENCE_BUNDLE_VERSION,
  MAX_BUNDLE_LIST_ENTRIES,
  checkEvidenceBundle,
  isEvidenceBundle,
  type ArgusPacketObservation,
  type ArtifactObservation,
  type CommandObservation,
  type EvidenceBundle,
  type EvidenceBundleV1,
  type HandoffEvidence,
  type Observations,
  type SkipRecord,
  type WorkerClaims,
  type WorkerSummary,
} from './evidence.js';

export {
  HANDOFF_SCHEMA_IDS,
  handoffSchemaFor,
  isHandoffSchemaId,
  type HandoffSchemaId,
} from './handoff-schemas.js';

export {
  COMPLETION_GATE_VERIFIER_SEAT_ID,
  GAP_CODES,
  VERDICT_KINDS,
  verifyCompletion,
  type CompletionVerdict,
  type Gap,
  type GapCode,
  type VerdictKind,
  type VerificationResult,
} from './verify.js';
