/**
 * Planner-command recovery — Phase 4 steps 3 to 6, plan r1 slice 8.
 *
 * After an interruption (a crash, a lost response, a journal or store that
 * failed mid-round), a room's current planner command can be left in one of
 * three open states. Recovery reconciles it BY ITS COMMAND ID before anything
 * else may happen to the round (journal contract §5.3), and never by
 * re-executing it: the Planner is asked what it knows (`PlannerPort.reconcile`),
 * and the answer is recorded. Recovery mints no command, dispatches nothing,
 * and decides nothing for the Founder.
 *
 * FIRST, THE CHAIN. Recovery verifies the journal from genesis before it reads
 * a command's history to act on it. A chain that does not verify stops
 * recovery entirely: nothing is appended on the strength of rows that may not
 * be the rows that were written.
 *
 * THE THREE OPEN STATES, AND WHAT EACH ANSWER RECORDS
 *
 *   Latest `journaled` or `identity_bound` (dispatch-attempt reconciliation):
 *     - never received  → pre-send `failed` (`not_sent`): the attempt provably
 *                         never left. §5.3 also allows "proceed to a governed
 *                         dispatch attempt"; this slice does not, because that
 *                         is a retry (plan r1 Q8).
 *     - running/finished → `identity_bound` if none was recorded, then
 *                         `dispatched` with the route the Planner reports, then
 *                         as below. Never a second dispatch.
 *     - no answer       → `unresolved`, as §5.3 requires for an indeterminate
 *                         answer.
 *   Latest `dispatched`, no terminal event:
 *     - finished        → the round's own ending: the plan checked and
 *                         submitted with `completed` (T3, the plan and the row in
 *                         one transaction), or `failed`.
 *     - running         → nothing; the command is pending, which is true.
 *     - never received  → contradicts the journal's `dispatched`: `unresolved`,
 *                         reported as a mismatch.
 *     - no answer       → nothing; pending is still true.
 *   Latest `unresolved` (the reconciliation protocol, consumed §3.5 semantics):
 *     Only a `reconciled` answer resolves, as in MadBridge's `resumeSession`,
 *     where only `reconciled` lets a session continue. `ambiguous` and
 *     `mismatch` are reported and leave the command `unresolved`: §5.3's
 *     "`ambiguous` never resolves silently", and contract §1.4's mismatch,
 *     "surfaced, never auto-resolved".
 *     - reconciled, never received, no `dispatched` row → `resolved` `failed`.
 *     - reconciled, finished with a reported failure, or with a plan the round
 *       cannot accept, or a route that diverged → `resolved` `failed`.
 *     - reconciled, finished with an acceptable plan → `resolved` `completed`,
 *       committed with T3 and the plan, and only if the journal's completion
 *       test passes; `does_not_cover` → `resolved` `failed`, indeterminate →
 *       stays `unresolved`.
 *     - ambiguous: no answer, still running, or a finished command whose
 *       dispatch the journal never recorded (a `completed` determination needs
 *       an observed identity, and a row cannot be added after `unresolved`).
 *     - mismatch: another execution id than the one bound, another route than
 *       the one recorded as dispatched, or "never received" for a command the
 *       journal recorded as dispatched.
 *
 * Re-attestation, the third leg of the consumed reconciliation, is the
 * execution id: the Planner's answer must name the execution the journal
 * bound, or it is a mismatch.
 *
 * Idempotent by construction: a recovered command is terminal or reported,
 * and a second pass over a terminal command appends nothing.
 */

import { randomUUID } from 'node:crypto';
import type { CommandEventRow } from '../../journal/src/index.js';
import {
  PLANNER_FAILURES,
  judgeRoundPlan,
  plannerRoundsOf,
  readRoundInputs,
  submitRoundPlan,
  type ObservedRoute,
  type PlannerFailure,
  type PlannerPort,
  type PlannerReconciliation,
  type PlannerRoute,
  type RoundInputs,
} from './planner-loop.js';
import type { PlanStore } from './plan-store.js';
import type { PostgresLedgerStore } from './store.js';
import type { JournalStore } from './journal-store.js';

