/**
 * Golden-vector inputs and builders for the §6.2 serialization contracts
 * (a) to (e). The INPUTS here are hand-authored synthetic values (clearly
 * fake, no credential-shaped material); every canonical byte string and
 * every hash in a built vector object is produced by the implementation,
 * never hand-authored (contract §6.2).
 *
 * `test/journal-vectors.test.ts` rebuilds these objects on every run and
 * asserts byte-identity with the committed files under
 * `packages/journal/vectors/`, so a drifted vector fails the suite.
 */

import { Buffer } from 'node:buffer';
import {
  BUILDER_COMMAND_KIND,
  GENESIS_CHAIN_HASH,
  SPEC_ID_A,
  SPEC_ID_B,
  SPEC_ID_C,
  SPEC_ID_C2,
  SPEC_ID_D,
  SPEC_ID_E,
  chainHash,
  encodeBindingRecordRow,
  encodeCommandEventRow,
  encodeCommandEventRowAs,
  encodeDecisionRecordRow,
  encodeEnvelope,
  encodePlanDoc,
  envelopeDigest,
  planHash,
  sha256Hex,
  type BindingRecordRow,
  type CanonicalDocument,
  type CommandEventRow,
  type CommandRowSpec,
  type DecisionRecordRow,
  type NormalizedCommandEnvelope,
} from '../../packages/journal/src/index.js';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

export const ENVELOPE_FULL: NormalizedCommandEnvelope = {
  envelopeVersion: '1',
  commandKind: 'planner.invoke',
  argv: ['--goal', 'goal_example_0001', '--mode', 'plan'],
  targetRepository: 'example-org/example-repo',
  scopeRef: 'scope_example_0001',
};

export const ENVELOPE_MINIMAL: NormalizedCommandEnvelope = {
  envelopeVersion: '1',
  commandKind: 'planner.invoke',
  argv: [],
};

export const PLANDOC_EXAMPLE: CanonicalDocument = {
  plan_version: '1',
  title: 'Example plan document',
  approved: false,
  step_count: 3,
  annotation: null,
  steps: [
    { id: 1, action: 'read scope' },
    { id: 2, action: 'draft plan' },
    { id: 3, action: 'submit for review' },
  ],
  // Keys deliberately declared out of byte order here; the encoding
  // sorts object entries by UTF-8 key order, and the vector proves it.
  zeta: 'last-declared, encoded by key order',
  alpha: 'first by key order',
};

const T = (second: string): string => `2026-09-01T12:00:${second}.000000Z`;

const journaled = (
  seq: string,
  commandId: string,
  second: string,
  extra: Partial<CommandEventRow> = {},
): CommandEventRow => ({
  seq,
  eventType: 'journaled',
  commandId,
  actorId: 'agent.planner',
  roleId: 'planner',
  repository: 'example-org/example-repo',
  scopeRef: 'scope_example_0001',
  commandEnvelope: ENVELOPE_FULL,
  envelopeDigest: envelopeDigest(ENVELOPE_FULL),
  authorizationRef: 'auth_example_0001',
  intendedProvider: 'example-provider',
  intendedModel: 'example-model-1',
  intendedSurface: 'example-surface',
  evidenceRefs: [],
  recordedAt: T(second),
  ...extra,
});

/**
 * The mixed-chain rows: both record classes interleaved on one `seq`
 * space, every command event type exercised, both `plan_hash` presence
 * shapes present on the chain. Row-level legality only — the 2a layer
 * encodes rows; cross-row lifecycle legality is 2b's concern.
 */
