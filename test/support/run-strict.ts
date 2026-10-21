/**
 * The `npm run test:strict` runner: the whole suite, with nothing allowed to
 * skip except the platform-bound and opt-in suites named in
 * `strict-reach.ts`.
 *
 * It runs the same files as `npm test` (every compiled `*.test.js`), in ONE
 * `node --test` invocation with the spec reporter, and judges the outcome
 * itself. It refuses to start when any prerequisite is missing and names all
 * of them, because a run without them would skip whole groups and still exit 0.
 *
 * Nothing here reads, prints or needs a credential. `TEST_DATABASE_URL` is
 * checked for presence only and passed through to the suites unchanged.
 */

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveServerBinaries } from './owned-postgres.js';
import { resolvePrereqCRuntime } from './require-prereq-c-runtime.js';
import { readSpecSummary } from './runtime-role-tier.js';
import { missingPrerequisites, reachReport, readSkipMarkers, strictVerdict } from './strict-reach.js';

const TEST_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message: string): never {
  process.stderr.write(`test:strict — ${message}\n`);
  process.exit(1);
}

const missing = missingPrerequisites({
  env: process.env,
  hasPgBinaries: resolveServerBinaries() !== undefined,
  prereqCMissing: resolvePrereqCRuntime().missing,
});
if (missing.length > 0) {
  fail(
    `the suite was NOT started; ${missing.length} prerequisite(s) missing:\n` +
      missing.map((gap) => `  - ${gap}\n`).join('') +
      'Without them whole test groups skip themselves and the run still exits 0. Use `npm test` for a run that may skip.',
  );
}

const files = readdirSync(TEST_DIR)
  .filter((file) => file.endsWith('.test.js'))
  .sort()
  .map((file) => join(TEST_DIR, file));
if (files.length === 0) fail('no compiled test files found (run `npm run build`)');

process.stdout.write(`test:strict — ${files.length} test files, every prerequisite present\n`);

const child = spawn(process.execPath, ['--test', '--test-reporter=spec', ...files], {
  stdio: ['ignore', 'pipe', 'inherit'],
});

let output = '';
child.stdout.on('data', (chunk: Buffer) => {
  const text = chunk.toString('utf8');
  output += text;
  process.stdout.write(text);
});

child.on('close', (code) => {
  const summary = readSpecSummary(output);
  const markers = readSkipMarkers(output);
  const verdict = strictVerdict(code, summary, markers, process.platform);
  if (verdict !== null || summary === undefined) fail(`NOT a pass: ${verdict ?? 'no readable summary'}`);
  process.stdout.write(`test:strict — pass: ${reachReport(summary, markers, files.length)}\n`);
});
