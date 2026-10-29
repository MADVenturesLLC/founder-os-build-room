/**
 * FOUNDER-ACT-20261029-BR-PLANNER-READINESS, Part C.
 *
 * C2: one daemon per Gateway directory. The lock is real here, on Linux and on
 *     macOS alike (a Unix socket listening in the Gateway directory), and a
 *     holder in another process is killed with SIGKILL to show that what it
 *     leaves behind does not hold the directory.
 * C1: a daemon configured for the agy executor that does not select it still
 *     reaps and checks at boot, and logs what it found.
 * C3: the state file's directory is synced after its rename.
 * C4: the daemon makes its Gateway directory before anything else at boot.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  type PlannerExecutor,
} from '../packages/gateway-daemon/src/index.js';
import { FileKeychainRunner } from './fake-keychain.js';

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

/** Another process that takes the lock on `directory` and holds it until killed. */
async function holder(directory: string): Promise<ChildProcess> {
  const script = `import(${JSON.stringify(LOCK_MODULE)}).then(async (m) => { await m.acquireDaemonLock(${JSON.stringify(directory)}); process.stdout.write('held\\n'); setInterval(() => {}, 1 << 30); }, (e) => { process.stderr.write(String(e)); process.exit(3); });`;
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

function daemonOn(directory: string, extra: { plannerExecutor?: PlannerExecutor; plannerBootReap?: () => Promise<void> } = {}): GatewayDaemon {
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

  it('a holder killed with SIGKILL frees the lock: the path it leaves answers nothing, and is taken again', async () => {
    const directory = temporary();
    const child = await holder(directory);
    await assert.rejects(acquireDaemonLock(directory), DaemonLockHeld);
    await killed(child);
    assert.equal(lstatSync(daemonLockPath(directory)).isSocket(), true, 'the dead holder left its path');
    const mine = await acquireDaemonLock(directory);
    await mine.release();
  });

  it('the lock lives in the Gateway directory, mode 0600, and a release removes it', async () => {
    const directory = temporary();
    const held = await acquireDaemonLock(directory);
    assert.equal(daemonLockPath(directory), join(directory, 'lock.sock'));
    assert.equal(lstatSync(daemonLockPath(directory)).mode & 0o777, 0o600);
    await held.release();
    await held.release();
    assert.equal(existsSync(daemonLockPath(directory)), false);
  });

  it('a released lock can be taken again, and two directories never share one', async () => {
    const one = temporary();
    const two = temporary();
    const first = await acquireDaemonLock(one);
    const second = await acquireDaemonLock(two);
    await first.release();
    const again = await acquireDaemonLock(one);
    await again.release();
    await second.release();
  });

  it('of daemons that take a free lock at once, or replace one left behind at once, exactly one holds it', async () => {
    for (const leftBehind of [false, true]) {
      const directory = temporary();
      if (leftBehind) await killed(await holder(directory));
      const results = await Promise.allSettled([1, 2, 3, 4].map(() => acquireDaemonLock(directory)));
      const held = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireDaemonLock>>> => r.status === 'fulfilled');
      assert.equal(held.length, 1, `${leftBehind ? 'replacing a stale path' : 'a free path'}: ${JSON.stringify(results.map((r) => r.status))}`);
      for (const r of results) if (r.status === 'rejected') assert.ok(r.reason instanceof DaemonLockHeld);
      assert.equal(lstatSync(daemonLockPath(directory)).isSocket(), true, 'the holder\'s path is still there');
      await assert.rejects(acquireDaemonLock(directory), DaemonLockHeld, 'and still holds');
      await held[0]?.value.release();
    }
  });

  it('a file left at the path that nothing answers on does not hold the directory', async () => {
    const directory = temporary();
    writeFileSync(daemonLockPath(directory), '');
    const held = await acquireDaemonLock(directory);
    assert.equal(lstatSync(daemonLockPath(directory)).isSocket(), true);
    await held.release();
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
});

describe('C2: a boot that fails gives the directory back', () => {
  it('a daemon whose lanes\' recovery rejects releases the lock, and the next boot on the directory proceeds', async () => {
    const directory = join(temporary(), 'gateway');
    const failing = daemonOn(directory);
    (failing as unknown as { completeInterruptedStaging: () => Promise<void> }).completeInterruptedStaging = () =>
      Promise.reject(new Error('staging recovery failed'));
    await assert.rejects(failing.boot(), /staging recovery failed/);
    assert.equal(existsSync(daemonLockPath(directory)), false, 'the lock was released');
    const next = daemonOn(directory);
    try {
      await next.boot();
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

  it('a state write syncs the file before its rename and the directory after it', async () => {
    const directory = join(temporary(), 'gateway');
    mkdirSync(directory);
    const store = new GatewayStateStore(gatewayPaths(directory));
    const state = await store.read();
    const probe = await openFile(LOCK_MODULE, 'r');
    const prototype = Object.getPrototypeOf(probe) as { sync: (this: FileHandle) => Promise<void> };
    await probe.close();
    const original = prototype.sync;
    const syncs: string[] = [];
    prototype.sync = async function (this: FileHandle): Promise<void> {
      const stat = await this.stat();
      syncs.push(stat.isDirectory() ? `directory:${String(stat.ino)}` : 'file');
      return original.call(this);
    };
    try {
      await store.write(state);
    } finally {
      prototype.sync = original;
    }
    const { ino } = await (await import('node:fs/promises')).stat(directory);
    assert.deepEqual(syncs, ['file', `directory:${String(ino)}`]);
  });
});
