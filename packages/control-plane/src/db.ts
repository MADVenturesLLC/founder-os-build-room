/**
 * Postgres connection pool.
 *
 * Kept deliberately small: Neon's smallest computes hold few connections, and
 * the control plane is a single writer per room rather than a fan-out reader.
 * A statement timeout is set on every connection so a wedged query fails
 * rather than pinning a pooled connection until the process is restarted.
 */

/*
 * `pg` is CommonJS. Under ESM a named import of `Pool` resolves at compile
 * time and then fails at runtime ("Named export 'Pool' not found"), so the
 * default export is destructured instead — the interop form Node documents.
 */
import pgDefault from 'pg';
import type { Pool, PoolConfig } from 'pg';
import type { Config } from './config.js';

const { Pool: PgPool } = pgDefault;

export function createPool(config: Config): Pool {
  const poolConfig: PoolConfig = {
    connectionString: config.databaseUrl,
    max: config.poolMax,
    idleTimeoutMillis: config.poolIdleTimeoutMs,
    connectionTimeoutMillis: config.readyProbeTimeoutMs,
    // Applied per connection by the server, so it survives pool recycling.
    options: `-c statement_timeout=${config.statementTimeoutMs}`,
  };

  /*
   * Neon requires TLS and presents a publicly trusted certificate, so
   * verification stays ON. `sslmode=require` in a libpq connection string
   * means "encrypt, do not verify"; node-postgres would honour that as
   * `rejectUnauthorized: false`. Setting ssl explicitly here overrides it, so
   * a copied connection string cannot silently downgrade certificate checking.
   */
  if (/sslmode=(require|verify-ca|verify-full)/i.test(config.databaseUrl)) {
    poolConfig.ssl = { rejectUnauthorized: true };
  }

  const pool = new PgPool(poolConfig);

  /*
   * An idle client erroring (Neon suspending a compute, a network reset) emits
   * on the pool. Unhandled, it takes the process down. Logged and swallowed:
   * the pool discards the client and the next query opens a fresh one.
   */
  pool.on('error', (error) => {
    console.error(
      JSON.stringify({ level: 'warn', at: 'pool.idle_client_error', message: error.message }),
    );
  });

  return pool;
}

export interface ProbeResult {
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly error?: string;
}

/**
 * A readiness probe against the real database.
 *
 * `SELECT 1` proves the socket and the session; it does not prove the schema.
 * The schema is proved at boot by the migrator, which fails the boot if it
 * cannot run — so readiness does not re-assert it on every probe.
 */
export async function probe(pool: Pool, timeoutMs: number): Promise<ProbeResult> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`database probe exceeded ${timeoutMs}ms`)), timeoutMs);
    });
    await Promise.race([pool.query('SELECT 1'), timeout]);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
