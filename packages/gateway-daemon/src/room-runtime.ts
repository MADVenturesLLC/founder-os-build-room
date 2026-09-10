/**
 * Room Runtime Phase 1 — the Gateway-side room runtime (FIXTURE OCCUPANCY ONLY).
 *
 * Authority (r3 §7 / r4 §7.15): the Gateway is the SOLE local authority owner
 * for occupancy, execution identity, input authority, viewer attachment, and
 * receipts. This module is that authority's in-memory Phase 1 form. It is
 * pure logic — no sockets, no I/O, no clock, no randomness of its own (an
 * injected id factory mints opaque identifiers; production passes
 * `crypto.randomUUID`).
 *
 * FIXTURE OCCUPANCY ONLY (capability G; r4 §9 Phase 1 row): executions here
 * are fixture streams. They are NOT live occupancy, NOT Phase 0 evidence, NOT
 * production activation. Every fixture fact is labeled as such on the wire
 * (`vt_codec_version: fixture-vt/1`) and in receipts (rung ceiling
 * `executed` — a fixture can never mint attested/verified/reviewed/ci/merged;
 * the guard below fails closed).
 *
 * Semantic sources (bound by r3 §13; implemented from the artifacts):
 *  - r4 §7.6 Table 9   — canonical state axes; derived labels are the
 *                        PROJECTOR's job; this module holds canonical truth.
 *  - r4 §7.6           — ExclusiveInput: one writable lease; read observers
 *                        get ClaimRejected; second read+input while a holder
 *                        exists → input_held (fail closed, never
 *                        last-writer-wins); explicit TakeoverInput writes an
 *                        InputLeaseTransfer receipt, bumps input_epoch, and
 *                        the previous holder becomes STALE.
 *  - r4 §7.7 Table 10  — per-execution pty_output_seq / pty_checkpoint_seq /
 *                        resize_epoch; independent room_seq; idempotency keys
 *                        on JoinRoom/LeaveRoom (duplicate key + same payload =
 *                        same result; different payload = idempotency_conflict).
 *  - r4 §7.8           — Gap is a PER-VIEWER fact; history_truncated is an
 *                        OWNER-RING fact; never one flag for both; a surviving
 *                        viewer's local suffix stays.
 *  - r4 §7.9 Table 11 row 5 — per-viewer projection queue 256 frames / 1 MiB;
 *                        overflow → Gap then DISCONNECTED_BACKPRESSURE; the
 *                        source (fixture emit) NEVER blocks on a viewer.
 *  - r4 §7.10 Table 12 — LIVE_REATTACH vs HISTORY_REPLAY vs RECONSTRUCTION:
 *                        joining an occupied room is LIVE_REATTACH (or
 *                        HISTORY_REPLAY while catching up from the ring);
 *                        joining an INTERRUPTED/CLOSED room is RECONSTRUCTION,
 *                        never LIVE for a dead PTY.
 *  - r4.1 §4           — a checkpoint is admissible only at or below
 *                        durable_committed_seq; never invent cells.
 *  - r4.1 §5           — the Gateway MINTS viewer_id + viewer_capability;
 *                        a projector-chosen id is a spoof and gets a fresh
 *                        mint, never another viewer's identity or lease.
 *  - r4 §7.15          — receipt facts and the closed frame vocabulary;
 *                        EvidencePromote is never a projector API (refusals
 *                        live in the connection adapter via the protocol
 *                        package's PROJECTOR_FORBIDDEN_OPS).
 *
 * Execution cardinality (capability B; r4 §7.7 "Exactly two PTY streams
 * exist"): a room holds exactly two execution stream identities. A third
 * registration attempt raises `ExecutionCardinalityError` — a stop-class
 * observable, never a silent third stream. Viewers are NOT execution
 * identities and never count toward the limit.
 */

import {
  EXECUTION_STREAM_LIMIT,
  FIXTURE_VT_CODEC_VERSION,
  FRAME_TYPE_CONTROL,
  FRAME_TYPE_VT_PATCH,
  type BlockReason,
  type DisconnectReason,
  type ExecutionCursors,
  type ExecutionState,
  type GapFrame,
  type InputAuthorityState,
  type OccupancyState,
  type ReceiptRefFrame,
  type ReceiptRung,
  type RecoveryKind,
  type RoomDeltaFrame,
  type RoomSnapshotBody,
  type ViewerAttachmentState,
  type VtPatchPayload,
} from '../../gateway-protocol/src/ipc-v2.js';

// ---------------------------------------------------------------------------
// Bounds (r4 §7.9 Table 11)
// ---------------------------------------------------------------------------

/** Table 11 row 5: per-viewer projection queue bound (frames). */
export const VIEWER_QUEUE_FRAMES = 256;
/** Table 11 row 5: per-viewer projection queue bound (bytes). */
export const VIEWER_QUEUE_BYTES = 1024 * 1024;
/** Fixture durable ring bound (proposed 1024 patches; wrap → owner history_truncated). */
export const FIXTURE_RING_PATCHES = 1024;

// ---------------------------------------------------------------------------
// Errors (stop-class observables; the adapter surfaces them, never swallows)
// ---------------------------------------------------------------------------

export class RoomRuntimeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RoomRuntimeError';
    this.code = code;
  }
}

