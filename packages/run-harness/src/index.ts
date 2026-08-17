/**
 * `@build-room/run-harness` — the Phase 2 three-run gate.
 *
 * Performs the Founder-defined run — **deploy → health check → verify →
 * teardown** — judges it against the three skeleton conditions, keeps the
 * sequence ordered and countable with failures visible as interruptions, and
 * emits a retained, exportable evidence bundle.
 *
 * Authority: `DEC-20260815-17` exit criteria 4 and 5, and the *Founder
 * Definition — what "a run" means at Phase 2* of 2026-08-17.
 *
 * Architecture §3.17: *"Completing three runs authorizes nothing."* A satisfied
 * gate is evidence for the Founder-confirmed stop gate under clause 2. It is
 * not the confirmation, and it confers no activation, no further phase, and no
 * spend authority.
 */

export {
  REQUIRED_CONDITIONS,
  verdictFor,
  type ConditionRecord,
  type RunRecord,
  type RunVerdict,
  type StepName,
  type StepOutcome,
  type StepRecord,
} from './record.js';

export {
  appendRun,
  consecutivePassesAtEnd,
  emptySequence,
  gateStatus,
  REQUIRED_CONSECUTIVE_PASSES,
  type GateStatus,
  type RunDraft,
  type RunSequence,
} from './sequence.js';

export { ControlPlaneClient, type Probe, type VersionResponse } from './client.js';

export {
  CommandPlatform,
  ExternalPlatform,
  type CommandPlatformConfig,
  type Platform,
  type PlatformAction,
  type PlatformActor,
} from './platform.js';

export {
  DEFAULT_RUNNER_CONFIG,
  defaultDeps,
  performRun,
  type RunnerConfig,
  type RunnerDeps,
} from './runner.js';

export {
  buildBundle,
  serializeBundle,
  summarizeBundle,
  type BundleContext,
  type EvidenceBundle,
} from './evidence.js';
