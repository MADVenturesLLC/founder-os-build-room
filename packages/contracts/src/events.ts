/**
 * The canonical event vocabulary — 29 events.
 *
 * Source of truth: `DEC-20260815-11` v0.10, `## Canonical Event Vocabulary`.
 * The Fable package's "20-event vocabulary" claim is SUPERSEDED by this
 * enumeration; the decision fixes the enum rather than inheriting it.
 *
 * Normalizations the decision applies to the transition table's trigger column,
 * reproduced here because they are the reason several names differ from the
 * table cells verbatim:
 *
 *  - Compound `+` triggers (AND logic: T9, T13) are split into individual
 *    events; the transition's GUARD enforces the conjunction.
 *  - Multi-trigger transitions are split into individual events; any one
 *    satisfies the trigger condition. The table uses two delimiters for this:
 *    `/` in T6 and `,` in T7. Both denote OR.
 *  - Parameterized triggers serialize by replacing the parenthesized argument
 *    with a dotted suffix: `event(param)` becomes `event.param`. This applies
 *    to T2, whose cell reads `task.dispatched(planner)` and whose canonical
 *    name is therefore `task.dispatched.planner`. Tier-2 round 4
 *    (`chatgpt-5.6-terra`) found this rule had been applied from the first
 *    revision but never written down.
 *  - T9's `git.pushed` (initial push creating a draft PR) and T18's
 *    `git.pushed (new sha)` (subsequent push voiding stale review) are
 *    DISTINCT events: `git.pushed` and `git.push.voided` respectively.
 */

import type { TransitionId } from './transitions.js';

/**
 * Authorized actors, as the transition table's "Authorized actor" column
 * names them. `agent(planner)` / `agent(builder)` serialize under the same
 * dotted rule the event names use.
 */
export const ACTORS = [
  'founder',
  'system',
  'gateway',
  'agent.planner',
  'agent.builder',
  'github+system',
] as const;

export type Actor = (typeof ACTORS)[number];

export const EVENTS = [
  'scope.captured',
  'task.dispatched.planner',
  'plan.submitted',
  'plan.revision_requested',
  'plan.approved',
  'decision.requested',
  'command.queued',
  'ceiling.exceeded',
  'decision.answered',
  'command.approved',
  'command.denied',
  'ceiling.raised',
  'build.ready_for_evidence',
  'git.pushed',
  'pr.draft_created',
  'review.opened',
  'review.blocked',
  'remediation.complete',
  'review.passed',
  'checks.verified',
  'readiness.presented',
  'founder.authorization.granted',
  'merge.confirmed',
  'build.closed',
  'git.push.voided',
  'recon.opened',
  'recon.resumed',
  'recon.exhausted',
  'founder.cancel',
] as const;

export type EventName = (typeof EVENTS)[number];

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && (EVENTS as readonly string[]).includes(value);
}

/**
 * The event table's three columns, one row per event: the transition it
 * triggers and the actor authorized to raise it.
 *
 * Every event maps to exactly ONE transition, which is what makes
 * (state, event) -> transition lookup unambiguous.
 */
export interface EventSpec {
  readonly event: EventName;
  readonly transition: TransitionId;
  readonly actor: Actor;
}

export const EVENT_TABLE: readonly EventSpec[] = [
  { event: 'scope.captured', transition: 'T1', actor: 'founder' },
  { event: 'task.dispatched.planner', transition: 'T2', actor: 'system' },
  { event: 'plan.submitted', transition: 'T3', actor: 'agent.planner' },
  { event: 'plan.revision_requested', transition: 'T4', actor: 'founder' },
  { event: 'plan.approved', transition: 'T5', actor: 'founder' },
  { event: 'decision.requested', transition: 'T6', actor: 'agent.builder' },
  { event: 'command.queued', transition: 'T6', actor: 'gateway' },
  { event: 'ceiling.exceeded', transition: 'T6', actor: 'system' },
  { event: 'decision.answered', transition: 'T7', actor: 'founder' },
  { event: 'command.approved', transition: 'T7', actor: 'founder' },
  { event: 'command.denied', transition: 'T7', actor: 'founder' },
  { event: 'ceiling.raised', transition: 'T7', actor: 'founder' },
  { event: 'build.ready_for_evidence', transition: 'T8', actor: 'agent.builder' },
  { event: 'git.pushed', transition: 'T9', actor: 'gateway' },
  { event: 'pr.draft_created', transition: 'T9', actor: 'gateway' },
  { event: 'review.opened', transition: 'T10', actor: 'system' },
  { event: 'review.blocked', transition: 'T11', actor: 'system' },
  { event: 'remediation.complete', transition: 'T12', actor: 'agent.builder' },
  { event: 'review.passed', transition: 'T13', actor: 'system' },
  { event: 'checks.verified', transition: 'T13', actor: 'system' },
  { event: 'readiness.presented', transition: 'T14', actor: 'system' },
  { event: 'founder.authorization.granted', transition: 'T15', actor: 'founder' },
  { event: 'merge.confirmed', transition: 'T16', actor: 'github+system' },
  { event: 'build.closed', transition: 'T17', actor: 'system' },
  { event: 'git.push.voided', transition: 'T18', actor: 'system' },
  { event: 'recon.opened', transition: 'T19', actor: 'system' },
  { event: 'recon.resumed', transition: 'T20', actor: 'system' },
  { event: 'recon.exhausted', transition: 'T21', actor: 'system' },
  { event: 'founder.cancel', transition: 'T22', actor: 'founder' },
];

const EVENT_INDEX: ReadonlyMap<EventName, EventSpec> = new Map(
  EVENT_TABLE.map((row) => [row.event, row]),
);

export function eventSpec(event: EventName): EventSpec {
  const spec = EVENT_INDEX.get(event);
  if (spec === undefined) {
    throw new RangeError(`not a canonical event: ${String(event)}`);
  }
  return spec;
}
