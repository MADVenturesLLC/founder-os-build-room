/**
 * `@build-room/ledger` — the pure reducer that enforces the lifecycle.
 *
 * PURE: zero I/O, zero credentials, zero infrastructure, no clock, no
 * randomness. Every fact the guards need is supplied by the caller; every
 * timestamp arrives on the event. The reducer is a total function of
 * (state, event) -> result, which is what makes replay deterministic.
 *
 * Authority: `DEC-20260815-11` v0.10 clause 3 — the four core invariants are
 * enforced BY THE LEDGER:
 *
 *   INV-1  no MERGE_CONFIRMED without a consumed Founder authorization
 *   INV-2  SHA-stale verdicts rejected
 *   INV-3  push-voids cascade (T18)
 *   INV-4  replay idempotency
 */

import {
  GUARDS,
  TRANSITIONS,
  eventSpec,
  isAttributionShapeValid,
  isEventName,
  isTerminal,
  transition,
  type Actor,
  type Attribution,
  type AuthorizationRecord,
  type EventName,
  type EvidenceRef,
  type GuardFacts,
  type GuardId,
  type LifecycleSnapshot,
  type OverlayFlag,
  type Scope,
  type State,
  type TransitionId,
  type TransitionSpec,
} from '../../contracts/src/index.js';

/** One recorded, accepted transition. Satisfies architecture §3.8's record shape. */
export interface LedgerEntry {
  readonly seq: number;
  readonly eventId: string;
  readonly event: EventName;
  readonly transition: TransitionId;
  readonly guard: GuardId;
  readonly actor: Actor;
  /** Accountable role, actual model, execution surface. */
  readonly attribution: Attribution;
  readonly scope: Scope;
  readonly evidence: readonly EvidenceRef[];
  readonly fromState: State;
  readonly resultingState: State;
  readonly overlays: readonly OverlayFlag[];
  readonly round: number;
  readonly occurredAt: string;
}

export interface LedgerState {
  readonly state: State;
  readonly overlays: readonly OverlayFlag[];
  readonly priorState: State | null;
  readonly round: number;
  readonly authorization: AuthorizationRecord | null;
  /** T18 retains VOIDED authorization records rather than discarding them. */
  readonly voidedAuthorizations: readonly AuthorizationRecord[];
  readonly reviewedSha: string | null;
  readonly headSha: string | null;
  /** Companion events seen in the CURRENT state occupancy (T9, T13). */
  readonly observedCompanions: readonly EventName[];
  readonly appliedEventIds: readonly string[];
  readonly entries: readonly LedgerEntry[];
}

export interface LifecycleEvent {
  /** Stable identity. Replaying the same id is a no-op (INV-4). */
  readonly eventId: string;
  readonly event: EventName;
  readonly actor: Actor;
  readonly attribution: Attribution;
  readonly scope: Scope;
  readonly evidence: readonly EvidenceRef[];
  /** Supplied by the caller — the pure core reads no clock. */
  readonly occurredAt: string;
  readonly facts?: GuardFacts;
}

export type RejectionCode =
  | 'unknown_event'
  | 'terminal_state'
  | 'actor_not_authorized'
  | 'state_not_in_from_set'
  | 'attribution_invalid'
  | 'guard_failed'
  | 'no_prior_state';

export type ApplyResult =
  | { readonly ok: true; readonly kind: 'transition'; readonly state: LedgerState; readonly entry: LedgerEntry }
  | { readonly ok: true; readonly kind: 'replay'; readonly state: LedgerState; readonly entry: LedgerEntry | null }
  | { readonly ok: true; readonly kind: 'conjunction_pending'; readonly state: LedgerState; readonly awaiting: readonly EventName[] }
  | { readonly ok: false; readonly kind: 'rejected'; readonly code: RejectionCode; readonly reason: string };

/**
 * The transitions that move the branch head, derived from the table's guards
 * (T9 "push confirmed remote", T12 "new head ≠ old head", T18 "git.pushed (new
 * sha)"). Exported so a test can pin the set rather than trusting the comment.
 */
export const HEAD_MOVING_TRANSITIONS: readonly TransitionId[] = ['T9', 'T12', 'T18'];

export function initialLedger(): LedgerState {
  return {
    state: 'ROOM_CREATED',
    overlays: [],
    priorState: null,
    round: 0,
    authorization: null,
    voidedAuthorizations: [],
    reviewedSha: null,
    headSha: null,
    observedCompanions: [],
    appliedEventIds: [],
    entries: [],
  };
}

export function snapshot(state: LedgerState): LifecycleSnapshot {
  return {
    state: state.state,
    overlays: state.overlays,
    priorState: state.priorState,
    round: state.round,
    authorization: state.authorization,
    reviewedSha: state.reviewedSha,
    headSha: state.headSha,
  };
}

