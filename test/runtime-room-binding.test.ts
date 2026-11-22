/**
 * The room binding module (`packages/control-plane/src/runtime-room-binding.ts`)
 * without a database: fakes for the ledger, journal, Gateway and room-channel
 * dependencies, and the real pure reducer deciding the recorded event.
 *
 * What is pinned here, and only here: how every refusal maps to a binding
 * refusal code (`RuntimeRoomBindingRefusedError` codes; the reducer's
 * `binding_exists` as `already_bound` and its other refusals as
 * `ledger_refused`; a unique violation on either of migration 0011's B5
 * indexes as `binding_conflict`; anything else rethrown as itself); the
 * transaction's shape (the event built, then the journaled row naming it,
 * then the binding record bound to that command); the mint request's checks
 * (`requestRuntimeRoomMint`: BUILDING, unbound, Gateway live, nothing written);
 * `approvedPlanHash` over
 * entries with and without a T5 PlanDoc digest; and the leader fence's two
 * derived facts, `deriveBoundRuntimeRoomClosed` (lifecycle ruling C1) and
 * `deriveGatewayEnrolledAndLive` (lifecycle ruling B5). The storage suite,
 * `runtime-room-binding.storage.test.ts`, proves the same paths against the
 * real stores.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import {
  RuntimeRoomBindingRefusedError,
  approvedPlanHash,
  bindFirstBuilderCommand,
  journalLaterBuilderCommand,
  requestRuntimeRoomMint,
  type BindingOutcome,
  type BindingRefusalCode,
  type BuilderCommandRequest,
  type LaterCommandOutcome,
  type MintRequestOutcome,
  type RuntimeRoomBindingDeps,
} from '../packages/control-plane/src/runtime-room-binding.js';
import { RecordedEventRefusedError, RoomNotFoundError, type RecordedAppend } from '../packages/control-plane/src/store.js';
import {
  JournalDuplicateEventError,
  validateJournalCommandBody,
  type BindingInput,
  type JournaledBinding,
  type JournaledAppendResult,
  type JournalTransaction,
  type AppendedRecord,
} from '../packages/control-plane/src/journal-store.js';
import { GatewayRoomAppendFence } from '../packages/control-plane/src/gateway/room-append.js';
import type { RoomOccupancyReading } from '../packages/control-plane/src/gateway/room-channel.js';
import { MIGRATIONS } from '../packages/control-plane/src/migrations.js';
import { BUILDER_COMMAND_KIND, type GovernedCommandRequest } from '../packages/journal/src/index.js';
import type { EventName, EvidenceRef, RuntimeRoomBindingRecord } from '../packages/contracts/src/index.js';
import {
  apply,
  applyAll,
  initialLedger,
  type LedgerEntry,
  type LedgerState,
  type LifecycleEvent,
} from '../packages/ledger/src/index.js';
import { ATTRIBUTION, EVIDENCE, SCOPE, makeEvent } from './helpers.js';

/* ---------------- fixtures ---------------- */

const ROOM = '3c2b1a09-8f7e-4d6c-9b5a-0123456789ab';
const GATEWAY = '5e4d3c2b-1a09-4f8e-8d7c-abcdef012345';
const OTHER_GATEWAY = '7a6b5c4d-3e2f-4a1b-9c0d-112233445566';
const RUNTIME_ROOM = 'room-11111111-2222-4333-8444-555555555555';
const PLAN_HASH = 'f'.repeat(64);
const EVENT_ID = 'evt-bind-unit';
const NOW = new Date('2026-11-18T10:00:00.000Z');
const DISPATCHER = {
  roleId: 'builder',
  actorId: 'control-plane:test/runtime-room-binding-unit',
  actualModel: 'n/a (control-plane act)',
  executionSurface: 'claude-code',
} as const;
/** The client the fake ledger hands its steps: a sentinel, compared by identity. */
const CLIENT = { sentinel: 'fenced-client' } as unknown as PoolClient;

const TO_BUILDING: readonly EventName[] = ['scope.captured', 'task.dispatched.planner', 'plan.submitted', 'plan.approved'];

function plandoc(digest: string): readonly EvidenceRef[] {
  return [{ kind: 'plandoc', ref: 'cmd_plan_fixture', digest }];
}

/** A ledger driven by the real reducer; `t5Evidence` is the T5 entry's evidence. */
function ledgerThrough(names: readonly EventName[], t5Evidence: readonly EvidenceRef[] = plandoc(PLAN_HASH)): LedgerState {
  const { state, results } = applyAll(
    initialLedger(),
    names.map((name) => makeEvent(name, name === 'plan.approved' ? { evidence: t5Evidence } : {})),
  );
  assert.ok(results.every((result) => result.ok), JSON.stringify(results));
  return state;
}

const BUILDING = ledgerThrough(TO_BUILDING);
const BINDING_RECORD: RuntimeRoomBindingRecord = {
  lifecycleRoomId: ROOM,
  runtimeRoomId: RUNTIME_ROOM,
  gatewayId: GATEWAY,
  eventId: 'evt-bound-earlier',
};
const BOUND: LedgerState = { ...BUILDING, binding: BINDING_RECORD, appliedEventIds: [...BUILDING.appliedEventIds, 'evt-bound-earlier'] };

function builderCommand(overrides: Partial<BuilderCommandRequest> = {}): BuilderCommandRequest {
  return {
    commandKind: BUILDER_COMMAND_KIND,
    argv: ['--plan', 'approved'],
    actorId: 'session:test/runtime-room-binding-unit',
    roleId: 'builder',
    authorizationRef: 'HO-20261118-runtime-room-binding-unit',
    repository: 'example-org/example-repo',
    scopeRef: 'scope/runtime-room-binding',
    intendedProvider: 'example-provider',
    intendedModel: 'example-model',
    intendedSurface: 'example-builder-surface',
    commandId: 'cmd_0123456789abcdef01234567',
    ...overrides,
  };
}

