/**
 * The T1-T22 transition table and the G1-G22 guards.
 *
 * Source of truth: `DEC-20260815-11` v0.10, `## Reproduced Lifecycle Artifacts`
 * → "The T1-T22 transition table". Guard identifiers G1-G22 correspond
 * POSITIONALLY to T1-T22 (the decision states this explicitly; the table itself
 * carries no G-column, so the correspondence is derived, not transcribed).
 *
 * Every row's `guardText` below is the decision's "Guard (beyond schema/actor)"
 * cell verbatim, so a reader can diff code against spec without leaving the
 * file. T20 is the ONE row that is not the pinned Fable package verbatim: its
 * guard carries the Founder amendment of 2026-08-15 (`manual_required` blocks
 * resume), and the decision marks that divergence inline at the point of use.
 *
 * This module is PURE. Guards never perform I/O; they decide over a supplied
 * `LifecycleSnapshot` plus caller-asserted `GuardFacts`. Establishing those
 * facts (reading a remote head, verifying a webhook HMAC) belongs to the impure
 * layers that are NOT part of Slice 1.
 */

import type { EventName, Actor } from './events.js';
import type { OverlayFlag } from './overlays.js';
import {
  anyNonTerminalExcluding,
  range,
  type State,
} from './states.js';

export const TRANSITION_IDS = [
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11',
  'T12', 'T13', 'T14', 'T15', 'T16', 'T17', 'T18', 'T19', 'T20', 'T21', 'T22',
] as const;

export type TransitionId = (typeof TRANSITION_IDS)[number];

export const GUARD_IDS = [
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11',
  'G12', 'G13', 'G14', 'G15', 'G16', 'G17', 'G18', 'G19', 'G20', 'G21', 'G22',
] as const;

export type GuardId = (typeof GUARD_IDS)[number];

/** A single-use Founder authorization, bound to an exact SHA and a round. */
export interface AuthorizationRecord {
  readonly authorizedSha: string;
  readonly consumed: boolean;
  readonly voided: boolean;
  /** The review round the authorization was granted in; T18 makes it stale. */
  readonly round: number;
}

/** The lifecycle facts a guard may read. Immutable snapshot, no I/O. */
export interface LifecycleSnapshot {
  readonly state: State;
  readonly overlays: readonly OverlayFlag[];
  /** Set on entering RECONCILING via T19; T20 resumes to it. Single slot. */
  readonly priorState: State | null;
  /** Ledger metadata, not a state. Initialized to 0, incremented by T18. */
  readonly round: number;
  readonly authorization: AuthorizationRecord | null;
  readonly reviewedSha: string | null;
  readonly headSha: string | null;
}

/**
 * Caller-asserted facts. Every field is optional and every guard demands the
 * ones it needs EXPLICITLY — an absent fact is never read as satisfied, so a
 * caller that forgets to assert something gets a rejection rather than a
 * silent pass.
 */
export interface GuardFacts {
  readonly repoInAllowlist?: boolean;
  readonly baseSha?: string;
  readonly remoteHeadSha?: string;
  readonly rolesAssigned?: boolean;
  readonly reviewerIsNotBuilder?: boolean;
  readonly gatewayOnline?: boolean;
  readonly planDocSchemaValid?: boolean;
  readonly planHash?: string;
  readonly expectedPlanHash?: string;
  readonly feedbackAttached?: boolean;
  readonly scopePathsCanonical?: boolean;
  readonly typedSubjectBound?: boolean;
  readonly boundRequestId?: string;
  readonly localCommitsExist?: boolean;
  readonly evidenceExistsForHead?: boolean;
  readonly pushConfirmedRemote?: boolean;
  readonly reviewedSha?: string;
  readonly reviewerIndependent?: boolean;
  readonly readOnlyWorkspaceAttested?: boolean;
  readonly openBlockers?: number;
  readonly founderWaivers?: boolean;
  readonly shaUnchanged?: boolean;
  readonly newHeadSha?: string;
  readonly checksGreenAtSha?: string;
  readonly evidenceVerified?: boolean;
  readonly summaryAssembled?: boolean;
  readonly stepUpFresh?: boolean;
  readonly authorizedSha?: string;
  readonly webhookHmacValid?: boolean;
  readonly guidDeduped?: boolean;
  readonly pollCorroborated?: boolean;
  readonly mergedHeadSha?: string;
  readonly allEvidenceVerified?: boolean;
  readonly typedCause?: string;
  readonly stateVerifiedConsistent?: boolean;
  readonly boundedRetriesSpent?: boolean;
  readonly runningTasksCancelled?: boolean;
  readonly unconfirmedCancelRecorded?: boolean;
  /** Companion events already observed in the current state occupancy (T9, T13). */
  readonly observedCompanions?: readonly EventName[];
}

