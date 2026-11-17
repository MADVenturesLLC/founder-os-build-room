/**
 * The §6.2 two-implementation determinism obligation, stated as a test:
 * two conforming implementations must produce byte-identical canonical
 * forms and identical hashes for the same events.
 *
 * The second implementation below is written against the spec documents
 * (`packages/journal/specs/`, (a) to (e)) alone. It imports nothing from
 * `packages/journal/src` — only `node:` builtins and the shared vector
 * INPUT data — and is deliberately structured differently (Buffer-based,
 * validation-free) so agreement is evidence about the byte grammar, not
 * about shared code. The committed golden vectors are the standing
 * cross-implementation witness for any future conforming implementation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  GENESIS_CHAIN_HASH,
  chainHash,
  encodeBindingRecordRow,
  encodeCommandEventRow,
  encodeCommandEventRowV2,
  encodeDecisionRecordRow,
  encodeEnvelope,
  encodePlanDoc,
  envelopeDigest,
  type BindingRecordRow,
  type CommandEventRow,
  type DecisionRecordRow,
  type NormalizedCommandEnvelope,
} from '../packages/journal/src/index.js';
import {
  BINDING_CHAIN_ROWS,
  BINDING_VECTOR_ROWS,
  CHAIN_ROWS,
  DECISION_VECTOR_ROWS,
  ENVELOPE_BUILDER,
  ENVELOPE_FULL,
  ENVELOPE_MINIMAL,
  PLANDOC_EXAMPLE,
} from './support/journal-vector-source.js';

// ---------------------------------------------------------------------------
// Second implementation — from the spec text only.
// ---------------------------------------------------------------------------

const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

const lp = (s: string): Buffer => {
  const bytes = Buffer.from(s, 'utf8');
  return Buffer.concat([u32(bytes.length), bytes]);
};

const lpb = (bytes: Buffer): Buffer => Buffer.concat([u32(bytes.length), bytes]);

const strF = (tag: number, value: string | undefined): Buffer =>
  value === undefined ? Buffer.of(tag, 0x00) : Buffer.concat([Buffer.of(tag, 0x01), lp(value)]);

const bytesF = (tag: number, value: Buffer | undefined): Buffer =>
  value === undefined ? Buffer.of(tag, 0x00) : Buffer.concat([Buffer.of(tag, 0x01), lpb(value)]);

const arrF = (tag: number, items: readonly string[]): Buffer =>
  Buffer.concat([Buffer.of(tag, 0x01), u32(items.length), ...items.map((i) => lp(i))]);

const pairF = (tag: number, pair: { first: string; second: string } | undefined): Buffer =>
  pair === undefined
    ? Buffer.of(tag, 0x00)
    : Buffer.concat([Buffer.of(tag, 0x01), lp(pair.first), lp(pair.second)]);

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function envelope2(env: NormalizedCommandEnvelope): Buffer {
  return Buffer.concat([
    lp('BRJ:a:1'),
    strF(0x01, env.envelopeVersion),
    strF(0x02, env.commandKind),
    arrF(0x03, env.argv),
    strF(0x04, env.targetRepository),
    strF(0x05, env.scopeRef),
  ]);
}

type TreeValue =
  | null
  | boolean
  | number
  | string
  | readonly TreeValue[]
  | { readonly [key: string]: TreeValue };

function value2(value: TreeValue): Buffer {
  if (value === null) return Buffer.of(0x00);
  if (value === false) return Buffer.of(0x01);
  if (value === true) return Buffer.of(0x02);
  if (typeof value === 'number') return Buffer.concat([Buffer.of(0x03), lp(String(value))]);
  if (typeof value === 'string') return Buffer.concat([Buffer.of(0x04), lp(value)]);
  if (Array.isArray(value)) {
    return Buffer.concat([Buffer.of(0x05), u32(value.length), ...value.map((v) => value2(v))]);
  }
  const object = value as { readonly [key: string]: TreeValue };
  const keys = Object.keys(object).sort((a, b) =>
    Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')),
  );
  return Buffer.concat([
    Buffer.of(0x06),
    u32(keys.length),
    ...keys.flatMap((k) => [lp(k), value2(object[k] as TreeValue)]),
  ]);
}

const plandoc2 = (root: { readonly [key: string]: TreeValue }): Buffer =>
  Buffer.concat([lp('BRJ:b:1'), value2(root)]);

function commandRow2(row: CommandEventRow, specId = 'BRJ:c:1'): Buffer {
  return Buffer.concat([
    lp(specId),
    strF(0x01, 'command'),
    strF(0x02, row.seq),
    strF(0x03, row.eventType),
    strF(0x04, row.commandId),
    strF(0x05, row.roomId),
    strF(0x06, row.runId),
    strF(0x07, row.executionId),
    strF(0x08, row.actorId),
    strF(0x09, row.roleId),
    strF(0x0a, row.repository),
    strF(0x0b, row.scopeRef),
    bytesF(0x0c, row.commandEnvelope === undefined ? undefined : envelope2(row.commandEnvelope)),
    strF(0x0d, row.envelopeDigest),
    strF(0x0e, row.authorizationRef),
    strF(0x0f, row.intendedProvider),
    strF(0x10, row.intendedModel),
    strF(0x11, row.intendedSurface),
    strF(0x12, row.provider),
    strF(0x13, row.model),
    strF(0x14, row.executionSurface),
    strF(0x15, row.failureClassification),
    strF(0x16, row.resolutionDetermination),
    strF(0x17, row.resolutionSemantics),
    pairF(
      0x18,
      row.lifecycleEventRef === undefined
        ? undefined
        : { first: row.lifecycleEventRef.roomId, second: row.lifecycleEventRef.eventId },
    ),
    arrF(0x19, row.evidenceRefs),
    strF(0x1a, row.recordedAt),
  ]);
}

function decisionRow2(row: DecisionRecordRow): Buffer {
  return Buffer.concat([
    lp('BRJ:d:1'),
    strF(0x01, 'decision'),
    strF(0x02, row.seq),
    strF(0x03, row.decision),
    strF(0x04, row.actorId),
    strF(0x05, row.recordedState),
    strF(0x06, row.priorState),
    strF(0x07, row.planHash),
    strF(0x08, row.authorizationRef),
    pairF(0x09, {
      first: row.lifecycleEventRef.roomId,
      second: row.lifecycleEventRef.eventId,
    }),
    strF(0x0a, row.recordedAt),
  ]);
}

/** Spec (c) v2: version 1's fields under `BRJ:c:2`, then `init_model` (0x1b) and `provider_conversation_id` (0x1c). */
const commandRowV2_2 = (row: CommandEventRow): Buffer =>
  Buffer.concat([commandRow2(row, 'BRJ:c:2'), strF(0x1b, row.initModel), strF(0x1c, row.providerConversationId)]);

