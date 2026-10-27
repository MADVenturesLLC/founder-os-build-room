/**
 * The counted-run surface (Build Room plan r1 slice 10, run-unit Q9): the two
 * control-plane routes a Phase 4 counted run needs, inert until the
 * Founder's counted-run act is configured.
 *
 * Founder answer to Q9, recorded as the option the Founder selected: "Build
 * two control-plane routes in #121, behind the adjudication token: start a
 * room's planning round, and read its journal rows. Each answers 503 unless
 * your counted-run act's id is configured. Its merge deploys them inert."
 * The token part is superseded by the Founder's answer to the run-unit
 * proposal's §9 finding: "Add a separate counted-run token. It would differ
 * from both existing tokens and could start rounds and read the journal, but
 * not decide a plan." So every route here is behind
 * `PHASE4_COUNTED_RUN_TOKEN` and nothing else: unset, they answer 503
 * `counted_run_disabled`; the adjudication token and the API token are 401
 * here, and this token opens no other route, the plan decision included.
 *
 *   POST /control-plane/rooms/:roomId/planner-round  start one planning round
 *   GET  /control-plane/rooms/:roomId/planner-round  that round's state
 *   GET  /control-plane/rooms/:roomId/journal        the room's journal rows
 *
 * INERT UNLESS CONFIGURED. `PHASE4_COUNTED_RUN` carries the act's terms as
 * JSON: its id, the Gateway, the Planner's provider and active model (Q2a),
 * and the builder's and reviewer's models (Q7a). Without it every route
 * answers 503 `counted_run_not_configured`, and nothing here runs. With it,
 * starting a round also needs the platform's deployment id (T2's actor,
 * Q7b) and the control plane's surface in the execution-surface registry
 * the counted run reads (`DEC-20261015-01`, `COUNTED_RUN_REGISTRY` below);
 * either missing is 503.
 * The terms are checked at boot: a Planner off the architect seat's
 * Antigravity lane, a builder or reviewer off its seat's lanes, or a
 * reviewer on the builder's model refuses to boot.
 *
 * WHAT A ROUND IS. Exactly the governed planner loop (`planner-loop.ts`),
 * over the Gateway's pull channel (Q2b), with the act's route and
 * attribution. The completion test (§5.3) covers a command only when it was
 * journaled under the act and both its intended and its observed route are
 * the act's. One round runs at a time, process-wide, and it runs after the
 * POST has answered 202, because a round outlives an HTTP request; its
 * state is in memory, so a restart forgets it, and the run that started it
 * ends `interrupted` (the deployment changed). These routes decide no plan:
 * the plan decision stays on `plan-decision.ts`, the Founder's route.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { Pool } from 'pg';
import {
  COUNTED_RUN_DISPATCHER,
  COUNTED_RUN_PLANNER_SURFACE,
  plannerLaneLabel,
  type CountedRunConfig,
} from './counted-run-config.js';
import type { CommandEventRow } from '../../journal/src/index.js';
import { JournalStore, type CompletionAuthorizationResolver } from './journal-store.js';
import { PlanStore } from './plan-store.js';
import type { PostgresLedgerStore } from './store.js';
import { PlannerLoop, plannerCommandIdFor, MAX_ROUND_ATTEMPTS, type PlannerPort, type PlannerRoundOutcome } from './planner-loop.js';

/**
 * The `surface_id`s an execution-surface registry declares, read from its
 * text: each fenced YAML block's `surface_id:`. An entry whose
 * `current_status` is `proposed-not-active` is not registered and is left out.
 */
export function registeredSurfaceIds(registryMarkdown: string): ReadonlySet<string> {
  const ids = new Set<string>();
  const blocks = registryMarkdown.split(/^```yaml$/m).slice(1).map((block) => block.split(/^```$/m)[0] ?? '');
  for (const block of blocks) {
    const id = /^surface_id:\s*([A-Za-z0-9._-]+)\s*$/m.exec(block)?.[1];
    if (id === undefined) continue;
    if (/^current_status:\s*proposed-not-active\b/m.test(block)) continue;
    ids.add(id);
  }
  return ids;
}

/**
 * The execution-surface registry the counted run reads: FounderOS's copy at
 * the merge of `DEC-20261015-01`, byte-captured and hash-pinned. It is the
 * Founder's selection of 2026-10-16, recorded as the option chosen, "Separate
 * counted-run copy (Recommended)": "Vendor one copy of the execution-surface
 * registry at FounderOS 8146435, hash-pinned, read only by the counted-run
 * surface check. The Seat Registry's ten fixtures stay on r7 bd0a9acb exactly
 * as you ruled." So this copy is read here and nowhere else, and the Seat
 * Registry's fixtures keep their own pin.
 */
export const COUNTED_RUN_REGISTRY = {
  founderOsCommit: '814643594ac21558a3a90626360efebd664a4bce',
  sourcePath: '04-agents/execution-surface-registry.md',
  fixturePath: 'packages/control-plane/fixtures/execution-surface-registry.md',
  sha256: '060a16a40abb58794cf960d33010bee006e06d4f699f32f61704d1ecd88e2055',
} as const;

