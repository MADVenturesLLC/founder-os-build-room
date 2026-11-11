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
import { MAX_ROUND_ATTEMPTS, plannerCommandIdFor } from '../../../control-plane/src/planner-loop.js';
import { REASKED_FAILURE_REASONS } from '../../../gateway-protocol/src/index.js';
import {
  PHASE4_DISPATCHER,
  PHASE4_MAX_ROUNDS_PER_RUN,
  PHASE4_PLANNER_ROLE,
  PHASE4_PLANNER_SURFACE,
  type Phase4PlannedRun,
  type Phase4RecordedCommand,
  type Phase4RecordedCommandRow,
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

  checkCommands(set, record.commands, attemptsOf(record.roomId, openings), failures);

  // The decisions: only the Founder's, revisions then one approval of the plan under review.
  const decisionEvents = events.filter((e) => ['plan.revision_requested', 'plan.approved', 'founder.cancel'].includes(e.event));
  if (decisionEvents.some((e) => e.actor !== 'founder')) failures.push('decision_not_founder');
  // B5's decision time, judged from the record (FOUNDER-ACT-20261104-BR-
  // PHASE4-DECISION-TIME B2 as amended): a decision of a plan under review is
  // timed against that plan's T3, on the control plane's committed_at. A cancel
  // with no plan under review is not timed. The runner's own flag above still
  // applies; this one cannot be outrun by a slow read.
  for (const decision of decisionEvents) {
    const latestPlanEvent = events
      .slice(0, events.indexOf(decision))
      .reverse()
      .find((e) => PLAN_EVENTS.includes(e.event));
    const opened = latestPlanEvent?.event === 'plan.submitted' ? latestPlanEvent : undefined;
    if (opened === undefined && decision.event === 'founder.cancel') continue;
    const decidedAt = commitTime(decision);
    const openedAt = opened === undefined ? null : commitTime(opened);
    if (decidedAt === null || openedAt === null) {
      if (!failures.includes('decision_time_unrecorded')) failures.push('decision_time_unrecorded');
    } else if (decidedAt - openedAt > set.decisionTimeoutMs && !interrupted.includes('founder_decision_timeout')) {
      interrupted.push('founder_decision_timeout');
    }
  }
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

/** Each derivable command id of the run's rounds: its round's opening event and its attempt number. */
function attemptsOf(
  roomId: string,
  openings: readonly { readonly eventId: string }[],
): ReadonlyMap<string, { readonly opening: string; readonly attempt: number }> {
  const attempts = new Map<string, { readonly opening: string; readonly attempt: number }>();
  for (const opening of openings) {
    for (let attempt = 1; attempt <= MAX_ROUND_ATTEMPTS; attempt += 1) {
      attempts.set(plannerCommandIdFor(roomId, opening.eventId, attempt), { opening: opening.eventId, attempt });
    }
  }
  return attempts;
}

/**
 * A row's evidence references, as the journal route returns every row. The record's
 * row type does not name them, so they are read here, and a row without them has none.
 */
function evidenceOf(row: Phase4RecordedCommandRow | undefined): readonly string[] {
  const refs = (row as { readonly evidenceRefs?: unknown } | undefined)?.evidenceRefs;
  return Array.isArray(refs) ? refs.filter((ref): ref is string => typeof ref === 'string') : [];
}

/**
 * Whether a failed attempt is one the round re-asks after, once, by its own row
 * (FOUNDER-ACT-20261111-BR-PLANNER-REASK B1): a
 * `plan_invalid`, or a `planner_reported_failure` whose journaled reason is malformed
 * or missing output. A timeout, a model switch or a failure with no reason is not.
 */
function reaskable(failed: Phase4RecordedCommandRow): boolean {
  if (failed.failureClassification === 'plan_invalid') return true;
  if (failed.failureClassification !== 'planner_reported_failure') return false;
  return evidenceOf(failed).some(
    (ref) => ref.startsWith('planner-failure/') && (REASKED_FAILURE_REASONS as readonly string[]).includes(ref.slice('planner-failure/'.length)),
  );
}

/**
 * Every planner command: journaled under the act, on the act's route, and
 * dispatched on it. The last command of each round completed; an earlier
 * attempt of a round may have failed `not_sent` (Q8's governed retry), or
 * `plan_invalid` or `planner_reported_failure` when the round's next attempt
 * follows it as the round's one re-ask: journaled as a retry of that attempt
 * for that reason, after a failure B1 re-asks; and a round holds no attempt
 * after its re-ask (B2(5) of FOUNDER-ACT-20261102-BR-PHASE4-COUNTED-RUNS as
 * FOUNDER-ACT-20261111-BR-PLANNER-REASK B8 amends it). An `unresolved` or
 * `resolved` row anywhere means the outcome was once unknown, which a counted
 * run may not contain.
 */
function checkCommands(
  set: Phase4RunSet,
  commands: readonly Phase4RecordedCommand[],
  attempts: ReadonlyMap<string, { readonly opening: string; readonly attempt: number }>,
  failures: Phase4RunFailure[],
): void {
  let authorizationWrong = false;
  let routeWrong = false;
  let notClean = commands.length === 0;
  /** Each round that re-asked, and its re-ask's attempt number. */
  const reasked = new Map<string, number>();
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
    // A round holds at most one attempt after the failure it re-asked (B8): nothing after its re-ask.
    const self = attempts.get(command.commandId);
    const reaskAt = self === undefined ? undefined : reasked.get(self.opening);
    if (self !== undefined && reaskAt !== undefined && self.attempt > reaskAt) notClean = true;
    const last = command.rows.at(-1);
    const nextIsRetry = index < commands.length - 1;
    if (last?.eventType === 'completed') continue;
    if (last?.eventType === 'failed' && last.failureClassification === 'not_sent' && nextIsRetry) continue;
    if (last?.eventType === 'failed' && reaskable(last)) {
      const next = commands[index + 1];
      const following = next === undefined ? undefined : attempts.get(next.commandId);
      const nextRequest = evidenceOf(next?.rows.find((r) => r.eventType === 'journaled'));
      if (
        self !== undefined &&
        following !== undefined &&
        following.opening === self.opening &&
        following.attempt === self.attempt + 1 &&
        !reasked.has(self.opening) &&
        nextRequest.includes(`retry-of/${command.commandId}`) &&
        nextRequest.includes(`retry-reason/${last.failureClassification ?? ''}`)
      ) {
        reasked.set(self.opening, following.attempt);
        continue;
      }
    }
    notClean = true;
  }
  if (authorizationWrong) failures.push('command_authorization_wrong');
  if (routeWrong) failures.push('command_route_wrong');
  if (notClean) failures.push('command_not_clean');
}

/** An event's commit time in milliseconds, or null when the record has none. */
const PLAN_EVENTS: readonly string[] = ['plan.submitted', 'plan.revision_requested', 'plan.approved'];

function commitTime(event: { readonly committedAt?: string }): number | null {
  if (event.committedAt === undefined) return null;
  const ms = Date.parse(event.committedAt);
  return Number.isNaN(ms) ? null : ms;
}
