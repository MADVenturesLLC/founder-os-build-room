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
 * `control-plane-postgres.test.ts`, which runs only when `TEST_DATABASE_URL` is
 * set — so the suite is honest about which claims it has actually exercised
 * rather than quietly proving less than it appears to.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { createServer } from '../packages/control-plane/src/server.js';
import { createGatewaySurface, type GatewaySurface } from '../packages/control-plane/src/gateway/index.js';
import type { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { initialLedger } from '../packages/ledger/src/index.js';
import { makeEvent } from './helpers.js';

// The room endpoints now require this on `Authorization: Bearer`. Declared
// before CONFIG because CONFIG reads it.
const TOKEN = 'test-token-that-is-long-enough-to-pass';

const CONFIG = loadConfig({
  DATABASE_URL: 'postgresql://user:secret@host.neon.tech/db?sslmode=require',
  CONTROL_PLANE_TOKEN: TOKEN,
  COMMIT_SHA: 'deadbeef',
  READY_PROBE_TIMEOUT_MS: '500',
});

const ROOM = '11111111-2222-4333-8444-555555555555';

interface Harness {
  readonly url: string;
  readonly close: () => Promise<void>;
  /** The real leadership supervisor, over the stubbed database. */
  readonly gateway: GatewaySurface;
}

const openServers: Server[] = [];

/**
 * A pool stub that answers the handful of statements leadership issues, so the
 * gateway surface in these tests is the REAL one and only the database is
 * stubbed — which is this suite's premise everywhere else too.
 *
 * Faking leadership itself would have been easier and would have proved less:
 * `requireLeader` would then be tested against a fake instead of against the
 * supervisor that actually decides it.
 */
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
        rows: [
          {
            id: 1,
            owner_id: ownerId,
            generation: '1',
            heartbeat_at: new Date(),
            challenge,
            challenge_published_at: new Date(),
          },
        ],
        rowCount: 1,
      };
    }
    if (/SELECT now\(\)/.test(sql)) return { rows: [{ now: new Date() }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };

  const client = {
    query: (sql: string, params?: unknown[]) => answer(sql, params),
    release: () => undefined,
  };

  return {
    query: (sql: string, params?: unknown[]) => answer(sql, params),
    connect: async () => client,
    on: () => undefined,
    end: async () => undefined,
  } as unknown as Pool;
}

const openGateways: GatewaySurface[] = [];

/**
 * Start a server and bring its leadership to a serving state.
 *
 * Async because promotion is: the supervisor acquires the lease, reconciles,
 * and only then sets `servingGeneration`. Room append is leader-gated now
 * (contract §11), so a harness that returned before that would be testing the
 * 503 pre-filter in every case rather than the route.
 */
async function start(pool: Pool, store: PostgresLedgerStore): Promise<Harness> {
  const gateway = createGatewaySurface({
    pool: fakeLeaderPool(),
    config: CONFIG,
    log: () => undefined,
  });
  openGateways.push(gateway);
  const app = createServer({ config: CONFIG, pool, store, startedAt: Date.now(), gateway });
  const server = app.listen(0);
  openServers.push(server);
  const { port } = server.address() as AddressInfo;

  await gateway.leadership.attemptAcquisition();

  return {
    url: `http://127.0.0.1:${port}`,
    gateway,
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

    const harness = await start(pool, emptyStore);
    const response = await fetch(`${harness.url}/health`);

    assert.equal(response.status, 200);
    assert.equal((await json(response)).status, 'ok');
    assert.equal(queried, false, '/health must not depend on the database');
    await harness.close();
  });

  it('/ready reports ready when the database answers', async () => {
    const harness = await start(reachablePool, emptyStore);
    const response = await fetch(`${harness.url}/ready`);
    const body = await json(response);

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ready');
    assert.equal(body.database, 'reachable');
    await harness.close();
  });

  it('/ready reports 503 without leaking the driver error to the caller', async () => {
    /*
     * The response used to spread the probe result, which carries the driver's
     * own message — role names, host names, sometimes the connection target —
     * onto a public URL. Now the detail goes to the log under a correlation id
     * and the caller gets the id. Raised by CodeRabbit on PR #2.
     */
    const harness = await start(unreachablePool, emptyStore);
    const response = await fetch(`${harness.url}/ready`);
    const body = await json(response);

    assert.equal(response.status, 503);
    assert.equal(body.database, 'unreachable');
    assert.equal(typeof body.incidentId, 'string', 'the caller needs a handle for the log entry');
    assert.ok(
      !JSON.stringify(body).includes('connection refused'),
      'the driver error must not reach the client',
    );
    await harness.close();
  });

  it('/version reports the commit it was built from', async () => {
    const harness = await start(reachablePool, emptyStore);
    const body = await json(await fetch(`${harness.url}/version`));

    assert.equal(body.commit, 'deadbeef');
    assert.equal(body.service, '@build-room/control-plane');
    await harness.close();
  });
});

