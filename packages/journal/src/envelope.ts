/**
 * Serialization contract (a) — the normalized command envelope.
 *
 * Spec: `packages/journal/specs/serialization-a-envelope.md`, version 1.
 * `envelope_digest` = SHA-256 over `encodeEnvelope()`'s bytes (contract §6.2).
 *
 * The envelope is the post-redaction safe representation of a governed
 * command (contract §6.1): credential material must never appear in it.
 * Redaction enforcement belongs to the write path (2b and later); this
 * module defines the canonical bytes only.
 */

import {
  arrayField,
  concatBytes,
  lpString,
  requireOptionalString,
  requireString,
  requireStringArray,
  sha256Hex,
  stringField,
} from './bytes.js';

export const SPEC_ID_A = 'BRJ:a:1';

export const ENVELOPE_VERSION = '1';

/**
 * Normalized command envelope, spec (a) v1. Later schema ratifications
 * constrain which documents are valid; they never alter this encoding.
 * An encoding change requires a new spec version (non-retroactivity,
 * ruled 2026-09-01).
 */
export interface NormalizedCommandEnvelope {
  /** Envelope schema version; `'1'` for this spec version. */
  readonly envelopeVersion: string;
  /** The governed command kind, e.g. a planner invocation identifier. */
  readonly commandKind: string;
  /** Normalized argument representation, in recorded order. May be empty. */
  readonly argv: readonly string[];
  /** Governed target repository, where the command has one. */
  readonly targetRepository?: string;
  /** Governed scope reference, where the command has one. */
  readonly scopeRef?: string;
}

const TAG_ENVELOPE_VERSION = 0x01;
const TAG_COMMAND_KIND = 0x02;
const TAG_ARGV = 0x03;
const TAG_TARGET_REPOSITORY = 0x04;
const TAG_SCOPE_REF = 0x05;

function validateEnvelope(envelope: NormalizedCommandEnvelope): void {
  requireString('envelope_version', envelope.envelopeVersion);
  requireString('command_kind', envelope.commandKind);
  requireStringArray('argv', envelope.argv);
  requireOptionalString('target_repository', envelope.targetRepository);
  requireOptionalString('scope_ref', envelope.scopeRef);
  if (envelope.envelopeVersion !== ENVELOPE_VERSION) {
    throw new RangeError(
      `envelope_version must be '${ENVELOPE_VERSION}' under ${SPEC_ID_A}: ${envelope.envelopeVersion}`,
    );
  }
  if (envelope.commandKind.trim() === '') {
    throw new RangeError('command_kind must be non-empty');
  }
  if (envelope.targetRepository !== undefined && envelope.targetRepository.trim() === '') {
    throw new RangeError('target_repository, when present, must be non-empty');
  }
  if (envelope.scopeRef !== undefined && envelope.scopeRef.trim() === '') {
    throw new RangeError('scope_ref, when present, must be non-empty');
  }
}

/** Canonical byte sequence of the normalized command envelope, spec (a) v1. */
export function encodeEnvelope(envelope: NormalizedCommandEnvelope): Uint8Array {
  validateEnvelope(envelope);
  return concatBytes([
    lpString(SPEC_ID_A),
    stringField(TAG_ENVELOPE_VERSION, envelope.envelopeVersion),
    stringField(TAG_COMMAND_KIND, envelope.commandKind),
    arrayField(TAG_ARGV, envelope.argv),
    stringField(TAG_TARGET_REPOSITORY, envelope.targetRepository),
    stringField(TAG_SCOPE_REF, envelope.scopeRef),
  ]);
}

/** `envelope_digest`: SHA-256 hex over the canonical envelope bytes. */
export function envelopeDigest(envelope: NormalizedCommandEnvelope): string {
  return sha256Hex(encodeEnvelope(envelope));
}
