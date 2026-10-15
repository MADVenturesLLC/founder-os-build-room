/**
 * The Founder's plan decision end to end on PostgreSQL, over a genuine
 * `br_app_runtime` LOGIN: the real ledger store, plan store and journal
 * store, one room driven to PLAN_REVIEW per case through T1, T2 and a T3
 * that commits with its plan.
 *
 * FIXTURE: an exclusively owned disposable PostgreSQL instance
 * (`test/support/owned-postgres.ts`) with the full canonical sequence.
 * `TEST_DATABASE_URL` is only the run gate.
 *
 * What is proven, in order: an approval moves the room to BUILDING and its
 * decision record, bound to the planner command, commits with it; a wrong
 * hash is G5's recorded rejection with no decision record; a revision moves
 * the room back to PLANNING carrying the feedback; a revision's wrong hash
 * writes nothing; a decision whose journal record cannot be written leaves
 * no transition either (contract §1.4); a decided plan cannot be decided
 * again; two concurrent approvals produce one; the same event id replays;
 * and the journal verifies from genesis afterwards.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pgDefault from 'pg';
import type { Client as PgClient, Pool as PgPool } from 'pg';
import { destroyOwnedInstance, resolveServerBinaries, startOwnedInstance, type OwnedInstance } from './support/owned-postgres.js';
import { judgePlanDoc } from '../packages/control-plane/src/plan-doc.js';
import { PlanStore } from '../packages/control-plane/src/plan-store.js';
import { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import { JournalSequenceError, JournalStore } from '../packages/control-plane/src/journal-store.js';
import { PlanHashMismatchError, decidePlan, type PlanDecisionDeps, type PlanDecisionRequest } from '../packages/control-plane/src/plan-decision.js';
import type { GovernedCommandRequest } from '../packages/journal/src/index.js';
import type { LifecycleEvent } from '../packages/ledger/src/index.js';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { createServer } from '../packages/control-plane/src/server.js';
import { createGatewaySurface } from '../packages/control-plane/src/gateway/index.js';
import { ScriptedClock, primeClockGate } from '../packages/control-plane/src/gateway/clock.js';
import { closeServer } from './support/close-server.js';

const { Client, Pool } = pgDefault;

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the plan-decision suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

const DATABASE = 'br_plan_decision';
const SHA40 = 'a'.repeat(40);
const now = (): Date => new Date('2026-10-15T12:00:00.000Z');

let instance: OwnedInstance | undefined;
let admin: PgClient | undefined;
let runtimePool: PgPool | undefined;
let deps: PlanDecisionDeps | undefined;
let journal: JournalStore | undefined;
let ledger: PostgresLedgerStore | undefined;
let plans: PlanStore | undefined;

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
  ledger = new PostgresLedgerStore(runtimePool);
  plans = new PlanStore(runtimePool);
  journal = new JournalStore(runtimePool, { now });
  deps = { ledger, plans, journal, now };
});

after(async () => {
  await runtimePool?.end().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  destroyOwnedInstance(instance);
});

/* ---------------- fixtures ---------------- */

function plan(workId: string): Record<string, unknown> {
  return {
    schema_version: 'plandoc/1',
    work_id: workId,
    objective: 'Add a health detail field.',
    terminal_status: 'PLAN_READY_FOR_FOUNDER_APPROVAL',
    controlling_inputs: [{ path: 'research/packet.md', sha256: 'b'.repeat(64) }],
    repository: 'example-org/example-repo',
    base_sha: SHA40,
    scope_paths: ['src/health.ts', 'test/health.test.ts'],
    current_state: 'Health answers status only.',
    constraints: 'No new dependency.',
    non_goals: 'No UI.',
    architecture_decision: 'Extend the existing handler.',
    alternatives_considered: 'A new route; rejected as wider.',
    components_and_boundaries: 'The health handler only.',
    interfaces_and_contracts: 'Response gains one field.',
    data_flow: 'Read uptime, return it.',
    trust_and_security_boundaries: 'Public route; no secrets.',
    migration_and_compatibility: 'Additive.',
    error_and_failure_behavior: 'Unchanged.',
    observability: 'None added.',
    test_strategy: 'One unit test.',
    rollback_plan: 'Revert the commit.',
    dependency_ordering: 'None.',
    acceptance_criteria: ['The field is present.'],
    implementation_sequence: ['Edit handler', 'Add test'],
    known_risks: [],
    unresolved_founder_decisions: [],
    plan_drift_stop_conditions: ['Base moved'],
    next_role: 'founder_approval',
    claims: { plan_approved: false, builder_authorized: false },
  };
}

