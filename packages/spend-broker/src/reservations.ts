/**
 * The in-process reservation ledger.
 *
 * Why this exists: the cost meter is pure and read-only, and provider-reported
 * usage lands in it post-hoc (`DEC-20260815-16` clause 3). Between "the meter
 * says 700 committed" and "the provider reports the turn's usage", only this
 * process knows that a mint has already reserved budget. So the broker records
 * every successful mint as a token reservation, and the meter adapter adds
 * these reservations on top of the meter's own counters before evaluating the
 * ceiling. Without this layer, two sequential mints inside one process would
 * both be evaluated against the same stale counters and the room could be
 * issued past its ceiling twice — the exact defect single-flight plus this
 * ledger exist to prevent.
 *
 * Scope, stated plainly: these reservations are **in-process and ephemeral**.
 * They expire with the token's lifetime, they do not survive a restart, and
 * they do not double-count later — when real usage is reported into the meter
 * and the reservation has expired, the spend appears once, via the meter.
 * A reservation that outlives its token would overstate the room's
 * commitment and lock a healthy room, so expiry is checked against the
 * broker's clock on every read.
 *
 * Bookkeeping per run, and the asymmetry between the two paths:
 *
 * - Only `api` mints record at all. `oauth` mints are not ceiling-gated
 *   (Founder ruling 2026-09-13: "Only API ceiling is $85. OAuth should be
 *   unlimited."), so they hold no reservation — recording one would understate
 *   the room's available budget for subsequent api mints.
 * - `mint` STACKS: each successful api mint appends a reservation, because two
 *   issuances are two potential spends, and dropping the first's reservation
 *   when the second lands would understate the room's commitment — the
 *   fail-open direction. (A ledger keyed one-slot-per-runId did exactly that;
 *   the parallel-mints test caught it.)
 * - `refresh` REPLACES: `release` clears the run's reservations before the
 *   ceiling check, because a refresh re-mints the SAME continuing turn rather
 *   than adding a second one. If the refresh is then denied, nothing is
 *   reserved — an interrupted turn holding budget it can no longer spend
 *   would be the wrong failure direction.
 *
 * That asymmetry is deliberate and is pinned by tests.
 */

import type { ReservationView } from './types.js';

export type { ReservationView };

export class ReservationLedger {
  /** Every successful mint appends; `release` clears the run's list. */
  private readonly byRunId = new Map<string, ReservationView[]>();

  record(view: ReservationView): void {
    const held = this.byRunId.get(view.runId);
    this.byRunId.set(view.runId, held === undefined ? [view] : [...held, view]);
  }

  /** Drop every reservation for a run, if any. No-op when none is held. */
  release(runId: string): void {
    this.byRunId.delete(runId);
  }

  /**
   * Total tokens actively reserved for a room: non-expired only, summed
   * across every run and every issuance holding a reservation on that room.
   */
  activeTokens(roomId: string, now: number): number {
    let total = 0;
    for (const held of this.byRunId.values()) {
      for (const reservation of held) {
        if (reservation.roomId === roomId && reservation.expiresAt > now) {
          total += reservation.tokens;
        }
      }
    }
    return total;
  }

  /** Every non-expired reservation, write order preserved as a copy. */
  active(now: number): readonly ReservationView[] {
    const live: ReservationView[] = [];
    for (const held of this.byRunId.values()) {
      for (const reservation of held) {
        if (reservation.expiresAt > now) live.push(reservation);
      }
    }
    return live;
  }
}
