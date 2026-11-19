/**
 * `runtime_room.bound` in the pure ledger, and G17 as amended.
 *
 * Source: `DEC-20260815-11` v0.12, row 30 and T17's amended guard, both from
 * `FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING`:
 *
 *  - B1: the event is recorded by `system` in `BUILDING`, triggers no
 *    transition and leaves the room in `BUILDING`.
 *  - B2: its payload is exactly three ids — lifecycle room, runtime room,
 *    Gateway — and no other field.
 *  - B4: at most one binding per lifecycle room, ever; a second is refused and
 *    writes nothing.
 *  - B6: replaying it creates no second binding.
 *  - C1: T17 needs evidence verified (or a founder waiver) AND the bound
 *    runtime room's occupancy CLOSED; a room with no binding cannot take T17.
 *
 * Every acceptance and refusal path of the reducer's recorded branch is
 * driven here, as are G17's four combinations of its two limbs.
 *
 * D1: "the rejection vocabulary ... stand[s]". A refused binding is not a
 * rejection: its kind is `binding_refused`, its code is outside
 * `RejectionCode`, and the store writes nothing for it (B4). The vocabulary
 * is pinned at compile time to the seven codes it had before this event.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTORS,
  EVENTS,
  GUARDS,
  RUNTIME_ROOM_BINDING_FIELDS,
  isCanonicalUuid,
  isRuntimeRoomBinding,
  isRuntimeRoomId,
  recordedEventSpec,
  runtimeRoomBindingDefect,
  type EventName,
  type GuardFacts,
  type State,
} from '../packages/contracts/src/index.js';
import {
  acceptedPairs,
  apply,
  applyAll,
  initialLedger,
  snapshot,
  type ApplyResult,
  type BindingRefusalCode,
  type LedgerState,
  type LifecycleEvent,
  type RejectionCode,
} from '../packages/ledger/src/index.js';
import { BINDING, BINDING_RECORD, PERMISSIVE_FACTS, ledgerAt, makeEvent } from './helpers.js';

/** The rejection vocabulary, as it stood before runtime_room.bound (D1 keeps it). */
const REJECTION_VOCABULARY = [
  'unknown_event',
  'terminal_state',
  'actor_not_authorized',
  'state_not_in_from_set',
  'attribution_invalid',
  'guard_failed',
  'no_prior_state',
] as const satisfies readonly RejectionCode[];
// Fails to compile if RejectionCode gains a code the list lacks.
const VOCABULARY_IS_CLOSED: Exclude<RejectionCode, (typeof REJECTION_VOCABULARY)[number]> extends never ? true : false = true;

const BINDING_REFUSALS: readonly string[] = ['binding_invalid', 'binding_exists'] satisfies readonly BindingRefusalCode[];

/**
 * A refusal of either kind. A binding code must come as `binding_refused`,
 * never as a rejection; every other code as `rejected`.
 */
function rejected(result: ApplyResult): { code: string; reason: string } {
  assert.equal(result.ok, false, `expected a refusal, got ${result.ok ? result.kind : ''}`);
  if (result.ok) throw new Error('unreachable');
  assert.equal(result.kind, BINDING_REFUSALS.includes(result.code) ? 'binding_refused' : 'rejected', result.code);
  return { code: result.code, reason: result.reason };
}

describe('runtime_room.bound · the rejection vocabulary stands (D1)', () => {
  it('keeps the seven rejection codes; a refused binding is its own kind, never a rejection', () => {
    assert.equal(VOCABULARY_IS_CLOSED, true);
    for (const code of BINDING_REFUSALS) {
      assert.equal((REJECTION_VOCABULARY as readonly string[]).includes(code), false, code);
    }
    const refused = apply(ledgerAt('BUILDING'), makeEvent('decision.requested', { binding: BINDING }));
    assert.ok(!refused.ok && refused.kind === 'binding_refused' && refused.code === 'binding_invalid');
  });
});

