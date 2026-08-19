/**
 * §18 — retention: what is swept, what is not, and what must outlive a retry.
 *
 * Two failure modes this suite exists to prevent, in opposite directions. One
 * is sweeping a >=7-year table, which destroys the record of an act nobody can
 * reconstruct. The other is sweeping an idempotency row while the daemon is
 * still entitled to retry against it, which turns a retry into a second
 * consumption of a Founder's code.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import { makeSessionNode, promoteNode, type SessionNode } from './gateway-session-helpers.js';
import { mintAndRedeem } from './gateway-registry-helpers.js';

let harness: GatewayHarness | undefined;
let node: SessionNode | undefined;

before(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('retention');
  node = await makeSessionNode(harness);
  await promoteNode(node);
});

after(async () => {
  await destroyGatewayHarness(harness);
});

async function countOf(table: string): Promise<number> {
  const { rows } = await harness!.pool.query<{ count: string }>(`SELECT count(*) FROM ${table}`);
  return Number(rows[0]?.count ?? '0');
}

/** An availability row stamped `days` in the past. */
async function agedAvailability(gatewayId: string, days: number, transition = 'went_online'): Promise<void> {
  await harness!.pool.query(
    `INSERT INTO gateway_availability_events (event_id, gateway_id, transition, occurred_at, recorded_at)
     VALUES ($1, $2, $3, now() - make_interval(days => $4), now() - make_interval(days => $4))`,
    [randomUUID(), gatewayId, transition, days],
  );
}

describe('gateway-retention · sweep-90d-classes-only', { skip: STORAGE_SKIP }, () => {
  it('sweeps the ninety-day classes and leaves everything newer', async () => {
    const gatewayId = randomUUID();
    await agedAvailability(gatewayId, 91);
    await agedAvailability(gatewayId, 89, 'went_offline');

    await harness!.pool.query(
      `INSERT INTO gateway_message_rejections (resolved_key_id, source_ip, error_code, minute_bucket)
       VALUES ('unknown', '203.0.113.1', 'bad_signature', now() - interval '91 days'),
              ('unknown', '203.0.113.2', 'bad_signature', now() - interval '89 days')`,
    );

    const swept = await node!.sweeps.sweepRetention();

    assert.ok(swept.availability >= 1, 'the aged availability row was deleted');
    assert.ok(swept.messageRejections >= 1, 'the aged rejection bucket was deleted');

    const { rows } = await harness!.pool.query<{ count: string }>(
      'SELECT count(*) FROM gateway_availability_events WHERE gateway_id = $1',
      [gatewayId],
    );
    assert.equal(rows[0]?.count, '1', 'the eighty-nine-day row survives');

    const remaining = await harness!.pool.query<{ source_ip: string }>(
      'SELECT source_ip FROM gateway_message_rejections',
    );
    assert.ok(
      remaining.rows.every((row) => row.source_ip !== '203.0.113.1'),
      'the aged bucket is gone',
    );
    assert.ok(
      remaining.rows.some((row) => row.source_ip === '203.0.113.2'),
      'the recent bucket remains',
    );
  });

  it('is idempotent — a second run deletes nothing more', async () => {
    await node!.sweeps.sweepRetention();
    const second = await node!.sweeps.sweepRetention();
    assert.deepEqual(second, { availability: 0, messageRejections: 0, idempotency: 0 });
  });
});

describe('gateway-retention · aged-availability-fully-swept', { skip: STORAGE_SKIP }, () => {
  it('deletes ALL aged rows, with no indefinite latest-row exception', async () => {
    const gatewayId = randomUUID();
    await agedAvailability(gatewayId, 200, 'went_online');
    await agedAvailability(gatewayId, 150, 'went_offline');
    await agedAvailability(gatewayId, 100, 'went_online');

    await node!.sweeps.sweepRetention();

    const { rows } = await harness!.pool.query<{ count: string }>(
      'SELECT count(*) FROM gateway_availability_events WHERE gateway_id = $1',
      [gatewayId],
    );
    assert.equal(
      rows[0]?.count,
      '0',
      'keeping the last row forever made it an immortal marker; absence derives offline instead',
    );
  });
});

