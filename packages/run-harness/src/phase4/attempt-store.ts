/**
 * The set's attempts, kept on disk by `npm run phase4:counted-run`
 * (FOUNDER-ACT-20261102-BR-PHASE4-COUNTED-RUNS D2): every attempt the
 * runner made, in order, so a spent or complete set refuses to run again
 * and a later invocation runs only the label the set's progress names.
 *
 * One file, `attempts.json`, in the evidence directory, bound to one set:
 * its identifier and the SHA-256 of the terms file it ran under. A file
 * bound to another set, or to other terms, is refused, never overwritten.
 *
 * An attempt is written as `interrupted`, marked `pending`, the moment entry
 * passes and before the room is created, and rewritten with its outcome when
 * the run ends. A process that dies in between leaves it `interrupted`, which
 * spends the set: a run that wrote anything and did not pass is never retried
 * under the same act (C2).
 *
 * Writes go to a temporary file that is synced, renamed over the old one and
 * followed by a sync of the directory, so a crash leaves either the old file
 * or the new one, never a torn one.
 */

import { link, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PHASE4_RUN_LABELS, type Phase4AttemptSummary, type Phase4EntryFailure, type Phase4RunFailure, type Phase4RunLabel, type Phase4RunOutcome } from './model.js';
import type { Phase4LiveCheckReading } from './live-check.js';

export const PHASE4_ATTEMPTS_FILE = 'attempts.json';
/** Held by one invocation from before the log is read until its last write. */
export const PHASE4_LOCK_FILE = 'run.lock';

export interface Phase4StoredAttempt {
  readonly label: Phase4RunLabel;
  readonly roomId: string;
  readonly outcome: Phase4RunOutcome;
  /** True while the run is under way: written before the room is created. */
  readonly pending: boolean;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly entryFailures: readonly Phase4EntryFailure[];
  readonly failures: readonly Phase4RunFailure[];
  readonly recordDigest?: string;
  readonly liveCheck?: Phase4LiveCheckReading & { readonly readAt: string };
  /** The error that ended the run before it could be judged, in words. */
  readonly error?: string;
}

export interface Phase4AttemptLog {
  readonly setId: string;
  readonly termsSha256: string;
  readonly attempts: readonly Phase4StoredAttempt[];
}

export class Phase4AttemptStoreError extends Error {
  override readonly name = 'Phase4AttemptStoreError';
}

