/**
 * The runtime-room routes in process (FOUNDER-ACT-20261117-BR-PHASE5-STEP1 B2):
 * a real gateway surface and HTTP server over a stubbed database, as the
 * credential-free guard suites run, with a registry row the stub answers for
 * one test Gateway. Session-start, the poll, and both room reports cross the
 * real route table, parsers, limiter, leadership fence and session cursor.
 *
 * What is proven:
 *   - the poll answer carries `room`: `null` with nothing asked, the open mint
 *     request once the control plane asks, re-delivered until answered;
 *   - `POST /gateway/room/minted` and `POST /gateway/room/occupancy` are
 *     verified as the planner report is: registry key, signature against the
 *     registry's key, enrolled, epoch, sequence, timestamp window, digest over
 *     the exact payload text, payload shape, and the payload naming the key the
 *     envelope signed; each refusal is recorded as a message rejection and
 *     records nothing in the room channel;
 *   - an accepted report takes the session's next sequence and never touches
 *     liveness; a report for no open request, or occupancy for a room never
 *     reported minted, is traffic answered `accepted: false`;
 *   - after an accepted session-start, that Gateway's earlier minted rooms
 *     and readings are not believed until it reports again, open requests stay
 *     open, occupancy of a room minted earlier is accepted as the new
 *     session's reading, and no other Gateway's reports change;
 *   - a cross-purpose envelope is `401 purpose_mismatch` on every route, both
 *     ways; the routes keep the 16 KB gateway body limit and their own rate
 *     limits.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  RATE_LIMITS,
} from '../packages/control-plane/src/gateway/index.js';
import {
  plannerPollSignedBytes,
  runtimeRoomMintedSignedBytes,
  runtimeRoomOccupancySignedBytes,
  type HeartbeatCanonicalInput,
} from '../packages/gateway-protocol/src/index.js';
import {
  FIXED_WALL_MS,
  generateTestKeypair,
  hex32,
  makeHeartbeat,
  makeSessionStart,
  signBytes,
  uuid,
  type TestKeypair,
} from './gateway-helpers.js';
import { body, closeAllSurfaces, startSurface, type Surface } from './gateway-surface-helpers.js';
import { roomStub, type RoomStub } from './gateway-room-stub.js';

after(closeAllSurfaces);

interface Enrolled {
  readonly gatewayId: string;
  readonly key: TestKeypair;
}

function enroll(stub: RoomStub, state = 'enrolled'): Enrolled {
  const key = generateTestKeypair();
  const gatewayId = uuid();
  stub.registry.set(gatewayId, { keyId: key.keyId, state, pubkey: Buffer.from(key.rawPublicKey) });
  return { gatewayId, key };
}

async function post(surface: Surface, path: string, envelope: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${surface.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof envelope === 'string' ? envelope : JSON.stringify(envelope),
  });
  return { status: response.status, body: await body(response) };
}

/** Open a session the way the daemon does: fetch the challenge, sign a session-start. */
async function openSession(surface: Surface, gateway: Enrolled): Promise<string> {
  const challenge = await body(await fetch(`${surface.url}/gateway/session-challenge`));
  const started = await post(
    surface,
    '/gateway/session-start',
    makeSessionStart(gateway.key, {
      gatewayId: gateway.gatewayId,
      keyId: gateway.key.keyId,
      generation: challenge['generation'] as number,
      challenge: challenge['challenge'] as string,
      nonce: hex32(),
      timestampMs: FIXED_WALL_MS,
    }),
  );
  assert.equal(started.status, 200, JSON.stringify(started.body));
  return started.body['epoch'] as string;
}

function base(gateway: Enrolled, epoch: string, sequence: number, timestampMs = FIXED_WALL_MS): HeartbeatCanonicalInput {
  return { gatewayId: gateway.gatewayId, keyId: gateway.key.keyId, epoch, sequence, nonce: hex32(), timestampMs };
}

function frame(purpose: string) {
  return { protocol: 'founder-os.gateway-protocol', version: 1, purpose };
}

function poll(gateway: Enrolled, epoch: string, sequence: number) {
  const canonical = base(gateway, epoch, sequence);
  return { ...frame('planner_poll'), ...canonical, pubkey: gateway.key.pubkeyBase64, signature: signBytes(gateway.key.privateKey, plannerPollSignedBytes(canonical)) };
}

