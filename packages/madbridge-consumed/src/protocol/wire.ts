/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/protocol/src/wire.ts
 * Blob:   ccf03d3647f97d7072675d5743cb2cee5ec8b5c8 (unpinned dependency, consumed under the Founder ruling of 2026-10-15)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/protocol/src/wire.ts
// Wire protocol for socket communication between broker and clients.
// Messages are newline-delimited JSON.

import type { BridgeEventV1 } from "./events.js";
import type { TaskEnvelopeV1 } from "./task-envelope.js";

export type WireMessage =
  | { kind: "subscribe"; executionId: string; credentialPath: string }
  | { kind: "event"; event: BridgeEventV1 }
  | { kind: "snapshot"; task: TaskEnvelopeV1; events: BridgeEventV1[] }
  | { kind: "error"; code: string; detail: string };

export function encodeWire(msg: WireMessage): string {
  return JSON.stringify(msg) + "\n";
}

export function decodeWire(data: string): WireMessage | null {
  const trimmed = data.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as WireMessage;
  } catch {
    return null;
  }
}