/**
 * The signed routes: session-challenge, session-start, heartbeat — and
 * promotion reconciliation, which shares their availability machinery
 * (contract §7, §9, §12).
 *
 * The ordering in each handler is not stylistic. Reading down `sessionStart`
 * you can check each of the contract's claims in turn, and several of them are
 * only true because of where a step sits:
 *
 *   - resource-exhaustion limiting precedes signature work, so an unauthenticated
 *     flood cannot make the process do Ed25519;
 *   - the clock check precedes everything that derives state, so an unreliable
 *     clock refuses rather than stamping a row it cannot justify;
 *   - the nonce is recorded BEFORE any verdict is returned, so a probe captured
 *     at `403 awaiting_approval` is already dead when it is replayed after a
 *     later confirmation;
 *   - the registry-state verdict is reached only inside the fenced transaction,
 *     after the advisory-locked re-read, so a revocation cannot race an
 *     acceptance.
 */

import { randomBytes, verify as cryptoVerify, createPublicKey } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  encodeBase64Url,
  decodeTransportSignature,
  heartbeatSignedBytes,
  sessionStartSignedBytes,
  timestampWithinWindow,
  validateHeartbeat,
  validateSessionStart,
  type HeartbeatEnvelope,
  type SessionStartEnvelope,
} from '../../../gateway-protocol/src/index.js';
import type { GatewayState } from '../../../gateway-registry/src/index.js';
import { challengeFreshnessDeadlineMs, type Config } from '../config.js';
import type { Phase3RunStore } from '../phase3-run.js';
import type { ClockGate } from './clock.js';
import { readLease } from './fence.js';
import type { GatewayLeadership } from './leadership.js';
import type { GatewayRegistryStore } from './store.js';
import {
  insertTransition,
  latestTransition,
  planHeartbeatEdges,
} from './availability.js';
import type { EpochKey, GatewaySessionState, StagedEffects } from './session-state.js';

export interface RouteResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export interface SessionServiceDeps {
  readonly pool: Pool;
  readonly config: Config;
  readonly clock: ClockGate;
  readonly session: GatewaySessionState;
  readonly leadership: GatewayLeadership;
  readonly store: GatewayRegistryStore;
  readonly phase3Runs: Phase3RunStore;
}

interface ResolvedKey {
  readonly gatewayId: string;
  readonly keyId: string;
  readonly state: GatewayState;
  readonly rawPublicKey: Uint8Array;
}

export class GatewaySessionService {
  private readonly pool: Pool;
  private readonly config: Config;
  private readonly clock: ClockGate;
  private readonly session: GatewaySessionState;
  private readonly leadership: GatewayLeadership;
  private readonly store: GatewayRegistryStore;
  private readonly phase3Runs: Phase3RunStore;

  /**
   * Set when reconciliation could not write its edges because the clock was
   * unreliable. Retried from the sweep tick once the clock recovers, so the
   * deferred `went_offline` is stamped from a wall clock that can be trusted.
   */
  private reconciliationDeferred = false;

  constructor(deps: SessionServiceDeps) {
    this.pool = deps.pool;
    this.config = deps.config;
    this.clock = deps.clock;
    this.session = deps.session;
    this.leadership = deps.leadership;
    this.store = deps.store;
    this.phase3Runs = deps.phase3Runs;
  }

  get hasDeferredReconciliation(): boolean {
    return this.reconciliationDeferred;
  }

  /* ---- GET /gateway/session-challenge --------------------------------- */

  /**
   * Read the published challenge from the lease row.
   *
   * Not leader-gated: any replica returns identical values because there is no
   * process-local challenge anywhere in this system. A follower answering this
   * is not a degraded answer, it is the same answer.
   */
  async challenge(): Promise<RouteResult> {
    const lease = await readLease(this.pool);
    if (lease.challenge === null || lease.challengePublishedAt === null) {
      // No leader has ever acquired, so no challenge has ever been minted.
      return { status: 503, body: { error: 'not_leader' } };
    }
    return {
      status: 200,
      body: {
        generation: lease.generation,
        challenge: lease.challenge,
        issuedAt: lease.challengePublishedAt.toISOString(),
      },
    };
  }

  /* ---- POST /gateway/session-start ------------------------------------ */

