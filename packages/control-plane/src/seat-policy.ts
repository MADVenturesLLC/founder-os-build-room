/**
 * Seat Registry V1.1 — the seat policy gate (control-plane integration boundary).
 *
 * Controlling specification: docs/planning/seat-registry-v1/
 * seat-registry-v1.1-non-activating-integration-plan-DRAFT.md
 * (sha256 85bfe268fc571a3ec71c15243d4df44a953fd5e2340763a92ae51072dfa412eb),
 * section 5. Companion artifact:
 * seat-registry-v1.1-authority-and-closure-matrix.md
 * (sha256 95634527fcd5ca91d412c0a263898b3c90ed1ff075925224a84f68dbdb277b65).
 *
 * A PURE, UNWIRED module. It:
 * - imports only the Seat Registry V1 public entry point and node:* builtin
 *   type utilities (the single-entry rule, plan §5.2 / F1);
 * - evaluates seat policy for a proposed dispatch by calling the bound
 *   resolver (default: the real `resolveSeat`);
 * - delegates retry/failover/replay decisions to `retryBudgetTransition`
 *   (the DispatchPolicyV1 binding) and the distinctness predicate to
 *   `isDistinctReviewLane`;
 * - mints NO command_id (the future dispatch path owns minting under the
 *   journal contract; the gate only states the obligation, plan §5.1);
 * - performs NO I/O beyond what `resolveSeat` itself performs (contract and
 *   fixture reads inside the seat-registry package);
 * - writes NOTHING, reads NO environment, opens NO socket, and is NOT wired
 *   into any route, journal, migration, CLI, or counted-run surface (plan
 *   §5.1, §3.3).
 *
 * Integration vs activation (plan §3.3): this gate EVALUATES policy and
 * REFUSES. It does not EXECUTE anything. With the production binding its only
 * positive decision — `allowed` on a `resolved` seat resolution — is
 * unreachable, because the V1 registry never returns `resolved` (plan F2);
 * it is reachable only through the test seam.
 */

import {
  DISPATCH_AT_MOST_ONCE,
  DISPATCH_PATH_OBLIGATIONS,
  DISPATCH_POLICY,
  MP1_STATEMENT,
  isDistinctReviewLane,
  resolveSeat,
  retryBudgetTransition,
  type DispatchPolicyV1,
  type RefusalClass,
  type ResolvedSeat,
  type RetryBudgetDecision,
  type RetryBudgetEvent,
  type RetryBudgetState,
  type SeatResolution,
  type SeatRoutingLane,
  type SeatRegistrationV1,
} from '../../seat-registry/src/index.js';
import type { LaneReadiness } from '../../seat-registry/src/index.js';

/**
 * A proposed dispatch, presented by an untrusted caller. Authority claims are
 * never trusted: `lane_label` and `authorization_ref` are reference material
 * only, never adjudicated evidence (the handoff.ts rule applied to dispatch,
 * plan §5.3 steps 1–2). A `temporary_task_assignment`-flavored
 * authorization_ref is forwarded to the resolver, which refuses it under
 * `temporary_task_assignment_not_lane_authority` (plan §3.2, T12(d)).
 */
export interface DispatchRequest {
  /** Any string; validated by the gate (malformed input refuses structured). */
  seat_id: string;
  /** Optional claim; never trusted as authority. */
  lane_label?: string;
  /** Reference only; never adjudicated (handoff.ts rule). */
  authorization_ref?: string;
}

/**
 * The gate's decision (plan §5.1). The `allowed` branch is reachable only via
 * a resolver that returns `resolved` — the production resolver never does.
 */
