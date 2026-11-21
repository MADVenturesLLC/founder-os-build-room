/**
 * The lifecycle events the generic room route refuses.
 *
 * `POST /rooms/:roomId/events` takes a whole lifecycle event from its body,
 * actor included, behind the shared `CONTROL_PLANE_TOKEN`. For most events
 * that is the ruled shape. For the fourteen below it is not:
 *
 * - T2 `task.dispatched.planner` and T3 `plan.submitted` are produced by the
 *   governed planner path, after the command journal records the dispatch
 *   (contract §5.1: no dispatch unless `journaled` committed first).
 * - T4 `plan.revision_requested`, T5 `plan.approved` and T22
 *   `founder.cancel` are the Founder's plan decision. It originates at the
 *   control plane, is authenticated by the ruled credential and the exact
 *   `plan_hash`, and commits with its decision record in one transaction
 *   (contract §1.4 and §8; Phase 4 authorization §5).
 * - T6 `decision.requested`, `command.queued` and `ceiling.exceeded`, T7
 *   `decision.answered`, `command.approved`, `command.denied` and
 *   `ceiling.raised`, and T8 `build.ready_for_evidence` belong to the
 *   Builder's governed paths: a T6 request is proposed by the Gateway or
 *   recorded by the control plane, a T7 act is the Founder's, authenticated
 *   at the control plane and bound to the request it answers, and T8 commits
 *   with the Builder command that reports the build ready
 *   (FOUNDER-RULING-20261117-BR-JOURNAL-PHASE5, Parts C, D and F, signed by
 *   the Founder on 2026-11-17). Those paths are Phase 5 work and do not exist
 *   yet, so until they do these eight events cannot be recorded at all. The
 *   Founder directed this refusal ahead of them (that ruling's F2).
 *
 * A token holder posting any of them here could name `founder`,
 * `agent.planner` or `agent.builder` as the actor and assert the guard facts
 * (`planHash`, `expectedPlanHash`, `scopePathsCanonical`, `boundRequestId`,
 * `localCommitsExist`) itself. So the route refuses them before the ledger
 * sees them: this is an authorization refusal, like a missing token, not a
 * lifecycle judgement, and nothing is recorded.
 *
 * `runtime_room.bound`, the thirtieth lifecycle event, joins the set in the
 * change that adds it to this code's vocabulary (F2): it is recorded only by
 * the governed binding path, in one transaction with the first Builder
 * command's journal record and the binding record (that ruling's B3). Posted
 * here, a token holder could name any runtime room and Gateway for any room.
 *
 * The store stays generic. The governed paths call it directly.
 */
import type { EventName } from '../../contracts/src/index.js';

export const GOVERNED_PATH_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  // The planner path and the Founder's plan decision (Phase 4).
  'task.dispatched.planner',
  'plan.submitted',
  'plan.revision_requested',
  'plan.approved',
  'founder.cancel',
  // T6: the Builder's requests for the Founder (Phase 5).
  'decision.requested',
  'command.queued',
  'ceiling.exceeded',
  // T7: the Founder's answers to them (Phase 5).
  'decision.answered',
  'command.approved',
  'command.denied',
  'ceiling.raised',
  // T8: the build is ready for evidence (Phase 5).
  'build.ready_for_evidence',
  // Event 30: the room binding, recorded with no transition (Phase 5).
  'runtime_room.bound',
]);

export function requiresGovernedPath(event: string): boolean {
  return (GOVERNED_PATH_EVENTS as ReadonlySet<string>).has(event);
}
