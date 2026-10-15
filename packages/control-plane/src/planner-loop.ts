/**
 * The governed planner loop — Phase 4 steps 3 to 6, plan r1 slice 7.
 *
 * One planning round takes a room from SCOPED (or from PLANNING after a
 * Founder revision) to PLAN_REVIEW, through the governed execution path, or
 * stops at a recorded failure. Nothing in a round is believed from a caller:
 * every guard fact is derived here, by the ledger store's fence, or by the
 * stores the round writes through.
 *
 * A ROUND, IN ORDER
 *
 *   1. Open the round under the room lock (L3).
 *      - From SCOPED: T2 `task.dispatched.planner` and the planner command's
 *        `journaled` row commit in ONE transaction (journal contract §1.4),
 *        the row bound to its room and to the T2 event. G2's facts:
 *        `rolesAssigned` and `reviewerIsNotBuilder` from the room's role
 *        assignment, read through `roomRoles`; `gatewayOnline` derived by
 *        the fence, which overwrites anything asserted (contract §10). A
 *        refused T2 is the store's recorded rejection, and no command exists.
 *      - From PLANNING after T4: no transition opens a revision round, so the
 *        command is journaled under the room lock alone, bound to its room
 *        and to the T4 event that asked for the revision.
 *   2. Before any contact, after the `journaled` row has committed (§5.1):
 *      the intended route must be covered by the command's authorization
 *      (the same §5.3 test the journal applies at completion), and the
 *      Planner's attested identity must be the intended route in the
 *      architect role. Either failing is a pre-send `failed`: the attempt
 *      provably never left the control plane.
 *   3. `identity_bound` binds the Planner's execution id; `dispatched`
 *      records the route the Planner reports it ran on. A Planner that
 *      provably never sent is a pre-send `failed`; a dispatch that throws is
 *      `unresolved`, because contact cannot be ruled out (§5.3).
 *   4. The plan comes back. An observed route that differs from the
 *      intended one, a Planner-reported failure, a document `judgePlanDoc`
 *      refuses or that is not ready, or a plan outside the room's captured
 *      repository, base and scope is `failed`. A wait that throws is
 *      `unresolved`.
 *   5. T3 `plan.submitted`, the stored plan and the command's `completed`
 *      commit in ONE transaction. G3's facts are the server's:
 *      `planDocSchemaValid` from the judge and `planHash` computed here. The
 *      journal refuses `completed` unless its resolver says the command's
 *      authorization covers the observed route; then nothing of the
 *      transaction remains, and the command is `failed` (does not cover) or
 *      `unresolved` (indeterminate, or no resolver at all — silence is not
 *      coverage).
 *
 * THE ROOM'S PLANNER COMMANDS. A journal row carries no room column, and the
 * Founder's Q5 ruling allows no migration ("No migration and no stand-in
 * values"). So each round's command id is DERIVED from the room and the
 * transition that opened the round (`plannerCommandIdFor`), and a room's
 * planner commands are exactly the ids derived from its T2 and T4 entries
 * that the journal holds. The derivation is deterministic, so a restart
 * finds the command it opened instead of minting a second one, and the
 * `journaled` row's own room and lifecycle reference cross-check it.
 *
 * WHAT A ROUND DOES NOT DO: retry (plan r1 Q8). A failed or unresolved
 * round leaves the room in PLANNING; nothing here re-dispatches, and a round
 * already opened is never opened again. An interrupted round is reconciled
 * by `planner-recovery.ts`, which shares this module's plan check and T3
 * transaction. The Founder can cancel once the command is terminal
 * (`plan-decision.ts`).
 *
 * THE PLANNER is a `PlannerPort`. Only a synthetic one exists (plan r1 Q2:
 * which adapter runs the Planner, and how the control plane hands it work,
 * are unruled), so nothing in `server.ts` constructs a loop.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { checkScopePaths } from '../../contracts/src/index.js';
import type { LedgerEntry, LedgerState, LifecycleEvent } from '../../ledger/src/index.js';
import { envelopeDigest, normalizeForJournal, type GovernedCommandRequest } from '../../journal/src/index.js';
import type { ExecutionIdentity } from '../../madbridge-consumed/src/adapter/adapter-v1.js';
import { judgePlanDoc } from './plan-doc.js';
import { PlanRefusedError, type PlanStore } from './plan-store.js';
import type { PostgresLedgerStore } from './store.js';
import {
  JournalCompletionRefusedError,
  type CompletionAuthorizationResolver,
  type JournalStore,
} from './journal-store.js';

export const PLANNER_COMMAND_KIND = 'planner.invoke';
export const PLANNER_ROLE = 'architect';

/** The transitions that open a planning round. */
const ROUND_OPENERS = new Set(['T2', 'T4']);