/**
 * The ledger store's two entry points, over a fixed state. `appendRecorded`
 * decides with the real reducer and throws what the real store throws;
 * `fail` makes it throw that value instead, before anything is built.
 */
class FakeLedger {
  calls = 0;
  built: LifecycleEvent | null = null;

  constructor(
    private readonly state: LedgerState,
    private readonly options: {
      readonly fail?: unknown;
      readonly notLeader?: boolean;
      readonly committed?: boolean;
      /** Run the locked body, then answer `not_leader` (the commit was lost), or throw this (the commit failed). */
      readonly afterBody?: { readonly lost: true } | { readonly fail: unknown };
    } = {},
  ) {}

  async appendRecorded<T>(
    _roomId: string,
    spec: RecordedAppend<T>,
  ): Promise<
    | { readonly status: 'ok'; readonly value: T; readonly seq: number; readonly event: LifecycleEvent; readonly state: LedgerState }
    | { readonly status: 'not_leader'; readonly committed: boolean }
  > {
    this.calls += 1;
    if ('fail' in this.options) throw this.options.fail;
    if (this.options.notLeader === true) return { status: 'not_leader', committed: this.options.committed ?? false };
    const event = await spec.build(CLIENT, this.state);
    this.built = event;
    const result = apply(this.state, event);
    if (!result.ok) throw new RecordedEventRefusedError(result.code, result.reason);
    if (result.kind !== 'recorded') throw new RecordedEventRefusedError('not_recorded', `${event.event} is not a recorded event here (${result.kind})`);
    const seq = this.state.appliedEventIds.length + 1;
    const value = await spec.afterRecorded(CLIENT, { event, seq, state: result.state });
    return { status: 'ok', value, seq, event, state: result.state };
  }

  async underRoomLock<T>(
    _roomId: string,
    body: (client: PoolClient, current: LedgerState) => Promise<T>,
  ): Promise<{ readonly status: 'ok'; readonly value: T } | { readonly status: 'not_leader'; readonly committed: boolean }> {
    this.calls += 1;
    if ('fail' in this.options) throw this.options.fail;
    if (this.options.notLeader === true) return { status: 'not_leader', committed: this.options.committed ?? false };
    const value = await body(CLIENT, this.state);
    const after = this.options.afterBody;
    if (after !== undefined) {
      if ('fail' in after) throw after.fail;
      return { status: 'not_leader', committed: false };
    }
    return { status: 'ok', value };
  }
}

/** The journal transaction's two appends the binding uses, recorded in call order. */
class FakeJournal {
  readonly calls: string[] = [];
  readonly clients: PoolClient[] = [];
  readonly journaled: Array<{ readonly request: GovernedCommandRequest; readonly binding: JournaledBinding | undefined }> = [];
  readonly bindings: BindingInput[] = [];

  constructor(private readonly options: { readonly failJournaled?: unknown; readonly failBinding?: unknown } = {}) {}

  inTransaction(client: PoolClient): JournalTransaction {
    this.clients.push(client);
    const unexpected = async (): Promise<never> => {
      throw new Error('the binding path uses no other journal append');
    };
    return {
      appendBuilderJournaled: async (request, binding): Promise<JournaledAppendResult> => {
        this.calls.push('appendBuilderJournaled');
        if ('failJournaled' in this.options) throw this.options.failJournaled;
        this.journaled.push({ request, binding });
        return { commandId: request.commandId ?? 'cmd_minted', seq: '41', chainHash: 'a'.repeat(64), envelopeDigest: 'b'.repeat(64) };
      },
      appendBinding: async (binding): Promise<AppendedRecord> => {
        this.calls.push('appendBinding');
        if ('failBinding' in this.options) throw this.options.failBinding;
        this.bindings.push(binding);
        return { recordClass: 'binding', commandId: binding.commandId, eventType: 'runtime_room.bound', seq: '42', chainHash: 'c'.repeat(64) };
      },
      appendJournaled: unexpected,
      commandHistory: unexpected,
      appendCommandEvent: unexpected,
      appendDecision: unexpected,
    };
  }
}

interface Harness {
  readonly deps: RuntimeRoomBindingDeps;
  readonly ledger: FakeLedger;
  readonly journal: FakeJournal;
  readonly gatewayChecks: Array<{ readonly client: PoolClient; readonly gatewayId: string }>;
  readonly mintedQueries: Array<readonly [string, string]>;
  /** Each lifecycle room `cancelMintsFor` was asked to withdraw, in call order. */
  readonly mintsCancelled: string[];
  readonly eventIdsMinted: { count: number };
}

function harness(
  options: {
    readonly state?: LedgerState;
    readonly ledger?: FakeLedger;
    readonly journal?: FakeJournal;
    readonly live?: boolean;
    readonly minted?: Readonly<Record<string, readonly string[]>>;
  } = {},
): Harness {
  const ledger = options.ledger ?? new FakeLedger(options.state ?? BUILDING);
  const journal = options.journal ?? new FakeJournal();
  const minted = options.minted ?? { [`${GATEWAY} ${ROOM}`]: [RUNTIME_ROOM] };
  const gatewayChecks: Harness['gatewayChecks'] = [];
  const mintedQueries: Harness['mintedQueries'] = [];
  const mintsCancelled: string[] = [];
  const eventIdsMinted = { count: 0 };
  const deps: RuntimeRoomBindingDeps = {
    ledger,
    journal,
    gateways: {
      deriveGatewayEnrolledAndLive: async (client, gatewayId) => {
        gatewayChecks.push({ client, gatewayId });
        return options.live ?? true;
      },
    },
    rooms: {
      mintedFor: (gatewayId, lifecycleRoomId) => {
        mintedQueries.push([gatewayId, lifecycleRoomId]);
        return minted[`${gatewayId} ${lifecycleRoomId}`] ?? [];
      },
      cancelMintsFor: (lifecycleRoomId) => {
        mintsCancelled.push(lifecycleRoomId);
        return 0;
      },
    },
    dispatcher: DISPATCHER,
    mintEventId: () => {
      eventIdsMinted.count += 1;
      return EVENT_ID;
    },
    now: () => NOW,
  };
  return { deps, ledger, journal, gatewayChecks, mintedQueries, mintsCancelled, eventIdsMinted };
}

