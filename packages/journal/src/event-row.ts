/**
 * Serialization contract (c) — the complete command-class event row.
 *
 * Spec: `packages/journal/specs/serialization-c-command-row.md`, version 1
 * (`BRJ:c:1`), and `packages/journal/specs/serialization-c-command-row-v2.md`,
 * version 2 (`BRJ:c:2`), which adds two fields a `dispatched` event may carry.
 * The chain hash covers these bytes framed with the prior row's chain hash
 * (contract §4.1, §6.2; framing in `chain.ts`). Each row's bytes begin with
 * the spec id that encodes them, and a reader chooses the decoder by it.
 *
 * The record class is an explicit field in the canonical byte input — the
 * first encoded field — never inferred from absent fields (contract §2, §6.2).
 * Row-level field legality per event type is enforced here; cross-row rules
 * (ordering invariants, set-once identity, the §5.3 completion test) belong
 * to the 2b append and verification layer.
 */

import {
  arrayField,
  bytesField,
  concatBytes,
  isCanonicalRecordedAt,
  isCanonicalSeq,
  isHex64,
  lpString,
  pairField,
  requireString,
  requireStringArray,
  stringField,
} from './bytes.js';
import {
  encodeEnvelope,
  envelopeDigest,
  type NormalizedCommandEnvelope,
} from './envelope.js';

export const SPEC_ID_C = 'BRJ:c:1';
/** Version 2 of spec (c): version 1's fields, then `init_model` and `provider_conversation_id`. */
export const SPEC_ID_C2 = 'BRJ:c:2';

export type CommandRowSpec = typeof SPEC_ID_C | typeof SPEC_ID_C2;

export const RECORD_CLASS_COMMAND = 'command';

/** Closed command-event vocabulary, contract §5.2. */
export const COMMAND_EVENT_TYPES = [
  'journaled',
  'identity_bound',
  'dispatched',
  'completed',
  'failed',
  'unresolved',
  'resolved',
] as const;

export type CommandEventType = (typeof COMMAND_EVENT_TYPES)[number];

export const RESOLUTION_DETERMINATIONS = ['completed', 'failed'] as const;
export type ResolutionDetermination = (typeof RESOLUTION_DETERMINATIONS)[number];

/** Consumed 3.5 reconciliation semantics, contract §5.2. */
export const RESOLUTION_SEMANTICS = ['reconciled', 'ambiguous', 'mismatch'] as const;
export type ResolutionSemantics = (typeof RESOLUTION_SEMANTICS)[number];

/** Normative pair (`room_id`, `event_id`), contract §1.4. */
export interface LifecycleEventRef {
  readonly roomId: string;
  readonly eventId: string;
}

export const COMMAND_ID_PREFIX = 'cmd_';

export interface CommandEventRow {
  /** Canonical ASCII decimal, at least 1 (genesis holds 0; no row does). */
  readonly seq: string;
  readonly eventType: CommandEventType;
  /** Dedicated `cmd_` namespace, contract §2 element 1. */
  readonly commandId: string;
  readonly roomId?: string;
  readonly runId?: string;
  readonly executionId?: string;
  readonly actorId?: string;
  readonly roleId?: string;
  readonly repository?: string;
  readonly scopeRef?: string;
  readonly commandEnvelope?: NormalizedCommandEnvelope;
  readonly envelopeDigest?: string;
  readonly authorizationRef?: string;
  readonly intendedProvider?: string;
  readonly intendedModel?: string;
  readonly intendedSurface?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly executionSurface?: string;
  readonly failureClassification?: string;
  readonly resolutionDetermination?: ResolutionDetermination;
  readonly resolutionSemantics?: ResolutionSemantics;
  readonly lifecycleEventRef?: LifecycleEventRef;
  /** Recorded order, never re-sorted (contract §6.2). May be empty. */
  readonly evidenceRefs: readonly string[];
  /** Canonical RFC 3339 UTC, six fractional digits. */
  readonly recordedAt: string;
  /** `BRJ:c:2` only: the model the executor's init event named, on `dispatched`. */
  readonly initModel?: string;
  /** `BRJ:c:2` only: the provider's conversation id from the same init event, on `dispatched`. */
  readonly providerConversationId?: string;
}

