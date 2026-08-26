import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { encodeBase64Url, heartbeatSignedBytes } from '../../../gateway-protocol/src/index.js';
import {
  PHASE3_LIFECYCLE_STAGES,
  PHASE3_EVIDENCE_AUTHORIZES,
  PHASE3_REASON_CODES,
  PHASE3_RUN_LABELS,
  isPhase3EntryEvidence,
  phase3EntryEvidenceSha256,
  phase3EnrollmentProjectionSha256,
  phase3RequestSha256,
  validatePhase3AttemptInput,
  Phase3AppendResult,
  Phase3AttemptInput,
  Phase3EventInput,
  Phase3EvidenceExpectation,
  Phase3EvidenceExport,
} from '../../../control-plane/src/phase3-run.js';

export type Phase3Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export const PHASE3_DIAGNOSTIC_OPERATION_STAGES = [
  'attempt_create',
  'attempt_reconcile',
  'event_append',
  'event_reconcile',
  'evidence_export',
] as const;
export type Phase3DiagnosticOperationStage =
  (typeof PHASE3_DIAGNOSTIC_OPERATION_STAGES)[number];
export const PHASE3_DIAGNOSTIC_FAILURE_CLASSES = [
  'request_serialization',
  'request_construction',
  'dns_resolution',
  'tls_connection',
  'connection_reset',
  'request_timeout',
  'http_5xx',
  'invalid_response',
  'response_too_large',
  'transport_other',
] as const;
export type Phase3DiagnosticFailureClass =
  (typeof PHASE3_DIAGNOSTIC_FAILURE_CLASSES)[number];
export interface Phase3CommitDiagnostic {
  readonly operationStage: Phase3DiagnosticOperationStage;
  readonly failureClass: Phase3DiagnosticFailureClass;
}

const MAX_RESPONSE_BYTES = 256 * 1024;

export class Phase3ClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly diagnostic?: Phase3CommitDiagnostic,
  ) {
    super(`control plane request failed (${status} ${code})`);
    this.name = 'Phase3ClientError';
  }
}

export class Phase3AbortError extends Error {
  constructor() {
    super('operator_interrupted');
    this.name = 'Phase3AbortError';
  }
}