function recorded(result: ApplyResult): LedgerState {
  assert.ok(result.ok && result.kind === 'recorded', `expected recorded, got ${JSON.stringify(result)}`);
  return result.state;
}

/** The plan path to BUILDING, as the table's permissive facts allow. */
const TO_BUILDING: readonly EventName[] = [
  'scope.captured',
  'task.dispatched.planner',
  'plan.submitted',
  'plan.approved',
];

/** From BUILDING (unbound) on to MERGE_CONFIRMED, every step under PERMISSIVE_FACTS. */
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

describe('contracts — runtime room binding formats', () => {
  it('accepts exactly a canonical lowercase UUID', () => {
    assert.equal(isCanonicalUuid('11111111-1111-4111-8111-111111111111'), true);
    for (const bad of [
      '11111111-1111-4111-8111-11111111111A',
      'AAAAAAAA-1111-4111-8111-111111111111',
      '{11111111-1111-4111-8111-111111111111}',
      '11111111111141118111111111111111',
      '11111111-1111-4111-8111-111111111111 ',
      ' 11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111\n',
      '11111111-1111-4111-8111-1111111111111',
      '1111111-11111-4111-8111-111111111111',
      'g1111111-1111-4111-8111-111111111111',
      '',
    ]) {
      assert.equal(isCanonicalUuid(bad), false, JSON.stringify(bad));
    }
    for (const notString of [null, undefined, 1, {}, []]) {
      assert.equal(isCanonicalUuid(notString), false);
    }
  });

  it('accepts exactly room- and a canonical lowercase UUID as a runtime room id', () => {
    assert.equal(isRuntimeRoomId('room-22222222-2222-4222-8222-222222222222'), true);
    for (const bad of [
      '22222222-2222-4222-8222-222222222222',
      'Room-22222222-2222-4222-8222-222222222222',
      'room-22222222-2222-4222-8222-22222222222F',
      'room_22222222-2222-4222-8222-222222222222',
      'room--22222222-2222-4222-8222-222222222222',
      'room-22222222-2222-4222-8222-222222222222\n',
      'xroom-22222222-2222-4222-8222-222222222222',
      'room-1',
      'room-',
      '',
    ]) {
      assert.equal(isRuntimeRoomId(bad), false, JSON.stringify(bad));
    }
    assert.equal(isRuntimeRoomId(42), false);
  });

  it('names the binding fields the ruling names, and no other', () => {
    assert.deepEqual([...RUNTIME_ROOM_BINDING_FIELDS], ['lifecycleRoomId', 'runtimeRoomId', 'gatewayId']);
    assert.equal(runtimeRoomBindingDefect(BINDING), null);
    assert.equal(isRuntimeRoomBinding(BINDING), true);
  });
});