function bind(h: Harness, command: BuilderCommandRequest = builderCommand(), runtimeRoomId = RUNTIME_ROOM): Promise<BindingOutcome> {
  return bindFirstBuilderCommand(h.deps, { roomId: ROOM, gatewayId: GATEWAY, runtimeRoomId, command });
}

function refusedWith(outcome: BindingOutcome | LaterCommandOutcome | MintRequestOutcome, code: BindingRefusalCode): string {
  assert.equal(outcome.kind, 'refused', JSON.stringify(outcome));
  if (outcome.kind !== 'refused') throw new Error('unreachable');
  assert.equal(outcome.code, code, outcome.reason);
  return outcome.reason;
}

function pgError(code: string, constraint?: string): Error {
  return Object.assign(new Error(`pg ${code}`), { code, ...(constraint === undefined ? {} : { constraint }) });
}

const B5_INDEXES = ['build_room_events_one_binding_per_room', 'build_room_events_runtime_room_bound_once'] as const;

/* ---------------- bindFirstBuilderCommand ---------------- */

describe('bindFirstBuilderCommand — the one transaction it asks for (journal ruling B3)', () => {
  it('builds runtime_room.bound from the locked state, then journals the command naming it, then the binding', async () => {
    const h = harness();
    const command = builderCommand();
    const outcome = await bind(h, command);
    assert.deepEqual(outcome, {
      kind: 'bound',
      eventId: EVENT_ID,
      lifecycleSeq: BUILDING.appliedEventIds.length + 1,
      journaled: { commandId: command.commandId, seq: '41', chainHash: 'a'.repeat(64), envelopeDigest: 'b'.repeat(64) },
      binding: { recordClass: 'binding', commandId: command.commandId, eventType: 'runtime_room.bound', seq: '42', chainHash: 'c'.repeat(64) },
    });
    assert.deepEqual(h.ledger.built, {
      eventId: EVENT_ID,
      event: 'runtime_room.bound',
      actor: 'system',
      attribution: DISPATCHER,
      scope: { roomId: ROOM, repo: command.repository, paths: [] },
      evidence: [],
      occurredAt: NOW.toISOString(),
      binding: { lifecycleRoomId: ROOM, runtimeRoomId: RUNTIME_ROOM, gatewayId: GATEWAY },
    });
    assert.notEqual(h.ledger.built?.attribution, DISPATCHER, 'the attribution is a copy');
    assert.deepEqual(h.journal.calls, ['appendBuilderJournaled', 'appendBinding']);
    assert.deepEqual(h.journal.clients, [CLIENT], 'the journal joins the ledger transaction');
    const ref = { roomId: ROOM, eventId: EVENT_ID };
    assert.deepEqual(h.journal.journaled, [{ request: command, binding: { roomId: ROOM, lifecycleEventRef: ref } }]);
    assert.deepEqual(h.journal.bindings, [
      { commandId: command.commandId, lifecycleRoomId: ROOM, runtimeRoomId: RUNTIME_ROOM, gatewayId: GATEWAY, planHash: PLAN_HASH, lifecycleEventRef: ref },
    ]);
    assert.deepEqual(h.gatewayChecks, [{ client: CLIENT, gatewayId: GATEWAY }], 'the Gateway is read on the fenced client');
    assert.deepEqual(h.mintedQueries, [[GATEWAY, ROOM]]);
    assert.equal(h.eventIdsMinted.count, 1);
  });

  it('refuses a request with no command id rather than letting the journal mint one', async () => {
    const h = harness();
    const { commandId: _omitted, ...withoutId } = builderCommand();
    void _omitted;
    refusedWith(await bind(h, withoutId as BuilderCommandRequest), 'not_a_builder_command');
    assert.equal(h.ledger.calls, 0);
  });

  it('answers interrupted, with the fence\'s committed flag, when leadership is lost', async () => {
    for (const committed of [false, true]) {
      const h = harness({ ledger: new FakeLedger(BUILDING, { notLeader: true, committed }) });
      assert.deepEqual(await bind(h), { kind: 'interrupted', committed });
    }
  });
});

