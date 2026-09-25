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
import { isCanonicalUuid } from '../../gateway-protocol/src/index.js';
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
    readonly state: LedgerState;
    readonly logLength: number;
    readonly events: readonly Record<string, unknown>[];
    readonly rejections: readonly Record<string, unknown>[];
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

      /*
       * Existence and the replayed state come from INSIDE the transaction too.
       *
       * The first version returned only rows, and the endpoint composed its
       * response from a separate `loadRoom` call plus this one — two snapshots
       * again, one level up. An append committing between them produced an
       * export whose `snapshot` described an earlier ledger than its `events`
       * contained, which is the exact inconsistency moving these two reads into
       * one transaction was meant to remove. Fixing it inside the store while
       * leaving the endpoint to stitch two calls together fixed the visible
       * half and left the real one. Raised by CodeRabbit on PR #6.
       *
       * Replaying here rather than trusting a caller-supplied state also means
       * the returned state is derived from the very rows being exported, so the
       * two cannot disagree by construction.
       */
      if (!(await roomExists(client, roomId))) throw new RoomNotFoundError(roomId);
      const { state, logLength } = await replay(client, roomId);

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
      return { state, logLength, events: events.rows, rejections: rejections.rows };
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

  /**
   * Append one run to the persisted gate sequence (`0007_gate_runs`,
   * `docs/phase-2-known-limits.md` §2).
   *
   * `seq` is allocated HERE, inside the write transaction, under an advisory
   * lock held to COMMIT: the next value is `MAX(seq) + 1` read after the lock
   * is taken, so concurrent appends serialize and the sequence stays gapless.
   * No counter lives in the application, and the caller cannot choose `seq`.
   *
   * A replay — the same run id with the same content — returns the stored row
   * with `created: false`, so a retried request after a lost response is safe.
   * The same run id with different content is a `GateRunConflictError`: the
   * record is append-only, and a second story for one run is not an append.
   *
   * An unreachable database is a `GateRunStoreUnavailableError`. It is never
   * answered from anywhere else.
   */
  async appendGateRun(input: GateRunInput): Promise<{ readonly run: PersistedGateRun; readonly created: boolean }> {
    const client = await acquire(this.pool);
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [GATE_RUN_LOCK_KEY]);

      const existing = await client.query<GateRunRow & { readonly same: boolean }>(
        `SELECT ${GATE_RUN_COLUMNS},
                (gate = $2 AND verdict = $3 AND failure_reason IS NOT DISTINCT FROM $4
                 AND record = $5::jsonb) AS same
           FROM build_room_gate_runs WHERE run_id = $1`,
        [input.runId, input.gate, input.verdict, input.failureReason ?? null, JSON.stringify(input.record)],
      );
      const prior = existing.rows[0];
      if (prior !== undefined) {
        await client.query('COMMIT');
        if (!prior.same) throw new GateRunConflictError(input.runId);
        return { run: toPersistedGateRun(prior), created: false };
      }

      const inserted = await client.query<GateRunRow>(
        `INSERT INTO build_room_gate_runs
           (seq, gate, run_id, started_at, ended_at, commit_sha, verdict, failure_reason, record)
         SELECT COALESCE(MAX(seq), 0) + 1, $1, $2, $3, $4, $5, $6, $7, $8::jsonb
           FROM build_room_gate_runs
         RETURNING ${GATE_RUN_COLUMNS}`,
        [
          input.gate,
          input.runId,
          input.startedAt,
          input.endedAt,
          input.commit,
          input.verdict,
          input.failureReason ?? null,
          JSON.stringify(input.record),
        ],
      );
      await client.query('COMMIT');
      return { run: toPersistedGateRun(inserted.rows[0]!), created: true };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw gateRunStoreError(error);
    } finally {
      client.release();
    }
  }

  /**
   * The full persisted gate sequence, in `seq` order. Never empty because the
   * store could not be read — that is a `GateRunStoreUnavailableError`.
   */
  async listGateRuns(): Promise<readonly PersistedGateRun[]> {
    try {
      const { rows } = await this.pool.query<GateRunRow>(
        `SELECT ${GATE_RUN_COLUMNS} FROM build_room_gate_runs ORDER BY seq ASC`,
      );
      return rows.map(toPersistedGateRun);
    } catch (error) {
      throw gateRunStoreError(error);
    }
  }
}

