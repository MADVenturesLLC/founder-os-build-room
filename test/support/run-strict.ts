/**
 * The `npm run test:strict` runner: the whole suite, with nothing allowed to
 * skip except the platform-bound and opt-in suites named in
 * `strict-reach.ts`.
 *
 * It makes two passes, each ONE `node --test` invocation with the spec
 * reporter, and judges each itself:
 *   1. the ordinary pass: every compiled `*.test.js`, the same files as
 *      `npm test`, with `BUILDROOM_RUNTIME_ROLE` removed from the environment;
 *   2. the runtime-role pass: `RUNTIME_ROLE_SUITES` with
 *      `BUILDROOM_RUNTIME_ROLE=1`, which runs the suites the ordinary pass
 *      skips for the runtime role. It may skip nothing.
 * It refuses to start when any prerequisite is missing and names all of them,
 * because a run without them would skip whole groups and still exit 0.
 *
 * Nothing here reads, prints or needs a credential. `TEST_DATABASE_URL` is
 * checked for presence only and passed through to the suites unchanged.
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveServerBinaries } from './owned-postgres.js';
import { resolvePrereqCRuntime } from './require-prereq-c-runtime.js';
import { RUNTIME_ROLE_SUITES, readSpecSummary } from './runtime-role-tier.js';
import {
  missingPrerequisites,
  reachReport,
  readSkipMarkers,
  strictVerdict,
  type PassResult,
  type StrictPass,
} from './strict-reach.js';

const TEST_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message: string): never {
  process.stderr.write(`test:strict — ${message}\n`);
  process.exit(1);
}

/** Run one pass, echo its output, and return it judged; exits 1 when the pass is not a pass. */
function runPass(pass: StrictPass, files: readonly string[], env: NodeJS.ProcessEnv): Promise<PassResult> {
  process.stdout.write(`test:strict — ${pass} pass: ${files.length} test files\n`);
  const child = spawn(process.execPath, ['--test', '--test-reporter=spec', ...files], {
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    output += text;
    process.stdout.write(text);
  });
  return new Promise((resolve) => {
    child.on('close', (code) => {
      const summary = readSpecSummary(output);
      const markers = readSkipMarkers(output);
      const verdict = strictVerdict(code, summary, markers, process.platform, pass);
      if (verdict !== null || summary === undefined) fail(`NOT a pass (${pass} pass): ${verdict ?? 'no readable summary'}`);
      resolve({ summary, markers, fileCount: files.length });
    });
  });
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

const ordinaryFiles = readdirSync(TEST_DIR)
  .filter((file) => file.endsWith('.test.js'))
  .sort()
  .map((file) => join(TEST_DIR, file));
if (ordinaryFiles.length === 0) fail('no compiled test files found (run `npm run build`)');

const runtimeRoleFiles = RUNTIME_ROLE_SUITES.map((name) => join(TEST_DIR, `${name}.storage.test.js`));
const absent = runtimeRoleFiles.filter((file) => !existsSync(file));
if (absent.length > 0) fail(`compiled runtime-role suites not found (run \`npm run build\`): ${absent.join(', ')}`);

const ordinaryEnv: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== 'BUILDROOM_RUNTIME_ROLE'),
);

const ordinary = await runPass('ordinary', ordinaryFiles, ordinaryEnv);
const runtimeRole = await runPass('runtime-role', runtimeRoleFiles, { ...process.env, BUILDROOM_RUNTIME_ROLE: '1' });
process.stdout.write(`test:strict — pass:\n${reachReport(ordinary, runtimeRole)}\n`);
