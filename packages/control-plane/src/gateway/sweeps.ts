/**
 * Sweeps and retention (contract §18).
 *
 * Three sweeps with three different safety properties, and the differences are
 * the whole point:
 *
 *   **Staleness** is leader-only and FENCED. It reads and nulls the leader's
 *   live liveness map, which makes it generation-dependent — a stale leader
 *   resuming a paused sweep after a takeover must not mutate availability. It
 *   was reclassified from L2-only for exactly that reason (correction F3).
 *
 *   **Expiry** is replica-safe. Its precondition — the row is `awaiting_approval`
 *   AND past its deadline — makes a repeat run find the row already `expired`
 *   and write nothing, so any replica may run it and running it twice is a
 *   no-op.
 *
 *   **Retention** is replica-safe for the same reason in a simpler form: a
 *   DELETE by age is idempotent by construction.
 *
 * The >=7-year tables are never swept, and there is no code here that could.
 */

import type { Pool } from 'pg';
import type { Config } from '../config.js';
import type { ClockGate } from './clock.js';
import { insertTransition, latestTransition } from './availability.js';
import { GATEWAY_REGISTRY_LOCK_KEY } from '../migrations.js';
import type { GatewayLeadership } from './leadership.js';
import type { GatewaySessionService } from './session.js';
import type { GatewaySessionState } from './session-state.js';
import {
  controlPlaneActor,
  controlPlaneAttribution,
} from './records.js';
import {
  insertRegistryEvent,
  transactionNow,
  upsertProjection,
  type GatewayRegistryStore,
} from './store.js';

export const AVAILABILITY_RETENTION_DAYS = 90;
export const MESSAGE_REJECTION_RETENTION_DAYS = 90;

export interface SweepDeps {
  readonly pool: Pool;
  readonly config: Config;
  readonly clock: ClockGate;
  readonly session: GatewaySessionState;
  readonly leadership: GatewayLeadership;
  readonly store: GatewayRegistryStore;
  readonly service: GatewaySessionService;
}

export interface StalenessResult {
  /** Availability edges the transaction inserted, committed or not. */
  readonly transitionsWritten: number;
  /** Liveness entries actually nulled. Zero unless the sweep published. */
  readonly livenessCleared: number;
  /** True only when the post-COMMIT recheck was clean and effects were applied. */
  readonly published: boolean;
  /**
   * True when the durable write committed — including the case where a
   * demotion was detected AFTER the commit, which leaves the honest
   * `went_offline` standing while publishing nothing.
   */
  readonly committed: boolean;
}

export class GatewaySweeps {
  private cadence: NodeJS.Timeout | null = null;
  private retention: NodeJS.Timeout | null = null;

  constructor(private readonly deps: SweepDeps) {}

  /**
   * The leader's cadence: staleness and expiry at the heartbeat cadence,
   * retention daily.
   */
  start(): void {
    if (this.cadence === null) {
      this.cadence = setInterval(() => {
        void this.tick().catch(() => undefined);
      }, this.deps.config.gatewayHeartbeatCadenceMs);
      this.cadence.unref();
    }
    if (this.retention === null) {
      this.retention = setInterval(() => {
        void this.sweepRetention().catch(() => undefined);
      }, this.deps.config.sweepIntervalMs);
      this.retention.unref();
    }
  }

  stop(): void {
    if (this.cadence !== null) {
      clearInterval(this.cadence);
      this.cadence = null;
    }
    if (this.retention !== null) {
      clearInterval(this.retention);
      this.retention = null;
    }
  }

  /** One cadence iteration. Exposed so tests drive it deterministically. */
  async tick(): Promise<void> {
    await this.deps.service.retryDeferredReconciliation();
    if (this.deps.leadership.canServe()) await this.sweepStaleness();
    await this.sweepExpiry();
  }

  /* ---- staleness: leader-only, fenced, L0 -> L1 -> L2 ------------------ */

