/**
 * The two identity lanes (contract §15).
 *
 * One key signs one identity's messages, always. The staging lane never
 * observes staging state through a primary-signed request, and the primary lane
 * never signs for the staging identity — which is correction C3, and it matters
 * because a single-lane daemon could only ever learn about the successor's
 * state by asking with the incumbent's key, and the server has no honest way to
 * answer that question.
 *
 * Both lanes are driven by explicit `step()` calls rather than by timers of
 * their own. The daemon owns the cadence; that keeps every state transition
 * here testable without waiting for one.
 */

import { randomUUID } from 'node:crypto';
import type { Clock } from '../../gateway-protocol/src/index.js';
import type { ControlPlaneClient, ControlPlaneResponse } from './client.js';
import { disposition, vocabularyKey, type Disposition } from './disposition.js';
import type { GatewayIdentity } from './signing.js';
import { buildHeartbeat, buildSessionStart } from './signing.js';
import type { PrimaryLaneState, StagingLaneState } from './state.js';

/** The bounded retry horizon for a redemption (contract §14, §15). */
export const REDEEM_RETRY_HORIZON_MS = 24 * 60 * 60 * 1_000;

/** Lane-local transport backoff, 5 s to a 30 s cap. */
export const BACKOFF_MIN_MS = 5_000;
export const BACKOFF_MAX_MS = 30_000;

export interface LaneObservation {
  readonly at: number;
  readonly key: string;
  readonly disposition: Disposition | 'transport';
}

function nextBackoff(current: number): number {
  return Math.min(current === 0 ? BACKOFF_MIN_MS : current * 2, BACKOFF_MAX_MS);
}

/**
 * The primary lane: the current identity, heartbeating until it is revoked.
 */
export class PrimaryLane {
  private state: PrimaryLaneState = 'IDLE';
  private epoch: string | null = null;
  private sequence = 0;
  private backoffMs = 0;
  private nextAttemptAt = 0;
  readonly observations: LaneObservation[] = [];

  constructor(
    private readonly client: ControlPlaneClient,
    private readonly clock: Clock,
    private identity: GatewayIdentity | null,
  ) {}

  get laneState(): PrimaryLaneState {
    return this.state;
  }

  get currentEpoch(): string | null {
    return this.epoch;
  }

  get lastSequence(): number {
    return this.sequence;
  }

  adopt(identity: GatewayIdentity): void {
    this.identity = identity;
    this.state = 'IDLE';
    this.epoch = null;
    this.sequence = 0;
    this.backoffMs = 0;
    this.nextAttemptAt = 0;
  }

  /** One cadence iteration. Returns the disposition it acted on, if any. */
  async step(): Promise<Disposition | 'transport' | null> {
    if (this.identity === null) return null;
    if (this.state === 'REVOKED' || this.state === 'HALTED') return null;
    if (this.clock.monotonicNow() < this.nextAttemptAt) return null;

    if (this.epoch === null) return this.openSession();
    return this.beat();
  }

  private async openSession(): Promise<Disposition | 'transport' | null> {
    this.state = 'SESSION_STARTING';

    const challenge = await this.client.challenge();
    if (challenge.transport || challenge.status !== 200) return this.transport();

    const envelope = buildSessionStart(
      this.identity!,
      {
        generation: challenge.body?.['generation'] as number,
        challenge: challenge.body?.['challenge'] as string,
      },
      this.clock,
    );
    return this.apply(await this.client.sessionStart(envelope), (response) => {
      this.epoch = response.body?.['epoch'] as string;
      this.sequence = 0;
      this.state = 'HEARTBEATING';
    });
  }

  private async beat(): Promise<Disposition | 'transport' | null> {
    const envelope = buildHeartbeat(this.identity!, this.epoch!, this.sequence + 1, this.clock);
    return this.apply(await this.client.heartbeat(envelope), () => {
      this.sequence += 1;
      this.state = 'HEARTBEATING';
    });
  }

  private apply(
    response: ControlPlaneResponse,
    onSuccess: (response: ControlPlaneResponse) => void,
  ): Disposition | 'transport' | null {
    if (response.transport) return this.transport();

    const key = vocabularyKey(response.status, response.error);
    const verdict = disposition('primary', key);
    this.record(key, verdict ?? 'transport');

    if (verdict === null) return this.transport();

    switch (verdict) {
      case 'retain_and_continue':
        this.backoffMs = 0;
        onSuccess(response);
        return verdict;
      case 'resync_session':
        // A structured resync outcome, not a protocol-integrity failure: drop
        // the session, re-challenge, and start again from sequence 1.
        this.epoch = null;
        this.sequence = 0;
        this.state = 'SESSION_STARTING';
        return verdict;
      case 'terminal_stop_no_deletion':
        // Revoked. The lane stops and the key is NOT deleted — it is evidence.
        this.state = 'REVOKED';
        return verdict;
      case 'halt_fail_closed':
        /*
         * The enumerated protocol-integrity set, or a state ladder verdict on
         * heartbeat traffic. Nothing here is repairable by repetition, and
         * re-enrolment is a fresh Founder-minted pairing act — never a
         * self-initiated recovery.
         */
        this.state = 'HALTED';
        return verdict;
      default:
        return this.retryLater(verdict);
    }
  }