/**
 * The planner command of the round a transition opened. `cmd_` namespace;
 * 32 hex of SHA-256 over a versioned, NUL-separated input, so no room and
 * event pair can collide with another by concatenation.
 */
export function plannerCommandIdFor(roomId: string, openingEventId: string): string {
  const digest = createHash('sha256')
    .update(`build-room/planner-command/v1\u0000${roomId}\u0000${openingEventId}`, 'utf8')
    .digest('hex');
  return `cmd_planner_${digest.slice(0, 32)}`;
}

export interface PlannerRound {
  /** The T2 or T4 entry that opened the round. */
  readonly opening: LedgerEntry;
  readonly commandId: string;
}

/** Every round the room's ledger has opened, oldest first. */
export function plannerRoundsOf(roomId: string, state: LedgerState): readonly PlannerRound[] {
  return state.entries
    .filter((entry) => ROUND_OPENERS.has(entry.transition))
    .map((opening) => ({ opening, commandId: plannerCommandIdFor(roomId, opening.eventId) }));
}

/** Whether `path` is `authorized` or lies beneath it. Both are canonical scope paths. */
export function isWithinScope(path: string, authorized: readonly string[]): boolean {
  return authorized.some((root) => path === root || path.startsWith(`${root}/`));
}

// ---------------------------------------------------------------------------
// The Planner

/** What one round asks of the Planner. Derived from the ledger; nothing from a caller. */
export interface PlannerWork {
  /** The idempotency key the Planner must honour: at most one execution per id (§5.3). */
  readonly commandId: string;
  readonly roomId: string;
  readonly repository: string;
  readonly baseSha: string;
  readonly scopePaths: readonly string[];
  /** The T1 `scope.captured` event the round plans for. */
  readonly goalEventId: string;
  /** Present on a revision round: the Founder's feedback and the plan it revises. */
  readonly revision?: { readonly feedback: string; readonly revisingPlanHash: string };
}

export interface ObservedRoute {
  readonly provider: string;
  readonly model: string;
  readonly executionSurface: string;
}

export type PlannerDispatchReceipt =
  | { readonly kind: 'accepted'; readonly observed: ObservedRoute }
  /** The Planner proves the work never left for a provider. */
  | { readonly kind: 'not_sent' };

export type PlannerResult =
  | { readonly kind: 'plan'; readonly document: unknown }
  | { readonly kind: 'failed' };

/**
 * What the Planner knows of one command when asked by its id (journal
 * contract §5.3, dispatch-attempt reconciliation). It reports; it never
 * executes anything, so asking cannot dispatch a second time.
 */
export type PlannerReconciliation =
  /** Affirmative evidence that the command never reached a provider. */
  | { readonly kind: 'never_received' }
  | { readonly kind: 'running'; readonly executionId: string; readonly observed: ObservedRoute }
  | { readonly kind: 'finished'; readonly executionId: string; readonly observed: ObservedRoute; readonly result: PlannerResult };

