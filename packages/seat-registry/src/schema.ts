/**
 * Seat Registry V1 — schema (§2.7).
 *
 * Ratified plan: seat-registry-v1-implementation-plan-r7-DRAFT.md
 * (sha256 b1bc4159b8cdb1ce6c342d84b4be3650a340abfc467624154ea5ba2a54815b60),
 * governing DEC-20260902-02, doctrine/fixture pin FounderOS c788495466db52e576a58d0856345e41fdcac9cb
 * (re-pinned from the plan's 8d09e7e… under DEC-20261020-01, then from 846190f…
 * and from d3049d9…; see fixtures.ts).
 *
 * DEC-20261020-01 clause 1 changes the §2.7 lane: a Build Room builder seat
 * lane or a Tier-2 lane is a `surface:provider` token (`SurfaceProviderLane`);
 * a builder lane adds an allowlist, and a Tier-2 lane, under the clause as
 * its Amendment 4 amends it, has none. Every other lane stays model-exact
 * (`ModelExactLane`). Lanes the clause 2 table drops are kept as
 * `not_approved_lanes` records, outside `routing`.
 *
 * These interfaces reproduce the plan's §2.7 declarations. `routing` is an array,
 * not a `{ primary, fallback }` pair, because an empty routing set and a
 * single-lane set are both valid V1 outcomes.
 */

import type {
  BindingLadderStatus,
  DataClass,
  ProviderClass,
  RoleBindingStatus,
  SeatId,
} from './vocabulary.js';

/** §2.7 — the fields every routing lane carries, mirrored from the controlling registries. */
interface SeatRoutingLaneBase {
  readonly lane_label: string;
  readonly provider: string;
  readonly surface_id: string;
  readonly binding_status: BindingLadderStatus;
  readonly binding_class: string;
  readonly mode?: string;
  readonly provider_class: ProviderClass;
  readonly data_eligibility: readonly DataClass[];
  readonly conditions: readonly string[];
  readonly derivation: readonly string[];
}

/**
 * §2.7 — a lane bound to one exact model. Every binding outside
 * DEC-20261020-01's scope stays this shape (clause 1: "All other role
 * bindings ... stay model-exact as they stand"), the architect's lanes
 * among them.
 */
export interface ModelExactLane extends SeatRoutingLaneBase {
  readonly model_id: string;
  readonly tier2_attestation_id?: string;
  readonly lane?: never;
  readonly allowlist?: never;
}

/**
 * DEC-20261020-01 clauses 1 and 2 — a Build Room builder seat lane or an
 * `independent-reviewer` Tier-2 lane: a `surface:provider` token, as the
 * model registry's Lanes table gives it. `lane` is always
 * `${surface_id}:${provider}`.
 *
 * `allowlist` is the lane's closed list of model ids on a builder lane, and
 * `null` on a Tier-2 lane: FOUNDER-RULING-20261118-TIER2-SURFACE-LANES
 * (Amendment 4 to DEC-20261020-01) binds the four Tier-2 lanes to their
 * surface and provider alone, a review on one "may run on any model the
 * surface serves from that provider" (B1), and the review announces its
 * model in its `Tier2-Reviewer-Model:` line (B2). Builder lanes keep their
 * allowlists (B5). The model that served a piece of work is recorded per
 * piece of work (clause 3), never pinned here, and the Tier-2 attestation
 * token is the surface (clause 6), so neither `model_id` nor
 * `tier2_attestation_id` exists on this shape.
 */
export interface SurfaceProviderLane extends SeatRoutingLaneBase {
  readonly lane: string;
  readonly allowlist: readonly string[] | null;
  readonly model_id?: never;
  readonly tier2_attestation_id?: never;
}

/** §2.7 — one routing lane. */
export type SeatRoutingLane = ModelExactLane | SurfaceProviderLane;

export function isSurfaceProviderLane(lane: SeatRoutingLane): lane is SurfaceProviderLane {
  return lane.lane !== undefined;
}

/**
 * The model ids a lane lists: its allowlist, its one exact model, or none for
 * a Tier-2 lane, which binds to its surface and provider alone and may serve
 * any model the surface serves from that provider (Amendment 4, B1). An empty
 * result on a Tier-2 lane therefore means "no list", not "no model".
 */
export function laneModelIds(lane: SeatRoutingLane): readonly string[] {
  if (!isSurfaceProviderLane(lane)) return [lane.model_id];
  return lane.allowlist ?? [];
}

/**
 * A lane a seat carried before DEC-20261020-01 that the clause 2 table does
 * not carry. Clause 2: "A lane in scope or a model not in it is not approved
 * for that lane." The record is kept as it was bound, outside `routing`, so
 * nothing that reads `routing` can select it.
 */
export interface NotApprovedLane {
  readonly record: ModelExactLane;
  readonly reason: string;
}

/** §2.7 — handoff record; authorization_refs are references only, never adjudicated. */
export interface SeatHandoff {
  readonly receives_from: SeatId | null;
  readonly produces: string;
  readonly terminal_status: string;
  readonly committed_sha: string;
  readonly authorization_refs: readonly string[];
}

/** §2.7 — one seat registration. */
export interface SeatRegistrationV1 {
  readonly seat_id: SeatId;
  readonly display_name: string;
  readonly role_binding_status: RoleBindingStatus;
  readonly mission: string;
  readonly contract_ref: string;
  readonly contract_sha256: string;
  readonly default_surface: string | null;
  readonly routing: readonly SeatRoutingLane[];
  readonly absent_lanes: readonly { label: string; reason: string }[];
  readonly not_approved_lanes: readonly NotApprovedLane[];
  readonly authority: {
    readonly allowed: readonly string[];
    readonly prohibited: readonly string[];
    readonly enforcement: 'behavioral';
  };
  readonly handoff: SeatHandoff;
}
