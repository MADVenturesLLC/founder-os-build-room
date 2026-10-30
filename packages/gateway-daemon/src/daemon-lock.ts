/**
 * One daemon per Gateway directory (FOUNDER-ACT-20261029-BR-PLANNER-READINESS C2).
 *
 * Before anything reads the lanes, reaps the planner user, or touches the
 * socket, the daemon takes this lock. A second daemon on the same directory
 * finds it held and refuses to start, having changed nothing: without it, its
 * socket start would unlink and take over the live daemon's socket, and its
 * boot would reap the planner user and rewrite the live daemon's records.
 *
 * The lock is the kernel's exclusive `flock` on `daemon.lock`, a file in the
 * Gateway directory, held on a descriptor the daemon process itself opened and
 * keeps. The kernel takes it atomically and releases it only when that
 * descriptor closes: at the daemon's release, or at its exit, however it
 * exits. Nothing but the daemon holds it, so nothing can release it while the
 * daemon still runs; no code ever decides whether another process is alive,
 * or removes anything another process holds. The file itself is never
 * removed, since removing a locked file would let a second daemon lock a new
 * one beside it.
 *
 * - macOS: the daemon opens the file with `O_EXLOCK | O_NONBLOCK`, which takes
 *   the lock in the open itself.
 * - Linux has no such flag, and Node exposes no `flock` call. The daemon opens
 *   the file and hands that open file to util-linux `flock`, which locks it
 *   and exits: an `flock` lock belongs to the open file, not to the process
 *   that took it, so it stays held by the daemon's own descriptor. Node opens
 *   files close-on-exec, so no other child of the daemon inherits it.
 *
 * It is not a socket or any other endpoint (Room Runtime Phase 1 gives the
 * daemon one socket, `ipc.sock`, and no other named endpoint; test T9). The
 * directory is mode 0700, so no other user, the planner user included, can
 * open, lock, replace or remove the file.
 *
 * Unlike the staging lock (`staging-lock.ts`), which a crash leaves held on
 * purpose, this one cannot be left held by a crash: the daemon is restarted by
 * its service on failure, and a lock a crash left held would keep the Gateway
 * down until someone removed it.
 */

import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { FILE_MODE } from './paths.js';

/** `O_EXLOCK` from Darwin's `<sys/fcntl.h>`, where Node does not export it. */
const DARWIN_O_EXLOCK = 0x20;
/** The util-linux `flock` that takes the Linux lock on the daemon's descriptor. */
export const FLOCK_PATH = '/usr/bin/flock';
/** `flock --conflict-exit-code`: the lock is held by another. */
const FLOCK_CONFLICT = 75;
/** The descriptor number the daemon's open file has inside `flock`. */
const FLOCK_FD = 3;

export class DaemonLockHeld extends Error {
  override readonly name = 'DaemonLockHeld';
  readonly code = 'gateway_directory_locked';
  constructor(directory: string) {
    super(`another Gateway daemon holds ${directory}: this one does not start`);
  }
}

export interface HeldDaemonLock {
  /** Releases the lock. The daemon's exit releases it too. */
  release(): Promise<void>;
}

/** The lock's file in a Gateway directory. */
export function daemonLockPath(directory: string): string {
  return join(directory, 'daemon.lock');
}

/** Takes the lock on `directory`, which must exist, or throws `DaemonLockHeld`. */
export async function acquireDaemonLock(directory: string, platform: NodeJS.Platform = process.platform): Promise<HeldDaemonLock> {
  if (platform === 'darwin') return acquireDarwin(directory);
  if (platform === 'linux') return acquireLinux(directory);
  throw new Error(`no Gateway daemon lock exists for ${platform}: the daemon does not start here`);
}

async function acquireDarwin(directory: string): Promise<HeldDaemonLock> {
  const flags = constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK | DARWIN_O_EXLOCK;
  let handle: FileHandle;
  try {
    handle = await open(daemonLockPath(directory), flags, FILE_MODE);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EWOULDBLOCK' || code === 'EAGAIN') throw new DaemonLockHeld(directory);
    throw error;
  }
  return heldBy(handle);
}

async function acquireLinux(directory: string): Promise<HeldDaemonLock> {
  const handle = await open(daemonLockPath(directory), constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, FILE_MODE);
  let outcome: number | Error;
  try {
    outcome = await new Promise<number | Error>((resolve) => {
      const flock = spawn(FLOCK_PATH, ['--nonblock', '--conflict-exit-code', String(FLOCK_CONFLICT), String(FLOCK_FD)], {
        stdio: ['ignore', 'ignore', 'ignore', handle.fd],
        env: { PATH: '/usr/bin:/bin' },
      });
      flock.once('error', (error) => resolve(error));
      flock.once('exit', (code, signal) => resolve(code ?? new Error(`flock ended by ${String(signal)}`)));
    });
  } catch (error) {
    await handle.close();
    throw error;
  }
  if (outcome === 0) return heldBy(handle);
  await handle.close();
  if (outcome === FLOCK_CONFLICT) throw new DaemonLockHeld(directory);
  throw outcome instanceof Error ? outcome : new Error(`flock exited ${String(outcome)}`);
}

function heldBy(handle: FileHandle): HeldDaemonLock {
  let released: Promise<void> | null = null;
  return {
    release: () => (released ??= handle.close()),
  };
}
