/**
 * The runtime-role tier is a claim: "these suites run the application as
 * `br_app_runtime`". Nothing about a green run shows the claim still holds, so
 * these cases keep it honest without a database, in the credential-free job:
 *
 *   - every storage suite is classified — in the tier, or excluded WITH a
 *     reason — so a new suite cannot be added without a decision;
 *   - every suite in the tier is able to switch identity at all (it goes
 *     through the role-aware harness or the role helpers), actually builds
 *     something on the application pool or the runtime login, and none hands
 *     the superuser fixture pool to an application constructor;
 *   - the runner cannot report a pass for a run that skipped what it named;
 *   - the command and the CI step that run the tier exist and are ordered
 *     correctly.
 *
 * What these cases do NOT prove is that the application ran as the runtime
 * role: the harness's identity check and the tier run itself prove that.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RUNTIME_ROLE_EXCLUDED,
  RUNTIME_ROLE_SUITES,
  readSpecSummary,
  tierVerdict,
} from './support/runtime-role-tier.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const SOURCE_DIR = join(REPO_ROOT, 'test');
const SUFFIX = '.storage.test.ts';

/** Ground truth is the repository's sources, not whatever a stale build left in `dist`. */
const STORAGE_SUITES = readdirSync(SOURCE_DIR)
  .filter((file) => file.endsWith(SUFFIX))
  .map((file) => file.slice(0, -SUFFIX.length))
  .sort();

function source(suite: string): string {
  return readFileSync(join(SOURCE_DIR, `${suite}${SUFFIX}`), 'utf8');
}

/** What a suite must touch for the runtime role to be the identity under test. */
const RUNTIME_ROLE_USE = /\b(?:appPool|applicationUrl|asRuntimeLogin|RUNTIME_LOGIN)\b/;

/**
 * Whether the suite, or a helper module it imports from this directory, uses
 * the application pool or the runtime login. The harness module itself is
 * skipped: it mentions `appPool` for every consumer, which would prove nothing.
 */
function usesRuntimeRole(suite: string): boolean {
  const text = source(suite);
  if (RUNTIME_ROLE_USE.test(text)) return true;
  for (const match of text.matchAll(/from '\.\/([\w.-]+)\.js'/g)) {
    const helper = match[1];
    if (helper === undefined || helper === 'gateway-storage-helpers') continue;
    const path = join(SOURCE_DIR, `${helper}.ts`);
    if (existsSync(path) && RUNTIME_ROLE_USE.test(readFileSync(path, 'utf8'))) return true;
  }
  return false;
}

describe('runtime-role tier · every storage suite is classified', () => {
  it('finds the storage suites it is meant to partition', () => {
    assert.ok(STORAGE_SUITES.length >= 20, `only ${STORAGE_SUITES.length} storage suites found under ${SOURCE_DIR}`);
    assert.ok(STORAGE_SUITES.includes('runtime-role-boot'));
  });

  it('puts every storage suite in exactly one of the two lists', () => {
    const included = new Set(RUNTIME_ROLE_SUITES);
    const excluded = new Set(Object.keys(RUNTIME_ROLE_EXCLUDED));
    assert.equal(included.size, RUNTIME_ROLE_SUITES.length, 'no suite is listed twice in the tier');
    const both = [...included].filter((name) => excluded.has(name));
    assert.deepEqual(both, [], 'a suite cannot be both in the tier and excluded from it');
    const unclassified = STORAGE_SUITES.filter((name) => !included.has(name) && !excluded.has(name));
    assert.deepEqual(
      unclassified,
      [],
      'a storage suite is in neither list: add it to RUNTIME_ROLE_SUITES, or to RUNTIME_ROLE_EXCLUDED with the reason it cannot run as the runtime role',
    );
  });

  it('names no suite that does not exist', () => {
    const known = new Set(STORAGE_SUITES);
    const stale = [...RUNTIME_ROLE_SUITES, ...Object.keys(RUNTIME_ROLE_EXCLUDED)].filter((name) => !known.has(name));
    assert.deepEqual(stale, [], 'a listed suite has no source file');
  });

  it('gives every exclusion a real reason', () => {
    for (const [name, reason] of Object.entries(RUNTIME_ROLE_EXCLUDED)) {
      assert.ok(reason.trim().length >= 40, `${name}: the reason must say why, in a sentence`);
    }
  });
});

