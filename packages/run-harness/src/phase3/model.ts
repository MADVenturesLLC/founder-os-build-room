export {
  phase3SequenceStatus,
  type Phase3AttemptOutcome,
  type Phase3AttemptSummary,
  type Phase3RunLabel,
  type Phase3SequenceStatus,
} from '../../../control-plane/src/phase3-sequence.js';
import type { Phase3RunLabel } from '../../../control-plane/src/phase3-sequence.js';
import type { Phase3CompleteEntryEvidence } from '../../../control-plane/src/phase3-run.js';

export interface Phase3AttemptPlan {
  readonly runAttemptId: string;
  readonly label: Phase3RunLabel;
  readonly entryAuthorizationId: string;
  readonly revocationAuthorizationId?: string;
  readonly founderOsSha: string;
  readonly founderOs: { readonly repository: string; readonly path: string };
  readonly buildRoomSha: string;
  readonly controlPlaneOrigin: string;
  readonly gatewayId: string;
  readonly expectedEnrollments: readonly {
    readonly gatewayId: string;
    readonly state: 'enrolled' | 'denied' | 'revoked' | 'expired';
  }[];
  readonly fixture: { readonly repository: string; readonly path: string; readonly sha: string };
  readonly environment: string;
  readonly machine: string;
  readonly heartbeatFreshnessMs: number;
}

export type Phase3EntryObservation = Phase3CompleteEntryEvidence;

export type Phase3EntryFailure =
  | 'attempt_identity_invalid'
  | 'authorization_invalid'
  | 'governing_sha_invalid'
  | 'founder_os_invalid'
  | 'gateway_identity_invalid'
  | 'context_invalid'
  | 'build_sha_mismatch'
  | 'node_version_mismatch'
  | 'build_failed'
  | 'fixture_unavailable'
  | 'enrollment_projection_failed'
  | 'control_plane_status_failed'
  | 'daemon_unreachable'
  | 'lane_state_failed'
  | 'custody_failed'
  | 'staging_lock_present';

export interface Phase3EntryVerdict {
  readonly ok: boolean;
  readonly failures: readonly Phase3EntryFailure[];
}

export function evaluatePhase3Entry(
  plan: Phase3AttemptPlan,
  observation: Phase3EntryObservation,
): Phase3EntryVerdict {
  const failures: Phase3EntryFailure[] = [];

  if (!UUID_RE.test(plan.runAttemptId) || plan.runAttemptId === plan.label) {
    failures.push('attempt_identity_invalid');
  }
  if (
    !SAFE_ID_RE.test(plan.entryAuthorizationId) ||
    (plan.label === 'Phase3-CR3'
      ? !SAFE_ID_RE.test(plan.revocationAuthorizationId ?? '')
      : plan.revocationAuthorizationId !== undefined)
  ) {
    failures.push('authorization_invalid');
  }
  if (!SHA_RE.test(plan.founderOsSha) || !SHA_RE.test(plan.buildRoomSha)) {
    failures.push('governing_sha_invalid');
  }
  if (
    !observation.founderOs.clean ||
    observation.founderOs.repository !== plan.founderOs.repository ||
    observation.founderOs.sha !== plan.founderOsSha
  ) {
    failures.push('founder_os_invalid');
  }
  if (!UUID_RE.test(plan.gatewayId)) failures.push('gateway_identity_invalid');
  if (
    plan.environment.trim() === '' ||
    plan.machine.trim() === '' ||
    plan.heartbeatFreshnessMs <= 0 ||
    !Number.isSafeInteger(plan.heartbeatFreshnessMs)
  ) {
    failures.push('context_invalid');
  }
  if (
    observation.controlPlane.environment !== plan.environment &&
    !failures.includes('context_invalid')
  ) {
    failures.push('context_invalid');
  }
  if (observation.machineIdentity !== plan.machine && !failures.includes('context_invalid')) {
    failures.push('context_invalid');
  }
  if (
    observation.buildRoom.sha !== plan.buildRoomSha ||
    observation.controlPlane.commit !== plan.buildRoomSha
  ) {
    failures.push('build_sha_mismatch');
  }
  if (observation.nodeMajor !== 22) failures.push('node_version_mismatch');
  if (!observation.buildRoom.buildPassed) failures.push('build_failed');
  if (
    !observation.fixture.clean ||
    observation.fixture.repository !== plan.fixture.repository ||
    observation.fixture.sha !== plan.fixture.sha
  ) {
    failures.push('fixture_unavailable');
  }
  if (!sameEnrollmentProjection(plan.expectedEnrollments, observation.enrollments)) {
    failures.push('enrollment_projection_failed');
  }
  if (observation.controlPlane.status !== 200) failures.push('control_plane_status_failed');
  if (!observation.doctor.daemonReachable) failures.push('daemon_unreachable');
  if (
    observation.doctor.primaryLane !== 'IDLE' ||
    observation.doctor.stagingLane !== 'INACTIVE'
  ) {
    failures.push('lane_state_failed');
  }
  if (
    !observation.doctor.primaryCustody ||
    observation.doctor.stagingCustody ||
    observation.doctor.custodyError
  ) {
    failures.push('custody_failed');
  }
  if (observation.doctor.stagingLockPresent) failures.push('staging_lock_present');

  return { ok: failures.length === 0, failures };
}

const SHA_RE = /^[0-9a-f]{40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_ID_RE = /^[A-Za-z0-9._:/-]{1,128}$/;

function sameEnrollmentProjection(
  expected: readonly { readonly gatewayId: string; readonly state: string }[],
  observed: readonly { readonly gatewayId: string; readonly state: string }[],
): boolean {
  if (expected.length !== observed.length) return false;
  const key = (row: { readonly gatewayId: string; readonly state: string }): string =>
    `${row.gatewayId}:${row.state}`;
  return [...expected].map(key).sort().join('\n') === [...observed].map(key).sort().join('\n');
}
