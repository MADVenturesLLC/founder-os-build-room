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
 *   - Each seat's model is on an approved lane of that seat (Q7a): the
 *     Planner on the architect seat's Antigravity lane for the act's model
 *     (Q2a), and the builder and reviewer on theirs; the reviewer's model
 *     differs from the builder's (`DEC-20260815-05`).
 *
 * The seat lanes are Build Room's ratified registrations
 * (`@build-room/seat-registry`, `RATIFIED_SEATS`), and the named Gateway is
 * C5's, unless a test supplies others. At the pinned registry the architect seat's Antigravity lane is
 * `gemini-3.1-pro`, so a Q2a Planner passes only on that model.
 */

import { RATIFIED_SEATS, type SeatRegistrationV1 } from '../../../seat-registry/src/index.js';
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

  if (!onApprovedLane(seats, 'architect', (lane) => lane.surface_id === PHASE4_PLANNER_SURFACE && lane.provider === set.planner.provider && lane.model_id === set.planner.model)) {
    failures.push('planner_lane_not_approved');
  }
  if (!onApprovedLane(seats, 'builder', (lane) => lane.model_id === set.seats.builder)) failures.push('builder_lane_not_approved');
  if (!onApprovedLane(seats, 'independent-reviewer', (lane) => lane.model_id === set.seats.reviewer)) failures.push('reviewer_lane_not_approved');
  if (set.seats.reviewer === set.seats.builder) failures.push('reviewer_same_as_builder');

  return { ok: failures.length === 0, failures };
}

function onApprovedLane(
  seats: readonly SeatRegistrationV1[],
  seatId: string,
  matches: (lane: SeatRegistrationV1['routing'][number]) => boolean,
): boolean {
  const seat = seats.find((s) => s.seat_id === seatId);
  return seat !== undefined && seat.routing.some((lane) => lane.binding_status === 'approved-binding' && matches(lane));
}

/**
 * The `surface_id`s an execution-surface registry declares, read from its
 * text: each YAML `surface_id:` line. A surface whose entry says it is
 * `proposed-not-active` is not registered for attribution and is left out.
 */
export function registeredSurfaceIds(registryMarkdown: string): ReadonlySet<string> {
  const ids = new Set<string>();
  const blocks = registryMarkdown.split(/^```yaml$/m).slice(1).map((block) => block.split(/^```$/m)[0] ?? '');
  for (const block of blocks) {
    const id = /^surface_id:\s*([A-Za-z0-9._-]+)\s*$/m.exec(block)?.[1];
    if (id === undefined) continue;
    if (/^current_status:\s*proposed-not-active\b/m.test(block)) continue;
    ids.add(id);
  }
  return ids;
}