function hashOf(document: unknown): string {
  const verdict = judgePlanDoc(document);
  assert.ok(verdict.ok);
  return verdict.planHash;
}

function plannerCommand(commandId: string): GovernedCommandRequest {
  return {
    commandKind: 'planner.invoke',
    argv: ['--work', commandId],
    actorId: 'session:test/plan-decision',
    roleId: 'architect',
    authorizationRef: 'HO-20261015-example',
    repository: 'example-org/example-repo',
    scopeRef: 'scope/phase4',
    intendedProvider: 'example-provider',
    intendedModel: 'example-model',
    intendedSurface: 'claude-code',
    commandId,
  };
}

const at = '2026-10-15T11:00:00.000Z';

function lifecycle(roomId: string, eventId: string, event: string, actor: string, roleId: string | null, facts: Record<string, unknown>): LifecycleEvent {
  return {
    eventId,
    event,
    actor,
    attribution: { roleId, actorId: roleId === null ? 'founder' : 'session:test/plan-decision', actualModel: 'n/a (test fixture)', executionSurface: 'claude-code' },
    scope: { roomId, repo: 'example-org/example-repo', paths: [] },
    evidence: [],
    occurredAt: at,
    facts,
  } as unknown as LifecycleEvent;
}

/** A room in PLAN_REVIEW whose plan was submitted, with its T3, by `commandId`. */
async function roomUnderReview(options: { journalPlanner?: boolean } = {}): Promise<{ roomId: string; commandId: string; planHash: string }> {
  const roomId = randomUUID();
  const commandId = `cmd_pd_${roomId.slice(0, 8)}`;
  const document = plan(`W-${roomId.slice(0, 8)}`);
  const planHash = hashOf(document);
  await ledger!.createRoom(roomId);
  const t1 = await ledger!.append(roomId, lifecycle(roomId, 'evt_t1', 'scope.captured', 'founder', null, { repoInAllowlist: true, baseSha: SHA40, remoteHeadSha: SHA40 }));
  assert.equal(t1.ok, true, JSON.stringify(t1));
  const t2 = await ledger!.append(roomId, lifecycle(roomId, 'evt_t2', 'task.dispatched.planner', 'system', 'builder', { rolesAssigned: true, reviewerIsNotBuilder: true, gatewayOnline: true }));
  assert.equal(t2.ok, true, JSON.stringify(t2));
  if (options.journalPlanner !== false) await journal!.appendJournaled(plannerCommand(commandId));
  const t3 = await ledger!.appendDerived(roomId, {
    build: async () => lifecycle(roomId, 'evt_t3', 'plan.submitted', 'agent.planner', 'architect', { planDocSchemaValid: true, planHash }),
    afterTransition: async (client) => plans!.inTransaction(client).recordPlan({ roomId, commandId, lifecycleEventId: 'evt_t3', document }),
  });
  assert.equal(t3.result.ok && t3.result.outcome, 'transition', JSON.stringify(t3.result));
  return { roomId, commandId, planHash };
}

const approve = (planHash: string, eventId?: string): PlanDecisionRequest => ({
  decision: 'plan.approved',
  planHash,
  actualModel: 'n/a (human Founder decision)',
  executionSurface: 'claude-code',
  ...(eventId === undefined ? {} : { eventId }),
});

const revise = (planHash: string, feedback: string): PlanDecisionRequest => ({
  decision: 'plan.revision_requested',
  planHash,
  feedback,
  actualModel: 'n/a (human Founder decision)',
  executionSurface: 'claude-code',
});

async function roomState(roomId: string): Promise<string> {
  return (await ledger!.loadRoom(roomId)).state.state;
}

async function decisionsFor(commandId: string): Promise<string[]> {
  const history = await journal!.commandHistory(commandId);
  return history.entries.flatMap((e) => (e.decoded.recordClass === 'decision' ? [e.decoded.row.decision] : []));
}

/* ---------------- the suite ---------------- */

