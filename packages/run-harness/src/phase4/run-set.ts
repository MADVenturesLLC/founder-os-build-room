/**
 * The entry act's terms, read as a closed shape (plan r1 slice 10).
 *
 * A set the harness cannot read exactly is refused whole: an unknown field, a
 * missing one, a label out of order, a room named twice, a goal the room
 * route would refuse. Nothing is defaulted, because each field is the
 * Founder's to state.
 */

import { containsCredentialMaterial } from '../../../journal/src/index.js';
import { checkScopePaths } from '../../../contracts/src/scope.js';
import { FOUNDER_GOAL_MAX_LENGTH } from '../../../control-plane/src/founder-goal.js';
import { PHASE4_RUN_LABELS, type Phase4RunSet } from './model.js';

export type Phase4RunSetFailure =
  | 'shape_invalid'
  | 'set_id_invalid'
  | 'governing_sha_invalid'
  | 'origin_invalid'
  | 'gateway_identity_invalid'
  | 'seat_models_invalid'
  | 'relay_invalid'
  | 'timeout_invalid'
  | 'runs_invalid'
  | 'scope_paths_invalid'
  | 'goal_invalid';

export type Phase4RunSetResult =
  | { readonly ok: true; readonly value: Phase4RunSet }
  | { readonly ok: false; readonly failure: Phase4RunSetFailure };

export function validatePhase4RunSet(value: unknown): Phase4RunSetResult {
  const failure = runSetFailure(value);
  return failure === null ? { ok: true, value: value as Phase4RunSet } : { ok: false, failure };
}

function runSetFailure(value: unknown): Phase4RunSetFailure | null {
  const set = record(value);
  if (set === null || !exact(set, SET_FIELDS)) return 'shape_invalid';
  if (!SAFE_ID_RE.test(text(set['setId']))) return 'set_id_invalid';
  if (!SHA_RE.test(text(set['founderOsSha'])) || !SHA_RE.test(text(set['buildRoomSha']))) return 'governing_sha_invalid';
  if (!validOrigin(set['controlPlaneOrigin'])) return 'origin_invalid';
  if (!UUID_RE.test(text(set['gatewayId']))) return 'gateway_identity_invalid';

  const planner = record(set['planner']);
  const seats = record(set['seats']);
  if (
    planner === null ||
    !exact(planner, ['provider', 'model']) ||
    !SAFE_LABEL_RE.test(text(planner['provider'])) ||
    !SAFE_LABEL_RE.test(text(planner['model'])) ||
    seats === null ||
    !exact(seats, ['builder', 'reviewer']) ||
    !SAFE_LABEL_RE.test(text(seats['builder'])) ||
    !SAFE_LABEL_RE.test(text(seats['reviewer']))
  ) {
    return 'seat_models_invalid';
  }
  // "No Auto mode or silent switching" (Q2a): the active model is a named model.
  if (/^auto$/i.test(text(planner['model']))) return 'seat_models_invalid';

  const relay = record(set['founderRelay']);
  if (
    relay === null ||
    !exact(relay, ['actualModel', 'executionSurface']) ||
    text(relay['actualModel']).trim() === '' ||
    !SAFE_LABEL_RE.test(text(relay['executionSurface']))
  ) {
    return 'relay_invalid';
  }
  const timeout = set['decisionTimeoutMs'];
  if (!Number.isSafeInteger(timeout) || Number(timeout) < 60_000 || Number(timeout) > 7 * 24 * 3_600_000) {
    return 'timeout_invalid';
  }

  const runs = set['runs'];
  if (!Array.isArray(runs) || runs.length !== PHASE4_RUN_LABELS.length) return 'runs_invalid';
  const rooms = new Set<string>();
  for (const [index, raw] of runs.entries()) {
    const run = record(raw);
    if (run === null || !exact(run, ['label', 'roomId', 'inputs'])) return 'runs_invalid';
    if (run['label'] !== PHASE4_RUN_LABELS[index]) return 'runs_invalid';
    const roomId = text(run['roomId']);
    if (!UUID_RE.test(roomId) || rooms.has(roomId)) return 'runs_invalid';
    rooms.add(roomId);
    const inputs = record(run['inputs']);
    if (inputs === null || !exact(inputs, ['repository', 'baseSha', 'scopePaths', 'goal'])) return 'runs_invalid';
    if (!REPOSITORY_RE.test(text(inputs['repository'])) || !SHA_RE.test(text(inputs['baseSha']))) return 'runs_invalid';
    const paths = inputs['scopePaths'];
    // The shared canonical check (G5's own), applied while the act is read:
    // an act whose paths the planner loop would refuse never starts a room.
    if (!Array.isArray(paths) || !checkScopePaths(paths as readonly string[]).ok) {
      return 'scope_paths_invalid';
    }
    // The room route's own goal rule (founder-goal.ts), applied before anything is sent.
    const goal = inputs['goal'];
    if (typeof goal !== 'string' || goal.trim() === '' || goal.length > FOUNDER_GOAL_MAX_LENGTH || containsCredentialMaterial([goal])) {
      return 'goal_invalid';
    }
  }
  return null;
}

const SET_FIELDS = [
  'setId',
  'founderOsSha',
  'buildRoomSha',
  'controlPlaneOrigin',
  'gatewayId',
  'planner',
  'seats',
  'founderRelay',
  'decisionTimeoutMs',
  'runs',
] as const;
const SHA_RE = /^[0-9a-f]{40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_ID_RE = /^[A-Za-z0-9._:/-]{1,128}$/;
const SAFE_LABEL_RE = /^[A-Za-z0-9._:/+ -]{1,128}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

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

function validOrigin(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
    return (
      url.origin === value &&
      url.username === '' &&
      url.password === '' &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && loopback))
    );
  } catch {
    return false;
  }
}
