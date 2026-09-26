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
 * §15 stop condition 6). Until Tranche D moves `DATABASE_URL` to
 * `br_app_runtime`, production's identity lacks EXECUTE on the routine and
 * this module answers `JournalRuntimeNotAuthorizedError` — a clean,
 * distinct, fail-closed refusal, not a crash.
 */

import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  COMMAND_ID_PREFIX,
  DispatchError,
  RECORD_CLASS_COMMAND,
  containsCredentialMaterial,
  encodeCommandEventRow,
  envelopeDigest,
  isCanonicalRecordedAt,
  isCanonicalSeq,
  normalizeForJournal,
  type CommandEventRow,
  type GovernedCommandRequest,
} from '../../journal/src/index.js';

/** The one event type this slice appends. Later lifecycle events are out of scope. */
const EVENT_TYPE_JOURNALED = 'journaled' as const;

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
  /** Bound on seq-race retries; defaults to `DEFAULT_MAX_SEQ_RACE_RETRIES`. */
  readonly maxSeqRaceRetries?: number;
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
 * The connected login lacks EXECUTE on the append routine (SQLSTATE 42501).
 * This is production's answer until Tranche D: distinct and fail-closed.
 */
export class JournalRuntimeNotAuthorizedError extends Error {
  override readonly name = 'JournalRuntimeNotAuthorizedError';
  readonly code = 'journal_runtime_not_authorized';
  constructor(cause?: unknown) {
    super('journal runtime is not authorized to execute the append routine', cause === undefined ? undefined : { cause });
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

export type JournalIntegrityFinding = 'chain_head_divergence' | 'chain_head_absent' | 'unclassified';

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

export class JournalStore {
  private readonly now: () => Date;
  private readonly maxSeqRaceRetries: number;

  constructor(
    private readonly pool: Pool,
    options: JournalStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxSeqRaceRetries = options.maxSeqRaceRetries ?? DEFAULT_MAX_SEQ_RACE_RETRIES;
  }

  /**
   * Append one `journaled` command-class event. Returns only after the
   * routine has committed the row; every other outcome is a typed error.
   *
   * Order: normalize and redact → whole-row credential guard → read the head
   * → encode at head + 1 → call the routine → return. A seq race re-enters
   * at the head read and RE-ENCODES; an integrity finding leaves the loop
   * immediately.
   */
  async appendJournaled(request: GovernedCommandRequest): Promise<JournaledAppendResult> {
    const { rowInput, envelopeDigest: digest } = buildJournaledRow(request, this.now);
    const client = await acquire(this.pool);
    try {
      const attempts = this.maxSeqRaceRetries + 1;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const seq = await nextSeq(client);
        // Encoded INSIDE the loop, at THIS attempt's seq: `seq` is part of the
        // canonical bytes (`event-row.ts` TAG_SEQ) and the routine does not
        // cross-check it against `p_seq`.
        const row: CommandEventRow = { ...rowInput, seq };
        const bytes = encodeCommandEventRow(row);
        try {
          const { rows } = await client.query<{ seq: string; chain_hash: string }>(APPEND_SQL, [
            RECORD_CLASS_COMMAND,
            row.commandId,
            EVENT_TYPE_JOURNALED,
            seq,
            Buffer.from(bytes),
          ]);
          const committed = rows[0];
          if (committed === undefined) {
            throw new JournalIntegrityError('unclassified', 'command_journal_append returned no row');
          }
          return {
            commandId: row.commandId,
            seq: String(committed.seq),
            chainHash: committed.chain_hash,
            envelopeDigest: digest,
          };
        } catch (error) {
          if (isSeqRace(error)) continue;
          throw classifyAppendFailure(error, row.commandId);
        }
      }
      throw new JournalContendedError(attempts);
    } catch (error) {
      throw isConnectionFailure(error) ? new JournalStoreUnavailableError(error) : error;
    } finally {
      client.release();
    }
  }
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

function classifyAppendFailure(error: unknown, commandId: string): unknown {
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
