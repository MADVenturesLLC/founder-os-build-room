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
import {
  buildHeartbeat,
  buildPlannerPoll,
  buildPlannerReport,
  buildRuntimeRoomMinted,
  buildRuntimeRoomOccupancy,
  buildSessionStart,
} from './signing.js';
import type {
  PlannerReportPayload,
  RuntimeRoomMintedPayload,
  RuntimeRoomOccupancyPayload,
} from '../../gateway-protocol/src/index.js';
import type { PrimaryLaneState, StagingLaneState } from './state.js';

/** The bounded retry horizon for a redemption (contract §14, §15). */
export const REDEEM_RETRY_HORIZON_MS = 24 * 60 * 60 * 1_000;

/** Lane-local transport backoff, 5 s to a 30 s cap. */
export const BACKOFF_MIN_MS = 5_000;
export const BACKOFF_MAX_MS = 30_000;

/** Planner exchanges per tick at most: each is one poll and, when answered, one report. */
export const MAX_PLANNER_EXCHANGES_PER_TICK = 4;

/** What the lane needs of the planner worker: an answer per request, or `null`. */
export interface PlannerRequestHandler {
  handle(request: unknown): Promise<PlannerReportPayload | null>;
}

/** Occupancy reports per tick at most (FOUNDER-ACT-20261117-BR-PHASE5-STEP1 B2); the rest wait a tick. */
export const MAX_ROOM_OCCUPANCY_REPORTS_PER_TICK = 8;

/**
 * What the lane needs of the room worker (act B2). Every payload it hands
 * over is one the control plane's validator accepts; anything it cannot read
 * or could not send, it answers `null` or leaves out.
 */
export interface RoomRequestHandler {
  /** A poll answer's `room` member: the minted report to send, or `null`. Never throws on bad input. */
  handleRoom(room: unknown): RuntimeRoomMintedPayload | null;
  mintedSent(payload: RuntimeRoomMintedPayload): void;
  /** The occupancy reports due now, most urgent first. */
  dueOccupancy(): readonly RuntimeRoomOccupancyPayload[];
  occupancySent(payload: RuntimeRoomOccupancyPayload): void;
  /** An occupancy report the control plane answered with `accepted: false`: due again at the next refresh. */
  occupancyRefused(payload: RuntimeRoomOccupancyPayload): void;
}

/** Whether the control plane took a room report: it answers 200 with `accepted`. */
function reportAccepted(response: ControlPlaneResponse): boolean {
  return response.body !== null && response.body['accepted'] === true;
}

