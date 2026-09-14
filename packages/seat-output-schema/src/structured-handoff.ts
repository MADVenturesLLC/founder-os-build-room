/**
 * Structured seat handoff — `output_schema` + `schema_mode` on a seat handoff,
 * and the evaluator that turns a candidate handoff into a verdict.
 *
 * The rule this module exists to enforce: an invalid result is FLAGGED, never
 * silently accepted as PASS. Concretely:
 *
 *   - `strict`     → any violation rejects the handoff;
 *   - `permissive` → violations are carried as flags on an `accepted_with_flags`
 *                    verdict, which is a distinct enum value from `accepted` and
 *                    never reports `clean: true`;
 *   - anything the evaluator cannot judge (malformed input, an unknown seat, a
 *     mode outside the closed set, a defective schema, a handoff record the V1
 *     validator refuses) is `rejected` — there is no default mode and no
 *     "accepts anything" schema.
 *
 * The V1 handoff record is validated by the Seat Registry's own
 * `validateHandoff` (public entry only, plan F8 / T11); this module adds the
 * machine-checkable output on top and re-derives nothing the registry owns.
 */

import {
  isSeatId,
  validateHandoff,
  type SeatHandoff,
  type SeatId,
} from '../../seat-registry/src/index.js';
import {
  checkSchema,
  validateOutput,
  type OutputSchema,
  type SchemaDefect,
  type Violation,
} from './schema.js';

export type SchemaMode = 'strict' | 'permissive';

export const SCHEMA_MODES: readonly SchemaMode[] = ['strict', 'permissive'] as const;

export function isSchemaMode(value: unknown): value is SchemaMode {
  return typeof value === 'string' && (SCHEMA_MODES as readonly string[]).includes(value);
}

/** A seat handoff carrying a machine-checkable output and the schema it must meet. */
export interface StructuredHandoff {
  readonly seat_id: SeatId;
  /** The Seat Registry V1 handoff record, validated by `validateHandoff`. */
  readonly handoff: SeatHandoff;
  readonly output_schema: OutputSchema;
  readonly schema_mode: SchemaMode;
  /** The machine-checkable payload — not prose. */
  readonly output: unknown;
}

/**
 * The closed verdict set. `accepted` is the ONLY PASS-shaped value.
 * `accepted_with_flags` means "usable, but not clean" and is never `clean`.
 */
export type HandoffVerdict = 'accepted' | 'accepted_with_flags' | 'rejected';

export const HANDOFF_VERDICTS: readonly HandoffVerdict[] = ['accepted', 'accepted_with_flags', 'rejected'] as const;

export type RejectionCause =
  | 'malformed_candidate'
  | 'unknown_seat'
  | 'invalid_schema_mode'
  | 'malformed_schema'
  | 'invalid_handoff'
  | 'output_violations';

export interface HandoffEvaluation {
  readonly verdict: HandoffVerdict;
  /** True exactly when `verdict === 'accepted'`. There is no other PASS. */
  readonly clean: boolean;
  /** The mode that was applied, or null when the mode itself was refused. */
  readonly schema_mode: SchemaMode | null;
  readonly rejection: RejectionCause | null;
  /** Schema violations found — the rejection cause under strict, the flags under permissive. */
  readonly violations: readonly Violation[];
  readonly schema_defects: readonly SchemaDefect[];
  /** The V1 validator's error, when it refused the handoff record. */
  readonly handoff_error: string | null;
  /** Human-readable flags; non-empty exactly when the verdict is `accepted_with_flags`. */
  readonly flags: readonly string[];
}

function rejected(cause: RejectionCause, extra: Partial<HandoffEvaluation> = {}): HandoffEvaluation {
  return {
    verdict: 'rejected',
    clean: false,
    schema_mode: null,
    rejection: cause,
    violations: [],
    schema_defects: [],
    handoff_error: null,
    flags: [],
    ...extra,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Evaluate a candidate handoff. Accepts `unknown` so a malformed candidate is
 * refused structurally rather than thrown at — the same discipline as the
 * V1.1 gate's `malformed_request` and the V1 validator's field-naming
 * rejections. Never throws.
 */
export function evaluateStructuredHandoff(candidate: unknown): HandoffEvaluation {
  if (!isPlainObject(candidate)) {
    return rejected('malformed_candidate');
  }
  if (!isSeatId(candidate.seat_id)) {
    return rejected('unknown_seat');
  }
  const seat = candidate.seat_id;

  // The mode is a closed set. An absent or unknown mode is refused, never
  // defaulted to permissive — a default would be the silent-acceptance path.
  if (!isSchemaMode(candidate.schema_mode)) {
    return rejected('invalid_schema_mode');
  }
  const mode = candidate.schema_mode;

  const defects = checkSchema(candidate.output_schema);
  if (defects.length > 0) {
    return rejected('malformed_schema', { schema_mode: mode, schema_defects: defects });
  }
  const schema = candidate.output_schema as OutputSchema;

  if (!isPlainObject(candidate.handoff)) {
    return rejected('invalid_handoff', { schema_mode: mode, handoff_error: 'handoff must be an object' });
  }
  const handoffCheck = validateHandoff(candidate.handoff as unknown as SeatHandoff, seat);
  if (!handoffCheck.valid) {
    return rejected('invalid_handoff', { schema_mode: mode, handoff_error: handoffCheck.error });
  }

  const violations = validateOutput(schema, candidate.output);
  if (violations.length === 0) {
    return {
      verdict: 'accepted',
      clean: true,
      schema_mode: mode,
      rejection: null,
      violations: [],
      schema_defects: [],
      handoff_error: null,
      flags: [],
    };
  }
  if (mode === 'strict') {
    return rejected('output_violations', { schema_mode: mode, violations });
  }
  return {
    verdict: 'accepted_with_flags',
    clean: false,
    schema_mode: mode,
    rejection: null,
    violations,
    schema_defects: [],
    handoff_error: null,
    flags: violations.map((v) => `${v.code} at ${v.path === '' ? '<root>' : v.path}: ${v.message}`),
  };
}

/** The only PASS test a consumer should write. */
export function isCleanAcceptance(evaluation: HandoffEvaluation): boolean {
  return evaluation.verdict === 'accepted' && evaluation.clean;
}
