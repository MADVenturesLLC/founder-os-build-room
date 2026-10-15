/**
 * A synthetic Planner executor for the pull-channel suites — the Phase 4
 * authorization §6 allows "fixtures and synthetic provider behavior required
 * for deterministic testing". It contacts nothing. Each behaviour is set per
 * case, and every call is recorded so a case can prove how many times work
 * was started.
 */

import type {
  PlannerIdentityWire,
  PlannerResultWire,
  PlannerRouteWire,
  PlannerWorkWire,
} from '../../packages/gateway-protocol/src/index.js';
import type { PlannerExecutor, PlannerStart } from '../../packages/gateway-daemon/src/index.js';
import { readyPlanFor, SYNTHETIC_ROUTE } from './synthetic-planner.js';

export interface ExecutorBehaviour {
  attest: 'ok' | 'throw' | Partial<PlannerIdentityWire>;
  start: 'accept' | 'not_sent' | 'throw';
  observed: PlannerRouteWire;
  /** `hold`: the run settles only when `release()` is called. */
  result: 'plan' | 'failed' | 'reject' | 'hold' | 'oversized';
  planOverrides: Record<string, unknown>;
}

const DEFAULT_BEHAVIOUR: ExecutorBehaviour = {
  attest: 'ok',
  start: 'accept',
  observed: SYNTHETIC_ROUTE,
  result: 'plan',
  planOverrides: {},
};

export class SyntheticExecutor implements PlannerExecutor {
  behaviour: ExecutorBehaviour = { ...DEFAULT_BEHAVIOUR };
  readonly calls: { attest: string[]; start: string[] } = { attest: [], start: [] };
  /** The work each start was handed, in order, as the Gateway received it. */
  readonly works: PlannerWorkWire[] = [];
  private executions = 0;
  private held: (() => void) | null = null;

  reset(behaviour: Partial<ExecutorBehaviour> = {}): this {
    this.behaviour = { ...DEFAULT_BEHAVIOUR, ...behaviour };
    this.calls.attest.length = 0;
    this.calls.start.length = 0;
    this.works.length = 0;
    return this;
  }

  /** Settle a held run. */
  release(): void {
    this.held?.();
    this.held = null;
  }

  startsOf(commandId: string): number {
    return this.calls.start.filter((id) => id === commandId).length;
  }

  async attest(request: { readonly commandId: string; readonly role: string; readonly intended: PlannerRouteWire }): Promise<PlannerIdentityWire> {
    this.calls.attest.push(request.commandId);
    if (this.behaviour.attest === 'throw') throw new Error('synthetic attestation failure');
    this.executions += 1;
    const identity: PlannerIdentityWire = {
      executionId: `exec-gateway-${this.executions}`,
      role: request.role,
      surface: 'claude-code',
      model: request.intended.model,
      provider: request.intended.provider,
      effort: 'n/a',
    };
    return this.behaviour.attest === 'ok' ? identity : { ...identity, ...this.behaviour.attest };
  }

  async start(work: PlannerWorkWire): Promise<PlannerStart> {
    this.calls.start.push(work.commandId);
    this.works.push(work);
    if (this.behaviour.start === 'throw') throw new Error('synthetic launch outcome unknown');
    if (this.behaviour.start === 'not_sent') return { kind: 'not_sent' };
    const plan = (): PlannerResultWire => ({
      kind: 'plan',
      document: readyPlanFor({ ...work, scopePaths: work.scopePaths }, this.behaviour.planOverrides),
    });
    let completion: Promise<PlannerResultWire>;
    switch (this.behaviour.result) {
      case 'plan':
        completion = Promise.resolve(plan());
        break;
      case 'failed':
        completion = Promise.resolve({ kind: 'failed' });
        break;
      case 'reject':
        completion = Promise.reject(new Error('synthetic run failure'));
        break;
      case 'oversized':
        completion = Promise.resolve({ kind: 'plan', document: { padding: 'x'.repeat(300 * 1024) } });
        break;
      case 'hold':
        completion = new Promise((resolve) => {
          this.held = () => resolve(plan());
        });
        break;
    }
    return { kind: 'accepted', observed: { ...this.behaviour.observed }, completion };
  }
}
