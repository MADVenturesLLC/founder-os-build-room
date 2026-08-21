/**
 * §15 (correction B6, Rev 4.7 tester) — the daemon's timers may not pile up.
 *
 * Two halves of one defect. The cadence interval fired `tick()` without
 * checking whether the previous tick had returned, so one slow network wait
 * made every subsequent fire stack another request behind it. And the client's
 * fetch had no bound at all, so a control plane that accepted the connection
 * and never answered hung its tick FOREVER — which, with stacking, meant an
 * unbounded pile of hung requests and a daemon that never probed again.
 *
 * The fixes belong together and are tested together: a tick in flight absorbs
 * the next cadence fire (single flight), and a request that exceeds its bound
 * is a transport event (bounded fetch), so the lane backs off and the next
 * tick proceeds.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ControlPlaneClient,
  Custody,
  GatewayDaemon,
  gatewayPaths,
  generateGatewayKeypair,
  type FetchLike,
  type GatewayPaths,
} from '../packages/gateway-daemon/src/index.js';
import { FileKeychainRunner } from './fake-keychain.js';

/**
 * The client as correction B6 means it to be: constructed with a request
 * bound. Typed this way the probe compiles against the delivered client too —
 * where the third argument is simply ignored, which is the defect, and the
 * assertions below fail rather than hang.
 */
type BoundedClientCtor = new (
  baseUrl: string,
  fetchImpl: FetchLike,
  requestTimeoutMs: number,
) => ControlPlaneClient;
const BoundedClient = ControlPlaneClient as unknown as BoundedClientCtor;

interface TickFixture {
  readonly daemon: GatewayDaemon;
  readonly paths: GatewayPaths;
  /** Resolves when the hung fetch is released, and how many calls were made. */
  readonly calls: () => number;
  readonly release: (response: Response) => void;
  readonly cleanup: () => void;
}

/**
 * A daemon whose ONLY network dependency is a fetch that counts its calls and
 * hangs until the test releases it.
 */
function hungDaemon(clock: { wallNow(): number; monotonicNow(): number }): TickFixture {
  let calls = 0;
  let release!: (response: Response) => void;
  const gate = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const fetchImpl: FetchLike = () => {
    calls += 1;
    return gate;
  };

  const root = mkdtempSync(join(tmpdir(), 'buildroom-tick-'));
  const paths = gatewayPaths(join(root, 'gateway'));
  const client = new ControlPlaneClient('http://control-plane.invalid', fetchImpl);

  const daemon = new GatewayDaemon({
    paths,
    clock,
    custody: new Custody(new FileKeychainRunner(join(root, 'keychain'))),
    client,
    heartbeatCadenceMs: 10_000,
  });

  const keypair = generateGatewayKeypair();
  daemon.primary.adopt({
    gatewayId: '11111111-2222-4333-8444-555555555555',
    keyId: keypair.keyId,
    pubkeyBase64: keypair.pubkeyBase64,
    privateKey: keypair.privateKey,
  });

  return { daemon, paths, calls: () => calls, release, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('gateway-daemon · one tick in flight at a time', () => {
  it('a cadence fire while a tick waits absorbs into the in-flight tick', async () => {
    let mono = 1_000;
    const f = hungDaemon({ wallNow: () => Date.now(), monotonicNow: () => mono });

    try {
      const first = f.daemon.tick();
      // The interval fires again while the first tick is still waiting on the
      // network — exactly what a slow control plane produces.
      mono += 10_000;
      const second = f.daemon.tick();

      assert.equal(f.calls(), 1, 'no second network attempt is stacked behind the first');
      assert.equal(first, second, 'the second fire joins the first tick rather than starting one');

      f.release(new Response(JSON.stringify({ error: 'not_leader' }), { status: 503 }));
      await first;
      await second;
      assert.equal(f.calls(), 1, 'and releasing the hang settles both fires');
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-daemon · a request has a bound', () => {
  it('a control plane that never answers is a transport event, not a hang', async () => {
    const slow: FetchLike = () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })), 1_500);
      });
    const client = new BoundedClient('http://control-plane.invalid', slow, 50);

    const startedAt = Date.now();
    const response = await client.challenge();
    const elapsed = Date.now() - startedAt;

    assert.equal(response.transport, true, 'the bound, not the server, ends the wait');
    assert.ok(elapsed < 1_000, `the wait was bounded (${elapsed}ms)`);
  });

  it('after the bound trips, backoff gates the next attempt and the tick proceeds', async () => {
    let mono = 1_000;
    let calls = 0;
    const slow: FetchLike = () => {
      calls += 1;
      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })), 1_500);
      });
    };

    const root = mkdtempSync(join(tmpdir(), 'buildroom-tick-'));
    try {
      const paths = gatewayPaths(join(root, 'gateway'));
      const client = new BoundedClient('http://control-plane.invalid', slow, 50);
      const daemon = new GatewayDaemon({
        paths,
        clock: { wallNow: () => Date.now(), monotonicNow: () => mono },
        custody: new Custody(new FileKeychainRunner(join(root, 'keychain'))),
        client,
        heartbeatCadenceMs: 10_000,
      });
      const keypair = generateGatewayKeypair();
      daemon.primary.adopt({
        gatewayId: '11111111-2222-4333-8444-555555555555',
        keyId: keypair.keyId,
        pubkeyBase64: keypair.pubkeyBase64,
        privateKey: keypair.privateKey,
      });

      // The bound trips: transport, lane in TRANSPORT_RETRY with backoff.
      await daemon.tick();
      assert.equal(calls, 1);
      assert.equal(daemon.primary.laneState, 'TRANSPORT_RETRY');

      // Inside the backoff window a tick does nothing at all.
      mono += 1_000;
      await daemon.tick();
      assert.equal(calls, 1, 'backoff gates the retry');

      // Past the window the next tick proceeds — the daemon did not hang.
      mono += 10_000;
      await daemon.tick();
      assert.equal(calls, 2, 'the daemon retries after the bound and the backoff');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
