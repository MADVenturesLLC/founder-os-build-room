/**
 * Room Runtime Phase 1 — IPC v2 attach over the REAL daemon socket, with
 * IPC v1 preserved on the same path.
 *
 * Capabilities and r4 ATs bound (semantic source: r4 stack, r3 §13):
 *
 *   A  IPC v2 attach (explicitly versioned Hello; mux after Hello)   r4 §7.7
 *   I  IPC v1 preservation: status|tail unchanged after v2 exists   AT-R4-31
 *      ipc_version=99 → ipc_version_unsupported + close              AT-R4-32
 *   D  projector-minted authority → claim_rejected nack              AT-R4-16
 *   E  oversized v2 frame → Disconnect{frame_too_large} (viewer only) r4 §7.7
 *   F  viewer socket death detaches the viewer; occupancy untouched  AT-R4-01
 *   J  the four frozen verbs' wire semantics (JoinRoom/LeaveRoom/
 *      FollowRoom "rooms" + room_id)                                  r4 §7.15
 *
 * NEGATIVE CONTROLS (r3 stop conditions 4–7): the daemon's ONE existing
 * ipc.sock is the only listener; no broker.sock, no MADV_SOCKET_PATH, no TCP.
 *
 * FIXTURE OCCUPANCY ONLY. The socket is a temp-dir instance of the same
 * IpcServer the daemon boots; the rooms are fixture rooms.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection, type Socket } from 'node:net';
import {
  IpcServer,
  RingBuffer,
  RoomRuntime,
  gatewayPaths,
  ipcRequest,
  type GatewayPaths,
} from '../packages/gateway-daemon/src/index.js';
import {
  FRAME_TYPE_CONTROL,
  FRAME_TYPE_RESERVED_03,
  MAX_V2_FRAME_BYTES,
  decodeV2Frames,
  encodeV2Frame,
} from '../packages/gateway-protocol/src/index.js';

let dir: string;
let paths: GatewayPaths;
let server: IpcServer;
let rooms: RoomRuntime;
let ids = 0;
/** Every client socket opened by a proof, destroyed in `after` so server.stop() cannot hang on a live peer. */
const openSockets = new Set<Socket>();

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'phase1-ipc-'));
  paths = gatewayPaths(dir);
  rooms = new RoomRuntime({ newId: () => `id-${String(++ids)}` });
  rooms.createFixtureRoom('fixture-room');
  rooms.occupyFixtureRoom('fixture-room');
  const ring = new RingBuffer();
  ring.push({ at: '2026-09-10T00:00:00.000Z', level: 'info', at_: 'phase1.test', fields: { note: 'v1 tail entry' } });
  server = new IpcServer(paths, {
    status: () => ({ primary: { lane: 'ACTIVE' }, staging: { lane: 'INACTIVE' } }),
    ring: () => ring,
    rooms: () => rooms,
  });
  await server.start();
});

after(async () => {
  for (const socket of openSockets) socket.destroy();
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
});

/** Read frames until one with the given op arrives (pushed RoomDelta/patch frames may precede an answer). */
async function nextOp(client: V2Client, op: string, max = 20): Promise<{ type: number; body: Record<string, unknown> }> {
  for (let i = 0; i < max; i++) {
    const frame = await client.next();
    if (frame.body['op'] === op) return frame;
  }
  throw new Error(`no ${op} frame within ${String(max)} frames`);
}

// ---------------------------------------------------------------------------
// A minimal v2 client for the proofs (the TUI has its own consumer client).
// ---------------------------------------------------------------------------

interface V2Client {
  readonly socket: Socket;
  send(body: unknown): void;
  sendRaw(bytes: Buffer): void;
  next(timeoutMs?: number): Promise<{ type: number; body: Record<string, unknown> }>;
  nextRawLine(timeoutMs?: number): Promise<string>;
  closed(): Promise<void>;
}

