/**
 * The enforcement rule, as a pure function.
 *
 * Every value and every semantic here is ratified elsewhere. This module
 * mechanizes them and invents nothing:
 *
 * | Rule | Source |
 * |---|---|
 * | USD 85 monthly total-spend ceiling | `DEC-20260815-09` Founder ruling, 2026-08-15 |
 * | Spend **above** the ceiling pauses; exactly at it does not | `DEC-20260815-09` clause 2, adopted unchanged |
 * | Per-room token ceiling; refuse when spent + reserved **≥** ceiling | `DEC-20260815-16` clause 2 |
 * | Per-run hard cap | `DEC-20260815-16` clause 2 (enforced by the Gateway) |
 * | **AND** precedence — both must permit, either can pause | `DEC-20260815-09` Founder ruling, aggregation |
 * | Infrastructure counted when incurred, not invoiced | `DEC-20260815-09` Founder ruling |
 * | Calendar month, reset on the 1st | `DEC-20260815-09` Founder ruling |
 * | token → dollar via provider-reported tokens × pinned version | `DEC-20260721-03`, `DEC-20260722-01` |
 * | Pause, not hard stop; raising resumes, cancelling ends the run | `DEC-20260815-09` clause 2 |
 *
 * **The two boundary semantics differ, and that is deliberate rather than an
 * oversight to be tidied.** The monthly limb pauses strictly *above* USD 85 —
 * an earlier draft of that decision read "at USD 85" and was corrected in
 * Tier-2 review for settling an equality the Founder never reached. The
 * per-room token limb refuses at *greater than or equal to* the ceiling,
 * because `-16` clause 2 says "spent + reserved ≥ ceiling". Both are pinned by
 * tests.
 *
 * **Not enforced here: the USD 50 interim provider-side cap.**
 * `DEC-20260815-09`'s 2026-08-17 ruling is explicit that it "acts at the
 * provider, not at dispatch" and is "not a substitute for the meter", so
 * implementing it as a dispatch gate would misrepresent what it is. It is
 * exported as a documented constant for reporting, and nothing here reads it.
 */

import {
  format,
  isUnknown,
  sum,
  unknown,
  usd,
  ZERO,
  type Amount,
  type Usd,
} from './money.js';
import { monthKey, monthKeyOf, type AccountingInstant } from './period.js';
import { priceRuns, type PriceTable, type RunUsageRecord } from './pricing.js';
import {
  recognizeInfrastructure,
  SELECTED_RECOGNITION_METHOD,
  type InfrastructureCommitment,
  type RecognitionMethod,
} from './recognition.js';

/** Ratified 2026-08-15 by the Founder. Changing it is a single recorded Founder act. */
export const MONTHLY_CEILING = usd(85);

/**
 * The interim provider-side control, for reporting only. Recorded here so the
 * figure has one home in code; **no gate reads it** — see the header.
 */
export const INTERIM_PROVIDER_CAP_COMBINED = usd(50);

export type LimbVerdict = 'permit' | 'pause';

export interface LimbResult {
  readonly limb: 'monthly_spend' | 'token_inputs' | 'per_room_tokens' | 'per_run_cap';
  readonly verdict: LimbVerdict;
  readonly reason: string;
}

export interface DispatchDecision {
  readonly permit: boolean;
  /** Every limb's result, whether or not it was decisive. */
  readonly limbs: readonly LimbResult[];
  /** The limbs that paused, in evaluation order. Empty when permitted. */
  readonly pausedBy: readonly LimbResult[];
  /** The month's recognized spend as evaluated, for the record. */
  readonly monthSpend: Amount;
}

export interface MonthlyLedger {
  /** Fixed infrastructure commitments in force. Counted when incurred. */
  readonly infrastructure: readonly InfrastructureCommitment[];
  /** Provider-reported agent usage in the calendar month containing `asOf`. */
  readonly runs: readonly RunUsageRecord[];
}

export interface RoomBudget {
  readonly roomId: string;
  /** Token ceiling set at room creation (`DEC-20260815-16` clause 2). */
  readonly tokenCeiling: number;
  /** Tokens already spent in this room. */
  readonly tokensSpent: number;
  /** Tokens reserved for in-flight work. */
  readonly tokensReserved: number;
  /** Per-run hard cap, in tokens. Enforced by the Gateway; checked here too. */
  readonly perRunTokenCap: number;
}

export interface DispatchRequest {
  readonly asOf: AccountingInstant;
  readonly ledger: MonthlyLedger;
  readonly budget: RoomBudget;
  /** Tokens this dispatch would reserve. */
  readonly requestedTokens: number;
  readonly priceTable: PriceTable;
  readonly recognitionMethod?: RecognitionMethod;
}

/**
 * Decide whether a dispatch may proceed.
 *
 * Every limb is evaluated even after one pauses, so the record shows the full
 * picture rather than only the first refusal — the founder-visible blocked
 * state is more useful when it says everything that is wrong.
 */