describe('bindFirstBuilderCommand — once bound, no Gateway is asked to mint for the room (act B2)', () => {
  it('withdraws every open mint request for the room after the binding commits, once, after the journal writes', async () => {
    const h = harness();
    const order: string[] = [];
    const cancel = h.deps.rooms.cancelMintsFor.bind(h.deps.rooms);
    const deps: RuntimeRoomBindingDeps = {
      ...h.deps,
      rooms: {
        mintedFor: h.deps.rooms.mintedFor.bind(h.deps.rooms),
        cancelMintsFor: (lifecycleRoomId) => {
          order.push(`cancel after ${h.journal.calls.join(',')}`);
          return cancel(lifecycleRoomId);
        },
      },
    };
    const outcome = await bindFirstBuilderCommand(deps, { roomId: ROOM, gatewayId: GATEWAY, runtimeRoomId: RUNTIME_ROOM, command: builderCommand() });
    assert.equal(outcome.kind, 'bound');
    assert.deepEqual(h.mintsCancelled, [ROOM]);
    assert.deepEqual(order, ['cancel after appendBuilderJournaled,appendBinding']);
  });

  it('withdraws them when leadership is lost after the commit, and not when nothing committed', async () => {
    const committed = harness({ ledger: new FakeLedger(BUILDING, { notLeader: true, committed: true }) });
    assert.deepEqual(await bind(committed), { kind: 'interrupted', committed: true });
    assert.deepEqual(committed.mintsCancelled, [ROOM], 'the binding committed: the room is bound');
    const lost = harness({ ledger: new FakeLedger(BUILDING, { notLeader: true, committed: false }) });
    assert.deepEqual(await bind(lost), { kind: 'interrupted', committed: false });
    assert.deepEqual(lost.mintsCancelled, [], 'nothing committed: the room is still unbound');
  });

  it('withdraws nothing on a refusal or a failure', async () => {
    const refusals: Harness[] = [
      harness({ live: false }),
      harness({ minted: {} }),
      harness({ state: BOUND }),
      harness({ state: ledgerThrough(['scope.captured']) }),
    ];
    for (const h of refusals) {
      assert.equal((await bind(h)).kind, 'refused');
      assert.deepEqual(h.mintsCancelled, []);
    }
    const failing = harness({ journal: new FakeJournal({ failBinding: new Error('the third write failed') }) });
    await assert.rejects(bind(failing), /the third write failed/);
    assert.deepEqual(failing.mintsCancelled, []);
  });
});

describe('bindFirstBuilderCommand — refusals raised under the room lock (lifecycle ruling B5)', () => {
  const cases: ReadonlyArray<readonly [string, () => Harness, BindingRefusalCode, RegExp]> = [
    ['a room not in BUILDING', () => harness({ state: ledgerThrough(TO_BUILDING.slice(0, 3)) }), 'not_building', /PLAN_REVIEW, not BUILDING/],
    ['a room already bound', () => harness({ state: BOUND }), 'already_bound', /no rebinding/],
    ['a room whose T5 carries no PlanDoc digest', () => harness({ state: ledgerThrough(TO_BUILDING, EVIDENCE) }), 'no_approved_plan', /no T5 plan/],
    ['a Gateway that is not enrolled and live', () => harness({ live: false }), 'gateway_not_live', /not enrolled and live/],
    ['a runtime room nothing reported minted', () => harness({ minted: {} }), 'runtime_room_not_minted', /not reported this runtime room/],
    [
      'a runtime room minted for another lifecycle room',
      () => harness({ minted: { [`${GATEWAY} 00000000-0000-4000-8000-000000000000`]: [RUNTIME_ROOM] } }),
      'runtime_room_not_minted',
      /minted for this lifecycle room/,
    ],
    [
      'a runtime room minted for this room by another Gateway',
      () => harness({ minted: { [`${OTHER_GATEWAY} ${ROOM}`]: [RUNTIME_ROOM] } }),
      'runtime_room_not_minted',
      /minted for this lifecycle room/,
    ],
  ];
  for (const [label, make, code, reason] of cases) {
    it(`refuses ${label} as ${code}, journaling nothing`, async () => {
      const h = make();
      assert.match(refusedWith(await bind(h), code), reason);
      assert.deepEqual(h.journal.calls, []);
    });
  }

  it('checks the room before it consults the Gateway or the room channel', async () => {
    for (const state of [ledgerThrough(TO_BUILDING.slice(0, 3)), BOUND, ledgerThrough(TO_BUILDING, EVIDENCE)]) {
      const h = harness({ state, live: false, minted: {} });
      await bind(h);
      assert.deepEqual(h.gatewayChecks, []);
      assert.deepEqual(h.mintedQueries, []);
    }
    const offline = harness({ live: false, minted: {} });
    refusedWith(await bind(offline), 'gateway_not_live');
    assert.deepEqual(offline.mintedQueries, [], 'a Gateway that is not live is not asked what it minted');
  });

  it('refuses a command that is not builder.invoke, or not in cmd_, before the ledger is touched', async () => {
    const commands: ReadonlyArray<Partial<BuilderCommandRequest>> = [
      { commandKind: 'planner.invoke' },
      { commandKind: 'Builder.invoke' },
      { commandKind: '' },
      { commandId: 'run_0123456789abcdef01234567' },
      { commandId: 'cmd_' },
      { commandId: 'CMD_0123' },
      { commandId: ' cmd_0123' },
      { commandId: '' },
      { commandId: 42 as unknown as string },
    ];
    for (const overrides of commands) {
      const h = harness();
      const reason = refusedWith(await bind(h, builderCommand(overrides)), 'not_a_builder_command');
      assert.match(reason, /builder\.invoke|cmd_ namespace/);
      assert.equal(h.ledger.calls, 0, JSON.stringify(overrides));
      assert.deepEqual(h.journal.calls, []);
    }
  });
});

