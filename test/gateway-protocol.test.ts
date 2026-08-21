/**
 * §3 — the exact signed protocol.
 *
 * The property under test throughout is that a signature commits to the whole
 * meaning of a message and not merely to some bytes. Two messages that differ
 * in purpose, in any field, or in signing key must not both verify against one
 * signature — and the receiver must reach that conclusion by rebuilding the
 * canonical bytes itself, never by trusting bytes the client supplied.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verify as cryptoVerify } from 'node:crypto';
import {
  DOMAIN_SEPARATOR_BYTE,
  PROTOCOL_ID,
  VERSION,
  decodeBase64Fixed,
  decodeTransportPubkey,
  decodeTransportSignature,
  heartbeatCanonicalArray,
  heartbeatSignedBytes,
  sessionStartCanonicalArray,
  sessionStartSignedBytes,
  signedBytesFor,
  validateHeartbeat,
  validateSessionStart,
} from '../packages/gateway-protocol/src/index.js';
import {
  FIXED_WALL_MS,
  generateTestKeypair,
  hex32,
  makeHeartbeat,
  makeSessionStart,
  publicKeyFromRaw,
  uuid,
} from './gateway-helpers.js';

const KEY = generateTestKeypair();
const OTHER = generateTestKeypair();
const GATEWAY_ID = uuid();

function baseSessionStart() {
  return {
    gatewayId: GATEWAY_ID,
    keyId: KEY.keyId,
    generation: 7,
    challenge: hex32(),
    nonce: hex32(),
    timestampMs: FIXED_WALL_MS,
  };
}

function baseHeartbeat() {
  return {
    gatewayId: GATEWAY_ID,
    keyId: KEY.keyId,
    epoch: hex32(),
    sequence: 3,
    nonce: hex32(),
    timestampMs: FIXED_WALL_MS,
  };
}

/**
 * The receiver's rule, in one place: validate, rebuild the bytes from the
 * validated fields, verify against the receiver's own derivation. Nothing here
 * reads anything the client sent as "the signed bytes".
 */
function verifySessionStart(body: unknown, rawPublicKey: Uint8Array): boolean {
  const parsed = validateSessionStart(body);
  if (!parsed.ok) return false;
  const envelope = parsed.envelope;
  const rebuilt = sessionStartSignedBytes({
    gatewayId: envelope.gatewayId,
    keyId: envelope.keyId,
    generation: envelope.generation,
    challenge: envelope.challenge,
    nonce: envelope.nonce,
    timestampMs: envelope.timestampMs,
  });
  const signature = decodeTransportSignature(envelope.signature);
  if (signature === null) return false;
  return cryptoVerify(null, Buffer.from(rebuilt), publicKeyFromRaw(rawPublicKey), Buffer.from(signature));
}

describe('§3 canonical bytes — fixed order, one array per purpose', () => {
  it('serializes session_start in the exact ruled order', () => {
    const input = baseSessionStart();
    assert.deepEqual(sessionStartCanonicalArray(input), [
      PROTOCOL_ID,
      1,
      'session_start',
      input.gatewayId,
      input.keyId,
      input.generation,
      input.challenge,
      input.nonce,
      input.timestampMs,
    ]);
  });

  it('serializes heartbeat in the exact ruled order', () => {
    const input = baseHeartbeat();
    assert.deepEqual(heartbeatCanonicalArray(input), [
      PROTOCOL_ID,
      1,
      'heartbeat',
      input.gatewayId,
      input.keyId,
      input.epoch,
      input.sequence,
      input.nonce,
      input.timestampMs,
    ]);
  });

  it('frames signed bytes as utf8(tag) || 0x00 || utf8(json)', () => {
    const array = sessionStartCanonicalArray(baseSessionStart());
    const bytes = signedBytesFor('session_start', array);
    const tag = `${PROTOCOL_ID}/v${VERSION}/session_start`;
    const encoder = new TextEncoder();

    assert.deepEqual(bytes.slice(0, tag.length), encoder.encode(tag));
    assert.equal(bytes[tag.length], DOMAIN_SEPARATOR_BYTE);
    assert.deepEqual(bytes.slice(tag.length + 1), encoder.encode(JSON.stringify(array)));
  });

  it('names the purpose in both the domain tag and the array', () => {
    const text = new TextDecoder().decode(signedBytesFor('heartbeat', heartbeatCanonicalArray(baseHeartbeat())));
    assert.equal(text.split('heartbeat').length - 1, 2, 'purpose must appear in the tag and in the array');
  });
});

