/**
 * The plan store — Phase 4 steps 3 to 6, plan r1 slice 4.
 *
 * Holds every plan the Planner submitted for the Founder's decision, so the
 * plan-decision endpoint (slice 5) can recompute `plan_hash` from the plan
 * itself rather than believe a hash it is handed: T5's guard G5 needs the
 * submitted hash to equal the expected one, and contract §8.2 authenticates
 * the decision by that exact hash. Table: `build_room_plans`, migration
 * `0010_plan_store`.
 *
 * What a stored plan is bound to, and how:
 *
 *   - its planner command, by `command_id` (the key: one planner command,
 *     one plan), the id a decision row carries under Q3;
 *   - the T3 `plan.submitted` lifecycle event that submitted it, by
 *     `(room_id, lifecycle_event_id)`, which the schema holds as a foreign
 *     key. Before inserting, the store also requires that this event is a
 *     committed T3 transition whose `planHash` fact is the hash the store
 *     computes, and that THIS transaction wrote it (its `xmin` is the
 *     current transaction id). The plan and its T3 event therefore commit
 *     together or not at all, as a decision and its lifecycle event do
 *     (contract §1.4), and a client outside a transaction is refused,
 *     because the event it would name was not written by that statement's
 *     own transaction.
 *
 * What is stored, and how it is checked:
 *
 *   - Only a plan `judgePlanDoc` accepts and marks ready for decision
 *     (`PLAN_READY_FOR_FOUNDER_APPROVAL`): schema valid, scope canonical,
 *     hash computed by the control plane. A blocked or inconclusive plan is
 *     not a submission and is not stored here.
 *   - No credential-shaped string, in any value or key of the document
 *     (the journal's guard, `containsCredentialMaterial`). Planner output is
 *     free text and could quote a secret; a store that keeps it forever must
 *     refuse it instead.
 *   - The document is kept as the JSON text of what was judged, and every
 *     read parses it, judges it again and recomputes the hash. A row whose
 *     hash no longer matches its document is an integrity finding, never a
 *     plan.
 *
 * No identity latch here: the boot preflight already refuses to serve as any
 * role but `br_app_runtime`, and the runtime holds SELECT and INSERT on the
 * table and nothing else.
 */

import type { Pool, PoolClient } from 'pg';
import { COMMAND_ID_PREFIX, containsCredentialMaterial } from '../../journal/src/index.js';
import type { PlanDocV1 } from '../../seat-output-schema/src/index.js';
import { judgePlanDoc, type PlanDocVerdict } from './plan-doc.js';

export interface PlanSubmission {
  readonly roomId: string;
  /** The planner command that produced the plan. */
  readonly commandId: string;
  /** The T3 `plan.submitted` event, written by the same transaction. */
  readonly lifecycleEventId: string;
  /** The document as the Planner returned it; judged here, never trusted. */
  readonly document: unknown;
}

export interface StoredPlan {
  readonly commandId: string;
  readonly roomId: string;
  readonly lifecycleEventId: string;
  readonly planHash: string;
  readonly document: PlanDocV1;
  readonly recordedAt: Date;
}

// ---------------------------------------------------------------------------
// Errors

export class PlanStoreUnavailableError extends Error {
  override readonly name = 'PlanStoreUnavailableError';
  readonly code = 'plan_store_unavailable';
  constructor(cause?: unknown) {
    super('plan store unavailable', cause === undefined ? undefined : { cause });
  }
}

/** The document is not a plan the store may keep. Nothing was written. */
export class PlanRefusedError extends Error {
  override readonly name = 'PlanRefusedError';
  readonly code = 'plan_refused';
  constructor(
    readonly kind: 'schema' | 'scope' | 'encoding' | 'not_ready' | 'credential_material' | 'invalid_submission',
    readonly detail: string,
  ) {
    super(`plan refused (${kind}): ${detail}`);
  }
}

/** The T3 event the submission names is missing, not T3, a different hash, or another transaction's. */
export class PlanLifecycleReferenceError extends Error {
  override readonly name = 'PlanLifecycleReferenceError';
  readonly code = 'plan_lifecycle_reference_invalid';
  constructor(readonly reason: string) {
    super(`plan lifecycle reference invalid: ${reason}`);
  }
}

/** The planner command already has a plan, or the T3 event already carries one. */
export class PlanDuplicateError extends Error {
  override readonly name = 'PlanDuplicateError';
  readonly code = 'plan_duplicate';
  constructor(
    readonly constraint: string,
    cause?: unknown,
  ) {
    super(`a plan already exists for this ${constraint === PER_EVENT_CONSTRAINT ? 'lifecycle event' : 'planner command'}`, cause === undefined ? undefined : { cause });
  }
}

