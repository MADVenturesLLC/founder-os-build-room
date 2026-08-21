/**
 * Token → dollar conversion, without rates.
 *
 * **This package carries no rate data, deliberately.** `DEC-20260722-01`
 * clause 1 puts the canonical price table in `founder-os-console`, and clause
 * 2 gives the runtime the job of stamping the *version*, not the rates. A
 * second copy of the rates here would be a second thing to keep correct, and
 * the decision's whole point is that there is exactly one.
 *
 * So `PriceTable` is a port. Something outside supplies it. What this module
 * owns is the discipline around it:
 *
 * - A stamped version the table does not carry prices as **UNKNOWN**, never as
 *   the current version's rates (`DEC-20260722-01` clause 3: a `CURRENT`
 *   pointer may price a live record, *never* reprice an unstamped or
 *   historical one).
 * - A rate the table does not carry for the record's `(providerId, modelId)`
 *   prices as UNKNOWN, never as zero and never as a neighbouring model's rate.
 * - Non-token fees are computed only when the runtime supplied their input
 *   (`DEC-20260722-01` clause 5); absent that input the fee is omitted rather
 *   than estimated.
 */

import { micros, sum, unknown, ZERO, type Amount } from './money.js';

/** Provider-reported usage for one agent run. Tokens, never dollars. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /**
   * Cached input tokens, when the provider reports them. `undefined` means
   * "not reported", which is different from zero and is treated as such: the
   * cached-input fee is omitted rather than computed as nothing.
   */
  readonly cachedInputTokens?: number;
}

/** A rate row, in micro-USD per million tokens. */
export interface Rate {
  readonly inputMicrosPerMTok: number;
  readonly outputMicrosPerMTok: number;
  readonly cachedInputMicrosPerMTok?: number;
}

/**
 * The port. An implementation looks up an **immutable published version**;
 * `DEC-20260722-01` clause 3 forbids editing one, so a lookup that once
 * returned a rate must keep returning the same rate forever.
 */
export interface PriceTable {
  /** The rate, or `null` when this version does not carry this pair. */
  rateFor(priceTableVersion: string, providerId: string, modelId: string): Rate | null;
  /** Whether the version exists at all — absent is a different failure from a missing pair. */
  hasVersion(priceTableVersion: string): boolean;
}

/** One agent run's provider-reported usage, with the version stamped at room creation. */
export interface RunUsageRecord {
  readonly runId: string;
  readonly roomId: string;
  readonly providerId: string;
  readonly modelId: string;
  /** Stamped immutably at invocation (`DEC-20260722-01` clause 2). */
  readonly priceTableVersion: string | null;
  readonly usage: TokenUsage;
  readonly occurredAt: string;
}

/**
 * Price one run. Returns UNKNOWN rather than a number whenever the inputs do
 * not support a number.
 */
export function priceRun(record: RunUsageRecord, table: PriceTable): Amount {
  if (record.priceTableVersion === null || record.priceTableVersion.trim() === '') {
    return unknown(`run ${record.runId}: no price-table version stamped`);
  }
  if (!table.hasVersion(record.priceTableVersion)) {
    return unknown(
      `run ${record.runId}: price-table version ${record.priceTableVersion} is not published — ` +
        `repricing against a different version is forbidden (DEC-20260722-01 clause 3)`,
    );
  }

  const rate = table.rateFor(record.priceTableVersion, record.providerId, record.modelId);
  if (rate === null) {
    return unknown(
      `run ${record.runId}: price-table version ${record.priceTableVersion} carries no rate for ` +
        `${record.providerId}/${record.modelId}`,
    );
  }

  /*
   * Every token count and every rate must be a non-negative safe integer, and
   * anything else prices as UNKNOWN rather than as a number.
   *
   * `Number.isFinite` was the check, and it let three things through that all
   * end in a wrong ceiling decision rather than a paused gate:
   *
   *   - a NEGATIVE count produces negative spend, which subtracts from the
   *     monthly total and can make the limb permit a dispatch it should pause;
   *   - a FRACTIONAL count violates the integer-token contract silently, since
   *     `perMillion` rounds it away;
   *   - an unsafe or non-integer RATE makes `micros` throw, so the caller gets
   *     an exception where the contract promises UNKNOWN.
   *
   * `cachedInputTokens` is checked on the same terms, because it is added to
   * the same total. Raised by CodeRabbit on PR #2.
   */
  const { inputTokens, outputTokens, cachedInputTokens } = record.usage;
  if (!isTokenCount(inputTokens) || !isTokenCount(outputTokens)) {
    return unknown(
      `run ${record.runId}: token counts must be non-negative safe integers; ` +
        `got input=${inputTokens}, output=${outputTokens}`,
    );
  }
  if (!isRate(rate.inputMicrosPerMTok) || !isRate(rate.outputMicrosPerMTok)) {
    return unknown(
      `run ${record.runId}: price-table version ${record.priceTableVersion} carries an ` +
        `unusable rate for ${record.providerId}/${record.modelId}`,
    );
  }

  const parts: Amount[] = [
    micros(perMillion(inputTokens, rate.inputMicrosPerMTok)),
    micros(perMillion(outputTokens, rate.outputMicrosPerMTok)),
  ];

  // Input-gated: computed only when the runtime supplied the input.
  if (cachedInputTokens !== undefined && rate.cachedInputMicrosPerMTok !== undefined) {
    if (!isTokenCount(cachedInputTokens) || !isRate(rate.cachedInputMicrosPerMTok)) {
      return unknown(
        `run ${record.runId}: cached-input count or rate is not a non-negative safe integer`,
      );
    }
    parts.push(micros(perMillion(cachedInputTokens, rate.cachedInputMicrosPerMTok)));
  }

  return sum(parts);
}

