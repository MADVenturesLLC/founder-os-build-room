/**
 * SecretRegistry — what the redaction boundary knows to be secret
 * (OMP→MAD Evolve Pack v0, Lane B, Founder act of 2026-09-13).
 *
 * Three ways a secret becomes known, all explicit and all auditable:
 *
 *   1. env-name heuristics — a name that looks like a credential
 *      (`*_TOKEN`, `*_SECRET`, `*PASSWORD*`, `*_API_KEY`, `DATABASE_URL`, …)
 *      is registered from an environment MAP the caller passes in; this
 *      module never reads the ambient process environment itself;
 *   2. a manifest — names of environment variables and built-in shapes to
 *      enable. A manifest never carries a literal secret value; one that does
 *      is refused whole (fail-closed), because a manifest is a tracked file;
 *   3. generation time — a fixture password is registered in the same call
 *      that mints it (`generateFixturePassword`), so a generated secret can
 *      never exist unregistered. Fixture passwords are at least 16 characters
 *      by contract; a shorter candidate is refused and discarded.
 *
 * A registry that refused anything is NOT loadable, and a boundary over an
 * unloadable registry refuses every write (sinks.ts). The way out is an
 * explicit `ignore` entry by name, which is visible in the load report —
 * never a silent skip.
 *
 * Optional built-in shapes (PEM blocks, `sk-…`, `ghp_…`, `AKIA…`, Slack and
 * JWT forms) catch material that was never registered by value. They are
 * opt-in per shape name so a fixture that legitimately contains a look-alike
 * can say so.
 */

import { randomBytes as nodeRandomBytes } from 'node:crypto';

export type SecretSource = 'env' | 'manifest' | 'generated';

export interface RegisteredSecret {
  readonly name: string;
  readonly value: string;
  readonly source: SecretSource;
}

export interface ShapeRule {
  readonly name: string;
  /** Compiled with the `g` flag by the redactor; keep the source free of `g`. */
  readonly pattern: RegExp;
}

export interface RefusedEntry {
  readonly name: string;
  readonly reason: string;
}

/** Fixture passwords are at least this long (act: "fixture passwords ≥16 chars"). */
export const MIN_FIXTURE_PASSWORD_LENGTH = 16;

/**
 * Registering a very short value would turn ordinary text into redaction
 * noise, and a genuine credential that short is a defect in its own right.
 * The registry refuses rather than skips, so the refusal is visible.
 */
export const MIN_REGISTERED_VALUE_LENGTH = 8;

/** Env-name heuristics — matched case-insensitively against the variable name. */
export const ENV_NAME_HEURISTICS: readonly RegExp[] = [
  /(^|_)(SECRET|SECRETS)(_|$)/i,
  /(^|_)(TOKEN|TOKENS)(_|$)/i,
  /(^|_)(PASSWORD|PASSWD|PASSPHRASE)(_|$)/i,
  /(^|_)(API_?KEY|ACCESS_?KEY|SIGNING_?KEY|PRIVATE_?KEY|ENCRYPTION_?KEY)(_|$)/i,
  /(^|_)(CREDENTIAL|CREDENTIALS)(_|$)/i,
  /(^|_)(CLIENT_SECRET|AUTH)(_|$)/i,
  /(^|_)(DATABASE_URL|CONNECTION_STRING|DSN)(_|$)/i,
];

export function looksLikeSecretName(name: string): boolean {
  return ENV_NAME_HEURISTICS.some((rule) => rule.test(name));
}

/**
 * Built-in shapes, opt-in by name. Patterns carry no `g` flag (the redactor
 * adds it).
 *
 * ANCHORING, and why it is not `\b`. A JavaScript word boundary does not fire
 * between `_` and a letter, because both are word characters. Every prefixed
 * shape below was originally written `\b<prefix>…\b`, which made all of them
 * blind to a token glued after an underscore: `ghp_…` was caught, and
 * `anything_ghp_…` was not. That is not a corner case — identifiers routinely
 * carry a namespace prefix, and a value pasted into one is exactly the shape
 * a leak takes. The leading guard is therefore a negative lookbehind for
 * `[A-Za-z0-9]` and the trailing guard a negative lookahead for the same
 * class, so `_` and `-` read as the separators they are while a match inside
 * a longer alphanumeric run is still refused.
 */
