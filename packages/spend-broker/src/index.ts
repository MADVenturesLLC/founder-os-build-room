/**
 * `@build-room/spend-broker` — public entrypoint.
 *
 * GLM-20260913-SPEND-BROKER-V0. A library that refuses to hand an LLM
 * provider a usable credential when the room/run is at or over its spend
 * ceiling, and interrupts an in-flight turn when its refresh finds the room
 * at or over that ceiling. A refresh from below the ceiling is admitted even
 * if it overshoots: `-16` clause 2 is inclusive (Founder ruling 2026-08-29),
 * and clause 3 discloses the one-run overshoot.
 *
 * Fixture-first: `GatewayPort`, `CostMeterPort` and `InterruptSink` are all
 * ports; v0 ships fixtures for each plus one real adapter — the meter
 * adapter, which reads `@build-room/cost-meter`'s public API and nothing
 * else. See `claims.ts` for what this package is and is not evidence of.
 */

export {
  DEFAULT_TOKEN_TTL_MS,
  SpendBroker,
  type BrokerStatus,
  type SpendBrokerOptions,
} from './broker.js';

export {
  GatewayError,
  type CeilingDeny,
  type CeilingPermit,
  type CeilingQuery,
  type CeilingVerdict,
  type CostMeterPort,
  type GatewayFailureKind,
  type GatewayPort,
} from './ports.js';

export { ReservationLedger, type ReservationView } from './reservations.js';
export { RunKeyLocks } from './single-flight.js';

export {
  MeterCeilingPort,
  type MeterCeilingPortOptions,
  type MeterSnapshot,
} from './cost-meter-adapter.js';

export {
  FailGatewayPort,
  FixtureGatewayPort,
  type FixtureGatewayOptions,
  NotAuthorizedGatewayPort,
  RecordingInterruptSink,
  StaticCostMeterPort,
} from './fixtures.js';

export {
  CLAIM_LANGUAGE_ALLOWED,
  NOT_EVIDENCE_OF,
  claimReport,
} from './claims.js';

export {
  opaqueToken,
  type InterruptFrame,
  type InterruptSink,
  type MintDeniedResult,
  type MintDenialReason,
  type MintRequest,
  type MintResult,
  type MintedResult,
  type OpaqueToken,
  type ReservationView as BrokerReservation,
} from './types.js';

export { buildDemoBroker, runCli, type CliResult, type DemoBindings } from './cli.js';

// Types the adapter's constructors need, re-exported read-only from the
// meter so callers of this package need not depend on it directly.
export type {
  AccountingInstant,
  MonthlyLedger,
  PriceTable,
  RoomBudget,
  RunUsageRecord,
} from '../../cost-meter/src/index.js';