/** A third execution stream identity is a stop condition, not a soft error. */
export class ExecutionCardinalityError extends RoomRuntimeError {
  constructor(roomId: string, attempted: string) {
    super(
      'stream_limit_exceeded',
      `room ${roomId}: execution stream limit is exactly ${String(EXECUTION_STREAM_LIMIT)}; refused to register '${attempted}'`,
    );
    this.name = 'ExecutionCardinalityError';
  }
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface FixtureCheckpoint {
  readonly cells: readonly string[];
  readonly cursor: { readonly row: number; readonly col: number };
}

interface RoomExecution {
  readonly executionId: string;
  state: ExecutionState;
  ptyOutputSeq: number;
  ptyCheckpointSeq: number;
  resizeEpoch: number;
  durableCommittedSeq: number;
  historyTruncated: boolean;
  /** Fixture durable ring: committed patches, oldest-first; wraps at the bound. */
  readonly ring: VtPatchPayload[];
  checkpoint: FixtureCheckpoint | null;
}

/** One frame awaiting write to a viewer socket. */
export interface OutFrame {
  readonly type: number;
  readonly payload: Buffer;
}

interface RoomViewer {
  readonly viewerId: string;
  readonly capability: string;
  caps: 'read' | 'read+input';
  attachment: ViewerAttachmentState;
  subscribed: boolean;
  /** Per-execution last seq delivered to this viewer (Gap computation). */
  readonly lastDelivered: Map<string, number>;
  readonly outbox: OutFrame[];
  outboxBytes: number;
  /** Set when the adapter must destroy this viewer's socket after draining. */
  pendingDisconnect: DisconnectReason | null;
}

interface ReceiptRecord {
  readonly receiptId: string;
  readonly kind: string;
  readonly rung: ReceiptRung;
  readonly roomSeq: number;
  readonly facts: Record<string, unknown>;
}

interface IdempotencyRecord {
  readonly payloadHash: string;
  readonly outcome: RoomOutcome;
}

interface Room {
  readonly roomId: string;
  occupancy: OccupancyState;
  occupancyEpoch: number;
  blockReason: BlockReason;
  inputAuthority: InputAuthorityState;
  inputEpoch: number;
  roomSeq: number;
  readonly executions: Map<string, RoomExecution>;
  readonly viewers: Map<string, RoomViewer>;
  /** capability → viewer_id (Gateway-minted identities only). */
  readonly capabilities: Map<string, string>;
  readonly receipts: ReceiptRecord[];
  readonly idempotency: Map<string, IdempotencyRecord>;
}

/** The ceiling a FIXTURE receipt may claim (r4 AT-R4-18/25 honesty). */
const FIXTURE_RUNG_CEILING: ReceiptRung = 'executed';
const RUNG_ORDER: readonly ReceiptRung[] = [
  'prepared',
  'dispatched',
  'executed',
  'attested',
  'verified',
  'reviewed',
  'ci',
  'merged',
];

// ---------------------------------------------------------------------------
// Outcomes (the adapter turns these into wire frames)
// ---------------------------------------------------------------------------

export type RoomNack = { readonly ok: false; readonly reason: string; readonly detail?: string };

export interface RoomOutcome {
  readonly ok: true;
  /** The control-frame body answered to the requesting viewer. */
  readonly body: Record<string, unknown>;
}

export type RoomResult = RoomOutcome | RoomNack;

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export interface RoomRuntimeDeps {
  /** Opaque id factory. Production: crypto.randomUUID. Never authority. */
  readonly newId: () => string;
}

export class RoomRuntime {
  private readonly rooms = new Map<string, Room>();
  /** viewer_id → room_id, for connection-close bookkeeping. */
  private readonly viewerRoom = new Map<string, string>();

  constructor(private readonly deps: RoomRuntimeDeps) {}

  // -------------------------------------------------------------------------
  // Fixture room construction (test/fixture surface; never a projector op)
  // -------------------------------------------------------------------------

  /** Create a fixture room in PREPARED with exactly two execution slots. */
  createFixtureRoom(roomId: string): void {
    if (this.rooms.has(roomId)) {
      throw new RoomRuntimeError('room_exists', `room ${roomId} already exists`);
    }
    const room: Room = {
      roomId,
      occupancy: 'PREPARED',
      occupancyEpoch: 0,
      blockReason: 'NONE',
      inputAuthority: { kind: 'UNOWNED' },
      inputEpoch: 0,
      roomSeq: 0,
      executions: new Map(),
      viewers: new Map(),
      capabilities: new Map(),
      receipts: [],
      idempotency: new Map(),
    };
    this.rooms.set(roomId, room);
    // Exactly two execution stream identities (capability B).
    this.registerFixtureExecution(room, 'slot-a');
    this.registerFixtureExecution(room, 'slot-b');
  }

  /**
   * Register an execution stream identity. PRIVATE beyond room construction:
   * a third identity raises ExecutionCardinalityError (stop-class). Exposed
   * for the cardinality negative-control test only.
   */
  registerFixtureExecution(room: Room | string, executionId: string): void {
    const target = typeof room === 'string' ? this.requireRoom(room) : room;
    if (target.executions.size >= EXECUTION_STREAM_LIMIT && !target.executions.has(executionId)) {
      throw new ExecutionCardinalityError(target.roomId, executionId);
    }
    const execution: RoomExecution = {
      executionId,
      state: 'EMPTY',
      ptyOutputSeq: 0,
      ptyCheckpointSeq: 0,
      resizeEpoch: 0,
      durableCommittedSeq: 0,
      historyTruncated: false,
      ring: [],
      checkpoint: null,
    };
    target.executions.set(executionId, execution);
  }

