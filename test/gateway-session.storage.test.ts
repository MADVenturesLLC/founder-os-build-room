/**
 * §9 — session-start: challenge epochs, nonces, and what a session does NOT do.
 *
 * The single most important negative claim in this file is that a successful
 * session-start leaves the gateway OFFLINE. A session says a machine can sign;
 * only a heartbeat says it is there. Deriving online from a session-start was
 * the original defect (correction C2), and it is the kind of defect that makes
 * a dispatch decision on evidence that does not exist.
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
  currentChallenge,
  enrollGateway,
  makeSessionNode,
  openSession,
  promoteNode,
  rejectionCount,
  signedBeat,
  signedStart,
  startNodeServer,
  type EnrolledGateway,
  type SessionNode,
} from './gateway-session-helpers.js';
import { generateTestKeypair, hex32 } from './gateway-helpers.js';
import {
  BACKOFF_MIN_MS,
  ControlPlaneClient,
  PrimaryLane,
  type FetchLike,
  type GatewayIdentity,
} from '../packages/gateway-daemon/src/index.js';
import { timestampWithinWindow } from '../packages/gateway-protocol/src/index.js';
import { challengeFreshnessDeadlineMs } from '../packages/control-plane/src/config.js';
import { settleAllNodes, settleMicrotasks, track, waitFor } from './gateway-leadership-helpers.js';

let harness: GatewayHarness | undefined;

before(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('session');
});

after(async () => {
  await destroyGatewayHarness(harness);
});

/*
 * No background work may outlive a case: an unawaited acquisition landing
 * after the next case has reset the lease would fail it for an unrelated reason.
 */
afterEach(settleAllNodes);

/** A serving node with one enrolled gateway. Fresh lease state each time. */
async function servingNode(options: Parameters<typeof makeSessionNode>[1] = {}): Promise<{
  node: SessionNode;
  gateway: EnrolledGateway;
}> {
  const node = await makeSessionNode(harness!, options);
  await promoteNode(node);
  const gateway = await enrollGateway(node);
  return { node, gateway };
}

async function clearEnrolled(): Promise<void> {
  await harness!.pool.query(
    `UPDATE gateway_current_state SET state = 'revoked', is_currently_enrolled = false
      WHERE is_currently_enrolled`,
  );
  await harness!.pool.query(
    `UPDATE control_plane_lease SET owner_id = NULL, heartbeat_at = NULL WHERE id = 1`,
  );
}

beforeEach(async () => {
  if (STORAGE_SKIP !== false) return;
  await clearEnrolled();
});


/**
 * Move time forward the way it actually moves for a leader: in supervisor-tick
 * increments, renewing the lease as it goes.
 *
 * Jumping the scripted clock forward in one step would breach the leader safety
 * deadline and demote the node — correctly, since a leader that has not renewed
 * within its deadline has no business committing anything. So the test advances
 * the way a real day passes, and the rotation each tick starts is awaited so
 * nothing is left in flight.
 */
async function advanceWithRenewals(node: SessionNode, totalMs: number): Promise<void> {
  const step = node.config.leaderHeartbeatMs;
  for (let elapsed = 0; elapsed < totalMs; elapsed += step) {
    node.clock.advance(Math.min(step, totalMs - elapsed));
    await node.leadership.tick();
    await node.leadership.rotationAttempt;
  }
}

describe('gateway-session · session-start:alone-leaves-offline', { skip: STORAGE_SKIP }, () => {
  it('creates a cursor, sets no liveness, and writes no went_online', async () => {
    const { node, gateway } = await servingNode();

    const result = await node.service.sessionStart(await signedStart(node, gateway), TEST_IP);

    assert.equal(result.status, 200);
    assert.equal(result.body['state'], 'enrolled');
    assert.match(String(result.body['epoch']), /^[0-9a-f]{64}$/);

    const cursor = node.session.cursorFor(gateway.gatewayId);
    assert.ok(cursor !== null, 'the cursor is created');
    assert.equal(cursor.lastSequence, 0);

    assert.equal(node.session.livenessFor(gateway.gatewayId), null, 'liveness stays null');
    assert.deepEqual(await availabilityRows(node.pool, gateway.gatewayId), [], 'no went_online row');
  });

  it('replaces only the cursor on a second start', async () => {
    const { node, gateway } = await servingNode();
    const first = await openSession(node, gateway);
    const second = await openSession(node, gateway);

    assert.notEqual(first, second, 'each session gets a fresh epoch');
    assert.equal(node.session.cursorFor(gateway.gatewayId)?.epoch, second);
    assert.deepEqual(await availabilityRows(node.pool, gateway.gatewayId), []);
  });
});

