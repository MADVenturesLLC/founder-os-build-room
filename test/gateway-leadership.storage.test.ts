/**
 * §7, §13 — fenced leadership, demotion, and the three-point discipline.
 *
 * Every case here is a choreography, not a race. The pipelines expose named
 * boundaries and the tests hold them; nothing depends on a scheduler landing a
 * particular way, so a green run means the property holds rather than that the
 * interleaving did not show up this time.
 */

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readLease } from '../packages/control-plane/src/gateway/fence.js';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import {
  expireLease,
  makeNode,
  readLeaseRaw,
  quiesce,
  settleMicrotasks,
  track,
  waitFor,
  type Node,
  settleAllNodes,
} from './gateway-leadership-helpers.js';
import { FOLLOWER_ACQUISITION_INTERVAL_MS } from '../packages/control-plane/src/gateway/leadership.js';

let harness: GatewayHarness | undefined;

before(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('leadership');
});

after(async () => {
  await destroyGatewayHarness(harness);
});

/*
 * No background work may outlive a case: an unawaited acquisition landing
 * after the next case has reset the lease would fail it for an unrelated reason.
 */
afterEach(settleAllNodes);

/** Return the lease to its seeded shape so each case starts from one place. */
async function resetLease(): Promise<void> {
  await harness!.pool.query(
    `UPDATE control_plane_lease
        SET owner_id = NULL, heartbeat_at = NULL, challenge = NULL, challenge_published_at = NULL
      WHERE id = 1`,
  );
}

/** Bring a node to full serving leadership. */
async function promote(node: Node): Promise<void> {
  await node.leadership.attemptAcquisition();
  assert.equal(node.leadership.isLeader, true, 'node failed to acquire');
  assert.equal(
    node.leadership.servingGeneration,
    node.leadership.currentGeneration,
    'node acquired but is not serving',
  );
}

/** A fenced body that writes one availability row, so writes are countable. */
function availabilityWriter(gatewayId: string) {
  return async (ctx: { client: { query: (sql: string, params?: unknown[]) => Promise<unknown> } }) => {
    await ctx.client.query(
      `INSERT INTO gateway_availability_events (event_id, gateway_id, transition, occurred_at)
       VALUES ($1, $2, 'went_online', now())`,
      [randomUUID(), gatewayId],
    );
    return { value: 'wrote' as const, commit: true };
  };
}

async function availabilityRowCount(gatewayId: string): Promise<number> {
  const { rows } = await harness!.pool.query<{ count: string }>(
    'SELECT count(*) FROM gateway_availability_events WHERE gateway_id = $1',
    [gatewayId],
  );
  return Number(rows[0]?.count ?? '0');
}

describe('gateway-leadership · contention, expiry, and generation', { skip: STORAGE_SKIP }, () => {
  beforeEach(resetLease);

  it('contention — exactly one owner per generation', async () => {
    const a = makeNode(harness!);
    const b = makeNode(harness!);

    await a.leadership.attemptAcquisition();
    await b.leadership.attemptAcquisition();

    assert.equal(a.leadership.isLeader, true);
    assert.equal(b.leadership.isLeader, false, 'a fresh lease admits exactly one owner');

    const lease = await readLeaseRaw(harness!);
    assert.equal(lease.ownerId, a.leadership.ownerId);
  });

  it('expiry-refusal — a follower cannot take a lease that is still fresh', async () => {
    const a = makeNode(harness!);
    const b = makeNode(harness!);
    await promote(a);

    await b.leadership.attemptAcquisition();
    assert.equal(b.leadership.isLeader, false);
    assert.equal((await readLeaseRaw(harness!)).ownerId, a.leadership.ownerId);
  });

  it('crash-without-release — an expired lease is taken without the old owner cooperating', async () => {
    const a = makeNode(harness!);
    const b = makeNode(harness!);
    await promote(a);
    const firstGeneration = a.leadership.currentGeneration;

    // `a` stops ticking. Nothing releases; the TTL is the only mechanism.
    await expireLease(harness!, harness!.config.leaderLeaseTtlMs);
    await promote(b);

    assert.equal(b.leadership.currentGeneration, firstGeneration + 1);
    assert.equal((await readLeaseRaw(harness!)).ownerId, b.leadership.ownerId);
  });

  it('generation-monotonic — generation only ever increases across ownership changes', async () => {
    const observed: number[] = [];
    let previous = 0;
    for (let round = 0; round < 4; round += 1) {
      const node = makeNode(harness!);
      await expireLease(harness!, harness!.config.leaderLeaseTtlMs);
      await promote(node);
      observed.push(node.leadership.currentGeneration);
      assert.ok(node.leadership.currentGeneration > previous, 'generation must increase');
      previous = node.leadership.currentGeneration;
    }
    assert.deepEqual(observed, [...observed].sort((x, y) => x - y));
  });

  it('stale-owner-resumption — the old owner demotes itself on its next renewal', async () => {
    const a = makeNode(harness!);
    const b = makeNode(harness!);
    await promote(a);

    await expireLease(harness!, harness!.config.leaderLeaseTtlMs);
    await promote(b);

    // `a` still believes it leads. Its renewal binds its own owner id, so it
    // matches nothing and it demotes.
    assert.equal(a.leadership.isLeader, true, 'a has not noticed yet');
    await a.leadership.tick();
    assert.equal(a.leadership.isLeader, false);
    assert.equal(a.leadership.servingGeneration, null);
    assert.equal(a.leadership.demotionCleanupPending, true);

    await quiesce(a);
    await quiesce(b);
  });

  it('renewal-failure-demotion — a query error is treated exactly as a lost lease', async () => {
    /*
     * (correction 5, inline finding #16) The previous shape never led against
     * the failing pool: it demoted the doomed node during setup and then
     * ticked a process that already believed nothing, which proves nothing
     * about a failed renewal. This node is REALLY the leader first, on its
     * own pool; the pool is then ended under it and the next tick's renewal
     * must throw and demote — the one thing a leader may not do is assume it
     * still leads.
     */
    const { createPool } = await import('../packages/control-plane/src/db.js');
    const ownPool = createPool(harness!.config);
    const node = makeNode({ ...harness!, pool: ownPool });

    await promote(node);
    assert.equal(node.leadership.isLeader, true, 'the node must genuinely lead for this to mean anything');

    // A pool that has been ended throws on the next query.
    await ownPool.end();

    await assert.doesNotReject(() => node.leadership.tick());
    assert.equal(node.leadership.isLeader, false, 'a failed renewal never leaves a process leading');

    await quiesce(node);
  });

  it('challenge-via-follower-replica — a follower serves the leader row values verbatim', async () => {
    const a = makeNode(harness!);
    await promote(a);

    // The follower reads the same row; no process-local challenge exists.
    const viaFollower = await readLease(harness!.pool);
    const raw = await readLeaseRaw(harness!);

    assert.equal(viaFollower.generation, raw.generation);
    assert.equal(viaFollower.challenge, raw.challenge);
    assert.equal(viaFollower.generation, a.leadership.currentGeneration);
    assert.ok(viaFollower.challenge !== null && /^[0-9a-f]{64}$/.test(viaFollower.challenge));
  });

  it('clean-promotion-reconciles-before-serving — 503 until reconciliation completes', async () => {
    /*
     * The window is observed from inside the reconciler rather than from a
     * timed pause outside it. That is the only place the intermediate state
     * provably exists: leadership held, nothing served yet.
     */
    let duringReconciliation: {
      isLeader: boolean;
      serving: number | null;
      canServe: boolean;
    } | null = null;

    let node!: Node;
    node = makeNode(harness!, {
      reconciler: async () => {
        duringReconciliation = {
          isLeader: node.leadership.isLeader,
          serving: node.leadership.servingGeneration,
          canServe: node.leadership.canServe(),
        };
        return true;
      },
    });

    await node.leadership.attemptAcquisition();

    assert.ok(duringReconciliation !== null, 'reconciliation must run on promotion');
    const during = duringReconciliation as unknown as {
      isLeader: boolean;
      serving: number | null;
      canServe: boolean;
    };
    assert.equal(during.isLeader, true, 'leadership is held during reconciliation');
    assert.equal(during.serving, null, 'but nothing is served yet');
    assert.equal(during.canServe, false, 'the pre-filter refuses until reconciled');

    assert.equal(node.leadership.servingGeneration, node.leadership.currentGeneration);
    assert.equal(node.leadership.canServe(), true);
    assert.deepEqual(node.reconciliations, [node.leadership.currentGeneration]);
  });
});

