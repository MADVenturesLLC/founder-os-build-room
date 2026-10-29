/**
 * One daemon per Gateway directory (FOUNDER-ACT-20261029-BR-PLANNER-READINESS C2).
 *
 * Before boot reads the lanes, reaps the planner user, or touches the socket,
 * the daemon takes this lock. A second daemon on the same directory finds it
 * held and refuses to start, having changed nothing: without it, its socket
 * start would unlink and take over the live daemon's socket, and its boot would
 * reap the planner user and rewrite the live daemon's records.
 *
 * Unlike the staging lock (`staging-lock.ts`), which a crash leaves behind on
 * purpose, this one is released by the operating system when its holder ends,
 * however it ends. The daemon is restarted by its service on failure, and a lock
 * a crash left behind would keep the Gateway down until someone removed it.
 * Nothing here deletes a lock another process holds.
 *
 * - Linux: a socket bound in the abstract namespace, under a name derived from
 *   the directory's real path. Binding is atomic, and the kernel releases the
 *   name when the last descriptor on it closes, a process's death included.
 * - macOS: an open of `daemon.lock` in the directory with `O_EXLOCK` and
 *   `O_NONBLOCK`, an exclusive `flock` taken in the open itself and released
 *   when the descriptor closes.
 *
 * Any other platform has no lock, and the daemon does not start there.
 */

import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath, type FileHandle } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { join } from 'node:path';
import { FILE_MODE } from './paths.js';

/** `O_EXLOCK` from Darwin's `<sys/fcntl.h>`, where Node does not export it. */
const DARWIN_O_EXLOCK = 0x20;

export class DaemonLockHeld extends Error {
  override readonly name = 'DaemonLockHeld';
  readonly code = 'gateway_directory_locked';
  constructor(directory: string) {
    super(`another Gateway daemon holds ${directory}: this one does not start`);
  }
}

export interface HeldDaemonLock {
  /** Releases the lock. The holder's exit releases it too. */
  release(): Promise<void>;
}

/** The abstract-namespace name the Linux lock binds, one per real directory path. */
export function linuxLockName(realDirectory: string): string {
  return `\0buildroom-gateway-daemon:${createHash('sha256').update(realDirectory, 'utf8').digest('hex')}`;
}

/** Takes the lock on `directory`, which must exist, or throws `DaemonLockHeld`. */
export async function acquireDaemonLock(directory: string, platform: NodeJS.Platform = process.platform): Promise<HeldDaemonLock> {
  if (platform === 'linux') return acquireLinux(directory);
  if (platform === 'darwin') return acquireDarwin(directory);
  throw new Error(`no Gateway daemon lock exists for ${platform}: the daemon does not start here`);
}

async function acquireLinux(directory: string): Promise<HeldDaemonLock> {
  const name = linuxLockName(await realpath(directory));
  // A connection to the name is closed at once: it carries nothing.
  const server: Server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'EADDRINUSE' ? new DaemonLockHeld(directory) : error);
    });
    server.listen(name, () => resolve());
  });
  // The lock holds no event loop open: the daemon lives as long as its IPC socket.
  server.unref();
  return {
    release: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function acquireDarwin(directory: string): Promise<HeldDaemonLock> {
  const flags = constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK | DARWIN_O_EXLOCK;
  let handle: FileHandle;
  try {
    handle = await open(join(directory, 'daemon.lock'), flags, FILE_MODE);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EWOULDBLOCK' || code === 'EAGAIN') throw new DaemonLockHeld(directory);
    throw error;
  }
  return {
    release: () => handle.close(),
  };
}
