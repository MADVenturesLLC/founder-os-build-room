/**
 * A-T1 — the read-only boot schema preflight (r5 §6 A-R1/A-R3/A-R4/A-R5).
 *
 * Covers the staged-enforcement ruling (r5 §3):
 *   1. schema mismatch hard-fails before readiness — no DDL, no repair;
 *   2. the privilege audit is read-only and recorded `pending_cutover` — it
 *      never blocks boot and never declares compliance while the documented
 *      owner-class runtime remains in use;
 *   3. privilege hard-fail is Tranche-D work — A-R3 here proves DETECTION
 *      ONLY via an ephemeral NON-LOGIN fixture role entered through SET ROLE
 *      from this suite's existing disposable local session (r5 §4 Class 2);
 *      it does not prove owner-class runtime boot refusal;
 *   4. nothing emits a secret or credential value.
 *
 * Every fixture lives in its own disposable `TEST_DATABASE_URL` database and
 * dies with it (Class 1: setup / observation / deliberate damage / teardown).
 * All fixture SQL runs on this suite's own connections, never on a boot
 * connection under observation.
 *
 * RED at the bound base: `../packages/control-plane/src/schema-preflight.js`
 * does not exist (build fails TS2307; at runtime ERR_MODULE_NOT_FOUND), and
 * the boot child repairs a damaged schema instead of refusing it — `migrate()`
 * re-applies the deleted `schema_migrations` id and the process reaches
 * `boot.listening`. Both observations are recorded in the tranche evidence.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { realpathSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pgDefault from 'pg';
import type { PoolClient } from 'pg';
import {
  STORAGE_SKIP,
  createGatewayHarness,
  destroyGatewayHarness,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { createPool } from '../packages/control-plane/src/db.js';
import { migrate } from '../packages/control-plane/src/migrations.js';
import {
  SchemaPreflightError,
  auditRuntimePrivileges,
  schemaPreflight,
} from '../packages/control-plane/src/schema-preflight.js';

const { Pool: PgPool } = pgDefault;

const MAIN_JS = fileURLToPath(
  new URL('../packages/control-plane/src/main.js', import.meta.url),
);

/** 32-char minimum satisfied by concatenation; never presented anywhere. */
const SUITE_TOKEN = 'schema-preflight-' + 'suite-token-long-enough';

/** A migration id every fixture deletes to make the schema incomplete. */
const REQUIRED_ID_TO_REMOVE = '0005_phase3_run_evidence';

/** The Class-2 ephemeral NON-LOGIN fixture role (A-R3 detection only). */
const FIXTURE_ROLE = 'br_tr_a_preflight_fixture_role';

interface BootRun {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly reachedListening: boolean;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (typeof address === 'object' && address !== null) resolve(address.port);
        else reject(new Error('could not reserve an ephemeral port'));
      });
    });
  });
}

/**
 * Spawn the real boot entrypoint against a fixture database. Failure path:
 * the child must exit non-zero WITHOUT reaching `boot.listening`. Success
 * path (used by the RED probe semantics): SIGTERM after listening.
 */
