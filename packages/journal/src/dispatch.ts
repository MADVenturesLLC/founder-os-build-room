/**
 * Fail-closed governed-command dispatch — the §7.2 proof.
 *
 * Contract §5.1: a governed command may not be dispatched unless its
 * `journaled` event is durably committed. Journal write failure, timeout,
 * or unavailability means NO dispatch — fail closed, never journal-after.
 *
 * There is exactly one entry point, `dispatchGovernedCommand`, and it
 * returns an execution permit only after the `journaled` row is on the
 * chain. No alternate success path exists; `executeWithoutJournal` is a
 * named refusal for callers that reach for one, and the source-honesty
 * test in `test/journal-7.2-fail-closed.test.ts` is what actually holds
 * the absence of a second path — a function that throws cannot prove that
 * by itself.
 *
 * The row written is the ratified `journaled` shape of §5.2: §2 elements
 * 1, 3 and 5–7 plus the intended routing identity. Every field that shape
 * requires is required here, so a caller cannot construct a request that
 * journals a partial record.
 */

import {
  ENVELOPE_VERSION,
  envelopeDigest,
  type NormalizedCommandEnvelope,
} from './envelope.js';
import { containsCredentialMaterial, redactArgv } from './redact.js';
import {
  JournalAppendError,
  MemoryCommandJournal,
  getActiveJournal,
  type ChainedJournalRecord,
} from './store.js';
import { COMMAND_ID_PREFIX, type CommandEventRow } from './event-row.js';
import { randomBytes } from 'node:crypto';

export type DispatchErrorCode =
  | 'journal_unavailable'
  | 'journal_append_failed'
  | 'credential_material'
  | 'bypass_forbidden';

export class DispatchError extends Error {
  readonly code: DispatchErrorCode;
  constructor(code: DispatchErrorCode, message: string) {
    super(message);
    this.name = 'DispatchError';
    this.code = code;
  }
}

/**
 * Everything the ratified `journaled` row requires (§5.2). These are not
 * optional: a `journaled` event missing any of them is invalid under
 * `BRJ:c:1`, and discovering that at encode time would be too late — the
 * command would already be mid-dispatch.
 */
export interface GovernedCommandRequest {
  readonly commandKind: string;
  readonly argv: readonly string[];
  /** §2 element 3 — who, under which role, on whose authorization. */
  readonly actorId: string;
  readonly roleId: string;
  readonly authorizationRef: string;
  /** §2 elements 5–6 — the governed target. */
  readonly repository: string;
  readonly scopeRef: string;
  /** §2 element 7 — the INTENDED route, recorded before contact. */
  readonly intendedProvider: string;
  readonly intendedModel: string;
  readonly intendedSurface: string;
  /** Recorded order, never re-sorted (§6.2). May be empty. */
  readonly evidenceRefs?: readonly string[];
  /** Fixed command id, for deterministic tests. Minted when absent. */
  readonly commandId?: string;
}

/**
 * Dispatch-side inputs that are NOT request data.
 *
 * `recorded_at` and `seq` are server-generated (contract §2 element 11), so
 * neither is a field of GovernedCommandRequest: a caller able to supply
 * `recorded_at` could backdate or future-date a journal event. `seq` is
 * assigned by the store; the timestamp is taken here, from an injectable
 * clock so tests stay deterministic without handing the capability to
 * callers.
 */
export interface DispatchOptions {
  readonly now?: () => Date;
}

/** Canonical RFC 3339 UTC with six fractional digits (contract §2). */
function canonicalRecordedAt(at: Date): string {
  const iso = at.toISOString();
  if (!iso.endsWith('Z') || Number.isNaN(at.getTime())) {
    throw new RangeError('clock returned a value with no canonical UTC form');
  }
  // toISOString gives milliseconds; the canonical form is microseconds.
  return iso.replace(/\.(\d{3})Z$/, '.$1000Z');
}

export interface DispatchResult {
  readonly ok: true;
  readonly commandId: string;
  readonly envelope: NormalizedCommandEnvelope;
  readonly envelopeDigest: string;
  readonly journalRecord: ChainedJournalRecord;
  /** Execution is permitted only after the journaled proof. */
  readonly executionPermit: { readonly commandId: string; readonly journalSeq: string };
}