export interface PlannerRecoveryDeps {
  readonly ledger: Pick<PostgresLedgerStore, 'appendDerived' | 'underRoomLock' | 'loadRoom' | 'isFenced'>;
  readonly journal: Pick<JournalStore, 'inTransaction' | 'appendCommandEvent' | 'commandHistory' | 'verify'>;
  readonly plans: Pick<PlanStore, 'inTransaction'>;
  readonly planner: Pick<PlannerPort, 'reconcile'>;
  readonly route: Pick<PlannerRoute, 'actorId'>;
  readonly now?: () => Date;
  readonly mintEventId?: () => string;
}

/** Why an `unresolved` command stays so: the consumed §3.5 reading of the Planner's answer. */
export type UnresolvedReading = 'ambiguous' | 'mismatch';

export type RecoveryOutcome =
  /** Recovery did not run: the chain did not verify, or leadership refused. */
  | { readonly kind: 'refused'; readonly reason: string }
  /** The room has no open planner command. */
  | { readonly kind: 'nothing_open' }
  | { readonly kind: 'plan_review'; readonly commandId: string; readonly planHash: string; readonly eventId: string }
  | { readonly kind: 'failed'; readonly commandId: string; readonly classification: PlannerFailure }
  | { readonly kind: 'resolved_failed'; readonly commandId: string }
  /** The command is, or now is, `unresolved`; `appended` says whether this pass wrote that row. */
  | { readonly kind: 'unresolved'; readonly commandId: string; readonly reading: UnresolvedReading; readonly reason: string; readonly appended: boolean }
  /** `dispatched` and still pending: nothing false to correct, nothing written. */
  | { readonly kind: 'pending'; readonly commandId: string; readonly reason: string }
  | { readonly kind: 'interrupted'; readonly commandId: string; readonly committed: boolean };

interface OpenCommand {
  readonly commandId: string;
  readonly rows: readonly CommandEventRow[];
  readonly inputs: RoundInputs;
  readonly latestRound: boolean;
}

type Answer = PlannerReconciliation | { readonly kind: 'no_answer' };

export class PlannerRecoveryUnfencedError extends Error {
  override readonly name = 'PlannerRecoveryUnfencedError';
  constructor() {
    super('planner recovery runs only on a fenced ledger store');
  }
}

export class PlannerRecovery {
  private readonly now: () => Date;
  private readonly mintEventId: () => string;

  constructor(private readonly deps: PlannerRecoveryDeps) {
    if (!deps.ledger.isFenced()) throw new PlannerRecoveryUnfencedError();
    this.now = deps.now ?? (() => new Date());
    this.mintEventId = deps.mintEventId ?? (() => `evt_${randomUUID()}`);
  }

  /** Reconcile the room's open planner command, if it has one. */
  async recoverRoom(roomId: string): Promise<RecoveryOutcome> {
    const verdict = await this.deps.journal.verify();
    if (!verdict.ok) return { kind: 'refused', reason: `the journal does not verify: ${verdict.reason}` };

    const open = await this.openCommand(roomId);
    if (open === 'not_leader') return { kind: 'refused', reason: 'the fence refused the room read' };
    if (open === null) return { kind: 'nothing_open' };

    const latest = open.rows[open.rows.length - 1] as CommandEventRow;
    const answer = await this.ask(open.commandId);
    switch (latest.eventType) {
      case 'journaled':
      case 'identity_bound':
        return this.reconcileDispatchAttempt(roomId, open, answer);
      case 'dispatched':
        return this.reconcileDispatched(roomId, open, answer);
      case 'unresolved':
        return this.resolve(roomId, open, answer);
      default:
        return { kind: 'nothing_open' };
    }
  }

  // ---- reading ------------------------------------------------------------

  /** The room's latest journaled planner command, when it is not terminal. */
  private async openCommand(roomId: string): Promise<OpenCommand | null | 'not_leader'> {
    const view = await this.deps.ledger.loadRoom(roomId);
    const rounds = plannerRoundsOf(roomId, view.state);
    for (let i = rounds.length - 1; i >= 0; i -= 1) {
      const round = rounds[i]!;
      const history = await this.deps.journal.commandHistory(round.commandId);
      if (history.state === null) continue;
      if (history.state.outcome === 'completed' || history.state.outcome === 'failed') return null;
      const rows = history.entries.flatMap((e) => (e.decoded.recordClass === 'command' ? [e.decoded.row] : []));
      const read = await readRoundInputs(this.deps.ledger, roomId, round.commandId);
      if (read === 'not_leader') return 'not_leader';
      if (read === null) return null;
      return { commandId: round.commandId, rows, inputs: read.inputs, latestRound: read.latest };
    }
    return null;
  }