describe('gateway-leadership · demotion:flags-flip-before-l0-map-clear', { skip: STORAGE_SKIP }, () => {
  beforeEach(resetLease);

  it('flips every flag and establishes the barrier synchronously, without waiting for L0', async () => {
    const node = makeNode(harness!);
    await promote(node);
    node.session.adoptEpoch({ generation: node.leadership.currentGeneration, challenge: 'a'.repeat(64) });

    // An old request is holding L0 and will not let go.
    const releaseL0 = await node.session.lock.acquire();
    const versionBefore = node.leadership.demotionVersion;

    // Synchronous: no await between the trigger and these assertions.
    node.leadership.demote('test');

    assert.equal(node.leadership.isLeader, false, '1. isLeader = false');
    assert.equal(node.leadership.servingGeneration, null, '2. servingGeneration = null');
    assert.equal(node.leadership.demotionVersion, versionBefore + 1, '3. demotionVersion incremented');
    assert.equal(node.leadership.demotionCleanupPending, true, '4. cleanup pending');
    assert.ok(node.leadership.cleanupBarrier !== null, '5. the barrier exists');
    assert.equal(node.leadership.canServe(), false, 'new admissions are barred immediately');

    // Phase 2 starts but cannot proceed: the map is still intact behind L0.
    await node.leadership.tick();
    await settleMicrotasks();
    assert.notEqual(node.session.describe().epoch, null, 'the map is not cleared while L0 is held');
    assert.equal(node.leadership.demotionCleanupPending, true);

    releaseL0();
    await node.leadership.phase2Run;

    assert.equal(node.session.describe().epoch, null, 'the map is cleared once L0 is free');
    assert.equal(node.leadership.demotionCleanupPending, false);
    assert.equal(node.leadership.cleanupBarrier, null);
  });
});

describe('gateway-leadership · demotion:inflight-before-fence-rolls-back', { skip: STORAGE_SKIP }, () => {
  beforeEach(resetLease);

  it('an in-flight handler that reaches its fence after demotion writes nothing', async () => {
    const gatewayId = randomUUID();
    let held!: () => void;
    const paused = new Promise<void>((resolve) => {
      held = resolve;
    });
    let pausedOnce = false;

    const node = makeNode(harness!, {
      hooks: {
        heartbeat: {
          beforeTransaction: async () => {
            if (pausedOnce) return;
            pausedOnce = true;
            await paused;
          },
        },
      },
    });
    await promote(node);

    const inflight = node.leadership.runFenced(
      { pipeline: 'heartbeat', takeL0: true, takeRegistryLock: true, verifyServingGeneration: true },
      availabilityWriter(gatewayId),
    );
    await settleMicrotasks();

    node.leadership.demote('renewal_failed');
    held();

    const result = await inflight;
    assert.equal(result.status, 'not_leader');
    assert.equal(result.status === 'not_leader' && result.at, 'fence');
    assert.equal(result.status === 'not_leader' && result.committed, false);
    assert.equal(await availabilityRowCount(gatewayId), 0, 'zero durable writes');
  });
});

