import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Config } from './config.js';
import { GATEWAY_REGISTRY_LOCK_KEY } from './migrations.js';

export const PHASE3_RUN_LABELS = ['Phase3-CR1', 'Phase3-CR2', 'Phase3-CR3'] as const;
export type Phase3RunLabel = (typeof PHASE3_RUN_LABELS)[number];

export const PHASE3_EVIDENCE_AUTHORIZES =
  'Nothing. This evidence records one Phase 3 counted-run attempt and confers no ' +
  'activation, merge, deployment, spend, later-phase, or Founder authority.';

export const PHASE3_LIFECYCLE_STAGES = [
  'connect',
  'adapter_registered',
  'request',
  'matched_response',
  'disconnect',
] as const;
export type Phase3LifecycleStage = (typeof PHASE3_LIFECYCLE_STAGES)[number];

export const PHASE3_REASON_CODES = [
  'attempt_identity_invalid',
  'authorization_invalid',
  'governing_sha_invalid',
  'gateway_identity_invalid',
  'context_invalid',
  'gateway_health_failed',
  'enrollment_projection_failed',
  'control_plane_status_failed',
  'daemon_unreachable',
  'lane_state_failed',
  'custody_failed',
  'staging_lock_present',
  'build_sha_mismatch',
  'node_version_mismatch',
  'build_failed',
  'fixture_sha_mismatch',
  'gateway_not_enrolled',
  'heartbeat_timeout',
  'heartbeat_invalid',
  'bad_signature',
  'stale_heartbeat',
  'fixture_unavailable',
  'missing_stage',
  'duplicate_stage',
  'out_of_order_stage',
  'response_mismatch',
  'operator_interrupted',
  'teardown_failed',
  'evidence_write_failed',
  'internal_error',
] as const;
export type Phase3ReasonCode = (typeof PHASE3_REASON_CODES)[number];

type Invalid = { readonly ok: false; readonly code: 'invalid_request' };
type Valid<T> = { readonly ok: true; readonly value: T };

export interface Phase3AttemptInput {
  readonly mode: 'started' | 'not_started';
  readonly runAttemptId: string;
  readonly runLabel: Phase3RunLabel;
  readonly entryAuthorizationId: string;
  readonly revocationAuthorizationId?: string;
  readonly founderOsSha: string;
  readonly buildRoomSha: string;
  readonly fixtureRepository: string;
  readonly fixtureSha: string;
  readonly gatewayId: string;
  readonly expectedEnrollments: readonly {
    readonly gatewayId: string;
    readonly state: 'enrolled' | 'denied' | 'revoked' | 'expired';
  }[];
  readonly machineIdentity: string;
  readonly entryEvidenceSha256: string;
  readonly reasonCode?: Phase3ReasonCode;
}

export type Phase3EventInput =
  | {
      readonly kind: 'lifecycle_stage';
      readonly idempotencyKey: string;
      readonly stage: Phase3LifecycleStage;
      readonly artifactSha256: string;
      readonly exchangeId?: string;
      readonly matchedRequestEventId?: string;
      readonly matchVerified?: true;
    }
  | {
      readonly kind: 'attempt_finished';
      readonly idempotencyKey: string;
      readonly result: 'awaiting_adjudication' | 'failed' | 'interrupted';
      readonly teardownResult: 'completed' | 'failed' | 'not_required';
      readonly teardownEvidenceSha256: string;
      readonly reasonCode?: Phase3ReasonCode;
    };

