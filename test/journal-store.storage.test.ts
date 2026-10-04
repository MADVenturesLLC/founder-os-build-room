/**
 * The single journal module (`packages/control-plane/src/journal-store.ts`)
 * over a genuine `br_app_runtime` LOGIN — contract §3 sole writer, §4.1
 * append serialization, §5.1 fail closed, §6 secrets.
 *
 * FIXTURE (Option B, as `journal-append-atomicity.storage.test.ts`): this
 * suite provisions its OWN dedicated, exclusively owned disposable
 * PostgreSQL instance and runs the FULL canonical migration sequence
 * (through `0006` and `0007`) on it. It never touches the shared
 * TEST_DATABASE_URL instance; that variable is used ONLY as the
 * storage-suite run gate, matching the sibling storage suites.
 *
 * Identity under test (plan r1 PO-1): the store's pool authenticates as
 * `br_app_runtime` over TCP scram with a per-run EPHEMERAL password set by
 * the fixture's superuser and never logged, committed, or placed in argv. A
 * superuser connection would pass tests that production fails — the
 * routine's EXECUTE grant is to `br_app_runtime` alone.
 *
 * What is proven here, in order: the persisted bytes are exactly
 * `encodeCommandEventRow` of the submitted fields at the persisted `seq`
 * with the injected clock's `recordedAt`; the chain hash frames as
 * `packages/journal` frames; concurrent appends stay gapless; a seq race
 * is retried by RE-ENCODING at the new seq (with a rolled-back control
 * showing why: the routine does not cross-check the embedded seq); retries
 * are bounded; an integrity finding is surfaced, never retried, and writes
 * nothing; a duplicate `journaled` event is refused by constraint; a login
 * without EXECUTE is `42501` mapped to runtime-not-authorized; the runtime
 * login without SELECT on the head table fails at the head read with
 * `42501`, mapped the same way and answered `503` through the real
 * `createServer` with the routine never called; THE IDENTITY LATCH: on a
 * second cluster whose migrations were applied BY a CREATEROLE
 * non-superuser admin login (Neon's owner shape; `0006` applies for it
 * unaided, see journal-migration-nonsuperuser.storage.test.ts), that login
 * is refused before any
 * journal statement — 503, zero rows — while WITHOUT the latch its append
 * through the routine succeeds, which is the measured answer to whether
 * the bypass is real (Founder disposition of review finding 4115032242);
 * an unreachable database is store-unavailable; and, last, every row the
 * suite left behind re-encodes to its own column `seq` and re-chains from
 * genesis.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { realpathSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pgDefault from 'pg';
import { REVOKE_RUNTIME_GRANTS_SQL } from './support/runtime-role-cleanup.js';
import type { Client as PgClient, Pool as PgPool, PoolClient, QueryResult } from 'pg';
import { createServer as createControlPlane } from '../packages/control-plane/src/server.js';
import { createGatewaySurface } from '../packages/control-plane/src/gateway/index.js';
import type { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { closeServer } from './support/close-server.js';
import {
  GENESIS_CHAIN_HASH,
  chainHash,
  encodeCommandEventRow,
  envelopeDigest,
  normalizeForJournal,
  type CommandEventRow,
  type GovernedCommandRequest,
} from '../packages/journal/src/index.js';
import {
  JournalContendedError,
  JournalDuplicateEventError,
  JournalIntegrityError,
  JournalRuntimeNotAuthorizedError,
  JournalStore,
  JournalStoreUnavailableError,
} from '../packages/control-plane/src/journal-store.js';

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
  started: boolean;
}

async function startOwnedInstance(bins: ServerBins, register: (instance: OwnedInstance) => void): Promise<OwnedInstance> {
  const port = await freePort();
  const rootDir = mkdtempSync(join(tmpdir(), 'br-js-'));
  const clusterDir = join(rootDir, 'cluster');
  const socketDir = join(rootDir, 'sock');
  const instance: OwnedInstance = { rootDir, clusterDir, socketDir, pgCtl: bins.pgCtl, port, database: 'br_journal_store', started: false };
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

/* ---------------- requests, expected rows, and the registry of what was written ---------------- */

const CLOCK_AT = new Date('2026-09-26T18:30:00.000Z');
const RECORDED_AT = '2026-09-26T18:30:00.000000Z';
const now = (): Date => CLOCK_AT;

function request(commandId: string, overrides: Partial<GovernedCommandRequest> = {}): GovernedCommandRequest {
  return {
    commandKind: 'planner.invoke',
    argv: ['--goal', `case ${commandId}`],
    actorId: 'session:test/journal-store',
    roleId: 'builder',
    authorizationRef: 'HO-20260926-01',
    repository: 'example-org/example-repo',
    scopeRef: 'scope/phase4',
    intendedProvider: 'example-provider',
    intendedModel: 'example-model',
    intendedSurface: 'claude-code',
    evidenceRefs: ['ev_js_1'],
    commandId,
    ...overrides,
  };
}

