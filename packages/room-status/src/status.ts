/**
 * Room Status IR — the versioned status record, its invariants, and its
 * parser (Superlogical→MAD Session Operability v0, Lane 1).
 *
 * Invariants (enforced by `parseRoomStatus`, enforced again at the publisher
 * boundary so no caller can bypass them):
 *
 *  1. Closed enums only — every enum-shaped field must be a member of the
 *     `vocabulary.ts` closed sets. Unknown values are a parse error, never a
 *     coercion (fail closed).
 *  2. `blockReason` (room or slot) is only truthful alongside phase
 *     `blocked`. A reason attached to any other phase is a parse error.
 *  3. Strict mode: phase `completed` (room-level or any slot) requires at
 *     least one evidence ref. There is no completion gate on main, so a
 *     `completed` status without named evidence is decorative green and is
 *     rejected loudly — no silent downgrade.
 *  4. `observedSeq` is caller-supplied and monotonic by convention; this
 *     module stays clock-free.
 *
 * Purity: zero I/O, zero dependencies, no clock, no randomness. Parsed
 * outputs are deeply frozen.
 */

import {
  AGENT_PHASES,
  EVIDENCE_REF_KINDS,
  ROOM_BLOCK_REASONS,
  ROOM_OCCUPANCY,
  ROOM_STATUS_IR_VERSION,
  ROOM_STATUS_IR_VERSIONS,
  isAgentPhase,
  isEvidenceRefKind,
  isRoomBlockReason,
  isRoomOccupancy,
  isRoomStatusIrVersion,
  type AgentPhase,
  type EvidenceRefKind,
  type RoomBlockReason,
  type RoomOccupancy,
} from './vocabulary.js';

/** A named pointer to evidence: a repo path, a SHA, a handoff id, a receipt id. */
export interface EvidenceRef {
  readonly kind: EvidenceRefKind;
  readonly ref: string;
}

/** One agent slot's phase (e.g. an execution stream inside the room). */
export interface AgentSlotPhase {
  readonly slotId: string;
  readonly phase: AgentPhase;
  readonly blockReason?: RoomBlockReason;
}

/**
 * The RoomStatus IR record, v1. Room-level `agentPhase` is the operator-facing
 * aggregate (`aggregateAgentPhase`); `slotPhases` carries per-slot truth when
 * the publisher has it.
 */
export interface RoomStatus {
  readonly irVersion: typeof ROOM_STATUS_IR_VERSION;
  readonly roomId: string;
  readonly occupancy: RoomOccupancy;
  readonly agentPhase: AgentPhase;
  readonly blockReason?: RoomBlockReason;
  readonly slotPhases?: readonly AgentSlotPhase[];
  readonly evidenceRefs: readonly EvidenceRef[];
  /** Caller-supplied monotonic sequence; never a wall clock. */
  readonly observedSeq: number;
}

/** A parse/validation failure. `reason` names the violated invariant. */
export class RoomStatusParseError extends Error {
  constructor(
    public readonly reason: string,
    detail: string,
  ) {
    super(`room-status IR rejected (${reason}): ${detail}`);
    this.name = 'RoomStatusParseError';
  }
}

function parseEvidenceRefs(value: unknown): EvidenceRef[] {
  if (!Array.isArray(value)) {
    throw new RoomStatusParseError('evidence_refs_type', 'evidenceRefs must be an array');
  }
  const refs: EvidenceRef[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new RoomStatusParseError('evidence_ref_shape', 'each evidenceRef must be an object');
    }
    const record = entry as Record<string, unknown>;
    if (!isEvidenceRefKind(record['kind'])) {
      throw new RoomStatusParseError('evidence_ref_kind', `unknown evidence kind: ${JSON.stringify(record['kind'])}`);
    }
    if (typeof record['ref'] !== 'string' || record['ref'].length === 0) {
      throw new RoomStatusParseError('evidence_ref_value', 'evidenceRef.ref must be a non-empty string');
    }
    refs.push({ kind: record['kind'], ref: record['ref'] });
  }
  return refs;
}

