/**
 * The run sequence, and when the three-run gate is satisfied.
 *
 * `DEC-20260815-17` exit criterion 4 requires **three consecutive successful
 * runs on record**, *"ordered and countable, with a failed run visible as an
 * interruption of the sequence rather than absent from it"*. That last clause
 * is the whole reason this module exists rather than a counter:
 *
 * - **Ordered and countable** — every run, pass or fail, takes the next
 *   sequence number. Numbers are gapless and never reused.
 * - **A failure is an interruption, not an absence** — a failed run stays in
 *   the record and resets the streak. Nothing here deletes, hides, or
 *   renumbers a failure, and `appendRun` is the only way in.
 * - **Consecutive** means the last three runs in the record, in order, all
 *   passed. Three passes with a failure between them is not three consecutive
 *   passes, and reporting it as such would be the defect the criterion was
 *   written to prevent.
 *
 * Pure. The clock and the storage live elsewhere — the persisted sequence in
 * the control plane (`0007_gate_runs`), reached through `gate-runs.ts`.
 *
 * Architecture §3.17 also rules that *"Completing three runs authorizes
 * nothing"*, which `DEC-20260815-17` restates for this phase. So the satisfied
 * gate reported here confers no activation, no further phase, and no spend
 * authority — it is evidence for a Founder-confirmed stop gate, not a
 * substitute for one.
 */

import { verdictFor, type ConditionRecord, type RunRecord, type StepRecord } from './record.js';

/** How many consecutive passes the gate requires (`DEC-20260815-17` clause 3). */
export const REQUIRED_CONSECUTIVE_PASSES = 3;

export interface RunSequence {
  readonly runs: readonly RunRecord[];
}

export function emptySequence(): RunSequence {
  return { runs: [] };
}

export interface RunDraft {
  readonly runId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly commit: string;
  readonly steps: readonly StepRecord[];
  readonly conditions: readonly ConditionRecord[];
  /**
   * Set when the run did not finish: the harness threw mid-flight. The run
   * is still recorded — failed, with this as the first part of its failure
   * reason — because an interruption is part of the sequence, not absent
   * from it (`DEC-20260815-17` exit criterion 4).
   */
  readonly interruption?: string;
}

/** A run record before the store has placed it in the sequence. */
export type UnsequencedRunRecord = Omit<RunRecord, 'seq'>;

/**
 * The run record a draft becomes, without its `seq`. The verdict is derived
 * here rather than accepted from the caller, so a run cannot be recorded as
 * passing against conditions that say otherwise — and an interrupted run
 * cannot pass at all, whatever conditions it had reached.
 */
export function recordFor(draft: RunDraft): UnsequencedRunRecord {
  const derived = verdictFor(draft.conditions);
  const parts = [
    ...(draft.interruption === undefined ? [] : [`run interrupted: ${draft.interruption}`]),
    ...(derived.failureReason === undefined ? [] : [derived.failureReason]),
  ];
  const failed = parts.length > 0;
  return {
    runId: draft.runId,
    startedAt: draft.startedAt,
    endedAt: draft.endedAt,
    commit: draft.commit,
    steps: draft.steps,
    conditions: draft.conditions,
    verdict: failed ? 'failed' : 'passed',
    ...(failed ? { failureReason: parts.join(' — ') } : {}),
  };
}

/**
 * Append a run to an IN-MEMORY sequence and return the new sequence.
 *
 * Pure composition, kept for callers that hold a sequence themselves. The
 * Phase 2 CLI does NOT count with this: it loads the persisted sequence from
 * the control plane (`gate-runs.ts`), appends each run there, and computes
 * the gate over what the store holds afterwards — so a re-run continues the
 * record instead of restarting it (`docs/phase-2-known-limits.md` §2, closed
 * by migration `0007_gate_runs`).
 */
export function appendRun(sequence: RunSequence, draft: RunDraft): {
  readonly sequence: RunSequence;
  readonly run: RunRecord;
} {
  const run: RunRecord = { seq: sequence.runs.length + 1, ...recordFor(draft) };
  return { sequence: { runs: [...sequence.runs, run] }, run };
}

/**
 * Consecutive passes at the end of the record.
 *
 * Counted backwards from the most recent run and stopped by the first
 * failure, which is what makes a failure reset the streak without removing it
 * from the record.
 */
export function consecutivePassesAtEnd(sequence: RunSequence): number {
  let streak = 0;
  for (let index = sequence.runs.length - 1; index >= 0; index -= 1) {
    if (sequence.runs[index]?.verdict !== 'passed') break;
    streak += 1;
  }
  return streak;
}

export interface GateStatus {
  readonly satisfied: boolean;
  readonly consecutivePasses: number;
  readonly required: number;
  readonly totalRuns: number;
  readonly failedRuns: number;
  /** The sequence numbers of the runs that satisfy the gate, oldest first. */
  readonly satisfyingRuns: readonly number[];
  readonly summary: string;
}

export function gateStatus(sequence: RunSequence): GateStatus {
  const consecutivePasses = consecutivePassesAtEnd(sequence);
  const satisfied = consecutivePasses >= REQUIRED_CONSECUTIVE_PASSES;
  const failedRuns = sequence.runs.filter((run) => run.verdict === 'failed').length;

  const satisfyingRuns = satisfied
    ? sequence.runs
        .slice(sequence.runs.length - REQUIRED_CONSECUTIVE_PASSES)
        .map((run) => run.seq)
    : [];

  return {
    satisfied,
    consecutivePasses,
    required: REQUIRED_CONSECUTIVE_PASSES,
    totalRuns: sequence.runs.length,
    failedRuns,
    satisfyingRuns,
    summary: summarize(sequence, consecutivePasses, satisfied, failedRuns),
  };
}

function summarize(
  sequence: RunSequence,
  consecutivePasses: number,
  satisfied: boolean,
  failedRuns: number,
): string {
  const total = sequence.runs.length;
  if (total === 0) return 'no runs on record';

  /*
   * The failure count is stated even when the gate is satisfied. A report that
   * says only "3 of 3" hides that it took five attempts, and the criterion's
   * point is that the failures stay visible.
   */
  const history = sequence.runs.map((run) => `#${run.seq} ${run.verdict}`).join(', ');
  const headline = satisfied
    ? `gate SATISFIED — ${consecutivePasses} consecutive passes`
    : `gate NOT satisfied — ${consecutivePasses} of ${REQUIRED_CONSECUTIVE_PASSES} consecutive passes`;

  return `${headline}; ${total} run(s) on record, ${failedRuns} failed. Sequence: ${history}.`;
}
