/**
 * Overlay flags.
 *
 * Source of truth: `DEC-20260815-11` v0.10, `## Reproduced Lifecycle Artifacts`
 * → "The four overlay flags", and Founder Ruling — Non-Plain Transition
 * Semantics, ruling 4.
 *
 * The Fable package declared three flags; the Founder ruled `manual_required`
 * the fourth. Overlay flags ANNOTATE the current state — they are not states.
 * A room in RECONCILING carrying `manual_required` is still in RECONCILING.
 */

export const OVERLAY_FLAGS = [
  'gateway_offline',
  'ceiling_exceeded',
  'auth_voided',
  'manual_required',
] as const;

export type OverlayFlag = (typeof OVERLAY_FLAGS)[number];

export function isOverlayFlag(value: unknown): value is OverlayFlag {
  return typeof value === 'string' && (OVERLAY_FLAGS as readonly string[]).includes(value);
}