/** The `journaled` row exactly as `dispatchGovernedCommand` builds it, at a given seq and clock reading. */
function expectedRow(req: GovernedCommandRequest, seq: string, recordedAt = RECORDED_AT): CommandEventRow {
  assert.ok(req.commandId !== undefined);
  const envelope = normalizeForJournal(req);
  return {
    seq,
    eventType: 'journaled',
    commandId: req.commandId,
    actorId: req.actorId,
    roleId: req.roleId,
    repository: req.repository,
    scopeRef: req.scopeRef,
    commandEnvelope: envelope,
    envelopeDigest: envelopeDigest(envelope),
    authorizationRef: req.authorizationRef,
    intendedProvider: req.intendedProvider,
    intendedModel: req.intendedModel,
    intendedSurface: req.intendedSurface,
    evidenceRefs: req.evidenceRefs ?? [],
    recordedAt,
  };
}

function expectedBytes(req: GovernedCommandRequest, seq: string, recordedAt = RECORDED_AT): Uint8Array {
  return encodeCommandEventRow(expectedRow(req, seq, recordedAt));
}

/** Every command this suite appends, by whatever path, so the final sweep can re-encode each persisted row. */
const written = new Map<string, { readonly request: GovernedCommandRequest; readonly recordedAt: string }>();

function remember(req: GovernedCommandRequest, recordedAt = RECORDED_AT): GovernedCommandRequest {
  assert.ok(req.commandId !== undefined);
  written.set(req.commandId, { request: req, recordedAt });
  return req;
}

interface EventRow {
  readonly seq: string;
  readonly record_class: string;
  readonly event_type: string;
  readonly command_id: string;
  readonly chain_hash: string;
  readonly row_bytes: Buffer;
}

/* ---------------- suite state ---------------- */

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the journal-store suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

let instance: OwnedInstance | undefined;
let runtimePassword = '';
let admin: PgClient | undefined;
let runtimePool: PgPool | undefined;
let store: JournalStore | undefined;

async function applyCanonicalSequence(): Promise<void> {
  assert.ok(instance !== undefined);
  const { migrate } = await import('../packages/control-plane/src/migrations.js');
  const pool = new Pool({ host: instance.socketDir, port: instance.port, user: 'postgres', database: instance.database, max: 1 });
  try {
    const result = await migrate(pool);
    assert.deepEqual(result.applied, [...TRANCHE_ORDER], 'the canonical sequence through 0007 applied in order');
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
  await applyCanonicalSequence();

  // Ephemeral runtime credential: generated in memory, set via ALTER ROLE,
  // used for the pool under test, never logged, committed, or in argv.
  runtimePassword = randomBytes(24).toString('base64url');
  await admin.query(`ALTER ROLE br_app_runtime PASSWORD '${runtimePassword.replace(/'/g, "''")}'`);

  runtimePool = new Pool({
    host: '127.0.0.1',
    port: instance.port,
    user: 'br_app_runtime',
    password: runtimePassword,
    database: instance.database,
    max: 8,
  });
  store = new JournalStore(runtimePool, { now });
});

