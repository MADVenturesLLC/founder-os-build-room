/**
 * §9 — the heartbeat, and the availability history it writes.
 *
 * A heartbeat is the only thing in this system that can say a machine is there.
 * That makes two properties load-bearing: it must not accept a beat it cannot
 * place in a live session, and the history it appends must alternate strictly,
 * because a history with two consecutive onlines cannot answer the one question
 * anybody asks it — how long was the gateway down.
 */

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import {
  TEST_IP,
  availabilityRows,
  awaitingGateway,
  enrollGateway,
  makeSessionNode,
  openSession,
  promoteNode,
  rejectionCount,
  signedBeat,
  signedStart,
  type EnrolledGateway,
  type SessionNode,
} from './gateway-session-helpers.js';
import { generateTestKeypair, hex32, makeHeartbeat } from './gateway-helpers.js';
import { settleAllNodes, settleMicrotasks, track } from './gateway-leadership-helpers.js';

let harness: GatewayHarness | undefined;

before(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('heartbeat');
});

after(async () => {
  await destroyGatewayHarness(harness);
});

/*
 * No background work may outlive a case: an unawaited acquisition landing
 * after the next case has reset the lease would fail it for an unrelated reason.
 */
afterEach(settleAllNodes);

beforeEach(async () => {
  if (STORAGE_SKIP !== false) return;
  await harness!.pool.query(
    `UPDATE gateway_current_state SET state = 'revoked', is_currently_enrolled = false
      WHERE is_currently_enrolled`,
  );
  await harness!.pool.query(
    'UPDATE control_plane_lease SET owner_id = NULL, heartbeat_at = NULL WHERE id = 1',
  );
});

/** Advance in supervisor-tick steps, renewing as a real leader would. */
async function advanceWithRenewals(node: SessionNode, totalMs: number): Promise<void> {
  const step = node.config.leaderHeartbeatMs;
  for (let elapsed = 0; elapsed < totalMs; elapsed += step) {
    node.clock.advance(Math.min(step, totalMs - elapsed));
    await node.leadership.tick();
    await node.leadership.rotationAttempt;
  }
}

async function servingNode(options: Parameters<typeof makeSessionNode>[1] = {}): Promise<{
  node: SessionNode;
  gateway: EnrolledGateway;
  epoch: string;
}> {
  const node = await makeSessionNode(harness!, options);
  await promoteNode(node);
  const gateway = await enrollGateway(node);
  const epoch = await openSession(node, gateway);
  return { node, gateway, epoch };
}

describe('gateway-heartbeat · the first beat and the steady state', { skip: STORAGE_SKIP }, () => {
  it('first-beat-exactly-one-went-online', async () => {
    const { node, gateway, epoch } = await servingNode();

    const first = await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);
    assert.equal(first.status, 200);
    assert.equal(first.body['state'], 'enrolled');

    const rows = await availabilityRows(node.pool, gateway.gatewayId);
    assert.deepEqual(rows.map((row) => row.transition), ['went_online'], 'exactly one');

    // Steady-state beats produce no durable rows at all.
    for (let sequence = 2; sequence <= 5; sequence += 1) {
      assert.equal(
        (await node.service.heartbeat(signedBeat(node, gateway, epoch, sequence), TEST_IP)).status,
        200,
      );
    }
    assert.deepEqual(
      (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
      ['went_online'],
      'a steady beat is not an event',
    );
    assert.equal(node.session.cursorFor(gateway.gatewayId)?.lastSequence, 5);
  });
});

/*
 * Rev 4.7 correction B3. The staleness sweep must decide WHICH gateways are
 * stale inside the fenced body, under L0. The delivered code scanned the
 * liveness map before entering the fence, so a beat that landed between the
 * scan and the body — exactly the interleaving L0 exists to serialize — was
 * swept offline anyway: a future-dated `went_offline` stamped thirty seconds
 * after the fresh beat, and the fresh liveness nulled.
 *
 * The interleaving is driven deterministically: the deciding beat parks at
 * `beforeTransaction` (L0 held, transaction not begun, liveness not yet
 * updated), the sweep is started — its pre-scan, if there is one, sees the OLD
 * liveness — and only then is the beat released to complete. What the sweep
 * writes is then a fact about code, not about scheduling.
 */
