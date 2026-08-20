/**
 * §18 (correction 5, review finding #2; correction 6, finding 1) — one sweep
 * failing must not starve the others.
 *
 * Correction 5 found `tick()` awaiting `retryDeferredReconciliation()`
 * unguarded, and contained that one step. The independent tester then proved
 * the isolation incomplete on the correction 5 candidate: a `sweepStaleness()`
 * rejection still exited `tick()` before `sweepExpiry()` could run, and an
 * expiry rejection escaped `tick()` into the interval wrapper's silent catch.
 * Every step is now isolated on its own — a failure is reported at its own log
 * line and the later steps still run.
 *
 * The choreography stubs only the injected dependencies (the service, the
 * leadership fence, the store transaction) and counts what actually ran; each
 * case drives `tick()` through the real step sequence, not through internals.
 * Cases b and c fail on the correction 5 candidate; case a holds there and
 * pins its containment so it cannot regress.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GatewaySweeps, type SweepDeps } from '../packages/control-plane/src/gateway/sweeps.js';

interface StubOverrides {
  /** What `retryDeferredReconciliation` does. Default: succeed quietly. */
  readonly reconciliation?: () => Promise<void>;
  /** What the leadership fence does. Default: resolve not_leader. */
  readonly runFenced?: () => Promise<unknown>;
  /** What the expiry registry transaction does. Default: resolve 0. */
  readonly expiry?: () => Promise<number>;
  /** Whether the leadership guard lets the staleness sweep run. Default: false. */
  readonly canServe?: boolean;
}

function stubbedDeps(overrides: StubOverrides = {}): {
  deps: SweepDeps;
  expirySweeps: () => number;
  stalenessFences: () => number;
  logged: () => Array<{ level: string; at: string }>;
} {
  let expirySweepCalls = 0;
  let stalenessFenceCalls = 0;
  const logCalls: Array<{ level: string; at: string }> = [];
  const deps = {
    pool: { query: async () => ({ rows: [], rowCount: 0 }), on: () => undefined },
    config: {},
    clock: { sample: () => undefined, monotonicNow: () => 1_000 },
    session: {},
    leadership: {
      canServe: () => overrides.canServe ?? false,
      runFenced:
        overrides.runFenced ??
        (async (): Promise<unknown> => {
          stalenessFenceCalls += 1;
          return { status: 'not_leader', committed: false };
        }),
    },
    store: {
      inRegistryTransaction: async (): Promise<number> => {
        expirySweepCalls += 1;
        return overrides.expiry ? overrides.expiry() : 0;
      },
    },
    service: {
      retryDeferredReconciliation:
        overrides.reconciliation ?? (async (): Promise<void> => undefined),
    },
    log: (level: 'warn' | 'error', at: string) => {
      logCalls.push({ level, at });
    },
  } as unknown as SweepDeps;
  return {
    deps,
    expirySweeps: () => expirySweepCalls,
    stalenessFences: () => stalenessFenceCalls,
    logged: () => logCalls,
  };
}

describe('gateway-sweeps · a failing sweep must not starve the others', () => {
  it('tick:a-throwing-deferred-reconciliation-is-contained-and-the-sweeps-still-run', async () => {
    const { deps, expirySweeps, stalenessFences, logged } = stubbedDeps({
      reconciliation: async () => {
        throw new Error('deferred reconciliation is unreachable');
      },
      canServe: true,
    });
    const sweeps = new GatewaySweeps(deps);

    await sweeps.tick();

    assert.equal(stalenessFences(), 1, 'the staleness sweep ran under its leadership guard');
    assert.equal(expirySweeps(), 1, 'the expiry sweep ran after the failed reconciliation');
    // Contained is not silent: the failure is visible at its own line, so an
    // operator reading the log can tell a contained failure from a stopped one.
    assert.deepEqual(logged(), [
      { level: 'warn', at: 'gateway.sweeps.deferred_reconciliation_failed' },
    ]);
  });

  it('tick:a-throwing-staleness-sweep-is-contained-and-expiry-still-runs', async () => {
    const { deps, expirySweeps, logged } = stubbedDeps({
      canServe: true,
      runFenced: async () => {
        throw new Error('the staleness fence is unreachable');
      },
    });
    const sweeps = new GatewaySweeps(deps);

    // On the correction 5 candidate this rejection escapes tick() and the
    // expiry count below stays zero — the tester's exact finding.
    await sweeps.tick();

    assert.equal(expirySweeps(), 1, 'the expiry sweep ran despite the staleness failure');
    assert.deepEqual(logged(), [{ level: 'error', at: 'gateway.sweeps.staleness_failed' }]);
  });

  it('tick:a-throwing-expiry-sweep-is-contained-and-reported-by-tick', async () => {
    const { deps, expirySweeps, logged } = stubbedDeps({
      expiry: async () => {
        throw new Error('the expiry transaction is unreachable');
      },
    });
    const sweeps = new GatewaySweeps(deps);

    // tick() itself must settle: the interval wrapper swallows rejections, so
    // an escaping expiry failure would be indistinguishable from silence.
    await sweeps.tick();

    assert.equal(expirySweeps(), 1, 'the expiry sweep was attempted exactly once');
    assert.deepEqual(logged(), [{ level: 'error', at: 'gateway.sweeps.expiry_failed' }]);
  });

  it('tick:the-leadership-guard-still-gates-the-staleness-sweep', async () => {
    const { deps, stalenessFences, expirySweeps, logged } = stubbedDeps({
      canServe: false,
    });
    const sweeps = new GatewaySweeps(deps);

    await sweeps.tick();

    assert.equal(stalenessFences(), 0, 'a non-serving replica never enters the staleness fence');
    assert.equal(expirySweeps(), 1, 'expiry is replica-safe and still runs');
    assert.deepEqual(logged(), [], 'nothing failed, so nothing was reported');
  });
});
