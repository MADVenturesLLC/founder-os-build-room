/**
 * The Founder's plan decision — Phase 4 steps 3 to 6, plan r1 slice 5.
 *
 * `POST /control-plane/rooms/:roomId/plan-decision` records T5
 * (`plan.approved`) or T4 (`plan.revision_requested`). It is the only way
 * either event enters a ledger: the generic room route refuses both (slice
 * 1, `governed-events.ts`).
 *
 * Authentication (journal contract §8.2, ruled): the Founder-held
 * `PHASE3_ADJUDICATION_TOKEN` and the exact `plan_hash` being decided. With
 * the token unset the route answers 503 `plan_decision_disabled` before it
 * reads the body: fail closed, and no fallback to `CONTROL_PLANE_TOKEN` or
 * any other credential.
 *
 * Nothing a caller asserts becomes a guard fact. The decision runs inside the
 * room's own append transaction, after the room lock (L3), so the plan it
 * decides is the one under review at the instant the decision lands:
 *
 *   1. the plan under review is the one the room's latest T3 submitted; the
 *      plan store returns it, judged again with its hash recomputed;
 *   2. the event is built by the server: actor `founder`, attribution with
 *      no role (direct-Founder work), scope from the plan, the plan as
 *      evidence, the server's clock, and for T5 the facts G5 reads —
 *      `planHash` (the stored plan's), `expectedPlanHash` (the hash the
 *      Founder submitted) and `scopePathsCanonical` (checked here); for T4,
 *      `feedbackAttached` from the feedback the Founder sent;
 *   3. the reducer decides. A hash mismatch is G5's rejection, recorded like
 *      every rejection. For T4, whose guard reads no hash, the hash is
 *      checked here first and a mismatch is refused before the ledger;
 *   4. after a transition, the decision record is journaled on the same
 *      client (`JournalStore.inTransaction`), bound to the planner command
 *      that produced the plan (Q3). If that append fails, the transition
 *      rolls back with it: the decision takes effect only when both commit
 *      (contract §1.4).
 *
 * `founder.cancel` (T22), under the Founder's Q5 ruling of 2026-10-15
 * ("allow cancel only once a planner command exists, and leave pre-planning
 * cancel unavailable. No migration and no stand-in values"):
 *
 *   - the decision row is bound to the room's latest planner command, the
 *     way Q3 binds plan decisions. The room's planner commands are the ones
 *     its T2 and T4 entries opened (`plannerRoundsOf`) that the journal
 *     holds, read on the locked transaction;
 *   - a room with none (ROOM_CREATED, SCOPED, or a round never journaled)
 *     answers 409 `founder_cancel_unavailable`, writing nothing;
 *   - G22's fact is derived, never accepted: `runningTasksCancelled` is
 *     asserted only when every planner command of the room has reached
 *     `completed` or `failed`, so no task is running. A command still
 *     pending, or `unresolved`, answers 409 `planner_command_in_flight`:
 *     Build Room has no way yet to cancel a running Planner or to record an
 *     unconfirmed cancel of one (plan r1 Q6), so it refuses instead;
 *   - `plan_hash` follows the decision row's plan-bearing rule: in a state
 *     that bears a plan the Founder must send the hash of the room's latest
 *     plan, and in one that does not (PLANNING) must send none. A RECONCILING
 *     room records its prior state.
 */

import { createHash, randomUUID } from 'node:crypto';
import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { checkScopePaths } from '../../contracts/src/index.js';
import { snapshot, type LedgerState, type LifecycleEvent } from '../../ledger/src/index.js';
import { containsCredentialMaterial, effectivePlanBearingState, isHex64, planHashRequired } from '../../journal/src/index.js';
import { plannerRoundsOf } from './planner-loop.js';
import type { PostgresLedgerStore } from './store.js';
import type { PlanStore, StoredPlan } from './plan-store.js';
import {
  JournalCredentialMaterialError,
  JournalRuntimeNotAuthorizedError,
  JournalSequenceError,
  JournalStoreUnavailableError,
  type AppendedRecord,
  type JournalStore,
} from './journal-store.js';

export const PLAN_DECISION_BODY_LIMIT = '64kb';
export const FEEDBACK_MAX_LENGTH = 20_000;

/**
 * The decision record's `authorization_ref`: the ruled credential that
 * authenticated the act (contract §8.2). It names the credential, never its
 * value, and is spelled with `/`, not `:` or `=`: `credential:<name>` reads
 * as a labelled secret to the journal's credential guard, which refuses it.
 */
