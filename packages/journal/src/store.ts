/**
 * Singular in-memory command journal — §7.1 foundation proofs.
 *
 * Append-only, hash-chained, reconstructable, singular. This is the proof
 * substrate at pin `ad23c6e`; the Neon sole-writer / chain-head tables from
 * later main are deliberately not introduced here (no new infrastructure,
 * no rebasing onto post-pin journal PRs). The invariants this module
 * enforces are the same ones the production store must enforce.
 */

import { GENESIS_CHAIN_HASH, chainHash } from './chain.js';
import { encodeCommandEventRow, type CommandEventRow } from './row.js';
import { containsCredentialMaterial } from './redact.js';

export type JournalAppendErrorCode =
  | 'append_only_violation'
  | 'chain_divergence'
  | 'credential_material'
  | 'second_writer'
  | 'immutable_row';

export class JournalAppendError extends Error {
  readonly code: JournalAppendErrorCode;
  constructor(code: JournalAppendErrorCode, message: string) {
    super(message);
    this.name = 'JournalAppendError';
    this.code = code;
  }
}

export interface ChainedJournalRecord {
  readonly row: CommandEventRow;
  readonly chainHash: string;
  readonly priorChainHash: string;
  readonly canonicalHex: string;
}

export interface VerifyResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly headSeq: number;
  readonly headChainHash: string;
}

/** Module-level singleton latch — singularity is enforced, not asserted. */
let ACTIVE_JOURNAL: MemoryCommandJournal | null = null;

export function getActiveJournal(): MemoryCommandJournal | null {
  return ACTIVE_JOURNAL;
}

export function resetActiveJournalForTests(): void {
  ACTIVE_JOURNAL = null;
}

export class MemoryCommandJournal {
  private readonly records: ChainedJournalRecord[] = [];
  private sealed = false;
  private readonly writerToken: symbol;

  private constructor(writerToken: symbol) {
    this.writerToken = writerToken;
  }

  /**
   * Open the singular canonical journal. A second open while one is active
   * fails closed — singularity proof (§7.1).
   */
  static open(): MemoryCommandJournal {
    if (ACTIVE_JOURNAL !== null) {
      throw new JournalAppendError(
        'second_writer',
        'canonical command journal is singular: a second authoritative journal cannot be opened',
      );
    }
    const token = Symbol('command_journal_writer');
    const journal = new MemoryCommandJournal(token);
    ACTIVE_JOURNAL = journal;
    return journal;
  }

  /** Close releases the singularity latch (test / process teardown only). */
  close(): void {
    if (ACTIVE_JOURNAL === this) {
      ACTIVE_JOURNAL = null;
    }
    this.sealed = true;
  }

  get length(): number {
    return this.records.length;
  }

  get headChainHash(): string {
    const last = this.records[this.records.length - 1];
    return last ? last.chainHash : GENESIS_CHAIN_HASH;
  }

  get headSeq(): number {
    return this.records.length;
  }

  /** Snapshot of appended records (defensive copy). */
  recordsSnapshot(): readonly ChainedJournalRecord[] {
    return this.records.map((r) => ({ ...r, row: { ...r.row } }));
  }

