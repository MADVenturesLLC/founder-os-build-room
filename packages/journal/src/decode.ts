/**
 * Decoders for the canonical journal rows — the read side of specs (a),
 * (c) and (d).
 *
 * `verify()` and reconstruction work from the persisted `row_bytes` alone
 * (contract §4.1: "reconstruction replays events in `seq` order"; §1.4: the
 * journal is "independently reconstructable as command history from its own
 * rows"), so the bytes must be readable back into rows.
 *
 * Every decoder is strict and closes with a round trip: the decoded row is
 * re-encoded by the one encoder, and the result must equal the input byte
 * for byte. That one check carries every rule the encoders enforce (field
 * legality per event type, canonical `seq` and `recorded_at`, the envelope
 * digest, the `plan_hash` derivation) without restating any of them here,
 * and it refuses any byte sequence that is not the canonical spelling of
 * its row: a decoder that accepted a second spelling would let two byte
 * strings name one row.
 */

import { ABSENT, PRESENT } from './bytes.js';
import { SPEC_ID_A, encodeEnvelope, type NormalizedCommandEnvelope } from './envelope.js';
import {
  RECORD_CLASS_COMMAND,
  SPEC_ID_C,
  encodeCommandEventRow,
  type CommandEventRow,
  type LifecycleEventRef,
} from './event-row.js';
import {
  RECORD_CLASS_DECISION,
  SPEC_ID_D,
  encodeDecisionRecordRow,
  type DecisionRecordRow,
} from './decision-row.js';

/** The bytes are not a canonical row of the spec they name. */
export class JournalDecodeError extends Error {
  override readonly name = 'JournalDecodeError';
  constructor(message: string) {
    super(message);
  }
}

class Reader {
  private offset = 0;
  private static readonly decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

  constructor(private readonly bytes: Uint8Array) {}

  private take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) {
      throw new JournalDecodeError(`truncated at byte ${this.offset}: ${length} more needed`);
    }
    const out = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  private u8(): number {
    return this.take(1)[0] as number;
  }

  private u32(): number {
    const b = this.take(4);
    return (((b[0] as number) << 24) >>> 0) + ((b[1] as number) << 16) + ((b[2] as number) << 8) + (b[3] as number);
  }

  lpBytes(): Uint8Array {
    return this.take(this.u32());
  }

  lpString(): string {
    try {
      return Reader.decoder.decode(this.lpBytes());
    } catch (error) {
      if (error instanceof JournalDecodeError) throw error;
      throw new JournalDecodeError('a string field is not valid UTF-8');
    }
  }

  private presence(tag: number): boolean {
    const seen = this.u8();
    if (seen !== tag) {
      throw new JournalDecodeError(`expected field tag 0x${tag.toString(16)}, found 0x${seen.toString(16)}`);
    }
    const flag = this.u8();
    if (flag === PRESENT) return true;
    if (flag === ABSENT) return false;
    throw new JournalDecodeError(`field 0x${tag.toString(16)} has presence byte 0x${flag.toString(16)}`);
  }

  optionalString(tag: number): string | undefined {
    return this.presence(tag) ? this.lpString() : undefined;
  }

  requiredString(tag: number): string {
    const value = this.optionalString(tag);
    if (value === undefined) throw new JournalDecodeError(`required field 0x${tag.toString(16)} is absent`);
    return value;
  }

  optionalBytes(tag: number): Uint8Array | undefined {
    return this.presence(tag) ? this.lpBytes() : undefined;
  }

  optionalPair(tag: number): LifecycleEventRef | undefined {
    if (!this.presence(tag)) return undefined;
    return { roomId: this.lpString(), eventId: this.lpString() };
  }

  requiredArray(tag: number): string[] {
    if (!this.presence(tag)) throw new JournalDecodeError(`array field 0x${tag.toString(16)} is absent`);
    const count = this.u32();
    const out: string[] = [];
    for (let i = 0; i < count; i += 1) out.push(this.lpString());
    return out;
  }

  end(): void {
    if (this.offset !== this.bytes.length) {
      throw new JournalDecodeError(`${this.bytes.length - this.offset} trailing bytes after the row`);
    }
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Re-encode and compare; any encoder refusal or byte difference is a decode failure. */
function roundTrip<T>(bytes: Uint8Array, row: T, encode: (row: T) => Uint8Array, spec: string): T {
  let again: Uint8Array;
  try {
    again = encode(row);
  } catch (error) {
    throw new JournalDecodeError(`${spec}: the decoded row is not valid (${(error as Error).message})`);
  }
  if (!sameBytes(again, bytes)) {
    throw new JournalDecodeError(`${spec}: the bytes are not the canonical spelling of their row`);
  }
  return row;
}

/** Drop absent optional keys, so a decoded row has exactly the fields its bytes carry. */
function compact<T extends object>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)) as T;
}

function readSpec(reader: Reader, expected: string): void {
  const spec = reader.lpString();
  if (spec !== expected) throw new JournalDecodeError(`expected spec ${expected}, found ${JSON.stringify(spec)}`);
}