interface ReportOptions {
  /** The payload text sent, when it differs from the one whose digest is signed. */
  readonly sentText?: string;
  readonly signWith?: TestKeypair;
  readonly timestampMs?: number;
}

function minted(gateway: Enrolled, epoch: string, sequence: number, requestId: string, payload: unknown, options: ReportOptions = {}) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const canonical = {
    ...base(gateway, epoch, sequence, options.timestampMs),
    requestId,
    payloadDigest: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
  return {
    ...frame('runtime_room_minted'),
    ...canonical,
    payload: options.sentText ?? text,
    pubkey: gateway.key.pubkeyBase64,
    signature: signBytes((options.signWith ?? gateway.key).privateKey, runtimeRoomMintedSignedBytes(canonical)),
  };
}

function occupancy(gateway: Enrolled, epoch: string, sequence: number, runtimeRoomId: string, payload: unknown, options: ReportOptions = {}) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const canonical = {
    ...base(gateway, epoch, sequence, options.timestampMs),
    runtimeRoomId,
    payloadDigest: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
  return {
    ...frame('runtime_room_occupancy'),
    ...canonical,
    payload: options.sentText ?? text,
    pubkey: gateway.key.pubkeyBase64,
    signature: signBytes((options.signWith ?? gateway.key).privateKey, runtimeRoomOccupancySignedBytes(canonical)),
  };
}

function roomId(): string {
  return `room-${uuid()}`;
}

/** A surface, one enrolled Gateway with an open session, and a delivered mint request. */
async function delivered(): Promise<{
  stub: RoomStub;
  surface: Surface;
  gateway: Enrolled;
  epoch: string;
  lifecycleRoomId: string;
  requestId: string;
}> {
  const stub = roomStub();
  const surface = await startSurface({}, stub.pool);
  const gateway = enroll(stub);
  const epoch = await openSession(surface, gateway);
  const lifecycleRoomId = uuid();
  const { requestId } = surface.gateway.roomChannel.requestMint(gateway.gatewayId, lifecycleRoomId);
  const polled = await post(surface, '/gateway/planner/poll', poll(gateway, epoch, 1));
  assert.equal(polled.status, 200);
  assert.deepEqual(polled.body['room'], { kind: 'mint', requestId, lifecycleRoomId });
  return { stub, surface, gateway, epoch, lifecycleRoomId, requestId };
}

describe('gateway-room-routes · the poll answer carries the mint request', () => {
  it('answers room: null with nothing asked, then the open request, re-delivered until a minted report answers it', async () => {
    const stub = roomStub();
    const surface = await startSurface({}, stub.pool);
    try {
      const gateway = enroll(stub);
      const epoch = await openSession(surface, gateway);
      const empty = await post(surface, '/gateway/planner/poll', poll(gateway, epoch, 1));
      assert.equal(empty.status, 200);
      assert.equal(empty.body['request'], null, 'planner work is carried as before');
      assert.equal(empty.body['room'], null);

      const lifecycleRoomId = uuid();
      const { requestId } = surface.gateway.roomChannel.requestMint(gateway.gatewayId, lifecycleRoomId);
      const other = enroll(stub);
      const otherEpoch = await openSession(surface, other);
      const elsewhere = await post(surface, '/gateway/planner/poll', poll(other, otherEpoch, 1));
      assert.equal(elsewhere.body['room'], null, 'a request is visible only to its Gateway');

      for (const sequence of [2, 3]) {
        const polled = await post(surface, '/gateway/planner/poll', poll(gateway, epoch, sequence));
        assert.deepEqual(polled.body['room'], { kind: 'mint', requestId, lifecycleRoomId }, `poll ${sequence}`);
      }
      const runtimeRoomId = roomId();
      const answered = await post(
        surface,
        '/gateway/room/minted',
        minted(gateway, epoch, 4, requestId, { requestId, lifecycleRoomId, runtimeRoomId, occupancy: 'PREPARED' }),
      );
      assert.deepEqual(answered, { status: 200, body: { ok: true, state: 'enrolled', epoch, accepted: true } });
      const after = await post(surface, '/gateway/planner/poll', poll(gateway, epoch, 5));
      assert.equal(after.body['room'], null, 'answered, so no longer delivered');
    } finally {
      await surface.close();
    }
  });
});

