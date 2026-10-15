/**
 * Spend broker v0 — `GLM-20260913-SPEND-BROKER-V0`.
 *
 * Every test here pins a behavior a mutation would flip, so a silent change
 * fails rather than drifts. The suite is fixture-only: no network, no real
 * gateway, no credential store — the "no network" property is by
 * construction, since nothing in the package under test imports a network
 * module and every dependency is an in-process fixture.
 *
 * Boundary semantics are NOT re-decided here. The per-room ≥ and the monthly
 * strictly-above comparisons are the live meter's, exercised through
 * `MeterCeilingPort`; tests that touch them pin the live rule: the per-room
 * limb inclusive as `-16` clause 2 is written (Founder ruling 2026-08-29).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FailGatewayPort,
  FixtureGatewayPort,
  MeterCeilingPort,
  NotAuthorizedGatewayPort,
  RecordingInterruptSink,
  ReservationLedger,
  SpendBroker,
  runCli,
  type CeilingQuery,
  type CostMeterPort,
  type GatewayPort,
  type MintDeniedResult,
  type MintResult,
  type MintedResult,
  type OpaqueToken,
} from '../packages/spend-broker/src/index.js';
import {
  accountingInstant,
  type PriceTable,
  type RoomBudget,
  type RunUsageRecord,
} from '../packages/cost-meter/src/index.js';

const VERSION = '2026-08-17-provisional';
const BASE_NOW_MS = 1_700_000_000_000;

/** Stub table; rates are fabricated and are not a rate source. */
const TABLE: PriceTable = {
  hasVersion: (version) => version === VERSION,
  rateFor: (version, provider, model) =>
    version === VERSION && provider === 'test-provider' && model === 'test-model'
      ? { inputMicrosPerMTok: 1_000_000, outputMicrosPerMTok: 2_000_000 }
      : null,
};

function room(overrides: Partial<RoomBudget> = {}): RoomBudget {
  return {
    roomId: 'room-1',
    tokenCeiling: 1_000,
    tokensSpent: 0,
    tokensReserved: 0,
    perRunTokenCap: 2_000,
    ...overrides,
  };
}

function run(overrides: Partial<RunUsageRecord> = {}): RunUsageRecord {
  return {
    runId: 'prior-run',
    roomId: 'room-1',
    providerId: 'test-provider',
    modelId: 'test-model',
    priceTableVersion: VERSION,
    usage: { inputTokens: 0, outputTokens: 0 },
    occurredAt: '2026-09-13T00:00:00Z',
    ...overrides,
  };
}

interface HarnessOptions {
  readonly budgets?: readonly RoomBudget[];
  readonly runs?: readonly RunUsageRecord[];
  readonly gateway?: GatewayPort;
  readonly tokenTtlMs?: number;
  readonly busyPolicy?: 'queue' | 'reject';
}

interface Harness {
  readonly broker: SpendBroker;
  readonly sink: RecordingInterruptSink;
  readonly ledger: ReservationLedger;
  readonly now: () => number;
  advance(ms: number): void;
}

function harness(options: HarnessOptions = {}): Harness {
  let nowMs = BASE_NOW_MS;
  const ledger = new ReservationLedger();
  const sink = new RecordingInterruptSink();
  const budgets = new Map<string, RoomBudget>(
    (options.budgets ?? [room()]).map((budget) => [budget.roomId, budget]),
  );

  const broker = new SpendBroker({
    gateway: options.gateway ?? new FixtureGatewayPort(),
    meter: new MeterCeilingPort({
      snapshot: {
        asOf: accountingInstant(2026, 9, 13),
        ledger: { infrastructure: [], runs: options.runs ?? [] },
        priceTable: TABLE,
        budgets,
      },
      reservedTokensForRoom: (roomId) => ledger.activeTokens(roomId, nowMs),
    }),
    sink,
    clock: () => nowMs,
    tokenTtlMs: options.tokenTtlMs,
    busyPolicy: options.busyPolicy,
    reservations: ledger,
  });

  return {
    broker,
    sink,
    ledger,
    now: () => nowMs,
    advance: (ms) => {
      nowMs += ms;
    },
  };
}