export const BUILTIN_SHAPES: readonly ShapeRule[] = [
  { name: 'pem-private-key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/ },
  { name: 'openai-style-sk', pattern: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}(?![A-Za-z0-9])/ },
  { name: 'github-pat', pattern: /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{36,}(?![A-Za-z0-9])/ },
  { name: 'aws-access-key-id', pattern: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/ },
  { name: 'slack-token', pattern: /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}(?![A-Za-z0-9])/ },
  { name: 'jwt', pattern: /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?![A-Za-z0-9])/ },
];

export const BUILTIN_SHAPE_NAMES: readonly string[] = BUILTIN_SHAPES.map((s) => s.name);

export interface SecretManifest {
  readonly version: 1;
  readonly entries: readonly ManifestEntry[];
}

export type ManifestEntry =
  | { readonly kind: 'env'; readonly name: string }
  | { readonly kind: 'shape'; readonly name: string };

export interface EnvLoadOptions {
  /** Names to leave out of the heuristic scan — explicit, listed in the report. */
  readonly ignore?: readonly string[];
}

export interface LoadReport {
  readonly registered: readonly string[];
  readonly refused: readonly RefusedEntry[];
  readonly ignored: readonly string[];
}

export class SecretRegistryError extends Error {
  override readonly name = 'SecretRegistryError';
  constructor(
    readonly code: 'value_too_short' | 'duplicate_name' | 'manifest_invalid' | 'manifest_carries_value' | 'unknown_shape' | 'fixture_password_too_short' | 'empty_name',
    message: string,
  ) {
    super(message);
  }
}

export class SecretRegistry {
  private readonly secrets = new Map<string, RegisteredSecret>();
  private readonly shapes = new Map<string, ShapeRule>();
  private readonly refusals: RefusedEntry[] = [];