function runBoot(databaseUrl: string, port: number): Promise<BootRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN_JS], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        CONTROL_PLANE_TOKEN: SUITE_TOKEN,
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new Error(
          `boot child wedged for 30s\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
        ),
      );
    }, 30_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        reachedListening: stdout.includes('"at":"boot.listening"'),
      });
    });
  });
}

/** Install the DDL observation trigger on a fixture database (Class 1). */
async function installDdlObservation(harness: GatewayHarness): Promise<void> {
  await harness.pool.query(
    `CREATE TABLE preflight_ddl_observation (
       seq bigserial PRIMARY KEY,
       tag text NOT NULL,
       observed_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  await harness.pool.query(
    `CREATE FUNCTION preflight_ddl_observation_record() RETURNS event_trigger
       LANGUAGE plpgsql AS $$
       BEGIN
         INSERT INTO preflight_ddl_observation (tag) VALUES (tg_tag);
         RAISE WARNING 'ddl_observation:%', tg_tag;
       END
       $$`,
  );
  await harness.pool.query(
    `CREATE EVENT TRIGGER preflight_ddl_observation
       ON ddl_command_start
       EXECUTE FUNCTION preflight_ddl_observation_record()`,
  );
}

async function observedDdlTags(harness: GatewayHarness): Promise<string[]> {
  const { rows } = await harness.pool.query<{ tag: string }>(
    'SELECT tag FROM preflight_ddl_observation ORDER BY seq',
  );
  return rows.map((row) => row.tag);
}

/**
 * A stable catalog snapshot: everything a "repair" would have to touch to
 * pass as one. Sorted, serialized, compared whole — identical before/after
 * is the no-mutation proof (A-R4/A-R5).
 */
async function catalogSnapshot(harness: GatewayHarness): Promise<string> {
  const migrations = await harness.pool.query<{ id: string; applied_at: string }>(
    'SELECT id, applied_at FROM schema_migrations ORDER BY id',
  );
  const tables = await harness.pool.query<{ schemaname: string; tablename: string; tableowner: string }>(
    'SELECT schemaname, tablename, tableowner FROM pg_tables ORDER BY schemaname, tablename',
  );
  const indexes = await harness.pool.query<{ schemaname: string; indexname: string; tablename: string }>(
    'SELECT schemaname, indexname, tablename FROM pg_indexes ORDER BY schemaname, tablename, indexname',
  );
  return JSON.stringify({
    migrations: migrations.rows,
    tables: tables.rows,
    indexes: indexes.rows,
  });
}

const harnesses: GatewayHarness[] = [];

/**
 * Pre-journal fixture on the shared TEST_DATABASE_URL server: the helper's
 * explicit selection through `0005_phase3_run_evidence`. Used ONLY by the
 * sections that never evaluate the full preflight (the F1 synthetic-catalog
 * walk and the F2-mirror trigger control) — their proofs do not depend on
 * `0006` being present. Labeled legacy: success here is not evidence that
 * 0006 passed.
 */
async function fixture(label: string): Promise<GatewayHarness> {
  const harness = await createGatewayHarness(label);
  harnesses.push(harness);
  return harness;
}

after(async () => {
  while (harnesses.length > 0) {
    await destroyGatewayHarness(harnesses.pop());
  }
});

/* ------------------------------------------------------------------ */
/* MS-2 — exclusively owned disposable instances for the fixtures that */
/* require the full canonical sequence through 0006.                   */
/*                                                                     */
/* `schemaPreflight()` requires every id in MIGRATIONS, which now ends */
/* at 0006_command_journal_authority_split; 0006 creates cluster-wide  */
/* roles, so it cannot be applied per-fixture on the shared container. */
/* Each canonical fixture below owns its own initdb'd instance, applies */
/* the FULL canonical sequence (selection omitted), and — before the   */
/* instance is destroyed — explicitly removes this run's enumerated    */
/* 0006 objects and roles and asserts their absence from pg_roles.     */
/* Authority: Founder ruling — Gate III storage fixture completion §1  */
/* (MS-2) and §2/§4 (per-fixture explicit cleanup and role absence).   */
/* ------------------------------------------------------------------ */

interface ServerBins {
  readonly initdb: string;
  readonly pgCtl: string;
}

/**
 * Resolve PostgreSQL server binaries: explicit env override first (the CI
 * storage-integration job pins the bindir matching its postgres:16
 * service), then pg_config --bindir, then PATH, then the Debian/Ubuntu
 * multiarch layout.
 */
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
  if (pgConfig.status === 0 && pgConfig.stdout !== undefined) {
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
    const versions = readdirSync(multiarch).sort().reverse();
    for (const v of versions) {
      const dir = join(multiarch, v, 'bin');
      if (existsSync(join(dir, 'initdb')) && existsSync(join(dir, 'pg_ctl')) && existsSync(join(dir, 'postgres'))) {
        return { initdb: join(dir, 'initdb'), pgCtl: join(dir, 'pg_ctl') };
      }
    }
  }
  return undefined;
}

const CANONICAL_BINS = resolveServerBinaries();

/** The canonical sections' skip reason, or false when they can run. */
const CANONICAL_SKIP: string | false = (() => {
  if (STORAGE_SKIP) return STORAGE_SKIP;
  return CANONICAL_BINS === undefined
    ? 'canonical preflight fixtures: PostgreSQL server binaries (initdb/pg_ctl) not resolvable — set BUILDROOM_TEST_PG_BINDIR or put pg_ctl on PATH; these fixtures did not run'
    : false;
})();

interface OwnedFixture {
  harness: GatewayHarness | undefined;
  readonly rootDir: string;
  readonly clusterDir: string;
  readonly pgCtl: string;
  /** True only after `pg_ctl start -w` returned 0. */
  started: boolean;
}

const owned: OwnedFixture[] = [];

/** The three cluster-wide roles 0006 creates; asserted absent at teardown. */
const JOURNAL_ROLES = ['br_journal_owner', 'command_journal_writer', 'br_app_runtime'] as const;

/**
 * initdb + start an exclusively owned instance, create the fixture database,
 * apply the FULL canonical sequence through 0006, and hand back a
 * GatewayHarness-shaped handle so the existing observation helpers
 * (`installDdlObservation`, `observedDdlTags`, `catalogSnapshot`) and
 * `runBoot` work unchanged.
 *
 * Lifecycle: the ownership record is pushed to `owned` BEFORE initdb/start,
 * so the suite-level after() destroys it whatever fails later; an
 * initdb/start failure destroys the never-started cluster immediately and
 * rethrows (destruction after failed setup contains — it never qualifies).
 */
