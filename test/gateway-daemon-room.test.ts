/**
 * The Gateway's room worker and the daemon tick that carries it
 * (FOUNDER-ACT-20261117-BR-PHASE5-STEP1 B2).
 *
 * What is proven:
 *   - the worker mints one runtime room per lifecycle room through
 *     `RoomRuntime.createRoom(requestId)`, born PREPARED; a re-delivered
 *     request, or a new one for the same lifecycle room, is answered with the
 *     room already minted and mints nothing; a request id reused for another
 *     lifecycle room is refused;
 *   - an absent, unknown or malformed `room` member is ignored: nothing is
 *     minted, nothing is sent, the lane keeps heartbeating;
 *   - nothing the control plane would refuse is sent: a payload that fails the
 *     protocol's validator is never offered;
 *   - the minted report carries exactly requestId, lifecycleRoomId and
 *     runtimeRoomId, no occupancy; a room's occupancy goes only in its own
 *     occupancy report, and only once `roomBound` marks the room bound (act
 *     B2: a bound runtime room's occupancy); an unbound room's never goes;
 *   - occupancy is reported when it changes and at least every sixth tick;
 *   - the daemon polls with no planner executor, and a planner request a poll
 *     carries is then not read; `exchangePlanner` is unchanged, reading only
 *     planner work; a refused minted report is retried by re-delivery;
 *   - end to end, a real daemon against the real control-plane routes over a
 *     stubbed database: the control plane asks, the daemon mints and reports,
 *     and the control plane's room channel records the room; it takes the
 *     room's occupancy only once the lifecycle log binds the room to it;
 *   - the mint exchange count is of minted reports the control plane took.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ControlPlaneClient,
  Custody,
  GatewayDaemon,
  GatewayRoomWorker,
  OCCUPANCY_REFRESH_TICKS,
  PrimaryLane,
  RoomRuntime,
  gatewayPaths,
  generateGatewayKeypair,
  type FetchLike,
  type GatewayIdentity,
  type PlannerRequestHandler,
  type RoomRequestHandler,
} from '../packages/gateway-daemon/src/index.js';
import {
  runtimeRoomMintedSignedBytes,
  runtimeRoomOccupancySignedBytes,
  validateRuntimeRoomMinted,
  validateRuntimeRoomMintedPayload,
  validateRuntimeRoomOccupancy,
  validateRuntimeRoomOccupancyPayload,
  type PlannerReportPayload,
  type RuntimeRoomOccupancyPayload,
} from '../packages/gateway-protocol/src/index.js';
import { FIXED_WALL_MS, hex32, publicKeyFromRaw, uuid } from './gateway-helpers.js';
import { FileKeychainRunner } from './fake-keychain.js';
import { closeAllSurfaces, startSurface } from './gateway-surface-helpers.js';
import { roomStub } from './gateway-room-stub.js';

after(closeAllSurfaces);

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function identity(): GatewayIdentity {
  const keypair = generateGatewayKeypair();
  return { gatewayId: uuid(), keyId: keypair.keyId, pubkeyBase64: keypair.pubkeyBase64, privateKey: keypair.privateKey };
}

function mintRequest(lifecycleRoomId = uuid(), requestId = uuid()) {
  return { kind: 'mint', requestId, lifecycleRoomId };
}

/** A real room runtime, with `createRoom` calls counted. */
function countedRooms(newId: () => string = uuid): { runtime: RoomRuntime; creates: () => number } {
  const runtime = new RoomRuntime({ newId });
  let creates = 0;
  const original = runtime.createRoom.bind(runtime);
  runtime.createRoom = (key: string) => {
    creates += 1;
    return original(key);
  };
  return { runtime, creates: () => creates };
}

