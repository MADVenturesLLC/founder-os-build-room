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
 *    channel, which believes a minted room only once the Gateway has
 *    reported it in its current session; and, under a fence whose occupancy derivation the suite
 *    controls, the G17 limb is derived for T17's trigger alone, a caller's
 *    `boundRuntimeRoomClosed` is never persisted on any other event, and
 *    T17 is decided by the derived value and the ledger's binding, never by
 *    the caller's claim.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
import {
  JOURNAL_APPEND_LOCK_KEY,
  JournalSequenceError,
  JournalStore,
  type JournaledBinding,
} from '../packages/control-plane/src/journal-store.js';
import type { GatewayRoomChannel } from '../packages/control-plane/src/gateway/room-channel.js';
import { roomOpenForMint } from '../packages/control-plane/src/gateway/room-state.js';
import { TransactionControlRefusedError } from '../packages/control-plane/src/transaction-client.js';
import {
  PostgresLedgerStore,
  RecordedEventRefusedError,
  RoomNotFoundError,
  type RecordedAppend,
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
import {
  BUILDER_COMMAND_KIND,
  encodeCommandEventRowV2,
  envelopeDigest,
  normalizeForJournal,
  type GovernedCommandRequest,
} from '../packages/journal/src/index.js';
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
  type EnrolledGateway,
  type SessionNode,
} from './gateway-session-helpers.js';
import { hex32, signBytes } from './gateway-helpers.js';
import {
  plannerPollSignedBytes,
  runtimeRoomMintedSignedBytes,
  runtimeRoomOccupancySignedBytes,
  type HeartbeatCanonicalInput,
} from '../packages/gateway-protocol/src/index.js';
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
  /** Each lifecycle room whose open mint requests the binding withdrew. */
  readonly cancelled: string[];
  probeRoomLock: string | null;
}

