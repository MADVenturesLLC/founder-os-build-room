/**
 * Seat Registry V1 — `resolveSeat`, fail-closed (§3, §3.1, §3.2).
 *
 * `resolved` is returned only when at least one lane is a standing route —
 * which in V1 is never (§2.5, §14). Every other case returns a `RefusedSeat`
 * with its class, its reason named, and — where the seat exists — the
 * registration and per-lane readiness.
 *
 * A temporary task assignment offered through `presented_authority` is refused
 * under `temporary_task_assignment_not_lane_authority` (§3.2, r7 test 9).
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RATIFIED_SEATS, RESEARCHER_ABSENT_REASON } from './registry-data.js';
import type { SeatRegistrationV1, SeatRoutingLane } from './schema.js';
import { isSeatId } from './vocabulary.js';

export interface LaneReadiness {
  readonly lane_label: string;
  readonly eligible: boolean;
  readonly reason: string | null; // never null when eligible === false
}

/**
 * §3.1 — readiness proves credentials, never capacity (incident R-5.4.02:
 * PONG passed while the real workload shed across three pools).
 */
export interface ReadinessProbeRunner {
  probe(lane: SeatRoutingLane): LaneReadiness;
}

/**
 * Default probe: the lane's surface is a registered Build Room surface. It
 * proves registration, never credentials or capacity — no live provider call.
 */
export const DEFAULT_PROBE: ReadinessProbeRunner = {
  probe(lane: SeatRoutingLane): LaneReadiness {
    if (SURFACE_IDS.has(lane.surface_id)) {
      return { lane_label: lane.lane_label, eligible: true, reason: null };
    }
    return {
      lane_label: lane.lane_label,
      eligible: false,
      reason: `surface ${JSON.stringify(lane.surface_id)} is not a registered surface in the vendored execution-surface registry`,
    };
  },
};

/** The six §3.3 coding surfaces (DEC-20260807-01 §3.3, at the doctrine pin). */
const SURFACE_IDS: ReadonlySet<string> = new Set([
  'claude-code',
  'grok-build',
  'codex',
  'cursor',
  'antigravity',
  'hermes-local-code',
]);

export type RefusalClass =
  | 'unknown_seat'
  | 'seat_outside_registry'
  | 'contract_hash_mismatch'
  | 'lane_below_approved_binding'
  | 'lane_not_standing'
  | 'routing_set_empty'
  | 'temporary_task_assignment_not_lane_authority';

export interface ResolvedSeat {
  kind: 'resolved';
  registration: SeatRegistrationV1;
  contract_text: string;
  readiness: readonly LaneReadiness[];
}

export interface RefusedSeat {
  kind: 'refused';
  seat_id: string;
  registration: SeatRegistrationV1 | null; // populated when the seat exists (AC2/3/4/10); null for unknown/outside
  readiness: readonly LaneReadiness[];
  refusal: RefusalClass;
  reason: string; // the status, requirement, precondition, or absence reason, named
  requirement: string | null; // the per-task/per-run/per-invocation Founder act a lane needs, when refusal === 'lane_not_standing'
}

export type SeatResolution = ResolvedSeat | RefusedSeat;

export interface ResolveOptions {
  probes?: ReadinessProbeRunner;
  presented_authority?: { kind: 'temporary-task-assignment'; assignment_ref: string }; // always refused (§3.2)
}

/**
 * The 30 role ids of /04-agents/role-registry.md (DEC-20260812-03), at the
 * doctrine pin. The assignable set is twenty-nine: investment-acquisition-lead
 * is excluded (activation_status: deferred).
 */
const ROLE_REGISTRAR: readonly string[] = [
  'architect',
  'builder',
  'researcher',
  'independent-reviewer',
  'experience-architect',
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
  'investment-acquisition-lead',
];

const ROLE_REGISTRAR_SET: ReadonlySet<string> = new Set(ROLE_REGISTRAR);

/**
 * §3.1 — a lane at approved-binding is a *standing* route only where no
 * per-task Founder authorization, per-run Founder act, manual per-task model
 * selection, or per-invocation precondition blocks standing dispatch. In V1
 * every approved-binding lane falls into one of those categories (§2.5).
 */
const LANE_STANDING_REQUIREMENT: ReadonlyMap<string, string> = new Map([
  // builder lanes (per-task, DEC-20260807-01 / DEC-20260716-02 amendment)
  ['large', 'a per-task Founder-authorized task-scoped assignment, until MP-1 activation'],
  ['large fallback', 'a per-task Founder-authorized task-scoped assignment, until MP-1 activation'],
  ['medium', 'a per-task Founder-authorized task-scoped assignment, until MP-1 activation'],
  ['light', 'a per-task Founder-authorized task-scoped assignment, until MP-1 activation'],
  ['Codex complex / high-risk', 'a per-task Founder-authorized task-scoped assignment; max mode additionally requires an exact Founder authorization and a recorded reason'],
  ['Codex routine / bounded', 'a per-task Founder-authorized task-scoped assignment, until MP-1 activation'],
  ['Hermes local', 'a per-task Founder authorization; only a registered, Founder-approved local model may replace the selection'],
  // architect primary: the Founder's manual per-task model selection (antigravity)
  ['primary', "the Founder's manual per-task model selection on `antigravity`, with the exact model and effort recorded"],
  // architect bounded reconciliation: per-invocation preconditions (DEC-20260807-01 §5.1)
  ['bounded reconciliation', 'its per-invocation preconditions: only after the binding Tier-2 verdict; only by an execution assigned the `architect` or `strategist` stable role; not the binding Tier-2 verdict; does not replace Founder authority; never by the execution that authored the code state'],
  // independent-reviewer tier-2 lanes: per-run Founder act (DEC-20260815-05 clause 2)
  ['tier-2', 'a per-run Founder act naming the reviewer model (DEC-20260815-05 clause 2)'],
]);

