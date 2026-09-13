/**
 * A1 — provider-free planner admission fixture (Background-Agents work
 * package A, first slice). FIXTURE ONLY — see docs/planner-admission-fixture.md.
 *
 * Commission: FOUNDER COMMISSION — BACKGROUND-AGENT ADAPTATION: A0 / A1 ONLY
 * (2026-09-12) over BR-Builder-Background-Agents-Handoff-r2.md (PROCEED-WITH-PLAN
 * plan review). Three-file scope; this module is NOT exported from any
 * package index and is not wired to any CLI, production runner,
 * control-plane route, Gateway, or provider adapter.
 *
 * What this is: a test harness that composes a fixture policy verdict with
 * the REAL existing cost meter (`@build-room/cost-meter` evaluateDispatch)
 * in front of an injected FAKE invocation, proving both refusal gates can
 * independently prevent invocation.
 *
 * What this is NOT: a production Planner admission path. `fixture: true`
 * marks every result. `completed` means the fake callback completed —
 * never that a production command or phase completed. `trace` is an
 * in-memory test trace, not an audit journal or durability receipt.
 * A synthetic positive policy verdict must always carry
 * source: 'synthetic-fixture' — it is test authority, never a production
 * grant.
 */

import {
  evaluateDispatch,
  type DispatchDecision,
  type DispatchRequest,
} from '../../cost-meter/src/index.js';

/** A fixture policy verdict. `source` labels real-registry vs synthetic authority. */
export interface FixturePolicyVerdict {
  readonly allowed: boolean;
  readonly source: 'registry' | 'synthetic-fixture';
  readonly reason: string;
}

/** Injected dependencies: a policy callback and the fake invocation. */
export interface AdmissionFixtureDeps {
  readonly policy: () => FixturePolicyVerdict;
  readonly invokeFixture: () => Promise<void>;
}

/** The result of one fixture admission attempt. */
export interface AdmissionFixtureResult {
  readonly fixture: true;
  readonly policy: FixturePolicyVerdict;
  readonly cost: DispatchDecision;
  readonly outcome: 'refused' | 'completed' | 'failed';
  readonly trace: readonly string[];
}

/**
 * Run one provider-free admission attempt:
 *
 * 1. evaluate the fixture policy verdict;
 * 2. evaluate the REAL cost meter;
 * 3. preserve BOTH decisions in the result;
 * 4. refuse invocation when either gate refuses;
 * 5. invoke ONLY the injected fake callback when both permit.
 *
 * Policy or meter exceptions propagate (they are bugs in the test seam or
 * the meter, not admission outcomes) and always propagate BEFORE
 * invocation. An exception thrown by the fake invocation itself is an
 * explicit `failed` result; the raw error text is deliberately NOT
 * serialized into the result.
 */
export async function runPlannerAdmissionFixture(
  request: DispatchRequest,
  deps: AdmissionFixtureDeps,
): Promise<AdmissionFixtureResult> {
  const policy = deps.policy();
  const cost = evaluateDispatch(request);
  const trace: string[] = ['policy_evaluated', 'cost_evaluated'];

  if (!policy.allowed || !cost.permit) {
    return { fixture: true, policy, cost, outcome: 'refused', trace };
  }

  trace.push('fixture_invoked');
  try {
    await deps.invokeFixture();
    return { fixture: true, policy, cost, outcome: 'completed', trace };
  } catch {
    // Deliberately opaque: no error message, name, or stack is copied into
    // the result — an invocation failure is reported as `failed` only.
    return { fixture: true, policy, cost, outcome: 'failed', trace };
  }
}