  private transport(): 'transport' {
    this.state = 'TRANSPORT_RETRY';
    this.backoffMs = nextBackoff(this.backoffMs);
    this.nextAttemptAt = this.clock.monotonicNow() + this.backoffMs;
    this.record('transport', 'transport');
    return 'transport';
  }

  private retryLater(verdict: Disposition): Disposition {
    this.backoffMs = nextBackoff(this.backoffMs);
    this.nextAttemptAt = this.clock.monotonicNow() + this.backoffMs;
    return verdict;
  }

  private record(key: string, verdict: Disposition | 'transport'): void {
    this.observations.push({ at: this.clock.wallNow(), key, disposition: verdict });
  }
}

export interface StagingRedeemRequest {
  readonly code: string;
  readonly pubkeyBase64: string;
  readonly hostDescriptor: { readonly hostname: string; readonly os: string; readonly arch: string };
}

export interface AcceptedRedemption {
  readonly gatewayId: string;
  readonly keyId: string;
  readonly fingerprint: string;
  readonly awaitingApprovalExpiresAt: string;
}

export interface StagingOutcome {
  readonly state: StagingLaneState;
  readonly disposition: Disposition | 'transport' | null;
  /** True when custody must be deleted: a terminal refusal. */
  readonly deleteStaging: boolean;
  /** True when the four promotion steps may begin. */
  readonly promote: boolean;
  /** The 202 body, present only on an accepted redemption. */
  readonly accepted?: AcceptedRedemption;
}

/**
 * The staging lane: a successor identity, from redemption to promotion.
 */
export class StagingLane {
  private state: StagingLaneState = 'INACTIVE';
  private backoffMs = 0;
  private nextAttemptAt = 0;
  private redeemStartedAt: number | null = null;
  private idempotencyKey: string | null = null;
  readonly observations: LaneObservation[] = [];

  constructor(
    private readonly client: ControlPlaneClient,
    private readonly clock: Clock,
    private identity: GatewayIdentity | null = null,
  ) {}

  get laneState(): StagingLaneState {
    return this.state;
  }

  get stableIdempotencyKey(): string | null {
    return this.idempotencyKey;
  }

  /**
   * Begin a redemption.
   *
   * The idempotency key is minted ONCE and reused for every retry inside the
   * horizon — that is what makes a retry a retry rather than a second
   * redemption of the Founder's code.
   */
  beginRedeem(): string {
    this.state = 'PENDING_REDEEM';
    this.idempotencyKey = randomUUID();
    this.redeemStartedAt = this.clock.monotonicNow();
    this.backoffMs = 0;
    this.nextAttemptAt = 0;
    return this.idempotencyKey;
  }

  /** Whether the bounded 24 h retry horizon has elapsed. */
  get horizonElapsed(): boolean {
    if (this.redeemStartedAt === null) return false;
    return this.clock.monotonicNow() - this.redeemStartedAt > REDEEM_RETRY_HORIZON_MS;
  }

  /** Milliseconds until the lane's own backoff permits the next attempt. */
  get msUntilNextAttempt(): number {
    return Math.max(0, this.nextAttemptAt - this.clock.monotonicNow());
  }

  async redeem(request: StagingRedeemRequest): Promise<StagingOutcome> {
    if (this.idempotencyKey === null) this.beginRedeem();

    const response = await this.client.enroll({
      code: request.code,
      pubkey: request.pubkeyBase64,
      hostDescriptor: request.hostDescriptor,
      idempotencyKey: this.idempotencyKey,
    });

    if (response.transport) return this.transportOutcome();

    const key = vocabularyKey(response.status, response.error);
    const verdict = disposition('stagingRedeem', key);
    this.record(key, verdict ?? 'transport');

    if (verdict === null) return this.transportOutcome();

    if (verdict === 'retain_and_continue') {
      this.state = 'AWAITING';
      this.backoffMs = 0;
      /*
       * Read, never coerce (correction T1, Rev 4.7 tester). The client has
       * already classified a structurally invalid 202 as transport; this guard
       * is the lane's own refusal to fabricate — a missing member becomes a
       * retry, never an empty-string identity that state would persist as if
       * the Founder had confirmed it.
       */
      const body = response.body ?? {};
      const gatewayId = body['gatewayId'];
      const keyId = body['keyId'];
      const fingerprint = body['fingerprint'];
      const awaitingApprovalExpiresAt = body['awaitingApprovalExpiresAt'];
      if (
        typeof gatewayId !== 'string' ||
        typeof keyId !== 'string' ||
        typeof fingerprint !== 'string' ||
        typeof awaitingApprovalExpiresAt !== 'string'
      ) {
        return this.transportOutcome();
      }
      return {
        state: this.state,
        disposition: verdict,
        deleteStaging: false,
        promote: false,
        accepted: { gatewayId, keyId, fingerprint, awaitingApprovalExpiresAt },
      };
    }
    if (verdict === 'delete_staging_terminal') {
      this.state = 'REFUSED';
      return { state: this.state, disposition: verdict, deleteStaging: true, promote: false };
    }
    return this.retryOutcome(verdict);
  }

