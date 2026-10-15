/**
 * Transport envelopes and their field validation.
 *
 * The receiver never trusts client-supplied canonical bytes (contract §3). It
 * parses the transport JSON, validates every field here, and only then rebuilds
 * the signed bytes through the same builder the sender used. That ordering is
 * the whole point: by the time `canonicalBytes` runs, every element it puts
 * into the array has already been proved to be one of the validated strings or
 * integers, so no float, object, null, or non-canonical string can reach the
 * serializer.
 *
 * Unknown fields are refused. The envelope is a fixed, minimum-necessary shape
 * with exactly one producer in this system, so an unexpected member is a
 * defect or a probe, and neither should be quietly accepted.
 */

import {
  HEX32_LENGTH,
  MAX_PLANNER_PAYLOAD_BYTES,
  MIN_GENERATION,
  MIN_SEQUENCE,
  MAX_SEQUENCE,
  PROTOCOL_ID,
  PUBKEY_BASE64_LENGTH,
  PUBKEY_BYTE_LENGTH,
  SIGNATURE_BASE64_LENGTH,
  SIGNATURE_BYTE_LENGTH,
  VERSION,
  isPurpose,
  type Purpose,
} from './constants.js';
import { decodeBase64Fixed, isCanonicalUuid, isLowercaseHex } from './encoding.js';

export interface SessionStartEnvelope {
  readonly protocol: string;
  readonly version: number;
  readonly purpose: 'session_start';
  readonly gatewayId: string;
  readonly keyId: string;
  readonly generation: number;
  readonly challenge: string;
  readonly nonce: string;
  readonly timestampMs: number;
  readonly pubkey: string;
  readonly signature: string;
}

export interface HeartbeatEnvelope {
  readonly protocol: string;
  readonly version: number;
  readonly purpose: 'heartbeat';
  readonly gatewayId: string;
  readonly keyId: string;
  readonly epoch: string;
  readonly sequence: number;
  readonly nonce: string;
  readonly timestampMs: number;
  readonly pubkey: string;
  readonly signature: string;
}

/** The Gateway asks for its next planner request. Session-bound, like a heartbeat. */
export interface PlannerPollEnvelope {
  readonly protocol: string;
  readonly version: number;
  readonly purpose: 'planner_poll';
  readonly gatewayId: string;
  readonly keyId: string;
  readonly epoch: string;
  readonly sequence: number;
  readonly nonce: string;
  readonly timestampMs: number;
  readonly pubkey: string;
  readonly signature: string;
}

/**
 * The Gateway answers one planner request. `payload` is a JSON text carried
 * outside the signed array; its SHA-256, `payloadDigest`, is inside it. The
 * receiver recomputes the digest over the exact text it received and parses
 * the text only after the signature and digest both hold, so there is no
 * JSON canonicalization for a signature to depend on.
 */
export interface PlannerReportEnvelope {
  readonly protocol: string;
  readonly version: number;
  readonly purpose: 'planner_report';
  readonly gatewayId: string;
  readonly keyId: string;
  readonly epoch: string;
  readonly sequence: number;
  readonly nonce: string;
  readonly timestampMs: number;
  readonly requestId: string;
  readonly payloadDigest: string;
  readonly payload: string;
  readonly pubkey: string;
  readonly signature: string;
}

export type Envelope = SessionStartEnvelope | HeartbeatEnvelope | PlannerPollEnvelope | PlannerReportEnvelope;

/**
 * The two structured refusals this module can produce, both members of the
 * closed server response vocabulary (contract §14). `unknown_key` and
 * `bad_signature` are server-side verdicts and are never decided here.
 */
export type EnvelopeErrorCode = 'invalid_request' | 'purpose_mismatch';

export type EnvelopeResult<T> =
  | { readonly ok: true; readonly envelope: T }
  | { readonly ok: false; readonly error: EnvelopeErrorCode; readonly detail: string };