function connectV2(): Promise<V2Client> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(paths.socketPath);
    let buffered: Buffer = Buffer.alloc(0);
    const queue: { type: number; body: Record<string, unknown> }[] = [];
    const rawLines: string[] = [];
    const waiters: ((f: { type: number; body: Record<string, unknown> }) => void)[] = [];
    const rawWaiters: ((line: string) => void)[] = [];
    let isClosed = false;
    const closeWaiters: (() => void)[] = [];
    socket.on('data', (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      // v1-shaped error answers (ipc_version_unsupported) are newline JSON.
      if (buffered.byteLength > 0 && buffered[0] === 0x7b /* '{' */) {
        const text = buffered.toString('utf8');
        const nl = text.indexOf('\n');
        if (nl !== -1) {
          const line = text.slice(0, nl);
          buffered = Buffer.from(text.slice(nl + 1), 'utf8');
          const w = rawWaiters.shift();
          if (w) w(line);
          else rawLines.push(line);
        }
        return;
      }
      const step = decodeV2Frames(buffered);
      buffered = step.rest;
      for (const frame of step.frames) {
        const body = JSON.parse(frame.payload.toString('utf8')) as Record<string, unknown>;
        const w = waiters.shift();
        if (w) w({ type: frame.type, body });
        else queue.push({ type: frame.type, body });
      }
    });
    socket.on('close', () => {
      isClosed = true;
      for (const w of closeWaiters.splice(0)) w();
    });
    socket.on('error', () => undefined);
    openSockets.add(socket);
    socket.on('connect', () => {
      resolve({
        socket,
        send: (body) => socket.write(encodeV2Frame(FRAME_TYPE_CONTROL, Buffer.from(JSON.stringify(body), 'utf8'))),
        sendRaw: (bytes) => socket.write(bytes),
        next: (timeoutMs = 3_000) =>
          new Promise((res, rej) => {
            const queued = queue.shift();
            if (queued) return res(queued);
            const timer = setTimeout(() => rej(new Error('no v2 frame within timeout')), timeoutMs);
            waiters.push((f) => {
              clearTimeout(timer);
              res(f);
            });
          }),
        nextRawLine: (timeoutMs = 3_000) =>
          new Promise((res, rej) => {
            const queued = rawLines.shift();
            if (queued !== undefined) return res(queued);
            const timer = setTimeout(() => rej(new Error('no raw line within timeout')), timeoutMs);
            rawWaiters.push((l) => {
              clearTimeout(timer);
              res(l);
            });
          }),
        closed: () =>
          new Promise((res) => {
            if (isClosed) return res();
            closeWaiters.push(res);
          }),
      });
    });
    socket.on('error', (err) => reject(err));
  });
}

async function hello(client: V2Client): Promise<Record<string, unknown>> {
  client.send({ op: 'Hello', ipc_version: 2 });
  const ack = await client.next();
  assert.equal(ack.type, FRAME_TYPE_CONTROL);
  assert.equal(ack.body['ok'], true);
  return ack.body;
}

describe('I — IPC v1 preserved on the same socket (AT-R4-31)', () => {
  it('v1 status and tail answer exactly as before while v2 rooms exist', async () => {
    const status = await ipcRequest(paths.socketPath, { op: 'status' });
    assert.equal(status.ok, true);
    if (status.ok) {
      assert.equal(status.body['ok'], true);
      assert.deepEqual(status.body['primary'], { lane: 'ACTIVE' });
    }
    const tail = await ipcRequest(paths.socketPath, { op: 'tail', limit: 5 });
    assert.equal(tail.ok, true);
    if (tail.ok) assert.equal((tail.body['entries'] as unknown[]).length, 1);
  });

  it('v1 client sending a v2 op name gets unknown_op (r4 §7.7 negotiation table)', async () => {
    const answer = await ipcRequest(paths.socketPath, { op: 'JoinRoom' } as unknown as { op: 'status' });
    assert.equal(answer.ok, true);
    if (answer.ok) assert.equal(answer.body['error'], 'unknown_op');
  });
});

describe('A — IPC v2 attach is explicitly versioned (AT-R4-32)', () => {
  it('Hello ipc_version=2 is acknowledged with the supported set and limits', async () => {
    const c = await connectV2();
    const ack = await hello(c);
    assert.equal(ack['ipc_version'], 2);
    assert.deepEqual(ack['supported'], [1, 2]);
    assert.equal((ack['limits'] as { max_frame_bytes: number }).max_frame_bytes, MAX_V2_FRAME_BYTES);
    c.socket.destroy();
  });

  it('Hello ipc_version=99 → {"error":"ipc_version_unsupported","supported":[1,2]} then close; never a stream', async () => {
    const c = await connectV2();
    c.send({ op: 'Hello', ipc_version: 99 });
    const line = await c.nextRawLine();
    assert.deepEqual(JSON.parse(line), { error: 'ipc_version_unsupported', supported: [1, 2] });
    await c.closed();
  });

  it('a non-control frame type (reserved 0x03) is nacked unknown_frame_type and that viewer socket is destroyed', async () => {
    const c = await connectV2();
    await hello(c);
    c.sendRaw(encodeV2Frame(FRAME_TYPE_RESERVED_03, Buffer.from('x')));
    const nack = await c.next();
    assert.equal(nack.body['op'], 'Nack');
    assert.equal(nack.body['reason'], 'unknown_frame_type');
    await c.closed();
    // Occupancy is untouched by a viewer's protocol error.
    assert.equal(rooms.snapshot('fixture-room')!.occupancy, 'OCCUPIED');
  });
});