export type SeatPolicyDecision =
  | {
      kind: 'refused';
      allowed: false;
      seat_id: string;
      /** The RefusalClass, or 'malformed_request' for unparseable input. */
      refusal: RefusalClass | 'malformed_request';
      /** The resolver's named reason, verbatim (or the gate's own for malformed input). */
      reason: string;
      /** The Founder act a lane needs, when the resolver names one. */
      requirement: string | null;
      /** The seat's own registration, when the seat exists. */
      registration: SeatRegistrationV1 | null;
      /** Per-lane readiness from the resolver; empty for unknown seats. */
      readiness: readonly LaneReadiness[];
      /** MP-1 status, carried on every decision (plan §5.4, R5). */
      mp1: string;
    }
  | {
      kind: 'allowed';
      allowed: true;
      registration: SeatRegistrationV1;
      readiness: readonly LaneReadiness[];
      /** Records the seam provenance; the production binding never reaches this. */
      note: string;
      mp1: string;
    };

/**
 * The retry-budget decision plus the command_id discipline (plan §5.4): a
 * retry or failover is a NEW command_id (a distinct governed command record);
 * a lost_response_replay is the SAME logical command (no new id, no
 * consumption). The gate mints no id — it states the obligation.
 */
export interface RetryDecision extends RetryBudgetDecision {
  readonly requires_new_command_id: boolean;
  readonly dispatch_at_most_once: typeof DISPATCH_AT_MOST_ONCE;
  readonly obligations: typeof DISPATCH_PATH_OBLIGATIONS;
  readonly mp1: typeof MP1_STATEMENT;
}

/** Alias for intent at the failover call site; identical shape. */
export type FailoverDecision = RetryDecision;

/** The resolver contract — injectable ONLY as a test seam (plan §5.1, R3). */
export type SeatResolver = (seatId: string) => SeatResolution;

export interface SeatPolicyGateOptions {
  /** Default: the real resolveSeat. Production wiring passes NO options. */
  resolve?: SeatResolver;
  /** Default: DISPATCH_POLICY. Injectable for policy-data assertions only. */
  policy?: DispatchPolicyV1;
}

export interface SeatPolicyGate {
  evaluateDispatch(request: DispatchRequest): SeatPolicyDecision;
  decideRetry(state: RetryBudgetState, event: RetryBudgetEvent): RetryDecision;
  decideFailover(state: RetryBudgetState, event: RetryBudgetEvent): FailoverDecision;
  /** A lost-response replay resolves to the SAME logical command. */
  decideReplay(state: RetryBudgetState, event: RetryBudgetEvent): RetryDecision;
  policy(): DispatchPolicyV1;
  assertReviewDistinctness(implementationModelId: string, reviewLane: SeatRoutingLane): boolean;
}

/** The name of the field a malformed request is refused by. */
function malformedFieldReason(request: unknown): string | null {
  if (request === null || typeof request !== 'object') {
    return 'the request is not an object; seat_id is required';
  }
  const candidate = request as Record<string, unknown>;
  if (typeof candidate.seat_id !== 'string') {
    return 'seat_id must be a string';
  }
  return null;
}

/** True when an authorization_ref presents a temporary task assignment (plan T12(d)). */
function presentsTemporaryTaskAssignment(request: DispatchRequest): boolean {
  const ref = request.authorization_ref;
  return typeof ref === 'string' && /temporary[-_ ]?task[-_ ]?assignment/i.test(ref);
}

/**
 * Create the seat policy gate. Production wiring constructs it with NO
 * options; the seams exist for the positive-control tests only (plan §5.1,
 * R3, T5/T12(c)).
 */
