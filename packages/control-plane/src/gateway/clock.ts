/**
 * The real clock adapter and the gate that fronts it (contract §4).
 *
 * This module is the ONLY place in the gateway subsystem that names `Date.now`
 * or `performance.now`. Everything else takes a `Clock` and is therefore
 * testable against a scripted one — which is what lets §19's concurrency and
 * clock cases be deterministic rather than timed.
 *
 * `test/gateway-clock-boundary.test.ts` asserts that exclusivity statically, so
 * a later module that reaches for the ambient clock fails the build rather than
 * quietly reintroducing the untestable version.
 */

import { performance } from 'node:perf_hooks';
import {
  ClockMonitor,
  readClockSafely,
  type Clock,
  type ClockStatus,
  type ClockTolerances,
} from '../../../gateway-protocol/src/index.js';

/**
 * The real adapter. Constructed once in the impure layer and injected
 * everywhere time is consumed.
 *
 * Two sources, because one cannot do the job. `Date.now` is the only source of
 * wall time an `occurred_at` can honestly carry, and it can be stepped
 * backwards by an operator or an NTP correction. `performance.now` cannot be
 * stepped, so it is the only source an elapsed-time judgement — is this
 * liveness stale? — may be based on.
 */
export function createSystemClock(): Clock {
  return {
    wallNow(): number {
      return Date.now();
    },
    monotonicNow(): number {
      return performance.now();
    },
  };
}

/**
 * Sampling front end for the pure evaluator.
 *
 * Readings are taken on the supervisor's cadence rather than per request, so
 * the observation interval the divergence rule is judged over is stable. A
 * per-request reading would make that interval the inter-arrival time, and the
 * divergence tolerance would then mean something different at every traffic
 * level.
 *
 * The consequence is disclosed rather than hidden: a request sees a reliability
 * verdict up to one supervisor tick old, and at boot the first two ticks refuse
 * signed traffic while the monitor takes its two clean initial readings.
 */
export class ClockGate {
  private readonly monitor: ClockMonitor;

  constructor(
    private readonly clock: Clock,
    tolerances: ClockTolerances,
  ) {
    this.monitor = new ClockMonitor(tolerances);
  }

  /** Take one reading and fold it into the evaluator. Called by the supervisor. */
  sample(): ClockStatus {
    return this.monitor.observe(readClockSafely(this.clock));
  }

  get status(): ClockStatus {
    return this.monitor.status;
  }

  get reliable(): boolean {
    return this.monitor.status.reliable;
  }

  /**
   * Whether elapsed-time judgements may still be made.
   *
   * Availability derivation reads monotonic stamps recorded alongside accepted
   * heartbeats, and a wall-clock problem does not make those stamps wrong. The
   * anomalies that DO implicate the monotonic source — a regression, an
   * unavailable source, a non-finite reading, or a divergence between the two
   * sources — make derivation fail closed to offline, which pauses dispatch
   * (§4, §10). A backward wall jump or an out-of-range wall reading does not:
   * it stops signed traffic, which is checked separately, and leaves elapsed
   * time meaningful.
   */
  get monotonicTrustworthy(): boolean {
    const status = this.monitor.status;
    if (status.reliable) return true;
    return (
      status.lastAnomaly !== 'monotonic_regression' &&
      status.lastAnomaly !== 'source_unavailable' &&
      status.lastAnomaly !== 'non_finite_reading' &&
      status.lastAnomaly !== 'divergence'
    );
  }

  /**
   * Wall time, for stamping durable rows.
   *
   * Callers must have checked `reliable` first. Nothing enforces that here
   * because the check belongs at the route boundary, where the refusal has a
   * response to attach to; a throw from a stamping helper would surface as a
   * 500 rather than the ruled `503 clock_unreliable`.
   */
  wallNow(): number {
    return this.clock.wallNow();
  }

  /** Monotonic elapsed time, for liveness and the leader safety deadline. */
  monotonicNow(): number {
    return this.clock.monotonicNow();
  }
}

/**
 * A clock whose readings a test supplies.
 *
 * Lives beside the real adapter rather than in the test tree because the
 * daemon's own suites need it too, and two copies of a fake clock drift the
 * same way two copies of anything else do.
 */
export class ScriptedClock implements Clock {
  constructor(
    private wall: number,
    private monotonic: number,
  ) {}

  wallNow(): number {
    return this.wall;
  }

  monotonicNow(): number {
    return this.monotonic;
  }

  /** Advance both sources together, the way a healthy clock moves. */
  advance(ms: number): void {
    this.wall += ms;
    this.monotonic += ms;
  }

  /** Move one source without the other, to script an anomaly. */
  set(values: { readonly wall?: number; readonly monotonic?: number }): void {
    if (values.wall !== undefined) this.wall = values.wall;
    if (values.monotonic !== undefined) this.monotonic = values.monotonic;
  }
}

/**
 * Drive a gate to reliable without waiting for real time.
 *
 * Two clean readings is the boot requirement; the advance between them keeps
 * the monotonic source moving so the pair is a legitimate observation interval.
 */
export function primeClockGate(gate: ClockGate, clock: ScriptedClock): void {
  gate.sample();
  clock.advance(100);
  gate.sample();
}