async function canonicalFixture(label: string): Promise<GatewayHarness> {
  assert.ok(CANONICAL_BINS !== undefined, 'server binaries were probed present');
  const port = await freePort();
  // Short prefix: the Unix socket path must stay under the kernel sun_path
  // limit (103 bytes on macOS) even under a long per-user TMPDIR.
  const rootDir = mkdtempSync(join(tmpdir(), 'pf-'));
  const clusterDir = join(rootDir, 'cluster');
  const socketDir = join(rootDir, 'sock');
  const record: OwnedFixture = { harness: undefined, rootDir, clusterDir, pgCtl: CANONICAL_BINS.pgCtl, started: false };
  owned.push(record);
  try {
    const init = spawnSync(
      CANONICAL_BINS.initdb,
      ['-D', clusterDir, '--auth=trust', '--username=postgres', '--no-sync'],
      { timeout: 120_000, encoding: 'utf8' },
    );
    assert.equal(init.status, 0, `initdb failed:\n${String(init.stdout)}\n${String(init.stderr)}`);
    mkdirSync(socketDir, { recursive: true });
    const start = spawnSync(
      CANONICAL_BINS.pgCtl,
      ['-D', clusterDir, '-l', join(rootDir, 'server.log'), 'start', '-w', '-t', '60',
       '-o', `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${socketDir} -c fsync=off`],
      { timeout: 120_000, encoding: 'utf8' },
    );
    assert.equal(start.status, 0, `pg_ctl start failed:\n${String(start.stdout)}\n${String(start.stderr)}`);
    record.started = true;
  } catch (error) {
    owned.splice(owned.indexOf(record), 1);
    rmSync(rootDir, { recursive: true, force: true });
    throw error;
  }

  const databaseName = `preflight_${label.replace(/[^a-z0-9]/gi, '_')}`;
  const adminPool = new PgPool({
    connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    max: 1,
  });
  try {
    await adminPool.query(`CREATE DATABASE ${databaseName}`);
  } finally {
    await adminPool.end();
  }

  const config = loadConfig({
    DATABASE_URL: `postgresql://postgres@127.0.0.1:${port}/${databaseName}`,
    CONTROL_PLANE_TOKEN: SUITE_TOKEN,
    STATEMENT_TIMEOUT_MS: '60000',
    PG_POOL_MAX: '12',
  });
  const pool = createPool(config);
  const harness: GatewayHarness = { pool, config, databaseName };
  record.harness = harness;

  // Full canonical sequence — selection omitted — on the owned instance.
  const result = await migrate(pool);
  assert.ok(
    result.applied.includes('0006_command_journal_authority_split'),
    `the canonical sequence through 0006 must apply on the owned instance; applied=${JSON.stringify(result.applied)}`,
  );
  return harness;
}

/**
 * Enumerated same-run cleanup of the 0006 objects and roles on one owned
 * instance, then the pg_roles absence assertion, then destruction. A failure
 * in cleanup or the assertion fails the fixture; destruction afterwards only
 * contains it. A never-migrated harness (setup failed after start) has
 * nothing to clean and no qualification to claim; a never-started cluster
 * has no postmaster to stop.
 */
async function teardownOwnedFixture(fixture: OwnedFixture): Promise<void> {
  const pool = fixture.harness?.pool;
  try {
    if (pool !== undefined) {
      await pool.query('DROP TABLE IF EXISTS public.command_journal_events, public.command_journal_chain_head CASCADE');
      await pool.query('DROP FUNCTION IF EXISTS public.command_journal_append(text, text, text, bigint, bytea)');
      await pool.query('DROP FUNCTION IF EXISTS public.command_journal_immutable()');
      for (const role of JOURNAL_ROLES) {
        await pool.query(`DROP ROLE IF EXISTS ${role}`);
      }
      const { rows } = await pool.query<{ rolname: string }>(
        `SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`,
        [[...JOURNAL_ROLES]],
      );
      console.log(
        JSON.stringify({
          level: 'info',
          at: 'test.canonical_fixture_teardown',
          database: fixture.harness?.databaseName,
          residualRoles: rows.map((r) => r.rolname),
        }),
      );
      assert.deepEqual(rows, [], 'every 0006 role must be absent from pg_roles before the owned instance is destroyed');
    }
  } finally {
    await pool?.end().catch(() => undefined);
    if (fixture.started) {
      spawnSync(fixture.pgCtl, ['-D', fixture.clusterDir, 'stop', '-m', 'immediate', '-w'], { timeout: 60_000 });
      fixture.started = false;
    }
    rmSync(fixture.rootDir, { recursive: true, force: true });
  }
}

after(async () => {
  while (owned.length > 0) {
    const next = owned.pop();
    if (next !== undefined) await teardownOwnedFixture(next);
  }
});