describe('J — frozen verb wire semantics: JoinRoom / LeaveRoom / FollowRoom', () => {
  it('rooms: FollowRoom{target:"rooms"} returns Gateway-provided snapshots', async () => {
    const c = await connectV2();
    await hello(c);
    c.send({ op: 'FollowRoom', target: 'rooms' });
    const ack = await c.next();
    assert.equal(ack.body['op'], 'FollowRoom');
    const list = ack.body['rooms'] as { room_id: string; occupancy: string }[];
    assert.equal(list.length, 1);
    assert.equal(list[0]!.room_id, 'fixture-room');
    assert.equal(list[0]!.occupancy, 'OCCUPIED');
    c.socket.destroy();
  });

  it('join: the Gateway mints viewer_id + capability; snapshot carries canonical axes; leave detaches the viewer only', async () => {
    const c = await connectV2();
    await hello(c);
    c.send({ op: 'JoinRoom', room_id: 'fixture-room', idempotency_key: 'j1', viewer_caps: 'read' });
    const ack = await c.next();
    assert.equal(ack.body['op'], 'JoinRoom');
    assert.equal(ack.body['ok'], true);
    const viewerId = String(ack.body['viewer_id']);
    const capability = String(ack.body['viewer_capability']);
    assert.match(viewerId, /^viewer-id-\d+$/, 'Gateway-minted identity');
    assert.equal(ack.body['recovery_kind'], 'LIVE_REATTACH');
    const snapshot = ack.body['snapshot'] as Record<string, unknown>;
    assert.equal(snapshot['occupancy'], 'OCCUPIED');
    assert.equal((snapshot['executions'] as unknown[]).length, 2);

    // A fixture emit reaches the attached viewer as a 0x02 VT patch (never raw PTY).
    rooms.emitFixturePatch('fixture-room', 'slot-a', 'hello-viewer');
    // Pushed facts (RoomDelta from the join, the patch) drain ahead of the next answer.
    c.send({ op: 'FollowRoom', target: 'fixture-room', viewer_capability: capability });
    const follow = await nextOp(c, 'FollowRoom');
    assert.equal(follow.body['ok'], true);
    assert.equal(follow.body['viewer_id'], viewerId);

    c.send({ op: 'LeaveRoom', room_id: 'fixture-room', idempotency_key: 'l1', viewer_capability: capability });
    const left = await nextOp(c, 'LeaveRoom');
    assert.equal(left.body['disconnect'], 'leave');
    // The server drains pushed frames (delta/patch) and then Disconnect{leave}.
    const disconnect = await nextOp(c, 'Disconnect');
    assert.equal(disconnect.body['reason'], 'leave', 'leave ≠ occupancy_closed');
    await c.closed();
    const snap = rooms.snapshot('fixture-room')!;
    assert.equal(snap.occupancy, 'OCCUPIED', 'occupancy untouched by leave');
    assert.equal(snap.viewers.find((v) => v.viewer_id === viewerId)!.attachment, 'DETACHED');
  });

  it('viewer socket death detaches that viewer only; occupancy and executions continue (AT-R4-01)', async () => {
    const c = await connectV2();
    await hello(c);
    c.send({ op: 'JoinRoom', room_id: 'fixture-room', idempotency_key: 'j-death', viewer_caps: 'read+input' });
    const ack = await c.next();
    const viewerId = String(ack.body['viewer_id']);
    assert.equal(ack.body['input'], 'granted');
    c.socket.destroy();
    await c.closed();
    // Give the server's close handler a turn.
    await new Promise((r) => setTimeout(r, 50));
    const snap = rooms.snapshot('fixture-room')!;
    assert.equal(snap.occupancy, 'OCCUPIED');
    assert.equal(snap.executions.every((e) => e.state === 'RUNNING'), true);
    assert.equal(snap.viewers.find((v) => v.viewer_id === viewerId)!.attachment, 'DETACHED');
    assert.equal(snap.input_authority.kind, 'UNOWNED', 'the dead viewer\'s lease is released, not orphaned');
    rooms.emitFixturePatch('fixture-room', 'slot-b', 'still-alive');
  });
});

