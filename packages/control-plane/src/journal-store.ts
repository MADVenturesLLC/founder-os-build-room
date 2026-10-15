/**
 * The command journal's single writer — contract §3 [RULED]: "the sole
 * writer is the Build Room control plane through a single journal module."
 * This is that module. It is the only non-test code under `packages/` that
 * may name `command_journal_append` besides `migrations.ts`, which defines
 * it; `test/journal-sole-writer.test.ts` holds that line at the source.
 *
 * Design (plan r1 §3.3, Option B, Founder-dispositioned): a direct caller of
 * the landed SQL routine, reusing `@build-room/journal`'s pure exports only.
 * `dispatchGovernedCommand`, `getActiveJournal` and `MemoryCommandJournal`
 * are not touched and not used: the in-memory journal is the §7.1–7.3
 * proof substrate, and the ruled production locus is Postgres.
 *
 * What this module reproduces from `dispatch.ts`, at the HTTP boundary:
 *
 *   - the `journaled` row is built the same way — `normalizeForJournal` for
 *     the envelope, `envelopeDigest`, a minted `cmd_` id when none is
 *     supplied, and `recorded_at` taken here from an injectable clock. The
 *     caller can never supply `recorded_at` or `seq` (contract §2 element
 *     11); neither is a field of `GovernedCommandRequest`;
 *   - the whole-row credential guard of `store.ts`'s `credentialSurfaceOf`:
 *     every caller-supplied string is scanned separately, not only the
 *     envelope fields `normalizeForJournal` covers (contract §6.3);
 *   - fail closed (contract §5.1): no result is returned unless the routine
 *     committed the row. Every failure is a typed error; there is no
 *     fallback, no retry of an integrity finding, and no answer of success
 *     from anywhere but the routine's own `RETURN NEXT`.
 *
 * What is specific to the SQL routine and not present in the in-memory
 * store (plan r1 §4.2): the CALLER supplies `p_seq`, read from the chain
 * head first, so a concurrent append can advance the head between the read
 * and the call. The routine refuses with SQLSTATE 23000 — the SAME SQLSTATE
 * it uses for two real integrity findings — and the row's canonical bytes
 * EMBED `seq`, so a retry must re-encode at the new seq rather than resubmit
 * the same bytes with a bumped parameter. Both hazards are handled below,
 * and the storage suite proves each.
 *
 * One pool, one login. The store takes the server's existing `Pool`; there
 * is no second connection string and no new environment variable (plan r1
 * §15 stop condition 6).
 *
 * THE IDENTITY LATCH (Founder disposition of PR #78 review finding
 * 4115032242, "owner-class login can journal"). The routine's EXECUTE grant
 * is not a latch: a non-superuser admin that applied `0006` created the
 * three roles and, on PostgreSQL 16, holds INHERIT membership in them — so
 * it executes the routine through `br_app_runtime`'s own grant, and a
 * superuser bypasses grants outright. Until Tranche D moves `DATABASE_URL`
 * to `br_app_runtime`, production connects as exactly such an owner-class
 * login. So the store refuses to append unless the CONNECTED role is
 * `br_app_runtime` — both `session_user` (the login) and `current_user`
 * (the effective role, which SET ROLE can change) — answering
 * `JournalRuntimeNotAuthorizedError`, calling nothing and writing nothing.
 * The same error covers SQLSTATE 42501 from either statement, so the route
 * answers `503 journal_runtime_not_authorized` for every "not the runtime"
 * case: a clean, distinct, fail-closed refusal, not a crash and never a row.
 *
 * THE COMPLETE WRITER (Phase 4 steps 3 to 6, plan r1 slice 3). Beyond
 * `journaled`, the store appends every later command event and the
 * decision-class record, and reads the chain back:
 *
 *   - Every append runs in ONE transaction that first takes the journal
 *     append lock, a transaction-scoped advisory lock (L4: after the room
 *     row's L3, so an act that writes a lifecycle event and its journal
 *     record takes L3 then L4, and an append alone takes L4 alone; nothing
 *     takes L4 before L0 to L3). The lock serializes this module's own
 *     appends, so the cross-row check below cannot race another append from
 *     here. The routine's head lock still serializes everything else.
 *   - After the routine inserts the row, and before anything commits, the
 *     store reads every row that shares the command_id, decodes it from its
 *     bytes, and runs the contract's cross-row rules over the sequence
 *     (`packages/journal/src/sequence.ts`): order, set-once identities, a
 *     `completed` only after `dispatched` on the intended route, and the
 *     decision bindings. A refusal rolls the attempt back to its savepoint:
 *     nothing of it remains. Because the check runs after the insert and
 *     under the head lock the routine took, no append, from here or from
 *     anywhere, can land between the check and the commit.
 *   - A `completed` (directly, or as a `resolved` determination) also needs
 *     the authorization test of §5.3: `authorization_ref` must resolve to an
 *     authorization whose granted scope covers the observed route. Rows
 *     cannot answer that, so the store asks an injected resolver, and with
 *     none it refuses. A citation alone never reaches `completed`.
 *   - Decision records exist only inside a caller's transaction
 *     (`inTransaction`), because §1.4 commits a decision with its lifecycle
 *     event or not at all. The store checks that the lifecycle event the
 *     decision names exists, is the same decision, fired from the recorded
 *     state, and was written by THIS transaction (its `xmin` is the current
 *     transaction id), so a decision can never attach to a lifecycle event
 *     committed earlier by another act.
 *   - The seq-race retry runs inside a savepoint, so a lost race inside a
 *     caller's transaction undoes the attempt and leaves that transaction
 *     usable. A savepoint also needs a transaction block: a client that is
 *     not in one is refused before the routine is called.
 *   - `verify()` recomputes the whole chain from genesis over `row_bytes`
 *     alone, in one read-only snapshot, decodes every row, checks each
 *     column against its bytes, checks the head against the tail, and runs
 *     the same cross-row rules over every command. It never trusts the head.
 *     The authorization test is not re-run on verify: it needs the
 *     resolver, and its verdict was a condition of the append.
 */

import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  COMMAND_ID_PREFIX,
  DECISION_ACTOR,
  DispatchError,
  GENESIS_CHAIN_HASH,
  JournalDecodeError,
  RECORD_CLASS_COMMAND,
  RECORD_CLASS_DECISION,
  boundDecisionDefect,
  chainHash,
  commandSequenceDefect,
  containsCredentialMaterial,
  decodeJournalRow,
  deriveCommandState,
  encodeCommandEventRow,
  encodeDecisionRecordRow,
  envelopeDigest,
  isCanonicalRecordedAt,
  isCanonicalSeq,
  normalizeForJournal,
  type BoundEntry,
  type CommandEventRow,
  type CommandEventType,
  type DecisionRecordRow,
  type DecodedJournalRow,
  type DerivedCommandState,
  type GovernedCommandRequest,
} from '../../journal/src/index.js';

