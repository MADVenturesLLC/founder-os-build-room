/**
 * Phase 4 stop-gate item 1 (§7.1): the command journal is append-only,
 * tamper-evident, reconstructable, and singular.
 *
 * Contract sections under test, per the §10 test map: §1 (authority and
 * singularity) and §4 (append-only and tamper evidence).
 *
 * The store here is `MemoryCommandJournal`, not the ruled Neon locus of
 * §3 — so what these tests establish is that the invariant set holds over
 * the ratified `BRJ:c:1` bytes, NOT that the production store enforces
 * them. The database-layer grants and the `command_journal_chain_head`
 * latch are separately owed and are not proven here.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  GENESIS_CHAIN_HASH,
  JournalAppendError,
  MemoryCommandJournal,
  chainHash,
  encodeCommandEventRow,
  envelopeDigest,
  type CommandEventRow,
  type NormalizedCommandEnvelope,
} from '../packages/journal/src/index.js';
// Test-only: not on the package's public surface, by design.
import { resetActiveJournalForTests } from '../packages/journal/src/store.js';

function envelopeFor(kind: string): NormalizedCommandEnvelope {
  return {
    envelopeVersion: '1',
    commandKind: kind,
    argv: ['--dry-run'],
    targetRepository: 'MADVenturesLLC/founder-os-build-room',
    scopeRef: 'scope/phase4',
  };
}

/** A complete, valid `journaled` row under §5.2 minus its assigned seq. */
function journaledRow(kind: string, recordedAt: string): Omit<CommandEventRow, 'seq'> {
  const envelope = envelopeFor(kind);
  return {
    eventType: 'journaled',
    commandId: `cmd_${kind}`,
    actorId: 'session:test/journal-7.1',
    roleId: 'builder',
    repository: 'MADVenturesLLC/founder-os-build-room',
    scopeRef: 'scope/phase4',
    commandEnvelope: envelope,
    envelopeDigest: envelopeDigest(envelope),
    authorizationRef: 'HO-20260831-01',
    intendedProvider: 'anthropic',
    intendedModel: 'claude-opus-5',
    intendedSurface: 'claude-code',
    evidenceRefs: [],
    recordedAt,
  };
}

const T1 = '2026-09-17T10:00:00.000000Z';
const T2 = '2026-09-17T10:00:01.000000Z';
const T3 = '2026-09-17T10:00:02.000000Z';

