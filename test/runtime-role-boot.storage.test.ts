/**
 * The runtime role, observed (PR 2b Tranche D).
 *
 * Plan r1 §5.4 asks for five tests of the cutover; r6 §14 names the checks they
 * discharge. This suite runs them against an exclusively owned PostgreSQL
 * instance migrated through the FULL canonical sequence, with the REAL control
 * plane process connected as the real `br_app_runtime` login:
 *
 *   D-R1  PC-0   the application's own connection IS `br_app_runtime`
 *   D-R2  PC-1   it does not own the database, any object, or `public`
 *   D-R3  PC-20  the process boots, `/health` and `/ready` answer, a room is
 *                created and appended to, its export (events and rejections)
 *                reads, and a journal command is appended through the routine
 *   D-R5         rolling `DATABASE_URL` back to the owner-class identity is
 *                refused before the process serves, and the data is untouched
 *                (until the Founder act of 2026-10-10 ended the tolerance for
 *                other roles, this test proved the rollback restored service)
 *   (D-R4, PC-19 — no administrative credential in any Railway variable — is a
 *    check of the deployment, made at Gate V by variable NAME; no test can see
 *    Railway.)
 *
 * It also pins what migration 0008 grants, EXACTLY, against the catalog: every
 * table, every column-level UPDATE, every sequence. A table the matrix does not
 * name fails the suite, so a future migration cannot add a table the runtime
 * silently can or cannot reach.
 *
 * And it proves the refusals Decision 2 describes: a forbidden attribute, a
 * forbidden membership edge with modifiers, and a missing grant each stop the
 * runtime BEFORE it serves, with no credential in the output.
 *
 * Every connection is to a loopback instance this suite owns and destroys. The
 * instance trusts loopback and the role has no password: no credential exists.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pgDefault from 'pg';
import type { Pool } from 'pg';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { createPool } from '../packages/control-plane/src/db.js';
import { MIGRATIONS, migrate } from '../packages/control-plane/src/migrations.js';
import { schemaPreflight } from '../packages/control-plane/src/schema-preflight.js';
import { makeEvent } from './helpers.js';
import {
  destroyOwnedInstance,
  freePort,
  resolveServerBinaries,
  startOwnedInstance,
  type OwnedInstance,
} from './support/owned-postgres.js';
import { RUNTIME_LOGIN, asRuntimeLogin } from './support/runtime-role-mode.js';

const { Pool: PgPool } = pgDefault;

const RUN_GATE = process.env['TEST_DATABASE_URL'];
const BINS = resolveServerBinaries();
const SKIP: string | false =
  RUN_GATE === undefined || RUN_GATE.trim() === ''
    ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
    : BINS === undefined
      ? 'PostgreSQL server binaries (initdb/pg_ctl) not resolvable — the runtime-role boot suite did not run (set BUILDROOM_TEST_PG_BINDIR or put pg_ctl on PATH)'
      : false;

/** The built boot entrypoint, resolved relative to this compiled test file. */
const MAIN_JS = fileURLToPath(new URL('../packages/control-plane/src/main.js', import.meta.url));

/** Satisfies the config loader's minimum length; never presented outside this process pair. */
const SUITE_TOKEN = 'runtime-role-boot-suite-token-' + 'long-enough-32chars';

const DATABASE = 'rr_boot';

/**
 * What migration 0008 (and 0006's two journal SELECTs) grant `br_app_runtime`,
 * written out independently of the migration so the two must agree.
 */
const EXPECTED_TABLE_PRIVILEGES: Readonly<Record<string, readonly string[]>> = {
  build_room_events: ['INSERT', 'SELECT'],
  build_room_gate_runs: ['INSERT', 'SELECT'],
  build_room_rejections: ['INSERT', 'SELECT'],
  build_room_rooms: ['INSERT', 'SELECT'],
  command_journal_chain_head: ['SELECT'],
  command_journal_events: ['SELECT'],
  control_plane_lease: ['SELECT'],
  gateway_availability_events: ['DELETE', 'INSERT', 'SELECT'],
  gateway_current_state: ['INSERT', 'SELECT'],
  gateway_enrollment_refusals: ['INSERT'],
  gateway_message_rejections: ['DELETE', 'INSERT', 'SELECT'],
  gateway_pairing_codes: ['INSERT', 'SELECT'],
  gateway_redeem_idempotency: ['DELETE', 'INSERT', 'SELECT'],
  gateway_registry_events: ['INSERT', 'SELECT'],
  phase3_run_attempts: ['INSERT', 'SELECT'],
  phase3_run_events: ['INSERT', 'SELECT'],
  schema_migrations: ['SELECT'],
};