describe('gateway-heartbeat · the staleness sweep judges inside the fence', { skip: STORAGE_SKIP }, () => {
  it('sweep:beat-landing-after-the-scan-is-not-swept-offline', async () => {
    let beats = 0;
    let releaseBeat: (() => void) | undefined;
    let announceParked: (() => void) | undefined;
    const release = new Promise<void>((resolve) => {
      releaseBeat = resolve;
    });
    // Resolved by the hook itself, so the test never guesses when L0 is held.
    const beatHoldsL0 = new Promise<void>((resolve) => {
      announceParked = resolve;
    });
    const { node, gateway, epoch } = await servingNode({
      hooks: {
        heartbeat: {
          // Park only the DECIDING beat: beat 1 must stamp liveness normally.
          beforeTransaction: () => {
            beats += 1;
            if (beats === 2) {
              announceParked!();
              return release;
            }
            return undefined;
          },
        },
      },
    });

    assert.equal((await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP)).status, 200);

    // Liveness goes stale the honest way — time passes, the leader keeps renewing.
    await advanceWithRenewals(node, node.config.gatewayStalenessMs + 5_000);

    // Beat 2 arrives and parks holding L0, before its transaction: the map
    // still holds the OLD stamp, and nothing can move it but this beat.
    const beatTwo = node.service.heartbeat(signedBeat(node, gateway, epoch, 2), TEST_IP);
    await beatHoldsL0;

    // The sweep starts now. A pre-fence scan — if the code still does one —
    // sees the OLD liveness; the fenced body queues behind the beat's L0.
    const sweepPromise = node.sweeps.sweepStaleness();
    await settleMicrotasks();

    // Beat 2 completes: the stale gap is recorded by the beat itself, and the
    // liveness map now holds a FRESH stamp.
    releaseBeat!();
    const beatResult = await beatTwo;
    assert.equal(beatResult.status, 200, 'the beat itself is accepted');

    const swept = await sweepPromise;

    assert.equal(swept.transitionsWritten, 0, 'nothing was stale at the time the sweep executed');
    assert.equal(swept.livenessCleared, 0);
    assert.equal(swept.published, false);

    assert.deepEqual(
      (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
      ['went_online', 'went_offline', 'went_online'],
      'the beat wrote its own honest edges; the sweep added none',
    );
    assert.ok(
      node.session.livenessFor(gateway.gatewayId) !== null,
      'a fresh liveness stamp survives the sweep',
    );
  });
});

