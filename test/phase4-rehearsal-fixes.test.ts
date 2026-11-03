/**
 * FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL-FIXES: B1, a read that loses its
 * answer is tried again for up to ten minutes and a write never is, and every
 * request ends within its timeout; B2, the plan under a room's latest T3 is
 * served behind the API token, and the runner saves it at plan_review for the
 * Founder to read. Nothing here contacts a control plane: `fetch` is a fake,
 * the server runs on a loopback port with stand-in stores, and every file is
 * written under a temporary directory.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { createServer } from '../packages/control-plane/src/server.js';
import { createGatewaySurface, type GatewaySurface } from '../packages/control-plane/src/gateway/index.js';
import { loadConfig } from '../packages/control-plane/src/config.js';
import type { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import { PlanStoreUnavailableError, type StoredPlan } from '../packages/control-plane/src/plan-store.js';
import {
  HttpPhase4Driver,
  PHASE4_READ_RETRY_WINDOW_MS,
  Phase4TransportError,
} from '../packages/run-harness/src/phase4/http-driver.js';
import { PHASE4_CLI_EXIT, phase4CountedRunMain } from '../packages/run-harness/src/phase4/cli.js';
import type { Phase4RunSet } from '../packages/run-harness/src/phase4/index.js';
import { closeServer } from './support/close-server.js';

const ORIGIN = 'https://control-plane.example';
const API_TOKEN = 'api-token-0123456789abcdef0123456789abcdef';
const COUNTED_TOKEN = 'counted-token-0123456789abcdef0123456789ab';
const ROOM = '1086e073-e181-49a9-a275-cd1e35541f7c';
const GATEWAY = '1880c12d-d98d-4a91-b25a-23320aa7f58a';
const DEPLOYMENT = 'dep-0001';
const SHA_FOUNDEROS = 'a'.repeat(40);
const SHA_BUILDROOM = 'b'.repeat(40);
const SHA_BASE = 'c'.repeat(40);
const PLAN_HASH = 'f5'.padEnd(64, '0');

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake clock: `sleep` advances `now` and records each wait. */
function clock() {
  const state = { t: Date.parse('2026-11-03T13:00:00Z'), waits: [] as number[] };
  return {
    state,
    now: () => state.t,
    sleep: async (ms: number) => {
      state.waits.push(ms);
      state.t += ms;
    },
  };
}

/** A fetch that answers from a script, one entry per request, then repeats the last. */
function scriptedFetch(script: readonly ('reject' | 'hang' | number)[]) {
  const seen: { method: string; path: string }[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    seen.push({ method: init?.method ?? 'GET', path: url.pathname });
    const step = script[Math.min(seen.length - 1, script.length - 1)]!;
    if (step === 'reject') throw new TypeError('fetch failed');
    if (step === 'hang') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    return json(step, step === 200 ? { snapshot: { state: 'BUILDING' } } : { error: 'x' });
  };
  return { fetch: fake as typeof fetch, seen };
}

function driver(fetchImpl: typeof fetch, c = clock(), lines: string[] = [], requestTimeoutMs?: number) {
  return new HttpPhase4Driver({
    origin: ORIGIN,
    apiToken: API_TOKEN,
    countedRunToken: COUNTED_TOKEN,
    founderOs: { sha: SHA_FOUNDEROS, clean: true },
    executorAvailable: true,
    fetch: fetchImpl,
    now: c.now,
    sleep: c.sleep,
    onRetry: (line) => lines.push(line),
    ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
  });
}

/* ---------------- B1: requests ---------------- */

