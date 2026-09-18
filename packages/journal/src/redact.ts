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
    pattern: /\b(?:Bearer|token|api[_-]?key|secret|password|passwd|credential)\s*[:=]\s*\S+/i,
  },
  // `scheme://user:password@host` — a connection string carries its
  // credential inline and no env-key rule below would catch it.
  { name: 'url_userinfo_credential', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i },
];

/** Redaction-only: too broad to be treated as evidence. */
const ENTROPY_SHAPES: readonly RegExp[] = [/\b[A-Za-z0-9+/]{40,}={0,2}\b/g];

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
    if (SECRET_BEARING_FLAG.test(arg) && i + 1 < argv.length) {
      out.push(arg);
      out.push(REDACTED);
      i += 1;
      continue;
    }
    out.push(redactString(arg));
  }
  return out;
}

/**
 * True when any value still carries credential-shaped material. This is the
 * write-path guard (§6.3) and the honesty check behind the §7.3 proofs: it
 * runs against values a caller CLAIMS are already redacted, so a value that
 * still contains a specific credential shape, or a secret env binding whose
 * value was left intact, fails closed.
 */
export function containsCredentialMaterial(values: readonly string[]): boolean {
  for (const value of values) {
    for (const shape of CREDENTIAL_SHAPES) {
      if (shape.pattern.test(value) && !value.includes(REDACTED)) {
        return true;
      }
    }
    for (const key of SECRET_ENV_KEYS) {
      if (!value.startsWith(`${key}=`)) {
        continue;
      }
      const raw = value.slice(key.length + 1);
      if (raw.length > 0 && raw !== REDACTED) {
        return true;
      }
    }
  }
  return false;
}
