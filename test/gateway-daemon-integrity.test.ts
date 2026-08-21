/**
 * §14/§15/§16 (correction 5, review findings #9, #10, #13 and #15) — daemon
 * integrity at the boundaries the review found unguarded.
 *
 *   #9  a boot that finds an unparsable primary custody secret must recover
 *       (skip the adoption, serve IPC) rather than reject — the unparsable
 *       secret is a custody problem `doctor` can report, not a reason the
 *       daemon cannot run.
 *   #10 stop() must not settle while a tick it overlaps is still in flight.
 *   #13 an untrustworthy challenge or session-start body is never signed into
 *       an envelope or promoted into a heartbeat — transport instead.
 *   #15 a disposition-bearing staging probe persists its outcome only under
 *       the §14 cross-process staging lock.
 *
 * Every case is a choreography against an injected fetch, in the shape of the
 * delivered tick suite: no scheduler dependence, no live network.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KEYCHAIN_SERVICE,
  ControlPlaneClient,
  Custody,
  GatewayDaemon,
  GatewayStateStore,
  emptyState,
  gatewayPaths,
  generateGatewayKeypair,
  ipcRequest,
  type FetchLike,
  type GatewayPaths,
} from '../packages/gateway-daemon/src/index.js';
import type { Clock } from '../packages/gateway-protocol/src/index.js';
import { FileKeychainRunner } from './fake-keychain.js';

const GATEWAY_ID = '11111111-2222-4333-8444-555555555555';
const HEX64 = 'ab'.repeat(32);
const WALL = Date.parse('2026-08-19T12:00:00Z');

const CHALLENGE_BODY = {
  generation: 4,
  challenge: HEX64,
  issuedAt: new Date(WALL - 60_000).toISOString(),
};

interface DaemonFixture {
  readonly daemon: GatewayDaemon;
  readonly paths: GatewayPaths;
  readonly state: GatewayStateStore;
  readonly runner: FileKeychainRunner;
  readonly cleanup: () => void;
}

function daemonFixture(fetchImpl: FetchLike): DaemonFixture {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-integrity-'));
  const paths = gatewayPaths(join(root, 'gateway'));
  const runner = new FileKeychainRunner(join(root, 'keychain'));
  const clock: Clock = { wallNow: () => WALL, monotonicNow: () => 1_000 };
  const daemon = new GatewayDaemon({
    paths,
    clock,
    custody: new Custody(runner),
    client: new ControlPlaneClient('http://control-plane.invalid', fetchImpl),
    heartbeatCadenceMs: 10_000,
  });
  return {
    daemon,
    paths,
    state: new GatewayStateStore(paths),
    runner,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('gateway-daemon · boot and stop survive what the disk hands them', () => {
  it('boot:an-unparsable-primary-custody-secret-is-recoverable-not-fatal', async () => {
    const f = daemonFixture(async () => new Response(JSON.stringify({ error: 'not_leader' }), { status: 503 }));
    try {
      const keypair = generateGatewayKeypair();
      await f.state.write({
        ...emptyState(),
        primary: {
          lane: 'HEARTBEATING',
          identity: { gatewayId: GATEWAY_ID, keyId: keypair.keyId, fingerprint: HEX64 },
          lastServerState: 'enrolled',
          lastObservedAt: null,
        },
      });
      // Custody holds garbage where the primary key should be.
      await f.runner.run(
        ['add-generic-password', '-a', 'primary', '-s', KEYCHAIN_SERVICE, '-w'],
        'not-a-key\nnot-a-key\n',
      );

      await f.daemon.boot();

      const status = await ipcRequest(f.paths.socketPath, { op: 'status' });
      assert.equal(status.ok, true, 'the daemon serves IPC despite the unparsable secret');
      const primary = (status.ok ? status.body['primary'] : undefined) as { lane?: unknown } | undefined;
      assert.equal(primary?.lane, 'IDLE', 'the identity is not adopted from an unparsable secret');
    } finally {
      // Failure-safe teardown: a listening IPC server would hold the process.
      await f.daemon.stop().catch(() => undefined);
      f.cleanup();
    }
  });

  it('stop:does-not-settle-while-a-tick-is-still-in-flight', async () => {
    let release!: (response: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    let released = false;
    const releaseOnce = (response: Response): void => {
      if (released) return;
      released = true;
      release(response);
    };
    const fetchImpl: FetchLike = () => gate;
    const f = daemonFixture(fetchImpl);
    try {
      const keypair = generateGatewayKeypair();
      f.daemon.primary.adopt({
        gatewayId: GATEWAY_ID,
        keyId: keypair.keyId,
        pubkeyBase64: keypair.pubkeyBase64,
        privateKey: keypair.privateKey,
      });

      const tickP = f.daemon.tick();
      let tickDone = false;
      void tickP.then(
        () => {
          tickDone = true;
        },
        () => {
          tickDone = true;
        },
      );

      let stopDone = false;
      const stopP = f.daemon.stop().then(() => {
        stopDone = true;
      });

      for (let i = 0; i < 25; i += 1) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      assert.ok(!(stopDone && !tickDone), 'stop() must not complete before the tick it overlaps');

      releaseOnce(new Response(JSON.stringify({ error: 'not_leader' }), { status: 503 }));
      await tickP;
      await stopP;
    } finally {
      releaseOnce(new Response(JSON.stringify({ error: 'not_leader' }), { status: 503 }));
      await f.daemon.stop().catch(() => undefined);
      f.cleanup();
    }
  });
});

describe('gateway-daemon · lane envelope integrity', () => {
  it('envelope:an-empty-challenge-body-is-never-signed-into-a-session-start', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = (url) => {
      calls.push(url);
      return Promise.resolve(new Response('', { status: 200 }));
    };
    const f = daemonFixture(fetchImpl);
    try {
      const keypair = generateGatewayKeypair();
      f.daemon.primary.adopt({
        gatewayId: GATEWAY_ID,
        keyId: keypair.keyId,
        pubkeyBase64: keypair.pubkeyBase64,
        privateKey: keypair.privateKey,
      });
      await f.daemon.tick();

      assert.equal(
        calls.filter((url) => url.endsWith('/gateway/session-start')).length,
        0,
        'a success body without its members is a transport event; no envelope is built or sent',
      );
    } finally {
      await f.daemon.stop().catch(() => undefined);
      f.cleanup();
    }
  });

  it('envelope:a-session-start-success-without-its-epoch-is-transport-never-a-heartbeat', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = (url) => {
      calls.push(url);
      if (url.endsWith('/gateway/session-challenge')) {
        return Promise.resolve(
          new Response(JSON.stringify(CHALLENGE_BODY), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      if (url.endsWith('/gateway/session-start')) {
        return Promise.resolve(new Response('', { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'not_leader' }), { status: 503 }));
    };
    const f = daemonFixture(fetchImpl);
    try {
      const keypair = generateGatewayKeypair();
      f.daemon.primary.adopt({
        gatewayId: GATEWAY_ID,
        keyId: keypair.keyId,
        pubkeyBase64: keypair.pubkeyBase64,
        privateKey: keypair.privateKey,
      });
      await f.daemon.tick();

      assert.equal(f.daemon.primary.laneState, 'TRANSPORT_RETRY');
      assert.equal(
        calls.filter((url) => url.endsWith('/gateway/heartbeat')).length,
        0,
        'no heartbeat is built from a body the envelope never legitimately received',
      );
    } finally {
      await f.daemon.stop().catch(() => undefined);
      f.cleanup();
    }
  });
});

describe('gateway-daemon · staging outcomes persist only under the §14 lock', () => {
  it('lock:a-disposition-bearing-probe-writes-nothing-while-a-foreign-holds-the-lock', async () => {
    const fetchImpl: FetchLike = (url) => {
      if (url.endsWith('/gateway/session-challenge')) {
        return Promise.resolve(
          new Response(JSON.stringify(CHALLENGE_BODY), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      if (url.endsWith('/gateway/session-start')) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'awaiting_approval' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'not_leader' }), { status: 503 }));
    };
    const f = daemonFixture(fetchImpl);
    try {
      const keypair = generateGatewayKeypair();
      await f.state.write({
        ...emptyState(),
        staging: {
          lane: 'AWAITING',
          identity: { gatewayId: GATEWAY_ID, keyId: keypair.keyId, fingerprint: HEX64 },
          idempotencyKey: '11111111-2222-4333-8444-555555555556',
          redeemStartedAt: new Date(WALL).toISOString(),
          lastServerState: 'awaiting_approval',
          lastObservedAt: null,
        },
      });
      await f.runner.run(
        ['add-generic-password', '-a', 'staging', '-s', KEYCHAIN_SERVICE, '-w'],
        `${keypair.privateKeySecret}\n${keypair.privateKeySecret}\n`,
      );
      await f.daemon.boot();

      // A foreign process holds the staging lock; it is never ours to remove.
      const fd = openSync(f.paths.stagingLockPath, 'wx', 0o600);
      writeSync(
        fd,
        JSON.stringify({
          pid: process.pid + 1,
          ownerToken: 'a-foreign-owner',
          acquiredAt: new Date(WALL).toISOString(),
          operation: 'enroll',
        }),
      );
      closeSync(fd);

      try {
        await f.daemon.tick();
        const state = await f.state.read();
        assert.equal(
          state.staging.lastObservedAt,
          null,
          'a disposition reached without the lock persists nothing',
        );
      } finally {
        // The test created this lock; only the test removes it.
        rmSync(f.paths.stagingLockPath, { force: true });
      }

      await f.daemon.tick();
      const state = await f.state.read();
      assert.notEqual(
        state.staging.lastObservedAt,
        null,
        'with the lock free, the same disposition persists',
      );
    } finally {
      await f.daemon.stop().catch(() => undefined);
      f.cleanup();
    }
  });
});

/*
 * (correction 5, finding #3 / M2) The daemon ENTRY refuses hostile plane
 * configuration, exactly as the CLI entry does. Both cases spawn the real
 * compiled entry against a throwaway HOME, in the shape of the smoke script —
 * nothing here can touch a real Keychain or a real gateway directory.
 */