  /**
   * Append one event. Assigns seq = head+1, chains against verified tail.
   * Rejects credential material, mutation attempts, and sealed journals.
   */
  append(rowInput: Omit<CommandEventRow, 'seq'> & { seq?: string }): ChainedJournalRecord {
    if (this.sealed) {
      throw new JournalAppendError('append_only_violation', 'journal is sealed; append refused');
    }
    if (ACTIVE_JOURNAL !== this) {
      throw new JournalAppendError(
        'second_writer',
        'this journal instance is not the active singular journal',
      );
    }

    // Secret guard: envelope canonical hex must not decode to credential material.
    if (rowInput.envelopeCanonicalHex) {
      const decoded = Buffer.from(rowInput.envelopeCanonicalHex, 'hex').toString('utf8');
      // Soft check on decoded utf8 fragments — also scan the digest path via argv
      // is enforced at the dispatch/normalize boundary; here we refuse obvious leaks.
      if (containsCredentialMaterial([decoded])) {
        throw new JournalAppendError(
          'credential_material',
          'secrets and credentials must not be persisted in journal records',
        );
      }
    }

    const expectedSeq = this.records.length + 1;
    const seq = String(expectedSeq);
    if (rowInput.seq !== undefined && rowInput.seq !== seq) {
      throw new JournalAppendError(
        'chain_divergence',
        `caller seq ${rowInput.seq} diverges from assigned seq ${seq}`,
      );
    }

    const row: CommandEventRow = { ...rowInput, seq };
    const prior = this.headChainHash;
    // Honesty: recompute tail before append — a corrupted in-memory head
    // (test-injected) must abort rather than extend a fork.
    const verified = this.verify();
    if (!verified.ok) {
      throw new JournalAppendError(
        'chain_divergence',
        `append refused: chain verify failed (${verified.reason ?? 'unknown'})`,
      );
    }

    const canonical = encodeCommandEventRow(row);
    const nextHash = chainHash(prior, canonical);
    const record: ChainedJournalRecord = {
      row,
      chainHash: nextHash,
      priorChainHash: prior,
      canonicalHex: Buffer.from(canonical).toString('hex'),
    };
    this.records.push(record);
    return record;
  }

  /**
   * Refuse in-place mutation. Exposed so honesty tests can attempt UPDATE/
   * DELETE style operations and prove they fail.
   */
  tryUpdate(_seq: number, _row: CommandEventRow): never {
    throw new JournalAppendError(
      'immutable_row',
      'journal rows are append-only: UPDATE is refused',
    );
  }

  tryDelete(_seq: number): never {
    throw new JournalAppendError(
      'immutable_row',
      'journal rows are append-only: DELETE is refused',
    );
  }

  /** Recompute the chain from genesis; never trust a stored head. */
  verify(): VerifyResult {
    let prior = GENESIS_CHAIN_HASH;
    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i]!;
      const expectedSeq = String(i + 1);
      if (record.row.seq !== expectedSeq) {
        return {
          ok: false,
          reason: `seq gap or reorder at index ${i}: got ${record.row.seq}, expected ${expectedSeq}`,
          headSeq: i,
          headChainHash: prior,
        };
      }
      const canonical = encodeCommandEventRow(record.row);
      const expected = chainHash(prior, canonical);
      if (expected !== record.chainHash) {
        return {
          ok: false,
          reason: `chain hash mismatch at seq ${record.row.seq}`,
          headSeq: i,
          headChainHash: prior,
        };
      }
      if (record.priorChainHash !== prior) {
        return {
          ok: false,
          reason: `priorChainHash mismatch at seq ${record.row.seq}`,
          headSeq: i,
          headChainHash: prior,
        };
      }
      prior = record.chainHash;
    }
    return { ok: true, headSeq: this.records.length, headChainHash: prior };
  }

  /**
   * Reconstruct command history from records alone (no head trust).
   * Returns rows in seq order after verify; fails closed on tamper.
   */
  reconstruct(): readonly CommandEventRow[] {
    const result = this.verify();
    if (!result.ok) {
      throw new JournalAppendError(
        'chain_divergence',
        `reconstruct refused: ${result.reason ?? 'verify failed'}`,
      );
    }
    return this.records.map((r) => ({ ...r.row }));
  }

  /** Test-only: corrupt a stored chain hash to prove verify detects tamper. */
  corruptChainHashForTest(seq: number, bogus: string): void {
    const idx = seq - 1;
    const existing = this.records[idx];
    if (!existing) throw new RangeError(`no record at seq ${seq}`);
    this.records[idx] = { ...existing, chainHash: bogus };
  }

  /** Test-only: mutate a row payload in place to prove verify detects tamper. */
  corruptRowFieldForTest(seq: number, patch: Partial<CommandEventRow>): void {
    const idx = seq - 1;
    const existing = this.records[idx];
    if (!existing) throw new RangeError(`no record at seq ${seq}`);
    this.records[idx] = {
      ...existing,
      row: { ...existing.row, ...patch },
    };
  }
}
