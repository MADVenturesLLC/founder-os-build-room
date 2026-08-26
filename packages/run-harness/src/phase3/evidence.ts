import { lstat, mkdir, open, realpath, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { PHASE3_EVIDENCE_AUTHORIZES } from '../../../control-plane/src/phase3-run.js';
import {
  PHASE3_DIAGNOSTIC_FAILURE_CLASSES,
  PHASE3_DIAGNOSTIC_OPERATION_STAGES,
  validatePhase3EvidenceForSerialization,
} from './client.js';

const LABEL_RE = /^Phase3-CR[123]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_ID_RE = /^[A-Za-z0-9._:/-]{1,128}$/;
const SAFE_LABEL_RE = /^[A-Za-z0-9._:/+ -]{1,128}$/;
const PLAN_FAILURES = [
  'attempt_identity_invalid',
  'authorization_invalid',
  'governing_sha_invalid',
  'founder_os_invalid',
  'gateway_identity_invalid',
  'context_invalid',
  'fixture_unavailable',
  'enrollment_projection_failed',
] as const;
export const PHASE3_LOCAL_UNRESOLVED_AUTHORIZES =
  'Nothing. This local record states only that the remote commit outcome is unknown and grants no authority.';
export const PHASE3_LOCAL_FAILURE_AUTHORIZES =
  'Nothing. This failure record grants no operational or later-phase authority.';
export const PHASE3_LOCAL_PLAN_REJECTED_AUTHORIZES =
  'Nothing. This local record states only that the plan was rejected and grants no authority.';
const FORBIDDEN_KEY_PARTS = [
  'token',
  'password',
  'credential',
  'privatekey',
  'sourceip',
  'rawbody',
  'pairingcode',
  'apikey',
  'secret',
  'cookie',
] as const;
const ALLOWED_AUTHORIZATION_KEYS = [
  'entryauthorizationid',
  'revocationauthorizationid',
  'founderauthorizationid',
] as const;

const LOCAL_UNRESOLVED_FIELDS = [
  'schema',
  'outcome',
  'reasonCode',
  'remoteState',
  'expected',
  'authorizes',
] as const;
const LOCAL_UNRESOLVED_V2_FIELDS = [...LOCAL_UNRESOLVED_FIELDS, 'diagnostic'] as const;
const LOCAL_UNRESOLVED_DIAGNOSTIC_FIELDS = ['operationStage', 'failureClass'] as const;
const LOCAL_UNRESOLVED_EXPECTED_FIELDS = [
  'runAttemptId',
  'runLabel',
  'entryAuthorizationId',
  'revocationAuthorizationId',
  'founderOsSha',
  'buildRoomSha',
  'fixtureRepository',
  'fixtureSha',
  'gatewayId',
  'enrollmentProjectionSha256',
  'machineIdentity',
  'environmentLabel',
  'entryEvidenceSha256',
] as const;
const LOCAL_FAILURE_FIELDS = ['schema', 'attempt', 'authorizes'] as const;
const LOCAL_FAILURE_ATTEMPT_FIELDS = [
  'runAttemptId',
  'runLabel',
  'buildRoomSha',
  'fixtureSha',
  'outcome',
  'reasonCode',
] as const;
const LOCAL_PLAN_REJECTED_FIELDS = ['schema', 'outcome', 'reasonCode', 'authorizes'] as const;

export interface EvidenceDirectoryIdentity {
  readonly realPath: string;
  readonly device: number;
  readonly inode: number;
}

export interface Phase3EvidenceReservation {
  readonly path: string;
  readonly directory: EvidenceDirectoryIdentity;
  readonly fileDevice: number;
  readonly fileInode: number;
  readonly handle: FileHandle;
  consumed: boolean;
}

export async function securePhase3EvidenceDirectory(
  directory: string,
): Promise<EvidenceDirectoryIdentity> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const [resolved, metadata] = await Promise.all([realpath(directory), lstat(directory)]);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('evidence directory must be a real directory');
  }
  if ((metadata.mode & 0o777) !== 0o700) {
    throw new Error('evidence directory must have mode 0700');
  }
  return { realPath: resolved, device: metadata.dev, inode: metadata.ino };
}

export async function reservePhase3EvidenceFile(
  directory: EvidenceDirectoryIdentity,
  label: string,
  runAttemptId: string,
): Promise<Phase3EvidenceReservation> {
  requireEvidenceIdentity(label, runAttemptId);
  await requireSameDirectory(directory);
  const path = join(directory.realPath, `${label.toLowerCase()}-${runAttemptId}.json`);
  const handle = await open(path, 'wx+', 0o600);
  const metadata = await handle.stat();
  if (metadata.size !== 0) {
    await handle.close().catch(() => undefined);
    throw new Error('reserved evidence file is not empty');
  }
  return {
    path,
    directory,
    fileDevice: metadata.dev,
    fileInode: metadata.ino,
    handle,
    consumed: false,
  };
}

