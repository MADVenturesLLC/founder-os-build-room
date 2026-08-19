/**
 * Shared fixtures for the gateway suites.
 *
 * Lives outside `packages/*​/src` for the same reason `helpers.ts` does: the
 * purity test scans package sources, and nothing here ships. Ed25519 lives here
 * rather than in `@build-room/gateway-protocol` because the protocol package is
 * pure by contract (§2) — signing is the impure side's job, and a test is an
 * impure side.
 */

import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign as cryptoSign,
  type KeyObject,
} from 'node:crypto';
import {
  encodeBase64,
  encodeBase64Url,
  heartbeatSignedBytes,
  sessionStartSignedBytes,
  type HeartbeatCanonicalInput,
  type HeartbeatEnvelope,
  type SessionStartCanonicalInput,
  type SessionStartEnvelope,
} from '../packages/gateway-protocol/src/index.js';

export interface TestKeypair {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  /** The 32 raw public-key bytes — the only thing a fingerprint is taken over. */
  readonly rawPublicKey: Uint8Array;
  /** Standard padded base64 of the 32 raw bytes, as the wire carries it. */
  readonly pubkeyBase64: string;
  /** `sha256(raw32)` lowercase hex — derived exactly as the server derives it. */
  readonly keyId: string;
}

export function generateTestKeypair(): TestKeypair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x?: string };
  if (typeof jwk.x !== 'string') throw new Error('Ed25519 public key carried no JWK x member');
  const rawPublicKey = new Uint8Array(Buffer.from(jwk.x, 'base64url'));
  if (rawPublicKey.length !== 32) throw new Error(`expected 32 raw bytes, got ${rawPublicKey.length}`);
  return {
    privateKey,
    publicKey,
    rawPublicKey,
    pubkeyBase64: encodeBase64(rawPublicKey),
    keyId: createHash('sha256').update(rawPublicKey).digest('hex'),
  };
}

/** Import raw 32 bytes the one documented way the contract names (§8 step 5). */
export function publicKeyFromRaw(raw: Uint8Array): KeyObject {
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: encodeBase64Url(raw) },
    format: 'jwk',
  });
}

export function signBytes(privateKey: KeyObject, bytes: Uint8Array): string {
  return encodeBase64(new Uint8Array(cryptoSign(null, Buffer.from(bytes), privateKey)));
}

export function hex32(): string {
  return randomBytes(32).toString('hex');
}

export function uuid(): string {
  return randomUUID();
}

export interface SessionStartOptions extends SessionStartCanonicalInput {
  readonly signWith?: KeyObject;
}

/** Build a fully signed `session_start` envelope. */
export function makeSessionStart(key: TestKeypair, options: SessionStartOptions): SessionStartEnvelope {
  const input: SessionStartCanonicalInput = {
    gatewayId: options.gatewayId,
    keyId: options.keyId,
    generation: options.generation,
    challenge: options.challenge,
    nonce: options.nonce,
    timestampMs: options.timestampMs,
  };
  return {
    protocol: 'founder-os.gateway-protocol',
    version: 1,
    purpose: 'session_start',
    ...input,
    pubkey: key.pubkeyBase64,
    signature: signBytes(options.signWith ?? key.privateKey, sessionStartSignedBytes(input)),
  };
}

export interface HeartbeatOptions extends HeartbeatCanonicalInput {
  readonly signWith?: KeyObject;
}

/** Build a fully signed `heartbeat` envelope. */
export function makeHeartbeat(key: TestKeypair, options: HeartbeatOptions): HeartbeatEnvelope {
  const input: HeartbeatCanonicalInput = {
    gatewayId: options.gatewayId,
    keyId: options.keyId,
    epoch: options.epoch,
    sequence: options.sequence,
    nonce: options.nonce,
    timestampMs: options.timestampMs,
  };
  return {
    protocol: 'founder-os.gateway-protocol',
    version: 1,
    purpose: 'heartbeat',
    ...input,
    pubkey: key.pubkeyBase64,
    signature: signBytes(options.signWith ?? key.privateKey, heartbeatSignedBytes(input)),
  };
}

/** A wall time inside the monitor's safe range, fixed so nothing depends on now. */
export const FIXED_WALL_MS = 1_770_000_000_000;