  async sessionStart(body: unknown, sourceIp: string): Promise<RouteResult> {
    // Clock reliability, before anything derives state (§4).
    if (!this.clock.reliable) {
      return this.refuse(503, 'clock_unreliable', null, sourceIp);
    }

    // Structural parse and validation.
    const parsed = validateSessionStart(body);
    if (!parsed.ok) {
      return this.refuse(parsed.error === 'purpose_mismatch' ? 401 : 400, parsed.error, null, sourceIp);
    }
    const envelope = parsed.envelope;

    // Key resolution, then Ed25519 verification against the RESOLVED key.
    const resolved = await this.resolveKey(envelope.gatewayId, envelope.keyId);
    if (resolved === null) return this.refuse(401, 'unknown_key', null, sourceIp);

    if (!this.verify(resolved, sessionStartSignedBytes(canonicalOf(envelope)), envelope.signature)) {
      return this.refuse(401, 'bad_signature', resolved.keyId, sourceIp);
    }

    const freshEpoch = randomBytes(32).toString('hex');

    const outcome = await this.leadership.runFenced<RouteResult>(
      { pipeline: 'sessionStart', takeL0: true, takeRegistryLock: true, verifyServingGeneration: true },
      async (ctx) => {
        /*
         * "Now" is read INSIDE the fence (correction B2, Rev 4.7 tester). A
         * request that waited for L0, the advisory lock, or a slow validation is
         * judged against the moment it EXECUTES, not the moment it arrived —
         * every deadline below is a claim about the present, and only this
         * sample is the present.
         */
        const wallNow = this.clock.wallNow();

        const row = await readProjectionRow(ctx.client, envelope.gatewayId);
        if (row === null) return rollback({ status: 401, body: { error: 'unknown_key' } });

        const lease = ctx.leaseRow;

        /*
         * Generation AND challenge must both equal the current lease row. This
         * is what bounds an envelope's acceptance lifetime to one challenge
         * epoch regardless of its own timestamp — a later challenge makes every
         * prior envelope permanently stale, which is what kills a far-future
         * capture that no TTL could.
         */
        if (envelope.generation !== lease.generation) {
          return rollback({ status: 409, body: { error: 'stale_generation' } });
        }
        if (lease.challenge === null || envelope.challenge !== lease.challenge) {
          return rollback({ status: 409, body: { error: 'stale_challenge' } });
        }

        /*
         * Challenge freshness, verified at READ time inside the transaction. A
         * `setInterval` proves nothing about timeliness, so the guarantee is
         * enforced where it is consumed: an overdue challenge fails closed for
         * new admissions until a rotation actually succeeds.
         */
        const deadlineMs = challengeFreshnessDeadlineMs(this.config);
        const publishedAt = lease.challengePublishedAt;
        if (publishedAt === null || wallNow - publishedAt.getTime() > deadlineMs) {
          return rollback({ status: 503, body: { error: 'challenge_overdue' } });
        }

        const epoch: EpochKey = { generation: lease.generation, challenge: lease.challenge };

        /*
         * The live nonce store must belong to the epoch this transaction just
         * fenced. In a healthy process it always does — acquisition adopts the
         * epoch the acquire statement minted, and rotation swaps it under L0
         * after a clean COMMIT — but the consequence of the two disagreeing is
         * severe enough that it is checked rather than argued: a mismatched
         * store would make the two checks below inspect the wrong set and admit
         * an envelope with no replay protection at all. Fail closed instead.
         */
        if (!this.session.isActiveEpoch(epoch)) {
          return rollback({ status: 503, body: { error: 'not_leader' } });
        }

        // Nonce: duplicate first, then capacity, then record.
        if (this.session.hasNonce(envelope.nonce)) {
          return rollback({ status: 409, body: { error: 'nonce_replay' } });
        }
        if (!this.session.hasNonceCapacity()) {
          /*
           * Refused WITHOUT recording, and that is safe precisely because the
           * store is grow-only within its epoch: it never frees intra-epoch
           * space, so an unrecorded envelope can never be accepted in its own
           * epoch, and in any later epoch its challenge is already dead.
           */
          return rollback({ status: 503, body: { error: 'nonce_capacity' } });
        }

        const staged: StagedEffects = {
          epoch,
          generation: lease.generation,
          nonce: envelope.nonce,
        };

        // Timestamp window — AFTER the nonce is staged, so a timestamp-refused
        // envelope still burns its nonce and cannot be resubmitted later.
        if (!timestampWithinWindow(envelope.timestampMs, wallNow, this.config.gatewayTimestampWindowMs)) {
          return { value: { status: 409, body: { error: 'stale_timestamp' } }, commit: true, staged };
        }

        // The registry-state verdict, reached only here.
        if (row.state !== 'enrolled') {
          return { value: { status: 403, body: { error: row.state } }, commit: true, staged };
        }

        /*
         * Accepted. Session-start replaces exactly the cursor and touches
         * liveness not at all: it does not set liveness, records no
         * `went_online`, and cannot make `gatewayOnline` true. Only an accepted
         * heartbeat does that (correction C2).
         */
        return {
          value: {
            status: 200,
            body: { ok: true, state: 'enrolled', epoch: freshEpoch, gatewayId: envelope.gatewayId },
          },
          commit: true,
          staged: {
            ...staged,
            cursor: {
              gatewayId: envelope.gatewayId,
              cursor: { epoch: freshEpoch, lastSequence: 0, generation: lease.generation },
            },
          },
        };
      },
    );

    return this.finishSigned(outcome, resolved.keyId, sourceIp);
  }