function newCommandId(): string {
  return `${COMMAND_ID_PREFIX}${randomBytes(12).toString('hex')}`;
}

/**
 * Normalize and redact a command into the safe envelope of §6.1. Fails
 * closed if credential material would survive redaction — defence in
 * depth ahead of the store's own guard.
 */
export function normalizeForJournal(
  request: Pick<GovernedCommandRequest, 'commandKind' | 'argv' | 'repository' | 'scopeRef'>,
): NormalizedCommandEnvelope {
  const argv = redactArgv(request.argv);
  // Every field that lands in the envelope is checked, not just argv —
  // otherwise this function's "ahead of the store's own guard" claim would
  // be false for the two it passes through unredacted.
  if (containsCredentialMaterial([
    request.commandKind,
    request.repository,
    request.scopeRef,
    ...argv,
  ])) {
    throw new DispatchError(
      'credential_material',
      'secrets and credentials must not be persisted in journal records',
    );
  }
  return {
    envelopeVersion: ENVELOPE_VERSION,
    commandKind: request.commandKind,
    argv,
    targetRepository: request.repository,
    scopeRef: request.scopeRef,
  };
}

/**
 * The sole governed-command dispatch path. Journals first; returns an
 * execution permit only once the `journaled` record is on the chain.
 */
export function dispatchGovernedCommand(
  request: GovernedCommandRequest,
  options: DispatchOptions = {},
): DispatchResult {
  const journal = getActiveJournal();
  if (journal === null) {
    throw new DispatchError(
      'journal_unavailable',
      'governed command refused: canonical command journal is not open (fail closed)',
    );
  }

  const envelope = normalizeForJournal(request);
  const digest = envelopeDigest(envelope);
  const commandId = request.commandId ?? newCommandId();

  const row: Omit<CommandEventRow, 'seq'> = {
    eventType: 'journaled',
    commandId,
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
    evidenceRefs: request.evidenceRefs ?? [],
    recordedAt: canonicalRecordedAt((options.now ?? (() => new Date()))()),
  };

  let journalRecord: ChainedJournalRecord;
  try {
    journalRecord = journal.append(row);
  } catch (err) {
    if (err instanceof JournalAppendError) {
      // `credential_material` keeps its identity — it is a §6 secrets
      // refusal, not a generic write failure, and a caller reacts to it
      // differently. `second_writer` deliberately does NOT get its own code:
      // this path fetches the journal through `getActiveJournal()` on every
      // call, so `append` cannot see a stale instance here. A dedicated code
      // would be an untested fail-closed branch, and the original error's
      // own code is preserved in the message either way.
      throw new DispatchError(
        err.code === 'credential_material' ? 'credential_material' : 'journal_append_failed',
        `governed command refused: journal append failed (${err.code}: ${err.message})`,
      );
    }
    throw err;
  }

  return {
    ok: true,
    commandId,
    envelope,
    envelopeDigest: digest,
    journalRecord,
    executionPermit: { commandId, journalSeq: journalRecord.row.seq },
  };
}

/**
 * Named refusal for any caller reaching for an "execute without journal"
 * path. Its existence is not the proof — the source-honesty test is.
 */
export function executeWithoutJournal(request: GovernedCommandRequest): never {
  // The request is deliberately NOT echoed into the message. `commandKind`
  // and `argv` are caller-controlled and treated as credential-bearing by
  // `normalizeForJournal`, so quoting them here would route a secret into
  // logs and error reporting along the one path that never redacts.
  void request;
  throw new DispatchError(
    'bypass_forbidden',
    'governed commands cannot bypass the required journal path',
  );
}

/** The open journal, or the §5.1 fail-closed refusal. */
export function requireJournalOrThrow(): MemoryCommandJournal {
  const journal = getActiveJournal();
  if (journal === null) {
    throw new DispatchError(
      'journal_unavailable',
      'governed command refused: canonical command journal is not open (fail closed)',
    );
  }
  return journal;
}
