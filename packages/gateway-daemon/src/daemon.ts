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
import { acquireStagingLock, type StagingOperation } from './staging-lock.js';
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
      this.primary.adopt(identityFromSecret(persisted.primary.identity.gatewayId, primarySecret));
    }

    if (persisted.staging.lane !== 'INACTIVE') {
      this.staging.resume(persisted.staging.lane, persisted.staging.idempotencyKey);
      const stagingSecret = await this.custodyReadQuietly('staging');
      if (stagingSecret !== null && persisted.staging.identity.gatewayId !== null) {
        this.staging.adopt(identityFromSecret(persisted.staging.identity.gatewayId, stagingSecret));
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
      await this.persistStagingOutcome(stagingOutcome);
    }

    if (stagingOutcome.deleteStaging) {
      /*
       * Two-phase, in the ruled order (correction B5): the REFUSED verdict is
       * already on disk (persistStagingOutcome ran above), so an interruption
       * between here and the completion write leaves a boundary a boot can
       * finish, instead of an `AWAITING` state file over a deleted key.
       */
      await this.underStagingLock('staging-delete', async () => {
        await this.deps.custody.delete('staging');
        await this.clearStagingState();
      });
      this.staging.completePromotion();
      this.log('warn', 'staging.terminal_refusal', { lane: stagingOutcome.state });
      return;
    }

    if (stagingOutcome.promote) await this.promote();
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
    });

    this.staging.completePromotion();
    this.log('info', 'staging.promoted', {});
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.cadence !== null) {
      clearInterval(this.cadence);
      this.cadence = null;
    }
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
        await this.promote();
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
