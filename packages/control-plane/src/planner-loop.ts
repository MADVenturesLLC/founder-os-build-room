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
 *        assignment, read through `roomRoles` — each seat `{ roleId,
 *        surface, model, provider? }`, `surface` an execution-surface id,
 *        `model` a model id or `null` (null: not bound by the act; the
 *        seat's approved lane decides at execution) and `provider` the
 *        resolved lane's provider, which no fact reads, the reviewer/builder
 *        distinctness read at the surface, never the model;
 *        `gatewayOnline` derived by
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
 * RETRIES (Founder answer to plan r1 Q8, "Retry only not_sent"). A command
 * is never dispatched twice. A round whose latest attempt failed `not_sent`
 * (it provably never left) may journal a new attempt, a new command id,
 * when the ratified budget's `retryBudgetTransition` allows it: two retries
 * per round. Any other failure ends the round, and a pending or unresolved
 * attempt blocks it. An interrupted round is reconciled by
 * `planner-recovery.ts`, which shares this module's plan check and T3
 * transaction. The Founder can cancel at any time once a planner command
 * exists; a cancel of a running round is unconfirmed (Q6,
 * `plan-decision.ts`), and the round reports `cancelled`.
 *
 * THE PLANNER is a `PlannerPort`. The Gateway's pull channel
 * (`gateway/planner-channel.ts`, plan r1 Q2b) is the real one: the
 * assigned Gateway collects each question on its signed poll and answers it
 * on its signed report. `server.ts` constructs no loop; the counted-run
 * surface (slice 10) constructs one per request behind its token, act,
 * deployment-id and registry checks, and answers 503 without them. The
 * entry act that names the active model and the seats (Q2a, Q7a) is
 * still not issued. The Gateway's Antigravity executor is
 * `gateway-daemon/src/agy-planner-executor.ts`, the one provider binding
 * FOUNDER-RULING-20261026-BR-PLANNER-EXECUTOR authorizes, on Gateway
 * `1880c12d` only.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { checkScopePaths } from '../../contracts/src/index.js';
import type { LedgerEntry, LedgerState, LifecycleEvent } from '../../ledger/src/index.js';
import { envelopeDigest, normalizeForJournal, type CommandEventRow, type GovernedCommandRequest } from '../../journal/src/index.js';
import type { ExecutionIdentity } from '../../madbridge-consumed/src/adapter/adapter-v1.js';
import { judgePlanDoc } from './plan-doc.js';
import { FOUNDER_GOAL_EVIDENCE_KIND, founderGoalDigest } from './founder-goal.js';
import {
  DISPATCH_POLICY,
  canonicalBucketKey,
  retryBudgetTransition,
  type DeploymentBucket,
  type RetryBudgetState,
} from '../../seat-registry/src/index.js';
import { PlanRefusedError, type PlanStore } from './plan-store.js';
import type { PostgresLedgerStore } from './store.js';
import {
  JournalCompletionRefusedError,
  JournalSequenceError,
  type CompletionAuthorizationResolver,
  type JournalStore,
} from './journal-store.js';

export const PLANNER_COMMAND_KIND = 'planner.invoke';
export const PLANNER_ROLE = 'architect';

/** The transitions that open a planning round. */
const ROUND_OPENERS = new Set(['T2', 'T4']);

/**
 * Attempts a round may journal: the first and the retries the ratified
 * budget allows (`DEC-20260716-02` item 5: two per deployment within one
 * execution; plan r1 Q8). The budget itself is `retryBudgetTransition`'s.
 */
export const MAX_ROUND_ATTEMPTS = 1 + DISPATCH_POLICY.transport_retries_max;

/**
 * The planner command of a round's attempt. `cmd_` namespace; 32 hex of
 * SHA-256 over a versioned, NUL-separated input, so no room, event and
 * attempt can collide with another by concatenation. Attempt 1 keeps the
 * input it had before retries existed, so its id is unchanged.
 */
export function plannerCommandIdFor(roomId: string, openingEventId: string, attempt = 1): string {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > MAX_ROUND_ATTEMPTS) {
    throw new RangeError(`attempt must be an integer from 1 to ${MAX_ROUND_ATTEMPTS}`);
  }
  const input = attempt === 1
    ? `build-room/planner-command/v1\u0000${roomId}\u0000${openingEventId}`
    : `build-room/planner-command/v1\u0000${roomId}\u0000${openingEventId}\u0000attempt-${attempt}`;
  const digest = createHash('sha256').update(input, 'utf8').digest('hex');
  return `cmd_planner_${digest.slice(0, 32)}`;
}

