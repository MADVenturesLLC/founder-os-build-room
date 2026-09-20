/**
 * The adapter from the broker's `CostMeterPort` to the LIVE cost meter's
 * public API — `@build-room/cost-meter`'s `evaluateDispatch`, imported and
 * called as-is.
 *
 * The meter's ratification is the authority here and nothing in this file
 * re-decides it:
 *
 * - The USD 85 monthly limb pauses strictly ABOVE the ceiling
 *   (`DEC-20260815-09` clause 2).
 * - The per-room token limb refuses at spent + reserved **≥** ceiling
 *   (`DEC-20260815-16` clause 2, as the meter mechanizes it). The meter
 *   itself records, at `perRoomTokenLimb`, that its projected reading makes
 *   the ceiling exclusive relative to the clause as written, and marks that
 *   an open `FOUNDER_DECISION_REQUIRED` question (see the meter source and
 *   `docs/phase-2-known-limits.md` §9). This package does NOT settle that
 *   question and does not re-implement the comparison — it asks the meter.
 * - UNKNOWN spend pauses; every limb is evaluated even after one pauses, so
 *   a denial here carries the full picture in its reasons.
 *
 * What this file DOES decide, as the commissioned wiring:
 *
 * - Broker-side reservations (tokens this process has minted but whose usage
 *   the meter has not yet seen) are layered onto `RoomBudget.tokensReserved`
 *   before evaluation, supplied by the `reservedTokensForRoom` callback the
 *   broker wires to its reservation ledger. Without this, in-process mints
 *   would each be evaluated against the same stale counters.
 * - A mint with no `roomId`, or a `roomId` with no bound `RoomBudget`, is
 *   denied fail-closed. The meter's per-room limb needs a room to evaluate;
 *   skipping the limb when the room is unknown would be the guess the meter
 *   refuses to make elsewhere.
 * - On permit, `remainingTokens` is computed from the same projected
 *   commitment the meter just permitted — ceiling minus
 *   (spent + reserved incl. broker reservations + requested). The ceiling
 *   RULE stays in the meter; this arithmetic only reports the numbers this
 *   adapter itself assembled.
 * - The monthly dollar limb evaluates the ledger snapshot the adapter was
 *   constructed with. Broker reservations are TOKENS and are not converted
 *   to dollars here: converting would require pricing, and rates live
 *   elsewhere by design (`DEC-20260722-01` clause 1). The reservation layer
 *   therefore guards the per-room token ceiling exactly; the monthly limb
 *   sees provider-reported usage when the snapshot's owner refreshes the
 *   ledger — the same post-hoc honesty `-16` clause 3 already names.
 */

import {
  evaluateDispatch,
  type AccountingInstant,
  type MonthlyLedger,
  type PriceTable,
  type RoomBudget,
} from '../../cost-meter/src/index.js';
import type { CeilingQuery, CeilingVerdict, CostMeterPort } from './ports.js';

export interface MeterSnapshot {
  /** The accounting instant the month is evaluated in (UTC calendar month). */
  readonly asOf: AccountingInstant;
  readonly ledger: MonthlyLedger;
  readonly priceTable: PriceTable;
  /** Room budgets bound at construction; the meter is pure, so they are inputs. */
  readonly budgets: ReadonlyMap<string, RoomBudget>;
}

export interface MeterCeilingPortOptions {
  readonly snapshot: MeterSnapshot;
  /**
   * Tokens THIS PROCESS has reserved for the room, on top of the meter's own
   * counters. The broker supplies this from its reservation ledger.
   */
  readonly reservedTokensForRoom: (roomId: string) => number;
}

export class MeterCeilingPort implements CostMeterPort {
  private readonly snapshot: MeterSnapshot;
  private readonly reservedTokensForRoom: (roomId: string) => number;

  constructor(options: MeterCeilingPortOptions) {
    this.snapshot = options.snapshot;
    this.reservedTokensForRoom = options.reservedTokensForRoom;
  }

  checkCeiling(query: CeilingQuery): CeilingVerdict {
    if (query.roomId === undefined) {
      return {
        ok: false,
        reasons: [
          `run ${query.runId}: no roomId on the mint — the per-room token ceiling ` +
            `cannot be evaluated without a room, so the mint is denied fail-closed`,
        ],
      };
    }

    const budget = this.snapshot.budgets.get(query.roomId);
    if (budget === undefined) {
      return {
        ok: false,
        reasons: [
          `run ${query.runId}: room ${query.roomId} has no bound room budget — ` +
            `the per-room token ceiling cannot be evaluated, so the mint is denied fail-closed`,
        ],
      };
    }

    const brokerReserved = this.reservedTokensForRoom(query.roomId);
    const effective: RoomBudget = {
      ...budget,
      tokensReserved: budget.tokensReserved + brokerReserved,
    };

    const decision = evaluateDispatch({
      asOf: this.snapshot.asOf,
      ledger: this.snapshot.ledger,
      priceTable: this.snapshot.priceTable,
      budget: effective,
      requestedTokens: query.requestedTokens,
    });

    if (decision.permit) {
      const projected =
        effective.tokensSpent + effective.tokensReserved + query.requestedTokens;
      return {
        ok: true,
        ceilingTokens: budget.tokenCeiling,
        committedTokens: effective.tokensSpent + effective.tokensReserved,
        remainingTokens: Math.max(0, budget.tokenCeiling - projected),
      };
    }

    const paused = decision.pausedBy.length > 0
      ? decision.pausedBy
      : decision.limbs.filter((limb) => limb.verdict === 'pause');
    const reasons = paused.map((limb) => `${limb.limb}: ${limb.reason}`);
    return {
      ok: false,
      reasons:
        reasons.length > 0
          ? reasons
          : ['dispatch paused by the cost meter with no limb detail available'],
    };
  }
}
