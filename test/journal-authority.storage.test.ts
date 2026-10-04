/**
 * B-T1 — journal authority and denial matrix (draft §6.3, §6.3.1; C-3 §5.2).
 *
 * Every denial and positive row executes over a connection whose
 * `session_user` is `br_app_runtime` (§8.3 — a genuine LOGIN over TCP with a
 * per-run ephemeral scram password; SET ROLE from superuser is NOT an
 * acceptable substitute and is never used for the matrix), and records
 * LITERAL PostgreSQL output, not prose. Catalog rows are identity-independent
 * and state which connection read them.
 *
 * FIXTURE (Option B): dedicated, exclusively owned disposable PostgreSQL
 * instance (initdb + pg_ctl into an OS-temp cluster root), full canonical
 * migration sequence through 0006 applied by the administrative identity
 * (ruling §3), destroyed at teardown. TEST_DATABASE_URL is the storage-suite
 * run gate only; this suite never connects to the shared instance.
 *
 * FD-B2(a) B-R8 positive detection controls: ONE uniquely named ephemeral
 * NOLOGIN probe role (no password, no administrative attributes, never a
 * production role name) exercises four sequential membership variants
 * (plain / INHERIT FALSE / SET FALSE / both false) plus a no-membership
 * control against the fixture-created command_journal_writer, using the
 * IDENTICAL recursive detection query parameterized by probe identity,
 * asserting the stored inherit_option/set_option values, detection, and
 * post-revoke absence per case. Probe memberships are revoked BEFORE the
 * probe role is dropped; probe and fixture roles are asserted absent from
 * pg_roles before instance destruction. The real-runtime assertion is
 * maintained separately and is not replaced by the probe.
 *
 * Credential handling (§7.3.3): the runtime password is generated in process
 * memory (randomBytes), set via the single authorized ALTER ROLE, passed only
 * through the pg client config (never argv, evidence, logs, or files).
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { realpathSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import pgDefault from 'pg';
import { REVOKE_RUNTIME_GRANTS_SQL } from './support/runtime-role-cleanup.js';
import type { Client as PgClient, QueryResult } from 'pg';
import {
  GENESIS_CHAIN_HASH,
  chainHash,
  encodeCommandEventRow,
  envelopeDigest,
  type CommandEventRow,
} from '../packages/journal/src/index.js';

const { Client } = pgDefault;

const TRANCHE_ORDER = [
  '0001_ledger_core',
  '0002_pending_rows_carry_no_transition_fields',
  '0003_gateway_registry',
  '0004_validate_pending_is_bare',
  '0005_phase3_run_evidence',
  '0006_command_journal_authority_split',
  '0007_gate_runs',
  '0008_runtime_operational_grants',
] as const;

const APPEND_SIGNATURE = '(text,text,text,bigint,bytea)';
const FORBIDDEN_TARGETS = [
  'br_journal_owner',
  'command_journal_writer',
  'neondb_owner',
  'neon_superuser',
] as const;

/* ---------------- dedicated disposable instance ---------------- */

interface ServerBins { readonly initdb: string; readonly pgCtl: string; }

function resolveServerBinaries(): ServerBins | undefined {
  const override = process.env['BUILDROOM_TEST_PG_BINDIR'];
  if (override !== undefined && override !== '') {
    const initdb = join(override, 'initdb');
    const pgCtl = join(override, 'pg_ctl');
    if (existsSync(initdb) && existsSync(pgCtl) && existsSync(join(override, 'postgres'))) {
      return { initdb, pgCtl };
    }
  }
  const pgConfig = spawnSync('pg_config', ['--bindir'], { timeout: 10_000, encoding: 'utf8' });
  if (pgConfig.status === 0 && pgConfig.stdout) {
    const dir = pgConfig.stdout.trim();
    if (existsSync(join(dir, 'initdb')) && existsSync(join(dir, 'pg_ctl')) && existsSync(join(dir, 'postgres'))) {
      return { initdb: join(dir, 'initdb'), pgCtl: join(dir, 'pg_ctl') };
    }
  }
  // PATH probe: initdb requires `postgres` in ITS OWN directory, and a
  // client-only package (Homebrew libpq) can put initdb/pg_ctl on PATH from a
  // different directory than the server package's `postgres`. Resolve the
  // real directory of `pg_ctl` and require all three binaries co-located.
  const onPath = spawnSync('which', ['pg_ctl'], { timeout: 10_000, encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout !== undefined && onPath.stdout.trim() !== '') {
    const dir = dirname(realpathSync(onPath.stdout.trim()));
    if (existsSync(join(dir, 'initdb')) && existsSync(join(dir, 'pg_ctl')) && existsSync(join(dir, 'postgres'))) {
      return { initdb: join(dir, 'initdb'), pgCtl: join(dir, 'pg_ctl') };
    }
  }
  const multiarch = '/usr/lib/postgresql';
  if (existsSync(multiarch)) {
    for (const v of readdirSync(multiarch).sort().reverse()) {
      const dir = join(multiarch, v, 'bin');
      if (existsSync(join(dir, 'initdb')) && existsSync(join(dir, 'pg_ctl')) && existsSync(join(dir, 'postgres'))) {
        return { initdb: join(dir, 'initdb'), pgCtl: join(dir, 'pg_ctl') };
      }
    }
  }
  return undefined;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => {
        if (typeof addr === 'object' && addr !== null) resolve(addr.port);
        else reject(new Error('no port'));
      });
    });
  });
}

interface OwnedInstance {
  readonly rootDir: string;
  readonly clusterDir: string;
  readonly socketDir: string;
  readonly pgCtl: string;
  readonly port: number;
  readonly database: string;
  /**
   * True only after `pg_ctl start -w` returned 0. A never-started cluster has
   * no postmaster to stop; destruction then removes the directory only.
   */
  started: boolean;
}

