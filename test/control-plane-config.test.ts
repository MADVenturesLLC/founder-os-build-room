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
import { loadConfig, ConfigError, challengeFreshnessDeadlineMs } from '../packages/control-plane/src/config.js';
import { createPool } from '../packages/control-plane/src/db.js';
import pgDefault from 'pg';

const { Client: PgClient } = pgDefault;

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
    assert.equal(config.phase3AdjudicationToken, null);
    assert.ok(config.readyProbeTimeoutMs > 0);
    assert.ok(config.poolMax > 0);
  });

  it('keeps the optional adjudication credential distinct and fail-closed', () => {
    const adjudicationToken = 'y'.repeat(32);
    assert.equal(
      loadConfig({
        DATABASE_URL: VALID_URL,
        CONTROL_PLANE_TOKEN: VALID_TOKEN,
        PHASE3_ADJUDICATION_TOKEN: adjudicationToken,
      }).phase3AdjudicationToken,
      adjudicationToken,
    );
    for (const value of ['', 'short', VALID_TOKEN]) {
      assert.throws(
        () =>
          loadConfig({
            DATABASE_URL: VALID_URL,
            CONTROL_PLANE_TOKEN: VALID_TOKEN,
            PHASE3_ADJUDICATION_TOKEN: value,
          }),
        ConfigError,
      );
    }
  });

  it('gives the pool its own connect budget, larger than the readiness probe', () => {
    /*
     * `connectionTimeoutMillis` was wired to `readyProbeTimeoutMs`. Two
     * seconds is the right bound for "is this instance ready?" and the wrong
     * one for "can this request open a connection?" — a suspended Neon
     * compute takes roughly one to five seconds to resume, so the first
     * request after any idle period was failed while the database was coming
     * back. The ordering is the invariant, not the exact number: if a later
     * edit ever collapses them again, this fails.
     */
    const config = loadConfig({ DATABASE_URL: VALID_URL, CONTROL_PLANE_TOKEN: VALID_TOKEN });

    assert.ok(config.poolConnectionTimeoutMs > config.readyProbeTimeoutMs);
    assert.ok(config.poolConnectionTimeoutMs >= 5_000, 'must clear the observed Neon resume range');
  });

  it('lets the connect budget be set independently of the probe budget', () => {
    const config = loadConfig({
      DATABASE_URL: VALID_URL,
      CONTROL_PLANE_TOKEN: VALID_TOKEN,
      READY_PROBE_TIMEOUT_MS: '1500',
      PG_CONNECTION_TIMEOUT_MS: '20000',
    });

    assert.equal(config.readyProbeTimeoutMs, 1_500);
    assert.equal(config.poolConnectionTimeoutMs, 20_000);
  });

  it('refuses a connect timeout past the 32-bit timer limit', () => {
    // Node rewrites a larger delay as 1 ms, so the value would silently invert.
    assert.throws(
      () => loadConfig({ DATABASE_URL: VALID_URL, CONTROL_PLANE_TOKEN: VALID_TOKEN, PG_CONNECTION_TIMEOUT_MS: '2147483648' }),
      ConfigError,
    );
    const ok = loadConfig({ DATABASE_URL: VALID_URL, CONTROL_PLANE_TOKEN: VALID_TOKEN, PG_CONNECTION_TIMEOUT_MS: '2147483647' });
    assert.equal(ok.poolConnectionTimeoutMs, 2_147_483_647);
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
  // These read the settings node-postgres actually connects with, not the
  // pool's options object. node-postgres applies the parsed connection string
  // OVER the options it is given, so an earlier version of this test, which
  // read `pool.options.ssl`, passed while `sslmode=no-verify` and `ssl=0`
  // turned verification, or TLS itself, off. A `Client` built from the pool's
  // options resolves them exactly as a pooled connection does, without
  // connecting.
  const VERIFY = { rejectUnauthorized: true };
  const cases: readonly { url: string; ssl: false | typeof VERIFY; why: string }[] = [
    { url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=require', ssl: VERIFY, why: 'hosted, sslmode=require' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=prefer', ssl: VERIFY, why: 'hosted, sslmode=prefer' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=verify-full', ssl: VERIFY, why: 'hosted, sslmode=verify-full' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db', ssl: VERIFY, why: 'hosted, no sslmode — must NOT drop to cleartext' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=no-verify', ssl: VERIFY, why: 'sslmode=no-verify cannot turn verification off' },
    {
      url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=require&uselibpqcompat=true',
      ssl: VERIFY,
      why: 'libpq-compatible require cannot turn verification off',
    },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?ssl=0', ssl: VERIFY, why: 'ssl=0 cannot turn TLS off' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?ssl=false', ssl: VERIFY, why: 'ssl=false cannot turn TLS off' },
    { url: 'postgresql://u:p@127.0.0.1:5432/db', ssl: false, why: 'loopback development cluster' },
    { url: 'postgresql://u:p@localhost:5432/db', ssl: false, why: 'loopback by name' },
    { url: 'postgresql://u:p@host/db?sslmode=disable', ssl: false, why: 'explicitly disabled' },
    // The password contains "localhost"; the HOST does not. Pattern matching
    // would read this as local and turn TLS off against a real provider.
    { url: 'postgresql://u:localhost@ep-x.neon.tech/db', ssl: VERIFY, why: 'credential merely contains localhost' },
    // Likewise a password containing "sslmode=disable" must not disable TLS.
    {
      url: 'postgresql://u:sslmode%3Ddisable@ep-x.neon.tech/db',
      ssl: VERIFY,
      why: 'credential merely contains sslmode=disable',
    },
  ];

  for (const { url, ssl, why } of cases) {
    it(`${ssl === false ? 'disables TLS' : 'verifies TLS'} — ${why}`, () => {
      const config = loadConfig({ DATABASE_URL: url, CONTROL_PLANE_TOKEN: VALID_TOKEN });
      const pool = createPool(config);
      try {
        const options = (pool as unknown as { options: Record<string, unknown> }).options;
        const client = new PgClient(options);
        const effective = (client as unknown as { connectionParameters: { ssl: unknown } }).connectionParameters.ssl;
        // The message names the case, never the URL, even a fixture one.
        assert.deepEqual(effective, ssl, `${why}: should ${ssl === false ? 'not use TLS' : 'use verified TLS'}`);
      } finally {
        void pool.end();
      }
    });
  }

  it('keeps every non-TLS parameter of the connection string', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://u:p@ep-x.neon.tech:6543/db?sslmode=require&application_name=br&channel_binding=require',
      CONTROL_PLANE_TOKEN: VALID_TOKEN,
    });
    const pool = createPool(config);
    try {
      const options = (pool as unknown as { options: Record<string, unknown> }).options;
      const params = (new PgClient(options) as unknown as {
        connectionParameters: { host: string; port: number; database: string; user: string; application_name: string };
      }).connectionParameters;
      assert.equal(params.host, 'ep-x.neon.tech');
      assert.equal(params.port, 6543);
      assert.equal(params.database, 'db');
      assert.equal(params.user, 'u');
      assert.equal(params.application_name, 'br');
    } finally {
      void pool.end();
    }
  });
});

