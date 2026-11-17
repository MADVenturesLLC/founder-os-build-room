/**
 * The runtime-room wire shapes (FOUNDER-ACT-20261117-BR-PHASE5-STEP1 B2, for
 * B5 and C1 of FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING): what the
 * control plane hands an enrolled Gateway in a `planner_poll` answer, as its
 * `room` member, and what the Gateway answers with in the payloads of its two
 * signed room reports.
 *
 *   - `RoomRequestWire` asks the Gateway to mint a runtime room for a named
 *     lifecycle room. It is carried by the poll answer as planner work is
 *     carried today; it is not a purpose and nothing signs it.
 *   - `RuntimeRoomMintedPayload` is the `runtime_room_minted` report: the
 *     runtime room the Gateway minted for that request, and its occupancy.
 *   - `RuntimeRoomOccupancyPayload` is the `runtime_room_occupancy` report:
 *     a minted runtime room's occupancy as the Gateway holds it now.
 *
 * Both sides validate against this one implementation. Validation refuses
 * unknown members and any value outside its format, and returns `null` for
 * anything else, so a value that passes is exactly one of the shapes below.
 * Nothing is coerced, trimmed or lowercased.
 *
 * Formats: a lifecycle room id and a request id are canonical lowercase
 * UUIDs; a runtime room id is `room-` and a canonical lowercase UUID, which
 * is what the Gateway's room runtime mints (`RoomRuntime.createRoom`);
 * occupancy is one of IPC v2's `OCCUPANCY_STATES`, reused, not widened.
 */

import { MAX_ROOM_PAYLOAD_BYTES } from './constants.js';
import { isCanonicalUuid } from './encoding.js';
import { OCCUPANCY_STATES, type OccupancyState } from './ipc-v2.js';

/** The prefix the Gateway's room runtime puts before the UUID it mints. */
export const RUNTIME_ROOM_ID_PREFIX = 'room-';

/** The control plane asks the Gateway to mint a runtime room for this lifecycle room. */
export interface RoomRequestWire {
  readonly kind: 'mint';
  readonly requestId: string;
  readonly lifecycleRoomId: string;
}

/** The Gateway minted `runtimeRoomId` for the request; its occupancy as minted. */
export interface RuntimeRoomMintedPayload {
  readonly requestId: string;
  readonly lifecycleRoomId: string;
  readonly runtimeRoomId: string;
  readonly occupancy: OccupancyState;
}

/** A runtime room the Gateway minted for `lifecycleRoomId`, and its occupancy now. */
export interface RuntimeRoomOccupancyPayload {
  readonly lifecycleRoomId: string;
  readonly runtimeRoomId: string;
  readonly occupancy: OccupancyState;
}

export function isValidLifecycleRoomId(value: unknown): value is string {
  return typeof value === 'string' && isCanonicalUuid(value);
}

export function isValidRuntimeRoomId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(RUNTIME_ROOM_ID_PREFIX) &&
    isCanonicalUuid(value.slice(RUNTIME_ROOM_ID_PREFIX.length))
  );
}

export function isOccupancyState(value: unknown): value is OccupancyState {
  return (OCCUPANCY_STATES as readonly unknown[]).includes(value);
}

/** A room report's payload text: non-empty, within `MAX_ROOM_PAYLOAD_BYTES` UTF-8 bytes. */
export function isValidRoomPayload(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  return new TextEncoder().encode(value).length <= MAX_ROOM_PAYLOAD_BYTES;
}

/* ---- validation ------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Exactly these own keys: none missing, none extra. */
function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(record);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

/** A `room` member of a poll answer as the Gateway reads it, or `null`. */
export function validateRoomRequest(value: unknown): RoomRequestWire | null {
  const record = asRecord(value);
  if (record === null || record['kind'] !== 'mint') return null;
  if (!exactKeys(record, ['kind', 'requestId', 'lifecycleRoomId'])) return null;
  if (typeof record['requestId'] !== 'string' || !isCanonicalUuid(record['requestId'])) return null;
  if (!isValidLifecycleRoomId(record['lifecycleRoomId'])) return null;
  return record as unknown as RoomRequestWire;
}

/** A `runtime_room_minted` payload as the control plane reads it, after its digest and signature hold, or `null`. */
export function validateRuntimeRoomMintedPayload(value: unknown): RuntimeRoomMintedPayload | null {
  const record = asRecord(value);
  if (record === null || !exactKeys(record, ['requestId', 'lifecycleRoomId', 'runtimeRoomId', 'occupancy'])) {
    return null;
  }
  if (typeof record['requestId'] !== 'string' || !isCanonicalUuid(record['requestId'])) return null;
  if (!isValidLifecycleRoomId(record['lifecycleRoomId'])) return null;
  if (!isValidRuntimeRoomId(record['runtimeRoomId'])) return null;
  if (!isOccupancyState(record['occupancy'])) return null;
  return record as unknown as RuntimeRoomMintedPayload;
}

/** A `runtime_room_occupancy` payload as the control plane reads it, after its digest and signature hold, or `null`. */
export function validateRuntimeRoomOccupancyPayload(value: unknown): RuntimeRoomOccupancyPayload | null {
  const record = asRecord(value);
  if (record === null || !exactKeys(record, ['lifecycleRoomId', 'runtimeRoomId', 'occupancy'])) return null;
  if (!isValidLifecycleRoomId(record['lifecycleRoomId'])) return null;
  if (!isValidRuntimeRoomId(record['runtimeRoomId'])) return null;
  if (!isOccupancyState(record['occupancy'])) return null;
  return record as unknown as RuntimeRoomOccupancyPayload;
}
