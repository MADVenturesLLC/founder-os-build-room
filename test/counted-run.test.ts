/**
 * The counted-run routes, unit level (plan r1 run-unit Q9): inert unless the
 * Founder's counted-run act is configured, behind the counted-run token and
 * no other (the Founder's §9 answer), and
 * refusing to start a round without the deployment id T2 names or the
 * registry entry T2's surface needs. The terms themselves are checked at
 * boot against the pinned seat lanes. A round over real stores and a real
 * Gateway is `test/phase4-run-harness.storage.test.ts`'s.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { createServer } from '../packages/control-plane/src/server.js';
import { createGatewaySurface, type GatewaySurface } from '../packages/control-plane/src/gateway/index.js';
import type { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import { ConfigError, loadConfig } from '../packages/control-plane/src/config.js';
import { CountedRunConfigError, parseCountedRunConfig, plannerLaneLabel } from '../packages/control-plane/src/counted-run-config.js';
import { countedRunCompletionResolver, vendoredRegisteredSurfaces } from '../packages/control-plane/src/counted-run.js';
import { closeServer } from './support/close-server.js';

const TOKEN = 'test-token-that-is-long-enough-to-pass';
const ADJUDICATION = 'adjudication-token-that-is-long-enough';
const COUNTED = 'counted-run-token-that-is-long-enough';
const ROOM = '11111111-2222-4333-8444-555555555555';
const ACT = {
  actId: 'FOUNDER-ACT-EXAMPLE-PHASE4-COUNTED-RUNS',
  gatewayId: '1880c12d-0000-4000-8000-000000000001',
  planner: { provider: 'google', model: 'gemini-3.1-pro' },
  seats: { builder: 'gpt-5.6-sol', reviewer: 'grok-4.5' },
};
const BASE_ENV = {
  DATABASE_URL: 'postgresql://user:secret@host.neon.tech/db?sslmode=require',
  CONTROL_PLANE_TOKEN: TOKEN,
  COMMIT_SHA: 'deadbeef',
};

function fakeLeaderPool(): Pool {
  let ownerId: string | null = null;
  const challenge = 'a'.repeat(64);
  const answer = async (sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> => {
    if (/UPDATE control_plane_lease\s+SET owner_id = \$1, generation/.test(sql)) {
      ownerId = String(params[0]);
      return { rows: [{ generation: '1', challenge: String(params[1]) }], rowCount: 1 };
    }
    if (/FROM control_plane_lease WHERE id = 1 FOR UPDATE/.test(sql)) {
      return {
        rows: [{ id: 1, owner_id: ownerId, generation: '1', heartbeat_at: new Date(), challenge, challenge_published_at: new Date() }],
        rowCount: 1,
      };
    }
    if (/SELECT now\(\)/.test(sql)) return { rows: [{ now: new Date() }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const client = { query: (sql: string, params?: unknown[]) => answer(sql, params), release: () => undefined };
  return { query: (sql: string, params?: unknown[]) => answer(sql, params), connect: async () => client, on: () => undefined, end: async () => undefined } as unknown as Pool;
}

/** A ledger store no refused request may reach. */
const explodingLedgerStore = new Proxy({}, {
  get: () => () => {
    throw new Error('a refused counted-run request reached the ledger store');
  },
}) as unknown as PostgresLedgerStore;

const openServers: Server[] = [];
const openGateways: GatewaySurface[] = [];

