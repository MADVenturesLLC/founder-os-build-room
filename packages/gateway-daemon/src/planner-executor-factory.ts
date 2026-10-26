/**
 * Whether this daemon runs a Planner executor, decided once at start.
 *
 * The answer is no unless every one of these holds:
 *   - `BUILDROOM_PLANNER_EXECUTOR` is exactly `agy`. Unset is the default,
 *     and the daemon then polls no planner work, as before.
 *   - The host is Linux: the executor's isolation is the planner user, the
 *     privilege rule and the egress allowlist the Founder's PC act sets up
 *     there (Amendments 1 and 2).
 *   - The primary identity this daemon holds is Gateway `1880c12d`, the one
 *     Gateway the ruling binds (B1). On any other Gateway the variable is
 *     refused, and the refusal is logged.
 *   - `BUILDROOM_PLANNER_USER`, `BUILDROOM_PLANNER_AGY` and
 *     `BUILDROOM_PLANNER_CHECKOUTS` name the planner user, the agy binary
 *     the privilege rule names, and the directory checkouts are made in.
 *
 * Nothing here selects a test seam: the executor is built with its real
 * collaborators, and suites construct `AgyPlannerExecutor` themselves.
 */

import { AGY_PLANNER_GATEWAY_ID, AgyPlannerExecutor } from './agy-planner-executor.js';
import type { PlannerExecutor } from './planner-worker.js';

export type PlannerExecutorChoice =
  | { readonly kind: 'none' }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'agy'; readonly executor: PlannerExecutor; readonly commandLine: readonly string[] };

export interface PlannerExecutorContext {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  /** The primary identity this daemon holds, or `null` when it holds none. */
  readonly gatewayId: string | null;
  readonly gatewayDirectory: string;
  readonly log?: (level: 'info' | 'warn' | 'error', at: string, fields: Record<string, unknown>) => void;
}

export function choosePlannerExecutor(context: PlannerExecutorContext): PlannerExecutorChoice {
  const selected = context.env['BUILDROOM_PLANNER_EXECUTOR'];
  if (selected === undefined || selected === '') return { kind: 'none' };
  if (selected !== 'agy') return { kind: 'refused', reason: `BUILDROOM_PLANNER_EXECUTOR=${selected} is not a known executor` };
  if (context.platform !== 'linux') return { kind: 'refused', reason: 'the agy executor runs on Linux only' };
  if (context.gatewayId !== AGY_PLANNER_GATEWAY_ID) {
    return { kind: 'refused', reason: 'the agy executor is bound to Gateway 1880c12d, and this daemon holds another identity or none' };
  }
  const plannerUser = context.env['BUILDROOM_PLANNER_USER'];
  const agyPath = context.env['BUILDROOM_PLANNER_AGY'];
  const checkoutParent = context.env['BUILDROOM_PLANNER_CHECKOUTS'];
  if (plannerUser === undefined || agyPath === undefined || checkoutParent === undefined) {
    return { kind: 'refused', reason: 'BUILDROOM_PLANNER_USER, BUILDROOM_PLANNER_AGY and BUILDROOM_PLANNER_CHECKOUTS must all be set' };
  }
  let executor: AgyPlannerExecutor;
  try {
    executor = new AgyPlannerExecutor(
      { sudoPath: '/usr/bin/sudo', plannerUser, agyPath, checkoutParent, gatewayDirectory: context.gatewayDirectory },
      context.log === undefined ? {} : { log: context.log },
    );
  } catch (error) {
    return { kind: 'refused', reason: error instanceof Error ? error.message : String(error) };
  }
  return { kind: 'agy', executor, commandLine: executor.commandLine() };
}