  private async ask(commandId: string): Promise<Answer> {
    try {
      return await this.deps.planner.reconcile(commandId);
    } catch {
      return { kind: 'no_answer' };
    }
  }

  // ---- the three open states ----------------------------------------------

  private async reconcileDispatchAttempt(roomId: string, open: OpenCommand, answer: Answer): Promise<RecoveryOutcome> {
    const { commandId } = open;
    if (answer.kind === 'no_answer') return this.markUnresolved(commandId, 'ambiguous', 'the Planner gave no answer for a command never recorded as dispatched');
    if (answer.kind === 'never_received') return this.fail(commandId, 'not_sent');
    const bound = open.rows.find((row) => row.eventType === 'identity_bound')?.executionId;
    if (bound !== undefined && bound !== answer.executionId) {
      return this.markUnresolved(commandId, 'mismatch', 'the Planner reports another execution than the one bound');
    }
    if (bound === undefined) {
      await this.deps.journal.appendCommandEvent({ eventType: 'identity_bound', commandId, executionId: answer.executionId, evidenceRefs: [] });
    }
    await this.appendDispatched(commandId, answer.observed);
    if (!routeMatches(open.rows[0] as CommandEventRow, answer.observed)) return this.fail(commandId, 'route_mismatch');
    if (answer.kind === 'running') return { kind: 'pending', commandId, reason: 'dispatched, reconciled from the Planner; the plan is not ready' };
    return this.finish(roomId, open, answer.observed, answer.result, 'completed');
  }

  private async reconcileDispatched(roomId: string, open: OpenCommand, answer: Answer): Promise<RecoveryOutcome> {
    const { commandId } = open;
    if (answer.kind === 'no_answer') return { kind: 'pending', commandId, reason: 'the Planner gave no answer; the command stays dispatched' };
    if (answer.kind === 'never_received') {
      return this.markUnresolved(commandId, 'mismatch', 'the Planner reports never receiving a command the journal recorded as dispatched');
    }
    const identityDefect = this.identityDefect(open, answer);
    if (identityDefect !== null) return this.markUnresolved(commandId, 'mismatch', identityDefect);
    if (answer.kind === 'running') return { kind: 'pending', commandId, reason: 'the plan is not ready' };
    return this.finish(roomId, open, answer.observed, answer.result, 'completed');
  }

  private async resolve(roomId: string, open: OpenCommand, answer: Answer): Promise<RecoveryOutcome> {
    const { commandId } = open;
    const stays = (reading: UnresolvedReading, reason: string): RecoveryOutcome => ({ kind: 'unresolved', commandId, reading, reason, appended: false });
    const dispatched = open.rows.find((row) => row.eventType === 'dispatched');
    if (answer.kind === 'no_answer') return stays('ambiguous', 'the Planner gave no answer');
    if (answer.kind === 'never_received') {
      if (dispatched !== undefined) return stays('mismatch', 'the Planner reports never receiving a command the journal recorded as dispatched');
      return this.resolveFailed(commandId);
    }
    const identityDefect = this.identityDefect(open, answer);
    if (identityDefect !== null) return stays('mismatch', identityDefect);
    if (answer.kind === 'running') return stays('ambiguous', 'the command is still running');
    if (dispatched === undefined) {
      if (answer.result.kind === 'failed') return this.resolveFailed(commandId);
      return stays('ambiguous', 'the Planner finished a command whose dispatch the journal never recorded, so no completed determination can carry its identity');
    }
    if (!routeMatches(open.rows[0] as CommandEventRow, answer.observed)) return this.resolveFailed(commandId);
    return this.finish(roomId, open, answer.observed, answer.result, 'resolved');
  }

  // ---- endings ------------------------------------------------------------