const SESSION_START_FIELDS = [
  'protocol',
  'version',
  'purpose',
  'gatewayId',
  'keyId',
  'generation',
  'challenge',
  'nonce',
  'timestampMs',
  'pubkey',
  'signature',
] as const;

const HEARTBEAT_FIELDS = [
  'protocol',
  'version',
  'purpose',
  'gatewayId',
  'keyId',
  'epoch',
  'sequence',
  'nonce',
  'timestampMs',
  'pubkey',
  'signature',
] as const;

const PLANNER_POLL_FIELDS = HEARTBEAT_FIELDS;

const PLANNER_REPORT_FIELDS = [
  'protocol',
  'version',
  'purpose',
  'gatewayId',
  'keyId',
  'epoch',
  'sequence',
  'nonce',
  'timestampMs',
  'requestId',
  'payloadDigest',
  'payload',
  'pubkey',
  'signature',
] as const;

function fail<T>(error: EnvelopeErrorCode, detail: string): EnvelopeResult<T> {
  return { ok: false, error, detail };
}

/** A JSON integer, not merely a number that rounds to one. */
export function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function isValidGatewayId(value: unknown): value is string {
  return typeof value === 'string' && isCanonicalUuid(value);
}

export function isValidKeyId(value: unknown): value is string {
  return typeof value === 'string' && isLowercaseHex(value, HEX32_LENGTH);
}

export function isValidHex32(value: unknown): value is string {
  return typeof value === 'string' && isLowercaseHex(value, HEX32_LENGTH);
}

export function isValidGeneration(value: unknown): value is number {
  return isSafeInteger(value) && value >= MIN_GENERATION;
}

export function isValidSequence(value: unknown): value is number {
  return isSafeInteger(value) && value >= MIN_SEQUENCE && value <= MAX_SEQUENCE;
}

export function isValidTimestampMs(value: unknown): value is number {
  return isSafeInteger(value);
}

/** A planner request id: a canonical lowercase UUID the control plane minted. */
export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && isCanonicalUuid(value);
}

/** A report payload: a non-empty string within `MAX_PLANNER_PAYLOAD_BYTES` UTF-8 bytes. */
export function isValidPlannerPayload(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  return new TextEncoder().encode(value).length <= MAX_PLANNER_PAYLOAD_BYTES;
}

/** Decode a transport pubkey, or `null` when it is not exactly 32 canonical bytes. */
export function decodeTransportPubkey(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || value.length !== PUBKEY_BASE64_LENGTH) return null;
  return decodeBase64Fixed(value, PUBKEY_BYTE_LENGTH);
}

/** Decode a transport signature, or `null` when it is not exactly 64 canonical bytes. */
export function decodeTransportSignature(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || value.length !== SIGNATURE_BASE64_LENGTH) return null;
  return decodeBase64Fixed(value, SIGNATURE_BYTE_LENGTH);
}

function checkShared(
  body: Record<string, unknown>,
  allowed: readonly string[],
  expected: Purpose,
): { readonly error: EnvelopeErrorCode; readonly detail: string } | null {
  /*
   * Protocol, version and purpose are settled FIRST, before the field set is
   * examined at all. A cross-purpose replay carries the other purpose's fields
   * by construction, so a field-set check that ran first would classify it
   * `invalid_request` on the foreign member and the mismatch would never be
   * reported. The envelope has to be asked what it claims to be before it can
   * be told its shape is wrong.
   */
  if (body['protocol'] !== PROTOCOL_ID) return { error: 'invalid_request', detail: 'protocol' };
  if (body['version'] !== VERSION) return { error: 'invalid_request', detail: 'version' };

  const purpose = body['purpose'];
  if (!isPurpose(purpose)) return { error: 'invalid_request', detail: 'purpose' };
  if (purpose !== expected) {
    return { error: 'purpose_mismatch', detail: `expected ${expected}, presented ${purpose}` };
  }

  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) return { error: 'invalid_request', detail: `unknown field ${key}` };
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) {
      return { error: 'invalid_request', detail: `missing field ${key}` };
    }
  }

  if (!isValidGatewayId(body['gatewayId'])) return { error: 'invalid_request', detail: 'gatewayId' };
  if (!isValidKeyId(body['keyId'])) return { error: 'invalid_request', detail: 'keyId' };
  if (!isValidHex32(body['nonce'])) return { error: 'invalid_request', detail: 'nonce' };
  if (!isValidTimestampMs(body['timestampMs'])) {
    return { error: 'invalid_request', detail: 'timestampMs' };
  }
  if (decodeTransportPubkey(body['pubkey']) === null) {
    return { error: 'invalid_request', detail: 'pubkey' };
  }
  if (decodeTransportSignature(body['signature']) === null) {
    return { error: 'invalid_request', detail: 'signature' };
  }
  return null;
}

