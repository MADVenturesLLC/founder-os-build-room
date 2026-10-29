/**
 * The complete journal writer over a genuine `br_app_runtime` LOGIN: every
 * command event after `journaled`, decision records in a caller's
 * transaction, the cross-row rules at append time, the completion test's
 * resolver, and `verify()` / `reconstruct()` over the stored bytes alone.
 *
 * FIXTURE: an exclusively owned disposable PostgreSQL instance
 * (`test/support/owned-postgres.ts`) with the full canonical migration
 * sequence applied, as the sibling journal suites do. `TEST_DATABASE_URL` is
 * only the storage-suite run gate. The runtime login authenticates with a
 * per-run password set in memory and never written anywhere.
 *
 * What is proven, in order: the direct path and its derived state; every
 * `completed` refusal of the authorization test, with nothing written; a
 * sequence the rules refuse writes nothing; two concurrent terminal events
 * for one command leave exactly one; a decision commits with the lifecycle
 * event its own transaction wrote, and with nothing else (a lifecycle event
 * from another transaction, a missing one, a different act, an unjournaled
 * command); a rolled-back caller transaction leaves neither row; a client
 * with no transaction is refused; a seq race inside a caller's transaction is
 * retried at its savepoint and the caller's own write survives it; and
 * `verify()` finds a chain-hash tamper, a column that disagrees with its
 * bytes and a stale head, then passes on the restored chain, which
 * `reconstruct()` returns whole.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pgDefault from 'pg';
import type { Client as PgClient, Pool as PgPool, PoolClient, QueryResult } from 'pg';
import { REVOKE_RUNTIME_GRANTS_SQL } from './support/runtime-role-cleanup.js';
import {
  destroyOwnedInstance,
  resolveServerBinaries,
  startOwnedInstance,
  type OwnedInstance,
} from './support/owned-postgres.js';
import {
  encodeCommandEventRow,
  encodeCommandEventRowV2,
  envelopeDigest,
  normalizeForJournal,
  type GovernedCommandRequest,
} from '../packages/journal/src/index.js';
import {
  JournalCompletionRefusedError,
  JournalLifecycleReferenceError,
  JournalSequenceError,
  JournalStore,
  JournalTransactionRequiredError,
  type AuthorizationCoverage,
  type CompletionAuthorizationQuery,
  type LaterCommandEvent,
} from '../packages/control-plane/src/journal-store.js';

const { Client, Pool } = pgDefault;

const BINS = resolveServerBinaries();
const RUN_GATE = process.env['TEST_DATABASE_URL'];
const SKIP_REASON =
  BINS === undefined
    ? 'PostgreSQL server binaries not resolvable — the journal-writer suite did not run (set BUILDROOM_TEST_PG_BINDIR)'
    : RUN_GATE === undefined || RUN_GATE.trim() === ''
      ? 'TEST_DATABASE_URL is not set — the storage suite did not run'
      : false;

const DATABASE = 'br_journal_writer';
const now = (): Date => new Date('2026-10-15T09:00:00.000Z');

let instance: OwnedInstance | undefined;
let admin: PgClient | undefined;
let runtimePool: PgPool | undefined;
let runtimePassword = '';

/** The resolver's answer for the next completion, and every query it was asked. */
let coverage: AuthorizationCoverage = 'covers';
const asked: CompletionAuthorizationQuery[] = [];
let store: JournalStore | undefined;
let unresolvedStore: JournalStore | undefined;

before(async () => {
  if (SKIP_REASON !== false) return;
  instance = await startOwnedInstance(BINS!);
  const boot = new Client({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: 'postgres' });
  await boot.connect();
  await boot.query(`CREATE DATABASE ${DATABASE}`);
  await boot.end();

  admin = new Client({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: DATABASE });
  await admin.connect();
  const { migrate } = await import('../packages/control-plane/src/migrations.js');
  const migrator = new Pool({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: DATABASE, max: 1 });
  try {
    await migrate(migrator);
  } finally {
    await migrator.end();
  }
  runtimePassword = randomBytes(24).toString('base64url');
  await admin.query(`ALTER ROLE br_app_runtime PASSWORD '${runtimePassword.replace(/'/g, "''")}'`);
  runtimePool = new Pool({
    host: '127.0.0.1',
    port: instance.port,
    user: 'br_app_runtime',
    password: runtimePassword,
    database: DATABASE,
    max: 8,
  });
  store = new JournalStore(runtimePool, {
    now,
    resolveCompletionAuthorization: async (query) => {
      asked.push(query);
      return coverage;
    },
  });
  unresolvedStore = new JournalStore(runtimePool, { now });
});

