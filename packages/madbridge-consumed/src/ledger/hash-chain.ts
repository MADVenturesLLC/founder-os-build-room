/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/ledger/src/hash-chain.ts
 * Blob:   1fa4302ca3b0e60326dab7a22dcf8c2c6c96744a (unpinned dependency, consumed under the Founder ruling of 2026-10-15)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/ledger/src/hash-chain.ts
// SHA-256 hash chain computation for ledger events.

import { sha256Hex } from "../protocol/index.js";

export const GENESIS_HASH = "0".repeat(64);

export function computeEventHash(previousHash: string, eventJson: string): string {
  const input = previousHash + eventJson;
  return sha256Hex(input);
}