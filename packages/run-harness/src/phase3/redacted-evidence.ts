/**
 * Phase 3 evidence through the secret boundary — Lane B wiring, v0.
 *
 * The evidence object is redacted BEFORE serialization; `writePhase3Evidence`
 * (the reservation, the closed-shape check, the "authorizes nothing" check,
 * and the byte read-back) is untouched and sees only the redacted tree.
 *
 * Every valid Phase 3 evidence shape is closed and regex-bound, so a secret
 * cannot survive the shape check in any field. The boundary is applied
 * anyway: the write path, not the shape check, is the control that the act
 * names, and the two are independent.
 *
 * `write` is an injection seam for tests, which need to observe what the
 * writer receives without a shape that admits free text.
 */

import type { RedactionBoundary } from '../../../redaction/src/index.js';
import { writePhase3Evidence, type Phase3EvidenceReservation } from './evidence.js';

export type Phase3EvidenceWrite = (
  reservation: Phase3EvidenceReservation,
  evidence: unknown,
) => Promise<string>;

export async function writeRedactedPhase3Evidence(
  boundary: RedactionBoundary,
  reservation: Phase3EvidenceReservation,
  evidence: unknown,
  write: Phase3EvidenceWrite = writePhase3Evidence,
): Promise<string> {
  const redactor = boundary.require(); // throws RedactionRefusedError before any write
  return write(reservation, redactor.redactValue(evidence));
}