describe('gateway-daemon-room · the worker mints once per lifecycle room', () => {
  it('mints through createRoom(requestId), born PREPARED, and reports exactly the closed payload, with no occupancy', () => {
    const { runtime, creates } = countedRooms();
    const worker = new GatewayRoomWorker({ rooms: runtime });
    const request = mintRequest();
    const payload = worker.handleRoom(request);
    assert.ok(payload);
    assert.equal(creates(), 1);
    assert.deepEqual(validateRuntimeRoomMintedPayload(JSON.parse(JSON.stringify(payload))), payload);
    assert.equal(payload.requestId, request.requestId);
    assert.equal(payload.lifecycleRoomId, request.lifecycleRoomId);
    assert.match(payload.runtimeRoomId, /^room-[0-9a-f-]{36}$/);
    assert.deepEqual(Object.keys(payload).sort(), ['lifecycleRoomId', 'requestId', 'runtimeRoomId'], 'exactly three members, no occupancy');
    assert.equal(runtime.snapshot(payload.runtimeRoomId)?.occupancy, 'PREPARED');
    assert.deepEqual([...worker.minted()], [[request.lifecycleRoomId, payload.runtimeRoomId]]);
  });

  it('answers a re-delivered request, and a new request for the same lifecycle room, with the room it holds', () => {
    const { runtime, creates } = countedRooms();
    const worker = new GatewayRoomWorker({ rooms: runtime });
    const request = mintRequest();
    const first = worker.handleRoom(request);
    const again = worker.handleRoom({ ...request });
    assert.deepEqual(again, first, 'the same request: the same answer');
    const renewed = worker.handleRoom(mintRequest(request.lifecycleRoomId));
    assert.equal(renewed?.runtimeRoomId, first?.runtimeRoomId, 'a new request for the lifecycle room: the same room');
    assert.notEqual(renewed?.requestId, first?.requestId, 'answering the request it was asked');
    assert.equal(creates(), 1, 'minted once');
    assert.equal(runtime.listRooms().length, 1);
  });

  it('refuses a request id createRoom already used for another lifecycle room', () => {
    const { runtime } = countedRooms();
    const worker = new GatewayRoomWorker({ rooms: runtime });
    const first = mintRequest();
    assert.ok(worker.handleRoom(first));
    assert.equal(worker.handleRoom(mintRequest(uuid(), first.requestId)), null);
    assert.equal(worker.minted().size, 1, 'no runtime room is reported for two lifecycle rooms');
  });

  it('ignores an absent, unknown or malformed room member, minting nothing', () => {
    const { runtime, creates } = countedRooms();
    const logs: string[] = [];
    const worker = new GatewayRoomWorker({ rooms: runtime, log: (_level, at) => logs.push(at) });
    const good = mintRequest();
    for (const raw of [
      null,
      undefined,
      'mint',
      7,
      [],
      [good],
      {},
      { ...good, kind: 'bind' },
      { ...good, kind: 'close' },
      { ...good, extra: true },
      { kind: 'mint', requestId: good.requestId },
      { ...good, requestId: 'not-a-uuid' },
      { ...good, lifecycleRoomId: good.lifecycleRoomId.toUpperCase() },
    ]) {
      assert.equal(worker.handleRoom(raw), null, JSON.stringify(raw));
    }
    assert.equal(creates(), 0);
    assert.equal(worker.minted().size, 0);
    assert.ok(logs.every((at) => at === 'room.request_ignored'));
  });

  it('offers nothing it could not send: a runtime room id outside the protocol format, or a refused mint', () => {
    const odd = new GatewayRoomWorker({ rooms: new RoomRuntime({ newId: () => 'NOT-A-UUID' }) });
    assert.equal(odd.handleRoom(mintRequest()), null);
    const refusing = new GatewayRoomWorker({
      rooms: { createRoom: () => ({ ok: false, reason: 'idempotency_conflict' }), snapshot: () => null },
    });
    assert.equal(refusing.handleRoom(mintRequest()), null);
    assert.equal(refusing.minted().size, 0);
  });
});

