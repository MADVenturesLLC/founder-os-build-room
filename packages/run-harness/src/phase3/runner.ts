import { createHash } from 'node:crypto';
import {
  phase3EntryEvidenceSha256,
  phase3EnrollmentProjectionSha256,
  type Phase3AppendResult,
  type Phase3AttemptInput,
  type Phase3EventInput,
  type Phase3EntryEvidence,
  type Phase3EvidenceExpectation,
  type Phase3ReasonCode,
} from '../../../control-plane/src/phase3-run.js';
import {
  evaluatePhase3Entry,
  type Phase3AttemptPlan,
  type Phase3EntryObservation,
} from './model.js';

export interface Phase3EventPort {
  createAttempt(
    input: Phase3AttemptInput,
    expected: Phase3EvidenceExpectation,
    signal?: AbortSignal,
  ): Promise<{
    readonly created: boolean;
    readonly runAttemptId: string;
    readonly state: string;
    readonly reconciled?: boolean;
  }>;
  waitForHeartbeat(
    runAttemptId: string,
    freshnessMs: number,
    expected: Phase3EvidenceExpectation,
    signal?: AbortSignal,
  ): Promise<{ readonly captured: boolean }>;
  appendEvent(
    runAttemptId: string,
    event: Phase3EventInput,
    expected: Phase3EvidenceExpectation,
    signal?: AbortSignal,
  ): Promise<Phase3AppendResult>;
  exportAttempt(runAttemptId: string, expected: Phase3EvidenceExpectation): Promise<unknown>;
}

export interface Phase3FixturePort {
  connect(): Promise<{ readonly sessionId: string; readonly artifactSha256: string }>;
  register(sessionId: string): Promise<{ readonly adapterId: string; readonly artifactSha256: string }>;
  request(adapterId: string, requestId: string): Promise<{
    readonly exchangeId: string;
    readonly requestSha256: string;
    readonly responseSha256: string;
    readonly matched: boolean;
  }>;
  disconnect(sessionId: string): Promise<{ readonly artifactSha256: string }>;
}

export interface Phase3AttemptRunnerDeps {
  readonly observeEntry: () => Promise<Phase3EntryObservation>;
  readonly eventPort: Phase3EventPort;
  readonly fixture: Phase3FixturePort;
  readonly fixtureStillBound: () => Promise<boolean>;
  readonly newId: () => string;
  readonly now: () => string;
  readonly signal?: AbortSignal;
}

export interface Phase3AttemptResult {
  readonly outcome:
    | 'not_started'
    | 'failed'
    | 'interrupted'
    | 'awaiting_adjudication'
    | 'existing_attempt'
    | 'unresolved_commit';
  readonly reasonCode?: Phase3ReasonCode;
  readonly evidence: unknown;
}

