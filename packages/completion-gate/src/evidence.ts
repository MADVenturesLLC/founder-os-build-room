/**
 * Completion gate v0 — the evidence bundle (`evidence-bundle/v1`).
 *
 * Founder Act "MiMo→MAD Long-Horizon Core v0" (2026-09-15), Lane 1. The
 * bundle is the schema-bound conversation/tool-trace summary the verifier
 * judges against a success contract. Its discipline:
 *
 *   - `observations` are harness-produced records of what actually ran and
 *     what was actually produced (commands with exit codes, artifacts with
 *     SHA-256, recorded skip decisions). The verifier's PASS rests only on
 *     these. Provenance — that the observations genuinely come from the tool
 *     trace and not from the worker — is the harness's responsibility; this
 *     package is pure and performs no I/O to establish it.
 *   - `worker.claims` is the worker's own narrative (`done`, plus the
 *     forbidden-claim booleans). It is DATA TO BE CHECKED, never proof:
 *     `done: true` contributes nothing toward PASS and everything toward a
 *     `worker_claim_contradicted` gap when the observations disagree, and a
 *     `true` forbidden claim makes the completion impossible as submitted.
 *
 * Validation is hand-rolled and closed-field, same as the contract: unknown
 * fields, wrong types, bad enum values, wrong version are all defects, and a
 * defective bundle is refused rather than partially judged.
 */

import { isSeatId, type SeatHandoff, type SeatId } from '../../seat-registry/src/index.js';
import { SKIP_POLICIES, MAX_COMMAND_LENGTH, MAX_PATH_LENGTH, type ContractDefect } from './contract.js';

export const EVIDENCE_BUNDLE_VERSION = 'evidence-bundle/v1' as const;

/** Bound on each observation list — the trace summary is kept reviewable. */
export const MAX_BUNDLE_LIST_ENTRIES = 256;
const MAX_SKIP_REASON_LENGTH = 512;

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** The worker's self-claims. Checked, never accepted. */
export interface WorkerClaims {
  readonly done: boolean;
  readonly merge_authorized: boolean;
  readonly production: boolean;
  readonly provider_execution: boolean;
}

export interface WorkerSummary {
  readonly seat_id: SeatId;
  readonly claims: WorkerClaims;
}

/** A command the harness observed executing, in trace order. */
export interface CommandObservation {
  readonly command: string;
  readonly exit_code: number;
}

/** An artifact the harness observed, always content-hashed. */
export interface ArtifactObservation {
  readonly path: string;
  readonly sha256: string;
}

/** A recorded decision not to run a contracted command, with its policy. */
export interface SkipRecord {
  readonly command: string;
  readonly policy: (typeof SKIP_POLICIES)[number];
  readonly reason: string;
}

export interface Observations {
  readonly commands: readonly CommandObservation[];
  readonly artifacts: readonly ArtifactObservation[];
  readonly skips: readonly SkipRecord[];
}

/**
 * The worker's terminal handoff, without schema or mode: the CONTRACT names
 * both (schema by id, mode always strict), so the claimant cannot pick the
 * yardstick it is measured against.
 */
export interface HandoffEvidence {
  readonly seat_id: SeatId;
  readonly handoff: SeatHandoff;
  readonly output: unknown;
}

/** An observed independent-reviewer (Argus) packet reference. */
export interface ArgusPacketObservation {
  readonly packet_sha256: string;
  readonly terminal_status: string;
}

export interface EvidenceBundleV1 {
  readonly version: typeof EVIDENCE_BUNDLE_VERSION;
  readonly worker: WorkerSummary;
  readonly observations: Observations;
  readonly handoff?: HandoffEvidence;
  readonly argus_packet?: ArgusPacketObservation;
}

export type EvidenceBundle = EvidenceBundleV1;

const TOP_LEVEL_KEYS = ['version', 'worker', 'observations', 'handoff', 'argus_packet'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, known: readonly string[], path: string, defects: ContractDefect[]): void {
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) {
      defects.push({ path: `${path}/${key}`, message: `unknown field ${JSON.stringify(key)}` });
    }
  }
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= maxLength;
}

