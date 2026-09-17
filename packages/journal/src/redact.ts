/**
 * Secret / credential redaction for journal envelopes (stop-gate §7.3).
 *
 * Redaction runs BEFORE any journal write. Credential-shaped material never
 * reaches a persisted row. Patterns are deliberately conservative: anything
 * that looks like a bearer token, API key, private key block, or well-known
 * secret env binding is replaced with a stable redaction token.
 */

export const REDACTED = '[REDACTED]';

/** Credential-shaped substrings and whole-arg patterns that must not persist. */
const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  /\b(?:sk|pk|rk|ak)-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxai-[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:Bearer|token|api[_-]?key|secret|password|passwd|credential)\s*[:=]\s*\S+/gi,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, // high-entropy base64-ish blobs (length-gated)
];

/** Env-style keys whose values are never persisted even when present as argv. */
const SECRET_ENV_KEYS = new Set([
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'CONTROL_PLANE_TOKEN',
  'PHASE3_ADJUDICATION_TOKEN',
  'DATABASE_URL',
  'NEON_DATABASE_URL',
  'AWS_SECRET_ACCESS_KEY',
  'PRIVATE_KEY',
]);

function redactString(value: string): string {
  let out = value;
  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes reused across calls.
    pattern.lastIndex = 0;
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

/**
 * Normalize argv for journal persistence: strip secret env bindings and
 * redact credential-shaped substrings. Returns a new array; never mutates input.
 */
export function redactArgv(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.indexOf('=');
    if (eq > 0) {
      const key = arg.slice(0, eq);
      if (SECRET_ENV_KEYS.has(key)) {
        out.push(`${key}=${REDACTED}`);
        continue;
      }
    }
    // `--token <value>` / `-p <secret>` style: redact the following arg when
    // the flag name itself is secret-bearing.
    if (/^--?(?:token|api-?key|secret|password|passwd|credential)$/i.test(arg) && i + 1 < argv.length) {
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
 * True when any raw argv element still contains credential-shaped material
 * after the caller's claimed redaction. Used by honesty / security-negative
 * tests and by the write-path guard.
 */
export function containsCredentialMaterial(values: readonly string[]): boolean {
  for (const value of values) {
    if (value.includes(REDACTED) && !value.includes('=')) {
      // Already redacted marker alone is fine; keep scanning other patterns.
    }
    for (const pattern of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      // Skip the broad base64 catcher for the presence check against known
      // fixtures — use the specific credential patterns first.
      if (pattern.source.includes('BEGIN') || pattern.source.includes('ghp') || pattern.source.includes('github_pat') || pattern.source.includes('xai-') || pattern.source.includes('sk|pk') || pattern.source.includes('Bearer')) {
        if (pattern.test(value) && !value.includes(REDACTED)) {
          return true;
        }
      }
    }
    // Explicit known prefixes that must never reach a row unredacted.
    if (/(?:sk-|ghp_|github_pat_|xai-|BEGIN [A-Z0-9 ]*PRIVATE KEY)/.test(value) && !value.includes(REDACTED)) {
      return true;
    }
    for (const key of SECRET_ENV_KEYS) {
      if (value.startsWith(`${key}=`) && !value.endsWith(`=${REDACTED}`)) {
        const raw = value.slice(key.length + 1);
        if (raw.length > 0 && raw !== REDACTED) {
          return true;
        }
      }
    }
  }
  return false;
}
