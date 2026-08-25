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

import { randomUUID, timingSafeEqual } from 'node:crypto';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { snapshot, type LifecycleEvent } from '../../ledger/src/index.js';
import type { Config } from './config.js';
import { probe } from './db.js';
import { phase3RunRouter } from './phase3-run-routes.js';
import { PostgresLedgerStore, RoomNotFoundError } from './store.js';
import {
  ROOM_BODY_LIMIT,
  founderRouter,
  gatewayRouter,
  type GatewaySurface,
} from './gateway/index.js';

export interface ServerDeps {
  readonly config: Config;
  readonly pool: Pool;
  readonly store: PostgresLedgerStore;
  /** Set once the boot sequence has migrated and is serving. */
  readonly startedAt: number;
  /**
   * The gateway subsystem. REQUIRED, not optional.
   *
   * The room-append route gains a leader pre-filter and a transaction fence
   * from it (contract §10, §11). Making it optional would mean a server could
   * be constructed that mounts that route without the fence, which is the one
   * shape this surface must not be able to take.
   */
  readonly gateway: GatewaySurface;
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

  /*
   * `trust proxy` is config-driven and defaults to 0 — OFF (contract §20).
   * With it off the service is safe and rate-limit buckets merely coarsen
   * behind an edge; with it on against an unverified topology, `req.ip` is
   * whatever a caller put in a header. The enablement procedure is a
   * deployment act: observe the live edge's `X-Forwarded-For` behaviour first,
   * then set `TRUST_PROXY_HOPS`.
   */
  if (config.trustProxyHops > 0) {
    app.set('trust proxy', config.trustProxyHops);
  }

  /*
   * NO global body parser. Each route mounts its own — after the token guard,
   * so an unauthenticated request's body is never even parsed — so a per-route
   * limit describes a check that actually happens on that route rather than
   * one a broader parser already made irrelevant (contract §11).
   */
  const roomJson = express.json({ limit: ROOM_BODY_LIMIT });

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
      /*
       * The probe result is NOT spread into the response. It carries the
       * driver's own error string, which names roles, hosts and sometimes the
       * connection target — turning a readiness failure into a disclosure on a
       * public URL. The reason goes to the log with a correlation id; the
       * caller gets the id and the fact that the database is unreachable,
       * which is all a readiness probe needs. Raised by CodeRabbit on PR #2.
       */
      const incidentId = randomUUID();
      console.error(
        JSON.stringify({ level: 'error', at: 'ready', incidentId, detail: result.error ?? null }),
      );
      res.status(503).json({ status: 'unavailable', database: 'unreachable', incidentId });
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

  /*
   * Everything below this line requires the shared secret. Everything above it
   * — `/health`, `/ready`, `/version` — does not, and that is deliberate:
   * Railway's own health check calls `/health` with no credential and would
   * fail the deploy if it were guarded, and the harness reads `/version` to
   * prove a restart happened. None of the three touches the ledger or reveals
   * anything beyond process liveness and the deployed commit.
   *
   * The room endpoints are a different matter. They write to the ledger and
   * export its full contents, on a public URL. See `Config.apiToken` for why
   * this is required rather than optional.
   */
  const requireToken = tokenGuard(config.apiToken);

  app.post(
    '/rooms',
    requireToken,
    roomJson,
    asyncRoute(async (req: Request, res: Response) => {
      const roomId = requireUuid(req.body?.roomId, 'roomId');
      const { created } = await store.createRoom(roomId);
      res.status(created ? 201 : 200).json({ roomId, created });
    }),
  );

