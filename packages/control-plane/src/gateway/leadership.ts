/**
 * Fenced leadership: lease, generation, published challenge, and the
 * three-point demotion discipline (contract §7, §13).
 *
 * The hard problem this module exists to solve is not "elect a leader". It is
 * that a process can stop being the leader at any instant, including in the
 * middle of a request it has already begun, and every durable and in-memory
 * effect after that instant must be accounted for. Three mechanisms do that
 * work together, and none of them is sufficient alone:
 *
 *   1. **The middleware pre-filter** rejects obviously unqualified requests
 *      cheaply. It is not the fence and no correctness claim rests on it.
 *   2. **The transaction fence (L1)** takes the lease row `FOR UPDATE` as the
 *      first statement of every leader-dependent transaction, so a request
 *      whose generation has been superseded cannot commit.
 *   3. **The three-point demotion discipline** captures a local
 *      `demotionVersion`, rechecks it immediately before COMMIT, and rechecks
 *      it again after a successful COMMIT before anything is published. The
 *      second recheck is what makes "the durable commit stands but nothing is
 *      published" expressible at all — without it the claim is unimplementable.
 *
 * `runFenced` implements all three once, for all six leader-dependent pipelines
 * (§7 enumerates them: challenge rotation, session-start, heartbeat, room
 * append, promotion reconciliation, staleness sweep). They differ in which
 * locks they take and in one verification detail, not in the discipline — and
 * writing the discipline six times is how five of them would end up subtly
 * different.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Config } from '../config.js';
import { GATEWAY_REGISTRY_LOCK_KEY } from '../migrations.js';
import type { ClockGate } from './clock.js';
import {
  LEASE_FENCE_SQL,
  takeFence,
  verifyFence,
  type LeaseRow,
  type LeaseSnapshot,
} from './fence.js';
import { NO_HOOKS, runHook, type GatewayHooks, type PipelineHooks } from './hooks.js';
import type { GatewaySessionState, StagedEffects } from './session-state.js';

/** Followers attempt acquisition on this cadence, independent of the tick. */
export const FOLLOWER_ACQUISITION_INTERVAL_MS = 5_000;

export type LogFn = (level: 'info' | 'warn' | 'error', at: string, fields?: Record<string, unknown>) => void;

/**
 * Promotion reconciliation, injected rather than imported.
 *
 * It needs the availability store, which needs the registry store, which needs
 * this module for its fence — so importing it here would close a cycle.
 * Injection also makes the leadership suite drivable without a whole registry
 * behind it.
 *
 * Returns whether reconciliation completed with a clean post-COMMIT recheck.
 * `false` means the process was demoted during it, and `servingGeneration` must
 * therefore NOT be set.
 */
export type Reconciler = (context: {
  readonly generation: number;
  readonly snapshot: LeaseSnapshot;
}) => Promise<boolean>;

interface Barrier {
  readonly promise: Promise<void>;
  resolve(): void;
}

