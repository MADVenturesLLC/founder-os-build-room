/**
 * The runtime-room messages' wire protocol (FOUNDER-ACT-20261117-BR-PHASE5-STEP1
 * B2): the two new session-bound purposes, `runtime_room_minted` and
 * `runtime_room_occupancy`, their signed bytes, and the closed request and
 * payload shapes both sides validate against.
 *
 * What is proven:
 *   - each new purpose signs under its own domain tag and its own array; the
 *     minted report signs its request id and payload digest, the occupancy
 *     report its runtime room id and payload digest, never the payload text;
 *   - a signature made for any one of the six purposes verifies as none of the
 *     other five, in both directions, including the planner report, whose
 *     array the minted report's shares member for member;
 *   - every envelope validator refuses each of the other five purposes'
 *     envelopes as `purpose_mismatch`, in both directions;
 *   - the envelope validators refuse unknown and missing members, a bad key,
 *     digest or payload; the payload bound is enforced in UTF-8 bytes;
 *   - the request and payload validators accept exactly their shapes and
 *     return null for anything else: extra or missing members, a malformed
 *     id, an occupancy outside IPC v2's set; the minted payload carries no
 *     occupancy at all, and one that does is refused whatever its value.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, verify } from 'node:crypto';
import {
  CanonicalInputError,
  DOMAIN_SEPARATOR_BYTE,
  DOMAIN_TAG_PREFIX,
  MAX_ROOM_PAYLOAD_BYTES,
  OCCUPANCY_STATES,
  PROTOCOL_ID,
  PURPOSES,
  VERSION,
  heartbeatSignedBytes,
  isPurpose,
  isValidRuntimeRoomId,
  plannerPollSignedBytes,
  plannerReportSignedBytes,
  runtimeRoomMintedCanonicalArray,
  runtimeRoomMintedSignedBytes,
  runtimeRoomOccupancyCanonicalArray,
  runtimeRoomOccupancySignedBytes,
  sessionStartSignedBytes,
  signedBytesFor,
  validateHeartbeat,
  validatePlannerPoll,
  validatePlannerReport,
  validateRoomRequest,
  validateRuntimeRoomMinted,
  validateRuntimeRoomMintedPayload,
  validateRuntimeRoomOccupancy,
  validateRuntimeRoomOccupancyPayload,
  validateSessionStart,
  type CanonicalElement,
  type EnvelopeResult,
  type Purpose,
} from '../packages/gateway-protocol/src/index.js';
import { generateTestKeypair, hex32, publicKeyFromRaw, signBytes, uuid, type TestKeypair } from './gateway-helpers.js';

const WALL = 1_770_000_000_000;

function runtimeRoomId(): string {
  return `room-${uuid()}`;
}

function digestOf(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function verifies(key: TestKeypair, bytes: Uint8Array, signature: unknown): boolean {
  return verify(null, Buffer.from(bytes), publicKeyFromRaw(key.rawPublicKey), Buffer.from(String(signature), 'base64'));
}

interface Session {
  readonly key: TestKeypair;
  readonly gatewayId: string;
  readonly epoch: string;
}

function session(): Session {
  return { key: generateTestKeypair(), gatewayId: uuid(), epoch: hex32() };
}

function shared(s: Session, sequence: number) {
  return { gatewayId: s.gatewayId, keyId: s.key.keyId, epoch: s.epoch, sequence, nonce: hex32(), timestampMs: WALL };
}

function frame<P extends Purpose>(purpose: P): { protocol: string; version: number; purpose: P } {
  return { protocol: PROTOCOL_ID, version: VERSION, purpose };
}

/** A signed minted report, built by hand so this suite depends on nothing but the protocol package. */
function mintedEnvelope(s: Session, sequence: number, payload: Record<string, unknown>, text = JSON.stringify(payload)) {
  const canonical = { ...shared(s, sequence), requestId: String(payload['requestId']), payloadDigest: digestOf(text) };
  return {
    ...frame('runtime_room_minted'),
    ...canonical,
    payload: text,
    pubkey: s.key.pubkeyBase64,
    signature: signBytes(s.key.privateKey, runtimeRoomMintedSignedBytes(canonical)),
  };
}

