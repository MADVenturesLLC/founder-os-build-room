/**
 * §5 table 1 — the lifecycle log is append-only at the database.
 *
 * The claim is not "application code never updates this table". It is that the
 * table refuses the mutation whatever issues it, which is the only version of
 * the claim that survives a defect, a migration script, or a psql session. The
 * eight-table shape is checked here too, in the same place, because a schema
 * that is described as eight tables and ships as seven is a review that
 * happened against a document rather than against a database.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  GATEWAY_EVENT_TYPES,
  GATEWAY_STATES,
} from '../packages/gateway-registry/src/index.js';
import { MIGRATIONS, GATEWAY_REGISTRY_LOCK_KEY } from '../packages/control-plane/src/migrations.js';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';

let harness: GatewayHarness | undefined;

before(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('registry-immutability');
});

after(async () => {
  await destroyGatewayHarness(harness);
});

/** Insert one lifecycle event and return its `seq`. */
async function insertEvent(eventType: string, gatewayId: string | null): Promise<string> {
  const { rows } = await harness!.pool.query<{ seq: string }>(
    `INSERT INTO gateway_registry_events
       (event_id, event_type, gateway_id, actor, attribution, occurred_at, payload)
     VALUES ($1, $2, $3, $4, $5, now(), $6) RETURNING seq`,
    [
      randomUUID(),
      eventType,
      gatewayId,
      JSON.stringify({ kind: 'founder' }),
      JSON.stringify({ roleId: 'builder' }),
      JSON.stringify({ note: 'fixture' }),
    ],
  );
  const seq = rows[0]?.seq;
  assert.ok(seq !== undefined);
  return seq;
}

describe('0003_gateway_registry — the migration is present and idempotent', { skip: STORAGE_SKIP }, () => {
  it('is the third migration and is named exactly once', () => {
    const ids = MIGRATIONS.map((migration) => migration.id);
    assert.ok(ids.includes('0003_gateway_registry'), 'the migration must be registered');
    assert.equal(
      ids.filter((id) => id === '0003_gateway_registry').length,
      1,
      'a migration id must be unique',
    );
  });

  it('applies nothing on a second run', async () => {
    const { migrate } = await import('../packages/control-plane/src/migrations.js');
    const second = await migrate(harness!.pool);
    assert.deepEqual(second.applied, []);
    assert.ok(second.alreadyApplied.includes('0003_gateway_registry'));
  });

  it('uses a registry lock key distinct from the migration lock key', () => {
    assert.equal(GATEWAY_REGISTRY_LOCK_KEY, 8_180_818);
    assert.notEqual(GATEWAY_REGISTRY_LOCK_KEY, 8_150_817);
  });
});