describe('bindFirstBuilderCommand — refusals the store and the database raise', () => {
  it('maps the reducer\'s binding_exists to already_bound, keeping its reason', async () => {
    const h = harness({ ledger: new FakeLedger(BUILDING, { fail: new RecordedEventRefusedError('binding_exists', 'already bound by evt-x') }) });
    assert.equal(refusedWith(await bind(h), 'already_bound'), 'already bound by evt-x');
  });

  it('maps every other reducer refusal to ledger_refused, keeping its reason', async () => {
    for (const code of ['state_not_in_from_set', 'binding_invalid', 'attribution_invalid', 'not_recorded'] as const) {
      const h = harness({ ledger: new FakeLedger(BUILDING, { fail: new RecordedEventRefusedError(code, `reason for ${code}`) }) });
      assert.equal(refusedWith(await bind(h), 'ledger_refused'), `reason for ${code}`);
    }
  });

  it('a malformed runtime room id is invalid_request, refused before the room lock is taken', async () => {
    const h = harness({ minted: { [`${GATEWAY} ${ROOM}`]: ['room-1'] } });
    assert.match(refusedWith(await bind(h, builderCommand(), 'room-1'), 'invalid_request'), /runtime room id/);
    assert.equal(h.ledger.calls, 0);
    assert.deepEqual(h.journal.calls, []);
  });

  it('a malformed room id or Gateway id is invalid_request, refused before the room lock is taken', async () => {
    const h = harness();
    const command = builderCommand();
    const badRoom = await bindFirstBuilderCommand(h.deps, { roomId: 'room_1', gatewayId: GATEWAY, runtimeRoomId: RUNTIME_ROOM, command });
    assert.match(refusedWith(badRoom, 'invalid_request'), /room id/);
    const badGateway = await bindFirstBuilderCommand(h.deps, { roomId: ROOM, gatewayId: 'GATEWAY-1', runtimeRoomId: RUNTIME_ROOM, command });
    assert.match(refusedWith(badGateway, 'invalid_request'), /Gateway id/);
    assert.equal(h.ledger.calls, 0);
    assert.deepEqual(h.journal.calls, []);
  });

  for (const index of B5_INDEXES) {
    it(`maps a unique violation on ${index} to binding_conflict, from the lifecycle insert or from the journal step`, async () => {
      const fromLedger = harness({ ledger: new FakeLedger(BUILDING, { fail: pgError('23505', index) }) });
      assert.equal(refusedWith(await bind(fromLedger), 'binding_conflict'), `the database refused the binding (${index})`);
      const fromJournal = harness({ journal: new FakeJournal({ failBinding: pgError('23505', index) }) });
      assert.equal(refusedWith(await bind(fromJournal), 'binding_conflict'), `the database refused the binding (${index})`);
      assert.deepEqual(fromJournal.journal.calls, ['appendBuilderJournaled', 'appendBinding']);
    });
  }

  it('rethrows anything else as itself', async () => {
    const thrown: readonly unknown[] = [
      pgError('23505', 'build_room_events_event_id_unique'),
      pgError('23505', 'command_journal_events_once_per_command'),
      pgError('23505'),
      pgError('23514', B5_INDEXES[0]),
      pgError('23P01', B5_INDEXES[1]),
      new Error('connection terminated'),
      new RoomNotFoundError(ROOM),
      'a bare string',
      null,
    ];
    for (const error of thrown) {
      const h = harness({ ledger: new FakeLedger(BUILDING, { fail: error }) });
      await assert.rejects(bind(h), (caught: unknown) => caught === error, String(error));
    }
    const duplicate = new JournalDuplicateEventError('cmd_0123456789abcdef01234567');
    await assert.rejects(bind(harness({ journal: new FakeJournal({ failJournaled: duplicate }) })), (caught: unknown) => caught === duplicate);
  });

  it('a RuntimeRoomBindingRefusedError thrown from the journal step is a refusal with its own code', async () => {
    const h = harness({ journal: new FakeJournal({ failJournaled: new RuntimeRoomBindingRefusedError('no_approved_plan', 'vanished') }) });
    assert.equal(refusedWith(await bind(h), 'no_approved_plan'), 'vanished');
  });

  it('names the two B5 indexes migration 0011 creates', () => {
    const migration = MIGRATIONS.find((m) => m.id === '0011_phase5_binding');
    assert.ok(migration !== undefined);
    const text = migration.statements.join('\n');
    for (const index of B5_INDEXES) assert.match(text, new RegExp(`CREATE UNIQUE INDEX ${index}\\b`));
  });
});

/* ---------------- journalLaterBuilderCommand ---------------- */

describe('journalLaterBuilderCommand — later Builder commands name the binding (journal ruling B6)', () => {
  function later(h: Harness, command: BuilderCommandRequest = builderCommand()): Promise<LaterCommandOutcome> {
    return journalLaterBuilderCommand(h.deps, { roomId: ROOM, command });
  }

  it('journals the command bound to the room and naming the binding\'s lifecycle entry', async () => {
    const h = harness({ state: BOUND });
    const command = builderCommand({ commandId: 'cmd_later0123456789abcdef0123' });
    const outcome = await later(h, command);
    assert.equal(outcome.kind, 'journaled');
    assert.deepEqual(h.journal.journaled, [
      { request: command, binding: { roomId: ROOM, lifecycleEventRef: { roomId: ROOM, eventId: BINDING_RECORD.eventId } } },
    ]);
    assert.deepEqual(h.journal.calls, ['appendBuilderJournaled']);
    assert.deepEqual(h.journal.clients, [CLIENT]);
    assert.deepEqual(h.gatewayChecks, [], 'a later command re-checks no Gateway');
  });

  it('refuses a room with no binding, or not in BUILDING, journaling nothing', async () => {
    const unbound = harness({ state: BUILDING });
    refusedWith(await later(unbound), 'not_bound');
    assert.deepEqual(unbound.journal.calls, []);
    const reviewing = harness({ state: { ...ledgerThrough(TO_BUILDING.slice(0, 3)), binding: BINDING_RECORD } });
    refusedWith(await later(reviewing), 'not_building');
    assert.deepEqual(reviewing.journal.calls, []);
  });

  it('refuses a command that is not a Builder command before the ledger is touched', async () => {
    const h = harness({ state: BOUND });
    refusedWith(await later(h, builderCommand({ commandKind: 'planner.invoke' })), 'not_a_builder_command');
    refusedWith(await later(h, builderCommand({ commandId: 'run_x' })), 'not_a_builder_command');
    assert.equal(h.ledger.calls, 0);
  });

  it('answers interrupted when leadership is lost, and rethrows a journal failure as itself', async () => {
    for (const committed of [false, true]) {
      const h = harness({ ledger: new FakeLedger(BOUND, { notLeader: true, committed }) });
      assert.deepEqual(await later(h), { kind: 'interrupted', committed });
    }
    const duplicate = new JournalDuplicateEventError('cmd_0123456789abcdef01234567');
    await assert.rejects(later(harness({ state: BOUND, journal: new FakeJournal({ failJournaled: duplicate }) })), (caught: unknown) => caught === duplicate);
  });
});

