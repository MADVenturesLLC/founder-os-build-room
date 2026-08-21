/**
 * Control-plane configuration — read once at boot, fail closed.
 *
 * Every value comes from the environment. Nothing is defaulted that would let
 * the process come up believing it has a database when it does not: a missing
 * or unparseable `DATABASE_URL` is a boot failure, not a degraded mode
 * (architecture §3.15, fail-closed).
 *
 * Credentials are read from the environment and never written to the
 * repository (`DEC-20260815-07`; exit criterion 1 of `DEC-20260815-17`'s
 * Phase 2 authorization).
 */

export interface Config {
  /** Postgres connection string. Required — no default, no fallback. */
  readonly databaseUrl: string;
  /**
   * Shared secret every room endpoint requires. Required — no default, and
   * deliberately no "unauthenticated when unset" mode.
   *
   * The Phase 2 surface was written unauthenticated on the reasoning that it
   * is the smallest thing that lets a run be judged. That reasoning was wrong
   * about one fact: the service has a public Railway URL, so "smallest
   * surface" and "publicly writable ledger" were the same thing. Any caller
   * who found the URL could create rooms, append events, and export a room's
   * full ledger — actor identities, attribution and evidence payloads
   * included. Raised by CodeRabbit on PR #2.
   *
   * Required rather than optional because an optional guard is off wherever
   * someone forgot to turn it on, and the place it would be forgotten is
   * production. A missing token is a boot failure, on the same footing as a
   * missing `DATABASE_URL`.
   */
  readonly apiToken: string;
  /** TCP port for the HTTP surface. */
  readonly port: number;
  /**
   * The commit this process was built from, surfaced on `/version` so a run's
   * evidence can be bound to a SHA. Unknown is reported as `unknown`, never
   * guessed.
   */
  readonly commitSha: string;
  /** Deployment environment label, for evidence records. */
  readonly environment: string;
  /** Milliseconds a readiness database probe may take before it is failed. */
  readonly readyProbeTimeoutMs: number;
  /** Postgres statement timeout, ms. Bounds a wedged query. */
  readonly statementTimeoutMs: number;
  /** Maximum pooled connections. Neon's free/launch computes are small. */
  readonly poolMax: number;
  /**
   * Milliseconds before an idle pooled connection is released — it maps to
   * `pg`'s `idleTimeoutMillis` and defaults to 30_000. The doc comment here
   * once read "Seconds", which a reader would have acted on by setting the
   * value a thousand times too small. Caught by CodeRabbit on PR #2.
   */
  readonly poolIdleTimeoutMs: number;
  /**
   * Milliseconds the pool may wait to ESTABLISH a connection, mapping to
   * `pg`'s `connectionTimeoutMillis`.
   *
   * Its own knob rather than a reuse of `readyProbeTimeoutMs`, because the two
   * answer opposite questions. The readiness probe asks "can this instance
   * serve traffic right now?" and wants a fast no — two seconds is right for
   * it. Opening a connection asks "can this request reach the database?", and
   * on Neon the honest answer after an idle period is "yes, in a moment": a
   * suspended compute takes roughly one to five seconds to resume. Bounding
   * that at the probe's two seconds failed the first request after every idle
   * period, which is the request most likely to be a real user arriving.
   *
   * Ten seconds clears the observed resume range with headroom and still
   * fails rather than hanging. It is not a statement timeout — once connected,
   * `statementTimeoutMs` bounds the query.
   */
  readonly poolConnectionTimeoutMs: number;

  /* ---- Gateway enrollment and pairing (contract §6) ------------------- */

  /** Lifetime of a minted pairing code. Clause 8 caps this at 15 minutes. */
  readonly gatewayCodeTtlMs: number;
  /** How often an enrolled gateway is expected to beat. */
  readonly gatewayHeartbeatCadenceMs: number;
  /** How long since the last accepted beat before liveness is stale. */
  readonly gatewayStalenessMs: number;
  /** Acceptance window for a signed envelope's timestamp, skew included. */
  readonly gatewayTimestampWindowMs: number;
  /** How long a redeemed-but-unconfirmed enrollment may sit awaiting approval. */
  readonly gatewayAwaitingApprovalTtlMs: number;

  /* ---- Fenced leadership (contract §7) -------------------------------- */

