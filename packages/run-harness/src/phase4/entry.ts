/**
 * The entry check of one counted Phase 4 run (plan r1 slice 10).
 *
 * Every failure is reported, not only the first, so the Founder sees the
 * whole distance between the act and the live system in one reading. A run
 * starts only when the list is empty.
 *
 * WHAT IT CHECKS, AND AGAINST WHAT
 *   - The control plane answers, and serves the act's Build Room commit.
 *   - FounderOS is checked out clean at the act's commit.
 *   - The act names the C5 Gateway, which is enrolled, online, and reports a
 *     planner executor (none ships; see the plan's "What is not built").
 *   - The control plane's T2 surface (Q7b) is registered in the execution
 *     surface registry Build Room reads.
 *   - Each seat's surface is on an approved lane of that seat (Q7a as
 *     `BR-PHASE4-SURFACE-KEYED-SEATS-R1` re-keys it): the Planner must
 *     resolve to the architect seat's approved Antigravity lane (Q2a) —
 *     the set's planner provider and model must be that lane's, and a
 *     resolved route off that lane is refused — and the builder and
 *     reviewer are on theirs; the reviewer's surface differs from the
 *     builder's (surface-level distinctness, the issuance receipt's
 *     settled decision — two surfaces that resolve to the same model are
 *     the Founder's call, not a check). Each seat is a lane token,
 *     `surface` or `surface:provider`, as the act's are: a bare surface
 *     that carries more than one approved provider on that seat is
 *     refused as ambiguous, and the reviewer's resolved provider differs
 *     from the builder's (DEC-20261020-01 clause 7: work built on
 *     `claude-code:anthropic` is not reviewed on `antigravity:anthropic`).
 *
 * The seat lanes are Build Room's ratified registrations
 * (`@build-room/seat-registry`, `RATIFIED_SEATS`), and the named Gateway is
 * C5's, unless a test supplies others. The Planner check reads the set's
 * resolved route: it passes only when that route is the architect seat's
 * approved Antigravity lane (`PHASE4_PLANNER_SURFACE`), and a route
 * resolved off that lane is refused.
 */

import { RATIFIED_SEATS, type SeatRegistrationV1 } from '../../../seat-registry/src/index.js';
import { parseLaneToken } from '../../../control-plane/src/counted-run-config.js';
import {
  PHASE4_DISPATCHER,
  PHASE4_NAMED_GATEWAY_PREFIX,
  PHASE4_PLANNER_SURFACE,
  type Phase4EntryFailure,
  type Phase4RunSet,
} from './model.js';

export interface Phase4EntryObservation {
  readonly controlPlane: { readonly status: number; readonly commit: string; readonly deploymentId: string };
  readonly founderOs: { readonly sha: string; readonly clean: boolean };
  /** The Gateway ids enrolled now. */
  readonly enrolledGateways: readonly string[];
  /** Whether the act's Gateway has fresh liveness now. */
  readonly gatewayOnline: boolean;
  /** Whether the act's Gateway reports a planner executor. */
  readonly executorAvailable: boolean;
  /** The `surface_id`s of the execution-surface registry Build Room reads. */
  readonly registeredSurfaces: ReadonlySet<string>;
}

export interface Phase4EntryVerdict {
  readonly ok: boolean;
  readonly failures: readonly Phase4EntryFailure[];
}

export interface Phase4EntryOptions {
  readonly seats?: readonly SeatRegistrationV1[];
  /** C5's Gateway, by id prefix; a test assembly names its own. */
  readonly namedGatewayPrefix?: string;
}