/** A stored row whose document no longer judges, or whose hash no longer matches it. */
export class PlanIntegrityError extends Error {
  override readonly name = 'PlanIntegrityError';
  readonly code = 'plan_integrity_failure';
  constructor(
    readonly commandId: string,
    readonly reason: string,
  ) {
    super(`stored plan for ${commandId} fails its integrity check: ${reason}`);
  }
}

// ---------------------------------------------------------------------------
// The store

const PRIMARY_CONSTRAINT = 'build_room_plans_pkey';
const PER_EVENT_CONSTRAINT = 'build_room_plans_one_per_event';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const T3_EVENT = 'plan.submitted';

const LIFECYCLE_SQL = `SELECT e.event, e.outcome, e.payload->'facts'->>'planHash' AS plan_hash,
       (e.xmin = pg_current_xact_id()::xid) AS this_transaction
  FROM public.build_room_events AS e
 WHERE e.room_id = $1::uuid AND e.event_id = $2`;

const INSERT_SQL = `INSERT INTO public.build_room_plans
  (command_id, room_id, lifecycle_event_id, plan_hash, schema_version, document)
  VALUES ($1, $2::uuid, $3, $4, $5, $6)
  RETURNING recorded_at`;

const PLAN_COLUMNS = 'p.command_id, p.room_id::text AS room_id, p.lifecycle_event_id, p.plan_hash, p.document, p.recorded_at';
const BY_EVENT_SQL = `SELECT ${PLAN_COLUMNS} FROM public.build_room_plans AS p WHERE p.room_id = $1::uuid AND p.lifecycle_event_id = $2`;
const BY_COMMAND_SQL = `SELECT ${PLAN_COLUMNS} FROM public.build_room_plans AS p WHERE p.command_id = $1`;

interface PlanRow {
  readonly command_id: string;
  readonly room_id: string;
  readonly lifecycle_event_id: string;
  readonly plan_hash: string;
  readonly document: string;
  readonly recorded_at: Date;
}

type Queryable = Pick<PoolClient, 'query'>;

export interface PlanTransaction {
  recordPlan(submission: PlanSubmission): Promise<StoredPlan>;
  planForEvent(roomId: string, lifecycleEventId: string): Promise<StoredPlan | null>;
}

export class PlanStore {
  constructor(private readonly pool: Pool) {}

  /** The writes, and the reads a writer needs, inside the caller's transaction. */
  inTransaction(client: PoolClient): PlanTransaction {
    return {
      recordPlan: (submission) => guarded(() => recordPlan(client, submission)),
      planForEvent: (roomId, lifecycleEventId) => guarded(() => readOne(client, BY_EVENT_SQL, [roomId, lifecycleEventId], roomId)),
    };
  }

  /** The plan the named T3 event submitted, judged again; `null` when there is none. */
  async planForEvent(roomId: string, lifecycleEventId: string): Promise<StoredPlan | null> {
    return guarded(() => readOne(this.pool, BY_EVENT_SQL, [roomId, lifecycleEventId], roomId));
  }

  /** The plan a planner command produced, judged again; `null` when there is none. */
  async planForCommand(commandId: string): Promise<StoredPlan | null> {
    return guarded(() => readOne(this.pool, BY_COMMAND_SQL, [commandId], null));
  }
}

// ---------------------------------------------------------------------------
// Write

