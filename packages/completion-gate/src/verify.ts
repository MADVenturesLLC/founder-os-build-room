/**
 * Completion gate v0 — the independent verifier.
 *
 * Founder Act "MiMo→MAD Long-Horizon Core v0" (2026-09-15), Lane 1: when a
 * seat attempts to stop or claims done, an INDEPENDENT verifier judges
 * completion against a BOUND success contract — not natural-language vibes.
 *
 * Independence is structural, not attitudinal:
 *   - the verifier is a separate seat id, `completion-gate-verifier` — NOT a
 *     Seat Registry V1 seat (the registry's seat set is ratified and frozen;
 *     this id names the gate's judging identity and is never a handoff
 *     target, Role-Id, or routing identity);
 *   - `verifyCompletion` is a pure function of (contract, evidence bundle)
 *     only. It never receives the worker's narrative of progress as proof —
 *     the bundle's `worker.claims` block is data to be checked, and a `done`
 *     claim that the observations do not support becomes a
 *     `worker_claim_contradicted` gap, not a PASS input;
 *   - the output is a closed enum — `pass | gap | impossible` — with a
 *     structured `gaps` list. A PASS is never prose-only: it is the empty
 *     gap list over `requirements_checked` ≥ 1 bound clauses, and a contract
 *     binding no clause is refused at the schema (non-vacuous rule).
 *
 * Verdict semantics:
 *   - `pass`       — every contract clause verified against observations.
 *   - `gap`        — at least one clause unmet or contradicted in a way the
 *                    worker can repair (run the test, produce the artifact,
 *                    fix the hash, deliver a clean strict handoff).
 *   - `impossible` — the completion as submitted asserts a claim the
 *                    contract forbids (e.g. `merge_authorized: true`).
 *                    Satisfying the contract would require an authority the
 *                    worker seat can never hold — a Founder act — so no
 *                    further worker work can rescue THIS submission.
 *
 * Both inputs are validated before any judgment: a malformed contract or
 * bundle is a `schema_reject`, which is NOT a verdict and never masquerades
 * as one. The function never throws.
 */

import { evaluateStructuredHandoff, isCleanAcceptance } from '../../seat-output-schema/src/index.js';
import {
  checkSuccessContract,
  SUCCESS_CONTRACT_VERSION,
  type ContractDefect,
  type ForbiddenClaimKey,
  type SuccessContractV1,
} from './contract.js';
import {
  checkEvidenceBundle,
  type ArtifactObservation,
  type CommandObservation,
  type EvidenceBundleV1,
  type SkipRecord,
} from './evidence.js';
import { handoffSchemaFor } from './handoff-schemas.js';

export const COMPLETION_GATE_VERIFIER_SEAT_ID = 'completion-gate-verifier' as const;

export const VERDICT_KINDS = ['pass', 'gap', 'impossible'] as const;
export type VerdictKind = (typeof VERDICT_KINDS)[number];

export const GAP_CODES = [
  'test_not_observed',
  'test_failed',
  'skip_not_recorded',
  'skip_policy_mismatch',
  'artifact_not_observed',
  'artifact_sha256_mismatch',
  'handoff_missing',
  'handoff_seat_mismatch',
  'handoff_rejected',
  'forbidden_claim_asserted',
  'worker_claim_contradicted',
  'argus_packet_missing',
  'argus_packet_sha256_mismatch',
  'argus_verdict_mismatch',
] as const;
export type GapCode = (typeof GAP_CODES)[number];

export interface Gap {
  readonly code: GapCode;
  readonly detail: string;
  /** JSON-pointer-like path into the evidence bundle (or the contract clause). */
  readonly evidence_pointer: string;
}

export interface CompletionVerdict {
  readonly verifier_seat_id: typeof COMPLETION_GATE_VERIFIER_SEAT_ID;
  readonly contract_version: typeof SUCCESS_CONTRACT_VERSION;
  readonly verdict: VerdictKind;
  /** Empty exactly when `verdict === 'pass'`. */
  readonly gaps: readonly Gap[];
  /** Number of contract clauses actually checked; ≥ 1 on any `pass`. */
  readonly requirements_checked: number;
}

export type VerificationResult =
  | {
      readonly outcome: 'schema_reject';
      readonly stage: 'contract' | 'evidence';
      readonly defects: readonly ContractDefect[];
    }
  | { readonly outcome: 'judged'; readonly verdict: CompletionVerdict };

