/**
 * Clause 5, as amended — at most two gateways are enrolled, enforced by the
 * database (FOUNDER-ACT-20261010-TWO-GATEWAYS, amending DEC-20260818-01).
 *
 * The distinction this suite exists to make is between an invariant that holds
 * because the code happens to check it in the right order, and one that holds
 * because the storage engine refuses the alternative. Only the second survives
 * requests arriving at once. Each enrolled gateway holds one of two enrollment
 * slots and a partial unique index lets a slot be held once (B2), so a third
 * confirmation is refused whatever the interleaving. With one slot held, a
 * successor may be confirmed before its incumbent is revoked (B5, and its
 * clarification); with both held, the incumbent must be revoked first.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pgDefault from 'pg';
import { GatewayRegistryStore } from '../packages/control-plane/src/gateway/store.js';
import {
  ENROLLMENT_REFUSAL_KINDS,
  RETIRED_ENROLLMENT_REFUSAL_KINDS,
} from '../packages/control-plane/src/gateway/records.js';
import { MIGRATIONS, migrate } from '../packages/control-plane/src/migrations.js';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import { mintAndRedeem, type AwaitingGateway } from './gateway-registry-helpers.js';
import { destroyOwnedInstance, resolveServerBinaries, startOwnedInstance } from './support/owned-postgres.js';

const { Pool: PgPool } = pgDefault;

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

async function slotOf(gatewayId: string): Promise<number | null> {
  const { rows } = await harness!.pool.query<{ enrollment_slot: number | null }>(
    'SELECT enrollment_slot FROM gateway_current_state WHERE gateway_id = $1',
    [gatewayId],
  );
  return rows[0]?.enrollment_slot ?? null;
}

async function refusalCount(kind: string): Promise<number> {
  const { rows } = await harness!.pool.query<{ count: string }>(
    'SELECT count(*) FROM gateway_enrollment_refusals WHERE kind = $1',
    [kind],
  );
  return Number(rows[0]?.count ?? '0');
}

async function enroll(): Promise<AwaitingGateway> {
  const gateway = await mintAndRedeem(store!);
  const confirmed = await store!.confirmEnrollment(gateway.gatewayId, gateway.keyId, null);
  assert.equal(confirmed.ok, true, `fixture confirm refused: ${JSON.stringify(confirmed)}`);
  return gateway;
}

/** Assert the read model still agrees with the log, then revoke every enrolled gateway. */
async function assertConsistentAndClear(): Promise<void> {
  const replayed = await store!.replayProjection();
  const table = await store!.readProjection();
  for (const [gatewayId, expected] of replayed) {
    assert.deepEqual(table.get(gatewayId), expected, `projection diverged for ${gatewayId}`);
  }
  assert.ok((await enrolledCount()) <= 2, 'at most two enrolled rows may exist');

  const { rows } = await harness!.pool.query<{ gateway_id: string }>(
    'SELECT gateway_id FROM gateway_current_state WHERE is_currently_enrolled',
  );
  for (const row of rows) await store!.revokeGateway(row.gateway_id, null);
}