describe('gateway-session · challenge and generation', { skip: STORAGE_SKIP }, () => {
  it('captured-start-dies-with-generation — a takeover kills captured envelopes', async () => {
    const { node, gateway } = await servingNode();
    const captured = await signedStart(node, gateway);

    // A new generation takes over.
    const successor = await makeSessionNode(harness!);
    await harness!.pool.query(
      `UPDATE control_plane_lease SET heartbeat_at = now() - make_interval(secs => $1) WHERE id = 1`,
      [harness!.config.leaderLeaseTtlMs / 1_000 + 5],
    );
    await promoteNode(successor);

    const refused = await successor.service.sessionStart(captured, TEST_IP);
    assert.equal(refused.status, 409);
    assert.equal(refused.body['error'], 'stale_generation');

    // A fresh start against the new generation succeeds.
    const fresh = await successor.service.sessionStart(await signedStart(successor, gateway), TEST_IP);
    assert.equal(fresh.status, 200);
  });

  it('challenge-mismatch — a stale challenge is refused within the same generation', async () => {
    const { node, gateway } = await servingNode();
    const before = await currentChallenge(node);
    const captured = await signedStart(node, gateway);

    const rotated = await node.leadership.rotateChallenge();
    assert.equal(rotated.status, 'published');
    const after = await currentChallenge(node);
    assert.equal(after.generation, before.generation, 'rotation stays within the generation');
    assert.notEqual(after.challenge, before.challenge);

    const refused = await node.service.sessionStart(captured, TEST_IP);
    assert.equal(refused.status, 409);
    assert.equal(refused.body['error'], 'stale_challenge');
  });

  it('nonce-replay-within-generation — a resubmitted envelope is refused', async () => {
    const { node, gateway } = await servingNode();
    const envelope = await signedStart(node, gateway);

    assert.equal((await node.service.sessionStart(envelope, TEST_IP)).status, 200);
    const replay = await node.service.sessionStart(envelope, TEST_IP);

    assert.equal(replay.status, 409);
    assert.equal(replay.body['error'], 'nonce_replay');
    assert.ok(
      (await rejectionCount(node.pool, gateway.keyId, 'nonce_replay')) >= 1,
      'the diagnostic aggregates under the resolved key id',
    );
  });

  it('session:nonce-replay-resyncs-with-fresh-envelope', async () => {
    /*
     * The lane-side half of the row above, composed end to end over a real
     * socket. `nonce_replay` is resynchronization, not accusation, and the
     * contract names the innocent cause: duplicate delivery of an envelope
     * whose response was lost. The injected transport performs exactly that —
     * delivery one commits on the server and its response is lost; delivery
     * two is the IDENTICAL envelope, answered 409. What must follow is a
     * discard, a fetched challenge, a fresh nonce, and success inside the
     * lane's bounded backoff budget — never a reuse of the rejected envelope.
     */
    const { node, gateway } = await servingNode();
    const server = await startNodeServer(harness!, node);

    try {
      const sentStarts: Record<string, unknown>[] = [];
      let challengeFetches = 0;
      let duplicated = false;
      const deliverTwice: FetchLike = async (url, init) => {
        const deliver = (): Promise<Response> => fetch(url, init);
        if (init?.method === 'GET' && url.endsWith('/gateway/session-challenge')) {
          challengeFetches += 1;
          return deliver();
        }
        if (init?.method !== 'POST' || !url.endsWith('/gateway/session-start')) return deliver();
        sentStarts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        if (duplicated) return deliver();
        duplicated = true;
        const lost = await deliver();
        await lost.text();
        return deliver();
      };

      const identity: GatewayIdentity = {
        gatewayId: gateway.gatewayId,
        keyId: gateway.keyId,
        pubkeyBase64: gateway.key.pubkeyBase64,
        privateKey: gateway.key.privateKey,
      };
      const lane = new PrimaryLane(new ControlPlaneClient(server.url, deliverTwice), node.clock, identity);

      // The lane's one observable response is the 409, and it adopts nothing.
      const refused = await lane.step();
      assert.equal(refused, 'retain_and_retry');
      assert.equal(
        lane.observations.at(-1)?.key,
        '409 nonce_replay',
        'the sending lane received 409 nonce_replay',
      );
      assert.equal(lane.currentEpoch, null, 'neither the lost 200 nor the 409 became a session');
      assert.equal(lane.laneState, 'SESSION_STARTING');

      // The rejected envelope is discarded and the retry is budget-gated.
      assert.equal(await lane.step(), null, 'the retry waits out its backoff, it is not a hot loop');

      // Exactly the bounded minimum elapses; the retry succeeds.
      node.clock.advance(BACKOFF_MIN_MS);
      assert.equal(await lane.step(), 'retain_and_continue', 'the fresh envelope is accepted');
      assert.equal(lane.laneState, 'HEARTBEATING');
      const epoch = lane.currentEpoch;
      assert.match(String(epoch), /^[0-9a-f]{64}$/);

      // The successful attempt was a FRESH envelope, fetched challenge and all.
      assert.equal(sentStarts.length, 2, 'two session-starts were ever sent: rejected, then fresh');
      const [rejected, fresh] = sentStarts;
      assert.notEqual(rejected!['nonce'], fresh!['nonce'], 'a fresh nonce, never the rejected one');
      assert.equal(
        new Set(sentStarts.map((envelope) => envelope['nonce'])).size,
        2,
        'the rejected envelope was never re-sent',
      );
      assert.equal(challengeFetches, 2, 'the lane fetched the challenge again before rebuilding');
      const current = await currentChallenge(node);
      assert.equal(fresh!['challenge'], current.challenge, 'built against the current lease-row challenge');
      assert.equal(fresh!['generation'], current.generation);

      // The session is real, and it is the fresh one — the cursor the lost
      // delivery created has been replaced, not adopted.
      assert.equal(node.session.cursorFor(gateway.gatewayId)?.epoch, epoch);
      assert.equal(await lane.step(), 'retain_and_continue', 'and it beats');
      assert.equal(lane.lastSequence, 1);

      // The refusal was aggregated under the RESOLVED key id, for `doctor`.
      assert.ok(
        (await rejectionCount(node.pool, gateway.keyId, 'nonce_replay')) >= 1,
        'the diagnostic aggregates under the resolved key id',
      );
    } finally {
      await server.close();
    }
  });
});