function mintRequest(overrides: {
  runId?: string;
  roomId?: string;
  estimatedCost?: number;
  credentialKind?: 'api' | 'oauth';
}): Parameters<SpendBroker['mint']>[0] {
  return {
    runId: overrides.runId ?? 'run-1',
    roomId: overrides.roomId ?? 'room-1',
    provider: 'test-provider',
    purpose: 'test',
    ...(overrides.estimatedCost === undefined ? {} : { estimatedCost: overrides.estimatedCost }),
    ...(overrides.credentialKind === undefined ? {} : { credentialKind: overrides.credentialKind }),
  };
}

function expectMinted(result: MintResult): MintedResult {
  if (!result.ok) {
    assert.fail(`expected mint ok, got ${result.reason}: ${(result.detail ?? []).join(' | ')}`);
  }
  return result;
}

function expectDenied(result: MintResult): MintDeniedResult {
  if (result.ok) assert.fail('expected mint denied, got ok');
  return result;
}

describe('SpendBroker.mint — ceiling coupling', () => {
  it('mints under the ceiling and reserves the estimated cost', async () => {
    const h = harness({ budgets: [room({ tokensSpent: 500 })] });

    const result = expectMinted(await h.broker.mint(mintRequest({ estimatedCost: 400 })));

    assert.match(result.token, /^fix_test-provider_/);
    assert.equal(result.budgetRemaining, 100); // 1000 − (500 spent + 400 reserved)
    assert.equal(result.expiresAt, BASE_NOW_MS + 60_000);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 400);
  });

  it('denies at the ceiling (committed == ceiling) and emits one interrupt frame', async () => {
    // Pins the live meter's ≥ boundary at perRoomTokenLimb, inclusive as
    // `-16` clause 2 is written (Founder ruling 2026-08-29).
    const h = harness({ budgets: [room({ tokensSpent: 1_000 })] });

    const result = expectDenied(await h.broker.mint(mintRequest({ estimatedCost: 0 })));

    assert.equal(result.reason, 'spend_ceiling_exceeded');
    assert.ok((result.detail ?? []).some((line) => line.includes('per_room_tokens')));
    assert.ok(result.interrupt !== undefined);
    assert.equal(h.sink.frames.length, 1);

    const frame = result.interrupt;
    assert.equal(frame.type, 'interrupt');
    assert.equal(frame.reason, 'spend_ceiling_exceeded');
    assert.equal(frame.runId, 'run-1');
    assert.equal(frame.at, BASE_NOW_MS);
    assert.equal(frame.roomId, 'room-1');
  });

  it('denies over the ceiling (post-hoc reported usage above the room)', async () => {
    const h = harness({ budgets: [room({ tokensSpent: 1_100 })] });

    const result = expectDenied(await h.broker.mint(mintRequest({ estimatedCost: 0 })));

    assert.equal(result.reason, 'spend_ceiling_exceeded');
    assert.equal(h.sink.frames.length, 1);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 0);
  });

  it('denies fail-closed when the mint carries no roomId', async () => {
    const h = harness();

    // Built inline: the request deliberately omits roomId entirely.
    const result = expectDenied(
      await h.broker.mint({
        runId: 'run-no-room',
        provider: 'test-provider',
        purpose: 'test — no room',
        estimatedCost: 1,
      }),
    );

    assert.equal(result.reason, 'spend_ceiling_exceeded');
    assert.ok((result.detail ?? []).some((line) => line.includes('fail-closed')));
    assert.equal(h.sink.frames.length, 1);
  });

  it('denies fail-closed on a malformed estimatedCost (meter token-inputs limb)', async () => {
    const h = harness();

    const negative = expectDenied(await h.broker.mint(mintRequest({ estimatedCost: -5 })));
    const fractional = expectDenied(await h.broker.mint(mintRequest({ estimatedCost: 1.5 })));

    for (const result of [negative, fractional]) {
      assert.equal(result.reason, 'spend_ceiling_exceeded');
      assert.ok((result.detail ?? []).some((line) => line.includes('token_inputs')));
    }
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 0);
  });
});

