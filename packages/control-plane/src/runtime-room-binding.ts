/**
 * The room binding: Phase 5 build step 1 (FOUNDER-AUTHORIZATION-20261116-BR-PHASE5,
 * B3 step 1), as FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING fixes it and
 * FOUNDER-RULING-20261117-BR-JOURNAL-PHASE5 serializes it
 * (docs/command-journal-contract.md §2, "Binding-class records").
 *
 * A runtime room is the execution locus of exactly one lifecycle room's
 * build. The binding is recorded when Phase 5 first places a build in a
 * runtime room, and it commits as one transaction of three writes (journal
 * ruling B3), or not at all:
 *
 *   1. the `runtime_room.bound` lifecycle entry, recorded in BUILDING with
 *      no transition (outcome `recorded`, journal ruling B4);
 *   2. the first Builder command's `journaled` row, whose
 *      `lifecycle_event_ref` names that entry;
 *   3. the binding record, next in seq, bound to that command in the stored
 *      `command_id` column.
 *
 * Before any of it, under the room lock and inside the leader fence, the
 * control plane checks what the lifecycle ruling's B5 requires: the room is
 * in BUILDING with no binding; the Gateway named is enrolled and live; and
 * the runtime room id is one that Gateway reported over its signed channel
 * as minted for this lifecycle room (the step-1 act's B2 messages, held in
 * the leader-local room channel). Any failure refuses the binding and the
 * command together, and nothing is written: no lifecycle row, no journal
 * row, no rejection row (lifecycle ruling B4, "is refused and writes
 * nothing"). The database refuses a second binding for a lifecycle room and
 * a binding naming a runtime room already bound, by unique index
 * (migration 0011; journal ruling B5), which aborts the same transaction.
 *
 * Every later Builder command of the room names the binding's lifecycle
 * entry in its `lifecycle_event_ref` (journal ruling B6). Nothing here
 * dispatches anything: the Builder executor is step 4, and a binding commits
 * before its command is dispatched.
 */

import type { PoolClient } from 'pg';
import {
  BUILDER_COMMAND_KIND,
  COMMAND_ID_PREFIX,
  type GovernedCommandRequest,
} from '../../journal/src/index.js';
import { isCanonicalUuid, isRuntimeRoomId } from '../../contracts/src/index.js';
import type { LedgerState, LifecycleEvent } from '../../ledger/src/index.js';
import { RecordedEventRefusedError, type PostgresLedgerStore } from './store.js';
import type { AppendedRecord, JournaledAppendResult, JournalTransaction } from './journal-store.js';
import type { DispatcherAttribution } from './planner-loop.js';

/** Why a binding, or a later Builder command, was refused. */
export type BindingRefusalCode =
  | 'invalid_request'
  | 'not_building'
  | 'already_bound'
  | 'not_bound'
  | 'gateway_not_live'
  | 'runtime_room_not_minted'
  | 'no_approved_plan'
  | 'not_a_builder_command'
  | 'binding_conflict'
  | 'ledger_refused';

export class RuntimeRoomBindingRefusedError extends Error {
  constructor(
    readonly code: BindingRefusalCode,
    readonly reason: string,
  ) {
    super(`runtime room binding refused (${code}): ${reason}`);
    this.name = 'RuntimeRoomBindingRefusedError';
  }
}

export interface RuntimeRoomBindingDeps {
  readonly ledger: Pick<PostgresLedgerStore, 'appendRecorded' | 'underRoomLock'>;
  readonly journal: { inTransaction(client: PoolClient): JournalTransaction };
  /** Lifecycle ruling B5: "The Gateway named is enrolled and live". Read on the fenced client. */
  readonly gateways: { deriveGatewayEnrolledAndLive(client: PoolClient, gatewayId: string): Promise<boolean> };
  /** The runtime room ids each Gateway reported as minted for a lifecycle room (act B2). */
  readonly rooms: { mintedFor(gatewayId: string, lifecycleRoomId: string): readonly string[] };
  /** The control plane's own attribution for the events it records as `system`. */
  readonly dispatcher: DispatcherAttribution;
  readonly mintEventId: () => string;
  readonly now: () => Date;
}

/** A Builder command, as the journal takes it: its kind and id are fixed. */
export type BuilderCommandRequest = GovernedCommandRequest & { readonly commandId: string };