describe('D — projector cannot mint authority (AT-R4-16)', () => {
  it('lease-issue / EvidencePromote / envelope-widen / receipt-write → claim_rejected, never served', async () => {
    const c = await connectV2();
    await hello(c);
    for (const op of ['LeaseIssue', 'EvidencePromote', 'EnvelopeWiden', 'ReceiptWrite', 'MintViewerId', 'MintGeneration']) {
      c.send({ op, room_id: 'fixture-room' });
      const nack = await c.next();
      assert.equal(nack.body['op'], 'Nack', op);
      assert.equal(nack.body['reason'], 'claim_rejected', op);
    }
    // The connection is still alive and the room is unchanged.
    c.send({ op: 'FollowRoom', target: 'rooms' });
    const ack = await c.next();
    assert.equal(ack.body['ok'], true);
    assert.equal(rooms.snapshot('fixture-room')!.input_authority.kind, 'UNOWNED');
    c.socket.destroy();
  });

  it('an unknown op is unknown_op (not silently accepted)', async () => {
    const c = await connectV2();
    await hello(c);
    c.send({ op: 'InventedOp' });
    const nack = await c.next();
    assert.equal(nack.body['reason'], 'unknown_op');
    c.socket.destroy();
  });
});

describe('E — oversized v2 frame destroys the VIEWER socket; occupancy continues', () => {
  it('a frame longer than MAX_V2_FRAME_BYTES → Disconnect{frame_too_large}', async () => {
    const c = await connectV2();
    await hello(c);
    const header = Buffer.alloc(5);
    header.writeUInt32BE(MAX_V2_FRAME_BYTES + 1, 0);
    header.writeUInt8(FRAME_TYPE_CONTROL, 4);
    c.sendRaw(header);
    const frame = await c.next();
    assert.equal(frame.body['op'], 'Disconnect');
    assert.equal(frame.body['reason'], 'frame_too_large');
    await c.closed();
    assert.equal(rooms.snapshot('fixture-room')!.occupancy, 'OCCUPIED');
  });
});

describe('NEGATIVE CONTROLS — transport (r3 stops 4–7)', () => {
  it('exactly one listener exists: the daemon ipc.sock; no broker.sock; no MADV_SOCKET_PATH read', () => {
    const entries = readdirSync(dir);
    assert.deepEqual(entries.filter((e) => e.endsWith('.sock')), ['ipc.sock']);
    assert.equal(entries.includes('broker.sock'), false);
    assert.equal(process.env['MADV_SOCKET_PATH'], undefined);
  });
});

describe('K — CreateRoom over the wire (2026-09-20 Founder amendment, Act GLM-20260920)', () => {
  it('Hello → CreateRoom mints a room; FollowRoom "rooms" lists it; JoinRoom attaches with zero executions', async () => {
    const c = await connectV2();
    await hello(c);
    c.send({ op: 'CreateRoom', idempotency_key: 'wire-create-1' });
    const ack = await nextOp(c, 'CreateRoom');
    assert.equal(ack.body['ok'], true);
    assert.equal(ack.body['fixture'], false);
    assert.equal(typeof ack.body['room_id'], 'string');
    const roomId = String(ack.body['room_id']);
    const snapshot = ack.body['snapshot'] as { occupancy: string; executions: unknown[] };
    assert.equal(snapshot.occupancy, 'PREPARED');
    assert.equal(snapshot.executions.length, 0);

    c.send({ op: 'FollowRoom', target: 'rooms' });
    const list = await nextOp(c, 'FollowRoom');
    const roomsList = list.body['rooms'] as { room_id: string }[];
    assert.ok(roomsList.some((r) => r.room_id === roomId), 'the minted room appears in rooms facts');

    c.send({ op: 'JoinRoom', room_id: roomId, idempotency_key: 'wire-join-1', viewer_caps: 'read' });
    const joined = await nextOp(c, 'JoinRoom');
    assert.equal(joined.body['ok'], true);
    assert.equal(typeof joined.body['viewer_id'], 'string', 'the Gateway minted the viewer');
    c.socket.destroy();
  });

  it('CreateRoom without an idempotency_key is nacked invalid_request; a daemon-scoped key replays the same room', async () => {
    const c = await connectV2();
    await hello(c);
    c.send({ op: 'CreateRoom' });
    const nack = await nextOp(c, 'Nack');
    assert.equal(nack.body['reason'], 'invalid_request');

    c.send({ op: 'CreateRoom', idempotency_key: 'replay-key' });
    const first = await nextOp(c, 'CreateRoom');
    c.send({ op: 'CreateRoom', idempotency_key: 'replay-key' });
    const replay = await nextOp(c, 'CreateRoom');
    assert.equal(first.body['room_id'], replay.body['room_id']);
    c.socket.destroy();
  });
});