function occupancyEnvelope(s: Session, sequence: number, payload: Record<string, unknown>, text = JSON.stringify(payload)) {
  const canonical = { ...shared(s, sequence), runtimeRoomId: String(payload['runtimeRoomId']), payloadDigest: digestOf(text) };
  return {
    ...frame('runtime_room_occupancy'),
    ...canonical,
    payload: text,
    pubkey: s.key.pubkeyBase64,
    signature: signBytes(s.key.privateKey, runtimeRoomOccupancySignedBytes(canonical)),
  };
}

function mintedPayload(): Record<string, unknown> {
  return { requestId: uuid(), lifecycleRoomId: uuid(), runtimeRoomId: runtimeRoomId() };
}

function occupancyPayload(): Record<string, unknown> {
  return { lifecycleRoomId: uuid(), runtimeRoomId: runtimeRoomId(), occupancy: 'OCCUPIED' };
}

/** One valid envelope per purpose, each signed for its own purpose. */
function envelopeFor(purpose: Purpose, s: Session): Record<string, unknown> {
  const base = shared(s, 1);
  const tail = { pubkey: s.key.pubkeyBase64 };
  switch (purpose) {
    case 'session_start': {
      const canonical = { gatewayId: s.gatewayId, keyId: s.key.keyId, generation: 1, challenge: hex32(), nonce: hex32(), timestampMs: WALL };
      return { ...frame(purpose), ...canonical, ...tail, signature: signBytes(s.key.privateKey, sessionStartSignedBytes(canonical)) };
    }
    case 'heartbeat':
      return { ...frame(purpose), ...base, ...tail, signature: signBytes(s.key.privateKey, heartbeatSignedBytes(base)) };
    case 'planner_poll':
      return { ...frame(purpose), ...base, ...tail, signature: signBytes(s.key.privateKey, plannerPollSignedBytes(base)) };
    case 'planner_report': {
      const payload = '{"kind":"not_sent"}';
      const canonical = { ...base, requestId: uuid(), payloadDigest: digestOf(payload) };
      return { ...frame(purpose), ...canonical, payload, ...tail, signature: signBytes(s.key.privateKey, plannerReportSignedBytes(canonical)) };
    }
    case 'runtime_room_minted':
      return mintedEnvelope(s, 1, mintedPayload());
    case 'runtime_room_occupancy':
      return occupancyEnvelope(s, 1, occupancyPayload());
  }
}

const VALIDATORS: Readonly<Record<Purpose, (body: unknown) => EnvelopeResult<unknown>>> = {
  session_start: validateSessionStart,
  heartbeat: validateHeartbeat,
  planner_poll: validatePlannerPoll,
  planner_report: validatePlannerReport,
  runtime_room_minted: validateRuntimeRoomMinted,
  runtime_room_occupancy: validateRuntimeRoomOccupancy,
};

const NEW_PURPOSES: readonly Purpose[] = ['runtime_room_minted', 'runtime_room_occupancy'];

describe('gateway-room-protocol · the closed purpose set (act B2)', () => {
  it('admits the two new purposes and nothing beside the six', () => {
    assert.equal(PURPOSES.length, 6);
    for (const purpose of NEW_PURPOSES) assert.ok(isPurpose(purpose));
    for (const other of ['runtime_room_mint', 'room_request', 'runtime_room_bound', 'Runtime_room_minted', '']) {
      assert.equal(isPurpose(other), false, other);
    }
  });
});