describe('requestRuntimeRoomMint — the control plane\'s mint request (step-1 act B2, first message)', () => {
  function mintHarness(options: Parameters<typeof harness>[0] & { readonly alreadyOpen?: boolean } = {}): {
    readonly h: Harness;
    readonly requested: Array<readonly [string, string]>;
    readonly cancelled: string[];
    readonly mint: (request?: { readonly roomId: string; readonly gatewayId: string }) => Promise<MintRequestOutcome>;
  } {
    const h = harness(options);
    const requested: Array<readonly [string, string]> = [];
    const cancelled: string[] = [];
    const deps = {
      ledger: h.deps.ledger,
      gateways: h.deps.gateways,
      rooms: {
        requestMint: (gatewayId: string, lifecycleRoomId: string) => {
          requested.push([gatewayId, lifecycleRoomId]);
          return { requestId: 'req-unit-1', created: options.alreadyOpen !== true };
        },
        cancelMint: (requestId: string) => {
          cancelled.push(requestId);
          return true;
        },
      },
    };
    return { h, requested, cancelled, mint: (request = { roomId: ROOM, gatewayId: GATEWAY }) => requestRuntimeRoomMint(deps, request) };
  }

  it('opens the request for an unbound room in BUILDING and a live Gateway, under the room lock, writing nothing', async () => {
    const { h, requested, mint } = mintHarness();
    assert.deepEqual(await mint(), { kind: 'requested', requestId: 'req-unit-1' });
    assert.deepEqual(requested, [[GATEWAY, ROOM]]);
    assert.equal(h.ledger.calls, 1);
    assert.deepEqual(h.gatewayChecks, [{ client: CLIENT, gatewayId: GATEWAY }], 'the Gateway is checked on the locked client');
    assert.deepEqual(h.journal.calls, [], 'a mint request journals nothing');
    assert.equal(h.ledger.built, null, 'a mint request records no lifecycle event');
  });

  it('refuses a room not in BUILDING, a bound room, and a Gateway not enrolled and live, opening no request', async () => {
    const reviewing = mintHarness({ state: ledgerThrough(TO_BUILDING.slice(0, 3)) });
    assert.match(refusedWith(await reviewing.mint(), 'not_building'), /not BUILDING/);
    assert.deepEqual(reviewing.h.gatewayChecks, [], 'the state is checked before the Gateway');
    const bound = mintHarness({ state: BOUND });
    refusedWith(await bound.mint(), 'already_bound');
    assert.deepEqual(bound.h.gatewayChecks, []);
    const offline = mintHarness({ live: false });
    refusedWith(await offline.mint(), 'gateway_not_live');
    for (const { requested } of [reviewing, bound, offline]) assert.deepEqual(requested, []);
  });

  it('a malformed room id or Gateway id is invalid_request, refused before the room lock is taken', async () => {
    const { h, requested, mint } = mintHarness();
    assert.match(refusedWith(await mint({ roomId: 'room_1', gatewayId: GATEWAY }), 'invalid_request'), /room id/);
    assert.match(refusedWith(await mint({ roomId: ROOM, gatewayId: 'GATEWAY-1' }), 'invalid_request'), /Gateway id/);
    assert.equal(h.ledger.calls, 0);
    assert.deepEqual(requested, []);
  });

  it('answers interrupted when leadership is lost, and rethrows anything else as itself', async () => {
    for (const committed of [false, true]) {
      const { mint } = mintHarness({ ledger: new FakeLedger(BUILDING, { notLeader: true, committed }) });
      assert.deepEqual(await mint(), { kind: 'interrupted', committed });
    }
    const missing = new RoomNotFoundError(ROOM);
    const { mint } = mintHarness({ ledger: new FakeLedger(BUILDING, { fail: missing }) });
    await assert.rejects(mint(), (caught: unknown) => caught === missing);
  });

  it('opens the request under the room lock and withdraws it when the transaction does not end as this leader\'s', async () => {
    const lost = mintHarness({ ledger: new FakeLedger(BUILDING, { afterBody: { lost: true } }) });
    assert.deepEqual(await lost.mint(), { kind: 'interrupted', committed: false });
    assert.deepEqual(lost.requested, [[GATEWAY, ROOM]], 'opened inside the locked body, so no binding can commit in between');
    assert.deepEqual(lost.cancelled, ['req-unit-1'], 'withdrawn: no request left for a Gateway to collect');
    const commitFailed = new Error('room lock commit failed: unit');
    const failed = mintHarness({ ledger: new FakeLedger(BUILDING, { afterBody: { fail: commitFailed } }) });
    await assert.rejects(failed.mint(), (caught: unknown) => caught === commitFailed);
    assert.deepEqual(failed.cancelled, ['req-unit-1']);
    const ok = mintHarness();
    await ok.mint();
    assert.deepEqual(ok.cancelled, [], 'a request whose transaction committed stays open');
  });

  it('withdraws only a request it created: one already open for the pair stays open after a lost commit', async () => {
    const { mint, cancelled } = mintHarness({ alreadyOpen: true, ledger: new FakeLedger(BUILDING, { afterBody: { lost: true } }) });
    assert.deepEqual(await mint(), { kind: 'interrupted', committed: false });
    assert.deepEqual(cancelled, []);
  });

  it('withdraws nothing when a check refuses before any request is opened', async () => {
    const { mint, requested, cancelled } = mintHarness({ state: BOUND });
    refusedWith(await mint(), 'already_bound');
    assert.deepEqual(requested, []);
    assert.deepEqual(cancelled, []);
  });
});

