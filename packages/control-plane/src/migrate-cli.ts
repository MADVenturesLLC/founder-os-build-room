/**
 * B-N1 — bounded administrative migration runner (C-3 §4.2; draft §6.2;
 * C-2 §10 stages 4–5; IF-2).
 *
 * Administrative-plane entrypoint ONLY. It is not imported by, reachable
 * from, or started by the control-plane server: it does not import the
 * server entrypoint module, the HTTP surface, or any listener, and emits no
 * boot events. Invoked as
 *
 *     MIGRATE_ADMIN_DATABASE_URL=<administrative url> \
 *       node dist/packages/control-plane/src/migrate-cli.js <tranche_id>
 *
 * Behavior, in order:
 *   1. The tranche selector is a required positional argument; absent or
 *      malformed → usage error, exit 2, nothing touched.
 *   2. The administrative credential comes from the environment only
 *      (`MIGRATE_ADMIN_DATABASE_URL`); absent → usage error, exit 2.
 *   3. The selector must EXACTLY match one id in the canonical `MIGRATIONS`
 *      array (no prefix or partial match); unknown → exit 1 before any
 *      connection is opened.
 *   4. Stage-3 re-assertion: when both `FOUNDER_AUTHORIZED_SHA` and
 *      `GITHUB_SHA` are present they must be equal; mismatch → exit 1 before
 *      any connection is opened. Absent values are recorded as null, never
 *      guessed.
 *   5. Exactly one tranche per invocation: the runner reads
 *      `schema_migrations` (without creating it) and refuses, exit 1 and
 *      nothing applied, when more than one not-yet-applied migration precedes
 *      or equals the selector. Re-selecting an already-applied tranche is a
 *      recorded no-op success.
 *   6. The apply itself is the existing migrator with the ruling-§3 explicit
 *      selection (`migrate(pool, { through })`) — one implementation, one
 *      transaction per migration, the same `schema_migrations` record.
 *   7. Stage-5 evidence is emitted to stdout as a single JSON document:
 *      expected SHA, observed SHA, tranche id, applied migration ids,
 *      `schema_migrations` before and after, approver identity, run id, and
 *      timestamps. Nothing else is written to stdout.
 *
 * Failures never echo the connection string or any credential-shaped
 * substring; the runner reports its own marker and the driver's SQLSTATE /
 * error code only.
 */

import { randomUUID } from 'node:crypto';
import pgDefault from 'pg';
import type { Pool as PgPool } from 'pg';
import { MIGRATIONS, migrate } from './migrations.js';
import { pgConnectionSettings, type PgConnectionSettings } from './pg-tls.js';

const { Client, Pool } = pgDefault;

const ADMIN_URL_ENV = 'MIGRATE_ADMIN_DATABASE_URL';

const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

interface Stage5Evidence {
  readonly expected_sha: string | null;
  readonly observed_sha: string | null;
  readonly tranche_id: string;
  readonly applied_migration_ids: readonly string[];
  readonly schema_migrations_before: readonly string[];
  readonly schema_migrations_after: readonly string[];
  readonly approver_identity: string | null;
  readonly run_id: string;
  readonly started_at: string;
  readonly finished_at: string;
}

function usage(message: string): never {
  process.stderr.write(`migrate-cli: ${message}\n`);
  process.stderr.write(
    `usage: ${ADMIN_URL_ENV}=<administrative url> node migrate-cli.js <tranche_id>\n`,
  );
  process.exit(EXIT_USAGE);
}

function fail(message: string): never {
  process.stderr.write(`migrate-cli: ${message}\n`);
  process.exit(EXIT_FAILURE);
}

function envOrNull(name: string): string | null {
  const value = process.env[name];
  return value === undefined || value === '' ? null : value;
}

/** The driver's code only — never its message, which can carry the host. */
function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'unknown';
}

