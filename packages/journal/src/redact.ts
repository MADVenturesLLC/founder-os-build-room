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
 * This module does NOT replace, wrap, or reimplement that boundary. It is
 * the §6.1 pre-write guard the stop-gate proofs need, which must journal
 * unconditionally and so cannot sit behind a fail-closed-on-absent-key
 * boundary. The consequence was real and worth naming when this module
 * landed: two independently evolving credential-shape lists governed the
 * same write path, and whoever wired `JournalAppendSink` into the journal
 * store would have had to reconcile them rather than stack them, a Founder
 * act and not a refactor. (That package's README once gave "no journal
 * store exists yet" as its reason for not wiring the sink, a premise this
 * package's `store.ts` had already made false; its "Not wired, by ruling"
 * paragraph now carries the ruling below, and the two texts agree.)
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
  // `Bearer <token>` is written with a space and no separator, so it needs
  // its own shape: requiring `:` or `=` missed the standard HTTP form.
  // FOUNDER-ACT-20261105-BR-BEARER-SHAPE as amended (Amendment 5): the value
  // is 20 or more characters of RFC 6750's token alphabet below. With eight,
  // English prose such as "bearer credentials" matched, and a Planner's plan
  // was refused for it. The control plane's config refuses to boot with
  // CONTROL_PLANE_TOKEN, PHASE3_ADJUDICATION_TOKEN or PHASE4_COUNTED_RUN_TOKEN
  // shorter than 32 characters or holding a character outside this alphabet
  // (packages/control-plane/src/config.ts), so every token it accepts is
  // matched whole. redactString finds every shape's matches in the value as
  // it was written (FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION), so the
  // order of this list decides nothing that is redacted: such a token is
  // redacted whole even where another shape matches inside it, and a secret's
  // label glued to its end is still found by labelled_secret.
  // Stated limits: a value with fewer than 20 characters of the alphabet
  // before its first other character is not caught, and a longer one is
  // redacted only up to that character; and 20 or more characters of the
  // alphabet after "bearer", such as a bare PHASE4_COUNTED_RUN_TOKEN or a
  // file path, are caught although not secret.
  { name: 'bearer_token', pattern: /(?<![A-Za-z0-9])Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i },
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
  // A JWT is base64URL, whose `-` and `_` fall outside the entropy shape's
  // alphabet, so it would otherwise reach a row untouched.
  // Its first part does not run past a "-" or "_" that begins a later "eyJ"
  // with 8 more characters of the alphabet (Amendment 3 X3 of
  // FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION). Without that, the part
  // was tried from every "eyJ" of a run such as "eyJ-eyJ-", each try reaching
  // the end of the run, so the time grew with the square of the run's length:
  // about a second for 65,536 characters, here and in the guard. The shape
  // finds a JWT wherever it did before. Stated limit: where a JWT's first part
  // holds such a "-" or "_", the match begins at the "eyJ" after the last of
  // them, and the characters before it stay.
  {
    name: 'json_web_token',
    pattern: /(?<![A-Za-z0-9])eyJ(?:[A-Za-z0-9]|[_-](?!eyJ[A-Za-z0-9_-]{8})){8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  },
  // `scheme://user:password@host` — a connection string carries its
  // credential inline and no env-key rule below would catch it.
  // The scheme is at most 64 characters (Amendment 2 W1 of
  // FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION). Unbounded, the scheme
  // part was tried from every letter of a run such as "a-a-a-", each try
  // reaching the end of the value, so the time grew with the square of the
  // run's length: about three seconds for 65,536 characters, here and in the
  // guard. Stated limit (Amendment 3 X1): a scheme longer than 64 characters
  // is matched only from a letter that directly follows one of its "+", "."
  // or "-" and leaves at most 64 characters of the scheme from that letter
  // on. A URL whose scheme has no such letter is not matched, and its user
  // and password stay unless another shape takes them.
  { name: 'url_userinfo_credential', pattern: /(?<![A-Za-z0-9])[a-z][a-z0-9+.-]{0,63}:\/\/[^\s:@/]+:[^\s@/]+@/i },
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

/** Every shape that redacts, global: the credential shapes, then the entropy shape. */
const REDACTION_SHAPES_GLOBAL: readonly RegExp[] = [...CREDENTIAL_SHAPES_GLOBAL, ...ENTROPY_SHAPES];

/**
 * Every range, `[start, end)`, that any shape matches in `value` as it was
 * written. Each shape scans the whole value from its start, leftmost first,
 * as `String.replace` with that global pattern would, and never sees what
 * another shape matched (FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION B1).
 * Replacing shape after shape instead let one shape's match decide what a
 * later shape could see: a bearer value took a secret's label as characters
 * of its alphabet, and the labelled value after it stayed in the row.
 */
function matchedRanges(value: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const pattern of REDACTION_SHAPES_GLOBAL) {
    // A failed `exec` resets lastIndex to 0, so each scan ends where the next
    // one must start; it is set here as well, so a scan never depends on that.
    pattern.lastIndex = 0;
    for (let match = pattern.exec(value); match !== null; match = pattern.exec(value)) {
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      ranges.push([match.index, match.index + match[0].length]);
    }
  }
  return ranges;
}

/**
 * `value` with each range replaced by REDACTED. Ranges that overlap are
 * merged and take one marker; ranges that only touch keep one marker each.
 */
function replaceRanges(value: string, ranges: Array<[number, number]>): string {
  if (ranges.length === 0) {
    return value;
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let out = '';
  let cursor = 0;
  let [start, end] = ranges[0]!;
  for (let i = 1; i < ranges.length; i++) {
    const [nextStart, nextEnd] = ranges[i]!;
    if (nextStart < end) {
      end = Math.max(end, nextEnd);
      continue;
    }
    out += value.slice(cursor, start) + REDACTED;
    cursor = end;
    start = nextStart;
    end = nextEnd;
  }
  return out + value.slice(cursor, start) + REDACTED + value.slice(end);
}

/**
 * True when `containsCredentialMaterial` would still find a credential shape
 * in `value`. The guard reads `value` with every marker removed, so text on
 * either side of a marker can join into a shape.
 */
function guardStillFinds(value: string): boolean {
  const surviving = withoutMarkers(value);
  return CREDENTIAL_SHAPES.some((shape) => shape.pattern.test(surviving));
}

/**
 * Redact every match of every shape in the value as it was written (B1).
 * If the guard would still find a credential shape in what is left, the
 * whole value is redacted (B2, as Amendment 1 of the act sets it), so the
 * result always passes the guard's shape test. That is one pass of B1 and
 * one read of the guard's view, whatever the value holds: the act's first
 * B2, which redacted one surviving match per pass, took time that grew with
 * the square of the value's length on values of many marker-split
 * credentials.
 *
 * Stated limits: on some inputs this keeps a character that replacing shape
 * after shape removed, such as the "!" of "token:Bearer <value>!" (B5); and
 * a value on which B1 leaves text where the guard still finds a credential
 * shape loses all of its text, not only the credential (Amendment 1 V3).
 */
function redactString(value: string): string {
  const out = replaceRanges(value, matchedRanges(value));
  return guardStillFinds(out) ? REDACTED : out;
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
