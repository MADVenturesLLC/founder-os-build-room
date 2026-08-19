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
 */

import pgDefault from 'pg';
import type { Pool } from 'pg';
import { loadConfig, type Config } from '../packages/control-plane/src/config.js';
import { createPool } from '../packages/control-plane/src/db.js';
import { migrate } from '../packages/control-plane/src/migrations.js';

const { Pool: PgPool } = pgDefault;

const RAW_URL = process.env['TEST_DATABASE_URL'];

export const STORAGE_SKIP: string | false =
  RAW_URL === undefined || RAW_URL.trim() === ''
    ? 'TEST_DATABASE_URL is not set — the gateway storage suite did not run'
    : false;

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
  const pool = new PgPool({ connectionString: adminUrl(), max: 1 });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

export interface GatewayHarness {
  readonly pool: Pool;
  readonly config: Config;
  readonly databaseName: string;
}

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
  await migrate(pool);
  return { pool, config, databaseName };
}

export async function destroyGatewayHarness(harness: GatewayHarness | undefined): Promise<void> {
  if (harness === undefined) return;
  await harness.pool.end();
  await withAdmin(async (admin) => {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(harness.databaseName)} WITH (FORCE)`);
  });
}

/**
 * Double-quote an identifier. The names here are derived from suite labels
 * this repository writes, not from input — but interpolating an identifier
 * into DDL without quoting it is a habit worth not having.
 */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
