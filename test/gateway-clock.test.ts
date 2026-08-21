/**
 * §4 — the authoritative clock boundary (correction C7).
 *
 * Every case is a scripted sequence of readings. There is no sleep anywhere in
 * this file and there cannot be one: the evaluator is pure and takes readings
 * as arguments, which is the property that makes "fail-closed clock" a claim a
 * suite can actually settle rather than a sentence in a design document.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOT_CLEAN_READINGS_REQUIRED,
  ClockMonitor,
  WALL_SAFE_MAX_MS,
  WALL_SAFE_MIN_MS,
  readClockSafely,
  timestampWithinWindow,
  type Clock,
  type ClockReading,
} from '../packages/gateway-protocol/src/index.js';
import { FIXED_WALL_MS } from './gateway-helpers.js';

const TOLERANCES = {
  clockBackwardToleranceMs: 1_000,
  clockDivergenceToleranceMs: 2_000,
  clockStabilityMs: 30_000,
};

function reading(wall: number, monotonic: number): ClockReading {
  return { ok: true, wall, monotonic };
}

/** Drive the monitor to reliable from boot, and assert it got there. */
function bootedMonitor(): { monitor: ClockMonitor; wall: number; monotonic: number } {
  const monitor = new ClockMonitor(TOLERANCES);
  monitor.observe(reading(FIXED_WALL_MS, 1_000));
  const status = monitor.observe(reading(FIXED_WALL_MS + 500, 1_500));
  assert.equal(status.reliable, true, 'two clean readings must boot the monitor');
  return { monitor, wall: FIXED_WALL_MS + 500, monotonic: 1_500 };
}

describe('§4 boot — the monitor starts unreliable', () => {
  it('refuses to serve before two clean readings', () => {
    const monitor = new ClockMonitor(TOLERANCES);
    assert.equal(monitor.status.reliable, false, 'a fresh monitor is unreliable');
    assert.equal(monitor.observe(reading(FIXED_WALL_MS, 1_000)).reliable, false, 'one reading is not enough');
    assert.equal(monitor.observe(reading(FIXED_WALL_MS + 100, 1_100)).reliable, true);
  });

  it('requires exactly the documented number of initial readings', () => {
    assert.equal(BOOT_CLEAN_READINGS_REQUIRED, 2);
  });
});

describe('gateway-clock · clock:unavailable', () => {
  it('marks the clock unreliable when a source throws', () => {
    const { monitor } = bootedMonitor();
    const throwing: Clock = {
      wallNow() {
        throw new Error('no clock');
      },
      monotonicNow() {
        return 2_000;
      },
    };
    const status = monitor.observe(readClockSafely(throwing));
    assert.equal(status.reliable, false);
    assert.equal(status.lastAnomaly, 'source_unavailable');
  });

  it('marks the clock unreliable when a source returns a non-finite value', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const { monitor, monotonic } = bootedMonitor();
      const wallStatus = monitor.observe(reading(bad, monotonic + 100));
      assert.equal(wallStatus.reliable, false, `wall ${bad}`);
      assert.equal(wallStatus.lastAnomaly, 'non_finite_reading');

      const second = bootedMonitor();
      const monotonicStatus = second.monitor.observe(reading(second.wall + 100, bad));
      assert.equal(monotonicStatus.reliable, false, `monotonic ${bad}`);
      assert.equal(monotonicStatus.lastAnomaly, 'non_finite_reading');
    }
  });

  it('marks the clock unreliable when a wall reading falls outside the safe range', () => {
    for (const wall of [0, WALL_SAFE_MIN_MS - 1, WALL_SAFE_MAX_MS + 1, -1]) {
      const { monitor, monotonic } = bootedMonitor();
      const status = monitor.observe(reading(wall, monotonic + 100));
      assert.equal(status.reliable, false, String(wall));
      assert.equal(status.lastAnomaly, 'wall_out_of_range');
    }
  });

  it('accepts the safe-range endpoints themselves', () => {
    const monitor = new ClockMonitor(TOLERANCES);
    monitor.observe(reading(WALL_SAFE_MIN_MS, 1_000));
    assert.equal(monitor.observe(reading(WALL_SAFE_MIN_MS + 100, 1_100)).reliable, true);

    const upper = new ClockMonitor(TOLERANCES);
    upper.observe(reading(WALL_SAFE_MAX_MS - 100, 1_000));
    assert.equal(upper.observe(reading(WALL_SAFE_MAX_MS, 1_100)).reliable, true);
  });

  it('does not recover on the reading after an unavailable source', () => {
    const { monitor, wall, monotonic } = bootedMonitor();
    monitor.observe({ ok: false });
    const next = monitor.observe(reading(wall + 100, monotonic + 100));
    assert.equal(next.reliable, false, 'one clean reading does not clear an anomaly');
  });
});

