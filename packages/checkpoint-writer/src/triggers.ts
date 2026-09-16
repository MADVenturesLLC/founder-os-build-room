/**
 * Trigger policy (Lane 2): the incremental writer fires EARLY — at
 * configured fractions of the main worker's context budget, defaulting to
 * the act's ~20% / 45% / 70% — not at 95% when summarization would be a
 * salvage operation. A rebuild is armed near the ceiling (default 90%).
 *
 * PURE: no I/O. The tracker is a small state machine the host drives with
 * the current budget fraction; it never observes a transcript itself.
 */

export const DEFAULT_CHECKPOINT_THRESHOLDS: readonly number[] = [0.2, 0.45, 0.7] as const;
export const DEFAULT_REBUILD_FRACTION = 0.9;

export interface TriggerPolicyConfig {
  /**
   * Ascending fractions in (0, 1) of the configured context budget at
   * which the incremental writer fires. Each fires at most once per cycle.
   */
  readonly checkpoint_thresholds?: readonly number[];
  /** Fraction in (0, 1] at/above which a rebuild is armed. */
  readonly rebuild_fraction?: number;
}

export class TriggerPolicyError extends Error {
  override readonly name = 'TriggerPolicyError';
}

export interface TriggerPolicy {
  readonly checkpoint_thresholds: readonly number[];
  readonly rebuild_fraction: number;
}

export function resolveTriggerPolicy(config: TriggerPolicyConfig = {}): TriggerPolicy {
  const thresholds = config.checkpoint_thresholds ?? DEFAULT_CHECKPOINT_THRESHOLDS;
  const rebuild = config.rebuild_fraction ?? DEFAULT_REBUILD_FRACTION;
  if (thresholds.length === 0) throw new TriggerPolicyError('checkpoint_thresholds must be non-empty');
  let prev = 0;
  for (const t of thresholds) {
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0 || t >= 1) {
      throw new TriggerPolicyError(`checkpoint threshold must be a finite fraction in (0, 1), got ${t}`);
    }
    if (t <= prev) throw new TriggerPolicyError('checkpoint_thresholds must be strictly ascending');
    prev = t;
  }
  if (typeof rebuild !== 'number' || !Number.isFinite(rebuild) || rebuild <= 0 || rebuild > 1) {
    throw new TriggerPolicyError(`rebuild_fraction must be a finite fraction in (0, 1], got ${rebuild}`);
  }
  if (rebuild <= thresholds[thresholds.length - 1]!) {
    throw new TriggerPolicyError('rebuild_fraction must exceed the last checkpoint threshold');
  }
  return { checkpoint_thresholds: [...thresholds], rebuild_fraction: rebuild };
}

export type TriggerEvent =
  | { readonly kind: 'checkpoint'; readonly threshold: number }
  | { readonly kind: 'rebuild' };

/**
 * Per-cycle threshold tracker. Fed the current used fraction of the context
 * budget (0..1); emits each threshold crossing exactly once, in ascending
 * order; once the rebuild fraction is reached it reports `rebuild` for
 * every subsequent observation until `reset()` starts a new cycle.
 *
 * A jump that crosses several thresholds at once reports all of them in
 * ascending order on that single observation — a threshold is never
 * skipped silently.
 */
export class CheckpointTriggerTracker {
  private readonly policy: TriggerPolicy;
  private fired = new Set<number>();
  private rebuildArmed = false;

  constructor(config: TriggerPolicyConfig = {}) {
    this.policy = resolveTriggerPolicy(config);
  }

  /** Observe the current used fraction; returns the events this observation raises (possibly empty). */
  observe(fractionUsed: number): readonly TriggerEvent[] {
    if (typeof fractionUsed !== 'number' || !Number.isFinite(fractionUsed) || fractionUsed < 0) {
      throw new TriggerPolicyError(`fractionUsed must be a finite number >= 0, got ${fractionUsed}`);
    }
    if (this.rebuildArmed) return [{ kind: 'rebuild' }];
    const events: TriggerEvent[] = [];
    for (const threshold of this.policy.checkpoint_thresholds) {
      if (!this.fired.has(threshold) && fractionUsed >= threshold) {
        this.fired.add(threshold);
        events.push({ kind: 'checkpoint', threshold });
      }
    }
    if (fractionUsed >= this.policy.rebuild_fraction) {
      this.rebuildArmed = true;
      events.push({ kind: 'rebuild' });
    }
    return events;
  }

  /** Thresholds that have fired this cycle (for evidence/handoff records). */
  get firedThresholds(): readonly number[] {
    return [...this.fired];
  }

  /** Start a new cycle (after a rebuild). */
  reset(): void {
    this.fired = new Set();
    this.rebuildArmed = false;
  }
}
