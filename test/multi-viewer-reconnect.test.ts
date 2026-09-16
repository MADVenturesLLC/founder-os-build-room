/**
 * Multi-viewer reconnect / attach operability — v0 focused proofs
 * (Superlogical→MAD Session Operability v0, Lane 2, branch
 * build/multi-viewer-reconnect-v0).
 *
 * Commission scope: prove and harden — reconnect with a valid capability
 * resumes live delivery (AE-01 connection-token ownership holds); a second
 * viewer attach does not detach the first; detaching one viewer does not
 * stop room work (detach ≠ interrupt); replacement ownership — an old
 * socket, dead or alive, never steals the new binding (XG1 spirit, extended
 * here to DELIVERY while both sockets are alive); backpressure disconnects
 * stay truthful and never silently drop evidence.
 *
 * DELIBERATE NON-SCOPE (commission): the AE-01 Run02 harness viewer-gate is
 * PR #42's open scope — this file touches no harness timing and no fixture-
 * output gating. RoomStatus transitions on attach/detach are Lane 1/3
 * surface, not wired here.
 *
 * FIXTURE OCCUPANCY ONLY: every room here is a fixture room on a disposable
 * temp-dir socket (or a bare runtime, where noted); nothing in this file
 * claims production occupancy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection, type Socket } from 'node:net';
import { IpcServer, RingBuffer, RoomRuntime, gatewayPaths, type GatewayPaths } from '../packages/gateway-daemon/src/index.js';
import { FRAME_TYPE_CONTROL, FRAME_TYPE_VT_PATCH, encodeV2Frame, type GapFrame, type VtPatchPayload } from '../packages/gateway-protocol/src/index.js';

// ---------------------------------------------------------------------------
// Disposable fixture gateway (same IpcServer the daemon boots; temp socket)
// ---------------------------------------------------------------------------

interface FixtureGateway {
  readonly paths: GatewayPaths;
  readonly rooms: RoomRuntime;
}

const openSockets: Socket[] = [];
let ids = 0;

async function withIpc(run: (gateway: FixtureGateway) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mvr-'));
  const paths = gatewayPaths(dir);
  const rooms = new RoomRuntime({ newId: () => `id-${String(++ids)}` });
  const server = new IpcServer(paths, {
    status: () => ({ primary: {}, staging: {} }),
    ring: () => new RingBuffer(),
    rooms: () => rooms,
  });
  try {
    await server.start();
    await run({ paths, rooms });
  } finally {
    for (const socket of openSockets.splice(0)) socket.destroy();
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Minimal v2 client (same shape the phase1 IPC proofs use)
// ---------------------------------------------------------------------------

interface V2Client {
  readonly socket: Socket;
  send(body: unknown): void;
  next(timeoutMs?: number): Promise<{ type: number; body: Record<string, unknown> }>;
  /** Resolve with how many frames arrive within the window (then discard them). */
  collectFor(ms: number): Promise<number>;
  closed(): Promise<void>;
}

function connectV2(socketPath: string): Promise<V2Client> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    openSockets.push(socket);
    let buffered: Buffer = Buffer.alloc(0);
    const queue: { type: number; body: Record<string, unknown> }[] = [];
    const waiters: ((f: { type: number; body: Record<string, unknown> }) => void)[] = [];
    const closeWaiters: (() => void)[] = [];
    let isClosed = false;
    let failed = false;
    socket.on('data', (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      for (;;) {
        if (buffered.byteLength < 5) return;
        const length = buffered.readUInt32BE(0);
        if (buffered.byteLength < 5 + length) return;
        const type = buffered.readUInt8(4);
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(buffered.subarray(5, 5 + length).toString('utf8')) as Record<string, unknown>;
        } catch {
          body = {};
        }
        buffered = Buffer.from(buffered.subarray(5 + length));
        const waiter = waiters.shift();
        if (waiter !== undefined) waiter({ type, body });
        else queue.push({ type, body });
      }
    });
    socket.on('error', () => {
      failed = true;
      socket.destroy();
    });
    socket.on('close', () => {
      isClosed = true;
      for (const w of closeWaiters.splice(0)) w();
    });
    socket.on('connect', () => {
      if (failed) {
        reject(new Error('socket errored during connect'));
        return;
      }
      resolve({
        socket,
        send: (body: unknown) => socket.write(encodeV2Frame(FRAME_TYPE_CONTROL, Buffer.from(JSON.stringify(body), 'utf8'))),
        next: (timeoutMs = 2_000) =>
          new Promise((res, rej) => {
            const queued = queue.shift();
            if (queued !== undefined) {
              res(queued);
              return;
            }
            const timer = setTimeout(() => rej(new Error('no frame within timeout')), timeoutMs);
            timer.unref();
            waiters.push((f) => {
              clearTimeout(timer);
              res(f);
            });
          }),
        collectFor: (ms: number) =>
          new Promise((res) => {
            let count = 0;
            const drain = (): void => {
              while (queue.length > 0) {
                queue.shift();
                count += 1;
              }
            };
            const timer = setInterval(drain, 10);
            timer.unref();
            setTimeout(() => {
              clearInterval(timer);
              drain();
              res(count);
            }, ms).unref();
          }),
        closed: () =>
          new Promise((res) => {
            if (isClosed) {
              res();
              return;
            }
            closeWaiters.push(res);
          }),
      });
    });
    socket.on('error', reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms).unref());
}

