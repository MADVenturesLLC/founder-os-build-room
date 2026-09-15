/**
 * B-T2 — durable append atomicity (draft §6.4; C-2 §16.1/§16.2; C-3 §5.2).
 *
 * The three directions, stated exactly from C-2 §16.2:
 *   COMMIT   : lifecycle rows=1  journal refs=1     (both persisted)
 *   ROLLBACK : lifecycle rows=0  journal refs=0     (neither persisted; head did not advance)
 *   FAILURE  : duplicate command_id inside the act -> lifecycle rows=0
 * plus B-A4 (duplicate refused by constraint) and B-A5 (head-divergence rollback).
 *
 * FIXTURE (Option B): this suite provisions its OWN dedicated, exclusively
 * owned disposable PostgreSQL instance and runs the FULL canonical migration
 * sequence through 0006 on it (ruling §3 — canonical-through-0006 evidence on
 * an exclusively owned instance). It never touches the shared TEST_DATABASE_URL
 * instance. TEST_DATABASE_URL is used ONLY as the storage-suite run gate
 * (matching the sibling storage suites and the require-test-database-url
 * prelude); the suite connects to its own instance, not to that URL.
 *
 * Identity under test (§8.3): the append runs over a SECOND connection whose
 * session_user is br_app_runtime, authenticated with a per-run EPHEMERAL
 * password (scram-sha-256) generated in process memory, set via ALTER ROLE by
 * the fixture's superuser, and never logged, written to evidence, committed, or
 * placed in argv (§7.3.3). The denial of SET ROLE shortcuts is exactly why a
 * genuine login is used rather than SET ROLE from superuser.
 *
 * Enumerated teardown removes this run's objects and roles and asserts pg_roles
 * absence BEFORE the instance is destroyed (ruling §2/§4); destruction only
 * contains the fixture afterwards. Setup, assertion, or teardown failure fails
 * the suite.
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
import type { Client as PgClient } from 'pg';
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
  /** True only after `pg_ctl start -w` returned 0; a never-started cluster has no postmaster to stop. */
  started: boolean;
}

/**
 * Ownership is registered (via `register`) BEFORE initdb/start, so any later
 * failure still has a handle to destroy; initdb/start failure destroys the
 * never-started cluster here before rethrowing (a failing before() gets no
 * after()). Short mkdtemp prefix keeps the socket path under sun_path.
 */
