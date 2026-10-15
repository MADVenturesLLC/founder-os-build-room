/**
 * PlanDoc v1 — the architect seat's Implementation Plan as a
 * machine-checkable document.
 *
 * The Phase 4 Planner is the `architect` seat (Daedalus), whose terminal
 * status `PLAN_READY_FOR_FOUNDER_APPROVAL` is the plan T3 submits. Its
 * report contract (`contracts/seats/architect.md`, "Report contract") lists
 * what every Implementation Plan carries; this schema is that list, field
 * for field. The document's layout is a design choice the architecture
 * leaves open (FounderOS technical architecture, F-19: "the specific
 * document schema is a Step 2 choice"), made here; its content is the
 * seat contract's, not invented.
 *
 * Three fields of the report contract are left out because they describe the
 * plan file rather than the plan: "exact artifact path; SHA-256; byte and
 * line count". In Phase 4 the plan is not a file; the control plane computes
 * `plan_hash` over the document itself (contract §6.2, serialization (b)).
 *
 * Two additions are mechanism, as in the builder dogfood schema:
 * - `scope_paths` is "expected files" under the name G5 checks. Its
 *   canonical form is checked separately (`checkScopePaths` in
 *   `packages/contracts`), since the schema language has no ordering rule.
 * - `claims` pins the two acts the architect seat is prohibited from to
 *   `false` ("approve a plan", "authorize the Builder"), so a plan that
 *   asserts either is schema-invalid by construction.
 *
 * Every value is a string, a boolean, an array or an object: the canonical
 * encoding under `plan_hash` admits only safe integers, and the plan needs
 * none.
 */

import type { ObjectSchema, OutputSchema } from './schema.js';
import { FULL_SHA_PATTERN, SHA256_PATTERN } from './dogfood.js';

export const PLANDOC_SCHEMA_VERSION = 'plandoc/1';

export const PLAN_TERMINAL_STATUSES = [
  'PLAN_READY_FOR_FOUNDER_APPROVAL',
  'BLOCKED_RESEARCH_GAP',
  'BLOCKED_REPOSITORY_DRIFT',
  'BLOCKED_FOUNDER_DECISION',
  'INCONCLUSIVE_ARCHITECTURE',
] as const;
export type PlanTerminalStatus = (typeof PLAN_TERMINAL_STATUSES)[number];

/** Only this status submits a plan for the Founder's decision (T3). */
export const PLAN_READY_STATUS: PlanTerminalStatus = 'PLAN_READY_FOR_FOUNDER_APPROVAL';

const PROSE_MAX = 20_000;
const ITEM_MAX = 4_000;

const prose = (min = 1): OutputSchema => ({ type: 'string', min_length: min, max_length: PROSE_MAX });
const items = (minItems: number): OutputSchema => ({
  type: 'array',
  min_items: minItems,
  max_items: 200,
  items: { type: 'string', min_length: 1, max_length: ITEM_MAX },
});

const PROSE_SECTIONS = [
  'current_state',
  'constraints',
  'non_goals',
  'architecture_decision',
  'alternatives_considered',
  'components_and_boundaries',
  'interfaces_and_contracts',
  'data_flow',
  'trust_and_security_boundaries',
  'migration_and_compatibility',
  'error_and_failure_behavior',
  'observability',
  'test_strategy',
  'rollback_plan',
  'dependency_ordering',
] as const;

const LIST_SECTIONS = {
  acceptance_criteria: 1,
  implementation_sequence: 1,
  known_risks: 0,
  unresolved_founder_decisions: 0,
  plan_drift_stop_conditions: 1,
} as const;

export const PLANDOC_SCHEMA_V1: ObjectSchema = {
  type: 'object',
  additional_properties: false,
  required: [
    'schema_version',
    'work_id',
    'objective',
    'terminal_status',
    'controlling_inputs',
    'repository',
    'base_sha',
    'scope_paths',
    ...PROSE_SECTIONS,
    ...Object.keys(LIST_SECTIONS),
    'next_role',
    'claims',
  ],
  properties: {
    schema_version: { type: 'string', enum: [PLANDOC_SCHEMA_VERSION] },
    work_id: { type: 'string', min_length: 1, max_length: 200 },
    objective: { type: 'string', min_length: 1, max_length: ITEM_MAX },
    terminal_status: { type: 'string', enum: [...PLAN_TERMINAL_STATUSES] },
    controlling_inputs: {
      type: 'array',
      min_items: 1,
      max_items: 200,
      items: {
        type: 'object',
        additional_properties: false,
        required: ['path', 'sha256'],
        properties: {
          path: { type: 'string', min_length: 1, max_length: 1024 },
          sha256: { type: 'string', pattern: SHA256_PATTERN },
        },
      },
    },
    repository: { type: 'string', min_length: 1, max_length: 200 },
    base_sha: { type: 'string', pattern: FULL_SHA_PATTERN },
    scope_paths: {
      type: 'array',
      min_items: 1,
      max_items: 1000,
      items: { type: 'string', min_length: 1, max_length: 1024 },
    },
    ...Object.fromEntries(PROSE_SECTIONS.map((name) => [name, prose()])),
    ...Object.fromEntries(Object.entries(LIST_SECTIONS).map(([name, min]) => [name, items(min)])),
    next_role: { type: 'string', enum: ['founder_approval'] },
    claims: {
      type: 'object',
      additional_properties: false,
      required: ['plan_approved', 'builder_authorized'],
      properties: {
        plan_approved: { type: 'boolean', const: false },
        builder_authorized: { type: 'boolean', const: false },
      },
    },
  },
};

type ProseSection = (typeof PROSE_SECTIONS)[number];
type ListSection = keyof typeof LIST_SECTIONS;

/** The TypeScript shape of a document that passes `PLANDOC_SCHEMA_V1`. */
export type PlanDocV1 = {
  readonly schema_version: typeof PLANDOC_SCHEMA_VERSION;
  readonly work_id: string;
  readonly objective: string;
  readonly terminal_status: PlanTerminalStatus;
  readonly controlling_inputs: readonly { readonly path: string; readonly sha256: string }[];
  readonly repository: string;
  readonly base_sha: string;
  readonly scope_paths: readonly string[];
  readonly next_role: 'founder_approval';
  readonly claims: { readonly plan_approved: false; readonly builder_authorized: false };
} & { readonly [K in ProseSection]: string } & { readonly [K in ListSection]: readonly string[] };