describe(
  'gateway-session · session:far-future-envelope-dead-after-challenge-rotation',
  { skip: STORAGE_SKIP },
  () => {
    it('never becomes acceptable once the challenge rotates, generation unchanged', async () => {
      const { node, gateway } = await servingNode();
      const awaiting = await awaitingGateway(node);

      // Stamped beyond the acceptance window now, inside it after time passes.
      const farFuture = node.clock.wallNow() + 180_000;
      const captured = await signedStart(node, awaiting, { timestampMs: farFuture });

      const first = await node.service.sessionStart(captured, TEST_IP);
      assert.equal(first.status, 409);
      assert.equal(first.body['error'], 'stale_timestamp', 'refused, and its nonce is recorded');

      // Time passes until the envelope would be inside its acceptance window,
      // with the leader renewing and rotating throughout, as it really would.
      const generationBefore = (await currentChallenge(node)).generation;
      const challengeBefore = (await currentChallenge(node)).challenge;
      await advanceWithRenewals(node, 200_000);

      assert.ok(
        timestampWithinWindow(farFuture, node.clock.wallNow(), node.config.gatewayTimestampWindowMs),
        'the captured envelope is now inside its acceptance window',
      );
      assert.notEqual((await currentChallenge(node)).challenge, challengeBefore, 'the challenge rotated');
      assert.equal(
        (await currentChallenge(node)).generation,
        generationBefore,
        'and did so within the SAME generation',
      );

      const replayed = await node.service.sessionStart(captured, TEST_IP);
      assert.equal(replayed.status, 409);
      assert.equal(
        replayed.body['error'],
        'stale_challenge',
        'the envelope is permanently stale, with or without any nonce record',
      );

      // And it never mints an epoch even after the identity is confirmed.
      await node.store.confirmEnrollment(awaiting.gatewayId, awaiting.keyId, null);
      const afterConfirm = await node.service.sessionStart(captured, TEST_IP);
      assert.equal(afterConfirm.status, 409);
      assert.equal(afterConfirm.body['error'], 'stale_challenge');
      assert.equal(node.session.cursorFor(awaiting.gatewayId), null, 'no cursor was ever created');
      void gateway;
    });
  },
);

describe(
  'gateway-session · session:awaiting-probe-replay-after-confirm-refused',
  { skip: STORAGE_SKIP },
  () => {
    it('records the probe nonce before the 403 returns, so the replay dies', async () => {
      // Deliberately no incumbent: this case ends by CONFIRMING the probe's
      // identity, and the at-most-one-enrolled index would refuse that if a
      // fixture gateway were already enrolled.
      const node = await makeSessionNode(harness!);
      await promoteNode(node);
      const awaiting = await awaitingGateway(node);
      const probe = await signedStart(node, awaiting);

      const verdict = await node.service.sessionStart(probe, TEST_IP);
      assert.equal(verdict.status, 403);
      assert.equal(verdict.body['error'], 'awaiting_approval');
      assert.equal(
        node.session.hasNonce(probe['nonce'] as string),
        true,
        'the nonce was recorded before the verdict returned',
      );

      // The Founder confirms. The captured probe is replayed.
      const confirmed = await node.store.confirmEnrollment(awaiting.gatewayId, awaiting.keyId, null);
      assert.equal(confirmed.ok, true);

      const replayed = await node.service.sessionStart(probe, TEST_IP);
      assert.equal(replayed.status, 409);
      assert.equal(replayed.body['error'], 'nonce_replay');
      assert.equal(node.session.cursorFor(awaiting.gatewayId), null, 'no session was minted');
    });
  },
);

