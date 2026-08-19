/**
 * Strict encoders and decoders for the wire encodings the protocol names.
 *
 * Written by hand rather than delegated to `Buffer` or `atob` for two reasons.
 * The first is purity: this package imports nothing, so it cannot reach for a
 * Node built-in. The second matters more — both of those decoders are lenient
 * in ways that are wrong here. `Buffer.from(s, 'base64')` silently ignores
 * characters outside the alphabet and accepts missing padding, so two distinct
 * strings decode to the same 32 bytes and a key fingerprint stops being a
 * function of the string that was presented. This decoder rejects anything it
 * was not handed exactly: fixed length, correct padding, alphabet-only, and
 * canonical trailing bits.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup, built once. Index is the character code; -1 means invalid. */
const BASE64_VALUES: readonly number[] = (() => {
  const table = new Array<number>(128).fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

const HEX_DIGITS = '0123456789abcdef';

export function isLowercaseHex(value: string, length: number): boolean {
  if (value.length !== length) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isDigit = code >= 0x30 && code <= 0x39;
    const isLower = code >= 0x61 && code <= 0x66;
    if (!isDigit && !isLower) return false;
  }
  return true;
}

/** Canonical lowercase UUID: 8-4-4-4-12 lowercase hex with literal dashes. */
export function isCanonicalUuid(value: string): boolean {
  if (value.length !== 36) return false;
  const groups = [8, 4, 4, 4, 12];
  let cursor = 0;
  for (let group = 0; group < groups.length; group += 1) {
    const size = groups[group] ?? 0;
    if (group > 0) {
      if (value.charAt(cursor) !== '-') return false;
      cursor += 1;
    }
    if (!isLowercaseHex(value.slice(cursor, cursor + size), size)) return false;
    cursor += size;
  }
  return cursor === value.length;
}

export function bytesToLowercaseHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += HEX_DIGITS.charAt((byte >> 4) & 0x0f);
    out += HEX_DIGITS.charAt(byte & 0x0f);
  }
  return out;
}

/**
 * Decode standard **padded** base64 into exactly `expectedBytes` bytes.
 *
 * Returns `null` on any deviation rather than throwing, so callers classify the
 * failure themselves. Rejected: wrong length, any character outside the
 * alphabet, padding anywhere but the tail, and non-canonical trailing bits —
 * the last of which is what stops two encodings of the same key from both
 * decoding, which would make the server-derived fingerprint ambiguous.
 */
export function decodeBase64Fixed(value: string, expectedBytes: number): Uint8Array | null {
  const expectedChars = Math.ceil(expectedBytes / 3) * 4;
  if (value.length !== expectedChars) return null;

  const padding = expectedChars - Math.ceil((expectedBytes * 4) / 3);
  for (let index = 0; index < padding; index += 1) {
    if (value.charAt(expectedChars - 1 - index) !== '=') return null;
  }

  const bytes = new Uint8Array(expectedBytes);
  let byteIndex = 0;
  let accumulator = 0;
  let bitsHeld = 0;

  for (let index = 0; index < expectedChars - padding; index += 1) {
    const code = value.charCodeAt(index);
    const digit = code < 128 ? (BASE64_VALUES[code] ?? -1) : -1;
    if (digit < 0) return null;
    accumulator = (accumulator << 6) | digit;
    bitsHeld += 6;
    if (bitsHeld >= 8) {
      bitsHeld -= 8;
      if (byteIndex >= expectedBytes) return null;
      bytes[byteIndex] = (accumulator >> bitsHeld) & 0xff;
      byteIndex += 1;
    }
  }

  if (byteIndex !== expectedBytes) return null;
  // Leftover bits must be zero, or the encoding is one of several for these
  // bytes and the string is not canonical.
  if (bitsHeld > 0 && (accumulator & ((1 << bitsHeld) - 1)) !== 0) return null;
  return bytes;
}

/** Encode bytes as standard padded base64. */
export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index] ?? 0;
    const b1 = bytes[index + 1];
    const b2 = bytes[index + 2];
    out += BASE64_ALPHABET.charAt(b0 >> 2);
    out += BASE64_ALPHABET.charAt(((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4));
    out += b1 === undefined ? '=' : BASE64_ALPHABET.charAt(((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6));
    out += b2 === undefined ? '=' : BASE64_ALPHABET.charAt(b2 & 0x3f);
  }
  return out;
}

/**
 * Encode bytes as unpadded base64url.
 *
 * The one caller is the JWK `x` member used to import an Ed25519 public key
 * (contract §8 step 5), which RFC 7518 requires in this encoding.
 */
export function encodeBase64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
