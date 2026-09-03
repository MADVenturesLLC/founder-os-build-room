/**
 * Seat Registry V1 — handoff validator (§2.7, r7 test 13).
 *
 * `authorization_refs` are references only: shape-checked, never adjudicated.
 * The validator checks form — a ref is a non-empty string — and never
 * resolves, evaluates, or grades an authorization.
 */

import type { SeatHandoff } from './schema.js';
import type { SeatId } from './vocabulary.js';
import { isTerminalStatusFor } from './vocabulary.js';

export interface HandoffValidationResult {
  readonly valid: boolean;
  readonly error: string | null;
  readonly field: string | null; // the offending field, when invalid
}

const FULL_SHA = /^[0-9a-f]{40}$/;

export function validateHandoff(handoff: SeatHandoff, seat: SeatId): HandoffValidationResult {
  if (handoff.receives_from === undefined) {
    return reject('receives_from', 'missing required field receives_from');
  }
  if (handoff.receives_from !== null && !isSeatIdValue(handoff.receives_from)) {
    return reject('receives_from', `receives_from must be a seat id or null, got ${JSON.stringify(handoff.receives_from)}`);
  }
  if (handoff.produces === undefined) {
    return reject('produces', 'missing required field produces');
  }
  if (typeof handoff.produces !== 'string' || handoff.produces.trim() === '') {
    return reject('produces', `produces must be a non-empty string, got ${JSON.stringify(handoff.produces)}`);
  }
  if (handoff.terminal_status === undefined) {
    return reject('terminal_status', 'missing required field terminal_status');
  }
  if (typeof handoff.terminal_status !== 'string' || !isTerminalStatusFor(seat, handoff.terminal_status)) {
    return reject(
      'terminal_status',
      `terminal_status ${JSON.stringify(handoff.terminal_status)} is not a terminal status of seat ${JSON.stringify(seat)}`,
    );
  }
  if (handoff.committed_sha === undefined) {
    return reject('committed_sha', 'missing required field committed_sha');
  }
  if (typeof handoff.committed_sha !== 'string' || !FULL_SHA.test(handoff.committed_sha)) {
    return reject('committed_sha', `committed_sha must be a full 40-hex string, got ${JSON.stringify(handoff.committed_sha)}`);
  }
  if (handoff.authorization_refs === undefined) {
    return reject('authorization_refs', 'missing required field authorization_refs');
  }
  if (!Array.isArray(handoff.authorization_refs) || handoff.authorization_refs.length === 0) {
    return reject('authorization_refs', 'authorization_refs must be a non-empty array');
  }
  for (const ref of handoff.authorization_refs) {
    if (typeof ref !== 'string' || ref.trim() === '') {
      return reject('authorization_refs', 'every authorization_ref must be a non-empty string');
    }
  }
  return { valid: true, error: null, field: null };
}

function reject(field: string, error: string): HandoffValidationResult {
  return { valid: false, error, field };
}

function isSeatIdValue(value: string): boolean {
  return value === 'researcher' || value === 'architect' || value === 'builder' || value === 'independent-reviewer';
}