describe('gateway-session · nonce capacity is an absolute global ceiling', { skip: STORAGE_SKIP }, () => {
  const SMALL = { configOverrides: { sessionNonceCapacity: 4 } } as const;

  it('session:nonce-capacity-preserves-replay-protection — refuses without recording', async () => {
    const { node, gateway } = await servingNode(SMALL);

    const envelopes = [];
    for (let i = 0; i < 4; i += 1) envelopes.push(await signedStart(node, gateway));
    for (const envelope of envelopes) {
      assert.equal((await node.service.sessionStart(envelope, TEST_IP)).status, 200);
    }
    assert.equal(node.session.nonceCount(), 4, 'the epoch is saturated');

    const overflow = await signedStart(node, gateway);
    const refused = await node.service.sessionStart(overflow, TEST_IP);
    assert.equal(refused.status, 503);
    assert.equal(refused.body['error'], 'nonce_capacity');
    assert.equal(node.session.nonceCount(), 4, 'the refusal recorded nothing');
    assert.equal(
      node.session.hasNonce(overflow['nonce'] as string),
      false,
      'and specifically not this nonce',
    );

    // The earlier captured envelope is still non-replayable: the store never
    // freed intra-epoch space, so nothing it holds was evicted.
    const replay = await node.service.sessionStart(envelopes[0]!, TEST_IP);
    assert.equal(replay.body['error'], 'nonce_replay');

    assert.ok(
      (await rejectionCount(node.pool, gateway.keyId, 'nonce_capacity')) >= 1,
      'the capacity refusal aggregates under the RESOLVED key id',
    );
  });

  it('session:distributed-source-flood-never-exceeds-capacity', async () => {
    const { node, gateway } = await servingNode(SMALL);

    let refusals = 0;
    for (let i = 0; i < 40; i += 1) {
      // A different source address every time. The ceiling is not per-source.
      const sourceIp = `198.51.100.${i % 250}`;
      const result = await node.service.sessionStart(await signedStart(node, gateway), sourceIp);
      if (result.status === 503) refusals += 1;
    }

    assert.ok(refusals > 0, 'the flood was refused');
    assert.equal(node.session.nonceCount(), 4, 'source cardinality cannot raise the ceiling');
    assert.ok(node.session.nonceCount() <= node.config.sessionNonceCapacity);
  });

  it('session:revoked-key-flood-never-exceeds-capacity', async () => {
    const { node, gateway } = await servingNode(SMALL);
    // Saturate with valid traffic first, then revoke and keep signing.
    for (let i = 0; i < 4; i += 1) {
      await node.service.sessionStart(await signedStart(node, gateway), TEST_IP);
    }
    assert.equal((await node.store.revokeGateway(gateway.gatewayId, null)).ok, true);

    for (let i = 0; i < 30; i += 1) {
      const result = await node.service.sessionStart(await signedStart(node, gateway), TEST_IP);
      assert.equal(result.status, 503, 'a cryptographically valid revoked key still cannot exceed it');
    }
    assert.equal(node.session.nonceCount(), 4);

    // Saturation denies session-starts only until a successful rotation.
    assert.equal((await node.leadership.rotateChallenge()).status, 'published');
    assert.equal(node.session.nonceCount(), 0, 'the epoch was discarded wholesale');
  });

  it('session:successful-rotation-recovers-from-saturation', async () => {
    const { node, gateway } = await servingNode(SMALL);
    for (let i = 0; i < 4; i += 1) {
      await node.service.sessionStart(await signedStart(node, gateway), TEST_IP);
    }
    assert.equal(
      (await node.service.sessionStart(await signedStart(node, gateway), TEST_IP)).status,
      503,
    );

    assert.equal((await node.leadership.rotateChallenge()).status, 'published');

    const admitted = await node.service.sessionStart(await signedStart(node, gateway), TEST_IP);
    assert.equal(admitted.status, 200, 'admission resumes immediately after the epoch swap');
  });
});