/** Read the set's attempts, or an empty log for a set that has not run. */
export async function loadPhase4Attempts(directory: string, setId: string, termsSha256: string): Promise<Phase4AttemptLog> {
  let text: string;
  try {
    text = await readFile(join(directory, PHASE4_ATTEMPTS_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { setId, termsSha256, attempts: [] };
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Phase4AttemptStoreError(`${PHASE4_ATTEMPTS_FILE} is not JSON`);
  }
  const log = parsed as Partial<Phase4AttemptLog>;
  if (typeof log !== 'object' || log === null || typeof log.setId !== 'string' || typeof log.termsSha256 !== 'string' || !Array.isArray(log.attempts)) {
    throw new Phase4AttemptStoreError(`${PHASE4_ATTEMPTS_FILE} is not an attempt log`);
  }
  if (log.setId !== setId) {
    throw new Phase4AttemptStoreError(`${PHASE4_ATTEMPTS_FILE} belongs to set ${log.setId}, not ${setId}`);
  }
  if (log.termsSha256 !== termsSha256) {
    throw new Phase4AttemptStoreError(`${PHASE4_ATTEMPTS_FILE} was written under terms ${log.termsSha256}, not ${termsSha256}`);
  }
  if (!exactKeys(log as Record<string, unknown>, ['setId', 'termsSha256', 'attempts'], [])) {
    throw new Phase4AttemptStoreError(`${PHASE4_ATTEMPTS_FILE} is not an attempt log`);
  }
  log.attempts.forEach((attempt, index) => {
    const defect = attemptDefect(attempt);
    if (defect !== null) throw new Phase4AttemptStoreError(`${PHASE4_ATTEMPTS_FILE} attempt ${index + 1}: ${defect}`);
  });
  return log as Phase4AttemptLog;
}

/** The attempts as the set's progress reads them. */
export function phase4AttemptSummaries(log: Phase4AttemptLog): Phase4AttemptSummary[] {
  return log.attempts.map((a) => ({ label: a.label, outcome: a.outcome }));
}

/** Write the log atomically and durably. */
export async function savePhase4Attempts(directory: string, log: Phase4AttemptLog): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeDurably(directory, PHASE4_ATTEMPTS_FILE, `${JSON.stringify(log, null, 2)}\n`);
}

/**
 * Write one evidence file durably, never replacing an existing one: the
 * synced temporary file is hard-linked to its final name, which fails if the
 * name exists, so two writers cannot both succeed.
 */
export async function writePhase4EvidenceFile(directory: string, name: string, content: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const temporary = await writeTemporary(directory, name, content);
  try {
    await link(temporary, join(directory, name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Phase4AttemptStoreError(`${name} already exists; evidence is never overwritten`);
    }
    throw error;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  await syncDirectory(directory);
}

/**
 * Take the evidence directory's lock, held from before the log is read until
 * the invocation's last write, so two invocations can never run the same
 * label. It is a file created exclusively, naming its holder. A crashed
 * invocation leaves it behind, and every later invocation refuses until the
 * Founder removes it by hand, having checked that no run is still going:
 * fail closed, because a run is single-use. The lock is released by the
 * function this returns.
 */
export async function acquirePhase4Lock(directory: string, holder: string): Promise<() => Promise<void>> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, PHASE4_LOCK_FILE);
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Phase4AttemptStoreError(
        `${PHASE4_LOCK_FILE} is held: another invocation is running, or one ended without releasing it; remove it by hand only once no run is going`,
      );
    }
    throw error;
  }
  try {
    await handle.writeFile(`${holder}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(directory);
  return async () => {
    await unlink(path);
    await syncDirectory(directory);
  };
}

async function writeDurably(directory: string, name: string, content: string): Promise<void> {
  const temporary = await writeTemporary(directory, name, content);
  await rename(temporary, join(directory, name));
  await syncDirectory(directory);
}

async function writeTemporary(directory: string, name: string, content: string): Promise<string> {
  const temporary = join(directory, `.${name}.${process.pid}.tmp`);
  const handle = await open(temporary, 'w', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return temporary;
}

async function syncDirectory(directory: string): Promise<void> {
  const dir = await open(directory, 'r');
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}

const OUTCOMES: readonly Phase4RunOutcome[] = ['not_started', 'passed', 'failed', 'interrupted', 'rejected'];
const ATTEMPT_REQUIRED = ['label', 'roomId', 'outcome', 'pending', 'startedAt', 'entryFailures', 'failures'];
const ATTEMPT_OPTIONAL = ['endedAt', 'recordDigest', 'liveCheck', 'error'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;

/**
 * Why a stored attempt cannot be trusted as progress, or null. The shape is
 * closed, and a pass must look like one the command wrote: settled, ended,
 * with its record's digest and no failure.
 */
function attemptDefect(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'not an object';
  const a = raw as Record<string, unknown>;
  if (!exactKeys(a, ATTEMPT_REQUIRED, ATTEMPT_OPTIONAL)) return 'fields are not exactly an attempt\'s';
  if (!(PHASE4_RUN_LABELS as readonly unknown[]).includes(a['label'])) return 'unknown label';
  if (typeof a['roomId'] !== 'string' || !UUID_RE.test(a['roomId'])) return 'room id is not a lowercase UUID';
  if (!(OUTCOMES as readonly unknown[]).includes(a['outcome'])) return 'unknown outcome';
  if (typeof a['pending'] !== 'boolean') return 'pending is not true or false';
  if (typeof a['startedAt'] !== 'string' || Number.isNaN(Date.parse(a['startedAt']))) return 'startedAt is not a time';
  if (!stringList(a['entryFailures']) || !stringList(a['failures'])) return 'failures are not lists of strings';
  if (a['pending'] === true && a['outcome'] !== 'interrupted') return 'a pending attempt must be recorded as interrupted';
  if (a['outcome'] === 'passed') {
    if (a['pending'] !== false) return 'a pass is pending';
    if (typeof a['endedAt'] !== 'string' || Number.isNaN(Date.parse(a['endedAt']))) return 'a pass has no end time';
    if (typeof a['recordDigest'] !== 'string' || !DIGEST_RE.test(a['recordDigest'])) return 'a pass has no record digest';
    if ((a['failures'] as unknown[]).length > 0) return 'a pass carries failures';
  }
  return null;
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]): boolean {
  const keys = Object.keys(value);
  return required.every((k) => keys.includes(k)) && keys.every((k) => required.includes(k) || optional.includes(k));
}

function stringList(value: unknown): boolean {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}