function checkWorker(value: unknown, path: string, defects: ContractDefect[]): void {
  if (!isPlainObject(value)) {
    defects.push({ path, message: 'worker must be a plain object' });
    return;
  }
  unknownKeys(value, ['seat_id', 'claims'], path, defects);
  if (!isSeatId(value.seat_id)) {
    defects.push({ path: `${path}/seat_id`, message: `seat_id must be a canonical seat id, got ${JSON.stringify(value.seat_id)}` });
  }
  if (!isPlainObject(value.claims)) {
    defects.push({ path: `${path}/claims`, message: 'claims must be a plain object' });
    return;
  }
  const claims = value.claims;
  unknownKeys(claims, ['done', 'merge_authorized', 'production', 'provider_execution'], `${path}/claims`, defects);
  for (const key of ['done', 'merge_authorized', 'production', 'provider_execution'] as const) {
    if (typeof claims[key] !== 'boolean') {
      defects.push({ path: `${path}/claims/${key}`, message: `claims.${key} must be a boolean` });
    }
  }
}

function checkCommands(value: unknown, path: string, defects: ContractDefect[]): void {
  if (!Array.isArray(value)) {
    defects.push({ path, message: 'commands must be an array' });
    return;
  }
  if (value.length > MAX_BUNDLE_LIST_ENTRIES) {
    defects.push({ path, message: `commands exceeds ${MAX_BUNDLE_LIST_ENTRIES} entries` });
  }
  value.forEach((entry, i) => {
    const p = `${path}/${i}`;
    if (!isPlainObject(entry)) {
      defects.push({ path: p, message: 'command observation must be a plain object' });
      return;
    }
    unknownKeys(entry, ['command', 'exit_code'], p, defects);
    if (!isNonEmptyString(entry.command, MAX_COMMAND_LENGTH)) {
      defects.push({ path: `${p}/command`, message: `command must be a string of 1..${MAX_COMMAND_LENGTH} characters` });
    }
    if (typeof entry.exit_code !== 'number' || !Number.isInteger(entry.exit_code) || entry.exit_code < 0 || entry.exit_code > 255) {
      defects.push({ path: `${p}/exit_code`, message: 'exit_code must be an integer in 0..255' });
    }
  });
}

function checkArtifacts(value: unknown, path: string, defects: ContractDefect[]): void {
  if (!Array.isArray(value)) {
    defects.push({ path, message: 'artifacts must be an array' });
    return;
  }
  if (value.length > MAX_BUNDLE_LIST_ENTRIES) {
    defects.push({ path, message: `artifacts exceeds ${MAX_BUNDLE_LIST_ENTRIES} entries` });
  }
  value.forEach((entry, i) => {
    const p = `${path}/${i}`;
    if (!isPlainObject(entry)) {
      defects.push({ path: p, message: 'artifact observation must be a plain object' });
      return;
    }
    unknownKeys(entry, ['path', 'sha256'], p, defects);
    if (!isNonEmptyString(entry.path, MAX_PATH_LENGTH)) {
      defects.push({ path: `${p}/path`, message: `path must be a string of 1..${MAX_PATH_LENGTH} characters` });
    }
    // An observed artifact always carries its hash — that is what makes it
    // evidence rather than a claim of existence.
    if (typeof entry.sha256 !== 'string' || !SHA256_HEX.test(entry.sha256)) {
      defects.push({ path: `${p}/sha256`, message: 'sha256 must be a lowercase 64-hex string' });
    }
  });
}

function checkSkips(value: unknown, path: string, defects: ContractDefect[]): void {
  if (!Array.isArray(value)) {
    defects.push({ path, message: 'skips must be an array' });
    return;
  }
  if (value.length > MAX_BUNDLE_LIST_ENTRIES) {
    defects.push({ path, message: `skips exceeds ${MAX_BUNDLE_LIST_ENTRIES} entries` });
  }
  value.forEach((entry, i) => {
    const p = `${path}/${i}`;
    if (!isPlainObject(entry)) {
      defects.push({ path: p, message: 'skip record must be a plain object' });
      return;
    }
    unknownKeys(entry, ['command', 'policy', 'reason'], p, defects);
    if (!isNonEmptyString(entry.command, MAX_COMMAND_LENGTH)) {
      defects.push({ path: `${p}/command`, message: `command must be a string of 1..${MAX_COMMAND_LENGTH} characters` });
    }
    if (typeof entry.policy !== 'string' || !(SKIP_POLICIES as readonly string[]).includes(entry.policy)) {
      defects.push({ path: `${p}/policy`, message: `policy must be one of ${SKIP_POLICIES.join(', ')}, got ${JSON.stringify(entry.policy)}` });
    }
    if (!isNonEmptyString(entry.reason, MAX_SKIP_REASON_LENGTH)) {
      defects.push({ path: `${p}/reason`, message: `reason must be a string of 1..${MAX_SKIP_REASON_LENGTH} characters` });
    }
  });
}

