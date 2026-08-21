/**
 * The durable ledger store — the control plane's single writer.
 *
 * The pure reducer in `@build-room/ledger` decides; this module is the only
 * thing that persists what it decided. The division is the point: every guard,
 * invariant and rejection code lives in the pure package and is exercised by
 * its own test suite, and nothing here re-implements a rule or relaxes one.
 *
 * Three properties, and how each is obtained:
 *
 * - **Single writer per room.** Every append takes `SELECT ... FOR UPDATE` on
 *   the room row, so two concurrent appends to one room serialize. Different
 *   rooms do not block each other.
 * - **State is a projection.** Nothing caches `LedgerState`. Each append
 *   rebuilds it by replaying the room's log through the reducer, which is what
 *   makes a restart lossless (`DEC-20260815-17` Phase 2 run condition 3) — a
 *   fresh process replays the same log and reaches the same state.
 * - **Rejections are visible.** A rejected event is written to
 *   `build_room_rejections` in the same transaction that declined it, so a
 *   refusal leaves a record rather than a silence (architecture §3.8).
 */

import type { Pool, PoolClient } from 'pg';
import {
  apply,
  applyAll,
  initialLedger,
  type ApplyResult,
  type LedgerEntry,
  type LedgerState,
  type LifecycleEvent,
  type RejectionCode,
} from '../../ledger/src/index.js';

export type AppendOutcome =
  | 'transition'
  | 'conjunction_pending'
  | 'replay'
  | 'rejected'
  | 'not_leader';

export type RoomAppendOutcome<T> =
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'not_leader'; readonly committed: boolean }
  | { readonly status: 'commit_failed'; readonly message: string };

/**
 * The fenced-transaction collaborator a room append runs inside.
 *
 * Injected rather than imported so this module keeps knowing only about the
 * ledger. It supplies two things the ledger cannot: the leader-dependent
 * transaction of contract §7 (L0 -> L1 -> L2, with the three-point demotion
 * discipline), and the `gatewayOnline` derivation of §10.
 *
 * `main.ts` always constructs the store WITH it, and `createServer` cannot be
 * called without a gateway surface — so the room-append route is never mounted
 * without the fence. The collaborator is optional on this constructor only so
 * that the pre-existing Phase 2 ledger suite, which predates the gateway and
 * asserts ledger semantics alone, can exercise the store directly.
 */
export interface RoomAppendFence {
  runRoomAppend<T>(
    body: (
      client: PoolClient,
      deriveGatewayOnline: () => Promise<boolean>,
    ) => Promise<{ readonly value: T; readonly commit: boolean }>,
  ): Promise<RoomAppendOutcome<T>>;
}

export type AppendResult =
  | {
      readonly ok: true;
      readonly outcome: 'transition';
      readonly seq: number;
      readonly entry: LedgerEntry;
      readonly state: LedgerState;
    }
  | {
      readonly ok: true;
      readonly outcome: 'conjunction_pending';
      readonly seq: number;
      readonly awaiting: readonly string[];
      readonly state: LedgerState;
    }
  | {
      readonly ok: true;
      readonly outcome: 'replay';
      readonly entry: LedgerEntry | null;
      readonly state: LedgerState;
    }
  | {
      readonly ok: false;
      readonly outcome: 'rejected';
      readonly code: RejectionCode;
      readonly reason: string;
      readonly state: LedgerState;
    }
  /**
   * The fence refused, or detected a demotion. `committed` is true only for a
   * post-COMMIT detection: the durable append stands and the caller is still
   * told 503, because no pipeline may answer "accepted" after demotion.
   */
  | { readonly ok: false; readonly outcome: 'not_leader'; readonly committed: boolean };

export interface RoomView {
  readonly roomId: string;
  readonly exists: boolean;
  readonly state: LedgerState;
  /** Number of committed log positions, which is not the entry count. */
  readonly logLength: number;
}

export class RoomNotFoundError extends Error {
  override readonly name = 'RoomNotFoundError';
  constructor(roomId: string) {
    super(`room ${roomId} does not exist`);
  }
}

interface EventRow {
  readonly seq: string;
  readonly payload: LifecycleEvent;
}

export class PostgresLedgerStore {
  constructor(
    private readonly pool: Pool,
    private readonly fence?: RoomAppendFence,
  ) {}

  /**
   * Create a room. Idempotent: creating an existing room reports
   * `created: false` rather than failing, so a retried request is safe.
   */
  async createRoom(roomId: string): Promise<{ readonly created: boolean }> {
    const { rowCount } = await this.pool.query(
      'INSERT INTO build_room_rooms (room_id) VALUES ($1) ON CONFLICT (room_id) DO NOTHING',
      [roomId],
    );
    return { created: rowCount === 1 };
  }

  /** Replay a room's log into current state. Read-only. */
  async loadRoom(roomId: string): Promise<RoomView> {
    const client = await this.pool.connect();
    try {
      const exists = await roomExists(client, roomId);
      if (!exists) {
        return { roomId, exists: false, state: initialLedger(), logLength: 0 };
      }
      const { state, logLength } = await replay(client, roomId);
      return { roomId, exists: true, state, logLength };
    } finally {
      client.release();
    }
  }