/**
 * Owned-fixture lifecycle: the instance record is created and returned to
 * the caller's ownership slot BEFORE initdb/start run (via `register`), so a
 * failure at any later step — initdb, start, migration, credential setup —
 * still has a handle to destroy. On initdb/start failure this function
 * destroys the never-started cluster itself before rethrowing, because a
 * failing `before()` hook does not get an `after()`.
 */
async function startOwnedInstance(
  bins: ServerBins,
  tag: string,
  database: string,
  register: (instance: OwnedInstance) => void,
  extraServerOptions = '',
): Promise<OwnedInstance> {
  const port = await freePort();
  // Short prefix: the socket path must stay under sun_path (103 bytes on
  // macOS) even under a long per-user TMPDIR.
  const rootDir = mkdtempSync(join(tmpdir(), tag));
  const clusterDir = join(rootDir, 'cluster');
  const socketDir = join(rootDir, 'sock');
  const instance: OwnedInstance = { rootDir, clusterDir, socketDir, pgCtl: bins.pgCtl, port, database, started: false };
  register(instance);
  try {
    const init = spawnSync(
      bins.initdb,
      ['-D', clusterDir, '-U', 'postgres', '--auth-local=trust', '--auth-host=scram-sha-256', '--no-sync'],
      { timeout: 120_000, encoding: 'utf8' },
    );
    assert.equal(init.status, 0, `initdb failed:\n${String(init.stdout)}\n${String(init.stderr)}`);
    mkdirSync(socketDir, { recursive: true });
    const start = spawnSync(
      bins.pgCtl,
      ['-D', clusterDir, '-l', join(rootDir, 'server.log'), 'start', '-w', '-t', '60',
       '-o', `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${socketDir} -c fsync=off ${extraServerOptions}`.trim()],
      { timeout: 120_000, encoding: 'utf8' },
    );
    assert.equal(start.status, 0, `pg_ctl start failed:\n${String(start.stdout)}\n${String(start.stderr)}`);
    instance.started = true;
    return instance;
  } catch (error) {
    destroyOwnedInstance(instance);
    throw error;
  }
}

/**
 * Stop the postmaster only if one was started; then remove the directory.
 * Destruction after a failed setup CONTAINS the fixture — it is never
 * evidence of successful qualification.
 */
function destroyOwnedInstance(instance: OwnedInstance | undefined): void {
  if (instance === undefined) return;
  if (instance.started) {
    spawnSync(instance.pgCtl, ['-D', instance.clusterDir, 'stop', '-m', 'immediate', '-w'], { timeout: 60_000 });
    instance.started = false;
  }
  rmSync(instance.rootDir, { recursive: true, force: true });
}

function superClient(instance: OwnedInstance, database = 'postgres'): PgClient {
  return new Client({ host: instance.socketDir, port: instance.port, user: 'postgres', database });
}

/* ---------------- shared matrix helpers ---------------- */

/**
 * The IDENTICAL recursive detection query used for the real runtime walk and
 * every probe control, parameterized by the walked identity (FD-B2(a): "Use
 * the identical recursive detection query parameterized by probe identity").
 * The depth guard is a resource bound that LOUDLY marks truncation — never a
 * silent cap (F1 correction discipline).
 */
const DETECTION_QUERY = `
WITH RECURSIVE edges AS (
  SELECT m.member, m.roleid, 1 AS depth
    FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.member
   WHERE r.rolname = $1
  UNION ALL
  SELECT m.member, m.roleid, e.depth + 1
    FROM pg_auth_members m
    JOIN edges e ON e.roleid = m.member
   WHERE e.depth < 100
),
guard AS (
  SELECT count(*) > 0 AS truncated FROM edges WHERE depth >= 100
)
SELECT gr.rolname AS reached, min(e.depth)::int AS depth, bool_or(g.truncated) AS truncated
  FROM edges e
  JOIN pg_roles gr ON gr.oid = e.roleid
  CROSS JOIN guard g
 GROUP BY gr.rolname`;

interface DetectionRow { readonly reached: string; readonly depth: number; readonly truncated: boolean; }

async function detect(c: PgClient, identity: string): Promise<DetectionRow[]> {
  const res = await c.query<DetectionRow>(DETECTION_QUERY, [identity]);
  assert.ok(
    !res.rows.some((r) => r.truncated),
    'the detection walk reached its cycle guard — it cannot prove absence',
  );
  return res.rows;
}

function canonicalJournaled(seq: string, commandId: string, second: number): { bytes: Uint8Array; expectedHash: (prior: string) => string } {
  const envelope = {
    envelopeVersion: '1',
    commandKind: 'test.authority',
    argv: ['--case', commandId],
    targetRepository: 'example-org/example-repo',
    scopeRef: 'scope_b_t1',
  };
  const row: CommandEventRow = {
    seq,
    eventType: 'journaled',
    commandId,
    actorId: 'agent.test',
    roleId: 'tester',
    repository: 'example-org/example-repo',
    scopeRef: 'scope_b_t1',
    commandEnvelope: envelope,
    envelopeDigest: envelopeDigest(envelope),
    authorizationRef: 'auth_b_t1',
    intendedProvider: 'p',
    intendedModel: 'm',
    intendedSurface: 's',
    evidenceRefs: [],
    recordedAt: `2026-09-14T13:00:${String(second).padStart(2, '0')}.000000Z`,
  };
  const bytes = encodeCommandEventRow(row);
  return { bytes, expectedHash: (prior: string) => chainHash(prior, bytes) };
}

/* ---------------- suite state ---------------- */

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the journal-authority suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

let instance: OwnedInstance | undefined;
let admin: PgClient | undefined;
let rt: PgClient | undefined;
let runtimePassword = '';
let probeName = '';
let appendSeq = 0;

