/**
 * Harness for the gateway storage suites.
 *
 * **Each suite gets its own database, created fresh at setup, on a PostgreSQL
 * instance its process owns, migrated through the FULL canonical sequence.**
 * That is not a convenience, and it is worth being plain about what it does
 * and does not prove.
 *
 * A database per suite is necessary because some of this schema's guarantees
 * are database-global rather than row-scoped. The enrollment-slot index
 * (migration 0009) admits at most two enrolled gateways per database, so a
 * previous run's enrolled rows would refuse later confirmations — and
 * `gateway_registry_events` refuses DELETE by trigger, so there is no cleaning
 * it up afterwards. Postgres advisory locks are likewise scoped to a database,
 * so the leadership and concurrency suites need their own database or they
 * would serialize against each other on `GATEWAY_REGISTRY_LOCK_KEY` and stop
 * being deterministic.
 *
 * An owned instance is necessary because the canonical sequence includes
 * migration 0006, which creates cluster-wide roles: applied by parallel suites
 * against one shared server it collides, and a per-suite cleanup cannot drop a
 * role sibling suites still reference. Until FOUNDER-ACT-20261010-TWO-GATEWAYS-
 * HARNESS (2026-10-10) these suites therefore ran on the shared
 * `TEST_DATABASE_URL` server migrated only through 0005 (the Founder's Gate III
 * selection, CAPABILITY-2, supplement §3). Migration 0009 changes a table the
 * gateway code writes, so that act moved them here: each process starts one
 * owned instance (initdb/pg_ctl), migrates ONE template database through the
 * full sequence as the superuser, and hands each suite a clone of it. The
 * instance trusts loopback; no credential exists. `TEST_DATABASE_URL` remains
 * the suites' run gate and names the base of each database's name; the shared
 * server is not touched.
 *
 * What it costs: these suites do not prove tolerance of a previous run's rows
 * the way `control-plane-postgres.storage.test.ts` does — that suite still runs
 * against the shared `TEST_DATABASE_URL` database and accumulates rows across
 * runs, so the original re-runnability proof is untouched. What re-running
 * `npm run test:storage` proves for the gateway suites is that the command is
 * re-runnable, which is the property CI's second invocation checks. Each
 * process needs the PostgreSQL server binaries (BUILDROOM_TEST_PG_BINDIR, or
 * pg_ctl on PATH); without them the harness refuses rather than falling back
 * to the shared server.
 *
 * The database name is derived from the suite label and dropped WITH (FORCE) at
 * setup as well as teardown, so a crashed run leaves nothing that breaks the
 * next one.
 *
 * RUNTIME-ROLE MODE (`BUILDROOM_RUNTIME_ROLE=1`, PR 2b Tranche D). The default
 * harness gives the application the same superuser connection the fixtures
 * use, so it can never discover that the application needs a privilege it does
 * not hold. In this mode the harness uses the same owned instance and template,
 * but hands each suite TWO pools on its clone: `pool` stays the superuser
 * fixture connection (setup, direct assertions, the trigger-level immutability
 * proofs, which are about the schema and not about the application), and
 * `appPool` logs in AS `br_app_runtime`. Every application object a suite
 * builds is constructed on `appPool`, so a statement the application issues
 * without a grant fails with PostgreSQL's own `permission denied`, naming the
 * privilege to add.
 *
 * In the default mode `appPool` IS `pool`.
 *
 * A suite that is listed in the runtime-role tier but never checks out a
 * client from `appPool` ran no application code as the runtime role, however
 * it reads. The harness counts the checkouts across the whole process (one
 * suite file is one process, and a suite may build a harness per test, most of
 * them fixture-only) and a file-level `after` hook fails the suite when
 * harnesses were built and the count is zero. That is exact where the static
 * checks in `runtime-role-tier.test.ts` are only text matches. It cannot see a
 * suite that uses `appPool` for some objects and `pool` for others; the
 * naming, the header above and those static checks are what guard that.
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { after } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import pgDefault from 'pg';
import type { Pool } from 'pg';
import { loadConfig, type Config } from '../packages/control-plane/src/config.js';
import { createPool } from '../packages/control-plane/src/db.js';
import { migrate } from '../packages/control-plane/src/migrations.js';
import {
  destroyOwnedInstance,
  resolveServerBinaries,
  startOwnedInstance,
  type OwnedInstance,
} from './support/owned-postgres.js';
import { RUNTIME_ROLE_MODE, RUNTIME_LOGIN } from './support/runtime-role-mode.js';

const { Pool: PgPool } = pgDefault;

const RAW_URL = process.env['TEST_DATABASE_URL'];

export const STORAGE_SKIP: string | false =
  RAW_URL === undefined || RAW_URL.trim() === ''
    ? 'TEST_DATABASE_URL is not set — the gateway storage suite did not run'
    : false;

/** True when this process runs the application as `br_app_runtime` (see the header). */
export { RUNTIME_ROLE_MODE };

