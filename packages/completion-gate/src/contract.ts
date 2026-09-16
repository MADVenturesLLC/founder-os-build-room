/**
 * Completion gate v0 — the SuccessContract IR (`success-contract/v1`).
 *
 * Founder Act "MiMo→MAD Long-Horizon Core v0" (2026-09-15), Lane 1. The
 * contract is the BOUND success definition a worker's completion claim is
 * judged against: which commands must have exited 0 (or been skipped under a
 * policy the contract itself names), which artifacts must exist (with
 * optional pinned SHA-256), which seat-output-schema the terminal handoff
 * must satisfy in strict mode, and which claims are forbidden (the
 * `merge_authorized` / `production` / `provider_execution` vocabulary the
 * builder seat's dogfood schema already pins to `false`). Optional
 * `argus_packet` / `single_verdict` fields bind the gate to an
 * independent-reviewer (Argus) packet when the act requires one.
 *
 * Hand-rolled validation, deliberately: this repository has no zod and no
 * dependency may be added (AE-01 T18 lockfile pin). The style mirrors
 * `packages/seat-output-schema`'s `checkSchema` — unknown fields, wrong
 * types, bad enum values, and a wrong `version` are all defects, and a
 * contract with defects is REFUSED, never partially applied.
 *
 * Fail-closed invariants beyond shape:
 *   - the field set is closed at every level (no extension keys);
 *   - `schema_mode` accepts only the literal `'strict'`;
 *   - the non-vacuous rule: a contract that binds no requirement clause at
 *     all is rejected, so a PASS can never be decorative;
 *   - `single_verdict` values are checked against the Seat Registry's own
 *     independent-reviewer terminal statuses (vocabulary alignment, not
 *     re-derivation — the registry is imported through its public entry and
 *     never modified).
 */

import { isTerminalStatusFor } from '../../seat-registry/src/index.js';
import { isHandoffSchemaId, type HandoffSchemaId } from './handoff-schemas.js';

export const SUCCESS_CONTRACT_VERSION = 'success-contract/v1' as const;

/** The only expectation v0 supports: the command exits 0. */
export const TEST_EXPECTATIONS = ['exit_0'] as const;
export type TestExpectation = (typeof TEST_EXPECTATIONS)[number];

/** The closed set of skip policies a contract may name for a required test. */
export const SKIP_POLICIES = ['not_applicable', 'environment_unavailable'] as const;
export type SkipPolicy = (typeof SKIP_POLICIES)[number];

/**
 * The claim keys a contract may forbid. Same vocabulary as the pinned-false
 * `claims` block of the builder seat's dogfood output schema
 * (`packages/seat-output-schema`, `BUILDER_VERIFICATION_OUTPUT_SCHEMA`).
 */
export const FORBIDDEN_CLAIM_KEYS = ['merge_authorized', 'production', 'provider_execution'] as const;
export type ForbiddenClaimKey = (typeof FORBIDDEN_CLAIM_KEYS)[number];

/** Bounds — a contract is data from an act author, kept small and reviewable. */
export const MAX_CONTRACT_LIST_ENTRIES = 64;
export const MAX_COMMAND_LENGTH = 512;
export const MAX_PATH_LENGTH = 512;

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Run form: the command must appear in the tool trace with exit 0. */
export interface RequiredTestRun {
  readonly command: string;
  readonly expect: TestExpectation;
}

/** Skip form: the command may be skipped only under the named policy. */
export interface RequiredTestSkip {
  readonly command: string;
  readonly skip_policy: SkipPolicy;
}

export type RequiredTest = RequiredTestRun | RequiredTestSkip;

export interface RequiredArtifact {
  readonly path: string;
  /** When present, the observed artifact's SHA-256 must equal this exactly. */
  readonly sha256?: string;
}

export interface RequiredHandoff {
  readonly seat_output_schema_id: HandoffSchemaId;
  /** Closed to `'strict'`: a completion gate never accepts a flagged handoff. */
  readonly schema_mode: 'strict';
}

/** Bind to an exact independent-reviewer packet by SHA-256. */
export interface ArgusPacketBind {
  readonly packet_sha256: string;
}

export interface SuccessContractV1 {
  readonly version: typeof SUCCESS_CONTRACT_VERSION;
  readonly required_tests: readonly RequiredTest[];
  readonly required_artifacts: readonly RequiredArtifact[];
  readonly required_handoff?: RequiredHandoff;
  readonly forbidden_claims: readonly ForbiddenClaimKey[];
  readonly argus_packet?: ArgusPacketBind;
  /** Bind to the packet's terminal status (an independent-reviewer one). */
  readonly single_verdict?: string;
}

