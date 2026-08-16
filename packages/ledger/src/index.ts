/**
 * `@build-room/ledger` — pure enforcement of the Build Room lifecycle.
 *
 * PURE: zero I/O, zero credentials, zero infrastructure. Pairs with
 * `@build-room/contracts`, which describes the lifecycle this package enforces.
 */

export {
  apply,
  applyAll,
  acceptedPairs,
  initialLedger,
  snapshot,
  type ApplyResult,
  type LedgerEntry,
  type LedgerState,
  type LifecycleEvent,
  type RejectionCode,
} from './ledger.js';
