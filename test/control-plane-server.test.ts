/**
 * Phase 2 — the HTTP surface, without a database.
 *
 * These tests answer the parts of the Founder's run definition that are about
 * the *surface*: that `/health` reports liveness without touching the
 * database, that `/ready` fails loudly (503) when the database is unreachable
 * rather than reporting ready, and that a ledger rejection reaches the caller
 * as the reducer's own code and reason rather than as a server error.
 *
 * The store and pool are stubs. What talks to a real Postgres is covered by
 * `control-plane-postgres.test.ts`, which runs only when `DATABASE_URL` is
 * set — so the suite is honest about which claims it has actually exercised
 * rather than quietly proving less than it appears to.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { createServer } from '../packages/control-plane/src/server.js';
import type { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { initialLedger } from '../packages/ledger/src/index.js';
import { makeEvent } from './helpers.js';

const CONFIG = loadConfig({
  DATABASE_URL: 'postgresql://user:secret@host.neon.tech/db?sslmode=require',
  COMMIT_SHA: 'deadbeef',
  READY_PROBE_TIMEOUT_MS: '500',
});

const ROOM = '11111111-2222-4333-8444-555555555555';

interface Harness {
  readonly url: string;
  readonly close: () => Promise<void>;
}

const openServers: Server[] = [];

function start(pool: Pool, store: PostgresLedgerStore): Harness {
  const app = createServer({ config: CONFIG, pool, store, startedAt: Date.now() });
  const server = app.listen(0);
  openServers.push(server);
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

after(async () => {
  await Promise.all(
    openServers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

/** `Response.json()` is `unknown` under strict TS; read it once, typed. */
async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

const reachablePool = { query: async () => ({ rows: [{ '?column?': 1 }] }) } as unknown as Pool;
const unreachablePool = {
  query: async () => {
    throw new Error('connection refused');
  },
} as unknown as Pool;

const emptyStore = {} as unknown as PostgresLedgerStore;

describe('control plane — health, readiness and version', () => {
  it('/health reports liveness without querying the database', async () => {
    let queried = false;
    const pool = {
      query: async () => {
        queried = true;
        return { rows: [] };
      },
    } as unknown as Pool;

    const harness = start(pool, emptyStore);
    const response = await fetch(`${harness.url}/health`);

    assert.equal(response.status, 200);
    assert.equal((await json(response)).status, 'ok');
    assert.equal(queried, false, '/health must not depend on the database');
    await harness.close();
  });

  it('/ready reports ready when the database answers', async () => {
    const harness = start(reachablePool, emptyStore);
    const response = await fetch(`${harness.url}/ready`);
    const body = await json(response);

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ready');
    assert.equal(body.database, 'reachable');
    await harness.close();
  });

  it('/ready reports 503 and says why when the database does not answer', async () => {
    const harness = start(unreachablePool, emptyStore);
    const response = await fetch(`${harness.url}/ready`);
    const body = await json(response);

    assert.equal(response.status, 503);
    assert.equal(body.database, 'unreachable');
    assert.match(String(body.error), /connection refused/);
    await harness.close();
  });

  it('/version reports the commit it was built from', async () => {
    const harness = start(reachablePool, emptyStore);
    const body = await json(await fetch(`${harness.url}/version`));

    assert.equal(body.commit, 'deadbeef');
    assert.equal(body.service, '@build-room/control-plane');
    await harness.close();
  });
});

describe('control plane — room surface', () => {
  it('rejects a room id that is not a UUID', async () => {
    const harness = start(reachablePool, emptyStore);
    const response = await fetch(`${harness.url}/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId: 'room-1' }),
    });

    assert.equal(response.status, 400);
    await harness.close();
  });

  it('returns a ledger rejection as 409 carrying the reducer\'s own code and reason', async () => {
    const store = {
      append: async () => ({
        ok: false as const,
        outcome: 'rejected' as const,
        code: 'guard_failed' as const,
        reason: 'G4 (T4): plan hash mismatch',
        state: initialLedger(),
      }),
    } as unknown as PostgresLedgerStore;

    const harness = start(reachablePool, store);
    const response = await fetch(`${harness.url}/rooms/${ROOM}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(makeEvent('plan.approved')),
    });
    const body = await json(response);

    // A refusal is a recorded outcome, not a server fault.
    assert.equal(response.status, 409);
    assert.equal(body.code, 'guard_failed');
    assert.equal(body.reason, 'G4 (T4): plan hash mismatch');
    await harness.close();
  });

  it('rejects a malformed event body before it reaches the ledger', async () => {
    let reached = false;
    const store = {
      append: async () => {
        reached = true;
        throw new Error('should not be reached');
      },
    } as unknown as PostgresLedgerStore;

    const harness = start(reachablePool, store);
    const response = await fetch(`${harness.url}/rooms/${ROOM}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'plan.approved' }),
    });

    assert.equal(response.status, 400);
    assert.equal(reached, false);
    await harness.close();
  });

  it('leaves lifecycle judgement to the reducer rather than pre-judging the event name', async () => {
    // A body that is well-SHAPED but names an event the vocabulary does not
    // contain must reach the ledger, so the refusal carries the reducer's
    // `unknown_event` code and is recorded — not a 400 the ledger never saw.
    let seen: string | null = null;
    const store = {
      append: async (_room: string, event: { event: string }) => {
        seen = event.event;
        return {
          ok: false as const,
          outcome: 'rejected' as const,
          code: 'unknown_event' as const,
          reason: 'not a canonical event: made.up',
          state: initialLedger(),
        };
      },
    } as unknown as PostgresLedgerStore;

    const harness = start(reachablePool, store);
    const response = await fetch(`${harness.url}/rooms/${ROOM}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...makeEvent('plan.approved'), event: 'made.up' }),
    });

    assert.equal(response.status, 409);
    assert.equal(seen, 'made.up');
    assert.equal((await json(response)).code, 'unknown_event');
    await harness.close();
  });
});
