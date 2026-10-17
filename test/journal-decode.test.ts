/**
 * The read side of specs (a), (c) and (d), and the cross-row rules of
 * contract §2 and §5.3.
 *
 * Decoding is proven against the committed golden vectors (every vector
 * decodes to exactly its input), then against malformed bytes, each of
 * which must be refused rather than read as some nearby row. The sequence
 * rules are proven one clause at a time.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import {
  JournalDecodeError,
  boundDecisionDefect,
  commandSequenceDefect,
  decodeCommandEventRow,
  decodeDecisionRecordRow,
  decodeEnvelope,
  decodeJournalRow,
  deriveCommandState,
  encodeCommandEventRow,
  envelopeDigest,
  type BoundEntry,
  type CommandEventRow,
  type DecisionRecordRow,
  type NormalizedCommandEnvelope,
} from '../packages/journal/src/index.js';

const vectorsDir = fileURLToPath(new URL('../../packages/journal/vectors/', import.meta.url));
const readVectors = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(`${vectorsDir}${name}`, 'utf8')) as Record<string, unknown>;
const hex = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'hex'));

interface Vector {
  readonly name: string;
  readonly input: unknown;
  readonly canonical_hex: string;
  readonly record_class?: string;
}

describe('decoders reproduce every golden vector input', () => {
  it('chain vectors: each row decodes to its input, in its own record class', () => {
    const rows = readVectors('chain.json')['rows'] as Vector[];
    assert.ok(rows.length > 0);
    for (const vector of rows) {
      const decoded = decodeJournalRow(hex(vector.canonical_hex));
      assert.equal(decoded.recordClass, vector.record_class, vector.name);
      assert.deepEqual(decoded.row, vector.input, vector.name);
    }
  });

  it('decision-row vectors decode to their inputs', () => {
    const vectors = readVectors('decision-row.json')['vectors'] as Vector[];
    assert.ok(vectors.length > 0);
    for (const vector of vectors) {
      assert.deepEqual(decodeDecisionRecordRow(hex(vector.canonical_hex)), vector.input, vector.name);
    }
  });

  it('envelope vectors decode to their inputs', () => {
    const vectors = readVectors('envelope.json')['vectors'] as Vector[];
    assert.ok(vectors.length > 0);
    for (const vector of vectors) {
      assert.deepEqual(decodeEnvelope(hex(vector.canonical_hex)), vector.input, vector.name);
    }
  });
});

const ENVELOPE: NormalizedCommandEnvelope = {
  envelopeVersion: '1',
  commandKind: 'planner.invoke',
  argv: ['--goal', 'g'],
  targetRepository: 'example-org/example-repo',
  scopeRef: 'scope/example',
};

function journaled(overrides: Partial<CommandEventRow> = {}): CommandEventRow {
  return {
    seq: '1',
    eventType: 'journaled',
    commandId: 'cmd_seq_1',
    actorId: 'session:test/sequence',
    roleId: 'builder',
    repository: 'example-org/example-repo',
    scopeRef: 'scope/example',
    commandEnvelope: ENVELOPE,
    envelopeDigest: envelopeDigest(ENVELOPE),
    authorizationRef: 'auth_example',
    intendedProvider: 'example-provider',
    intendedModel: 'example-model',
    intendedSurface: 'example-surface',
    evidenceRefs: [],
    recordedAt: '2026-10-15T12:00:00.000000Z',
    ...overrides,
  };
}

const at = (seq: number, row: Omit<CommandEventRow, 'seq' | 'commandId' | 'recordedAt' | 'evidenceRefs'> & Partial<CommandEventRow>): CommandEventRow => ({
  commandId: 'cmd_seq_1',
  evidenceRefs: [],
  recordedAt: '2026-10-15T12:00:00.000000Z',
  ...row,
  seq: String(seq),
});

const dispatchedMatching = (seq: number): CommandEventRow =>
  at(seq, { eventType: 'dispatched', provider: 'example-provider', model: 'example-model', executionSurface: 'example-surface' });

describe('decoders refuse what is not a canonical row', () => {
  const good = encodeCommandEventRow(journaled());

  it('a decoded row re-encodes to the same bytes', () => {
    assert.deepEqual(encodeCommandEventRow(decodeCommandEventRow(good)), good);
  });

  const cases: ReadonlyArray<readonly [string, Uint8Array]> = [
    ['a trailing byte', new Uint8Array([...good, 0x00])],
    ['a truncated row', good.subarray(0, good.length - 3)],
    ['an empty buffer', new Uint8Array()],
  ];
  for (const [label, bytes] of cases) {
    it(`refuses ${label}`, () => {
      assert.throws(() => decodeJournalRow(bytes), JournalDecodeError);
    });
  }

  it('refuses an unknown spec id, and a spec (c) row offered as spec (d)', () => {
    const other = new Uint8Array(good);
    other[10] = 0x7a; // 'BRJ:c:1' becomes 'BRJ:z:1'
    assert.throws(() => decodeJournalRow(other), /not a journal row spec/);
    assert.throws(() => decodeDecisionRecordRow(good), /expected spec BRJ:d:1/);
  });

  it('refuses a presence byte that is neither 0 nor 1', () => {
    const bytes = new Uint8Array(good);
    // The record-class field opens right after the 11-byte spec prefix: tag, presence.
    assert.equal(bytes[11], 0x01);
    bytes[12] = 0x02;
    assert.throws(() => decodeCommandEventRow(bytes), /presence byte/);
  });

  it('refuses a row whose content fails the encoder (an envelope digest that does not match)', () => {
    const tampered = Buffer.from(good);
    const digest = Buffer.from(envelopeDigest(ENVELOPE), 'utf8');
    const at = tampered.indexOf(digest);
    assert.ok(at > 0);
    tampered[at] = tampered[at] === 0x61 ? 0x62 : 0x61;
    assert.throws(() => decodeCommandEventRow(new Uint8Array(tampered)), /the decoded row is not valid/);
  });

  it('refuses invalid UTF-8 in a string field', () => {
    const bytes = Buffer.from(good);
    const id = Buffer.from('cmd_seq_1', 'utf8');
    const at = bytes.indexOf(id);
    bytes[at + 4] = 0xff;
    assert.throws(() => decodeCommandEventRow(new Uint8Array(bytes)), /not valid UTF-8/);
  });
});

describe('command sequence rules (contract §5.3)', () => {
  it('accepts the full direct path, the failure paths and the reconciliation path', () => {
    assert.equal(commandSequenceDefect([journaled()]), null, 'a pending command');
    assert.equal(
      commandSequenceDefect([journaled(), at(2, { eventType: 'identity_bound', runId: 'run_1' }), dispatchedMatching(3), at(4, { eventType: 'completed' })]),
      null,
    );
    assert.equal(commandSequenceDefect([journaled(), at(2, { eventType: 'failed', failureClassification: 'policy_rejection' })]), null, 'pre-send failed');
    assert.equal(
      commandSequenceDefect([journaled(), dispatchedMatching(2), at(3, { eventType: 'unresolved' }), at(4, { eventType: 'resolved', resolutionDetermination: 'completed', resolutionSemantics: 'reconciled' })]),
      null,
    );
  });

  const refusals: ReadonlyArray<readonly [string, CommandEventRow[], RegExp]> = [
    ['a command that does not begin with journaled', [dispatchedMatching(1)], /begins with journaled/],
    ['a second journaled', [journaled(), journaled({ seq: '2' })], /exactly once/],
    ['identity_bound twice', [journaled(), at(2, { eventType: 'identity_bound', runId: 'r' }), at(3, { eventType: 'identity_bound', executionId: 'e' })], /at most once/],
    ['identity_bound after dispatched', [journaled(), dispatchedMatching(2), at(3, { eventType: 'identity_bound', runId: 'r' })], /before dispatched/],
    ['dispatched twice', [journaled(), dispatchedMatching(2), dispatchedMatching(3)], /dispatched is at most once/],
    ['completed with no dispatched', [journaled(), at(2, { eventType: 'completed' })], /requires a prior dispatched/],
    ['completed on a divergent route', [journaled(), at(2, { eventType: 'dispatched', provider: 'other', model: 'example-model', executionSurface: 'example-surface' }), at(3, { eventType: 'completed' })], /diverges.*provider/],
    ['two terminal events', [journaled(), at(2, { eventType: 'failed', failureClassification: 'x' }), at(3, { eventType: 'unresolved' })], /no event after failed/],
    ['an event after completed', [journaled(), dispatchedMatching(2), at(3, { eventType: 'completed' }), at(4, { eventType: 'unresolved' })], /no event after completed/],
    ['anything but resolved after unresolved', [journaled(), at(2, { eventType: 'unresolved' }), dispatchedMatching(3)], /only resolved may follow unresolved/],
    ['resolved without unresolved', [journaled(), at(2, { eventType: 'resolved', resolutionDetermination: 'failed', resolutionSemantics: 'reconciled' })], /only after unresolved/],
    ['an event after resolved', [journaled(), at(2, { eventType: 'unresolved' }), at(3, { eventType: 'resolved', resolutionDetermination: 'failed', resolutionSemantics: 'reconciled' }), at(4, { eventType: 'unresolved' })], /no event after resolved/],
    ['a completed determination with no observed identity', [journaled(), at(2, { eventType: 'unresolved' }), at(3, { eventType: 'resolved', resolutionDetermination: 'completed', resolutionSemantics: 'reconciled' })], /needs an observed identity/],
    ['an element-2 identity recorded twice', [journaled({ roomId: 'room_1' }), at(2, { eventType: 'identity_bound', roomId: 'room_1' })], /roomId is set once/],
    ['rows out of seq order', [journaled({ seq: '5' }), at(2, { eventType: 'unresolved' })], /ascending seq/],
    ['rows of two commands', [journaled(), at(2, { eventType: 'unresolved', commandId: 'cmd_other' })], /more than one command_id/],
  ];
  for (const [label, rows, reason] of refusals) {
    it(`refuses ${label}`, () => {
      const defect = commandSequenceDefect(rows);
      assert.ok(defect !== null, label);
      assert.match(defect.reason, reason);
      assert.equal(defect.index, rows.length - 1, 'the defect is reported at the row that introduced it');
    });
  }
});

describe('derived state: one sequence, two readings (contract §5.4)', () => {
  it('reads dispatch state from the latest event and the outcome from the terminal determination', () => {
    assert.deepEqual(deriveCommandState([journaled()]), { dispatchState: 'journaled', outcome: 'pending' });
    assert.deepEqual(deriveCommandState([journaled(), at(2, { eventType: 'unresolved' })]), { dispatchState: 'unresolved', outcome: 'unresolved' });
    assert.deepEqual(
      deriveCommandState([journaled(), at(2, { eventType: 'unresolved' }), at(3, { eventType: 'resolved', resolutionDetermination: 'failed', resolutionSemantics: 'mismatch' })]),
      { dispatchState: 'resolved', outcome: 'failed' },
    );
  });
});

describe('decisions bound to a planner command (Q3)', () => {
  const command: BoundEntry = { recordClass: 'command', row: journaled() };
  const decision = (seq: number, kind: DecisionRecordRow['decision']): BoundEntry => ({
    recordClass: 'decision',
    row: {
      seq: String(seq),
      decision: kind,
      actorId: 'founder',
      recordedState: 'PLAN_REVIEW',
      planHash: 'a'.repeat(64),
      authorizationRef: 'auth_founder',
      lifecycleEventRef: { roomId: 'room_1', eventId: `evt_${seq}` },
      recordedAt: '2026-10-15T12:00:00.000000Z',
    },
  });

  it('accepts an approval, and a cancel after it', () => {
    assert.equal(boundDecisionDefect([command, decision(2, 'plan.approved'), decision(3, 'founder.cancel')]), null);
  });

  it('refuses a decision before the command was journaled', () => {
    assert.match(boundDecisionDefect([decision(1, 'plan.approved')])?.reason ?? '', /not journaled before it/);
  });

  it('refuses a plan decided twice, in either combination', () => {
    assert.match(boundDecisionDefect([command, decision(2, 'plan.revision_requested'), decision(3, 'plan.approved')])?.reason ?? '', /decided once/);
    assert.match(boundDecisionDefect([command, decision(2, 'plan.approved'), decision(3, 'plan.approved')])?.reason ?? '', /decided once/);
  });

  it('refuses anything decided after founder.cancel', () => {
    assert.match(boundDecisionDefect([command, decision(2, 'founder.cancel'), decision(3, 'founder.cancel')])?.reason ?? '', /after founder.cancel/);
    assert.match(boundDecisionDefect([command, decision(2, 'founder.cancel'), decision(3, 'plan.approved')])?.reason ?? '', /after founder.cancel/);
  });
});