export type GuardResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const PASS: GuardResult = { ok: true };
const fail = (reason: string): GuardResult => ({ ok: false, reason });

export type GuardFn = (snapshot: LifecycleSnapshot, facts: GuardFacts) => GuardResult;

/** Where a transition lands. T20's target is dynamic (the stored prior state). */
export type Target =
  | { readonly kind: 'state'; readonly state: State }
  | { readonly kind: 'prior_state' };

export interface TransitionSpec {
  readonly id: TransitionId;
  readonly guard: GuardId;
  /** Source states, fully enumerated — ranges and "any non-terminal" resolved. */
  readonly from: readonly State[];
  readonly target: Target;
  /** Events that trigger this transition. More than one means OR. */
  readonly triggers: readonly EventName[];
  /** All-of set for compound `+` triggers (T9, T13); null otherwise. */
  readonly conjunction: readonly EventName[] | null;
  readonly actors: readonly Actor[];
  /** Overlay flag this transition sets, if any (T21). */
  readonly setsOverlay: OverlayFlag | null;
  /** T18 alone increments the review round. */
  readonly incrementsRound: boolean;
  /** The decision's guard cell, verbatim. */
  readonly guardText: string;
}

const nonEmpty = (v: string | undefined): boolean => typeof v === 'string' && v.trim() !== '';