export function evaluatePhase4Entry(
  set: Phase4RunSet,
  observation: Phase4EntryObservation,
  options: Phase4EntryOptions = {},
): Phase4EntryVerdict {
  const seats = options.seats ?? RATIFIED_SEATS;
  const failures: Phase4EntryFailure[] = [];

  if (observation.controlPlane.status !== 200 || observation.controlPlane.deploymentId.trim() === '') {
    failures.push('control_plane_unavailable');
  } else if (observation.controlPlane.commit !== set.buildRoomSha) {
    failures.push('build_sha_mismatch');
  }
  if (!observation.founderOs.clean || observation.founderOs.sha !== set.founderOsSha) failures.push('founder_os_mismatch');

  if (!set.gatewayId.startsWith(options.namedGatewayPrefix ?? PHASE4_NAMED_GATEWAY_PREFIX)) failures.push('gateway_not_named');
  if (!observation.enrolledGateways.includes(set.gatewayId)) failures.push('gateway_not_enrolled');
  else if (!observation.gatewayOnline) failures.push('gateway_offline');
  if (!observation.executorAvailable) failures.push('executor_unavailable');

  if (!observation.registeredSurfaces.has(PHASE4_DISPATCHER.executionSurface)) failures.push('dispatcher_surface_unregistered');

  if (
    !onApprovedLane(
      seats,
      'architect',
      (lane) => lane.surface_id === PHASE4_PLANNER_SURFACE && lane.provider === set.planner.provider && lane.model_id === set.planner.model,
    )
  ) {
    failures.push('planner_lane_not_approved');
  }
  const builder = seatLane(seats, 'builder', set.seats.builder);
  const reviewer = seatLane(seats, 'independent-reviewer', set.seats.reviewer);
  if (builder.kind === 'not_approved') failures.push('builder_lane_not_approved');
  if (builder.kind === 'ambiguous') failures.push('builder_lane_ambiguous');
  if (reviewer.kind === 'not_approved') failures.push('reviewer_lane_not_approved');
  if (reviewer.kind === 'ambiguous') failures.push('reviewer_lane_ambiguous');
  if (builder.surface !== null && builder.surface === reviewer.surface) failures.push('reviewer_same_as_builder');
  else if (builder.kind === 'resolved' && reviewer.kind === 'resolved' && builder.provider === reviewer.provider) {
    failures.push('reviewer_same_family_as_builder');
  }

  return { ok: failures.length === 0, failures };
}

type SeatLaneResolution =
  | { readonly kind: 'resolved'; readonly surface: string; readonly provider: string }
  | { readonly kind: 'ambiguous'; readonly surface: string }
  | { readonly kind: 'not_approved'; readonly surface: string | null };

/**
 * Resolve a seat's lane token to the provider of the approved lane it names,
 * as boot does (`counted-run-config.ts`): a bare surface resolves only when
 * every approved lane it carries on that seat is one provider's.
 */
function seatLane(seats: readonly SeatRegistrationV1[], seatId: string, raw: string): SeatLaneResolution {
  const token = parseLaneToken(raw);
  if (token === null) return { kind: 'not_approved', surface: null };
  const providers = new Set(
    (seats.find((s) => s.seat_id === seatId)?.routing ?? [])
      .filter((lane) => lane.binding_status === 'approved-binding' && lane.surface_id === token.surface)
      .filter((lane) => token.provider === null || lane.provider === token.provider)
      .map((lane) => lane.provider),
  );
  if (providers.size === 0) return { kind: 'not_approved', surface: token.surface };
  if (providers.size > 1) return { kind: 'ambiguous', surface: token.surface };
  return { kind: 'resolved', surface: token.surface, provider: [...providers][0]! };
}

function onApprovedLane(
  seats: readonly SeatRegistrationV1[],
  seatId: string,
  matches: (lane: SeatRegistrationV1['routing'][number]) => boolean,
): boolean {
  const seat = seats.find((s) => s.seat_id === seatId);
  return seat !== undefined && seat.routing.some((lane) => lane.binding_status === 'approved-binding' && matches(lane));
}

/** One reader of the registry's surfaces, the control plane's own (`counted-run.ts`). */
export { COUNTED_RUN_REGISTRY, pinnedRegisteredSurfaces, registeredSurfaceIds } from '../../../control-plane/src/counted-run.js';
