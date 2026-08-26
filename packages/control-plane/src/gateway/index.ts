/**
 * The gateway subsystem's composition root.
 *
 * One place builds the whole thing, in dependency order, and one place owns the
 * two circular-looking edges: leadership needs a reconciler that the session
 * service provides, and the session service needs the leadership it reconciles
 * for. Both are resolved by injection here rather than by an import cycle.
 *
 * The real clock adapter is constructed exactly once, here, and injected
 * everywhere time is consumed (contract §4).
 */

import type { Pool } from 'pg';
import type { Config } from '../config.js';
import { Phase3RunStore } from '../phase3-run.js';
import { ClockGate, createSystemClock } from './clock.js';
import type { Clock } from '../../../gateway-protocol/src/index.js';
import { NO_HOOKS, type GatewayHooks } from './hooks.js';
import { GatewayLeadership } from './leadership.js';
import { RateLimiter } from './rate-limit.js';
import { GatewayRoomAppendFence } from './room-append.js';
import { GatewaySessionService } from './session.js';
import { GatewaySessionState } from './session-state.js';
import { GatewayRegistryStore } from './store.js';
import { GatewaySweeps } from './sweeps.js';

export interface GatewaySurfaceDeps {
  readonly pool: Pool;
  readonly config: Config;
  /** Test-only pause and fault hooks. Production passes nothing. */
  readonly hooks?: GatewayHooks;
  /** Injectable for suites that script time. Production uses the real adapter. */
  readonly clock?: Clock;
  readonly log?: (level: 'info' | 'warn' | 'error', at: string, fields?: Record<string, unknown>) => void;
}

export interface GatewaySurface {
  readonly leadership: GatewayLeadership;
  readonly service: GatewaySessionService;
  readonly store: GatewayRegistryStore;
  readonly session: GatewaySessionState;
  readonly clock: ClockGate;
  readonly limiter: RateLimiter;
  readonly roomAppendFence: GatewayRoomAppendFence;
  readonly sweeps: GatewaySweeps;
  readonly phase3Runs: Phase3RunStore;
  /** Start the supervisor, the limiter sweep, and the retention cadence. */
  start(): void;
  stop(): Promise<void>;
}

export function createGatewaySurface(deps: GatewaySurfaceDeps): GatewaySurface {
  const { pool, config } = deps;

  const clock = new ClockGate(deps.clock ?? createSystemClock(), {
    clockBackwardToleranceMs: config.clockBackwardToleranceMs,
    clockDivergenceToleranceMs: config.clockDivergenceToleranceMs,
    clockStabilityMs: config.clockStabilityMs,
  });

  const session = new GatewaySessionState(config.sessionNonceCapacity);
  const store = new GatewayRegistryStore(pool, config);
  const phase3Runs = new Phase3RunStore(pool, config);
  const limiter = new RateLimiter(clock);

  let service!: GatewaySessionService;
  const leadership = new GatewayLeadership({
    pool,
    config,
    clock,
    session,
    hooks: deps.hooks ?? NO_HOOKS,
    log: deps.log,
    reconciler: async (context) => service.reconcile(context),
  });

  service = new GatewaySessionService({ pool, config, clock, session, leadership, store, phase3Runs });

  const roomAppendFence = new GatewayRoomAppendFence({ config, clock, session, leadership });
  /*
   * `log` is passed through (correction 5, finding #2): the containment of a
   * failed deferred reconciliation must be VISIBLE, not merely non-fatal —
   * an operator reading the log is the mechanism that turns "contained" into
   * "investigated".
   */
  const sweeps = new GatewaySweeps({ pool, config, clock, session, leadership, store, service, log: deps.log });

  return {
    leadership,
    service,
    store,
    session,
    clock,
    limiter,
    roomAppendFence,
    sweeps,
    phase3Runs,
    start(): void {
      leadership.start();
      limiter.start();
      sweeps.start();
    },
    async stop(): Promise<void> {
      sweeps.stop();
      limiter.stop();
      await leadership.stop();
    },
  };
}

export { ClockGate, ScriptedClock, createSystemClock, primeClockGate } from './clock.js';
export { GatewayLeadership } from './leadership.js';
export { GatewayRegistryStore } from './store.js';
export { GatewaySessionService } from './session.js';
export { GatewaySessionState } from './session-state.js';
export { GatewayRoomAppendFence } from './room-append.js';
export { GatewaySweeps } from './sweeps.js';
export { RateLimiter, RATE_LIMITS } from './rate-limit.js';
export {
  GATEWAY_BODY_LIMIT,
  ROOM_BODY_LIMIT,
  founderRouter,
  gatewayRouter,
  type GatewayRoutesDeps,
} from './routes.js';
export { NO_HOOKS, type GatewayHooks, type PipelineHooks } from './hooks.js';
export { validateRedeem } from './enroll-validation.js';
