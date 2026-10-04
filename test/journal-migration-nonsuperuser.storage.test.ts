/**
 * B-T1b — 0006 applied by a plain, non-superuser administrative login.
 *
 * Why this exists. The first governed application of 0006 (Gate IV run
 * 36836638497, 2026-10-01) was refused with SQLSTATE 42501 at the ownership
 * transfer and rolled back. Every other fixture applies 0006 as a superuser,
 * or as a login whose environment was arranged for it to succeed
 * (journal-store.storage.test.ts used to set createrole_self_grant and grant
 * CREATE on public to PUBLIC; it now sets only the former, which its own
 * measurement needs), so none of them could see it. This suite applies the
 * canonical sequence as the shape Neon gives an owner: NOSUPERUSER CREATEROLE
 * CREATEDB, owner of its database, PostgreSQL defaults, nothing granted in
 * advance.
 *
 * What it proves, in order:
 *   control  without steps 3a and 13a the same login is refused with 42501 at
 *            the ownership transfer, and the refused attempt leaves nothing
 *            behind (it rolls back whole)
 *   apply    with them the full canonical sequence through 0007 applies, on
 *            PostgreSQL defaults and with createrole_self_grant = 'SET, INHERIT'
 *   ends     the journal authority state — role attributes, owners, ACLs,
 *            routine attributes, triggers, CREATE on public — equals a
 *            superuser-applied run's, and steps 3a/13a leave no grant of
 *            their own behind
 *
 * Fixture: three exclusively owned disposable clusters (0006's roles are
 * cluster-wide), each destroyed as soon as its facts are read. No credential
 * exists: the logins connect over the cluster's trusted unix socket.
 * TEST_DATABASE_URL is the storage-suite run gate only; no shared instance is
 * touched.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { realpathSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import pgDefault from 'pg';
import type { Client as PgClient, Pool as PgPool } from 'pg';
import { MIGRATIONS, migrate } from '../packages/control-plane/src/migrations.js';

const { Client, Pool } = pgDefault;

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

const ADMIN_ROLE = 'br_ns_admin';
const TARGET_DATABASE = 'br_ns_target';
const JOURNAL_ROLES_SQL = `ARRAY['br_journal_owner','command_journal_writer','br_app_runtime']`;

/** Steps 3a and 13a of 0006 — the only statements the control removes. */
const APPLIER_SUPPORT = [
  'GRANT br_journal_owner, command_journal_writer TO CURRENT_USER',
  'GRANT CREATE ON SCHEMA public TO br_journal_owner, command_journal_writer',
  'REVOKE CREATE ON SCHEMA public FROM br_journal_owner, command_journal_writer',
  'REVOKE br_journal_owner, command_journal_writer FROM CURRENT_USER',
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
  /**
   * True only after `pg_ctl start -w` returned 0. A never-started cluster has
   * no postmaster to stop; destruction then removes the directory only.
   */
  started: boolean;
}

/**
 * Owned-fixture lifecycle: the instance record is handed to the caller's
 * ownership slot BEFORE initdb/start run (via `register`), so a failure at any
 * later step still has a handle to destroy. On initdb/start failure this
 * function destroys the never-started cluster itself before rethrowing.
 */
async function startOwnedInstance(
  bins: ServerBins,
  register: (instance: OwnedInstance) => void,
): Promise<OwnedInstance> {
  const port = await freePort();
  // Short prefix: the socket path must stay under sun_path (103 bytes on
  // macOS) even under a long per-user TMPDIR.
  const rootDir = mkdtempSync(join(tmpdir(), 'b-t1b-'));
  const clusterDir = join(rootDir, 'cluster');
  const socketDir = join(rootDir, 'sock');
  const instance: OwnedInstance = { rootDir, clusterDir, socketDir, pgCtl: bins.pgCtl, port, started: false };
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
       '-o', `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${socketDir} -c fsync=off`],
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

/** Stop the postmaster only if one was started; then remove the directory. */
function destroyOwnedInstance(instance: OwnedInstance | undefined): void {
  if (instance === undefined) return;
  if (instance.started) {
    spawnSync(instance.pgCtl, ['-D', instance.clusterDir, 'stop', '-m', 'immediate', '-w'], { timeout: 60_000 });
    instance.started = false;
  }
  rmSync(instance.rootDir, { recursive: true, force: true });
}

function socketClient(instance: OwnedInstance, user: string, database: string): PgClient {
  return new Client({ host: instance.socketDir, port: instance.port, user, database });
}