export async function performPhase3Attempt(
  plan: Phase3AttemptPlan,
  deps: Phase3AttemptRunnerDeps,
): Promise<Phase3AttemptResult> {
  let observation: Phase3EntryObservation;
  try {
    throwIfAborted(deps.signal);
    observation = await deps.observeEntry();
    throwIfAborted(deps.signal);
  } catch (error) {
    const reasonCode = preflightReason(error, deps.signal);
    if (reasonCode === null) throw error;
    const input = attemptInput(
      plan,
      incompleteEntryEvidence(plan, reasonCode, deps.now()),
      'not_started',
      reasonCode,
    );
    const expected = evidenceExpectation(plan, input);
    let creation;
    try {
      creation = await deps.eventPort.createAttempt(input, expected, deps.signal);
    } catch (error) {
      if (!isUnresolvedCommit(error)) throw error;
      return unresolvedAttempt(plan, deps, expected);
    }
    if (!creation.created && creation.reconciled !== true) {
      return existingAttempt(plan, deps, expected);
    }
    return resultWithEvidence(plan, deps, expected, { outcome: 'not_started', reasonCode });
  }
  const entry = evaluatePhase3Entry(plan, observation);
  if (!entry.ok) {
    const reasonCode = asReasonCode(entry.failures[0] ?? 'internal_error');
    const input = attemptInput(plan, observation, 'not_started', reasonCode);
    const expected = evidenceExpectation(plan, input);
    let creation;
    try {
      creation = await deps.eventPort.createAttempt(input, expected, deps.signal);
    } catch (error) {
      if (!isUnresolvedCommit(error)) throw error;
      return unresolvedAttempt(plan, deps, expected);
    }
    if (!creation.created && creation.reconciled !== true) {
      return existingAttempt(plan, deps, expected);
    }
    return resultWithEvidence(plan, deps, expected, { outcome: 'not_started', reasonCode });
  }

  const input = attemptInput(plan, observation, 'started');
  const expected = evidenceExpectation(plan, input);
  let creation;
  try {
    creation = await deps.eventPort.createAttempt(input, expected, deps.signal);
  } catch (error) {
    if (!isUnresolvedCommit(error)) throw error;
    return unresolvedAttempt(plan, deps, expected);
  }
  if (!creation.created && creation.reconciled !== true) {
    return existingAttempt(plan, deps, expected);
  }
  if (deps.signal?.aborted === true) {
    return finish(plan, deps, expected, 'interrupted', 'operator_interrupted', 'not_required');
  }
  let heartbeat: { readonly captured: boolean };
  try {
    heartbeat = await deps.eventPort.waitForHeartbeat(
      plan.runAttemptId,
      plan.heartbeatFreshnessMs,
      expected,
      deps.signal,
    );
  } catch (error) {
    if (isAborted(error, deps.signal)) {
      return finish(plan, deps, expected, 'interrupted', 'operator_interrupted', 'not_required');
    }
    if (isHeartbeatTrustFailure(error)) return localUnresolvedAttempt(plan, expected);
    return finish(plan, deps, expected, 'failed', heartbeatReason(error), 'not_required');
  }
  if (!heartbeat.captured) {
    return finish(plan, deps, expected, 'failed', 'heartbeat_timeout', 'not_required');
  }

  let connection: { readonly sessionId: string; readonly artifactSha256: string } | null = null;
  let teardownResult: 'completed' | 'failed' | 'not_required' = 'not_required';
  let teardownEvidenceSha256: string | undefined;
  try {
    connection = await deps.fixture.connect();
    throwIfAborted(deps.signal);
    await appendStage(plan, deps, expected, 'connect', connection.artifactSha256);

    const registration = await deps.fixture.register(connection.sessionId);
    throwIfAborted(deps.signal);
    await appendStage(plan, deps, expected, 'adapter_registered', registration.artifactSha256);

    const exchange = await deps.fixture.request(registration.adapterId, deps.newId());
    throwIfAborted(deps.signal);
    const request = await deps.eventPort.appendEvent(plan.runAttemptId, {
      kind: 'lifecycle_stage',
      idempotencyKey: deps.newId(),
      stage: 'request',
      artifactSha256: exchange.requestSha256,
      exchangeId: exchange.exchangeId,
    }, expected, deps.signal);
    requireAccepted(request);
    throwIfAborted(deps.signal);

    if (!exchange.matched) {
      const disconnected = await deps.fixture.disconnect(connection.sessionId);
      teardownResult = 'completed';
      teardownEvidenceSha256 = disconnected.artifactSha256;
      connection = null;
      // The control plane records the missing matched-response as the durable
      // refusal. A physical disconnect still occurs, but its out-of-order
      // evidence refusal must not replace the original response mismatch.
      try {
        await deps.eventPort.appendEvent(plan.runAttemptId, {
          kind: 'lifecycle_stage',
          idempotencyKey: deps.newId(),
          stage: 'disconnect',
          artifactSha256: disconnected.artifactSha256,
        }, expected);
      } catch {
        // The known response mismatch remains the terminal reason.
      }
      return finish(
        plan,
        deps,
        expected,
        'failed',
        'response_mismatch',
        teardownResult,
        teardownEvidenceSha256,
      );
    }

    const response = await deps.eventPort.appendEvent(plan.runAttemptId, {
      kind: 'lifecycle_stage',
      idempotencyKey: deps.newId(),
      stage: 'matched_response',
      artifactSha256: exchange.responseSha256,
      exchangeId: exchange.exchangeId,
      matchedRequestEventId: request.eventId,
      matchVerified: true,
    }, expected, deps.signal);
    requireAccepted(response);
    throwIfAborted(deps.signal);

    const disconnected = await deps.fixture.disconnect(connection.sessionId);
    teardownResult = 'completed';
    teardownEvidenceSha256 = disconnected.artifactSha256;
    connection = null;
    await appendStage(plan, deps, expected, 'disconnect', disconnected.artifactSha256);
    throwIfAborted(deps.signal);

    if (!(await deps.fixtureStillBound())) {
      return finish(
        plan,
        deps,
        expected,
        'interrupted',
        'fixture_sha_mismatch',
        teardownResult,
        teardownEvidenceSha256,
      );
    }
    throwIfAborted(deps.signal);

    const completed = await deps.eventPort.appendEvent(plan.runAttemptId, {
      kind: 'attempt_finished',
      idempotencyKey: deps.newId(),
      result: 'awaiting_adjudication',
      teardownResult: 'completed',
      teardownEvidenceSha256,
    }, expected, deps.signal);
    requireAccepted(completed);
    return resultWithEvidence(plan, deps, expected, { outcome: 'awaiting_adjudication' });
  } catch (error) {
    const interrupted = isAborted(error, deps.signal);
    const unresolved = isUnresolvedCommit(error);
    let reasonCode = interrupted ? 'operator_interrupted' : reasonFrom(error);
    const preserveReason = interrupted || error instanceof RunnerFailure;
    if (connection !== null) {
      const sessionId = connection.sessionId;
      connection = null;
      try {
        const disconnected = await deps.fixture.disconnect(sessionId);
        teardownResult = 'completed';
        teardownEvidenceSha256 = disconnected.artifactSha256;
        if (!unresolved) {
          try {
            await deps.eventPort.appendEvent(plan.runAttemptId, {
              kind: 'lifecycle_stage',
              idempotencyKey: deps.newId(),
              stage: 'disconnect',
              artifactSha256: disconnected.artifactSha256,
            }, expected);
          } catch {
            if (!preserveReason) reasonCode = 'evidence_write_failed';
          }
        }
      } catch {
        teardownResult = 'failed';
        if (!preserveReason) reasonCode = 'teardown_failed';
      }
    }
    if (unresolved) return unresolvedAttempt(plan, deps, expected);
    return finish(
      plan,
      deps,
      expected,
      interrupted ? 'interrupted' : 'failed',
      reasonCode,
      teardownResult,
      teardownEvidenceSha256,
    );
  }
}