export function evaluateDispatch(request: DispatchRequest): DispatchDecision {
  const { asOf, ledger, budget, requestedTokens, priceTable } = request;
  const method = request.recognitionMethod ?? SELECTED_RECOGNITION_METHOD;

  const monthSpend = monthlySpend(ledger, asOf, priceTable, method);
  const limbs: LimbResult[] = [
    monthlyLimb(monthSpend),
    tokenInputLimb(budget, requestedTokens),
    perRoomTokenLimb(budget, requestedTokens),
    perRunCapLimb(budget, requestedTokens),
  ];
  const pausedBy = limbs.filter((limb) => limb.verdict === 'pause');

  // AND precedence: both must permit; either can pause.
  return { permit: pausedBy.length === 0, limbs, pausedBy, monthSpend };
}

/**
 * Combined recorded spend for the calendar month containing `asOf`:
 * infrastructure recognized when incurred, plus provider usage priced from
 * provider-reported tokens.
 */
export function monthlySpend(
  ledger: MonthlyLedger,
  asOf: AccountingInstant,
  priceTable: PriceTable,
  method: RecognitionMethod = SELECTED_RECOGNITION_METHOD,
): Amount {
  const infrastructure = recognizeInfrastructure(ledger.infrastructure, asOf, method);

  const { inMonth, unbucketable } = bucketByMonth(ledger.runs, asOf);
  if (unbucketable.length > 0) {
    /*
     * A run whose timestamp cannot be resolved to a UTC month cannot be
     * counted in or out of the period. Dropping it would understate the month
     * silently, which is the one direction that matters — so it becomes
     * UNKNOWN, and the monthly limb pauses.
     */
    return unknown(
      `${unbucketable.length} run(s) carry a timestamp that is not a UTC-normalized RFC3339 ` +
        `instant and cannot be assigned to a calendar month: ${unbucketable.join(', ')}`,
    );
  }

  return sum([infrastructure, priceRuns(inMonth, priceTable)]);
}

function bucketByMonth(
  runs: readonly RunUsageRecord[],
  asOf: AccountingInstant,
): { readonly inMonth: readonly RunUsageRecord[]; readonly unbucketable: readonly string[] } {
  const target = monthKey(asOf);
  const inMonth: RunUsageRecord[] = [];
  const unbucketable: string[] = [];

  for (const run of runs) {
    const key = monthKeyOf(run.occurredAt);
    if (key === null) unbucketable.push(run.runId);
    else if (key === target) inMonth.push(run);
  }

  return { inMonth, unbucketable };
}

function monthlyLimb(monthSpend: Amount): LimbResult {
  /*
   * An unknown total pauses. The gate's job is to establish that spend is not
   * above the ceiling; when the figure cannot be computed, that has not been
   * established, and the architecture's posture is fail-closed (§3.15). This
   * is a consequence of rules already ratified, not a new rule — but it is the
   * one place where this module's behaviour is derived rather than quoted, so
   * it is said plainly here.
   */
  if (isUnknown(monthSpend)) {
    return {
      limb: 'monthly_spend',
      verdict: 'pause',
      reason:
        `month spend is UNKNOWN (${monthSpend.reason}) — the ceiling cannot be shown to hold, ` +
        `so dispatch pauses rather than proceeding on an uncomputed figure`,
    };
  }

  // Ratified clause 2: spend ABOVE the ceiling pauses. Exactly at it does not.
  if (monthSpend.micros > MONTHLY_CEILING.micros) {
    return {
      limb: 'monthly_spend',
      verdict: 'pause',
      reason:
        `month spend ${format(monthSpend)} is above the ${format(MONTHLY_CEILING)} monthly ceiling — ` +
        `dispatch pauses into a Founder-visible blocked state; raising the ceiling resumes, ` +
        `cancelling ends the run`,
    };
  }

  return {
    limb: 'monthly_spend',
    verdict: 'permit',
    reason: `month spend ${format(monthSpend)} is at or below the ${format(MONTHLY_CEILING)} ceiling`,
  };
}

/**
 * The token limbs are comparisons, and a comparison against a value that is
 * not a number does not fail — it is simply false.
 *
 * `NaN >= ceiling` is false and `NaN > perRunTokenCap` is false, so a `NaN`
 * `requestedTokens` sailed through both token limbs and the dispatch was
 * permitted. A negative `tokensSpent` was worse than useless: it *reduced* the
 * committed total, buying room under a ceiling that had already been reached.
 * Neither is exotic — both are what a missing or mis-parsed provider field
 * looks like by the time it reaches here.
 *
 * So the inputs are checked before the limbs are read, and failure pauses. A
 * guard that cannot evaluate its own condition has not established anything,
 * and the architecture's posture is fail-closed (§3.15). Raised by CodeRabbit
 * on PR #2.
 */