export function serializePhase3Evidence(evidence: unknown): string {
  const jsonReady = jsonReadyEvidence(evidence);
  inspect(jsonReady);
  const expectedAuthorizes = requireClosedEvidenceShape(jsonReady);
  const authorizes = jsonReady['authorizes'];
  if (authorizes !== expectedAuthorizes) {
    throw new Error('evidence must explicitly authorize nothing');
  }
  return `${JSON.stringify(jsonReady, null, 2)}\n`;
}

export async function writePhase3Evidence(
  reservation: Phase3EvidenceReservation,
  evidence: unknown,
): Promise<string> {
  if (reservation.consumed) throw new Error('evidence reservation already consumed');
  const serialized = serializePhase3Evidence(evidence);
  const bytes = Buffer.from(serialized, 'utf8');
  await requireSameDirectory(reservation.directory);
  await requireSameFile(reservation, 0);
  reservation.consumed = true;
  try {
    await reservation.handle.truncate(0);
    const written = await reservation.handle.write(bytes, 0, bytes.length, 0);
    if (written.bytesWritten !== bytes.length) throw new Error('evidence write was incomplete');
    await reservation.handle.truncate(bytes.length);
    await reservation.handle.sync();
    await requireSameFile(reservation, bytes.length);
    const readback = Buffer.alloc(bytes.length);
    const read = await reservation.handle.read(readback, 0, readback.length, 0);
    if (read.bytesRead !== bytes.length || !readback.equals(bytes)) {
      throw new Error('evidence read-back verification failed');
    }
    return reservation.path;
  } finally {
    await reservation.handle.close().catch(() => undefined);
  }
}

export async function disposePhase3EvidenceReservation(
  reservation: Phase3EvidenceReservation,
): Promise<void> {
  reservation.consumed = true;
  await reservation.handle.close().catch(() => undefined);
}

function requireEvidenceIdentity(label: string, runAttemptId: string): void {
  if (!LABEL_RE.test(label) || !UUID_RE.test(runAttemptId)) {
    throw new Error('invalid evidence identity');
  }
}

async function requireSameDirectory(expected: EvidenceDirectoryIdentity): Promise<void> {
  let current: EvidenceDirectoryIdentity;
  try {
    current = await securePhase3EvidenceDirectory(expected.realPath);
  } catch {
    throw new Error('evidence directory identity changed');
  }
  if (
    current.realPath !== expected.realPath ||
    current.device !== expected.device ||
    current.inode !== expected.inode
  ) {
    throw new Error('evidence directory identity changed');
  }
}

async function requireSameFile(
  reservation: Phase3EvidenceReservation,
  expectedSize: number,
): Promise<void> {
  const [pathMetadata, handleMetadata] = await Promise.all([
    lstat(reservation.path),
    reservation.handle.stat(),
  ]);
  if (
    !pathMetadata.isFile() ||
    pathMetadata.isSymbolicLink() ||
    pathMetadata.dev !== reservation.fileDevice ||
    pathMetadata.ino !== reservation.fileInode ||
    handleMetadata.dev !== reservation.fileDevice ||
    handleMetadata.ino !== reservation.fileInode ||
    pathMetadata.size !== expectedSize ||
    handleMetadata.size !== expectedSize
  ) {
    throw new Error(
      expectedSize === 0 ? 'reserved evidence file is not empty' : 'evidence file reservation changed',
    );
  }
}

function inspect(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) inspect(item);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (
      FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part)) ||
      (normalized.includes('authorization') &&
        !ALLOWED_AUTHORIZATION_KEYS.includes(normalized as never))
    ) {
      throw new Error(`forbidden evidence key: ${key}`);
    }
    inspect(item);
  }
}

function jsonReadyEvidence(value: unknown): Record<string, unknown> {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('evidence must be JSON-serializable');
  }
  if (serialized === undefined) throw new Error('evidence must be a JSON-serializable object');
  const parsed = JSON.parse(serialized) as unknown;
  const record = asRecord(parsed);
  if (record === null) throw new Error('evidence must be an object');
  return record;
}