describe('runtime-role tier · every suite in it can actually run as the runtime role', () => {
  /** Idioms the role-aware harness replaced: the application is built on the application pool. */
  const FIXTURE_POOL_AS_APPLICATION = [
    /\bnew\s+(?:PostgresLedgerStore|GatewayRegistryStore|Phase3RunStore|JournalStore)\(\s*harness[!?]?\.pool\b/,
    /\b(?:createGatewaySurface|createServer|new\s+GatewayLeadership)\(\s*\{[^{}]*\bpool:\s*harness[!?]?\.pool\b/,
  ];

  for (const suite of RUNTIME_ROLE_SUITES) {
    it(`${suite} goes through the role-aware harness or the role helpers`, () => {
      const text = source(suite);
      assert.ok(
        /from '\.\/gateway-storage-helpers\.js'/.test(text) || /from '\.\/support\/runtime-role-mode\.js'/.test(text),
        'a suite in the tier must import gateway-storage-helpers or support/runtime-role-mode; otherwise BUILDROOM_RUNTIME_ROLE=1 cannot change what it connects as',
      );
    });

    it(`${suite} builds something on the application pool or the runtime login`, () => {
      assert.ok(
        usesRuntimeRole(suite),
        'a suite in the tier that never touches the application pool or the runtime login passes as a superuser and proves nothing about the runtime role: build an application object on harness.appPool, or exclude the suite with a reason',
      );
    });

    it(`${suite} never builds an application object on the superuser fixture pool`, () => {
      const text = source(suite);
      for (const pattern of FIXTURE_POOL_AS_APPLICATION) {
        assert.doesNotMatch(
          text,
          pattern,
          'pass harness.appPool, not harness.pool: the fixture pool is a superuser, and an application built on it passes without proving a single grant',
        );
      }
    });
  }

  it('the helper modules the harness suites share do not either', () => {
    for (const helper of readdirSync(SOURCE_DIR).filter((file) => /^gateway-.*helpers\.ts$/.test(file))) {
      const text = readFileSync(join(SOURCE_DIR, helper), 'utf8');
      for (const pattern of FIXTURE_POOL_AS_APPLICATION) assert.doesNotMatch(text, pattern, helper);
    }
  });
});

describe('runtime-role tier · the runner cannot pass by skipping', () => {
  const clean = [
    '✔ a test (1ms)',
    'ℹ tests 21',
    'ℹ suites 6',
    'ℹ pass 21',
    'ℹ fail 0',
    'ℹ cancelled 0',
    'ℹ skipped 0',
    'ℹ todo 0',
    'ℹ duration_ms 3461.1',
  ].join('\n');

  it('reads the counters of the spec reporter, with or without colour codes', () => {
    assert.deepEqual(readSpecSummary(clean), { tests: 21, pass: 21, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
    const coloured = clean
      .split('\n')
      .map((line) => `\u001b[34m${line}\u001b[39m`)
      .join('\n');
    assert.deepEqual(readSpecSummary(coloured), { tests: 21, pass: 21, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
  });

  it('passes a clean run', () => {
    assert.equal(tierVerdict(0, readSpecSummary(clean)), null);
  });

  it('refuses a run with any skipped test, even on exit code 0', () => {
    const verdict = tierVerdict(0, readSpecSummary(clean.replace('skipped 0', 'skipped 2')));
    assert.ok(verdict !== null);
    assert.match(verdict, /2 skipped/);
  });

  it('refuses a todo test', () => {
    assert.notEqual(tierVerdict(0, readSpecSummary(clean.replace('todo 0', 'todo 1'))), null);
  });

  it('refuses a run that ran nothing', () => {
    const empty = clean.replace('tests 21', 'tests 0').replace('pass 21', 'pass 0');
    assert.match(tierVerdict(0, readSpecSummary(empty)) ?? '', /no tests ran/);
  });

  it('refuses a failing run, whatever the exit code claims', () => {
    const failing = clean.replace('fail 0', 'fail 1').replace('pass 21', 'pass 20');
    assert.notEqual(tierVerdict(0, readSpecSummary(failing)), null);
    assert.notEqual(tierVerdict(1, readSpecSummary(failing)), null);
  });

  it('refuses a non-zero exit code even when the summary looks clean', () => {
    assert.match(tierVerdict(1, readSpecSummary(clean)) ?? '', /exited 1/);
  });

  it('refuses output it cannot read, rather than trusting it', () => {
    assert.equal(readSpecSummary('TAP version 13\n# tests 21\n'), undefined);
    assert.equal(readSpecSummary(clean.replace(/^ℹ skipped 0\n/m, '')), undefined, 'a missing counter is unreadable');
    assert.match(tierVerdict(0, undefined) ?? '', /no readable summary/);
  });
});

describe('runtime-role tier · the command and the CI step exist', () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const command = manifest.scripts?.['test:storage:runtime-role'];

  it('runs the strict prelude before the runner, after a build', () => {
    assert.ok(command !== undefined, 'test:storage:runtime-role must exist');
    assert.match(command, /^npm run build && /, 'builds first, so the compiled suites are current');
    assert.ok(
      command.indexOf('require-test-database-url') !== -1 &&
        command.indexOf('require-test-database-url') < command.indexOf('run-runtime-role-tier'),
      'the prelude runs BEFORE the runner, or a missing database skips everything quietly',
    );
  });

  it('is not part of `npm run test:storage`, which keeps its own glob', () => {
    assert.match(manifest.scripts?.['test:storage'] ?? '', /dist\/test\/\*\.storage\.test\.js/);
    assert.doesNotMatch(manifest.scripts?.['test:storage'] ?? '', /runtime-role/);
  });

  it('runs in the CI job that already has the PostgreSQL server binaries', () => {
    const ci = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const lines = ci.split('\n');
    const start = lines.findIndex((line) => /^ {2}storage-integration:\s*$/.test(line));
    assert.ok(start >= 0, 'ci.yml has a storage-integration job');
    let end = lines.findIndex((line, index) => index > start && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(line));
    if (end < 0) end = lines.length;
    const job = lines.slice(start, end).join('\n');
    assert.match(job, /npm run test:storage:runtime-role/, 'the storage-integration job must run the tier');
    assert.ok(
      job.indexOf('BUILDROOM_TEST_PG_BINDIR') < job.indexOf('npm run test:storage:runtime-role'),
      'the tier runs after the step that resolves the server binaries',
    );
    const step = job.slice(job.indexOf('npm run test:storage:runtime-role') - 400, job.indexOf('npm run test:storage:runtime-role'));
    assert.match(step, /TEST_DATABASE_URL/, 'the step sets the run gate the suites require');
  });
});