describe('gateway-room-protocol · signed bytes per purpose', () => {
  it('frames each new purpose as its domain tag, one 0x00, then the JSON of its array', () => {
    const s = session();
    const minted = { ...shared(s, 4), requestId: uuid(), payloadDigest: hex32() };
    const occupancy = { ...shared(s, 5), runtimeRoomId: runtimeRoomId(), payloadDigest: hex32() };
    for (const [purpose, array, bytes] of [
      ['runtime_room_minted', runtimeRoomMintedCanonicalArray(minted), runtimeRoomMintedSignedBytes(minted)],
      ['runtime_room_occupancy', runtimeRoomOccupancyCanonicalArray(occupancy), runtimeRoomOccupancySignedBytes(occupancy)],
    ] as const) {
      const tag = Buffer.from(DOMAIN_TAG_PREFIX + purpose, 'utf8');
      const expected = Buffer.concat([tag, Buffer.from([DOMAIN_SEPARATOR_BYTE]), Buffer.from(JSON.stringify(array), 'utf8')]);
      assert.deepEqual(Buffer.from(bytes), expected, purpose);
      assert.equal(array[2], purpose, 'the purpose is inside the array as well as in the tag');
    }
  });

  it('signs the minted report over its request id and payload digest, never the payload text', () => {
    const s = session();
    const payload = mintedPayload();
    const envelope = mintedEnvelope(s, 3, payload);
    const canonical = { ...shared(s, 3), nonce: envelope.nonce, requestId: envelope.requestId, payloadDigest: envelope.payloadDigest };
    assert.deepEqual(runtimeRoomMintedCanonicalArray(canonical), [
      PROTOCOL_ID,
      VERSION,
      'runtime_room_minted',
      s.gatewayId,
      s.key.keyId,
      s.epoch,
      3,
      envelope.nonce,
      WALL,
      payload['requestId'],
      digestOf(JSON.stringify(payload)),
    ]);
    assert.ok(verifies(s.key, runtimeRoomMintedSignedBytes(canonical), envelope.signature));
    assert.equal(verifies(s.key, runtimeRoomMintedSignedBytes({ ...canonical, requestId: uuid() }), envelope.signature), false);
    assert.equal(verifies(s.key, runtimeRoomMintedSignedBytes({ ...canonical, payloadDigest: hex32() }), envelope.signature), false);
    assert.equal(verifies(s.key, runtimeRoomMintedSignedBytes({ ...canonical, sequence: 4 }), envelope.signature), false);
  });

  it('signs the occupancy report over its runtime room id and payload digest, never the payload text', () => {
    const s = session();
    const payload = occupancyPayload();
    const envelope = occupancyEnvelope(s, 6, payload);
    const canonical = { ...shared(s, 6), nonce: envelope.nonce, runtimeRoomId: envelope.runtimeRoomId, payloadDigest: envelope.payloadDigest };
    assert.deepEqual(runtimeRoomOccupancyCanonicalArray(canonical).slice(-2), [payload['runtimeRoomId'], digestOf(JSON.stringify(payload))]);
    assert.ok(verifies(s.key, runtimeRoomOccupancySignedBytes(canonical), envelope.signature));
    assert.equal(verifies(s.key, runtimeRoomOccupancySignedBytes({ ...canonical, runtimeRoomId: runtimeRoomId() }), envelope.signature), false);
    assert.equal(verifies(s.key, runtimeRoomOccupancySignedBytes({ ...canonical, payloadDigest: hex32() }), envelope.signature), false);
  });

  it('refuses to build canonical bytes from an unvalidated request id or runtime room id', () => {
    const s = session();
    assert.throws(() => runtimeRoomMintedCanonicalArray({ ...shared(s, 1), requestId: 'not-a-uuid', payloadDigest: hex32() }), CanonicalInputError);
    for (const bad of ['room-NOT-A-UUID', uuid(), `ROOM-${uuid()}`, `room-${uuid().toUpperCase()}`, `room-${uuid()} `]) {
      assert.throws(
        () => runtimeRoomOccupancyCanonicalArray({ ...shared(s, 1), runtimeRoomId: bad, payloadDigest: hex32() }),
        CanonicalInputError,
        bad,
      );
    }
    assert.throws(() => runtimeRoomOccupancyCanonicalArray({ ...shared(s, 1), runtimeRoomId: runtimeRoomId(), payloadDigest: 'A'.repeat(64) }), CanonicalInputError);
  });
});

