/**
 * The planner pull channel's wire shapes: what the control plane hands the
 * Gateway in a `planner_poll` response, and what the Gateway answers with in
 * a `planner_report` payload (Founder answer to Phase 4 plan r1 Q2b,
 * "Gateway pulls, in Phase 4").
 *
 * Both sides validate against this one implementation. A request is three
 * questions, each about one planner command:
 *
 *   - `attest`: which execution would run this command on the intended
 *     route? Answered locally, with no provider contact (`AdapterV1.attest`).
 *   - `execute`: run the command's work as that execution. Answered once the
 *     work has started (`accepted`) or provably never reached a provider
 *     (`not_sent`). At most one execution per command id, ever.
 *   - `status`: what does the Gateway hold for this command? Answered from
 *     its durable record; asking never executes anything.
 *
 * Validation refuses unknown members and out-of-bound strings, so a value
 * that passes is exactly one of the shapes below. Nothing is coerced.
 */

import { isCanonicalUuid } from './encoding.js';

/** The adapter surfaces an attestation may name: the registered set (`adapter-v1.ts`). */
export const PLANNER_SURFACES = ['claude-code', 'antigravity'] as const;
export type PlannerSurface = (typeof PLANNER_SURFACES)[number];

/** Identifiers, routes and digests are short; goal and feedback have their own bound. */
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_TEXT_LENGTH = 20_000;
const MAX_SCOPE_PATHS = 256;

export interface PlannerRouteWire {
  readonly provider: string;
  readonly model: string;
  readonly executionSurface: string;
}

export interface PlannerIdentityWire {
  readonly executionId: string;
  readonly role: string;
  readonly surface: PlannerSurface;
  readonly model: string;
  readonly provider: string;
  readonly effort: string;
}

export interface PlannerWorkWire {
  readonly commandId: string;
  readonly roomId: string;
  readonly repository: string;
  readonly baseSha: string;
  readonly scopePaths: readonly string[];
  readonly goalEventId: string;
  readonly goal: string;
  readonly goalDigest: string;
  readonly revision?: { readonly feedback: string; readonly revisingPlanHash: string };
}

export type PlannerRequestWire =
  | {
      readonly requestId: string;
      readonly kind: 'attest';
      readonly commandId: string;
      readonly role: string;
      readonly intended: PlannerRouteWire;
    }
  | {
      readonly requestId: string;
      readonly kind: 'execute';
      readonly commandId: string;
      readonly executionId: string;
      readonly work: PlannerWorkWire;
    }
  | { readonly requestId: string; readonly kind: 'status'; readonly commandId: string };

export type PlannerResultWire = { readonly kind: 'plan'; readonly document: unknown } | { readonly kind: 'failed' };

export type PlannerReportPayload =
  /** `attest`: the execution that would run the command. */
  | { readonly kind: 'attested'; readonly identity: PlannerIdentityWire }
  /** `attest`: no attestation could be read. Nothing ran. */
  | { readonly kind: 'attest_failed' }
  /** `execute`: the work started, on this route. */
  | { readonly kind: 'accepted'; readonly observed: PlannerRouteWire }
  /** `execute`: affirmative evidence the work never reached a provider. */
  | { readonly kind: 'not_sent' }
  /** `status`: the Gateway holds no record of this command. */
  | { readonly kind: 'never_received' }
  | { readonly kind: 'running'; readonly executionId: string; readonly observed: PlannerRouteWire }
  | {
      readonly kind: 'finished';
      readonly executionId: string;
      readonly observed: PlannerRouteWire;
      readonly result: PlannerResultWire;
    };

export type PlannerRequestKind = PlannerRequestWire['kind'];

/** Which payload kinds answer which request kind. A report outside this is refused. */
export const PLANNER_ANSWERS: Readonly<Record<PlannerRequestKind, readonly PlannerReportPayload['kind'][]>> = {
  attest: ['attested', 'attest_failed'],
  execute: ['accepted', 'not_sent'],
  status: ['never_received', 'running', 'finished'],
};

export function answersRequest(request: PlannerRequestKind, payload: PlannerReportPayload['kind']): boolean {
  return PLANNER_ANSWERS[request].includes(payload);
}

