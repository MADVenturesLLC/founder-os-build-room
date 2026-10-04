/**
 * Construction and choreography helpers for the leadership suites.
 *
 * Two conveniences that matter more than they look. `makeNode` builds a whole
 * leadership stack over a scripted clock, so a "process" in these tests is an
 * object rather than a spawn — two of them against one database is two
 * competing replicas, deterministically. And `settleMicrotasks` is how a test
 * asserts that something has NOT happened yet: it drains the microtask queue,
 * so "the acquisition has not issued its SQL" is a fact rather than a hope.
 */

import type { Config } from '../packages/control-plane/src/config.js';
import { ClockGate, ScriptedClock, primeClockGate } from '../packages/control-plane/src/gateway/clock.js';
import {
  GatewayLeadership,
  type Reconciler,
} from '../packages/control-plane/src/gateway/leadership.js';
import type { GatewayHooks } from '../packages/control-plane/src/gateway/hooks.js';
import { GatewaySessionState } from '../packages/control-plane/src/gateway/session-state.js';
import type { GatewayHarness } from './gateway-storage-helpers.js';
import { FIXED_WALL_MS } from './gateway-helpers.js';

export interface Node {
  readonly leadership: GatewayLeadership;
  readonly session: GatewaySessionState;
  readonly clock: ScriptedClock;
  readonly gate: ClockGate;
  readonly config: Config;
  /** Reconciliation calls, so "exactly one reconciliation" is countable. */
  readonly reconciliations: number[];
}

export interface NodeOptions {
  readonly hooks?: GatewayHooks;
  readonly reconciler?: Reconciler;
  readonly configOverrides?: Partial<Config>;
}

/**
 * Every leadership object these suites create, so a test can be settled.
 *
 * A supervisor tick deliberately does NOT await the phase-2 cleanup or the
 * acquisition attempt it starts — a supervisor that blocked would stop renewing
 * its lease while it waited, which is the one thing it must not do. Correct in
 * production, and a hazard in a suite: an unawaited acquisition from one case
 * can land after the NEXT case has reset the lease, take it, and fail that case
 * for a reason unrelated to what it tests. So the file settles them between
 * cases.
 */
const liveLeadership: GatewayLeadership[] = [];

export function registerLeadership(leadership: GatewayLeadership): void {
  liveLeadership.push(leadership);
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    work,
    new Promise<undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), ms);
      timer.unref();
    }),
  ]);
}

/**
 * Settle and stop every node created since the last call.
 *
 * Bounded, because an attempt blocked on an unresolved cleanup barrier will
 * never resume — which is fail-closed and therefore harmless: a permanently
 * blocked attempt cannot take a lease. What must not survive is an attempt that
 * WILL complete, and those are awaited here.
 */
export async function settleAllNodes(): Promise<void> {
  const nodes = liveLeadership.splice(0, liveLeadership.length);
  await Promise.all(
    nodes.map(async (leadership) => {
      await withTimeout(leadership.phase2Run.catch(() => undefined), 2_000);
      await withTimeout(leadership.acquisitionAttempt?.catch(() => undefined) ?? Promise.resolve(), 2_000);
      await withTimeout(leadership.rotationAttempt?.catch(() => undefined) ?? Promise.resolve(), 2_000);
      await withTimeout(leadership.stop().catch(() => undefined), 2_000);
    }),
  );
}

export function makeNode(harness: GatewayHarness, options: NodeOptions = {}): Node {
  const config = { ...harness.config, ...options.configOverrides } as Config;
  const clock = new ScriptedClock(FIXED_WALL_MS, 10_000);
  const gate = new ClockGate(clock, {
    clockBackwardToleranceMs: config.clockBackwardToleranceMs,
    clockDivergenceToleranceMs: config.clockDivergenceToleranceMs,
    clockStabilityMs: config.clockStabilityMs,
  });
  primeClockGate(gate, clock);

  const session = new GatewaySessionState(config.sessionNonceCapacity);
  const reconciliations: number[] = [];

  const reconciler: Reconciler = async (context) => {
    reconciliations.push(context.generation);
    if (options.reconciler !== undefined) return options.reconciler(context);
    return true;
  };

  const leadership = new GatewayLeadership({
    pool: harness.appPool,
    config,
    clock: gate,
    session,
    reconciler,
    hooks: options.hooks ?? {},
    // Silent by default: these suites drive dozens of demotions on purpose and
    // the warnings are the expected output, not a signal.
    log: () => undefined,
  });

  registerLeadership(leadership);
  return { leadership, session, clock, gate, config, reconciliations };
}

/** Drain the microtask queue so "has not happened yet" is checkable. */
export async function settleMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/** Observe whether a promise has settled, without awaiting it. */
export function track(promise: Promise<unknown>): () => boolean {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return () => settled;
}

/** The lease row as the database currently holds it. */
export async function readLeaseRaw(harness: GatewayHarness): Promise<{
  ownerId: string | null;
  generation: number;
  challenge: string | null;
}> {
  const { rows } = await harness.pool.query<{
    owner_id: string | null;
    generation: string;
    challenge: string | null;
  }>('SELECT owner_id, generation, challenge FROM control_plane_lease WHERE id = 1');
  const row = rows[0];
  if (row === undefined) throw new Error('lease row missing');
  return { ownerId: row.owner_id, generation: Number(row.generation), challenge: row.challenge };
}

/** Age the lease heartbeat past its TTL, so another process may take it. */
export async function expireLease(harness: GatewayHarness, ttlMs: number): Promise<void> {
  await harness.pool.query(
    `UPDATE control_plane_lease
        SET heartbeat_at = now() - make_interval(secs => $1)
      WHERE id = 1`,
    [ttlMs / 1_000 + 5],
  );
}

/**
 * Wait until a predicate holds.
 *
 * This is NOT how these suites make interleavings deterministic — the pause
 * hooks do that, and they pin the order regardless of timing. What this waits
 * for is a database round trip that is already guaranteed to happen: an
 * acquisition UPDATE that has been issued, a conditional release that is in
 * flight. Draining the microtask queue cannot observe those, because they
 * complete on the event loop rather than in a microtask.
 *
 * A timeout raises rather than returning quietly, so a predicate that never
 * becomes true fails the test instead of passing a weaker assertion.
 */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  description: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error(`waitFor timed out waiting for: ${description}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
}

/**
 * Await everything a tick started.
 *
 * A supervisor tick deliberately does NOT await the phase-2 cleanup or the
 * acquisition attempt it starts — a supervisor that blocked would stop renewing
 * the lease while it waited. That is right in production and a hazard in a
 * suite: an unawaited acquisition from one case can land after the NEXT case
 * has reset the lease, take it, and fail that case for a reason that has
 * nothing to do with what it tests.
 *
 * So any case that ticks a node settles it before it ends.
 */
export async function quiesce(node: Node): Promise<void> {
  await node.leadership.phase2Run.catch(() => undefined);
  await node.leadership.acquisitionAttempt?.catch(() => undefined);
  await node.leadership.rotationAttempt?.catch(() => undefined);
}
