/**
 * The connection a store hands to a caller's step inside a transaction the
 * store owns, without the means to end that transaction.
 *
 * `PostgresLedgerStore.appendRecorded` writes the recorded lifecycle row,
 * runs the caller's steps on the same connection, and commits only once its
 * own checks hold (journal ruling B3). A step holding the bare `PoolClient`
 * could issue `COMMIT` and make an incomplete write durable before those
 * checks ran, and every statement after it would then run outside any
 * transaction. This wrapper refuses that:
 *
 *   - a statement that ends, or starts, a transaction: `COMMIT`, `END`,
 *     `ROLLBACK` (but not `ROLLBACK TO SAVEPOINT`), `ABORT`, `BEGIN`,
 *     `START TRANSACTION`, and the two-phase forms (`PREPARE TRANSACTION`,
 *     `COMMIT PREPARED`, `ROLLBACK PREPARED`), refused before it is sent;
 *   - more than one statement in one call: every query is sent with the
 *     extended protocol, in which PostgreSQL itself refuses a second
 *     statement, so `SELECT 1; COMMIT` cannot carry one past the check;
 *   - `release()` and `end()`, which would hand the connection back, or close
 *     it, mid-transaction; and callback-style or submittable queries, which
 *     the stores never use.
 *
 * `SAVEPOINT`, `RELEASE SAVEPOINT` and `ROLLBACK TO SAVEPOINT` pass: they act
 * within the transaction, and the journal's joined appends use them. A
 * procedure or `DO` block cannot end a transaction it runs inside (PostgreSQL
 * refuses transaction control in a `CALL` or `DO` within a transaction
 * block), so neither needs a rule here.
 */

import type { PoolClient, QueryConfig } from 'pg';

/** A step tried to end the store's transaction, or to use the connection outside it. */
export class TransactionControlRefusedError extends Error {
  override readonly name = 'TransactionControlRefusedError';
  constructor(what: string) {
    super(`refused inside the store's transaction: ${what}; the store alone ends it`);
  }
}

/** `client`, with everything that could end its transaction refused. */
export function transactionBoundClient(client: PoolClient): PoolClient {
  const query = async (config: unknown, values?: unknown, callback?: unknown): Promise<unknown> => {
    if (typeof values === 'function' || callback !== undefined) throw new TransactionControlRefusedError('a callback-style query');
    let base: Record<string, unknown>;
    if (typeof config === 'string') {
      base = { text: config };
    } else if (
      config !== null
      && typeof config === 'object'
      && typeof (config as { submit?: unknown }).submit !== 'function'
      && typeof (config as { text?: unknown }).text === 'string'
    ) {
      base = { ...(config as Record<string, unknown>) };
    } else {
      throw new TransactionControlRefusedError('a query that is not SQL text');
    }
    if (values !== undefined) base['values'] = values;
    const control = transactionControl(base['text'] as string);
    if (control !== null) throw new TransactionControlRefusedError(control);
    return client.query({ ...base, text: base['text'] as string, queryMode: 'extended' } as QueryConfig);
  };
  const refuse = (what: string) => (): never => {
    throw new TransactionControlRefusedError(what);
  };
  return new Proxy(client, {
    get(target, property) {
      if (property === 'query') return query;
      if (property === 'release') return refuse('release()');
      if (property === 'end') return refuse('end()');
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/**
 * The transaction-control statement `text` begins with, named, or `null`.
 * Reads the leading words only, past whitespace, empty statements (`;`) and
 * comments (`--` up to a line feed or a carriage return, as PostgreSQL's lexer
 * ends one, and `/* *\/`, which PostgreSQL nests).
 */
export function transactionControl(text: string): string | null {
  const words = leadingWords(text, 3);
  const [first, second, third] = words;
  switch (first) {
    case 'COMMIT':
      return second === 'PREPARED' ? 'COMMIT PREPARED' : 'COMMIT';
    case 'END':
    case 'ABORT':
    case 'BEGIN':
      return first;
    case 'START':
      return second === 'TRANSACTION' ? 'START TRANSACTION' : null;
    case 'PREPARE':
      return second === 'TRANSACTION' ? 'PREPARE TRANSACTION' : null;
    case 'ROLLBACK': {
      if (second === 'PREPARED') return 'ROLLBACK PREPARED';
      // ROLLBACK [WORK | TRANSACTION] TO [SAVEPOINT] name stays within.
      const afterNoise = second === 'WORK' || second === 'TRANSACTION' ? third : second;
      return afterNoise === 'TO' ? null : 'ROLLBACK';
    }
    default:
      return null;
  }
}

/** Up to `count` leading words of `text`, upper-cased, skipping whitespace and comments. */
function leadingWords(text: string, count: number): string[] {
  const words: string[] = [];
  let i = 0;
  while (i < text.length && words.length < count) {
    const ch = text[i]!;
    if (/\s/.test(ch) || ch === ';') {
      // An empty statement before a real one parses as that one statement,
      // so a leading `;` must not hide a `COMMIT`.
      i += 1;
    } else if (text.startsWith('--', i)) {
      // PostgreSQL's lexer ends a `--` comment at LF or CR, either one alone.
      i += 2;
      while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i += 1;
    } else if (text.startsWith('/*', i)) {
      let depth = 0;
      while (i < text.length) {
        if (text.startsWith('/*', i)) {
          depth += 1;
          i += 2;
        } else if (text.startsWith('*/', i)) {
          depth -= 1;
          i += 2;
          if (depth === 0) break;
        } else {
          i += 1;
        }
      }
    } else if (/[A-Za-z_]/.test(ch)) {
      let end = i;
      while (end < text.length && /[A-Za-z0-9_$]/.test(text[end]!)) end += 1;
      words.push(text.slice(i, end).toUpperCase());
      i = end;
    } else {
      break;
    }
  }
  return words;
}
