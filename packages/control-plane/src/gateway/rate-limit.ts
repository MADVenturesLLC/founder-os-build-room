/**
 * In-memory rate limiting (contract §12).
 *
 * The ordering rule matters more than the algorithm: resource-exhaustion
 * limiting always runs BEFORE signature work. Ed25519 verification is the
 * expensive thing on these routes, and a limiter that ran after it would let an
 * unauthenticated flood buy all the CPU it wanted and then be politely told no.
 *
 * Windows are measured on the MONOTONIC source. A wall clock that steps
 * backwards would otherwise extend every open window by the size of the step,
 * which is a limiter that relaxes exactly when something odd is happening.
 *
 * Rate-limit rejections are never written to the database. A 429 is the cheap
 * refusal; making it write a row would hand an attacker a write amplifier.
 */

import type { ClockGate } from './clock.js';

export const WINDOW_MS = 60_000;

/** TTL sweep cadence for the bucket map (§12). */
export const SWEEP_INTERVAL_MS = 5 * 60_000;

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(private readonly clock: ClockGate) {}

  /**
   * Consume one unit. Returns false when the bucket is exhausted.
   *
   * Fixed windows rather than a sliding log: the memory is one small record per
   * (route, source) pair instead of one per request, which is the property that
   * matters when the caller is hostile.
   */
  take(key: string, limit: number, windowMs: number = WINDOW_MS): boolean {
    const now = this.clock.monotonicNow();
    const bucket = this.buckets.get(key);

    if (bucket === undefined || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }

  /** Observe without consuming, for a budget checked before work is done. */
  exhausted(key: string, limit: number): boolean {
    const bucket = this.buckets.get(key);
    if (bucket === undefined) return false;
    if (this.clock.monotonicNow() >= bucket.resetAt) return false;
    return bucket.count >= limit;
  }

  /** Drop expired buckets so a churn of source addresses cannot grow the map. */
  sweep(): void {
    const now = this.clock.monotonicNow();
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }

  start(): void {
    if (this.sweeper !== null) return;
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  stop(): void {
    if (this.sweeper === null) return;
    clearInterval(this.sweeper);
    this.sweeper = null;
  }
}

/** The per-route windows the contract fixes. */
export const RATE_LIMITS = {
  sessionChallenge: 30,
  enroll: 10,
  sessionStart: 10,
  heartbeat: 60,
  /** The additional budget spent by requests that fail verification. */
  verificationFailure: 20,
} as const;