describe('SpendBroker.mint — single flight per runId', () => {
  it('serializes two parallel mints; the second sees the first’s reservation and is refused at the ceiling', async () => {
    // 700 spent: the first mint is admitted (700 < 1000) and its reservation
    // takes the room to 1100; serialized behind it, the second sees 1100 >=
    // 1000 and is refused (`-16` clause 2, inclusive, ruled 2026-08-29).
    const h = harness({
      budgets: [room({ tokensSpent: 700, perRunTokenCap: 500 })],
      gateway: new FixtureGatewayPort({ delayMs: 10 }),
    });

    const outcomes = await Promise.all([
      h.broker.mint(mintRequest({ runId: 'run-1', estimatedCost: 400 })),
      h.broker.mint(mintRequest({ runId: 'run-1', estimatedCost: 400 })),
    ]);
    const mintedOutcomes = outcomes.filter((result) => result.ok);
    const deniedOutcomes = outcomes.filter((result) => !result.ok);

    assert.equal(mintedOutcomes.length, 1);
    assert.equal(deniedOutcomes.length, 1);
    assert.equal(deniedOutcomes[0]?.reason, 'spend_ceiling_exceeded');

    // The winner's reservation is on the ledger; exactly one frame was emitted.
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 400);
    assert.equal(h.sink.frames.length, 1);
    assert.equal(expectMinted(mintedOutcomes[0] ?? outcomes[0]!).budgetRemaining, 0); // 1000 − (700 + 400), floored: the disclosed overshoot
  });

  it('admits only one of two concurrent mints for DIFFERENT runs once the first crosses the ceiling', async () => {
    // The lock is per run, so two runs race. The reservation is taken with the
    // check, before the gateway is awaited, so the second run's check already
    // sees the first: 700 + 400 = 1100 >= 1000, refused. Without that, both
    // would pass against 700 and the room would reach 1500.
    const h = harness({
      budgets: [room({ tokensSpent: 700, perRunTokenCap: 500 })],
      gateway: new FixtureGatewayPort({ delayMs: 10 }),
    });

    const outcomes = await Promise.all([
      h.broker.mint(mintRequest({ runId: 'run-a', estimatedCost: 400 })),
      h.broker.mint(mintRequest({ runId: 'run-b', estimatedCost: 400 })),
    ]);

    assert.equal(outcomes.filter((result) => result.ok).length, 1);
    assert.equal(outcomes.filter((result) => !result.ok).length, 1);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 400);
    assert.equal(h.sink.frames.length, 1);
  });

  it('keeps a reservation counted while its gateway call outlasts the token lifetime', async () => {
    // A pending reservation counts whatever the clock says: had it carried the
    // check-time expiry, a gateway slower than the TTL would let it lapse, and
    // the second run below would pass against 700 and the room reach 1500.
    let release!: () => void;
    class SlowGateway implements GatewayPort {
      calls = 0;
      async mintProviderAuth(): Promise<OpaqueToken> {
        this.calls += 1;
        if (this.calls === 1) await new Promise<void>((resolve) => { release = resolve; });
        return 'fix_slow' as OpaqueToken;
      }
    }
    const gateway = new SlowGateway();
    const h = harness({
      budgets: [room({ tokensSpent: 700, perRunTokenCap: 500 })],
      gateway,
      tokenTtlMs: 1_000,
    });

    const first = h.broker.mint(mintRequest({ runId: 'run-a', estimatedCost: 400 }));
    await new Promise((resolve) => setImmediate(resolve));
    h.advance(5_000); // well past the check-time expiry, the call still pending
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 400, 'pending counts past its check-time expiry');
    expectDenied(await h.broker.mint(mintRequest({ runId: 'run-b', estimatedCost: 400 })));

    release();
    const minted = expectMinted(await first);
    // The token's lifetime runs from its issuance, and so does the settled reservation's.
    assert.equal(minted.expiresAt, h.now() + 1_000);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 400);
    assert.equal(h.ledger.active(h.now()).every((view) => view.pending !== true), true, 'settled, not pending');
    h.advance(1_000);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 0, 'and it expires with the token');
  });

  it('keeps a pending reservation through an explicit release, so a late success cannot reopen the room', async () => {
    // release() is public and takes no run lock. Had it dropped the pending
    // reservation, a second run would be admitted in the gap and the first
    // mint's success would then spend budget nothing held: past the bound.
    let release!: () => void;
    class SlowGateway implements GatewayPort {
      calls = 0;
      async mintProviderAuth(): Promise<OpaqueToken> {
        this.calls += 1;
        if (this.calls === 1) await new Promise<void>((resolve) => { release = resolve; });
        return 'fix_slow' as OpaqueToken;
      }
    }
    const h = harness({
      budgets: [room({ tokensSpent: 700, perRunTokenCap: 500 })],
      gateway: new SlowGateway(),
    });

    const first = h.broker.mint(mintRequest({ runId: 'run-a', estimatedCost: 400 }));
    await new Promise((resolve) => setImmediate(resolve));
    h.broker.release('run-a');
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 400, 'the pending reservation survives the release');
    expectDenied(await h.broker.mint(mintRequest({ runId: 'run-b', estimatedCost: 400 })));

    release();
    expectMinted(await first);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 400, 'the issued token is reserved for');
    h.broker.release('run-a');
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 0, 'and a release after the mint returns drops it');
  });

  it('removes the reservation taken before a gateway call that fails, and only that one', async () => {
    let calls = 0;
    class SecondCallFails implements GatewayPort {
      async mintProviderAuth(): Promise<OpaqueToken> {
        calls += 1;
        if (calls === 2) throw new Error('boom');
        return 'fix_ok' as OpaqueToken;
      }
    }
    const h = harness({ gateway: new SecondCallFails() });

    expectMinted(await h.broker.mint(mintRequest({ estimatedCost: 100 })));
    expectDenied(await h.broker.mint(mintRequest({ estimatedCost: 200 })));
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 100, 'the first mint still holds its reservation');
  });

  it('lets two parallel mints both succeed when together they fit, and stacks them', async () => {
    const h = harness({ budgets: [room({ tokenCeiling: 1_000, perRunTokenCap: 500 })] });

    const outcomes = await Promise.all([
      h.broker.mint(mintRequest({ runId: 'run-1', estimatedCost: 400 })),
      h.broker.mint(mintRequest({ runId: 'run-1', estimatedCost: 400 })),
    ]);

    for (const result of outcomes) expectMinted(result);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 800);
    assert.equal(h.sink.frames.length, 0);
  });

  it("returns single_flight_busy under busyPolicy 'reject' without emitting an interrupt", async () => {
    const h = harness({
      gateway: new FixtureGatewayPort({ delayMs: 10 }),
      busyPolicy: 'reject',
    });

    const first = h.broker.mint(mintRequest({ estimatedCost: 100 }));
    const second = await h.broker.mint(mintRequest({ estimatedCost: 100 }));

    const firstResult = expectMinted(await first);
    assert.equal(expectDenied(second).reason, 'single_flight_busy');
    assert.equal(h.sink.frames.length, 0);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 100);
    assert.ok(firstResult.token.startsWith('fix_'));
  });
});