/** A reported token count: a non-negative safe integer, and nothing else. */
function isTokenCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** A micro-USD-per-million-tokens rate, on the same terms as a token count. */
function isRate(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** Total for a set of runs. Unknown in any run makes the total unknown. */
export function priceRuns(records: readonly RunUsageRecord[], table: PriceTable): Amount {
  if (records.length === 0) return ZERO;
  const priced = records.map((record) => priceRun(record, table));
  const total = sum(priced);
  // `sum` already propagates UNKNOWN: one unknown part makes the total
  // unknown, carrying the first reason. There is nothing left to branch on
  // here. This line was `isUnknown(total) ? total : total` — both arms
  // identical, so it read as a deliberate unknown-preserving step while doing
  // nothing. Removed rather than left as decoration that invites trust.
  return total;
}

/*
 * Exact, via BigInt, because the intermediate product is the hazard here —
 * not the result.
 *
 * `tokens` and `microsPerMTok` are each validated as non-negative SAFE
 * integers before this is called. Their PRODUCT is not bounded by that: once
 * it passes `Number.MAX_SAFE_INTEGER`, doubles space out and the multiply
 * lands on a neighbouring representable value.
 *
 * Dividing by a million then shrinks that error a millionfold, which is
 * exactly why this is easy to miss — almost always the error disappears under
 * `Math.round` and the double path gives the right answer. It survives only
 * when the true quotient sits within the error of a half-micro rounding
 * boundary. That does happen, and the smallest case a search over the legal
 * input domain turned up is the one pinned in `test/cost-meter.test.ts`:
 * 191_642_537_393_617 tokens at 47 micros/MTok, whose product
 * 9_007_199_257_499_999 clears `MAX_SAFE_INTEGER` by a hair. Exact is
 * 9_007_199_257 micro-USD; `Math.round((tokens * rate) / 1e6)` returns
 * 9_007_199_258.
 *
 * One micro-USD, and no realistic single run reaches it — at a $3/MTok rate
 * the product only clears the boundary past three billion tokens in ONE
 * record. So this is not a live mispricing. What makes it worth removing is
 * the shape of the failure rather than its size: the wrong value lands back
 * inside the safe range as an ordinary integer, `micros()` accepts it, and
 * nothing throws. A silently wrong price is the one outcome every other guard
 * in this module exists to prevent, and BigInt buys exactness at any
 * magnitude for the cost of two conversions.
 *
 * `(p + 500_000n) / 1_000_000n` is floor((p + 500000) / 1000000), which equals
 * `Math.round` for non-negative inputs — and both inputs are non-negative by
 * contract.
 *
 * A result that genuinely exceeds `MAX_SAFE_INTEGER` is returned as-is so
 * `micros()` throws, which is the behaviour money.ts documents for that range:
 * "arithmetic has already gone wrong upstream". This removes the silent case
 * and leaves the loud one alone.
 */
function perMillion(tokens: number, microsPerMTok: number): number {
  const product = BigInt(tokens) * BigInt(microsPerMTok);
  return Number((product + 500_000n) / 1_000_000n);
}
