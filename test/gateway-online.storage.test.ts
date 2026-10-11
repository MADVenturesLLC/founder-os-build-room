/**
 * §10 — `gatewayOnline` is derived at append time, and it gates dispatch.
 *
 * These cases go all the way through: a room, a real ledger transition, and the
 * guard that actually reads the overlay. `task.dispatched.planner` fires T2
 * under guard G2, which requires `gatewayOnline`. So "the derivation says
 * offline" and "the dispatch is refused" are the same assertion here, which is
 * the only way to show the overlay does the job it exists for rather than
 * merely holding the right value.
 */

import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '../packages/control-plane/src/db.js';
import { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import { snapshot } from '../packages/ledger/src/index.js';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import {
  TEST_IP,
  availabilityRows,
  enrollGateway,
  makeSessionNode,
  openSession,
  promoteNode,
  signedBeat,
  type EnrolledGateway,
  type SessionNode,
} from './gateway-session-helpers.js';
import { makeEvent } from './helpers.js';
import { settleAllNodes } from './gateway-leadership-helpers.js';

let harness: GatewayHarness | undefined;

before(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('online');
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
    `UPDATE gateway_current_state SET state = 'revoked', is_currently_enrolled = false, enrollment_slot = NULL
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

/**
 * A room parked at SCOPED, one step away from the dispatch that reads the
 * overlay. The caller-asserted `gatewayOnline: true` in the fixture facts is
 * exactly what the derivation must overwrite.
 */
async function scopedRoom(node: SessionNode): Promise<string> {
  const roomId = randomUUID();
  await node.rooms.createRoom(roomId);
  const scoped = await node.rooms.append(roomId, makeEvent('scope.captured'));
  assert.equal(scoped.ok, true, 'the room must reach SCOPED');
  return roomId;
}

/** Attempt the dispatch. Returns whether the guard let it through. */
async function tryDispatch(node: SessionNode, roomId: string): Promise<{
  accepted: boolean;
  reason: string | null;
  notLeader: boolean;
}> {
  const result = await node.rooms.append(roomId, makeEvent('task.dispatched.planner'));
  if (result.ok) return { accepted: true, reason: null, notLeader: false };
  if (result.outcome === 'not_leader') return { accepted: false, reason: null, notLeader: true };
  return { accepted: false, reason: result.reason, notLeader: false };
}

async function servingNode(): Promise<{ node: SessionNode; gateway: EnrolledGateway }> {
  const node = await makeSessionNode(harness!);
  await promoteNode(node);
  return { node, gateway: await enrollGateway(node) };
}

describe('gateway-online · append-after-start-before-beat-offline', { skip: STORAGE_SKIP }, () => {
  it('derives offline after a session-start and before any heartbeat', async () => {
    const { node, gateway } = await servingNode();
    await openSession(node, gateway);

    const roomId = await scopedRoom(node);
    const dispatch = await tryDispatch(node, roomId);

    assert.equal(dispatch.accepted, false, 'a session is not evidence the machine is there');
    assert.match(String(dispatch.reason), /gateway offline/);
    assert.deepEqual(await availabilityRows(node.pool, gateway.gatewayId), []);
  });

  it('overwrites the caller-asserted overlay rather than trusting it', async () => {
    const { node } = await servingNode();
    const roomId = await scopedRoom(node);

    // The fixture facts assert `gatewayOnline: true`. Nothing is online.
    const event = makeEvent('task.dispatched.planner');
    assert.equal(event.facts?.gatewayOnline, true, 'the fixture really does assert it');

    const result = await node.rooms.append(roomId, event);
    assert.equal(result.ok, false, 'the assertion is overwritten by the derivation');
  });
});

describe('gateway-online · beat-then-append-online', { skip: STORAGE_SKIP }, () => {
  it('derives online once a heartbeat has been accepted', async () => {
    const { node, gateway } = await servingNode();
    const epoch = await openSession(node, gateway);
    assert.equal((await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP)).status, 200);

    const roomId = await scopedRoom(node);
    const dispatch = await tryDispatch(node, roomId);

    assert.equal(dispatch.accepted, true, 'an accepted beat is what makes dispatch possible');
    assert.deepEqual(
      (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
      ['went_online'],
    );
  });
});

describe('gateway-online · no-beat-offline-without-persisted-row', { skip: STORAGE_SKIP }, () => {
  it('derives offline with no session and no availability history at all', async () => {
    const { node, gateway } = await servingNode();
    const roomId = await scopedRoom(node);

    assert.equal((await tryDispatch(node, roomId)).accepted, false);
    assert.deepEqual(await availabilityRows(node.pool, gateway.gatewayId), [], 'offline by absence');
  });
});

describe('gateway-online · persisted-event-is-the-derived-event', { skip: STORAGE_SKIP }, () => {
  /*
   * Rev 4.7 correction B1. The reducer judges the server-derived
   * `gatewayOnline`; the row that lands in the append-only log must be that
   * same derived event. Persisting the caller's original would commit a
   * transition that replay refuses — the write-time and read-time verdicts
   * disagree, and a fresh process cannot even load the room.
   */
  it('commits the derived value and replays to the identical state', async () => {
    const { node, gateway } = await servingNode();
    const epoch = await openSession(node, gateway);
    assert.equal((await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP)).status, 200);

    const roomId = await scopedRoom(node);

    // The OPPOSITE caller value: an accepted beat makes the derivation online,
    // and the caller asserts offline.
    const base = makeEvent('task.dispatched.planner');
    const opposite = { ...base, facts: { ...base.facts, gatewayOnline: false } };
    assert.equal(opposite.facts?.gatewayOnline, false, 'the caller really asserts the opposite value');

    const appended = await node.rooms.append(roomId, opposite);
    assert.equal(appended.ok, true, 'the reducer judged the DERIVED value, which is online');
    assert.equal(appended.outcome, 'transition');

    // The persisted payload must carry the derived value, not the caller's.
    const { rows } = await node.pool.query<{ derived: string | null }>(
      `SELECT payload->'facts'->>'gatewayOnline' AS derived FROM build_room_events WHERE room_id = $1`,
      [roomId],
    );
    assert.equal(rows[0]?.derived, 'true', 'the persisted event is the event the reducer accepted');

    // A fresh process — new pool, no cached state, only the durable log —
    // replays the room to the identical state.
    const freshPool = createPool(harness!.config);
    try {
      const fresh = new PostgresLedgerStore(freshPool);
      const reloaded = await fresh.loadRoom(roomId);
      assert.equal(reloaded.exists, true);
      assert.equal(reloaded.logLength, 2);
      assert.deepEqual(snapshot(reloaded.state), snapshot(appended.state));
    } finally {
      await freshPool.end();
    }
  });
});

describe('gateway-online · threshold-before-sweeper', { skip: STORAGE_SKIP }, () => {
  it('derives offline the moment liveness is stale, before any went_offline row exists', async () => {
    const { node, gateway } = await servingNode();
    const epoch = await openSession(node, gateway);
    await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);

    const early = await scopedRoom(node);
    assert.equal((await tryDispatch(node, early)).accepted, true, 'online while fresh');

    // Past the threshold, with the sweeper deliberately not run.
    await advanceWithRenewals(node, node.config.gatewayStalenessMs + 5_000);

    assert.deepEqual(
      (await availabilityRows(node.pool, gateway.gatewayId)).map((row) => row.transition),
      ['went_online'],
      'no went_offline row has been written yet',
    );

    const late = await scopedRoom(node);
    const dispatch = await tryDispatch(node, late);
    assert.equal(dispatch.accepted, false, 'staleness is judged at derivation time, not from the log');
    assert.match(String(dispatch.reason), /gateway offline/);
  });
});

describe('gateway-online · revoke-then-append', { skip: STORAGE_SKIP }, () => {
  it('derives offline immediately after a revoke, without the machine cooperating', async () => {
    const { node, gateway } = await servingNode();
    const epoch = await openSession(node, gateway);
    await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);

    const before = await scopedRoom(node);
    assert.equal((await tryDispatch(node, before)).accepted, true);

    assert.equal((await node.store.revokeGateway(gateway.gatewayId, null)).ok, true);

    const after = await scopedRoom(node);
    const dispatch = await tryDispatch(node, after);
    assert.equal(dispatch.accepted, false, 'no gateway is enrolled, so nothing is online');
    assert.match(String(dispatch.reason), /gateway offline/);
  });
});

describe('gateway-online · follower-append-refused-503', { skip: STORAGE_SKIP }, () => {
  it('never evaluates an append on a follower', async () => {
    const leader = await makeSessionNode(harness!);
    await promoteNode(leader);
    const gateway = await enrollGateway(leader);
    const epoch = await openSession(leader, gateway);
    await leader.service.heartbeat(signedBeat(leader, gateway, epoch, 1), TEST_IP);

    const follower = await makeSessionNode(harness!);
    await follower.leadership.attemptAcquisition();
    assert.equal(follower.leadership.isLeader, false, 'the lease is held by the leader');
    assert.equal(follower.leadership.canServe(), false);

    const roomId = await scopedRoom(leader);
    const onFollower = await tryDispatch(follower, roomId);

    assert.equal(onFollower.notLeader, true, 'the follower refuses rather than deriving anything');
    assert.equal(onFollower.accepted, false);

    // And the leader still accepts it.
    assert.equal((await tryDispatch(leader, roomId)).accepted, true);
  });
});

describe(
  'gateway-online · takeover-restart-offline-until-first-accepted-beat',
  { skip: STORAGE_SKIP },
  () => {
    it("derives offline through a fresh session and clears at the takeover's first beat", async () => {
      const first = await makeSessionNode(harness!);
      await promoteNode(first);
      const gateway = await enrollGateway(first);
      const epoch = await openSession(first, gateway);
      await first.service.heartbeat(signedBeat(first, gateway, epoch, 1), TEST_IP);

      const online = await scopedRoom(first);
      assert.equal((await tryDispatch(first, online)).accepted, true);

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

      const afterTakeover = await scopedRoom(successor);
      assert.equal((await tryDispatch(successor, afterTakeover)).accepted, false, 'the map is empty');

      // A fresh session on the new leader still derives offline.
      const newEpoch = await openSession(successor, gateway);
      const afterSession = await scopedRoom(successor);
      assert.equal((await tryDispatch(successor, afterSession)).accepted, false);

      // Only the first accepted beat clears it.
      await successor.service.heartbeat(signedBeat(successor, gateway, newEpoch, 1), TEST_IP);
      const afterBeat = await scopedRoom(successor);
      assert.equal((await tryDispatch(successor, afterBeat)).accepted, true);
    });
  },
);

describe('gateway-online · aged availability history', { skip: STORAGE_SKIP }, () => {
  it('promotion:aged-history-derives-offline — no marker is left behind', async () => {
    const first = await makeSessionNode(harness!);
    await promoteNode(first);
    const gateway = await enrollGateway(first);
    const epoch = await openSession(first, gateway);
    await first.service.heartbeat(signedBeat(first, gateway, epoch, 1), TEST_IP);

    // The ninety-day sweep deletes ALL rows: no indefinite latest-row exception.
    await harness!.pool.query('DELETE FROM gateway_availability_events WHERE gateway_id = $1', [
      gateway.gatewayId,
    ]);

    await harness!.pool.query(
      'UPDATE control_plane_lease SET heartbeat_at = now() - make_interval(secs => $1) WHERE id = 1',
      [harness!.config.leaderLeaseTtlMs / 1_000 + 5],
    );
    const successor = await makeSessionNode(harness!);
    await promoteNode(successor);

    assert.deepEqual(
      await availabilityRows(successor.pool, gateway.gatewayId),
      [],
      'offline by absence needs no write at all',
    );
    const roomId = await scopedRoom(successor);
    assert.equal((await tryDispatch(successor, roomId)).accepted, false);
  });

  it('heartbeat-after-aged:creates-went-online', async () => {
    const node = await makeSessionNode(harness!);
    await promoteNode(node);
    const gateway = await enrollGateway(node);
    const epoch = await openSession(node, gateway);
    await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);
    await harness!.pool.query('DELETE FROM gateway_availability_events WHERE gateway_id = $1', [
      gateway.gatewayId,
    ]);

    // A new leader with an empty map, then a beat.
    await harness!.pool.query(
      'UPDATE control_plane_lease SET heartbeat_at = now() - make_interval(secs => $1) WHERE id = 1',
      [harness!.config.leaderLeaseTtlMs / 1_000 + 5],
    );
    const successor = await makeSessionNode(harness!);
    await promoteNode(successor);
    const newEpoch = await openSession(successor, gateway);

    await successor.service.heartbeat(signedBeat(successor, gateway, newEpoch, 1), TEST_IP);
    assert.deepEqual(
      (await availabilityRows(successor.pool, gateway.gatewayId)).map((row) => row.transition),
      ['went_online'],
      'the next accepted heartbeat creates a new went_online',
    );
  });
});

describe('gateway-online · two-enrolled-online-when-either-is-live', { skip: STORAGE_SKIP }, () => {
  /*
   * FOUNDER-ACT-20261010-TWO-GATEWAYS B3: with two gateways enrolled, the
   * overlay is online when at least one of them is live and offline when
   * neither is, whichever slot the live one holds.
   */
  it('is online when either gateway is live and offline when neither is', async () => {
    const { node, gateway: first } = await servingNode();
    const second = await enrollGateway(node);
    assert.notEqual(first.gatewayId, second.gatewayId);

    const neither = await scopedRoom(node);
    assert.equal((await tryDispatch(node, neither)).accepted, false, 'neither has beaten: offline');

    // Only the gateway in slot 2 is live; the one in slot 1 has no liveness.
    const secondEpoch = await openSession(node, second);
    assert.equal((await node.service.heartbeat(signedBeat(node, second, secondEpoch, 1), TEST_IP)).status, 200);
    const secondOnly = await scopedRoom(node);
    assert.equal((await tryDispatch(node, secondOnly)).accepted, true, 'slot 2 live: online');

    // Both stale.
    await advanceWithRenewals(node, node.config.gatewayStalenessMs + 5_000);
    const bothStale = await scopedRoom(node);
    const stale = await tryDispatch(node, bothStale);
    assert.equal(stale.accepted, false, 'both stale: offline');
    assert.match(String(stale.reason), /gateway offline/);

    // Only the gateway in slot 1 is live; the one in slot 2 is stale.
    const firstEpoch = await openSession(node, first);
    assert.equal((await node.service.heartbeat(signedBeat(node, first, firstEpoch, 1), TEST_IP)).status, 200);
    const firstOnly = await scopedRoom(node);
    assert.equal((await tryDispatch(node, firstOnly)).accepted, true, 'slot 1 live: online');

    // Revoking the live one leaves only the stale one: offline.
    assert.equal((await node.store.revokeGateway(first.gatewayId, null)).ok, true);
    const afterRevoke = await scopedRoom(node);
    assert.equal((await tryDispatch(node, afterRevoke)).accepted, false, 'the remaining gateway is stale: offline');
  });
});
