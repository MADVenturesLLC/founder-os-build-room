/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/broker/src/reconciliation.ts
 * Blob:   974639a1230e42b975aa010f9e9c04741efaf5cb (pinned in DEC-20260827-01 §5)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/broker/src/reconciliation.ts
// Fail-closed session recovery: interruption, reconciliation, resume.
//
// On any monitored process or adapter disconnect, the session atomically
// appends an `incident` event and moves to `interrupted`. The current writer
// token is marked unusable. No auto-resume.
//
// Reconciliation compares actual repository/worktree identity and fingerprint
// with the last committed event, records changed paths (without unrestricted
// file contents), re-attests both executions, and produces one of
// `reconciled`, `ambiguous`, or `mismatch`. Only `reconciled` plus a matching
// typed Founder resume event returns the session to `active`.

import type { BridgeEventV1, RepositoryFingerprint } from "../protocol/index.js";
import { canonicalJson } from "../protocol/index.js";
import { transitionSession } from "./session-machine.js";
import type { SessionState } from "./session-machine.js";
import type { LedgerRow } from "../ledger/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InterruptReason =
  | "cli_exit"
  | "adapter_disconnect"
  | "broker_restart"
  | "broken_chain";

export interface InterruptInput {
  reason: InterruptReason;
  detail?: string;
  sessionState: SessionState;
  currentWriterToken: number;
  ledgerRows: LedgerRow[];
  now?: string;
}

export interface InterruptResult {
  state: SessionState;
  incidentEvent: BridgeEventV1;
  tokenInvalidated: number;
  autoResumed: false;
  /**
   * True when the session was already interrupted and this call recorded a
   * secondary incident without issuing a new fencing token or mutating state.
   * First-time interrupts are always `false`.
   */
  duplicate: boolean;
}

export interface RepositorySnapshot {
  worktreePath: string;
  commitFingerprint: RepositoryFingerprint;
  workingTreeFingerprint: RepositoryFingerprint;
  changedPaths: readonly string[];
}

export interface ReconcileInput {
  ledgerRows: LedgerRow[];
  expectedFingerprint: RepositoryFingerprint;
  actualSnapshot: RepositorySnapshot;
  /** Both executions must re-attest to the task envelope hash. */
  reattestations: ReadonlyArray<{
    executionId: string;
    taskEnvelopeHash: string;
    attestedAt: string;
  }>;
}

export type ReconcileOutcome = "reconciled" | "ambiguous" | "mismatch";

export interface ReconcileResult {
  outcome: ReconcileOutcome;
  changedPaths: readonly string[];
  reattested: boolean;
  fingerprintMatch: boolean;
  detail: string;
}

export interface ResumeApproval {
  /** Must be a typed Founder resume event. */
  founderEvent: BridgeEventV1;
  reconcileResult: ReconcileResult;
  sessionState: SessionState;
}