describe('gateway-session · challenge freshness fails closed', { skip: STORAGE_SKIP }, () => {
  it('session:overdue-challenge-fails-closed', async () => {
    const { node, gateway } = await servingNode();

    // Backdate publication past the derived deadline (rotation + 2 ticks).
    await harness!.pool.query(
      `UPDATE control_plane_lease
          SET challenge_published_at = now() - make_interval(secs => $1) WHERE id = 1`,
      [(node.config.challengeRotationMs + 2 * node.config.leaderHeartbeatMs) / 1_000 + 10],
    );

    const refused = await node.service.sessionStart(await signedStart(node, gateway), TEST_IP);
    assert.equal(refused.status, 503);
    assert.equal(
      refused.body['error'],
      'challenge_overdue',
      'a delayed timer cannot extend an epoch into acceptance',
    );

    // Only a SUCCESSFUL rotation clears it.
    assert.equal((await node.leadership.rotateChallenge()).status, 'published');
    assert.equal((await node.service.sessionStart(await signedStart(node, gateway), TEST_IP)).status, 200);
  });

  it('session:rotation-failure-preserves-old-epoch-and-cap', async () => {
    /*
     * A rotation that fails at COMMIT. This is the honest way to reach the
     * failure: the exactly-one-row requirement on the UPDATE is unreachable in
     * practice, because the fence has already compared the same owner and
     * generation against the row it holds locked — so a predicate mismatch
     * refuses at the fence and never reaches the UPDATE. Belt and braces, and
     * the braces are what actually hold.
     */
    let fail = true;
    const node = await makeSessionNode(harness!, {
      hooks: {
        rotation: {
          commitFault: () => {
            if (fail) throw new Error('injected rotation commit failure');
          },
        },
      },
    });
    await promoteNode(node);
    const gateway = await enrollGateway(node);

    const before = await currentChallenge(node);
    await openSession(node, gateway);
    const noncesBefore = node.session.nonceCount();
    assert.equal(noncesBefore, 1, 'the epoch holds the session-start nonce');

    const rotation = await node.leadership.rotateChallenge();
    assert.notEqual(rotation.status, 'published', 'the rotation did not happen');

    const after = await currentChallenge(node);
    assert.equal(after.challenge, before.challenge, 'the old challenge keeps serving');
    assert.equal(node.session.nonceCount(), noncesBefore, 'and its nonce store is not retired');
    assert.deepEqual(node.session.activeEpoch(), {
      generation: before.generation,
      challenge: before.challenge,
    });

    // The cap still applies to the un-retired epoch: a replay is still refused.
    fail = false;
    assert.equal((await node.leadership.rotateChallenge()).status, 'published', 'a retry rotates');
    assert.equal(node.session.nonceCount(), 0, 'and only then is the epoch discarded');
  });
});