describe('gateway-protocol · cross-purpose-replay', () => {
  it('refuses a heartbeat envelope presented to the session-start validator', () => {
    const envelope = makeHeartbeat(KEY, baseHeartbeat());
    const parsed = validateSessionStart(envelope);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.ok === false && parsed.error, 'purpose_mismatch');
  });

  it('refuses a session-start envelope presented to the heartbeat validator', () => {
    const envelope = makeSessionStart(KEY, baseSessionStart());
    const parsed = validateHeartbeat(envelope);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.ok === false && parsed.error, 'purpose_mismatch');
  });

  it('rejects the purpose mismatch before any signature work', () => {
    // The signature is real and correct for its own purpose. Rejection must not
    // depend on it being wrong, because a cross-purpose replay carries a valid
    // signature by construction.
    const heartbeat = makeHeartbeat(KEY, baseHeartbeat());
    const parsed = validateSessionStart(heartbeat);
    assert.equal(parsed.ok === false && parsed.error, 'purpose_mismatch');

    const asSessionStart = validateHeartbeat(heartbeat);
    assert.equal(asSessionStart.ok, true, 'the same envelope verifies as its own purpose');
  });

  it('gives the two purposes different signed bytes for identical field values', () => {
    const shared = { gatewayId: GATEWAY_ID, keyId: KEY.keyId, nonce: hex32(), timestampMs: FIXED_WALL_MS };
    const start = sessionStartSignedBytes({ ...shared, generation: 4, challenge: 'a'.repeat(64) });
    const beat = heartbeatSignedBytes({ ...shared, epoch: 'a'.repeat(64), sequence: 4 });
    assert.notDeepEqual(start, beat);
  });
});

describe('gateway-protocol · changed-field-invalidates', () => {
  const input = baseSessionStart();
  const signed = makeSessionStart(KEY, input);

  it('verifies untampered', () => {
    assert.equal(verifySessionStart(signed, KEY.rawPublicKey), true);
  });

  for (const field of ['gatewayId', 'keyId', 'generation', 'challenge', 'nonce', 'timestampMs'] as const) {
    it(`fails verification when ${field} is changed`, () => {
      const tampered: Record<string, unknown> = { ...signed };
      tampered[field] =
        field === 'generation'
          ? input.generation + 1
          : field === 'timestampMs'
            ? input.timestampMs + 1
            : field === 'gatewayId'
              ? uuid()
              : hex32();
      assert.equal(verifySessionStart(tampered, KEY.rawPublicKey), false);
    });
  }

  it('fails verification when the heartbeat sequence is changed', () => {
    const beat = baseHeartbeat();
    const envelope = makeHeartbeat(KEY, beat);
    const rebuilt = heartbeatSignedBytes({ ...beat, sequence: beat.sequence + 1 });
    const signature = decodeTransportSignature(envelope.signature);
    assert.ok(signature !== null);
    assert.equal(
      cryptoVerify(null, Buffer.from(rebuilt), publicKeyFromRaw(KEY.rawPublicKey), Buffer.from(signature)),
      false,
    );
  });
});

describe('gateway-protocol · wrong-key-invalidates', () => {
  it('fails when a different key signed the same fields', () => {
    const input = baseSessionStart();
    const forged = makeSessionStart(KEY, { ...input, signWith: OTHER.privateKey });
    assert.equal(verifySessionStart(forged, KEY.rawPublicKey), false);
  });

  it('fails when the signature is verified against a different public key', () => {
    const signed = makeSessionStart(KEY, baseSessionStart());
    assert.equal(verifySessionStart(signed, KEY.rawPublicKey), true);
    assert.equal(verifySessionStart(signed, OTHER.rawPublicKey), false);
  });

  it('ignores the client-supplied pubkey — verification uses the receiver-held key', () => {
    // A substituted transport pubkey changes nothing: the receiver verifies
    // against the key it resolved, so the forgery fails.
    const signed = { ...makeSessionStart(KEY, baseSessionStart()), pubkey: OTHER.pubkeyBase64 };
    assert.equal(verifySessionStart(signed, KEY.rawPublicKey), true);
    assert.equal(verifySessionStart(signed, OTHER.rawPublicKey), false);
  });
});