describe('gateway-heartbeat · the 409 family', { skip: STORAGE_SKIP }, () => {
  it('stale-epoch-yields-session-required', async () => {
    const { node, gateway } = await servingNode();
    const result = await node.service.heartbeat(signedBeat(node, gateway, hex32(), 1), TEST_IP);

    assert.equal(result.status, 409);
    assert.equal(result.body['error'], 'session_required');
  });

  it('session-required when no session exists at all', async () => {
    const node = await makeSessionNode(harness!);
    await promoteNode(node);
    const gateway = await enrollGateway(node);

    const result = await node.service.heartbeat(signedBeat(node, gateway, hex32(), 1), TEST_IP);
    assert.equal(result.status, 409);
    assert.equal(result.body['error'], 'session_required');
  });

  it('no-epoch-leak — no 409 response ever echoes the server epoch', async () => {
    const { node, gateway, epoch } = await servingNode();

    const refusals = [
      await node.service.heartbeat(signedBeat(node, gateway, hex32(), 1), TEST_IP),
      await node.service.heartbeat(signedBeat(node, gateway, epoch, 0 + 1), TEST_IP),
    ];
    // Now provoke the remaining 409s against a live session.
    const stale = await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);
    const outOfWindow = await node.service.heartbeat(
      signedBeat(node, gateway, epoch, 99, { timestampMs: node.clock.wallNow() - 10_000_000 }),
      TEST_IP,
    );
    refusals.push(stale, outOfWindow);

    for (const refusal of refusals) {
      if (refusal.status !== 409) continue;
      assert.ok(
        !JSON.stringify(refusal.body).includes(epoch),
        `a ${String(refusal.body['error'])} refusal leaked the current epoch`,
      );
    }

    // The 200 body does carry it — a caller that reached 200 proved it holds the key.
    const accepted = await node.service.heartbeat(signedBeat(node, gateway, epoch, 100), TEST_IP);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body['epoch'], epoch);
  });

  it('duplicate-sequence and sequence-regression are both stale_sequence', async () => {
    const { node, gateway, epoch } = await servingNode();
    assert.equal((await node.service.heartbeat(signedBeat(node, gateway, epoch, 5), TEST_IP)).status, 200);

    const duplicate = await node.service.heartbeat(signedBeat(node, gateway, epoch, 5), TEST_IP);
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body['error'], 'stale_sequence');

    const regression = await node.service.heartbeat(signedBeat(node, gateway, epoch, 4), TEST_IP);
    assert.equal(regression.status, 409);
    assert.equal(regression.body['error'], 'stale_sequence');

    assert.equal(node.session.cursorFor(gateway.gatewayId)?.lastSequence, 5, 'the cursor is unmoved');
  });

  it('timestamp-window — beats outside the acceptance window are refused', async () => {
    const { node, gateway, epoch } = await servingNode();
    const window = node.config.gatewayTimestampWindowMs;

    const tooOld = await node.service.heartbeat(
      signedBeat(node, gateway, epoch, 1, { timestampMs: node.clock.wallNow() - window - 1 }),
      TEST_IP,
    );
    assert.equal(tooOld.body['error'], 'stale_timestamp');

    const tooNew = await node.service.heartbeat(
      signedBeat(node, gateway, epoch, 2, { timestampMs: node.clock.wallNow() + window + 1 }),
      TEST_IP,
    );
    assert.equal(tooNew.body['error'], 'stale_timestamp');

    const atEdge = await node.service.heartbeat(
      signedBeat(node, gateway, epoch, 3, { timestampMs: node.clock.wallNow() + window }),
      TEST_IP,
    );
    assert.equal(atEdge.status, 200, 'the boundary itself is inside the window');
  });
});

describe('gateway-heartbeat · the state ladder applies to both signed routes', { skip: STORAGE_SKIP }, () => {
  it('revoked-key-aggregates — a revoked key is refused and counted under its own id', async () => {
    const { node, gateway, epoch } = await servingNode();
    await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);

    assert.equal((await node.store.revokeGateway(gateway.gatewayId, null)).ok, true);

    const result = await node.service.heartbeat(signedBeat(node, gateway, epoch, 2), TEST_IP);
    assert.equal(result.status, 403);
    assert.equal(result.body['error'], 'revoked');
    assert.ok((await rejectionCount(node.pool, gateway.keyId, 'revoked')) >= 1);
  });

  it('refuses awaiting, denied and expired identities on heartbeat traffic too', async () => {
    const node = await makeSessionNode(harness!);
    await promoteNode(node);

    const awaiting = await awaitingGateway(node);
    const beat = makeHeartbeat(awaiting.key, {
      gatewayId: awaiting.gatewayId,
      keyId: awaiting.keyId,
      epoch: hex32(),
      sequence: 1,
      nonce: hex32(),
      timestampMs: node.clock.wallNow(),
    }) as unknown as Record<string, unknown>;

    const result = await node.service.heartbeat(beat, TEST_IP);
    assert.equal(result.status, 403);
    assert.equal(result.body['error'], 'awaiting_approval');
  });

  it('bad-signature-under-resolved-key — 401 counted against the registry key', async () => {
    const { node, gateway, epoch } = await servingNode();
    const impostor = generateTestKeypair();
    const forged = makeHeartbeat(impostor, {
      gatewayId: gateway.gatewayId,
      keyId: gateway.keyId,
      epoch,
      sequence: 1,
      nonce: hex32(),
      timestampMs: node.clock.wallNow(),
    }) as unknown as Record<string, unknown>;

    const result = await node.service.heartbeat(forged, TEST_IP);
    assert.equal(result.status, 401);
    assert.equal(result.body['error'], 'bad_signature');
    assert.ok(
      (await rejectionCount(node.pool, gateway.keyId, 'bad_signature')) >= 1,
      'a valid registry keyId carrying a bad signature aggregates under the resolved id',
    );
  });
});

