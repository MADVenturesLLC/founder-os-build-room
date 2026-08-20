/**
 * §14/§15 (correction B5, Rev 4.7 tester) — staging retry and durable-state
 * transitions.
 *
 * The delivered implementation had three gaps in one theme:
 *
 *   1. `probe()` was reachable only from `AWAITING`, while a transport failure
 *      moves the lane to `TRANSPORT_RETRY` — so one transport failure made
 *      every later probe a no-op, forever.
 *   2. A redeem transport failure was persisted as `TRANSPORT_RETRY` with the
 *      message "the daemon will retry" — but the pairing code was gone, and
 *      `tick()` had no redeem-retry path. The claim was not executable by
 *      anything.
 *   3. A terminal probe refusal deleted staging custody and changed only
 *      in-memory state; `state.json` still said `AWAITING`, so after a restart
 *      the enrolment guard was permanently blocked by stale persisted state.
 *
 * The corrections: a lane in `TRANSPORT_RETRY` probes again after its backoff;
 * the redeem retry executes inside the `enroll` process — the one place the
 * code exists — bounded by the 24 h horizon; every staging transition persists
 * at its recoverable boundary (verdict first, custody mutation second,
 * completion third), and boot completes any interrupted boundary.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KEYCHAIN_SERVICE,
  ControlPlaneClient,
  Custody,
  GatewayDaemon,
  GatewayStateStore,
  StagingLane,
  emptyState,
  gatewayPaths,
  generateGatewayKeypair,
  type FetchLike,
  type GatewayIdentity,
  type GatewayPaths,
  type GatewayState,
} from '../packages/gateway-daemon/src/index.js';
import type { Clock } from '../packages/gateway-protocol/src/index.js';
import { runEnroll } from '../packages/gateway-cli/src/index.js';
import { FileKeychainRunner } from './fake-keychain.js';

const GATEWAY_ID = '11111111-2222-4333-8444-555555555555';
const HEX64 = 'ab'.repeat(32);
const WALL = Date.parse('2026-08-19T12:00:00Z');

const CHALLENGE_BODY = {
  generation: 4,
  challenge: HEX64,
  issuedAt: new Date(WALL - 60_000).toISOString(),
};

const ACCEPTED_BODY = {
  gatewayId: GATEWAY_ID,
  keyId: HEX64,
  fingerprint: HEX64,
  awaitingApprovalExpiresAt: new Date(WALL + 3_600_000).toISOString(),
};

/** A clock whose monotonic source the test advances by hand. */
function scriptClock(startMono = 1_000): { clock: Clock; advance: (ms: number) => void } {
  let mono = startMono;
  return {
    clock: { wallNow: () => WALL, monotonicNow: () => mono },
    advance: (ms: number) => {
      mono += ms;
    },
  };
}

type Step = () => Promise<Response>;

const ok = (status: number, body: unknown): Step => () =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const down: Step = () => Promise.reject(new Error('connection refused'));

/**
 * A fetch that plays the given steps in order, repeating the last one. Every
 * request body is recorded so idempotency stability is checkable.
 */
function scriptedFetch(...steps: readonly Step[]): FetchLike & {
  calls: () => number;
  bodies: () => string[];
} {
  let index = 0;
  let calls = 0;
  const bodies: string[] = [];
  const fetch: FetchLike = (url, init) => {
    calls += 1;
    if (init?.body !== undefined) bodies.push(String(init.body));
    const step = steps[Math.min(index, steps.length - 1)] ?? down;
    index += 1;
    return step();
  };
  return Object.assign(fetch, { calls: () => calls, bodies: () => bodies });
}

function stagingIdentity(gatewayId: string = GATEWAY_ID): { identity: GatewayIdentity; secret: string } {
  const keypair = generateGatewayKeypair();
  return {
    identity: {
      gatewayId,
      keyId: keypair.keyId,
      pubkeyBase64: keypair.pubkeyBase64,
      privateKey: keypair.privateKey,
    },
    secret: keypair.privateKeySecret,
  };
}

const HOST = { hostname: 'example-host.test', os: 'darwin', arch: 'arm64' };
const CODE = 'ZmFrZS1jb2RlLWZvci10ZXN0aW5nLW9ubHktbm90LXJlYWw';