describe('ledger — runtime_room.bound is recorded, not transitioned', () => {
  it('records the binding in BUILDING without moving the room or creating an entry', () => {
    const current = ledgerAt('BUILDING');
    const event = makeEvent('runtime_room.bound');
    const result = apply(current, event);

    assert.ok(result.ok && result.kind === 'recorded');
    if (!(result.ok && result.kind === 'recorded')) return;
    assert.equal(result.event, 'runtime_room.bound');
    assert.equal(result.eventId, event.eventId);
    assert.equal(result.state.state, 'BUILDING');
    assert.deepEqual(result.state.entries, current.entries);
    assert.deepEqual(result.state.binding, { ...BINDING, eventId: event.eventId });
    assert.deepEqual(result.state.appliedEventIds, [...current.appliedEventIds, event.eventId]);
    // Nothing else changed: no transition ran.
    assert.deepEqual(
      { ...result.state, binding: null, appliedEventIds: current.appliedEventIds },
      current,
    );
    assert.deepEqual(snapshot(result.state).binding, { ...BINDING, eventId: event.eventId });
  });

  it('keeps only the three ids it was given, plus the event id', () => {
    const state = recorded(apply(ledgerAt('BUILDING'), makeEvent('runtime_room.bound', { eventId: 'evt-bind-keys' })));
    assert.deepEqual(Object.keys(state.binding ?? {}).sort(), ['eventId', 'gatewayId', 'lifecycleRoomId', 'runtimeRoomId']);
  });

  it('starts every ledger unbound', () => {
    assert.equal(initialLedger().binding, null);
    assert.equal(snapshot(initialLedger()).binding, null);
  });

  it('replays a known event id as a no-op, creating no second binding (INV-4, B6)', () => {
    const event = makeEvent('runtime_room.bound');
    const bound = recorded(apply(ledgerAt('BUILDING'), event));

    const again = apply(bound, event);
    assert.ok(again.ok && again.kind === 'replay');
    if (again.ok && again.kind === 'replay') {
      assert.equal(again.state, bound);
      assert.equal(again.entry, null);
    }

    // Identity decides a replay, not content: a different payload under the
    // same id is still that event, and the binding does not move.
    const altered = apply(bound, {
      ...event,
      binding: { ...BINDING, runtimeRoomId: 'room-44444444-4444-4444-8444-444444444444' },
    });
    assert.ok(altered.ok && altered.kind === 'replay');
    if (altered.ok) assert.deepEqual(altered.state.binding, { ...BINDING, eventId: event.eventId });
  });

  it('refuses a second binding for the room, whatever it names (B4: no rebinding)', () => {
    const bound = recorded(apply(ledgerAt('BUILDING'), makeEvent('runtime_room.bound', { eventId: 'evt-first-bind' })));
    for (const binding of [
      BINDING,
      { ...BINDING, runtimeRoomId: 'room-55555555-5555-4555-8555-555555555555' },
      { ...BINDING, gatewayId: '66666666-6666-4666-8666-666666666666' },
    ]) {
      const result = apply(bound, makeEvent('runtime_room.bound', { binding }));
      const { code, reason } = rejected(result);
      assert.equal(code, 'binding_exists');
      assert.match(reason, /evt-first-bind/);
      assert.match(reason, /no rebinding/);
    }
  });

  it('carries the binding through every later transition, cancellation included', () => {
    const start = recorded(apply(ledgerAt('BUILDING'), makeEvent('runtime_room.bound')));
    const binding = start.binding;
    assert.ok(binding);

    const steps = applyAll(start, [
      makeEvent('decision.requested'),
      makeEvent('decision.answered'),
      makeEvent('recon.opened'),
      makeEvent('recon.resumed'),
      makeEvent('founder.cancel'),
    ]);
    assert.ok(steps.results.every((r) => r.ok && r.kind === 'transition'), JSON.stringify(steps.results));
    assert.equal(steps.state.state, 'CLOSED_ABANDONED');
    assert.deepEqual(steps.state.binding, binding);
  });
});