/** Long enough to satisfy the loader; never presented to any route. */
export const TEST_TOKEN = 'gateway-storage-suite-token-long-enough';

function baseUrl(): URL {
  if (RAW_URL === undefined) throw new Error('TEST_DATABASE_URL is not set');
  return new URL(RAW_URL.trim());
}

/**
 * A database name derived from the suite label.
 *
 * Deterministic rather than random: a random name would leak a database per
 * crashed run, and nothing would ever clean them up.
 */
export function databaseNameFor(label: string): string {
  const base = baseUrl().pathname.replace(/^\//, '') || 'buildroom_test';
  const slug = label.replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 24);
  return `${base}_gw_${slug}`.slice(0, 60);
}

/** The owned instance's `postgres` database, as its superuser, for CREATE/DROP DATABASE. */
async function withAdmin<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const connectionString = clusterUrl(await getOwnedCluster(), 'postgres');
  const pool = new PgPool({ connectionString, max: 1 });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

export interface GatewayHarness {
  /**
   * The FIXTURE connection: setup, direct assertions, and the schema-level
   * proofs. In the default mode it is also the application's connection; in
   * runtime-role mode it is the superuser and `appPool` is the application's.
   */
  readonly pool: Pool;
  /**
   * The connection every APPLICATION object is built on. Identical to `pool`
   * unless `BUILDROOM_RUNTIME_ROLE=1`, where it logs in as `br_app_runtime`.
   * A suite that constructs a store, a gateway surface, a server or a
   * leadership coordinator passes this, never `pool`.
   */
  readonly appPool: Pool;
  /** The application's configuration; in runtime-role mode it names the runtime login. */
  readonly config: Config;
  readonly databaseName: string;
}

/**
 * Create the suite's database, migrated through the full canonical sequence,
 * and return its pools.
 *
 * `statementTimeoutMs` is raised well above the service default because the
 * concurrency suites deliberately hold a transaction open at a pause hook while
 * a second one runs. Ten seconds is the right bound for a request; it is the
 * wrong bound for a choreography that is proving what happens across a commit
 * boundary.
 */
export async function createGatewayHarness(label: string): Promise<GatewayHarness> {
  if (RUNTIME_ROLE_MODE) return createRoleSplitHarness(label);
  const cluster = await getOwnedCluster();
  const databaseName = databaseNameFor(label);
  await cloneTemplate(databaseName);
  const config = configFor(cluster, databaseName, 'postgres');
  const pool = createPool(config);
  return { pool, appPool: pool, config, databaseName };
}

export async function destroyGatewayHarness(harness: GatewayHarness | undefined): Promise<void> {
  if (harness === undefined) return;
  if (harness.appPool !== harness.pool) await harness.appPool.end();
  await harness.pool.end();
  await withAdmin(async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(harness.databaseName)} WITH (FORCE)`);
  });
}

/*
 * ---------------------------------------------------------------------------
 * The owned instance and its template, used in both modes, and the
 * runtime-role mode's two-pool harness (see the header).
 * ---------------------------------------------------------------------------
 */

const TEMPLATE_DATABASE = 'rr_template';

interface OwnedCluster {
  readonly instance: OwnedInstance;
}

let ownedCluster: Promise<OwnedCluster> | undefined;

/**
 * Process-wide tallies for the runtime-role mode: harnesses built, and client
 * checkouts from their application pools (counted from after each pool's
 * identity check). See the header and the `after` hook below.
 */
let harnessesBuilt = 0;
let appPoolCheckouts = 0;

if (RUNTIME_ROLE_MODE) {
  after(() => {
    if (harnessesBuilt > 0 && appPoolCheckouts === 0) {
      throw new Error(
        `this suite built ${harnessesBuilt} runtime-role harness(es) and never checked out a client from an application pool: ` +
          `it ran no application code as ${RUNTIME_LOGIN}, so it must not be in the runtime-role tier`,
      );
    }
  });
}

function clusterUrl(cluster: OwnedCluster, database: string, user: string = 'postgres'): string {
  return `postgresql://${user}@127.0.0.1:${cluster.instance.port}/${database}`;
}

function configFor(cluster: OwnedCluster, database: string, user: string): Config {
  return loadConfig({
    DATABASE_URL: clusterUrl(cluster, database, user),
    CONTROL_PLANE_TOKEN: TEST_TOKEN,
    STATEMENT_TIMEOUT_MS: '60000',
    PG_POOL_MAX: '12',
  });
}

