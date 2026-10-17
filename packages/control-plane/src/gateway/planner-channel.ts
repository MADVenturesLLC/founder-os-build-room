/**
 * The planner pull channel's control-plane side (Founder answer to Phase 4
 * plan r1 Q2b: "The Gateway asks for assigned planner commands over its
 * existing authenticated session, and reports results the same way. The PC
 * still accepts no inbound connection.").
 *
 * A MAILBOX. The planner loop asks a question through `PlannerPort`; the
 * question waits here, addressed to the Gateway the route is assigned to,
 * until that Gateway's signed `planner_poll` collects it; the Gateway's
 * signed `planner_report` answers it. The transport is the one
 * `DEC-20260815-15` clause 2 ratifies, outbound-only HTTPS long-poll + POST,
 * with a zero wait: a poll answers at once, and the Gateway polls on its
 * session cadence. Clause 3's delivery confirmation is per request: a request
 * is re-delivered until it is answered (the Gateway answers idempotently by
 * command id), and `status` is the reconciliation poll.
 *
 * IN MEMORY, AND WHY THAT IS SAFE. Nothing here is durable, so this adds no
 * migration. The questions belong to a running loop in this process; a
 * restart ends the loop, and `planner-recovery.ts` then asks `status` again,
 * which the Gateway answers from its own durable record of the command. No
 * answer is ever inferred from this mailbox's absence of state.
 *
 * WHAT `not_sent` MEANS HERE. `dispatch` reports `not_sent` only on
 * affirmative evidence the work never left: the Gateway said so, or the
 * `execute` request was withdrawn before any poll response carried it.
 * Withdrawal and delivery are both synchronous on this one thread, with no
 * await between a poll picking a request and marking it delivered, so a
 * withdrawn request can never be delivered afterwards. A request that was
 * delivered and not answered is contact that cannot be ruled out: `dispatch`
 * throws, and the loop records `unresolved`.
 */

import { randomUUID } from 'node:crypto';
import {
  answersRequest,
  type PlannerReportPayload,
  type PlannerRequestWire,
  type PlannerRouteWire,
} from '../../../gateway-protocol/src/index.js';
import type { ExecutionIdentity } from '../../../madbridge-consumed/src/adapter/adapter-v1.js';
import type {
  ObservedRoute,
  PlannerDispatchReceipt,
  PlannerPort,
  PlannerReconciliation,
  PlannerResult,
  PlannerWork,
} from '../planner-loop.js';

/** How long the port waits, per question and overall. */
export interface PlannerChannelTimings {
  /** For one `attest`, `execute` or `status` answer. Over the Gateway's cadence plus a missed beat. */
  readonly answerTimeoutMs: number;
  /** For a finished plan, from the first `status` asked. */
  readonly planTimeoutMs: number;
  /** Between `status` questions while the plan is still running. */
  readonly statusIntervalMs: number;
}

export const DEFAULT_PLANNER_CHANNEL_TIMINGS: PlannerChannelTimings = {
  answerTimeoutMs: 60_000,
  planTimeoutMs: 30 * 60_000,
  statusIntervalMs: 10_000,
};

/** What a port is configured with: which Gateway, and the route it must attest for. */
export interface PlannerChannelAssignment {
  readonly gatewayId: string;
  readonly role: string;
  readonly intended: ObservedRoute;
  readonly timings?: Partial<PlannerChannelTimings>;
}

interface Pending {
  readonly gatewayId: string;
  readonly request: PlannerRequestWire;
  delivered: boolean;
  /** Monotonic order of the last delivery; undelivered requests go first. */
  lastDelivery: number;
  readonly settle: (payload: PlannerReportPayload) => void;
}

type Asked =
  | { readonly answered: true; readonly payload: PlannerReportPayload }
  | { readonly answered: false; readonly delivered: boolean };

export class PlannerChannelUnansweredError extends Error {
  override readonly name = 'PlannerChannelUnansweredError';
}

/** The one clock reading the channel takes: monotonic, from the gateway surface's adapter (§4). */
export interface PlannerChannelClock {
  monotonicNow(): number;
}

