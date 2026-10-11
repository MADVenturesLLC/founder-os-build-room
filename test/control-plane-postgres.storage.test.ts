/**
 * Phase 2 — the control plane against a real Postgres.
 *
 * Runs only when `TEST_DATABASE_URL` is set, and **says so when it skips**
 * rather than passing silently. A suite that quietly proves less than it
 * appears to is worse than one that admits what it did not run.
 *
 * ```sh
 * TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/buildroom_test npm test
 * ```
 *
 * **`TEST_DATABASE_URL`, deliberately not `DATABASE_URL`.** The latter is the
 * variable the deployed service itself reads. Run `npm test` in any shell that
 * carries the production value — a `.env` sourced by habit, a Railway CLI
 * session, a CI job that exports it for something else — and this suite
 * migrates the production database, writes rooms and events into the live
 * ledger, and fires UPDATE and DELETE at `build_room_events`. The append-only
 * triggers refuse the mutations so history survives, but the test rows do not
 * vanish: they stay in the production ledger and turn up in the next evidence
 * export. A separate variable makes pointing tests at production a deliberate
 * act rather than an ambient one. Raised by CodeRabbit on PR #2.
 *
 * What this covers that the stubbed tests cannot: the schema actually applies,
 * the migrator is genuinely idempotent, append-only is enforced by the
 * database rather than by intention, and — the one that matters most for the
 * Phase 2 run definition — **a fresh process replays the log to the identical
 * state**, which is "survives a restart without data loss" proved at the
 * storage layer rather than inferred from the design.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import pgDefault from 'pg';
import type { Pool } from 'pg';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { createPool } from '../packages/control-plane/src/db.js';
import { migrate } from '../packages/control-plane/src/migrations.js';
import { PostgresLedgerStore, RoomNotFoundError } from '../packages/control-plane/src/store.js';
import { snapshot } from '../packages/ledger/src/index.js';
import { makeEvent } from './helpers.js';
import { RUNTIME_ROLE_MODE, applicationUrl } from './support/runtime-role-mode.js';
import { REVOKE_RUNTIME_GRANTS_SQL } from './support/runtime-role-cleanup.js';

const { Pool: PgPool } = pgDefault;

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
// Config requires a shared secret. This suite exercises the store directly
// rather than through the HTTP surface, so the value is never presented — it
// only has to satisfy the loader.
const TEST_TOKEN = 'integration-suite-token-long-enough';

/*
 * Canonical fixture on an exclusively owned disposable instance (Founder
 * ruling — Gate III storage fixture completion §2, the authorized
 * alternative).
 *
 * This suite is the canonical applier: it runs the FULL migration sequence
 * through 0006_command_journal_authority_split and re-invokes the migrator
 * against that same migrated fixture to prove idempotency. 0006 creates three
 * CLUSTER-WIDE roles, and exclusive ownership of them cannot be established
 * on the shared TEST_DATABASE_URL container: its `buildroom_test` database
 * persists across CI's two storage invocations, so cleanup that removes the
 * roles and objects would leave a recorded-but-absent 0006 for the second
 * invocation — which would then apply nothing and prove nothing about 0006.
 * An owned instance per run gives both invocations a genuine apply →
 * re-apply → cleanup → role-absence cycle. The TEST_DATABASE_URL gate is
 * retained (the storage command refuses to start without it); the server
 * binaries are the additional binding this fixture needs, named on skip.
 */
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

const BINS = resolveServerBinaries();
const skip =
  TEST_DATABASE_URL === undefined || TEST_DATABASE_URL.trim() === '' || BINS === undefined;
const skipReason =
  TEST_DATABASE_URL === undefined || TEST_DATABASE_URL.trim() === ''
    ? 'TEST_DATABASE_URL is not set — the Postgres integration suite did not run'
    : 'PostgreSQL server binaries (initdb/pg_ctl) not resolvable — the canonical Postgres integration suite did not run (set BUILDROOM_TEST_PG_BINDIR or put pg_ctl on PATH)';

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
  /** True only after `pg_ctl start -w` returned 0. */
  started: boolean;
}

/**
 * Ownership is registered (via `register`) BEFORE initdb/start so a later
 * failure still reaches after()'s destroy; initdb/start failure destroys the
 * never-started cluster here and rethrows.
 */
