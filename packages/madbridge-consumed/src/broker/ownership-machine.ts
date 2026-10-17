/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/broker/src/ownership-machine.ts
 * Blob:   f563f24c46487e4d5cd83d583773ae84a87b4669 (pinned in DEC-20260827-01 §5)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/broker/src/ownership-machine.ts
// Ownership lifecycle state machine with fencing tokens.
// free -> owned -> transfer-requested -> sender-released -> owned(by receiver) | rejected(free)
//
// Every acquisition increments the fencing token. Stale owners are rejected.

import type { RepositoryFingerprint } from "../protocol/index.js";

export type OwnershipState =
  | { kind: "free" }
  | { kind: "owned"; executionId: string; worktreeId: string; fencingToken: number; repositoryFingerprint: RepositoryFingerprint }
  | { kind: "transfer-requested"; executionId: string; worktreeId: string; fencingToken: number; transferTo: string; repositoryFingerprint: RepositoryFingerprint }
  | { kind: "sender-released"; executionId: string; worktreeId: string; fencingToken: number; transferTo: string; repositoryFingerprint: RepositoryFingerprint }
  | { kind: "rejected"; executionId: string; worktreeId: string; fencingToken: number; reason: string };

export type OwnershipEvent =
  | { type: "acquire"; executionId: string; worktreeId: string; repositoryFingerprint: RepositoryFingerprint }
  | { type: "release"; executionId: string; fencingToken: number }
  | { type: "request_transfer"; executionId: string; fencingToken: number; to: string }
  | { type: "sender_release"; executionId: string; fencingToken: number }
  | { type: "receiver_accept"; executionId: string; worktreeId: string; repositoryFingerprint: RepositoryFingerprint }
  | { type: "receiver_reject"; reason: string };

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`invalid ownership transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function transitionOwnership(state: OwnershipState, event: OwnershipEvent): OwnershipState {
  switch (state.kind) {
    case "free":
      if (event.type === "acquire") {
        return {
          kind: "owned",
          executionId: event.executionId,
          worktreeId: event.worktreeId,
          fencingToken: 1,
          repositoryFingerprint: event.repositoryFingerprint,
        };
      }
      break;

    case "owned":
      if (event.type === "release") {
        if (event.fencingToken !== state.fencingToken) {
          throw new Error("stale_token");
        }
        if (event.executionId !== state.executionId) {
          throw new Error("writer_not_owned");
        }
        return { kind: "free" };
      }
      if (event.type === "request_transfer") {
        if (event.fencingToken !== state.fencingToken) {
          throw new Error("stale_token");
        }
        if (event.executionId !== state.executionId) {
          throw new Error("writer_not_owned");
        }
        return {
          kind: "transfer-requested",
          executionId: state.executionId,
          worktreeId: state.worktreeId,
          fencingToken: state.fencingToken,
          transferTo: event.to,
          repositoryFingerprint: state.repositoryFingerprint,
        };
      }
      break;

    case "transfer-requested":
      if (event.type === "sender_release") {
        if (event.fencingToken !== state.fencingToken) {
          throw new Error("stale_token");
        }
        if (event.executionId !== state.executionId) {
          throw new Error("writer_not_owned");
        }
        return {
          kind: "sender-released",
          executionId: state.executionId,
          worktreeId: state.worktreeId,
          fencingToken: state.fencingToken,
          transferTo: state.transferTo,
          repositoryFingerprint: state.repositoryFingerprint,
        };
      }
      break;

    case "sender-released":
      if (event.type === "receiver_accept") {
        // Authorize the intended receiver — not just a matching fingerprint.
        // The transfer was assigned to a specific execution; only that
        // execution may accept.
        if (event.executionId !== state.transferTo) {
          throw new Error("receiver_not_intended");
        }
        // Bind the accept to the same worktree the transfer was opened on.
        if (event.worktreeId !== state.worktreeId) {
          throw new Error("worktree_mismatch");
        }
        // Verify fingerprint matches
        if (event.repositoryFingerprint.sha256 !== state.repositoryFingerprint.sha256) {
          throw new Error("fingerprint_mismatch");
        }
        return {
          kind: "owned",
          executionId: event.executionId,
          worktreeId: event.worktreeId,
          fencingToken: state.fencingToken + 1,
          repositoryFingerprint: event.repositoryFingerprint,
        };
      }
      if (event.type === "receiver_reject") {
        return { kind: "free" };
      }
      break;

    case "rejected":
      break;
  }

  throw new InvalidTransitionError(state.kind, event.type);
}

export function assertCurrentWriter(
  state: OwnershipState,
  executionId: string,
  worktreeId: string,
  fencingToken: number,
): void {
  if (state.kind !== "owned") {
    throw new Error("writer_not_owned");
  }
  if (state.fencingToken !== fencingToken) {
    throw new Error("stale_token");
  }
  if (state.executionId !== executionId) {
    throw new Error("writer_not_owned");
  }
  if (state.worktreeId !== worktreeId) {
    throw new Error("worktree_mismatch");
  }
}