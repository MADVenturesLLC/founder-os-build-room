/**
 * FOUNDER-ACT-20261111-BR-PLANNER-REASK, B11 (b): the control plane's one
 * corrective re-ask, against PostgreSQL as the planner-loop storage suite runs
 * (an owned instance, the real ledger, journal and plan stores, a fence that
 * derives `gatewayOnline` from a switch). The Planner here is scripted per
 * attempt, so a round's first answer can fail and its re-ask can answer.
 */

import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pgDefault from 'pg';
import type { Client as PgClient, Pool as PgPool } from 'pg';
import { destroyOwnedInstance, resolveServerBinaries, startOwnedInstance, type OwnedInstance } from './support/owned-postgres.js';
import { SYNTHETIC_ROUTE, readyPlanFor } from './support/synthetic-planner.js';
import { PlanStore } from '../packages/control-plane/src/plan-store.js';
import { PostgresLedgerStore, type RoomAppendFence } from '../packages/control-plane/src/store.js';
import { JournalStore } from '../packages/control-plane/src/journal-store.js';
import { decidePlan, type PlanDecisionDeps, type PlanDecisionRequest } from '../packages/control-plane/src/plan-decision.js';
import {
  MAX_ROUND_ATTEMPTS,
  PlannerLoop,
  judgeRoundPlan,
  plannerCommandIdFor,
  type PlannerDispatchReceipt,
  type PlannerFailure,
  type PlannerLoopDeps,
  type PlannerPort,
  type PlannerReconciliation,
  type PlannerResult,
  type PlannerRoundOutcome,
  type PlannerWork,
  type RoomRoleAssignment,
} from '../packages/control-plane/src/planner-loop.js';
import { planHash, type CanonicalDocument, type CommandEventRow } from '../packages/journal/src/index.js';
import type { LifecycleEvent } from '../packages/ledger/src/index.js';
import { founderGoalDigest, prepareFounderGoal } from '../packages/control-plane/src/founder-goal.js';
import type { ExecutionIdentity } from '../packages/madbridge-consumed/src/adapter/adapter-v1.js';
import type { PlannerFailureReason } from '../packages/gateway-protocol/src/index.js';

const { Client, Pool } = pgDefault;

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the re-ask suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

const DATABASE = 'br_planner_reask';
const SHA40 = 'a'.repeat(40);
const REPO = 'example-org/example-repo';
const GOAL = 'Add a health detail field to the status route.';
const now = (): Date => new Date('2026-11-11T12:00:00.000Z');

/* ---------------- a Planner scripted per attempt ---------------- */

/** What one dispatch does: not sent, or accepted and then answering with a plan or a failure. */
type Step =
  | { readonly dispatch: 'not_sent' }
  | { readonly answer: 'plan'; readonly overrides?: Record<string, unknown>; readonly document?: unknown }
  | { readonly answer: 'failed'; readonly reason?: PlannerFailureReason };

class ScriptedPlanner implements PlannerPort {
  private steps: Step[] = [];
  private readonly results = new Map<string, PlannerResult>();
  readonly dispatched: PlannerWork[] = [];
  attests = 0;

  script(...steps: Step[]): this {
    this.steps = [...steps];
    this.results.clear();
    this.dispatched.length = 0;
    this.attests = 0;
    return this;
  }

  async attest(): Promise<ExecutionIdentity> {
    this.attests += 1;
    return {
      executionId: `exec-reask-${this.attests}`,
      role: 'architect',
      surface: 'claude-code',
      model: SYNTHETIC_ROUTE.model,
      provider: SYNTHETIC_ROUTE.provider,
      effort: 'n/a',
    };
  }

  async dispatch(work: PlannerWork): Promise<PlannerDispatchReceipt> {
    this.dispatched.push(work);
    const step = this.steps.shift();
    if (step === undefined) throw new Error(`no scripted step for ${work.commandId}`);
    if ('dispatch' in step) return { kind: 'not_sent' };
    this.results.set(
      work.commandId,
      step.answer === 'plan'
        ? { kind: 'plan', document: step.document ?? readyPlanFor(work, step.overrides) }
        : { kind: 'failed', ...(step.reason === undefined ? {} : { reason: step.reason }) },
    );
    return { kind: 'accepted', observed: SYNTHETIC_ROUTE };
  }