describe('ledger — runtime_room.bound refusals', () => {
  it('refuses every actor but system', () => {
    for (const actor of ACTORS) {
      if (actor === 'system') continue;
      const { code, reason } = rejected(apply(ledgerAt('BUILDING'), makeEvent('runtime_room.bound', { actor })));
      assert.equal(code, 'actor_not_authorized');
      assert.match(reason, /raised by system/);
    }
  });

  it('refuses it outside BUILDING as state_not_in_from_set, and from a terminal state as terminal_state', () => {
    const others: readonly State[] = ['ROOM_CREATED', 'PLAN_REVIEW', 'BLOCKED_ON_FOUNDER', 'EVIDENCE_CAPTURE', 'RECONCILING'];
    for (const state of others) {
      const { code, reason } = rejected(apply(ledgerAt(state), makeEvent('runtime_room.bound')));
      assert.equal(code, 'state_not_in_from_set');
      assert.match(reason, /recorded only in BUILDING/);
    }
    assert.equal(rejected(apply(ledgerAt('CLOSED_ABANDONED'), makeEvent('runtime_room.bound'))).code, 'terminal_state');
  });

  it('refuses an attribution block that is not shape-valid', () => {
    const result = apply(
      ledgerAt('BUILDING'),
      makeEvent('runtime_room.bound', {
        attribution: { roleId: null, actorId: 'session:someone', actualModel: 'm', executionSurface: 'claude-code' },
      }),
    );
    assert.equal(rejected(result).code, 'attribution_invalid');
  });

  it('refuses it without a binding member', () => {
    const { code, reason } = rejected(apply(ledgerAt('BUILDING'), makeEvent('runtime_room.bound', { binding: undefined })));
    assert.equal(code, 'binding_invalid');
    assert.match(reason, /carries no binding/);
  });

  it('refuses every malformed binding, naming the defect', () => {
    const cases: ReadonlyArray<readonly [string, unknown, RegExp]> = [
      ['null', null, /not an object/],
      ['an array', [BINDING.lifecycleRoomId, BINDING.runtimeRoomId, BINDING.gatewayId], /not an object/],
      ['a string', JSON.stringify(BINDING), /not an object/],
      ['an extra field', { ...BINDING, planHash: 'f'.repeat(64) }, /field the ruling does not name: planHash/],
      ['snake_case names', { lifecycle_room_id: BINDING.lifecycleRoomId, runtime_room_id: BINDING.runtimeRoomId, gateway_id: BINDING.gatewayId }, /does not name/],
      ['no lifecycleRoomId', { runtimeRoomId: BINDING.runtimeRoomId, gatewayId: BINDING.gatewayId }, /lifecycleRoomId is missing/],
      ['no runtimeRoomId', { lifecycleRoomId: BINDING.lifecycleRoomId, gatewayId: BINDING.gatewayId }, /runtimeRoomId is missing/],
      ['no gatewayId', { lifecycleRoomId: BINDING.lifecycleRoomId, runtimeRoomId: BINDING.runtimeRoomId }, /gatewayId is missing/],
      ['an uppercase lifecycle room id', { ...BINDING, lifecycleRoomId: BINDING.lifecycleRoomId.toUpperCase() }, /lifecycleRoomId is not/],
      ['a room- lifecycle room id', { ...BINDING, lifecycleRoomId: `room-${BINDING.lifecycleRoomId}` }, /lifecycleRoomId is not/],
      ['a bare-UUID runtime room id', { ...BINDING, runtimeRoomId: BINDING.runtimeRoomId.slice('room-'.length) }, /runtimeRoomId is not/],
      ['an uppercase runtime room id', { ...BINDING, runtimeRoomId: BINDING.runtimeRoomId.toUpperCase() }, /runtimeRoomId is not/],
      ['a padded gateway id', { ...BINDING, gatewayId: ` ${BINDING.gatewayId}` }, /gatewayId is not/],
      ['a numeric gateway id', { ...BINDING, gatewayId: 3 }, /gatewayId is not/],
      ['an empty id', { ...BINDING, runtimeRoomId: '' }, /runtimeRoomId is not/],
    ];
    for (const [label, binding, pattern] of cases) {
      assert.notDeepEqual(binding, BINDING, `${label}: the case is not actually malformed`);
      const current = ledgerAt('BUILDING');
      const result = apply(current, makeEvent('runtime_room.bound', { binding: binding as LifecycleEvent['binding'] }));
      const { code, reason } = rejected(result);
      assert.equal(code, 'binding_invalid', label);
      assert.match(reason, pattern, label);
    }
  });

  it('checks well-formedness before the existing binding, and the state before either', () => {
    const bound = recorded(apply(ledgerAt('BUILDING'), makeEvent('runtime_room.bound')));
    const malformed = { ...BINDING, gatewayId: 'not-a-uuid' };
    assert.equal(rejected(apply(bound, makeEvent('runtime_room.bound', { binding: malformed }))).code, 'binding_invalid');
    assert.equal(
      rejected(apply(ledgerAt('PLANNING'), makeEvent('runtime_room.bound', { binding: undefined }))).code,
      'state_not_in_from_set',
    );
  });

  it('refuses a binding member on every other event, from a state that event is accepted in', () => {
    const accepted = [...acceptedPairs()];
    const others = EVENTS.filter((event) => recordedEventSpec(event) === null);
    assert.equal(others.length, 29);
    for (const event of others) {
      const pair = accepted.find((key) => key.endsWith(`|${event}`));
      assert.ok(pair, `${event} has no accepted state`);
      const state = pair.slice(0, pair.indexOf('|')) as State;
      // Without the member it is accepted; with it, refused.
      const plain = apply(ledgerAt(state), makeEvent(event));
      assert.ok(plain.ok && plain.kind !== 'replay', `${state}|${event} not accepted without a binding`);
      for (const binding of [BINDING, null]) {
        const result = apply(ledgerAt(state), makeEvent(event, { binding: binding as LifecycleEvent['binding'] }));
        const { code, reason } = rejected(result);
        assert.equal(code, 'binding_invalid', `${state}|${event}`);
        assert.match(reason, /only runtime_room\.bound may/);
      }
    }
  });
});

