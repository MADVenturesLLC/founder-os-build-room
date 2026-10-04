/**
 * Phase 2 known limit §2 — the gate-run sequence, persisted.
 *
 * `docs/phase-2-known-limits.md` §2: the three-run gate used to count within
 * one harness invocation, from a sequence held in memory, so a re-run
 * restarted the record. The decided design moves the sequence into Postgres
 * (`build_room_gate_runs`, migration `0007_gate_runs`), global to the
 * database and never reset. This suite proves the storage half against a real
 * Postgres:
 *
 * - the migration is registered once, after every earlier migration, and is
 *   idempotent;
 * - `appendGateRun` allocates the next `seq` inside the write transaction —
 *   1, 2, 3 — and a FRESH pool and store over the same database CONTINUE the
 *   sequence (append-after-reopen), never restart it;
 * - `listGateRuns` returns the full persisted sequence in `seq` order;
 * - concurrent appends stay gapless and unique;
 * - the database refuses UPDATE, DELETE and TRUNCATE on the table;
 * - a replayed append (same run id, same content) returns the stored row
 *   rather than a second one, and a conflicting replay is refused;
 * - an unreachable store is a typed hard failure — never an empty list.
 *
 * `0007` follows `0006`, which creates CLUSTER-WIDE roles, so the full
 * sequence is applied on an exclusively owned disposable instance — the same
 * fixture discipline as `control-plane-postgres.storage.test.ts`, and for the
 * same reason. Skips with a named reason when `TEST_DATABASE_URL` or the
 * server binaries are absent.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import pgDefault from 'pg';
import type { Pool } from 'pg';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { createPool } from '../packages/control-plane/src/db.js';
import { MIGRATIONS, migrate } from '../packages/control-plane/src/migrations.js';
import {
  GateRunConflictError,
  GateRunStoreUnavailableError,
  PostgresLedgerStore,
  type GateRunInput,
} from '../packages/control-plane/src/store.js';

import { applicationUrl } from './support/runtime-role-mode.js';

const { Pool: PgPool } = pgDefault;

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
// Satisfies the config loader only; this suite never presents it.
const TEST_TOKEN = 'gate-runs-suite-token-long-enough';
const GATE_RUNS_ID = '0007_gate_runs';

interface ServerBins {
  readonly initdb: string;
  readonly pgCtl: string;
}

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

const BINS = resolveServerBinaries();
const skip =
  TEST_DATABASE_URL === undefined || TEST_DATABASE_URL.trim() === '' || BINS === undefined;
const skipReason =
  TEST_DATABASE_URL === undefined || TEST_DATABASE_URL.trim() === ''
    ? 'TEST_DATABASE_URL is not set — the gate-run storage suite did not run'
    : 'PostgreSQL server binaries (initdb/pg_ctl) not resolvable — the gate-run storage suite did not run (set BUILDROOM_TEST_PG_BINDIR or put pg_ctl on PATH)';

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

interface OwnedInstance {
  readonly rootDir: string;
  readonly clusterDir: string;
  readonly pgCtl: string;
  readonly port: number;
  started: boolean;
}

function startOwnedInstance(bins: ServerBins, port: number, register: (instance: OwnedInstance) => void): OwnedInstance {
  // Short prefix: the Unix socket path must stay under the kernel sun_path limit.
  const rootDir = mkdtempSync(join(tmpdir(), 'grs-'));
  const clusterDir = join(rootDir, 'cluster');
  const socketDir = join(rootDir, 'sock');
  const instance: OwnedInstance = { rootDir, clusterDir, pgCtl: bins.pgCtl, port, started: false };
  register(instance);
  try {
    const init = spawnSync(
      bins.initdb,
      ['-D', clusterDir, '--auth=trust', '--username=postgres', '--no-sync'],
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

function destroyOwnedInstance(instance: OwnedInstance | undefined): void {
  if (instance === undefined) return;
  if (instance.started) {
    spawnSync(instance.pgCtl, ['-D', instance.clusterDir, 'stop', '-m', 'immediate', '-w'], { timeout: 60_000 });
    instance.started = false;
  }
  rmSync(instance.rootDir, { recursive: true, force: true });
}

let instance: OwnedInstance | undefined;
let DATABASE_URL = '';
let pool: Pool | undefined;
let store: PostgresLedgerStore | undefined;
/**
 * The superuser connection: migration and the schema-level append-only proofs.
 * `pool` is what the store under test uses, which in runtime-role mode is the
 * `br_app_runtime` login (see test/support/runtime-role-mode.ts).
 */