describe('gateway-clock · clock:backward-jump', () => {
  it('marks the clock unreliable beyond the backward tolerance', () => {
    const { monitor, wall, monotonic } = bootedMonitor();
    const status = monitor.observe(reading(wall - 1_001, monotonic + 100));
    assert.equal(status.reliable, false);
    assert.equal(status.lastAnomaly, 'backward_wall_jump');
  });

  it('tolerates a backward step at exactly the tolerance', () => {
    const { monitor, wall, monotonic } = bootedMonitor();
    // Divergence must stay inside its own tolerance for this to isolate the
    // backward rule: -1000 wall against +100 monotonic diverges by 1100 < 2000.
    const status = monitor.observe(reading(wall - 1_000, monotonic + 100));
    assert.equal(status.reliable, true);
    assert.equal(status.lastAnomaly, null);
  });

  it('does not classify a backward step as a jump when the monotonic source also went back', () => {
    // Condition 3 is qualified on `monotonicDelta >= 0`. A regressed monotonic
    // source is condition 2, and that is the anomaly that should be reported.
    const { monitor, wall, monotonic } = bootedMonitor();
    const status = monitor.observe(reading(wall - 5_000, monotonic - 10));
    assert.equal(status.reliable, false);
    assert.equal(status.lastAnomaly, 'monotonic_regression');
  });
});

describe('gateway-clock · clock:divergence-beyond-tolerance', () => {
  it('marks the clock unreliable when wall and monotonic deltas diverge', () => {
    const { monitor, wall, monotonic } = bootedMonitor();
    const status = monitor.observe(reading(wall + 5_000, monotonic + 1_000));
    assert.equal(status.reliable, false);
    assert.equal(status.lastAnomaly, 'divergence');
  });

  it('tolerates divergence at exactly the tolerance', () => {
    const { monitor, wall, monotonic } = bootedMonitor();
    const status = monitor.observe(reading(wall + 3_000, monotonic + 1_000));
    assert.equal(status.reliable, true, 'a divergence of exactly 2000 is within tolerance');
  });

  it('catches forward jumps as divergence, which no other condition covers', () => {
    const { monitor, wall, monotonic } = bootedMonitor();
    const status = monitor.observe(reading(wall + 3_600_000, monotonic + 100));
    assert.equal(status.lastAnomaly, 'divergence');
  });
});

describe('gateway-clock · clock:monotonic-regression', () => {
  it('marks the clock unreliable when the monotonic source decreases', () => {
    const { monitor, wall, monotonic } = bootedMonitor();
    const status = monitor.observe(reading(wall + 100, monotonic - 1));
    assert.equal(status.reliable, false);
    assert.equal(status.lastAnomaly, 'monotonic_regression');
  });

  it('accepts a monotonic source that stands still', () => {
    const { monitor, wall, monotonic } = bootedMonitor();
    assert.equal(monitor.observe(reading(wall, monotonic)).reliable, true);
  });
});

