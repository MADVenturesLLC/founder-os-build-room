/**
 * The `gatewayOnline` derivation and the fence that room append runs under
 * (contract §10, §13).
 *
 * The overlay is DERIVED, never believed. A caller can assert `gatewayOnline`
 * in the facts it submits, and that assertion is overwritten here — because the
 * guard it feeds decides whether work may be dispatched to a machine, and a
 * caller asserting that a machine is reachable is a caller marking its own
 * homework.
 *
 * The derivation is fail-closed at every step: no enrolled gateway, no
 * liveness, stale liveness, or a monotonic source we cannot trust all yield
 * offline. Being wrong in that direction pauses dispatch; being wrong in the
 * other direction dispatches into a void.
 */

import type { PoolClient } from 'pg';
import type { Config } from '../config.js';
import type { ClockGate } from './clock.js';
import type { GatewayLeadership } from './leadership.js';
import type { RoomAppendFence, RoomAppendOutcome } from '../store.js';
import type { GatewaySessionState } from './session-state.js';

export class GatewayRoomAppendFence implements RoomAppendFence {
  constructor(
    private readonly deps: {
      readonly config: Config;
      readonly clock: ClockGate;
      readonly session: GatewaySessionState;
      readonly leadership: GatewayLeadership;
    },
  ) {}

  /**
   * Is any gateway enrolled, and is its liveness fresh?
   *
   * Read inside the caller's fenced transaction, under the registry advisory
   * lock, so heartbeat acceptance and revocation cannot interleave with it —
   * all three serialize on L2 under the global lock order.
   */
  async deriveGatewayOnline(client: PoolClient): Promise<boolean> {
    const { rows } = await client.query<{ gateway_id: string }>(
      'SELECT gateway_id FROM gateway_current_state WHERE is_currently_enrolled',
    );
    const row = rows[0];
    if (row === undefined) return false;

    const liveness = this.deps.session.livenessFor(row.gateway_id);
    // Absent liveness is offline: no session yet, no accepted beat yet, or a
    // new leader's empty map. Preserved-but-stale liveness is offline too, even
    // when no `went_offline` row has been written yet.
    if (liveness === null) return false;

    if (!this.deps.clock.monotonicTrustworthy) return false;

    const elapsed = this.deps.clock.monotonicNow() - liveness.monoMs;
    return elapsed <= this.deps.config.gatewayStalenessMs;
  }

  /**
   * Run a room append under L0 -> L1 -> L2. The body takes L3 itself, which
   * keeps the room row lock where it has always been and preserves the global
   * lock order.
   */
  async runRoomAppend<T>(
    body: (
      client: PoolClient,
      deriveGatewayOnline: () => Promise<boolean>,
    ) => Promise<{ readonly value: T; readonly commit: boolean }>,
  ): Promise<RoomAppendOutcome<T>> {
    const outcome = await this.deps.leadership.runFenced<T>(
      { pipeline: 'roomAppend', takeL0: true, takeRegistryLock: true, verifyServingGeneration: true },
      async (ctx) => {
        const result = await body(ctx.client, () => this.deriveGatewayOnline(ctx.client));
        return { value: result.value, commit: result.commit };
      },
    );

    if (outcome.status === 'published' || outcome.status === 'rolled_back') {
      return { status: 'ok', value: outcome.value };
    }
    if (outcome.status === 'not_leader') {
      /*
       * A post-COMMIT detection means the durable append STANDS and the caller
       * is told 503 anyway. That is deliberate: the write was legitimately
       * fenced when it committed, and un-writing it is not available — but
       * answering "accepted" after leadership lapsed would let a caller believe
       * a decision was executed by a process that no longer speaks for anyone.
       */
      return { status: 'not_leader', committed: outcome.committed };
    }
    return { status: 'commit_failed', message: outcome.message };
  }
}
