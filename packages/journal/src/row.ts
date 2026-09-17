/**
 * Minimal command-class event row encoding for §7.1–7.3 foundation proofs.
 *
 * This is a pin-tree-adapted subset of contract §6.2(c): enough fields to
 * hash-chain, reconstruct, and bind an envelope digest. The full ratified
 * (c)/(d) row schemas from later main are deliberately NOT ported wholesale;
 * this foundation proves the stop-gate properties without rebasing onto
 * post-pin journal PRs.
 */

import {
  ABSENT,
  PRESENT,
  concatBytes,
  isCanonicalRecordedAt,
  isCanonicalSeq,
  isHex64,
  lpString,
  requireString,
  sha256Hex,
  stringField,
} from './bytes.js';

export const SPEC_ID_C_MIN = 'BRJ:c-min:1';
export const RECORD_CLASS_COMMAND = 'command';
export const COMMAND_ID_PREFIX = 'cmd_';

export const COMMAND_EVENT_TYPES = ['journaled', 'dispatched', 'completed', 'failed'] as const;
export type CommandEventType = (typeof COMMAND_EVENT_TYPES)[number];

export interface CommandEventRow {
  readonly recordClass: typeof RECORD_CLASS_COMMAND;
  readonly seq: string;
  readonly commandId: string;
  readonly eventType: CommandEventType;
  readonly actorId: string;
  readonly roleId: string;
  readonly envelopeDigest: string;
  readonly authorizationRef: string;
  readonly recordedAt: string;
  /** Canonical bytes of the normalized envelope, for reconstruction proofs. */
  readonly envelopeCanonicalHex?: string;
}

const TAG_RECORD_CLASS = 0x01;
const TAG_SEQ = 0x02;
const TAG_COMMAND_ID = 0x03;
const TAG_EVENT_TYPE = 0x04;
const TAG_ACTOR_ID = 0x05;
const TAG_ROLE_ID = 0x06;
const TAG_ENVELOPE_DIGEST = 0x07;
const TAG_AUTHORIZATION_REF = 0x08;
const TAG_RECORDED_AT = 0x09;
const TAG_ENVELOPE_CANONICAL = 0x0a;

function requireEventType(value: unknown): asserts value is CommandEventType {
  if (typeof value !== 'string' || !(COMMAND_EVENT_TYPES as readonly string[]).includes(value)) {
    throw new RangeError(`event_type must be one of ${COMMAND_EVENT_TYPES.join(',')}`);
  }
}

function validateRow(row: CommandEventRow): void {
  requireString('record_class', row.recordClass);
  requireString('seq', row.seq);
  requireString('command_id', row.commandId);
  requireEventType(row.eventType);
  requireString('actor_id', row.actorId);
  requireString('role_id', row.roleId);
  requireString('envelope_digest', row.envelopeDigest);
  requireString('authorization_ref', row.authorizationRef);
  requireString('recorded_at', row.recordedAt);
  if (row.recordClass !== RECORD_CLASS_COMMAND) {
    throw new RangeError(`record_class must be '${RECORD_CLASS_COMMAND}'`);
  }
  if (!isCanonicalSeq(row.seq)) {
    throw new RangeError(`seq must be canonical decimal >= 1: ${row.seq}`);
  }
  if (!row.commandId.startsWith(COMMAND_ID_PREFIX) || row.commandId.length <= COMMAND_ID_PREFIX.length) {
    throw new RangeError(`command_id must use ${COMMAND_ID_PREFIX} namespace`);
  }
  if (!isHex64(row.envelopeDigest)) {
    throw new RangeError('envelope_digest must be 64 lowercase hex characters');
  }
  if (!isCanonicalRecordedAt(row.recordedAt)) {
    throw new RangeError(`recorded_at must be canonical RFC3339 µs Z: ${row.recordedAt}`);
  }
  if (row.envelopeCanonicalHex !== undefined) {
    requireString('envelope_canonical_hex', row.envelopeCanonicalHex);
    if (!/^[0-9a-f]*$/.test(row.envelopeCanonicalHex) || row.envelopeCanonicalHex.length % 2 !== 0) {
      throw new RangeError('envelope_canonical_hex must be even-length lowercase hex');
    }
  }
}

/** Canonical byte sequence of a minimal command event row. */
export function encodeCommandEventRow(row: CommandEventRow): Uint8Array {
  validateRow(row);
  return concatBytes([
    lpString(SPEC_ID_C_MIN),
    stringField(TAG_RECORD_CLASS, row.recordClass),
    stringField(TAG_SEQ, row.seq),
    stringField(TAG_COMMAND_ID, row.commandId),
    stringField(TAG_EVENT_TYPE, row.eventType),
    stringField(TAG_ACTOR_ID, row.actorId),
    stringField(TAG_ROLE_ID, row.roleId),
    stringField(TAG_ENVELOPE_DIGEST, row.envelopeDigest),
    stringField(TAG_AUTHORIZATION_REF, row.authorizationRef),
    stringField(TAG_RECORDED_AT, row.recordedAt),
    stringField(TAG_ENVELOPE_CANONICAL, row.envelopeCanonicalHex),
  ]);
}

export function rowDigest(row: CommandEventRow): string {
  return sha256Hex(encodeCommandEventRow(row));
}

/** Encode presence of the optional envelope-canonical field for honesty tests. */
export function envelopeCanonicalPresenceByte(row: CommandEventRow): number {
  return row.envelopeCanonicalHex === undefined ? ABSENT : PRESENT;
}

export function hexOf(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

export function bytesOfHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]*$/.test(hex) || hex.length % 2 !== 0) {
    throw new RangeError('invalid hex');
  }
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

/** Tiny helper exported so tests can pin field-tag constants without magic numbers. */
export const ROW_FIELD_TAGS = {
  recordClass: TAG_RECORD_CLASS,
  seq: TAG_SEQ,
  commandId: TAG_COMMAND_ID,
  eventType: TAG_EVENT_TYPE,
  actorId: TAG_ACTOR_ID,
  roleId: TAG_ROLE_ID,
  envelopeDigest: TAG_ENVELOPE_DIGEST,
  authorizationRef: TAG_AUTHORIZATION_REF,
  recordedAt: TAG_RECORDED_AT,
  envelopeCanonical: TAG_ENVELOPE_CANONICAL,
} as const;

