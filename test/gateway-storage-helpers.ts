/**
 * Harness for the gateway storage suites.
 *
 * **Each suite gets its own database, created fresh at setup.** That is not a
 * convenience, and it is worth being plain about what it does and does not
 * prove.
 *
 * It is necessary because two of this schema's guarantees are database-global
 * rather than row-scoped. `gateway_current_state_only_one_enrolled` permits one
 * enrolled gateway per database, so a leftover enrolled row from a previous run
 * would refuse every later confirmation — and `gateway_registry_events` refuses
 * DELETE by trigger, so there is no cleaning it up afterwards. Postgres advisory
 * locks are likewise scoped to a database, so the leadership and concurrency
 * suites need their own database or they would serialize against each other on
 * `GATEWAY_REGISTRY_LOCK_KEY` and stop being deterministic.
 *
 * What it costs: these suites do not prove tolerance of a previous run's rows
 * the way `control-plane-postgres.storage.test.ts` does — that suite still runs
 * against the shared `TEST_DATABASE_URL` database and accumulates rows across
 * runs, so the original re-runnability proof is untouched. What re-running
 * `npm run test:storage` proves for the gateway suites is that the command is
 * re-runnable, which is the property CI's second invocation checks.
 *
 * The database name is derived from the suite label and dropped WITH (FORCE) at
 * setup as well as teardown, so a crashed run leaves nothing that breaks the
 * next one.
 *
 * RUNTIME-ROLE MODE (`BUILDROOM_RUNTIME_ROLE=1`, PR 2b Tranche D). The default
 * harness above gives the application the same superuser connection the
 * fixtures use, so it can never discover that the application needs a
 * privilege it does not hold. In this mode the harness instead:
 *
 *   - starts one exclusively owned PostgreSQL instance per process (the
 *     journal migration's roles are cluster-wide, so a shared server cannot
 *     host them per suite);
 *   - migrates ONE template database through the FULL canonical sequence, as
 *     the superuser, so `br_app_runtime` and every grant migration `0008`
 *     issues exist exactly as they do in production;
 *   - hands each suite a clone of that template, with TWO pools on it:
 *     `pool` stays the superuser fixture connection (setup, direct assertions,
 *     the trigger-level immutability proofs, which are about the schema and
 *     not about the application), and `appPool` logs in AS `br_app_runtime`.
 *     Every application object a suite builds is constructed on `appPool`, so a
 *     statement the application issues without a grant fails with PostgreSQL's
 *     own `permission denied`, naming the privilege to add.
 *
 * In the default mode `appPool` IS `pool`, so no suite's behaviour changes.
 * No credential exists anywhere in this mode: the owned instance trusts
 * loopback and `br_app_runtime` has no password, exactly as the sibling
 * owned-instance suites run their own runtime logins.
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
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

/** `postgres` on the same server, for CREATE/DROP DATABASE. */
function adminUrl(): string {
  const url = baseUrl();
  url.pathname = '/postgres';
  return url.toString();
}

function databaseUrlFor(name: string): string {
  const url = baseUrl();
  url.pathname = `/${name}`;
  return url.toString();
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

async function withAdmin<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const connectionString = RUNTIME_ROLE_MODE
    ? clusterUrl(await getRoleCluster(), 'postgres')
    : adminUrl();
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
 * The migration selection every consumer of this helper runs.
 *
 * Pre-journal tranche, through `0005_phase3_run_evidence` — explicitly, not
 * by default. Migration `0006_command_journal_authority_split` creates three
 * CLUSTER-WIDE roles with production names; applied by fifteen parallel
 * suites against the one shared CI container it collides on `42710` and its
 * per-suite cleanup cannot satisfy role absence while siblings hold
 * references. The suites consuming this helper (gateway-* and phase3-*)
 * exercise no journal authority; their fixtures are truthfully labeled as
 * qualified THROUGH 0005 ONLY — success here is not evidence that 0006
 * passed. Journal-authority qualification runs the full canonical sequence
 * on exclusively owned instances (test/journal-authority.storage.test.ts,
 * test/journal-append-atomicity.storage.test.ts, test/migrate-cli.test.ts).
 *
 * Authority: Founder ruling — Gate III shared storage migration selection
 * (CAPABILITY-2) and its fixture-completion supplement §3 (the explicit
 * through-id selection in the migrator).
 */
export const HELPER_MIGRATION_THROUGH = '0005_phase3_run_evidence';

/**
 * Create the suite's database, migrate it, and return a pool on it.
 *
 * `statementTimeoutMs` is raised well above the service default because the
 * concurrency suites deliberately hold a transaction open at a pause hook while
 * a second one runs. Ten seconds is the right bound for a request; it is the
 * wrong bound for a choreography that is proving what happens across a commit
 * boundary.
 */
export async function createGatewayHarness(label: string): Promise<GatewayHarness> {
  if (RUNTIME_ROLE_MODE) return createRoleSplitHarness(label);
  const databaseName = databaseNameFor(label);

  await withAdmin(async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  });

  const config = loadConfig({
    DATABASE_URL: databaseUrlFor(databaseName),
    CONTROL_PLANE_TOKEN: TEST_TOKEN,
    STATEMENT_TIMEOUT_MS: '60000',
    PG_POOL_MAX: '12',
  });
  const pool = createPool(config);
  await migrate(pool, { through: HELPER_MIGRATION_THROUGH });
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
 * Runtime-role mode (see the header). Everything below runs only when
 * `BUILDROOM_RUNTIME_ROLE=1`.
 * ---------------------------------------------------------------------------
 */

const TEMPLATE_DATABASE = 'rr_template';

interface RoleCluster {
  readonly instance: OwnedInstance;
}

let roleCluster: Promise<RoleCluster> | undefined;

function clusterUrl(cluster: RoleCluster, database: string, user: string = 'postgres'): string {
  return `postgresql://${user}@127.0.0.1:${cluster.instance.port}/${database}`;
}

function configFor(cluster: RoleCluster, database: string, user: string): Config {
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
 * It refuses, rather than degrades, when it cannot start an instance: falling
 * back to the shared server would run this tier as a superuser and report
 * success for a run that proved nothing about the runtime role.
 */
function getRoleCluster(): Promise<RoleCluster> {
  roleCluster ??= buildRoleCluster();
  return roleCluster;
}

async function buildRoleCluster(): Promise<RoleCluster> {
  const bins = resolveServerBinaries();
  if (bins === undefined) {
    throw new Error(
      'BUILDROOM_RUNTIME_ROLE=1 needs PostgreSQL server binaries (initdb/pg_ctl): set BUILDROOM_TEST_PG_BINDIR or put ' +
        'pg_ctl on PATH. It will not fall back to the shared server, which would run this tier as a superuser.',
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

  const cluster: RoleCluster = { instance };
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
  const cluster = await getRoleCluster();
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