describe('schema preflight — fail closed on missing schema (A-R1)', { skip: CANONICAL_SKIP ? CANONICAL_SKIP : false }, () => {
  it('rejects on a missing required schema_migrations id, issuing no DDL', async (t) => {
    const harness = await canonicalFixture('preflight-missing-id');
    await installDdlObservation(harness);
    // Deliberate damage (DML, not DDL): the recorded id disappears.
    await harness.pool.query('DELETE FROM schema_migrations WHERE id = $1', [
      REQUIRED_ID_TO_REMOVE,
    ]);

    const error = await schemaPreflight(harness.pool).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    assert.ok(
      error instanceof SchemaPreflightError,
      `preflight must reject with SchemaPreflightError; got ${String(error)}`,
    );
    assert.deepEqual(error.missingMigrations, [REQUIRED_ID_TO_REMOVE]);
    t.diagnostic(`rejection message: ${error.message}`);

    const tags = await observedDdlTags(harness);
    t.diagnostic(`DDL tags observed during preflight: ${JSON.stringify(tags)}`);
    assert.deepEqual(tags, [], 'preflight must issue no DDL');
  });

  it('boot exits non-zero on a missing required id, with zero DDL observed', async (t) => {
    const harness = await canonicalFixture('preflight-missing-id-boot');
    await installDdlObservation(harness);
    await harness.pool.query('DELETE FROM schema_migrations WHERE id = $1', [
      REQUIRED_ID_TO_REMOVE,
    ]);

    const port = await freePort();
    const run = await runBoot(harness.config.databaseUrl, port);
    t.diagnostic(`boot stderr: ${run.stderr.trim()}`);
    assert.equal(run.reachedListening, false, 'boot must not begin serving');
    assert.notEqual(run.exitCode, 0, 'boot must exit non-zero');
    assert.match(run.stderr, /"at":"boot\.failed"/);
    assert.match(
      run.stderr,
      /schema preflight failed/,
      'the refusal must come from the preflight, not from any other boot error',
    );
    assert.match(run.stderr, new RegExp(REQUIRED_ID_TO_REMOVE), 'the missing id must be named');

    const tags = await observedDdlTags(harness);
    t.diagnostic(`DDL tags observed during failing boot: ${JSON.stringify(tags)}`);
    assert.deepEqual(tags, [], 'the failing boot must issue no DDL');

    const { rows } = await harness.pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM schema_migrations WHERE id = $1',
      [REQUIRED_ID_TO_REMOVE],
    );
    assert.equal(rows[0]?.n, '0', 'the deleted id must still be absent — no repair');
  });
});

describe('schema preflight — privilege audit is detection-only (A-R3)', { skip: CANONICAL_SKIP ? CANONICAL_SKIP : false }, () => {
  let harness: GatewayHarness | undefined;
  let client: PoolClient | undefined;
  let roleCreated = false;

  before(async () => {
    if (CANONICAL_SKIP) return;
    harness = await canonicalFixture('preflight-role-detection');
    /*
     * pg_roles is cluster-wide, not per-database: a crashed prior run could
     * leave the fixture role behind and fail this run's CREATE ROLE. Same
     * guard the database harness uses (DROP IF EXISTS at setup) — the drop
     * can only ever target this suite's own fixture-role name, and the
     * same-run teardown assertion below still proves final absence.
     */
    await harness.pool.query(`DROP ROLE IF EXISTS ${FIXTURE_ROLE}`);
  });

  after(async () => {
    // Class-2 teardown proof: the fixture role must be absent from pg_roles,
    // asserted and reported before the suite completes.
    try {
      if (client !== undefined) {
        await client.query('RESET ROLE').catch(() => undefined);
        client.release();
        client = undefined;
      }
      if (harness !== undefined && roleCreated) {
        await harness.pool.query(`DROP ROLE IF EXISTS ${FIXTURE_ROLE}`);
      }
      if (harness !== undefined) {
        const { rows } = await harness.pool.query<{ n: string }>(
          'SELECT count(*)::text AS n FROM pg_roles WHERE rolname = $1',
          [FIXTURE_ROLE],
        );
        const absent = rows[0]?.n === '0';
        // Report the teardown assertion result, as the fixture rule requires.
        console.log(
          JSON.stringify({
            level: 'info',
            at: 'test.fixture_role_teardown',
            role: FIXTURE_ROLE,
            absentFromPgRoles: absent,
          }),
        );
        assert.equal(absent, true, 'fixture role must be absent from pg_roles at teardown');
      }
    } finally {
      roleCreated = false;
    }
  });

  it('detects forbidden attributes on the owner-class session without blocking boot', async (t) => {
    assert.ok(harness !== undefined);
    // The disposable local session connects as its superuser — the local
    // stand-in for the documented owner-class runtime shape. Detection-only:
    // the audit reports; it never blocks and never declares compliance.
    const audit = await auditRuntimePrivileges(harness.pool);
    t.diagnostic(`audit: ${JSON.stringify(audit)}`);
    assert.equal(audit.status, 'pending_cutover');
    assert.ok(
      audit.forbiddenAttributes.includes('rolsuper'),
      'the audit must DETECT rolsuper on the owner-class session',
    );
    // And the full preflight on the same session does not block boot while
    // the owner-class runtime is documented (staged enforcement, r5 §3.2):
    const report = await schemaPreflight(harness.pool);
    assert.equal(report.ok, true);
    assert.equal(report.privilegeAudit.status, 'pending_cutover');
  });

  it('reports the fixture role clean through SET ROLE from the existing session (detection only)', async (t) => {
    assert.ok(harness !== undefined);
    // Class 2: minimum ephemeral NON-LOGIN role, no attributes, no password,
    // no memberships, no grants. Entered ONLY via SET ROLE on this suite's
    // existing disposable local session; never via LOGIN. The audit is
    // catalog-only, so it needs no grants the fixture role does not hold.
    await harness.pool.query(`CREATE ROLE ${FIXTURE_ROLE}`);
    roleCreated = true;
    client = await harness.pool.connect();
    await client.query(`SET ROLE ${FIXTURE_ROLE}`);

    const audit = await auditRuntimePrivileges(client);
    t.diagnostic(`audit under fixture role: ${JSON.stringify(audit)}`);
    assert.equal(audit.role, FIXTURE_ROLE, 'the audit must read the connected role');
    assert.equal(audit.status, 'pending_cutover');
    assert.deepEqual(audit.forbiddenAttributes, []);
    assert.deepEqual(audit.forbiddenMemberships, []);

    await client.query('RESET ROLE');
    client.release();
    client = undefined;

    // Detection is bidirectional: back on the owner-class session the
    // forbidden attribute is observed again — the audit did not mutate
    // anything while it looked.
    const after = await auditRuntimePrivileges(harness.pool);
    assert.ok(after.forbiddenAttributes.includes('rolsuper'));
  });
});