const EVENT_TYPE_JOURNALED = 'journaled' as const;

/**
 * The journal append lock (L4). A transaction-scoped advisory lock: taken
 * first in every append's transaction, released by its COMMIT or ROLLBACK.
 * Distinct from the migration and registry keys for the reason
 * `GATEWAY_REGISTRY_LOCK_KEY` gives.
 */
export const JOURNAL_APPEND_LOCK_KEY = 8_201_015;

const LOCK_SQL = 'SELECT pg_advisory_xact_lock($1)';
const SAVEPOINT = 'journal_append';

/**
 * How many times a benign seq race is retried before the append is reported
 * as contended. Each retry re-reads the head and re-encodes; a loser can
 * lose at most once per concurrent winner, so this bounds the in-process
 * concurrency a single append can ride out. Small on purpose: sustained
 * contention is a signal, not something to absorb silently.
 */
export const DEFAULT_MAX_SEQ_RACE_RETRIES = 5;

export interface JournalStoreOptions {
  /** Injectable clock for `recorded_at` (tests). Never a request field. */
  readonly now?: () => Date;
  /**
   * Bound on seq-race retries; defaults to `DEFAULT_MAX_SEQ_RACE_RETRIES`.
   * Must be a finite integer >= 0, or the constructor throws a `RangeError`:
   * `Infinity` would loop forever under contention, and `NaN` or a negative
   * value would skip attempts and report a nonsensical count.
   */
  readonly maxSeqRaceRetries?: number;
  /**
   * The authorization test of contract §5.3, for `completed` alone. Absent,
   * every `completed` and every `completed` determination is refused.
   */
  readonly resolveCompletionAuthorization?: CompletionAuthorizationResolver;
}

/** What the resolver is asked: the governing authorization, and the route it must cover. */
export interface CompletionAuthorizationQuery {
  readonly commandId: string;
  readonly authorizationRef: string;
  readonly repository: string;
  readonly scopeRef: string;
  readonly roomId?: string;
  readonly runId?: string;
  readonly executionId?: string;
  readonly intended: { readonly provider: string; readonly model: string; readonly executionSurface: string };
  readonly observed: { readonly provider: string; readonly model: string; readonly executionSurface: string };
}

/**
 * `covers` only when the authorization exists, is valid, applies to the
 * command's repository, scope and run, and its granted scope speaks to the
 * observed route. Silence is not coverage (§5.3).
 */
export type AuthorizationCoverage = 'covers' | 'does_not_cover' | 'indeterminate';

export type CompletionAuthorizationResolver = (query: CompletionAuthorizationQuery) => Promise<AuthorizationCoverage>;

/** A command event after `journaled`. `seq` and `recorded_at` are the server's. */
export type LaterCommandEvent = Omit<CommandEventRow, 'seq' | 'recordedAt' | 'eventType'> & {
  readonly eventType: Exclude<CommandEventType, typeof EVENT_TYPE_JOURNALED>;
};

/**
 * A Founder decision record. `commandId` is the planner command whose plan
 * it decides (Founder direction "GO", 2026-10-15, Q3): it fills the row's
 * `command_id` column and is not part of the row's bytes.
 */
export type DecisionInput = Omit<DecisionRecordRow, 'seq' | 'recordedAt' | 'actorId'> & {
  readonly commandId: string;
};

export interface AppendedRecord {
  readonly recordClass: typeof RECORD_CLASS_COMMAND | typeof RECORD_CLASS_DECISION;
  readonly commandId: string;
  readonly eventType: string;
  readonly seq: string;
  readonly chainHash: string;
}

export interface JournalRecord {
  readonly seq: string;
  readonly commandId: string;
  readonly chainHash: string;
  readonly decoded: DecodedJournalRow;
}

export type JournalVerifyResult =
  | { readonly ok: true; readonly headSeq: string; readonly headChainHash: string; readonly commands: number }
  | { readonly ok: false; readonly reason: string; readonly atSeq: string | null };

export interface CommandHistory {
  readonly commandId: string;
  /** Command and decision rows sharing the command_id, in `seq` order. */
  readonly entries: readonly JournalRecord[];
  /** `null` when the command has no command-class row. */
  readonly state: DerivedCommandState | null;
}

export interface JournaledAppendResult {
  readonly commandId: string;
  /** Canonical ASCII decimal, as the row carries it. */
  readonly seq: string;
  readonly chainHash: string;
  readonly envelopeDigest: string;
}

// ---------------------------------------------------------------------------
// Error classes, in the style of GateRunStoreUnavailableError / GateRunConflictError

/** The store could not be reached. Never degraded into a remembered or assumed answer. */
export class JournalStoreUnavailableError extends Error {
  override readonly name = 'JournalStoreUnavailableError';
  readonly code = 'journal_store_unavailable';
  constructor(cause?: unknown) {
    super('journal store unavailable', cause === undefined ? undefined : { cause });
  }
}

/** A `journaled` event already exists for this command_id (contract §4.1 uniqueness, `dispatch.ts` `duplicate_event`). */
export class JournalDuplicateEventError extends Error {
  override readonly name = 'JournalDuplicateEventError';
  readonly code = 'duplicate_event';
  constructor(
    readonly commandId: string,
    cause?: unknown,
  ) {
    super(`journaled is at most once per command_id: ${commandId} already has one`, cause === undefined ? undefined : { cause });
  }
}

/**
 * The connected role is not the journal runtime: either the identity latch
 * refused it (the connected role is not `br_app_runtime`) or PostgreSQL
 * refused a statement with SQLSTATE 42501. This is production's answer
 * until Tranche D: distinct and fail-closed.
 */
export class JournalRuntimeNotAuthorizedError extends Error {
  override readonly name = 'JournalRuntimeNotAuthorizedError';
  readonly code = 'journal_runtime_not_authorized';
  constructor(cause?: unknown, detail?: string) {
    super(
      detail === undefined
        ? 'journal runtime is not authorized to execute the append routine'
        : `journal runtime is not authorized: ${detail}`,
      cause === undefined ? undefined : { cause },
    );
  }
}