/** The surfaces a registry text declares, if it is the pinned copy byte for byte; any other text declares none. */
export function pinnedRegisteredSurfaces(registryMarkdown: string): ReadonlySet<string> {
  const digest = createHash('sha256').update(registryMarkdown, 'utf8').digest('hex');
  return digest === COUNTED_RUN_REGISTRY.sha256 ? registeredSurfaceIds(registryMarkdown) : new Set();
}

/**
 * The pinned copy, read where it lies: this module is at
 * packages/control-plane/src in source and dist/packages/control-plane/src
 * after build, and the repository root is four levels up from the built file,
 * which is what runs. Unreadable or altered is empty: fail closed.
 */
export function vendoredRegisteredSurfaces(): ReadonlySet<string> {
  try {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const path = new URL(`../../../../${COUNTED_RUN_REGISTRY.fixturePath}`, pathToFileURL(here)).pathname;
    return pinnedRegisteredSurfaces(readFileSync(path, 'utf8'));
  } catch {
    return new Set();
  }
}

/** §5.3 for a counted run: covered only under the act, on the act's route, intended and observed. */
export function countedRunCompletionResolver(config: CountedRunConfig): CompletionAuthorizationResolver {
  return async (query) => {
    const route = (r: { provider: string; model: string; executionSurface: string }) =>
      r.provider === config.planner.provider && r.model === config.planner.model && r.executionSurface === COUNTED_RUN_PLANNER_SURFACE;
    return query.authorizationRef === config.actId && route(query.intended) && route(query.observed) ? 'covers' : 'does_not_cover';
  };
}

/* ---------------- the routes ---------------- */

export interface CountedRunRouteDeps {
  readonly config: CountedRunConfig | null;
  /** The platform's deployment id (`RAILWAY_DEPLOYMENT_ID`), T2's actor; null when the platform gave none. */
  readonly deploymentId: string | null;
  readonly pool: Pool;
  readonly ledger: Pick<PostgresLedgerStore, 'appendDerived' | 'underRoomLock' | 'loadRoom' | 'isFenced'>;
  /** The Planner port over the Gateway's pull channel, for the configured Gateway and route. */
  readonly plannerPort: (config: CountedRunConfig) => PlannerPort;
  /** Whether the configured Gateway has fresh liveness now. */
  readonly gatewayOnline: (gatewayId: string) => boolean;
  /** `null` when `PHASE4_COUNTED_RUN_TOKEN` is unset: every route answers 503. */
  readonly requireCountedRunToken: RequestHandler | null;
  readonly requireLeader: RequestHandler;
  /** Defaults to the pinned registry copy (`COUNTED_RUN_REGISTRY`); a test supplies its own. */
  readonly registeredSurfaces?: () => ReadonlySet<string>;
}

type RoundState =
  | { readonly status: 'running'; readonly roomId: string; readonly startedAt: string }
  | { readonly status: 'settled'; readonly roomId: string; readonly startedAt: string; readonly settledAt: string; readonly outcome: SettledOutcome };

