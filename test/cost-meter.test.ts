/**
 * Phase 2 — the cost meter, against the ratified rule.
 *
 * `DEC-20260815-17` exit criterion 3 requires the meter to implement the
 * `-09`/`-16` enforcement rule with the recognition choice selected and
 * recorded. Each ratified value and semantic is pinned by a test here, so a
 * later edit that quietly changes one fails rather than drifts:
 *
 * - USD 85 monthly ceiling, pausing strictly **above** it
 * - per-room token ceiling, refusing at **≥**
 * - AND precedence — either limb can pause
 * - infrastructure counted when incurred, calendar month reset on the 1st
 * - UNKNOWN never priced as zero, and never passing the gate
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  accountingInstant,
  daysInMonth,
  evaluateDispatch,
  format,
  isUnknown,
  INTERIM_PROVIDER_CAP_COMBINED,
  maximumOvershoot,
  micros,
  MONTHLY_CEILING,
  monthKeyOf,
  monthlySpend,
  PeriodError,
  priceRun,
  recognizeInfrastructure,
  SELECTED_RECOGNITION_METHOD,
  usd,
  type InfrastructureCommitment,
  type PriceTable,
  type RunUsageRecord,
} from '../packages/cost-meter/src/index.js';

const VERSION = '2026-08-17-provisional';

/**
 * A stub price table. Rates are fabricated for the test and are not a rate
 * source: `DEC-20260722-01` clause 1 makes `founder-os-console` the only
 * canonical one, and this package deliberately carries none.
 */
const TABLE: PriceTable = {
  hasVersion: (version) => version === VERSION,
  rateFor: (version, provider, model) =>
    version === VERSION && provider === 'test-provider' && model === 'test-model'
      ? { inputMicrosPerMTok: 1_000_000, outputMicrosPerMTok: 2_000_000 }
      : null,
};

function run(overrides: Partial<RunUsageRecord> = {}): RunUsageRecord {
  return {
    runId: 'run-1',
    roomId: 'room-1',
    providerId: 'test-provider',
    modelId: 'test-model',
    priceTableVersion: VERSION,
    usage: { inputTokens: 1_000_000, outputTokens: 0 },
    occurredAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  };
}

const NEON: InfrastructureCommitment = {
  provider: 'neon',
  description: 'operational Postgres',
  monthlyMicros: usd(19).micros,
  effectiveFrom: '2026-08-01',
};

function budget(overrides: Partial<Parameters<typeof evaluateDispatch>[0]['budget']> = {}) {
  return {
    roomId: 'room-1',
    tokenCeiling: 1_000_000,
    tokensSpent: 0,
    tokensReserved: 0,
    perRunTokenCap: 100_000,
    ...overrides,
  };
}

describe('cost meter — ratified values', () => {
  it('pins the monthly ceiling at USD 85', () => {
    assert.equal(MONTHLY_CEILING.micros, 85_000_000);
  });

  it('pins the interim combined provider cap at USD 50 and does not gate on it', () => {
    assert.equal(INTERIM_PROVIDER_CAP_COMBINED.micros, 50_000_000);

    // The interim cap acts at the provider, not at dispatch (DEC-20260815-09,
    // 2026-08-17). A month at USD 60 is above it and still permitted here,
    // because this gate is the ceiling's, not the interim control's.
    const decision = evaluateDispatch({
      asOf: accountingInstant(2026, 8, 17),
      ledger: {
        infrastructure: [{ ...NEON, monthlyMicros: usd(60).micros }],
        runs: [],
      },
      budget: budget(),
      requestedTokens: 1_000,
      priceTable: TABLE,
    });

    assert.equal(decision.permit, true);
  });

  it('records the recognition selection', () => {
    assert.equal(SELECTED_RECOGNITION_METHOD, 'BOOK_FULL_MONTH_AT_START');
  });
});

