/**
 * Seat Registry V1 — schema (§2.7).
 *
 * Ratified plan: seat-registry-v1-implementation-plan-r7-DRAFT.md
 * (sha256 b1bc4159b8cdb1ce6c342d84b4be3650a340abfc467624154ea5ba2a54815b60),
 * governing DEC-20260902-02, doctrine/fixture pin FounderOS bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda.
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

/** §2.7 — one routing lane, mirrored from the controlling registries. */
export interface SeatRoutingLane {
  readonly lane_label: string;
  readonly provider: string;
  readonly surface_id: string;
  readonly model_id: string;
  readonly binding_status: BindingLadderStatus;
  readonly binding_class: string;
  readonly mode?: string;
  readonly tier2_attestation_id?: string;
  readonly provider_class: ProviderClass;
  readonly data_eligibility: readonly DataClass[];
  readonly conditions: readonly string[];
  readonly derivation: readonly string[];
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
  readonly authority: {
    readonly allowed: readonly string[];
    readonly prohibited: readonly string[];
    readonly enforcement: 'behavioral';
  };
  readonly handoff: SeatHandoff;
}
