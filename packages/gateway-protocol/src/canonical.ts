/**
 * Canonical-bytes builders — the only place signed bytes are ever constructed,
 * on both sides of the wire (contract §3).
 *
 * One fixed-order array per purpose, and the array **is** the entire signed
 * payload. There is no map, no optional member, and no field order to
 * negotiate, so there is no canonicalization ambiguity for a signature to hide
 * in. The purpose appears twice — in the domain tag and inside the array —
 * which is what makes a cross-purpose replay fail even if a receiver were
 * careless enough to feed one purpose's array to the other's verifier.
 *
 * Inputs are validated again here and a violation **throws**. Validation runs
 * before construction everywhere in this system, so reaching a builder with an
 * unvalidated value is a defect in the caller, not a client error to classify.
 */

import {
  DOMAIN_SEPARATOR_BYTE,
  DOMAIN_TAG_PREFIX,
  PROTOCOL_ID,
  VERSION,
  type Purpose,
} from './constants.js';
import {
  isValidGatewayId,
  isValidGeneration,
  isValidHex32,
  isValidKeyId,
  isValidSequence,
  isValidTimestampMs,
} from './envelope.js';

export interface SessionStartCanonicalInput {
  readonly gatewayId: string;
  readonly keyId: string;
  readonly generation: number;
  readonly challenge: string;
  readonly nonce: string;
  readonly timestampMs: number;
}

export interface HeartbeatCanonicalInput {
  readonly gatewayId: string;
  readonly keyId: string;
  readonly epoch: string;
  readonly sequence: number;
  readonly nonce: string;
  readonly timestampMs: number;
}

/** Every element of a canonical array is one of exactly these two kinds. */
export type CanonicalElement = string | number;

export class CanonicalInputError extends Error {
  override readonly name = 'CanonicalInputError';
}

function require(condition: boolean, field: string): void {
  if (!condition) {
    throw new CanonicalInputError(
      `${field} failed protocol validation before canonical-bytes construction`,
    );
  }
}

export function sessionStartCanonicalArray(
  input: SessionStartCanonicalInput,
): readonly CanonicalElement[] {
  require(isValidGatewayId(input.gatewayId), 'gatewayId');
  require(isValidKeyId(input.keyId), 'keyId');
  require(isValidGeneration(input.generation), 'generation');
  require(isValidHex32(input.challenge), 'challenge');
  require(isValidHex32(input.nonce), 'nonce');
  require(isValidTimestampMs(input.timestampMs), 'timestampMs');

  return [
    PROTOCOL_ID,
    VERSION,
    'session_start',
    input.gatewayId,
    input.keyId,
    input.generation,
    input.challenge,
    input.nonce,
    input.timestampMs,
  ];
}

export function heartbeatCanonicalArray(
  input: HeartbeatCanonicalInput,
): readonly CanonicalElement[] {
  require(isValidGatewayId(input.gatewayId), 'gatewayId');
  require(isValidKeyId(input.keyId), 'keyId');
  require(isValidHex32(input.epoch), 'epoch');
  require(isValidSequence(input.sequence), 'sequence');
  require(isValidHex32(input.nonce), 'nonce');
  require(isValidTimestampMs(input.timestampMs), 'timestampMs');

  return [
    PROTOCOL_ID,
    VERSION,
    'heartbeat',
    input.gatewayId,
    input.keyId,
    input.epoch,
    input.sequence,
    input.nonce,
    input.timestampMs,
  ];
}

/**
 * `utf8(domain tag) || 0x00 || utf8(JSON.stringify(array))`.
 *
 * Exported on its own so a test can assert the framing directly rather than
 * inferring it from a signature that happens to verify.
 */
export function signedBytesFor(purpose: Purpose, array: readonly CanonicalElement[]): Uint8Array {
  const encoder = new TextEncoder();
  const tag = encoder.encode(DOMAIN_TAG_PREFIX + purpose);
  const json = encoder.encode(JSON.stringify(array));

  const out = new Uint8Array(tag.length + 1 + json.length);
  out.set(tag, 0);
  out[tag.length] = DOMAIN_SEPARATOR_BYTE;
  out.set(json, tag.length + 1);
  return out;
}

export function sessionStartSignedBytes(input: SessionStartCanonicalInput): Uint8Array {
  return signedBytesFor('session_start', sessionStartCanonicalArray(input));
}

export function heartbeatSignedBytes(input: HeartbeatCanonicalInput): Uint8Array {
  return signedBytesFor('heartbeat', heartbeatCanonicalArray(input));
}