describe('gateway-room-protocol · cross-purpose refusal, both ways, against all six purposes', () => {
  /** The same members, under each purpose's tag and with each purpose inside the array. */
  function arrayUnder(purpose: Purpose, tail: readonly CanonicalElement[]): readonly CanonicalElement[] {
    return [PROTOCOL_ID, VERSION, purpose, ...tail];
  }

  it('a signature made for any purpose verifies as no other, over identical members', () => {
    const s = session();
    const tail: CanonicalElement[] = [s.gatewayId, s.key.keyId, s.epoch, 9, hex32(), WALL, uuid(), hex32()];
    for (const signedAs of PURPOSES) {
      const signature = signBytes(s.key.privateKey, signedBytesFor(signedAs, arrayUnder(signedAs, tail)));
      for (const checkedAs of PURPOSES) {
        const ok = verifies(s.key, signedBytesFor(checkedAs, arrayUnder(checkedAs, tail)), signature);
        assert.equal(ok, signedAs === checkedAs, `signed as ${signedAs}, checked as ${checkedAs}`);
        // Even a careless receiver that fed the right array to the wrong tag gets nothing.
        if (signedAs !== checkedAs) {
          assert.equal(verifies(s.key, signedBytesFor(checkedAs, arrayUnder(signedAs, tail)), signature), false);
        }
      }
    }
  });

  it('a planner report and a minted report over the same request id and digest are different signed messages', () => {
    const s = session();
    const input = { ...shared(s, 2), requestId: uuid(), payloadDigest: hex32() };
    const asReport = signBytes(s.key.privateKey, plannerReportSignedBytes(input));
    const asMinted = signBytes(s.key.privateKey, runtimeRoomMintedSignedBytes(input));
    assert.equal(verifies(s.key, runtimeRoomMintedSignedBytes(input), asReport), false);
    assert.equal(verifies(s.key, plannerReportSignedBytes(input), asMinted), false);
    assert.equal(verifies(s.key, heartbeatSignedBytes(input), asMinted), false);
    assert.equal(verifies(s.key, plannerPollSignedBytes(input), asMinted), false);
  });

  it('every validator refuses every other purpose as purpose_mismatch, and accepts its own', () => {
    const s = session();
    for (const presented of PURPOSES) {
      const envelope = envelopeFor(presented, s);
      for (const expected of PURPOSES) {
        const result = VALIDATORS[expected](envelope);
        if (presented === expected) {
          assert.equal(result.ok, true, `${expected} accepts its own envelope`);
        } else {
          assert.equal(result.ok, false, `${expected} refuses ${presented}`);
          assert.equal(!result.ok && result.error, 'purpose_mismatch', `${expected} refuses ${presented} as purpose_mismatch`);
        }
      }
    }
  });
});

