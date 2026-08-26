import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { PoolClient } from 'pg';
import { isCanonicalUuid } from '../../gateway-protocol/src/index.js';
import type { GatewayLeadership } from './gateway/leadership.js';
import { GATEWAY_BODY_LIMIT } from './gateway/routes.js';
import {
  Phase3RunConflictError,
  type Phase3RunStore,
  validatePhase3AdjudicationInput,
  validatePhase3AttemptInput,
  validatePhase3EventInput,
} from './phase3-run.js';

export interface Phase3RunRoutesDeps {
  readonly store: Phase3RunStore;
  readonly leadership: GatewayLeadership;
  readonly requireToken: RequestHandler;
  readonly requireAdjudicationToken: RequestHandler | null;
}

export function phase3RunRouter(deps: Phase3RunRoutesDeps): Router {
  const router = Router();
  const json = express.json({ limit: GATEWAY_BODY_LIMIT });

  router.post(
    '/control-plane/phase3/run-attempts',
    deps.requireToken,
    json,
    deps.leadership.requireLeader(),
    asyncRoute(async (req, res) => {
      const parsed = validatePhase3AttemptInput(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.code });
        return;
      }
      try {
        const result = await fencedWrite(deps, res, (client) =>
          deps.store.createAttemptFenced(client, parsed.value),
        );
        if (result === null) return;
        res.status(result.created ? 201 : 200).json(result);
      } catch (error) {
        conflict(res, error);
      }
    }),
  );

  if (deps.requireAdjudicationToken !== null) {
    router.post(
      '/control-plane/phase3/run-attempts/:runAttemptId/adjudication',
      deps.requireAdjudicationToken,
      json,
      deps.leadership.requireLeader(),
      asyncRoute(async (req, res) => {
        const runAttemptId = parameter(req.params['runAttemptId']);
        const parsed = validatePhase3AdjudicationInput(req.body);
        if (runAttemptId === null || !parsed.ok) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        try {
          const result = await fencedWrite(deps, res, (client) =>
            deps.store.adjudicateAttemptFenced(client, runAttemptId, parsed.value),
          );
          if (result === null) return;
          res.status(result.replayed ? 200 : 201).json(result);
        } catch (error) {
          conflict(res, error);
        }
      }),
    );
  }

  router.post(
    '/control-plane/phase3/run-attempts/:runAttemptId/events',
    deps.requireToken,
    json,
    deps.leadership.requireLeader(),
    asyncRoute(async (req, res) => {
      const runAttemptId = parameter(req.params['runAttemptId']);
      const parsed = validatePhase3EventInput(req.body);
      if (runAttemptId === null || !parsed.ok) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      try {
        const result = await fencedWrite(deps, res, (client) =>
          deps.store.appendEventFenced(client, runAttemptId, parsed.value),
        );
        if (result === null) return;
        res.status(result.accepted ? (result.replayed ? 200 : 201) : 409).json(result);
      } catch (error) {
        conflict(res, error);
      }
    }),
  );

  router.get(
    '/control-plane/phase3/run-attempts/:runAttemptId/export',
    deps.requireToken,
    asyncRoute(async (req, res) => {
      const runAttemptId = parameter(req.params['runAttemptId']);
      if (runAttemptId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      try {
        res.status(200).json(await deps.store.exportAttempt(runAttemptId));
      } catch (error) {
        conflict(res, error);
      }
    }),
  );

  return router;
}

async function fencedWrite<T>(
  deps: Phase3RunRoutesDeps,
  res: Response,
  body: (client: PoolClient) => Promise<T>,
): Promise<T | null> {
  const outcome = await deps.leadership.runFenced<T>(
    {
      pipeline: 'phase3Run',
      takeL0: true,
      takeRegistryLock: true,
      verifyServingGeneration: true,
    },
    async ({ client }) => ({ value: await body(client), commit: true }),
  );
  if (outcome.status === 'published' || outcome.status === 'rolled_back') return outcome.value;
  if (outcome.status === 'not_leader') {
    res.status(503).json({ error: 'not_leader' });
    return null;
  }
  res.status(500).json({ error: 'commit_failed' });
  return null;
}

function parameter(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  const lowered = value.toLowerCase();
  return isCanonicalUuid(lowered) ? lowered : null;
}

function conflict(res: Response, error: unknown): void {
  if (!(error instanceof Phase3RunConflictError)) throw error;
  const status = error.code === 'attempt_not_found' ? 404 : 409;
  res.status(status).json({ error: error.code });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}