/**
 * The Planner as the loop sees it. `attest` is `AdapterV1.attest`, read
 * locally with no provider contact. `dispatch` and `awaitPlan` throw when
 * the outcome is unknown; the loop then records `unresolved`, never a guess.
 * `reconcile` is recovery's question (`planner-recovery.ts`); it throws when
 * the Planner cannot answer, and an answer it cannot give is never assumed.
 */
export interface PlannerPort {
  attest(): Promise<ExecutionIdentity>;
  dispatch(work: PlannerWork): Promise<PlannerDispatchReceipt>;
  awaitPlan(commandId: string): Promise<PlannerResult>;
  reconcile(commandId: string): Promise<PlannerReconciliation>;
}

/** The authorized Planner route a room's commands are journaled with. */
export interface PlannerRoute {
  /** Who performs the planner command (§2 element 3); never a bare role name. */
  readonly actorId: string;
  readonly authorizationRef: string;
  readonly intendedProvider: string;
  readonly intendedModel: string;
  readonly intendedSurface: string;
}

/** One assigned seat. */
export interface SeatAssignment {
  readonly roleId: string;
  readonly model: string;
}

/** A room's role assignment, as G2 reads it. Who assigns it is not ruled (plan r1 Q2). */
export interface RoomRoleAssignment {
  readonly planner: SeatAssignment;
  readonly builder: SeatAssignment;
  readonly reviewer: SeatAssignment;
}

/** The attribution of the control plane's own T2 act. */
export interface DispatcherAttribution {
  readonly roleId: string;
  readonly actorId: string;
  readonly actualModel: string;
  readonly executionSurface: string;
}

export interface PlannerLoopDeps {
  readonly ledger: Pick<PostgresLedgerStore, 'appendDerived' | 'underRoomLock' | 'loadRoom' | 'isFenced'>;
  readonly journal: Pick<JournalStore, 'inTransaction' | 'appendCommandEvent'>;
  readonly plans: Pick<PlanStore, 'inTransaction'>;
  readonly planner: PlannerPort;
  readonly route: PlannerRoute;
  readonly dispatcher: DispatcherAttribution;
  /** `null` when the room has no assignment: G2 then refuses. */
  readonly roomRoles: (roomId: string) => Promise<RoomRoleAssignment | null>;
  /** The §5.3 resolver the journal store was built with, asked before contact. */
  readonly authorizeRoute: CompletionAuthorizationResolver;
  readonly now?: () => Date;
  readonly mintEventId?: () => string;
}

/** The closed set of failure classifications a round records. */
export const PLANNER_FAILURES = [
  'authorization_does_not_cover',
  'authorization_indeterminate',
  'attestation_failed',
  'identity_mismatch',
  'not_sent',
  'route_mismatch',
  'planner_reported_failure',
  'plan_invalid',
  'plan_outside_captured_scope',
  'plan_refused',
  'completion_not_covered',
  'round_superseded',
] as const;
export type PlannerFailure = (typeof PLANNER_FAILURES)[number];

export type PlannerRoundOutcome =
  | { readonly kind: 'plan_review'; readonly commandId: string; readonly planHash: string; readonly eventId: string }
  | { readonly kind: 'refused'; readonly code: 'not_plannable' | 'round_already_open' | 'guard_failed' | 'not_leader'; readonly reason: string }
  | { readonly kind: 'failed'; readonly commandId: string; readonly classification: PlannerFailure }
  | { readonly kind: 'unresolved'; readonly commandId: string; readonly reason: string }
  /** Leadership lapsed around a commit; the journal and ledger hold what committed, and recovery owns the rest. */
  | { readonly kind: 'interrupted'; readonly commandId: string; readonly committed: boolean };

export class PlannerLoopUnfencedError extends Error {
  override readonly name = 'PlannerLoopUnfencedError';
  constructor() {
    super('the planner loop runs only on a fenced ledger store, where gatewayOnline is derived');
  }
}

