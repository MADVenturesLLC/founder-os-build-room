/**
 * The harness side of the secret boundary — Lane B wiring, v0.
 *
 * `packages/redaction` is the control layer at the writers; this module is
 * the one place the run-harness constructs it. It decides three things and
 * nothing else:
 *
 *   1. **What is a secret here.** The harness's own environment is scanned
 *      with the package's name heuristics, and the one secret the harness is
 *      known to hold — `CONTROL_PLANE_TOKEN` — is named by an explicit
 *      manifest. The manifest names are excluded from the heuristic scan so
 *      the same name is never registered twice (a duplicate is a refusal,
 *      and the boundary would then refuse every write).
 *   2. **Which value is protected.** The CLIs trim `CONTROL_PLANE_TOKEN`
 *      before sending it, so the registry must hold the trimmed value too;
 *      otherwise a token with surrounding whitespace would reach the control
 *      plane but never match on the way out. Every value is trimmed before
 *      registration; exact-substring matching is only safer for it.
 *   3. **Where the key comes from.** Keychain on darwin, through the
 *      package's read-only custody of `mad.redaction.hmac` / `hmac-v1`.
 *      Every other platform has no key source in v1 and refuses. There is no
 *      environment-variable key path and no switch that turns the boundary
 *      off; fixture custody is constructed only by tests, through the
 *      `keyCustody` seam.
 *
 * A refused boundary makes the harness exit `REDACTION_REFUSED_EXIT` with a
 * single line naming the refusal code — names only, never a value — before
 * any run, reservation, or control-plane request. Exit 3 is used because
 * the Phase 3 harness already returns 2 for `awaiting_adjudication`.
 *
 * This module imports nothing from `packages/gateway-daemon`: the daemon's
 * custody stays uninvolved, by test as well as by intent.
 */

import { platform } from 'node:os';
import {
  KeychainHmacKeyCustody,
  RedactionBoundary,
  RedactionRefusedError,
  SecretRegistry,
  SecurityCommandRunner,
  UnavailableHmacKeyCustody,
  type HarnessStreams,
  type HmacKeyCustody,
  type RedactedError,
  type RefusalCode,
  type SecretManifest,
} from '../../redaction/src/index.js';

/** Exit code of either harness when the boundary refuses. Distinct from Phase 3's exit 2. */
export const REDACTION_REFUSED_EXIT = 3;

/** The secrets the harness is known to hold, named — never carried — here. */
export const HARNESS_SECRET_MANIFEST: SecretManifest = {
  version: 1,
  entries: [{ kind: 'env', name: 'CONTROL_PLANE_TOKEN' }],
};

/** Manifest names are registered only by the manifest; the heuristic scan skips them. */
export const HARNESS_MANIFEST_NAMES: readonly string[] = HARNESS_SECRET_MANIFEST.entries
  .filter((entry) => entry.kind === 'env')
  .map((entry) => entry.name);

export type HarnessEnvironment = Readonly<Record<string, string | undefined>>;

export interface HarnessBoundaryOptions {
  /**
   * Custody override — a test seam. Production callers pass nothing and get
   * platform custody; tests pass `InMemoryHmacKeyCustody` /
   * `UnavailableHmacKeyCustody` from the package.
   */
  readonly keyCustody?: HmacKeyCustody;
  /** Platform override for the custody choice — a test seam. */
  readonly platformName?: string;
}

/** Trim every defined value. The CLIs trim before use; the registry must match what is used. */
export function normalizeHarnessEnvironment(
  environment: HarnessEnvironment,
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(environment)) {
    normalized[name] = value === undefined ? undefined : value.trim();
  }
  return normalized;
}

/** Keychain on darwin; no key source anywhere else in v1. */
export function harnessKeyCustody(platformName: string = platform()): HmacKeyCustody {
  if (platformName === 'darwin') {
    return new KeychainHmacKeyCustody(new SecurityCommandRunner());
  }
  return new UnavailableHmacKeyCustody(
    `no redaction key source on ${platformName}: v1 provisions Keychain custody on darwin only`,
  );
}

/** Build the registry and open the boundary. Never throws; a refusal is a state. */
export async function openHarnessRedactionBoundary(
  environment: HarnessEnvironment,
  options: HarnessBoundaryOptions = {},
): Promise<RedactionBoundary> {
  const normalized = normalizeHarnessEnvironment(environment);
  const registry = new SecretRegistry();
  registry.loadFromEnv(normalized, { ignore: [...HARNESS_MANIFEST_NAMES] });
  registry.loadFromManifest(HARNESS_SECRET_MANIFEST, normalized);
  return RedactionBoundary.open({
    registry,
    keyCustody: options.keyCustody ?? harnessKeyCustody(options.platformName),
    mode: 'replace',
  });
}

/** The one line a refusing harness prints. Code only — a refusal detail may name variables, never values, but the line carries neither. */
export function redactionRefusalLine(code: RefusalCode): string {
  return `redaction refused: ${code}\n`;
}

export function isRedactionRefusal(error: unknown): error is RedactionRefusedError {
  return error instanceof RedactionRefusedError;
}

/** The harness's redacted output paths, all over one ready boundary. */
export interface RedactedHarnessStreams {
  /** Redacted text to stdout, through the package's `HarnessLogSink`. */
  log(text: string): Promise<void>;
  /**
   * Redacted plain text to stderr. `HarnessLogSink` v0 has a flattened-error
   * path but no plain-text stderr path, so this goes through the boundary's
   * redactor directly; the package is pinned and is not changed by this lane.
   */
  err(text: string): Promise<void>;
  /** A flattened, redacted error to stderr, through `HarnessLogSink.error`. */
  error(error: unknown): Promise<RedactedError>;
}

export function redactedHarnessStreams(
  boundary: RedactionBoundary,
  streams: HarnessStreams,
): RedactedHarnessStreams {
  const sink = boundary.harnessLogSink(streams);
  return {
    log: (text) => sink.log(text),
    err: async (text) => {
      streams.err(boundary.require().redactString(text));
    },
    error: (error) => sink.error(error),
  };
}

/** The process streams, as the package's `HarnessStreams`. */
export function processHarnessStreams(): HarnessStreams {
  return {
    out: (text) => {
      process.stdout.write(text);
    },
    err: (text) => {
      process.stderr.write(text);
    },
  };
}