function startOwnedInstance(bins: ServerBins, port: number, register: (instance: OwnedInstance) => void): OwnedInstance {
  // Short prefix: the Unix socket path must stay under the kernel sun_path
  // limit (103 bytes on macOS) even under a long per-user TMPDIR.
  const rootDir = mkdtempSync(join(tmpdir(), 'cpp-'));
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

/** Stop only a started postmaster, then remove the directory. */
function destroyOwnedInstance(instance: OwnedInstance | undefined): void {
  if (instance === undefined) return;
  if (instance.started) {
    spawnSync(instance.pgCtl, ['-D', instance.clusterDir, 'stop', '-m', 'immediate', '-w'], { timeout: 60_000 });
    instance.started = false;
  }
  rmSync(instance.rootDir, { recursive: true, force: true });
}

const JOURNAL_ROLES = ['br_journal_owner', 'command_journal_writer', 'br_app_runtime'] as const;

let instance: OwnedInstance | undefined;
/** The owned fixture database this run migrates and exercises. */
let DATABASE_URL = '';
let pool: Pool | undefined;
/** The pool the store under test uses: the runtime login in runtime-role mode, otherwise `pool` itself. */
let appPool: Pool | undefined;
let store: PostgresLedgerStore | undefined;

/**
 * A fresh room per test, per run.
 *
 * An earlier version numbered rooms from a module counter, which restarts with
 * the process — so a second run against the same database reused the same room
 * ids and every assertion about "created", "transition" and "one rejection"
 * failed on collisions with the previous run's rows. It passed once, against a
 * virgin database, and would have failed on the first re-run in CI. Random ids
 * make each run independent of every run before it.
 */
function nextRoomId(): string {
  return randomUUID();
}

before(async () => {
  if (skip) return;
  const port = await freePort();
  instance = startOwnedInstance(BINS!, port, (owned) => { instance = owned; });
  const admin = new PgPool({ connectionString: `postgresql://postgres@127.0.0.1:${port}/postgres`, max: 1 });
  try {
    await admin.query('CREATE DATABASE buildroom_test');
  } finally {
    await admin.end();
  }
  DATABASE_URL = `postgresql://postgres@127.0.0.1:${port}/buildroom_test`;
  const config = loadConfig({ DATABASE_URL, CONTROL_PLANE_TOKEN: TEST_TOKEN });
  pool = createPool(config);
  // The canonical sequence, selection omitted: every entry through 0006.
  const first = await migrate(pool);
  assert.deepEqual(
    first.applied,
    [
      '0001_ledger_core',
      '0002_pending_rows_carry_no_transition_fields',
      '0003_gateway_registry',
      '0004_validate_pending_is_bare',
      '0005_phase3_run_evidence',
      '0006_command_journal_authority_split',
      '0007_gate_runs',
      '0008_runtime_operational_grants',
      '0009_two_enrolled_gateways',
    ],
    'the full canonical sequence through 0006 applied in order on the owned instance',
  );
  appPool = RUNTIME_ROLE_MODE
    ? createPool(loadConfig({ DATABASE_URL: applicationUrl(DATABASE_URL), CONTROL_PLANE_TOKEN: TEST_TOKEN }))
    : pool;
  store = new PostgresLedgerStore(appPool);
});

after(async () => {
  // Enumerated same-run cleanup of the 0006 objects and roles, then the
  // pg_roles absence assertion — BEFORE the owned instance is destroyed. A
  // failure here fails the suite; destruction afterwards only contains it.
  // Never DROP OWNED BY.
  if (appPool !== undefined && appPool !== pool) await appPool.end().catch(() => undefined);
  appPool = undefined;
  if (pool !== undefined) {
    try {
      await pool.query('DROP TABLE IF EXISTS public.command_journal_events, public.command_journal_chain_head CASCADE');
      await pool.query('DROP FUNCTION IF EXISTS public.command_journal_append(text, text, text, bigint, bytea)');
      await pool.query('DROP FUNCTION IF EXISTS public.command_journal_immutable()');
      // 0008's grants on the ordinary tables would block the role drop; see the helper.
      await pool.query(REVOKE_RUNTIME_GRANTS_SQL);
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
          database: 'buildroom_test',
          residualRoles: rows.map((r) => r.rolname),
        }),
      );
      assert.deepEqual(rows, [], 'every 0006 role must be absent from pg_roles before the owned instance is destroyed');
    } finally {
      await pool.end().catch(() => undefined);
      pool = undefined;
    }
  }
  destroyOwnedInstance(instance);
  instance = undefined;
});

describe('control plane — schema and migrations', { skip: skip ? skipReason : false }, () => {
  it('is idempotent — a second run applies nothing', async () => {
    const second = await migrate(pool!);
    assert.deepEqual(second.applied, [], 'a migrated database should apply nothing');
    assert.ok(second.alreadyApplied.includes('0001_ledger_core'));
    assert.ok(second.alreadyApplied.includes('0006_command_journal_authority_split'));
  });

  it('created the tables the ledger needs', async () => {
    const { rows } = await pool!.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const tables = rows.map((row) => row.table_name);

    for (const expected of [
      'build_room_events',
      'build_room_rejections',
      'build_room_rooms',
      'schema_migrations',
    ]) {
      assert.ok(tables.includes(expected), `missing table ${expected}`);
    }
  });
});

