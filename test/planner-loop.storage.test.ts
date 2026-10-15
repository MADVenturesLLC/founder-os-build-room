/**
 * The governed planner loop end to end on PostgreSQL, over a genuine
 * `br_app_runtime` LOGIN, against a synthetic Planner (Phase 4 authorization
 * §6): the real ledger, journal and plan stores, a room driven from SCOPED
 * through T2 and T3 to PLAN_REVIEW, a revision round, approval, and the
 * Founder's cancel under the Q5 ruling.
 *
 * FIXTURE: an exclusively owned disposable PostgreSQL instance
 * (`test/support/owned-postgres.ts`) with the full canonical sequence.
 * `TEST_DATABASE_URL` is only the run gate. The ledger store runs inside a
 * test fence that derives `gatewayOnline` from a switch, standing in for the
 * gateway surface's derivation; the loop refuses an unfenced store.
 *
 * What is proven: T2 and the planner command's `journaled` row commit
 * together, and a refused T2 (gateway offline, roles unassigned) leaves no
 * command; a round's journal rows run journaled → identity_bound →
 * dispatched → completed, with `completed` committing with T3 and the plan;
 * every failure the authorization's §5 lists is a recorded `failed` or
 * `unresolved`, never a plan; a refused completion leaves no T3 and no plan;
 * a revision round is a second command, derived from T4; cancel is
 * unavailable before any planner command, refused while one is in flight,
 * and bound to the room's latest command otherwise; a cancel racing a
 * revision round never leaves a command journaled after the cancel; and the
 * journal verifies from genesis afterwards.
 */

import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pgDefault from 'pg';
import type { Client as PgClient, Pool as PgPool } from 'pg';
import { destroyOwnedInstance, resolveServerBinaries, startOwnedInstance, type OwnedInstance } from './support/owned-postgres.js';
import { SYNTHETIC_ROUTE, SyntheticPlanner } from './support/synthetic-planner.js';
import { PlanStore } from '../packages/control-plane/src/plan-store.js';
import { PostgresLedgerStore, type RoomAppendFence } from '../packages/control-plane/src/store.js';
import {
  JournalStore,
  type AuthorizationCoverage,
} from '../packages/control-plane/src/journal-store.js';
import {
  FounderCancelUnavailableError,
  PlanHashMismatchError,
  PlanHashNotApplicableError,
  PlannerCommandInFlightError,
  decidePlan,
  type PlanDecisionDeps,
  type PlanDecisionRequest,
} from '../packages/control-plane/src/plan-decision.js';
import {
  PlannerLoop,
  PlannerLoopUnfencedError,
  plannerCommandIdFor,
  type PlannerLoopDeps,
  type RoomRoleAssignment,
} from '../packages/control-plane/src/planner-loop.js';
import type { CommandEventRow } from '../packages/journal/src/index.js';
import type { LifecycleEvent } from '../packages/ledger/src/index.js';

const { Client, Pool } = pgDefault;

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the planner-loop suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

const DATABASE = 'br_planner_loop';
const SHA40 = 'a'.repeat(40);
const REPO = 'example-org/example-repo';
const now = (): Date => new Date('2026-10-15T12:00:00.000Z');

let instance: OwnedInstance | undefined;
let admin: PgClient | undefined;
let runtimePool: PgPool | undefined;
let ledger: PostgresLedgerStore | undefined;
let plans: PlanStore | undefined;
let journal: JournalStore | undefined;
let decisionDeps: PlanDecisionDeps | undefined;

/* ---- switches each case sets ---- */
let gatewayOnline = true;
let preDispatchCoverage: AuthorizationCoverage = 'covers';
let completionCoverage: AuthorizationCoverage = 'covers';
let roles: RoomRoleAssignment | null = null;
const planner = new SyntheticPlanner();
const minted: string[] = [];

