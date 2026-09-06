/**
 * Phase 0 occupancy-lock fixture child (Room Runtime r4 §7.13 / AT-R4-22).
 *
 * Proves the OS-held occupancy-lock contract with REAL processes and a REAL
 * kernel lock — a single-process test with two promises would exercise a
 * different mechanism entirely and would pass whether or not the lock worked.
 *
 * Lock mechanism: macOS `open(2)` with `O_EXLOCK` (0x00000020, per the SDK's
 * `sys/fcntl.h`). Node does not expose `fs.constants.O_EXLOCK` (probed
 * 2026-09-04 on the bound Node 22.23.2 runtime: undefined), so the raw flag
 * value is used. This is the Founder-confirmed Phase 0 proof mechanism ONLY
 * (Founder confirmation of 2026-09-04, boundary 1) — a successful proof does
 * not select the production locking implementation.
 *
 * Modes (PHASE0_LOCK_MODE):
 *   hold   — acquire the lock, write {pid, starttime} metadata, bind ipc.sock,
 *            serve one line per connection, audit that a spawned probe child
 *            did not inherit the lock fd, and exit cleanly on stdin EOF /
 *            SIGTERM (unlinking the socket as the holder).
 *   refuse — attempt to acquire while another process holds the lock. Must
 *            exit 1 WITHOUT binding and WITHOUT unlinking the holder's
 *            socket, after verifying the holder still serves it.
 *   rebind — acquire the lock after the previous holder died (kernel
 *            release), read the stale lock metadata for the PID-reuse
 *            diagnostic, and only THEN unlink the stale socket and bind.
 *
 * Speaks JSONL progress lines on stdout; the parent test asserts on them.
 */

import {
  closeSync,
  openSync,
  writeSync,
  fsyncSync,
  unlinkSync,
  existsSync,
  constants,
} from 'node:fs';
import { createServer, connect } from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';

// macOS sys/fcntl.h: #define O_EXLOCK 0x00000020 (open with exclusive file
// lock). fs.constants.O_EXLOCK is undefined on the bound proof runtime.
const O_EXLOCK = 0x20;

