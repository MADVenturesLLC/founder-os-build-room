/**
 * Golden-vector inputs and builders for the four §6.2 serialization
 * contracts. The INPUTS here are hand-authored synthetic values (clearly
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
  GENESIS_CHAIN_HASH,
  SPEC_ID_A,
  SPEC_ID_B,
  SPEC_ID_C,
  SPEC_ID_D,
  chainHash,
  encodeCommandEventRow,
  encodeDecisionRecordRow,
  encodeEnvelope,
  encodePlanDoc,
  envelopeDigest,
  planHash,
  sha256Hex,
  type CanonicalDocument,
  type CommandEventRow,
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

/** Every vector file, keyed by its path under `packages/journal/vectors/`. */
export function buildAllVectorFiles(): ReadonlyMap<string, object> {
  return new Map<string, object>([
    ['envelope.json', buildEnvelopeVectorFile()],
    ['plandoc.json', buildPlanDocVectorFile()],
    ['decision-row.json', buildDecisionVectorFile()],
    ['chain.json', buildChainVectorFile()],
  ]);
}

/** Deterministic rendering: builder key order, two-space indent, one trailing newline. */
export function renderVectorFile(value: object): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