function parseSlotPhases(value: unknown): AgentSlotPhase[] {
  if (!Array.isArray(value)) {
    throw new RoomStatusParseError('slot_phases_type', 'slotPhases must be an array');
  }
  const slots: AgentSlotPhase[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new RoomStatusParseError('slot_phase_shape', 'each slotPhase must be an object');
    }
    const record = entry as Record<string, unknown>;
    if (typeof record['slotId'] !== 'string' || record['slotId'].length === 0) {
      throw new RoomStatusParseError('slot_phase_id', 'slotPhase.slotId must be a non-empty string');
    }
    if (!isAgentPhase(record['phase'])) {
      throw new RoomStatusParseError('slot_phase_enum', `unknown agent phase: ${JSON.stringify(record['phase'])}`);
    }
    if (record['blockReason'] !== undefined) {
      if (!isRoomBlockReason(record['blockReason'])) {
        throw new RoomStatusParseError(
          'slot_block_reason_enum',
          `unknown block reason: ${JSON.stringify(record['blockReason'])}`,
        );
      }
      if (record['phase'] !== 'blocked') {
        throw new RoomStatusParseError(
          'block_reason_requires_blocked',
          `slot blockReason is only truthful with phase "blocked", got "${String(record['phase'])}"`,
        );
      }
    }
    slots.push(
      record['blockReason'] === undefined
        ? { slotId: record['slotId'], phase: record['phase'] }
        : { slotId: record['slotId'], phase: record['phase'], blockReason: record['blockReason'] },
    );
  }
  return slots;
}

/** Narrow an untrusted block-reason value or throw the closed-enum error. */
function narrowBlockReason(value: unknown): RoomBlockReason | undefined {
  if (value === undefined) return undefined;
  if (!isRoomBlockReason(value)) {
    throw new RoomStatusParseError('block_reason_enum', `unknown block reason: ${JSON.stringify(value)}`);
  }
  return value;
}

/** The invariant checks shared by direct parse and the publisher boundary. */
function assertInvariants(status: {
  agentPhase: AgentPhase;
  blockReason?: RoomBlockReason;
  slotPhases?: readonly AgentSlotPhase[];
  evidenceRefs: readonly EvidenceRef[];
  occupancy: RoomOccupancy;
}, strict: boolean): void {
  if (status.blockReason !== undefined && status.agentPhase !== 'blocked') {
    throw new RoomStatusParseError(
      'block_reason_requires_blocked',
      `room blockReason is only truthful with phase "blocked", got "${status.agentPhase}"`,
    );
  }
  if (status.occupancy === 'closed' && (status.agentPhase === 'running' || status.agentPhase === 'verifying')) {
    throw new RoomStatusParseError(
      'closed_not_active',
      `a closed room cannot claim an active phase, got "${status.agentPhase}"`,
    );
  }
  if (strict) {
    const completedSlots = (status.slotPhases ?? []).filter((slot) => slot.phase === 'completed').length;
    const needsEvidence = status.agentPhase === 'completed' || completedSlots > 0;
    if (needsEvidence && status.evidenceRefs.length === 0) {
      throw new RoomStatusParseError(
        'completed_requires_evidence',
        'strict mode: phase "completed" requires at least one evidence ref (never prose)',
      );
    }
  }
}

/**
 * Validate an untrusted value into a frozen `RoomStatus`. Unknown enum
 * values, invariant violations, and wrong IR versions throw
 * `RoomStatusParseError` — fail closed, no coercion, no defaults.
 *
 * `strict` additionally requires evidence refs for any `completed` phase
 * (invariant 3). Strictness is a parse-time property carried by the caller
 * (the publisher binds it once); this function never guesses it.
 */
