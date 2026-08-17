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
import {
  dateKey,
  daysInMonth,
  isOnOrBefore,
  monthKey,
  PeriodError,
  type AccountingInstant,
} from './period.js';

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
    .filter((commitment) => servedThisMonth(commitment, asOf))
    .reduce((running, commitment) => running + recognizeOne(commitment, asOf, method), 0);
  return micros(total);
}

/**
 * Did this commitment serve any part of the evaluated month, up to `asOf`?
 *
 * The filter was `inForce(commitment, asOf)` — in force *on the day itself* —
 * which silently dropped a commitment that ended earlier in the same month. A
 * plan running 1–9 August, evaluated on 17 August, contributed nothing to
 * August, when it had in fact been paid for nine days of it. That understates
 * the month, and understating is the one direction a fail-closed spend meter
 * must not fail in: the ceiling comparison then permits a dispatch that the
 * true figure would have paused. Raised by CodeRabbit on PR #2.
 *
 * The test is overlap with the window `[the 1st, asOf]`, not membership at a
 * point:
 *
 *   - it began on or before `asOf` — a commitment starting later in the month
 *     has not been incurred yet, and `-09` recognizes cost when incurred;
 *   - and it had not already ended before the month began. `effectiveUntil` is
 *     the day AFTER the last day in force, so ending exactly on the 1st means
 *     it served no day of this month.
 */
function servedThisMonth(commitment: InfrastructureCommitment, asOf: AccountingInstant): boolean {
  const today = dateKey(asOf);
  const monthStart = `${monthKey(asOf)}-01`;

  const from = requireDateKey(commitment.effectiveFrom, 'effectiveFrom', commitment);
  if (!isOnOrBefore(from, today)) return false;

  const until = commitment.effectiveUntil;
  if (until !== undefined && until !== null) {
    if (isOnOrBefore(requireDateKey(until, 'effectiveUntil', commitment), monthStart)) return false;
  }

  return true;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A commitment date, in the strict `YYYY-MM-DD` form the comparisons require.
 *
 * These dates are compared as **strings**, which is correct only because
 * zero-padded ISO dates sort chronologically. A value that is not in that form
 * sorts somewhere arbitrary and silently changes the answer — `'2026-8-1'`
 * compares as greater than `'2026-08-17'`, so a commitment that served the
 * whole month is dropped and the month is understated; `'unknown'` compares as
 * greater than any date key, so a commitment that ended stays included.
 *
 * Understating is the direction this module's own header calls unacceptable,
 * so malformed input is refused rather than absorbed. The rest of the package
 * fails closed by returning UNKNOWN, but `recognizeInfrastructure` returns
 * `Usd` and has no UNKNOWN to return — the check therefore happens at the
 * boundary, and throws. Raised by CodeRabbit on PR #2.
 */
function requireDateKey(value: string, field: string, commitment: InfrastructureCommitment): string {
  if (!DATE_KEY.test(value)) {
    throw new PeriodError(
      `${commitment.provider}: ${field} must be YYYY-MM-DD; got ${JSON.stringify(value)}. ` +
        `These dates are compared as strings, so a malformed one can drop a served ` +
        `commitment and understate the month.`,
    );
  }
  return value;
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

  /*
   * PRORATED_DAILY counts the days this commitment actually SERVED inside the
   * month up to `asOf`, not the days that have elapsed. For a commitment that
   * ran the whole window those are the same number; for one that started on
   * the 5th or ended on the 9th they are not, and using elapsed days would
   * charge a month for service it did not have — or, worse in this direction,
   * charge nothing at all for a commitment that ended mid-month.
   */
  const days = daysInMonth(asOf.year, asOf.month);
  const served = daysServedThisMonth(commitment, asOf);
  return Math.round((commitment.monthlyMicros * served) / days);
}

/**
 * Days of the evaluated month, up to and including `asOf`, on which the
 * commitment was in force.
 *
 * Day arithmetic only, and only within one month, so no date construction is
 * needed — the whole package deliberately builds no `Date`.
 */
function daysServedThisMonth(commitment: InfrastructureCommitment, asOf: AccountingInstant): number {
  const month = monthKey(asOf);

  // Starts on the 1st unless it began inside this month.
  const firstServed = commitment.effectiveFrom.startsWith(`${month}-`)
    ? Number(commitment.effectiveFrom.slice(-2))
    : 1;

  // Ends at `asOf` unless it stopped inside this month; `effectiveUntil` is
  // the day after the last day in force, so the last served day is one before.
  const until = commitment.effectiveUntil;
  const lastServed =
    until !== undefined && until !== null && until.startsWith(`${month}-`)
      ? Math.min(asOf.dayOfMonth, Number(until.slice(-2)) - 1)
      : asOf.dayOfMonth;

  return Math.max(0, lastServed - firstServed + 1);
}

/** What the month will cost in full, under either method. For reporting. */
export function monthlyCommitmentTotal(
  commitments: readonly InfrastructureCommitment[],
  asOf: AccountingInstant,
): Usd {
  return micros(
    commitments
      .filter((commitment) => servedThisMonth(commitment, asOf))
      .reduce((running, commitment) => running + commitment.monthlyMicros, 0),
  );
}