export interface BindFirstBuilderCommand {
  readonly roomId: string;
  readonly gatewayId: string;
  readonly runtimeRoomId: string;
  readonly command: BuilderCommandRequest;
}

export type BindingOutcome =
  | {
      readonly kind: 'bound';
      readonly eventId: string;
      readonly lifecycleSeq: number;
      readonly journaled: JournaledAppendResult;
      readonly binding: AppendedRecord;
    }
  | { readonly kind: 'refused'; readonly code: BindingRefusalCode; readonly reason: string }
  | { readonly kind: 'interrupted'; readonly committed: boolean };

export type LaterCommandOutcome =
  | { readonly kind: 'journaled'; readonly journaled: JournaledAppendResult }
  | { readonly kind: 'refused'; readonly code: BindingRefusalCode; readonly reason: string }
  | { readonly kind: 'interrupted'; readonly committed: boolean };

/** The two unique indexes of migration 0011 (journal ruling B5). */
const B5_INDEXES = ['build_room_events_one_binding_per_room', 'build_room_events_runtime_room_bound_once'] as const;

/**
 * The plan T5 bound, as the room's own ledger holds it: the PlanDoc digest
 * on the latest T5 entry. A room in BUILDING got there by T5, so a room
 * with none has no approved plan to bind a build to.
 */
export function approvedPlanHash(state: LedgerState): string | null {
  for (let i = state.entries.length - 1; i >= 0; i -= 1) {
    const entry = state.entries[i];
    if (entry === undefined || entry.transition !== 'T5') continue;
    const plandoc = entry.evidence.find((ref) => ref.kind === 'plandoc');
    // A digest that is not a plan hash binds nothing (spec (e) needs 64
    // lowercase hex): the room has no usable plan, and the binding refuses.
    const digest = plandoc?.digest;
    return typeof digest === 'string' && /^[0-9a-f]{64}$/.test(digest) ? digest : null;
  }
  return null;
}

function requireBuilderCommand(command: BuilderCommandRequest): void {
  if (command.commandKind !== BUILDER_COMMAND_KIND) {
    throw new RuntimeRoomBindingRefusedError('not_a_builder_command', `the command kind is not ${BUILDER_COMMAND_KIND}`);
  }
  const id = command.commandId;
  if (typeof id !== 'string' || !id.startsWith(COMMAND_ID_PREFIX) || id === COMMAND_ID_PREFIX) {
    throw new RuntimeRoomBindingRefusedError('not_a_builder_command', `a Builder command id is in the ${COMMAND_ID_PREFIX} namespace`);
  }
}

function violatedB5Index(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  if (code !== '23505' || typeof constraint !== 'string') return null;
  return (B5_INDEXES as readonly string[]).includes(constraint) ? constraint : null;
}

function refusalOf(error: unknown): { readonly code: BindingRefusalCode; readonly reason: string } | null {
  if (error instanceof RuntimeRoomBindingRefusedError) return { code: error.code, reason: error.reason };
  if (error instanceof RecordedEventRefusedError) {
    return error.code === 'binding_exists'
      ? { code: 'already_bound', reason: error.reason }
      : { code: 'ledger_refused', reason: error.reason };
  }
  const index = violatedB5Index(error);
  if (index !== null) {
    return { code: 'binding_conflict', reason: `the database refused the binding (${index})` };
  }
  return null;
}

/**
 * Bind the room to a runtime room, journaling its first Builder command in
 * the same transaction (journal ruling B3). Returns `refused` with nothing
 * written when any check fails.
 */