describe('cost meter — the monthly limb boundary', () => {
  const at = (dollars: number) =>
    evaluateDispatch({
      asOf: accountingInstant(2026, 8, 17),
      ledger: { infrastructure: [{ ...NEON, monthlyMicros: usd(dollars).micros }], runs: [] },
      budget: budget(),
      requestedTokens: 1_000,
      priceTable: TABLE,
    });

  it('permits at exactly the ceiling — clause 2 pauses ABOVE it, not at it', () => {
    const decision = at(85);
    assert.equal(decision.permit, true);
  });

  it('pauses a fraction above the ceiling', () => {
    const decision = at(85.01);
    assert.equal(decision.permit, false);
    assert.equal(decision.pausedBy[0]?.limb, 'monthly_spend');
    assert.match(decision.pausedBy[0]?.reason ?? '', /Founder-visible blocked state/);
  });

  it('permits below the ceiling', () => {
    assert.equal(at(84.99).permit, true);
  });
});

describe('cost meter — the per-room token limb boundary', () => {
  it('refuses at exactly the ceiling — `-16` clause 2 says spent + reserved >= ceiling', () => {
    const decision = evaluateDispatch({
      asOf: accountingInstant(2026, 8, 17),
      ledger: { infrastructure: [], runs: [] },
      budget: budget({ tokenCeiling: 1_000, tokensSpent: 900, tokensReserved: 100 }),
      requestedTokens: 0,
      priceTable: TABLE,
    });

    assert.equal(decision.permit, false);
    assert.equal(decision.pausedBy[0]?.limb, 'per_room_tokens');
  });

  it('permits just below the ceiling', () => {
    const decision = evaluateDispatch({
      asOf: accountingInstant(2026, 8, 17),
      ledger: { infrastructure: [], runs: [] },
      budget: budget({ tokenCeiling: 1_000, tokensSpent: 900, tokensReserved: 99 }),
      requestedTokens: 0,
      priceTable: TABLE,
    });

    assert.equal(decision.permit, true);
  });

  it('pauses a dispatch above the per-run hard cap', () => {
    const decision = evaluateDispatch({
      asOf: accountingInstant(2026, 8, 17),
      ledger: { infrastructure: [], runs: [] },
      budget: budget({ perRunTokenCap: 10_000 }),
      requestedTokens: 10_001,
      priceTable: TABLE,
    });

    assert.equal(decision.permit, false);
    assert.equal(decision.pausedBy[0]?.limb, 'per_run_cap');
  });
});

