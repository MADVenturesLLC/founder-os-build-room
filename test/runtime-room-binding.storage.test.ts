/**
 * The room binding (Phase 5 build step 1) over the real stores:
 * `packages/control-plane/src/runtime-room-binding.ts` driving the real
 * `PostgresLedgerStore` and `JournalStore` on a genuine `br_app_runtime`
 * LOGIN, as production connects.
 *
 * Governing text: docs/command-journal-contract.md §2, "Binding-class
 * records" (B3, B5, B6, B7), and FOUNDER-RULING-20261027-LIFECYCLE-ROOM-
 * BINDING B3 to B5 and C1.
 *
 * FIXTURE: an exclusively owned disposable PostgreSQL instance
 * (`test/support/owned-postgres.ts`). One template database is migrated
 * through the full canonical sequence (0011 included) by the superuser,
 * and the suite's databases are clones of it: the main one, and two
 * throwaway ones whose journal is deliberately left with a binding defect
 * so the main one's `verify()` stays green. `TEST_DATABASE_URL` is only the
 * storage-suite run gate. Rooms reach BUILDING through the store's own
 * append path (T1, T2, T3, T5), the T5 entry carrying the PlanDoc digest as
 * `{ kind: 'plandoc' }` evidence, as the plan decision writes it.
 *
 * What is proven, in order:
 *
 *  - the happy path: the `runtime_room.bound` lifecycle row (outcome
 *    `recorded`, no transition, BUILDING to BUILDING, the three ids in its
 *    payload), the first Builder command's `journaled` row at seq k naming
 *    that entry, and the binding record at k+1 bound to the command in its
 *    stored `command_id`, all in one transaction, with the B5 checks made
 *    while the room row is locked; a failure in the third write rolls back
 *    the first two;
 *  - every refusal writes nothing at all (no lifecycle row, no journal row,
 *    no rejection row): not BUILDING, already bound, Gateway not live,
 *    runtime room not minted by that Gateway for that room, no T5 plan, a
 *    command that is not `builder.invoke`, a command id outside `cmd_`, and
 *    a binding the reducer refuses;
 *  - the database backstop (journal ruling B5): a second room binding a
 *    runtime room already bound is refused by migration 0011's unique index
 *    as `binding_conflict`, with nothing of the attempt written;
 *  - B6: a later Builder command names the binding's entry, and a room with
 *    no binding journals none;
 *  - B6 and B3 in `verify()`: a Builder command journaled through the plain
 *    journal path, outside the binding, is a binding defect of the chain;
 *  - replay (B7): a fresh process reproduces the binding from the log, and
 *    the binding event's id is never appended twice;
 *  - with the leader fence: the binding through the real
 *    `GatewayRoomAppendFence`, whose `deriveGatewayEnrolledAndLive` reads an
 *    enrolled Gateway's row and its accepted heartbeat, and the real room
 *    channel, whose minted rooms a Gateway's session-start forgets; and, under a fence whose occupancy derivation the suite
 *    controls, the G17 limb is derived for T17's trigger alone, a caller's
 *    `boundRuntimeRoomClosed` is never persisted on any other event, and
 *    T17 is decided by the derived value and the ledger's binding, never by
 *    the caller's claim.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pgDefault from 'pg';
import type { Pool as PgPool, PoolClient } from 'pg';
import {
  destroyOwnedInstance,
  resolveServerBinaries,
  startOwnedInstance,
  type OwnedInstance,
} from './support/owned-postgres.js';
import { loadConfig, type Config } from '../packages/control-plane/src/config.js';
import { createPool } from '../packages/control-plane/src/db.js';
import { JournalStore } from '../packages/control-plane/src/journal-store.js';
import {
  PostgresLedgerStore,
  RecordedEventRefusedError,
  RoomNotFoundError,
  type RoomAppendFence,
  type RoomAppendOutcome,
} from '../packages/control-plane/src/store.js';
import {
  bindFirstBuilderCommand,
  journalLaterBuilderCommand,
  type BindingOutcome,
  type BindingRefusalCode,
  type BuilderCommandRequest,
  type LaterCommandOutcome,
  type RuntimeRoomBindingDeps,
} from '../packages/control-plane/src/runtime-room-binding.js';
import { BUILDER_COMMAND_KIND } from '../packages/journal/src/index.js';
import type { EventName, EvidenceRef } from '../packages/contracts/src/index.js';
import { applyAll, initialLedger, type LedgerState, type LifecycleEvent } from '../packages/ledger/src/index.js';
import { EVIDENCE, PERMISSIVE_FACTS, makeEvent } from './helpers.js';
import type { GatewayHarness } from './gateway-storage-helpers.js';
import {
  TEST_IP,
  enrollGateway,
  makeSessionNode,
  openSession,
  promoteNode,
  signedBeat,
} from './gateway-session-helpers.js';
import { settleAllNodes } from './gateway-leadership-helpers.js';

const { Pool } = pgDefault;

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the runtime-room-binding suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

const TEMPLATE = 'br_rrb_template';
const MAIN = 'br_rrb_main';
const DEFECT_NO_ROOM = 'br_rrb_defect_no_room';
const DEFECT_UNBOUND_ROOM = 'br_rrb_defect_unbound_room';
const RUNTIME_LOGIN = 'br_app_runtime';

let instance: OwnedInstance | undefined;
let admin: PgPool | undefined;
let appConfig: Config | undefined;
let appPool: PgPool | undefined;
let ledger: PostgresLedgerStore | undefined;
let journal: JournalStore | undefined;
const extraPools: PgPool[] = [];

function configFor(database: string, user: string): Config {
  return loadConfig({
    DATABASE_URL: `postgresql://${user}@127.0.0.1:${instance!.port}/${database}`,
    CONTROL_PLANE_TOKEN: 'runtime-room-binding-suite-token-long-enough',
    STATEMENT_TIMEOUT_MS: '60000',
    PG_POOL_MAX: '12',
  });
}

/** An application pool on `database`, checked to have authenticated as the runtime login. */
async function runtimePool(database: string): Promise<PgPool> {
  const pool = createPool(configFor(database, RUNTIME_LOGIN));
  const { rows } = await pool.query<{ session_user: string; current_user: string }>(
    'SELECT session_user::text AS session_user, current_user::text AS current_user',
  );
  assert.deepEqual(rows[0], { session_user: RUNTIME_LOGIN, current_user: RUNTIME_LOGIN });
  return pool;
}