/**
 * Spec (e) v1, from `serialization-e-binding-row.md`: `lp("BRJ:e:1")`, then
 * eleven fields 0x01–0x0b, every one present. Written out byte by byte rather
 * than through the string-field helper, so the presence byte of a required
 * field is spelled here as the spec states it.
 */
function bindingRow2(row: BindingRecordRow): Buffer {
  const required = (tag: number, value: string): Buffer => Buffer.concat([Buffer.of(tag), Buffer.of(0x01), lp(value)]);
  return Buffer.concat([
    lp('BRJ:e:1'),
    required(0x01, 'binding'),
    required(0x02, row.seq),
    required(0x03, row.event),
    required(0x04, row.actorId),
    required(0x05, row.lifecycleRoomId),
    required(0x06, row.runtimeRoomId),
    required(0x07, row.gatewayId),
    required(0x08, row.recordedState),
    required(0x09, row.planHash),
    Buffer.concat([Buffer.of(0x0a, 0x01), lp(row.lifecycleEventRef.roomId), lp(row.lifecycleEventRef.eventId)]),
    required(0x0b, row.recordedAt),
  ]);
}

const chain2 = (prior: string, rowBytes: Buffer): string =>
  sha256(Buffer.concat([Buffer.from(prior, 'ascii'), rowBytes]));

