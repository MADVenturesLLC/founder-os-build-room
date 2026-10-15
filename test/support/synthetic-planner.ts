/**
 * A synthetic Planner for the planner-loop suites — the Phase 4
 * authorization §6 allows "fixtures and synthetic provider behavior required
 * for deterministic testing". It contacts nothing. Each behaviour is set per
 * case, and every call is recorded so a case can prove what was (and was
 * not) asked of the Planner.
 */

import type { ExecutionIdentity } from '../../packages/madbridge-consumed/src/adapter/adapter-v1.js';
import type {
  ObservedRoute,
  PlannerDispatchReceipt,
  PlannerPort,
  PlannerResult,
  PlannerWork,
} from '../../packages/control-plane/src/planner-loop.js';

export const SYNTHETIC_ROUTE: ObservedRoute = {
  provider: 'example-provider',
  model: 'example-model',
  executionSurface: 'claude-code',
};

/** A ready PlanDoc for the work, inside its captured repository, base and scope. */
export function readyPlanFor(work: PlannerWork, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 'plandoc/1',
    work_id: `W-${work.commandId.slice(-8)}`,
    objective: work.revision === undefined ? 'Add a health detail field.' : 'Add a narrower health detail field.',
    terminal_status: 'PLAN_READY_FOR_FOUNDER_APPROVAL',
    controlling_inputs: [{ path: 'research/packet.md', sha256: 'b'.repeat(64) }],
    repository: work.repository,
    base_sha: work.baseSha,
    scope_paths: ['src/health.ts', 'test/health.test.ts'],
    current_state: 'Health answers status only.',
    constraints: 'No new dependency.',
    non_goals: 'No UI.',
    architecture_decision: 'Extend the existing handler.',
    alternatives_considered: 'A new route; rejected as wider.',
    components_and_boundaries: 'The health handler only.',
    interfaces_and_contracts: 'Response gains one field.',
    data_flow: 'Read uptime, return it.',
    trust_and_security_boundaries: 'Public route; no secrets.',
    migration_and_compatibility: 'Additive.',
    error_and_failure_behavior: 'Unchanged.',
    observability: 'None added.',
    test_strategy: 'One unit test.',
    rollback_plan: 'Revert the commit.',
    dependency_ordering: 'None.',
    acceptance_criteria: ['The field is present.'],
    implementation_sequence: ['Edit handler', 'Add test'],
    known_risks: [],
    unresolved_founder_decisions: [],
    plan_drift_stop_conditions: ['Base moved'],
    next_role: 'founder_approval',
    claims: { plan_approved: false, builder_authorized: false },
    ...overrides,
  };
}

export interface SyntheticBehaviour {
  attest: 'ok' | 'throw' | Partial<ExecutionIdentity>;
  dispatch: 'accept' | 'not_sent' | 'throw';
  observed: ObservedRoute;
  result: 'plan' | 'failed' | 'throw';
  /** Applied to the ready plan the Planner returns. */
  planOverrides: Record<string, unknown>;
}

export class SyntheticPlanner implements PlannerPort {
  behaviour: SyntheticBehaviour = {
    attest: 'ok',
    dispatch: 'accept',
    observed: SYNTHETIC_ROUTE,
    result: 'plan',
    planOverrides: {},
  };
  readonly calls: { attest: number; dispatched: PlannerWork[]; awaited: string[] } = { attest: 0, dispatched: [], awaited: [] };
  private readonly works = new Map<string, PlannerWork>();
  private executions = 0;

  reset(behaviour: Partial<SyntheticBehaviour> = {}): this {
    this.behaviour = { attest: 'ok', dispatch: 'accept', observed: SYNTHETIC_ROUTE, result: 'plan', planOverrides: {}, ...behaviour };
    this.calls.attest = 0;
    this.calls.dispatched.length = 0;
    this.calls.awaited.length = 0;
    return this;
  }

  async attest(): Promise<ExecutionIdentity> {
    this.calls.attest += 1;
    if (this.behaviour.attest === 'throw') throw new Error('synthetic attestation failure');
    this.executions += 1;
    const identity: ExecutionIdentity = {
      executionId: `exec-synthetic-${this.executions}`,
      role: 'architect',
      surface: 'claude-code',
      model: SYNTHETIC_ROUTE.model,
      provider: SYNTHETIC_ROUTE.provider,
      effort: 'n/a',
    };
    return this.behaviour.attest === 'ok' ? identity : { ...identity, ...this.behaviour.attest };
  }

  async dispatch(work: PlannerWork): Promise<PlannerDispatchReceipt> {
    this.calls.dispatched.push(work);
    if (this.behaviour.dispatch === 'throw') throw new Error('synthetic transport timeout');
    if (this.behaviour.dispatch === 'not_sent') return { kind: 'not_sent' };
    this.works.set(work.commandId, work);
    return { kind: 'accepted', observed: this.behaviour.observed };
  }

  async awaitPlan(commandId: string): Promise<PlannerResult> {
    this.calls.awaited.push(commandId);
    if (this.behaviour.result === 'throw') throw new Error('synthetic wait timeout');
    if (this.behaviour.result === 'failed') return { kind: 'failed' };
    const work = this.works.get(commandId);
    if (work === undefined) throw new Error('awaited a command that was never dispatched');
    return { kind: 'plan', document: readyPlanFor(work, this.behaviour.planOverrides) };
  }
}