before(async () => {
  if (SKIP_REASON !== false) return;
  instance = await startOwnedInstance(BINS!);
  const boot = new Pool({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: 'postgres', max: 1 });
  try {
    await boot.query(`CREATE DATABASE ${TEMPLATE}`);
    const migrator = new Pool({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: TEMPLATE, max: 1 });
    try {
      const { migrate } = await import('../packages/control-plane/src/migrations.js');
      const result = await migrate(migrator);
      assert.equal(result.applied.at(-1), '0011_phase5_binding');
    } finally {
      await migrator.end();
    }
    for (const database of [MAIN, DEFECT_NO_ROOM, DEFECT_UNBOUND_ROOM]) {
      await boot.query(`CREATE DATABASE ${database} TEMPLATE ${TEMPLATE}`);
    }
  } finally {
    await boot.end();
  }
  admin = new Pool({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: MAIN, max: 4 });
  appConfig = configFor(MAIN, RUNTIME_LOGIN);
  appPool = await runtimePool(MAIN);
  ledger = new PostgresLedgerStore(appPool);
  journal = new JournalStore(appPool);
});

after(async () => {
  await settleAllNodes();
  for (const pool of extraPools) await pool.end().catch(() => undefined);
  await appPool?.end().catch(() => undefined);
  await admin?.end().catch(() => undefined);
  destroyOwnedInstance(instance);
});

/* ---------------- fixtures ---------------- */

const REPO = 'example-org/example-repo';
const DISPATCHER = {
  roleId: 'builder',
  actorId: 'control-plane:test/runtime-room-binding',
  actualModel: 'n/a (control-plane act)',
  executionSurface: 'claude-code',
} as const;
const NOW = new Date('2026-11-18T09:00:00.000Z');

const TO_PLAN_REVIEW: readonly EventName[] = ['scope.captured', 'task.dispatched.planner', 'plan.submitted'];
const TO_BUILDING: readonly EventName[] = [...TO_PLAN_REVIEW, 'plan.approved'];
const BUILDING_TO_MERGE_CONFIRMED: readonly EventName[] = [
  'build.ready_for_evidence',
  'git.pushed',
  'pr.draft_created',
  'review.opened',
  'review.passed',
  'checks.verified',
  'readiness.presented',
  'founder.authorization.granted',
  'merge.confirmed',
];

const hex64 = (): string => randomBytes(32).toString('hex');
const newRuntimeRoomId = (): string => `room-${randomUUID()}`;
const newCommandId = (): string => `cmd_${randomBytes(12).toString('hex')}`;
const newBindingEventId = (): string => `evt-bind-${randomUUID()}`;

/** The T5 evidence the plan decision writes: the PlanDoc digest. */
function plandoc(planHash: string): readonly EvidenceRef[] {
  return [{ kind: 'plandoc', ref: 'cmd_plan_fixture', digest: planHash }];
}

/** Append `names` in order; every one must be accepted. `t5Evidence` replaces T5's evidence. */
async function drive(
  store: PostgresLedgerStore,
  roomId: string,
  names: readonly EventName[],
  t5Evidence: readonly EvidenceRef[] = EVIDENCE,
): Promise<void> {
  for (const name of names) {
    const result = await store.append(roomId, makeEvent(name, name === 'plan.approved' ? { evidence: t5Evidence } : {}));
    assert.ok(
      result.ok && (result.outcome === 'transition' || result.outcome === 'conjunction_pending'),
      `${name} was not accepted: ${JSON.stringify(result)}`,
    );
  }
}

/** A room in BUILDING whose T5 entry carries a PlanDoc digest. */
async function buildingRoom(store: PostgresLedgerStore = ledger!): Promise<{ roomId: string; planHash: string }> {
  const roomId = randomUUID();
  const planHash = hex64();
  await store.createRoom(roomId);
  await drive(store, roomId, TO_BUILDING, plandoc(planHash));
  return { roomId, planHash };
}

function builderCommand(overrides: Partial<BuilderCommandRequest> = {}): BuilderCommandRequest {
  return {
    commandKind: BUILDER_COMMAND_KIND,
    argv: ['--plan', 'approved'],
    actorId: 'session:test/runtime-room-binding',
    roleId: 'builder',
    authorizationRef: 'HO-20261118-runtime-room-binding-test',
    repository: REPO,
    scopeRef: 'scope/runtime-room-binding',
    intendedProvider: 'example-provider',
    intendedModel: 'example-model',
    intendedSurface: 'example-builder-surface',
    commandId: newCommandId(),
    ...overrides,
  };
}

/**
 * What the two leader-local facts report: which Gateways are enrolled and
 * live, and which runtime rooms each reported minted for which lifecycle
 * room. `lockProbes` records, for each Gateway check, whether another
 * connection found the room row locked at that moment.
 */
interface World {
  readonly live: Set<string>;
  readonly minted: Map<string, string[]>;
  readonly gatewayChecks: string[];
  readonly lockProbes: boolean[];
  probeRoomLock: string | null;
}

function newWorld(): World {
  return { live: new Set(), minted: new Map(), gatewayChecks: [], lockProbes: [], probeRoomLock: null };
}

function reportMinted(world: World, gatewayId: string, lifecycleRoomId: string, runtimeRoomId: string): void {
  const key = `${gatewayId} ${lifecycleRoomId}`;
  world.minted.set(key, [...(world.minted.get(key) ?? []), runtimeRoomId]);
}

/** Whether another connection is refused the room row's lock right now (55P03), i.e. someone holds it. */
async function roomRowLocked(roomId: string): Promise<boolean> {
  try {
    await admin!.query('SELECT room_id FROM build_room_rooms WHERE room_id = $1 FOR UPDATE NOWAIT', [roomId]);
    return false;
  } catch (error) {
    if ((error as { code?: string }).code === '55P03') return true;
    throw error;
  }
}

