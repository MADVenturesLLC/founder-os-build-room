/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/protocol/src/crypto.ts
 * Blob:   0b81b1b5ff24507c132f5cadfd7ea600373fe677 (unpinned dependency, consumed under the Founder ruling of 2026-10-15)
 * Changes from the source: Bun.CryptoHasher replaced by node:crypto
 *   createHash('sha256'), which yields the same digest for the same string
 *   (UTF-8) or byte input; the exported name and signature are unchanged.
 */
import { createHash } from "node:crypto";

export function sha256Hex(input: string | Uint8Array): string {
  const hasher = createHash("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}