describe('ledger — a full build path with the binding', () => {
  const closedFacts: GuardFacts = PERMISSIVE_FACTS;

  it('binds in BUILDING, keeps building, and closes delivered only once bound and CLOSED', () => {
    const toBuilding = applyAll(initialLedger(), TO_BUILDING.map((name) => makeEvent(name)));
    assert.equal(toBuilding.state.state, 'BUILDING');

    const bind = makeEvent('runtime_room.bound');
    const log: LifecycleEvent[] = [
      ...TO_BUILDING.map((name) => makeEvent(name)),
      bind,
      makeEvent('decision.requested'),
      makeEvent('decision.answered'),
      ...BUILDING_TO_MERGE_CONFIRMED.map((name) => makeEvent(name)),
      makeEvent('build.closed', { facts: closedFacts }),
    ];
    const { state, results } = applyAll(initialLedger(), log);
    assert.ok(results.every((r) => r.ok), JSON.stringify(results.filter((r) => !r.ok)));
    assert.equal(results.length, log.length);
    assert.equal(results.filter((r) => r.ok && r.kind === 'recorded').length, 1);
    assert.equal(state.state, 'CLOSED_DELIVERED');
    assert.deepEqual(state.binding, { ...BINDING, eventId: bind.eventId });
    // The recorded event is in the applied ids but has no entry.
    assert.ok(state.appliedEventIds.includes(bind.eventId));
    assert.equal(state.entries.find((e) => e.eventId === bind.eventId), undefined);

    // Replaying the stored log from genesis reproduces the state (B6).
    const rebuilt = applyAll(initialLedger(), log);
    assert.deepEqual(rebuilt.state, state);
  });

  it('refuses T17 on the same path when nothing was ever bound', () => {
    const log: LifecycleEvent[] = [
      ...TO_BUILDING.map((name) => makeEvent(name)),
      ...BUILDING_TO_MERGE_CONFIRMED.map((name) => makeEvent(name)),
    ];
    const atMerge = applyAll(initialLedger(), log);
    assert.equal(atMerge.state.state, 'MERGE_CONFIRMED');
    assert.equal(atMerge.state.binding, null);
    const { code, reason } = rejected(apply(atMerge.state, makeEvent('build.closed', { facts: closedFacts })));
    assert.equal(code, 'guard_failed');
    assert.match(reason, /^G17 \(T17\): no runtime room binding/);
  });

  it('stops applyAll at a second binding and keeps the first', () => {
    const first = makeEvent('runtime_room.bound');
    const second = makeEvent('runtime_room.bound', {
      binding: { ...BINDING, runtimeRoomId: 'room-77777777-7777-4777-8777-777777777777' },
    });
    const { state, results } = applyAll(initialLedger(), [
      ...TO_BUILDING.map((name) => makeEvent(name)),
      first,
      second,
      makeEvent('decision.requested'),
    ]);
    assert.equal(results.length, TO_BUILDING.length + 2);
    const last = results.at(-1);
    assert.ok(last && !last.ok && last.code === 'binding_exists');
    assert.equal(state.state, 'BUILDING');
    assert.deepEqual(state.binding, { ...BINDING, eventId: first.eventId });
  });
});