describe('gateway-daemon-room · occupancy is due on change and every sixth tick', () => {
  it('is never due for a room not marked bound, and roomBound marks only a room this worker minted for that lifecycle room', () => {
    const { runtime } = countedRooms();
    const worker = new GatewayRoomWorker({ rooms: runtime });
    const minted = worker.handleRoom(mintRequest());
    assert.ok(minted);
    assert.deepEqual(worker.dueOccupancy(), [], 'minted, not bound: no occupancy is due (act B2)');
    for (let tick = 1; tick <= 2 * OCCUPANCY_REFRESH_TICKS; tick += 1) {
      worker.tick();
      assert.deepEqual(worker.dueOccupancy(), [], `unbound at tick ${tick}`);
    }
    runtime.occupyFixtureRoom(minted.runtimeRoomId);
    assert.deepEqual(worker.dueOccupancy(), [], 'a change of an unbound room is not due either');

    const other = worker.handleRoom(mintRequest());
    assert.ok(other);
    assert.equal(worker.roomBound(minted.lifecycleRoomId, other.runtimeRoomId), false, 'another lifecycle room\'s runtime room');
    assert.equal(worker.roomBound(uuid(), minted.runtimeRoomId), false, 'a lifecycle room it minted nothing for');
    assert.deepEqual(worker.dueOccupancy(), [], 'nothing marked');
    assert.equal(worker.roomBound(minted.lifecycleRoomId, minted.runtimeRoomId), true);
    assert.deepEqual(worker.dueOccupancy(), [{ lifecycleRoomId: minted.lifecycleRoomId, runtimeRoomId: minted.runtimeRoomId, occupancy: 'OCCUPIED' }], 'only the bound room');
  });

  it('is due once bound, then not until it changes or six ticks pass', () => {
    const { runtime } = countedRooms();
    const worker = new GatewayRoomWorker({ rooms: runtime });
    const minted = worker.handleRoom(mintRequest());
    assert.ok(minted);
    assert.equal(worker.roomBound(minted.lifecycleRoomId, minted.runtimeRoomId), true);
    const [first] = worker.dueOccupancy();
    assert.deepEqual(first, { lifecycleRoomId: minted.lifecycleRoomId, runtimeRoomId: minted.runtimeRoomId, occupancy: 'PREPARED' }, 'bound, never reported: due, the minted report carrying none');
    worker.occupancySent(first!);
    assert.deepEqual(worker.dueOccupancy(), [], 'taken: not due again');

    for (let tick = 1; tick < OCCUPANCY_REFRESH_TICKS; tick += 1) {
      worker.tick();
      assert.deepEqual(worker.dueOccupancy(), [], `tick ${tick}`);
    }
    worker.tick();
    const due = worker.dueOccupancy();
    assert.deepEqual(due, [{ lifecycleRoomId: minted.lifecycleRoomId, runtimeRoomId: minted.runtimeRoomId, occupancy: 'PREPARED' }]);
    assert.deepEqual(validateRuntimeRoomOccupancyPayload(JSON.parse(JSON.stringify(due[0]))), due[0]);
    worker.occupancySent(due[0]!);
    assert.deepEqual(worker.dueOccupancy(), []);

    runtime.occupyFixtureRoom(minted.runtimeRoomId);
    assert.deepEqual(worker.dueOccupancy().map((p) => p.occupancy), ['OCCUPIED'], 'a change is due at once');
  });

  it('holds a refused occupancy back until the next refresh, then offers it again; a change goes at once', () => {
    const { runtime } = countedRooms();
    const worker = new GatewayRoomWorker({ rooms: runtime });
    const minted = worker.handleRoom(mintRequest());
    assert.ok(minted);
    worker.roomBound(minted.lifecycleRoomId, minted.runtimeRoomId);
    const [first] = worker.dueOccupancy();
    assert.ok(first);

    // The control plane answered accepted: false (it holds no mint for the
    // room, say after a leader change): not delivered, and not every tick.
    worker.occupancyRefused(first);
    for (let tick = 1; tick < OCCUPANCY_REFRESH_TICKS; tick += 1) {
      worker.tick();
      assert.deepEqual(worker.dueOccupancy(), [], `held back at tick ${tick}`);
    }
    worker.tick();
    assert.deepEqual(worker.dueOccupancy(), [first], 'due again at the refresh');

    worker.occupancyRefused(first);
    runtime.occupyFixtureRoom(minted.runtimeRoomId);
    assert.deepEqual(worker.dueOccupancy().map((p) => p.occupancy), ['OCCUPIED'], 'a change is not held back');
    worker.occupancySent(worker.dueOccupancy()[0]!);
    assert.deepEqual(worker.dueOccupancy(), [], 'taken: nothing due');
  });

  it('puts changed rooms first, then the longest waiting', () => {
    const { runtime } = countedRooms();
    const worker = new GatewayRoomWorker({ rooms: runtime });
    const taken = (room: { lifecycleRoomId: string; runtimeRoomId: string }): void =>
      worker.occupancySent({ lifecycleRoomId: room.lifecycleRoomId, runtimeRoomId: room.runtimeRoomId, occupancy: 'PREPARED' });
    const bound = (room: { lifecycleRoomId: string; runtimeRoomId: string }): void =>
      void worker.roomBound(room.lifecycleRoomId, room.runtimeRoomId);
    const a = worker.handleRoom(mintRequest())!;
    bound(a);
    taken(a);
    worker.tick();
    const b = worker.handleRoom(mintRequest())!;
    bound(b);
    taken(b);
    for (let i = 0; i < OCCUPANCY_REFRESH_TICKS; i += 1) worker.tick();
    const c = worker.handleRoom(mintRequest())!;
    bound(c);
    taken(c);
    runtime.occupyFixtureRoom(c.runtimeRoomId);
    assert.deepEqual(
      worker.dueOccupancy().map((p) => p.runtimeRoomId),
      [c.runtimeRoomId, a.runtimeRoomId, b.runtimeRoomId],
    );
  });
});

