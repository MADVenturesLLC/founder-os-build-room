/**
 * Phase 2 known limit §2 — the gate-run HTTP surface, without a database.
 *
 * `POST /gate/runs` appends one run to the persisted gate sequence and
 * `GET /gate/runs` lists the whole sequence. Both sit behind the SAME shared
 * token guard as the room routes — mounted by `createServer`, which is what
 * these tests drive, so they prove the mounting and not a copy of the guard.
 *
 * The store is a stub. What talks to Postgres is `gate-runs.storage.test.ts`.
 * The unauthenticated cases use a store that throws on any call, so a request
 * that got past the guard fails the test even where the status alone would
 * look right — the same discipline as `control-plane-server.test.ts`.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { createServer } from '../packages/control-plane/src/server.js';
import { createGatewaySurface, type GatewaySurface } from '../packages/control-plane/src/gateway/index.js';
import {
  GateRunConflictError,
  GateRunStoreUnavailableError,
  type GateRunInput,
  type PersistedGateRun,
  type PostgresLedgerStore,
} from '../packages/control-plane/src/store.js';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { closeServer } from './support/close-server.js';

const TOKEN = 'gate-route-token-that-is-long-enough';
const CONFIG = loadConfig({
  DATABASE_URL: 'postgresql://user:secret@host.neon.tech/db?sslmode=require',
  CONTROL_PLANE_TOKEN: TOKEN,
  COMMIT_SHA: 'deadbeef',
});
const RUN_ID = '11111111-2222-4333-8444-555555555555';

/** Answers only the lease statements leadership issues; everything else is empty. */
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
  return {
    query: (sql: string, params?: unknown[]) => answer(sql, params),
    connect: async () => client,
    on: () => undefined,
    end: async () => undefined,
  } as unknown as Pool;
}

const openServers: Server[] = [];
const openGateways: GatewaySurface[] = [];