async function hello(client: V2Client): Promise<void> {
  client.send({ op: 'Hello', ipc_version: 2 });
  const ack = await client.next();
  assert.equal(ack.body['op'], 'Hello');
  assert.equal(ack.body['ok'], true);
}

async function nextOp(client: V2Client, op: string, max = 30): Promise<{ type: number; body: Record<string, unknown> }> {
  for (let i = 0; i < max; i++) {
    const frame = await client.next();
    if (frame.body['op'] === op) return frame;
  }
  throw new Error(`no ${op} frame within ${String(max)} frames`);
}

interface JoinInfo {
  readonly viewerId: string;
  readonly capability: string;
  readonly body: Record<string, unknown>;
}

async function joinRoomByClient(client: V2Client, roomId: string, key: string, capability?: string, caps: 'read' | 'read+input' = 'read'): Promise<JoinInfo> {
  client.send({ op: 'JoinRoom', room_id: roomId, idempotency_key: key, ...(capability === undefined ? {} : { viewer_capability: capability }), viewer_caps: caps });
  const answer = await nextOp(client, 'JoinRoom');
  assert.equal(answer.body['ok'], true, `join ${key} ok`);
  return { viewerId: String(answer.body['viewer_id']), capability: String(answer.body['viewer_capability']), body: answer.body };
}

async function nextPatch(client: V2Client, executionId: string): Promise<VtPatchPayload> {
  for (;;) {
    const frame = await client.next();
    if (frame.type === FRAME_TYPE_VT_PATCH) {
      const patch = frame.body as unknown as VtPatchPayload;
      assert.equal(patch.execution_id, executionId);
      return patch;
    }
  }
}

function patchText(patch: VtPatchPayload): string {
  return patch.checkpoint_or_patch.kind === 'patch' ? patch.checkpoint_or_patch.text : '';
}

// ---------------------------------------------------------------------------
// Proofs
// ---------------------------------------------------------------------------