describe(
  'gateway-leadership · demotion:inflight-after-initial-fence-cannot-publish-or-return-accepted',
  { skip: STORAGE_SKIP },
  () => {
    beforeEach(resetLease);

    it('a demotion between the fence and COMMIT rolls back with zero writes and zero publication', async () => {
      const gatewayId = randomUUID();
      let node!: Node;
      node = makeNode(harness!, {
        hooks: {
          heartbeat: {
            beforePreCommitRecheck: () => {
              node.leadership.demote('renewal_failed');
            },
          },
        },
      });
      await promote(node);
      const epoch = { generation: node.leadership.currentGeneration, challenge: 'b'.repeat(64) };
      node.session.adoptEpoch(epoch);

      const result = await node.leadership.runFenced(
        { pipeline: 'heartbeat', takeL0: true, takeRegistryLock: true, verifyServingGeneration: true },
        async (ctx) => {
          await availabilityWriter(gatewayId)(ctx);
          return {
            value: 'wrote' as const,
            commit: true,
            staged: {
              epoch,
              generation: epoch.generation,
              liveness: { gatewayId, value: { wallMs: 1, monoMs: 1 } },
            },
          };
        },
      );

      assert.equal(result.status, 'not_leader');
      assert.equal(result.status === 'not_leader' && result.at, 'pre_commit');
      assert.equal(result.status === 'not_leader' && result.committed, false);
      assert.equal(await availabilityRowCount(gatewayId), 0, 'rollback means zero durable writes');
      assert.equal(node.session.livenessFor(gatewayId), null, 'no staged effect was applied');
    });

    it('a demotion after COMMIT lets the durable write stand and publishes nothing', async () => {
      const gatewayId = randomUUID();
      let node!: Node;
      node = makeNode(harness!, {
        hooks: {
          heartbeat: {
            afterCommit: () => {
              node.leadership.demote('renewal_failed');
            },
          },
        },
      });
      await promote(node);
      const epoch = { generation: node.leadership.currentGeneration, challenge: 'c'.repeat(64) };
      node.session.adoptEpoch(epoch);

      const result = await node.leadership.runFenced(
        { pipeline: 'heartbeat', takeL0: true, takeRegistryLock: true, verifyServingGeneration: true },
        async (ctx) => {
          await availabilityWriter(gatewayId)(ctx);
          return {
            value: 'wrote' as const,
            commit: true,
            staged: {
              epoch,
              generation: epoch.generation,
              liveness: { gatewayId, value: { wallMs: 1, monoMs: 1 } },
            },
          };
        },
      );

      assert.equal(result.status, 'not_leader');
      assert.equal(result.status === 'not_leader' && result.at, 'post_commit');
      assert.equal(
        result.status === 'not_leader' && result.committed,
        true,
        'the legitimately fenced commit stands',
      );
      assert.equal(await availabilityRowCount(gatewayId), 1, 'the durable row is not un-written');
      assert.equal(node.session.livenessFor(gatewayId), null, 'but nothing is published');
      assert.equal(node.leadership.servingGeneration, null);
    });
  },
);

describe(
  'gateway-leadership · leadership:same-owner-reacquisition-waits-for-demotion-cleanup',
  { skip: STORAGE_SKIP },
  () => {
    beforeEach(resetLease);

    it('issues no acquisition SQL, no reconciliation and no serving publication until cleanup completes', async () => {
      const node = makeNode(harness!);
      await promote(node);
      const generationBefore = (await readLeaseRaw(harness!)).generation;
      const reconciliationsBefore = node.reconciliations.length;

      // An old request holds L0; demotion fires; a reacquisition tick occurs.
      const releaseL0 = await node.session.lock.acquire();
      node.leadership.demote('renewal_failed');

      const attempt = node.leadership.attemptAcquisition();
      const done = track(attempt);
      await node.leadership.tick();
      await settleMicrotasks();

      assert.equal(
        (await readLeaseRaw(harness!)).generation,
        generationBefore,
        'no acquisition SQL ran while cleanup was pending',
      );
      assert.equal(node.reconciliations.length, reconciliationsBefore, 'no reconciliation ran');
      assert.equal(node.leadership.servingGeneration, null, 'nothing was served');
      assert.equal(done(), false, 'the attempt is still waiting on the barrier');

      releaseL0();
      await node.leadership.phase2Run;
      await attempt;

      assert.equal((await readLeaseRaw(harness!)).generation, generationBefore + 1);
      assert.equal(node.reconciliations.length, reconciliationsBefore + 1);
      assert.equal(node.leadership.servingGeneration, node.leadership.currentGeneration);
    });
  },
);