export class Phase3ControlPlaneClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly requestTimeoutMs = 10_000,
    private readonly pollIntervalMs = 1_000,
    private readonly fetchImpl: Phase3Fetch = fetch,
  ) {
    this.baseUrl = validateBaseUrl(baseUrl);
    if (token.trim() === '') throw new Error('control plane token is required');
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new Error('request timeout must be a positive integer');
    }
    if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) {
      throw new Error('poll interval must be a positive integer');
    }
  }

  async createAttempt(
    input: Phase3AttemptInput,
    expected: Phase3EvidenceExpectation,
    signal?: AbortSignal,
  ): Promise<{
    readonly created: boolean;
    readonly runAttemptId: string;
    readonly state: string;
    readonly reconciled: boolean;
  }> {
    requireExpectation(input.runAttemptId, input, expected);
    const deadline = this.writeReconciliationDeadline();
    let ambiguous = false;
    let diagnostic: Phase3CommitDiagnostic | undefined;
    for (;;) {
      const remaining = remainingBudget(deadline);
      if (remaining === 0) throw unresolvedCommit(diagnostic);
      try {
        const result = validateAttemptCreation(
          await this.request(
            'POST',
            '/control-plane/phase3/run-attempts',
            input,
            true,
            [],
            signal,
            remaining,
            'attempt_create',
          ),
          input.runAttemptId,
        );
        if (ambiguous && !result.created) {
          const exported = await this.readAfterAmbiguous(
            input.runAttemptId,
            expected,
            deadline,
            'attempt_reconcile',
            diagnostic,
          );
          return { ...result, reconciled: exported !== null && resumableCreation(exported, input) };
        }
        return { ...result, reconciled: ambiguous };
      } catch (error) {
        if (!ambiguousWrite(error)) throw error;
        ambiguous = true;
        diagnostic ??= diagnosticFrom(error, 'attempt_create');
        const exported = await this.readAfterAmbiguous(
          input.runAttemptId,
          expected,
          deadline,
          'attempt_reconcile',
          diagnostic,
        );
        if (exported !== null) {
          return {
            created: false,
            runAttemptId: input.runAttemptId,
            state: exported.attempt.state,
            reconciled: resumableCreation(exported, input),
          };
        }
        if (signal?.aborted === true || Date.now() >= deadline) {
          throw unresolvedCommit(diagnostic);
        }
        await delay(Math.min(this.pollIntervalMs, deadline - Date.now()), signal).catch(() => {
          throw unresolvedCommit(diagnostic);
        });
      }
    }
  }

  async appendEvent(
    runAttemptId: string,
    event: Phase3EventInput,
    expected: Phase3EvidenceExpectation,
    signal?: AbortSignal,
  ): Promise<Phase3AppendResult> {
    requireExpectation(runAttemptId, expected.attempt, expected);
    const deadline = this.writeReconciliationDeadline();
    let diagnostic: Phase3CommitDiagnostic | undefined;
    for (;;) {
      const remaining = remainingBudget(deadline);
      if (remaining === 0) throw unresolvedCommit(diagnostic);
      try {
        return validateAppendResult(
          await this.request(
            'POST',
            `/control-plane/phase3/run-attempts/${encodeURIComponent(runAttemptId)}/events`,
            event,
            true,
            [409],
            signal,
            remaining,
            'event_append',
          ),
        );
      } catch (error) {
        if (!ambiguousWrite(error)) throw error;
        diagnostic ??= diagnosticFrom(error, 'event_append');
        const exported = await this.readAfterAmbiguous(
          runAttemptId,
          expected,
          deadline,
          'event_reconcile',
          diagnostic,
        );
        const reconciled = exported === null ? null : reconciledAppend(exported, event);
        if (reconciled !== null) return reconciled;
        if (signal?.aborted === true || Date.now() >= deadline) {
          throw unresolvedCommit(diagnostic);
        }
        await delay(Math.min(this.pollIntervalMs, deadline - Date.now()), signal).catch(() => {
          throw unresolvedCommit(diagnostic);
        });
      }
    }
  }

  exportAttempt(
    runAttemptId: string,
    expected: Phase3EvidenceExpectation,
    signal?: AbortSignal,
    timeoutMs = this.requestTimeoutMs,
    operationStage: Phase3DiagnosticOperationStage = 'evidence_export',
  ): Promise<Phase3EvidenceExport> {
    return this.request(
      'GET',
      `/control-plane/phase3/run-attempts/${encodeURIComponent(runAttemptId)}/export`,
      undefined,
      true,
      [],
      signal,
      timeoutMs,
      operationStage,
    ).then((value) => validateEvidenceExport(value, runAttemptId, expected));
  }

  async waitForHeartbeat(
    runAttemptId: string,
    freshnessMs: number,
    expected: Phase3EvidenceExpectation,
    signal?: AbortSignal,
  ): Promise<{ readonly captured: boolean }> {
    const deadline = Date.now() + freshnessMs;
    for (;;) {
      throwIfAborted(signal);
      const exported = await this.exportAttempt(runAttemptId, expected, signal);
      if (exported.heartbeat !== null) {
        verifyHeartbeatProof(exported, expected.attempt.gatewayId, freshnessMs);
        return { captured: true };
      }
      if (Date.now() >= deadline) return { captured: false };
      await delay(Math.min(this.pollIntervalMs, deadline - Date.now()), signal);
    }
  }

  async version(): Promise<{ readonly commit: string | null; readonly environment: string | null }> {
    const body = asRecord(await this.request('GET', '/version', undefined, false));
    if (body === null || body['service'] !== '@build-room/control-plane') {
      throw new Phase3ClientError(200, 'invalid_response');
    }
    return {
      commit: typeof body['commit'] === 'string' ? body['commit'] : null,
      environment: typeof body['environment'] === 'string' ? body['environment'] : null,
    };
  }

  async enrollments(): Promise<
    readonly { readonly gatewayId: string; readonly state: string }[]
  > {
    const body = asRecord(await this.request('GET', '/control-plane/enrollments'));
    if (body === null) throw new Phase3ClientError(200, 'invalid_response');
    const rows = body['enrollments'];
    if (!Array.isArray(rows)) throw new Phase3ClientError(200, 'invalid_response');
    return rows.map((raw) => {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Phase3ClientError(200, 'invalid_response');
      }
      const row = raw as Record<string, unknown>;
      if (typeof row['gatewayId'] !== 'string' || typeof row['state'] !== 'string') {
        throw new Phase3ClientError(200, 'invalid_response');
      }
      return { gatewayId: row['gatewayId'], state: row['state'] };
    });
  }

  private writeReconciliationDeadline(): number {
    return Date.now() + this.requestTimeoutMs * 3;
  }

  private async readAfterAmbiguous(
    runAttemptId: string,
    expected: Phase3EvidenceExpectation,
    deadline: number,
    operationStage: 'attempt_reconcile' | 'event_reconcile',
    primaryDiagnostic?: Phase3CommitDiagnostic,
  ): Promise<Phase3EvidenceExport | null> {
    const remaining = remainingBudget(deadline);
    if (remaining === 0) return null;
    try {
      return await this.exportAttempt(
        runAttemptId,
        expected,
        undefined,
        remaining,
        operationStage,
      );
    } catch (error) {
      if (
        error instanceof Phase3ClientError &&
        (error.code === 'invalid_response' ||
          error.code === 'evidence_identity_mismatch' ||
          error.code === 'response_too_large')
      ) {
        throw unresolvedCommit(
          diagnosticFrom(error, operationStage) ?? {
            operationStage,
            failureClass: 'invalid_response',
          },
        );
      }
      if (
        error instanceof Phase3ClientError &&
        error.status === 404
      ) {
        return null;
      }
      if (
        error instanceof Phase3ClientError &&
        (error.code === 'transport_error' || error.status >= 500)
      ) {
        const recoveryDiagnostic = diagnosticFrom(error, operationStage);
        if (primaryDiagnostic === undefined && recoveryDiagnostic !== undefined) {
          throw unresolvedCommit(recoveryDiagnostic);
        }
        return null;
      }
      throw error;
    }
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    authenticated = true,
    acceptedStatuses: readonly number[] = [],
    externalSignal?: AbortSignal,
    timeoutMs = this.requestTimeoutMs,
    operationStage: Phase3DiagnosticOperationStage = 'evidence_export',
  ): Promise<unknown> {
    let serializedBody: string | undefined;
    try {
      serializedBody = body === undefined ? undefined : JSON.stringify(body);
    } catch {
      throw new Phase3ClientError(0, 'transport_error', {
        operationStage,
        failureClass: 'request_serialization',
      });
    }
    let response: Response;
    try {
      const timeout = AbortSignal.timeout(Math.max(1, Math.min(this.requestTimeoutMs, timeoutMs)));
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        signal: externalSignal === undefined ? timeout : AbortSignal.any([timeout, externalSignal]),
        redirect: 'error',
        headers: {
          ...(authenticated ? { authorization: `Bearer ${this.token}` } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(serializedBody === undefined ? {} : { body: serializedBody }),
      });
    } catch (error) {
      if (externalSignal?.aborted === true) throw new Phase3AbortError();
      throw new Phase3ClientError(0, 'transport_error', classifyTransport(error, operationStage));
    }

    const accepted = response.ok || acceptedStatuses.includes(response.status);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await readBoundedText(response));
    } catch (error) {
      if (error instanceof Phase3ClientError) {
        throw withDiagnostic(error, operationStage);
      }
      if (accepted) {
        throw new Phase3ClientError(response.status, 'invalid_response', {
          operationStage,
          failureClass: 'invalid_response',
        });
      }
    }
    if (!response.ok && acceptedStatuses.includes(response.status)) {
      const record = asRecord(parsed);
      if (record?.['accepted'] !== false) {
        throw new Phase3ClientError(
          response.status,
          safeCode(String(record?.['error'] ?? 'request_refused')),
        );
      }
    }
    if (!accepted) {
      const code =
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? String((parsed as Record<string, unknown>)['error'] ?? 'request_refused')
          : 'request_refused';
      throw new Phase3ClientError(
        response.status,
        safeCode(code),
        response.status >= 500
          ? { operationStage, failureClass: 'http_5xx' }
          : undefined,
      );
    }
    return parsed;
  }
}