describe('B1: a read that loses its answer is tried again', () => {
  it('a read whose fetch rejects succeeds on a later try, after 5 s, and prints one line with no token', async () => {
    const c = clock();
    const lines: string[] = [];
    const f = scriptedFetch(['reject', 200]);
    assert.equal(await driver(f.fetch, c, lines).roomState(ROOM), 'BUILDING');
    assert.equal(f.seen.length, 2);
    assert.deepEqual(c.state.waits, [5_000]);
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /^2026-11-03T13:00:00\.000Z GET \/rooms\/1086e073-e181-49a9-a275-cd1e35541f7c: fetch failed; trying again in 5s$/);
    for (const token of [API_TOKEN, COUNTED_TOKEN]) assert.equal(lines.join('\n').includes(token), false);
  });

  it('a read answered 502 and then 504 succeeds on the third try, after 5 s and 10 s', async () => {
    const c = clock();
    const lines: string[] = [];
    const f = scriptedFetch([502, 504, 200]);
    assert.equal(await driver(f.fetch, c, lines).roomState(ROOM), 'BUILDING');
    assert.deepEqual(c.state.waits, [5_000, 10_000]);
    assert.match(lines[0]!, /answered 502; trying again in 5s$/);
    assert.match(lines[1]!, /answered 504; trying again in 10s$/);
  });

  it('a read that never answers fails at the timeout and is tried again', async () => {
    const c = clock();
    const lines: string[] = [];
    const f = scriptedFetch(['hang', 200]);
    assert.equal(await driver(f.fetch, c, lines, 20).roomState(ROOM), 'BUILDING');
    assert.match(lines[0]!, /no answer within 20ms; trying again in 5s$/);
  });

  it('gives up ten minutes after the first failure, on the schedule 5, 10, 20, 40, then every 60 s, and fails as before', async () => {
    const c = clock();
    const lines: string[] = [];
    const f = scriptedFetch(['reject']);
    await assert.rejects(driver(f.fetch, c, lines).roomState(ROOM), (error: unknown) => error instanceof Phase4TransportError && error.message === 'fetch failed');
    assert.deepEqual(c.state.waits, [5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000, 45_000]);
    assert.equal(c.state.waits.reduce((a, b) => a + b, 0), PHASE4_READ_RETRY_WINDOW_MS);
    assert.equal(f.seen.length, c.state.waits.length + 1);
  });

  it('after ten minutes of 502, the read fails with the route’s refusal, as before', async () => {
    const c = clock();
    const f = scriptedFetch([502]);
    await assert.rejects(driver(f.fetch, c).roomState(ROOM), /room read answered 502/);
    assert.equal(c.state.waits.reduce((a, b) => a + b, 0), PHASE4_READ_RETRY_WINDOW_MS);
  });

  it('never retries a 503 or a 4xx', async () => {
    for (const status of [503, 404, 401]) {
      const c = clock();
      const lines: string[] = [];
      const f = scriptedFetch([status, 200]);
      await assert.rejects(driver(f.fetch, c, lines).roomState(ROOM), new RegExp(`room read answered ${status}`));
      assert.equal(f.seen.length, 1, `status ${status}`);
      assert.deepEqual(c.state.waits, []);
      assert.deepEqual(lines, []);
    }
  });

  it('never retries a write: a rejected or timed-out POST fails at once', async () => {
    for (const step of ['reject', 'hang', 502] as const) {
      const c = clock();
      const lines: string[] = [];
      const f = scriptedFetch([step, 201]);
      await assert.rejects(driver(f.fetch, c, lines, 20).createRoom(ROOM));
      assert.equal(f.seen.length, 1, String(step));
      assert.equal(f.seen[0]!.method, 'POST');
      assert.deepEqual(c.state.waits, []);
      assert.deepEqual(lines, []);
    }
  });

  it('a write that never answers fails at the timeout', async () => {
    const f = scriptedFetch(['hang']);
    const started = Date.now();
    await assert.rejects(driver(f.fetch, clock(), [], 50).createRoom(ROOM), /no answer within 50ms/);
    assert.ok(Date.now() - started < 5_000);
  });
});

/* ---------------- B2: the plan route ---------------- */