export class RoundStateChangedError extends Error {
  override readonly name = 'RoundStateChangedError';
  constructor(readonly reason: string) {
    super(reason);
  }
}

export interface RoundInputs {
  readonly repository: string;
  readonly baseSha: string;
  readonly scopePaths: readonly string[];
  readonly goalEventId: string;
  readonly revision?: { readonly feedback: string; readonly revisingPlanHash: string };
}

interface OpenedRound {
  readonly commandId: string;
  readonly opening: string;
  readonly inputs: RoundInputs;
}

const T1_FACTS_SQL = `SELECT e.payload->'facts'->>'baseSha' AS base_sha
  FROM public.build_room_events AS e
 WHERE e.room_id = $1::uuid AND e.event_id = $2 AND e.outcome = 'transition'`;

const T4_PAYLOAD_SQL = `SELECT e.payload->>'feedback' AS feedback
  FROM public.build_room_events AS e
 WHERE e.room_id = $1::uuid AND e.event_id = $2 AND e.outcome = 'transition'`;

export class PlannerLoop {
  private readonly now: () => Date;
  private readonly mintEventId: () => string;

  constructor(private readonly deps: PlannerLoopDeps) {
    if (!deps.ledger.isFenced()) throw new PlannerLoopUnfencedError();
    this.now = deps.now ?? (() => new Date());
    this.mintEventId = deps.mintEventId ?? (() => `evt_${randomUUID()}`);
  }

  /** Run one planning round for the room. Every outcome is recorded before it is returned. */
  async runRound(roomId: string): Promise<PlannerRoundOutcome> {
    const view = await this.deps.ledger.loadRoom(roomId);
    let opened: OpenedRound | PlannerRoundOutcome;
    try {
      if (view.state.state === 'SCOPED') opened = await this.openFirstRound(roomId);
      else if (view.state.state === 'PLANNING') opened = await this.openRevisionRound(roomId);
      else return { kind: 'refused', code: 'not_plannable', reason: `a round opens from SCOPED or PLANNING, not ${view.state.state}` };
    } catch (error) {
      if (error instanceof RoundStateChangedError) return { kind: 'refused', code: 'not_plannable', reason: error.reason };
      throw error;
    }
    if ('kind' in opened) return opened;
    return this.execute(roomId, opened);
  }

  // ---- opening a round ----------------------------------------------------

  private plannerRequest(roomId: string, commandId: string, openingEventId: string, inputs: RoundInputs): GovernedCommandRequest {
    const { route } = this.deps;
    return {
      commandKind: PLANNER_COMMAND_KIND,
      argv: ['--room', roomId, '--opened-by', openingEventId],
      actorId: route.actorId,
      roleId: PLANNER_ROLE,
      authorizationRef: route.authorizationRef,
      repository: inputs.repository,
      scopeRef: `room-scope/${roomId}/${inputs.goalEventId}`,
      intendedProvider: route.intendedProvider,
      intendedModel: route.intendedModel,
      intendedSurface: route.intendedSurface,
      evidenceRefs: [`scope.captured/${inputs.goalEventId}`],
      commandId,
    };
  }