async function appendAsRuntime(commandId: string): Promise<{ seq: string; chainHash: string }> {
  assert.ok(rt !== undefined);
  const head = await rt!.query<{ seq: string; chain_hash: string }>(
    'SELECT seq, chain_hash FROM public.command_journal_chain_head WHERE head_id = 1',
  );
  const nextSeq = String(Number(head.rows[0]?.seq ?? '0') + 1);
  const enc = canonicalJournaled(nextSeq, commandId, 10 + Number(nextSeq));
  const appended = await rt!.query<{ seq: string; chain_hash: string }>(
    'SELECT seq, chain_hash FROM public.command_journal_append($1, $2, $3, $4, $5)',
    ['command', commandId, 'journaled', nextSeq, Buffer.from(enc.bytes)],
  );
  const prior = head.rows[0]?.chain_hash ?? GENESIS_CHAIN_HASH;
  assert.equal(
    appended.rows[0]?.chain_hash,
    enc.expectedHash(prior),
    'the routine frames chain_hash exactly as packages/journal does (builtin sha256, prior-ascii || canonical bytes)',
  );
  appendSeq = Number(nextSeq);
  return { seq: appended.rows[0]?.seq ?? '', chainHash: appended.rows[0]?.chain_hash ?? '' };
}

before(async () => {
  if (SKIP_REASON !== false) return;
  // Ownership registered BEFORE startup: `instance` is set by the callback
  // before initdb runs, so any failure below (migration, credential setup,
  // the §8.3 gate) still reaches after()'s destroy.
  instance = await startOwnedInstance(BINS!, 'b-t1-', 'b_t1_authority', (owned) => { instance = owned; });
  const root = superClient(instance);
  await root.connect();
  await root.query(`CREATE DATABASE ${instance.database}`);
  await root.end();

  admin = superClient(instance, instance.database);
  await admin.connect();

  // The ACTUAL canonical migration path through 0006 (ruling §3).
  const { migrate } = await import('../packages/control-plane/src/migrations.js');
  const { Pool } = pgDefault;
  const pool = new Pool({
    host: instance.socketDir, port: instance.port, user: 'postgres',
    database: instance.database, max: 1,
  });
  try {
    const result = await migrate(pool);
    assert.deepEqual(result.applied, [...TRANCHE_ORDER], 'canonical sequence through 0006 applied');
  } finally {
    await pool.end();
  }

  // §7.3 item 3 + §7.3.3: the single authorized ALTER ROLE — per-run
  // ephemeral password, in process memory only.
  runtimePassword = randomBytes(24).toString('base64url');
  await admin.query(`ALTER ROLE br_app_runtime PASSWORD '${runtimePassword.replace(/'/g, "''")}'`);

  rt = new Client({
    host: '127.0.0.1', port: instance.port, user: 'br_app_runtime',
    password: runtimePassword, database: instance.database,
  });
  await rt.connect();

  // §8.3 gate: the matrix connection's session_user IS br_app_runtime.
  const who = await rt.query<{ session_user: string; current_user: string }>(
    'SELECT session_user, current_user',
  );
  assert.equal(who.rows[0]?.session_user, 'br_app_runtime', 'session_user must be br_app_runtime (§8.3)');
  assert.equal(who.rows[0]?.current_user, 'br_app_runtime');

  // §6.3.1 probe role: uniquely named, ephemeral, NOLOGIN, no password, no
  // administrative attributes, never a production role name.
  probeName = `b_r8_probe_${randomBytes(6).toString('hex')}`;
  await admin.query(
    `CREATE ROLE ${probeName} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`,
  );
});

after(async () => {
  try {
    if (admin !== undefined) {
      // FD-B2(a) same-run removal: probe memberships were revoked per case;
      // assert then drop the probe, then enumerated fixture objects/roles,
      // then pg_roles absence for EVERY fixture role and the probe.
      const probeEdges = await admin.query(
        'SELECT count(*)::int AS n FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = $1',
        [probeName],
      );
      assert.equal(probeEdges.rows[0]?.n, 0, 'all probe memberships must be revoked before teardown');
      await admin.query(`DROP ROLE IF EXISTS ${probeName}`);
      await admin.query('DROP TABLE IF EXISTS public.command_journal_events, public.command_journal_chain_head CASCADE');
      await admin.query(`DROP FUNCTION IF EXISTS public.command_journal_append${APPEND_SIGNATURE}`);
      await admin.query('DROP FUNCTION IF EXISTS public.command_journal_immutable()');
      // 0008's grants on the ordinary tables would block the role drop; see the helper.
      await admin.query(REVOKE_RUNTIME_GRANTS_SQL);
      await admin.query('DROP ROLE IF EXISTS br_app_runtime');
      await admin.query('DROP ROLE IF EXISTS command_journal_writer');
      await admin.query('DROP ROLE IF EXISTS br_journal_owner');
      const absent = await admin.query(
        `SELECT rolname FROM pg_roles
          WHERE rolname IN ('br_journal_owner','command_journal_writer','br_app_runtime', $1)`,
        [probeName],
      );
      assert.deepEqual(absent.rows, [], 'every fixture role and the probe role must be absent from pg_roles');
    }
  } finally {
    await rt?.end().catch(() => undefined);
    await admin?.end().catch(() => undefined);
    rt = undefined;
    admin = undefined;
    destroyOwnedInstance(instance);
    instance = undefined;
  }
});

