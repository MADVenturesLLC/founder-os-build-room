/**
 * `npm run test:strict` is a claim: "every test in the suite ran, except the
 * platform-bound and opt-in skips it names". These cases keep the claim honest.
 *
 * WHY THE SKIP MARKERS AND NOT THE COUNTER. Node's `skipped` total counts a
 * skipped TEST but not a skipped GROUP: a `describe(..., { skip })` registers
 * none of its children, so they appear in no counter at all. The storage
 * suites skip at group level, so a run with no database reports `skipped 0`.
 * The reporter does print a skip marker (U+FE63) for every skipped group and
 * every skipped test, so the strict verdict counts those. The first cases below
 * run a real child `node --test` to pin that behaviour of Node itself, so a
 * Node release that changes it fails here instead of passing quietly.
 *
 * WHY TWO PASSES. Some storage suites run only with the application connected
 * as `br_app_runtime` (`BUILDROOM_RUNTIME_ROLE=1`) and skip otherwise. The
 * strict command runs every file in ordinary mode, then the runtime-role suites
 * in that mode. The ordinary pass may skip with the runtime-role reason only
 * because the second pass runs those suites, and the second pass may skip
 * nothing.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNTIME_ROLE_SUITES, readSpecSummary } from './support/runtime-role-tier.js';
import {
  RUNTIME_ROLE_TIER_REASON,
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

/** Test sources other than this file, by file name. */
function testSources(): ReadonlyMap<string, string> {
  return new Map(
    readdirSync(SOURCE_DIR)
      .filter((file) => file.endsWith('.test.ts') && file !== 'strict-reach.test.ts')
      .map((file) => [file, readFileSync(join(SOURCE_DIR, file), 'utf8')] as const),
  );
}

function packageScripts(): Record<string, string> {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return manifest.scripts ?? {};
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
    const verdict = strictVerdict(run.status, readSpecSummary(run.output), readSkipMarkers(run.output), 'darwin', 'ordinary');
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
    assert.ok(strictVerdict(run.status, readSpecSummary(run.output), markers, 'darwin', 'ordinary') !== null);
  });

  it('a clean run is a pass', () => {
    const run = runFixture('clean', `describe('a group', () => { it('ran', () => {}); });\ntest('also ran', () => {});`);
    const markers = readSkipMarkers(run.output);
    assert.deepEqual(markers, []);
    assert.equal(strictVerdict(run.status, readSpecSummary(run.output), markers, 'darwin', 'ordinary'), null);
  });

  it('a failing run that also skipped reports both', () => {
    const run = runFixture(
      'fail-and-skip',
      `test('fails', () => { throw new Error('boom'); });\ndescribe('skipped group', { skip: 'not here' }, () => { it('x', () => {}); });`,
    );
    const verdict = strictVerdict(run.status, readSpecSummary(run.output), readSkipMarkers(run.output), 'darwin', 'ordinary');
    assert.ok(verdict !== null);
    assert.match(verdict, /exited 1/);
    assert.match(verdict, /skipped group/);
  });

  it('an unreadable output is not a pass', () => {
    assert.ok(strictVerdict(0, readSpecSummary('nothing a reporter printed'), [], 'darwin', 'ordinary') !== null);
  });

  it('reads a marker through ANSI colour codes', () => {
    const coloured = '\u001b[90m﹣ a coloured group (0.2ms) # not set here\u001b[39m\n';
    assert.deepEqual(readSkipMarkers(coloured), [{ name: 'a coloured group', reason: 'not set here' }]);
  });

  it('a skip with no reason has an empty reason, which no allowance matches', () => {
    const markers = readSkipMarkers('  ﹣ bare skip (0.1ms)\n');
    assert.deepEqual(markers, [{ name: 'bare skip', reason: '' }]);
    assert.equal(isAllowedSkip(markers[0]!, 'darwin', 'ordinary'), false);
    assert.equal(isAllowedSkip(markers[0]!, 'linux', 'ordinary'), false);
  });
});

describe('strict-reach · platform-bound and opt-in skips are allowed only on the platform they belong to', () => {
  const allowed = (reason: string, platform: NodeJS.Platform): boolean =>
    isAllowedSkip({ name: 'x', reason }, platform, 'ordinary');
  const reasonOf = (fragment: string): string => {
    const entry = STRICT_ALLOWED_SKIPS.find((candidate) => candidate.reason.includes(fragment));
    assert.ok(entry !== undefined, `no allowance contains: ${fragment}`);
    return entry.reason;
  };

  it('Linux-only proofs: allowed off Linux, refused on Linux', () => {
    const linuxOnly = reasonOf('Linux only: the proof reads /proc and ss');
    assert.equal(allowed(linuxOnly, 'darwin'), true);
    assert.equal(allowed(linuxOnly, 'linux'), false);
    const notLinux = reasonOf('not linux — the real systemd-creds suite did not run');
    assert.equal(allowed(notLinux, 'darwin'), true);
    assert.equal(allowed(notLinux, 'linux'), false);
  });

  it('macOS-only proofs: allowed off macOS, refused on macOS', () => {
    const notDarwin = reasonOf('not darwin — the real-Keychain suite did not run');
    assert.equal(allowed(notDarwin, 'linux'), true);
    assert.equal(allowed(notDarwin, 'darwin'), false);
    const occupancy = reasonOf('macOS only: the occupancy-lock proof');
    assert.equal(allowed(occupancy, 'linux'), true);
    assert.equal(allowed(occupancy, 'darwin'), false);
  });

  it('opt-in custody suites: each allowed only on its own platform', () => {
    const keychain = reasonOf('BUILDROOM_CUSTODY_MACOS is not set');
    assert.equal(allowed(keychain, 'darwin'), true);
    assert.equal(allowed(keychain, 'linux'), false);
    const systemd = reasonOf('BUILDROOM_CUSTODY_LINUX is not set');
    assert.equal(allowed(systemd, 'linux'), true);
    assert.equal(allowed(systemd, 'darwin'), false);
  });

  it('refuses any reason it does not list', () => {
    assert.equal(allowed('TEST_DATABASE_URL is not set', 'darwin'), false);
  });

  it('every allowed reason appears verbatim in a test source, so the list cannot outlive the skip', () => {
    const sources = [...testSources().values()].join('\n');
    for (const entry of STRICT_ALLOWED_SKIPS) {
      assert.ok(sources.includes(entry.reason), `no test source skips with: ${entry.reason}`);
    }
  });

  it('every allowed skip names an npm script that exists', () => {
    const scripts = packageScripts();
    for (const entry of STRICT_ALLOWED_SKIPS) {
      assert.ok(scripts[entry.command] !== undefined, `missing npm script: ${entry.command}`);
    }
  });
});

