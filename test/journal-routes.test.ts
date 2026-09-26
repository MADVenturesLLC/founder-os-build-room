/**
 * The command-journal HTTP surface, without a database.
 *
 * `POST /journal/commands` appends exactly one `journaled` command-class
 * event through the control plane's single journal module (contract §3
 * sole writer, §5.1 fail closed). It sits behind the SAME shared token
 * guard as the room and gate-run routes — mounted by `createServer`, which
 * is what these tests drive, so they prove the mounting and not a copy of
 * the guard.
 *
 * The store is a stub, injected through `ServerDeps.journalStore`. What
 * talks to Postgres is `journal-store.storage.test.ts`. The unauthenticated
 * cases use a store that throws on any call, so a request that got past the
 * guard fails the test even where the status alone would look right — the
 * same discipline as `gate-run-routes.test.ts`.
 *
 * The credential-material cases are the one exception to the stub: they run
 * the REAL `JournalStore` over a pool that throws if it is ever reached, so
 * the refusal is proven to happen before any database contact and the
 * offending value is proven absent from the response.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { createServer } from '../packages/control-plane/src/server.js';
import { createGatewaySurface, type GatewaySurface } from '../packages/control-plane/src/gateway/index.js';
import type { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import { JOURNAL_BODY_LIMIT } from '../packages/control-plane/src/journal-routes.js';
import {
  JournalContendedError,
  JournalDuplicateEventError,
  JournalIntegrityError,
  JournalRuntimeNotAuthorizedError,
  JournalStore,
  JournalStoreUnavailableError,
  type JournaledAppendResult,
} from '../packages/control-plane/src/journal-store.js';
import type { GovernedCommandRequest } from '../packages/journal/src/index.js';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { closeServer } from './support/close-server.js';

const TOKEN = 'journal-route-token-that-is-long-enough';
const CONFIG = loadConfig({
  DATABASE_URL: 'postgresql://user:secret@host.neon.tech/db?sslmode=require',
  CONTROL_PLANE_TOKEN: TOKEN,
  COMMIT_SHA: 'deadbeef',
});
const COMMAND_ID = 'cmd_route_test_0001';
const ROUTE = '/journal/commands';

type JournalStoreStub = Pick<JournalStore, 'appendJournaled'>;

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

/** A pool that fails the test if the journal path ever reaches it. */
function unreachablePool(): Pool {
  const reached = async (): Promise<never> => {
    throw new Error('the journal path reached the database before the credential guard');
  };
  return { query: reached, connect: reached, on: () => undefined, end: async () => undefined } as unknown as Pool;
}

/**
 * A pool that answers the store's two statements from memory and records
 * the bytes handed to the routine — so the REAL store's redaction can be
 * observed at the HTTP boundary without a database.
 */