  /* ---- POST /gateway/heartbeat ---------------------------------------- */

  async heartbeat(body: unknown, sourceIp: string): Promise<RouteResult> {
    if (!this.clock.reliable) {
      return this.refuse(503, 'clock_unreliable', null, sourceIp);
    }

    const parsed = validateHeartbeat(body);
    if (!parsed.ok) {
      return this.refuse(parsed.error === 'purpose_mismatch' ? 401 : 400, parsed.error, null, sourceIp);
    }
    const envelope = parsed.envelope;

    const resolved = await this.resolveKey(envelope.gatewayId, envelope.keyId);
    if (resolved === null) return this.refuse(401, 'unknown_key', null, sourceIp);

    const signedBytes = heartbeatSignedBytes(canonicalOf(envelope));
    if (!this.verify(resolved, signedBytes, envelope.signature)) {
      return this.refuse(401, 'bad_signature', resolved.keyId, sourceIp);
    }
    const signature = decodeTransportSignature(envelope.signature);
    if (signature === null) return this.refuse(400, 'invalid_request', resolved.keyId, sourceIp);

    const outcome = await this.leadership.runFenced<RouteResult>(
      { pipeline: 'heartbeat', takeL0: true, takeRegistryLock: true, verifyServingGeneration: true },
      async (ctx) => {
        // Both clock sources inside the fence, for the same reason as
        // session-start (correction B2): the window and the staleness judgement
        // are claims about now, and the wait for the fence is part of now.
        const wallNow = this.clock.wallNow();
        const monoNow = this.clock.monotonicNow();

        // The authoritative re-read, under the advisory lock.
        const row = await readProjectionRow(ctx.client, envelope.gatewayId);
        if (row === null) return rollback({ status: 401, body: { error: 'unknown_key' } });
        if (row.state !== 'enrolled') {
          return rollback({ status: 403, body: { error: row.state } });
        }

        const cursor = this.session.cursorFor(envelope.gatewayId);
        /*
         * The current epoch is NEVER echoed on a refusal. Echoing it would turn
         * a 409 into an oracle that hands a caller the very value it failed to
         * present. The 200 body carries it, because a caller that reached 200
         * proved it holds the key.
         */
        if (cursor === null || cursor.epoch !== envelope.epoch) {
          return rollback({ status: 409, body: { error: 'session_required' } });
        }
        if (envelope.sequence <= cursor.lastSequence) {
          return rollback({ status: 409, body: { error: 'stale_sequence' } });
        }
        if (!timestampWithinWindow(envelope.timestampMs, wallNow, this.config.gatewayTimestampWindowMs)) {
          return rollback({ status: 409, body: { error: 'stale_timestamp' } });
        }

        /*
         * A counted-run attempt captures exactly one already-accepted signed
         * heartbeat. The insert shares this fenced transaction with the
         * cursor/liveness publication: if evidence cannot commit, neither can
         * the heartbeat. With no active attempt this is a bounded no-op, so
         * the normal ten-second cadence adds no durable run rows.
         */
        await this.phase3Runs.captureHeartbeat(ctx.client, {
          gatewayId: envelope.gatewayId,
          keyId: resolved.keyId,
          sequence: envelope.sequence,
          timestampMs: envelope.timestampMs,
          signedBytes,
          signature,
          publicKey: resolved.rawPublicKey,
          acceptedAt: new Date(wallNow),
          freshnessWindowMs: this.config.gatewayTimestampWindowMs,
          signatureVerified: true,
        });

        // Transition logic. A stale-liveness case cannot arise from an
        // unreliable clock: the beat was already refused above if it were.
        const liveness = this.session.livenessFor(envelope.gatewayId);
        const isStale =
          liveness !== null && monoNow - liveness.monoMs > this.config.gatewayStalenessMs;
        const latest = await latestTransition(ctx.client, envelope.gatewayId);

        const edges = planHeartbeatEdges({
          livenessWallMs: liveness?.wallMs ?? null,
          isStale,
          latest,
          beatWallMs: wallNow,
          stalenessMs: this.config.gatewayStalenessMs,
        });
        for (const edge of edges) {
          await insertTransition(ctx.client, {
            gatewayId: envelope.gatewayId,
            transition: edge.transition,
            occurredAt: edge.occurredAt,
            lastHeartbeatAt: edge.lastHeartbeatAt,
          });
        }

        return {
          value: {
            status: 200,
            body: { ok: true, state: 'enrolled', epoch: cursor.epoch },
          },
          commit: true,
          staged: {
            epoch: this.session.activeEpoch(),
            generation: ctx.leaseRow.generation,
            cursor: {
              gatewayId: envelope.gatewayId,
              cursor: { ...cursor, lastSequence: envelope.sequence },
            },
            liveness: { gatewayId: envelope.gatewayId, value: { wallMs: wallNow, monoMs: monoNow } },
          },
        };
      },
    );

    return this.finishSigned(outcome, resolved.keyId, sourceIp);
  }