  async awaitPlan(commandId: string): Promise<PlannerResult> {
    const result = this.results.get(commandId);
    if (result === undefined) throw new Error(`no result for ${commandId}`);
    return result;
  }

  async reconcile(): Promise<PlannerReconciliation> {
    throw new Error('recovery is not exercised here');
  }
}

/* ---------------- the harness ---------------- */

let instance: OwnedInstance | undefined;
let admin: PgClient | undefined;
let runtimePool: PgPool | undefined;
let ledger: PostgresLedgerStore | undefined;
let plans: PlanStore | undefined;
let journal: JournalStore | undefined;
let decisionDeps: PlanDecisionDeps | undefined;
const planner = new ScriptedPlanner();
const minted: string[] = [];

const ROLES: RoomRoleAssignment = {
  planner: { roleId: 'architect', surface: SYNTHETIC_ROUTE.executionSurface, model: SYNTHETIC_ROUTE.model },
  builder: { roleId: 'builder', surface: 'example-builder-surface', model: null },
  reviewer: { roleId: 'independent-reviewer', surface: 'example-reviewer-surface', model: null },
};

function loopDeps(): PlannerLoopDeps {
  return {
    ledger: ledger!,
    journal: journal!,
    plans: plans!,
    planner,
    route: {
      actorId: 'session:test/planner-reask',
      authorizationRef: 'HO-20261111-planner-reask-test',
      intendedProvider: SYNTHETIC_ROUTE.provider,
      intendedModel: SYNTHETIC_ROUTE.model,
      intendedSurface: SYNTHETIC_ROUTE.executionSurface,
      laneLabel: 'primary',
    },
    dispatcher: { roleId: 'builder', actorId: 'control-plane:test', actualModel: 'n/a (control-plane act)', executionSurface: 'claude-code' },
    roomRoles: async () => ROLES,
    authorizeRoute: async () => 'covers',
    now,
    mintEventId: () => {
      const id = `evt_${randomUUID()}`;
      minted.push(id);
      return id;
    },
    log: () => undefined,
  };
}

function testFence(pool: PgPool): RoomAppendFence {
  return {
    async runRoomAppend(body) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await body(client, async () => true);
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
  journal = new JournalStore(runtimePool, { now, resolveCompletionAuthorization: async () => 'covers' });
  decisionDeps = { ledger, plans, journal, now };
});

after(async () => {
  await runtimePool?.end().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  destroyOwnedInstance(instance);
});

beforeEach(() => {
  planner.script();
  minted.length = 0;
});

async function scopedRoom(): Promise<string> {
  const roomId = randomUUID();
  await ledger!.createRoom(roomId);
  const t1 = await ledger!.append(
    roomId,
    prepareFounderGoal({
      eventId: 'evt_t1',
      event: 'scope.captured',
      actor: 'founder',
      attribution: { roleId: null, actorId: 'founder', actualModel: 'n/a (human Founder act)', executionSurface: 'claude-code' },
      scope: { roomId, repo: REPO, paths: ['src', 'test'] },
      evidence: [],
      occurredAt: '2026-11-11T11:00:00.000Z',
      facts: { repoInAllowlist: true, baseSha: SHA40, remoteHeadSha: SHA40 },
      goal: GOAL,
    } as unknown as LifecycleEvent),
  );
  assert.equal(t1.ok && t1.outcome, 'transition', JSON.stringify(t1));
  return roomId;
}

async function rowsOf(commandId: string): Promise<CommandEventRow[]> {
  const history = await journal!.commandHistory(commandId);
  return history.entries.flatMap((e) => (e.decoded.recordClass === 'command' ? [e.decoded.row] : []));
}

async function eventTypes(commandId: string): Promise<string[]> {
  return (await rowsOf(commandId)).map((row) => row.eventType);
}

async function refsOf(commandId: string, eventType: string): Promise<readonly string[]> {
  return (await rowsOf(commandId)).find((row) => row.eventType === eventType)?.evidenceRefs ?? [];
}