/* ---------------- approvedPlanHash ---------------- */

describe('approvedPlanHash — the PlanDoc digest on the latest T5 entry', () => {
  function entry(transition: LedgerEntry['transition'], evidence: readonly EvidenceRef[], seq: number): LedgerEntry {
    return {
      seq,
      eventId: `evt-${transition}-${seq}`,
      event: 'plan.approved',
      transition,
      guard: 'G5',
      actor: 'founder',
      attribution: ATTRIBUTION,
      scope: SCOPE,
      evidence,
      fromState: 'PLAN_REVIEW',
      resultingState: 'BUILDING',
      overlays: [],
      round: 0,
      occurredAt: NOW.toISOString(),
    };
  }
  const state = (...entries: LedgerEntry[]): LedgerState => ({ ...initialLedger(), entries });
  const other = 'e'.repeat(64);

  it('is null when the T5 PlanDoc digest is not a plan hash, so the binding refuses no_approved_plan rather than failing in the encoder', () => {
    assert.equal(approvedPlanHash(state(entry('T5', plandoc('not-a-hash'), 1))), null);
    assert.equal(approvedPlanHash(state(entry('T5', plandoc('A'.repeat(64)), 1))), null);
    assert.equal(approvedPlanHash(state(entry('T5', plandoc('a'.repeat(63)), 1))), null);
  });

  it('is null with no entries, and with no T5 entry even when another entry carries a PlanDoc', () => {
    assert.equal(approvedPlanHash(initialLedger()), null);
    assert.equal(approvedPlanHash(state(entry('T3', plandoc(PLAN_HASH), 1))), null);
  });

  it('is the digest of the T5 entry\'s plandoc evidence, wherever it sits among the evidence', () => {
    assert.equal(approvedPlanHash(state(entry('T5', plandoc(PLAN_HASH), 1))), PLAN_HASH);
    assert.equal(approvedPlanHash(state(entry('T5', [...EVIDENCE, ...plandoc(PLAN_HASH)], 1))), PLAN_HASH);
    assert.equal(approvedPlanHash(BUILDING), PLAN_HASH, 'as the reducer records T5');
  });

  it('is null when the T5 entry carries no plandoc evidence', () => {
    assert.equal(approvedPlanHash(state(entry('T5', EVIDENCE, 1))), null);
    assert.equal(approvedPlanHash(state(entry('T5', [], 1))), null);
    assert.equal(approvedPlanHash(ledgerThrough(TO_BUILDING, EVIDENCE)), null);
  });

  it('reads the LATEST T5 only: a later T5 with another digest wins, and a later T5 without one is null', () => {
    assert.equal(approvedPlanHash(state(entry('T5', plandoc(PLAN_HASH), 1), entry('T5', plandoc(other), 2))), other);
    assert.equal(approvedPlanHash(state(entry('T5', plandoc(PLAN_HASH), 1), entry('T5', EVIDENCE, 2))), null);
    assert.equal(approvedPlanHash(state(entry('T5', plandoc(PLAN_HASH), 1), entry('T8', plandoc(other), 2))), PLAN_HASH);
  });

  it('takes the first plandoc of the entry when it carries two', () => {
    assert.equal(approvedPlanHash(state(entry('T5', [...plandoc(PLAN_HASH), ...plandoc(other)], 1))), PLAN_HASH);
  });
});

/* ---------------- the fence's derived facts ---------------- */

interface FenceFakes {
  readonly trustworthy?: boolean;
  readonly monotonicNow?: number;
  readonly liveness?: Readonly<Record<string, { readonly wallMs: number; readonly monoMs: number }>>;
  readonly occupancy?: (gatewayId: string, runtimeRoomId: string) => RoomOccupancyReading | null;
  readonly withRooms?: boolean;
}

const STALENESS_MS = 30_000;

function fenceWith(fakes: FenceFakes = {}): GatewayRoomAppendFence {
  const readings = fakes.occupancy ?? (() => null);
  return new GatewayRoomAppendFence({
    config: { gatewayStalenessMs: STALENESS_MS } as unknown as ConstructorParameters<typeof GatewayRoomAppendFence>[0]['config'],
    clock: {
      monotonicTrustworthy: fakes.trustworthy ?? true,
      monotonicNow: () => fakes.monotonicNow ?? 100_000,
    } as unknown as ConstructorParameters<typeof GatewayRoomAppendFence>[0]['clock'],
    session: {
      livenessFor: (gatewayId: string) => fakes.liveness?.[gatewayId] ?? null,
    } as unknown as ConstructorParameters<typeof GatewayRoomAppendFence>[0]['session'],
    leadership: {} as unknown as ConstructorParameters<typeof GatewayRoomAppendFence>[0]['leadership'],
    ...(fakes.withRooms === false ? {} : { rooms: { occupancyOf: readings } }),
  });
}

