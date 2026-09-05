/**
 * Phase 0 occupancy-lock proof (Room Runtime r4 §7.13 / AT-R4-22, act item
 * 5.7, evidence item 12).
 *
 * Proves the atomic OS-held Gateway occupancy-lock contract with real
 * processes against the real macOS kernel lock:
 *
 *  1. exclusive acquisition succeeds for the first holder;
 *  2. a second live Gateway is REFUSED (EWOULDBLOCK) while the first
 *     holds — no split brain, no unlink-then-bind takeover;
 *  3. the refused second Gateway does NOT unlink or bind the holder's
 *     socket, and the holder still serves it;
 *  4. the kernel releases the lock on SIGKILL — no stale-lock orphan;
 *  5. after the holder's death, a new Gateway acquires the lock and only
 *     then unlinks the stale socket and binds (stale-socket unlink is
 *     permitted only after the lock is held);
 *  6. the lock fd is not inherited by a spawned probe child (r4 §7.13
 *     point 2);
 *  7. `ipc.sock` binds only while the lock is held.
 *
 * Lock mechanism: macOS `O_EXLOCK` (0x20) via `open(2)` — the
 * Founder-confirmed Phase 0 proof mechanism only; not a production
 * selection.
 *
 * macOS-gated: this proof runs only on darwin (BR CI is ubuntu-only, so
 * this is environment-gated coverage reported per evidence item 19).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';

const HERE = import.meta.dirname;
const CHILD = join(HERE, 'support', 'phase0-lock-child.js');

interface ChildLine {
  readonly phase: string;
  readonly [key: string]: unknown;
}

interface RunningChild {
  readonly proc: ChildProcess;
  readonly lines: ChildLine[];
  waitFor(phase: string, timeoutMs?: number): Promise<ChildLine>;
  exitCode(): Promise<number | null>;
  sigkill(): void;
  end(): void;
  pid(): number | undefined;
}

function startChild(dir: string, mode: string): RunningChild {
  const proc = spawn(process.execPath, [CHILD], {
    env: { ...process.env, PHASE0_DIR: dir, PHASE0_LOCK_MODE: mode },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const lines: ChildLine[] = [];
  let buffer = '';
  proc.stdout!.setEncoding('utf8');
  proc.stdout!.on('data', (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line !== '') lines.push(JSON.parse(line) as ChildLine);
      newline = buffer.indexOf('\n');
    }
  });
  const exited = new Promise<number | null>((resolve) => {
    proc.on('exit', (code) => resolve(code));
  });
  return {
    proc,
    lines,
    async waitFor(phase, timeoutMs = 10_000): Promise<ChildLine> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const found = lines.find((line) => line.phase === phase);
        if (found !== undefined) return found;
        if (Date.now() > deadline) {
          throw new Error(
            `timeout waiting for phase ${JSON.stringify(phase)}; got ${JSON.stringify(lines)}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    exitCode: () => exited,
    sigkill: () => proc.kill('SIGKILL'),
    end: () => proc.stdin?.end(),
    pid: () => proc.pid,
  };
}

async function readOneLine(socketPath: string, timeoutMs = 5_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let buffered = '';
    socket.on('error', reject);
    socket.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
      if (buffered.includes('\n')) {
        socket.destroy();
        resolve(buffered.trim());
      }
    });
    setTimeout(() => {
      socket.destroy();
      reject(new Error('socket read timeout'));
    }, timeoutMs).unref();
  });
}

describe(
  'phase0 occupancy lock (AT-R4-22, r4 §7.13)',
  { skip: platform() !== 'darwin' },
  () => {
    let dir: string;

    before(() => {
      dir = mkdtempSync(join(tmpdir(), 'phase0-lock-'));
    });

    after(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('proves exclusive acquisition, refusal, kernel release, and rebind', async () => {
      // 1. First holder acquires and binds.
      const holder = startChild(dir, 'hold');
      const locked = await holder.waitFor('locked');
      assert.equal(locked['pid'], holder.pid());
      const bound = await holder.waitFor('bound');
      const sockPath = bound['sock'] as string;
      assert.equal(existsSync(sockPath), true);

      // 6. FD-inheritance audit from the holder itself.
      const audit = await holder.waitFor('fd_audit');
      assert.equal(audit['ok'], true, `fd audit failed: ${JSON.stringify(audit)}`);

      // 2. Second live Gateway is refused while the first holds.
      const contender = startChild(dir, 'refuse');
      const attempt = await contender.waitFor('acquire_attempt');
      assert.equal(attempt['refused'], true);
      assert.ok(
        attempt['code'] === 'EWOULDBLOCK' || attempt['code'] === 'EAGAIN',
        `expected the OS-held refusal errno, got ${JSON.stringify(attempt)}`,
      );
      const refused = await contender.waitFor('refused');
      assert.equal(refused['owner_verified'], true);
      assert.equal(refused['unlinked'], false);
      assert.equal(refused['bound'], false);
      assert.equal(await contender.exitCode(), 1);

      // Holder still serves after the refusal.
      assert.equal(await readOneLine(sockPath), 'locked-owner');

      // 3. Kernel releases on SIGKILL — no stale-lock orphan.
      holder.sigkill();
      await holder.exitCode();
      assert.equal(
        existsSync(sockPath),
        true,
        'holder socket must survive SIGKILL (stale until the new holder unlinks it under the lock)',
      );

      // 4. New Gateway acquires, only then unlinks the stale socket and binds.
      const rebinder = startChild(dir, 'rebind');
      const staleState = await rebinder.waitFor('acquired_stale_state');
      assert.equal(staleState['stale_sock_existed'], true);
      assert.equal(staleState['stale_pid_alive'], false, 'dead holder must not be alive');
      const rebound = await rebinder.waitFor('rebound');
      assert.equal(rebound['sock'], sockPath);
      assert.equal(await readOneLine(sockPath), 'locked-owner');

      rebinder.end();
      await rebinder.exitCode();
    });
  },
);