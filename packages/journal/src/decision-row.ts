/**
 * Serialization contract (d) — the complete decision-class record row.
 *
 * Spec: `packages/journal/specs/serialization-d-decision-row.md`, version 1.
 * A decision record is a single event, terminal by construction, with no
 * state machine (contract §2, Founder ruling 2026-09-01, §12 option (b)).
 * Contract §2 elements 1, 4, 8, and 9 are not applicable to the class: the
 * row type simply has no such fields, so the encoder cannot emit them.
 *
 * `plan_hash` presence is derived, not enumerated (contract §2, v0.16):
 * absent exactly when the decision's effective plan-bearing state has no
 * PlanDoc bound, required otherwise. `RECONCILING` resolves to the prior
 * state the writer supplies; where none is available the record cannot be
 * encoded — fail closed (v0.17 writer obligation).
 */

import {
  TERMINAL_STATES,
  isState,
  isTerminal,
  type State,
} from '../../contracts/src/index.js';
import {
  concatBytes,
  isCanonicalRecordedAt,
  isCanonicalSeq,
  isHex64,
  lpString,
  pairField,
  requireString,
  stringField,
} from './bytes.js';
import type { LifecycleEventRef } from './event-row.js';

export const SPEC_ID_D = 'BRJ:d:1';

export const RECORD_CLASS_DECISION = 'decision';

/** The §8-class Founder decision acts: T4, T5, T22 (contract §2, §12). */
export const DECISION_EVENTS = [
  'plan.revision_requested',
  'plan.approved',
  'founder.cancel',
] as const;

export type DecisionEvent = (typeof DECISION_EVENTS)[number];

export const DECISION_ACTOR = 'founder';

/**
 * The derived no-PlanDoc effective states (contract §2): a PlanDoc first
 * exists at T3; a T4 return leaves `PLANNING` on the absent side (standing
 * determination, 2026-09-01 06:47:17Z); every state from `PLAN_REVIEW`
 * onward is entered only through T3 or T5 and is plan-bearing. Stated with
 * its derivation so it can be re-derived against the ratified T1–T22 table
 * — `test/journal-serialization.test.ts` performs that re-derivation
 * mechanically; where a printed set and the derivation disagree, the
 * derivation governs.
 */
export const NO_PLANDOC_EFFECTIVE_STATES = ['ROOM_CREATED', 'SCOPED', 'PLANNING'] as const;

const NO_PLANDOC_SET: ReadonlySet<string> = new Set(NO_PLANDOC_EFFECTIVE_STATES);

export interface DecisionRecordRow {
  /** Canonical ASCII decimal, at least 1 — the one shared `seq` space. */
  readonly seq: string;
  readonly decision: DecisionEvent;
  /** Always `founder` (contract §2). */
  readonly actorId: string;
  /** The recorded lifecycle state at the decision — a positive fact. */
  readonly recordedState: State;
  /** The resolved prior state, present exactly when `recordedState` is RECONCILING. */
  readonly priorState?: State;
  /** 64 lowercase hex; presence per the plan-bearing derivation. */
  readonly planHash?: string;
  readonly authorizationRef: string;
  readonly lifecycleEventRef: LifecycleEventRef;
  /** Canonical RFC 3339 UTC, six fractional digits. */
  readonly recordedAt: string;
}

const TAG_RECORD_CLASS = 0x01;
const TAG_SEQ = 0x02;
const TAG_DECISION = 0x03;
const TAG_ACTOR_ID = 0x04;
const TAG_RECORDED_STATE = 0x05;
const TAG_PRIOR_STATE = 0x06;
const TAG_PLAN_HASH = 0x07;
const TAG_AUTHORIZATION_REF = 0x08;
const TAG_LIFECYCLE_EVENT_REF = 0x09;
const TAG_RECORDED_AT = 0x0a;

/**
 * The effective plan-bearing state (contract §2): the recorded state, with
 * RECONCILING resolved to the supplied prior state. Throws where the
 * resolution fails — the record cannot be written, fail closed.
 */
export function effectivePlanBearingState(
  recordedState: State,
  priorState: State | undefined,
): State {
  if (recordedState !== 'RECONCILING') {
    if (priorState !== undefined) {
      throw new RangeError('prior_state is carried only when the recorded state is RECONCILING');
    }
    return recordedState;
  }
  if (priorState === undefined) {
    throw new RangeError(
      'recorded state RECONCILING with no prior state available: the decision record cannot be written (contract §2, fail closed)',
    );
  }
  if (priorState === 'RECONCILING' || isTerminal(priorState)) {
    throw new RangeError(
      `prior_state can never be ${priorState}: T19's from-set excludes RECONCILING and every terminal state (contract §2)`,
    );
  }
  return priorState;
}