export type SuccessContract = SuccessContractV1;

export interface ContractDefect {
  /** JSON-pointer-like path from the candidate root; `''` is the root. */
  readonly path: string;
  readonly message: string;
}

const TOP_LEVEL_KEYS = [
  'version',
  'required_tests',
  'required_artifacts',
  'required_handoff',
  'forbidden_claims',
  'argus_packet',
  'single_verdict',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= maxLength;
}

function unknownKeys(value: Record<string, unknown>, known: readonly string[], path: string, defects: ContractDefect[]): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) {
      defects.push({ path: `${path}/${key}`, message: `unknown field ${JSON.stringify(key)}` });
    }
  }
}

function checkRequiredTest(value: unknown, path: string, defects: ContractDefect[]): void {
  if (!isPlainObject(value)) {
    defects.push({ path, message: 'required test must be a plain object' });
    return;
  }
  unknownKeys(value, ['command', 'expect', 'skip_policy'], path, defects);
  if (!isNonEmptyString(value.command, MAX_COMMAND_LENGTH)) {
    defects.push({ path: `${path}/command`, message: `command must be a string of 1..${MAX_COMMAND_LENGTH} characters` });
  }
  const hasExpect = value.expect !== undefined;
  const hasSkip = value.skip_policy !== undefined;
  if (hasExpect && hasSkip) {
    defects.push({ path, message: 'expect and skip_policy are mutually exclusive' });
  } else if (!hasExpect && !hasSkip) {
    defects.push({ path, message: 'exactly one of expect or skip_policy is required' });
  } else if (hasExpect) {
    if (!(TEST_EXPECTATIONS as readonly string[]).includes(value.expect as string)) {
      defects.push({
        path: `${path}/expect`,
        message: `expect must be one of ${TEST_EXPECTATIONS.join(', ')}, got ${JSON.stringify(value.expect)}`,
      });
    }
  } else {
    if (typeof value.skip_policy !== 'string' || !(SKIP_POLICIES as readonly string[]).includes(value.skip_policy)) {
      defects.push({
        path: `${path}/skip_policy`,
        message: `skip_policy must be one of ${SKIP_POLICIES.join(', ')}, got ${JSON.stringify(value.skip_policy)}`,
      });
    }
  }
}

function checkRequiredArtifact(value: unknown, path: string, defects: ContractDefect[]): void {
  if (!isPlainObject(value)) {
    defects.push({ path, message: 'required artifact must be a plain object' });
    return;
  }
  unknownKeys(value, ['path', 'sha256'], path, defects);
  if (!isNonEmptyString(value.path, MAX_PATH_LENGTH)) {
    defects.push({ path: `${path}/path`, message: `path must be a string of 1..${MAX_PATH_LENGTH} characters` });
  }
  if (value.sha256 !== undefined && (typeof value.sha256 !== 'string' || !SHA256_HEX.test(value.sha256))) {
    defects.push({ path: `${path}/sha256`, message: 'sha256 must be a lowercase 64-hex string' });
  }
}

function checkRequiredHandoff(value: unknown, path: string, defects: ContractDefect[]): void {
  if (!isPlainObject(value)) {
    defects.push({ path, message: 'required_handoff must be a plain object' });
    return;
  }
  unknownKeys(value, ['seat_output_schema_id', 'schema_mode'], path, defects);
  if (!isHandoffSchemaId(value.seat_output_schema_id)) {
    defects.push({
      path: `${path}/seat_output_schema_id`,
      message: `unknown seat-output-schema id ${JSON.stringify(value.seat_output_schema_id)}`,
    });
  }
  if (value.schema_mode !== 'strict') {
    defects.push({
      path: `${path}/schema_mode`,
      message: `schema_mode must be exactly 'strict', got ${JSON.stringify(value.schema_mode)}`,
    });
  }
}

function checkArgusPacketBind(value: unknown, path: string, defects: ContractDefect[]): void {
  if (!isPlainObject(value)) {
    defects.push({ path, message: 'argus_packet must be a plain object' });
    return;
  }
  unknownKeys(value, ['packet_sha256'], path, defects);
  if (typeof value.packet_sha256 !== 'string' || !SHA256_HEX.test(value.packet_sha256)) {
    defects.push({ path: `${path}/packet_sha256`, message: 'packet_sha256 must be a lowercase 64-hex string' });
  }
}

/**
 * Well-formedness of a success-contract candidate. Returns every defect
 * found; an empty array means the value is a valid `success-contract/v1`.
 * Runs before any evidence is judged — a defective contract yields no
 * verdict, the same fail-closed discipline as `checkSchema`.
 */
