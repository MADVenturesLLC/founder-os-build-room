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
 * Gateway directory. The kernel takes it atomically and releases it when the
 * last descriptor on it closes, which happens when its holder ends, however it
 * ends: nothing is left behind that holds the directory, and no code ever
 * decides whether another process is still alive or removes anything another
 * process holds. The file itself is never removed, since removing a locked
 * file would let a second daemon lock a new one beside it.
 *
 * - macOS: the daemon opens the file with `O_EXLOCK | O_NONBLOCK`, which takes
 *   the lock in the open itself, and keeps the descriptor for its life.
 * - Linux has no such flag, and Node exposes no `flock` call, so the lock is
 *   held by one helper process the daemon starts with its pipe on the helper's
 *   standard input: a shell that opens the file, locks it with util-linux
 *   `flock`, says so, and becomes `cat`, which holds the descriptor until that
 *   pipe closes, at the daemon's release or its exit, however it exits. The
 *   helper ignores SIGINT, SIGTERM and SIGHUP, so a Ctrl-C or a service stop
 *   that reaches it with the daemon leaves the lock held until the daemon has
 *   finished stopping; SIGKILL alone ends it early, and the daemon is told
 *   (`lost`).
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

import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { FILE_MODE } from './paths.js';

/** `O_EXLOCK` from Darwin's `<sys/fcntl.h>`, where Node does not export it. */
const DARWIN_O_EXLOCK = 0x20;
/** The util-linux `flock` the Linux lock is taken with. */
export const FLOCK_PATH = '/usr/bin/flock';
/** `flock --conflict-exit-code`: the lock is held by another. */
const FLOCK_CONFLICT = 75;
/**
 * The Linux helper, with the lock file as `$1`. The lock is on the descriptor
 * the shell opens (9), which `cat` inherits; `flock` only takes it and exits.
 */
const LINUX_HOLDER = `trap '' INT TERM HUP; exec 9<>"$1" || exit 1; ${FLOCK_PATH} --nonblock --conflict-exit-code ${String(FLOCK_CONFLICT)} 9 || exit $?; echo held; exec /bin/cat`;
/** How long the Linux helper may take to report the lock taken or held. */
const FLOCK_START_TIMEOUT_MS = 10_000;

export class DaemonLockHeld extends Error {
  override readonly name = 'DaemonLockHeld';
  readonly code = 'gateway_directory_locked';
  constructor(directory: string) {
    super(`another Gateway daemon holds ${directory}: this one does not start`);
  }
}

export interface HeldDaemonLock {
  /** Releases the lock and settles once it is free. The holder's exit releases it too. */
  release(): Promise<void>;
  /** Settles if the lock is lost before its release: on Linux, its helper was killed. */
  readonly lost: Promise<void>;
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
  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      await handle.close();
    },
    // The descriptor is the daemon's own: nothing but its release or its exit closes it.
    lost: new Promise<void>(() => undefined),
  };
}

async function acquireLinux(directory: string): Promise<HeldDaemonLock> {
  const path = daemonLockPath(directory);
  // The file is made here, 0600, and never through a link, so the helper opens one that exists.
  await (await open(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, FILE_MODE)).close();
  const helper: ChildProcessByStdio<Writable, Readable, null> = spawn('/bin/sh', ['-c', LINUX_HOLDER, 'daemon-lock', path], {
    stdio: ['pipe', 'pipe', 'ignore'],
    env: { PATH: '/usr/bin:/bin' },
  });
  // The helper's standard output closes when it ends, and with it the lock is free.
  const ended = new Promise<void>((resolve) => helper.stdout.once('close', () => resolve()));
  const taken = await new Promise<'taken' | 'held' | Error>((resolve) => {
    let settled = false;
    const settle = (value: 'taken' | 'held' | Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => settle(new Error('the lock helper did not report the lock in time')), FLOCK_START_TIMEOUT_MS);
    helper.stdout.once('data', () => settle('taken'));
    helper.once('error', (error) => settle(error));
    helper.once('exit', (code) => settle(code === FLOCK_CONFLICT ? 'held' : new Error(`the lock helper exited ${String(code)}`)));
  });
  if (taken !== 'taken') {
    helper.stdin.destroy();
    helper.kill('SIGKILL');
    if (taken === 'held') throw new DaemonLockHeld(directory);
    throw taken;
  }
  // The helper holds no event loop open: the daemon lives as long as its IPC socket.
  helper.unref();
  (helper.stdin as unknown as { unref?: () => void }).unref?.();
  (helper.stdout as unknown as { unref?: () => void }).unref?.();
  helper.stdout.resume();
  let released = false;
  return {
    release: async () => {
      if (!released) {
        released = true;
        // Held open again until the helper has ended, so the release can wait for it.
        (helper.stdout as unknown as { ref?: () => void }).ref?.();
        helper.stdin.end();
      }
      await ended;
    },
    lost: ended.then(() => (released ? new Promise<void>(() => undefined) : undefined)),
  };
}
