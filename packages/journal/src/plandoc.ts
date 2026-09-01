/**
 * Serialization contract (b) — the PlanDoc digest.
 *
 * Spec: `packages/journal/specs/serialization-b-plandoc.md`, version 1.
 * `plan_hash` = SHA-256 over `encodePlanDoc()`'s bytes (contract §6.2).
 *
 * Ruled 2026-09-01 (escalation 1 on the PR 2a derivation plan): this is a
 * schema-agnostic canonical document-tree encoding. The PlanDoc schema is
 * step-4 substance; when ratified it constrains which documents are valid
 * and never alters this encoding. An encoding change requires a new spec
 * version; golden vectors bind to versions (non-retroactivity).
 */

import { concatBytes, lpString, sha256Hex, u32be, utf8 } from './bytes.js';

export const SPEC_ID_B = 'BRJ:b:1';

/**
 * The value domain of the canonical document tree. Numbers are restricted to
 * safe integers: fractional or unsafe numeric values have no canonical byte
 * form and must be represented as strings by the document's schema.
 */
export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

export type CanonicalDocument = { readonly [key: string]: CanonicalValue };

const TYPE_NULL = 0x00;
const TYPE_FALSE = 0x01;
const TYPE_TRUE = 0x02;
const TYPE_INTEGER = 0x03;
const TYPE_STRING = 0x04;
const TYPE_ARRAY = 0x05;
const TYPE_OBJECT = 0x06;

function isPlainObject(value: unknown): value is { readonly [key: string]: CanonicalValue } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** UTF-8 byte order over keys — total, locale-independent, canonical. */
function compareKeyBytes(a: string, b: string): number {
  const ab = utf8(a);
  const bb = utf8(b);
  const shorter = Math.min(ab.length, bb.length);
  for (let i = 0; i < shorter; i += 1) {
    const diff = (ab[i] as number) - (bb[i] as number);
    if (diff !== 0) {
      return diff;
    }
  }
  return ab.length - bb.length;
}

function encodeValue(value: CanonicalValue, path: string): Uint8Array {
  if (value === null) {
    return Uint8Array.of(TYPE_NULL);
  }
  if (value === false) {
    return Uint8Array.of(TYPE_FALSE);
  }
  if (value === true) {
    return Uint8Array.of(TYPE_TRUE);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`non-integer number has no canonical form at ${path}`);
    }
    if (Object.is(value, -0)) {
      throw new RangeError(`negative zero has no canonical form at ${path}`);
    }
    return concatBytes([Uint8Array.of(TYPE_INTEGER), lpString(String(value))]);
  }
  if (typeof value === 'string') {
    return concatBytes([Uint8Array.of(TYPE_STRING), lpString(value)]);
  }
  if (Array.isArray(value)) {
    return concatBytes([
      Uint8Array.of(TYPE_ARRAY),
      u32be(value.length),
      ...value.map((element, i) => encodeValue(element, `${path}[${i}]`)),
    ]);
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort(compareKeyBytes);
    return concatBytes([
      Uint8Array.of(TYPE_OBJECT),
      u32be(keys.length),
      ...keys.flatMap((key) => [
        lpString(key),
        encodeValue(value[key] as CanonicalValue, `${path}.${key}`),
      ]),
    ]);
  }
  throw new RangeError(`value has no canonical form at ${path}`);
}

/** Canonical byte sequence of a PlanDoc, spec (b) v1. The root is an object. */
export function encodePlanDoc(document: CanonicalDocument): Uint8Array {
  if (!isPlainObject(document)) {
    throw new RangeError('PlanDoc root must be a plain object');
  }
  return concatBytes([lpString(SPEC_ID_B), encodeValue(document, '$')]);
}

/** `plan_hash`: SHA-256 hex over the canonical PlanDoc bytes. */
export function planHash(document: CanonicalDocument): string {
  return sha256Hex(encodePlanDoc(document));
}