/* ---- a scripted control plane ------------------------------------------ */

interface Call {
  readonly path: string;
  readonly body: Record<string, unknown> | null;
}

interface PollAnswer {
  readonly request?: unknown;
  readonly room?: unknown;
  /** Leave the `room` member out of the answer altogether. */
  readonly omitRoom?: boolean;
}

function json(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

/** Answers every verb as an accepting control plane does, unless a scripted answer is queued for its path. */
function scriptedPlane(gatewayId: string) {
  const calls: Call[] = [];
  const polls: PollAnswer[] = [];
  const queued = new Map<string, Response[]>();
  const epoch = hex32();
  const fetchImpl: FetchLike = async (url, init) => {
    const path = new URL(url).pathname;
    const body = init?.body === undefined ? null : (JSON.parse(String(init.body)) as Record<string, unknown>);
    calls.push({ path, body });
    const scripted = queued.get(path)?.shift();
    if (scripted !== undefined) return scripted;
    const session = { ok: true, state: 'enrolled', epoch };
    switch (path) {
      case '/gateway/session-challenge':
        return json(200, { generation: 1, challenge: hex32(), issuedAt: new Date(FIXED_WALL_MS).toISOString() });
      case '/gateway/session-start':
        return json(200, { ...session, gatewayId });
      case '/gateway/heartbeat':
        return json(200, session);
      case '/gateway/planner/poll': {
        const next = polls.shift() ?? {};
        return json(200, { ...session, request: next.request ?? null, ...(next.omitRoom === true ? {} : { room: next.room ?? null }) });
      }
      case '/gateway/planner/report':
      case '/gateway/room/minted':
      case '/gateway/room/occupancy':
        return json(200, { ...session, accepted: true });
      default:
        return json(404, { error: 'not_found' });
    }
  };
  return {
    calls,
    polls,
    fetchImpl,
    queue: (path: string, response: Response) => queued.set(path, [...(queued.get(path) ?? []), response]),
    paths: () => calls.map((call) => call.path),
    of: (path: string) => calls.filter((call) => call.path === path).map((call) => call.body!),
    clear: () => calls.splice(0, calls.length),
  };
}

function daemonOver(fetchImpl: FetchLike, id: GatewayIdentity, clock = { wallNow: () => FIXED_WALL_MS, monotonicNow: () => 1_000 }): GatewayDaemon {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-room-'));
  roots.push(root);
  const daemon = new GatewayDaemon({
    paths: gatewayPaths(join(root, 'gateway')),
    clock,
    custody: new Custody(new FileKeychainRunner(join(root, 'keychain'))),
    client: new ControlPlaneClient('http://control-plane.invalid', fetchImpl),
    heartbeatCadenceMs: 10_000,
  });
  daemon.primary.adopt(id);
  return daemon;
}

function signedBy(id: GatewayIdentity, bytes: Uint8Array, signature: unknown): boolean {
  const raw = new Uint8Array(Buffer.from(id.pubkeyBase64, 'base64'));
  return verify(null, Buffer.from(bytes), publicKeyFromRaw(raw), Buffer.from(String(signature), 'base64'));
}

function sessionMembers(envelope: Record<string, unknown>) {
  return {
    gatewayId: envelope['gatewayId'] as string,
    keyId: envelope['keyId'] as string,
    epoch: envelope['epoch'] as string,
    sequence: envelope['sequence'] as number,
    nonce: envelope['nonce'] as string,
    timestampMs: envelope['timestampMs'] as number,
  };
}

describe('gateway-daemon-room · the tick answers a mint request', () => {
  it('polls with no planner executor, mints, and sends one signed runtime_room_minted report; occupancy only once the room is bound', async () => {
    const id = identity();
    const plane = scriptedPlane(id.gatewayId);
    const daemon = daemonOver(plane.fetchImpl, id);
    assert.equal(daemon.planner, null, 'no planner executor on this daemon');
    const request = mintRequest();
    plane.polls.push({ room: request });

    await daemon.tick();
    assert.deepEqual(plane.paths(), [
      '/gateway/session-challenge',
      '/gateway/session-start',
      '/gateway/planner/poll',
      '/gateway/room/minted',
      '/gateway/planner/poll',
    ], 'no occupancy report: the room is not bound');
    const [report] = plane.of('/gateway/room/minted');
    const parsed = validateRuntimeRoomMinted(report);
    assert.ok(parsed.ok, 'the control plane would parse it');
    const payload = JSON.parse(report!['payload'] as string) as Record<string, unknown>;
    const runtimeRoomId = daemon.roomWorker.minted().get(request.lifecycleRoomId);
    assert.deepEqual(payload, { requestId: request.requestId, lifecycleRoomId: request.lifecycleRoomId, runtimeRoomId }, 'exactly three members, no occupancy');
    assert.equal(report!['requestId'], request.requestId);
    assert.equal(report!['payloadDigest'], createHash('sha256').update(report!['payload'] as string, 'utf8').digest('hex'));
    const signed = runtimeRoomMintedSignedBytes({
      ...sessionMembers(report!),
      requestId: request.requestId,
      payloadDigest: report!['payloadDigest'] as string,
    });
    assert.ok(signedBy(id, signed, report!['signature']));
    assert.deepEqual(
      plane.calls.filter((call) => call.body !== null && 'sequence' in call.body).map((call) => call.body!['sequence']),
      [1, 2, 3],
      'poll, report and poll take the session sequence in order',
    );

    // Marked bound (nothing in step 1 does this; a later step will), the
    // next tick reports the room's occupancy on its own.
    assert.equal(daemon.roomWorker.roomBound(request.lifecycleRoomId, runtimeRoomId!), true);
    await daemon.tick();
    const reports = plane.of('/gateway/room/occupancy');
    assert.equal(reports.length, 1);
    assert.ok(validateRuntimeRoomOccupancy(reports[0]).ok);
    assert.deepEqual(JSON.parse(reports[0]!['payload'] as string), { lifecycleRoomId: request.lifecycleRoomId, runtimeRoomId, occupancy: 'PREPARED' });
    assert.equal(daemon.rooms.snapshot(runtimeRoomId!)?.occupancy, 'PREPARED');
    assert.equal(daemon.primary.laneState, 'HEARTBEATING');
  });

  it('handles a mint request once: a re-delivered request is answered with the same room, minting nothing', async () => {
    const id = identity();
    const plane = scriptedPlane(id.gatewayId);
    const daemon = daemonOver(plane.fetchImpl, id);
    const request = mintRequest();
    plane.polls.push({ room: request });
    await daemon.tick();
    // The control plane did not record the report (say it was lost) and delivers the request again.
    plane.polls.push({ room: request });
    await daemon.tick();
    const reports = plane.of('/gateway/room/minted').map((report) => JSON.parse(report['payload'] as string) as Record<string, unknown>);
    assert.equal(reports.length, 2);
    assert.deepEqual(reports[1], reports[0]);
    assert.equal(daemon.rooms.listRooms().length, 1, 'one runtime room');
  });

  it('retries a refused minted report by re-delivery, after the lane backs off', async () => {
    const id = identity();
    const plane = scriptedPlane(id.gatewayId);
    let mono = 1_000;
    const daemon = daemonOver(plane.fetchImpl, id, { wallNow: () => FIXED_WALL_MS, monotonicNow: () => mono });
    const request = mintRequest();
    plane.polls.push({ room: request });
    plane.queue('/gateway/room/minted', json(503, { error: 'not_leader' }));
    await daemon.tick();
    assert.equal(plane.of('/gateway/room/minted').length, 1);
    assert.deepEqual(daemon.roomWorker.dueOccupancy(), [], 'not bound: no occupancy is due');
    assert.equal(plane.of('/gateway/room/occupancy').length, 0);

    mono += 60_000;
    plane.polls.push({ room: request });
    await daemon.tick();
    const reports = plane.of('/gateway/room/minted');
    assert.equal(reports.length, 2);
    assert.equal(reports[0]!['payload'], reports[1]!['payload'], 'the same room, answered again');
    assert.equal(daemon.rooms.listRooms().length, 1);
  });
});

describe('gateway-daemon-room · a malformed room member never halts the lane', () => {
  it('ignores it, sends nothing for it, and keeps heartbeating', async () => {
    const id = identity();
    const plane = scriptedPlane(id.gatewayId);
    const daemon = daemonOver(plane.fetchImpl, id);
    const good = mintRequest();
    const malformed: readonly PollAnswer[] = [
      { omitRoom: true },
      { room: 'mint' },
      { room: [good] },
      { room: { ...good, kind: 'bind' } },
      { room: { ...good, extra: 1 } },
      { room: { ...good, requestId: 'x' } },
      { room: { kind: 'mint' } },
      { room: 42 },
      { room: true },
    ];
    for (const answer of malformed) {
      plane.polls.push(answer);
      await daemon.tick();
      assert.equal(daemon.primary.laneState, 'HEARTBEATING', JSON.stringify(answer));
    }
    assert.equal(plane.of('/gateway/room/minted').length, 0);
    assert.equal(plane.of('/gateway/room/occupancy').length, 0);
    assert.equal(daemon.rooms.listRooms().length, 0);
    assert.equal(plane.of('/gateway/heartbeat').length, malformed.length - 1, 'every tick after the first beat');
  });
});

describe('gateway-daemon-room · occupancy reports from the tick', () => {
  it('reports a bound room once bound, on change at once, and unchanged every sixth tick', async () => {
    const id = identity();
    const plane = scriptedPlane(id.gatewayId);
    const daemon = daemonOver(plane.fetchImpl, id);
    const request = mintRequest();
    plane.polls.push({ room: request });
    await daemon.tick();
    const runtimeRoomId = daemon.roomWorker.minted().get(request.lifecycleRoomId)!;
    assert.equal(plane.of('/gateway/room/occupancy').length, 0, 'minted, not bound: nothing reported');
    daemon.roomWorker.roomBound(request.lifecycleRoomId, runtimeRoomId);
    await daemon.tick();
    assert.equal(plane.of('/gateway/room/occupancy').length, 1, 'bound: reported on the next tick');

    const sentAt: number[] = [];
    for (let tick = 1; tick <= 2 * OCCUPANCY_REFRESH_TICKS; tick += 1) {
      const before = plane.of('/gateway/room/occupancy').length;
      await daemon.tick();
      if (plane.of('/gateway/room/occupancy').length > before) sentAt.push(tick);
    }
    assert.deepEqual(sentAt, [OCCUPANCY_REFRESH_TICKS, 2 * OCCUPANCY_REFRESH_TICKS], 'unchanged: every sixth tick');

    daemon.rooms.occupyFixtureRoom(runtimeRoomId);
    await daemon.tick();
    const reports = plane.of('/gateway/room/occupancy');
    const last = reports.at(-1)!;
    assert.equal(reports.length, 4, 'once on being bound, at each refresh, and a change on the next tick');
    assert.ok(validateRuntimeRoomOccupancy(last).ok);
    assert.equal(last['runtimeRoomId'], runtimeRoomId);
    assert.deepEqual(JSON.parse(last['payload'] as string), { lifecycleRoomId: request.lifecycleRoomId, runtimeRoomId, occupancy: 'OCCUPIED' });
    const signed = runtimeRoomOccupancySignedBytes({
      ...sessionMembers(last),
      runtimeRoomId,
      payloadDigest: last['payloadDigest'] as string,
    });
    assert.ok(signedBy(id, signed, last['signature']));

    daemon.rooms.interruptFixtureRoom(runtimeRoomId);
    daemon.rooms.closeFixtureRoom(runtimeRoomId);
    await daemon.tick();
    assert.equal(JSON.parse(plane.of('/gateway/room/occupancy').at(-1)!['payload'] as string)['occupancy'], 'CLOSED');
  });
});

describe('gateway-daemon-room · a report the control plane did not accept is not delivered', () => {
  it('keeps an occupancy report answered accepted: false due, at the refresh pace', async () => {
    const id = identity();
    const plane = scriptedPlane(id.gatewayId);
    const daemon = daemonOver(plane.fetchImpl, id);
    const request = mintRequest();
    plane.polls.push({ room: request });
    await daemon.tick();
    const runtimeRoomId = daemon.roomWorker.minted().get(request.lifecycleRoomId)!;
    daemon.roomWorker.roomBound(request.lifecycleRoomId, runtimeRoomId);
    const epoch = plane.of('/gateway/room/minted')[0]!['epoch'] as string;

    const before = plane.of('/gateway/room/occupancy').length;
    daemon.rooms.occupyFixtureRoom(runtimeRoomId);
    plane.queue('/gateway/room/occupancy', json(200, { ok: true, state: 'enrolled', epoch, accepted: false }));
    await daemon.tick();
    assert.equal(plane.of('/gateway/room/occupancy').length, before + 1, 'sent once, refused');

    const sentAt: number[] = [];
    for (let tick = 1; tick <= OCCUPANCY_REFRESH_TICKS; tick += 1) {
      const before = plane.of('/gateway/room/occupancy').length;
      await daemon.tick();
      if (plane.of('/gateway/room/occupancy').length > before) sentAt.push(tick);
    }
    assert.deepEqual(sentAt, [OCCUPANCY_REFRESH_TICKS], 'not resent every tick; resent at the refresh');
    const resent = JSON.parse(plane.of('/gateway/room/occupancy').at(-1)!['payload'] as string);
    assert.equal(resent['occupancy'], 'OCCUPIED');
  });

  it('reportRoomOccupancy counts only the reports taken, and its cap bounds the reports sent', async () => {
    const id = identity();
    const plane = scriptedPlane(id.gatewayId);
    const lane = new PrimaryLane(new ControlPlaneClient('http://control-plane.invalid', plane.fetchImpl), { wallNow: () => FIXED_WALL_MS, monotonicNow: () => 1_000 }, id);
    assert.equal(await lane.step(), 'retain_and_continue');
    const epoch = lane.currentEpoch!;
    const due: RuntimeRoomOccupancyPayload[] = [
      { lifecycleRoomId: uuid(), runtimeRoomId: `room-${uuid()}`, occupancy: 'OCCUPIED' },
      { lifecycleRoomId: uuid(), runtimeRoomId: `room-${uuid()}`, occupancy: 'CLOSED' },
    ];
    const sent: RuntimeRoomOccupancyPayload[] = [];
    const refused: RuntimeRoomOccupancyPayload[] = [];
    const rooms: RoomRequestHandler = {
      handleRoom: () => null,
      dueOccupancy: () => due,
      occupancySent: (payload) => void sent.push(payload),
      occupancyRefused: (payload) => void refused.push(payload),
    };
    plane.queue('/gateway/room/occupancy', json(200, { ok: true, state: 'enrolled', epoch, accepted: false }));
    assert.equal(await lane.reportRoomOccupancy(rooms), 1, 'one of the two was taken');
    assert.deepEqual(refused, [due[0]]);
    assert.deepEqual(sent, [due[1]]);

    plane.clear();
    plane.queue('/gateway/room/occupancy', json(200, { ok: true, state: 'enrolled', epoch, accepted: false }));
    assert.equal(await lane.reportRoomOccupancy(rooms, 1), 0, 'the one sent was refused');
    assert.equal(plane.of('/gateway/room/occupancy').length, 1, 'the cap counts reports sent, refused ones included');
  });
});

describe('gateway-daemon-room · the planner path is unchanged', () => {
  const answer: PlannerReportPayload = { kind: 'never_received' };
  const plannerWorker = (): PlannerRequestHandler & { handled: unknown[] } => {
    const handled: unknown[] = [];
    return { handled, handle: async (request: unknown) => (handled.push(request), answer) };
  };

  async function heartbeatingLane(plane: ReturnType<typeof scriptedPlane>, id: GatewayIdentity): Promise<PrimaryLane> {
    const lane = new PrimaryLane(new ControlPlaneClient('http://control-plane.invalid', plane.fetchImpl), { wallNow: () => FIXED_WALL_MS, monotonicNow: () => 1_000 }, id);
    assert.equal(await lane.step(), 'retain_and_continue');
    plane.clear();
    return lane;
  }

  it('exchangePlanner reads planner work only: a room member beside it is not answered', async () => {
    const id = identity();
    const plane = scriptedPlane(id.gatewayId);
    const lane = await heartbeatingLane(plane, id);
    const worker = plannerWorker();
    const request = { requestId: uuid(), kind: 'status', commandId: 'cmd_1' };
    plane.polls.push({ request, room: mintRequest() });
    assert.equal(await lane.exchangePlanner(worker), 1);
    assert.deepEqual(plane.paths(), ['/gateway/planner/poll', '/gateway/planner/report', '/gateway/planner/poll']);
    assert.deepEqual(worker.handled, [request]);
    assert.equal(plane.of('/gateway/planner/report')[0]!['requestId'], request.requestId);
  });

  it('exchange answers the room member first, then handles and reports planner work exactly as before', async () => {
    const id = identity();
    const plane = scriptedPlane(id.gatewayId);
    const lane = await heartbeatingLane(plane, id);
    const worker = plannerWorker();
    const rooms = new GatewayRoomWorker({ rooms: new RoomRuntime({ newId: uuid }) });
    const request = { requestId: uuid(), kind: 'status', commandId: 'cmd_1' };
    plane.polls.push({ request, room: mintRequest() });
    assert.deepEqual(await lane.exchange(worker, rooms), { planner: 1, room: 1 });
    assert.deepEqual(plane.paths(), [
      '/gateway/planner/poll',
      '/gateway/room/minted',
      '/gateway/planner/report',
      '/gateway/planner/poll',
    ]);
    assert.deepEqual(worker.handled, [request]);
  });

  it('exchange counts only the minted reports the control plane took: not a malformed member, not one answered accepted: false', async () => {
    const id = identity();
    const plane = scriptedPlane(id.gatewayId);
    const lane = await heartbeatingLane(plane, id);
    const rooms = new GatewayRoomWorker({ rooms: new RoomRuntime({ newId: uuid }) });

    plane.polls.push({ room: { kind: 'mint' } });
    assert.deepEqual(await lane.exchange(null, rooms), { planner: 0, room: 0 }, 'a malformed member: nothing sent, nothing counted');
    assert.equal(plane.of('/gateway/room/minted').length, 0);

    const epoch = plane.of('/gateway/planner/poll')[0]!['epoch'] as string;
    plane.polls.push({ room: mintRequest() });
    plane.queue('/gateway/room/minted', json(200, { ok: true, state: 'enrolled', epoch, accepted: false }));
    assert.deepEqual(await lane.exchange(null, rooms), { planner: 0, room: 0 }, 'sent, but answered accepted: false');
    assert.equal(plane.of('/gateway/room/minted').length, 1);

    plane.polls.push({ room: mintRequest() });
    assert.deepEqual(await lane.exchange(null, rooms), { planner: 0, room: 1 }, 'taken');
  });

  it('a daemon with no planner executor does not read planner work a poll carries', async () => {
    const id = identity();
    const plane = scriptedPlane(id.gatewayId);
    const daemon = daemonOver(plane.fetchImpl, id);
    plane.polls.push({ request: { requestId: uuid(), kind: 'status', commandId: 'cmd_1' } });
    await daemon.tick();
    assert.equal(plane.of('/gateway/planner/report').length, 0);
    assert.equal(plane.of('/gateway/planner/poll').length, 1, 'nothing for this daemon to do: the exchange ends');
    assert.equal(daemon.primary.laneState, 'HEARTBEATING');
  });
});

describe('gateway-daemon-room · end to end against the real control-plane routes', () => {
  it('the control plane asks, the daemon mints and reports, and the room channel records the room, and its occupancy once bound', async () => {
    const stub = roomStub();
    const surface = await startSurface({}, stub.pool);
    const id = identity();
    stub.registry.set(id.gatewayId, { keyId: id.keyId, state: 'enrolled', pubkey: Buffer.from(id.pubkeyBase64, 'base64') });
    const root = mkdtempSync(join(tmpdir(), 'buildroom-room-e2e-'));
    roots.push(root);
    const daemon = new GatewayDaemon({
      paths: gatewayPaths(join(root, 'gateway')),
      clock: { wallNow: () => FIXED_WALL_MS + 100, monotonicNow: () => 1_000 },
      custody: new Custody(new FileKeychainRunner(join(root, 'keychain'))),
      client: new ControlPlaneClient(surface.url),
      heartbeatCadenceMs: 10_000,
    });
    daemon.primary.adopt(id);
    try {
      await daemon.tick();
      assert.equal(daemon.primary.laneState, 'HEARTBEATING', 'the session opened');

      const channel = surface.gateway.roomChannel;
      const lifecycleRoomId = uuid();
      stub.lifecycle.set(lifecycleRoomId, { state: 'BUILDING', binding: null });
      channel.requestMint(id.gatewayId, lifecycleRoomId);
      await daemon.tick();
      const runtimeRoomId = daemon.roomWorker.minted().get(lifecycleRoomId);
      assert.ok(runtimeRoomId, 'the daemon minted');
      assert.deepEqual(channel.mintedFor(id.gatewayId, lifecycleRoomId), [runtimeRoomId], 'the control plane recorded it');
      assert.equal(channel.occupancyOf(id.gatewayId, runtimeRoomId), null, 'minted but unbound: no occupancy is taken');
      assert.deepEqual(daemon.roomWorker.dueOccupancy(), [], 'nor sent: the daemon reports only a bound room');

      // The lifecycle log binds the room to that runtime room on that
      // Gateway, and the daemon is told so (no step-1 message does that; a
      // later step will).
      stub.lifecycle.set(lifecycleRoomId, { state: 'BUILDING', binding: { runtimeRoomId, gatewayId: id.gatewayId } });
      assert.equal(daemon.roomWorker.roomBound(lifecycleRoomId, runtimeRoomId), true);
      daemon.rooms.occupyFixtureRoom(runtimeRoomId);
      await daemon.tick();
      assert.equal(channel.occupancyOf(id.gatewayId, runtimeRoomId)?.occupancy, 'OCCUPIED', 'bound: the next report is taken');
      assert.equal(daemon.primary.laneState, 'HEARTBEATING');
      assert.deepEqual(stub.rejections, [], 'nothing the daemon sent was refused');
      assert.equal(surface.gateway.session.cursorFor(id.gatewayId)?.lastSequence, daemon.primary.lastSequence);
    } finally {
      await daemon.stop().catch(() => undefined);
      await surface.close();
    }
  });
});
