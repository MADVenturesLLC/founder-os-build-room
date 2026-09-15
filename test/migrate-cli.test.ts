/**
 * B-T3 — the bounded administrative migration runner (draft §6.5; C-3 §4.2
 * B-N1; IF-2; r6 §10 stage 4-5).
 *
 * Covers: tranche selection; refusal of an invalid, unknown, absent, or
 * ambiguous tranche; one-tranche-per-run behavior; the required stage-5
 * evidence output shape; and no accidental runtime activation (importing or
 * invoking the CLI starts no server and opens no listener).
 *
 * FIXTURE (Option B, Founder fixture-topology ruling 2026-09-14 + storage
 * fixture-completion ruling): this suite provisions its OWN dedicated,
 * exclusively owned disposable PostgreSQL instance (initdb + pg_ctl into an
 * OS-temp cluster root, destroyed at teardown). It never connects to the
 * shared TEST_DATABASE_URL instance, so it needs no TEST_DATABASE_URL and
 * runs under `npm test` as a unit-level suite (draft §12 row 3). It skips
 * with a NAMED reason only when PostgreSQL server binaries cannot be
 * resolved (the boot-no-ddl F2 precedent).
 *
 * The runner applies the FULL canonical sequence one tranche per invocation,
 * ending with 0006_command_journal_authority_split — so this suite also
 * exercises the canonical migration path through 0006 (ruling §3) on an
 * exclusively owned instance. 0006 creates the three cluster-wide roles;
 * they live and die inside this suite's own cluster. Enumerated teardown
 * removes this run's database; the roles and every object are destroyed
 * with the cluster, and role absence is asserted before destruction.
 *
 * No credential appears in argv, evidence, logs, or assertions: the admin
 * URL travels through the child's environment only, and the cluster runs
 * trust auth on loopback (B-T3 needs no runtime login; the runtime-login
 * suites B-T1/B-T2 use scram and ephemeral in-memory passwords).
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { realpathSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import pgDefault from 'pg';

const { Client } = pgDefault;

/** The compiled runner under test, resolved from this compiled test file. */
const CLI_JS = fileURLToPath(
  new URL('../packages/control-plane/src/migrate-cli.js', import.meta.url),
);

const TRANCHE_A_ID = '0001_ledger_core';
const TRANCHE_C_ID = '0003_gateway_registry';
const TRANCHE_E_ID = '0005_phase3_run_evidence';
const TRANCHE_B_ID = '0006_command_journal_authority_split';

/* ------------------------------------------------------------------ */
/* Dedicated disposable instance (self-contained; no shared helper).   */
/* ------------------------------------------------------------------ */

interface ServerBins {
  readonly initdb: string;
  readonly pgCtl: string;
}

/**
 * Resolve PostgreSQL server binaries: explicit env override first (the
 * CI storage-integration job pins the postgres:16-matching bindir), then
 * pg_config --bindir, then PATH, then the Debian/Ubuntu multiarch layout.
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
  readonly url: string;
  readonly rootDir: string;
  readonly clusterDir: string;
  readonly pgCtl: string;
  readonly port: number;
  /** True only after `pg_ctl start -w` returned 0; a never-started cluster has no postmaster to stop. */
  started: boolean;
}

/**
 * Ownership is registered (via `register`) BEFORE initdb/start; initdb/start
 * failure destroys the never-started cluster here before rethrowing.
 */
