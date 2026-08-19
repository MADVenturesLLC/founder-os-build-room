/**
 * Actor, attribution, and refusal shapes for the registry (contract §5).
 *
 * These are deliberately NOT `@build-room/contracts`'s `Attribution`. That type
 * describes role-accountable work on the product: an accountable role, the
 * model that actually performed the work, and the surface it ran on. A machine
 * redeeming a pairing code is none of those — it is not a role, no model
 * performed it, and claiming otherwise in an append-only table nothing can
 * delete from would be a false record that could never be corrected.
 *
 * So the registry records what is true about a registry act: who acted, and on
 * what surface.
 */

import { GATEWAY_EVENT_TYPES } from '../../../gateway-registry/src/index.js';

export type GatewayActor =
  | { readonly kind: 'founder' }
  | { readonly kind: 'gateway'; readonly gatewayId: string }
  | { readonly kind: 'control_plane'; readonly component: string };

export interface GatewayAttribution {
  /** Null for direct-Founder work and for machine-originated acts alike. */
  readonly roleId: string | null;
  readonly actorId: string;
  readonly executionSurface: string;
}

export const FOUNDER_ACTOR: GatewayActor = { kind: 'founder' };

export const FOUNDER_ATTRIBUTION: GatewayAttribution = {
  roleId: null,
  actorId: 'founder',
  executionSurface: 'control-plane',
};

export function gatewayActor(gatewayId: string): GatewayActor {
  return { kind: 'gateway', gatewayId };
}

export const GATEWAY_ATTRIBUTION: GatewayAttribution = {
  roleId: null,
  actorId: 'gateway',
  executionSurface: 'gateway-daemon',
};

export function controlPlaneActor(component: string): GatewayActor {
  return { kind: 'control_plane', component };
}

export function controlPlaneAttribution(component: string): GatewayAttribution {
  return { roleId: null, actorId: `control-plane:${component}`, executionSurface: 'control-plane' };
}

/**
 * The closed set of pairing-flow refusal kinds (§5 table 5).
 *
 * Stated here and compared against the migration's CHECK constraint by
 * `gateway-registry-immutability.storage.test.ts`, for the same reason the
 * lifecycle vocabulary is: the shipped DDL must not be regenerated from a
 * constant, and two hand-written copies must not be allowed to drift.
 */
export const ENROLLMENT_REFUSAL_KINDS = [
  'unknown_code',
  'code_expired',
  'code_consumed',
  'idempotency_key_mismatch',
  'malformed_pubkey',
  'invalid_request',
  'fingerprint_mismatch',
  'not_awaiting_approval',
  'another_gateway_enrolled',
] as const;

export type EnrollmentRefusalKind = (typeof ENROLLMENT_REFUSAL_KINDS)[number];

/** Re-exported so callers need one import for the registry's vocabularies. */
export { GATEWAY_EVENT_TYPES };

/**
 * The literal that stands in for every unresolved key identity in the
 * aggregation table (§5 table 6, correction C6).
 *
 * One literal, not a per-presentation value: a presented key id an attacker
 * chose must never become a durable aggregation key, or a flood of invented
 * ids mints a row per attempt in a table with a ninety-day retention.
 */
export const UNRESOLVED_KEY_ID = 'unknown';