const CONTROL_TOKEN = 'plan-read-control-token-long-enough-0001';
const ADJUDICATION_TOKEN = 'plan-read-adjudication-token-long-enough';
const BASE_ENV = {
  DATABASE_URL: 'postgresql://user:secret@host.neon.tech/db?sslmode=require',
  CONTROL_PLANE_TOKEN: CONTROL_TOKEN,
  PHASE3_ADJUDICATION_TOKEN: ADJUDICATION_TOKEN,
  COMMIT_SHA: 'deadbeef',
};
const STORED: StoredPlan = {
  commandId: 'cmd_planner_2',
  roomId: ROOM,
  lifecycleEventId: 'evt_t3_second',
  planHash: PLAN_HASH,
  document: { schema_version: 'plandoc/1', objective: 'the second plan' } as unknown as StoredPlan['document'],
  recordedAt: new Date(0),
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
      return { rows: [{ id: 1, owner_id: ownerId, generation: '1', heartbeat_at: new Date(), challenge, challenge_published_at: new Date() }], rowCount: 1 };
    }
    if (/SELECT now\(\)/.test(sql)) return { rows: [{ now: new Date() }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const client = { query: (sql: string, params?: unknown[]) => answer(sql, params), release: () => undefined };
  return { query: (sql: string, params?: unknown[]) => answer(sql, params), connect: async () => client, on: () => undefined, end: async () => undefined } as unknown as Pool;
}

const openServers: Server[] = [];
const openGateways: GatewaySurface[] = [];
after(async () => {
  await Promise.all(openGateways.map((gateway) => gateway.stop()));
  await Promise.all(openServers.map((server) => closeServer(server)));
});

interface PlanFixture {
  readonly exists?: boolean;
  readonly t3s?: readonly string[];
  /** A T3 that lands after the room's first read, as a revision's would. */
  readonly t3AfterFirstRead?: string;
  readonly plan?: StoredPlan | null | 'unavailable';
}

async function startPlanServer(fixture: PlanFixture) {
  const asked: { roomId: string; eventId: string }[] = [];
  const entries = [
    { transition: 'T1', eventId: 'evt_t1' },
    { transition: 'T2', eventId: 'evt_t2' },
    ...(fixture.t3s ?? []).flatMap((id, n) => [{ transition: 'T3', eventId: id }, ...(n < (fixture.t3s?.length ?? 0) - 1 ? [{ transition: 'T4', eventId: `evt_t4_${n}` }] : [])]),
  ];
  let roomReads = 0;
  const store = new Proxy(
    {
      loadRoom: async (roomId: string) => {
        roomReads += 1;
        const now = roomReads > 1 && fixture.t3AfterFirstRead !== undefined
          ? [...entries, { transition: 'T4', eventId: 'evt_t4_late' }, { transition: 'T3', eventId: fixture.t3AfterFirstRead }]
          : entries;
        return { roomId, exists: fixture.exists ?? true, state: { entries: now }, logLength: now.length };
      },
    },
    {
      get: (target, key) => {
        if (key === 'loadRoom') return target.loadRoom;
        return () => {
          throw new Error(`the plan read reached the ledger store's ${String(key)}`);
        };
      },
    },
  ) as unknown as PostgresLedgerStore;
  const planReader = {
    planForEvent: async (roomId: string, eventId: string) => {
      asked.push({ roomId, eventId });
      if (fixture.plan === 'unavailable') throw new PlanStoreUnavailableError();
      return fixture.plan === undefined ? STORED : fixture.plan;
    },
  };
  const config = loadConfig(BASE_ENV);
  const gateway = createGatewaySurface({ pool: fakeLeaderPool(), config, log: () => undefined });
  openGateways.push(gateway);
  const app = createServer({ config, pool: { query: async () => ({ rows: [] }) } as unknown as Pool, store, startedAt: Date.now(), gateway, planReader });
  const server = app.listen(0, '127.0.0.1');
  openServers.push(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = (token: string | null, room = ROOM) =>
    fetch(`${url}/control-plane/rooms/${room}/plan`, { headers: token === null ? {} : { authorization: `Bearer ${token}` } });
  return { get, asked };
}

describe('B2: GET /control-plane/rooms/:roomId/plan', () => {
  it('answers the plan the room’s latest T3 submitted, with its hash and command', async () => {
    const { get, asked } = await startPlanServer({ t3s: ['evt_t3_first', 'evt_t3_second'] });
    const response = await get(CONTROL_TOKEN);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { roomId: ROOM, commandId: 'cmd_planner_2', planHash: PLAN_HASH, document: STORED.document });
    assert.deepEqual(asked, [{ roomId: ROOM, eventId: 'evt_t3_second' }]);
  });

  it('answers 404 for a room with no T3, a room that does not exist, or a T3 with no stored plan', async () => {
    assert.equal((await (await startPlanServer({ t3s: [] })).get(CONTROL_TOKEN)).status, 404);
    assert.equal((await (await startPlanServer({ exists: false, t3s: ['evt_t3'] })).get(CONTROL_TOKEN)).status, 404);
    assert.equal((await (await startPlanServer({ t3s: ['evt_t3'], plan: null })).get(CONTROL_TOKEN)).status, 404);
  });

  it('answers 409 when a newer T3 lands while the plan is read, and serves no stale plan', async () => {
    const { get, asked } = await startPlanServer({ t3s: ['evt_t3_first'], t3AfterFirstRead: 'evt_t3_second' });
    const response = await get(CONTROL_TOKEN);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'plan_changed' });
    assert.deepEqual(asked, [{ roomId: ROOM, eventId: 'evt_t3_first' }]);
  });

  it('answers 401 without the API token, the adjudication token included', async () => {
    const { get, asked } = await startPlanServer({ t3s: ['evt_t3'] });
    for (const token of [null, ADJUDICATION_TOKEN, 'wrong-token']) assert.equal((await get(token)).status, 401);
    assert.deepEqual(asked, []);
  });

  it('answers 400 for a room id that is not a UUID, and 503 when the plan store is unavailable', async () => {
    assert.equal((await (await startPlanServer({ t3s: ['evt_t3'] })).get(CONTROL_TOKEN, 'not-a-room')).status, 400);
    const unavailable = await (await startPlanServer({ t3s: ['evt_t3'], plan: 'unavailable' })).get(CONTROL_TOKEN);
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { error: 'plan_store_unavailable' });
  });
});