after(async () => {
  await runtimePool?.end().catch(() => undefined);
  if (admin !== undefined) {
    try {
      await admin.end();
    } catch {
      // the instance is destroyed next either way
    }
  }
  if (instance !== undefined && instance.started) {
    const cleanup = new Client({ host: '127.0.0.1', port: instance.port, user: 'postgres', database: 'postgres' });
    try {
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
      for (const role of ['br_app_runtime', 'command_journal_writer', 'br_journal_owner']) {
        await cleanup.query(`DROP ROLE IF EXISTS ${role}`).catch(async () => {
          await cleanup.query(REVOKE_RUNTIME_GRANTS_SQL).catch(() => undefined);
        });
      }
    } finally {
      await cleanup.end().catch(() => undefined);
    }
  }
  destroyOwnedInstance(instance);
});

/* ---------------- fixtures ---------------- */

function request(commandId: string): GovernedCommandRequest {
  return {
    commandKind: 'planner.invoke',
    argv: ['--goal', `case ${commandId}`],
    actorId: 'session:test/journal-writer',
    roleId: 'builder',
    authorizationRef: 'auth_writer_example',
    repository: 'example-org/example-repo',
    scopeRef: 'scope/phase4',
    intendedProvider: 'example-provider',
    intendedModel: 'example-model',
    intendedSurface: 'claude-code',
    evidenceRefs: [],
    commandId,
  };
}

const later = (commandId: string, event: Omit<LaterCommandEvent, 'commandId' | 'evidenceRefs'> & Partial<LaterCommandEvent>): LaterCommandEvent => ({
  commandId,
  evidenceRefs: [],
  ...event,
});

const dispatched = (commandId: string, provider = 'example-provider'): LaterCommandEvent =>
  later(commandId, { eventType: 'dispatched', provider, model: 'example-model', executionSurface: 'claude-code' });

async function head(): Promise<{ seq: string; chainHash: string }> {
  const { rows } = await admin!.query<{ seq: string; chain_hash: string }>(
    'SELECT seq::text AS seq, chain_hash FROM public.command_journal_chain_head WHERE head_id = 1',
  );
  return { seq: rows[0]!.seq, chainHash: rows[0]!.chain_hash };
}

async function count(commandId: string): Promise<number> {
  const { rows } = await admin!.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM public.command_journal_events WHERE command_id = $1',
    [commandId],
  );
  return rows[0]?.n ?? 0;
}

async function newRoom(): Promise<string> {
  const roomId = randomUUID();
  await admin!.query('INSERT INTO build_room_rooms (room_id) VALUES ($1)', [roomId]);
  return roomId;
}

/** A committed T5-shaped transition row, inserted on whatever client the caller passes. */
async function insertLifecycle(
  client: PgClient | PoolClient,
  roomId: string,
  seq: number,
  eventId: string,
  event = 'plan.approved',
  fromState = 'PLAN_REVIEW',
): Promise<void> {
  await client.query(
    `INSERT INTO build_room_events (
       room_id, seq, event_id, event, outcome, entry_seq, transition_id, guard_id,
       from_state, resulting_state, actor, attribution, scope, evidence, overlays, round, occurred_at, payload
     ) VALUES ($1, $2, $3, $4, 'transition', $6, 'T5', 'G5', $5, 'APPROVED', '{}', '{}', '{}', '[]', '{}', 0, now(), '{}')`,
    [roomId, seq, eventId, event, fromState, seq],
  );
}

function decision(commandId: string, roomId: string, eventId: string) {
  return {
    commandId,
    decision: 'plan.approved' as const,
    recordedState: 'PLAN_REVIEW' as const,
    planHash: 'a'.repeat(64),
    authorizationRef: 'founder-comment-example',
    lifecycleEventRef: { roomId, eventId },
  };
}