describe(
  'gateway-heartbeat · heartbeat:stale-preserved-liveness-before-sweep-produces-ordered-offline-online',
  { skip: STORAGE_SKIP },
  () => {
    it('writes the overdue went_offline and then the new went_online, in one transaction', async () => {
      const { node, gateway, epoch } = await servingNode();

      assert.equal((await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP)).status, 200);
      const priorBeat = node.session.livenessFor(gateway.gatewayId);
      assert.ok(priorBeat !== null);

      // The gateway goes quiet for longer than the staleness threshold, and the
      // sweeper has not run: the latest durable event is still `went_online`.
      await advanceWithRenewals(node, node.config.gatewayStalenessMs + 20_000);

      const beat = await node.service.heartbeat(signedBeat(node, gateway, epoch, 2), TEST_IP);
      assert.equal(beat.status, 200);

      const rows = await availabilityRows(node.pool, gateway.gatewayId);
      assert.deepEqual(
        rows.map((row) => row.transition),
        ['went_online', 'went_offline', 'went_online'],
        'ordered edges, one transaction, one commit',
      );

      const overdueOffline = rows[1]!;
      assert.equal(
        overdueOffline.occurredAt.getTime(),
        priorBeat.wallMs + node.config.gatewayStalenessMs,
        'the outage is stamped when it began, not when it was noticed',
      );
      assert.ok(
        rows[2]!.occurredAt.getTime() >= overdueOffline.occurredAt.getTime(),
        'the online edge is clamped to never precede the offline it follows',
      );
      assert.ok(rows[1]!.seq < rows[2]!.seq, 'seq records the insertion order durably');
    });

    it('writes only the new went_online when the latest durable event is already offline', async () => {
      const { node, gateway, epoch } = await servingNode();
      await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);

      // Stand in for a sweeper that already ran.
      await harness!.pool.query(
        `INSERT INTO gateway_availability_events (event_id, gateway_id, transition, occurred_at)
         VALUES (gen_random_uuid(), $1, 'went_offline', now())`,
        [gateway.gatewayId],
      );
      await advanceWithRenewals(node, node.config.gatewayStalenessMs + 20_000);

      await node.service.heartbeat(signedBeat(node, gateway, epoch, 2), TEST_IP);
      assert.deepEqual(
        (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
        ['went_online', 'went_offline', 'went_online'],
      );
    });

    it('writes only the new went_online when no history is retained at all', async () => {
      const { node, gateway, epoch } = await servingNode();
      await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);

      // Fully aged out, per the ninety-day sweep's no-exception rule.
      await harness!.pool.query('DELETE FROM gateway_availability_events WHERE gateway_id = $1', [
        gateway.gatewayId,
      ]);
      await advanceWithRenewals(node, node.config.gatewayStalenessMs + 20_000);

      await node.service.heartbeat(signedBeat(node, gateway, epoch, 2), TEST_IP);
      assert.deepEqual(
        (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
        ['went_online'],
      );
    });
  },
);