export function createSeatPolicyGate(options?: SeatPolicyGateOptions): SeatPolicyGate {
  const resolve = options?.resolve ?? ((seatId: string) => resolveSeat(seatId));
  const policyData = options?.policy ?? DISPATCH_POLICY;

  function evaluateDispatch(request: DispatchRequest): SeatPolicyDecision {
    // Step 1 — malformed input refuses STRUCTURED, naming the field; never
    // throws (the validateHandoff S1 discipline, plan §5.3/F7).
    const malformed = malformedFieldReason(request);
    if (malformed !== null) {
      return {
        kind: 'refused',
        allowed: false,
        seat_id: '',
        refusal: 'malformed_request',
        reason: malformed,
        requirement: null,
        registration: null,
        readiness: [],
        mp1: MP1_STATEMENT,
      };
    }

    // Step 2 — the caller's claims are never trusted as authority. The gate
    // re-derives the resolution from the bound resolver every time; there is
    // no API surface by which a caller presents a resolution (plan T12(a)).
    // A temporary task assignment offered as the authorization_ref is
    // evaluated by the CANONICAL registry resolver (resolveSeat with
    // presented_authority) DIRECTLY — it is not forwarded through the
    // injectable one-argument test resolver seam, whose signature cannot
    // carry presented authority. The canonical resolver refuses presented
    // authority under temporary_task_assignment_not_lane_authority
    // regardless of seat, so this branch preserves fail-closed registry
    // behavior under every resolver binding (plan §3.2, T12(d)).
    const resolution = presentsTemporaryTaskAssignment(request)
      ? resolveSeat(request.seat_id, {
          presented_authority: { kind: 'temporary-task-assignment', assignment_ref: request.authorization_ref ?? '' },
        })
      : resolve(request.seat_id);

    if (resolution.kind === 'refused') {
      return {
        kind: 'refused',
        allowed: false,
        seat_id: resolution.seat_id,
        refusal: resolution.refusal,
        reason: resolution.reason,
        requirement: resolution.requirement,
        registration: resolution.registration,
        readiness: resolution.readiness,
        mp1: MP1_STATEMENT,
      };
    }

    // Step 4 — `resolved` maps to allowed. Unreachable under the production
    // binding (plan F2); the note records the seam provenance.
    return {
      kind: 'allowed',
      allowed: true,
      registration: resolution.registration,
      readiness: resolution.readiness,
      note: 'test seam resolution — the production resolver never returns resolved',
      mp1: MP1_STATEMENT,
    };
  }

  function budgetDecision(decision: RetryBudgetDecision, event: RetryBudgetEvent): RetryDecision {
    const requiresNewId =
      event.kind === 'retry_request' || event.kind === 'failover_request' ? true : false;
    return {
      ...decision,
      requires_new_command_id: requiresNewId,
      dispatch_at_most_once: DISPATCH_AT_MOST_ONCE,
      obligations: DISPATCH_PATH_OBLIGATIONS,
      mp1: MP1_STATEMENT,
    };
  }

  return {
    evaluateDispatch,
    decideRetry(state: RetryBudgetState, event: RetryBudgetEvent): RetryDecision {
      return budgetDecision(retryBudgetTransition(state, event), event);
    },
    decideFailover(state: RetryBudgetState, event: RetryBudgetEvent): FailoverDecision {
      return budgetDecision(retryBudgetTransition(state, event), event);
    },
    decideReplay(state: RetryBudgetState, event: RetryBudgetEvent): RetryDecision {
      return budgetDecision(retryBudgetTransition(state, event), event);
    },
    policy(): DispatchPolicyV1 {
      return policyData;
    },
    assertReviewDistinctness(implementationModelId: string, reviewLane: SeatRoutingLane): boolean {
      // The predicate, delegated verbatim. The gate records nothing about any
      // actual review (plan §5.5).
      return isDistinctReviewLane(implementationModelId, reviewLane);
    },
  };
}

export type { SeatResolution, ResolvedSeat };

/**
 * Re-exported Seat Registry V1 data and types (plan §5.2): downstream
 * consumers never deep-import seat-registry modules — the single-entry rule
 * is enforced by the static test (T11).
 */
export {
  DISPATCH_AT_MOST_ONCE,
  DISPATCH_PATH_OBLIGATIONS,
  DISPATCH_POLICY,
  MP1_STATEMENT,
};
export type {
  DispatchPolicyV1,
  RetryBudgetEvent,
  RetryBudgetState,
  SeatRoutingLane,
  SeatRegistrationV1,
  LaneReadiness,
};
