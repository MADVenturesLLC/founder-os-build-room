/**
 * The cross-process staging lock (contract §14, correction B1, revised by E1).
 *
 * A client-side coordination lock on the gateway host, entirely distinct from
 * the server-side L0 boundary, which lives in another process on another
 * machine. It exists because the enrolment guard is a check-then-act: two
 * `buildroom enroll` invocations could each observe "no staging key" and the
 * second would replace the first machine's only private key — after that
 * enrolment had already reached `awaiting_approval`, where the key is the only
 * thing that can ever prove the identity.
 *
 * The mechanism is Node's exclusive-create open flag and nothing else: no
 * platform lock call, no native binding, no shell helper, no new dependency.
 *
 * **Crash behaviour, stated honestly.** Exclusive creation is fail-closed but
 * not automatically released on a crash. A crashed holder leaves an orphaned
 * lock, and every subsequent staging operation then fails closed. That is the
 * intended outcome: orphaned locks are DIAGNOSTIC-ONLY. No tool here deletes a
 * lock it did not create — no flag, no confirmation path, no age heuristic —
 * because removing a lock path while a live process might still hold its handle
 * would break mutual exclusion outright: a second `wx` acquire would succeed
 * beside the still-open first handle. An earlier revision offered a confirmed
 * recovery deletion and an independent review reproduced exactly that failure.
 *
 * Resolution of an orphaned lock is out-of-band Founder maintenance, performed
 * only after every gateway process has been stopped.
 */

import { randomBytes } from 'node:crypto';
import { open, mkdir, readFile, unlink, stat } from 'node:fs/promises';
import { DIRECTORY_MODE, FILE_MODE } from './paths.js';

export type StagingOperation =
  | 'enroll'
  | 'staging-probe'
  | 'promotion'
  | 'staging-delete'
  | 'promotion-recovery';

export interface StagingLockMetadata {
  readonly pid: number;
  /** CSPRNG. Only the process holding this token may release the lock. */
  readonly ownerToken: string;
  readonly acquiredAt: string;
  readonly operation: StagingOperation;
}

export class StagingLockBusy extends Error {
  override readonly name = 'StagingLockBusy';
  readonly code = 'staging_busy_or_recovery_required';
  constructor() {
    super(
      'a staging operation is already in progress, or an orphaned lock remains: ' +
        'staging_busy_or_recovery_required',
    );
  }
}

export interface HeldStagingLock {
  readonly metadata: StagingLockMetadata;
  /**
   * Owner-only release, and honestly non-atomic.
   *
   * The file is re-read and unlinked only if its `ownerToken` still identifies
   * this lock, so a successor's lock acquired at the same path is never removed
   * by an old owner's release. The residual window between the check and the
   * unlink is real and is named here rather than papered over: it is precisely
   * why in-tool orphan deletion is forbidden — an incorrect removal cannot be
   * made safe by validation alone.
   */
  release(): Promise<void>;
}

/**
 * Acquire the lock, or fail closed.
 *
 * `wx` is atomic: exactly one caller can create the file. `EEXIST` means
 * another operation — or an orphan — holds it, and the answer is to stop, never
 * to continue unlocked.
 */
export async function acquireStagingLock(
  lockPath: string,
  operation: StagingOperation,
  now: () => number,
): Promise<HeldStagingLock> {
  await mkdir(directoryOf(lockPath), { recursive: true, mode: DIRECTORY_MODE });

  let handle;
  try {
    handle = await open(lockPath, 'wx', FILE_MODE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new StagingLockBusy();
    throw error;
  }

  const metadata: StagingLockMetadata = {
    pid: process.pid,
    ownerToken: randomBytes(32).toString('hex'),
    acquiredAt: new Date(now()).toISOString(),
    operation,
  };

  try {
    await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8' });
    // fsync, so a crash cannot leave a lock whose metadata never reached disk —
    // `doctor` needs to be able to say whose it is.
    await handle.sync();
  } finally {
    await handle.close();
  }

  return {
    metadata,
    release: async () => {
      const present = await readStagingLock(lockPath);
      if (present === null) return;
      if (present.ownerToken !== metadata.ownerToken) return;
      await unlink(lockPath).catch(() => undefined);
    },
  };
}

export async function readStagingLock(lockPath: string): Promise<StagingLockMetadata | null> {
  try {
    const raw = await readFile(lockPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StagingLockMetadata>;
    if (
      typeof parsed.pid !== 'number' ||
      typeof parsed.ownerToken !== 'string' ||
      typeof parsed.acquiredAt !== 'string' ||
      typeof parsed.operation !== 'string'
    ) {
      return null;
    }
    return parsed as StagingLockMetadata;
  } catch {
    return null;
  }
}

export async function stagingLockExists(lockPath: string): Promise<boolean> {
  try {
    await stat(lockPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the recorded pid is a live process.
 *
 * Diagnostic only, and deliberately NOT a recovery trigger. A dead pid does not
 * authorise deleting the lock: pids are reused, and the guarantee this lock
 * offers is the fail-closed acquire, not a liveness heuristic.
 */
export function isPidLive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function directoryOf(filePath: string): string {
  const index = filePath.lastIndexOf('/');
  return index <= 0 ? '/' : filePath.slice(0, index);
}
