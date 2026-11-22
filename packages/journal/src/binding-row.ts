/**
 * Serialization contract (e) — the complete binding-class record row.
 *
 * Spec: `packages/journal/specs/serialization-e-binding-row.md`, version 1
 * (`BRJ:e:1`). The room binding, `runtime_room.bound`, is journaled as a
 * third record class on the one chain (contract §2 "Binding-class records",
 * §13 B1–B2). A binding record is a single event, terminal by
 * construction, with no state machine. Its element set is closed: the
 * event, the actor `system`, the three payload fields
 * FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING B2 fixes, the recorded
 * lifecycle state `BUILDING`, the `plan_hash` T5 bound, the
 * `lifecycle_event_ref`, and timestamps. Contract §2 elements 4, 8 and 9 do
 * not apply to the class, and element 1's `command_id` is a stored column
 * outside these bytes (§13 G4): the row type has no such fields, so the
 * encoder cannot emit them.
 *
 * Every field is required; the class has no optional field. The record
 * class is an explicit field in the canonical bytes, the first one encoded
 * (contract §6.2(e)). Cross-row rules — the binding's place next to the
 * first Builder command, one binding per lifecycle room and per runtime
 * room, every Builder command naming the binding — are `sequence.ts`'s
 * `bindingChainDefect`.
 */

import {
  concatBytes,
  isCanonicalRecordedAt,
  isCanonicalSeq,
  isHex64,
  lpString,
  pairField,
  requireString,
  stringField,
} from './bytes.js';
import type { LifecycleEventRef } from './event-row.js';
import { containsCredentialMaterial } from './redact.js';

export const SPEC_ID_E = 'BRJ:e:1';

export const RECORD_CLASS_BINDING = 'binding';

/** The one event of the class: lifecycle event 30, which triggers no transition (§13 B4). */
export const BINDING_EVENT = 'runtime_room.bound';

/** Always `system` (contract §2, §13 B2). */
export const BINDING_ACTOR = 'system';

/** The binding is recorded in `BUILDING` and leaves the room there (§13 B2, B4). */
export const BINDING_RECORDED_STATE = 'BUILDING';

/**
 * The command kind of a Builder command's normalized envelope, the way
 * `planner.invoke` is the Planner's (`packages/control-plane/src/planner-loop.ts`).
 * A Builder command is identified by this kind, never by `role_id`: rows
 * journaled with role `builder` under any other kind are not Builder
 * commands, and the binding rules (`bindingChainDefect`) do not read them.
 */
export const BUILDER_COMMAND_KIND = 'builder.invoke';

export interface BindingRecordRow {
  /** Canonical ASCII decimal, at least 1 — the one shared `seq` space. */
  readonly seq: string;
  readonly event: typeof BINDING_EVENT;
  readonly actorId: typeof BINDING_ACTOR;
  /** The Build Room lifecycle room: a canonical lowercase UUID. */
  readonly lifecycleRoomId: string;
  /** The Gateway's runtime room: `room-` followed by a canonical lowercase UUID. */
  readonly runtimeRoomId: string;
  /** The Gateway that minted the runtime room: a canonical lowercase UUID. */
  readonly gatewayId: string;
  readonly recordedState: typeof BINDING_RECORDED_STATE;
  /** 64 lowercase hex: the `plan_hash` T5 bound. Required. */
  readonly planHash: string;
  /** The `runtime_room.bound` entry: its room id is `lifecycleRoomId`. */
  readonly lifecycleEventRef: LifecycleEventRef;
  /** Canonical RFC 3339 UTC, six fractional digits, as spec (c) defines. */
  readonly recordedAt: string;
}

const TAG_RECORD_CLASS = 0x01;
const TAG_SEQ = 0x02;
const TAG_EVENT = 0x03;
const TAG_ACTOR_ID = 0x04;
const TAG_LIFECYCLE_ROOM_ID = 0x05;
const TAG_RUNTIME_ROOM_ID = 0x06;
const TAG_GATEWAY_ID = 0x07;
const TAG_RECORDED_STATE = 0x08;
const TAG_PLAN_HASH = 0x09;
const TAG_LIFECYCLE_EVENT_REF = 0x0a;
const TAG_RECORDED_AT = 0x0b;

