/**
 * Unit and negative tests for the four §6.2 serialization contracts
 * (`docs/command-journal-contract.md` v0.17): structural presence,
 * recorded-order collections, the explicit record-class discriminator,
 * the decision-class element fence, and the `plan_hash` presence
 * derivation — including the mechanical re-derivation of the no-PlanDoc
 * effective states against the ratified T1–T22 table.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  NON_TERMINAL_STATES,
  TRANSITIONS,
  type State,
} from '../packages/contracts/src/index.js';
import {
  GENESIS_CHAIN_HASH,
  NO_PLANDOC_EFFECTIVE_STATES,
  chainHash,
  effectivePlanBearingState,
  encodeCommandEventRow,
  encodeDecisionRecordRow,
  encodeEnvelope,
  encodePlanDoc,
  envelopeDigest,
  planHash,
  planHashRequired,
  type CommandEventRow,
  type DecisionRecordRow,
  type NormalizedCommandEnvelope,
} from '../packages/journal/src/index.js';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

/** lp(specId) then the record_class field: tag 0x01, present, lp(class). */
const expectedRowPrefixHex = (specId: string, recordClass: string): string =>
  Buffer.concat([
    u32(specId.length),
    Buffer.from(specId, 'ascii'),
    Buffer.of(0x01, 0x01),
    u32(recordClass.length),
    Buffer.from(recordClass, 'ascii'),
  ]).toString('hex');

const RECORDED_AT = '2026-09-01T12:00:00.000000Z';

const ENVELOPE: NormalizedCommandEnvelope = {
  envelopeVersion: '1',
  commandKind: 'planner.invoke',
  argv: ['--goal', 'goal_example_0001'],
};

const journaledRow = (extra: Partial<CommandEventRow> = {}): CommandEventRow => ({
  seq: '1',
  eventType: 'journaled',
  commandId: 'cmd_example_0001',
  actorId: 'agent.planner',
  roleId: 'planner',
  repository: 'example-org/example-repo',
  scopeRef: 'scope_example_0001',
  commandEnvelope: ENVELOPE,
  envelopeDigest: envelopeDigest(ENVELOPE),
  authorizationRef: 'auth_example_0001',
  intendedProvider: 'example-provider',
  intendedModel: 'example-model-1',
  intendedSurface: 'example-surface',
  evidenceRefs: [],
  recordedAt: RECORDED_AT,
  ...extra,
});

const preplanCancel = (extra: Partial<DecisionRecordRow> = {}): DecisionRecordRow => ({
  seq: '1',
  decision: 'founder.cancel',
  actorId: 'founder',
  recordedState: 'ROOM_CREATED',
  authorizationRef: 'auth_example_0001',
  lifecycleEventRef: { roomId: 'room_example_0001', eventId: 'evt_example_0001' },
  recordedAt: RECORDED_AT,
  ...extra,
});

const approval = (extra: Partial<DecisionRecordRow> = {}): DecisionRecordRow => ({
  seq: '2',
  decision: 'plan.approved',
  actorId: 'founder',
  recordedState: 'PLAN_REVIEW',
  planHash: planHash({ plan_version: '1' }),
  authorizationRef: 'auth_example_0002',
  lifecycleEventRef: { roomId: 'room_example_0001', eventId: 'evt_example_0002' },
  recordedAt: RECORDED_AT,
  ...extra,
});

describe('spec (a) — normalized command envelope', () => {
  it('distinguishes argv order, absence, and field boundaries structurally', () => {
    const base = encodeEnvelope(ENVELOPE);
    const reordered = encodeEnvelope({ ...ENVELOPE, argv: ['goal_example_0001', '--goal'] });
    assert.notEqual(hex(base), hex(reordered));

    const withTarget = encodeEnvelope({ ...ENVELOPE, targetRepository: 'example-org/example-repo' });
    assert.notEqual(hex(base), hex(withTarget));

    const boundaryA = encodeEnvelope({ ...ENVELOPE, commandKind: 'planner.invoke', argv: ['ab', 'c'] });
    const boundaryB = encodeEnvelope({ ...ENVELOPE, commandKind: 'planner.invoke', argv: ['a', 'bc'] });
    assert.notEqual(hex(boundaryA), hex(boundaryB));
  });

  it('rejects a wrong envelope version and empty required values', () => {
    assert.throws(() => encodeEnvelope({ ...ENVELOPE, envelopeVersion: '2' }), /envelope_version/);
    assert.throws(() => encodeEnvelope({ ...ENVELOPE, commandKind: '  ' }), /command_kind/);
    assert.throws(() => encodeEnvelope({ ...ENVELOPE, scopeRef: '' }), /scope_ref/);
  });
});

