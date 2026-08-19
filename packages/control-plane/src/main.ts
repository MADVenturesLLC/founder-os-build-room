/**
 * Boot sequence for the control plane.
 *
 * Order matters and is fail-closed throughout:
 *
 *   config → pool → migrate → listen
 *
 * The process does not begin serving until the schema is present. A migration
 * failure exits non-zero rather than starting a server that would answer
 * `/health` with 200 while every real request failed — which is exactly the
 * shape of "deploys and stays up" that would pass a run it should fail.
 *
 * Shutdown drains the HTTP server, then the pool. Railway sends SIGTERM on
 * redeploy and on restart, so this path runs on every restart the Phase 2 run
 * definition exercises.
 */

import type { Server } from 'node:http';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createServer } from './server.js';
import { migrate } from './migrations.js';
import { PostgresLedgerStore } from './store.js';
import { createGatewaySurface } from './gateway/index.js';

function log(level: 'info' | 'error', at: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, at, ts: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config);
  const startedAt = Date.now();

  log('info', 'boot.start', { commit: config.commitSha, environment: config.environment });

  const migration = await migrate(pool);
  log('info', 'boot.migrated', {
    applied: migration.applied,
    alreadyApplied: migration.alreadyApplied,
  });

  /*
   * The gateway subsystem is built BEFORE the store, because the store's room
   * append runs inside its fence (contract §10). The store is never constructed
   * without it here — that is what makes "the room-append route is always
   * fenced" a property of the boot sequence rather than of a convention.
   */
  const gateway = createGatewaySurface({
    pool,
    config,
    log: (level, at, fields) => log(level === 'warn' ? 'info' : level, at, fields),
  });
  const store = new PostgresLedgerStore(pool, gateway.roomAppendFence);
  const app = createServer({ config, pool, store, startedAt, gateway });

  /*
   * Started after the server object exists but before it listens: the
   * supervisor's first ticks are what acquire the lease, reconcile, and take
   * the clock monitor's two clean boot readings, and every leader-gated route
   * answers 503 until those complete.
   */
  gateway.start();

  const server: Server = app.listen(config.port, () => {
    log('info', 'boot.listening', { port: config.port });
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('info', 'shutdown.start', { signal });

    /*
     * Release the lease on the way out. This only accelerates takeover — the
     * TTL alone is sufficient and no correctness claim rests on it — so its
     * failure is logged and never blocks the shutdown.
     */
    void gateway
      .stop()
      .then(() => gateway.leadership.releaseGracefully())
      .catch((error: unknown) => {
        log('error', 'shutdown.gateway_stop_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      });

    server.close((closeError) => {
      if (closeError) log('error', 'shutdown.server_close_failed', { message: closeError.message });
      pool
        .end()
        .then(() => {
          log('info', 'shutdown.complete', { signal });
          process.exit(0);
        })
        .catch((poolError: unknown) => {
          log('error', 'shutdown.pool_end_failed', {
            message: poolError instanceof Error ? poolError.message : String(poolError),
          });
          process.exit(1);
        });
    });

    /*
     * A connection held open by a client would otherwise keep the process
     * alive past the platform's grace period, and the platform would kill it —
     * which looks like a crash in the deploy record. Bounded here instead, and
     * logged as the deliberate act it is.
     */
    setTimeout(() => {
      log('error', 'shutdown.forced', { signal, reason: 'grace period elapsed' });
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/*
 * Only run when executed directly, so importing this module in a test does not
 * start a server or open a pool.
 */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    log('error', 'boot.failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
