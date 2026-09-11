/**
 * Boot sequence for the control plane.
 *
 * Order matters and is fail-closed throughout:
 *
 *   config → pool → preflight → listen
 *
 * The process does not begin serving until the schema is ASSERTED present.
 * Since PR 2b Tranche A the assertion is read-only: a schema preflight
 * (`schema-preflight.ts`) verifies the required `schema_migrations` ids are
 * recorded and exits non-zero when they are not — rather than starting a
 * server that would answer `/health` with 200 while every real request
 * failed, which is exactly the shape of "deploys and stays up" that would
 * pass a run it should fail. The runtime never migrates or repairs: schema
 * changes are the administrative plane's act (r6 §12, R-4/R-5), so a
 * preflight failure means "this revision is ahead of / behind its schema"
 * and the deploy must fail visibly (PC-22).
 *
 * The preflight also audits the connected role's privileges — DETECTION
 * ONLY in Tranche A (`pending_cutover`); the audit must not block boot while
 * the documented owner-class runtime remains in use, and hard-fails only
 * from Tranche D after the `br_app_runtime` cutover (r3/r5 staged
 * enforcement). It emits no credential value.
 *
 * Shutdown drains the HTTP server, then the pool. Railway sends SIGTERM on
 * redeploy and on restart, so this path runs on every restart the Phase 2 run
 * definition exercises.
 */

import type { Server } from 'node:http';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createServer } from './server.js';
import { schemaPreflight } from './schema-preflight.js';
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

  /*
   * Read-only schema preflight (PR 2b Tranche A). Asserts the required
   * `schema_migrations` ids are present and exits non-zero if not — it never
   * migrates or repairs. The privilege audit it carries is detection-only in
   * Tranche A (`pending_cutover`) and must not block boot while the documented
   * owner-class runtime is in use; Tranche D wires it to a hard-fail after the
   * `br_app_runtime` cutover. `await` lets the rejection propagate to the
   * `main().catch(...)` guard below, which logs `boot.failed` and exits 1.
   */
  const preflight = await schemaPreflight(pool);
  log('info', 'boot.preflight', {
    role: preflight.role,
    migrationsPresent: preflight.migrationsPresent.length,
    privilegeAudit: preflight.privilegeAudit.status,
    /*
     * Detection-only findings, surfaced in the boot log so a pre-cutover
     * owner-class runtime is VISIBLE as such — never as compliance, never as
     * a credential. Attribute/membership NAMES only (emission ban).
     */
    forbiddenAttributes: preflight.privilegeAudit.forbiddenAttributes,
    forbiddenMemberships: preflight.privilegeAudit.forbiddenMemberships,
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
    /*
     * Retained, not fire-and-forget: the pool is ended only after this chain
     * settles, so in-flight gateway teardown never loses its database
     * mid-flight (correction 5, M14).
     */
    const gatewayStopped = gateway
      .stop()
      .then(() => gateway.leadership.releaseGracefully())
      .catch((error: unknown) => {
        log('error', 'shutdown.gateway_stop_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      });

    server.close((closeError) => {
      if (closeError) log('error', 'shutdown.server_close_failed', { message: closeError.message });
      gatewayStopped
        .then(() => pool.end())
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