// ---------------------------------------------------------------------------
// The persisted gate-run sequence (`0007_gate_runs`)
// ---------------------------------------------------------------------------

/** The gates a run may count toward — the `gate` CHECK in `0007_gate_runs`. */
export const GATE_RUN_GATES = ['phase2_three_run'] as const;
export type GateId = (typeof GATE_RUN_GATES)[number];

/**
 * The conditions a passing run must show held — the Founder's three Phase 2
 * run conditions (`DEC-20260815-17`). The harness derives the verdict; the
 * store refuses a `passed` its own conditions contradict, so a pass cannot be
 * recorded by assertion alone.
 */
export const GATE_RUN_REQUIRED_CONDITIONS = ['deploys_and_stays_up', 'reads_and_writes', 'survives_restart'] as const;

/**
 * Advisory-lock key for gate-run `seq` allocation. Distinct from
 * `MIGRATION_LOCK_KEY` and `GATEWAY_REGISTRY_LOCK_KEY`, so a gate-run append
 * serializes only against other gate-run appends.
 */
export const GATE_RUN_LOCK_KEY = 8_190_925;

export interface GateRunInput {
  readonly gate: GateId;
  readonly runId: string;
  /** `Date.prototype.toISOString()` form. */
  readonly startedAt: string;
  readonly endedAt: string;
  readonly commit: string;
  readonly verdict: 'passed' | 'failed';
  /** Present exactly when the run failed. */
  readonly failureReason?: string;
  /** The run as the harness posted it: steps, conditions, observations. */
  readonly record: Readonly<Record<string, unknown>>;
}

export interface PersistedGateRun extends GateRunInput {
  readonly seq: number;
  readonly recordedAt: string;
}

/** The store could not be reached. Never degraded into an empty or remembered answer. */
export class GateRunStoreUnavailableError extends Error {
  override readonly name = 'GateRunStoreUnavailableError';
  readonly code = 'gate_run_store_unavailable';
  constructor(cause?: unknown) {
    super('gate run store unavailable', cause === undefined ? undefined : { cause });
  }
}

/** A run id already recorded with different content. */
export class GateRunConflictError extends Error {
  override readonly name = 'GateRunConflictError';
  constructor(readonly runId: string) {
    super(`gate run ${runId} is already recorded with different content`);
  }
}

export type GateRunValidation =
  | { readonly ok: true; readonly value: GateRunInput }
  | { readonly ok: false; readonly reason: string };

/**
 * Validate a `POST /gate/runs` body: `{ gate, run }`, where `run` is the
 * harness's run record without a `seq` — the store assigns `seq`, so a body
 * that carries one is refused rather than silently overridden.
 */
