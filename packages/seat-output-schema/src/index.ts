/**
 * Seat output schema — package entry (OMP→MAD Evolve Pack v0, Lane A).
 *
 * An additive sibling of `packages/seat-registry`, not an edit to it. The
 * registry package is the ratified V1 (DEC-20260902-02, r7 plan, fixture and
 * contract hashes pinned; its static test names it "V1, frozen") and the V1.1
 * precedent placed its gate outside the package as well. This package imports
 * the registry only through its public entry (plan F8 / T11) and re-derives
 * nothing the registry owns.
 *
 * Like `seat-registry` and `worker-supervisor`, this directory carries no
 * package manifest and is not a workspace member: the lockfile is pinned by
 * AE-01 T18 and workspace membership needs its own authorization (Founder
 * workspace/lockfile ruling, 2026-09-05). It is consumed through the root
 * tsconfig include and relative source imports.
 */

export {
  MAX_PATTERN_LENGTH,
  MAX_SCHEMA_DEPTH,
  SCHEMA_TYPES,
  checkSchema,
  validateOutput,
  type ArraySchema,
  type BooleanSchema,
  type IntegerSchema,
  type NullSchema,
  type NumberSchema,
  type ObjectSchema,
  type OutputSchema,
  type SchemaDefect,
  type SchemaType,
  type StringSchema,
  type Violation,
  type ViolationCode,
} from './schema.js';

export {
  HANDOFF_VERDICTS,
  SCHEMA_MODES,
  evaluateStructuredHandoff,
  isCleanAcceptance,
  isSchemaMode,
  type HandoffEvaluation,
  type HandoffVerdict,
  type RejectionCause,
  type SchemaMode,
  type StructuredHandoff,
} from './structured-handoff.js';

export {
  BUILDER_VERIFICATION_OUTPUT_SCHEMA,
  FULL_SHA_PATTERN,
  SHA256_PATTERN,
  builderVerificationHandoff,
  type BuilderVerificationHandoffInput,
  type BuilderVerificationReport,
} from './dogfood.js';
