/**
 * AC#1 — Every state, event, transition, and guard is represented:
 * 17 states, 30 events, T1-T22, G1-G22. A test fails if code and spec diverge.
 *
 * The counts come from `SPEC`, which transcribes the DECISION'S PROSE. Asserting
 * the arrays against those numbers is what makes divergence a failure; deriving
 * the numbers from the arrays would assert nothing.
 *
 * `DEC-20260815-11` v0.12 (`FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING`)
 * added event 30, `runtime_room.bound`, which triggers no transition, and
 * amended T17's guard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENTS,
  EVENT_TABLE,
  GUARDS,
  GUARD_IDS,
  NON_TERMINAL_STATES,
  OVERLAY_FLAGS,
  RECORDED_EVENTS,
  SPEC,
  STATES,
  TERMINAL_STATES,
  TRANSITIONS,
  TRANSITION_IDS,
  eventSpec,
  ordinal,
  range,
  recordedEventSpec,
} from '../packages/contracts/src/index.js';

describe('AC#1 — spec conformance', () => {
  it('implements DEC-20260815-11 v0.12', () => {
    assert.equal(SPEC.decision, 'DEC-20260815-11');
    assert.equal(SPEC.version, '0.12');
  });

  it('declares exactly 17 states, all distinct', () => {
    assert.equal(STATES.length, SPEC.stateCount);
    assert.equal(new Set(STATES).size, SPEC.stateCount);
  });

  it('declares exactly 30 events, all distinct', () => {
    assert.equal(SPEC.eventCount, 30);
    assert.equal(EVENTS.length, SPEC.eventCount);
    assert.equal(new Set(EVENTS).size, SPEC.eventCount);
  });

  it('declares runtime_room.bound as event 30, raised by system, with no transition', () => {
    assert.equal(EVENTS.indexOf('runtime_room.bound'), 29);
    assert.deepEqual(eventSpec('runtime_room.bound'), {
      event: 'runtime_room.bound',
      transition: null,
      actor: 'system',
    });
    // "recorded in BUILDING and leaves the room in BUILDING" (B1).
    assert.deepEqual(recordedEventSpec('runtime_room.bound'), {
      event: 'runtime_room.bound',
      recordedIn: 'BUILDING',
    });
    for (const spec of TRANSITIONS) {
      assert.ok(!spec.triggers.includes('runtime_room.bound'), `${spec.id} lists runtime_room.bound as a trigger`);
    }
  });

  it('maps exactly one event to no transition, and every such event is a recorded event', () => {
    const untransitioned = EVENT_TABLE.filter((row) => row.transition === null).map((row) => row.event);
    assert.deepEqual(untransitioned, ['runtime_room.bound']);
    assert.deepEqual(RECORDED_EVENTS.map((row) => row.event), untransitioned);
    for (const event of EVENTS) {
      assert.equal(
        recordedEventSpec(event) !== null,
        eventSpec(event).transition === null,
        `${event}: recorded-event row and null transition disagree`,
      );
    }
  });

  it('declares exactly 4 overlay flags, including the Founder-ruled manual_required', () => {
    assert.equal(OVERLAY_FLAGS.length, SPEC.overlayFlagCount);
    assert.ok(OVERLAY_FLAGS.includes('manual_required'));
  });

  it('declares exactly 22 transitions with contiguous identifiers T1..T22', () => {
    assert.equal(TRANSITIONS.length, SPEC.transitionCount);
    const expected = Array.from({ length: SPEC.transitionCount }, (_, i) => `T${i + 1}`);
    assert.deepEqual([...TRANSITION_IDS], expected);
    assert.deepEqual(TRANSITIONS.map((t) => t.id), expected);
  });

  it('declares exactly 22 guards, G1..G22, each implemented', () => {
    assert.equal(GUARD_IDS.length, SPEC.guardCount);
    const expected = Array.from({ length: SPEC.guardCount }, (_, i) => `G${i + 1}`);
    assert.deepEqual([...GUARD_IDS], expected);
    for (const id of GUARD_IDS) {
      assert.equal(typeof GUARDS[id], 'function', `guard ${id} is not implemented`);
    }
  });

  it('pairs guards to transitions positionally — Gn guards Tn', () => {
    for (const spec of TRANSITIONS) {
      assert.equal(spec.guard, spec.id.replace(/^T/, 'G'), `${spec.id} is not guarded by its positional guard`);
    }
  });

  it('has exactly 2 terminal states and 15 non-terminal', () => {
    assert.equal(TERMINAL_STATES.length, SPEC.terminalStateCount);
    assert.equal(NON_TERMINAL_STATES.length, SPEC.stateCount - SPEC.terminalStateCount);
    assert.deepEqual([...TERMINAL_STATES], ['CLOSED_DELIVERED', 'CLOSED_ABANDONED']);
  });

  it('maps every event to at most one transition, and every transition is reachable', () => {
    assert.equal(EVENT_TABLE.length, SPEC.eventCount);
    for (const event of EVENTS) {
      assert.ok(eventSpec(event), `${event} has no event-table row`);
    }
    // The transitions reached by the 29 events that trigger one: all 22.
    const triggered = new Set(
      EVENT_TABLE.filter((row) => row.transition !== null).map((row) => row.transition),
    );
    assert.equal(triggered.size, SPEC.transitionCount, 'some transition has no triggering event');
    assert.equal(triggered.size, 22);
    assert.deepEqual([...triggered].sort(), [...TRANSITION_IDS].sort());
  });

  it("every transition's triggers agree with the event table", () => {
    for (const spec of TRANSITIONS) {
      for (const trigger of spec.triggers) {
        assert.equal(
          eventSpec(trigger).transition,
          spec.id,
          `${trigger} is listed under ${spec.id} but the event table maps it elsewhere`,
        );
      }
      const fromTable = EVENT_TABLE.filter((r) => r.transition === spec.id).map((r) => r.event);
      assert.deepEqual([...spec.triggers].sort(), fromTable.sort(), `${spec.id} trigger set mismatch`);
    }
  });

  it('references every one of the 17 states in the table, with no orphan', () => {
    const referenced = new Set<string>();
    for (const spec of TRANSITIONS) {
      spec.from.forEach((s) => referenced.add(s));
      if (spec.target.kind === 'state') {
        referenced.add(spec.target.state);
      }
    }
    // T20's target is dynamic (prior_state) and adds no static state reference.
    for (const state of STATES) {
      assert.ok(referenced.has(state), `${state} is an orphan — no transition references it`);
    }
  });

  it('keeps declaration order canonical — ordinals are the array indices', () => {
    STATES.forEach((state, index) => {
      assert.equal(ordinal(state), index, `${state} ordinal drifted from declaration order`);
    });
  });

  it('only T18 increments the round, and only T21 sets an overlay', () => {
    assert.deepEqual(TRANSITIONS.filter((t) => t.incrementsRound).map((t) => t.id), ['T18']);
    assert.deepEqual(TRANSITIONS.filter((t) => t.setsOverlay !== null).map((t) => t.id), ['T21']);
  });

  it('marks exactly T9 and T13 as compound (AND) triggers', () => {
    assert.deepEqual(TRANSITIONS.filter((t) => t.conjunction !== null).map((t) => t.id), ['T9', 'T13']);
  });

  it('carries the T20 guard amendment — one of the two rows that are not the package verbatim', () => {
    const t20 = TRANSITIONS.find((t) => t.id === 'T20');
    assert.ok(t20);
    assert.match(t20.guardText, /manual_required` not set/);
    assert.match(t20.guardText, /amended by Founder ruling/);
  });

  it('carries the T17 guard amendment — the other row that is not the package verbatim', () => {
    const t17 = TRANSITIONS.find((t) => t.id === 'T17');
    assert.ok(t17);
    // DEC-20260815-11 v0.12, reproduced T1-T22 table, T17's guard cell, byte
    // for byte (FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING, C1).
    assert.equal(
      t17.guardText,
      "evidence all verified or founder waiver; and the bound runtime room's occupancy is CLOSED, " +
        'as the Gateway named in the binding reports it over its signed channel ' +
        "*(guard amended by `FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING` below — not the package's text)*",
    );
    assert.match(t17.guardText, /occupancy is CLOSED/);
    assert.match(t17.guardText, /amended by `FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING`/);
    // C1 amends the guard only: T17's states, trigger and actor are unchanged.
    assert.deepEqual([...t17.from], ['MERGE_CONFIRMED']);
    assert.deepEqual(t17.target, { kind: 'state', state: 'CLOSED_DELIVERED' });
    assert.deepEqual([...t17.triggers], ['build.closed']);
    assert.deepEqual([...t17.actors], ['system']);
  });

  it('marks exactly T17 and T20 as amended, and no other row', () => {
    const amended = TRANSITIONS.filter((t) => /guard amended by/.test(t.guardText)).map((t) => t.id);
    assert.deepEqual(amended, ['T17', 'T20']);
  });

  it('serializes the T2 parameterized trigger under the dotted rule', () => {
    // `task.dispatched(planner)` -> `task.dispatched.planner`. Tier-2 round 4
    // found this rule undocumented for four review rounds.
    assert.ok(EVENTS.includes('task.dispatched.planner'));
    assert.equal(eventSpec('task.dispatched.planner').transition, 'T2');
  });

  it('keeps T9 git.pushed and T18 git.push.voided distinct', () => {
    assert.notEqual(eventSpec('git.pushed').transition, eventSpec('git.push.voided').transition);
    assert.equal(eventSpec('git.pushed').transition, 'T9');
    assert.equal(eventSpec('git.push.voided').transition, 'T18');
  });

  it('rejects an inverted range rather than returning an empty one', () => {
    assert.throws(() => range('AUTHORIZED', 'PUSHED'), RangeError);
  });
});
