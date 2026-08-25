import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import type { Phase3AttemptPlan } from './model.js';
import { validatePhase3Plan } from './plan.js';
import { resolveRepositoryRoot } from './repository.js';
import {
  securePhase3EvidenceDirectory,
  reservePhase3EvidenceFile,
  type Phase3EvidenceReservation,
} from './evidence.js';

export interface Phase3CliConfig {
  readonly controlPlaneUrl: string;
  readonly controlPlaneToken: string;
  readonly buildVerifiedSha: string;
  readonly evidencePath: string;
  readonly evidenceReservation: Phase3EvidenceReservation;
  readonly plan: Phase3AttemptPlan;
}

export async function loadPhase3CliConfig(
  environment: Readonly<Record<string, string | undefined>>,
  buildRoomPath = process.cwd(),
): Promise<Phase3CliConfig> {
  if (environment['PHASE3_ADJUDICATION_TOKEN'] !== undefined) {
    throw new Error(
      'PHASE3_ADJUDICATION_TOKEN must not be present in the counted-run harness environment',
    );
  }
  const controlPlaneUrl = required(environment, 'CONTROL_PLANE_URL');
  const controlPlaneToken = required(environment, 'CONTROL_PLANE_TOKEN');
  const buildVerifiedSha = required(environment, 'PHASE3_BUILD_VERIFIED_SHA');
  const planPath = required(environment, 'PHASE3_PLAN_PATH');
  const evidencePath = required(environment, 'PHASE3_EVIDENCE_PATH');

  if (!isAbsolute(planPath)) throw new Error('PHASE3_PLAN_PATH must be absolute');
  if (!isAbsolute(evidencePath) || parse(evidencePath).root === evidencePath) {
    throw new Error('PHASE3_EVIDENCE_PATH must be absolute and not a filesystem root');
  }

  const metadata = await stat(planPath);
  if (!metadata.isFile() || metadata.size > 64 * 1024) throw new Error('PHASE3_PLAN_PATH is not a bounded file');

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(planPath, 'utf8'));
  } catch {
    throw new Error('PHASE3_PLAN_PATH contains invalid JSON');
  }
  const plan = validatePhase3Plan(raw);
  if (!plan.ok) throw new Error(plan.code);
  let configuredOrigin: string;
  try {
    configuredOrigin = new URL(controlPlaneUrl).origin;
  } catch {
    throw new Error('CONTROL_PLANE_URL is invalid');
  }
  if (controlPlaneUrl !== configuredOrigin || configuredOrigin !== plan.value.controlPlaneOrigin) {
    throw new Error('CONTROL_PLANE_URL does not match the plan origin');
  }
  if (buildVerifiedSha !== plan.value.buildRoomSha) {
    throw new Error('PHASE3_BUILD_VERIFIED_SHA does not match the plan SHA');
  }

  const [
    canonicalEvidencePath,
    canonicalFounderOsPath,
    canonicalBuildRoomPath,
    canonicalFixturePath,
  ] = await Promise.all([
    canonicalTarget(evidencePath),
    resolveRepositoryRoot(plan.value.founderOs.path),
    resolveRepositoryRoot(buildRoomPath),
    resolveRepositoryRoot(plan.value.fixture.path),
  ]);
  if (parse(canonicalEvidencePath).root === canonicalEvidencePath) {
    throw new Error('PHASE3_EVIDENCE_PATH must be absolute and not a filesystem root');
  }
  if (
    containedBy(canonicalFounderOsPath, canonicalEvidencePath) ||
    containedBy(canonicalBuildRoomPath, canonicalEvidencePath) ||
    containedBy(canonicalFixturePath, canonicalEvidencePath)
  ) {
    throw new Error(
      'PHASE3_EVIDENCE_PATH must be outside FounderOS, Build Room, and fixture repositories',
    );
  }
  const evidenceDirectoryIdentity = await securePhase3EvidenceDirectory(canonicalEvidencePath);
  if (
    evidenceDirectoryIdentity.realPath !== canonicalEvidencePath ||
    containedBy(canonicalFounderOsPath, evidenceDirectoryIdentity.realPath) ||
    containedBy(canonicalBuildRoomPath, evidenceDirectoryIdentity.realPath) ||
    containedBy(canonicalFixturePath, evidenceDirectoryIdentity.realPath)
  ) {
    throw new Error(
      'PHASE3_EVIDENCE_PATH must be outside FounderOS, Build Room, and fixture repositories',
    );
  }
  const evidenceReservation = await reservePhase3EvidenceFile(
    evidenceDirectoryIdentity,
    plan.value.label,
    plan.value.runAttemptId,
  );

  return {
    controlPlaneUrl,
    controlPlaneToken,
    buildVerifiedSha,
    evidencePath: canonicalEvidencePath,
    evidenceReservation,
    plan: plan.value,
  };
}

async function canonicalTarget(path: string): Promise<string> {
  let cursor = resolve(path);
  const suffix: string[] = [];
  for (;;) {
    try {
      return resolve(await realpath(cursor), ...suffix);
    } catch (error) {
      if (!isMissing(error)) throw new Error('governed path could not be resolved');
      const parent = dirname(cursor);
      if (parent === cursor) throw new Error('governed path could not be resolved');
      suffix.unshift(basename(cursor));
      cursor = parent;
    }
  }
}

function containedBy(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}

function required(environment: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === '') throw new Error(`${name} is required`);
  return value.trim();
}
