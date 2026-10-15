/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/protocol/src/ids.ts
 * Blob:   831811be83d2e46b16e0fda9ac08b4f29811be95 (unpinned dependency, consumed under the Founder ruling of 2026-10-15)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/protocol/src/ids.ts
// ID generation for events and sessions.

export function newEventId(): string {
  return crypto.randomUUID();
}

export function newSessionId(): string {
  return crypto.randomUUID();
}