/** Last observation in trace order wins: a re-run to green is legitimate. */
function lastCommandObservation(commands: readonly CommandObservation[], command: string): { entry: CommandObservation; index: number } | null {
  for (let i = commands.length - 1; i >= 0; i -= 1) {
    const entry = commands[i];
    if (entry !== undefined && entry.command === command) {
      return { entry, index: i };
    }
  }
  return null;
}

function lastArtifactObservation(artifacts: readonly ArtifactObservation[], path: string): { entry: ArtifactObservation; index: number } | null {
  for (let i = artifacts.length - 1; i >= 0; i -= 1) {
    const entry = artifacts[i];
    if (entry !== undefined && entry.path === path) {
      return { entry, index: i };
    }
  }
  return null;
}

function lastSkipRecord(skips: readonly SkipRecord[], command: string): { entry: SkipRecord; index: number } | null {
  for (let i = skips.length - 1; i >= 0; i -= 1) {
    const entry = skips[i];
    if (entry !== undefined && entry.command === command) {
      return { entry, index: i };
    }
  }
  return null;
}

function judge(contract: SuccessContractV1, bundle: EvidenceBundleV1): CompletionVerdict {
  const gaps: Gap[] = [];
  let checked = 0;

  // Forbidden claims first: any one of them asserted makes the completion
  // impossible as submitted, regardless of how green the rest looks.
  for (const key of contract.forbidden_claims) {
    checked += 1;
    if (bundle.worker.claims[key as ForbiddenClaimKey] === true) {
      gaps.push({
        code: 'forbidden_claim_asserted',
        detail: `worker asserts ${key}: true, which this contract forbids; only a Founder act can say otherwise`,
        evidence_pointer: `/worker/claims/${key}`,
      });
    }
  }

  contract.required_tests.forEach((test, i) => {
    checked += 1;
    const clause = `/required_tests/${i}`;
    if ('expect' in test) {
      const found = lastCommandObservation(bundle.observations.commands, test.command);
      if (found === null) {
        gaps.push({
          code: 'test_not_observed',
          detail: `no tool-trace record of ${JSON.stringify(test.command)}`,
          evidence_pointer: '/observations/commands',
        });
      } else if (found.entry.exit_code !== 0) {
        gaps.push({
          code: 'test_failed',
          detail: `${JSON.stringify(test.command)} last observed with exit ${found.entry.exit_code}, expected exit 0`,
          evidence_pointer: `/observations/commands/${found.index}/exit_code`,
        });
      }
    } else {
      const skip = lastSkipRecord(bundle.observations.skips, test.command);
      if (skip === null) {
        gaps.push({
          code: 'skip_not_recorded',
          detail: `contract names skip policy ${JSON.stringify(test.skip_policy)} for ${JSON.stringify(test.command)}, but the trace records no skip decision`,
          evidence_pointer: '/observations/skips',
        });
      } else if (skip.entry.policy !== test.skip_policy) {
        gaps.push({
          code: 'skip_policy_mismatch',
          detail: `contract names skip policy ${JSON.stringify(test.skip_policy)} but the recorded skip cites ${JSON.stringify(skip.entry.policy)} (clause ${clause})`,
          evidence_pointer: `/observations/skips/${skip.index}/policy`,
        });
      }
    }
  });

  contract.required_artifacts.forEach((artifact, i) => {
    checked += 1;
    const found = lastArtifactObservation(bundle.observations.artifacts, artifact.path);
    if (found === null) {
      gaps.push({
        code: 'artifact_not_observed',
        detail: `no observed artifact at ${JSON.stringify(artifact.path)} (required by clause /required_artifacts/${i})`,
        evidence_pointer: '/observations/artifacts',
      });
    } else if (artifact.sha256 !== undefined && found.entry.sha256 !== artifact.sha256) {
      gaps.push({
        code: 'artifact_sha256_mismatch',
        detail: `artifact ${JSON.stringify(artifact.path)} observed with sha256 ${found.entry.sha256}, contract pins ${artifact.sha256}`,
        evidence_pointer: `/observations/artifacts/${found.index}/sha256`,
      });
    }
  });

  if (contract.required_handoff !== undefined) {
    checked += 1;
    const required = contract.required_handoff;
    if (bundle.handoff === undefined) {
      gaps.push({
        code: 'handoff_missing',
        detail: 'contract requires a strict structured handoff and the bundle carries none',
        evidence_pointer: '/handoff',
      });
    } else {
      if (bundle.handoff.seat_id !== bundle.worker.seat_id) {
        gaps.push({
          code: 'handoff_seat_mismatch',
          detail: `handoff is from seat ${JSON.stringify(bundle.handoff.seat_id)} but the worker claiming completion is ${JSON.stringify(bundle.worker.seat_id)}`,
          evidence_pointer: '/handoff/seat_id',
        });
      }
      // The contract names the schema and the mode; the claimant cannot pick
      // its own yardstick. Judged by the ratified Lane A evaluator.
      const evaluation = evaluateStructuredHandoff({
        seat_id: bundle.handoff.seat_id,
        handoff: bundle.handoff.handoff,
        output: bundle.handoff.output,
        output_schema: handoffSchemaFor(required.seat_output_schema_id),
        schema_mode: 'strict',
      });
      if (!isCleanAcceptance(evaluation)) {
        const first = evaluation.violations[0];
        const detail =
          evaluation.rejection !== null
            ? `strict handoff evaluation rejected (${evaluation.rejection})${evaluation.handoff_error !== null ? `: ${evaluation.handoff_error}` : ''}`
            : `strict handoff evaluation not clean${first !== undefined ? ` (${first.code} at ${first.path})` : ''}`;
        gaps.push({ code: 'handoff_rejected', detail, evidence_pointer: '/handoff/output' });
      }
    }
  }

  if (contract.argus_packet !== undefined || contract.single_verdict !== undefined) {
    checked += 1;
    if (bundle.argus_packet === undefined) {
      gaps.push({
        code: 'argus_packet_missing',
        detail: 'contract binds an independent-reviewer packet and the bundle carries none',
        evidence_pointer: '/argus_packet',
      });
    } else {
      if (contract.argus_packet !== undefined && bundle.argus_packet.packet_sha256 !== contract.argus_packet.packet_sha256) {
        gaps.push({
          code: 'argus_packet_sha256_mismatch',
          detail: `observed packet sha256 ${bundle.argus_packet.packet_sha256}, contract binds ${contract.argus_packet.packet_sha256}`,
          evidence_pointer: '/argus_packet/packet_sha256',
        });
      }
      if (contract.single_verdict !== undefined && bundle.argus_packet.terminal_status !== contract.single_verdict) {
        gaps.push({
          code: 'argus_verdict_mismatch',
          detail: `observed packet terminal status ${JSON.stringify(bundle.argus_packet.terminal_status)}, contract binds ${JSON.stringify(contract.single_verdict)}`,
          evidence_pointer: '/argus_packet/terminal_status',
        });
      }
    }
  }

  // The worker's done-narrative is data: when the evidence disagrees with
  // it, say so explicitly rather than letting the claim pass silently.
  if (bundle.worker.claims.done === true && gaps.length > 0) {
    gaps.push({
      code: 'worker_claim_contradicted',
      detail: `worker claims done but ${gaps.length} gap(s) stand; the claim is evidence of disagreement, not of completion`,
      evidence_pointer: '/worker/claims/done',
    });
  }

  const verdict: VerdictKind = gaps.some((g) => g.code === 'forbidden_claim_asserted')
    ? 'impossible'
    : gaps.length > 0
      ? 'gap'
      : 'pass';

  return {
    verifier_seat_id: COMPLETION_GATE_VERIFIER_SEAT_ID,
    contract_version: SUCCESS_CONTRACT_VERSION,
    verdict,
    gaps,
    requirements_checked: checked,
  };
}

/**
 * Judge a completion claim. Accepts `unknown` for both inputs so malformed
 * candidates are refused structurally (schema reject) rather than thrown at.
 * Never throws; never performs I/O; never reads a clock or the environment.
 */
export function verifyCompletion(contractCandidate: unknown, bundleCandidate: unknown): VerificationResult {
  const contractDefects = checkSuccessContract(contractCandidate);
  if (contractDefects.length > 0) {
    return { outcome: 'schema_reject', stage: 'contract', defects: contractDefects };
  }
  const bundleDefects = checkEvidenceBundle(bundleCandidate);
  if (bundleDefects.length > 0) {
    return { outcome: 'schema_reject', stage: 'evidence', defects: bundleDefects };
  }
  return {
    outcome: 'judged',
    verdict: judge(contractCandidate as SuccessContractV1, bundleCandidate as EvidenceBundleV1),
  };
}