describe('GatewayRoomAppendFence.deriveBoundRuntimeRoomClosed — G17\'s occupancy limb (lifecycle ruling C1)', () => {
  const binding: RuntimeRoomBindingRecord = BINDING_RECORD;
  /** Readings keyed by (Gateway, runtime room), as the room channel keeps them. */
  function channel(readings: Readonly<Record<string, RoomOccupancyReading['occupancy']>>) {
    const asked: Array<readonly [string, string]> = [];
    const occupancy = (gatewayId: string, runtimeRoomId: string): RoomOccupancyReading | null => {
      asked.push([gatewayId, runtimeRoomId]);
      const state = readings[`${gatewayId} ${runtimeRoomId}`];
      return state === undefined ? null : { occupancy: state, receivedAtMono: 1 };
    };
    return { asked, occupancy };
  }

  it('is false for a room with no binding, without reading the channel', () => {
    const { asked, occupancy } = channel({ [`${GATEWAY} ${RUNTIME_ROOM}`]: 'CLOSED' });
    assert.equal(fenceWith({ occupancy }).deriveBoundRuntimeRoomClosed(null), false);
    assert.deepEqual(asked, []);
  });

  it('is false with no room channel at all', () => {
    assert.equal(fenceWith({ withRooms: false }).deriveBoundRuntimeRoomClosed(binding), false);
  });

  it('is false when the binding\'s Gateway has reported nothing for the runtime room', () => {
    const { asked, occupancy } = channel({});
    assert.equal(fenceWith({ occupancy }).deriveBoundRuntimeRoomClosed(binding), false);
    assert.deepEqual(asked, [[GATEWAY, RUNTIME_ROOM]]);
  });

  it('is false when only another Gateway reported the runtime room CLOSED', () => {
    const { asked, occupancy } = channel({ [`${OTHER_GATEWAY} ${RUNTIME_ROOM}`]: 'CLOSED' });
    assert.equal(fenceWith({ occupancy }).deriveBoundRuntimeRoomClosed(binding), false);
    assert.deepEqual(asked, [[GATEWAY, RUNTIME_ROOM]], 'asked of the binding\'s Gateway only');
  });

  it('is false for every occupancy but CLOSED', () => {
    for (const state of ['ABSENT', 'PREPARED', 'OCCUPIED', 'INTERRUPTED'] as const) {
      const { occupancy } = channel({ [`${GATEWAY} ${RUNTIME_ROOM}`]: state });
      assert.equal(fenceWith({ occupancy }).deriveBoundRuntimeRoomClosed(binding), false, state);
    }
  });

  it('is true when the binding\'s own Gateway reported the bound runtime room CLOSED', () => {
    const { occupancy } = channel({ [`${GATEWAY} ${RUNTIME_ROOM}`]: 'CLOSED' });
    assert.equal(fenceWith({ occupancy }).deriveBoundRuntimeRoomClosed(binding), true);
    // Another runtime room of the same Gateway, CLOSED, does not stand in for the bound one.
    const elsewhere = channel({ [`${GATEWAY} room-99999999-9999-4999-8999-999999999999`]: 'CLOSED' });
    assert.equal(fenceWith({ occupancy: elsewhere.occupancy }).deriveBoundRuntimeRoomClosed(binding), false);
  });
});

describe('GatewayRoomAppendFence.deriveGatewayEnrolledAndLive — the binding\'s Gateway check (lifecycle ruling B5)', () => {
  function client(rows: ReadonlyArray<{ gateway_id: string }>): { client: PoolClient; queries: Array<{ text: string; values: unknown[] }> } {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const fake = {
      query: async (text: string, values: unknown[]) => {
        queries.push({ text, values });
        return { rows };
      },
    };
    return { client: fake as unknown as PoolClient, queries };
  }
  const enrolled = [{ gateway_id: GATEWAY }];
  const fresh = { [GATEWAY]: { wallMs: 0, monoMs: 100_000 - STALENESS_MS } };

  it('reads the named Gateway\'s enrolled row on the caller\'s client', async () => {
    const { client: c, queries } = client(enrolled);
    assert.equal(await fenceWith({ liveness: fresh }).deriveGatewayEnrolledAndLive(c, GATEWAY), true);
    assert.equal(queries.length, 1);
    assert.match(queries[0]!.text, /FROM gateway_current_state WHERE gateway_id = \$1::uuid AND enrollment_slot IS NOT NULL/);
    assert.deepEqual(queries[0]!.values, [GATEWAY]);
  });

  it('is false for a Gateway with no enrolled row, whatever its liveness', async () => {
    assert.equal(await fenceWith({ liveness: fresh }).deriveGatewayEnrolledAndLive(client([]).client, GATEWAY), false);
  });

  it('is false when the monotonic clock is not trustworthy', async () => {
    assert.equal(await fenceWith({ liveness: fresh, trustworthy: false }).deriveGatewayEnrolledAndLive(client(enrolled).client, GATEWAY), false);
  });

  it('is false with no liveness for that Gateway, even when another Gateway is live', async () => {
    const othersOnly = { [OTHER_GATEWAY]: { wallMs: 0, monoMs: 100_000 } };
    assert.equal(await fenceWith({ liveness: othersOnly }).deriveGatewayEnrolledAndLive(client(enrolled).client, GATEWAY), false);
  });

  it('is false once the liveness is older than the staleness window, and true up to it', async () => {
    const stale = { [GATEWAY]: { wallMs: 0, monoMs: 100_000 - STALENESS_MS - 1 } };
    assert.equal(await fenceWith({ liveness: stale }).deriveGatewayEnrolledAndLive(client(enrolled).client, GATEWAY), false);
    assert.equal(await fenceWith({ liveness: fresh }).deriveGatewayEnrolledAndLive(client(enrolled).client, GATEWAY), true);
  });
});

/* ---------------- the generic route ---------------- */

describe('the generic journal route carries no Builder command (journal ruling B6)', () => {
  it('validateJournalCommandBody refuses builder.invoke, and accepts the same body under another kind', () => {
    const body = {
      commandKind: BUILDER_COMMAND_KIND,
      argv: ['--plan', 'approved'],
      actorId: 'session:test/runtime-room-binding-unit',
      roleId: 'builder',
      authorizationRef: 'HO-20261118-runtime-room-binding-unit',
      repository: 'example-org/example-repo',
      scopeRef: 'scope/runtime-room-binding',
      intendedProvider: 'example-provider',
      intendedModel: 'example-model',
      intendedSurface: 'example-builder-surface',
    };
    const refused = validateJournalCommandBody(body);
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.match(refused.reason, /builder\.invoke is journaled only through the governed Builder path/);
    assert.equal(validateJournalCommandBody({ ...body, commandKind: 'example.invoke' }).ok, true);
  });
});