describe('gateway-room-routes · accepted reports', () => {
  it('records a minted room and its occupancy, takes the next sequence, and never touches liveness', async () => {
    const { surface, gateway, epoch, lifecycleRoomId, requestId } = await delivered();
    try {
      const runtimeRoomId = roomId();
      const report = await post(
        surface,
        '/gateway/room/minted',
        minted(gateway, epoch, 2, requestId, { requestId, lifecycleRoomId, runtimeRoomId, occupancy: 'PREPARED' }),
      );
      assert.equal(report.status, 200);
      assert.equal(report.body['accepted'], true);
      const channel = surface.gateway.roomChannel;
      assert.deepEqual(channel.mintedFor(gateway.gatewayId, lifecycleRoomId), [runtimeRoomId]);
      assert.equal(channel.occupancyOf(gateway.gatewayId, runtimeRoomId)?.occupancy, 'PREPARED');
      assert.equal(surface.gateway.session.cursorFor(gateway.gatewayId)?.lastSequence, 2);

      const occupied = await post(
        surface,
        '/gateway/room/occupancy',
        occupancy(gateway, epoch, 3, runtimeRoomId, { lifecycleRoomId, runtimeRoomId, occupancy: 'OCCUPIED' }),
      );
      assert.deepEqual(occupied, { status: 200, body: { ok: true, state: 'enrolled', epoch, accepted: true } });
      assert.equal(channel.occupancyOf(gateway.gatewayId, runtimeRoomId)?.occupancy, 'OCCUPIED');
      assert.equal(surface.gateway.session.cursorFor(gateway.gatewayId)?.lastSequence, 3);
      assert.equal(surface.gateway.session.livenessFor(gateway.gatewayId), null, 'only an accepted heartbeat makes a Gateway live');
    } finally {
      await surface.close();
    }
  });

  it('answers accepted: false, recording nothing, to a minted report for no open request and occupancy for a room never minted', async () => {
    const { surface, gateway, epoch, lifecycleRoomId } = await delivered();
    try {
      const stranger = uuid();
      const runtimeRoomId = roomId();
      const unasked = await post(
        surface,
        '/gateway/room/minted',
        minted(gateway, epoch, 2, stranger, { requestId: stranger, lifecycleRoomId, runtimeRoomId, occupancy: 'PREPARED' }),
      );
      assert.deepEqual([unasked.status, unasked.body['accepted']], [200, false]);
      const unminted = await post(
        surface,
        '/gateway/room/occupancy',
        occupancy(gateway, epoch, 3, runtimeRoomId, { lifecycleRoomId, runtimeRoomId, occupancy: 'CLOSED' }),
      );
      assert.deepEqual([unminted.status, unminted.body['accepted']], [200, false]);
      assert.deepEqual(surface.gateway.roomChannel.mintedFor(gateway.gatewayId, lifecycleRoomId), []);
      assert.equal(surface.gateway.roomChannel.occupancyOf(gateway.gatewayId, runtimeRoomId), null);
      assert.equal(surface.gateway.session.cursorFor(gateway.gatewayId)?.lastSequence, 3, 'still traffic: the sequence moved');
    } finally {
      await surface.close();
    }
  });
});

