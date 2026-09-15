/**
 * The independent checkpoint writer seat (Lane 2).
 *
 * INDEPENDENT SEAT, modeled in the API surface: the writer is an injected
 * model call (`WriterSeatModel`) with its OWN identity and its OWN token
 * budget (`writer_budget_tokens`), configured alongside — never inside —
 * the main worker's context budget. Vocabulary alignment: Seat Registry V1
 * reserves `SeatId` for the four canonical FounderOS roles
 * (researcher / architect / builder / independent-reviewer, see
 * packages/seat-registry/src/vocabulary.ts — NOT modified by this lane);
 * `checkpoint-writer` is a package-local seat identity for this v0
 * mechanism, never asserted as a ratified seat or Role-Id.
 *
 * SINGLE-WRITER is code-enforced by the store lease: every checkpoint file
 * is written under an exclusive lock in this writer seat's name; a second
 * writer for the same file fails closed (SingleWriterError).
 *
 * Promotion protocol (MiMo notes.md pattern): the main worker's notes
 * scratch is read, the seat returns the eleven structured fields, the
 * checkpoint is validated and DURABLY persisted (sha256 verified), and
 * ONLY THEN is the scratch cleared. A throwing seat or a schema reject
 * leaves the scratch untouched and writes nothing.
 */

import { NotesLog, type NoteEntry } from './notes.js';
import {
  CHECKPOINT_IR_VERSION,
  CheckpointSchemaError,
  validateCheckpointFieldsV1,
  type CheckpointV1,
} from './schema.js';
import { CheckpointStore, type PersistedCheckpoint } from './store.js';

/** Package-local identity of the independent writer seat (see module header). */
export const WRITER_SEAT_ID = 'checkpoint-writer' as const;

/** What the writer seat is shown. `notes` are the promoted scratch entries. */
export interface WriterSeatRequest {
  readonly writer_seat_id: string;
  readonly session_id: string;
  readonly seq: number;
  readonly trigger_pct: number | null;
  /** The seat's OWN budget — never carved out of the main worker's. */
  readonly writer_budget_tokens: number;
  /** The transcript window since the previous checkpoint (host-supplied). */
  readonly transcript_window: string;
  /** Scratch notes the main worker appended since the previous checkpoint. */
  readonly notes: readonly NoteEntry[];
  /** The previous checkpoint, when one exists. */
  readonly prior_checkpoint: CheckpointV1 | null;
}

/**
 * The injected writer seat: given the request, return the eleven content
 * fields of `checkpoint/v1` (no envelope). May be async. This package never
 * contacts a provider — the host binds the seat.
 */
export type WriterSeatModel = (request: WriterSeatRequest) => unknown | Promise<unknown>;

export interface CheckpointWriterConfig {
  readonly session_id: string;
  /** Defaults to `checkpoint-writer`; also the lock owner identity. */
  readonly writer_seat_id?: string;
  /** The writer seat's own token budget (independent of the main worker's). */
  readonly writer_budget_tokens: number;
  readonly clock: () => number;
}

export interface CheckpointWriteResult extends PersistedCheckpoint {
  readonly seq: number;
  readonly notes_promoted: number;
  readonly notes_cleared: number;
}

export class CheckpointWriterError extends Error {
  override readonly name = 'CheckpointWriterError';
}

export class CheckpointWriter {
  private readonly sessionId: string;
  private readonly seatId: string;
  private readonly writerBudgetTokens: number;
  private readonly clock: () => number;
  private seq = 0;

  constructor(
    private readonly deps: CheckpointWriterConfig,
    private readonly store: CheckpointStore,
    private readonly notes: NotesLog,
    private readonly seat: WriterSeatModel,
  ) {
    if (typeof deps.session_id !== 'string' || deps.session_id.length === 0) {
      throw new CheckpointWriterError('session_id is required');
    }
    if (!Number.isInteger(deps.writer_budget_tokens) || deps.writer_budget_tokens < 1) {
      throw new CheckpointWriterError(`writer_budget_tokens must be an integer >= 1, got ${deps.writer_budget_tokens}`);
    }
    if (typeof deps.clock !== 'function') throw new CheckpointWriterError('a clock is required');
    if (typeof seat !== 'function') throw new CheckpointWriterError('a writer seat is required');
    this.sessionId = deps.session_id;
    this.seatId = deps.writer_seat_id ?? WRITER_SEAT_ID;
    this.writerBudgetTokens = deps.writer_budget_tokens;
    this.clock = deps.clock;
  }

  /** The seq the next checkpoint will carry. */
  get nextSeq(): number {
    return this.seq + 1;
  }

  /**
   * Run one checkpoint cycle. `triggerPct` is the configured threshold that
   * fired (percent, e.g. 20 / 45 / 70) or null for a non-threshold write.
   * Fail-closed throughout: any seat or schema failure aborts the lease,
   * writes nothing, and leaves the scratch intact.
   */
  async checkpoint(params: { readonly transcript_window: string; readonly trigger_pct: number | null }): Promise<CheckpointWriteResult> {
    const seq = this.nextSeq;
    const targetPath = this.store.pathFor(this.sessionId, seq);
    const scratch = this.notes.readAll();
    const prior = this.store.readLatest(this.sessionId);
    const request: WriterSeatRequest = {
      writer_seat_id: this.seatId,
      session_id: this.sessionId,
      seq,
      trigger_pct: params.trigger_pct,
      writer_budget_tokens: this.writerBudgetTokens,
      transcript_window: params.transcript_window,
      notes: scratch,
      prior_checkpoint: prior?.checkpoint ?? null,
    };

    let fields;
    try {
      fields = validateCheckpointFieldsV1(await this.seat(request));
    } catch (cause) {
      if (cause instanceof CheckpointSchemaError) throw cause;
      throw new CheckpointWriterError(`writer seat ${this.seatId} failed: ${(cause as Error).message}`);
    }

    const checkpoint: CheckpointV1 = {
      version: CHECKPOINT_IR_VERSION,
      checkpoint_id: `${this.sessionId}-cp${seq}`,
      session_id: this.sessionId,
      seq,
      created_at_ms: this.clock(),
      trigger_pct: params.trigger_pct,
      ...fields,
    };

    const lease = this.store.beginWrite(targetPath, this.seatId, this.clock());
    // commit() releases the lock in its own finally path, success or failure.
    const persisted = this.store.commit(lease, checkpoint);
    // The checkpoint is durable (hash-verified) — NOW the read prefix of the
    // scratch clears. Notes appended while the seat was running survive.
    const cleared = this.notes.clearThrough(scratch.length === 0 ? 0 : scratch[scratch.length - 1]!.seq);
    this.seq = seq;
    return { ...persisted, seq, notes_promoted: scratch.length, notes_cleared: cleared.length };
  }
}
