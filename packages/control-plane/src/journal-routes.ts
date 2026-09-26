/**
 * The command-journal append route (contract §3 sole writer, §5.1 fail
 * closed), the HTTP-reachable production caller of the journal append routine
 * that `README.md`'s Phase 4 "Not done" line names — plan r1 §4.3, Option B.
 *
 *   POST /journal/commands  — append one `journaled` command-class event;
 *                             the store assigns `seq` and `recorded_at`
 *
 * No read route in this slice, and no other event type: `identity_bound`,
 * `dispatched` and the terminal events belong to the planner-loop rung.
 *
 * The route takes the SAME shared-token guard as the room and gate-run
 * routes, passed in by `createServer` — one guard, not a second scheme. The
 * body parser is mounted after the guard, so an unauthenticated body is
 * never parsed.
 *
 * A 2xx is never returned unless the row is committed. Each failure the
 * store can name has its own status and code; an integrity finding answers
 * 500 with a correlation id and its text goes to the log, and a failure the
 * store did not classify falls through to `createServer`'s handler, which
 * answers 500 `internal_error` — never an accepted write.
 */

import { randomUUID } from 'node:crypto';
import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import {
  JournalContendedError,
  JournalCredentialMaterialError,
  JournalDuplicateEventError,
  JournalIntegrityError,
  JournalRuntimeNotAuthorizedError,
  JournalStoreUnavailableError,
  type JournalStore,
  validateJournalCommandBody,
} from './journal-store.js';

/**
 * A `journaled` row is a command envelope plus identities and references —
 * argv and evidence refs are the only unbounded parts — so the limit sits
 * between the room routes' 16 KB and the gate-run routes' 512 KB.
 */
export const JOURNAL_BODY_LIMIT = '64kb';

export interface JournalRoutesDeps {
  readonly store: Pick<JournalStore, 'appendJournaled'>;
  readonly requireToken: RequestHandler;
}

export function journalRouter(deps: JournalRoutesDeps): Router {
  const router = Router();
  const json = express.json({ limit: JOURNAL_BODY_LIMIT });

  router.post(
    '/journal/commands',
    deps.requireToken,
    json,
    asyncRoute(async (req, res) => {
      const parsed = validateJournalCommandBody(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: 'invalid_request', message: parsed.reason });
        return;
      }
      try {
        const { commandId, seq, chainHash, envelopeDigest } = await deps.store.appendJournaled(parsed.value);
        res.status(201).json({ commandId, seq, chainHash, envelopeDigest });
      } catch (error) {
        if (!answerJournalFailure(res, error)) throw error;
      }
    }),
  );

  return router;
}

function answerJournalFailure(res: Response, error: unknown): boolean {
  if (error instanceof JournalCredentialMaterialError) {
    // The offending value is never echoed: the request is caller-controlled
    // and treated as credential-bearing (`executeWithoutJournal`'s reasoning).
    res.status(400).json({ error: 'credential_material' });
    return true;
  }
  if (error instanceof JournalDuplicateEventError) {
    res.status(409).json({ error: 'duplicate_event' });
    return true;
  }
  if (error instanceof JournalStoreUnavailableError) {
    res.status(503).json({ error: 'journal_store_unavailable' });
    return true;
  }
  if (error instanceof JournalRuntimeNotAuthorizedError) {
    res.status(503).json({ error: 'journal_runtime_not_authorized' });
    return true;
  }
  if (error instanceof JournalContendedError) {
    res.status(503).json({ error: 'journal_contended' });
    return true;
  }
  if (error instanceof JournalIntegrityError) {
    /*
     * The finding's text names head and tail positions, which is what an
     * operator needs and not what a caller on a public URL needs. Log it
     * under a correlation id; answer with the id and the stable code.
     */
    const incidentId = randomUUID();
    console.error(
      JSON.stringify({ level: 'error', at: 'journal.append', incidentId, finding: error.finding, message: error.message }),
    );
    res.status(500).json({ error: 'journal_integrity_failure', incidentId });
    return true;
  }
  return false;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}