describe('gateway-room-routes · a new session believes only what the Gateway reports in it', () => {
  it('stops believing the Gateway\'s earlier reports on an accepted session-start until it reports again, keeping every other Gateway\'s', async () => {
    const { stub, surface, gateway, epoch, lifecycleRoomId, requestId } = await delivered();
    try {
      const channel = surface.gateway.roomChannel;
      const runtimeRoomId = roomId();
      const report = await post(
        surface,
        '/gateway/room/minted',
        minted(gateway, epoch, 2, requestId, { requestId, lifecycleRoomId, runtimeRoomId, occupancy: 'PREPARED' }),
      );
      assert.equal(report.body['accepted'], true);
      const pendingRoom = uuid();
      const pending = channel.requestMint(gateway.gatewayId, pendingRoom);

      const other = enroll(stub);
      const otherEpoch = await openSession(surface, other);
      const otherRequest = channel.requestMint(other.gatewayId, lifecycleRoomId);
      const otherPolled = await post(surface, '/gateway/planner/poll', poll(other, otherEpoch, 1));
      assert.deepEqual(otherPolled.body['room'], { kind: 'mint', requestId: otherRequest.requestId, lifecycleRoomId });
      const otherRuntimeRoomId = roomId();
      const otherReport = await post(
        surface,
        '/gateway/room/minted',
        minted(other, otherEpoch, 2, otherRequest.requestId, {
          requestId: otherRequest.requestId,
          lifecycleRoomId,
          runtimeRoomId: otherRuntimeRoomId,
          occupancy: 'PREPARED',
        }),
      );
      assert.equal(otherReport.body['accepted'], true);

      const renewed = await openSession(surface, gateway);
      assert.notEqual(renewed, epoch);
      assert.deepEqual(channel.mintedFor(gateway.gatewayId, lifecycleRoomId), [], 'a room minted in the old session is not believed');
      assert.equal(channel.occupancyOf(gateway.gatewayId, runtimeRoomId), null);
      assert.deepEqual(channel.mintedFor(other.gatewayId, lifecycleRoomId), [otherRuntimeRoomId], 'another Gateway keeps its reports');
      assert.equal(channel.occupancyOf(other.gatewayId, otherRuntimeRoomId)?.occupancy, 'PREPARED');

      const polled = await post(surface, '/gateway/planner/poll', poll(gateway, renewed, 1));
      assert.deepEqual(polled.body['room'], { kind: 'mint', requestId: pending.requestId, lifecycleRoomId: pendingRoom }, 'an open request stays open');
      const occupied = await post(
        surface,
        '/gateway/room/occupancy',
        occupancy(gateway, renewed, 2, runtimeRoomId, { lifecycleRoomId, runtimeRoomId, occupancy: 'OCCUPIED' }),
      );
      assert.equal(occupied.body['accepted'], true, 'a Gateway that kept the room reports its occupancy in the new session');
      assert.equal(channel.occupancyOf(gateway.gatewayId, runtimeRoomId)?.occupancy, 'OCCUPIED');
      assert.deepEqual(channel.mintedFor(gateway.gatewayId, lifecycleRoomId), [], 'only a fresh mint report lists it for a binding');
    } finally {
      await surface.close();
    }
  });
});