function deps(world: World, overrides: Partial<RuntimeRoomBindingDeps> = {}): RuntimeRoomBindingDeps {
  return {
    ledger: ledger!,
    journal: journal!,
    gateways: {
      deriveGatewayEnrolledAndLive: async (_client: PoolClient, gatewayId: string) => {
        world.gatewayChecks.push(gatewayId);
        if (world.probeRoomLock !== null) world.lockProbes.push(await roomRowLocked(world.probeRoomLock));
        return world.live.has(gatewayId);
      },
    },
    rooms: { mintedFor: (gatewayId, lifecycleRoomId) => world.minted.get(`${gatewayId} ${lifecycleRoomId}`) ?? [] },
    dispatcher: { ...DISPATCHER },
    mintEventId: newBindingEventId,
    now: () => NOW,
    ...overrides,
  };
}

/** A room ready to bind: BUILDING with a T5 plan, a live Gateway, and a runtime room it reported minted for the room. */
async function readyToBind(store: PostgresLedgerStore = ledger!): Promise<{
  world: World;
  roomId: string;
  planHash: string;
  gatewayId: string;
  runtimeRoomId: string;
}> {
  const world = newWorld();
  const { roomId, planHash } = await buildingRoom(store);
  const gatewayId = randomUUID();
  const runtimeRoomId = newRuntimeRoomId();
  world.live.add(gatewayId);
  reportMinted(world, gatewayId, roomId, runtimeRoomId);
  return { world, roomId, planHash, gatewayId, runtimeRoomId };
}

function boundOutcome(outcome: BindingOutcome): Extract<BindingOutcome, { kind: 'bound' }> {
  assert.equal(outcome.kind, 'bound', JSON.stringify(outcome));
  if (outcome.kind !== 'bound') throw new Error('unreachable');
  return outcome;
}

function refusedWith(outcome: BindingOutcome | LaterCommandOutcome, code: BindingRefusalCode): string {
  assert.equal(outcome.kind, 'refused', JSON.stringify(outcome));
  if (outcome.kind !== 'refused') throw new Error('unreachable');
  assert.equal(outcome.code, code, outcome.reason);
  return outcome.reason;
}

/** Everything a binding attempt could write: the room's rows, the room's rejections, and the whole journal. */
interface Footprint {
  readonly lifecycleRows: number;
  readonly bindingRows: number;
  readonly rejections: number;
  readonly journalRows: number;
  readonly journalHead: string;
}

async function footprint(roomId: string): Promise<Footprint> {
  const { rows } = await admin!.query<Footprint>(
    `SELECT (SELECT count(*)::int FROM build_room_events WHERE room_id = $1) AS "lifecycleRows",
            (SELECT count(*)::int FROM build_room_events WHERE room_id = $1 AND event = 'runtime_room.bound') AS "bindingRows",
            (SELECT count(*)::int FROM build_room_rejections WHERE room_id = $1) AS "rejections",
            (SELECT count(*)::int FROM command_journal_events) AS "journalRows",
            (SELECT seq::text FROM command_journal_chain_head WHERE head_id = 1) AS "journalHead"`,
    [roomId],
  );
  return rows[0]!;
}

async function journalRowsFor(commandId: string): Promise<number> {
  const { rows } = await admin!.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM command_journal_events WHERE command_id = $1',
    [commandId],
  );
  return rows[0]?.n ?? 0;
}

async function assertVerified(store: JournalStore = journal!): Promise<void> {
  const verdict = await store.verify();
  assert.ok(verdict.ok, `verify() failed: ${JSON.stringify(verdict)}`);
}

/* ---------------- the suite ---------------- */

