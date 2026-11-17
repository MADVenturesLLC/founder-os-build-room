/**
 * The binding record class (contract v0.19 §2 "Binding-class records",
 * §6.2(e); FOUNDER-RULING-20261117-BR-JOURNAL-PHASE5 B1–B7, quoted in §13).
 *
 * Proven here: spec (e)'s encoder refuses every row the specification has no
 * canonical form for, one validation rule at a time; the explicit class
 * discriminator and the closed element set; that a chain's command-row
 * version order skips binding rows as it skips decision rows; and each rule
 * of `bindingChainDefect` (B3, B5 both directions, B6), each with the cases
 * it accepts and the cases it refuses. The committed binding chain,
 * `packages/journal/vectors/chain-binding.json`, passes every cross-row rule
 * the journal package holds.
 *
 * A Builder command is identified by its envelope's command kind,
 * `builder.invoke`, never by its role id: rows journaled under role
 * `builder` with any other kind are ordinary commands the binding rules
 * ignore.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import {
  BINDING_ACTOR,
  BINDING_EVENT,
  BINDING_RECORDED_STATE,
  BUILDER_COMMAND_KIND,
  RECORD_CLASS_BINDING,
  SPEC_ID_C,
  SPEC_ID_C2,
  SPEC_ID_E,
  bindingChainDefect,
  boundDecisionDefect,
  commandSequenceDefect,
  commandSpecOrderDefect,
  decodeJournalRow,
  encodeBindingRecordRow,
  envelopeDigest,
  type BindingRecordRow,
  type BoundEntry,
  type ChainEntry,
  type CommandEventRow,
  type DecisionRecordRow,
  type NormalizedCommandEnvelope,
} from '../packages/journal/src/index.js';
import {
  BINDING_GATEWAY,
  BINDING_LIFECYCLE_ROOM_A,
  BINDING_LIFECYCLE_ROOM_B,
  BINDING_RUNTIME_ROOM_A,
  BINDING_RUNTIME_ROOM_B,
  BINDING_VECTOR_ROWS,
  ENVELOPE_BUILDER,
} from './support/journal-vector-source.js';

const vectorsDir = fileURLToPath(new URL('../../packages/journal/vectors/', import.meta.url));
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const lpHex = (text: string): string => {
  const body = Buffer.from(text, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return Buffer.concat([length, body]).toString('hex');
};

const PLAN_HASH = 'a'.repeat(64);
const RECORDED_AT = '2026-11-17T12:00:00.000000Z';

const binding = (extra: Partial<BindingRecordRow> = {}): BindingRecordRow => ({
  seq: '2',
  event: BINDING_EVENT,
  actorId: BINDING_ACTOR,
  lifecycleRoomId: BINDING_LIFECYCLE_ROOM_A,
  runtimeRoomId: BINDING_RUNTIME_ROOM_A,
  gatewayId: BINDING_GATEWAY,
  recordedState: BINDING_RECORDED_STATE,
  planHash: PLAN_HASH,
  lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_bound_a' },
  recordedAt: RECORDED_AT,
  ...extra,
});

const refuses = (row: BindingRecordRow, reason: RegExp, label?: string): void => {
  assert.throws(() => encodeBindingRecordRow(row), reason, label);
};

describe('spec (e) — the binding-class record row', () => {
  it('encodes a well-formed row, every standalone vector included', () => {
    assert.doesNotThrow(() => encodeBindingRecordRow(binding()));
    for (const { name, row } of BINDING_VECTOR_ROWS) assert.doesNotThrow(() => encodeBindingRecordRow(row), name);
  });

  it('carries the record class as an explicit field, the first after the spec id', () => {
    const prefix = `${lpHex(SPEC_ID_E)}0101${lpHex(RECORD_CLASS_BINDING)}`;
    assert.equal(hex(encodeBindingRecordRow(binding())).slice(0, prefix.length), prefix);
  });

  it('encodes all eleven fields present, in tag order, with no absent form', () => {
    const row = binding();
    const expected = [
      lpHex(SPEC_ID_E),
      `0101${lpHex('binding')}`,
      `0201${lpHex(row.seq)}`,
      `0301${lpHex(row.event)}`,
      `0401${lpHex(row.actorId)}`,
      `0501${lpHex(row.lifecycleRoomId)}`,
      `0601${lpHex(row.runtimeRoomId)}`,
      `0701${lpHex(row.gatewayId)}`,
      `0801${lpHex(row.recordedState)}`,
      `0901${lpHex(row.planHash)}`,
      `0a01${lpHex(row.lifecycleEventRef.roomId)}${lpHex(row.lifecycleEventRef.eventId)}`,
      `0b01${lpHex(row.recordedAt)}`,
    ].join('');
    assert.equal(hex(encodeBindingRecordRow(row)), expected);
  });

  it('cannot carry elements 1, 4, 8 or 9: the grammar has no slot for them (§13 B2, G4)', () => {
    const smuggled = {
      ...binding(),
      commandId: 'cmd_example_0001',
      provider: 'example-provider',
      model: 'example-model',
      executionSurface: 'example-surface',
      dispatchState: 'completed',
      outcome: 'completed',
    } as unknown as BindingRecordRow;
    assert.equal(hex(encodeBindingRecordRow(smuggled)), hex(encodeBindingRecordRow(binding())));
  });

  it('distinguishes rows that differ in any one field', () => {
    const base = hex(encodeBindingRecordRow(binding()));
    assert.notEqual(hex(encodeBindingRecordRow(binding({ seq: '3' }))), base);
    assert.notEqual(hex(encodeBindingRecordRow(binding({ runtimeRoomId: BINDING_RUNTIME_ROOM_B }))), base);
    assert.notEqual(hex(encodeBindingRecordRow(binding({ planHash: 'b'.repeat(64) }))), base);
  });
});

describe('spec (e) — every validation refusal', () => {
  it('refuses a missing or mistyped field of any kind', () => {
    const fields = ['seq', 'event', 'actorId', 'lifecycleRoomId', 'runtimeRoomId', 'gatewayId', 'recordedState', 'planHash', 'recordedAt'] as const;
    const names: Record<(typeof fields)[number], string> = {
      seq: 'seq',
      event: 'event',
      actorId: 'actor_id',
      lifecycleRoomId: 'lifecycle_room_id',
      runtimeRoomId: 'runtime_room_id',
      gatewayId: 'gateway_id',
      recordedState: 'recorded_state',
      planHash: 'plan_hash',
      recordedAt: 'recorded_at',
    };
    for (const field of fields) {
      refuses({ ...binding(), [field]: undefined } as unknown as BindingRecordRow, new RegExp(`${names[field]} must be a string, got undefined`), field);
      refuses({ ...binding(), [field]: 7 } as unknown as BindingRecordRow, new RegExp(`${names[field]} must be a string, got number`), field);
    }
    refuses({ ...binding(), lifecycleEventRef: undefined } as unknown as BindingRecordRow, /lifecycle_event_ref\.room_id must be a string/);
    refuses(binding({ lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A } as unknown as BindingRecordRow['lifecycleEventRef'] }), /lifecycle_event_ref\.event_id must be a string/);
  });

  it('refuses a non-canonical seq', () => {
    for (const seq of ['0', '02', '-1', '1.0', '', ' 2']) refuses(binding({ seq }), /seq is not canonical/, seq);
  });

  it('refuses any event but runtime_room.bound', () => {
    for (const event of ['plan.approved', 'runtime_room.unbound', 'RUNTIME_ROOM.BOUND', '']) {
      refuses(binding({ event: event as typeof BINDING_EVENT }), /not the binding event runtime_room\.bound/, event);
    }
  });

  it('refuses any actor but system', () => {
    for (const actorId of ['founder', 'agent.builder', 'System', '']) {
      refuses(binding({ actorId: actorId as typeof BINDING_ACTOR }), /binding records carry actor system/, actorId);
    }
  });

  it('refuses a lifecycle room id that is not a canonical lowercase UUID', () => {
    for (const id of [
      BINDING_LIFECYCLE_ROOM_A.toUpperCase(),
      `{${BINDING_LIFECYCLE_ROOM_A}}`,
      `urn:uuid:${BINDING_LIFECYCLE_ROOM_A}`,
      BINDING_LIFECYCLE_ROOM_A.replaceAll('-', ''),
      `room-${BINDING_LIFECYCLE_ROOM_A}`,
      'room_example_0001',
      `${BINDING_LIFECYCLE_ROOM_A} `,
    ]) {
      refuses(binding({ lifecycleRoomId: id, lifecycleEventRef: { roomId: id, eventId: 'evt_bound_a' } }), /lifecycle_room_id is not a canonical lowercase UUID/, id);
    }
  });

  it('refuses a runtime room id that is not room- followed by a canonical lowercase UUID', () => {
    const bare = BINDING_RUNTIME_ROOM_A.slice('room-'.length);
    for (const id of [bare, `Room-${bare}`, `room-${bare.toUpperCase()}`, `room_${bare}`, 'room-', `room-${bare}x`, `room-room-${bare}`]) {
      refuses(binding({ runtimeRoomId: id }), /runtime_room_id is not room- followed by a canonical lowercase UUID/, id);
    }
  });

  it('refuses a Gateway id that is not a canonical lowercase UUID', () => {
    for (const id of [BINDING_GATEWAY.toUpperCase(), BINDING_GATEWAY.slice(0, 35), `room-${BINDING_GATEWAY}`, 'gateway-1', '']) {
      refuses(binding({ gatewayId: id }), /gateway_id is not a canonical lowercase UUID/, id);
    }
  });

  it('refuses any recorded state but BUILDING', () => {
    for (const state of ['PLAN_REVIEW', 'BLOCKED_ON_FOUNDER', 'RECONCILING', 'building']) {
      refuses(binding({ recordedState: state as typeof BINDING_RECORDED_STATE }), /a binding is recorded in BUILDING/, state);
    }
  });

  it('refuses a plan_hash that is not 64 lowercase hex: it is required, with no sentinel', () => {
    for (const planHash of ['A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), `sha256:${'a'.repeat(57)}`, '']) {
      refuses(binding({ planHash }), /plan_hash must be 64 lowercase hex/, planHash);
    }
  });

  it('refuses a lifecycle_event_ref that names another room\'s entry', () => {
    refuses(
      binding({ lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_B, eventId: 'evt_bound_a' } }),
      /lifecycle_event_ref\.room_id must be the lifecycle_room_id/,
    );
    refuses(
      binding({ lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A.toUpperCase(), eventId: 'evt_bound_a' } }),
      /lifecycle_event_ref\.room_id must be the lifecycle_room_id/,
    );
  });

  it('refuses an empty or blank event id', () => {
    for (const eventId of ['', ' ', '\t\n']) {
      refuses(binding({ lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId } }), /non-empty event_id/, JSON.stringify(eventId));
    }
  });

  it('refuses an event id carrying credential material (contract §6.1)', () => {
    for (const eventId of [`evt_ghp_${'Z'.repeat(36)}`, `sk-${'q'.repeat(32)}`, `Bearer ${'k'.repeat(24)}`]) {
      refuses(binding({ lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId } }), /event_id carries credential material/, eventId.slice(0, 8));
    }
  });

  it('refuses a recorded_at that is not canonical or not a calendar date', () => {
    for (const recordedAt of ['2026-11-17T12:00:00Z', '2026-11-17T12:00:00.000Z', '2026-11-17 12:00:00.000000Z', '2027-02-29T12:00:00.000000Z', '2026-11-31T12:00:00.000000Z']) {
      refuses(binding({ recordedAt }), /recorded_at is not the canonical/, recordedAt);
    }
  });

  it('refuses a string that is not well-formed Unicode, and accepts a paired astral character', () => {
    refuses(binding({ lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_\uD800_bound' } }), /well-formed/);
    assert.doesNotThrow(() => encodeBindingRecordRow(binding({ lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_😀_bound' } })));
  });
});

describe('a chain\'s command rows move from BRJ:c:1 to BRJ:c:2 once, across binding rows too', () => {
  it('skips binding rows wherever they sit', () => {
    assert.equal(commandSpecOrderDefect([SPEC_ID_E]), null);
    assert.equal(commandSpecOrderDefect([SPEC_ID_C, SPEC_ID_E, SPEC_ID_C2, SPEC_ID_E]), null);
    assert.equal(commandSpecOrderDefect([SPEC_ID_E, 'BRJ:d:1', SPEC_ID_C2]), null);
  });

  it('still refuses a downgrade across a binding row, and a spec id that names no row spec', () => {
    assert.equal(commandSpecOrderDefect([SPEC_ID_C2, SPEC_ID_E, SPEC_ID_C]), 'row 2 is a BRJ:c:1 command row after a BRJ:c:2 one');
    assert.match(commandSpecOrderDefect([SPEC_ID_C, 'BRJ:e:2']) ?? '', /row 1 names no journal row spec/);
  });
});

// ---------------------------------------------------------------------------
// bindingChainDefect — B3, B5, B6
// ---------------------------------------------------------------------------

const PLANNER_ENVELOPE: NormalizedCommandEnvelope = { ...ENVELOPE_BUILDER, commandKind: 'planner.invoke' };
const ORDINARY_ENVELOPE: NormalizedCommandEnvelope = { ...ENVELOPE_BUILDER, commandKind: 'example.invoke' };

/** A command-class `journaled` row; by default a Builder command of room A naming its binding entry. */
function journaledRow(seq: number, commandId: string, extra: Partial<CommandEventRow> = {}): CommandEventRow {
  const envelope = extra.commandEnvelope ?? ENVELOPE_BUILDER;
  return {
    seq: String(seq),
    eventType: 'journaled',
    commandId,
    roomId: BINDING_LIFECYCLE_ROOM_A,
    actorId: 'agent.builder',
    roleId: 'builder',
    repository: 'example-org/example-repo',
    scopeRef: 'scope_example',
    commandEnvelope: envelope,
    envelopeDigest: envelopeDigest(envelope),
    authorizationRef: 'auth_example',
    intendedProvider: 'example-provider',
    intendedModel: 'example-model',
    intendedSurface: 'example-surface',
    lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_bound_a' },
    evidenceRefs: [],
    recordedAt: RECORDED_AT,
    ...extra,
  };
}