describe('cost meter — AND precedence', () => {
  it('either limb can pause, and every limb is reported even when one already paused', () => {
    const decision = evaluateDispatch({
      asOf: accountingInstant(2026, 8, 17),
      ledger: { infrastructure: [{ ...NEON, monthlyMicros: usd(200).micros }], runs: [] },
      budget: budget({ tokenCeiling: 100, tokensSpent: 100 }),
      requestedTokens: 999_999,
      priceTable: TABLE,
    });

    assert.equal(decision.permit, false);
    // Four limbs since `token_inputs` joined them: monthly spend, token-input
    // validity, per-room tokens, per-run cap. Only three of them pause here —
    // the token values in this case are all valid, so `token_inputs` permits
    // while the other three refuse. That is the point of reporting every limb.
    assert.equal(decision.limbs.length, 4);
    assert.equal(decision.pausedBy.length, 3, 'the three spend/token limbs should each refuse');
    assert.equal(
      decision.limbs.find((limb) => limb.limb === 'token_inputs')?.verdict,
      'permit',
      'valid token values must not be reported as a validation failure',
    );
  });

  it('pauses on a token value that is not a number, rather than reading a false comparison', () => {
    /*
     * `NaN >= ceiling` is false and `NaN > perRunTokenCap` is false, so a NaN
     * request satisfied both token limbs and the dispatch was permitted. This
     * is what a missing or mis-parsed provider field looks like by the time it
     * reaches the meter. Raised by CodeRabbit on PR #2.
     */
    const decision = evaluateDispatch({
      asOf: accountingInstant(2026, 8, 17),
      ledger: { infrastructure: [], runs: [] },
      budget: budget({ tokenCeiling: 1_000_000, perRunTokenCap: 1_000_000 }),
      requestedTokens: Number.NaN,
      priceTable: TABLE,
    });

    assert.equal(decision.permit, false);
    // Located by name, not by position: a limb inserted before `token_inputs`
    // would silently break a `pausedBy[0]` assertion.
    const paused = decision.pausedBy.find((limb) => limb.limb === 'token_inputs');
    assert.ok(paused, 'token_inputs must pause');
    assert.match(paused.reason, /requestedTokens=NaN/);
  });

  it('pauses on a negative tokensSpent, which would otherwise buy room under the ceiling', () => {
    // A negative spent value REDUCES the committed total, so a room already at
    // its ceiling would be permitted to dispatch again.
    const decision = evaluateDispatch({
      asOf: accountingInstant(2026, 8, 17),
      ledger: { infrastructure: [], runs: [] },
      budget: budget({ tokenCeiling: 1_000, tokensSpent: -5_000, tokensReserved: 0 }),
      requestedTokens: 900,
      priceTable: TABLE,
    });

    assert.equal(decision.permit, false);
    assert.ok(decision.pausedBy.some((limb) => limb.limb === 'token_inputs'));
  });

  it('permits only when every limb permits', () => {
    const decision = evaluateDispatch({
      asOf: accountingInstant(2026, 8, 17),
      ledger: { infrastructure: [NEON], runs: [run()] },
      budget: budget(),
      requestedTokens: 1_000,
      priceTable: TABLE,
    });

    assert.equal(decision.permit, true);
    assert.ok(decision.limbs.every((limb) => limb.verdict === 'permit'));
  });
});

describe('cost meter — UNKNOWN is never a zero and never passes', () => {
  it('prices a run with no stamped version as UNKNOWN', () => {
    const amount = priceRun(run({ priceTableVersion: null }), TABLE);
    assert.ok(isUnknown(amount));
    assert.equal(format(amount), 'UNKNOWN');
  });

  it('prices a run stamped with an unpublished version as UNKNOWN rather than repricing it', () => {
    const amount = priceRun(run({ priceTableVersion: 'some-other-version' }), TABLE);
    assert.ok(isUnknown(amount));
    assert.match(amount.reason, /not published/);
  });

  it('prices a model the version does not carry as UNKNOWN rather than zero', () => {
    const amount = priceRun(run({ modelId: 'unlisted-model' }), TABLE);
    assert.ok(isUnknown(amount));
    assert.match(amount.reason, /carries no rate/);
  });

  it('prices a negative token count as UNKNOWN rather than as negative spend', () => {
    /*
     * `Number.isFinite` accepted this, and negative spend SUBTRACTS from the
     * monthly total — so a corrupted usage record could buy room under the
     * ceiling for a dispatch that should have paused. Raised by CodeRabbit on
     * PR #2.
     */
    const amount = priceRun(run({ usage: { inputTokens: -1_000_000, outputTokens: 0 } }), TABLE);
    assert.ok(isUnknown(amount));
    assert.match(amount.reason, /non-negative safe integers/);
  });

  it('prices a fractional token count as UNKNOWN rather than rounding it away', () => {
    const amount = priceRun(run({ usage: { inputTokens: 1.5, outputTokens: 0 } }), TABLE);
    assert.ok(isUnknown(amount));
  });

  it('prices an unsafe token count as UNKNOWN rather than losing precision', () => {
    const amount = priceRun(
      run({ usage: { inputTokens: Number.MAX_SAFE_INTEGER + 2, outputTokens: 0 } }),
      TABLE,
    );
    assert.ok(isUnknown(amount));
  });

  it('returns UNKNOWN for an unusable rate rather than throwing at the caller', () => {
    // The contract is UNKNOWN, so a bad table entry must not surface as an
    // exception the caller has no way to treat as a pricing gap.
    const brokenTable: PriceTable = {
      hasVersion: (version) => version === VERSION,
      rateFor: () => ({ inputMicrosPerMTok: Number.NaN, outputMicrosPerMTok: 2_000_000 }),
    };

    const amount = priceRun(run(), brokenTable);
    assert.ok(isUnknown(amount));
    assert.match(amount.reason, /unusable rate/);
  });

  it('makes the month total UNKNOWN when any run is unknown', () => {
    const total = monthlySpend(
      { infrastructure: [NEON], runs: [run(), run({ runId: 'run-2', priceTableVersion: null })] },
      accountingInstant(2026, 8, 17),
      TABLE,
    );
    assert.ok(isUnknown(total));
  });

  it('pauses dispatch when the month total is UNKNOWN — fail closed', () => {
    const decision = evaluateDispatch({
      asOf: accountingInstant(2026, 8, 17),
      ledger: { infrastructure: [], runs: [run({ priceTableVersion: null })] },
      budget: budget(),
      requestedTokens: 1_000,
      priceTable: TABLE,
    });

    assert.equal(decision.permit, false);
    assert.equal(decision.pausedBy[0]?.limb, 'monthly_spend');
    assert.match(decision.pausedBy[0]?.reason ?? '', /UNKNOWN/);
  });
});