describe('schema preflight — incompatible schema fails boot unchanged (A-R4)', { skip: CANONICAL_SKIP ? CANONICAL_SKIP : false }, () => {
  it('boot fails, catalog state is identical before/after, zero DDL', async (t) => {
    const harness = await canonicalFixture('preflight-boot-reject');
    // Deliberate incompatibility: a required recorded id is removed, and a
    // stray object the preflight must NOT clean up is added (fixture DDL on
    // the suite connection, before the observation window opens).
    await harness.pool.query('DELETE FROM schema_migrations WHERE id = $1', [
      REQUIRED_ID_TO_REMOVE,
    ]);
    await harness.pool.query('CREATE TABLE preflight_incompatible_marker (x int)');
    await installDdlObservation(harness);

    const before = await catalogSnapshot(harness);
    const port = await freePort();
    const run = await runBoot(harness.config.databaseUrl, port);
    const after = await catalogSnapshot(harness);

    t.diagnostic(`boot stderr: ${run.stderr.trim()}`);
    assert.equal(run.reachedListening, false, 'an incompatible schema must not serve');
    assert.notEqual(run.exitCode, 0, 'boot must exit non-zero');
    assert.match(run.stderr, /"at":"boot\.failed"/);
    assert.match(run.stderr, /schema preflight/i);

    const tags = await observedDdlTags(harness);
    t.diagnostic(`DDL tags observed during rejected boot: ${JSON.stringify(tags)}`);
    assert.deepEqual(tags, [], 'the rejected boot must issue no DDL');

    assert.equal(after, before, 'catalog state must be identical before/after (PC-22)');
  });
});

describe('schema preflight — never repairs (A-R5)', { skip: CANONICAL_SKIP ? CANONICAL_SKIP : false }, () => {
  it('leaves a deliberately damaged schema exactly as found', async (t) => {
    const harness = await canonicalFixture('preflight-no-repair');
    // Damage: a required id removed AND a conflicting stray table present.
    await harness.pool.query('DELETE FROM schema_migrations WHERE id = $1', [
      REQUIRED_ID_TO_REMOVE,
    ]);
    await harness.pool.query('CREATE TABLE preflight_damage_marker (x int)');
    await harness.pool.query("INSERT INTO preflight_damage_marker (x) VALUES (42)");
    await installDdlObservation(harness);

    const before = await catalogSnapshot(harness);
    const error = await schemaPreflight(harness.pool).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    assert.ok(error instanceof SchemaPreflightError, 'damaged schema must be rejected');
    const after = await catalogSnapshot(harness);

    const tags = await observedDdlTags(harness);
    t.diagnostic(`DDL tags observed during rejected preflight: ${JSON.stringify(tags)}`);
    assert.deepEqual(tags, [], 'preflight must issue no DDL — never repair');
    assert.equal(after, before, 'the damaged schema must be left exactly as found');

    // The damage itself, restated explicitly: still damaged, marker intact.
    const { rows } = await harness.pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM schema_migrations WHERE id = $1',
      [REQUIRED_ID_TO_REMOVE],
    );
    assert.equal(rows[0]?.n, '0', 'the missing id was not restored');
    const marker = await harness.pool.query<{ x: number }>(
      'SELECT x FROM preflight_damage_marker',
    );
    assert.deepEqual(marker.rows, [{ x: 42 }], 'the stray marker table was not touched');
  });
});

