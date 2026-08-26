export const PHASE3_RUN_LABELS = ['Phase3-CR1', 'Phase3-CR2', 'Phase3-CR3'] as const;
export type Phase3RunLabel = (typeof PHASE3_RUN_LABELS)[number];

export type Phase3AttemptOutcome =
  | 'not_started'
  | 'failed'
  | 'interrupted'
  | 'awaiting_adjudication'
  | 'passed';

export interface Phase3AttemptSummary {
  readonly label: Phase3RunLabel;
  readonly outcome: Phase3AttemptOutcome;
}

export interface Phase3SequenceStatus {
  readonly consecutivePasses: number;
  readonly nextLabel: Phase3RunLabel | null;
  readonly blockedByAdjudication: boolean;
  readonly satisfied: boolean;
}

export function phase3SequenceStatus(
  attempts: readonly Phase3AttemptSummary[],
): Phase3SequenceStatus {
  let consecutivePasses = 0;
  for (const attempt of attempts) {
    const expected = PHASE3_RUN_LABELS[consecutivePasses];
    if (expected === undefined || attempt.label !== expected) {
      throw new Error(`expected ${expected ?? 'no further run'}, received ${attempt.label}`);
    }
    if (attempt.outcome === 'awaiting_adjudication') {
      return {
        consecutivePasses,
        nextLabel: null,
        blockedByAdjudication: true,
        satisfied: false,
      };
    }
    if (attempt.outcome === 'passed') {
      consecutivePasses += 1;
      continue;
    }
    if (attempt.outcome === 'failed' || attempt.outcome === 'interrupted') {
      consecutivePasses = 0;
    }
  }

  const satisfied = consecutivePasses >= PHASE3_RUN_LABELS.length;
  return {
    consecutivePasses,
    nextLabel: satisfied ? null : PHASE3_RUN_LABELS[consecutivePasses] ?? 'Phase3-CR1',
    blockedByAdjudication: false,
    satisfied,
  };
}
