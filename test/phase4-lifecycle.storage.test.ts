/**
 * The integrated Phase 4 lifecycle (plan r1 slice 9, Phase 4 step 5): every
 * piece the earlier slices built, assembled the way production assembles
 * them, driven from the Founder's side through the real HTTP surface.
 *
 * ASSEMBLY. The control plane's real composition root (`createGatewaySurface`
 * and `createServer`) over a real socket, on the gateway storage harness, so
 * `gatewayOnline` is the fence's own derivation from accepted heartbeats. One
 * enrolled Gateway runs the daemon's real `PrimaryLane` and planner worker
 * against a synthetic executor (Phase 4 authorization §6: "fixtures and
 * synthetic provider behavior"). The planner loop and recovery are
 * constructed here, because nothing in `server.ts` constructs them: the
 * counted-run authorization that would is slice 10's proposal. Their stores
 * are the production classes over the application's pool.
 *
 * WHAT IS DRIVEN, AND WHERE IT ENTERS. The Founder goal enters on T1 through
 * `POST /rooms/:roomId/events`. Every plan decision enters through
 * `POST /control-plane/rooms/:roomId/plan-decision` behind the adjudication
 * token. The Planner is reached only over the Gateway's signed pull channel.
 *
 * Each case names the stop-gate items (Phase 4 authorization §7) it
 * evidences. `docs/phase4-stop-gate-test-map.md` carries the whole map, and
 * `test/phase4-stop-gate-map.test.ts` holds it to the tests it cites. The
 * cases run in order and share one database: later cases read what earlier
 * ones wrote, as a restart reads what ran before it.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  ControlPlaneClient,
  GatewayPlannerWorker,
  PlannerRecordStore,
  PrimaryLane,
  createDaemonClock,
  type GatewayIdentity,
} from '../packages/gateway-daemon/src/index.js';
import { JournalStore, type AuthorizationCoverage } from '../packages/control-plane/src/journal-store.js';
import { PlanStore } from '../packages/control-plane/src/plan-store.js';
import { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import {
  PlannerLoop,
  plannerCommandIdFor,
  type PlannerLoopDeps,
  type PlannerPort,
  type RoomRoleAssignment,
} from '../packages/control-plane/src/planner-loop.js';
import { PlannerRecovery } from '../packages/control-plane/src/planner-recovery.js';
import type { CommandEventRow } from '../packages/journal/src/index.js';
import { founderGoalDigest } from '../packages/control-plane/src/founder-goal.js';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  RUNTIME_ROLE_MODE,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import {
  enrollGateway,
  makeSessionNode,
  promoteNode,
  startNodeServer,
  type EnrolledGateway,
  type SessionNode,
} from './gateway-session-helpers.js';
import { SYNTHETIC_ROUTE } from './support/synthetic-planner.js';
import { SyntheticExecutor } from './support/synthetic-executor.js';

/*
 * The runtime-role tier only. The journal store refuses every login but
 * `br_app_runtime` before its first statement (its identity latch), so the
 * harness's default superuser connection could run nothing here; in the tier
 * the application's pool is that login, as in production.
 */
const SKIP =
  STORAGE_SKIP !== false
    ? STORAGE_SKIP
    : RUNTIME_ROLE_MODE
      ? false
      : 'runs in the runtime-role tier (npm run test:storage:runtime-role): the journal accepts only br_app_runtime';

const STALENESS_MS = 6_000;
const ADJUDICATION_TOKEN = 'phase4-lifecycle-adjudication-token-long-enough';
const SHA40 = 'c'.repeat(40);
const REPO = 'example-org/example-repo';
const GOAL = 'Add a health detail field to the status route.';
const TIMINGS = { answerTimeoutMs: 2_000, planTimeoutMs: 5_000, statusIntervalMs: 20 };
const ROLES: RoomRoleAssignment = {
  planner: { roleId: 'architect', model: SYNTHETIC_ROUTE.model },
  builder: { roleId: 'builder', model: 'example-builder-model' },
  reviewer: { roleId: 'independent-reviewer', model: 'example-reviewer-model' },
};
const ROUTE = {
  actorId: 'session:test/phase4-lifecycle',
  authorizationRef: 'HO-20261015-phase4-lifecycle-test',
  intendedProvider: SYNTHETIC_ROUTE.provider,
  intendedModel: SYNTHETIC_ROUTE.model,
  intendedSurface: SYNTHETIC_ROUTE.executionSurface,
  laneLabel: 'primary',
} as const;
const FOUNDER_RELAY = { actualModel: 'n/a (human Founder decision)', executionSurface: 'claude-code' };