const cmd = (seq: number, commandId: string, extra: Partial<CommandEventRow> = {}): ChainEntry => ({
  seq: String(seq),
  commandId,
  decoded: { recordClass: 'command', row: journaledRow(seq, commandId, extra) },
});

const later = (seq: number, commandId: string, row: Partial<CommandEventRow>): ChainEntry => ({
  seq: String(seq),
  commandId,
  decoded: {
    recordClass: 'command',
    row: { seq: String(seq), commandId, evidenceRefs: [], recordedAt: RECORDED_AT, eventType: 'completed', ...row } as CommandEventRow,
  },
});

const bind = (seq: number, commandId: string, extra: Partial<BindingRecordRow> = {}): ChainEntry => ({
  seq: String(seq),
  commandId,
  decoded: { recordClass: 'binding', row: binding({ seq: String(seq), ...extra }) },
});

const bindB = (seq: number, commandId: string, extra: Partial<BindingRecordRow> = {}): ChainEntry =>
  bind(seq, commandId, {
    lifecycleRoomId: BINDING_LIFECYCLE_ROOM_B,
    runtimeRoomId: BINDING_RUNTIME_ROOM_B,
    lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_B, eventId: 'evt_bound_b' },
    ...extra,
  });

const cmdB = (seq: number, commandId: string, extra: Partial<CommandEventRow> = {}): ChainEntry =>
  cmd(seq, commandId, {
    roomId: BINDING_LIFECYCLE_ROOM_B,
    lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_B, eventId: 'evt_bound_b' },
    ...extra,
  });

