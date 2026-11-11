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

import { MAX_PLANNER_PAYLOAD_BYTES } from './constants.js';
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
  readonly revision?: PlannerRevisionWire;
  /** Present only on a round's one corrective re-ask (FOUNDER-ACT-20261111-BR-PLANNER-REASK B3). */
  readonly reask?: PlannerReaskWire;
}

/**
 * A revision round's own inputs: the Founder's feedback, the hash of the plan it
 * revises, and that plan's document (FOUNDER-ACT-20261109-BR-PLANNER-REVISION-CONTEXT
 * B1). The control plane reads the document from its plan store and sends it only
 * when the store's recomputed hash is `revisingPlanHash` (B2), so the Planner can
 * revise the plan it wrote instead of writing a new one.
 */
export interface PlannerRevisionWire {
  readonly feedback: string;
  readonly revisingPlanHash: string;
  readonly earlierPlan: { readonly [key: string]: unknown };
}

/**
 * How a run that gave no plan ended, as the Gateway reports it
 * (FOUNDER-ACT-20261111-BR-PLANNER-REASK B2): the agy executor's run outcomes other than a
 * plan, and `oversize`, a finished result too large for its report. A failed report
 * carries none of these when the run failed in any other way.
 */
export const PLANNER_FAILURE_REASONS = [
  'agy_error',
  'no_result',
  'unparseable_plan',
  'model_switched',
  'malformed_output',
  'timed_out',
  'oversize',
] as const;
export type PlannerFailureReason = (typeof PLANNER_FAILURE_REASONS)[number];

/**
 * The failure reasons a round re-asks (B1(b)): an answer that is malformed or missing.
 * Not `timed_out` and not `model_switched` (the act's F2).
 */
export const REASKED_FAILURE_REASONS = [
  'unparseable_plan',
  'malformed_output',
  'no_result',
  'agy_error',
  'oversize',
] as const satisfies readonly PlannerFailureReason[];
export type ReaskedFailureReason = (typeof REASKED_FAILURE_REASONS)[number];

/**
 * The schema validator's violation codes (`ViolationCode` in seat-output-schema's
 * schema.ts), as a re-ask carries them. A test holds the two lists equal.
 */
export const PLANNER_REASK_VIOLATION_CODES = [
  'type_mismatch',
  'required_missing',
  'additional_property',
  'pattern_mismatch',
  'enum_mismatch',
  'length',
  'range',
  'const_mismatch',
  'depth_exceeded',
] as const;
export type PlannerReaskViolationCode = (typeof PLANNER_REASK_VIOLATION_CODES)[number];

/** How many violations a re-ask carries at most: the control plane's PLAN_REFUSAL_VIOLATIONS_KEPT. */
export const PLANNER_REASK_VIOLATIONS_MAX = 20;
/** The longest violation path a re-ask carries (B3(a)). */
export const PLANNER_REASK_PATH_MAX = 1_024;

/** One schema violation of a refused plan, in the shape the control plane's refusal reason has. */
export interface PlannerReaskViolationWire {
  readonly code: PlannerReaskViolationCode;
  readonly path: string;
  readonly undeclaredKeyLength?: number;
  readonly found?: number;
  readonly bound?: number;
}

/** Why the control plane refused a plan as `plan_invalid`, for the kinds a round re-asks (B1(a)). */
export type PlannerReaskRefusalWire =
  | { readonly kind: 'schema'; readonly violationCount: number; readonly violations: readonly PlannerReaskViolationWire[] }
  | { readonly kind: 'scope_path'; readonly index: number | null }
  | { readonly kind: 'encoding' };

/**
 * A round's one corrective re-ask (DEC-20260716-02 item 5; FOUNDER-ACT-20261111-BR-PLANNER-REASK
 * B3): why the earlier answer was refused, and, when the control plane refused a plan it
 * received, that plan, so the Planner can correct it rather than write a new one.
 */
export type PlannerReaskWire =
  | {
      readonly refused: 'plan_invalid';
      readonly reason: PlannerReaskRefusalWire;
      readonly refusedPlan: { readonly [key: string]: unknown };
    }
  | { readonly refused: 'planner_reported_failure'; readonly reason: ReaskedFailureReason };

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

export type PlannerResultWire =
  | { readonly kind: 'plan'; readonly document: unknown }
  | { readonly kind: 'failed'; readonly reason?: PlannerFailureReason };

/**
 * What the executor read from its init event before it sent the work: the model the event
 * named and the provider's conversation id (FOUNDER-RULING-20261026-BR-PLANNER-EXECUTOR
 * Amendment 5 B1; FOUNDER-ACT-20261028-BR-PLANNER-JOURNAL-FIELDS B2). An answer carries both
 * or neither: an executor that reports no init event sends neither.
 */
export interface PlannerInitWire {
  readonly initModel?: string;
  readonly conversationId?: string;
}

export type PlannerReportPayload =
  /** `attest`: the execution that would run the command. */
  | { readonly kind: 'attested'; readonly identity: PlannerIdentityWire }
  /** `attest`: no attestation could be read. Nothing ran. */
  | { readonly kind: 'attest_failed' }
  /** `execute`: the work started, on this route. */
  | ({ readonly kind: 'accepted'; readonly observed: PlannerRouteWire } & PlannerInitWire)
  /** `execute`: affirmative evidence the work never reached a provider. */
  | { readonly kind: 'not_sent' }
  /** `status`: the Gateway holds no record of this command. */
  | { readonly kind: 'never_received' }
  | ({ readonly kind: 'running'; readonly executionId: string; readonly observed: PlannerRouteWire } & PlannerInitWire)
  | ({
      readonly kind: 'finished';
      readonly executionId: string;
      readonly observed: PlannerRouteWire;
      readonly result: PlannerResultWire;
    } & PlannerInitWire);

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