describe('gateway-room-routes · refusals, each recorded, none recording anything in the channel', () => {
  it('refuses a minted report believed only over its exact signed bytes', async () => {
    const { stub, surface, gateway, epoch, lifecycleRoomId, requestId } = await delivered();
    try {
      const runtimeRoomId = roomId();
      const good = { requestId, lifecycleRoomId, runtimeRoomId, occupancy: 'PREPARED' };
      const cases: readonly [string, unknown, number, string][] = [
        ['another key signed it', minted(gateway, epoch, 2, requestId, good, { signWith: generateTestKeypair() }), 401, 'bad_signature'],
        [
          'the payload changed after signing',
          minted(gateway, epoch, 2, requestId, good, { sentText: JSON.stringify({ ...good, runtimeRoomId: roomId() }) }),
          400,
          'invalid_request',
        ],
        ['the payload is not the closed shape', minted(gateway, epoch, 2, requestId, { ...good, extra: 1 }), 400, 'invalid_request'],
        ['the payload is not JSON', minted(gateway, epoch, 2, requestId, 'not json'), 400, 'invalid_request'],
        ['the payload names another request', minted(gateway, epoch, 2, requestId, { ...good, requestId: uuid() }), 400, 'invalid_request'],
        ['a malformed runtime room id', minted(gateway, epoch, 2, requestId, { ...good, runtimeRoomId: uuid() }), 400, 'invalid_request'],
        ['an occupancy outside IPC v2', minted(gateway, epoch, 2, requestId, { ...good, occupancy: 'BOUND' }), 400, 'invalid_request'],
        ['an unknown envelope member', { ...minted(gateway, epoch, 2, requestId, good), room: null }, 400, 'invalid_request'],
        ['a foreign epoch', minted(gateway, hex32(), 2, requestId, good), 409, 'session_required'],
        ['a replayed sequence', minted(gateway, epoch, 1, requestId, good), 409, 'stale_sequence'],
        ['a timestamp outside the window', minted(gateway, epoch, 2, requestId, good, { timestampMs: FIXED_WALL_MS - 3_600_000 }), 409, 'stale_timestamp'],
      ];
      for (const [name, envelope, status, error] of cases) {
        const before = stub.rejections.length;
        const result = await post(surface, '/gateway/room/minted', envelope);
        assert.deepEqual([result.status, result.body['error']], [status, error], name);
        assert.equal(stub.rejections.length, before + 1, `${name}: the refusal is recorded`);
        assert.equal(stub.rejections.at(-1)?.errorCode, error, name);
      }
      assert.deepEqual(surface.gateway.roomChannel.mintedFor(gateway.gatewayId, lifecycleRoomId), []);
      assert.equal(surface.gateway.session.cursorFor(gateway.gatewayId)?.lastSequence, 1, 'no refused report took a sequence');
      // The request is still open and still answerable.
      const answered = await post(surface, '/gateway/room/minted', minted(gateway, epoch, 2, requestId, good));
      assert.deepEqual([answered.status, answered.body['accepted']], [200, true]);
    } finally {
      await surface.close();
    }
  });

  it('refuses an occupancy report over the same checks, and one naming another room than it signed', async () => {
    const { stub, surface, gateway, epoch, lifecycleRoomId, requestId } = await delivered();
    try {
      const runtimeRoomId = roomId();
      const report = await post(
        surface,
        '/gateway/room/minted',
        minted(gateway, epoch, 2, requestId, { requestId, lifecycleRoomId, runtimeRoomId, occupancy: 'PREPARED' }),
      );
      assert.equal(report.body['accepted'], true);
      const good = { lifecycleRoomId, runtimeRoomId, occupancy: 'CLOSED' };
      const cases: readonly [string, unknown, number, string][] = [
        ['another key signed it', occupancy(gateway, epoch, 3, runtimeRoomId, good, { signWith: generateTestKeypair() }), 401, 'bad_signature'],
        ['the payload names another room', occupancy(gateway, epoch, 3, runtimeRoomId, { ...good, runtimeRoomId: roomId() }), 400, 'invalid_request'],
        [
          'the payload changed after signing',
          occupancy(gateway, epoch, 3, runtimeRoomId, good, { sentText: JSON.stringify({ ...good, occupancy: 'OCCUPIED' }) }),
          400,
          'invalid_request',
        ],
        ['a payload with a request id', occupancy(gateway, epoch, 3, runtimeRoomId, { ...good, requestId }), 400, 'invalid_request'],
        ['a replayed sequence', occupancy(gateway, epoch, 2, runtimeRoomId, good), 409, 'stale_sequence'],
      ];
      for (const [name, envelope, status, error] of cases) {
        const before = stub.rejections.length;
        const result = await post(surface, '/gateway/room/occupancy', envelope);
        assert.deepEqual([result.status, result.body['error']], [status, error], name);
        assert.equal(stub.rejections.length, before + 1, `${name}: the refusal is recorded`);
      }
      assert.equal(surface.gateway.roomChannel.occupancyOf(gateway.gatewayId, runtimeRoomId)?.occupancy, 'PREPARED', 'nothing refused was recorded');
    } finally {
      await surface.close();
    }
  });

  it('refuses an unknown key and a Gateway that is no longer enrolled', async () => {
    const stub = roomStub();
    const surface = await startSurface({}, stub.pool);
    try {
      const gateway = enroll(stub);
      const epoch = await openSession(surface, gateway);
      const runtimeRoomId = roomId();
      const payload = { lifecycleRoomId: uuid(), runtimeRoomId, occupancy: 'CLOSED' };
      const stranger: Enrolled = { gatewayId: uuid(), key: generateTestKeypair() };
      const unknown = await post(surface, '/gateway/room/occupancy', occupancy(stranger, epoch, 1, runtimeRoomId, payload));
      assert.deepEqual([unknown.status, unknown.body['error']], [401, 'unknown_key']);

      stub.registry.get(gateway.gatewayId)!.state = 'revoked';
      const revoked = await post(surface, '/gateway/room/occupancy', occupancy(gateway, epoch, 1, runtimeRoomId, payload));
      assert.deepEqual([revoked.status, revoked.body['error']], [403, 'revoked']);
      const requestId = uuid();
      const revokedMint = await post(
        surface,
        '/gateway/room/minted',
        minted(gateway, epoch, 1, requestId, { requestId, lifecycleRoomId: uuid(), runtimeRoomId, occupancy: 'PREPARED' }),
      );
      assert.deepEqual([revokedMint.status, revokedMint.body['error']], [403, 'revoked']);
      assert.deepEqual(stub.rejections.map((row) => row.errorCode), ['unknown_key', 'revoked', 'revoked']);
      assert.equal(stub.rejections[0]?.resolvedKeyId, 'unknown', 'an unresolved key is counted as unresolved');
      assert.equal(stub.rejections[1]?.resolvedKeyId, gateway.key.keyId, 'a refusal after resolution is counted under the resolved key');
    } finally {
      await surface.close();
    }
  });
});

