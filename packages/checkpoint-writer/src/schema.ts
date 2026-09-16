/**
 * Checkpoint IR `checkpoint/v1` — the fixed-field, versioned intermediate
 * representation an independent writer seat produces at each early
 * checkpoint (Founder Act "MiMo→MAD Long-Horizon Core v0", 2026-09-15,
 * Lane 2).
 *
 * Validation is hand-rolled (this repository carries no schema library and
 * the act authorizes no new dependency). The validator is STRICT: a wrong
 * `version`, a missing field, a wrong type, or ANY unknown key — at the top
 * level or inside any nested object — is a schema reject, never a silent
 * coercion. Fail-closed over soft summary.
 *
 * Evolved-from / invented: the field set is the act's list verbatim; every
 * shape, key order, and reject rule below is MAD-invented v0 (no MiMo or
 * OpenCode source was available or read).
 */

export const CHECKPOINT_IR_VERSION = 'checkpoint/v1' as const;

export const TASK_STATUSES = ['pending', 'in_progress', 'done', 'blocked'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface TaskNodeV1 {
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly children: readonly TaskNodeV1[];
}

export interface ErrorAndFixV1 {
  readonly error: string;
  readonly fix: string;
}

export interface DesignDecisionV1 {
  readonly decision: string;
  readonly rationale: string;
}

/**
 * An evidence pointer: a repository path, a content/commit SHA, or both.
 * `sha` is a 40-hex git SHA or a 64-hex sha256 content hash. At least one
 * of `path` / `sha` is required — a bare note is not evidence.
 */
export interface EvidenceRefV1 {
  readonly path?: string;
  readonly sha?: string;
  readonly note?: string;
}

/** The act's eleven fixed content fields. */
export interface CheckpointFieldsV1 {
  readonly current_intent: string;
  readonly next_action: string;
  readonly working_constraints: readonly string[];
  readonly task_tree: readonly TaskNodeV1[];
  readonly current_work: string;
  readonly involved_files: readonly string[];
  readonly cross_task_discoveries: readonly string[];
  readonly errors_and_fixes: readonly ErrorAndFixV1[];
  readonly runtime_state: Readonly<Record<string, string>>;
  readonly design_decisions: readonly DesignDecisionV1[];
  readonly misc_notes: readonly string[];
  readonly evidence_refs: readonly EvidenceRefV1[];
}

/**
 * Envelope + content. `trigger_pct` records which configured threshold
 * fired this checkpoint (percent of context budget, 0 < pct <= 100); `null`
 * means the checkpoint was not threshold-triggered (manual / forced).
 */
export interface CheckpointV1 extends CheckpointFieldsV1 {
  readonly version: typeof CHECKPOINT_IR_VERSION;
  readonly checkpoint_id: string;
  readonly session_id: string;
  readonly seq: number;
  readonly created_at_ms: number;
  readonly trigger_pct: number | null;
}

export class CheckpointSchemaError extends Error {
  override readonly name = 'CheckpointSchemaError';
}

function reject(path: string, why: string): never {
  throw new CheckpointSchemaError(`checkpoint/v1 reject at ${path}: ${why}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) reject(path, `expected object, got ${Array.isArray(value) ? 'array' : typeof value}`);
  return value;
}

function requireNoUnknownKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) reject(path, `unknown field ${JSON.stringify(key)}`);
  }
}

function requireString(value: unknown, path: string, opts?: { readonly nonEmpty?: boolean }): string {
  if (typeof value !== 'string') reject(path, `expected string, got ${typeof value}`);
  if (opts?.nonEmpty && value.length === 0) reject(path, 'expected non-empty string');
  return value;
}

function requireStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) reject(path, `expected array, got ${typeof value}`);
  return value.map((entry, i) => requireString(entry, `${path}[${i}]`));
}

function requireInt(value: unknown, path: string, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) reject(path, `expected integer, got ${typeof value === 'number' ? value : typeof value}`);
  if (value < min) reject(path, `expected >= ${min}, got ${value}`);
  return value;
}

const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;

function requireTaskNode(value: unknown, path: string): TaskNodeV1 {
  const obj = requireObject(value, path);
  requireNoUnknownKeys(obj, ['id', 'title', 'status', 'children'], path);
  const id = requireString(obj.id, `${path}.id`, { nonEmpty: true });
  const title = requireString(obj.title, `${path}.title`);
  const status = requireString(obj.status, `${path}.status`);
  if (!(TASK_STATUSES as readonly string[]).includes(status)) {
    reject(`${path}.status`, `expected one of ${TASK_STATUSES.join('|')}, got ${JSON.stringify(status)}`);
  }
  if (!Array.isArray(obj.children)) reject(`${path}.children`, `expected array, got ${typeof obj.children}`);
  const children = obj.children.map((child, i) => requireTaskNode(child, `${path}.children[${i}]`));
  return { id, title, status: status as TaskStatus, children };
}

function requireErrorAndFix(value: unknown, path: string): ErrorAndFixV1 {
  const obj = requireObject(value, path);
  requireNoUnknownKeys(obj, ['error', 'fix'], path);
  return {
    error: requireString(obj.error, `${path}.error`, { nonEmpty: true }),
    fix: requireString(obj.fix, `${path}.fix`, { nonEmpty: true }),
  };
}

function requireDesignDecision(value: unknown, path: string): DesignDecisionV1 {
  const obj = requireObject(value, path);
  requireNoUnknownKeys(obj, ['decision', 'rationale'], path);
  return {
    decision: requireString(obj.decision, `${path}.decision`, { nonEmpty: true }),
    rationale: requireString(obj.rationale, `${path}.rationale`),
  };
}

function requireEvidenceRef(value: unknown, path: string): EvidenceRefV1 {
  const obj = requireObject(value, path);
  requireNoUnknownKeys(obj, ['path', 'sha', 'note'], path);
  const refPath = obj.path === undefined ? undefined : requireString(obj.path, `${path}.path`, { nonEmpty: true });
  const sha = obj.sha === undefined ? undefined : requireString(obj.sha, `${path}.sha`);
  if (sha !== undefined && !SHA40.test(sha) && !SHA64.test(sha)) {
    reject(`${path}.sha`, 'expected 40-hex git SHA or 64-hex sha256');
  }
  const note = obj.note === undefined ? undefined : requireString(obj.note, `${path}.note`);
  if (refPath === undefined && sha === undefined) reject(path, 'evidence ref needs at least one of path/sha');
  return { path: refPath, sha, note };
}

const CONTENT_KEYS = [
  'current_intent',
  'next_action',
  'working_constraints',
  'task_tree',
  'current_work',
  'involved_files',
  'cross_task_discoveries',
  'errors_and_fixes',
  'runtime_state',
  'design_decisions',
  'misc_notes',
  'evidence_refs',
] as const;

const ENVELOPE_KEYS = ['version', 'checkpoint_id', 'session_id', 'seq', 'created_at_ms', 'trigger_pct'] as const;

const TOP_LEVEL_KEYS: readonly string[] = [...ENVELOPE_KEYS, ...CONTENT_KEYS];

/**
 * Validate an unknown value as a `checkpoint/v1` document. Returns the
 * value narrowed to `CheckpointV1`; any deviation throws
 * `CheckpointSchemaError`. The input is never mutated.
 */
export function validateCheckpointV1(value: unknown): CheckpointV1 {
  const obj = requireObject(value, '$');
  requireNoUnknownKeys(obj, TOP_LEVEL_KEYS, '$');

  if (obj.version !== CHECKPOINT_IR_VERSION) {
    reject('$.version', `expected ${JSON.stringify(CHECKPOINT_IR_VERSION)}, got ${JSON.stringify(obj.version)}`);
  }
  const checkpointId = requireString(obj.checkpoint_id, '$.checkpoint_id', { nonEmpty: true });
  const sessionId = requireString(obj.session_id, '$.session_id', { nonEmpty: true });
  const seq = requireInt(obj.seq, '$.seq', 1);
  const createdAtMs = requireInt(obj.created_at_ms, '$.created_at_ms', 0);
  const triggerPct = obj.trigger_pct;
  if (triggerPct !== null && (typeof triggerPct !== 'number' || !Number.isFinite(triggerPct) || triggerPct <= 0 || triggerPct > 100)) {
    reject('$.trigger_pct', `expected null or a number in (0, 100], got ${JSON.stringify(triggerPct)}`);
  }

  if (!Array.isArray(obj.task_tree)) reject('$.task_tree', `expected array, got ${typeof obj.task_tree}`);
  const taskTree = obj.task_tree.map((node, i) => requireTaskNode(node, `$.task_tree[${i}]`));

  if (!Array.isArray(obj.errors_and_fixes)) reject('$.errors_and_fixes', `expected array, got ${typeof obj.errors_and_fixes}`);
  const errorsAndFixes = obj.errors_and_fixes.map((entry, i) => requireErrorAndFix(entry, `$.errors_and_fixes[${i}]`));

  if (!Array.isArray(obj.design_decisions)) reject('$.design_decisions', `expected array, got ${typeof obj.design_decisions}`);
  const designDecisions = obj.design_decisions.map((entry, i) => requireDesignDecision(entry, `$.design_decisions[${i}]`));

  if (!Array.isArray(obj.evidence_refs)) reject('$.evidence_refs', `expected array, got ${typeof obj.evidence_refs}`);
  const evidenceRefs = obj.evidence_refs.map((entry, i) => requireEvidenceRef(entry, `$.evidence_refs[${i}]`));

  const runtimeState = requireObject(obj.runtime_state, '$.runtime_state');
  for (const [key, entry] of Object.entries(runtimeState)) {
    requireString(entry, `$.runtime_state.${key}`);
  }

  return {
    version: CHECKPOINT_IR_VERSION,
    checkpoint_id: checkpointId,
    session_id: sessionId,
    seq,
    created_at_ms: createdAtMs,
    trigger_pct: triggerPct,
    current_intent: requireString(obj.current_intent, '$.current_intent', { nonEmpty: true }),
    next_action: requireString(obj.next_action, '$.next_action', { nonEmpty: true }),
    working_constraints: requireStringArray(obj.working_constraints, '$.working_constraints'),
    task_tree: taskTree,
    current_work: requireString(obj.current_work, '$.current_work'),
    involved_files: requireStringArray(obj.involved_files, '$.involved_files'),
    cross_task_discoveries: requireStringArray(obj.cross_task_discoveries, '$.cross_task_discoveries'),
    errors_and_fixes: errorsAndFixes,
    runtime_state: runtimeState as Record<string, string>,
    design_decisions: designDecisions,
    misc_notes: requireStringArray(obj.misc_notes, '$.misc_notes'),
    evidence_refs: evidenceRefs,
  };
}

/**
 * Validate the writer seat's raw output: exactly the eleven content fields,
 * no envelope (the writer attaches the envelope itself, so a seat that
 * tries to set `seq` or `version` is rejected here on the unknown key).
 */
export function validateCheckpointFieldsV1(value: unknown): CheckpointFieldsV1 {
  const obj = requireObject(value, '$');
  requireNoUnknownKeys(obj, CONTENT_KEYS, '$');

  if (!Array.isArray(obj.task_tree)) reject('$.task_tree', `expected array, got ${typeof obj.task_tree}`);
  const taskTree = obj.task_tree.map((node, i) => requireTaskNode(node, `$.task_tree[${i}]`));

  if (!Array.isArray(obj.errors_and_fixes)) reject('$.errors_and_fixes', `expected array, got ${typeof obj.errors_and_fixes}`);
  const errorsAndFixes = obj.errors_and_fixes.map((entry, i) => requireErrorAndFix(entry, `$.errors_and_fixes[${i}]`));

  if (!Array.isArray(obj.design_decisions)) reject('$.design_decisions', `expected array, got ${typeof obj.design_decisions}`);
  const designDecisions = obj.design_decisions.map((entry, i) => requireDesignDecision(entry, `$.design_decisions[${i}]`));

  if (!Array.isArray(obj.evidence_refs)) reject('$.evidence_refs', `expected array, got ${typeof obj.evidence_refs}`);
  const evidenceRefs = obj.evidence_refs.map((entry, i) => requireEvidenceRef(entry, `$.evidence_refs[${i}]`));

  const runtimeState = requireObject(obj.runtime_state, '$.runtime_state');
  for (const [key, entry] of Object.entries(runtimeState)) {
    requireString(entry, `$.runtime_state.${key}`);
  }

  return {
    current_intent: requireString(obj.current_intent, '$.current_intent', { nonEmpty: true }),
    next_action: requireString(obj.next_action, '$.next_action', { nonEmpty: true }),
    working_constraints: requireStringArray(obj.working_constraints, '$.working_constraints'),
    task_tree: taskTree,
    current_work: requireString(obj.current_work, '$.current_work'),
    involved_files: requireStringArray(obj.involved_files, '$.involved_files'),
    cross_task_discoveries: requireStringArray(obj.cross_task_discoveries, '$.cross_task_discoveries'),
    errors_and_fixes: errorsAndFixes,
    runtime_state: runtimeState as Record<string, string>,
    design_decisions: designDecisions,
    misc_notes: requireStringArray(obj.misc_notes, '$.misc_notes'),
    evidence_refs: evidenceRefs,
  };
}

/** Canonical byte form: fixed key order, two-space indent, trailing LF. */
export function encodeCheckpointV1(checkpoint: CheckpointV1): string {
  // Round-trip through the validator so a hand-assembled object that only
  // type-checks can never produce bytes the parser would reject.
  const valid = validateCheckpointV1(checkpoint);
  const ordered: CheckpointV1 = {
    version: valid.version,
    checkpoint_id: valid.checkpoint_id,
    session_id: valid.session_id,
    seq: valid.seq,
    created_at_ms: valid.created_at_ms,
    trigger_pct: valid.trigger_pct,
    current_intent: valid.current_intent,
    next_action: valid.next_action,
    working_constraints: valid.working_constraints,
    task_tree: valid.task_tree,
    current_work: valid.current_work,
    involved_files: valid.involved_files,
    cross_task_discoveries: valid.cross_task_discoveries,
    errors_and_fixes: valid.errors_and_fixes,
    runtime_state: valid.runtime_state,
    design_decisions: valid.design_decisions,
    misc_notes: valid.misc_notes,
    evidence_refs: valid.evidence_refs,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Parse canonical bytes back into a validated checkpoint. */
export function parseCheckpointV1(json: string): CheckpointV1 {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (cause) {
    throw new CheckpointSchemaError(`checkpoint/v1 reject at $: invalid JSON (${(cause as Error).message})`);
  }
  return validateCheckpointV1(value);
}