export function validatePhase3AttemptInput(body: unknown): Valid<Phase3AttemptInput> | Invalid {
  const record = asRecord(body);
  if (record === null || (record['mode'] !== 'started' && record['mode'] !== 'not_started')) {
    return INVALID;
  }
  const mode = record['mode'];
  const cr3 = record['runLabel'] === 'Phase3-CR3';
  const expected = [
    ...ATTEMPT_FIELDS,
    ...(cr3 ? ['revocationAuthorizationId'] : []),
    ...(mode === 'not_started' ? ['reasonCode'] : []),
  ];
  if (!exactFields(record, expected)) return INVALID;

  if (
    !UUID_RE.test(string(record['runAttemptId'])) ||
    !includes(PHASE3_RUN_LABELS, record['runLabel']) ||
    !SAFE_ID_RE.test(string(record['entryAuthorizationId'])) ||
    (cr3 && !SAFE_ID_RE.test(string(record['revocationAuthorizationId']))) ||
    !SHA_RE.test(string(record['founderOsSha'])) ||
    !SHA_RE.test(string(record['buildRoomSha'])) ||
    !REPOSITORY_RE.test(string(record['fixtureRepository'])) ||
    !SHA_RE.test(string(record['fixtureSha'])) ||
    !UUID_RE.test(string(record['gatewayId'])) ||
    !validExpectedEnrollments(record['expectedEnrollments'], string(record['gatewayId'])) ||
    !SAFE_LABEL_RE.test(string(record['machineIdentity'])) ||
    !SHA256_RE.test(string(record['entryEvidenceSha256']))
  ) {
    return INVALID;
  }
  if (mode === 'not_started' && !includes(PHASE3_REASON_CODES, record['reasonCode'])) return INVALID;

  return { ok: true, value: record as unknown as Phase3AttemptInput };
}

export function validatePhase3EventInput(body: unknown): Valid<Phase3EventInput> | Invalid {
  const record = asRecord(body);
  if (record === null || !UUID_RE.test(string(record['idempotencyKey']))) return INVALID;

  if (record['kind'] === 'lifecycle_stage') {
    if (!includes(PHASE3_LIFECYCLE_STAGES, record['stage'])) return INVALID;
    const stage = record['stage'];
    const expected =
      stage === 'request'
        ? [...LIFECYCLE_FIELDS, 'exchangeId']
        : stage === 'matched_response'
          ? [...LIFECYCLE_FIELDS, 'exchangeId', 'matchedRequestEventId', 'matchVerified']
          : LIFECYCLE_FIELDS;
    if (!exactFields(record, expected) || !SHA256_RE.test(string(record['artifactSha256']))) {
      return INVALID;
    }
    if (stage === 'request' && !UUID_RE.test(string(record['exchangeId']))) return INVALID;
    if (
      stage === 'matched_response' &&
      (!UUID_RE.test(string(record['exchangeId'])) ||
        !UUID_RE.test(string(record['matchedRequestEventId'])) ||
        record['matchVerified'] !== true)
    ) {
      return INVALID;
    }
    return { ok: true, value: record as unknown as Phase3EventInput };
  }

  if (record['kind'] === 'attempt_finished') {
    const result = record['result'];
    if (result !== 'awaiting_adjudication' && result !== 'failed' && result !== 'interrupted') {
      return INVALID;
    }
    const expected =
      result === 'awaiting_adjudication'
        ? FINISH_SUCCESS_FIELDS
        : [...FINISH_SUCCESS_FIELDS, 'reasonCode'];
    if (!exactFields(record, expected)) return INVALID;
    if (
      record['teardownResult'] !== 'completed' &&
      record['teardownResult'] !== 'failed' &&
      record['teardownResult'] !== 'not_required'
    ) {
      return INVALID;
    }
    if (!SHA256_RE.test(string(record['teardownEvidenceSha256']))) {
      return INVALID;
    }
    if (result === 'awaiting_adjudication') {
      if (record['teardownResult'] !== 'completed' || record['teardownEvidenceSha256'] === undefined) {
        return INVALID;
      }
    } else if (!includes(PHASE3_REASON_CODES, record['reasonCode'])) {
      return INVALID;
    }
    return { ok: true, value: record as unknown as Phase3EventInput };
  }

  return INVALID;
}

const INVALID: Invalid = { ok: false, code: 'invalid_request' };
const ATTEMPT_FIELDS = [
  'mode',
  'runAttemptId',
  'runLabel',
  'entryAuthorizationId',
  'founderOsSha',
  'buildRoomSha',
  'fixtureRepository',
  'fixtureSha',
  'gatewayId',
  'expectedEnrollments',
  'machineIdentity',
  'entryEvidenceSha256',
] as const;
const LIFECYCLE_FIELDS = ['kind', 'idempotencyKey', 'stage', 'artifactSha256'] as const;
const FINISH_SUCCESS_FIELDS = [
  'kind',
  'idempotencyKey',
  'result',
  'teardownResult',
  'teardownEvidenceSha256',
] as const;
const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_ID_RE = /^[A-Za-z0-9._:/-]{1,128}$/;
const SAFE_LABEL_RE = /^[A-Za-z0-9._:/+ -]{1,128}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function exactFields(record: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(record).sort();
  return keys.length === fields.length && keys.every((key, index) => key === [...fields].sort()[index]);
}

