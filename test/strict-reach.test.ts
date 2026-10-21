/**
 * `npm run test:strict` is a claim: "every test in the suite ran, except the
 * platform-bound skips it names". These cases keep the claim honest.
 *
 * WHY THE SKIP MARKERS AND NOT THE COUNTER. Node's `skipped` total counts a
 * skipped TEST but not a skipped GROUP: a `describe(..., { skip })` registers
 * none of its children, so they appear in no counter at all. The storage
 * suites skip at group level, so a run with no database reports `skipped 0`.
 * The reporter does print a skip marker (U+FE63) for every skipped group and
 * every skipped test, so the strict verdict counts those. The first case below
 * runs a real child `node --test` to pin that behaviour of Node itself, so a
 * Node release that changes it fails here instead of passing quietly.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSpecSummary } from './support/runtime-role-tier.js';
import {
  STRICT_ALLOWED_SKIPS,
  isAllowedSkip,
  missingPrerequisites,
  reachReport,
  readSkipMarkers,
  strictVerdict,
} from './support/strict-reach.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const SOURCE_DIR = join(REPO_ROOT, 'test');
const RUNNER = join(HERE, 'support', 'run-strict.js');

const FIXTURE_DIR = mkdtempSync(join(tmpdir(), 'strict-reach-'));
after(() => rmSync(FIXTURE_DIR, { recursive: true, force: true }));

/** The parent runner's context variable would make a nested `node --test` report to it instead of printing. */
const CHILD_ENV: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== 'NODE_TEST_CONTEXT'),
);

/** Run a fixture through a real `node --test` with the spec reporter, as the strict runner does. */
function runFixture(name: string, body: string): { status: number | null; output: string } {
  const file = join(FIXTURE_DIR, `${name}.test.mjs`);
  writeFileSync(file, `import { describe, it, test } from 'node:test';\n${body}\n`);
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', file], {
    env: CHILD_ENV,
    encoding: 'utf8',
  });
  return { status: result.status, output: result.stdout };
}

const GROUP_SKIP_REASON = 'TEST_DATABASE_URL is not set — fixture group did not run';

describe('strict-reach · a skipped group is caught although Node does not count it', () => {
  const run = runFixture(
    'group-skip',
    `describe('a database group', { skip: '${GROUP_SKIP_REASON}' }, () => {\n` +
      `  it('would prove UPDATE is refused', () => {});\n` +
      `  it('would prove DELETE is refused', () => {});\n` +
      `});\n` +
      `test('a unit test that ran', () => {});`,
  );

  it('Node itself exits 0 and counts zero skipped (the behaviour this module exists for)', () => {
    assert.equal(run.status, 0);
    const summary = readSpecSummary(run.output);
    assert.ok(summary !== undefined, 'the spec summary must be readable');
    assert.equal(summary.skipped, 0, 'a skipped group is not in the skipped total');
    assert.equal(summary.tests, 1, 'and its children are not in the tests total');
  });

  it('reads the skipped group, by name and reason, from the skip marker', () => {
    const markers = readSkipMarkers(run.output);
    assert.equal(markers.length, 1);
    assert.equal(markers[0]?.name, 'a database group');
    assert.equal(markers[0]?.reason, GROUP_SKIP_REASON);
  });

  it('refuses to call the run a pass', () => {
    const verdict = strictVerdict(run.status, readSpecSummary(run.output), readSkipMarkers(run.output), 'darwin');
    assert.ok(verdict !== null, 'a run that skipped a group is not a pass');
    assert.match(verdict, /a database group/);
    assert.match(verdict, /TEST_DATABASE_URL is not set/);
  });
});

describe('strict-reach · other run shapes', () => {
  it('a skipped single test is caught as well', () => {
    const run = runFixture('test-skip', `test('one skipped test', { skip: 'no reason to run' }, () => {});\ntest('ran', () => {});`);
    const markers = readSkipMarkers(run.output);
    assert.deepEqual(markers.map((m) => m.reason), ['no reason to run']);
    assert.ok(strictVerdict(run.status, readSpecSummary(run.output), markers, 'darwin') !== null);
  });

  it('a clean run is a pass', () => {
    const run = runFixture('clean', `describe('a group', () => { it('ran', () => {}); });\ntest('also ran', () => {});`);
    const markers = readSkipMarkers(run.output);
    assert.deepEqual(markers, []);
    assert.equal(strictVerdict(run.status, readSpecSummary(run.output), markers, 'darwin'), null);
  });

  it('a failing run that also skipped reports both', () => {
    const run = runFixture(
      'fail-and-skip',
      `test('fails', () => { throw new Error('boom'); });\ndescribe('skipped group', { skip: 'not here' }, () => { it('x', () => {}); });`,
    );
    const verdict = strictVerdict(run.status, readSpecSummary(run.output), readSkipMarkers(run.output), 'darwin');
    assert.ok(verdict !== null);
    assert.match(verdict, /exited 1/);
    assert.match(verdict, /skipped group/);
  });

  it('an unreadable output is not a pass', () => {
    assert.ok(strictVerdict(0, readSpecSummary('nothing a reporter printed'), [], 'darwin') !== null);
  });

  it('reads a marker through ANSI colour codes', () => {
    const coloured = '\u001b[90m﹣ a coloured group (0.2ms) # not set here\u001b[39m\n';
    assert.deepEqual(readSkipMarkers(coloured), [{ name: 'a coloured group', reason: 'not set here' }]);
  });

  it('a skip with no reason has an empty reason, which no allowance matches', () => {
    const markers = readSkipMarkers('  ﹣ bare skip (0.1ms)\n');
    assert.deepEqual(markers, [{ name: 'bare skip', reason: '' }]);
    assert.equal(isAllowedSkip(markers[0]!, 'darwin'), false);
  });
});

