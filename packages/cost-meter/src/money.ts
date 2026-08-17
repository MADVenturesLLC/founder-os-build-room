/**
 * Money as integers.
 *
 * Dollar amounts are held in **micro-USD** (1 USD = 1_000_000 µUSD) and every
 * arithmetic operation stays in integers. Floating point would make the
 * ceiling comparison depend on representation error, and the ceiling
 * comparison is the whole point of this package: `DEC-20260815-09` pauses
 * dispatch when spend goes **above** USD 85 and does not pause at exactly USD
 * 85, so a figure that lands a fraction of a cent off changes the outcome.
 *
 * `UNKNOWN` is a first-class value, not a zero. `DEC-20260722-01` clause 3
 * requires a record whose stamped price-table version is absent to price as
 * UNKNOWN, *never guessed* — and a guess of zero is the most dangerous guess
 * available, because it always passes the gate.
 */

export const MICROS_PER_USD = 1_000_000;

/** A known dollar amount, in integer micro-USD. */
export interface Usd {
  readonly kind: 'usd';
  readonly micros: number;
}

/**
 * A cost that could not be computed — an absent price-table version, a rate
 * the table does not carry, or usage the provider did not report.
 */
export interface UnknownUsd {
  readonly kind: 'unknown';
  readonly reason: string;
}

export type Amount = Usd | UnknownUsd;

export function usd(dollars: number): Usd {
  if (!Number.isFinite(dollars)) {
    throw new RangeError(`not a finite dollar amount: ${dollars}`);
  }
  return { kind: 'usd', micros: Math.round(dollars * MICROS_PER_USD) };
}

export function micros(value: number): Usd {
  if (!Number.isInteger(value)) {
    throw new RangeError(`micro-USD must be an integer; got ${value}`);
  }
  return { kind: 'usd', micros: value };
}

export function unknown(reason: string): UnknownUsd {
  return { kind: 'unknown', reason };
}

export const ZERO: Usd = { kind: 'usd', micros: 0 };

export function isUnknown(amount: Amount): amount is UnknownUsd {
  return amount.kind === 'unknown';
}

/**
 * Sum amounts. **Unknown is absorbing**: if any component is unknown, the
 * total is unknown. Skipping the unknown component and summing the rest would
 * report a total that is knowably too low, and report it as if it were the
 * figure — which is the failure mode `DEC-20260721-03` calls out by requiring
 * UNKNOWN never be silently approximated.
 */
export function sum(amounts: readonly Amount[]): Amount {
  const unknowns = amounts.filter(isUnknown);
  if (unknowns.length > 0) {
    return unknown(unknowns.map((u) => u.reason).join('; '));
  }
  return micros(
    amounts.reduce((total, amount) => total + (amount as Usd).micros, 0),
  );
}

/** Format for display only. Never round-trip a displayed figure back into arithmetic. */
export function format(amount: Amount): string {
  if (isUnknown(amount)) return 'UNKNOWN';
  return `USD ${(amount.micros / MICROS_PER_USD).toFixed(4)}`;
}
