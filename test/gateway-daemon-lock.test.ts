/**
 * FOUNDER-ACT-20261029-BR-PLANNER-READINESS, Part C.
 *
 * C2: one daemon per Gateway directory. The lock is real here, on Linux and on
 *     macOS alike (the kernel's exclusive lock on a file in the Gateway
 *     directory), and a holder in another process is killed with SIGKILL to
 *     show that its end frees the directory.
 * C1: a daemon configured for the agy executor that does not select it still
 *     reaps and checks at boot, and logs what it found.
 * C3: the state file's directory is synced after its rename.
 * C4: the daemon makes its Gateway directory before anything else at boot.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { type FileHandle, open as openFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGY_PLANNER_GATEWAY_ID,
  ControlPlaneClient,
  Custody,
  DaemonLockHeld,
  GatewayDaemon,
  GatewayStateStore,
  acquireDaemonLock,
  choosePlannerExecutor,
  daemonLockPath,
  gatewayPaths,
  plannerBootReap,
  reapCommandLine,
  type HeldDaemonLock,
  type PlannerExecutor,
} from '../packages/gateway-daemon/src/index.js';
import { FileKeychainRunner } from './fake-keychain.js';

type GatewayStateShape = { primary: { lane: string } };
const LOCK_MODULE = fileURLToPath(new URL('../packages/gateway-daemon/src/daemon-lock.js', import.meta.url));
const roots: string[] = [];
const children: ChildProcess[] = [];

after(() => {
  for (const child of children) child.kill('SIGKILL');
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function temporary(): string {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-lock-'));
  roots.push(root);
  return root;
}

/** Another process that takes the lock on `directory` and holds it, referenced, until killed. */
async function holder(directory: string): Promise<ChildProcess> {
  const script = `import(${JSON.stringify(LOCK_MODULE)}).then(async (m) => { globalThis.lock = await m.acquireDaemonLock(${JSON.stringify(directory)}); process.stdout.write('held\\n'); setInterval(() => {}, 1 << 30); }, (e) => { process.stderr.write(String(e)); process.exit(3); });`;
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  await new Promise<void>((resolve, reject) => {
    child.stdout?.once('data', () => resolve());
    child.once('exit', (code) => reject(new Error(`the holder exited ${String(code)} before holding`)));
  });
  return child;
}

async function killed(child: ChildProcess): Promise<void> {
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGKILL');
  await exited;
}