export function parseRoomStatus(value: unknown, options?: { readonly strict?: boolean }): RoomStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RoomStatusParseError('shape', 'RoomStatus must be a JSON object');
  }
  const record = value as Record<string, unknown>;
  if (!isRoomStatusIrVersion(record['irVersion'])) {
    throw new RoomStatusParseError('ir_version', `unknown IR version: ${JSON.stringify(record['irVersion'])}`);
  }
  if (record['irVersion'] !== ROOM_STATUS_IR_VERSION) {
    throw new RoomStatusParseError('ir_version', `unsupported IR version: ${String(record['irVersion'])}`);
  }
  if (typeof record['roomId'] !== 'string' || record['roomId'].length === 0) {
    throw new RoomStatusParseError('room_id', 'roomId must be a non-empty string');
  }
  if (!isRoomOccupancy(record['occupancy'])) {
    throw new RoomStatusParseError('occupancy_enum', `unknown occupancy: ${JSON.stringify(record['occupancy'])}`);
  }
  if (!isAgentPhase(record['agentPhase'])) {
    throw new RoomStatusParseError('agent_phase_enum', `unknown agent phase: ${JSON.stringify(record['agentPhase'])}`);
  }
  if (typeof record['observedSeq'] !== 'number' || !Number.isInteger(record['observedSeq']) || record['observedSeq'] < 0) {
    throw new RoomStatusParseError('observed_seq', 'observedSeq must be a non-negative integer');
  }
  const evidenceRefs = parseEvidenceRefs(record['evidenceRefs'] ?? []);
  const slotPhases = record['slotPhases'] === undefined ? undefined : parseSlotPhases(record['slotPhases']);
  const blockReason = narrowBlockReason(record['blockReason']);
  const candidate = {
    occupancy: record['occupancy'],
    agentPhase: record['agentPhase'],
    blockReason,
    slotPhases,
    evidenceRefs,
  };
  assertInvariants(candidate, options?.strict === true);
  const status: RoomStatus = deepFreeze({
    irVersion: ROOM_STATUS_IR_VERSION,
    roomId: record['roomId'],
    occupancy: candidate.occupancy,
    agentPhase: candidate.agentPhase,
    ...(blockReason === undefined ? {} : { blockReason }),
    ...(slotPhases === undefined ? {} : { slotPhases: Object.freeze(slotPhases.map((slot) => Object.freeze(slot))) }),
    evidenceRefs: Object.freeze(evidenceRefs.map((ref) => Object.freeze(ref))),
    observedSeq: record['observedSeq'],
  });
  return status;
}

/**
 * Aggregate slot phases into the room-level operator phase. Precedence is
 * explicit and honest: failure first, then anything needing operator action
 * (blocked, waiting_approval), then visible progress, then verification.
 * `completed` is claimed only when EVERY slot completed; a mix of idle and
 * completed reads `idle` (no active work), and anything unresolvable reads
 * `unknown` — never a confident guess.
 */
export function aggregateAgentPhase(phases: readonly AgentPhase[]): AgentPhase {
  if (phases.length === 0) return 'unknown';
  const present = new Set<AgentPhase>(phases);
  const precedence: readonly AgentPhase[] = ['failed', 'blocked', 'waiting_approval', 'running', 'verifying'];
  for (const phase of precedence) {
    if (present.has(phase)) return phase;
  }
  if (present.has('unknown') && !present.has('idle') && !present.has('completed')) return 'unknown';
  if (present.size === 1 && present.has('completed')) return 'completed';
  if (present.size === 1 && present.has('idle')) return 'idle';
  if (present.has('idle') && present.has('completed')) return 'idle';
  return 'unknown';
}

/** Structural equality over two status records (stable, order-sensitive on arrays). */
export function roomStatusEqual(a: RoomStatus, b: RoomStatus): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Exhaustiveness helper for tests and callers switching over an enum. */
export function assertNeverAgentPhase(phase: never): never {
  throw new Error(`unhandled agent phase: ${String(phase)}`);
}

// Re-export the closed sets so consumers need only this module for the IR.
export { AGENT_PHASES, EVIDENCE_REF_KINDS, ROOM_BLOCK_REASONS, ROOM_OCCUPANCY, ROOM_STATUS_IR_VERSIONS, ROOM_STATUS_IR_VERSION };