describe('room binding — the three writes commit together (journal ruling B3)', { skip: SKIP_REASON }, () => {
  it('records the bound entry, journals the first Builder command at k and the binding at k+1, and verify() holds', async () => {
    const { world, roomId, planHash, gatewayId, runtimeRoomId } = await readyToBind();
    world.probeRoomLock = roomId;
    const command = builderCommand();
    const before = await footprint(roomId);

    const outcome = boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command }));

    // The B5 checks ran while the room row was locked by the binding's own transaction.
    assert.deepEqual(world.gatewayChecks, [gatewayId]);
    assert.deepEqual(world.lockProbes, [true]);
    assert.equal(await roomRowLocked(roomId), false, 'the lock is released with the commit');

    // 1. The lifecycle entry: recorded, no transition, BUILDING to BUILDING, the three ids.
    assert.equal(outcome.lifecycleSeq, TO_BUILDING.length + 1);
    const lifecycle = await admin!.query<{
      seq: string;
      event: string;
      outcome: string;
      entry_seq: number | null;
      transition_id: string | null;
      guard_id: string | null;
      from_state: string;
      resulting_state: string;
      payload: LifecycleEvent;
    }>(
      `SELECT seq::text AS seq, event, outcome, entry_seq, transition_id, guard_id, from_state, resulting_state, payload
         FROM build_room_events WHERE room_id = $1 AND event_id = $2`,
      [roomId, outcome.eventId],
    );
    assert.equal(lifecycle.rows.length, 1);
    const row = lifecycle.rows[0]!;
    assert.equal(row.seq, String(outcome.lifecycleSeq));
    assert.equal(row.event, 'runtime_room.bound');
    assert.equal(row.outcome, 'recorded');
    assert.equal(row.entry_seq, null);
    assert.equal(row.transition_id, null);
    assert.equal(row.guard_id, null);
    assert.equal(row.from_state, 'BUILDING');
    assert.equal(row.resulting_state, 'BUILDING');
    assert.deepEqual(row.payload.binding, { lifecycleRoomId: roomId, runtimeRoomId, gatewayId });
    assert.equal(row.payload.actor, 'system');
    assert.deepEqual(row.payload.attribution, DISPATCHER);
    assert.equal(row.payload.occurredAt, NOW.toISOString());
    assert.deepEqual(row.payload.scope, { roomId, repo: REPO, paths: [] });

    // 2 and 3. The journaled row at k, the binding record at k+1, both under the command's id.
    const k = BigInt(outcome.journaled.seq);
    assert.equal(k, BigInt(before.journalHead) + 1n);
    assert.equal(BigInt(outcome.binding.seq), k + 1n);
    assert.equal(outcome.journaled.commandId, command.commandId);
    assert.equal(outcome.binding.commandId, command.commandId);
    assert.equal(outcome.binding.recordClass, 'binding');
    assert.equal(outcome.binding.eventType, 'runtime_room.bound');
    const stored = await admin!.query<{ seq: string; record_class: string; command_id: string; event_type: string }>(
      `SELECT seq::text AS seq, record_class, command_id, event_type FROM command_journal_events
        WHERE seq IN ($1::bigint, $2::bigint) ORDER BY seq`,
      [String(k), String(k + 1n)],
    );
    assert.deepEqual(stored.rows, [
      { seq: String(k), record_class: 'command', command_id: command.commandId, event_type: 'journaled' },
      { seq: String(k + 1n), record_class: 'binding', command_id: command.commandId, event_type: 'runtime_room.bound' },
    ]);

    const history = await journal!.commandHistory(command.commandId);
    assert.equal(history.entries.length, 2);
    const [journaled, binding] = history.entries.map((entry) => entry.decoded);
    assert.ok(journaled?.recordClass === 'command');
    assert.equal(journaled.row.eventType, 'journaled');
    assert.equal(journaled.row.commandEnvelope?.commandKind, BUILDER_COMMAND_KIND);
    assert.equal(journaled.row.roomId, roomId);
    assert.deepEqual(journaled.row.lifecycleEventRef, { roomId, eventId: outcome.eventId });
    assert.ok(binding?.recordClass === 'binding');
    assert.deepEqual(
      {
        event: binding.row.event,
        actorId: binding.row.actorId,
        lifecycleRoomId: binding.row.lifecycleRoomId,
        runtimeRoomId: binding.row.runtimeRoomId,
        gatewayId: binding.row.gatewayId,
        recordedState: binding.row.recordedState,
        planHash: binding.row.planHash,
        lifecycleEventRef: binding.row.lifecycleEventRef,
      },
      {
        event: 'runtime_room.bound',
        actorId: 'system',
        lifecycleRoomId: roomId,
        runtimeRoomId,
        gatewayId,
        recordedState: 'BUILDING',
        planHash,
        lifecycleEventRef: { roomId, eventId: outcome.eventId },
      },
    );

    // The ledger state carries the binding; no rejection was written; the chain verifies.
    const view = await ledger!.loadRoom(roomId);
    assert.equal(view.state.state, 'BUILDING');
    assert.deepEqual(view.state.binding, { lifecycleRoomId: roomId, runtimeRoomId, gatewayId, eventId: outcome.eventId });
    assert.deepEqual(await footprint(roomId), {
      ...before,
      lifecycleRows: before.lifecycleRows + 1,
      bindingRows: 1,
      journalRows: before.journalRows + 2,
      journalHead: String(k + 1n),
    });
    await assertVerified();
  });

  it('a failure in the third write rolls the lifecycle entry and the journaled row back with it', async () => {
    // The real journal, except that the binding record's append throws after
    // the lifecycle row and the journaled row are written in the transaction.
    const { world, roomId, gatewayId } = await readyToBind();
    const runtimeRoomId = newRuntimeRoomId();
    reportMinted(world, gatewayId, roomId, runtimeRoomId);
    const command = builderCommand();
    const before = await footprint(roomId);
    const failingJournal = {
      inTransaction: (client: PoolClient) => ({
        ...journal!.inTransaction(client),
        appendBinding: async () => {
          throw new Error('the third write failed');
        },
      }),
    };

    await assert.rejects(
      bindFirstBuilderCommand(deps(world, { journal: failingJournal }), { roomId, gatewayId, runtimeRoomId, command }),
      /the third write failed/,
    );
    assert.deepEqual(await footprint(roomId), before);
    assert.equal(await journalRowsFor(command.commandId), 0);
    assert.equal((await ledger!.loadRoom(roomId)).state.binding, null);
    await assertVerified();
  });
});