function checkHandoffEvidence(value: unknown, path: string, defects: ContractDefect[]): void {
  if (!isPlainObject(value)) {
    defects.push({ path, message: 'handoff must be a plain object' });
    return;
  }
  unknownKeys(value, ['seat_id', 'handoff', 'output'], path, defects);
  if (!isSeatId(value.seat_id)) {
    defects.push({ path: `${path}/seat_id`, message: `seat_id must be a canonical seat id, got ${JSON.stringify(value.seat_id)}` });
  }
  // `handoff` must be an object; its per-seat field rules belong to the Seat
  // Registry's own `validateHandoff`, applied at verdict time — re-checking
  // them here would re-derive what the registry owns.
  if (!isPlainObject(value.handoff)) {
    defects.push({ path: `${path}/handoff`, message: 'handoff must be a plain object' });
  }
  if (value.output === undefined) {
    defects.push({ path: `${path}/output`, message: 'output is required (the machine-checkable payload, not prose)' });
  }
}

function checkArgusPacketObservation(value: unknown, path: string, defects: ContractDefect[]): void {
  if (!isPlainObject(value)) {
    defects.push({ path, message: 'argus_packet must be a plain object' });
    return;
  }
  unknownKeys(value, ['packet_sha256', 'terminal_status'], path, defects);
  if (typeof value.packet_sha256 !== 'string' || !SHA256_HEX.test(value.packet_sha256)) {
    defects.push({ path: `${path}/packet_sha256`, message: 'packet_sha256 must be a lowercase 64-hex string' });
  }
  if (!isNonEmptyString(value.terminal_status, 64)) {
    defects.push({ path: `${path}/terminal_status`, message: 'terminal_status must be a non-empty string' });
  }
}

/**
 * Well-formedness of an evidence-bundle candidate. Returns every defect
 * found; an empty array means the value is a valid `evidence-bundle/v1`.
 * A defective bundle is refused (schema reject), never partially judged.
 */
export function checkEvidenceBundle(candidate: unknown): ContractDefect[] {
  const defects: ContractDefect[] = [];
  if (!isPlainObject(candidate)) {
    return [{ path: '', message: 'evidence bundle must be a plain object' }];
  }
  unknownKeys(candidate, TOP_LEVEL_KEYS, '', defects);

  if (candidate.version !== EVIDENCE_BUNDLE_VERSION) {
    defects.push({ path: '/version', message: `version must be ${JSON.stringify(EVIDENCE_BUNDLE_VERSION)}, got ${JSON.stringify(candidate.version)}` });
  }

  checkWorker(candidate.worker, '/worker', defects);

  if (!isPlainObject(candidate.observations)) {
    defects.push({ path: '/observations', message: 'observations must be a plain object' });
  } else {
    const observations = candidate.observations;
    unknownKeys(observations, ['commands', 'artifacts', 'skips'], '/observations', defects);
    checkCommands(observations.commands, '/observations/commands', defects);
    checkArtifacts(observations.artifacts, '/observations/artifacts', defects);
    checkSkips(observations.skips, '/observations/skips', defects);
  }

  if (candidate.handoff !== undefined) {
    checkHandoffEvidence(candidate.handoff, '/handoff', defects);
  }
  if (candidate.argus_packet !== undefined) {
    checkArgusPacketObservation(candidate.argus_packet, '/argus_packet', defects);
  }

  return defects;
}

export function isEvidenceBundle(candidate: unknown): candidate is EvidenceBundleV1 {
  return checkEvidenceBundle(candidate).length === 0;
}