describe('0003_gateway_registry — eight tables, and exactly the eight named', { skip: STORAGE_SKIP }, () => {
  const EXPECTED = [
    'control_plane_lease',
    'gateway_availability_events',
    'gateway_current_state',
    'gateway_enrollment_refusals',
    'gateway_message_rejections',
    'gateway_pairing_codes',
    'gateway_redeem_idempotency',
    'gateway_registry_events',
  ];

  it('creates all eight', async () => {
    const { rows } = await harness!.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE ANY (ARRAY['gateway%', 'control_plane%'])
        ORDER BY table_name`,
    );
    assert.deepEqual(rows.map((row) => row.table_name), EXPECTED);
    assert.equal(EXPECTED.length, 8, 'the count is eight everywhere in this contract');
  });

  it('seeds the single lease row', async () => {
    const { rows } = await harness!.pool.query<{ id: number; generation: string }>(
      'SELECT id, generation FROM control_plane_lease',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, 1);
    assert.equal(rows[0]?.generation, '0');
  });

  it('refuses a second lease row', async () => {
    await assert.rejects(() => harness!.pool.query('INSERT INTO control_plane_lease (id) VALUES (2)'));
  });
});

describe('0003_gateway_registry — the schema agrees with the pure vocabulary', { skip: STORAGE_SKIP }, () => {
  /*
   * The DDL carries literal lists rather than lists generated from the package
   * constants, because a shipped migration must never change when a constant
   * does — it has already run everywhere. So the two copies are compared here
   * instead: one place where a divergence is a red test rather than a silent
   * difference between a fresh database and an existing one.
   */
  it('accepts exactly the six lifecycle event types', async () => {
    for (const eventType of GATEWAY_EVENT_TYPES) {
      await insertEvent(eventType, eventType === 'minted' ? null : randomUUID());
    }
    await assert.rejects(() => insertEvent('promoted', randomUUID()), /event_type/);
    assert.equal(GATEWAY_EVENT_TYPES.length, 6);
  });

  it('accepts exactly the five projection states', async () => {
    const seq = await insertEvent('key_received', randomUUID());
    for (const state of GATEWAY_STATES) {
      const gatewayId = randomUUID();
      await harness!.pool.query(
        `INSERT INTO gateway_current_state
           (gateway_id, state, state_since, last_event_seq, is_currently_enrolled)
         VALUES ($1, $2, now(), $3, $4)`,
        [gatewayId, state, seq, state === 'enrolled'],
      );
      // Leave no enrolled row behind: the partial unique index is global, and
      // the later cases in this loop would collide with it.
      await harness!.pool.query('DELETE FROM gateway_current_state WHERE gateway_id = $1', [gatewayId]);
    }
    await assert.rejects(
      () =>
        harness!.pool.query(
          `INSERT INTO gateway_current_state (gateway_id, state, state_since, last_event_seq)
           VALUES ($1, 'promoted', now(), $2)`,
          [randomUUID(), seq],
        ),
      /state/,
    );
    assert.equal(GATEWAY_STATES.length, 5);
  });

  it('refuses a projection row whose enrolled flag disagrees with its state', async () => {
    const seq = await insertEvent('key_received', randomUUID());
    await assert.rejects(
      () =>
        harness!.pool.query(
          `INSERT INTO gateway_current_state
             (gateway_id, state, state_since, last_event_seq, is_currently_enrolled)
           VALUES ($1, 'revoked', now(), $2, true)`,
          [randomUUID(), seq],
        ),
      /enrolled_flag_agrees/,
    );
  });
});

describe('gateway-registry-immutability · update-and-delete-refused', { skip: STORAGE_SKIP }, () => {
  it('rejects an UPDATE against the lifecycle log', async () => {
    const gatewayId = randomUUID();
    await insertEvent('key_received', gatewayId);

    await assert.rejects(
      () =>
        harness!.pool.query('UPDATE gateway_registry_events SET event_type = $1 WHERE gateway_id = $2', [
          'enrolled',
          gatewayId,
        ]),
      /append-only/,
    );
  });

  it('rejects a DELETE against the lifecycle log, and the row survives', async () => {
    const gatewayId = randomUUID();
    await insertEvent('key_received', gatewayId);

    await assert.rejects(
      () => harness!.pool.query('DELETE FROM gateway_registry_events WHERE gateway_id = $1', [gatewayId]),
      /append-only/,
    );

    const { rows } = await harness!.pool.query<{ count: string }>(
      'SELECT count(*) FROM gateway_registry_events WHERE gateway_id = $1',
      [gatewayId],
    );
    assert.equal(rows[0]?.count, '1');
  });

  it('leaves the 90-day classes mutable, because the sweep must delete from them', async () => {
    const gatewayId = randomUUID();
    await harness!.pool.query(
      `INSERT INTO gateway_availability_events (event_id, gateway_id, transition, occurred_at)
       VALUES ($1, $2, 'went_online', now())`,
      [randomUUID(), gatewayId],
    );
    const deleted = await harness!.pool.query(
      'DELETE FROM gateway_availability_events WHERE gateway_id = $1',
      [gatewayId],
    );
    assert.equal(deleted.rowCount, 1, 'the retention sweep depends on this being permitted');
  });
});

describe('0003_gateway_registry — the pairing-code consumption pair is all-or-nothing', { skip: STORAGE_SKIP }, () => {
  it('refuses a half-consumed code row', async () => {
    await assert.rejects(
      () =>
        harness!.pool.query(
          `INSERT INTO gateway_pairing_codes (pairing_id, code_hash, minted_by, expires_at, consumed_at)
           VALUES ($1, $2, $3, now() + interval '10 minutes', now())`,
          [randomUUID(), randomUUID(), JSON.stringify({ kind: 'founder' })],
        ),
      /consumption_is_complete/,
    );
  });
});