async function recordPlan(client: Queryable, submission: PlanSubmission): Promise<StoredPlan> {
  const { roomId, commandId, lifecycleEventId } = submission;
  if (typeof roomId !== 'string' || !UUID_PATTERN.test(roomId)) {
    throw new PlanRefusedError('invalid_submission', 'roomId is not a room identifier');
  }
  if (typeof commandId !== 'string' || !commandId.startsWith(COMMAND_ID_PREFIX) || commandId === COMMAND_ID_PREFIX) {
    throw new PlanRefusedError('invalid_submission', `commandId is not in the ${COMMAND_ID_PREFIX} namespace`);
  }
  if (typeof lifecycleEventId !== 'string' || lifecycleEventId.trim() === '') {
    throw new PlanRefusedError('invalid_submission', 'lifecycleEventId is required');
  }

  const verdict = judgePlanDoc(submission.document);
  if (!verdict.ok) throw refusalOf(verdict);
  if (!verdict.readyForDecision) {
    throw new PlanRefusedError('not_ready', `terminal status ${verdict.document.terminal_status} is not a submission for decision`);
  }
  if (containsCredentialMaterial(stringsOf(verdict.document))) {
    throw new PlanRefusedError('credential_material', 'secrets and credentials must not be persisted in a stored plan');
  }

  const { rows } = await client.query<{ event: string; outcome: string; plan_hash: string | null; this_transaction: boolean }>(
    LIFECYCLE_SQL,
    [roomId, lifecycleEventId],
  );
  const event = rows[0];
  if (event === undefined) throw new PlanLifecycleReferenceError('no such lifecycle event');
  if (event.outcome !== 'transition' || event.event !== T3_EVENT) {
    throw new PlanLifecycleReferenceError(`the lifecycle event is not a committed ${T3_EVENT} transition`);
  }
  if (event.plan_hash !== verdict.planHash) {
    throw new PlanLifecycleReferenceError('the T3 event carries a different plan_hash than the plan computes');
  }
  if (event.this_transaction !== true) {
    throw new PlanLifecycleReferenceError('the lifecycle event was not written by this transaction');
  }

  const document = JSON.stringify(verdict.document);
  try {
    const inserted = await client.query<{ recorded_at: Date }>(INSERT_SQL, [
      commandId,
      roomId,
      lifecycleEventId,
      verdict.planHash,
      verdict.document.schema_version,
      document,
    ]);
    return {
      commandId,
      roomId,
      lifecycleEventId,
      planHash: verdict.planHash,
      document: verdict.document,
      recordedAt: inserted.rows[0]!.recorded_at,
    };
  } catch (error) {
    const shape = pgShape(error);
    if (shape?.code === '23505' && (shape.constraint === PRIMARY_CONSTRAINT || shape.constraint === PER_EVENT_CONSTRAINT)) {
      throw new PlanDuplicateError(shape.constraint, error);
    }
    throw error;
  }
}

function refusalOf(verdict: Extract<PlanDocVerdict, { ok: false }>): PlanRefusedError {
  switch (verdict.kind) {
    case 'schema':
      // Violation paths name fields of the fixed schema; values are never echoed.
      return new PlanRefusedError('schema', verdict.violations.map((v) => v.path).join(', ') || 'schema violation');
    case 'scope':
      return new PlanRefusedError('scope', `scope_paths${verdict.index === null ? '' : `[${verdict.index}]`}: ${verdict.reason}`);
    case 'encoding':
      return new PlanRefusedError('encoding', verdict.reason);
  }
}

/** Every key and every string value in the document, each scanned separately. */
function stringsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) stringsOf(item, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      stringsOf(item, out);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Read

async function readOne(db: Queryable, sql: string, params: readonly unknown[], roomId: string | null): Promise<StoredPlan | null> {
  if (roomId !== null && !UUID_PATTERN.test(roomId)) return null;
  const { rows } = await db.query<PlanRow>(sql, [...params]);
  const row = rows[0];
  return row === undefined ? null : rejudged(row);
}

/** Parse, judge again, and recompute the hash; a stored row that fails is an integrity finding. */
function rejudged(row: PlanRow): StoredPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.document);
  } catch {
    throw new PlanIntegrityError(row.command_id, 'the stored document is not JSON');
  }
  const verdict = judgePlanDoc(parsed);
  if (!verdict.ok) throw new PlanIntegrityError(row.command_id, `the stored document no longer judges (${verdict.kind})`);
  if (verdict.planHash !== row.plan_hash) throw new PlanIntegrityError(row.command_id, 'the stored plan_hash does not match its document');
  return {
    commandId: row.command_id,
    roomId: row.room_id,
    lifecycleEventId: row.lifecycle_event_id,
    planHash: row.plan_hash,
    document: verdict.document,
    recordedAt: row.recorded_at,
  };
}

// ---------------------------------------------------------------------------
// Failure classification

interface PgErrorShape {
  readonly code?: unknown;
  readonly constraint?: unknown;
}

function pgShape(error: unknown): PgErrorShape | null {
  return typeof error === 'object' && error !== null ? (error as PgErrorShape) : null;
}

/** Connection-class failures become `PlanStoreUnavailableError`; everything else is left as it is. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const code = pgShape(error)?.code;
    const message = error instanceof Error ? error.message : '';
    const connection =
      (typeof code === 'string'
        && (code.startsWith('08')
          || /^57P0[123]$/.test(code)
          || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)))
      || /Connection terminated|connection timeout/i.test(message);
    throw connection ? new PlanStoreUnavailableError(error) : error;
  }
}