export const CHAIN_ROWS: readonly (
  | { readonly recordClass: 'command'; readonly name: string; readonly row: CommandEventRow }
  | { readonly recordClass: 'decision'; readonly name: string; readonly row: DecisionRecordRow }
)[] = [
  {
    recordClass: 'command',
    name: 'journaled with pre-existing room identity',
    row: journaled('1', 'cmd_example_0001', '01', { roomId: 'room_example_0001' }),
  },
  {
    recordClass: 'command',
    name: 'identity_bound binding run and execution identities',
    row: {
      seq: '2',
      eventType: 'identity_bound',
      commandId: 'cmd_example_0001',
      runId: 'run_example_0001',
      executionId: 'exec_example_0001',
      evidenceRefs: [],
      recordedAt: T('02'),
    },
  },
  {
    recordClass: 'command',
    name: 'dispatched with observed identity equal to intent',
    row: {
      seq: '3',
      eventType: 'dispatched',
      commandId: 'cmd_example_0001',
      provider: 'example-provider',
      model: 'example-model-1',
      executionSurface: 'example-surface',
      evidenceRefs: ['evidence_example_dispatch_0001'],
      recordedAt: T('03'),
    },
  },
  {
    recordClass: 'decision',
    name: 'decision plan.approved at PLAN_REVIEW (plan_hash present)',
    row: {
      seq: '4',
      decision: 'plan.approved',
      actorId: 'founder',
      recordedState: 'PLAN_REVIEW',
      planHash: planHash(PLANDOC_EXAMPLE),
      authorizationRef: 'auth_example_0002',
      lifecycleEventRef: { roomId: 'room_example_0001', eventId: 'evt_example_0005' },
      recordedAt: T('04'),
    },
  },
  {
    recordClass: 'command',
    name: 'completed with evidence in recorded order',
    row: {
      seq: '5',
      eventType: 'completed',
      commandId: 'cmd_example_0001',
      evidenceRefs: ['evidence_example_0002', 'evidence_example_0001'],
      recordedAt: T('05'),
    },
  },
  {
    recordClass: 'command',
    name: 'journaled with no element-2 identity yet',
    row: journaled('6', 'cmd_example_0002', '06'),
  },
  {
    recordClass: 'command',
    name: 'failed pre-send with classification and no observed identity',
    row: {
      seq: '7',
      eventType: 'failed',
      commandId: 'cmd_example_0002',
      failureClassification: 'policy_rejection',
      evidenceRefs: [],
      recordedAt: T('07'),
    },
  },
  {
    recordClass: 'command',
    name: 'journaled for the unresolved-then-resolved path',
    row: journaled('8', 'cmd_example_0003', '08'),
  },
  {
    recordClass: 'command',
    name: 'dispatched for the unresolved-then-resolved path',
    row: {
      seq: '9',
      eventType: 'dispatched',
      commandId: 'cmd_example_0003',
      provider: 'example-provider',
      model: 'example-model-1',
      executionSurface: 'example-surface',
      evidenceRefs: [],
      recordedAt: T('09'),
    },
  },
  {
    recordClass: 'command',
    name: 'unresolved where provider contact cannot be ruled out',
    row: {
      seq: '10',
      eventType: 'unresolved',
      commandId: 'cmd_example_0003',
      evidenceRefs: ['evidence_example_timeout_0001'],
      recordedAt: T('10'),
    },
  },
  {
    recordClass: 'command',
    name: 'resolved to completed under reconciled semantics',
    row: {
      seq: '11',
      eventType: 'resolved',
      commandId: 'cmd_example_0003',
      resolutionDetermination: 'completed',
      resolutionSemantics: 'reconciled',
      evidenceRefs: ['evidence_example_reconciliation_0001'],
      recordedAt: T('11'),
    },
  },
  {
    recordClass: 'decision',
    name: 'decision founder.cancel pre-plan at ROOM_CREATED (plan_hash absent)',
    row: {
      seq: '12',
      decision: 'founder.cancel',
      actorId: 'founder',
      recordedState: 'ROOM_CREATED',
      authorizationRef: 'auth_example_0003',
      lifecycleEventRef: { roomId: 'room_example_0002', eventId: 'evt_example_0001' },
      recordedAt: T('12'),
    },
  },
];

/**
 * The `BRJ:c:2` cutover chain: command rows under `BRJ:c:1`, a decision row, then
 * every later command row under `BRJ:c:2`, as a chain moves from one to the other
 * once. It covers a `dispatched` row carrying `init_model` and
 * `provider_conversation_id`, one carrying neither (a lane whose executor reports
 * no init event), and a `BRJ:c:2` row of each other shape the cutover needs.
 */
