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

import type { CommandEventRow, LifecycleEventRef } from './event-row.js';
import type { DecisionRecordRow } from './decision-row.js';
import { BUILDER_COMMAND_KIND, type BindingRecordRow } from './binding-row.js';
import type { DecodedJournalRow } from './decode.js';

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
  | { readonly recordClass: 'decision'; readonly row: DecisionRecordRow }
  | { readonly recordClass: 'binding'; readonly row: BindingRecordRow };

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
 *
 * A binding row shares its `command_id` column with the first Builder
 * command (contract §2, §13 B3, G4). It is not a decision, and these rules
 * do not read it: `bindingChainDefect` holds the binding rules.
 */
export function boundDecisionDefect(entries: readonly BoundEntry[]): SequenceDefect | null {
  let journaledSeen = false;
  let planDecided = false;
  let cancelled = false;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] as BoundEntry;
    const defect = (reason: string): SequenceDefect => ({ index, reason });
    if (entry.recordClass === 'binding') continue;
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

/** One row of the chain as a verifier holds it: its `seq`, its stored `command_id` column, its decoded bytes. */
export interface ChainEntry {
  readonly seq: string;
  readonly commandId: string;
  readonly decoded: DecodedJournalRow;
}

/** A chain-wide defect, named by the `seq` of the row that shows it. */
export interface ChainDefect {
  readonly atSeq: string;
  readonly reason: string;
}

/** A Builder command is identified by its envelope's command kind, never by its role. */
function isBuilderCommand(row: CommandEventRow): boolean {
  return row.commandEnvelope?.commandKind === BUILDER_COMMAND_KIND;
}

function sameRef(a: LifecycleEventRef | undefined, b: LifecycleEventRef): boolean {
  return a !== undefined && a.roomId === b.roomId && a.eventId === b.eventId;
}

/**
 * The first defect in the chain's binding records and Builder commands, in
 * `seq` order, or `null`. `records` is the whole chain in `seq` order, each
 * row with its stored `command_id` column, which on a binding row names the
 * first Builder command (contract §2, §13 G4). A Builder command is a
 * command-class row whose envelope's command kind is `builder.invoke`
 * (`BUILDER_COMMAND_KIND`); a row journaled under role `builder` with any
 * other kind is not one, and these rules do not read it. The rules, from
 * FOUNDER-RULING-20261117-BR-JOURNAL-PHASE5 (contract §13):
 *
 * 1. B3, how a binding commits. For a binding row at seq k, the row at seq
 *    k−1 is the `journaled` row of a Builder command that shares the
 *    binding's `command_id` column, whose `room_id` is the binding's
 *    lifecycle room, and whose `lifecycle_event_ref` is the binding's.
 * 2. B5, one to one, both directions. No two binding rows name the same
 *    lifecycle room, and no two name the same runtime room.
 * 3. B6, every Builder command names the binding. Every `journaled` row of
 *    a Builder command carries a `room_id`, that room has a binding, the
 *    row's seq is at least that binding's seq − 1 (only the first Builder
 *    command, the one rule 1 places at k−1, precedes its binding), and its
 *    `lifecycle_event_ref` is the binding's. Rule 3 covers the first Builder
 *    command too, so a first command whose reference is not its binding's
 *    is reported at its own seq, k−1.
 *
 * Each row is checked when the pass reaches it, against the rules that
 * concern it, so the defect returned is the one at the lowest seq. Where a
 * room has two bindings (rule 2), rule 3 reads the first. The caller holds
 * each row's columns to its bytes (seq, record class, a command row's
 * `command_id`) before this runs; this function reads them as given.
 */
export function bindingChainDefect(records: readonly ChainEntry[]): ChainDefect | null {
  const firstBindingOfRoom = new Map<string, { readonly seq: string; readonly row: BindingRecordRow }>();
  for (const record of records) {
    if (record.decoded.recordClass !== 'binding') continue;
    const row = record.decoded.row;
    if (!firstBindingOfRoom.has(row.lifecycleRoomId)) firstBindingOfRoom.set(row.lifecycleRoomId, { seq: record.seq, row });
  }

  const boundLifecycleRooms = new Map<string, string>();
  const boundRuntimeRooms = new Map<string, string>();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] as ChainEntry;
    const defect = (reason: string): ChainDefect => ({ atSeq: record.seq, reason });
    const decoded = record.decoded;

    if (decoded.recordClass === 'binding') {
      const binding = decoded.row;
      const prior = index > 0 ? records[index - 1] : undefined;
      if (prior === undefined || BigInt(prior.seq) + 1n !== BigInt(record.seq)) {
        return defect('B3: a binding follows its first Builder command at the seq before it, and no row is there');
      }
      if (prior.decoded.recordClass !== 'command' || prior.decoded.row.eventType !== 'journaled') {
        const found = prior.decoded.recordClass === 'command' ? `a ${prior.decoded.row.eventType} command row` : `a ${prior.decoded.recordClass} row`;
        return defect(`B3: the row before a binding is the first Builder command's journaled row, not ${found}`);
      }
      const command = prior.decoded.row;
      if (prior.commandId !== record.commandId) {
        return defect("B3: a binding's command_id column names the Builder command journaled at the seq before it");
      }
      if (!isBuilderCommand(command)) {
        return defect(`B3: the command journaled before a binding is a Builder command (${BUILDER_COMMAND_KIND})`);
      }
      if (command.roomId !== binding.lifecycleRoomId) {
        return defect("B3: the first Builder command's room_id is the binding's lifecycle room");
      }
      if (!sameRef(command.lifecycleEventRef, binding.lifecycleEventRef)) {
        return defect("B3: the first Builder command's lifecycle_event_ref names the binding's runtime_room.bound entry");
      }
      const lifecycleTwice = boundLifecycleRooms.get(binding.lifecycleRoomId);
      if (lifecycleTwice !== undefined) {
        return defect(`B5: lifecycle room ${binding.lifecycleRoomId} is already bound at seq ${lifecycleTwice}`);
      }
      const runtimeTwice = boundRuntimeRooms.get(binding.runtimeRoomId);
      if (runtimeTwice !== undefined) {
        return defect(`B5: runtime room ${binding.runtimeRoomId} is already bound at seq ${runtimeTwice}`);
      }
      boundLifecycleRooms.set(binding.lifecycleRoomId, record.seq);
      boundRuntimeRooms.set(binding.runtimeRoomId, record.seq);
      continue;
    }

    if (decoded.recordClass !== 'command' || decoded.row.eventType !== 'journaled' || !isBuilderCommand(decoded.row)) {
      continue;
    }
    const command = decoded.row;
    if (command.roomId === undefined) {
      return defect('B6: a Builder command is journaled with no room_id');
    }
    const binding = firstBindingOfRoom.get(command.roomId);
    if (binding === undefined) {
      return defect(`B6: a Builder command is journaled for room ${command.roomId}, which has no binding`);
    }
    if (BigInt(record.seq) < BigInt(binding.seq) - 1n) {
      return defect(`B6: a Builder command is journaled before its room's binding at seq ${binding.seq}; only the first, at the seq before it, commits with it`);
    }
    if (!sameRef(command.lifecycleEventRef, binding.row.lifecycleEventRef)) {
      return defect(`B6: a Builder command's lifecycle_event_ref names its room's runtime_room.bound entry (the binding at seq ${binding.seq})`);
    }
  }
  return null;
}