export const GUARDS: Readonly<Record<GuardId, GuardFn>> = {
  // T1 — repo ∈ allowlist; base_sha = live remote head
  G1: (_s, f) => {
    if (f.repoInAllowlist !== true) return fail('repo not in allowlist');
    if (!nonEmpty(f.baseSha) || !nonEmpty(f.remoteHeadSha)) return fail('base_sha/remote head not asserted');
    if (f.baseSha !== f.remoteHeadSha) return fail('base_sha is not the live remote head');
    return PASS;
  },
  // T2 — roles assigned; reviewer≠builder; gateway online
  G2: (_s, f) => {
    if (f.rolesAssigned !== true) return fail('roles not assigned');
    if (f.reviewerIsNotBuilder !== true) return fail('reviewer is the builder');
    if (f.gatewayOnline !== true) return fail('gateway offline');
    return PASS;
  },
  // T3 — PlanDoc schema; plan_hash computed
  G3: (_s, f) => {
    if (f.planDocSchemaValid !== true) return fail('PlanDoc fails schema');
    if (!nonEmpty(f.planHash)) return fail('plan_hash not computed');
    return PASS;
  },
  // T4 — feedback attached
  G4: (_s, f) => (f.feedbackAttached === true ? PASS : fail('no feedback attached')),
  // T5 — plan_hash match; scope paths canonical
  G5: (_s, f) => {
    if (!nonEmpty(f.planHash) || !nonEmpty(f.expectedPlanHash)) return fail('plan_hash not asserted');
    if (f.planHash !== f.expectedPlanHash) return fail('plan_hash mismatch');
    if (f.scopePathsCanonical !== true) return fail('scope paths not canonical');
    return PASS;
  },
  // T6 — typed subject bound
  G6: (_s, f) => (f.typedSubjectBound === true ? PASS : fail('no typed subject bound')),
  // T7 — bound to request id
  G7: (_s, f) => (nonEmpty(f.boundRequestId) ? PASS : fail('not bound to a request id')),
  // T8 — local commits exist
  G8: (_s, f) => (f.localCommitsExist === true ? PASS : fail('no local commits')),
  // T9 — evidence exists for head; push confirmed remote
  G9: (_s, f) => {
    if (f.evidenceExistsForHead !== true) return fail('no evidence for head');
    if (f.pushConfirmedRemote !== true) return fail('push not confirmed remote');
    return PASS;
  },
  // T10 — reviewed_sha == remote head; reviewer independent; ro workspace attested
  G10: (_s, f) => {
    if (!nonEmpty(f.reviewedSha) || !nonEmpty(f.remoteHeadSha)) return fail('reviewed_sha/remote head not asserted');
    if (f.reviewedSha !== f.remoteHeadSha) return fail('reviewed_sha is stale against remote head');
    if (f.reviewerIndependent !== true) return fail('reviewer not independent');
    if (f.readOnlyWorkspaceAttested !== true) return fail('read-only workspace not attested');
    return PASS;
  },
  // T11 — open blockers; sha unchanged
  G11: (_s, f) => {
    if (typeof f.openBlockers !== 'number' || f.openBlockers <= 0) return fail('no open blockers');
    if (f.shaUnchanged !== true) return fail('sha changed');
    return PASS;
  },
  // T12 — new head ≠ old head
  G12: (s, f) => {
    if (!nonEmpty(f.newHeadSha)) return fail('new head not asserted');
    if (f.newHeadSha === s.headSha) return fail('new head equals old head');
    return PASS;
  },
  // T13 — zero open blockers (or founder waivers); checks green at sha; evidence verified
  G13: (_s, f) => {
    const blockersClear = f.openBlockers === 0 || f.founderWaivers === true;
    if (!blockersClear) return fail('open blockers without founder waiver');
    if (!nonEmpty(f.checksGreenAtSha)) return fail('checks not green at an asserted sha');
    if (!nonEmpty(f.remoteHeadSha)) return fail('remote head not asserted');
    if (f.checksGreenAtSha !== f.remoteHeadSha) return fail('checks green at a stale sha');
    if (f.evidenceVerified !== true) return fail('evidence not verified');
    return PASS;
  },
  // T14 — summary assembled
  G14: (_s, f) => (f.summaryAssembled === true ? PASS : fail('summary not assembled')),
  // T15 — step-up fresh; authorized_sha == head == reviewed_sha; single-use
  G15: (s, f) => {
    if (f.stepUpFresh !== true) return fail('step-up authentication not fresh');
    if (!nonEmpty(f.authorizedSha) || !nonEmpty(f.remoteHeadSha) || !nonEmpty(f.reviewedSha)) {
      return fail('authorized_sha/head/reviewed_sha not asserted');
    }
    if (f.authorizedSha !== f.remoteHeadSha || f.authorizedSha !== f.reviewedSha) {
      return fail('authorized_sha != head != reviewed_sha (SHA-stale)');
    }
    // The asserted reviewed_sha must agree with the review the LEDGER actually
    // recorded, not merely with the other asserted facts. Without this, T18
    // clears `reviewedSha` and the room re-enters IN_REVIEW, from which
    // T13 -> T14 -> T15 can reach AUTHORIZED without T10 ever running again —
    // minting an authorization on caller-asserted facts alone, which is the
    // push-voids invariant (clause 3) failing open.
    if (s.reviewedSha === null) {
      return fail('no ledger-recorded review — T10 has not run since the review was voided');
    }
    if (s.reviewedSha !== f.reviewedSha) {
      return fail('asserted reviewed_sha does not match the ledger-recorded review');
    }
    const live = s.authorization;
    if (live !== null && !live.consumed && !live.voided) {
      return fail('an authorization is already outstanding (single-use)');
    }
    return PASS;
  },
  // T16 — webhook HMAC + GUID dedup + poll corroboration; merged head == authorized_sha
  G16: (s, f) => {
    if (f.webhookHmacValid !== true) return fail('webhook HMAC invalid');
    if (f.guidDeduped !== true) return fail('delivery GUID not deduplicated');
    if (f.pollCorroborated !== true) return fail('merge not corroborated by poll');
    const auth = s.authorization;
    if (auth === null) return fail('no Founder authorization on record');
    if (auth.voided) return fail('authorization voided');
    if (auth.consumed) return fail('authorization already consumed (single-use)');
    if (auth.round !== s.round) return fail('authorization is from a stale review round');
    if (!nonEmpty(f.mergedHeadSha)) return fail('merged head not asserted');
    if (f.mergedHeadSha !== auth.authorizedSha) return fail('merged head != authorized_sha');
    return PASS;
  },
  // T17 — evidence all verified or founder waiver
  G17: (_s, f) => {
    if (f.allEvidenceVerified === true || f.founderWaivers === true) return PASS;
    return fail('evidence incomplete and no founder waiver');
  },
  // T18 — unconditional voiding of stale review/auth (VOIDED records retained)
  //
  // The guard cell is literally "unconditional". T18 is the push-voids cascade
  // and one of the four core invariants: a guard here would be a condition
  // under which a stale authorization SURVIVES a push, which is the exact-SHA
  // control failing open. It passes by construction, deliberately.
  G18: () => PASS,
  // T19 — typed cause
  G19: (_s, f) => (nonEmpty(f.typedCause) ? PASS : fail('no typed cause')),
  // T20 — state verified consistent; and `manual_required` not set
  //       *(guard amended by Founder ruling 2026-08-15 — not the package's text)*
  G20: (s, f) => {
    if (f.stateVerifiedConsistent !== true) return fail('state not verified consistent');
    if (s.overlays.includes('manual_required')) {
      return fail('manual_required is set — T22 (founder.cancel) is the only exit');
    }
    if (s.priorState === null) return fail('no prior_state stored to resume to');
    return PASS;
  },
  // T21 — bounded retries spent — fail closed
  G21: (_s, f) => (f.boundedRetriesSpent === true ? PASS : fail('bounded retries not spent')),
  // T22 — running tasks cancelled or recorded unconfirmed_cancel
  G22: (_s, f) => {
    if (f.runningTasksCancelled === true || f.unconfirmedCancelRecorded === true) return PASS;
    return fail('running tasks neither cancelled nor recorded unconfirmed_cancel');
  },
};