export const CHAIN_V2_ROWS: readonly (
  | { readonly recordClass: 'command'; readonly spec: CommandRowSpec; readonly name: string; readonly row: CommandEventRow }
  | { readonly recordClass: 'decision'; readonly name: string; readonly row: DecisionRecordRow }
)[] = [
  {
    recordClass: 'command',
    spec: SPEC_ID_C,
    name: 'BRJ:c:1 journaled before the cutover',
    row: journaled('1', 'cmd_example_0101', '21', { roomId: 'room_example_0101' }),
  },
  {
    recordClass: 'command',
    spec: SPEC_ID_C,
    name: 'BRJ:c:1 dispatched before the cutover, with no init fields',
    row: {
      seq: '2',
      eventType: 'dispatched',
      commandId: 'cmd_example_0101',
      provider: 'example-provider',
      model: 'example-model-1',
      executionSurface: 'example-surface',
      evidenceRefs: [],
      recordedAt: T('22'),
    },
  },
  {
    recordClass: 'decision',
    name: 'decision founder.cancel pre-plan, between the two versions',
    row: {
      seq: '3',
      decision: 'founder.cancel',
      actorId: 'founder',
      recordedState: 'ROOM_CREATED',
      authorizationRef: 'auth_example_0101',
      lifecycleEventRef: { roomId: 'room_example_0102', eventId: 'evt_example_0101' },
      recordedAt: T('23'),
    },
  },
  {
    recordClass: 'command',
    spec: SPEC_ID_C2,
    name: 'BRJ:c:2 journaled after the cutover, the init fields absent',
    row: journaled('4', 'cmd_example_0102', '24'),
  },
  {
    recordClass: 'command',
    spec: SPEC_ID_C2,
    name: 'BRJ:c:2 dispatched carrying init_model and provider_conversation_id',
    row: {
      seq: '5',
      eventType: 'dispatched',
      commandId: 'cmd_example_0102',
      runId: 'run_example_0102',
      provider: 'example-provider',
      model: 'example-model-1',
      executionSurface: 'example-surface',
      evidenceRefs: ['plandoc/example_0102'],
      recordedAt: T('25'),
      initModel: 'example-model-1',
      providerConversationId: 'conv_example_0102',
    },
  },
  {
    recordClass: 'command',
    spec: SPEC_ID_C2,
    name: 'BRJ:c:2 completed',
    row: {
      seq: '6',
      eventType: 'completed',
      commandId: 'cmd_example_0102',
      evidenceRefs: ['evidence_example_0102'],
      recordedAt: T('26'),
    },
  },
  {
    recordClass: 'command',
    spec: SPEC_ID_C2,
    name: 'BRJ:c:2 journaled for a lane whose executor reports no init event',
    row: journaled('7', 'cmd_example_0103', '27'),
  },
  {
    recordClass: 'command',
    spec: SPEC_ID_C2,
    name: 'BRJ:c:2 dispatched carrying neither init field',
    row: {
      seq: '8',
      eventType: 'dispatched',
      commandId: 'cmd_example_0103',
      provider: 'example-provider',
      model: 'example-model-1',
      executionSurface: 'example-surface',
      evidenceRefs: [],
      recordedAt: T('28'),
    },
  },
  {
    recordClass: 'command',
    spec: SPEC_ID_C2,
    name: 'BRJ:c:2 failed after dispatch',
    row: {
      seq: '9',
      eventType: 'failed',
      commandId: 'cmd_example_0103',
      failureClassification: 'route_mismatch',
      evidenceRefs: [],
      recordedAt: T('29'),
    },
  },
];

/** Standalone decision vectors covering every presence shape (contract §6.2, §10). */
export const DECISION_VECTOR_ROWS: readonly { readonly name: string; readonly row: DecisionRecordRow }[] = [
  {
    name: 'pre-plan T22 cancellation at ROOM_CREATED: plan_hash absent',
    row: {
      seq: '1',
      decision: 'founder.cancel',
      actorId: 'founder',
      recordedState: 'ROOM_CREATED',
      authorizationRef: 'auth_example_0011',
      lifecycleEventRef: { roomId: 'room_example_0003', eventId: 'evt_example_0001' },
      recordedAt: T('21'),
    },
  },
  {
    name: 'T5 approval at PLAN_REVIEW: plan_hash present',
    row: {
      seq: '2',
      decision: 'plan.approved',
      actorId: 'founder',
      recordedState: 'PLAN_REVIEW',
      planHash: planHash(PLANDOC_EXAMPLE),
      authorizationRef: 'auth_example_0012',
      lifecycleEventRef: { roomId: 'room_example_0003', eventId: 'evt_example_0002' },
      recordedAt: T('22'),
    },
  },
  {
    name: 'T22 at RECONCILING over prior SCOPED: plan_hash absent',
    row: {
      seq: '3',
      decision: 'founder.cancel',
      actorId: 'founder',
      recordedState: 'RECONCILING',
      priorState: 'SCOPED',
      authorizationRef: 'auth_example_0013',
      lifecycleEventRef: { roomId: 'room_example_0004', eventId: 'evt_example_0003' },
      recordedAt: T('23'),
    },
  },
  {
    name: 'T22 at RECONCILING over prior BUILDING: plan_hash present',
    row: {
      seq: '4',
      decision: 'founder.cancel',
      actorId: 'founder',
      recordedState: 'RECONCILING',
      priorState: 'BUILDING',
      planHash: planHash(PLANDOC_EXAMPLE),
      authorizationRef: 'auth_example_0014',
      lifecycleEventRef: { roomId: 'room_example_0004', eventId: 'evt_example_0004' },
      recordedAt: T('24'),
    },
  },
];

