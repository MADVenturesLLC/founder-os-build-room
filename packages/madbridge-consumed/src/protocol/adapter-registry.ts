/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/protocol/src/adapter-registry.ts
 * Blob:   9c8a33eac268d3032bb3ecc4fe36ca151382461f (pinned in DEC-20260827-01 §5)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/protocol/src/adapter-registry.ts
// The closed, Founder-approved, compile-time adapter registry — the sole
// production admission source for surfaces. Admission reads only this
// registry (spec §9.1); no other production module contains a
// surface-admission list (packages/policy/** excluded by documented
// disposition, Q4 of the Task 6 architecture contract).

import { parseSurfaceId, type SurfaceId } from "./surface-id.js";
import { normalizeIdentifier, normalizeIndependenceDomain } from "./normalization.js";

export interface AdapterRegistrationV1 {
  readonly surface: SurfaceId;
  readonly executable_name: string;
  readonly provider: string;
  readonly supported_versions: readonly string[];
  readonly identity_probe: { readonly argv: readonly string[]; readonly parse: "json" | "kv" };
  readonly auth_readiness_probe: { readonly argv: readonly string[]; readonly parse: "json" | "kv" } | null;
  readonly non_interactive_flags: readonly string[];
  readonly environment_allowlist_ref: string;
  readonly independence_domain: string;
  readonly organization_id: string;
  readonly auth_failure_detection: readonly string[];
  readonly limitations: readonly string[];
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

const CLAUDE_CODE_REGISTRATION: AdapterRegistrationV1 = deepFreeze({
  surface: parseSurfaceId("claude-code"),
  executable_name: "madbridge-claude-v5",
  provider: "anthropic",
  supported_versions: ["2.1.233"],
  identity_probe: {
    argv: ["--print", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--no-session-persistence"],
    parse: "json",
  },
  auth_readiness_probe: { argv: ["auth", "status"], parse: "json" },
  non_interactive_flags: ["--print", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--no-session-persistence"],
  environment_allowlist_ref: "claude-code-v1",
  independence_domain: "anthropic",
  organization_id: "anthropic",
  auth_failure_detection: [
    "auth_status_exit_code:1",
    "system/api_retry.error:authentication_failed",
    "system/api_retry.error:oauth_org_not_allowed",
  ],
  limitations: [
    "fable is requested intent only; live eligibility requires exact equality with system/init.model",
  ],
});

const ANTIGRAVITY_REGISTRATION: AdapterRegistrationV1 = deepFreeze({
  surface: parseSurfaceId("antigravity"),
  executable_name: "agy",
  provider: "google",
  supported_versions: ["1.1.13"],
  identity_probe: { argv: ["config", "get", "model"], parse: "kv" },
  auth_readiness_probe: null,
  non_interactive_flags: [],
  environment_allowlist_ref: "antigravity-v1",
  independence_domain: "google",
  organization_id: "google",
  auth_failure_detection: [],
  limitations: [
    "configuration-only identity evidence — no actual-session identity primitive exists",
    "no documented non-mutating non-interactive auth-readiness primitive",
  ],
});

const ENTRIES: readonly (readonly [SurfaceId, AdapterRegistrationV1])[] = [
  [parseSurfaceId("claude-code"), CLAUDE_CODE_REGISTRATION],
  [parseSurfaceId("antigravity"), ANTIGRAVITY_REGISTRATION],
];

for (const [, entry] of ENTRIES) {
  if (normalizeIdentifier(entry.provider) !== entry.provider) {
    throw new Error(`adapter-registry: provider is not canonically normalized: ${entry.provider}`);
  }
  if (normalizeIdentifier(entry.organization_id) !== entry.organization_id) {
    throw new Error(`adapter-registry: organization_id is not canonically normalized: ${entry.organization_id}`);
  }
  if (normalizeIndependenceDomain(entry.independence_domain) !== entry.independence_domain) {
    throw new Error(`adapter-registry: independence_domain is not canonically normalized: ${entry.independence_domain}`);
  }
}

// Module-private backing store. Never exported; never mutated after this line.
const mutableRegistry = new Map<SurfaceId, AdapterRegistrationV1>(ENTRIES);

function freezeRegistryFacade(
  source: Map<SurfaceId, AdapterRegistrationV1>,
): ReadonlyMap<SurfaceId, AdapterRegistrationV1> {
  const facade: ReadonlyMap<SurfaceId, AdapterRegistrationV1> = {
    get: (key) => source.get(key),
    has: (key) => source.has(key),
    entries: () => source.entries(),
    keys: () => source.keys(),
    values: () => source.values(),
    forEach: (callbackfn, thisArg?) => {
      // Never delegate source.forEach directly: Map.prototype.forEach passes the
      // backing Map to the callback as its third argument. Always substitute the
      // frozen facade so no callback can ever capture a mutable Map reference.
      source.forEach((value, key) => callbackfn.call(thisArg, value, key, facade));
    },
    [Symbol.iterator]: () => source[Symbol.iterator](),
    get size() {
      return source.size;
    },
  };
  return Object.freeze(facade);
}

export const ADAPTER_REGISTRY: ReadonlyMap<SurfaceId, AdapterRegistrationV1> =
  freezeRegistryFacade(mutableRegistry);

export function lookupRegistration(surface: SurfaceId): AdapterRegistrationV1 | undefined {
  return ADAPTER_REGISTRY.get(surface);
}