describe('room binding — every refusal writes nothing (lifecycle ruling B4, B5)', { skip: SKIP_REASON }, () => {
  async function refusedAndUnwritten(
    roomId: string,
    attempt: () => Promise<BindingOutcome | LaterCommandOutcome>,
    code: BindingRefusalCode,
    commandId: string,
  ): Promise<string> {
    const before = await footprint(roomId);
    const reason = refusedWith(await attempt(), code);
    assert.deepEqual(await footprint(roomId), before, `${code}: something was written`);
    assert.equal(await journalRowsFor(commandId), 0, `${code}: the command was journaled`);
    return reason;
  }

  it('refuses a room that is not in BUILDING', async () => {
    const world = newWorld();
    const roomId = randomUUID();
    await ledger!.createRoom(roomId);
    await drive(ledger!, roomId, TO_PLAN_REVIEW);
    const gatewayId = randomUUID();
    const runtimeRoomId = newRuntimeRoomId();
    world.live.add(gatewayId);
    reportMinted(world, gatewayId, roomId, runtimeRoomId);
    const command = builderCommand();
    const reason = await refusedAndUnwritten(
      roomId,
      () => bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command }),
      'not_building',
      command.commandId,
    );
    assert.match(reason, /PLAN_REVIEW/);
    assert.deepEqual(world.gatewayChecks, [], 'the Gateway is not consulted for a room that cannot bind');
  });

  it('refuses a second binding of the same room, by the same command or a fresh one, to the same runtime room or another', async () => {
    const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind();
    const first = builderCommand();
    boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command: first }));
    const firstRows = await journalRowsFor(first.commandId);

    const again = (command: BuilderCommandRequest, target: string) => () =>
      bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId: target, command });

    const fresh = builderCommand();
    await refusedAndUnwritten(roomId, again(fresh, runtimeRoomId), 'already_bound', fresh.commandId);
    const other = newRuntimeRoomId();
    reportMinted(world, gatewayId, roomId, other);
    const fresher = builderCommand();
    await refusedAndUnwritten(roomId, again(fresher, other), 'already_bound', fresher.commandId);
    // The first command again: refused, and its own two rows are unchanged.
    const before = await footprint(roomId);
    refusedWith(await again(first, runtimeRoomId)(), 'already_bound');
    assert.deepEqual(await footprint(roomId), before);
    assert.equal(await journalRowsFor(first.commandId), firstRows);
    await assertVerified();
  });

  it('refuses when the Gateway named is not enrolled and live', async () => {
    const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind();
    world.live.delete(gatewayId);
    const command = builderCommand();
    await refusedAndUnwritten(
      roomId,
      () => bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command }),
      'gateway_not_live',
      command.commandId,
    );
    assert.deepEqual(world.gatewayChecks, [gatewayId]);
  });

  it('refuses a runtime room that Gateway did not report minted for this lifecycle room', async () => {
    const { world, roomId, gatewayId } = await readyToBind();
    const otherGateway = randomUUID();
    world.live.add(otherGateway);
    const elsewhere = newRuntimeRoomId();
    // Minted by this Gateway, but for another lifecycle room.
    reportMinted(world, gatewayId, randomUUID(), elsewhere);
    // Minted for this lifecycle room, but by another Gateway.
    const byOther = newRuntimeRoomId();
    reportMinted(world, otherGateway, roomId, byOther);
    for (const runtimeRoomId of [elsewhere, byOther, newRuntimeRoomId()]) {
      const command = builderCommand();
      await refusedAndUnwritten(
        roomId,
        () => bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command }),
        'runtime_room_not_minted',
        command.commandId,
      );
    }
  });

  it('refuses a room whose T5 entry carries no PlanDoc digest', async () => {
    const world = newWorld();
    const roomId = randomUUID();
    await ledger!.createRoom(roomId);
    await drive(ledger!, roomId, TO_BUILDING, EVIDENCE);
    assert.equal((await ledger!.loadRoom(roomId)).state.state, 'BUILDING');
    const gatewayId = randomUUID();
    const runtimeRoomId = newRuntimeRoomId();
    world.live.add(gatewayId);
    reportMinted(world, gatewayId, roomId, runtimeRoomId);
    const command = builderCommand();
    await refusedAndUnwritten(
      roomId,
      () => bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command }),
      'no_approved_plan',
      command.commandId,
    );
  });

  it('refuses a room whose T5 PlanDoc digest is not a plan hash, as no_approved_plan, writing nothing', async () => {
    const world = newWorld();
    const roomId = randomUUID();
    await ledger!.createRoom(roomId);
    await drive(ledger!, roomId, TO_BUILDING, [{ kind: 'plandoc', ref: 'cmd_plan_fixture', digest: 'sha256:not-a-hex-digest' }]);
    const gatewayId = randomUUID();
    const runtimeRoomId = newRuntimeRoomId();
    world.live.add(gatewayId);
    reportMinted(world, gatewayId, roomId, runtimeRoomId);
    const command = builderCommand();
    await refusedAndUnwritten(
      roomId,
      () => bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command }),
      'no_approved_plan',
      command.commandId,
    );
  });

  it('refuses a command that is not builder.invoke, or whose id is outside cmd_, before the ledger is touched', async () => {
    const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind();
    const commands: BuilderCommandRequest[] = [
      builderCommand({ commandKind: 'planner.invoke' }),
      builderCommand({ commandKind: 'builder.invoke ' }),
      builderCommand({ commandId: `run_${randomBytes(12).toString('hex')}` }),
      builderCommand({ commandId: 'cmd_' }),
      builderCommand({ commandId: `CMD_${randomBytes(12).toString('hex')}` }),
    ];
    for (const command of commands) {
      await refusedAndUnwritten(
        roomId,
        () => bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command }),
        'not_a_builder_command',
        command.commandId,
      );
    }
    assert.deepEqual(world.gatewayChecks, [], 'refused before the room lock is taken');
    // The room is still bindable.
    boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command: builderCommand() }));
  });

  it('refuses a malformed runtime room id as invalid_request, with nothing written', async () => {
    const { world, roomId, gatewayId } = await readyToBind();
    reportMinted(world, gatewayId, roomId, 'room-1');
    const command = builderCommand();
    const reason = await refusedAndUnwritten(
      roomId,
      () => bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId: 'room-1', command }),
      'invalid_request',
      command.commandId,
    );
    assert.match(reason, /runtime room id/);
  });

  it('a room that does not exist is not a refusal: RoomNotFoundError, and nothing is journaled', async () => {
    const world = newWorld();
    const roomId = randomUUID();
    const command = builderCommand();
    const head = (await footprint(roomId)).journalHead;
    await assert.rejects(
      bindFirstBuilderCommand(deps(world), { roomId, gatewayId: randomUUID(), runtimeRoomId: newRuntimeRoomId(), command }),
      RoomNotFoundError,
    );
    assert.equal((await footprint(roomId)).journalHead, head);
  });

  it('the generic append path refuses runtime_room.bound outright, writing nothing', async () => {
    const { roomId, gatewayId, runtimeRoomId } = await readyToBind();
    const before = await footprint(roomId);
    await assert.rejects(
      ledger!.append(
        roomId,
        makeEvent('runtime_room.bound', { binding: { lifecycleRoomId: roomId, runtimeRoomId, gatewayId } }),
      ),
      /recorded event, appended only through its governed path/,
    );
    assert.deepEqual(await footprint(roomId), before);
  });
});

describe('room binding — the database backstop (journal ruling B5, migration 0011)', { skip: SKIP_REASON }, () => {
  it('refuses a second room binding a runtime room already bound, by the unique index, writing nothing of the attempt', async () => {
    const { world, roomId: firstRoom, gatewayId, runtimeRoomId } = await readyToBind();
    boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId: firstRoom, gatewayId, runtimeRoomId, command: builderCommand() }));

    // The room channel would never report this (a Gateway's runtime room is
    // minted for one lifecycle room); the fake does, so every application
    // check passes and only the database stands in the way.
    const { roomId: secondRoom } = await buildingRoom();
    reportMinted(world, gatewayId, secondRoom, runtimeRoomId);
    const command = builderCommand();
    const before = await footprint(secondRoom);
    const reason = refusedWith(
      await bindFirstBuilderCommand(deps(world), { roomId: secondRoom, gatewayId, runtimeRoomId, command }),
      'binding_conflict',
    );
    assert.match(reason, /build_room_events_runtime_room_bound_once/);
    assert.equal(world.gatewayChecks.at(-1), gatewayId, 'the attempt passed the application checks');
    assert.deepEqual(await footprint(secondRoom), before);
    assert.equal(await journalRowsFor(command.commandId), 0);
    assert.equal((await ledger!.loadRoom(secondRoom)).state.binding, null);

    // The index is on the runtime room id alone: another Gateway claiming it fares no better.
    const otherGateway = randomUUID();
    world.live.add(otherGateway);
    reportMinted(world, otherGateway, secondRoom, runtimeRoomId);
    const viaOther = builderCommand();
    refusedWith(
      await bindFirstBuilderCommand(deps(world), { roomId: secondRoom, gatewayId: otherGateway, runtimeRoomId, command: viaOther }),
      'binding_conflict',
    );
    assert.deepEqual(await footprint(secondRoom), before);
    assert.equal(await journalRowsFor(viaOther.commandId), 0);

    // The second room can still bind a runtime room of its own.
    const own = newRuntimeRoomId();
    reportMinted(world, gatewayId, secondRoom, own);
    boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId: secondRoom, gatewayId, runtimeRoomId: own, command: builderCommand() }));
    await assertVerified();
  });
});

