/**
 * The leader's live session map, guarded by L0 (contract §7, §9).
 *
 * Three things live here and they are deliberately separate:
 *
 *   - the **nonce epoch**, keyed `{generation, challenge}`, grow-only within
 *     its epoch and discarded whole on rotation;
 *   - the per-gateway **cursor** `{epoch, lastSequence, generation}`, which a
 *     session-start replaces;
 *   - the per-gateway **liveness** `{wallMs, monoMs}` or null, which a
 *     session-start *preserves* and only an accepted heartbeat establishes.
 *
 * Keeping cursor and liveness apart is correction F4. When they were one
 * record, a same-leader daemon restart replaced the entry with null liveness
 * and the gateway went instantly offline and then wrote a duplicate
 * `went_online` on its next beat — an outage invented by a reconnect. Staleness
 * is judged at derivation time from liveness; a session restart says nothing
 * about whether the machine is alive.
 *
 * Everything here is called with L0 held. Nothing in this module takes the lock
 * itself: a data structure that locked internally would give per-operation
 * atomicity, and what the contract needs is atomicity across a whole
 * read-stage-commit-publish sequence.
 */

import { Mutex } from './locks.js';

/** The challenge epoch a nonce store belongs to. */
export interface EpochKey {
  readonly generation: number;
  readonly challenge: string;
}

/** What a session-start creates, and the only thing it replaces. */
export interface SessionCursor {
  readonly epoch: string;
  readonly lastSequence: number;
  readonly generation: number;
}

/** What an accepted heartbeat establishes. Wall for stamping, monotonic for elapsed. */
export interface Liveness {
  readonly wallMs: number;
  readonly monoMs: number;
}

export function sameEpoch(left: EpochKey | null, right: EpochKey | null): boolean {
  if (left === null || right === null) return false;
  return left.generation === right.generation && left.challenge === right.challenge;
}

/**
 * Effects a fenced transaction computed but has not applied.
 *
 * They are held out of the live map until the transaction has committed, so a
 * rollback or a failed commit leaves memory exactly as the database was left
 * (correction T2). Every member is tagged with the epoch and generation it was
 * computed under, because a publication that resumes after its epoch was
 * retired must discard rather than resurrect.
 */
export interface StagedEffects {
  readonly epoch: EpochKey | null;
  readonly generation: number;
  readonly nonce?: string;
  readonly cursor?: { readonly gatewayId: string; readonly cursor: SessionCursor };
  readonly liveness?: { readonly gatewayId: string; readonly value: Liveness | null };
}

export interface PublishReport {
  readonly nonceApplied: boolean;
  readonly cursorApplied: boolean;
  readonly livenessApplied: boolean;
}

export class NonceCapacityExceeded extends Error {
  override readonly name = 'NonceCapacityExceeded';
}

export class GatewaySessionState {
  /** L0. Held by every reader and writer of the state below. */
  readonly lock = new Mutex();

  private epoch: EpochKey | null = null;
  private nonces = new Set<string>();
  private readonly cursors = new Map<string, SessionCursor>();
  private readonly liveness = new Map<string, Liveness | null>();

  constructor(private readonly nonceCapacity: number) {}

  /* ---- nonce epoch --------------------------------------------------- */

  activeEpoch(): EpochKey | null {
    return this.epoch;
  }

  isActiveEpoch(key: EpochKey): boolean {
    return sameEpoch(this.epoch, key);
  }

  /**
   * Replace the epoch wholesale.
   *
   * Called on acquisition, where the acquire statement minted a fresh challenge
   * against a map demotion already emptied, and at rotation step 12, after a
   * successful COMMIT and a clean post-COMMIT recheck. Nothing else may call it:
   * a failed or delayed rotation must leave the old challenge and its nonce
   * store serving, and the way that is guaranteed is that no other code path
   * can swap them.
   */
  adoptEpoch(key: EpochKey): void {
    this.epoch = key;
    this.nonces = new Set<string>();
  }