describe('gateway-room-protocol · envelope validation', () => {
  it('refuses an unknown member and a missing member on both new envelopes', () => {
    const s = session();
    for (const envelope of [mintedEnvelope(s, 1, mintedPayload()), occupancyEnvelope(s, 1, occupancyPayload())]) {
      const validate = VALIDATORS[envelope.purpose];
      const extra = validate({ ...envelope, room: null });
      assert.equal(!extra.ok && extra.detail, 'unknown field room');
      for (const member of ['epoch', 'sequence', 'payloadDigest', 'payload', 'signature']) {
        const missing: Record<string, unknown> = { ...envelope };
        delete missing[member];
        const result = validate(missing);
        assert.equal(!result.ok && result.detail, `missing field ${member}`, member);
      }
    }
  });

  it('refuses the other purpose key: a minted report carries a request id, an occupancy report a runtime room id', () => {
    const s = session();
    const minted = mintedEnvelope(s, 1, mintedPayload());
    const noRequest: Record<string, unknown> = { ...minted };
    delete noRequest['requestId'];
    const swapped = validateRuntimeRoomMinted({ ...noRequest, runtimeRoomId: runtimeRoomId() });
    assert.equal(!swapped.ok && swapped.error, 'invalid_request');
    const occupancy = occupancyEnvelope(s, 1, occupancyPayload());
    const noRoom: Record<string, unknown> = { ...occupancy };
    delete noRoom['runtimeRoomId'];
    const swappedBack = validateRuntimeRoomOccupancy({ ...noRoom, requestId: uuid() });
    assert.equal(!swappedBack.ok && swappedBack.error, 'invalid_request');
  });

  it('refuses a malformed key, digest, epoch or sequence', () => {
    const s = session();
    const minted = mintedEnvelope(s, 1, mintedPayload());
    const occupancy = occupancyEnvelope(s, 1, occupancyPayload());
    const cases: readonly [EnvelopeResult<unknown>, string][] = [
      [validateRuntimeRoomMinted({ ...minted, requestId: 'not-a-uuid' }), 'requestId'],
      [validateRuntimeRoomMinted({ ...minted, requestId: String(minted.requestId).toUpperCase() }), 'requestId'],
      [validateRuntimeRoomMinted({ ...minted, payloadDigest: 'A'.repeat(64) }), 'payloadDigest'],
      [validateRuntimeRoomMinted({ ...minted, epoch: 'x' }), 'epoch'],
      [validateRuntimeRoomMinted({ ...minted, sequence: 0 }), 'sequence'],
      [validateRuntimeRoomOccupancy({ ...occupancy, runtimeRoomId: uuid() }), 'runtimeRoomId'],
      [validateRuntimeRoomOccupancy({ ...occupancy, runtimeRoomId: `room-${uuid().toUpperCase()}` }), 'runtimeRoomId'],
      [validateRuntimeRoomOccupancy({ ...occupancy, payloadDigest: hex32().slice(1) }), 'payloadDigest'],
      [validateRuntimeRoomOccupancy({ ...occupancy, sequence: 1.5 }), 'sequence'],
    ];
    for (const [result, detail] of cases) {
      assert.equal(result.ok, false, detail);
      assert.equal(!result.ok && result.error, 'invalid_request', detail);
      assert.equal(!result.ok && result.detail, detail);
    }
  });

  it('bounds the payload in UTF-8 bytes, not characters, under its own small bound', () => {
    const s = session();
    assert.ok(MAX_ROOM_PAYLOAD_BYTES <= 1024, 'the room bound is its own, far under the planner bound');
    const exact = 'x'.repeat(MAX_ROOM_PAYLOAD_BYTES);
    const atBound = validateRuntimeRoomOccupancy(occupancyEnvelope(s, 1, occupancyPayload(), exact));
    assert.equal(atBound.ok, true, 'exactly the bound is within it (the envelope does not parse the payload)');
    const over = validateRuntimeRoomOccupancy(occupancyEnvelope(s, 1, occupancyPayload(), `${exact}x`));
    assert.equal(!over.ok && over.detail, 'payload');
    // Three bytes per character: under the bound in characters, over it in bytes.
    const wide = '€'.repeat(Math.floor(MAX_ROOM_PAYLOAD_BYTES / 3) + 1);
    assert.ok(wide.length < MAX_ROOM_PAYLOAD_BYTES);
    const wideResult = validateRuntimeRoomMinted(mintedEnvelope(s, 1, mintedPayload(), wide));
    assert.equal(!wideResult.ok && wideResult.detail, 'payload');
    const empty = validateRuntimeRoomMinted(mintedEnvelope(s, 1, mintedPayload(), ''));
    assert.equal(!empty.ok && empty.detail, 'payload');
    // A real payload sits far under the bound.
    assert.ok(Buffer.byteLength(JSON.stringify(mintedPayload()), 'utf8') < MAX_ROOM_PAYLOAD_BYTES / 4);
  });
});