describe('room binding — later Builder commands name the binding (journal ruling B6)', { skip: SKIP_REASON }, () => {
  it('journals a later Builder command naming the binding entry, and verify() holds', async () => {
    const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind();
    const bound = boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command: builderCommand() }));
    const later = builderCommand();
    const outcome = await journalLaterBuilderCommand(deps(world), { roomId, command: later });
    assert.equal(outcome.kind, 'journaled', JSON.stringify(outcome));
    if (outcome.kind !== 'journaled') return;
    assert.equal(outcome.journaled.commandId, later.commandId);
    assert.ok(BigInt(outcome.journaled.seq) > BigInt(bound.binding.seq));

    const history = await journal!.commandHistory(later.commandId);
    assert.equal(history.entries.length, 1);
    const decoded = history.entries[0]?.decoded;
    assert.ok(decoded?.recordClass === 'command');
    assert.equal(decoded.row.commandEnvelope?.commandKind, BUILDER_COMMAND_KIND);
    assert.equal(decoded.row.roomId, roomId);
    assert.deepEqual(decoded.row.lifecycleEventRef, { roomId, eventId: bound.eventId });
    // No lifecycle row of its own: the room is still BUILDING with the same binding.
    const view = await ledger!.loadRoom(roomId);
    assert.equal(view.logLength, bound.lifecycleSeq);
    await assertVerified();
  });

  it('refuses a later Builder command for a room with no binding, or not in BUILDING, writing nothing', async () => {
    const { world, roomId } = await readyToBind();
    const command = builderCommand();
    const before = await footprint(roomId);
    refusedWith(await journalLaterBuilderCommand(deps(world), { roomId, command }), 'not_bound');
    assert.deepEqual(await footprint(roomId), before);
    assert.equal(await journalRowsFor(command.commandId), 0);

    const reviewing = randomUUID();
    await ledger!.createRoom(reviewing);
    await drive(ledger!, reviewing, TO_PLAN_REVIEW);
    const other = builderCommand();
    const beforeReview = await footprint(reviewing);
    refusedWith(await journalLaterBuilderCommand(deps(world), { roomId: reviewing, command: other }), 'not_building');
    assert.deepEqual(await footprint(reviewing), beforeReview);
    assert.equal(await journalRowsFor(other.commandId), 0);

    const notBuilder = builderCommand({ commandKind: 'planner.invoke' });
    refusedWith(await journalLaterBuilderCommand(deps(world), { roomId, command: notBuilder }), 'not_a_builder_command');
    assert.equal(await journalRowsFor(notBuilder.commandId), 0);
    await assertVerified();
  });
});