async function start(env: Record<string, string>, surfaces?: ReadonlySet<string>): Promise<string> {
  const config = loadConfig({ ...BASE_ENV, ...env });
  const gateway = createGatewaySurface({ pool: fakeLeaderPool(), config, log: () => undefined });
  openGateways.push(gateway);
  const app = createServer({
    config,
    pool: { query: async () => ({ rows: [] }) } as unknown as Pool,
    store: explodingLedgerStore,
    startedAt: Date.now(),
    gateway,
    ...(surfaces === undefined ? {} : { countedRunSurfaces: () => surfaces }),
  });
  const server = app.listen(0, '127.0.0.1');
  openServers.push(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  await gateway.leadership.attemptAcquisition();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

after(async () => {
  await Promise.all(openGateways.map((gateway) => gateway.stop()));
  await Promise.all(openServers.map((server) => closeServer(server)));
});

async function call(url: string, method: 'GET' | 'POST', path: string, token: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers['authorization'] = `Bearer ${token}`;
  const response = await fetch(`${url}${path}`, { method, headers, ...(method === 'POST' ? { body: '{}' } : {}) });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const PATHS: ['GET' | 'POST', string][] = [
  ['POST', `/control-plane/rooms/${ROOM}/planner-round`],
  ['GET', `/control-plane/rooms/${ROOM}/planner-round`],
  ['GET', `/control-plane/rooms/${ROOM}/journal`],
];

describe('counted run · the act’s terms, read at boot', () => {
  it('is null when PHASE4_COUNTED_RUN is absent or empty', () => {
    assert.equal(parseCountedRunConfig(undefined), null);
    assert.equal(parseCountedRunConfig('  '), null);
    assert.equal(loadConfig(BASE_ENV).countedRun, null);
  });

  it('reads well-formed terms on approved lanes, and names the Planner’s lane', () => {
    const config = parseCountedRunConfig(JSON.stringify(ACT))!;
    assert.deepEqual(config, ACT);
    assert.equal(plannerLaneLabel(config), 'primary');
  });

  const refusals: [string, unknown, RegExp][] = [
    ['not JSON', '{', /not JSON/],
    ['an extra field', { ...ACT, note: 'x' }, /exactly/],
    ['a non-UUID Gateway', { ...ACT, gatewayId: '1880c12d' }, /gatewayId/],
    ['a Planner off the architect seat’s Antigravity lane', { ...ACT, planner: { provider: 'anthropic', model: 'opus-4.7' } }, /Antigravity lane/],
    ['a builder off the builder lanes', { ...ACT, seats: { builder: 'gpt-5.6-luna', reviewer: 'grok-4.5' } }, /builder model/],
    ['a reviewer off the reviewer lanes', { ...ACT, seats: { builder: 'gpt-5.6-sol', reviewer: 'opus-4.7' } }, /reviewer model/],
    ['a reviewer on the builder’s model', { ...ACT, seats: { builder: 'grok-4.5', reviewer: 'grok-4.5' } }, /different model/],
  ];
  for (const [name, value, message] of refusals) {
    it(`refuses ${name}, and the boot with it`, () => {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      assert.throws(() => parseCountedRunConfig(raw), (error: unknown) => error instanceof CountedRunConfigError && message.test(error.message));
      assert.throws(() => loadConfig({ ...BASE_ENV, PHASE4_COUNTED_RUN: raw }), ConfigError);
    });
  }

  it('reads the counted-run token, distinct from both other tokens, and none as null', () => {
    assert.equal(loadConfig(BASE_ENV).countedRunToken, null);
    assert.equal(loadConfig({ ...BASE_ENV, PHASE4_COUNTED_RUN_TOKEN: ` ${COUNTED} ` }).countedRunToken, COUNTED);
    for (const value of ['short', TOKEN, ADJUDICATION]) {
      assert.throws(
        () => loadConfig({ ...BASE_ENV, PHASE3_ADJUDICATION_TOKEN: ADJUDICATION, PHASE4_COUNTED_RUN_TOKEN: value }),
        (error: unknown) => error instanceof ConfigError && !error.message.includes(value),
        value === 'short' ? 'too short' : 'equal to another token',
      );
    }
  });

  it('reads the deployment id the platform gives, and none as null', () => {
    assert.equal(loadConfig({ ...BASE_ENV, RAILWAY_DEPLOYMENT_ID: 'dep-1' }).deploymentId, 'dep-1');
    assert.equal(loadConfig(BASE_ENV).deploymentId, null);
  });

  it('covers a completion only under the act, on the act’s route, intended and observed', async () => {
    const resolve = countedRunCompletionResolver(ACT);
    const route = { provider: 'google', model: 'gemini-3.1-pro', executionSurface: 'antigravity' };
    const query = { commandId: 'cmd_x', authorizationRef: ACT.actId, repository: 'o/r', scopeRef: 's', intended: route, observed: route };
    assert.equal(await resolve(query), 'covers');
    assert.equal(await resolve({ ...query, authorizationRef: 'other' }), 'does_not_cover');
    assert.equal(await resolve({ ...query, observed: { ...route, model: 'gemini-3.6-flash' } }), 'does_not_cover');
    assert.equal(await resolve({ ...query, intended: { ...route, executionSurface: 'claude-code' } }), 'does_not_cover');
  });

  it('reads the vendored registry, which does not yet carry the control plane’s surface', () => {
    const ids = vendoredRegisteredSurfaces();
    assert.ok(ids.has('build-room-gateway'), 'the vendored registry was read');
    assert.equal(ids.has('build-room-control-plane'), false);
  });
});

describe('counted run · the routes are inert until configured', () => {
  it('answers 503 counted_run_not_configured on every route when no act is configured', async () => {
    const url = await start({ PHASE4_COUNTED_RUN_TOKEN: COUNTED });
    for (const [method, path] of PATHS) {
      const res = await call(url, method, path, COUNTED);
      assert.deepEqual([res.status, res.body['error']], [503, 'counted_run_not_configured'], `${method} ${path}`);
    }
  });

  it('answers 503 counted_run_disabled with no counted-run token configured, the adjudication token notwithstanding', async () => {
    const off = await start({ PHASE4_COUNTED_RUN: JSON.stringify(ACT), RAILWAY_DEPLOYMENT_ID: 'dep-1', PHASE3_ADJUDICATION_TOKEN: ADJUDICATION });
    for (const [method, path] of PATHS) {
      const res = await call(off, method, path, ADJUDICATION);
      assert.deepEqual([res.status, res.body['error']], [503, 'counted_run_disabled'], `${method} ${path}`);
    }
  });

  it('opens only to the counted-run token: the API and adjudication tokens are 401, and it opens no plan decision', async () => {
    const on = await start({
      PHASE4_COUNTED_RUN: JSON.stringify(ACT),
      RAILWAY_DEPLOYMENT_ID: 'dep-1',
      PHASE3_ADJUDICATION_TOKEN: ADJUDICATION,
      PHASE4_COUNTED_RUN_TOKEN: COUNTED,
    });
    for (const [method, path] of PATHS) {
      for (const token of [TOKEN, ADJUDICATION, null]) assert.equal((await call(on, method, path, token)).status, 401, `${method} ${path}`);
    }
    assert.equal((await call(on, 'GET', PATHS[1]![1], COUNTED)).status, 200);
    // The Founder's route: the counted-run token cannot decide a plan.
    const decision = await call(on, 'POST', `/control-plane/rooms/${ROOM}/plan-decision`, COUNTED);
    assert.equal(decision.status, 401);
  });

  it('refuses to start a round without the deployment id, or while the registry lacks the surface', async () => {
    const act = JSON.stringify(ACT);
    const noDeployment = await start({ PHASE4_COUNTED_RUN: act, PHASE4_COUNTED_RUN_TOKEN: COUNTED }, new Set(['build-room-control-plane']));
    const a = await call(noDeployment, 'POST', `/control-plane/rooms/${ROOM}/planner-round`, COUNTED);
    assert.deepEqual([a.status, a.body['error']], [503, 'deployment_id_unknown']);

    const unregistered = await start({ PHASE4_COUNTED_RUN: act, PHASE4_COUNTED_RUN_TOKEN: COUNTED, RAILWAY_DEPLOYMENT_ID: 'dep-1' });
    const b = await call(unregistered, 'POST', `/control-plane/rooms/${ROOM}/planner-round`, COUNTED);
    assert.deepEqual([b.status, b.body['error']], [503, 'dispatcher_surface_unregistered']);
  });

  it('reports the round’s state, the act and the Gateway without touching the ledger', async () => {
    const url = await start({ PHASE4_COUNTED_RUN: JSON.stringify(ACT), PHASE4_COUNTED_RUN_TOKEN: COUNTED, RAILWAY_DEPLOYMENT_ID: 'dep-1' });
    const res = await call(url, 'GET', `/control-plane/rooms/${ROOM}/planner-round`, COUNTED);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      roomId: ROOM,
      actId: ACT.actId,
      deploymentId: 'dep-1',
      gateway: { id: ACT.gatewayId, online: false },
      dispatcherSurfaceRegistered: false,
      round: { status: 'idle' },
    });
    const bad = await call(url, 'GET', '/control-plane/rooms/not-a-room/planner-round', COUNTED);
    assert.equal(bad.status, 400);
  });
});
