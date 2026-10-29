/**
 * One daemon per Gateway directory (FOUNDER-ACT-20261029-BR-PLANNER-READINESS C2).
 *
 * Before boot reads the lanes, reaps the planner user, or touches the socket,
 * the daemon takes this lock. A second daemon on the same directory finds it
 * held and refuses to start, having changed nothing: without it, its socket
 * start would unlink and take over the live daemon's socket, and its boot would
 * reap the planner user and rewrite the live daemon's records.
 *
 * The lock is a Unix socket, `lock.sock`, listening in the Gateway directory.
 * The directory is mode 0700, so no other user can reach the path: the planner
 * user cannot take the lock first and keep the daemon from starting. (A name in
 * Linux's abstract namespace has no owner, so any user could bind it first.)
 *
 * - Taking it: bind the path. Binding is atomic; an existing path refuses it.
 * - Held: a connection to the path is answered. The holder answers with the
 *   token it chose, and a daemon that has just bound the path checks the answer
 *   is its own, so two daemons that raced to replace a stale path cannot both
 *   go on.
 * - Released: by the holder in `stop()`, which closes the socket and removes
 *   the path, or by the operating system when the holder ends however it ends,
 *   after which nothing answers on the path.
 * - Stale: a path nothing answers on, left by a holder that died, is removed
 *   and bound again. A path that answers, or whose answer cannot be ruled out
 *   in time, is never removed: no code deletes a lock a live process holds.
 *
 * Unlike the staging lock (`staging-lock.ts`), which a crash leaves behind on
 * purpose, this one cannot be left held by a crash: the daemon is restarted by
 * its service on failure, and a lock a crash left held would keep the Gateway
 * down until someone removed it.
 */

import { randomBytes } from 'node:crypto';
import { chmod, unlink } from 'node:fs/promises';
import { connect, createServer, type Server } from 'node:net';
import { join } from 'node:path';
import { assertSocketPathFits } from './ipc.js';
import { FILE_MODE } from './paths.js';

/** How long a connection may take to be answered before the path is taken as held. */
const ANSWER_TIMEOUT_MS = 2_000;

export class DaemonLockHeld extends Error {
  override readonly name = 'DaemonLockHeld';
  readonly code = 'gateway_directory_locked';
  constructor(directory: string) {
    super(`another Gateway daemon holds ${directory}: this one does not start`);
  }
}

export interface HeldDaemonLock {
  /** Releases the lock and removes its path. The holder's exit releases it too. */
  release(): Promise<void>;
}

/** The lock's path in a Gateway directory. */
export function daemonLockPath(directory: string): string {
  return join(directory, 'lock.sock');
}

function listenOn(path: string, token: string): Promise<Server> {
  // A connection is answered with the holder's token and closed: it carries nothing else.
  const server = createServer((socket) => {
    socket.on('error', () => undefined);
    socket.end(token);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

/** What answers on the path: `null` when nothing does, the answer's text when something does. */
function answerOn(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    let text = '';
    let settled = false;
    const settle = (value: string | null): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    const socket = connect(path);
    // A listener that does not answer in time is still a listener: the path is held.
    socket.setTimeout(ANSWER_TIMEOUT_MS, () => settle(text));
    socket.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8');
    });
    socket.once('end', () => settle(text));
    socket.once('error', (error: NodeJS.ErrnoException) => {
      // Only a refused connection, or no path, proves nothing listens. Anything else is held.
      settle(error.code === 'ECONNREFUSED' || error.code === 'ENOENT' ? null : text);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

export interface DaemonLockSteps {
  /**
   * Runs after the bind and before the check that the path answers with this daemon's
   * token: where another daemon racing for a stale path could replace it. Suites use it
   * to put that daemon there; the daemon passes nothing.
   */
  readonly afterBind?: () => Promise<void>;
}

/** Takes the lock on `directory`, which must exist, or throws `DaemonLockHeld`. */
export async function acquireDaemonLock(directory: string, steps: DaemonLockSteps = {}): Promise<HeldDaemonLock> {
  const path = daemonLockPath(directory);
  assertSocketPathFits(path);
  const token = randomBytes(16).toString('hex');
  let server: Server;
  try {
    server = await listenOn(path, token);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    if ((await answerOn(path)) !== null) throw new DaemonLockHeld(directory);
    // Nothing answers: a holder that died left the path. It is removed and bound once more;
    // a daemon that binds it first meanwhile makes this bind fail, and this one stops.
    await unlink(path).catch(() => undefined);
    try {
      server = await listenOn(path, token);
    } catch (retry) {
      if ((retry as NodeJS.ErrnoException).code === 'EADDRINUSE') throw new DaemonLockHeld(directory);
      throw retry;
    }
  }
  // The lock holds no event loop open: the daemon lives as long as its IPC socket.
  server.unref();
  await steps.afterBind?.();
  // Two daemons that both found the path stale can each remove it and bind: the one whose
  // path was replaced no longer answers on it, and stops here.
  if ((await answerOn(path)) !== token) {
    // Not closed: closing a Unix socket server removes its path, which is now the other
    // daemon's. Its own socket, no longer reachable by any path, ends with this process.
    throw new DaemonLockHeld(directory);
  }
  await chmod(path, FILE_MODE).catch(() => undefined);
  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      await close(server);
    },
  };
}
