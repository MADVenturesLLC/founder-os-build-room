/**
 * Dogfood seat path — the `builder` seat's terminal handoff at
 * `BUILD_READY_FOR_INDEPENDENT_VERIFICATION`, returned as a machine-checkable
 * structured handoff instead of prose.
 *
 * The output schema mirrors the machine-checkable core of the Build Report
 * that `contracts/seats/builder.md` ("Report contract") already requires:
 * work ID, approved plan path + SHA-256, repository, branch, base SHA, final
 * HEAD SHA, changed-file manifest, commands executed with exact results,
 * acceptance-criteria matrix, unresolved issues, next role. Prose sections of
 * the report (implementation summary, diff review narrative) stay prose and
 * are not part of the schema.
 *
 * One addition that is mechanism, not doctrine: a `claims` block whose three
 * members are pinned to `false` by the schema. The builder contract prohibits
 * "claim completion solely because code was written" and the seat may never
 * merge, deploy, or execute a provider; a handoff that asserts any of those is
 * schema-invalid by construction, so it can never come back `accepted`.
 */

import type { SeatHandoff } from '../../seat-registry/src/index.js';
import type { ObjectSchema } from './schema.js';
import type { StructuredHandoff } from './structured-handoff.js';

export const FULL_SHA_PATTERN = '^[0-9a-f]{40}$';
export const SHA256_PATTERN = '^[0-9a-f]{64}$';

export const BUILDER_VERIFICATION_OUTPUT_SCHEMA: ObjectSchema = {
  type: 'object',
  additional_properties: false,
  required: [
    'work_id',
    'plan',
    'repository',
    'branch',
    'base_sha',
    'head_sha',
    'changed_paths',
    'commands',
    'acceptance',
    'unresolved_issues',
    'next_role',
    'claims',
  ],
  properties: {
    work_id: { type: 'string', min_length: 1, max_length: 200 },
    plan: {
      type: 'object',
      additional_properties: false,
      required: ['path', 'sha256'],
      properties: {
        path: { type: 'string', min_length: 1 },
        sha256: { type: 'string', pattern: SHA256_PATTERN },
      },
    },
    repository: { type: 'string', min_length: 1 },
    branch: { type: 'string', min_length: 1, max_length: 200 },
    base_sha: { type: 'string', pattern: FULL_SHA_PATTERN },
    head_sha: { type: 'string', pattern: FULL_SHA_PATTERN },
    changed_paths: { type: 'array', min_items: 1, items: { type: 'string', min_length: 1 } },
    commands: {
      type: 'array',
      min_items: 1,
      items: {
        type: 'object',
        additional_properties: false,
        required: ['command', 'exit_code', 'result'],
        properties: {
          command: { type: 'string', min_length: 1 },
          exit_code: { type: 'integer', minimum: 0, maximum: 255 },
          result: { type: 'string', min_length: 1 },
        },
      },
    },
    acceptance: {
      type: 'array',
      min_items: 1,
      items: {
        type: 'object',
        additional_properties: false,
        required: ['criterion', 'status', 'evidence'],
        properties: {
          criterion: { type: 'string', min_length: 1 },
          status: { type: 'string', enum: ['met', 'unmet', 'not_verified'] },
          evidence: { type: 'string', min_length: 1 },
        },
      },
    },
    unresolved_issues: { type: 'array', items: { type: 'string', min_length: 1 } },
    next_role: { type: 'string', enum: ['independent-reviewer'] },
    claims: {
      type: 'object',
      additional_properties: false,
      required: ['merge_authorized', 'production', 'provider_execution'],
      properties: {
        merge_authorized: { type: 'boolean', const: false },
        production: { type: 'boolean', const: false },
        provider_execution: { type: 'boolean', const: false },
      },
    },
  },
};

export interface BuilderVerificationReport {
  readonly work_id: string;
  readonly plan: { readonly path: string; readonly sha256: string };
  readonly repository: string;
  readonly branch: string;
  readonly base_sha: string;
  readonly head_sha: string;
  readonly changed_paths: readonly string[];
  readonly commands: readonly { readonly command: string; readonly exit_code: number; readonly result: string }[];
  readonly acceptance: readonly {
    readonly criterion: string;
    readonly status: 'met' | 'unmet' | 'not_verified';
    readonly evidence: string;
  }[];
  readonly unresolved_issues: readonly string[];
  readonly next_role: 'independent-reviewer';
  readonly claims: {
    readonly merge_authorized: false;
    readonly production: false;
    readonly provider_execution: false;
  };
}

export interface BuilderVerificationHandoffInput {
  readonly report: BuilderVerificationReport;
  /** References only — never adjudicated (Seat Registry V1 handoff rule). */
  readonly authorization_refs: readonly string[];
}

/**
 * The dogfood path: the builder seat's terminal handoff as a structured
 * handoff in `strict` mode. The V1 record mirrors the ratified builder
 * registration (`receives_from: 'architect'`, `produces: 'Build Report'`,
 * terminal `BUILD_READY_FOR_INDEPENDENT_VERIFICATION`); `committed_sha` is the
 * report's head SHA, so the record and the output cannot disagree about it.
 */
export function builderVerificationHandoff(input: BuilderVerificationHandoffInput): StructuredHandoff {
  const handoff: SeatHandoff = {
    receives_from: 'architect',
    produces: 'Build Report',
    terminal_status: 'BUILD_READY_FOR_INDEPENDENT_VERIFICATION',
    committed_sha: input.report.head_sha,
    authorization_refs: input.authorization_refs,
  };
  return {
    seat_id: 'builder',
    handoff,
    output_schema: BUILDER_VERIFICATION_OUTPUT_SCHEMA,
    schema_mode: 'strict',
    output: input.report,
  };
}