function requireClosedEvidenceShape(evidence: Record<string, unknown>): string {
  switch (evidence['schema']) {
    case 'build-room/phase3-run-evidence@1':
      try {
        validatePhase3EvidenceForSerialization(evidence);
      } catch {
        invalidEvidence();
      }
      return PHASE3_EVIDENCE_AUTHORIZES;
    case 'build-room/phase3-local-unresolved@1':
      requireFields(evidence, LOCAL_UNRESOLVED_FIELDS);
      requireLocalUnresolvedValues(evidence);
      return PHASE3_LOCAL_UNRESOLVED_AUTHORIZES;
    case 'build-room/phase3-local-unresolved@2':
      requireFields(evidence, LOCAL_UNRESOLVED_V2_FIELDS);
      requireLocalUnresolvedValues(evidence);
      requireLocalUnresolvedDiagnostic(evidence['diagnostic']);
      return PHASE3_LOCAL_UNRESOLVED_AUTHORIZES;
    case 'build-room/phase3-local-failure@1':
      requireFields(evidence, LOCAL_FAILURE_FIELDS);
      requireLocalFailureValues(evidence);
      return PHASE3_LOCAL_FAILURE_AUTHORIZES;
    case 'build-room/phase3-local-plan-rejected@1':
      requireFields(evidence, LOCAL_PLAN_REJECTED_FIELDS);
      requireLocalPlanRejectedValues(evidence);
      return PHASE3_LOCAL_PLAN_REJECTED_AUTHORIZES;
    default:
      throw new Error('evidence does not match a closed schema');
  }
}

function requireLocalUnresolvedValues(evidence: Record<string, unknown>): void {
  const expected = requireFields(evidence['expected'], LOCAL_UNRESOLVED_EXPECTED_FIELDS);
  if (
    evidence['outcome'] !== 'unresolved_commit' ||
    evidence['reasonCode'] !== 'commit_outcome_unresolved' ||
    evidence['remoteState'] !== 'unknown' ||
    !UUID_RE.test(text(expected['runAttemptId'])) ||
    !LABEL_RE.test(text(expected['runLabel'])) ||
    !SAFE_ID_RE.test(text(expected['entryAuthorizationId'])) ||
    !nullableText(expected['revocationAuthorizationId'], SAFE_ID_RE) ||
    !SHA_RE.test(text(expected['founderOsSha'])) ||
    !SHA_RE.test(text(expected['buildRoomSha'])) ||
    !REPOSITORY_RE.test(text(expected['fixtureRepository'])) ||
    !SHA_RE.test(text(expected['fixtureSha'])) ||
    !UUID_RE.test(text(expected['gatewayId'])) ||
    !SHA256_RE.test(text(expected['enrollmentProjectionSha256'])) ||
    !SAFE_LABEL_RE.test(text(expected['machineIdentity'])) ||
    !SAFE_LABEL_RE.test(text(expected['environmentLabel'])) ||
    !nullableText(expected['entryEvidenceSha256'], SHA256_RE)
  ) {
    invalidEvidence();
  }
}

function requireLocalUnresolvedDiagnostic(value: unknown): void {
  const diagnostic = requireFields(value, LOCAL_UNRESOLVED_DIAGNOSTIC_FIELDS);
  if (
    !PHASE3_DIAGNOSTIC_OPERATION_STAGES.includes(diagnostic['operationStage'] as never) ||
    !PHASE3_DIAGNOSTIC_FAILURE_CLASSES.includes(diagnostic['failureClass'] as never)
  ) {
    invalidEvidence();
  }
}

function requireLocalFailureValues(evidence: Record<string, unknown>): void {
  const attempt = requireFields(evidence['attempt'], LOCAL_FAILURE_ATTEMPT_FIELDS);
  if (
    !UUID_RE.test(text(attempt['runAttemptId'])) ||
    !LABEL_RE.test(text(attempt['runLabel'])) ||
    !SHA_RE.test(text(attempt['buildRoomSha'])) ||
    !SHA_RE.test(text(attempt['fixtureSha'])) ||
    attempt['outcome'] !== 'failed' ||
    attempt['reasonCode'] !== 'internal_error'
  ) {
    invalidEvidence();
  }
}

function requireLocalPlanRejectedValues(evidence: Record<string, unknown>): void {
  if (
    evidence['outcome'] !== 'not_started' ||
    !PLAN_FAILURES.includes(evidence['reasonCode'] as never)
  ) {
    invalidEvidence();
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableText(value: unknown, pattern: RegExp): boolean {
  return value === null || (typeof value === 'string' && pattern.test(value));
}

function invalidEvidence(): never {
  throw new Error('evidence does not match its closed schema');
}

function requireFields(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  const record = asRecord(value);
  if (record === null) throw new Error('evidence does not match its closed schema');
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    !actual.every((field, index) => field === expected[index])
  ) {
    throw new Error('evidence does not match its closed schema');
  }
  return record;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
