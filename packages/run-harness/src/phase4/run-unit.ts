/**
 * The PROPOSED Phase 4 run unit, as a judgment over one run's record (plan r1
 * slice 10; `PHASE4-RUN-UNIT-PROPOSAL-r1.md` §2). The entry act defines the
 * unit (C6); until it does, this is the builder's proposal and decides
 * nothing.
 *
 * A run PASSES only when its room went the whole Phase 4 boundary and every
 * binding held along the way:
 *
 *   T1 (the act's goal, its digest the server's evidence)
 *   → per round: T2 by the control plane, one planner command journaled with
 *     the act's authorization and route, dispatched on that route, completed
 *   → T3 by the Planner on that route
 *   → the Founder's decision at the control plane: revisions, then approval of
 *     the plan under review (T5), with nothing after it
 *   and the journal verifies from genesis afterwards, on the same deployment.
 *
 * A run that did not settle, or whose deployment changed under it, is
 * `interrupted`. Otherwise a Founder cancel is `rejected`, whatever else the
 * record shows. Anything else short of a pass is `failed`. The judgment reads only the record; it trusts no
 * caller's summary of what happened.
 */

import { founderGoalDigest } from '../../../control-plane/src/founder-goal.js';
import { plannerCommandIdFor } from '../../../control-plane/src/planner-loop.js';
import {
  PHASE4_DISPATCHER,
  PHASE4_MAX_ROUNDS_PER_RUN,
  PHASE4_PLANNER_ROLE,
  PHASE4_PLANNER_SURFACE,
  type Phase4PlannedRun,
  type Phase4RecordedCommand,
  type Phase4RunFailure,
  type Phase4RunRecord,
  type Phase4RunSet,
  type Phase4RunVerdict,
} from './model.js';

/** Interruptions the runner observed itself, before the record was read. */
export interface Phase4RunObservedStops {
  readonly decisionTimedOut?: boolean;
  readonly roundsExceeded?: boolean;
}