/**
 * §6 — the gateway configuration bounds and cross-field relations
 * (corrections T4 and T4-extended).
 *
 * Every boundary is asserted at equality and on both sides of it. An off-by-one
 * in a bound is not a style issue here: `challengeRotationMs + 2 x
 * leaderHeartbeatMs` is what an overdue challenge is judged against, so a bound
 * that is loose by one tick is a replay window that is loose by one tick.
 */

const GATEWAY_BASE = { DATABASE_URL: VALID_URL, CONTROL_PLANE_TOKEN: VALID_TOKEN };

function loadGateway(overrides: Record<string, string> = {}) {
  return loadConfig({ ...GATEWAY_BASE, ...overrides });
}

describe('§6 — gateway defaults satisfy every bound', () => {
  it('loads the documented defaults', () => {
    const config = loadGateway();

    assert.equal(config.gatewayCodeTtlMs, 600_000);
    assert.equal(config.gatewayHeartbeatCadenceMs, 10_000);
    assert.equal(config.gatewayStalenessMs, 30_000);
    assert.equal(config.gatewayTimestampWindowMs, 120_000);
    assert.equal(config.gatewayAwaitingApprovalTtlMs, 3_600_000);
    assert.equal(config.leaderHeartbeatMs, 10_000);
    assert.equal(config.leaderLeaseTtlMs, 30_000);
    assert.equal(config.leaderSafetyDeadlineMs, 20_000);
    assert.equal(config.challengeRotationMs, 60_000);
    assert.equal(config.sessionNonceCapacity, 10_000);
    assert.equal(config.clockBackwardToleranceMs, 1_000);
    assert.equal(config.clockDivergenceToleranceMs, 2_000);
    assert.equal(config.clockStabilityMs, 30_000);
    assert.equal(config.sweepIntervalMs, 86_400_000);
  });

  it('defaults trustProxyHops to 0 — off until the edge has been observed', () => {
    assert.equal(loadGateway().trustProxyHops, 0);
    assert.equal(loadGateway({ TRUST_PROXY_HOPS: '1' }).trustProxyHops, 1);
    assert.throws(() => loadGateway({ TRUST_PROXY_HOPS: '-1' }), ConfigError);
    assert.throws(() => loadGateway({ TRUST_PROXY_HOPS: '1.5' }), ConfigError);
  });

  it('derives a challenge-freshness deadline of 80 s inside the 120 s window', () => {
    const config = loadGateway();
    assert.equal(challengeFreshnessDeadlineMs(config), 80_000);
    assert.ok(challengeFreshnessDeadlineMs(config) <= config.gatewayTimestampWindowMs);
  });
});