/** The bounded seq-race retries were exhausted; nothing was written for this command. */
export class JournalContendedError extends Error {
  override readonly name = 'JournalContendedError';
  readonly code = 'journal_contended';
  constructor(readonly attempts: number) {
    super(`journal append contended: ${attempts} attempts lost the seq race`);
  }
}

export type JournalIntegrityFinding =
  | 'chain_head_divergence'
  | 'chain_head_absent'
  | 'row_undecodable'
  | 'column_mismatch'
  | 'verify_failed'
  | 'unclassified';

/** An integrity finding from the routine or the head read. Never retried, never answered as success. */
export class JournalIntegrityError extends Error {
  override readonly name = 'JournalIntegrityError';
  readonly code = 'journal_integrity_failure';
  constructor(
    readonly finding: JournalIntegrityFinding,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
  }
}

/** Credential-shaped material would reach a persisted row (contract §6.3). The value is never carried. */
export class JournalCredentialMaterialError extends Error {
  override readonly name = 'JournalCredentialMaterialError';
  readonly code = 'credential_material';
  constructor() {
    super('secrets and credentials must not be persisted in journal records');
  }
}

/** The append would break the command's cross-row rules (contract §2, §5.3). Nothing was written. */
export class JournalSequenceError extends Error {
  override readonly name = 'JournalSequenceError';
  readonly code = 'journal_sequence_violation';
  constructor(
    readonly commandId: string,
    readonly reason: string,
  ) {
    super(`journal sequence violation for ${commandId}: ${reason}`);
  }
}

/** A `completed` the authorization test did not pass (contract §5.3). Nothing was written. */
export class JournalCompletionRefusedError extends Error {
  override readonly name = 'JournalCompletionRefusedError';
  readonly code = 'completion_not_authorized';
  constructor(
    readonly commandId: string,
    readonly coverage: Exclude<AuthorizationCoverage, 'covers'> | 'no_resolver',
  ) {
    super(`completed refused for ${commandId}: authorization coverage is ${coverage}`);
  }
}

/** The lifecycle event a row names is missing, or is not the one the row says it is (contract §1.4). */
export class JournalLifecycleReferenceError extends Error {
  override readonly name = 'JournalLifecycleReferenceError';
  readonly code = 'lifecycle_reference_invalid';
  constructor(readonly reason: string) {
    super(`lifecycle_event_ref invalid: ${reason}`);
  }
}

/** An `inTransaction` append was offered a client that is not inside a transaction block. */
export class JournalTransactionRequiredError extends Error {
  override readonly name = 'JournalTransactionRequiredError';
  readonly code = 'journal_transaction_required';
  constructor(cause?: unknown) {
    super('this journal append joins a caller transaction, and the client is not in one', cause === undefined ? undefined : { cause });
  }
}

// ---------------------------------------------------------------------------
// Request validation (the HTTP body → GovernedCommandRequest)

export type JournalCommandValidation =
  | { readonly ok: true; readonly value: GovernedCommandRequest }
  | { readonly ok: false; readonly reason: string };

const REQUIRED_STRING_FIELDS = [
  'commandKind',
  'actorId',
  'roleId',
  'authorizationRef',
  'repository',
  'scopeRef',
  'intendedProvider',
  'intendedModel',
  'intendedSurface',
] as const;

/**
 * Fields the server assigns. A body carrying one is refused, not silently
 * overridden: a caller able to supply `recordedAt` could backdate an event,
 * and `seq`, the record class and the event type are this module's alone.
 */
const SERVER_ASSIGNED_FIELDS = ['seq', 'recordedAt', 'recordClass', 'eventType'] as const;

const KNOWN_FIELDS: ReadonlySet<string> = new Set([...REQUIRED_STRING_FIELDS, 'argv', 'evidenceRefs', 'commandId']);

/**
 * Validate a `POST /journal/commands` body into a `GovernedCommandRequest`.
 * Reasons name FIELDS from the fixed lists above and never echo a value or
 * an unknown key: caller-controlled text is treated as credential-bearing
 * until the write-path guard has seen it (`executeWithoutJournal`'s reasoning).
 */
export function validateJournalCommandBody(body: unknown): JournalCommandValidation {
  if (!isPlainObject(body)) return { ok: false, reason: 'body must be an object' };
  for (const field of SERVER_ASSIGNED_FIELDS) {
    if (field in body) return { ok: false, reason: `${field} is server-assigned and must not be supplied` };
  }
  for (const key of Object.keys(body)) {
    if (!KNOWN_FIELDS.has(key)) return { ok: false, reason: 'body carries a field outside the journaled command shape' };
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    if (!isNonEmptyString(body[field])) return { ok: false, reason: `${field} is required and must be a non-empty string` };
  }
  const argv = body['argv'];
  if (!Array.isArray(argv) || !argv.every((entry) => typeof entry === 'string')) {
    return { ok: false, reason: 'argv is required and must be an array of strings' };
  }
  const evidenceRefs = body['evidenceRefs'];
  if (evidenceRefs !== undefined && (!Array.isArray(evidenceRefs) || !evidenceRefs.every(isNonEmptyString))) {
    return { ok: false, reason: 'evidenceRefs, when present, must be an array of non-empty strings' };
  }
  const commandId = body['commandId'];
  if (commandId !== undefined && (typeof commandId !== 'string' || !commandId.startsWith(COMMAND_ID_PREFIX) || commandId === COMMAND_ID_PREFIX)) {
    return { ok: false, reason: `commandId, when present, must be in the ${COMMAND_ID_PREFIX} namespace` };
  }
  return {
    ok: true,
    value: {
      commandKind: body['commandKind'] as string,
      argv: [...(argv as string[])],
      actorId: body['actorId'] as string,
      roleId: body['roleId'] as string,
      authorizationRef: body['authorizationRef'] as string,
      repository: body['repository'] as string,
      scopeRef: body['scopeRef'] as string,
      intendedProvider: body['intendedProvider'] as string,
      intendedModel: body['intendedModel'] as string,
      intendedSurface: body['intendedSurface'] as string,
      ...(evidenceRefs === undefined ? {} : { evidenceRefs: [...(evidenceRefs as string[])] }),
      ...(commandId === undefined ? {} : { commandId }),
    },
  };
}

// ---------------------------------------------------------------------------
// The store

/** The routine's five arguments, in signature order (migration 0006, statement 9). */
const APPEND_SQL =
  'SELECT seq::text AS seq, chain_hash FROM public.command_journal_append($1, $2, $3, $4, $5)';