/* ---------------- B1 and B2 in the command ---------------- */

function runSet(): Phase4RunSet {
  const run = (label: string, roomId: string, path: string) => ({
    label,
    roomId,
    inputs: { repository: 'MADVenturesLLC/founder-os-build-room', baseSha: SHA_BASE, scopePaths: [path], goal: `Plan a section for ${path}.` },
  });
  return {
    setId: 'FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL-FIXES',
    founderOsSha: SHA_FOUNDEROS,
    buildRoomSha: SHA_BUILDROOM,
    controlPlaneOrigin: ORIGIN,
    gatewayId: GATEWAY,
    planner: { provider: 'google', model: 'gemini-4-argon' },
    seats: { builder: 'claude-code:anthropic', reviewer: 'codex:openai' },
    founderRelay: { actualModel: 'n/a (deterministic run-harness relay of the act’s text)', executionSurface: 'build-room-run-harness' },
    decisionTimeoutMs: 60_000,
    runs: [
      run('Phase4-CR1', ROOM, 'README.md'),
      run('Phase4-CR2', 'c7d6bd4f-607b-4753-9430-9a16fc46356e', 'docs/command-journal-contract.md'),
      run('Phase4-CR3', 'c5442130-2afd-4c0f-a294-62beddeef06e', 'docs/gateway-ops-actions-log-runbook.md'),
    ],
  } as Phase4RunSet;
}

interface PlaneOptions {
  /** How the plan route answers. */
  readonly plan?: 'ok' | 'other-hash' | 'error' | 'with-token';
  /** How many room reads are lost (fetch rejects) before they answer. */
  readonly lostRoomReads?: number;
}

