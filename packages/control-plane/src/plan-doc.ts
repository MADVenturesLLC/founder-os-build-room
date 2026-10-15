/**
 * The control plane's judgement of a submitted plan: schema, scope, hash.
 *
 * G3 (T3) needs "PlanDoc schema valid" and a computed `plan_hash`; G5 (T5)
 * needs the submitted hash to equal the expected one and the scope paths to
 * be canonical. All three facts are derived here, from the document, by the
 * control plane — never taken from the Planner's or a caller's word.
 *
 * `plan_hash` is serialization (b) over the document as received
 * (`packages/journal/src/plandoc.ts`, contract §6.2). A document that fails
 * its schema gets no hash: a hash names an approvable plan, and an invalid
 * plan is not one.
 */
import { checkScopePaths } from '../../contracts/src/index.js';
import { planHash, type CanonicalDocument } from '../../journal/src/index.js';
import {
  PLANDOC_SCHEMA_V1,
  PLAN_READY_STATUS,
  validateOutput,
  type PlanDocV1,
  type Violation,
} from '../../seat-output-schema/src/index.js';

export type PlanDocVerdict =
  | {
      readonly ok: true;
      readonly document: PlanDocV1;
      readonly planHash: string;
      /** True only for `PLAN_READY_FOR_FOUNDER_APPROVAL`, the status T3 submits. */
      readonly readyForDecision: boolean;
    }
  | { readonly ok: false; readonly kind: 'schema'; readonly violations: readonly Violation[] }
  | { readonly ok: false; readonly kind: 'scope'; readonly index: number | null; readonly reason: string }
  | { readonly ok: false; readonly kind: 'encoding'; readonly reason: string };

export function judgePlanDoc(value: unknown): PlanDocVerdict {
  const violations = validateOutput(PLANDOC_SCHEMA_V1, value);
  if (violations.length > 0) return { ok: false, kind: 'schema', violations };

  const document = value as PlanDocV1;
  const scope = checkScopePaths(document.scope_paths);
  if (!scope.ok) return { ok: false, kind: 'scope', index: scope.index, reason: scope.reason };

  let hash: string;
  try {
    hash = planHash(document as unknown as CanonicalDocument);
  } catch (error) {
    return { ok: false, kind: 'encoding', reason: error instanceof Error ? error.message : String(error) };
  }
  return {
    ok: true,
    document,
    planHash: hash,
    readyForDecision: document.terminal_status === PLAN_READY_STATUS,
  };
}
