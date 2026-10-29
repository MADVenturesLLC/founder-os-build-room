/**
 * One daemon per Gateway directory (FOUNDER-ACT-20261029-BR-PLANNER-READINESS C2).
 *
 * Before boot reads the lanes, reaps the planner user, or touches the socket,
 * the daemon takes this lock. A second daemon on the same directory finds it
 * held and refuses to start, having changed nothing: without it, its socket
 * start would unlink and take over the live daemon's socket, and its boot would
 * reap the planner user and rewrite the live daemon's records.
 *
 * The lock is a file, `daemon.lock`, in the Gateway directory, naming the
 * process that holds it. It is not a socket or any other endpoint: Room Runtime
 * Phase 1 gives the daemon one socket, `ipc.sock`, and no other named endpoint
 * (r3 §16; test T9). The directory is mode 0700, so no other user, the planner
 * user included, can create, replace or remove it.
 *
 * - Taking it: the record (pid, the process's start, a token) is written in full
 *   to a temporary file, then linked to `daemon.lock`. The link is atomic and
 *   refuses an existing path, so no reader ever sees a partial lock.
 * - Held: while the process the record names is alive. On Linux the process's
 *   start time is read from `/proc` and must match the record, so a pid the
 *   kernel reused for another process does not hold the directory. On other
 *   platforms the pid alone is checked.
 * - Released: by the holder, which removes the file only if it still names it,
 *   or, however the holder ends, by its process ending: the operating system
 *   ends the process, and a record whose process has ended holds nothing, so
 *   neither a crash nor a restart needs anyone to remove it.
 * - Stale: a record whose process has ended is replaced only by a daemon that
 *   holds `daemon.lock.takeover`, taken by the same atomic link: under it, the
 *   lock is read again and removed only if its holder has still ended, so two
 *   daemons never replace one at once. A takeover file whose holder ended
 *   mid-way is moved aside and checked to be the record read before it is
 *   removed. No code removes a lock or takeover whose holder is alive.
 *
 * Unlike the staging lock (`staging-lock.ts`), which a crash leaves held on
 * purpose, this one cannot be left held by a crash: the daemon is restarted by
 * its service on failure, and a lock a crash left held would keep the Gateway
 * down until someone removed it.
 */

import { randomBytes } from 'node:crypto';
import { link, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { FILE_MODE } from './paths.js';

export class DaemonLockHeld extends Error {
  override readonly name = 'DaemonLockHeld';
  readonly code = 'gateway_directory_locked';
  constructor(directory: string) {
    super(`another Gateway daemon holds ${directory}: this one does not start`);
  }
}

export interface HeldDaemonLock {
  /** Removes the lock if it still names this holder. The holder's exit releases it too. */
  release(): Promise<void>;
}

export interface DaemonLockSteps {
  /**
   * Runs after a stale record is read and before the takeover is taken: where another
   * daemon racing for the same stale lock could replace it. Suites use it to put that
   * daemon there; the daemon passes nothing.
   */
  readonly afterStaleRead?: () => Promise<void>;
}

interface LockRecord {
  readonly pid: number;
  /** The process's start, as the platform reports it, or `null` where it cannot be read. */
  readonly start: string | null;
  readonly token: string;
}

/** The lock's path in a Gateway directory. */
export function daemonLockPath(directory: string): string {
  return join(directory, 'daemon.lock');
}

/**
 * When the process started, in clock ticks since boot (field 22 of `/proc/<pid>/stat`),
 * on Linux; `null` elsewhere, or when the process does not exist.
 */
export async function processStart(pid: number, platform: NodeJS.Platform = process.platform): Promise<string | null> {
  if (platform !== 'linux') return null;
  let stat: string;
  try {
    stat = await readFile(`/proc/${String(pid)}/stat`, 'utf8');
  } catch {
    return null;
  }
  // The command name, field 2, is in parentheses and may hold spaces or parentheses.
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return fields[19] ?? null;
}

/** Whether the process a record names is the one alive now. */
async function holderAlive(record: LockRecord): Promise<boolean> {
  try {
    process.kill(record.pid, 0);
  } catch (error) {
    // EPERM: a process exists, of another user; only its start can tell it from the holder.
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') return false;
  }
  if (process.platform !== 'linux') return true;
  const start = await processStart(record.pid);
  return start !== null && start === record.start;
}

function parseRecord(text: string): LockRecord | null {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (typeof value['pid'] !== 'number' || !Number.isInteger(value['pid']) || value['pid'] <= 0) return null;
    if (value['start'] !== null && typeof value['start'] !== 'string') return null;
    if (typeof value['token'] !== 'string') return null;
    return { pid: value['pid'], start: value['start'], token: value['token'] };
  } catch {
    return null;
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Moves a record whose holder has ended out of `path`, if `path` still holds the text read
 * as stale. Anything else found there is linked back, and `false` is returned.
 */
async function removeStale(path: string, seen: string, aside: string): Promise<boolean> {
  try {
    await rename(path, aside);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
  const moved = await readText(aside);
  if (moved !== seen) {
    await link(aside, path).catch(() => undefined);
    await unlink(aside).catch(() => undefined);
    return false;
  }
  await unlink(aside).catch(() => undefined);
  return true;
}

/** Whether `text` is a record whose holder is alive. */
async function namesLiveHolder(text: string): Promise<boolean> {
  const holder = parseRecord(text);
  return holder !== null && (await holderAlive(holder));
}

/** Takes the lock on `directory`, which must exist, or throws `DaemonLockHeld`. */
export async function acquireDaemonLock(directory: string, steps: DaemonLockSteps = {}): Promise<HeldDaemonLock> {
  const path = daemonLockPath(directory);
  const takeoverPath = `${path}.takeover`;
  const token = randomBytes(16).toString('hex');
  const record: LockRecord = { pid: process.pid, start: await processStart(process.pid), token };
  const text = `${JSON.stringify(record)}\n`;
  const temporary = join(directory, `.daemon.lock.${token}.tmp`);
  const aside = join(directory, `.daemon.lock.${token}.stale`);
  const handle = await open(temporary, 'wx', FILE_MODE);
  try {
    await handle.writeFile(text, 'utf8');
  } finally {
    await handle.close();
  }
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await link(temporary, path);
        return {
          release: async () => {
            // Only a lock that still names this holder is removed.
            if ((await readText(path)) === text) await unlink(path).catch(() => undefined);
          },
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      const seen = await readText(path);
      if (seen === null) continue;
      if (await namesLiveHolder(seen)) throw new DaemonLockHeld(directory);
      await steps.afterStaleRead?.();
      // A stale lock is replaced only under the takeover file, so two daemons never replace
      // one at once: under it, the lock is read again and removed only if still stale.
      try {
        await link(temporary, takeoverPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const taking = await readText(takeoverPath);
        if (taking === null) continue;
        if (await namesLiveHolder(taking)) throw new DaemonLockHeld(directory);
        // A takeover whose holder ended mid-way holds nothing either.
        if (!(await removeStale(takeoverPath, taking, aside))) throw new DaemonLockHeld(directory);
        continue;
      }
      try {
        const now = await readText(path);
        if (now !== null) {
          if (await namesLiveHolder(now)) throw new DaemonLockHeld(directory);
          await unlink(path);
        }
      } finally {
        if ((await readText(takeoverPath)) === text) await unlink(takeoverPath).catch(() => undefined);
      }
    }
    throw new DaemonLockHeld(directory);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
