import { createHash } from 'node:crypto';
import {
  readVerifiedRepositoryFile,
  type VerifiedFixtureRepository,
} from './repository.js';

export interface FixtureDefinition {
  readonly fixtureId: string;
  readonly caseId: string;
  readonly request: { readonly operation: string; readonly value: string };
  readonly response: { readonly status: string; readonly value: string };
}

type FixtureDefinitionResult =
  | { readonly ok: true; readonly value: FixtureDefinition }
  | { readonly ok: false; readonly code: 'invalid_fixture_definition' };

export function validateFixtureDefinition(value: unknown): FixtureDefinitionResult {
  const fixture = asRecord(value);
  if (fixture === null || !exact(fixture, ['fixtureId', 'caseId', 'request', 'response'])) {
    return INVALID_FIXTURE;
  }
  const request = asRecord(fixture['request']);
  const response = asRecord(fixture['response']);
  if (
    request === null ||
    response === null ||
    !exact(request, ['operation', 'value']) ||
    !exact(response, ['status', 'value']) ||
    request['operation'] !== 'inspect_fixture' ||
    response['status'] !== 'ok' ||
    !SAFE_TEXT_RE.test(text(fixture['fixtureId'])) ||
    !SAFE_TEXT_RE.test(text(fixture['caseId'])) ||
    !SAFE_TEXT_RE.test(text(request['value'])) ||
    !SAFE_TEXT_RE.test(text(response['value']))
  ) {
    return INVALID_FIXTURE;
  }
  return { ok: true, value: fixture as unknown as FixtureDefinition };
}

export async function loadFixtureDefinition(
  repository: VerifiedFixtureRepository,
): Promise<FixtureDefinition> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      await readVerifiedRepositoryFile(repository, 'phase3-stub.json', 16 * 1024),
    );
  } catch {
    throw new Error('invalid_fixture_definition');
  }
  const verdict = validateFixtureDefinition(parsed);
  if (!verdict.ok) throw new Error(verdict.code);
  return verdict.value;
}

export type FixtureStage =
  | 'connect'
  | 'adapter_registered'
  | 'request'
  | 'matched_response'
  | 'disconnect';

export interface FixtureLifecycleEvent {
  readonly stage: FixtureStage;
  readonly artifactSha256: string;
  readonly exchangeId?: string;
  readonly matched?: boolean;
}

export class FixtureAdapterError extends Error {
  constructor(readonly code: 'duplicate_stage' | 'out_of_order_stage' | 'response_mismatch') {
    super(code);
    this.name = 'FixtureAdapterError';
  }
}

export class DeterministicFixtureAdapter {
  readonly events: FixtureLifecycleEvent[] = [];
  private state: 'new' | 'connected' | 'registered' | 'responded' | 'disconnected' = 'new';
  private sessionId: string | null = null;

  constructor(private readonly fixture: FixtureDefinition) {}

  async connect(
    repository: VerifiedFixtureRepository,
    runAttemptId: string,
  ): Promise<{ readonly sessionId: string }> {
    if (this.state !== 'new') throw new FixtureAdapterError('duplicate_stage');
    this.state = 'connected';
    this.sessionId = runAttemptId;
    this.events.push({
      stage: 'connect',
      artifactSha256: digest({
        fixtureId: this.fixture.fixtureId,
        caseId: this.fixture.caseId,
        commitSha: repository.commitSha,
        treeSha: repository.treeSha,
        runAttemptId,
      }),
    });
    return { sessionId: runAttemptId };
  }

  async register(connection: { readonly sessionId: string }): Promise<{ readonly adapterId: string }> {
    if (this.state === 'registered' || this.state === 'responded' || this.state === 'disconnected') {
      throw new FixtureAdapterError('duplicate_stage');
    }
    if (this.state !== 'connected' || connection.sessionId !== this.sessionId) {
      throw new FixtureAdapterError('out_of_order_stage');
    }
    this.state = 'registered';
    const adapterId = `${this.fixture.fixtureId}:${this.fixture.caseId}`;
    this.events.push({
      stage: 'adapter_registered',
      artifactSha256: digest({ adapterId, sessionId: connection.sessionId }),
    });
    return { adapterId };
  }

  async request(
    registration: { readonly adapterId: string },
    requestId: string,
  ): Promise<{
    readonly requestId: string;
    readonly matched: boolean;
    readonly requestDigest: string;
    readonly responseDigest: string;
  }> {
    if (this.state === 'responded' || this.state === 'disconnected') {
      throw new FixtureAdapterError('duplicate_stage');
    }
    const expectedAdapterId = `${this.fixture.fixtureId}:${this.fixture.caseId}`;
    if (this.state !== 'registered' || registration.adapterId !== expectedAdapterId) {
      throw new FixtureAdapterError('out_of_order_stage');
    }

    const requestDigest = digest(this.fixture.request);
    const responseDigest = digest(this.fixture.response);
    this.events.push({
      stage: 'request',
      artifactSha256: requestDigest,
      exchangeId: requestId,
    });
    this.events.push({
      stage: 'matched_response',
      artifactSha256: responseDigest,
      exchangeId: requestId,
      matched: true,
    });
    this.state = 'responded';
    return { requestId, matched: true, requestDigest, responseDigest };
  }

  async disconnect(connection: { readonly sessionId: string }): Promise<void> {
    if (this.state === 'disconnected') throw new FixtureAdapterError('duplicate_stage');
    if (
      (this.state !== 'connected' && this.state !== 'registered' && this.state !== 'responded') ||
      connection.sessionId !== this.sessionId
    ) {
      throw new FixtureAdapterError('out_of_order_stage');
    }
    this.events.push({
      stage: 'disconnect',
      artifactSha256: digest({ sessionId: connection.sessionId, stateBeforeDisconnect: this.state }),
    });
    this.state = 'disconnected';
  }
}

export function validateFixtureLifecycle(
  events: readonly FixtureLifecycleEvent[],
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const stages = events.map((event) => event.stage);
  if (new Set(stages).size !== stages.length) return { ok: false, reason: 'duplicate_stage' };
  if (events.length !== REQUIRED_STAGES.length) return { ok: false, reason: 'missing_stage' };
  if (stages.some((stage, index) => stage !== REQUIRED_STAGES[index])) {
    return { ok: false, reason: 'out_of_order_stage' };
  }
  if (events.some((event) => !SHA256_RE.test(event.artifactSha256))) {
    return { ok: false, reason: 'invalid_evidence_digest' };
  }

  const request = events[2];
  const response = events[3];
  if (
    request?.stage !== 'request' ||
    response?.stage !== 'matched_response' ||
    request.exchangeId === undefined ||
    request.exchangeId !== response.exchangeId ||
    response.matched !== true
  ) {
    return { ok: false, reason: 'response_mismatch' };
  }
  return { ok: true };
}

const REQUIRED_STAGES: readonly FixtureStage[] = [
  'connect',
  'adapter_registered',
  'request',
  'matched_response',
  'disconnect',
];
const SHA256_RE = /^[0-9a-f]{64}$/;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const INVALID_FIXTURE = { ok: false, code: 'invalid_fixture_definition' } as const;
const SAFE_TEXT_RE = /^[A-Za-z0-9._:/+ -]{1,128}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