  /** PREPARED → OCCUPIED: both fixture slots RUNNING; occupancy_epoch mints. */
  occupyFixtureRoom(roomId: string): void {
    const room = this.requireRoom(roomId);
    if (room.occupancy !== 'PREPARED') {
      throw new RoomRuntimeError(
        'occupancy_state_invalid',
        `room ${roomId}: cannot occupy from ${room.occupancy}`,
      );
    }
    room.occupancy = 'OCCUPIED';
    room.occupancyEpoch += 1;
    for (const execution of room.executions.values()) {
      execution.state = 'RUNNING';
    }
    this.bumpRoomSeq(room);
    this.pushReceipt(room, 'occupancy-prepared', 'prepared', {
      fixture: true,
      occupancy_epoch: room.occupancyEpoch,
    });
    this.broadcastDelta(room, {
      occupancy: room.occupancy,
      block_reason: room.blockReason,
      executions: this.executionFacts(room),
    });
  }

  /**
   * Fixture VT emission. The source NEVER blocks on a viewer (r4 §7.9):
   * slow viewers overflow their own queue and are disconnected; occupancy and
   * sibling viewers continue.
   */
  emitFixturePatch(roomId: string, executionId: string, text: string): void {
    const room = this.requireRoom(roomId);
    const execution = room.executions.get(executionId);
    if (execution === undefined) {
      throw new RoomRuntimeError('execution_unknown', `execution ${executionId} unknown in ${roomId}`);
    }
    if (execution.state !== 'RUNNING') {
      throw new RoomRuntimeError(
        'execution_not_running',
        `execution ${executionId} is ${execution.state}; a dead stream emits nothing`,
      );
    }
    execution.ptyOutputSeq += 1;
    const patch: VtPatchPayload = {
      execution_id: executionId,
      pty_output_seq: execution.ptyOutputSeq,
      resize_epoch: execution.resizeEpoch,
      vt_codec_version: FIXTURE_VT_CODEC_VERSION,
      checkpoint_or_patch: { kind: 'patch', text },
    };
    // Fixture durable ring: committed synchronously, so the watermark equals
    // the output seq. Wrap sets the OWNER-ring fact history_truncated.
    execution.ring.push(patch);
    if (execution.ring.length > FIXTURE_RING_PATCHES) {
      execution.ring.shift();
      execution.historyTruncated = true;
    }
    execution.durableCommittedSeq = execution.ptyOutputSeq;
    this.fanoutPatch(room, patch);
  }

  /**
   * Produce a fixture checkpoint at the current committed watermark.
   * r4.1 §4: admissible only at or below durable_committed_seq — in the
   * fixture the checkpoint seq EQUALS a committed seq by construction.
   */
  produceFixtureCheckpoint(roomId: string, executionId: string): void {
    const room = this.requireRoom(roomId);
    const execution = room.executions.get(executionId);
    if (execution === undefined) {
      throw new RoomRuntimeError('execution_unknown', `execution ${executionId} unknown in ${roomId}`);
    }
    if (execution.ptyOutputSeq > execution.durableCommittedSeq) {
      // Cannot happen in the synchronous fixture; the guard keeps the r4.1 §4
      // invariant honest if persistence ever lags emission.
      throw new RoomRuntimeError(
        'checkpoint_unavailable',
        `checkpoint at seq ${String(execution.ptyOutputSeq)} is ahead of durable watermark ${String(execution.durableCommittedSeq)}`,
      );
    }
    execution.checkpoint = {
      cells: [`${executionId}:fixture-grid@${String(execution.ptyOutputSeq)}`],
      cursor: { row: 0, col: 0 },
    };
    execution.ptyCheckpointSeq = execution.ptyOutputSeq;
    const frame: VtPatchPayload = {
      execution_id: executionId,
      pty_output_seq: execution.ptyOutputSeq,
      resize_epoch: execution.resizeEpoch,
      vt_codec_version: FIXTURE_VT_CODEC_VERSION,
      checkpoint_or_patch: { kind: 'checkpoint', cells: execution.checkpoint.cells, cursor: execution.checkpoint.cursor },
    };
    this.fanoutPatch(room, frame);
  }

  /** Interrupt fixture occupancy: OCCUPIED → INTERRUPTED (viewer detach ≠ this). */
  interruptFixtureRoom(roomId: string, reason: BlockReason = 'WAITING_FOUNDER'): void {
    const room = this.requireRoom(roomId);
    if (room.occupancy !== 'OCCUPIED') {
      throw new RoomRuntimeError(
        'occupancy_state_invalid',
        `room ${roomId}: cannot interrupt from ${room.occupancy}`,
      );
    }
    room.occupancy = 'INTERRUPTED';
    room.blockReason = reason;
    for (const execution of room.executions.values()) {
      execution.state = 'FAILED_CLOSED';
    }
    this.releaseInputAuthority(room, 'occupancy_interrupted');
    this.bumpRoomSeq(room);
    this.pushReceipt(room, 'occupancy-interrupted', 'executed', {
      fixture: true,
      block_reason: reason,
    });
    this.broadcastDelta(room, {
      occupancy: room.occupancy,
      block_reason: room.blockReason,
      input_authority: room.inputAuthority,
      executions: this.executionFacts(room),
    });
  }