describe('control plane — the room endpoints are not public', () => {
  /*
   * Every route was unauthenticated, on a service with a public Railway URL —
   * so any caller who found it could create rooms, append ledger events, and
   * export a room's whole ledger, actor identities, attribution and evidence
   * payloads included. Raised by CodeRabbit on PR #2.
   *
   * The store below THROWS on any call, so these tests fail if a request gets
   * past the guard even in a case where the status alone would look right.
   */
  const explodingStore = {
    createRoom: async () => {
      throw new Error('the guard let an unauthenticated request through');
    },
    loadRoom: async () => {
      throw new Error('the guard let an unauthenticated request through');
    },
    append: async () => {
      throw new Error('the guard let an unauthenticated request through');
    },
    exportRoom: async () => {
      throw new Error('the guard let an unauthenticated request through');
    },
  } as unknown as PostgresLedgerStore;

  const guarded: ReadonlyArray<readonly [string, string]> = [
    ['POST', '/rooms'],
    ['GET', `/rooms/${ROOM}`],
    ['POST', `/rooms/${ROOM}/events`],
    ['GET', `/rooms/${ROOM}/export`],
  ];

  for (const [method, path] of guarded) {
    it(`answers 401 on ${method} ${path} with no credential`, async () => {
      const harness = await start(reachablePool, explodingStore);
      const response = await fetch(`${harness.url}${path}`, {
        method,
        ...(method === 'POST'
          ? { headers: { 'content-type': 'application/json' }, body: '{}' }
          : {}),
      });

      assert.equal(response.status, 401);
      assert.equal((await json(response)).error, 'unauthorized');
      await harness.close();
    });
  }

  it('answers 401 for a wrong token, and says nothing beyond "unauthorized"', async () => {
    const harness = await start(reachablePool, explodingStore);
    const response = await fetch(`${harness.url}/rooms/${ROOM}`, {
      headers: { authorization: `Bearer ${'w'.repeat(TOKEN.length)}` },
    });
    const body = await json(response);

    assert.equal(response.status, 401);
    // Not "wrong token" versus "missing token" versus "malformed header" —
    // each of those distinctions is a free hint to someone guessing.
    assert.deepEqual(body, { error: 'unauthorized' });
    await harness.close();
  });

  it('answers 401 for a token of the right length but the wrong value', async () => {
    // The constant-time comparison only runs when the lengths match, so this
    // is the case that exercises it rather than the length check in front.
    const wrong = `${TOKEN.slice(0, -1)}${TOKEN.endsWith('x') ? 'y' : 'x'}`;
    assert.equal(wrong.length, TOKEN.length, 'the fixture must be the same length');

    const harness = await start(reachablePool, explodingStore);
    const response = await fetch(`${harness.url}/rooms/${ROOM}`, {
      headers: { authorization: `Bearer ${wrong}` },
    });

    assert.equal(response.status, 401);
    await harness.close();
  });

  it('leaves /health, /ready and /version reachable without a credential', async () => {
    // Railway's health check presents no credential and would fail the deploy
    // if these were guarded; the harness reads /version to prove a restart.
    const harness = await start(reachablePool, explodingStore);

    for (const path of ['/health', '/ready', '/version']) {
      assert.equal((await fetch(`${harness.url}${path}`)).status, 200, `${path} must stay open`);
    }
    await harness.close();
  });
});

