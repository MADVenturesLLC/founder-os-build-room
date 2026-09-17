/**
 * Shared canonical byte grammar for the four §6.2 serialization contracts.
 *
 * PURE: zero I/O beyond `node:crypto` hashing. Every canonical form built on
 * these primitives is injective by construction: values are length-prefixed,
 * field presence is a dedicated byte (never a sentinel value), and collection
 * counts are explicit. Two conforming implementations of the published specs
 * must reproduce these bytes exactly (contract §6.2).
 */

import { createHash } from 'node:crypto';

export const PRESENT = 0x01;
export const ABSENT = 0x00;

const U32_MAX = 0xffffffff;

/** 4-byte big-endian unsigned integer. */
export function u32be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > U32_MAX) {
    throw new RangeError(`u32be out of range: ${String(value)}`);
  }
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

/**
 * UTF-8 bytes of a well-formed Unicode string. A string containing a lone
 * UTF-16 surrogate is rejected before encoding: TextEncoder replaces every
 * unpaired surrogate with U+FFFD, so two distinct malformed inputs would
 * otherwise collapse to identical bytes and share one digest — injectivity
 * broken. This is the shared choke point: every canonical string in every
 * spec passes through here, so no encoder can bypass the check.
 */
export function utf8(value: string): Uint8Array {
  if (typeof value !== 'string') {
    throw new RangeError(`only a string has canonical UTF-8 bytes, got ${typeof value}`);
  }
  if (!value.isWellFormed()) {
    throw new RangeError('string is not well-formed Unicode: a lone surrogate has no canonical form');
  }
  return new TextEncoder().encode(value);
}

/** Typed runtime guard for a required string field a plain-JS caller could omit or mistype. */
export function requireString(field: string, value: unknown): asserts value is string {
  if (typeof value !== 'string') {
    throw new RangeError(`${field} must be a string, got ${value === null ? 'null' : typeof value}`);
  }
}

/** Typed runtime guard for an optional string field: absent is fine, mistyped is not. */
export function requireOptionalString(field: string, value: unknown): asserts value is string | undefined {
  if (value !== undefined) {
    requireString(field, value);
  }
}

/** Typed runtime guard for a required array-of-strings field. */
export function requireStringArray(field: string, value: unknown): asserts value is readonly string[] {
  if (!Array.isArray(value)) {
    throw new RangeError(
      `${field} must be an array of strings, got ${value === null ? 'null' : typeof value}`,
    );
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new RangeError(`${field} entries must be strings, got ${item === null ? 'null' : typeof item}`);
    }
  }
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Length-prefixed raw bytes: u32be(byte length) then the bytes. */
export function lpBytes(value: Uint8Array): Uint8Array {
  return concatBytes([u32be(value.length), value]);
}

/** Length-prefixed UTF-8 string. */
export function lpString(value: string): Uint8Array {
  return lpBytes(utf8(value));
}

/** A field carrying a required or optionally-present UTF-8 string value. */
export function stringField(tag: number, value: string | undefined): Uint8Array {
  if (value === undefined) {
    return Uint8Array.of(tag, ABSENT);
  }
  return concatBytes([Uint8Array.of(tag, PRESENT), lpString(value)]);
}

/** A field carrying pre-encoded canonical bytes (nested canonical forms). */
export function bytesField(tag: number, value: Uint8Array | undefined): Uint8Array {
  if (value === undefined) {
    return Uint8Array.of(tag, ABSENT);
  }
  return concatBytes([Uint8Array.of(tag, PRESENT), lpBytes(value)]);
}

/**
 * A field carrying an ordered string collection. Order is the recorded order
 * and is never re-sorted (contract §6.2: `evidence_refs` hashed in recorded
 * order). An empty collection is present with count 0. No current spec has
 * an optional array field, so a missing array is a caller error, not an
 * absence — the absent branch that once lived here let an omitted required
 * array silently produce non-conforming bytes (CodeRabbit Major at 4450f02).
 */
export function arrayField(tag: number, values: readonly string[]): Uint8Array {
  requireStringArray('array field', values);
  return concatBytes([
    Uint8Array.of(tag, PRESENT),
    u32be(values.length),
    ...values.map((v) => lpString(v)),
  ]);
}

/** A field carrying an ordered two-string composite (`room_id`, `event_id`). */
export function pairField(
  tag: number,
  value: { readonly first: string; readonly second: string } | undefined,
): Uint8Array {
  if (value === undefined) {
    return Uint8Array.of(tag, ABSENT);
  }
  return concatBytes([Uint8Array.of(tag, PRESENT), lpString(value.first), lpString(value.second)]);
}

/** SHA-256 as 64-character lowercase hexadecimal, no prefix (contract §6.2). */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export const HEX64_PATTERN = /^[0-9a-f]{64}$/;

export function isHex64(value: string): boolean {
  return HEX64_PATTERN.test(value);
}

/** Canonical `seq`: ASCII decimal, no leading zeros, at least 1. */
export const SEQ_PATTERN = /^[1-9][0-9]*$/;

export function isCanonicalSeq(value: string): boolean {
  return SEQ_PATTERN.test(value);
}

/**
 * Canonical `recorded_at`: RFC 3339 UTC with exactly six fractional digits
 * (microseconds), the literal `Z` designator, and a calendar-valid date —
 * the day must exist in that month and year under the Gregorian leap-year
 * rule, checked explicitly rather than through `Date`, whose parsers may
 * normalize an impossible date to a different day. A calendar-invalid
 * timestamp has no canonical form. The 2b store must reproduce this form
 * byte-identically (named 2b obligation, ruled 2026-09-01).
 */
export const RECORDED_AT_PATTERN =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6}Z$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function isCanonicalRecordedAt(value: string): boolean {
  if (!RECORDED_AT_PATTERN.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const maxDay = month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] as number);
  return day <= maxDay;
}