function includes<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function validExpectedEnrollments(value: unknown, gatewayId: string): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const seen = new Set<string>();
  let enrolled = 0;
  for (const raw of value) {
    const row = asRecord(raw);
    if (
      row === null ||
      !exactFields(row, ['gatewayId', 'state']) ||
      !UUID_RE.test(string(row['gatewayId'])) ||
      !PROJECTION_STATES.includes(row['state'] as never) ||
      seen.has(string(row['gatewayId']))
    ) {
      return false;
    }
    seen.add(string(row['gatewayId']));
    if (row['state'] === 'enrolled') {
      enrolled += 1;
      if (row['gatewayId'] !== gatewayId) return false;
    }
  }
  return enrolled === 1;
}

const PROJECTION_STATES = ['enrolled', 'denied', 'revoked', 'expired'] as const;

export interface Phase3HeartbeatEvidence {
  readonly gatewayId: string;
  readonly keyId: string;
  readonly sequence: number;
  readonly timestampMs: number;
  readonly signedBytes: Uint8Array;
  readonly signature: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly acceptedAt: Date;
  readonly freshnessWindowMs: number;
  readonly signatureVerified: true;
}

export interface Phase3AppendResult {
  readonly accepted: boolean;
  readonly eventId: string;
  readonly replayed: boolean;
  readonly reasonCode?: Phase3ReasonCode;
}

export interface Phase3AttemptCreation {
  readonly created: boolean;
  readonly runAttemptId: string;
  readonly state: string;
}

export interface Phase3EvidenceExpectation {
  readonly attempt: Phase3AttemptInput;
  readonly environment: string;
}

export interface Phase3EvidenceExport {
  readonly schema: 'build-room/phase3-run-evidence@1';
  readonly context: { readonly commit: string; readonly environment: string };
  readonly attempt: {
    readonly runAttemptId: string;
    readonly runLabel: Phase3RunLabel;
    readonly entryAuthorizationId: string;
    readonly revocationAuthorizationId: string | null;
    readonly founderOsSha: string;
    readonly buildRoomSha: string;
    readonly fixtureRepository: string;
    readonly fixtureSha: string;
    readonly gatewayId: string;
    readonly enrollmentProjectionSha256: string;
    readonly machineIdentity: string;
    readonly environmentLabel: string;
    readonly entryEvidenceSha256: string;
    readonly state: string;
    readonly startedAt: string;
    readonly finishedAt: string | null;
  };
  readonly events: readonly {
    readonly eventId: string;
    readonly eventIndex: number;
    readonly eventType: string;
    readonly idempotencyKey: string | null;
    readonly requestSha256: string | null;
    readonly lifecycleStage: string | null;
    readonly stageArtifactSha256: string | null;
    readonly exchangeId: string | null;
    readonly matchedRequestEventId: string | null;
    readonly matchVerified: boolean | null;
    readonly reasonCode: string | null;
    readonly result: string | null;
    readonly teardownResult: string | null;
    readonly teardownEvidenceSha256: string | null;
    readonly occurredAt: string;
  }[];
  readonly heartbeat: {
    readonly algorithm: 'Ed25519';
    readonly keyId: string;
    readonly sequence: number;
    readonly timestampMs: number;
    readonly acceptedAt: string;
    readonly freshnessMs: number;
    readonly freshnessWindowMs: number;
    readonly signedBytesBase64: string;
    readonly signatureBase64: string;
    readonly publicKeyBase64: string;
    readonly signatureVerified: true;
  } | null;
  readonly authorizes: string;
}

export class Phase3RunConflictError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'Phase3RunConflictError';
  }
}