export class Phase3PreflightError extends Error {
  constructor(readonly reasonCode: Phase3ReasonCode) {
    super(reasonCode);
    this.name = 'Phase3PreflightError';
  }
}

function attemptInput(
  plan: Phase3AttemptPlan,
  entryEvidence: Phase3EntryEvidence,
  mode: 'started' | 'not_started',
  reasonCode?: Phase3ReasonCode,
): Phase3AttemptInput {
  return {
    mode,
    runAttemptId: plan.runAttemptId,
    runLabel: plan.label,
    entryAuthorizationId: plan.entryAuthorizationId,
    ...(plan.revocationAuthorizationId === undefined
      ? {}
      : { revocationAuthorizationId: plan.revocationAuthorizationId }),
    founderOsSha: plan.founderOsSha,
    buildRoomSha: plan.buildRoomSha,
    fixtureRepository: plan.fixture.repository,
    fixtureSha: plan.fixture.sha,
    gatewayId: plan.gatewayId,
    expectedEnrollments: plan.expectedEnrollments,
    machineIdentity: plan.machine,
    entryEvidence,
    entryEvidenceSha256: phase3EntryEvidenceSha256(entryEvidence),
    ...(reasonCode === undefined ? {} : { reasonCode }),
  };
}

function incompleteEntryEvidence(
  plan: Phase3AttemptPlan,
  failureReason: Phase3ReasonCode,
  observedAt: string,
): Phase3EntryEvidence {
  return {
    status: 'incomplete',
    observedAt,
    failureReason,
    expected: {
      founderOsSha: plan.founderOsSha,
      buildRoomSha: plan.buildRoomSha,
      fixtureRepository: plan.fixture.repository,
      fixtureSha: plan.fixture.sha,
      environment: plan.environment,
      machineIdentity: plan.machine,
      gatewayId: plan.gatewayId,
    },
  };
}

