/**
 * §15/§16 (correction B4, Rev 4.7 tester) — the daemon ships as a runnable
 * lifecycle.
 *
 * The delivered package exported `GatewayDaemon` and declared no executable;
 * nothing in production constructed, booted, started, or signal-stopped it, so
 * without a hand-written host program the staging lane never probed, promotion
 * never occurred, and heartbeats never started.
 *
 * This is a REAL process test of the shipped entry point. It spawns the built
 * daemon executable with its REAL collaborators — the documented fixed paths
 * and the `/usr/bin/security` custody runner included — under a redirected
 * HOME, so the fixed paths land in a temporary directory instead of the
 * founder's. Nothing injects a fetch or a clock: the control-plane URL points
 * at a port nothing listens on, and the lanes take the honest bounded
 * transport path. The assertions are the three things §16 requires of a
 * runnable daemon: it starts, it answers IPC, and it shuts down cleanly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSocketPathFits, gatewayPaths, ipcRequest } from '../packages/gateway-daemon/src/index.js';

const DAEMON_ENTRY = fileURLToPath(new URL('../packages/gateway-daemon/src/main.js', import.meta.url));

interface Launch {
  readonly child: ReturnType<typeof spawn>;
  readonly socketPath: string;
  readonly stderr: () => string;
  readonly cleanup: () => void;
}

/**
 * Launch the shipped entry point the way §16's spawn-detach offer would: node,
 * the executable path, a HOME of its own, and a control-plane URL where nothing
 * listens.
 */
/**
 * The temp base this suite builds its redirected HOME under.
 *
 * NOT simply `os.tmpdir()`, and not a hardcoded `/tmp` either. The daemon's
 * socket sits at `<home>/Library/Application Support/founder-os/gateway/
 * ipc.sock` — a fixed 56-byte tail the test cannot shorten, because the test
 * redirects HOME and the daemon derives that chain itself. Add `mkdtemp`'s own
 * component and the base has to be small for the whole thing to fit `sun_path`.
 *
 * Measured 2026-09-16 on macOS: the default base `/var/folders/.../T` is 48
 * bytes, the socket path came to 133, and bind returned EINVAL. The three
 * lifecycle tests then failed on 10-second timeouts, because `waitForIpc`
 * polls 100 times at 100ms against a daemon that could never answer. With
 * `TMPDIR=/tmp` the same path is 89 bytes and they pass.
 *
 * Shortening the `mkdtemp` prefix cannot rescue it: even a minimal one leaves
 * 48 + 8 + 56 = 112 bytes, still over Darwin's 104. The base itself must be
 * smaller than 40 bytes, so the base is what this chooses.
 *
 * It PREFERS `os.tmpdir()` and falls back only when that would not fit, so on
 * a platform where the default is already short nothing changes.
 */
function daemonTempBase(): string {
  const limit = process.platform === 'darwin' ? 104 : 108;
  // What gets appended to the base: mkdtemp's component, then the daemon's
  // own fixed chain. Derived rather than hardcoded so it tracks the call below.
  const suffix =
    '/buildroom-daemon-home-XXXXXX' +
    join('', 'Library', 'Application Support', 'founder-os', 'gateway', 'ipc.sock');
  for (const base of [tmpdir(), '/tmp']) {
    if (Buffer.byteLength(base) + Buffer.byteLength(suffix) < limit) return base;
  }
  throw new Error(
    `no temp base short enough for a ${String(Buffer.byteLength(suffix))}-byte ` +
      `socket suffix under the ${String(limit)}-byte sun_path limit; tried ` +
      `${tmpdir()} and /tmp`,
  );
}

function launch(): Launch {
  const home = mkdtempSync(join(daemonTempBase(), 'buildroom-daemon-home-'));
  const paths = gatewayPaths(join(home, 'Library', 'Application Support', 'founder-os', 'gateway'));
  // Asserted, not assumed. If the chain ever outgrows the chosen base this
  // fails in one sentence naming the length, rather than as three tests
  // timing out after ten seconds each with no stated cause.
  assertSocketPathFits(paths.socketPath);
  const child = spawn(process.execPath, [DAEMON_ENTRY], {
    env: {
      ...process.env,
      HOME: home,
      BUILDROOM_CONTROL_PLANE_URL: 'http://127.0.0.1:1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  return {
    child,
    socketPath: paths.socketPath,
    stderr: () => stderr,
    cleanup: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      rmSync(home, { recursive: true, force: true });
    },
  };
}

/** Poll the daemon's IPC socket until it answers, within a bounded budget. */
async function waitForIpc(socketPath: string): Promise<boolean> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const response = await ipcRequest(socketPath, { op: 'status' }, 500);
    if (response.ok) return true;
  }
  return false;
}

function exitOf(child: Launch['child']): Promise<number | null> {
  return new Promise((resolve) => child.once('exit', (code) => resolve(code)));
}

describe('gateway-daemon · the shipped executable is a runnable lifecycle', () => {
  it('daemon:the-entry-point-boots-and-serves-ipc', async () => {
    const l = launch();
    try {
      assert.ok(
        await waitForIpc(l.socketPath),
        `the daemon never answered IPC — stderr: ${l.stderr()}`,
      );
    } finally {
      l.cleanup();
    }
  });

  it('daemon:sigterm-stops-the-timers-closes-the-socket-and-exits-zero', async () => {
    const l = launch();
    try {
      assert.ok(await waitForIpc(l.socketPath), `never reached IPC — stderr: ${l.stderr()}`);

      const exit = exitOf(l.child);
      l.child.kill('SIGTERM');
      const race = await Promise.race([
        exit.then((code) => ({ timedOut: false, code })),
        new Promise<{ timedOut: true; code: number | null }>((resolve) =>
          setTimeout(() => resolve({ timedOut: true, code: null }), 10_000),
        ),
      ]);
      assert.equal(race.timedOut, false, 'the daemon exited on SIGTERM rather than hanging');
      assert.equal(race.code, 0, `clean exit — stderr: ${l.stderr()}`);
      assert.ok(!existsSync(l.socketPath), 'the IPC socket was closed and unlinked');
    } finally {
      l.cleanup();
    }
  });

  it('daemon:sigint-is-the-same-clean-shutdown', async () => {
    const l = launch();
    try {
      assert.ok(await waitForIpc(l.socketPath), `never reached IPC — stderr: ${l.stderr()}`);

      const exit = exitOf(l.child);
      l.child.kill('SIGINT');
      const race = await Promise.race([
        exit.then((code) => ({ timedOut: false, code })),
        new Promise<{ timedOut: true; code: number | null }>((resolve) =>
          setTimeout(() => resolve({ timedOut: true, code: null }), 10_000),
        ),
      ]);
      assert.equal(race.timedOut, false, 'the daemon exited on SIGINT rather than hanging');
      assert.equal(race.code, 0, `clean exit — stderr: ${l.stderr()}`);
    } finally {
      l.cleanup();
    }
  });
});
