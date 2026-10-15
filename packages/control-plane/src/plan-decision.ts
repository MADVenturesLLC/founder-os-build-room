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
 * `founder.cancel` (T22) is not served: a cancel before any planner command
 * exists has no `command_id` for its decision row under Q3, and the Founder
 * has not ruled the case (plan r1, Q5). It answers 501.
 */

import { createHash, randomUUID } from 'node:crypto';
import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { checkScopePaths } from '../../contracts/src/index.js';
import { snapshot, type LedgerState, type LifecycleEvent } from '../../ledger/src/index.js';
import { containsCredentialMaterial, isHex64 } from '../../journal/src/index.js';
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

const SERVED = ['plan.approved', 'plan.revision_requested'] as const;
type ServedDecision = (typeof SERVED)[number];

export interface PlanDecisionRequest {
  readonly decision: ServedDecision;
  readonly planHash: string;
  readonly feedback?: string;
  readonly eventId?: string;
  readonly actualModel: string;
  readonly executionSurface: string;
}

export type PlanDecisionValidation =
  | { readonly ok: true; readonly value: PlanDecisionRequest }
  | { readonly ok: false; readonly status: 400 | 501; readonly error: string; readonly message: string };

const KNOWN = new Set(['decision', 'planHash', 'feedback', 'eventId', 'attribution']);

/** Validate the body. Reasons name fields and never echo a value. */
export function validatePlanDecisionBody(body: unknown): PlanDecisionValidation {
  const bad = (message: string): PlanDecisionValidation => ({ ok: false, status: 400, error: 'invalid_request', message });
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return bad('body must be an object');
  const b = body as Record<string, unknown>;
  for (const key of Object.keys(b)) if (!KNOWN.has(key)) return bad('body carries a field outside the plan-decision shape');
  if (b['decision'] === 'founder.cancel') {
    return {
      ok: false,
      status: 501,
      error: 'founder_cancel_unavailable',
      message: 'founder.cancel awaits a Founder ruling on its command binding (plan r1, Q5)',
    };
  }
  if (!SERVED.includes(b['decision'] as ServedDecision)) return bad('decision must be plan.approved or plan.revision_requested');
  const decision = b['decision'] as ServedDecision;
  if (typeof b['planHash'] !== 'string' || !isHex64(b['planHash'])) return bad('planHash must be 64 lowercase hex characters');
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
      planHash: b['planHash'],
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

export interface PlanDecisionDeps {
  readonly ledger: Pick<PostgresLedgerStore, 'appendDerived'>;
  readonly plans: Pick<PlanStore, 'inTransaction'>;
  readonly journal: Pick<JournalStore, 'inTransaction'>;
  readonly now?: () => Date;
  readonly mintEventId?: () => string;
}

interface Decided {
  readonly plan: StoredPlan;
  readonly journal: AppendedRecord;
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

  const appended = await deps.ledger.appendDerived<Decided>(roomId, {
    build: async (client, current) => {
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
      if (plan === null) throw new PlanUnderReviewMissingError();
      const journal = await deps.journal.inTransaction(client).appendDecision({
        commandId: plan.commandId,
        decision: request.decision,
        recordedState: entry.fromState,
        planHash: plan.planHash,
        authorizationRef: PLAN_DECISION_AUTHORIZATION_REF,
        lifecycleEventRef: { roomId, eventId: entry.eventId },
      });
      return { plan, journal };
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
          planHash: decided.plan.planHash,
          plannerCommandId: decided.plan.commandId,
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