const TAG_RECORD_CLASS = 0x01;
const TAG_SEQ = 0x02;
const TAG_EVENT_TYPE = 0x03;
const TAG_COMMAND_ID = 0x04;
const TAG_ROOM_ID = 0x05;
const TAG_RUN_ID = 0x06;
const TAG_EXECUTION_ID = 0x07;
const TAG_ACTOR_ID = 0x08;
const TAG_ROLE_ID = 0x09;
const TAG_REPOSITORY = 0x0a;
const TAG_SCOPE_REF = 0x0b;
const TAG_COMMAND_ENVELOPE = 0x0c;
const TAG_ENVELOPE_DIGEST = 0x0d;
const TAG_AUTHORIZATION_REF = 0x0e;
const TAG_INTENDED_PROVIDER = 0x0f;
const TAG_INTENDED_MODEL = 0x10;
const TAG_INTENDED_SURFACE = 0x11;
const TAG_PROVIDER = 0x12;
const TAG_MODEL = 0x13;
const TAG_EXECUTION_SURFACE = 0x14;
const TAG_FAILURE_CLASSIFICATION = 0x15;
const TAG_RESOLUTION_DETERMINATION = 0x16;
const TAG_RESOLUTION_SEMANTICS = 0x17;
const TAG_LIFECYCLE_EVENT_REF = 0x18;
const TAG_EVIDENCE_REFS = 0x19;
const TAG_RECORDED_AT = 0x1a;
const TAG_INIT_MODEL = 0x1b;
const TAG_PROVIDER_CONVERSATION_ID = 0x1c;

type OptionalFieldName =
  | 'roomId'
  | 'runId'
  | 'executionId'
  | 'actorId'
  | 'roleId'
  | 'repository'
  | 'scopeRef'
  | 'commandEnvelope'
  | 'envelopeDigest'
  | 'authorizationRef'
  | 'intendedProvider'
  | 'intendedModel'
  | 'intendedSurface'
  | 'provider'
  | 'model'
  | 'executionSurface'
  | 'failureClassification'
  | 'resolutionDetermination'
  | 'resolutionSemantics'
  | 'lifecycleEventRef';

/** Carried by `journaled` alone: §2 elements 3 and 5–7 plus intended routing. */
const JOURNALED_ONLY: readonly OptionalFieldName[] = [
  'actorId',
  'roleId',
  'repository',
  'scopeRef',
  'commandEnvelope',
  'envelopeDigest',
  'authorizationRef',
  'intendedProvider',
  'intendedModel',
  'intendedSurface',
];

/** The observed actual routing identity, carried by `dispatched` alone (§2 element 4). */
const OBSERVED_IDENTITY: readonly OptionalFieldName[] = ['provider', 'model', 'executionSurface'];

/** Element-2 identities: recorded on `journaled`, `identity_bound`, or `dispatched` only (§2). */
const ELEMENT_2_IDENTITIES: readonly OptionalFieldName[] = ['roomId', 'runId', 'executionId'];

interface EventShape {
  readonly required: readonly OptionalFieldName[];
  readonly allowed: readonly OptionalFieldName[];
  /** `identity_bound` carries only the identities it binds (§5.2). */
  readonly evidenceRefsMustBeEmpty: boolean;
}

const EVENT_SHAPES: Readonly<Record<CommandEventType, EventShape>> = {
  journaled: {
    required: JOURNALED_ONLY,
    allowed: [...JOURNALED_ONLY, ...ELEMENT_2_IDENTITIES, 'lifecycleEventRef'],
    evidenceRefsMustBeEmpty: false,
  },
  identity_bound: {
    required: [],
    allowed: ELEMENT_2_IDENTITIES,
    evidenceRefsMustBeEmpty: true,
  },
  dispatched: {
    required: OBSERVED_IDENTITY,
    allowed: [...OBSERVED_IDENTITY, ...ELEMENT_2_IDENTITIES, 'lifecycleEventRef'],
    evidenceRefsMustBeEmpty: false,
  },
  completed: {
    required: [],
    allowed: ['lifecycleEventRef'],
    evidenceRefsMustBeEmpty: false,
  },
  failed: {
    required: ['failureClassification'],
    allowed: ['failureClassification', 'lifecycleEventRef'],
    evidenceRefsMustBeEmpty: false,
  },
  unresolved: {
    required: [],
    allowed: ['lifecycleEventRef'],
    evidenceRefsMustBeEmpty: false,
  },
  resolved: {
    required: ['resolutionDetermination', 'resolutionSemantics'],
    allowed: ['resolutionDetermination', 'resolutionSemantics', 'lifecycleEventRef'],
    evidenceRefsMustBeEmpty: false,
  },
};

function requireNonEmpty(name: string, value: string): void {
  if (value.trim() === '') {
    throw new RangeError(`${name} must be non-empty`);
  }
}

/**
 * `BRJ:c:2`'s two fields: carried by `dispatched` alone, both or neither, each non-empty.
 * `BRJ:c:1` has neither field, so a row carrying one has no version 1 form.
 */