  /** Close: INTERRUPTED → CLOSED (r4 §7.15: close/Founder abort). */
  closeFixtureRoom(roomId: string): void {
    const room = this.requireRoom(roomId);
    if (room.occupancy !== 'INTERRUPTED') {
      throw new RoomRuntimeError(
        'occupancy_state_invalid',
        `room ${roomId}: cannot close from ${room.occupancy} (close follows interrupt)`,
      );
    }
    room.occupancy = 'CLOSED';
    this.bumpRoomSeq(room);
    this.pushReceipt(room, 'occupancy-closed', 'executed', { fixture: true });
    for (const viewer of room.viewers.values()) {
      viewer.attachment = 'DETACHED';
      viewer.subscribed = false;
      viewer.pendingDisconnect = 'occupancy_closed';
    }
    this.broadcastDelta(room, { occupancy: room.occupancy });
  }

  // -------------------------------------------------------------------------
  // Projector operations (the v2 connection adapter is the only caller)
  // -------------------------------------------------------------------------

  /**
   * JoinRoom (r4 §7.8 join kinds; r4.1 §5 minting).
   * Fresh join: checkpoint + deltas from pty_checkpoint_seq.
   * Surviving join (valid capability): same viewer_id; missed range →
   * Gap{execution_id,from,to}; fillable when the ring still retains it.
   */
  joinRoom(
    roomId: string,
    idempotencyKey: string,
    presentedCapability: string | undefined,
    requestedCaps: 'read' | 'read+input',
  ): RoomResult {
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      return { ok: false, reason: 'room_unknown', detail: `no room ${roomId}` };
    }
    const payloadHash = stableHash({ roomId, idempotencyKey, presentedCapability, requestedCaps });
    const prior = room.idempotency.get(idempotencyKey);
    if (prior !== undefined) {
      if (prior.payloadHash !== payloadHash) {
        // r4 §7.7: duplicate key + different payload = idempotency_conflict.
        return { ok: false, reason: 'idempotency_conflict', detail: `idempotency_key ${idempotencyKey} reused with a different payload` };
      }
      return prior.outcome;
    }

    // r4.1 §5: a valid capability resumes the SAME Gateway-minted identity.
    // A forged/expired/other-room capability is NOT an error to the joiner —
    // they get a fresh mint; the victim keeps everything (AT-R4-35).
    let viewer: RoomViewer | undefined;
    if (presentedCapability !== undefined) {
      const viewerId = room.capabilities.get(presentedCapability);
      if (viewerId !== undefined) viewer = room.viewers.get(viewerId);
    }
    const surviving = viewer !== undefined;
    if (viewer === undefined) {
      viewer = {
        viewerId: `viewer-${this.deps.newId()}`,
        capability: `vcap-${this.deps.newId()}`,
        caps: 'read',
        attachment: 'JOINING',
        subscribed: true,
        lastDelivered: new Map(),
        outbox: [],
        outboxBytes: 0,
        pendingDisconnect: null,
      };
      room.viewers.set(viewer.viewerId, viewer);
      room.capabilities.set(viewer.capability, viewer.viewerId);
      this.viewerRoom.set(viewer.viewerId, roomId);
    }
    viewer.caps = requestedCaps;
    viewer.subscribed = true;
    viewer.attachment = 'ATTACHED';

    // Input authority (r4 §7.6 ExclusiveInput): grant only when UNOWNED.
    let inputOutcome: 'granted' | 'input_held' | 'unchanged' = 'unchanged';
    if (requestedCaps === 'read+input') {
      if (room.inputAuthority.kind === 'UNOWNED') {
        room.inputEpoch += 1;
        room.inputAuthority = { kind: 'HELD', viewerId: viewer.viewerId, inputEpoch: room.inputEpoch };
        inputOutcome = 'granted';
        this.bumpRoomSeq(room);
        this.pushReceipt(room, 'input-lease-issued', 'prepared', {
          fixture: true,
          viewer_id: viewer.viewerId,
          input_epoch: room.inputEpoch,
        });
        this.broadcastDelta(room, { input_authority: room.inputAuthority });
      } else if (room.inputAuthority.kind === 'HELD' && room.inputAuthority.viewerId !== viewer.viewerId) {
        // Fail closed, never last-writer-wins; the joiner stays attached read-only.
        inputOutcome = 'input_held';
        viewer.caps = 'read';
      }
    }

    const recoveryKind = this.recoveryKindFor(room);
    const snapshot = this.snapshotBody(room);

