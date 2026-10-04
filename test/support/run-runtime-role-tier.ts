/**
 * The `npm run test:storage:runtime-role` runner (PR 2b Tranche D, D3).
 *
 * Runs the suites in `RUNTIME_ROLE_SUITES` in ONE `node --test` invocation with
 * `BUILDROOM_RUNTIME_ROLE=1`, so the harness connects the application as
 * `br_app_runtime`. It then judges the outcome itself, because a green exit
 * code is not enough here: a tier that skipped what it was meant to run would
 * report success for a run that proved nothing about the runtime role.
 *
 * It refuses to start when PostgreSQL server binaries cannot be found, rather
 * than letting every suite fail one by one with a message about `initdb`.
 *
 * Nothing here reads, prints or needs a credential. `TEST_DATABASE_URL` is the
 * suites' run gate only; the tier's databases live on instances it owns.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveServerBinaries } from './owned-postgres.js';
import { RUNTIME_ROLE_SUITES, readSpecSummary, tierVerdict } from './runtime-role-tier.js';

const TEST_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message: string): never {
  process.stderr.write(`test:storage:runtime-role — ${message}\n`);
  process.exit(1);
}

if (resolveServerBinaries() === undefined) {
  fail(
    'PostgreSQL server binaries (initdb, pg_ctl, postgres) were not found.\n' +
      'The tier runs the application as br_app_runtime on instances it owns, so it cannot run without them.\n' +
      'Set BUILDROOM_TEST_PG_BINDIR to a PostgreSQL bin directory, or put pg_ctl on PATH.',
  );
}

const files = RUNTIME_ROLE_SUITES.map((name) => join(TEST_DIR, `${name}.storage.test.js`));
const missing = files.filter((file) => !existsSync(file));
if (missing.length > 0) {
  fail(`compiled suites not found (run \`npm run build\`): ${missing.join(', ')}`);
}

process.stdout.write(
  `test:storage:runtime-role — ${files.length} suites, the application connected as br_app_runtime (BUILDROOM_RUNTIME_ROLE=1)\n`,
);

const child = spawn(process.execPath, ['--test', '--test-reporter=spec', ...files], {
  env: { ...process.env, BUILDROOM_RUNTIME_ROLE: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

let output = '';
child.stdout.on('data', (chunk: Buffer) => {
  const text = chunk.toString('utf8');
  output += text;
  process.stdout.write(text);
});

child.on('close', (code) => {
  const verdict = tierVerdict(code, readSpecSummary(output));
  if (verdict !== null) fail(`NOT a pass: ${verdict}`);
  process.stdout.write(
    `test:storage:runtime-role — pass: ${files.length} suites ran as br_app_runtime, none skipped\n`,
  );
});
