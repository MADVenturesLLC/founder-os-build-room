/**
 * Migration 0011's applier loan and its recorded-row CHECK (review of Build
 * Room PR 165, finding 1), on exclusively owned clusters.
 *
 * 0011 alters `command_journal_events`, which belongs to br_journal_owner,
 * so an applier that does not hold that role's privileges is lent a
 * membership for the length of the migration's transaction and the loan is
 * taken back before COMMIT. What is proven here:
 *
 *   (a) an applier already a member of br_journal_owner through a grant of
 *       its own WITHOUT INHERIT is refused with 0011's own exception before
 *       any DDL: 0011 is not recorded, every constraint and index it would
 *       change is as before, and the membership is exactly as before;
 *   (b) an applier already a member WITH INHERIT, whose session carries
 *       `build_room.migration_0011_lent = 'yes'` at session level before the
 *       apply, applies 0011 and keeps its membership exactly as it was: the
 *       return of the loan reads only what 0011's own transaction did;
 *   (c) the recorded-row CHECK 0011 installs never evaluates to NULL and
 *       admits only the exact binding shape: it refuses an
 *       `outcome = 'recorded'` row with a NULL from_state, a NULL
 *       resulting_state, a binding missing lifecycleRoomId, a binding with an
 *       extra key, and a binding that is not an object, and still admits a
 *       well-formed `runtime_room.bound` row.
 *
 * The applier is the shape `journal-migration-nonsuperuser.storage.test.ts`
 * gives a managed Postgres owner: NOSUPERUSER CREATEROLE CREATEDB, owner of
 * its database, PostgreSQL defaults. It applies the canonical sequence
 * through 0010 itself, so it owns the ledger tables and created the journal
 * roles; the membership each case needs is then granted by the applier to
 * itself, with the ADMIN OPTION PostgreSQL 16 gives a role's creator.
 *
 * FIXTURE: one exclusively owned disposable cluster per case
 * (`test/support/owned-postgres.ts`; 0006's roles are cluster-wide), each
 * destroyed when its case ends. `TEST_DATABASE_URL` is only the
 * storage-suite run gate; no shared instance is touched.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pgDefault from 'pg';
import type { Pool as PgPool } from 'pg';
import {
  destroyOwnedInstance,
  resolveServerBinaries,
  startOwnedInstance,
  type OwnedInstance,
} from './support/owned-postgres.js';
import { migrate } from '../packages/control-plane/src/migrations.js';

const { Pool } = pgDefault;

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the 0011 applier suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

const ADMIN = 'br_m11_admin';
const DATABASE = 'br_m11_target';
const ID_0011 = '0011_phase5_binding';
const THROUGH_0010 = '0010_plan_store';
const LENT = 'build_room.migration_0011_lent';

const owned: OwnedInstance[] = [];
const pools: PgPool[] = [];
after(async () => {
  for (const pool of pools.splice(0)) await pool.end().catch(() => undefined);
  for (const instance of owned.splice(0)) destroyOwnedInstance(instance);
});

interface Cluster {
  readonly instance: OwnedInstance;
  /** The bootstrap superuser, on the target database: reads catalogs and writes fixture rows. */
  readonly su: PgPool;
  /** A pool for the applier, optionally with session-level startup settings. */
  applier(options?: string): PgPool;
}

/** A fresh cluster whose plain administrative login has applied everything before 0011. */
async function clusterBefore0011(): Promise<Cluster> {
  const instance = await startOwnedInstance(BINS!);
  owned.push(instance);
  const pool = (user: string, database: string, options?: string): PgPool => {
    const created = new Pool({ host: '127.0.0.1', port: instance.port, user, database, max: 1, ...(options === undefined ? {} : { options }) });
    pools.push(created);
    return created;
  };
  const boot = pool('postgres', 'postgres');
  await boot.query(`CREATE ROLE ${ADMIN} LOGIN NOSUPERUSER CREATEROLE CREATEDB NOBYPASSRLS NOREPLICATION`);
  await boot.query(`CREATE DATABASE ${DATABASE} OWNER ${ADMIN}`);
  const setup = pool(ADMIN, DATABASE);
  const result = await migrate(setup, { through: THROUGH_0010 });
  assert.equal(result.applied.at(-1), THROUGH_0010);
  const shape = await setup.query<{ superuser: boolean }>(
    'SELECT rolsuper AS superuser FROM pg_catalog.pg_roles WHERE rolname = session_user',
  );
  assert.equal(shape.rows[0]?.superuser, false, 'the applier is not a superuser');
  return { instance, su: pool('postgres', DATABASE), applier: (options) => pool(ADMIN, DATABASE, options) };
}

interface Membership {
  readonly grantor: string;
  readonly admin_option: boolean;
  readonly inherit_option: boolean;
  readonly set_option: boolean;
}

