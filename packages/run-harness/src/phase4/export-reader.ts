/**
 * A run record's lifecycle half, read from the control plane's existing
 * `GET /rooms/:roomId/export` (plan r1 slice 10). The journal half has no
 * route; the plan's Q9 asks how a counted run reads it.
 *
 * Only applied transitions are kept, in ledger order. A row the reader
 * cannot read whole is refused, never skipped: a record with a hole in it is
 * not a record the run unit may pass.
 */

import type { Phase4RecordedAttribution, Phase4RecordedEvent } from './model.js';

export class Phase4ExportUnreadableError extends Error {
  override readonly name = 'Phase4ExportUnreadableError';
}

export interface Phase4ExportReading {
  readonly finalState: string;
  readonly events: readonly Phase4RecordedEvent[];
}

export function readPhase4Export(body: unknown, roomId: string): Phase4ExportReading {
  const root = record(body);
  if (root === null || root['roomId'] !== roomId) throw new Phase4ExportUnreadableError('the export is not this room’s');
  const state = record(root['snapshot'])?.['state'];
  if (typeof state !== 'string') throw new Phase4ExportUnreadableError('the export carries no state');
  const rows = root['events'];
  if (!Array.isArray(rows)) throw new Phase4ExportUnreadableError('the export carries no events');

  const events: Phase4RecordedEvent[] = [];
  for (const raw of rows) {
    const row = record(raw);
    if (row === null) throw new Phase4ExportUnreadableError('an event row is not an object');
    if (row['outcome'] !== 'transition') continue;
    const attribution = readAttribution(row['attribution']);
    const evidence = row['evidence'];
    if (
      typeof row['event_id'] !== 'string' ||
      typeof row['event'] !== 'string' ||
      typeof row['actor'] !== 'string' ||
      attribution === null ||
      !Array.isArray(evidence)
    ) {
      throw new Phase4ExportUnreadableError(`event row ${String(row['seq'])} is not readable whole`);
    }
    const readEvidence = evidence.map((item) => {
      const e = record(item);
      if (e === null || typeof e['kind'] !== 'string' || typeof e['ref'] !== 'string') {
        throw new Phase4ExportUnreadableError(`event row ${String(row['seq'])} carries unreadable evidence`);
      }
      return { kind: e['kind'], ref: e['ref'], ...(typeof e['digest'] === 'string' ? { digest: e['digest'] } : {}) };
    });
    const planHash = record(record(row['payload'])?.['facts'])?.['planHash'];
    events.push({
      eventId: row['event_id'],
      event: row['event'],
      actor: row['actor'],
      attribution,
      evidence: readEvidence,
      ...(typeof planHash === 'string' ? { planHash } : {}),
    });
  }
  return { finalState: state, events };
}

function readAttribution(value: unknown): Phase4RecordedAttribution | null {
  const a = record(value);
  if (a === null) return null;
  const roleId = a['roleId'];
  if (
    (roleId !== null && typeof roleId !== 'string') ||
    typeof a['actorId'] !== 'string' ||
    typeof a['actualModel'] !== 'string' ||
    typeof a['executionSurface'] !== 'string'
  ) {
    return null;
  }
  return { roleId: roleId as string | null, actorId: a['actorId'], actualModel: a['actualModel'], executionSurface: a['executionSurface'] };
}

function record(input: unknown): Record<string, unknown> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}
