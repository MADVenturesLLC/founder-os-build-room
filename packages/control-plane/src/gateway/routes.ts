/**
 * The gateway HTTP surface (contract §11, §12).
 *
 * Four guard groups, mounted so that each route's parser is that route's FIRST
 * middleware and the only parser its requests encounter. There is no global
 * `express.json`, which is what makes "16 KB on gateway routes" a fact rather
 * than an intention — with a global parser mounted first, a per-route limit
 * describes a check that already happened.
 *
 * Guard order on the signed routes is fixed and load-bearing:
 *   body limit -> rate limit -> leader pre-filter -> clock -> parse -> resolve
 *   -> verify -> fenced transaction.
 */

import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { isCanonicalUuid, isLowercaseHex } from '../../../gateway-protocol/src/index.js';
import { validateRedeem } from './enroll-validation.js';
import { RATE_LIMITS, type RateLimiter } from './rate-limit.js';
import type { GatewaySessionService } from './session.js';
import type { GatewayRegistryStore } from './store.js';
import type { GatewayLeadership } from './leadership.js';

/** 16 KB on every gateway route, and on every body-bearing Founder route. */
export const GATEWAY_BODY_LIMIT = '16kb';
/** 256 KB on the room routes, which carry evidence payloads. */
export const ROOM_BODY_LIMIT = '256kb';

export interface GatewayRoutesDeps {
  readonly service: GatewaySessionService;
  readonly store: GatewayRegistryStore;
  readonly leadership: GatewayLeadership;
  readonly limiter: RateLimiter;
  readonly requireToken: (req: Request, res: Response, next: NextFunction) => void;
}

function sourceIpOf(req: Request): string {
  // `req.ip` honours `trust proxy`, which is config-driven and defaults OFF.
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** Rate-limit middleware. Always mounted before any signature work. */
function limit(limiter: RateLimiter, name: string, max: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!limiter.take(`${name}:${sourceIpOf(req)}`, max)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    next();
  };
}

/**
 * The additional budget for requests that fail verification (§12).
 *
 * Checked before the route runs and spent afterwards, so a source that has
 * already burned its failure budget is refused before any Ed25519 work rather
 * than after failing again.
 */
function verificationBudget(limiter: RateLimiter) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (limiter.exhausted(`verify-fail:${sourceIpOf(req)}`, RATE_LIMITS.verificationFailure)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    next();
  };
}

