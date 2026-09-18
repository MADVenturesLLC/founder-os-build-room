/**
 * Singular, append-only, hash-chained command journal — the §7.1 proof
 * substrate.
 *
 * This is an IN-MEMORY store. The ruled production locus is Neon Postgres
 * with a `command_journal_writer` sole-writer grant and a singleton
 * `command_journal_chain_head` latch (contract §3 [RULED], §4.1); none of
 * that is introduced here. What this module does carry is the same set of
 * invariants that store must enforce, in a form the stop-gate can prove:
 *
 *   - one global chain in `seq` order, genesis = 64 ASCII zeros (§4.1);
 *   - the head is never trusted — `verify()` recomputes from genesis and a
 *     head disagreeing with the recomputed tail is an integrity finding,
 *     surfaced, never adopted (§4.1);
 *   - every append verifies the tail BEFORE writing and aborts on
 *     divergence with no insert, which is a named fail-closed condition
 *     (§5.1);
 *   - rows are never updated or deleted (§4.1);
 *   - the journal is singular: a second authoritative journal cannot be
 *     opened while one is active (§1).
 *
 * Rows are the ratified complete command-class event row (`BRJ:c:1`,
 * §6.2(c)) from `event-row.ts` — not a reduced local shape, so the bytes
 * this store chains are the bytes the production store will chain.
 */

import { GENESIS_CHAIN_HASH, chainHash } from './chain.js';
import { encodeCommandEventRow, type CommandEventRow } from './event-row.js';
import { containsCredentialMaterial } from './redact.js';

export type JournalAppendErrorCode =
  | 'append_only_violation'
  | 'chain_divergence'
  | 'credential_material'
  | 'duplicate_event'
  | 'second_writer'
  | 'immutable_row';

/**
 * Event types that may appear at most once per `command_id` (contract §4.1
 * "Uniqueness, enforced in schema": `(command_id, event_type)` unique for
 * these). In the ruled Neon locus this is a unique index; here it is an
 * explicit check, because the invariant belongs to the journal and not to
 * whichever caller happens to reach it.
 */
const AT_MOST_ONCE_EVENTS: ReadonlySet<string> = new Set([
  'journaled',
  'identity_bound',
  'dispatched',
  'resolved',
]);

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

/**
 * Module-level singularity latch. Singularity is ENFORCED here, not
 * asserted in a comment — the production equivalent is the sole-writer
 * grant of §3.
 */
let ACTIVE_JOURNAL: MemoryCommandJournal | null = null;

export function getActiveJournal(): MemoryCommandJournal | null {
  return ACTIVE_JOURNAL;
}

export function resetActiveJournalForTests(): void {
  ACTIVE_JOURNAL = null;
}

/**
 * Every string in a row that could carry operator-supplied text.
 *
 * This must cover the WHOLE row, not just the envelope: `actorId`,
 * `scopeRef`, `authorizationRef` and the routing identities are all
 * caller-supplied and all reach the persisted bytes. A guard that scanned
 * only `commandEnvelope.argv` would let a secret through in any of them.
 * Each value is scanned separately, never concatenated, so a credential
 * cannot hide beside a redaction marker contributed by another field.
 */
function credentialSurfaceOf(row: Omit<CommandEventRow, 'seq'>): string[] {
  const envelope = row.commandEnvelope;
  return [
    row.commandId,
    row.eventType,
    ...row.evidenceRefs,
    ...(envelope === undefined
      ? []
      : [
          envelope.commandKind,
          ...envelope.argv,
          envelope.targetRepository,
          envelope.scopeRef,
        ]),
    row.roomId,
    row.runId,
    row.executionId,
    row.actorId,
    row.roleId,
    row.repository,
    row.scopeRef,
    row.authorizationRef,
    row.intendedProvider,
    row.intendedModel,
    row.intendedSurface,
    row.provider,
    row.model,
    row.executionSurface,
    row.failureClassification,
    // `lifecycleEventRef` is a nested pair, legal on `journaled` and on
    // several later event types, and both halves are encoded into the
    // chained bytes — so a credential placed there would otherwise survive.
    row.lifecycleEventRef?.roomId,
    row.lifecycleEventRef?.eventId,
  ].filter((value): value is string => value !== undefined);
}