function fakeControlPlane(options: PlaneOptions = {}) {
  const requests: { method: string; path: string }[] = [];
  let round: Record<string, unknown> = { status: 'idle' };
  let roomReads = 0;
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const path = url.pathname;
    requests.push({ method, path });
    if (method === 'GET' && path === '/version') return json(200, { commit: SHA_BUILDROOM });
    if (method === 'GET' && path === '/control-plane/enrollments') return json(200, { enrollments: [{ gatewayId: GATEWAY, state: 'enrolled' }] });
    if (method === 'POST' && path === '/rooms') return json(201, {});
    if (method === 'POST' && /^\/rooms\/[^/]+\/events$/.test(path)) return json(201, {});
    if (method === 'POST' && /\/planner-round$/.test(path)) {
      round = { status: 'settled', roomId: path.split('/')[3], outcome: { kind: 'plan_review', commandId: 'cmd-1', planHash: PLAN_HASH } };
      return json(202, { status: 'running' });
    }
    if (method === 'GET' && /\/planner-round$/.test(path)) {
      return json(200, { actId: runSet().setId, deploymentId: DEPLOYMENT, gateway: { id: GATEWAY, online: true }, dispatcherSurfaceRegistered: true, round });
    }
    if (method === 'GET' && /\/plan$/.test(path)) {
      if (options.plan === 'error') return json(500, { error: 'internal' });
      const planHash = options.plan === 'other-hash' ? 'e'.repeat(64) : PLAN_HASH;
      const document = options.plan === 'with-token' ? { schema_version: 'plandoc/1', objective: `leak ${API_TOKEN}` } : { schema_version: 'plandoc/1', objective: 'the plan' };
      return json(200, { roomId: ROOM, commandId: 'cmd-1', planHash, document });
    }
    if (method === 'GET' && /^\/rooms\/[^/]+$/.test(path)) {
      roomReads += 1;
      if (roomReads <= (options.lostRoomReads ?? 0)) throw new TypeError('fetch failed');
      return json(200, { snapshot: { state: 'PLAN_REVIEW' } });
    }
    if (method === 'GET' && /\/export$/.test(path)) return json(200, { roomId: path.split('/')[2], snapshot: { state: 'PLAN_REVIEW' }, events: [] });
    if (method === 'GET' && /\/journal$/.test(path)) {
      return json(200, {
        commands: [{ commandId: 'cmd-1', rows: [{ eventType: 'journaled' }, { eventType: 'dispatched', initModel: 'gemini-4-argon-high', providerConversationId: 'conv-1' }] }],
        decisions: [],
        journal: { verified: true, headSeq: 3 },
      });
    }
    return json(404, { error: 'not_found' });
  };
  return { fetch: fake as typeof fetch, requests };
}

function fakeGit() {
  return async (args: readonly string[]): Promise<string> => {
    if (args.includes('rev-parse')) return `${SHA_FOUNDEROS}\n`;
    if (args.includes('status')) return '';
    if (args[0] === 'ls-remote') return `${SHA_BASE}\tHEAD\n`;
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), 'phase4-fixes-'));
  const termsFile = join(dir, 'terms.json');
  const text = `${JSON.stringify(runSet(), null, 2)}\n`;
  await writeFile(termsFile, text);
  return {
    dir,
    evidence: join(dir, 'evidence'),
    env: {
      PHASE4_TERMS_FILE: termsFile,
      PHASE4_TERMS_SHA256: createHash('sha256').update(text).digest('hex'),
      PHASE4_EVIDENCE_DIR: join(dir, 'evidence'),
      CONTROL_PLANE_TOKEN: API_TOKEN,
      PHASE4_COUNTED_RUN_TOKEN: COUNTED_TOKEN,
      FOUNDEROS_PATH: join(dir, 'founderos'),
      PHASE4_EXECUTOR_CONFIRMED: 'yes',
    },
  };
}

