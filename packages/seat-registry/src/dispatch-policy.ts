/**
 * Seat Registry V1 — dispatch policy (§4, §4.1, §4.2, §4.3).
 *
 * Exported data and a pure transition function. This module dispatches
 * nothing, contacts no provider, and writes no journal element (r7 §4.1).
 *
 * Retries and lane failovers do not create new journal event vocabulary and
 * are not hidden redispatches inside an existing command record:
 *   - each retry or failover is a distinct governed command record (a new
 *     command_id under the eleven-element contract);
 *   - correlation runs through the existing bindings only — room, run,
 *     execution, repository and governed scope, and the governing authorization;
 *   - each command_id may be dispatched at most once ("dispatched at most once,
 *     only after journaled");
 *   - retries are bounded at two per deployment within one execution,
 *     per DEC-20260716-02 item 5 — its sole source;
 *   - at most one lawful failover, which must change surface_id or model_id.
 */

import type { SeatId } from './vocabulary.js';

/** §4 clause 7 — DEC-20260720-03 item 4, ELIGIBLE — the only failover triggers. */
export const FAILOVER_ELIGIBLE_TRIGGERS = [
  'provider timeout after the approved attempt policy',
  'provider 5xx or declared outage',
  'quota/rate-limit exhaustion',
  'temporary model unavailability',
] as const;

/** §4 clause 7 — DEC-20260720-03 item 4, INELIGIBLE — must NOT invoke the fallback. */
export const FAILOVER_INELIGIBLE_TRIGGERS = [
  'a disliked answer',
  'disagreement with the primary',
  'a lower price preference',
  'routing experimentation',
  'a prompt-quality failure',
  'a policy refusal',
] as const;

export type FailoverEligibleTrigger = (typeof FAILOVER_ELIGIBLE_TRIGGERS)[number];
export type FailoverIneligibleTrigger = (typeof FAILOVER_INELIGIBLE_TRIGGERS)[number];

export interface DispatchPolicyV1 {
  readonly transport_retries_max: 2; // DEC-20260716-02 item 5 — sole source; per deployment, within one execution (§4.1)
  readonly lane_failovers_max: 1; // primary -> next lawful lane, ONCE
  readonly failover_eligible_triggers: typeof FAILOVER_ELIGIBLE_TRIGGERS;
  readonly failover_ineligible_triggers: typeof FAILOVER_INELIGIBLE_TRIGGERS;
}

export const DISPATCH_POLICY: DispatchPolicyV1 = {
  transport_retries_max: 2,
  lane_failovers_max: 1,
  failover_eligible_triggers: FAILOVER_ELIGIBLE_TRIGGERS,
  failover_ineligible_triggers: FAILOVER_INELIGIBLE_TRIGGERS,
};

/**
 * §4 — DispatchOutcome kinds map totally onto the contract §5 closed
 * vocabulary. The kind names stay prefixed because `completed` is taken by §5
 * with different membership. `failed_over` is not an outcome kind and not a
 * new event: a failover produces a new command_id.
 */
export type DispatchOutcome =
  | { kind: 'seat_completed'; lane_label: string } // -> §5 `completed`
  | { kind: 'seat_failed'; last_error_class: 'shed' | 'auth' | 'transport' | 'other' } // -> §5 `failed`; only on determinate failure or affirmative no-effect evidence (§4.2)
  | { kind: 'seat_unresolved'; reason: string }; // -> §5 `unresolved`; the transport-uncertainty case (§4.2)

const CONTRACT_5_EVENTS = ['journaled', 'identity_bound', 'dispatched', 'completed', 'failed', 'unresolved', 'resolved'] as const;

/**
 * §4 — outcome-to-§5 mapping, total: an exhaustive switch that fails
 * compilation if a fourth outcome kind is added without a mapping, and throws
 * at runtime if it is ever reached via an untyped caller.
 */
export function contractEventForOutcome(outcome: DispatchOutcome): (typeof CONTRACT_5_EVENTS)[number] {
  switch (outcome.kind) {
    case 'seat_completed':
      return 'completed';
    case 'seat_failed':
      return 'failed';
    case 'seat_unresolved':
      return 'unresolved';
    default: {
      const exhaust: never = outcome;
      throw new Error(`unmapped dispatch outcome kind: ${String(exhaust)}`);
    }
  }
}

/** §4 clause 3 — the contract's ordering invariant: dispatched at most once, only after journaled. */
export const DISPATCH_AT_MOST_ONCE = 'dispatched at most once, only after journaled';

