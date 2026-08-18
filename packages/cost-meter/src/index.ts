/**
 * `@build-room/cost-meter` — the ratified cost-enforcement rule as a pure
 * function.
 *
 * Authorized by `DEC-20260815-09`'s Founder ruling of 2026-08-17 (*"Cost meter
 * — interim provider caps + meter in Phase 2"*), which authorizes **building**
 * the meter and alters no ceiling, no aggregation rule, and no ruled value.
 *
 * Pure: zero I/O, zero credentials, no clock — time and usage arrive as
 * arguments. It carries **no rate data**: `DEC-20260722-01` clause 1 puts the
 * canonical price table in `founder-os-console`, and this package takes it as
 * a port.
 *
 * The one choice made here rather than quoted is the infrastructure
 * recognition method, which `DEC-20260815-09` and `DEC-20260815-16` both
 * assign to whoever builds the meter. It is selected, reasoned, and recorded
 * in `recognition.ts` and in `docs/cost-recognition-choice.md`.
 */

export {
  format,
  isUnknown,
  micros,
  MICROS_PER_USD,
  sum,
  unknown,
  usd,
  ZERO,
  type Amount,
  type UnknownUsd,
  type Usd,
} from './money.js';

export {
  priceRun,
  priceRuns,
  type PriceTable,
  type Rate,
  type RunUsageRecord,
  type TokenUsage,
} from './pricing.js';

export {
  accountingInstant,
  dateKey,
  daysInMonth,
  isLeapYear,
  isOnOrBefore,
  monthKey,
  monthKeyOf,
  PeriodError,
  type AccountingInstant,
} from './period.js';

export {
  monthlyCommitmentTotal,
  recognizeInfrastructure,
  SELECTED_RECOGNITION_METHOD,
  type InfrastructureCommitment,
  type RecognitionMethod,
} from './recognition.js';

export {
  evaluateDispatch,
  INTERIM_PROVIDER_CAP_COMBINED,
  maximumOvershoot,
  MONTHLY_CEILING,
  monthlySpend,
  type DispatchDecision,
  type DispatchRequest,
  type LimbResult,
  type LimbVerdict,
  type MonthlyLedger,
  type RoomBudget,
} from './meter.js';
