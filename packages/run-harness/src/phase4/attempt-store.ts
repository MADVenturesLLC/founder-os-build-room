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
import { PHASE4_RUN_LABELS, type Phase4AttemptSummary, type Phase4EntryFailure, type Phase4RunFailure, type Phase4RunLabel, type Phase4RunOutcome, type Phase4RunRecord } from './model.js';
import { phase4RecordDigest } from './runner.js';
import type { Phase4LiveCheckReading } from './live-check.js';

export const PHASE4_ATTEMPTS_FILE = 'attempts.json';

/** The record file one attempt writes beside the log. */
export function phase4RecordFileName(label: Phase4RunLabel, roomId: string): string {
  return `${label}-${roomId}.record.json`;
}
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
  // A pass is trusted only with its record beside it, hashing to the digest
  // the attempt names: a log edited by hand cannot invent one.
  for (const attempt of log.attempts as readonly Phase4StoredAttempt[]) {
    if (attempt.outcome !== 'passed') continue;
    const name = phase4RecordFileName(attempt.label, attempt.roomId);
    let record: unknown;
    try {
      record = JSON.parse(await readFile(join(directory, name), 'utf8'));
    } catch {
      throw new Phase4AttemptStoreError(`${attempt.label} is recorded as passed, but ${name} is missing or unreadable`);
    }
    if ((record as { roomId?: unknown } | null)?.roomId !== attempt.roomId || phase4RecordDigest(record as Phase4RunRecord) !== attempt.recordDigest) {
      throw new Phase4AttemptStoreError(`${attempt.label} is recorded as passed, but ${name} does not hash to its digest`);
    }
  }
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
 * closed, every optional field is checked when present, and an attempt must
 * be one the command could have written: a pending attempt has no end, no
 * record and no reading yet; a run that did not start has no record and no
 * reading; a run that started has no entry failures; only Phase4-CR1 carries
 * a live-check reading; and a pass is settled, ended, digested, free of
 * failures and, for Phase4-CR1, carries a live check that passed with both
 * fields (the readiness act's Part B).
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
  if ('endedAt' in a && !isTime(a['endedAt'])) return 'endedAt is not a time';
  if ('recordDigest' in a && (typeof a['recordDigest'] !== 'string' || !DIGEST_RE.test(a['recordDigest']))) return 'recordDigest is not a SHA-256';
  if ('error' in a && typeof a['error'] !== 'string') return 'error is not text';
  if ('liveCheck' in a) {
    if (a['label'] !== 'Phase4-CR1') return 'only Phase4-CR1 carries a live check';
    const defect = liveCheckDefect(a['liveCheck']);
    if (defect !== null) return defect;
  }
  if (a['pending'] === true) {
    if (a['outcome'] !== 'interrupted') return 'a pending attempt must be recorded as interrupted';
    if ('endedAt' in a || 'recordDigest' in a || 'liveCheck' in a) return 'a pending attempt has already ended';
  }
  if (a['outcome'] === 'not_started') {
    if ('recordDigest' in a || 'liveCheck' in a || (a['failures'] as unknown[]).length > 0) return 'a run that did not start has a record';
  } else if ((a['entryFailures'] as unknown[]).length > 0) {
    return 'a run that started carries entry failures';
  }
  if (a['outcome'] === 'passed') {
    if (a['pending'] !== false) return 'a pass is pending';
    if (!isTime(a['endedAt'])) return 'a pass has no end time';
    if (typeof a['recordDigest'] !== 'string') return 'a pass has no record digest';
    if ((a['failures'] as unknown[]).length > 0) return 'a pass carries failures';
    if ('error' in a) return 'a pass carries an error';
    if (a['label'] === 'Phase4-CR1') {
      const check = a['liveCheck'] as Record<string, unknown> | undefined;
      if (check === undefined || check['passed'] !== true) return 'Phase4-CR1 is recorded as passed without a passing live check';
    }
  }
  return null;
}

function liveCheckDefect(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'the live check is not an object';
  const c = raw as Record<string, unknown>;
  if (!exactKeys(c, ['passed', 'commandId', 'initModel', 'providerConversationId', 'readAt'], ['reason'])) return 'the live check\'s fields are not exactly a reading\'s';
  if (typeof c['passed'] !== 'boolean') return 'the live check\'s passed is not true or false';
  for (const field of ['commandId', 'initModel', 'providerConversationId']) {
    if (c[field] !== null && typeof c[field] !== 'string') return `the live check's ${field} is not text or null`;
  }
  if (!isTime(c['readAt'])) return 'the live check has no reading time';
  if ('reason' in c && typeof c['reason'] !== 'string') return 'the live check\'s reason is not text';
  if (c['passed'] === true) {
    if ('reason' in c) return 'a passing live check carries a failure reason';
    for (const field of ['commandId', 'initModel', 'providerConversationId']) {
      if (typeof c[field] !== 'string' || (c[field] as string).trim() === '') return `a passing live check lacks ${field}`;
    }
  } else if (!('reason' in c)) {
    return 'a failed live check carries no reason';
  }
  return null;
}

function isTime(value: unknown): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]): boolean {
  const keys = Object.keys(value);
  return required.every((k) => keys.includes(k)) && keys.every((k) => required.includes(k) || optional.includes(k));
}

function stringList(value: unknown): boolean {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}