describe('cost meter — the overshoot bound is a bound', () => {
  /*
   * `maximumOvershoot` priced every capped token as INPUT. The table here
   * prices output at twice input — which is ordinary — so an output-heavy run
   * cost double the "maximum". A bound a single ordinary run exceeds is not a
   * bound, and this function exists precisely so `DEC-20260815-16` clause 3's
   * overshoot is reportable rather than a footnote. Raised by CodeRabbit on
   * PR #2.
   */
  it('prices the cap at the most expensive token class, not at the input rate', () => {
    const bound = maximumOvershoot(budget({ perRunTokenCap: 1_000_000 }), TABLE, run());
    assert.ok(!isUnknown(bound));

    // 1M tokens at the OUTPUT rate of 2_000_000 µUSD/MTok = USD 2.00.
    // Priced as input it would have been USD 1.00 — half the true bound.
    assert.equal(bound.micros, usd(2).micros);
  });

  it('is at least what a run entirely of the dearest class would cost', () => {
    const cap = 500_000;
    const bound = maximumOvershoot(budget({ perRunTokenCap: cap }), TABLE, run());
    const outputOnly = priceRun(run({ usage: { inputTokens: 0, outputTokens: cap } }), TABLE);

    assert.ok(!isUnknown(bound) && !isUnknown(outputOnly));
    assert.ok(bound.micros >= outputOnly.micros, 'the bound must not be under a real run');
  });

  it('is UNKNOWN when any class cannot be priced, rather than quietly using the rest', () => {
    const bound = maximumOvershoot(budget(), TABLE, run({ priceTableVersion: null }));
    assert.ok(isUnknown(bound));
    assert.match(bound.reason, /overshoot bound is UNKNOWN/);
  });
});

describe('cost meter — money stays exact', () => {
  it('refuses a micro-USD value past the safe-integer range', () => {
    /*
     * `Number.isInteger` accepted these. Past MAX_SAFE_INTEGER doubles no
     * longer represent consecutive integers, so sums are silently wrong and
     * distinct values can compare equal — and this type is what the ceiling
     * decision is made from. Raised by CodeRabbit on PR #2.
     */
    assert.throws(() => micros(Number.MAX_SAFE_INTEGER + 2), RangeError);
    assert.throws(() => micros(Number.NaN), RangeError);
    assert.throws(() => micros(Number.POSITIVE_INFINITY), RangeError);
  });

  it('accepts the boundary itself, so the check is a bound and not an off-by-one', () => {
    assert.equal(micros(Number.MAX_SAFE_INTEGER).micros, Number.MAX_SAFE_INTEGER);
  });

  it('applies the same bound to a dollar amount, not only to raw micro-USD', () => {
    assert.throws(() => usd(Number.MAX_SAFE_INTEGER), RangeError);
  });
});