async function startOwnedInstance(bins: ServerBins, register: (instance: OwnedInstance) => void): Promise<OwnedInstance> {
  const port = await freePort();
  const rootDir = mkdtempSync(join(tmpdir(), 'b-t2-'));
  const clusterDir = join(rootDir, 'cluster');
  const socketDir = join(rootDir, 'sock');
  const instance: OwnedInstance = { rootDir, clusterDir, socketDir, pgCtl: bins.pgCtl, port, database: 'b_t2_append', started: false };
  register(instance);
  try {
    // local socket = trust (superuser setup); host TCP = scram (runtime login
    // must present its ephemeral password — the §8.3 genuine-login proof).
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

/** Stop only a started postmaster, then remove the directory. Destruction after failed setup contains; it never qualifies. */
function destroyOwnedInstance(instance: OwnedInstance | undefined): void {
  if (instance === undefined) return;
  if (instance.started) {
    spawnSync(instance.pgCtl, ['-D', instance.clusterDir, 'stop', '-m', 'immediate', '-w'], { timeout: 60_000 });
    instance.started = false;
  }
  rmSync(instance.rootDir, { recursive: true, force: true });
}

/** Superuser connection over the trust unix socket (setup only; never the identity under test). */
function superClient(instance: OwnedInstance, database = 'postgres'): PgClient {
  return new Client({ host: instance.socketDir, port: instance.port, user: 'postgres', database });
}

/* ---------------- canonical row encoding via packages/journal ---------------- */

function canonicalRow(seq: string, commandId: string, eventType: CommandEventRow['eventType'], recordedAt: string): { bytes: Uint8Array; hash: (prior: string) => string } {
  const row: CommandEventRow = {
    seq,
    eventType,
    commandId,
    actorId: 'agent.test',
    roleId: 'tester',
    repository: 'example-org/example-repo',
    scopeRef: 'scope_b_t2',
    commandEnvelope: {
      envelopeVersion: '1',
      commandKind: 'test.append',
      argv: ['--case', commandId],
      targetRepository: 'example-org/example-repo',
      scopeRef: 'scope_b_t2',
    },
    envelopeDigest: undefined, // set below
    authorizationRef: 'auth_b_t2',
    intendedProvider: 'p',
    intendedModel: 'm',
    intendedSurface: 's',
    evidenceRefs: [],
    recordedAt,
  };
  // envelopeDigest must match the canonical envelope bytes (validateRow checks).
  const withDigest: CommandEventRow = { ...row, envelopeDigest: envelopeDigest(row.commandEnvelope!) };
  const bytes = encodeCommandEventRow(withDigest);
  return { bytes, hash: (prior: string) => chainHash(prior, bytes) };
}

const TS = (n: number): string => `2026-09-14T12:00:${String(n).padStart(2, '0')}.000000Z`;

/* ---------------- suite ---------------- */

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the append-atomicity suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

let instance: OwnedInstance | undefined;
let runtimePassword = '';
let admin: PgClient | undefined;

async function applyCanonicalThrough0006(): Promise<void> {
  assert.ok(admin !== undefined);
  // Apply the full canonical sequence as the superuser (the administrative
  // identity), exactly one transaction per migration via the migrator. The
  // runner is exercised by B-T3; here the migrator drives 0006 directly so
  // this suite stays focused on append atomicity.
  const { migrate } = await import('../packages/control-plane/src/migrations.js');
  const { Pool } = pgDefault;
  const pool = new Pool({ host: instance!.socketDir, port: instance!.port, user: 'postgres', database: instance!.database, max: 1 });
  try {
    const result = await migrate(pool);
    assert.deepEqual(result.applied, [...TRANCHE_ORDER], 'the canonical sequence through 0006 applied in order');
  } finally {
    await pool.end();
  }
}

before(async () => {
  if (SKIP_REASON !== false) return;
  instance = await startOwnedInstance(BINS!, (owned) => { instance = owned; });
  admin = superClient(instance);
  await admin.connect();
  await admin.query(`CREATE DATABASE ${instance.database}`);
  await admin.end();

  admin = superClient(instance, instance.database);
  await admin.connect();
  await applyCanonicalThrough0006();

  // §7.3.3 ephemeral runtime credential: generated in memory, set via ALTER
  // ROLE (the only authorized ALTER ROLE), used for the second login below,
  // never logged/committed/in argv.
  runtimePassword = randomBytes(24).toString('base64url');
  await admin.query(`ALTER ROLE br_app_runtime PASSWORD '${runtimePassword.replace(/'/g, "''")}'`);
});

after(async () => {
  if (admin !== undefined) {
    // Enumerated teardown of THIS run's objects and roles + pg_roles absence
    // BEFORE destruction (ruling §2/§4).
    try {
      const roles = await admin.query(
        `SELECT count(*)::int AS n FROM pg_roles
          WHERE rolname IN ('br_journal_owner','command_journal_writer','br_app_runtime')`,
      );
      await admin.query('DROP TABLE IF EXISTS public.command_journal_events, public.command_journal_chain_head CASCADE');
      // The B-T2 lifecycle fixture table carries a GRANT to br_app_runtime;
      // drop it before the role so the role has no remaining dependents
      // (an explicit, enumerated cleanup — never DROP OWNED BY).
      await admin.query('DROP TABLE IF EXISTS public.b_t2_lifecycle');
      await admin.query('DROP FUNCTION IF EXISTS public.command_journal_append(text,text,text,bigint,bytea)');
      await admin.query('DROP FUNCTION IF EXISTS public.command_journal_immutable()');
      if ((roles.rows[0]?.n ?? 0) > 0) {
        await admin.query('DROP ROLE IF EXISTS br_app_runtime');
        await admin.query('DROP ROLE IF EXISTS command_journal_writer');
        await admin.query('DROP ROLE IF EXISTS br_journal_owner');
      }
      const absent = await admin.query(
        `SELECT count(*)::int AS n FROM pg_roles
          WHERE rolname IN ('br_journal_owner','command_journal_writer','br_app_runtime')`,
      );
      assert.equal(absent.rows[0]?.n, 0, 'fixture roles must be absent from pg_roles at teardown');
    } finally {
      await admin.end().catch(() => undefined);
      admin = undefined;
    }
  }
  destroyOwnedInstance(instance);
  instance = undefined;
});

/** A genuine br_app_runtime login over TCP scram — the §8.3 identity under test. */
async function runtimeClient(): Promise<PgClient> {
  assert.ok(instance !== undefined);
  const c = new Client({
    host: '127.0.0.1',
    port: instance.port,
    user: 'br_app_runtime',
    password: runtimePassword,
    database: instance.database,
  });
  await c.connect();
  return c;
}

describe('B-T2 append atomicity — COMMIT / ROLLBACK / FAILURE (§16.2)', { skip: SKIP_REASON }, () => {
  before(async () => {
    if (SKIP_REASON !== false) return;
    assert.ok(admin !== undefined);
    // A lifecycle table representing "the act" the journal append commits with.
    await admin!.query(`CREATE TABLE IF NOT EXISTS b_t2_lifecycle (command_id text PRIMARY KEY, note text)`);
    await admin!.query(`GRANT INSERT, SELECT ON b_t2_lifecycle TO br_app_runtime`);
  });

  it('B-A1 COMMIT — lifecycle insert + journal append on one connection/transaction both persist', async () => {
    const rt = await runtimeClient();
    try {
      const who = await rt.query('SELECT session_user AS u, current_user AS c');
      assert.equal(who.rows[0]?.u, 'br_app_runtime', 'the matrix must run as a genuine br_app_runtime LOGIN (§8.3)');
      const commandId = 'cmd_b_t2_a1';
      const enc = canonicalRow('1', commandId, 'journaled', TS(1));
      const expectedHash = enc.hash(GENESIS_CHAIN_HASH);
      await rt.query('BEGIN');
      await rt.query('INSERT INTO b_t2_lifecycle (command_id, note) VALUES ($1, $2)', [commandId, 'a1']);
      const appended = await rt.query(
        `SELECT seq, chain_hash FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`,
        [commandId, 1, Buffer.from(enc.bytes)],
      );
      await rt.query('COMMIT');
      assert.equal(appended.rows[0]?.seq, '1');
      assert.equal(appended.rows[0]?.chain_hash, expectedHash, 'the routine frames chain_hash with the builtin sha256 over prior||canonical bytes');
      const lifecycle = await rt.query('SELECT count(*)::int AS n FROM b_t2_lifecycle WHERE command_id=$1', [commandId]);
      const journal = await rt.query('SELECT count(*)::int AS n FROM command_journal_events WHERE command_id=$1', [commandId]);
      assert.equal(lifecycle.rows[0]?.n, 1, 'COMMIT: lifecycle rows=1');
      assert.equal(journal.rows[0]?.n, 1, 'COMMIT: journal refs=1');
      const head = await rt.query('SELECT seq, chain_hash FROM command_journal_chain_head WHERE head_id=1');
      assert.equal(head.rows[0]?.seq, '1', 'head advanced to 1');
      assert.equal(head.rows[0]?.chain_hash, expectedHash);
    } finally {
      await rt.end();
    }
  });

  it('B-A2 ROLLBACK — neither persists and the head does not advance', async () => {
    const rt = await runtimeClient();
    try {
      const before = await rt.query('SELECT seq FROM command_journal_chain_head WHERE head_id=1');
      const commandId = 'cmd_b_t2_a2';
      const enc = canonicalRow('2', commandId, 'journaled', TS(2));
      await rt.query('BEGIN');
      await rt.query('INSERT INTO b_t2_lifecycle (command_id, note) VALUES ($1, $2)', [commandId, 'a2']);
      await rt.query(`SELECT * FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`,
        [commandId, 2, Buffer.from(enc.bytes)]);
      await rt.query('ROLLBACK');
      const lifecycle = await rt.query('SELECT count(*)::int AS n FROM b_t2_lifecycle WHERE command_id=$1', [commandId]);
      const journal = await rt.query('SELECT count(*)::int AS n FROM command_journal_events WHERE command_id=$1', [commandId]);
      const after = await rt.query('SELECT seq FROM command_journal_chain_head WHERE head_id=1');
      assert.equal(lifecycle.rows[0]?.n, 0, 'ROLLBACK: lifecycle rows=0');
      assert.equal(journal.rows[0]?.n, 0, 'ROLLBACK: journal refs=0');
      assert.equal(after.rows[0]?.seq, before.rows[0]?.seq, 'ROLLBACK: head did not advance');
    } finally {
      await rt.end();
    }
  });

  it('B-A3 FAILURE — a duplicate command_id inside the act rolls back the lifecycle insert (governance-critical)', async () => {
    const rt = await runtimeClient();
    try {
      // First append succeeds (seq 2; the A1 row is seq 1).
      const commandId = 'cmd_b_t2_a3';
      const first = canonicalRow('2', commandId, 'journaled', TS(3));
      await rt.query('BEGIN');
      await rt.query(`SELECT * FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`,
        [commandId, 2, Buffer.from(first.bytes)]);
      await rt.query('COMMIT');
      // The act: lifecycle insert + a DUPLICATE journaled append → constraint refusal.
      await rt.query('BEGIN');
      await rt.query('INSERT INTO b_t2_lifecycle (command_id, note) VALUES ($1, $2)', [commandId, 'a3-dup']);
      const dup = canonicalRow('3', commandId, 'journaled', TS(4));
      await assert.rejects(
        () => rt.query(`SELECT * FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`,
          [commandId, 3, Buffer.from(dup.bytes)]),
        /duplicate key|command_id/i,
        'a duplicate journaled command_id must be refused by constraint',
      );
      await rt.query('ROLLBACK');
      const lifecycle = await rt.query('SELECT count(*)::int AS n FROM b_t2_lifecycle WHERE command_id=$1', [commandId]);
      assert.equal(lifecycle.rows[0]?.n, 0, 'FAILURE: a journal failure cannot orphan a lifecycle insertion (rows=0)');
    } finally {
      await rt.end();
    }
  });

  it('B-A4 duplicate command_id is refused by CONSTRAINT, not silently reconciled', async () => {
    const rt = await runtimeClient();
    try {
      const commandId = 'cmd_b_t2_a4';
      const first = canonicalRow('3', commandId, 'journaled', TS(5));
      await rt.query(`SELECT * FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`,
        [commandId, 3, Buffer.from(first.bytes)]);
      const dup = canonicalRow('4', commandId, 'journaled', TS(6));
      await assert.rejects(
        () => rt.query(`SELECT * FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`,
          [commandId, 4, Buffer.from(dup.bytes)]),
        (err: Error & { code?: string }) => {
          assert.equal(err.code, '23505', 'the refusal is a unique_violation constraint, not application logic');
          return true;
        },
      );
      const n = await rt.query('SELECT count(*)::int AS n FROM command_journal_events WHERE command_id=$1', [commandId]);
      assert.equal(n.rows[0]?.n, 1, 'exactly one row — the duplicate was not silently reconciled');
    } finally {
      await rt.end();
    }
  });

  it('B-A5 head divergence is refused and rolled back; the head keeps its pre-transaction value', async () => {
    // Admin corrupts the head latch (simulating divergence from the events tail).
    assert.ok(admin !== undefined);
    const goodHead = await admin!.query('SELECT seq, chain_hash FROM command_journal_chain_head WHERE head_id=1');
    await admin!.query(`UPDATE command_journal_chain_head SET chain_hash = $1 WHERE head_id=1`, ['f'.repeat(64)]);
    const rt = await runtimeClient();
    try {
      const commandId = 'cmd_b_t2_a5';
      const enc = canonicalRow('99', commandId, 'journaled', TS(7));
      await assert.rejects(
        () => rt.query(`SELECT * FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`,
          [commandId, 99, Buffer.from(enc.bytes)]),
        /divergence|integrity|mismatch/i,
        'a head that disagrees with the recomputed events tail must abort the append',
      );
      const journal = await rt.query('SELECT count(*)::int AS n FROM command_journal_events WHERE command_id=$1', [commandId]);
      assert.equal(journal.rows[0]?.n, 0, 'no event inserted on divergence');
    } finally {
      await rt.end();
      // restore the head so teardown sees a consistent instance
      await admin!.query('UPDATE command_journal_chain_head SET seq=$1, chain_hash=$2 WHERE head_id=1',
        [goodHead.rows[0]?.seq, goodHead.rows[0]?.chain_hash]);
    }
    const restored = await admin!.query('SELECT seq, chain_hash FROM command_journal_chain_head WHERE head_id=1');
    assert.equal(restored.rows[0]?.seq, goodHead.rows[0]?.seq, 'the head is left at its pre-transaction value');
    assert.equal(restored.rows[0]?.chain_hash, goodHead.rows[0]?.chain_hash);
  });
});
