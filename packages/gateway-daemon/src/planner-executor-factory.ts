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
 *   - `BUILDROOM_PLANNER_USER`, `BUILDROOM_PLANNER_AGY`,
 *     `BUILDROOM_PLANNER_AGY_SHA256` and `BUILDROOM_PLANNER_CHECKOUTS` name
 *     the planner user, the planner user's own agy copy the privilege rule
 *     names, that copy's SHA-256 as the Founder's latest act records it
 *     (Amendment 4, Part C), and the directory checkouts are made in.
 *
 * When `BUILDROOM_PLANNER_EXECUTOR` is `agy` and `BUILDROOM_PLANNER_USER` names a
 * user but the executor is not selected, the refusal carries a boot reap: the
 * daemon still runs the second privilege rule and the check at boot, so a
 * planner-user process an earlier daemon left does not wait for one that
 * selects the executor (FOUNDER-ACT-20261029-BR-PLANNER-READINESS C1).
 *
 * Nothing here selects a test seam: the executor is built with its real
 * collaborators, and suites construct `AgyPlannerExecutor` themselves.
 */

import {
  AGY_PLANNER_GATEWAY_ID,
  AgyPlannerExecutor,
  isPlannerUserName,
  pgrepProbe,
  pkillReaper,
  reapCommandLine,
  remainsAfterReap,
  type PlannerProcessProbe,
  type PlannerReaper,
} from './agy-planner-executor.js';
import type { PlannerExecutor } from './planner-worker.js';

export type PlannerExecutorChoice =
  | { readonly kind: 'none' }
  | { readonly kind: 'refused'; readonly reason: string; readonly bootReap?: () => Promise<void> }
  | { readonly kind: 'agy'; readonly executor: PlannerExecutor; readonly commandLine: readonly string[] };

export interface PlannerExecutorContext {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  /** The primary identity this daemon holds, or `null` when it holds none. */
  readonly gatewayId: string | null;
  readonly gatewayDirectory: string;
  /** Reads the primary identity the daemon holds now; the executor asks it before each attest and start. */
  readonly currentGatewayId?: () => Promise<string | null>;
  /** The primary identity held in memory, read synchronously; the executor checks it with nothing awaited before the work is written. */
  readonly heldGatewayId?: () => string | null;
  readonly log?: (level: 'info' | 'warn' | 'error', at: string, fields: Record<string, unknown>) => void;
}

/**
 * The identity the executor asks about before each attest and start: the
 * Gateway id the daemon holds in memory, but only while the state file names
 * the same one. A promotion adopts in memory before its file write lands, and
 * a write can fail, so either side alone can be stale; when they disagree, or
 * either cannot be read, the answer is `null` and the executor refuses.
 */
export function boundGatewayReader(held: () => string | null, persisted: () => Promise<string | null>): () => Promise<string | null> {
  return async () => {
    const onDisk = await persisted();
    // Read after the file, not before: a promotion that adopts while the read is
    // pending must not be answered with the identity it replaced.
    const inMemory = held();
    return inMemory !== null && inMemory === onDisk ? inMemory : null;
  };
}

type Log = NonNullable<PlannerExecutorContext['log']>;

/**
 * The second privilege rule and the check, for a daemon configured for the agy
 * executor that does not run it. It starts no Planner work; a reap that fails, a
 * check that cannot be made, or a process that remains is logged as an error.
 */
export function plannerBootReap(
  plannerUser: string,
  log: Log,
  deps: { readonly reap?: PlannerReaper; readonly probe?: PlannerProcessProbe; readonly settleMs?: number } = {},
): () => Promise<void> {
  const reap = deps.reap ?? pkillReaper(reapCommandLine('/usr/bin/sudo', plannerUser));
  const probe = deps.probe ?? pgrepProbe(plannerUser);
  return async () => {
    try {
      await reap();
    } catch (error) {
      log('error', 'planner.boot_reap_failed', { plannerUser, message: error instanceof Error ? error.message : String(error) });
    }
    let remains: boolean;
    try {
      remains = await remainsAfterReap(probe, deps.settleMs);
    } catch (error) {
      log('error', 'planner.boot_check_failed', { plannerUser, message: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (remains) log('error', 'planner.boot_reap_left_processes', { plannerUser });
    else log('info', 'planner.boot_reaped', { plannerUser });
  };
}

export function choosePlannerExecutor(context: PlannerExecutorContext): PlannerExecutorChoice {
  const selected = context.env['BUILDROOM_PLANNER_EXECUTOR'];
  if (selected === undefined || selected === '') return { kind: 'none' };
  if (selected !== 'agy') return { kind: 'refused', reason: `BUILDROOM_PLANNER_EXECUTOR=${selected} is not a known executor` };
  const plannerUser = context.env['BUILDROOM_PLANNER_USER'];
  // Configured for the executor: whatever refuses it below, the daemon still reaps at boot.
  const refused = (reason: string): PlannerExecutorChoice =>
    plannerUser !== undefined && isPlannerUserName(plannerUser)
      ? { kind: 'refused', reason, bootReap: plannerBootReap(plannerUser, context.log ?? (() => undefined)) }
      : { kind: 'refused', reason };
  if (context.platform !== 'linux') return refused('the agy executor runs on Linux only');
  if (context.gatewayId !== AGY_PLANNER_GATEWAY_ID) {
    return refused('the agy executor is bound to Gateway 1880c12d, and this daemon holds another identity or none');
  }
  const agyPath = context.env['BUILDROOM_PLANNER_AGY'];
  const agySha256 = context.env['BUILDROOM_PLANNER_AGY_SHA256'];
  const checkoutParent = context.env['BUILDROOM_PLANNER_CHECKOUTS'];
  if (plannerUser === undefined || agyPath === undefined || agySha256 === undefined || checkoutParent === undefined) {
    return refused('BUILDROOM_PLANNER_USER, BUILDROOM_PLANNER_AGY, BUILDROOM_PLANNER_AGY_SHA256 and BUILDROOM_PLANNER_CHECKOUTS must all be set');
  }
  let executor: AgyPlannerExecutor;
  try {
    executor = new AgyPlannerExecutor(
      { sudoPath: '/usr/bin/sudo', plannerUser, agyPath, agySha256, checkoutParent, gatewayDirectory: context.gatewayDirectory },
      {
        ...(context.log === undefined ? {} : { log: context.log }),
        ...(context.currentGatewayId === undefined ? {} : { currentGatewayId: context.currentGatewayId }),
        ...(context.heldGatewayId === undefined ? {} : { heldGatewayId: context.heldGatewayId }),
      },
    );
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error));
  }
  return { kind: 'agy', executor, commandLine: executor.commandLine() };
}
