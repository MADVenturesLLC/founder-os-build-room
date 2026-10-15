/**
 * The cross-row rules of a governed command — contract §2 and §5.3.
 *
 * `event-row.ts` decides what ONE row may carry; this module decides what a
 * command's rows may be TOGETHER: their order, the set-once identities, and
 * the parts of the completion test that the rows themselves can answer. The
 * writer runs it over a command's rows before it commits an append, and
 * `verify()` runs it over every command on rebuild, so a sequence the writer
 * would refuse is also a sequence verification reports ("enforced, and
 * verified on rebuild", §5.3).
 *
 * The one part of the completion test this module cannot answer is whether
 * `authorization_ref` resolves to an authorization whose granted scope
 * covers the observed route: that needs the authorization, not the rows.
 * The writer asks a resolver for it; nothing here pretends to.
 */

import type { CommandEventRow } from './event-row.js';
import type { DecisionRecordRow } from './decision-row.js';

export interface SequenceDefect {
  /** Position in the list that was checked, not a `seq`. */
  readonly index: number;
  readonly reason: string;
}

const ELEMENT_2 = ['roomId', 'runId', 'executionId'] as const;

function seqLess(a: string, b: string): boolean {
  return BigInt(a) < BigInt(b);
}

/**
 * The first defect in one command's rows, given in `seq` order, or `null`.
 * A list with no terminal event is a pending command and is not a defect:
 * "exactly one of completed/failed/unresolved" is at most one until the
 * command ends.
 */
export function commandSequenceDefect(rows: readonly CommandEventRow[]): SequenceDefect | null {
  let journaled: CommandEventRow | undefined;
  let identityBound = false;
  let dispatched: CommandEventRow | undefined;
  let outcome: 'completed' | 'failed' | 'unresolved' | undefined;
  let resolved = false;
  const setIdentities = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] as CommandEventRow;
    const defect = (reason: string): SequenceDefect => ({ index, reason });

    if (index > 0) {
      const prior = rows[index - 1] as CommandEventRow;
      if (row.commandId !== prior.commandId) return defect('rows of more than one command_id');
      if (!seqLess(prior.seq, row.seq)) return defect('rows are not in ascending seq order');
    }
    if (index === 0 && row.eventType !== 'journaled') return defect('a command begins with journaled');
    if (resolved || outcome === 'completed' || outcome === 'failed') {
      return defect(`no event after ${resolved ? 'resolved' : outcome}`);
    }
    if (outcome === 'unresolved' && row.eventType !== 'resolved') {
      return defect('only resolved may follow unresolved');
    }

    switch (row.eventType) {
      case 'journaled':
        if (index > 0) return defect('journaled is first and exactly once');
        journaled = row;
        break;
      case 'identity_bound':
        if (identityBound) return defect('identity_bound is at most once');
        if (dispatched !== undefined) return defect('identity_bound comes before dispatched');
        identityBound = true;
        break;
      case 'dispatched':
        if (dispatched !== undefined) return defect('dispatched is at most once');
        dispatched = row;
        break;
      case 'completed':
      case 'failed':
      case 'unresolved':
        if (row.eventType === 'completed') {
          if (dispatched === undefined) return defect('completed requires a prior dispatched');
          const mismatch = routeMismatch(journaled as CommandEventRow, dispatched);
          if (mismatch !== null) return defect(`completed with an observed route that diverges from the intended one (${mismatch})`);
        }
        outcome = row.eventType;
        break;
      case 'resolved':
        if (outcome !== 'unresolved') return defect('resolved comes only after unresolved');
        if (row.resolutionDetermination === 'completed' && dispatched === undefined) {
          return defect('a completed determination needs an observed identity, and none was recorded');
        }
        resolved = true;
        break;
      default:
        return defect(`not a command event type: ${String((row as { eventType: unknown }).eventType)}`);
    }

    for (const name of ELEMENT_2) {
      if (row[name] === undefined) continue;
      if (setIdentities.has(name)) return defect(`${name} is set once and is already recorded`);
      setIdentities.add(name);
    }
  }
  return null;
}

/** Which observed field differs from its intended one, or `null` when all three match. */
export function routeMismatch(journaled: CommandEventRow, dispatched: CommandEventRow): string | null {
  if (dispatched.provider !== journaled.intendedProvider) return 'provider';
  if (dispatched.model !== journaled.intendedModel) return 'model';
  if (dispatched.executionSurface !== journaled.intendedSurface) return 'execution surface';
  return null;
}

export type CommandOutcome = 'completed' | 'failed' | 'unresolved' | 'pending';

export interface DerivedCommandState {
  /** The latest event's type (§5.4); never stored. */
  readonly dispatchState: CommandEventRow['eventType'];
  /** The terminal determination, directly or through `resolved` (§5.4); never stored. */
  readonly outcome: CommandOutcome;
}

/** The two readings of one event sequence (§5.4). The rows must be non-empty and in `seq` order. */
export function deriveCommandState(rows: readonly CommandEventRow[]): DerivedCommandState {
  const latest = rows[rows.length - 1];
  if (latest === undefined) throw new RangeError('a command with no rows has no state');
  let outcome: CommandOutcome = 'pending';
  for (const row of rows) {
    if (row.eventType === 'completed' || row.eventType === 'failed' || row.eventType === 'unresolved') {
      outcome = row.eventType;
    } else if (row.eventType === 'resolved' && row.resolutionDetermination !== undefined) {
      outcome = row.resolutionDetermination;
    }
  }
  return { dispatchState: latest.eventType, outcome };
}

export type BoundEntry =
  | { readonly recordClass: 'command'; readonly row: CommandEventRow }
  | { readonly recordClass: 'decision'; readonly row: DecisionRecordRow };

/**
 * The first defect in the decisions bound to one planner command, or `null`.
 *
 * A decision row carries, in its `command_id` column, the planner command
 * whose plan it decides (Founder direction "GO", 2026-10-15, Q3). That
 * binding is the column's, not the row bytes' — spec (d) has no command
 * field — so these rules read the class and order of the rows that share
 * the column, given in `seq` order:
 *
 * - the command's `journaled` row precedes every decision bound to it;
 * - a plan is decided once: at most one of `plan.approved` and
 *   `plan.revision_requested`;
 * - `founder.cancel` is at most once, and nothing is decided after it.
 */
export function boundDecisionDefect(entries: readonly BoundEntry[]): SequenceDefect | null {
  let journaledSeen = false;
  let planDecided = false;
  let cancelled = false;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] as BoundEntry;
    const defect = (reason: string): SequenceDefect => ({ index, reason });
    if (entry.recordClass === 'command') {
      if (entry.row.eventType === 'journaled') journaledSeen = true;
      continue;
    }
    if (!journaledSeen) return defect('a decision is bound to a command that was not journaled before it');
    if (cancelled) return defect('nothing is decided after founder.cancel');
    if (entry.row.decision === 'founder.cancel') {
      cancelled = true;
    } else {
      if (planDecided) return defect('a plan is decided once');
      planDecided = true;
    }
  }
  return null;
}
