/**
 * The plan store (`packages/control-plane/src/plan-store.ts`, migration
 * `0010_plan_store`) over a genuine `br_app_runtime` LOGIN.
 *
 * FIXTURE: an exclusively owned disposable PostgreSQL instance
 * (`test/support/owned-postgres.ts`) with the full canonical migration
 * sequence applied. `TEST_DATABASE_URL` is only the storage-suite run gate.
 *
 * What is proven, in order: a ready plan commits with the T3 event its own
 * transaction wrote and reads back judged again, by event and by command; a
 * rolled-back transaction leaves neither; the store refuses a T3 event
 * another transaction committed, a different act, a different plan_hash, a
 * missing event and a client outside any transaction; it refuses a plan that
 * is not ready, fails its schema, has non-canonical scope or carries
 * credential-shaped text, before touching the table; one plan per planner
 * command and per T3 event, by constraint; the runtime holds SELECT and
 * INSERT and nothing else, and the table refuses UPDATE, DELETE and TRUNCATE
 * even from a superuser; and a stored document that no longer matches its
 * hash is an integrity finding on read, never a plan.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pgDefault from 'pg';
import type { Client as PgClient, Pool as PgPool, PoolClient } from 'pg';
import {
  destroyOwnedInstance,
  resolveServerBinaries,
  startOwnedInstance,
  type OwnedInstance,
} from './support/owned-postgres.js';
import { judgePlanDoc } from '../packages/control-plane/src/plan-doc.js';
import {
  PlanDuplicateError,
  PlanIntegrityError,
  PlanLifecycleReferenceError,
  PlanRefusedError,
  PlanStore,
  type PlanSubmission,
} from '../packages/control-plane/src/plan-store.js';

const { Client, Pool } = pgDefault;

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the plan-store suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

const DATABASE = 'br_plan_store';

let instance: OwnedInstance | undefined;
let admin: PgClient | undefined;
let runtimePool: PgPool | undefined;
let store: PlanStore | undefined;

before(async () => {
  if (SKIP_REASON !== false) return;
  instance = await startOwnedInstance(BINS!);
  const boot = new Client({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: 'postgres' });
  await boot.connect();
  await boot.query(`CREATE DATABASE ${DATABASE}`);
  await boot.end();
  admin = new Client({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: DATABASE });
  await admin.connect();
  const { migrate } = await import('../packages/control-plane/src/migrations.js');
  const migrator = new Pool({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: DATABASE, max: 1 });
  try {
    const result = await migrate(migrator);
    assert.equal(result.applied.at(-1), '0010_plan_store');
  } finally {
    await migrator.end();
  }
  const password = randomBytes(24).toString('base64url');
  await admin.query(`ALTER ROLE br_app_runtime PASSWORD '${password.replace(/'/g, "''")}'`);
  runtimePool = new Pool({ host: '127.0.0.1', port: instance.port, user: 'br_app_runtime', password, database: DATABASE, max: 4 });
  store = new PlanStore(runtimePool);
});

after(async () => {
  await runtimePool?.end().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  destroyOwnedInstance(instance);
});

/* ---------------- fixtures ---------------- */

const SHA40 = 'a'.repeat(40);
const SHA64 = 'b'.repeat(64);

function plan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 'plandoc/1',
    work_id: 'W-plan-store',
    objective: 'Add a health detail field.',
    terminal_status: 'PLAN_READY_FOR_FOUNDER_APPROVAL',
    controlling_inputs: [{ path: 'research/packet.md', sha256: SHA64 }],
    repository: 'example-org/example-repo',
    base_sha: SHA40,
    scope_paths: ['src/health.ts', 'test/health.test.ts'],
    current_state: 'Health answers status only.',
    constraints: 'No new dependency.',
    non_goals: 'No UI.',
    architecture_decision: 'Extend the existing handler.',
    alternatives_considered: 'A new route; rejected as wider.',
    components_and_boundaries: 'The health handler only.',
    interfaces_and_contracts: 'Response gains one field.',
    data_flow: 'Read uptime, return it.',
    trust_and_security_boundaries: 'Public route; no secrets.',
    migration_and_compatibility: 'Additive.',
    error_and_failure_behavior: 'Unchanged.',
    observability: 'None added.',
    test_strategy: 'One unit test.',
    rollback_plan: 'Revert the commit.',
    dependency_ordering: 'None.',
    acceptance_criteria: ['The field is present.'],
    implementation_sequence: ['Edit handler', 'Add test'],
    known_risks: [],
    unresolved_founder_decisions: [],
    plan_drift_stop_conditions: ['Base moved'],
    next_role: 'founder_approval',
    claims: { plan_approved: false, builder_authorized: false },
    ...overrides,
  };
}