describe('control-plane-config · challenge-rotation-vs-window compound', () => {
  /*
   * The compound rule at equality and on both sides. `leaderHeartbeatMs` is
   * held at 10 000 so the deadline is `rotation + 20 000`, and the window is
   * held at 120 000, which puts the boundary at a rotation of exactly 100 000.
   */
  it('accepts a deadline strictly inside the window', () => {
    assert.equal(loadGateway({ CHALLENGE_ROTATION_MS: '99000' }).challengeRotationMs, 99_000);
  });

  it('accepts a deadline exactly equal to the window', () => {
    const config = loadGateway({ CHALLENGE_ROTATION_MS: '100000' });
    assert.equal(challengeFreshnessDeadlineMs(config), config.gatewayTimestampWindowMs);
  });

  it('refuses a deadline one millisecond beyond the window', () => {
    assert.throws(() => loadGateway({ CHALLENGE_ROTATION_MS: '100001' }), ConfigError);
  });

  it('refuses when a large heartbeat interval pushes the deadline past the window', () => {
    // This is the case the standalone "rotation below window" rule missed: the
    // rotation alone is well inside the window, and the deadline is not.
    assert.throws(
      () => loadGateway({ CHALLENGE_ROTATION_MS: '60000', LEADER_HEARTBEAT_MS: '40000', LEADER_SAFETY_DEADLINE_MS: '50000', LEADER_LEASE_TTL_MS: '60000' }),
      ConfigError,
    );
  });

  it('refuses a non-positive rotation interval', () => {
    assert.throws(() => loadGateway({ CHALLENGE_ROTATION_MS: '0' }), ConfigError);
    assert.throws(() => loadGateway({ CHALLENGE_ROTATION_MS: '-1' }), ConfigError);
  });

  it('refuses a non-positive heartbeat interval', () => {
    assert.throws(() => loadGateway({ LEADER_HEARTBEAT_MS: '0' }), ConfigError);
    assert.throws(() => loadGateway({ LEADER_HEARTBEAT_MS: '-1' }), ConfigError);
  });
});

describe('control-plane-config · heartbeat-vs-safety-deadline and safety-vs-ttl chain', () => {
  it('accepts a strictly increasing chain', () => {
    const config = loadGateway({
      LEADER_HEARTBEAT_MS: '5000',
      LEADER_SAFETY_DEADLINE_MS: '6000',
      LEADER_LEASE_TTL_MS: '7000',
    });
    assert.ok(config.leaderHeartbeatMs < config.leaderSafetyDeadlineMs);
    assert.ok(config.leaderSafetyDeadlineMs < config.leaderLeaseTtlMs);
  });

  it('refuses heartbeat equal to the safety deadline', () => {
    assert.throws(
      () => loadGateway({ LEADER_HEARTBEAT_MS: '20000', LEADER_SAFETY_DEADLINE_MS: '20000' }),
      ConfigError,
    );
  });

  it('refuses heartbeat above the safety deadline', () => {
    assert.throws(
      () => loadGateway({ LEADER_HEARTBEAT_MS: '20001', LEADER_SAFETY_DEADLINE_MS: '20000' }),
      ConfigError,
    );
  });

  it('refuses the safety deadline equal to the lease TTL', () => {
    assert.throws(
      () => loadGateway({ LEADER_SAFETY_DEADLINE_MS: '30000', LEADER_LEASE_TTL_MS: '30000' }),
      ConfigError,
    );
  });

  it('refuses the safety deadline above the lease TTL', () => {
    assert.throws(
      () => loadGateway({ LEADER_SAFETY_DEADLINE_MS: '30001', LEADER_LEASE_TTL_MS: '30000' }),
      ConfigError,
    );
  });
});

