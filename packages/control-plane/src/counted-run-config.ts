/**
 * The counted-run act's terms as the control plane is configured with them
 * (`PHASE4_COUNTED_RUN`; plan r1 run-unit Q9). Kept apart from the routes
 * so `config.ts` reads it without importing the planner loop.
 */

import { RATIFIED_SEATS, type SeatRegistrationV1 } from '../../seat-registry/src/index.js';

/** Q2a: the Planner runs on the Antigravity adapter. */
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
  readonly planner: { readonly provider: string; readonly model: string };
  readonly seats: { readonly builder: string; readonly reviewer: string };
}

export class CountedRunConfigError extends Error {
  override readonly name = 'CountedRunConfigError';
}

/**
 * Read `PHASE4_COUNTED_RUN`. Absent or empty is `null`: the routes stay
 * inert. Anything present must be the exact shape, on approved lanes, or
 * boot refuses; a counted run never starts on terms the registry does not
 * carry.
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
  const planner = record(root['planner']);
  const seatModels = record(root['seats']);
  if (!SAFE_ID_RE.test(text(root['actId']))) throw new CountedRunConfigError('actId must be a safe identifier');
  if (!UUID_RE.test(text(root['gatewayId']))) throw new CountedRunConfigError('gatewayId must be a lowercase UUID');
  if (planner === null || !exact(planner, ['provider', 'model']) || !LABEL_RE.test(text(planner['provider'])) || !LABEL_RE.test(text(planner['model']))) {
    throw new CountedRunConfigError('planner must be exactly { provider, model }');
  }
  if (seatModels === null || !exact(seatModels, ['builder', 'reviewer']) || !LABEL_RE.test(text(seatModels['builder'])) || !LABEL_RE.test(text(seatModels['reviewer']))) {
    throw new CountedRunConfigError('seats must be exactly { builder, reviewer }');
  }
  const config: CountedRunConfig = {
    actId: text(root['actId']),
    gatewayId: text(root['gatewayId']),
    planner: { provider: text(planner['provider']), model: text(planner['model']) },
    seats: { builder: text(seatModels['builder']), reviewer: text(seatModels['reviewer']) },
  };
  if (!onApprovedLane(seats, 'architect', (l) => l.surface_id === COUNTED_RUN_PLANNER_SURFACE && l.provider === config.planner.provider && l.model_id === config.planner.model)) {
    throw new CountedRunConfigError('the Planner is not on an approved Antigravity lane of the architect seat');
  }
  if (!onApprovedLane(seats, 'builder', (l) => l.model_id === config.seats.builder)) throw new CountedRunConfigError('the builder model is not on an approved builder lane');
  if (!onApprovedLane(seats, 'independent-reviewer', (l) => l.model_id === config.seats.reviewer)) {
    throw new CountedRunConfigError('the reviewer model is not on an approved independent-reviewer lane');
  }
  if (config.seats.reviewer === config.seats.builder) throw new CountedRunConfigError('the reviewer must run a different model from the builder');
  return config;
}

/** The architect lane the configured Planner runs on: the retry budget keys its buckets by this label. */
export function plannerLaneLabel(config: CountedRunConfig, seats: readonly SeatRegistrationV1[] = RATIFIED_SEATS): string {
  const lane = seats
    .find((s) => s.seat_id === 'architect')
    ?.routing.find((l) => l.binding_status === 'approved-binding' && l.surface_id === COUNTED_RUN_PLANNER_SURFACE && l.provider === config.planner.provider && l.model_id === config.planner.model);
  if (lane === undefined) throw new CountedRunConfigError('the Planner is not on an approved Antigravity lane of the architect seat');
  return lane.lane_label;
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