describe('SpendBroker.refresh — interrupt an in-flight turn on breach', () => {
  it('replaces (not stacks) the prior reservation while the estimate still fits', async () => {
    const h = harness({ budgets: [room({ perRunTokenCap: 5_000 })] });

    await h.broker.mint(mintRequest({ estimatedCost: 300 }));
    const refreshed = expectMinted(await h.broker.refresh(mintRequest({ estimatedCost: 800 })));

    assert.equal(h.ledger.activeTokens('room-1', h.now()), 800); // replaced, not 1100
    assert.equal(refreshed.budgetRemaining, 200);
    assert.equal(h.sink.frames.length, 0);
  });

  it('admits a refresh that overshoots from below the ceiling, and reports nothing remaining', async () => {
    // The refresh releases this run's 300 first, so the room is at 0 < 1000:
    // admitted, 200 over once it runs — clause 3's disclosed overshoot.
    const h = harness({ budgets: [room({ perRunTokenCap: 5_000 })] });

    await h.broker.mint(mintRequest({ estimatedCost: 300 }));
    const refreshed = expectMinted(await h.broker.refresh(mintRequest({ estimatedCost: 1_200 })));

    assert.equal(refreshed.budgetRemaining, 0);
    assert.equal(h.sink.frames.length, 0);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 1_200);
  });

  it('denies the refresh of a run once the room is at its ceiling, and leaves that run nothing reserved', async () => {
    // run-b holds 100; run-a then takes the room to 300 + 100 + 700 = 1100.
    // run-b's refresh releases its 100 and sees 1000 >= 1000: denied, interrupted.
    const h = harness({ budgets: [room({ tokensSpent: 300, perRunTokenCap: 5_000 })] });

    expectMinted(await h.broker.mint(mintRequest({ runId: 'run-b', estimatedCost: 100 })));
    expectMinted(await h.broker.mint(mintRequest({ runId: 'run-a', estimatedCost: 700 })));
    const breached = expectDenied(
      await h.broker.refresh(mintRequest({ runId: 'run-b', estimatedCost: 100 })),
    );

    assert.equal(breached.reason, 'spend_ceiling_exceeded');
    assert.ok((breached.detail ?? []).some((line) => line.includes('per_room_tokens')));
    assert.ok(breached.interrupt !== undefined);
    assert.equal(h.sink.frames.length, 1);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 700, 'only run-a holds a reservation');
  });
});