describe(
  'gateway-heartbeat · heartbeat:concurrent-identical-sequence-crossing-commit-publish-boundary',
  { skip: STORAGE_SKIP },
  () => {
    it('admits one, refuses the other, and advances sequence and liveness exactly once', async () => {
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let armed = false;
      let paused!: () => void;
      const reached = new Promise<void>((resolve) => {
        paused = resolve;
      });

      const { node, gateway, epoch } = await servingNode({
        hooks: {
          heartbeat: {
            beforePublish: async () => {
              if (!armed) return;
              armed = false;
              paused();
              await held;
            },
          },
        },
      });

      const beatA = signedBeat(node, gateway, epoch, 1);
      const beatB = signedBeat(node, gateway, epoch, 1);

      armed = true;
      const a = node.service.heartbeat(beatA, TEST_IP);
      await reached;

      const b = node.service.heartbeat(beatB, TEST_IP);
      const bDone = track(b);
      await settleMicrotasks();
      assert.equal(bDone(), false, 'B is blocked on L0, not racing A across the boundary');

      release();
      const [resultA, resultB] = await Promise.all([a, b]);

      assert.deepEqual([resultA.status, resultB.status].sort(), [200, 409], 'exactly one succeeds');
      const refused = resultA.status === 409 ? resultA : resultB;
      assert.equal(refused.body['error'], 'stale_sequence');

      assert.equal(node.session.cursorFor(gateway.gatewayId)?.lastSequence, 1, 'advanced exactly once');
      assert.deepEqual(
        (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
        ['went_online'],
        'and liveness transitioned exactly once',
      );
    });
  },
);

describe(
  'gateway-heartbeat · heartbeat:heartbeat-commit-failure-does-not-advance-cursor-or-liveness',
  { skip: STORAGE_SKIP },
  () => {
    it('leaves cursor and liveness untouched, and the same sequence replays cleanly', async () => {
      let fail = true;
      const { node, gateway, epoch } = await servingNode({
        hooks: {
          heartbeat: {
            commitFault: () => {
              if (fail) throw new Error('injected commit failure');
            },
          },
        },
      });

      const beat = signedBeat(node, gateway, epoch, 1);
      const failed = await node.service.heartbeat(beat, TEST_IP);

      assert.equal(failed.status, 500);
      assert.equal(node.session.cursorFor(gateway.gatewayId)?.lastSequence, 0, 'cursor unmoved');
      assert.equal(node.session.livenessFor(gateway.gatewayId), null, 'liveness unset');
      assert.deepEqual(
        await availabilityRows(node.pool, gateway.gatewayId),
        [],
        'and no availability row was committed',
      );

      fail = false;
      const retried = await node.service.heartbeat(beat, TEST_IP);
      assert.equal(retried.status, 200, 'the same sequence replays cleanly after recovery');
      assert.equal(node.session.cursorFor(gateway.gatewayId)?.lastSequence, 1);
    });
  },
);

describe('gateway-heartbeat · takeover derives offline until the first accepted beat', { skip: STORAGE_SKIP }, () => {
  it('a new leader reconciles an honest went_offline and starts from an empty map', async () => {
    const { node, gateway, epoch } = await servingNode();
    await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);
    assert.deepEqual(
      (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
      ['went_online'],
    );

    // The lease expires and a new generation takes over.
    await harness!.pool.query(
      'UPDATE control_plane_lease SET heartbeat_at = now() - make_interval(secs => $1) WHERE id = 1',
      [harness!.config.leaderLeaseTtlMs / 1_000 + 5],
    );
    const successor = await makeSessionNode(harness!);
    await promoteNode(successor);

    assert.deepEqual(
      (await availabilityRows(successor.pool, gateway.gatewayId)).map((row) => row.transition),
      ['went_online', 'went_offline'],
      'reconciliation wrote the honest offline edge',
    );
    assert.equal(successor.session.livenessFor(gateway.gatewayId), null, 'the new map is empty');

    // A fresh session on the new leader still derives offline until a beat.
    const newEpoch = await openSession(successor, gateway);
    assert.equal(successor.session.livenessFor(gateway.gatewayId), null);
    assert.deepEqual(
      (await availabilityRows(successor.pool, gateway.gatewayId)).map((row) => row.transition),
      ['went_online', 'went_offline'],
    );

    await successor.service.heartbeat(signedBeat(successor, gateway, newEpoch, 1), TEST_IP);
    assert.deepEqual(
      (await availabilityRows(successor.pool, gateway.gatewayId)).map((row) => row.transition),
      ['went_online', 'went_offline', 'went_online'],
      'and clears only at the first accepted beat',
    );
    void signedStart;
  });
});

describe('gateway-heartbeat · availability:no-consecutive-went-online', { skip: STORAGE_SKIP }, () => {
  it('holds across every transition path — heartbeat, sweep, and promotion reconciliation', async () => {
    const { node, gateway, epoch } = await servingNode();

    // 1. Heartbeat writes the first online.
    await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);

    // 2. The sweeper writes the offline once liveness goes stale.
    await advanceWithRenewals(node, node.config.gatewayStalenessMs + 5_000);
    const swept = await node.sweeps.sweepStaleness();
    assert.equal(swept.published, true);

    // 3. A heartbeat writes the next online against the swept offline.
    await node.service.heartbeat(signedBeat(node, gateway, epoch, 2), TEST_IP);

    // 4. A stale-liveness beat writes an ordered offline/online pair itself.
    await advanceWithRenewals(node, node.config.gatewayStalenessMs + 5_000);
    await node.service.heartbeat(signedBeat(node, gateway, epoch, 3), TEST_IP);

    // 5. A takeover reconciles an honest offline.
    await harness!.pool.query(
      'UPDATE control_plane_lease SET heartbeat_at = now() - make_interval(secs => $1) WHERE id = 1',
      [harness!.config.leaderLeaseTtlMs / 1_000 + 5],
    );
    const successor = await makeSessionNode(harness!);
    await promoteNode(successor);

    // 6. And the successor's first accepted beat writes the next online.
    const newEpoch = await openSession(successor, gateway);
    await successor.service.heartbeat(signedBeat(successor, gateway, newEpoch, 1), TEST_IP);

    const history = (await availabilityRows(harness!.pool, gateway.gatewayId)).map(
      (row) => row.transition,
    );
    assert.ok(history.length >= 6, `expected a rich history, got ${JSON.stringify(history)}`);

    for (let index = 1; index < history.length; index += 1) {
      assert.notEqual(
        history[index],
        history[index - 1],
        `adjacent same-direction rows at ${index}: ${JSON.stringify(history)}`,
      );
    }
    assert.equal(history[0], 'went_online', 'a history begins by going online');
  });
});