describe('spec (b) — PlanDoc canonical document tree', () => {
  it('encodes object entries by UTF-8 key order regardless of declaration order', () => {
    const declaredOneWay = planHash({ alpha: 1, zeta: 'z', middle: [true, null] });
    const declaredOtherWay = planHash({ zeta: 'z', middle: [true, null], alpha: 1 });
    assert.equal(declaredOneWay, declaredOtherWay);
  });

  it('keeps array order significant', () => {
    assert.notEqual(planHash({ steps: [1, 2] }), planHash({ steps: [2, 1] }));
  });

  it('rejects values with no canonical form', () => {
    assert.throws(() => planHash({ bad: 1.5 }), /non-integer/);
    assert.throws(() => planHash({ bad: -0 }), /negative zero/);
    assert.throws(() => planHash({ bad: Number.MAX_SAFE_INTEGER + 2 }), /non-integer/);
    assert.throws(
      () => encodePlanDoc([] as unknown as Parameters<typeof encodePlanDoc>[0]),
      /root/,
    );
  });
});

describe('spec (c) — command-class event row', () => {
  it('carries the record class as an explicit field and hashes evidence in recorded order', () => {
    const inOrder = encodeCommandEventRow(journaledRow({
      evidenceRefs: ['evidence_example_0001', 'evidence_example_0002'],
    }));
    const reversed = encodeCommandEventRow(journaledRow({
      evidenceRefs: ['evidence_example_0002', 'evidence_example_0001'],
    }));
    assert.notEqual(hex(inOrder), hex(reversed));
    const prefix = expectedRowPrefixHex('BRJ:c:1', 'command');
    assert.equal(hex(inOrder).slice(0, prefix.length), prefix);
  });

  it('enforces the per-event field legality matrix', () => {
    assert.throws(() => encodeCommandEventRow(journaledRow({ authorizationRef: undefined })), /authorizationRef is required/);
    assert.throws(() => encodeCommandEventRow(journaledRow({ provider: 'example-provider' })), /not carried by a journaled/);
    assert.throws(
      () => encodeCommandEventRow({
        seq: '2', eventType: 'identity_bound', commandId: 'cmd_example_0001',
        evidenceRefs: [], recordedAt: RECORDED_AT,
      }),
      /nothing to bind/,
    );
    assert.throws(
      () => encodeCommandEventRow({
        seq: '2', eventType: 'identity_bound', commandId: 'cmd_example_0001', runId: 'run_example_0001',
        evidenceRefs: ['evidence_example_0001'], recordedAt: RECORDED_AT,
      }),
      /carries no evidence_refs/,
    );
    assert.throws(
      () => encodeCommandEventRow({
        seq: '3', eventType: 'dispatched', commandId: 'cmd_example_0001',
        provider: 'example-provider', model: 'example-model-1',
        evidenceRefs: [], recordedAt: RECORDED_AT,
      }),
      /executionSurface is required/,
    );
    assert.throws(
      () => encodeCommandEventRow({
        seq: '4', eventType: 'failed', commandId: 'cmd_example_0001',
        evidenceRefs: [], recordedAt: RECORDED_AT,
      }),
      /failureClassification is required/,
    );
    assert.throws(
      () => encodeCommandEventRow({
        seq: '4', eventType: 'failed', commandId: 'cmd_example_0001',
        failureClassification: 'policy_rejection', provider: 'example-provider',
        evidenceRefs: [], recordedAt: RECORDED_AT,
      }),
      /not carried by a failed/,
    );
    assert.throws(
      () => encodeCommandEventRow({
        seq: '5', eventType: 'completed', commandId: 'cmd_example_0001', roomId: 'room_example_0001',
        evidenceRefs: [], recordedAt: RECORDED_AT,
      }),
      /not carried by a completed/,
    );
    assert.throws(
      () => encodeCommandEventRow({
        seq: '6', eventType: 'resolved', commandId: 'cmd_example_0001',
        resolutionDetermination: 'completed',
        evidenceRefs: [], recordedAt: RECORDED_AT,
      }),
      /resolutionSemantics is required/,
    );
  });

  it('binds envelope and digest together and verifies the digest', () => {
    assert.throws(
      () => encodeCommandEventRow(journaledRow({ envelopeDigest: '0'.repeat(64) })),
      /does not match/,
    );
    assert.throws(
      () => encodeCommandEventRow(journaledRow({ envelopeDigest: undefined })),
      /command_envelope without envelope_digest|envelopeDigest is required/,
    );
  });

  it('rejects non-canonical seq, command_id namespace, and recorded_at', () => {
    assert.throws(() => encodeCommandEventRow(journaledRow({ seq: '0' })), /seq/);
    assert.throws(() => encodeCommandEventRow(journaledRow({ seq: '01' })), /seq/);
    assert.throws(() => encodeCommandEventRow(journaledRow({ commandId: 'run_example_0001' })), /cmd_/);
    assert.throws(
      () => encodeCommandEventRow(journaledRow({ recordedAt: '2026-09-01T12:00:00Z' })),
      /recorded_at/,
    );
    assert.throws(
      () => encodeCommandEventRow(journaledRow({ recordedAt: '2026-09-01T12:00:00.000Z' })),
      /recorded_at/,
    );
  });
});