/* ------------------------------------------------------------------ */
/* §4.1 retry budget — pure transition function (r7 test 12)            */
/* ------------------------------------------------------------------ */

/** The existing correlation tuple — a derived key, never a journal element. */
export interface RetryFamilyKey {
  readonly room: string;
  readonly run: string;
  readonly execution: string;
  readonly repository_scope: string;
  readonly authorization: string;
}

/** Exact deployment identity within the family — derived, never persisted as a journal element. */
export interface DeploymentBucket {
  readonly seat_id: SeatId;
  readonly lane_label: string;
  readonly surface_id: string;
  readonly model_id: string;
  readonly mode: string | null;
}

export interface RetryBudgetState {
  readonly family: RetryFamilyKey;
  readonly consumed: Readonly<Record<string, 0 | 1 | 2>>; // keyed by a canonical serialization of DeploymentBucket
  readonly exhausted: readonly string[]; // bucket keys at 2; never removed within the execution
  readonly failovers_used: 0 | 1;
  readonly pending_unknown_outcome: boolean; // blocks retry and failover until reconciled
  readonly closed: boolean; // set by `completed`; nothing reopens it
}

export type RetryBudgetEvent =
  | { kind: 'initial_dispatch'; bucket: DeploymentBucket }
  | { kind: 'transport_failure'; bucket: DeploymentBucket; trigger: string }
  | { kind: 'retry_request'; bucket: DeploymentBucket }
  | { kind: 'failover_request'; from: DeploymentBucket; to: DeploymentBucket; trigger: string }
  | { kind: 'lost_response_replay'; bucket: DeploymentBucket; idempotency_key: string } // same logical command; consumes nothing
  | { kind: 'unknown_outcome' }
  | { kind: 'reconciled' }
  | { kind: 'completed' };

export interface RetryBudgetDecision {
  readonly state: RetryBudgetState;
  readonly allowed: boolean;
  readonly reason: string;
}

/** Canonical serialization of a deployment bucket (the consumed-map key). */
export function canonicalBucketKey(bucket: DeploymentBucket): string {
  return [
    bucket.seat_id,
    bucket.lane_label,
    bucket.surface_id,
    bucket.model_id,
    bucket.mode ?? '',
  ].join('|');
}

function isEligibleFailoverTrigger(trigger: string): boolean {
  return (FAILOVER_ELIGIBLE_TRIGGERS as readonly string[]).includes(trigger);
}

