/**
 * The connection `appendRecorded` hands its steps (`transaction-client.ts`).
 *
 * What is proven:
 *   - every statement form that ends or starts a transaction is named, past
 *     whitespace, empty statements and nested comments, and nothing that
 *     acts within the transaction is (savepoints, `ROLLBACK TO`, ordinary
 *     statements, a word that merely begins with a keyword);
 *   - the wrapper sends every query with the extended protocol, keeping its
 *     values and options, so PostgreSQL refuses a second statement in one
 *     call (proven against a real server in
 *     `runtime-room-binding.storage.test.ts`);
 *   - it refuses transaction control, `release()`, `end()`, callback-style
 *     and submittable queries, sending nothing, and passes everything else
 *     through to the connection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import {
  TransactionControlRefusedError,
  transactionBoundClient,
  transactionControl,
} from '../packages/control-plane/src/transaction-client.js';

describe('transaction-client · the statements that end or start a transaction', () => {
  it('names each one, however it is spelled or prefixed', () => {
    const ending: ReadonlyArray<readonly [string, string]> = [
      ['COMMIT', 'COMMIT'],
      ['commit work', 'COMMIT'],
      ['COMMIT AND CHAIN', 'COMMIT'],
      ['END', 'END'],
      ['end transaction', 'END'],
      ['ROLLBACK', 'ROLLBACK'],
      ['ROLLBACK WORK', 'ROLLBACK'],
      ['rollback transaction and no chain', 'ROLLBACK'],
      ['ABORT', 'ABORT'],
      ['BEGIN', 'BEGIN'],
      ['START TRANSACTION', 'START TRANSACTION'],
      ["PREPARE TRANSACTION 'x'", 'PREPARE TRANSACTION'],
      ["COMMIT PREPARED 'x'", 'COMMIT PREPARED'],
      ["ROLLBACK PREPARED 'x'", 'ROLLBACK PREPARED'],
      ['  -- a note\n  COMMIT', 'COMMIT'],
      ['-- a note\rCOMMIT', 'COMMIT'],
      ['-- a note\r\nCOMMIT', 'COMMIT'],
      ['-- one\r-- two\nEND', 'END'],
      ['\f\v\tCOMMIT', 'COMMIT'],
      ['/* a /* nested */ comment */ COMMIT', 'COMMIT'],
      [';COMMIT', 'COMMIT'],
      [' ; ;\tcommit', 'COMMIT'],
    ];
    for (const [text, named] of ending) assert.equal(transactionControl(text), named, JSON.stringify(text));
  });

  it('names nothing that acts within the transaction', () => {
    const within = [
      'SELECT 1',
      'SAVEPOINT journal_append',
      'RELEASE SAVEPOINT journal_append',
      'ROLLBACK TO SAVEPOINT journal_append',
      'rollback to journal_append',
      'ROLLBACK WORK TO SAVEPOINT journal_append',
      'ROLLBACK TRANSACTION TO journal_append',
      'PREPARE q AS SELECT 1',
      'INSERT INTO t VALUES (1)',
      'SELECT pg_advisory_xact_lock($1)',
      'committed_at',
      '-- COMMIT',
      '-- a note ending nowhere COMMIT',
      '/* COMMIT */ SELECT 1',
      '',
      '   ',
    ];
    for (const text of within) assert.equal(transactionControl(text), null, JSON.stringify(text));
  });
});

function fakeClient() {
  const sent: unknown[] = [];
  let released = 0;
  const client = {
    query: async (config: unknown) => {
      sent.push(config);
      return { rows: [], rowCount: 0 };
    },
    release: () => {
      released += 1;
    },
    end: async () => undefined,
    processID: 42,
  } as unknown as PoolClient;
  return { client, sent, released: () => released };
}

describe('transaction-client · the wrapped connection', () => {
  it('sends every query with the extended protocol, keeping its values and options', async () => {
    const { client, sent } = fakeClient();
    const bound = transactionBoundClient(client);
    await bound.query('SELECT 1');
    await bound.query('SELECT $1::int', [2]);
    await bound.query({ text: 'SELECT $1::int', values: [3], rowMode: 'array' });
    await bound.query('SAVEPOINT s');
    await bound.query('ROLLBACK TO SAVEPOINT s');
    assert.deepEqual(sent, [
      { text: 'SELECT 1', queryMode: 'extended' },
      { text: 'SELECT $1::int', values: [2], queryMode: 'extended' },
      { text: 'SELECT $1::int', values: [3], rowMode: 'array', queryMode: 'extended' },
      { text: 'SAVEPOINT s', queryMode: 'extended' },
      { text: 'ROLLBACK TO SAVEPOINT s', queryMode: 'extended' },
    ]);
  });

  it('refuses transaction control, release(), end(), callbacks and submittables, sending nothing; passes the rest through', async () => {
    const { client, sent, released } = fakeClient();
    const bound = transactionBoundClient(client);
    const raw = bound.query as unknown as (...args: unknown[]) => Promise<unknown>;
    await assert.rejects(bound.query('COMMIT'), TransactionControlRefusedError);
    await assert.rejects(bound.query({ text: '/* x */ END' }), TransactionControlRefusedError);
    await assert.rejects(bound.query(';ROLLBACK'), TransactionControlRefusedError);
    await assert.rejects(raw('SELECT 1', () => undefined), TransactionControlRefusedError);
    await assert.rejects(raw('SELECT $1', [1], () => undefined), TransactionControlRefusedError);
    await assert.rejects(raw({ text: 'SELECT 1', submit: () => undefined }), TransactionControlRefusedError);
    await assert.rejects(raw(42), TransactionControlRefusedError);
    assert.throws(() => bound.release(), TransactionControlRefusedError);
    assert.throws(() => (bound as unknown as { end: () => unknown }).end(), TransactionControlRefusedError);
    assert.deepEqual(sent, [], 'nothing reached the connection');
    assert.equal(released(), 0, 'the connection was not released');
    assert.equal((bound as unknown as { processID: number }).processID, 42, 'everything else passes through');
  });
});