function diagnosticFrom(
  error: unknown,
  operationStage: Phase3DiagnosticOperationStage,
): Phase3CommitDiagnostic | undefined {
  if (!(error instanceof Phase3ClientError)) return undefined;
  if (error.diagnostic !== undefined) return error.diagnostic;
  if (error.code === 'invalid_response') {
    return { operationStage, failureClass: 'invalid_response' };
  }
  if (error.code === 'response_too_large') {
    return { operationStage, failureClass: 'response_too_large' };
  }
  if (error.status >= 500) return { operationStage, failureClass: 'http_5xx' };
  return undefined;
}

function unresolvedCommit(diagnostic?: Phase3CommitDiagnostic): Phase3ClientError {
  return new Phase3ClientError(0, 'commit_outcome_unresolved', diagnostic);
}

function classifyTransport(
  error: unknown,
  operationStage: Phase3DiagnosticOperationStage,
): Phase3CommitDiagnostic {
  const code = safeErrorCode(error);
  const name = safeErrorName(error);
  const topLevelName =
    typeof error === 'object' && error !== null && typeof (error as { name?: unknown }).name === 'string'
      ? String((error as { name: string }).name)
      : null;
  let failureClass: Phase3DiagnosticFailureClass = 'transport_other';
  if (
    code === 'UND_ERR_INVALID_ARG' ||
    code === 'ERR_INVALID_CHAR' ||
    (code === null && topLevelName === 'TypeError')
  ) {
    failureClass = 'request_construction';
  } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') failureClass = 'dns_resolution';
  else if (
    code === 'CERT_HAS_EXPIRED' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
  ) {
    failureClass = 'tls_connection';
  } else if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'UND_ERR_SOCKET') {
    failureClass = 'connection_reset';
  } else if (
    name === 'TimeoutError' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT'
  ) {
    failureClass = 'request_timeout';
  }
  return {
    operationStage,
    failureClass,
  };
}

function withDiagnostic(
  error: Phase3ClientError,
  operationStage: Phase3DiagnosticOperationStage,
): Phase3ClientError {
  return error.diagnostic === undefined
    ? new Phase3ClientError(error.status, error.code, diagnosticFrom(error, operationStage))
    : error;
}

function safeErrorCode(error: unknown): string | null {
  return safeErrorField(error, 'code', () => true);
}

function safeErrorName(error: unknown): string | null {
  return safeErrorField(error, 'name', (value) => value !== 'TypeError' && value !== 'Error');
}

function safeErrorField(
  error: unknown,
  field: 'code' | 'name',
  accept: (value: string) => boolean,
): string | null {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current !== 'object' || current === null || seen.has(current)) return null;
    seen.add(current);
    const value = (current as Record<string, unknown>)[field];
    if (typeof value === 'string' && accept(value)) return value;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