export const PLAN_DECISION_AUTHORIZATION_REF = 'founder-credential/PHASE3_ADJUDICATION_TOKEN';

const SERVED = ['plan.approved', 'plan.revision_requested', 'founder.cancel'] as const;
type ServedDecision = (typeof SERVED)[number];

export interface PlanDecisionRequest {
  readonly decision: ServedDecision;
  /** Required for approve and revise; for cancel, exactly when the room bears a plan. */
  readonly planHash?: string;
  readonly feedback?: string;
  readonly eventId?: string;
  readonly actualModel: string;
  readonly executionSurface: string;
}

export type PlanDecisionValidation =
  | { readonly ok: true; readonly value: PlanDecisionRequest }
  | { readonly ok: false; readonly status: 400; readonly error: string; readonly message: string };

const KNOWN = new Set(['decision', 'planHash', 'feedback', 'eventId', 'attribution']);

/** Validate the body. Reasons name fields and never echo a value. */
export function validatePlanDecisionBody(body: unknown): PlanDecisionValidation {
  const bad = (message: string): PlanDecisionValidation => ({ ok: false, status: 400, error: 'invalid_request', message });
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return bad('body must be an object');
  const b = body as Record<string, unknown>;
  for (const key of Object.keys(b)) if (!KNOWN.has(key)) return bad('body carries a field outside the plan-decision shape');
  if (!SERVED.includes(b['decision'] as ServedDecision)) {
    return bad('decision must be plan.approved, plan.revision_requested or founder.cancel');
  }
  const decision = b['decision'] as ServedDecision;
  const planHash = b['planHash'];
  if (decision === 'founder.cancel') {
    if (planHash !== undefined && (typeof planHash !== 'string' || !isHex64(planHash))) {
      return bad('planHash, when present, must be 64 lowercase hex characters');
    }
  } else if (typeof planHash !== 'string' || !isHex64(planHash)) {
    return bad('planHash must be 64 lowercase hex characters');
  }
  const feedback = b['feedback'];
  if (decision === 'plan.revision_requested') {
    if (typeof feedback !== 'string' || feedback.trim() === '') return bad('feedback is required for plan.revision_requested');
    if (feedback.length > FEEDBACK_MAX_LENGTH) return bad(`feedback is longer than ${FEEDBACK_MAX_LENGTH}`);
  } else if (feedback !== undefined) {
    return bad('feedback is carried by plan.revision_requested alone');
  }
  const eventId = b['eventId'];
  if (eventId !== undefined && (typeof eventId !== 'string' || eventId.trim() === '' || eventId.length > 200)) {
    return bad('eventId, when present, must be a non-empty string of at most 200 characters');
  }
  const attribution = b['attribution'];
  if (typeof attribution !== 'object' || attribution === null || Array.isArray(attribution)) {
    return bad('attribution is required: { actualModel, executionSurface } of the relaying surface');
  }
  const a = attribution as Record<string, unknown>;
  for (const key of Object.keys(a)) {
    if (key !== 'actualModel' && key !== 'executionSurface') return bad('attribution carries a field outside { actualModel, executionSurface }');
  }
  if (typeof a['actualModel'] !== 'string' || a['actualModel'].trim() === '') return bad('attribution.actualModel is required');
  if (typeof a['executionSurface'] !== 'string' || a['executionSurface'].trim() === '') return bad('attribution.executionSurface is required');
  return {
    ok: true,
    value: {
      decision,
      ...(planHash === undefined ? {} : { planHash: planHash as string }),
      ...(decision === 'plan.revision_requested' ? { feedback: feedback as string } : {}),
      ...(eventId === undefined ? {} : { eventId: eventId as string }),
      actualModel: a['actualModel'],
      executionSurface: a['executionSurface'],
    },
  };
}

// ---------------------------------------------------------------------------
// The decision

export class PlanUnderReviewMissingError extends Error {
  override readonly name = 'PlanUnderReviewMissingError';
  readonly code = 'plan_not_found';
  constructor() {
    super('the room has no stored plan under review');
  }
}

export class PlanHashMismatchError extends Error {
  override readonly name = 'PlanHashMismatchError';
  readonly code = 'plan_hash_mismatch';
  constructor() {
    super('the submitted plan_hash is not the hash of the plan under review');
  }
}

