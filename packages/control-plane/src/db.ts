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
   * TLS is ON by default and OFF only where it is explicitly not wanted.
   *
   * An earlier version turned TLS on only when the connection string carried
   * `sslmode=require`. That inverts the safe default: a hosted URL pasted
   * without the parameter would connect in cleartext and be refused by the
   * provider, and the resulting error says nothing about TLS — an easy hour
   * lost on a first deploy, and a worse outcome than a loud failure if a
   * provider ever accepted it.
   *
   * So: verification stays on unless `sslmode=disable`, or the host is
   * loopback, which is where a local development cluster runs without a
   * certificate.
   *
   * `rejectUnauthorized: true` is deliberate. `sslmode=require` in a libpq
   * string means "encrypt, do not verify", and node-postgres honours that as
   * `rejectUnauthorized: false`; setting ssl explicitly here overrides it, so
   * a copied connection string cannot silently downgrade certificate checking.
   * Neon presents a publicly trusted certificate, so verification costs
   * nothing.
   */
  if (!/sslmode=disable/i.test(config.databaseUrl) && !isLoopback(config.databaseUrl)) {
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

/**
 * Whether the connection string points at loopback.
 *
 * Parsed as a URL rather than pattern-matched, so a password or database name
 * that happens to contain "localhost" cannot make a hosted database look
 * local — which would turn TLS off against a real provider.
 */
function isLoopback(databaseUrl: string): boolean {
  try {
    const host = new URL(databaseUrl).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    // Unparseable is not local. Fail toward TLS.
    return false;
  }
}