describe('control plane — the append path', { skip: skip ? skipReason : false }, () => {
  it('creates a room idempotently', async () => {
    const roomId = nextRoomId();
    assert.equal((await store!.createRoom(roomId)).created, true);
    assert.equal((await store!.createRoom(roomId)).created, false, 'a retry must not fail');
  });

  it('commits an accepted transition and reads it back', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);

    const result = await store!.append(roomId, makeEvent('scope.captured'));
    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'transition');

    const view = await store!.loadRoom(roomId);
    assert.equal(view.exists, true);
    assert.equal(view.logLength, 1);
    assert.equal(view.state.entries.length, 1);
  });

  it('enforces INV-4 — a replayed event id commits no second row', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);
    const event = makeEvent('scope.captured');

    const first = await store!.append(roomId, event);
    const second = await store!.append(roomId, event);

    assert.equal(first.outcome, 'transition');
    assert.equal(second.outcome, 'replay');

    const { rows } = await pool!.query<{ count: string }>(
      'SELECT count(*) FROM build_room_events WHERE room_id = $1',
      [roomId],
    );
    assert.equal(rows[0]?.count, '1', 'the replay must not add a row');
  });

  it('records a rejection visibly instead of silently declining', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);

    // `plan.approved` does not fire from ROOM_CREATED; the ledger refuses it.
    const result = await store!.append(roomId, makeEvent('plan.approved'));
    assert.equal(result.ok, false);

    const { rows } = await pool!.query<{ code: string; reason: string }>(
      'SELECT code, reason FROM build_room_rejections WHERE room_id = $1',
      [roomId],
    );
    assert.equal(rows.length, 1, 'the refusal must leave a record');
    assert.equal(rows[0]?.code, 'state_not_in_from_set');
  });

  it('refuses to append to a room that does not exist', async () => {
    await assert.rejects(
      () => store!.append(nextRoomId(), makeEvent('scope.captured')),
      RoomNotFoundError,
    );
  });
});

describe('control plane — append-only is enforced by the database', { skip: skip ? skipReason : false }, () => {
  it('rejects an UPDATE against the event log', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);
    await store!.append(roomId, makeEvent('scope.captured'));

    await assert.rejects(
      () => pool!.query('UPDATE build_room_events SET event = $1 WHERE room_id = $2', ['tampered', roomId]),
      /append-only/,
    );
  });

  it('rejects a DELETE against the event log', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);
    await store!.append(roomId, makeEvent('scope.captured'));

    await assert.rejects(
      () => pool!.query('DELETE FROM build_room_events WHERE room_id = $1', [roomId]),
      /append-only/,
    );

    const { rows } = await pool!.query<{ count: string }>(
      'SELECT count(*) FROM build_room_events WHERE room_id = $1',
      [roomId],
    );
    assert.equal(rows[0]?.count, '1', 'the row must survive the attempt');
  });
});

describe('control plane — survives a restart without data loss', { skip: skip ? skipReason : false }, () => {
  it('a fresh pool and store replay the log to the identical state', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);
    await store!.append(roomId, makeEvent('scope.captured'));

    const before = await store!.loadRoom(roomId);

    /*
     * A new pool and a new store is what a restarted process has: no cached
     * state, only the durable log. This is the Founder's third run condition
     * proved at the storage layer — the deployed run proves it end to end,
     * against a process the platform actually restarted.
     */
    const freshPool = createPool(loadConfig({ DATABASE_URL: applicationUrl(DATABASE_URL), CONTROL_PLANE_TOKEN: TEST_TOKEN }));
    try {
      const freshStore = new PostgresLedgerStore(freshPool);
      const after = await freshStore.loadRoom(roomId);

      assert.equal(after.logLength, before.logLength);
      assert.equal(after.state.entries.length, before.state.entries.length);
      assert.deepEqual(snapshot(after.state), snapshot(before.state));
    } finally {
      await freshPool.end();
    }
  });

  it('exports the room ledger for the evidence bundle', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);
    await store!.append(roomId, makeEvent('scope.captured'));
    await store!.append(roomId, makeEvent('plan.approved')); // rejected, recorded

    const exported = await store!.exportRoom(roomId);

    assert.equal(exported.events.length, 1);
    assert.equal(exported.rejections.length, 1, 'rejections are part of the evidence, not omitted');
    assert.ok(exported.events[0]?.['payload'], 'the stored payload is exportable');
  });
});

describe('control plane — the log position is per room', { skip: skip ? skipReason : false }, () => {
  it('numbers each room independently, gaplessly', async () => {
    const first = nextRoomId();
    const second = nextRoomId();
    await store!.createRoom(first);
    await store!.createRoom(second);

    await store!.append(first, makeEvent('scope.captured'));
    const secondRoomFirstAppend = await store!.append(second, makeEvent('scope.captured'));

    assert.equal(secondRoomFirstAppend.ok, true);
    assert.equal(
      'seq' in secondRoomFirstAppend ? secondRoomFirstAppend.seq : -1,
      1,
      'a second room starts its own sequence at 1',
    );
  });
});
