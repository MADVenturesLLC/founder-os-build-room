/**
 * Pre-transaction validation for redemption (contract §8, correction C4).
 *
 * Everything here runs BEFORE the transaction opens, and nothing here consumes
 * anything. That ordering is the correction: when public-key validation sat
 * inside the transaction after the compare-and-consume, a malformed key could
 * interact with code consumption — a defective client could burn a Founder's
 * code by sending 31 bytes. Now a malformed request is refused with the code
 * untouched, and a refusal row records it.
 *
 * The one thing validation deliberately does NOT catch is a structurally valid
 * but substituted public key. That is caught at confirm by the fingerprint
 * bind, which is the ruling's §3.14 control: the Founder compares a fingerprint
 * the machine displayed against one the server derived, and a substitution
 * fails there.
 */

import { createHash, createPublicKey } from 'node:crypto';
import {
  decodeTransportPubkey,
  encodeBase64Url,
  isCanonicalUuid,
} from '../../../gateway-protocol/src/index.js';
import type { HostDescriptor } from '../../../gateway-registry/src/index.js';

export const CODE_MIN_LENGTH = 4;
export const CODE_MAX_LENGTH = 128;
export const HOST_DESCRIPTOR_MAX_BYTES = 2_048;

export interface RedeemRequest {
  /** The exact trimmed string. Case-sensitive; canonicalization is trim-only. */
  readonly code: string;
  readonly rawPublicKey: Uint8Array;
  readonly pubkeyBase64: string;
  readonly keyId: string;
  readonly hostDescriptor: HostDescriptor;
  readonly idempotencyKey: string;
}

export type RedeemValidation =
  | { readonly ok: true; readonly request: RedeemRequest }
  | {
      readonly ok: false;
      readonly code: 'invalid_request' | 'malformed_pubkey';
      readonly detail: string;
    };

const REQUIRED_FIELDS = ['code', 'pubkey', 'hostDescriptor', 'idempotencyKey'] as const;
const HOST_FIELDS = ['hostname', 'os', 'arch'] as const;
const HOST_LIMITS: Readonly<Record<(typeof HOST_FIELDS)[number], number>> = {
  hostname: 253,
  os: 64,
  arch: 16,
};

function invalid(detail: string): RedeemValidation {
  return { ok: false, code: 'invalid_request', detail };
}

function malformedKey(detail: string): RedeemValidation {
  return { ok: false, code: 'malformed_pubkey', detail };
}

export function validateRedeem(body: unknown): RedeemValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return invalid('body must be a JSON object');
  }
  const candidate = body as Record<string, unknown>;

  // 1. Exactly the four fields, no more and no fewer.
  for (const key of Object.keys(candidate)) {
    if (!(REQUIRED_FIELDS as readonly string[]).includes(key)) return invalid(`unknown field ${key}`);
  }
  for (const key of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(candidate, key)) return invalid(`missing field ${key}`);
  }

  // 2. The code, trimmed and bounded. Trim-only: no lowercasing, no re-encoding.
  const rawCode = candidate['code'];
  if (typeof rawCode !== 'string') return invalid('code must be a string');
  const code = rawCode.trim();
  if (code.length < CODE_MIN_LENGTH || code.length > CODE_MAX_LENGTH) {
    return invalid('code length is out of bounds');
  }

  // 3. The idempotency key, a canonical UUID.
  const idempotencyKey = candidate['idempotencyKey'];
  if (typeof idempotencyKey !== 'string' || !isCanonicalUuid(idempotencyKey)) {
    return invalid('idempotencyKey must be a canonical lowercase UUID');
  }

  // 4. The minimum-necessary host descriptor.
  const descriptor = candidate['hostDescriptor'];
  if (typeof descriptor !== 'object' || descriptor === null || Array.isArray(descriptor)) {
    return invalid('hostDescriptor must be an object');
  }
  if (Buffer.byteLength(JSON.stringify(descriptor), 'utf8') > HOST_DESCRIPTOR_MAX_BYTES) {
    return invalid('hostDescriptor exceeds its serialized size limit');
  }
  const host = descriptor as Record<string, unknown>;
  for (const key of Object.keys(host)) {
    if (!(HOST_FIELDS as readonly string[]).includes(key)) {
      return invalid(`hostDescriptor carries an unknown field ${key}`);
    }
  }
  for (const key of HOST_FIELDS) {
    const value = host[key];
    if (typeof value !== 'string' || value.length === 0 || value.length > HOST_LIMITS[key]) {
      return invalid(`hostDescriptor.${key} is missing or out of bounds`);
    }
  }
  const hostDescriptor: HostDescriptor = {
    hostname: host['hostname'] as string,
    os: host['os'] as string,
    arch: host['arch'] as string,
  };

  // 5. The public key: decode, then IMPORT, then assert the algorithm.
  const pubkeyBase64 = candidate['pubkey'];
  if (typeof pubkeyBase64 !== 'string') return malformedKey('pubkey must be a string');
  const rawPublicKey = decodeTransportPubkey(pubkeyBase64);
  if (rawPublicKey === null) {
    return malformedKey('pubkey is not standard padded base64 of exactly 32 bytes');
  }
  /*
   * The import is not decoration. Thirty-two arbitrary bytes are not
   * necessarily a usable Ed25519 point, and the algorithm assertion is what
   * refuses a key of some other type that happens to be 32 bytes long. This is
   * the one documented Node representation for a raw Ed25519 public key.
   */
  try {
    const keyObject = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: encodeBase64Url(rawPublicKey) },
      format: 'jwk',
    });
    if (keyObject.asymmetricKeyType !== 'ed25519') {
      return malformedKey(`imported key is ${String(keyObject.asymmetricKeyType)}, not ed25519`);
    }
  } catch (error) {
    return malformedKey(error instanceof Error ? error.message : 'pubkey could not be imported');
  }

  // 6. The fingerprint, derived server-side from the validated raw bytes.
  const keyId = createHash('sha256').update(rawPublicKey).digest('hex');

  return {
    ok: true,
    request: { code, rawPublicKey, pubkeyBase64, keyId, hostDescriptor, idempotencyKey },
  };
}