interface AttemptRow {
  readonly run_attempt_id: string;
  readonly run_label: Phase3RunLabel;
  readonly entry_authorization_id: string;
  readonly revocation_authorization_id: string | null;
  readonly founder_os_sha: string;
  readonly build_room_sha: string;
  readonly fixture_repository: string;
  readonly fixture_sha: string;
  readonly requested_gateway_id: string;
  readonly gateway_id: string | null;
  readonly enrollment_projection_sha256: string;
  readonly machine_identity: string;
  readonly environment_label: string;
  readonly entry_evidence_sha256: string;
  readonly state: string;
  readonly heartbeat_captured: boolean;
  readonly lifecycle_position: number;
  readonly last_event_index: number;
  readonly started_at: Date;
  readonly capture_expires_at: Date;
  readonly finished_at: Date | null;
}

interface EventRow {
  readonly event_id: string;
  readonly event_index: number;
  readonly event_type: string;
  readonly idempotency_key: string | null;
  readonly request_sha256: string | null;
  readonly lifecycle_stage: string | null;
  readonly stage_artifact_sha256: string | null;
  readonly exchange_id: string | null;
  readonly matched_request_event_id: string | null;
  readonly match_verified: boolean | null;
  readonly reason_code: string | null;
  readonly result: string | null;
  readonly teardown_result: string | null;
  readonly teardown_evidence_sha256: string | null;
  readonly heartbeat_key_id: string | null;
  readonly heartbeat_sequence: string | null;
  readonly heartbeat_timestamp_ms: string | null;
  readonly heartbeat_signed_bytes: Buffer | null;
  readonly heartbeat_signature: Buffer | null;
  readonly heartbeat_public_key: Buffer | null;
  readonly heartbeat_accepted_at: Date | null;
  readonly heartbeat_window_ms: number | null;
  readonly signature_verified: boolean | null;
  readonly occurred_at: Date;
}

export class Phase3RunStore {
  constructor(
    private readonly pool: Pool,
    private readonly config: Config,
  ) {}

  createAttempt(input: Phase3AttemptInput): Promise<Phase3AttemptCreation> {
    return this.transaction((client) => this.createAttemptFenced(client, input));
  }