describe('cost meter — the token x rate product stays exact past MAX_SAFE_INTEGER', () => {
  /*
   * `perMillion` multiplies two validated safe integers, and their PRODUCT is
   * not bounded by that validation. Past `Number.MAX_SAFE_INTEGER` the double
   * multiply lands on a neighbouring representable value; dividing by a
   * million shrinks the error a millionfold, so it usually vanishes under
   * rounding — which is precisely what made this easy to miss.
   *
   * It survives when the true quotient sits within that error of a half-micro
   * rounding boundary. These are the smallest such inputs a search over the
   * legal domain produced. They are not realistic run sizes and are not
   * meant to be: what they pin is that a value which clears the boundary is
   * priced EXACTLY rather than being handed back one micro wrong, in safe
   * range, with nothing thrown.
   */
  const EXACT_VERSION = '2026-08-17-exactness';

  function tableWithInputRate(inputMicrosPerMTok: number): PriceTable {
    return {
      hasVersion: (version) => version === EXACT_VERSION,
      rateFor: (version, provider, model) =>
        version === EXACT_VERSION && provider === 'test-provider' && model === 'test-model'
          ? { inputMicrosPerMTok, outputMicrosPerMTok: 0 }
          : null,
    };
  }

  it('prices the smallest product past MAX_SAFE_INTEGER exactly, not one micro high', () => {
    const inputTokens = 191_642_537_393_617;
    const rate = 47;

    // The premise: this pair is legal input (both safe integers) whose product
    // is past the safe range. If either stops being true the case is no longer
    // testing what it claims to.
    assert.ok(Number.isSafeInteger(inputTokens) && Number.isSafeInteger(rate));
    assert.equal(BigInt(inputTokens) * BigInt(rate), 9_007_199_257_499_999n);
    assert.ok(9_007_199_257_499_999n > BigInt(Number.MAX_SAFE_INTEGER));

    const amount = priceRun(
      run({ priceTableVersion: EXACT_VERSION, usage: { inputTokens, outputTokens: 0 } }),
      tableWithInputRate(rate),
    );

    assert.ok(!isUnknown(amount));
    // Exact: floor((9_007_199_257_499_999 + 500_000) / 1_000_000).
    assert.equal(amount.micros, 9_007_199_257);
    // And the value the old double path produced, named so a regression is
    // recognisable rather than just "some other number".
    assert.notEqual(amount.micros, 9_007_199_258);
    assert.equal(Math.round((inputTokens * rate) / 1_000_000), 9_007_199_258);
  });

  it('prices a large product exactly in both rounding directions', () => {
    // At this magnitude the double error exceeds half a micro outright, so the
    // failure is systematic rather than boundary-adjacent. One case rounds the
    // wrong way up, the other the wrong way down.
    const rate = 9_000_000;
    const cases: { inputTokens: number; exact: number; doublePath: number }[] = [
      { inputTokens: 533_333_342_333_360, exact: 4_800_000_081_000_240, doublePath: 4_800_000_081_000_241 },
      { inputTokens: 533_333_347_333_375, exact: 4_800_000_126_000_375, doublePath: 4_800_000_126_000_374 },
    ];

    for (const { inputTokens, exact, doublePath } of cases) {
      const amount = priceRun(
        run({ priceTableVersion: EXACT_VERSION, usage: { inputTokens, outputTokens: 0 } }),
        tableWithInputRate(rate),
      );

      assert.ok(!isUnknown(amount));
      assert.equal(amount.micros, exact);
      assert.equal(Math.round((inputTokens * rate) / 1_000_000), doublePath);
    }
  });

  it('still throws when the priced result itself is past the safe range', () => {
    /*
     * The fix removes the SILENT wrong answer; it does not silence the loud
     * one. A product whose quotient genuinely exceeds MAX_SAFE_INTEGER is
     * handed to `micros()` unchanged, and money.ts documents a throw there.
     */
    assert.throws(
      () =>
        priceRun(
          run({
            priceTableVersion: EXACT_VERSION,
            usage: { inputTokens: 9_007_199_254_740_991, outputTokens: 0 },
          }),
          // At 1_000_000 micros/MTok the quotient is MAX_SAFE_INTEGER itself,
          // which `micros()` accepts as a bound rather than an overflow.
          // Doubling the rate doubles the quotient and clears it.
          tableWithInputRate(2_000_000),
        ),
      RangeError,
    );
  });
});