describe('gateway-heartbeat · random-keyid-flood-single-unknown-row', { skip: STORAGE_SKIP }, () => {
  it('mints one counting row for many invented key identifiers from one source', async () => {
    const node = await makeSessionNode(harness!);
    await promoteNode(node);
    const sourceIp = '198.51.100.77';

    const before = await harness!.pool.query<{ count: string }>(
      `SELECT count(*) FROM gateway_message_rejections
        WHERE source_ip = $1 AND resolved_key_id = 'unknown'`,
      [sourceIp],
    );

    // Forty distinct presented key ids, none of which resolves.
    for (let i = 0; i < 40; i += 1) {
      const impostor = generateTestKeypair();
      const beat = makeHeartbeat(impostor, {
        gatewayId: '11111111-2222-4333-8444-555555555555',
        keyId: impostor.keyId,
        epoch: hex32(),
        sequence: 1,
        nonce: hex32(),
        timestampMs: node.clock.wallNow(),
      }) as unknown as Record<string, unknown>;
      const result = await node.service.heartbeat(beat, sourceIp);
      assert.equal(result.body['error'], 'unknown_key');
    }

    const after = await harness!.pool.query<{ count: string; total: string }>(
      `SELECT count(*) AS count, COALESCE(sum(count), 0) AS total
         FROM gateway_message_rejections
        WHERE source_ip = $1 AND resolved_key_id = 'unknown' AND error_code = 'unknown_key'`,
      [sourceIp],
    );

    assert.ok(
      Number(after.rows[0]?.count ?? '0') <= Number(before.rows[0]?.count ?? '0') + 1,
      'forty invented identifiers must not mint forty rows',
    );
    assert.ok(
      Number(after.rows[0]?.total ?? '0') >= 40,
      'the attempts are still counted, just not given their own rows',
    );

    // And nothing an attacker chose became a durable aggregation key.
    const keys = await harness!.pool.query<{ resolved_key_id: string }>(
      'SELECT DISTINCT resolved_key_id FROM gateway_message_rejections WHERE source_ip = $1',
      [sourceIp],
    );
    assert.deepEqual(keys.rows.map((row) => row.resolved_key_id), ['unknown']);
  });
});
