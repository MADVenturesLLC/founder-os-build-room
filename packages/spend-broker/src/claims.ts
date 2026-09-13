/**
 * Claim boundaries for `GLM-20260913-SPEND-BROKER-V0`.
 *
 * The repo does not carry a `@mad/claim-boundary`-style package (checked
 * `packages/` on this branch), so per the commission's fallback the forbidden
 * claim list is hardcoded HERE, exported, surfaced in the README, and printed
 * into the deny-demo JSON report. If a claim-boundary package lands later,
 * this module is the single file to rewire.
 *
 * Honest-claim discipline: passing the tests in `test/spend-broker.test.ts`
 * proves fixture-level behavior only. It is NOT evidence of anything in
 * `NOT_EVIDENCE_OF`.
 */

export const CLAIM_LANGUAGE_ALLOWED: readonly string[] = Object.freeze([
  'SPEND_BROKER_V0',
  'COST_CEILING_ENFORCEMENT',
]);

export const NOT_EVIDENCE_OF: readonly string[] = Object.freeze([
  'PHASE_0',
  'OCCUPANCY_PROOF',
  'GATEWAY_HONESTY',
  'ROOM_RUNTIME',
  'AE01_FIX',
  'PRODUCTION_MERGE_AUTHORITY',
]);

/** The JSON report block the CLI prints alongside demo output. */
export function claimReport(): {
  readonly workId: 'GLM-20260913-SPEND-BROKER-V0';
  readonly allowedClaims: readonly string[];
  readonly notEvidenceOf: readonly string[];
  readonly statement: string;
} {
  return {
    workId: 'GLM-20260913-SPEND-BROKER-V0',
    allowedClaims: CLAIM_LANGUAGE_ALLOWED,
    notEvidenceOf: NOT_EVIDENCE_OF,
    statement:
      'Tests pass against fixtures only. This package is not evidence of ' +
      'Phase 0, occupancy proof, gateway honesty, Room Runtime, an AE-01 fix, ' +
      'or any production merge authority.',
  };
}
