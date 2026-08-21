/**
 * Phase 2 — the control plane against a real Postgres.
 *
 * Runs only when `TEST_DATABASE_URL` is set, and **says so when it skips**
 * rather than passing silently. A suite that quietly proves less than it
 * appears to is worse than one that admits what it did not run.
 *
 * ```sh
 * TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/buildroom_test npm test
 * ```
 *
 * **`TEST_DATABASE_URL`, deliberately not `DATABASE_URL`.** The latter is the
 * variable the deployed service itself reads. Run `npm test` in any shell that
 * carries the production value — a `.env` sourced by habit, a Railway CLI
 * session, a CI job that exports it for something else — and this suite
 * migrates the production database, writes rooms and events into the live
 * ledger, and fires UPDATE and DELETE at `build_room_events`. The append-only
 * triggers refuse the mutations so history survives, but the test rows do not
 * vanish: they stay in the production ledger and turn up in the next evidence
 * export. A separate variable makes pointing tests at production a deliberate
 * act rather than an ambient one. Raised by CodeRabbit on PR #2.
 *
 * What this covers that the stubbed tests cannot: the schema actually applies,
 * the migrator is genuinely idempotent, append-only is enforced by the
 * database rather than by intention, and — the one that matters most for the
 * Phase 2 run definition — **a fresh process replays the log to the identical
 * state**, which is "survives a restart without data loss" proved at the
 * storage layer rather than inferred from the design.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { createPool } from '../packages/control-plane/src/db.js';
import { migrate } from '../packages/control-plane/src/migrations.js';
import { PostgresLedgerStore, RoomNotFoundError } from '../packages/control-plane/src/store.js';
import { snapshot } from '../packages/ledger/src/index.js';
import { makeEvent } from './helpers.js';

const DATABASE_URL = process.env['TEST_DATABASE_URL'];
// Config requires a shared secret. This suite exercises the store directly
// rather than through the HTTP surface, so the value is never presented — it
// only has to satisfy the loader.
const TEST_TOKEN = 'integration-suite-token-long-enough';
const skip = DATABASE_URL === undefined || DATABASE_URL.trim() === '';
const skipReason = 'TEST_DATABASE_URL is not set — the Postgres integration suite did not run';

let pool: Pool | undefined;
let store: PostgresLedgerStore | undefined;

/**
 * A fresh room per test, per run.
 *
 * An earlier version numbered rooms from a module counter, which restarts with
 * the process — so a second run against the same database reused the same room
 * ids and every assertion about "created", "transition" and "one rejection"
 * failed on collisions with the previous run's rows. It passed once, against a
 * virgin database, and would have failed on the first re-run in CI. Random ids
 * make each run independent of every run before it.
 */
function nextRoomId(): string {
  return randomUUID();
}

before(async () => {
  if (skip) return;
  const config = loadConfig({ DATABASE_URL, CONTROL_PLANE_TOKEN: TEST_TOKEN });
  pool = createPool(config);
  await migrate(pool);
  store = new PostgresLedgerStore(pool);
});

after(async () => {
  await pool?.end();
});

describe('control plane — schema and migrations', { skip: skip ? skipReason : false }, () => {
  it('is idempotent — a second run applies nothing', async () => {
    const second = await migrate(pool!);
    assert.deepEqual(second.applied, [], 'a migrated database should apply nothing');
    assert.ok(second.alreadyApplied.includes('0001_ledger_core'));
  });

  it('created the tables the ledger needs', async () => {
    const { rows } = await pool!.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const tables = rows.map((row) => row.table_name);

    for (const expected of [
      'build_room_events',
      'build_room_rejections',
      'build_room_rooms',
      'schema_migrations',
    ]) {
      assert.ok(tables.includes(expected), `missing table ${expected}`);
    }
  });
});

