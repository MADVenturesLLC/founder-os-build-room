/**
 * Envelope construction and signing on the daemon side.
 *
 * The signed bytes come from `@build-room/gateway-protocol` — the same module
 * the control plane rebuilds them with. That is the point of a shared pure
 * package: the two sides cannot drift, because there is only one implementation
 * to drift from.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';
import {
  encodeBase64,
  heartbeatSignedBytes,
  sessionStartSignedBytes,
  type Clock,
} from '../../gateway-protocol/src/index.js';

export interface GatewayIdentity {
  readonly gatewayId: string;
  readonly keyId: string;
  readonly pubkeyBase64: string;
  readonly privateKey: KeyObject;
}

export interface GeneratedKeypair {
  readonly keyId: string;
  readonly pubkeyBase64: string;
  readonly privateKey: KeyObject;
  /**
   * PKCS#8 DER as SINGLE-LINE base64 — what goes into Keychain custody, and
   * nowhere else.
   *
   * Single-line deliberately. `security add-generic-password -w` takes the
   * secret from an interactive prompt that reads one line, so a PEM would be
   * truncated at its first newline and the custody item would silently hold a
   * fragment of a key. Base64 of the DER has no newline to truncate at.
   */
  readonly privateKeySecret: string;
}

export function generateGatewayKeypair(): GeneratedKeypair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x?: string };
  if (typeof jwk.x !== 'string') throw new Error('generated key carried no JWK x member');

  const raw = new Uint8Array(Buffer.from(jwk.x, 'base64url'));
  return {
    keyId: createHash('sha256').update(raw).digest('hex'),
    pubkeyBase64: encodeBase64(raw),
    privateKey,
    privateKeySecret: (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64'),
  };
}

/** Rebuild a private key from custody. The material never leaves this process. */
export function privateKeyFromSecret(secret: string): KeyObject {
  return createPrivateKey({ key: Buffer.from(secret, 'base64'), format: 'der', type: 'pkcs8' });
}

export function publicMembersOf(privateKey: KeyObject): { keyId: string; pubkeyBase64: string } {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' }) as { x?: string };
  if (typeof jwk.x !== 'string') throw new Error('key carried no JWK x member');
  const raw = new Uint8Array(Buffer.from(jwk.x, 'base64url'));
  return {
    keyId: createHash('sha256').update(raw).digest('hex'),
    pubkeyBase64: encodeBase64(raw),
  };
}

function nonce(): string {
  return randomBytes(32).toString('hex');
}

export function buildSessionStart(
  identity: GatewayIdentity,
  challenge: { readonly generation: number; readonly challenge: string },
  clock: Clock,
): Record<string, unknown> {
  const canonical = {
    gatewayId: identity.gatewayId,
    keyId: identity.keyId,
    generation: challenge.generation,
    challenge: challenge.challenge,
    // A FRESH nonce and timestamp on every probe. A polling lane that reused
    // either would be refused as a replay of its own previous request.
    nonce: nonce(),
    timestampMs: clock.wallNow(),
  };
  return {
    protocol: 'founder-os.gateway-protocol',
    version: 1,
    purpose: 'session_start',
    ...canonical,
    pubkey: identity.pubkeyBase64,
    signature: encodeBase64(
      new Uint8Array(sign(null, Buffer.from(sessionStartSignedBytes(canonical)), identity.privateKey)),
    ),
  };
}

export function buildHeartbeat(
  identity: GatewayIdentity,
  epoch: string,
  sequence: number,
  clock: Clock,
): Record<string, unknown> {
  const canonical = {
    gatewayId: identity.gatewayId,
    keyId: identity.keyId,
    epoch,
    sequence,
    nonce: nonce(),
    timestampMs: clock.wallNow(),
  };
  return {
    protocol: 'founder-os.gateway-protocol',
    version: 1,
    purpose: 'heartbeat',
    ...canonical,
    pubkey: identity.pubkeyBase64,
    signature: encodeBase64(
      new Uint8Array(sign(null, Buffer.from(heartbeatSignedBytes(canonical)), identity.privateKey)),
    ),
  };
}
