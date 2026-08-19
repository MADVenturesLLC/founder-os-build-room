/**
 * §19 — the storage command refuses to pass by skipping.
 *
 * `npm test` lets the storage suites self-skip, which is right locally. `npm
 * run test:storage` must not: a command whose whole job is to exercise a real
 * Postgres, reporting success because it skipped everything, is the shape of a
 * green build that proves nothing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const PRELUDE = join(HERE, 'support', 'require-test-database-url.js');

function packageScripts(): Record<string, string> {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  return manifest.scripts ?? {};
}

describe('test-storage-command · fails-loudly-without-env', () => {
  it('exits non-zero with an explicit message when TEST_DATABASE_URL is absent', () => {
    const environment = { ...process.env };
    delete environment['TEST_DATABASE_URL'];

    const result = spawnSync(process.execPath, [PRELUDE], { env: environment, encoding: 'utf8' });

    assert.notEqual(result.status, 0, 'a missing database must fail the command');
    assert.match(result.stderr, /TEST_DATABASE_URL is required/);
    assert.match(result.stderr, /proving nothing/, 'and must say why it refuses');
  });

  it('exits non-zero for a blank value too', () => {
    const result = spawnSync(process.execPath, [PRELUDE], {
      env: { ...process.env, TEST_DATABASE_URL: '   ' },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
  });

  it('passes when the variable is set', () => {
    const result = spawnSync(process.execPath, [PRELUDE], {
      env: { ...process.env, TEST_DATABASE_URL: 'postgresql://postgres@127.0.0.1:5432/example' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /the storage suites will run/);
  });

  it('names TEST_DATABASE_URL and warns against the deployed variable', () => {
    const result = spawnSync(process.execPath, [PRELUDE], {
      env: (() => {
        const environment = { ...process.env };
        delete environment['TEST_DATABASE_URL'];
        return environment;
      })(),
      encoding: 'utf8',
    });
    // Pointing tests at production must stay a deliberate act, not an ambient one.
    assert.match(result.stderr, /THROWAWAY/);
    assert.match(result.stderr, /DATABASE_URL/);
  });
});

describe('test-storage-command · the command is wired to the prelude', () => {
  const scripts = packageScripts();

  it('runs the prelude before the runner', () => {
    const command = scripts['test:storage'];
    assert.ok(command !== undefined, 'test:storage must exist');
    assert.match(command, /require-test-database-url/, 'the prelude must run');
    assert.ok(
      command.indexOf('require-test-database-url') < command.indexOf('--test'),
      'and it must run BEFORE the test runner, or the skip has already happened',
    );
  });

  it('selects exactly the storage suites', () => {
    assert.match(scripts['test:storage'] ?? '', /dist\/test\/\*\.storage\.test\.js/);
  });

  it('builds first, so the compiled suites are current', () => {
    assert.match(scripts['test:storage'] ?? '', /npm run build/);
  });

  it('keeps `npm test` running the full suite, storage cases included', () => {
    // The full suite still matches `*.test.js`, which `*.storage.test.js` is —
    // so the storage cases keep running (and self-skipping) under `npm test`.
    assert.match(scripts['test'] ?? '', /dist\/test\/\*\.test\.js/);
    assert.ok(!/storage/.test(scripts['test'] ?? ''), '`npm test` is not storage-specific');
  });

  it('runs the real-Keychain suite only under its own command, on darwin', () => {
    const command = scripts['test:custody:macos'];
    assert.ok(command !== undefined, 'test:custody:macos must exist');
    assert.match(command, /BUILDROOM_CUSTODY_MACOS=1/, 'the opt-in is explicit');
    assert.match(command, /custody-macos/);
  });
});