describe('schema preflight — a compatible schema passes read-only (GREEN control)', { skip: CANONICAL_SKIP ? CANONICAL_SKIP : false }, () => {
  it('resolves on a fully migrated schema with a pending_cutover audit', async (t) => {
    const harness = await canonicalFixture('preflight-compatible');
    await installDdlObservation(harness);
    const report = await schemaPreflight(harness.pool);
    t.diagnostic(`report: ${JSON.stringify(report)}`);
    assert.equal(report.ok, true);
    assert.equal(report.privilegeAudit.status, 'pending_cutover');
    assert.ok(report.migrationsPresent.includes(REQUIRED_ID_TO_REMOVE));
    // MS-2: the newly appended 0006 is a required id and must be present on
    // a fully migrated canonical fixture (explicit literal, not derived).
    assert.ok(report.migrationsPresent.includes('0006_command_journal_authority_split'));
    const tags = await observedDdlTags(harness);
    assert.deepEqual(tags, [], 'a passing preflight issues no DDL either');
  });
});

/*
 * F2 (mirrored control, this suite's own trigger): the non-transactional
 * client-notice channel must also survive rollback on the
 * `preflight_ddl_observation` trigger — the commission names both trigger
 * sites, and a mutation removing THIS file's RAISE must go RED here, not
 * only in boot-no-ddl.
 */
interface PgNotice {
  readonly severity: string;
  readonly message: string;
}

/** pg's PoolClient typing does not declare the `notice` event; bind it. */
function onNotice(client: PoolClient, collect: (n: PgNotice) => void): void {
  (client as unknown as { on(event: 'notice', fn: (n: PgNotice) => void): unknown }).on(
    'notice',
    collect,
  );
}

function offNotice(client: PoolClient, collect: (n: PgNotice) => void): void {
  (client as unknown as { removeListener(event: 'notice', fn: (n: PgNotice) => void): unknown })
    .removeListener('notice', collect);
}

describe('preflight DDL observation survives rollback (F2 mirror)', { skip: STORAGE_SKIP ? STORAGE_SKIP : false }, () => {
  it('a failed DDL and a rolled-back DDL are both observed through the non-transactional channel', async (t) => {
    const harness = await fixture('preflight-f2-mirror');
    await installDdlObservation(harness);
    const client = await harness.pool.connect();
    try {
      const notices: string[] = [];
      const collect = (n: { severity: string; message: string }): void => {
        notices.push(`${n.severity}:${n.message}`);
      };
      onNotice(client, collect);

      // Case 1: failing DDL (duplicate name).
      await client.query(`CREATE TABLE f2_mirror_marker (x int)`).catch(() => undefined);
      const failed = await client
        .query(`CREATE TABLE f2_mirror_marker (x int)`)
        .then(() => false, () => true);
      t.diagnostic(`mirror case-1 (failed DDL): ${String(failed)}`);

      // Case 2: successful DDL inside an explicit transaction, rolled back.
      await client.query('BEGIN');
      await client.query(`CREATE TABLE f2_mirror_tx (y int)`);
      await client.query('ROLLBACK');

      offNotice(client, collect);
      const ddlNotices = notices.filter((m) => m.includes('ddl_observation:'));
      t.diagnostic(`mirror non-transactional channel: ${JSON.stringify(ddlNotices)}`);
      assert.ok(
        ddlNotices.length >= 2,
        'both the failed and the rolled-back DDL must be observed through the client-notice channel',
      );
      assert.ok(ddlNotices.some((m) => m.includes('CREATE TABLE')), 'failed DDL observed');
      assert.ok(
        ddlNotices.filter((m) => m.includes('CREATE TABLE')).length >= 2,
        'rolled-back DDL observed too (two CREATE TABLE notices minimum)',
      );
      const { rows } = await client.query<{ r: string | null }>(
        `SELECT to_regclass('public.f2_mirror_tx') AS r`,
      );
      assert.equal(rows[0]?.r, null, 'the rolled-back table must not exist');
      // Table channel scope: committed DDL only. The one committed row is
      // this case's own setup CREATE (f2_mirror_marker); NEITHER aborted
      // case reaches this channel — that asymmetry is F2 being pinned.
      const tableChannel = await client.query<{ tag: string }>(
        'SELECT tag FROM preflight_ddl_observation ORDER BY seq',
      );
      t.diagnostic(`mirror table channel (committed only): ${JSON.stringify(tableChannel.rows)}`);
      assert.equal(
        tableChannel.rows.length,
        1,
        'only the committed setup DDL reaches the table channel; the failed and rolled-back DDL do not',
      );
    } finally {
      client.release();
    }
  });
});

/*
 * F1 — the membership walk must not be silently depth-capped (correction
 * commission §2 F1). The production recursive term historically carried
 * `WHERE e.depth < 16`, so a forbidden role reachable only at depth 17+ was
 * never reported and nothing signalled the truncation.
 *
 * Fixture shape (Class 1, discovery §5 "F1 synthetic-relation fixture"):
 * synthetic `pg_roles` / `pg_auth_members` relations in a dedicated schema of
 * the suite's own disposable `TEST_DATABASE_URL` database, placed ahead of
 * `pg_catalog` on the search_path of ONE dedicated test connection only.
 * They represent role ids and membership edges; they create no PostgreSQL
 * roles and grant no memberships. The production `auditRuntimePrivileges`
 * SQL then executes UNMODIFIED against them.
 *
 * What this proves and what it does not: it proves SQL traversal correctness
 * of the production walk (depth, convergence, direct edges, sentinels). It
 * does NOT prove actual PostgreSQL grant or SET ROLE behavior — no role is
 * ever created, granted, or entered here.
 */
