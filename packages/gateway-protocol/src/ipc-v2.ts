/**
 * Room Runtime Phase 1 — canonical IPC v2 vocabulary and pure wire helpers.
 *
 * CANONICAL PROTOCOL OWNER (Commission Final r3 §10): this package is the
 * exclusive home of Gateway Phase 1 IPC truth. The TUI maintains a limited
 * consumer-side representation at its own boundary (`packages/protocol` in
 * madventures-tui) purely to satisfy process separation; it must not
 * duplicate authoritative behavior. ONE CANONICAL PROTOCOL OWNER.
 *
 * Semantic sources (bound by r3 §13, implemented from the artifacts, never
 * from memory):
 *
 *  - r4 §7.6 Table 9      — canonical state axes + derived operator labels
 *                           (r4 SHA-256 e6e601ca015f55c694292746681c7d40b975086cae7d1700155ffca1ade30465)
 *  - r4 §7.7 Table 10     — per-execution cursor/epoch namespace; framing
 *                           `[u32be length][u8 type][payload]`; version
 *                           negotiation; idempotency keys; 256 KiB proposed
 *                           max v2 frame (PHASE MEASUREMENT REQUIRED value
 *                           carried as proposed)
 *  - r4 §7.8              — SurvivingHistoryGap: `Gap` (per-viewer) is never
 *                           `history_truncated` (owner-ring); never
 *                           blit-replace surviving local history
 *  - r4 §7.15             — frozen CLI verbs; closed v2 JSON control names;
 *                           closed disconnect-reason set; internal-never-on-
 *                           the-wire set; EvidencePromote not a projector API
 *  - r4.1 §3              — projector wire is VT patches, raw PTY is private;
 *                           frame type 0x02 payload shape; 0x03 reserved;
 *                           unknown type → Nack{unknown_frame_type} + destroy
 *                           that viewer socket
 *  - r4.1 §4              — committed watermark: a checkpoint is admissible
 *                           only at or below `durable_committed_seq`
 *  - r4.1 §5              — Gateway MINTS `viewer_id` + `viewer_capability`;
 *                           a projector-chosen id is a lease/replay spoof
 *  - r4.1 §7              — Table 10 delta: `durable_committed_seq` per
 *                           execution; `viewer_id` Gateway-minted
 *
 * Purity: zero I/O, zero dependencies, no clock, no randomness — the same
 * guarantee `test/purity.test.ts` enforces for this package. Validators here
 * are pure shape checks over untrusted wire input; authority decisions
 * (minting, leasing, fencing) live in the daemon, never in this vocabulary.
 *
 * IPC v1 (newline-delimited JSON, ops `status|tail`, 64 KiB request cap,
 * classified ring) is PRESERVED UNCHANGED (r4 §7.7; stop condition 13).
 * Nothing in this module alters v1 behavior; v2 lives on the same Unix path
 * after a first-frame Hello.
 */

// ---------------------------------------------------------------------------
// Version negotiation (r4 §7.7)
// ---------------------------------------------------------------------------

/** The IPC version this vocabulary defines. */
export const IPC_V2_VERSION = 2;

/** Closed supported set answered in `ipc_version_unsupported` (r4 §7.7). */
export const SUPPORTED_IPC_VERSIONS: readonly number[] = [1, 2];

/**
 * Maximum v2 frame payload — r4 §7.7 "proposed 256 KiB (PHASE MEASUREMENT
 * REQUIRED)". Oversized frames destroy the VIEWER socket with
 * `Disconnect{reason:frame_too_large}`; occupancy continues.
 */
export const MAX_V2_FRAME_BYTES = 256 * 1024;

// ---------------------------------------------------------------------------
// Length-prefixed mux (r4 §7.7; r4.1 §3)
// ---------------------------------------------------------------------------

