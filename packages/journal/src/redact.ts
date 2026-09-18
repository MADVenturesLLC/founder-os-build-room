/**
 * Secret and credential redaction for journal writes (contract §6.1, §6.3).
 *
 * Redaction runs BEFORE any journal write, never after (§6.1), so
 * credential-shaped material never reaches a persisted row. Two pattern
 * families, kept separate on purpose:
 *
 *   CREDENTIAL_SHAPES — specific, named credential forms. These both redact
 *     and DETECT: a match is positive evidence of credential material.
 *   ENTROPY_SHAPES — broad high-entropy blobs. These redact only. A long
 *     base64-ish run is not by itself evidence of a secret (a digest, a
 *     patch id, and a signature all match it), so it must never make
 *     `containsCredentialMaterial` return true or the write-path guard
 *     would refuse legitimate rows.
 *
 * Detection patterns carry no `g` flag: `RegExp.test` on a global regex
 * advances `lastIndex` and makes consecutive calls disagree. The global
 * copies used for replacement are derived once, below.
 */

export const REDACTED = '[REDACTED]';

interface CredentialShape {
  readonly name: string;
  /** Non-global: used with `.test()`. */
  readonly pattern: RegExp;
}

/** Specific credential forms — positive evidence when matched. */
const CREDENTIAL_SHAPES: readonly CredentialShape[] = [
  {
    name: 'pem_private_key',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/,
  },
  { name: 'provider_api_key', pattern: /\b(?:sk|pk|rk|ak)-[A-Za-z0-9_-]{16,}\b/ },
  { name: 'github_token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/ },
  { name: 'github_fine_grained_pat', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: 'xai_key', pattern: /\bxai-[A-Za-z0-9_-]{20,}\b/ },
  {
    name: 'labelled_secret',
    pattern: /\b(?:token|api[_-]?key|secret|password|passwd|credential)\s*[:=]\s*\S+/i,
  },
  // `Bearer <token>` is written with a space and no separator, so it needs
  // its own shape: requiring `:` or `=` missed the standard HTTP form.
  { name: 'bearer_token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i },
  // A JWT is base64URL, whose `-` and `_` fall outside the entropy shape's
  // alphabet, so it would otherwise reach a row untouched.
  {
    name: 'json_web_token',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  },
  // `scheme://user:password@host` — a connection string carries its
  // credential inline and no env-key rule below would catch it.
  { name: 'url_userinfo_credential', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i },
];

/**
 * Redaction-only: too broad to be treated as evidence.
 *
 * The negative lookahead excludes runs that are entirely hexadecimal. A
 * 40-character Git SHA-1 and a 64-character SHA-256 digest both match the
 * base64-ish shape, and redacting them would corrupt exactly the argv a
 * governed `git` command needs for the §7.1 reconstruction property. A hex
 * run is a digest or an object id, not a credential.
 */
const ENTROPY_SHAPES: readonly RegExp[] = [
  /\b(?![0-9a-fA-F]+\b)[A-Za-z0-9+/]{40,}={0,2}\b/g,
];

/** Global counterparts of CREDENTIAL_SHAPES, derived once for replacement. */
const CREDENTIAL_SHAPES_GLOBAL: readonly RegExp[] = CREDENTIAL_SHAPES.map(
  (shape) => new RegExp(shape.pattern.source, `${shape.pattern.flags}g`),
);

/** Env-style keys whose values are never persisted, even as bare argv. */
const SECRET_ENV_KEYS: ReadonlySet<string> = new Set([
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'CONTROL_PLANE_TOKEN',
  'PHASE3_ADJUDICATION_TOKEN',
  'DATABASE_URL',
  'NEON_DATABASE_URL',
  'AWS_SECRET_ACCESS_KEY',
  'PRIVATE_KEY',
]);

/** Flags whose FOLLOWING argument is the secret (`--token <value>`). */
const SECRET_BEARING_FLAG = /^--?(?:token|api-?key|secret|password|passwd|credential)$/i;

/** The same flags written inline (`--token=<value>`). */
const SECRET_BEARING_FLAG_INLINE =
  /^(--?(?:token|api-?key|secret|password|passwd|credential))=/i;

function redactString(value: string): string {
  let out = value;
  // `String.replace` with a global regex resets lastIndex itself, so these
  // are safe to reuse across calls; `.test()` would not be.
  for (const pattern of CREDENTIAL_SHAPES_GLOBAL) {
    out = out.replace(pattern, REDACTED);
  }
  for (const pattern of ENTROPY_SHAPES) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

/**
 * Normalize argv for journal persistence: strip secret env bindings, blank
 * the argument after a secret-bearing flag, and redact credential-shaped
 * substrings. Returns a new array and never mutates the input.
 */
export function redactArgv(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.indexOf('=');
    if (eq > 0 && SECRET_ENV_KEYS.has(arg.slice(0, eq))) {
      out.push(`${arg.slice(0, eq)}=${REDACTED}`);
      continue;
    }
    const inline = SECRET_BEARING_FLAG_INLINE.exec(arg);
    if (inline) {
      out.push(`${inline[1]}=${REDACTED}`);
      continue;
    }
    // Only consume the next argument when it plausibly IS the value. A
    // following token that starts with `-` is the next flag, and swallowing
    // it would drop it from the record the journal must reconstruct.
    const next = argv[i + 1];
    if (SECRET_BEARING_FLAG.test(arg) && next !== undefined && !next.startsWith('-')) {
      out.push(arg);
      out.push(REDACTED);
      i += 1;
      continue;
    }
    out.push(redactString(arg));
  }
  return out;
}

/** Every redaction marker removed, so detection sees only what survived. */
function withoutMarkers(value: string): string {
  return value.split(REDACTED).join('');
}

/**
 * True when any value still carries credential-shaped material. This is the
 * write-path guard (§6.3) and the honesty check behind the §7.3 proofs: it
 * runs against values a caller CLAIMS are already redacted, so a value that
 * still contains a specific credential shape, or a secret env binding whose
 * value was left intact, fails closed.
 *
 * Detection runs against the value with redaction MARKERS REMOVED, never
 * against the raw value gated on "does it contain a marker anywhere". That
 * gate is the defect this function is written to avoid: a partially
 * redacted value such as `[REDACTED] ghp_<live token>` carries a marker and
 * a live credential at once, and a marker-anywhere test would call it
 * clean. Removing the markers instead leaves exactly the material that
 * survived redaction, so `api_key=[REDACTED]` reduces to `api_key=` and
 * matches nothing, while the live token still matches.
 */
export function containsCredentialMaterial(values: readonly string[]): boolean {
  for (const value of values) {
    const surviving = withoutMarkers(value);
    for (const shape of CREDENTIAL_SHAPES) {
      if (shape.pattern.test(surviving)) {
        return true;
      }
    }
    for (const key of SECRET_ENV_KEYS) {
      if (!value.startsWith(`${key}=`)) {
        continue;
      }
      // Anything left once the markers are gone is a value that survived.
      if (withoutMarkers(value.slice(key.length + 1)).length > 0) {
        return true;
      }
    }
  }
  return false;
}
