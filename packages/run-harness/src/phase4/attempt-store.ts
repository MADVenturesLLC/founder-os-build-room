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

import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { PHASE4_RUN_LABELS, type Phase4AttemptSummary, type Phase4EntryFailure, type Phase4RunFailure, type Phase4RunLabel, type Phase4RunOutcome } from './model.js';
import type { Phase4LiveCheckReading } from './live-check.js';

export const PHASE4_ATTEMPTS_FILE = 'attempts.json';

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
  for (const attempt of log.attempts) {
    if (!(PHASE4_RUN_LABELS as readonly string[]).includes((attempt as Phase4StoredAttempt).label)) {
      throw new Phase4AttemptStoreError(`${PHASE4_ATTEMPTS_FILE} names an unknown label`);
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

/** Write one evidence file atomically and durably, refusing to replace an existing one. */
export async function writePhase4EvidenceFile(directory: string, name: string, content: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const target = join(directory, name);
  const existing = await open(target, 'r').then(
    async (handle) => {
      await handle.close();
      return true;
    },
    () => false,
  );
  if (existing) throw new Phase4AttemptStoreError(`${name} already exists; evidence is never overwritten`);
  await writeDurably(directory, name, content);
}

async function writeDurably(directory: string, name: string, content: string): Promise<void> {
  const target = join(directory, name);
  const temporary = join(directory, `.${name}.${process.pid}.tmp`);
  const handle = await open(temporary, 'w', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
  const dir = await open(directory, 'r');
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}
