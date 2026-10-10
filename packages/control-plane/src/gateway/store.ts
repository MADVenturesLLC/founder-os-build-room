/**
 * The gateway registry store — Founder acts and the durable records behind them
 * (contract §5, §8, §12).
 *
 * Every act here runs under the registry advisory lock (L2) and nothing else.
 * These paths are not leader-dependent: minting, confirming, denying and
 * revoking are durable transactions that any replica able to reach the database
 * may perform correctly, and gating them on leadership would make a Founder's
 * revoke fail because a lease happened to be in transit — the opposite of what
 * "immediate, without the machine's cooperation" requires.
 *
 * Two disciplines run through the whole file:
 *
 *   **The event is the record; the projection is a read model.** Every
 *   projection write happens in the same transaction as the event that caused
 *   it, and the upsert below mirrors the pure reducer field for field, so
 *   `projection:replay-equals-table` can hold.
 *
 *   **Time comes from the database.** `occurred_at`, `state_since` and every
 *   expiry are computed from one `now()` read at the top of the transaction, so
 *   two rows written together cannot disagree about when they happened and no
 *   process clock enters a durable record.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  MAX_ENROLLED_GATEWAYS,
  lowestFreeSlot,
  projectGatewayRegistry,
  type EnrollmentSlot,
  type GatewayProjectionRow,
  type GatewayRegistryEvent,
  type GatewayState,
  type HostDescriptor,
} from '../../../gateway-registry/src/index.js';
import type { Config } from '../config.js';
import { GATEWAY_REGISTRY_LOCK_KEY } from '../migrations.js';
import type { RedeemRequest } from './enroll-validation.js';
import {
  FOUNDER_ACTOR,
  FOUNDER_ATTRIBUTION,
  GATEWAY_ATTRIBUTION,
  UNRESOLVED_KEY_ID,
  controlPlaneActor,
  controlPlaneAttribution,
  gatewayActor,
  type EnrollmentRefusalKind,
  type GatewayActor,
  type GatewayAttribution,
} from './records.js';

/* ------------------------------------------------------------------ types */

export interface MintedCode {
  readonly pairingId: string;
  /** The plaintext. Returned exactly once, never logged, never stored. */
  readonly code: string;
  readonly expiresAt: Date;
}

export interface PairingCodeView {
  readonly pairingId: string;
  readonly mintedAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly consumedByGatewayId: string | null;
}

export interface EnrollmentView {
  readonly gatewayId: string;
  readonly state: GatewayState;
  readonly keyId: string | null;
  readonly fingerprint: string | null;
  readonly hostDescriptor: HostDescriptor | null;
  readonly stateSince: Date;
  readonly awaitingApprovalExpiresAt: Date | null;
  readonly isCurrentlyEnrolled: boolean;
  /** The enrollment slot an enrolled gateway holds (1 or 2), and null otherwise. */
  readonly enrollmentSlot: number | null;
}

/** The 202 body, stored verbatim so a retry replays exactly what was sent. */
export interface RedeemAccepted {
  readonly gatewayId: string;
  readonly keyId: string;
  readonly fingerprint: string;
  readonly awaitingApprovalExpiresAt: string;
}

export type RedeemOutcome =
  | { readonly ok: true; readonly status: 202; readonly body: RedeemAccepted; readonly replayed: boolean }
  | {
      readonly ok: false;
      readonly status: 409;
      readonly code: 'unknown_code' | 'code_expired' | 'code_consumed' | 'idempotency_key_mismatch';
    };

/** What a Founder act produced. `code` is the structured refusal on failure. */
export type FounderActResult =
  | { readonly ok: true; readonly gatewayId: string; readonly state: GatewayState }
  | {
      readonly ok: false;
      readonly status: 404 | 409;
      readonly code: 'not_found' | EnrollmentRefusalKind;
    };

export interface RegistryEventInput {
  readonly eventType: GatewayRegistryEvent['eventType'];
  readonly gatewayId: string | null;
  readonly keyId?: string | null;
  readonly pubkey?: Uint8Array | null;
  readonly hostDescriptor?: HostDescriptor | null;
  readonly pairingId?: string | null;
  readonly codeHash?: string | null;
  readonly actor: GatewayActor;
  readonly attribution: GatewayAttribution;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
}

/* -------------------------------------------------------------- the store */

export class GatewayRegistryStore {
  constructor(
    private readonly pool: Pool,
    private readonly config: Config,
  ) {}

  /* ---- Founder acts ------------------------------------------------- */