// ---------------------------------------------------------------------------
// Spec (e): binding rows (contract §2 "Binding-class records", §13 B1–B6).
// Lifecycle rooms and Gateways are canonical lowercase UUIDs and runtime
// rooms `room-` + one; every value below is synthetic and plainly fake.
// ---------------------------------------------------------------------------

export const BINDING_LIFECYCLE_ROOM_A = 'aaaaaaaa-0000-4000-8000-000000000301';
export const BINDING_LIFECYCLE_ROOM_B = 'aaaaaaaa-0000-4000-8000-000000000302';
export const BINDING_RUNTIME_ROOM_A = 'room-bbbbbbbb-0000-4000-8000-000000000301';
export const BINDING_RUNTIME_ROOM_B = 'room-bbbbbbbb-0000-4000-8000-000000000302';
export const BINDING_GATEWAY = 'cccccccc-0000-4000-8000-000000000301';

const TB = (second: string): string => `2026-11-17T12:00:${second}.000000Z`;

/** A Builder command's normalized envelope: its kind is what marks it a Builder command. */
export const ENVELOPE_BUILDER: NormalizedCommandEnvelope = {
  envelopeVersion: '1',
  commandKind: BUILDER_COMMAND_KIND,
  argv: ['--plan', 'plan_example_0301'],
  targetRepository: 'example-org/example-repo',
  scopeRef: 'scope_example_0301',
};

const PLANDOC_EXAMPLE_B: CanonicalDocument = { plan_version: '1', title: 'Second example plan document' };

/** A Builder command's `journaled` row, naming the room's `runtime_room.bound` entry (B3, B6). */
const builderJournaled = (
  seq: string,
  commandId: string,
  second: string,
  roomId: string,
  boundEventId: string,
): CommandEventRow => ({
  seq,
  eventType: 'journaled',
  commandId,
  roomId,
  actorId: 'agent.builder',
  roleId: 'builder',
  repository: 'example-org/example-repo',
  scopeRef: 'scope_example_0301',
  commandEnvelope: ENVELOPE_BUILDER,
  envelopeDigest: envelopeDigest(ENVELOPE_BUILDER),
  authorizationRef: 'auth_example_0301',
  intendedProvider: 'example-provider',
  intendedModel: 'example-model-2',
  intendedSurface: 'example-builder-surface',
  lifecycleEventRef: { roomId, eventId: boundEventId },
  evidenceRefs: [],
  recordedAt: TB(second),
});