describe(
  'gateway-leadership · leadership:repeated-demotion-coalesces-single-cleanup',
  { skip: STORAGE_SKIP },
  () => {
    beforeEach(resetLease);

    it('creates one barrier for many triggers, resolves it once, and strands no waiter', async () => {
      const node = makeNode(harness!);
      await promote(node);

      const releaseL0 = await node.session.lock.acquire();

      node.leadership.demote('first');
      const barrier = node.leadership.cleanupBarrier;
      assert.ok(barrier !== null);

      const waiterA = track(barrier);
      const waiterB = track(barrier);

      node.leadership.demote('second');
      node.leadership.demote('third');

      assert.equal(node.leadership.cleanupBarrier, barrier, 'later triggers retain the one barrier');
      assert.equal(node.leadership.demotionVersion >= 3, true, 'every trigger still bumps the version');

      // Many ticks while cleanup is pending schedule no second cleanup.
      await node.leadership.tick();
      await node.leadership.tick();
      await node.leadership.tick();
      await settleMicrotasks();
      assert.equal(waiterA(), false);

      releaseL0();
      await node.leadership.phase2Run;
      await settleMicrotasks();

      assert.equal(waiterA(), true, 'the first waiter resumed');
      assert.equal(waiterB(), true, 'the second waiter resumed');
      assert.equal(node.leadership.demotionCleanupPending, false);
      assert.equal(node.leadership.cleanupBarrier, null);
    });

    it('leaves no half-finalized state at any failure-injection point before the finalization block', async () => {
      const points = ['beforeL0', 'afterL0', 'beforeFinalize'] as const;

      for (const point of points) {
        await resetLease();
        let fail = true;
        const node = makeNode(harness!, {
          hooks: {
            phase2: {
              [point]: () => {
                if (fail) throw new Error(`injected failure at ${point}`);
              },
            },
          },
        });
        await promote(node);
        node.session.adoptEpoch({ generation: node.leadership.currentGeneration, challenge: 'd'.repeat(64) });

        const barrier = (node.leadership.demote('trigger'), node.leadership.cleanupBarrier);
        assert.ok(barrier !== null, point);
        const resolved = track(barrier);

        await node.leadership.tick();
        await node.leadership.phase2Run;
        await settleMicrotasks();

        // Fail-closed, and never half-finalized: the flag and the barrier agree.
        assert.equal(node.leadership.demotionCleanupPending, true, `${point}: pending stays true`);
        assert.equal(resolved(), false, `${point}: the barrier stays unresolved`);
        assert.equal(node.leadership.cleanupBarrier, barrier, `${point}: the same barrier is retained`);

        // Reacquisition stays blocked while cleanup is outstanding.
        const generationBefore = (await readLeaseRaw(harness!)).generation;
        const attempt = node.leadership.attemptAcquisition();
        await settleMicrotasks();
        assert.equal((await readLeaseRaw(harness!)).generation, generationBefore, `${point}: blocked`);

        // The next tick retries phase 2 and it completes.
        fail = false;
        await node.leadership.tick();
        await node.leadership.phase2Run;
        await settleMicrotasks();
        assert.equal(node.leadership.demotionCleanupPending, false, `${point}: retry finalized`);
        assert.equal(resolved(), true, `${point}: the barrier resolved exactly once`);
        await attempt;
      }
    });
  },
);

describe(
  'gateway-leadership · leadership:reacquisition-rechecks-after-barrier-resolution',
  { skip: STORAGE_SKIP },
  () => {
    beforeEach(resetLease);

    it('awaits a new cycle that begins between barrier resolution and the acquisition tick', async () => {
      const node = makeNode(harness!);
      await promote(node);
      const generationBefore = (await readLeaseRaw(harness!)).generation;

      node.leadership.demote('first cycle');
      const firstBarrier = node.leadership.cleanupBarrier;
      assert.ok(firstBarrier !== null);

      /*
       * Subscribed BEFORE the acquisition subscribes, so this callback runs
       * first when the barrier resolves — which is exactly the window the
       * contract names: a new demotion cycle beginning between the resolution
       * and the waiter's resumption.
       */
      let secondCycleBegan = false;
      void firstBarrier.then(() => {
        node.leadership.demote('second cycle');
        secondCycleBegan = true;
      });

      const attempt = node.leadership.attemptAcquisition();
      const done = track(attempt);
      await settleMicrotasks();

      await node.leadership.tick();
      await node.leadership.phase2Run;
      await settleMicrotasks();

      assert.equal(secondCycleBegan, true);
      assert.equal(node.leadership.demotionCleanupPending, true, 'the new cycle is outstanding');
      assert.equal(done(), false, 'the attempt re-read the flag and is waiting again');
      assert.equal(
        (await readLeaseRaw(harness!)).generation,
        generationBefore,
        'no acquisition SQL ran between the two cycles',
      );

      await node.leadership.tick();
      await node.leadership.phase2Run;
      await attempt;

      assert.equal((await readLeaseRaw(harness!)).generation, generationBefore + 1, 'exactly one acquisition');
      assert.equal(node.leadership.servingGeneration, node.leadership.currentGeneration);
    });
  },
);

describe(
  'gateway-leadership · leadership:multiple-barrier-waiters-single-acquisition',
  { skip: STORAGE_SKIP },
  () => {
    beforeEach(resetLease);

    it('coalesces many waiters and ticks into exactly one acquisition pipeline', async () => {
      const node = makeNode(harness!);
      await promote(node);
      const generationBefore = (await readLeaseRaw(harness!)).generation;
      const reconciliationsBefore = node.reconciliations.length;
      const challengeBefore = (await readLeaseRaw(harness!)).challenge;

      const releaseL0 = await node.session.lock.acquire();
      node.leadership.demote('renewal_failed');

      // Many waiters, and many supervisor ticks on top of them.
      const attempts: Promise<void>[] = [];
      for (let i = 0; i < 12; i += 1) attempts.push(node.leadership.attemptAcquisition());
      for (let i = 0; i < 5; i += 1) await node.leadership.tick();
      await settleMicrotasks();

      // They are literally the same attempt, not merely equivalent ones.
      for (const attempt of attempts) {
        assert.equal(attempt, attempts[0], 'every caller joined the one in-flight attempt');
      }

      releaseL0();
      await node.leadership.phase2Run;
      await Promise.all(attempts);
      await settleMicrotasks();

      const after = await readLeaseRaw(harness!);
      assert.equal(after.generation, generationBefore + 1, 'exactly one generation increment');
      assert.notEqual(after.challenge, challengeBefore, 'exactly one fresh challenge');
      assert.equal(node.reconciliations.length, reconciliationsBefore + 1, 'exactly one reconciliation');
      assert.equal(node.leadership.servingGeneration, after.generation, 'one serving publication');
      assert.equal(node.leadership.currentGeneration, after.generation);
    });
  },
);

