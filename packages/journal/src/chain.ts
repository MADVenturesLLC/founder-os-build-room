/**
 * Chain framing for the one global journal chain (contract §4.1, §6.2).
 *
 * `chain_hash` = SHA-256 over the prior row's chain hash rendered as its 64
 * lowercase-hex ASCII bytes (the 64-ASCII-zero genesis constant for the
 * first row) followed by the row's canonical byte sequence per the (c) or
 * (d) specification as the row's record class determines.
 *
 * This pure framing function rides in 2a because the §6.2 chain vectors
 * cannot be generated without it. The production hashing path — append
 * protocol, chain-head, store — is 2b and none of it exists here.
 */

import { concatBytes, isHex64, sha256Hex, utf8 } from './bytes.js';

/** The first row's prior-hash input: 64 ASCII `0` characters (contract §4.1). */
export const GENESIS_CHAIN_HASH = '0'.repeat(64);

/**
 * The chain hash of a row, given the prior row's chain hash (or the genesis
 * constant) and the row's canonical bytes per its record class's spec.
 */
export function chainHash(priorChainHash: string, rowCanonicalBytes: Uint8Array): string {
  if (!isHex64(priorChainHash)) {
    throw new RangeError('prior chain hash must be 64 lowercase hex characters');
  }
  return sha256Hex(concatBytes([utf8(priorChainHash), rowCanonicalBytes]));
}
