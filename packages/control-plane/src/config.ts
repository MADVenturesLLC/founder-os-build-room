/**
 * Control-plane configuration — read once at boot, fail closed.
 *
 * Every value comes from the environment. Nothing is defaulted that would let
 * the process come up believing it has a database when it does not: a missing
 * or unparseable `DATABASE_URL` is a boot failure, not a degraded mode
 * (architecture §3.15, fail-closed).
 *
 * Credentials are read from the environment and never written to the
 * repository (`DEC-20260815-07`; exit criterion 1 of `DEC-20260815-17`'s
 * Phase 2 authorization).
 */

export interface Config {
  /** Postgres connection string. Required — no default, no fallback. */
  readonly databaseUrl: string;
  /** TCP port for the HTTP surface. */
  readonly port: number;
  /**
   * The commit this process was built from, surfaced on `/version` so a run's
   * evidence can be bound to a SHA. Unknown is reported as `unknown`, never
   * guessed.
   */
  readonly commitSha: string;
  /** Deployment environment label, for evidence records. */
  readonly environment: string;
  /** Milliseconds a readiness database probe may take before it is failed. */
  readonly readyProbeTimeoutMs: number;
  /** Postgres statement timeout, ms. Bounds a wedged query. */
  readonly statementTimeoutMs: number;
  /** Maximum pooled connections. Neon's free/launch computes are small. */
  readonly poolMax: number;
  /** Seconds before an idle pooled connection is released. */
  readonly poolIdleTimeoutMs: number;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

interface Env {
  readonly [key: string]: string | undefined;
}

function required(env: Env, key: string): string {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') {
    throw new ConfigError(
      `${key} is required and was not set. The control plane does not start ` +
        `without it — see packages/control-plane/README.md.`,
    );
  }
  return raw.trim();
}

function integer(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${key} must be a positive integer; got ${JSON.stringify(raw)}.`);
  }
  return parsed;
}

/**
 * Parse configuration from an environment mapping.
 *
 * Takes the environment as an argument rather than reading `process.env`
 * directly so it is testable without mutating global state.
 */
export function loadConfig(env: Env): Config {
  const databaseUrl = required(env, 'DATABASE_URL');
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new ConfigError(
      'DATABASE_URL must be a postgres:// or postgresql:// connection string. ' +
        'The value is not echoed here because it carries a credential.',
    );
  }

  return {
    databaseUrl,
    port: integer(env, 'PORT', 8080),
    commitSha: (env['RAILWAY_GIT_COMMIT_SHA'] ?? env['COMMIT_SHA'] ?? 'unknown').trim() || 'unknown',
    environment: (env['RAILWAY_ENVIRONMENT_NAME'] ?? env['NODE_ENV'] ?? 'unknown').trim() || 'unknown',
    readyProbeTimeoutMs: integer(env, 'READY_PROBE_TIMEOUT_MS', 2_000),
    statementTimeoutMs: integer(env, 'STATEMENT_TIMEOUT_MS', 10_000),
    poolMax: integer(env, 'PG_POOL_MAX', 4),
    poolIdleTimeoutMs: integer(env, 'PG_POOL_IDLE_TIMEOUT_MS', 30_000),
  };
}
