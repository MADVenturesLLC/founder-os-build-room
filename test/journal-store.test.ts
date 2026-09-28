/**
 * `JournalStore` without a database: the seq-race retry bound.
 *
 * Review finding on PR #78 (fixed under Founder authorization): the option
 * was stored unvalidated, so `Infinity` could loop forever under contention
 * and `NaN` or a negative value would skip attempts and report a
 * nonsensical count. The constructor now refuses anything but a finite
 * integer >= 0, and the second block here proves the accepted value
 * actually bounds the attempts, using a pool that answers the head read
 * and refuses every routine call as a seq race.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import type { GovernedCommandRequest } from '../packages/journal/src/index.js';
import {
  DEFAULT_MAX_SEQ_RACE_RETRIES,
  JOURNAL_RUNTIME_ROLE,
  JournalContendedError,
  JournalRuntimeNotAuthorizedError,
  JournalStore,
} from '../packages/control-plane/src/journal-store.js';

/** Construction must never touch the pool. */
const untouchablePool = {
  connect: async () => {
    throw new Error('construction reached the pool');
  },
  query: async () => {
    throw new Error('construction reached the pool');
  },
  on: () => undefined,
  end: async () => undefined,
} as unknown as Pool;

/** Answers the head read at seq 0 and refuses every routine call as the benign seq race. */
function alwaysRacingPool(): { pool: Pool; calls: { headReads: number; routineCalls: number } } {
  const calls = { headReads: 0, routineCalls: 0 };
  const query = async (sql: string): Promise<{ rows: unknown[]; rowCount: number }> => {
    if (/SELECT session_user/.test(sql)) {
      return { rows: [{ session_user: JOURNAL_RUNTIME_ROLE, current_user: JOURNAL_RUNTIME_ROLE }], rowCount: 1 };
    }
    if (/FROM public\.command_journal_chain_head/.test(sql)) {
      calls.headReads += 1;
      return { rows: [{ seq: '0' }], rowCount: 1 };
    }
    if (/public\.command_journal_append\(/.test(sql)) {
      calls.routineCalls += 1;
      throw Object.assign(
        new Error('command_journal_append: seq 1 is not the next position (2 expected) — divergence, append aborted'),
        { code: '23000' },
      );
    }
    throw new Error('unexpected statement');
  };
  const client = { query, release: () => undefined };
  return {
    pool: { query, connect: async () => client, on: () => undefined, end: async () => undefined } as unknown as Pool,
    calls,
  };
}

function request(): GovernedCommandRequest {
  return {
    commandKind: 'planner.invoke',
    argv: ['--goal', 'bound the retries'],
    actorId: 'session:test/journal-store-unit',
    roleId: 'builder',
    authorizationRef: 'HO-20260927-01',
    repository: 'example-org/example-repo',
    scopeRef: 'scope/phase4',
    intendedProvider: 'example-provider',
    intendedModel: 'example-model',
    intendedSurface: 'claude-code',
    commandId: 'cmd_unit_bound',
  };
}

describe('journal store — maxSeqRaceRetries is validated at construction', () => {
  for (const [label, value] of [
    ['Infinity', Infinity],
    ['NaN', NaN],
    ['a negative number', -1],
    ['a non-integer', 1.5],
    ['a numeric string', '3'],
    ['null', null],
  ] as const) {
    it(`refuses ${label} with a RangeError, before touching the pool`, () => {
      assert.throws(
        () => new JournalStore(untouchablePool, { maxSeqRaceRetries: value as unknown as number }),
        (err: unknown) => err instanceof RangeError && /maxSeqRaceRetries/.test(err.message),
      );
    });
  }

  for (const value of [0, 1, 5, 20]) {
    it(`accepts ${value}`, () => {
      assert.doesNotThrow(() => new JournalStore(untouchablePool, { maxSeqRaceRetries: value }));
    });
  }

  it('accepts an absent or undefined option and the default satisfies its own rule', () => {
    assert.doesNotThrow(() => new JournalStore(untouchablePool));
    assert.doesNotThrow(() => new JournalStore(untouchablePool, { maxSeqRaceRetries: undefined }));
    assert.ok(Number.isInteger(DEFAULT_MAX_SEQ_RACE_RETRIES) && DEFAULT_MAX_SEQ_RACE_RETRIES >= 0);
  });
});

/** Answers the identity latch with the given pair and records every other statement, which must never arrive. */
function identityPool(sessionUser: string, currentUser: string): { pool: Pool; others: string[] } {
  const others: string[] = [];
  const query = async (sql: string): Promise<{ rows: unknown[]; rowCount: number }> => {
    if (/SELECT session_user/.test(sql)) return { rows: [{ session_user: sessionUser, current_user: currentUser }], rowCount: 1 };
    others.push(sql);
    throw new Error('a journal statement was issued past the identity latch');
  };
  const client = { query, release: () => undefined };
  return { pool: { query, connect: async () => client, on: () => undefined, end: async () => undefined } as unknown as Pool, others };
}

describe('journal store — the identity latch refuses any role but br_app_runtime before any journal statement', () => {
  for (const [label, sessionUser, currentUser] of [
    ['an owner-class login', 'example_owner_login', 'example_owner_login'],
    ['an owner-class login that SET ROLEd into the runtime (current_user matches, session_user does not)', 'example_owner_login', JOURNAL_RUNTIME_ROLE],
    ['the runtime login SET ROLEd elsewhere (session_user matches, current_user does not)', JOURNAL_RUNTIME_ROLE, 'example_other_role'],
    ['a superuser', 'postgres', 'postgres'],
  ] as const) {
    it(`refuses ${label} with JournalRuntimeNotAuthorizedError and issues no head read and no routine call`, async () => {
      const { pool, others } = identityPool(sessionUser, currentUser);
      const store = new JournalStore(pool, { now: () => new Date('2026-09-27T12:00:00.000Z') });
      await assert.rejects(
        store.appendJournaled(request()),
        (err: unknown) => err instanceof JournalRuntimeNotAuthorizedError && /connected role is not br_app_runtime/.test(err.message),
      );
      assert.deepEqual(others, [], 'nothing was issued past the latch');
    });
  }

  it('refuses when the identity query returns no row', async () => {
    const query = async (): Promise<{ rows: unknown[]; rowCount: number }> => ({ rows: [], rowCount: 0 });
    const client = { query, release: () => undefined };
    const pool = { query, connect: async () => client, on: () => undefined, end: async () => undefined } as unknown as Pool;
    await assert.rejects(new JournalStore(pool).appendJournaled(request()), JournalRuntimeNotAuthorizedError);
  });
});

describe('journal store — the accepted bound actually bounds the attempts', () => {
  for (const retries of [0, 2]) {
    it(`with maxSeqRaceRetries ${retries}, a race on every attempt makes exactly ${retries + 1} routine calls and then reports contended`, async () => {
      const { pool, calls } = alwaysRacingPool();
      const store = new JournalStore(pool, { maxSeqRaceRetries: retries, now: () => new Date('2026-09-27T12:00:00.000Z') });
      await assert.rejects(
        store.appendJournaled(request()),
        (err: unknown) => err instanceof JournalContendedError && err.attempts === retries + 1,
      );
      assert.equal(calls.routineCalls, retries + 1);
      assert.equal(calls.headReads, retries + 1, 'every attempt re-read the head');
    });
  }
});