const F1_SCHEMA = 'br_f1_fixture';

/** Exact column shape the production queries reference. */
async function installF1SyntheticCatalog(client: PoolClient): Promise<void> {
  await client.query(`CREATE SCHEMA ${F1_SCHEMA}`);
  await client.query(
    `CREATE TABLE ${F1_SCHEMA}.pg_roles (
       rolname name NOT NULL,
       rolsuper boolean NOT NULL,
       rolcreaterole boolean NOT NULL,
       rolcreatedb boolean NOT NULL,
       rolbypassrls boolean NOT NULL,
       rolreplication boolean NOT NULL,
       oid oid NOT NULL
     )`,
  );
  await client.query(`CREATE TABLE ${F1_SCHEMA}.pg_auth_members (member oid NOT NULL, roleid oid NOT NULL)`);
}

interface F1RoleRow {
  readonly rolname: string;
  readonly oid: number;
}

async function insertF1Roles(client: PoolClient, rows: readonly F1RoleRow[]): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO ${F1_SCHEMA}.pg_roles
         (rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, oid)
       VALUES ($1, false, false, false, false, false, $2)`,
      [row.rolname, row.oid],
    );
  }
}

async function insertF1Edge(client: PoolClient, member: number, roleid: number): Promise<void> {
  await client.query(`INSERT INTO ${F1_SCHEMA}.pg_auth_members (member, roleid) VALUES ($1, $2)`, [
    member,
    roleid,
  ]);
}

describe('privilege audit walk — any depth, never silently capped (F1)', { skip: STORAGE_SKIP ? STORAGE_SKIP : false }, () => {
  let harness: GatewayHarness | undefined;
  let client: PoolClient | undefined;
  let savedSearchPath = '';

  before(async () => {
    if (STORAGE_SKIP) return;
    harness = await fixture('preflight-f1-walk');
    client = await harness.pool.connect();
  });

  after(async () => {
    if (client !== undefined) {
      // Restore the connection's catalog resolution exactly as found.
      await client.query(`SELECT set_config('search_path', $1, false)`, [savedSearchPath]).catch(() => undefined);
      client.release();
      client = undefined;
    }
  });

  it('detects a forbidden role reachable only deeper than the old depth-16 cap', async (t) => {
    assert.ok(harness !== undefined && client !== undefined);
    await installF1SyntheticCatalog(client);
    savedSearchPath = (
      await client.query<{ sp: string }>('SHOW search_path')
    ).rows[0]?.sp ?? '';
    await client.query(`SELECT set_config('search_path', $1, false)`, [`${F1_SCHEMA}, pg_catalog`]);

    const liveUser = (await client.query<{ cu: string }>('SELECT current_user AS cu')).rows[0]?.cu ?? '';
    t.diagnostic(`F1 fixture running as ${liveUser} with search_path ${F1_SCHEMA} ahead of pg_catalog`);

    // The production audit requires a pg_roles row for the live current_user.
    const oidOf = (n: number): number => n;
    const chain: F1RoleRow[] = [{ rolname: liveUser, oid: oidOf(1000) }];
    for (let i = 1; i <= 16; i += 1) chain.push({ rolname: `f1_d${i}`, oid: oidOf(2000 + i) });
    // Forbidden targets: depth 1 (direct), depth 2 (sentinel + converging), depth 17 (deep).
    chain.push({ rolname: 'neon_superuser', oid: oidOf(3001) });
    chain.push({ rolname: 'br_journal_owner', oid: oidOf(3002) });
    chain.push({ rolname: 'command_journal_writer', oid: oidOf(3003) });
    chain.push({ rolname: 'f1_conv_a', oid: oidOf(3004) });
    chain.push({ rolname: 'f1_conv_b', oid: oidOf(3005) });
    chain.push({ rolname: 'f1_conv_c', oid: oidOf(3006) });
    chain.push({ rolname: 'neondb_owner', oid: oidOf(3007) });
    await insertF1Roles(client, chain);

    // Deep control: current_user -> f1_d1 -> ... -> f1_d16 -> neondb_owner (depth 17).
    await insertF1Edge(client, 1000, 2001);
    for (let i = 1; i <= 15; i += 1) await insertF1Edge(client, 2000 + i, 2000 + i + 1);
    await insertF1Edge(client, 2016, 3007);
    // Direct control: current_user -> neon_superuser (depth 1).
    await insertF1Edge(client, 1000, 3001);
    // Converging control: command_journal_writer reachable at depth 2 AND depth 3.
    await insertF1Edge(client, 1000, 3004);
    await insertF1Edge(client, 3004, 3003);
    await insertF1Edge(client, 1000, 3005);
    await insertF1Edge(client, 3005, 3006);
    await insertF1Edge(client, 3006, 3003);
    // Anti-vacuity sentinel: br_journal_owner exists ONLY in the synthetic relation.
    await insertF1Edge(client, 3004, 3002);

    const audit = await auditRuntimePrivileges(client);
    t.diagnostic(`F1 audit findings: ${JSON.stringify(audit)}`);

    // Sentinel FIRST: proves the walk read the synthetic relations at all.
    assert.ok(
      audit.forbiddenMemberships.some((m) => m.startsWith('br_journal_owner@depth')),
      'anti-vacuity sentinel: a forbidden role existing only in the synthetic relation must be found',
    );
    // Deep control — the F1 defect: this is what the depth-16 cap silently missed.
    assert.ok(
      audit.forbiddenMemberships.some((m) => m.startsWith('neondb_owner@depth17')),
      'a forbidden role reachable only at depth 17 must be detected (F1)',
    );
    // Direct control.
    assert.ok(
      audit.forbiddenMemberships.some((m) => m.startsWith('neon_superuser@depth1')),
      'a direct forbidden membership at depth 1 must be detected',
    );
    // Converging control: same target by two paths, reported once at min depth.
    assert.ok(
      audit.forbiddenMemberships.some((m) => m.startsWith('command_journal_writer@depth2')),
      'converging paths must report the target once at the minimum depth',
    );
    assert.equal(
      audit.forbiddenMemberships.filter((m) => m.startsWith('command_journal_writer@')).length,
      1,
      'a converging target must not be reported twice',
    );
    // No false positives: the non-forbidden chain roles are traversed but not reported.
    assert.ok(
      !audit.forbiddenMemberships.some((m) => m.startsWith('f1_')),
      'non-forbidden traversal roles must not appear as findings',
    );
  });

  it('reports no forbidden membership when the synthetic catalog holds none', async (t) => {
    assert.ok(harness !== undefined && client !== undefined);
    // "No membership" control on its own fixture database: only the
    // current_user row exists; the walk must return empty findings without
    // claiming compliance (status stays pending_cutover).
    const bare = await fixture('preflight-f1-none');
    const bareClient = await bare.pool.connect();
    try {
      await installF1SyntheticCatalog(bareClient);
      const bareSp = (await bareClient.query<{ sp: string }>('SHOW search_path')).rows[0]?.sp ?? '';
      await bareClient.query(`SELECT set_config('search_path', $1, false)`, [`${F1_SCHEMA}, pg_catalog`]);
      const liveUser = (await bareClient.query<{ cu: string }>('SELECT current_user AS cu')).rows[0]?.cu ?? '';
      await insertF1Roles(bareClient, [{ rolname: liveUser, oid: 1000 }]);
      const audit = await auditRuntimePrivileges(bareClient);
      t.diagnostic(`F1 no-membership audit: ${JSON.stringify(audit)}`);
      assert.deepEqual(audit.forbiddenMemberships, [], 'no synthetic edges means no findings');
      assert.equal(audit.status, 'pending_cutover');
      await bareClient.query(`SELECT set_config('search_path', $1, false)`, [bareSp]);
    } finally {
      bareClient.release();
    }
  });

  it('fails loudly when the walk hits its cycle guard instead of silently truncating', async (t) => {
    assert.ok(harness !== undefined && client !== undefined);
    // Truncation-signal control: a chain deeper than the walk's cycle guard
    // must REJECT (fail closed with a named truncation), never return a
    // silently shortened findings list.
    const deep = await fixture('preflight-f1-truncation');
    const deepClient = await deep.pool.connect();
    try {
      await installF1SyntheticCatalog(deepClient);
      const deepSp = (await deepClient.query<{ sp: string }>('SHOW search_path')).rows[0]?.sp ?? '';
      await deepClient.query(`SELECT set_config('search_path', $1, false)`, [`${F1_SCHEMA}, pg_catalog`]);
      const liveUser = (await deepClient.query<{ cu: string }>('SELECT current_user AS cu')).rows[0]?.cu ?? '';
      const rows: F1RoleRow[] = [{ rolname: liveUser, oid: 1000 }];
      for (let i = 1; i <= 120; i += 1) rows.push({ rolname: `f1_t${i}`, oid: 5000 + i });
      rows.push({ rolname: 'neondb_owner', oid: 6001 });
      await insertF1Roles(deepClient, rows);
      await insertF1Edge(deepClient, 1000, 5001);
      for (let i = 1; i <= 119; i += 1) await insertF1Edge(deepClient, 5000 + i, 5000 + i + 1);
      await insertF1Edge(deepClient, 5120, 6001);

      const error = await auditRuntimePrivileges(deepClient).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      t.diagnostic(`F1 truncation result: ${String(error)}`);
      assert.ok(
        error instanceof SchemaPreflightError,
        'a walk that hits the cycle guard must reject, not return silently truncated findings',
      );
      assert.match(
        error instanceof Error ? error.message : String(error),
        /deeper than this audit proves/i,
        'the truncation rejection must name the truncation',
      );
      await deepClient.query(`SELECT set_config('search_path', $1, false)`, [deepSp]);
    } finally {
      deepClient.release();
    }
  });
});