function validateAttemptCreation(
  value: unknown,
  runAttemptId: string,
): { readonly created: boolean; readonly runAttemptId: string; readonly state: string } {
  const response = asRecord(value);
  if (
    response === null ||
    !exact(response, ['created', 'runAttemptId', 'state']) ||
    response['runAttemptId'] !== runAttemptId ||
    !ATTEMPT_STATES.includes(response['state'] as never) ||
    typeof response['created'] !== 'boolean'
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  return {
    created: response['created'],
    runAttemptId: response['runAttemptId'],
    state: response['state'] as string,
  };
}

function requireExpectation(
  runAttemptId: string,
  input: Phase3AttemptInput,
  expected: Phase3EvidenceExpectation,
): void {
  if (
    !validatePhase3AttemptInput(input).ok ||
    expected.attempt.runAttemptId !== runAttemptId ||
    phase3RequestSha256(expected.attempt) !== phase3RequestSha256(input) ||
    !SAFE_LABEL_RE.test(expected.environment)
  ) {
    throw new Phase3ClientError(0, 'evidence_expectation_invalid');
  }
}

function ambiguousWrite(error: unknown): boolean {
  if (error instanceof Phase3AbortError) return true;
  return (
    error instanceof Phase3ClientError &&
    ((error.status === 0 && error.code === 'transport_error') ||
      error.status >= 500 ||
      error.code === 'invalid_response' ||
      error.code === 'response_too_large')
  );
}

function remainingBudget(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function resumableCreation(exported: Phase3EvidenceExport, input: Phase3AttemptInput): boolean {
  if (input.mode === 'not_started') return exported.attempt.state === 'not_started';
  return (
    exported.attempt.state === 'active' &&
    exported.heartbeat === null &&
    exported.events.length === 2 &&
    exported.events[0]?.eventType === 'attempt_started' &&
    exported.events[1]?.eventType === 'entry_verified'
  );
}

function reconciledAppend(
  exported: Phase3EvidenceExport,
  input: Phase3EventInput,
): Phase3AppendResult | null {
  const event = exported.events.find((candidate) => candidate.idempotencyKey === input.idempotencyKey);
  if (event === undefined) return null;
  if (event.requestSha256 !== phase3RequestSha256(input)) {
    throw new Phase3ClientError(200, 'idempotency_key_mismatch');
  }
  const accepted = event.eventType !== 'lifecycle_stage_refused';
  if (!accepted && !PHASE3_REASON_CODES.includes(event.reasonCode as never)) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  return {
    accepted,
    eventId: event.eventId,
    replayed: true,
    ...(accepted ? {} : { reasonCode: event.reasonCode as Phase3AppendResult['reasonCode'] }),
  };
}

function validateAppendResult(value: unknown): Phase3AppendResult {
  const result = asRecord(value);
  if (
    result === null ||
    !exact(
      result,
      result['accepted'] === false
        ? ['accepted', 'eventId', 'reasonCode', 'replayed']
        : ['accepted', 'eventId', 'replayed'],
    ) ||
    typeof result['accepted'] !== 'boolean' ||
    typeof result['replayed'] !== 'boolean' ||
    !UUID_RE.test(text(result['eventId'])) ||
    (result['accepted'] === false && !PHASE3_REASON_CODES.includes(result['reasonCode'] as never))
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  return {
    accepted: result['accepted'],
    replayed: result['replayed'],
    eventId: result['eventId'] as string,
    ...(result['accepted'] === false
      ? { reasonCode: result['reasonCode'] as Phase3AppendResult['reasonCode'] }
      : {}),
  };
}

function validateEvidenceExport(
  value: unknown,
  runAttemptId: string,
  expected: Phase3EvidenceExpectation,
): Phase3EvidenceExport {
  const exported = validatePhase3EvidenceForSerialization(value);
  const last = exported.events.at(-1);
  if (
    expected.attempt.mode === 'not_started' &&
    (last?.eventType !== 'attempt_not_started' || last.reasonCode !== expected.attempt.reasonCode)
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  if (
    exported.attempt.runAttemptId !== runAttemptId ||
    !matchesExpectedIdentity(exported.context, exported.attempt, exported.entryEvidence, expected)
  ) {
    throw new Phase3ClientError(200, 'evidence_identity_mismatch');
  }
  return exported;
}

export function validatePhase3EvidenceForSerialization(value: unknown): Phase3EvidenceExport {
  const exported = asRecord(value);
  if (
    exported === null ||
    !exact(exported, [
      'attempt',
      'authorizes',
      'context',
      'entryEvidence',
      'entryEvidenceRecordedAt',
      'events',
      'heartbeat',
      'schema',
    ]) ||
    exported['schema'] !== 'build-room/phase3-run-evidence@1' ||
    exported['authorizes'] !== PHASE3_EVIDENCE_AUTHORIZES ||
    !Array.isArray(exported['events'])
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  const context = validateContext(exported['context']);
  const rawAttempt = asRecord(exported['attempt']);
  const attempt = validateAttempt(
    exported['attempt'],
    rawAttempt === null ? '' : text(rawAttempt['runAttemptId']),
  );
  if (
    !isPhase3EntryEvidence(exported['entryEvidence']) ||
    !validTimestamp(exported['entryEvidenceRecordedAt']) ||
    phase3EntryEvidenceSha256(exported['entryEvidence']) !== attempt.entryEvidenceSha256
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  const entryEvidence = exported['entryEvidence'];
  const entryEvidenceRecordedAt = exported['entryEvidenceRecordedAt'];
  const events = exported['events'].map((event, index) => validateEvent(event, index + 1));
  const entryEvents = events.filter(
    (event) => event.eventType === 'entry_verified' || event.eventType === 'attempt_not_started',
  );
  const entryMode = attempt.state === 'not_started' ? 'not_started' : 'started';
  const expectedEntryType = entryMode === 'not_started' ? 'attempt_not_started' : 'entry_verified';
  if (
    entryEvents.length !== 1 ||
    entryEvents[0]?.eventType !== expectedEntryType ||
    entryEvents[0].occurredAt !== entryEvidenceRecordedAt
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  const heartbeat =
    exported['heartbeat'] === null ? null : validateHeartbeat(exported['heartbeat']);
  validateTerminalHistory(
    attempt,
    events,
    entryMode,
    entryEvents[0]?.reasonCode ?? undefined,
    heartbeat,
  );
  if (context.commit !== attempt.buildRoomSha || context.environment !== attempt.environmentLabel) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  return {
    schema: 'build-room/phase3-run-evidence@1',
    context,
    entryEvidence,
    entryEvidenceRecordedAt,
    attempt,
    events,
    heartbeat,
    authorizes: PHASE3_EVIDENCE_AUTHORIZES,
  };
}

function validateContext(value: unknown): Phase3EvidenceExport['context'] {
  const context = asRecord(value);
  if (
    context === null ||
    !exact(context, ['commit', 'environment']) ||
    !SHA_RE.test(text(context['commit'])) ||
    !SAFE_LABEL_RE.test(text(context['environment']))
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  return { commit: context['commit'] as string, environment: context['environment'] as string };
}

function validateAttempt(value: unknown, runAttemptId: string): Phase3EvidenceExport['attempt'] {
  const attempt = asRecord(value);
  if (
    attempt === null ||
    !exact(attempt, ATTEMPT_FIELDS) ||
    attempt['runAttemptId'] !== runAttemptId ||
    !UUID_RE.test(text(attempt['runAttemptId'])) ||
    !PHASE3_RUN_LABELS.includes(attempt['runLabel'] as never) ||
    !SAFE_ID_RE.test(text(attempt['entryAuthorizationId'])) ||
    !(attempt['revocationAuthorizationId'] === null ||
      SAFE_ID_RE.test(text(attempt['revocationAuthorizationId']))) ||
    !SHA_RE.test(text(attempt['founderOsSha'])) ||
    !SHA_RE.test(text(attempt['buildRoomSha'])) ||
    !REPOSITORY_RE.test(text(attempt['fixtureRepository'])) ||
    !SHA_RE.test(text(attempt['fixtureSha'])) ||
    !UUID_RE.test(text(attempt['gatewayId'])) ||
    !SHA256_RE.test(text(attempt['enrollmentProjectionSha256'])) ||
    !SAFE_LABEL_RE.test(text(attempt['machineIdentity'])) ||
    !SAFE_LABEL_RE.test(text(attempt['environmentLabel'])) ||
    !SHA256_RE.test(text(attempt['entryEvidenceSha256'])) ||
    !ATTEMPT_STATES.includes(attempt['state'] as never) ||
    !validTimestamp(attempt['startedAt']) ||
    !(attempt['finishedAt'] === null || validTimestamp(attempt['finishedAt']))
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  return pick<Phase3EvidenceExport['attempt']>(attempt, ATTEMPT_FIELDS);
}

function validateEvent(value: unknown, expectedIndex: number): Phase3EvidenceExport['events'][number] {
  const event = asRecord(value);
  if (
    event === null ||
    !exact(event, EVENT_FIELDS) ||
    !UUID_RE.test(text(event['eventId'])) ||
    event['eventIndex'] !== expectedIndex ||
    !EVENT_TYPES.includes(event['eventType'] as never) ||
    !nullable(event['idempotencyKey'], UUID_RE) ||
    !nullable(event['requestSha256'], SHA256_RE) ||
    !(event['lifecycleStage'] === null || PHASE3_LIFECYCLE_STAGES.includes(event['lifecycleStage'] as never)) ||
    !nullable(event['stageArtifactSha256'], SHA256_RE) ||
    !nullable(event['exchangeId'], UUID_RE) ||
    !nullable(event['matchedRequestEventId'], UUID_RE) ||
    !(event['matchVerified'] === null || typeof event['matchVerified'] === 'boolean') ||
    !(event['reasonCode'] === null || PHASE3_REASON_CODES.includes(event['reasonCode'] as never)) ||
    !(event['result'] === null || RESULTS.includes(event['result'] as never)) ||
    !(event['teardownResult'] === null || TEARDOWN_RESULTS.includes(event['teardownResult'] as never)) ||
    !nullable(event['teardownEvidenceSha256'], SHA256_RE) ||
    !validTimestamp(event['occurredAt'])
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  const adjudication = validateAdjudication(event['adjudication']);
  if (
    (event['eventType'] === 'attempt_adjudicated' &&
      (adjudication === null ||
        adjudication.verdict !== event['result'] ||
        event['idempotencyKey'] === null ||
        event['requestSha256'] !==
          phase3RequestSha256({ idempotencyKey: event['idempotencyKey'], ...adjudication }) ||
        event['teardownResult'] !== 'completed' ||
        (adjudication.verdict === 'passed'
          ? event['reasonCode'] !== null
          : event['reasonCode'] !== 'adjudication_failed'))) ||
    (event['eventType'] !== 'attempt_adjudicated' && adjudication !== null)
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  return { ...pick<Phase3EvidenceExport['events'][number]>(event, EVENT_FIELDS), adjudication };
}

function validateTerminalHistory(
  attempt: Phase3EvidenceExport['attempt'],
  events: readonly Phase3EvidenceExport['events'][number][],
  entryMode: 'started' | 'not_started',
  entryReasonCode: string | undefined,
  heartbeat: Phase3EvidenceExport['heartbeat'],
): void {
  const last = events.at(-1);
  if (last === undefined) throw new Phase3ClientError(200, 'invalid_response');
  const finishedAtMatches = attempt.finishedAt === last.occurredAt;
  const successfulLifecycle = heartbeat !== null && hasSuccessfulLifecycle(events);
  let valid = false;
  switch (attempt.state) {
    case 'active':
      valid =
        attempt.finishedAt === null &&
        last.eventType !== 'attempt_finished' &&
        last.eventType !== 'attempt_adjudicated' &&
        last.eventType !== 'attempt_not_started';
      break;
    case 'failure_pending_teardown':
      valid = attempt.finishedAt === null && last.eventType === 'lifecycle_stage_refused';
      break;
    case 'awaiting_adjudication':
      valid =
        attempt.finishedAt === null &&
        events.length === 9 &&
        successfulLifecycle &&
        last.eventType === 'attempt_finished' &&
        last.result === 'awaiting_adjudication' &&
        last.teardownResult === 'completed';
      break;
    case 'passed':
      valid =
        finishedAtMatches &&
        events.length === 10 &&
        successfulLifecycle &&
        last.eventType === 'attempt_adjudicated' &&
        last.result === 'passed' &&
        events[8]?.teardownEvidenceSha256 === last.teardownEvidenceSha256;
      break;
    case 'failed':
      valid =
        finishedAtMatches &&
        ((last.eventType === 'attempt_finished' && last.result === 'failed') ||
          (events.length === 10 &&
            successfulLifecycle &&
            last.eventType === 'attempt_adjudicated' &&
            last.result === 'failed' &&
            events[8]?.teardownEvidenceSha256 === last.teardownEvidenceSha256));
      break;
    case 'interrupted':
      valid = finishedAtMatches && last.eventType === 'attempt_finished' && last.result === 'interrupted';
      break;
    case 'not_started':
      valid =
        finishedAtMatches &&
        entryMode === 'not_started' &&
        last.eventType === 'attempt_not_started' &&
        last.reasonCode === entryReasonCode;
      break;
  }
  if (!valid) throw new Phase3ClientError(200, 'invalid_response');
}

function hasSuccessfulLifecycle(
  events: readonly Phase3EvidenceExport['events'][number][],
): boolean {
  const request = events[5];
  const response = events[6];
  const completed = events[8];
  return (
    events.length >= 9 &&
    events[0]?.eventType === 'attempt_started' &&
    events[1]?.eventType === 'entry_verified' &&
    events[2]?.eventType === 'heartbeat_verified' &&
    events[3]?.eventType === 'lifecycle_stage_recorded' &&
    events[3].lifecycleStage === 'connect' &&
    events[4]?.eventType === 'lifecycle_stage_recorded' &&
    events[4].lifecycleStage === 'adapter_registered' &&
    request?.eventType === 'lifecycle_stage_recorded' &&
    request.lifecycleStage === 'request' &&
    request.exchangeId !== null &&
    response?.eventType === 'lifecycle_stage_recorded' &&
    response.lifecycleStage === 'matched_response' &&
    response.exchangeId === request.exchangeId &&
    response.matchedRequestEventId === request.eventId &&
    response.matchVerified === true &&
    events[7]?.eventType === 'lifecycle_stage_recorded' &&
    events[7].lifecycleStage === 'disconnect' &&
    completed?.eventType === 'attempt_finished' &&
    completed.result === 'awaiting_adjudication' &&
    completed.teardownResult === 'completed' &&
    completed.teardownEvidenceSha256 !== null
  );
}

function validateAdjudication(
  value: unknown,
): Phase3EvidenceExport['events'][number]['adjudication'] {
  if (value === null) return null;
  const adjudication = asRecord(value);
  if (
    adjudication === null ||
    !exact(adjudication, [
      'verdict',
      'tier2ReviewerId',
      'tier2EvidenceSha256',
      'founderAuthorizationId',
    ]) ||
    (adjudication['verdict'] !== 'passed' && adjudication['verdict'] !== 'failed') ||
    !SAFE_REVIEWER_RE.test(text(adjudication['tier2ReviewerId'])) ||
    !SHA256_RE.test(text(adjudication['tier2EvidenceSha256'])) ||
    !SAFE_ID_RE.test(text(adjudication['founderAuthorizationId']))
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  return {
    verdict: adjudication['verdict'],
    tier2ReviewerId: adjudication['tier2ReviewerId'] as string,
    tier2EvidenceSha256: adjudication['tier2EvidenceSha256'] as string,
    founderAuthorizationId: adjudication['founderAuthorizationId'] as string,
  };
}

function validateHeartbeat(value: unknown): NonNullable<Phase3EvidenceExport['heartbeat']> {
  const heartbeat = asRecord(value);
  if (
    heartbeat === null ||
    !exact(heartbeat, HEARTBEAT_FIELDS) ||
    heartbeat['algorithm'] !== 'Ed25519' ||
    !SHA256_RE.test(text(heartbeat['keyId'])) ||
    !Number.isSafeInteger(heartbeat['sequence']) ||
    Number(heartbeat['sequence']) <= 0 ||
    !Number.isSafeInteger(heartbeat['timestampMs']) ||
    !validTimestamp(heartbeat['acceptedAt']) ||
    !Number.isSafeInteger(heartbeat['freshnessMs']) ||
    !Number.isSafeInteger(heartbeat['freshnessWindowMs']) ||
    Number(heartbeat['freshnessWindowMs']) <= 0 ||
    heartbeat['signatureVerified'] !== true ||
    decoded(heartbeat['signedBytesBase64'], 1, 4_096) === null ||
    decoded(heartbeat['signatureBase64'], 64, 64) === null ||
    decoded(heartbeat['publicKeyBase64'], 32, 32) === null
  ) {
    throw new Phase3ClientError(200, 'invalid_response');
  }
  return pick<NonNullable<Phase3EvidenceExport['heartbeat']>>(heartbeat, HEARTBEAT_FIELDS);
}

function verifyHeartbeatProof(
  exported: Phase3EvidenceExport,
  expectedGatewayId: string,
  maximumFreshnessMs: number,
): void {
  const heartbeat = exported.heartbeat;
  if (heartbeat === null) throw new Phase3ClientError(200, 'heartbeat_invalid');
  const acceptedAt = Date.parse(heartbeat.acceptedAt);
  const freshness = acceptedAt - heartbeat.timestampMs;
  if (
    freshness !== heartbeat.freshnessMs ||
    Math.abs(freshness) > heartbeat.freshnessWindowMs ||
    Math.abs(freshness) > maximumFreshnessMs
  ) {
    throw new Phase3ClientError(200, 'stale_heartbeat');
  }

  const signedBytes = decoded(heartbeat.signedBytesBase64, 1, 4_096)!;
  const signature = decoded(heartbeat.signatureBase64, 64, 64)!;
  const publicKey = decoded(heartbeat.publicKeyBase64, 32, 32)!;
  if (createHash('sha256').update(publicKey).digest('hex') !== heartbeat.keyId) {
    throw new Phase3ClientError(200, 'heartbeat_invalid');
  }
  const canonical = parseHeartbeatSignedBytes(signedBytes);
  if (
    canonical === null ||
    canonical.gatewayId !== expectedGatewayId ||
    canonical.keyId !== heartbeat.keyId ||
    canonical.sequence !== heartbeat.sequence ||
    canonical.timestampMs !== heartbeat.timestampMs ||
    !Buffer.from(heartbeatSignedBytes(canonical)).equals(signedBytes)
  ) {
    throw new Phase3ClientError(200, 'heartbeat_invalid');
  }
  try {
    const key = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: encodeBase64Url(publicKey) },
      format: 'jwk',
    });
    if (!cryptoVerify(null, signedBytes, key, signature)) {
      throw new Phase3ClientError(200, 'bad_signature');
    }
  } catch (error) {
    if (error instanceof Phase3ClientError) throw error;
    throw new Phase3ClientError(200, 'heartbeat_invalid');
  }
}

function matchesExpectedIdentity(
  context: Phase3EvidenceExport['context'],
  attempt: Phase3EvidenceExport['attempt'],
  entryEvidence: Phase3EvidenceExport['entryEvidence'],
  expected: Phase3EvidenceExpectation,
): boolean {
  const input = expected.attempt;
  return (
    context.commit === input.buildRoomSha &&
    context.environment === expected.environment &&
    attempt.runAttemptId === input.runAttemptId &&
    attempt.runLabel === input.runLabel &&
    attempt.entryAuthorizationId === input.entryAuthorizationId &&
    attempt.revocationAuthorizationId === (input.revocationAuthorizationId ?? null) &&
    attempt.founderOsSha === input.founderOsSha &&
    attempt.buildRoomSha === input.buildRoomSha &&
    attempt.fixtureRepository === input.fixtureRepository &&
    attempt.fixtureSha === input.fixtureSha &&
    attempt.gatewayId === input.gatewayId &&
    attempt.enrollmentProjectionSha256 ===
      phase3EnrollmentProjectionSha256(input.expectedEnrollments) &&
    attempt.machineIdentity === input.machineIdentity &&
    attempt.environmentLabel === expected.environment &&
    attempt.entryEvidenceSha256 === input.entryEvidenceSha256 &&
    phase3EntryEvidenceSha256(entryEvidence) === input.entryEvidenceSha256 &&
    phase3EntryEvidenceSha256(input.entryEvidence) === input.entryEvidenceSha256 &&
    (input.mode === 'not_started'
      ? attempt.state === 'not_started'
      : attempt.state !== 'not_started')
  );
}

function parseHeartbeatSignedBytes(bytes: Buffer): {
  readonly gatewayId: string;
  readonly keyId: string;
  readonly epoch: string;
  readonly sequence: number;
  readonly nonce: string;
  readonly timestampMs: number;
} | null {
  const separator = bytes.indexOf(0);
  if (separator <= 0 || separator === bytes.length - 1) return null;
  try {
    const value = JSON.parse(bytes.subarray(separator + 1).toString('utf8')) as unknown;
    if (!Array.isArray(value) || value.length !== 9) return null;
    const [, , purpose, gatewayId, keyId, epoch, sequence, nonce, timestampMs] = value;
    if (
      purpose !== 'heartbeat' ||
      typeof gatewayId !== 'string' ||
      typeof keyId !== 'string' ||
      typeof epoch !== 'string' ||
      !Number.isSafeInteger(sequence) ||
      typeof nonce !== 'string' ||
      !Number.isSafeInteger(timestampMs)
    ) {
      return null;
    }
    return { gatewayId, keyId, epoch, sequence, nonce, timestampMs } as ReturnType<
      typeof parseHeartbeatSignedBytes
    >;
  } catch {
    return null;
  }
}

function decoded(value: unknown, minimum: number, maximum: number): Buffer | null {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null;
  }
  const bytes = Buffer.from(value, 'base64');
  return bytes.length >= minimum && bytes.length <= maximum && bytes.toString('base64') === value
    ? bytes
    : null;
}

async function readBoundedText(response: Response): Promise<string> {
  const declared = response.headers.get('content-length');
  if (declared !== null) {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new Phase3ClientError(response.status, 'response_too_large');
    }
  }

  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Phase3ClientError(response.status, 'response_too_large');
    }
    chunks.push(next.value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}

function pick<T>(value: Record<string, unknown>, fields: readonly string[]): T {
  return Object.fromEntries(fields.map((field) => [field, value[field]])) as T;
}

function nullable(value: unknown, pattern: RegExp): boolean {
  return value === null || (typeof value === 'string' && pattern.test(value));
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new Phase3AbortError();
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new Phase3AbortError());
    };
    function done(): void {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SAFE_ID_RE = /^[A-Za-z0-9._:/-]{1,128}$/;
const SAFE_LABEL_RE = /^[A-Za-z0-9._:/+ -]{1,128}$/;
const SAFE_REVIEWER_RE = /^(?=.{1,128}$)(?=.*[A-Za-z0-9])[A-Za-z0-9._:/+() -]+$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ATTEMPT_STATES = [
  'active',
  'failure_pending_teardown',
  'passed',
  'failed',
  'interrupted',
  'not_started',
  'awaiting_adjudication',
] as const;
const EVENT_TYPES = [
  'attempt_started',
  'attempt_not_started',
  'entry_verified',
  'heartbeat_verified',
  'lifecycle_stage_recorded',
  'lifecycle_stage_refused',
  'attempt_finished',
  'attempt_adjudicated',
] as const;
const RESULTS = ['awaiting_adjudication', 'passed', 'failed', 'interrupted'] as const;
const TEARDOWN_RESULTS = ['completed', 'failed', 'not_required'] as const;
const ATTEMPT_FIELDS = [
  'runAttemptId',
  'runLabel',
  'entryAuthorizationId',
  'revocationAuthorizationId',
  'founderOsSha',
  'buildRoomSha',
  'fixtureRepository',
  'fixtureSha',
  'gatewayId',
  'enrollmentProjectionSha256',
  'machineIdentity',
  'environmentLabel',
  'entryEvidenceSha256',
  'state',
  'startedAt',
  'finishedAt',
] as const;
const EVENT_FIELDS = [
  'eventId',
  'eventIndex',
  'eventType',
  'idempotencyKey',
  'requestSha256',
  'lifecycleStage',
  'stageArtifactSha256',
  'exchangeId',
  'matchedRequestEventId',
  'matchVerified',
  'reasonCode',
  'result',
  'teardownResult',
  'teardownEvidenceSha256',
  'adjudication',
  'occurredAt',
] as const;
const HEARTBEAT_FIELDS = [
  'algorithm',
  'keyId',
  'sequence',
  'timestampMs',
  'acceptedAt',
  'freshnessMs',
  'freshnessWindowMs',
  'signedBytesBase64',
  'signatureBase64',
  'publicKeyBase64',
  'signatureVerified',
] as const;

function validateBaseUrl(raw: string): string {
  const url = new URL(raw);
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('control plane URL must use HTTPS except on loopback');
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('control plane URL must not contain credentials, query, or fragment');
  }
  return url.toString().replace(/\/$/, '');
}

function safeCode(value: string): string {
  return /^[a-z0-9_]{1,64}$/.test(value) ? value : 'request_refused';
}