export function checkSuccessContract(candidate: unknown): ContractDefect[] {
  const defects: ContractDefect[] = [];
  if (!isPlainObject(candidate)) {
    return [{ path: '', message: 'contract must be a plain object' }];
  }
  unknownKeys(candidate, TOP_LEVEL_KEYS, '', defects);

  if (candidate.version !== SUCCESS_CONTRACT_VERSION) {
    defects.push({ path: '/version', message: `version must be ${JSON.stringify(SUCCESS_CONTRACT_VERSION)}, got ${JSON.stringify(candidate.version)}` });
  }

  if (!Array.isArray(candidate.required_tests)) {
    defects.push({ path: '/required_tests', message: 'required_tests must be an array' });
  } else {
    if (candidate.required_tests.length > MAX_CONTRACT_LIST_ENTRIES) {
      defects.push({ path: '/required_tests', message: `required_tests exceeds ${MAX_CONTRACT_LIST_ENTRIES} entries` });
    }
    candidate.required_tests.forEach((entry, i) => checkRequiredTest(entry, `/required_tests/${i}`, defects));
  }

  if (!Array.isArray(candidate.required_artifacts)) {
    defects.push({ path: '/required_artifacts', message: 'required_artifacts must be an array' });
  } else {
    if (candidate.required_artifacts.length > MAX_CONTRACT_LIST_ENTRIES) {
      defects.push({ path: '/required_artifacts', message: `required_artifacts exceeds ${MAX_CONTRACT_LIST_ENTRIES} entries` });
    }
    candidate.required_artifacts.forEach((entry, i) => checkRequiredArtifact(entry, `/required_artifacts/${i}`, defects));
    const seen = new Set<string>();
    for (const entry of candidate.required_artifacts) {
      if (isPlainObject(entry) && typeof entry.path === 'string') {
        if (seen.has(entry.path)) {
          defects.push({ path: '/required_artifacts', message: `duplicate artifact path ${JSON.stringify(entry.path)}` });
        }
        seen.add(entry.path);
      }
    }
  }

  if (candidate.required_handoff !== undefined) {
    checkRequiredHandoff(candidate.required_handoff, '/required_handoff', defects);
  }

  if (!Array.isArray(candidate.forbidden_claims)) {
    defects.push({ path: '/forbidden_claims', message: 'forbidden_claims must be an array (empty means the act allows otherwise)' });
  } else {
    const seen = new Set<string>();
    candidate.forbidden_claims.forEach((entry, i) => {
      if (typeof entry !== 'string' || !(FORBIDDEN_CLAIM_KEYS as readonly string[]).includes(entry)) {
        defects.push({
          path: `/forbidden_claims/${i}`,
          message: `forbidden claim must be one of ${FORBIDDEN_CLAIM_KEYS.join(', ')}, got ${JSON.stringify(entry)}`,
        });
      } else if (seen.has(entry)) {
        defects.push({ path: `/forbidden_claims/${i}`, message: `duplicate forbidden claim ${JSON.stringify(entry)}` });
      } else {
        seen.add(entry);
      }
    });
  }

  if (candidate.argus_packet !== undefined) {
    checkArgusPacketBind(candidate.argus_packet, '/argus_packet', defects);
  }

  if (candidate.single_verdict !== undefined) {
    if (typeof candidate.single_verdict !== 'string' || !isTerminalStatusFor('independent-reviewer', candidate.single_verdict)) {
      defects.push({
        path: '/single_verdict',
        message: `single_verdict must be a terminal status of the independent-reviewer seat, got ${JSON.stringify(candidate.single_verdict)}`,
      });
    }
  }

  // Non-vacuous rule: a contract that binds no requirement clause would let
  // any evidence PASS. That is decorative green; refuse it at the schema.
  const bindsTests = Array.isArray(candidate.required_tests) && candidate.required_tests.length > 0;
  const bindsArtifacts = Array.isArray(candidate.required_artifacts) && candidate.required_artifacts.length > 0;
  const bindsHandoff = candidate.required_handoff !== undefined;
  const bindsClaims = Array.isArray(candidate.forbidden_claims) && candidate.forbidden_claims.length > 0;
  if (!bindsTests && !bindsArtifacts && !bindsHandoff && !bindsClaims) {
    defects.push({ path: '', message: 'contract binds no requirement clause; a vacuous contract is rejected' });
  }

  return defects;
}

export function isSuccessContract(candidate: unknown): candidate is SuccessContractV1 {
  return checkSuccessContract(candidate).length === 0;
}
