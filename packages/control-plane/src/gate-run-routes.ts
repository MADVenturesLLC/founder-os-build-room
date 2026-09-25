/**
 * The persisted gate-run sequence over HTTP (`docs/phase-2-known-limits.md` §2).
 *
 *   POST /gate/runs  — append one run; the store assigns `seq`
 *   GET  /gate/runs  — the whole persisted sequence, in `seq` order
 *
 * Both routes take the SAME shared-token guard as the room routes, passed in
 * by `createServer` — there is one guard, not a second scheme. The body parser
 * is mounted after the guard, so an unauthenticated body is never parsed.
 *
 * An unreachable store answers 503 `gate_run_store_unavailable`. It is never
 * answered as an empty list or an accepted write: the harness treats either
 * as a hard failure, and a 2xx here would be the memory fallback the design
 * rules out under a different name.
 */

import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import {
  GATE_RUN_GATES,
  GateRunConflictError,
  GateRunStoreUnavailableError,
  type PersistedGateRun,
  type PostgresLedgerStore,
  validateGateRunBody,
} from './store.js';

/**
 * A run record carries steps, conditions and their observations — the dwell
 * samples alone run to kilobytes — so the limit is larger than the room
 * routes' and still bounded.
 */
export const GATE_RUN_BODY_LIMIT = '512kb';

export interface GateRunRoutesDeps {
  readonly store: Pick<PostgresLedgerStore, 'appendGateRun' | 'listGateRuns'>;
  readonly requireToken: RequestHandler;
}

export function gateRunRouter(deps: GateRunRoutesDeps): Router {
  const router = Router();
  const json = express.json({ limit: GATE_RUN_BODY_LIMIT });

  router.post(
    '/gate/runs',
    deps.requireToken,
    json,
    asyncRoute(async (req, res) => {
      const parsed = validateGateRunBody(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: 'invalid_request', message: parsed.reason });
        return;
      }
      try {
        const { run, created } = await deps.store.appendGateRun(parsed.value);
        res.status(created ? 201 : 200).json({ gate: run.gate, run: asRunRecord(run), created });
      } catch (error) {
        if (!answerStoreFailure(res, error)) throw error;
      }
    }),
  );

  router.get(
    '/gate/runs',
    deps.requireToken,
    asyncRoute(async (_req, res) => {
      try {
        const runs = await deps.store.listGateRuns();
        res.status(200).json({ gate: GATE_RUN_GATES[0], runs: runs.map(asRunRecord) });
      } catch (error) {
        if (!answerStoreFailure(res, error)) throw error;
      }
    }),
  );

  return router;
}

/** The run as the harness knows it — its own record, with the store's `seq` and receipt time. */
function asRunRecord(run: PersistedGateRun): Record<string, unknown> {
  return { ...run.record, seq: run.seq, recordedAt: run.recordedAt };
}

function answerStoreFailure(res: Response, error: unknown): boolean {
  if (error instanceof GateRunStoreUnavailableError) {
    res.status(503).json({ error: 'gate_run_store_unavailable' });
    return true;
  }
  if (error instanceof GateRunConflictError) {
    res.status(409).json({ error: 'run_id_conflict' });
    return true;
  }
  return false;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}