  async createAttemptFenced(
    client: PoolClient,
    input: Phase3AttemptInput,
  ): Promise<Phase3AttemptCreation> {
    try {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [
        input.runAttemptId,
      ]);
      const existing = await this.attempt(client, input.runAttemptId, false);
      if (existing !== null) {
        let sameIdentity = sameAttempt(existing, input, this.config.environment);
        if (input.mode === 'started') {
          sameIdentity = sameIdentity && existing.state !== 'not_started';
        } else {
          const original = await client.query<{ reason_code: string | null }>(
            `SELECT reason_code FROM phase3_run_events
              WHERE run_attempt_id = $1 AND event_type = 'attempt_not_started'`,
            [input.runAttemptId],
          );
          sameIdentity =
            sameIdentity &&
            existing.state === 'not_started' &&
            original.rows[0]?.reason_code === input.reasonCode;
        }
        if (!sameIdentity) {
          throw new Phase3RunConflictError('attempt_identity_conflict');
        }
        return { created: false, runAttemptId: input.runAttemptId, state: existing.state };
      }

      if (input.mode === 'started') {
        await client.query('SELECT pg_advisory_xact_lock($1)', [GATEWAY_REGISTRY_LOCK_KEY]);
        const current = await client.query<{ gateway_id: string; state: string }>(
          `SELECT gateway_id, state FROM gateway_current_state ORDER BY gateway_id FOR SHARE`,
        );
        if (
          phase3EnrollmentProjectionSha256(
            current.rows.map((row) => ({ gatewayId: row.gateway_id, state: row.state })),
          ) !== phase3EnrollmentProjectionSha256(input.expectedEnrollments)
        ) {
          throw new Phase3RunConflictError('enrollment_projection_failed');
        }
      }

      const now = await databaseNow(client);
      const notStarted = input.mode === 'not_started';
      const state = notStarted ? 'not_started' : 'active';
      const lastEventIndex = notStarted ? 1 : 2;
      const expiresAt = new Date(now.getTime() + this.config.gatewayTimestampWindowMs);

      await client.query(
        `INSERT INTO phase3_run_attempts
           (run_attempt_id, run_label, entry_authorization_id, revocation_authorization_id, founder_os_sha,
            build_room_sha, fixture_repository, fixture_sha, requested_gateway_id, gateway_id,
            enrollment_projection_sha256, machine_identity, environment_label, entry_evidence_sha256,
            state, last_event_index, started_at, capture_expires_at, finished_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          input.runAttemptId,
          input.runLabel,
          input.entryAuthorizationId,
          input.revocationAuthorizationId ?? null,
          input.founderOsSha,
          input.buildRoomSha,
          input.fixtureRepository,
          input.fixtureSha,
          input.gatewayId,
          notStarted ? null : input.gatewayId,
          phase3EnrollmentProjectionSha256(input.expectedEnrollments),
          input.machineIdentity,
          this.config.environment,
          input.entryEvidenceSha256,
          state,
          lastEventIndex,
          now,
          expiresAt,
          notStarted ? now : null,
        ],
      );

      if (notStarted) {
        await client.query(
          `INSERT INTO phase3_run_events
             (event_id, run_attempt_id, event_index, event_type, reason_code,
              teardown_result, occurred_at)
           VALUES ($1,$2,1,'attempt_not_started',$3,'not_required',$4)`,
          [randomUUID(), input.runAttemptId, input.reasonCode, now],
        );
      } else {
        await client.query(
          `INSERT INTO phase3_run_events
             (event_id, run_attempt_id, event_index, event_type, occurred_at)
           VALUES ($1,$2,1,'attempt_started',$3),
                  ($4,$2,2,'entry_verified',$3)`,
          [randomUUID(), input.runAttemptId, now, randomUUID()],
        );
      }

      return { created: true, runAttemptId: input.runAttemptId, state };
    } catch (error) {
      if (isUniqueViolation(error, 'phase3_run_attempts_one_active_gateway')) {
        throw new Phase3RunConflictError('active_gateway_conflict');
      }
      throw error;
    }
  }

  /** Called only inside the already-fenced accepted-heartbeat transaction. */
  async captureHeartbeat(client: PoolClient, evidence: Phase3HeartbeatEvidence): Promise<boolean> {
    if (
      evidence.signatureVerified !== true ||
      evidence.signature.byteLength !== 64 ||
      evidence.publicKey.byteLength !== 32 ||
      evidence.signedBytes.byteLength === 0 ||
      evidence.freshnessWindowMs !== this.config.gatewayTimestampWindowMs ||
      Math.abs(evidence.acceptedAt.getTime() - evidence.timestampMs) > evidence.freshnessWindowMs
    ) {
      throw new Phase3RunConflictError('heartbeat_evidence_invalid');
    }

    const { rows } = await client.query<AttemptRow>(
      `SELECT * FROM phase3_run_attempts
        WHERE gateway_id = $1 AND state = 'active' AND heartbeat_captured = false
          AND started_at <= $2 AND capture_expires_at >= $2
        ORDER BY attempt_seq DESC LIMIT 1 FOR UPDATE`,
      [evidence.gatewayId, evidence.acceptedAt],
    );
    const attempt = rows[0];
    if (attempt === undefined) return false;

    const eventIndex = attempt.last_event_index + 1;
    await client.query(
      `INSERT INTO phase3_run_events
         (event_id, run_attempt_id, event_index, event_type, heartbeat_key_id,
          heartbeat_sequence, heartbeat_timestamp_ms, heartbeat_signed_bytes,
          heartbeat_signature, heartbeat_public_key, heartbeat_accepted_at,
          heartbeat_window_ms, signature_verified, occurred_at)
       VALUES ($1,$2,$3,'heartbeat_verified',$4,$5,$6,$7,$8,$9,$10,$11,true,$10)`,
      [
        randomUUID(),
        attempt.run_attempt_id,
        eventIndex,
        evidence.keyId,
        evidence.sequence,
        evidence.timestampMs,
        Buffer.from(evidence.signedBytes),
        Buffer.from(evidence.signature),
        Buffer.from(evidence.publicKey),
        evidence.acceptedAt,
        evidence.freshnessWindowMs,
      ],
    );
    await client.query(
      `UPDATE phase3_run_attempts
          SET heartbeat_captured = true, last_event_index = $2
        WHERE run_attempt_id = $1`,
      [attempt.run_attempt_id, eventIndex],
    );
    return true;
  }

  appendEvent(runAttemptId: string, input: Phase3EventInput): Promise<Phase3AppendResult> {
    return this.transaction((client) => this.appendEventFenced(client, runAttemptId, input));
  }

  async appendEventFenced(
    client: PoolClient,
    runAttemptId: string,
    input: Phase3EventInput,
  ): Promise<Phase3AppendResult> {
      const attempt = await this.attempt(client, runAttemptId, true);
      if (attempt === null) throw new Phase3RunConflictError('attempt_not_found');
      const requestSha256 = phase3RequestSha256(input);

      const replay = await client.query<{
        event_id: string;
        event_type: string;
        reason_code: Phase3ReasonCode | null;
        request_sha256: string;
      }>(
        `SELECT event_id, event_type, reason_code, request_sha256 FROM phase3_run_events
          WHERE run_attempt_id = $1 AND idempotency_key = $2`,
        [runAttemptId, input.idempotencyKey],
      );
      const replayed = replay.rows[0];
      if (replayed !== undefined) {
        if (replayed.request_sha256 !== requestSha256) {
          throw new Phase3RunConflictError('idempotency_key_mismatch');
        }
        return {
          accepted: replayed.event_type !== 'lifecycle_stage_refused',
          eventId: replayed.event_id,
          replayed: true,
          ...(replayed.reason_code === null ? {} : { reasonCode: replayed.reason_code }),
        };
      }

      const now = await databaseNow(client);
      const eventIndex = attempt.last_event_index + 1;
      if (input.kind === 'lifecycle_stage') {
        if (attempt.state !== 'active') throw new Phase3RunConflictError('attempt_not_active');
        const expected = PHASE3_LIFECYCLE_STAGES[attempt.lifecycle_position];
        let reason: Phase3ReasonCode | null = null;
        if (!attempt.heartbeat_captured) reason = 'out_of_order_stage';
        else if (input.stage !== expected) {
          const presented = PHASE3_LIFECYCLE_STAGES.indexOf(input.stage);
          reason = presented < attempt.lifecycle_position ? 'duplicate_stage' : 'out_of_order_stage';
        } else if (input.stage === 'matched_response') {
          const request = await client.query<{ event_id: string }>(
            `SELECT event_id FROM phase3_run_events
              WHERE run_attempt_id = $1 AND event_type = 'lifecycle_stage_recorded'
                AND lifecycle_stage = 'request' AND exchange_id = $2`,
            [runAttemptId, input.exchangeId],
          );
          if (request.rows[0]?.event_id !== input.matchedRequestEventId || input.matchVerified !== true) {
            reason = 'response_mismatch';
          }
        }

        const eventId = randomUUID();
        if (reason !== null) {
          await client.query(
            `INSERT INTO phase3_run_events
               (event_id, run_attempt_id, event_index, event_type, idempotency_key,
                request_sha256, lifecycle_stage, reason_code, occurred_at)
             VALUES ($1,$2,$3,'lifecycle_stage_refused',$4,$5,$6,$7,$8)`,
            [
              eventId,
              runAttemptId,
              eventIndex,
              input.idempotencyKey,
              requestSha256,
              input.stage,
              reason,
              now,
            ],
          );
          await client.query(
            `UPDATE phase3_run_attempts
                SET state = 'failure_pending_teardown', last_event_index = $2
              WHERE run_attempt_id = $1`,
            [runAttemptId, eventIndex],
          );
          return { accepted: false, eventId, replayed: false, reasonCode: reason };
        }

        await client.query(
          `INSERT INTO phase3_run_events
             (event_id, run_attempt_id, event_index, event_type, idempotency_key,
              request_sha256, lifecycle_stage, stage_artifact_sha256, exchange_id,
              matched_request_event_id, match_verified, occurred_at)
           VALUES ($1,$2,$3,'lifecycle_stage_recorded',$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            eventId,
            runAttemptId,
            eventIndex,
            input.idempotencyKey,
            requestSha256,
            input.stage,
            input.artifactSha256,
            input.exchangeId ?? null,
            input.matchedRequestEventId ?? null,
            input.matchVerified ?? null,
            now,
          ],
        );
        await client.query(
          `UPDATE phase3_run_attempts
              SET lifecycle_position = lifecycle_position + 1, last_event_index = $2
            WHERE run_attempt_id = $1`,
          [runAttemptId, eventIndex],
        );
        return { accepted: true, eventId, replayed: false };
      }