/** `br_app_runtime` holds SELECT on the head (migration 0006, statement 12). */
const HEAD_SQL = 'SELECT seq::text AS seq FROM public.command_journal_chain_head WHERE head_id = 1';

/** The one role the journal may be written as (migration 0006, statements 3 and 11). */
export const JOURNAL_RUNTIME_ROLE = 'br_app_runtime';

/** Both the login and the effective role, so a SET ROLE in either direction is visible. */
const IDENTITY_SQL = 'SELECT session_user::text AS session_user, current_user::text AS current_user';

export class JournalStore {
  private readonly now: () => Date;
  private readonly maxSeqRaceRetries: number;
  private readonly resolveCompletion: CompletionAuthorizationResolver | undefined;

  constructor(
    private readonly pool: Pool,
    options: JournalStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxSeqRaceRetries = validMaxSeqRaceRetries(options.maxSeqRaceRetries);
    this.resolveCompletion = options.resolveCompletionAuthorization;
  }

  /**
   * Append one `journaled` command-class event. Returns only after the
   * routine has committed the row; every other outcome is a typed error.
   *
   * Order: normalize and redact → whole-row credential guard → identity
   * latch → BEGIN → append lock → read the head → encode at head + 1 → call
   * the routine → cross-row check → COMMIT → return. A seq race re-enters at
   * the head read and RE-ENCODES; an integrity finding leaves the loop
   * immediately.
   */
  async appendJournaled(request: GovernedCommandRequest): Promise<JournaledAppendResult> {
    const { rowInput, envelopeDigest: digest } = buildJournaledRow(request, this.now);
    const appended = await this.standalone((client) => this.appendCommandRow(client, rowInput));
    return { commandId: appended.commandId, seq: appended.seq, chainHash: appended.chainHash, envelopeDigest: digest };
  }

  /** Append one later command event (`identity_bound` to `resolved`) in its own transaction. */
  async appendCommandEvent(event: LaterCommandEvent): Promise<AppendedRecord> {
    const row = this.laterRow(event);
    return this.standalone((client) => this.appendCommandRow(client, row));
  }

  /**
   * The appends that join a caller's transaction. The caller has issued
   * BEGIN on `client` and owns COMMIT and ROLLBACK; the store issues neither.
   * A refused append rolls back to its own savepoint, so the caller's
   * transaction stays usable and the caller decides what happens to it.
   */
  inTransaction(client: PoolClient): JournalTransaction {
    return {
      appendCommandEvent: async (event) => {
        const row = this.laterRow(event);
        return this.joined(client, () => this.appendCommandRow(client, row));
      },
      appendDecision: async (decision) => {
        const prepared = this.decisionRow(decision);
        return this.joined(client, () => this.appendDecisionRow(client, prepared));
      },
    };
  }

  /**
   * Recompute the chain from genesis over the stored bytes alone, in one
   * read-only snapshot, and run the cross-row rules over every command.
   * Never trusts the head; reports the first defect, never repairs it.
   */
  async verify(): Promise<JournalVerifyResult> {
    return (await this.scan()).result;
  }

  /** Every record in `seq` order, decoded, after a full verify. Refuses on any defect. */
  async reconstruct(): Promise<readonly JournalRecord[]> {
    const { result, records } = await this.scan();
    if (!result.ok) {
      throw new JournalIntegrityError('verify_failed', `reconstruct refused: ${result.reason}`);
    }
    return records;
  }

  /**
   * The rows sharing one command_id, decoded, with the command's derived
   * state. A read, not a verification: recovery verifies the chain first.
   */
  async commandHistory(commandId: string): Promise<CommandHistory> {
    const client = await acquire(this.pool);
    try {
      const entries = await readBound(client, commandId);
      const commands = entries.flatMap((e) => (e.decoded.recordClass === RECORD_CLASS_COMMAND ? [e.decoded.row] : []));
      return { commandId, entries, state: commands.length === 0 ? null : deriveCommandState(commands) };
    } catch (error) {
      throw isConnectionFailure(error) ? new JournalStoreUnavailableError(error) : error;
    } finally {
      client.release();
    }
  }

  // ---- transaction shells -------------------------------------------------