/** Q5: no planner command exists for the room, so there is nothing to bind a cancel to. */
export class FounderCancelUnavailableError extends Error {
  override readonly name = 'FounderCancelUnavailableError';
  readonly code = 'founder_cancel_unavailable';
  constructor() {
    super('no planner command exists for this room: pre-planning cancel is unavailable in Phase 4');
  }
}

/** A planner command of the room has not reached completed or failed. */
export class PlannerCommandInFlightError extends Error {
  override readonly name = 'PlannerCommandInFlightError';
  readonly code = 'planner_command_in_flight';
  constructor() {
    super('a planner command of this room is still pending or unresolved');
  }
}

/** A cancel carried a plan_hash in a state that bears no plan. */
export class PlanHashNotApplicableError extends Error {
  override readonly name = 'PlanHashNotApplicableError';
  readonly code = 'plan_hash_not_applicable';
  constructor() {
    super('the room bears no plan in this state, so a cancel carries no plan_hash');
  }
}

export interface PlanDecisionDeps {
  readonly ledger: Pick<PostgresLedgerStore, 'appendDerived'>;
  readonly plans: Pick<PlanStore, 'inTransaction'>;
  readonly journal: Pick<JournalStore, 'inTransaction'>;
  readonly now?: () => Date;
  readonly mintEventId?: () => string;
}

interface Decided {
  /** The plan decided, or `null` for a cancel in a state that bears none. */
  readonly plan: StoredPlan | null;
  /** The planner command the decision row is bound to. */
  readonly commandId: string;
  readonly journal: AppendedRecord;
}

interface CancelBinding {
  readonly commandId: string;
  readonly priorState?: LedgerState['state'];
  readonly plan: StoredPlan | null;
}

/** The plan the room's latest T3 submitted, whatever state the room is in now. */
async function latestPlan(
  deps: PlanDecisionDeps,
  client: Parameters<PlanStore['inTransaction']>[0],
  roomId: string,
  current: LedgerState,
): Promise<StoredPlan | null> {
  const t3 = [...current.entries].reverse().find((entry) => entry.transition === 'T3');
  if (t3 === undefined) return null;
  return deps.plans.inTransaction(client).planForEvent(roomId, t3.eventId);
}

/**
 * What a cancel binds to, read under the room lock: the room's latest
 * journaled planner command, every planner command terminal, and the plan
 * when the state bears one. Throws the refusal otherwise.
 */
async function cancelBinding(
  deps: PlanDecisionDeps,
  client: Parameters<PlanStore['inTransaction']>[0],
  roomId: string,
  current: LedgerState,
  request: PlanDecisionRequest,
): Promise<CancelBinding> {
  const tx = deps.journal.inTransaction(client);
  let bound: string | null = null;
  for (const round of plannerRoundsOf(roomId, current)) {
    const history = await tx.commandHistory(round.commandId);
    if (history.state === null) continue;
    if (history.state.outcome !== 'completed' && history.state.outcome !== 'failed') throw new PlannerCommandInFlightError();
    bound = round.commandId;
  }
  if (bound === null) throw new FounderCancelUnavailableError();
  const priorState = current.state === 'RECONCILING' ? (current.priorState ?? undefined) : undefined;
  // Throws for RECONCILING with no prior state: the row cannot be written (contract §2).
  const effective = effectivePlanBearingState(current.state, priorState);
  if (!planHashRequired(effective)) {
    if (request.planHash !== undefined) throw new PlanHashNotApplicableError();
    return { commandId: bound, ...(priorState === undefined ? {} : { priorState }), plan: null };
  }
  const plan = await latestPlan(deps, client, roomId, current);
  if (plan === null) throw new PlanUnderReviewMissingError();
  if (request.planHash !== plan.planHash) throw new PlanHashMismatchError();
  return { commandId: bound, ...(priorState === undefined ? {} : { priorState }), plan };
}

/** The plan the room's latest T3 submitted, or `null` when there is none. */
async function planUnderReview(
  deps: PlanDecisionDeps,
  client: Parameters<PlanStore['inTransaction']>[0],
  roomId: string,
  current: LedgerState,
): Promise<StoredPlan | null> {
  if (current.state !== 'PLAN_REVIEW') return null;
  const t3 = [...current.entries].reverse().find((entry) => entry.transition === 'T3');
  if (t3 === undefined) return null;
  return deps.plans.inTransaction(client).planForEvent(roomId, t3.eventId);
}