/** UTF-8 JSON control: JoinRoom, LeaveRoom, FollowRoom, nacks, occupancy facts. */
export const FRAME_TYPE_CONTROL = 0x01;
/** VT patch: {execution_id, pty_output_seq, resize_epoch, vt_codec_version, checkpoint_or_patch}. */
export const FRAME_TYPE_VT_PATCH = 0x02;
/** Reserved by r4.1 §3; never raw PTY to projectors. */
export const FRAME_TYPE_RESERVED_03 = 0x03;

export interface V2Frame {
  readonly type: number;
  readonly payload: Buffer;
}

/** Encode one mux frame: `[u32be length][u8 type][payload]` (r4 §7.7). */
export function encodeV2Frame(type: number, payload: Buffer): Buffer {
  const out = Buffer.alloc(5 + payload.byteLength);
  out.writeUInt32BE(payload.byteLength, 0);
  out.writeUInt8(type, 4);
  payload.copy(out, 5);
  return out;
}

export interface V2DecodeStep {
  readonly frames: readonly V2Frame[];
  readonly rest: Buffer;
  /** True when a frame violates the length bound (r4 §7.7 oversized rule). */
  readonly oversized: boolean;
}

/**
 * Pure streaming decoder. `oversized` is reported so the connection owner can
 * apply the r4 rule: destroy that viewer socket, `Disconnect{frame_too_large}`.
 */
export function decodeV2Frames(buffer: Buffer): V2DecodeStep {
  const frames: V2Frame[] = [];
  let rest = buffer;
  for (;;) {
    if (rest.byteLength < 5) return { frames, rest, oversized: false };
    const length = rest.readUInt32BE(0);
    if (length > MAX_V2_FRAME_BYTES) {
      return { frames, rest, oversized: true };
    }
    if (rest.byteLength < 5 + length) return { frames, rest, oversized: false };
    frames.push({ type: rest.readUInt8(4), payload: Buffer.from(rest.subarray(5, 5 + length)) });
    rest = Buffer.from(rest.subarray(5 + length));
  }
}

// ---------------------------------------------------------------------------
// Closed v2 JSON control names (r4 §7.15)
// ---------------------------------------------------------------------------

/**
 * The closed v2 control vocabulary. r4 §7.15: "Closed v2 JSON control names
 * (r3 preserved): Hello, JoinRoom, LeaveRoom, FollowRoom, RoomSnapshot,
 * RoomDelta, InputFrame, ResizeFrame, OccupancyState, WorktreeLease,
 * ReceiptRef, Nack, Disconnect, plus r4: Gap, TakeoverInput,
 * FixtureVerificationResult."
 */
export const V2_CONTROL_NAMES = [
  'Hello',
  'JoinRoom',
  'LeaveRoom',
  'FollowRoom',
  'RoomSnapshot',
  'RoomDelta',
  'InputFrame',
  'ResizeFrame',
  'OccupancyState',
  'WorktreeLease',
  'ReceiptRef',
  'Nack',
  'Disconnect',
  'Gap',
  'TakeoverInput',
  'FixtureVerificationResult',
] as const;

export type V2ControlName = (typeof V2_CONTROL_NAMES)[number];

export function isV2ControlName(value: unknown): value is V2ControlName {
  return typeof value === 'string' && (V2_CONTROL_NAMES as readonly string[]).includes(value);
}

/**
 * Authority-minting attempts a projector can make that are RECOGNIZED and
 * always refused with `Nack{claim_rejected}` (AT-R4-16: lease-issue,
 * EvidencePromote, envelope-widen, receipt-write). These names are never a
 * projector API — r4 §7.15: "Do not ship EvidencePromote as a projector
 * API" — but arriving on the wire they are refused as claim-rejected, not
 * merely unknown, so the attempt is observable.
 */
export const PROJECTOR_FORBIDDEN_OPS = [
  'LeaseIssue',
  'EvidencePromote',
  'EnvelopeWiden',
  'ReceiptWrite',
  'MintViewerId',
  'MintGeneration',
] as const;