export function retryBudgetTransition(
  state: RetryBudgetState,
  event: RetryBudgetEvent,
): RetryBudgetDecision {
  if (state.closed) {
    return {
      state,
      allowed: false,
      reason: 'the execution is closed by a completed outcome; nothing reopens it',
    };
  }

  switch (event.kind) {
    case 'initial_dispatch': {
      return {
        state,
        allowed: true,
        reason: 'initial dispatch — consumes no retry',
      };
    }
    case 'transport_failure': {
      // records a failure; the retry decision is made on the retry_request
      return {
        state,
        allowed: true,
        reason: 'transport failure recorded',
      };
    }
    case 'retry_request': {
      if (state.pending_unknown_outcome) {
        return {
          state,
          allowed: false,
          reason: 'unknown_outcome pending — retry is prohibited until reconciliation; a new command_id never bypasses it',
        };
      }
      const key = canonicalBucketKey(event.bucket);
      const consumed = (state.consumed[key] ?? 0) as 0 | 1 | 2;
      if (consumed >= 2) {
        return {
          state,
          allowed: false,
          reason: `deployment ${key} has exhausted its two-retry budget; the counter never resets within this execution`,
        };
      }
      const newConsumed = (consumed + 1) as 1 | 2;
      const nextState: RetryBudgetState = {
        ...state,
        consumed: {
          ...state.consumed,
          [key]: newConsumed,
        },
        exhausted: newConsumed === 2 ? [...state.exhausted, key] : state.exhausted,
      };
      return {
        state: nextState,
        allowed: true,
        reason: `retry dispatched as a new command_id; retries consumed for ${key}: ${newConsumed}`,
      };
    }
    case 'failover_request': {
      if (state.pending_unknown_outcome) {
        return {
          state,
          allowed: false,
          reason: 'unknown_outcome pending — failover is prohibited until reconciliation; a new command_id never bypasses it',
        };
      }
      if (state.failovers_used >= 1) {
        return {
          state,
          allowed: false,
          reason: 'at most one lawful failover per execution',
        };
      }
      const sameIdentity =
        event.from.surface_id === event.to.surface_id && event.from.model_id === event.to.model_id;
      if (sameIdentity) {
        return {
          state,
          allowed: false,
          reason:
            'a lawful failover must change surface_id or model_id; a change of mode or lane_label alone is not a lawful failover and does not open a new retry budget',
        };
      }
      if (!isEligibleFailoverTrigger(event.trigger)) {
        return {
          state,
          allowed: false,
          reason: `failover trigger ${JSON.stringify(event.trigger)} is not on the DEC-20260720-03 item 4 ELIGIBLE list`,
        };
      }
      const nextState: RetryBudgetState = {
        ...state,
        failovers_used: 1,
      };
      return {
        state: nextState,
        allowed: true,
        reason:
          'lawful failover: new command_id, family bindings retained, new deployment bucket begins with zero retries consumed',
      };
    }
    case 'lost_response_replay': {
      // same logical command under its idempotency key; consumes nothing,
      // opens no bucket, changes no counter, is never a retry or failover
      return {
        state,
        allowed: true,
        reason: `lost-response replay under idempotency key ${event.idempotency_key} — resolves to the same logical command; consumes no retry`,
      };
    }
    case 'unknown_outcome': {
      return {
        state: { ...state, pending_unknown_outcome: true },
        allowed: true,
        reason:
          'unknown_outcome classification recorded; retry and failover now blocked until reconciled',
      };
    }
    case 'reconciled': {
      return {
        state: { ...state, pending_unknown_outcome: false },
        allowed: true,
        reason: 'unknown_outcome reconciled',
      };
    }
    case 'completed': {
      return {
        state: { ...state, closed: true },
        allowed: true,
        reason: 'execution completed; closed',
      };
    }
    default: {
      const exhaust: never = event;
      throw new Error(`unhandled retry budget event: ${String(exhaust)}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* §4.2 transport uncertainty                                           */
/* ------------------------------------------------------------------ */

/**
 * §4.2 — for a transport failure without affirmative evidence that the
 * attempted command had no effect, the result is `seat_unresolved`, never
 * `seat_failed`. Retry and failover are prohibited until the internal
 * `unknown_outcome` classification is reconciled (§4.1).
 */
export function classifyTransportFailure(hasAffirmativeNoEffectEvidence: boolean): DispatchOutcome {
  if (hasAffirmativeNoEffectEvidence) {
    return { kind: 'seat_failed', last_error_class: 'transport' };
  }
  return {
    kind: 'seat_unresolved',
    reason: 'transport failure without affirmative no-effect evidence',
  };
}

/* ------------------------------------------------------------------ */
/* §4.3 dispatch-path obligations carried as data (r7 test 12(v))       */
/* ------------------------------------------------------------------ */

export const DISPATCH_PATH_OBLIGATIONS: readonly string[] = [
  'DEC-20260716-02 item 5 (remaining): malformed structured output receives exactly one corrective re-ask before the execution fails, preserving the malformed payload for audit',
  'DEC-20260716-02 item 5 (remaining): context overflow fails explicitly rather than silently truncating governance-relevant input',
  'DEC-20260716-02 item 5 (remaining): a privacy-policy conflict always overrides availability, cost and quality and fails closed',
  'DEC-20260716-02 item 5 (remaining): a budget-policy conflict may degrade to a cheaper compliant binding within the same data class or halt and escalate, never forcing a class crossing',
  'DEC-20260716-02 item 5 (remaining): exhausting a role\'s approved tier takes that role visibly offline in its audit record and to the Founder rather than substituting an unapproved model',
  'DEC-20260716-02 item 5 (remaining): each retry is logged with its reason',
  'DEC-20260815-16 clause 2: per-dispatch spend gating — dispatch refuses when spent + reserved >= the room\'s token ceiling',
  'DEC-20260815-09 clause 2: per-dispatch spend gating — a per-run hard cap enforced by the Gateway',
  'DEC-20260807-01 §4.1: every governed task keeps work size, review binding and stable role separate; uncertain classification defaults upward; only the Founder may authorize a downgrade',
  'DEC-20260807-01 §3.4: "No unavailable model, provider, surface, or effort level may be silently substituted. A task pauses or uses an already approved alternative, with the reason and replacement recorded."',
] as const;

export function isDispatch(event: { kind: string }): boolean {
  return event.kind === 'initial_dispatch' || event.kind === 'retry_request' || event.kind === 'failover_request';
}

export const MP1_STATEMENT = 'MP-1 remains approved but inactive.';