function registrationFor(seatId: string): SeatRegistrationV1 | undefined {
  return RATIFIED_SEATS.find((r) => r.seat_id === seatId);
}

/** Absolute path of the seat contract file for a registration. */
function contractPath(reg: SeatRegistrationV1): string {
  // resolve.ts lives at packages/seat-registry/src in source and
  // dist/packages/seat-registry/src after build; the repo root is four levels up.
  const here = fileURLToPath(new URL('.', import.meta.url));
  return new URL('../../../../' + reg.contract_ref, pathToFileURL(here)).pathname;
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readinessFor(reg: SeatRegistrationV1, probe: ReadinessProbeRunner): readonly LaneReadiness[] {
  return reg.routing.map((lane) => probe.probe(lane));
}

export function resolveSeat(seatId: string, opts?: ResolveOptions): SeatResolution {
  const probes = opts?.probes ?? DEFAULT_PROBE;

  // §3.2 — a temporary task assignment is never lane authority, regardless of seat.
  if (opts?.presented_authority !== undefined) {
    return {
      kind: 'refused',
      seat_id: seatId,
      registration: registrationFor(seatId) ?? null,
      readiness: [],
      refusal: 'temporary_task_assignment_not_lane_authority',
      reason:
        'a temporary task assignment (DEC-20260716-02 item 14) is not a registry lane, not standing binding, ' +
        "and is never accepted as lane authority; it is honored only on the governed Phase 4 dispatch path via the command's authorization_ref",
      requirement: null,
    };
  }

  if (!isSeatId(seatId)) {
    if (!ROLE_REGISTRAR_SET.has(seatId)) {
      return {
        kind: 'refused',
        seat_id: seatId,
        registration: null,
        readiness: [],
        refusal: 'unknown_seat',
        reason: `${JSON.stringify(seatId)} is not a registered seat id and not a role in the 30-role registry`,
        requirement: null,
      };
    }
    return {
      kind: 'refused',
      seat_id: seatId,
      registration: null,
      readiness: [],
      refusal: 'seat_outside_registry',
      reason: `${JSON.stringify(seatId)} is a role in the 30-role registry but is not one of the four Seat Registry V1 seats`,
      requirement: null,
    };
  }

  const reg = registrationFor(seatId) as SeatRegistrationV1; // isSeatId guarantees presence
  const readiness = readinessFor(reg, probes);

  // §3.1 — contract hash mismatch: refused, naming both hashes.
  const pin = reg.contract_sha256;
  const bytes = readFileSync(contractPath(reg));
  const actual = sha256Hex(bytes);
  if (actual !== pin) {
    return {
      kind: 'refused',
      seat_id: seatId,
      registration: reg,
      readiness,
      refusal: 'contract_hash_mismatch',
      reason: `contract ${reg.contract_ref} hashes to ${actual}; the registration pins ${pin}`,
      requirement: null,
    };
  }

  // §3.1 — evaluation: resolved only when at least one lane is a standing
  // route. In V1 no lane is standing, so every seat refuses; each lane's
  // failure is named so AC2/AC3/AC4/AC10 read at every lane.
  if (reg.routing.length === 0) {
    return {
      kind: 'refused',
      seat_id: reg.seat_id,
      registration: reg,
      readiness,
      refusal: 'routing_set_empty',
      reason: RESEARCHER_ABSENT_REASON,
      requirement: null,
    };
  }

  const perLane: string[] = [];
  for (const lane of reg.routing) {
    if (lane.binding_status === 'approved-binding') {
      const requirement = LANE_STANDING_REQUIREMENT.get(lane.lane_label);
      if (requirement === undefined) {
        // a genuine standing lane: the seat resolves
        return {
          kind: 'resolved',
          registration: reg,
          contract_text: readFileSync(contractPath(reg)).toString('utf8'),
          readiness,
        };
      }
      perLane.push(`lane ${JSON.stringify(lane.lane_label)} is at an approved binding but is not a standing route: it requires ${requirement}`);
    } else {
      perLane.push(`lane ${JSON.stringify(lane.lane_label)} is at binding status ${lane.binding_status}`);
    }
  }

  const firstLane = reg.routing[0] as SeatRoutingLane; // routing.length > 0 here
  const firstRequirement =
    firstLane.binding_status === 'approved-binding'
      ? LANE_STANDING_REQUIREMENT.get(firstLane.lane_label) ?? null
      : null;
  return {
    kind: 'refused',
    seat_id: reg.seat_id,
    registration: reg,
    readiness,
    refusal:
      firstLane.binding_status === 'approved-binding' ? 'lane_not_standing' : 'lane_below_approved_binding',
    reason: perLane.join('; '),
    requirement: firstRequirement,
  };
}