/** Standalone binding vectors. Every field is required, so the shapes vary in value, not presence. */
export const BINDING_VECTOR_ROWS: readonly { readonly name: string; readonly row: BindingRecordRow }[] = [
  {
    name: 'binding of a lifecycle room to the runtime room its Gateway minted, after its first Builder command',
    row: {
      seq: '2',
      event: 'runtime_room.bound',
      actorId: 'system',
      lifecycleRoomId: BINDING_LIFECYCLE_ROOM_A,
      runtimeRoomId: BINDING_RUNTIME_ROOM_A,
      gatewayId: BINDING_GATEWAY,
      recordedState: 'BUILDING',
      planHash: planHash(PLANDOC_EXAMPLE),
      lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_example_0303' },
      recordedAt: TB('31'),
    },
  },
  {
    name: 'binding of a second lifecycle room to another runtime room on the same Gateway',
    row: {
      seq: '7',
      event: 'runtime_room.bound',
      actorId: 'system',
      lifecycleRoomId: BINDING_LIFECYCLE_ROOM_B,
      runtimeRoomId: BINDING_RUNTIME_ROOM_B,
      gatewayId: BINDING_GATEWAY,
      recordedState: 'BUILDING',
      planHash: planHash(PLANDOC_EXAMPLE_B),
      lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_B, eventId: 'evt_example_0311' },
      recordedAt: TB('32'),
    },
  },
  {
    name: 'binding whose event id carries a multi-byte character: lp counts UTF-8 bytes',
    row: {
      seq: '12',
      event: 'runtime_room.bound',
      actorId: 'system',
      lifecycleRoomId: 'aaaaaaaa-0000-4000-8000-000000000303',
      runtimeRoomId: 'room-bbbbbbbb-0000-4000-8000-000000000303',
      gatewayId: 'cccccccc-0000-4000-8000-000000000302',
      recordedState: 'BUILDING',
      planHash: planHash(PLANDOC_EXAMPLE),
      lifecycleEventRef: { roomId: 'aaaaaaaa-0000-4000-8000-000000000303', eventId: 'evt_example_é_0321' },
      recordedAt: TB('33'),
    },
  },
];

type BindingChainEntry =
  | { readonly recordClass: 'command'; readonly name: string; readonly row: CommandEventRow }
  | { readonly recordClass: 'decision'; readonly commandId: string; readonly name: string; readonly row: DecisionRecordRow }
  | { readonly recordClass: 'binding'; readonly commandId: string; readonly name: string; readonly row: BindingRecordRow };

/**
 * The binding chain: command rows (all `BRJ:c:2`, as a chain writes them since
 * the cutover), a plan decision and two bindings on one `seq` space. Each
 * Builder command's first `journaled` row sits at k and its binding at k+1
 * (B3); a later Builder command of the first room names that room's binding
 * entry (B6). A decision or binding row's stored `command_id` column is
 * outside its bytes (§13 G4) and is carried here beside them, so the chain's
 * cross-row rules can be run over the committed file.
 */