describe(
  'gateway-leadership · leadership:demotion-during-in-flight-acquisition',
  { skip: STORAGE_SKIP },
  () => {
    beforeEach(resetLease);

    it('publishes nothing and releases only the exact generation it acquired', async () => {
      let node!: Node;
      let demoteOnce = true;
      node = makeNode(harness!, {
        hooks: {
          acquisition: {
            afterSql: () => {
              if (!demoteOnce) return;
              demoteOnce = false;
              node.leadership.demote('demotion began while the SQL was in flight');
            },
          },
        },
      });

      const generationBefore = (await readLeaseRaw(harness!)).generation;
      const attempt = node.leadership.attemptAcquisition();
      /*
       * Both conditions, together. Waiting on `ownerId === null` alone would be
       * satisfied instantly by the reset lease this case starts from — before
       * the acquisition SQL had run at all — and the assertions below would
       * then be checking the setup rather than the release.
       */
      await waitFor(() => !demoteOnce, 'the acquisition SQL to return');
      await waitFor(async () => {
        const lease = await readLeaseRaw(harness!);
        return lease.generation === generationBefore + 1 && lease.ownerId === null;
      }, 'the invalidated attempt to release the exact lease it acquired');

      // The attempt acquired generation N, was invalidated, and released it.
      const afterRelease = await readLeaseRaw(harness!);
      assert.equal(afterRelease.generation, generationBefore + 1, 'the SQL did run once');
      assert.equal(afterRelease.ownerId, null, 'the exact acquired lease was released');
      assert.equal(node.leadership.servingGeneration, null, 'nothing was published');
      assert.equal(node.leadership.isLeader, false);
      assert.equal(node.reconciliations.length, 0, 'no reconciliation ran');
      assert.equal(track(attempt)(), false, 'the attempt is still in flight, retrying');

      // The retry goes through the wait loop, so cleanup must complete first.
      await node.leadership.tick();
      await node.leadership.phase2Run;
      await attempt;

      assert.equal(node.leadership.isLeader, true);
      assert.equal(node.leadership.servingGeneration, node.leadership.currentGeneration);
      assert.equal(node.reconciliations.length, 1);
    });

    it('never releases a successor lease — the predicate binds owner and generation', async () => {
      const successorOwner = randomUUID();
      let node!: Node;
      let once = true;
      node = makeNode(harness!, {
        hooks: {
          acquisition: {
            afterSql: async () => {
              if (!once) return;
              once = false;
              node.leadership.demote('demotion during in-flight acquisition');
              // A successor takes the lease before this attempt's release runs.
              await harness!.pool.query(
                `UPDATE control_plane_lease
                    SET owner_id = $1, generation = generation + 1, heartbeat_at = now()
                  WHERE id = 1`,
                [successorOwner],
              );
            },
          },
        },
      });

      const attempt = node.leadership.attemptAcquisition();
      await waitFor(
        () => !once,
        'the acquisition SQL to return and the successor to take the lease',
      );
      /*
       * (correction 5, disclosed deviation) The predicate waited for "some
       * owner", which the node's OWN first acquisition satisfies before the
       * hook's successor UPDATE lands — a scheduling race that fired once in
       * this correction's verification and reproduces on the unmodified PR
       * head (1 in 5 full-suite runs). Waiting for the successor specifically
       * is what the case's premise already claims, and it makes the assertion
       * deterministic: once the successor owns the row, the stale release's
       * owner-and-generation predicate can never match.
       */
      await waitFor(
        async () => (await readLeaseRaw(harness!)).ownerId === successorOwner,
        'the successor to own the lease, making the stale release provably effect-free',
      );

      const lease = await readLeaseRaw(harness!);
      assert.equal(lease.ownerId, successorOwner, "the successor's lease was not released");

      // Let the attempt terminate so the suite does not leave work in flight.
      await node.leadership.tick();
      await node.leadership.phase2Run;
      await settleMicrotasks();
      assert.equal(node.leadership.servingGeneration, null, 'the stale attempt never serves');
    });

    it('stays fail-closed when the release itself fails — no publication, no parallel acquisition', async () => {
      let node!: Node;
      let releasesFailed = 0;
      let once = true;
      node = makeNode(harness!, {
        hooks: {
          acquisition: {
            afterSql: () => {
              if (!once) return;
              once = false;
              node.leadership.demote('demotion during in-flight acquisition');
            },
            releaseFault: () => {
              if (releasesFailed > 0) return;
              releasesFailed += 1;
              throw new Error('injected release failure');
            },
          },
        },
      });

      const attempt = node.leadership.attemptAcquisition();
      await waitFor(() => releasesFailed === 1, 'the conditional release to be attempted and fail');
      await settleMicrotasks();

      assert.equal(releasesFailed, 1, 'the release was attempted and failed');
      assert.equal(node.leadership.servingGeneration, null, 'no leadership publication');
      assert.equal(node.leadership.acquisitionAttempt, attempt, 'the attempt is still held');
      assert.equal(
        node.leadership.attemptAcquisition(),
        attempt,
        'no parallel acquisition can start while it is held',
      );

      await node.leadership.tick();
      await node.leadership.phase2Run;
      await attempt;
      assert.equal(node.leadership.servingGeneration, node.leadership.currentGeneration);
    });
  },
);