async function classificationOf(commandId: string): Promise<string | undefined> {
  return (await rowsOf(commandId)).find((row) => row.eventType === 'failed')?.failureClassification;
}

async function planCount(commandId: string): Promise<number> {
  const { rows } = await admin!.query<{ n: string }>('SELECT count(*)::text AS n FROM build_room_plans WHERE command_id = $1', [commandId]);
  return Number(rows[0]!.n);
}

async function stateOf(roomId: string): Promise<string> {
  return (await ledger!.loadRoom(roomId)).state.state;
}

const revise = (hash: string, feedback: string): PlanDecisionRequest => ({
  decision: 'plan.revision_requested',
  planHash: hash,
  feedback,
  actualModel: 'n/a (human Founder decision)',
  executionSurface: 'claude-code',
});

/** A first round under `steps`: the room, the call's outcome and the round's attempt ids. */
async function firstRound(...steps: Step[]): Promise<{ roomId: string; outcome: PlannerRoundOutcome; attempt: (n: number) => string }> {
  const roomId = await scopedRoom();
  minted.length = 0;
  planner.script(...steps);
  const outcome = await new PlannerLoop(loopDeps()).runRound(roomId);
  const opening = minted[0]!;
  return { roomId, outcome, attempt: (n) => plannerCommandIdFor(roomId, opening, n) };
}

const ATTEMPT_ROWS = ['journaled', 'identity_bound', 'dispatched'];
const INVALID = { answer: 'plan', overrides: { objective: 7 } } as const;
const VALID = { answer: 'plan' } as const;

/* ---------------- cases ---------------- */

