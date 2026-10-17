/**
 * The counted-run set's progress (plan r1 slice 10), under the PROPOSED set
 * semantics (`PHASE4-RUN-UNIT-PROPOSAL-r1.md` §3):
 *
 *   - the runs go in label order, CR1 then CR2 then CR3;
 *   - an entry refusal (`not_started`) ran nothing and consumes no label;
 *   - three consecutive passes satisfy item 13;
 *   - any other outcome spends the set. §7 says a failed or interrupted run
 *     "resets the consecutive-run count"; the proposal reads C6's "the three
 *     as one set, in one act" as authorizing three runs, not an open-ended
 *     series, so after a reset the next attempt needs a new act. A rejected
 *     run (a Founder cancel) is treated the same: it is not a pass.
 */

import { PHASE4_RUN_LABELS, type Phase4AttemptSummary, type Phase4RunLabel } from './model.js';

export interface Phase4SetStatus {
  readonly consecutivePasses: number;
  /** The label the next attempt must carry, or null when none may run. */
  readonly nextLabel: Phase4RunLabel | null;
  /** A run short of a pass ended the set: a new act is needed. */
  readonly spent: boolean;
  readonly satisfied: boolean;
}

export function phase4SetStatus(attempts: readonly Phase4AttemptSummary[]): Phase4SetStatus {
  let passes = 0;
  for (const attempt of attempts) {
    const expected = PHASE4_RUN_LABELS[passes];
    if (expected === undefined || attempt.label !== expected) {
      throw new Error(`expected ${expected ?? 'no further run'}, received ${attempt.label}`);
    }
    if (attempt.outcome === 'not_started') continue;
    if (attempt.outcome === 'passed') {
      passes += 1;
      continue;
    }
    return { consecutivePasses: 0, nextLabel: null, spent: true, satisfied: false };
  }
  const satisfied = passes === PHASE4_RUN_LABELS.length;
  return {
    consecutivePasses: passes,
    nextLabel: satisfied ? null : PHASE4_RUN_LABELS[passes]!,
    spent: false,
    satisfied,
  };
}