function newWorld(): World {
  return { live: new Set(), minted: new Map(), gatewayChecks: [], lockProbes: [], cancelled: [], probeRoomLock: null };
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
    rooms: {
      mintedFor: (gatewayId, lifecycleRoomId) => world.minted.get(`${gatewayId} ${lifecycleRoomId}`) ?? [],
      cancelMintsFor: (lifecycleRoomId) => {
        world.cancelled.push(lifecycleRoomId);
        return 0;
      },
    },
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

/**
 * A `journaled` row written by the append routine directly, as the runtime
 * login, past every check `JournalStore` makes: the row the store refuses
 * to write (journal ruling B6 at write time), for proving that `verify()`
 * still finds one a writer other than this store left in the chain. The
 * routine itself enforces chain and shape, not the binding rules. Returns
 * the row's seq.
 */
async function appendJournaledPastTheStore(
  pool: PgPool,
  request: GovernedCommandRequest & { readonly commandId: string },
  binding: JournaledBinding,
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [JOURNAL_APPEND_LOCK_KEY]);
    const { rows: head } = await client.query<{ seq: string }>(
      'SELECT seq::text AS seq FROM public.command_journal_chain_head WHERE head_id = 1',
    );
    const seq = String(BigInt(head[0]!.seq) + 1n);
    const envelope = normalizeForJournal(request);
    const bytes = encodeCommandEventRowV2({
      seq,
      eventType: 'journaled',
      commandId: request.commandId,
      actorId: request.actorId,
      roleId: request.roleId,
      repository: request.repository,
      scopeRef: request.scopeRef,
      commandEnvelope: envelope,
      envelopeDigest: envelopeDigest(envelope),
      authorizationRef: request.authorizationRef,
      intendedProvider: request.intendedProvider,
      intendedModel: request.intendedModel,
      intendedSurface: request.intendedSurface,
      ...(binding.roomId === undefined ? {} : { roomId: binding.roomId }),
      ...(binding.lifecycleEventRef === undefined ? {} : { lifecycleEventRef: { ...binding.lifecycleEventRef } }),
      evidenceRefs: [],
      recordedAt: new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z'),
    });
    const { rows } = await client.query<{ seq: string }>(
      'SELECT seq::text AS seq FROM public.command_journal_append($1, $2, $3, $4, $5)',
      ['command', request.commandId, 'journaled', seq, Buffer.from(bytes)],
    );
    await client.query('COMMIT');
    return rows[0]!.seq;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** One poll's collect, asking the lifecycle log as the poll route does (`roomOpenForMint`), on a client of its own. */
async function collectOpen(channel: GatewayRoomChannel, gatewayId: string): ReturnType<GatewayRoomChannel['collect']> {
  const client = await appPool!.connect();
  try {
    return await channel.collect(gatewayId, (lifecycleRoomId) => roomOpenForMint(client, lifecycleRoomId));
  } finally {
    client.release();
  }
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
    assert.deepEqual(world.cancelled, [roomId], 'the room\'s open mint requests are withdrawn once it is bound');
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
  // The store refuses to write either row (see "the store refuses ... at write
  // time" below), so each is written past it, by the append routine directly,
  // as a writer that is not this store could: verify() still finds it.
  it('a builder.invoke in the chain with no room is a binding defect', async () => {
    const pool = await runtimePool(DEFECT_NO_ROOM);
    extraPools.push(pool);
    const store = new JournalStore(pool);
    await assertVerified(store);
    await assert.rejects(store.appendJournaled(builderCommand()), JournalSequenceError, 'the store refuses it');
    await assertVerified(store);
    const appended = await appendJournaledPastTheStore(pool, builderCommand(), {});
    const verdict = await store.verify();
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.match(verdict.reason, /^binding: B6: a Builder command is journaled with no room_id/);
    assert.equal(verdict.atSeq, appended);
  });

  it('a builder.invoke in the chain for a room with no binding is a binding defect', async () => {
    const pool = await runtimePool(DEFECT_UNBOUND_ROOM);
    extraPools.push(pool);
    const store = new JournalStore(pool);
    const rooms = new PostgresLedgerStore(pool);
    const roomId = randomUUID();
    await rooms.createRoom(roomId);
    await drive(rooms, roomId, TO_BUILDING, plandoc(hex64()));
    // The store refuses it in a transaction of its own, bound to the room but to no binding.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await assert.rejects(store.inTransaction(client).appendJournaled(builderCommand(), { roomId }), JournalSequenceError);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await assertVerified(store);
    const seq = await appendJournaledPastTheStore(pool, builderCommand(), { roomId });
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

/** The one serving control plane over MAIN: a second node could not take the lease this one holds. */
let serving: SessionNode | undefined;
async function servingNode(): Promise<SessionNode> {
  if (serving !== undefined) return serving;
  const harness: GatewayHarness = { pool: admin!, appPool: appPool!, config: appConfig!, databaseName: MAIN };
  const node = await makeSessionNode(harness);
  await promoteNode(node);
  serving = node;
  return node;
}

describe('room binding — through the real leader fence and room channel', { skip: SKIP_REASON }, () => {
  it('binds only once the enrolled Gateway is live, as GatewayRoomAppendFence derives it', async () => {
    const node = await servingNode();
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
    const reportMinted = async (): Promise<void> => {
      const { requestId } = channel.requestMint(gateway.gatewayId, roomId);
      assert.equal((await collectOpen(channel, gateway.gatewayId))?.requestId, requestId);
      assert.equal(channel.recordMinted(gateway.gatewayId, { requestId, lifecycleRoomId: roomId, runtimeRoomId }), true);
    };
    const realDeps = deps(newWorld(), { ledger: fenced, gateways: fence, rooms: channel });

    // A room reported before the Gateway's session started is not believed after that session-start,
    // since the daemon may have restarted and lost it; the Gateway reports it again in the new session.
    await reportMinted();
    assert.deepEqual(channel.mintedFor(gateway.gatewayId, roomId), [runtimeRoomId]);
    const epoch = await openSession(node, gateway);
    assert.deepEqual(channel.mintedFor(gateway.gatewayId, roomId), []);
    await reportMinted();

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

/** Stored payloads of the room that carry `facts.boundRuntimeRoomClosed`, by event. */
async function closedFactsStored(roomId: string): Promise<Array<{ event: string; value: string }>> {
  const { rows } = await admin!.query<{ event: string; value: string }>(
    `SELECT event, payload->'facts'->>'boundRuntimeRoomClosed' AS value FROM build_room_events
      WHERE room_id = $1 AND payload->'facts' ? 'boundRuntimeRoomClosed' ORDER BY seq`,
    [roomId],
  );
  return rows;
}

describe('room binding — G17 occupancy is derived for T17 alone (lifecycle ruling C1)', { skip: SKIP_REASON }, () => {
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

/* ---------------- the review findings, as regressions ---------------- */

/** A well-formed `runtime_room.bound` event for the room, as the binding path builds it. */
function boundEvent(roomId: string, gatewayId: string, runtimeRoomId: string): LifecycleEvent {
  return {
    eventId: newBindingEventId(),
    event: 'runtime_room.bound',
    actor: 'system',
    attribution: { ...DISPATCHER },
    scope: { roomId, repo: REPO, paths: [] },
    evidence: [],
    occurredAt: NOW.toISOString(),
    binding: { lifecycleRoomId: roomId, runtimeRoomId, gatewayId },
  } as LifecycleEvent;
}

function bindingNotJournaled(error: unknown): boolean {
  return error instanceof RecordedEventRefusedError && error.code === 'binding_not_journaled';
}

/** Run `body` in a transaction of its own on the runtime login, and COMMIT whatever it left. */
async function inOwnTransaction<T>(body: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await appPool!.connect();
  try {
    await client.query('BEGIN');
    const value = await body(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe('room binding — the store refuses a Builder command outside its binding at write time (journal ruling B3, B6)', { skip: SKIP_REASON }, () => {
  it('the standalone appendJournaled refuses builder.invoke, writing nothing', async () => {
    const { roomId } = await readyToBind();
    const command = builderCommand();
    const before = await footprint(roomId);
    await assert.rejects(
      journal!.appendJournaled(command),
      (error: unknown) => error instanceof JournalSequenceError && /B6: a builder\.invoke command is journaled only in the transaction/.test(error.message),
    );
    assert.deepEqual(await footprint(roomId), before);
    assert.equal(await journalRowsFor(command.commandId), 0);
    await assertVerified();
  });

  it('a joined appendJournaled refuses builder.invoke that does not name its own room\'s recorded runtime_room.bound, writing nothing', async () => {
    const bound = await readyToBind();
    const boundEventId = boundOutcome(
      await bindFirstBuilderCommand(deps(bound.world), { roomId: bound.roomId, gatewayId: bound.gatewayId, runtimeRoomId: bound.runtimeRoomId, command: builderCommand() }),
    ).eventId;
    const { roomId } = await readyToBind();
    const { rows } = await admin!.query<{ event_id: string }>(
      `SELECT event_id FROM build_room_events WHERE room_id = $1 AND event = 'plan.approved'`,
      [roomId],
    );
    const planApproved = rows[0]!.event_id;

    const cases: ReadonlyArray<readonly [string, JournaledBinding, RegExp]> = [
      ['no binding at all', {}, /names its room and that room's runtime_room\.bound/],
      ['a room and no lifecycle event', { roomId }, /names its room and that room's runtime_room\.bound/],
      ['a lifecycle event and no room', { lifecycleEventRef: { roomId: bound.roomId, eventId: boundEventId } }, /names its room and that room's runtime_room\.bound/],
      ['its room\'s T5 transition', { roomId, lifecycleEventRef: { roomId, eventId: planApproved } }, /is not its room's recorded runtime_room\.bound/],
      ['an event its room does not have', { roomId, lifecycleEventRef: { roomId, eventId: 'evt-no-such-event' } }, /is not its room's recorded runtime_room\.bound/],
      ['another room\'s binding', { roomId, lifecycleEventRef: { roomId: bound.roomId, eventId: boundEventId } }, /names the binding of its own room/],
    ];
    const before = [await footprint(roomId), await footprint(bound.roomId)];
    for (const [label, binding, reason] of cases) {
      const command = builderCommand();
      await inOwnTransaction(async (client) => {
        await assert.rejects(
          journal!.inTransaction(client).appendJournaled(command, binding),
          (error: unknown) => error instanceof JournalSequenceError && reason.test(error.message),
          label,
        );
      });
      assert.equal(await journalRowsFor(command.commandId), 0, label);
    }
    assert.deepEqual([await footprint(roomId), await footprint(bound.roomId)], before, 'nothing was written');
    await assertVerified();

    // Control: naming its own room's recorded binding is accepted (a later Builder command, B6).
    const later = builderCommand();
    await inOwnTransaction((client) =>
      journal!.inTransaction(client).appendJournaled(later, { roomId: bound.roomId, lifecycleEventRef: { roomId: bound.roomId, eventId: boundEventId } }),
    );
    assert.equal(await journalRowsFor(later.commandId), 1);
    await assertVerified();
  });

  it('appendRecorded refuses as binding_not_journaled when its callback journals nothing, or the Builder command without the binding record', async () => {
    const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind();
    const before = await footprint(roomId);

    // The callback journals nothing.
    let ran = 0;
    await assert.rejects(
      ledger!.appendRecorded(roomId, {
        build: async () => boundEvent(roomId, gatewayId, runtimeRoomId),
        afterRecorded: async () => {
          ran += 1;
        },
      }),
      bindingNotJournaled,
    );
    assert.equal(ran, 1, 'refused after the callback, before COMMIT');
    assert.deepEqual(await footprint(roomId), before, 'no lifecycle row, no journal row');

    // The callback journals the first Builder command, naming the entry, and no binding record.
    const command = builderCommand();
    let journaledSeq: string | null = null;
    await assert.rejects(
      ledger!.appendRecorded(roomId, {
        build: async () => boundEvent(roomId, gatewayId, runtimeRoomId),
        afterRecorded: async (client, { event }) => {
          journaledSeq = (await journal!.inTransaction(client).appendJournaled(command, { roomId, lifecycleEventRef: { roomId, eventId: event.eventId } })).seq;
        },
      }),
      bindingNotJournaled,
    );
    assert.ok(journaledSeq !== null, 'the Builder command was written in the transaction before the refusal');
    assert.deepEqual(await footprint(roomId), before, 'the lifecycle row and the journaled row both rolled back');
    assert.equal(await journalRowsFor(command.commandId), 0);
    assert.equal((await ledger!.loadRoom(roomId)).state.binding, null);
    await assertVerified();

    // The room still binds through the governed path.
    boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command: builderCommand() }));
    await assertVerified();
  });
});

describe('room binding — the store holds B3, B4 and B6 against its own callers (review of ba9d10a)', { skip: SKIP_REASON }, () => {
  const governedOnly = /recorded event, appended only through its governed path/;

  it('refuses a runtime_room.bound offered to append or appendDerived, fenced or not, a duplicate included, writing nothing, not even a rejection row (lifecycle ruling B4)', async () => {
    const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind();
    const bound = boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command: builderCommand() }));
    const before = await footprint(roomId);
    const fenced = new PostgresLedgerStore(appPool!, new ControlledFence());
    for (const store of [ledger!, fenced]) {
      await assert.rejects(store.append(roomId, boundEvent(roomId, gatewayId, runtimeRoomId)), governedOnly);
      await assert.rejects(
        store.appendDerived(roomId, {
          build: async () => boundEvent(roomId, gatewayId, runtimeRoomId),
          afterTransition: async () => assert.fail('a recorded event triggers no transition'),
        }),
        governedOnly,
      );
    }
    // Before any binding, a first one offered here is refused the same way.
    const { roomId: unbound, gatewayId: g2, runtimeRoomId: r2 } = await readyToBind();
    const unboundBefore = await footprint(unbound);
    await assert.rejects(ledger!.append(unbound, boundEvent(unbound, g2, r2)), governedOnly);
    assert.deepEqual(await footprint(unbound), unboundBefore);
    // The original event again, by its own id, is a replay (INV-4), answered
    // with nothing written.
    const { rows } = await admin!.query<{ payload: LifecycleEvent }>(
      'SELECT payload FROM build_room_events WHERE room_id = $1 AND event_id = $2',
      [roomId, bound.eventId],
    );
    const replay = await ledger!.append(roomId, rows[0]!.payload);
    assert.equal(replay.ok && replay.outcome, 'replay');
    assert.deepEqual(await footprint(roomId), before, 'no lifecycle row, no rejection row, no journal row');
    await assertVerified();
  });

  it('refuses a callback that journals a second Builder command before the binding, at that command, and nothing commits (B6)', async () => {
    const { world, roomId, planHash, gatewayId, runtimeRoomId } = await readyToBind();
    const before = await footprint(roomId);
    const first = builderCommand();
    const second = builderCommand();
    let firstSeq: string | null = null;
    let reachedBinding = false;
    await assert.rejects(
      ledger!.appendRecorded(roomId, {
        build: async () => boundEvent(roomId, gatewayId, runtimeRoomId),
        afterRecorded: async (client, { event }) => {
          const tx = journal!.inTransaction(client);
          const lifecycleEventRef = { roomId, eventId: event.eventId };
          firstSeq = (await tx.appendJournaled(first, { roomId, lifecycleEventRef })).seq;
          const journaled = await tx.appendJournaled(second, { roomId, lifecycleEventRef });
          reachedBinding = true;
          await tx.appendBinding({ commandId: journaled.commandId, lifecycleRoomId: roomId, runtimeRoomId, gatewayId, planHash, lifecycleEventRef });
        },
      }),
      (error: unknown) =>
        error instanceof JournalSequenceError
        && error.commandId === second.commandId
        && /only a room's first Builder command precedes its binding record/.test(error.reason),
    );
    assert.ok(firstSeq !== null, 'the first command was written before the refusal');
    assert.equal(reachedBinding, false, 'refused at the second command');
    assert.deepEqual(await footprint(roomId), before);
    assert.equal(await journalRowsFor(first.commandId), 0);
    assert.equal(await journalRowsFor(second.commandId), 0);
    assert.equal((await ledger!.loadRoom(roomId)).state.binding, null);
    await assertVerified();

    boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command: builderCommand() }));
    await assertVerified();
  });

  it('refuses a first Builder command naming a runtime_room.bound another transaction recorded with no binding record', async () => {
    const { roomId, gatewayId, runtimeRoomId } = await readyToBind();
    // No store path commits a recorded entry without its binding record; the
    // test writes one directly, as the database owner, to stand for one.
    const orphan = boundEvent(roomId, gatewayId, runtimeRoomId);
    await admin!.query(
      `INSERT INTO build_room_events (
         room_id, seq, event_id, event, outcome, entry_seq, transition_id, guard_id,
         from_state, resulting_state, actor, attribution, scope, evidence, overlays, round, occurred_at, payload)
       SELECT $1, last.seq + 1, $2, 'runtime_room.bound', 'recorded', NULL, NULL, NULL,
              'BUILDING', 'BUILDING', '"system"', $3::jsonb, $4::jsonb, '[]'::jsonb, last.overlays, last.round, $5, $6::jsonb
         FROM (SELECT seq, overlays, round FROM build_room_events WHERE room_id = $1 ORDER BY seq DESC LIMIT 1) AS last`,
      [roomId, orphan.eventId, JSON.stringify(orphan.attribution), JSON.stringify(orphan.scope), orphan.occurredAt, JSON.stringify(orphan)],
    );
    const before = await footprint(roomId);
    const command = builderCommand();
    await assert.rejects(
      inOwnTransaction((client) =>
        journal!.inTransaction(client).appendJournaled(command, { roomId, lifecycleEventRef: { roomId, eventId: orphan.eventId } }),
      ),
      (error: unknown) =>
        error instanceof JournalSequenceError
        && /first Builder command is journaled in the transaction that records its runtime_room\.bound/.test(error.reason),
    );
    assert.deepEqual(await footprint(roomId), before);
    assert.equal(await journalRowsFor(command.commandId), 0);
    await assertVerified();
  });

  it('gives its steps a connection that cannot end the transaction: an early COMMIT, in any form, makes nothing durable', async () => {
    const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind();
    const before = await footprint(roomId);
    const statements = ['COMMIT', 'commit and chain', 'END', 'ROLLBACK', 'ABORT', '/* x */ COMMIT', ';COMMIT', "PREPARE TRANSACTION 'early'"];
    for (const statement of statements) {
      await assert.rejects(
        ledger!.appendRecorded(roomId, {
          build: async () => boundEvent(roomId, gatewayId, runtimeRoomId),
          afterRecorded: async (client) => {
            await client.query(statement);
          },
        }),
        TransactionControlRefusedError,
        statement,
      );
      await assert.rejects(
        ledger!.appendRecorded(roomId, {
          build: async (client) => {
            await client.query(statement);
            return boundEvent(roomId, gatewayId, runtimeRoomId);
          },
          afterRecorded: async () => assert.fail('build was refused'),
        }),
        TransactionControlRefusedError,
        `${statement} in build`,
      );
    }
    // A second statement in one call: PostgreSQL itself refuses it under the
    // extended protocol, before either runs.
    await assert.rejects(
      ledger!.appendRecorded(roomId, {
        build: async () => boundEvent(roomId, gatewayId, runtimeRoomId),
        afterRecorded: async (client) => {
          await client.query('SELECT 1; COMMIT');
        },
      }),
      /cannot insert multiple commands into a prepared statement/,
    );
    await assert.rejects(
      ledger!.appendRecorded(roomId, {
        build: async () => boundEvent(roomId, gatewayId, runtimeRoomId),
        afterRecorded: async (client) => {
          client.release();
        },
      }),
      TransactionControlRefusedError,
    );
    assert.deepEqual(await footprint(roomId), before, 'nothing durable from any attempt');
    assert.equal((await ledger!.loadRoom(roomId)).state.binding, null);
    await assertVerified();

    // The governed path, whose journal appends use savepoints through the
    // same wrapped connection, still binds.
    boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command: builderCommand() }));
    await assertVerified();
  });
});

describe('room binding — a caller\'s boundRuntimeRoomClosed is never persisted, and an unfenced store cannot take T17 (lifecycle ruling C1)', { skip: SKIP_REASON }, () => {
  it('an unfenced append persists the event without the caller\'s fact, and T17 on a bound room is refused', async () => {
    const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind();
    assert.equal(PERMISSIVE_FACTS.boundRuntimeRoomClosed, true, 'every fixture event claims the room CLOSED');
    boundOutcome(await bindFirstBuilderCommand(deps(world), { roomId, gatewayId, runtimeRoomId, command: builderCommand() }));
    await drive(ledger!, roomId, BUILDING_TO_MERGE_CONFIRMED);
    assert.equal((await ledger!.loadRoom(roomId)).state.state, 'MERGE_CONFIRMED');
    assert.deepEqual(await closedFactsStored(roomId), [], 'no stored payload kept the caller\'s claim');
    const { rows: kept } = await admin!.query<{ event: string; allowlisted: string | null }>(
      `SELECT event, payload->'facts'->>'repoInAllowlist' AS allowlisted FROM build_room_events
        WHERE room_id = $1 AND event <> 'runtime_room.bound' ORDER BY seq`,
      [roomId],
    );
    assert.ok(kept.length > 0 && kept.every((row) => row.allowlisted === 'true'), 'only that one fact is dropped');

    const claimed = makeEvent('build.closed', { facts: { ...PERMISSIVE_FACTS, boundRuntimeRoomClosed: true } });
    const refused = await ledger!.append(roomId, claimed);
    assert.equal(refused.ok, false);
    if (refused.ok || refused.outcome !== 'rejected') throw new Error(`expected a rejection, got ${JSON.stringify(refused)}`);
    assert.equal(refused.code, 'guard_failed');
    assert.match(refused.reason, /^G17 \(T17\): the bound runtime room is not reported CLOSED/);
    assert.equal((await ledger!.loadRoom(roomId)).state.state, 'MERGE_CONFIRMED');
    assert.deepEqual(await closedFactsStored(roomId), []);
  });

  it('appendRecorded persists no boundRuntimeRoomClosed even when build returns it, fenced or not', async () => {
    for (const [label, store] of [
      ['unfenced', ledger!],
      ['fenced', new PostgresLedgerStore(appPool!, new ControlledFence())],
    ] as const) {
      const { world, roomId, gatewayId, runtimeRoomId } = await readyToBind(store);
      const claiming: RuntimeRoomBindingDeps['ledger'] = {
        underRoomLock: (id, body) => store.underRoomLock(id, body),
        appendRecorded: <T>(id: string, spec: RecordedAppend<T>) =>
          store.appendRecorded(id, {
            ...spec,
            build: async (client, current) => ({ ...(await spec.build(client, current)), facts: { boundRuntimeRoomClosed: true } }),
          }),
      };
      const bound = boundOutcome(
        await bindFirstBuilderCommand(deps(world, { ledger: claiming }), { roomId, gatewayId, runtimeRoomId, command: builderCommand() }),
      );
      const { rows } = await admin!.query<{ payload: LifecycleEvent }>(
        'SELECT payload FROM build_room_events WHERE room_id = $1 AND event_id = $2',
        [roomId, bound.eventId],
      );
      assert.equal(rows.length, 1, label);
      assert.equal(Object.prototype.hasOwnProperty.call(rows[0]!.payload.facts ?? {}, 'boundRuntimeRoomClosed'), false, label);
      assert.deepEqual(await closedFactsStored(roomId), [], label);
    }
    await assertVerified();
  });
});

/* ---- signed Gateway messages, as the daemon builds them, for the session routes ---- */

function frame(purpose: string) {
  return { protocol: 'founder-os.gateway-protocol', version: 1, purpose };
}

function sessionBase(node: SessionNode, gateway: EnrolledGateway, epoch: string, sequence: number): HeartbeatCanonicalInput {
  return { gatewayId: gateway.gatewayId, keyId: gateway.keyId, epoch, sequence, nonce: hex32(), timestampMs: node.clock.wallNow() };
}

function signedPoll(node: SessionNode, gateway: EnrolledGateway, epoch: string, sequence: number): Record<string, unknown> {
  const canonical = sessionBase(node, gateway, epoch, sequence);
  return { ...frame('planner_poll'), ...canonical, pubkey: gateway.key.pubkeyBase64, signature: signBytes(gateway.key.privateKey, plannerPollSignedBytes(canonical)) };
}

function signedMinted(node: SessionNode, gateway: EnrolledGateway, epoch: string, sequence: number, payload: Record<string, unknown>): Record<string, unknown> {
  const text = JSON.stringify(payload);
  const canonical = {
    ...sessionBase(node, gateway, epoch, sequence),
    requestId: String(payload['requestId']),
    payloadDigest: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
  return { ...frame('runtime_room_minted'), ...canonical, payload: text, pubkey: gateway.key.pubkeyBase64, signature: signBytes(gateway.key.privateKey, runtimeRoomMintedSignedBytes(canonical)) };
}

function signedOccupancy(node: SessionNode, gateway: EnrolledGateway, epoch: string, sequence: number, payload: Record<string, unknown>): Record<string, unknown> {
  const text = JSON.stringify(payload);
  const canonical = {
    ...sessionBase(node, gateway, epoch, sequence),
    runtimeRoomId: String(payload['runtimeRoomId']),
    payloadDigest: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
  return { ...frame('runtime_room_occupancy'), ...canonical, payload: text, pubkey: gateway.key.pubkeyBase64, signature: signBytes(gateway.key.privateKey, runtimeRoomOccupancySignedBytes(canonical)) };
}

describe('room binding — the Gateway room routes read the lifecycle log in their fenced transaction (act B2)', { skip: SKIP_REASON }, () => {
  it('delivers a mint only for an open room, takes occupancy only once bound, and a binding withdraws the room\'s requests on every Gateway', async () => {
    const node = await servingNode();
    const fence = node.surface.roomAppendFence;
    const channel = node.surface.roomChannel;
    const fenced = new PostgresLedgerStore(appPool!, fence);
    const gateway = await enrollGateway(node);
    // Another Gateway's id: the channel keys requests by it; nothing here needs it enrolled (the registry holds two).
    const otherGateway = { gatewayId: randomUUID() };
    const epoch = await openSession(node, gateway);
    let sequence = 0;
    const next = (): number => (sequence += 1);
    assert.equal((await node.service.heartbeat(signedBeat(node, gateway, epoch, next()), TEST_IP)).status, 200);

    const { roomId } = await buildingRoom();
    const reviewing = randomUUID();
    await ledger!.createRoom(reviewing);
    await drive(ledger!, reviewing, TO_PLAN_REVIEW);

    // A room not in BUILDING: its request is withdrawn by the poll, not delivered.
    const notBuilding = channel.requestMint(gateway.gatewayId, reviewing);
    // A room in BUILDING with no binding: delivered.
    const { requestId } = channel.requestMint(gateway.gatewayId, roomId);
    const polled = await node.service.plannerPoll(signedPoll(node, gateway, epoch, next()), TEST_IP);
    assert.equal(polled.status, 200, JSON.stringify(polled.body));
    assert.deepEqual(polled.body['room'], { kind: 'mint', requestId, lifecycleRoomId: roomId });
    assert.equal(channel.cancelMint(notBuilding.requestId), false, 'the PLAN_REVIEW room\'s request was withdrawn');

    const runtimeRoomId = newRuntimeRoomId();
    const minted = await node.service.roomMinted(
      signedMinted(node, gateway, epoch, next(), { requestId, lifecycleRoomId: roomId, runtimeRoomId }),
      TEST_IP,
    );
    assert.deepEqual([minted.status, minted.body['accepted']], [200, true]);
    assert.deepEqual(channel.mintedFor(gateway.gatewayId, roomId), [runtimeRoomId]);
    assert.equal(channel.occupancyOf(gateway.gatewayId, runtimeRoomId), null, 'the minted report carries no occupancy');

    // Minted, not bound: the occupancy report is traffic, accepted: false, recording nothing.
    const early = await node.service.roomOccupancy(
      signedOccupancy(node, gateway, epoch, next(), { lifecycleRoomId: roomId, runtimeRoomId, occupancy: 'PREPARED' }),
      TEST_IP,
    );
    assert.deepEqual([early.status, early.body['accepted']], [200, false]);
    assert.equal(channel.occupancyOf(gateway.gatewayId, runtimeRoomId), null);
    assert.equal(fence.deriveBoundRuntimeRoomClosed({ lifecycleRoomId: roomId, runtimeRoomId, gatewayId: gateway.gatewayId, eventId: 'evt-x' }), false);

    // Requests still open for the room, on this Gateway and another, when it binds.
    const mine = channel.requestMint(gateway.gatewayId, roomId);
    const theirs = channel.requestMint(otherGateway.gatewayId, roomId);
    const { roomId: elsewhere } = await buildingRoom();
    const unrelated = channel.requestMint(otherGateway.gatewayId, elsewhere);
    const bound = boundOutcome(
      await bindFirstBuilderCommand(deps(newWorld(), { ledger: fenced, gateways: fence, rooms: channel }), {
        roomId,
        gatewayId: gateway.gatewayId,
        runtimeRoomId,
        command: builderCommand(),
      }),
    );
    assert.equal(channel.cancelMint(mine.requestId), false, 'withdrawn on the bound Gateway');
    assert.equal(channel.cancelMint(theirs.requestId), false, 'withdrawn on another Gateway');
    assert.equal(channel.cancelMint(unrelated.requestId), true, 'another room\'s request stays open');

    // Bound: occupancy of that runtime room on that Gateway is taken; of any other room it is not.
    const taken = await node.service.roomOccupancy(
      signedOccupancy(node, gateway, epoch, next(), { lifecycleRoomId: roomId, runtimeRoomId, occupancy: 'CLOSED' }),
      TEST_IP,
    );
    assert.deepEqual([taken.status, taken.body['accepted']], [200, true]);
    assert.equal(channel.occupancyOf(gateway.gatewayId, runtimeRoomId)?.occupancy, 'CLOSED');
    const binding = (await ledger!.loadRoom(roomId)).state.binding;
    assert.deepEqual(binding, { lifecycleRoomId: roomId, runtimeRoomId, gatewayId: gateway.gatewayId, eventId: bound.eventId });
    assert.equal(fence.deriveBoundRuntimeRoomClosed(binding), true);

    // A request for the bound room that reaches the channel anyway is withdrawn by the poll, not delivered.
    const stray = channel.requestMint(gateway.gatewayId, roomId);
    const after = await node.service.plannerPoll(signedPoll(node, gateway, epoch, next()), TEST_IP);
    assert.equal(after.status, 200);
    assert.equal(after.body['room'], null);
    assert.equal(channel.cancelMint(stray.requestId), false);
    await assertVerified();
  });
});
