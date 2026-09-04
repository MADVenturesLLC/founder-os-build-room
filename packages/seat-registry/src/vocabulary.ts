/**
 * Seat Registry V1 — vocabulary, identity, and attention mapping.
 *
 * Ratified plan: docs/planning/seat-registry-v1/seat-registry-v1-implementation-plan-r7-DRAFT.md
 *   (sha256 b1bc4159b8cdb1ce6c342d84b4be3650a340abfc467624154ea5ba2a54815b60)
 * Governing decision: DEC-20260902-02 (FounderOS 8198ecf002324cc4e00cf035c7cb98c6de0bc746).
 * Doctrine/fixture pin: FounderOS bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda.
 *
 * §1.1: seats are the four existing canonical FounderOS role IDs.
 * §1.2: display names come from the FOUNDER RULING — SEAT REGISTRY V1 RESERVED
 *       ITEMS (PR #15 comment 5503747619); they are never authority identifiers,
 *       role aliases, routing identities, journal identities, or handoff targets.
 */

/** §1.1 — each seat_id is a role_id in the 30-role registry (DEC-20260812-03). */
export type SeatId = 'researcher' | 'architect' | 'builder' | 'independent-reviewer';

/** The four canonical seat IDs, in canonical order. */
export const SEAT_IDS: readonly SeatId[] = [
  'researcher',
  'architect',
  'builder',
  'independent-reviewer',
] as const;

export function isSeatId(value: unknown): value is SeatId {
  return typeof value === 'string' && (SEAT_IDS as readonly string[]).includes(value);
}

/** §1.2 — one display name per seat, from the RESERVED ITEMS ruling. */
export const DISPLAY_NAMES: Readonly<Record<SeatId, string>> = {
  researcher: 'Aletheia',
  architect: 'Daedalus',
  builder: 'Hephaestus',
  'independent-reviewer': 'Argus',
};

const DISPLAY_NAME_VALUES: readonly string[] = SEAT_IDS.map((s) => DISPLAY_NAMES[s]);

/** §1.2 — display names are never seat ids, Role-Id values, or surface values. */
export function isDisplayName(value: unknown): value is string {
  return typeof value === 'string' && DISPLAY_NAME_VALUES.includes(value);
}

/**
 * §2.2 — provider classes, derived per the §2.2 precedence, never asserted:
 * (1) controlling Founder decision → (2) canonical registry classification →
 * (3) exact P1–P5 token or authorized prefix → (4) NOT_RECORDED.
 */
export type ProviderClass = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'NOT_RECORDED';

/** §2.4 — data classes per DEC-20260716-01. */
export type DataClass = 'public' | 'internal' | 'confidential' | 'restricted' | 'local-only';

/**
 * §2.3 — the model-level DEC-20260716-02 item-2 ladder, mirrored from the model
 * registry's portfolio_classification field. The registry mirrors, never assigns.
 */
export type BindingLadderStatus =
  | 'approved-binding'
  | 'proposed-binding'
  | 'implementation-observed'
  | 'temporary-task-assignment'
  | 'evaluation-candidate'
  | 'watchlist'
  | 'rejected'
  | 'unverified'
  | 'deprecated';

export const BINDING_LADDER: readonly BindingLadderStatus[] = [
  'approved-binding',
  'proposed-binding',
  'implementation-observed',
  'temporary-task-assignment',
  'evaluation-candidate',
  'watchlist',
  'rejected',
  'unverified',
  'deprecated',
] as const;

/**
 * §2.3 — the role-level binding_status field the role registry declares (:101)
 * and carries (researcher row :307) at the doctrine pin; DEC-20260721-04 item 1.
 */
export type RoleBindingStatus =
  | 'active'
  | 'approved'
  | 'proposed'
  | 'unassigned'
  | 'accountability-approved';

export const ROLE_BINDING_STATUSES: readonly RoleBindingStatus[] = [
  'active',
  'approved',
  'proposed',
  'unassigned',
  'accountability-approved',
] as const;