describe('G17 — evidence or waiver, AND the bound runtime room CLOSED', () => {
  const at = ledgerAt('MERGE_CONFIRMED');
  const evidenceOk: GuardFacts = { allEvidenceVerified: true, founderWaivers: false };
  const evidenceMissing: GuardFacts = { allEvidenceVerified: false, founderWaivers: false };

  function close(facts: GuardFacts, state: LedgerState = at): ApplyResult {
    return apply(state, makeEvent('build.closed', { facts }));
  }

  it('is in force on a bound room at MERGE_CONFIRMED', () => {
    assert.deepEqual(at.binding, BINDING_RECORD);
  });

  it('passes with evidence verified and the room CLOSED', () => {
    const result = close({ ...evidenceOk, boundRuntimeRoomClosed: true });
    assert.ok(result.ok && result.kind === 'transition');
    if (result.ok && result.kind === 'transition') {
      assert.equal(result.entry.transition, 'T17');
      assert.equal(result.state.state, 'CLOSED_DELIVERED');
    }
  });

  it('passes with a founder waiver in place of evidence and the room CLOSED', () => {
    const result = close({ allEvidenceVerified: false, founderWaivers: true, boundRuntimeRoomClosed: true });
    assert.ok(result.ok && result.kind === 'transition');
  });

  it('fails with evidence verified but the room not reported CLOSED', () => {
    for (const closed of [false, undefined]) {
      const { code, reason } = rejected(close({ ...evidenceOk, boundRuntimeRoomClosed: closed }));
      assert.equal(code, 'guard_failed');
      assert.match(reason, /^G17 \(T17\): the bound runtime room is not reported CLOSED/);
    }
  });

  it('fails with the room CLOSED but evidence incomplete and no waiver', () => {
    const { code, reason } = rejected(close({ ...evidenceMissing, boundRuntimeRoomClosed: true }));
    assert.equal(code, 'guard_failed');
    assert.match(reason, /^G17 \(T17\): evidence incomplete and no founder waiver/);
  });

  it('fails with neither limb, on the evidence limb first', () => {
    const { code, reason } = rejected(close({ ...evidenceMissing, boundRuntimeRoomClosed: false }));
    assert.equal(code, 'guard_failed');
    assert.match(reason, /^G17 \(T17\): evidence incomplete and no founder waiver/);
  });

  it('fails on a room with no binding even when the caller asserts CLOSED (C1)', () => {
    const { code, reason } = rejected(close({ ...evidenceOk, boundRuntimeRoomClosed: true }, ledgerAt('MERGE_CONFIRMED', { binding: null })));
    assert.equal(code, 'guard_failed');
    assert.match(reason, /^G17 \(T17\): no runtime room binding/);
  });

  it('decides the same way when called directly over a snapshot', () => {
    const s = snapshot(at);
    assert.deepEqual(GUARDS.G17(s, { ...evidenceOk, boundRuntimeRoomClosed: true }), { ok: true });
    assert.equal(GUARDS.G17(s, { ...evidenceOk }).ok, false);
    assert.equal(GUARDS.G17(s, { boundRuntimeRoomClosed: true }).ok, false);
    assert.equal(GUARDS.G17({ ...s, binding: null }, { ...evidenceOk, boundRuntimeRoomClosed: true }).ok, false);
  });
});