describe('plan decision — approval and revision, each with its decision record', { skip: SKIP_REASON }, () => {
  it('an approval moves the room to BUILDING, and its decision record is bound to the planner command', async () => {
    const { roomId, commandId, planHash } = await roomUnderReview();
    const { appended, decided } = await decidePlan(deps!, roomId, approve(planHash));
    assert.equal(appended.result.ok && appended.result.outcome, 'transition');
    assert.equal(await roomState(roomId), 'BUILDING');
    assert.equal(decided?.plan.commandId, commandId);
    assert.deepEqual(await decisionsFor(commandId), ['plan.approved']);
    const { rows } = await admin!.query<{ facts: Record<string, unknown> }>(
      "SELECT payload->'facts' AS facts FROM build_room_events WHERE room_id = $1 AND event = 'plan.approved'",
      [roomId],
    );
    assert.deepEqual(rows[0]?.facts, { planHash, expectedPlanHash: planHash, scopePathsCanonical: true });
  });

  it('a wrong hash is G5’s recorded rejection, with no decision record', async () => {
    const { roomId, commandId } = await roomUnderReview();
    const { appended } = await decidePlan(deps!, roomId, approve('c'.repeat(64)));
    assert.equal(appended.result.ok, false);
    if (!appended.result.ok && appended.result.outcome === 'rejected') {
      assert.equal(appended.result.code, 'guard_failed');
      assert.match(appended.result.reason, /plan_hash mismatch/);
    }
    assert.equal(await roomState(roomId), 'PLAN_REVIEW');
    assert.deepEqual(await decisionsFor(commandId), []);
    const { rows } = await admin!.query('SELECT 1 FROM build_room_rejections WHERE room_id = $1', [roomId]);
    assert.equal(rows.length, 1, 'the rejection is on the record');
  });

  it('a revision moves the room back to PLANNING and carries the feedback', async () => {
    const { roomId, commandId, planHash } = await roomUnderReview();
    await decidePlan(deps!, roomId, revise(planHash, 'Narrow the scope to the handler.'));
    assert.equal(await roomState(roomId), 'PLANNING');
    assert.deepEqual(await decisionsFor(commandId), ['plan.revision_requested']);
    const { rows } = await admin!.query<{ feedback: string }>(
      "SELECT payload->>'feedback' AS feedback FROM build_room_events WHERE room_id = $1 AND event = 'plan.revision_requested'",
      [roomId],
    );
    assert.equal(rows[0]?.feedback, 'Narrow the scope to the handler.');
  });

  it('a revision against a hash that is not the plan under review writes nothing', async () => {
    const { roomId, commandId } = await roomUnderReview();
    await assert.rejects(decidePlan(deps!, roomId, revise('c'.repeat(64), 'x')), PlanHashMismatchError);
    assert.equal(await roomState(roomId), 'PLAN_REVIEW');
    assert.deepEqual(await decisionsFor(commandId), []);
  });
});

describe('plan decision — the decision and its lifecycle event commit together or not at all', { skip: SKIP_REASON }, () => {
  it('when the decision record cannot be written, the transition does not stand either', async () => {
    const { roomId, commandId, planHash } = await roomUnderReview({ journalPlanner: false });
    await assert.rejects(decidePlan(deps!, roomId, approve(planHash)), (err: unknown) =>
      err instanceof JournalSequenceError && /not journaled before it/.test(err.reason));
    assert.equal(await roomState(roomId), 'PLAN_REVIEW', 'the T5 rolled back with the refused decision record');
    const { rows } = await admin!.query("SELECT 1 FROM build_room_events WHERE room_id = $1 AND event = 'plan.approved'", [roomId]);
    assert.equal(rows.length, 0);
    assert.equal((await journal!.commandHistory(commandId)).entries.length, 0);
  });

  it('a decided plan cannot be decided again', async () => {
    const { roomId, commandId, planHash } = await roomUnderReview();
    await decidePlan(deps!, roomId, approve(planHash));
    const again = await decidePlan(deps!, roomId, revise(planHash, 'Too late.'));
    assert.equal(again.appended.result.ok, false);
    assert.deepEqual(await decisionsFor(commandId), ['plan.approved']);
  });

  it('two concurrent approvals of one plan produce one transition and one decision record', async () => {
    const { roomId, commandId, planHash } = await roomUnderReview();
    const outcomes = await Promise.all([decidePlan(deps!, roomId, approve(planHash)), decidePlan(deps!, roomId, approve(planHash))]);
    const transitions = outcomes.filter((o) => o.appended.result.ok && o.appended.result.outcome === 'transition');
    assert.equal(transitions.length, 1);
    assert.deepEqual(await decisionsFor(commandId), ['plan.approved']);
  });

  it('the same event id replays: no second transition and no second decision record', async () => {
    const { roomId, commandId, planHash } = await roomUnderReview();
    await decidePlan(deps!, roomId, approve(planHash, 'evt_founder_once'));
    const replay = await decidePlan(deps!, roomId, approve(planHash, 'evt_founder_once'));
    assert.equal(replay.appended.result.ok && replay.appended.result.outcome, 'replay');
    assert.equal(replay.decided, null);
    assert.deepEqual(await decisionsFor(commandId), ['plan.approved']);
  });

  it('the journal verifies from genesis over everything the suite wrote', async () => {
    const verdict = await journal!.verify();
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
  });
});