  app.get(
    '/rooms/:roomId',
    requireToken,
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

  /*
   * The one existing route this contract changes. It gains the leader
   * pre-filter, the transaction fence (inside the store), and the derived
   * `gatewayOnline` overlay. Room-lifecycle semantics are untouched.
   */
  app.post(
    '/rooms/:roomId/events',
    requireToken,
    roomJson,
    deps.gateway.leadership.requireLeader(),
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
      if (!result.ok && result.outcome === 'not_leader') {
        /*
         * A post-COMMIT demotion leaves the durable append standing and still
         * answers 503. No pipeline may return accepted after detecting a
         * demotion, whatever its durable result (contract §7).
         */
        res.status(503).json({ error: 'not_leader' });
        return;
      }

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
    requireToken,
    asyncRoute(async (req: Request, res: Response) => {
      const roomId = requireUuid(req.params.roomId, 'roomId');
      /*
       * ONE call, because the snapshot and the rows must come from one
       * transaction. This used to call `loadRoom` for the state and
       * `exportRoom` for the rows, and an append committing between them
       * produced an export whose snapshot described an earlier ledger than its
       * events contained — with nothing in the payload saying so.
       * `exportRoom` now replays inside its own read-only REPEATABLE READ
       * transaction and returns both, so they cannot disagree.
       *
       * The 404 also moves inside: `exportRoom` throws `RoomNotFoundError`,
       * which the error handler already maps to 404. Checking existence in a
       * separate connection was its own small race.
       */
      const { state, logLength, ...exported } = await store.exportRoom(roomId);
      res.status(200).json({
        roomId,
        exportedAt: new Date().toISOString(),
        commit: config.commitSha,
        snapshot: snapshot(state),
        logLength,
        ...exported,
      });
    }),
  );

  /*
   * The gateway surface. Mounted after the room routes and before the
   * catch-alls, with each of its routes carrying its own 16 KB parser.
   */
  const routeDeps = {
    service: deps.gateway.service,
    store: deps.gateway.store,
    leadership: deps.gateway.leadership,
    limiter: deps.gateway.limiter,
    requireToken,
  };
  app.use(gatewayRouter(routeDeps));
  app.use(founderRouter(routeDeps));
  app.use(
    phase3RunRouter({
      store: deps.gateway.phase3Runs,
      leadership: deps.gateway.leadership,
      requireToken,
    }),
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    /*
     * Body-limit and parser failures are translated here, centrally, so every
     * body-bearing route — gateway, Founder, and room alike — answers with the
     * same structured code and no raw parser text leaks (contract §11, §14).
     *
     * A size failure and a syntax failure are NOT the same thing and are not
     * reported as the same thing: an oversized body is `413 payload_too_large`,
     * and a body the parser could not read is `400 invalid_request`. Both are
     * members of the closed response vocabulary; conflating them would tell a
     * client to shrink a request whose only problem was that it was malformed.
     */
    const parserError = error as { type?: unknown; status?: unknown; statusCode?: unknown } | null;
    if (parserError !== null && typeof parserError === 'object' && 'type' in parserError) {
      if (parserError.type === 'entity.too.large') {
        res.status(413).json({ error: 'payload_too_large' });
        return;
      }
      const status = Number(parserError.status ?? parserError.statusCode ?? 0);
      if (status === 413) {
        res.status(413).json({ error: 'payload_too_large' });
        return;
      }
      if (status >= 400 && status < 500) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
    }

    if (error instanceof HttpError) {
      res.status(error.status).json({ error: 'bad_request', message: error.message });
      return;
    }
    if (error instanceof RoomNotFoundError) {
      res.status(404).json({ error: 'not_found', message: error.message });
      return;
    }
    /*
     * An unhandled error's message is logged, never returned. Postgres errors
     * carry role names, host names, table names and SQL fragments, so echoing
     * `message` turns any failing query into an information-disclosure
     * response on a public URL. The client gets a stable code and a
     * correlation id; the operator reads the detail from the log by that id.
     *
     * `HttpError` and `RoomNotFoundError` above keep their text, because those
     * strings are author-written and say only what the caller did wrong.
     * Raised by CodeRabbit on PR #2.
     */
    const message = error instanceof Error ? error.message : String(error);
    const incidentId = randomUUID();
    console.error(JSON.stringify({ level: 'error', at: 'request', incidentId, message }));
    res.status(500).json({ error: 'internal_error', incidentId });
  });

  return app;
}