/* ---- validation ------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  for (const key of Object.keys(record)) {
    if (!required.includes(key) && !optional.includes(key)) return false;
  }
  return required.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function isText(value: unknown, max: number = MAX_IDENTIFIER_LENGTH): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= max;
}

function isRoute(value: unknown): value is PlannerRouteWire {
  const record = asRecord(value);
  return (
    record !== null &&
    exactKeys(record, ['provider', 'model', 'executionSurface']) &&
    isText(record['provider']) &&
    isText(record['model']) &&
    isText(record['executionSurface'])
  );
}

function isIdentity(value: unknown): value is PlannerIdentityWire {
  const record = asRecord(value);
  return (
    record !== null &&
    exactKeys(record, ['executionId', 'role', 'surface', 'model', 'provider', 'effort']) &&
    isText(record['executionId']) &&
    isText(record['role']) &&
    (PLANNER_SURFACES as readonly unknown[]).includes(record['surface']) &&
    isText(record['model']) &&
    isText(record['provider']) &&
    isText(record['effort'])
  );
}

function isWork(value: unknown): value is PlannerWorkWire {
  const record = asRecord(value);
  if (
    record === null ||
    !exactKeys(
      record,
      ['commandId', 'roomId', 'repository', 'baseSha', 'scopePaths', 'goalEventId', 'goal', 'goalDigest'],
      ['revision'],
    )
  ) {
    return false;
  }
  const scope = record['scopePaths'];
  if (!Array.isArray(scope) || scope.length === 0 || scope.length > MAX_SCOPE_PATHS || !scope.every((path) => isText(path, 1_024))) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(record, 'revision')) {
    const revision = asRecord(record['revision']);
    if (
      revision === null ||
      !exactKeys(revision, ['feedback', 'revisingPlanHash']) ||
      !isText(revision['feedback'], MAX_TEXT_LENGTH) ||
      !isText(revision['revisingPlanHash'])
    ) {
      return false;
    }
  }
  return (
    isText(record['commandId']) &&
    isText(record['roomId']) &&
    isText(record['repository']) &&
    isText(record['baseSha']) &&
    isText(record['goalEventId']) &&
    isText(record['goal'], MAX_TEXT_LENGTH) &&
    isText(record['goalDigest'])
  );
}

function isResult(value: unknown): value is PlannerResultWire {
  const record = asRecord(value);
  if (record === null) return false;
  if (record['kind'] === 'failed') return exactKeys(record, ['kind']);
  return record['kind'] === 'plan' && exactKeys(record, ['kind', 'document']);
}

/** A planner request as the Gateway reads a poll response, or `null`. */
export function validatePlannerRequest(value: unknown): PlannerRequestWire | null {
  const record = asRecord(value);
  if (record === null) return null;
  const requestId = record['requestId'];
  if (typeof requestId !== 'string' || !isCanonicalUuid(requestId) || !isText(record['commandId'])) return null;
  switch (record['kind']) {
    case 'attest':
      if (!exactKeys(record, ['requestId', 'kind', 'commandId', 'role', 'intended'])) return null;
      if (!isText(record['role']) || !isRoute(record['intended'])) return null;
      return record as unknown as PlannerRequestWire;
    case 'execute': {
      if (!exactKeys(record, ['requestId', 'kind', 'commandId', 'executionId', 'work'])) return null;
      if (!isText(record['executionId']) || !isWork(record['work'])) return null;
      // The work names the command it is the work of.
      if ((record['work'] as PlannerWorkWire).commandId !== record['commandId']) return null;
      return record as unknown as PlannerRequestWire;
    }
    case 'status':
      if (!exactKeys(record, ['requestId', 'kind', 'commandId'])) return null;
      return record as unknown as PlannerRequestWire;
    default:
      return null;
  }
}

/** A report payload as the control plane reads it, after its digest and signature hold, or `null`. */
export function validatePlannerReportPayload(value: unknown): PlannerReportPayload | null {
  const record = asRecord(value);
  if (record === null) return null;
  switch (record['kind']) {
    case 'attested':
      return exactKeys(record, ['kind', 'identity']) && isIdentity(record['identity'])
        ? (record as unknown as PlannerReportPayload)
        : null;
    case 'attest_failed':
    case 'not_sent':
    case 'never_received':
      return exactKeys(record, ['kind']) ? (record as unknown as PlannerReportPayload) : null;
    case 'accepted':
      return exactKeys(record, ['kind', 'observed']) && isRoute(record['observed'])
        ? (record as unknown as PlannerReportPayload)
        : null;
    case 'running':
      return exactKeys(record, ['kind', 'executionId', 'observed']) && isText(record['executionId']) && isRoute(record['observed'])
        ? (record as unknown as PlannerReportPayload)
        : null;
    case 'finished':
      return exactKeys(record, ['kind', 'executionId', 'observed', 'result']) &&
        isText(record['executionId']) &&
        isRoute(record['observed']) &&
        isResult(record['result'])
        ? (record as unknown as PlannerReportPayload)
        : null;
    default:
      return null;
  }
}
