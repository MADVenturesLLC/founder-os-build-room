/**
 * The ports the broker is built against. Everything live is behind one of
 * these; v0 ships fixtures only.
 *
 * `CostMeterPort` is deliberately narrow: "spent + reserved vs ceiling" is the
 * only question the broker is allowed to ask, and the answer comes back as a
 * verdict, not as raw counters. The ceiling RULE lives in
 * `@build-room/cost-meter` — this package never re-implements a boundary
 * comparison. `MeterCeilingPort` (see `cost-meter-adapter.ts`) is the adapter
 * to the live meter's public API; `StaticCostMeterPort` (see `fixtures.ts`)
 * is the test fixture.
 *
 * `GatewayPort` is commissioned verbatim: one method, `mintProviderAuth`. In
 * v0 it mints fixture handles. It is NOT `packages/gateway-daemon` and never
 * contacts it — the daemon is the AE-01 A2 candidate and is frozen; the real
 * integration is a later, separately authorized act.
 *
 * The meter port is synchronous because the meter itself is pure — zero I/O,
 * no clock, everything arrives as arguments (see `packages/cost-meter`). A
 * future live adapter that must read a store will either pre-read and pass
 * the snapshot in, or this port gains a `Promise` — that is a v1 decision,
 * recorded here so nobody "temporarily" makes the broker guess.
 */

import type { MintRequest, OpaqueToken } from './types.js';

/** The question a mint puts to the ceiling: may this many more tokens commit? */
export interface CeilingQuery {
  readonly runId: string;
  readonly roomId?: string;
  /** Tokens this mint would add, on top of everything already committed. */
  readonly requestedTokens: number;
}

export interface CeilingPermit {
  readonly ok: true;
  /** The room's token ceiling the verdict was evaluated against. */
  readonly ceilingTokens: number;
  /** Spent + reserved BEFORE this mint's request is added. */
  readonly committedTokens: number;
  /** Ceiling minus the projected post-mint commitment. */
  readonly remainingTokens: number;
}

export interface CeilingDeny {
  readonly ok: false;
  /** Per-limb reasons, in the meter's evaluation order. Fail-closed denials
   *  (missing room, uncheckable inputs) surface here as reasons, not throws. */
  readonly reasons: readonly string[];
}

export type CeilingVerdict = CeilingPermit | CeilingDeny;

export interface CostMeterPort {
  checkCeiling(query: CeilingQuery): CeilingVerdict;
}

export interface GatewayPort {
  mintProviderAuth(request: MintRequest): Promise<OpaqueToken>;
}

export type GatewayFailureKind = 'not_authorized' | 'unavailable';

/**
 * A gateway refusal, as data rather than a string. An `unavailable` gateway
 * must deny the mint (`provider_unavailable`), never silently succeed; an
 * authorization refusal maps to `not_authorized`. Any OTHER throw from a
 * gateway is treated as `unavailable` by the broker — fail-closed, because a
 * gateway that errors unexpectedly has not issued a credential, and reporting
 * success on a throw is the one direction this package must never go.
 */
export class GatewayError extends Error {
  readonly kind: GatewayFailureKind;

  constructor(kind: GatewayFailureKind, message: string) {
    super(message);
    this.name = 'GatewayError';
    this.kind = kind;
  }
}
