/**
 * Seat Registry V1 — per-run model distinctness predicate (r7 test 4).
 *
 * DEC-20260815-05 clause 1: the reviewing model must differ from the
 * implementation model of the same run (PRD row 13), enforced at assignment
 * and re-checked at review-open. This is a model check, not a
 * provider-organization check. The same predicate is what the dispatch path
 * re-asserts at review-open; this package proves the predicate, not the
 * dispatch (V1 builds no dispatch path).
 */

import type { SeatRoutingLane } from './schema.js';

/**
 * The closed Tier-2 roster as the vendored `tier2-shape-check.sh` fixture
 * records it (`REVIEWER_ROSTER_REGEX`): the Tier2-Reviewer-Id tokens accepted
 * by the gate. DEC-20260815-05 extends this roster to Build Room reviews
 * unchanged.
 */
export const TIER2_ROSTER_ATTESTATION_IDS: readonly string[] = [
  'gemini-3.1-pro',
  'chatgpt-5.6-sol',
  'chatgpt-5.6-terra',
  'chatgpt-5.6-luna',
  'grok-4.5',
] as const;

/**
 * The reviewing model is distinct from the implementation model of the same
 * run: a review lane is lawful for a run when its model_id differs from the
 * implementation model_id AND its attestation id is on the vendored roster.
 */
export function isDistinctReviewLane(implementationModelId: string, reviewLane: SeatRoutingLane): boolean {
  const reviewModel = reviewLane.model_id;
  if (reviewModel === implementationModelId) {
    return false;
  }
  const attestationId = reviewLane.tier2_attestation_id ?? reviewModel;
  return (TIER2_ROSTER_ATTESTATION_IDS as readonly string[]).includes(attestationId);
}