  /** A finished command's result: a plan submitted with its terminal row, or a failure. */
  private async finish(
    roomId: string,
    open: OpenCommand,
    observed: ObservedRoute,
    result: Extract<PlannerReconciliation, { kind: 'finished' }>['result'],
    terminal: 'completed' | 'resolved',
  ): Promise<RecoveryOutcome> {
    const { commandId } = open;
    const failure = (classification: PlannerFailure): Promise<RecoveryOutcome> =>
      terminal === 'completed' ? this.fail(commandId, classification) : this.resolveFailed(commandId);
    if (result.kind === 'failed') return failure('planner_reported_failure');
    if (!open.latestRound) return failure('round_superseded');
    const verdict = judgeRoundPlan(result.document, open.inputs);
    if (!verdict.ok) return failure(verdict.classification);
    const submitted = await submitRoundPlan(
      { ledger: this.deps.ledger, journal: this.deps.journal, plans: this.deps.plans, route: this.deps.route, now: this.now, mintEventId: this.mintEventId },
      { roomId, commandId, observed, document: result.document, planHash: verdict.planHash, terminal },
    );
    switch (submitted.kind) {
      case 'plan_review':
        return { kind: 'plan_review', commandId, planHash: verdict.planHash, eventId: submitted.eventId };
      case 'interrupted':
        return { kind: 'interrupted', commandId, committed: submitted.committed };
      case 'completion_refused':
        if (submitted.coverage === 'does_not_cover') return failure('completion_not_covered');
        if (terminal === 'resolved') {
          return { kind: 'unresolved', commandId, reading: 'ambiguous', reason: `completion not determinable (${submitted.coverage})`, appended: false };
        }
        return this.markUnresolved(commandId, 'ambiguous', `completion not determinable (${submitted.coverage})`);
      case 'plan_refused':
        return failure('plan_refused');
      case 'superseded':
        return failure('round_superseded');
    }
  }

  private identityDefect(open: OpenCommand, answer: Extract<PlannerReconciliation, { kind: 'running' | 'finished' }>): string | null {
    const bound = open.rows.find((row) => row.eventType === 'identity_bound')?.executionId;
    if (bound !== undefined && bound !== answer.executionId) return 'the Planner reports another execution than the one bound';
    const dispatched = open.rows.find((row) => row.eventType === 'dispatched');
    if (
      dispatched !== undefined
      && (dispatched.provider !== answer.observed.provider
        || dispatched.model !== answer.observed.model
        || dispatched.executionSurface !== answer.observed.executionSurface)
    ) {
      return 'the Planner reports another route than the one recorded as dispatched';
    }
    return null;
  }

  private async appendDispatched(commandId: string, observed: ObservedRoute): Promise<void> {
    await this.deps.journal.appendCommandEvent({
      eventType: 'dispatched',
      commandId,
      provider: observed.provider,
      model: observed.model,
      executionSurface: observed.executionSurface,
      evidenceRefs: ['planner-reconciliation'],
    });
  }

  private async fail(commandId: string, classification: PlannerFailure): Promise<RecoveryOutcome> {
    if (!(PLANNER_FAILURES as readonly string[]).includes(classification)) throw new RangeError('not a planner failure classification');
    await this.deps.journal.appendCommandEvent({ eventType: 'failed', commandId, failureClassification: classification, evidenceRefs: ['planner-reconciliation'] });
    return { kind: 'failed', commandId, classification };
  }

  private async resolveFailed(commandId: string): Promise<RecoveryOutcome> {
    await this.deps.journal.appendCommandEvent({
      eventType: 'resolved',
      commandId,
      resolutionDetermination: 'failed',
      resolutionSemantics: 'reconciled',
      evidenceRefs: ['planner-reconciliation'],
    });
    return { kind: 'resolved_failed', commandId };
  }

  private async markUnresolved(commandId: string, reading: UnresolvedReading, reason: string): Promise<RecoveryOutcome> {
    await this.deps.journal.appendCommandEvent({ eventType: 'unresolved', commandId, evidenceRefs: ['planner-reconciliation'] });
    return { kind: 'unresolved', commandId, reading, reason, appended: true };
  }
}

function routeMatches(journaled: CommandEventRow, observed: ObservedRoute): boolean {
  return (
    observed.provider === journaled.intendedProvider
    && observed.model === journaled.intendedModel
    && observed.executionSurface === journaled.intendedSurface
  );
}