describe(
  'gateway-leadership · reconciliation:demotion-during-reconciliation-withholds-serving-publication',
  { skip: STORAGE_SKIP },
  () => {
    beforeEach(resetLease);

    it('rolls back with zero writes when demoted before reconciliation COMMIT', async () => {
      const gatewayId = randomUUID();
      let node!: Node;
      node = makeNode(harness!, {
        hooks: {
          reconciliation: {
            beforePreCommitRecheck: () => {
              node.leadership.demote('renewal_failed');
            },
          },
        },
        reconciler: async (context) => {
          const result = await node.leadership.runFenced(
            {
              pipeline: 'reconciliation',
              takeL0: false,
              takeRegistryLock: true,
              verifyServingGeneration: false,
            },
            availabilityWriter(gatewayId),
          );
          void context;
          return result.status === 'published';
        },
      });

      await node.leadership.attemptAcquisition();

      assert.equal(await availabilityRowCount(gatewayId), 0, 'zero durable writes');
      assert.equal(node.leadership.servingGeneration, null, 'servingGeneration is not set');
    });

    it('lets honest went_offline edges stand after COMMIT while publishing nothing', async () => {
      const gatewayId = randomUUID();
      let node!: Node;
      node = makeNode(harness!, {
        hooks: {
          reconciliation: {
            afterCommit: () => {
              node.leadership.demote('renewal_failed');
            },
          },
        },
        reconciler: async () => {
          const result = await node.leadership.runFenced(
            {
              pipeline: 'reconciliation',
              takeL0: false,
              takeRegistryLock: true,
              verifyServingGeneration: false,
            },
            availabilityWriter(gatewayId),
          );
          return result.status === 'published';
        },
      });

      await node.leadership.attemptAcquisition();

      assert.equal(await availabilityRowCount(gatewayId), 1, 'the honest durable edge stands');
      assert.equal(node.leadership.servingGeneration, null, 'a demoted process never resurrects serving');
      assert.equal(node.session.describe().liveness, 0, 'no liveness was mutated');
    });

    it('is the one fenced pipeline exempt from the servingGeneration check', async () => {
      // Reconciliation runs while `servingGeneration` is still null — it is the
      // act that sets it — so a fence that demanded the field would deadlock
      // promotion permanently.
      const gatewayId = randomUUID();
      let observedServing: number | null | 'unset' = 'unset';
      const node = makeNode(harness!, {
        reconciler: async () => {
          observedServing = node.leadership.servingGeneration;
          const result = await node.leadership.runFenced(
            {
              pipeline: 'reconciliation',
              takeL0: false,
              takeRegistryLock: true,
              verifyServingGeneration: false,
            },
            availabilityWriter(gatewayId),
          );
          return result.status === 'published';
        },
      });

      await node.leadership.attemptAcquisition();
      assert.equal(observedServing, null, 'servingGeneration was unset during reconciliation');
      assert.equal(await availabilityRowCount(gatewayId), 1, 'and the fenced write still succeeded');
      assert.equal(node.leadership.servingGeneration, node.leadership.currentGeneration);
    });
  },
);

describe('gateway-leadership · fence:stale-leader-commit-refused', { skip: STORAGE_SKIP }, () => {
  beforeEach(resetLease);

  it('refuses an old leader that resumes after a new generation took over', async () => {
    const gatewayId = randomUUID();
    let held!: () => void;
    const paused = new Promise<void>((resolve) => {
      held = resolve;
    });
    let once = true;

    const oldLeader = makeNode(harness!, {
      hooks: {
        heartbeat: {
          beforeTransaction: async () => {
            if (!once) return;
            once = false;
            await paused;
          },
        },
      },
    });
    await promote(oldLeader);

    // 1. The request passes the middleware while the old leader is healthy.
    assert.equal(oldLeader.leadership.canServe(), true);
    const snapshotGeneration = oldLeader.leadership.currentGeneration;

    // 2. It is held at a pause hook before its transaction fence.
    const inflight = oldLeader.leadership.runFenced(
      { pipeline: 'heartbeat', takeL0: true, takeRegistryLock: true, verifyServingGeneration: true },
      availabilityWriter(gatewayId),
    );
    await settleMicrotasks();

    // 3. The lease expires and a new generation acquires and reconciles.
    const newLeader = makeNode(harness!);
    await expireLease(harness!, harness!.config.leaderLeaseTtlMs);
    await promote(newLeader);
    assert.equal(newLeader.leadership.currentGeneration, snapshotGeneration + 1);

    // 4. The request resumes.
    held();
    const result = await inflight;

    // 5. It is refused at the fence with no durable write and no map mutation.
    assert.equal(result.status, 'not_leader');
    assert.equal(result.status === 'not_leader' && result.committed, false);
    assert.equal(await availabilityRowCount(gatewayId), 0, 'no availability event was written');
    assert.equal(oldLeader.session.livenessFor(gatewayId), null, 'no accepted live-map mutation');
  });

  it('holds the lease row to COMMIT, so no ownership change can interleave', async () => {
    const node = makeNode(harness!);
    await promote(node);

    let insideTransaction!: () => void;
    const reached = new Promise<void>((resolve) => {
      insideTransaction = resolve;
    });
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    /*
     * The lease is aged BEFORE the fenced transaction opens. Doing it after
     * would be an UPDATE against the row the transaction holds `FOR UPDATE`,
     * so the test's own setup would block on the lock it is trying to
     * demonstrate — and fail on a statement timeout rather than on the
     * property. Ageing it first changes only `heartbeat_at`, which the fence
     * does not read, so the in-flight transaction still verifies cleanly.
     */
    await expireLease(harness!, harness!.config.leaderLeaseTtlMs);

    const inflight = node.leadership.runFenced(
      { pipeline: 'rotation', takeL0: false, takeRegistryLock: false, verifyServingGeneration: true },
      async () => {
        insideTransaction();
        await hold;
        return { value: 'held' as const, commit: true };
      },
    );

    await reached;

    // A competing acquire must block on the fenced row rather than succeed.
    const rival = makeNode(harness!);
    const rivalAttempt = rival.leadership.attemptAcquisition();
    const rivalDone = track(rivalAttempt);
    await settleMicrotasks();
    assert.equal(rivalDone(), false, 'the rival is blocked on the locked lease row');

    release();
    await inflight;
    await rivalAttempt;
    assert.equal(rivalDone(), true, 'and proceeds once the fenced transaction ends');
  });
});