let superPool: Pool | undefined;

function openStore(url: string = applicationUrl(DATABASE_URL)): { pool: Pool; store: PostgresLedgerStore } {
  const opened = createPool(loadConfig({ DATABASE_URL: url, CONTROL_PLANE_TOKEN: TEST_TOKEN }));
  return { pool: opened, store: new PostgresLedgerStore(opened) };
}

/** A complete run record, as the harness posts it. `verdict` agrees with the conditions. */
function runInput(verdict: 'passed' | 'failed', runId: string = randomUUID()): GateRunInput {
  const held = verdict === 'passed';
  return {
    gate: 'phase2_three_run',
    runId,
    startedAt: '2026-09-25T10:00:00.000Z',
    endedAt: '2026-09-25T10:01:00.000Z',
    commit: 'abc1234',
    verdict,
    ...(held ? {} : { failureReason: 'survives_restart: store lost a row' }),
    record: {
      runId,
      startedAt: '2026-09-25T10:00:00.000Z',
      endedAt: '2026-09-25T10:01:00.000Z',
      commit: 'abc1234',
      steps: [],
      conditions: [
        { condition: 'deploys_and_stays_up', held: true, evidence: 'healthy' },
        { condition: 'reads_and_writes', held: true, evidence: 'round-trip' },
        { condition: 'survives_restart', held, evidence: held ? 'replayed' : 'store lost a row' },
      ],
      verdict,
      ...(held ? {} : { failureReason: 'survives_restart: store lost a row' }),
    },
  };
}

before(async () => {
  if (skip) return;
  const port = await freePort();
  instance = startOwnedInstance(BINS!, port, (owned) => { instance = owned; });
  const admin = new PgPool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`, max: 1 });
  try {
    await admin.query('CREATE DATABASE buildroom_gate_runs');
  } finally {
    await admin.end();
  }
  DATABASE_URL = `postgresql://postgres@127.0.0.1:${port}/buildroom_gate_runs`;
  superPool = openStore(DATABASE_URL).pool;
  ({ pool, store } = openStore());
  const result = await migrate(superPool);
  assert.ok(result.applied.includes(GATE_RUNS_ID), `the canonical sequence must apply ${GATE_RUNS_ID}`);
});

after(async () => {
  if (pool !== undefined) await pool.end();
  if (superPool !== undefined) await superPool.end();
  destroyOwnedInstance(instance);
});

describe('0007_gate_runs — registration', () => {
  it('is registered exactly once, after every earlier migration', () => {
    const ids = MIGRATIONS.map((migration) => migration.id);
    assert.equal(ids.filter((id) => id === GATE_RUNS_ID).length, 1);
    assert.equal(ids.at(-2), GATE_RUNS_ID);
    assert.equal(ids.at(-3), '0006_command_journal_authority_split');
  });
});