describe('§7.1 journal foundation — append-only, tamper-evident, reconstructable, singular', () => {
  let journal: MemoryCommandJournal;

  beforeEach(() => {
    resetActiveJournalForTests();
    journal = MemoryCommandJournal.open();
  });

  afterEach(() => {
    journal.close();
    resetActiveJournalForTests();
  });

  describe('singularity (§1)', () => {
    it('refuses a second authoritative journal while one is active', () => {
      assert.throws(
        () => MemoryCommandJournal.open(),
        (err: unknown) =>
          err instanceof JournalAppendError && err.code === 'second_writer',
      );
    });

    it('permits a new journal only after the active one closes', () => {
      journal.close();
      const replacement = MemoryCommandJournal.open();
      assert.equal(replacement.headSeq, 0);
      replacement.close();
      // Restore the fixture the afterEach hook closes.
      journal = MemoryCommandJournal.open();
    });

    it('refuses an append from a journal that is no longer the active one', () => {
      const orphan = journal;
      resetActiveJournalForTests();
      const successor = MemoryCommandJournal.open();
      assert.throws(
        () => orphan.append(journaledRow('orphan', T1)),
        (err: unknown) =>
          err instanceof JournalAppendError && err.code === 'second_writer',
      );
      successor.close();
      resetActiveJournalForTests();
      journal = MemoryCommandJournal.open();
    });
  });

  describe('append-only (§4.1)', () => {
    it('refuses UPDATE', () => {
      const record = journal.append(journaledRow('a', T1));
      assert.throws(
        () => journal.tryUpdate(1, record.row),
        (err: unknown) =>
          err instanceof JournalAppendError && err.code === 'immutable_row',
      );
    });

    it('refuses DELETE', () => {
      journal.append(journaledRow('a', T1));
      assert.throws(
        () => journal.tryDelete(1),
        (err: unknown) =>
          err instanceof JournalAppendError && err.code === 'immutable_row',
      );
    });

    it('refuses any append once sealed', () => {
      journal.close();
      assert.throws(
        () => journal.append(journaledRow('a', T1)),
        (err: unknown) =>
          err instanceof JournalAppendError && err.code === 'append_only_violation',
      );
      resetActiveJournalForTests();
      journal = MemoryCommandJournal.open();
    });

    it('assigns seq densely from 1 and refuses a caller-chosen seq that diverges', () => {
      assert.equal(journal.append(journaledRow('a', T1)).row.seq, '1');
      assert.equal(journal.append(journaledRow('b', T2)).row.seq, '2');
      assert.throws(
        () => journal.append({ ...journaledRow('c', T3), seq: '9' }),
        (err: unknown) =>
          err instanceof JournalAppendError && err.code === 'chain_divergence',
      );
      assert.equal(journal.headSeq, 2, 'the refused append inserted nothing');
    });
  });

  describe('chain framing (§4.1, §6.2)', () => {
    it('starts from the 64-ASCII-zero genesis constant', () => {
      assert.equal(GENESIS_CHAIN_HASH, '0'.repeat(64));
      assert.equal(journal.headChainHash, GENESIS_CHAIN_HASH);
      const record = journal.append(journaledRow('a', T1));
      assert.equal(record.priorChainHash, GENESIS_CHAIN_HASH);
    });

    it('chains SHA-256 over prior_hex64_ascii || row_canonical_bytes', () => {
      const first = journal.append(journaledRow('a', T1));
      const second = journal.append(journaledRow('b', T2));

      // Recomputed independently of `chainHash`, straight from the §6.2
      // definition, so agreement is about the framing rather than reuse.
      for (const [record, prior] of [
        [first, GENESIS_CHAIN_HASH],
        [second, first.chainHash],
      ] as const) {
        const expected = createHash('sha256')
          .update(Buffer.from(prior, 'ascii'))
          .update(Buffer.from(record.canonicalHex, 'hex'))
          .digest('hex');
        assert.equal(record.chainHash, expected);
      }
    });

    it('chains over the ratified BRJ:c:1 row bytes, not a local shape', () => {
      const record = journal.append(journaledRow('a', T1));
      const canonical = encodeCommandEventRow(record.row);
      assert.equal(record.canonicalHex, Buffer.from(canonical).toString('hex'));
      assert.equal(record.chainHash, chainHash(GENESIS_CHAIN_HASH, canonical));
    });
  });

  describe('tamper evidence (§4.1)', () => {
    it('verifies a clean chain from genesis', () => {
      journal.append(journaledRow('a', T1));
      journal.append(journaledRow('b', T2));
      const result = journal.verify();
      assert.equal(result.ok, true);
      assert.equal(result.headSeq, 2);
    });

    it('detects a corrupted stored chain hash', () => {
      journal.append(journaledRow('a', T1));
      journal.append(journaledRow('b', T2));
      journal.corruptChainHashForTest(1, 'f'.repeat(64));
      const result = journal.verify();
      assert.equal(result.ok, false);
      assert.match(String(result.reason), /chain hash mismatch at seq 1/);
    });

    it('detects an in-place row mutation', () => {
      journal.append(journaledRow('a', T1));
      journal.corruptRowFieldForTest(1, { actorId: 'session:test/someone-else' });
      const result = journal.verify();
      assert.equal(result.ok, false);
      assert.match(String(result.reason), /chain hash mismatch at seq 1/);
    });

    it('never adopts a head that disagrees with the recomputed tail', () => {
      journal.append(journaledRow('a', T1));
      const trueHead = journal.headChainHash;
      journal.corruptChainHashForTest(1, 'a'.repeat(64));
      assert.notEqual(journal.headChainHash, trueHead);
      // The stored head now reads as the corrupted value, and verify still
      // refuses it rather than treating it as the chain's state.
      assert.equal(journal.verify().ok, false);
    });

    it('detects stored canonical bytes that disagree with the row', () => {
      // The chain hash is recomputed from the ROW, so a mutation of the
      // stored bytes alone would otherwise pass while `recordsSnapshot()`
      // hands out bytes that were never the ones hashed.
      journal.append(journaledRow('a', T1));
      journal.corruptCanonicalHexForTest(1, 'dead');
      const result = journal.verify();
      assert.equal(result.ok, false);
      assert.match(String(result.reason), /stored canonical bytes disagree/);
    });

    it('aborts an append over a diverged chain with no insert (§5.1)', () => {
      journal.append(journaledRow('a', T1));
      journal.corruptChainHashForTest(1, 'b'.repeat(64));
      assert.throws(
        () => journal.append(journaledRow('b', T2)),
        (err: unknown) =>
          err instanceof JournalAppendError && err.code === 'chain_divergence',
      );
      assert.equal(journal.length, 1, 'nothing was inserted');
    });
  });

  describe('reconstruction (§4.1, §10 item 10)', () => {
    it('returns seq-ordered history after a successful verify', () => {
      journal.append(journaledRow('a', T1));
      journal.append(journaledRow('b', T2));
      journal.append(journaledRow('c', T3));
      const history = journal.reconstruct();
      assert.deepEqual(
        history.map((row) => row.seq),
        ['1', '2', '3'],
      );
      assert.deepEqual(
        history.map((row) => row.commandId),
        ['cmd_a', 'cmd_b', 'cmd_c'],
      );
    });

    it('refuses to reconstruct over a tampered chain', () => {
      journal.append(journaledRow('a', T1));
      journal.corruptRowFieldForTest(1, { roleId: 'strategist' });
      assert.throws(
        () => journal.reconstruct(),
        (err: unknown) =>
          err instanceof JournalAppendError && err.code === 'chain_divergence',
      );
    });

    it('hands back copies, so a caller cannot mutate journal state', () => {
      journal.append(journaledRow('a', T1));
      const [row] = journal.reconstruct();
      assert.ok(row);
      (row.evidenceRefs as string[]).push('injected');
      assert.equal(journal.verify().ok, true);
      assert.deepEqual(journal.reconstruct()[0]?.evidenceRefs, []);
    });
  });
});
