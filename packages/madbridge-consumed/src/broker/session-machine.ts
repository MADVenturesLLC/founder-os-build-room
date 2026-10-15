/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/broker/src/session-machine.ts
 * Blob:   e1757383611b9062e9f4f5bb2d2bd79bf723aba9 (unpinned dependency, consumed under the Founder ruling of 2026-10-15)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/broker/src/session-machine.ts
// Session lifecycle state machine.
// starting -> active -> paused -> active -> closing -> closed
//                 \-> interrupted -> reconciling -> active
// paused can also be interrupted directly (paused -> interrupted).
//
// Unlisted transitions throw InvalidTransitionError. No default branch coerces unknown state.

import type { RepositoryFingerprint } from "../protocol/index.js";

export type SessionState =
  | { kind: "starting" }
  | { kind: "active" }
  | { kind: "paused" }
  | { kind: "interrupted" }
  | { kind: "reconciling" }
  | { kind: "closing" }
  | { kind: "closed" };

export type SessionEvent =
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "interrupt" }
  | { type: "reconcile" }
  | { type: "close" }
  | { type: "complete" };

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`invalid transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

const TRANSITIONS: Record<string, Set<string>> = {
  starting: new Set(["start", "interrupt"]),
  active: new Set(["pause", "interrupt", "close"]),
  paused: new Set(["resume", "interrupt"]),
  interrupted: new Set(["reconcile"]),
  reconciling: new Set(["resume", "interrupt"]),
  closing: new Set(["complete"]),
  closed: new Set(),
};

export function transitionSession(state: SessionState, event: SessionEvent): SessionState {
  const fromKind = state.kind;
  const allowed = TRANSITIONS[fromKind];

  if (!allowed || !allowed.has(event.type)) {
    if (state.kind === "interrupted" && event.type === "resume") {
      throw new Error("reconciliation_required");
    }
    throw new InvalidTransitionError(fromKind, event.type);
  }

  switch (event.type) {
    case "start":
      if (state.kind === "starting") return { kind: "active" };
      break;
    case "pause":
      if (state.kind === "active") return { kind: "paused" };
      break;
    case "resume":
      if (state.kind === "paused") return { kind: "active" };
      if (state.kind === "reconciling") return { kind: "active" };
      break;
    case "interrupt":
      if (state.kind === "active" || state.kind === "paused" || state.kind === "starting" || state.kind === "reconciling") return { kind: "interrupted" };
      break;
    case "reconcile":
      if (state.kind === "interrupted") return { kind: "reconciling" };
      break;
    case "close":
      if (state.kind === "active") return { kind: "closing" };
      break;
    case "complete":
      if (state.kind === "closing") return { kind: "closed" };
      break;
  }

  throw new InvalidTransitionError(fromKind, event.type);
}