  /** Supervisor interval: lease renewal when leader, acquisition when not. */
  readonly leaderHeartbeatMs: number;
  /** How stale a lease heartbeat may be before another process may take it. */
  readonly leaderLeaseTtlMs: number;
  /**
   * How long since the last successful renewal before this process demotes
   * itself. Strictly below the TTL, so a leader gives up before its lease can
   * be taken — the two-sided bound that keeps two processes from both
   * believing they lead.
   */
  readonly leaderSafetyDeadlineMs: number;
  /** How often the leader rotates the published challenge within a generation. */
  readonly challengeRotationMs: number;

  /* ---- Replay and clock discipline (contract §4, §9) ------------------- */

  /**
   * The absolute global ceiling on the active nonce epoch — independent of
   * source-IP cardinality, because the store is grow-only within its epoch and
   * evicts nothing.
   */
  readonly sessionNonceCapacity: number;
  readonly clockBackwardToleranceMs: number;
  readonly clockDivergenceToleranceMs: number;
  readonly clockStabilityMs: number;

  /* ---- Sweeps and proxy (contract §18, §20) --------------------------- */

  readonly sweepIntervalMs: number;
  /**
   * Trusted proxy hops. Defaults to 0 — OFF — and is enabled only after the
   * live edge's `X-Forwarded-For` behaviour has been observed (§20). Rate-limit
   * buckets coarsen behind an edge with this off, which is a disclosed cost;
   * trusting an unverified header is a spoofable one.
   */
  readonly trustProxyHops: number;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

interface Env {
  readonly [key: string]: string | undefined;
}

function required(env: Env, key: string): string {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') {
    throw new ConfigError(
      `${key} is required and was not set. The control plane does not start ` +
        `without it — see packages/control-plane/README.md.`,
    );
  }
  return raw.trim();
}

function integer(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${key} must be a positive integer; got ${JSON.stringify(raw)}.`);
  }
  return parsed;
}

/**
 * A positive integer small enough to be a real timer delay.
 *
 * Node stores timer delays in a signed 32-bit int and silently rewrites
 * anything larger as **1 ms**. A too-large timeout therefore becomes the
 * shortest possible one and fails every connection — the opposite of what was
 * configured. Raised by CodeRabbit on PR #6.
 */
const MAX_TIMER_MS = 2_147_483_647;

function timerMs(env: Env, key: string, fallback: number): number {
  const value = integer(env, key, fallback);
  if (value > MAX_TIMER_MS) {
    throw new ConfigError(
      `${key} must be at most ${MAX_TIMER_MS} ms; got ${value}. Node rewrites a ` +
        `larger timer delay as 1 ms, so this would connect-timeout immediately.`,
    );
  }
  return value;
}

/**
 * A non-negative integer, where zero is a meaningful value rather than a
 * mistake. `integer` above refuses zero — right for a pool size or a port, and
 * wrong for `TRUST_PROXY_HOPS`, whose safe default IS zero.
 */
function nonNegativeInteger(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ConfigError(`${key} must be a non-negative safe integer; got ${JSON.stringify(raw)}.`);
  }
  return parsed;
}

/**
 * A positive **safe** integer.
 *
 * `Number.isInteger` is not enough for the values below. `2^53 + 1` parses to
 * `2^53`, which `Number.isInteger` accepts happily — and the derived deadline
 * `challengeRotationMs + 2 * leaderHeartbeatMs` computed from such a value is
 * arithmetic nobody can trust. Every gateway timing value is checked for safety
 * here, and every expression derived from them is checked again below.
 */
function safeInteger(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${key} must be a positive safe integer; got ${JSON.stringify(raw)}.`);
  }
  return parsed;
}

function atMost(key: string, value: number, limit: number, why: string): void {
  if (value > limit) throw new ConfigError(`${key} must be at most ${limit} (${why}); got ${value}.`);
}

function atLeast(key: string, value: number, limit: number, why: string): void {
  if (value < limit) throw new ConfigError(`${key} must be at least ${limit} (${why}); got ${value}.`);
}

/**
 * Add, refusing anything that leaves the safe-integer range.
 *
 * The derived challenge-freshness deadline is security-relevant: it is what an
 * overdue challenge is judged against. An overflowed sum would not merely be
 * wrong, it would be wrong in the permissive direction.
 */
