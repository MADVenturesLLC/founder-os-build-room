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
  PlannerInit,
  PlannerPort,
  PlannerReconciliation,
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
  /**
   * `throw`: the work never arrived, and the call throws (contact unknown to
   * the caller). `lost_response`: the work arrived and runs, but the answer
   * is lost and the call throws.
   */
  dispatch: 'accept' | 'not_sent' | 'throw' | 'lost_response';
  observed: ObservedRoute;
  /** The init model and conversation id the Planner reports with the work, when it reports them. */
  init?: PlannerInit;
  /** `running`: the plan is not ready, and `awaitPlan` throws. */
  result: 'plan' | 'failed' | 'throw' | 'running';
  /** Applied to the ready plan the Planner returns. */
  planOverrides: Record<string, unknown>;
  /** `truth` answers from what the Planner holds; the others override it. */
  reconcile: 'truth' | 'throw' | 'wrong_execution' | 'never_received';
  /** When set, `awaitPlan` waits for it first: a Planner still working. */
  hold?: Promise<void>;
}

const DEFAULT_BEHAVIOUR: SyntheticBehaviour = {
  attest: 'ok',
  dispatch: 'accept',
  observed: SYNTHETIC_ROUTE,
  result: 'plan',
  planOverrides: {},
  reconcile: 'truth',
};

interface Held {
  readonly work: PlannerWork;
  readonly executionId: string;
  readonly observed: ObservedRoute;
  readonly init: PlannerInit | undefined;
}

function initOf(init: PlannerInit | undefined): { init?: PlannerInit } {
  return init === undefined ? {} : { init: { ...init } };
}

export class SyntheticPlanner implements PlannerPort {
  behaviour: SyntheticBehaviour = { ...DEFAULT_BEHAVIOUR };
  readonly calls: { attest: number; dispatched: PlannerWork[]; awaited: string[]; reconciled: string[] } = {
    attest: 0,
    dispatched: [],
    awaited: [],
    reconciled: [],
  };
  /** What the Planner holds per command id; survives `reset`, as a real Planner outlives a control-plane restart. */
  private readonly held = new Map<string, Held>();
  private executions = 0;
  private lastExecutionId = '';

  reset(behaviour: Partial<SyntheticBehaviour> = {}): this {
    this.behaviour = { ...DEFAULT_BEHAVIOUR, ...behaviour };
    this.calls.attest = 0;
    this.calls.dispatched.length = 0;
    this.calls.awaited.length = 0;
    this.calls.reconciled.length = 0;
    return this;
  }

  /** How many times work for `commandId` was accepted: at most once is the property under test. */
  executionsOf(commandId: string): number {
    return this.calls.dispatched.filter((work) => work.commandId === commandId && this.held.has(commandId)).length;
  }

  async attest(): Promise<ExecutionIdentity> {
    this.calls.attest += 1;
    if (this.behaviour.attest === 'throw') throw new Error('synthetic attestation failure');
    this.executions += 1;
    this.lastExecutionId = `exec-synthetic-${this.executions}`;
    const identity: ExecutionIdentity = {
      executionId: this.lastExecutionId,
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
    if (this.held.has(work.commandId)) throw new Error(`synthetic planner: ${work.commandId} dispatched twice`);
    this.held.set(work.commandId, { work, executionId: this.lastExecutionId, observed: this.behaviour.observed, init: this.behaviour.init });
    if (this.behaviour.dispatch === 'lost_response') throw new Error('synthetic response lost');
    return { kind: 'accepted', observed: this.behaviour.observed, ...initOf(this.behaviour.init) };
  }

  private resultFor(commandId: string): PlannerResult | 'running' {
    const held = this.held.get(commandId);
    if (held === undefined) throw new Error('a result for a command that was never dispatched');
    if (this.behaviour.result === 'running') return 'running';
    if (this.behaviour.result === 'failed') return { kind: 'failed' };
    return { kind: 'plan', document: readyPlanFor(held.work, this.behaviour.planOverrides) };
  }

  async awaitPlan(commandId: string): Promise<PlannerResult> {
    this.calls.awaited.push(commandId);
    if (this.behaviour.hold !== undefined) await this.behaviour.hold;
    if (this.behaviour.result === 'throw' || this.behaviour.result === 'running') throw new Error('synthetic wait timeout');
    const result = this.resultFor(commandId);
    if (result === 'running') throw new Error('synthetic wait timeout');
    return result;
  }

  async reconcile(commandId: string): Promise<PlannerReconciliation> {
    this.calls.reconciled.push(commandId);
    if (this.behaviour.reconcile === 'throw') throw new Error('synthetic planner unreachable');
    if (this.behaviour.reconcile === 'never_received') return { kind: 'never_received' };
    const held = this.held.get(commandId);
    if (held === undefined) return { kind: 'never_received' };
    const executionId = this.behaviour.reconcile === 'wrong_execution' ? 'exec-synthetic-other' : held.executionId;
    // A wait that threw ('throw') still leaves the plan ready to report.
    const result = this.behaviour.result === 'throw' ? { kind: 'plan' as const, document: readyPlanFor(held.work, this.behaviour.planOverrides) } : this.resultFor(commandId);
    if (result === 'running') return { kind: 'running', executionId, observed: held.observed, ...initOf(held.init) };
    return { kind: 'finished', executionId, observed: held.observed, ...initOf(held.init), result };
  }
}