describe('spec (d) — decision-class record row', () => {
  it('encodes plan_hash presence structurally: the two shapes never collide', () => {
    const absent = encodeDecisionRecordRow(preplanCancel());
    const present = encodeDecisionRecordRow(approval());
    assert.notEqual(hex(absent), hex(present));
    const prefix = expectedRowPrefixHex('BRJ:d:1', 'decision');
    assert.equal(hex(absent).slice(0, prefix.length), prefix);
    assert.equal(hex(present).slice(0, prefix.length), prefix);
  });

  it('requires plan_hash at a post-plan state and forbids it pre-plan (no sentinel)', () => {
    assert.throws(() => encodeDecisionRecordRow(approval({ planHash: undefined })), /plan_hash is required/);
    assert.throws(
      () => encodeDecisionRecordRow(preplanCancel({ planHash: planHash({ plan_version: '1' }) })),
      /plan_hash must be absent/,
    );
  });

  it('resolves RECONCILING through prior_state and fails closed without one', () => {
    const cancelOverScoped = preplanCancel({ recordedState: 'RECONCILING', priorState: 'SCOPED' });
    assert.doesNotThrow(() => encodeDecisionRecordRow(cancelOverScoped));
    const cancelOverBuilding = preplanCancel({
      recordedState: 'RECONCILING',
      priorState: 'BUILDING',
      planHash: planHash({ plan_version: '1' }),
    });
    assert.doesNotThrow(() => encodeDecisionRecordRow(cancelOverBuilding));
    assert.throws(
      () => encodeDecisionRecordRow(preplanCancel({ recordedState: 'RECONCILING' })),
      /cannot be written/,
    );
    assert.throws(
      () => encodeDecisionRecordRow(preplanCancel({ recordedState: 'RECONCILING', priorState: 'RECONCILING' })),
      /never be RECONCILING/,
    );
    assert.throws(
      () => encodeDecisionRecordRow(preplanCancel({ recordedState: 'RECONCILING', priorState: 'CLOSED_DELIVERED' })),
      /never be/,
    );
    assert.throws(
      () => encodeDecisionRecordRow(preplanCancel({ priorState: 'SCOPED' })),
      /only when the recorded state is RECONCILING/,
    );
  });

  it('fences the class: T4/T5 fire only from PLAN_REVIEW, no terminal states, actor founder', () => {
    assert.throws(() => encodeDecisionRecordRow(approval({ recordedState: 'BUILDING' })), /PLAN_REVIEW/);
    assert.throws(() => encodeDecisionRecordRow(preplanCancel({ recordedState: 'CLOSED_ABANDONED' })), /terminal/);
    assert.throws(() => encodeDecisionRecordRow(preplanCancel({ actorId: 'builder' })), /founder/);
  });

  it('cannot carry elements 1, 4, 8, or 9: the byte grammar has no slot for them', () => {
    const plain = encodeDecisionRecordRow(preplanCancel());
    const smuggled = encodeDecisionRecordRow({
      ...preplanCancel(),
      commandId: 'cmd_example_0001',
      provider: 'example-provider',
      model: 'example-model-1',
      executionSurface: 'example-surface',
      dispatchState: 'completed',
      outcome: 'completed',
    } as unknown as DecisionRecordRow);
    assert.equal(hex(plain), hex(smuggled));
  });

  it('rejects a command shape passed as a decision', () => {
    assert.throws(
      () => encodeDecisionRecordRow(preplanCancel({ decision: 'journaled' as DecisionRecordRow['decision'] })),
      /not a decision event/,
    );
  });
});

