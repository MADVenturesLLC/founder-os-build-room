/**
 * Spec (c) version 2, `BRJ:c:2`: the two fields a `dispatched` event may carry,
 * `init_model` and `provider_conversation_id`
 * (FOUNDER-ACT-20261028-BR-PLANNER-JOURNAL-FIELDS and its Amendment 1).
 *
 * Proven here: the version 2 grammar is version 1's fields in version 1's order
 * under the version 2 id, then the two fields; neither field has a version 1 form;
 * the fields ride on `dispatched` alone, both or neither, each non-empty; a reader
 * chooses the decoder by the spec id the bytes begin with; and a chain's command
 * rows move from version 1 to version 2 once and never back. The committed
 * cutover chain, `packages/journal/vectors/chain-v2.json`, is re-verified against
 * the §6.2 framing with `node:crypto` directly, and each row decodes to its input.
 *
 * Nothing here writes a row: no store, control plane, wire or daemon path
 * encodes under `BRJ:c:2` (Amendment 1 B3).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import {
  COMMAND_EVENT_TYPES,
  JournalDecodeError,
  SPEC_ID_C,
  SPEC_ID_C2,
  commandSpecOrderDefect,
  decodeCommandEventRow,
  decodeCommandEventRowV2,
  decodeJournalRow,
  encodeCommandEventRow,
  encodeCommandEventRowAs,
  encodeCommandEventRowV2,
  envelopeDigest,
  journalRowSpec,
  type CommandEventRow,
} from '../packages/journal/src/index.js';
import { ENVELOPE_FULL } from './support/journal-vector-source.js';

const vectorsDir = fileURLToPath(new URL('../../packages/journal/vectors/', import.meta.url));
const sha256HexOf = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const lp = (text: string): Buffer => {
  const body = Buffer.from(text, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  return Buffer.concat([length, body]);
};

const dispatched = (extra: Partial<CommandEventRow> = {}): CommandEventRow => ({
  seq: '5',
  eventType: 'dispatched',
  commandId: 'cmd_example_0201',
  provider: 'example-provider',
  model: 'example-model-1',
  executionSurface: 'example-surface',
  evidenceRefs: [],
  recordedAt: '2026-10-28T12:00:00.000000Z',
  ...extra,
});

const withInit = (extra: Partial<CommandEventRow> = {}): CommandEventRow =>
  dispatched({ initModel: 'example-model-1', providerConversationId: 'conv_example_0201', ...extra });

const journaled = (extra: Partial<CommandEventRow> = {}): CommandEventRow => ({
  seq: '1',
  eventType: 'journaled',
  commandId: 'cmd_example_0201',
  actorId: 'agent.planner',
  roleId: 'planner',
  repository: 'example-org/example-repo',
  scopeRef: 'scope_example_0001',
  commandEnvelope: ENVELOPE_FULL,
  envelopeDigest: envelopeDigest(ENVELOPE_FULL),
  authorizationRef: 'auth_example_0201',
  intendedProvider: 'example-provider',
  intendedModel: 'example-model-1',
  intendedSurface: 'example-surface',
  evidenceRefs: [],
  recordedAt: '2026-10-28T12:00:00.000000Z',
  ...extra,
});

describe('BRJ:c:2 grammar', () => {
  it('is version 1 under the version 2 id, then init_model and provider_conversation_id', () => {
    const row = withInit();
    const v1Body = Buffer.from(encodeCommandEventRow(dispatched())).subarray(lp(SPEC_ID_C).length);
    const expected = Buffer.concat([
      lp(SPEC_ID_C2),
      v1Body,
      Buffer.from([0x1b, 0x01]),
      lp('example-model-1'),
      Buffer.from([0x1c, 0x01]),
      lp('conv_example_0201'),
    ]);
    assert.deepEqual(Buffer.from(encodeCommandEventRowV2(row)), expected);
  });

  it('encodes the two fields as absent, structurally, when a row carries neither', () => {
    const v1Body = Buffer.from(encodeCommandEventRow(dispatched())).subarray(lp(SPEC_ID_C).length);
    const expected = Buffer.concat([lp(SPEC_ID_C2), v1Body, Buffer.from([0x1b, 0x00, 0x1c, 0x00])]);
    assert.deepEqual(Buffer.from(encodeCommandEventRowV2(dispatched())), expected);
  });

  it('gives a row with neither field different bytes under each version, so a row is read under the version that wrote it', () => {
    const row = dispatched();
    assert.notDeepEqual(Buffer.from(encodeCommandEventRow(row)), Buffer.from(encodeCommandEventRowV2(row)));
    assert.equal(journalRowSpec(encodeCommandEventRow(row)), SPEC_ID_C);
    assert.equal(journalRowSpec(encodeCommandEventRowV2(row)), SPEC_ID_C2);
  });

  it('encodes every command event type under version 2, with the version 1 rules unchanged', () => {
    assert.ok(COMMAND_EVENT_TYPES.includes('dispatched'));
    assert.doesNotThrow(() => encodeCommandEventRowV2(journaled()));
    assert.throws(() => encodeCommandEventRowV2(journaled({ provider: 'x' })), /provider is not carried by a journaled event/);
    assert.throws(() => encodeCommandEventRowV2(dispatched({ seq: '05' })), /seq is not canonical/);
  });

  it('chooses the encoder by the spec named', () => {
    assert.deepEqual(encodeCommandEventRowAs(SPEC_ID_C, dispatched()), encodeCommandEventRow(dispatched()));
    assert.deepEqual(encodeCommandEventRowAs(SPEC_ID_C2, withInit()), encodeCommandEventRowV2(withInit()));
  });

  it('refuses a spec naming neither command row version, from an untyped caller, rather than encode version 1', () => {
    for (const spec of ['BRJ:d:1', 'BRJ:c:3', '', undefined]) {
      assert.throws(
        () => encodeCommandEventRowAs(spec as unknown as typeof SPEC_ID_C, dispatched()),
        /not a command row spec/,
        String(spec),
      );
    }
  });
});

describe('BRJ:c:2 field rules', () => {
  it('neither field has a version 1 form', () => {
    assert.throws(() => encodeCommandEventRow(withInit()), /have no BRJ:c:1 form/);
    assert.throws(() => encodeCommandEventRow(dispatched({ initModel: 'example-model-1' })), /have no BRJ:c:1 form/);
  });

  it('the fields ride on dispatched alone', () => {
    for (const eventType of COMMAND_EVENT_TYPES) {
      if (eventType === 'dispatched') continue;
      assert.throws(
        () => encodeCommandEventRowV2({ ...journaled(), eventType, initModel: 'm', providerConversationId: 'c' } as CommandEventRow),
        new RegExp(`not carried by a ${eventType} event`),
        eventType,
      );
    }
  });

  it('the fields are carried together or not at all', () => {
    assert.throws(() => encodeCommandEventRowV2(dispatched({ initModel: 'example-model-1' })), /together or not at all/);
    assert.throws(() => encodeCommandEventRowV2(dispatched({ providerConversationId: 'conv_example_0201' })), /together or not at all/);
  });

  it('each field is a non-empty string', () => {
    assert.throws(() => encodeCommandEventRowV2(withInit({ initModel: ' ' })), /init_model must be non-empty/);
    assert.throws(() => encodeCommandEventRowV2(withInit({ providerConversationId: '' })), /provider_conversation_id must be non-empty/);
    assert.throws(() => encodeCommandEventRowV2(withInit({ initModel: 7 as unknown as string })), /init_model/);
  });
});

describe('BRJ:c:2 decoding', () => {
  it('round-trips a row with both fields and one with neither', () => {
    for (const row of [withInit(), dispatched(), journaled()]) {
      const bytes = encodeCommandEventRowV2(row);
      assert.deepEqual(decodeCommandEventRowV2(bytes), row);
      assert.deepEqual(decodeJournalRow(bytes), { recordClass: 'command', row });
    }
  });

  it('reads version 1 bytes with the version 1 decoder and never as version 2, and the reverse', () => {
    const v1 = encodeCommandEventRow(dispatched());
    const v2 = encodeCommandEventRowV2(dispatched());
    assert.throws(() => decodeCommandEventRowV2(v1), /expected spec BRJ:c:2/);
    assert.throws(() => decodeCommandEventRow(v2), /expected spec BRJ:c:1/);
    assert.deepEqual(decodeJournalRow(v1).row, dispatched());
  });

  it('refuses version 1 field bytes under the version 2 id, lacking the two trailing fields', () => {
    const v1Body = Buffer.from(encodeCommandEventRow(dispatched())).subarray(lp(SPEC_ID_C).length);
    const forged = new Uint8Array(Buffer.concat([lp(SPEC_ID_C2), v1Body]));
    assert.throws(() => decodeJournalRow(forged), JournalDecodeError);
  });

  it('refuses a present init field on a row whose other fields make it illegal there', () => {
    const v1Body = Buffer.from(encodeCommandEventRow(journaled())).subarray(lp(SPEC_ID_C).length);
    const forged = new Uint8Array(
      Buffer.concat([lp(SPEC_ID_C2), v1Body, Buffer.from([0x1b, 0x01]), lp('m'), Buffer.from([0x1c, 0x01]), lp('c')]),
    );
    assert.throws(() => decodeJournalRow(forged), /the decoded row is not valid \(init_model and provider_conversation_id are not carried by a journaled event\)/);
  });

  it('refuses trailing bytes after the last version 2 field', () => {
    const bytes = new Uint8Array(Buffer.concat([Buffer.from(encodeCommandEventRowV2(withInit())), Buffer.from([0x00])]));
    assert.throws(() => decodeCommandEventRowV2(bytes), /trailing bytes/);
  });
});

describe('a chain moves from BRJ:c:1 to BRJ:c:2 once and never back', () => {
  it('accepts version 1 rows, then version 2 rows, and either alone', () => {
    assert.equal(commandSpecOrderDefect([]), null);
    assert.equal(commandSpecOrderDefect([SPEC_ID_C, SPEC_ID_C]), null);
    assert.equal(commandSpecOrderDefect([SPEC_ID_C2, SPEC_ID_C2]), null);
    assert.equal(commandSpecOrderDefect([SPEC_ID_C, SPEC_ID_C, SPEC_ID_C2, SPEC_ID_C2]), null);
  });

  it('refuses a version 1 command row after a version 2 one', () => {
    assert.equal(commandSpecOrderDefect([SPEC_ID_C, SPEC_ID_C2, SPEC_ID_C]), 'row 2 is a BRJ:c:1 command row after a BRJ:c:2 one');
  });

  it('skips decision rows wherever they sit, and still refuses a downgrade across one (Tier-2 F1)', () => {
    assert.equal(commandSpecOrderDefect([SPEC_ID_C, 'BRJ:d:1', SPEC_ID_C2]), null);
    assert.equal(commandSpecOrderDefect(['BRJ:d:1', SPEC_ID_C2, 'BRJ:d:1', SPEC_ID_C2]), null);
    assert.equal(commandSpecOrderDefect(['BRJ:d:1']), null);
    assert.equal(commandSpecOrderDefect([SPEC_ID_C2, 'BRJ:d:1', SPEC_ID_C]), 'row 2 is a BRJ:c:1 command row after a BRJ:c:2 one');
  });

  it('refuses a spec id that names no journal row spec', () => {
    assert.match(commandSpecOrderDefect([SPEC_ID_C, 'BRJ:x:1']) ?? '', /row 1 names no journal row spec/);
    assert.match(commandSpecOrderDefect([SPEC_ID_C, 'BRJ:d:2']) ?? '', /row 1 names no journal row spec/);
  });
});

interface ChainV2Row {
  readonly name: string;
  readonly record_class: string;
  readonly spec: string;
  readonly input: CommandEventRow & { readonly eventType?: string };
  readonly canonical_hex: string;
  readonly row_sha256: string;
  readonly prior_chain_hash: string;
  readonly chain_hash: string;
}

describe('the committed BRJ:c:2 cutover chain', () => {
  const parsed = JSON.parse(readFileSync(`${vectorsDir}chain-v2.json`, 'utf8')) as {
    specs: readonly string[];
    genesis: string;
    rows: readonly ChainV2Row[];
  };

  it('verifies from the 64-zero genesis in seq order under the §6.2 framing', () => {
    assert.equal(parsed.genesis, '0'.repeat(64));
    let prior = parsed.genesis;
    for (const row of parsed.rows) {
      assert.equal(row.prior_chain_hash, prior, `${row.name}: prior linkage`);
      const bytes = Buffer.from(row.canonical_hex, 'hex');
      assert.equal(sha256HexOf(bytes), row.row_sha256, `${row.name}: row hash`);
      assert.equal(sha256HexOf(Buffer.concat([Buffer.from(prior, 'ascii'), bytes])), row.chain_hash, `${row.name}: chain framing`);
      prior = row.chain_hash;
    }
  });

  it('each row begins with its stated spec and decodes to exactly its input', () => {
    for (const row of parsed.rows) {
      const bytes = new Uint8Array(Buffer.from(row.canonical_hex, 'hex'));
      assert.equal(journalRowSpec(bytes), row.spec, row.name);
      const decoded = decodeJournalRow(bytes);
      assert.equal(decoded.recordClass, row.record_class, row.name);
      assert.deepEqual(decoded.row, row.input, row.name);
    }
  });

  it('moves from BRJ:c:1 to BRJ:c:2 once, with a decision row between, and covers both init shapes', () => {
    assert.equal(commandSpecOrderDefect(parsed.rows.map((r) => r.spec)), null, 'the whole chain, decision row included');
    const commandSpecs = parsed.rows.filter((r) => r.record_class === 'command').map((r) => r.spec);
    assert.ok(commandSpecs.includes(SPEC_ID_C) && commandSpecs.includes(SPEC_ID_C2), 'both versions on one chain');
    assert.ok(parsed.rows.some((r) => r.record_class === 'decision'), 'a decision row on the same chain');
    const v2Dispatched = parsed.rows.filter((r) => r.spec === SPEC_ID_C2 && r.input.eventType === 'dispatched');
    assert.ok(v2Dispatched.some((r) => r.input.initModel !== undefined && r.input.providerConversationId !== undefined), 'a dispatched row with both fields');
    assert.ok(v2Dispatched.some((r) => r.input.initModel === undefined && r.input.providerConversationId === undefined), 'a dispatched row with neither');
    assert.deepEqual([...parsed.specs], [SPEC_ID_C, SPEC_ID_C2, 'BRJ:d:1']);
  });
});