export function evaluatePhase4Run(
  set: Phase4RunSet,
  run: Phase4PlannedRun,
  record: Phase4RunRecord,
  stops: Phase4RunObservedStops = {},
): Phase4RunVerdict {
  const failures: Phase4RunFailure[] = [];
  const interrupted: Phase4RunFailure[] = [];

  if (record.roomId !== run.roomId) throw new Error('the record is for another room');
  if (record.deploymentIdAtStart !== record.deploymentIdAtEnd) interrupted.push('deployment_changed');
  if (stops.decisionTimedOut === true) interrupted.push('founder_decision_timeout');
  if (stops.roundsExceeded === true) interrupted.push('too_many_rounds');
  if (!record.journalVerified) failures.push('journal_unverified');

  const events = record.events;
  const t1 = events.find((e) => e.event === 'scope.captured');
  if (
    t1 === undefined ||
    t1.actor !== 'founder' ||
    !t1.evidence.some((e) => e.kind === 'founder_goal' && e.digest === founderGoalDigest(run.inputs.goal))
  ) {
    failures.push('goal_not_bound');
  }

  const dispatcherActor = `${PHASE4_DISPATCHER.actorIdPrefix}${record.deploymentIdAtStart}`;
  for (const t2 of events.filter((e) => e.event === 'task.dispatched.planner')) {
    const a = t2.attribution;
    if (
      a.roleId !== PHASE4_DISPATCHER.roleId ||
      a.actorId !== dispatcherActor ||
      a.actualModel !== PHASE4_DISPATCHER.actualModel ||
      a.executionSurface !== PHASE4_DISPATCHER.executionSurface
    ) {
      failures.push('dispatcher_attribution_wrong');
      break;
    }
  }
  // Every round is opened by the control plane's own dispatch — the T2
  // first, then each revision's T4 — and each opening's derived command must
  // be one the journal holds (run-unit items 3 and 4): a record whose
  // dispatch events were omitted does not pass on its command rows alone.
  const openings = events.filter((e) => e.event === 'task.dispatched.planner' || e.event === 'plan.revision_requested');
  if (openings.length === 0) failures.push('round_dispatch_missing');
  for (const opening of openings) {
    if (!record.commands.some((c) => c.commandId === plannerCommandIdFor(record.roomId, opening.eventId))) {
      failures.push('round_dispatch_missing');
      break;
    }
  }
  const t3s = events.filter((e) => e.event === 'plan.submitted');
  for (const t3 of t3s) {
    const a = t3.attribution;
    if (a.roleId !== PHASE4_PLANNER_ROLE || a.actualModel !== set.planner.model || a.executionSurface !== PHASE4_PLANNER_SURFACE) {
      failures.push('planner_attribution_wrong');
      break;
    }
  }

  checkCommands(set, record.commands, failures);

  // The decisions: only the Founder's, revisions then one approval of the plan under review.
  const decisionEvents = events.filter((e) => ['plan.revision_requested', 'plan.approved', 'founder.cancel'].includes(e.event));
  if (decisionEvents.some((e) => e.actor !== 'founder')) failures.push('decision_not_founder');
  const rounds = openings.length;
  if (rounds > PHASE4_MAX_ROUNDS_PER_RUN && !interrupted.includes('too_many_rounds')) interrupted.push('too_many_rounds');

  const cancelled = record.finalState === 'CLOSED_ABANDONED' && events.at(-1)?.event === 'founder.cancel';
  if (record.finalState === 'BUILDING') {
    const t5Index = events.findIndex((e) => e.event === 'plan.approved');
    const t5 = events[t5Index];
    const reviewed = t3s.at(-1);
    const approvedDecision = record.decisions.at(-1);
    // The approval binds (Q3) to the command whose plan is under review — the
    // last round's completed command — not to any row carrying the same hash.
    if (
      t5 === undefined ||
      reviewed === undefined ||
      t5.planHash === undefined ||
      t5.planHash !== reviewed.planHash ||
      approvedDecision?.decision !== 'plan.approved' ||
      approvedDecision.planHash !== reviewed.planHash ||
      approvedDecision?.commandId !== record.commands.at(-1)?.commandId ||
      record.decisions.slice(0, -1).some((d) => d.decision !== 'plan.revision_requested')
    ) {
      failures.push('plan_not_approved_as_reviewed');
    }
    if (t5Index !== -1 && t5Index !== events.length - 1) failures.push('activity_after_approval');
  } else if (!cancelled) {
    interrupted.push('lifecycle_incomplete');
  }

  if (interrupted.length > 0) return { outcome: 'interrupted', failures: [...interrupted, ...failures] };
  // The Founder's cancel is the run's result; any defect found on the way is reported with it.
  if (cancelled) return { outcome: 'rejected', failures };
  if (failures.length > 0) return { outcome: 'failed', failures };
  return { outcome: 'passed', failures: [] };
}

/**
 * Every planner command: journaled under the act, on the act's route, and
 * dispatched on it. The last command of each round completed; an earlier
 * attempt of a round may have failed only `not_sent` (Q8's governed retry).
 * An `unresolved` or `resolved` row anywhere means the outcome was once
 * unknown, which a counted run may not contain.
 */
function checkCommands(set: Phase4RunSet, commands: readonly Phase4RecordedCommand[], failures: Phase4RunFailure[]): void {
  let authorizationWrong = false;
  let routeWrong = false;
  let notClean = commands.length === 0;
  for (const [index, command] of commands.entries()) {
    const journaled = command.rows.find((r) => r.eventType === 'journaled');
    if (
      journaled === undefined ||
      journaled.authorizationRef !== set.setId ||
      journaled.intendedProvider !== set.planner.provider ||
      journaled.intendedModel !== set.planner.model ||
      journaled.intendedSurface !== PHASE4_PLANNER_SURFACE
    ) {
      authorizationWrong = true;
    }
    const dispatched = command.rows.find((r) => r.eventType === 'dispatched');
    if (
      dispatched !== undefined &&
      (dispatched.provider !== set.planner.provider || dispatched.model !== set.planner.model || dispatched.executionSurface !== PHASE4_PLANNER_SURFACE)
    ) {
      routeWrong = true;
    }
    const types = command.rows.map((r) => r.eventType);
    if (types.includes('unresolved') || types.includes('resolved')) notClean = true;
    const last = command.rows.at(-1);
    const nextIsRetry = index < commands.length - 1;
    if (last?.eventType === 'completed') continue;
    if (last?.eventType === 'failed' && last.failureClassification === 'not_sent' && nextIsRetry) continue;
    notClean = true;
  }
  if (authorizationWrong) failures.push('command_authorization_wrong');
  if (routeWrong) failures.push('command_route_wrong');
  if (notClean) failures.push('command_not_clean');
}
