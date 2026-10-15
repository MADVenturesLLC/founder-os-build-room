/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/ledger/src/rebuild.ts
 * Blob:   edff7e5af270075053717aa820e4134c74c2271d (pinned in DEC-20260827-01 §5)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/ledger/src/rebuild.ts
// Deterministic state reconstruction from verified ledger events.
//
// Session replay uses the same legal transitions as the broker session machine
// (packages/broker/src/session-machine.ts). Invalid transitions are not
// force-applied; prior machine-derived state is preserved (fail-closed).

import type { LedgerRow } from "./ledger.js";
import type { RepositoryFingerprint } from "../protocol/index.js";

export interface RebuiltState {
  count: number;
  lastEventHash: string;
  events: LedgerRow[];
}

export type SessionStateKind =
  | "starting"
  | "active"
  | "paused"
  | "interrupted"
  | "reconciling"
  | "closing"
  | "closed";

export interface RebuiltBrokerState {
  count: number;
  lastEventHash: string;
  events: LedgerRow[];
  sessionState: SessionStateKind;
  currentFencingToken: number | null;
  lastFingerprint: RepositoryFingerprint | null;
  hasIncident: boolean;
  tokenUsable: boolean;
}

/** Machine events — mirrors broker SessionEvent types (not ledger event_type). */
type MachineEvent =
  | "start"
  | "pause"
  | "resume"
  | "interrupt"
  | "reconcile"
  | "close"
  | "complete";

/**
 * Legal transitions — must stay in lockstep with
 * packages/broker/src/session-machine.ts TRANSITIONS.
 *
 * starting -> active (start) | interrupted (interrupt)
 * active   -> paused (pause) | interrupted (interrupt) | closing (close)
 * paused   -> active (resume) | interrupted (interrupt)
 * interrupted -> reconciling (reconcile)
 * reconciling -> active (resume) | interrupted (interrupt)
 * closing  -> closed (complete)
 * closed   -> (none)
 */
const TRANSITIONS: Record<SessionStateKind, ReadonlySet<MachineEvent>> = {
  starting: new Set(["start", "interrupt"]),
  active: new Set(["pause", "interrupt", "close"]),
  paused: new Set(["resume", "interrupt"]),
  interrupted: new Set(["reconcile"]),
  reconciling: new Set(["resume", "interrupt"]),
  closing: new Set(["complete"]),
  closed: new Set(),
};

class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(
      from === "interrupted" && to === "resume"
        ? "reconciliation_required"
        : `invalid transition: ${from} -> ${to}`,
    );
    this.name = "InvalidTransitionError";
  }
}

/**
 * Apply one session-machine transition. Throws on illegal moves
 * (same contract as broker transitionSession).
 */
function transitionSession(state: SessionStateKind, event: MachineEvent): SessionStateKind {
  const allowed = TRANSITIONS[state];
  if (!allowed.has(event)) {
    throw new InvalidTransitionError(state, event);
  }

  switch (event) {
    case "start":
      if (state === "starting") return "active";
      break;
    case "pause":
      if (state === "active") return "paused";
      break;
    case "resume":
      if (state === "paused") return "active";
      if (state === "reconciling") return "active";
      break;
    case "interrupt":
      if (
        state === "active" ||
        state === "paused" ||
        state === "starting" ||
        state === "reconciling"
      ) {
        return "interrupted";
      }
      break;
    case "reconcile":
      if (state === "interrupted") return "reconciling";
      break;
    case "close":
      if (state === "active") return "closing";
      break;
    case "complete":
      if (state === "closing") return "closed";
      break;
  }

  throw new InvalidTransitionError(state, event);
}

/** Attempt a transition; on illegal moves keep prior state (fail-closed). */
function tryTransition(state: SessionStateKind, event: MachineEvent): SessionStateKind {
  try {
    return transitionSession(state, event);
  } catch {
    return state;
  }
}

export function rebuildState(rows: Array<LedgerRow>): RebuiltState {
  if (rows.length === 0) {
    return { count: 0, lastEventHash: "0".repeat(64), events: [] };
  }
  const last = rows[rows.length - 1];
  return { count: rows.length, lastEventHash: last?.event_hash ?? "0".repeat(64), events: rows };
}

/**
 * Deterministically reconstruct broker state from verified ledger events.
 * Replays the event stream to derive session state, fencing token,
 * last known repository fingerprint, and token usability.
 *
 * Session transitions match the broker session machine. Incident never
 * force-sets interrupted on closed/closing sessions. Resume from interrupted
 * goes through reconciling first (same as broker rebuildBrokerState).
 */
export function rebuildBrokerState(rows: readonly LedgerRow[]): RebuiltBrokerState {
  if (rows.length === 0) {
    return {
      count: 0,
      lastEventHash: "0".repeat(64),
      events: [],
      sessionState: "starting",
      currentFencingToken: null,
      lastFingerprint: null,
      hasIncident: false,
      tokenUsable: false,
    };
  }

  let sessionState: SessionStateKind = "starting";
  let fencingToken: number | null = null;
  let lastFingerprint: RepositoryFingerprint | null = null;
  let hasIncident = false;
  let tokenUsable = true;

  for (const row of rows) {
    let event: { event_type?: string; repository_fingerprint?: RepositoryFingerprint };
    try {
      event = JSON.parse(row.event_json);
    } catch {
      continue;
    }

    if (event.repository_fingerprint) {
      lastFingerprint = event.repository_fingerprint;
    }

    const eventType = event.event_type;
    if (!eventType) continue;

    switch (eventType) {
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
        // First normal activity activates a session that never saw an explicit
        // start event in the ledger stream (ledger has no "start" event_type).
        if (sessionState === "starting") {
          sessionState = tryTransition(sessionState, "start");
        }
        break;

      case "pause":
        sessionState = tryTransition(sessionState, "pause");
        break;

      case "resume":
        // Broker path: interrupted must reconcile before resume. Direct
        // interrupted -> active is illegal (reconciliation_required).
        if (sessionState === "interrupted") {
          sessionState = tryTransition(sessionState, "reconcile");
        }
        try {
          const next = transitionSession(sessionState, "resume");
          sessionState = next;
          // Resume after reconciliation (or from paused) issues a new fencing token
          fencingToken = (fencingToken ?? 0) + 1;
          tokenUsable = true;
        } catch {
          // Invalid resume — keep machine-derived state; do not coerce to active
        }
        break;

      case "incident":
        hasIncident = true;
        tokenUsable = false;
        // Never force-set interrupted. closed/closing reject interrupt;
        // machine-derived state is preserved while fail-closed signals apply.
        sessionState = tryTransition(sessionState, "interrupt");
        break;

      case "session_close":
        sessionState = tryTransition(sessionState, "close");
        sessionState = tryTransition(sessionState, "complete");
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
    sessionState,
    currentFencingToken: fencingToken,
    lastFingerprint,
    hasIncident,
    tokenUsable,
  };
}
