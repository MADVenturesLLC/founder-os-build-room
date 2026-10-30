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
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DaemonLockHeld,
  SUN_PATH_MAX,
  acquireDaemonLock,
  assertSocketPathFits,
  gatewayPaths,
  ipcRequest,
} from '../packages/gateway-daemon/src/index.js';

const DAEMON_ENTRY = fileURLToPath(new URL('../packages/gateway-daemon/src/main.js', import.meta.url));

interface Launch {
  readonly child: ReturnType<typeof spawn>;
  readonly home: string;
  readonly socketPath: string;
  readonly statePath: string;
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
  // What the socket path costs beyond the base: `mkdtemp`'s component (the
  // prefix plus the six characters it appends), then the daemon's own chain.
  // Measured by running the SAME calls `launch()` makes against a probe base
  // and subtracting it back out, so this tracks those calls instead of being a
  // second hardcoded copy of them -- separators and the `ipc.sock` that
  // `gatewayPaths` appends included. An earlier revision restated the chain as
  // a literal and was one byte short, which is exactly the drift this avoids.
  const probe = '/probe';
  const probeHome = join(probe, 'buildroom-daemon-home-XXXXXX');
  const suffixBytes =
    Buffer.byteLength(
      gatewayPaths(join(probeHome, 'Library', 'Application Support', 'founder-os', 'gateway'))
        .socketPath,
    ) - Buffer.byteLength(probe);
  for (const base of [tmpdir(), '/tmp']) {
    if (Buffer.byteLength(base) + suffixBytes < SUN_PATH_MAX) return base;
  }
  throw new Error(
    `no temp base short enough for a ${String(suffixBytes)}-byte socket suffix ` +
      `under the ${String(SUN_PATH_MAX)}-byte sun_path limit; tried ` +
      `${tmpdir()} and /tmp`,
  );
}

function launch(options: { home?: string; env?: Record<string, string> } = {}): Launch {
  const home = options.home ?? mkdtempSync(join(daemonTempBase(), 'buildroom-daemon-home-'));
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
      ...options.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  return {
    child,
    home,
    socketPath: paths.socketPath,
    statePath: paths.statePath,
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

/** The child's exit code, or `timedOut` if it has not exited within `ms`. */
async function exitWithin(child: Launch['child'], ms: number): Promise<number | null | 'timedOut'> {
  if (child.exitCode !== null) return child.exitCode;
  return Promise.race([exitOf(child), new Promise<'timedOut'>((resolve) => setTimeout(() => resolve('timedOut'), ms))]);
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

describe('gateway-daemon · one entry point per Gateway directory (FOUNDER-ACT-20261029-BR-PLANNER-READINESS C2)', () => {
  it('daemon:a-second-entry-point-on-a-held-directory-exits-one-before-it-reads-state', async () => {
    const live = launch();
    let second: Launch | null = null;
    try {
      assert.ok(await waitForIpc(live.socketPath), `never reached IPC — stderr: ${live.stderr()}`);
      // A state file nothing writes to: a process that reads it before the lock never gets past the read.
      rmSync(live.statePath, { force: true });
      assert.equal(spawnSync('mkfifo', ['-m', '600', live.statePath]).status, 0, 'mkfifo');
      second = launch({ home: live.home, env: { BUILDROOM_PLANNER_EXECUTOR: 'agy' } });
      const code = await exitWithin(second.child, 10_000);
      assert.equal(code, 1, `the second daemon exits 1 — stderr: ${second.stderr()}`);
      assert.match(second.stderr(), /another Gateway daemon holds .*: this one does not start/);
      assert.doesNotMatch(second.stderr(), /planner executor/, 'it chose no executor');
      assert.ok(existsSync(live.socketPath), 'the live daemon keeps its socket');
      assert.equal((await ipcRequest(live.socketPath, { op: 'status' }, 500)).ok, true, 'and still answers on it');
    } finally {
      if (second !== null && second.child.exitCode === null) second.child.kill('SIGKILL');
      live.cleanup();
    }
  });

  it('daemon:the-entry-point-holds-the-directory-until-it-has-exited', async () => {
    const l = launch();
    try {
      assert.ok(await waitForIpc(l.socketPath), `never reached IPC — stderr: ${l.stderr()}`);
      const directory = dirname(l.socketPath);
      await assert.rejects(acquireDaemonLock(directory), DaemonLockHeld, 'the running daemon holds its directory');
      const exit = exitOf(l.child);
      l.child.kill('SIGTERM');
      assert.equal(await exit, 0, `clean exit — stderr: ${l.stderr()}`);
      const after = await acquireDaemonLock(directory);
      await after.release();
    } finally {
      l.cleanup();
    }
  });
});