/**
 * Middleware requiring the shared secret on `Authorization: Bearer <token>`.
 *
 * Compared with `timingSafeEqual` rather than `===`. The timing signal from a
 * string comparison is small and awkward to exploit over a network, but the
 * constant-time form costs nothing and removes the question.
 *
 * The failure response says `unauthorized` and nothing else — not whether the
 * header was missing, malformed, or simply wrong. Each of those distinctions
 * is a free hint to someone guessing.
 */
function tokenGuard(expected: string) {
  const expectedBytes = Buffer.from(expected, 'utf8');

  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.get('authorization') ?? '';
    const match = /^Bearer (.+)$/i.exec(header.trim());
    const presented = match?.[1] === undefined ? null : Buffer.from(match[1], 'utf8');

    /*
     * The length check is separate because `timingSafeEqual` throws on
     * differing lengths rather than returning false. It leaks the token's
     * length, which is not a secret — the value is.
     */
    const authorized =
      presented !== null &&
      presented.length === expectedBytes.length &&
      timingSafeEqual(presented, expectedBytes);

    if (!authorized) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  };
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

/**
 * A strict RFC3339 date-time with an offset.
 *
 * `Date.parse` was the check, and it is far looser than the name suggests: it
 * accepts a date-only `2026-08-17`, accepts an offset-less `2026-08-17T12:00`,
 * accepts non-RFC3339 offsets like `+0530`, and — worst here — *normalizes*
 * impossible dates, so `2026-02-30T12:00:00Z` parses happily as 2 March. Each
 * of those would have been stored verbatim in an append-only ledger as the
 * time an event occurred. Raised by CodeRabbit on PR #2.
 *
 * The shape is checked here and the calendar is checked below, because a
 * regex can express the first and not the second.
 */
function isRfc3339(value: string): boolean {
  const match = RFC3339.exec(value);
  if (match === null) return false;

  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12) return false;
  if (dayNumber < 1 || dayNumber > daysInMonth(Number(year), monthNumber)) return false;

  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(second);
  if (hourNumber > 23 || minuteNumber > 59 || secondNumber > 60) return false;

  /*
   * Second 60 is a leap second, and a leap second happens at the end of a
   * **UTC** day — simultaneously everywhere, so in a non-Z offset it appears
   * shifted. RFC3339 §5.7 gives exactly this example: the 2016-12-31 leap
   * second is `2017-01-01T00:59:60+01:00` in a +01:00 offset.
   *
   * Checking `hour === 23 && minute === 59` against the LOCAL fields therefore
   * rejected that valid form. The offset is applied first now, and the check
   * runs against the resulting UTC time-of-day. Raised by CodeRabbit on PR #2.
   */
  if (secondNumber === 60) {
    const sign = value.includes('+') ? -1 : 1;
    const offsetMinutes =
      offsetHour === undefined || offsetMinute === undefined
        ? 0
        : sign * (Number(offsetHour) * 60 + Number(offsetMinute));
    const utcMinuteOfDay =
      (((hourNumber * 60 + minuteNumber + offsetMinutes) % 1440) + 1440) % 1440;
    if (utcMinuteOfDay !== 23 * 60 + 59) return false;
  }

  /*
   * The OFFSET is bounded too. RFC3339's `time-numoffset` is
   * `("+" / "-") time-hour ":" time-minute`, with the same 00–23 and 00–59
   * ranges as the time itself — so `+24:00` and `+00:60` are not offsets, and
   * a regex of `[+-]\d{2}:\d{2}` alone waves them through. The groups are
   * undefined for a `Z` instant, which carries no offset to check. Raised by
   * CodeRabbit on PR #2.
   */
  if (offsetHour !== undefined && offsetMinute !== undefined) {
    if (Number(offsetHour) > 23 || Number(offsetMinute) > 59) return false;
  }

  return true;
}

/** Days in a calendar month, by the proleptic Gregorian leap rule. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
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
  if (!isRfc3339(candidate['occurredAt'] as string)) {
    throw new HttpError(400, 'occurredAt must be an RFC3339 date-time with an offset');
  }

  return {
    ...(candidate as unknown as LifecycleEvent),
    evidence: (candidate['evidence'] ?? []) as LifecycleEvent['evidence'],
  };
}