/*
 * The staleness sweep is leader-dependent and fenced (correction F3), because
 * it reads and nulls the leader's live liveness map. These cases use the full
 * session stack rather than the bare leadership object, because the thing under
 * test is what the sweep does to that map.
 */

/**
 * Reset the lease AND clear any incumbent.
 *
 * The at-most-one-enrolled index is database-global, so a gateway a previous
 * case confirmed would make the next `enrollGateway` fail with
 * `another_gateway_enrolled` — a fixture failure that reads like a product one.
 */
async function resetLeaseAndEnrollments(): Promise<void> {
  await resetLease();
  await harness!.pool.query(
    `UPDATE gateway_current_state SET state = 'revoked', is_currently_enrolled = false
      WHERE is_currently_enrolled`,
  );
}

/** Advance in supervisor-tick steps, renewing as a real leader would. */
async function advanceSweeping(
  node: { clock: { advance(ms: number): void }; leadership: GatewayLeadershipLike; config: { leaderHeartbeatMs: number } },
  totalMs: number,
): Promise<void> {
  const step = node.config.leaderHeartbeatMs;
  for (let elapsed = 0; elapsed < totalMs; elapsed += step) {
    node.clock.advance(Math.min(step, totalMs - elapsed));
    await node.leadership.tick();
    await node.leadership.rotationAttempt;
  }
}

interface GatewayLeadershipLike {
  tick(): Promise<void>;
  readonly rotationAttempt: Promise<unknown> | null;
}

