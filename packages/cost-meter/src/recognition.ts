/**
 * Infrastructure cost recognition — **the selection, made and recorded here**.
 *
 * `DEC-20260815-09` fixed recognition as *when incurred, not when invoiced*,
 * then offered two acceptable methods without choosing between them:
 *
 * > Count it as it accrues (prorated daily, or just book the full month at the
 * > start).
 *
 * Both that decision and `DEC-20260815-16` assign the choice to whoever builds
 * the meter — *"Whoever builds the meter selects and records it"* — and
 * `-09`'s 2026-08-17 ruling makes the selection due within Phase 2, since it
 * authorized the meter as part of this phase.
 *
 * ## Selected: BOOK_FULL_MONTH_AT_START
 *
 * Selected by `builder` while implementing the meter, under the authority the
 * two decisions delegate. Recorded in `docs/cost-recognition-choice.md`, whose
 * Slice 1 recommendation this follows — the recommendation was accepted as
 * written, not revised to fit the outcome.
 *
 * Reasoning, unchanged from that document:
 *
 * - It is the **conservative** method against the ceiling that matters. The
 *   USD 85 monthly bound is the outer boundary, and booking the full month
 *   means the meter always reports the highest defensible figure for the
 *   period. Prorating makes early-month spend look cheaper than the month will
 *   actually cost — the same overshoot direction the Founder's ruling was
 *   avoiding when it rejected invoice-lag.
 * - It is **simpler to audit**: one booking per provider per month, on the
 *   1st, aligning exactly with the ruled calendar-month reset.
 * - The **monthly total is identical** under either method, so nothing is
 *   lost. The cost is only that a month's headroom appears consumed earlier
 *   than it strictly is.
 *
 * The argument the other way, stated fairly rather than buried: prorating
 * gives a smoother, more truthful intra-month picture of what has actually
 * been consumed to date, which matters more if the ceiling is raised mid-month
 * or if spend is reported per week.
 *
 * **What this selection is not.** It is not a Founder ruling and does not
 * purport to be one — the Founder offered both methods as acceptable, which is
 * what makes selecting one a builder act rather than a usurpation. It changes
 * no ceiling, no aggregation rule, and no value. `PRORATED_DAILY` is
 * implemented alongside it so the alternative is a configuration change and a
 * recorded decision, not a rewrite.
 */

import { micros, type Usd } from './money.js';
import { dateKey, daysInMonth, isOnOrBefore, type AccountingInstant } from './period.js';

export type RecognitionMethod = 'BOOK_FULL_MONTH_AT_START' | 'PRORATED_DAILY';

/** The selection. See this module's header for the authority and the reasoning. */
export const SELECTED_RECOGNITION_METHOD: RecognitionMethod = 'BOOK_FULL_MONTH_AT_START';

/** A fixed monthly infrastructure commitment, e.g. a database or host plan. */
export interface InfrastructureCommitment {
  readonly provider: string;
  readonly description: string;
  /** The known monthly figure, in micro-USD. Fixed plans are known in advance. */
  readonly monthlyMicros: number;
  /** First day the commitment is in force, `YYYY-MM-DD`. */
  readonly effectiveFrom: string;
  /** Day after the last day in force, `YYYY-MM-DD`, or null while open-ended. */
  readonly effectiveUntil?: string | null;
}

/**
 * Infrastructure cost recognized so far in the calendar month containing
 * `asOf`, under `method`.
 *
 * The instant is an argument and no clock is read, so the function is pure and
 * a test can pin any date.
 */
export function recognizeInfrastructure(
  commitments: readonly InfrastructureCommitment[],
  asOf: AccountingInstant,
  method: RecognitionMethod = SELECTED_RECOGNITION_METHOD,
): Usd {
  const total = commitments
    .filter((commitment) => inForce(commitment, asOf))
    .reduce((running, commitment) => running + recognizeOne(commitment, asOf, method), 0);
  return micros(total);
}

function inForce(commitment: InfrastructureCommitment, asOf: AccountingInstant): boolean {
  const today = dateKey(asOf);
  if (!isOnOrBefore(commitment.effectiveFrom, today)) return false;
  const until = commitment.effectiveUntil;
  if (until !== undefined && until !== null && isOnOrBefore(until, today)) return false;
  return true;
}

function recognizeOne(
  commitment: InfrastructureCommitment,
  asOf: AccountingInstant,
  method: RecognitionMethod,
): number {
  if (method === 'BOOK_FULL_MONTH_AT_START') {
    /*
     * The whole month is recognized the moment the month contains any day the
     * commitment is in force. A commitment that starts mid-month still books
     * its full monthly figure, which overstates that first month and is the
     * conservative direction — the direction this method was selected for.
     */
    return commitment.monthlyMicros;
  }

  const days = daysInMonth(asOf.year, asOf.month);
  return Math.round((commitment.monthlyMicros * asOf.dayOfMonth) / days);
}

/** What the month will cost in full, under either method. For reporting. */
export function monthlyCommitmentTotal(
  commitments: readonly InfrastructureCommitment[],
  asOf: AccountingInstant,
): Usd {
  return micros(
    commitments
      .filter((commitment) => inForce(commitment, asOf))
      .reduce((running, commitment) => running + commitment.monthlyMicros, 0),
  );
}