describe('gateway-session · rotation is fenced and generation-bound', { skip: STORAGE_SKIP }, () => {
  it('rotation:stale-same-owner-task-cannot-mutate-reacquired-generation', async () => {
    const node = await makeSessionNode(harness!);
    await promoteNode(node);
    const generationN = node.leadership.currentGeneration;

    /*
     * One process owner id across a demotion and two reacquisitions. The owner
     * predicate alone would match; only the generation predicate refuses.
     */
    node.leadership.demote('test');
    await node.leadership.tick();
    await node.leadership.phase2Run;
    await node.leadership.attemptAcquisition();

    node.leadership.demote('test');
    await node.leadership.tick();
    await node.leadership.phase2Run;
    await node.leadership.attemptAcquisition();

    const generationNPlus2 = node.leadership.currentGeneration;
    assert.equal(generationNPlus2, generationN + 2);

    const challengeBefore = (await currentChallenge(node)).challenge;
    const epochBefore = node.session.activeEpoch();

    // A rotation task that captured generation N executes now.
    const { rows } = await harness!.pool.query<{ count: string }>(
      `SELECT count(*) FROM control_plane_lease
        WHERE id = 1 AND owner_id = $1 AND generation = $2`,
      [node.leadership.ownerId, generationN],
    );
    assert.equal(rows[0]?.count, '0', 'the stale generation matches nothing');

    const staleUpdate = await harness!.pool.query(
      `UPDATE control_plane_lease SET challenge = $1, challenge_published_at = now()
        WHERE id = 1 AND owner_id = $2 AND generation = $3`,
      [hex32(), node.leadership.ownerId, generationN],
    );
    assert.equal(staleUpdate.rowCount, 0, 'the stale task writes zero rows');
    assert.equal((await currentChallenge(node)).challenge, challengeBefore, 'nothing rotated');
    assert.deepEqual(node.session.activeEpoch(), epochBefore, 'and no epoch was swapped');
  });

  it('rotation:generation-mismatch-performs-zero-write-and-zero-swap', async () => {
    const node = await makeSessionNode(harness!);
    await promoteNode(node);
    const before = await currentChallenge(node);
    const epochBefore = node.session.activeEpoch();

    await harness!.pool.query('UPDATE control_plane_lease SET generation = generation + 5 WHERE id = 1');

    const rotation = await node.leadership.rotateChallenge();
    assert.notEqual(rotation.status, 'published');
    assert.equal((await currentChallenge(node)).challenge, before.challenge);
    assert.deepEqual(node.session.activeEpoch(), epochBefore);
  });

  it('rotation:commit-failure-preserves-old-database-and-memory-epoch', async () => {
    let fail = true;
    const node = await makeSessionNode(harness!, {
      hooks: {
        rotation: {
          commitFault: () => {
            if (fail) throw new Error('injected commit failure');
          },
        },
      },
    });
    await promoteNode(node);
    const before = await currentChallenge(node);
    const epochBefore = node.session.activeEpoch();

    const rotation = await node.leadership.rotateChallenge();
    assert.equal(rotation.status, 'commit_failed');
    assert.equal((await currentChallenge(node)).challenge, before.challenge, 'the lease row is untouched');
    assert.deepEqual(node.session.activeEpoch(), epochBefore, 'the active nonce epoch is untouched');

    fail = false;
    assert.equal((await node.leadership.rotateChallenge()).status, 'published', 'and a retry works');
  });

  it('rotation:demotion-before-commit-performs-no-swap', async () => {
    let node!: SessionNode;
    node = await makeSessionNode(harness!, {
      hooks: {
        rotation: {
          beforePreCommitRecheck: () => {
            node.leadership.demote('renewal_failed');
          },
        },
      },
    });
    await promoteNode(node);
    const before = await currentChallenge(node);
    const epochBefore = node.session.activeEpoch();

    const rotation = await node.leadership.rotateChallenge();

    assert.equal(rotation.status, 'not_leader');
    assert.equal(rotation.status === 'not_leader' && rotation.at, 'pre_commit');
    assert.equal((await currentChallenge(node)).challenge, before.challenge, 'zero durable writes');
    assert.deepEqual(node.session.activeEpoch(), epochBefore, 'no epoch swap');
  });

  it('rotation:demotion-after-commit-before-swap-performs-no-swap', async () => {
    let node!: SessionNode;
    node = await makeSessionNode(harness!, {
      hooks: {
        rotation: {
          afterCommit: () => {
            node.leadership.demote('renewal_failed');
          },
        },
      },
    });
    await promoteNode(node);
    const before = await currentChallenge(node);
    const epochBefore = node.session.activeEpoch();

    const rotation = await node.leadership.rotateChallenge();

    assert.equal(rotation.status, 'not_leader');
    assert.equal(rotation.status === 'not_leader' && rotation.at, 'post_commit');
    assert.notEqual(
      (await currentChallenge(node)).challenge,
      before.challenge,
      'the legitimately fenced durable commit stands',
    );
    assert.deepEqual(node.session.activeEpoch(), epochBefore, 'but NO epoch swap is performed');
  });
});