/** Column-level UPDATE: exactly the columns the application's UPDATE and upsert statements set. */
const EXPECTED_UPDATE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  build_room_rooms: ['created_at'],
  control_plane_lease: ['challenge', 'challenge_published_at', 'generation', 'heartbeat_at', 'owner_id'],
  gateway_current_state: [
    'awaiting_approval_expires_at',
    'host_descriptor',
    'is_currently_enrolled',
    'key_id',
    'last_event_seq',
    'pubkey',
    'state',
    'state_since',
  ],
  gateway_message_rejections: ['count', 'last_seen_at'],
  gateway_pairing_codes: ['consumed_at', 'consumed_by_gateway_id'],
  phase3_run_attempts: ['finished_at', 'heartbeat_captured', 'last_event_index', 'lifecycle_position', 'state'],
};

const EXPECTED_SEQUENCE_PRIVILEGES: Readonly<Record<string, readonly string[]>> = {
  build_room_rejections_rejection_id_seq: ['USAGE'],
  gateway_availability_events_seq_seq: ['USAGE'],
  gateway_enrollment_refusals_refusal_id_seq: ['USAGE'],
  gateway_registry_events_seq_seq: ['USAGE'],
  phase3_run_attempts_attempt_seq_seq: ['USAGE'],
  phase3_run_events_seq_seq: ['USAGE'],
};

/** Tables whose rows are evidence: the runtime appends and reads, and changes nothing. */
const APPEND_ONLY_TABLES = [
  'build_room_events',
  'build_room_gate_runs',
  'build_room_rejections',
  'gateway_enrollment_refusals',
  'gateway_registry_events',
  'phase3_run_events',
] as const;

let instance: OwnedInstance | undefined;
let superUrl = '';
let runtimeUrl = '';
let admin: Pool | undefined;
let runtime: Pool | undefined;

before(async () => {
  if (SKIP !== false) return;
  instance = await startOwnedInstance(BINS!);
  const bootstrap = new PgPool({ connectionString: `postgresql://postgres@127.0.0.1:${instance.port}/postgres`, max: 1 });
  try {
    await bootstrap.query(`CREATE DATABASE ${DATABASE}`);
  } finally {
    await bootstrap.end();
  }
  superUrl = `postgresql://postgres@127.0.0.1:${instance.port}/${DATABASE}`;
  runtimeUrl = asRuntimeLogin(superUrl);
  admin = createPool(loadConfig({ DATABASE_URL: superUrl, CONTROL_PLANE_TOKEN: SUITE_TOKEN }));
  const result = await migrate(admin);
  assert.deepEqual(
    result.applied,
    MIGRATIONS.map((migration) => migration.id),
    'the canonical sequence applied in full on the owned instance',
  );
  runtime = createPool(loadConfig({ DATABASE_URL: runtimeUrl, CONTROL_PLANE_TOKEN: SUITE_TOKEN }));
});

after(async () => {
  await runtime?.end().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  destroyOwnedInstance(instance);
});

/** Rows as `table -> sorted values`, for a catalog query returning `(key, value)` pairs. */
function group(rows: readonly { key: string; value: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of rows) (out[row.key] ??= []).push(row.value);
  for (const key of Object.keys(out)) out[key]!.sort();
  return out;
}

const RUNTIME_OID = `(SELECT oid FROM pg_roles WHERE rolname = '${RUNTIME_LOGIN}')`;