    // Catch-up delivery: fresh viewers get checkpoint+deltas; surviving
    // viewers get an explicit Gap for any missed range (never a blit).
    for (const execution of room.executions.values()) {
      const delivered = viewer.lastDelivered.get(execution.executionId) ?? 0;
      if (!surviving) {
        if (execution.checkpoint !== null && execution.ptyCheckpointSeq > 0) {
          this.pushToViewer(room, viewer, {
            type: FRAME_TYPE_VT_PATCH,
            payload: controlBuffer({
              execution_id: execution.executionId,
              pty_output_seq: execution.ptyCheckpointSeq,
              resize_epoch: execution.resizeEpoch,
              vt_codec_version: FIXTURE_VT_CODEC_VERSION,
              checkpoint_or_patch: { kind: 'checkpoint', cells: execution.checkpoint.cells, cursor: execution.checkpoint.cursor },
            } satisfies VtPatchPayload),
          });
          viewer.lastDelivered.set(execution.executionId, execution.ptyCheckpointSeq);
        }
        const from = viewer.lastDelivered.get(execution.executionId) ?? 0;
        this.deliverRingSuffix(room, viewer, execution, from);
      } else if (delivered < execution.ptyOutputSeq) {
        const fromSeq = delivered + 1;
        const toSeq = execution.ptyOutputSeq;
        const ringOldest = execution.ring.length > 0 ? execution.ring[0]!.pty_output_seq : toSeq + 1;
        // Fillable iff the owner ring still retains the whole missed range
        // (r4 §7.8). A wrap that dropped part of it makes the owner-side
        // fact history_truncated; the viewer's local suffix stays either way.
        const fillable = fromSeq >= ringOldest;
        const gap: GapFrame = {
          op: 'Gap',
          execution_id: execution.executionId,
          from_seq: fromSeq,
          to_seq: toSeq,
          fillable,
          // Owner-ring fact, distinct from the per-viewer Gap (r4 §7.8).
          history_truncated: execution.historyTruncated,
        };
        this.pushToViewer(room, viewer, { type: FRAME_TYPE_CONTROL, payload: controlBuffer(gap) });
        if (fillable) {
          this.deliverRingSuffix(room, viewer, execution, delivered);
        }
        // If not fillable: the local suffix STAYS (projector rule); the
        // Gateway states the honest owner-side truncation and moves on.
      }
    }

    const outcome: RoomOutcome = {
      ok: true,
      body: {
        op: 'JoinRoom',
        ok: true,
        room_id: roomId,
        viewer_id: viewer.viewerId,
        viewer_capability: viewer.capability,
        occupancy_epoch: room.occupancyEpoch,
        recovery_kind: recoveryKind,
        snapshot,
        input: inputOutcome,
      },
    };
    room.idempotency.set(idempotencyKey, { payloadHash, outcome });
    this.bumpRoomSeq(room);
    this.broadcastDelta(room, { viewers: this.viewerFacts(room) });
    return outcome;
  }