describe('gateway-retention · idempotency-survives-retry-horizon', { skip: STORAGE_SKIP }, () => {
  it('keeps a 23-hour-old row, well inside the daemon 24-hour retry horizon', async () => {
    const awaiting = await mintAndRedeem(node!.store);
    await harness!.pool.query(
      "UPDATE gateway_redeem_idempotency SET recorded_at = now() - interval '23 hours'",
    );
    const before = await countOf('gateway_redeem_idempotency');
    assert.ok(before >= 1);

    const swept = await node!.sweeps.sweepRetention();

    assert.equal(swept.idempotency, 0, 'nothing inside the retry window may be swept');
    assert.equal(await countOf('gateway_redeem_idempotency'), before);
    void awaiting;
  });

  it('deletes a row past codeTtl + awaitingApprovalTtl + 24 h', async () => {
    await mintAndRedeem(node!.store);
    const horizonSeconds =
      (node!.config.gatewayCodeTtlMs + node!.config.gatewayAwaitingApprovalTtlMs) / 1_000 +
      24 * 60 * 60;
    await harness!.pool.query(
      'UPDATE gateway_redeem_idempotency SET recorded_at = now() - make_interval(secs => $1)',
      [horizonSeconds + 60],
    );

    const swept = await node!.sweeps.sweepRetention();
    assert.ok(swept.idempotency >= 1, 'past the horizon, the replayable result is released');
  });
});

describe('gateway-retention · seven-year-tables-untouched', { skip: STORAGE_SKIP }, () => {
  it('leaves the >=7-year classes entirely alone, however old their rows', async () => {
    const awaiting = await mintAndRedeem(node!.store);
    await node!.store.recordRefusal({
      kind: 'unknown_code',
      detail: { reason: 'fixture' },
      sourceIp: '203.0.113.5',
    });

    // Age every >=7-year table far past any retention window.
    await harness!.pool.query(
      "UPDATE gateway_enrollment_refusals SET recorded_at = now() - interval '9 years'",
    );
    await harness!.pool.query(
      "UPDATE gateway_pairing_codes SET minted_at = now() - interval '9 years'",
    );

    const events = await countOf('gateway_registry_events');
    const refusals = await countOf('gateway_enrollment_refusals');
    const codes = await countOf('gateway_pairing_codes');
    assert.ok(events > 0 && refusals > 0 && codes > 0, 'the fixtures must exist to be preserved');

    await node!.sweeps.sweepRetention();

    assert.equal(await countOf('gateway_registry_events'), events, 'lifecycle log untouched');
    assert.equal(await countOf('gateway_enrollment_refusals'), refusals, 'refusals untouched');
    assert.equal(await countOf('gateway_pairing_codes'), codes, 'pairing codes untouched');
    void awaiting;
  });

  it('cannot delete from the lifecycle log even if something tried', async () => {
    await assert.rejects(
      () => harness!.pool.query('DELETE FROM gateway_registry_events'),
      /append-only/,
      'the trigger is the guarantee, not the sweep code',
    );
  });
});

describe('gateway-retention · expiry is replica-safe and idempotent', { skip: STORAGE_SKIP }, () => {
  it('expires a past-deadline awaiting row, and a repeat run writes nothing', async () => {
    const awaiting = await mintAndRedeem(node!.store);
    await harness!.pool.query(
      `UPDATE gateway_current_state SET awaiting_approval_expires_at = now() - interval '1 second'
        WHERE gateway_id = $1`,
      [awaiting.gatewayId],
    );

    const first = await node!.sweeps.sweepExpiry();
    assert.ok(first >= 1, 'the deadline was enforced');

    const { rows } = await harness!.pool.query<{ state: string }>(
      'SELECT state FROM gateway_current_state WHERE gateway_id = $1',
      [awaiting.gatewayId],
    );
    assert.equal(rows[0]?.state, 'expired');

    const eventsBefore = await countOf('gateway_registry_events');
    const second = await node!.sweeps.sweepExpiry();
    assert.equal(second, 0, 'the state precondition makes a repeat run a no-op');
    assert.equal(await countOf('gateway_registry_events'), eventsBefore, 'and write nothing');
  });

  it('keeps the projection and the replayed log in agreement afterwards', async () => {
    const replayed = await node!.store.replayProjection();
    const table = await node!.store.readProjection();
    for (const [gatewayId, expected] of replayed) {
      assert.deepEqual(table.get(gatewayId), expected, `projection diverged for ${gatewayId}`);
    }
  });
});
