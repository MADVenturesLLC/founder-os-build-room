/**
 * `@build-room/contracts` — the Build Room lifecycle, as types and data.
 *
 * PURE: zero I/O, zero credentials, zero infrastructure. This package is the
 * WF-04 Step 3 Slice 1 half that describes the lifecycle; `@build-room/ledger`
 * is the half that enforces it.
 *
 * Authority: `DEC-20260815-11` v0.12 (`source_of_truth: true`), whose
 * `## Reproduced Lifecycle Artifacts` section is authoritative for the states,
 * overlay flags and the T1-T22 table. The Fable planning package is pinned
 * PROVENANCE ONLY at `cff972d34a7a3a2c6b7225fffe96a76af86c8b25`.
 */

export {
  STATES,
  TERMINAL_STATES,
  NON_TERMINAL_STATES,
  isState,
  isTerminal,
  ordinal,
  range,
  anyNonTerminalExcluding,
  type State,
  type TerminalState,
} from './states.js';

export {
  OVERLAY_FLAGS,
  isOverlayFlag,
  type OverlayFlag,
} from './overlays.js';

export {
  EVENTS,
  ACTORS,
  EVENT_TABLE,
  RECORDED_EVENTS,
  RUNTIME_ROOM_BINDING_FIELDS,
  eventSpec,
  recordedEventSpec,
  isEventName,
  isCanonicalUuid,
  isRuntimeRoomId,
  isRuntimeRoomBinding,
  runtimeRoomBindingDefect,
  type EventName,
  type Actor,
  type EventSpec,
  type RecordedEventSpec,
  type RuntimeRoomBinding,
} from './events.js';

export {
  TRANSITIONS,
  TRANSITION_IDS,
  GUARD_IDS,
  GUARDS,
  transition,
  type TransitionId,
  type GuardId,
  type GuardFn,
  type GuardFacts,
  type GuardResult,
  type TransitionSpec,
  type Target,
  type LifecycleSnapshot,
  type AuthorizationRecord,
  type RuntimeRoomBindingRecord,
} from './transitions.js';

export {
  ROLE_IDS,
  isRoleId,
  isAttributionShapeValid,
  type RoleId,
  type Attribution,
  type Scope,
  type EvidenceRef,
} from './attribution.js';

export {
  MAX_SCOPE_PATHS,
  MAX_SCOPE_PATH_LENGTH,
  scopePathDefect,
  checkScopePaths,
  isCanonicalScopePaths,
  type ScopePathsVerdict,
} from './scope.js';

export { SPEC } from './spec.js';
