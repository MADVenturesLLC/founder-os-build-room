/**
 * Clause 5 — at most one gateway is enrolled, enforced by the database.
 *
 * The distinction this suite exists to make is between an invariant that holds
 * because the code happens to check it in the right order, and one that holds
 * because the storage engine refuses the alternative. Only the second survives
 * two requests arriving at once, and only the second enforces the required
 * ordering — revoke the incumbent, then confirm the successor — against a
 * Founder who does it backwards.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GatewayRegistryStore } from '../packages/control-plane/src/gateway/store.js';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import { mintAndRedeem } from './gateway-registry-helpers.js';

let harness: GatewayHarness | undefined;
let store: GatewayRegistryStore | undefined;

before(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('invariants');
  store = new GatewayRegistryStore(harness.appPool, harness.config);
});

after(async () => {
  await destroyGatewayHarness(harness);
});

async function enrolledCount(): Promise<number> {
  const { rows } = await harness!.pool.query<{ count: string }>(
    'SELECT count(*) FROM gateway_current_state WHERE is_currently_enrolled',
  );
  return Number(rows[0]?.count ?? '0');
}

async function stateOf(gatewayId: string): Promise<string | null> {
  const { rows } = await harness!.pool.query<{ state: string }>(
    'SELECT state FROM gateway_current_state WHERE gateway_id = $1',
    [gatewayId],
  );
  return rows[0]?.state ?? null;
}

/** Assert the read model still agrees with the log, then clear any incumbent. */
async function assertConsistentAndClear(): Promise<void> {
  const replayed = await store!.replayProjection();
  const table = await store!.readProjection();
  for (const [gatewayId, expected] of replayed) {
    assert.deepEqual(table.get(gatewayId), expected, `projection diverged for ${gatewayId}`);
  }
  assert.ok((await enrolledCount()) <= 1, 'at most one enrolled row may exist');

  const { rows } = await harness!.pool.query<{ gateway_id: string }>(
    'SELECT gateway_id FROM gateway_current_state WHERE is_currently_enrolled',
  );
  for (const row of rows) await store!.revokeGateway(row.gateway_id, null);
}

describe('gateway-invariants · concurrent-confirms-one-wins', { skip: STORAGE_SKIP }, () => {
  it('admits exactly one of two simultaneous confirmations', async () => {
    const first = await mintAndRedeem(store!);
    const second = await mintAndRedeem(store!);

    /*
     * Deterministic by database-enforced conflict. Both confirmations contend
     * for the registry advisory lock; whichever commits second is refused by
     * the partial unique index, not by a check in application code that a
     * different interleaving could skip.
     */
    const [a, b] = await Promise.all([
      store!.confirmEnrollment(first.gatewayId, first.keyId, null),
      store!.confirmEnrollment(second.gatewayId, second.keyId, null),
    ]);

    const accepted = [a, b].filter((result) => result.ok);
    const refused = [a, b].filter((result) => !result.ok);

    assert.equal(accepted.length, 1, 'exactly one confirmation is accepted');
    assert.equal(refused.length, 1);
    assert.equal(refused[0]!.ok === false && refused[0]!.code, 'another_gateway_enrolled');
    assert.equal(await enrolledCount(), 1);

    const { rows } = await harness!.pool.query<{ count: string }>(
      "SELECT count(*) FROM gateway_enrollment_refusals WHERE kind = 'another_gateway_enrolled'",
    );
    assert.ok(Number(rows[0]?.count ?? '0') >= 1, 'the refusal is recorded');

    await assertConsistentAndClear();
  });
});

describe(
  'gateway-invariants · invariant:successor-confirm-before-incumbent-revoke-refused',
  { skip: STORAGE_SKIP },
  () => {
    it('refuses the successor while the incumbent is still enrolled', async () => {
      const incumbent = await mintAndRedeem(store!);
      assert.equal((await store!.confirmEnrollment(incumbent.gatewayId, incumbent.keyId, null)).ok, true);

      const successor = await mintAndRedeem(store!);
      const refused = await store!.confirmEnrollment(successor.gatewayId, successor.keyId, null);

      assert.equal(refused.ok, false);
      assert.equal(!refused.ok && refused.status, 409);
      assert.equal(!refused.ok && refused.code, 'another_gateway_enrolled');
      assert.equal(await stateOf(successor.gatewayId), 'awaiting_approval', 'the successor still waits');
      assert.equal(await stateOf(incumbent.gatewayId), 'enrolled', 'the incumbent is untouched');

      // The ruled order works, and the database is what makes it the only one.
      assert.equal((await store!.revokeGateway(incumbent.gatewayId, null)).ok, true);
      assert.equal((await store!.confirmEnrollment(successor.gatewayId, successor.keyId, null)).ok, true);
      assert.equal(await enrolledCount(), 1);

      await assertConsistentAndClear();
    });

    it('leaves nobody enrolled during the revoke-to-confirm gap', async () => {
      const incumbent = await mintAndRedeem(store!);
      await store!.confirmEnrollment(incumbent.gatewayId, incumbent.keyId, null);
      const successor = await mintAndRedeem(store!);

      await store!.revokeGateway(incumbent.gatewayId, null);
      assert.equal(
        await enrolledCount(),
        0,
        'the gap is real, disclosed, and required by clause 5 — dispatch stays paused',
      );

      await store!.confirmEnrollment(successor.gatewayId, successor.keyId, null);
      await assertConsistentAndClear();
    });
  },
);