describe('control plane — occurredAt is a real RFC3339 instant', () => {
  /*
   * `Date.parse` was the check, and it is far looser than the name suggests:
   * date-only values, offset-less values, non-RFC3339 offsets like `+0530`,
   * and — worst — impossible dates, which it NORMALIZES rather than refuses.
   * `2026-02-30T12:00:00Z` parsed happily as 2 March, and would have been
   * stored verbatim in an append-only ledger as when the event occurred.
   * Raised by CodeRabbit on PR #2.
   */
  let reached = false;
  const watchfulStore = {
    append: async () => {
      reached = true;
      throw new Error('a malformed timestamp reached the ledger');
    },
  } as unknown as PostgresLedgerStore;

  const post = async (occurredAt: string) => {
    reached = false;
    const harness = await start(reachablePool, watchfulStore);
    const response = await fetch(`${harness.url}/rooms/${ROOM}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ ...makeEvent('scope.captured'), occurredAt }),
    });
    await harness.close();
    return response.status;
  };

  const refused: ReadonlyArray<readonly [string, string]> = [
    ['2026-08-17', 'date only'],
    ['2026-08-17T12:00:00', 'no offset'],
    ['2026-08-17T12:00:00+0530', 'offset without a colon'],
    ['2026-02-30T12:00:00Z', 'impossible date that Date.parse normalizes'],
    ['2026-13-01T12:00:00Z', 'month 13'],
    ['2026-08-17T25:00:00Z', 'hour 25'],
    ['2026-08-17T12:00:60Z', 'leap second away from the end of a day'],
    // RFC3339's time-numoffset uses the same 00-23 / 00-59 ranges as the time
    // itself, so these are not offsets. A bare `[+-]\d{2}:\d{2}` waved them
    // through. Raised by CodeRabbit on PR #2.
    ['2026-08-17T12:00:00+24:00', 'offset hour 24'],
    ['2026-08-17T12:00:00+00:60', 'offset minute 60'],
    ['2026-08-17T12:00:00-24:00', 'negative offset hour 24'],
    // Second 60 is judged after the offset is applied, so a leap second that is
    // not at the end of a UTC DAY is refused however it is written.
    ['2026-08-17T12:00:60+01:00', 'second 60 that is 11:00:60 UTC'],
  ];

  for (const [value, why] of refused) {
    it(`refuses ${value} — ${why}`, async () => {
      assert.equal(await post(value), 400);
      assert.equal(reached, false, 'the ledger must not see it');
    });
  }

  it('accepts a Z-normalized instant and a valid numeric offset', async () => {
    // Not 400: these are well-formed, so they reach the ledger — where this
    // stub throws, giving 500. The point is that the shape check let them by.
    assert.equal(await post('2026-08-17T12:00:00Z'), 500);
    assert.equal(await post('2026-08-17T12:00:00.123Z'), 500);
    assert.equal(await post('2026-08-17T12:00:00+05:30'), 500);
    assert.equal(await post('2026-08-17T12:00:00-23:59'), 500, 'the offset bounds themselves');
    assert.equal(await post('2026-06-30T23:59:60Z'), 500, 'a leap second at end of UTC day');
    /*
     * RFC3339 §5.7's own example: the 2016-12-31 leap second seen from a
     * +01:00 offset is 2017-01-01T00:59:60. Checking hour/minute against the
     * LOCAL fields refused this valid form; the offset is applied first now.
     * Raised by CodeRabbit on PR #2.
     */
    assert.equal(await post('2017-01-01T00:59:60+01:00'), 500, 'the same instant, shifted');
    assert.equal(await post('2016-12-31T22:59:60-01:00'), 500, 'and shifted the other way');
  });
});

describe('control plane — an internal failure does not describe itself to the caller', () => {
  it('returns a correlation id, not the error text', async () => {
    /*
     * Postgres errors carry role names, host names, table names and SQL
     * fragments, so echoing `message` turned any failing query into an
     * information-disclosure response. Raised by CodeRabbit on PR #2.
     */
    const store = {
      loadRoom: async () => {
        throw new Error('relation "build_room_rooms" does not exist for role "neondb_owner"');
      },
    } as unknown as PostgresLedgerStore;

    const harness = await start(reachablePool, store);
    const response = await fetch(`${harness.url}/rooms/${ROOM}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    const body = await json(response);

    assert.equal(response.status, 500);
    assert.equal(body.error, 'internal_error');
    assert.equal(typeof body.incidentId, 'string');
    assert.ok(!JSON.stringify(body).includes('neondb_owner'), 'the role name must not reach the client');
    assert.ok(!JSON.stringify(body).includes('build_room_rooms'), 'the table name must not reach the client');
    await harness.close();
  });

  it('still returns author-written messages for client mistakes', async () => {
    // `HttpError` text says only what the caller did wrong, so it stays.
    const harness = await start(reachablePool, emptyStore);
    const response = await fetch(`${harness.url}/rooms/not-a-uuid`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    const body = await json(response);

    assert.equal(response.status, 400);
    assert.match(String(body.message), /must be a UUID/);
    await harness.close();
  });
});

describe('control plane — room surface', () => {
  it('rejects a room id that is not a UUID', async () => {
    const harness = await start(reachablePool, emptyStore);
    const response = await fetch(`${harness.url}/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
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

    const harness = await start(reachablePool, store);
    const response = await fetch(`${harness.url}/rooms/${ROOM}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
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

    const harness = await start(reachablePool, store);
    const response = await fetch(`${harness.url}/rooms/${ROOM}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
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

    const harness = await start(reachablePool, store);
    const response = await fetch(`${harness.url}/rooms/${ROOM}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ ...makeEvent('plan.approved'), event: 'made.up' }),
    });

    assert.equal(response.status, 409);
    assert.equal(seen, 'made.up');
    assert.equal((await json(response)).code, 'unknown_event');
    await harness.close();
  });
});
