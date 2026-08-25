import { isAbsolute } from 'node:path';
import type { Phase3AttemptPlan } from './model.js';

type PlanResult =
  | { readonly ok: true; readonly value: Phase3AttemptPlan }
  | { readonly ok: false; readonly code: 'invalid_plan' };

export function validatePhase3Plan(value: unknown): PlanResult {
  const plan = record(value);
  if (plan === null || !LABELS.includes(plan['label'] as never)) return INVALID;
  const cr3 = plan['label'] === 'Phase3-CR3';
  if (!exact(plan, [...PLAN_FIELDS, ...(cr3 ? ['revocationAuthorizationId'] : [])])) return INVALID;

  if (
    !UUID_RE.test(text(plan['runAttemptId'])) ||
    !SAFE_ID_RE.test(text(plan['entryAuthorizationId'])) ||
    (cr3 && !SAFE_ID_RE.test(text(plan['revocationAuthorizationId']))) ||
    !SHA_RE.test(text(plan['founderOsSha'])) ||
    !SHA_RE.test(text(plan['buildRoomSha'])) ||
    !validOrigin(plan['controlPlaneOrigin']) ||
    !UUID_RE.test(text(plan['gatewayId'])) ||
    !SAFE_LABEL_RE.test(text(plan['environment'])) ||
    !SAFE_LABEL_RE.test(text(plan['machine'])) ||
    !Number.isSafeInteger(plan['heartbeatFreshnessMs']) ||
    Number(plan['heartbeatFreshnessMs']) <= 0 ||
    Number(plan['heartbeatFreshnessMs']) > 600_000
  ) {
    return INVALID;
  }

  const fixture = record(plan['fixture']);
  const founderOs = record(plan['founderOs']);
  if (
    founderOs === null ||
    !exact(founderOs, FOUNDER_OS_FIELDS) ||
    founderOs['repository'] !== 'MADVenturesLLC/FounderOS' ||
    !isAbsolute(text(founderOs['path']))
  ) {
    return INVALID;
  }
  if (
    fixture === null ||
    !exact(fixture, FIXTURE_FIELDS) ||
    !REPOSITORY_RE.test(text(fixture['repository'])) ||
    !isAbsolute(text(fixture['path'])) ||
    !SHA_RE.test(text(fixture['sha']))
  ) {
    return INVALID;
  }

  const enrollments = plan['expectedEnrollments'];
  if (!Array.isArray(enrollments) || enrollments.length === 0 || enrollments.length > 1_000) {
    return INVALID;
  }
  const identities = new Set<string>();
  let enrolled = 0;
  for (const raw of enrollments) {
    const row = record(raw);
    if (
      row === null ||
      !exact(row, ENROLLMENT_FIELDS) ||
      !UUID_RE.test(text(row['gatewayId'])) ||
      !STATES.includes(row['state'] as never) ||
      identities.has(text(row['gatewayId']))
    ) {
      return INVALID;
    }
    identities.add(text(row['gatewayId']));
    if (row['state'] === 'enrolled') {
      enrolled += 1;
      if (row['gatewayId'] !== plan['gatewayId']) return INVALID;
    }
  }
  if (enrolled !== 1) return INVALID;

  return { ok: true, value: plan as unknown as Phase3AttemptPlan };
}

const INVALID = { ok: false, code: 'invalid_plan' } as const;
const LABELS = ['Phase3-CR1', 'Phase3-CR2', 'Phase3-CR3'] as const;
const STATES = ['enrolled', 'denied', 'revoked', 'expired'] as const;
const PLAN_FIELDS = [
  'runAttemptId',
  'label',
  'entryAuthorizationId',
  'founderOsSha',
  'founderOs',
  'buildRoomSha',
  'controlPlaneOrigin',
  'gatewayId',
  'expectedEnrollments',
  'fixture',
  'environment',
  'machine',
  'heartbeatFreshnessMs',
] as const;
const FIXTURE_FIELDS = ['repository', 'path', 'sha'] as const;
const FOUNDER_OS_FIELDS = ['repository', 'path'] as const;
const ENROLLMENT_FIELDS = ['gatewayId', 'state'] as const;
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