describe('B-T1 — genesis and matrix connection gate (§8.3)', { skip: SKIP_REASON }, () => {
  it('owned-fixture lifecycle: a cluster whose startup fails is destroyed with no directory or process residue (never counted as qualification)', async (t) => {
    // Startup-failure control: an invalid server option makes postgres exit
    // before listening. Ownership is registered before startup, the failure
    // propagates as the literal assertion, and the never-started cluster is
    // removed — proving the cleanup path is exercised, not assumed.
    let leaked: OwnedInstance | undefined;
    const failure = await startOwnedInstance(
      BINS!, 'b-t1-fail-', 'never_created',
      (owned) => { leaked = owned; },
      '-c this_parameter_does_not_exist=1',
    ).then(() => undefined, (e: unknown) => e as Error);
    assert.ok(failure instanceof Error, 'startup must fail for the control');
    assert.match(failure.message, /pg_ctl start failed/, 'the literal failure reason is surfaced');
    assert.ok(leaked !== undefined, 'ownership was registered before startup');
    assert.equal(leaked!.started, false, 'a never-started cluster is recorded as such');
    assert.equal(existsSync(leaked!.rootDir), false, 'no owned directory residue after a failed start');
    const stillRunning = spawnSync('pgrep', ['-f', leaked!.clusterDir], { encoding: 'utf8' });
    assert.notEqual(stillRunning.status, 0, `no postgres process bound to the failed cluster; pgrep: ${stillRunning.stdout}`);
    t.diagnostic(`startup-failure control: dir=${leaked!.rootDir} removed=true process=none`);
  });

  it('the matrix connection is a genuine br_app_runtime LOGIN (session_user asserted)', async () => {
    assert.ok(rt !== undefined);
    const who = await rt!.query<{ u: string }>('SELECT session_user AS u');
    assert.equal(who.rows[0]?.u, 'br_app_runtime');
  });

  it('the genesis head row is seq=0 with the packages/journal GENESIS_CHAIN_HASH (equality asserted, not restated)', async () => {
    assert.ok(rt !== undefined);
    const head = await rt!.query<{ seq: string; chain_hash: string; n: string }>(
      `SELECT seq, chain_hash, count(*) OVER () AS n FROM public.command_journal_chain_head`,
    );
    assert.equal(head.rows.length, 1, 'exactly one head row (singleton)');
    assert.equal(head.rows[0]?.seq, '0');
    assert.equal(head.rows[0]?.chain_hash, GENESIS_CHAIN_HASH, 'genesis hash equals the in-repository constant');
    assert.equal(head.rows[0]?.n, '1');
  });
});