function isVerificationFailure(status: number): boolean {
  return status === 401 || status === 403;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

/** Unauthenticated and code-authenticated gateway routes. */
export function gatewayRouter(deps: GatewayRoutesDeps): Router {
  const router = Router();
  const { service, store, limiter } = deps;

  router.get(
    '/gateway/session-challenge',
    limit(limiter, 'challenge', RATE_LIMITS.sessionChallenge),
    asyncRoute(async (_req, res) => {
      const result = await service.challenge();
      res.status(result.status).json(result.body);
    }),
  );

  router.post(
    '/gateway/enroll',
    express.json({ limit: GATEWAY_BODY_LIMIT }),
    limit(limiter, 'enroll', RATE_LIMITS.enroll),
    asyncRoute(async (req, res) => {
      const sourceIp = sourceIpOf(req);

      /*
       * Pre-transaction validation. Nothing here consumes anything: a malformed
       * request leaves the Founder's code exactly as it found it (correction
       * C4), and the refusal is recorded in its own small transaction.
       */
      const validation = validateRedeem(req.body);
      if (!validation.ok) {
        await store
          .recordRefusal({
            kind: validation.code,
            detail: { detail: validation.detail },
            sourceIp,
          })
          .catch(() => undefined);
        res.status(400).json({ error: validation.code });
        return;
      }

      const result = await store.redeem(validation.request, sourceIp);
      if (!result.ok) {
        res.status(result.status).json({ error: result.code });
        return;
      }
      res.status(202).json(result.body);
    }),
  );

  router.post(
    '/gateway/session-start',
    express.json({ limit: GATEWAY_BODY_LIMIT }),
    limit(limiter, 'session-start', RATE_LIMITS.sessionStart),
    verificationBudget(limiter),
    deps.leadership.requireLeader(),
    asyncRoute(async (req, res) => {
      const sourceIp = sourceIpOf(req);
      const result = await service.sessionStart(req.body, sourceIp);
      if (isVerificationFailure(result.status)) {
        limiter.take(`verify-fail:${sourceIp}`, RATE_LIMITS.verificationFailure);
      }
      res.status(result.status).json(result.body);
    }),
  );

  router.post(
    '/gateway/heartbeat',
    express.json({ limit: GATEWAY_BODY_LIMIT }),
    limit(limiter, 'heartbeat', RATE_LIMITS.heartbeat),
    verificationBudget(limiter),
    deps.leadership.requireLeader(),
    asyncRoute(async (req, res) => {
      const sourceIp = sourceIpOf(req);
      const result = await service.heartbeat(req.body, sourceIp);
      if (isVerificationFailure(result.status)) {
        limiter.take(`verify-fail:${sourceIp}`, RATE_LIMITS.verificationFailure);
      }
      res.status(result.status).json(result.body);
    }),
  );

  return router;
}

/**
 * Founder-token routes.
 *
 * Every body-bearing one carries its own 16 KB parser. Every Founder request
 * body is tiny by construction — an empty mint body, a 64-character
 * fingerprint, UUID parameters — so the limit costs nothing and removes a
 * class of question.
 */
export function founderRouter(deps: GatewayRoutesDeps): Router {
  const router = Router();
  const { store, requireToken, leadership } = deps;
  void leadership;

  const json = express.json({ limit: GATEWAY_BODY_LIMIT });

  router.post(
    '/control-plane/pairing-codes',
    json,
    requireToken,
    asyncRoute(async (_req, res) => {
      const minted = await store.mintPairingCode();
      /*
       * The plaintext appears here and nowhere else, once. It is not logged, it
       * is not stored, and no listing endpoint can return it.
       */
      res.status(201).json({
        pairing_id: minted.pairingId,
        code: minted.code,
        expires_at: minted.expiresAt.toISOString(),
      });
    }),
  );

  router.get(
    '/control-plane/pairing-codes',
    requireToken,
    asyncRoute(async (_req, res) => {
      res.status(200).json({ pairingCodes: await store.listPairingCodes() });
    }),
  );

  router.get(
    '/control-plane/enrollments',
    requireToken,
    asyncRoute(async (_req, res) => {
      res.status(200).json({ enrollments: await store.listEnrollments() });
    }),
  );

  router.post(
    '/control-plane/enrollments/:gatewayId/confirm',
    json,
    requireToken,
    asyncRoute(async (req, res) => {
      const gatewayId = req.params['gatewayId'];
      if (typeof gatewayId !== 'string' || !isCanonicalUuid(gatewayId.toLowerCase())) {
        res.status(400).json({ error: 'invalid_request', message: 'gatewayId must be a UUID' });
        return;
      }
      const fingerprint = (req.body as Record<string, unknown> | undefined)?.['fingerprint'];
      if (typeof fingerprint !== 'string' || !isLowercaseHex(fingerprint, 64)) {
        res
          .status(400)
          .json({ error: 'invalid_request', message: 'fingerprint must be 64 lowercase hex characters' });
        return;
      }

      const result = await store.confirmEnrollment(gatewayId.toLowerCase(), fingerprint, sourceIpOf(req));
      if (!result.ok) {
        res.status(result.status).json({ error: result.code });
        return;
      }
      res.status(201).json({ gatewayId: result.gatewayId, state: result.state });
    }),
  );

  router.post(
    '/control-plane/enrollments/:gatewayId/deny',
    json,
    requireToken,
    asyncRoute(async (req, res) => {
      await founderTransition(req, res, (gatewayId) => store.denyEnrollment(gatewayId, sourceIpOf(req)));
    }),
  );

  router.post(
    '/control-plane/gateways/:gatewayId/revoke',
    json,
    requireToken,
    asyncRoute(async (req, res) => {
      await founderTransition(req, res, (gatewayId) => store.revokeGateway(gatewayId, sourceIpOf(req)));
    }),
  );

  return router;
}

async function founderTransition(
  req: Request,
  res: Response,
  act: (gatewayId: string) => Promise<
    | { readonly ok: true; readonly gatewayId: string; readonly state: string }
    | { readonly ok: false; readonly status: number; readonly code: string }
  >,
): Promise<void> {
  const gatewayId = req.params['gatewayId'];
  if (typeof gatewayId !== 'string' || !isCanonicalUuid(gatewayId.toLowerCase())) {
    res.status(400).json({ error: 'invalid_request', message: 'gatewayId must be a UUID' });
    return;
  }
  const result = await act(gatewayId.toLowerCase());
  if (!result.ok) {
    res.status(result.status).json({ error: result.code });
    return;
  }
  res.status(200).json({ gatewayId: result.gatewayId, state: result.state });
}