let harness: GatewayHarness | undefined;
let node: SessionNode | undefined;
let surface: { url: string; close: () => Promise<void> } | undefined;
let gateway: EnrolledGateway | undefined;
let recordsRoot: string | undefined;
const executor = new SyntheticExecutor();
let worker: GatewayPlannerWorker | undefined;
let stopDriving: (() => Promise<void>) | null = null;
const coverage: AuthorizationCoverage = 'covers';
const minted: string[] = [];

/** Rooms the cases leave behind, for the restart case to reconstruct. */
const rooms: { approved?: string; interrupted?: string } = {};

before(async () => {
  if (SKIP !== false) return;
  harness = await createGatewayHarness('phase4_lifecycle');
  /*
   * A staleness window short enough to script a lost Gateway without the
   * scripted clock also outrunning the leader's 20 s safety deadline, which
   * would demote the node and refuse every append for the wrong reason.
   */
  node = await makeSessionNode(harness, {
    configOverrides: { phase3AdjudicationToken: ADJUDICATION_TOKEN, gatewayStalenessMs: STALENESS_MS },
  });
  await promoteNode(node);
  surface = await startNodeServer(harness, node);
  gateway = await enrollGateway(node);
  recordsRoot = mkdtempSync(join(tmpdir(), 'buildroom-phase4-lifecycle-'));
  // One worker and one record directory for the whole suite: the PC's own
  // durable records outlive a control-plane restart, as they do in production.
  worker = new GatewayPlannerWorker({ executor, records: new PlannerRecordStore(recordsRoot) });
  executor.reset();
  startDriving();
  await waitFor(async () => node!.session.livenessFor(gateway!.gatewayId) ?? undefined);
});

after(async () => {
  await stopDriving?.();
  await surface?.close();
  await destroyGatewayHarness(harness);
  if (recordsRoot !== undefined) rmSync(recordsRoot, { recursive: true, force: true });
});

/* ---------------- the Gateway's side ---------------- */

function identity(): GatewayIdentity {
  return {
    gatewayId: gateway!.gatewayId,
    keyId: gateway!.key.keyId,
    pubkeyBase64: gateway!.key.pubkeyBase64,
    privateKey: gateway!.key.privateKey,
  };
}