describe('strict-reach · the only skips allowed are platform-bound or opt-in, and each is named', () => {
  const linuxOnly = 'Linux only: the proof reads /proc and ss';

  it('allows a Linux-only skip off Linux, and refuses it on Linux', () => {
    assert.equal(isAllowedSkip({ name: 'x', reason: linuxOnly }, 'darwin'), true);
    assert.equal(isAllowedSkip({ name: 'x', reason: linuxOnly }, 'linux'), false);
  });

  it('refuses any reason it does not list', () => {
    assert.equal(isAllowedSkip({ name: 'x', reason: 'TEST_DATABASE_URL is not set' }, 'darwin'), false);
  });

  it('passes a run whose only skips are allowed, and names them in the verdict-free report', () => {
    const output =
      `﹣ linux proof (0.1ms) # ${linuxOnly}\n✔ ran (0.1ms)\n` +
      'ℹ tests 1\nℹ suites 1\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n';
    const markers = readSkipMarkers(output);
    const summary = readSpecSummary(output);
    assert.equal(strictVerdict(0, summary, markers, 'darwin'), null);
    const report = reachReport(summary!, markers, 7);
    assert.match(report, /1 tests in 7 files ran/);
    assert.match(report, /Linux only/);
    assert.match(report, /npm test/, 'each allowed skip names where it does run');
  });

  it('every allowed reason appears verbatim in a test source, so the list cannot outlive the skip', () => {
    const sources = readdirSync(SOURCE_DIR)
      .filter((file) => file.endsWith('.test.ts') && file !== 'strict-reach.test.ts')
      .map((file) => readFileSync(join(SOURCE_DIR, file), 'utf8'))
      .join('\n');
    for (const allowed of STRICT_ALLOWED_SKIPS) {
      assert.ok(sources.includes(allowed.reason), `no test source skips with: ${allowed.reason}`);
    }
  });

  it('every allowed skip names an npm script that exists', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    for (const allowed of STRICT_ALLOWED_SKIPS) {
      assert.ok(manifest.scripts?.[allowed.command] !== undefined, `missing npm script: ${allowed.command}`);
    }
  });
});

describe('strict-reach · boot prerequisites fail closed and are all reported at once', () => {
  const complete = {
    env: { TEST_DATABASE_URL: 'postgresql://postgres@127.0.0.1:5432/example', MADBRIDGE_CHECKOUT: '/tmp/tui' },
    hasPgBinaries: true,
    prereqCMissing: [] as readonly string[],
  };

  it('reports nothing when every prerequisite is present', () => {
    assert.deepEqual(missingPrerequisites(complete), []);
  });

  it('reports every missing prerequisite, not only the first', () => {
    const missing = missingPrerequisites({
      env: {},
      hasPgBinaries: false,
      prereqCMissing: ['pinned proof runtime Node v22.23.2 is not the running process'],
    });
    assert.equal(missing.length, 4);
    assert.ok(missing.some((m) => /TEST_DATABASE_URL/.test(m) && /THROWAWAY/.test(m)));
    assert.ok(missing.some((m) => /BUILDROOM_TEST_PG_BINDIR/.test(m)));
    assert.ok(missing.some((m) => /v22\.23\.2/.test(m)));
    assert.ok(missing.some((m) => /MADBRIDGE_CHECKOUT/.test(m)));
  });

  it('treats a blank variable as missing', () => {
    const missing = missingPrerequisites({ ...complete, env: { ...complete.env, TEST_DATABASE_URL: '  ' } });
    assert.equal(missing.length, 1);
  });
});

describe('strict-reach · the command', () => {
  it('refuses to start the suite when a prerequisite is missing', () => {
    const env = { ...CHILD_ENV };
    delete env['TEST_DATABASE_URL'];
    const result = spawnSync(process.execPath, [RUNNER], { env, encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'a missing database must fail the command');
    assert.match(result.stderr, /TEST_DATABASE_URL/);
    assert.match(result.stderr, /NOT started/);
    assert.ok(!/ℹ tests/.test(result.stdout), 'the test runner must not have run');
  });

  it('is wired in package.json: builds first, then runs the strict runner', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const command = manifest.scripts?.['test:strict'];
    assert.ok(command !== undefined, 'test:strict must exist');
    assert.match(command, /^npm run build && /);
    assert.match(command, /dist\/test\/support\/run-strict\.js/);
  });
});
