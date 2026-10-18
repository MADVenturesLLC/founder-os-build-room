/**
 * Planner-command recovery on PostgreSQL, over a genuine `br_app_runtime`
 * LOGIN, against the synthetic Planner (Phase 4 authorization §6): stop gate
 * items 9 and 10.
 *
 * FIXTURE: an exclusively owned disposable PostgreSQL instance with the full
 * canonical sequence; `TEST_DATABASE_URL` is only the run gate. Interruptions
 * are injected where they happen in production: a journal append that fails
 * mid-round, a Planner whose answer is lost, a crash before T3 commits. The
 * Planner keeps what it was given across them, as a real one outlives a
 * control-plane restart.
 *
 * What is proven: each open state is reconciled by command id and never by
 * re-dispatch (the Planner executes each command at most once); a command
 * that provably never left is failed; one the Planner accepted is recorded
 * dispatched with the reported route and finishes its round; an unresolved
 * command resolves only on a reconciled answer, and stays unresolved,
 * reported as ambiguous or as a mismatch, otherwise; a resolved completion
 * commits with T3 and the plan and passes the completion test; a chain that
 * does not verify stops recovery; a restart rebuilds the same rooms and
 * creates no command, approval or authority; and a second pass appends
 * nothing.
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
  JournalStoreUnavailableError,
  type AuthorizationCoverage,
} from '../packages/control-plane/src/journal-store.js';
import { decidePlan, type PlanDecisionDeps, type PlanDecisionRequest } from '../packages/control-plane/src/plan-decision.js';
import { prepareFounderGoal } from '../packages/control-plane/src/founder-goal.js';
import { PlannerLoop, plannerCommandIdFor, type PlannerLoopDeps } from '../packages/control-plane/src/planner-loop.js';
import { PlannerRecovery, PlannerRecoveryUnfencedError, type PlannerRecoveryDeps } from '../packages/control-plane/src/planner-recovery.js';
import type { CommandEventRow } from '../packages/journal/src/index.js';
import type { LifecycleEvent } from '../packages/ledger/src/index.js';

const { Client, Pool } = pgDefault;

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the planner-recovery suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

const DATABASE = 'br_planner_recovery';
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
let runtimePassword = '';

let completionCoverage: AuthorizationCoverage = 'covers';
const planner = new SyntheticPlanner();
const minted: string[] = [];

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
  actorId: 'session:test/planner-recovery',
  authorizationRef: 'HO-20261015-planner-test',
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
    ...overrides,
  };
}

function recoveryDeps(overrides: Partial<PlannerRecoveryDeps> = {}): PlannerRecoveryDeps {
  return { ledger: ledger!, journal: journal!, plans: plans!, planner, route, now, mintEventId, ...overrides };
}

/** The journal, with the first append of `eventType` failing as an unreachable store would. */
function journalFailingOn(eventType: string): PlannerLoopDeps['journal'] {
  let tripped = false;
  return {
    inTransaction: (client) => journal!.inTransaction(client),
    appendCommandEvent: async (event) => {
      if (!tripped && event.eventType === eventType) {
        tripped = true;
        throw new JournalStoreUnavailableError(new Error('simulated: the journal went away'));
      }
      return journal!.appendCommandEvent(event);
    },
  };
}

/** The ledger, with the T3 append crashing before anything of it commits. */
function ledgerCrashingAtT3(): PlannerLoopDeps['ledger'] {
  return {
    loadRoom: (roomId) => ledger!.loadRoom(roomId),
    isFenced: () => ledger!.isFenced(),
    underRoomLock: (roomId, body) => ledger!.underRoomLock(roomId, body),
    appendDerived: (roomId, spec) =>
      ledger!.appendDerived(roomId, {
        build: async (client, current) => {
          const event = await spec.build(client, current);
          if (event.event === 'plan.submitted') throw new Error('simulated: the process died before T3 committed');
          return event;
        },
        afterTransition: spec.afterTransition,
      }),
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
  runtimePassword = password;
  await admin.query(`ALTER ROLE br_app_runtime PASSWORD '${password.replace(/'/g, "''")}'`);
  runtimePool = new Pool({ host: '127.0.0.1', port: instance.port, user: 'br_app_runtime', password, database: DATABASE, max: 8 });
  ledger = new PostgresLedgerStore(runtimePool, fence(runtimePool));
  plans = new PlanStore(runtimePool);
  journal = new JournalStore(runtimePool, { now, resolveCompletionAuthorization: async () => completionCoverage });
  decisionDeps = { ledger, plans, journal, now };
});