function hashOf(document: unknown): string {
  const verdict = judgePlanDoc(document);
  assert.ok(verdict.ok, 'the fixture plan judges');
  return verdict.planHash;
}

async function newRoom(): Promise<string> {
  const roomId = randomUUID();
  await admin!.query('INSERT INTO build_room_rooms (room_id) VALUES ($1)', [roomId]);
  return roomId;
}

/** A committed T3-shaped transition row carrying `planHash` in its facts. */
async function insertT3(
  client: PgClient | PoolClient,
  roomId: string,
  seq: number,
  eventId: string,
  planHash: string,
  event = 'plan.submitted',
): Promise<void> {
  await client.query(
    `INSERT INTO build_room_events (
       room_id, seq, event_id, event, outcome, entry_seq, transition_id, guard_id,
       from_state, resulting_state, actor, attribution, scope, evidence, overlays, round, occurred_at, payload
     ) VALUES ($1, $2, $3, $4, 'transition', $6, 'T3', 'G3', 'PLANNING', 'PLAN_REVIEW',
               '{}', '{}', '{}', '[]', '{}', 0, now(), $5::jsonb)`,
    [roomId, seq, eventId, event, JSON.stringify({ facts: { planHash } }), seq],
  );
}

async function inRuntimeTransaction<T>(body: (client: PoolClient) => Promise<T>, finish: 'COMMIT' | 'ROLLBACK' = 'COMMIT'): Promise<T> {
  const client = await runtimePool!.connect();
  try {
    await client.query('BEGIN');
    const result = await body(client);
    await client.query(finish);
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function planRows(): Promise<number> {
  const { rows } = await admin!.query<{ n: number }>('SELECT count(*)::int AS n FROM build_room_plans');
  return rows[0]?.n ?? 0;
}

/* ---------------- the suite ---------------- */

describe('plan store — a plan commits with the T3 event that submitted it', { skip: SKIP_REASON }, () => {
  it('records a ready plan and reads it back, judged again, by event and by command', async () => {
    const roomId = await newRoom();
    const document = plan();
    const submission: PlanSubmission = { roomId, commandId: 'cmd_ps_ok', lifecycleEventId: 'evt_ps_ok', document };
    const stored = await inRuntimeTransaction(async (client) => {
      await insertT3(client, roomId, 1, 'evt_ps_ok', hashOf(document));
      return store!.inTransaction(client).recordPlan(submission);
    });
    assert.equal(stored.planHash, hashOf(document));
    const byEvent = await store!.planForEvent(roomId, 'evt_ps_ok');
    const byCommand = await store!.planForCommand('cmd_ps_ok');
    assert.deepEqual(byEvent?.document, document);
    assert.equal(byEvent?.planHash, stored.planHash);
    assert.equal(byCommand?.lifecycleEventId, 'evt_ps_ok');
    assert.equal(await store!.planForCommand('cmd_ps_none'), null);
    assert.equal(await store!.planForEvent(roomId, 'evt_ps_none'), null);
    assert.equal(await store!.planForEvent('not-a-room', 'evt_ps_ok'), null);
  });

  it('a rolled-back transaction leaves neither the T3 event nor the plan', async () => {
    const roomId = await newRoom();
    const before = await planRows();
    await inRuntimeTransaction(async (client) => {
      await insertT3(client, roomId, 1, 'evt_ps_rb', hashOf(plan()));
      await store!.inTransaction(client).recordPlan({ roomId, commandId: 'cmd_ps_rb', lifecycleEventId: 'evt_ps_rb', document: plan() });
    }, 'ROLLBACK');
    assert.equal(await planRows(), before);
    const { rows } = await admin!.query('SELECT 1 FROM build_room_events WHERE room_id = $1', [roomId]);
    assert.equal(rows.length, 0);
  });
});

describe('plan store — the T3 event must be this transaction’s, and must agree', { skip: SKIP_REASON }, () => {
  it('refuses a T3 event another transaction committed', async () => {
    const roomId = await newRoom();
    await insertT3(admin!, roomId, 1, 'evt_ps_foreign', hashOf(plan()));
    await inRuntimeTransaction(async (client) => {
      await assert.rejects(
        store!.inTransaction(client).recordPlan({ roomId, commandId: 'cmd_ps_foreign', lifecycleEventId: 'evt_ps_foreign', document: plan() }),
        (err: unknown) => err instanceof PlanLifecycleReferenceError && /not written by this transaction/.test(err.reason),
      );
    }, 'ROLLBACK');
  });

  it('refuses a missing event, a different act, and a different plan_hash', async () => {
    const roomId = await newRoom();
    await inRuntimeTransaction(async (client) => {
      const tx = store!.inTransaction(client);
      const submit = (eventId: string): Promise<unknown> =>
        tx.recordPlan({ roomId, commandId: `cmd_ps_${eventId}`, lifecycleEventId: eventId, document: plan() });
      await assert.rejects(submit('evt_ps_missing'), /no such lifecycle event/);
      await insertT3(client, roomId, 1, 'evt_ps_other_act', hashOf(plan()), 'plan.approved');
      await assert.rejects(submit('evt_ps_other_act'), /not a committed plan\.submitted transition/);
      await insertT3(client, roomId, 2, 'evt_ps_other_hash', 'c'.repeat(64));
      await assert.rejects(submit('evt_ps_other_hash'), /different plan_hash/);
    }, 'ROLLBACK');
  });

  it('refuses a client that is not inside a transaction', async () => {
    const roomId = await newRoom();
    const client = await runtimePool!.connect();
    try {
      await insertT3(client, roomId, 1, 'evt_ps_autocommit', hashOf(plan()));
      await assert.rejects(
        store!.inTransaction(client).recordPlan({ roomId, commandId: 'cmd_ps_autocommit', lifecycleEventId: 'evt_ps_autocommit', document: plan() }),
        /not written by this transaction/,
      );
    } finally {
      client.release();
    }
    assert.equal(await store!.planForCommand('cmd_ps_autocommit'), null);
  });
});

describe('plan store — only a ready, valid, credential-free plan is kept', { skip: SKIP_REASON }, () => {
  const token = `ghp_${'A1b2C3d4'.repeat(4)}`;
  const cases: ReadonlyArray<readonly [string, Record<string, unknown>, PlanRefusedError['kind']]> = [
    ['a blocked plan', plan({ terminal_status: 'BLOCKED_FOUNDER_DECISION' }), 'not_ready'],
    ['a plan that claims approval', plan({ claims: { plan_approved: true, builder_authorized: false } }), 'schema'],
    ['non-canonical scope paths', plan({ scope_paths: ['test/health.test.ts', 'src/health.ts'] }), 'scope'],
    ['credential-shaped text', plan({ constraints: `Use ${token} to push.` }), 'credential_material'],
  ];
  for (const [label, document, kind] of cases) {
    it(`refuses ${label} before reading the lifecycle event`, async () => {
      const roomId = await newRoom();
      await inRuntimeTransaction(async (client) => {
        await assert.rejects(
          store!.inTransaction(client).recordPlan({ roomId, commandId: 'cmd_ps_refused', lifecycleEventId: 'evt_none', document }),
          (err: unknown) => err instanceof PlanRefusedError && err.kind === kind && !err.message.includes(token),
        );
      }, 'ROLLBACK');
    });
  }

  it('refuses a malformed submission', async () => {
    await inRuntimeTransaction(async (client) => {
      const tx = store!.inTransaction(client);
      await assert.rejects(tx.recordPlan({ roomId: 'room-1', commandId: 'cmd_x', lifecycleEventId: 'e', document: plan() }), /roomId/);
      await assert.rejects(tx.recordPlan({ roomId: randomUUID(), commandId: 'run_x', lifecycleEventId: 'e', document: plan() }), /cmd_/);
    }, 'ROLLBACK');
  });
});

describe('plan store — one plan per command and per event; append-only; integrity on read', { skip: SKIP_REASON }, () => {
  it('a planner command has one plan, and a T3 event carries one', async () => {
    const roomId = await newRoom();
    const document = plan({ work_id: 'W-dup' });
    await inRuntimeTransaction(async (client) => {
      await insertT3(client, roomId, 1, 'evt_ps_dup_1', hashOf(document));
      await store!.inTransaction(client).recordPlan({ roomId, commandId: 'cmd_ps_dup', lifecycleEventId: 'evt_ps_dup_1', document });
    });
    await inRuntimeTransaction(async (client) => {
      await insertT3(client, roomId, 2, 'evt_ps_dup_2', hashOf(document));
      await assert.rejects(
        store!.inTransaction(client).recordPlan({ roomId, commandId: 'cmd_ps_dup', lifecycleEventId: 'evt_ps_dup_2', document }),
        (err: unknown) => err instanceof PlanDuplicateError && err.constraint === 'build_room_plans_pkey',
      );
    }, 'ROLLBACK');
    // The per-event constraint, reached directly: the store's own check would see a T3 from another transaction first.
    await assert.rejects(
      admin!.query(
        `INSERT INTO build_room_plans (command_id, room_id, lifecycle_event_id, plan_hash, schema_version, document)
         VALUES ('cmd_ps_dup_other', $1, 'evt_ps_dup_1', $2, 'plandoc/1', '{}')`,
        [roomId, hashOf(document)],
      ),
      (err: unknown) => (err as { constraint?: string }).constraint === 'build_room_plans_one_per_event',
    );
  });

  it('the runtime holds SELECT and INSERT only, and the table refuses UPDATE, DELETE and TRUNCATE from anyone', async () => {
    const { rows } = await admin!.query<Record<string, boolean>>(
      `SELECT ${['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
        .map((p) => `has_table_privilege('br_app_runtime', 'public.build_room_plans', '${p}') AS "${p}"`)
        .join(', ')}`,
    );
    assert.deepEqual(rows[0], { SELECT: true, INSERT: true, UPDATE: false, DELETE: false, TRUNCATE: false, REFERENCES: false, TRIGGER: false });
    for (const sql of ["UPDATE build_room_plans SET document = '{}'", 'DELETE FROM build_room_plans', 'TRUNCATE build_room_plans']) {
      await assert.rejects(admin!.query(sql), /build_room_plans is append-only/, sql);
    }
    await assert.rejects(runtimePool!.query("UPDATE build_room_plans SET document = '{}'"), (err: unknown) => (err as { code?: string }).code === '42501');
  });

  it('a stored document that no longer matches its hash is an integrity finding, never a plan', async () => {
    const original = await admin!.query<{ document: string }>("SELECT document FROM build_room_plans WHERE command_id = 'cmd_ps_ok'");
    const tampered = JSON.stringify({ ...JSON.parse(original.rows[0]!.document), objective: 'Something else entirely.' });
    await admin!.query('ALTER TABLE build_room_plans DISABLE TRIGGER build_room_plans_append_only');
    try {
      await admin!.query("UPDATE build_room_plans SET document = $1 WHERE command_id = 'cmd_ps_ok'", [tampered]);
      await assert.rejects(store!.planForCommand('cmd_ps_ok'), (err: unknown) =>
        err instanceof PlanIntegrityError && /does not match its document/.test(err.reason));
      await admin!.query("UPDATE build_room_plans SET document = 'not json' WHERE command_id = 'cmd_ps_ok'");
      await assert.rejects(store!.planForCommand('cmd_ps_ok'), /not JSON/);
    } finally {
      await admin!.query("UPDATE build_room_plans SET document = $1 WHERE command_id = 'cmd_ps_ok'", [original.rows[0]!.document]);
      await admin!.query('ALTER TABLE build_room_plans ENABLE TRIGGER build_room_plans_append_only');
    }
    assert.ok((await store!.planForCommand('cmd_ps_ok')) !== null, 'the restored row reads as a plan again');
  });
});