function safeSum(key: string, parts: readonly number[]): number {
  let total = 0;
  for (const part of parts) {
    total += part;
    if (!Number.isSafeInteger(total)) {
      throw new ConfigError(`${key} overflows the safe-integer range; the configured values are unusable.`);
    }
  }
  return total;
}

function safeProduct(key: string, left: number, right: number): number {
  const product = left * right;
  if (!Number.isSafeInteger(product)) {
    throw new ConfigError(`${key} overflows the safe-integer range; the configured values are unusable.`);
  }
  return product;
}

/**
 * Parse configuration from an environment mapping.
 *
 * Takes the environment as an argument rather than reading `process.env`
 * directly so it is testable without mutating global state.
 */
export function loadConfig(env: Env): Config {
  const databaseUrl = required(env, 'DATABASE_URL');
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new ConfigError(
      'DATABASE_URL must be a postgres:// or postgresql:// connection string. ' +
        'The value is not echoed here because it carries a credential.',
    );
  }

  /*
   * Length is checked, and the value is never echoed. A short shared secret is
   * a guessable one, and the error must not become the disclosure it is meant
   * to prevent.
   */
  const apiToken = required(env, 'CONTROL_PLANE_TOKEN');
  if (apiToken.length < 32) {
    throw new ConfigError(
      'CONTROL_PLANE_TOKEN must be at least 32 characters. The value is not ' +
        'echoed here because it is a credential.',
    );
  }

  /* ---- Gateway timing, bounds first, then the cross-field relations ---- */

  const gatewayCodeTtlMs = safeInteger(env, 'GATEWAY_CODE_TTL_MS', 600_000);
  atMost('GATEWAY_CODE_TTL_MS', gatewayCodeTtlMs, 900_000, 'clause 8');

  const gatewayHeartbeatCadenceMs = safeInteger(env, 'GATEWAY_HEARTBEAT_CADENCE_MS', 10_000);
  atLeast('GATEWAY_HEARTBEAT_CADENCE_MS', gatewayHeartbeatCadenceMs, 5_000, 'contract §6');
  atMost('GATEWAY_HEARTBEAT_CADENCE_MS', gatewayHeartbeatCadenceMs, 60_000, 'contract §6');

  const gatewayStalenessMs = safeInteger(env, 'GATEWAY_STALENESS_MS', 30_000);
  atLeast(
    'GATEWAY_STALENESS_MS',
    gatewayStalenessMs,
    safeProduct('GATEWAY_STALENESS_MS', gatewayHeartbeatCadenceMs, 2),
    'at least two missed beats, or a single late beat reads as an outage',
  );
  atMost(
    'GATEWAY_STALENESS_MS',
    gatewayStalenessMs,
    safeProduct('GATEWAY_STALENESS_MS', gatewayHeartbeatCadenceMs, 6),
    'at most six missed beats, or a dead gateway reads as online for too long',
  );
  atMost('GATEWAY_STALENESS_MS', gatewayStalenessMs, 300_000, 'contract §6');

  const gatewayTimestampWindowMs = safeInteger(env, 'GATEWAY_TIMESTAMP_WINDOW_MS', 120_000);
  atMost('GATEWAY_TIMESTAMP_WINDOW_MS', gatewayTimestampWindowMs, 300_000, 'end-to-end, skew included');

  const gatewayAwaitingApprovalTtlMs = safeInteger(env, 'GATEWAY_AWAITING_APPROVAL_TTL_MS', 3_600_000);

  const leaderHeartbeatMs = safeInteger(env, 'LEADER_HEARTBEAT_MS', 10_000);
  const leaderLeaseTtlMs = safeInteger(env, 'LEADER_LEASE_TTL_MS', 30_000);
  const leaderSafetyDeadlineMs = safeInteger(env, 'LEADER_SAFETY_DEADLINE_MS', 20_000);
  const challengeRotationMs = safeInteger(env, 'CHALLENGE_ROTATION_MS', 60_000);

  /*
   * The chained relation. Each link matters on its own:
   *
   *   heartbeat < safety deadline  — a leader must get at least one renewal
   *     attempt inside its own deadline, or it would demote itself on a healthy
   *     database.
   *   safety deadline < lease TTL  — a leader must give up before anyone else
   *     may take the lease, which is what stops two processes both believing
   *     they lead during the overlap.
   */
  if (leaderHeartbeatMs >= leaderSafetyDeadlineMs) {
    throw new ConfigError(
      `LEADER_HEARTBEAT_MS (${leaderHeartbeatMs}) must be strictly below ` +
        `LEADER_SAFETY_DEADLINE_MS (${leaderSafetyDeadlineMs}).`,
    );
  }
  if (leaderSafetyDeadlineMs >= leaderLeaseTtlMs) {
    throw new ConfigError(
      `LEADER_SAFETY_DEADLINE_MS (${leaderSafetyDeadlineMs}) must be strictly below ` +
        `LEADER_LEASE_TTL_MS (${leaderLeaseTtlMs}).`,
    );
  }

  /*
   * The compound deadline bound (correction T4). The derived challenge-freshness
   * deadline is `challengeRotationMs + 2 * leaderHeartbeatMs` — rotation plus
   * two supervisor ticks of granularity — and it must fit inside the timestamp
   * acceptance window, or an envelope could be inside its window while its
   * challenge epoch had already been superseded.
   *
   * This supersedes the former standalone "rotation below window" rule, which
   * left `leaderHeartbeatMs` unbounded and so let a large configured interval
   * silently extend challenge acceptance.
   */
  const challengeFreshnessDeadlineMs = safeSum('the derived challenge-freshness deadline', [
    challengeRotationMs,
    safeProduct('the derived challenge-freshness deadline', leaderHeartbeatMs, 2),
  ]);
  if (challengeFreshnessDeadlineMs > gatewayTimestampWindowMs) {
    throw new ConfigError(
      `CHALLENGE_ROTATION_MS + 2 x LEADER_HEARTBEAT_MS (${challengeFreshnessDeadlineMs}) must be at ` +
        `most GATEWAY_TIMESTAMP_WINDOW_MS (${gatewayTimestampWindowMs}).`,
    );
  }

  return {
    databaseUrl,
    apiToken,
    port: integer(env, 'PORT', 8080),
    commitSha: (env['RAILWAY_GIT_COMMIT_SHA'] ?? env['COMMIT_SHA'] ?? 'unknown').trim() || 'unknown',
    environment: (env['RAILWAY_ENVIRONMENT_NAME'] ?? env['NODE_ENV'] ?? 'unknown').trim() || 'unknown',
    readyProbeTimeoutMs: integer(env, 'READY_PROBE_TIMEOUT_MS', 2_000),
    statementTimeoutMs: integer(env, 'STATEMENT_TIMEOUT_MS', 10_000),
    poolMax: integer(env, 'PG_POOL_MAX', 4),
    poolIdleTimeoutMs: integer(env, 'PG_POOL_IDLE_TIMEOUT_MS', 30_000),
    poolConnectionTimeoutMs: timerMs(env, 'PG_CONNECTION_TIMEOUT_MS', 10_000),

    gatewayCodeTtlMs,
    gatewayHeartbeatCadenceMs,
    gatewayStalenessMs,
    gatewayTimestampWindowMs,
    gatewayAwaitingApprovalTtlMs,

    leaderHeartbeatMs,
    leaderLeaseTtlMs,
    leaderSafetyDeadlineMs,
    challengeRotationMs,

    sessionNonceCapacity: safeInteger(env, 'SESSION_NONCE_CAPACITY', 10_000),
    clockBackwardToleranceMs: safeInteger(env, 'CLOCK_BACKWARD_TOLERANCE_MS', 1_000),
    clockDivergenceToleranceMs: safeInteger(env, 'CLOCK_DIVERGENCE_TOLERANCE_MS', 2_000),
    clockStabilityMs: safeInteger(env, 'CLOCK_STABILITY_MS', 30_000),

    sweepIntervalMs: safeInteger(env, 'SWEEP_INTERVAL_MS', 86_400_000),
    trustProxyHops: nonNegativeInteger(env, 'TRUST_PROXY_HOPS', 0),
  };
}

/**
 * The derived challenge-freshness deadline (contract §6, §7, §9).
 *
 * Derived rather than configured, deliberately: it is `challengeRotationMs`
 * plus two supervisor ticks of granularity, and making it independently
 * settable would let it be set to something the rotation cadence cannot
 * actually meet. `loadConfig` has already proved the sum is a safe integer and
 * fits inside the timestamp window.
 */
export function challengeFreshnessDeadlineMs(config: Config): number {
  return config.challengeRotationMs + 2 * config.leaderHeartbeatMs;
}