describe('gateway-staging · a transport-retry lane keeps probing', () => {
  it('probe:a-transport-failure-is-retried-after-backoff-and-the-lane-recovers', async () => {
    const { clock, advance } = scriptClock();
    const keypair = generateGatewayKeypair();
    const fetch = scriptedFetch(
      ok(202, ACCEPTED_BODY), // redeem → AWAITING
      down, // probe 1: the challenge itself does not arrive
      ok(200, CHALLENGE_BODY), // probe 2: fresh challenge
      ok(403, { error: 'awaiting_approval' }), // probe 2: still awaiting
    );
    const lane = new StagingLane(new ControlPlaneClient('http://cp.invalid', fetch), clock);
    lane.adopt(stagingIdentity().identity);

    const redeemed = await lane.redeem({
      code: CODE,
      pubkeyBase64: keypair.pubkeyBase64,
      hostDescriptor: HOST,
    });
    assert.equal(redeemed.state, 'AWAITING');

    const first = await lane.probe();
    assert.equal(first.disposition, 'transport');
    assert.equal(lane.laneState, 'TRANSPORT_RETRY');

    advance(6_000); // past the 5 s floor backoff

    const second = await lane.probe();
    assert.equal(second.disposition, 'retain_and_continue', 'a probe happens after the backoff, not never');
    assert.equal(lane.laneState, 'AWAITING', 'a successful probe returns the lane to AWAITING');
    assert.ok(fetch.calls() > 2, 'the retry made network calls the delivered code never made');
  });
});