describe('gateway-invariants · confirm-vs-revoke', { skip: STORAGE_SKIP }, () => {
  it('serializes a revoke of the incumbent against a confirm of the successor', async () => {
    const incumbent = await mintAndRedeem(store!);
    await store!.confirmEnrollment(incumbent.gatewayId, incumbent.keyId, null);
    const successor = await mintAndRedeem(store!);

    const [revoked, confirmed] = await Promise.all([
      store!.revokeGateway(incumbent.gatewayId, null),
      store!.confirmEnrollment(successor.gatewayId, successor.keyId, null),
    ]);

    assert.equal(revoked.ok, true, 'a revoke is never refused by a concurrent confirm');
    assert.equal(await stateOf(incumbent.gatewayId), 'revoked');

    if (confirmed.ok) {
      // The revoke committed first; the successor is enrolled.
      assert.equal(await stateOf(successor.gatewayId), 'enrolled');
    } else {
      // The confirm ran first and the index refused it.
      assert.equal(!confirmed.ok && confirmed.code, 'another_gateway_enrolled');
      assert.equal(await stateOf(successor.gatewayId), 'awaiting_approval');
    }
    assert.ok((await enrolledCount()) <= 1, 'either way, never two');

    await assertConsistentAndClear();
  });
});

describe('gateway-invariants · deny-vs-confirm', { skip: STORAGE_SKIP }, () => {
  it('admits exactly one of a simultaneous deny and confirm on one identity', async () => {
    const awaiting = await mintAndRedeem(store!);

    const [denied, confirmed] = await Promise.all([
      store!.denyEnrollment(awaiting.gatewayId, null),
      store!.confirmEnrollment(awaiting.gatewayId, awaiting.keyId, null),
    ]);

    const accepted = [denied, confirmed].filter((result) => result.ok);
    assert.equal(accepted.length, 1, 'the projection row lock admits one act');

    const finalState = await stateOf(awaiting.gatewayId);
    assert.ok(finalState === 'denied' || finalState === 'enrolled');

    if (!denied.ok) assert.equal(denied.code, 'not_awaiting_approval');
    if (!confirmed.ok) assert.equal(confirmed.code, 'not_awaiting_approval');

    await assertConsistentAndClear();
  });
});

describe('gateway-invariants · expiry-vs-confirm', { skip: STORAGE_SKIP }, () => {
  it('refuses a confirm that arrives after the deadline, and records the expiry', async () => {
    const awaiting = await mintAndRedeem(store!);
    await harness!.pool.query(
      `UPDATE gateway_current_state SET awaiting_approval_expires_at = now() - interval '1 second'
        WHERE gateway_id = $1`,
      [awaiting.gatewayId],
    );

    const result = await store!.confirmEnrollment(awaiting.gatewayId, awaiting.keyId, null);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, 'not_awaiting_approval');
    assert.equal(await stateOf(awaiting.gatewayId), 'expired');
    assert.equal(await enrolledCount(), 0, 'an expired identity never becomes the incumbent');

    await assertConsistentAndClear();
  });

  it('refuses a deny that arrives after the deadline, on the same footing', async () => {
    const awaiting = await mintAndRedeem(store!);
    await harness!.pool.query(
      `UPDATE gateway_current_state SET awaiting_approval_expires_at = now() - interval '1 second'
        WHERE gateway_id = $1`,
      [awaiting.gatewayId],
    );

    const result = await store!.denyEnrollment(awaiting.gatewayId, null);
    assert.equal(result.ok, false);
    assert.equal(await stateOf(awaiting.gatewayId), 'expired');
    await assertConsistentAndClear();
  });
});