describe('Gateway refusals map to denial reasons, never silent success', () => {
  it('maps an unavailable gateway to provider_unavailable with no frame and no reservation', async () => {
    const h = harness({ gateway: new FailGatewayPort() });

    const result = expectDenied(await h.broker.mint(mintRequest({ estimatedCost: 100 })));

    assert.equal(result.reason, 'provider_unavailable');
    assert.equal(h.sink.frames.length, 0);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 0);
  });

  it('maps an authorization refusal to not_authorized', async () => {
    const h = harness({ gateway: new NotAuthorizedGatewayPort() });

    const result = expectDenied(await h.broker.mint(mintRequest({ estimatedCost: 100 })));

    assert.equal(result.reason, 'not_authorized');
    assert.equal(h.sink.frames.length, 0);
  });

  it('maps an unexpected gateway crash to provider_unavailable — fail-closed', async () => {
    class CrashingGateway implements GatewayPort {
      async mintProviderAuth(): Promise<OpaqueToken> {
        throw new Error('boom — not a GatewayError');
      }
    }
    const h = harness({ gateway: new CrashingGateway() });

    const result = expectDenied(await h.broker.mint(mintRequest({ estimatedCost: 100 })));

    assert.equal(result.reason, 'provider_unavailable');
    assert.ok((result.detail ?? []).some((line) => line.includes('boom')));
    assert.equal(h.sink.frames.length, 0);
  });
});

describe('MeterCeilingPort — the live meter rule, end to end', () => {
  it('denies when the month is above the USD 85 ceiling even with room headroom', async () => {
    const h = harness({
      budgets: [room({ tokenCeiling: 1_000_000, perRunTokenCap: 1_000_000 })],
      runs: [run({ usage: { inputTokens: 90_000_000, outputTokens: 0 } })], // $90 at $1/M input
    });

    const result = expectDenied(await h.broker.mint(mintRequest({ estimatedCost: 10 })));

    assert.equal(result.reason, 'spend_ceiling_exceeded');
    assert.ok((result.detail ?? []).some((line) => line.includes('monthly_spend')));
    assert.ok((result.detail ?? []).some((line) => line.includes('above')));
    assert.equal(h.sink.frames.length, 1);
  });

  it('permits when the month is exactly at USD 85 — the monthly limb pauses strictly above', async () => {
    const h = harness({
      budgets: [room({ tokenCeiling: 1_000_000, perRunTokenCap: 1_000_000 })],
      runs: [run({ usage: { inputTokens: 85_000_000, outputTokens: 0 } })], // exactly $85
    });

    const result = expectMinted(await h.broker.mint(mintRequest({ estimatedCost: 10 })));

    assert.equal(result.budgetRemaining, 999_990);
  });

  it('denies fail-closed when the month cannot be computed (UNKNOWN is absorbing)', async () => {
    const h = harness({
      budgets: [room({ tokenCeiling: 1_000_000 })],
      runs: [run({ occurredAt: 'not-a-timestamp', usage: { inputTokens: 1, outputTokens: 0 } })],
    });

    const result = expectDenied(await h.broker.mint(mintRequest({ estimatedCost: 10 })));

    assert.equal(result.reason, 'spend_ceiling_exceeded');
    assert.ok((result.detail ?? []).some((line) => line.includes('monthly_spend')));
    assert.ok((result.detail ?? []).some((line) => line.includes('UNKNOWN')));
  });
});