function copyRow(row: CommandEventRow): CommandEventRow {
  return {
    ...row,
    evidenceRefs: [...row.evidenceRefs],
    ...(row.commandEnvelope === undefined
      ? {}
      : { commandEnvelope: { ...row.commandEnvelope, argv: [...row.commandEnvelope.argv] } }),
    // `lifecycleEventRef` is nested too: a shallow spread would leave it
    // shared, so mutating it through a snapshot would rewrite stored state.
    ...(row.lifecycleEventRef === undefined
      ? {}
      : { lifecycleEventRef: { ...row.lifecycleEventRef } }),
  };
}

function copyRecord(record: ChainedJournalRecord): ChainedJournalRecord {
  return { ...record, row: copyRow(record.row) };
}

export class MemoryCommandJournal {
  private readonly records: ChainedJournalRecord[] = [];
  private sealed = false;

  private constructor() {}

  /**
   * Open the singular canonical journal. A second open while one is active
   * fails closed — the singularity proof of §7.1.
   */
  static open(): MemoryCommandJournal {
    if (ACTIVE_JOURNAL !== null) {
      throw new JournalAppendError(
        'second_writer',
        'canonical command journal is singular: a second authoritative journal cannot be opened',
      );
    }
    const journal = new MemoryCommandJournal();
    ACTIVE_JOURNAL = journal;
    return journal;
  }

  /** Release the singularity latch (test and process teardown only). */
  close(): void {
    if (ACTIVE_JOURNAL === this) {
      ACTIVE_JOURNAL = null;
    }
    this.sealed = true;
  }

  get length(): number {
    return this.records.length;
  }

  /**
   * The stored head. Convenience only — it carries no authority and
   * `verify()` never consults it (§4.1).
   */
  get headChainHash(): string {
    const last = this.records[this.records.length - 1];
    return last ? last.chainHash : GENESIS_CHAIN_HASH;
  }

  get headSeq(): number {
    return this.records.length;
  }

  /** Snapshot of appended records, copied deeply enough to be immutable. */
  recordsSnapshot(): readonly ChainedJournalRecord[] {
    return this.records.map(copyRecord);
  }

  /**
   * Append one event. Verifies the tail from genesis first and aborts with
   * no insert on any divergence (§4.1, §5.1), then assigns `seq = head + 1`
   * and chains against the VERIFIED tail.
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
    if (
      AT_MOST_ONCE_EVENTS.has(rowInput.eventType)
      && this.records.some(
        (record) =>
          record.row.commandId === rowInput.commandId
          && record.row.eventType === rowInput.eventType,
      )
    ) {
      throw new JournalAppendError(
        'duplicate_event',
        `${rowInput.eventType} is at most once per command_id: ${rowInput.commandId} already has one`,
      );
    }
    if (containsCredentialMaterial(credentialSurfaceOf(rowInput))) {
      throw new JournalAppendError(
        'credential_material',
        'secrets and credentials must not be persisted in journal records',
      );
    }

    // Verify BEFORE writing: a corrupted tail must abort the append rather
    // than extend a fork (§4.1 append serialization, §5.1 fail closed).
    const verified = this.verify();
    if (!verified.ok) {
      throw new JournalAppendError(
        'chain_divergence',
        `append refused: chain verify failed (${verified.reason ?? 'unknown'})`,
      );
    }

    const seq = String(this.records.length + 1);
    if (rowInput.seq !== undefined && rowInput.seq !== seq) {
      throw new JournalAppendError(
        'chain_divergence',
        `caller seq ${rowInput.seq} diverges from assigned seq ${seq}`,
      );
    }

    const prior = verified.headChainHash;
    // Copy on ingress. A shallow spread would leave the stored row sharing
    // `argv` and `evidenceRefs` with the caller, so a later mutation of the
    // caller's own array would silently rewrite an already-chained row — and
    // since every append re-verifies from genesis, the journal would then
    // refuse every subsequent append with no recovery path.
    const row: CommandEventRow = copyRow({ ...rowInput, seq });
    const canonical = encodeCommandEventRow(row);
    const record: ChainedJournalRecord = {
      row,
      chainHash: chainHash(prior, canonical),
      priorChainHash: prior,
      canonicalHex: Buffer.from(canonical).toString('hex'),
    };
    this.records.push(record);
    // Hand back a copy: returning the stored record would let a caller
    // mutate an already-chained row through `result.journalRecord`.
    return copyRecord(record);
  }

  /**
   * Refuse in-place mutation. Exposed so the honesty tests can attempt
   * UPDATE/DELETE-shaped operations and prove they fail (§4.1).
   */
  tryUpdate(seq: number, row: CommandEventRow): never {
    throw new JournalAppendError(
      'immutable_row',
      `journal rows are append-only: UPDATE of seq ${seq} (${row.eventType}) is refused`,
    );
  }

