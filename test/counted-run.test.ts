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
import { CountedRunConfigError, parseCountedRunConfig, parseLaneToken, plannerLaneLabel } from '../packages/control-plane/src/counted-run-config.js';
import { RATIFIED_SEATS, type SeatRegistrationV1, type SeatRoutingLane, type SurfaceProviderLane } from '../packages/seat-registry/src/index.js';
import { COUNTED_RUN_REGISTRY, countedRunCompletionResolver, pinnedRegisteredSurfaces, vendoredRegisteredSurfaces } from '../packages/control-plane/src/counted-run.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeServer } from './support/close-server.js';

const TOKEN = 'test-token-that-is-long-enough-to-pass';
const ADJUDICATION = 'adjudication-token-that-is-long-enough';
const COUNTED = 'counted-run-token-that-is-long-enough';
const ROOM = '11111111-2222-4333-8444-555555555555';
/** The act's terms name surfaces only (BR-PHASE4-SURFACE-KEYED-SEATS-R1): no provider, no model. */
const ACT = {
  actId: 'FOUNDER-ACT-EXAMPLE-PHASE4-COUNTED-RUNS',
  gatewayId: '1880c12d-0000-4000-8000-000000000001',
  planner: 'antigravity',
  seats: { builder: 'codex', reviewer: 'grok-build' },
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
    // The act's terms are the surfaces; the parsed planner carries the approved
    // lane's provider and model as routing detail (google/gemini-4-argon, the
    // architect seat's one Antigravity lane since DEC-20261019-01 Clause A).
    assert.deepEqual(config, {
      actId: ACT.actId,
      gatewayId: ACT.gatewayId,
      planner: { surface: 'antigravity', provider: 'google', model: 'gemini-4-argon' },
      // Bare surfaces each resolve to their seat's one provider on that surface.
      seats: { builder: { surface: 'codex', provider: 'openai' }, reviewer: { surface: 'grok-build', provider: 'xai' } },
    });
    assert.equal(plannerLaneLabel(config), 'primary');
  });

  it('refuses the surfaces DEC-20261020-01 clause 2 gives no lane on that seat, and the boot with them', () => {
    // `claude-code` carries no Tier-2 lane, and `grok-build` and
    // `hermes-local-code` carry no builder lane: those lanes are not-approved
    // records now, outside routing.
    const offTable: [unknown, RegExp][] = [
      [{ ...ACT, seats: { builder: 'codex', reviewer: 'claude-code' } }, /reviewer surface/],
      [{ ...ACT, seats: { builder: 'grok-build', reviewer: 'codex' } }, /builder surface/],
      [{ ...ACT, seats: { builder: 'hermes-local-code', reviewer: 'grok-build' } }, /builder surface/],
    ];
    for (const [value, message] of offTable) {
      const raw = JSON.stringify(value);
      assert.throws(() => parseCountedRunConfig(raw), (error: unknown) => error instanceof CountedRunConfigError && message.test(error.message));
      assert.throws(() => loadConfig({ ...BASE_ENV, PHASE4_COUNTED_RUN: raw }), ConfigError);
    }
  });

  it('accepts claude-code as the builder surface, on the claude-code:anthropic lane', () => {
    const config = parseCountedRunConfig(JSON.stringify({ ...ACT, seats: { builder: 'claude-code', reviewer: 'grok-build' } }))!;
    assert.deepEqual(config.seats.builder, { surface: 'claude-code', provider: 'anthropic' });
  });

  it('refuses a planner lane that carries no exact model', () => {
    // The architect's lanes stay model-exact (DEC-20261020-01 clause 1); were
    // one ever a surface:provider lane, the parsed planner could not name its
    // model, so boot refuses it.
    const allowlistPlanner: readonly SeatRegistrationV1[] = RATIFIED_SEATS.map((seat) => {
      if (seat.seat_id !== 'architect') return seat;
      return {
        ...seat,
        routing: seat.routing.map((lane): SeatRoutingLane => {
          if (lane.surface_id !== 'antigravity' || lane.model_id === undefined) return lane;
          const rest: Record<string, unknown> = { ...lane };
          delete rest['model_id'];
          delete rest['tier2_attestation_id'];
          return { ...(rest as Omit<typeof lane, 'model_id' | 'tier2_attestation_id'>), lane: 'antigravity:google', allowlist: ['gemini-4-argon'] };
        }),
      };
    });
    assert.throws(
      () => parseCountedRunConfig(JSON.stringify(ACT), allowlistPlanner),
      (error: unknown) => error instanceof CountedRunConfigError && error.message === 'the planner surface resolves to a lane with no exact model',
    );
  });

  it('refuses a same-family reviewer on another surface (DEC-20261020-01 clause 7), and the boot with it', () => {
    const sameFamily = JSON.stringify({ ...ACT, seats: { builder: 'claude-code', reviewer: 'antigravity:anthropic' } });
    assert.throws(
      () => parseCountedRunConfig(sameFamily),
      (error: unknown) => error instanceof CountedRunConfigError && error.message === 'the reviewer provider must differ from the builder provider',
    );
    assert.throws(() => loadConfig({ ...BASE_ENV, PHASE4_COUNTED_RUN: sameFamily }), ConfigError);
    // The other family on the same reviewer surface is accepted.
    const config = parseCountedRunConfig(JSON.stringify({ ...ACT, seats: { builder: 'claude-code', reviewer: 'antigravity:google' } }))!;
    assert.deepEqual(config.seats, {
      builder: { surface: 'claude-code', provider: 'anthropic' },
      reviewer: { surface: 'antigravity', provider: 'google' },
    });
  });

  it('refuses a bare antigravity reviewer, which now spans two families, and resolves either qualified form', () => {
    // The reviewer seat carries antigravity:google and antigravity:anthropic
    // (DEC-20261020-01 clause 2 table), so `antigravity` alone is ambiguous.
    assert.throws(
      () => parseCountedRunConfig(JSON.stringify({ ...ACT, seats: { builder: 'codex', reviewer: 'antigravity' } })),
      (error: unknown) =>
        error instanceof CountedRunConfigError && /more than one approved lane; name the provider/.test(error.message),
    );
    for (const provider of ['google', 'anthropic']) {
      const config = parseCountedRunConfig(JSON.stringify({ ...ACT, seats: { builder: 'codex', reviewer: `antigravity:${provider}` } }))!;
      assert.deepEqual(config.seats.reviewer, { surface: 'antigravity', provider });
    }
  });

  it('resolves a provider-qualified token to its lane, and keeps the surface and the provider', () => {
    const config = parseCountedRunConfig(
      JSON.stringify({ ...ACT, seats: { builder: 'codex:openai', reviewer: 'grok-build:xai' } }),
    )!;
    assert.deepEqual(config.seats, {
      builder: { surface: 'codex', provider: 'openai' },
      reviewer: { surface: 'grok-build', provider: 'xai' },
    });
  });

  it('gives a qualified and a bare token on the same lane the same parsed seat', () => {
    const bare = parseCountedRunConfig(JSON.stringify({ ...ACT, seats: { builder: 'claude-code', reviewer: 'grok-build' } }))!;
    const qualified = parseCountedRunConfig(JSON.stringify({ ...ACT, seats: { builder: 'claude-code:anthropic', reviewer: 'grok-build:xai' } }))!;
    assert.deepEqual(bare.seats, qualified.seats);
    assert.deepEqual(qualified.seats, {
      builder: { surface: 'claude-code', provider: 'anthropic' },
      reviewer: { surface: 'grok-build', provider: 'xai' },
    });
  });

  it('parses a lane token as surface or surface:provider, and nothing else', () => {
    assert.deepEqual(parseLaneToken('codex'), { surface: 'codex', provider: null });
    assert.deepEqual(parseLaneToken('antigravity:google'), { surface: 'antigravity', provider: 'google' });
    assert.deepEqual(parseLaneToken(' codex : openai '), { surface: 'codex', provider: 'openai' });
    // An empty side, a third part, a character outside the label set, a
    // non-string and an over-long token are each refused at the parser.
    for (const bad of ['codex:', ':openai', 'codex:openai:extra', 'codex::openai', '', ' ', ' : ', 'codex;openai', 'x'.repeat(129), 42, null, undefined]) {
      assert.equal(parseLaneToken(bad), null, JSON.stringify(bad));
    }
  });

  it('accepts a provider-qualified planner on the adapter surface', () => {
    const config = parseCountedRunConfig(JSON.stringify({ ...ACT, planner: 'antigravity:google' }))!;
    assert.deepEqual(config.planner, { surface: 'antigravity', provider: 'google', model: 'gemini-4-argon' });
  });

  it('refuses a bare surface that spans two families, naming the ambiguity', () => {
    // A surface that carries both google and anthropic lanes cannot be named
    // without its provider: boot must refuse rather than take the first lane.
    const twoFamilies: readonly SeatRegistrationV1[] = RATIFIED_SEATS.map((seat) => {
      if (seat.seat_id !== 'builder') return seat;
      const base = seat.routing[0] as SurfaceProviderLane;
      const secondFamily: SeatRoutingLane = {
        ...base,
        lane_label: 'test-second-family',
        lane: 'codex:google',
        surface_id: 'codex',
        provider: 'google',
        allowlist: ['gemini-4-argon'],
      };
      return { ...seat, routing: [...seat.routing, secondFamily] };
    });
    assert.throws(
      () => parseCountedRunConfig(JSON.stringify(ACT), twoFamilies),
      (error: unknown) =>
        error instanceof CountedRunConfigError && /more than one approved lane; name the provider/.test(error.message),
    );
    // The qualified form resolves it, proving the refusal is about ambiguity only.
    assert.ok(parseCountedRunConfig(JSON.stringify({ ...ACT, seats: { builder: 'codex:openai', reviewer: 'grok-build' } }), twoFamilies));
  });

  const refusals: [string, unknown, RegExp][] = [
    ['not JSON', '{', /not JSON/],
    ['an extra field', { ...ACT, note: 'x' }, /exactly/],
    ['a non-UUID Gateway', { ...ACT, gatewayId: '1880c12d' }, /gatewayId/],
    ['a Planner stated as provider and model', { ...ACT, planner: { provider: 'google', model: 'gemini-4-argon' } }, /planner must be exactly a surface/],
    ['a Planner surface with no approved architect lane', { ...ACT, planner: 'gemini-3.6-flash' }, /planner surface/],
    ['a builder model id where a surface belongs', { ...ACT, seats: { builder: 'gpt-5.6-sol', reviewer: 'grok-build' } }, /builder surface/],
    ['a reviewer model id where a surface belongs', { ...ACT, seats: { builder: 'codex', reviewer: 'opus-4.7' } }, /reviewer surface/],
    ['an unknown reviewer surface string', { ...ACT, seats: { builder: 'codex', reviewer: 'not-a-surface' } }, /reviewer surface/],
    ['a reviewer on the builder’s surface', { ...ACT, seats: { builder: 'codex', reviewer: 'codex' } }, /reviewer surface must differ/],
  ];
  for (const [name, value, message] of refusals) {
    it(`refuses ${name}, and the boot with it`, () => {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      assert.throws(() => parseCountedRunConfig(raw), (error: unknown) => error instanceof CountedRunConfigError && message.test(error.message));
      assert.throws(() => loadConfig({ ...BASE_ENV, PHASE4_COUNTED_RUN: raw }), ConfigError);
    });
  }

  it('refuses at boot a planner surface the counted run’s adapter cannot run, naming it exactly', () => {
    // F3 (r1 correction): `claude-code` is an approved architect lane, so it
    // once parsed — but the runtime names only the Antigravity adapter as the
    // planner's execution surface, so such a round was authorized synthetically
    // and failed late. Boot now refuses it with its own honest string.
    const offAdapter = JSON.stringify({ ...ACT, planner: 'claude-code' });
    assert.throws(
      () => parseCountedRunConfig(offAdapter),
      (error: unknown) => error instanceof CountedRunConfigError && error.message === "the planner surface is not the counted run's adapter surface",
    );
    assert.throws(
      () => loadConfig({ ...BASE_ENV, PHASE4_COUNTED_RUN: offAdapter }),
      (error: unknown) => error instanceof ConfigError && error.message === "PHASE4_COUNTED_RUN: the planner surface is not the counted run's adapter surface",
    );
    // The adapter's own surface is the accepted one at boot.
    assert.deepEqual(loadConfig({ ...BASE_ENV, PHASE4_COUNTED_RUN: JSON.stringify(ACT) }).countedRun, parseCountedRunConfig(JSON.stringify(ACT)));
  });

  it('refuses a lane that is not an approved binding, for each of the three seats', () => {
    const rebind = (seatId: string, surface: string): readonly SeatRegistrationV1[] =>
      RATIFIED_SEATS.map((seat) =>
        seat.seat_id === seatId
          ? {
              ...seat,
              routing: seat.routing.map((lane) => (lane.surface_id === surface ? { ...lane, binding_status: 'proposed-binding' as SeatRoutingLane['binding_status'] } : lane)),
            }
          : seat,
      );
    const plannerAct = JSON.stringify(ACT);
    assert.throws(() => parseCountedRunConfig(plannerAct, rebind('architect', 'antigravity')), /planner surface/);
    assert.throws(() => parseCountedRunConfig(plannerAct, rebind('builder', 'codex')), /builder surface/);
    assert.throws(
      () => parseCountedRunConfig(JSON.stringify(ACT), rebind('independent-reviewer', 'grok-build')),
      /reviewer surface/,
    );
  });

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
    const resolve = countedRunCompletionResolver(parseCountedRunConfig(JSON.stringify(ACT))!);
    const route = { provider: 'google', model: 'gemini-4-argon', executionSurface: 'antigravity' };
    const query = { commandId: 'cmd_x', authorizationRef: ACT.actId, repository: 'o/r', scopeRef: 's', intended: route, observed: route };
    assert.equal(await resolve(query), 'covers');
    assert.equal(await resolve({ ...query, authorizationRef: 'other' }), 'does_not_cover');
    assert.equal(await resolve({ ...query, observed: { ...route, model: 'gemini-3.6-flash' } }), 'does_not_cover');
    assert.equal(await resolve({ ...query, intended: { ...route, executionSurface: 'claude-code' } }), 'does_not_cover');
  });

  it('reads the pinned copy at FounderOS 8146435, which carries the control plane’s surface', () => {
    const ids = vendoredRegisteredSurfaces();
    assert.ok(ids.has('build-room-gateway'), 'the pinned copy was read');
    assert.ok(ids.has('build-room-control-plane'), 'DEC-20261015-01 registered it');
  });

  it('holds the pinned copy byte for byte, and reads any other text as declaring nothing', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const text = readFileSync(join(root, COUNTED_RUN_REGISTRY.fixturePath), 'utf8');
    assert.equal(createHash('sha256').update(text, 'utf8').digest('hex'), COUNTED_RUN_REGISTRY.sha256);
    assert.ok(pinnedRegisteredSurfaces(text).has('build-room-control-plane'));
    assert.equal(pinnedRegisteredSurfaces(`${text} `).size, 0, 'one byte appended');
    // The Seat Registry's copy now pins the same doctrine text as this one
    // (8bc4c55 and 8146435 both carry sha256 060a16a4...), so it declares the
    // same surfaces. The appended-byte case above is the zero case.
    const seatRegistryCopy = readFileSync(join(root, 'packages', 'seat-registry', 'fixtures', 'execution-surface-registry.md'), 'utf8');
    assert.equal(createHash('sha256').update(seatRegistryCopy, 'utf8').digest('hex'), COUNTED_RUN_REGISTRY.sha256);
    assert.ok(pinnedRegisteredSurfaces(seatRegistryCopy).has('build-room-control-plane'));
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

    const unregistered = await start({ PHASE4_COUNTED_RUN: act, PHASE4_COUNTED_RUN_TOKEN: COUNTED, RAILWAY_DEPLOYMENT_ID: 'dep-1' }, new Set(['build-room-gateway']));
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
      dispatcherSurfaceRegistered: true,
      round: { status: 'idle' },
    });
    const bad = await call(url, 'GET', '/control-plane/rooms/not-a-room/planner-round', COUNTED);
    assert.equal(bad.status, 400);
  });
});