  /** Latch, then one transaction of the store's own around one append. */
  private async standalone(append: (client: PoolClient) => Promise<AppendedRecord>): Promise<AppendedRecord> {
    const client = await acquire(this.pool);
    try {
      await requireRuntimeIdentity(client);
      await client.query('BEGIN');
      try {
        const appended = await append(client);
        await client.query('COMMIT');
        return appended;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    } catch (error) {
      throw isConnectionFailure(error) ? new JournalStoreUnavailableError(error) : error;
    } finally {
      client.release();
    }
  }

  /** Latch, then the append, inside the caller's transaction. */
  private async joined(client: PoolClient, append: () => Promise<AppendedRecord>): Promise<AppendedRecord> {
    try {
      await requireRuntimeIdentity(client);
      return await append();
    } catch (error) {
      throw isConnectionFailure(error) ? new JournalStoreUnavailableError(error) : error;
    }
  }

  // ---- row preparation (before any statement) -----------------------------

  private laterRow(event: LaterCommandEvent): Omit<CommandEventRow, 'seq'> {
    if ((event.eventType as string) === EVENT_TYPE_JOURNALED) {
      throw new RangeError('journaled is appended through appendJournaled, which builds its envelope');
    }
    const row: Omit<CommandEventRow, 'seq'> = {
      ...copyLaterEvent(event),
      recordedAt: canonicalRecordedAt(this.now()),
    };
    if (containsCredentialMaterial(credentialSurfaceOf(row))) {
      throw new JournalCredentialMaterialError();
    }
    // Validate before any statement: the encoder's field rules do not depend
    // on `seq`, so a row it refuses here is refused without touching the store.
    encodeCommandEventRow({ ...row, seq: '1' });
    return row;
  }

  private decisionRow(decision: DecisionInput): PreparedDecision {
    const { commandId, ...rest } = decision;
    if (typeof commandId !== 'string' || !commandId.startsWith(COMMAND_ID_PREFIX) || commandId === COMMAND_ID_PREFIX) {
      throw new RangeError(`a decision is bound to a planner command in the ${COMMAND_ID_PREFIX} namespace`);
    }
    const row: Omit<DecisionRecordRow, 'seq'> = {
      ...rest,
      lifecycleEventRef: { ...rest.lifecycleEventRef },
      actorId: DECISION_ACTOR,
      recordedAt: canonicalRecordedAt(this.now()),
    };
    if (
      containsCredentialMaterial([
        commandId,
        row.authorizationRef,
        row.lifecycleEventRef.roomId,
        row.lifecycleEventRef.eventId,
      ])
    ) {
      throw new JournalCredentialMaterialError();
    }
    encodeDecisionRecordRow({ ...row, seq: '1' });
    return { commandId, row };
  }

  // ---- the appends ---------------------------------------------------------

  private async appendCommandRow(client: PoolClient, rowInput: Omit<CommandEventRow, 'seq'>): Promise<AppendedRecord> {
    return this.appendWithin(client, {
      recordClass: RECORD_CLASS_COMMAND,
      commandId: rowInput.commandId,
      eventType: rowInput.eventType,
      encodeAt: (seq) => encodeCommandEventRow({ ...rowInput, seq }),
      check: async () => {
        if (rowInput.lifecycleEventRef !== undefined) {
          await requireLifecycleEvent(client, rowInput.lifecycleEventRef, null);
        }
        const entries = await readBound(client, rowInput.commandId);
        requireSound(rowInput.commandId, entries);
        await this.requireCompletionAuthorized(rowInput.commandId, entries);
      },
    });
  }

  private async appendDecisionRow(client: PoolClient, prepared: PreparedDecision): Promise<AppendedRecord> {
    const { commandId, row } = prepared;
    return this.appendWithin(client, {
      recordClass: RECORD_CLASS_DECISION,
      commandId,
      eventType: row.decision,
      encodeAt: (seq) => encodeDecisionRecordRow({ ...row, seq }),
      check: async () => {
        await requireLifecycleEvent(client, row.lifecycleEventRef, row);
        requireSound(commandId, await readBound(client, commandId));
      },
    });
  }

  /**
   * The append protocol, on a client already inside a transaction: lock,
   * then per attempt head read → encode → routine → cross-row check, all
   * inside one savepoint. Returns only with the row inserted and checked;
   * the enclosing COMMIT makes it durable.
   */
  private async appendWithin(client: PoolClient, plan: AppendPlan): Promise<AppendedRecord> {
    try {
      await client.query(LOCK_SQL, [JOURNAL_APPEND_LOCK_KEY]);
      await client.query(`SAVEPOINT ${SAVEPOINT}`);
    } catch (error) {
      throw classifyStoreFailure(error, plan.commandId);
    }
    try {
      const attempts = this.maxSeqRaceRetries + 1;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        let seq: string;
        try {
          seq = await nextSeq(client);
        } catch (error) {
          // The head read is classified by the SAME mapper as the routine
          // call. A login without SELECT on the head table fails here, first,
          // with 42501 — after `0006` and before Tranche D that is production's
          // failure — and it must answer runtime-not-authorized, not a bare 500.
          throw classifyStoreFailure(error, plan.commandId);
        }
        // Encoded INSIDE the loop, at THIS attempt's seq: `seq` is part of the
        // canonical bytes (`event-row.ts` TAG_SEQ) and the routine does not
        // cross-check it against `p_seq`.
        const bytes = plan.encodeAt(seq);
        let committed: { seq: string; chain_hash: string } | undefined;
        try {
          const { rows } = await client.query<{ seq: string; chain_hash: string }>(APPEND_SQL, [
            plan.recordClass,
            plan.commandId,
            plan.eventType,
            seq,
            Buffer.from(bytes),
          ]);
          committed = rows[0];
        } catch (error) {
          if (isSeqRace(error)) {
            await client.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
            continue;
          }
          throw classifyStoreFailure(error, plan.commandId);
        }
        if (committed === undefined) {
          throw new JournalIntegrityError('unclassified', 'command_journal_append returned no row');
        }
        await plan.check();
        await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
        return {
          recordClass: plan.recordClass,
          commandId: plan.commandId,
          eventType: plan.eventType,
          seq: String(committed.seq),
          chainHash: committed.chain_hash,
        };
      }
      throw new JournalContendedError(attempts);
    } catch (error) {
      // Whatever ends the attempt — a refusal, a finding, contention — its
      // statements are undone back to the savepoint, so nothing of it stays
      // in the transaction and a caller's transaction is left usable.
      await client.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`).catch(() => undefined);
      throw error;
    }
  }

  /**
   * The authorization test of §5.3, run when the appended row makes the
   * command `completed`, directly or as a `resolved` determination. The
   * sequence rules have already required a `dispatched` row, so the
   * observed route exists.
   */
  private async requireCompletionAuthorized(commandId: string, entries: readonly JournalRecord[]): Promise<void> {
    const rows = entries.flatMap((e) => (e.decoded.recordClass === RECORD_CLASS_COMMAND ? [e.decoded.row] : []));
    const latest = rows[rows.length - 1];
    const completes =
      latest !== undefined
      && (latest.eventType === 'completed'
        || (latest.eventType === 'resolved' && latest.resolutionDetermination === 'completed'));
    if (!completes) return;
    if (this.resolveCompletion === undefined) throw new JournalCompletionRefusedError(commandId, 'no_resolver');
    const journaled = rows[0] as CommandEventRow;
    const dispatched = rows.find((row) => row.eventType === 'dispatched') as CommandEventRow;
    const identity = (name: 'roomId' | 'runId' | 'executionId'): string | undefined =>
      rows.find((row) => row[name] !== undefined)?.[name];
    const roomId = identity('roomId');
    const runId = identity('runId');
    const executionId = identity('executionId');
    const coverage = await this.resolveCompletion({
      commandId,
      authorizationRef: journaled.authorizationRef as string,
      repository: journaled.repository as string,
      scopeRef: journaled.scopeRef as string,
      ...(roomId === undefined ? {} : { roomId }),
      ...(runId === undefined ? {} : { runId }),
      ...(executionId === undefined ? {} : { executionId }),
      intended: {
        provider: journaled.intendedProvider as string,
        model: journaled.intendedModel as string,
        executionSurface: journaled.intendedSurface as string,
      },
      observed: {
        provider: dispatched.provider as string,
        model: dispatched.model as string,
        executionSurface: dispatched.executionSurface as string,
      },
    });
    if (coverage !== 'covers') {
      throw new JournalCompletionRefusedError(commandId, coverage === 'does_not_cover' ? 'does_not_cover' : 'indeterminate');
    }
  }

  // ---- the read side -------------------------------------------------------

  private async scan(): Promise<{ result: JournalVerifyResult; records: JournalRecord[] }> {
    const client = await acquire(this.pool);
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const scanned = await scanChain(client);
        await client.query('COMMIT');
        return scanned;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    } catch (error) {
      throw isConnectionFailure(error) ? new JournalStoreUnavailableError(error) : error;
    } finally {
      client.release();
    }
  }
}

/** The appends available inside a caller's transaction. */
export interface JournalTransaction {
  appendCommandEvent(event: LaterCommandEvent): Promise<AppendedRecord>;
  appendDecision(decision: DecisionInput): Promise<AppendedRecord>;
}

interface AppendPlan {
  readonly recordClass: typeof RECORD_CLASS_COMMAND | typeof RECORD_CLASS_DECISION;
  readonly commandId: string;
  readonly eventType: string;
  readonly encodeAt: (seq: string) => Uint8Array;
  readonly check: () => Promise<void>;
}

interface PreparedDecision {
  readonly commandId: string;
  readonly row: Omit<DecisionRecordRow, 'seq'>;
}

/** A deep copy, so a caller mutating its own object after the call cannot reach the encoded row. */
function copyLaterEvent(event: LaterCommandEvent): Omit<CommandEventRow, 'seq' | 'recordedAt'> {
  return {
    ...event,
    evidenceRefs: [...(event.evidenceRefs ?? [])],
    ...(event.lifecycleEventRef === undefined ? {} : { lifecycleEventRef: { ...event.lifecycleEventRef } }),
  };
}

/** A finite integer >= 0, or a `RangeError`: a retry bound that does not bound is not a bound. */
function validMaxSeqRaceRetries(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_SEQ_RACE_RETRIES;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new RangeError('maxSeqRaceRetries must be a finite integer >= 0');
  }
  return value;
}

// ---------------------------------------------------------------------------
// Row construction — the `journaled` shape exactly as `dispatchGovernedCommand` builds it

interface JournaledRowInput {
  readonly rowInput: Omit<CommandEventRow, 'seq'>;
  readonly envelopeDigest: string;
}

function buildJournaledRow(request: GovernedCommandRequest, now: () => Date): JournaledRowInput {
  let envelope;
  try {
    envelope = normalizeForJournal(request);
  } catch (error) {
    if (error instanceof DispatchError && error.code === 'credential_material') {
      throw new JournalCredentialMaterialError();
    }
    throw error;
  }
  const digest = envelopeDigest(envelope);
  const row: Omit<CommandEventRow, 'seq'> = {
    eventType: EVENT_TYPE_JOURNALED,
    commandId: request.commandId ?? newCommandId(),
    actorId: request.actorId,
    roleId: request.roleId,
    repository: request.repository,
    scopeRef: request.scopeRef,
    commandEnvelope: envelope,
    envelopeDigest: digest,
    authorizationRef: request.authorizationRef,
    intendedProvider: request.intendedProvider,
    intendedModel: request.intendedModel,
    intendedSurface: request.intendedSurface,
    evidenceRefs: [...(request.evidenceRefs ?? [])],
    recordedAt: canonicalRecordedAt(now()),
  };
  // The whole row, not just the envelope: `actorId`, `authorizationRef`,
  // the routing identities and `commandId` are all caller-supplied and all
  // reach the chained bytes (contract §6.3).
  if (containsCredentialMaterial(credentialSurfaceOf(row))) {
    throw new JournalCredentialMaterialError();
  }
  return { rowInput: row, envelopeDigest: digest };
}

function newCommandId(): string {
  return `${COMMAND_ID_PREFIX}${randomBytes(12).toString('hex')}`;
}

/** Canonical RFC 3339 UTC with six fractional digits (contract §2), from the clock, never the caller. */
function canonicalRecordedAt(at: Date): string {
  if (Number.isNaN(at.getTime())) {
    throw new RangeError('clock returned a value with no canonical UTC form');
  }
  // toISOString gives milliseconds; the canonical form is microseconds.
  const canonical = at.toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
  if (!isCanonicalRecordedAt(canonical)) {
    throw new RangeError('clock returned a value with no canonical UTC form');
  }
  return canonical;
}

/**
 * Every string in a row that could carry operator-supplied text — the
 * equivalent of `packages/journal/src/store.ts` `credentialSurfaceOf`, kept
 * field-for-field so a later event type gains no unguarded field here. Each
 * value is scanned separately, never concatenated, so a credential cannot
 * hide beside a redaction marker contributed by another field.
 */
function credentialSurfaceOf(row: Omit<CommandEventRow, 'seq'>): string[] {
  const envelope = row.commandEnvelope;
  return [
    row.commandId,
    row.eventType,
    ...row.evidenceRefs,
    ...(envelope === undefined
      ? []
      : [envelope.commandKind, ...envelope.argv, envelope.targetRepository, envelope.scopeRef]),
    row.roomId,
    row.runId,
    row.executionId,
    row.actorId,
    row.roleId,
    row.repository,
    row.scopeRef,
    row.authorizationRef,
    row.intendedProvider,
    row.intendedModel,
    row.intendedSurface,
    row.provider,
    row.model,
    row.executionSurface,
    row.failureClassification,
    row.lifecycleEventRef?.roomId,
    row.lifecycleEventRef?.eventId,
  ].filter((value): value is string => value !== undefined);
}

// ---------------------------------------------------------------------------
// The identity latch

/**
 * Refuse unless the connected role is `br_app_runtime`, BEFORE any journal
 * statement: no head read, no routine call, nothing written.
 *
 * Checked per request, not cached per pooled connection. The cost is one
 * round trip on a path that is never hot (a governed command is rare and
 * the routine's own work dwarfs it); the return is that there is no cache
 * to reason about across pool reconnects, and no way for a SET ROLE issued
 * on a reused connection to be answered from a stale verdict. Both halves
 * must match: `session_user` is the login Tranche D changes, `current_user`
 * is what SET ROLE changes, and an owner-class login that SET ROLEs into
 * the runtime is still an owner-class login.
 */
async function requireRuntimeIdentity(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ session_user: string; current_user: string }>(IDENTITY_SQL);
  const identity = rows[0];
  if (
    identity === undefined
    || identity.session_user !== JOURNAL_RUNTIME_ROLE
    || identity.current_user !== JOURNAL_RUNTIME_ROLE
  ) {
    throw new JournalRuntimeNotAuthorizedError(
      undefined,
      `connected role is not ${JOURNAL_RUNTIME_ROLE} (session_user=${identity?.session_user ?? '?'}, current_user=${identity?.current_user ?? '?'})`,
    );
  }
}

// ---------------------------------------------------------------------------
// The head read

async function nextSeq(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ seq: string }>(HEAD_SQL);
  const current = rows[0]?.seq;
  if (current === undefined) {
    // The routine would raise the same finding; refusing here saves a call
    // and keeps the classification in one place.
    throw new JournalIntegrityError('chain_head_absent', 'command_journal_chain_head row is absent (integrity finding)');
  }
  const head = String(current);
  if (!/^(0|[1-9][0-9]*)$/.test(head)) {
    throw new JournalIntegrityError('unclassified', 'command_journal_chain_head seq is not a canonical non-negative integer');
  }
  const seq = String(BigInt(head) + 1n);
  if (!isCanonicalSeq(seq)) {
    throw new JournalIntegrityError('unclassified', 'next seq is not canonical');
  }
  return seq;
}

// ---------------------------------------------------------------------------
// Reading rows back: one command's rows, and the whole chain

interface StoredRow {
  readonly seq: string;
  readonly record_class: string;
  readonly command_id: string;
  readonly event_type: string;
  readonly chain_hash: string;
  readonly row_bytes: Buffer;
}

/*
 * `e.seq` in ORDER BY, never the bare name: the select list renames
 * `seq::text AS seq`, and a bare `ORDER BY seq` binds to that TEXT output
 * column, which sorts '10' before '9'.
 */
const ROW_COLUMNS = 'e.seq::text AS seq, e.record_class, e.command_id, e.event_type, e.chain_hash, e.row_bytes';
const BOUND_SQL = `SELECT ${ROW_COLUMNS} FROM public.command_journal_events AS e WHERE e.command_id = $1 ORDER BY e.seq`;
const PAGE_SQL = `SELECT ${ROW_COLUMNS} FROM public.command_journal_events AS e WHERE e.seq > $1::bigint ORDER BY e.seq LIMIT $2`;
const SCAN_PAGE = 1000;

/**
 * Decode a stored row and hold its columns to its bytes: the record class,
 * the event type and the seq the row was inserted under must be the ones
 * its bytes carry, and a command row's command_id column must be its
 * bytes' command_id. The routine takes those columns from the caller and
 * does not cross-check them, so this is where a disagreement is caught.
 */
function decodeStored(stored: StoredRow): { record: JournalRecord } | { defect: string } {
  let decoded: DecodedJournalRow;
  try {
    decoded = decodeJournalRow(new Uint8Array(stored.row_bytes));
  } catch (error) {
    if (error instanceof JournalDecodeError) return { defect: `row at seq ${stored.seq} does not decode: ${error.message}` };
    throw error;
  }
  const eventType = decoded.recordClass === RECORD_CLASS_COMMAND ? decoded.row.eventType : decoded.row.decision;
  if (decoded.recordClass !== stored.record_class) return { defect: `row at seq ${stored.seq}: record_class column disagrees with its bytes` };
  if (eventType !== stored.event_type) return { defect: `row at seq ${stored.seq}: event_type column disagrees with its bytes` };
  if (decoded.row.seq !== String(stored.seq)) return { defect: `row at seq ${stored.seq}: its bytes carry seq ${decoded.row.seq}` };
  if (decoded.recordClass === RECORD_CLASS_COMMAND && decoded.row.commandId !== stored.command_id) {
    return { defect: `row at seq ${stored.seq}: command_id column disagrees with its bytes` };
  }
  return { record: { seq: String(stored.seq), commandId: stored.command_id, chainHash: stored.chain_hash, decoded } };
}

async function readBound(client: PoolClient, commandId: string): Promise<JournalRecord[]> {
  const { rows } = await client.query<StoredRow>(BOUND_SQL, [commandId]);
  return rows.map((stored) => {
    const outcome = decodeStored(stored);
    if ('defect' in outcome) {
      throw new JournalIntegrityError(
        /does not decode/.test(outcome.defect) ? 'row_undecodable' : 'column_mismatch',
        outcome.defect,
      );
    }
    return outcome.record;
  });
}

function boundEntries(entries: readonly JournalRecord[]): BoundEntry[] {
  return entries.map((e) => e.decoded as BoundEntry);
}

/** The cross-row rules over one command_id's rows, or the reason they fail. */
function soundnessDefect(entries: readonly JournalRecord[]): string | null {
  const commands = entries.flatMap((e) => (e.decoded.recordClass === RECORD_CLASS_COMMAND ? [e.decoded.row] : []));
  if (commands.length > 0) {
    const defect = commandSequenceDefect(commands);
    if (defect !== null) return defect.reason;
  }
  return boundDecisionDefect(boundEntries(entries))?.reason ?? null;
}

function requireSound(commandId: string, entries: readonly JournalRecord[]): void {
  const reason = soundnessDefect(entries);
  if (reason !== null) throw new JournalSequenceError(commandId, reason);
}

/**
 * The whole chain, from genesis, in pages, inside the caller's read-only
 * snapshot. Stops at the first defect.
 */
async function scanChain(client: PoolClient): Promise<{ result: JournalVerifyResult; records: JournalRecord[] }> {
  const records: JournalRecord[] = [];
  const fail = (reason: string, atSeq: string | null) => ({ result: { ok: false as const, reason, atSeq }, records });
  const head = await client.query<{ seq: string; chain_hash: string }>(
    'SELECT seq::text AS seq, chain_hash FROM public.command_journal_chain_head WHERE head_id = 1',
  );
  const headRow = head.rows[0];
  if (headRow === undefined) return fail('command_journal_chain_head row is absent', null);

  let prior = GENESIS_CHAIN_HASH;
  let expected = 1n;
  const byCommand = new Map<string, JournalRecord[]>();
  for (;;) {
    const { rows } = await client.query<StoredRow>(PAGE_SQL, [String(expected - 1n), SCAN_PAGE]);
    for (const stored of rows) {
      const seq = String(stored.seq);
      if (BigInt(seq) !== expected) return fail(`seq gap: expected ${String(expected)}, found ${seq}`, seq);
      if (chainHash(prior, new Uint8Array(stored.row_bytes)) !== stored.chain_hash) {
        return fail(`chain hash mismatch at seq ${seq}`, seq);
      }
      const outcome = decodeStored(stored);
      if ('defect' in outcome) return fail(outcome.defect, seq);
      records.push(outcome.record);
      const group = byCommand.get(stored.command_id) ?? [];
      group.push(outcome.record);
      byCommand.set(stored.command_id, group);
      prior = stored.chain_hash;
      expected += 1n;
    }
    if (rows.length < SCAN_PAGE) break;
  }
  const tailSeq = String(expected - 1n);
  if (String(headRow.seq) !== tailSeq || headRow.chain_hash !== prior) {
    return fail(`chain head (seq ${String(headRow.seq)}) disagrees with the recomputed tail (seq ${tailSeq})`, String(headRow.seq));
  }
  for (const [commandId, entries] of byCommand) {
    const reason = soundnessDefect(entries);
    if (reason !== null) return fail(`command ${commandId}: ${reason}`, entries[entries.length - 1]?.seq ?? null);
  }
  return { result: { ok: true, headSeq: tailSeq, headChainHash: prior, commands: byCommand.size }, records };
}

// ---------------------------------------------------------------------------
// The lifecycle event a row names (contract §1.4)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const LIFECYCLE_SQL = `SELECT event, outcome, from_state, (xmin = pg_current_xact_id()::xid) AS this_transaction
  FROM public.build_room_events WHERE room_id = $1::uuid AND event_id = $2`;

/**
 * The named lifecycle event must exist. For a decision it must also be the
 * same act — a committed transition of the decision's own event, fired from
 * the recorded state — and it must have been written by this very
 * transaction, so the pair commits together or not at all (§1.4, option
 * (a)). `xmin` names the inserting transaction; a lifecycle row inserted
 * inside a subtransaction would carry the subtransaction's id and be
 * refused, which fails closed. `RECONCILING`'s prior state is not checked
 * here: the lifecycle row does not carry it as a column.
 */
async function requireLifecycleEvent(
  client: PoolClient,
  ref: { readonly roomId: string; readonly eventId: string },
  decision: Omit<DecisionRecordRow, 'seq'> | null,
): Promise<void> {
  if (!UUID_PATTERN.test(ref.roomId)) {
    throw new JournalLifecycleReferenceError('room_id is not a room identifier');
  }
  const { rows } = await client.query<{ event: string; outcome: string; from_state: string | null; this_transaction: boolean }>(
    LIFECYCLE_SQL,
    [ref.roomId, ref.eventId],
  );
  const event = rows[0];
  if (event === undefined) throw new JournalLifecycleReferenceError('no such lifecycle event');
  if (decision === null) return;
  if (event.outcome !== 'transition') throw new JournalLifecycleReferenceError('the lifecycle event is not a committed transition');
  if (event.event !== decision.decision) throw new JournalLifecycleReferenceError('the lifecycle event is a different act');
  if (event.from_state !== decision.recordedState) {
    throw new JournalLifecycleReferenceError('the lifecycle event fired from a different state than the decision records');
  }
  if (event.this_transaction !== true) {
    throw new JournalLifecycleReferenceError('the lifecycle event was not written by this transaction');
  }
}

// ---------------------------------------------------------------------------
// Failure classification

/**
 * Migration 0006, statement 9, raises SQLSTATE 23000
 * (`integrity_constraint_violation`) for THREE conditions and gives the
 * caller no other structured signal, so this is the one place message text
 * is matched. The routine's exact texts:
 *
 *   'command_journal_append: seq % is not the next position (% expected) — divergence, append aborted'
 *       → a benign race with a concurrent writer: retryable (re-read, re-encode)
 *   'command_journal_append: chain head divergence from events tail (head seq=%, tail seq=%) — integrity finding, append aborted'
 *       → a real integrity finding: never retried, never success
 *   'command_journal_append: chain head row is absent (integrity finding)'
 *       → a real integrity finding: never retried, never success
 *
 * An unrecognised 23000 text is treated as an integrity finding: fail closed
 * on what the routine did not say, rather than retry it.
 */
type RoutineRefusal = 'seq_race' | JournalIntegrityFinding;

function classifyIntegrityConstraintViolation(message: string): RoutineRefusal {
  if (message.includes('is not the next position')) return 'seq_race';
  if (message.includes('chain head divergence')) return 'chain_head_divergence';
  if (message.includes('chain head row is absent')) return 'chain_head_absent';
  return 'unclassified';
}

interface PgErrorShape {
  readonly code?: unknown;
  readonly constraint?: unknown;
  readonly message?: unknown;
}

function pgShape(error: unknown): PgErrorShape | null {
  return typeof error === 'object' && error !== null ? (error as PgErrorShape) : null;
}

function isSeqRace(error: unknown): boolean {
  const shape = pgShape(error);
  return (
    shape?.code === '23000'
    && typeof shape.message === 'string'
    && classifyIntegrityConstraintViolation(shape.message) === 'seq_race'
  );
}

/** The at-most-once index on `(command_id, event_type)` — migration 0006, statement 5. */
const ONCE_PER_COMMAND_INDEX = 'command_journal_events_once_per_command';

/**
 * One mapper for both statements the store issues — the head read and the
 * routine call — so a privilege failure on either answers the same way.
 * Returns the error to throw; connection-class failures are left as they
 * are for the caller's connection wrapper.
 */
function classifyStoreFailure(error: unknown, commandId: string): unknown {
  if (error instanceof JournalIntegrityError) return error;
  const shape = pgShape(error);
  if (shape === null) return error;
  if (shape.code === '23000' && typeof shape.message === 'string') {
    const refusal = classifyIntegrityConstraintViolation(shape.message);
    // `seq_race` is handled by the caller before this function is reached;
    // if it arrives here anyway it is reported, not swallowed.
    return new JournalIntegrityError(refusal === 'seq_race' ? 'unclassified' : refusal, shape.message, error);
  }
  if (shape.code === '23505' && shape.constraint === ONCE_PER_COMMAND_INDEX) {
    return new JournalDuplicateEventError(commandId, error);
  }
  if (shape.code === '42501') {
    return new JournalRuntimeNotAuthorizedError(error);
  }
  if (shape.code === '25P01') {
    // `SAVEPOINT` outside a transaction block: an `inTransaction` caller
    // passed a client with no BEGIN. Nothing has been written.
    return new JournalTransactionRequiredError(error);
  }
  return error;
}

/** Acquire a connection, or report the store unreachable — never a fallback. */
async function acquire(pool: Pool): Promise<PoolClient> {
  try {
    return await pool.connect();
  } catch (error) {
    throw new JournalStoreUnavailableError(error);
  }
}

/** Connection-class failures, as `store.ts` classifies them for the gate-run store. */
function isConnectionFailure(error: unknown): boolean {
  if (error instanceof JournalStoreUnavailableError) return false;
  const code = pgShape(error)?.code;
  if (typeof code === 'string') {
    // SQLSTATE class 08 (connection exception), 57P01–57P03 (shutdown / cannot connect now).
    if (code.startsWith('08') || /^57P0[123]$/.test(code)) return true;
    if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : '';
  return /Connection terminated|connection timeout/i.test(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
