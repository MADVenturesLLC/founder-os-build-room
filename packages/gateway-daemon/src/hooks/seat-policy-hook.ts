/**
 * Seat-registry policy with teeth (OMP→MAD Evolve Pack v0, Lane D).
 *
 * Seat Registry V1.1 shipped `createSeatPolicyGate` as a pure, unwired
 * evaluator: it REFUSES, but nothing consumed the refusal. This pre-hook
 * consumes it. A refused seat resolution is a `block`, and the interceptor
 * never invokes the dispatcher for a blocked call — so a registry deny now
 * prevents dispatch rather than being logged beside it.
 *
 * Under the production binding the V1 resolver returns `resolved` for no
 * seat (no standing route exists in V1), so every seat-bound call is
 * blocked; `allowed` is reachable only through the gate's test seam. That
 * is the intended state of the world until a Founder act stands a lane up.
 *
 * Import boundary: this module declares the `SeatDispatchGate` contract and
 * imports nothing from `packages/control-plane`. The V1.1 gate
 * (`createSeatPolicyGate` in `packages/control-plane/src/seat-policy.ts`)
 * satisfies the contract structurally and is SUPPLIED by whoever composes
 * the interceptor — today only the test suite, which binds the real gate
 * over the real V1 resolver. The daemon package therefore takes no
 * dependency edge onto the control-plane workspace member, declared or
 * undeclared (advisory review finding on PR #36, taken).
 */

import type { PreHook, PreHookDecision, ToolCall } from './tool-call-hooks.js';

/** The slice of the V1.1 gate this hook needs; structurally satisfied by `SeatPolicyGate`. */
export interface SeatDispatchGate {
  evaluateDispatch(request: { seat_id: string; lane_label?: string; authorization_ref?: string }):
    | { readonly kind: 'refused'; readonly refusal: string; readonly reason: string }
    | { readonly kind: 'allowed' };
}

export const SEAT_HOOK_CODES = {
  seat_unbound: 'seat_unbound',
  seat_policy_refused: 'seat_policy_refused',
} as const;

/**
 * Build the hook over a supplied gate. There is deliberately no default:
 * a composition root must name the gate it binds (production: the V1.1
 * `createSeatPolicyGate()` with no options), so the binding is visible at
 * the call site rather than hidden in a cross-package default.
 */
export function seatPolicyHook(gate: SeatDispatchGate, name = 'seat-policy'): PreHook {
  if (gate === null || typeof gate !== 'object' || typeof gate.evaluateDispatch !== 'function') {
    throw new TypeError('seatPolicyHook requires a SeatDispatchGate; there is no default binding');
  }
  return {
    name,
    run(call: ToolCall): PreHookDecision {
      if (call.seat_id === null) {
        return { decision: 'block', code: SEAT_HOOK_CODES.seat_unbound, reason: 'a tool call bound to no seat is not dispatched' };
      }
      const request: { seat_id: string; authorization_ref?: string } = { seat_id: call.seat_id };
      if (call.authorization_ref !== null) request.authorization_ref = call.authorization_ref;
      const decision = gate.evaluateDispatch(request);
      if (decision.kind === 'refused') {
        return { decision: 'block', code: `${SEAT_HOOK_CODES.seat_policy_refused}:${decision.refusal}`, reason: decision.reason };
      }
      return { decision: 'allow' };
    },
  };
}