export async function bindFirstBuilderCommand(
  deps: RuntimeRoomBindingDeps,
  request: BindFirstBuilderCommand,
): Promise<BindingOutcome> {
  const { roomId, gatewayId, runtimeRoomId, command } = request;
  const eventId = deps.mintEventId();
  try {
    // Formats first, before the room lock: a malformed id refuses as a typed
    // refusal rather than surfacing as a database or encoder error.
    if (!isCanonicalUuid(roomId)) throw new RuntimeRoomBindingRefusedError('invalid_request', 'the room id is not a canonical UUID');
    if (!isCanonicalUuid(gatewayId)) throw new RuntimeRoomBindingRefusedError('invalid_request', 'the Gateway id is not a canonical UUID');
    if (!isRuntimeRoomId(runtimeRoomId)) {
      throw new RuntimeRoomBindingRefusedError('invalid_request', 'the runtime room id is not room- and a canonical UUID');
    }
    requireBuilderCommand(command);
    const appended = await deps.ledger.appendRecorded(roomId, {
      build: async (client, current): Promise<LifecycleEvent> => {
        if (current.state !== 'BUILDING') {
          throw new RuntimeRoomBindingRefusedError('not_building', `the room is in ${current.state}, not BUILDING`);
        }
        if (current.binding !== null) {
          throw new RuntimeRoomBindingRefusedError('already_bound', 'the room already has a runtime room binding; there is no rebinding');
        }
        if (approvedPlanHash(current) === null) {
          throw new RuntimeRoomBindingRefusedError('no_approved_plan', 'the room holds no T5 plan to bind the build to');
        }
        if (!(await deps.gateways.deriveGatewayEnrolledAndLive(client, gatewayId))) {
          throw new RuntimeRoomBindingRefusedError('gateway_not_live', 'the Gateway named is not enrolled and live');
        }
        if (!deps.rooms.mintedFor(gatewayId, roomId).includes(runtimeRoomId)) {
          throw new RuntimeRoomBindingRefusedError(
            'runtime_room_not_minted',
            'that Gateway has not reported this runtime room as minted for this lifecycle room',
          );
        }
        return {
          eventId,
          event: 'runtime_room.bound',
          actor: 'system',
          attribution: { ...deps.dispatcher },
          scope: { roomId, repo: command.repository, paths: [] },
          evidence: [],
          occurredAt: deps.now().toISOString(),
          binding: { lifecycleRoomId: roomId, runtimeRoomId, gatewayId },
        } as LifecycleEvent;
      },
      afterRecorded: async (client, { state }) => {
        const planHash = approvedPlanHash(state);
        if (planHash === null) throw new RuntimeRoomBindingRefusedError('no_approved_plan', 'the plan hash vanished under the lock');
        const tx = deps.journal.inTransaction(client);
        const lifecycleEventRef = { roomId, eventId };
        const journaled = await tx.appendJournaled(command, { roomId, lifecycleEventRef });
        const binding = await tx.appendBinding({
          commandId: journaled.commandId,
          lifecycleRoomId: roomId,
          runtimeRoomId,
          gatewayId,
          planHash,
          lifecycleEventRef,
        });
        return { journaled, binding };
      },
    });
    if (appended.status === 'not_leader') return { kind: 'interrupted', committed: appended.committed };
    return {
      kind: 'bound',
      eventId,
      lifecycleSeq: appended.seq,
      journaled: appended.value.journaled,
      binding: appended.value.binding,
    };
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal !== null) return { kind: 'refused', ...refusal };
    throw error;
  }
}

/**
 * Journal a later Builder command of a bound room, naming the binding's
 * lifecycle entry (journal ruling B6). A room with no binding journals no
 * Builder command here: its first one commits with the binding.
 */
export async function journalLaterBuilderCommand(
  deps: Pick<RuntimeRoomBindingDeps, 'ledger' | 'journal'>,
  request: { readonly roomId: string; readonly command: BuilderCommandRequest },
): Promise<LaterCommandOutcome> {
  const { roomId, command } = request;
  try {
    requireBuilderCommand(command);
    const locked = await deps.ledger.underRoomLock(roomId, async (client, current) => {
      if (current.state !== 'BUILDING') {
        throw new RuntimeRoomBindingRefusedError('not_building', `the room is in ${current.state}, not BUILDING`);
      }
      if (current.binding === null) {
        throw new RuntimeRoomBindingRefusedError('not_bound', 'the room has no runtime room binding');
      }
      return deps.journal
        .inTransaction(client)
        .appendJournaled(command, { roomId, lifecycleEventRef: { roomId, eventId: current.binding.eventId } });
    });
    if (locked.status === 'not_leader') return { kind: 'interrupted', committed: locked.committed };
    return { kind: 'journaled', journaled: locked.value };
  } catch (error) {
    const refusal = refusalOf(error);
    if (refusal !== null) return { kind: 'refused', ...refusal };
    throw error;
  }
}