  /**
   * Mint a pairing code (§8).
   *
   * The plaintext exists in exactly one place for exactly one moment: the
   * response body. Only `sha256(code)` of the exact minted string is stored, so
   * a database read cannot recover a live code, and nothing logs it.
   */
  async mintPairingCode(): Promise<MintedCode> {
    /*
     * 32 CSPRNG bytes rendered as 43 characters of base64url. Case-sensitive by
     * construction, which is why canonicalization is trim-only (correction C8):
     * lowercasing a base64url code makes valid codes unredeemable.
     */
    const code = randomBytes(32).toString('base64url');
    const codeHash = hashCode(code);
    const pairingId = randomUUID();

    return this.inRegistryTransaction(async (client, now) => {
      const expiresAt = new Date(now.getTime() + this.config.gatewayCodeTtlMs);

      await client.query(
        `INSERT INTO gateway_pairing_codes (pairing_id, code_hash, minted_by, minted_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [pairingId, codeHash, JSON.stringify(FOUNDER_ACTOR), now, expiresAt],
      );

      await insertRegistryEvent(client, {
        eventType: 'minted',
        // Null: a code precedes any gateway identity by construction.
        gatewayId: null,
        pairingId,
        codeHash,
        actor: FOUNDER_ACTOR,
        attribution: FOUNDER_ATTRIBUTION,
        occurredAt: now,
        payload: { pairingId, expiresAt: expiresAt.toISOString() },
      });

      return { pairingId, code, expiresAt };
    });
  }

  /** Token-guarded read. No plaintext code exists to disclose. */
  async listPairingCodes(): Promise<readonly PairingCodeView[]> {
    const { rows } = await this.pool.query<{
      pairing_id: string;
      minted_at: Date;
      expires_at: Date;
      consumed_at: Date | null;
      consumed_by_gateway_id: string | null;
    }>(
      `SELECT pairing_id, minted_at, expires_at, consumed_at, consumed_by_gateway_id
         FROM gateway_pairing_codes ORDER BY minted_at DESC`,
    );
    return rows.map((row) => ({
      pairingId: row.pairing_id,
      mintedAt: row.minted_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      consumedByGatewayId: row.consumed_by_gateway_id,
    }));
  }

  async listEnrollments(): Promise<readonly EnrollmentView[]> {
    const { rows } = await this.pool.query<ProjectionRowRaw>(
      `SELECT gateway_id, state, key_id, pubkey, host_descriptor, state_since,
              last_event_seq, awaiting_approval_expires_at, is_currently_enrolled,
              enrollment_slot
         FROM gateway_current_state ORDER BY state_since DESC, gateway_id ASC`,
    );
    return rows.map((row) => ({
      gatewayId: row.gateway_id,
      state: row.state,
      keyId: row.key_id,
      /*
       * The fingerprint IS the key id — `sha256` of the 32 raw public-key
       * bytes, derived server-side. Reported under both names because the
       * Founder is asked to compare a "fingerprint" against what the CLI
       * displayed, and asking them to know the two words mean one value would
       * be a needless place to make a mistake.
       */
      fingerprint: row.key_id,
      hostDescriptor: row.host_descriptor,
      stateSince: row.state_since,
      awaitingApprovalExpiresAt: row.awaiting_approval_expires_at,
      isCurrentlyEnrolled: row.is_currently_enrolled,
      enrollmentSlot: row.enrollment_slot === null ? null : Number(row.enrollment_slot),
    }));
  }

  /**
   * Confirm a successor (§8).
   *
   * The fingerprint bind is the ruling's §3.14 control: a structurally valid
   * but SUBSTITUTED public key passes redemption and is caught here, because
   * the fingerprint is recomputed from the stored bytes and compared against
   * what the Founder was handed out of band.
   *
   * The cap of two enrolled gateways (DEC-20260818-01 clause 5 as amended by
   * FOUNDER-ACT-20261010-TWO-GATEWAYS) is enforced by the database: each
   * enrolled gateway holds one of two enrollment slots and a partial unique
   * index lets a slot be held once. This code takes the lowest free slot
   * under the registry lock and refuses with `enrollment_cap_reached` when
   * both are held; the index is what makes a third enrollment impossible
   * whatever the code does. With one slot held, a successor may be confirmed
   * before its incumbent is revoked (the act's B5); with both held, the
   * incumbent must be revoked first.
   */
  async confirmEnrollment(gatewayId: string, fingerprint: string, sourceIp: string | null): Promise<FounderActResult> {
    return this.inRegistryTransaction(async (client, now) => {
      const row = await lockProjection(client, gatewayId);
      if (row === null) return notFound();

      const storedFingerprint = row.pubkey === null ? null : sha256Hex(row.pubkey);
      if (storedFingerprint === null || storedFingerprint !== fingerprint) {
        await recordEnrollmentRefusal(client, {
          kind: 'fingerprint_mismatch',
          gatewayId,
          detail: { presentedLength: fingerprint.length },
          sourceIp,
          recordedAt: now,
        });
        return refuse('fingerprint_mismatch');
      }

      if (row.state !== 'awaiting_approval') {
        await recordEnrollmentRefusal(client, {
          kind: 'not_awaiting_approval',
          gatewayId,
          detail: { state: row.state },
          sourceIp,
          recordedAt: now,
        });
        return refuse('not_awaiting_approval');
      }

      /*
       * Expiry is enforced lazily here as well as by the sweep, so a confirm
       * that arrives between the deadline and the sweeper's next pass is
       * refused rather than admitted by timing.
       */
      if (row.awaitingApprovalExpiresAt !== null && row.awaitingApprovalExpiresAt <= now) {
        await this.recordExpiry(client, row, now);
        await recordEnrollmentRefusal(client, {
          kind: 'not_awaiting_approval',
          gatewayId,
          detail: { state: 'expired', expiredAt: row.awaitingApprovalExpiresAt.toISOString() },
          sourceIp,
          recordedAt: now,
        });
        return refuse('not_awaiting_approval');
      }

      /*
       * The slots already held, read under the registry lock, which every
       * confirm and revoke takes; so no other act can take or free a slot
       * between this read and the write below.
       */
      const held = await client.query<{ enrollment_slot: number }>(
        `SELECT enrollment_slot FROM gateway_current_state
          WHERE is_currently_enrolled ORDER BY enrollment_slot`,
      );
      const slot = lowestFreeSlot(held.rows.map((r) => Number(r.enrollment_slot)));
      if (slot === null) {
        await recordEnrollmentRefusal(client, {
          kind: 'enrollment_cap_reached',
          gatewayId,
          detail: { enrolled: held.rows.length, cap: MAX_ENROLLED_GATEWAYS },
          sourceIp,
          recordedAt: now,
        });
        return refuse('enrollment_cap_reached');
      }

      try {
        const seq = await insertRegistryEvent(client, {
          eventType: 'enrolled',
          gatewayId,
          keyId: row.key_id,
          actor: FOUNDER_ACTOR,
          attribution: FOUNDER_ATTRIBUTION,
          occurredAt: now,
          payload: { gatewayId, fingerprint },
        });
        await upsertProjection(client, {
          gatewayId,
          state: 'enrolled',
          keyId: null,
          pubkey: null,
          hostDescriptor: null,
          stateSince: now,
          lastEventSeq: seq,
          awaitingApprovalExpiresAt: null,
          enrollmentSlot: slot,
        });
      } catch (error) {
        /*
         * The slot index refused the write: a slot this transaction read as
         * free is held. Under the registry lock that cannot happen, so this
         * is the backstop the database provides, and it is still reported as
         * the cap refusal it is rather than as a server fault.
         */
        if (isUniqueViolation(error, 'gateway_current_state_one_gateway_per_slot')) {
          throw new EnrollmentCapReached(gatewayId);
        }
        throw error;
      }

      return { ok: true as const, gatewayId, state: 'enrolled' as const };
    }).catch(async (error: unknown) => {
      if (error instanceof EnrollmentCapReached) {
        /*
         * (correction 5, M11) The ruled refusal answers regardless of whether
         * its out-of-band evidence write succeeded — the client must hear
         * `enrollment_cap_reached`, not a 500, because a recorder hiccup
         * outranked the ruling.
         */
        await this.recordRefusalOutOfBand('enrollment_cap_reached', gatewayId, sourceIp).catch(
          () => undefined,
        );
        return refuse('enrollment_cap_reached');
      }
      throw error;
    });
  }

  /** Deny a successor. `awaiting_approval` is the only state it applies to. */
  async denyEnrollment(gatewayId: string, sourceIp: string | null): Promise<FounderActResult> {
    return this.transitionFounderAct(gatewayId, 'denied', ['awaiting_approval'], sourceIp);
  }

  /**
   * Revoke the incumbent. Immediate, and without the machine's cooperation:
   * nothing here asks the gateway anything, and the projection update takes
   * effect in the same transaction as the event.
   */
  async revokeGateway(gatewayId: string, sourceIp: string | null): Promise<FounderActResult> {
    return this.transitionFounderAct(gatewayId, 'revoked', ['enrolled'], sourceIp);
  }

  private async transitionFounderAct(
    gatewayId: string,
    target: 'denied' | 'revoked',
    from: readonly GatewayState[],
    sourceIp: string | null,
  ): Promise<FounderActResult> {
    return this.inRegistryTransaction(async (client, now) => {
      const row = await lockProjection(client, gatewayId);
      if (row === null) return notFound();

      if (!from.includes(row.state)) {
        /*
         * `not_awaiting_approval` is the closed vocabulary's only
         * state-precondition refusal for a Founder route (§14), so it carries
         * every "the identity is not in a state this act applies to" case —
         * including a revoke aimed at something that is not enrolled. A new
         * code would be outside the vocabulary the disposition test asserts.
         */
        await recordEnrollmentRefusal(client, {
          kind: 'not_awaiting_approval',
          gatewayId,
          detail: { state: row.state, attempted: target },
          sourceIp,
          recordedAt: now,
        });
        return refuse('not_awaiting_approval');
      }

      if (
        target === 'denied' &&
        row.awaitingApprovalExpiresAt !== null &&
        row.awaitingApprovalExpiresAt <= now
      ) {
        await this.recordExpiry(client, row, now);
        await recordEnrollmentRefusal(client, {
          kind: 'not_awaiting_approval',
          gatewayId,
          detail: { state: 'expired' },
          sourceIp,
          recordedAt: now,
        });
        return refuse('not_awaiting_approval');
      }

      const seq = await insertRegistryEvent(client, {
        eventType: target,
        gatewayId,
        keyId: row.key_id,
        actor: FOUNDER_ACTOR,
        attribution: FOUNDER_ATTRIBUTION,
        occurredAt: now,
        payload: { gatewayId },
      });
      await upsertProjection(client, {
        gatewayId,
        state: target,
        keyId: null,
        pubkey: null,
        hostDescriptor: null,
        stateSince: now,
        lastEventSeq: seq,
        awaitingApprovalExpiresAt: null,
      });

      return { ok: true as const, gatewayId, state: target };
    });
  }

  /** The `expired` event and its projection update, in the caller's transaction. */
  private async recordExpiry(client: PoolClient, row: LockedProjection, now: Date): Promise<void> {
    const seq = await insertRegistryEvent(client, {
      eventType: 'expired',
      gatewayId: row.gateway_id,
      keyId: row.key_id,
      actor: controlPlaneActor('expiry'),
      attribution: controlPlaneAttribution('expiry'),
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

  /**
   * Record a refusal whose transaction has already rolled back.
   *
   * A unique-index violation aborts its transaction, so the refusal row cannot
   * be written inside it. Written in its own small transaction instead — the
   * refusal must survive, and it takes no cross-lock reads (§13).
   */
  private async recordRefusalOutOfBand(
    kind: EnrollmentRefusalKind,
    gatewayId: string,
    sourceIp: string | null,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const now = await transactionNow(client);
      await recordEnrollmentRefusal(client, {
        kind,
        gatewayId,
        detail: { reason: 'the at-most-one-enrolled index refused a second enrolled row' },
        sourceIp,
        recordedAt: now,
      });
    } finally {
      client.release();
    }
  }

  /* ---- redemption (§8) ------------------------------------------------ */

  /**
   * Redeem a pairing code. Code-authenticated: no token, no signature, no
   * challenge, no nonce ledger.
   *
   * The whole act is one transaction under L2, and the step order carries the
   * corrections:
   *
   *   - The idempotency lookup comes FIRST, so a retried redeem replays its
   *     stored response and consumes nothing a second time. The lookup is
   *     durable rather than in-memory because the retry it protects can outlive
   *     the process: the daemon retries for up to 24 h, and a redeploy in that
   *     window must not turn a retry into a second consumption.
   *   - The gateway id is minted on the miss, BEFORE any consumption
   *     (correction F5), so the compare-and-consume, the lifecycle event, the
   *     projection row, the idempotency record and the response all bind one
   *     identity. Binding a consumption to an id that did not exist yet was the
   *     defect.
   *   - Consumption itself is a single atomic compare-and-swap. Two racing
   *     requests cannot both win, because the predicate carries
   *     `consumed_at IS NULL` and the loser sees zero rows.
   */
  async redeem(request: RedeemRequest, sourceIp: string | null): Promise<RedeemOutcome> {
    const presentedHash = hashCode(request.code);

    return this.inRegistryTransaction(async (client, now) => {
      // 1. Idempotency lookup.
      const existing = await client.query<{ code_hash: string; response_json: RedeemAccepted }>(
        'SELECT code_hash, response_json FROM gateway_redeem_idempotency WHERE idempotency_key = $1',
        [request.idempotencyKey],
      );
      const stored = existing.rows[0];
      if (stored !== undefined) {
        if (stored.code_hash === presentedHash) {
          // A genuine retry. Replay verbatim; write nothing.
          return { ok: true as const, status: 202 as const, body: stored.response_json, replayed: true };
        }
        /*
         * The same key against a different code. The stored response is never
         * disclosed: an idempotency key is not an authenticator, and returning
         * the first request's result to a second requester would hand out a
         * gateway identity to whoever guessed a UUID.
         */
        await recordEnrollmentRefusal(client, {
          kind: 'idempotency_key_mismatch',
          idempotencyKey: request.idempotencyKey,
          detail: { reason: 'the key was first used with a different code' },
          sourceIp,
          recordedAt: now,
        });
        return { ok: false as const, status: 409 as const, code: 'idempotency_key_mismatch' as const };
      }

      // 2. Mint the identity first, before anything is consumed.
      const gatewayId = randomUUID();

      // 3. Classify by hash, then compare-and-consume atomically.
      const found = await client.query<{ pairing_id: string; expires_at: Date; consumed_at: Date | null }>(
        'SELECT pairing_id, expires_at, consumed_at FROM gateway_pairing_codes WHERE code_hash = $1',
        [presentedHash],
      );
      const minted = found.rows[0];

      if (minted === undefined) {
        /*
         * Unresolvable. Recorded by KIND ALONE — `resolved_code_hash` stays
         * null — so no attacker-chosen string becomes durable content in a
         * table that is never swept (§5 table 5).
         */
        await recordEnrollmentRefusal(client, {
          kind: 'unknown_code',
          detail: { reason: 'the presented code matches no minted code' },
          sourceIp,
          recordedAt: now,
        });
        return { ok: false as const, status: 409 as const, code: 'unknown_code' as const };
      }

      if (minted.consumed_at !== null) {
        await recordEnrollmentRefusal(client, {
          kind: 'code_consumed',
          pairingId: minted.pairing_id,
          resolvedCodeHash: presentedHash,
          detail: { consumedAt: minted.consumed_at.toISOString() },
          sourceIp,
          recordedAt: now,
        });
        return { ok: false as const, status: 409 as const, code: 'code_consumed' as const };
      }

      if (minted.expires_at <= now) {
        await recordEnrollmentRefusal(client, {
          kind: 'code_expired',
          pairingId: minted.pairing_id,
          resolvedCodeHash: presentedHash,
          detail: { expiresAt: minted.expires_at.toISOString() },
          sourceIp,
          recordedAt: now,
        });
        return { ok: false as const, status: 409 as const, code: 'code_expired' as const };
      }

      const consumed = await client.query<{ pairing_id: string }>(
        `UPDATE gateway_pairing_codes
            SET consumed_at = $1, consumed_by_gateway_id = $2
          WHERE code_hash = $3 AND consumed_at IS NULL AND expires_at > $1
          RETURNING pairing_id`,
        [now, gatewayId, presentedHash],
      );
      const pairingId = consumed.rows[0]?.pairing_id;
      if (pairingId === undefined) {
        // Lost the race. The winner consumed it between the read and the CAS.
        await recordEnrollmentRefusal(client, {
          kind: 'code_consumed',
          pairingId: minted.pairing_id,
          resolvedCodeHash: presentedHash,
          detail: { reason: 'lost the compare-and-consume race' },
          sourceIp,
          recordedAt: now,
        });
        return { ok: false as const, status: 409 as const, code: 'code_consumed' as const };
      }

      // 4. The lifecycle event and the awaiting projection row, one identity.
      const awaitingApprovalExpiresAt = new Date(
        now.getTime() + this.config.gatewayAwaitingApprovalTtlMs,
      );
      const seq = await insertRegistryEvent(client, {
        eventType: 'key_received',
        gatewayId,
        keyId: request.keyId,
        pubkey: request.rawPublicKey,
        hostDescriptor: request.hostDescriptor,
        pairingId,
        codeHash: presentedHash,
        actor: gatewayActor(gatewayId),
        attribution: GATEWAY_ATTRIBUTION,
        occurredAt: now,
        /*
         * The expiry lives in the payload as well as the projection column,
         * because the pure reducer replays from events alone and must be able
         * to reproduce the column exactly.
         */
        payload: {
          gatewayId,
          keyId: request.keyId,
          awaitingApprovalExpiresAt: awaitingApprovalExpiresAt.toISOString(),
        },
      });
      await upsertProjection(client, {
        gatewayId,
        state: 'awaiting_approval',
        keyId: request.keyId,
        pubkey: request.rawPublicKey,
        hostDescriptor: request.hostDescriptor,
        stateSince: now,
        lastEventSeq: seq,
        awaitingApprovalExpiresAt,
      });

      // 5. The idempotency record, carrying the full response, same transaction.
      const body: RedeemAccepted = {
        gatewayId,
        keyId: request.keyId,
        fingerprint: request.keyId,
        awaitingApprovalExpiresAt: awaitingApprovalExpiresAt.toISOString(),
      };
      await client.query(
        `INSERT INTO gateway_redeem_idempotency
           (idempotency_key, pairing_id, code_hash, response_json, status_code, recorded_at)
         VALUES ($1,$2,$3,$4,202,$5)`,
        [request.idempotencyKey, pairingId, presentedHash, JSON.stringify(body), now],
      );

      // 6. Commit happens in the transaction wrapper.
      return { ok: true as const, status: 202 as const, body, replayed: false };
    });
  }

  /* ---- projection replay, for the equality proof ---------------------- */

  /** Every lifecycle event in `seq` order, shaped for the pure reducer. */
  async readRegistryEvents(): Promise<readonly GatewayRegistryEvent[]> {
    const { rows } = await this.pool.query<{
      seq: string;
      event_type: GatewayRegistryEvent['eventType'];
      gateway_id: string | null;
      key_id: string | null;
      pubkey: Buffer | null;
      host_descriptor: HostDescriptor | null;
      occurred_at: Date;
      payload: Record<string, unknown>;
    }>(
      `SELECT seq, event_type, gateway_id, key_id, pubkey, host_descriptor, occurred_at, payload
         FROM gateway_registry_events ORDER BY seq ASC`,
    );

    return rows.map((row) => ({
      seq: Number(row.seq),
      eventType: row.event_type,
      gatewayId: row.gateway_id,
      keyId: row.key_id,
      pubkeyBase64: row.pubkey === null ? null : row.pubkey.toString('base64'),
      hostDescriptor: row.host_descriptor,
      occurredAt: row.occurred_at.toISOString(),
      awaitingApprovalExpiresAt:
        typeof row.payload['awaitingApprovalExpiresAt'] === 'string'
          ? row.payload['awaitingApprovalExpiresAt']
          : null,
    }));
  }

  /** The projection table, shaped for comparison with the reducer's output. */
  async readProjection(): Promise<ReadonlyMap<string, GatewayProjectionRow>> {
    const { rows } = await this.pool.query<ProjectionRowRaw>(
      `SELECT gateway_id, state, key_id, pubkey, host_descriptor, state_since,
              last_event_seq, awaiting_approval_expires_at, is_currently_enrolled,
              enrollment_slot
         FROM gateway_current_state`,
    );
    const map = new Map<string, GatewayProjectionRow>();
    for (const row of rows) {
      map.set(row.gateway_id, {
        gatewayId: row.gateway_id,
        state: row.state,
        keyId: row.key_id,
        pubkeyBase64: row.pubkey === null ? null : row.pubkey.toString('base64'),
        hostDescriptor: row.host_descriptor,
        stateSince: row.state_since.toISOString(),
        lastEventSeq: Number(row.last_event_seq),
        awaitingApprovalExpiresAt: row.awaiting_approval_expires_at?.toISOString() ?? null,
        isCurrentlyEnrolled: row.is_currently_enrolled,
        enrollmentSlot: row.enrollment_slot === null ? null : (Number(row.enrollment_slot) as EnrollmentSlot),
      });
    }
    return map;
  }

  /** Replay the log through the pure reducer. Used by the equality test. */
  async replayProjection(): Promise<ReadonlyMap<string, GatewayProjectionRow>> {
    return projectGatewayRegistry([...(await this.readRegistryEvents())]);
  }

  /* ---- rejection aggregation (§12) ------------------------------------ */

  /**
   * Count one classified signed-message failure.
   *
   * The durable identity is the resolved registry key id, or the literal
   * `unknown` — never a presented identifier. Per-minute cardinality is
   * therefore bounded by (registry keys + 1) x sources x error codes, whatever
   * an attacker sends (correction C6).
   */
  async recordMessageRejection(input: {
    readonly resolvedKeyId: string | null;
    readonly sourceIp: string;
    readonly errorCode: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO gateway_message_rejections
         (resolved_key_id, source_ip, error_code, minute_bucket)
       VALUES ($1, $2, $3, date_trunc('minute', now()))
       ON CONFLICT (resolved_key_id, source_ip, error_code, minute_bucket)
       DO UPDATE SET count = gateway_message_rejections.count + 1, last_seen_at = now()`,
      [input.resolvedKeyId ?? UNRESOLVED_KEY_ID, input.sourceIp, input.errorCode],
    );
  }

  /** One refusal row, in its own small transaction. Takes no L0-L3 locks. */
  async recordRefusal(input: {
    readonly kind: EnrollmentRefusalKind;
    readonly gatewayId?: string | null;
    readonly pairingId?: string | null;
    readonly resolvedCodeHash?: string | null;
    readonly idempotencyKey?: string | null;
    readonly detail: Record<string, unknown>;
    readonly sourceIp: string | null;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      const now = await transactionNow(client);
      await recordEnrollmentRefusal(client, { ...input, recordedAt: now });
    } finally {
      client.release();
    }
  }

  /* ---- shared transaction machinery ----------------------------------- */

  /**
   * Run `fn` in a transaction holding L2 and nothing else.
   *
   * `now` is read once, inside the transaction, and handed to the body — so
   * every row a single act writes agrees about when it happened, and no
   * process clock reaches a durable record.
   */
  async inRegistryTransaction<T>(fn: (client: PoolClient, now: Date) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [GATEWAY_REGISTRY_LOCK_KEY]);
      const now = await transactionNow(client);
      const result = await fn(client, now);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

/* --------------------------------------------------------------- helpers */

class EnrollmentCapReached extends Error {
  override readonly name = 'EnrollmentCapReached';
  constructor(readonly gatewayId: string) {
    super(`every enrollment slot is held; ${gatewayId} cannot be confirmed`);
  }
}

interface ProjectionRowRaw {
  readonly gateway_id: string;
  readonly state: GatewayState;
  readonly key_id: string | null;
  readonly pubkey: Buffer | null;
  readonly host_descriptor: HostDescriptor | null;
  readonly state_since: Date;
  readonly last_event_seq: string;
  readonly awaiting_approval_expires_at: Date | null;
  readonly is_currently_enrolled: boolean;
  readonly enrollment_slot: number | null;
}

export interface LockedProjection {
  readonly gateway_id: string;
  readonly state: GatewayState;
  readonly key_id: string | null;
  readonly pubkey: Buffer | null;
  readonly awaitingApprovalExpiresAt: Date | null;
}

function notFound(): FounderActResult {
  return { ok: false, status: 404, code: 'not_found' };
}

function refuse(code: EnrollmentRefusalKind): FounderActResult {
  return { ok: false, status: 409, code };
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The transaction's own clock. One read, one answer, for every row it writes. */
export async function transactionNow(client: PoolClient): Promise<Date> {
  const { rows } = await client.query<{ now: Date }>('SELECT now() AS now');
  const now = rows[0]?.now;
  if (now === undefined) throw new Error('the database returned no transaction timestamp');
  return now;
}

/** Row-lock a projection row, so a concurrent act on the same identity waits. */
export async function lockProjection(
  client: PoolClient,
  gatewayId: string,
): Promise<LockedProjection | null> {
  const { rows } = await client.query<{
    gateway_id: string;
    state: GatewayState;
    key_id: string | null;
    pubkey: Buffer | null;
    awaiting_approval_expires_at: Date | null;
  }>(
    `SELECT gateway_id, state, key_id, pubkey, awaiting_approval_expires_at
       FROM gateway_current_state WHERE gateway_id = $1 FOR UPDATE`,
    [gatewayId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    gateway_id: row.gateway_id,
    state: row.state,
    key_id: row.key_id,
    pubkey: row.pubkey,
    awaitingApprovalExpiresAt: row.awaiting_approval_expires_at,
  };
}

export async function insertRegistryEvent(
  client: PoolClient,
  input: RegistryEventInput,
): Promise<number> {
  const { rows } = await client.query<{ seq: string }>(
    `INSERT INTO gateway_registry_events
       (event_id, event_type, gateway_id, key_id, pubkey, host_descriptor,
        pairing_id, code_hash, actor, attribution, occurred_at, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING seq`,
    [
      randomUUID(),
      input.eventType,
      input.gatewayId,
      input.keyId ?? null,
      input.pubkey === undefined || input.pubkey === null ? null : Buffer.from(input.pubkey),
      input.hostDescriptor === undefined || input.hostDescriptor === null
        ? null
        : JSON.stringify(input.hostDescriptor),
      input.pairingId ?? null,
      input.codeHash ?? null,
      JSON.stringify(input.actor),
      JSON.stringify(input.attribution),
      input.occurredAt,
      JSON.stringify(input.payload),
    ],
  );
  const seq = rows[0]?.seq;
  if (seq === undefined) throw new Error('the registry event insert returned no seq');
  return Number(seq);
}

export interface ProjectionUpsert {
  readonly gatewayId: string;
  readonly state: GatewayState;
  readonly keyId: string | null;
  readonly pubkey: Uint8Array | null;
  readonly hostDescriptor: HostDescriptor | null;
  readonly stateSince: Date;
  readonly lastEventSeq: number;
  readonly awaitingApprovalExpiresAt: Date | null;
  /** The slot an `enrolled` row takes; required for `enrolled`, absent for every other state. */
  readonly enrollmentSlot?: EnrollmentSlot;
}

/**
 * Write the projection, mirroring the pure reducer field for field.
 *
 * The `COALESCE`s are the reducer's carry-forward rule: `key_received` is the
 * only event that establishes a key, a pubkey and a host descriptor, and the
 * state-moving events that follow do not restate them. The expiry is NOT
 * carried forward — an approval deadline describes nothing once an identity has
 * left `awaiting_approval`.
 */
export async function upsertProjection(client: PoolClient, input: ProjectionUpsert): Promise<void> {
  /*
   * An enrolled row holds a slot and no other row does; the table's CHECK
   * says the same, and saying it here first names the caller's mistake.
   */
  const enrolled = input.state === 'enrolled';
  if (enrolled !== (input.enrollmentSlot !== undefined)) {
    throw new Error(`a ${input.state} projection row ${enrolled ? 'needs' : 'cannot take'} an enrollment slot`);
  }
  await client.query(
    `INSERT INTO gateway_current_state
       (gateway_id, state, key_id, pubkey, host_descriptor, state_since,
        last_event_seq, awaiting_approval_expires_at, is_currently_enrolled,
        enrollment_slot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (gateway_id) DO UPDATE SET
       state = EXCLUDED.state,
       key_id = COALESCE(EXCLUDED.key_id, gateway_current_state.key_id),
       pubkey = COALESCE(EXCLUDED.pubkey, gateway_current_state.pubkey),
       host_descriptor = COALESCE(EXCLUDED.host_descriptor, gateway_current_state.host_descriptor),
       state_since = EXCLUDED.state_since,
       last_event_seq = EXCLUDED.last_event_seq,
       awaiting_approval_expires_at = EXCLUDED.awaiting_approval_expires_at,
       is_currently_enrolled = EXCLUDED.is_currently_enrolled,
       enrollment_slot = EXCLUDED.enrollment_slot`,
    [
      input.gatewayId,
      input.state,
      input.keyId,
      input.pubkey === null ? null : Buffer.from(input.pubkey),
      input.hostDescriptor === null ? null : JSON.stringify(input.hostDescriptor),
      input.stateSince,
      input.lastEventSeq,
      input.awaitingApprovalExpiresAt,
      enrolled,
      input.enrollmentSlot ?? null,
    ],
  );
}

export async function recordEnrollmentRefusal(
  client: PoolClient,
  input: {
    readonly kind: EnrollmentRefusalKind;
    readonly gatewayId?: string | null;
    readonly pairingId?: string | null;
    readonly resolvedCodeHash?: string | null;
    readonly idempotencyKey?: string | null;
    readonly detail: Record<string, unknown>;
    readonly sourceIp: string | null;
    readonly recordedAt: Date;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO gateway_enrollment_refusals
       (kind, gateway_id, pairing_id, resolved_code_hash, idempotency_key, detail, source_ip, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.kind,
      input.gatewayId ?? null,
      input.pairingId ?? null,
      /*
       * Stored ONLY when the presentation resolved to a minted code. An
       * unresolvable presentation is recorded by kind alone, so no attacker-
       * chosen string becomes durable content in a table nothing sweeps.
       */
      input.resolvedCodeHash ?? null,
      input.idempotencyKey ?? null,
      JSON.stringify(input.detail),
      input.sourceIp,
      input.recordedAt,
    ],
  );
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; constraint?: unknown };
  return candidate.code === '23505' && candidate.constraint === constraint;
}