async function run(options: PlaneOptions, before?: (evidence: string) => Promise<void>) {
  const w = await workspace();
  if (before !== undefined) await before(w.evidence);
  const plane = fakeControlPlane(options);
  const lines: string[] = [];
  const c = clock();
  const code = await phase4CountedRunMain(w.env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), now: c.now, sleep: c.sleep, pollMs: 1_000 });
  const roomPolls = plane.requests.filter((r) => r.method === 'GET' && /^\/rooms\/[^/]+$/.test(r.path)).length;
  return { ...w, code, output: lines.join('\n'), lines, roomPolls, requests: plane.requests };
}

const PLAN_FILE = `plan-${PLAN_HASH}.json`;

describe('the command: the plan saved at plan_review (B2)', () => {
  it('writes plan-<hash>.json once, prints its path and hash, and goes on waiting for the decision', async () => {
    const r = await run({ plan: 'ok' });
    assert.match(r.output, new RegExp(`PLAN for your decision: ${join(r.evidence, PLAN_FILE).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(plan hash ${PLAN_HASH}, command cmd-1\\)`));
    assert.deepEqual(JSON.parse(await readFile(join(r.evidence, PLAN_FILE), 'utf8')), { schema_version: 'plandoc/1', objective: 'the plan' });
    // The plan was read with the API token's route, and the run then waited:
    // the room was polled until the decision time ran out.
    assert.ok(r.requests.some((q) => q.path === `/control-plane/rooms/${ROOM}/plan`));
    assert.ok(r.roomPolls > 1);
    assert.equal(r.code, PHASE4_CLI_EXIT.notPassed);
    assert.match(r.output, /Phase4-CR1: interrupted/);
  });

  it('never overwrites a plan file already there, and goes on waiting', async () => {
    const r = await run({ plan: 'ok' }, async (evidence) => {
      await (await import('node:fs/promises')).mkdir(evidence, { recursive: true });
      await writeFile(join(evidence, PLAN_FILE), 'already here\n');
    });
    assert.match(r.output, /PLAN NOT SAVED \(plan-f50+\.json already exists; evidence is never overwritten\): the runner goes on waiting for your decision/);
    assert.equal(await readFile(join(r.evidence, PLAN_FILE), 'utf8'), 'already here\n');
    assert.ok(r.roomPolls > 1);
  });

  for (const [label, plan, reason] of [
    ['the route fails', 'error', /PLAN NOT SAVED \(plan read answered 500: internal\)/],
    ['the route’s hash is not the round’s', 'other-hash', /PLAN NOT SAVED: the plan route's hash e{64} is not the round's f50+/],
    ['the plan holds a token', 'with-token', /PLAN NOT SAVED: it holds a token/],
  ] as const) {
    it(`writes no plan file when ${label}, and goes on waiting`, async () => {
      const r = await run({ plan });
      assert.match(r.output, reason);
      const names = await readdir(r.evidence);
      assert.equal(names.some((n) => n.startsWith('plan-')), false);
      assert.ok(r.roomPolls > 1);
      for (const token of [API_TOKEN, COUNTED_TOKEN]) assert.equal(r.output.includes(token), false);
    });
  }
});

describe('the command: a lost read while waiting on the Founder (B1)', () => {
  it('two lost room reads are tried again and the run goes on waiting, where before it ended interrupted at once', async () => {
    const r = await run({ plan: 'ok', lostRoomReads: 2 });
    assert.equal(r.lines.filter((l) => /^retry: .* GET \/rooms\/1086e073-e181-49a9-a275-cd1e35541f7c: fetch failed; trying again in (5|10)s$/.test(l)).length, 2);
    assert.doesNotMatch(r.output, /interrupted at .*fetch failed/);
    // It ran on to the decision time: the room was read again after the losses.
    assert.ok(r.roomPolls > 3);
  });
});

describe('the constants', () => {
  it('match the act: a ten-minute window', () => {
    assert.equal(PHASE4_READ_RETRY_WINDOW_MS, 600_000);
  });
});