/** Spec (a) v1. */
export function decodeEnvelope(bytes: Uint8Array): NormalizedCommandEnvelope {
  const r = new Reader(bytes);
  readSpec(r, SPEC_ID_A);
  const envelope = compact<NormalizedCommandEnvelope>({
    envelopeVersion: r.requiredString(0x01),
    commandKind: r.requiredString(0x02),
    argv: r.requiredArray(0x03),
    targetRepository: r.optionalString(0x04),
    scopeRef: r.optionalString(0x05),
  });
  r.end();
  return roundTrip(bytes, envelope, encodeEnvelope, SPEC_ID_A);
}

/** Spec (c) v1. */
export function decodeCommandEventRow(bytes: Uint8Array): CommandEventRow {
  const r = new Reader(bytes);
  readSpec(r, SPEC_ID_C);
  const recordClass = r.requiredString(0x01);
  if (recordClass !== RECORD_CLASS_COMMAND) {
    throw new JournalDecodeError(`${SPEC_ID_C} carries record class ${RECORD_CLASS_COMMAND}, found ${JSON.stringify(recordClass)}`);
  }
  const seq = r.requiredString(0x02);
  const eventType = r.requiredString(0x03);
  const commandId = r.requiredString(0x04);
  const roomId = r.optionalString(0x05);
  const runId = r.optionalString(0x06);
  const executionId = r.optionalString(0x07);
  const actorId = r.optionalString(0x08);
  const roleId = r.optionalString(0x09);
  const repository = r.optionalString(0x0a);
  const scopeRef = r.optionalString(0x0b);
  const envelopeBytes = r.optionalBytes(0x0c);
  const envelopeDigest = r.optionalString(0x0d);
  const authorizationRef = r.optionalString(0x0e);
  const intendedProvider = r.optionalString(0x0f);
  const intendedModel = r.optionalString(0x10);
  const intendedSurface = r.optionalString(0x11);
  const provider = r.optionalString(0x12);
  const model = r.optionalString(0x13);
  const executionSurface = r.optionalString(0x14);
  const failureClassification = r.optionalString(0x15);
  const resolutionDetermination = r.optionalString(0x16);
  const resolutionSemantics = r.optionalString(0x17);
  const lifecycleEventRef = r.optionalPair(0x18);
  const evidenceRefs = r.requiredArray(0x19);
  const recordedAt = r.requiredString(0x1a);
  r.end();
  const row = compact({
    seq,
    eventType,
    commandId,
    roomId,
    runId,
    executionId,
    actorId,
    roleId,
    repository,
    scopeRef,
    commandEnvelope: envelopeBytes === undefined ? undefined : decodeEnvelope(envelopeBytes),
    envelopeDigest,
    authorizationRef,
    intendedProvider,
    intendedModel,
    intendedSurface,
    provider,
    model,
    executionSurface,
    failureClassification,
    resolutionDetermination,
    resolutionSemantics,
    lifecycleEventRef,
    evidenceRefs,
    recordedAt,
  }) as unknown as CommandEventRow;
  return roundTrip(bytes, row, encodeCommandEventRow, SPEC_ID_C);
}

/** Spec (d) v1. */
export function decodeDecisionRecordRow(bytes: Uint8Array): DecisionRecordRow {
  const r = new Reader(bytes);
  readSpec(r, SPEC_ID_D);
  const recordClass = r.requiredString(0x01);
  if (recordClass !== RECORD_CLASS_DECISION) {
    throw new JournalDecodeError(`${SPEC_ID_D} carries record class ${RECORD_CLASS_DECISION}, found ${JSON.stringify(recordClass)}`);
  }
  const seq = r.requiredString(0x02);
  const decision = r.requiredString(0x03);
  const actorId = r.requiredString(0x04);
  const recordedState = r.requiredString(0x05);
  const priorState = r.optionalString(0x06);
  const planHash = r.optionalString(0x07);
  const authorizationRef = r.requiredString(0x08);
  const lifecycleEventRef = r.optionalPair(0x09);
  const recordedAt = r.requiredString(0x0a);
  r.end();
  if (lifecycleEventRef === undefined) throw new JournalDecodeError(`${SPEC_ID_D}: lifecycle_event_ref is required`);
  const row = compact({
    seq,
    decision,
    actorId,
    recordedState,
    priorState,
    planHash,
    authorizationRef,
    lifecycleEventRef,
    recordedAt,
  }) as unknown as DecisionRecordRow;
  return roundTrip(bytes, row, encodeDecisionRecordRow, SPEC_ID_D);
}

export type DecodedJournalRow =
  | { readonly recordClass: typeof RECORD_CLASS_COMMAND; readonly row: CommandEventRow }
  | { readonly recordClass: typeof RECORD_CLASS_DECISION; readonly row: DecisionRecordRow };

/** Either class, chosen by the spec id the bytes open with — never by which fields are absent (contract §2). */
export function decodeJournalRow(bytes: Uint8Array): DecodedJournalRow {
  const spec = new Reader(bytes).lpString();
  if (spec === SPEC_ID_C) return { recordClass: RECORD_CLASS_COMMAND, row: decodeCommandEventRow(bytes) };
  if (spec === SPEC_ID_D) return { recordClass: RECORD_CLASS_DECISION, row: decodeDecisionRecordRow(bytes) };
  throw new JournalDecodeError(`not a journal row spec: ${JSON.stringify(spec)}`);
}