export interface PlannerRound {
  /** The T2 or T4 entry that opened the round. */
  readonly opening: LedgerEntry;
  /** Attempt 1's command id. */
  readonly commandId: string;
  /** Every attempt's command id, attempt 1 first; only journaled ones exist. */
  readonly commandIds: readonly string[];
}

/** Every round the room's ledger has opened, oldest first. */
export function plannerRoundsOf(roomId: string, state: LedgerState): readonly PlannerRound[] {
  return state.entries
    .filter((entry) => ROUND_OPENERS.has(entry.transition))
    .map((opening) => {
      const commandIds = Array.from({ length: MAX_ROUND_ATTEMPTS }, (_, i) => plannerCommandIdFor(roomId, opening.eventId, i + 1));
      return { opening, commandId: commandIds[0] as string, commandIds };
    });
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
  /** The Founder goal captured with the scope, and its recorded digest (plan r1 Q7c). */
  readonly goal: string;
  readonly goalDigest: string;
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
 * locally with no provider contact, for the one command the execution will
 * run. `dispatch` and `awaitPlan` throw when
 * the outcome is unknown; the loop then records `unresolved`, never a guess.
 * `reconcile` is recovery's question (`planner-recovery.ts`); it throws when
 * the Planner cannot answer, and an answer it cannot give is never assumed.
 */
export interface PlannerPort {
  attest(commandId: string): Promise<ExecutionIdentity>;
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
  /** The seat lane the route is, as the retry budget keys its deployment buckets. */
  readonly laneLabel: string;
}

/** One assigned seat. */
export interface SeatAssignment {
  readonly roleId: string;
  /** The seat's execution surface: an execution-surface id, never a model. */
  readonly surface: string;
  /**
   * The seat's model id, or `null` when the assigning act binds no model.
   * `null` means "not bound by the act — the seat's approved lane decides at
   * execution", and the value is never a surface id.
   */
  readonly model: string | null;
  /**
   * The provider of the approved lane the seat resolved to, when the
   * assigning act resolved one; the counted run always does. No guard reads
   * it and the journal does not record it: `reviewerIsNotBuilder` compares
   * surfaces, and boot has already refused a same-provider reviewer
   * (`DEC-20261020-01` clause 7).
   */
  readonly provider?: string;
}

/**
 * A room's role assignment, as G2 reads it. Who assigns it is not ruled
 * (plan r1 Q2). Each seat is a `SeatAssignment`: a role id, an
 * execution-surface id, a model id or `null` (not bound by the act —
 * the seat's approved lane decides at execution), and optionally the
 * resolved lane's provider. `reviewerIsNotBuilder`
 * reads the two seats' surfaces — two surfaces that resolve to the same
 * model are still distinct — while `rolesAssigned` still reads the
 * planner's model against the route's intended model.
 */
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
  | {
      readonly kind: 'refused';
      readonly code: 'not_plannable' | 'round_already_open' | 'round_failed' | 'retry_budget_exhausted' | 'guard_failed' | 'not_leader';
      readonly reason: string;
    }
  /** The Founder cancelled the room while this command ran (plan r1 Q6); its rows stop at `unresolved`. */
  | { readonly kind: 'cancelled'; readonly commandId: string }
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
  readonly goal: string;
  readonly goalDigest: string;
  readonly revision?: { readonly feedback: string; readonly revisingPlanHash: string };
}

interface OpenedRound {
  readonly commandId: string;
  readonly opening: string;
  readonly inputs: RoundInputs;
}