  /* ---- promotion reconciliation (§7) ---------------------------------- */

  /**
   * Bring the durable availability history into agreement with a fresh
   * leader's empty map.
   *
   * A gateway whose latest retained row says online, for which this leader
   * holds no live session, is honestly offline — nobody has re-established it.
   * A gateway with no retained row at all is offline by absence and needs no
   * write, which is why the ninety-day sweep can delete everything without
   * leaving an immortal marker behind (correction C10).
   */
  async reconcile(context: { readonly generation: number }): Promise<boolean> {
    if (!this.clock.reliable) {
      /*
       * Defer rather than stamp `occurred_at` from a clock we have refused to
       * trust for every other purpose. Safe: absence of liveness already derives
       * offline, so nothing serves a wrong answer in the meantime.
       */
      this.reconciliationDeferred = true;
      return true;
    }

    const result = await this.leadership.runFenced<number>(
      {
        pipeline: 'reconciliation',
        takeL0: false,
        takeRegistryLock: true,
        verifyServingGeneration: false,
      },
      async (ctx) => {
        // Same fence-time discipline as the signed routes (correction B2): the
        // `occurred_at` these edges carry is stamped from inside the fence.
        const wallNow = this.clock.wallNow();

        const { rows } = await ctx.client.query<{ gateway_id: string }>(
          'SELECT gateway_id FROM gateway_current_state',
        );

        let written = 0;
        for (const row of rows) {
          const latest = await latestTransition(ctx.client, row.gateway_id);
          if (latest !== 'went_online') continue;
          // The map is provably empty post-acquisition, so no live session can
          // exist for anyone; the check is stated anyway because the claim is
          // "the leader holds no live session", not "the map happens to be new".
          if (this.session.livenessFor(row.gateway_id) !== null) continue;

          await insertTransition(ctx.client, {
            gatewayId: row.gateway_id,
            transition: 'went_offline',
            occurredAt: new Date(wallNow),
            lastHeartbeatAt: null,
          });
          written += 1;
        }
        void context;
        return { value: written, commit: true };
      },
    );

    if (result.status === 'published') {
      this.reconciliationDeferred = false;
      return true;
    }
    // Demoted mid-flight, or the commit failed. `servingGeneration` must not be
    // set: a demoted process may never resurrect a serving flag.
    return false;
  }

  /** Retry a reconciliation that deferred because the clock was unreliable. */
  async retryDeferredReconciliation(): Promise<void> {
    if (!this.reconciliationDeferred) return;
    if (!this.clock.reliable) return;
    if (!this.leadership.isLeader) return;
    await this.reconcile({ generation: this.leadership.currentGeneration });
  }

  /* ---- shared ---------------------------------------------------------- */