function tokenInputLimb(budget: RoomBudget, requestedTokens: number): LimbResult {
  const named: ReadonlyArray<readonly [string, number]> = [
    ['requestedTokens', requestedTokens],
    ['tokenCeiling', budget.tokenCeiling],
    ['tokensSpent', budget.tokensSpent],
    ['tokensReserved', budget.tokensReserved],
    ['perRunTokenCap', budget.perRunTokenCap],
  ];
  const bad = named.filter(([, value]) => !Number.isSafeInteger(value) || value < 0);

  if (bad.length > 0) {
    return {
      limb: 'token_inputs',
      verdict: 'pause',
      reason:
        `room ${budget.roomId}: token values must be non-negative safe integers, and ` +
        `${bad.map(([name, value]) => `${name}=${value}`).join(', ')} ${bad.length === 1 ? 'is' : 'are'} not — ` +
        `the token limbs cannot be evaluated, so dispatch pauses rather than proceeding`,
    };
  }

  return {
    limb: 'token_inputs',
    verdict: 'permit',
    reason: `room ${budget.roomId}: every token value is a non-negative safe integer`,
  };
}

function perRoomTokenLimb(budget: RoomBudget, requestedTokens: number): LimbResult {
  const committed = budget.tokensSpent + budget.tokensReserved + requestedTokens;

  // `-16` clause 2: refuse when spent + reserved ≥ ceiling.
  if (committed >= budget.tokenCeiling) {
    return {
      limb: 'per_room_tokens',
      verdict: 'pause',
      reason:
        `room ${budget.roomId}: spent + reserved (${committed}) is at or above its token ceiling ` +
        `(${budget.tokenCeiling})`,
    };
  }

  return {
    limb: 'per_room_tokens',
    verdict: 'permit',
    reason: `room ${budget.roomId}: ${committed} of ${budget.tokenCeiling} tokens committed`,
  };
}

function perRunCapLimb(budget: RoomBudget, requestedTokens: number): LimbResult {
  /*
   * The cap's enforcement locus is the Gateway (`-16` clause 2), which does
   * not exist until Phase 3. Checking it here too is defence in depth, not a
   * relocation of the requirement: a dispatch the meter permits can still be
   * cut off by the Gateway when it exists.
   */
  if (requestedTokens > budget.perRunTokenCap) {
    return {
      limb: 'per_run_cap',
      verdict: 'pause',
      reason:
        `requested ${requestedTokens} tokens exceeds the per-run hard cap ` +
        `(${budget.perRunTokenCap}); the Gateway enforces this cap at execution`,
    };
  }

  return {
    limb: 'per_run_cap',
    verdict: 'permit',
    reason: `requested ${requestedTokens} tokens is within the per-run cap (${budget.perRunTokenCap})`,
  };
}

/**
 * Overshoot, stated rather than hidden.
 *
 * `DEC-20260815-16` clause 3: providers report usage post-hoc, so a month can
 * end above the ceiling by up to one run's worth. The Founder named that
 * clause "the honesty mechanism" when ruling that the gate pauses on the
 * estimate rather than the invoice. This function exists so the bound is
 * reportable rather than a footnote.
 */
export function maximumOvershoot(budget: RoomBudget, priceTable: PriceTable, exemplar: RunUsageRecord): Amount {
  /*
   * The cap is priced as the MOST EXPENSIVE permitted token class, not as
   * input.
   *
   * This priced every capped token as input, which understates the bound
   * wherever output costs more than input — and output routinely does; the
   * suite's own table prices it at twice the input rate. A "maximum" that a
   * single ordinary output-heavy run exceeds is not a bound at all, and this
   * function exists precisely so the overshoot is reportable rather than a
   * footnote. Raised by CodeRabbit on PR #2.
   *
   * The reasoning is that a run's cost is `i·rᵢ + o·rₒ` with `i + o` bounded
   * by the cap, and that is maximized by spending the whole cap in the class
   * with the largest rate. So each class is priced at the full cap and the
   * largest result wins. Cached input is included when the table carries a
   * rate for it — it is normally cheaper, and assuming so would be an
   * assumption about a table this package deliberately does not own
   * (`DEC-20260722-01` clause 1).
   */
  const cap = budget.perRunTokenCap;
  if (!Number.isSafeInteger(cap) || cap < 0) {
    return unknown(`overshoot bound is UNKNOWN: perRunTokenCap ${cap} is not a non-negative safe integer`);
  }

  const byClass: readonly Amount[] = [
    priceRuns([{ ...exemplar, usage: { inputTokens: cap, outputTokens: 0 } }], priceTable),
    priceRuns([{ ...exemplar, usage: { inputTokens: 0, outputTokens: cap } }], priceTable),
    priceRuns(
      [{ ...exemplar, usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: cap } }],
      priceTable,
    ),
  ];

  const unknowns = byClass.filter(isUnknown);
  if (unknowns.length > 0) {
    return unknown(`overshoot bound is UNKNOWN: ${unknowns[0]?.reason ?? 'unpriceable'}`);
  }

  const worst = byClass.reduce((highest, candidate) =>
    (candidate as Usd).micros > (highest as Usd).micros ? candidate : highest,
  );
  return sum([ZERO, worst]);
}