async function start(store: PostgresLedgerStore): Promise<string> {
  const gateway = createGatewaySurface({ pool: fakeLeaderPool(), config: CONFIG, log: () => undefined });
  openGateways.push(gateway);
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  const app = createServer({ config: CONFIG, pool, store, startedAt: Date.now(), gateway });
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

const auth = { authorization: `Bearer ${TOKEN}` };

function runBody(verdict: 'passed' | 'failed' = 'passed'): Record<string, unknown> {
  const held = verdict === 'passed';
  return {
    gate: 'phase2_three_run',
    run: {
      runId: RUN_ID,
      startedAt: '2026-09-25T10:00:00.000Z',
      endedAt: '2026-09-25T10:01:00.000Z',
      commit: 'abc1234',
      steps: [],
      conditions: [
        { condition: 'deploys_and_stays_up', held: true, evidence: 'healthy' },
        { condition: 'reads_and_writes', held: true, evidence: 'round-trip' },
        { condition: 'survives_restart', held, evidence: held ? 'replayed' : 'lost a row' },
      ],
      verdict,
      ...(held ? {} : { failureReason: 'survives_restart: lost a row' }),
    },
  };
}

function persisted(input: GateRunInput, seq: number): PersistedGateRun {
  return { ...input, seq, recordedAt: '2026-09-25T10:01:01.000Z' };
}

/** A stub that records every call and answers from a list. */
function recordingStore(options: {
  readonly append?: (input: GateRunInput) => Promise<{ run: PersistedGateRun; created: boolean }>;
  readonly list?: () => Promise<readonly PersistedGateRun[]>;
} = {}): { store: PostgresLedgerStore; appended: GateRunInput[] } {
  const appended: GateRunInput[] = [];
  const store = {
    appendGateRun: async (input: GateRunInput) => {
      appended.push(input);
      return options.append ? options.append(input) : { run: persisted(input, appended.length), created: true };
    },
    listGateRuns: async () => (options.list ? options.list() : []),
  } as unknown as PostgresLedgerStore;
  return { store, appended };
}

const explodingStore = {
  appendGateRun: async () => {
    throw new Error('the guard let an unauthenticated request through');
  },
  listGateRuns: async () => {
    throw new Error('the guard let an unauthenticated request through');
  },
} as unknown as PostgresLedgerStore;

describe('gate runs — the routes are token-guarded by the shared guard', () => {
  for (const [method, headers] of [
    ['POST', {}],
    ['GET', {}],
    ['POST', { authorization: 'Bearer wrong-token-of-another-length' }],
    ['GET', { authorization: `Bearer ${'x'.repeat(TOKEN.length)}` }],
  ] as const) {
    it(`answers 401 on ${method} /gate/runs with ${Object.keys(headers).length === 0 ? 'no' : 'a wrong'} credential`, async () => {
      const url = await start(explodingStore);
      const response = await fetch(`${url}/gate/runs`, {
        method,
        headers: { ...headers, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
        ...(method === 'POST' ? { body: JSON.stringify(runBody()) } : {}),
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'unauthorized' });
    });
  }
});

describe('gate runs — POST /gate/runs appends', () => {
  it('appends a valid run and answers 201 with the store-assigned seq', async () => {
    const { store, appended } = recordingStore();
    const url = await start(store);
    const response = await fetch(`${url}/gate/runs`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(runBody()),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as { run: { seq: number; runId: string; verdict: string } };
    assert.equal(body.run.seq, 1);
    assert.equal(body.run.runId, RUN_ID);
    assert.equal(appended.length, 1);
    assert.equal(appended[0]?.verdict, 'passed');
    assert.equal(appended[0]?.gate, 'phase2_three_run');
  });

  it('answers 200 for a replay the store already holds', async () => {
    const { store } = recordingStore({ append: async (input) => ({ run: persisted(input, 7), created: false }) });
    const url = await start(store);
    const response = await fetch(`${url}/gate/runs`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(runBody()),
    });
    assert.equal(response.status, 200);
  });

  it('refuses a passing verdict its own conditions contradict, before the store', async () => {
    const { store, appended } = recordingStore();
    const url = await start(store);
    const body = runBody('failed');
    (body['run'] as Record<string, unknown>)['verdict'] = 'passed';
    delete (body['run'] as Record<string, unknown>)['failureReason'];
    const response = await fetch(`${url}/gate/runs`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    assert.equal(appended.length, 0);
  });

  for (const [label, mutate] of [
    ['an unknown gate', (b: Record<string, unknown>) => { b['gate'] = 'phase9'; }],
    ['a non-UUID run id', (b: Record<string, unknown>) => { (b['run'] as Record<string, unknown>)['runId'] = 'x'; }],
    ['a caller-chosen seq', (b: Record<string, unknown>) => { (b['run'] as Record<string, unknown>)['seq'] = 1; }],
    ['a failure with no reason', (b: Record<string, unknown>) => {
      const run = b['run'] as Record<string, unknown>;
      run['verdict'] = 'failed';
    }],
  ] as const) {
    it(`refuses ${label} with 400 and never reaches the store`, async () => {
      const { store, appended } = recordingStore();
      const url = await start(store);
      const body = runBody();
      mutate(body);
      const response = await fetch(`${url}/gate/runs`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.equal(appended.length, 0);
    });
  }

  it('answers 409 when the run id is already recorded with different content', async () => {
    const { store } = recordingStore({
      append: async () => {
        throw new GateRunConflictError(RUN_ID);
      },
    });
    const url = await start(store);
    const response = await fetch(`${url}/gate/runs`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(runBody()),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'run_id_conflict' });
  });

  it('answers 503 when the store is unreachable — never an accepted write', async () => {
    const { store } = recordingStore({
      append: async () => {
        throw new GateRunStoreUnavailableError();
      },
    });
    const url = await start(store);
    const response = await fetch(`${url}/gate/runs`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify(runBody()),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'gate_run_store_unavailable' });
  });
});

describe('gate runs — GET /gate/runs lists the persisted sequence', () => {
  it('returns every run in seq order as the store holds it', async () => {
    const runs = [1, 2, 3].map((seq) => {
      const run = runBody(seq === 1 ? 'failed' : 'passed')['run'] as Record<string, unknown>;
      return persisted(
        {
          gate: 'phase2_three_run',
          runId: `${String(seq).repeat(8)}-2222-4333-8444-555555555555`,
          startedAt: String(run['startedAt']),
          endedAt: String(run['endedAt']),
          commit: 'abc1234',
          verdict: run['verdict'] as 'passed' | 'failed',
          ...(run['failureReason'] === undefined ? {} : { failureReason: String(run['failureReason']) }),
          record: run,
        },
        seq,
      );
    });
    const { store } = recordingStore({ list: async () => runs });
    const url = await start(store);
    const response = await fetch(`${url}/gate/runs`, { headers: auth });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { gate: string; runs: Array<{ seq: number; verdict: string }> };
    assert.equal(body.gate, 'phase2_three_run');
    assert.deepEqual(body.runs.map((run) => run.seq), [1, 2, 3]);
    assert.deepEqual(body.runs.map((run) => run.verdict), ['failed', 'passed', 'passed']);
  });

  it('answers 503 when the store is unreachable — never an empty sequence', async () => {
    const { store } = recordingStore({
      list: async () => {
        throw new GateRunStoreUnavailableError();
      },
    });
    const url = await start(store);
    const response = await fetch(`${url}/gate/runs`, { headers: auth });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'gate_run_store_unavailable' });
  });
});