/** Takes the lock once it is free, as the kernel frees it when its last holder ends. */
async function takenOnceFree(directory: string): Promise<HeldDaemonLock> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await acquireDaemonLock(directory);
    } catch (error) {
      if (!(error instanceof DaemonLockHeld) || attempt >= 100) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/** A process this one starts after taking a lock, and that outlives the lock's release. */
function laterChild(): ChildProcess {
  const child = spawn('/bin/sleep', ['30'], { stdio: 'ignore' });
  children.push(child);
  return child;
}

function daemonOn(
  directory: string,
  extra: { plannerExecutor?: PlannerExecutor; plannerBootReap?: () => Promise<void>; directoryLock?: HeldDaemonLock } = {},
): GatewayDaemon {
  return new GatewayDaemon({
    paths: gatewayPaths(directory),
    clock: { wallNow: () => Date.now(), monotonicNow: () => 1_000 },
    custody: new Custody(new FileKeychainRunner(join(directory, '..', 'keychain'))),
    client: new ControlPlaneClient('http://control-plane.invalid', () => Promise.reject(new Error('no network in this test'))),
    heartbeatCadenceMs: 10_000,
    ...extra,
  });
}

/** An executor that records its boot and does nothing else. */
function recordingExecutor(events: string[]): PlannerExecutor {
  return {
    attest: () => Promise.reject(new Error('not used')),
    start: () => Promise.reject(new Error('not used')),
    status: () => Promise.reject(new Error('not used')),
    boot: () => {
      events.push('executor.boot');
      return Promise.resolve();
    },
    shutdown: () => Promise.resolve(),
  } as unknown as PlannerExecutor;
}

function socketAnswers(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(path);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

describe('C2: one daemon per Gateway directory', () => {
  it('a second lock on the same directory is refused, in the same process and from another', async () => {
    const directory = temporary();
    const held = await acquireDaemonLock(directory);
    await assert.rejects(acquireDaemonLock(directory), DaemonLockHeld);
    await held.release();
    const child = await holder(directory);
    await assert.rejects(acquireDaemonLock(directory), (error: unknown) => error instanceof DaemonLockHeld && error.code === 'gateway_directory_locked');
    await killed(child);
  });

  it('a holder killed with SIGKILL holds nothing: its end frees the directory, and nothing is removed', async () => {
    const directory = temporary();
    const child = await holder(directory);
    await assert.rejects(acquireDaemonLock(directory), DaemonLockHeld);
    await killed(child);
    const mine = await takenOnceFree(directory);
    await assert.rejects(acquireDaemonLock(directory), DaemonLockHeld, 'and the new holder holds it');
    await mine.release();
  });

  it('the lock is a file in the Gateway directory, mode 0600, never a socket, and never removed', async () => {
    const directory = temporary();
    const held = await acquireDaemonLock(directory);
    assert.equal(daemonLockPath(directory), join(directory, 'daemon.lock'));
    const stat = lstatSync(daemonLockPath(directory));
    assert.equal(stat.isFile(), true);
    assert.equal(stat.mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(directory), ['daemon.lock'], 'nothing else beside it');
    await held.release();
    await held.release();
    assert.deepEqual(readdirSync(directory), ['daemon.lock'], 'a release leaves the file, so no second daemon can lock a new one beside a held one');
  });

  it('a lock file that is a link is refused, not followed', async () => {
    const directory = temporary();
    const elsewhere = join(temporary(), 'target');
    writeFileSync(elsewhere, '');
    symlinkSync(elsewhere, daemonLockPath(directory));
    await assert.rejects(acquireDaemonLock(directory), (error: unknown) => (error as NodeJS.ErrnoException).code === 'ELOOP');
  });

  it('no lock exists, and the daemon does not start, on a platform other than macOS and Linux', async () => {
    await assert.rejects(acquireDaemonLock(temporary(), 'win32'), /no Gateway daemon lock exists for win32/);
  });

  it('a released lock can be taken again at once, and two directories never share one', async () => {
    const one = temporary();
    const two = temporary();
    const first = await acquireDaemonLock(one);
    const second = await acquireDaemonLock(two);
    await first.release();
    const again = await acquireDaemonLock(one);
    await again.release();
    await second.release();
  });

  it('of daemons that take a free lock at once, or one a killed holder left, exactly one holds it', async () => {
    for (const leftBehind of [false, true]) {
      const directory = temporary();
      if (leftBehind) await killed(await holder(directory));
      if (leftBehind) await (await takenOnceFree(directory)).release();
      const results = await Promise.allSettled([1, 2, 3, 4].map(() => acquireDaemonLock(directory)));
      const held = results.filter((r): r is PromiseFulfilledResult<HeldDaemonLock> => r.status === 'fulfilled');
      assert.equal(held.length, 1, `${leftBehind ? 'after a killed holder' : 'a free lock'}: ${JSON.stringify(results.map((r) => r.status))}`);
      for (const r of results) if (r.status === 'rejected') assert.ok(r.reason instanceof DaemonLockHeld, String(r.reason));
      await assert.rejects(acquireDaemonLock(directory), DaemonLockHeld, 'and it still holds');
      await held[0]?.value.release();
    }
  });

  it('the lock is held by the taking process alone: no process is left holding it, and no later child inherits it', async () => {
    const directory = temporary();
    const held = await acquireDaemonLock(directory);
    if (process.platform === 'linux') {
      const flock = spawnSync('/usr/bin/pgrep', ['-P', String(process.pid), '-x', 'flock'], { encoding: 'utf8' }).stdout.trim();
      assert.equal(flock, '', 'flock took the lock and exited');
    }
    const child = laterChild();
    await held.release();
    const next = await acquireDaemonLock(directory);
    assert.equal(child.exitCode, null, 'the later child still runs, and holds nothing');
    await next.release();
    await killed(child);
  });

  it('a second daemon on a live daemon\'s directory stops before its lanes, its Planner, its reap or the socket', async () => {
    const root = temporary();
    const directory = join(root, 'gateway');
    const paths = gatewayPaths(directory);
    const events: string[] = [];
    const secondEvents: string[] = [];
    let reaped = 0;
    const live = daemonOn(directory, { plannerExecutor: recordingExecutor(events) });
    await live.boot();
    const second = daemonOn(directory, { plannerExecutor: recordingExecutor(secondEvents) });
    const third = daemonOn(directory, {
      plannerBootReap: () => {
        reaped += 1;
        return Promise.resolve();
      },
    });
    try {
      assert.deepEqual(events, ['executor.boot']);
      assert.equal(await socketAnswers(paths.socketPath), true, 'the live daemon serves its socket');
      await assert.rejects(second.boot(), DaemonLockHeld);
      await assert.rejects(third.boot(), DaemonLockHeld);
      // A refused daemon that is then stopped, by a signal say, leaves the live daemon's socket.
      await second.stop();
      await third.stop();
      assert.deepEqual(secondEvents, [], 'the second daemon\'s Planner never booted');
      assert.equal(reaped, 0, 'and a daemon with only a boot reap never reaped');
      assert.equal(await socketAnswers(paths.socketPath), true, 'the live daemon still holds its socket');
    } finally {
      // A daemon left running would hold the test process open: stop every one, whatever failed.
      await Promise.all([live.stop(), second.stop(), third.stop()]);
    }
    const next = daemonOn(directory, { plannerExecutor: recordingExecutor(secondEvents) });
    await next.boot();
    assert.deepEqual(secondEvents, ['executor.boot'], 'once the live daemon stopped, the next one boots');
    await next.stop();
  });

  it('a daemon given the lock its caller took boots on it, and its stop releases it; one never booted releases it too', async () => {
    const directory = join(temporary(), 'gateway');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const daemon = daemonOn(directory, { directoryLock: await acquireDaemonLock(directory) });
    try {
      await daemon.boot();
      await assert.rejects(acquireDaemonLock(directory), DaemonLockHeld, 'the daemon holds the lock it was given');
    } finally {
      await daemon.stop();
    }
    const unbooted = daemonOn(directory, { directoryLock: await acquireDaemonLock(directory) });
    await unbooted.stop();
    await (await acquireDaemonLock(directory)).release();
  });

  it('a stopping daemon holds the directory until its stop has finished, and its cleanup leaves the next daemon\'s socket', async () => {
    const directory = join(temporary(), 'gateway');
    const paths = gatewayPaths(directory);
    let finishShutdown: () => void = () => undefined;
    const slowShutdown = new Promise<void>((resolve) => {
      finishShutdown = resolve;
    });
    const old = daemonOn(directory, {
      plannerExecutor: { ...recordingExecutor([]), shutdown: () => slowShutdown } as unknown as PlannerExecutor,
    });
    await old.boot();
    const stopped = old.stop();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const early = daemonOn(directory);
    await assert.rejects(early.boot(), DaemonLockHeld, 'no daemon boots while the old one is still stopping');
    await assert.rejects(acquireDaemonLock(directory), DaemonLockHeld);
    finishShutdown();
    await stopped;
    const next = daemonOn(directory);
    try {
      await next.boot();
      await old.stop();
      await early.stop();
      assert.equal(await socketAnswers(paths.socketPath), true, 'the next daemon keeps its socket');
    } finally {
      await next.stop();
    }
  });
});

describe('C2: a boot that fails gives the directory back', () => {
  it('a stopped daemon boots no more', async () => {
    const daemon = daemonOn(join(temporary(), 'gateway'));
    await daemon.boot();
    await daemon.stop();
    await assert.rejects(daemon.boot(), /failed to boot or was stopped: construct a new one/);
  });

  it('a daemon whose lanes\' recovery rejects releases the lock, and the next boot on the directory proceeds', async () => {
    const directory = join(temporary(), 'gateway');
    const failing = daemonOn(directory);
    (failing as unknown as { completeInterruptedStaging: () => Promise<void> }).completeInterruptedStaging = () =>
      Promise.reject(new Error('staging recovery failed'));
    await assert.rejects(failing.boot(), /staging recovery failed/);
    const next = daemonOn(directory);
    try {
      await next.boot();
    } finally {
      await next.stop();
      await failing.stop();
    }
  });

  it('a daemon whose boot fails after its socket is bound closes and removes the socket before it releases the lock, and boots no more', async () => {
    const directory = join(temporary(), 'gateway');
    const paths = gatewayPaths(directory);
    const failing = daemonOn(directory);
    const ipc = (failing as unknown as { ipc: { start: () => Promise<void> } }).ipc;
    const start = ipc.start.bind(ipc);
    let listeningAtRelease: boolean | null = null;
    ipc.start = async () => {
      await start();
      const lock = (failing as unknown as { directoryLock: HeldDaemonLock }).directoryLock;
      const release = lock.release.bind(lock);
      (lock as { release: () => Promise<void> }).release = async () => {
        listeningAtRelease = existsSync(paths.socketPath) || (await socketAnswers(paths.socketPath));
        return release();
      };
      throw new Error('failed after bind');
    };
    await assert.rejects(failing.boot(), /failed after bind/);
    assert.equal(listeningAtRelease, false, 'the socket was closed and removed before the lock was released');
    ipc.start = start;
    await assert.rejects(failing.boot(), /failed to boot or was stopped: construct a new one/, 'a failed daemon boots no more');
    assert.equal(await socketAnswers(paths.socketPath), false, 'and its refused retry bound nothing');
    assert.equal(await socketAnswers(paths.socketPath), false, 'nothing listens on the directory');
    const next = daemonOn(directory);
    try {
      await next.boot();
      await failing.stop();
      assert.equal(await socketAnswers(paths.socketPath), true, 'the failed daemon\'s later stop leaves the next daemon\'s socket');
    } finally {
      await next.stop();
      await failing.stop();
    }
  });
});

describe('C1: the boot reap of a daemon that does not run the executor', () => {
  const configured = {
    BUILDROOM_PLANNER_EXECUTOR: 'agy',
    BUILDROOM_PLANNER_USER: 'buildroom-planner',
    BUILDROOM_PLANNER_AGY: '/opt/buildroom-agy/agy',
    BUILDROOM_PLANNER_AGY_SHA256: 'a'.repeat(64),
    BUILDROOM_PLANNER_CHECKOUTS: '/var/lib/buildroom-planner-checkouts',
  };

  it('every refusal of a configured executor carries the boot reap', () => {
    const cases: [string, Parameters<typeof choosePlannerExecutor>[0]][] = [
      ['another Gateway', { env: configured, platform: 'linux', gatewayId: 'another-gateway', gatewayDirectory: '/g' }],
      ['no identity', { env: configured, platform: 'linux', gatewayId: null, gatewayDirectory: '/g' }],
      ['not Linux', { env: configured, platform: 'darwin', gatewayId: AGY_PLANNER_GATEWAY_ID, gatewayDirectory: '/g' }],
      ['a setting missing', { env: { ...configured, BUILDROOM_PLANNER_AGY: undefined }, platform: 'linux', gatewayId: AGY_PLANNER_GATEWAY_ID, gatewayDirectory: '/g' }],
      ['a setting the executor refuses', { env: { ...configured, BUILDROOM_PLANNER_AGY: 'relative/agy' }, platform: 'linux', gatewayId: AGY_PLANNER_GATEWAY_ID, gatewayDirectory: '/g' }],
    ];
    for (const [name, context] of cases) {
      const choice = choosePlannerExecutor(context);
      assert.equal(choice.kind, 'refused', name);
      assert.equal(choice.kind === 'refused' && typeof choice.bootReap, 'function', `${name}: the refusal carries the boot reap`);
    }
  });

  it('no boot reap without a planner user it can name, or without the agy executor chosen', () => {
    const none = [
      choosePlannerExecutor({ env: { ...configured, BUILDROOM_PLANNER_USER: undefined }, platform: 'linux', gatewayId: 'another', gatewayDirectory: '/g' }),
      choosePlannerExecutor({ env: { ...configured, BUILDROOM_PLANNER_USER: '-x' }, platform: 'linux', gatewayId: 'another', gatewayDirectory: '/g' }),
      choosePlannerExecutor({ env: { ...configured, BUILDROOM_PLANNER_EXECUTOR: 'other' }, platform: 'linux', gatewayId: 'another', gatewayDirectory: '/g' }),
    ];
    for (const choice of none) assert.equal(choice.kind === 'refused' ? choice.bootReap : 'not refused', undefined);
    assert.deepEqual(choosePlannerExecutor({ env: {}, platform: 'linux', gatewayId: 'another', gatewayDirectory: '/g' }), { kind: 'none' });
  });

  it('the reap is the executor\'s second privilege rule, exactly', () => {
    assert.deepEqual(reapCommandLine('/usr/bin/sudo', 'buildroom-planner'), [
      '/usr/bin/sudo', '-n', '-u', 'buildroom-planner', '--', '/usr/bin/pkill', '-KILL', '-u', 'buildroom-planner',
    ]);
  });

  it('it reaps, checks, and logs what it found; a failure is logged as an error and starts nothing', async () => {
    const run = async (reap: () => Promise<void>, probe: () => Promise<boolean>): Promise<string[]> => {
      const logged: string[] = [];
      await plannerBootReap('buildroom-planner', (level, at) => logged.push(`${level}:${at}`), { reap, probe })();
      return logged;
    };
    assert.deepEqual(await run(() => Promise.resolve(), () => Promise.resolve(false)), ['info:planner.boot_reaped']);
    assert.deepEqual(await run(() => Promise.resolve(), () => Promise.resolve(true)), ['error:planner.boot_reap_left_processes']);
    assert.deepEqual(await run(() => Promise.reject(new Error('sudo refused')), () => Promise.resolve(false)), [
      'error:planner.boot_reap_failed',
      'info:planner.boot_reaped',
    ]);
    assert.deepEqual(await run(() => Promise.resolve(), () => Promise.reject(new Error('pgrep missing'))), ['error:planner.boot_check_failed']);
  });

  it('the daemon runs it at boot, after the lanes, when it has no executor; one with an executor boots that instead', async () => {
    let reaped = 0;
    const plain = daemonOn(join(temporary(), 'gateway'), {
      plannerBootReap: () => {
        reaped += 1;
        return Promise.resolve();
      },
    });
    try {
      await plain.boot();
      assert.equal(reaped, 1);
    } finally {
      await plain.stop();
    }

    const events: string[] = [];
    const withExecutor = daemonOn(join(temporary(), 'gateway'), {
      plannerExecutor: recordingExecutor(events),
      plannerBootReap: () => {
        reaped += 1;
        return Promise.resolve();
      },
    });
    try {
      await withExecutor.boot();
      assert.deepEqual(events, ['executor.boot']);
      assert.equal(reaped, 1, 'the executor\'s own boot reaps; the boot reap is not run beside it');
    } finally {
      await withExecutor.stop();
    }
  });

  it('it runs even when the lanes\' recovery rejects', async () => {
    let reaped = 0;
    const daemon = daemonOn(join(temporary(), 'gateway'), {
      plannerBootReap: () => {
        reaped += 1;
        return Promise.resolve();
      },
    });
    (daemon as unknown as { completeInterruptedStaging: () => Promise<void> }).completeInterruptedStaging = () =>
      Promise.reject(new Error('staging recovery failed'));
    try {
      await assert.rejects(daemon.boot(), /staging recovery failed/);
      assert.equal(reaped, 1);
    } finally {
      await daemon.stop();
    }
  });
});

describe('C3 and C4: the Gateway directory', () => {
  it('the daemon makes its directory first at boot, before the Planner boots', async () => {
    const directory = join(temporary(), 'not-yet', 'gateway');
    let existedAtPlannerBoot = false;
    const daemon = daemonOn(directory, {
      plannerExecutor: {
        ...recordingExecutor([]),
        boot: () => {
          existedAtPlannerBoot = existsSync(directory);
          return Promise.resolve();
        },
      } as unknown as PlannerExecutor,
    });
    try {
      await daemon.boot();
      assert.equal(existedAtPlannerBoot, true);
    } finally {
      await daemon.stop();
    }
  });

  it('a state write syncs the file before its rename and the directory after it, once the rename has landed', async () => {
    const directory = join(temporary(), 'gateway');
    mkdirSync(directory);
    const store = new GatewayStateStore(gatewayPaths(directory));
    const state = await store.read();
    const probe = await openFile(LOCK_MODULE, 'r');
    const prototype = Object.getPrototypeOf(probe) as { sync: (this: FileHandle) => Promise<void> };
    await probe.close();
    const original = prototype.sync;
    const written = { ...state, primary: { ...state.primary, lane: 'HALTED' as const } };
    const before = readFileSync(gatewayPaths(directory).statePath, { encoding: 'utf8', flag: 'a+' });
    const syncs: string[] = [];
    prototype.sync = async function (this: FileHandle): Promise<void> {
      const stat = await this.stat();
      // What the state file holds when each sync runs: the old content before the rename, the new after.
      const now = readFileSync(gatewayPaths(directory).statePath, 'utf8');
      const holds = now === before ? 'old' : (JSON.parse(now) as GatewayStateShape).primary.lane === 'HALTED' ? 'new' : 'other';
      syncs.push(stat.isDirectory() ? `directory:${String(stat.ino)}:${holds}` : `file:${holds}`);
      return original.call(this);
    };
    try {
      await store.write(written);
    } finally {
      prototype.sync = original;
    }
    const { ino } = await (await import('node:fs/promises')).stat(directory);
    assert.deepEqual(syncs, ['file:old', `directory:${String(ino)}:new`], 'the file is synced before the rename, the directory after it');
  });
});