describe('B-T1 — denial matrix, literal PostgreSQL output (§6.3)', { skip: SKIP_REASON }, () => {
  it('B-R1 runtime INSERT/UPDATE/DELETE/TRUNCATE on both journal tables: eight distinct permission denied for table', async () => {
    assert.ok(rt !== undefined);
    const attempts: Array<{ label: string; sql: string }> = [
      { label: 'events INSERT', sql: `INSERT INTO public.command_journal_events (seq, record_class, command_id, event_type, chain_hash, row_bytes) VALUES (999, 'command', 'cmd_x', 'journaled', '${'f'.repeat(64)}', '\\x00')` },
      { label: 'events UPDATE', sql: `UPDATE public.command_journal_events SET event_type = event_type` },
      { label: 'events DELETE', sql: `DELETE FROM public.command_journal_events` },
      { label: 'events TRUNCATE', sql: `TRUNCATE public.command_journal_events` },
      { label: 'head INSERT', sql: `INSERT INTO public.command_journal_chain_head (head_id, seq, chain_hash) VALUES (1, 0, '${'0'.repeat(64)}')` },
      { label: 'head UPDATE', sql: `UPDATE public.command_journal_chain_head SET seq = seq` },
      { label: 'head DELETE', sql: `DELETE FROM public.command_journal_chain_head` },
      { label: 'head TRUNCATE', sql: `TRUNCATE public.command_journal_chain_head` },
    ];
    const denials: string[] = [];
    for (const a of attempts) {
      const err = await rt!.query(a.sql).then(() => undefined, (e: unknown) => e as Error);
      assert.ok(err instanceof Error, `${a.label} must be denied, got success`);
      assert.match(err.message, /^permission denied for table command_journal_(events|chain_head)$/, `${a.label}: literal denial required`);
      denials.push(`${a.label}: ${err.message}`);
    }
    // Eight distinct denied attempts (four verbs x two tables), each carrying
    // the literal. PostgreSQL emits the same sentence for every verb on one
    // table, so distinctness is by attempt, with both table names present.
    assert.equal(denials.length, 8, 'eight distinct denied attempts');
    assert.equal(new Set(denials).size, 8);
    assert.ok(denials.some((d) => d.endsWith('for table command_journal_events')));
    assert.ok(denials.some((d) => d.endsWith('for table command_journal_chain_head')));
  });

  it('B-R2 runtime SET ROLE to br_journal_owner and command_journal_writer: denied, both', async () => {
    assert.ok(rt !== undefined);
    for (const role of ['br_journal_owner', 'command_journal_writer']) {
      const err = await rt!.query(`SET ROLE ${role}`).then(() => undefined, (e: unknown) => e as Error);
      assert.ok(err instanceof Error, `SET ROLE ${role} must be denied`);
      assert.match(err.message, /permission denied to set role/);
    }
  });

  it('B-R3 runtime SET SESSION AUTHORIZATION to either: denied, both', async () => {
    assert.ok(rt !== undefined);
    for (const role of ['br_journal_owner', 'command_journal_writer']) {
      const err = await rt!.query(`SET SESSION AUTHORIZATION '${role}'`).then(() => undefined, (e: unknown) => e as Error);
      assert.ok(err instanceof Error, `SET SESSION AUTHORIZATION ${role} must be denied`);
      assert.match(err.message, /permission denied/);
    }
    const who = await rt!.query<{ u: string }>('SELECT session_user AS u');
    assert.equal(who.rows[0]?.u, 'br_app_runtime', 'session_user unchanged after denied attempts');
  });

  it('B-R4 runtime cannot reach neon_superuser: recursive walk zero; pg_has_role USAGE/MEMBER/SET all false', async (t) => {
    assert.ok(rt !== undefined && admin !== undefined);
    const reached = await detect(rt!, 'br_app_runtime');
    assert.ok(
      !reached.some((r) => r.reached === 'neon_superuser'),
      'the recursive walk must not reach neon_superuser',
    );
    // `pg_has_role` raises 42704 for a role that does not exist, so it can
    // only be evaluated where the target role exists (a Neon instance). On an
    // owned disposable instance the role is absent; that absence is asserted
    // explicitly (an absent role is unreachable by construction) and the
    // pg_has_role limb is recorded as not exercisable here, not as passed.
    const exists = await rt!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_roles WHERE rolname = 'neon_superuser'`,
    );
    if (exists.rows[0]?.n === 0) {
      t.diagnostic('B-R4: neon_superuser absent on this owned instance; pg_has_role limb exercisable only on Neon');
      assert.equal(exists.rows[0]?.n, 0);
      return;
    }
    for (const priv of ['USAGE', 'MEMBER', 'SET']) {
      const res: QueryResult<{ ok: boolean }> = await rt!.query<{ ok: boolean }>(
        `SELECT pg_has_role('br_app_runtime', 'neon_superuser', '${priv}') AS ok`,
      );
      assert.equal(res.rows[0]?.ok, false, `pg_has_role(...,'${priv}') must be false`);
    }
  });

  it('B-R5 runtime cannot disable, drop, or add journal triggers: must be owner of table', async () => {
    assert.ok(rt !== undefined);
    // Literal PostgreSQL 16 output per statement. All three are ownership
    // denials; the server phrases them by the privilege check that fires
    // first — ALTER TABLE by a non-owner reports the table privilege,
    // DROP TRIGGER resolves through RangeVarCallbackOwnsRelation ("relation"),
    // CREATE TRIGGER checks TRIGGER privilege on the table. Exact literals
    // are pinned so a grant that loosened any of them would fail this row.
    const attempts: Array<{ sql: string; literal: string }> = [
      { sql: `ALTER TABLE public.command_journal_events DISABLE TRIGGER ALL`,
        literal: 'must be owner of table command_journal_events' },
      { sql: `DROP TRIGGER command_journal_events_append_only ON public.command_journal_events`,
        literal: 'must be owner of relation command_journal_events' },
      { sql: `CREATE TRIGGER runtime_added BEFORE INSERT ON public.command_journal_events FOR EACH ROW EXECUTE FUNCTION public.command_journal_immutable()`,
        literal: 'permission denied for table command_journal_events' },
    ];
    for (const a of attempts) {
      const err: Error | undefined = await rt!.query(a.sql).then(() => undefined, (e: unknown) => e as Error);
      assert.ok(err instanceof Error, `must be denied: ${a.sql}`);
      assert.equal(err.message, a.literal);
    }
  });

  it('B-R6 SET session_replication_role=replica refused at parameter level', async () => {
    assert.ok(rt !== undefined);
    const err = await rt!.query(`SET session_replication_role = 'replica'`).then(() => undefined, (e: unknown) => e as Error);
    assert.ok(err instanceof Error, 'session_replication_role must be refused');
    assert.match(err.message, /permission denied to set parameter/);
  });

  it('B-R7 runtime cannot ALTER / CREATE OR REPLACE the append routine or change its owner: must be owner of function', async () => {
    assert.ok(rt !== undefined);
    const owner = await rt!.query(
      `ALTER FUNCTION public.command_journal_append${APPEND_SIGNATURE} OWNER TO br_app_runtime`,
    ).then(() => undefined, (e: unknown) => e as Error);
    assert.ok(owner instanceof Error);
    // PostgreSQL 16 literal: ALTER ... OWNER TO reports the bare name.
    assert.equal(owner.message, 'must be owner of function command_journal_append');
    // CREATE OR REPLACE is refused one layer earlier on PostgreSQL 15+: the
    // runtime holds no CREATE on schema public (PUBLIC's CREATE was removed
    // in PG 15), so the schema check fires before the ownership check. The
    // literal is pinned; the ownership denial above already proves the
    // routine cannot be re-owned, and rewriting requires ownership too.
    const replace = await rt!.query(
      `CREATE OR REPLACE FUNCTION public.command_journal_append${APPEND_SIGNATURE}
         RETURNS TABLE(seq bigint, chain_hash text) LANGUAGE sql AS $$ SELECT 1::bigint, '${'e'.repeat(64)}'::text $$`,
    ).then(() => undefined, (e: unknown) => e as Error);
    assert.ok(replace instanceof Error);
    assert.match(replace.message, /^(permission denied for schema public|must be owner of function public\.command_journal_append)$/);
    // ALTER FUNCTION (a non-owner rewrite path that does not need schema
    // CREATE) reaches the ownership check and must say so literally.
    // PostgreSQL 16 literal: property ALTERs report the qualified name.
    const alter = await rt!.query(
      `ALTER FUNCTION public.command_journal_append${APPEND_SIGNATURE} SECURITY INVOKER`,
    ).then(() => undefined, (e: unknown) => e as Error);
    assert.ok(alter instanceof Error);
    assert.equal(alter.message, 'must be owner of function public.command_journal_append');
  });

  it('B-R9 runtime role attributes: rolsuper/rolcreaterole/rolcreatedb/rolbypassrls/rolreplication all false', async () => {
    assert.ok(rt !== undefined);
    const attrs = await rt!.query<{
      rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean;
      rolbypassrls: boolean; rolreplication: boolean; rolcanlogin: boolean;
    }>(`SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolcanlogin
          FROM pg_roles WHERE rolname = 'br_app_runtime'`);
    const row = attrs.rows[0];
    assert.ok(row !== undefined);
    assert.equal(row.rolsuper, false);
    assert.equal(row.rolcreaterole, false);
    assert.equal(row.rolcreatedb, false);
    assert.equal(row.rolbypassrls, false);
    assert.equal(row.rolreplication, false);
    assert.equal(row.rolcanlogin, true, 'the runtime role is the LOGIN (C-2 §3.2)');
  });

  it('B-R10 no pg_write_all_data / pg_read_all_data class membership', async () => {
    assert.ok(rt !== undefined);
    const reached = await detect(rt!, 'br_app_runtime');
    const banned = reached.filter((r) =>
      r.reached.startsWith('pg_write_all_data') || r.reached.startsWith('pg_read_all_data'));
    assert.deepEqual(banned, [], 'zero pg_*_all_data memberships at any depth');
    for (const role of ['pg_read_all_data', 'pg_write_all_data']) {
      const res: QueryResult<{ ok: boolean }> = await rt!.query<{ ok: boolean }>(
        `SELECT pg_has_role('br_app_runtime', '${role}', 'MEMBER') AS ok`,
      );
      assert.equal(res.rows[0]?.ok, false);
    }
  });

  it('B-R11 pg_default_acl review: no default grant reaches the runtime (step-15 carrier)', async () => {
    assert.ok(admin !== undefined);
    const res = await admin!.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_default_acl d
         CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE a.grantee = 0
           OR a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'br_app_runtime')`,
    );
    assert.equal(res.rows[0]?.n, 0, 'no default privilege (direct or PUBLIC) reaches br_app_runtime');
  });

  it('B-R12 routine ACL carries no PUBLIC execute entry (no bare =X/)', async () => {
    assert.ok(admin !== undefined);
    const res = await admin!.query<{ grantee: number | null; privilege_type: string }>(
      `SELECT a.grantee, a.privilege_type
         FROM pg_proc p
         CROSS JOIN LATERAL aclexplode(p.proacl) a
        WHERE p.proname = 'command_journal_append'`,
    );
    assert.ok(res.rows.length > 0, 'the routine has an explicit ACL');
    const publicExecute = res.rows.filter((r) => (r.grantee === null || r.grantee === 0));
    assert.deepEqual(publicExecute, [], 'no PUBLIC entry of any kind in the routine ACL');
    const runtimeOid = await admin!.query<{ oid: number }>(
      `SELECT oid FROM pg_roles WHERE rolname = 'br_app_runtime'`,
    );
    const runtimeExec = res.rows.filter(
      (r) => String(r.grantee) === String(runtimeOid.rows[0]?.oid) && r.privilege_type === 'EXECUTE',
    );
    assert.equal(runtimeExec.length, 1, 'the single explicit EXECUTE grant to br_app_runtime');
  });

  it('B-R13 ownership placement: tables+trigger function owned by br_journal_owner; the routine by command_journal_writer, NOT the table owner', async () => {
    assert.ok(rt !== undefined);
    const tables = await rt!.query<{ relname: string; owner: string }>(
      `SELECT c.relname, r.rolname AS owner
         FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
        WHERE c.relname IN ('command_journal_events','command_journal_chain_head')
        ORDER BY c.relname`,
    );
    assert.deepEqual(tables.rows, [
      { relname: 'command_journal_chain_head', owner: 'br_journal_owner' },
      { relname: 'command_journal_events', owner: 'br_journal_owner' },
    ]);
    const funcs = await rt!.query<{ proname: string; owner: string }>(
      `SELECT p.proname, r.rolname AS owner
         FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
        WHERE p.proname IN ('command_journal_immutable','command_journal_append')
        ORDER BY p.proname`,
    );
    const byName = Object.fromEntries(funcs.rows.map((f) => [f.proname, f.owner]));
    assert.equal(byName['command_journal_immutable'], 'br_journal_owner', 'trigger function owned by the table owner (PC-9)');
    assert.equal(byName['command_journal_append'], 'command_journal_writer', 'the routine is owned by the writer…');
    assert.notEqual(byName['command_journal_append'], byName['command_journal_immutable'], '…deliberately NOT the table owner');
    const triggers = await rt!.query<{ relname: string; tgname: string }>(
      `SELECT c.relname, t.tgname
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relname LIKE 'command_journal%'
        ORDER BY c.relname, t.tgname`,
    );
    assert.equal(triggers.rows.length, 2, 'both append-only triggers exist (events + chain head)');
  });

  it('B-R14 both privileged roles are NOLOGIN with no password set (pg_authid via the administrative connection)', async () => {
    assert.ok(admin !== undefined);
    const res = await admin!.query<{ rolname: string; rolcanlogin: boolean; nopass: boolean }>(
      `SELECT rolname, rolcanlogin, (rolpassword IS NULL) AS nopass
         FROM pg_authid
        WHERE rolname IN ('br_journal_owner','command_journal_writer')
        ORDER BY rolname`,
    );
    assert.equal(res.rows.length, 2);
    for (const row of res.rows) {
      assert.equal(row.rolcanlogin, false, `${row.rolname} must be NOLOGIN`);
      assert.equal(row.nopass, true, `${row.rolname} must have no password`);
    }
  });

  it('B-R15 no journal sequence exists (the routine assigns seq; PC-8)', async () => {
    assert.ok(rt !== undefined);
    const byName = await rt!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_class c
         WHERE c.relkind = 'S' AND c.relname ILIKE '%journal%'`,
    );
    assert.equal(byName.rows[0]?.n, 0, 'no sequence named like a journal object');
    const owned = await rt!.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_depend d
         JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
         JOIN pg_class t ON t.oid = d.refobjid
        WHERE t.relname IN ('command_journal_events','command_journal_chain_head')`,
    );
    assert.equal(owned.rows[0]?.n, 0, 'no sequence owned by either journal table');
    const def = await rt!.query<{ has_default: boolean }>(
      `SELECT (column_default IS NOT NULL) AS has_default
         FROM information_schema.columns
        WHERE table_name = 'command_journal_events' AND column_name = 'seq'`,
    );
    assert.equal(def.rows[0]?.has_default, false, 'events.seq carries no default — the routine assigns it');
  });
});