describe('gateway-daemon · the entry refuses a hostile control-plane URL', () => {
  const ENTRY = fileURLToPath(new URL('../packages/gateway-daemon/src/main.js', import.meta.url));

  function spawnEntry(url: string, home: string) {
    return spawn(process.execPath, [ENTRY], {
      env: { ...process.env, HOME: home, BUILDROOM_CONTROL_PLANE_URL: url },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  it('exits 1 naming BUILDROOM_CONTROL_PLANE_URL for plain-http non-loopback', async () => {
    const home = mkdtempSync(join(tmpdir(), 'buildroom-daemon-url-'));
    const child = spawnEntry('http://192.0.2.10:8080', home);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const code = await new Promise<number | null>((resolve) => {
      child.on('close', (exitCode) => resolve(exitCode));
    });
    rmSync(home, { recursive: true, force: true });
    assert.equal(code, 1, 'hostile configuration refuses to start');
    assert.match(stderr, /BUILDROOM_CONTROL_PLANE_URL/);
  });

  it('does not refuse a loopback URL — the gate is not a blanket rejection', async () => {
    const home = mkdtempSync(join(tmpdir(), 'buildroom-daemon-url-'));
    const child = spawnEntry('http://127.0.0.1:8080', home);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    /*
     * The close listener is attached at spawn, not after the wait: a daemon
     * that exits on its own (a bare sandbox HOME has no gateway directory, so
     * boot fails closed — the directory is the enrolment verb's to create)
     * would never fire a listener attached after the fact, and the case would
     * hang instead of reporting. This control asserts the GATE only: loopback
     * passes it, and whatever boot does afterwards never names the variable.
     */
    const closed = new Promise<void>((resolve) => {
      child.on('close', () => resolve());
    });
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    child.kill('SIGTERM');
    await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 2_000))]);
    rmSync(home, { recursive: true, force: true });
    assert.doesNotMatch(stderr, /BUILDROOM_CONTROL_PLANE_URL/, 'loopback is not refused');
  });
});