export const BINDING_CHAIN_ROWS: readonly BindingChainEntry[] = [
  {
    recordClass: 'command',
    name: 'planner journaled for lifecycle room A',
    row: journaled('1', 'cmd_example_0301', '01', {
      roomId: BINDING_LIFECYCLE_ROOM_A,
      lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_example_0301' },
      recordedAt: TB('01'),
    }),
  },
  {
    recordClass: 'command',
    name: 'planner dispatched carrying init_model and provider_conversation_id',
    row: {
      seq: '2',
      eventType: 'dispatched',
      commandId: 'cmd_example_0301',
      provider: 'example-provider',
      model: 'example-model-1',
      executionSurface: 'example-surface',
      evidenceRefs: [],
      recordedAt: TB('02'),
      initModel: 'example-model-1',
      providerConversationId: 'conv_example_0301',
    },
  },
  {
    recordClass: 'command',
    name: 'planner completed with its PlanDoc as evidence',
    row: {
      seq: '3',
      eventType: 'completed',
      commandId: 'cmd_example_0301',
      evidenceRefs: ['plandoc/example_0301'],
      recordedAt: TB('03'),
    },
  },
  {
    recordClass: 'decision',
    commandId: 'cmd_example_0301',
    name: 'decision plan.approved at PLAN_REVIEW, bound to the planner command',
    row: {
      seq: '4',
      decision: 'plan.approved',
      actorId: 'founder',
      recordedState: 'PLAN_REVIEW',
      planHash: planHash(PLANDOC_EXAMPLE),
      authorizationRef: 'auth_example_0302',
      lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_example_0302' },
      recordedAt: TB('04'),
    },
  },
  {
    recordClass: 'command',
    name: 'first Builder command journaled at k, naming the runtime_room.bound entry',
    row: builderJournaled('5', 'cmd_example_0302', '05', BINDING_LIFECYCLE_ROOM_A, 'evt_example_0303'),
  },
  {
    recordClass: 'binding',
    commandId: 'cmd_example_0302',
    name: 'binding of room A at k+1, its command_id column naming the first Builder command',
    row: {
      seq: '6',
      event: 'runtime_room.bound',
      actorId: 'system',
      lifecycleRoomId: BINDING_LIFECYCLE_ROOM_A,
      runtimeRoomId: BINDING_RUNTIME_ROOM_A,
      gatewayId: BINDING_GATEWAY,
      recordedState: 'BUILDING',
      planHash: planHash(PLANDOC_EXAMPLE),
      lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_A, eventId: 'evt_example_0303' },
      recordedAt: TB('06'),
    },
  },
  {
    recordClass: 'command',
    name: 'first Builder command dispatched, carrying neither init field',
    row: {
      seq: '7',
      eventType: 'dispatched',
      commandId: 'cmd_example_0302',
      runId: 'run_example_0302',
      provider: 'example-provider',
      model: 'example-model-2',
      executionSurface: 'example-builder-surface',
      evidenceRefs: [],
      recordedAt: TB('07'),
    },
  },
  {
    recordClass: 'command',
    name: 'first Builder command completed',
    row: {
      seq: '8',
      eventType: 'completed',
      commandId: 'cmd_example_0302',
      evidenceRefs: ['evidence_example_0302'],
      recordedAt: TB('08'),
    },
  },
  {
    recordClass: 'command',
    name: 'a later Builder command of room A, naming the binding entry (B6)',
    row: builderJournaled('9', 'cmd_example_0303', '09', BINDING_LIFECYCLE_ROOM_A, 'evt_example_0303'),
  },
  {
    recordClass: 'command',
    name: 'the later Builder command failed before dispatch',
    row: {
      seq: '10',
      eventType: 'failed',
      commandId: 'cmd_example_0303',
      failureClassification: 'policy_rejection',
      evidenceRefs: [],
      recordedAt: TB('10'),
    },
  },
  {
    recordClass: 'command',
    name: 'first Builder command of lifecycle room B journaled at k',
    row: builderJournaled('11', 'cmd_example_0304', '11', BINDING_LIFECYCLE_ROOM_B, 'evt_example_0311'),
  },
  {
    recordClass: 'binding',
    commandId: 'cmd_example_0304',
    name: 'binding of room B at k+1, to another runtime room on the same Gateway',
    row: {
      seq: '12',
      event: 'runtime_room.bound',
      actorId: 'system',
      lifecycleRoomId: BINDING_LIFECYCLE_ROOM_B,
      runtimeRoomId: BINDING_RUNTIME_ROOM_B,
      gatewayId: BINDING_GATEWAY,
      recordedState: 'BUILDING',
      planHash: planHash(PLANDOC_EXAMPLE_B),
      lifecycleEventRef: { roomId: BINDING_LIFECYCLE_ROOM_B, eventId: 'evt_example_0311' },
      recordedAt: TB('12'),
    },
  },
];

export function buildEnvelopeVectorFile(): object {
  const inputs = [
    { name: 'full envelope with target and scope', envelope: ENVELOPE_FULL },
    { name: 'minimal envelope with empty argv and optionals absent', envelope: ENVELOPE_MINIMAL },
  ];
  return {
    spec: SPEC_ID_A,
    generated_by: 'test/support/generate-journal-vectors.ts',
    vectors: inputs.map(({ name, envelope }) => {
      const bytes = encodeEnvelope(envelope);
      return {
        name,
        input: envelope,
        canonical_hex: hex(bytes),
        sha256: sha256Hex(bytes),
      };
    }),
  };
}

export function buildPlanDocVectorFile(): object {
  const bytes = encodePlanDoc(PLANDOC_EXAMPLE);
  return {
    spec: SPEC_ID_B,
    generated_by: 'test/support/generate-journal-vectors.ts',
    vectors: [
      {
        name: 'example document exercising every value type and key ordering',
        input: PLANDOC_EXAMPLE,
        canonical_hex: hex(bytes),
        sha256: sha256Hex(bytes),
      },
    ],
  };
}

export function buildDecisionVectorFile(): object {
  return {
    spec: SPEC_ID_D,
    generated_by: 'test/support/generate-journal-vectors.ts',
    vectors: DECISION_VECTOR_ROWS.map(({ name, row }) => {
      const bytes = encodeDecisionRecordRow(row);
      return {
        name,
        input: row,
        canonical_hex: hex(bytes),
        sha256: sha256Hex(bytes),
      };
    }),
  };
}