describe('B-T1 — positive path (§6.3 B-P1..B-P3)', { skip: SKIP_REASON }, () => {
  it('B-P1 SECURITY DEFINER append succeeds: runtime EXECUTEs the routine and the row lands', async () => {
    assert.ok(rt !== undefined);
    const commandId = `cmd_b_t1_p1_${randomBytes(4).toString('hex')}`;
    const appended = await appendAsRuntime(commandId);
    assert.equal(Number(appended.seq), appendSeq);
    const row = await rt!.query<{ n: string; cls: string }>(
      `SELECT count(*)::text AS n, min(record_class) AS cls FROM public.command_journal_events WHERE command_id = $1`,
      [commandId],
    );
    assert.equal(row.rows[0]?.n, '1', 'the appended row landed');
    assert.equal(row.rows[0]?.cls, 'command');
  });

  it('B-P2 runtime SELECT on both tables succeeds (verify() chain recomputation read path)', async () => {
    assert.ok(rt !== undefined);
    const events = await rt!.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.command_journal_events`);
    const head = await rt!.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.command_journal_chain_head`);
    assert.ok(events.rows[0] !== undefined && head.rows[0] !== undefined);
    assert.ok((events.rows[0]?.n ?? 0) >= 1, 'the B-P1 row is readable by the runtime');
    assert.equal(head.rows[0]?.n, 1);
  });

  it('B-P3 containment: inside the routine current_user is the writer; after the call it is the runtime login; the runtime still cannot INSERT', async () => {
    assert.ok(rt !== undefined);
    const notices: string[] = [];
    const collect = (n: { message: string }): void => { notices.push(n.message); };
    (rt as unknown as { on(e: 'notice', f: (n: { message: string }) => void): unknown }).on('notice', collect);
    const commandId = `cmd_b_t1_p3_${randomBytes(4).toString('hex')}`;
    try {
      await appendAsRuntime(commandId);
    } finally {
      (rt as unknown as { removeListener(e: 'notice', f: (n: { message: string }) => void): unknown })
        .removeListener('notice', collect);
    }
    assert.ok(
      notices.some((m) => m.includes('command_journal_append.definer_user:command_journal_writer')),
      `inside the routine current_user must be the writer; notices: ${JSON.stringify(notices)}`,
    );
    const after = await rt!.query<{ u: string }>('SELECT current_user AS u');
    assert.equal(after.rows[0]?.u, 'br_app_runtime', 'after the call current_user is the runtime login');
    const err = await rt!.query(
      `INSERT INTO public.command_journal_events (seq, record_class, command_id, event_type, chain_hash, row_bytes)
       VALUES (99999, 'command', 'cmd_x', 'journaled', '${'f'.repeat(64)}', '\\x00')`,
    ).then(() => undefined, (e: unknown) => e as Error);
    assert.ok(err instanceof Error, 'the runtime still cannot INSERT directly');
    assert.match(err.message, /permission denied for table/);
  });
});