function asObject(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

export function validateSessionStart(body: unknown): EnvelopeResult<SessionStartEnvelope> {
  const candidate = asObject(body);
  if (candidate === null) return fail('invalid_request', 'body must be a JSON object');

  const shared = checkShared(candidate, SESSION_START_FIELDS, 'session_start');
  if (shared !== null) return fail(shared.error, shared.detail);

  if (!isValidGeneration(candidate['generation'])) return fail('invalid_request', 'generation');
  if (!isValidHex32(candidate['challenge'])) return fail('invalid_request', 'challenge');

  return { ok: true, envelope: candidate as unknown as SessionStartEnvelope };
}

export function validateHeartbeat(body: unknown): EnvelopeResult<HeartbeatEnvelope> {
  const candidate = asObject(body);
  if (candidate === null) return fail('invalid_request', 'body must be a JSON object');

  const shared = checkShared(candidate, HEARTBEAT_FIELDS, 'heartbeat');
  if (shared !== null) return fail(shared.error, shared.detail);

  if (!isValidHex32(candidate['epoch'])) return fail('invalid_request', 'epoch');
  if (!isValidSequence(candidate['sequence'])) return fail('invalid_request', 'sequence');

  return { ok: true, envelope: candidate as unknown as HeartbeatEnvelope };
}

/** The checks every session-bound envelope shares; the purpose's own members follow. */
function validateSessionBound(
  body: unknown,
  fields: readonly string[],
  purpose: 'planner_poll' | 'planner_report',
):
  | { readonly ok: true; readonly candidate: Record<string, unknown> }
  | { readonly ok: false; readonly error: EnvelopeErrorCode; readonly detail: string } {
  const candidate = asObject(body);
  if (candidate === null) return { ok: false, error: 'invalid_request', detail: 'body must be a JSON object' };

  const shared = checkShared(candidate, fields, purpose);
  if (shared !== null) return { ok: false, ...shared };

  if (!isValidHex32(candidate['epoch'])) return { ok: false, error: 'invalid_request', detail: 'epoch' };
  if (!isValidSequence(candidate['sequence'])) return { ok: false, error: 'invalid_request', detail: 'sequence' };
  return { ok: true, candidate };
}

export function validatePlannerPoll(body: unknown): EnvelopeResult<PlannerPollEnvelope> {
  const checked = validateSessionBound(body, PLANNER_POLL_FIELDS, 'planner_poll');
  if (!checked.ok) return checked;
  return { ok: true, envelope: checked.candidate as unknown as PlannerPollEnvelope };
}

export function validatePlannerReport(body: unknown): EnvelopeResult<PlannerReportEnvelope> {
  const checked = validateSessionBound(body, PLANNER_REPORT_FIELDS, 'planner_report');
  if (!checked.ok) return checked;
  const candidate = checked.candidate;
  if (!isValidRequestId(candidate['requestId'])) return fail('invalid_request', 'requestId');
  if (!isValidHex32(candidate['payloadDigest'])) return fail('invalid_request', 'payloadDigest');
  if (!isValidPlannerPayload(candidate['payload'])) return fail('invalid_request', 'payload');
  return { ok: true, envelope: candidate as unknown as PlannerReportEnvelope };
}