export async function decidePlan(
  deps: PlanDecisionDeps,
  roomId: string,
  request: PlanDecisionRequest,
): Promise<{ readonly appended: Awaited<ReturnType<PostgresLedgerStore['appendDerived']>>; readonly decided: Decided | null }> {
  const now = deps.now ?? (() => new Date());
  const eventId = request.eventId ?? `evt_${randomUUID()}`;
  // Everything the caller supplies that reaches a stored row, each scanned on its own.
  if (containsCredentialMaterial([request.feedback ?? '', request.actualModel, request.executionSurface, eventId])) {
    throw new JournalCredentialMaterialError();
  }
  let plan: StoredPlan | null = null;
  let cancel: CancelBinding | null = null;

  const appended = await deps.ledger.appendDerived<Decided>(roomId, {
    build: async (client, current) => {
      if (request.decision === 'founder.cancel') {
        const binding = await cancelBinding(deps, client, roomId, current, request);
        cancel = binding;
        const t1 = current.entries.find((entry) => entry.transition === 'T1');
        return {
          eventId,
          event: 'founder.cancel',
          actor: 'founder',
          attribution: {
            roleId: null,
            actorId: 'founder',
            actualModel: request.actualModel,
            executionSurface: request.executionSurface,
          },
          scope: binding.plan === null
            ? { roomId, repo: t1?.scope.repo ?? '', paths: [...(t1?.scope.paths ?? [])] }
            : { roomId, repo: binding.plan.document.repository, paths: [...binding.plan.document.scope_paths] },
          evidence: binding.plan === null ? [] : [{ kind: 'plandoc', ref: binding.plan.commandId, digest: binding.plan.planHash }],
          occurredAt: now().toISOString(),
          // Derived by cancelBinding: every planner command of the room is terminal.
          facts: { runningTasksCancelled: true },
        } as LifecycleEvent;
      }
      plan = await planUnderReview(deps, client, roomId, current);
      if (request.decision === 'plan.revision_requested' && plan !== null && plan.planHash !== request.planHash) {
        throw new PlanHashMismatchError();
      }
      const event: LifecycleEvent & { readonly feedback?: string } = {
        eventId,
        event: request.decision,
        actor: 'founder',
        attribution: {
          roleId: null,
          actorId: 'founder',
          actualModel: request.actualModel,
          executionSurface: request.executionSurface,
        },
        scope: {
          roomId,
          repo: plan?.document.repository ?? '',
          paths: [...(plan?.document.scope_paths ?? [])],
        },
        evidence: plan === null ? [] : [{ kind: 'plandoc', ref: plan.commandId, digest: plan.planHash }],
        occurredAt: now().toISOString(),
        facts:
          request.decision === 'plan.approved'
            ? {
                ...(plan === null ? {} : { planHash: plan.planHash }),
                expectedPlanHash: request.planHash,
                scopePathsCanonical: plan !== null && checkScopePaths(plan.document.scope_paths).ok,
              }
            : { feedbackAttached: true },
        // The feedback the Planner revises against, kept in the event as
        // supplied; its digest is the evidence entry below for T4.
        ...(request.feedback === undefined ? {} : { feedback: request.feedback }),
      };
      if (request.feedback !== undefined) {
        const digest = createHash('sha256').update(request.feedback, 'utf8').digest('hex');
        return { ...event, evidence: [...event.evidence, { kind: 'founder_feedback', ref: eventId, digest }] };
      }
      return event;
    },
    afterTransition: async (client, { entry }) => {
      if (cancel !== null) {
        const bound: CancelBinding = cancel;
        const journal = await deps.journal.inTransaction(client).appendDecision({
          commandId: bound.commandId,
          decision: 'founder.cancel',
          recordedState: entry.fromState,
          ...(bound.priorState === undefined ? {} : { priorState: bound.priorState }),
          ...(bound.plan === null ? {} : { planHash: bound.plan.planHash }),
          authorizationRef: PLAN_DECISION_AUTHORIZATION_REF,
          lifecycleEventRef: { roomId, eventId: entry.eventId },
        });
        return { plan: bound.plan, commandId: bound.commandId, journal };
      }
      if (plan === null) throw new PlanUnderReviewMissingError();
      const decided: StoredPlan = plan;
      const journal = await deps.journal.inTransaction(client).appendDecision({
        commandId: decided.commandId,
        decision: request.decision,
        recordedState: entry.fromState,
        planHash: decided.planHash,
        authorizationRef: PLAN_DECISION_AUTHORIZATION_REF,
        lifecycleEventRef: { roomId, eventId: entry.eventId },
      });
      return { plan: decided, commandId: decided.commandId, journal };
    },
  });
  return { appended, decided: appended.after };
}