export interface ResumeResult {
  state: SessionState;
  newFencingToken: number;
  resumed: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Deterministic broker-state reconstruction
// ---------------------------------------------------------------------------

export interface RebuiltBrokerState {
  count: number;
  lastEventHash: string;
  events: LedgerRow[];
  sessionState: SessionState;
  currentFencingToken: number | null;
  lastFingerprint: RepositoryFingerprint | null;
  hasIncident: boolean;
  tokenUsable: boolean;
}

/**
 * Deterministically reconstruct broker state from verified ledger events.
 * Replays the event stream to derive session state, fencing token, and
 * last known repository fingerprint.
 *
 * When the stream has no explicit start event, the first normal activity
 * event synthesizes starting -> active (same set as ledger rebuild.ts) so
 * durable broker and ledger replay stay aligned.
 */
export function rebuildBrokerState(rows: readonly LedgerRow[]): RebuiltBrokerState {
  if (rows.length === 0) {
    return {
      count: 0,
      lastEventHash: "0".repeat(64),
      events: [],
      sessionState: { kind: "starting" },
      currentFencingToken: null,
      lastFingerprint: null,
      hasIncident: false,
      tokenUsable: false,
    };
  }

  let state: SessionState = { kind: "starting" };
  let fencingToken: number | null = null;
  let lastFingerprint: RepositoryFingerprint | null = null;
  let hasIncident = false;
  let tokenUsable = true;

  for (const row of rows) {
    let event: BridgeEventV1;
    try {
      event = JSON.parse(row.event_json) as BridgeEventV1;
    } catch {
      // Corrupt event — can't replay
      continue;
    }

    // Track fingerprint
    if (event.repository_fingerprint) {
      lastFingerprint = event.repository_fingerprint;
    }

    switch (event.event_type) {
      case "message":
      case "action_request":
      case "action_accept":
      case "action_reject":
      case "artifact_publish":
      case "ownership_request":
      case "ownership_release":
      case "ownership_accept":
      case "ownership_reject":
      case "verification_result":
      case "review_verdict":
        // First normal activity synthesizes starting -> active when the ledger
        // stream has no explicit start event (parity with ledger rebuild.ts).
        // Only applies while still starting; interrupted/paused/etc. are unchanged.
        if (state.kind === "starting") {
          try {
            state = transitionSession(state, { type: "start" });
          } catch {
            // ignore illegal start (should not occur from starting)
          }
        }
        break;

      case "pause":
        try {
          state = transitionSession(state, { type: "pause" });
        } catch {
          // ignore if already paused or invalid
        }
        break;

      case "resume":
        try {
          // If interrupted, transition through reconciling first
          if (state.kind === "interrupted") {
            state = transitionSession(state, { type: "reconcile" });
          }
          state = transitionSession(state, { type: "resume" });
          // Resume after reconciliation issues a new fencing token
          fencingToken = (fencingToken ?? 0) + 1;
          tokenUsable = true;
        } catch {
          // ignore if invalid
        }
        break;

      case "incident":
        hasIncident = true;
        tokenUsable = false;
        try {
          state = transitionSession(state, { type: "interrupt" });
        } catch {
          // Invalid transition (e.g. session already closed) — keep the
          // machine-derived state. Never force-set interrupted; the incident
          // is still recorded via hasIncident and tokenUsable above.
        }
        break;

      case "session_close":
        try {
          state = transitionSession(state, { type: "close" });
          state = transitionSession(state, { type: "complete" });
        } catch {
          // ignore
        }
        break;

      default:
        break;
    }
  }

  const last = rows[rows.length - 1]!;
  return {
    count: rows.length,
    lastEventHash: last.event_hash,
    events: [...rows],
    sessionState: state,
    currentFencingToken: fencingToken,
    lastFingerprint,
    hasIncident,
    tokenUsable,
  };
}

// ---------------------------------------------------------------------------
// Fail-closed interruption
// ---------------------------------------------------------------------------

/**
 * On any monitored process or adapter disconnect:
 * 1. Atomically append an `incident` event to the ledger.
 * 2. Move session to `interrupted`.
 * 3. Mark the current writer token unusable.
 * 4. Do NOT auto-resume.
 */
export function interruptSession(input: InterruptInput): InterruptResult {
  const now = input.now ?? new Date().toISOString();

  // Determine the previous event hash for chaining
  const lastRow = input.ledgerRows[input.ledgerRows.length - 1];
  const previousHash = lastRow?.event_hash ?? "0".repeat(64);

  // Construct the incident event
  const incidentEvent: BridgeEventV1 = {
    protocol_version: "madbridge-protocol/v1",
    event_id: crypto.randomUUID(),
    session_id: lastRow ? (JSON.parse(lastRow.event_json) as BridgeEventV1).session_id : "session-recovery",
    parent_event_id: lastRow ? (JSON.parse(lastRow.event_json) as BridgeEventV1).event_id : null,
    sender_execution_id: "system",
    receiver_execution_id: "system",
    sender_role: "system",
    sender_surface: "broker",
    sender_model: "system",
    sender_provider: "internal",
    task_envelope_hash: lastRow ? (JSON.parse(lastRow.event_json) as BridgeEventV1).task_envelope_hash : "0".repeat(64),
    repository_fingerprint: lastRow
      ? (JSON.parse(lastRow.event_json) as BridgeEventV1).repository_fingerprint
      : { kind: "commit", sha256: "0".repeat(64), git_sha: "0".repeat(40) },
    event_type: "incident",
    payload_hash: "",
    payload: {
      reason: input.reason,
      detail: input.detail ?? "",
      interrupted_at: now,
      invalidated_token: input.currentWriterToken,
    },
    created_at: now,
    previous_event_hash: previousHash,
  };

  // Duplicate-interrupt idempotency: if the session is already interrupted,
  // do NOT attempt the state-machine transition (interrupted -> interrupted is
  // not a legal edge). Record a secondary incident event for auditability and
  // notification, leave the state and fencing token untouched, and return
  // { duplicate: true }. The token remains unusable, no new token is issued.
  if (input.sessionState.kind === "interrupted") {
    return {
      state: input.sessionState,
      incidentEvent,
      tokenInvalidated: input.currentWriterToken,
      autoResumed: false,
      duplicate: true,
    };
  }

  // Transition to interrupted through the state machine. Every first-time
  // interruption — whether the session is active, paused, starting, or
  // reconciling — uses this single path. Invalid transitions (e.g. from
  // `closed` or `closing`) throw rather than being silently overridden; the
  // caller decides how to fail closed.
  const newState = transitionSession(input.sessionState, { type: "interrupt" });

  return {
    state: newState,
    incidentEvent,
    tokenInvalidated: input.currentWriterToken,
    autoResumed: false,
    duplicate: false,
  };
}

// ---------------------------------------------------------------------------
// Repository reconciliation
// ---------------------------------------------------------------------------

/**
 * Compare actual repository/worktree identity and fingerprint with the last
 * committed event. Record changed paths without unrestricted file contents.
 * Re-attest both executions. Produce one of reconciled/ambiguous/mismatch.
 *
 * Only `reconciled` plus a matching typed Founder resume event returns to `active`.
 */
export function reconcileRepository(input: ReconcileInput): ReconcileResult {
  const { expectedFingerprint, actualSnapshot, reattestations } = input;

  // 1. Fingerprint comparison — compare the expected (last committed) fingerprint
  //    with both the commit and working-tree fingerprints from the actual snapshot.
  const commitMatches = actualSnapshot.commitFingerprint.sha256 === expectedFingerprint.sha256;
  const workingTreeMatch = actualSnapshot.workingTreeFingerprint.sha256 === expectedFingerprint.sha256;

  // 2. Check for ambiguity — if commit and working-tree disagree significantly
  //    and neither matches the expected, it's ambiguous.
  const commitVsWorktreeMatch =
    actualSnapshot.commitFingerprint.sha256 === actualSnapshot.workingTreeFingerprint.sha256;

  // 3. Re-attestation: exactly 2 executions must re-attest
  const reattested = reattestations.length >= 2 &&
    reattestations.every((a) => a.taskEnvelopeHash.length > 0 && a.attestedAt.length > 0);

  // 4. Determine outcome
  let outcome: ReconcileOutcome;

  if (!reattested) {
    // Re-attestation is required — without it we can't reconcile
    outcome = "ambiguous";
  } else if (!commitMatches && !workingTreeMatch) {
    // Neither fingerprint matches — could be drift or tampering
    if (!commitVsWorktreeMatch) {
      // Commit and working tree disagree — ambiguous
      outcome = "ambiguous";
    } else {
      // Both agree with each other but not with expected — mismatch
      outcome = "mismatch";
    }
  } else if (!commitMatches || !workingTreeMatch) {
    // One matches, one doesn't — working tree has uncommitted changes
    // This is acceptable as long as commit matches and changed paths are recorded
    if (commitMatches) {
      // Commit matches, working tree has changes — reconciled with recorded paths
      outcome = "reconciled";
    } else {
      // Working tree matches but commit doesn't — ambiguous
      outcome = "ambiguous";
    }
  } else {
    // Both match — fully reconciled
    outcome = "reconciled";
  }

  const fingerprintMatch = commitMatches && workingTreeMatch;

  const detail = outcome === "reconciled"
    ? `fingerprint matched, ${actualSnapshot.changedPaths.length} changed paths recorded`
    : outcome === "ambiguous"
      ? `re-attestation ${reattested ? "ok" : "missing"}, commit=${commitMatches}, worktree=${workingTreeMatch}`
      : `fingerprint mismatch: expected=${expectedFingerprint.sha256.slice(0, 8)}, actual_commit=${actualSnapshot.commitFingerprint.sha256.slice(0, 8)}`;

  return {
    outcome,
    changedPaths: actualSnapshot.changedPaths,
    reattested,
    fingerprintMatch,
    detail,
  };
}

// ---------------------------------------------------------------------------
// Resume session
// ---------------------------------------------------------------------------

/**
 * Resume a session only after reconciliation produced `reconciled` AND
 * a typed Founder resume event is provided. Issues a new fencing token.
 */
export function resumeSession(approval: ResumeApproval): ResumeResult {
  const { founderEvent, reconcileResult, sessionState } = approval;

  // The Founder event must be a typed resume event
  if (founderEvent.event_type !== "resume") {
    return {
      state: sessionState,
      newFencingToken: 0,
      resumed: false,
      detail: "resume requires a typed Founder resume event",
    };
  }

  // Reconciliation must have produced `reconciled`
  if (reconcileResult.outcome !== "reconciled") {
    return {
      state: sessionState,
      newFencingToken: 0,
      resumed: false,
      detail: `cannot resume: reconciliation outcome is ${reconcileResult.outcome}`,
    };
  }

  // Both re-attestations must be present
  if (!reconcileResult.reattested) {
    return {
      state: sessionState,
      newFencingToken: 0,
      resumed: false,
      detail: "cannot resume: re-attestation incomplete",
    };
  }

  // Move from interrupted → reconciling → active
  let state = sessionState;
  try {
    // If interrupted, move to reconciling first
    if (state.kind === "interrupted") {
      state = transitionSession(state, { type: "reconcile" });
    }
    // Now resume from reconciling to active
    state = transitionSession(state, { type: "resume" });
  } catch (err) {
    return {
      state: sessionState,
      newFencingToken: 0,
      resumed: false,
      detail: `resume transition failed: ${String(err)}`,
    };
  }

  // Issue a new fencing token
  const newToken = crypto.getRandomValues(new Uint32Array(1))[0]!;

  return {
    state,
    newFencingToken: newToken,
    resumed: true,
    detail: "session resumed with new fencing token",
  };
}