export function buildChainVectorFile(): object {
  let prior = GENESIS_CHAIN_HASH;
  const rows = CHAIN_ROWS.map((entry) => {
    const bytes =
      entry.recordClass === 'command'
        ? encodeCommandEventRow(entry.row)
        : encodeDecisionRecordRow(entry.row);
    const rowChainHash = chainHash(prior, bytes);
    const built = {
      name: entry.name,
      record_class: entry.recordClass,
      input: entry.row,
      canonical_hex: hex(bytes),
      row_sha256: sha256Hex(bytes),
      prior_chain_hash: prior,
      chain_hash: rowChainHash,
    };
    prior = rowChainHash;
    return built;
  });
  return {
    specs: [SPEC_ID_C, SPEC_ID_D],
    generated_by: 'test/support/generate-journal-vectors.ts',
    genesis: GENESIS_CHAIN_HASH,
    rows,
  };
}

/** The `BRJ:c:2` cutover chain, framed exactly as `chain.json` is. */
export function buildChainV2VectorFile(): object {
  let prior = GENESIS_CHAIN_HASH;
  const rows = CHAIN_V2_ROWS.map((entry) => {
    const bytes =
      entry.recordClass === 'command'
        ? encodeCommandEventRowAs(entry.spec, entry.row)
        : encodeDecisionRecordRow(entry.row);
    const rowChainHash = chainHash(prior, bytes);
    const built = {
      name: entry.name,
      record_class: entry.recordClass,
      spec: entry.recordClass === 'command' ? entry.spec : SPEC_ID_D,
      input: entry.row,
      canonical_hex: hex(bytes),
      row_sha256: sha256Hex(bytes),
      prior_chain_hash: prior,
      chain_hash: rowChainHash,
    };
    prior = rowChainHash;
    return built;
  });
  return {
    specs: [SPEC_ID_C, SPEC_ID_C2, SPEC_ID_D],
    generated_by: 'test/support/generate-journal-vectors.ts',
    genesis: GENESIS_CHAIN_HASH,
    rows,
  };
}

/** Standalone spec (e) vectors. */
export function buildBindingVectorFile(): object {
  return {
    spec: SPEC_ID_E,
    generated_by: 'test/support/generate-journal-vectors.ts',
    vectors: BINDING_VECTOR_ROWS.map(({ name, row }) => {
      const bytes = encodeBindingRecordRow(row);
      return {
        name,
        input: row,
        canonical_hex: hex(bytes),
        sha256: sha256Hex(bytes),
      };
    }),
  };
}

/** The binding chain, framed exactly as `chain.json` is, each row with its stored `command_id` column. */
export function buildChainBindingVectorFile(): object {
  let prior = GENESIS_CHAIN_HASH;
  const rows = BINDING_CHAIN_ROWS.map((entry) => {
    const bytes =
      entry.recordClass === 'command'
        ? encodeCommandEventRowAs(SPEC_ID_C2, entry.row)
        : entry.recordClass === 'decision'
          ? encodeDecisionRecordRow(entry.row)
          : encodeBindingRecordRow(entry.row);
    const rowChainHash = chainHash(prior, bytes);
    const built = {
      name: entry.name,
      record_class: entry.recordClass,
      spec: entry.recordClass === 'command' ? SPEC_ID_C2 : entry.recordClass === 'decision' ? SPEC_ID_D : SPEC_ID_E,
      command_id: entry.recordClass === 'command' ? entry.row.commandId : entry.commandId,
      input: entry.row,
      canonical_hex: hex(bytes),
      row_sha256: sha256Hex(bytes),
      prior_chain_hash: prior,
      chain_hash: rowChainHash,
    };
    prior = rowChainHash;
    return built;
  });
  return {
    specs: [SPEC_ID_C2, SPEC_ID_D, SPEC_ID_E],
    generated_by: 'test/support/generate-journal-vectors.ts',
    genesis: GENESIS_CHAIN_HASH,
    rows,
  };
}

/** Every vector file, keyed by its path under `packages/journal/vectors/`. */
export function buildAllVectorFiles(): ReadonlyMap<string, object> {
  return new Map<string, object>([
    ['envelope.json', buildEnvelopeVectorFile()],
    ['plandoc.json', buildPlanDocVectorFile()],
    ['decision-row.json', buildDecisionVectorFile()],
    ['binding-row.json', buildBindingVectorFile()],
    ['chain.json', buildChainVectorFile()],
    ['chain-v2.json', buildChainV2VectorFile()],
    ['chain-binding.json', buildChainBindingVectorFile()],
  ]);
}

/** Deterministic rendering: builder key order, two-space indent, one trailing newline. */
export function renderVectorFile(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