describe('Multi-viewer reconnect / attach operability v0', () => {
  it('R1 reconnect with a valid capability resumes live delivery with an honest Gap + ring fill', async () => {
    await withIpc(async (gateway) => {
      gateway.rooms.createFixtureRoom('room-r1');
      gateway.rooms.occupyFixtureRoom('room-r1');

      const first = await connectV2(gateway.paths.socketPath);
      await hello(first);
      const a = await joinRoomByClient(first, 'room-r1', 'r1a');
      first.socket.destroy(); // old socket dies WITHOUT a clean leave
      await sleep(100); // let the server observe the close (detaches that viewer only)

      // Missed range emitted while disconnected: the owner ring retains it.
      gateway.rooms.emitFixturePatch('room-r1', 'slot-a', 'missed-1');
      gateway.rooms.emitFixturePatch('room-r1', 'slot-a', 'missed-2');
      gateway.rooms.emitFixturePatch('room-r1', 'slot-a', 'missed-3');

      const second = await connectV2(gateway.paths.socketPath);
      try {
        await hello(second);
        const b = await joinRoomByClient(second, 'room-r1', 'r1b', a.capability);
        assert.equal(b.viewerId, a.viewerId, 'a valid capability resumes the SAME Gateway-minted identity');
        assert.equal(b.body['recovery_kind'], 'LIVE_REATTACH', 'occupied-room reconnect is live, never reconstruction');

        // Catch-up: an explicit Gap for the missed range, then the retained
        // ring suffix — evidence is filled, never silently dropped.
        const gap = parseGap(await second.next());
        assert.equal(gap.op, 'Gap');
        assert.equal(gap.execution_id, 'slot-a');
        assert.equal(gap.from_seq, 1);
        assert.equal(gap.to_seq, 3);
        assert.equal(gap.fillable, true, 'the ring still retains the missed range');
        for (const seq of [1, 2, 3]) {
          const patch = await nextPatch(second, 'slot-a');
          assert.equal(patch.pty_output_seq, seq);
        }

        // Live delivery resumes on the same binding.
        gateway.rooms.emitFixturePatch('room-r1', 'slot-a', 'live-tick');
        const live = await nextPatch(second, 'slot-a');
        assert.equal(live.pty_output_seq, 4);
        assert.equal(patchText(live), 'live-tick');
        const snapshot = gateway.rooms.snapshot('room-r1');
        assert.equal(snapshot?.viewers.find((v) => v.viewer_id === a.viewerId)?.attachment, 'ATTACHED');
      } finally {
        second.socket.destroy();
      }
    });
  });

  it('R2 a second viewer attach does not detach the first and both receive live frames', async () => {
    await withIpc(async (gateway) => {
      gateway.rooms.createFixtureRoom('room-r2');
      gateway.rooms.occupyFixtureRoom('room-r2');

      const c1 = await connectV2(gateway.paths.socketPath);
      const c2 = await connectV2(gateway.paths.socketPath);
      try {
        await hello(c1);
        await hello(c2);
        const a = await joinRoomByClient(c1, 'room-r2', 'r2a');
        const b = await joinRoomByClient(c2, 'room-r2', 'r2b');
        assert.notEqual(a.viewerId, b.viewerId, 'distinct fresh joins mint distinct identities');

        gateway.rooms.emitFixturePatch('room-r2', 'slot-a', 'for-both');
        assert.equal(patchText(await nextPatch(c1, 'slot-a')), 'for-both');
        assert.equal(patchText(await nextPatch(c2, 'slot-a')), 'for-both');

        const snapshot = gateway.rooms.snapshot('room-r2');
        assert.deepEqual(
          snapshot?.viewers.map((v) => v.attachment).sort(),
          ['ATTACHED', 'ATTACHED'],
          'neither viewer was detached by the second attach',
        );
      } finally {
        c1.socket.destroy();
        c2.socket.destroy();
      }
    });
  });

  it('R3 detaching one viewer does not stop room work — detach is never an interrupt', async () => {
    await withIpc(async (gateway) => {
      gateway.rooms.createFixtureRoom('room-r3');
      gateway.rooms.occupyFixtureRoom('room-r3');

      const holder = await connectV2(gateway.paths.socketPath);
      const reader = await connectV2(gateway.paths.socketPath);
      try {
        await hello(holder);
        await hello(reader);
        const a = await joinRoomByClient(holder, 'room-r3', 'r3a', undefined, 'read+input');
        const b = await joinRoomByClient(reader, 'room-r3', 'r3b');

        holder.send({ op: 'LeaveRoom', room_id: 'room-r3', idempotency_key: 'r3-leave', viewer_capability: a.capability });
        const leaveAnswer = await nextOp(holder, 'LeaveRoom');
        assert.equal(leaveAnswer.body['ok'], true);
        const disc = await holder.next();
        assert.equal(disc.body['op'], 'Disconnect');
        assert.equal(disc.body['reason'], 'leave');
        await holder.closed();

        // Room work continues: occupancy, executions, and the survivor's feed.
        gateway.rooms.emitFixturePatch('room-r3', 'slot-a', 'after-leave');
        assert.equal(patchText(await nextPatch(reader, 'slot-a')), 'after-leave');

        const snapshot = gateway.rooms.snapshot('room-r3');
        assert.equal(snapshot?.occupancy, 'OCCUPIED', 'a viewer leaving never interrupts occupancy');
        assert.equal(snapshot?.executions.every((e) => e.state === 'RUNNING'), true, 'executions keep running');
        assert.equal(snapshot?.input_authority.kind, 'UNOWNED', 'the departing holder releases the input lease');
        assert.equal(snapshot?.viewers.find((v) => v.viewer_id === a.viewerId)?.attachment, 'DETACHED');
        assert.equal(snapshot?.viewers.find((v) => v.viewer_id === b.viewerId)?.attachment, 'ATTACHED');
      } finally {
        reader.socket.destroy();
      }
    });
  });

  it('R4 replacement ownership: while both sockets are alive the superseded socket never drains the new binding; the old socket dying changes nothing', async () => {
    await withIpc(async (gateway) => {
      gateway.rooms.createFixtureRoom('room-r4');
      gateway.rooms.occupyFixtureRoom('room-r4');

      const original = await connectV2(gateway.paths.socketPath);
      await hello(original);
      const a = await joinRoomByClient(original, 'room-r4', 'r4a');

      // Replacement joins with the SAME capability while the old socket lives.
      const replacement = await connectV2(gateway.paths.socketPath);
      try {
        await hello(replacement);
        const b = await joinRoomByClient(replacement, 'room-r4', 'r4b', a.capability);
        assert.equal(b.viewerId, a.viewerId, 'surviving join keeps the identity');

        await original.collectFor(150); // settle: discard frames queued before the replacement claimed the binding
        gateway.rooms.emitFixturePatch('room-r4', 'slot-a', 'owner-only-tick');
        assert.equal(patchText(await nextPatch(replacement, 'slot-a')), 'owner-only-tick', 'the owner binding receives live frames');
        const stolen = await original.collectFor(300);
        assert.equal(stolen, 0, 'a superseded socket never drains frames that belong to the owner binding');

        // Old socket dies WITHOUT leave: the new binding is untouched (XG1 spirit).
        original.socket.destroy();
        await sleep(100);
        gateway.rooms.emitFixturePatch('room-r4', 'slot-a', 'still-owner-tick');
        assert.equal(patchText(await nextPatch(replacement, 'slot-a')), 'still-owner-tick');
        const snapshot = gateway.rooms.snapshot('room-r4');
        assert.equal(snapshot?.viewers.find((v) => v.viewer_id === a.viewerId)?.attachment, 'ATTACHED', 'old socket death never detaches the replacement');
      } finally {
        replacement.socket.destroy();
      }
    });
  });

  it('R5 backpressure stays truthful: the missed range becomes an explicit Gap and the ring evidence stays intact for catch-up', async () => {
    // Runtime-level (no adapter pump): the queue bound is the runtime's own
    // (r4 §7.9 Table 11 row 5), so overflow is deterministic here.
    const rooms = new RoomRuntime({ newId: () => `id-${String(++ids)}` });
    rooms.createFixtureRoom('room-r5');
    rooms.occupyFixtureRoom('room-r5');
    const slow = rooms.joinRoom('room-r5', 'r5a', undefined, 'read');
    assert.ok(slow.ok);
    const slowId = String(slow.body['viewer_id']);

    // 100 patches + one checkpoint + 156 patches = 257 pushes to the slow
    // viewer: overflow fires exactly at push 257 (queue bound 256).
    for (let i = 0; i < 100; i++) rooms.emitFixturePatch('room-r5', 'slot-a', `flood-${String(i)}`);
    rooms.produceFixtureCheckpoint('room-r5', 'slot-a');
    for (let i = 100; i < 256; i++) rooms.emitFixturePatch('room-r5', 'slot-a', `flood-${String(i)}`);
    rooms.emitFixturePatch('room-r5', 'slot-a', 'after-overflow');

    const snapshot = rooms.snapshot('room-r5');
    assert.equal(snapshot?.viewers.find((v) => v.viewer_id === slowId)?.attachment, 'DISCONNECTED_BACKPRESSURE');
    assert.equal(rooms.pendingDisconnect('room-r5', slowId), 'viewer_backpressure');

    // The Gap names the missed range truthfully — evidence declared, not dropped.
    const outbox = rooms.peekOutbox('room-r5', slowId);
    const gaps = outbox
      .filter((f) => f.type === FRAME_TYPE_CONTROL)
      .map((f) => JSON.parse(f.payload.toString('utf8')) as Record<string, unknown>)
      .filter((b) => b['op'] === 'Gap') as unknown as GapFrame[];
    assert.ok(gaps.length >= 1, 'an explicit Gap names what was missed');
    const last = gaps[gaps.length - 1]!;
    assert.equal(last.execution_id, 'slot-a');
    assert.equal(last.fillable, false, 'the overflow gap is never claimed fillable');
    assert.ok(last.from_seq >= 250 && last.to_seq <= 257, 'the gap names real sequence bounds');

    // Nothing was silently dropped: a fresh viewer catches up through the
    // checkpoint + retained ring to the last emitted seq.
    const fresh = rooms.joinRoom('room-r5', 'r5b', undefined, 'read');
    assert.ok(fresh.ok);
    const freshId = String(fresh.body['viewer_id']);
    let maxSeq = 0;
    for (const frame of rooms.takeOutbox('room-r5', freshId)) {
      if (frame.type !== FRAME_TYPE_VT_PATCH) continue;
      const patch = JSON.parse(frame.payload.toString('utf8')) as VtPatchPayload;
      maxSeq = Math.max(maxSeq, patch.pty_output_seq);
    }
    assert.equal(maxSeq, 257, 'the full retained range replays — no silent evidence loss');
  });
});

function parseGap(frame: { type: number; body: Record<string, unknown> }): GapFrame {
  assert.equal(frame.type, FRAME_TYPE_CONTROL, 'Gap arrives on the control channel');
  return frame.body as unknown as GapFrame;
}
