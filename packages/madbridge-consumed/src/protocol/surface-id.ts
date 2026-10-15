/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/protocol/src/surface-id.ts
 * Blob:   17d65c77be8c55073492b4d0d3f9ed0d7c7b87d8 (unpinned dependency, consumed under the Founder ruling of 2026-10-15)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/protocol/src/surface-id.ts
// Branded SurfaceId with syntax-only validation. Syntax is not eligibility.

export type SurfaceId = string & { readonly __brand: "SurfaceId" };

export const SURFACE_ID_PATTERN: RegExp = /^[a-z][a-z0-9-]{1,63}$/;

export class InvalidSurfaceIdError extends Error {
  constructor() {
    super("invalid surface id");
    this.name = "InvalidSurfaceIdError";
  }
}

export function isSurfaceIdSyntax(raw: string): boolean {
  return SURFACE_ID_PATTERN.test(raw);
}

export function parseSurfaceId(raw: string): SurfaceId {
  if (!isSurfaceIdSyntax(raw)) {
    throw new InvalidSurfaceIdError();
  }
  return raw as SurfaceId;
}
