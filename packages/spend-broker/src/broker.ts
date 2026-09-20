/**
 * The spend broker.
 *
 * The one-sentence product claim: a library that refuses to hand an LLM
 * provider a usable credential when the room/run is at or over its spend
 * ceiling, and interrupts an in-flight turn when a refresh would breach.
 *
 * Order of operations per mint, under the per-`runId` single-flight lock:
 *
 *   0. Route on `credentialKind` (default `'api'`). An `'oauth'` mint skips
 *      steps 1–2 entirely — Founder ruling 2026-09-13, recorded verbatim:
 *      "Only API ceiling is $85. OAuth should be unlimited." OAuth mints
 *      make no meter call, record no reservation, and can only be denied by
 *      the gateway itself. Unlimited is not ungated from the gateway.
 *   1. Ask the `CostMeterPort` for a ceiling verdict (spent + reserved vs
 *      ceiling, with this process's own reservations layered on by the port).
 *   2. On denial: emit an `InterruptFrame` to the `InterruptSink` and return
 *      `spend_ceiling_exceeded` with the limb reasons. No credential is
 *      requested, so no credential can leak past a breached ceiling.
 *   3. Ask the `GatewayPort` to mint. Gateway refusals map by kind; ANY other
 *      throw maps to `provider_unavailable` — fail-closed.
 *   4. On success (`api` only): record the reservation and return the handle
 *      with the post-mint budget figure. An `oauth` success returns the
 *      handle with no budget figure — none was consulted.
 *
 * `refresh` is the same flow with one difference, decided before the ceiling
 * check: the run's prior reservation is released, because a refresh re-mints
 * the SAME continuing turn. If that refresh is then denied, the turn is
 * interrupted and nothing is reserved — an interrupted turn holding budget it
 * can no longer spend would be the wrong failure direction.
 *
 * What v0 does NOT do: contact the real gateway daemon, hold raw provider
 * keys, write to any credential store, or make network calls. Every live
 * dependency is a port, and v0 ships fixtures for all of them.
 */

import { ReservationLedger } from './reservations.js';
import { RunKeyLocks } from './single-flight.js';
import { GatewayError, type CostMeterPort, type GatewayPort } from './ports.js';
import type {
  InterruptFrame,
  InterruptSink,
  MintDeniedResult,
  MintRequest,
  MintResult,
  MintedResult,
  OpaqueToken,
  ReservationView,
} from './types.js';

/** Default credential lifetime, also the reservation lifetime. One minute. */
export const DEFAULT_TOKEN_TTL_MS = 60_000;

export interface SpendBrokerOptions {
  readonly gateway: GatewayPort;
  readonly meter: CostMeterPort;
  readonly sink: InterruptSink;
  /** Epoch-ms clock. Defaults to `Date.now`; inject a fixed clock in tests. */
  readonly clock?: () => number;
  /** Broker-assigned token lifetime in ms (see README for the v0 caveat). */
  readonly tokenTtlMs?: number;
  /**
   * `queue` (default) serializes concurrent mints for a run. `reject` returns
   * `single_flight_busy` to a mint that arrives while one for the same run is
   * in flight. Under `reject`, a mint that slips in between the busy-check
   * and enqueue is still queued rather than lost — the ceiling arithmetic
   * stays correct either way.
   */
  readonly busyPolicy?: 'queue' | 'reject';
  /**
   * Inject a reservation ledger when an adapter must READ the same ledger the
   * broker writes (the meter adapter's `reservedTokensForRoom` callback).
   * Defaults to a fresh internal ledger.
   */
  readonly reservations?: ReservationLedger;
}

export interface BrokerStatus {
  readonly now: number;
  readonly activeReservations: readonly ReservationView[];
}

interface MintFlowOptions {
  /** Replace the run's prior reservation before checking (refresh path). */
  readonly replacePrior: boolean;
}

export class SpendBroker {
  private readonly gateway: GatewayPort;
  private readonly meter: CostMeterPort;
  private readonly sink: InterruptSink;
  private readonly clock: () => number;
  private readonly tokenTtlMs: number;
  private readonly busyPolicy: 'queue' | 'reject';
  private readonly locks = new RunKeyLocks();
  private readonly reservations = new ReservationLedger();

