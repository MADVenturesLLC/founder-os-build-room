/**
 * The redactor — turns registered secrets into stable, one-way tokens.
 *
 * Modes (act, Lane B): `replace` is one-way and deterministic — the token is
 * `[REDACTED:<name>:<hmac16>]` where `hmac16` is the first 16 hex characters
 * of HMAC-SHA256(key, value). Same key + same value → same token, across
 * processes and across sinks, so a redacted journal can still be correlated
 * with a redacted evidence bundle. Without the key the token reveals nothing
 * about the value; with the key it still cannot be inverted, only confirmed.
 *
 * `obfuscate` (reversible) is DECLARED in the mode type and NOT WIRED in this
 * lane: constructing a redactor in that mode throws. Declaring it keeps the
 * enum honest about what the act deferred; refusing it keeps this lane from
 * shipping a reversible path by accident.
 *
 * The key must be at least 32 bytes. A shorter key is refused: a weak HMAC
 * key is a weak one-way property, and the boundary would rather not write.
 */

import { createHmac } from 'node:crypto';
import type { SecretRegistry } from './registry.js';

export type RedactionMode = 'replace' | 'obfuscate';

export const REDACTION_MODES: readonly RedactionMode[] = ['replace', 'obfuscate'] as const;

/** The modes this lane wires. `obfuscate` is deferred by the act. */
export const WIRED_REDACTION_MODES: readonly RedactionMode[] = ['replace'] as const;

export const MIN_HMAC_KEY_BYTES = 32;
export const TOKEN_HMAC_HEX_CHARS = 16;
export const MAX_REDACT_DEPTH = 64;

export class RedactionModeNotWiredError extends Error {
  override readonly name = 'RedactionModeNotWiredError';
  constructor(readonly mode: string) {
    super(`redaction mode ${JSON.stringify(mode)} is not wired in this lane; wired modes: ${WIRED_REDACTION_MODES.join(', ')}`);
  }
}

export class HmacKeyTooShortError extends Error {
  override readonly name = 'HmacKeyTooShortError';
  constructor(readonly bytes: number) {
    super(`HMAC key is ${bytes} bytes; at least ${MIN_HMAC_KEY_BYTES} are required`);
  }
}

/** A serializable, already-redacted error — never an `Error` instance carrying a live stack. */
export interface RedactedError {
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
  readonly code: string | null;
  readonly cause: RedactedError | null;
}

export interface Redactor {
  readonly mode: RedactionMode;
  /** The token a registered value maps to; deterministic under the key. */
  token(name: string, value: string): string;
  redactString(text: string): string;
  /** Walks arrays and plain objects; leaves numbers/booleans/null untouched. */
  redactValue(value: unknown): unknown;
  redactError(error: unknown): RedactedError;
}

export interface RedactorOptions {
  readonly mode: RedactionMode;
  readonly registry: SecretRegistry;
  readonly hmacKey: Buffer;
}

export function createRedactor(options: RedactorOptions): Redactor {
  if (!(WIRED_REDACTION_MODES as readonly string[]).includes(options.mode)) {
    throw new RedactionModeNotWiredError(options.mode);
  }
  if (!Buffer.isBuffer(options.hmacKey) || options.hmacKey.byteLength < MIN_HMAC_KEY_BYTES) {
    throw new HmacKeyTooShortError(Buffer.isBuffer(options.hmacKey) ? options.hmacKey.byteLength : 0);
  }
  const key = Buffer.from(options.hmacKey); // private copy
  const registry = options.registry;

  function digest(value: string): string {
    return createHmac('sha256', key).update(value, 'utf8').digest('hex').slice(0, TOKEN_HMAC_HEX_CHARS);
  }

  function token(name: string, value: string): string {
    return `[REDACTED:${name}:${digest(value)}]`;
  }

  function redactString(text: string): string {
    let out = text;
    // Longest value first: a secret that contains another secret is replaced
    // whole before the shorter one can punch a hole in it.
    for (const secret of registry.secretsLongestFirst()) {
      if (out.includes(secret.value)) {
        out = out.split(secret.value).join(token(secret.name, secret.value));
      }
    }
    for (const shape of registry.enabledShapes()) {
      const global = new RegExp(shape.pattern.source, shape.pattern.flags.replace('g', '') + 'g');
      out = out.replace(global, (match) => `[REDACTED:shape:${shape.name}:${digest(match)}]`);
    }
    return out;
  }

  function redactValue(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
    if (depth > MAX_REDACT_DEPTH) return '[REDACTION_DEPTH_EXCEEDED]';
    if (typeof value === 'string') return redactString(value);
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'bigint') return value.toString();
      if (typeof value === 'symbol' || typeof value === 'function') return `[${typeof value}]`;
      return value;
    }
    if (Buffer.isBuffer(value)) return Buffer.from(redactString(value.toString('utf8')), 'utf8');
    if (value instanceof Error) return redactError(value);
    if (seen.has(value)) return '[CYCLE]';
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => redactValue(item, depth + 1, seen));
    }
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Map) {
      return Object.fromEntries([...value.entries()].map(([k, v]) => [redactString(String(k)), redactValue(v, depth + 1, seen)]));
    }
    if (value instanceof Set) {
      return [...value.values()].map((item) => redactValue(item, depth + 1, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[redactString(k)] = redactValue(v, depth + 1, seen);
    }
    return out;
  }

  function redactError(error: unknown, depth = 0): RedactedError {
    if (depth > 8) {
      return { name: 'Error', message: '[REDACTION_DEPTH_EXCEEDED]', stack: null, code: null, cause: null };
    }
    if (error instanceof Error) {
      const code = (error as { code?: unknown }).code;
      const cause = (error as { cause?: unknown }).cause;
      return {
        name: redactString(error.name),
        message: redactString(error.message),
        stack: typeof error.stack === 'string' ? redactString(error.stack) : null,
        code: typeof code === 'string' ? redactString(code) : null,
        cause: cause === undefined || cause === null ? null : redactError(cause, depth + 1),
      };
    }
    return {
      name: 'NonError',
      message: redactString(typeof error === 'string' ? error : safeStringify(error)),
      stack: null,
      code: null,
      cause: null,
    };
  }

  return { mode: options.mode, token, redactString, redactValue: (v) => redactValue(v), redactError: (e) => redactError(e) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
