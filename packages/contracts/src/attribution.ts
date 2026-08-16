/**
 * Attribution and the recorded shape of every accepted transition.
 *
 * Source of truth:
 *  - `DEC-20260815-11` v0.10 `## Context`, restating architecture §3.8: every
 *    transition records its accountable ROLE, ACTUAL MODEL and SURFACE, SCOPE,
 *    EVIDENCE, and RESULTING STATE.
 *  - `DEC-20260815-18` — the Build Room adopts FounderOS attribution
 *    conventions (`DEC-20260718-05` trailers) as a CONVENTION, not as a second
 *    governance authority.
 *
 * "Actual model" is deliberately distinct from any nominal or configured model:
 * `DEC-20260718-05` attribution is about what actually performed the work.
 */

/**
 * The role roster eligible for attributed work.
 *
 * ============================ DELIBERATE ASYMMETRY ============================
 * The canonical registry in FounderOS `/04-agents/role-registry.md` holds THIRTY
 * roles. This list holds TWENTY-NINE, and matches `ROLE_ID_REGEX` in
 * `scripts/attribution-shape-check.sh` exactly.
 *
 * `investment-acquisition-lead` is ratified as to its authority boundary but is
 * `activation_status: deferred` — non-assignable, non-routable, and ineligible
 * for attributed work until a separate explicit Founder activation ruling
 * (`DEC-20260812-03`, Founder ruling 2026-08-12).
 *
 * Excluding it here is how that invariant is ENFORCED rather than merely
 * documented. Restoring it would silently delete the control. Adding it
 * requires a Founder activation ruling, applied to this list AND to the gate
 * script's regex in the same change.
 * =============================================================================
 */
export const ROLE_IDS = [
  'strategist',
  'architect',
  'builder',
  'researcher',
  'experience-architect',
  'independent-reviewer',
  'product-lead',
  'brand-lead',
  'marketing-lead',
  'operations-lead',
  'finance-lead',
  'legal-risk',
  'qa-lead',
  'pre-mortem-reviewer',
  'chief-of-staff',
  'deputy-chief-of-staff',
  'founder-mirror',
  'chief-strategy-officer',
  'chief-operating-officer',
  'chief-financial-officer',
  'chief-marketing-creative-officer',
  'chief-compliance-officer',
  'security-lead',
  'data-intelligence-lead',
  'reliability-lead',
  'portfolio-venture-lead',
  'growth-commercial-lead',
  'innovation-futures-lead',
  'program-execution-lead',
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === 'string' && (ROLE_IDS as readonly string[]).includes(value);
}

/**
 * The accountable attribution carried by every transition-bearing event.
 *
 * `roleId` is null ONLY for direct-Founder work, mirroring the trailer rule
 * that `Role-Id: founder` is invalid and direct-Founder work is recorded as
 * `Actor-Id: founder` standing alone (`DEC-20260718-05`).
 */
export interface Attribution {
  /** Accountable role, or null for direct-Founder work. */
  readonly roleId: RoleId | null;
  /** Who directly performed the work: `founder`, or a session/surface-scoped id. */
  readonly actorId: string;
  /** The model that ACTUALLY performed the work, not a nominal or configured one. */
  readonly actualModel: string;
  /** A `surface_id` from the execution-surface registry. */
  readonly executionSurface: string;
}

/** The scope a transition acts within. */
export interface Scope {
  readonly roomId: string;
  readonly repo: string;
  readonly paths: readonly string[];
}

/** A reference to evidence backing a transition. Opaque to the pure core. */
export interface EvidenceRef {
  readonly kind: string;
  readonly ref: string;
  readonly digest: string;
}

export function isAttributionShapeValid(attribution: Attribution): boolean {
  const actorOk = typeof attribution.actorId === 'string' && attribution.actorId.trim() !== '';
  const modelOk =
    typeof attribution.actualModel === 'string' && attribution.actualModel.trim() !== '';
  const surfaceOk =
    typeof attribution.executionSurface === 'string' && attribution.executionSurface.trim() !== '';
  if (!actorOk || !modelOk || !surfaceOk) {
    return false;
  }
  if (attribution.roleId === null) {
    // Direct-Founder work: the actor must actually be the founder.
    return attribution.actorId === 'founder';
  }
  return isRoleId(attribution.roleId);
}