export function validateGateRunBody(body: unknown): GateRunValidation {
  if (!isPlainObject(body)) return { ok: false, reason: 'body must be an object' };
  const gate = body['gate'];
  if (typeof gate !== 'string' || !(GATE_RUN_GATES as readonly string[]).includes(gate)) {
    return { ok: false, reason: `gate must be one of ${GATE_RUN_GATES.join(', ')}` };
  }
  const run = body['run'];
  if (!isPlainObject(run)) return { ok: false, reason: 'run must be an object' };
  if ('seq' in run) return { ok: false, reason: 'run.seq is assigned by the store and must not be supplied' };

  const { runId, startedAt, endedAt, commit, steps, conditions, verdict, failureReason } = run;
  if (typeof runId !== 'string' || !isCanonicalUuid(runId)) {
    return { ok: false, reason: 'run.runId must be a canonical lowercase UUID' };
  }
  if (!isIsoInstant(startedAt) || !isIsoInstant(endedAt)) {
    return { ok: false, reason: 'run.startedAt and run.endedAt must be ISO-8601 UTC instants' };
  }
  if (Date.parse(endedAt) < Date.parse(startedAt)) {
    return { ok: false, reason: 'run.endedAt must not precede run.startedAt' };
  }
  if (typeof commit !== 'string' || commit.length < 1 || commit.length > 128) {
    return { ok: false, reason: 'run.commit must be a string of 1..128 characters' };
  }
  if (!Array.isArray(steps)) return { ok: false, reason: 'run.steps must be an array' };
  if (
    !Array.isArray(conditions) ||
    !conditions.every(
      (c) =>
        isPlainObject(c) &&
        typeof c['condition'] === 'string' &&
        typeof c['held'] === 'boolean' &&
        typeof c['evidence'] === 'string',
    )
  ) {
    return { ok: false, reason: 'run.conditions must be an array of { condition, held, evidence }' };
  }
  if (verdict !== 'passed' && verdict !== 'failed') {
    return { ok: false, reason: "run.verdict must be 'passed' or 'failed'" };
  }
  if (verdict === 'failed' && (typeof failureReason !== 'string' || failureReason.length === 0)) {
    return { ok: false, reason: 'a failed run must carry a failureReason' };
  }
  if (verdict === 'passed' && failureReason !== undefined) {
    return { ok: false, reason: 'a passed run must not carry a failureReason' };
  }
  if (verdict === 'passed') {
    const held = conditions as ReadonlyArray<{ condition: string; held: boolean }>;
    const contradicted =
      held.some((c) => !c.held) ||
      GATE_RUN_REQUIRED_CONDITIONS.some((required) => !held.some((c) => c.condition === required && c.held));
    if (contradicted) {
      return { ok: false, reason: 'a passed run must show every required condition held and none broken' };
    }
  }

  return {
    ok: true,
    value: {
      gate: gate as GateId,
      runId,
      startedAt,
      endedAt,
      commit,
      verdict,
      ...(verdict === 'failed' ? { failureReason: failureReason as string } : {}),
      record: run,
    },
  };
}

const GATE_RUN_COLUMNS =
  'seq, gate, run_id, started_at, ended_at, commit_sha, verdict, failure_reason, record, recorded_at';

interface GateRunRow {
  readonly seq: string;
  readonly gate: GateId;
  readonly run_id: string;
  readonly started_at: Date;
  readonly ended_at: Date;
  readonly commit_sha: string;
  readonly verdict: 'passed' | 'failed';
  readonly failure_reason: string | null;
  readonly record: Record<string, unknown>;
  readonly recorded_at: Date;
}

function toPersistedGateRun(row: GateRunRow): PersistedGateRun {
  return {
    seq: Number(row.seq),
    gate: row.gate,
    runId: row.run_id,
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at.toISOString(),
    commit: row.commit_sha,
    verdict: row.verdict,
    ...(row.failure_reason === null ? {} : { failureReason: row.failure_reason }),
    record: row.record,
    recordedAt: row.recorded_at.toISOString(),
  };
}

/** Acquire a connection, or report the store unreachable — never a fallback. */
async function acquire(pool: Pool): Promise<PoolClient> {
  try {
    return await pool.connect();
  } catch (error) {
    throw new GateRunStoreUnavailableError(error);
  }
}

/**
 * Connection-class failures become `GateRunStoreUnavailableError`; anything
 * else — a constraint violation, a conflict — is rethrown as itself.
 */
function gateRunStoreError(error: unknown): unknown {
  if (error instanceof GateRunStoreUnavailableError || error instanceof GateRunConflictError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string') {
    // SQLSTATE class 08 (connection exception), 57P01–57P03 (shutdown / cannot connect now).
    if (code.startsWith('08') || /^57P0[123]$/.test(code)) return new GateRunStoreUnavailableError(error);
    if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
      return new GateRunStoreUnavailableError(error);
    }
  }
  const message = error instanceof Error ? error.message : '';
  if (/Connection terminated|connection timeout/i.test(message)) return new GateRunStoreUnavailableError(error);
  return error;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Exactly the form `Date.prototype.toISOString()` produces — the harness's own clock format. */
function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
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