describe('gateway-invariants · two-enrolled-third-refused', { skip: STORAGE_SKIP }, () => {
  it('enrolls two gateways, each in its own slot with its own identity and key', async () => {
    const first = await enroll();
    const second = await enroll();

    assert.equal(await enrolledCount(), 2);
    assert.deepEqual([await slotOf(first.gatewayId), await slotOf(second.gatewayId)], [1, 2]);

    const enrolled = (await store!.listEnrollments()).filter((view) => view.isCurrentlyEnrolled);
    assert.equal(enrolled.length, 2);
    assert.notEqual(first.keyId, second.keyId, 'two identities, two keys');
    const byId = new Map(enrolled.map((view) => [view.gatewayId, view]));
    assert.equal(byId.get(first.gatewayId)?.keyId, first.keyId);
    assert.equal(byId.get(second.gatewayId)?.keyId, second.keyId);
    assert.equal(byId.get(first.gatewayId)?.enrollmentSlot, 1);
    assert.equal(byId.get(second.gatewayId)?.enrollmentSlot, 2);

    await assertConsistentAndClear();
  });

  it('refuses a third confirmation as enrollment_cap_reached, records it, and admits it once a slot is free', async () => {
    const first = await enroll();
    const second = await enroll();
    const third = await mintAndRedeem(store!);
    const refusalsBefore = await refusalCount('enrollment_cap_reached');

    const refused = await store!.confirmEnrollment(third.gatewayId, third.keyId, null);
    assert.equal(refused.ok, false);
    assert.equal(!refused.ok && refused.status, 409);
    assert.equal(!refused.ok && refused.code, 'enrollment_cap_reached');
    assert.equal(await stateOf(third.gatewayId), 'awaiting_approval', 'the third still waits');
    assert.equal(await refusalCount('enrollment_cap_reached'), refusalsBefore + 1, 'the refusal is recorded');
    assert.equal(await enrolledCount(), 2);

    // Freeing slot 1 lets the third in, and it takes the slot that was freed.
    assert.equal((await store!.revokeGateway(first.gatewayId, null)).ok, true);
    assert.equal(await slotOf(first.gatewayId), null, 'a revoked gateway holds no slot');
    assert.equal((await store!.confirmEnrollment(third.gatewayId, third.keyId, null)).ok, true);
    assert.equal(await slotOf(third.gatewayId), 1);
    assert.equal(await slotOf(second.gatewayId), 2);

    await assertConsistentAndClear();
  });
});

describe('gateway-invariants · concurrent-confirms-two-win', { skip: STORAGE_SKIP }, () => {
  it('admits exactly two of three simultaneous confirmations', async () => {
    const candidates = [await mintAndRedeem(store!), await mintAndRedeem(store!), await mintAndRedeem(store!)];
    const refusalsBefore = await refusalCount('enrollment_cap_reached');

    /*
     * All three contend for the registry advisory lock. Whichever runs third
     * finds both slots held and is refused; the slot index is what would
     * refuse it if the code ever read the slots wrongly.
     */
    const results = await Promise.all(
      candidates.map((candidate) => store!.confirmEnrollment(candidate.gatewayId, candidate.keyId, null)),
    );

    const accepted = results.filter((result) => result.ok);
    const refused = results.filter((result) => !result.ok);
    assert.equal(accepted.length, 2, 'exactly two confirmations are accepted');
    assert.equal(refused.length, 1);
    assert.equal(refused[0]!.ok === false && refused[0]!.code, 'enrollment_cap_reached');
    assert.equal(await enrolledCount(), 2);
    assert.equal(await refusalCount('enrollment_cap_reached'), refusalsBefore + 1);

    const { rows } = await harness!.pool.query<{ enrollment_slot: number }>(
      'SELECT enrollment_slot FROM gateway_current_state WHERE is_currently_enrolled ORDER BY enrollment_slot',
    );
    assert.deepEqual(rows.map((row) => row.enrollment_slot), [1, 2], 'each holds its own slot');

    await assertConsistentAndClear();
  });
});

describe('gateway-invariants · replacement (B5)', { skip: STORAGE_SKIP }, () => {
  it('with one slot held, confirms the successor before the incumbent is revoked', async () => {
    const incumbent = await enroll();
    const successor = await mintAndRedeem(store!);

    // The replacement overlap the act's B5 and its clarification permit: the
    // successor is confirmed first, and the two are briefly enrolled together.
    assert.equal((await store!.confirmEnrollment(successor.gatewayId, successor.keyId, null)).ok, true);
    assert.equal(await enrolledCount(), 2, 'the overlap is real and disclosed');
    assert.equal(await slotOf(incumbent.gatewayId), 1);
    assert.equal(await slotOf(successor.gatewayId), 2);

    // The overlap ends when the incumbent is revoked; the successor keeps its slot.
    assert.equal((await store!.revokeGateway(incumbent.gatewayId, null)).ok, true);
    assert.equal(await enrolledCount(), 1);
    assert.equal(await stateOf(successor.gatewayId), 'enrolled');
    assert.equal(await slotOf(successor.gatewayId), 2);

    await assertConsistentAndClear();
  });

  it('with both slots held, refuses the successor until the incumbent is revoked', async () => {
    const incumbent = await enroll();
    const otherMachine = await enroll();
    const successor = await mintAndRedeem(store!);

    const refused = await store!.confirmEnrollment(successor.gatewayId, successor.keyId, null);
    assert.equal(!refused.ok && refused.code, 'enrollment_cap_reached');
    assert.equal(await stateOf(successor.gatewayId), 'awaiting_approval', 'the successor still waits');
    assert.equal(await stateOf(incumbent.gatewayId), 'enrolled', 'the incumbent is untouched');

    // Revoke then confirm, the order the database leaves when both slots are held.
    assert.equal((await store!.revokeGateway(incumbent.gatewayId, null)).ok, true);
    assert.equal((await store!.confirmEnrollment(successor.gatewayId, successor.keyId, null)).ok, true);
    assert.equal(await slotOf(successor.gatewayId), 1);
    assert.equal(await stateOf(otherMachine.gatewayId), 'enrolled', 'the other machine is untouched throughout');
    assert.equal(await enrolledCount(), 2);

    await assertConsistentAndClear();
  });
});