describe('the corrective re-ask on PostgreSQL (FOUNDER-ACT-20261111-BR-PLANNER-REASK B1, B4; B11(b))', { skip: SKIP_REASON }, () => {
  it('a plan refused for its schema is re-asked in the same call, with the plan and its reason; the re-ask reaches plan review', async () => {
    const { roomId, outcome, attempt } = await firstRound(INVALID, VALID);
    assert.equal(outcome.kind, 'plan_review', JSON.stringify(outcome));
    assert.equal(outcome.kind === 'plan_review' && outcome.commandId, attempt(2), 'the plan under review is the re-ask\'s');

    // The first attempt: failed plan_invalid, the refused plan's hash journaled with it (B4).
    const refused = planner.dispatched[0]!;
    const refusedDocument = readyPlanFor(refused, { objective: 7 });
    assert.deepEqual(await eventTypes(attempt(1)), [...ATTEMPT_ROWS, 'failed']);
    assert.equal(await classificationOf(attempt(1)), 'plan_invalid');
    assert.deepEqual(await refsOf(attempt(1), 'failed'), [`refused-plan/${planHash(refusedDocument as unknown as CanonicalDocument)}`]);
    assert.equal(await planCount(attempt(1)), 0);

    // The re-ask: the next derived id, journaled with its reason, its work saying why (B3, B4).
    assert.deepEqual(await eventTypes(attempt(2)), [...ATTEMPT_ROWS, 'completed']);
    const journaledRefs = await refsOf(attempt(2), 'journaled');
    assert.ok(journaledRefs.includes(`retry-of/${attempt(1)}`), JSON.stringify(journaledRefs));
    assert.ok(journaledRefs.includes('retry-reason/plan_invalid'), JSON.stringify(journaledRefs));
    assert.equal(planner.dispatched.length, 2);
    const reask = planner.dispatched[1]!;
    assert.equal(reask.commandId, attempt(2));
    assert.equal(planner.dispatched[0]!.reask, undefined, 'the first attempt carries no re-ask');
    const verdict = judgeRoundPlan(refusedDocument, { repository: REPO, baseSha: SHA40, scopePaths: ['src', 'test'], goalEventId: 'evt_t1', goal: GOAL, goalDigest: founderGoalDigest(GOAL) });
    assert.ok(!verdict.ok);
    assert.deepEqual(reask.reask, { refused: 'plan_invalid', reason: verdict.ok ? null : verdict.reason, refusedPlan: refusedDocument });
    assert.equal(await planCount(attempt(2)), 1);
    assert.equal(await stateOf(roomId), 'PLAN_REVIEW');
  });

  for (const reason of ['unparseable_plan', 'malformed_output', 'no_result', 'agy_error', 'oversize'] as const) {
    it(`a Planner failure the Gateway reports as ${reason} is re-asked, the reason journaled on the failure`, async () => {
      const { outcome, attempt } = await firstRound({ answer: 'failed', reason }, VALID);
      assert.equal(outcome.kind === 'plan_review' && outcome.commandId, attempt(2), JSON.stringify(outcome));
      assert.equal(await classificationOf(attempt(1)), 'planner_reported_failure');
      assert.deepEqual(await refsOf(attempt(1), 'failed'), [`planner-failure/${reason}`]);
      const journaledRefs = await refsOf(attempt(2), 'journaled');
      assert.ok(journaledRefs.includes(`retry-of/${attempt(1)}`) && journaledRefs.includes('retry-reason/planner_reported_failure'), JSON.stringify(journaledRefs));
      assert.deepEqual(planner.dispatched[1]!.reask, { refused: 'planner_reported_failure', reason });
    });
  }

  it('a re-ask that fails ends the round, with no third attempt; a later call re-asks nothing', async () => {
    for (const second of [INVALID, { answer: 'failed', reason: 'unparseable_plan' } as const, { dispatch: 'not_sent' } as const]) {
      const { roomId, outcome, attempt } = await firstRound(INVALID, second);
      assert.equal(outcome.kind, 'failed', JSON.stringify(second));
      assert.equal(outcome.kind === 'failed' && outcome.commandId, attempt(2), 'the outcome is the re-ask\'s');
      assert.deepEqual(await eventTypes(attempt(3)), [], 'no third attempt');
      assert.equal(planner.dispatched.length, 2);
      assert.equal(await stateOf(roomId), 'PLANNING');
      if ('dispatch' in second) continue; // a not_sent re-ask stays under Q8's retry, which this act leaves as it is
      planner.script(VALID);
      const again = await new PlannerLoop(loopDeps()).runRound(roomId);
      assert.deepEqual(again.kind === 'refused' && again.code, 'round_failed', JSON.stringify(again));
      assert.equal(planner.dispatched.length, 0, 'nothing is sent');
    }
  });

  it('no re-ask for anything else: a blocked plan, a plan outside the scope, a timeout, a model switch, a failure with no reason', async () => {
    const cases: Array<[Step, PlannerFailure, readonly string[]]> = [
      [{ answer: 'plan', overrides: { terminal_status: 'BLOCKED_FOUNDER_DECISION' } }, 'plan_invalid', ['refused-plan/']],
      [{ answer: 'plan', overrides: { scope_paths: ['docs/readme.md'] } }, 'plan_outside_captured_scope', []],
      [{ answer: 'failed', reason: 'timed_out' }, 'planner_reported_failure', ['planner-failure/timed_out']],
      [{ answer: 'failed', reason: 'model_switched' }, 'planner_reported_failure', ['planner-failure/model_switched']],
      [{ answer: 'failed' }, 'planner_reported_failure', []],
    ];
    for (const [step, classification, refs] of cases) {
      const { outcome, attempt } = await firstRound(step, VALID);
      assert.equal(outcome.kind === 'failed' && outcome.classification, classification, JSON.stringify(step));
      assert.equal(outcome.kind === 'failed' && outcome.commandId, attempt(1));
      assert.deepEqual(await eventTypes(attempt(2)), [], `no re-ask after ${JSON.stringify(step)}`);
      assert.equal(planner.dispatched.length, 1);
      const failedRefs = await refsOf(attempt(1), 'failed');
      assert.equal(failedRefs.length, refs.length, JSON.stringify(failedRefs));
      refs.forEach((prefix, i) => assert.ok(failedRefs[i]!.startsWith(prefix), failedRefs[i]));
    }
  });

  it('a route that differs is failed, never re-asked', async () => {
    const roomId = await scopedRoom();
    minted.length = 0;
    planner.script(VALID, VALID);
    const diverging: PlannerPort = {
      attest: () => planner.attest(),
      dispatch: async (work) => {
        await planner.dispatch(work);
        return { kind: 'accepted', observed: { ...SYNTHETIC_ROUTE, model: 'another-model' } };
      },
      awaitPlan: (commandId) => planner.awaitPlan(commandId),
      reconcile: () => planner.reconcile(),
    };
    const outcome = await new PlannerLoop({ ...loopDeps(), planner: diverging }).runRound(roomId);
    assert.equal(outcome.kind === 'failed' && outcome.classification, 'route_mismatch');
    assert.deepEqual(await eventTypes(plannerCommandIdFor(roomId, minted[0]!, 2)), []);
  });

  it('a revision round re-asks with its earlier plan as well', async () => {
    const { roomId, outcome } = await firstRound(VALID);
    assert.ok(outcome.kind === 'plan_review');
    const revised = await decidePlan(decisionDeps!, roomId, revise(outcome.planHash, 'Narrow it to the handler.'));
    const roundTwo = (n: number) => plannerCommandIdFor(roomId, revised.appended.event.eventId, n);

    planner.script(INVALID, VALID);
    const second = await new PlannerLoop(loopDeps()).runRound(roomId);
    assert.equal(second.kind === 'plan_review' && second.commandId, roundTwo(2), JSON.stringify(second));
    const [first, reask] = planner.dispatched;
    const earlierPlan = (await plans!.planForCommand(outcome.commandId))!.document;
    assert.deepEqual(first!.revision?.earlierPlan, earlierPlan);
    assert.deepEqual(reask!.revision?.earlierPlan, earlierPlan, 'the re-ask still revises the earlier plan');
    assert.equal(reask!.revision?.revisingPlanHash, outcome.planHash);
    assert.equal(reask!.reask?.refused, 'plan_invalid');
    assert.deepEqual(reask!.reask?.refused === 'plan_invalid' && reask!.reask.refusedPlan, readyPlanFor(first!, { objective: 7 }));
  });

  it('no round exceeds its attempts: after two not_sent attempts, a plan_invalid third is not re-asked', async () => {
    const roomId = await scopedRoom();
    minted.length = 0;
    planner.script({ dispatch: 'not_sent' });
    assert.equal((await new PlannerLoop(loopDeps()).runRound(roomId)).kind, 'failed');
    planner.script({ dispatch: 'not_sent' });
    assert.equal((await new PlannerLoop(loopDeps()).runRound(roomId)).kind, 'failed');
    planner.script(INVALID, VALID);
    const third = await new PlannerLoop(loopDeps()).runRound(roomId);
    const attempt = (n: number) => plannerCommandIdFor(roomId, minted[0]!, n);
    assert.equal(MAX_ROUND_ATTEMPTS, 3);
    assert.equal(third.kind === 'failed' && third.classification, 'plan_invalid', JSON.stringify(third));
    assert.equal(third.kind === 'failed' && third.commandId, attempt(3));
    assert.equal(planner.dispatched.length, 1, 'nothing past the third attempt is sent');
    assert.ok((await refsOf(attempt(3), 'journaled')).includes('retry-reason/not_sent'));
  });

  it('a not_sent attempt after a re-ask is Q8\'s retry, and the round re-asks no second time', async () => {
    const { roomId, outcome, attempt } = await firstRound(INVALID, { dispatch: 'not_sent' });
    assert.equal(outcome.kind === 'failed' && outcome.classification, 'not_sent');
    planner.script(INVALID, VALID);
    const retried = await new PlannerLoop(loopDeps()).runRound(roomId);
    assert.equal(retried.kind === 'failed' && retried.classification, 'plan_invalid', JSON.stringify(retried));
    assert.equal(retried.kind === 'failed' && retried.commandId, attempt(3));
    assert.ok((await refsOf(attempt(3), 'journaled')).includes('retry-reason/not_sent'));
    assert.equal(planner.dispatched.length, 1, 'the round has made its one re-ask');
  });

  it('the journal verifies from genesis over everything above', async () => {
    const verdict = await journal!.verify();
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
  });
});