describe('gateway-session · the commit/publication boundary', { skip: STORAGE_SKIP }, () => {
  it('session:concurrent-identical-starts-crossing-commit-publish-boundary', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pauseArmed = false;
    let paused!: () => void;
    const reached = new Promise<void>((resolve) => {
      paused = resolve;
    });

    const node = await makeSessionNode(harness!, {
      hooks: {
        sessionStart: {
          beforePublish: async () => {
            if (!pauseArmed) return;
            pauseArmed = false;
            paused();
            await held;
          },
        },
      },
    });
    await promoteNode(node);
    const gateway = await enrollGateway(node);
    const envelope = await signedStart(node, gateway);

    // Request A is held between its COMMIT and its publication.
    pauseArmed = true;
    const a = node.service.sessionStart(envelope, TEST_IP);
    await reached;

    /*
     * Request B is the identical envelope. Without L0 it would take the fence
     * in A's gap, see the nonce absent, and accept a duplicate. With L0 it
     * blocks until A has published, and then sees the recorded nonce.
     */
    const b = node.service.sessionStart(envelope, TEST_IP);
    const bDone = track(b);
    await settleMicrotasks();
    assert.equal(bDone(), false, 'B is blocked on L0, not racing A');

    release();
    const [resultA, resultB] = await Promise.all([a, b]);

    const statuses = [resultA.status, resultB.status].sort();
    assert.deepEqual(statuses, [200, 409], 'exactly one succeeds');
    const refused = resultA.status === 409 ? resultA : resultB;
    assert.equal(refused.body['error'], 'nonce_replay');
    assert.equal(node.session.nonceCount(), 1, 'only one epoch state is authoritative');
  });

  it('session:rotation-cannot-resurrect-retired-nonce-epoch', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let armed = false;
    let paused!: () => void;
    const reached = new Promise<void>((resolve) => {
      paused = resolve;
    });

    const node = await makeSessionNode(harness!, {
      hooks: {
        sessionStart: {
          beforePublish: async () => {
            if (!armed) return;
            armed = false;
            paused();
            await held;
          },
        },
      },
      configOverrides: { sessionNonceCapacity: 4 },
    });
    await promoteNode(node);
    const gateway = await enrollGateway(node);

    armed = true;
    const inflight = node.service.sessionStart(await signedStart(node, gateway), TEST_IP);
    await reached;

    /*
     * Rotation cannot start while the paused request holds L0 — that is the
     * point of L0 — so it is started and observed to be waiting, then allowed
     * to proceed once the old-epoch request publishes.
     */
    const rotation = node.leadership.rotateChallenge();
    const rotationDone = track(rotation);
    await settleMicrotasks();
    assert.equal(rotationDone(), false, 'rotation waits behind L0');

    release();
    assert.equal((await inflight).status, 200);
    assert.equal((await rotation).status, 'published');

    // The retired epoch's state did not survive the swap.
    assert.equal(node.session.nonceCount(), 0, 'the new epoch starts empty');
    assert.ok(
      node.session.nonceCount() <= node.config.sessionNonceCapacity,
      'active nonce cardinality never exceeds the ceiling',
    );
  });

  it('session:session-start-commit-failure-does-not-admit-nonce', async () => {
    let fail = true;
    const node = await makeSessionNode(harness!, {
      hooks: {
        sessionStart: {
          commitFault: () => {
            if (fail) throw new Error('injected commit failure');
          },
        },
      },
    });
    await promoteNode(node);
    const gateway = await enrollGateway(node);
    const envelope = await signedStart(node, gateway);

    const failed = await node.service.sessionStart(envelope, TEST_IP);
    assert.equal(failed.status, 500);
    assert.equal(node.session.nonceCount(), 0, 'the nonce store is unchanged');
    assert.equal(node.session.cursorFor(gateway.gatewayId), null, 'no cursor was published');

    // The same envelope replays cleanly, as a first submission.
    fail = false;
    const retried = await node.service.sessionStart(envelope, TEST_IP);
    assert.equal(retried.status, 200, 'processed as a first submission');
  });
});

