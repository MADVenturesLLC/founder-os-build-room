/**
 * Room Status IR — Lane 1 focused proofs (Superlogical→MAD Session
 * Operability v0).
 *
 * Pins, per the commission: closed-enum rejection, snapshot determinism,
 * blocked+reason truthfulness, strict `completed` requires evidence refs,
 * single-writer publishing, and the AE-01 projection dogfood (fixture
 * occupancy only — this suite must never be readable as a live-occupancy
 * claim). Success criteria live in
 * docs/planning/superlogical-evolve-v0/HANDOFF-room-status-ir.md.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RoomSnapshotBody } from '../packages/gateway-protocol/src/ipc-v2.js';
import { BLOCK_REASONS, EXECUTION_STATES, OCCUPANCY_STATES } from '../packages/gateway-protocol/src/ipc-v2.js';
import {
  AGENT_PHASES,
  EVIDENCE_REF_KINDS,
  ROOM_BLOCK_REASONS,
  ROOM_OCCUPANCY,
  PublisherAlreadyBoundError,
  RoomStatusParseError,
  RoomStatusStore,
  aggregateAgentPhase,
  bindPublisher,
  diffStatus,
  isAgentPhase,
  isEvidenceRefKind,
  isRoomBlockReason,
  isRoomOccupancy,
  parseRoomStatus,
  projectRoomSnapshot,
  roomStatusEqual,
  type EvidenceRef,
  type RoomStatus,
} from '../packages/room-status/src/index.js';
import {
  AE01_BLOCK_REASON_TO_ROOM_BLOCK_REASON,
  EXECUTION_STATE_TO_AGENT_PHASE,
  OCCUPANCY_TO_ROOM_OCCUPANCY,
} from '../packages/room-status/src/projection.js';

const HANDOFF_SHA: EvidenceRef = { kind: 'sha', ref: '0123456789abcdef0123456789abcdef01234567' };

function baseStatus(overrides?: Partial<RoomStatus>): RoomStatus {
  return parseRoomStatus({
    irVersion: 1,
    roomId: 'fixture-room-test',
    occupancy: 'occupied',
    agentPhase: 'idle',
    evidenceRefs: [],
    observedSeq: 1,
    ...overrides,
  });
}

describe('RoomStatus IR — closed vocabulary rejects what it does not know', () => {
  it('accepts every enum member through its guard and rejects junk', () => {
    for (const phase of AGENT_PHASES) assert.equal(isAgentPhase(phase), true);
    assert.equal(isAgentPhase('thinking_really_hard'), false);
    for (const occupancy of ROOM_OCCUPANCY) assert.equal(isRoomOccupancy(occupancy), true);
    assert.equal(isRoomOccupancy('haunted'), false);
    for (const reason of ROOM_BLOCK_REASONS) assert.equal(isRoomBlockReason(reason), true);
    assert.equal(isRoomBlockReason('vibes'), false);
    for (const kind of EVIDENCE_REF_KINDS) assert.equal(isEvidenceRefKind(kind), true);
    assert.equal(isEvidenceRefKind('rumor'), false);
  });

  it('rejects unknown IR versions, phases, occupancies, and evidence kinds at parse', () => {
    assert.throws(() => parseRoomStatus({ ...JSON.parse(JSON.stringify(baseStatus())), irVersion: 2 }), RoomStatusParseError);
    assert.throws(
      () => parseRoomStatus({ irVersion: 1, roomId: 'r', occupancy: 'occupied', agentPhase: 'dreaming', evidenceRefs: [], observedSeq: 0 }),
      /agent_phase_enum/,
    );
    assert.throws(
      () => parseRoomStatus({ irVersion: 1, roomId: 'r', occupancy: 'emptyish', agentPhase: 'idle', evidenceRefs: [], observedSeq: 0 }),
      /occupancy_enum/,
    );
    assert.throws(
      () =>
        parseRoomStatus({
          irVersion: 1,
          roomId: 'r',
          occupancy: 'occupied',
          agentPhase: 'completed',
          evidenceRefs: [{ kind: 'hearsay', ref: 'x' }],
          observedSeq: 0,
        }),
      /evidence_ref_kind/,
    );
  });

  it('rejects a block reason attached to any phase other than blocked', () => {
    assert.throws(() => parseRoomStatus({ ...JSON.parse(JSON.stringify(baseStatus())), agentPhase: 'failed', blockReason: 'human_hold' }), /block_reason_requires_blocked/);
    assert.doesNotThrow(() => parseRoomStatus({ ...JSON.parse(JSON.stringify(baseStatus())), agentPhase: 'blocked', blockReason: 'human_hold' }));
  });

  it('refuses a closed room claiming an active phase', () => {
    assert.throws(() => parseRoomStatus({ ...JSON.parse(JSON.stringify(baseStatus())), occupancy: 'closed', agentPhase: 'running' }), /closed_not_active/);
  });
});

describe('RoomStatus IR — strict completed requires evidence; nothing soft-downgrades', () => {
  it('strict parse throws on completed without evidence refs', () => {
    const completed = { ...JSON.parse(JSON.stringify(baseStatus())), agentPhase: 'completed' };
    assert.throws(() => parseRoomStatus(completed, { strict: true }), /completed_requires_evidence/);
    const withEvidence = { ...completed, evidenceRefs: [HANDOFF_SHA] };
    const parsed = parseRoomStatus(withEvidence, { strict: true });
    assert.equal(parsed.agentPhase, 'completed');
    assert.deepEqual([...parsed.evidenceRefs], [HANDOFF_SHA]);
  });

  it('non-strict parse permits completed without evidence (strictness is the publisher caller policy)', () => {
    const completed = { ...JSON.parse(JSON.stringify(baseStatus())), agentPhase: 'completed' };
    assert.doesNotThrow(() => parseRoomStatus(completed));
  });

  it('strict publisher re-enforces the evidence invariant at its write boundary', () => {
    const store = new RoomStatusStore();
    const publisher = bindPublisher(store, { strict: true });
    const forged = {
      ...JSON.parse(JSON.stringify(baseStatus())),
      agentPhase: 'completed',
      evidenceRefs: [],
    } as RoomStatus;
    assert.throws(() => publisher.publish(forged), /completed_requires_evidence/);
    assert.equal(store.snapshot('fixture-room-test'), null);
  });
});

describe('RoomStatus IR — store snapshots are deterministic, frozen, single-writer', () => {
  it('parse output is deterministic and deeply frozen', () => {
    const input = { irVersion: 1, roomId: 'fixture-room-test', occupancy: 'occupied', agentPhase: 'blocked', blockReason: 'policy_deny', evidenceRefs: [HANDOFF_SHA], observedSeq: 9 };
    const a = parseRoomStatus(input);
    const b = parseRoomStatus(input);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    assert.ok(roomStatusEqual(a, b));
    assert.throws(() => {
      (a as { agentPhase: string }).agentPhase = 'idle';
    });
    assert.throws(() => {
      (a.evidenceRefs[0] as { ref: string }).ref = 'mutated';
    });
  });

  it('a second bindPublisher on the same store throws (one store, one writer)', () => {
    const store = new RoomStatusStore();
    bindPublisher(store);
    assert.throws(() => bindPublisher(store), PublisherAlreadyBoundError);
  });

  it('publish notifies subscribers with before/after and skips phantom transitions', () => {
    const store = new RoomStatusStore();
    const publisher = bindPublisher(store);
    const deltas: Array<{ before: RoomStatus | null; after: RoomStatus }> = [];
    const unsubscribe = store.subscribe('fixture-room-test', (delta) => deltas.push({ before: delta.before, after: delta.after }));

    const first = baseStatus();
    const stored = publisher.publish(first);
    assert.deepEqual(JSON.parse(JSON.stringify(stored)), JSON.parse(JSON.stringify(first)));

    publisher.publish(baseStatus()); // equal content — no phantom transition
    assert.equal(deltas.length, 1);
    assert.equal(deltas[0]?.before, null);

    const second = parseRoomStatus({ irVersion: 1, roomId: 'fixture-room-test', occupancy: 'occupied', agentPhase: 'blocked', blockReason: 'completion_gap', evidenceRefs: [HANDOFF_SHA], observedSeq: 2 });
    publisher.publish(second);
    assert.equal(deltas.length, 2);
    assert.equal(deltas[1]?.before?.agentPhase, 'idle');
    assert.equal(deltas[1]?.after.agentPhase, 'blocked');

    unsubscribe();
    unsubscribe(); // idempotent
    publisher.publish(parseRoomStatus({ irVersion: 1, roomId: 'fixture-room-test', occupancy: 'occupied', agentPhase: 'verifying', evidenceRefs: [HANDOFF_SHA], observedSeq: 3 }));
    assert.equal(deltas.length, 2);
    assert.deepEqual(store.listRooms(), ['fixture-room-test']);
  });

  it('diffStatus returns null for equal records and the delta otherwise', () => {
    const a = baseStatus();
    assert.equal(diffStatus(null, a)?.before, null);
    assert.equal(diffStatus(a, baseStatus()), null);
    const b = parseRoomStatus({ ...JSON.parse(JSON.stringify(a)), agentPhase: 'failed', observedSeq: 2 });
    const delta = diffStatus(a, b);
    assert.equal(delta?.before?.agentPhase, 'idle');
    assert.equal(delta?.after.agentPhase, 'failed');
  });

  it('aggregateAgentPhase follows the documented precedence and never guesses', () => {
    assert.equal(aggregateAgentPhase([]), 'unknown');
    assert.equal(aggregateAgentPhase(['failed', 'running']), 'failed');
    assert.equal(aggregateAgentPhase(['running', 'blocked']), 'blocked');
    assert.equal(aggregateAgentPhase(['running', 'waiting_approval']), 'waiting_approval');
    assert.equal(aggregateAgentPhase(['idle', 'running']), 'running');
    assert.equal(aggregateAgentPhase(['completed', 'verifying']), 'verifying');
    assert.equal(aggregateAgentPhase(['completed']), 'completed');
    assert.equal(aggregateAgentPhase(['completed', 'completed']), 'completed');
    assert.equal(aggregateAgentPhase(['idle']), 'idle');
    assert.equal(aggregateAgentPhase(['idle', 'completed']), 'idle');
    assert.equal(aggregateAgentPhase(['unknown']), 'unknown');
    assert.equal(aggregateAgentPhase(['unknown', 'idle']), 'unknown');
  });
});

describe('RoomStatus IR — AE-01 projection dogfood (fixture occupancy only)', () => {
  interface FixtureCase {
    readonly name: string;
    readonly snapshot: RoomSnapshotBody;
    readonly expected: Record<string, unknown>;
  }
  // dist/test/<file>.js → repo root → packages/<pkg>/fixtures/
  const fixturePath = new URL('../../packages/room-status/fixtures/room-status-projection-fixtures.json', import.meta.url);
  const fixtures = JSON.parse(readFileSync(fileURLToPath(fixturePath), 'utf8')) as { note: string; cases: FixtureCase[] };

  it('the fixture corpus stays synthetic — every room id is fixture-prefixed', () => {
    for (const testCase of fixtures.cases) {
      assert.ok(testCase.snapshot.room_id.startsWith('fixture-'), `${testCase.name} must stay synthetic`);
    }
  });

  it('maps every documented fixture case to the expected RoomStatus', () => {
    for (const testCase of fixtures.cases) {
      const projected = projectRoomSnapshot(testCase.snapshot);
      assert.deepEqual(JSON.parse(JSON.stringify(projected)), testCase.expected, `case ${testCase.name}`);
    }
  });

  it('can never derive completed from a snapshot — no completion gate exists on main', () => {
    for (const state of EXECUTION_STATES) {
      const snapshot = {
        room_id: 'fixture-room-no-green',
        occupancy: 'OCCUPIED',
        block_reason: 'NONE',
        input_authority: { kind: 'UNOWNED' },
        executions: [{ execution_id: 'exec-x', state, cursors: { ptyOutputSeq: 1, ptyCheckpointSeq: 1, resizeEpoch: 1, durableCommittedSeq: 1 }, history_truncated: false }],
        viewers: [],
        room_seq: 1,
      } as const;
      const projected = projectRoomSnapshot(snapshot, { strict: true });
      assert.notEqual(projected.agentPhase, 'completed', `state ${state} must never read completed`);
      assert.equal(EXECUTION_STATE_TO_AGENT_PHASE[state] === 'completed', false);
    }
  });

  it('mapping tables are total over the AE-01 closed vocabularies', () => {
    assert.deepEqual(Object.keys(OCCUPANCY_TO_ROOM_OCCUPANCY).sort(), [...OCCUPANCY_STATES].sort());
    assert.deepEqual(Object.keys(AE01_BLOCK_REASON_TO_ROOM_BLOCK_REASON).sort(), [...BLOCK_REASONS].sort());
    assert.deepEqual(Object.keys(EXECUTION_STATE_TO_AGENT_PHASE).sort(), [...EXECUTION_STATES].sort());
    // WAITING_FOUNDER is the one honest human_hold; everything unnamed is other_named.
    assert.equal(AE01_BLOCK_REASON_TO_ROOM_BLOCK_REASON['WAITING_FOUNDER'], 'human_hold');
    assert.equal(AE01_BLOCK_REASON_TO_ROOM_BLOCK_REASON['CRASH_LOOP'], 'other_named');
  });
});