describe('control plane — the append path', { skip: skip ? skipReason : false }, () => {
  it('creates a room idempotently', async () => {
    const roomId = nextRoomId();
    assert.equal((await store!.createRoom(roomId)).created, true);
    assert.equal((await store!.createRoom(roomId)).created, false, 'a retry must not fail');
  });

  it('commits an accepted transition and reads it back', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);

    const result = await store!.append(roomId, makeEvent('scope.captured'));
    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'transition');

    const view = await store!.loadRoom(roomId);
    assert.equal(view.exists, true);
    assert.equal(view.logLength, 1);
    assert.equal(view.state.entries.length, 1);
  });

  it('enforces INV-4 — a replayed event id commits no second row', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);
    const event = makeEvent('scope.captured');

    const first = await store!.append(roomId, event);
    const second = await store!.append(roomId, event);

    assert.equal(first.outcome, 'transition');
    assert.equal(second.outcome, 'replay');

    const { rows } = await pool!.query<{ count: string }>(
      'SELECT count(*) FROM build_room_events WHERE room_id = $1',
      [roomId],
    );
    assert.equal(rows[0]?.count, '1', 'the replay must not add a row');
  });

  it('records a rejection visibly instead of silently declining', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);

    // `plan.approved` does not fire from ROOM_CREATED; the ledger refuses it.
    const result = await store!.append(roomId, makeEvent('plan.approved'));
    assert.equal(result.ok, false);

    const { rows } = await pool!.query<{ code: string; reason: string }>(
      'SELECT code, reason FROM build_room_rejections WHERE room_id = $1',
      [roomId],
    );
    assert.equal(rows.length, 1, 'the refusal must leave a record');
    assert.equal(rows[0]?.code, 'state_not_in_from_set');
  });

  it('refuses to append to a room that does not exist', async () => {
    await assert.rejects(
      () => store!.append(nextRoomId(), makeEvent('scope.captured')),
      RoomNotFoundError,
    );
  });
});

describe('control plane — append-only is enforced by the database', { skip: skip ? skipReason : false }, () => {
  it('rejects an UPDATE against the event log', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);
    await store!.append(roomId, makeEvent('scope.captured'));

    await assert.rejects(
      () => pool!.query('UPDATE build_room_events SET event = $1 WHERE room_id = $2', ['tampered', roomId]),
      /append-only/,
    );
  });

  it('rejects a DELETE against the event log', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);
    await store!.append(roomId, makeEvent('scope.captured'));

    await assert.rejects(
      () => pool!.query('DELETE FROM build_room_events WHERE room_id = $1', [roomId]),
      /append-only/,
    );

    const { rows } = await pool!.query<{ count: string }>(
      'SELECT count(*) FROM build_room_events WHERE room_id = $1',
      [roomId],
    );
    assert.equal(rows[0]?.count, '1', 'the row must survive the attempt');
  });
});

describe('control plane — survives a restart without data loss', { skip: skip ? skipReason : false }, () => {
  it('a fresh pool and store replay the log to the identical state', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);
    await store!.append(roomId, makeEvent('scope.captured'));

    const before = await store!.loadRoom(roomId);

    /*
     * A new pool and a new store is what a restarted process has: no cached
     * state, only the durable log. This is the Founder's third run condition
     * proved at the storage layer — the deployed run proves it end to end,
     * against a process the platform actually restarted.
     */
    const freshPool = createPool(loadConfig({ DATABASE_URL, CONTROL_PLANE_TOKEN: TEST_TOKEN }));
    try {
      const freshStore = new PostgresLedgerStore(freshPool);
      const after = await freshStore.loadRoom(roomId);

      assert.equal(after.logLength, before.logLength);
      assert.equal(after.state.entries.length, before.state.entries.length);
      assert.deepEqual(snapshot(after.state), snapshot(before.state));
    } finally {
      await freshPool.end();
    }
  });

  it('exports the room ledger for the evidence bundle', async () => {
    const roomId = nextRoomId();
    await store!.createRoom(roomId);
    await store!.append(roomId, makeEvent('scope.captured'));
    await store!.append(roomId, makeEvent('plan.approved')); // rejected, recorded

    const exported = await store!.exportRoom(roomId);

    assert.equal(exported.events.length, 1);
    assert.equal(exported.rejections.length, 1, 'rejections are part of the evidence, not omitted');
    assert.ok(exported.events[0]?.['payload'], 'the stored payload is exportable');
  });
});

describe('control plane — the log position is per room', { skip: skip ? skipReason : false }, () => {
  it('numbers each room independently, gaplessly', async () => {
    const first = nextRoomId();
    const second = nextRoomId();
    await store!.createRoom(first);
    await store!.createRoom(second);

    await store!.append(first, makeEvent('scope.captured'));
    const secondRoomFirstAppend = await store!.append(second, makeEvent('scope.captured'));

    assert.equal(secondRoomFirstAppend.ok, true);
    assert.equal(
      'seq' in secondRoomFirstAppend ? secondRoomFirstAppend.seq : -1,
      1,
      'a second room starts its own sequence at 1',
    );
  });
});