describe(
  'gateway-session · session:same-leader-session-start-preserves-fresh-liveness',
  { skip: STORAGE_SKIP },
  () => {
    it('a restart on an online gateway replaces only the cursor', async () => {
      const { node, gateway } = await servingNode();
      const epoch = await openSession(node, gateway);

      // One accepted beat brings it online.
      const { signedBeat } = await import('./gateway-session-helpers.js');
      assert.equal((await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP)).status, 200);
      const afterFirstBeat = await availabilityRows(node.pool, gateway.gatewayId);
      assert.deepEqual(afterFirstBeat.map((row) => row.transition), ['went_online']);
      const liveness = node.session.livenessFor(gateway.gatewayId);
      assert.ok(liveness !== null);

      // The daemon restarts its session on the SAME leader.
      const newEpoch = await openSession(node, gateway);
      assert.notEqual(newEpoch, epoch);

      assert.deepEqual(
        node.session.livenessFor(gateway.gatewayId),
        liveness,
        'liveness is preserved, not reset',
      );
      assert.deepEqual(
        (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
        ['went_online'],
        'no availability events are written',
      );

      // And the next steady beat still writes nothing.
      assert.equal(
        (await node.service.heartbeat(signedBeat(node, gateway, newEpoch, 1), TEST_IP)).status,
        200,
      );
      assert.deepEqual(
        (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
        ['went_online'],
      );
    });
  },
);

describe('gateway-session · the signature-resolution ladder', { skip: STORAGE_SKIP }, () => {
  it('refuses an unknown key without ever verifying a signature', async () => {
    const { node, gateway } = await servingNode();
    const impostor = generateTestKeypair();
    const envelope = await signedStart(node, { ...gateway, keyId: impostor.keyId, key: impostor });

    const result = await node.service.sessionStart(envelope, TEST_IP);
    assert.equal(result.status, 401);
    assert.equal(result.body['error'], 'unknown_key');
    assert.equal(
      await rejectionCount(node.pool, 'unknown', 'unknown_key'),
      1,
      'counted under the unresolved literal, never under a presented identifier',
    );
  });

  it('refuses a bad signature under the resolved key id', async () => {
    const { node, gateway } = await servingNode();
    const other = generateTestKeypair();
    const forged = await signedStart(node, gateway, { signWith: other });

    const result = await node.service.sessionStart(forged, TEST_IP);
    assert.equal(result.status, 401);
    assert.equal(result.body['error'], 'bad_signature');
    assert.ok((await rejectionCount(node.pool, gateway.keyId, 'bad_signature')) >= 1);
  });

  it('returns the state ladder verdict for every non-enrolled state', async () => {
    const node = await makeSessionNode(harness!);
    await promoteNode(node);

    const awaiting = await awaitingGateway(node);
    assert.equal((await node.service.sessionStart(await signedStart(node, awaiting), TEST_IP)).body['error'], 'awaiting_approval');

    const denied = await awaitingGateway(node);
    await node.store.denyEnrollment(denied.gatewayId, null);
    assert.equal((await node.service.sessionStart(await signedStart(node, denied), TEST_IP)).body['error'], 'denied');

    const revoked = await enrollGateway(node);
    await node.store.revokeGateway(revoked.gatewayId, null);
    assert.equal((await node.service.sessionStart(await signedStart(node, revoked), TEST_IP)).body['error'], 'revoked');
  });

  it('refuses everything while the clock is unreliable, deriving nothing', async () => {
    const { node, gateway } = await servingNode();
    node.clock.set({ monotonic: node.clock.monotonicNow() - 10 });
    node.gate.sample();
    assert.equal(node.gate.reliable, false);

    const result = await node.service.sessionStart(await signedStart(node, gateway), TEST_IP);
    assert.equal(result.status, 503);
    assert.equal(result.body['error'], 'clock_unreliable');
    assert.equal(node.session.nonceCount(), 0, 'no state derived');
    assert.ok(
      (await rejectionCount(node.pool, 'unknown', 'clock_unreliable')) >= 1,
      'recorded under the unknown identity, since resolution has not happened yet',
    );
    void waitFor;
  });
});

/*
 * Rev 4.7 correction B2. Every time judgement in a fenced handler must be made
 * from a clock read INSIDE the fence. Reading "now" before runFenced means a
 * request that waited on the fence — L0 contention, an advisory-lock queue, a
 * slow validation — is judged against the moment it arrived rather than the
 * moment it executed. The three cases below hold the request at afterFence
 * (the fence is verified; the body has not run) and let the clock move, which
 * is the deterministic stand-in for that wait. Each asserts the verdict the
 * post-fence "now" demands, and each fails against a pre-fence sample because
 * the pre-fence sample is staler than the truth.
 */
describe('gateway-session · time is judged inside the fence', { skip: STORAGE_SKIP }, () => {
  it('session:fence-wait-advances-past-challenge-deadline', async () => {
    const advanceMs = challengeFreshnessDeadlineMs(harness!.config) + 5_000;
    const { node, gateway } = await servingNode({
      hooks: {
        sessionStart: {
          afterFence: () => {
            node.clock.advance(advanceMs);
          },
        },
      },
    });

    const refused = await node.service.sessionStart(await signedStart(node, gateway), TEST_IP);

    assert.equal(refused.status, 503, 'the deadline is judged at fence time, not arrival time');
    assert.equal(refused.body['error'], 'challenge_overdue');
    assert.equal(node.session.cursorFor(gateway.gatewayId), null, 'nothing was admitted');
  });

  it('session:fence-wait-advances-past-timestamp-window', async () => {
    const { node, gateway } = await servingNode({
      configOverrides: { gatewayTimestampWindowMs: 5_000 },
      hooks: {
        sessionStart: {
          afterFence: () => {
            node.clock.advance(6_000);
          },
        },
      },
    });

    // Signed BEFORE the wait, as any arriving envelope is.
    const refused = await node.service.sessionStart(await signedStart(node, gateway), TEST_IP);

    assert.equal(refused.status, 409, 'the window is judged at fence time, not arrival time');
    assert.equal(refused.body['error'], 'stale_timestamp');
    assert.equal(node.session.cursorFor(gateway.gatewayId), null, 'the burn happened, the session did not');
  });

  it('heartbeat:fence-wait-staleness-judged-at-fence-time', async () => {
    let beats = 0;
    const { node, gateway } = await servingNode({
      configOverrides: { gatewayStalenessMs: 5_000 },
      hooks: {
        heartbeat: {
          // Only the JUDGED beat waits: an advance on the first beat would move
          // its liveness stamp too, and identically in both worlds.
          afterFence: () => {
            beats += 1;
            if (beats === 2) node.clock.advance(6_000);
          },
        },
      },
    });

    const epoch = await openSession(node, gateway);
    assert.equal(
      (await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP)).status,
      200,
    );

    // Park the prior liveness just UNDER the threshold — at arrival time this
    // beat looks steady. The 6 s it then spends waiting at the fence is what
    // pushes the elapsed time over 5 s, and only a fence-time sample sees that.
    node.clock.advance(4_000);

    const beat = await node.service.heartbeat(signedBeat(node, gateway, epoch, 2), TEST_IP);
    assert.equal(beat.status, 200);
    assert.deepEqual(
      (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
      ['went_online', 'went_offline', 'went_online'],
      'a wait longer than the staleness threshold is an outage, not a steady beat',
    );
  });
});