describe(
  'gateway-leadership · sweeper:demotion-during-sweep-withholds-liveness-publication',
  { skip: STORAGE_SKIP },
  () => {
    beforeEach(resetLeaseAndEnrollments);

    it('lets the durable went_offline stand while applying no staged liveness-null', async () => {
      const { makeSessionNode, promoteNode, enrollGateway, openSession, signedBeat, TEST_IP, availabilityRows } =
        await import('./gateway-session-helpers.js');

      let node!: Awaited<ReturnType<typeof makeSessionNode>>;
      node = await makeSessionNode(harness!, {
        hooks: {
          stalenessSweep: {
            afterCommit: () => {
              node.leadership.demote('renewal_failed');
            },
          },
        },
      });
      await promoteNode(node);
      const gateway = await enrollGateway(node);
      const epoch = await openSession(node, gateway);
      await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);

      /*
       * Time is advanced the way it really passes for a leader: in tick-sized
       * steps with renewals. Jumping it would breach the leader safety deadline
       * and the sweep would be refused at the fence for that reason instead of
       * for the demotion this case is about.
       */
      await advanceSweeping(node, node.config.gatewayStalenessMs + 5_000);

      const result = await node.sweeps.sweepStaleness();

      assert.equal(result.published, false, 'the sweep detected the demotion');
      assert.equal(result.committed, true, 'and its transaction had already committed');
      assert.deepEqual(
        (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
        ['went_online', 'went_offline'],
        'the legitimately fenced durable went_offline stands',
      );
      assert.notEqual(
        node.session.livenessFor(gateway.gatewayId),
        null,
        'but the staged liveness-null is NOT applied after a detected demotion',
      );
    });

    it('applies the liveness-null on a clean sweep, so alternation holds across the boundary', async () => {
      const { makeSessionNode, promoteNode, enrollGateway, openSession, signedBeat, TEST_IP, availabilityRows } =
        await import('./gateway-session-helpers.js');

      const node = await makeSessionNode(harness!);
      await promoteNode(node);
      const gateway = await enrollGateway(node);
      const epoch = await openSession(node, gateway);
      await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);

      await advanceSweeping(node, node.config.gatewayStalenessMs + 5_000);
      const result = await node.sweeps.sweepStaleness();

      assert.equal(result.published, true);
      assert.equal(result.transitionsWritten, 1);
      assert.equal(node.session.livenessFor(gateway.gatewayId), null, 'liveness is nulled');
      assert.deepEqual(
        (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
        ['went_online', 'went_offline'],
      );

      // A nulled entry makes the next accepted beat a first-beat.
      await node.service.heartbeat(signedBeat(node, gateway, epoch, 2), TEST_IP);
      assert.deepEqual(
        (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
        ['went_online', 'went_offline', 'went_online'],
        'strict alternation holds across the sweep boundary',
      );
    });
  },
);

describe(
  'gateway-leadership · sweeper:stale-leader-fenced-with-zero-write-and-zero-map-mutation',
  { skip: STORAGE_SKIP },
  () => {
    beforeEach(resetLeaseAndEnrollments);

    it('refuses a paused sweeper resumed after a takeover', async () => {
      const { makeSessionNode, promoteNode, enrollGateway, openSession, signedBeat, TEST_IP, availabilityRows } =
        await import('./gateway-session-helpers.js');

      let held!: () => void;
      const paused = new Promise<void>((resolve) => {
        held = resolve;
      });
      let armed = false;
      let reachedPause!: () => void;
      const reached = new Promise<void>((resolve) => {
        reachedPause = resolve;
      });

      const oldLeader = await makeSessionNode(harness!, {
        hooks: {
          stalenessSweep: {
            beforeTransaction: async () => {
              if (!armed) return;
              armed = false;
              reachedPause();
              await paused;
            },
          },
        },
      });
      await promoteNode(oldLeader);
      const gateway = await enrollGateway(oldLeader);
      const epoch = await openSession(oldLeader, gateway);
      await oldLeader.service.heartbeat(signedBeat(oldLeader, gateway, epoch, 1), TEST_IP);
      await advanceSweeping(oldLeader, oldLeader.config.gatewayStalenessMs + 5_000);

      // The sweeper is held before its transaction fence.
      armed = true;
      const sweeping = oldLeader.sweeps.sweepStaleness();
      await reached;

      // The lease expires and a new generation takes over and reconciles.
      await expireLease(harness!, harness!.config.leaderLeaseTtlMs);
      const successor = await makeSessionNode(harness!);
      await promoteNode(successor);

      const rowsAfterTakeover = (await availabilityRows(harness!.pool, gateway.gatewayId)).map(
        (row) => row.transition,
      );

      held();
      const result = await sweeping;

      assert.equal(result.published, false, 'the stale sweeper is refused at the fence');
      assert.equal(result.committed, false, 'and nothing was committed');
      assert.equal(result.transitionsWritten, 0, 'no availability event is written');
      assert.deepEqual(
        (await availabilityRows(harness!.pool, gateway.gatewayId)).map((row) => row.transition),
        rowsAfterTakeover,
        'the history is exactly what the takeover left',
      );
      assert.notEqual(
        oldLeader.session.livenessFor(gateway.gatewayId),
        null,
        'and the liveness map is not mutated',
      );
    });
  },
);

/*
 * Rev 4.7 correction T2. Step 6 of the acquisition published `leader = true`
 * BEFORE epoch adoption and reconciliation, and a failure in either escaped
 * the attempt entirely: the throw was logged, the attempt went terminal, and
 * the process was left leader-without-serving — the one state the supervisor
 * has no branch for. Its leader branch only renews, so the wedge held the
 * lease and never served, forever.
 *
 * The recovery unit is adoption, reconciliation, and serving publication
 * together: any failure abandons the acquired leadership (demote locally,
 * release the exact acquired generation) and lets the follower branch retry.
 */
describe('gateway-leadership · a failed adoption or reconciliation is retried, not wedged', { skip: STORAGE_SKIP }, () => {
  beforeEach(resetLease);

  /** Advance past the follower interval, tick, and await what the tick started. */
  async function retryNow(node: Node): Promise<void> {
    node.clock.advance(FOLLOWER_ACQUISITION_INTERVAL_MS + 1_000);
    await node.leadership.tick();
    await node.leadership.acquisitionAttempt;
  }

  it('adoption-throw:the acquired lease is released and reacquired', async () => {
    const node = makeNode(harness!);
    const session = node.session;
    const realAdopt = session.adoptEpoch.bind(session);
    let failAdoption = true;
    session.adoptEpoch = (key: Parameters<typeof realAdopt>[0]): void => {
      if (failAdoption) throw new Error('injected epoch-adoption failure');
      realAdopt(key);
    };

    await node.leadership.attemptAcquisition();

    // The wedge the correction removes: leader without a serving generation.
    assert.equal(node.leadership.canServe(), false);

    // The acquired generation was RELEASED, not silently held.
    const lease = await readLeaseRaw(harness!);
    assert.equal(lease.ownerId, null, 'an abandoned acquisition releases its lease');

    failAdoption = false;
    await retryNow(node);

    assert.equal(node.leadership.canServe(), true, 'the follower branch retries and serves');
    assert.equal(
      node.leadership.servingGeneration,
      node.leadership.currentGeneration,
      'serving is republished for the new generation',
    );
  });

  it('reconciliation-false:serving is withheld, leadership abandoned, retry serves', async () => {
    let reconcileOnce = false;
    const node = makeNode(harness!, {
      reconciler: async () => reconcileOnce,
    });

    await node.leadership.attemptAcquisition();
    assert.equal(node.leadership.canServe(), false, 'withheld serving means not serving');

    const lease = await readLeaseRaw(harness!);
    assert.equal(lease.ownerId, null, 'the withheld leadership does not keep the lease held');

    reconcileOnce = true;
    await retryNow(node);

    assert.equal(node.leadership.canServe(), true);
  });

  it('post-reconciliation-throw:the attempt is terminal, the recovery is not', async () => {
    let failPublication = true;
    const node = makeNode(harness!, {
      hooks: {
        acquisition: {
          beforeServingPublication: () => {
            if (failPublication) throw new Error('injected pre-publication failure');
            return undefined;
          },
        },
      },
    });

    await node.leadership.attemptAcquisition();
    assert.equal(node.leadership.canServe(), false);

    failPublication = false;
    await retryNow(node);

    assert.equal(node.leadership.canServe(), true);
  });
});

describe(
  'gateway-leadership · a rotation that failed to publish is retried, not scheduled away',
  { skip: STORAGE_SKIP },
  () => {
    beforeEach(resetLease);

    it('rotation:a-commit-failure-does-not-consume-the-rotation-interval', async () => {
      let dispatches = 0;
      const node = makeNode(harness!, {
        configOverrides: {
          challengeRotationMs: 30_000,
          leaderSafetyDeadlineMs: 300_000,
        },
        hooks: {
          rotation: {
            beforeTransaction: () => {
              dispatches += 1;
            },
            commitFault: () => {
              throw new Error('injected: the COMMIT did not land');
            },
          },
        },
      });
      try {
        await promote(node);

        node.clock.advance(30_000); // the rotation is due
        await node.leadership.tick();
        await quiesce(node);
        assert.equal(dispatches, 1, 'the rotation was dispatched and its COMMIT failed');

        node.clock.advance(10_000); // one heartbeat — inside the rotation interval
        await node.leadership.tick();
        await quiesce(node);
        assert.equal(
          dispatches,
          2,
          'a rotation whose COMMIT failed is retried on the next tick, not a full interval later',
        );
      } finally {
        await node.leadership.stop().catch(() => undefined);
      }
    });
  },
);