export type ProjectorForbiddenOp = (typeof PROJECTOR_FORBIDDEN_OPS)[number];

export function isProjectorForbiddenOp(value: unknown): value is ProjectorForbiddenOp {
  return typeof value === 'string' && (PROJECTOR_FORBIDDEN_OPS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Nack reasons (closed; derived from r4 §7.7/§7.8/§7.15 named refusals)
// ---------------------------------------------------------------------------

export const NACK_REASONS = [
  'invalid_request',
  'unknown_op',
  'unknown_frame_type',
  'ipc_version_unsupported',
  'idempotency_conflict',
  'input_held',
  'stale_viewer',
  'stale_occupancy',
  'checkpoint_unavailable',
  'claim_rejected',
  'room_unknown',
  'internal_error',
] as const;

export type NackReason = (typeof NACK_REASONS)[number];

// ---------------------------------------------------------------------------
// Disconnect reasons (r4 §7.15 closed set; `leave` ≠ `occupancy_closed`)
// ---------------------------------------------------------------------------

export const DISCONNECT_REASONS = [
  'leave',
  'viewer_quit',
  'viewer_backpressure',
  'frame_too_large',
  'ipc_version_unsupported',
  'stale_viewer',
  'occupancy_closed',
  'internal_error',
] as const;

export type DisconnectReason = (typeof DISCONNECT_REASONS)[number];

// ---------------------------------------------------------------------------
// Canonical state axes (r4 §7.6 Table 9 — closed values; SoR: Gateway)
// ---------------------------------------------------------------------------

/** Room exists independently of viewers (r4 Table 9). */
export const OCCUPANCY_STATES = ['ABSENT', 'PREPARED', 'OCCUPIED', 'INTERRUPTED', 'CLOSED'] as const;
export type OccupancyState = (typeof OCCUPANCY_STATES)[number];

/** Many viewers; each has its own axis (r4 Table 9). */
export const VIEWER_ATTACHMENT_STATES = [
  'NONE',
  'HELLO',
  'JOINING',
  'REPLAYING',
  'ATTACHED',
  'DETACHED',
  'STALE',
  'DISCONNECTED_BACKPRESSURE',
] as const;
export type ViewerAttachmentState = (typeof VIEWER_ATTACHMENT_STATES)[number];

/**
 * ExclusiveInput (r4 Table 9 + §7.6): one writable viewer input lease.
 * `HELD` carries (viewer_id, input_epoch); resize authority is the same
 * holder. The wire form is the tagged object below, never a flat string.
 */
export type InputAuthorityState =
  | { readonly kind: 'UNOWNED' }
  | { readonly kind: 'HELD'; readonly viewerId: string; readonly inputEpoch: number }
  | { readonly kind: 'TRANSFERRING' }
  | { readonly kind: 'REVOKED' };

export const INPUT_AUTHORITY_KINDS = ['UNOWNED', 'HELD', 'TRANSFERRING', 'REVOKED'] as const;
export type InputAuthorityKind = (typeof INPUT_AUTHORITY_KINDS)[number];

/** Gateway observes `pty-host`. NO `ATTESTED` lifecycle state (r4 Table 9). */
export const EXECUTION_STATES = ['EMPTY', 'LAUNCHING', 'RUNNING', 'EXITED', 'FAILED_CLOSED'] as const;
export type ExecutionState = (typeof EXECUTION_STATES)[number];

/** Orthogonal to occupancy (r4 Table 9; Table 12 kinds). */
export const RECOVERY_KINDS = ['LIVE_REATTACH', 'HISTORY_REPLAY', 'NATIVE_RESUME', 'RECONSTRUCTION'] as const;
export type RecoveryKind = (typeof RECOVERY_KINDS)[number];

/** Fail-closed reasons (r4 Table 9 closed set). */
export const BLOCK_REASONS = [
  'NONE',
  'WAITING_FOUNDER',
  'CLOCK_UNRELIABLE',
  'DISK',
  'DUPLICATE',
  'PGID_REUSE',
  'CUSTODY',
  'CRASH_LOOP',
  'ADAPTER_HUNG',
] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];

// ---------------------------------------------------------------------------
// Execution cardinality (r4 §7.7: "Exactly two PTY streams exist")
// ---------------------------------------------------------------------------

/**
 * Exactly two execution stream identities are authorized for Phase 1.
 * Viewers are NOT execution identities; presentation surfaces mint none.
 * A third active execution stream identity is a stop condition
 * (`MAX ACTIVE EXECUTION CONTRACT VIOLATION` / r3 stop 12).
 */
export const EXECUTION_STREAM_LIMIT = 2;

// ---------------------------------------------------------------------------
// Cursor / epoch namespace (r4 §7.7 Table 10)
// ---------------------------------------------------------------------------

/**
 * Per-execution PTY cursors. Singular unqualified `output_seq` /
 * `checkpoint_seq` / `resize_epoch` are ambiguous and are NOT used:
 * `execution_id` is on every PTY checkpoint and delta.
 */
export interface ExecutionCursors {
  /** Monotonic per `execution_id`; on every PTY checkpoint, delta, and Gap. */
  readonly ptyOutputSeq: number;
  /** Per `execution_id`; equals a `pty_output_seq` (a checkpoint IS a seq point). */
  readonly ptyCheckpointSeq: number;
  /** Per `execution_id`; controller resizes only; old-epoch grid not live. */
  readonly resizeEpoch: number;
  /**
   * r4.1 §4/§7 — last seq durable in the Gateway ring. A checkpoint is
   * admissible for recovery or fresh-join only at or below this watermark.
   */
  readonly durableCommittedSeq: number;
}

/**
 * Phase 1 fixture VT codec identity. r4.1 §3: `vt_codec_version` mismatch →
 * `checkpoint_unavailable`; never a fake screen. Phase 1 ships a FIXTURE
 * codec only (fixture occupancy; the real owner-side VT lives in `pty-host`
 * in Phase 2) — the version string says so, honestly.
 */
export const FIXTURE_VT_CODEC_VERSION = 'fixture-vt/1';

// ---------------------------------------------------------------------------
// Wire payloads (shapes only; validation is pure, authority is the daemon's)
// ---------------------------------------------------------------------------

export interface HelloPayload {
  readonly op: 'Hello';
  readonly ipc_version: number;
  /** r4.1 §5: presented for a Surviving join; absent → Fresh join. */
  readonly viewer_capability?: string;
  /** Client identity for diagnostics; never authority, never a viewer_id. */
  readonly client_label?: string;
}

export interface JoinRoomPayload {
  readonly op: 'JoinRoom';
  readonly room_id: string;
  /** r4 §7.7: idempotency keys on JoinRoom/LeaveRoom. */
  readonly idempotency_key: string;
  /** r4.1 §5: valid capability → same viewer_id (Surviving); else Fresh. */
  readonly viewer_capability?: string;
  /** Requested caps; `read+input` while a holder exists → input_held. */
  readonly viewer_caps?: 'read' | 'read+input';
}

export interface LeaveRoomPayload {
  readonly op: 'LeaveRoom';
  readonly room_id: string;
  readonly idempotency_key: string;
  readonly viewer_capability: string;
}

export interface FollowRoomPayload {
  readonly op: 'FollowRoom';
  /** `rooms` → one-shot RoomSnapshot list; a room_id → snapshot + RoomDelta stream. */
  readonly target: string;
  readonly viewer_capability?: string;
}

export interface TakeoverInputPayload {
  readonly op: 'TakeoverInput';
  readonly room_id: string;
  readonly viewer_capability: string;
}

export interface InputFramePayload {
  readonly op: 'InputFrame';
  readonly room_id: string;
  readonly viewer_capability: string;
  readonly input_epoch: number;
  /** UTF-8 input bytes, base64. Input is PTY input, not canonical MessageDelta. */
  readonly data_b64: string;
}

export interface ResizeFramePayload {
  readonly op: 'ResizeFrame';
  readonly room_id: string;
  readonly viewer_capability: string;
  readonly input_epoch: number;
  readonly cols: number;
  readonly rows: number;
}

export type ProjectorRequest =
  | HelloPayload
  | JoinRoomPayload
  | LeaveRoomPayload
  | FollowRoomPayload
  | TakeoverInputPayload
  | InputFramePayload
  | ResizeFramePayload;

/** Gateway → projector: the Hello answer. The Gateway MINTS viewer_id (r4.1 §5). */
export interface HelloAck {
  readonly op: 'Hello';
  readonly ok: true;
  readonly ipc_version: 2;
  readonly supported: readonly number[];
  readonly limits: { readonly max_frame_bytes: number; readonly viewer_queue_frames: number };
}

export interface JoinAck {
  readonly op: 'JoinRoom';
  readonly ok: true;
  readonly room_id: string;
  /** Gateway-minted, opaque, occupancy-scoped (r4.1 §5). */
  readonly viewer_id: string;
  /** Local session token for the projector; occupancy-scoped; no provider secrets. */
  readonly viewer_capability: string;
  readonly occupancy_epoch: number;
  readonly recovery_kind: RecoveryKind;
  readonly snapshot: RoomSnapshotBody;
}

export interface ExecutionFact {
  readonly execution_id: string;
  readonly state: ExecutionState;
  readonly cursors: ExecutionCursors;
  /** Owner-ring fact (r4 §7.8) — never conflated with a per-viewer Gap. */
  readonly history_truncated: boolean;
}

export interface ViewerFact {
  readonly viewer_id: string;
  readonly attachment: ViewerAttachmentState;
  readonly caps: 'read' | 'read+input';
}

export interface RoomSnapshotBody {
  readonly room_id: string;
  readonly occupancy: OccupancyState;
  readonly block_reason: BlockReason;
  readonly input_authority: InputAuthorityState;
  readonly executions: readonly ExecutionFact[];
  readonly viewers: readonly ViewerFact[];
  /** r4 §7.7: room-event cursor, independent of PTY seqs. */
  readonly room_seq: number;
}

export interface RoomSnapshotFrame {
  readonly op: 'RoomSnapshot';
  readonly body: RoomSnapshotBody;
}

export interface RoomDeltaFrame {
  readonly op: 'RoomDelta';
  readonly room_seq: number;
  readonly facts: Partial<Omit<RoomSnapshotBody, 'room_id' | 'room_seq'>>;
}

/**
 * r4 §7.8: a PER-VIEWER fact. If the owner ring still retains the range the
 * Gateway fills it (`fill` carries the missed VT patches out-of-band on the
 * 0x02 channel); if not, the owner-side fact is `history_truncated` and the
 * local suffix STAYS. One flag is never reused for both facts.
 */
export interface GapFrame {
  readonly op: 'Gap';
  readonly execution_id: string;
  readonly from_seq: number;
  readonly to_seq: number;
  readonly fillable: boolean;
  /** Owner-ring fact surfaced alongside the per-viewer Gap; distinct meaning. */
  readonly history_truncated: boolean;
}

/** r4.1 §3: the 0x02 VT patch frame. NEVER raw PTY bytes to a projector. */
export interface VtPatchPayload {
  readonly execution_id: string;
  readonly pty_output_seq: number;
  readonly resize_epoch: number;
  readonly vt_codec_version: string;
  readonly checkpoint_or_patch:
    | { readonly kind: 'checkpoint'; readonly cells: readonly string[]; readonly cursor: { readonly row: number; readonly col: number } }
    | { readonly kind: 'patch'; readonly text: string };
}

/**
 * Receipt reference. The rung vocabulary is the wire form of the
 * claim-boundary ladder; the SEMANTIC authority for the ladder is
 * `@mad/claim-boundary` in madventures-tui (r3 §13 evidence-receipt row).
 * Consumers MUST re-derive and validate `not_evidence_of` with that library;
 * the Gateway states facts, the library decides honesty.
 */
export const RECEIPT_RUNGS = [
  'prepared',
  'dispatched',
  'executed',
  'attested',
  'verified',
  'reviewed',
  'ci',
  'merged',
] as const;
export type ReceiptRung = (typeof RECEIPT_RUNGS)[number];

export interface ReceiptRefFrame {
  readonly op: 'ReceiptRef';
  readonly receipt_id: string;
  readonly kind: string;
  readonly rung: ReceiptRung;
  readonly room_seq: number;
  readonly facts: Record<string, unknown>;
}

/** r4 AT-R4-25 honesty (Phase 2 gate; the shape ships closed now). */
export interface FixtureVerificationResultFrame {
  readonly op: 'FixtureVerificationResult';
  readonly room_id: string;
  readonly execution_id: string;
  /** Never `verified`/`attested`/above: fixture answers are not review or quorum. */
  readonly rung: 'executed';
  readonly result: string;
}

export interface NackFrame {
  readonly op: 'Nack';
  readonly reason: NackReason;
  readonly detail?: string;
  readonly supported?: readonly number[];
}

export interface DisconnectFrame {
  readonly op: 'Disconnect';
  readonly reason: DisconnectReason;
}

// ---------------------------------------------------------------------------
// Pure parsing of untrusted control payloads (shape only — no authority)
// ---------------------------------------------------------------------------

export type ControlParseResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly reason: NackReason; readonly detail: string };