/** How many polls of one tick's exchange carried work for each worker. */
export interface ExchangeCounts {
  readonly planner: number;
  readonly room: number;
}

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

    /*
     * Read-never-coerce (correction 5, finding #13): an envelope member is
     * used only when it arrived as its declared type. The client validates the
     * success shape; this is the lane's own refusal to fabricate what it signs
     * — the same principle as the redeem guard below.
     */
    const generation = challenge.body?.['generation'];
    const challengeText = challenge.body?.['challenge'];
    if (typeof generation !== 'number' || typeof challengeText !== 'string') {
      return this.transport();
    }

    const envelope = buildSessionStart(this.identity!, { generation, challenge: challengeText }, this.clock);
    return this.apply(await this.client.sessionStart(envelope), (response) => {
      const epoch = response.body?.['epoch'];
      if (typeof epoch !== 'string') return false;
      this.epoch = epoch;
      this.sequence = 0;
      this.state = 'HEARTBEATING';
      return true;
    });
  }

  private async beat(): Promise<Disposition | 'transport' | null> {
    const envelope = buildHeartbeat(this.identity!, this.epoch!, this.sequence + 1, this.clock);
    return this.apply(await this.client.heartbeat(envelope), () => {
      this.sequence += 1;
      this.state = 'HEARTBEATING';
      return true;
    });
  }

  /**
   * The planner pull channel's exchanges for this tick (plan r1 Q2b): poll,
   * answer, report, up to `maxExchanges` times, while the session holds.
   *
   * Only on an established session, after the tick's heartbeat: the poll
   * and the report are session-bound and take the next sequence numbers of
   * the same counter, one request at a time, so they can never race a
   * heartbeat for a sequence. Every response goes through the primary
   * table, exactly as a heartbeat's: a resync drops the session, a
   * protocol-integrity refusal halts the lane. Returns the requests handled.
   *
   * Planner work only: a `room` member the poll answer carries is not read.
   */
  async exchangePlanner(
    worker: PlannerRequestHandler,
    maxExchanges: number = MAX_PLANNER_EXCHANGES_PER_TICK,
  ): Promise<number> {
    return (await this.exchange(worker, null, maxExchanges)).planner;
  }

  /**
   * One tick's poll exchanges for both workers. The poll answer carries
   * planner work as `request` and the control plane's mint request as `room`
   * (FOUNDER-ACT-20261117-BR-PHASE5-STEP1 B2), so one poll serves both; each
   * member goes to its worker only when that worker exists. A poll that
   * carried work for neither ends the exchange, as a poll with no planner
   * request did before. A mint request is answered first, with a signed
   * `runtime_room_minted` report; planner work is then handled and reported
   * exactly as `exchangePlanner` always has. An absent, unknown or malformed
   * `room` member sends nothing and never halts the lane.
   */
  async exchange(
    planner: PlannerRequestHandler | null,
    rooms: RoomRequestHandler | null,
    maxExchanges: number = MAX_PLANNER_EXCHANGES_PER_TICK,
  ): Promise<ExchangeCounts> {
    let polls = 0;
    let plannerHandled = 0;
    let roomHandled = 0;
    const counts = (): ExchangeCounts => ({ planner: plannerHandled, room: roomHandled });
    if (planner === null && rooms === null) return counts();
    while (polls < maxExchanges) {
      if (this.identity === null || this.epoch === null || this.state !== 'HEARTBEATING') return counts();
      if (this.clock.monotonicNow() < this.nextAttemptAt) return counts();

      let request: unknown = null;
      let room: unknown = null;
      const poll = buildPlannerPoll(this.identity, this.epoch, this.sequence + 1, this.clock);
      const polled = this.apply(await this.client.plannerPoll(poll), (response) => {
        this.sequence += 1;
        request = response.body?.['request'] ?? null;
        room = response.body?.['room'] ?? null;
        return true;
      });
      if (polled !== 'retain_and_continue') return counts();
      const plannerWork = planner !== null && request !== null;
      const roomWork = rooms !== null && room !== null;
      if (!plannerWork && !roomWork) return counts();
      polls += 1;

      if (rooms !== null && room !== null) {
        roomHandled += 1;
        if (!(await this.reportMinted(rooms, room))) return counts();
      }

      if (planner === null || request === null) continue;
      plannerHandled += 1;
      const payload = await planner.handle(request);
      if (payload === null) continue;
      const requestId = (request as Record<string, unknown>)['requestId'];
      if (typeof requestId !== 'string') continue;
      if (this.identity === null || this.epoch === null || this.state !== 'HEARTBEATING') return counts();

      const report = buildPlannerReport(this.identity, this.epoch, this.sequence + 1, requestId, JSON.stringify(payload), this.clock);
      const reported = this.apply(await this.client.plannerReport(report), () => {
        this.sequence += 1;
        return true;
      });
      if (reported !== 'retain_and_continue') return counts();
    }
    return counts();
  }

  /**
   * Answer one `room` member. `false` only when a minted report was sent and
   * its response ends this tick's exchange (a resync, a halt, a retry); an
   * unreadable member, or one with nothing to send, is `true` and sends nothing.
   */
  private async reportMinted(rooms: RoomRequestHandler, room: unknown): Promise<boolean> {
    const payload = rooms.handleRoom(room);
    if (payload === null) return true;
    if (this.identity === null || this.epoch === null || this.state !== 'HEARTBEATING') return false;
    const report = buildRuntimeRoomMinted(
      this.identity,
      this.epoch,
      this.sequence + 1,
      payload.requestId,
      JSON.stringify(payload),
      this.clock,
    );
    const response = await this.client.roomMinted(report);
    const reported = this.apply(response, () => {
      this.sequence += 1;
      return true;
    });
    if (reported !== 'retain_and_continue') return false;
    // Counted as reported only when the control plane took it; a refused
    // report (no open request, say after a leader change) is not, and the
    // control plane's next request is answered with the same room.
    if (reportAccepted(response)) rooms.mintedSent(payload);
    return true;
  }

  /**
   * This tick's `runtime_room_occupancy` reports (act B2): each minted room
   * the worker says is due, up to `maxReports`, while the session holds. Each
   * takes the session's next sequence and goes through the primary table like
   * every other session-bound message. `maxReports` bounds the reports sent;
   * the count returned is of those the control plane took (`accepted: true`).
   */
  async reportRoomOccupancy(
    rooms: RoomRequestHandler,
    maxReports: number = MAX_ROOM_OCCUPANCY_REPORTS_PER_TICK,
  ): Promise<number> {
    let sent = 0;
    let accepted = 0;
    for (const payload of rooms.dueOccupancy()) {
      if (sent >= maxReports) return accepted;
      if (this.identity === null || this.epoch === null || this.state !== 'HEARTBEATING') return accepted;
      if (this.clock.monotonicNow() < this.nextAttemptAt) return accepted;
      const report = buildRuntimeRoomOccupancy(
        this.identity,
        this.epoch,
        this.sequence + 1,
        payload.runtimeRoomId,
        JSON.stringify(payload),
        this.clock,
      );
      const response = await this.client.roomOccupancy(report);
      const reported = this.apply(response, () => {
        this.sequence += 1;
        return true;
      });
      if (reported !== 'retain_and_continue') return accepted;
      sent += 1;
      // A report the control plane answered `accepted: false` (it holds no
      // mint for the room, say after a leader change) is not delivered: it
      // stays due, at the refresh pace rather than every tick.
      if (reportAccepted(response)) {
        rooms.occupancySent(payload);
        accepted += 1;
      } else {
        rooms.occupancyRefused(payload);
      }
    }
    return accepted;
  }

  private apply(
    response: ControlPlaneResponse,
    onSuccess: (response: ControlPlaneResponse) => boolean,
  ): Disposition | 'transport' | null {
    if (response.transport) return this.transport();

    const key = vocabularyKey(response.status, response.error);
    const verdict = disposition('primary', key);
    this.record(key, verdict ?? 'transport');

    if (verdict === null) return this.transport();

    switch (verdict) {
      case 'retain_and_continue':
        this.backoffMs = 0;
        // A success the lane cannot legitimately consume is transport, not a
        // heartbeat on fabricated members (correction 5, finding #13).
        if (!onSuccess(response)) return this.transport();
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

    // Read-never-coerce (correction 5, finding #13), on the probe path too.
    const generation = challenge.body?.['generation'];
    const challengeText = challenge.body?.['challenge'];
    if (typeof generation !== 'number' || typeof challengeText !== 'string') {
      return this.transportOutcome();
    }

    const envelope = buildSessionStart(this.identity, { generation, challenge: challengeText }, this.clock);
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