  hasNonce(nonce: string): boolean {
    return this.nonces.has(nonce);
  }

  nonceCount(): number {
    return this.nonces.size;
  }

  /**
   * Whether another nonce fits.
   *
   * The ceiling is absolute and global — not per source address — because the
   * store never frees intra-epoch space. That is what makes a flood from any
   * number of addresses, or from a revoked but cryptographically valid key,
   * unable to exceed it (correction C9, blocker 2).
   */
  hasNonceCapacity(): boolean {
    return this.nonces.size < this.nonceCapacity;
  }

  get capacity(): number {
    return this.nonceCapacity;
  }

  /* ---- cursors and liveness ------------------------------------------ */

  cursorFor(gatewayId: string): SessionCursor | null {
    return this.cursors.get(gatewayId) ?? null;
  }

  /**
   * Liveness, distinguishing "no entry" from "an entry holding null".
   *
   * Both derive offline, but only the second means "this leader has seen a
   * session for this gateway and the sweeper nulled its liveness".
   */
  livenessFor(gatewayId: string): Liveness | null {
    return this.liveness.get(gatewayId) ?? null;
  }

  hasLivenessEntry(gatewayId: string): boolean {
    return this.liveness.has(gatewayId);
  }

  /** Gateways this leader holds a live session for. Used by reconciliation. */
  gatewaysWithLiveness(): readonly string[] {
    const out: string[] = [];
    for (const [gatewayId, value] of this.liveness) {
      if (value !== null) out.push(gatewayId);
    }
    return out;
  }

  /** Null a gateway's liveness. The staleness sweep's staged effect. */
  nullLiveness(gatewayId: string): void {
    this.liveness.set(gatewayId, null);
  }

  /* ---- publication ---------------------------------------------------- */

  /**
   * Apply staged effects after a successful COMMIT and a clean post-COMMIT
   * demotion recheck, with L0 still held.
   *
   * The nonce is applied only if its epoch is still the active one. Cursor and
   * liveness are not epoch-scoped: a same-generation challenge rotation kills
   * captured envelopes at the challenge check and deliberately does not touch a
   * live session, so discarding a cursor advance on rotation would invent a
   * `session_required` for a healthy gateway. They are generation-scoped
   * instead, and a generation change has already cleared the map.
   */
  publish(staged: StagedEffects): PublishReport {
    let nonceApplied = false;
    let cursorApplied = false;
    let livenessApplied = false;

    if (staged.nonce !== undefined && staged.epoch !== null && this.isActiveEpoch(staged.epoch)) {
      this.nonces.add(staged.nonce);
      nonceApplied = true;
    }

    const generationLive = this.epoch === null || this.epoch.generation === staged.generation;

    if (staged.cursor !== undefined && generationLive) {
      this.cursors.set(staged.cursor.gatewayId, staged.cursor.cursor);
      cursorApplied = true;
    }

    if (staged.liveness !== undefined && generationLive) {
      this.liveness.set(staged.liveness.gatewayId, staged.liveness.value);
      livenessApplied = true;
    }

    return { nonceApplied, cursorApplied, livenessApplied };
  }

  /**
   * Empty everything. Demotion's phase-2 map clear.
   *
   * A new leader must begin with an empty map — that is what makes a takeover
   * derive offline until the first accepted beat, rather than inheriting a
   * liveness claim nobody has re-established.
   */
  clearAll(): void {
    this.epoch = null;
    this.nonces = new Set<string>();
    this.cursors.clear();
    this.liveness.clear();
  }

  /** Shape of the map, for assertions and diagnostics. */
  describe(): {
    readonly epoch: EpochKey | null;
    readonly nonces: number;
    readonly cursors: number;
    readonly liveness: number;
  } {
    return {
      epoch: this.epoch,
      nonces: this.nonces.size,
      cursors: this.cursors.size,
      liveness: this.liveness.size,
    };
  }
}
