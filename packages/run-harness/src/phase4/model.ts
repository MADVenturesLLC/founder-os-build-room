/**
 * The Phase 4 counted-run harness — shared vocabulary (plan r1 slice 10,
 * Phase 4 step 6: "prepare for separately authorized counted Phase 4 runs").
 *
 * NOTHING HERE AUTHORIZES A RUN. The three counted runs need the Founder's
 * entry act, which authorizes them "as one set, in one act" and defines the
 * run unit (FOUNDER-RULING-20261015-BUILD-ROOM-TO-DONE C6; Phase 4
 * authorization §7 item 13). This harness implements the builder's PROPOSED
 * run unit (`docs/planning/phase4-planner-loop/PHASE4-RUN-UNIT-PROPOSAL-r1.md`).
 * Where the act defines the unit differently, the act governs and this code
 * changes to match it before any run.
 *
 * The constants below restate rulings already given, each cited:
 *   - the Gateway for the counted runs is 1880c12d, on the PC (C5);
 *   - the Planner runs on the Antigravity adapter, on the active model the
 *     run's authorization names (Q2a);
 *   - every seat's model is named in that authorization and checked against
 *     the seat's approved lanes; the reviewer runs a different model from
 *     the builder (Q7a);
 *   - the control plane's T2 is attributed to `build-room-control-plane`,
 *     role `builder`, actor `control-plane:<deployment id>`, model
 *     `n/a (deterministic control-plane act)` (Q7b). That surface is
 *     PROPOSED in FounderOS `DEC-20261015-01` and is not yet registered, so
 *     the entry check refuses every set until the registry carries it.
 */

export const PHASE4_RUN_LABELS = ['Phase4-CR1', 'Phase4-CR2', 'Phase4-CR3'] as const;
export type Phase4RunLabel = (typeof PHASE4_RUN_LABELS)[number];

/** C5: "I name Gateway 1880c12d, on the PC, as the Gateway for them." */
export const PHASE4_NAMED_GATEWAY_PREFIX = '1880c12d';

/** Q2a: the Planner's adapter surface. */
export const PHASE4_PLANNER_SURFACE = 'antigravity';

/** The Planner's role, as the planner loop journals it. */
export const PHASE4_PLANNER_ROLE = 'architect';

/** Q7b: the attribution of the control plane's own T2. */
export const PHASE4_DISPATCHER = {
  roleId: 'builder',
  actorIdPrefix: 'control-plane:',
  actualModel: 'n/a (deterministic control-plane act)',
  executionSurface: 'build-room-control-plane',
} as const;

/**
 * Proposed: at most this many planning rounds in one run (the first, and up
 * to two revisions). A run still revising past it ends `interrupted`, never
 * passed. The act may set another bound.
 */
export const PHASE4_MAX_ROUNDS_PER_RUN = 3;

/** What one run captures as its room's scope and goal (Q7c), relayed verbatim from the act. */
export interface Phase4RunInputs {
  readonly repository: string;
  readonly baseSha: string;
  readonly scopePaths: readonly string[];
  readonly goal: string;
}

export interface Phase4PlannedRun {
  readonly label: Phase4RunLabel;
  /** A fresh room per run, named in advance so no run can reuse another's. */
  readonly roomId: string;
  readonly inputs: Phase4RunInputs;
}

/**
 * The entry act's machine-readable terms, as the harness reads them. The act
 * itself is the Founder's text; this is the builder's transcription of it,
 * checked field by field before anything runs.
 */
export interface Phase4RunSet {
  /** The act's identifier, journaled as each planner command's authorization. */
  readonly setId: string;
  readonly founderOsSha: string;
  /** The Build Room commit the control plane must be serving. */
  readonly buildRoomSha: string;
  readonly controlPlaneOrigin: string;
  readonly gatewayId: string;
  /** Q2a: the active model, named by the act. */
  readonly planner: { readonly provider: string; readonly model: string };
  /** Q7a: the other seats' models, named by the act. */
  readonly seats: { readonly builder: string; readonly reviewer: string };
  /** The surface relaying the Founder's T1, recorded in its attribution. */
  readonly founderRelay: { readonly actualModel: string; readonly executionSurface: string };
  /** How long a run waits on the Founder's plan decision before it is `interrupted`. */
  readonly decisionTimeoutMs: number;
  readonly runs: readonly Phase4PlannedRun[];
}

