/**
 * Room Runtime Phase 1 — RoomRuntime proofs (pure, no sockets).
 *
 * Capabilities and the r4 ATs each proof binds (semantic source: r4 stack
 * bound by Commission Final r3 §13; SHA-256s recorded in the execution
 * ledger and handoff):
 *
 *   B  exactly two execution stream identities   AT-R4-07 (+ third-stream stop)
 *   C  checkpoint / delta / Gap                   AT-R4-04, AT-R4-05, r4.1 §4
 *   D  per-viewer input authority                 AT-R4-16 (claim rejected),
 *                                                 AT-R4-30 (stale viewer), AT-R4-35
 *   E  slow-viewer disconnect                     AT-R4-06
 *   F  canonical state axes                       r4 Table 9 / Table 12
 *   G  fixture occupancy only                     fixture rung ceiling
 *   L  evidence receipts                          AT-R4-18 honesty
 *
 * FIXTURE OCCUPANCY ONLY. Nothing here is live occupancy, Phase 0 evidence,
 * or activation evidence.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ExecutionCardinalityError,
  FRAME_TYPE_CONTROL,
  FRAME_TYPE_VT_PATCH,
  RoomRuntime,
  RoomRuntimeError,
  VIEWER_QUEUE_FRAMES,
  type OutFrame,
} from '../packages/gateway-daemon/src/room-runtime.js';
import { EXECUTION_STREAM_LIMIT, FIXTURE_VT_CODEC_VERSION } from '../packages/gateway-protocol/src/ipc-v2.js';

let counter = 0;
function newRuntime(): RoomRuntime {
  counter = 0;
  return new RoomRuntime({ newId: () => `id-${String(++counter).padStart(4, '0')}` });
}

function control(frames: readonly OutFrame[]): Record<string, unknown>[] {
  return frames
    .filter((f) => f.type === FRAME_TYPE_CONTROL)
    .map((f) => JSON.parse(f.payload.toString('utf8')) as Record<string, unknown>);
}

function patches(frames: readonly OutFrame[]): Record<string, unknown>[] {
  return frames
    .filter((f) => f.type === FRAME_TYPE_VT_PATCH)
    .map((f) => JSON.parse(f.payload.toString('utf8')) as Record<string, unknown>);
}

function join(rt: RoomRuntime, room: string, key: string, caps: 'read' | 'read+input' = 'read', capability?: string) {
  const result = rt.joinRoom(room, key, capability, caps);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  return result.body as { viewer_id: string; viewer_capability: string; recovery_kind: string; input: string; snapshot: Record<string, unknown> };
}

describe('B — exactly two execution stream identities (AT-R4-07 + cardinality stop)', () => {
  it('a fixture room holds exactly two execution identities with independent cursors', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    const snap = rt.snapshot('r1')!;
    assert.equal(snap.executions.length, EXECUTION_STREAM_LIMIT);
    assert.deepEqual(snap.executions.map((e) => e.execution_id), ['slot-a', 'slot-b']);

    // Independent per-execution seqs (Table 10): emit 3 on a, 1 on b.
    rt.emitFixturePatch('r1', 'slot-a', 'a1');
    rt.emitFixturePatch('r1', 'slot-a', 'a2');
    rt.emitFixturePatch('r1', 'slot-b', 'b1');
    rt.emitFixturePatch('r1', 'slot-a', 'a3');
    const after = rt.snapshot('r1')!;
    const a = after.executions.find((e) => e.execution_id === 'slot-a')!;
    const b = after.executions.find((e) => e.execution_id === 'slot-b')!;
    assert.equal(a.cursors.ptyOutputSeq, 3);
    assert.equal(b.cursors.ptyOutputSeq, 1);
    assert.equal(a.cursors.durableCommittedSeq, 3);
  });

  it('a third execution stream identity is a stop-class error, never a silent third stream', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    assert.throws(() => rt.registerFixtureExecution('r1', 'slot-c'), (err: unknown) => {
      assert.ok(err instanceof ExecutionCardinalityError);
      assert.equal(err.code, 'stream_limit_exceeded');
      return true;
    });
    assert.equal(rt.snapshot('r1')!.executions.length, 2);
  });

  it('viewers are not execution identities: many viewers never raise the stream count', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    for (let i = 0; i < 5; i++) join(rt, 'r1', `k${String(i)}`);
    const snap = rt.snapshot('r1')!;
    assert.equal(snap.viewers.length, 5);
    assert.equal(snap.executions.length, 2);
  });
});

describe('C — checkpoint / delta / Gap (AT-R4-04, AT-R4-05, r4.1 §4 watermark)', () => {
  it('fresh join: per-execution checkpoint plus live suffix; no duplicate pty_output_seq', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    rt.emitFixturePatch('r1', 'slot-a', 'a1');
    rt.emitFixturePatch('r1', 'slot-a', 'a2');
    rt.produceFixtureCheckpoint('r1', 'slot-a');
    rt.emitFixturePatch('r1', 'slot-a', 'a3');
    rt.emitFixturePatch('r1', 'slot-b', 'b1');

    const j = join(rt, 'r1', 'k1');
    const frames = rt.takeOutbox('r1', j.viewer_id);
    const vt = patches(frames);
    const slotA = vt.filter((p) => p['execution_id'] === 'slot-a');
    // checkpoint@2 then patch@3 — never the pre-checkpoint raw suffix again.
    assert.equal((slotA[0]!['checkpoint_or_patch'] as { kind: string }).kind, 'checkpoint');
    assert.equal(slotA[0]!['pty_output_seq'], 2);
    assert.deepEqual(slotA.slice(1).map((p) => p['pty_output_seq']), [3]);
    const seqsA = slotA.map((p) => p['pty_output_seq']);
    assert.equal(new Set(seqsA).size, seqsA.length, 'no duplicate pty_output_seq');
    // slot-b has no checkpoint: suffix only, qualified by its own execution_id.
    const slotB = vt.filter((p) => p['execution_id'] === 'slot-b');
    assert.deepEqual(slotB.map((p) => p['pty_output_seq']), [1]);
    for (const p of vt) {
      assert.equal(p['vt_codec_version'], FIXTURE_VT_CODEC_VERSION, 'fixture codec is labeled as fixture');
      assert.equal(typeof p['execution_id'], 'string', 'execution_id on every patch');
    }
  });

  it('surviving join with a missed range: explicit Gap{execution_id,from,to}; fillable when the ring holds it', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    const j = join(rt, 'r1', 'k1');
    rt.emitFixturePatch('r1', 'slot-a', 'a1');
    rt.takeOutbox('r1', j.viewer_id); // delivered through seq 1
    // The viewer leaves (DETACHED, unsubscribed) while the room emits 2..4 —
    // a real missed range at the owner, not a drained-but-unrendered one.
    assert.equal(rt.leaveRoom('r1', 'k-leave', j.viewer_capability).ok, true);
    rt.emitFixturePatch('r1', 'slot-a', 'a2');
    rt.emitFixturePatch('r1', 'slot-a', 'a3');
    rt.emitFixturePatch('r1', 'slot-a', 'a4');

    // Surviving rejoin with the SAME capability → same viewer_id (r4.1 §5).
    const again = join(rt, 'r1', 'k2', 'read', j.viewer_capability);
    assert.equal(again.viewer_id, j.viewer_id);
    const frames = rt.takeOutbox('r1', j.viewer_id);
    const gaps = control(frames).filter((c) => c['op'] === 'Gap');
    assert.equal(gaps.length, 1, 'exactly one Gap for the one execution with a missed range');
    assert.deepEqual(
      { execution_id: gaps[0]!['execution_id'], from_seq: gaps[0]!['from_seq'], to_seq: gaps[0]!['to_seq'], fillable: gaps[0]!['fillable'] },
      { execution_id: 'slot-a', from_seq: 2, to_seq: 4, fillable: true },
    );
    // The ring held the range: the fill arrives as patches 2..4, never a blit checkpoint.
    const filled = patches(frames).filter((p) => p['execution_id'] === 'slot-a').map((p) => p['pty_output_seq']);
    assert.deepEqual(filled, [2, 3, 4]);
    assert.ok(patches(frames).every((p) => (p['checkpoint_or_patch'] as { kind: string }).kind === 'patch'), 'no blit-replace of surviving history');
  });

  it('Gap is a per-viewer fact and history_truncated is an owner-ring fact — never one flag for both', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    // Overflow the per-viewer queue so the runtime emits a Gap for this viewer.
    const slow = join(rt, 'r1', 'slow');
    for (let i = 0; i < VIEWER_QUEUE_FRAMES + 5; i++) rt.emitFixturePatch('r1', 'slot-a', `x${String(i)}`);
    const frames = rt.takeOutbox('r1', slow.viewer_id);
    const gap = control(frames).find((c) => c['op'] === 'Gap');
    assert.ok(gap, 'a Gap is emitted for the overflowing viewer');
    assert.equal(gap['execution_id'], 'slot-a');
    assert.equal(typeof gap['from_seq'], 'number');
    assert.equal(typeof gap['to_seq'], 'number');
    // The owner ring (1024) did not wrap: owner-side truncation is false while the viewer Gap is real.
    assert.equal(gap['history_truncated'], false);
    assert.equal(rt.snapshot('r1')!.executions.find((e) => e.execution_id === 'slot-a')!.history_truncated, false);
  });

  it('checkpoint is never ahead of the durable watermark (r4.1 §4): fixture checkpoint seq equals a committed seq', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    rt.emitFixturePatch('r1', 'slot-b', 'b1');
    rt.produceFixtureCheckpoint('r1', 'slot-b');
    const b = rt.snapshot('r1')!.executions.find((e) => e.execution_id === 'slot-b')!;
    assert.equal(b.cursors.ptyCheckpointSeq, b.cursors.durableCommittedSeq);
    assert.ok(b.cursors.ptyCheckpointSeq <= b.cursors.durableCommittedSeq);
  });
});

describe('D — per-viewer input authority (ExclusiveInput; AT-R4-16/30/35)', () => {
  it('one writable lease; a second read+input joiner gets input_held, never last-writer-wins', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    const holder = join(rt, 'r1', 'k1', 'read+input');
    assert.equal(holder.input, 'granted');
    const second = join(rt, 'r1', 'k2', 'read+input');
    assert.equal(second.input, 'input_held');
    const snap = rt.snapshot('r1')!;
    assert.equal(snap.input_authority.kind, 'HELD');
    if (snap.input_authority.kind === 'HELD') assert.equal(snap.input_authority.viewerId, holder.viewer_id);
  });

  it('read observer InputFrame/ResizeFrame → claim_rejected (AT-R4-16)', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    join(rt, 'r1', 'k1', 'read+input');
    const observer = join(rt, 'r1', 'k2', 'read');
    const input = rt.inputFrame('r1', observer.viewer_capability, 1, Buffer.from('x').toString('base64'));
    assert.equal(input.ok, false);
    if (!input.ok) assert.equal(input.reason, 'claim_rejected');
    const resize = rt.resizeFrame('r1', observer.viewer_capability, 1, 80, 24);
    assert.equal(resize.ok, false);
    if (!resize.ok) assert.equal(resize.reason, 'claim_rejected');
  });

  it('TakeoverInput bumps input_epoch, previous holder becomes STALE, stale InputFrame → stale_viewer (AT-R4-30)', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    const first = join(rt, 'r1', 'k1', 'read+input');
    const second = join(rt, 'r1', 'k2', 'read');
    const takeover = rt.takeoverInput('r1', second.viewer_capability);
    assert.equal(takeover.ok, true);
    if (takeover.ok) assert.equal(takeover.body['input_epoch'], 2);
    const snap = rt.snapshot('r1')!;
    assert.equal(snap.viewers.find((v) => v.viewer_id === first.viewer_id)!.attachment, 'STALE');
    const stale = rt.inputFrame('r1', first.viewer_capability, 1, Buffer.from('x').toString('base64'));
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.reason, 'stale_viewer');
    // A takeover writes an InputLeaseTransfer receipt.
    assert.ok(rt.receiptsFor('r1').some((r) => r.kind === 'input-lease-transfer'));
  });

  it('a forged/guessed capability gets a FRESH mint; the victim keeps identity and lease (AT-R4-35)', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    const p1 = join(rt, 'r1', 'k1', 'read+input');
    const p2 = join(rt, 'r1', 'k2', 'read+input', 'vcap-forged-guess');
    assert.notEqual(p2.viewer_id, p1.viewer_id);
    assert.equal(p2.input, 'input_held');
    const snap = rt.snapshot('r1')!;
    if (snap.input_authority.kind === 'HELD') assert.equal(snap.input_authority.viewerId, p1.viewer_id);
  });

  it('holder InputFrame with the current epoch is accepted and echoes into the running fixture stream', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    const holder = join(rt, 'r1', 'k1', 'read+input');
    const ok = rt.inputFrame('r1', holder.viewer_capability, 1, Buffer.from('hi').toString('base64'));
    assert.equal(ok.ok, true);
    const a = rt.snapshot('r1')!.executions.find((e) => e.execution_id === 'slot-a')!;
    assert.equal(a.cursors.ptyOutputSeq, 1);
  });
});

describe('E — slow-viewer disconnect without stalling the source (AT-R4-06)', () => {
  it('overflow → Gap then DISCONNECTED_BACKPRESSURE for THAT viewer; siblings and the stream continue', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    const slow = join(rt, 'r1', 'slow');
    const healthy = join(rt, 'r1', 'healthy');
    const total = VIEWER_QUEUE_FRAMES + 10;
    for (let i = 0; i < total; i++) {
      rt.emitFixturePatch('r1', 'slot-a', `p${String(i)}`);
      if (i % 50 === 0) rt.takeOutbox('r1', healthy.viewer_id); // the healthy viewer keeps draining
    }
    const snap = rt.snapshot('r1')!;
    assert.equal(snap.viewers.find((v) => v.viewer_id === slow.viewer_id)!.attachment, 'DISCONNECTED_BACKPRESSURE');
    assert.equal(snap.viewers.find((v) => v.viewer_id === healthy.viewer_id)!.attachment, 'ATTACHED');
    assert.equal(snap.occupancy, 'OCCUPIED', 'occupancy continues');
    assert.equal(snap.executions.find((e) => e.execution_id === 'slot-a')!.cursors.ptyOutputSeq, total, 'source never stalled');
    assert.equal(rt.pendingDisconnect('r1', slow.viewer_id), 'viewer_backpressure');
  });
});

describe('F — canonical state axes and RecoveryKind (Table 9 / Table 12)', () => {
  it('viewer leave detaches the viewer only; occupancy stays OCCUPIED (AT-R4-01 / §7.15 distinctions)', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    const v = join(rt, 'r1', 'k1', 'read+input');
    const left = rt.leaveRoom('r1', 'k-leave', v.viewer_capability);
    assert.equal(left.ok, true);
    const snap = rt.snapshot('r1')!;
    assert.equal(snap.occupancy, 'OCCUPIED');
    assert.equal(snap.viewers[0]!.attachment, 'DETACHED');
    assert.equal(snap.input_authority.kind, 'UNOWNED', 'lease released with the holder');
    assert.equal(rt.pendingDisconnect('r1', v.viewer_id), 'leave', 'leave ≠ occupancy_closed');
    // Receipts still append after a viewer leaves.
    rt.emitFixturePatch('r1', 'slot-a', 'still-running');
    assert.equal(snap.executions.every((e) => e.state === 'RUNNING'), true);
  });

  it('joining an occupied room is LIVE_REATTACH; an interrupted/closed room is RECONSTRUCTION, never LIVE for a dead PTY', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    assert.equal(join(rt, 'r1', 'k1').recovery_kind, 'LIVE_REATTACH');
    rt.interruptFixtureRoom('r1', 'WAITING_FOUNDER');
    const snap = rt.snapshot('r1')!;
    assert.equal(snap.occupancy, 'INTERRUPTED');
    assert.equal(snap.block_reason, 'WAITING_FOUNDER');
    assert.equal(snap.executions.every((e) => e.state === 'FAILED_CLOSED'), true);
    assert.equal(join(rt, 'r1', 'k2').recovery_kind, 'RECONSTRUCTION');
    rt.closeFixtureRoom('r1');
    assert.equal(rt.snapshot('r1')!.occupancy, 'CLOSED');
    assert.equal(join(rt, 'r1', 'k3').recovery_kind, 'RECONSTRUCTION');
  });

  it('a dead fixture stream emits nothing (a dead PTY cannot look live)', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    rt.interruptFixtureRoom('r1');
    assert.throws(() => rt.emitFixturePatch('r1', 'slot-a', 'ghost'), (err: unknown) => {
      assert.ok(err instanceof RoomRuntimeError);
      assert.equal(err.code, 'execution_not_running');
      return true;
    });
  });

  it('idempotency: same key+payload → same result; same key+different payload → idempotency_conflict', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    const first = join(rt, 'r1', 'same');
    const again = rt.joinRoom('r1', 'same', undefined, 'read');
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.body['viewer_id'], first.viewer_id);
    const conflict = rt.joinRoom('r1', 'same', undefined, 'read+input');
    assert.equal(conflict.ok, false);
    if (!conflict.ok) assert.equal(conflict.reason, 'idempotency_conflict');
  });
});

describe('G/L — fixture occupancy only; receipts stay at or below the fixture ceiling (AT-R4-18)', () => {
  it('every fixture receipt is at or below executed; occupancy receipt says fixture:true', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    join(rt, 'r1', 'k1', 'read+input');
    rt.interruptFixtureRoom('r1');
    rt.closeFixtureRoom('r1');
    const order = ['prepared', 'dispatched', 'executed', 'attested', 'verified', 'reviewed', 'ci', 'merged'];
    for (const receipt of rt.receiptsFor('r1')) {
      assert.ok(order.indexOf(receipt.rung) <= order.indexOf('executed'), `${receipt.kind} rung ${receipt.rung} is above the fixture ceiling`);
      assert.equal(receipt.facts['fixture'], true);
    }
  });

  it('ReceiptRef frames reach subscribed viewers with rung + facts (the TUI binds the boundary)', () => {
    const rt = newRuntime();
    rt.createFixtureRoom('r1');
    rt.occupyFixtureRoom('r1');
    const v = join(rt, 'r1', 'k1', 'read+input');
    rt.takeOutbox('r1', v.viewer_id);
    const other = join(rt, 'r1', 'k2', 'read');
    const takeover = rt.takeoverInput('r1', other.viewer_capability);
    assert.equal(takeover.ok, true);
    const refs = control(rt.takeOutbox('r1', v.viewer_id)).filter((c) => c['op'] === 'ReceiptRef');
    assert.ok(refs.some((r) => r['kind'] === 'input-lease-transfer' && r['rung'] === 'prepared'));
  });
});