export class GatewayPlannerChannel {
  private readonly pending = new Map<string, Pending>();
  private deliveries = 0;

  constructor(
    private readonly clock: PlannerChannelClock,
    private readonly mintRequestId: () => string = randomUUID,
  ) {}

  /** A `PlannerPort` whose questions go to the assigned Gateway. */
  port(assignment: PlannerChannelAssignment): PlannerPort {
    return new GatewayPlannerPort(this, assignment, {
      ...DEFAULT_PLANNER_CHANNEL_TIMINGS,
      ...assignment.timings,
    }, this.clock);
  }

  /** Open requests, for tests and for `doctor`-style inspection. Never their contents. */
  get openCount(): number {
    return this.pending.size;
  }

  /* ---- the signed routes' side ------------------------------------ */

  /**
   * The request this Gateway's poll collects, marked delivered in the same
   * synchronous step. Undelivered requests first, then the least recently
   * delivered, so one the Gateway cannot answer does not starve the others.
   * Requests addressed to another Gateway are never visible here.
   */
  collect(gatewayId: string): PlannerRequestWire | null {
    let chosen: Pending | null = null;
    for (const entry of this.pending.values()) {
      if (entry.gatewayId !== gatewayId) continue;
      if (chosen === null || entry.lastDelivery < chosen.lastDelivery) chosen = entry;
    }
    if (chosen === null) return null;
    chosen.delivered = true;
    this.deliveries += 1;
    chosen.lastDelivery = this.deliveries;
    return chosen.request;
  }

  /**
   * Settle a request with the Gateway's report. `false` when no such request
   * is open for this Gateway (already answered, withdrawn, or never asked),
   * or when the payload does not answer the request's kind.
   */
  answer(gatewayId: string, requestId: string, payload: PlannerReportPayload): boolean {
    const entry = this.pending.get(requestId);
    if (entry === undefined || entry.gatewayId !== gatewayId) return false;
    if (!entry.delivered) return false;
    if (!answersRequest(entry.request.kind, payload.kind)) return false;
    this.pending.delete(requestId);
    entry.settle(payload);
    return true;
  }

  /* ---- the port's side -------------------------------------------- */

  /** Post one request and wait for its answer, withdrawing it on timeout. */
  ask(
    gatewayId: string,
    build: (requestId: string) => PlannerRequestWire,
    timeoutMs: number,
  ): Promise<Asked> {
    const requestId = this.mintRequestId();
    const request = build(requestId);
    return new Promise<Asked>((resolve) => {
      const timer = setTimeout(() => {
        const entry = this.pending.get(requestId);
        if (entry === undefined) return; // answered in the same turn
        this.pending.delete(requestId);
        resolve({ answered: false, delivered: entry.delivered });
      }, timeoutMs);
      this.pending.set(requestId, {
        gatewayId,
        request,
        delivered: false,
        lastDelivery: 0,
        settle: (payload) => {
          clearTimeout(timer);
          resolve({ answered: true, payload });
        },
      });
    });
  }
}

function routeOf(route: PlannerRouteWire): ObservedRoute {
  return { provider: route.provider, model: route.model, executionSurface: route.executionSurface };
}

/** Every wait here is bounded and cleared on settlement, so none is unref'd: a pending question is real work. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The loop's `PlannerPort`, over the channel. Every method either returns
 * what the Gateway affirmatively said or throws; it never guesses.
 */
class GatewayPlannerPort implements PlannerPort {
  /** The execution each command was attested with, so `execute` names it. */
  private readonly bound = new Map<string, string>();

  constructor(
    private readonly channel: GatewayPlannerChannel,
    private readonly assignment: PlannerChannelAssignment,
    private readonly timings: PlannerChannelTimings,
    private readonly clock: PlannerChannelClock,
  ) {}

  async attest(commandId: string): Promise<ExecutionIdentity> {
    const { gatewayId, role, intended } = this.assignment;
    const asked = await this.channel.ask(
      gatewayId,
      (requestId) => ({ requestId, kind: 'attest', commandId, role, intended: { ...intended } }),
      this.timings.answerTimeoutMs,
    );
    if (!asked.answered) throw new PlannerChannelUnansweredError(`no attestation for ${commandId}`);
    if (asked.payload.kind !== 'attested') throw new PlannerChannelUnansweredError(`attestation failed for ${commandId}`);
    const identity = asked.payload.identity;
    this.bound.set(commandId, identity.executionId);
    return { ...identity };
  }

