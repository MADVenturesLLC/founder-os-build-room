/**
 * §5 table 2 — the projection is a replay of the log, not an independent truth.
 *
 * `gateway_current_state` is mutable, which makes it the one place a divergence
 * between "what happened" and "what we think happened" could hide. This suite
 * removes the hiding place: the pure reducer is run over the events in `seq`
 * order and the result is compared with the table, column for column. If a
 * writer ever updates the projection in a way no event explains, or writes an
 * event whose projection consequence differs from the reducer's, this fails.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
  harness = await createGatewayHarness('projection');
  store = new GatewayRegistryStore(harness.pool, harness.config);
});

after(async () => {
  await destroyGatewayHarness(harness);
});

async function assertReplayEqualsTable(): Promise<void> {
  const replayed = await store!.replayProjection();
  const table = await store!.readProjection();

  assert.deepEqual(
    [...replayed.keys()].sort(),
    [...table.keys()].sort(),
    'the reducer and the table must know about the same gateways',
  );
  for (const [gatewayId, expected] of replayed) {
    assert.deepEqual(table.get(gatewayId), expected, `projection diverged for ${gatewayId}`);
  }
}

describe('gateway-projection · projection:replay-equals-table', { skip: STORAGE_SKIP }, () => {
  it('holds for an empty registry', async () => {
    await assertReplayEqualsTable();
  });

  it('holds after a mint and a redemption', async () => {
    const awaiting = await mintAndRedeem(store!);
    const table = await store!.readProjection();
    const row = table.get(awaiting.gatewayId);

    assert.ok(row !== undefined);
    assert.equal(row.state, 'awaiting_approval');
    assert.equal(row.keyId, awaiting.keyId);
    assert.equal(row.isCurrentlyEnrolled, false);
    assert.ok(row.awaitingApprovalExpiresAt !== null, 'the approval deadline is visible');
    await assertReplayEqualsTable();
  });

  it('holds across the whole lifecycle, including the terminations', async () => {
    const first = await mintAndRedeem(store!);
    assert.equal((await store!.confirmEnrollment(first.gatewayId, first.keyId, null)).ok, true);
    await assertReplayEqualsTable();

    const denied = await mintAndRedeem(store!);
    assert.equal((await store!.denyEnrollment(denied.gatewayId, null)).ok, true);
    await assertReplayEqualsTable();

    assert.equal((await store!.revokeGateway(first.gatewayId, null)).ok, true);
    await assertReplayEqualsTable();

    const successor = await mintAndRedeem(store!);
    assert.equal((await store!.confirmEnrollment(successor.gatewayId, successor.keyId, null)).ok, true);
    await assertReplayEqualsTable();

    const table = await store!.readProjection();
    assert.equal(table.get(first.gatewayId)?.state, 'revoked');
    assert.equal(table.get(denied.gatewayId)?.state, 'denied');
    assert.equal(table.get(successor.gatewayId)?.state, 'enrolled');
  });

  it('drops the approval deadline once an identity leaves awaiting_approval', async () => {
    const awaiting = await mintAndRedeem(store!);
    const before = (await store!.readProjection()).get(awaiting.gatewayId);
    assert.ok(before?.awaitingApprovalExpiresAt !== null);

    await store!.denyEnrollment(awaiting.gatewayId, null);
    const after = (await store!.readProjection()).get(awaiting.gatewayId);
    assert.equal(after?.awaitingApprovalExpiresAt, null, 'a deadline describes nothing after denial');
    await assertReplayEqualsTable();
  });

  it('carries identity forward across state moves that do not restate it', async () => {
    const awaiting = await mintAndRedeem(store!);
    await store!.denyEnrollment(awaiting.gatewayId, null);

    const row = (await store!.readProjection()).get(awaiting.gatewayId);
    assert.equal(row?.keyId, awaiting.keyId, 'the key survives the state move');
    assert.ok(row?.pubkeyBase64 !== null, 'so does the public key');
    assert.ok(row?.hostDescriptor !== null, 'and the host descriptor');
    await assertReplayEqualsTable();
  });

  it('orders by seq, and refuses to project an out-of-order log', async () => {
    const { projectGatewayRegistry, ProjectionOrderError } = await import(
      '../packages/gateway-registry/src/index.js'
    );
    const events = [...(await store!.readRegistryEvents())];
    assert.ok(events.length > 1, 'the fixtures above must have written a log');

    // `recorded_at` is metadata, not the ordering key — two rows in one
    // transaction share it, so only `seq` can order them.
    const seqs = events.map((event) => event.seq);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));

    assert.throws(() => projectGatewayRegistry([...events].reverse()), ProjectionOrderError);
  });

  it('ignores minted events, which precede any gateway identity', async () => {
    const beforeCount = (await store!.readProjection()).size;
    await store!.mintPairingCode();
    const events = await store!.readRegistryEvents();

    assert.ok(
      events.some((event) => event.eventType === 'minted' && event.gatewayId === null),
      'a minted event carries no gateway id',
    );
    assert.equal((await store!.readProjection()).size, beforeCount, 'and moves no projection row');
    await assertReplayEqualsTable();
  });

  it('never projects two gateways as enrolled at once', async () => {
    const { currentlyEnrolled } = await import('../packages/gateway-registry/src/index.js');
    assert.doesNotThrow(() => currentlyEnrolled(new Map()));

    const replayed = await store!.replayProjection();
    const enrolled = currentlyEnrolled(replayed);
    assert.ok(enrolled === null || enrolled.isCurrentlyEnrolled);

    const { rows } = await harness!.pool.query<{ count: string }>(
      'SELECT count(*) FROM gateway_current_state WHERE is_currently_enrolled',
    );
    assert.ok(Number(rows[0]?.count ?? '0') <= 1, 'the database permits at most one');
    void randomUUID;
  });
});