/** Canonical lowercase UUID: 8-4-4-4-12 lowercase hex with literal dashes. */
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What the Gateway's room runtime mints: `room-` then a canonical lowercase UUID. */
const RUNTIME_ROOM_ID_PATTERN = /^room-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function validateRow(row: BindingRecordRow): void {
  requireString('seq', row.seq);
  requireString('event', row.event);
  requireString('actor_id', row.actorId);
  requireString('lifecycle_room_id', row.lifecycleRoomId);
  requireString('runtime_room_id', row.runtimeRoomId);
  requireString('gateway_id', row.gatewayId);
  requireString('recorded_state', row.recordedState);
  requireString('plan_hash', row.planHash);
  requireString('lifecycle_event_ref.room_id', row.lifecycleEventRef?.roomId);
  requireString('lifecycle_event_ref.event_id', row.lifecycleEventRef?.eventId);
  requireString('recorded_at', row.recordedAt);
  if (!isCanonicalSeq(row.seq)) {
    throw new RangeError(`seq is not canonical ASCII decimal >= 1: ${row.seq}`);
  }
  if (row.event !== BINDING_EVENT) {
    throw new RangeError(`not the binding event ${BINDING_EVENT}: ${row.event}`);
  }
  if (row.actorId !== BINDING_ACTOR) {
    throw new RangeError(`binding records carry actor ${BINDING_ACTOR}: ${row.actorId}`);
  }
  if (!CANONICAL_UUID_PATTERN.test(row.lifecycleRoomId)) {
    throw new RangeError(`lifecycle_room_id is not a canonical lowercase UUID: ${row.lifecycleRoomId}`);
  }
  if (!RUNTIME_ROOM_ID_PATTERN.test(row.runtimeRoomId)) {
    throw new RangeError(`runtime_room_id is not room- followed by a canonical lowercase UUID: ${row.runtimeRoomId}`);
  }
  if (!CANONICAL_UUID_PATTERN.test(row.gatewayId)) {
    throw new RangeError(`gateway_id is not a canonical lowercase UUID: ${row.gatewayId}`);
  }
  if (row.recordedState !== BINDING_RECORDED_STATE) {
    throw new RangeError(`a binding is recorded in ${BINDING_RECORDED_STATE}: ${row.recordedState}`);
  }
  if (!isHex64(row.planHash)) {
    throw new RangeError('plan_hash must be 64 lowercase hex characters');
  }
  if (row.lifecycleEventRef.roomId !== row.lifecycleRoomId) {
    throw new RangeError('lifecycle_event_ref.room_id must be the lifecycle_room_id: the binding names its own room\'s entry');
  }
  if (row.lifecycleEventRef.eventId.trim() === '') {
    throw new RangeError('lifecycle_event_ref must carry a non-empty event_id');
  }
  // The one caller-shaped string in the row: every other field is a fixed
  // constant or a closed format. Contract §6.1: credential material never
  // reaches a persisted row.
  if (containsCredentialMaterial([row.lifecycleEventRef.eventId])) {
    throw new RangeError('lifecycle_event_ref.event_id carries credential material (contract §6.1)');
  }
  if (!isCanonicalRecordedAt(row.recordedAt)) {
    throw new RangeError(
      `recorded_at is not the canonical RFC 3339 UTC microsecond form on a valid calendar date: ${row.recordedAt}`,
    );
  }
}

/** Canonical byte sequence of a binding-class record row, spec (e) v1. */
export function encodeBindingRecordRow(row: BindingRecordRow): Uint8Array {
  validateRow(row);
  return concatBytes([
    lpString(SPEC_ID_E),
    stringField(TAG_RECORD_CLASS, RECORD_CLASS_BINDING),
    stringField(TAG_SEQ, row.seq),
    stringField(TAG_EVENT, row.event),
    stringField(TAG_ACTOR_ID, row.actorId),
    stringField(TAG_LIFECYCLE_ROOM_ID, row.lifecycleRoomId),
    stringField(TAG_RUNTIME_ROOM_ID, row.runtimeRoomId),
    stringField(TAG_GATEWAY_ID, row.gatewayId),
    stringField(TAG_RECORDED_STATE, row.recordedState),
    stringField(TAG_PLAN_HASH, row.planHash),
    pairField(TAG_LIFECYCLE_EVENT_REF, {
      first: row.lifecycleEventRef.roomId,
      second: row.lifecycleEventRef.eventId,
    }),
    stringField(TAG_RECORDED_AT, row.recordedAt),
  ]);
}