  /**
   * Resolve `(gatewayId, keyId)` to a registry identity.
   *
   * BOTH members are bound. The signature covers both, so a valid signature
   * over a mismatched pair means the key holder claimed an identity that is not
   * theirs — and the honest answer to "which registry row is that" is none.
   */
  private async resolveKey(gatewayId: string, keyId: string): Promise<ResolvedKey | null> {
    const { rows } = await this.pool.query<{
      gateway_id: string;
      key_id: string;
      state: GatewayState;
      pubkey: Buffer | null;
    }>(
      `SELECT gateway_id, key_id, state, pubkey FROM gateway_current_state
        WHERE gateway_id = $1 AND key_id = $2`,
      [gatewayId, keyId],
    );
    const row = rows[0];
    if (row === undefined || row.pubkey === null || row.key_id === null) return null;
    return {
      gatewayId: row.gateway_id,
      keyId: row.key_id,
      state: row.state,
      rawPublicKey: new Uint8Array(row.pubkey),
    };
  }

  /** Verify against the registry's key, never against anything the client sent. */
  private verify(resolved: ResolvedKey, signedBytes: Uint8Array, signature: string): boolean {
    try {
      const publicKey = createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: encodeBase64Url(resolved.rawPublicKey) },
        format: 'jwk',
      });
      return cryptoVerify(
        null,
        Buffer.from(signedBytes),
        publicKey,
        Buffer.from(signature, 'base64'),
      );
    } catch {
      return false;
    }
  }

  /** A structured refusal, counted in the aggregation under the right identity. */
  private async refuse(
    status: number,
    error: string,
    resolvedKeyId: string | null,
    sourceIp: string,
  ): Promise<RouteResult> {
    await this.store
      .recordMessageRejection({ resolvedKeyId, sourceIp, errorCode: error })
      .catch(() => undefined);
    return { status, body: { error } };
  }

  /**
   * Turn a fenced outcome into a response, aggregating any classified failure.
   *
   * `not_leader` after COMMIT is the interesting case: the durable write stands,
   * nothing was published, and the daemon is told 503 — so it never sees
   * `accepted` for a request whose leadership had already lapsed.
   */
  private async finishSigned(
    outcome: Awaited<ReturnType<GatewayLeadership['runFenced']>>,
    resolvedKeyId: string,
    sourceIp: string,
  ): Promise<RouteResult> {
    if (outcome.status === 'published' || outcome.status === 'rolled_back') {
      const result = outcome.value as RouteResult;
      if (result.status >= 400) {
        await this.store
          .recordMessageRejection({
            resolvedKeyId,
            sourceIp,
            errorCode: String(result.body['error'] ?? 'unclassified'),
          })
          .catch(() => undefined);
      }
      return result;
    }
    if (outcome.status === 'not_leader') {
      return this.refuse(503, 'not_leader', resolvedKeyId, sourceIp);
    }
    return this.refuse(500, 'commit_failed', resolvedKeyId, sourceIp);
  }
}

/* --------------------------------------------------------------- helpers */

function rollback(result: RouteResult): { value: RouteResult; commit: false } {
  return { value: result, commit: false };
}

function canonicalOf(envelope: SessionStartEnvelope): {
  gatewayId: string;
  keyId: string;
  generation: number;
  challenge: string;
  nonce: string;
  timestampMs: number;
};
function canonicalOf(envelope: HeartbeatEnvelope): {
  gatewayId: string;
  keyId: string;
  epoch: string;
  sequence: number;
  nonce: string;
  timestampMs: number;
};
function canonicalOf(envelope: SessionStartEnvelope | HeartbeatEnvelope): Record<string, unknown> {
  const { protocol: _p, version: _v, purpose: _u, pubkey: _k, signature: _s, ...canonical } = envelope;
  return canonical;
}

interface ProjectionRow {
  readonly gatewayId: string;
  readonly state: GatewayState;
  readonly keyId: string | null;
}

async function readProjectionRow(
  client: PoolClient,
  gatewayId: string,
): Promise<ProjectionRow | null> {
  const { rows } = await client.query<{ gateway_id: string; state: GatewayState; key_id: string | null }>(
    'SELECT gateway_id, state, key_id FROM gateway_current_state WHERE gateway_id = $1',
    [gatewayId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return { gatewayId: row.gateway_id, state: row.state, keyId: row.key_id };
}