describe('Reservation expiry', () => {
  it('expires reservations with the token lifetime and stops counting them', async () => {
    const h = harness({ tokenTtlMs: 5_000 });

    const result = expectMinted(await h.broker.mint(mintRequest({ estimatedCost: 400 })));
    assert.equal(result.expiresAt, BASE_NOW_MS + 5_000);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 400);

    h.advance(6_000);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 0);
    assert.deepEqual(h.broker.status().activeReservations, []);
  });
});

describe("OAuth credential class — 'unlimited' per the Founder ruling of 2026-09-13", () => {
  it('mints over a breached ceiling where the api class is denied and interrupted', async () => {
    const h = harness({
      budgets: [room({ tokenCeiling: 1_000, tokensSpent: 5_000, perRunTokenCap: 1_000 })],
    });

    const apiAttempt = expectDenied(
      await h.broker.mint(mintRequest({ runId: 'api-over', estimatedCost: 100 })),
    );
    assert.equal(apiAttempt.reason, 'spend_ceiling_exceeded');

    const oauth = expectMinted(
      await h.broker.mint(
        mintRequest({ runId: 'oauth-over', estimatedCost: 100, credentialKind: 'oauth' }),
      ),
    );

    // Unlimited means no budget was consulted, so no budget figure is reported.
    assert.equal(oauth.budgetRemaining, undefined);
    assert.equal(h.sink.frames.length, 1); // the api denial only
  });

  it('never consults the meter for an oauth mint', async () => {
    const calls: CeilingQuery[] = [];
    const countingMeter: CostMeterPort = {
      checkCeiling: (query) => {
        calls.push(query);
        return { ok: true, ceilingTokens: 1_000, committedTokens: 0, remainingTokens: 1_000 };
      },
    };
    const nowMs = BASE_NOW_MS;
    const broker = new SpendBroker({
      gateway: new FixtureGatewayPort(),
      meter: countingMeter,
      sink: new RecordingInterruptSink(),
      clock: () => nowMs,
    });

    await broker.mint(mintRequest({ estimatedCost: 50, credentialKind: 'oauth' }));
    assert.equal(calls.length, 0);

    await broker.mint(mintRequest({ estimatedCost: 50 })); // default api
    assert.equal(calls.length, 1);
  });

  it('records no reservation for an oauth mint and leaves api budget untouched', async () => {
    const h = harness({ budgets: [room({ tokensSpent: 500 })] });

    await h.broker.mint(
      mintRequest({ runId: 'oauth-1', estimatedCost: 999_999, credentialKind: 'oauth' }),
    );
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 0);

    const api = expectMinted(
      await h.broker.mint(mintRequest({ runId: 'api-1', estimatedCost: 400 })),
    );
    assert.equal(api.budgetRemaining, 100); // 1000 − (500 spent + 400 reserved); oauth held nothing
  });

  it('still denies on gateway refusal — unlimited is not ungated from the gateway', async () => {
    const h = harness({ gateway: new FailGatewayPort() });

    const result = expectDenied(
      await h.broker.mint(mintRequest({ estimatedCost: 1, credentialKind: 'oauth' })),
    );

    assert.equal(result.reason, 'provider_unavailable');
    assert.equal(h.sink.frames.length, 0);
    assert.equal(h.ledger.activeTokens('room-1', h.now()), 0);
  });

  it('defaults to the api class — an unmarked mint over the ceiling is denied', async () => {
    const h = harness({ budgets: [room({ tokensSpent: 1_000 })] });

    const result = expectDenied(await h.broker.mint(mintRequest({ estimatedCost: 0 })));

    assert.equal(result.reason, 'spend_ceiling_exceeded');
  });
});