describe('strict-reach · the runtime-role suites run in a second pass', () => {
  const tierSkip = { name: 'phase 4 lifecycle · reconstruction', reason: RUNTIME_ROLE_TIER_REASON };

  it('the ordinary pass may skip with the runtime-role reason, on any platform', () => {
    assert.equal(isAllowedSkip(tierSkip, 'darwin', 'ordinary'), true);
    assert.equal(isAllowedSkip(tierSkip, 'linux', 'ordinary'), true);
  });

  it('the runtime-role pass may skip nothing, not even an otherwise allowed reason', () => {
    assert.equal(isAllowedSkip(tierSkip, 'darwin', 'runtime-role'), false);
    const linuxOnly = { name: 'x', reason: 'Linux only: the proof reads /proc and ss' };
    assert.equal(isAllowedSkip(linuxOnly, 'darwin', 'ordinary'), true);
    assert.equal(isAllowedSkip(linuxOnly, 'darwin', 'runtime-role'), false);
  });

  it('every suite that skips with the runtime-role reason is one the second pass runs', () => {
    // Without this, the ordinary pass could allow a skip that no pass ever runs.
    const suffix = '.storage.test.ts';
    const skipping = [...testSources()]
      .filter(([, text]) => text.includes(RUNTIME_ROLE_TIER_REASON))
      .map(([file]) => file);
    assert.ok(skipping.length > 0, 'the runtime-role reason must be found in at least one suite');
    for (const file of skipping) {
      assert.ok(file.endsWith(suffix), `${file} skips for the runtime role but is not a storage suite`);
      assert.ok(RUNTIME_ROLE_SUITES.includes(file.slice(0, -suffix.length)), `${file} is not in RUNTIME_ROLE_SUITES`);
    }
  });

  it('the runner runs RUNTIME_ROLE_SUITES with BUILDROOM_RUNTIME_ROLE=1 (a text check on its source)', () => {
    const runner = readFileSync(join(SOURCE_DIR, 'support', 'run-strict.ts'), 'utf8');
    assert.match(runner, /RUNTIME_ROLE_SUITES/);
    assert.match(runner, /BUILDROOM_RUNTIME_ROLE: '1'/);
    assert.match(runner, /runPass\('runtime-role', runtimeRoleFiles,/, 'and judges those files as the runtime-role pass');
  });
});

describe('strict-reach · the report names both passes and every skip', () => {
  const ordinaryOutput =
    '﹣ linux proof (0.1ms) # Linux only: the proof reads /proc and ss\n' +
    `﹣ phase 4 group (0.1ms) # ${RUNTIME_ROLE_TIER_REASON}\n✔ ran (0.1ms)\n` +
    'ℹ tests 1\nℹ suites 2\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n';
  const runtimeOutput = '✔ ran as the runtime role (0.1ms)\nℹ tests 3\nℹ suites 1\nℹ pass 3\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n';

  it('both passes are accepted', () => {
    assert.equal(strictVerdict(0, readSpecSummary(ordinaryOutput), readSkipMarkers(ordinaryOutput), 'darwin', 'ordinary'), null);
    assert.equal(strictVerdict(0, readSpecSummary(runtimeOutput), readSkipMarkers(runtimeOutput), 'darwin', 'runtime-role'), null);
  });

  it('the report states each pass and where each skip runs instead', () => {
    const report = reachReport(
      { summary: readSpecSummary(ordinaryOutput)!, markers: readSkipMarkers(ordinaryOutput), fileCount: 7 },
      { summary: readSpecSummary(runtimeOutput)!, markers: readSkipMarkers(runtimeOutput), fileCount: 2 },
    );
    assert.match(report, /ordinary pass: 1 tests in 7 files ran and passed/);
    assert.match(report, /runtime-role pass: 3 tests in 2 files ran and passed as br_app_runtime/);
    assert.match(report, /1 skipped .*runtime-role pass/, 'the tier skip is reported as run in the second pass');
    assert.match(report, /Linux only/);
    assert.match(report, /npm test/, 'each platform skip names where it does run');
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

  it('says MADBRIDGE_CHECKOUT is separate from the variable the Prerequisite C check reads', () => {
    const missing = missingPrerequisites({ ...complete, env: { ...complete.env, MADBRIDGE_CHECKOUT: '' } });
    assert.equal(missing.length, 1);
    assert.match(missing[0]!, /BUILDROOM_PREREQC_TUI_ROOT/);
    assert.match(missing[0]!, /7d37a61/, 'and names the commit the clone must contain');
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
    const command = packageScripts()['test:strict'];
    assert.ok(command !== undefined, 'test:strict must exist');
    assert.match(command, /^npm run build && /);
    assert.match(command, /dist\/test\/support\/run-strict\.js/);
  });
});