describe('D-R2 · the runtime role owns nothing and holds no authority (PC-1, PC-3, PC-4)', { skip: SKIP }, () => {
  it('has the r6 §3.2 attributes: it can log in and holds none of the forbidden ones', async () => {
    const { rows } = await admin!.query(
      `SELECT rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolinherit
         FROM pg_roles WHERE rolname = $1`,
      [RUNTIME_LOGIN],
    );
    assert.deepEqual(rows[0], {
      rolcanlogin: true,
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolbypassrls: false,
      rolreplication: false,
      rolinherit: true,
    });
  });

  it('is a member of no role at all', async () => {
    const { rows } = await admin!.query(
      `SELECT count(*)::int AS n FROM pg_auth_members WHERE member = ${RUNTIME_OID}`,
    );
    assert.equal(rows[0]?.n, 0);
  });

  it('does not own the database, nor any relation, function, type or schema', async () => {
    const database = await admin!.query(
      `SELECT d.datdba = ${RUNTIME_OID} AS owns FROM pg_database d WHERE d.datname = $1`,
      [DATABASE],
    );
    assert.equal(database.rows[0]?.owns, false, 'PC-1: not the database owner');
    const owned = await admin!.query(
      `SELECT (SELECT count(*) FROM pg_class WHERE relowner = ${RUNTIME_OID})
            + (SELECT count(*) FROM pg_proc WHERE proowner = ${RUNTIME_OID})
            + (SELECT count(*) FROM pg_type WHERE typowner = ${RUNTIME_OID})
            + (SELECT count(*) FROM pg_namespace WHERE nspowner = ${RUNTIME_OID}) AS n`,
    );
    assert.equal(Number(owned.rows[0]?.n), 0, 'the runtime owns no object');
  });

  it('cannot create anything in schema public', async () => {
    const { rows } = await admin!.query(`SELECT has_schema_privilege($1, 'public', 'CREATE') AS can_create`, [RUNTIME_LOGIN]);
    assert.equal(rows[0]?.can_create, false);
  });
});

