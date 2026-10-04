/**
 * Exclusively owned, disposable PostgreSQL instances for storage fixtures.
 *
 * Several suites in this repository carry their own private copy of this
 * logic (`control-plane-postgres`, `gate-runs`, `journal-*`, `boot-no-ddl`).
 * This module is the one copy the runtime-role tier uses; the existing copies
 * are left exactly as they are, because consolidating them is a refactor of
 * suites this work has no other reason to touch.
 *
 * WHY AN OWNED INSTANCE AT ALL. Migration `0006_command_journal_authority_split`
 * creates CLUSTER-WIDE roles (`br_journal_owner`, `command_journal_writer`,
 * `br_app_runtime`). They cannot be applied per-database on one shared server
 * without colliding on `42710`, and the runtime-role tier needs `br_app_runtime`
 * to exist because it is the identity the application connects as after the
 * Tranche D cutover. An instance this process owns, and destroys, is the only
 * place that can be established by construction rather than by hope.
 *
 * What this does NOT do: it never touches the shared `TEST_DATABASE_URL`
 * server, and it never prints a credential. The instance trusts loopback
 * connections for the `postgres` superuser (as every sibling suite's owned
 * instance does); a login role that must authenticate with a password has one
 * set in memory by the caller and never written anywhere.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface ServerBins {
  readonly initdb: string;
  readonly pgCtl: string;
}

function hasAllThree(dir: string): boolean {
  return existsSync(join(dir, 'initdb')) && existsSync(join(dir, 'pg_ctl')) && existsSync(join(dir, 'postgres'));
}

/**
 * Locate server binaries. `initdb` requires `postgres` in its OWN directory, and
 * a client-only package can put `initdb`/`pg_ctl` on PATH from a different
 * directory than the server package's `postgres`, so every candidate must hold
 * all three. Order: explicit override, `pg_config`, PATH, the Debian/Ubuntu
 * multiarch layout. `undefined` means "not available here" and the caller says so.
 */
export function resolveServerBinaries(): ServerBins | undefined {
  const override = process.env['BUILDROOM_TEST_PG_BINDIR'];
  if (override !== undefined && override !== '' && hasAllThree(override)) {
    return { initdb: join(override, 'initdb'), pgCtl: join(override, 'pg_ctl') };
  }
  const pgConfig = spawnSync('pg_config', ['--bindir'], { timeout: 10_000, encoding: 'utf8' });
  if (pgConfig.status === 0 && pgConfig.stdout !== undefined) {
    const dir = pgConfig.stdout.trim();
    if (hasAllThree(dir)) return { initdb: join(dir, 'initdb'), pgCtl: join(dir, 'pg_ctl') };
  }
  const onPath = spawnSync('which', ['pg_ctl'], { timeout: 10_000, encoding: 'utf8' });
  if (onPath.status === 0 && onPath.stdout !== undefined && onPath.stdout.trim() !== '') {
    const dir = dirname(realpathSync(onPath.stdout.trim()));
    if (hasAllThree(dir)) return { initdb: join(dir, 'initdb'), pgCtl: join(dir, 'pg_ctl') };
  }
  const multiarch = '/usr/lib/postgresql';
  if (existsSync(multiarch)) {
    for (const version of readdirSync(multiarch).sort().reverse()) {
      const dir = join(multiarch, version, 'bin');
      if (hasAllThree(dir)) return { initdb: join(dir, 'initdb'), pgCtl: join(dir, 'pg_ctl') };
    }
  }
  return undefined;
}

/** Reserve an ephemeral loopback port. Racy by nature; `startOwnedInstance` retries. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (typeof address === 'object' && address !== null) resolve(address.port);
        else reject(new Error('could not reserve an ephemeral port'));
      });
    });
  });
}

export interface OwnedInstance {
  readonly rootDir: string;
  readonly clusterDir: string;
  /** The server log. Read it for development; it never carries a credential. */
  readonly logFile: string;
  readonly pgCtl: string;
  readonly port: number;
  started: boolean;
}

export interface StartOptions {
  /** Extra `postgres -c name=value` settings, e.g. `log_statement=all`. */
  readonly serverSettings?: readonly string[];
}

function tryStart(bins: ServerBins, port: number, options: StartOptions): OwnedInstance {
  // Short prefix: the Unix socket path must stay under the kernel `sun_path` limit.
  const rootDir = mkdtempSync(join(tmpdir(), 'rr-'));
  const clusterDir = join(rootDir, 'cluster');
  const socketDir = join(rootDir, 'sock');
  const logFile = join(rootDir, 'server.log');
  const instance: OwnedInstance = { rootDir, clusterDir, logFile, pgCtl: bins.pgCtl, port, started: false };
  try {
    const init = spawnSync(bins.initdb, ['-D', clusterDir, '--auth=trust', '--username=postgres', '--no-sync'], {
      timeout: 120_000,
      encoding: 'utf8',
    });
    if (init.status !== 0) throw new Error(`initdb failed:\n${String(init.stdout)}\n${String(init.stderr)}`);
    mkdirSync(socketDir, { recursive: true });
    const settings = [
      '-c fsync=off',
      '-c max_connections=200',
      ...(options.serverSettings ?? []).map((setting) => `-c ${setting}`),
    ].join(' ');
    const start = spawnSync(
      bins.pgCtl,
      [
        '-D', clusterDir, '-l', logFile, 'start', '-w', '-t', '60',
        '-o', `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${socketDir} ${settings}`,
      ],
      { timeout: 120_000, encoding: 'utf8' },
    );
    if (start.status !== 0) throw new Error(`pg_ctl start failed:\n${String(start.stdout)}\n${String(start.stderr)}`);
    instance.started = true;
    return instance;
  } catch (error) {
    destroyOwnedInstance(instance);
    throw error;
  }
}

/**
 * Start an owned instance on `port`, retrying on a fresh port if the start
 * fails. Many suite processes start clusters at once, and the gap between
 * `freePort()` releasing a port and the server binding it is a real race.
 */
export async function startOwnedInstance(bins: ServerBins, options: StartOptions = {}): Promise<OwnedInstance> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const port = await freePort();
    try {
      return tryStart(bins, port, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('could not start an owned PostgreSQL instance');
}

/** Stop and remove the instance. Idempotent; safe in an `exit` handler (synchronous). */
export function destroyOwnedInstance(instance: OwnedInstance | undefined): void {
  if (instance === undefined) return;
  if (instance.started) {
    spawnSync(instance.pgCtl, ['-D', instance.clusterDir, 'stop', '-m', 'immediate', '-w'], { timeout: 60_000 });
    instance.started = false;
  }
  rmSync(instance.rootDir, { recursive: true, force: true });
}