describe('room binding — verify() finds a Builder command outside the binding (B6, B3)', { skip: SKIP_REASON }, () => {
  it('a builder.invoke journaled through the plain path with no room is a binding defect', async () => {
    const pool = await runtimePool(DEFECT_NO_ROOM);
    extraPools.push(pool);
    const store = new JournalStore(pool);
    await assertVerified(store);
    // The plain path appends it: nothing at append time reads the binding rules.
    const appended = await store.appendJournaled(builderCommand());
    const verdict = await store.verify();
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.match(verdict.reason, /^binding: B6: a Builder command is journaled with no room_id/);
    assert.equal(verdict.atSeq, appended.seq);
  });

  it('a builder.invoke journaled for a room with no binding is a binding defect', async () => {
    const pool = await runtimePool(DEFECT_UNBOUND_ROOM);
    extraPools.push(pool);
    const store = new JournalStore(pool);
    const rooms = new PostgresLedgerStore(pool);
    const roomId = randomUUID();
    await rooms.createRoom(roomId);
    await drive(rooms, roomId, TO_BUILDING, plandoc(hex64()));
    // Journaled in a transaction of its own, bound to the room but to no binding.
    const client = await pool.connect();
    let seq = '';
    try {
      await client.query('BEGIN');
      seq = (await store.inTransaction(client).appendJournaled(builderCommand(), { roomId })).seq;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    const verdict = await store.verify();
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.match(verdict.reason, new RegExp(`^binding: B6: a Builder command is journaled for room ${roomId}, which has no binding`));
    assert.equal(verdict.atSeq, seq);
    await assert.rejects(store.reconstruct(), /reconstruct refused: binding: B6/);
  });
});

describe('room binding — replay reproduces it, once (lifecycle ruling B6, journal ruling B7)', { skip: SKIP_REASON }, () => {
  it('a fresh process reads the binding back from the log, and the chain reconstructs it in seq order', async () => {
    const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind();
    const command = builderCommand();
    const bound = boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command }));
    const expected = { lifecycleRoomId: roomId, runtimeRoomId, gatewayId, eventId: bound.eventId };

    const fresh = await runtimePool(MAIN);
    extraPools.push(fresh);
    const reread = await new PostgresLedgerStore(fresh).loadRoom(roomId);
    assert.equal(reread.state.state, 'BUILDING');
    assert.deepEqual(reread.state.binding, expected);

    // The exported rows replay through the pure reducer to the same binding.
    const exported = await new PostgresLedgerStore(fresh).exportRoom(roomId);
    const replayed = applyAll(initialLedger(), exported.events.map((row) => row['payload'] as LifecycleEvent));
    assert.ok(replayed.results.every((result) => result.ok));
    assert.deepEqual(replayed.state.binding, expected);
    assert.deepEqual(replayed.state, reread.state);

    const records = await new JournalStore(fresh).reconstruct();
    const at = records.findIndex((record) => record.seq === bound.binding.seq);
    assert.ok(at > 0);
    assert.equal(records[at]?.decoded.recordClass, 'binding');
    assert.equal(records[at - 1]?.seq, bound.journaled.seq);
    assert.equal(records[at - 1]?.commandId, command.commandId);
  });

  it('never appends the binding event id twice, by any path', async () => {
    const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind();
    const bound = boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command: builderCommand() }));
    const { rows } = await admin!.query<{ payload: LifecycleEvent }>(
      'SELECT payload FROM build_room_events WHERE room_id = $1 AND event_id = $2',
      [roomId, bound.eventId],
    );
    const storedEvent = rows[0]!.payload;
    const before = await footprint(roomId);

    // The governed path, with the same event id minted again.
    const command = builderCommand();
    refusedWith(
      await bindFirstBuilderCommand(deps(world, { mintEventId: () => bound.eventId }), { roomId, gatewayId, runtimeRoomId, command }),
      'already_bound',
    );

    // The recorded-append path itself, past the binding module's checks: the
    // same event is a replay, which is no recorded event.
    let afterRan = false;
    await assert.rejects(
      ledger!.appendRecorded(roomId, {
        build: async () => storedEvent,
        afterRecorded: async () => {
          afterRan = true;
        },
      }),
      (error: unknown) => error instanceof RecordedEventRefusedError && error.code === 'not_recorded' && /replay/.test(error.reason),
    );
    // A fresh id for a second binding is the reducer's B4 refusal.
    await assert.rejects(
      ledger!.appendRecorded(roomId, {
        build: async () => ({ ...storedEvent, eventId: newBindingEventId() }),
        afterRecorded: async () => {
          afterRan = true;
        },
      }),
      (error: unknown) => error instanceof RecordedEventRefusedError && error.code === 'binding_exists',
    );
    assert.equal(afterRan, false);

    // The generic path answers a replay and writes nothing (INV-4).
    const replay = await ledger!.append(roomId, storedEvent);
    assert.equal(replay.ok && replay.outcome, 'replay');

    assert.deepEqual(await footprint(roomId), before);
    assert.equal(await journalRowsFor(command.commandId), 0);
    assert.deepEqual((await ledger!.loadRoom(roomId)).state.binding?.eventId, bound.eventId);
  });
});

describe('room binding — through the real leader fence and room channel', { skip: SKIP_REASON }, () => {
  it('binds only once the enrolled Gateway is live, as GatewayRoomAppendFence derives it', async () => {
    const harness: GatewayHarness = { pool: admin!, appPool: appPool!, config: appConfig!, databaseName: MAIN };
    const node = await makeSessionNode(harness);
    await promoteNode(node);
    const gateway = await enrollGateway(node);
    const fence = node.surface.roomAppendFence;
    const channel = node.surface.roomChannel;
    const fenced = new PostgresLedgerStore(appPool!, fence);
    const derive = async (gatewayId: string): Promise<boolean> => {
      const client = await appPool!.connect();
      try {
        return await fence.deriveGatewayEnrolledAndLive(client, gatewayId);
      } finally {
        client.release();
      }
    };

    const { roomId } = await buildingRoom();
    const runtimeRoomId = newRuntimeRoomId();
    // The Gateway reports a runtime room minted for this lifecycle room, as its signed report would record it.
    const reportMinted = (): void => {
      const { requestId } = channel.requestMint(gateway.gatewayId, roomId);
      assert.equal(channel.collect(gateway.gatewayId)?.requestId, requestId);
      assert.equal(
        channel.recordMinted(gateway.gatewayId, { requestId, lifecycleRoomId: roomId, runtimeRoomId, occupancy: 'PREPARED' }),
        true,
      );
    };
    const realDeps = deps(newWorld(), { ledger: fenced, gateways: fence, rooms: channel });

    // A room reported before the Gateway's session started is forgotten by that session-start,
    // since the daemon may have restarted and lost it; the Gateway reports it again in the new session.
    reportMinted();
    assert.deepEqual(channel.mintedFor(gateway.gatewayId, roomId), [runtimeRoomId]);
    const epoch = await openSession(node, gateway);
    assert.deepEqual(channel.mintedFor(gateway.gatewayId, roomId), []);
    reportMinted();

    // Enrolled, in session, but no heartbeat accepted: not live.
    assert.equal(await derive(gateway.gatewayId), false);
    const early = builderCommand();
    const before = await footprint(roomId);
    refusedWith(
      await bindFirstBuilderCommand(realDeps, { roomId, gatewayId: gateway.gatewayId, runtimeRoomId, command: early }),
      'gateway_not_live',
    );
    assert.deepEqual(await footprint(roomId), before);
    assert.equal(await journalRowsFor(early.commandId), 0);

    // A Gateway that is not enrolled at all is never live.
    assert.equal(await derive(randomUUID()), false);

    // An accepted heartbeat makes it live, and the binding commits through the fence.
    assert.equal((await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP)).status, 200);
    assert.equal(await derive(gateway.gatewayId), true);
    const command = builderCommand();
    const bound = boundOutcome(
      await bindFirstBuilderCommand(realDeps, { roomId, gatewayId: gateway.gatewayId, runtimeRoomId, command }),
    );
    const binding = (await ledger!.loadRoom(roomId)).state.binding;
    assert.deepEqual(binding, { lifecycleRoomId: roomId, runtimeRoomId, gatewayId: gateway.gatewayId, eventId: bound.eventId });
    assert.equal(await journalRowsFor(command.commandId), 2);
    await assertVerified();

    // G17's limb, from the real channel: false until the binding's own Gateway reports CLOSED.
    assert.equal(fence.deriveBoundRuntimeRoomClosed(binding), false);
    assert.equal(channel.recordOccupancy(gateway.gatewayId, { lifecycleRoomId: roomId, runtimeRoomId, occupancy: 'CLOSED' }), true);
    assert.equal(fence.deriveBoundRuntimeRoomClosed(binding), true);
  });
});

