/**
 * The canonical event vocabulary — 30 events.
 *
 * Source of truth: `DEC-20260815-11` v0.12, `## Canonical Event Vocabulary`.
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
 *
 * Row 30, `runtime_room.bound`, was added on 2026-10-27 by
 * `FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING`, which the decision records
 * verbatim. It is the ONE event that maps to no transition: it is recorded by
 * `system` in `BUILDING` and leaves the room in `BUILDING` (that ruling's B1).
 * Its payload is exactly three ids (B2), carried as `RuntimeRoomBinding`
 * below. The other 29 events each map to exactly one transition.
 */

import type { State } from './states.js';
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
  'runtime_room.bound',
] as const;

export type EventName = (typeof EVENTS)[number];

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && (EVENTS as readonly string[]).includes(value);
}

/**
 * The event table's three columns, one row per event: the transition it
 * triggers and the actor authorized to raise it.
 *
 * Every event maps to AT MOST one transition, which is what makes
 * (state, event) -> transition lookup unambiguous. Twenty-nine map to exactly
 * one; `runtime_room.bound` maps to none (`transition: null`) and is recorded
 * without a state change — `RECORDED_EVENTS` names the state it is recorded in.
 */
export interface EventSpec {
  readonly event: EventName;
  readonly transition: TransitionId | null;
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
  // Row 30: "none: recorded in `BUILDING`, no state change"
  // (FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING, B1).
  { event: 'runtime_room.bound', transition: null, actor: 'system' },
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

/**
 * An event that triggers no transition, and the one state it is recorded in.
 * It leaves the room in that same state.
 */
export interface RecordedEventSpec {
  readonly event: EventName;
  readonly recordedIn: State;
}

/**
 * Every event whose `EventSpec.transition` is null. One today:
 * `runtime_room.bound` "is recorded in BUILDING and leaves the room in
 * BUILDING" (FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING, B1).
 */
export const RECORDED_EVENTS: readonly RecordedEventSpec[] = [
  { event: 'runtime_room.bound', recordedIn: 'BUILDING' },
];

const RECORDED_INDEX: ReadonlyMap<EventName, RecordedEventSpec> = new Map(
  RECORDED_EVENTS.map((row) => [row.event, row]),
);

/** The recorded-event row for `event`, or null when the event triggers a transition. */
export function recordedEventSpec(event: EventName): RecordedEventSpec | null {
  return RECORDED_INDEX.get(event) ?? null;
}

/**
 * The payload of `runtime_room.bound`: "Exactly three fields, besides the
 * journal's own envelope ... No other field is carried."
 * (FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING, B2.)
 *
 * camelCase here and in the stored event payload; the ruling names them
 * `lifecycle_room_id`, `runtime_room_id` and `gateway_id`.
 */
export interface RuntimeRoomBinding {
  /** The lifecycle room's id: a canonical lowercase UUID. */
  readonly lifecycleRoomId: string;
  /** The id the Gateway minted for the runtime room: `room-` and a canonical lowercase UUID. */
  readonly runtimeRoomId: string;
  /** The enrolled Gateway that minted it and on which the build runs: a canonical lowercase UUID. */
  readonly gatewayId: string;
}

/** The binding's three member names, in declaration order. */
export const RUNTIME_ROOM_BINDING_FIELDS = ['lifecycleRoomId', 'runtimeRoomId', 'gatewayId'] as const;

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RUNTIME_ROOM_ID = /^room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A canonical lowercase UUID: 8-4-4-4-12 lowercase hex with literal dashes,
 * and nothing else — the form the gateway protocol's `isValidGatewayId`
 * accepts, restated here because this package depends on nothing.
 */
export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_UUID.test(value);
}

/**
 * A Gateway-minted runtime room id: `room-` followed by a canonical lowercase
 * UUID, which is what the Gateway's room runtime mints on CreateRoom.
 */
export function isRuntimeRoomId(value: unknown): value is string {
  return typeof value === 'string' && RUNTIME_ROOM_ID.test(value);
}

/**
 * Why `value` is not a well-formed `RuntimeRoomBinding`, or null when it is.
 * Fails closed: a non-object, a missing or extra member, or any id not in its
 * exact form is a defect. Nothing is normalized.
 */
export function runtimeRoomBindingDefect(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'binding is not an object';
  }
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!(RUNTIME_ROOM_BINDING_FIELDS as readonly string[]).includes(key)) {
      return `binding carries a field the ruling does not name: ${key}`;
    }
  }
  for (const field of RUNTIME_ROOM_BINDING_FIELDS) {
    if (!keys.includes(field)) return `binding.${field} is missing`;
  }
  const binding = value as Record<string, unknown>;
  if (!isCanonicalUuid(binding['lifecycleRoomId'])) {
    return 'binding.lifecycleRoomId is not a canonical lowercase UUID';
  }
  if (!isRuntimeRoomId(binding['runtimeRoomId'])) {
    return 'binding.runtimeRoomId is not room- followed by a canonical lowercase UUID';
  }
  if (!isCanonicalUuid(binding['gatewayId'])) {
    return 'binding.gatewayId is not a canonical lowercase UUID';
  }
  return null;
}

export function isRuntimeRoomBinding(value: unknown): value is RuntimeRoomBinding {
  return runtimeRoomBindingDefect(value) === null;
}
