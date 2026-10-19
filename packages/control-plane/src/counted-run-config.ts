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
  const plannerToken = parseLaneToken(root['planner']);
  const seatSurfaces = record(root['seats']);
  if (!SAFE_ID_RE.test(text(root['actId']))) throw new CountedRunConfigError('actId must be a safe identifier');
  if (!UUID_RE.test(text(root['gatewayId']))) throw new CountedRunConfigError('gatewayId must be a lowercase UUID');
  if (plannerToken === null) {
    throw new CountedRunConfigError('planner must be exactly a surface');
  }
  if (seatSurfaces === null || !exact(seatSurfaces, ['builder', 'reviewer'])) {
    throw new CountedRunConfigError('seats must be exactly { builder, reviewer }');
  }
  const builderToken = parseLaneToken(seatSurfaces['builder']);
  const reviewerToken = parseLaneToken(seatSurfaces['reviewer']);
  if (builderToken === null || reviewerToken === null) {
    throw new CountedRunConfigError('seats must be exactly { builder, reviewer }');
  }
  const lane = resolveLane(seats, 'architect', plannerToken, 'the planner surface is not on an approved architect lane');
  // F3 (r1 correction): the runtime names only the adapter's surface as the
  // planner's execution surface, so an act naming any other surface — even an
  // approved architect lane like `claude-code` — would be authorized
  // synthetically and fail late at attestation. Boot refuses it here.
  if (plannerToken.surface !== COUNTED_RUN_PLANNER_SURFACE) {
    throw new CountedRunConfigError("the planner surface is not the counted run's adapter surface");
  }
  resolveLane(seats, 'builder', builderToken, 'the builder surface is not on an approved builder lane');
  resolveLane(seats, 'independent-reviewer', reviewerToken, 'the reviewer surface is not on an approved independent-reviewer lane');
  if (reviewerToken.surface === builderToken.surface) {
    throw new CountedRunConfigError('the reviewer surface must differ from the builder surface');
  }
  return {
    actId: text(root['actId']),
    gatewayId: text(root['gatewayId']),
    planner: { surface: plannerToken.surface, provider: lane.provider, model: lane.model_id },
    seats: { builder: builderToken.surface, reviewer: reviewerToken.surface },
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

/** A lane token: `surface` or `surface:provider` — never a model id (`DEC-20261019-01` Clause D). */
export interface LaneToken {
  readonly surface: string;
  readonly provider: string | null;
}

export function parseLaneToken(raw: unknown): LaneToken | null {
  if (typeof raw !== 'string' || !LABEL_RE.test(raw)) return null;
  const parts = raw.split(':');
  if (parts.length > 2) return null;
  const surface = parts[0]!.trim();
  if (surface === '') return null;
  if (parts.length === 1) return { surface, provider: null };
  const provider = parts[1]!.trim();
  if (provider === '') return null;
  return { surface, provider };
}

/**
 * Resolve a lane token to the approved lane it names.
 *
 * A bare surface resolves only when every approved lane it carries belongs to
 * one provider. If the surface spans more than one family, boot refuses rather
 * than picking the lane that happens to sit first — that is the ambiguity that
 * would otherwise let an act say `antigravity` and get Gemini or Claude
 * depending on registry order. Within one family the first lane stands: the
 * model is routing detail (`DEC-20261001-01`), journaled and attested, never an
 * act-level term.
 */
function resolveLane(
  seats: readonly SeatRegistrationV1[],
  seatId: string,
  token: LaneToken,
  unknownMessage: string,
): SeatRegistrationV1['routing'][number] {
  const candidates = (seats.find((s) => s.seat_id === seatId)?.routing ?? [])
    .filter((l) => l.binding_status === 'approved-binding' && l.surface_id === token.surface);
  if (candidates.length === 0) throw new CountedRunConfigError(unknownMessage);
  if (token.provider === null) {
    const providers = new Set(candidates.map((l) => l.provider));
    if (providers.size > 1) {
      throw new CountedRunConfigError('the surface carries more than one approved lane; name the provider');
    }
    return candidates[0]!;
  }
  const matched = candidates.filter((l) => l.provider === token.provider);
  if (matched.length === 0) throw new CountedRunConfigError(unknownMessage);
  return matched[0]!;
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