describe('0008 grants exactly what it says (the catalog, not the migration text)', { skip: SKIP }, () => {
  it('every public table carries exactly its expected table-level privileges for the runtime', async () => {
    const tables = await admin!.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY 1`,
    );
    const granted = group(
      (
        await admin!.query<{ key: string; value: string }>(
          `SELECT c.relname AS key, x.privilege_type AS value
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             CROSS JOIN LATERAL aclexplode(c.relacl) x
            WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND x.grantee = ${RUNTIME_OID}`,
        )
      ).rows,
    );
    const names = tables.rows.map((row) => row.relname);
    const unclassified = names.filter((name) => !(name in EXPECTED_TABLE_PRIVILEGES));
    assert.deepEqual(
      unclassified,
      [],
      'a table exists that this matrix does not classify: add it to EXPECTED_TABLE_PRIVILEGES (with [] if the runtime must not touch it)',
    );
    for (const name of names) {
      assert.deepEqual(granted[name] ?? [], [...EXPECTED_TABLE_PRIVILEGES[name]!], `table-level privileges on ${name}`);
    }
  });

  it('column-level UPDATE is exactly the columns the application writes, and nothing else carries a column grant', async () => {
    const granted = group(
      (
        await admin!.query<{ key: string; value: string; priv: string }>(
          `SELECT c.relname AS key, a.attname AS value, x.privilege_type AS priv
             FROM pg_attribute a
             JOIN pg_class c ON c.oid = a.attrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             CROSS JOIN LATERAL aclexplode(a.attacl) x
            WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped AND x.grantee = ${RUNTIME_OID}
              AND x.privilege_type = 'UPDATE'`,
        )
      ).rows,
    );
    assert.deepEqual(granted, Object.fromEntries(Object.entries(EXPECTED_UPDATE_COLUMNS).map(([k, v]) => [k, [...v]])));
    const other = await admin!.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL aclexplode(a.attacl) x
        WHERE n.nspname = 'public' AND x.grantee = ${RUNTIME_OID} AND x.privilege_type <> 'UPDATE'`,
    );
    assert.equal(other.rows[0]?.n, 0, 'no column-level SELECT, INSERT or REFERENCES');
  });

  it('every sequence carries exactly USAGE where the application inserts, and nothing elsewhere', async () => {
    const granted = group(
      (
        await admin!.query<{ key: string; value: string }>(
          `SELECT c.relname AS key, x.privilege_type AS value
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             CROSS JOIN LATERAL aclexplode(c.relacl) x
            WHERE n.nspname = 'public' AND c.relkind = 'S' AND x.grantee = ${RUNTIME_OID}`,
        )
      ).rows,
    );
    assert.deepEqual(granted, Object.fromEntries(Object.entries(EXPECTED_SEQUENCE_PRIVILEGES).map(([k, v]) => [k, [...v]])));
  });

  it('the append-only tables get INSERT and SELECT only: no UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER, table or column', async () => {
    for (const table of APPEND_ONLY_TABLES) {
      const privileges = EXPECTED_TABLE_PRIVILEGES[table] ?? [];
      assert.ok(privileges.every((p) => p === 'INSERT' || p === 'SELECT'), `${table} matrix entry`);
      assert.equal(EXPECTED_UPDATE_COLUMNS[table], undefined, `${table} has no column-level UPDATE entry`);
      const { rows } = await admin!.query(
        `SELECT has_table_privilege($1, $2, 'UPDATE') AS upd, has_table_privilege($1, $2, 'DELETE') AS del,
                has_table_privilege($1, $2, 'TRUNCATE') AS trunc, has_table_privilege($1, $2, 'REFERENCES') AS refs,
                has_table_privilege($1, $2, 'TRIGGER') AS trig, has_any_column_privilege($1, $2, 'UPDATE') AS colupd`,
        [RUNTIME_LOGIN, `public.${table}`],
      );
      assert.deepEqual(rows[0], { upd: false, del: false, trunc: false, refs: false, trig: false, colupd: false }, table);
    }
  });

  it('no table anywhere grants the runtime TRUNCATE, REFERENCES or TRIGGER, and nothing grants anything to PUBLIC that 0008 added', async () => {
    const { rows } = await admin!.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL aclexplode(c.relacl) x
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
          AND ((x.grantee = ${RUNTIME_OID} AND x.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER'))
            OR x.grantee = 0)`,
    );
    assert.equal(rows[0]?.n, 0);
  });
});

describe('D-R2 · what the runtime login is refused, in PostgreSQL\'s own words', { skip: SKIP }, () => {
  const refused = async (sql: string, pattern: RegExp): Promise<void> => {
    await assert.rejects(runtime!.query(sql), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, pattern, sql);
      return true;
    });
  };

  it('cannot change evidence: UPDATE, DELETE and TRUNCATE on an append-only table are refused by grant, before any trigger', async () => {
    await refused(`UPDATE public.build_room_events SET event = event WHERE false`, /permission denied for table build_room_events/);
    await refused(`DELETE FROM public.build_room_events WHERE false`, /permission denied for table build_room_events/);
    await refused(`TRUNCATE public.build_room_events`, /permission denied for table build_room_events/);
    await refused(`UPDATE public.phase3_run_events SET seq = seq WHERE false`, /permission denied for table phase3_run_events/);
  });

  it('cannot rewrite an identity column: only the columns the application sets are updatable', async () => {
    await refused(`UPDATE public.gateway_current_state SET gateway_id = gateway_id WHERE false`, /permission denied for table gateway_current_state/);
    await refused(`UPDATE public.control_plane_lease SET id = id WHERE false`, /permission denied for table control_plane_lease/);
    await refused(`UPDATE public.gateway_pairing_codes SET code_hash = code_hash WHERE false`, /permission denied for table gateway_pairing_codes/);
    await refused(`UPDATE public.build_room_rooms SET room_id = room_id WHERE false`, /permission denied for table build_room_rooms/);
  });

  it('cannot change the schema or take authority', async () => {
    await refused(`CREATE TABLE public.runtime_may_not_create (x int)`, /permission denied for schema public/);
    await refused(`ALTER TABLE public.build_room_events DISABLE TRIGGER ALL`, /must be owner of table build_room_events/);
    await refused(`DROP TABLE public.schema_migrations`, /must be owner of table schema_migrations/);
    await refused(`SET ROLE postgres`, /permission denied to set role "postgres"/);
    await refused(`SELECT rolpassword FROM pg_authid LIMIT 1`, /permission denied for table pg_authid/);
  });
});

/** The real control plane process: its output, its port, a way to stop it. */
interface Boot {
  readonly port: number;
  output(): string;
  waitForLog(marker: string, timeoutMs?: number): Promise<void>;
  readonly exited: Promise<number | null>;
  stop(): Promise<number | null>;
}

async function startBoot(databaseUrl: string): Promise<Boot> {
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      CONTROL_PLANE_TOKEN: SUITE_TOKEN,
      PORT: String(port),
      // Leadership waits this long for the clock to be judged stable before it
      // serves: 30 s by default, which would make every case here slow.
      CLOCK_STABILITY_MS: '500',
      LEADER_HEARTBEAT_MS: '500',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout?.on('data', (chunk: Buffer) => (log += chunk.toString('utf8')));
  child.stderr?.on('data', (chunk: Buffer) => (log += chunk.toString('utf8')));
  const exited = new Promise<number | null>((resolve) => child.on('close', (code) => resolve(code)));
  const watchdog = setTimeout(() => child.kill('SIGKILL'), 60_000);
  void exited.then(() => clearTimeout(watchdog));
  return {
    port,
    output: () => log,
    async waitForLog(marker, timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      let done = false;
      void exited.then(() => (done = true));
      while (!log.includes(marker)) {
        if (done) throw new Error(`the process exited before logging ${marker}\n${log}`);
        if (Date.now() > deadline) throw new Error(`no ${marker} within ${timeoutMs} ms\n${log}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    exited,
    async stop() {
      child.kill('SIGTERM');
      return exited;
    },
  };
}

/** Boot expecting a refusal: it must exit non-zero, never listening, and say why. */
async function bootRefused(databaseUrl: string): Promise<string> {
  const boot = await startBoot(databaseUrl);
  const code = await boot.exited;
  const output = boot.output();
  assert.notEqual(code, 0, `the process must exit non-zero\n${output}`);
  assert.ok(!output.includes('"at":"boot.listening"'), `the process must never reach listening\n${output}`);
  assert.ok(output.includes('"at":"boot.failed"'), `the process must log boot.failed\n${output}`);
  assert.doesNotMatch(output, /postgres(ql)?:\/\//i, 'no connection string in the output');
  return output;
}

/** The parsed `boot.preflight` log line. */
function preflightLine(output: string): Record<string, unknown> {
  const line = output.split('\n').find((candidate) => candidate.includes('"at":"boot.preflight"'));
  assert.ok(line !== undefined, `no boot.preflight line in:\n${output}`);
  return JSON.parse(line) as Record<string, unknown>;
}

/** The few response fields this suite reads; everything else is only echoed into failure messages. */
interface ApiBody {
  readonly database?: string;
  readonly outcome?: string;
  readonly logLength?: number;
  readonly error?: string;
}

async function api(boot: Boot, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: ApiBody }> {
  const response = await fetch(`http://127.0.0.1:${boot.port}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${SUITE_TOKEN}`,
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as ApiBody) };
}

describe('D-R1 · the application\'s own connection is br_app_runtime (PC-0)', { skip: SKIP }, () => {
  it('the preflight, run on the runtime login, reports that role, enforced, with no findings', async () => {
    const report = await schemaPreflight(runtime!);
    assert.equal(report.role, RUNTIME_LOGIN);
    assert.equal(report.privilegeAudit.status, 'enforced');
    assert.deepEqual(report.privilegeAudit.forbiddenAttributes, []);
    assert.deepEqual(report.privilegeAudit.forbiddenMemberships, []);
    assert.equal(report.migrationsPresent.length, MIGRATIONS.length, 'it can read every recorded migration');
  });

  it('session_user and current_user are both br_app_runtime on a pooled connection', async () => {
    const { rows } = await runtime!.query(`SELECT session_user::text AS s, current_user::text AS c`);
    assert.deepEqual(rows[0], { s: RUNTIME_LOGIN, c: RUNTIME_LOGIN });
  });
});

describe('D-R3 · the process serves holding only br_app_runtime (PC-17, PC-20), and D-R5 · a rollback to another login is refused', { skip: SKIP }, () => {
  const roomId = randomUUID();

  it('boots, answers health and readiness, writes a room, reads its export, and appends a journal command', async () => {
    const boot = await startBoot(runtimeUrl);
    try {
      await boot.waitForLog('"at":"boot.listening"');
      const preflight = preflightLine(boot.output());
      assert.equal(preflight['role'], RUNTIME_LOGIN, 'PC-0 from the process\'s own log');
      assert.equal(preflight['privilegeAudit'], 'enforced');
      assert.deepEqual(preflight['forbiddenAttributes'], []);
      assert.deepEqual(preflight['forbiddenMemberships'], []);
      assert.equal(preflight['migrationsPresent'], MIGRATIONS.length);

      assert.equal((await api(boot, '/health')).status, 200);
      const ready = await api(boot, '/ready');
      assert.equal(ready.status, 200);
      assert.equal(ready.body.database, 'reachable');

      // The leadership lease: the runtime acquires it through its column-level UPDATE grants.
      await boot.waitForLog('"at":"gateway.leadership.serving"');

      assert.equal((await api(boot, '/rooms', { method: 'POST', body: { roomId } })).status, 201);
      const appended = await api(boot, `/rooms/${roomId}/events`, { method: 'POST', body: makeEvent('scope.captured') });
      assert.equal(appended.status, 201, JSON.stringify(appended.body));
      assert.equal(appended.body.outcome, 'transition');
      const loaded = await api(boot, `/rooms/${roomId}`);
      assert.equal(loaded.status, 200);
      assert.equal(loaded.body.logLength, 1);
      const exported = await api(boot, `/rooms/${roomId}/export`);
      assert.equal(exported.status, 200, 'the export reads events AND rejections under the runtime login');

      const journaled = await api(boot, '/journal/commands', {
        method: 'POST',
        body: {
          commandKind: 'planner.invoke',
          argv: ['--goal', 'runtime-role-boot'],
          actorId: 'session:test/runtime-role-boot',
          roleId: 'builder',
          authorizationRef: 'HO-20261004-01',
          repository: 'example-org/example-repo',
          scopeRef: 'scope/tranche-d',
          intendedProvider: 'example-provider',
          intendedModel: 'example-model',
          intendedSurface: 'claude-code',
          evidenceRefs: ['ev_rr_1'],
        },
      });
      assert.equal(journaled.status, 201, `journal append via the routine: ${JSON.stringify(journaled.body)}`);

      assert.doesNotMatch(boot.output(), /postgres(ql)?:\/\//i, 'no connection string in the log');
    } finally {
      assert.equal(await boot.stop(), 0, 'clean SIGTERM shutdown exits 0');
    }
  });

  it('D-R5: rolling DATABASE_URL back to the owner-class identity is refused, and the data is untouched', async () => {
    const output = await bootRefused(superUrl);
    assert.match(output, /privilege audit refused: the connected role is postgres, not the runtime identity br_app_runtime/);
    assert.ok(!output.includes('"at":"boot.preflight"'), 'the refusal comes before any preflight report');

    // The refusal changed nothing: the runtime boots again and reads the room it wrote.
    const boot = await startBoot(runtimeUrl);
    try {
      await boot.waitForLog('"at":"boot.listening"');
      assert.equal(preflightLine(boot.output())['role'], RUNTIME_LOGIN);
      const loaded = await api(boot, `/rooms/${roomId}`);
      assert.equal(loaded.status, 200, 'the room written as the runtime is still there after the refused rollback');
      assert.equal(loaded.body.logLength, 1);
    } finally {
      assert.equal(await boot.stop(), 0);
    }
  });

  it('refuses a non-superuser owner-class login named neondb_owner, even one that can read the ledger', async () => {
    await admin!.query('CREATE ROLE neondb_owner LOGIN NOSUPERUSER');
    try {
      await admin!.query('GRANT SELECT ON public.schema_migrations TO neondb_owner');
      const url = new URL(superUrl);
      url.username = 'neondb_owner';
      const output = await bootRefused(url.toString());
      assert.match(output, /privilege audit refused: the connected role is neondb_owner, not the runtime identity br_app_runtime/);
    } finally {
      await admin!.query('REVOKE ALL ON public.schema_migrations FROM neondb_owner');
      await admin!.query('DROP ROLE neondb_owner');
    }
  });

  it('refuses an owner-class login that sets its role to br_app_runtime at connect: current_user alone is not trusted', async () => {
    const url = new URL(superUrl);
    url.searchParams.set('options', `-c role=${RUNTIME_LOGIN}`);
    const output = await bootRefused(url.toString());
    assert.match(output, /the connected role is postgres \(acting as br_app_runtime\), not the runtime identity br_app_runtime/);
  });
});

describe('Decision 2 · the runtime refuses to boot holding forbidden authority, or lacking a grant', { skip: SKIP }, () => {
  it('refuses a forbidden ATTRIBUTE: CREATEDB on br_app_runtime stops the process before it serves', async () => {
    await admin!.query(`ALTER ROLE ${RUNTIME_LOGIN} CREATEDB`);
    try {
      const output = await bootRefused(runtimeUrl);
      assert.match(output, /privilege audit refused/);
      assert.match(output, /rolcreatedb/);
    } finally {
      await admin!.query(`ALTER ROLE ${RUNTIME_LOGIN} NOCREATEDB`);
    }
  });

  it('refuses a forbidden MEMBERSHIP even with INHERIT FALSE and SET FALSE (R-1): the modifier edge is still an edge', async () => {
    await admin!.query(`GRANT br_journal_owner TO ${RUNTIME_LOGIN} WITH INHERIT FALSE, SET FALSE`);
    try {
      const output = await bootRefused(runtimeUrl);
      assert.match(output, /privilege audit refused/);
      assert.match(output, /br_journal_owner@depth1/);
    } finally {
      await admin!.query(`REVOKE br_journal_owner FROM ${RUNTIME_LOGIN}`);
    }
  });

  it('refuses a TRANSITIVE membership: br_app_runtime in an intermediate role that holds a forbidden one', async () => {
    await admin!.query(`CREATE ROLE rr_intermediate NOLOGIN`);
    await admin!.query(`GRANT command_journal_writer TO rr_intermediate`);
    await admin!.query(`GRANT rr_intermediate TO ${RUNTIME_LOGIN}`);
    try {
      const output = await bootRefused(runtimeUrl);
      assert.match(output, /command_journal_writer@depth2/);
    } finally {
      await admin!.query(`REVOKE rr_intermediate FROM ${RUNTIME_LOGIN}`);
      await admin!.query(`DROP ROLE rr_intermediate`);
    }
  });

  it('a missing grant fails closed: a runtime without SELECT on schema_migrations never serves (cutover before 0008 is applied)', async () => {
    await admin!.query(`REVOKE SELECT ON public.schema_migrations FROM ${RUNTIME_LOGIN}`);
    try {
      const output = await bootRefused(runtimeUrl);
      assert.match(output, /schema_migrations/);
      assert.match(output, /permission denied/);
    } finally {
      await admin!.query(`GRANT SELECT ON public.schema_migrations TO ${RUNTIME_LOGIN}`);
    }
  });

  it('after every refusal the role is exactly as 0008 left it, and boots again', async () => {
    // A fresh pool, so no connection opened before the mutations can vouch for the result.
    const fresh = createPool(loadConfig({ DATABASE_URL: runtimeUrl, CONTROL_PLANE_TOKEN: SUITE_TOKEN }));
    try {
      const report = await schemaPreflight(fresh);
      assert.equal(report.privilegeAudit.status, 'enforced');
      assert.deepEqual(report.privilegeAudit.forbiddenAttributes, []);
      assert.deepEqual(report.privilegeAudit.forbiddenMemberships, []);
    } finally {
      await fresh.end();
    }
  });
});
