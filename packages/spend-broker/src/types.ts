/**
 * Public result types for `@build-room/spend-broker` — Work ID
 * `GLM-20260913-SPEND-BROKER-V0`.
 *
 * The claim this package is allowed to carry is `SPEND_BROKER_V0` /
 * `COST_CEILING_ENFORCEMENT` and nothing else — see `claims.ts` for the
 * forbidden list and what these types are **not** evidence of.
 *
 * The shapes below are the commissioned ones. Two additions are made and both
 * are recorded here rather than smuggled in:
 *
 * - `MintResult` denial results may carry a `detail` of the meter's limb
 *   reasons. A bare `spend_ceiling_exceeded` would hide WHICH limb paused
 *   (monthly spend, per-room tokens, per-run cap, or invalid token inputs),
 *   and the meter's own design says the blocked state is most useful when it
 *   names everything that is wrong. The reason union itself is unchanged.
 * - `estimatedCost` on `MintRequest` is expressed in **tokens**, not dollars.
 *   The name follows the commission's `MintRequest` shape; the unit choice is
 *   a decision made here and recorded because the meter reserves in tokens
 *   (`DEC-20260815-16` clause 2) and converting a dollar estimate to tokens
 *   would require inventing a price conversion this package does not own
 *   (`DEC-20260722-01` clause 1 puts rates elsewhere, deliberately).
 */

/**
 * A short-lived credential handle. Branded so a raw provider key can never be
 * assigned into or out of this type by accident — the whole point of the
 * broker is that workers hold handles, never keys.
 */
declare const OPAQUE_BRAND: unique symbol;
export type OpaqueToken = string & { readonly [OPAQUE_BRAND]: true };

/** Wrap a gateway-issued handle string. Fixture gateways mint `fix_…` handles. */
export function opaqueToken(value: string): OpaqueToken {
  return value as OpaqueToken;
}

/** What a mint is for. Recorded, never interpreted, by this package. */
export interface MintRequest {
  /** The run asking for the credential. Single-flight is keyed on this. */
  readonly runId: string;
  /**
   * The room the run belongs to, when known. The meter's per-room token
   * ceiling needs a room to check against; the meter adapter denies a mint
   * with no room fail-closed rather than skipping the limb.
   */
  readonly roomId?: string;
  /** Provider the credential is for, e.g. a model provider identifier. */
  readonly provider: string;
  readonly purpose: string;
  /**
   * Estimated cost of the minted turn, in **tokens** (see the header). Must be
   * a non-negative safe integer when present; anything else fails closed at
   * the meter's token-inputs limb. Consulted only for `api` mints.
   */
  readonly estimatedCost?: number;
  /**
   * What class of credential this mint is for. Default `'api'` — the
   * fail-closed default, since the unmarked case is the metered one.
   *
   * - `'api'`: metered provider API usage. Ceiling-gated: a breach denies the
   *   mint and emits an interrupt frame.
   * - `'oauth'`: OAuth / subscription-backed authorization. **Not
   *   ceiling-gated** — Founder ruling on this work, 2026-09-13, recorded
   *   verbatim: "Only API ceiling is $85. OAuth should be unlimited." No
   *   meter call, no reservation, no spend-ground interrupt. Gateway
   *   refusals (`not_authorized`, `unavailable`) still deny — unlimited is
   *   not ungated from the gateway.
   */
  readonly credentialKind?: 'api' | 'oauth';
}

export type MintDenialReason =
  | 'spend_ceiling_exceeded'
  | 'not_authorized'
  | 'provider_unavailable'
  | 'single_flight_busy';

export interface MintedResult {
  readonly ok: true;
  readonly token: OpaqueToken;
  /** Epoch ms. Broker-assigned in v0 (`tokenTtlMs`); see README. */
  readonly expiresAt: number;
  /**
   * Tokens still available in the room after this mint's reservation.
   * Present for `api` mints, which are ceiling-gated. **Absent for `oauth`
   * mints** — no budget was consulted (unlimited per the 2026-09-13 Founder
   * ruling), so no budget figure is reported rather than a misleading one.
   */
  readonly budgetRemaining?: number;
}

export interface MintDeniedResult {
  readonly ok: false;
  readonly reason: MintDenialReason;
  /** Why, per limb — populated for `spend_ceiling_exceeded`. */
  readonly detail?: readonly string[];
  /** The interrupt frame emitted, for ceiling denials. */
  readonly interrupt?: InterruptFrame;
}

export type MintResult = MintedResult | MintDeniedResult;

/**
 * Emitted when a mint or refresh would breach the spend ceiling. The shape's
 * required fields are commissioned; `roomId` and `detail` are additive so the
 * frame is actionable without re-deriving which limb fired.
 */
export interface InterruptFrame {
  readonly type: 'interrupt';
  readonly reason: 'spend_ceiling_exceeded';
  readonly runId: string;
  /** Epoch ms of the denial, from the broker's clock. */
  readonly at: number;
  readonly roomId?: string;
  readonly detail?: readonly string[];
}

/** Where interrupt frames go. v0 ships a recording fixture, not a worker. */
export interface InterruptSink {
  emit(frame: InterruptFrame): void;
}

export interface ReservationView {
  readonly runId: string;
  readonly roomId?: string;
  /** Tokens held against the room's ceiling until `expiresAt`. */
  readonly tokens: number;
  readonly expiresAt: number;
}