// ---------------------------------------------------------------------------
// The obligation: same events, byte-identical canonical forms, same hashes.
// ---------------------------------------------------------------------------

const hexOf = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

describe('two-implementation determinism (contract §6.2)', () => {
  it('spec (a): both implementations produce identical envelope bytes and digests', () => {
    for (const envelope of [ENVELOPE_FULL, ENVELOPE_MINIMAL]) {
      const first = encodeEnvelope(envelope);
      const second = envelope2(envelope);
      assert.equal(hexOf(first), second.toString('hex'));
      assert.equal(envelopeDigest(envelope), sha256(second));
    }
  });

  it('spec (b): both implementations produce identical PlanDoc bytes and plan_hash', () => {
    const first = encodePlanDoc(PLANDOC_EXAMPLE);
    const second = plandoc2(PLANDOC_EXAMPLE as { readonly [key: string]: TreeValue });
    assert.equal(hexOf(first), second.toString('hex'));
  });

  it('specs (c)/(d) with chain framing: identical rows, identical chain hashes', () => {
    let priorFirst = GENESIS_CHAIN_HASH;
    let priorSecond = GENESIS_CHAIN_HASH;
    for (const entry of CHAIN_ROWS) {
      const first =
        entry.recordClass === 'command'
          ? encodeCommandEventRow(entry.row)
          : encodeDecisionRecordRow(entry.row);
      const second =
        entry.recordClass === 'command' ? commandRow2(entry.row) : decisionRow2(entry.row);
      assert.equal(hexOf(first), second.toString('hex'), entry.name);
      const firstChain = chainHash(priorFirst, first);
      const secondChain = chain2(priorSecond, second);
      assert.equal(firstChain, secondChain, `${entry.name}: chain hash`);
      priorFirst = firstChain;
      priorSecond = secondChain;
    }
  });

  it('spec (d) standalone shapes: identical bytes for every presence shape', () => {
    for (const { name, row } of DECISION_VECTOR_ROWS) {
      assert.equal(
        hexOf(encodeDecisionRecordRow(row)),
        decisionRow2(row).toString('hex'),
        name,
      );
    }
  });

  it('spec (e) standalone binding rows: identical bytes and identical hashes', () => {
    for (const { name, row } of BINDING_VECTOR_ROWS) {
      const first = encodeBindingRecordRow(row);
      const second = bindingRow2(row);
      assert.equal(hexOf(first), second.toString('hex'), name);
      assert.equal(sha256(Buffer.from(first)), sha256(second), `${name}: row hash`);
    }
  });

  it('specs (c) v2, (d) and (e) with chain framing: the binding chain hashes identically', () => {
    assert.equal(hexOf(encodeEnvelope(ENVELOPE_BUILDER)), envelope2(ENVELOPE_BUILDER).toString('hex'));
    let priorFirst = GENESIS_CHAIN_HASH;
    let priorSecond = GENESIS_CHAIN_HASH;
    for (const entry of BINDING_CHAIN_ROWS) {
      const first =
        entry.recordClass === 'command'
          ? encodeCommandEventRowV2(entry.row)
          : entry.recordClass === 'decision'
            ? encodeDecisionRecordRow(entry.row)
            : encodeBindingRecordRow(entry.row);
      const second =
        entry.recordClass === 'command'
          ? commandRowV2_2(entry.row)
          : entry.recordClass === 'decision'
            ? decisionRow2(entry.row)
            : bindingRow2(entry.row);
      assert.equal(hexOf(first), second.toString('hex'), entry.name);
      const firstChain = chainHash(priorFirst, first);
      const secondChain = chain2(priorSecond, second);
      assert.equal(firstChain, secondChain, `${entry.name}: chain hash`);
      priorFirst = firstChain;
      priorSecond = secondChain;
    }
  });
});