describe('cost meter — infrastructure recognition', () => {
  it('books the full month at the start under the selected method', () => {
    const onTheFirst = recognizeInfrastructure([NEON], accountingInstant(2026, 8, 1));
    const onTheLast = recognizeInfrastructure([NEON], accountingInstant(2026, 8, 31));

    assert.equal(onTheFirst.micros, usd(19).micros);
    assert.equal(onTheLast.micros, usd(19).micros, 'the figure does not grow through the month');
  });

  it('prorates by elapsed days under the alternative method', () => {
    const halfway = recognizeInfrastructure([NEON], accountingInstant(2026, 8, 16), 'PRORATED_DAILY');
    // 16 of 31 days.
    assert.equal(halfway.micros, Math.round((usd(19).micros * 16) / 31));
  });

  it('recognizes nothing for a commitment not yet in force', () => {
    const future: InfrastructureCommitment = { ...NEON, effectiveFrom: '2026-09-01' };
    assert.equal(recognizeInfrastructure([future], accountingInstant(2026, 8, 17)).micros, 0);
  });

  it('still recognizes a commitment that ended earlier in the same month', () => {
    /*
     * This test previously asserted zero, and it was wrong in the same way the
     * code was: a plan that ran 1–9 August was dropped from August entirely
     * once the 10th passed, so nine days of paid service vanished from the
     * month's total. That understates the month, which is the one direction a
     * fail-closed spend meter must not fail in — the ceiling comparison then
     * permits a dispatch the true figure would have paused. Raised by
     * CodeRabbit on PR #2.
     */
    const ended: InfrastructureCommitment = { ...NEON, effectiveUntil: '2026-08-10' };
    const recognized = recognizeInfrastructure([ended], accountingInstant(2026, 8, 17));

    // Under BOOK_FULL_MONTH_AT_START a month containing any served day books
    // the full monthly figure — the conservative direction this method was
    // selected for.
    assert.equal(recognized.micros, NEON.monthlyMicros);
  });

  it('recognizes nothing for a commitment that ended before this month began', () => {
    // `effectiveUntil` is the day AFTER the last day in force, so ending on
    // the 1st means it served no day of August.
    const ended: InfrastructureCommitment = { ...NEON, effectiveUntil: '2026-08-01' };
    assert.equal(recognizeInfrastructure([ended], accountingInstant(2026, 8, 17)).micros, 0);
  });

  it('refuses a malformed commitment date rather than comparing it as a string', () => {
    /*
     * These dates are compared as strings, which works only for the strict
     * `YYYY-MM-DD` form. `'2026-8-1'` sorts ABOVE `'2026-08-17'`, so a
     * commitment that served the whole month would be dropped and the month
     * understated — the direction this module refuses to be wrong in.
     * `'unknown'` sorts above any date, keeping an ended commitment included.
     * Raised by CodeRabbit on PR #2.
     */
    const unpadded: InfrastructureCommitment = { ...NEON, effectiveFrom: '2026-8-1' };
    assert.throws(
      () => recognizeInfrastructure([unpadded], accountingInstant(2026, 8, 17)),
      PeriodError,
    );

    const nonsense: InfrastructureCommitment = { ...NEON, effectiveUntil: 'unknown' };
    assert.throws(
      () => recognizeInfrastructure([nonsense], accountingInstant(2026, 8, 17)),
      PeriodError,
    );
  });

  it('refuses a well-shaped date that is not a real calendar day', () => {
    // `2026-02-30` is correctly zero-padded and sorts perfectly well, and is
    // not a date — so a commitment boundary that never existed would decide
    // which months a cost is recognized in. Raised by CodeRabbit on PR #2.
    const impossible: InfrastructureCommitment = { ...NEON, effectiveFrom: '2026-02-30' };
    assert.throws(
      () => recognizeInfrastructure([impossible], accountingInstant(2026, 8, 17)),
      PeriodError,
    );

    const monthThirteen: InfrastructureCommitment = { ...NEON, effectiveFrom: '2026-13-01' };
    assert.throws(
      () => recognizeInfrastructure([monthThirteen], accountingInstant(2026, 8, 17)),
      PeriodError,
    );

    // The leap rule applies to commitment dates too, not just to timestamps.
    const leap: InfrastructureCommitment = { ...NEON, effectiveFrom: '2028-02-29' };
    assert.doesNotThrow(() => recognizeInfrastructure([leap], accountingInstant(2028, 3, 1)));
  });

  it('recognizes nothing for a commitment that has not started yet', () => {
    const future: InfrastructureCommitment = { ...NEON, effectiveFrom: '2026-08-20' };
    assert.equal(recognizeInfrastructure([future], accountingInstant(2026, 8, 17)).micros, 0);
  });

  it('prorates by days SERVED, not days elapsed, when a commitment ended mid-month', () => {
    // 1–9 August inclusive is 9 days of a 31-day month, evaluated on the 17th.
    // Days-elapsed would have said 17/31 — charging for service that ended.
    const ended: InfrastructureCommitment = { ...NEON, effectiveUntil: '2026-08-10' };
    const recognized = recognizeInfrastructure(
      [ended],
      accountingInstant(2026, 8, 17),
      'PRORATED_DAILY',
    );

    assert.equal(recognized.micros, Math.round((NEON.monthlyMicros * 9) / 31));
  });

  it('prorates from the start day when a commitment began mid-month', () => {
    // 5–17 August inclusive is 13 days.
    const started: InfrastructureCommitment = { ...NEON, effectiveFrom: '2026-08-05' };
    const recognized = recognizeInfrastructure(
      [started],
      accountingInstant(2026, 8, 17),
      'PRORATED_DAILY',
    );

    assert.equal(recognized.micros, Math.round((NEON.monthlyMicros * 13) / 31));
  });

  it('counts only usage in the calendar month containing the evaluation instant', () => {
    const july = run({ runId: 'july', occurredAt: '2026-07-31T23:59:59.000Z' });
    const august = run({ runId: 'august', occurredAt: '2026-08-01T00:00:00.000Z' });

    const total = monthlySpend(
      { infrastructure: [], runs: [july, august] },
      accountingInstant(2026, 8, 17),
      TABLE,
    );

    // Only August's run, priced at 1M input tokens x USD 1 per Mtok.
    assert.equal(isUnknown(total), false);
    assert.equal(isUnknown(total) ? -1 : total.micros, 1_000_000);
  });
});