const reject = (code: RejectionCode, reason: string): ApplyResult => ({
  ok: false,
  kind: 'rejected',
  code,
  reason,
});

/** Resolve the transition an event triggers. Every event maps to exactly one. */
function transitionFor(event: EventName): TransitionSpec {
  return transition(eventSpec(event).transition);
}

/** Where the transition lands, resolving T20's dynamic `prior_state` target. */
function resolveTarget(spec: TransitionSpec, current: LedgerState): State | null {
  if (spec.target.kind === 'state') {
    return spec.target.state;
  }
  return current.priorState;
}

/**
 * Apply one event. Total, pure, and deterministic.
 *
 * Order of checks is deliberate: identity (replay) first so a duplicate is
 * never re-validated against changed facts, then vocabulary, then terminality,
 * then actor, then the from-set, then attribution, then the conjunction limb,
 * then the guard.
 */
export function apply(current: LedgerState, event: LifecycleEvent): ApplyResult {
  // INV-4 — replay idempotency. A repeated eventId yields the same state and
  // adds no second entry.
  if (current.appliedEventIds.includes(event.eventId)) {
    const existing = current.entries.find((e) => e.eventId === event.eventId) ?? null;
    return { ok: true, kind: 'replay', state: current, entry: existing };
  }

  if (!isEventName(event.event)) {
    return reject('unknown_event', `not a canonical event: ${String(event.event)}`);
  }

  // The terminal set is closed (Founder Ruling, ruling 1). No transition has a
  // terminal state in its from-set, so this is defence in depth — but it gives
  // the closure its own rejection code rather than an incidental one.
  if (isTerminal(current.state)) {
    return reject('terminal_state', `${current.state} is terminal — the terminal set is closed`);
  }

  const spec = transitionFor(event.event);

  // The event table names exactly one authorized actor per event, which is
  // tighter than the transition's actor column for multi-actor rows like T6.
  const expectedActor = eventSpec(event.event).actor;
  if (event.actor !== expectedActor) {
    return reject(
      'actor_not_authorized',
      `${event.event} is raised by ${expectedActor}, not ${String(event.actor)}`,
    );
  }

  if (!spec.from.includes(current.state)) {
    return reject(
      'state_not_in_from_set',
      `${spec.id} does not fire from ${current.state}`,
    );
  }

  if (!isAttributionShapeValid(event.attribution)) {
    return reject('attribution_invalid', 'attribution block is not shape-valid');
  }

  // Conjunction limb of G9/G13. The decision splits compound `+` triggers into
  // individual events and assigns the conjunction to the guard; it is
  // implemented here because it needs ledger-scoped memory (which companion
  // has already arrived) that the guard signature does not carry. The observed
  // set is passed into the guard facts so a guard can also read it.
  let observedCompanions = current.observedCompanions;
  if (spec.conjunction !== null) {
    const seen = new Set<EventName>([...observedCompanions, event.event]);
    const awaiting = spec.conjunction.filter((e) => !seen.has(e));
    if (awaiting.length > 0) {
      return {
        ok: true,
        kind: 'conjunction_pending',
        state: {
          ...current,
          observedCompanions: [...seen],
          appliedEventIds: [...current.appliedEventIds, event.eventId],
        },
        awaiting,
      };
    }
    observedCompanions = [...seen];
  }

  const facts: GuardFacts = { ...(event.facts ?? {}), observedCompanions };
  const verdict = GUARDS[spec.guard](snapshot(current), facts);
  if (!verdict.ok) {
    return reject('guard_failed', `${spec.guard} (${spec.id}): ${verdict.reason}`);
  }

  const resulting = resolveTarget(spec, current);
  if (resulting === null) {
    return reject('no_prior_state', `${spec.id} resumes to prior_state but none is stored`);
  }

  return { ok: true, kind: 'transition', ...commit(current, event, spec, resulting, facts) };
}