  async dispatch(work: PlannerWork): Promise<PlannerDispatchReceipt> {
    const executionId = this.bound.get(work.commandId);
    if (executionId === undefined) {
      // The loop attests first, always; reaching here otherwise sent nothing.
      return { kind: 'not_sent' };
    }
    const asked = await this.channel.ask(
      this.assignment.gatewayId,
      (requestId) => ({
        requestId,
        kind: 'execute',
        commandId: work.commandId,
        executionId,
        work: {
          commandId: work.commandId,
          roomId: work.roomId,
          repository: work.repository,
          baseSha: work.baseSha,
          scopePaths: [...work.scopePaths],
          goalEventId: work.goalEventId,
          goal: work.goal,
          goalDigest: work.goalDigest,
          ...(work.revision === undefined ? {} : { revision: { ...work.revision } }),
        },
      }),
      this.timings.answerTimeoutMs,
    );
    if (!asked.answered) {
      // Never delivered: withdrawn before any poll carried it. Delivered: contact unknown.
      if (!asked.delivered) return { kind: 'not_sent' };
      throw new PlannerChannelUnansweredError(`execute delivered for ${work.commandId} and not answered`);
    }
    if (asked.payload.kind === 'not_sent') return { kind: 'not_sent' };
    if (asked.payload.kind !== 'accepted') throw new PlannerChannelUnansweredError('unexpected execute answer');
    return { kind: 'accepted', observed: routeOf(asked.payload.observed) };
  }

  async awaitPlan(commandId: string): Promise<PlannerResult> {
    const deadline = this.clock.monotonicNow() + this.timings.planTimeoutMs;
    for (;;) {
      const remaining = deadline - this.clock.monotonicNow();
      if (remaining <= 0) throw new PlannerChannelUnansweredError(`no finished plan for ${commandId} in time`);
      const answer = await this.status(commandId, Math.min(this.timings.answerTimeoutMs, remaining));
      if (answer !== null) {
        if (answer.kind === 'never_received') {
          throw new PlannerChannelUnansweredError(`${commandId} was accepted, and the Gateway now holds no record of it`);
        }
        this.checkExecution(commandId, answer.executionId);
        if (answer.kind === 'finished') return answer.result;
      }
      const wait = Math.min(this.timings.statusIntervalMs, deadline - this.clock.monotonicNow());
      if (wait > 0) await sleep(wait);
    }
  }

  async reconcile(commandId: string): Promise<PlannerReconciliation> {
    const answer = await this.status(commandId, this.timings.answerTimeoutMs);
    if (answer === null) throw new PlannerChannelUnansweredError(`no status for ${commandId}`);
    return answer;
  }

  private async status(commandId: string, timeoutMs: number): Promise<PlannerReconciliation | null> {
    const asked = await this.channel.ask(
      this.assignment.gatewayId,
      (requestId) => ({ requestId, kind: 'status', commandId }),
      timeoutMs,
    );
    if (!asked.answered) return null;
    const payload = asked.payload;
    switch (payload.kind) {
      case 'never_received':
        return { kind: 'never_received' };
      case 'running':
        return { kind: 'running', executionId: payload.executionId, observed: routeOf(payload.observed) };
      case 'finished':
        return {
          kind: 'finished',
          executionId: payload.executionId,
          observed: routeOf(payload.observed),
          result: payload.result.kind === 'plan' ? { kind: 'plan', document: payload.result.document } : { kind: 'failed' },
        };
      default:
        return null;
    }
  }

  /** A status naming a different execution than the one bound is a contradiction, not an answer. */
  private checkExecution(commandId: string, executionId: string): void {
    const bound = this.bound.get(commandId);
    if (bound !== undefined && bound !== executionId) {
      throw new PlannerChannelUnansweredError(`${commandId} reports execution ${executionId}, bound ${bound}`);
    }
  }
}