/** The applier's memberships in br_journal_owner, one row per grantor, as the catalog holds them. */
async function memberships(su: PgPool): Promise<Membership[]> {
  const { rows } = await su.query<Membership>(
    `SELECT grantor::regrole::text AS grantor, admin_option, inherit_option, set_option
       FROM pg_catalog.pg_auth_members
      WHERE roleid = 'br_journal_owner'::regrole AND member = $1::regrole
      ORDER BY 1`,
    [ADMIN],
  );
  return rows;
}

async function privileges(su: PgPool): Promise<{ member: boolean; usage: boolean }> {
  const { rows } = await su.query<{ member: boolean; usage: boolean }>(
    `SELECT pg_catalog.pg_has_role($1, 'br_journal_owner', 'MEMBER') AS member,
            pg_catalog.pg_has_role($1, 'br_journal_owner', 'USAGE') AS usage`,
    [ADMIN],
  );
  return rows[0]!;
}

/** Every constraint and index 0011 replaces or adds, by name, with its definition. */
async function schemaOf0011(su: PgPool): Promise<Record<string, string | null>> {
  const { rows } = await su.query<{ name: string; definition: string }>(
    `SELECT conname AS name, pg_catalog.pg_get_constraintdef(oid) AS definition
       FROM pg_catalog.pg_constraint
      WHERE conname IN ('command_journal_events_record_class_known', 'command_journal_events_event_type_known',
                        'command_journal_events_command_id_namespace', 'build_room_events_outcome_known',
                        'build_room_events_transition_complete')
     UNION ALL
     SELECT indexname, indexdef FROM pg_catalog.pg_indexes
      WHERE indexname IN ('build_room_events_one_binding_per_room', 'build_room_events_runtime_room_bound_once')
     ORDER BY 1`,
  );
  return Object.fromEntries(rows.map((row) => [row.name, row.definition]));
}

async function recordedMigrations(su: PgPool): Promise<string[]> {
  const { rows } = await su.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id');
  return rows.map((row) => row.id);
}

describe('migration 0011 — the applier loan (review finding 1)', { skip: SKIP_REASON }, () => {
  it('(a) refuses an applier that is a member of br_journal_owner without INHERIT, changing nothing', async () => {
    const cluster = await clusterBefore0011();
    const applier = cluster.applier();
    await applier.query(`GRANT br_journal_owner TO ${ADMIN} WITH INHERIT FALSE`);
    assert.deepEqual(await privileges(cluster.su), { member: true, usage: false }, 'a member without the owner\'s privileges');
    const membershipsBefore = await memberships(cluster.su);
    assert.ok(
      membershipsBefore.some((row) => row.grantor === ADMIN && !row.inherit_option),
      'the applier\'s own grant, without INHERIT',
    );
    const schemaBefore = await schemaOf0011(cluster.su);
    assert.equal(schemaBefore['build_room_events_one_binding_per_room'], undefined, 'before 0011: no binding index');

    await assert.rejects(migrate(applier), (error: unknown) => {
      const { code, message } = error as { code?: string; message?: string };
      return code === 'P0001' && /^0011_phase5_binding: the applier cannot use br_journal_owner's privileges even after the loan/.test(message ?? '');
    });

    const recorded = await recordedMigrations(cluster.su);
    assert.ok(recorded.includes(THROUGH_0010));
    assert.equal(recorded.includes(ID_0011), false, '0011 is not recorded');
    assert.deepEqual(await schemaOf0011(cluster.su), schemaBefore, 'every constraint and index 0011 touches is unchanged');
    assert.deepEqual(await memberships(cluster.su), membershipsBefore, 'the membership is exactly as before');
    assert.deepEqual(await privileges(cluster.su), { member: true, usage: false });
  });

  it('(b) keeps an existing INHERIT membership when the session already says a loan happened', async () => {
    const cluster = await clusterBefore0011();
    await cluster.applier().query(`GRANT br_journal_owner TO ${ADMIN} WITH INHERIT TRUE`);
    assert.deepEqual(await privileges(cluster.su), { member: true, usage: true });
    const membershipsBefore = await memberships(cluster.su);
    assert.ok(membershipsBefore.some((row) => row.grantor === ADMIN && row.inherit_option), 'the applier\'s own grant, with INHERIT');

    // The marker set at session level, before the apply, on the very connection migrate uses.
    const applier = cluster.applier(`-c ${LENT}=yes`);
    const shown = await applier.query<{ value: string }>(`SELECT pg_catalog.current_setting('${LENT}') AS value`);
    assert.equal(shown.rows[0]?.value, 'yes');

    const result = await migrate(applier);
    assert.deepEqual(result.applied, [ID_0011]);
    assert.ok((await recordedMigrations(cluster.su)).includes(ID_0011));
    assert.deepEqual(await memberships(cluster.su), membershipsBefore, 'the membership still exists, exactly as before');
    assert.deepEqual(await privileges(cluster.su), { member: true, usage: true });
    const after = await applier.query<{ value: string }>(`SELECT pg_catalog.current_setting('${LENT}') AS value`);
    assert.equal(after.rows[0]?.value, 'yes', '0011 set its marker for its own transaction only');
  });
});