describe('plan decision — over HTTP, through the fenced room append the server uses', { skip: SKIP_REASON }, () => {
  const ADJUDICATION = 'plan-decision-storage-adjudication-token-xyz';
  const CONTROL = 'plan-decision-storage-control-plane-token-xyz';

  it('the adjudication token approves; the fenced transaction carries the decision record; the control-plane token is refused', async () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://user:secret@host.neon.tech/db?sslmode=require',
      CONTROL_PLANE_TOKEN: CONTROL,
      PHASE3_ADJUDICATION_TOKEN: ADJUDICATION,
      COMMIT_SHA: 'deadbeef',
    });
    const { rows } = await runtimePool!.query<{ now: Date }>('SELECT now() AS now');
    const clock = new ScriptedClock(rows[0]!.now.getTime(), 1_000_000);
    const gateway = createGatewaySurface({ pool: runtimePool!, config, clock, log: () => undefined });
    primeClockGate(gateway.clock, clock);
    const fenced = new PostgresLedgerStore(runtimePool!, gateway.roomAppendFence);
    const app = createServer({ config, pool: runtimePool!, store: fenced, startedAt: Date.now(), gateway });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    try {
      await gateway.leadership.attemptAcquisition();
      assert.equal(gateway.leadership.canServe(), true, 'the node serves');
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const { roomId, commandId, planHash } = await roomUnderReview();
      const post = (token: string): Promise<Response> =>
        fetch(`${url}/control-plane/rooms/${roomId}/plan-decision`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            decision: 'plan.approved',
            planHash,
            attribution: { actualModel: 'n/a (human Founder decision)', executionSurface: 'claude-code' },
          }),
        });
      assert.equal((await post(CONTROL)).status, 401, 'no fallback to CONTROL_PLANE_TOKEN');
      assert.equal(await roomState(roomId), 'PLAN_REVIEW');
      const response = await post(ADJUDICATION);
      const answer = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 201, JSON.stringify(answer));
      assert.equal(answer['plannerCommandId'], commandId);
      assert.equal(answer['planHash'], planHash);
      assert.match(String((answer['journal'] as { seq: string }).seq), /^[1-9][0-9]*$/);
      assert.equal(await roomState(roomId), 'BUILDING');
      assert.deepEqual(await decisionsFor(commandId), ['plan.approved']);

      // An eventId that names another act in this room decided nothing: 409, never a replay that reads as success.
      const other = await roomUnderReview();
      const collided = await fetch(`${url}/control-plane/rooms/${other.roomId}/plan-decision`, {
        method: 'POST',
        headers: { authorization: `Bearer ${ADJUDICATION}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          decision: 'plan.approved',
          planHash: other.planHash,
          eventId: 'evt_t3',
          attribution: { actualModel: 'n/a (human Founder decision)', executionSurface: 'claude-code' },
        }),
      });
      assert.equal(collided.status, 409);
      assert.deepEqual(await collided.json(), { error: 'event_id_in_use' });
      assert.equal(await roomState(other.roomId), 'PLAN_REVIEW');
      assert.deepEqual(await decisionsFor(other.commandId), []);
    } finally {
      await gateway.stop();
      await closeServer(server);
    }
  });
});