const T1_FACTS_SQL = `SELECT e.payload->'facts'->>'baseSha' AS base_sha, e.payload->>'goal' AS goal
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
      else if (view.state.state === 'PLANNING') opened = await this.openNextAttempt(roomId);
      else return { kind: 'refused', code: 'not_plannable', reason: `a round opens from SCOPED or PLANNING, not ${view.state.state}` };
    } catch (error) {
      if (error instanceof RoundStateChangedError) return { kind: 'refused', code: 'not_plannable', reason: error.reason };
      throw error;
    }
    if ('kind' in opened) return opened;
    return this.execute(roomId, opened);
  }

  // ---- opening a round ----------------------------------------------------

  private plannerRequest(
    roomId: string,
    commandId: string,
    openingEventId: string,
    inputs: RoundInputs,
    retryOf: string | null = null,
  ): GovernedCommandRequest {
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
      // Each retry is logged with its reason (DEC-20260716-02 item 5).
      evidenceRefs: [
        `scope.captured/${inputs.goalEventId}`,
        `founder-goal/${inputs.goalDigest}`,
        ...(retryOf === null ? [] : [`retry-of/${retryOf}`, 'retry-reason/not_sent']),
      ],
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
            reviewerIsNotBuilder: roles !== null && roles.reviewer.surface !== roles.builder.surface,
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

  /**
   * Under the room lock, in PLANNING: journal the round's next command. That
   * is attempt 1 of a revision round T4 opened, or a retry of a round whose
   * latest attempt failed as `not_sent` — the only retry the Founder's Q8
   * answer allows — when `retryBudgetTransition` allows it. Anything else
   * opens nothing.
   */
  private async openNextAttempt(roomId: string): Promise<OpenedRound | PlannerRoundOutcome> {
    const locked = await this.deps.ledger.underRoomLock(roomId, async (client, current): Promise<OpenedRound | PlannerRoundOutcome> => {
      if (current.state !== 'PLANNING') throw new RoundStateChangedError(`the room left PLANNING (now ${current.state})`);
      const latest = plannerRoundsOf(roomId, current).at(-1);
      if (latest === undefined) throw new RoundStateChangedError('the room in PLANNING has no round');
      const tx = this.deps.journal.inTransaction(client);
      const journaled: { readonly commandId: string; readonly rows: readonly CommandEventRow[]; readonly outcome: string }[] = [];
      for (const commandId of latest.commandIds) {
        const history = await tx.commandHistory(commandId);
        if (history.state === null) break;
        const rows = history.entries.flatMap((e) => (e.decoded.recordClass === 'command' ? [e.decoded.row] : []));
        journaled.push({ commandId, rows, outcome: history.state.outcome });
      }
      const last = journaled.at(-1);
      if (last === undefined && latest.opening.transition === 'T2') {
        throw new RoundStateChangedError('the round T2 opened has no journaled command');
      }
      if (last !== undefined) {
        if (last.outcome !== 'failed') {
          return { kind: 'refused', code: 'round_already_open', reason: `the round's latest command is ${last.outcome}` };
        }
        const failed = last.rows.at(-1);
        if (failed?.eventType !== 'failed' || failed.failureClassification !== 'not_sent') {
          return { kind: 'refused', code: 'round_failed', reason: 'only a not_sent failure is retried (plan r1 Q8)' };
        }
        const budget = retryBudgetTransition(this.retryState(roomId, latest, journaled), { kind: 'retry_request', bucket: this.bucket() });
        if (!budget.allowed || journaled.length >= MAX_ROUND_ATTEMPTS) {
          return { kind: 'refused', code: 'retry_budget_exhausted', reason: budget.reason };
        }
      }
      const commandId = latest.commandIds[journaled.length] as string;
      const inputs = await roundInputs(client, roomId, current, latest.opening.transition === 'T4' ? latest.opening : null);
      await tx.appendJournaled(this.plannerRequest(roomId, commandId, latest.opening.eventId, inputs, last?.commandId ?? null), {
        roomId,
        lifecycleEventRef: { roomId, eventId: latest.opening.eventId },
      });
      return { commandId, opening: latest.opening.eventId, inputs };
    });
    if (locked.status === 'not_leader') {
      return { kind: 'refused', code: 'not_leader', reason: 'the fence refused the round' };
    }
    return locked.value;
  }

  /** The planner route as the retry budget keys it. */
  private bucket(): DeploymentBucket {
    const { route } = this.deps;
    return { seat_id: 'architect', lane_label: route.laneLabel, surface_id: route.intendedSurface, model_id: route.intendedModel, mode: null };
  }

  /**
   * The budget state of one round, derived from its journaled attempts: one
   * execution per round, so a round that completed is closed and a later
   * revision round starts a fresh budget. Every attempt after the first is a
   * consumed retry; any attempt not yet terminal is an unknown outcome.
   */
  private retryState(
    roomId: string,
    round: PlannerRound,
    journaled: readonly { readonly outcome: string }[],
  ): RetryBudgetState {
    const key = canonicalBucketKey(this.bucket());
    const retries = Math.min(journaled.length - 1, DISPATCH_POLICY.transport_retries_max) as 0 | 1 | 2;
    return {
      family: {
        room: roomId,
        run: round.opening.eventId,
        execution: round.commandId,
        repository_scope: round.opening.scope.repo,
        authorization: this.deps.route.authorizationRef,
      },
      consumed: retries === 0 ? {} : { [key]: retries },
      exhausted: retries >= DISPATCH_POLICY.transport_retries_max ? [key] : [],
      failovers_used: 0,
      pending_unknown_outcome: journaled.some((attempt) => attempt.outcome === 'pending' || attempt.outcome === 'unresolved'),
      closed: journaled.some((attempt) => attempt.outcome === 'completed'),
    };
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

  /**
   * Run an opened round. If the Founder cancels the room meanwhile, the
   * cancel marks this command `unresolved` (plan r1 Q6), and the round's
   * next append is refused as out of sequence: that is reported as
   * `cancelled`, never retried and never treated as success.
   */
  private async execute(roomId: string, round: OpenedRound): Promise<PlannerRoundOutcome> {
    try {
      return await this.executeRound(roomId, round);
    } catch (error) {
      if (error instanceof JournalSequenceError && (await this.deps.ledger.loadRoom(roomId)).state.state === 'CLOSED_ABANDONED') {
        return { kind: 'cancelled', commandId: round.commandId };
      }
      throw error;
    }
  }

  private async executeRound(roomId: string, round: OpenedRound): Promise<PlannerRoundOutcome> {
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
      identity = await planner.attest(commandId);
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
        if (current.state !== 'PLANNING' || !(rounds.at(-1)?.commandIds.includes(commandId) ?? false)) {
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
    const index = rounds.findIndex((round) => round.commandIds.includes(commandId));
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
  const facts = await client.query<{ base_sha: string | null; goal: string | null }>(T1_FACTS_SQL, [roomId, t1.eventId]);
  const baseSha = facts.rows[0]?.base_sha;
  if (typeof baseSha !== 'string' || baseSha === '') throw new RoundStateChangedError('the captured scope carries no base sha');
  if (!checkScopePaths(t1.scope.paths).ok) throw new RoundStateChangedError('the captured scope paths are not canonical');
  // The goal is required to plan (plan r1 Q7c), and must still be the goal whose digest T1 recorded.
  const goal = facts.rows[0]?.goal;
  const recorded = t1.evidence.filter((e) => e.kind === FOUNDER_GOAL_EVIDENCE_KIND);
  if (typeof goal !== 'string' || goal.trim() === '' || recorded.length === 0) {
    throw new RoundStateChangedError('the captured scope carries no Founder goal');
  }
  const goalDigest = founderGoalDigest(goal);
  if (recorded.length !== 1 || recorded[0]?.digest !== goalDigest) {
    throw new RoundStateChangedError('the captured goal does not match the digest its scope capture recorded');
  }
  const base: RoundInputs = {
    repository: t1.scope.repo,
    baseSha,
    scopePaths: [...t1.scope.paths],
    goalEventId: t1.eventId,
    goal,
    goalDigest,
  };
  if (revisionOpening === null) return base;
  const payload = await client.query<{ feedback: string | null }>(T4_PAYLOAD_SQL, [roomId, revisionOpening.eventId]);
  const feedback = payload.rows[0]?.feedback;
  const revised = revisionOpening.evidence.find((e) => e.kind === 'plandoc');
  if (typeof feedback !== 'string' || feedback === '' || revised === undefined) {
    throw new RoundStateChangedError('the revision request carries no feedback or no revised plan');
  }
  return { ...base, revision: { feedback, revisingPlanHash: revised.digest } };
}