/**
 * §2.7 — per-seat terminal statuses, read from each seat contract (below).
 * Test 7 proves none collides with any ratified closed vocabulary:
 *   - DEC-20260815-11 lifecycle states (packages/contracts STATES)
 *   - the Tier-2 verdict enum {PASS, PASS-WITH-ADVISORIES, FAIL} (DEC-20260826-01)
 *   - contract v0.17 §5 event vocabulary
 *   - the DEC-20260726-01 council roster names
 */
export const SEAT_TERMINAL_STATUSES: Readonly<Record<SeatId, readonly string[]>> = {
  researcher: [
    'RESEARCH_READY',
    'INCONCLUSIVE_EVIDENCE',
    'BLOCKED_MISSING_SOURCE',
    'BLOCKED_MISSING_AUTHORITY',
  ],
  architect: [
    'PLAN_READY_FOR_FOUNDER_APPROVAL',
    'BLOCKED_RESEARCH_GAP',
    'BLOCKED_REPOSITORY_DRIFT',
    'BLOCKED_FOUNDER_DECISION',
    'INCONCLUSIVE_ARCHITECTURE',
  ],
  builder: [
    'BUILD_READY_FOR_INDEPENDENT_VERIFICATION',
    'MATERIAL_PLAN_DRIFT',
    'BLOCKED_ENVIRONMENT_MISMATCH',
    'BLOCKED_TEST_FAILURE',
    'BLOCKED_MISSING_AUTHORIZATION',
    'INCOMPLETE_BUILD',
  ],
  'independent-reviewer': ['SEAT_VERIFIED', 'SEAT_REQUEST_CHANGES', 'SEAT_INCONCLUSIVE'],
};

export function isTerminalStatusFor(seat: SeatId, status: string): boolean {
  return (SEAT_TERMINAL_STATUSES[seat] as readonly string[]).includes(status);
}

/** §2.7 — AttentionState mapping (test 11): total over SEAT_TERMINAL_STATUSES[seat] ∪ {null}. */
export type AttentionState = 'working' | 'blocked' | 'done';

/** Explicit total mapping: null → working; ready/finished → done; all else → blocked. */
const ATTENTION_MAP: Readonly<Record<SeatId, Readonly<Record<string, AttentionState>>>> = {
  researcher: {
    RESEARCH_READY: 'done',
    INCONCLUSIVE_EVIDENCE: 'blocked',
    BLOCKED_MISSING_SOURCE: 'blocked',
    BLOCKED_MISSING_AUTHORITY: 'blocked',
  },
  architect: {
    PLAN_READY_FOR_FOUNDER_APPROVAL: 'done',
    BLOCKED_RESEARCH_GAP: 'blocked',
    BLOCKED_REPOSITORY_DRIFT: 'blocked',
    BLOCKED_FOUNDER_DECISION: 'blocked',
    INCONCLUSIVE_ARCHITECTURE: 'blocked',
  },
  builder: {
    BUILD_READY_FOR_INDEPENDENT_VERIFICATION: 'done',
    MATERIAL_PLAN_DRIFT: 'blocked',
    BLOCKED_ENVIRONMENT_MISMATCH: 'blocked',
    BLOCKED_TEST_FAILURE: 'blocked',
    BLOCKED_MISSING_AUTHORIZATION: 'blocked',
    INCOMPLETE_BUILD: 'blocked',
  },
  'independent-reviewer': {
    SEAT_VERIFIED: 'done',
    SEAT_REQUEST_CHANGES: 'blocked',
    SEAT_INCONCLUSIVE: 'blocked',
  },
};

/**
 * §2.7 — total over SEAT_TERMINAL_STATUSES[seat] ∪ {null}; a status outside
 * the seat's set is rejected, not mapped.
 */
export function toAttentionState(seat: SeatId, status: string | null): AttentionState {
  if (status === null) {
    return 'working';
  }
  const mapped = ATTENTION_MAP[seat][status];
  if (mapped === undefined) {
    throw new RangeError(
      `status ${JSON.stringify(status)} is not a terminal status of seat ${JSON.stringify(seat)}`,
    );
  }
  return mapped;
}