  private async openFirstRound(roomId: string): Promise<OpenedRound | PlannerRoundOutcome> {
    const eventId = this.mintEventId();
    const commandId = plannerCommandIdFor(roomId, eventId);
    let inputs: RoundInputs | null = null;
    const roles = await this.deps.roomRoles(roomId);
    const appended = await this.deps.ledger.appendDerived(roomId, {
      build: async (client, current) => {
        if (current.state !== 'SCOPED') throw new RoundStateChangedError(`the room left SCOPED (now ${current.state})`);
        inputs = await roundInputs(client, roomId, current, null);
        const request = this.plannerRequest(roomId, commandId, eventId, inputs);
        const event: LifecycleEvent = {
          eventId,
          event: 'task.dispatched.planner',
          actor: 'system',
          attribution: { ...this.deps.dispatcher },
          scope: { roomId, repo: inputs.repository, paths: [...inputs.scopePaths] },
          evidence: [{ kind: 'planner_command', ref: commandId, digest: envelopeDigest(normalizeForJournal(request)) }],
          occurredAt: this.now().toISOString(),
          // gatewayOnline is not set here: the fence derives it and overwrites.
          facts: {
            rolesAssigned: rolesAssigned(roles, this.deps.route),
            reviewerIsNotBuilder: roles !== null && roles.reviewer.model !== roles.builder.model,
          },
        } as LifecycleEvent;
        return event;
      },
      afterTransition: async (client, { entry }) => {
        if (inputs === null) throw new Error('round inputs missing after T2');
        const request = this.plannerRequest(roomId, commandId, eventId, inputs);
        return this.deps.journal
          .inTransaction(client)
          .appendJournaled(request, { roomId, lifecycleEventRef: { roomId, eventId: entry.eventId } });
      },
    });
    const result = appended.result;
    if (!result.ok && result.outcome === 'not_leader') {
      if (result.committed) return { kind: 'interrupted', commandId, committed: true };
      return { kind: 'refused', code: 'not_leader', reason: 'the fence refused the T2 append' };
    }
    if (!result.ok) return { kind: 'refused', code: 'guard_failed', reason: result.reason };
    if (result.outcome !== 'transition' || appended.after === null || inputs === null) {
      return { kind: 'refused', code: 'not_plannable', reason: `T2 produced ${result.outcome}, not a transition` };
    }
    return { commandId, opening: eventId, inputs };
  }

  private async openRevisionRound(roomId: string): Promise<OpenedRound | PlannerRoundOutcome> {
    const locked = await this.deps.ledger.underRoomLock(roomId, async (client, current) => {
      if (current.state !== 'PLANNING') throw new RoundStateChangedError(`the room left PLANNING (now ${current.state})`);
      const rounds = plannerRoundsOf(roomId, current);
      const latest = rounds[rounds.length - 1];
      if (latest === undefined || latest.opening.transition !== 'T4') {
        return { kind: 'refused', code: 'round_already_open', reason: 'the round T2 opened is already journaled' } as const;
      }
      const tx = this.deps.journal.inTransaction(client);
      if ((await tx.commandHistory(latest.commandId)).state !== null) {
        return { kind: 'refused', code: 'round_already_open', reason: 'this revision round is already journaled' } as const;
      }
      const inputs = await roundInputs(client, roomId, current, latest.opening);
      await tx.appendJournaled(this.plannerRequest(roomId, latest.commandId, latest.opening.eventId, inputs), {
        roomId,
        lifecycleEventRef: { roomId, eventId: latest.opening.eventId },
      });
      return { commandId: latest.commandId, opening: latest.opening.eventId, inputs };
    });
    if (locked.status === 'not_leader') {
      return { kind: 'refused', code: 'not_leader', reason: 'the fence refused the revision round' };
    }
    return locked.value;
  }

  // ---- executing an opened round -----------------------------------------

  private async fail(commandId: string, classification: PlannerFailure): Promise<PlannerRoundOutcome> {
    await this.deps.journal.appendCommandEvent({ eventType: 'failed', commandId, failureClassification: classification, evidenceRefs: [] });
    return { kind: 'failed', commandId, classification };
  }

  private async unresolved(commandId: string, reason: string): Promise<PlannerRoundOutcome> {
    await this.deps.journal.appendCommandEvent({ eventType: 'unresolved', commandId, evidenceRefs: [] });
    return { kind: 'unresolved', commandId, reason };
  }

