/**
 * Completion gate v0 — the handoff-schema registry.
 *
 * A `success-contract/v1` `required_handoff` clause names a schema by stable
 * id, not by value: the contract is data, and a schema carried inline in it
 * would let the claimant rewrite its own acceptance shape. The id→schema map
 * lives here, in code the claimant does not author. Unknown ids are refused
 * at contract-validation time — fail-closed, never "accepts anything".
 *
 * v0 registers exactly one schema: the ratified dogfood path from
 * `packages/seat-output-schema` (OMP→MAD Evolve Pack v0, Lane A), imported
 * through that package's public entry only. Adding an id is a code change to
 * this package, never data a worker can supply.
 */

import {
  BUILDER_VERIFICATION_OUTPUT_SCHEMA,
  type OutputSchema,
} from '../../seat-output-schema/src/index.js';

export const HANDOFF_SCHEMA_IDS = ['builder-verification-handoff/v1'] as const;

export type HandoffSchemaId = (typeof HANDOFF_SCHEMA_IDS)[number];

const HANDOFF_SCHEMAS: Readonly<Record<HandoffSchemaId, OutputSchema>> = {
  'builder-verification-handoff/v1': BUILDER_VERIFICATION_OUTPUT_SCHEMA,
};

export function isHandoffSchemaId(value: unknown): value is HandoffSchemaId {
  return typeof value === 'string' && (HANDOFF_SCHEMA_IDS as readonly string[]).includes(value);
}

export function handoffSchemaFor(id: HandoffSchemaId): OutputSchema {
  return HANDOFF_SCHEMAS[id];
}