describe('gateway-clock · clock:recovery-after-stability', () => {
  it('stays unreliable until the stability period has elapsed on the monotonic source', () => {
    const { monitor, wall, monotonic } = bootedMonitor();
    monitor.observe(reading(wall - 10_000, monotonic + 100)); // backward jump
    assert.equal(monitor.status.reliable, false);

    const base = monotonic + 100;
    const wallBase = wall - 10_000;

    // Clean readings, but not yet 30 000 ms of them.
    for (const elapsed of [1_000, 10_000, 29_999]) {
      const status = monitor.observe(reading(wallBase + elapsed, base + elapsed));
      assert.equal(status.reliable, false, `still unreliable at +${elapsed}ms`);
      assert.equal(status.lastAnomaly, 'backward_wall_jump', 'the anomaly that caused the wait is retained');
    }
  });

  it('recovers once clockStabilityMs of consecutive clean readings have passed', () => {
    const { monitor, wall, monotonic } = bootedMonitor();
    monitor.observe(reading(wall - 10_000, monotonic + 100));
    const wallBase = wall - 10_000;
    const base = monotonic + 100;

    monitor.observe(reading(wallBase + 1_000, base + 1_000));
    assert.equal(monitor.status.reliable, false);

    // The clean run started at +1000; 30 000 ms of it ends at +31 000.
    assert.equal(monitor.observe(reading(wallBase + 30_999, base + 30_999)).reliable, false);
    assert.equal(monitor.observe(reading(wallBase + 31_000, base + 31_000)).reliable, true);
  });

  it('restarts the stability period when a second anomaly interrupts recovery', () => {
    const { monitor, wall, monotonic } = bootedMonitor();
    monitor.observe(reading(wall - 10_000, monotonic + 100));
    const wallBase = wall - 10_000;
    const base = monotonic + 100;

    monitor.observe(reading(wallBase + 1_000, base + 1_000));
    monitor.observe(reading(wallBase + 20_000, base + 20_000));
    assert.equal(monitor.status.reliable, false);

    // A fresh anomaly at +25 000 resets the run.
    monitor.observe({ ok: false });
    monitor.observe(reading(wallBase + 26_000, base + 26_000));
    assert.equal(monitor.observe(reading(wallBase + 55_999, base + 55_999)).reliable, false);
    assert.equal(monitor.observe(reading(wallBase + 56_000, base + 56_000)).reliable, true);
  });
});

describe('§4 — the timestamp window is a pure function of its three arguments', () => {
  it('accepts inside the window and refuses outside it, symmetrically', () => {
    assert.equal(timestampWithinWindow(FIXED_WALL_MS, FIXED_WALL_MS, 120_000), true);
    assert.equal(timestampWithinWindow(FIXED_WALL_MS - 120_000, FIXED_WALL_MS, 120_000), true);
    assert.equal(timestampWithinWindow(FIXED_WALL_MS + 120_000, FIXED_WALL_MS, 120_000), true);
    assert.equal(timestampWithinWindow(FIXED_WALL_MS - 120_001, FIXED_WALL_MS, 120_000), false);
    assert.equal(timestampWithinWindow(FIXED_WALL_MS + 120_001, FIXED_WALL_MS, 120_000), false);
  });

  it('refuses a far-future timestamp until wall time reaches its window', () => {
    const farFuture = FIXED_WALL_MS + 86_400_000;
    assert.equal(timestampWithinWindow(farFuture, FIXED_WALL_MS, 120_000), false);
    assert.equal(timestampWithinWindow(farFuture, farFuture - 60_000, 120_000), true);
  });

  it('refuses unsafe inputs rather than coercing them', () => {
    assert.equal(timestampWithinWindow(Number.NaN, FIXED_WALL_MS, 120_000), false);
    assert.equal(timestampWithinWindow(1.5, FIXED_WALL_MS, 120_000), false);
    assert.equal(timestampWithinWindow(FIXED_WALL_MS, Number.NaN, 120_000), false);
    assert.equal(timestampWithinWindow(FIXED_WALL_MS, FIXED_WALL_MS, -1), false);
  });
});