describe('cost meter — the accounting period', () => {
  it('reports days in month by the Gregorian leap rule', () => {
    assert.equal(daysInMonth(2026, 2), 28);
    assert.equal(daysInMonth(2028, 2), 29, '2028 is a leap year');
    assert.equal(daysInMonth(2100, 2), 28, '2100 is divisible by 100 but not 400');
    assert.equal(daysInMonth(2000, 2), 29, '2000 is divisible by 400');
    assert.equal(daysInMonth(2026, 8), 31);
  });

  it('rejects an impossible day rather than rolling it into the next month', () => {
    assert.throws(() => accountingInstant(2026, 2, 30), PeriodError);
    assert.throws(() => accountingInstant(2026, 13, 1), PeriodError);
  });

  it('buckets a UTC-normalized timestamp by its calendar month', () => {
    assert.equal(monthKeyOf('2026-08-01T00:00:00.000Z'), '2026-08');
    assert.equal(monthKeyOf('2026-07-31T23:59:59Z'), '2026-07');
  });

  it('refuses to bucket a timestamp carrying a numeric offset', () => {
    // 2026-08-01T09:00:00+10:00 is 2026-07-31T23:00Z — a different month than
    // its own prefix. Reading the prefix would put July's spend in August.
    assert.equal(monthKeyOf('2026-08-01T09:00:00+10:00'), null);
    assert.equal(monthKeyOf('not a timestamp'), null);
  });

  it('refuses an impossible date or time rather than reading the month out of it', () => {
    /*
     * The shape and the month were checked and the rest was not, so
     * `2026-09-31T25:99:99Z` returned `2026-09` — a real month key extracted
     * from an instant that does not exist. The malformed record then landed
     * INSIDE the evaluated month and its spend counted as sound, which is the
     * opposite of what returning null is for. Raised by CodeRabbit on PR #2.
     */
    assert.equal(monthKeyOf('2026-09-31T25:99:99Z'), null, 'day 31 of a 30-day month');
    assert.equal(monthKeyOf('2026-09-31T12:00:00Z'), null, 'day alone is out of range');
    assert.equal(monthKeyOf('2026-08-17T25:00:00Z'), null, 'hour 25');
    assert.equal(monthKeyOf('2026-08-17T12:99:00Z'), null, 'minute 99');
    assert.equal(monthKeyOf('2026-08-17T12:00:99Z'), null, 'second 99');
    assert.equal(monthKeyOf('2026-08-00T12:00:00Z'), null, 'day zero');
    assert.equal(monthKeyOf('2026-13-01T12:00:00Z'), null, 'month 13');
  });

  it('applies the leap rule to the day bound rather than a fixed 31', () => {
    assert.equal(monthKeyOf('2026-02-29T12:00:00Z'), null, '2026 is not a leap year');
    assert.equal(monthKeyOf('2028-02-29T12:00:00Z'), '2028-02', '2028 is');
    assert.equal(monthKeyOf('2100-02-29T12:00:00Z'), null, 'century, not a leap year');
    assert.equal(monthKeyOf('2000-02-29T12:00:00Z'), '2000-02', 'divisible by 400, leap year');
  });

  it('accepts second 60 at the end of a day, and refuses it anywhere else', () => {
    // A leap second occurs at the END of a UTC day. Refusing it outright would
    // pause the gate on a genuinely valid record; allowing it at any hour, as
    // an earlier version did, admits `12:00:60` — not a timestamp at all.
    // Raised by CodeRabbit on PR #2.
    assert.equal(monthKeyOf('2026-06-30T23:59:60Z'), '2026-06');
    assert.equal(monthKeyOf('2026-08-17T12:00:60Z'), null);
    assert.equal(monthKeyOf('2026-08-17T23:00:60Z'), null, 'minute must be 59 too');
  });

  it('makes the month UNKNOWN when a run cannot be assigned to a month — fail closed', () => {
    const total = monthlySpend(
      { infrastructure: [], runs: [run({ occurredAt: '2026-08-01T09:00:00+10:00' })] },
      accountingInstant(2026, 8, 17),
      TABLE,
    );

    assert.ok(isUnknown(total));
    assert.match(total.reason, /cannot be assigned to a calendar month/);
  });
});