async function readSchemaMigrations(admin: PgConnectionSettings): Promise<readonly string[]> {
  const client = new Client({ ...admin });
  try {
    await client.connect();
  } catch (error) {
    fail(`could not connect to the administrative database (code ${errorCode(error)})`);
  }
  try {
    const exists = await client.query<{ r: string | null }>(
      `SELECT to_regclass('public.schema_migrations') AS r`,
    );
    if (exists.rows[0]?.r === null || exists.rows[0]?.r === undefined) {
      return [];
    }
    const rows = await client.query<{ id: string }>(
      'SELECT id FROM schema_migrations ORDER BY applied_at, id',
    );
    return rows.rows.map((row) => row.id);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main(argv: readonly string[]): Promise<number> {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();

  // 1. Selector.
  const rawSelector = argv[0];
  if (rawSelector === undefined || rawSelector.trim() === '') {
    usage('tranche selector is required (exactly one migration id)');
  }
  if (argv.length > 1) {
    usage('exactly one tranche selector is accepted per run');
  }
  const trancheId = rawSelector.trim();

  // 2. Administrative credential from the environment only.
  const adminUrl = envOrNull(ADMIN_URL_ENV);
  if (adminUrl === null) {
    usage(`${ADMIN_URL_ENV} is required in the environment`);
  }
  // TLS is decided by pg-tls.ts, not by the URL's own parameters. The
  // message never echoes the URL: it holds a password.
  let admin: PgConnectionSettings;
  try {
    admin = pgConnectionSettings(adminUrl);
  } catch {
    usage(`${ADMIN_URL_ENV} is not a parseable connection string`);
  }

  // 3. Exact-match selection against the canonical array; unknown fails
  //    before any connection.
  const index = MIGRATIONS.findIndex((migration) => migration.id === trancheId);
  if (index === -1) {
    fail(
      `unknown tranche '${trancheId}'; valid ids in order: ${MIGRATIONS.map((m) => m.id).join(', ')}`,
    );
  }

  // 4. Stage-3 re-assertion when the workflow supplies both values.
  const expectedSha = envOrNull('FOUNDER_AUTHORIZED_SHA');
  const observedSha = envOrNull('GITHUB_SHA');
  if (expectedSha !== null && observedSha !== null && expectedSha !== observedSha) {
    fail('founder_authorized_sha does not equal the observed sha; nothing applied');
  }
  const approverIdentity = envOrNull('MIGRATE_APPROVER_IDENTITY');

  // 5. One tranche per run, decided from the recorded state, without
  //    creating the bootstrap table.
  const before = await readSchemaMigrations(admin);
  const present = new Set(before);
  const wouldApply = MIGRATIONS.slice(0, index + 1).filter((m) => !present.has(m.id));
  if (wouldApply.length > 1) {
    fail(
      `one tranche per run: selecting '${trancheId}' would apply ${wouldApply.length} migrations (${wouldApply.map((m) => m.id).join(', ')}); apply each preceding tranche in its own run; nothing applied`,
    );
  }

  // 6. Apply through the single migrator with explicit selection.
  let applied: readonly string[] = [];
  let pool: PgPool | undefined;
  try {
    pool = new Pool({ ...admin, max: 1 });
    const result = await migrate(pool, { through: trancheId });
    applied = result.applied;
  } catch (error) {
    fail(`migration failed (code ${errorCode(error)}); the migrator rolled back the failing entry`);
  } finally {
    await pool?.end().catch(() => undefined);
  }

  const after = await readSchemaMigrations(admin);

  // 7. Stage-5 evidence, the only stdout output.
  const evidence: Stage5Evidence = {
    expected_sha: expectedSha,
    observed_sha: observedSha,
    tranche_id: trancheId,
    applied_migration_ids: applied,
    schema_migrations_before: before,
    schema_migrations_after: after,
    approver_identity: approverIdentity,
    run_id: runId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  return EXIT_OK;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    fail(`unexpected failure (code ${errorCode(error)})`);
  },
);