/**
 * The process's one owned instance, built on first use and destroyed when the
 * process exits. The template database is migrated through the FULL canonical
 * sequence by the superuser, once, so the cluster-wide roles are created
 * exactly once.
 *
 * It refuses, rather than degrades, when it cannot start an instance: the
 * shared server cannot host the full canonical sequence per suite, and in
 * runtime-role mode falling back to it would run the tier as a superuser and
 * report success for a run that proved nothing about the runtime role.
 */
function getOwnedCluster(): Promise<OwnedCluster> {
  ownedCluster ??= buildOwnedCluster();
  return ownedCluster;
}

async function buildOwnedCluster(): Promise<OwnedCluster> {
  const bins = resolveServerBinaries();
  if (bins === undefined) {
    throw new Error(
      'the gateway storage harness needs PostgreSQL server binaries (initdb/pg_ctl): set BUILDROOM_TEST_PG_BINDIR or put ' +
        'pg_ctl on PATH. It will not fall back to the shared server, which cannot host the full canonical sequence.',
    );
  }
  const logDir = process.env['BUILDROOM_RUNTIME_ROLE_LOG_DIR'];
  const instance = await startOwnedInstance(bins, {
    // Development aid for enumerating grants: every statement, attributed to its login.
    serverSettings: logDir === undefined || logDir === '' ? [] : ['log_statement=all', "log_line_prefix='%m [%p] %u@%d '"],
  });
  process.once('exit', () => {
    if (logDir !== undefined && logDir !== '') {
      try {
        mkdirSync(logDir, { recursive: true });
        copyFileSync(instance.logFile, join(logDir, `${basename(process.argv[1] ?? 'suite')}.${process.pid}.log`));
      } catch {
        // A missing log must never mask the suite's own result.
      }
    }
    destroyOwnedInstance(instance);
  });

  const cluster: OwnedCluster = { instance };
  const bootstrap = new PgPool({ connectionString: clusterUrl(cluster, 'postgres'), max: 1 });
  try {
    await bootstrap.query(`CREATE DATABASE ${quoteIdentifier(TEMPLATE_DATABASE)}`);
  } finally {
    await bootstrap.end();
  }
  const templatePool = createPool(configFor(cluster, TEMPLATE_DATABASE, 'postgres'));
  try {
    await migrate(templatePool);
  } finally {
    await templatePool.end();
  }
  return cluster;
}

/** `CREATE DATABASE ... TEMPLATE` refuses (55006) while a session still holds the template. */
async function cloneTemplate(database: string): Promise<void> {
  await withAdmin(async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
    for (let attempt = 0; ; attempt += 1) {
      try {
        await admin.query(`CREATE DATABASE ${quoteIdentifier(database)} TEMPLATE ${quoteIdentifier(TEMPLATE_DATABASE)}`);
        return;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === '55006' && attempt < 50) {
          await delay(100);
          continue;
        }
        throw error;
      }
    }
  });
}

async function createRoleSplitHarness(label: string): Promise<GatewayHarness> {
  const cluster = await getOwnedCluster();
  const databaseName = databaseNameFor(label);
  await cloneTemplate(databaseName);
  const pool = createPool(configFor(cluster, databaseName, 'postgres'));
  const appConfig = configFor(cluster, databaseName, RUNTIME_LOGIN);
  const appPool = createPool(appConfig);
  // The tier's whole claim is that application objects run as the runtime role.
  // Check the identity the pool actually authenticated as, rather than trusting
  // the URL it was built from: a misconfigured harness must fail here, loudly,
  // not pass every suite as a superuser.
  const { rows } = await appPool.query<{ session_user: string; current_user: string }>(
    'SELECT session_user::text AS session_user, current_user::text AS current_user',
  );
  if (rows[0]?.session_user !== RUNTIME_LOGIN || rows[0]?.current_user !== RUNTIME_LOGIN) {
    await appPool.end();
    await pool.end();
    throw new Error(
      `the runtime-role harness's application pool is ${String(rows[0]?.session_user)}/${String(rows[0]?.current_user)}, not ${RUNTIME_LOGIN}`,
    );
  }
  harnessesBuilt += 1;
  appPool.on('acquire', () => {
    appPoolCheckouts += 1;
  });
  return { pool, appPool, config: appConfig, databaseName };
}

/**
 * Double-quote an identifier. The names here are derived from suite labels
 * this repository writes, not from input — but interpolating an identifier
 * into DDL without quoting it is a habit worth not having.
 */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
