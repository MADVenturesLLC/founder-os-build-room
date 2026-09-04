/**
 * `@build-room/control-plane` — the Phase 2 cloud skeleton.
 *
 * The single writer to the durable ledger. Everything it decides is decided by
 * the pure reducer in `@build-room/ledger`; this package supplies the storage,
 * the HTTP surface, and the boot sequence, and no lifecycle rule of its own.
 *
 * Authority: `DEC-20260815-17` — Phase 2 (cloud skeleton), authorized
 * 2026-08-17 as the full arc *provision → wire → run three times → return at
 * the stop gate*, on the bound reduced stack (Railway control plane, Neon
 * operational Postgres). Web tier, gateway platform and Redis/queue are
 * deferred and are not implemented here.
 */

export { loadConfig, ConfigError, type Config } from './config.js';
export { createPool, probe, type ProbeResult } from './db.js';
export { migrate, MIGRATIONS, type Migration, type MigrationResult } from './migrations.js';
export { createServer, type ServerDeps } from './server.js';
export {
  PostgresLedgerStore,
  RoomNotFoundError,
  type AppendOutcome,
  type AppendResult,
  type RoomView,
} from './store.js';
export { main } from './main.js';
export {
  createSeatPolicyGate,
  DISPATCH_AT_MOST_ONCE,
  DISPATCH_PATH_OBLIGATIONS,
  DISPATCH_POLICY,
  MP1_STATEMENT,
  type DispatchRequest,
  type DispatchPolicyV1,
  type FailoverDecision,
  type RetryBudgetEvent,
  type RetryBudgetState,
  type RetryDecision,
  type SeatPolicyDecision,
  type SeatPolicyGate,
  type SeatPolicyGateOptions,
  type SeatResolver,
  type SeatResolution,
  type SeatRoutingLane,
  type SeatRegistrationV1,
  type ResolvedSeat,
} from './seat-policy.js';