describe('gateway-cli · a redeem retry is executable where the code is', () => {
  interface CliFixture {
    readonly paths: GatewayPaths;
    readonly custody: Custody;
    readonly state: GatewayStateStore;
    readonly cleanup: () => void;
  }

  function cliFixture(): CliFixture {
    const root = mkdtempSync(join(tmpdir(), 'buildroom-b5-cli-'));
    const paths = gatewayPaths(join(root, 'gateway'));
    const custody = new Custody(new FileKeychainRunner(join(root, 'keychain')));
    return {
      paths,
      custody,
      state: new GatewayStateStore(paths),
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
  }

  async function enrollWith(
    f: CliFixture,
    fetch: FetchLike,
    clock: Clock,
    sleep: (ms: number) => Promise<void>,
  ) {
    const deps = {
      paths: f.paths,
      custody: f.custody,
      client: new ControlPlaneClient('http://cp.invalid', fetch),
      clock,
      state: f.state,
      readCode: async () => CODE,
      hostDescriptor: HOST,
      print: () => undefined,
      sleep,
    };
    return runEnroll(deps);
  }

  it('redeem:a-transport-failure-is-retried-with-the-same-idempotency-key-and-completes', async () => {
    const f = cliFixture();
    const { clock, advance } = scriptClock();
    const fetch = scriptedFetch(
      down, // attempt 1: transport
      ok(202, ACCEPTED_BODY), // attempt 2: accepted
    );
    try {
      const result = await enrollWith(f, fetch, clock, async (ms) => {
        advance(ms);
      });

      assert.equal(result.ok, true, 'the retry completed the redemption the first attempt lost');
      const state = await f.state.read();
      assert.equal(state.staging.lane, 'AWAITING');
      assert.equal(state.staging.identity.gatewayId, GATEWAY_ID);
      const enrollBodies = fetch.bodies();
      assert.equal(enrollBodies.length, 2, 'exactly two redemption attempts');
      const keys = enrollBodies.map((body) => (JSON.parse(body) as Record<string, unknown>)['idempotencyKey']);
      assert.equal(keys[0], keys[1], 'the retry reused the idempotency key, so it stayed a retry');
    } finally {
      f.cleanup();
    }
  });

  it('redeem:a-redeem-that-never-completes-stops-at-the-horizon-and-says-so-honestly', async () => {
    const f = cliFixture();
    const { clock, advance } = scriptClock();
    const fetch = scriptedFetch(down); // every attempt fails
    try {
      const result = await enrollWith(f, fetch, clock, async (ms) => {
        advance(Math.max(ms, 3_600_000)); // each wait jumps an hour: the horizon arrives fast
      });

      assert.equal(result.ok, false, 'the horizon must end the enrolment');
      // (correction 5, M6) `assert.equal` proves the failed arm but does not
      // narrow the union; this guard does, and cannot pass silently — it fails
      // outright on the arm the assertion above already excluded.
      if (result.ok) assert.fail('unreachable: the ok arm was excluded above');

      assert.equal(result.code, 'redeem_horizon_elapsed');
      assert.ok(
        !result.message.includes('daemon will retry'),
        'the message may not claim a retry nothing will execute',
      );

      const state = await f.state.read();
      assert.equal(state.staging.lane, 'TRANSPORT_RETRY');
      assert.ok(state.staging.redeemStartedAt !== null, 'doctor can show retrying-since');
      assert.ok(
        (await f.custody.read('staging')) !== null,
        'a transport failure never deletes staging custody',
      );
    } finally {
      f.cleanup();
    }
  });

  it('redeem:a-structured-refusal-arriving-mid-retry-is-terminal', async () => {
    const f = cliFixture();
    const { clock, advance } = scriptClock();
    const fetch = scriptedFetch(
      down, // attempt 1: transport
      ok(409, { error: 'unknown_code' }), // attempt 2: refusal
    );
    try {
      const result = await enrollWith(f, fetch, clock, async (ms) => {
        advance(ms);
      });

      assert.equal(result.ok, false, 'a structured refusal is terminal');
      // (correction 5, M6) Same narrowing guard as the horizon case above.
      if (result.ok) assert.fail('unreachable: the ok arm was excluded above');

      assert.equal(result.code, 'redeem_refused');
      assert.equal(await f.custody.read('staging'), null, 'a terminal refusal deletes staging custody');
      assert.equal((await f.state.read()).staging.lane, 'INACTIVE');
    } finally {
      f.cleanup();
    }
  });

  it('redeem:pending-redeem-metadata-never-fabricates-a-fingerprint', async () => {
    const f = cliFixture();
    const { clock, advance } = scriptClock();
    const fetch = scriptedFetch(down); // the network never comes up
    try {
      const result = await enrollWith(f, fetch, clock, async (ms) => {
        advance(Math.max(ms, 3_600_000)); // each wait jumps an hour: the horizon arrives fast
      });
      assert.equal(result.ok, false);

      const state = await f.state.read();
      assert.equal(
        state.staging.identity.fingerprint,
        null,
        'the fingerprint is derived by the server at redemption; no local stand-in exists',
      );
      assert.ok(state.staging.identity.keyId !== null, 'the local key id is still recorded');
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-daemon · lane transitions persist at their recoverable boundary', () => {
  interface DaemonFixture {
    readonly paths: GatewayPaths;
    readonly runner: FileKeychainRunner;
    readonly custody: Custody;
    readonly state: GatewayStateStore;
    readonly cleanup: () => void;
  }

  function daemonFixture(): DaemonFixture {
    const root = mkdtempSync(join(tmpdir(), 'buildroom-b5-'));
    const paths = gatewayPaths(join(root, 'gateway'));
    const runner = new FileKeychainRunner(join(root, 'keychain'));
    return {
      paths,
      runner,
      custody: new Custody(runner),
      state: new GatewayStateStore(paths),
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
  }

  function daemonOf(f: DaemonFixture, fetch: FetchLike, clock: Clock): GatewayDaemon {
    return new GatewayDaemon({
      paths: f.paths,
      clock,
      custody: f.custody,
      client: new ControlPlaneClient('http://cp.invalid', fetch),
      heartbeatCadenceMs: 10_000,
    });
  }

  /** Plant durable state and custody exactly as a crash would have left them. */
  async function plant(
    f: DaemonFixture,
    options: {
      lane: GatewayState['staging']['lane'];
      identity: GatewayIdentity;
      stagingSecret?: string;
      primarySecret?: string;
    },
  ): Promise<void> {
    await f.state.write({
      ...emptyState(),
      staging: {
        lane: options.lane,
        identity: {
          gatewayId: options.identity.gatewayId,
          keyId: options.identity.keyId,
          fingerprint: options.identity.keyId,
        },
        idempotencyKey: '11111111-2222-4333-8444-555555555556',
        redeemStartedAt: new Date(WALL).toISOString(),
        lastServerState: null,
        lastObservedAt: null,
      },
    });
    if (options.stagingSecret !== undefined) await f.custody.createStaging(options.stagingSecret);
    if (options.primarySecret !== undefined) {
      await f.runner.run(
        ['add-generic-password', '-U', '-a', 'primary', '-s', KEYCHAIN_SERVICE, '-w'],
        `${options.primarySecret}\n${options.primarySecret}\n`,
      );
    }
  }

  it('daemon:a-terminal-probe-refusal-is-persisted-before-custody-deletion', async () => {
    const f = daemonFixture();
    const { clock } = scriptClock();
    const fetch = scriptedFetch(
      ok(200, CHALLENGE_BODY),
      ok(403, { error: 'denied' }),
    );
    try {
      const { identity, secret } = stagingIdentity();
      await plant(f, { lane: 'AWAITING', identity, stagingSecret: secret });
      const daemon = daemonOf(f, fetch, clock);
      await daemon.boot();
      await daemon.tick();
      await daemon.stop();

      const state = await f.state.read();
      assert.equal(state.staging.lane, 'INACTIVE', 'the terminal refusal reached state.json');
      assert.equal(state.lastRejection?.code, '403 denied', 'the refusal is doctor-visible evidence');
      assert.equal(await f.custody.read('staging'), null, 'custody was deleted');
    } finally {
      f.cleanup();
    }
  });

  it('daemon:restart-completes-a-terminal-deletion-interrupted-before-the-custody-delete', async () => {
    const f = daemonFixture();
    const { clock } = scriptClock();
    try {
      const { identity, secret } = stagingIdentity();
      // Crashed after the REFUSED verdict was persisted, before custody deletion.
      await plant(f, { lane: 'REFUSED', identity, stagingSecret: secret });
      const daemon = daemonOf(f, scriptedFetch(down), clock);
      await daemon.boot();
      await daemon.stop();

      assert.equal(await f.custody.read('staging'), null, 'boot finished the interrupted deletion');
      assert.equal((await f.state.read()).staging.lane, 'INACTIVE');
    } finally {
      f.cleanup();
    }
  });

  it('daemon:restart-completes-a-terminal-deletion-interrupted-after-the-custody-delete', async () => {
    const f = daemonFixture();
    const { clock } = scriptClock();
    try {
      const { identity } = stagingIdentity();
      // Crashed after custody deletion, before the INACTIVE publication.
      await plant(f, { lane: 'REFUSED', identity });
      const daemon = daemonOf(f, scriptedFetch(down), clock);
      await daemon.boot();
      await daemon.stop();

      assert.equal((await f.state.read()).staging.lane, 'INACTIVE', 'boot published the completion');
    } finally {
      f.cleanup();
    }
  });

  it('daemon:restart-retries-an-interrupted-promotion-from-staging', async () => {
    const f = daemonFixture();
    const { clock } = scriptClock();
    try {
      const { identity, secret } = stagingIdentity();
      // Crashed after the PROMOTED verdict, with staging custody still intact.
      await plant(f, { lane: 'PROMOTED', identity, stagingSecret: secret });
      const daemon = daemonOf(f, scriptedFetch(down), clock);
      await daemon.boot();
      await daemon.stop();

      assert.equal(await f.custody.read('primary'), secret, 'the staging key was promoted into primary custody');
      assert.equal(await f.custody.read('staging'), null);
      const state = await f.state.read();
      assert.equal(state.primary.identity.keyId, identity.keyId);
      assert.equal(state.staging.lane, 'INACTIVE');
    } finally {
      f.cleanup();
    }
  });

  it('daemon:restart-completes-a-promotion-interrupted-after-the-custody-write', async () => {
    const f = daemonFixture();
    const { clock } = scriptClock();
    try {
      const { identity, secret } = stagingIdentity();
      // Crashed after custody promotion, before the durable state publication.
      await plant(f, { lane: 'PROMOTED', identity, primarySecret: secret });
      const daemon = daemonOf(f, scriptedFetch(down), clock);
      await daemon.boot();
      await daemon.stop();

      const state = await f.state.read();
      assert.equal(state.primary.identity.keyId, identity.keyId, 'the promoted identity is the persisted primary');
      assert.equal(state.primary.lastServerState, 'enrolled');
      assert.equal(state.staging.lane, 'INACTIVE');
      assert.equal(await f.custody.read('staging'), null);
    } finally {
      f.cleanup();
    }
  });

  it('daemon:a-probe-transport-failure-persists-and-the-retry-survives-a-restart', async () => {
    const f = daemonFixture();
    const script = scriptClock();
    try {
      const { identity, secret } = stagingIdentity();
      await plant(f, { lane: 'AWAITING', identity, stagingSecret: secret });

      // Process A: one probe, and the network is down.
      const a = daemonOf(f, scriptedFetch(down), script.clock);
      await a.boot();
      await a.tick();
      await a.stop();
      assert.equal(
        (await f.state.read()).staging.lane,
        'TRANSPORT_RETRY',
        'the transport failure reached state.json, not just memory',
      );

      // Process B: a restart on the same paths, past the backoff.
      script.advance(6_000);
      const b = daemonOf(
        f,
        scriptedFetch(ok(200, CHALLENGE_BODY), ok(403, { error: 'awaiting_approval' })),
        script.clock,
      );
      await b.boot();
      await b.tick();
      await b.stop();

      const state = await f.state.read();
      assert.equal(state.staging.lane, 'AWAITING', 'the restarted daemon probed again');
      assert.equal(state.staging.lastServerState, '403 awaiting_approval');
    } finally {
      f.cleanup();
    }
  });
});