/**
 * Parse one 0x01 control payload. Recognizes the closed vocabulary; a
 * forbidden authority op parses successfully as a shape so the connection
 * owner can refuse it as `claim_rejected` (observable), while anything else
 * unknown is `unknown_op`.
 */
export function parseControlPayload(payload: Buffer): ControlParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid_request', detail: 'control payload is not valid UTF-8 JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'invalid_request', detail: 'control payload must be a JSON object' };
  }
  const record = parsed as Record<string, unknown>;
  const op = record['op'];
  if (typeof op !== 'string') {
    return { ok: false, reason: 'invalid_request', detail: 'control payload is missing an op name' };
  }
  if (isProjectorForbiddenOp(op)) {
    // Recognized so the refusal is claim_rejected, never silently unknown.
    return { ok: true, value: record };
  }
  if (!isV2ControlName(op) || !PROJECTOR_REQUEST_OPS.includes(op as ProjectorRequestOp)) {
    return { ok: false, reason: 'unknown_op', detail: `op ${op} is not a projector-request op` };
  }
  return { ok: true, value: record };
}

/** The subset of the closed vocabulary a projector may SEND (r4 §7.15). */
export const PROJECTOR_REQUEST_OPS = [
  'Hello',
  'JoinRoom',
  'LeaveRoom',
  'FollowRoom',
  'TakeoverInput',
  'InputFrame',
  'ResizeFrame',
] as const;
export type ProjectorRequestOp = (typeof PROJECTOR_REQUEST_OPS)[number];

/** True when the first bytes on a connection are a structurally valid v2 Hello. */
export function looksLikeV2Hello(buffer: Buffer): boolean {
  if (buffer.byteLength < 5) return false;
  const length = buffer.readUInt32BE(0);
  if (length > MAX_V2_FRAME_BYTES) return false;
  if (buffer.byteLength < 5 + length) return false;
  if (buffer.readUInt8(4) !== FRAME_TYPE_CONTROL) return false;
  try {
    const parsed = JSON.parse(buffer.subarray(5, 5 + length).toString('utf8')) as Record<string, unknown>;
    return parsed !== null && typeof parsed === 'object' && parsed['op'] === 'Hello' && typeof parsed['ipc_version'] === 'number';
  } catch {
    return false;
  }
}
