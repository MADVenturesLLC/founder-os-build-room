/**
 * What a Phase 2 run is, as data.
 *
 * The Founder defined the unit of verification on 2026-08-17
 * (`DEC-20260815-17`, *Founder Definition — what "a run" means at Phase 2*).
 * One run is a **deploy → health check → verify → teardown** cycle, and it
 * passes only if all three of these hold within that cycle:
 *
 *   1. the control plane **deploys and stays up**
 *   2. it **connects to Postgres and reads and writes correctly**
 *   3. it **survives a restart without data loss**
 *
 * This module is pure — it decides nothing about infrastructure, it only says
 * what the observations mean. Anything that touches a network lives in
 * `client.ts`, `platform.ts` and `runner.ts`.
 *
 * **Why the conditions are modelled separately from the steps.** The cycle has
 * four named phases, but three conditions, and they do not line up one to one:
 * "survives a restart" spans the restart and the read that follows it. Storing
 * both, and deriving the verdict from the conditions rather than from step
 * count, means a run cannot pass by completing its steps while failing what
 * the steps were for.
 */

export type StepName =
  | 'deploy'
  | 'health_check'
  | 'verify_write'
  | 'restart'
  | 'verify_after_restart'
  | 'teardown';

export type StepOutcome = 'passed' | 'failed' | 'skipped';

export interface StepRecord {
  readonly step: StepName;
  readonly outcome: StepOutcome;
  /** RFC3339, UTC. Supplied by the caller — this module reads no clock. */
  readonly startedAt: string;
  readonly endedAt: string;
  /** What was observed. Present whether the step passed or failed. */
  readonly detail: string;
  /** Raw observations worth keeping in the evidence bundle. */
  readonly observations?: Readonly<Record<string, unknown>>;
}

/** The Founder's three conditions, each with the evidence for its verdict. */
export interface ConditionRecord {
  readonly condition: 'deploys_and_stays_up' | 'reads_and_writes' | 'survives_restart';
  readonly held: boolean;
  readonly evidence: string;
}

export type RunVerdict = 'passed' | 'failed';

export interface RunRecord {
  /**
   * Position in the sequence, from 1, assigned when the run is appended.
   * Gapless and never reused — a failed run keeps its number so the failure
   * is an interruption of the sequence rather than absent from it
   * (`DEC-20260815-17` exit criterion 4; architecture §3.17).
   */
  readonly seq: number;
  readonly runId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  /** The commit the control plane reported on `/version` during the run. */
  readonly commit: string;
  readonly steps: readonly StepRecord[];
  readonly conditions: readonly ConditionRecord[];
  readonly verdict: RunVerdict;
  /** Set when the run failed, naming what stopped it. */
  readonly failureReason?: string;
}

export const REQUIRED_CONDITIONS: readonly ConditionRecord['condition'][] = [
  'deploys_and_stays_up',
  'reads_and_writes',
  'survives_restart',
];

/**
 * A run's verdict, from its conditions.
 *
 * Fails closed in both directions that matter: a condition that did not hold
 * fails the run, and a condition that was never evaluated **also** fails it. A
 * run that crashed before testing restart survival has not shown restart
 * survival, and treating an absent condition as satisfied is the exact way a
 * gate comes to certify something it never checked.
 */
export function verdictFor(conditions: readonly ConditionRecord[]): {
  readonly verdict: RunVerdict;
  readonly failureReason?: string;
} {
  const missing = REQUIRED_CONDITIONS.filter(
    (required) => !conditions.some((condition) => condition.condition === required),
  );
  if (missing.length > 0) {
    return {
      verdict: 'failed',
      failureReason: `condition(s) never evaluated: ${missing.join(', ')}`,
    };
  }

  const broken = conditions.filter((condition) => !condition.held);
  if (broken.length > 0) {
    return {
      verdict: 'failed',
      failureReason: broken.map((c) => `${c.condition}: ${c.evidence}`).join('; '),
    };
  }

  return { verdict: 'passed' };
}
