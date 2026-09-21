/**
 * v0 fixtures. Every live dependency ships as a fixture here, so the package
 * is demonstrable end-to-end with zero I/O, zero network, zero credentials.
 *
 * Fixture tokens are `fix_…` handles — never real secrets, never logged
 * beyond what a caller chooses to do with the returned result object.
 */

import { GatewayError } from './ports.js';
import type { CeilingQuery, CeilingVerdict, CostMeterPort, GatewayPort } from './ports.js';
import { opaqueToken } from './types.js';
import type { InterruptFrame, InterruptSink, OpaqueToken } from './types.js';

export interface FixtureGatewayOptions {
  /** Delay before resolving, ms — makes single-flight ordering observable. */
  readonly delayMs?: number;
}

/**
 * Deterministic fixture gateway. Tokens are `fix_<provider>_<seq>`, sequence
 * starting at 1 per instance. No expiry is minted here: in v0 the BROKER
 * assigns `expiresAt` (`tokenTtlMs`), because the commissioned GatewayPort
 * carries no expiry field — see README.
 */
export class FixtureGatewayPort implements GatewayPort {
  private seq = 0;
  private readonly delayMs?: number;

  constructor(options?: FixtureGatewayOptions) {
    this.delayMs = options?.delayMs;
  }

  async mintProviderAuth(request: MintRequestForFixture): Promise<OpaqueToken> {
    if (this.delayMs !== undefined && this.delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.delayMs));
    }
    this.seq += 1;
    return opaqueToken(`fix_${request.provider}_${String(this.seq).padStart(4, '0')}`);
  }
}

/** The one field the fixture gateway reads from the request. */
type MintRequestForFixture = { readonly provider: string };

/** Always refuses as `unavailable` — the mint must deny, never silently pass. */
export class FailGatewayPort implements GatewayPort {
  async mintProviderAuth(): Promise<OpaqueToken> {
    throw new GatewayError('unavailable', 'fixture gateway is unavailable');
  }
}

/** Refuses as `not_authorized` — an authorization refusal, not an outage. */
export class NotAuthorizedGatewayPort implements GatewayPort {
  async mintProviderAuth(): Promise<OpaqueToken> {
    throw new GatewayError('not_authorized', 'fixture gateway is not authorized for this room');
  }
}

/**
 * A ceiling port that answers from a caller-supplied function — the fixture
 * for tests that pin the BROKER's behavior (denial mapping, interrupt
 * emission, reservation bookkeeping) independently of the meter adapter.
 * Tests exercising the real rule use `MeterCeilingPort` instead.
 */
export class StaticCostMeterPort implements CostMeterPort {
  private readonly answer: (query: CeilingQuery) => CeilingVerdict;

  constructor(answer: (query: CeilingQuery) => CeilingVerdict) {
    this.answer = answer;
  }

  checkCeiling(query: CeilingQuery): CeilingVerdict {
    return this.answer(query);
  }
}

/**
 * Records every frame it is given. The v0 stand-in for a worker that would
 * interrupt an in-flight turn; it interrupts nothing itself.
 */
export class RecordingInterruptSink implements InterruptSink {
  private readonly recorded: InterruptFrame[] = [];

  emit(frame: InterruptFrame): void {
    this.recorded.push(frame);
  }

  get frames(): readonly InterruptFrame[] {
    return [...this.recorded];
  }
}
