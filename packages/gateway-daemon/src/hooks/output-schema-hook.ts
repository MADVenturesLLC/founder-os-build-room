/**
 * Output-schema post-hook (OMP→MAD Evolve Pack v0, Lane D over Lane A).
 *
 * Observes a dispatched result against a Lane A `OutputSchema`:
 *   - `strict`     → violations REJECT the result (`dispatched_rejected`);
 *   - `permissive` → violations FLAG it (`dispatched_flagged`);
 *   - a defective schema throws, which the interceptor reports as
 *     `dispatched_post_hook_failed` — never a clean dispatch.
 *
 * Depends on Lane A by the act's stated preference ("prefer depend on A").
 */

import {
  checkSchema,
  isSchemaMode,
  validateOutput,
  type OutputSchema,
  type SchemaMode,
} from '../../../seat-output-schema/src/index.js';
import type { PostHook, PostObservation, ToolCall } from './tool-call-hooks.js';

export function outputSchemaPostHook(schema: OutputSchema, mode: SchemaMode, name = 'output-schema'): PostHook {
  return {
    name,
    observe(_call: ToolCall, result: unknown): PostObservation {
      if (!isSchemaMode(mode)) {
        throw new Error(`schema_mode ${JSON.stringify(mode)} is not strict | permissive`);
      }
      const defects = checkSchema(schema);
      if (defects.length > 0) {
        throw new Error(`output schema is malformed: ${defects.map((d) => `${d.path || '<root>'}: ${d.message}`).join('; ')}`);
      }
      const violations = validateOutput(schema, result);
      const flags = violations.map((v) => `${v.code} at ${v.path === '' ? '<root>' : v.path}: ${v.message}`);
      return { flags, rejected: mode === 'strict' && violations.length > 0 };
    },
  };
}