      const eventId = randomUUID();
      if (input.result === 'awaiting_adjudication') {
        if (
          attempt.state !== 'active' ||
          !attempt.heartbeat_captured ||
          attempt.lifecycle_position !== PHASE3_LIFECYCLE_STAGES.length ||
          input.teardownResult !== 'completed'
        ) {
          throw new Phase3RunConflictError('attempt_incomplete');
        }
      } else {
        if (attempt.state !== 'active' && attempt.state !== 'failure_pending_teardown') {
          throw new Phase3RunConflictError('attempt_not_active');
        }
        if (
          (input.teardownResult === 'not_required' &&
            (attempt.lifecycle_position > 0 || attempt.state === 'failure_pending_teardown')) ||
          (attempt.lifecycle_position === PHASE3_LIFECYCLE_STAGES.length &&
            input.teardownResult !== 'completed')
        ) {
          throw new Phase3RunConflictError('attempt_incomplete');
        }
      }

      await client.query(
        `INSERT INTO phase3_run_events
           (event_id, run_attempt_id, event_index, event_type, idempotency_key,
            request_sha256, reason_code, result, teardown_result, teardown_evidence_sha256, occurred_at)
         VALUES ($1,$2,$3,'attempt_finished',$4,$5,$6,$7,$8,$9,$10)`,
        [
          eventId,
          runAttemptId,
          eventIndex,
          input.idempotencyKey,
          requestSha256,
          input.reasonCode ?? null,
          input.result,
          input.teardownResult,
          input.teardownEvidenceSha256,
          now,
        ],
      );
      const state = input.result;
      const finishedAt = input.result === 'awaiting_adjudication' ? null : now;
      await client.query(
        `UPDATE phase3_run_attempts
            SET state = $2, last_event_index = $3,
                finished_at = $4
          WHERE run_attempt_id = $1`,
        [runAttemptId, state, eventIndex, finishedAt],
      );
      return { accepted: true, eventId, replayed: false };
  }

  async exportAttempt(runAttemptId: string): Promise<Phase3EvidenceExport> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const attempt = await this.attempt(client, runAttemptId, false);
      if (attempt === null) throw new Phase3RunConflictError('attempt_not_found');
      const { rows } = await client.query<EventRow>(
        `SELECT * FROM phase3_run_events WHERE run_attempt_id = $1 ORDER BY event_index`,
        [runAttemptId],
      );
      await client.query('COMMIT');

      const heartbeat = rows.find((row) => row.event_type === 'heartbeat_verified');
      return {
        schema: 'build-room/phase3-run-evidence@1',
        context: { commit: this.config.commitSha, environment: this.config.environment },
        attempt: {
          runAttemptId: attempt.run_attempt_id,
          runLabel: attempt.run_label,
          entryAuthorizationId: attempt.entry_authorization_id,
          revocationAuthorizationId: attempt.revocation_authorization_id,
          founderOsSha: attempt.founder_os_sha,
          buildRoomSha: attempt.build_room_sha,
          fixtureRepository: attempt.fixture_repository,
          fixtureSha: attempt.fixture_sha,
          gatewayId: attempt.requested_gateway_id,
          enrollmentProjectionSha256: attempt.enrollment_projection_sha256,
          machineIdentity: attempt.machine_identity,
          environmentLabel: attempt.environment_label,
          entryEvidenceSha256: attempt.entry_evidence_sha256,
          state: attempt.state,
          startedAt: attempt.started_at.toISOString(),
          finishedAt: attempt.finished_at?.toISOString() ?? null,
        },
        events: rows.map((row) => ({
          eventId: row.event_id,
          eventIndex: row.event_index,
          eventType: row.event_type,
          idempotencyKey: row.idempotency_key,
          requestSha256: row.request_sha256,
          lifecycleStage: row.lifecycle_stage,
          stageArtifactSha256: row.stage_artifact_sha256,
          exchangeId: row.exchange_id,
          matchedRequestEventId: row.matched_request_event_id,
          matchVerified: row.match_verified,
          reasonCode: row.reason_code,
          result: row.result,
          teardownResult: row.teardown_result,
          teardownEvidenceSha256: row.teardown_evidence_sha256,
          occurredAt: row.occurred_at.toISOString(),
        })),
        heartbeat:
          heartbeat === undefined ||
          heartbeat.heartbeat_key_id === null ||
          heartbeat.heartbeat_sequence === null ||
          heartbeat.heartbeat_timestamp_ms === null ||
          heartbeat.heartbeat_signed_bytes === null ||
          heartbeat.heartbeat_signature === null ||
          heartbeat.heartbeat_public_key === null ||
          heartbeat.heartbeat_accepted_at === null ||
          heartbeat.heartbeat_window_ms === null ||
          heartbeat.signature_verified !== true
            ? null
            : {
                algorithm: 'Ed25519',
                keyId: heartbeat.heartbeat_key_id,
                sequence: Number(heartbeat.heartbeat_sequence),
                timestampMs: Number(heartbeat.heartbeat_timestamp_ms),
                acceptedAt: heartbeat.heartbeat_accepted_at.toISOString(),
                freshnessMs:
                  heartbeat.heartbeat_accepted_at.getTime() - Number(heartbeat.heartbeat_timestamp_ms),
                freshnessWindowMs: heartbeat.heartbeat_window_ms,
                signedBytesBase64: heartbeat.heartbeat_signed_bytes.toString('base64'),
                signatureBase64: heartbeat.heartbeat_signature.toString('base64'),
                publicKeyBase64: heartbeat.heartbeat_public_key.toString('base64'),
                signatureVerified: true,
              },
        authorizes: PHASE3_EVIDENCE_AUTHORIZES,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async transaction<T>(body: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await body(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async attempt(
    client: PoolClient,
    runAttemptId: string,
    lock: boolean,
  ): Promise<AttemptRow | null> {
    const { rows } = await client.query<AttemptRow>(
      `SELECT * FROM phase3_run_attempts WHERE run_attempt_id = $1${lock ? ' FOR UPDATE' : ''}`,
      [runAttemptId],
    );
    return rows[0] ?? null;
  }
}

async function databaseNow(client: PoolClient): Promise<Date> {
  const { rows } = await client.query<{ now: Date }>('SELECT now() AS now');
  const now = rows[0]?.now;
  if (now === undefined) throw new Error('database clock returned no row');
  return now;
}

function sameAttempt(row: AttemptRow, input: Phase3AttemptInput, environment: string): boolean {
  return (
    row.run_label === input.runLabel &&
    row.entry_authorization_id === input.entryAuthorizationId &&
    row.revocation_authorization_id === (input.revocationAuthorizationId ?? null) &&
    row.founder_os_sha === input.founderOsSha &&
    row.build_room_sha === input.buildRoomSha &&
    row.fixture_repository === input.fixtureRepository &&
    row.fixture_sha === input.fixtureSha &&
    row.requested_gateway_id === input.gatewayId &&
    row.enrollment_projection_sha256 === phase3EnrollmentProjectionSha256(input.expectedEnrollments) &&
    row.machine_identity === input.machineIdentity &&
    row.environment_label === environment &&
    row.entry_evidence_sha256 === input.entryEvidenceSha256
  );
}

export function phase3EnrollmentProjectionSha256(
  rows: readonly { readonly gatewayId: string; readonly state: string }[],
): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        [...rows]
          .map((row) => ({ gatewayId: row.gatewayId, state: row.state }))
          .sort((left, right) => {
            const leftKey = `${left.gatewayId}:${left.state}`;
            const rightKey = `${right.gatewayId}:${right.state}`;
            return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
          }),
      ),
    )
    .digest('hex');
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const pg = error as { code?: unknown; constraint?: unknown };
  return pg.code === '23505' && pg.constraint === constraint;
}

export function phase3RequestSha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonical((value as Record<string, unknown>)[key]);
  }
  return out;
}