// ---------------------------------------------------------------------------
// The route

export interface PlanDecisionRouteDeps extends PlanDecisionDeps {
  /** `null` when `PHASE3_ADJUDICATION_TOKEN` is unset: the route refuses. */
  readonly requireAdjudicationToken: RequestHandler | null;
  readonly requireLeader: RequestHandler;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function planDecisionRouter(deps: PlanDecisionRouteDeps): Router {
  const router = Router();
  const json = express.json({ limit: PLAN_DECISION_BODY_LIMIT });
  const disabled: RequestHandler = (_req, res) => {
    res.status(503).json({ error: 'plan_decision_disabled' });
  };

  router.post(
    '/control-plane/rooms/:roomId/plan-decision',
    deps.requireAdjudicationToken ?? disabled,
    json,
    deps.requireLeader,
    asyncRoute(async (req, res) => {
      const roomId = String(req.params['roomId'] ?? '');
      if (!UUID_RE.test(roomId)) {
        res.status(400).json({ error: 'invalid_request', message: 'roomId must be a lowercase UUID' });
        return;
      }
      const parsed = validatePlanDecisionBody(req.body);
      if (!parsed.ok) {
        res.status(parsed.status).json({ error: parsed.error, message: parsed.message });
        return;
      }
      try {
        const { appended, decided } = await decidePlan(deps, roomId, parsed.value);
        const result = appended.result;
        if (!result.ok && result.outcome === 'not_leader') {
          res.status(503).json({ error: 'not_leader' });
          return;
        }
        if (!result.ok) {
          res.status(409).json({ roomId, outcome: 'rejected', code: result.code, reason: result.reason, snapshot: snapshot(result.state) });
          return;
        }
        if (result.outcome === 'replay') {
          // A replay is this decision again only if the event already applied
          // under that id IS this decision. An eventId that names another act
          // (the T3, say) decided nothing, and must not read as success.
          if (result.entry?.event !== parsed.value.decision) {
            res.status(409).json({ error: 'event_id_in_use' });
            return;
          }
          res.status(200).json({ roomId, outcome: 'replay', eventId: appended.event.eventId, snapshot: snapshot(result.state) });
          return;
        }
        if (result.outcome !== 'transition' || decided === null) {
          throw new Error('a plan decision produced neither a transition nor a refusal');
        }
        res.status(201).json({
          roomId,
          outcome: 'transition',
          decision: parsed.value.decision,
          eventId: appended.event.eventId,
          seq: result.seq,
          planHash: decided.plan?.planHash ?? null,
          plannerCommandId: decided.commandId,
          journal: { seq: decided.journal.seq, chainHash: decided.journal.chainHash },
          snapshot: snapshot(result.state),
        });
      } catch (error) {
        if (!answerDecisionFailure(res, error)) throw error;
      }
    }),
  );
  return router;
}

function answerDecisionFailure(res: Response, error: unknown): boolean {
  if (error instanceof FounderCancelUnavailableError) {
    res.status(409).json({ error: 'founder_cancel_unavailable', message: error.message });
    return true;
  }
  if (error instanceof PlannerCommandInFlightError) {
    res.status(409).json({ error: 'planner_command_in_flight' });
    return true;
  }
  if (error instanceof PlanHashNotApplicableError) {
    res.status(409).json({ error: 'plan_hash_not_applicable' });
    return true;
  }
  if (error instanceof PlanHashMismatchError) {
    res.status(409).json({ error: 'plan_hash_mismatch' });
    return true;
  }
  if (error instanceof PlanUnderReviewMissingError) {
    res.status(409).json({ error: 'plan_not_found' });
    return true;
  }
  if (error instanceof JournalSequenceError) {
    // e.g. the plan was already decided; the reason names rules, not values.
    res.status(409).json({ error: 'journal_sequence_violation', message: error.reason });
    return true;
  }
  if (error instanceof JournalCredentialMaterialError) {
    res.status(400).json({ error: 'credential_material' });
    return true;
  }
  if (error instanceof JournalRuntimeNotAuthorizedError) {
    res.status(503).json({ error: 'journal_runtime_not_authorized' });
    return true;
  }
  if (error instanceof JournalStoreUnavailableError) {
    res.status(503).json({ error: 'journal_store_unavailable' });
    return true;
  }
  return false;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}