  adopt(identity: GatewayIdentity): void {
    this.identity = identity;
  }

  /**
   * One probe: a signed session-start with THIS lane's key, carrying a fresh
   * nonce and timestamp.
   *
   * Reachable from `AWAITING` AND from `TRANSPORT_RETRY` (correction B5, Rev
   * 4.7 tester): a transport failure moves the lane to `TRANSPORT_RETRY`, and
   * if that were an exit with no way back, one failed probe would silence the
   * lane forever. The lane's own backoff still gates the retry — a probe from
   * `TRANSPORT_RETRY` waits out `nextAttemptAt` like any other retry.
   *
   * The ladder verdict on a staging-authenticated probe is the only source of
   * staging state. Nothing else is consulted, and nothing infers it from the
   * primary lane's traffic.
   */
  async probe(): Promise<StagingOutcome> {
    if (this.identity === null || (this.state !== 'AWAITING' && this.state !== 'TRANSPORT_RETRY')) {
      return { state: this.state, disposition: null, deleteStaging: false, promote: false };
    }
    if (this.clock.monotonicNow() < this.nextAttemptAt) {
      return { state: this.state, disposition: null, deleteStaging: false, promote: false };
    }

    const challenge = await this.client.challenge();
    if (challenge.transport || challenge.status !== 200) return this.transportOutcome();

    const envelope = buildSessionStart(
      this.identity,
      {
        generation: challenge.body?.['generation'] as number,
        challenge: challenge.body?.['challenge'] as string,
      },
      this.clock,
    );
    const response = await this.client.sessionStart(envelope);
    if (response.transport) return this.transportOutcome();

    const key = vocabularyKey(response.status, response.error);
    const verdict = disposition('stagingProbe', key);
    this.record(key, verdict ?? 'transport');

    if (verdict === null) return this.transportOutcome();

    switch (verdict) {
      case 'promote':
        // Promotion begins only after the COMMITTED enrolled response.
        this.state = 'PROMOTED';
        this.backoffMs = 0;
        return { state: this.state, disposition: verdict, deleteStaging: false, promote: true };
      case 'retain_and_continue':
        // A verdict received is the retry answered: the lane is `AWAITING`
        // again, not still "retrying" (correction B5).
        this.state = 'AWAITING';
        this.backoffMs = 0;
        return { state: this.state, disposition: verdict, deleteStaging: false, promote: false };
      case 'delete_staging_terminal':
        this.state = 'REFUSED';
        return { state: this.state, disposition: verdict, deleteStaging: true, promote: false };
      case 'halt_fail_closed':
        // Custody is untouched; only `doctor` reports it; no automatic retry.
        this.state = 'HALTED';
        return { state: this.state, disposition: verdict, deleteStaging: false, promote: false };
      default:
        return this.retryOutcome(verdict);
    }
  }

  /** After a verified promotion the lane returns to `INACTIVE`. */
  completePromotion(): void {
    this.state = 'INACTIVE';
    this.identity = null;
    this.idempotencyKey = null;
    this.redeemStartedAt = null;
  }

  private transportOutcome(): StagingOutcome {
    this.state = 'TRANSPORT_RETRY';
    this.backoffMs = nextBackoff(this.backoffMs);
    this.nextAttemptAt = this.clock.monotonicNow() + this.backoffMs;
    this.record('transport', 'transport');
    // Transport failures NEVER touch custody. That is the row that keeps a
    // flaky network from destroying the only key for an awaiting identity.
    return { state: this.state, disposition: 'transport', deleteStaging: false, promote: false };
  }

  private retryOutcome(verdict: Disposition): StagingOutcome {
    this.backoffMs = nextBackoff(this.backoffMs);
    this.nextAttemptAt = this.clock.monotonicNow() + this.backoffMs;
    return { state: this.state, disposition: verdict, deleteStaging: false, promote: false };
  }

  private record(key: string, verdict: Disposition | 'transport'): void {
    this.observations.push({ at: this.clock.wallNow(), key, disposition: verdict });
  }

  /** Restore a lane that was mid-flight when the process last stopped. */
  resume(state: StagingLaneState, idempotencyKey: string | null): void {
    this.state = state;
    this.idempotencyKey = idempotencyKey;
    this.redeemStartedAt = this.clock.monotonicNow();
  }
}
