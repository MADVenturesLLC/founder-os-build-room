/**
 * The counted-run act's terms as the control plane is configured with them
 * (`PHASE4_COUNTED_RUN`; plan r1 run-unit Q9). Kept apart from the routes
 * so `config.ts` reads it without importing the planner loop.
 *
 * The act's terms name SURFACES only (`BR-PHASE4-SURFACE-KEYED-SEATS-R1`,
 * 2026-10-17: "just surfaces, because models are always changing"): the
 * shape is `{ actId, gatewayId, planner, seats }`, where `planner` is the
 * Planner's execution surface — which must be the counted run's adapter
 * surface (`COUNTED_RUN_PLANNER_SURFACE`, `antigravity`; any other surface
 * is refused at boot with its own string) — and `seats` carries the
 * builder's and the reviewer's execution-surface ids. No provider, no
 * model in the act's terms. Provider and model remain in the seat registry
 * as routing detail: each check below reads `surface_id` and
 * `binding_status` only, and the parsed config carries the planner's
 * provider and model RESOLVED from the approved lane, so the routes
 * journal the same intended route they always did. Two surfaces that
 * resolve to the same model are the Founder's call, not a check; the one
 * distinctness rule is surface-level — the reviewer's surface differs from
 * the builder's (the issuance receipt's settled decision).
 */

import { RATIFIED_SEATS, type SeatRegistrationV1 } from '../../seat-registry/src/index.js';

/** Q2a: the Planner runs on the Antigravity adapter — the act's planner surface today. */
export const COUNTED_RUN_PLANNER_SURFACE = 'antigravity';

/** Q7b, as `DEC-20261015-01` registers it. */
export const COUNTED_RUN_DISPATCHER = {
  roleId: 'builder',
  actorIdPrefix: 'control-plane:',
  actualModel: 'n/a (deterministic control-plane act)',
  executionSurface: 'build-room-control-plane',
} as const;

export interface CountedRunConfig {
  readonly actId: string;
  readonly gatewayId: string;
  /**
   * The Planner's execution surface, as the act names it, with the provider
   * and model of the approved architect lane it resolves to — routing
   * detail from the registry, never part of the act's terms or of a check.
   */
  readonly planner: { readonly surface: string; readonly provider: string; readonly model: string };
  /** The builder's and the reviewer's execution-surface ids, as the act names them. */
  readonly seats: { readonly builder: string; readonly reviewer: string };
}

export class CountedRunConfigError extends Error {
  override readonly name = 'CountedRunConfigError';
}

/**
 * Read `PHASE4_COUNTED_RUN`. Absent or empty is `null`: the routes stay
 * inert. Anything present must be the exact shape — surfaces only, each on
 * an approved lane of its seat, the planner's equal to the counted run's
 * adapter surface — or boot refuses; a counted run never starts on terms
 * the registry does not carry or the adapter cannot run.
 */
export function parseCountedRunConfig(raw: string | undefined, seats: readonly SeatRegistrationV1[] = RATIFIED_SEATS): CountedRunConfig | null {
  if (raw === undefined || raw.trim() === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new CountedRunConfigError('PHASE4_COUNTED_RUN is not JSON');
  }
  const root = record(value);
  if (root === null || !exact(root, ['actId', 'gatewayId', 'planner', 'seats'])) {
    throw new CountedRunConfigError('PHASE4_COUNTED_RUN must be exactly { actId, gatewayId, planner, seats }');
  }
  const plannerSurface = root['planner'];
  const seatSurfaces = record(root['seats']);
  if (!SAFE_ID_RE.test(text(root['actId']))) throw new CountedRunConfigError('actId must be a safe identifier');
  if (!UUID_RE.test(text(root['gatewayId']))) throw new CountedRunConfigError('gatewayId must be a lowercase UUID');
  if (typeof plannerSurface !== 'string' || !LABEL_RE.test(plannerSurface)) {
    throw new CountedRunConfigError('planner must be exactly a surface');
  }
  if (seatSurfaces === null || !exact(seatSurfaces, ['builder', 'reviewer']) || !LABEL_RE.test(text(seatSurfaces['builder'])) || !LABEL_RE.test(text(seatSurfaces['reviewer']))) {
    throw new CountedRunConfigError('seats must be exactly { builder, reviewer }');
  }
  const lane = plannerLane(seats, plannerSurface);
  if (lane === null) throw new CountedRunConfigError('the planner surface is not on an approved architect lane');
  // F3 (r1 correction): the runtime names only the adapter's surface as the
  // planner's execution surface, so an act naming any other surface — even an
  // approved architect lane like `claude-code` — would be authorized
  // synthetically and fail late at attestation. Boot refuses it here.
  if (plannerSurface !== COUNTED_RUN_PLANNER_SURFACE) {
    throw new CountedRunConfigError("the planner surface is not the counted run's adapter surface");
  }
  if (!onApprovedLane(seats, 'builder', (l) => l.surface_id === text(seatSurfaces['builder']))) {
    throw new CountedRunConfigError('the builder surface is not on an approved builder lane');
  }
  if (!onApprovedLane(seats, 'independent-reviewer', (l) => l.surface_id === text(seatSurfaces['reviewer']))) {
    throw new CountedRunConfigError('the reviewer surface is not on an approved independent-reviewer lane');
  }
  if (text(seatSurfaces['reviewer']) === text(seatSurfaces['builder'])) {
    throw new CountedRunConfigError('the reviewer surface must differ from the builder surface');
  }
  return {
    actId: text(root['actId']),
    gatewayId: text(root['gatewayId']),
    planner: { surface: plannerSurface, provider: lane.provider, model: lane.model_id },
    seats: { builder: text(seatSurfaces['builder']), reviewer: text(seatSurfaces['reviewer']) },
  };
}

/**
 * The architect lane the configured Planner runs on: the seat's first
 * approved lane on the act's planner surface. The retry budget keys its
 * buckets by this label; the parsed config resolves its provider and model
 * from the same lane, so the two never disagree.
 */
export function plannerLaneLabel(config: CountedRunConfig, seats: readonly SeatRegistrationV1[] = RATIFIED_SEATS): string {
  const lane = plannerLane(seats, config.planner.surface);
  if (lane === null) throw new CountedRunConfigError('the planner surface is not on an approved architect lane');
  return lane.lane_label;
}

function plannerLane(seats: readonly SeatRegistrationV1[], surface: string): SeatRegistrationV1['routing'][number] | null {
  return seats
    .find((s) => s.seat_id === 'architect')
    ?.routing.find((l) => l.binding_status === 'approved-binding' && l.surface_id === surface) ?? null;
}

export function onApprovedLane(
  seats: readonly SeatRegistrationV1[],
  seatId: string,
  matches: (lane: SeatRegistrationV1['routing'][number]) => boolean,
): boolean {
  const seat = seats.find((s) => s.seat_id === seatId);
  return seat !== undefined && seat.routing.some((lane) => lane.binding_status === 'approved-binding' && matches(lane));
}

const SAFE_ID_RE = /^[A-Za-z0-9._:/-]{1,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LABEL_RE = /^[A-Za-z0-9._:/+ -]{1,128}$/;

function record(input: unknown): Record<string, unknown> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function text(input: unknown): string {
  return typeof input === 'string' ? input : '';
}

function exact(input: Record<string, unknown>, fields: readonly string[]): boolean {
  const actual = Object.keys(input).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}
