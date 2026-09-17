/**
 * Phase 4 stop-gate §7.1 — append-only, tamper-evident, reconstructable, singular.
 * Honesty: removing guards must turn these red.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  MemoryCommandJournal,
  JournalAppendError,
  resetActiveJournalForTests,
  getActiveJournal,
  GENESIS_CHAIN_HASH,
  chainHash,
  encodeCommandEventRow,
  encodeEnvelope,
  envelopeDigest,
  hexOf,
  type CommandEventRow,
} from '../packages/journal/src/index.js';

const AT = '2026-08-31T18:00:00.000000Z';

function baseRow(overrides: Partial<CommandEventRow> = {}): Omit<CommandEventRow, 'seq'> {
  const envelope = {
    envelopeVersion: '1' as const,
    commandKind: 'planner.invoke',
    argv: ['--goal', 'prove-7.1'],
  };
  const digest = envelopeDigest(envelope);
  return {
    recordClass: 'command',
    commandId: 'cmd_prove710000000001',
    eventType: 'journaled',
    actorId: 'hephaestus-br',
    roleId: 'builder',
    envelopeDigest: digest,
    authorizationRef: 'auth:test',
    recordedAt: AT,
    envelopeCanonicalHex: hexOf(encodeEnvelope(envelope)),
    ...overrides,
  };
}

describe('§7.1 append-only', () => {
  let journal: MemoryCommandJournal;

  beforeEach(() => {
    resetActiveJournalForTests();
    journal = MemoryCommandJournal.open();
  });
  afterEach(() => {
    journal.close();
    resetActiveJournalForTests();
  });

  it('appends in seq order from genesis', () => {
    const r1 = journal.append(baseRow());
    const r2 = journal.append(baseRow({ commandId: 'cmd_prove710000000002', eventType: 'dispatched' }));
    assert.equal(r1.row.seq, '1');
    assert.equal(r2.row.seq, '2');
    assert.equal(r1.priorChainHash, GENESIS_CHAIN_HASH);
    assert.equal(r2.priorChainHash, r1.chainHash);
    assert.equal(journal.verify().ok, true);
  });

  it('refuses UPDATE (honesty: would pass if immutable_row guard removed)', () => {
    journal.append(baseRow());
    assert.throws(
      () => journal.tryUpdate(1, { ...baseRow(), seq: '1', actorId: 'tamper' }),
      (err: unknown) => err instanceof JournalAppendError && err.code === 'immutable_row',
    );
  });

  it('refuses DELETE (honesty: would pass if immutable_row guard removed)', () => {
    journal.append(baseRow());
    assert.throws(
      () => journal.tryDelete(1),
      (err: unknown) => err instanceof JournalAppendError && err.code === 'immutable_row',
    );
  });
});

describe('§7.1 tamper-evident', () => {
  let journal: MemoryCommandJournal;

  beforeEach(() => {
    resetActiveJournalForTests();
    journal = MemoryCommandJournal.open();
  });
  afterEach(() => {
    journal.close();
    resetActiveJournalForTests();
  });

  it('verify detects corrupted chain hash', () => {
    journal.append(baseRow());
    journal.corruptChainHashForTest(1, 'f'.repeat(64));
    const result = journal.verify();
    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /chain hash mismatch/);
  });

  it('verify detects in-place row mutation', () => {
    journal.append(baseRow());
    journal.corruptRowFieldForTest(1, { actorId: 'intruder' });
    const result = journal.verify();
    assert.equal(result.ok, false);
  });

  it('append refuses when chain already diverged', () => {
    journal.append(baseRow());
    journal.corruptChainHashForTest(1, 'a'.repeat(64));
    assert.throws(
      () => journal.append(baseRow({ commandId: 'cmd_prove710000000099' })),
      (err: unknown) => err instanceof JournalAppendError && err.code === 'chain_divergence',
    );
  });

  it('chainHash framing matches SHA-256(priorAscii || rowBytes)', () => {
    const row = { ...baseRow(), seq: '1' };
    const bytes = encodeCommandEventRow(row);
    const expected = createHash('sha256')
      .update(Buffer.from(GENESIS_CHAIN_HASH, 'utf8'))
      .update(bytes)
      .digest('hex');
    assert.equal(chainHash(GENESIS_CHAIN_HASH, bytes), expected);
  });
});

describe('§7.1 reconstructable', () => {
  let journal: MemoryCommandJournal;

  beforeEach(() => {
    resetActiveJournalForTests();
    journal = MemoryCommandJournal.open();
  });
  afterEach(() => {
    journal.close();
    resetActiveJournalForTests();
  });

  it('reconstruct returns seq-ordered history after verify', () => {
    journal.append(baseRow());
    journal.append(baseRow({ commandId: 'cmd_prove710000000002', eventType: 'dispatched' }));
    const history = journal.reconstruct();
    assert.equal(history.length, 2);
    assert.equal(history[0]?.seq, '1');
    assert.equal(history[1]?.seq, '2');
  });

  it('reconstruct fails closed on tamper', () => {
    journal.append(baseRow());
    journal.corruptRowFieldForTest(1, { roleId: 'intruder-role' });
    assert.throws(
      () => journal.reconstruct(),
      (err: unknown) => err instanceof JournalAppendError && err.code === 'chain_divergence',
    );
  });
});

describe('§7.1 singular', () => {
  afterEach(() => {
    resetActiveJournalForTests();
  });

  it('refuses a second authoritative journal while one is active', () => {
    const first = MemoryCommandJournal.open();
    assert.equal(getActiveJournal(), first);
    assert.throws(
      () => MemoryCommandJournal.open(),
      (err: unknown) => err instanceof JournalAppendError && err.code === 'second_writer',
    );
    first.close();
    const second = MemoryCommandJournal.open();
    assert.equal(getActiveJournal(), second);
    second.close();
  });

  it('append on a non-active instance fails closed', () => {
    const first = MemoryCommandJournal.open();
    first.close();
    // After close, ACTIVE is null — reopen a new one, then try append on the old handle.
    const active = MemoryCommandJournal.open();
    assert.throws(
      () => first.append(baseRow()),
      (err: unknown) =>
        err instanceof JournalAppendError &&
        (err.code === 'second_writer' || err.code === 'append_only_violation'),
    );
    active.close();
  });
});
