/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/protocol/src/canonical-json.ts
 * Blob:   ae610e3022a8c5546667acfdf71e4cfced5a3542 (unpinned dependency, consumed under the Founder ruling of 2026-10-15)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/protocol/src/canonical-json.ts
// Canonical JSON serialization: recursively sorted keys, no whitespace.
// Used for deterministic hashing of events and task envelopes.

import { sha256Hex } from "./crypto.js";

export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot serialize non-finite number");
    return String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(serialize).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + serialize(obj[k])).join(",") + "}";
  }
  throw new Error(`Cannot serialize value of type ${typeof value}`);
}

export async function sha256Canonical(value: unknown): Promise<string> {
  const json = canonicalJson(value);
  return sha256Hex(json);
}

export function sha256CanonicalSync(value: unknown): string {
  const json = canonicalJson(value);
  return sha256Hex(json);
}