/** The daemon's tick on a short cadence: heartbeat, then planner exchanges. A fresh lane each time, as a restarted daemon has. */
function startDriving(): void {
  const lane = new PrimaryLane(new ControlPlaneClient(surface!.url), createDaemonClock(), identity());
  let running = true;
  const loop = (async () => {
    while (running) {
      await lane.step();
      await lane.exchangePlanner(worker!);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  })();
  stopDriving = async () => {
    running = false;
    await loop;
    stopDriving = null;
  };
}

/* ---------------- the control plane's side ---------------- */

function port(): PlannerPort {
  return node!.surface.planner.port({ gatewayId: gateway!.gatewayId, role: 'architect', intended: SYNTHETIC_ROUTE, timings: TIMINGS });
}

/** Production's store classes, fresh, over the application's pool: what a restarted process builds. */
function freshStores() {
  const pool = harness!.appPool;
  return {
    ledger: new PostgresLedgerStore(pool, node!.surface.roomAppendFence),
    journal: new JournalStore(pool, { resolveCompletionAuthorization: async () => coverage }),
    plans: new PlanStore(pool),
  };
}

function loop(stores = freshStores(), planner: PlannerPort = port()): PlannerLoop {
  const deps: PlannerLoopDeps = {
    ...stores,
    planner,
    route: ROUTE,
    dispatcher: { roleId: 'builder', actorId: 'control-plane:test', actualModel: 'n/a (control-plane act)', executionSurface: 'claude-code' },
    roomRoles: async () => ROLES,
    authorizeRoute: async () => coverage,
    mintEventId: () => {
      const id = `evt_${randomUUID()}`;
      minted.push(id);
      return id;
    },
  };
  return new PlannerLoop(deps);
}

/* ---------------- HTTP, as the Founder's surfaces call it ---------------- */

async function call(
  path: string,
  body: Record<string, unknown>,
  token: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers['authorization'] = `Bearer ${token}`;
  const response = await fetch(`${surface!.url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const apiToken = (): string => node!.config.apiToken;

function scopeCapture(roomId: string, goal: string | undefined): Record<string, unknown> {
  return {
    eventId: `evt_t1_${roomId.slice(0, 8)}`,
    event: 'scope.captured',
    actor: 'founder',
    attribution: { roleId: null, actorId: 'founder', actualModel: 'n/a (human Founder act)', executionSurface: 'claude-code' },
    scope: { roomId, repo: REPO, paths: ['src', 'test'] },
    evidence: [],
    occurredAt: '2026-10-15T11:00:00.000Z',
    facts: { repoInAllowlist: true, baseSha: SHA40, remoteHeadSha: SHA40 },
    ...(goal === undefined ? {} : { goal }),
  };
}

/** Create a room and capture its scope and goal over HTTP. */
async function scopedRoom(goal: string = GOAL): Promise<string> {
  const roomId = randomUUID();
  const created = await call('/rooms', { roomId }, apiToken());
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const t1 = await call(`/rooms/${roomId}/events`, scopeCapture(roomId, goal), apiToken());
  assert.equal(t1.status, 201, JSON.stringify(t1.body));
  return roomId;
}

async function decide(roomId: string, body: Record<string, unknown>, token: string | null = ADJUDICATION_TOKEN) {
  return call(`/control-plane/rooms/${roomId}/plan-decision`, { ...body, attribution: FOUNDER_RELAY }, token);
}

/* ---------------- reading back ---------------- */

async function stateOf(roomId: string): Promise<string> {
  return (await freshStores().ledger.loadRoom(roomId)).state.state;
}

async function rowsOf(commandId: string): Promise<CommandEventRow[]> {
  const history = await freshStores().journal.commandHistory(commandId);
  return history.entries.flatMap((e) => (e.decoded.recordClass === 'command' ? [e.decoded.row] : []));
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await harness!.pool.query<{ n: string }>(sql, params);
  return Number(rows[0]!.n);
}

/**
 * Each journal row's canonical bytes, read as the text they encode. The bytes
 * carry NUL separators, which PostgreSQL's text conversion refuses, so they
 * are decoded here; the row's other columns ride along.
 */
async function journalTexts(where: string): Promise<string[]> {
  const { rows } = await harness!.pool.query<{ row_bytes: Buffer; rest: string }>(
    `SELECT row_bytes, concat_ws(' ', seq, record_class, command_id, event_type, chain_hash) AS rest FROM command_journal_events ${where}`,
  );
  return rows.map((row) => `${row.row_bytes.toString('utf8')} ${row.rest}`);
}

async function eventsOf(roomId: string): Promise<{ event: string; payload: Record<string, unknown> }[]> {
  const { rows } = await harness!.pool.query<{ event: string; payload: Record<string, unknown> }>(
    'SELECT event, payload FROM build_room_events WHERE room_id = $1 ORDER BY seq',
    [roomId],
  );
  return rows;
}

async function waitFor<T>(probe: () => Promise<T | undefined>, timeoutMs = 8_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/* ---------------- cases ---------------- */

describe('phase 4 lifecycle · goal to approved plan over the real surfaces', { skip: SKIP }, () => {
  let roomId = '';
  let first = { commandId: '', planHash: '' };
  let second = { commandId: '', planHash: '' };

  it('items 4, 5, 8: the goal captured on T1 reaches the Planner on the Gateway and returns as a stored, bound plan', async () => {
    roomId = await scopedRoom();
    minted.length = 0;
    const outcome = await loop().runRound(roomId);
    assert.equal(outcome.kind, 'plan_review', JSON.stringify(outcome));
    assert.ok(outcome.kind === 'plan_review');
    first = { commandId: plannerCommandIdFor(roomId, minted[0]!), planHash: outcome.planHash };
    assert.equal(await stateOf(roomId), 'PLAN_REVIEW');

    // Item 4: the Gateway was handed the Founder's goal, its digest and the captured scope, once.
    const handed = executor.works.filter((w) => w.commandId === first.commandId);
    assert.equal(handed.length, 1);
    assert.equal(handed[0]!.goal, GOAL);
    assert.equal(handed[0]!.goalDigest, founderGoalDigest(GOAL));
    assert.deepEqual([handed[0]!.repository, handed[0]!.baseSha, [...handed[0]!.scopePaths]], [REPO, SHA40, ['src', 'test']]);

    // Item 5: the plan is durable, one row, keyed by its command, and its hash is the store's.
    assert.equal(await count('SELECT count(*)::text AS n FROM build_room_plans WHERE command_id = $1', [first.commandId]), 1);
    const stored = await freshStores().plans.planForCommand(first.commandId);
    assert.equal(stored?.planHash, first.planHash);

    // Item 8: one command, bound end to end.
    const rows = await rowsOf(first.commandId);
    assert.deepEqual(rows.map((r) => r.eventType), ['journaled', 'identity_bound', 'dispatched', 'completed']);
    const [journaled, bound, dispatched, completed] = rows;
    const t2 = (await eventsOf(roomId)).find((e) => e.event === 'task.dispatched.planner')!;
    assert.deepEqual(journaled!.lifecycleEventRef, { roomId, eventId: t2.payload['eventId'] });
    assert.equal(journaled!.roleId, 'architect');
    assert.equal(journaled!.actorId, ROUTE.actorId);
    assert.equal(journaled!.authorizationRef, ROUTE.authorizationRef);
    assert.deepEqual([journaled!.intendedProvider, journaled!.intendedModel, journaled!.intendedSurface], [ROUTE.intendedProvider, ROUTE.intendedModel, ROUTE.intendedSurface]);
    assert.equal(journaled!.scopeRef, `room-scope/${roomId}/evt_t1_${roomId.slice(0, 8)}`);
    const answered = await port().reconcile(first.commandId);
    assert.equal(answered.kind, 'finished');
    assert.equal(bound!.executionId, answered.kind === 'finished' ? answered.executionId : '', 'the execution the Gateway attested for this command');
    assert.deepEqual([dispatched!.provider, dispatched!.model, dispatched!.executionSurface], [SYNTHETIC_ROUTE.provider, SYNTHETIC_ROUTE.model, SYNTHETIC_ROUTE.executionSurface]);
    const t3 = (await eventsOf(roomId)).find((e) => e.event === 'plan.submitted')!;
    assert.deepEqual(completed!.lifecycleEventRef, { roomId, eventId: t3.payload['eventId'] });
    assert.deepEqual(t3.payload['attribution'], {
      roleId: 'architect',
      actorId: ROUTE.actorId,
      actualModel: SYNTHETIC_ROUTE.model,
      executionSurface: SYNTHETIC_ROUTE.executionSurface,
    });
    assert.deepEqual(t2.payload['evidence'], [{ kind: 'planner_command', ref: first.commandId, digest: journaled!.envelopeDigest }]);
    const t1 = (await eventsOf(roomId)).find((e) => e.event === 'scope.captured')!;
    assert.ok(
      (t1.payload['evidence'] as { kind: string; digest: string }[]).some((e) => e.kind === 'founder_goal' && e.digest === founderGoalDigest(GOAL)),
      'the goal digest is the server’s evidence on T1',
    );
  });

  it('items 2, 6, 7: no surface but the plan-decision route decides, and only with the adjudication token and the plan under review', async () => {
    // The generic route refuses every planner-path event (slice 1).
    for (const event of ['task.dispatched.planner', 'plan.submitted', 'plan.revision_requested', 'plan.approved', 'founder.cancel']) {
      const offered = { ...scopeCapture(roomId, undefined), eventId: `evt_bypass_${event}`, event, actor: 'founder' };
      const refused = await call(`/rooms/${roomId}/events`, offered, apiToken());
      assert.deepEqual([refused.status, refused.body['error']], [403, 'governed_path_required'], event);
    }
    // The API token is not the adjudication token, and no token is none.
    for (const token of [apiToken(), null]) {
      const refused = await decide(roomId, { decision: 'plan.approved', planHash: first.planHash }, token);
      assert.equal(refused.status, 401, JSON.stringify(refused.body));
    }
    // A hash that is not the stored plan's is G5's recorded rejection.
    const wrong = await decide(roomId, { decision: 'plan.approved', planHash: 'f'.repeat(64) });
    assert.deepEqual([wrong.status, wrong.body['outcome']], [409, 'rejected'], JSON.stringify(wrong.body));
    assert.equal(await stateOf(roomId), 'PLAN_REVIEW');
    assert.equal(await count(`SELECT count(*)::text AS n FROM command_journal_events WHERE record_class = 'decision' AND command_id = $1`, [first.commandId]), 0);
  });

  it('items 3, 6: a credential in the revision feedback is refused and leaves nothing behind', async () => {
    const before = await count('SELECT count(*)::text AS n FROM command_journal_events');
    const refused = await decide(roomId, { decision: 'plan.revision_requested', planHash: first.planHash, feedback: 'use password=hunter2-correct-horse' });
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    assert.equal(await stateOf(roomId), 'PLAN_REVIEW');
    assert.equal(await count('SELECT count(*)::text AS n FROM command_journal_events'), before);
  });

  it('items 6, 7, 8: a revision invalidates the plan; the revised plan, not the first, is approved and enters BUILDING', async () => {
    const revised = await decide(roomId, { decision: 'plan.revision_requested', planHash: first.planHash, feedback: 'Narrow it to one field.' });
    assert.equal(revised.status, 201, JSON.stringify(revised.body));
    assert.equal(revised.body['plannerCommandId'], first.commandId, 'the decision binds to the plan it decides');
    assert.equal(await stateOf(roomId), 'PLANNING');

    // Nothing approves a room that is not reviewing a plan.
    const early = await decide(roomId, { decision: 'plan.approved', planHash: first.planHash });
    assert.equal(early.status, 409, JSON.stringify(early.body));
    assert.equal(await stateOf(roomId), 'PLANNING');

    minted.length = 0;
    const outcome = await loop().runRound(roomId);
    assert.equal(outcome.kind, 'plan_review', JSON.stringify(outcome));
    assert.ok(outcome.kind === 'plan_review');
    const t4 = (await eventsOf(roomId)).find((e) => e.event === 'plan.revision_requested')!;
    second = { commandId: plannerCommandIdFor(roomId, t4.payload['eventId'] as string), planHash: outcome.planHash };
    assert.notEqual(second.commandId, first.commandId, 'a revision round is a second command');
    assert.notEqual(second.planHash, first.planHash, 'the revised plan is a different document');
    const handed = executor.works.find((w) => w.commandId === second.commandId);
    assert.deepEqual(handed?.revision, { feedback: 'Narrow it to one field.', revisingPlanHash: first.planHash });

    // The first plan's hash no longer approves anything.
    const stale = await decide(roomId, { decision: 'plan.approved', planHash: first.planHash });
    assert.deepEqual([stale.status, stale.body['outcome']], [409, 'rejected'], JSON.stringify(stale.body));
    assert.equal(await stateOf(roomId), 'PLAN_REVIEW');

    const approved = await decide(roomId, { decision: 'plan.approved', planHash: second.planHash, eventId: 'evt_founder_approval' });
    assert.equal(approved.status, 201, JSON.stringify(approved.body));
    assert.equal(approved.body['plannerCommandId'], second.commandId);
    assert.equal(approved.body['planHash'], second.planHash);
    assert.equal(await stateOf(roomId), 'BUILDING');
    const t5 = (await eventsOf(roomId)).find((e) => e.event === 'plan.approved')!;
    assert.equal(t5.payload['actor'], 'founder');
    rooms.approved = roomId;
  });

  it('items 7, 10: approval dispatches nothing, a replayed approval decides nothing twice, and BUILDING opens no round', async () => {
    const decisions = (): Promise<number> =>
      count(`SELECT count(*)::text AS n FROM command_journal_events WHERE record_class = 'decision' AND command_id = ANY($1)`, [[first.commandId, second.commandId]]);
    assert.equal(await decisions(), 2, 'one revision, one approval');

    const replay = await decide(roomId, { decision: 'plan.approved', planHash: second.planHash, eventId: 'evt_founder_approval' });
    assert.deepEqual([replay.status, replay.body['outcome']], [200, 'replay']);
    const again = await decide(roomId, { decision: 'plan.approved', planHash: second.planHash });
    assert.equal(again.status, 409, JSON.stringify(again.body));
    assert.equal(await decisions(), 2);

    const startsBefore = executor.calls.start.length;
    const refused = await loop().runRound(roomId);
    assert.deepEqual([refused.kind, refused.kind === 'refused' ? refused.code : ''], ['refused', 'not_plannable']);
    assert.equal(executor.calls.start.length, startsBefore, 'no work reached the Gateway');
    assert.equal(node!.surface.planner.openCount, 0);
    const events = (await eventsOf(roomId)).map((e) => e.event);
    assert.equal(events.at(-1), 'plan.approved', 'nothing follows approval: no builder dispatch');
    assert.equal(executor.startsOf(first.commandId) + executor.startsOf(second.commandId), 2, 'each command started once');
  });
});

describe('phase 4 lifecycle · a Gateway lost mid-round, then a restart', { skip: SKIP }, () => {
  it('items 9, 10: a plan the control plane stopped hearing about is unresolved; recovery after a restart reconciles it by command id, without dispatching again', async () => {
    const roomId = await scopedRoom();
    minted.length = 0;
    executor.reset({ result: 'hold' });
    const running = loop().runRound(roomId);
    const commandId = await waitFor(async () => (minted[0] === undefined ? undefined : plannerCommandIdFor(roomId, minted[0])));
    await waitFor(async () => ((await rowsOf(commandId)).some((r) => r.eventType === 'dispatched') ? true : undefined));

    // The Gateway goes quiet, and the control plane's wait for the plan runs out.
    await stopDriving!();
    node!.clock.advance(TIMINGS.planTimeoutMs + 1);
    const outcome = await running;
    assert.equal(outcome.kind, 'unresolved', JSON.stringify(outcome));
    assert.deepEqual((await rowsOf(commandId)).map((r) => r.eventType), ['journaled', 'identity_bound', 'dispatched', 'unresolved']);
    assert.equal(await stateOf(roomId), 'PLANNING', 'unknown is not success');

    // An unresolved round opens no other: there is no second dispatch while an outcome is unknown.
    const blocked = await loop().runRound(roomId);
    assert.deepEqual([blocked.kind, blocked.kind === 'refused' ? blocked.code : ''], ['refused', 'round_already_open']);

    // The PC finishes the work it holds, the daemon restarts, and so does the control plane's side: fresh stores.
    executor.release();
    startDriving();
    const recovery = new PlannerRecovery({ ...freshStores(), planner: port(), route: ROUTE });
    const recovered = await recovery.recoverRoom(roomId);
    assert.equal(recovered.kind, 'plan_review', JSON.stringify(recovered));
    assert.deepEqual((await rowsOf(commandId)).map((r) => r.eventType), ['journaled', 'identity_bound', 'dispatched', 'unresolved', 'resolved']);
    assert.equal(await stateOf(roomId), 'PLAN_REVIEW');
    assert.equal(executor.startsOf(commandId), 1, 'reconciled, never re-dispatched');

    // A second pass finds nothing open and writes nothing.
    const total = await count('SELECT count(*)::text AS n FROM command_journal_events');
    const second = await new PlannerRecovery({ ...freshStores(), planner: port(), route: ROUTE }).recoverRoom(roomId);
    assert.equal(second.kind, 'nothing_open', JSON.stringify(second));
    assert.equal(await count('SELECT count(*)::text AS n FROM command_journal_events'), total);
    rooms.interrupted = roomId;
    executor.reset();
  });
});

describe('phase 4 lifecycle · reconstruction', { skip: SKIP }, () => {
  it('items 1, 10: fresh stores over the same database rebuild every room, the journal verifies from genesis, and nothing is duplicated', async () => {
    const stores = freshStores();
    const verdict = await stores.journal.verify();
    assert.equal(verdict.ok, true, JSON.stringify(verdict));

    // Contract §10, §12 conditions: a rebuild over the mixed chain reproduces both record classes in their recorded order.
    const rebuilt = await stores.journal.reconstruct();
    const { rows: persisted } = await harness!.pool.query<{ seq: string; record_class: string; event_type: string }>(
      'SELECT e.seq::text AS seq, e.record_class, e.event_type FROM command_journal_events AS e ORDER BY e.seq',
    );
    assert.deepEqual(
      rebuilt.map((r) => [r.seq, r.decoded.recordClass, r.decoded.recordClass === 'command' ? r.decoded.row.eventType : r.decoded.row.decision]),
      persisted.map((r) => [r.seq, r.record_class, r.event_type]),
    );
    assert.ok(new Set(rebuilt.map((r) => r.decoded.recordClass)).size === 2, 'the chain is mixed: commands and decisions');

    for (const roomId of [rooms.approved!, rooms.interrupted!]) {
      const view = await stores.ledger.loadRoom(roomId);
      const persisted = await eventsOf(roomId);
      const transitions = persisted.filter((e) => view.state.entries.some((entry) => entry.eventId === e.payload['eventId']));
      assert.equal(view.state.entries.length, transitions.length, 'the rebuilt ledger is the persisted one');
      // Each round's opening event (T2, then each T4) derived exactly one command, journaled once.
      const openings = persisted.filter((e) => e.event === 'task.dispatched.planner' || e.event === 'plan.revision_requested');
      for (const opening of openings) {
        const commandId = plannerCommandIdFor(roomId, opening.payload['eventId'] as string);
        assert.equal((await rowsOf(commandId)).filter((r) => r.eventType === 'journaled').length, 1, `${commandId} journaled once`);
      }
      const journaled = (await journalTexts("WHERE event_type = 'journaled'")).filter((t) => t.includes(roomId)).length;
      assert.equal(journaled, openings.length, 'no command for the room beyond its rounds');
    }
    assert.equal(await stateOf(rooms.approved!), 'BUILDING');
    assert.equal(await stateOf(rooms.interrupted!), 'PLAN_REVIEW');

    // Restarting changes nothing: no round opens, no recovery writes.
    const total = await count('SELECT count(*)::text AS n FROM command_journal_events');
    const startsBefore = executor.calls.start.length;
    for (const roomId of [rooms.approved!, rooms.interrupted!]) {
      const recovered = await new PlannerRecovery({ ...stores, planner: port(), route: ROUTE }).recoverRoom(roomId);
      assert.equal(recovered.kind, 'nothing_open', JSON.stringify(recovered));
      const opened = await loop(stores).runRound(roomId);
      assert.equal(opened.kind, 'refused', JSON.stringify(opened));
    }
    assert.equal(await count('SELECT count(*)::text AS n FROM command_journal_events'), total);
    assert.equal(executor.calls.start.length, startsBefore);
  });

  it('item 3: no persisted row carries a token, a key or the database password', async () => {
    const secrets = [apiToken(), ADJUDICATION_TOKEN, 'hunter2-correct-horse'];
    const der = gateway!.key.privateKey.export({ format: 'der', type: 'pkcs8' });
    secrets.push(der.subarray(-32).toString('base64'), der.subarray(-32).toString('base64url'), der.subarray(-32).toString('hex'));
    const password = new URL(node!.config.databaseUrl).password;
    if (password !== '') secrets.push(decodeURIComponent(password));
    const scans: Record<string, string[]> = {
      command_journal_events: await journalTexts(''),
      build_room_events: (await harness!.pool.query<{ t: string }>('SELECT t::text AS t FROM public.build_room_events AS t')).rows.map((r) => r.t),
      build_room_plans: (await harness!.pool.query<{ t: string }>('SELECT t::text AS t FROM public.build_room_plans AS t')).rows.map((r) => r.t),
    };
    for (const [table, texts] of Object.entries(scans)) {
      assert.ok(texts.length > 0, `${table} holds rows to scan`);
      for (const text of texts) {
        for (const secret of secrets) assert.equal(text.includes(secret), false, `${table} carries a secret`);
      }
    }
  });
});

describe('phase 4 lifecycle · Gateway loss before a round', { skip: SKIP }, () => {
  it('item 9: with no live Gateway, T2 is refused and no planner command exists', async () => {
    const roomId = await scopedRoom();
    await stopDriving!();
    node!.clock.advance(STALENESS_MS + 500);
    minted.length = 0;
    const startsBefore = executor.calls.start.length;
    const outcome = await loop().runRound(roomId);
    assert.deepEqual([outcome.kind, outcome.kind === 'refused' ? outcome.code : ''], ['refused', 'guard_failed'], JSON.stringify(outcome));
    assert.equal(await stateOf(roomId), 'SCOPED');
    for (const id of minted) {
      assert.equal(await count('SELECT count(*)::text AS n FROM command_journal_events WHERE command_id = $1', [plannerCommandIdFor(roomId, id)]), 0);
    }
    assert.equal(executor.calls.start.length, startsBefore, 'nothing reached the Gateway');
    const verdict = await freshStores().journal.verify();
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
  });
});
