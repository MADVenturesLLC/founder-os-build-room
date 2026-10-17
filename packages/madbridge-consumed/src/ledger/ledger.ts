/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/ledger/src/ledger.ts
 * Blob:   54bc3e512670cca28ec0ce03c87aad0fa593d4f4 (pinned in DEC-20260827-01 §5)
 * Changes from the source: the bun:sqlite Database is replaced by an
 *   in-memory row list. DEC-20260827-01 §3.5 consumes persistence, rebuild
 *   and reconciliation SEMANTICS, "not storage medium or write path"
 *   (DEC-20260815-02 custody and sole-writer rules stay controlling), so the
 *   medium is not carried over and no evidence store is selected here.
 *   Kept exactly: canonical-JSON event bytes, the hash chain from
 *   GENESIS_HASH, sequence numbering from 1, append's all-or-nothing effect,
 *   verify()'s result shape and its first-broken-sequence report,
 *   readAfter(), and the schema's UNIQUE event_id (a duplicate append
 *   throws and writes nothing). The constructor takes no database path.
 */
// packages/ledger/src/ledger.ts
// Append-only hash-chained ledger (Build Room port: in-memory rows; see the
// header for what the SQLite original held that this one does not).

import type { BridgeEventV1 } from "../protocol/index.js";
import { canonicalJson } from "../protocol/index.js";
import { computeEventHash, GENESIS_HASH } from "./hash-chain.js";

export interface LedgerRow {
  sequence: number;
  event_id: string;
  event_json: string;
  previous_hash: string;
  event_hash: string;
  created_at: string;
}

export interface VerifyResult {
  valid: boolean;
  count: number;
  head: string;
  brokenSequence?: number;
}

export class Ledger {
  private rows: LedgerRow[] = [];
  private head: { sequence: number; hash: string } = { sequence: 0, hash: GENESIS_HASH };
  private closed = false;

  append(event: BridgeEventV1): LedgerRow {
    this.assertOpen();
    const eventJson = canonicalJson(event);
    const prevHash = this.getHeadHash();
    const eventHash = computeEventHash(prevHash, eventJson);
    const createdAt = event.created_at;
    const sequence = this.getNextSequence();

    // The SQLite schema's `event_id TEXT UNIQUE`: a duplicate is refused
    // before anything is written, as the failed INSERT rolled back there.
    if (this.rows.some((row) => row.event_id === event.event_id)) {
      throw new Error(`UNIQUE constraint failed: events.event_id`);
    }

    // Insert event + update chain head, together.
    const row: LedgerRow = { sequence, event_id: event.event_id, event_json: eventJson, previous_hash: prevHash, event_hash: eventHash, created_at: createdAt };
    this.rows.push(row);
    this.head = { sequence, hash: eventHash };

    return { ...row };
  }

  verify(): VerifyResult {
    this.assertOpen();
    const rows = this.rows.map((row) => ({ ...row }));

    let expectedPrev = GENESIS_HASH;

    for (const row of rows) {
      if (row.previous_hash !== expectedPrev) {
        return { valid: false, count: rows.length, head: expectedPrev, brokenSequence: row.sequence };
      }
      const recomputed = computeEventHash(row.previous_hash, row.event_json);
      if (recomputed !== row.event_hash) {
        return { valid: false, count: rows.length, head: expectedPrev, brokenSequence: row.sequence };
      }
      expectedPrev = row.event_hash;
    }

    return { valid: true, count: rows.length, head: expectedPrev };
  }

  readAfter(sequence: number): Array<LedgerRow> {
    this.assertOpen();
    return this.rows.filter((row) => row.sequence > sequence).map((row) => ({ ...row }));
  }

  close(): void {
    this.closed = true;
  }

  /**
   * UNSAFE: Test-only method to mutate a payload for tamper detection tests.
   * This intentionally breaks the hash chain.
   */
  unsafeTestOnlyMutatePayload(sequence: number, newJson: string): void {
    const row = this.rows.find((candidate) => candidate.sequence === sequence);
    if (row !== undefined) row.event_json = newJson;
  }

  private getHeadHash(): string {
    return this.head.hash;
  }

  private getNextSequence(): number {
    return this.head.sequence + 1;
  }

  /** A closed SQLite handle refuses every statement; so does a closed ledger here. */
  private assertOpen(): void {
    if (this.closed) throw new Error("ledger is closed");
  }
}