  constructor(options: SpendBrokerOptions) {
    this.gateway = options.gateway;
    this.meter = options.meter;
    this.sink = options.sink;
    this.clock = options.clock ?? Date.now;
    this.tokenTtlMs = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
    this.busyPolicy = options.busyPolicy ?? 'queue';
    this.reservations = options.reservations ?? new ReservationLedger();
  }

  /**
   * Mint a provider credential for one turn. Concurrent calls for the same
   * `runId` serialize (or reject under `busyPolicy: 'reject'`); the second
   * sees the first's reservation, so the ceiling is checked against the
   * post-first-mint world, never a stale one.
   */
  mint(request: MintRequest): Promise<MintResult> {
    return this.dispatch(request, { replacePrior: false });
  }

  /**
   * Re-mint the credential for a continuing turn. Replaces the run's prior
   * reservation before checking, so the ceiling sees the turn's CURRENT
   * estimate rather than estimate-plus-estimate. A denial interrupts the
   * turn.
   */
  refresh(request: MintRequest): Promise<MintResult> {
    return this.dispatch(request, { replacePrior: true });
  }

  /** Active, non-expired reservations — for `status` surfaces and tests. */
  status(): BrokerStatus {
    return {
      now: this.clock(),
      activeReservations: this.reservations.active(this.clock()),
    };
  }

  /** Drop a run's reservation explicitly (e.g. the turn ended early). */
  release(runId: string): void {
    this.reservations.release(runId);
  }

  private dispatch(request: MintRequest, flow: MintFlowOptions): Promise<MintResult> {
    if (this.busyPolicy === 'reject' && this.locks.isBusy(request.runId)) {
      return Promise.resolve(denied('single_flight_busy', [
        `run ${request.runId}: a mint is already in flight and busyPolicy is 'reject'`,
      ]));
    }
    return this.locks.run(request.runId, () => this.mintLocked(request, flow));
  }

  private async mintLocked(request: MintRequest, flow: MintFlowOptions): Promise<MintResult> {
    const now = this.clock();
    if (flow.replacePrior) {
      this.reservations.release(request.runId);
    }

    // Founder ruling 2026-09-13: "Only API ceiling is $85. OAuth should be
    // unlimited." Default 'api' is the fail-closed routing: an unmarked mint
    // is the metered kind and stays gated.
    const isOauth = (request.credentialKind ?? 'api') === 'oauth';

    let budgetRemaining: number | null = null;
    if (!isOauth) {
      const verdict = this.meter.checkCeiling({
        runId: request.runId,
        ...(request.roomId === undefined ? {} : { roomId: request.roomId }),
        requestedTokens: request.estimatedCost ?? 0,
      });

      if (!verdict.ok) {
        const frame: InterruptFrame = {
          type: 'interrupt',
          reason: 'spend_ceiling_exceeded',
          runId: request.runId,
          at: now,
          ...(request.roomId === undefined ? {} : { roomId: request.roomId }),
          detail: verdict.reasons,
        };
        this.sink.emit(frame);
        return denied('spend_ceiling_exceeded', verdict.reasons, frame);
      }
      budgetRemaining = verdict.remainingTokens;
    }

    let token: OpaqueToken;
    try {
      token = await this.gateway.mintProviderAuth(request);
    } catch (error: unknown) {
      if (error instanceof GatewayError && error.kind === 'not_authorized') {
        return denied('not_authorized', [error.message]);
      }
      // Any other throw — including non-GatewayError crashes — denies.
      const message = error instanceof Error ? error.message : String(error);
      return denied('provider_unavailable', [message]);
    }

    const expiresAt = now + this.tokenTtlMs;
    if (!isOauth) {
      // Reservations exist to keep the ceiling honest between mints; an
      // unlimited class holds none. Recording one would understate the room's
      // available budget for subsequent api mints.
      const reservation: ReservationView = {
        runId: request.runId,
        ...(request.roomId === undefined ? {} : { roomId: request.roomId }),
        tokens: request.estimatedCost ?? 0,
        expiresAt,
      };
      this.reservations.record(reservation);
    }

    const minted: MintedResult = {
      ok: true,
      token,
      expiresAt,
      ...(budgetRemaining === null ? {} : { budgetRemaining }),
    };
    return minted;
  }
}

function denied(
  reason: MintDeniedResult['reason'],
  detail?: readonly string[],
  interrupt?: InterruptFrame,
): MintDeniedResult {
  return {
    ok: false,
    reason,
    ...(detail === undefined ? {} : { detail }),
    ...(interrupt === undefined ? {} : { interrupt }),
  };
}
