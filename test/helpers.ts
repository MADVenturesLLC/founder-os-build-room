/**
 * Shared fixtures for the acceptance-criteria suite.
 *
 * Lives outside `packages/*​/src` deliberately: the zero-I/O purity test
 * (AC#5) scans only the package sources, and these helpers are not shipped.
 */

import {
  eventSpec,
  type Attribution,
  type EventName,
  type EvidenceRef,
  type GuardFacts,
  type RuntimeRoomBinding,
  type RuntimeRoomBindingRecord,
  type Scope,
  type State,
} from '../packages/contracts/src/index.js';
import { initialLedger, type LedgerState, type LifecycleEvent } from '../packages/ledger/src/index.js';

/**
 * A well-formed `runtime_room.bound` payload: two canonical lowercase UUIDs
 * and a `room-` runtime room id. Fixture values, not real rooms or Gateways.
 * Each id carries hex letters, so a case-folded copy is a different string.
 */
export const BINDING: RuntimeRoomBinding = {
  lifecycleRoomId: '0f1e2d3c-4b5a-4968-8778-a1b2c3d4e5f6',
  runtimeRoomId: 'room-9a8b7c6d-5e4f-4a3b-9c2d-1e0f2a3b4c5d',
  gatewayId: 'c0ffee00-1234-4abc-8def-0123456789ab',
};

/** `BINDING` as the ledger records it, under a fixed event id. */
export const BINDING_RECORD: RuntimeRoomBindingRecord = { ...BINDING, eventId: 'evt-binding' };

export const SHA = 'a'.repeat(40);
export const SHA_OLD = 'b'.repeat(40);
export const SHA_NEW = 'c'.repeat(40);

/**
 * A fixture, not a record of who did anything. `actualModel` carries a
 * placeholder deliberately: the field's contract is "the model that ACTUALLY
 * performed the work", so naming a real model here would state something the
 * fixture cannot know and does not mean.
 */
export const ATTRIBUTION: Attribution = {
  roleId: 'builder',
  actorId: 'session:test-fixture',
  actualModel: 'model-under-test',
  executionSurface: 'claude-code',
};

export const SCOPE: Scope = {
  roomId: 'room-1',
  repo: 'MADVenturesLLC/founder-os-build-room',
  paths: ['packages/contracts/', 'packages/ledger/'],
};

export const EVIDENCE: readonly EvidenceRef[] = [
  { kind: 'diff', ref: 'pr/1', digest: 'sha256:' + 'd'.repeat(64) },
];

/**
 * Facts permissive enough to satisfy every guard at once.
 *
 * Two entries look contradictory and are not:
 *  - `openBlockers: 1` satisfies G11 ("open blockers"), while `founderWaivers:
 *    true` satisfies G13's "zero open blockers (OR founder waivers)" limb. Both
 *    guards therefore pass from IN_REVIEW with one fact set, which is what the
 *    exhaustive matrix needs.
 *  - `headSha` is SHA_OLD while `newHeadSha` is SHA_NEW, so G12's
 *    "new head ≠ old head" holds.
 *
 * `boundRuntimeRoomClosed` is a fact the control plane derives and a client
 * never supplies; asserting it here stands in for that derivation, as the
 * other facts stand in for theirs.
 */
export const PERMISSIVE_FACTS: GuardFacts = {
  repoInAllowlist: true,
  baseSha: SHA,
  remoteHeadSha: SHA,
  rolesAssigned: true,
  reviewerIsNotBuilder: true,
  gatewayOnline: true,
  planDocSchemaValid: true,
  planHash: 'plan-hash',
  expectedPlanHash: 'plan-hash',
  feedbackAttached: true,
  scopePathsCanonical: true,
  typedSubjectBound: true,
  boundRequestId: 'req-1',
  localCommitsExist: true,
  evidenceExistsForHead: true,
  pushConfirmedRemote: true,
  reviewedSha: SHA,
  reviewerIndependent: true,
  readOnlyWorkspaceAttested: true,
  openBlockers: 1,
  founderWaivers: true,
  shaUnchanged: true,
  newHeadSha: SHA_NEW,
  checksGreenAtSha: SHA,
  evidenceVerified: true,
  summaryAssembled: true,
  stepUpFresh: true,
  authorizedSha: SHA,
  webhookHmacValid: true,
  guidDeduped: true,
  pollCorroborated: true,
  mergedHeadSha: SHA,
  allEvidenceVerified: true,
  boundRuntimeRoomClosed: true,
  typedCause: 'drift',
  stateVerifiedConsistent: true,
  boundedRetriesSpent: true,
  runningTasksCancelled: true,
};

let counter = 0;
export function nextEventId(): string {
  counter += 1;
  return `evt-${counter}`;
}

/**
 * Build a well-formed event for `name`, with the actor the event table
 * requires. `runtime_room.bound` gets `BINDING`, which it requires; no other
 * event carries a binding, since the ledger refuses one anywhere else.
 */
export function makeEvent(
  name: EventName,
  overrides: Partial<LifecycleEvent> = {},
): LifecycleEvent {
  return {
    eventId: nextEventId(),
    event: name,
    actor: eventSpec(name).actor,
    attribution: ATTRIBUTION,
    scope: SCOPE,
    evidence: EVIDENCE,
    occurredAt: '2026-08-16T00:00:00.000Z',
    facts: PERMISSIVE_FACTS,
    ...(name === 'runtime_room.bound' ? { binding: BINDING } : {}),
    ...overrides,
  };
}

/**
 * A ledger parked at an arbitrary state, shaped so that every transition the
 * table permits FROM that state can fire.
 *
 * `authorization` is present only at AUTHORIZED: T16 requires a live one, while
 * T15's single-use limb rejects a grant made while one is already outstanding.
 * Attaching it everywhere would make T15 unfirable and mask a real rejection.
 *
 * `binding` follows the same rule and is present only at MERGE_CONFIRMED: G17
 * requires one, while `runtime_room.bound` from BUILDING is refused once one
 * exists. Attaching it everywhere would make the binding unrecordable.
 */
export function ledgerAt(state: State, overrides: Partial<LedgerState> = {}): LedgerState {
  return {
    ...initialLedger(),
    state,
    priorState: 'BUILDING',
    round: 0,
    authorization:
      state === 'AUTHORIZED'
        ? { authorizedSha: SHA, consumed: false, voided: false, round: 0 }
        : null,
    binding: state === 'MERGE_CONFIRMED' ? BINDING_RECORD : null,
    reviewedSha: SHA,
    headSha: SHA_OLD,
    // Pre-seeding both compound pairs lets T9 and T13 fire on either member
    // rather than parking in `conjunction_pending`.
    observedCompanions: ['git.pushed', 'pr.draft_created', 'review.passed', 'checks.verified'],
    ...overrides,
  };
}
