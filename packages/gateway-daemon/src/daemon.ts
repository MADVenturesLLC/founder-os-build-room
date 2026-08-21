/**
 * The daemon: timers, shutdown, and the promotion handoff (contract §15).
 *
 * Timers are per-lane cadence timers, the IPC listener, and the re-enrol retry
 * backoff. Shutdown stops the timers, closes and unlinks the socket, and exits
 * — the daemon holds no server-side lease to release, so there is nothing else
 * it owes anyone on the way out.
 *
 * The promotion handoff is the one place the two lanes touch, and it happens in
 * exactly one direction and only after a committed enrolled response: staging
 * custody is promoted per the four ruled steps, the promoted identity becomes
 * the primary lane, and the staging lane returns to `INACTIVE`.
 */

import type { Clock } from '../../gateway-protocol/src/index.js';
import type { Custody } from './custody.js';
import { StagingLockBusy, acquireStagingLock, type StagingOperation } from './staging-lock.js';
import type { ControlPlaneClient } from './client.js';
import { PrimaryLane, StagingLane, type StagingOutcome } from './lanes.js';
import type { GatewayPaths } from './paths.js';
import { RingBuffer } from './ring-buffer.js';
import { IpcServer } from './ipc.js';
import { GatewayStateStore, type GatewayState } from './state.js';
import { privateKeyFromSecret, publicMembersOf, type GatewayIdentity } from './signing.js';

export interface GatewayDaemonDeps {
  readonly paths: GatewayPaths;
  readonly clock: Clock;
  readonly custody: Custody;
  readonly client: ControlPlaneClient;
  readonly heartbeatCadenceMs: number;
}

export class GatewayDaemon {
  readonly ring = new RingBuffer();
  readonly primary: PrimaryLane;
  readonly staging: StagingLane;
  private readonly state: GatewayStateStore;
  private readonly ipc: IpcServer;
  private cadence: NodeJS.Timeout | null = null;
  private stopping = false;
  /** The tick currently in flight, if any (correction B6, Rev 4.7 tester). */
  private tickInFlight: Promise<void> | null = null;

  constructor(private readonly deps: GatewayDaemonDeps) {
    this.primary = new PrimaryLane(deps.client, deps.clock, null);
    this.staging = new StagingLane(deps.client, deps.clock);
    this.state = new GatewayStateStore(deps.paths);
    this.ipc = new IpcServer(deps.paths, {
      status: () => ({
        primary: { lane: this.primary.laneState, epoch: this.primary.currentEpoch !== null },
        staging: { lane: this.staging.laneState },
      }),
      ring: () => this.ring,
    });
  }

  /** Load persisted state and adopt the primary identity from custody. */
  async boot(): Promise<void> {
    const persisted = await this.state.read();

    const primarySecret = await this.custodyReadQuietly('primary');
    if (primarySecret !== null && persisted.primary.identity.gatewayId !== null) {
      this.adoptRecoverably('primary', persisted.primary.identity.gatewayId, primarySecret);
    }

    if (persisted.staging.lane !== 'INACTIVE') {
      this.staging.resume(persisted.staging.lane, persisted.staging.idempotencyKey);
      const stagingSecret = await this.custodyReadQuietly('staging');
      if (stagingSecret !== null && persisted.staging.identity.gatewayId !== null) {
        this.adoptRecoverably('staging', persisted.staging.identity.gatewayId, stagingSecret);
      }
    }

    // An interrupted lane boundary completes BEFORE the daemon serves or ticks
    // (correction B5, Rev 4.7 tester) — otherwise stale persisted state blocks
    // the enrolment guard forever.
    await this.completeInterruptedStaging(persisted);

    await this.ipc.start();
    this.log('info', 'daemon.booted', {
      primary: this.primary.laneState,
      staging: this.staging.laneState,
    });
  }