  /** Register one secret by value. Throws on a short value or a duplicate name. */
  register(name: string, value: string, source: SecretSource): RegisteredSecret {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new SecretRegistryError('empty_name', 'a secret needs a non-empty name');
    }
    if (typeof value !== 'string' || value.length < MIN_REGISTERED_VALUE_LENGTH) {
      throw new SecretRegistryError(
        'value_too_short',
        `secret ${JSON.stringify(name)} is shorter than ${MIN_REGISTERED_VALUE_LENGTH} characters and is refused, not skipped`,
      );
    }
    if (this.secrets.has(name)) {
      throw new SecretRegistryError('duplicate_name', `secret ${JSON.stringify(name)} is already registered`);
    }
    const entry: RegisteredSecret = { name, value, source };
    this.secrets.set(name, entry);
    return entry;
  }

  /** Register a generated fixture password. Refuses (and discards) anything under 16 characters. */
  registerGenerated(name: string, value: string): RegisteredSecret {
    if (typeof value !== 'string' || value.length < MIN_FIXTURE_PASSWORD_LENGTH) {
      throw new SecretRegistryError(
        'fixture_password_too_short',
        `fixture password ${JSON.stringify(name)} must be at least ${MIN_FIXTURE_PASSWORD_LENGTH} characters`,
      );
    }
    return this.register(name, value, 'generated');
  }

  enableShape(name: string): ShapeRule {
    const rule = BUILTIN_SHAPES.find((s) => s.name === name);
    if (rule === undefined) {
      throw new SecretRegistryError('unknown_shape', `no built-in shape named ${JSON.stringify(name)}`);
    }
    this.shapes.set(name, rule);
    return rule;
  }

  /**
   * Heuristic scan of an environment map the caller supplies. Every matching
   * name is registered; a matching name with a too-short value is REFUSED and
   * makes the registry unloadable until it is ignored by name.
   */
  loadFromEnv(env: Readonly<Record<string, string | undefined>>, options: EnvLoadOptions = {}): LoadReport {
    const ignore = new Set(options.ignore ?? []);
    const registered: string[] = [];
    const refused: RefusedEntry[] = [];
    const ignored: string[] = [];
    for (const name of Object.keys(env).sort()) {
      if (!looksLikeSecretName(name)) continue;
      if (ignore.has(name)) {
        ignored.push(name);
        continue;
      }
      const value = env[name];
      if (value === undefined || value === '') {
        ignored.push(name); // unset or empty: nothing to protect, nothing to refuse
        continue;
      }
      try {
        this.register(name, value, 'env');
        registered.push(name);
      } catch (error) {
        const reason = error instanceof SecretRegistryError ? error.code : 'register_failed';
        refused.push({ name, reason });
        this.refusals.push({ name, reason });
      }
    }
    return { registered, refused, ignored };
  }

  /**
   * Load a manifest. Entries name env variables (resolved against the map
   * given) and built-in shapes. A manifest carrying any literal value is
   * refused whole: it is a tracked file, and the value would be the leak.
   */
  loadFromManifest(manifest: unknown, env: Readonly<Record<string, string | undefined>>): LoadReport {
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
      throw new SecretRegistryError('manifest_invalid', 'manifest must be an object');
    }
    const candidate = manifest as { version?: unknown; entries?: unknown };
    if (candidate.version !== 1 || !Array.isArray(candidate.entries)) {
      throw new SecretRegistryError('manifest_invalid', 'manifest must be { version: 1, entries: [...] }');
    }
    for (const entry of candidate.entries as unknown[]) {
      if (typeof entry !== 'object' || entry === null) {
        throw new SecretRegistryError('manifest_invalid', 'every manifest entry must be an object');
      }
      const record = entry as Record<string, unknown>;
      if ('value' in record || 'secret' in record || 'password' in record) {
        throw new SecretRegistryError('manifest_carries_value', 'a manifest names secrets; it never carries one');
      }
      if ((record.kind !== 'env' && record.kind !== 'shape') || typeof record.name !== 'string') {
        throw new SecretRegistryError('manifest_invalid', 'manifest entries are { kind: "env" | "shape", name }');
      }
    }
    const registered: string[] = [];
    const refused: RefusedEntry[] = [];
    const ignored: string[] = [];
    for (const entry of candidate.entries as ManifestEntry[]) {
      if (entry.kind === 'shape') {
        this.enableShape(entry.name); // unknown shape throws: a typo is not a silent no-op
        registered.push(`shape:${entry.name}`);
        continue;
      }
      const value = env[entry.name];
      if (value === undefined || value === '') {
        // Named by the manifest but unset here: refused, because the manifest
        // said this secret exists and the boundary cannot prove it is absent.
        refused.push({ name: entry.name, reason: 'named_but_unset' });
        this.refusals.push({ name: entry.name, reason: 'named_but_unset' });
        continue;
      }
      try {
        this.register(entry.name, value, 'manifest');
        registered.push(entry.name);
      } catch (error) {
        const reason = error instanceof SecretRegistryError ? error.code : 'register_failed';
        refused.push({ name: entry.name, reason });
        this.refusals.push({ name: entry.name, reason });
      }
    }
    return { registered, refused, ignored };
  }

  /** True only when nothing was refused. The boundary consults this before every open. */
  isLoadable(): boolean {
    return this.refusals.length === 0;
  }

  refusedEntries(): readonly RefusedEntry[] {
    return [...this.refusals];
  }

  /** Registered secrets, longest value first — the order the redactor applies them. */
  secretsLongestFirst(): readonly RegisteredSecret[] {
    return [...this.secrets.values()].sort((a, b) => b.value.length - a.value.length || a.name.localeCompare(b.name));
  }

  enabledShapes(): readonly ShapeRule[] {
    return [...this.shapes.values()];
  }

  has(name: string): boolean {
    return this.secrets.has(name);
  }

  size(): number {
    return this.secrets.size;
  }
}

export interface GenerateFixturePasswordOptions {
  /** Random bytes before base64url encoding; 18 bytes → 24 characters. */
  readonly bytes?: number;
  /** Injected randomness for deterministic fixtures; defaults to node:crypto. */
  readonly randomBytes?: (size: number) => Buffer;
}

/**
 * Mint a fixture password and register it in the same call. The value is
 * returned only after registration succeeded, so no caller can hold an
 * unregistered generated secret.
 */
export function generateFixturePassword(
  registry: SecretRegistry,
  name: string,
  options: GenerateFixturePasswordOptions = {},
): string {
  const size = options.bytes ?? 18;
  const random = options.randomBytes ?? nodeRandomBytes;
  const value = random(size).toString('base64url');
  registry.registerGenerated(name, value); // throws below 16 chars; value is then dropped
  return value;
}
