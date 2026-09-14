/**
 * Sliding-window rate limiter for advisor reviews. The clock is injected;
 * the limiter reads no ambient time. Bounds are enforced at construction —
 * an unbounded advisor is the "continuous chat whisperer" the act excludes.
 */

export interface RateLimitPolicy {
  readonly max_reviews_per_window: number;
  readonly window_ms: number;
}

export const RATE_LIMIT_BOUNDS = {
  max_reviews_per_window: { min: 1, max: 100 },
  window_ms: { min: 1_000, max: 3_600_000 },
} as const;

export class RateLimitPolicyError extends Error {
  override readonly name = 'RateLimitPolicyError';
}

export function validateRateLimitPolicy(policy: unknown): string[] {
  if (typeof policy !== 'object' || policy === null) return ['rate limit policy must be an object'];
  const p = policy as Record<string, unknown>;
  const defects: string[] = [];
  const m = p.max_reviews_per_window;
  if (typeof m !== 'number' || !Number.isInteger(m) || m < RATE_LIMIT_BOUNDS.max_reviews_per_window.min || m > RATE_LIMIT_BOUNDS.max_reviews_per_window.max) {
    defects.push(`max_reviews_per_window must be an integer in [${RATE_LIMIT_BOUNDS.max_reviews_per_window.min}, ${RATE_LIMIT_BOUNDS.max_reviews_per_window.max}]`);
  }
  const w = p.window_ms;
  if (typeof w !== 'number' || !Number.isFinite(w) || w < RATE_LIMIT_BOUNDS.window_ms.min || w > RATE_LIMIT_BOUNDS.window_ms.max) {
    defects.push(`window_ms must be in [${RATE_LIMIT_BOUNDS.window_ms.min}, ${RATE_LIMIT_BOUNDS.window_ms.max}]`);
  }
  for (const key of Object.keys(p)) if (key !== 'max_reviews_per_window' && key !== 'window_ms') defects.push(`unknown key ${key}`);
  return defects;
}

export type AcquireResult = { readonly allowed: true } | { readonly allowed: false; readonly retry_after_ms: number };

export class SlidingWindowLimiter {
  private readonly stamps: number[] = [];

  constructor(
    readonly policy: RateLimitPolicy,
    private readonly clock: () => number,
  ) {
    const defects = validateRateLimitPolicy(policy);
    if (defects.length > 0) throw new RateLimitPolicyError(defects.join('; '));
  }

  tryAcquire(): AcquireResult {
    const now = this.clock();
    while (this.stamps.length > 0 && now - this.stamps[0]! >= this.policy.window_ms) this.stamps.shift();
    if (this.stamps.length >= this.policy.max_reviews_per_window) {
      return { allowed: false, retry_after_ms: this.policy.window_ms - (now - this.stamps[0]!) };
    }
    this.stamps.push(now);
    return { allowed: true };
  }

  used(): number {
    const now = this.clock();
    return this.stamps.filter((t) => now - t < this.policy.window_ms).length;
  }
}