  /**
   * Write the overdue `went_offline` for any gateway whose live liveness has
   * exceeded the threshold, then null its liveness.
   *
   * `occurred_at` is derived from the recorded liveness wall stamp plus the
   * staleness threshold — the time the outage began — so no live wall-clock
   * read is needed and the row says when the gateway went quiet rather than
   * when the sweeper noticed.
   *
   * Nulling liveness is a STAGED effect, applied only after COMMIT and a clean
   * post-COMMIT recheck. A nulled entry makes the next accepted beat a
   * first-beat, which writes `went_online` against a latest durable
   * `went_offline` — so alternation holds across the sweep boundary.
   */
  async sweepStaleness(): Promise<StalenessResult> {
    const { session, config, clock, leadership } = this.deps;

    /*
     * Held outside the transaction so the sweep can report what it wrote even
     * when the post-COMMIT recheck withholds publication — the fenced runner
     * returns no value in that case, and "the durable edge stands" is exactly
     * the fact this result has to be able to state.
     */
    const written: string[] = [];

    const outcome = await leadership.runFenced<{ written: string[] }>(
      {
        pipeline: 'stalenessSweep',
        takeL0: true,
        takeRegistryLock: true,
        verifyServingGeneration: true,
      },
      async (ctx) => {
        /*
         * The candidate scan happens HERE, under L0 (correction B3, Rev 4.7
         * tester). L0 is what serializes this sweep against heartbeats, so it
         * is also what the staleness verdict must be read under: a scan done
         * before the fence describes a map the body no longer holds, and a
         * beat landing in that gap was swept offline on the strength of a
         * liveness stamp that had already been replaced — a future-dated
         * `went_offline` and a freshly nulled live stamp. The cost is that an
         * idle sweep now takes the fence like every other leader pipeline;
         * that is the price of the verdict meaning what it says.
         */
        const monoNow = clock.monotonicNow();
        const stale: string[] = [];
        for (const gatewayId of session.gatewaysWithLiveness()) {
          const liveness = session.livenessFor(gatewayId);
          if (liveness === null) continue;
          if (monoNow - liveness.monoMs <= config.gatewayStalenessMs) continue;
          stale.push(gatewayId);
        }
        if (stale.length === 0) {
          return { value: { written }, commit: false };
        }

        for (const gatewayId of stale) {
          const liveness = session.livenessFor(gatewayId);
          if (liveness === null) continue;
          const latest = await latestTransition(ctx.client, gatewayId);
          // Uphold the alternation invariant: only an online may go offline.
          if (latest !== 'went_online') {
            written.push(gatewayId);
            continue;
          }
          await insertTransition(ctx.client, {
            gatewayId,
            transition: 'went_offline',
            occurredAt: new Date(liveness.wallMs + config.gatewayStalenessMs),
            lastHeartbeatAt: new Date(liveness.wallMs),
          });
          written.push(gatewayId);
        }
        return {
          value: { written },
          commit: true,
          /*
           * The liveness-null is applied here, under L0, after COMMIT and the
           * clean post-COMMIT recheck. A demotion detected after COMMIT leaves
           * the durable `went_offline` standing and applies none of this.
           */
          publish: () => {
            for (const gatewayId of written) session.nullLiveness(gatewayId);
          },
        };
      },
    );

    if (outcome.status === 'published') {
      return {
        transitionsWritten: outcome.value.written.length,
        livenessCleared: outcome.value.written.length,
        published: true,
        committed: true,
      };
    }
    const committed = outcome.status === 'not_leader' && outcome.committed;
    return {
      transitionsWritten: committed ? written.length : 0,
      livenessCleared: 0,
      published: false,
      committed,
    };
  }

  /* ---- expiry: replica-safe, L2 only, idempotent ---------------------- */

  /**
   * Move past-deadline `awaiting_approval` rows to `expired`.
   *
   * Replica-safe because the state precondition is part of the predicate: a
   * second run finds the rows already `expired` and selects nothing.
   */
  async sweepExpiry(): Promise<number> {
    return this.deps.store.inRegistryTransaction(async (client, now) => {
      const { rows } = await client.query<{ gateway_id: string; key_id: string | null }>(
        `SELECT gateway_id, key_id FROM gateway_current_state
          WHERE state = 'awaiting_approval'
            AND awaiting_approval_expires_at IS NOT NULL
            AND awaiting_approval_expires_at <= $1
          FOR UPDATE`,
        [now],
      );

      for (const row of rows) {
        const seq = await insertRegistryEvent(client, {
          eventType: 'expired',
          gatewayId: row.gateway_id,
          keyId: row.key_id,
          actor: controlPlaneActor('expiry-sweep'),
          attribution: controlPlaneAttribution('expiry-sweep'),
          occurredAt: now,
          payload: { gatewayId: row.gateway_id, reason: 'awaiting_approval_expired' },
        });
        await upsertProjection(client, {
          gatewayId: row.gateway_id,
          state: 'expired',
          keyId: null,
          pubkey: null,
          hostDescriptor: null,
          stateSince: now,
          lastEventSeq: seq,
          awaitingApprovalExpiresAt: null,
        });
      }
      return rows.length;
    });
  }

  /* ---- retention: replica-safe, L2 only, DELETE by age ---------------- */

  /**
   * Delete only the ruled ninety-day classes and the idempotency rows past the
   * retry horizon. Nothing here can touch a >=7-year table.
   *
   * Availability retention deletes ALL rows older than ninety days, with no
   * indefinite latest-row exception (correction C10). Keeping a gateway's last
   * row forever made it an immortal marker; absence now derives offline, which
   * is the same answer without the immortal row.
   */
  async sweepRetention(): Promise<{
    availability: number;
    messageRejections: number;
    idempotency: number;
  }> {
    const { config } = this.deps;
    /*
     * Strictly beyond the daemon's 24 h redeem-retry horizon, so the only
     * replayable successful result outlives every legitimate retry.
     */
    const idempotencyHorizonMs =
      config.gatewayCodeTtlMs + config.gatewayAwaitingApprovalTtlMs + 24 * 60 * 60 * 1_000;

    const client = await this.deps.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [GATEWAY_REGISTRY_LOCK_KEY]);
      void (await transactionNow(client));

      const availability = await client.query(
        `DELETE FROM gateway_availability_events
          WHERE recorded_at < now() - make_interval(days => $1)`,
        [AVAILABILITY_RETENTION_DAYS],
      );
      const messageRejections = await client.query(
        `DELETE FROM gateway_message_rejections
          WHERE minute_bucket < now() - make_interval(days => $1)`,
        [MESSAGE_REJECTION_RETENTION_DAYS],
      );
      const idempotency = await client.query(
        `DELETE FROM gateway_redeem_idempotency
          WHERE recorded_at < now() - make_interval(secs => $1)`,
        [idempotencyHorizonMs / 1_000],
      );

      await client.query('COMMIT');
      return {
        availability: availability.rowCount ?? 0,
        messageRejections: messageRejections.rowCount ?? 0,
        idempotency: idempotency.rowCount ?? 0,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
