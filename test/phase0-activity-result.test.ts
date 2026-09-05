/**
 * Phase 0 ActivityResult durability proof (act item 5.17; freeze receipt
 * implementation-design note; r4.1 §6.2).
 *
 * The freeze receipt (2026-09-03-room-runtime-r4-stack-FREEZE.md) carries
 * the Founder clarification, normative for implementation design:
 *
 *   "`ActivityResult` may be published **only after** it is durable. If
 *    Gateway cannot observe and persist the forced exit (including
 *    `PrivateTransportExhausted` / fail-closed), emit `ExitUnknown`. The
 *    receipt does **not** need to have existed *before* the failure; it
 *    must be durably recorded *before* it is published as
 *    `ActivityResult`. Publishing without durability is forbidden."
 *
 * Proves as a state-machine fixture with a real fsync'd receipt file:
 *
 *  1. an exit observed while the writer is alive AND fsynced → published
 *     `ActivityResult`;
 *  2. a Gateway-crash exit with no durable receipt → `ExitUnknown`,
 *     never `executed`;
 *  3. publication order: durable fsync happens BEFORE the publish flag
 *     flips — a publish without a preceding durable write is rejected;
 *  4. display: `ExitUnknown` never displays as `executed`.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type ExitObservation =
  | { readonly kind: 'observed'; readonly exit_code: number }
  | { readonly kind: 'unobserved'; readonly reason: string };

type PublishedReceipt =
  | { readonly kind: 'ActivityResult'; readonly exit_code: number }
  | { readonly kind: 'ExitUnknown'; readonly reason: string };

interface ReceiptLedger {
  /** Durable append (fsync) of a receipt. Returns false if it failed. */
  persist(receipt: PublishedReceipt): boolean;
  /** Read back the last durable receipt. */
  last(): PublishedReceipt | null;
}

function openLedger(dir: string): ReceiptLedger {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'receipts.jsonl');
  return {
    persist(receipt) {
      try {
        const fd = openSync(path, 'a');
        try {
          writeSync(fd, `${JSON.stringify(receipt)}\n`);
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
        return true;
      } catch {
        return false;
      }
    },
    last() {
      if (!existsSync(path)) return null;
      const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l !== '');
      if (lines.length === 0) return null;
      return JSON.parse(lines[lines.length - 1] as string) as PublishedReceipt;
    },
  };
}

/**
 * The frozen publish rule: publish ActivityResult ONLY after it is durable;
 * otherwise ExitUnknown. `persistOk` false simulates a fsync failure (disk
 * full class, AT-R4-29 adjacent) — durability cannot be established, so no
 * ActivityResult may be published.
 */
function publishExit(
  observation: ExitObservation,
  ledger: ReceiptLedger,
  persistOk: boolean,
): PublishedReceipt {
  if (observation.kind === 'observed' && persistOk) {
    const receipt: PublishedReceipt = {
      kind: 'ActivityResult',
      exit_code: observation.exit_code,
    };
    const durable = ledger.persist(receipt);
    if (!durable) {
      return { kind: 'ExitUnknown', reason: 'persist-failed' };
    }
    return receipt;
  }
  const reason =
    observation.kind === 'unobserved' ? observation.reason : 'persist-failed';
  const unknown: PublishedReceipt = { kind: 'ExitUnknown', reason };
  ledger.persist(unknown);
  return unknown;
}

function displayOf(receipt: PublishedReceipt): string {
  if (receipt.kind === 'ActivityResult' && receipt.exit_code === 0) return 'executed';
  if (receipt.kind === 'ActivityResult') return 'failed';
  return 'exit-unknown';
}

describe('phase0 ActivityResult durability (freeze receipt note; r4.1 §6.2)', () => {
  let dir: string;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'phase0-activity-'));
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('publishes ActivityResult only after the receipt is durable', () => {
    const ledger = openLedger(dir);
    const receipt = publishExit({ kind: 'observed', exit_code: 0 }, ledger, true);
    assert.equal(receipt.kind, 'ActivityResult');
    assert.equal(receipt.kind === 'ActivityResult' && receipt.exit_code, 0);
    // Durable BEFORE published: the ledger already holds the receipt the
    // moment publish returns it.
    const durable = ledger.last();
    assert.ok(durable !== null);
    assert.equal(durable.kind, 'ActivityResult');
  });

  it('Gateway-crash exit with no durable receipt → ExitUnknown, never executed', () => {
    const ledger = openLedger(join(dir, 'crash'));
    const receipt = publishExit(
      { kind: 'unobserved', reason: 'gateway_crash' },
      ledger,
      true,
    );
    assert.equal(receipt.kind, 'ExitUnknown');
    assert.equal(displayOf(receipt) === 'executed', false, 'ExitUnknown must never display as executed');
  });

  it('publish without durability is rejected (persist failure → ExitUnknown)', () => {
    const ledger = openLedger(join(dir, 'persistfail'));
    const receipt = publishExit({ kind: 'observed', exit_code: 0 }, ledger, false);
    assert.equal(receipt.kind, 'ExitUnknown');
    assert.equal(receipt.kind === 'ExitUnknown' && receipt.reason, 'persist-failed');
    assert.equal(displayOf(receipt) === 'executed', false);
  });

  it('PrivateTransportExhausted-class forced exit with durable receipt → ActivityResult; ExitUnknown display stays honest', () => {
    const ledger = openLedger(join(dir, 'pte'));
    // Forced exit observed and persisted (r4.4: durable receipt iff
    // fsynced; else ExitUnknown).
    const forced = publishExit({ kind: 'observed', exit_code: 1 }, ledger, true);
    assert.equal(forced.kind, 'ActivityResult');
    // The display ladder never shows verified/reviewed from a receipt
    // (AT-R4-18 class, checked as vocabulary only).
    assert.equal(displayOf(forced), 'failed');
    // And the unobserved variant:
    const unobserved = publishExit(
      { kind: 'unobserved', reason: 'private_transport_exhausted' },
      ledger,
      true,
    );
    assert.equal(unobserved.kind, 'ExitUnknown');
    assert.equal(displayOf(unobserved), 'exit-unknown');
  });
});