function validateInitFields(row: CommandEventRow, spec: CommandRowSpec): void {
  const carried = [row.initModel, row.providerConversationId].filter((value) => value !== undefined).length;
  if (carried === 0) return;
  if (spec === SPEC_ID_C) {
    throw new RangeError(`init_model and provider_conversation_id have no ${SPEC_ID_C} form; encode under ${SPEC_ID_C2}`);
  }
  if (row.eventType !== 'dispatched') {
    throw new RangeError(`init_model and provider_conversation_id are not carried by a ${row.eventType} event`);
  }
  if (carried !== 2) {
    throw new RangeError('init_model and provider_conversation_id are carried together or not at all');
  }
  requireString('init_model', row.initModel);
  requireNonEmpty('init_model', row.initModel as string);
  requireString('provider_conversation_id', row.providerConversationId);
  requireNonEmpty('provider_conversation_id', row.providerConversationId as string);
}

function validateRow(row: CommandEventRow, spec: CommandRowSpec): void {
  validateInitFields(row, spec);
  if (!(COMMAND_EVENT_TYPES as readonly string[]).includes(row.eventType)) {
    throw new RangeError(`not a command event type: ${String(row.eventType)}`);
  }
  requireString('seq', row.seq);
  requireString('command_id', row.commandId);
  requireString('recorded_at', row.recordedAt);
  requireStringArray('evidence_refs', row.evidenceRefs);
  if (!isCanonicalSeq(row.seq)) {
    throw new RangeError(`seq is not canonical ASCII decimal >= 1: ${row.seq}`);
  }
  if (!row.commandId.startsWith(COMMAND_ID_PREFIX) || row.commandId === COMMAND_ID_PREFIX) {
    throw new RangeError(`command_id must use the ${COMMAND_ID_PREFIX} namespace: ${row.commandId}`);
  }
  if (!isCanonicalRecordedAt(row.recordedAt)) {
    throw new RangeError(
      `recorded_at is not the canonical RFC 3339 UTC microsecond form on a valid calendar date: ${row.recordedAt}`,
    );
  }

  const shape = EVENT_SHAPES[row.eventType];
  const allowed = new Set<OptionalFieldName>(shape.allowed);
  const presentNames: OptionalFieldName[] = [];
  const optionalNames: readonly OptionalFieldName[] = [
    'roomId', 'runId', 'executionId', 'actorId', 'roleId', 'repository', 'scopeRef',
    'commandEnvelope', 'envelopeDigest', 'authorizationRef',
    'intendedProvider', 'intendedModel', 'intendedSurface',
    'provider', 'model', 'executionSurface',
    'failureClassification', 'resolutionDetermination', 'resolutionSemantics',
    'lifecycleEventRef',
  ];
  for (const name of optionalNames) {
    if (row[name] !== undefined) {
      presentNames.push(name);
    }
  }
  for (const name of presentNames) {
    if (!allowed.has(name)) {
      throw new RangeError(`${name} is not carried by a ${row.eventType} event`);
    }
  }
  for (const name of shape.required) {
    if (row[name] === undefined) {
      throw new RangeError(`${name} is required on a ${row.eventType} event`);
    }
  }

  if (row.eventType === 'identity_bound' && !ELEMENT_2_IDENTITIES.some((n) => row[n] !== undefined)) {
    throw new RangeError('identity_bound with nothing to bind is invalid (contract §5.2)');
  }
  if (shape.evidenceRefsMustBeEmpty && row.evidenceRefs.length > 0) {
    throw new RangeError(`${row.eventType} carries no evidence_refs (contract §5.2)`);
  }

  for (const name of presentNames) {
    if (name === 'commandEnvelope' || name === 'lifecycleEventRef') {
      continue;
    }
    const value = row[name];
    requireString(name, value);
    requireNonEmpty(name, value);
  }
  for (const ref of row.evidenceRefs) {
    requireNonEmpty('evidence_refs entry', ref);
  }
  if (row.lifecycleEventRef !== undefined) {
    requireString('lifecycle_event_ref.room_id', row.lifecycleEventRef?.roomId);
    requireString('lifecycle_event_ref.event_id', row.lifecycleEventRef?.eventId);
    requireNonEmpty('lifecycle_event_ref.room_id', row.lifecycleEventRef.roomId);
    requireNonEmpty('lifecycle_event_ref.event_id', row.lifecycleEventRef.eventId);
  }
  if (row.resolutionDetermination !== undefined
    && !(RESOLUTION_DETERMINATIONS as readonly string[]).includes(row.resolutionDetermination)) {
    throw new RangeError(`not a resolution determination: ${String(row.resolutionDetermination)}`);
  }
  if (row.resolutionSemantics !== undefined
    && !(RESOLUTION_SEMANTICS as readonly string[]).includes(row.resolutionSemantics)) {
    throw new RangeError(`not a reconciliation semantics value: ${String(row.resolutionSemantics)}`);
  }
  if (row.envelopeDigest !== undefined) {
    if (!isHex64(row.envelopeDigest)) {
      throw new RangeError('envelope_digest must be 64 lowercase hex characters');
    }
    if (row.commandEnvelope === undefined) {
      throw new RangeError('envelope_digest without command_envelope');
    }
    const computed = envelopeDigest(row.commandEnvelope);
    if (computed !== row.envelopeDigest) {
      throw new RangeError('envelope_digest does not match the canonical envelope bytes');
    }
  }
  if (row.commandEnvelope !== undefined && row.envelopeDigest === undefined) {
    throw new RangeError('command_envelope without envelope_digest');
  }
}

