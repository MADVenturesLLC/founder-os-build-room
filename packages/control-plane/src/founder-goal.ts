/**
 * The Founder goal — what a room's Planner is asked to plan.
 *
 * Founder answer of 2026-10-15 to plan r1 Q7c, selected option "Captured
 * with the scope": the goal text is supplied with the room's scope capture
 * (T1 `scope.captured`), alongside repository, base and paths. Build Room
 * stores it with the event, scans it for credentials, records its digest as
 * evidence, and it is immutable for the room from then on (T1 fires once,
 * and the event log is append-only).
 *
 * The goal is optional at T1, because scope capture predates it and the run
 * harness captures scope with none. It is required to plan: the planner loop
 * opens no round for a room whose captured scope carries no goal, or whose
 * goal no longer matches its recorded digest.
 *
 * The digest evidence is the server's alone. A caller may not supply a
 * `founder_goal` evidence entry, and no event but T1 may carry a goal.
 */

import { createHash } from 'node:crypto';
import { containsCredentialMaterial } from '../../journal/src/index.js';
import type { LifecycleEvent } from '../../ledger/src/index.js';

export const FOUNDER_GOAL_EVIDENCE_KIND = 'founder_goal';
export const FOUNDER_GOAL_MAX_LENGTH = 20_000;
const SCOPE_CAPTURED = 'scope.captured';

export class FounderGoalRefusedError extends Error {
  override readonly name = 'FounderGoalRefusedError';
  readonly code = 'founder_goal_refused';
  constructor(
    readonly kind: 'not_on_scope_capture' | 'invalid' | 'credential_material' | 'server_evidence',
    message: string,
  ) {
    super(message);
  }
}

/** SHA-256 over the goal's UTF-8 bytes, as recorded in T1's evidence. */
export function founderGoalDigest(goal: string): string {
  return createHash('sha256').update(goal, 'utf8').digest('hex');
}

/**
 * The event as the ledger should receive it: for a T1 carrying a goal, the
 * goal checked and its digest added as evidence; for any other event,
 * unchanged unless it carries a goal or a goal-digest entry, which is
 * refused. Messages name rules and never echo the goal.
 */
export function prepareFounderGoal(event: LifecycleEvent): LifecycleEvent {
  const candidate = event as LifecycleEvent & { readonly goal?: unknown };
  if (candidate.evidence.some((entry) => entry?.kind === FOUNDER_GOAL_EVIDENCE_KIND)) {
    throw new FounderGoalRefusedError('server_evidence', 'founder_goal evidence is recorded by the server, never supplied');
  }
  if (candidate.goal === undefined) return event;
  if (event.event !== SCOPE_CAPTURED) {
    throw new FounderGoalRefusedError('not_on_scope_capture', 'only scope.captured carries a goal');
  }
  const goal = candidate.goal;
  if (typeof goal !== 'string' || goal.trim() === '') {
    throw new FounderGoalRefusedError('invalid', 'goal, when present, must be a non-empty string');
  }
  if (goal.length > FOUNDER_GOAL_MAX_LENGTH) {
    throw new FounderGoalRefusedError('invalid', `goal is longer than ${FOUNDER_GOAL_MAX_LENGTH}`);
  }
  if (containsCredentialMaterial([goal])) {
    throw new FounderGoalRefusedError('credential_material', 'goal carries credential-shaped text');
  }
  return {
    ...event,
    evidence: [...event.evidence, { kind: FOUNDER_GOAL_EVIDENCE_KIND, ref: event.eventId, digest: founderGoalDigest(goal) }],
  };
}