  private async execute(roomId: string, round: OpenedRound): Promise<PlannerRoundOutcome> {
    const { route, planner } = this.deps;
    const { commandId, inputs } = round;
    const intended: ObservedRoute = {
      provider: route.intendedProvider,
      model: route.intendedModel,
      executionSurface: route.intendedSurface,
    };

    // Before contact: the authorization must cover the route it will run on.
    let coverage;
    try {
      coverage = await this.deps.authorizeRoute({
        commandId,
        authorizationRef: route.authorizationRef,
        repository: inputs.repository,
        scopeRef: `room-scope/${roomId}/${inputs.goalEventId}`,
        roomId,
        intended,
        observed: intended,
      });
    } catch {
      coverage = 'indeterminate' as const;
    }
    if (coverage === 'does_not_cover') return this.fail(commandId, 'authorization_does_not_cover');
    if (coverage !== 'covers') return this.fail(commandId, 'authorization_indeterminate');

    let identity: ExecutionIdentity;
    try {
      identity = await planner.attest();
    } catch {
      return this.fail(commandId, 'attestation_failed');
    }
    if (
      identity.role !== PLANNER_ROLE
      || identity.provider !== intended.provider
      || identity.model !== intended.model
      || identity.surface !== intended.executionSurface
      || typeof identity.executionId !== 'string'
      || identity.executionId.trim() === ''
    ) {
      return this.fail(commandId, 'identity_mismatch');
    }
    await this.deps.journal.appendCommandEvent({ eventType: 'identity_bound', commandId, executionId: identity.executionId, evidenceRefs: [] });

    let receipt: PlannerDispatchReceipt;
    try {
      receipt = await planner.dispatch({ commandId, roomId, ...inputs });
    } catch {
      return this.unresolved(commandId, 'dispatch outcome unknown: contact cannot be ruled out');
    }
    if (receipt.kind === 'not_sent') return this.fail(commandId, 'not_sent');
    const observed = receipt.observed;
    await this.deps.journal.appendCommandEvent({
      eventType: 'dispatched',
      commandId,
      provider: observed.provider,
      model: observed.model,
      executionSurface: observed.executionSurface,
      evidenceRefs: [],
    });
    if (
      observed.provider !== intended.provider
      || observed.model !== intended.model
      || observed.executionSurface !== intended.executionSurface
    ) {
      return this.fail(commandId, 'route_mismatch');
    }

    let result: PlannerResult;
    try {
      result = await planner.awaitPlan(commandId);
    } catch {
      return this.unresolved(commandId, 'plan outcome unknown');
    }
    if (result.kind === 'failed') return this.fail(commandId, 'planner_reported_failure');

    const verdict = judgeRoundPlan(result.document, inputs);
    if (!verdict.ok) return this.fail(commandId, verdict.classification);

    const submitted = await submitRoundPlan(this.submitDeps(), {
      roomId,
      commandId,
      observed,
      document: result.document,
      planHash: verdict.planHash,
      terminal: 'completed',
    });
    switch (submitted.kind) {
      case 'plan_review':
        return { kind: 'plan_review', commandId, planHash: verdict.planHash, eventId: submitted.eventId };
      case 'interrupted':
        return { kind: 'interrupted', commandId, committed: submitted.committed };
      case 'completion_refused':
        if (submitted.coverage === 'does_not_cover') return this.fail(commandId, 'completion_not_covered');
        return this.unresolved(commandId, `completion not determinable (${submitted.coverage})`);
      case 'plan_refused':
        return this.fail(commandId, 'plan_refused');
      case 'superseded':
        return this.fail(commandId, 'round_superseded');
    }
  }

  private submitDeps(): SubmitDeps {
    return { ledger: this.deps.ledger, journal: this.deps.journal, plans: this.deps.plans, route: this.deps.route, now: this.now, mintEventId: this.mintEventId };
  }

}

// ---------------------------------------------------------------------------
// Shared with recovery: the plan check, the T3 transaction, the round inputs

