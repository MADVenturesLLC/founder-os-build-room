/**
 * `packages/quarantine-advisor` — the pre-dispatch quarantine advisor
 * (OMP→MAD Evolve Pack v0, Lane E). Stacked on Lane D (hooks) and, through
 * it, Lane A. No manifest, not a workspace member, lockfile unchanged.
 * Imports Lane D's hooks barrel only (types and `matchTool`); no provider,
 * no socket, no clock of its own.
 */

export {
  ADVISOR_SEVERITIES,
  MAX_ADVISOR_OUTPUT_BYTES,
  MAX_FINDINGS_PER_REVIEW,
  MAX_ID_LENGTH,
  MAX_SUMMARY_LENGTH,
  isAdvisorSeverity,
  parseAdvisorOutput,
  type AdvisorFinding,
  type AdvisorReview,
  type AdvisorSeverity,
  type FindingTarget,
  type ParsedAdvisorOutput,
} from './verdict.js';

export {
  RATE_LIMIT_BOUNDS,
  RateLimitPolicyError,
  SlidingWindowLimiter,
  validateRateLimitPolicy,
  type AcquireResult,
  type RateLimitPolicy,
} from './rate-limit.js';

export {
  ADVISOR_BLOCK_CODES,
  QuarantineAdvisor,
  QuarantineAdvisorError,
  SCOPE_REVIEW_STATES,
  type AdvisorDeps,
  type RecordedFinding,
  type Resolution,
  type ReviewerSeat,
  type ScopeReviewState,
  type ScopeStatus,
  type SubmitResult,
  type TranscriptBatch,
  type TranscriptDelta,
} from './advisor.js';

export { quarantinePreHook } from './quarantine-hook.js';
