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
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import {
  STORAGE_SKIP,
  createGatewayHarness,
  destroyGatewayHarness,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import {
  SchemaPreflightError,
  auditRuntimePrivileges,
  schemaPreflight,
} from '../packages/control-plane/src/schema-preflight.js';

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

describe('schema preflight — fail closed on missing schema (A-R1)', { skip: STORAGE_SKIP ? STORAGE_SKIP : false }, () => {
  it('rejects on a missing required schema_migrations id, issuing no DDL', async (t) => {
    const harness = await fixture('preflight-missing-id');
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
    const harness = await fixture('preflight-missing-id-boot');
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

describe('schema preflight — privilege audit is detection-only (A-R3)', { skip: STORAGE_SKIP ? STORAGE_SKIP : false }, () => {
  let harness: GatewayHarness | undefined;
  let client: PoolClient | undefined;
  let roleCreated = false;

  before(async () => {
    if (STORAGE_SKIP) return;
    harness = await fixture('preflight-role-detection');
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

describe('schema preflight — incompatible schema fails boot unchanged (A-R4)', { skip: STORAGE_SKIP ? STORAGE_SKIP : false }, () => {
  it('boot fails, catalog state is identical before/after, zero DDL', async (t) => {
    const harness = await fixture('preflight-boot-reject');
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

describe('schema preflight — never repairs (A-R5)', { skip: STORAGE_SKIP ? STORAGE_SKIP : false }, () => {
  it('leaves a deliberately damaged schema exactly as found', async (t) => {
    const harness = await fixture('preflight-no-repair');
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

describe('schema preflight — a compatible schema passes read-only (GREEN control)', { skip: STORAGE_SKIP ? STORAGE_SKIP : false }, () => {
  it('resolves on a fully migrated schema with a pending_cutover audit', async (t) => {
    const harness = await fixture('preflight-compatible');
    await installDdlObservation(harness);
    const report = await schemaPreflight(harness.pool);
    t.diagnostic(`report: ${JSON.stringify(report)}`);
    assert.equal(report.ok, true);
    assert.equal(report.privilegeAudit.status, 'pending_cutover');
    assert.ok(report.migrationsPresent.includes(REQUIRED_ID_TO_REMOVE));
    const tags = await observedDdlTags(harness);
    assert.deepEqual(tags, [], 'a passing preflight issues no DDL either');
  });
});