describe('migration 0011 — the recorded-row CHECK never evaluates to NULL (review finding 1)', { skip: SKIP_REASON }, () => {
  it('(c) refuses a recorded row with a missing state or an inexact binding, and admits a well-formed runtime_room.bound row', async () => {
    const cluster = await clusterBefore0011();
    const { su } = cluster;
    // The CHECK, not the applier, is under test here: 0011 is applied by the
    // bootstrap superuser, whose privileges 0011's loan never needs to touch.
    assert.deepEqual((await migrate(su)).applied, [ID_0011]);
    assert.ok((await recordedMigrations(su)).includes(ID_0011));

    interface RecordedRow {
      fromState: string | null;
      resultingState: string | null;
      binding: (roomId: string) => unknown;
    }
    const wellFormed: RecordedRow = {
      fromState: 'BUILDING',
      resultingState: 'BUILDING',
      binding: (roomId) => ({ lifecycleRoomId: roomId, runtimeRoomId: `room-${randomUUID()}`, gatewayId: randomUUID() }),
    };
    /** Insert one recorded row into a room of its own, as the store's insert writes it. */
    const insert = async (row: RecordedRow): Promise<void> => {
      const roomId = randomUUID();
      await su.query('INSERT INTO build_room_rooms (room_id) VALUES ($1)', [roomId]);
      const binding = row.binding(roomId);
      const payload = {
        eventId: `evt-${randomUUID()}`,
        event: 'runtime_room.bound',
        actor: 'system',
        ...(binding === undefined ? {} : { binding }),
      };
      await su.query(
        `INSERT INTO build_room_events (
           room_id, seq, event_id, event, outcome, entry_seq, transition_id, guard_id,
           from_state, resulting_state, actor, attribution, scope, evidence, overlays, round, occurred_at, payload
         ) VALUES ($1, 1, $2, 'runtime_room.bound', 'recorded', NULL, NULL, NULL, $3, $4,
                   '"system"', '{}', '{}', '[]', '{}', 0, now(), $5)`,
        [roomId, payload.eventId, row.fromState, row.resultingState, JSON.stringify(payload)],
      );
    };
    const refusedByCheck = (error: unknown): boolean => {
      const { code, constraint } = error as { code?: string; constraint?: string };
      return code === '23514' && constraint === 'build_room_events_transition_complete';
    };

    const refused: ReadonlyArray<readonly [string, RecordedRow]> = [
      ['a NULL from_state', { ...wellFormed, fromState: null }],
      ['a NULL resulting_state', { ...wellFormed, resultingState: null }],
      [
        'a binding missing lifecycleRoomId',
        { ...wellFormed, binding: () => ({ runtimeRoomId: `room-${randomUUID()}`, gatewayId: randomUUID() }) },
      ],
      [
        'a binding with an extra key',
        { ...wellFormed, binding: (roomId) => ({ ...(wellFormed.binding(roomId) as object), extra: 'x' }) },
      ],
      ['a binding that is a string', { ...wellFormed, binding: (roomId) => roomId }],
      ['a binding that is an array', { ...wellFormed, binding: (roomId) => [wellFormed.binding(roomId)] }],
      ['no binding at all', { ...wellFormed, binding: () => undefined }],
      [
        'a lifecycleRoomId that is not a string',
        { ...wellFormed, binding: () => ({ lifecycleRoomId: null, runtimeRoomId: `room-${randomUUID()}`, gatewayId: randomUUID() }) },
      ],
      [
        'a binding naming another lifecycle room',
        { ...wellFormed, binding: () => wellFormed.binding(randomUUID()) },
      ],
    ];
    const before = await su.query<{ n: number }>('SELECT count(*)::int AS n FROM build_room_events');
    for (const [label, row] of refused) {
      await assert.rejects(insert(row), refusedByCheck, label);
    }
    const unchanged = await su.query<{ n: number }>('SELECT count(*)::int AS n FROM build_room_events');
    assert.equal(unchanged.rows[0]?.n, before.rows[0]?.n, 'no refused row was written');

    await insert(wellFormed);
    const admitted = await su.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM build_room_events WHERE outcome = 'recorded' AND event = 'runtime_room.bound'`,
    );
    assert.equal(admitted.rows[0]?.n, 1, 'a well-formed runtime_room.bound row is admitted');
  });
});