function evidenceExpectation(
  plan: Phase3AttemptPlan,
  input: Phase3AttemptInput,
): Phase3EvidenceExpectation {
  return { attempt: input, environment: plan.environment };
}

async function appendStage(
  plan: Phase3AttemptPlan,
  deps: Phase3AttemptRunnerDeps,
  expected: Phase3EvidenceExpectation,
  stage: 'connect' | 'adapter_registered' | 'disconnect',
  artifactSha256: string,
): Promise<void> {
  requireAccepted(
    await deps.eventPort.appendEvent(
      plan.runAttemptId,
      {
        kind: 'lifecycle_stage',
        idempotencyKey: deps.newId(),
        stage,
        artifactSha256,
      },
      expected,
      deps.signal,
    ),
  );
  throwIfAborted(deps.signal);
}

async function finish(
  plan: Phase3AttemptPlan,
  deps: Phase3AttemptRunnerDeps,
  expected: Phase3EvidenceExpectation,
  result: 'failed' | 'interrupted',
  reasonCode: Phase3ReasonCode,
  teardownResult: 'completed' | 'failed' | 'not_required',
  teardownEvidenceSha256?: string,
): Promise<Phase3AttemptResult> {
  try {
    const event = await deps.eventPort.appendEvent(plan.runAttemptId, {
      kind: 'attempt_finished',
      idempotencyKey: deps.newId(),
      result,
      teardownResult,
      teardownEvidenceSha256:
        teardownEvidenceSha256 ?? teardownDigest(plan.runAttemptId, deps.now(), teardownResult),
      reasonCode,
    }, expected);
    requireAccepted(event);
    return resultWithEvidence(plan, deps, expected, { outcome: result, reasonCode });
  } catch (error) {
    if (!isUnresolvedCommit(error)) throw error;
    return unresolvedAttempt(plan, deps, expected);
  }
}

function requireAccepted(result: Phase3AppendResult): void {
  if (!result.accepted) throw new RunnerFailure(result.reasonCode ?? 'evidence_write_failed');
}

class RunnerFailure extends Error {
  constructor(readonly reasonCode: Phase3ReasonCode) {
    super(reasonCode);
  }
}

async function existingAttempt(
  plan: Phase3AttemptPlan,
  deps: Phase3AttemptRunnerDeps,
  expected: Phase3EvidenceExpectation,
): Promise<Phase3AttemptResult> {
  return resultWithEvidence(plan, deps, expected, { outcome: 'existing_attempt' });
}

async function resultWithEvidence(
  plan: Phase3AttemptPlan,
  deps: Phase3AttemptRunnerDeps,
  expected: Phase3EvidenceExpectation,
  result: Omit<Phase3AttemptResult, 'evidence'>,
): Promise<Phase3AttemptResult> {
  try {
    return {
      ...result,
      evidence: await deps.eventPort.exportAttempt(plan.runAttemptId, expected),
    };
  } catch (error) {
    if (!remoteUnavailable(error)) throw error;
    return unresolvedAttempt(plan, deps, expected);
  }
}

async function unresolvedAttempt(
  plan: Phase3AttemptPlan,
  deps: Phase3AttemptRunnerDeps,
  expected: Phase3EvidenceExpectation,
): Promise<Phase3AttemptResult> {
  let evidence: unknown;
  try {
    evidence = await deps.eventPort.exportAttempt(plan.runAttemptId, expected);
  } catch (error) {
    if (!remoteUnavailable(error)) throw error;
    return localUnresolvedAttempt(plan, expected);
  }
  return {
    outcome: 'unresolved_commit',
    reasonCode: 'evidence_write_failed',
    evidence,
  };
}

function localUnresolvedAttempt(
  plan: Phase3AttemptPlan,
  expected: Phase3EvidenceExpectation,
): Phase3AttemptResult {
  return {
    outcome: 'unresolved_commit',
    reasonCode: 'evidence_write_failed',
    evidence: phase3LocalUnresolvedEvidence(plan, expected.attempt.entryEvidenceSha256),
  };
}

