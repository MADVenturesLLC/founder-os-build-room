/**
 * Room Runtime Phase 1 — the canonical IPC v2 vocabulary is pure and closed.
 *
 * `packages/gateway-protocol` is the ONE canonical protocol owner (r3 §10).
 * These proofs pin the vocabulary the TUI consumer mirrors: closed sets,
 * frozen framing, version negotiation shape, forbidden projector ops, and
 * the Table 9 / §7.15 closed names — so drift on either side fails a test
 * rather than being silently re-interpreted.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK_REASONS,
  DISCONNECT_REASONS,
  EXECUTION_STATES,
  EXECUTION_STREAM_LIMIT,
  FRAME_TYPE_CONTROL,
  FRAME_TYPE_VT_PATCH,
  MAX_V2_FRAME_BYTES,
  OCCUPANCY_STATES,
  PROJECTOR_FORBIDDEN_OPS,
  PROJECTOR_REQUEST_OPS,
  RECOVERY_KINDS,
  SUPPORTED_IPC_VERSIONS,
  V2_CONTROL_NAMES,
  VIEWER_ATTACHMENT_STATES,
  decodeV2Frames,
  encodeV2Frame,
  isV2ControlName,
  looksLikeV2Hello,
  parseControlPayload,
} from '../packages/gateway-protocol/src/index.js';

describe('framing — [u32be length][u8 type][payload] (r4 §7.7)', () => {
  it('round-trips control and patch frames, including a split read', () => {
    const a = encodeV2Frame(FRAME_TYPE_CONTROL, Buffer.from('{"op":"Hello"}'));
    const b = encodeV2Frame(FRAME_TYPE_VT_PATCH, Buffer.from('{"execution_id":"slot-a"}'));
    const all = Buffer.concat([a, b]);
    const first = decodeV2Frames(all.subarray(0, a.byteLength + 3));
    assert.equal(first.frames.length, 1);
    assert.equal(first.rest.byteLength, 3);
    const second = decodeV2Frames(Buffer.concat([first.rest, all.subarray(a.byteLength + 3)]));
    assert.equal(second.frames.length, 1);
    assert.equal(second.frames[0]!.type, FRAME_TYPE_VT_PATCH);
    assert.equal(second.rest.byteLength, 0);
  });

  it('a length above the bound is reported oversized, never decoded', () => {
    const header = Buffer.alloc(5);
    header.writeUInt32BE(MAX_V2_FRAME_BYTES + 1, 0);
    header.writeUInt8(FRAME_TYPE_CONTROL, 4);
    const step = decodeV2Frames(header);
    assert.equal(step.oversized, true);
    assert.equal(step.frames.length, 0);
  });

  it('looksLikeV2Hello recognizes only a structurally valid first-frame Hello', () => {
    assert.equal(looksLikeV2Hello(encodeV2Frame(FRAME_TYPE_CONTROL, Buffer.from('{"op":"Hello","ipc_version":2}'))), true);
    assert.equal(looksLikeV2Hello(Buffer.from('{"op":"status"}\n')), false, 'v1 newline JSON is not a v2 Hello');
    assert.equal(looksLikeV2Hello(encodeV2Frame(FRAME_TYPE_CONTROL, Buffer.from('{"op":"JoinRoom"}'))), false, 'a non-Hello first frame is not a Hello');
    assert.equal(looksLikeV2Hello(encodeV2Frame(FRAME_TYPE_VT_PATCH, Buffer.from('{"op":"Hello","ipc_version":2}'))), false, 'wrong frame type');
  });
});

describe('closed vocabularies (r4 Table 9, §7.15)', () => {
  it('state axes carry exactly the r4 closed values', () => {
    assert.deepEqual([...OCCUPANCY_STATES], ['ABSENT', 'PREPARED', 'OCCUPIED', 'INTERRUPTED', 'CLOSED']);
    assert.deepEqual([...VIEWER_ATTACHMENT_STATES], ['NONE', 'HELLO', 'JOINING', 'REPLAYING', 'ATTACHED', 'DETACHED', 'STALE', 'DISCONNECTED_BACKPRESSURE']);
    assert.deepEqual([...EXECUTION_STATES], ['EMPTY', 'LAUNCHING', 'RUNNING', 'EXITED', 'FAILED_CLOSED']);
    assert.equal((EXECUTION_STATES as readonly string[]).includes('ATTESTED'), false, 'no ATTESTED lifecycle state');
    assert.deepEqual([...RECOVERY_KINDS], ['LIVE_REATTACH', 'HISTORY_REPLAY', 'NATIVE_RESUME', 'RECONSTRUCTION']);
    assert.deepEqual([...BLOCK_REASONS], ['NONE', 'WAITING_FOUNDER', 'CLOCK_UNRELIABLE', 'DISK', 'DUPLICATE', 'PGID_REUSE', 'CUSTODY', 'CRASH_LOOP', 'ADAPTER_HUNG']);
  });

  it('v2 control names are the r4 §7.15 closed set plus the documented 2026-09-20 CreateRoom amendment; EvidencePromote and PrDelta are absent', () => {
    assert.deepEqual([...V2_CONTROL_NAMES], [
      'Hello', 'CreateRoom', 'JoinRoom', 'LeaveRoom', 'FollowRoom', 'RoomSnapshot', 'RoomDelta', 'InputFrame', 'ResizeFrame',
      'OccupancyState', 'WorktreeLease', 'ReceiptRef', 'Nack', 'Disconnect', 'Gap', 'TakeoverInput', 'FixtureVerificationResult',
    ]);
    assert.equal((V2_CONTROL_NAMES as readonly string[]).includes('EvidencePromote'), false);
    assert.equal((V2_CONTROL_NAMES as readonly string[]).includes('PrDelta'), false);
  });

  it('disconnect reasons are the closed set; leave and occupancy_closed are distinct', () => {
    assert.deepEqual([...DISCONNECT_REASONS], ['leave', 'viewer_quit', 'viewer_backpressure', 'frame_too_large', 'ipc_version_unsupported', 'stale_viewer', 'occupancy_closed', 'internal_error']);
  });

  it('exactly two execution streams; supported versions are [1,2]', () => {
    assert.equal(EXECUTION_STREAM_LIMIT, 2);
    assert.deepEqual([...SUPPORTED_IPC_VERSIONS], [1, 2]);
  });
});

describe('parseControlPayload — shape only, authority elsewhere', () => {
  it('accepts projector-request ops, recognizes forbidden authority ops, rejects unknown ops and non-objects', () => {
    const ok = parseControlPayload(Buffer.from('{"op":"JoinRoom","room_id":"r"}'));
    assert.equal(ok.ok, true);
    const forbidden = parseControlPayload(Buffer.from('{"op":"EvidencePromote"}'));
    assert.equal(forbidden.ok, true, 'recognized so the refusal can be claim_rejected, not unknown');
    const unknown = parseControlPayload(Buffer.from('{"op":"RoomSnapshot"}'));
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.reason, 'unknown_op', 'a Gateway→projector name is not a projector request');
    const invalid = parseControlPayload(Buffer.from('[1,2]'));
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.reason, 'invalid_request');
    const garbage = parseControlPayload(Buffer.from('{not json'));
    assert.equal(garbage.ok, false);
    if (!garbage.ok) assert.equal(garbage.reason, 'invalid_request');
  });

  it('every forbidden op is outside the closed control vocabulary (never a projector API)', () => {
    for (const op of PROJECTOR_FORBIDDEN_OPS) {
      assert.equal((V2_CONTROL_NAMES as readonly string[]).includes(op), false, op);
    }
  });

  it('CreateRoom (2026-09-20 Founder amendment) is a recognized projector-request op, never a forbidden one', () => {
    const ok = parseControlPayload(Buffer.from('{"op":"CreateRoom","idempotency_key":"k1"}'));
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.value['op'], 'CreateRoom');
    assert.equal(isV2ControlName('CreateRoom'), true);
    assert.equal((PROJECTOR_REQUEST_OPS as readonly string[]).includes('CreateRoom'), true);
    assert.equal((PROJECTOR_FORBIDDEN_OPS as readonly string[]).includes('CreateRoom'), false);
    assert.equal((PROJECTOR_FORBIDDEN_OPS as readonly string[]).includes('MintViewerId'), true, 'authority minting stays the forbidden class');
  });
});
