/**
 * Checkpoint Writer v0 — package entry.
 *
 * Lane 2 of the Founder Act "MiMo→MAD Long-Horizon Core v0" (2026-09-15):
 * unbounded logical sessions via cycles. EARLY structured checkpoints
 * (20% / 45% / 70% of the context budget by default) written by an
 * INDEPENDENT writer seat with its own budget and a code-enforced
 * single-writer lock; the main worker's only write channel is an
 * append-only notes scratch the writer promotes and clears; rebuild injects
 * ordered, hard-budgeted sections.
 *
 * LIBRARY-ONLY: not wired to any live daemon session path; the writer seat
 * is injected and this package never contacts a provider. No MiMo/OpenCode
 * source was available or vendored — see the handoff
 * (docs/planning/mimo-evolve-v0/HANDOFF-checkpoint-writer.md) for the
 * evolved-vs-invented statement.
 */

export {
  CHECKPOINT_IR_VERSION,
  TASK_STATUSES,
  CheckpointSchemaError,
  encodeCheckpointV1,
  parseCheckpointV1,
  validateCheckpointFieldsV1,
  validateCheckpointV1,
  type CheckpointFieldsV1,
  type CheckpointV1,
  type DesignDecisionV1,
  type ErrorAndFixV1,
  type EvidenceRefV1,
  type TaskNodeV1,
  type TaskStatus,
} from './schema.js';

export {
  DEFAULT_CHECKPOINT_THRESHOLDS,
  DEFAULT_REBUILD_FRACTION,
  CheckpointTriggerTracker,
  TriggerPolicyError,
  resolveTriggerPolicy,
  type TriggerEvent,
  type TriggerPolicy,
  type TriggerPolicyConfig,
} from './triggers.js';

export { NotesLog, NotesLogError, type NoteEntry } from './notes.js';