const DEFAULT_ROLES: RoomRoleAssignment = {
  planner: { roleId: 'architect', model: SYNTHETIC_ROUTE.model },
  builder: { roleId: 'builder', model: 'example-builder-model' },
  reviewer: { roleId: 'independent-reviewer', model: 'example-reviewer-model' },
};

function loopDeps(overrides: Partial<PlannerLoopDeps> = {}): PlannerLoopDeps {
  return {
    ledger: ledger!,
    journal: journal!,
    plans: plans!,
    planner,
    route: {
      actorId: 'session:test/planner-loop',
      authorizationRef: 'HO-20261015-planner-test',
      intendedProvider: SYNTHETIC_ROUTE.provider,
      intendedModel: SYNTHETIC_ROUTE.model,
      intendedSurface: SYNTHETIC_ROUTE.executionSurface,
    },
    dispatcher: {
      roleId: 'builder',
      actorId: 'control-plane:test',
      actualModel: 'n/a (control-plane act)',
      executionSurface: 'claude-code',
    },
    roomRoles: async () => roles,
    authorizeRoute: async () => preDispatchCoverage,
    now,
    mintEventId: () => {
      const id = `evt_${randomUUID()}`;
      minted.push(id);
      return id;
    },
    ...overrides,
  };
}

/** A fence that runs the body in one transaction and derives gatewayOnline from the switch. */
function testFence(pool: PgPool): RoomAppendFence {
  return {
    async runRoomAppend(body) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await body(client, async () => gatewayOnline);
        await client.query(out.commit ? 'COMMIT' : 'ROLLBACK');
        return { status: 'ok', value: out.value };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

before(async () => {
  if (SKIP_REASON !== false) return;
  instance = await startOwnedInstance(BINS!);
  const boot = new Client({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: 'postgres' });
  await boot.connect();
  await boot.query(`CREATE DATABASE ${DATABASE}`);
  await boot.end();
  admin = new Client({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: DATABASE });
  await admin.connect();
  const { migrate } = await import('../packages/control-plane/src/migrations.js');
  const migrator = new Pool({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: DATABASE, max: 1 });
  try {
    await migrate(migrator);
  } finally {
    await migrator.end();
  }
  const password = randomBytes(24).toString('base64url');
  await admin.query(`ALTER ROLE br_app_runtime PASSWORD '${password.replace(/'/g, "''")}'`);
  runtimePool = new Pool({ host: '127.0.0.1', port: instance.port, user: 'br_app_runtime', password, database: DATABASE, max: 8 });
  ledger = new PostgresLedgerStore(runtimePool, testFence(runtimePool));
  plans = new PlanStore(runtimePool);
  journal = new JournalStore(runtimePool, {
    now,
    resolveCompletionAuthorization: async () => completionCoverage,
  });
  decisionDeps = { ledger, plans, journal, now };
});

after(async () => {
  await runtimePool?.end().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  destroyOwnedInstance(instance);
});

beforeEach(() => {
  gatewayOnline = true;
  preDispatchCoverage = 'covers';
  completionCoverage = 'covers';
  roles = DEFAULT_ROLES;
  planner.reset();
  minted.length = 0;
});

/* ---------------- fixtures ---------------- */

/** A room with its scope captured: SCOPED, repository REPO at SHA40, scope `src` and `test`. */
async function scopedRoom(): Promise<string> {
  const roomId = randomUUID();
  await ledger!.createRoom(roomId);
  const t1 = await ledger!.append(roomId, {
    eventId: 'evt_t1',
    event: 'scope.captured',
    actor: 'founder',
    attribution: { roleId: null, actorId: 'founder', actualModel: 'n/a (human Founder act)', executionSurface: 'claude-code' },
    scope: { roomId, repo: REPO, paths: ['src', 'test'] },
    evidence: [],
    occurredAt: '2026-10-15T11:00:00.000Z',
    facts: { repoInAllowlist: true, baseSha: SHA40, remoteHeadSha: SHA40 },
  } as unknown as LifecycleEvent);
  assert.equal(t1.ok && t1.outcome, 'transition', JSON.stringify(t1));
  return roomId;
}

async function stateOf(roomId: string): Promise<string> {
  return (await ledger!.loadRoom(roomId)).state.state;
}

async function rowsOf(commandId: string): Promise<CommandEventRow[]> {
  const history = await journal!.commandHistory(commandId);
  return history.entries.flatMap((e) => (e.decoded.recordClass === 'command' ? [e.decoded.row] : []));
}

async function eventTypes(commandId: string): Promise<string[]> {
  return (await rowsOf(commandId)).map((row) => row.eventType);
}

async function decisionsFor(commandId: string): Promise<string[]> {
  const { rows } = await admin!.query<{ event_type: string }>(
    `SELECT event_type FROM command_journal_events WHERE command_id = $1 AND record_class = 'decision' ORDER BY seq`,
    [commandId],
  );
  return rows.map((row) => row.event_type);
}

async function planCount(commandId: string): Promise<number> {
  const { rows } = await admin!.query<{ n: string }>('SELECT count(*)::text AS n FROM build_room_plans WHERE command_id = $1', [commandId]);
  return Number(rows[0]!.n);
}

async function eventsOf(roomId: string, event: string): Promise<Record<string, unknown>[]> {
  const { rows } = await admin!.query<{ payload: Record<string, unknown> }>(
    `SELECT payload FROM build_room_events WHERE room_id = $1 AND event = $2 ORDER BY seq`,
    [roomId, event],
  );
  return rows.map((row) => row.payload);
}

const attribution = { actualModel: 'n/a (human Founder decision)', executionSurface: 'claude-code' };
const approve = (planHash: string): PlanDecisionRequest => ({ decision: 'plan.approved', planHash, ...attribution });
const revise = (planHash: string, feedback: string): PlanDecisionRequest => ({ decision: 'plan.revision_requested', planHash, feedback, ...attribution });
const cancel = (planHash?: string): PlanDecisionRequest => ({ decision: 'founder.cancel', ...(planHash === undefined ? {} : { planHash }), ...attribution });

/** A room whose first round has opened and ended with the given planner behaviour. */
async function roundOne(behaviour: Parameters<SyntheticPlanner['reset']>[0] = {}) {
  const roomId = await scopedRoom();
  minted.length = 0;
  planner.reset(behaviour);
  const outcome = await new PlannerLoop(loopDeps()).runRound(roomId);
  const commandId = plannerCommandIdFor(roomId, minted[0]!);
  return { roomId, outcome, commandId };
}

/* ---------------- cases ---------------- */

describe('planner loop on PostgreSQL', { skip: SKIP_REASON }, () => {
  it('refuses to run on a ledger store with no fence', () => {
    assert.throws(() => new PlannerLoop(loopDeps({ ledger: new PostgresLedgerStore(runtimePool!) })), PlannerLoopUnfencedError);
  });

  it('a round: T2 with its journaled command, then identity_bound, dispatched, and T3 committing with the plan and completed', async () => {
    const { roomId, outcome, commandId } = await roundOne();
    assert.equal(outcome.kind, 'plan_review', JSON.stringify(outcome));
    assert.equal(await stateOf(roomId), 'PLAN_REVIEW');
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched', 'completed']);

    const [journaled, bound, dispatched, completed] = await rowsOf(commandId);
    const t2Id = minted[0]!;
    assert.equal(journaled!.roomId, roomId);
    assert.deepEqual(journaled!.lifecycleEventRef, { roomId, eventId: t2Id });
    assert.equal(journaled!.roleId, 'architect');
    assert.equal(journaled!.intendedModel, SYNTHETIC_ROUTE.model);
    assert.equal(journaled!.scopeRef, `room-scope/${roomId}/evt_t1`);
    assert.equal(bound!.executionId, 'exec-synthetic-1');
    assert.deepEqual([dispatched!.provider, dispatched!.model, dispatched!.executionSurface], [SYNTHETIC_ROUTE.provider, SYNTHETIC_ROUTE.model, SYNTHETIC_ROUTE.executionSurface]);
    assert.ok(outcome.kind === 'plan_review');
    assert.deepEqual(completed!.lifecycleEventRef, { roomId, eventId: outcome.eventId });
    assert.equal(await planCount(commandId), 1);

    const [t2] = await eventsOf(roomId, 'task.dispatched.planner');
    const facts = t2!['facts'] as Record<string, unknown>;
    assert.deepEqual(facts, { rolesAssigned: true, reviewerIsNotBuilder: true, gatewayOnline: true });
    assert.deepEqual(t2!['evidence'], [{ kind: 'planner_command', ref: commandId, digest: journaled!.envelopeDigest }]);

    const [t3] = await eventsOf(roomId, 'plan.submitted');
    assert.equal(t3!['actor'], 'agent.planner');
    assert.deepEqual(t3!['attribution'], {
      roleId: 'architect',
      actorId: 'session:test/planner-loop',
      actualModel: SYNTHETIC_ROUTE.model,
      executionSurface: SYNTHETIC_ROUTE.executionSurface,
    });
    // The fence stamps its derived gatewayOnline on every event it appends.
    assert.deepEqual(t3!['facts'], { planDocSchemaValid: true, planHash: outcome.planHash, gatewayOnline: true });

    const work = planner.calls.dispatched[0]!;
    assert.deepEqual(
      { commandId: work.commandId, repository: work.repository, baseSha: work.baseSha, scopePaths: work.scopePaths, goal: work.goalEventId },
      { commandId, repository: REPO, baseSha: SHA40, scopePaths: ['src', 'test'], goal: 'evt_t1' },
    );
    assert.equal(work.revision, undefined);

    const again = await new PlannerLoop(loopDeps()).runRound(roomId);
    assert.deepEqual(again.kind === 'refused' && again.code, 'not_plannable');
  });

  it('a revision opens a second command derived from T4, which carries the feedback; approval then binds to it', async () => {
    const { roomId, outcome } = await roundOne();
    assert.ok(outcome.kind === 'plan_review');
    const revised = await decidePlan(decisionDeps!, roomId, revise(outcome.planHash, 'Narrow it to the handler.'));
    assert.equal(revised.appended.result.ok && revised.appended.result.outcome, 'transition');
    const t4Id = revised.appended.event.eventId;

    planner.reset();
    const second = await new PlannerLoop(loopDeps()).runRound(roomId);
    assert.equal(second.kind, 'plan_review', JSON.stringify(second));
    const roundTwo = plannerCommandIdFor(roomId, t4Id);
    assert.ok(second.kind === 'plan_review');
    assert.equal(second.commandId, roundTwo);
    assert.deepEqual(await eventTypes(roundTwo), ['journaled', 'identity_bound', 'dispatched', 'completed']);
    assert.deepEqual((await rowsOf(roundTwo))[0]!.lifecycleEventRef, { roomId, eventId: t4Id });
    assert.deepEqual(planner.calls.dispatched[0]!.revision, { feedback: 'Narrow it to the handler.', revisingPlanHash: outcome.planHash });
    assert.notEqual(second.planHash, outcome.planHash);

    const approved = await decidePlan(decisionDeps!, roomId, approve(second.planHash));
    assert.equal(approved.appended.result.ok && approved.appended.result.outcome, 'transition');
    assert.equal(await stateOf(roomId), 'BUILDING');
    assert.deepEqual(await decisionsFor(roundTwo), ['plan.approved']);
    assert.deepEqual(await decisionsFor(outcome.commandId), ['plan.revision_requested']);
  });

  it('gateway offline: T2 is the recorded rejection and no command exists; cancel stays unavailable', async () => {
    gatewayOnline = false;
    const { roomId, outcome, commandId } = await roundOne();
    assert.deepEqual(outcome.kind === 'refused' && [outcome.code, /gateway offline/.test(outcome.reason)], ['guard_failed', true]);
    assert.equal(await stateOf(roomId), 'SCOPED');
    assert.deepEqual(await eventTypes(commandId), []);
    assert.equal(planner.calls.attest + planner.calls.dispatched.length, 0);
    const { rows } = await admin!.query('SELECT 1 FROM build_room_rejections WHERE room_id = $1 AND event = $2', [roomId, 'task.dispatched.planner']);
    assert.equal(rows.length, 1);
    await assert.rejects(decidePlan(decisionDeps!, roomId, cancel()), FounderCancelUnavailableError);
    assert.equal(await stateOf(roomId), 'SCOPED');
  });

  it('roles unassigned, or a reviewer on the builder’s model: T2 is refused', async () => {
    roles = null;
    const unassigned = await roundOne();
    assert.match(unassigned.outcome.kind === 'refused' ? unassigned.outcome.reason : '', /roles not assigned/);
    roles = { ...DEFAULT_ROLES, reviewer: { roleId: 'independent-reviewer', model: DEFAULT_ROLES.builder.model } };
    const same = await roundOne();
    assert.match(same.outcome.kind === 'refused' ? same.outcome.reason : '', /reviewer is the builder/);
    assert.deepEqual(await eventTypes(same.commandId), []);
  });

  it('before contact: an uncovered or indeterminate route, a failed attestation or a mismatched identity is a pre-send failed', async () => {
    const cases: Array<[string, () => void, string]> = [
      ['does_not_cover', () => { preDispatchCoverage = 'does_not_cover'; }, 'authorization_does_not_cover'],
      ['indeterminate', () => { preDispatchCoverage = 'indeterminate'; }, 'authorization_indeterminate'],
      ['attest throws', () => { planner.reset({ attest: 'throw' }); }, 'attestation_failed'],
      ['wrong model', () => { planner.reset({ attest: { model: 'another-model' } }); }, 'identity_mismatch'],
      ['wrong role', () => { planner.reset({ attest: { role: 'builder' } }); }, 'identity_mismatch'],
    ];
    for (const [label, arrange, classification] of cases) {
      const roomId = await scopedRoom();
      minted.length = 0;
      preDispatchCoverage = 'covers';
      planner.reset();
      arrange();
      const outcome = await new PlannerLoop(loopDeps()).runRound(roomId);
      const commandId = plannerCommandIdFor(roomId, minted[0]!);
      assert.deepEqual(outcome, { kind: 'failed', commandId, classification }, label);
      assert.deepEqual(await eventTypes(commandId), ['journaled', 'failed'], label);
      assert.equal((await rowsOf(commandId))[1]!.failureClassification, classification, label);
      assert.equal(planner.calls.dispatched.length, 0, `${label}: nothing dispatched`);
      assert.equal(await stateOf(roomId), 'PLANNING', label);
    }
  });

  it('dispatch: not sent is failed; a throw is unresolved; a divergent observed route is dispatched then failed, never awaited', async () => {
    const notSent = await roundOne({ dispatch: 'not_sent' });
    assert.deepEqual(await eventTypes(notSent.commandId), ['journaled', 'identity_bound', 'failed']);
    const lost = await roundOne({ dispatch: 'throw' });
    assert.equal(lost.outcome.kind, 'unresolved');
    assert.deepEqual(await eventTypes(lost.commandId), ['journaled', 'identity_bound', 'unresolved']);
    const diverged = await roundOne({ observed: { ...SYNTHETIC_ROUTE, model: 'substituted-model' } });
    assert.deepEqual(diverged.outcome.kind === 'failed' && diverged.outcome.classification, 'route_mismatch');
    assert.deepEqual(await eventTypes(diverged.commandId), ['journaled', 'identity_bound', 'dispatched', 'failed']);
    assert.equal((await rowsOf(diverged.commandId))[2]!.model, 'substituted-model', 'the observed route is recorded as observed');
    assert.equal(planner.calls.awaited.length, 0);
    assert.equal(await stateOf(diverged.roomId), 'PLANNING');
  });

  it('the result: a wait that throws is unresolved; a reported failure, an invalid plan or one outside the captured scope is failed', async () => {
    const lost = await roundOne({ result: 'throw' });
    assert.deepEqual(await eventTypes(lost.commandId), ['journaled', 'identity_bound', 'dispatched', 'unresolved']);
    const cases: Array<[Parameters<SyntheticPlanner['reset']>[0], string]> = [
      [{ result: 'failed' }, 'planner_reported_failure'],
      [{ planOverrides: { objective: 7 } }, 'plan_invalid'],
      [{ planOverrides: { terminal_status: 'BLOCKED_BY_MISSING_INPUT' } }, 'plan_invalid'],
      [{ planOverrides: { scope_paths: ['docs/readme.md'] } }, 'plan_outside_captured_scope'],
      [{ planOverrides: { repository: 'example-org/other-repo' } }, 'plan_outside_captured_scope'],
      [{ planOverrides: { base_sha: 'c'.repeat(40) } }, 'plan_outside_captured_scope'],
      [{ planOverrides: { constraints: 'password=hunter2-correct-horse' } }, 'plan_refused'],
    ];
    for (const [behaviour, classification] of cases) {
      const { roomId, outcome, commandId } = await roundOne(behaviour);
      assert.deepEqual(outcome.kind === 'failed' && outcome.classification, classification, JSON.stringify(behaviour));
      assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched', 'failed']);
      assert.equal(await planCount(commandId), 0);
      assert.deepEqual(await eventsOf(roomId, 'plan.submitted'), []);
      assert.equal(await stateOf(roomId), 'PLANNING');
    }
  });

  it('a refused completion leaves no T3 and no plan: does_not_cover is failed, indeterminate and no resolver are unresolved', async () => {
    for (const [coverage, expected] of [['does_not_cover', 'failed'], ['indeterminate', 'unresolved']] as const) {
      completionCoverage = coverage;
      const { roomId, outcome, commandId } = await roundOne();
      assert.equal(outcome.kind, expected, coverage);
      assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched', expected]);
      assert.equal(await planCount(commandId), 0);
      assert.deepEqual(await eventsOf(roomId, 'plan.submitted'), []);
      assert.equal(await stateOf(roomId), 'PLANNING');
    }
    completionCoverage = 'covers';
    const roomId = await scopedRoom();
    minted.length = 0;
    const silent = new JournalStore(runtimePool!, { now });
    const outcome = await new PlannerLoop(loopDeps({ journal: silent })).runRound(roomId);
    assert.equal(outcome.kind, 'unresolved');
    assert.match(outcome.kind === 'unresolved' ? outcome.reason : '', /no_resolver/);
  });

  it('a failed round is not reopened: no retry in this slice', async () => {
    const { roomId, commandId } = await roundOne({ dispatch: 'not_sent' });
    planner.reset();
    const again = await new PlannerLoop(loopDeps()).runRound(roomId);
    assert.deepEqual(again.kind === 'refused' && again.code, 'round_already_open');
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'failed']);
    assert.equal(planner.calls.attest, 0);
  });

  it('cancel: refused while the command is unresolved; once terminal, bound to it with no plan hash in PLANNING', async () => {
    const lost = await roundOne({ dispatch: 'throw' });
    await assert.rejects(decidePlan(decisionDeps!, lost.roomId, cancel()), PlannerCommandInFlightError);
    assert.equal(await stateOf(lost.roomId), 'PLANNING');

    const failed = await roundOne({ dispatch: 'not_sent' });
    await assert.rejects(decidePlan(decisionDeps!, failed.roomId, cancel('a'.repeat(64))), PlanHashNotApplicableError);
    const cancelled = await decidePlan(decisionDeps!, failed.roomId, cancel());
    assert.equal(cancelled.appended.result.ok && cancelled.appended.result.outcome, 'transition');
    assert.equal(await stateOf(failed.roomId), 'CLOSED_ABANDONED');
    assert.deepEqual(await decisionsFor(failed.commandId), ['founder.cancel']);
    const [t22] = await eventsOf(failed.roomId, 'founder.cancel');
    assert.deepEqual(t22!['facts'], { runningTasksCancelled: true, gatewayOnline: true });
    const history = await journal!.commandHistory(failed.commandId);
    const decision = history.entries.find((e) => e.decoded.recordClass === 'decision')!.decoded;
    assert.ok(decision.recordClass === 'decision');
    assert.equal(decision.row.planHash, undefined);
    assert.equal(decision.row.recordedState, 'PLANNING');
  });

  it('cancel in PLAN_REVIEW carries the plan hash; afterwards nothing plans or approves', async () => {
    const { roomId, outcome, commandId } = await roundOne();
    assert.ok(outcome.kind === 'plan_review');
    const cancelled = await decidePlan(decisionDeps!, roomId, cancel(outcome.planHash));
    assert.equal(cancelled.appended.result.ok && cancelled.appended.result.outcome, 'transition');
    const history = await journal!.commandHistory(commandId);
    const decision = history.entries.find((e) => e.decoded.recordClass === 'decision')!.decoded;
    assert.ok(decision.recordClass === 'decision');
    assert.equal(decision.row.planHash, outcome.planHash);
    const after = await new PlannerLoop(loopDeps()).runRound(roomId);
    assert.deepEqual(after.kind === 'refused' && after.code, 'not_plannable');
    const late = await decidePlan(decisionDeps!, roomId, approve(outcome.planHash));
    assert.equal(late.appended.result.ok, false);
    assert.equal(await stateOf(roomId), 'CLOSED_ABANDONED');
  });

  it('a cancel racing a revision round: never a command journaled after the cancel', async (t) => {
    const won = { cancel: 0, round: 0 };
    for (let i = 0; i < 6; i += 1) {
      const { roomId, outcome } = await roundOne();
      assert.ok(outcome.kind === 'plan_review');
      const revised = await decidePlan(decisionDeps!, roomId, revise(outcome.planHash, 'Again.'));
      const roundTwo = plannerCommandIdFor(roomId, revised.appended.event.eventId);
      planner.reset();
      const [round, cancelled] = await Promise.allSettled([
        new PlannerLoop(loopDeps()).runRound(roomId),
        decidePlan(decisionDeps!, roomId, cancel()),
      ]);
      assert.equal(round.status, 'fulfilled');
      const roundTwoRows = await eventTypes(roundTwo);
      if (cancelled.status === 'fulfilled') {
        assert.equal(await stateOf(roomId), 'CLOSED_ABANDONED');
        won.cancel += 1;
        assert.deepEqual(roundTwoRows, [], 'the cancel won: round two never journaled');
        assert.deepEqual(await decisionsFor(outcome.commandId), ['plan.revision_requested', 'founder.cancel']);
      } else {
        // The round won the lock. The cancel then saw round two in flight, or,
        // if the round had already reached PLAN_REVIEW, a hash-less cancel of
        // a room that bears a plan.
        won.round += 1;
        const reason = cancelled.reason;
        assert.ok(reason instanceof PlannerCommandInFlightError || reason instanceof PlanHashMismatchError, String(reason));
        if (reason instanceof PlanHashMismatchError) assert.equal(await stateOf(roomId), 'PLAN_REVIEW');
        assert.equal(roundTwoRows[0], 'journaled', 'the round won: round two was journaled first');
        assert.deepEqual(await decisionsFor(outcome.commandId), ['plan.revision_requested']);
      }
    }
    t.diagnostic(`lock winners: cancel ${won.cancel}, round ${won.round}`);
  });

  it('the journal verifies from genesis over everything above', async () => {
    const verdict = await journal!.verify();
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
  });
});