type SettledOutcome =
  | { readonly kind: PlannerRoundOutcome['kind']; readonly code?: string; readonly commandId?: string; readonly planHash?: string }
  | { readonly kind: 'error'; readonly reason: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROOM_OPENING_EVENTS = ['task.dispatched.planner', 'plan.revision_requested'];

export { COUNTED_RUN_DISPATCHER, COUNTED_RUN_PLANNER_SURFACE, type CountedRunConfig } from './counted-run-config.js';

export function countedRunRouter(deps: CountedRunRouteDeps): Router {
  const router = Router();
  const disabled: RequestHandler = (_req, res) => {
    res.status(503).json({ error: 'counted_run_disabled', message: 'the counted-run token is not configured' });
  };
  const guard = deps.requireCountedRunToken ?? disabled;
  const configured: RequestHandler = (_req, res, next) => {
    if (deps.config === null) {
      res.status(503).json({ error: 'counted_run_not_configured' });
      return;
    }
    next();
  };
  const room: RequestHandler = (req, res, next) => {
    if (!UUID_RE.test(String(req.params['roomId'] ?? ''))) {
      res.status(400).json({ error: 'invalid_request', message: 'roomId must be a lowercase UUID' });
      return;
    }
    next();
  };
  const surfaces = deps.registeredSurfaces ?? vendoredRegisteredSurfaces;
  let current: RoundState | null = null;

  router.post(
    '/control-plane/rooms/:roomId/planner-round',
    guard,
    configured,
    room,
    express.json({ limit: '1kb' }),
    deps.requireLeader,
    (req, res) => {
      const config = deps.config!;
      const roomId = String(req.params['roomId']);
      if (deps.deploymentId === null) {
        res.status(503).json({ error: 'deployment_id_unknown', message: 'T2 names the deployment that acted; the platform gave none' });
        return;
      }
      if (!surfaces().has(COUNTED_RUN_DISPATCHER.executionSurface)) {
        res.status(503).json({ error: 'dispatcher_surface_unregistered', message: `${COUNTED_RUN_DISPATCHER.executionSurface} is not in the vendored execution-surface registry` });
        return;
      }
      if (current?.status === 'running') {
        res.status(409).json({ error: 'round_in_flight', roomId: current.roomId });
        return;
      }
      const startedAt = new Date().toISOString();
      current = { status: 'running', roomId, startedAt };
      const deploymentId = deps.deploymentId;
      void (async (): Promise<SettledOutcome> => {
        const journal = new JournalStore(deps.pool, { resolveCompletionAuthorization: countedRunCompletionResolver(config) });
        const loop = new PlannerLoop({
          ledger: deps.ledger,
          journal,
          plans: new PlanStore(deps.pool),
          planner: deps.plannerPort(config),
          route: {
            actorId: `gateway:${config.gatewayId}`,
            authorizationRef: config.actId,
            intendedProvider: config.planner.provider,
            intendedModel: config.planner.model,
            intendedSurface: COUNTED_RUN_PLANNER_SURFACE,
            laneLabel: plannerLaneLabel(config),
          },
          dispatcher: {
            roleId: COUNTED_RUN_DISPATCHER.roleId,
            actorId: `${COUNTED_RUN_DISPATCHER.actorIdPrefix}${deploymentId}`,
            actualModel: COUNTED_RUN_DISPATCHER.actualModel,
            executionSurface: COUNTED_RUN_DISPATCHER.executionSurface,
          },
          roomRoles: async () => ({
            planner: { roleId: 'architect', surface: config.planner.surface, model: config.planner.model, provider: config.planner.provider },
            builder: { roleId: 'builder', surface: config.seats.builder.surface, model: null, provider: config.seats.builder.provider },
            reviewer: { roleId: 'independent-reviewer', surface: config.seats.reviewer.surface, model: null, provider: config.seats.reviewer.provider },
          }),
          authorizeRoute: countedRunCompletionResolver(config),
        });
        const outcome = await loop.runRound(roomId);
        return {
          kind: outcome.kind,
          ...('code' in outcome ? { code: outcome.code } : {}),
          ...('classification' in outcome ? { code: outcome.classification } : {}),
          ...('commandId' in outcome ? { commandId: outcome.commandId } : {}),
          ...('planHash' in outcome ? { planHash: outcome.planHash } : {}),
        };
      })()
        .catch((error: unknown): SettledOutcome => ({ kind: 'error', reason: error instanceof Error ? error.name : 'unknown' }))
        .then((outcome) => {
          current = { status: 'settled', roomId, startedAt, settledAt: new Date().toISOString(), outcome };
        });
      res.status(202).json({ roomId, status: 'running', startedAt });
    },
  );

  router.get('/control-plane/rooms/:roomId/planner-round', guard, configured, room, (req, res) => {
    const config = deps.config!;
    const roomId = String(req.params['roomId']);
    const mine = current !== null && current.roomId === roomId ? current : null;
    res.status(200).json({
      roomId,
      actId: config.actId,
      deploymentId: deps.deploymentId,
      gateway: { id: config.gatewayId, online: deps.gatewayOnline(config.gatewayId) },
      dispatcherSurfaceRegistered: surfaces().has(COUNTED_RUN_DISPATCHER.executionSurface),
      round: mine ?? { status: 'idle' },
    });
  });

  router.get(
    '/control-plane/rooms/:roomId/journal',
    guard,
    configured,
    room,
    asyncRoute(async (req, res) => {
      const roomId = String(req.params['roomId']);
      const view = await deps.ledger.loadRoom(roomId);
      if (!view.exists) {
        res.status(404).json({ error: 'room_not_found' });
        return;
      }
      const journal = new JournalStore(deps.pool);
      const commands: { commandId: string; rows: CommandEventRow[] }[] = [];
      const decisions: { commandId: string; decision: string; planHash?: string; recordedState: string }[] = [];
      for (const entry of view.state.entries.filter((e) => ROOM_OPENING_EVENTS.includes(e.event))) {
        for (let attempt = 1; attempt <= MAX_ROUND_ATTEMPTS; attempt += 1) {
          const commandId = plannerCommandIdFor(roomId, entry.eventId, attempt);
          const history = await journal.commandHistory(commandId);
          if (history.entries.length === 0) break;
          commands.push({ commandId, rows: history.entries.flatMap((e) => (e.decoded.recordClass === 'command' ? [e.decoded.row] : [])) });
          for (const e of history.entries) {
            if (e.decoded.recordClass !== 'decision') continue;
            decisions.push({
              commandId,
              decision: e.decoded.row.decision,
              recordedState: e.decoded.row.recordedState,
              ...(e.decoded.row.planHash === undefined ? {} : { planHash: e.decoded.row.planHash }),
            });
          }
        }
      }
      const verdict = await journal.verify();
      res.status(200).json({
        roomId,
        deploymentId: deps.deploymentId,
        commands,
        decisions,
        journal: verdict.ok ? { verified: true, headSeq: verdict.headSeq } : { verified: false, reason: verdict.reason },
      });
    }),
  );
  return router;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}