after(async () => {
  await runtimePool?.end().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  destroyOwnedInstance(instance);
});

beforeEach(() => {
  completionCoverage = 'covers';
  planner.reset();
  minted.length = 0;
});

/* ---------------- fixtures ---------------- */

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
    occurredAt: '2026-10-15T11:00:00.000Z',
    facts: { repoInAllowlist: true, baseSha: SHA40, remoteHeadSha: SHA40 },
  } as unknown as LifecycleEvent));
  assert.equal(t1.ok && t1.outcome, 'transition', JSON.stringify(t1));
  return roomId;
}

/** Open round one with the given loop deps and planner behaviour; the round may throw (an interruption). */
async function interruptedRound(
  behaviour: Parameters<SyntheticPlanner['reset']>[0],
  overrides: Partial<PlannerLoopDeps> = {},
): Promise<{ roomId: string; commandId: string; threw: unknown }> {
  const roomId = await scopedRoom();
  minted.length = 0;
  planner.reset(behaviour);
  let threw: unknown = null;
  try {
    await new PlannerLoop(loopDeps(overrides)).runRound(roomId);
  } catch (error) {
    threw = error;
  }
  return { roomId, commandId: plannerCommandIdFor(roomId, minted[0]!), threw };
}

async function rowsOf(commandId: string): Promise<CommandEventRow[]> {
  const history = await journal!.commandHistory(commandId);
  return history.entries.flatMap((e) => (e.decoded.recordClass === 'command' ? [e.decoded.row] : []));
}

async function eventTypes(commandId: string): Promise<string[]> {
  return (await rowsOf(commandId)).map((row) => row.eventType);
}

async function stateOf(roomId: string): Promise<string> {
  return (await ledger!.loadRoom(roomId)).state.state;
}

async function journalLength(): Promise<number> {
  const { rows } = await admin!.query<{ n: string }>('SELECT count(*)::text AS n FROM command_journal_events');
  return Number(rows[0]!.n);
}

async function decisionsFor(commandId: string): Promise<string[]> {
  const { rows } = await admin!.query<{ event_type: string }>(
    `SELECT event_type FROM command_journal_events WHERE command_id = $1 AND record_class = 'decision' ORDER BY seq`,
    [commandId],
  );
  return rows.map((row) => row.event_type);
}

const attribution = { actualModel: 'n/a (human Founder decision)', executionSurface: 'claude-code' };
const approve = (planHash: string, eventId?: string): PlanDecisionRequest => ({
  decision: 'plan.approved',
  planHash,
  ...attribution,
  ...(eventId === undefined ? {} : { eventId }),
});
const cancel = (): PlanDecisionRequest => ({ decision: 'founder.cancel', ...attribution });
const recover = (overrides: Partial<PlannerRecoveryDeps> = {}) => new PlannerRecovery(recoveryDeps(overrides));

/* ---------------- cases ---------------- */