/**
 * The earlier plan's document: a plain JSON object whose JSON text fits the bound a
 * plan's report payload has (B1). A stored plan arrived inside such a payload, so the
 * bound never refuses one; it keeps a request from carrying more than a report can.
 */
function isEarlierPlan(value: unknown): value is { readonly [key: string]: unknown } {
  if (asRecord(value) === null) return false;
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    return false;
  }
  return typeof text === 'string' && new TextEncoder().encode(text).length <= MAX_PLANNER_PAYLOAD_BYTES;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isReaskViolation(value: unknown): value is PlannerReaskViolationWire {
  const record = asRecord(value);
  if (record === null || !exactKeys(record, ['code', 'path'], ['undeclaredKeyLength', 'found', 'bound'])) return false;
  const path = record['path'];
  return (
    (PLANNER_REASK_VIOLATION_CODES as readonly unknown[]).includes(record['code']) &&
    typeof path === 'string' &&
    path.length <= PLANNER_REASK_PATH_MAX &&
    ['undeclaredKeyLength', 'found', 'bound'].every((key) => !Object.prototype.hasOwnProperty.call(record, key) || isCount(record[key]))
  );
}

function isReaskRefusal(value: unknown): value is PlannerReaskRefusalWire {
  const record = asRecord(value);
  if (record === null) return false;
  switch (record['kind']) {
    case 'schema': {
      const violations = record['violations'];
      return (
        exactKeys(record, ['kind', 'violationCount', 'violations']) &&
        Array.isArray(violations) &&
        violations.length >= 1 &&
        violations.length <= PLANNER_REASK_VIOLATIONS_MAX &&
        violations.every(isReaskViolation) &&
        isCount(record['violationCount']) &&
        record['violationCount'] >= violations.length
      );
    }
    case 'scope_path':
      return exactKeys(record, ['kind', 'index']) && (record['index'] === null || isCount(record['index']));
    case 'encoding':
      return exactKeys(record, ['kind']);
    default:
      return false;
  }
}

/**
 * A re-ask as both sides validate it (B3). The refused plan has the bound an earlier plan
 * has: it arrived inside a report payload, so the bound never refuses one.
 */
export function isPlannerReask(value: unknown): value is PlannerReaskWire {
  const record = asRecord(value);
  if (record === null) return false;
  switch (record['refused']) {
    case 'plan_invalid':
      return (
        exactKeys(record, ['refused', 'reason', 'refusedPlan']) &&
        isReaskRefusal(record['reason']) &&
        isEarlierPlan(record['refusedPlan'])
      );
    case 'planner_reported_failure':
      return (
        exactKeys(record, ['refused', 'reason']) &&
        (REASKED_FAILURE_REASONS as readonly unknown[]).includes(record['reason'])
      );
    default:
      return false;
  }
}

function isWork(value: unknown): value is PlannerWorkWire {
  const record = asRecord(value);
  if (
    record === null ||
    !exactKeys(
      record,
      ['commandId', 'roomId', 'repository', 'baseSha', 'scopePaths', 'goalEventId', 'goal', 'goalDigest'],
      ['revision', 'reask'],
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
      !exactKeys(revision, ['feedback', 'revisingPlanHash', 'earlierPlan']) ||
      !isText(revision['feedback'], MAX_TEXT_LENGTH) ||
      !isText(revision['revisingPlanHash']) ||
      !isEarlierPlan(revision['earlierPlan'])
    ) {
      return false;
    }
  }
  if (Object.prototype.hasOwnProperty.call(record, 'reask') && !isPlannerReask(record['reask'])) return false;
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

const INIT_KEYS = ['initModel', 'conversationId'] as const;

/** Both init fields or neither, each bounded text: one without the other is not an answer. */
function initPairHolds(record: Record<string, unknown>): boolean {
  const present = INIT_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(record, key));
  if (present.length === 0) return true;
  return present.length === 2 && isText(record['initModel']) && isText(record['conversationId']);
}

function isResult(value: unknown): value is PlannerResultWire {
  const record = asRecord(value);
  if (record === null) return false;
  if (record['kind'] === 'failed') {
    return (
      exactKeys(record, ['kind'], ['reason']) &&
      (!Object.prototype.hasOwnProperty.call(record, 'reason') ||
        (PLANNER_FAILURE_REASONS as readonly unknown[]).includes(record['reason']))
    );
  }
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
      return exactKeys(record, ['kind', 'observed'], INIT_KEYS) && isRoute(record['observed']) && initPairHolds(record)
        ? (record as unknown as PlannerReportPayload)
        : null;
    case 'running':
      return exactKeys(record, ['kind', 'executionId', 'observed'], INIT_KEYS) &&
        isText(record['executionId']) &&
        isRoute(record['observed']) &&
        initPairHolds(record)
        ? (record as unknown as PlannerReportPayload)
        : null;
    case 'finished':
      return exactKeys(record, ['kind', 'executionId', 'observed', 'result'], INIT_KEYS) &&
        isText(record['executionId']) &&
        isRoute(record['observed']) &&
        isResult(record['result']) &&
        initPairHolds(record)
        ? (record as unknown as PlannerReportPayload)
        : null;
    default:
      return null;
  }
}
