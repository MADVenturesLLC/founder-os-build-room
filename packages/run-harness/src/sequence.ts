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
 * Pure. The clock and the storage live elsewhere.
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
}

/**
 * Append a run and return the new sequence. The verdict is derived here rather
 * than accepted from the caller, so a run cannot be recorded as passing
 * against conditions that say otherwise.
 */
/**
 * The sequence is IN-MEMORY, and the gate counts within one invocation.
 *
 * `seq` comes from the current sequence's length, and the CLI starts from
 * `emptySequence()` each time it runs. So an invocation that recorded a
 * failure could be followed by a fresh one recording three passes, and the
 * second bundle read alone would show a satisfied gate. What actually prevents
 * that is the retention rule — bundles are committed, never edited, and a
 * missing one is visible in a diff — which is an audit control rather than a
 * mechanical one. Recorded as a known limit in
 * `docs/phase-2-known-limits.md` §2 rather than papered over. Raised by
 * CodeRabbit on PR #2.
 */
export function appendRun(sequence: RunSequence, draft: RunDraft): {
  readonly sequence: RunSequence;
  readonly run: RunRecord;
} {
  const { verdict, failureReason } = verdictFor(draft.conditions);
  const run: RunRecord = {
    seq: sequence.runs.length + 1,
    runId: draft.runId,
    startedAt: draft.startedAt,
    endedAt: draft.endedAt,
    commit: draft.commit,
    steps: draft.steps,
    conditions: draft.conditions,
    verdict,
    ...(failureReason === undefined ? {} : { failureReason }),
  };
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