describe('gateway-room-protocol · the request and the payloads are closed shapes', () => {
  it('accepts exactly the mint request', () => {
    const request = { kind: 'mint', requestId: uuid(), lifecycleRoomId: uuid() };
    assert.deepEqual(validateRoomRequest(request), request);
  });

  it('returns null for any other room member', () => {
    const requestId = uuid();
    const lifecycleRoomId = uuid();
    const refused: readonly unknown[] = [
      null,
      undefined,
      'mint',
      42,
      [],
      [{ kind: 'mint', requestId, lifecycleRoomId }],
      {},
      { kind: 'mint', requestId },
      { kind: 'mint', lifecycleRoomId },
      { kind: 'mint', requestId, lifecycleRoomId, extra: 1 },
      { kind: 'mint', requestId, lifecycleRoomId, runtimeRoomId: runtimeRoomId() },
      { kind: 'bind', requestId, lifecycleRoomId },
      { kind: 'close', requestId, lifecycleRoomId },
      { kind: 'MINT', requestId, lifecycleRoomId },
      { kind: 'mint', requestId: requestId.toUpperCase(), lifecycleRoomId },
      { kind: 'mint', requestId, lifecycleRoomId: `${lifecycleRoomId} ` },
      { kind: 'mint', requestId, lifecycleRoomId: `room-${lifecycleRoomId}` },
      { kind: 'mint', requestId: 7, lifecycleRoomId },
      JSON.parse(`{"kind":"mint","requestId":"${requestId}","lifecycleRoomId":"${lifecycleRoomId}","__proto__":{}}`),
    ];
    for (const value of refused) assert.equal(validateRoomRequest(value), null, JSON.stringify(value));
  });

  it('accepts an occupancy payload in every IPC v2 occupancy state, and no other', () => {
    for (const occupancy of OCCUPANCY_STATES) {
      assert.ok(validateRuntimeRoomOccupancyPayload({ ...occupancyPayload(), occupancy }), occupancy);
    }
    for (const occupancy of ['closed', 'OPEN', 'BOUND', '', null, 3]) {
      assert.equal(validateRuntimeRoomOccupancyPayload({ ...occupancyPayload(), occupancy }), null, String(occupancy));
    }
  });

  it('accepts a minted payload of exactly requestId, lifecycleRoomId and runtimeRoomId, and refuses one carrying any occupancy', () => {
    const minted = mintedPayload();
    assert.deepEqual(validateRuntimeRoomMintedPayload(minted), minted);
    assert.deepEqual(Object.keys(minted).sort(), ['lifecycleRoomId', 'requestId', 'runtimeRoomId']);
    for (const occupancy of [...OCCUPANCY_STATES, 'BOUND', null, undefined]) {
      assert.equal(validateRuntimeRoomMintedPayload({ ...minted, occupancy }), null, `occupancy ${String(occupancy)}`);
    }
    assert.equal(
      validateRuntimeRoomMintedPayload(JSON.parse(JSON.stringify({ ...minted, occupancy: 'PREPARED' }))),
      null,
      'as the control plane reads it off the wire',
    );
  });

  it('returns null for a payload with an extra or missing member, or an id out of format', () => {
    const minted = mintedPayload();
    const occupancy = occupancyPayload();
    const without = (record: Record<string, unknown>, key: string): Record<string, unknown> => {
      const copy = { ...record };
      delete copy[key];
      return copy;
    };
    for (const value of [
      null,
      [],
      'x',
      { ...minted, extra: true },
      { ...minted, kind: 'minted' },
      without(minted, 'requestId'),
      without(minted, 'lifecycleRoomId'),
      without(minted, 'runtimeRoomId'),
      { ...minted, occupancy: 'PREPARED' },
      { ...minted, requestId: 'r-1' },
      { ...minted, lifecycleRoomId: String(minted['lifecycleRoomId']).toUpperCase() },
      { ...minted, runtimeRoomId: String(minted['runtimeRoomId']).slice('room-'.length) },
      { ...minted, runtimeRoomId: `room-${uuid().toUpperCase()}` },
      { ...minted, runtimeRoomId: 'room-' },
    ]) {
      assert.equal(validateRuntimeRoomMintedPayload(value), null, JSON.stringify(value));
    }
    for (const value of [
      { ...occupancy, requestId: uuid() },
      without(occupancy, 'lifecycleRoomId'),
      without(occupancy, 'runtimeRoomId'),
      { ...occupancy, runtimeRoomId: `ROOM-${uuid()}` },
      { ...occupancy, lifecycleRoomId: `room-${uuid()}` },
    ]) {
      assert.equal(validateRuntimeRoomOccupancyPayload(value), null, JSON.stringify(value));
    }
  });

  it('formats a runtime room id exactly as the room runtime mints it', () => {
    assert.ok(isValidRuntimeRoomId(`room-${uuid()}`));
    for (const bad of [uuid(), `room_${uuid()}`, `room-${uuid()}x`, `xroom-${uuid()}`, 'room-', 42, null]) {
      assert.equal(isValidRuntimeRoomId(bad), false, String(bad));
    }
  });
});
