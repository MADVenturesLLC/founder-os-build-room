/**
 * The planner-lifecycle events the generic room route refuses.
 *
 * `POST /rooms/:roomId/events` takes a whole lifecycle event from its body,
 * actor included, behind the shared `CONTROL_PLANE_TOKEN`. For most events
 * that is the ruled shape. For the five below it is not:
 *
 * - T2 `task.dispatched.planner` and T3 `plan.submitted` are produced by the
 *   governed planner path, after the command journal records the dispatch
 *   (contract §5.1: no dispatch unless `journaled` committed first).
 * - T4 `plan.revision_requested`, T5 `plan.approved` and T22
 *   `founder.cancel` are the Founder's plan decision. It originates at the
 *   control plane, is authenticated by the ruled credential and the exact
 *   `plan_hash`, and commits with its decision record in one transaction
 *   (contract §1.4 and §8; Phase 4 authorization §5).
 *
 * A token holder posting any of them here could name `founder` or
 * `agent.planner` as the actor and assert the guard facts (`planHash`,
 * `expectedPlanHash`, `scopePathsCanonical`) itself. So the route refuses
 * them before the ledger sees them: this is an authorization refusal, like a
 * missing token, not a lifecycle judgement, and nothing is recorded.
 *
 * The store stays generic. The governed paths call it directly.
 */
import type { EventName } from '../../contracts/src/index.js';

export const GOVERNED_PATH_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  'task.dispatched.planner',
  'plan.submitted',
  'plan.revision_requested',
  'plan.approved',
  'founder.cancel',
]);

export function requiresGovernedPath(event: string): boolean {
  return (GOVERNED_PATH_EVENTS as ReadonlySet<string>).has(event);
}
