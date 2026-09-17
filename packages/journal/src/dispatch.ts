/**
 * Fail-closed governed-command dispatch (§7.2).
 *
 * A governed command may not execute unless its required pre-dispatch
 * journal record (`journaled`) can be established on the singular canonical
 * journal. There is exactly one dispatch entry point; bypass paths are not
 * provided and honesty tests assert their absence.
 */

import {
  encodeEnvelope,
  envelopeDigest,
  type NormalizedCommandEnvelope,
  ENVELOPE_VERSION,
} from './envelope.js';
import { redactArgv, containsCredentialMaterial, REDACTED } from './redact.js';
import {
  MemoryCommandJournal,
  JournalAppendError,
  getActiveJournal,
  type ChainedJournalRecord,
} from './store.js';
import { COMMAND_ID_PREFIX, hexOf, type CommandEventRow } from './row.js';
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

export interface GovernedCommandRequest {
  readonly commandKind: string;
  readonly argv: readonly string[];
  readonly actorId: string;
  readonly roleId: string;
  readonly authorizationRef: string;
  readonly targetRepository?: string;
  readonly scopeRef?: string;
  readonly recordedAt: string;
  /** Optional fixed command id for deterministic tests. */
  readonly commandId?: string;
}

export interface DispatchResult {
  readonly ok: true;
  readonly commandId: string;
  readonly envelope: NormalizedCommandEnvelope;
  readonly envelopeDigest: string;
  readonly journalRecord: ChainedJournalRecord;
  /** Execution is permitted only after journaled proof; payload is opaque. */
  readonly executionPermit: { readonly commandId: string; readonly journalSeq: string };
}

function newCommandId(): string {
  return `${COMMAND_ID_PREFIX}${randomBytes(12).toString('hex')}`;
}

/**
 * Normalize + redact argv into a safe envelope. Fails closed if credential
 * material would still remain after redaction (defense in depth).
 */
export function normalizeForJournal(
  request: Pick<GovernedCommandRequest, 'commandKind' | 'argv' | 'targetRepository' | 'scopeRef'>,
): NormalizedCommandEnvelope {
  const argv = redactArgv(request.argv);
  if (containsCredentialMaterial(argv)) {
    throw new DispatchError(
      'credential_material',
      'secrets and credentials must not be persisted in journal records',
    );
  }
  const envelope: NormalizedCommandEnvelope = {
    envelopeVersion: ENVELOPE_VERSION,
    commandKind: request.commandKind,
    argv,
    ...(request.targetRepository !== undefined
      ? { targetRepository: request.targetRepository }
      : {}),
    ...(request.scopeRef !== undefined ? { scopeRef: request.scopeRef } : {}),
  };
  return envelope;
}

/**
 * The sole governed-command dispatch path. Journals first; returns an
 * execution permit only after the `journaled` record is on the chain.
 */
export function dispatchGovernedCommand(request: GovernedCommandRequest): DispatchResult {
  const journal = getActiveJournal();
  if (journal === null) {
    throw new DispatchError(
      'journal_unavailable',
      'governed command refused: canonical command journal is not open (fail closed)',
    );
  }

  const envelope = normalizeForJournal(request);
  const canonical = encodeEnvelope(envelope);
  const digest = envelopeDigest(envelope);
  const commandId = request.commandId ?? newCommandId();

  const rowBase: Omit<CommandEventRow, 'seq'> = {
    recordClass: 'command',
    commandId,
    eventType: 'journaled',
    actorId: request.actorId,
    roleId: request.roleId,
    envelopeDigest: digest,
    authorizationRef: request.authorizationRef,
    recordedAt: request.recordedAt,
    envelopeCanonicalHex: hexOf(canonical),
  };

  let journalRecord: ChainedJournalRecord;
  try {
    journalRecord = journal.append(rowBase);
  } catch (err) {
    if (err instanceof JournalAppendError) {
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
    executionPermit: {
      commandId,
      journalSeq: journalRecord.row.seq,
    },
  };
}

/**
 * Honesty helper: any alternate "execute without journal" path must not exist.
 * Callers that attempt to obtain a permit without going through
 * `dispatchGovernedCommand` receive this error — used by singularity /
 * fail-closed tests.
 */
export function executeWithoutJournal(_request: GovernedCommandRequest): never {
  throw new DispatchError(
    'bypass_forbidden',
    'governed commands cannot bypass the required journal path',
  );
}

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

export { REDACTED };