/** Whether a returned document is a ready plan inside the round's captured repository, base and scope. */
export function judgeRoundPlan(
  document: unknown,
  inputs: RoundInputs,
): { readonly ok: true; readonly planHash: string } | { readonly ok: false; readonly classification: 'plan_invalid' | 'plan_outside_captured_scope' } {
  const verdict = judgePlanDoc(document);
  if (!verdict.ok || !verdict.readyForDecision) return { ok: false, classification: 'plan_invalid' };
  const plan = verdict.document;
  if (
    plan.repository !== inputs.repository
    || plan.base_sha !== inputs.baseSha
    || !plan.scope_paths.every((path) => isWithinScope(path, inputs.scopePaths))
  ) {
    return { ok: false, classification: 'plan_outside_captured_scope' };
  }
  return { ok: true, planHash: verdict.planHash };
}

export interface SubmitDeps {
  readonly ledger: Pick<PostgresLedgerStore, 'appendDerived'>;
  readonly journal: Pick<JournalStore, 'inTransaction'>;
  readonly plans: Pick<PlanStore, 'inTransaction'>;
  readonly route: Pick<PlannerRoute, 'actorId'>;
  readonly now: () => Date;
  readonly mintEventId: () => string;
}

export interface SubmitRequest {
  readonly roomId: string;
  readonly commandId: string;
  readonly observed: ObservedRoute;
  readonly document: unknown;
  readonly planHash: string;
  /**
   * The command's terminal row in the T3 transaction: `completed` for a
   * round still running, or a `resolved` completed determination
   * (`reconciled`) for one recovery is resolving. Either is subject to the
   * journal's completion test.
   */
  readonly terminal: 'completed' | 'resolved';
}

export type SubmitOutcome =
  | { readonly kind: 'plan_review'; readonly eventId: string }
  | { readonly kind: 'completion_refused'; readonly coverage: 'does_not_cover' | 'indeterminate' | 'no_resolver' }
  | { readonly kind: 'plan_refused' }
  | { readonly kind: 'superseded' }
  | { readonly kind: 'interrupted'; readonly committed: boolean };

/**
 * T3, the stored plan and the command's terminal row, in ONE transaction
 * (journal contract §1.4). A refused completion, a refused plan or a room
 * whose current round is no longer this one leaves nothing of it.
 */
export async function submitRoundPlan(deps: SubmitDeps, request: SubmitRequest): Promise<SubmitOutcome> {
  const { roomId, commandId, observed, document, planHash } = request;
  const eventId = deps.mintEventId();
  let appended;
  try {
    appended = await deps.ledger.appendDerived(roomId, {
      build: async (_client, current) => {
        const rounds = plannerRoundsOf(roomId, current);
        if (current.state !== 'PLANNING' || rounds[rounds.length - 1]?.commandId !== commandId) {
          throw new RoundStateChangedError('the round is no longer the room’s current round');
        }
        const plan = judgePlanDoc(document);
        if (!plan.ok) throw new Error('a judged plan no longer judges');
        return {
          eventId,
          event: 'plan.submitted',
          actor: 'agent.planner',
          attribution: {
            roleId: PLANNER_ROLE,
            actorId: deps.route.actorId,
            actualModel: observed.model,
            executionSurface: observed.executionSurface,
          },
          scope: { roomId, repo: plan.document.repository, paths: [...plan.document.scope_paths] },
          evidence: [{ kind: 'plandoc', ref: commandId, digest: planHash }],
          occurredAt: deps.now().toISOString(),
          facts: { planDocSchemaValid: true, planHash: plan.planHash },
        } as LifecycleEvent;
      },
      afterTransition: async (client, { entry }) => {
        await deps.plans.inTransaction(client).recordPlan({ roomId, commandId, lifecycleEventId: entry.eventId, document });
        const lifecycleEventRef = { roomId, eventId: entry.eventId };
        const evidenceRefs = [`plandoc/${planHash}`];
        return deps.journal.inTransaction(client).appendCommandEvent(
          request.terminal === 'completed'
            ? { eventType: 'completed', commandId, lifecycleEventRef, evidenceRefs }
            : {
                eventType: 'resolved',
                commandId,
                resolutionDetermination: 'completed',
                resolutionSemantics: 'reconciled',
                lifecycleEventRef,
                evidenceRefs,
              },
        );
      },
    });
  } catch (error) {
    if (error instanceof JournalCompletionRefusedError) return { kind: 'completion_refused', coverage: error.coverage };
    if (error instanceof PlanRefusedError) return { kind: 'plan_refused' };
    if (error instanceof RoundStateChangedError) return { kind: 'superseded' };
    throw error;
  }
  const result = appended.result;
  if (!result.ok && result.outcome === 'not_leader') return { kind: 'interrupted', committed: result.committed };
  // The reducer refused T3 (its rejection is recorded) or replayed it: no plan was submitted.
  if (!result.ok || result.outcome !== 'transition' || appended.after === null) return { kind: 'superseded' };
  return { kind: 'plan_review', eventId };
}

