/**
 * The accounting period, as plain numbers.
 *
 * **No `Date` is constructed anywhere in this package, deliberately.** The
 * purity suite forbids date construction in the pure packages because a clock
 * read breaks replay determinism — and while constructing one from a supplied
 * string reads no clock, a rule that has to distinguish the argument forms is
 * a rule that will eventually be got wrong. Taking the period as three
 * integers removes the question: there is nothing here that could read a
 * clock, and the calendar-month rule the Founder ruled becomes an explicit
 * input rather than something inferred from an instant.
 *
 * The accounting period is a **calendar month, reset on the 1st** —
 * `DEC-20260815-09`, Founder ruling of 2026-08-15.
 */

export interface AccountingInstant {
  /** Four-digit calendar year, UTC. */
  readonly year: number;
  /** Calendar month, 1–12, UTC. */
  readonly month: number;
  /** Day of the month, 1–31, UTC. The elapsed day, used only for prorating. */
  readonly dayOfMonth: number;
}

export class PeriodError extends Error {
  override readonly name = 'PeriodError';
}

export function accountingInstant(year: number, month: number, dayOfMonth: number): AccountingInstant {
  if (!Number.isInteger(year) || year < 1970) throw new PeriodError(`bad year: ${year}`);
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new PeriodError(`bad month: ${month}`);
  const limit = daysInMonth(year, month);
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > limit) {
    throw new PeriodError(`bad day of month: ${dayOfMonth} (${year}-${month} has ${limit} days)`);
  }
  return { year, month, dayOfMonth };
}

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Days in a UTC calendar month, by the proleptic Gregorian leap rule. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  const days = DAYS_PER_MONTH[month - 1];
  if (days === undefined) throw new PeriodError(`bad month: ${month}`);
  return days;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** `YYYY-MM` for an instant. The key a month's spend is accumulated under. */
export function monthKey(instant: AccountingInstant): string {
  return `${pad4(instant.year)}-${pad2(instant.month)}`;
}

/** `YYYY-MM-DD` for an instant, for comparison against commitment dates. */
export function dateKey(instant: AccountingInstant): string {
  return `${monthKey(instant)}-${pad2(instant.dayOfMonth)}`;
}

/**
 * The `YYYY-MM` a recorded timestamp falls in, or `null` when it cannot be
 * determined.
 *
 * Requires a **UTC-normalized** RFC3339 instant — one ending in `Z`. A
 * timestamp carrying a numeric offset (`+10:00`) belongs to a different UTC
 * month than its own literal prefix suggests, so reading the prefix would
 * silently mis-bucket it near a month boundary. Returning `null` sends it down
 * the UNKNOWN path instead, which pauses the gate rather than counting the
 * spend in the wrong month.
 */
export function monthKeyOf(occurredAt: string): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.exec(occurredAt);
  if (match === null) return null;
  const [, year, month] = match;
  if (year === undefined || month === undefined) return null;
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return `${year}-${month}`;
}

/**
 * Compare two `YYYY-MM-DD` dates. Zero-padded ISO dates order lexicographically
 * exactly as they order chronologically, so this needs no date arithmetic.
 */
export function isOnOrBefore(a: string, b: string): boolean {
  return a <= b;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function pad4(value: number): string {
  return String(value).padStart(4, '0');
}