export function phase3LocalUnresolvedEvidence(
  plan: Phase3AttemptPlan,
  entryEvidenceSha256: string | null = null,
): Record<string, unknown> {
  return {
    schema: 'build-room/phase3-local-unresolved@1',
    outcome: 'unresolved_commit',
    reasonCode: 'commit_outcome_unresolved',
    remoteState: 'unknown',
    expected: {
      runAttemptId: plan.runAttemptId,
      runLabel: plan.label,
      entryAuthorizationId: plan.entryAuthorizationId,
      revocationAuthorizationId: plan.revocationAuthorizationId ?? null,
      founderOsSha: plan.founderOsSha,
      buildRoomSha: plan.buildRoomSha,
      fixtureRepository: plan.fixture.repository,
      fixtureSha: plan.fixture.sha,
      gatewayId: plan.gatewayId,
      enrollmentProjectionSha256: phase3EnrollmentProjectionSha256(plan.expectedEnrollments),
      machineIdentity: plan.machine,
      environmentLabel: plan.environment,
      entryEvidenceSha256,
    },
    authorizes:
      'Nothing. This local record states only that the remote commit outcome is unknown and grants no authority.',
  };
}

function preflightReason(error: unknown, signal?: AbortSignal): Phase3ReasonCode | null {
  if (isAborted(error, signal)) return 'operator_interrupted';
  if (error instanceof Phase3PreflightError) return error.reasonCode;
  const message = error instanceof Error ? error.message : '';
  if (message === 'fixture_sha_mismatch') return 'fixture_sha_mismatch';
  if (
    message === 'fixture_dirty' ||
    message === 'fixture_not_repository_root' ||
    message === 'fixture_identity_invalid' ||
    message === 'fixture_repository_unavailable' ||
    message === 'fixture_repository_mismatch'
  ) {
    return 'fixture_unavailable';
  }
  return null;
}

function isAborted(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true ||
    (error instanceof Error &&
      (error.name === 'Phase3AbortError' || error.message === 'operator_interrupted'));
}

function isUnresolvedCommit(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code) === 'commit_outcome_unresolved'
  );
}

function isHeartbeatTrustFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = String((error as { code: unknown }).code);
  return (
    code === 'invalid_response' ||
    code === 'evidence_identity_mismatch' ||
    code === 'response_too_large' ||
    code === 'heartbeat_invalid' ||
    code === 'bad_signature' ||
    code === 'stale_heartbeat'
  );
}

function remoteUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; status?: unknown };
  return (
    candidate.code === 'commit_outcome_unresolved' ||
    candidate.code === 'transport_error' ||
    candidate.code === 'attempt_not_found' ||
    candidate.code === 'invalid_response' ||
    candidate.code === 'response_too_large' ||
    candidate.code === 'evidence_identity_mismatch' ||
    candidate.status === 0 ||
    candidate.status === 404 ||
    (typeof candidate.status === 'number' && candidate.status >= 500)
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new RunnerFailure('operator_interrupted');
}

function reasonFrom(error: unknown): Phase3ReasonCode {
  if (error instanceof RunnerFailure) return error.reasonCode;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return asReasonCode(String((error as { code: unknown }).code));
  }
  return 'internal_error';
}

function heartbeatReason(error: unknown): Phase3ReasonCode {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    if (code === 'bad_signature' || code === 'stale_heartbeat' || code === 'heartbeat_invalid') {
      return code;
    }
  }
  return 'heartbeat_invalid';
}

function asReasonCode(value: string): Phase3ReasonCode {
  const reasons: readonly string[] = [
    'attempt_identity_invalid',
    'authorization_invalid',
    'governing_sha_invalid',
    'founder_os_invalid',
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
    'adjudication_failed',
    'operator_interrupted',
    'teardown_failed',
    'evidence_write_failed',
    'internal_error',
  ];
  return (reasons.includes(value) ? value : 'internal_error') as Phase3ReasonCode;
}

function teardownDigest(runAttemptId: string, at: string, result: string): string {
  return digest({ runAttemptId, at, result });
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