function createBarrier(): Barrier {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Which pipeline a fenced transaction belongs to. All six are named. */
export type PipelineName =
  | 'sessionStart'
  | 'heartbeat'
  | 'rotation'
  | 'reconciliation'
  | 'stalenessSweep'
  | 'roomAppend';

export interface FencedOptions {
  readonly pipeline: PipelineName;
  /**
   * Whether to hold L0 across the transaction. True for every pipeline that
   * reads or mutates nonce, cursor or liveness state. False for promotion
   * reconciliation alone, which runs on a provably empty map and reads only
   * durable state (§13).
   */
  readonly takeL0: boolean;
  /** L2, the registry advisory lock. */
  readonly takeRegistryLock: boolean;
  /**
   * False for promotion reconciliation only: it is the act that sets
   * `servingGeneration`, so requiring the field to be set already would make it
   * unrunnable (§7).
   */
  readonly verifyServingGeneration: boolean;
}

/** What a rotation attempt reports. `rotated: false` means nothing was retired. */
export interface RotationOutcome {
  readonly rotated: boolean;
  readonly challenge: string | null;
}

export interface FencedBodyContext {
  readonly client: PoolClient;
  readonly leaseRow: LeaseRow;
  readonly snapshot: LeaseSnapshot;
  readonly capturedDemotionVersion: number;
}

/**
 * What a pipeline body decided.
 *
 * `commit: false` is a deliberate refusal — a verdict the body reached that
 * needs no durable write — and rolls the transaction back with the value
 * intact. It is not an error path.
 */
export interface FencedBodyOutcome<T> {
  readonly value: T;
  readonly commit: boolean;
  readonly staged?: StagedEffects;
  /**
   * Publication that is not a staged nonce, cursor or liveness change — the
   * challenge-epoch swap, which rotation performs under L0 after a successful
   * COMMIT and a clean post-COMMIT recheck. Synchronous by construction: a
   * publication step that awaited would reopen the gap L0 exists to close.
   */
  readonly publish?: () => void;
}

export type FencedResult<T> =
  | { readonly status: 'published'; readonly value: T }
  | { readonly status: 'rolled_back'; readonly value: T }
  | {
      readonly status: 'not_leader';
      readonly at: 'fence' | 'pre_commit' | 'post_commit';
      /** True only for a post-COMMIT detection: the durable write stands. */
      readonly committed: boolean;
      readonly refusal: string;
    }
  | { readonly status: 'commit_failed'; readonly message: string };

export interface LeadershipDeps {
  readonly pool: Pool;
  readonly config: Config;
  readonly clock: ClockGate;
  readonly session: GatewaySessionState;
  readonly reconciler: Reconciler;
  readonly hooks?: GatewayHooks;
  readonly log?: LogFn;
}

export class GatewayLeadership {
  /**
   * This process's owner id, minted once and kept for the process's whole life.
   *
   * It deliberately survives demotion and reacquisition, which is exactly why
   * the rotation UPDATE binds `generation` as well as `owner_id`: a delayed task
   * from an earlier generation of this same process would otherwise match on
   * owner alone and rotate a later generation's challenge (correction B2).
   */
  readonly ownerId = randomUUID();

  private readonly pool: Pool;
  private readonly config: Config;
  private readonly clock: ClockGate;
  private readonly session: GatewaySessionState;
  private readonly reconciler: Reconciler;
  private readonly hooks: GatewayHooks;
  private readonly logFn: LogFn;

  private leader = false;
  private serving: number | null = null;
  private generation = 0;
  private demotionVersionCounter = 0;
  private cleanupPending = false;
  private activeBarrier: Barrier | null = null;
  private phase2InFlight = false;
  private lastRenewalOkAt = Number.NEGATIVE_INFINITY;
  private lastAcquisitionAttemptAt = Number.NEGATIVE_INFINITY;
  private lastRotationAt = Number.NEGATIVE_INFINITY;
  private acquisitionInFlight: Promise<void> | null = null;
  private rotationInFlight: Promise<unknown> | null = null;
  private supervisor: NodeJS.Timeout | null = null;
  private stopped = false;

  /** Retained so a deterministic test can await the work a tick started. */
  phase2Run: Promise<void> = Promise.resolve();

  constructor(deps: LeadershipDeps) {
    this.pool = deps.pool;
    this.config = deps.config;
    this.clock = deps.clock;
    this.session = deps.session;
    this.reconciler = deps.reconciler;
    this.hooks = deps.hooks ?? NO_HOOKS;
    this.logFn =
      deps.log ??
      ((level, at, fields) => {
        const line = JSON.stringify({ level, at, ...fields });
        if (level === 'info') console.log(line);
        else console.error(line);
      });
  }

  /* ---- observable state ------------------------------------------------ */

  get isLeader(): boolean {
    return this.leader;
  }

  get currentGeneration(): number {
    return this.generation;
  }

  get servingGeneration(): number | null {
    return this.serving;
  }

  get demotionVersion(): number {
    return this.demotionVersionCounter;
  }

  get demotionCleanupPending(): boolean {
    return this.cleanupPending;
  }

  /** The barrier a waiter would join, or null when no cleanup is outstanding. */
  get cleanupBarrier(): Promise<void> | null {
    return this.activeBarrier?.promise ?? null;
  }

  get acquisitionAttempt(): Promise<void> | null {
    return this.acquisitionInFlight;
  }

  /** The rotation a tick started, if one is running. Mirrors the accessor above. */
  get rotationAttempt(): Promise<unknown> | null {
    return this.rotationInFlight;
  }

  /** The snapshot a leader-dependent request captures at handler entry. */
  snapshot(): LeaseSnapshot {
    return { ownerId: this.ownerId, generation: this.generation };
  }

  /**
   * The middleware's condition. Cheap, and deliberately not trusted: it is a
   * pre-filter, and the fence is the control.
   */
  canServe(): boolean {
    return (
      this.leader &&
      this.serving === this.generation &&
      this.clock.monotonicNow() - this.lastRenewalOkAt <= this.config.leaderSafetyDeadlineMs
    );
  }

  requireLeader() {
    return (
      _req: unknown,
      res: { status(code: number): { json(body: unknown): void } },
      next: () => void,
    ): void => {
      if (!this.canServe()) {
        res.status(503).json({ error: 'not_leader' });
        return;
      }
      next();
    };
  }

  /* ---- the supervisor -------------------------------------------------- */

  /**
   * One interval, started at boot, running for the process's whole life. It is
   * never torn down on demotion — which is what makes the timers survive a
   * later promotion rather than needing to be rebuilt by it.
   */
  start(): void {
    if (this.supervisor !== null) return;
    this.supervisor = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        this.logFn('error', 'gateway.leadership.tick_failed', { message: describe(error) });
      });
    }, this.config.leaderHeartbeatMs);
    this.supervisor.unref();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.supervisor !== null) {
      clearInterval(this.supervisor);
      this.supervisor = null;
    }
    await this.phase2Run.catch(() => undefined);
    await this.acquisitionInFlight?.catch(() => undefined);
    await this.rotationInFlight?.catch(() => undefined);
  }

  /**
   * One supervisor iteration.
   *
   * Nothing here awaits a barrier or L0. A supervisor that could block would
   * stop renewing the lease while it waited, and the thing it would be waiting
   * for is a request that is only holding a lock because this process is still
   * the leader. Phase 2, acquisition and rotation are therefore started and
   * their promises retained, not awaited.
   */
  async tick(): Promise<void> {
    if (this.stopped) return;
    this.clock.sample();

    if (this.cleanupPending && !this.phase2InFlight) {
      this.phase2Run = this.runPhase2();
    }

    if (this.leader) {
      if (this.clock.monotonicNow() - this.lastRenewalOkAt > this.config.leaderSafetyDeadlineMs) {
        this.demote('safety_deadline_exceeded');
        return;
      }
      await this.renew();
      if (this.leader && this.serving === this.generation) this.maybeRotate();
      return;
    }

    if (
      this.clock.monotonicNow() - this.lastAcquisitionAttemptAt >=
      FOLLOWER_ACQUISITION_INTERVAL_MS
    ) {
      this.lastAcquisitionAttemptAt = this.clock.monotonicNow();
      void this.attemptAcquisition().catch((error: unknown) => {
        this.logFn('error', 'gateway.leadership.acquisition_failed', { message: describe(error) });
      });
    }
  }

  /* ---- demotion: phase 1, synchronous -------------------------------- */

  /**
   * Phase 1. Synchronous, without waiting for L0, in this exact order.
   *
   * The order is the point (correction T5). An implementation that waited for
   * L0 before flipping the flags would leave `isLeader` true while it waited,
   * and an in-flight handler that reached its fence in that window would pass
   * a check that was already false — and commit after a renewal failure.
   * Flipping first bars new admissions immediately; the map clear can take its
   * time behind L0 because nothing may be admitted while it is outstanding.
   */
  demote(reason: string): void {
    this.leader = false;
    this.serving = null;
    this.demotionVersionCounter += 1;
    const alreadyPending = this.cleanupPending;
    this.cleanupPending = true;
    /*
     * Single-flight (correction, Rev 4.6 blocker 2). Only the FIRST trigger
     * creates the barrier. "Create or replace" was the earlier wording and it
     * stranded waiters: a second demotion during pending cleanup replaced B1
     * with B2, phase 2 resolved B2, and whoever was waiting on B1 never woke.
     * Later triggers still flip the flags and increment the version — they just
     * coalesce onto the one barrier that already exists.
     */
    if (!alreadyPending) this.activeBarrier = createBarrier();

    this.logFn('warn', 'gateway.leadership.demoted', {
      reason,
      demotionVersion: this.demotionVersionCounter,
      coalesced: alreadyPending,
    });
  }

  /* ---- demotion: phase 2, single-flight executor ---------------------- */

  private async runPhase2(): Promise<void> {
    if (!this.cleanupPending || this.phase2InFlight) return;
    this.phase2InFlight = true;
    try {
      await runHook(this.hooks.phase2?.beforeL0);

      const release = await this.session.lock.acquire();
      try {
        await runHook(this.hooks.phase2?.afterL0);
        this.session.clearAll();
      } finally {
        release();
      }

      await runHook(this.hooks.phase2?.beforeFinalize);

      /*
       * ---- indivisible finalization (correction T1) --------------------
       *
       * One synchronous, no-await, non-fallible continuation: clear the flag,
       * detach the captured barrier, resolve it, return. There is no
       * asynchronous boundary inside this block, so no execution can fail
       * between the flag clear and the resolution, and no other path clears the
       * flag or resolves the barrier.
       *
       * The earlier order resolved the barrier first and cleared the flag
       * after, leaving a window between them that an idempotent-re-run note
       * papered over rather than removed.
       */
      const barrier = this.activeBarrier;
      this.cleanupPending = false;
      this.activeBarrier = null;
      if (barrier !== null) barrier.resolve();
      /* ---- end of the indivisible block -------------------------------- */
    } catch (error) {
      /*
       * Fail-closed. Every failure site is BEFORE the finalization block, so
       * `demotionCleanupPending` is still true, the barrier is still
       * unresolved, reacquisition is still blocked, and the next supervisor
       * tick retries phase 2. Nothing is half-finalized because nothing between
       * the flag and the barrier can be interrupted.
       */
      this.logFn('error', 'gateway.leadership.phase2_failed', { message: describe(error) });
    } finally {
      this.phase2InFlight = false;
    }
  }

  /**
   * The rechecking wait loop.
   *
   * Waking on a barrier is not proof that cleanup is complete: a new demotion
   * cycle can begin between the resolution and the waiter's resumption. So the
   * flag is re-read after every wake, and any new cycle's barrier is awaited
   * too, until a recheck observes no cleanup outstanding.
   */
  private async waitForCleanupComplete(): Promise<void> {
    for (;;) {
      if (!this.cleanupPending) return;
      const barrier = this.activeBarrier;
      /*
       * `cleanupPending` implies a barrier by construction — phase 1 creates
       * one whenever it flips the flag. Returning rather than spinning is the
       * safe behaviour if that invariant were ever broken: the acquisition's
       * own post-SQL recheck still refuses to publish.
       */
      if (barrier === null) return;
      await barrier.promise;
    }
  }

  /* ---- acquisition: one process-wide single-flight attempt ------------ */

  /**
   * Start the acquisition attempt, or join the one already running.
   *
   * Single-flight across the WHOLE pipeline (correction, Rev 4.7 B1), not just
   * the SQL: barrier loop, acquisition UPDATE, post-return validation,
   * conditional release, reconciliation, and `servingGeneration` publication
   * are one attempt. Coalescing only at the query would not be enough — the
   * acquire predicate's `owner_id = $me` limb lets a second same-process
   * attempt succeed, so two ticks could each acquire, advancing the generation
   * twice and racing each other's reconciliation and publication.
   */
  attemptAcquisition(): Promise<void> {
    const existing = this.acquisitionInFlight;
    if (existing !== null) return existing;

    let settle!: () => void;
    const attempt = new Promise<void>((resolve) => {
      settle = resolve;
    });
    this.acquisitionInFlight = attempt;

    void this.runAcquisition()
      .catch((error: unknown) => {
        this.logFn('error', 'gateway.leadership.acquisition_error', { message: describe(error) });
      })
      .finally(() => {
        // Cleared only here — after a terminal outcome, never mid-pipeline.
        this.acquisitionInFlight = null;
        settle();
      });

    return attempt;
  }

  private async runAcquisition(): Promise<void> {
    for (;;) {
      if (this.stopped) return;

      // 1. Wait for cleanup, rechecking after every barrier resolution.
      await this.waitForCleanupComplete();

      // 2. Capture, after the final recheck and immediately before the SQL.
      const captured = this.demotionVersionCounter;

      // 3. Issue the acquisition UPDATE exactly once per iteration.
      const acquired = await this.acquireLease();
      await runHook(this.hooks.acquisition?.afterSql);
      if (acquired === null) return; // another process holds it; terminal.

      // 4. Recheck before publishing anything at all.
      const invalidated = this.demotionVersionCounter !== captured || this.cleanupPending;
      if (invalidated) {
        // 5. Publish nothing; release ONLY the exact {owner, generation} this
        // attempt acquired, so a stale attempt can never release a successor's
        // lease. A release failure keeps the attempt fail-closed: still
        // in-flight, so no parallel acquisition, and back to the wait loop.
        await runHook(this.hooks.acquisition?.beforeRelease);
        try {
          await runHook(this.hooks.acquisition?.releaseFault);
          await this.releaseExact(acquired.generation);
        } catch (error) {
          this.logFn('error', 'gateway.leadership.release_failed', {
            message: describe(error),
            generation: acquired.generation,
          });
        }
        continue;
      }

      // 6. Valid. Publish local leadership, then reconcile, then serve.
      this.leader = true;
      this.generation = acquired.generation;
      this.lastRenewalOkAt = this.clock.monotonicNow();
      this.lastRotationAt = this.clock.monotonicNow();

      /*
       * Adoption, reconciliation, and serving publication are ONE RECOVERY
       * UNIT (correction T2, Rev 4.7 tester). Before this correction a throw
       * anywhere past this point — or a withheld serving verdict — escaped the
       * attempt with `leader = true` and `serving = null`: the supervisor's
       * leader branch only renews, so the process held the lease and never
       * served again. Any failure now ABANDONS the acquired leadership instead
       * — demoted locally, the exact acquired generation released — so this
       * process or another can retry through the follower branch. The throw is
       * re-raised after the abandonment so the attempt's own logging still
       * sees it; the abandonment is what makes it non-terminal for the process.
       */
      try {
        /*
         * Adopt the epoch the acquire statement minted. This is not the
         * "acquisition touching session state" §13 forbids: that rule is about
         * lock ordering — never wait for L0 while holding L1 — and the
         * acquisition UPDATE is a single autocommit statement whose row lock
         * is long released here. The map is provably empty, because cleanup
         * completed before the SQL ran.
         */
        await this.session.lock.withLock(async () => {
          this.session.adoptEpoch({
            generation: acquired.generation,
            challenge: acquired.challenge,
          });
        });

        const reconciled = await this.reconciler({
          generation: acquired.generation,
          snapshot: { ownerId: this.ownerId, generation: acquired.generation },
        });

        await runHook(this.hooks.acquisition?.beforeServingPublication);

        /*
         * `servingGeneration` is set only after reconciliation completed with a
         * clean post-COMMIT recheck. A demoted process must never resurrect a
         * serving flag through a reconciliation that was demoted mid-flight.
         */
        if (!reconciled || this.demotionVersionCounter !== captured || !this.leader) {
          this.logFn('warn', 'gateway.leadership.serving_withheld', {
            reconciled,
            generation: acquired.generation,
          });
          await this.abandonAcquiredLeadership(acquired.generation, 'serving_withheld');
          return;
        }

        this.serving = acquired.generation;
        this.logFn('info', 'gateway.leadership.serving', { generation: acquired.generation });
        return;
      } catch (error) {
        await this.abandonAcquiredLeadership(acquired.generation, describe(error));
        throw error;
      }
    }
  }

  /**
   * Undo a step-6 leadership publication whose recovery unit failed.
   *
   * Demote first — synchronously, so `isLeader` is false before anything is
   * awaited — then release exactly the generation this attempt acquired, so a
   * retry by this process or a takeover by another is possible immediately
   * rather than after the lease TTL. A release failure is logged and left to
   * the TTL; the local demotion has already happened, which is the part this
   * process controls.
   */
  private async abandonAcquiredLeadership(generation: number, reason: string): Promise<void> {
    this.demote(`acquisition_abandoned:${reason}`);
    try {
      await this.releaseExact(generation);
    } catch (error) {
      this.logFn('error', 'gateway.leadership.abandon_release_failed', {
        message: describe(error),
        generation,
      });
    }
  }

  /**
   * The acquire statement. A fresh >=128-bit challenge is minted in the same
   * statement as the generation increment, so a new generation can never serve
   * an old challenge for even one read.
   */
  private async acquireLease(): Promise<{ generation: number; challenge: string } | null> {
    const challenge = randomBytes(32).toString('hex');
    const ttlSeconds = this.config.leaderLeaseTtlMs / 1_000;

    const { rows } = await this.pool.query<{ generation: string; challenge: string }>(
      `UPDATE control_plane_lease
          SET owner_id = $1, generation = generation + 1, heartbeat_at = now(),
              challenge = $2, challenge_published_at = now()
        WHERE id = 1
          AND (owner_id = $1 OR owner_id IS NULL
               OR heartbeat_at < now() - make_interval(secs => $3))
        RETURNING generation, challenge`,
      [this.ownerId, challenge, ttlSeconds],
    );

    const row = rows[0];
    if (row === undefined) return null;
    return { generation: Number(row.generation), challenge: row.challenge };
  }

  /** Release exactly what one attempt acquired. Both members are bound. */
  private async releaseExact(generation: number): Promise<void> {
    await this.pool.query(
      `UPDATE control_plane_lease SET owner_id = NULL, heartbeat_at = NULL
        WHERE id = 1 AND owner_id = $1 AND generation = $2`,
      [this.ownerId, generation],
    );
  }

  /**
   * Graceful release on the SIGTERM path. This accelerates takeover; no
   * correctness claim depends on it, because the TTL alone is enough.
   */
  async releaseGracefully(): Promise<void> {
    this.demote('graceful_release');
    await this.pool
      .query(
        'UPDATE control_plane_lease SET owner_id = NULL, heartbeat_at = NULL WHERE id = 1 AND owner_id = $1',
        [this.ownerId],
      )
      .catch((error: unknown) => {
        this.logFn('warn', 'gateway.leadership.graceful_release_failed', { message: describe(error) });
      });
  }

  private async renew(): Promise<void> {
    try {
      const { rows } = await this.pool.query<{ generation: string }>(
        'UPDATE control_plane_lease SET heartbeat_at = now() WHERE id = 1 AND owner_id = $1 RETURNING generation',
        [this.ownerId],
      );
      const row = rows[0];
      if (row === undefined) {
        this.demote('renewal_returned_zero_rows');
        return;
      }
      if (Number(row.generation) !== this.generation) {
        this.demote('generation_changed_under_us');
        return;
      }
      this.lastRenewalOkAt = this.clock.monotonicNow();
    } catch (error) {
      /*
       * A query error or a timeout is treated exactly as a lost lease. The one
       * thing a leader may never do on an ambiguous renewal is assume it is
       * still the leader.
       */
      this.logFn('error', 'gateway.leadership.renewal_failed', { message: describe(error) });
      this.demote('renewal_failed');
    }
  }

  /* ---- challenge rotation --------------------------------------------- */

  private maybeRotate(): void {
    if (this.rotationInFlight !== null) return;
    if (this.clock.monotonicNow() - this.lastRotationAt < this.config.challengeRotationMs) return;
    /*
     * (correction 5, finding #1) The interval is consumed only by a rotation
     * that PUBLISHED. The derived challenge-freshness deadline
     * (`challengeRotationMs + 2 × leaderHeartbeatMs`) budgets failed rotations
     * to be retried within a couple of supervisor heartbeats — stamping
     * `lastRotationAt` at dispatch made a failed COMMIT hold the challenge
     * stale for a full interval, past the deadline, where readers fail closed
     * on `challenge_overdue`. A failure leaves the old stamp in place, so the
     * next tick dispatches again; re-acquisition resets the stamp regardless.
     */
    const dispatchedAt = this.clock.monotonicNow();
    const run = this.rotateChallenge().finally(() => {
      this.rotationInFlight = null;
    });
    this.rotationInFlight = run;
    void run
      .then((outcome: FencedResult<RotationOutcome>) => {
        if (outcome.status === 'published') this.lastRotationAt = dispatchedAt;
      })
      .catch((error: unknown) => {
        this.logFn('error', 'gateway.leadership.rotation_failed', { message: describe(error) });
      });
  }

  /**
   * Rotate the published challenge within the current generation.
   *
   * The whole thirteen-step sequence of §7, expressed through `runFenced` so
   * the capture and both rechecks are the same ones every other pipeline uses.
   *
   * The generation predicate on the UPDATE is not redundant with the fence. A
   * process owner id survives demotion and reacquisition, so a rotation task
   * scheduled under generation N and delayed past a reacquisition to N+2 would
   * match `owner_id = $me` perfectly. Binding `generation = $expected` is what
   * makes it write zero rows instead.
   */
  async rotateChallenge(): Promise<FencedResult<RotationOutcome>> {
    const snapshot = this.snapshot();
    const fresh = randomBytes(32).toString('hex');

    return this.runFenced<RotationOutcome>(
      {
        pipeline: 'rotation',
        takeL0: true,
        takeRegistryLock: false,
        verifyServingGeneration: true,
      },
      async (ctx) => {
        const { rows } = await ctx.client.query<{ generation: string; challenge: string }>(
          `UPDATE control_plane_lease
              SET challenge = $1, challenge_published_at = now()
            WHERE id = 1 AND owner_id = $2 AND generation = $3
            RETURNING generation, challenge, challenge_published_at`,
          [fresh, this.ownerId, snapshot.generation],
        );

        // Exactly one row, or the rotation did not happen and nothing is retired.
        if (rows.length !== 1) {
          return { value: { rotated: false, challenge: null }, commit: false };
        }

        const generation = Number(rows[0]!.generation);
        return {
          value: { rotated: true, challenge: fresh },
          commit: true,
          /*
           * The epoch swap, and the only other place it happens besides
           * acquisition. Synchronous, under L0, after a successful COMMIT and a
           * clean post-COMMIT recheck — so a failed or demoted rotation leaves
           * the old challenge and its nonce store serving, retiring nothing.
           */
          publish: () => {
            this.session.adoptEpoch({ generation, challenge: fresh });
          },
        };
      },
    );
  }

  /* ---- the fenced-transaction machinery ------------------------------- */

  private hooksFor(pipeline: PipelineName): PipelineHooks | undefined {
    switch (pipeline) {
      case 'sessionStart':
        return this.hooks.sessionStart;
      case 'heartbeat':
        return this.hooks.heartbeat;
      case 'rotation':
        return this.hooks.rotation;
      case 'reconciliation':
        return this.hooks.reconciliation;
      case 'stalenessSweep':
        return this.hooks.stalenessSweep;
      case 'roomAppend':
        return this.hooks.roomAppend;
      default:
        return undefined;
    }
  }

  /**
   * Run one leader-dependent transaction under the full discipline.
   *
   * Order, and why each step is where it is:
   *
   *   L0 (if the pipeline touches the live map) is taken BEFORE the capture and
   *   before BEGIN, and released only after publication — so no concurrent
   *   request can slip into the gap between this one's COMMIT and its
   *   publication and observe a nonce or a sequence as absent.
   *
   *   The demotion version is captured at L0 acquisition, or — for the one
   *   L0-exempt pipeline — immediately before BEGIN.
   *
   *   The fence is the FIRST statement inside the transaction, before the
   *   registry lock and before any body work, so a refusal costs nothing and
   *   writes nothing.
   *
   *   The pre-COMMIT recheck rolls back with zero durable writes. The
   *   post-COMMIT recheck cannot roll anything back — the commit stands — so it
   *   withholds publication instead and answers `not_leader`.
   */
  async runFenced<T>(
    options: FencedOptions,
    body: (ctx: FencedBodyContext) => Promise<FencedBodyOutcome<T>>,
  ): Promise<FencedResult<T>> {
    const hooks = this.hooksFor(options.pipeline);
    const snapshot = this.snapshot();
    const releaseL0 = options.takeL0 ? await this.session.lock.acquire() : null;

    // Three-point discipline, checkpoint 1: capture.
    const captured = this.demotionVersionCounter;

    try {
      await runHook(hooks?.beforeTransaction);

      const client = await this.pool.connect();
      let committed = false;
      try {
        await client.query('BEGIN');

        // L1 — the fence, first statement, always.
        const leaseRow = await takeFence(client);
        const refusal = verifyFence({
          row: leaseRow,
          snapshot,
          isLeader: this.leader,
          servingGeneration: this.serving,
          verifyServingGeneration: options.verifyServingGeneration,
          monotonicNow: this.clock.monotonicNow(),
          lastRenewalOkAt: this.lastRenewalOkAt,
          safetyDeadlineMs: this.config.leaderSafetyDeadlineMs,
        });
        if (refusal !== null) {
          await client.query('ROLLBACK');
          return { status: 'not_leader', at: 'fence', committed: false, refusal };
        }

        await runHook(hooks?.afterFence);

        // L2 — the registry advisory lock, transaction-scoped.
        if (options.takeRegistryLock) {
          await client.query('SELECT pg_advisory_xact_lock($1)', [GATEWAY_REGISTRY_LOCK_KEY]);
        }

        const outcome = await body({
          client,
          leaseRow,
          snapshot,
          capturedDemotionVersion: captured,
        });

        if (!outcome.commit) {
          await client.query('ROLLBACK');
          return { status: 'rolled_back', value: outcome.value };
        }

        await runHook(hooks?.beforePreCommitRecheck);

        // Checkpoint 2: recheck immediately before COMMIT.
        if (this.demotionVersionCounter !== captured) {
          await client.query('ROLLBACK');
          return {
            status: 'not_leader',
            at: 'pre_commit',
            committed: false,
            refusal: 'demoted_before_commit',
          };
        }

        await runHook(hooks?.beforeCommit);

        try {
          // Stands in for a failed COMMIT; see `PipelineHooks.commitFault`.
          await runHook(hooks?.commitFault);
          await client.query('COMMIT');
          committed = true;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          return { status: 'commit_failed', message: describe(error) };
        }

        await runHook(hooks?.afterCommit);

        // Checkpoint 3: recheck after a successful COMMIT, before publication.
        if (this.demotionVersionCounter !== captured) {
          return {
            status: 'not_leader',
            at: 'post_commit',
            committed: true,
            refusal: 'demoted_after_commit',
          };
        }

        await runHook(hooks?.beforePublish);

        if (outcome.staged !== undefined) this.session.publish(outcome.staged);
        if (outcome.publish !== undefined) outcome.publish();

        return { status: 'published', value: outcome.value };
      } catch (error) {
        if (!committed) await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } finally {
      releaseL0?.();
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { LEASE_FENCE_SQL };