interface LockMeta {
  readonly pid: number;
  readonly starttime: string;
  readonly acquired_at: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

function emit(record: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function startTimeOf(pid: number): string {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function syncWriteFile(path: string, data: string): void {
  const fd = openSync(path, 'w');
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function acquire(): number {
  // O_NONBLOCK so a held lock fails fast with EWOULDBLOCK instead of
  // blocking. O_CLOEXEC is NOT passed as a flag: Node 22 does not expose
  // it on fs.constants (probed 2026-09-04), and libuv sets FD_CLOEXEC on
  // descriptors it opens. The child-side fd audit below proves the
  // observable directly instead of trusting either mechanism.
  return openSync(
    lockPath,
    constants.O_RDWR | constants.O_CREAT | O_EXLOCK | constants.O_NONBLOCK,
  );
}

/**
 * FD-inheritance audit (r4 §7.13 point 2 / r4.1 §6.1 observable): spawn a
 * real probe process, then inspect ITS descriptor table for any fd
 * referring to the lock file. Presence would be a stop; absence proves the
 * lock fd is not inherited across exec.
 */
function auditProbeFds(): void {
  const probe = spawn('/bin/sleep', ['3'], { stdio: 'ignore' });
  try {
    // Inspect the probe's own descriptor table for any fd referring to the
    // lock file. Presence would be a stop; absence proves the lock fd is
    // not inherited across exec.
    const table = execFileSync('lsof', ['-p', String(probe.pid ?? 0)], {
      encoding: 'utf8',
    });
    const leakLines = table
      .split('\n')
      .filter((line) => line.includes('occupancy.lock'));
    emit({ phase: 'fd_audit', ok: leakLines.length === 0, leak_lines: leakLines.length });
  } catch (error) {
    // lsof unavailable or the probe died before inspection — record as an
    // honest audit limitation rather than a silent pass.
    emit({ phase: 'fd_audit', ok: false, error: String(error) });
  } finally {
    probe.kill('SIGKILL');
  }
}

function bindServer(path: string, onReady: () => void): void {
  const server = createServer((socket) => {
    socket.end('locked-owner\n');
  });
  server.listen(path, () => onReady());
  servers.push(server);
}

const servers: Array<ReturnType<typeof createServer>> = [];

const dir = required('PHASE0_DIR');
const mode = required('PHASE0_LOCK_MODE');
const lockPath = join(dir, 'occupancy.lock');
const sockPath = join(dir, 'ipc.sock');

function waitForStdinEnd(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.on('end', () => resolve(undefined));
    process.stdin.on('error', () => resolve(undefined));
  });
}

async function main(): Promise<void> {
  if (mode === 'hold') {
    const fd = acquire();
    const meta: LockMeta = {
      pid: process.pid,
      starttime: startTimeOf(process.pid),
      acquired_at: new Date().toISOString(),
    };
    syncWriteFile(join(dir, 'lock.meta.json'), JSON.stringify(meta));
    emit({ phase: 'locked', pid: process.pid, starttime: meta.starttime });
    auditProbeFds();
    bindServer(sockPath, () => emit({ phase: 'bound', sock: sockPath }));

    emit({ phase: 'ready' });
    const term = new Promise<void>((resolve) => {
      process.on('SIGTERM', () => resolve(undefined));
    });
    await Promise.race([waitForStdinEnd(), term]);
    for (const server of servers) server.close();
    // Unlink the socket only as the lock holder (r4 §7.13 point 5).
    if (existsSync(sockPath)) unlinkSync(sockPath);
    closeSync(fd);
    emit({ phase: 'exit', graceful: true });
    process.exit(0);
  }

  if (mode === 'refuse') {
    let refused = false;
    try {
      const fd = acquire();
      closeSync(fd);
      emit({ phase: 'acquired', refused: false });
      process.exit(2);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // EWOULDBLOCK and EAGAIN are the same errno (11) on darwin; Node maps
      // O_EXLOCK|O_NONBLOCK refusal to the name EAGAIN on macOS and
      // EWOULDBLOCK on Linux. Both are the OS-held refusal observable.
      refused = code === 'EWOULDBLOCK' || code === 'EAGAIN';
      emit({ phase: 'acquire_attempt', refused, code });
    }
    // Must NOT unlink the holder's socket and must NOT bind. Verify the
    // holder still serves it — the refusal left both untouched.
    const ownerLine = await new Promise<string>((resolve, reject) => {
      const socket = connect(sockPath);
      socket.on('error', reject);
      let buffered = '';
      socket.on('data', (chunk: Buffer) => {
        buffered += chunk.toString('utf8');
        if (buffered.includes('\n')) {
          socket.destroy();
          resolve(buffered.trim());
        }
      });
      setTimeout(() => reject(new Error('owner socket timeout')), 5_000).unref();
    });
    emit({
      phase: 'refused',
      refused,
      unlinked: false,
      bound: false,
      owner_verified: ownerLine === 'locked-owner',
    });
    process.exit(refused ? 1 : 3);
  }

  if (mode === 'rebind') {
    const fd = acquire();
    let staleMeta: LockMeta | null = null;
    if (existsSync(join(dir, 'lock.meta.json'))) {
      // Stale metadata from a dead holder is a diagnostic, never the lock
      // itself (r4 §7.13 point 7): the kernel lock is the lock.
      const raw = execFileSync('cat', [join(dir, 'lock.meta.json')], {
        encoding: 'utf8',
      });
      staleMeta = JSON.parse(raw) as LockMeta;
    }
    const stalePidAlive =
      staleMeta !== null && staleMeta.pid !== process.pid
        ? startTimeOf(staleMeta.pid) === staleMeta.starttime && staleMeta.starttime !== ''
        : false;
    const staleSockExisted = existsSync(sockPath);
    emit({
      phase: 'acquired_stale_state',
      stale_pid: staleMeta?.pid ?? null,
      stale_pid_alive: stalePidAlive,
      stale_sock_existed: staleSockExisted,
    });
    // Stale socket unlink is permitted ONLY after the lock is held
    // (r4 §7.13 point 5).
    if (staleSockExisted) unlinkSync(sockPath);
    bindServer(sockPath, () => emit({ phase: 'rebound', sock: sockPath }));
    emit({ phase: 'ready' });
    const term = new Promise<void>((resolve) => {
      process.on('SIGTERM', () => resolve(undefined));
    });
    await Promise.race([waitForStdinEnd(), term]);
    for (const server of servers) server.close();
    if (existsSync(sockPath)) unlinkSync(sockPath);
    closeSync(fd);
    emit({ phase: 'exit', graceful: true });
    process.exit(0);
  }

  throw new Error(`unknown PHASE0_LOCK_MODE: ${mode}`);
}

await main();