  tryDelete(seq: number): never {
    throw new JournalAppendError(
      'immutable_row',
      `journal rows are append-only: DELETE of seq ${seq} is refused`,
    );
  }

  /** Recompute the chain from genesis. Never trusts a stored head (§4.1). */
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
      let canonical: Uint8Array;
      try {
        canonical = encodeCommandEventRow(record.row);
      } catch (err) {
        // A row that no longer encodes is tamper, not a crash: the row was
        // valid when appended, so report it as divergence and fail closed.
        return {
          ok: false,
          reason: `row at seq ${record.row.seq} no longer encodes: ${(err as Error).message}`,
          headSeq: i,
          headChainHash: prior,
        };
      }
      if (chainHash(prior, canonical) !== record.chainHash) {
        return {
          ok: false,
          reason: `chain hash mismatch at seq ${record.row.seq}`,
          headSeq: i,
          headChainHash: prior,
        };
      }
      if (Buffer.from(canonical).toString('hex') !== record.canonicalHex) {
        return {
          ok: false,
          reason: `stored canonical bytes disagree with the row at seq ${record.row.seq}`,
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
   * Reconstruct command history from the rows alone, in `seq` order, after
   * a full verify. Fails closed on tamper (§4.1, §10 item 10).
   */
  reconstruct(): readonly CommandEventRow[] {
    const result = this.verify();
    if (!result.ok) {
      throw new JournalAppendError(
        'chain_divergence',
        `reconstruct refused: ${result.reason ?? 'verify failed'}`,
      );
    }
    return this.records.map((record) => copyRow(record.row));
  }

  /** Test-only: corrupt a stored chain hash to prove `verify()` sees it. */
  corruptChainHashForTest(seq: number, bogus: string): void {
    const existing = this.records[seq - 1];
    if (!existing) {
      throw new RangeError(`no record at seq ${seq}`);
    }
    this.records[seq - 1] = { ...existing, chainHash: bogus };
  }

  /** Test-only: corrupt the stored canonical bytes, leaving the row intact. */
  corruptCanonicalHexForTest(seq: number, bogusHex: string): void {
    const existing = this.records[seq - 1];
    if (!existing) {
      throw new RangeError(`no record at seq ${seq}`);
    }
    this.records[seq - 1] = { ...existing, canonicalHex: bogusHex };
  }

  /** Test-only: mutate a row payload in place to prove `verify()` sees it. */
  corruptRowFieldForTest(seq: number, patch: Partial<CommandEventRow>): void {
    const existing = this.records[seq - 1];
    if (!existing) {
      throw new RangeError(`no record at seq ${seq}`);
    }
    this.records[seq - 1] = { ...existing, row: { ...existing.row, ...patch } };
  }
}