  /** LeaveRoom: viewer DETACHED; occupancy untouched (r4 §7.15 distinctions). */
  leaveRoom(roomId: string, idempotencyKey: string, capability: string): RoomResult {
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      return { ok: false, reason: 'room_unknown', detail: `no room ${roomId}` };
    }
    const payloadHash = stableHash({ roomId, idempotencyKey, capability });
    const prior = room.idempotency.get(idempotencyKey);
    if (prior !== undefined) {
      if (prior.payloadHash !== payloadHash) {
        return { ok: false, reason: 'idempotency_conflict', detail: `idempotency_key ${idempotencyKey} reused with a different payload` };
      }
      return prior.outcome;
    }
    const viewerId = room.capabilities.get(capability);
    const viewer = viewerId !== undefined ? room.viewers.get(viewerId) : undefined;
    if (viewer === undefined) {
      return { ok: false, reason: 'stale_viewer', detail: 'capability does not match a Gateway-minted viewer of this room' };
    }
    viewer.attachment = 'DETACHED';
    viewer.subscribed = false;
    viewer.pendingDisconnect = 'leave';
    if (room.inputAuthority.kind === 'HELD' && room.inputAuthority.viewerId === viewer.viewerId) {
      this.releaseInputAuthority(room, 'holder_left');
    }
    const outcome: RoomOutcome = {
      ok: true,
      body: { op: 'LeaveRoom', ok: true, room_id: roomId, viewer_id: viewer.viewerId, disconnect: 'leave' },
    };
    room.idempotency.set(idempotencyKey, { payloadHash, outcome });
    this.bumpRoomSeq(room);
    this.broadcastDelta(room, { viewers: this.viewerFacts(room), input_authority: room.inputAuthority });
    return outcome;
  }

  /** FollowRoom: `rooms` → one snapshot per room; a room_id → snapshot only (deltas already flow to subscribers). */
  followRoom(target: string, capability: string | undefined): RoomResult {
    if (target === 'rooms') {
      const list: RoomSnapshotBody[] = [];
      for (const room of this.rooms.values()) list.push(this.snapshotBody(room));
      return { ok: true, body: { op: 'FollowRoom', ok: true, target, rooms: list } };
    }
    const room = this.rooms.get(target);
    if (room === undefined) {
      return { ok: false, reason: 'room_unknown', detail: `no room ${target}` };
    }
    let viewerId: string | null = null;
    if (capability !== undefined) {
      viewerId = room.capabilities.get(capability) ?? null;
    }
    return {
      ok: true,
      body: { op: 'FollowRoom', ok: true, target, viewer_id: viewerId, snapshot: this.snapshotBody(room) },
    };
  }

  /**
   * TakeoverInput (r4 §7.6): explicit takeover writes an InputLeaseTransfer
   * receipt, bumps input_epoch, previous holder becomes STALE.
   */
  takeoverInput(roomId: string, capability: string): RoomResult {
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      return { ok: false, reason: 'room_unknown', detail: `no room ${roomId}` };
    }
    const viewerId = room.capabilities.get(capability);
    const viewer = viewerId !== undefined ? room.viewers.get(viewerId) : undefined;
    if (viewer === undefined || viewer.attachment === 'DETACHED' || viewer.attachment === 'STALE') {
      return { ok: false, reason: 'stale_viewer', detail: 'takeover requires an attached Gateway-minted viewer' };
    }
    const previous = room.inputAuthority;
    if (previous.kind === 'HELD' && previous.viewerId === viewer.viewerId) {
      return { ok: true, body: { op: 'TakeoverInput', ok: true, room_id: roomId, viewer_id: viewer.viewerId, input_epoch: previous.inputEpoch, already_holder: true } };
    }
    if (previous.kind === 'HELD') {
      const priorViewer = room.viewers.get(previous.viewerId);
      if (priorViewer !== undefined) {
        priorViewer.attachment = 'STALE';
        priorViewer.caps = 'read';
      }
    }
    room.inputEpoch += 1;
    room.inputAuthority = { kind: 'HELD', viewerId: viewer.viewerId, inputEpoch: room.inputEpoch };
    viewer.caps = 'read+input';
    this.bumpRoomSeq(room);
    this.pushReceipt(room, 'input-lease-transfer', 'prepared', {
      fixture: true,
      from_viewer: previous.kind === 'HELD' ? previous.viewerId : null,
      to_viewer: viewer.viewerId,
      input_epoch: room.inputEpoch,
    });
    this.broadcastDelta(room, { input_authority: room.inputAuthority, viewers: this.viewerFacts(room) });
    return {
      ok: true,
      body: { op: 'TakeoverInput', ok: true, room_id: roomId, viewer_id: viewer.viewerId, input_epoch: room.inputEpoch },
    };
  }

  /**
   * InputFrame: holder with the current epoch only. Read observers get
   * ClaimRejected (AT-R4-16); revoked/stale holders get stale_viewer
   * (AT-R4-30). Accepted input is applied to the slot-a fixture VT as a
   * deterministic ECHO patch — fixture behavior, documented as such; Phase 2
   * replaces the echo with a real PTY write. Input is PTY input, never a
   * canonical MessageDelta (r4 §7.6).
   */
  inputFrame(roomId: string, capability: string, inputEpoch: number, dataB64: string): RoomResult {
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      return { ok: false, reason: 'room_unknown', detail: `no room ${roomId}` };
    }
    const viewerId = room.capabilities.get(capability);
    const viewer = viewerId !== undefined ? room.viewers.get(viewerId) : undefined;
    if (viewer === undefined) {
      return { ok: false, reason: 'stale_viewer', detail: 'capability does not match a Gateway-minted viewer' };
    }
    if (viewer.attachment === 'STALE') {
      return { ok: false, reason: 'stale_viewer', detail: 'viewer was superseded by a takeover' };
    }
    const authority = room.inputAuthority;
    if (authority.kind !== 'HELD' || authority.viewerId !== viewer.viewerId) {
      // Read observer attempting input: ClaimRejected, never silently dropped.
      return { ok: false, reason: 'claim_rejected', detail: 'input requires the exclusive input lease' };
    }
    if (inputEpoch !== authority.inputEpoch) {
      return { ok: false, reason: 'stale_viewer', detail: `input_epoch ${String(inputEpoch)} is stale (current ${String(authority.inputEpoch)})` };
    }
    let text: string;
    try {
      text = Buffer.from(dataB64, 'base64').toString('utf8');
    } catch {
      return { ok: false, reason: 'invalid_request', detail: 'data_b64 is not valid base64' };
    }
    // Fixture echo into the first RUNNING execution (deterministic).
    for (const execution of room.executions.values()) {
      if (execution.state === 'RUNNING') {
        this.emitFixturePatch(room.roomId, execution.executionId, text);
        break;
      }
    }
    return { ok: true, body: { op: 'InputFrame', ok: true, room_id: roomId, viewer_id: viewer.viewerId, input_epoch: authority.inputEpoch, accepted_bytes: Buffer.byteLength(text, 'utf8') } };
  }

  /** ResizeFrame: controller-only (the input-lease holder; r4 §7.6). */
  resizeFrame(roomId: string, capability: string, inputEpoch: number, cols: number, rows: number): RoomResult {
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      return { ok: false, reason: 'room_unknown', detail: `no room ${roomId}` };
    }
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
      return { ok: false, reason: 'invalid_request', detail: 'cols/rows must be positive integers' };
    }
    const viewerId = room.capabilities.get(capability);
    const viewer = viewerId !== undefined ? room.viewers.get(viewerId) : undefined;
    if (viewer === undefined || viewer.attachment === 'STALE') {
      return { ok: false, reason: 'stale_viewer', detail: 'resize requires an attached non-stale viewer' };
    }
    const authority = room.inputAuthority;
    if (authority.kind !== 'HELD' || authority.viewerId !== viewer.viewerId) {
      return { ok: false, reason: 'claim_rejected', detail: 'resize authority is the input-lease holder only' };
    }
    if (inputEpoch !== authority.inputEpoch) {
      return { ok: false, reason: 'stale_viewer', detail: `input_epoch ${String(inputEpoch)} is stale` };
    }
    for (const execution of room.executions.values()) {
      execution.resizeEpoch += 1;
    }
    this.bumpRoomSeq(room);
    this.broadcastDelta(room, { executions: this.executionFacts(room) });
    return { ok: true, body: { op: 'ResizeFrame', ok: true, room_id: roomId, cols, rows, resize_epochs: this.executionFacts(room).map((e) => ({ execution_id: e.execution_id, resize_epoch: e.cursors.resizeEpoch })) } };
  }

  /**
   * Connection-close bookkeeping (AT-R4-01): a dead viewer process detaches
   * that viewer ONLY. Occupancy stays OCCUPIED, executions keep running,
   * receipts keep appending — a viewer is not an execution identity.
   */
  viewerQuit(roomId: string, viewerId: string): void {
    const room = this.rooms.get(roomId);
    if (room === undefined) return;
    const viewer = room.viewers.get(viewerId);
    if (viewer === undefined) return;
    if (viewer.attachment !== 'DETACHED' && viewer.attachment !== 'STALE') {
      viewer.attachment = 'DETACHED';
    }
    viewer.subscribed = false;
    if (room.inputAuthority.kind === 'HELD' && room.inputAuthority.viewerId === viewerId) {
      this.releaseInputAuthority(room, 'holder_quit');
    }
    this.bumpRoomSeq(room);
    this.broadcastDelta(room, { viewers: this.viewerFacts(room), input_authority: room.inputAuthority });
  }

  // -------------------------------------------------------------------------
  // Adapter drains
  // -------------------------------------------------------------------------

  /** Drain a viewer's outbox (the adapter writes these frames to the socket). */
  takeOutbox(roomId: string, viewerId: string): OutFrame[] {
    const room = this.rooms.get(roomId);
    const viewer = room?.viewers.get(viewerId);
    if (viewer === undefined) return [];
    const frames = viewer.outbox.splice(0, viewer.outbox.length);
    viewer.outboxBytes = 0;
    return frames;
  }

  /** The disconnect the adapter must apply after draining (or null). */
  pendingDisconnect(roomId: string, viewerId: string): DisconnectReason | null {
    const room = this.rooms.get(roomId);
    const viewer = room?.viewers.get(viewerId);
    return viewer?.pendingDisconnect ?? null;
  }

  /** Resolve a capability to its Gateway-minted viewer id (adapter bookkeeping). */
  viewerForCapability(roomId: string, capability: string): string | null {
    return this.rooms.get(roomId)?.capabilities.get(capability) ?? null;
  }

  /** Snapshot for `rooms --json` style reads. */
  listRooms(): RoomSnapshotBody[] {
    const list: RoomSnapshotBody[] = [];
    for (const room of this.rooms.values()) list.push(this.snapshotBody(room));
    return list;
  }

  snapshot(roomId: string): RoomSnapshotBody | null {
    const room = this.rooms.get(roomId);
    return room === undefined ? null : this.snapshotBody(room);
  }

  /** Receipts appended so far (fixture ceiling enforced at push time). */
  receiptsFor(roomId: string): readonly ReceiptRecord[] {
    return this.requireRoom(roomId).receipts;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private requireRoom(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (room === undefined) {
      throw new RoomRuntimeError('room_unknown', `no room ${roomId}`);
    }
    return room;
  }

  private recoveryKindFor(room: Room): RecoveryKind {
    if (room.occupancy === 'OCCUPIED') return 'LIVE_REATTACH';
    if (room.occupancy === 'PREPARED') return 'HISTORY_REPLAY';
    // INTERRUPTED / CLOSED / ABSENT: never LIVE for a dead PTY (Table 12).
    return 'RECONSTRUCTION';
  }

  private releaseInputAuthority(room: Room, cause: string): void {
    if (room.inputAuthority.kind !== 'HELD') return;
    const previousViewer = room.inputAuthority.viewerId;
    room.inputAuthority = { kind: 'UNOWNED' };
    this.pushReceipt(room, 'input-lease-released', 'prepared', {
      fixture: true,
      cause,
      from_viewer: previousViewer,
    });
  }

  private deliverRingSuffix(room: Room, viewer: RoomViewer, execution: RoomExecution, afterSeq: number): void {
    for (const patch of execution.ring) {
      if (patch.pty_output_seq <= afterSeq) continue;
      if (patch.checkpoint_or_patch.kind === 'checkpoint') continue; // checkpoints delivered explicitly
      this.pushToViewer(room, viewer, { type: FRAME_TYPE_VT_PATCH, payload: controlBuffer(patch) });
      viewer.lastDelivered.set(execution.executionId, patch.pty_output_seq);
    }
  }

  private fanoutPatch(room: Room, patch: VtPatchPayload): void {
    for (const viewer of room.viewers.values()) {
      if (!viewer.subscribed) continue;
      if (viewer.attachment === 'DISCONNECTED_BACKPRESSURE') continue;
      this.pushToViewer(room, viewer, { type: FRAME_TYPE_VT_PATCH, payload: controlBuffer(patch) });
      viewer.lastDelivered.set(patch.execution_id, patch.pty_output_seq);
    }
  }

  /**
   * Bounded per-viewer delivery (r4 §7.9 Table 11 row 5). Overflow → Gap
   * then DISCONNECTED_BACKPRESSURE. The producer never blocks; the source
   * stream and sibling viewers are untouched.
   */
  private pushToViewer(room: Room, viewer: RoomViewer, frame: OutFrame): void {
    if (viewer.attachment === 'DISCONNECTED_BACKPRESSURE') return;
    viewer.outbox.push(frame);
    viewer.outboxBytes += frame.payload.byteLength + 5;
    if (viewer.outbox.length > VIEWER_QUEUE_FRAMES || viewer.outboxBytes > VIEWER_QUEUE_BYTES) {
      const missed: { executionId: string; from: number; to: number }[] = [];
      for (const execution of room.executions.values()) {
        const delivered = viewer.lastDelivered.get(execution.executionId) ?? 0;
        if (delivered < execution.ptyOutputSeq) {
          missed.push({ executionId: execution.executionId, from: delivered + 1, to: execution.ptyOutputSeq });
        }
      }
      viewer.attachment = 'DISCONNECTED_BACKPRESSURE';
      viewer.subscribed = false;
      for (const gap of missed) {
        const gapFrame: GapFrame = {
          op: 'Gap',
          execution_id: gap.executionId,
          from_seq: gap.from,
          to_seq: gap.to,
          fillable: false,
          history_truncated: room.executions.get(gap.executionId)?.historyTruncated ?? false,
        };
        viewer.outbox.push({ type: FRAME_TYPE_CONTROL, payload: controlBuffer(gapFrame) });
      }
      viewer.pendingDisconnect = 'viewer_backpressure';
      this.bumpRoomSeq(room);
      this.broadcastDelta(room, { viewers: this.viewerFacts(room) });
    }
  }

  private bumpRoomSeq(room: Room): void {
    room.roomSeq += 1;
  }

  private broadcastDelta(room: Room, facts: Partial<Omit<RoomSnapshotBody, 'room_id' | 'room_seq'>>): void {
    const delta: RoomDeltaFrame = { op: 'RoomDelta', room_seq: room.roomSeq, facts };
    const buffer = controlBuffer(delta);
    for (const viewer of room.viewers.values()) {
      if (!viewer.subscribed) continue;
      viewer.outbox.push({ type: FRAME_TYPE_CONTROL, payload: buffer });
      viewer.outboxBytes += buffer.byteLength + 5;
    }
  }

  /**
   * Append a receipt. FIXTURE RUNG CEILING: a fixture room may never mint a
   * receipt above `executed` — attested/verified/reviewed/ci/merged require
   * real evidence this runtime cannot produce (r4 AT-R4-18/AT-R4-25; act §14
   * claim-boundary). The guard fails closed.
   */
  private pushReceipt(room: Room, kind: string, rung: ReceiptRung, facts: Record<string, unknown>): void {
    if (RUNG_ORDER.indexOf(rung) > RUNG_ORDER.indexOf(FIXTURE_RUNG_CEILING)) {
      throw new RoomRuntimeError(
        'evidence_rung_exceeds_fixture',
        `fixture receipt kind '${kind}' attempted rung '${rung}' above the fixture ceiling '${FIXTURE_RUNG_CEILING}'`,
      );
    }
    this.bumpRoomSeq(room);
    const record: ReceiptRecord = {
      receiptId: `receipt-${this.deps.newId()}`,
      kind,
      rung,
      roomSeq: room.roomSeq,
      facts,
    };
    room.receipts.push(record);
    const frame: ReceiptRefFrame = {
      op: 'ReceiptRef',
      receipt_id: record.receiptId,
      kind: record.kind,
      rung: record.rung,
      room_seq: record.roomSeq,
      facts: record.facts,
    };
    const buffer = controlBuffer(frame);
    for (const viewer of room.viewers.values()) {
      if (!viewer.subscribed) continue;
      viewer.outbox.push({ type: FRAME_TYPE_CONTROL, payload: buffer });
      viewer.outboxBytes += buffer.byteLength + 5;
    }
  }

  private executionFacts(room: Room): RoomSnapshotBody['executions'] {
    const facts: {
      execution_id: string;
      state: ExecutionState;
      cursors: ExecutionCursors;
      history_truncated: boolean;
    }[] = [];
    for (const execution of room.executions.values()) {
      facts.push({
        execution_id: execution.executionId,
        state: execution.state,
        cursors: {
          ptyOutputSeq: execution.ptyOutputSeq,
          ptyCheckpointSeq: execution.ptyCheckpointSeq,
          resizeEpoch: execution.resizeEpoch,
          durableCommittedSeq: execution.durableCommittedSeq,
        } satisfies ExecutionCursors,
        history_truncated: execution.historyTruncated,
      });
    }
    return facts;
  }

  private viewerFacts(room: Room): RoomSnapshotBody['viewers'] {
    const facts: { viewer_id: string; attachment: ViewerAttachmentState; caps: 'read' | 'read+input' }[] = [];
    for (const viewer of room.viewers.values()) {
      facts.push({ viewer_id: viewer.viewerId, attachment: viewer.attachment, caps: viewer.caps });
    }
    return facts;
  }

  private snapshotBody(room: Room): RoomSnapshotBody {
    return {
      room_id: room.roomId,
      occupancy: room.occupancy,
      block_reason: room.blockReason,
      input_authority: room.inputAuthority,
      executions: this.executionFacts(room),
      viewers: this.viewerFacts(room),
      room_seq: room.roomSeq,
    };
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function controlBuffer(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

/** Deterministic payload identity for idempotency comparison (no crypto needed). */
function stableHash(value: unknown): string {
  return JSON.stringify(value);
}

// Re-exported for the adapter's convenience (frame type constants).
export { FRAME_TYPE_CONTROL, FRAME_TYPE_VT_PATCH };