  /**
   * Offer one event to the room's ledger and persist whatever the reducer
   * decided. The reducer's verdict is final — this method never overrides an
   * acceptance or a rejection, only records it.
   */
  async append(roomId: string, event: LifecycleEvent): Promise<AppendResult> {
    if (this.fence !== undefined) return this.appendFenced(roomId, event);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.runAppendBody(client, roomId, event, null);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * The same append, inside the leader-dependent fenced transaction, with the
   * `gatewayOnline` overlay derived rather than believed (contract §10).
   */
  private async appendFenced(roomId: string, event: LifecycleEvent): Promise<AppendResult> {
    const fence = this.fence;
    if (fence === undefined) throw new Error('appendFenced called without a fence');

    let notFound = false;
    const outcome = await fence.runRoomAppend<AppendResult | null>(async (client, derive) => {
      try {
        const result = await this.runAppendBody(client, roomId, event, derive);
        return { value: result, commit: true };
      } catch (error) {
        if (error instanceof RoomNotFoundError) {
          notFound = true;
          return { value: null, commit: false };
        }
        throw error;
      }
    });

    if (notFound) throw new RoomNotFoundError(roomId);
    if (outcome.status === 'not_leader') {
      return { ok: false, outcome: 'not_leader', committed: outcome.committed };
    }
    if (outcome.status === 'commit_failed') {
      throw new Error(`room append commit failed: ${outcome.message}`);
    }
    if (outcome.value === null) throw new RoomNotFoundError(roomId);
    return outcome.value;
  }

  /**
   * Everything an append does between BEGIN and COMMIT.
   *
   * Factored out so the plain and fenced paths cannot drift: the ledger rules,
   * the replay, the rejection record and the insert are one body, and the only
   * difference between the two callers is what surrounds it.
   */
  private async runAppendBody(
    client: PoolClient,
    roomId: string,
    event: LifecycleEvent,
    deriveGatewayOnline: (() => Promise<boolean>) | null,
  ): Promise<AppendResult> {
    {
      // Serializes writers for this room. Also proves the room exists. This is
      // L3, and it is taken last, after L0, L1 and L2 (contract §13).
      const locked = await client.query('SELECT room_id FROM build_room_rooms WHERE room_id = $1 FOR UPDATE', [
        roomId,
      ]);
      if (locked.rowCount === 0) {
        throw new RoomNotFoundError(roomId);
      }

      /*
       * Replay is UNBOUNDED, and that is a known Phase 2 limit rather than an
       * oversight — see `docs/phase-2-known-limits.md` §1. Every append reads
       * the whole log and re-reduces it, so N appends cost O(N²) in total, and
       * a long enough log eventually exceeds `statement_timeout` and fails the
       * write outright. Harmless at Phase 2 scale (one event, fresh room);
       * not harmless once a room holds a real build's worth of events. Raised
       * by CodeRabbit on PR #2.
       */
      const { state: current, logLength } = await replay(client, roomId);

      /*
       * The overlay is derived and OVERWRITES whatever the caller asserted
       * (contract §10). `gatewayOnline` decides whether work may be dispatched
       * to a machine; a caller asserting its own reachability is a caller
       * marking its own homework. `@build-room/contracts` shapes are untouched
       * — only this one fact's value is replaced.
       *
       * The DERIVED event is what gets reduced AND what gets persisted
       * (correction B1, Rev 4.7 tester). The log is the input to every future
       * replay, so a row carrying the caller's original value would commit a
       * transition that replay refuses — write-time and read-time verdicts
       * disagreeing. Only the rejection record keeps the submitted event, and
       * deliberately: it is evidence of what the caller sent, never an input
       * to a replay.
       */
      const offered =
        deriveGatewayOnline === null
          ? event
          : {
              ...event,
              facts: { ...event.facts, gatewayOnline: await deriveGatewayOnline() },
            };

      const result: ApplyResult = apply(current, offered);

      if (!result.ok) {
        await recordRejection(client, roomId, event, result.code, result.reason);
        return { ok: false, outcome: 'rejected', code: result.code, reason: result.reason, state: current };
      }

      if (result.kind === 'replay') {
        // INV-4. Nothing is written; the log already holds this event.
        return { ok: true, outcome: 'replay', entry: result.entry, state: result.state };
      }

      const seq = logLength + 1;

      if (result.kind === 'conjunction_pending') {
        await insertEvent(client, {
          roomId,
          seq,
          event: offered,
          outcome: 'conjunction_pending',
          entry: null,
          state: result.state,
        });
        return {
          ok: true,
          outcome: 'conjunction_pending',
          seq,
          awaiting: result.awaiting,
          state: result.state,
        };
      }

      await insertEvent(client, {
        roomId,
        seq,
        event: offered,
        outcome: 'transition',
        entry: result.entry,
        state: result.state,
      });
      return { ok: true, outcome: 'transition', seq, entry: result.entry, state: result.state };
    }
  }

  /**
   * Every committed row for a room, oldest first, as stored. This is the
   * export path for `DEC-20260815-17` exit criterion 5 (evidence retained and
   * exportable) — it returns rows, not a rendered report.
   *
   * Both reads happen in ONE read-only REPEATABLE READ transaction, on ONE
   * pooled connection. They were two bare `pool.query` calls, which is two
   * connections and two snapshots taken at two different instants: an append
   * committing between them lands in the second result and not the first, so
   * an export could carry a rejection for an event it does not contain, or
   * events with the rejections that accompanied them missing. Nothing in the
   * output says which instant it came from, so the inconsistency is invisible
   * to whoever reads the export — and this is the evidence path, where a
   * record that quietly disagrees with itself is worse than no record.
   *
   * REPEATABLE READ rather than the default READ COMMITTED because the
   * default takes a fresh snapshot per statement, which is the exact problem;
   * the transaction alone would not fix it. READ ONLY states the intent and
   * lets the server refuse a write that should never appear here.
   */
  async exportRoom(roomId: string): Promise<{
    readonly events: readonly Record<string, unknown>[];
    readonly rejections: readonly Record<string, unknown>[];
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const events = await client.query<Record<string, unknown>>(
        `SELECT seq, event_id, event, outcome, entry_seq, transition_id, guard_id,
                from_state, resulting_state, actor, attribution, scope, evidence,
                overlays, round, occurred_at, payload, committed_at
           FROM build_room_events WHERE room_id = $1 ORDER BY seq ASC`,
        [roomId],
      );
      const rejections = await client.query<Record<string, unknown>>(
        `SELECT rejection_id, event_id, event, code, reason, actor, attempted_at, recorded_at
           FROM build_room_rejections WHERE room_id = $1 ORDER BY rejection_id ASC`,
        [roomId],
      );
      await client.query('COMMIT');
      return { events: events.rows, rejections: rejections.rows };
    } catch (error) {
      // Guarded for the same reason the migration runner's is: a ROLLBACK on a
      // connection that has already died throws, and its exception would
      // replace the one worth reporting.
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function roomExists(client: PoolClient, roomId: string): Promise<boolean> {
  const { rowCount } = await client.query('SELECT 1 FROM build_room_rooms WHERE room_id = $1', [roomId]);
  return rowCount === 1;
}

/**
 * Rebuild state from the log.
 *
 * The log holds only events the reducer already accepted, so a replay that
 * rejects one means the stored history and the current code disagree — a
 * corruption or an incompatible schema change, not an ordinary refusal. It is
 * raised rather than skipped: continuing would serve a state that no sequence
 * of events produces.
 */
async function replay(
  client: PoolClient,
  roomId: string,
): Promise<{ readonly state: LedgerState; readonly logLength: number }> {
  const { rows } = await client.query<EventRow>(
    'SELECT seq, payload FROM build_room_events WHERE room_id = $1 ORDER BY seq ASC',
    [roomId],
  );
  const events = rows.map((row) => row.payload);
  const { state, results } = applyAll(initialLedger(), events);

  const failed = results.findIndex((r) => !r.ok);
  if (failed !== -1) {
    const result = results[failed];
    const reason = result && !result.ok ? `${result.code}: ${result.reason}` : 'unknown';
    throw new Error(
      `ledger replay failed for room ${roomId} at log position ${failed + 1} — ${reason}. ` +
        `The stored log holds only previously accepted events, so this is a ` +
        `corruption or an incompatible change, not a refusal.`,
    );
  }

  return { state, logLength: rows.length };
}

interface InsertArgs {
  readonly roomId: string;
  readonly seq: number;
  readonly event: LifecycleEvent;
  readonly outcome: 'transition' | 'conjunction_pending';
  readonly entry: LedgerEntry | null;
  readonly state: LedgerState;
}

async function insertEvent(client: PoolClient, args: InsertArgs): Promise<void> {
  const { roomId, seq, event, outcome, entry, state } = args;
  await client.query(
    `INSERT INTO build_room_events (
       room_id, seq, event_id, event, outcome, entry_seq, transition_id, guard_id,
       from_state, resulting_state, actor, attribution, scope, evidence,
       overlays, round, occurred_at, payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      roomId,
      seq,
      event.eventId,
      event.event,
      outcome,
      entry?.seq ?? null,
      entry?.transition ?? null,
      entry?.guard ?? null,
      entry?.fromState ?? null,
      entry?.resultingState ?? null,
      JSON.stringify(event.actor),
      JSON.stringify(event.attribution),
      JSON.stringify(event.scope),
      JSON.stringify(event.evidence),
      JSON.stringify(entry?.overlays ?? state.overlays),
      entry?.round ?? state.round,
      event.occurredAt,
      JSON.stringify(event),
    ],
  );
}

async function recordRejection(
  client: PoolClient,
  roomId: string,
  event: LifecycleEvent,
  code: RejectionCode,
  reason: string,
): Promise<void> {
  await client.query(
    `INSERT INTO build_room_rejections (room_id, event_id, event, code, reason, actor, attempted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [roomId, event.eventId, String(event.event), code, reason, JSON.stringify(event.actor), event.occurredAt],
  );
}