after(async () => {
  await runtimePool?.end().catch(() => undefined);
  runtimePool = undefined;
  if (admin !== undefined) {
    try {
      const roles = await admin.query(
        `SELECT count(*)::int AS n FROM pg_roles
          WHERE rolname IN ('br_journal_owner','command_journal_writer','br_app_runtime')`,
      );
      await admin.query('DROP TABLE IF EXISTS public.command_journal_events, public.command_journal_chain_head CASCADE');
      await admin.query('DROP FUNCTION IF EXISTS public.command_journal_append(text,text,text,bigint,bytea)');
      await admin.query('DROP FUNCTION IF EXISTS public.command_journal_immutable()');
      if ((roles.rows[0]?.n ?? 0) > 0) {
        // 0008's grants on the ordinary tables would block the role drop; see the helper.
        await admin.query(REVOKE_RUNTIME_GRANTS_SQL);
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

/* ---------------- helpers over the live instance ---------------- */

/** A genuine br_app_runtime login over TCP scram, for direct competing appends. */
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

async function eventRow(commandId: string): Promise<EventRow | undefined> {
  const { rows } = await admin!.query<EventRow>(
    'SELECT seq::text AS seq, record_class, event_type, command_id, chain_hash, row_bytes FROM public.command_journal_events WHERE command_id = $1',
    [commandId],
  );
  return rows[0];
}

async function rowCount(commandId: string): Promise<number> {
  const { rows } = await admin!.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM public.command_journal_events WHERE command_id = $1',
    [commandId],
  );
  return rows[0]?.n ?? 0;
}

async function head(): Promise<{ seq: string; chainHash: string }> {
  const { rows } = await admin!.query<{ seq: string; chain_hash: string }>(
    'SELECT seq::text AS seq, chain_hash FROM public.command_journal_chain_head WHERE head_id = 1',
  );
  assert.ok(rows[0] !== undefined, 'the head row must exist');
  return { seq: rows[0].seq, chainHash: rows[0].chain_hash };
}

/**
 * A competing append that goes around the store: reads the head, encodes at
 * head + 1, calls the routine directly as br_app_runtime. Used to force the
 * seq race the store must survive.
 */
async function competingAppend(commandId: string): Promise<{ seq: string }> {
  const req = remember(request(commandId));
  const rt = await runtimeClient();
  try {
    const current = await rt.query<{ seq: string }>('SELECT seq::text AS seq FROM public.command_journal_chain_head WHERE head_id = 1');
    const seq = String(BigInt(current.rows[0]!.seq) + 1n);
    const bytes = expectedBytes(req, seq);
    const appended = await rt.query<{ seq: string }>(
      `SELECT seq::text AS seq FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`,
      [commandId, seq, Buffer.from(bytes)],
    );
    return { seq: appended.rows[0]!.seq };
  } finally {
    await rt.end();
  }
}

interface InterceptCounts { headReads: number; routineCalls: number; }

/**
 * Wraps the real runtime pool so a test can act between the store's head
 * read and its routine call — the window in which the race happens — and
 * count how many times each statement was issued. No production seam: the
 * store sees an ordinary `Pool`.
 */
function interceptingPool(
  base: PgPool,
  hooks: { readonly onHeadRead?: (n: number) => Promise<void>; readonly headRows?: unknown[] } = {},
): { pool: PgPool; counts: InterceptCounts } {
  const counts: InterceptCounts = { headReads: 0, routineCalls: 0 };
  const wrap = (client: PoolClient): PoolClient => ({
    query: async (sql: string, params?: unknown[]): Promise<QueryResult> => {
      const isHeadRead = /FROM public\.command_journal_chain_head/.test(sql);
      const isRoutine = /public\.command_journal_append\(/.test(sql);
      if (isRoutine) counts.routineCalls += 1;
      const result = await client.query(sql, params);
      if (isHeadRead) {
        counts.headReads += 1;
        if (hooks.onHeadRead) await hooks.onHeadRead(counts.headReads);
        if (hooks.headRows !== undefined) return { ...result, rows: hooks.headRows, rowCount: hooks.headRows.length };
      }
      return result;
    },
    release: () => client.release(),
  }) as unknown as PoolClient;
  const pool = {
    connect: async () => wrap(await base.connect()),
    query: (sql: string, params?: unknown[]) => base.query(sql, params),
    on: () => undefined,
    end: async () => undefined,
  } as unknown as PgPool;
  return { pool, counts };
}

/* ---------------- a real control plane over an injected journal store ---------------- */

const HTTP_TOKEN = 'journal-store-storage-token-that-is-long-enough';
const HTTP_CONFIG = loadConfig({
  DATABASE_URL: 'postgresql://user:secret@host.neon.tech/db?sslmode=require',
  CONTROL_PLANE_TOKEN: HTTP_TOKEN,
  COMMIT_SHA: 'deadbeef',
});

/** Answers only the lease statements leadership issues; everything else is empty (as in the route tests). */
function fakeLeaderPool(): PgPool {
  let ownerId: string | null = null;
  const challenge = 'a'.repeat(64);
  const answer = async (sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> => {
    if (/UPDATE control_plane_lease\s+SET owner_id = \$1, generation/.test(sql)) {
      ownerId = String(params[0]);
      return { rows: [{ generation: '1', challenge: String(params[1]) }], rowCount: 1 };
    }
    if (/FROM control_plane_lease WHERE id = 1 FOR UPDATE/.test(sql)) {
      return {
        rows: [{ id: 1, owner_id: ownerId, generation: '1', heartbeat_at: new Date(), challenge, challenge_published_at: new Date() }],
        rowCount: 1,
      };
    }
    if (/SELECT now\(\)/.test(sql)) return { rows: [{ now: new Date() }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const client = { query: (sql: string, params?: unknown[]) => answer(sql, params), release: () => undefined };
  return {
    query: (sql: string, params?: unknown[]) => answer(sql, params),
    connect: async () => client,
    on: () => undefined,
    end: async () => undefined,
  } as unknown as PgPool;
}

/** The room routes are not under test here; reaching the ledger store is a failure. */
const explodingLedgerStore = new Proxy(
  {},
  {
    get: () => () => {
      throw new Error('a journal storage test reached the ledger store');
    },
  },
) as unknown as PostgresLedgerStore;

/** The real `createServer`, with the journal store under test injected through `ServerDeps.journalStore`. */
async function startControlPlane(journalStore: JournalStore): Promise<{ url: string; stop: () => Promise<void> }> {
  const gateway = createGatewaySurface({ pool: fakeLeaderPool(), config: HTTP_CONFIG, log: () => undefined });
  const dummyPool = { query: async () => ({ rows: [] }) } as unknown as PgPool;
  const app = createControlPlane({
    config: HTTP_CONFIG,
    pool: dummyPool,
    store: explodingLedgerStore,
    startedAt: Date.now(),
    gateway,
    journalStore,
  });
  const server: Server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  await gateway.leadership.attemptAcquisition();
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    stop: async () => {
      await gateway.stop();
      await closeServer(server);
    },
  };
}

/* ---------------- the suite ---------------- */

describe('journal store — identity and the happy path (contract §3, §4.1, §6)', { skip: SKIP_REASON }, () => {
  it('runs over a genuine br_app_runtime LOGIN, not a superuser (plan r1 PO-1)', async () => {
    const who = await runtimePool!.query<{ u: string; s: boolean }>('SELECT session_user AS u, (SELECT rolsuper FROM pg_roles WHERE rolname = session_user) AS s');
    assert.equal(who.rows[0]?.u, 'br_app_runtime');
    assert.equal(who.rows[0]?.s, false);
  });

  it('persists exactly encodeCommandEventRow of the submitted fields at the persisted seq with the injected clock, chained as packages/journal chains', async () => {
    // Two redaction paths in one argv: a secret-bearing flag's value and a
    // token-SHAPED entry (clearly synthetic: a prefix and repeated x's).
    const tokenShaped = `ghp_${'x'.repeat(36)}`;
    const req = remember(request('cmd_js_happy', { argv: ['--goal', 'happy path', '--token', 'hunter2-example-secret', tokenShaped] }));
    const result = await store!.appendJournaled(req);
    assert.equal(result.commandId, 'cmd_js_happy');
    assert.equal(result.seq, '1');

    const row = await eventRow('cmd_js_happy');
    assert.ok(row !== undefined, 'the row is committed');
    assert.equal(row.record_class, 'command');
    assert.equal(row.event_type, 'journaled');
    assert.equal(row.seq, '1');
    const bytes = expectedBytes(req, '1');
    assert.deepEqual(Buffer.from(row.row_bytes), Buffer.from(bytes), 'row_bytes are the canonical spec (c) bytes of the submitted fields');
    assert.equal(row.chain_hash, chainHash(GENESIS_CHAIN_HASH, bytes), 'chain_hash = chainHash(genesis, row_bytes)');
    assert.equal(result.chainHash, row.chain_hash);
    assert.equal(result.envelopeDigest, envelopeDigest(normalizeForJournal(req)));
    assert.ok(!Buffer.from(row.row_bytes).includes('hunter2-example-secret'), 'redaction ran before the write (§6.1): the secret-bearing argv value is not in the persisted bytes');
    assert.ok(!Buffer.from(row.row_bytes).includes(tokenShaped), 'nor is the token-shaped entry');
    assert.ok(Buffer.from(row.row_bytes).includes('[REDACTED]'), 'the redaction marker is what was persisted');

    const latch = await head();
    assert.equal(latch.seq, '1');
    assert.equal(latch.chainHash, result.chainHash);
  });

  it('chains the next append on the prior row and advances the head', async () => {
    const req = remember(request('cmd_js_second'));
    const prior = await head();
    const result = await store!.appendJournaled(req);
    assert.equal(result.seq, String(BigInt(prior.seq) + 1n));
    const row = await eventRow('cmd_js_second');
    assert.ok(row !== undefined);
    assert.equal(row.chain_hash, chainHash(prior.chainHash, expectedBytes(req, result.seq)));
    assert.deepEqual(await head(), { seq: result.seq, chainHash: result.chainHash });
  });

  it('mints a cmd_ id when none is supplied and the persisted bytes carry the minted id', async () => {
    const { commandId: _omitted, ...withoutId } = request('cmd_placeholder');
    void _omitted;
    const result = await store!.appendJournaled(withoutId);
    assert.match(result.commandId, /^cmd_[0-9a-f]{24}$/);
    const req = remember({ ...withoutId, commandId: result.commandId });
    const row = await eventRow(result.commandId);
    assert.ok(row !== undefined);
    assert.deepEqual(Buffer.from(row.row_bytes), Buffer.from(expectedBytes(req, result.seq)));
  });

  it('takes recorded_at from the injected clock, in canonical form — the request has no field for it', async () => {
    const laterClock = new Date('2026-09-26T19:00:00.123Z');
    const laterStore = new JournalStore(runtimePool!, { now: () => laterClock });
    const req = remember(request('cmd_js_clock'), '2026-09-26T19:00:00.123000Z');
    const result = await laterStore.appendJournaled(req);
    const row = await eventRow('cmd_js_clock');
    assert.ok(row !== undefined);
    assert.deepEqual(Buffer.from(row.row_bytes), Buffer.from(expectedBytes(req, result.seq, '2026-09-26T19:00:00.123000Z')));
    assert.notDeepEqual(Buffer.from(row.row_bytes), Buffer.from(expectedBytes(req, result.seq, RECORDED_AT)));
  });
});

describe('journal store — seq under contention (contract §4.1 append serialization)', { skip: SKIP_REASON }, () => {
  it('concurrent appends yield gapless seqs and every persisted row re-encodes to its own persisted seq', async () => {
    const before = await head();
    const reqs = [1, 2, 3, 4, 5].map((i) => remember(request(`cmd_js_conc_${i}`)));
    const results = await Promise.all(reqs.map((req) => store!.appendJournaled(req)));
    const seqs = results.map((r) => BigInt(r.seq)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const expected = [1n, 2n, 3n, 4n, 5n].map((k) => BigInt(before.seq) + k);
    assert.deepEqual(seqs, expected, 'gapless, unique, and consecutive from the prior head');
    for (const req of reqs) {
      const row = await eventRow(req.commandId!);
      assert.ok(row !== undefined);
      assert.deepEqual(Buffer.from(row.row_bytes), Buffer.from(expectedBytes(req, row.seq)), `${req.commandId}: bytes embed the column seq ${row.seq}`);
    }
  });

  it('control: the routine trusts the caller — stale bytes at a bumped p_seq are ACCEPTED (rolled back here), which is why a retry must re-encode', async () => {
    const rt = await runtimeClient();
    try {
      const current = await head();
      const staleSeq = String(BigInt(current.seq) + 1n);
      const bumpedSeq = String(BigInt(current.seq) + 2n);
      const stale = expectedBytes(request('cmd_js_stale_control'), staleSeq);
      await rt.query('BEGIN');
      // First, occupy staleSeq legitimately inside the same transaction.
      const filler = expectedBytes(request('cmd_js_stale_filler'), staleSeq);
      await rt.query(`SELECT seq FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`, ['cmd_js_stale_filler', staleSeq, Buffer.from(filler)]);
      // Then submit bytes encoded at staleSeq with p_seq = staleSeq + 1: the routine accepts them.
      const accepted = await rt.query<{ seq: string }>(
        `SELECT seq::text AS seq FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`,
        ['cmd_js_stale_control', bumpedSeq, Buffer.from(stale)],
      );
      assert.equal(accepted.rows[0]?.seq, bumpedSeq, 'no cross-check of the embedded seq: the hazard is real');
      await rt.query('ROLLBACK');
      assert.equal(await rowCount('cmd_js_stale_control'), 0, 'the control left nothing behind');
      assert.equal(await rowCount('cmd_js_stale_filler'), 0);
      assert.deepEqual(await head(), current, 'the head is unchanged after the rollback');
    } finally {
      await rt.end();
    }
  });

  it('a forced race is retried by re-reading the head and RE-ENCODING at the new seq — never resubmitting the same bytes', async () => {
    let fired = false;
    const { pool, counts } = interceptingPool(runtimePool!, {
      onHeadRead: async () => {
        if (fired) return;
        fired = true;
        await competingAppend('cmd_js_race_competitor');
      },
    });
    const racy = new JournalStore(pool, { now });
    const req = remember(request('cmd_js_race_victim'));
    const result = await racy.appendJournaled(req);

    assert.equal(counts.headReads, 2, 'the head was re-read after the refusal');
    assert.equal(counts.routineCalls, 2, 'one refused attempt, one successful retry');
    const competitor = await eventRow('cmd_js_race_competitor');
    assert.ok(competitor !== undefined);
    assert.equal(BigInt(result.seq), BigInt(competitor.seq) + 1n, 'the retry landed right after the competitor');
    const victim = await eventRow('cmd_js_race_victim');
    assert.ok(victim !== undefined);
    assert.deepEqual(Buffer.from(victim.row_bytes), Buffer.from(expectedBytes(req, result.seq)), 'the persisted bytes embed the NEW seq');
    assert.notDeepEqual(Buffer.from(victim.row_bytes), Buffer.from(expectedBytes(req, competitor.seq)), 'not the stale bytes from the first attempt');
    assert.equal(victim.chain_hash, chainHash(competitor.chain_hash, expectedBytes(req, result.seq)));
  });

  it('retries are bounded: a race on every attempt surfaces as contended, with nothing written for the loser', async () => {
    const { pool, counts } = interceptingPool(runtimePool!, {
      onHeadRead: async (n) => {
        await competingAppend(`cmd_js_contend_${n}`);
      },
    });
    const contended = new JournalStore(pool, { now, maxSeqRaceRetries: 2 });
    await assert.rejects(
      contended.appendJournaled(remember(request('cmd_js_contend_loser'))),
      (err: unknown) => err instanceof JournalContendedError && err.attempts === 3,
    );
    assert.equal(counts.routineCalls, 3, 'the first attempt plus exactly two retries');
    assert.equal(await rowCount('cmd_js_contend_loser'), 0, 'the loser wrote nothing');
    written.delete('cmd_js_contend_loser');
    for (const n of [1, 2, 3]) assert.equal(await rowCount(`cmd_js_contend_${n}`), 1);
  });
});

describe('journal store — integrity findings are surfaced, never retried, never success (contract §5.1)', { skip: SKIP_REASON }, () => {
  it('chain head divergence: one routine call, an integrity error, no row, head untouched', async () => {
    const good = await head();
    await admin!.query('UPDATE public.command_journal_chain_head SET chain_hash = $1 WHERE head_id = 1', ['f'.repeat(64)]);
    const { pool, counts } = interceptingPool(runtimePool!);
    const diverged = new JournalStore(pool, { now });
    try {
      await assert.rejects(
        diverged.appendJournaled(request('cmd_js_diverge')),
        (err: unknown) => err instanceof JournalIntegrityError && err.finding === 'chain_head_divergence',
      );
      assert.equal(counts.routineCalls, 1, 'an integrity finding is not retried');
      assert.equal(await rowCount('cmd_js_diverge'), 0, 'nothing was inserted');
      const corrupted = await head();
      assert.equal(corrupted.seq, good.seq, 'the head did not advance');
    } finally {
      await admin!.query('UPDATE public.command_journal_chain_head SET seq = $1, chain_hash = $2 WHERE head_id = 1', [good.seq, good.chainHash]);
    }
    assert.deepEqual(await head(), good);
  });

  it('chain head absent: the store refuses before calling the routine', async () => {
    const { pool, counts } = interceptingPool(runtimePool!, { headRows: [] });
    const headless = new JournalStore(pool, { now });
    await assert.rejects(
      headless.appendJournaled(request('cmd_js_headless')),
      (err: unknown) => err instanceof JournalIntegrityError && err.finding === 'chain_head_absent',
    );
    assert.equal(counts.routineCalls, 0);
    assert.equal(await rowCount('cmd_js_headless'), 0);
  });

  it('a duplicate journaled event for the same commandId is refused by constraint and writes nothing', async () => {
    const req = remember(request('cmd_js_dup'));
    await store!.appendJournaled(req);
    const after = await head();
    await assert.rejects(
      store!.appendJournaled(request('cmd_js_dup', { argv: ['--goal', 'a second story for one command'] })),
      (err: unknown) =>
        err instanceof JournalDuplicateEventError
        && err.commandId === 'cmd_js_dup'
        && (err.cause as { code?: string } | undefined)?.code === '23505',
    );
    assert.equal(await rowCount('cmd_js_dup'), 1, 'exactly one row — the duplicate was not silently reconciled');
    assert.deepEqual(await head(), after, 'the refusal did not advance the head');
  });
});

describe('journal store — authorization and reachability map to distinct, fail-closed errors', { skip: SKIP_REASON }, () => {
  it('the runtime login without EXECUTE on the routine (revoked for this case) gets 42501, mapped to runtime-not-authorized, and writes nothing', async () => {
    // The identity latch refuses every other login before any statement, so
    // the SQLSTATE path is exercised as br_app_runtime itself, with the one
    // privilege taken away and given back.
    await admin!.query('REVOKE EXECUTE ON FUNCTION public.command_journal_append(text, text, text, bigint, bytea) FROM br_app_runtime');
    try {
      const { pool, counts } = interceptingPool(runtimePool!);
      const unauthorized = new JournalStore(pool, { now });
      await assert.rejects(
        unauthorized.appendJournaled(request('cmd_js_no_execute')),
        (err: unknown) =>
          err instanceof JournalRuntimeNotAuthorizedError
          && (err.cause as { code?: string } | undefined)?.code === '42501',
      );
      assert.equal(counts.routineCalls, 1, 'the refusal came from the routine call itself');
      assert.equal(await rowCount('cmd_js_no_execute'), 0);
    } finally {
      await admin!.query('GRANT EXECUTE ON FUNCTION public.command_journal_append(text, text, text, bigint, bytea) TO br_app_runtime');
    }
  });

  it('the runtime login without SELECT on command_journal_chain_head (revoked for this case) fails at the head read with 42501: 503 journal_runtime_not_authorized, the routine never called, nothing written', async () => {
    await admin!.query('REVOKE SELECT ON public.command_journal_chain_head FROM br_app_runtime');
    const { pool, counts } = interceptingPool(runtimePool!);
    const noSelect = new JournalStore(pool, { now });
    const plane = await startControlPlane(noSelect);
    try {
      // The store: the typed error, carrying the SQLSTATE, from the head read.
      await assert.rejects(
        noSelect.appendJournaled(request('cmd_js_no_select')),
        (err: unknown) =>
          err instanceof JournalRuntimeNotAuthorizedError
          && (err.cause as { code?: string } | undefined)?.code === '42501',
      );
      assert.equal(counts.headReads, 0, 'the head read itself was refused, so no head value was ever returned');
      assert.equal(counts.routineCalls, 0, 'the routine was never called: the head read failed first');

      // The HTTP boundary: the real createServer answers 503 with the promised code.
      const response = await fetch(`${plane.url}/journal/commands`, {
        method: 'POST',
        headers: { authorization: `Bearer ${HTTP_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify(request('cmd_js_no_select_http')),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'journal_runtime_not_authorized' });
      assert.equal(counts.routineCalls, 0);
      assert.equal(await rowCount('cmd_js_no_select'), 0, 'nothing written');
      assert.equal(await rowCount('cmd_js_no_select_http'), 0, 'nothing written over HTTP either');
    } finally {
      await plane.stop();
      await admin!.query('GRANT SELECT ON public.command_journal_chain_head TO br_app_runtime');
    }
  });

  it('the identity latch: the owner-class login that applied the migrations is refused — 503, no statement past the latch, zero rows — while WITHOUT the latch its append succeeds (the bypass is real)', async (t) => {
    // Its own cluster: 0006's roles are cluster-wide, and here they must be
    // CREATED BY the admin login, because that is where the bypass comes
    // from. Neon's owner shape: a CREATEROLE + CREATEDB login that owns the
    // database. 0006 applies for such a login unaided (steps 3a and 13a; see
    // journal-migration-nonsuperuser.storage.test.ts), so nothing is granted
    // in advance except what this measurement itself needs: the login holds
    // SET and INHERIT on the roles it creates (`createrole_self_grant`), so
    // it inherits br_app_runtime's own EXECUTE grant, which the routine's
    // grant cannot tell apart.
    let owned: OwnedInstance | undefined;
    let su: PgClient | undefined;
    let adminPool: PgPool | undefined;
    let plane: { url: string; stop: () => Promise<void> } | undefined;
    const database = 'br_js_owner_class';
    const adminRole = 'br_js_admin';
    try {
      owned = await startOwnedInstance(BINS!, (o) => { owned = o; });
      su = superClient(owned);
      await su.connect();
      const password = randomBytes(24).toString('base64url');
      await su.query(`CREATE ROLE ${adminRole} LOGIN NOSUPERUSER CREATEROLE CREATEDB NOBYPASSRLS NOREPLICATION PASSWORD '${password.replace(/'/g, "''")}'`);
      await su.query(`ALTER ROLE ${adminRole} SET createrole_self_grant = 'SET, INHERIT'`);
      await su.query(`CREATE DATABASE ${database} OWNER ${adminRole}`);
      await su.end();
      su = superClient(owned, database);
      await su.connect();

      adminPool = new Pool({ host: '127.0.0.1', port: owned.port, user: adminRole, password, database, max: 2 });
      const { migrate } = await import('../packages/control-plane/src/migrations.js');
      const applied = await migrate(adminPool);
      assert.deepEqual(applied.applied, [...TRANCHE_ORDER], 'the admin login applied the canonical sequence through 0007');
      const who = await adminPool.query<{ s: string; su: boolean; inherits: boolean }>(
        `SELECT session_user::text AS s,
                (SELECT rolsuper FROM pg_roles WHERE rolname = session_user) AS su,
                pg_has_role(session_user, 'br_app_runtime', 'USAGE') AS inherits`,
      );
      assert.equal(who.rows[0]?.s, adminRole);
      assert.equal(who.rows[0]?.su, false, 'a non-superuser');
      t.diagnostic(`owner-class login ${adminRole}: rolsuper=false, inherits br_app_runtime's privileges=${String(who.rows[0]?.inherits)}`);

      // WITH the latch: the store over the admin's own pool.
      const { pool, counts } = interceptingPool(adminPool);
      const ownerStore = new JournalStore(pool, { now });
      plane = await startControlPlane(ownerStore);
      await assert.rejects(
        ownerStore.appendJournaled(request('cmd_js_owner_store')),
        (err: unknown) => err instanceof JournalRuntimeNotAuthorizedError && /connected role is not br_app_runtime/.test(err.message),
      );
      const response = await fetch(`${plane.url}/journal/commands`, {
        method: 'POST',
        headers: { authorization: `Bearer ${HTTP_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify(request('cmd_js_owner_http')),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'journal_runtime_not_authorized' });
      assert.equal(counts.headReads, 0, 'no head read past the latch');
      assert.equal(counts.routineCalls, 0, 'no routine call past the latch');
      const total = await adminPool.query<{ n: number }>('SELECT count(*)::int AS n FROM public.command_journal_events');
      assert.equal(total.rows[0]?.n, 0, 'zero rows written');

      // WITHOUT the latch: the same login calls the routine directly, inside
      // a transaction that is rolled back, so the answer is measured without
      // persisting a row.
      const direct = await adminPool.connect();
      let outcome: string;
      try {
        await direct.query('BEGIN');
        try {
          const appended = await direct.query<{ seq: string }>(
            `SELECT seq::text AS seq FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`,
            ['cmd_js_owner_nolatch', '1', Buffer.from(expectedBytes(request('cmd_js_owner_nolatch'), '1'))],
          );
          outcome = appended.rows[0]?.seq === '1' ? 'succeeded' : `unexpected result ${JSON.stringify(appended.rows)}`;
        } catch (error) {
          outcome = `refused with SQLSTATE ${String((error as { code?: string }).code)}`;
        }
        await direct.query('ROLLBACK');
      } finally {
        direct.release();
      }
      t.diagnostic(`WITHOUT the latch, the owner-class login's append through the routine ${outcome}`);
      assert.equal(outcome, 'succeeded', 'the bypass is real: the owner-class login executes the routine through its inherited br_app_runtime membership');
      const after = await adminPool.query<{ n: number }>('SELECT count(*)::int AS n FROM public.command_journal_events');
      assert.equal(after.rows[0]?.n, 0, 'the rolled-back probe left nothing behind');
    } finally {
      await plane?.stop();
      await adminPool?.end().catch(() => undefined);
      if (su !== undefined) {
        await su.end().catch(() => undefined);
        su = undefined;
      }
      if (owned !== undefined && owned.started) {
        // Enumerated teardown on this run's cluster: the one database, then
        // the four roles, and pg_roles absence asserted BEFORE destruction.
        const cleanup = superClient(owned);
        try {
          await cleanup.connect();
          await cleanup.query(`DROP DATABASE IF EXISTS ${database}`);
          for (const role of ['br_app_runtime', 'command_journal_writer', 'br_journal_owner', adminRole]) {
            await cleanup.query(`DROP ROLE IF EXISTS ${role}`);
          }
          const absent = await cleanup.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM pg_roles
              WHERE rolname IN ('br_journal_owner','command_journal_writer','br_app_runtime',$1)`,
            [adminRole],
          );
          assert.equal(absent.rows[0]?.n, 0, 'the owner-class cluster\'s roles must be absent from pg_roles at teardown');
        } finally {
          await cleanup.end().catch(() => undefined);
        }
      }
      destroyOwnedInstance(owned);
    }
  });

  it('an unreachable database maps to store-unavailable', async () => {
    const port = await freePort(); // reserved then released: nothing listens there
    const dead = new Pool({ host: '127.0.0.1', port, user: 'br_app_runtime', password: runtimePassword, database: 'none', connectionTimeoutMillis: 2_000 });
    try {
      const unreachable = new JournalStore(dead, { now });
      await assert.rejects(unreachable.appendJournaled(request('cmd_js_unreachable')), JournalStoreUnavailableError);
    } finally {
      await dead.end();
    }
  });
});

describe('journal store — what the suite left behind is one verifiable chain', { skip: SKIP_REASON }, () => {
  it('every persisted row re-encodes to its own column seq and re-chains from genesis to the head', async () => {
    const { rows } = await admin!.query<EventRow>(
      // `e.seq`, not the `seq` alias: a bare ORDER BY name binds to the TEXT output column and sorts '10' before '2'.
      'SELECT e.seq::text AS seq, e.record_class, e.event_type, e.command_id, e.chain_hash, e.row_bytes FROM public.command_journal_events AS e ORDER BY e.seq ASC',
    );
    assert.ok(rows.length >= 14, `the suite appended at least fourteen rows (found ${rows.length})`);
    let prior = GENESIS_CHAIN_HASH;
    rows.forEach((row, index) => {
      assert.equal(row.seq, String(index + 1), 'gapless from 1');
      const entry = written.get(row.command_id);
      assert.ok(entry !== undefined, `${row.command_id} was appended by this suite`);
      assert.deepEqual(
        Buffer.from(row.row_bytes),
        Buffer.from(expectedBytes(entry.request, row.seq, entry.recordedAt)),
        `${row.command_id}: bytes re-encode to column seq ${row.seq}`,
      );
      assert.equal(row.chain_hash, chainHash(prior, row.row_bytes), `${row.command_id}: chain hash frames on the prior row`);
      prior = row.chain_hash;
    });
    const latch = await head();
    assert.equal(latch.seq, String(rows.length));
    assert.equal(latch.chainHash, prior);
  });
});