describe('B-T1 — hash-binding security (§6.3 B-H1..B-H3; C-2 §16.5)', { skip: SKIP_REASON }, () => {
  it('B-H1 pg_catalog.sha256 cannot be shadowed: no creation in pg_catalog; a pg_temp overload does not capture resolution; NIST vector verified', async () => {
    assert.ok(rt !== undefined);
    // (a) a non-superuser cannot create pg_catalog.sha256
    const denied = await rt!.query(
      `CREATE FUNCTION pg_catalog.sha256(bytea) RETURNS bytea LANGUAGE sql AS $$ SELECT '\\x00'::bytea $$`,
    ).then(() => undefined, (e: unknown) => e as Error);
    assert.ok(denied instanceof Error, 'creating in pg_catalog must be denied');
    assert.match(denied.message, /permission denied for schema pg_catalog/);

    // (b) install a hostile pg_temp overload in the runtime's OWN session
    await rt!.query(
      `CREATE FUNCTION pg_temp.sha256(bytea) RETURNS bytea LANGUAGE sql AS $$ SELECT decode('${'f'.repeat(64)}', 'hex') $$`,
    );
    const installed = await rt!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname LIKE 'pg_temp%' AND p.proname = 'sha256'`,
    );
    assert.ok((installed.rows[0]?.n ?? 0) >= 1, 'the overload was actually created (control is non-vacuous)');

    // The routine's framing must still use the builtin: append and compare
    // against packages/journal's chainHash (node crypto) — a captured
    // overload would produce f*64-derived garbage instead.
    const commandId = `cmd_b_t1_h1_${randomBytes(4).toString('hex')}`;
    const appended = await appendAsRuntime(commandId);
    assert.match(appended.chainHash, /^[0-9a-f]{64}$/);
    assert.ok(!appended.chainHash.startsWith('ffff'), 'the hostile overload did not capture resolution');

    // (c) NIST vector for "abc" through the builtin, explicitly qualified
    const nist = await rt!.query<{ hex: string }>(
      `SELECT encode(pg_catalog.sha256(decode('616263', 'hex')), 'hex') AS hex`,
    );
    assert.equal(
      nist.rows[0]?.hex,
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      'builtin sha256 matches the NIST vector for "abc"',
    );
    await rt!.query('DROP FUNCTION IF EXISTS pg_temp.sha256(bytea)');
  });

  it('B-H2 search_path hardening: routine pins pg_catalog,pg_temp (public absent); non-builtins fully qualified; no dynamic SQL', async () => {
    assert.ok(admin !== undefined);
    const res = await admin!.query<{ proconfig: string[] | null; prosrc: string; prosecdef: boolean }>(
      `SELECT p.proconfig, p.prosrc, p.prosecdef
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'command_journal_append'`,
    );
    const row = res.rows[0];
    assert.ok(row !== undefined, 'the routine resolves from the catalog by name');
    assert.equal(row.prosecdef, true, 'SECURITY DEFINER');
    assert.ok(row.proconfig !== null);
    const sp = (row.proconfig ?? []).find((c) => c.startsWith('search_path='));
    assert.equal(sp, 'search_path=pg_catalog, pg_temp', 'pinned search_path with public ABSENT');
    assert.ok(!/(\s|,)public(,|$)/.test(sp ?? ''), 'public must not appear in the pinned path');
    const src = row.prosrc;
    assert.ok(!/\bEXECUTE\b/i.test(src.replace(/EXECUTE FUNCTION/g, '')), 'no dynamic SQL (no plpgsql EXECUTE)');
    assert.ok(src.includes('public.command_journal_events'), 'events references fully qualified');
    assert.ok(src.includes('public.command_journal_chain_head'), 'head references fully qualified');
    assert.ok(src.includes('pg_catalog.sha256'), 'the hash call is the qualified builtin');
    assert.ok(!/[^.\w]FROM\s+command_journal|[^.\w]INTO\s+command_journal|[^.\w]UPDATE\s+command_journal/i.test(src), 'no unqualified journal-object reference');
  });

  it('B-H3 pool search_path does not alter resolution of the schema-qualified call site (Tranche-B portion; PC-24 post-cutover re-confirmation belongs to Tranche D)', async () => {
    assert.ok(rt !== undefined);
    await rt!.query(`SET search_path = pg_temp, public`);
    const commandId = `cmd_b_t1_h3_${randomBytes(4).toString('hex')}`;
    const appended = await appendAsRuntime(commandId);
    assert.match(appended.chainHash, /^[0-9a-f]{64}$/, 'the qualified call site resolves identically under a hostile pool search_path');
    await rt!.query(`SET search_path = ''`);
    const commandId2 = `cmd_b_t1_h3b_${randomBytes(4).toString('hex')}`;
    const appended2 = await appendAsRuntime(commandId2);
    assert.match(appended2.chainHash, /^[0-9a-f]{64}$/);
    await rt!.query(`RESET search_path`);
  });
});

describe('B-T1 — B-R8 zero membership edges + FD-B2(a) positive detection controls (§6.3.1)', { skip: SKIP_REASON }, () => {
  it('B-R8 real runtime: zero membership edges at any depth to all four privileged roles (modifier variants would fail exactly as plain edges)', async () => {
    assert.ok(rt !== undefined);
    const reached = await detect(rt!, 'br_app_runtime');
    const forbidden = reached.filter((r) => (FORBIDDEN_TARGETS as readonly string[]).includes(r.reached));
    assert.deepEqual(forbidden, [], 'br_app_runtime has no direct or transitive edge to any forbidden role');
  });

  it('B-R8 probe controls 1-4 + no-membership control: identical parameterized detection query, stored options asserted, detection asserted, post-revoke absence verified per case', async () => {
    assert.ok(admin !== undefined);
    const target = 'command_journal_writer';
    const cases: Array<{ name: string; grant: string; inherit: boolean; set: boolean }> = [
      { name: 'plain membership', grant: `GRANT ${target} TO ${probeName}`, inherit: true, set: true },
      { name: 'WITH INHERIT FALSE', grant: `GRANT ${target} TO ${probeName} WITH INHERIT FALSE`, inherit: false, set: true },
      { name: 'WITH SET FALSE', grant: `GRANT ${target} TO ${probeName} WITH SET FALSE`, inherit: true, set: false },
      { name: 'both modifiers false', grant: `GRANT ${target} TO ${probeName} WITH INHERIT FALSE, SET FALSE`, inherit: false, set: false },
    ];

    // No-membership control FIRST on the fresh probe: zero findings.
    const clean = await detect(admin!, probeName);
    assert.deepEqual(
      clean.filter((r) => r.reached === target),
      [],
      'no-membership control: the detection query returns zero findings for the clean probe',
    );

    for (const c of cases) {
      await admin!.query(c.grant);
      // Assert the ACTUAL stored inherit_option and set_option values.
      const stored: QueryResult<{ inherit_option: boolean; set_option: boolean }> =
        await admin!.query<{ inherit_option: boolean; set_option: boolean }>(
        `SELECT m.inherit_option, m.set_option
           FROM pg_auth_members m
           JOIN pg_roles mem ON mem.oid = m.member
           JOIN pg_roles tgt ON tgt.oid = m.roleid
          WHERE mem.rolname = $1 AND tgt.rolname = $2`,
        [probeName, target],
      );
      assert.equal(stored.rows.length, 1, `${c.name}: exactly one stored edge`);
      assert.equal(stored.rows[0]?.inherit_option, c.inherit, `${c.name}: stored inherit_option`);
      assert.equal(stored.rows[0]?.set_option, c.set, `${c.name}: stored set_option`);
      // The forbidden membership IS detected by the identical query.
      const found = await detect(admin!, probeName);
      assert.ok(
        found.some((r) => r.reached === target),
        `${c.name}: the modifier variant must be DETECTED exactly as a plain edge`,
      );
      // Revoke and verify absence BEFORE the next case.
      await admin!.query(`REVOKE ${target} FROM ${probeName}`);
      const gone = await detect(admin!, probeName);
      assert.deepEqual(
        gone.filter((r) => r.reached === target),
        [],
        `${c.name}: post-revoke absence verified before the next case`,
      );
    }

    // Same-run removal: memberships already revoked; the probe role drops in
    // after() with the pg_roles absence assertion (permission is not proof —
    // the controls above ARE the proof; the drop keeps the cluster clean).
    const edges = await admin!.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member WHERE r.rolname = $1',
      [probeName],
    );
    assert.equal(edges.rows[0]?.n, 0, 'every probe membership was removed before the probe role is dropped');
  });

  it('B-R8 transitive variant: probe -> intermediate -> target is detected at depth 2 by the same query', async () => {
    assert.ok(admin !== undefined);
    const mid = `b_r8_mid_${randomBytes(4).toString('hex')}`;
    await admin!.query(`CREATE ROLE ${mid} NOLOGIN`);
    try {
      await admin!.query(`GRANT command_journal_writer TO ${mid}`);
      await admin!.query(`GRANT ${mid} TO ${probeName}`);
      const found = await detect(admin!, probeName);
      const hit = found.find((r) => r.reached === 'command_journal_writer');
      assert.ok(hit !== undefined, 'a transitive edge is detected');
      assert.equal(hit?.depth, 2, 'reported at its minimum depth');
      await admin!.query(`REVOKE ${mid} FROM ${probeName}`);
      await admin!.query(`REVOKE command_journal_writer FROM ${mid}`);
    } finally {
      await admin!.query(`DROP ROLE IF EXISTS ${mid}`);
    }
    const absent = await admin!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_roles WHERE rolname = $1`, [mid],
    );
    assert.equal(absent.rows[0]?.n, 0, 'the intermediate probe role is absent from pg_roles');
  });
});
