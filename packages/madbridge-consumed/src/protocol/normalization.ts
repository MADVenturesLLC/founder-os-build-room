/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/protocol/src/normalization.ts
 * Blob:   3408f90a058c36cf543af95f2a45cc019519167a (unpinned dependency, consumed under the Founder ruling of 2026-10-15)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/protocol/src/normalization.ts
// Pinned independence-domain and identifier normalization.

const INDEPENDENCE_DOMAIN_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export class NormalizationError extends Error {
  constructor(
    public readonly kind: "independence_domain" | "identifier",
    public readonly input: string,
  ) {
    super(`invalid ${kind}`);
    this.name = "NormalizationError";
  }
}

export function normalizeIndependenceDomain(raw: string): string {
  const normalized = raw
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  if (!INDEPENDENCE_DOMAIN_PATTERN.test(normalized)) {
    throw new NormalizationError("independence_domain", raw);
  }
  return normalized;
}

export function normalizeIdentifier(raw: string): string {
  const normalized = raw.normalize("NFKC").trim().toLowerCase();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new NormalizationError("identifier", raw);
  }
  return normalized;
}