describe('gateway-invariants · confirm-vs-revoke', { skip: STORAGE_SKIP }, () => {
  it('serializes a revoke against a confirm while both slots are held', async () => {
    const incumbent = await enroll();
    const otherMachine = await enroll();
    const successor = await mintAndRedeem(store!);

    const [revoked, confirmed] = await Promise.all([
      store!.revokeGateway(incumbent.gatewayId, null),
      store!.confirmEnrollment(successor.gatewayId, successor.keyId, null),
    ]);

    assert.equal(revoked.ok, true, 'a revoke is never refused by a concurrent confirm');
    assert.equal(await stateOf(incumbent.gatewayId), 'revoked');

    if (confirmed.ok) {
      // The revoke committed first; the successor took the freed slot.
      assert.equal(await stateOf(successor.gatewayId), 'enrolled');
      assert.equal(await slotOf(successor.gatewayId), 1);
    } else {
      // The confirm ran first and found both slots held.
      assert.equal(!confirmed.ok && confirmed.code, 'enrollment_cap_reached');
      assert.equal(await stateOf(successor.gatewayId), 'awaiting_approval');
    }
    assert.equal(await stateOf(otherMachine.gatewayId), 'enrolled');
    assert.ok((await enrolledCount()) <= 2, 'either way, never three');

    await assertConsistentAndClear();
  });
});

