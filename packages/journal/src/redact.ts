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

/**
 * OVERLAP, STATED SO IT IS NOT DISCOVERED LATER.
 *
 * `packages/redaction` already owns this concern by design: its
 * `sinks.ts` names "journal append" as one of the three sinks it exists to
 * guard and ships a `JournalAppendSink` for it. That wiring is
 * deliberately NOT done, and `sinks.ts`'s own header states the operative
 * reason: a boundary with no provisioned HMAC key refuses every write,
 * which is a live behaviour change its authorizing act did not grant.
 *
 * Do NOT read that package's README as the authority on this point. Its
 * "Still not wired" entry gives the reason as "no journal store exists
 * yet", and THIS PACKAGE'S `store.ts` makes that premise false — the
 * citation was stale the moment this module landed. What remains true is
 * narrower and is the actual argument: the store here is in-memory and is
 * NOT the ruled Neon locus of contract §3, and the key-provisioning
 * behaviour change is unauthorized. Updating that README to say so is the
 * redaction package owner's act, not this module's.
 *
 * This module therefore does NOT replace, wrap, or reimplement that
 * boundary. It is the §6.1 pre-write guard the stop-gate proofs need,
 * which must journal unconditionally and so cannot sit behind a
 * fail-closed-on-absent-key boundary. The consequence is real and worth
 * naming: two independently evolving credential-shape lists now govern
 * the same write path, and whoever is authorized to wire
 * `JournalAppendSink` into the journal store must reconcile them rather
 * than stack them. That reconciliation is a Founder act, not a refactor.
 *
 * RECONCILED by the Founder's ruling of 2026-10-04 (C3 — RULING), landed at
 * docs/planning/command-journal/custody/
 * FOUNDER-RULING-journal-redaction-C3-FD3-20261003.txt. This guard, applied
 * in the control plane's `JournalStore` before any database contact, IS the
 * redaction boundary of the production journal write path. `JournalAppendSink`
 * stays unwired and is never stacked on it; a keyed boundary may replace it
 * only under a later act that names it. One condition binds the designation:
 * CREDENTIAL_SHAPES must contain every shape in `packages/redaction`'s
 * registry (`BUILTIN_SHAPES`). The `aws_access_key_id` and `slack_token`
 * shapes below exist for that reason, and
 * `test/journal-redaction-registry-parity.test.ts` holds this list to the
 * registry: a registry shape this guard does not detect fails that test.
 */

export const REDACTED = '[REDACTED]';

interface CredentialShape {
  readonly name: string;
  /** Non-global: used with `.test()`. */
  readonly pattern: RegExp;
}

/**
 * Specific credential forms — positive evidence when matched.
 *
 * These deliberately use `(?<![A-Za-z0-9])` rather than `\b` at the front.
 * `\b` does not fire between `_` and a letter, so every prefix below was
 * invisible the moment a token was glued after an underscore — and
 * `command_id` is REQUIRED to live in the `cmd_` namespace, so
 * `cmd_<live token>` passed the write-path guard straight into the chained
 * bytes. The lookaround treats `_` and `-` as separators, which is what a
 * credential prefix actually sits behind in the wild.
 */
const CREDENTIAL_SHAPES: readonly CredentialShape[] = [
  {
    name: 'pem_private_key',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/,
  },
  { name: 'provider_api_key', pattern: /(?<![A-Za-z0-9])(?:sk|pk|rk|ak)-[A-Za-z0-9_-]{16,}(?![A-Za-z0-9])/ },
  { name: 'github_token', pattern: /(?<![A-Za-z0-9])(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}(?![A-Za-z0-9])/ },
  { name: 'github_fine_grained_pat', pattern: /(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{20,}(?![A-Za-z0-9])/ },
  { name: 'xai_key', pattern: /(?<![A-Za-z0-9])xai-[A-Za-z0-9_-]{20,}(?![A-Za-z0-9])/ },
  // Registry parity (Founder ruling of 2026-10-04, C3 condition): the two
  // `packages/redaction` registry shapes this list lacked, with the
  // registry's own patterns (`aws-access-key-id`, `slack-token`). An AWS key
  // id is 20 characters and a Slack token carries hyphens, so neither was
  // even reached by the 40-character entropy shape below.
  { name: 'aws_access_key_id', pattern: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/ },
  { name: 'slack_token', pattern: /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}(?![A-Za-z0-9])/ },
  {
    name: 'labelled_secret',
    pattern: /(?<![A-Za-z0-9])(?:token|api[_-]?key|secret|password|passwd|credential)\s*[:=]\s*\S+/i,
  },
  // `Bearer <token>` is written with a space and no separator, so it needs
  // its own shape: requiring `:` or `=` missed the standard HTTP form.
  { name: 'bearer_token', pattern: /(?<![A-Za-z0-9])Bearer\s+[A-Za-z0-9._~+/=-]{8,}/i },
  // A JWT is base64URL, whose `-` and `_` fall outside the entropy shape's
  // alphabet, so it would otherwise reach a row untouched.
  {
    name: 'json_web_token',
    pattern: /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  },
  // `scheme://user:password@host` — a connection string carries its
  // credential inline and no env-key rule below would catch it.
  { name: 'url_userinfo_credential', pattern: /(?<![A-Za-z0-9])[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i },
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
