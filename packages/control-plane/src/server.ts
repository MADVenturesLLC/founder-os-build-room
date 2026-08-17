/**
 * The control plane's HTTP surface.
 *
 * Phase 2 is the cloud skeleton (`DEC-20260815-17`), so this is deliberately
 * the smallest surface that lets the Founder-defined run be performed and
 * judged:
 *
 *   deploy → health check → verify → teardown
 *
 * with a run passing only if the control plane deploys and stays up, connects
 * to Postgres and reads and writes correctly, and survives a restart without
 * data loss.
 *
 * `/health` answers the first condition, the room endpoints answer the second,
 * and the third is answered by the fact that no state lives in this process —
 * every read replays the durable log.
 *
 * Not here, deliberately: SSE/WebSocket projections, the decision queue, and
 * anything gateway-facing. Those belong to later phases and each needs its own
 * Founder-confirmed stop gate.
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { snapshot, type LifecycleEvent } from '../../ledger/src/index.js';
import type { Config } from './config.js';
import { probe } from './db.js';
import { PostgresLedgerStore, RoomNotFoundError } from './store.js';

export interface ServerDeps {
  readonly config: Config;
  readonly pool: Pool;
  readonly store: PostgresLedgerStore;
  /** Set once the boot sequence has migrated and is serving. */
  readonly startedAt: number;
}

/** Errors that carry an HTTP status the client should see. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createServer(deps: ServerDeps): Express {
  const { config, pool, store, startedAt } = deps;
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  /**
   * Liveness. Answers "is this process serving?" and nothing else — no
   * database call, deliberately. A liveness probe that fails on a database
   * blip asks the platform to restart a process that is working, which is the
   * opposite of what "deploys and stays up" needs.
   */
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  /**
   * Readiness. Answers "can this process serve a request that needs the
   * database?" — so it does hit the database, under a bounded timeout, and
   * reports 503 with the reason when it cannot.
   */
  app.get('/ready', async (_req: Request, res: Response) => {
    const result = await probe(pool, config.readyProbeTimeoutMs);
    if (!result.ok) {
      res.status(503).json({ status: 'unavailable', database: 'unreachable', ...result });
      return;
    }
    res.status(200).json({ status: 'ready', database: 'reachable', latencyMs: result.latencyMs });
  });

  /**
   * Identity of the running build. `commit` is `unknown` when the platform
   * supplied no SHA — reported honestly rather than guessed, because evidence
   * bound to a wrong SHA is worse than evidence bound to none.
   */
  app.get('/version', (_req: Request, res: Response) => {
    res.status(200).json({
      service: '@build-room/control-plane',
      commit: config.commitSha,
      environment: config.environment,
      node: process.version,
      startedAt: new Date(startedAt).toISOString(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  });

  app.post(
    '/rooms',
    asyncRoute(async (req: Request, res: Response) => {
      const roomId = requireUuid(req.body?.roomId, 'roomId');
      const { created } = await store.createRoom(roomId);
      res.status(created ? 201 : 200).json({ roomId, created });
    }),
  );

  app.get(
    '/rooms/:roomId',
    asyncRoute(async (req: Request, res: Response) => {
      const roomId = requireUuid(req.params.roomId, 'roomId');
      const view = await store.loadRoom(roomId);
      if (!view.exists) throw new HttpError(404, `room ${roomId} does not exist`);
      res.status(200).json({
        roomId,
        logLength: view.logLength,
        entryCount: view.state.entries.length,
        snapshot: snapshot(view.state),
      });
    }),
  );

  app.post(
    '/rooms/:roomId/events',
    asyncRoute(async (req: Request, res: Response) => {
      const roomId = requireUuid(req.params.roomId, 'roomId');
      const event = requireEvent(req.body);
      const result = await store.append(roomId, event);

      /*
       * A rejection is a recorded outcome, not a server fault: the request was
       * well-formed and the ledger declined it. 409 says that plainly, and the
       * body carries the reducer's own code and reason rather than a
       * paraphrase.
       */
      if (!result.ok) {
        res.status(409).json({
          roomId,
          outcome: 'rejected',
          code: result.code,
          reason: result.reason,
          snapshot: snapshot(result.state),
        });
        return;
      }

      res.status(result.outcome === 'transition' ? 201 : 200).json({
        roomId,
        outcome: result.outcome,
        ...('seq' in result ? { seq: result.seq } : {}),
        ...('entry' in result && result.entry ? { entry: result.entry } : {}),
        ...('awaiting' in result ? { awaiting: result.awaiting } : {}),
        snapshot: snapshot(result.state),
      });
    }),
  );

  app.get(
    '/rooms/:roomId/export',
    asyncRoute(async (req: Request, res: Response) => {
      const roomId = requireUuid(req.params.roomId, 'roomId');
      const view = await store.loadRoom(roomId);
      if (!view.exists) throw new HttpError(404, `room ${roomId} does not exist`);
      const exported = await store.exportRoom(roomId);
      res.status(200).json({
        roomId,
        exportedAt: new Date().toISOString(),
        commit: config.commitSha,
        snapshot: snapshot(view.state),
        ...exported,
      });
    }),
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: 'bad_request', message: error.message });
      return;
    }
    if (error instanceof RoomNotFoundError) {
      res.status(404).json({ error: 'not_found', message: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: 'error', at: 'request', message }));
    res.status(500).json({ error: 'internal_error', message });
  });

  return app;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new HttpError(400, `${field} must be a UUID`);
  }
  return value.toLowerCase();
}

/**
 * Shape-check the request body into a `LifecycleEvent`.
 *
 * Deliberately shallow: it checks that the fields the reducer reads are
 * present and of the right kind, and leaves every lifecycle judgement —
 * whether the event name exists, whether the actor may raise it, whether the
 * attribution is valid, whether the guard passes — to the reducer, which owns
 * those rules and rejects with a typed code. Validating them twice would
 * invite the two copies to disagree.
 */
function requireEvent(body: unknown): LifecycleEvent {
  if (typeof body !== 'object' || body === null) throw new HttpError(400, 'body must be a JSON object');
  const candidate = body as Record<string, unknown>;

  for (const field of ['eventId', 'event', 'actor', 'occurredAt'] as const) {
    if (typeof candidate[field] !== 'string' || (candidate[field] as string).trim() === '') {
      throw new HttpError(400, `${field} is required and must be a non-empty string`);
    }
  }
  if (typeof candidate['attribution'] !== 'object' || candidate['attribution'] === null) {
    throw new HttpError(400, 'attribution is required and must be an object');
  }
  if (typeof candidate['scope'] !== 'object' || candidate['scope'] === null) {
    throw new HttpError(400, 'scope is required and must be an object');
  }
  if (candidate['evidence'] !== undefined && !Array.isArray(candidate['evidence'])) {
    throw new HttpError(400, 'evidence, when present, must be an array');
  }
  if (Number.isNaN(Date.parse(candidate['occurredAt'] as string))) {
    throw new HttpError(400, 'occurredAt must be an RFC3339 timestamp');
  }

  return {
    ...(candidate as unknown as LifecycleEvent),
    evidence: (candidate['evidence'] ?? []) as LifecycleEvent['evidence'],
  };
}