const state = (s: State): Target => ({ kind: 'state', state: s });

export const TRANSITIONS: readonly TransitionSpec[] = [
  {
    id: 'T1', guard: 'G1', from: ['ROOM_CREATED'], target: state('SCOPED'),
    triggers: ['scope.captured'], conjunction: null, actors: ['founder'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'repo ∈ allowlist; base_sha = live remote head',
  },
  {
    id: 'T2', guard: 'G2', from: ['SCOPED'], target: state('PLANNING'),
    triggers: ['task.dispatched.planner'], conjunction: null, actors: ['system'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'roles assigned; reviewer≠builder; gateway online',
  },
  {
    id: 'T3', guard: 'G3', from: ['PLANNING'], target: state('PLAN_REVIEW'),
    triggers: ['plan.submitted'], conjunction: null, actors: ['agent.planner'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'PlanDoc schema; plan_hash computed',
  },
  {
    id: 'T4', guard: 'G4', from: ['PLAN_REVIEW'], target: state('PLANNING'),
    triggers: ['plan.revision_requested'], conjunction: null, actors: ['founder'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'feedback attached',
  },
  {
    id: 'T5', guard: 'G5', from: ['PLAN_REVIEW'], target: state('BUILDING'),
    triggers: ['plan.approved'], conjunction: null, actors: ['founder'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'plan_hash match; scope paths canonical',
  },
  {
    id: 'T6', guard: 'G6', from: ['BUILDING'], target: state('BLOCKED_ON_FOUNDER'),
    triggers: ['decision.requested', 'command.queued', 'ceiling.exceeded'],
    conjunction: null, actors: ['agent.builder', 'gateway', 'system'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'typed subject bound',
  },
  {
    id: 'T7', guard: 'G7', from: ['BLOCKED_ON_FOUNDER'], target: state('BUILDING'),
    triggers: ['decision.answered', 'command.approved', 'command.denied', 'ceiling.raised'],
    conjunction: null, actors: ['founder'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'bound to request id',
  },
  {
    id: 'T8', guard: 'G8', from: ['BUILDING'], target: state('EVIDENCE_CAPTURE'),
    triggers: ['build.ready_for_evidence'], conjunction: null, actors: ['agent.builder'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'local commits exist',
  },
  {
    id: 'T9', guard: 'G9', from: ['EVIDENCE_CAPTURE'], target: state('PUSHED'),
    triggers: ['git.pushed', 'pr.draft_created'],
    conjunction: ['git.pushed', 'pr.draft_created'], actors: ['gateway'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'evidence exists for head; push confirmed remote',
  },
  {
    id: 'T10', guard: 'G10', from: ['PUSHED'], target: state('IN_REVIEW'),
    triggers: ['review.opened'], conjunction: null, actors: ['system'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'reviewed_sha == remote head; reviewer independent; ro workspace attested',
  },
  {
    id: 'T11', guard: 'G11', from: ['IN_REVIEW'], target: state('REMEDIATION'),
    triggers: ['review.blocked'], conjunction: null, actors: ['system'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'open blockers; sha unchanged',
  },
  {
    id: 'T12', guard: 'G12', from: ['REMEDIATION'], target: state('EVIDENCE_CAPTURE'),
    triggers: ['remediation.complete'], conjunction: null, actors: ['agent.builder'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'new head ≠ old head',
  },
  {
    id: 'T13', guard: 'G13', from: ['IN_REVIEW'], target: state('CHECKS_VERIFIED'),
    triggers: ['review.passed', 'checks.verified'],
    conjunction: ['review.passed', 'checks.verified'], actors: ['system'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'zero open blockers (or founder waivers); checks green at sha; evidence verified',
  },
  {
    id: 'T14', guard: 'G14', from: ['CHECKS_VERIFIED'], target: state('AWAITING_FOUNDER_AUTH'),
    triggers: ['readiness.presented'], conjunction: null, actors: ['system'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'summary assembled',
  },
  {
    id: 'T15', guard: 'G15', from: ['AWAITING_FOUNDER_AUTH'], target: state('AUTHORIZED'),
    triggers: ['founder.authorization.granted'], conjunction: null, actors: ['founder'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'step-up fresh; authorized_sha == head == reviewed_sha; single-use',
  },
  {
    id: 'T16', guard: 'G16', from: ['AUTHORIZED'], target: state('MERGE_CONFIRMED'),
    triggers: ['merge.confirmed'], conjunction: null, actors: ['github+system'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'webhook HMAC + GUID dedup + poll corroboration; merged head == authorized_sha',
  },
  {
    id: 'T17', guard: 'G17', from: ['MERGE_CONFIRMED'], target: state('CLOSED_DELIVERED'),
    triggers: ['build.closed'], conjunction: null, actors: ['system'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'evidence all verified or founder waiver',
  },
  {
    // `{PUSHED..AUTHORIZED}` resolved through canonical declaration order —
    // exactly six states (Founder Ruling, 2026-08-15, ruling 2).
    id: 'T18', guard: 'G18', from: range('PUSHED', 'AUTHORIZED'), target: state('IN_REVIEW'),
    triggers: ['git.push.voided'], conjunction: null, actors: ['system'],
    setsOverlay: null, incrementsRound: true,
    guardText: 'unconditional voiding of stale review/auth (VOIDED records retained)',
  },
  {
    // "any non-terminal" EXCLUDING the current state — bars the
    // RECONCILING -> RECONCILING self-loop (ruling 2).
    id: 'T19', guard: 'G19', from: anyNonTerminalExcluding('RECONCILING'),
    target: state('RECONCILING'),
    triggers: ['recon.opened'], conjunction: null, actors: ['system'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'typed cause',
  },
  {
    id: 'T20', guard: 'G20', from: ['RECONCILING'], target: { kind: 'prior_state' },
    triggers: ['recon.resumed'], conjunction: null, actors: ['system'],
    setsOverlay: null, incrementsRound: false,
    guardText:
      'state verified consistent; and `manual_required` not set ' +
      '*(guard amended by Founder ruling below — not the package’s text)*',
  },
  {
    // The overlay annotates RECONCILING; the room does not leave the state.
    id: 'T21', guard: 'G21', from: ['RECONCILING'], target: state('RECONCILING'),
    triggers: ['recon.exhausted'], conjunction: null, actors: ['system'],
    setsOverlay: 'manual_required', incrementsRound: false,
    guardText: 'bounded retries spent — fail closed',
  },
  {
    id: 'T22', guard: 'G22', from: anyNonTerminalExcluding('CLOSED_ABANDONED'),
    target: state('CLOSED_ABANDONED'),
    triggers: ['founder.cancel'], conjunction: null, actors: ['founder'],
    setsOverlay: null, incrementsRound: false,
    guardText: 'running tasks cancelled or recorded unconfirmed_cancel',
  },
];

const TRANSITION_INDEX: ReadonlyMap<TransitionId, TransitionSpec> = new Map(
  TRANSITIONS.map((t) => [t.id, t]),
);

export function transition(id: TransitionId): TransitionSpec {
  const spec = TRANSITION_INDEX.get(id);
  if (spec === undefined) {
    throw new RangeError(`not a transition: ${String(id)}`);
  }
  return spec;
}
