/**
 * The plan under a room's latest T3, for reading
 * (FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL-FIXES B2).
 *
 * `GET /control-plane/rooms/:roomId/plan`, behind the control plane's API
 * token, answers the plan the room's latest T3 (`plan.submitted`) submitted,
 * as the plan store returns it: parsed, judged again and its hash recomputed
 * (`plan-store.ts`). T3 carries only the plan's hash, so before this route
 * the Founder could not read from the record the plan they were deciding on
 * (the rehearsal of 2026-11-03).
 *
 * It reads and never writes: no ledger append, no journal row, no lease. It
 * decides nothing — the plan decision stays at `plan-decision.ts`, behind the
 * adjudication token alone. A room with no T3 answers 404, as does a room
 * that does not exist; a plan superseded by a newer T3 while it was read
 * answers 409 `plan_changed`.
 */

import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { LedgerState } from '../../ledger/src/index.js';
import { PlanIntegrityError, PlanStoreUnavailableError, type PlanStore } from './plan-store.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface PlanReadDeps {
  readonly ledger: { loadRoom(roomId: string): Promise<{ readonly exists: boolean; readonly state: LedgerState }> };
  readonly plans: Pick<PlanStore, 'planForEvent'>;
  /** The control plane's API-token guard. */
  readonly requireToken: RequestHandler;
}

export function planReadRouter(deps: PlanReadDeps): Router {
  const router = Router();
  router.get(
    '/control-plane/rooms/:roomId/plan',
    deps.requireToken,
    asyncRoute(async (req, res) => {
      const roomId = String(req.params['roomId'] ?? '');
      if (!UUID_RE.test(roomId)) {
        res.status(400).json({ error: 'invalid_request', message: 'roomId must be a lowercase UUID' });
        return;
      }
      const view = await deps.ledger.loadRoom(roomId);
      if (!view.exists) {
        res.status(404).json({ error: 'room_not_found' });
        return;
      }
      const t3 = latestT3(view);
      if (t3 === undefined) {
        res.status(404).json({ error: 'plan_not_found' });
        return;
      }
      try {
        const plan = await deps.plans.planForEvent(roomId, t3.eventId);
        if (plan === null) {
          res.status(404).json({ error: 'plan_not_found' });
          return;
        }
        // The room and the plan are two reads: a revision can land a newer T3
        // between them. The room is read again, and a plan that is no longer
        // the latest T3's is not served (Copilot, PR 143).
        if (latestT3(await deps.ledger.loadRoom(roomId))?.eventId !== t3.eventId) {
          res.status(409).json({ error: 'plan_changed' });
          return;
        }
        res.status(200).json({ roomId, commandId: plan.commandId, planHash: plan.planHash, document: plan.document });
      } catch (error) {
        if (error instanceof PlanStoreUnavailableError) {
          res.status(503).json({ error: 'plan_store_unavailable' });
          return;
        }
        if (error instanceof PlanIntegrityError) {
          res.status(500).json({ error: 'plan_integrity_failure' });
          return;
        }
        throw error;
      }
    }),
  );
  return router;
}

function latestT3(view: { readonly state: LedgerState }): { readonly eventId: string } | undefined {
  return [...view.state.entries].reverse().find((entry) => entry.transition === 'T3');
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}