describe('control-plane-config · unsafe-integer and overflow inputs', () => {
  const UNSAFE = String(Number.MAX_SAFE_INTEGER + 2);

  it('refuses an unsafe integer for any deadline input', () => {
    for (const key of ['CHALLENGE_ROTATION_MS', 'LEADER_HEARTBEAT_MS', 'LEADER_SAFETY_DEADLINE_MS', 'LEADER_LEASE_TTL_MS', 'GATEWAY_TIMESTAMP_WINDOW_MS']) {
      assert.throws(() => loadGateway({ [key]: UNSAFE }), ConfigError, key);
    }
  });

  it('refuses values that would overflow the derived deadline expression', () => {
    // 2^52 doubled leaves the safe range; the sum must never be computed and
    // then compared as if it meant something.
    assert.throws(
      () =>
        loadGateway({
          LEADER_HEARTBEAT_MS: String(2 ** 52),
          LEADER_SAFETY_DEADLINE_MS: String(2 ** 52 + 1),
          LEADER_LEASE_TTL_MS: String(2 ** 52 + 2),
          CHALLENGE_ROTATION_MS: String(2 ** 52),
        }),
      ConfigError,
    );
  });

  it('refuses non-numeric and fractional inputs', () => {
    assert.throws(() => loadGateway({ CHALLENGE_ROTATION_MS: 'soon' }), ConfigError);
    assert.throws(() => loadGateway({ CHALLENGE_ROTATION_MS: '1.5' }), ConfigError);
    assert.throws(() => loadGateway({ SESSION_NONCE_CAPACITY: '0' }), ConfigError);
  });
});

describe('control-plane-config · staleness-vs-cadence, code TTL, window, clock tolerances', () => {
  it('accepts staleness at exactly twice and exactly six times the cadence', () => {
    assert.equal(loadGateway({ GATEWAY_STALENESS_MS: '20000' }).gatewayStalenessMs, 20_000);
    assert.equal(loadGateway({ GATEWAY_STALENESS_MS: '60000' }).gatewayStalenessMs, 60_000);
  });

  it('refuses staleness below twice and above six times the cadence', () => {
    assert.throws(() => loadGateway({ GATEWAY_STALENESS_MS: '19999' }), ConfigError);
    assert.throws(() => loadGateway({ GATEWAY_STALENESS_MS: '60001' }), ConfigError);
  });

  it('refuses staleness above the absolute 300 s ceiling', () => {
    // Cadence 60 000 would permit 360 000 by the multiple rule alone; the
    // absolute ceiling still refuses it.
    assert.throws(
      () => loadGateway({ GATEWAY_HEARTBEAT_CADENCE_MS: '60000', GATEWAY_STALENESS_MS: '360000' }),
      ConfigError,
    );
  });

  it('bounds the heartbeat cadence at both ends, inclusive', () => {
    assert.equal(loadGateway({ GATEWAY_HEARTBEAT_CADENCE_MS: '5000', GATEWAY_STALENESS_MS: '10000' }).gatewayHeartbeatCadenceMs, 5_000);
    assert.equal(loadGateway({ GATEWAY_HEARTBEAT_CADENCE_MS: '60000', GATEWAY_STALENESS_MS: '120000' }).gatewayHeartbeatCadenceMs, 60_000);
    assert.throws(() => loadGateway({ GATEWAY_HEARTBEAT_CADENCE_MS: '4999' }), ConfigError);
    assert.throws(() => loadGateway({ GATEWAY_HEARTBEAT_CADENCE_MS: '60001' }), ConfigError);
  });

  it('caps the code TTL at clause 8 exactly', () => {
    assert.equal(loadGateway({ GATEWAY_CODE_TTL_MS: '900000' }).gatewayCodeTtlMs, 900_000);
    assert.throws(() => loadGateway({ GATEWAY_CODE_TTL_MS: '900001' }), ConfigError);
  });

  it('caps the timestamp window at 300 s exactly', () => {
    assert.equal(
      loadGateway({ GATEWAY_TIMESTAMP_WINDOW_MS: '300000' }).gatewayTimestampWindowMs,
      300_000,
    );
    assert.throws(() => loadGateway({ GATEWAY_TIMESTAMP_WINDOW_MS: '300001' }), ConfigError);
  });

  it('carries the clock tolerances and the nonce capacity through', () => {
    const config = loadGateway({
      CLOCK_BACKWARD_TOLERANCE_MS: '250',
      CLOCK_DIVERGENCE_TOLERANCE_MS: '500',
      CLOCK_STABILITY_MS: '1000',
      SESSION_NONCE_CAPACITY: '25',
    });
    assert.equal(config.clockBackwardToleranceMs, 250);
    assert.equal(config.clockDivergenceToleranceMs, 500);
    assert.equal(config.clockStabilityMs, 1_000);
    assert.equal(config.sessionNonceCapacity, 25);
  });
});