describe('planner recovery on PostgreSQL', { skip: SKIP_REASON }, () => {
  it('refuses an unfenced ledger store, and does nothing when the chain does not verify', async () => {
    assert.throws(() => recover({ ledger: new PostgresLedgerStore(runtimePool!) }), PlannerRecoveryUnfencedError);
    const { roomId, commandId } = await interruptedRound({}, { journal: journalFailingOn('identity_bound') });
    const before = await journalLength();
    const refused = await recover({
      journal: {
        verify: async () => ({ ok: false, reason: 'simulated finding', atSeq: '1' }),
        commandHistory: (id) => journal!.commandHistory(id),
        inTransaction: (client) => journal!.inTransaction(client),
        appendCommandEvent: (event) => journal!.appendCommandEvent(event),
      },
    }).recoverRoom(roomId);
    assert.deepEqual(refused.kind, 'refused');
    assert.equal(await journalLength(), before);
    assert.deepEqual(await eventTypes(commandId), ['journaled']);
    assert.equal(planner.calls.reconciled.length, 0, 'the Planner is not even asked');
  });

  it('journaled, never dispatched (the journal failed mid-round): the Planner never received it, so it is a pre-send failed', async () => {
    const { roomId, commandId, threw } = await interruptedRound({}, { journal: journalFailingOn('identity_bound') });
    assert.ok(threw instanceof JournalStoreUnavailableError);
    assert.deepEqual(await eventTypes(commandId), ['journaled']);
    assert.equal(planner.calls.dispatched.length, 0);
    const outcome = await recover().recoverRoom(roomId);
    assert.deepEqual(outcome, { kind: 'failed', commandId, classification: 'not_sent' });
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'failed']);
    assert.equal(planner.calls.dispatched.length, 0, 'recovery dispatches nothing');
    assert.deepEqual((await recover().recoverRoom(roomId)).kind, 'nothing_open');
  });

  it('accepted but never recorded as dispatched: dispatched from the Planner’s answer, then the round finishes — one execution', async () => {
    const { roomId, commandId, threw } = await interruptedRound({}, { journal: journalFailingOn('dispatched') });
    assert.ok(threw instanceof JournalStoreUnavailableError);
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound']);
    const outcome = await recover().recoverRoom(roomId);
    assert.equal(outcome.kind, 'plan_review', JSON.stringify(outcome));
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched', 'completed']);
    const dispatched = (await rowsOf(commandId))[2]!;
    assert.deepEqual([dispatched.provider, dispatched.model, dispatched.executionSurface], [SYNTHETIC_ROUTE.provider, SYNTHETIC_ROUTE.model, SYNTHETIC_ROUTE.executionSurface]);
    assert.deepEqual(dispatched.evidenceRefs, ['planner-reconciliation']);
    assert.equal(planner.calls.dispatched.filter((w) => w.commandId === commandId).length, 1, 'the Planner was given the work once');
    assert.equal(await stateOf(roomId), 'PLAN_REVIEW');
    assert.ok(outcome.kind === 'plan_review');
    const approved = await decidePlan(decisionDeps!, roomId, approve(outcome.planHash));
    assert.equal(approved.appended.result.ok && approved.appended.result.outcome, 'transition');
  });

  it('accepted and still running: dispatched and pending; a later pass finishes the round', async () => {
    const { roomId, commandId } = await interruptedRound({}, { journal: journalFailingOn('dispatched') });
    planner.reset({ result: 'running' });
    const first = await recover().recoverRoom(roomId);
    assert.equal(first.kind, 'pending');
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched']);
    const again = await recover().recoverRoom(roomId);
    assert.equal(again.kind, 'pending');
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched'], 'a pending pass appends nothing');
    planner.reset();
    const done = await recover().recoverRoom(roomId);
    assert.equal(done.kind, 'plan_review');
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched', 'completed']);
  });

  it('the plan came back but T3 never committed: the round finishes from the Planner’s answer', async () => {
    const { roomId, commandId, threw } = await interruptedRound({}, { ledger: ledgerCrashingAtT3() });
    assert.match(String(threw), /before T3 committed/);
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched']);
    assert.equal(await stateOf(roomId), 'PLANNING');
    const outcome = await recover().recoverRoom(roomId);
    assert.equal(outcome.kind, 'plan_review');
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched', 'completed']);
  });

  it('unresolved after dispatched (the wait was lost): a reconciled plan resolves completed with T3, and the Founder decides it', async () => {
    const { roomId, commandId } = await interruptedRound({ result: 'throw' });
    assert.deepEqual(await eventTypes(commandId), ['journaled', 'identity_bound', 'dispatched', 'unresolved']);
    const outcome = await recover().recoverRoom(roomId);
    assert.equal(outcome.kind, 'plan_review', JSON.stringify(outcome));
    const rows = await rowsOf(commandId);
    assert.deepEqual(rows.map((r) => r.eventType), ['journaled', 'identity_bound', 'dispatched', 'unresolved', 'resolved']);
    const resolved = rows[4]!;
    assert.equal(resolved.resolutionDetermination, 'completed');
    assert.equal(resolved.resolutionSemantics, 'reconciled');
    assert.ok(outcome.kind === 'plan_review');
    assert.deepEqual(resolved.lifecycleEventRef, { roomId, eventId: outcome.eventId });
    const state = await journal!.commandHistory(commandId);
    assert.equal(state.state?.outcome, 'completed');
    const approved = await decidePlan(decisionDeps!, roomId, approve(outcome.planHash));
    assert.equal(approved.appended.result.ok && approved.appended.result.outcome, 'transition');
    assert.deepEqual(await decisionsFor(commandId), ['plan.approved']);
  });

  it('a resolved completion still needs the completion test: indeterminate stays unresolved with no T3; does_not_cover resolves failed', async () => {
    const pending = await interruptedRound({ result: 'throw' });
    completionCoverage = 'indeterminate';
    const stuck = await recover().recoverRoom(pending.roomId);
    assert.deepEqual(stuck.kind === 'unresolved' && [stuck.reading, stuck.appended], ['ambiguous', false]);
    assert.deepEqual(await eventTypes(pending.commandId), ['journaled', 'identity_bound', 'dispatched', 'unresolved']);
    assert.equal(await stateOf(pending.roomId), 'PLANNING');
    completionCoverage = 'covers';
    assert.equal((await recover().recoverRoom(pending.roomId)).kind, 'plan_review', 'resolves once coverage is determinable');

    const uncovered = await interruptedRound({ result: 'throw' });
    completionCoverage = 'does_not_cover';
    const failed = await recover().recoverRoom(uncovered.roomId);
    assert.equal(failed.kind, 'resolved_failed');
    const rows = await rowsOf(uncovered.commandId);
    assert.deepEqual([rows[4]!.resolutionDetermination, rows[4]!.resolutionSemantics], ['failed', 'reconciled']);
    assert.equal(await stateOf(uncovered.roomId), 'PLANNING');
    const cancelled = await decidePlan(decisionDeps!, uncovered.roomId, cancel());
    assert.equal(cancelled.appended.result.ok && cancelled.appended.result.outcome, 'transition', 'terminal now, so the Founder can cancel');
  });

  it('unresolved before dispatched: never received resolves failed; accepted-and-finished stays unresolved (ambiguous)', async () => {
    const lost = await interruptedRound({ dispatch: 'throw' });
    assert.deepEqual(await eventTypes(lost.commandId), ['journaled', 'identity_bound', 'unresolved']);
    assert.equal((await recover().recoverRoom(lost.roomId)).kind, 'resolved_failed');
    assert.deepEqual(await eventTypes(lost.commandId), ['journaled', 'identity_bound', 'unresolved', 'resolved']);

    const arrived = await interruptedRound({ dispatch: 'lost_response' });
    assert.deepEqual(await eventTypes(arrived.commandId), ['journaled', 'identity_bound', 'unresolved']);
    const outcome = await recover().recoverRoom(arrived.roomId);
    assert.deepEqual(outcome.kind === 'unresolved' && [outcome.reading, outcome.appended], ['ambiguous', false]);
    assert.match(outcome.kind === 'unresolved' ? outcome.reason : '', /dispatch the journal never recorded/);
    assert.deepEqual(await eventTypes(arrived.commandId), ['journaled', 'identity_bound', 'unresolved']);
    // Q6: the Founder can still cancel it; the cancel is unconfirmed and the command stays unresolved.
    const cancelled = await decidePlan(decisionDeps!, arrived.roomId, cancel());
    assert.equal(cancelled.appended.result.ok && cancelled.appended.result.outcome, 'transition');
    assert.deepEqual(await eventTypes(arrived.commandId), ['journaled', 'identity_bound', 'unresolved']);
    const afterCancel = await recover().recoverRoom(arrived.roomId);
    assert.deepEqual(afterCancel.kind === 'unresolved' && afterCancel.reading, 'ambiguous', 'recovery reports it; nothing resolves it');
  });

  it('mismatches are reported, never resolved: another execution, or "never received" for a dispatched command', async () => {
    const wrong = await interruptedRound({ result: 'throw' });
    planner.reset({ reconcile: 'wrong_execution' });
    const w = await recover().recoverRoom(wrong.roomId);
    assert.deepEqual(w.kind === 'unresolved' && [w.reading, w.appended], ['mismatch', false]);
    assert.deepEqual(await eventTypes(wrong.commandId), ['journaled', 'identity_bound', 'dispatched', 'unresolved']);

    const pending = await interruptedRound({}, { ledger: ledgerCrashingAtT3() });
    planner.reset({ reconcile: 'never_received' });
    const n = await recover().recoverRoom(pending.roomId);
    assert.deepEqual(n.kind === 'unresolved' && [n.reading, n.appended], ['mismatch', true]);
    assert.deepEqual(await eventTypes(pending.commandId), ['journaled', 'identity_bound', 'dispatched', 'unresolved']);
    planner.reset({ reconcile: 'never_received' });
    const still = await recover().recoverRoom(pending.roomId);
    assert.deepEqual(still.kind === 'unresolved' && [still.reading, still.appended], ['mismatch', false]);
  });

  it('no answer from the Planner: unresolved before dispatch, nothing written once dispatched', async () => {
    const early = await interruptedRound({}, { journal: journalFailingOn('identity_bound') });
    planner.reset({ reconcile: 'throw' });
    const e = await recover().recoverRoom(early.roomId);
    assert.deepEqual(e.kind === 'unresolved' && [e.reading, e.appended], ['ambiguous', true]);
    assert.deepEqual(await eventTypes(early.commandId), ['journaled', 'unresolved']);

    const late = await interruptedRound({}, { ledger: ledgerCrashingAtT3() });
    planner.reset({ reconcile: 'throw' });
    assert.equal((await recover().recoverRoom(late.roomId)).kind, 'pending');
    assert.deepEqual(await eventTypes(late.commandId), ['journaled', 'identity_bound', 'dispatched']);
  });

  it('restart: fresh stores rebuild the same rooms, and nothing creates a second command, approval or authority', async () => {
    const roomId = await scopedRoom();
    minted.length = 0;
    const first = await new PlannerLoop(loopDeps()).runRound(roomId);
    assert.ok(first.kind === 'plan_review');
    const approvalId = `evt_${randomUUID()}`;
    const approved = await decidePlan(decisionDeps!, roomId, approve(first.planHash, approvalId));
    assert.equal(approved.appended.result.ok && approved.appended.result.outcome, 'transition');
    const before = { length: await journalLength(), state: await ledger!.loadRoom(roomId) };

    // A new process: new pool, new stores, new loop and recovery.
    const restartedPool = new Pool({ host: '127.0.0.1', port: instance!.port, user: 'br_app_runtime', password: runtimePassword, database: DATABASE, max: 4 });
    try {
      const ledger2 = new PostgresLedgerStore(restartedPool, fence(restartedPool));
      const journal2 = new JournalStore(restartedPool, { now, resolveCompletionAuthorization: async () => 'covers' });
      const plans2 = new PlanStore(restartedPool);
      const view = await ledger2.loadRoom(roomId);
      assert.deepEqual(view.state, before.state.state, 'the replayed state is the same state');
      assert.equal((await journal2.verify()).ok, true);

      const again = await new PlannerLoop(loopDeps({ ledger: ledger2, journal: journal2, plans: plans2 })).runRound(roomId);
      assert.deepEqual(again.kind === 'refused' && again.code, 'not_plannable');
      const recovered = await new PlannerRecovery(recoveryDeps({ ledger: ledger2, journal: journal2, plans: plans2 })).recoverRoom(roomId);
      assert.equal(recovered.kind, 'nothing_open');
      const replay = await decidePlan({ ledger: ledger2, plans: plans2, journal: journal2, now }, roomId, approve(first.planHash, approvalId));
      assert.equal(replay.appended.result.ok && replay.appended.result.outcome, 'replay');
      assert.deepEqual(await decisionsFor(first.commandId), ['plan.approved'], 'one approval');
      assert.equal(await journalLength(), before.length, 'nothing appended by the restart');
      assert.equal(planner.calls.dispatched.filter((w) => w.commandId === first.commandId).length, 1);
    } finally {
      await restartedPool.end();
    }
  });

  it('a second pass over every recovered room appends nothing, and the journal verifies from genesis', async () => {
    const { rows } = await admin!.query<{ room_id: string }>('SELECT room_id::text FROM build_room_rooms');
    planner.reset();
    for (const { room_id } of rows) await recover().recoverRoom(room_id);
    const length = await journalLength();
    for (const { room_id } of rows) await recover().recoverRoom(room_id);
    assert.equal(await journalLength(), length);
    const verdict = await journal!.verify();
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
  });
});