/**
 * The inputs of the round whose command is `commandId`, read under the room
 * lock, with the room's state and whether that round is still its latest.
 * `null` when no round of the room derives that command id.
 */
export async function readRoundInputs(
  ledger: Pick<PostgresLedgerStore, 'underRoomLock'>,
  roomId: string,
  commandId: string,
): Promise<{ readonly inputs: RoundInputs; readonly state: LedgerState['state']; readonly latest: boolean } | null | 'not_leader'> {
  const locked = await ledger.underRoomLock(roomId, async (client, current) => {
    const rounds = plannerRoundsOf(roomId, current);
    const index = rounds.findIndex((round) => round.commandId === commandId);
    if (index < 0) return null;
    const round = rounds[index] as PlannerRound;
    const inputs = await roundInputs(client, roomId, current, round.opening.transition === 'T4' ? round.opening : null);
    return { inputs, state: current.state, latest: index === rounds.length - 1 };
  });
  return locked.status === 'not_leader' ? 'not_leader' : locked.value;
}

/** G2's `rolesAssigned`: all three seats, the planner seat in the architect role on the route's model. */
function rolesAssigned(roles: RoomRoleAssignment | null, route: PlannerRoute): boolean {
  if (roles === null) return false;
  return (
    roles.planner.roleId === PLANNER_ROLE
    && roles.planner.model === route.intendedModel
    && roles.builder.roleId === 'builder'
    && roles.reviewer.roleId === 'independent-reviewer'
  );
}

/** What the round plans for: the T1 scope and base, and on a revision the T4 feedback. */
async function roundInputs(
  client: PoolClient,
  roomId: string,
  current: LedgerState,
  revisionOpening: LedgerEntry | null,
): Promise<RoundInputs> {
  const t1 = current.entries.find((entry) => entry.transition === 'T1');
  if (t1 === undefined) throw new RoundStateChangedError('the room has no captured scope');
  const facts = await client.query<{ base_sha: string | null }>(T1_FACTS_SQL, [roomId, t1.eventId]);
  const baseSha = facts.rows[0]?.base_sha;
  if (typeof baseSha !== 'string' || baseSha === '') throw new RoundStateChangedError('the captured scope carries no base sha');
  if (!checkScopePaths(t1.scope.paths).ok) throw new RoundStateChangedError('the captured scope paths are not canonical');
  const base: RoundInputs = { repository: t1.scope.repo, baseSha, scopePaths: [...t1.scope.paths], goalEventId: t1.eventId };
  if (revisionOpening === null) return base;
  const payload = await client.query<{ feedback: string | null }>(T4_PAYLOAD_SQL, [roomId, revisionOpening.eventId]);
  const feedback = payload.rows[0]?.feedback;
  const revised = revisionOpening.evidence.find((e) => e.kind === 'plandoc');
  if (typeof feedback !== 'string' || feedback === '' || revised === undefined) {
    throw new RoundStateChangedError('the revision request carries no feedback or no revised plan');
  }
  return { ...base, revision: { feedback, revisingPlanHash: revised.digest } };
}
