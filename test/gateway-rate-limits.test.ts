/**
 * §12 — rate limiting and the aggregation identity.
 *
 * Two properties, both about what a hostile caller can force this process to
 * spend. The limiter must trip BEFORE signature work, or an unauthenticated
 * flood buys all the Ed25519 it wants and is then politely refused. And the
 * aggregation must never take a presented key identifier as a durable key, or a
 * flood of invented ids buys a row apiece in a table with a ninety-day
 * retention.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RATE_LIMITS,
  RateLimiter,
} from '../packages/control-plane/src/gateway/index.js';
import { ClockGate, ScriptedClock } from '../packages/control-plane/src/gateway/clock.js';
import { GatewayRegistryStore } from '../packages/control-plane/src/gateway/store.js';
import { UNRESOLVED_KEY_ID } from '../packages/control-plane/src/gateway/records.js';
import {
  closeAllSurfaces,
  startSurface,
  stubPool,
  surfaceConfig,
} from './gateway-surface-helpers.js';
import { FIXED_WALL_MS, generateTestKeypair, hex32, makeHeartbeat } from './gateway-helpers.js';

after(closeAllSurfaces);

function limiter(): { limiter: RateLimiter; clock: ScriptedClock } {
  const clock = new ScriptedClock(FIXED_WALL_MS, 1_000);
  const gate = new ClockGate(clock, {
    clockBackwardToleranceMs: 1_000,
    clockDivergenceToleranceMs: 2_000,
    clockStabilityMs: 30_000,
  });
  return { limiter: new RateLimiter(gate), clock };
}

describe('gateway-rate-limits · windows', () => {
  it('declares the ruled per-route budgets', () => {
    assert.equal(RATE_LIMITS.sessionChallenge, 30);
    assert.equal(RATE_LIMITS.enroll, 10);
    assert.equal(RATE_LIMITS.sessionStart, 10);
    assert.equal(RATE_LIMITS.heartbeat, 60);
    assert.equal(RATE_LIMITS.verificationFailure, 20);
  });

  it('admits exactly the budget and refuses the next request', () => {
    const { limiter: rl } = limiter();
    for (let i = 0; i < 10; i += 1) {
      assert.equal(rl.take('enroll:203.0.113.1', 10), true, `request ${i + 1}`);
    }
    assert.equal(rl.take('enroll:203.0.113.1', 10), false, 'the eleventh is refused');
  });

  it('keys buckets per source, so one caller cannot exhaust another', () => {
    const { limiter: rl } = limiter();
    for (let i = 0; i < 10; i += 1) rl.take('enroll:203.0.113.1', 10);
    assert.equal(rl.take('enroll:203.0.113.1', 10), false);
    assert.equal(rl.take('enroll:203.0.113.2', 10), true, 'a different source is unaffected');
  });

  it('keys buckets per route, so a heartbeat budget is not an enroll budget', () => {
    const { limiter: rl } = limiter();
    for (let i = 0; i < 10; i += 1) rl.take('enroll:203.0.113.1', 10);
    assert.equal(rl.take('enroll:203.0.113.1', 10), false);
    assert.equal(rl.take('heartbeat:203.0.113.1', 60), true);
  });

  it('reopens the window on the MONOTONIC source, not the wall clock', () => {
    const { limiter: rl, clock } = limiter();
    for (let i = 0; i < 10; i += 1) rl.take('enroll:203.0.113.1', 10);
    assert.equal(rl.take('enroll:203.0.113.1', 10), false);

    // A wall clock stepped backwards must not extend an open window.
    clock.set({ wall: FIXED_WALL_MS - 3_600_000 });
    assert.equal(rl.take('enroll:203.0.113.1', 10), false, 'a backward wall step changes nothing');

    clock.advance(60_000);
    assert.equal(rl.take('enroll:203.0.113.1', 10), true, 'the window reopens on elapsed time');
  });

  it('sweeps expired buckets, so a churn of sources cannot grow the map', () => {
    const { limiter: rl, clock } = limiter();
    for (let i = 0; i < 200; i += 1) rl.take(`enroll:198.51.100.${i}`, 10);
    assert.equal(rl.size, 200);

    rl.sweep();
    assert.equal(rl.size, 200, 'nothing expires early');

    clock.advance(60_001);
    rl.sweep();
    assert.equal(rl.size, 0, 'and everything expires on time');
  });
});

describe('gateway-rate-limits · 429-before-verify', () => {
  it('spends the whole per-route budget before refusing, on requests that pass verification', async () => {
    const surface = await startSurface();
    try {
      /*
       * A malformed envelope is `400 invalid_request`, which is NOT a
       * verification failure — so only the route's own 60/min budget applies
       * and it is spent in full before a 429 appears.
       */
      const statuses: number[] = [];
      for (let i = 0; i < RATE_LIMITS.heartbeat + 3; i += 1) {
        const response = await fetch(`${surface.url}/gateway/heartbeat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ not: 'an envelope', n: i }),
        });
        statuses.push(response.status);
      }

      assert.ok(
        statuses.slice(0, RATE_LIMITS.heartbeat).every((status) => status === 400),
        'the whole budget is spent before it is refused',
      );
      assert.ok(
        statuses.slice(RATE_LIMITS.heartbeat).every((status) => status === 429),
        'and everything past it is refused',
      );
    } finally {
      await surface.close();
    }
  });

  it('trips the verification-failure budget first, before any further signature work', async () => {
    const surface = await startSurface();
    try {
      const key = generateTestKeypair();
      const envelope = () =>
        makeHeartbeat(key, {
          gatewayId: '11111111-2222-4333-8444-555555555555',
          keyId: key.keyId,
          epoch: hex32(),
          sequence: 1,
          nonce: hex32(),
          timestampMs: FIXED_WALL_MS,
        });

      const statuses: number[] = [];
      for (let i = 0; i < RATE_LIMITS.verificationFailure + 5; i += 1) {
        const response = await fetch(`${surface.url}/gateway/heartbeat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(envelope()),
        });
        statuses.push(response.status);
      }

      /*
       * These are well inside the route's 60/min budget, so the refusal can
       * only be the additional failure budget — which is the point: a source
       * that keeps failing verification is cut off long before it has spent the
       * budget a well-behaved caller gets.
       */
      assert.ok(
        statuses.slice(0, RATE_LIMITS.verificationFailure).every((status) => status === 401),
        'the failure budget is spent on real refusals',
      );
      assert.ok(
        statuses.slice(RATE_LIMITS.verificationFailure).every((status) => status === 429),
        'and then the source is refused before verification runs again',
      );
      assert.ok(
        RATE_LIMITS.verificationFailure < RATE_LIMITS.heartbeat,
        'the failure budget is the tighter of the two, by construction',
      );
    } finally {
      await surface.close();
    }
  });

  it('refuses on the challenge route at its own, larger budget', async () => {
    const surface = await startSurface();
    try {
      let refused = 0;
      for (let i = 0; i < RATE_LIMITS.sessionChallenge + 3; i += 1) {
        const response = await fetch(`${surface.url}/gateway/session-challenge`);
        if (response.status === 429) refused += 1;
      }
      assert.ok(refused >= 3);
    } finally {
      await surface.close();
    }
  });

  it('never writes a rate-limit rejection to the database', async () => {
    /*
     * A 429 is the cheap refusal. Making it write a row would hand a flood a
     * write amplifier, which is the opposite of what a limiter is for.
     *
     * (correction 5, inline finding #17) The previous shape exercised the
     * limiter in isolation and never issued a query — the store it "watched"
     * was constructed and discarded, so the empty log proved nothing. The
     * flood here crosses the real route table and the real limiter to a real
     * 429, and the recording pool proves no rejection row was written on the
     * way.
     */
    const writes: string[] = [];
    const base = stubPool();
    const recording = {
      ...base,
      query: (sql: string, params?: unknown[]) => {
        if (/gateway_message_rejections/.test(sql)) writes.push(sql);
        return (base as unknown as { query: (s: string, p?: unknown[]) => Promise<unknown> }).query(
          sql,
          params,
        );
      },
    } as unknown as typeof base;

    const surface = await startSurface({}, recording);
    try {
      let refused = 0;
      for (let i = 0; i < RATE_LIMITS.sessionChallenge + 3; i += 1) {
        const response = await fetch(`${surface.url}/gateway/session-challenge`);
        if (response.status === 429) refused += 1;
      }
      assert.ok(refused >= 3, 'the flood must actually reach the 429 for this to mean anything');
      assert.deepEqual(writes, [], 'a refused flood writes no rejection row');
    } finally {
      await surface.close();
    }
  });
});

