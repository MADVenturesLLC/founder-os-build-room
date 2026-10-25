/**
 * Seat Registry V1 — per-run model distinctness predicate (r7 test 4).
 *
 * DEC-20260815-05 clause 1: the reviewing model must differ from the
 * implementation model of the same run (PRD row 13), enforced at assignment
 * and re-checked at review-open. On its own that was a model check, not a
 * provider-organization check; DEC-20261020-01 clause 7 now also requires the
 * reviewer's model family (its provider) to differ from the builder's, so the
 * predicate checks both. The same predicate is what the dispatch path
 * re-asserts at review-open; this package proves the predicate, not the
 * dispatch (V1 builds no dispatch path).
 */

import { isSurfaceProviderLane, laneModelIds, type SeatRoutingLane } from './schema.js';

/**
 * The closed Tier-2 surface roster as the vendored `tier2-shape-check.sh`
 * fixture records it (`REVIEWER_SURFACE_REGEX`): the Tier2-Reviewer-Id tokens
 * accepted by the gate. DEC-20261001-01 (ratified 2026-10-01) re-bases the
 * roster from model ids to EXECUTION-SURFACE ATTESTATION TOKENS — model ids
 * churn (provider retirement, HTTP 404, unserved tiers) and the churn failure
 * mode is a review that ran but could not be attested. The exact served model
 * is recorded — never gated — in the Tier2-Reviewer-Model: evidence line
 * (DEC-20261001-01 clause 3). FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION
 * B2 fixes the surface set to the four tokens below; a reviewer on any other
 * surface cannot issue a binding Tier-2 verdict.
 */
export const TIER2_ROSTER_ATTESTATION_IDS: readonly string[] = [
  'antigravity',
  'codex',
  'chatgpt',
  'grok-build',
] as const;

/** The implementation side of a run: the model that served the work, and its provider (its family). */
export interface ImplementationIdentity {
  readonly provider: string;
  readonly model_id: string;
}

/**
 * A review lane is lawful for a run when all three hold:
 * - its attestation token is on the roster: the surface, for a
 *   `surface:provider` lane (DEC-20261020-01 clause 6), otherwise the lane's
 *   recorded attestation id;
 * - its provider differs from the implementation's: "the reviewer's model
 *   family must differ from the builder's", so work built on
 *   `claude-code:anthropic` is not reviewed on `antigravity:anthropic`
 *   (DEC-20261020-01 clause 7, keeping DEC-20261001-01 clause 5 and
 *   DEC-20260815-05);
 * - the implementation model is not a model the lane may serve
 *   (DEC-20260815-05 clause 1).
 */
export function isDistinctReviewLane(implementation: ImplementationIdentity, reviewLane: SeatRoutingLane): boolean {
  if (reviewLane.provider === implementation.provider) {
    return false;
  }
  if (laneModelIds(reviewLane).includes(implementation.model_id)) {
    return false;
  }
  const attestationId = isSurfaceProviderLane(reviewLane)
    ? reviewLane.surface_id
    : reviewLane.tier2_attestation_id ?? reviewLane.model_id;
  return (TIER2_ROSTER_ATTESTATION_IDS as readonly string[]).includes(attestationId);
}