/** Whether `plan_hash` is required for a decision at this effective state. */
export function planHashRequired(effectiveState: State): boolean {
  return !NO_PLANDOC_SET.has(effectiveState);
}

function validateRow(row: DecisionRecordRow): void {
  if (!(DECISION_EVENTS as readonly string[]).includes(row.decision)) {
    throw new RangeError(`not a decision event: ${String(row.decision)}`);
  }
  requireString('seq', row.seq);
  requireString('authorization_ref', row.authorizationRef);
  requireString('recorded_at', row.recordedAt);
  requireString('lifecycle_event_ref.room_id', row.lifecycleEventRef?.roomId);
  requireString('lifecycle_event_ref.event_id', row.lifecycleEventRef?.eventId);
  if (!isCanonicalSeq(row.seq)) {
    throw new RangeError(`seq is not canonical ASCII decimal >= 1: ${row.seq}`);
  }
  if (row.actorId !== DECISION_ACTOR) {
    throw new RangeError(`decision records carry actor ${DECISION_ACTOR}: ${row.actorId}`);
  }
  if (!isState(row.recordedState)) {
    throw new RangeError(`not a lifecycle state: ${String(row.recordedState)}`);
  }
  if (row.priorState !== undefined && !isState(row.priorState)) {
    throw new RangeError(`not a lifecycle state: ${String(row.priorState)}`);
  }
  if (isTerminal(row.recordedState)) {
    throw new RangeError(
      `no decision act fires from a terminal state (${TERMINAL_STATES.join(', ')})`,
    );
  }
  if (
    (row.decision === 'plan.approved' || row.decision === 'plan.revision_requested')
    && row.recordedState !== 'PLAN_REVIEW'
  ) {
    throw new RangeError(`${row.decision} fires only from PLAN_REVIEW (T4/T5): ${row.recordedState}`);
  }
  const effective = effectivePlanBearingState(row.recordedState, row.priorState);
  if (planHashRequired(effective)) {
    if (row.planHash === undefined) {
      throw new RangeError(
        `plan_hash is required at effective plan-bearing state ${effective} (contract §2)`,
      );
    }
  } else if (row.planHash !== undefined) {
    throw new RangeError(
      `plan_hash must be absent at effective plan-bearing state ${effective} (contract §2, no sentinel)`,
    );
  }
  if (row.planHash !== undefined && !isHex64(row.planHash)) {
    throw new RangeError('plan_hash must be 64 lowercase hex characters');
  }
  if (row.authorizationRef.trim() === '') {
    throw new RangeError('authorization_ref must be non-empty');
  }
  if (row.lifecycleEventRef.roomId.trim() === '' || row.lifecycleEventRef.eventId.trim() === '') {
    throw new RangeError('lifecycle_event_ref must carry non-empty room_id and event_id');
  }
  if (!isCanonicalRecordedAt(row.recordedAt)) {
    throw new RangeError(
      `recorded_at is not the canonical RFC 3339 UTC microsecond form on a valid calendar date: ${row.recordedAt}`,
    );
  }
}

/** Canonical byte sequence of a decision-class record row, spec (d) v1. */
export function encodeDecisionRecordRow(row: DecisionRecordRow): Uint8Array {
  validateRow(row);
  return concatBytes([
    lpString(SPEC_ID_D),
    stringField(TAG_RECORD_CLASS, RECORD_CLASS_DECISION),
    stringField(TAG_SEQ, row.seq),
    stringField(TAG_DECISION, row.decision),
    stringField(TAG_ACTOR_ID, row.actorId),
    stringField(TAG_RECORDED_STATE, row.recordedState),
    stringField(TAG_PRIOR_STATE, row.priorState),
    stringField(TAG_PLAN_HASH, row.planHash),
    stringField(TAG_AUTHORIZATION_REF, row.authorizationRef),
    pairField(TAG_LIFECYCLE_EVENT_REF, {
      first: row.lifecycleEventRef.roomId,
      second: row.lifecycleEventRef.eventId,
    }),
    stringField(TAG_RECORDED_AT, row.recordedAt),
  ]);
}
