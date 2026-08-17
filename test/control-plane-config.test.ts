/**
 * Phase 2 — control-plane configuration and package boundary.
 *
 * Two things are asserted here, both cheap and both worth pinning:
 *
 * 1. **Config is fail-closed.** The Phase 2 run definition requires the
 *    control plane to "deploy and stay up" and to "connect to Postgres". A
 *    process that boots without a database and answers `/health` with 200
 *    would pass the first condition while failing the second silently, so a
 *    missing or malformed `DATABASE_URL` must be a boot failure.
 * 2. **The dependency direction is one-way.** `packages/contracts` and
 *    `packages/ledger` are pure (AC#5, enforced by `purity.test.ts`). Nothing
 *    keeps them pure if they may import the impure package, so the direction
 *    is asserted rather than assumed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ConfigError } from '../packages/control-plane/src/config.js';
import { createPool } from '../packages/control-plane/src/db.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VALID_URL = 'postgresql://user:secret@host.neon.tech/db?sslmode=require';
// A shared secret of the minimum accepted length. The value is meaningless;
// what matters is that config now refuses to load without one.
const VALID_TOKEN = 'x'.repeat(32);

describe('control plane — configuration', () => {
  it('accepts a well-formed environment and defaults the optional values', () => {
    const config = loadConfig({ DATABASE_URL: VALID_URL, CONTROL_PLANE_TOKEN: VALID_TOKEN });

    assert.equal(config.databaseUrl, VALID_URL);
    assert.equal(config.port, 8080);
    assert.equal(config.commitSha, 'unknown');
    assert.ok(config.readyProbeTimeoutMs > 0);
    assert.ok(config.poolMax > 0);
  });

  it('refuses to boot without DATABASE_URL', () => {
    assert.throws(() => loadConfig({}), ConfigError);
    assert.throws(() => loadConfig({ DATABASE_URL: '   ', CONTROL_PLANE_TOKEN: VALID_TOKEN }), ConfigError);
  });

  it('refuses a DATABASE_URL that is not a postgres connection string', () => {
    assert.throws(() => loadConfig({ DATABASE_URL: 'mysql://host/db', CONTROL_PLANE_TOKEN: VALID_TOKEN }), ConfigError);
    assert.throws(() => loadConfig({ DATABASE_URL: 'not-a-url', CONTROL_PLANE_TOKEN: VALID_TOKEN }), ConfigError);
  });

  it('does not echo the connection string in the error it raises for a bad one', () => {
    // The URL carries a password. An error message that quotes it puts a live
    // credential into logs, which is exactly where credentials must not be.
    try {
      loadConfig({ DATABASE_URL: 'mysql://user:hunter2@host/db', CONTROL_PLANE_TOKEN: VALID_TOKEN });
      assert.fail('expected a ConfigError');
    } catch (error) {
      assert.ok(error instanceof ConfigError);
      assert.ok(!error.message.includes('hunter2'), 'error message leaked the credential');
    }
  });

  it('rejects non-positive or non-integer numeric settings rather than coercing them', () => {
    assert.throws(() => loadConfig({ CONTROL_PLANE_TOKEN: VALID_TOKEN, DATABASE_URL: VALID_URL, PORT: '0' }), ConfigError);
    assert.throws(() => loadConfig({ CONTROL_PLANE_TOKEN: VALID_TOKEN, DATABASE_URL: VALID_URL, PORT: '-1' }), ConfigError);
    assert.throws(() => loadConfig({ CONTROL_PLANE_TOKEN: VALID_TOKEN, DATABASE_URL: VALID_URL, PORT: 'eighty' }), ConfigError);
    assert.throws(() => loadConfig({ CONTROL_PLANE_TOKEN: VALID_TOKEN, DATABASE_URL: VALID_URL, PG_POOL_MAX: '1.5' }), ConfigError);
  });

  it('prefers the platform-supplied commit SHA and reports `unknown` rather than guessing', () => {
    const fromPlatform = loadConfig({ CONTROL_PLANE_TOKEN: VALID_TOKEN, DATABASE_URL: VALID_URL, RAILWAY_GIT_COMMIT_SHA: 'abc123' });
    assert.equal(fromPlatform.commitSha, 'abc123');

    const fromFallback = loadConfig({ CONTROL_PLANE_TOKEN: VALID_TOKEN, DATABASE_URL: VALID_URL, COMMIT_SHA: 'def456' });
    assert.equal(fromFallback.commitSha, 'def456');

    assert.equal(loadConfig({ DATABASE_URL: VALID_URL, CONTROL_PLANE_TOKEN: VALID_TOKEN }).commitSha, 'unknown');
  });
});

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('control plane — package boundary', () => {
  it('the pure packages import nothing from the control plane', () => {
    const pureSources = [
      join(REPO_ROOT, 'packages', 'contracts', 'src'),
      join(REPO_ROOT, 'packages', 'ledger', 'src'),
    ].flatMap(tsFiles);

    assert.ok(pureSources.length > 0, 'found no pure sources to scan — the paths are wrong');

    for (const file of pureSources) {
      const source = readFileSync(file, 'utf8');
      assert.ok(
        !/control-plane/.test(source),
        `${file} references the control plane; the pure packages must not depend on it`,
      );
    }
  });
});

describe('control plane — TLS defaults', () => {
  // A pool's config is not readable after construction, so these assert the
  // decision function's inputs through `createPool` not throwing plus the
  // documented rule. The rule itself is what matters: ON unless explicitly
  // disabled or loopback.
  const cases: readonly { url: string; tls: boolean; why: string }[] = [
    { url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=require', tls: true, why: 'hosted, sslmode present' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db', tls: true, why: 'hosted, no sslmode — must NOT drop to cleartext' },
    { url: 'postgresql://u:p@127.0.0.1:5432/db', tls: false, why: 'loopback development cluster' },
    { url: 'postgresql://u:p@localhost:5432/db', tls: false, why: 'loopback by name' },
    { url: 'postgresql://u:p@host/db?sslmode=disable', tls: false, why: 'explicitly disabled' },
    // The password contains "localhost"; the HOST does not. Pattern matching
    // would read this as local and turn TLS off against a real provider.
    { url: 'postgresql://u:localhost@ep-x.neon.tech/db', tls: true, why: 'credential merely contains localhost' },
  ];

  for (const { url, tls, why } of cases) {
    it(`${tls ? 'enables' : 'disables'} TLS — ${why}`, () => {
      const config = loadConfig({ DATABASE_URL: url, CONTROL_PLANE_TOKEN: VALID_TOKEN });
      const pool = createPool(config);
      try {
        // `ssl` is normalised onto the pool's options by node-postgres.
        const actual = Boolean((pool as unknown as { options?: { ssl?: unknown } }).options?.ssl);
        assert.equal(actual, tls, `${url} should ${tls ? 'use' : 'not use'} TLS`);
      } finally {
        void pool.end();
      }
    });
  }
});
