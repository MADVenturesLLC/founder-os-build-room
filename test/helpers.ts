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
  type Scope,
  type State,
} from '../packages/contracts/src/index.js';
import { initialLedger, type LedgerState, type LifecycleEvent } from '../packages/ledger/src/index.js';

export const SHA = 'a'.repeat(40);
export const SHA_OLD = 'b'.repeat(40);
export const SHA_NEW = 'c'.repeat(40);

export const ATTRIBUTION: Attribution = {
  roleId: 'builder',
  actorId: 'session:claude-code/wf04-step3-slice1',
  actualModel: 'claude-opus-5',
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

/** Build a well-formed event for `name`, with the actor the event table requires. */
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
    reviewedSha: SHA,
    headSha: SHA_OLD,
    // Pre-seeding both compound pairs lets T9 and T13 fire on either member
    // rather than parking in `conjunction_pending`.
    observedCompanions: ['git.pushed', 'pr.draft_created', 'review.passed', 'checks.verified'],
    ...overrides,
  };
}