describe('gateway-invariants · the slot constraints are the database\'s', { skip: STORAGE_SKIP }, () => {
  /*
   * A `minted` event to reference: it carries no gateway identity, so the
   * reducer projects nothing from it and the replay comparison in the suites
   * below stays exact. The synthetic rows themselves are refused, so none of
   * them lands in the table.
   */
  async function referenceSeq(): Promise<number> {
    const { rows } = await harness!.pool.query<{ seq: string }>(
      `INSERT INTO gateway_registry_events (event_id, event_type, gateway_id, actor, attribution, occurred_at, payload)
       VALUES ($1, 'minted', NULL, $2, $3, now(), $4) RETURNING seq`,
      [
        randomUUID(),
        JSON.stringify({ kind: 'founder' }),
        JSON.stringify({ roleId: 'builder' }),
        JSON.stringify({ synthetic: true }),
      ],
    );
    return Number(rows[0]!.seq);
  }

  async function insertRow(state: string, enrolled: boolean, slot: number | null): Promise<void> {
    await harness!.pool.query(
      `INSERT INTO gateway_current_state
         (gateway_id, state, state_since, last_event_seq, is_currently_enrolled, enrollment_slot)
       VALUES ($1, $2, now(), $3, $4, $5)`,
      [randomUUID(), state, await referenceSeq(), enrolled, slot],
    );
  }

  it('refuses a third enrolled row written past the code, in either slot', async () => {
    await enroll();
    await enroll();
    await assert.rejects(() => insertRow('enrolled', true, 1), /gateway_current_state_one_gateway_per_slot/);
    await assert.rejects(() => insertRow('enrolled', true, 2), /gateway_current_state_one_gateway_per_slot/);
    assert.equal(await enrolledCount(), 2);
    await assertConsistentAndClear();
  });

  it('admits only slots 1 and 2, a slot only on an enrolled row, and an enrolled row only with a slot', async () => {
    await assert.rejects(() => insertRow('enrolled', true, 3), /gateway_current_state_enrollment_slot_range/);
    await assert.rejects(() => insertRow('enrolled', true, null), /gateway_current_state_enrollment_slot_agrees/);
    await assert.rejects(() => insertRow('revoked', false, 1), /gateway_current_state_enrollment_slot_agrees/);
    assert.equal(await enrolledCount(), 0);
  });

  it('admits exactly the refusal vocabulary the code writes, plus the retired kind', async () => {
    const { rows } = await harness!.pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'gateway_enrollment_refusals_kind_check'`,
    );
    assert.equal(rows.length, 1);
    const admitted = [...rows[0]!.def.matchAll(/'([a-z_]+)'::text/g)].map((match) => match[1]).sort();
    assert.deepEqual(admitted, [...ENROLLMENT_REFUSAL_KINDS, ...RETIRED_ENROLLMENT_REFUSAL_KINDS].sort());
  });
});

describe('gateway-invariants · migration 0009 leaves every existing row valid', { skip: STORAGE_SKIP }, () => {
  it('gives the one gateway enrolled under the cap of one slot 1', async () => {
    /*
     * Its own instance: 0006 creates cluster-wide roles, which already exist
     * on the harness's instance, so a second database there cannot be
     * migrated from empty.
     */
    const bins = resolveServerBinaries();
    assert.ok(bins !== undefined, 'PostgreSQL server binaries are needed, as for the harness');
    const instance = await startOwnedInstance(bins);
    const pool = new PgPool({ connectionString: `postgresql://postgres@127.0.0.1:${instance.port}/postgres`, max: 2 });
    try {
      const through0008 = MIGRATIONS[MIGRATIONS.findIndex((m) => m.id === '0009_two_enrolled_gateways') - 1]!.id;
      assert.equal(through0008, '0008_runtime_operational_grants');
      await migrate(pool, { through: through0008 });

      // State as it stands in production under 0003: one enrolled, one revoked.
      const rows: { id: string; state: string; enrolled: boolean }[] = [
        { id: randomUUID(), state: 'enrolled', enrolled: true },
        { id: randomUUID(), state: 'revoked', enrolled: false },
      ];
      for (const row of rows) {
        const { rows: seq } = await pool.query<{ seq: string }>(
          `INSERT INTO gateway_registry_events (event_id, event_type, gateway_id, actor, attribution, occurred_at, payload)
           VALUES ($1, 'key_received', $2, $3, $4, now(), $5) RETURNING seq`,
          [randomUUID(), row.id, JSON.stringify({ kind: 'founder' }), JSON.stringify({ roleId: 'builder' }), '{}'],
        );
        await pool.query(
          `INSERT INTO gateway_current_state (gateway_id, state, state_since, last_event_seq, is_currently_enrolled)
           VALUES ($1, $2, now(), $3, $4)`,
          [row.id, row.state, seq[0]!.seq, row.enrolled],
        );
      }
      await pool.query(
        `INSERT INTO gateway_enrollment_refusals (kind, detail) VALUES ('another_gateway_enrolled', '{}')`,
      );

      const result = await migrate(pool);
      assert.deepEqual(result.applied, ['0009_two_enrolled_gateways']);

      const { rows: after } = await pool.query<{ gateway_id: string; enrollment_slot: number | null }>(
        'SELECT gateway_id, enrollment_slot FROM gateway_current_state',
      );
      const slots = new Map(after.map((row) => [row.gateway_id, row.enrollment_slot]));
      assert.equal(slots.get(rows[0]!.id), 1, 'the enrolled gateway holds slot 1');
      assert.equal(slots.get(rows[1]!.id), null, 'the revoked one holds none');
      const { rows: refusals } = await pool.query<{ count: string }>(
        "SELECT count(*) FROM gateway_enrollment_refusals WHERE kind = 'another_gateway_enrolled'",
      );
      assert.equal(Number(refusals[0]!.count), 1, 'a refusal written under the cap of one survives');
      const { rows: oldIndex } = await pool.query<{ t: string | null }>(
        `SELECT to_regclass('public.gateway_current_state_only_one_enrolled')::text AS t`,
      );
      assert.equal(oldIndex[0]!.t, null, 'the cap-of-one index is gone');
    } finally {
      await pool.end();
      destroyOwnedInstance(instance);
    }
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
    assert.equal(await enrolledCount(), 0, 'an expired identity never becomes enrolled');

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