describe('gateway-room-routes · cross-purpose refusal on every route, both ways', () => {
  it('answers 401 purpose_mismatch for a room report on another route and another envelope on a room route', async () => {
    const { surface, gateway, epoch, lifecycleRoomId, requestId } = await delivered();
    try {
      const runtimeRoomId = roomId();
      const mintedReport = minted(gateway, epoch, 2, requestId, { requestId, lifecycleRoomId, runtimeRoomId, occupancy: 'PREPARED' });
      const occupancyReport = occupancy(gateway, epoch, 2, runtimeRoomId, { lifecycleRoomId, runtimeRoomId, occupancy: 'PREPARED' });
      const beat = makeHeartbeat(gateway.key, { ...base(gateway, epoch, 2) });
      const pollEnvelope = poll(gateway, epoch, 2);
      const cases: readonly [string, unknown][] = [
        ['/gateway/room/minted', occupancyReport],
        ['/gateway/room/minted', beat],
        ['/gateway/room/minted', pollEnvelope],
        ['/gateway/room/occupancy', mintedReport],
        ['/gateway/room/occupancy', beat],
        ['/gateway/heartbeat', mintedReport],
        ['/gateway/heartbeat', occupancyReport],
        ['/gateway/planner/poll', mintedReport],
        ['/gateway/planner/report', mintedReport],
        ['/gateway/planner/report', occupancyReport],
        ['/gateway/session-start', occupancyReport],
      ];
      for (const [path, envelope] of cases) {
        const result = await post(surface, path, envelope);
        assert.deepEqual(
          [result.status, result.body['error']],
          [401, 'purpose_mismatch'],
          `${path} given ${(envelope as { purpose: string }).purpose}`,
        );
      }
      assert.deepEqual(surface.gateway.roomChannel.mintedFor(gateway.gatewayId, lifecycleRoomId), []);
    } finally {
      await surface.close();
    }
  });
});

describe('gateway-room-routes · body limit and rate limits', () => {
  it('keeps the 16 KB gateway limit on both room routes', async () => {
    const stub = roomStub();
    const surface = await startSurface({}, stub.pool);
    try {
      for (const path of ['/gateway/room/minted', '/gateway/room/occupancy']) {
        const result = await post(surface, path, JSON.stringify({ padding: 'x'.repeat(17 * 1024) }));
        assert.deepEqual([result.status, result.body['error']], [413, 'payload_too_large'], path);
      }
    } finally {
      await surface.close();
    }
  });

  it('limits each room route by its own window, before any signature work', async () => {
    assert.equal(RATE_LIMITS.roomMinted, 60);
    assert.equal(RATE_LIMITS.roomOccupancy, 60);
    const stub = roomStub();
    const surface = await startSurface({}, stub.pool);
    try {
      for (const [path, max] of [
        ['/gateway/room/minted', RATE_LIMITS.roomMinted],
        ['/gateway/room/occupancy', RATE_LIMITS.roomOccupancy],
      ] as const) {
        const statuses: number[] = [];
        for (let i = 0; i < max + 2; i += 1) statuses.push((await post(surface, path, { not: 'an envelope' })).status);
        assert.ok(statuses.slice(0, max).every((status) => status === 400), `${path}: under the limit, refused as malformed`);
        assert.deepEqual(statuses.slice(max), [429, 429], `${path}: over the limit`);
      }
    } finally {
      await surface.close();
    }
  });
});