  start(): void {
    if (this.cadence !== null) return;
    this.cadence = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        this.log('error', 'daemon.tick_failed', { message: describe(error) });
      });
    }, this.deps.heartbeatCadenceMs);
    this.cadence.unref();
  }

  /**
   * One cadence iteration for both lanes. Exposed so suites drive it directly.
   *
   * SINGLE FLIGHT (correction B6, Rev 4.7 tester): a cadence fire while a tick
   * is still waiting on the network joins that tick instead of starting
   * another. Without this, one slow control plane made every subsequent fire
   * stack a fresh request behind the hung one — an unbounded pile, and a probe
   * cadence that could never catch up.
   */
  tick(): Promise<void> {
    if (this.tickInFlight !== null) return this.tickInFlight;
    this.tickInFlight = this.runTick().finally(() => {
      this.tickInFlight = null;
    });
    return this.tickInFlight;
  }

  private async runTick(): Promise<void> {
    if (this.stopping) return;

    const primaryVerdict = await this.primary.step();
    if (primaryVerdict !== null) this.log('info', 'primary.step', { verdict: primaryVerdict });

    const stagingOutcome = await this.staging.probe();
    if (stagingOutcome.disposition !== null) {
      this.log('info', 'staging.step', { verdict: stagingOutcome.disposition });
      await this.applyStagingOutcome(stagingOutcome);
    }
  }

  /**
   * Apply a disposition-bearing probe outcome under the §14 staging lock
   * (correction 5, finding #15).
   *
   * §14 rules the lock over "session-probe state transitions … and every
   * staging-related `state.json` write": the durable marker and any custody
   * mutation the verdict orders are ONE critical section, in the ruled order —
   * verdict first, custody second, completion third (correction B5's recoverable
   * boundaries, unchanged). The network exchange stays outside the lock; only
   * the writes are inside. A busy lock means another process owns staging right
   * now: the disposition is withheld, the in-memory lane is re-derived from the
   * persisted state, and the next tick retries — nothing is lost, nothing is
   * fabricated.
   */
  private async applyStagingOutcome(outcome: StagingOutcome): Promise<void> {
    const operation: StagingOperation = outcome.deleteStaging
      ? 'staging-delete'
      : outcome.promote
        ? 'promotion'
        : 'staging-probe';
    try {
      await this.underStagingLock(operation, async () => {
        await this.persistStagingOutcome(outcome);
        if (outcome.deleteStaging) {
          await this.deps.custody.delete('staging');
          await this.clearStagingState();
        } else if (outcome.promote) {
          await this.promoteLocked();
        }
      });
    } catch (error) {
      if (!(error instanceof StagingLockBusy)) throw error;
      this.log('warn', 'staging.lock_busy_outcome_withheld', { operation });
      const persisted = await this.state.read();
      this.staging.resume(persisted.staging.lane, persisted.staging.idempotencyKey);
      return;
    }
    if (outcome.deleteStaging) {
      this.staging.completePromotion();
      this.log('warn', 'staging.terminal_refusal', { lane: outcome.state });
      return;
    }
    if (outcome.promote) {
      this.staging.completePromotion();
      this.log('info', 'staging.promoted', {});
    }
  }

  /**
   * Promotion, under the staging lock, after the committed enrolled response.
   *
   * The lock is held through the verified custody promotion and the durable
   * state publication, and released only once the operation has reached a
   * recoverable boundary.
   */
  private async promote(): Promise<void> {
    await this.underStagingLock('promotion', async () => {
      await this.promoteLocked();
    });

    this.staging.completePromotion();
    this.log('info', 'staging.promoted', {});
  }

  /** The custody promotion and durable publication; the caller holds the lock. */
  private async promoteLocked(): Promise<void> {
    const promotedSecret = await this.deps.custody.read('staging');
    await this.deps.custody.promoteStagingToPrimary();

    const persisted = await this.state.read();
    const gatewayId = persisted.staging.identity.gatewayId;
    if (promotedSecret !== null && gatewayId !== null) {
      this.primary.adopt(identityFromSecret(gatewayId, promotedSecret));
    }

    await this.state.write({
      ...persisted,
      primary: {
        lane: 'IDLE',
        identity: persisted.staging.identity,
        lastServerState: 'enrolled',
        lastObservedAt: new Date(this.deps.clock.wallNow()).toISOString(),
      },
      staging: {
        lane: 'INACTIVE',
        identity: { gatewayId: null, keyId: null, fingerprint: null },
        idempotencyKey: null,
        redeemStartedAt: null,
        lastServerState: null,
        lastObservedAt: null,
      },
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.cadence !== null) {
      clearInterval(this.cadence);
      this.cadence = null;
    }
    /*
     * (correction 5, finding #10) stop() settles only after a tick it overlapped
     * has settled — otherwise the caller tears down the very paths a tick that
     * is still running is about to write to.
     */
    await this.tickInFlight?.catch(() => undefined);
    await this.ipc.stop();
    this.log('info', 'daemon.stopped', {});
  }

  private async underStagingLock(operation: StagingOperation, body: () => Promise<void>): Promise<void> {
    const lock = await acquireStagingLock(this.deps.paths.stagingLockPath, operation, () =>
      this.deps.clock.wallNow(),
    );
    try {
      await body();
    } finally {
      await lock.release();
    }
  }

  /**
   * Persist a staging transition at its recoverable boundary (correction B5).
   *
   * Every disposition-bearing probe verdict reaches `state.json` BEFORE any
   * custody mutation the verdict may order — the durable marker is what makes
   * an interrupted deletion or promotion completable at boot instead of
   * permanently blocking the enrolment guard with stale state.
   */
  private async persistStagingOutcome(outcome: StagingOutcome): Promise<void> {
    const observed = this.staging.observations.at(-1) ?? null;
    if (observed === null) return;
    const at = new Date(this.deps.clock.wallNow()).toISOString();
    await this.state.update((current) => ({
      ...current,
      staging: {
        ...current.staging,
        lane: outcome.state,
        lastServerState: observed.key,
        lastObservedAt: at,
      },
      lastRejection:
        outcome.disposition === 'delete_staging_terminal'
          ? { code: observed.key, at }
          : current.lastRejection,
    }));
  }

  /** The completed terminal boundary: staging cleared, refusal evidence kept. */
  private async clearStagingState(): Promise<void> {
    await this.state.update((current) => ({
      ...current,
      staging: {
        lane: 'INACTIVE',
        identity: { gatewayId: null, keyId: null, fingerprint: null },
        idempotencyKey: null,
        redeemStartedAt: null,
        // The last server state and lastRejection stay: they are the refusal
        // evidence `doctor` reports after the key is gone.
        lastServerState: current.staging.lastServerState,
        lastObservedAt: current.staging.lastObservedAt,
      },
    }));
  }

  /**
   * Complete a staging boundary a previous process died in the middle of
   * (correction B5, Rev 4.7 tester). Runs at boot, before the IPC listener
   * starts and before any tick, so the daemon never serves on top of stale
   * persisted state.
   */
  private async completeInterruptedStaging(persisted: GatewayState): Promise<void> {
    const lane = persisted.staging.lane;
    if (lane === 'INACTIVE') return;

    if (lane === 'REFUSED') {
      // A terminal refusal whose deletion was interrupted, in either window:
      // before the custody delete, or after it and before the completion write.
      await this.underStagingLock('staging-delete', async () => {
        if ((await this.custodyReadQuietly('staging')) !== null) {
          await this.deps.custody.delete('staging');
        }
        await this.clearStagingState();
      });
      this.staging.completePromotion();
      this.log('warn', 'staging.refusal_completed_at_boot', {});
      return;
    }

    const stagingSecret = await this.custodyReadQuietly('staging');
    if (stagingSecret !== null) {
      if (lane === 'PROMOTED') {
        // Promotion interrupted before the custody write: staging survives, so
        // promotion retries from staging (§14 crash table).
        //
        // (correction 9, finding #2) A busy staging lock DEFERS this retry; it
        // does not refuse the boot. `promote()` carries no busy catch of its
        // own, so an orphaned or peer-held lock propagated `StagingLockBusy`
        // out of `boot()` and left the daemon unable to start until someone
        // removed a lock file by hand — the same "wedged into a shape only a
        // file edit could fix" posture `state.ts` was corrected to avoid at
        // `read()`. The sibling recovery path below already logs and continues;
        // this makes the two agree.
        try {
          await this.promote();
        } catch (error) {
          if (!(error instanceof StagingLockBusy)) throw error;
          this.log('warn', 'staging.lock_busy_promotion_deferred_at_boot', {});
        }
      }
      // Every other lane with staging custody intact resumes normally:
      // AWAITING and TRANSPORT_RETRY probe, PENDING_REDEEM and HALTED surface
      // through `doctor` — the daemon holds no pairing code, so a redeem-phase
      // lane has no executable transition here, by design.
      return;
    }

    // Staging custody is absent but the lane is unresolved. The one completable
    // case: promotion reached the custody write — primary now holds the staging
    // key — and died before the durable publication. Verified by keyId.
    await this.completePromotionAfterCustodyWrite(persisted);
  }

  /**
   * Finish a promotion that completed in custody but not in state: verify the
   * primary secret really is the staging identity's key, then publish.
   */
  private async completePromotionAfterCustodyWrite(persisted: GatewayState): Promise<void> {
    const stagingKeyId = persisted.staging.identity.keyId;
    const gatewayId = persisted.staging.identity.gatewayId;
    if (stagingKeyId === null || gatewayId === null) return;

    const primarySecret = await this.custodyReadQuietly('primary');
    if (primarySecret === null) return;
    let members;
    try {
      members = publicMembersOf(privateKeyFromSecret(primarySecret));
    } catch {
      return; // Not a parsable key: not ours to complete. `doctor` reports it.
    }
    if (members.keyId !== stagingKeyId) return; // No evidence of an interrupted promotion.

    /*
     * (correction 5, finding #15) This is a staging-related `state.json` write,
     * so it happens under the §14 lock like every other one. A busy lock defers
     * the completion to the next boot rather than racing the process that owns
     * staging right now.
     */
    try {
      await this.underStagingLock('promotion-recovery', async () => {
        this.primary.adopt(identityFromSecret(gatewayId, primarySecret));
        await this.state.write({
          ...persisted,
          primary: {
            lane: 'IDLE',
            identity: persisted.staging.identity,
            lastServerState: 'enrolled',
            lastObservedAt: new Date(this.deps.clock.wallNow()).toISOString(),
          },
          staging: {
            lane: 'INACTIVE',
            identity: { gatewayId: null, keyId: null, fingerprint: null },
            idempotencyKey: null,
            redeemStartedAt: null,
            lastServerState: null,
            lastObservedAt: null,
          },
        });
      });
    } catch (error) {
      if (!(error instanceof StagingLockBusy)) throw error;
      this.log('warn', 'staging.lock_busy_recovery_deferred', {});
      return;
    }
    this.staging.completePromotion();
    this.log('info', 'staging.promotion_completed_at_boot', {});
  }

  private async custodyReadQuietly(account: 'primary' | 'staging'): Promise<string | null> {
    try {
      return await this.deps.custody.read(account);
    } catch (error) {
      this.log('error', 'custody.unavailable', { account, message: describe(error) });
      return null;
    }
  }

  /**
   * (correction 5, finding #9) An unparsable custody secret is a custody
   * problem `doctor` reports — not a reason the daemon cannot run. The lane
   * stays without an identity, IPC serves, ticks continue, and every enrolment
   * and promotion boundary is untouched. Same recoverable-unparsable class as
   * the read in `completePromotionAfterCustodyWrite`.
   */
  private adoptRecoverably(lane: 'primary' | 'staging', gatewayId: string, secret: string): void {
    try {
      const identity = identityFromSecret(gatewayId, secret);
      if (lane === 'primary') this.primary.adopt(identity);
      else this.staging.adopt(identity);
    } catch (error) {
      this.log('error', 'custody.secret_unparsable', { lane, message: describe(error) });
    }
  }

  private log(level: 'info' | 'warn' | 'error', at: string, fields: Record<string, unknown>): void {
    this.ring.push({
      at: new Date(this.deps.clock.wallNow()).toISOString(),
      level,
      at_: at,
      fields,
    });
  }
}

function identityFromSecret(gatewayId: string, secret: string): GatewayIdentity {
  const privateKey = privateKeyFromSecret(secret);
  const members = publicMembersOf(privateKey);
  return { gatewayId, keyId: members.keyId, pubkeyBase64: members.pubkeyBase64, privateKey };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
