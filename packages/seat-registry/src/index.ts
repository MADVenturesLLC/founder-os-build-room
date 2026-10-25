/**
 * Seat Registry V1 — package entry.
 *
 * Ratified plan: docs/planning/seat-registry-v1/seat-registry-v1-implementation-plan-r7-DRAFT.md
 * (sha256 b1bc4159b8cdb1ce6c342d84b4be3650a340abfc467624154ea5ba2a54815b60),
 * governing decision DEC-20260902-02, doctrine pin FounderOS
 * 846190fdb4da0604672bef8d7b1c8852407c4934 (re-pinned from the plan's
 * 8d09e7e… under DEC-20261020-01; see fixtures.ts).
 */

export * from './vocabulary.js';
export * from './schema.js';
export * from './fixtures.js';
export * from './conditions.js';
export * from './registry-data.js';
export * from './model-distinctness.js';
export * from './resolve.js';
export * from './dispatch-policy.js';
export * from './handoff.js';
