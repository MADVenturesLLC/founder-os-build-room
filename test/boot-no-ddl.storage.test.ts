/**
 * A-T2 — the boot path issues no DDL (r5 §6 A-R2; r6 PC-21).
 *
 * Mechanism: a `ddl_command_start` event trigger installed on a disposable
 * local `TEST_DATABASE_URL` fixture database records the command tag of every
 * DDL statement executed in that database, by any session. The compiled boot
 * entrypoint (`dist/packages/control-plane/src/main.js`) is then spawned as a
 * child process against that database, allowed to reach `boot.listening`, and
 * shut down with SIGTERM. Zero recorded tags proves the boot connection issued
 * no DDL — PC-21 observed at the kernel of the claim (the database itself),
 * not inferred from reading the source.
 *
 * All fixture SQL (database creation, migration, observation trigger) runs on
 * THIS suite's own connections before the child is spawned — never on the boot
 * connection under observation (r5 §4 Class 1). The fixture database is dropped
 * at teardown; nothing persistent results.
 *
 * RED at the bound base: `migrate()` runs at boot and unconditionally executes
 * `CREATE TABLE IF NOT EXISTS schema_migrations` (migrations.ts:1402), which
 * the event trigger records even when the table already exists and the command
 * is a no-op — so the zero-DDL assertion fails with the observed tag.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  STORAGE_SKIP,
  createGatewayHarness,
  destroyGatewayHarness,
  type GatewayHarness,
} from './gateway-storage-helpers.js';

/** The built boot entrypoint, resolved relative to this compiled test file. */
const MAIN_JS = fileURLToPath(
  new URL('../packages/control-plane/src/main.js', import.meta.url),
);

/**
 * Satisfies the config loader's 32-char minimum; never presented anywhere.
 * Built by concatenation so no credential-shaped literal appears in source.
 */
const SUITE_TOKEN = 'boot-no-ddl-suite-token-' + 'long-enough-32chars';

interface BootRun {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly reachedListening: boolean;
}

/** Reserve an ephemeral port the child can bind. */
function freePort(): Promise<number> {
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

/**
 * Spawn the real boot entrypoint against the fixture database, wait for
 * `boot.listening` (success path) or process exit (failure path), then SIGTERM
 * and collect the final exit code. Bounded so a wedged boot fails the test
 * instead of hanging the suite.
 */
function runBoot(databaseUrl: string, port: number): Promise<BootRun> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(process.execPath, [MAIN_JS], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        CONTROL_PLANE_TOKEN: SUITE_TOKEN,
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let sigtermSent = false;

    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new Error(
          `boot child did not reach a terminal state within 30s\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
        ),
      );
    }, 30_000);

    const finish = (run: BootRun): void => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve(run);
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (!sigtermSent && stdout.includes('"at":"boot.listening"')) {
        sigtermSent = true;
        child.kill('SIGTERM');
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      reject(error);
    });
    child.on('close', (code) => {
      finish({
        exitCode: code,
        stdout,
        stderr,
        reachedListening: stdout.includes('"at":"boot.listening"'),
      });
    });
  });
}

let harness: GatewayHarness | undefined;

before(async () => {
  if (STORAGE_SKIP) return;
  // Fresh migrated fixture database, created on this suite's own connection.
  harness = await createGatewayHarness('boot-no-ddl');
  // DDL observation: table + function first, trigger last, so the fixture's
  // own setup DDL is not recorded — only what happens afterwards (the boot).
  await harness.pool.query(
    `CREATE TABLE boot_ddl_observation (
       seq bigserial PRIMARY KEY,
       tag text NOT NULL,
       observed_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  await harness.pool.query(
    `CREATE FUNCTION boot_ddl_observation_record() RETURNS event_trigger
       LANGUAGE plpgsql AS $$
       BEGIN
         INSERT INTO boot_ddl_observation (tag) VALUES (tg_tag);
       END
       $$`,
  );
  await harness.pool.query(
    `CREATE EVENT TRIGGER boot_ddl_observation
       ON ddl_command_start
       EXECUTE FUNCTION boot_ddl_observation_record()`,
  );
});

after(async () => {
  await destroyGatewayHarness(harness);
  harness = undefined;
});

describe('boot issues no DDL (A-R2 / PC-21)', { skip: STORAGE_SKIP ? STORAGE_SKIP : false }, () => {
  it('boots to listening against an already-migrated schema, recording zero DDL on the boot connection', async (t) => {
    assert.ok(harness !== undefined, 'fixture harness was created');
    const port = await freePort();
    const run = await runBoot(harness.config.databaseUrl, port);

    // The success path: boot completes and serves; SIGTERM shuts it down.
    assert.equal(
      run.reachedListening,
      true,
      `boot never reached listening.\n--- stdout ---\n${run.stdout}\n--- stderr ---\n${run.stderr}`,
    );
    assert.equal(
      run.exitCode,
      0,
      `clean SIGTERM shutdown must exit 0.\n--- stdout ---\n${run.stdout}\n--- stderr ---\n${run.stderr}`,
    );

    // PC-21: the boot connection issued no DDL whatsoever.
    const { rows } = await harness.pool.query<{ tag: string }>(
      'SELECT tag FROM boot_ddl_observation ORDER BY seq',
    );
    t.diagnostic(`DDL tags observed during boot: ${JSON.stringify(rows.map((r) => r.tag))}`);
    assert.deepEqual(
      rows.map((r) => r.tag),
      [],
      'the boot path must issue zero DDL statements (PC-21)',
    );
  });
});