describe('gateway-rate-limits · the verification-failure budget', () => {
  it('exhausts after the ruled number of failures and refuses before further work', () => {
    const { limiter: rl } = limiter();
    const key = 'verify-fail:203.0.113.1';

    for (let i = 0; i < RATE_LIMITS.verificationFailure; i += 1) {
      assert.equal(rl.exhausted(key, RATE_LIMITS.verificationFailure), false, `before failure ${i}`);
      rl.take(key, RATE_LIMITS.verificationFailure);
    }
    assert.equal(rl.exhausted(key, RATE_LIMITS.verificationFailure), true);
  });

  it('observes without consuming, so the check itself costs no budget', () => {
    const { limiter: rl } = limiter();
    const key = 'verify-fail:203.0.113.2';
    for (let i = 0; i < 50; i += 1) rl.exhausted(key, RATE_LIMITS.verificationFailure);
    assert.equal(rl.exhausted(key, RATE_LIMITS.verificationFailure), false);
  });
});

describe('gateway-rate-limits · random-keyid-flood-single-unknown-row', () => {
  it('never takes a presented key identifier as a durable aggregation key', async () => {
    /*
     * The durable identity is the RESOLVED registry key id, or the literal
     * `unknown`. This asserts the choice directly, at the boundary where it is
     * made (correction 5, M7): the store receives the RESOLUTION, not the
     * presentation, so an unresolvable presentation — any invented identifier
     * — arrives here as `null`. Forty null resolutions, forty upserts, one
     * identity. The database-side consequence — one counting row rather than
     * forty — is asserted against a real Postgres in the heartbeat storage
     * suite.
     */
    const identities: string[] = [];
    const pool = stubPool();
    const recording = {
      ...pool,
      query: (sql: string, params?: unknown[]) => {
        if (/INSERT INTO gateway_message_rejections/.test(sql) && Array.isArray(params)) {
          identities.push(String(params[0]));
        }
        return (pool as unknown as { query: (s: string, p?: unknown[]) => Promise<unknown> }).query(
          sql,
          params,
        );
      },
    } as unknown as typeof pool;

    const store = new GatewayRegistryStore(recording, surfaceConfig());
    for (let i = 0; i < 40; i += 1) {
      await store.recordMessageRejection({
        // The same null resolution on every call: the invented presenters
        // differ, but they are erased before this boundary — the heartbeat
        // storage suite is where forty genuinely distinct presenters are
        // driven end to end.
        resolvedKeyId: null,
        sourceIp: '198.51.100.1',
        errorCode: 'unknown_key',
      });
    }

    assert.equal(identities.length, 40, 'every attempt is still counted');
    assert.deepEqual(
      [...new Set(identities)],
      [UNRESOLVED_KEY_ID],
      'and every one of them counts under the single unresolved literal',
    );
  });

  it('uses the resolved key id when the presentation does resolve', async () => {
    const identities: string[] = [];
    const pool = stubPool();
    const recording = {
      ...pool,
      query: (sql: string, params?: unknown[]) => {
        if (/INSERT INTO gateway_message_rejections/.test(sql) && Array.isArray(params)) {
          identities.push(String(params[0]));
        }
        return (pool as unknown as { query: (s: string, p?: unknown[]) => Promise<unknown> }).query(
          sql,
          params,
        );
      },
    } as unknown as typeof pool;

    const key = generateTestKeypair();
    const store = new GatewayRegistryStore(recording, surfaceConfig());
    await store.recordMessageRejection({
      resolvedKeyId: key.keyId,
      sourceIp: '198.51.100.1',
      errorCode: 'bad_signature',
    });

    assert.deepEqual(identities, [key.keyId]);
    assert.notEqual(key.keyId, UNRESOLVED_KEY_ID);
  });

  it('counts every unresolved presentation under the one literal, so cardinality is registry keys + 1 per source and code', () => {
    /*
     * (correction 5, M8) The name now says what this asserts. The bound is a
     * fact about the identity space, not a simulation: the only values the
     * rejection table's aggregation key can hold are resolved registry key
     * ids and this one literal, so per source IP and error code the
     * per-minute cardinality is (registry keys + 1). The literal is pinned so
     * the aggregation key cannot silently change shape.
     */
    assert.equal(UNRESOLVED_KEY_ID, 'unknown');
  });
});