export type Phase4EntryFailure =
  | 'control_plane_unavailable'
  | 'build_sha_mismatch'
  | 'founder_os_mismatch'
  | 'gateway_not_named'
  | 'gateway_not_enrolled'
  | 'gateway_offline'
  | 'executor_unavailable'
  | 'dispatcher_surface_unregistered'
  | 'planner_lane_not_approved'
  | 'builder_lane_not_approved'
  | 'reviewer_lane_not_approved'
  | 'reviewer_same_as_builder'
  | 'goal_invalid';

export type Phase4RunOutcome =
  /** Entry refused: nothing ran, and the label was not consumed. */
  | 'not_started'
  | 'passed'
  /** The lifecycle recorded a governed failure, or its record breaks the run unit. */
  | 'failed'
  /** The run stopped without a settled lifecycle: a restart, a timeout, an unknown outcome. */
  | 'interrupted'
  /** The Founder cancelled the room (T22): a recorded rejection, not a pass. */
  | 'rejected';

export interface Phase4AttemptSummary {
  readonly label: Phase4RunLabel;
  readonly outcome: Phase4RunOutcome;
}

/* ---------------- the run record ---------------- */

export interface Phase4RecordedAttribution {
  readonly roleId: string | null;
  readonly actorId: string;
  readonly actualModel: string;
  readonly executionSurface: string;
}

/** One applied lifecycle transition, as the room's export carries it. */
export interface Phase4RecordedEvent {
  readonly eventId: string;
  readonly event: string;
  readonly actor: string;
  readonly attribution: Phase4RecordedAttribution;
  readonly evidence: readonly { readonly kind: string; readonly ref: string; readonly digest?: string }[];
  /** `facts.planHash`, where the event carries one (T3, T5). */
  readonly planHash?: string;
}

/** One journal row of a planner command, the fields the run unit reads. */
export interface Phase4RecordedCommandRow {
  readonly eventType: string;
  readonly authorizationRef?: string;
  readonly intendedProvider?: string;
  readonly intendedModel?: string;
  readonly intendedSurface?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly executionSurface?: string;
  readonly failureClassification?: string;
}

export interface Phase4RecordedCommand {
  readonly commandId: string;
  readonly rows: readonly Phase4RecordedCommandRow[];
}

export interface Phase4RecordedDecision {
  readonly commandId: string;
  readonly decision: string;
  readonly planHash?: string;
}

/** Everything the run unit is judged on, gathered after the run settles. */
export interface Phase4RunRecord {
  readonly roomId: string;
  readonly deploymentIdAtStart: string;
  readonly deploymentIdAtEnd: string;
  readonly finalState: string;
  /** Applied transitions in ledger order. */
  readonly events: readonly Phase4RecordedEvent[];
  /** The room's planner commands, in the order their rounds opened. */
  readonly commands: readonly Phase4RecordedCommand[];
  readonly decisions: readonly Phase4RecordedDecision[];
  /** The journal verified from genesis after the run. */
  readonly journalVerified: boolean;
}

export type Phase4RunFailure =
  | 'deployment_changed'
  | 'lifecycle_incomplete'
  | 'too_many_rounds'
  | 'founder_decision_timeout'
  | 'goal_not_bound'
  | 'dispatcher_attribution_wrong'
  | 'planner_attribution_wrong'
  | 'round_dispatch_missing'
  | 'command_authorization_wrong'
  | 'command_route_wrong'
  | 'command_not_clean'
  | 'plan_not_approved_as_reviewed'
  | 'decision_not_founder'
  | 'activity_after_approval'
  | 'journal_unverified';

export interface Phase4RunVerdict {
  readonly outcome: Exclude<Phase4RunOutcome, 'not_started'>;
  readonly failures: readonly Phase4RunFailure[];
}