/** A pooled runtime connection the test drives a transaction on. */
async function withRuntimeTransaction<T>(body: (client: PoolClient) => Promise<T>, finish: 'COMMIT' | 'ROLLBACK' = 'COMMIT'): Promise<T> {
  const client = await runtimePool!.connect();
  try {
    await client.query('BEGIN');
    const result = await body(client);
    await client.query(finish);
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/* ---------------- the suite ---------------- */

describe('journal writer — the command path (contract §5.2, §5.3)', { skip: SKIP_REASON }, () => {
  it('appends journaled → identity_bound → dispatched → completed, asks the resolver once, and derives completed', async () => {
    const id = 'cmd_jw_direct';
    await store!.appendJournaled(request(id));
    await store!.appendCommandEvent(later(id, { eventType: 'identity_bound', runId: 'run_jw_1' }));
    await store!.appendCommandEvent(dispatched(id));
    asked.length = 0;
    coverage = 'covers';
    const done = await store!.appendCommandEvent(later(id, { eventType: 'completed', evidenceRefs: ['ev_jw_1'] }));
    assert.equal(done.eventType, 'completed');
    assert.equal(asked.length, 1, 'the resolver was asked exactly once');
    assert.deepEqual(asked[0], {
      commandId: id,
      authorizationRef: 'auth_writer_example',
      repository: 'example-org/example-repo',
      scopeRef: 'scope/phase4',
      runId: 'run_jw_1',
      intended: { provider: 'example-provider', model: 'example-model', executionSurface: 'claude-code' },
      observed: { provider: 'example-provider', model: 'example-model', executionSurface: 'claude-code' },
    });
    const history = await store!.commandHistory(id);
    assert.deepEqual(history.state, { dispatchState: 'completed', outcome: 'completed' });
    assert.deepEqual(history.entries.map((e) => (e.decoded.recordClass === 'command' ? e.decoded.row.eventType : '?')), [
      'journaled', 'identity_bound', 'dispatched', 'completed',
    ]);
  });

  for (const [label, answer, expected] of [
    ['with no resolver configured', null, 'no_resolver'],
    ['when the authorization does not cover the route', 'does_not_cover', 'does_not_cover'],
    ['when coverage is indeterminate', 'indeterminate', 'indeterminate'],
  ] as const) {
    it(`refuses completed ${label}, and writes nothing`, async () => {
      const id = `cmd_jw_refuse_${expected}`;
      await store!.appendJournaled(request(id));
      await store!.appendCommandEvent(dispatched(id));
      const before = await head();
      const writer = answer === null ? unresolvedStore! : store!;
      coverage = answer ?? 'covers';
      await assert.rejects(
        writer.appendCommandEvent(later(id, { eventType: 'completed' })),
        (err: unknown) => err instanceof JournalCompletionRefusedError && err.coverage === expected,
      );
      assert.equal(await count(id), 2, 'only journaled and dispatched');
      assert.deepEqual(await head(), before, 'the head did not move');
      coverage = 'covers';
    });
  }

  it('a completed determination through resolved passes the same test', async () => {
    const id = 'cmd_jw_resolved';
    await store!.appendJournaled(request(id));
    await store!.appendCommandEvent(dispatched(id, 'substitute-provider'));
    await store!.appendCommandEvent(later(id, { eventType: 'unresolved' }));
    coverage = 'does_not_cover';
    await assert.rejects(
      store!.appendCommandEvent(later(id, { eventType: 'resolved', resolutionDetermination: 'completed', resolutionSemantics: 'reconciled' })),
      JournalCompletionRefusedError,
    );
    coverage = 'covers';
    await store!.appendCommandEvent(later(id, { eventType: 'resolved', resolutionDetermination: 'completed', resolutionSemantics: 'reconciled' }));
    assert.deepEqual((await store!.commandHistory(id)).state, { dispatchState: 'resolved', outcome: 'completed' });
  });

  it('refuses a sequence the rules forbid, and writes nothing', async () => {
    const before = await head();
    await assert.rejects(store!.appendCommandEvent(dispatched('cmd_jw_never_journaled')), (err: unknown) =>
      err instanceof JournalSequenceError && /begins with journaled/.test(err.reason));
    const id = 'cmd_jw_divergent';
    await store!.appendJournaled(request(id));
    await store!.appendCommandEvent(dispatched(id, 'other-provider'));
    await assert.rejects(store!.appendCommandEvent(later(id, { eventType: 'completed' })), (err: unknown) =>
      err instanceof JournalSequenceError && /diverges/.test(err.reason));
    assert.equal(await count('cmd_jw_never_journaled'), 0);
    assert.equal(await count(id), 2);
    assert.equal(BigInt((await head()).seq), BigInt(before.seq) + 2n, 'only the two legitimate appends advanced the head');
  });

  it('two concurrent terminal events for one command leave exactly one', async () => {
    const id = 'cmd_jw_terminal_race';
    await store!.appendJournaled(request(id));
    await store!.appendCommandEvent(dispatched(id));
    const outcomes = await Promise.allSettled([
      store!.appendCommandEvent(later(id, { eventType: 'completed' })),
      store!.appendCommandEvent(later(id, { eventType: 'failed', failureClassification: 'provider_error' })),
      store!.appendCommandEvent(later(id, { eventType: 'unresolved' })),
    ]);
    assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1, 'one terminal event won');
    for (const lost of outcomes.filter((o) => o.status === 'rejected')) {
      assert.ok((lost as PromiseRejectedResult).reason instanceof JournalSequenceError);
    }
    assert.equal(await count(id), 3);
  });
});

describe('journal writer — decisions commit with their own lifecycle event (contract §1.4)', { skip: SKIP_REASON }, () => {
  it('a decision and the lifecycle event its transaction wrote commit together', async () => {
    const id = 'cmd_jw_planner_ok';
    await store!.appendJournaled(request(id));
    const roomId = await newRoom();
    const appended = await withRuntimeTransaction(async (client) => {
      await insertLifecycle(client, roomId, 1, 'evt_jw_ok');
      return store!.inTransaction(client).appendDecision(decision(id, roomId, 'evt_jw_ok'));
    });
    assert.equal(appended.recordClass, 'decision');
    const history = await store!.commandHistory(id);
    assert.deepEqual(history.entries.map((e) => e.decoded.recordClass), ['command', 'decision']);
    const row = history.entries[1]!.decoded;
    assert.ok(row.recordClass === 'decision');
    assert.equal(row.row.actorId, 'founder');
    assert.deepEqual(row.row.lifecycleEventRef, { roomId, eventId: 'evt_jw_ok' });
  });

  it('a rolled-back caller transaction leaves neither the lifecycle event nor the decision', async () => {
    const id = 'cmd_jw_planner_rollback';
    await store!.appendJournaled(request(id));
    const roomId = await newRoom();
    const before = await head();
    await withRuntimeTransaction(async (client) => {
      await insertLifecycle(client, roomId, 1, 'evt_jw_rb');
      await store!.inTransaction(client).appendDecision(decision(id, roomId, 'evt_jw_rb'));
    }, 'ROLLBACK');
    assert.equal(await count(id), 1, 'only journaled');
    assert.deepEqual(await head(), before);
    const { rows } = await admin!.query('SELECT 1 FROM build_room_events WHERE room_id = $1', [roomId]);
    assert.equal(rows.length, 0);
  });

  it('refuses a lifecycle event another transaction committed, and leaves the caller transaction usable', async () => {
    const id = 'cmd_jw_planner_foreign';
    await store!.appendJournaled(request(id));
    const roomId = await newRoom();
    await insertLifecycle(admin!, roomId, 1, 'evt_jw_foreign');
    await withRuntimeTransaction(async (client) => {
      await assert.rejects(
        store!.inTransaction(client).appendDecision(decision(id, roomId, 'evt_jw_foreign')),
        (err: unknown) => err instanceof JournalLifecycleReferenceError && /not written by this transaction/.test(err.reason),
      );
      const usable = await client.query<{ one: number }>('SELECT 1 AS one');
      assert.equal(usable.rows[0]?.one, 1, 'the refusal rolled back to its savepoint only');
    }, 'ROLLBACK');
    assert.equal(await count(id), 1);
  });

  it('refuses a missing lifecycle event, a different act, and a different state', async () => {
    const id = 'cmd_jw_planner_mismatch';
    await store!.appendJournaled(request(id));
    const roomId = await newRoom();
    await withRuntimeTransaction(async (client) => {
      const tx = store!.inTransaction(client);
      await assert.rejects(tx.appendDecision(decision(id, roomId, 'evt_jw_missing')), /no such lifecycle event/);
      await insertLifecycle(client, roomId, 1, 'evt_jw_other_act', 'plan.revision_requested');
      await assert.rejects(tx.appendDecision(decision(id, roomId, 'evt_jw_other_act')), /a different act/);
      await insertLifecycle(client, roomId, 2, 'evt_jw_other_state', 'plan.approved', 'PLANNING');
      await assert.rejects(tx.appendDecision(decision(id, roomId, 'evt_jw_other_state')), /different state/);
    }, 'ROLLBACK');
    assert.equal(await count(id), 1);
  });

  it('refuses a decision bound to a command that was never journaled', async () => {
    const roomId = await newRoom();
    await withRuntimeTransaction(async (client) => {
      await insertLifecycle(client, roomId, 1, 'evt_jw_orphan');
      await assert.rejects(
        store!.inTransaction(client).appendDecision(decision('cmd_jw_no_such_planner', roomId, 'evt_jw_orphan')),
        (err: unknown) => err instanceof JournalSequenceError && /not journaled before it/.test(err.reason),
      );
    }, 'ROLLBACK');
    assert.equal(await count('cmd_jw_no_such_planner'), 0);
  });

  it('refuses a client that is not in a transaction, before the routine is called', async () => {
    const id = 'cmd_jw_no_tx';
    await store!.appendJournaled(request(id));
    const before = await head();
    const client = await runtimePool!.connect();
    try {
      await assert.rejects(store!.inTransaction(client).appendCommandEvent(dispatched(id)), JournalTransactionRequiredError);
    } finally {
      client.release();
    }
    assert.equal(await count(id), 1);
    assert.deepEqual(await head(), before);
  });

  it('a seq race inside a caller transaction is retried at the savepoint; the caller write before it survives', async () => {
    const id = 'cmd_jw_tx_race';
    await store!.appendJournaled(request(id));
    const roomId = await newRoom();
    let fired = false;
    const competitorId = 'cmd_jw_tx_race_competitor';
    const raw = await runtimePool!.connect();
    const racing = {
      query: async (sql: string, params?: unknown[]): Promise<QueryResult> => {
        const result = await raw.query(sql, params);
        if (!fired && /FROM public\.command_journal_chain_head/.test(sql)) {
          fired = true;
          // A competing append around the store, on its own connection, committed now.
          const seq = String(BigInt((result.rows[0] as { seq: string }).seq) + 1n);
          const envelope = normalizeForJournal(request(competitorId));
          const bytes = encodeCommandEventRowV2({
            ...request(competitorId),
            seq,
            eventType: 'journaled',
            commandId: competitorId,
            commandEnvelope: envelope,
            envelopeDigest: envelopeDigest(envelope),
            evidenceRefs: [],
            recordedAt: '2026-10-15T09:00:00.000000Z',
          } as never);
          const other = await runtimePool!.connect();
          try {
            await other.query(`SELECT 1 FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`, [competitorId, seq, Buffer.from(bytes)]);
          } finally {
            other.release();
          }
        }
        return result;
      },
      release: () => raw.release(),
    } as unknown as PoolClient;
    try {
      await racing.query('BEGIN');
      await insertLifecycle(racing, roomId, 1, 'evt_jw_race');
      await store!.inTransaction(racing).appendDecision(decision(id, roomId, 'evt_jw_race'));
      await racing.query('COMMIT');
    } catch (error) {
      await raw.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      racing.release();
    }
    assert.ok(fired, 'the race was forced');
    assert.equal(await count(competitorId), 1);
    assert.equal(await count(id), 2, 'journaled and the decision');
    const { rows } = await admin!.query('SELECT 1 FROM build_room_events WHERE room_id = $1', [roomId]);
    assert.equal(rows.length, 1, 'the lifecycle event the caller wrote before the race survived it');
  });
});

describe('journal writer — verify() and reconstruct() over the stored bytes (contract §4.1)', { skip: SKIP_REASON }, () => {
  async function tamper(sql: string, params: unknown[]): Promise<void> {
    await admin!.query('ALTER TABLE public.command_journal_events DISABLE TRIGGER command_journal_events_append_only');
    try {
      await admin!.query(sql, params);
    } finally {
      await admin!.query('ALTER TABLE public.command_journal_events ENABLE TRIGGER command_journal_events_append_only');
    }
  }

  it('passes on the chain the suite has written', async () => {
    const verdict = await store!.verify();
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
    if (verdict.ok) assert.deepEqual({ seq: verdict.headSeq, chainHash: verdict.headChainHash }, await head());
  });

  it('finds a chain-hash tamper at its seq, then passes once restored', async () => {
    const { rows } = await admin!.query<{ seq: string; chain_hash: string }>(
      "SELECT seq::text AS seq, chain_hash FROM public.command_journal_events WHERE command_id = 'cmd_jw_direct' AND event_type = 'dispatched'",
    );
    const target = rows[0]!;
    await tamper('UPDATE public.command_journal_events SET chain_hash = $1 WHERE seq = $2', ['f'.repeat(64), target.seq]);
    try {
      const verdict = await store!.verify();
      assert.deepEqual(verdict, { ok: false, reason: `chain hash mismatch at seq ${target.seq}`, atSeq: target.seq });
      await assert.rejects(store!.reconstruct(), /reconstruct refused/);
    } finally {
      await tamper('UPDATE public.command_journal_events SET chain_hash = $1 WHERE seq = $2', [target.chain_hash, target.seq]);
    }
    assert.equal((await store!.verify()).ok, true);
  });

  it('finds a column that disagrees with its bytes', async () => {
    const { rows } = await admin!.query<{ seq: string }>(
      "SELECT seq::text AS seq FROM public.command_journal_events WHERE command_id = 'cmd_jw_direct' AND event_type = 'completed'",
    );
    const seq = rows[0]!.seq;
    await tamper("UPDATE public.command_journal_events SET event_type = 'failed' WHERE seq = $1", [seq]);
    try {
      const verdict = await store!.verify();
      assert.equal(verdict.ok, false);
      if (!verdict.ok) assert.match(verdict.reason, /event_type column disagrees with its bytes/);
    } finally {
      await tamper("UPDATE public.command_journal_events SET event_type = 'completed' WHERE seq = $1", [seq]);
    }
  });

  it('finds a head that disagrees with the recomputed tail', async () => {
    const good = await head();
    await admin!.query('UPDATE public.command_journal_chain_head SET chain_hash = $1 WHERE head_id = 1', ['e'.repeat(64)]);
    try {
      const verdict = await store!.verify();
      assert.equal(verdict.ok, false);
      if (!verdict.ok) assert.match(verdict.reason, /disagrees with the recomputed tail/);
    } finally {
      await admin!.query('UPDATE public.command_journal_chain_head SET chain_hash = $1 WHERE head_id = 1', [good.chainHash]);
    }
  });

  it('reconstructs every row, in seq order, from genesis to the head', async () => {
    const records = await store!.reconstruct();
    const { seq } = await head();
    assert.equal(records.length, Number(seq));
    records.forEach((record, i) => assert.equal(record.seq, String(i + 1)));
  });

  // Last in the file: the routine appends, and nothing removes the row it appends.
  it('finds a BRJ:c:1 command row appended after BRJ:c:2 ones, at its seq (journal act Amendment 1 B2)', async () => {
    assert.equal((await store!.verify()).ok, true, 'the store wrote BRJ:c:2 rows above, and the chain verifies');
    const commandId = 'cmd_jw_spec_downgrade';
    const seq = String(BigInt((await head()).seq) + 1n);
    const envelope = normalizeForJournal(request(commandId));
    const bytes = encodeCommandEventRow({
      ...request(commandId),
      seq,
      eventType: 'journaled',
      commandId,
      commandEnvelope: envelope,
      envelopeDigest: envelopeDigest(envelope),
      evidenceRefs: [],
      recordedAt: '2026-10-29T09:00:00.000000Z',
    } as never);
    const client = await runtimePool!.connect();
    try {
      await client.query(`SELECT 1 FROM public.command_journal_append('command', $1, 'journaled', $2, $3)`, [commandId, seq, Buffer.from(bytes)]);
    } finally {
      client.release();
    }
    const verdict = await store!.verify();
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.match(verdict.reason, /spec order: row \d+ is a BRJ:c:1 command row after a BRJ:c:2 one/);
      assert.equal(verdict.atSeq, seq);
    }
  });
});