describe('chain framing (contract §4.1, §6.2)', () => {
  it('matches the exact byte-input definition from genesis', () => {
    const rowBytes = encodeDecisionRecordRow(preplanCancel());
    const expected = createHash('sha256')
      .update(Buffer.from(GENESIS_CHAIN_HASH, 'ascii'))
      .update(rowBytes)
      .digest('hex');
    assert.equal(chainHash(GENESIS_CHAIN_HASH, rowBytes), expected);
    assert.equal(GENESIS_CHAIN_HASH, '0'.repeat(64));
  });

  it('rejects a malformed prior chain hash', () => {
    const rowBytes = encodeDecisionRecordRow(preplanCancel());
    assert.throws(() => chainHash('00', rowBytes), /64 lowercase hex/);
    assert.throws(() => chainHash('Z'.repeat(64), rowBytes), /64 lowercase hex/);
  });
});

describe('no-PlanDoc effective states — re-derived against the ratified table', () => {
  it('reproduces the derived set from the T1–T22 table with T3 removed', () => {
    const domain = new Set<State>(NON_TERMINAL_STATES.filter((s) => s !== 'RECONCILING'));
    const reachable = new Set<State>(['ROOM_CREATED']);
    let changed = true;
    while (changed) {
      changed = false;
      for (const spec of TRANSITIONS) {
        if (spec.id === 'T3') {
          continue;
        }
        if (!spec.from.some((s) => reachable.has(s))) {
          continue;
        }
        if (spec.target.kind === 'state') {
          if (!reachable.has(spec.target.state)) {
            reachable.add(spec.target.state);
            changed = true;
          }
        }
        // target kind 'prior_state' (T20) resumes to a state RECONCILING was
        // entered from — already a member of the reachable set — so it adds
        // nothing to the walk.
      }
    }
    const derived = [...reachable].filter((s) => domain.has(s)).sort();
    assert.deepEqual(derived, [...NO_PLANDOC_EFFECTIVE_STATES].sort());
  });

  it('planHashRequired agrees with the derivation across the whole domain', () => {
    for (const state of NON_TERMINAL_STATES) {
      if (state === 'RECONCILING') {
        continue;
      }
      const expectedAbsent = (NO_PLANDOC_EFFECTIVE_STATES as readonly string[]).includes(state);
      assert.equal(planHashRequired(state), !expectedAbsent, state);
    }
    assert.equal(effectivePlanBearingState('RECONCILING', 'PLANNING'), 'PLANNING');
    assert.equal(effectivePlanBearingState('BUILDING', undefined), 'BUILDING');
  });
});
