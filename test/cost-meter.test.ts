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
    assert.equal(decision.limbs.length, 3);
    assert.equal(decision.pausedBy.length, 3, 'all three limbs should report their own verdict');
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

  it('recognizes nothing for a commitment already ended', () => {
    const ended: InfrastructureCommitment = { ...NEON, effectiveUntil: '2026-08-10' };
    assert.equal(recognizeInfrastructure([ended], accountingInstant(2026, 8, 17)).micros, 0);
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