async function startOwnedInstance(bins: ServerBins, register: (instance: OwnedInstance) => void): Promise<OwnedInstance> {
  const port = await freePort();
  const rootDir = mkdtempSync(join(tmpdir(), 'b-t3-'));
  const clusterDir = join(rootDir, 'cluster');
  const instance: OwnedInstance = {
    url: `postgresql://postgres@127.0.0.1:${port}/b_t3_migrate`,
    rootDir, clusterDir, pgCtl: bins.pgCtl, port, started: false,
  };
  register(instance);
  try {
    const init = spawnSync(
      bins.initdb,
      ['-D', clusterDir, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--no-sync'],
      { timeout: 120_000, encoding: 'utf8' },
    );
    assert.equal(init.status, 0, `initdb failed:\n${String(init.stdout)}\n${String(init.stderr)}`);
    const start = spawnSync(
      bins.pgCtl,
      [
        '-D', clusterDir,
        '-l', join(rootDir, 'server.log'),
        'start', '-w', '-t', '60',
        '-o', `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp -c fsync=off`,
      ],
      { timeout: 120_000, encoding: 'utf8' },
    );
    assert.equal(
      start.status,
      0,
      `pg_ctl start failed:\n${String(start.stdout)}\n${String(start.stderr)}`,
    );
    instance.started = true;
    return instance;
  } catch (error) {
    destroyOwnedInstance(instance);
    throw error;
  }
}

/** Stop only a started postmaster, then remove the directory. */
function destroyOwnedInstance(instance: OwnedInstance | undefined): void {
  if (instance === undefined) return;
  if (instance.started) {
    spawnSync(instance.pgCtl, ['-D', instance.clusterDir, 'stop', '-m', 'immediate', '-w'], {
      timeout: 60_000,
    });
    instance.started = false;
  }
  rmSync(instance.rootDir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ */
/* Runner invocation                                                   */
/* ------------------------------------------------------------------ */

interface CliRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

function runCli(
  instance: OwnedInstance,
  args: readonly string[],
  opts: { readonly adminUrl?: string | null; readonly env?: Record<string, string> } = {},
): CliRun {
  const env: Record<string, string | undefined> = { ...process.env, ...(opts.env ?? {}) };
  const adminUrl = opts.adminUrl === undefined ? instance.url : opts.adminUrl;
  if (adminUrl !== null) {
    env['MIGRATE_ADMIN_DATABASE_URL'] = adminUrl;
  } else {
    delete env['MIGRATE_ADMIN_DATABASE_URL'];
  }
  const run = spawnSync(process.execPath, [CLI_JS, ...args], {
    env,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: run.status, stdout: run.stdout ?? '', stderr: run.stderr ?? '', timedOut: run.error !== undefined && /ETIMEDOUT/.test(String(run.error)) };
}

const STAGE5_KEYS = [
  'expected_sha',
  'observed_sha',
  'tranche_id',
  'applied_migration_ids',
  'schema_migrations_before',
  'schema_migrations_after',
  'approver_identity',
  'run_id',
  'started_at',
  'finished_at',
] as const;

/* ------------------------------------------------------------------ */

const BINS = resolveServerBinaries();
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries (initdb/pg_ctl) not resolvable — the migrate-cli suite did not run (set BUILDROOM_TEST_PG_BINDIR or put pg_ctl on PATH)'
    : false;

let instance: OwnedInstance | undefined;

before(async () => {
  if (BINS === undefined) return;
  instance = await startOwnedInstance(BINS, (owned) => { instance = owned; });
  const admin = new Client({ connectionString: `postgresql://postgres@127.0.0.1:${instance.port}/postgres` });
  await admin.connect();
  await admin.query('CREATE DATABASE b_t3_migrate');
  await admin.end();
});

after(async () => {
  // Role-absence + object census BEFORE destruction (ruling §2/§4: cleanup
  // evidence is produced while the instance still lives; destruction only
  // contains the fixture afterwards).
  if (instance !== undefined) {
    const admin = new Client({
      connectionString: `postgresql://postgres@127.0.0.1:${instance.port}/postgres`,
    });
    try {
      await admin.connect();
      const roles = await admin.query(
        `SELECT count(*)::int AS n FROM pg_roles
          WHERE rolname IN ('br_journal_owner','command_journal_writer','br_app_runtime')`,
      );
      // Enumerated removal of THIS run's objects and roles, then absence.
      await admin.query('DROP DATABASE IF EXISTS b_t3_migrate');
      if ((roles.rows[0]?.n ?? 0) > 0) {
        await admin.query(
          'DROP TABLE IF EXISTS public.command_journal_events, public.command_journal_chain_head',
        ).catch(() => undefined);
        await admin.query('DROP FUNCTION IF EXISTS public.command_journal_append(text,text,text,bigint,bytea)').catch(() => undefined);
        await admin.query('DROP FUNCTION IF EXISTS public.command_journal_immutable()').catch(() => undefined);
        await admin.query('DROP ROLE IF EXISTS br_app_runtime').catch(() => undefined);
        await admin.query('DROP ROLE IF EXISTS command_journal_writer').catch(() => undefined);
        await admin.query('DROP ROLE IF EXISTS br_journal_owner').catch(() => undefined);
      }
      const absent = await admin.query(
        `SELECT count(*)::int AS n FROM pg_roles
          WHERE rolname IN ('br_journal_owner','command_journal_writer','br_app_runtime')`,
      );
      assert.equal(absent.rows[0]?.n, 0, 'fixture roles must be absent from pg_roles at teardown');
    } finally {
      await admin.end().catch(() => undefined);
    }
  }
  destroyOwnedInstance(instance);
  instance = undefined;
});

describe('B-T3 migrate-cli — usage refusals (fail closed, nothing applied)', { skip: SKIP_REASON }, () => {
  it('refuses an ABSENT selector with a usage error, touching nothing', async () => {
    assert.ok(instance !== undefined);
    const run = runCli(instance, []);
    assert.equal(run.status, 2, `absent selector must exit 2; stderr: ${run.stderr}`);
    assert.match(run.stderr, /tranche selector is required/i);
    const admin = new Client({ connectionString: instance.url });
    await admin.connect();
    const reg = await admin.query(`SELECT to_regclass('public.schema_migrations') AS r`);
    assert.equal(reg.rows[0]?.r, null, 'a usage refusal must create nothing');
    await admin.end();
  });

  it('refuses an EMPTY/whitespace selector as malformed', async () => {
    assert.ok(instance !== undefined);
    const run = runCli(instance, ['   ']);
    assert.equal(run.status, 2, `malformed selector must exit 2; stderr: ${run.stderr}`);
    assert.match(run.stderr, /tranche selector is required/i);
  });

  it('refuses an UNKNOWN selector before migration execution', async () => {
    assert.ok(instance !== undefined);
    const run = runCli(instance, ['9999_not_a_tranche']);
    assert.equal(run.status, 1, `unknown selector must exit 1; stderr: ${run.stderr}`);
    assert.match(run.stderr, /unknown tranche/i);
    const admin = new Client({ connectionString: instance.url });
    await admin.connect();
    const reg = await admin.query(`SELECT to_regclass('public.schema_migrations') AS r`);
    assert.equal(reg.rows[0]?.r, null, 'an unknown-selector refusal must apply nothing');
    await admin.end();
  });

  it('refuses a PARTIAL id (ambiguity cannot arise: exact full-id match only)', async () => {
    assert.ok(instance !== undefined);
    const run = runCli(instance, ['0001']);
    assert.equal(run.status, 1, `partial id must exit 1; stderr: ${run.stderr}`);
    assert.match(run.stderr, /unknown tranche/i);
  });

  it('refuses when the administrative URL environment variable is absent', async () => {
    assert.ok(instance !== undefined);
    const run = runCli(instance, [TRANCHE_A_ID], { adminUrl: null });
    assert.equal(run.status, 2, `missing admin url must exit 2; stderr: ${run.stderr}`);
    assert.match(run.stderr, /MIGRATE_ADMIN_DATABASE_URL/);
  });

  it('fails closed when the database is unreachable, without leaking the credential', async () => {
    assert.ok(instance !== undefined);
    const deadPort = await freePort();
    const deadUrl = `postgresql://postgres@127.0.0.1:${deadPort}/b_t3_migrate`;
    const run = runCli(instance, [TRANCHE_A_ID], { adminUrl: deadUrl });
    assert.equal(run.status, 1, `unreachable database must exit 1; stderr: ${run.stderr}`);
    // The runner's OWN failure marker — a bare module-load failure must not
    // be able to satisfy this row (it also exits 1).
    assert.match(run.stderr, /could not connect to the administrative database/i);
    assert.ok(!run.stderr.includes(deadUrl), 'the connection string must not be echoed');
    assert.ok(!run.stderr.includes('postgres@'), 'no credential-shaped substring in stderr');
  });
});

describe('B-T3 migrate-cli — one tranche per run', { skip: SKIP_REASON }, () => {
  it('refuses a selector whose prefix would apply MORE THAN ONE tranche, applying nothing', async () => {
    assert.ok(instance !== undefined);
    const run = runCli(instance, [TRANCHE_C_ID]);
    assert.equal(run.status, 1, `multi-tranche prefix must exit 1; stderr: ${run.stderr}`);
    assert.match(run.stderr, /one tranche per run/i);
    assert.match(run.stderr, /3/, 'the refusal names how many tranches would apply');
    const admin = new Client({ connectionString: instance.url });
    await admin.connect();
    const reg = await admin.query(`SELECT to_regclass('public.schema_migrations') AS r`);
    assert.equal(reg.rows[0]?.r, null, 'a refused run must apply nothing');
    await admin.end();
  });

  it('applies exactly one tranche per invocation across the canonical sequence', async () => {
    assert.ok(instance !== undefined);
    const order = [
      TRANCHE_A_ID,
      '0002_pending_rows_carry_no_transition_fields',
      TRANCHE_C_ID,
      '0004_validate_pending_is_bare',
      TRANCHE_E_ID,
    ];
    let expectedBefore: string[] = [];
    for (const id of order) {
      const run = runCli(instance, [id]);
      assert.equal(run.status, 0, `apply ${id} must exit 0; stderr: ${run.stderr}`);
      const evidence = JSON.parse(run.stdout.trim()) as Record<string, unknown>;
      for (const key of STAGE5_KEYS) {
        assert.ok(key in evidence, `stage-5 evidence must carry ${key}`);
      }
      assert.equal(evidence['tranche_id'], id);
      assert.deepEqual(evidence['applied_migration_ids'], [id]);
      assert.deepEqual(evidence['schema_migrations_before'], expectedBefore);
      expectedBefore = [...expectedBefore, id];
      assert.deepEqual(evidence['schema_migrations_after'], expectedBefore);
      assert.match(String(evidence['run_id']), /^[0-9a-f-]{36}$/);
      assert.match(String(evidence['started_at']), /^\d{4}-\d{2}-\d{2}T.*Z$/);
      assert.match(String(evidence['finished_at']), /^\d{4}-\d{2}-\d{2}T.*Z$/);
      assert.equal(evidence['expected_sha'], null, 'no workflow env locally: recorded null, never guessed');
      assert.equal(evidence['observed_sha'], null);
      assert.equal(evidence['approver_identity'], null);
    }
  });

  it('applies 0006 — the canonical journal-authority tranche — and records it', async () => {
    assert.ok(instance !== undefined);
    const run = runCli(instance, [TRANCHE_B_ID]);
    assert.equal(run.status, 0, `apply 0006 must exit 0; stderr: ${run.stderr}`);
    const evidence = JSON.parse(run.stdout.trim()) as Record<string, unknown>;
    assert.deepEqual(evidence['applied_migration_ids'], [TRANCHE_B_ID]);
    assert.deepEqual(evidence['schema_migrations_after'], [
      TRANCHE_A_ID,
      '0002_pending_rows_carry_no_transition_fields',
      TRANCHE_C_ID,
      '0004_validate_pending_is_bare',
      TRANCHE_E_ID,
      TRANCHE_B_ID,
    ]);
    const admin = new Client({ connectionString: instance.url });
    await admin.connect();
    const objs = await admin.query(
      `SELECT to_regclass('public.command_journal_events') AS events,
              to_regclass('public.command_journal_chain_head') AS head`,
    );
    assert.notEqual(objs.rows[0]?.events, null, '0006 must create the events table');
    assert.notEqual(objs.rows[0]?.head, null, '0006 must create the chain-head table');
    const roles = await admin.query(
      `SELECT rolname FROM pg_roles
        WHERE rolname IN ('br_journal_owner','command_journal_writer','br_app_runtime')
        ORDER BY rolname`,
    );
    assert.deepEqual(
      roles.rows.map((r: { rolname: string }) => r.rolname),
      ['br_app_runtime', 'br_journal_owner', 'command_journal_writer'],
      '0006 must create the three cluster-wide roles',
    );
    await admin.end();
  });

  it('is idempotent: re-selecting an applied tranche is a recorded no-op success', async () => {
    assert.ok(instance !== undefined);
    const run = runCli(instance, [TRANCHE_B_ID]);
    assert.equal(run.status, 0, `re-select must exit 0; stderr: ${run.stderr}`);
    const evidence = JSON.parse(run.stdout.trim()) as Record<string, unknown>;
    assert.deepEqual(evidence['applied_migration_ids'], []);
    assert.deepEqual(evidence['schema_migrations_before'], evidence['schema_migrations_after']);
  });
});

describe('B-T3 migrate-cli — no runtime activation', { skip: SKIP_REASON }, () => {
  it('emits only stage-5 evidence: no boot events, no listener, clean exit', async () => {
    assert.ok(instance !== undefined);
    // A spawn (not spawnSync) proves the process EXITS on its own — a CLI
    // that opened a listener would hang until the watchdog kills it.
    const child = spawn(process.execPath, [CLI_JS, TRANCHE_B_ID], {
      env: { ...process.env, MIGRATE_ADMIN_DATABASE_URL: instance.url },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = await new Promise<string>((resolve, reject) => {
      let out = '';
      let err = '';
      const watchdog = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`CLI did not exit on its own within 30s (listener opened?); stderr: ${err}`));
      }, 30_000);
      child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { err += d.toString(); });
      child.on('close', (code) => {
        clearTimeout(watchdog);
        if (code !== 0) reject(new Error(`CLI exited ${code}; stderr: ${err}`));
        else resolve(out);
      });
    });
    assert.ok(!stdout.includes('boot.'), 'no boot lifecycle events on stdout');
    const evidence = JSON.parse(stdout.trim()) as Record<string, unknown>;
    assert.equal(evidence['tranche_id'], TRANCHE_B_ID);
  });

  it('the compiled CLI neither imports nor spawns the runtime entrypoint', async () => {
    const compiled = readFileSync(CLI_JS, 'utf8');
    assert.ok(!compiled.includes('main.js'), 'migrate-cli must not import the server entrypoint');
    assert.ok(!/from ['"]express['"]/.test(compiled), 'migrate-cli must not import the HTTP surface');
    assert.ok(!compiled.includes('.listen('), 'migrate-cli must not open a listener');
  });
});