describe('CLI — one-command founder demo (fixtures only)', () => {
  it('deny-demo mints under the ceiling, overshoots once on a refresh, then denies at the ceiling with a frame', async () => {
    const { report } = await runCli(['deny-demo']);

    const demo = report as {
      steps: Record<string, MintResult>;
      interruptFrames: unknown[];
      claims: { notEvidenceOf: readonly string[] };
    };
    const first = demo.steps['1_mint_under_ceiling'];
    const overshoot = demo.steps['2_refresh_overshoots_once'];
    const breach = demo.steps['3_mint_at_ceiling'];
    assert.ok(first !== undefined);
    assert.ok(overshoot !== undefined);
    assert.ok(breach !== undefined);

    assert.equal(first.ok, true);
    assert.equal(overshoot.ok, true);
    if (overshoot.ok) assert.equal(overshoot.budgetRemaining, 0);
    assert.equal(breach.ok, false);
    if (!breach.ok) {
      assert.equal(breach.reason, 'spend_ceiling_exceeded');
      assert.ok(breach.interrupt !== undefined);
    }
    assert.equal(demo.interruptFrames.length, 1);
    assert.ok(demo.claims.notEvidenceOf.includes('PHASE_0'));
    assert.ok(demo.claims.notEvidenceOf.includes('PRODUCTION_MERGE_AUTHORITY'));
  });

  it('oauth-unlimited demonstrates the 2026-09-13 ruling: api denied over ceiling, oauth unlimited', async () => {
    const { report } = await runCli(['oauth-unlimited']);

    const demo = report as {
      tokensSpentBefore: number;
      steps: Record<string, MintResult>;
      interruptFrames: unknown[];
    };
    const apiStep = demo.steps['api_over_ceiling'];
    const oauthStep = demo.steps['oauth_unlimited'];
    assert.ok(apiStep !== undefined);
    assert.ok(oauthStep !== undefined);

    assert.ok(demo.tokensSpentBefore > 1_000); // the demo room starts breached
    assert.equal(apiStep.ok, false);
    if (!apiStep.ok) {
      assert.equal(apiStep.reason, 'spend_ceiling_exceeded');
      assert.ok(apiStep.interrupt !== undefined);
    }
    assert.equal(oauthStep.ok, true);
    if (oauthStep.ok) assert.equal(oauthStep.budgetRemaining, undefined);
    assert.equal(demo.interruptFrames.length, 1);
  });

  it('gateway-fail demonstrates provider_unavailable, gateway-not-authorized demonstrates not_authorized', async () => {
    const fail = await runCli(['gateway-fail']);
    const refused = await runCli(['gateway-not-authorized']);

    assert.equal(fail.code, 0);
    const failResult = (fail.report as { result: MintResult }).result;
    assert.equal(failResult.ok, false);
    if (!failResult.ok) assert.equal(failResult.reason, 'provider_unavailable');

    const authResult = (refused.report as { result: MintResult }).result;
    assert.equal(authResult.ok, false);
    if (!authResult.ok) assert.equal(authResult.reason, 'not_authorized');
  });

  it('status and mint run clean; usage errors exit 2', async () => {
    assert.equal((await runCli(['status'])).code, 0);

    const minted = await runCli(['mint', '--run-id', 'cli-run', '--tokens', '100']);
    assert.equal(minted.code, 0);
    assert.equal((minted.report as { result: MintResult }).result.ok, true);

    assert.equal((await runCli(['no-such-command'])).code, 2);
    assert.equal((await runCli(['mint'])).code, 2);
    assert.equal((await runCli(['mint', '--run-id', 'r1', '--tokens', 'lots'])).code, 2);
  });
});