describe('gateway-protocol · malformed-envelope-rejected', () => {
  const good = makeSessionStart(KEY, baseSessionStart());

  for (const body of [null, 'string', 42, [], undefined] as unknown[]) {
    it(`rejects a non-object body: ${JSON.stringify(body) ?? 'undefined'}`, () => {
      const parsed = validateSessionStart(body);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.ok === false && parsed.error, 'invalid_request');
    });
  }

  it('rejects an unknown field', () => {
    const parsed = validateSessionStart({ ...good, extra: 1 });
    assert.equal(parsed.ok === false && parsed.error, 'invalid_request');
  });

  it('rejects a missing field', () => {
    const { nonce: _dropped, ...withoutNonce } = good as unknown as Record<string, unknown>;
    const parsed = validateSessionStart(withoutNonce);
    assert.equal(parsed.ok === false && parsed.error, 'invalid_request');
  });

  it('rejects a wrong protocol id and a wrong version', () => {
    assert.equal(validateSessionStart({ ...good, protocol: 'other' }).ok, false);
    assert.equal(validateSessionStart({ ...good, version: 2 }).ok, false);
  });

  it('rejects an unknown purpose string as invalid rather than as a mismatch', () => {
    const parsed = validateSessionStart({ ...good, purpose: 'enrollment' });
    assert.equal(parsed.ok === false && parsed.error, 'invalid_request');
  });

  it('rejects a heartbeat carrying session-start fields', () => {
    const beat = makeHeartbeat(KEY, baseHeartbeat());
    assert.equal(validateHeartbeat({ ...beat, challenge: hex32() }).ok, false);
  });
});

describe('gateway-protocol · bounds-validated', () => {
  const good = makeSessionStart(KEY, baseSessionStart());
  const beat = makeHeartbeat(KEY, baseHeartbeat());

  it('rejects a non-canonical gatewayId', () => {
    for (const value of [
      good.gatewayId.toUpperCase(),
      good.gatewayId.replace(/-/g, ''),
      `${good.gatewayId}0`,
      '',
    ]) {
      assert.equal(validateSessionStart({ ...good, gatewayId: value }).ok, false, value);
    }
  });

  it('rejects a keyId that is not 64 lowercase hex characters', () => {
    for (const value of ['a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), `${'a'.repeat(63)}g`]) {
      assert.equal(validateSessionStart({ ...good, keyId: value }).ok, false, value);
    }
  });

  it('rejects a generation below 1 and a non-integer generation', () => {
    for (const value of [0, -1, 1.5, '3', Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      assert.equal(validateSessionStart({ ...good, generation: value }).ok, false, String(value));
    }
    assert.equal(validateSessionStart({ ...good, generation: 1 }).ok, true);
  });

  it('rejects a sequence outside 1 .. 2^53-1', () => {
    for (const value of [0, -1, 2.5, Number.MAX_SAFE_INTEGER + 2]) {
      assert.equal(validateHeartbeat({ ...beat, sequence: value }).ok, false, String(value));
    }
    assert.equal(validateHeartbeat({ ...beat, sequence: 1 }).ok, true);
    assert.equal(validateHeartbeat({ ...beat, sequence: Number.MAX_SAFE_INTEGER }).ok, true);
  });

  it('rejects an unsafe-integer timestamp', () => {
    for (const value of [Number.MAX_SAFE_INTEGER + 2, 1.5, Number.POSITIVE_INFINITY, Number.NaN, '1']) {
      assert.equal(validateSessionStart({ ...good, timestampMs: value }).ok, false, String(value));
    }
  });

  it('rejects a pubkey that is not 32 canonically encoded bytes', () => {
    for (const value of [
      'A'.repeat(43),
      'A'.repeat(45),
      `${'A'.repeat(43)}=`.replace('A', '!'),
      Buffer.alloc(31).toString('base64'),
      Buffer.alloc(33).toString('base64'),
    ]) {
      assert.equal(validateSessionStart({ ...good, pubkey: value }).ok, false, value);
    }
  });

  it('rejects a signature that is not 64 canonically encoded bytes', () => {
    for (const value of [Buffer.alloc(63).toString('base64'), Buffer.alloc(65).toString('base64'), 'A'.repeat(88)]) {
      assert.equal(validateSessionStart({ ...good, signature: value }).ok, false, value);
    }
  });

  it('refuses non-canonical base64 that a lenient decoder would accept', () => {
    // `AAAA...AB` and `AAAA...AC` differ only in bits past the 32nd byte.
    // Buffer.from would decode both; a fingerprint over the decoded bytes would
    // then be the same for two distinct presented strings.
    const canonical = Buffer.alloc(32).toString('base64');
    assert.ok(decodeBase64Fixed(canonical, 32) !== null);
    const nonCanonical = `${canonical.slice(0, 43)}=`.replace(/A=$/, 'B=');
    assert.equal(decodeBase64Fixed(nonCanonical, 32), null);
    assert.equal(decodeTransportPubkey(nonCanonical), null);
  });

  it('rejects unpadded and whitespace-padded encodings', () => {
    assert.equal(decodeBase64Fixed(Buffer.alloc(32).toString('base64').replace(/=+$/, ''), 32), null);
    assert.equal(decodeBase64Fixed(` ${Buffer.alloc(32).toString('base64')}`, 32), null);
  });
});