const decisionEntry = (seq: number, commandId: string): ChainEntry => ({
  seq: String(seq),
  commandId,
  decoded: {
    recordClass: 'decision',
    row: {
      seq: String(seq),
      decision: 'plan.approved',
      actorId: 'founder',
      recordedState: 'PLAN_REVIEW',
      planHash: PLAN_HASH,
      authorizationRef: 'auth_founder',
      lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_approved_a' },
      recordedAt: RECORDED_AT,
    } satisfies DecisionRecordRow,
  },
});

const defectOf = (records: readonly ChainEntry[]): { atSeq: string; reason: string } => {
  const defect = bindingChainDefect(records);
  assert.ok(defect !== null, 'a defect is reported');
  return defect;
};

describe('bindingChainDefect — what it accepts', () => {
  it('accepts an empty chain, and a chain with no Builder command and no binding', () => {
    assert.equal(bindingChainDefect([]), null);
    for (const file of ['chain.json', 'chain-v2.json']) {
      const rows = (JSON.parse(readFileSync(`${vectorsDir}${file}`, 'utf8')) as { rows: { canonical_hex: string }[] }).rows;
      const records = rows.map((row): ChainEntry => {
        const decoded = decodeJournalRow(new Uint8Array(Buffer.from(row.canonical_hex, 'hex')));
        return { seq: decoded.row.seq, commandId: decoded.recordClass === 'command' ? decoded.row.commandId : 'cmd_column', decoded };
      });
      assert.equal(bindingChainDefect(records), null, file);
    }
  });

  it('accepts the first Builder command at k and its binding at k+1, with other classes around them', () => {
    assert.equal(bindingChainDefect([cmd(1, 'cmd_b1'), bind(2, 'cmd_b1')]), null);
    assert.equal(
      bindingChainDefect([
        cmd(1, 'cmd_p1', { commandEnvelope: PLANNER_ENVELOPE, roleId: 'planner' }),
        decisionEntry(2, 'cmd_p1'),
        cmd(3, 'cmd_b1'),
        bind(4, 'cmd_b1'),
        later(5, 'cmd_b1', { eventType: 'completed' }),
      ]),
      null,
    );
  });

  it('accepts later Builder commands that name the binding entry (B6)', () => {
    assert.equal(bindingChainDefect([cmd(1, 'cmd_b1'), bind(2, 'cmd_b1'), cmd(3, 'cmd_b2'), cmd(4, 'cmd_b3')]), null);
  });

  it('accepts two rooms bound to two runtime rooms on one Gateway, interleaved', () => {
    assert.equal(
      bindingChainDefect([cmd(1, 'cmd_a1'), bind(2, 'cmd_a1'), cmdB(3, 'cmd_b1'), bindB(4, 'cmd_b1'), cmd(5, 'cmd_a2'), cmdB(6, 'cmd_b2')]),
      null,
    );
  });

  it('ignores role builder rows of any other kind: they are not Builder commands', () => {
    const ordinary = { commandEnvelope: ORDINARY_ENVELOPE, roleId: 'builder' } as const;
    assert.equal(bindingChainDefect([cmd(1, 'cmd_o1', ordinary)]), null, 'no room binding needed');
    assert.equal(bindingChainDefect([cmd(1, 'cmd_o1', { ...ordinary, roomId: undefined, lifecycleEventRef: undefined })]), null, 'no room at all');
    assert.equal(bindingChainDefect([cmd(1, 'cmd_o1', { ...ordinary, lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_other' } })]), null);
    assert.equal(bindingChainDefect([cmd(1, 'cmd_p1', { commandEnvelope: PLANNER_ENVELOPE })]), null, 'planner.invoke under role builder');
  });

  it('reads only journaled rows for B6: later events of a Builder command carry no envelope', () => {
    assert.equal(
      bindingChainDefect([cmd(1, 'cmd_b1'), bind(2, 'cmd_b1'), later(3, 'cmd_b1', { eventType: 'dispatched', provider: 'p', model: 'm', executionSurface: 's' })]),
      null,
    );
  });
});

describe('bindingChainDefect — rule 1, B3: a binding commits next to its first Builder command', () => {
  // The rows before these bindings are not Builder commands, so rule 3 has
  // nothing to say about them and rule 1 is the rule that answers. (A Builder
  // command journaled further back than k−1 is refused by rule 3 at its own,
  // lower, seq — the last test of the rule 3 block.)
  it('refuses a binding with no row at the seq before it', () => {
    const first = defectOf([bind(1, 'cmd_b1')]);
    assert.equal(first.atSeq, '1');
    assert.match(first.reason, /^B3: .*no row is there/);
    const gap = defectOf([cmd(1, 'cmd_b1', { commandEnvelope: ORDINARY_ENVELOPE }), bind(3, 'cmd_b1')]);
    assert.equal(gap.atSeq, '3');
    assert.match(gap.reason, /^B3: .*no row is there/);
  });

  it('refuses a binding after a row that is not a journaled command row', () => {
    const afterDecision = defectOf([decisionEntry(1, 'cmd_b1'), bind(2, 'cmd_b1')]);
    assert.equal(afterDecision.atSeq, '2');
    assert.match(afterDecision.reason, /^B3: .*not a decision row/);
    const afterDispatched = defectOf([later(1, 'cmd_b1', { eventType: 'dispatched', provider: 'p', model: 'm', executionSurface: 's' }), bind(2, 'cmd_b1')]);
    assert.equal(afterDispatched.atSeq, '2');
    assert.match(afterDispatched.reason, /^B3: .*not a dispatched command row/);
    const afterBinding = defectOf([cmd(1, 'cmd_a1'), bind(2, 'cmd_a1'), bindB(3, 'cmd_a1')]);
    assert.equal(afterBinding.atSeq, '3');
    assert.match(afterBinding.reason, /^B3: .*not a binding row/);
  });

  it('refuses a binding whose command_id column is not the command journaled before it', () => {
    const defect = defectOf([cmd(1, 'cmd_b1'), bind(2, 'cmd_other')]);
    assert.equal(defect.atSeq, '2');
    assert.match(defect.reason, /^B3: a binding's command_id column/);
  });

  it('refuses a binding whose prior command is not of kind builder.invoke, role builder or not', () => {
    for (const extra of [
      { commandEnvelope: PLANNER_ENVELOPE, roleId: 'builder' },
      { commandEnvelope: ORDINARY_ENVELOPE, roleId: 'builder' },
      { commandEnvelope: PLANNER_ENVELOPE, roleId: 'planner' },
    ]) {
      const defect = defectOf([cmd(1, 'cmd_x1', extra), bind(2, 'cmd_x1')]);
      assert.equal(defect.atSeq, '2');
      assert.match(defect.reason, new RegExp(`^B3: .*is a Builder command \\(${BUILDER_COMMAND_KIND.replace('.', '\\.')}\\)`));
    }
  });

  it('refuses a binding whose first Builder command names another room', () => {
    // Room A is bound at 2; the command at 3 is a valid later Builder command of
    // room A; a binding of room B at 4 names it as its first: wrong room.
    const defect = defectOf([cmd(1, 'cmd_a1'), bind(2, 'cmd_a1'), cmd(3, 'cmd_a2'), bindB(4, 'cmd_a2')]);
    assert.equal(defect.atSeq, '4');
    assert.match(defect.reason, /^B3: the first Builder command's room_id is the binding's lifecycle room/);
  });

  it('refuses a binding whose first Builder command names another lifecycle entry', () => {
    // A second binding of room A, with its own entry, after a later Builder
    // command that rightly names the first binding's entry.
    const defect = defectOf([
      cmd(1, 'cmd_a1'),
      bind(2, 'cmd_a1'),
      cmd(3, 'cmd_a2'),
      bind(4, 'cmd_a2', { runtimeRoomId: BINDING_RUNTIME_ROOM_B, lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_bound_a2' } }),
    ]);
    assert.equal(defect.atSeq, '4');
    assert.match(defect.reason, /^B3: the first Builder command's lifecycle_event_ref names the binding's runtime_room\.bound entry/);
  });
});

describe('bindingChainDefect — rule 2, B5: one to one, both directions', () => {
  it('refuses a second binding of a lifecycle room', () => {
    const defect = defectOf([cmd(1, 'cmd_a1'), bind(2, 'cmd_a1'), cmd(3, 'cmd_a2'), bind(4, 'cmd_a2', { runtimeRoomId: BINDING_RUNTIME_ROOM_B })]);
    assert.equal(defect.atSeq, '4');
    assert.equal(defect.reason, `B5: lifecycle room ${BINDING_LIFECYCLE_ROOM_A} is already bound at seq 2`);
  });

  it('refuses a binding that names a runtime room already bound', () => {
    const defect = defectOf([cmd(1, 'cmd_a1'), bind(2, 'cmd_a1'), cmdB(3, 'cmd_b1'), bindB(4, 'cmd_b1', { runtimeRoomId: BINDING_RUNTIME_ROOM_A })]);
    assert.equal(defect.atSeq, '4');
    assert.equal(defect.reason, `B5: runtime room ${BINDING_RUNTIME_ROOM_A} is already bound at seq 2`);
  });

  it('accepts distinct rooms on both sides, even with one Gateway', () => {
    assert.equal(bindingChainDefect([cmd(1, 'cmd_a1'), bind(2, 'cmd_a1'), cmdB(3, 'cmd_b1'), bindB(4, 'cmd_b1', { gatewayId: BINDING_GATEWAY })]), null);
  });
});

describe('bindingChainDefect — rule 3, B6: every Builder command names its room\'s binding', () => {
  it('refuses a Builder command journaled with no room_id', () => {
    const defect = defectOf([cmd(1, 'cmd_b1', { roomId: undefined })]);
    assert.equal(defect.atSeq, '1');
    assert.equal(defect.reason, 'B6: a Builder command is journaled with no room_id');
  });

  it('refuses a Builder command of a room that has no binding, whatever its role id', () => {
    for (const roleId of ['builder', 'planner']) {
      const defect = defectOf([cmd(1, 'cmd_b1', { roleId })]);
      assert.equal(defect.atSeq, '1');
      assert.match(defect.reason, /^B6: a Builder command is journaled for room .*, which has no binding$/);
    }
    const otherRoom = defectOf([cmd(1, 'cmd_a1'), bind(2, 'cmd_a1'), cmdB(3, 'cmd_b1')]);
    assert.equal(otherRoom.atSeq, '3');
    assert.match(otherRoom.reason, /which has no binding/);
  });

  it('refuses a Builder command journaled before the one its room\'s binding commits with', () => {
    const defect = defectOf([cmd(1, 'cmd_b0'), cmd(2, 'cmd_b1'), bind(3, 'cmd_b1')]);
    assert.equal(defect.atSeq, '1');
    assert.match(defect.reason, /^B6: a Builder command is journaled before its room's binding at seq 3/);
  });

  it('refuses a later Builder command whose lifecycle_event_ref is not the binding entry', () => {
    for (const ref of [
      { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_other' },
      { roomId: BINDING_LIFECYCLE_ROOM_B, eventId: 'evt_bound_a' },
    ]) {
      const defect = defectOf([cmd(1, 'cmd_b1'), bind(2, 'cmd_b1'), cmd(3, 'cmd_b2', { lifecycleEventRef: ref })]);
      assert.equal(defect.atSeq, '3');
      assert.match(defect.reason, /^B6: a Builder command's lifecycle_event_ref names its room's runtime_room\.bound entry \(the binding at seq 2\)/);
    }
    const none = defectOf([cmd(1, 'cmd_b1'), bind(2, 'cmd_b1'), cmd(3, 'cmd_b2', { lifecycleEventRef: undefined })]);
    assert.equal(none.atSeq, '3');
  });

  it('reports a first Builder command whose reference is not its binding\'s at its own seq, k−1', () => {
    const defect = defectOf([cmd(1, 'cmd_b1', { lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_other' } }), bind(2, 'cmd_b1')]);
    assert.equal(defect.atSeq, '1');
    assert.match(defect.reason, /^B6: /);
  });
});

describe('bindingChainDefect — the first defect is the one at the lowest seq', () => {
  it('returns a B6 defect at seq 1 before a B5 defect at seq 4', () => {
    const defect = defectOf([cmd(1, 'cmd_x', { roomId: undefined }), cmd(2, 'cmd_a1'), bind(3, 'cmd_a1'), bind(4, 'cmd_a1')]);
    assert.equal(defect.atSeq, '1');
  });

  it('reports a binding separated from its first Builder command at the command, by rule 3', () => {
    const defect = defectOf([cmd(1, 'cmd_b1'), decisionEntry(2, 'cmd_b1'), bind(3, 'cmd_b1')]);
    assert.equal(defect.atSeq, '1');
    assert.match(defect.reason, /^B6: a Builder command is journaled before its room's binding at seq 3/);
  });
});

describe('the committed binding chain passes every cross-row rule', () => {
  const parsed = JSON.parse(readFileSync(`${vectorsDir}chain-binding.json`, 'utf8')) as {
    rows: readonly { readonly name: string; readonly spec: string; readonly command_id: string; readonly canonical_hex: string }[];
  };
  const records: ChainEntry[] = parsed.rows.map((row) => {
    const decoded = decodeJournalRow(new Uint8Array(Buffer.from(row.canonical_hex, 'hex')));
    return { seq: decoded.row.seq, commandId: row.command_id, decoded };
  });

  it('bindingChainDefect, the spec order, the command sequences and the decision rules all hold', () => {
    assert.equal(bindingChainDefect(records), null);
    assert.equal(commandSpecOrderDefect(parsed.rows.map((r) => r.spec)), null);
    const byCommand = new Map<string, BoundEntry[]>();
    for (const record of records) {
      if (record.decoded.recordClass === 'command') assert.equal(record.decoded.row.commandId, record.commandId, 'a command row\'s column is its bytes\' command_id');
      byCommand.set(record.commandId, [...(byCommand.get(record.commandId) ?? []), record.decoded as BoundEntry]);
    }
    for (const [commandId, entries] of byCommand) {
      const commands = entries.flatMap((e) => (e.recordClass === 'command' ? [e.row] : []));
      assert.equal(commandSequenceDefect(commands), null, commandId);
      assert.equal(boundDecisionDefect(entries), null, commandId);
    }
  });

  it('places each binding at k+1 after its room\'s first Builder command, and covers two rooms', () => {
    const bindings = records.filter((r) => r.decoded.recordClass === 'binding');
    assert.equal(bindings.length, 2);
    for (const b of bindings) {
      const prior = records.find((r) => BigInt(r.seq) === BigInt(b.seq) - 1n);
      assert.ok(prior?.decoded.recordClass === 'command');
      assert.equal(prior.decoded.row.commandEnvelope?.commandKind, BUILDER_COMMAND_KIND);
      assert.equal(prior.commandId, b.commandId);
    }
    const boundRooms = bindings.map((b) => (b.decoded.row as BindingRecordRow).lifecycleRoomId);
    assert.deepEqual(boundRooms, [BINDING_LIFECYCLE_ROOM_A, BINDING_LIFECYCLE_ROOM_B]);
  });

  it('breaks under each tamper the rules exist to catch', () => {
    // Drop the first Builder command's binding: its command is now unbound (B6).
    const unbound = records.filter((r) => !(r.decoded.recordClass === 'binding' && r.seq === '6'));
    assert.match(bindingChainDefect(unbound)?.reason ?? '', /^B6: /);
    // Re-point room B's binding at room A's runtime room (B5).
    const reused = records.map((r): ChainEntry =>
      r.decoded.recordClass === 'binding' && r.seq === '12'
        ? { ...r, decoded: { recordClass: 'binding', row: { ...r.decoded.row, runtimeRoomId: BINDING_RUNTIME_ROOM_A } } }
        : r,
    );
    assert.match(bindingChainDefect(reused)?.reason ?? '', /^B5: runtime room/);
  });
});