function commit(
  current: LedgerState,
  event: LifecycleEvent,
  spec: TransitionSpec,
  resulting: State,
  facts: GuardFacts,
): { state: LedgerState; entry: LedgerEntry } {
  let overlays = [...current.overlays];
  let round = current.round;
  let authorization = current.authorization;
  let voidedAuthorizations = [...current.voidedAuthorizations];
  let priorState = current.priorState;
  let reviewedSha = current.reviewedSha;
  let headSha = current.headSha;

  // T19 — store the single prior_state slot on entering RECONCILING. A single
  // slot suffices because the self-loop is barred (ruling 3).
  if (spec.id === 'T19') {
    priorState = current.state;
  }

  // T20 — resuming consumes the stored prior state.
  if (spec.id === 'T20') {
    priorState = null;
  }

  // T21 — set the overlay. The room stays in RECONCILING; the flag annotates it.
  if (spec.setsOverlay !== null && !overlays.includes(spec.setsOverlay)) {
    overlays = [...overlays, spec.setsOverlay];
  }

  // INV-3 — the push-voids cascade. T18 voids stale review AND authorization
  // unconditionally, retains the VOIDED record, marks history with
  // `auth_voided`, and increments the round so any surviving authorization is
  // detectably stale.
  if (spec.incrementsRound) {
    round = current.round + 1;
  }
  if (spec.id === 'T18') {
    if (authorization !== null && !authorization.voided) {
      const voided: AuthorizationRecord = { ...authorization, voided: true };
      voidedAuthorizations = [...voidedAuthorizations, voided];
      authorization = voided;
      if (!overlays.includes('auth_voided')) {
        overlays = [...overlays, 'auth_voided'];
      }
    }
    reviewedSha = null;
  }

  // T10 / T15 / T16 — the exact-SHA chain.
  if (spec.id === 'T10' && typeof facts.reviewedSha === 'string') {
    reviewedSha = facts.reviewedSha;
  }
  if (spec.id === 'T15' && typeof facts.authorizedSha === 'string') {
    authorization = {
      authorizedSha: facts.authorizedSha,
      consumed: false,
      voided: false,
      round: current.round,
    };
  }
  if (spec.id === 'T16' && authorization !== null) {
    // INV-1 — the authorization is CONSUMED in the same step that reaches
    // MERGE_CONFIRMED. Single-use is enforced here, not merely asserted.
    authorization = { ...authorization, consumed: true };
  }
  // Only the transitions that actually MOVE the branch head may update it.
  //
  // The head-moving set is derived from the transition table's own text, not
  // chosen: T9 `git.pushed + pr.draft_created` guarded by "push confirmed
  // remote"; T12 guarded by "new head ≠ old head"; and T18 `git.pushed (new
  // sha)`. No other row moves the head — T10, T13, T15 and T16 compare against
  // it but never advance it.
  //
  // Leaving this unscoped was a real defect: `headSha` is read by G12
  // ("new head ≠ old head"), so an unrelated event carrying `newHeadSha` in its
  // facts — `decision.answered`, say — could rewrite the head and change
  // whether a later T12 passes.
  if (HEAD_MOVING_TRANSITIONS.includes(spec.id)) {
    if (typeof facts.newHeadSha === 'string') {
      headSha = facts.newHeadSha;
    } else if (typeof facts.remoteHeadSha === 'string') {
      headSha = facts.remoteHeadSha;
    }
  }

  const entry: LedgerEntry = {
    seq: current.entries.length + 1,
    eventId: event.eventId,
    event: event.event,
    transition: spec.id,
    guard: spec.guard,
    actor: event.actor,
    attribution: event.attribution,
    scope: event.scope,
    evidence: event.evidence,
    fromState: current.state,
    resultingState: resulting,
    overlays,
    round,
    occurredAt: event.occurredAt,
  };

  const next: LedgerState = {
    state: resulting,
    overlays,
    priorState,
    round,
    authorization,
    voidedAuthorizations,
    reviewedSha,
    headSha,
    // Companions are scoped to a state occupancy; a transition clears them.
    observedCompanions: [],
    appliedEventIds: [...current.appliedEventIds, event.eventId],
    entries: [...current.entries, entry],
  };

  assertInvariants(next);
  return { state: next, entry };
}

/**
 * Post-condition assertions for the invariants the reducer must never break.
 * These are unreachable through the public API when the guards are correct —
 * they exist so that a future edit which breaks one fails loudly rather than
 * producing a quietly wrong ledger.
 */
function assertInvariants(next: LedgerState): void {
  // INV-1
  if (next.state === 'MERGE_CONFIRMED') {
    const auth = next.authorization;
    if (auth === null || !auth.consumed || auth.voided) {
      throw new Error('INV-1 violated: MERGE_CONFIRMED without a consumed Founder authorization');
    }
  }
  // Terminal closure (Founder Ruling, ruling 1).
  const leavingTerminal = next.entries.some((e) => isTerminal(e.fromState));
  if (leavingTerminal) {
    throw new Error('terminal closure violated: a transition left a terminal state');
  }
}

/** Fold a sequence of events. Stops and reports at the first rejection. */
export function applyAll(
  start: LedgerState,
  events: readonly LifecycleEvent[],
): { readonly state: LedgerState; readonly results: readonly ApplyResult[] } {
  let state = start;
  const results: ApplyResult[] = [];
  for (const event of events) {
    const result = apply(state, event);
    results.push(result);
    if (result.ok) {
      state = result.state;
    } else {
      break;
    }
  }
  return { state, results };
}

/** Every (state, event) pair the table accepts, derived from the table itself. */
export function acceptedPairs(): ReadonlySet<string> {
  const pairs = new Set<string>();
  for (const spec of TRANSITIONS) {
    for (const from of spec.from) {
      for (const trigger of spec.triggers) {
        pairs.add(`${from}|${trigger}`);
      }
    }
  }
  return pairs;
}