/* ---------------- facts read from a finished cluster ---------------- */

interface Membership {
  readonly role: string;
  readonly member: string;
  readonly grantor: string;
  readonly admin_option: boolean;
  readonly inherit_option: boolean;
  readonly set_option: boolean;
}

interface ControlResult {
  readonly removed: number;
  readonly failedStatement: string | undefined;
  readonly code: string | undefined;
  readonly message: string | undefined;
  readonly rolesLeft: number;
  readonly tablesLeft: number;
}

interface Applied {
  readonly applied: readonly string[];
  readonly settings: { readonly superuser: boolean; readonly createroleSelfGrant: string; readonly publicCanCreate: boolean };
  readonly fingerprint: Record<string, unknown>;
  readonly memberships: readonly Membership[];
  readonly control: ControlResult | undefined;
}

type Applier = 'superuser' | 'admin-defaults' | 'admin-self-grant';

/**
 * The journal authority state, independent of who applied it: everything C-3
 * §6.1 specifies and the authority split relies on. Read by a superuser so a
 * missing privilege cannot hide a row.
 */
async function authorityFingerprint(c: PgClient): Promise<Record<string, unknown>> {
  const q = async (sql: string): Promise<unknown[]> => (await c.query(sql)).rows;
  return {
    roles: await q(
      `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
              rolreplication, rolbypassrls, rolconnlimit
         FROM pg_catalog.pg_roles WHERE rolname = ANY(${JOURNAL_ROLES_SQL}) ORDER BY rolname`,
    ),
    relations: await q(
      `SELECT c.relname, pg_catalog.pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS acl,
              c.relrowsecurity
         FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('command_journal_events','command_journal_chain_head') ORDER BY c.relname`,
    ),
    functions: await q(
      `SELECT p.proname, pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl,
              p.prosecdef, p.proconfig::text AS config
         FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('command_journal_immutable','command_journal_append') ORDER BY p.proname`,
    ),
    triggers: await q(
      `SELECT t.tgname, c.relname, t.tgenabled::text AS enabled
         FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal
          AND c.relname IN ('command_journal_events','command_journal_chain_head') ORDER BY t.tgname`,
    ),
    createOnPublic: await q(
      `SELECT r AS rolname, pg_catalog.has_schema_privilege(r, 'public', 'CREATE') AS can_create
         FROM unnest(${JOURNAL_ROLES_SQL}) AS r ORDER BY r`,
    ),
    publicSchemaAcl: await q(`SELECT nspacl::text AS acl FROM pg_catalog.pg_namespace WHERE nspname = 'public'`),
    genesis: await q('SELECT head_id, seq, chain_hash FROM public.command_journal_chain_head'),
  };
}

async function readMemberships(c: PgClient): Promise<Membership[]> {
  const res = await c.query<Membership>(
    `SELECT roleid::regrole::text AS role, member::regrole::text AS member, grantor::regrole::text AS grantor,
            admin_option, inherit_option, set_option
       FROM pg_catalog.pg_auth_members
      WHERE roleid::regrole::text IN ('br_journal_owner','command_journal_writer')
      ORDER BY 1, 2, 3`,
  );
  return res.rows;
}

/**
 * Control: the canonical 0006 minus steps 3a/13a, run statement by statement as
 * the applier inside one transaction, then rolled back. Records where it stops.
 */
