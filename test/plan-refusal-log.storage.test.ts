/**
 * The refusal log on PostgreSQL (FOUNDER-ACT-20261107-BR-PLANDOC-ITEM-LIMIT
 * B3 and B6(3) to (5)): a round whose plan judgeRoundPlan refuses writes
 * exactly one planner.plan_refused line and ends as it did before, with the
 * same journal rows, no plan stored and the room in PLANNING; an accepted
 * plan, R2's 4,808-character step among them, writes none; recovery writes
 * the same line when it refuses a reconciled plan; and no line holds a string
 * the plan wrote. A plan refused for its schema or a scope path now earns the
 * round its one corrective re-ask (FOUNDER-ACT-20261111-BR-PLANNER-REASK B1,
 * B4), which this suite's Planner answers with the same refused plan: one line
 * per refused answer, and the round ends failed on the re-ask's command.
 *
 * `TEST_DATABASE_URL` is only the run gate. The suite runs on its own
 * PostgreSQL instance, connected as `br_app_runtime`, as the planner-loop
 * suite does.
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
import { JournalStore } from '../packages/control-plane/src/journal-store.js';
import { prepareFounderGoal } from '../packages/control-plane/src/founder-goal.js';
import {
  PlannerLoop,
  plannerCommandIdFor,
  type PlannerLog,
  type PlannerLoopDeps,
} from '../packages/control-plane/src/planner-loop.js';
import { PlannerRecovery, type PlannerRecoveryDeps } from '../packages/control-plane/src/planner-recovery.js';
import type { CommandEventRow } from '../packages/journal/src/index.js';
import type { LifecycleEvent } from '../packages/ledger/src/index.js';

const { Client, Pool } = pgDefault;

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the plan-refusal-log suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

const DATABASE = 'br_plan_refusal_log';
const SHA40 = 'a'.repeat(40);
const REPO = 'example-org/example-repo';
const CANARY = 'qz7canary';
const now = (): Date => new Date('2026-11-07T12:00:00.000Z');

let instance: OwnedInstance | undefined;
let admin: PgClient | undefined;
let runtimePool: PgPool | undefined;
let ledger: PostgresLedgerStore | undefined;
let plans: PlanStore | undefined;
let journal: JournalStore | undefined;

const planner = new SyntheticPlanner();
const minted: string[] = [];
const lines: Array<{ level: string; at: string; fields: Record<string, unknown> }> = [];
const log: PlannerLog = (level, at, fields) => {
  lines.push({ level, at, fields: JSON.parse(JSON.stringify(fields)) as Record<string, unknown> });
};
const refusals = (): Array<Record<string, unknown>> => lines.filter((l) => l.at === 'planner.plan_refused').map((l) => l.fields);

function fence(pool: PgPool): RoomAppendFence {
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

const route = {
  actorId: 'session:test/plan-refusal-log',
  authorizationRef: 'HO-20261107-plan-refusal-log-test',
  intendedProvider: SYNTHETIC_ROUTE.provider,
  intendedModel: SYNTHETIC_ROUTE.model,
  intendedSurface: SYNTHETIC_ROUTE.executionSurface,
  laneLabel: 'primary',
};

const mintEventId = (): string => {
  const id = `evt_${randomUUID()}`;
  minted.push(id);
  return id;
};

function loopDeps(overrides: Partial<PlannerLoopDeps> = {}): PlannerLoopDeps {
  return {
    ledger: ledger!,
    journal: journal!,
    plans: plans!,
    planner,
    route,
    dispatcher: { roleId: 'builder', actorId: 'control-plane:test', actualModel: 'n/a (control-plane act)', executionSurface: 'claude-code' },
    roomRoles: async () => ({
      planner: { roleId: 'architect', surface: SYNTHETIC_ROUTE.executionSurface, model: SYNTHETIC_ROUTE.model },
      builder: { roleId: 'builder', surface: 'example-builder-surface', model: null },
      reviewer: { roleId: 'independent-reviewer', surface: 'example-reviewer-surface', model: null },
    }),
    authorizeRoute: async () => 'covers',
    now,
    mintEventId,
    log,
    ...overrides,
  };
}

function recoveryDeps(overrides: Partial<PlannerRecoveryDeps> = {}): PlannerRecoveryDeps {
  return { ledger: ledger!, journal: journal!, plans: plans!, planner, route, now, mintEventId, log, ...overrides };
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
  ledger = new PostgresLedgerStore(runtimePool, fence(runtimePool));
  plans = new PlanStore(runtimePool);
  journal = new JournalStore(runtimePool, { now, resolveCompletionAuthorization: async () => 'covers' });
});

after(async () => {
  await runtimePool?.end().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  destroyOwnedInstance(instance);
});

beforeEach(() => {
  planner.reset();
  minted.length = 0;
  lines.length = 0;
});

async function scopedRoom(): Promise<string> {
  const roomId = randomUUID();
  await ledger!.createRoom(roomId);
  const t1 = await ledger!.append(roomId, prepareFounderGoal({
    goal: 'Add a health detail field to the status route.',
    eventId: 'evt_t1',
    event: 'scope.captured',
    actor: 'founder',
    attribution: { roleId: null, actorId: 'founder', actualModel: 'n/a (human Founder act)', executionSurface: 'claude-code' },
    scope: { roomId, repo: REPO, paths: ['src', 'test'] },
    evidence: [],
    occurredAt: '2026-11-07T11:00:00.000Z',
    facts: { repoInAllowlist: true, baseSha: SHA40, remoteHeadSha: SHA40 },
  } as unknown as LifecycleEvent));
  assert.equal(t1.ok && t1.outcome, 'transition', JSON.stringify(t1));
  return roomId;
}

async function roundOne(behaviour: Parameters<SyntheticPlanner['reset']>[0]) {
  const roomId = await scopedRoom();
  minted.length = 0;
  lines.length = 0;
  planner.reset(behaviour);
  const outcome = await new PlannerLoop(loopDeps()).runRound(roomId);
  return { roomId, outcome, commandId: plannerCommandIdFor(roomId, minted[0]!) };
}

async function eventTypes(commandId: string): Promise<string[]> {
  const history = await journal!.commandHistory(commandId);
  return history.entries.flatMap((e) => (e.decoded.recordClass === 'command' ? [(e.decoded.row as CommandEventRow).eventType] : []));
}

async function planCount(commandId: string): Promise<number> {
  const { rows } = await admin!.query<{ n: string }>('SELECT count(*)::text AS n FROM build_room_plans WHERE command_id = $1', [commandId]);
  return Number(rows[0]!.n);
}

async function stateOf(roomId: string): Promise<string> {
  return (await ledger!.loadRoom(roomId)).state.state;
}

const seededProse = {
  current_state: `${CANARY} state`,
  constraints: `${CANARY} constraints`,
  data_flow: `${CANARY} flow`,
  acceptance_criteria: [`${CANARY} criterion`],
};

describe('planner.plan_refused on PostgreSQL', { skip: SKIP_REASON }, () => {
  it('each refusal writes one line, and the round ends as before: failed, same rows, no plan, PLANNING', async () => {
    const cases: Array<[string, Record<string, unknown>, string, string]> = [
      ['an item over 20,000', { ...seededProse, implementation_sequence: ['Edit handler', `${CANARY} `.repeat(2_001)] }, 'plan_invalid', 'schema'],
      ['an undeclared key', { ...seededProse, [`${CANARY}_notes`]: `${CANARY} value` }, 'plan_invalid', 'schema'],
      ['scope paths out of order', { ...seededProse, scope_paths: ['src/b.ts', 'src/a.ts'] }, 'plan_invalid', 'scope_path'],
      ['a plan not ready', { ...seededProse, terminal_status: 'BLOCKED_FOUNDER_DECISION' }, 'plan_invalid', 'not_ready'],
      ['another repository', { ...seededProse, repository: `${CANARY}/repo` }, 'plan_outside_captured_scope', 'outside_captured_scope'],
    ];
    for (const [name, planOverrides, classification, kind] of cases) {
      const { roomId, outcome, commandId } = await roundOne({ planOverrides });
      // A schema or scope path refusal is re-asked once (re-ask act B1); the re-ask is refused the same way.
      const reasked = kind === 'schema' || kind === 'scope_path';
      const attempts = reasked ? [commandId, plannerCommandIdFor(roomId, minted[0]!, 2)] : [commandId];
      assert.deepEqual(outcome, { kind: 'failed', commandId: attempts.at(-1), classification }, name);
      for (const attempt of attempts) {
        assert.deepEqual(await eventTypes(attempt), ['journaled', 'identity_bound', 'dispatched', 'failed'], name);
        assert.equal(await planCount(attempt), 0, name);
      }
      assert.equal(await stateOf(roomId), 'PLANNING', name);
      const written = refusals();
      assert.equal(written.length, attempts.length, `${name}: exactly one line per refused answer`);
      written.forEach((line, i) => {
        assert.equal(line['roomId'], roomId, name);
        assert.equal(line['commandId'], attempts[i], name);
        assert.equal(line['classification'], classification, name);
        assert.equal((line['reason'] as { kind: string }).kind, kind, name);
      });
      assert.equal(lines.filter((l) => l.at === 'planner.plan_refused').every((l) => l.level === 'error'), true);
      assert.doesNotMatch(JSON.stringify(lines), /qz7canary/i, `${name}: no string from the plan`);
    }
  });

  it('names the broken rule: R2\'s shape, one step over the bound, gives its path, length and bound', async () => {
    const { roomId, commandId } = await roundOne({ planOverrides: { implementation_sequence: ['Edit handler', 'z'.repeat(20_001)] } });
    // One line for the refused answer and one for its re-ask, refused the same way (re-ask act B1).
    const line = (id: string) => ({
      roomId,
      commandId: id,
      classification: 'plan_invalid',
      reason: { kind: 'schema', violationCount: 1, violations: [{ code: 'length', path: '/implementation_sequence/1', found: 20_001, bound: 20_000 }] },
    });
    assert.deepEqual(refusals(), [line(commandId), line(plannerCommandIdFor(roomId, minted[0]!, 2))]);
  });

  it('an accepted plan writes no line: a 4,808-character step and one of 20,000 reach plan_review', async () => {
    for (const length of [4_808, 20_000]) {
      const { roomId, outcome, commandId } = await roundOne({ planOverrides: { implementation_sequence: ['Edit handler', 'w'.repeat(length)] } });
      assert.equal(outcome.kind, 'plan_review', String(length));
      assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched', 'completed']);
      assert.equal(await planCount(commandId), 1);
      assert.equal(await stateOf(roomId), 'PLAN_REVIEW');
      assert.deepEqual(refusals(), [], String(length));
    }
  });

  it('recovery writes the same line when it refuses a reconciled plan, and resolves the command failed as before', async () => {
    const planOverrides = { ...seededProse, implementation_sequence: ['Edit handler', `${CANARY} `.repeat(2_001)] };
    const roomId = await scopedRoom();
    minted.length = 0;
    planner.reset({ result: 'throw', planOverrides });
    const lost = await new PlannerLoop(loopDeps()).runRound(roomId);
    const commandId = plannerCommandIdFor(roomId, minted[0]!);
    assert.equal(lost.kind, 'unresolved', 'the wait was lost, so the round judged nothing');
    assert.deepEqual(refusals(), []);
    const outcome = await new PlannerRecovery(recoveryDeps()).recoverRoom(roomId);
    assert.deepEqual(outcome, { kind: 'resolved_failed', commandId });
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched', 'unresolved', 'resolved']);
    assert.equal(await planCount(commandId), 0);
    const written = refusals();
    assert.equal(written.length, 1);
    assert.deepEqual(written[0], {
      roomId,
      commandId,
      classification: 'plan_invalid',
      reason: { kind: 'schema', violationCount: 1, violations: [{ code: 'length', path: '/implementation_sequence/1', found: 20_010, bound: 20_000 }] },
    });
    assert.doesNotMatch(JSON.stringify(lines), /qz7canary/i);
  });

  it('a log that throws leaves the round as it was', async () => {
    const roomId = await scopedRoom();
    minted.length = 0;
    planner.reset({ planOverrides: { terminal_status: 'BLOCKED_RESEARCH_GAP' } });
    const outcome = await new PlannerLoop(loopDeps({ log: () => { throw new Error('the log is gone'); } })).runRound(roomId);
    const commandId = plannerCommandIdFor(roomId, minted[0]!);
    assert.deepEqual(outcome, { kind: 'failed', commandId, classification: 'plan_invalid' });
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched', 'failed']);
  });
});