/**
 * A fence that runs the append in a plain transaction on the application
 * pool and derives what the test tells it to. `derivedFor` records each
 * binding the store asked the occupancy limb about.
 */
class ControlledFence implements RoomAppendFence {
  closed = false;
  readonly derivedFor: Array<LedgerState['binding']> = [];

  deriveBoundRuntimeRoomClosed(binding: LedgerState['binding']): boolean {
    this.derivedFor.push(binding);
    return this.closed;
  }

  async runRoomAppend<T>(
    body: (client: PoolClient, deriveGatewayOnline: () => Promise<boolean>) => Promise<{ readonly value: T; readonly commit: boolean }>,
  ): Promise<RoomAppendOutcome<T>> {
    const client = await appPool!.connect();
    try {
      await client.query('BEGIN');
      const outcome = await body(client, async () => true);
      await client.query(outcome.commit ? 'COMMIT' : 'ROLLBACK');
      return { status: 'ok', value: outcome.value };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

describe('room binding — G17 occupancy is derived for T17 alone (lifecycle ruling C1)', { skip: SKIP_REASON }, () => {
  /** Stored payloads of the room that carry `facts.boundRuntimeRoomClosed`, by event. */
  async function closedFactsStored(roomId: string): Promise<Array<{ event: string; value: string }>> {
    const { rows } = await admin!.query<{ event: string; value: string }>(
      `SELECT event, payload->'facts'->>'boundRuntimeRoomClosed' AS value FROM build_room_events
        WHERE room_id = $1 AND payload->'facts' ? 'boundRuntimeRoomClosed' ORDER BY seq`,
      [roomId],
    );
    return rows;
  }

  it('never persists a caller-supplied boundRuntimeRoomClosed on a non-T17 event, and decides T17 by the derived value', async () => {
    const fence = new ControlledFence();
    const fenced = new PostgresLedgerStore(appPool!, fence);
    assert.equal(PERMISSIVE_FACTS.boundRuntimeRoomClosed, true, 'every fixture event claims the room CLOSED');

    // To BUILDING, bound through the fenced recorded path, on to MERGE_CONFIRMED.
    const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind(fenced);
    const bound = boundOutcome(
      await bindFirstBuilderCommand(deps(world, { ledger: fenced }), { roomId, gatewayId, runtimeRoomId, command: builderCommand() }),
    );
    await drive(fenced, roomId, BUILDING_TO_MERGE_CONFIRMED);
    assert.equal((await ledger!.loadRoom(roomId)).state.state, 'MERGE_CONFIRMED');
    assert.deepEqual(await closedFactsStored(roomId), [], 'no non-T17 event kept the caller\'s claim');
    assert.deepEqual(fence.derivedFor, [], 'the limb is derived for no event but T17\'s');
    const { rows: online } = await admin!.query<{ value: string | null }>(
      `SELECT payload->'facts'->>'gatewayOnline' AS value FROM build_room_events
        WHERE room_id = $1 AND event <> 'runtime_room.bound'`,
      [roomId],
    );
    assert.ok(online.length > 0 && online.every((row) => row.value === 'true'), 'gatewayOnline is still derived on every event');

    // T17, the caller claiming CLOSED, the fence deriving not CLOSED: refused.
    const binding = { lifecycleRoomId: roomId, runtimeRoomId, gatewayId, eventId: bound.eventId };
    const claimed = makeEvent('build.closed', { facts: { ...PERMISSIVE_FACTS, boundRuntimeRoomClosed: true } });
    const refused = await fenced.append(roomId, claimed);
    assert.equal(refused.ok, false);
    if (refused.ok || refused.outcome !== 'rejected') throw new Error(`expected a rejection, got ${JSON.stringify(refused)}`);
    assert.equal(refused.code, 'guard_failed');
    assert.match(refused.reason, /^G17 \(T17\): the bound runtime room is not reported CLOSED/);
    assert.deepEqual(fence.derivedFor, [binding], 'derived once, from the ledger\'s own binding');
    assert.equal((await ledger!.loadRoom(roomId)).state.state, 'MERGE_CONFIRMED');
    const { rows: rejections } = await admin!.query<{ code: string }>(
      'SELECT code FROM build_room_rejections WHERE room_id = $1 AND event_id = $2',
      [roomId, claimed.eventId],
    );
    assert.deepEqual(rejections, [{ code: 'guard_failed' }]);

    // The fence deriving CLOSED, the caller claiming the opposite: accepted, the derived value stored.
    fence.closed = true;
    const denied = makeEvent('build.closed', { facts: { ...PERMISSIVE_FACTS, boundRuntimeRoomClosed: false } });
    const accepted = await fenced.append(roomId, denied);
    assert.ok(accepted.ok && accepted.outcome === 'transition', JSON.stringify(accepted));
    if (!accepted.ok || accepted.outcome !== 'transition') return;
    assert.equal(accepted.entry.transition, 'T17');
    assert.equal(accepted.state.state, 'CLOSED_DELIVERED');
    assert.deepEqual(fence.derivedFor, [binding, binding]);
    assert.deepEqual(await closedFactsStored(roomId), [{ event: 'build.closed', value: 'true' }]);
    await assertVerified();
  });

  it('refuses T17 on a room the ledger holds no binding for, even when the fence derives CLOSED', async () => {
    const fence = new ControlledFence();
    fence.closed = true;
    const fenced = new PostgresLedgerStore(appPool!, fence);
    const { roomId } = await buildingRoom(fenced);
    await drive(fenced, roomId, BUILDING_TO_MERGE_CONFIRMED);
    const result = await fenced.append(roomId, makeEvent('build.closed', { facts: { ...PERMISSIVE_FACTS } }));
    assert.equal(result.ok, false);
    if (result.ok || result.outcome !== 'rejected') throw new Error(`expected a rejection, got ${JSON.stringify(result)}`);
    assert.equal(result.code, 'guard_failed');
    assert.match(result.reason, /^G17 \(T17\): no runtime room binding/);
    assert.deepEqual(fence.derivedFor, [null]);
    assert.deepEqual(await closedFactsStored(roomId), []);
  });
});