async function runControl(pool: PgPool): Promise<ControlResult> {
  const entry = MIGRATIONS.find((m) => m.id === '0006_command_journal_authority_split');
  assert.ok(entry !== undefined, '0006 is in the canonical array');
  const support = new Set<string>(APPLIER_SUPPORT);
  const kept = entry.statements.filter((s) => !support.has(s.trim()));
  const removed = entry.statements.length - kept.length;
  const client = await pool.connect();
  let failedStatement: string | undefined;
  let code: string | undefined;
  let message: string | undefined;
  try {
    await client.query('BEGIN');
    for (const statement of kept) {
      try {
        await client.query(statement);
      } catch (error) {
        failedStatement = statement.trim().split('\n')[0]?.replace(/\s+/g, ' ');
        code = (error as { code?: string }).code;
        message = (error as Error).message;
        break;
      }
    }
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
  const check = await pool.query<{ roles: number; tables: number }>(
    `SELECT (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname = ANY(${JOURNAL_ROLES_SQL}))::int AS roles,
            (SELECT count(*) FROM pg_catalog.pg_class WHERE relname IN ('command_journal_events','command_journal_chain_head'))::int AS tables`,
  );
  return {
    removed,
    failedStatement,
    code,
    message,
    rolesLeft: check.rows[0]?.roles ?? -1,
    tablesLeft: check.rows[0]?.tables ?? -1,
  };
}

/**
 * Starts a fresh cluster, applies the canonical sequence as `kind`, reads the
 * facts, and destroys the cluster. The superuser run is the reference.
 */
async function applyOnFreshCluster(bins: ServerBins, kind: Applier): Promise<Applied> {
  let owned: OwnedInstance | undefined;
  let su: PgClient | undefined;
  let reader: PgClient | undefined;
  let pool: PgPool | undefined;
  try {
    owned = await startOwnedInstance(bins, (o) => { owned = o; });
    su = socketClient(owned, 'postgres', 'postgres');
    await su.connect();
    if (kind === 'superuser') {
      await su.query(`CREATE DATABASE ${TARGET_DATABASE}`);
    } else {
      // Plain on purpose: no createrole_self_grant (except the second
      // variant), no CREATE on public for PUBLIC, nothing granted in advance.
      await su.query(`CREATE ROLE ${ADMIN_ROLE} LOGIN NOSUPERUSER CREATEROLE CREATEDB NOBYPASSRLS NOREPLICATION`);
      if (kind === 'admin-self-grant') {
        await su.query(`ALTER ROLE ${ADMIN_ROLE} SET createrole_self_grant = 'SET, INHERIT'`);
      }
      await su.query(`CREATE DATABASE ${TARGET_DATABASE} OWNER ${ADMIN_ROLE}`);
    }
    await su.end();
    su = undefined;

    const applier = kind === 'superuser' ? 'postgres' : ADMIN_ROLE;
    pool = new Pool({ host: owned.socketDir, port: owned.port, user: applier, database: TARGET_DATABASE, max: 1 });

    const shape = await pool.query<{ superuser: boolean; self_grant: string; public_acl: string | null }>(
      `SELECT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = session_user) AS superuser,
              current_setting('createrole_self_grant') AS self_grant,
              (SELECT nspacl::text FROM pg_catalog.pg_namespace WHERE nspname = 'public') AS public_acl`,
    );
    // PUBLIC's entry in an aclitem list has an empty grantee: `=U/owner`.
    const publicCanCreate = /(?:^\{|,)=[A-Za-z*]*C[A-Za-z*]*\//.test(shape.rows[0]?.public_acl ?? '');

    // The control runs first, on the plain admin only; it rolls back whole.
    const control = kind === 'admin-defaults' ? await runControl(pool) : undefined;

    const result = await migrate(pool);
    await pool.end();
    pool = undefined;

    reader = socketClient(owned, 'postgres', TARGET_DATABASE);
    await reader.connect();
    return {
      applied: result.applied,
      settings: {
        superuser: shape.rows[0]?.superuser ?? false,
        createroleSelfGrant: shape.rows[0]?.self_grant ?? '',
        publicCanCreate,
      },
      fingerprint: await authorityFingerprint(reader),
      memberships: await readMemberships(reader),
      control,
    };
  } finally {
    await su?.end().catch(() => undefined);
    await reader?.end().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    destroyOwnedInstance(owned);
  }
}

/* ---------------- suite ---------------- */

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the 0006 non-superuser suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

let reference: Applied;
let plain: Applied;
let selfGrant: Applied;

describe('B-T1b — 0006 applied by a plain non-superuser administrative login', { skip: SKIP_REASON }, () => {
  before(async () => {
    reference = await applyOnFreshCluster(BINS!, 'superuser');
    plain = await applyOnFreshCluster(BINS!, 'admin-defaults');
    selfGrant = await applyOnFreshCluster(BINS!, 'admin-self-grant');
  });

  it('the fixtures are the shapes they claim: the admin is not a superuser, and neither variant had CREATE on public handed to PUBLIC', () => {
    assert.equal(reference.settings.superuser, true, 'the reference applier is a superuser');
    for (const applied of [plain, selfGrant]) {
      assert.equal(applied.settings.superuser, false, 'the administrative login is not a superuser');
      assert.equal(applied.settings.publicCanCreate, false, 'PUBLIC has no CREATE on schema public (PostgreSQL 15+ default)');
    }
    assert.equal(plain.settings.createroleSelfGrant, '', 'defaults: createrole_self_grant is empty');
    assert.match(selfGrant.settings.createroleSelfGrant, /^set,\s*inherit$/i, 'variant: createrole_self_grant = SET, INHERIT');
  });

  it('control: without steps 3a/13a the same login is refused with 42501 at the ownership transfer, and nothing is left behind', () => {
    const control = plain.control;
    assert.ok(control !== undefined, 'the control ran on the plain administrative login');
    assert.equal(control.removed, APPLIER_SUPPORT.length, 'exactly steps 3a and 13a were removed');
    assert.equal(control.code, '42501', 'insufficient_privilege, as the governed run reported');
    assert.match(control.failedStatement ?? '', /^ALTER TABLE public\.command_journal_events OWNER TO br_journal_owner/);
    assert.match(control.message ?? '', /must be able to SET ROLE|permission denied for schema public/);
    assert.equal(control.rolesLeft, 0, 'the refused attempt rolled back whole: no journal role remains');
    assert.equal(control.tablesLeft, 0, 'the refused attempt rolled back whole: no journal table remains');
  });

  it('the full canonical sequence through 0007 applies for the plain administrative login, on defaults and with createrole_self_grant', () => {
    assert.deepEqual(plain.applied, [...TRANCHE_ORDER]);
    assert.deepEqual(selfGrant.applied, [...TRANCHE_ORDER]);
    assert.deepEqual(reference.applied, [...TRANCHE_ORDER], 'and the reference superuser run applied the same sequence');
  });

  it('the journal authority state a non-superuser application ends in equals a superuser application\'s', () => {
    assert.deepEqual(plain.fingerprint, reference.fingerprint, 'defaults');
    assert.deepEqual(selfGrant.fingerprint, reference.fingerprint, 'createrole_self_grant = SET, INHERIT');
  });

  it('no journal role is left able to create objects in public, and the owners are the roles C-3 §6.1 names', () => {
    for (const [label, applied] of [['superuser', reference], ['defaults', plain], ['self-grant', selfGrant]] as const) {
      const create = applied.fingerprint['createOnPublic'] as ReadonlyArray<{ rolname: string; can_create: boolean }>;
      assert.deepEqual(
        create.map((row) => [row.rolname, row.can_create]),
        [['br_app_runtime', false], ['br_journal_owner', false], ['command_journal_writer', false]],
        `${label}: CREATE on public was taken back from every journal role`,
      );
      const relations = applied.fingerprint['relations'] as ReadonlyArray<{ relname: string; owner: string }>;
      assert.deepEqual(
        relations.map((row) => [row.relname, row.owner]),
        [['command_journal_chain_head', 'br_journal_owner'], ['command_journal_events', 'br_journal_owner']],
        `${label}: both tables are owned by br_journal_owner`,
      );
      const functions = applied.fingerprint['functions'] as ReadonlyArray<{ proname: string; owner: string; prosecdef: boolean }>;
      assert.deepEqual(
        functions.map((row) => [row.proname, row.owner, row.prosecdef]),
        [['command_journal_append', 'command_journal_writer', true], ['command_journal_immutable', 'br_journal_owner', false]],
        `${label}: the routine is owned by the writer and SECURITY DEFINER; the trigger function by the table owner`,
      );
    }
  });

  it('steps 3a and 13a leave no grant of their own behind: nothing the applier granted itself survives COMMIT', () => {
    assert.deepEqual(reference.memberships, [], 'a superuser application leaves no membership at all');
    for (const [label, applied] of [['defaults', plain], ['self-grant', selfGrant]] as const) {
      assert.deepEqual(
        applied.memberships.filter((row) => row.grantor === ADMIN_ROLE),
        [],
        `${label}: no membership granted by the applier remains`,
      );
    }
    // On defaults PostgreSQL 16 itself leaves the creator ADMIN OPTION on the
    // roles it created — and neither SET nor INHERIT, so the applier cannot
    // act as the journal roles after the migration.
    assert.ok(plain.memberships.length > 0, 'PostgreSQL 16 records the creator\'s ADMIN OPTION');
    for (const row of plain.memberships) {
      assert.equal(row.member, ADMIN_ROLE);
      assert.equal(row.admin_option, true);
      assert.equal(row.set_option, false, 'defaults: the applier cannot SET ROLE to a journal role afterwards');
      assert.equal(row.inherit_option, false, 'defaults: the applier inherits nothing from a journal role afterwards');
    }
  });
});
