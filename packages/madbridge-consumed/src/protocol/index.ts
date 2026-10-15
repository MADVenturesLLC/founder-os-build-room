/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/protocol/src/index.ts
 * Blob:   e4ca1e819dcb34326c6c35c672fbd4b3c48bd1a4 (unpinned dependency, consumed under the Founder ruling of 2026-10-15)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/protocol/src/index.ts
// Public exports for the madbridge-protocol/v1 package.

export { PROTOCOL_VERSION, EVENT_TYPES } from "./events.js";
export type { EventType, BridgeEventV1 } from "./events.js";
export { parseBridgeEvent } from "./events.js";

export type {
  TaskEnvelopeV1,
  TaskScope,
  ExecutionIdentity,
  RepositoryFingerprint,
  CliSurface,
  ExecutionRole,
  DataClass,
  CommandCategory,
  ArtifactCategory,
  Effort,
} from "./task-envelope.js";
export type { SurfaceId } from "./surface-id.js";
export {
  parseTaskEnvelope,
  KNOWN_ROLES,
  KNOWN_DATA_CLASSES,
  KNOWN_COMMAND_CATEGORIES,
} from "./task-envelope.js";
export { parseSurfaceId } from "./surface-id.js";

export { canonicalJson, sha256Canonical, sha256CanonicalSync } from "./canonical-json.js";
export { sha256Hex } from "./crypto.js";
export { newEventId, newSessionId } from "./ids.js";
export { encodeWire, decodeWire } from "./wire.js";
export type { WireMessage } from "./wire.js";

export type { AdapterRegistrationV1 } from "./adapter-registry.js";
export { ADAPTER_REGISTRY, lookupRegistration } from "./adapter-registry.js";