function recordingJournalPool(): { pool: Pool; appendParams: unknown[][] } {
  const appendParams: unknown[][] = [];
  const query = async (sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> => {
    if (/FROM public\.command_journal_chain_head/.test(sql)) return { rows: [{ seq: '0' }], rowCount: 1 };
    if (/public\.command_journal_append\(/.test(sql)) {
      appendParams.push(params);
      return { rows: [{ seq: '1', chain_hash: 'e'.repeat(64) }], rowCount: 1 };
    }
    throw new Error('the store issued a statement this test does not expect');
  };
  const client = { query, release: () => undefined };
  return {
    pool: { query, connect: async () => client, on: () => undefined, end: async () => undefined } as unknown as Pool,
    appendParams,
  };
}

/** The room routes are not under test here; reaching the ledger store is a failure. */
const explodingLedgerStore = new Proxy(
  {},
  {
    get: () => () => {
      throw new Error('a journal test reached the ledger store');
    },
  },
) as unknown as PostgresLedgerStore;

const openServers: Server[] = [];
const openGateways: GatewaySurface[] = [];

async function start(journalStore: JournalStoreStub): Promise<string> {
  const gateway = createGatewaySurface({ pool: fakeLeaderPool(), config: CONFIG, log: () => undefined });
  openGateways.push(gateway);
  const pool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  const app = createServer({
    config: CONFIG,
    pool,
    store: explodingLedgerStore,
    startedAt: Date.now(),
    gateway,
    journalStore,
  });
  const server = app.listen(0);
  openServers.push(server);
  await gateway.leadership.attemptAcquisition();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

after(async () => {
  await Promise.all(openGateways.map((gateway) => gateway.stop()));
  await Promise.all(openServers.map((server) => closeServer(server)));
});

const auth = { authorization: `Bearer ${TOKEN}` };

function commandBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commandKind: 'planner.invoke',
    argv: ['--goal', 'ship the journal route'],
    actorId: 'session:test/journal-routes',
    roleId: 'builder',
    authorizationRef: 'HO-20260926-01',
    repository: 'example-org/example-repo',
    scopeRef: 'scope/phase4',
    intendedProvider: 'example-provider',
    intendedModel: 'example-model',
    intendedSurface: 'claude-code',
    evidenceRefs: ['ev_route_1'],
    commandId: COMMAND_ID,
    ...overrides,
  };
}

function appended(request: GovernedCommandRequest, seq = '1'): JournaledAppendResult {
  return {
    commandId: request.commandId ?? 'cmd_minted_by_store',
    seq,
    chainHash: 'c'.repeat(64),
    envelopeDigest: 'd'.repeat(64),
  };
}

/** A stub that records every request and answers from `append`, or with the default result. */
function recordingStore(
  append?: (request: GovernedCommandRequest) => Promise<JournaledAppendResult>,
): { store: JournalStoreStub; requests: GovernedCommandRequest[] } {
  const requests: GovernedCommandRequest[] = [];
  const store: JournalStoreStub = {
    appendJournaled: async (request) => {
      requests.push(request);
      return append ? append(request) : appended(request, String(requests.length));
    },
  };
  return { store, requests };
}

const explodingStore: JournalStoreStub = {
  appendJournaled: async () => {
    throw new Error('the guard let an unauthenticated request through');
  },
};

async function post(url: string, body: unknown, headers: Record<string, string> = auth): Promise<Response> {
  return fetch(`${url}${ROUTE}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('journal — POST /journal/commands is token-guarded by the shared guard', () => {
  for (const [label, headers] of [
    ['no', {}],
    ['a wrong', { authorization: 'Bearer wrong-token-of-another-length' }],
    ['a same-length wrong', { authorization: `Bearer ${'x'.repeat(TOKEN.length)}` }],
  ] as const) {
    it(`answers 401 with ${label} credential and never reaches the store`, async () => {
      const url = await start(explodingStore);
      const response = await post(url, commandBody(), headers);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'unauthorized' });
    });
  }

  it('has no read route in this slice: GET /journal/commands is 404, even authenticated', async () => {
    const url = await start(explodingStore);
    const response = await fetch(`${url}${ROUTE}`, { headers: auth });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  });
});

describe('journal — POST /journal/commands appends one journaled event', () => {
  it('answers 201 with exactly { commandId, seq, chainHash, envelopeDigest } once the row is committed', async () => {
    const { store, requests } = recordingStore(async (request) => appended(request, '42'));
    const url = await start(store);
    const response = await post(url, commandBody());
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      commandId: COMMAND_ID,
      seq: '42',
      chainHash: 'c'.repeat(64),
      envelopeDigest: 'd'.repeat(64),
    });
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], {
      commandKind: 'planner.invoke',
      argv: ['--goal', 'ship the journal route'],
      actorId: 'session:test/journal-routes',
      roleId: 'builder',
      authorizationRef: 'HO-20260926-01',
      repository: 'example-org/example-repo',
      scopeRef: 'scope/phase4',
      intendedProvider: 'example-provider',
      intendedModel: 'example-model',
      intendedSurface: 'claude-code',
      evidenceRefs: ['ev_route_1'],
      commandId: COMMAND_ID,
    });
  });

  it('passes an absent commandId and absent evidenceRefs through as absent — the store mints and defaults', async () => {
    const { store, requests } = recordingStore();
    const url = await start(store);
    const body = commandBody();
    delete body['commandId'];
    delete body['evidenceRefs'];
    const response = await post(url, body);
    assert.equal(response.status, 201);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.commandId, undefined);
    assert.equal(requests[0]?.evidenceRefs, undefined);
    assert.equal((await response.json() as JournaledAppendResult).commandId, 'cmd_minted_by_store');
  });
});

describe('journal — validation refuses before the store is touched', () => {
  const required = [
    'commandKind',
    'actorId',
    'roleId',
    'authorizationRef',
    'repository',
    'scopeRef',
    'intendedProvider',
    'intendedModel',
    'intendedSurface',
  ] as const;

  for (const field of required) {
    for (const [label, value] of [
      ['missing', undefined],
      ['empty', ''],
      ['blank', '   '],
      ['not a string', 7],
    ] as const) {
      it(`refuses ${field} ${label} with 400 invalid_request`, async () => {
        const { store, requests } = recordingStore();
        const url = await start(store);
        const body = commandBody();
        if (value === undefined) delete body[field];
        else body[field] = value;
        const response = await post(url, body);
        assert.equal(response.status, 400);
        const answer = (await response.json()) as { error: string; message: string };
        assert.equal(answer.error, 'invalid_request');
        assert.match(answer.message, new RegExp(field));
        assert.equal(requests.length, 0);
      });
    }
  }

  for (const [label, mutate] of [
    ['a body that is not an object', (b: Record<string, unknown>) => { Object.keys(b).forEach((k) => delete b[k]); }],
    ['argv missing', (b: Record<string, unknown>) => { delete b['argv']; }],
    ['argv that is not an array', (b: Record<string, unknown>) => { b['argv'] = '--goal'; }],
    ['argv with a non-string entry', (b: Record<string, unknown>) => { b['argv'] = ['--goal', 1]; }],
    ['evidenceRefs that is not an array', (b: Record<string, unknown>) => { b['evidenceRefs'] = 'ev_1'; }],
    ['evidenceRefs with an empty entry', (b: Record<string, unknown>) => { b['evidenceRefs'] = ['ev_1', '']; }],
    ['evidenceRefs with a non-string entry', (b: Record<string, unknown>) => { b['evidenceRefs'] = [1]; }],
    ['a commandId outside the cmd_ namespace', (b: Record<string, unknown>) => { b['commandId'] = 'run_0001'; }],
    ['a commandId that is only the cmd_ prefix', (b: Record<string, unknown>) => { b['commandId'] = 'cmd_'; }],
    ['a commandId that is not a string', (b: Record<string, unknown>) => { b['commandId'] = 12; }],
    ['a field outside the journaled command shape', (b: Record<string, unknown>) => { b['roomId'] = 'room_1'; }],
  ] as const) {
    it(`refuses ${label} with 400 and never reaches the store`, async () => {
      const { store, requests } = recordingStore();
      const url = await start(store);
      const body = commandBody();
      mutate(body);
      const response = await post(url, label.startsWith('a body that is not') ? [] : body);
      assert.equal(response.status, 400);
      assert.equal(((await response.json()) as { error: string }).error, 'invalid_request');
      assert.equal(requests.length, 0);
    });
  }

  for (const field of ['seq', 'recordedAt', 'recordClass', 'eventType'] as const) {
    it(`refuses a body that carries server-assigned ${field}, naming it`, async () => {
      const { store, requests } = recordingStore();
      const url = await start(store);
      const body = commandBody({ [field]: field === 'seq' ? '1' : 'x' });
      const response = await post(url, body);
      assert.equal(response.status, 400);
      const answer = (await response.json()) as { error: string; message: string };
      assert.equal(answer.error, 'invalid_request');
      assert.match(answer.message, new RegExp(`${field}.*server-assigned`));
      assert.equal(requests.length, 0);
    });
  }

  it('answers 400 invalid_request for a body the parser cannot read', async () => {
    const { store, requests } = recordingStore();
    const url = await start(store);
    const response = await post(url, '{"commandKind": ');
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(requests.length, 0);
  });

  it(`answers 413 payload_too_large above the ${JOURNAL_BODY_LIMIT} route limit`, async () => {
    const { store, requests } = recordingStore();
    const url = await start(store);
    const response = await post(url, commandBody({ argv: ['x'.repeat(70 * 1024)] }));
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'payload_too_large' });
    assert.equal(requests.length, 0);
  });
});

describe('journal — credential material is refused before any database contact (contract §6)', () => {
  // Clearly synthetic shapes: a GitHub-token-shaped string and a labelled
  // secret. Neither is a real credential; both match the write-path guard.
  const tokenShaped = `ghp_${'x'.repeat(36)}`;
  const labelled = 'token=example-not-a-real-secret-value';

  for (const [label, overrides] of [
    ['a token-shaped actorId (outside the envelope: the whole-row guard)', { actorId: tokenShaped }],
    ['a token-shaped authorizationRef', { authorizationRef: tokenShaped }],
    ['a token-shaped evidenceRef', { evidenceRefs: [tokenShaped] }],
    ['a token-shaped commandId', { commandId: `cmd_${tokenShaped}` }],
    ['a labelled secret in commandKind (inside the envelope: normalizeForJournal)', { commandKind: labelled }],
  ] as const) {
    it(`refuses ${label} with 400 credential_material and never echoes the value`, async () => {
      const store = new JournalStore(unreachablePool());
      const url = await start(store);
      const response = await post(url, commandBody(overrides));
      assert.equal(response.status, 400);
      const text = await response.text();
      assert.deepEqual(JSON.parse(text), { error: 'credential_material' });
      assert.ok(!text.includes(tokenShaped) && !text.includes('example-not-a-real-secret-value'), 'the offending value must not be echoed');
    });
  }

  it('a token-shaped argv entry is REDACTED before the write, not refused: the routine receives the marker and never the value', async () => {
    const { pool, appendParams } = recordingJournalPool();
    const url = await start(new JournalStore(pool, { now: () => new Date('2026-09-26T18:30:00.000Z') }));
    const response = await post(url, commandBody({ argv: ['--goal', tokenShaped] }));
    assert.equal(response.status, 201);
    assert.equal(appendParams.length, 1);
    const bytes = appendParams[0]?.[4];
    assert.ok(Buffer.isBuffer(bytes), 'the fifth argument is the canonical row bytes');
    assert.ok(!bytes.includes(tokenShaped), 'the value never reached the routine');
    assert.ok(bytes.includes('[REDACTED]'), 'the redaction marker did');
  });
});

describe('journal — store failures map to distinct statuses; a 2xx never precedes a committed row', () => {
  const cases: ReadonlyArray<readonly [string, () => Error, number, Record<string, unknown>]> = [
    ['a duplicate journaled event', () => new JournalDuplicateEventError(COMMAND_ID), 409, { error: 'duplicate_event' }],
    ['an unreachable store', () => new JournalStoreUnavailableError(), 503, { error: 'journal_store_unavailable' }],
    ['a runtime without EXECUTE (42501)', () => new JournalRuntimeNotAuthorizedError(), 503, { error: 'journal_runtime_not_authorized' }],
    ['exhausted seq-race retries', () => new JournalContendedError(6), 503, { error: 'journal_contended' }],
  ];
  for (const [label, make, status, body] of cases) {
    it(`answers ${status} ${String(body['error'])} on ${label}`, async () => {
      const { store } = recordingStore(async () => {
        throw make();
      });
      const url = await start(store);
      const response = await post(url, commandBody());
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), body);
    });
  }

  it('answers 500 journal_integrity_failure with a correlation id on an integrity finding, never the finding text', async () => {
    const { store } = recordingStore(async () => {
      throw new JournalIntegrityError('chain_head_divergence', 'command_journal_append: chain head divergence from events tail (head seq=3, tail seq=2)');
    });
    const url = await start(store);
    const response = await post(url, commandBody());
    assert.equal(response.status, 500);
    const text = await response.text();
    const answer = JSON.parse(text) as { error: string; incidentId: string };
    assert.equal(answer.error, 'journal_integrity_failure');
    assert.match(answer.incidentId, /^[0-9a-f-]{36}$/);
    assert.ok(!text.includes('divergence'), 'the finding text stays in the log, not the response');
  });

  it('answers 500 internal_error on an unclassified store failure — never a 2xx', async () => {
    const { store } = recordingStore(async () => {
      throw new Error('something the store did not classify');
    });
    const url = await start(store);
    const response = await post(url, commandBody());
    assert.equal(response.status, 500);
    const answer = (await response.json()) as { error: string };
    assert.equal(answer.error, 'internal_error');
  });
});
