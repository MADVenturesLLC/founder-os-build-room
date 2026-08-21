/**
 * The authoritative clock boundary (contract §4).
 *
 * Two claims this module exists to make true. The first is that "fail-closed
 * clock" names a mechanism rather than an intention: the conditions that make a
 * clock unreliable are enumerated, checked, and each one refuses signed traffic
 * rather than deriving state from a reading nobody can trust. The second is
 * that the mechanism is **testable without sleeping**. The evaluator is pure
 * and takes successive readings as arguments, so every case — a source that
 * throws, a wall clock stepped backwards, a monotonic source that regressed,
 * recovery after the stability period — is a scripted array of readings, and
 * the suite proves the logic instead of racing a real clock and hoping.
 *
 * The real adapter, which is the only thing in the system that may name
 * `Date.now` or `performance.now`, lives in the impure layer and is injected.
 */

/** The injectable boundary. Constructed once, in the impure layer. */
export interface Clock {
  wallNow(): number;
  monotonicNow(): number;
}

/**
 * Wall readings outside this range are nonsense rather than skew: a device
 * whose battery died and came back at the epoch, or one whose clock ran away.
 *
 * The bounds are literals because this package reads no clock and constructs no
 * `Date` — they are `2000-01-01T00:00:00.000Z` and `2100-01-01T00:00:00.000Z`
 * in epoch milliseconds.
 */
export const WALL_SAFE_MIN_MS = 946_684_800_000;
export const WALL_SAFE_MAX_MS = 4_102_444_800_000;

export type ClockAnomaly =
  | 'source_unavailable'
  | 'non_finite_reading'
  | 'wall_out_of_range'
  | 'monotonic_regression'
  | 'backward_wall_jump'
  | 'divergence';

export type ClockReading =
  | { readonly ok: true; readonly wall: number; readonly monotonic: number }
  | { readonly ok: false };

export interface ClockStatus {
  readonly reliable: boolean;
  readonly lastAnomaly: ClockAnomaly | null;
  /** Consecutive clean readings in the current run. Reset to 0 by any anomaly. */
  readonly cleanReadings: number;
}

export interface ClockTolerances {
  readonly clockBackwardToleranceMs: number;
  readonly clockDivergenceToleranceMs: number;
  readonly clockStabilityMs: number;
}

/**
 * Boot requires this many clean readings before the monitor will serve.
 *
 * Two, not one: the regression, backward-jump and divergence conditions are all
 * comparisons between successive readings, so a single reading cannot have been
 * checked against them. Serving after one reading would mean serving on the
 * strength of checks that never ran.
 */
export const BOOT_CLEAN_READINGS_REQUIRED = 2;

/**
 * Take a reading without letting a throwing source escape.
 *
 * A source that throws is condition 1 of §4, indistinguishable in consequence
 * from one that returns nonsense, so it is normalized into the same
 * `{ok: false}` reading the evaluator already refuses on.
 */
export function readClockSafely(clock: Clock): ClockReading {
  let wall: number;
  let monotonic: number;
  try {
    wall = clock.wallNow();
    monotonic = clock.monotonicNow();
  } catch {
    return { ok: false };
  }
  return { ok: true, wall, monotonic };
}

export class ClockMonitor {
  private previous: { readonly wall: number; readonly monotonic: number } | null = null;
  private cleanRunStartMonotonic: number | null = null;
  private cleanReadings = 0;
  private sawAnomaly = false;
  private lastAnomaly: ClockAnomaly | null = null;
  private reliable = false;

  constructor(private readonly tolerances: ClockTolerances) {}

  get status(): ClockStatus {
    return {
      reliable: this.reliable,
      lastAnomaly: this.lastAnomaly,
      cleanReadings: this.cleanReadings,
    };
  }

  /** Feed the next reading and return the resulting reliability state. */
  observe(reading: ClockReading): ClockStatus {
    const anomaly = this.classify(reading);

    if (anomaly !== null) {
      this.reliable = false;
      this.cleanReadings = 0;
      this.cleanRunStartMonotonic = null;
      this.sawAnomaly = true;
      this.lastAnomaly = anomaly;
      /*
       * A readable-but-anomalous pair still becomes the comparison base. A wall
       * clock that stepped backwards has a new true value; comparing the next
       * reading against the pre-step value would report the same jump forever
       * and the clock could never recover. An unreadable or nonsensical pair
       * gives nothing to compare against, so the base is dropped.
       */
      this.previous = usableBase(reading);
      return this.status;
    }

    // `classify` returning null guarantees a readable, finite, in-range pair.
    const current = reading as { readonly ok: true; readonly wall: number; readonly monotonic: number };
    this.cleanReadings += 1;
    if (this.cleanRunStartMonotonic === null) {
      this.cleanRunStartMonotonic = current.monotonic;
    }
    this.previous = { wall: current.wall, monotonic: current.monotonic };

    const enoughReadings = this.cleanReadings >= BOOT_CLEAN_READINGS_REQUIRED;
    const stableLongEnough =
      !this.sawAnomaly ||
      current.monotonic - this.cleanRunStartMonotonic >= this.tolerances.clockStabilityMs;
    this.reliable = enoughReadings && stableLongEnough;
    return this.status;
  }

  private classify(reading: ClockReading): ClockAnomaly | null {
    if (!reading.ok) return 'source_unavailable';
    if (!Number.isFinite(reading.wall) || !Number.isFinite(reading.monotonic)) {
      return 'non_finite_reading';
    }
    if (reading.wall < WALL_SAFE_MIN_MS || reading.wall > WALL_SAFE_MAX_MS) {
      return 'wall_out_of_range';
    }

    const previous = this.previous;
    if (previous === null) return null;

    const monotonicDelta = reading.monotonic - previous.monotonic;
    if (monotonicDelta < 0) return 'monotonic_regression';

    const wallDelta = reading.wall - previous.wall;
    if (wallDelta < -this.tolerances.clockBackwardToleranceMs && monotonicDelta >= 0) {
      return 'backward_wall_jump';
    }

    if (Math.abs(wallDelta - monotonicDelta) > this.tolerances.clockDivergenceToleranceMs) {
      return 'divergence';
    }

    return null;
  }
}

function usableBase(
  reading: ClockReading,
): { readonly wall: number; readonly monotonic: number } | null {
  if (!reading.ok) return null;
  if (!Number.isFinite(reading.wall) || !Number.isFinite(reading.monotonic)) return null;
  if (reading.wall < WALL_SAFE_MIN_MS || reading.wall > WALL_SAFE_MAX_MS) return null;
  return { wall: reading.wall, monotonic: reading.monotonic };
}

/**
 * The acceptance-window check, as a pure function of the three values that
 * decide it (contract §3). Symmetric: an envelope stamped in the future is as
 * refusable as one stamped in the past, which is what makes a far-future
 * envelope wait outside the window rather than sail through it.
 */
export function timestampWithinWindow(
  claimedMs: number,
  wallNowMs: number,
  windowMs: number,
): boolean {
  if (!Number.isSafeInteger(claimedMs)) return false;
  if (!Number.isFinite(wallNowMs)) return false;
  if (!Number.isFinite(windowMs) || windowMs < 0) return false;
  return Math.abs(claimedMs - wallNowMs) <= windowMs;
}