describe('0007_gate_runs — the persisted gate-run sequence', { skip: skip ? skipReason : false }, () => {
  it('is idempotent: a second migrator run applies nothing and the table is intact', async () => {
    const second = await migrate(superPool!);
    assert.deepEqual(second.applied, []);
    assert.ok(second.alreadyApplied.includes(GATE_RUNS_ID));
    const table = await pool!.query(`SELECT to_regclass('public.build_room_gate_runs') AS t`);
    assert.equal(table.rows[0]?.t, 'build_room_gate_runs');
  });

  it('allocates 1, 2, 3 in order and lists the full sequence in seq order', async () => {
    const first = await store!.appendGateRun(runInput('failed'));
    const second = await store!.appendGateRun(runInput('passed'));
    const third = await store!.appendGateRun(runInput('passed'));
    assert.deepEqual([first.run.seq, second.run.seq, third.run.seq], [1, 2, 3]);
    assert.equal(first.created, true);

    const listed = await store!.listGateRuns();
    assert.deepEqual(listed.map((run) => run.seq), [1, 2, 3]);
    assert.deepEqual(listed.map((run) => run.verdict), ['failed', 'passed', 'passed']);
    assert.equal(listed[0]?.failureReason, 'survives_restart: store lost a row');
    assert.deepEqual(listed[1]?.record, runInput('passed', listed[1]!.runId).record);
  });

  it('CONTINUES the sequence after a restart — a fresh pool and store append at 4, never at 1', async () => {
    await pool!.end();
    ({ pool, store } = openStore());
    const before = await store!.listGateRuns();
    assert.deepEqual(before.map((run) => run.seq), [1, 2, 3], 'the reopened store reads the whole record');

    const next = await store!.appendGateRun(runInput('passed'));
    assert.equal(next.run.seq, 4, 'a re-run appends; the record never restarts');
    const after = await store!.listGateRuns();
    assert.deepEqual(after.map((run) => run.seq), [1, 2, 3, 4]);
    assert.equal(after[0]?.verdict, 'failed', 'the earlier failure stays in the record');
  });

  it('keeps the sequence gapless and unique under concurrent appends', async () => {
    const before = (await store!.listGateRuns()).length;
    const results = await Promise.all(
      Array.from({ length: 8 }, () => store!.appendGateRun(runInput('passed'))),
    );
    const seqs = results.map((result) => result.run.seq).sort((a, b) => a - b);
    assert.deepEqual(seqs, Array.from({ length: 8 }, (_, index) => before + index + 1));
    const listed = await store!.listGateRuns();
    assert.deepEqual(listed.map((run) => run.seq), Array.from({ length: listed.length }, (_, index) => index + 1));
  });

  it('returns the stored row for a replayed append, and refuses a conflicting one', async () => {
    const input = runInput('passed');
    const first = await store!.appendGateRun(input);
    const replay = await store!.appendGateRun(input);
    assert.equal(replay.created, false);
    assert.equal(replay.run.seq, first.run.seq);

    const conflicting = runInput('failed', input.runId);
    await assert.rejects(store!.appendGateRun(conflicting), GateRunConflictError);
    const listed = await store!.listGateRuns();
    assert.equal(listed.filter((run) => run.runId === input.runId).length, 1);
  });

  it('refuses UPDATE, DELETE and TRUNCATE at the database', async () => {
    await assert.rejects(superPool!.query(`UPDATE build_room_gate_runs SET verdict = 'passed' WHERE seq = 1`), /append-only/);
    await assert.rejects(superPool!.query('DELETE FROM build_room_gate_runs WHERE seq = 1'), /append-only/);
    await assert.rejects(superPool!.query('TRUNCATE build_room_gate_runs'), /append-only/);
    const listed = await store!.listGateRuns();
    assert.equal(listed[0]?.seq, 1);
    assert.equal(listed[0]?.verdict, 'failed');
  });

  it('refuses a row whose verdict and failure reason disagree', async () => {
    const bad = { ...runInput('failed') } as Record<string, unknown>;
    delete bad['failureReason'];
    await assert.rejects(store!.appendGateRun(bad as unknown as GateRunInput));
  });
});

describe('gate-run store — an unreachable store is a hard failure', () => {
  it('rejects list and append with a typed error, never an empty sequence', async () => {
    const port = await freePort(); // reserved then released: nothing listens there
    const dead = createPool(
      loadConfig({ DATABASE_URL: `postgresql://postgres@127.0.0.1:${port}/none`, CONTROL_PLANE_TOKEN: TEST_TOKEN }),
    );
    const deadStore = new PostgresLedgerStore(dead);
    try {
      await assert.rejects(deadStore.listGateRuns(), GateRunStoreUnavailableError);
      await assert.rejects(deadStore.appendGateRun(runInput('passed')), GateRunStoreUnavailableError);
    } finally {
      await dead.end();
    }
  });
});