/** Canonical byte sequence of a command-class event row, spec (c) v1. */
export function encodeCommandEventRow(row: CommandEventRow): Uint8Array {
  validateRow(row, SPEC_ID_C);
  return concatBytes(v1Fields(SPEC_ID_C, row));
}

/**
 * Canonical byte sequence of a command-class event row, spec (c) v2: version 1's
 * fields in version 1's order, under the version 2 spec id, then the two init fields.
 */
export function encodeCommandEventRowV2(row: CommandEventRow): Uint8Array {
  validateRow(row, SPEC_ID_C2);
  return concatBytes([
    ...v1Fields(SPEC_ID_C2, row),
    stringField(TAG_INIT_MODEL, row.initModel),
    stringField(TAG_PROVIDER_CONVERSATION_ID, row.providerConversationId),
  ]);
}

/**
 * Encodes a row under the spec named, the one its bytes are to begin with. A value
 * naming neither command row spec is refused, never read as version 1.
 */
export function encodeCommandEventRowAs(spec: CommandRowSpec, row: CommandEventRow): Uint8Array {
  if (spec === SPEC_ID_C2) return encodeCommandEventRowV2(row);
  if (spec === SPEC_ID_C) return encodeCommandEventRow(row);
  throw new RangeError(`not a command row spec: ${JSON.stringify(spec)}`);
}

/**
 * A chain's command rows may move from `BRJ:c:1` to `BRJ:c:2` once and never back:
 * the reason the command row at `index` breaks that, or null. Decision rows are
 * not in `specs`; it lists the command rows' spec ids in `seq` order.
 */
export function commandSpecOrderDefect(specs: readonly string[]): string | null {
  let seenV2 = false;
  for (const [index, spec] of specs.entries()) {
    if (spec === SPEC_ID_C2) seenV2 = true;
    else if (spec === SPEC_ID_C && seenV2) {
      return `command row ${index} is ${SPEC_ID_C} after a ${SPEC_ID_C2} command row`;
    } else if (spec !== SPEC_ID_C) {
      return `command row ${index} names no command row spec: ${JSON.stringify(spec)}`;
    }
  }
  return null;
}

function v1Fields(spec: CommandRowSpec, row: CommandEventRow): Uint8Array[] {
  return [
    lpString(spec),
    stringField(TAG_RECORD_CLASS, RECORD_CLASS_COMMAND),
    stringField(TAG_SEQ, row.seq),
    stringField(TAG_EVENT_TYPE, row.eventType),
    stringField(TAG_COMMAND_ID, row.commandId),
    stringField(TAG_ROOM_ID, row.roomId),
    stringField(TAG_RUN_ID, row.runId),
    stringField(TAG_EXECUTION_ID, row.executionId),
    stringField(TAG_ACTOR_ID, row.actorId),
    stringField(TAG_ROLE_ID, row.roleId),
    stringField(TAG_REPOSITORY, row.repository),
    stringField(TAG_SCOPE_REF, row.scopeRef),
    bytesField(
      TAG_COMMAND_ENVELOPE,
      row.commandEnvelope === undefined ? undefined : encodeEnvelope(row.commandEnvelope),
    ),
    stringField(TAG_ENVELOPE_DIGEST, row.envelopeDigest),
    stringField(TAG_AUTHORIZATION_REF, row.authorizationRef),
    stringField(TAG_INTENDED_PROVIDER, row.intendedProvider),
    stringField(TAG_INTENDED_MODEL, row.intendedModel),
    stringField(TAG_INTENDED_SURFACE, row.intendedSurface),
    stringField(TAG_PROVIDER, row.provider),
    stringField(TAG_MODEL, row.model),
    stringField(TAG_EXECUTION_SURFACE, row.executionSurface),
    stringField(TAG_FAILURE_CLASSIFICATION, row.failureClassification),
    stringField(TAG_RESOLUTION_DETERMINATION, row.resolutionDetermination),
    stringField(TAG_RESOLUTION_SEMANTICS, row.resolutionSemantics),
    pairField(
      TAG_LIFECYCLE_EVENT_REF,
      row.lifecycleEventRef === undefined
        ? undefined
        : { first: row.lifecycleEventRef.roomId, second: row.lifecycleEventRef.eventId },
    ),
    arrayField(TAG_EVIDENCE_REFS, row.evidenceRefs),
    stringField(TAG_RECORDED_AT, row.recordedAt),
  ];
}
