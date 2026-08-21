/**
 * The daemon's real clock adapter (contract §4).
 *
 * One of the three files permitted to name `Date.now` or `performance.now`;
 * `test/gateway-clock-boundary.test.ts` enforces that. Everything else in this
 * package takes the boundary as an argument, which is what lets the lane
 * suites script backoff and retry horizons without waiting for them.
 */

import { performance } from 'node:perf_hooks';
import type { Clock } from '../../gateway-protocol/src/index.js';

export function createDaemonClock(): Clock {
  return {
    wallNow(): number {
      return Date.now();
    },
    monotonicNow(): number {
      return performance.now();
    },
  };
}
