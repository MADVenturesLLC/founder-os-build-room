import assert from 'node:assert/strict';
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { heartbeatSignedBytes } from '../packages/gateway-protocol/src/index.js';
import {
  phase3EntryEvidenceSha256,
  phase3RequestSha256,
  type Phase3EvidenceExpectation,
} from '../packages/control-plane/src/phase3-run.js';
import {
  Phase3AbortError,
  Phase3ClientError,
  Phase3ControlPlaneClient,
  type Phase3Fetch,
} from '../packages/run-harness/src/phase3/client.js';

const ATTEMPT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ENTRY_EVIDENCE = {
  status: 'complete',
  observedAt: '2026-08-25T12:00:00.000Z',
  founderOs: {
    repository: 'MADVenturesLLC/FounderOS',
    sha: '1'.repeat(40),
    treeSha: 'a'.repeat(40),
    clean: true,
  },
  buildRoom: {
    repository: 'MADVenturesLLC/founder-os-build-room',
    sha: '2'.repeat(40),
    treeSha: 'b'.repeat(40),
    clean: true,
    buildPassed: true,
  },
  fixture: {
    repository: 'MADVenturesLLC/synthetic-fixture',
    sha: '3'.repeat(40),
    treeSha: 'c'.repeat(40),
    clean: true,
  },
  controlPlane: { commit: '2'.repeat(40), environment: 'synthetic-test', status: 200 },
  machineIdentity: 'synthetic-mac',
  nodeMajor: 22,
  enrollments: [{ gatewayId: '11111111-2222-4333-8444-555555555555', state: 'enrolled' }],
  doctor: {
    daemonReachable: true,
    primaryLane: 'IDLE',
    stagingLane: 'INACTIVE',
    primaryCustody: true,
    stagingCustody: false,
    custodyError: false,
    stagingLockPresent: false,
  },
} as const;
const EXPECTED: Phase3EvidenceExpectation = {
  environment: 'synthetic-test',
  attempt: {
    mode: 'started',
    runAttemptId: ATTEMPT_ID,
    runLabel: 'Phase3-CR1',
    entryAuthorizationId: 'founder:synthetic:phase3-cr1',
    founderOsSha: '1'.repeat(40),
    buildRoomSha: '2'.repeat(40),
    fixtureRepository: 'MADVenturesLLC/synthetic-fixture',
    fixtureSha: '3'.repeat(40),
    gatewayId: '11111111-2222-4333-8444-555555555555',
    expectedEnrollments: [
      { gatewayId: '11111111-2222-4333-8444-555555555555', state: 'enrolled' },
    ],
    machineIdentity: 'synthetic-mac',
    entryEvidence: ENTRY_EVIDENCE,
    entryEvidenceSha256: phase3EntryEvidenceSha256(ENTRY_EVIDENCE),
  },
};

describe('Phase 3 HTTP client — untrusted responses', () => {
  it('rejects a 200 export whose required shape is absent', async () => {
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      1_000,
      1,
      async () => new Response('{}', { status: 200 }),
    );
    await assert.rejects(
      client.exportAttempt(ATTEMPT_ID, EXPECTED),
      (error: unknown) => error instanceof Phase3ClientError && error.code === 'invalid_response',
    );
  });

  it('rejects an oversized response from Content-Length before parsing', async () => {
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      1_000,
      1,
      async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-length': String(300_000) },
        }),
    );
    await assert.rejects(
      client.exportAttempt(ATTEMPT_ID, EXPECTED),
      (error: unknown) => error instanceof Phase3ClientError && error.code === 'response_too_large',
    );
  });

  it('returns a documented 409 lifecycle refusal as durable evidence', async () => {
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      1_000,
      1,
      async () =>
        new Response(
          JSON.stringify({
            accepted: false,
            replayed: false,
            eventId: '10000000-0000-4000-8000-000000000001',
            reasonCode: 'out_of_order_stage',
          }),
          { status: 409 },
        ),
    );

    assert.deepEqual(
      await client.appendEvent(ATTEMPT_ID, {
        kind: 'lifecycle_stage',
        idempotencyKey: '20000000-0000-4000-8000-000000000002',
        stage: 'connect',
        artifactSha256: '1'.repeat(64),
      }, EXPECTED),
      {
        accepted: false,
        replayed: false,
        eventId: '10000000-0000-4000-8000-000000000001',
        reasonCode: 'out_of_order_stage',
      },
    );
  });

  it('rejects unknown fields at every export level', async () => {
    const complete = await syntheticExport();
    const firstEvent = (complete['events'] as Record<string, unknown>[])[0]!;
    const responses = [
      { ...complete, note: 'must-not-be-persisted' },
      { ...complete, context: { ...(complete['context'] as object), note: 'extra' } },
      { ...complete, events: [{ ...firstEvent, note: 'extra' }] },
      {
        ...complete,
        entryEvidence: {
          ...(complete['entryEvidence'] as object),
          controlPlaneToken: 'must-not-land',
        },
      },
      { ...complete, entryEvidence: undefined },
    ];
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      1_000,
      1,
      async () => new Response(JSON.stringify(responses.shift()), { status: 200 }),
    );

    for (let index = 0; index < 5; index += 1) {
      await assert.rejects(
        client.exportAttempt(ATTEMPT_ID, EXPECTED),
        (error: unknown) => error instanceof Phase3ClientError && error.code === 'invalid_response',
      );
    }
  });

  it('requires entry evidence to match its retained entry event timestamp', async () => {
    const complete = await syntheticExport();
    const first = (complete['events'] as Record<string, unknown>[])[0]!;
    const entry = {
      ...first,
      eventId: '10000000-0000-4000-8000-000000000002',
      eventIndex: 2,
      eventType: 'entry_verified',
    };
    const variants = [
      { ...complete, events: [first] },
      {
        ...complete,
        events: [first, entry],
        entryEvidenceRecordedAt: '2030-01-01T00:00:00.000Z',
      },
    ];
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      1_000,
      1,
      async () => new Response(JSON.stringify(variants.shift()), { status: 200 }),
    );
    for (let index = 0; index < 2; index += 1) {
      await assert.rejects(
        client.exportAttempt(ATTEMPT_ID, EXPECTED),
        (error: unknown) => error instanceof Phase3ClientError && error.code === 'invalid_response',
      );
    }
  });

  it('binds passed state to the exact adjudication event and request digest', async () => {
    const complete = await syntheticExport();
    const events = complete['events'] as Record<string, unknown>[];
    const adjudication = {
      verdict: 'passed' as const,
      tier2ReviewerId: 'Gemini 3.1 Pro (High)',
      tier2EvidenceSha256: 'a'.repeat(64),
      founderAuthorizationId: 'founder:phase3-cr1:pass:test',
    };
    const idempotencyKey = '40000000-0000-4000-8000-000000000010';
    const occurredAt = '2026-08-25T12:00:08.000Z';
    const event = {
      ...(events.at(-1) as Record<string, unknown>),
      eventId: '10000000-0000-4000-8000-000000000010',
      eventIndex: 10,
      eventType: 'attempt_adjudicated',
      idempotencyKey,
      requestSha256: phase3RequestSha256({ idempotencyKey, ...adjudication }),
      reasonCode: null,
      result: 'passed',
      adjudication,
      occurredAt,
    };
    const passed = {
      ...complete,
      attempt: {
        ...(complete['attempt'] as Record<string, unknown>),
        state: 'passed',
        finishedAt: occurredAt,
      },
      events: [...events, event],
    };
    assert.equal((await clientFor(passed).exportAttempt(ATTEMPT_ID, EXPECTED)).attempt.state, 'passed');

    for (const invalid of [
      {
        ...complete,
        events: [events[0]!, events[1]!, { ...events.at(-1)!, eventIndex: 3 }],
      },
      {
        ...complete,
        attempt: { ...(complete['attempt'] as object), state: 'passed', finishedAt: occurredAt },
      },
      {
        ...passed,
        events: [...events, { ...event, requestSha256: '0'.repeat(64) }],
      },
      {
        ...passed,
        attempt: { ...(passed['attempt'] as object), finishedAt: '2030-01-01T00:00:00.000Z' },
      },
      { ...passed, heartbeat: null },
    ]) {
      await assert.rejects(
        clientFor(invalid).exportAttempt(ATTEMPT_ID, EXPECTED),
        (error: unknown) => error instanceof Phase3ClientError && error.code === 'invalid_response',
      );
    }
  });

  it('binds a not-started event reason to its deterministic entry failure', async () => {
    const complete = await syntheticExport();
    const entryEvidence = {
      ...ENTRY_EVIDENCE,
      doctor: { ...ENTRY_EVIDENCE.doctor, primaryCustody: false },
    } as const;
    const expected: Phase3EvidenceExpectation = {
      ...EXPECTED,
      attempt: {
        ...EXPECTED.attempt,
        mode: 'not_started',
        reasonCode: 'custody_failed',
        entryEvidence,
        entryEvidenceSha256: phase3EntryEvidenceSha256(entryEvidence),
      },
    };
    const event = {
      ...(complete['events'] as Record<string, unknown>[])[0]!,
      eventType: 'attempt_not_started',
      reasonCode: 'custody_failed',
      teardownResult: 'not_required',
    };
    const notStarted = {
      ...complete,
      entryEvidence,
      attempt: {
        ...(complete['attempt'] as Record<string, unknown>),
        entryEvidenceSha256: phase3EntryEvidenceSha256(entryEvidence),
        state: 'not_started',
        finishedAt: complete['entryEvidenceRecordedAt'],
      },
      events: [event],
      heartbeat: null,
    };
    assert.equal(
      (await clientFor(notStarted).exportAttempt(ATTEMPT_ID, expected)).attempt.state,
      'not_started',
    );
    await assert.rejects(
      clientFor({ ...notStarted, events: [{ ...event, reasonCode: 'lane_state_failed' }] })
        .exportAttempt(ATTEMPT_ID, expected),
      (error: unknown) => error instanceof Phase3ClientError && error.code === 'invalid_response',
    );
  });

  it('binds every exported identity field to the local Founder plan', async () => {
    const complete = await syntheticExport();
    const attempt = complete['attempt'] as Record<string, unknown>;
    const variants = [
      { ...complete, attempt: { ...attempt, gatewayId: '22222222-3333-4444-8555-666666666666' } },
      { ...complete, attempt: { ...attempt, founderOsSha: '9'.repeat(40) } },
      { ...complete, attempt: { ...attempt, entryAuthorizationId: 'founder:different' } },
      { ...complete, attempt: { ...attempt, fixtureRepository: 'MADVenturesLLC/different' } },
      { ...complete, attempt: { ...attempt, machineIdentity: 'different-mac' } },
      {
        ...complete,
        context: { commit: '8'.repeat(40), environment: 'synthetic-test' },
        attempt: { ...attempt, buildRoomSha: '8'.repeat(40) },
      },
    ];
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      1_000,
      1,
      async () => new Response(JSON.stringify(variants.shift()), { status: 200 }),
    );
    for (let index = 0; index < 6; index += 1) {
      await assert.rejects(
        client.exportAttempt(ATTEMPT_ID, EXPECTED),
        (error: unknown) =>
          error instanceof Phase3ClientError && error.code === 'evidence_identity_mismatch',
      );
    }
  });

  it('requires the fixed non-authorization sentence exactly', async () => {
    const complete = await syntheticExport();
    const client = clientFor({
      ...complete,
      authorizes: `${String(complete['authorizes'])} appended-sensitive-text`,
    });
    await assert.rejects(
      client.exportAttempt(ATTEMPT_ID, EXPECTED),
      (error: unknown) => error instanceof Phase3ClientError && error.code === 'invalid_response',
    );
  });

  it('reconciles proxy 5xx responses through exact create and event evidence', async () => {
    const pristine = await pristineExport();
    const createResponses = [
      new Response(JSON.stringify({ error: 'bad_gateway' }), { status: 502 }),
      new Response(JSON.stringify(pristine), { status: 200 }),
    ];
    const createClient = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      50,
      1,
      async () => createResponses.shift()!,
    );
    const creation = await createClient.createAttempt(EXPECTED.attempt, EXPECTED);
    assert.equal(creation.reconciled, true);

    const event = {
      kind: 'lifecycle_stage',
      idempotencyKey: '20000000-0000-4000-8000-000000000002',
      stage: 'connect',
      artifactSha256: '7'.repeat(64),
    } as const;
    const priorEvents = pristine['events'] as Record<string, unknown>[];
    const appendExport = {
      ...pristine,
      events: [
        ...priorEvents,
        {
          eventId: '30000000-0000-4000-8000-000000000003',
          eventIndex: 3,
          eventType: 'lifecycle_stage_recorded',
          idempotencyKey: event.idempotencyKey,
          requestSha256: phase3RequestSha256(event),
          lifecycleStage: 'connect',
          stageArtifactSha256: event.artifactSha256,
          exchangeId: null,
          matchedRequestEventId: null,
          matchVerified: null,
          reasonCode: null,
          result: null,
          teardownResult: null,
          teardownEvidenceSha256: null,
          adjudication: null,
          occurredAt: '2026-08-25T12:00:02.000Z',
        },
      ],
    };
    const appendResponses = [
      new Response(JSON.stringify({ error: 'gateway_timeout' }), { status: 504 }),
      new Response(JSON.stringify(appendExport), { status: 200 }),
    ];
    const appendClient = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      50,
      1,
      async () => appendResponses.shift()!,
    );
    assert.deepEqual(await appendClient.appendEvent(ATTEMPT_ID, event, EXPECTED), {
      accepted: true,
      eventId: '30000000-0000-4000-8000-000000000003',
      replayed: true,
    });
  });

  it('reconciles oversized successful create and event responses', async () => {
    const pristine = await pristineExport();
    const oversized = (): Response =>
      new Response('{}', {
        status: 201,
        headers: { 'content-length': String(300_000) },
      });
    const createResponses = [
      oversized(),
      new Response(JSON.stringify(pristine), { status: 200 }),
    ];
    const createClient = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      50,
      1,
      async () => createResponses.shift()!,
    );
    assert.equal((await createClient.createAttempt(EXPECTED.attempt, EXPECTED)).reconciled, true);

    const event = {
      kind: 'lifecycle_stage',
      idempotencyKey: '20000000-0000-4000-8000-000000000012',
      stage: 'connect',
      artifactSha256: '7'.repeat(64),
    } as const;
    const prior = pristine['events'] as Record<string, unknown>[];
    const appendExport = {
      ...pristine,
      events: [
        ...prior,
        {
          ...prior[0],
          eventId: '30000000-0000-4000-8000-000000000012',
          eventIndex: 3,
          eventType: 'lifecycle_stage_recorded',
          idempotencyKey: event.idempotencyKey,
          requestSha256: phase3RequestSha256(event),
          lifecycleStage: 'connect',
          stageArtifactSha256: event.artifactSha256,
          occurredAt: '2026-08-25T12:00:02.000Z',
        },
      ],
    };
    const appendResponses = [
      oversized(),
      new Response(JSON.stringify(appendExport), { status: 200 }),
    ];
    const appendClient = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      50,
      1,
      async () => appendResponses.shift()!,
    );
    assert.equal((await appendClient.appendEvent(ATTEMPT_ID, event, EXPECTED)).replayed, true);
  });

  it('stops mutation retries after abort and performs one bounded reconciliation read', async () => {
    const controller = new AbortController();
    let posts = 0;
    let reads = 0;
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      50,
      1,
      async (_input, init) => {
        if (init?.method === 'POST') {
          posts += 1;
          controller.abort();
          throw new Phase3AbortError();
        }
        reads += 1;
        return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
      },
    );
    await assert.rejects(
      client.appendEvent(
        ATTEMPT_ID,
        {
          kind: 'lifecycle_stage',
          idempotencyKey: '20000000-0000-4000-8000-000000000002',
          stage: 'connect',
          artifactSha256: '7'.repeat(64),
        },
        EXPECTED,
        controller.signal,
      ),
      (error: unknown) => {
        assert.equal(
          error instanceof Phase3ClientError && error.code === 'commit_outcome_unresolved',
          true,
        );
        assert.deepEqual((error as Phase3ClientError).diagnostic, {
          operationStage: 'event_reconcile',
          failureClass: 'http_5xx',
        });
        return true;
      },
    );
    assert.equal(posts, 1);
    assert.equal(reads, 1);
  });

  it('treats malformed mutation success plus export outage as unresolved', async () => {
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      5,
      1,
      async (_input, init) =>
        init?.method === 'POST'
          ? new Response('{}', { status: 201 })
          : new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }),
    );
    await assert.rejects(
      client.createAttempt(EXPECTED.attempt, EXPECTED),
      (error: unknown) => {
        assert.equal(error instanceof Phase3ClientError, true);
        assert.equal((error as Phase3ClientError).code, 'commit_outcome_unresolved');
        assert.deepEqual(
          (error as Phase3ClientError & { diagnostic?: unknown }).diagnostic,
          {
            operationStage: 'attempt_create',
            failureClass: 'invalid_response',
          },
        );
        return true;
      },
    );
  });

  it('retains a closed DNS diagnostic when attempt creation never receives a response', async () => {
    const sensitiveMessage = 'fetch failed for Bearer must-not-land';
    let attemptedWrites = 0;
    let reconciliationReads = 0;
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      5,
      1,
      async (_input, init) => {
        if (init?.method === 'POST') {
          attemptedWrites += 1;
          throw Object.assign(new TypeError(sensitiveMessage), { cause: { code: 'ENOTFOUND' } });
        }
        reconciliationReads += 1;
        return new Response(JSON.stringify({ error: 'attempt_not_found' }), { status: 404 });
      },
    );

    await assert.rejects(
      client.createAttempt(EXPECTED.attempt, EXPECTED),
      (error: unknown) => {
        assert.equal(error instanceof Phase3ClientError, true);
        assert.equal((error as Phase3ClientError).code, 'commit_outcome_unresolved');
        assert.deepEqual(
          (error as Phase3ClientError & { diagnostic?: unknown }).diagnostic,
          {
            operationStage: 'attempt_create',
            failureClass: 'dns_resolution',
          },
        );
        assert.equal(JSON.stringify(error).includes(sensitiveMessage), false);
        return true;
      },
    );
    assert.equal(attemptedWrites > 0, true);
    assert.equal(reconciliationReads > 0, true);
  });

  for (const testCase of [
    {
      name: 'request construction failure',
      code: 'UND_ERR_INVALID_ARG',
      failureClass: 'request_construction',
    },
    { name: 'TLS failure', code: 'CERT_HAS_EXPIRED', failureClass: 'tls_connection' },
    { name: 'connection reset', code: 'ECONNRESET', failureClass: 'connection_reset' },
    { name: 'request timeout', code: 'UND_ERR_CONNECT_TIMEOUT', failureClass: 'request_timeout' },
  ] as const) {
    it(`retains a closed ${testCase.name} diagnostic`, async () => {
      const client = new Phase3ControlPlaneClient(
        'https://control-plane.example',
        'sensitive-test-token',
        5,
        1,
        async (_input, init) => {
          if (init?.method === 'POST') {
            throw Object.assign(new TypeError('must-not-land'), {
              cause: { code: testCase.code },
            });
          }
          return new Response(JSON.stringify({ error: 'attempt_not_found' }), { status: 404 });
        },
      );

      await assert.rejects(
        client.createAttempt(EXPECTED.attempt, EXPECTED),
        (error: unknown) => {
          assert.deepEqual(
            (error as Phase3ClientError & { diagnostic?: unknown }).diagnostic,
            {
              operationStage: 'attempt_create',
              failureClass: testCase.failureClass,
            },
          );
          assert.equal(JSON.stringify(error).includes('must-not-land'), false);
          return true;
        },
      );
    });
  }

  it('classifies request serialization before the fetch boundary', async () => {
    let fetchCalls = 0;
    const input = Object.defineProperty({ ...EXPECTED.attempt }, 'toJSON', {
      enumerable: false,
      value: () => {
        throw new TypeError('must-not-land');
      },
    });
    const expected = { ...EXPECTED, attempt: input } as Phase3EvidenceExpectation;
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      5,
      1,
      async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ error: 'attempt_not_found' }), { status: 404 });
      },
    );

    await assert.rejects(
      client.createAttempt(input, expected),
      (error: unknown) => {
        assert.deepEqual(
          (error as Phase3ClientError & { diagnostic?: unknown }).diagnostic,
          {
            operationStage: 'attempt_create',
            failureClass: 'request_serialization',
          },
        );
        assert.equal(JSON.stringify(error).includes('must-not-land'), false);
        return true;
      },
    );
    assert.equal(fetchCalls > 0, true, 'reconciliation reads still use the fetch boundary');
  });

  it('retains HTTP 5xx as the mutation failure after unsuccessful reconciliation', async () => {
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      5,
      1,
      async (_input, init) =>
        init?.method === 'POST'
          ? new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })
          : new Response(JSON.stringify({ error: 'attempt_not_found' }), { status: 404 }),
    );

    await assert.rejects(
      client.createAttempt(EXPECTED.attempt, EXPECTED),
      (error: unknown) => {
        assert.deepEqual(
          (error as Phase3ClientError & { diagnostic?: unknown }).diagnostic,
          {
            operationStage: 'attempt_create',
            failureClass: 'http_5xx',
          },
        );
        return true;
      },
    );
  });

  it('retains an oversized mutation response as the unresolved cause', async () => {
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      5,
      1,
      async (_input, init) =>
        init?.method === 'POST'
          ? new Response('{}', {
              status: 201,
              headers: { 'content-length': String(300_000) },
            })
          : new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }),
    );

    await assert.rejects(
      client.createAttempt(EXPECTED.attempt, EXPECTED),
      (error: unknown) => {
        assert.deepEqual(
          (error as Phase3ClientError & { diagnostic?: unknown }).diagnostic,
          {
            operationStage: 'attempt_create',
            failureClass: 'response_too_large',
          },
        );
        return true;
      },
    );
  });

  it('binds an unresolved append transport failure to the event operation', async () => {
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      5,
      1,
      async (_input, init) => {
        if (init?.method === 'POST') {
          throw Object.assign(new TypeError('must-not-land'), { cause: { code: 'ECONNRESET' } });
        }
        return new Response(JSON.stringify({ error: 'attempt_not_found' }), { status: 404 });
      },
    );

    await assert.rejects(
      client.appendEvent(
        ATTEMPT_ID,
        {
          kind: 'lifecycle_stage',
          idempotencyKey: '20000000-0000-4000-8000-000000000099',
          stage: 'connect',
          artifactSha256: '7'.repeat(64),
        },
        EXPECTED,
      ),
      (error: unknown) => {
        assert.deepEqual(
          (error as Phase3ClientError & { diagnostic?: unknown }).diagnostic,
          {
            operationStage: 'event_append',
            failureClass: 'connection_reset',
          },
        );
        return true;
      },
    );
  });

  it('bounds hostile cyclic error causes without retaining their text', async () => {
    const cyclic = new TypeError('Bearer must-not-land') as TypeError & { cause?: unknown };
    cyclic.cause = cyclic;
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      5,
      1,
      async (_input, init) => {
        if (init?.method === 'POST') throw cyclic;
        return new Response(JSON.stringify({ error: 'attempt_not_found' }), { status: 404 });
      },
    );

    await assert.rejects(
      client.createAttempt(EXPECTED.attempt, EXPECTED),
      (error: unknown) => {
        assert.deepEqual(
          (error as Phase3ClientError & { diagnostic?: unknown }).diagnostic,
          {
            operationStage: 'attempt_create',
            failureClass: 'request_construction',
          },
        );
        assert.equal(JSON.stringify(error).includes('must-not-land'), false);
        return true;
      },
    );
  });

  it('classifies Node 22 header construction TypeError without an error code', async () => {
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      5,
      1,
      async (_input, init) => {
        if (init?.method === 'POST') throw new TypeError('Bearer must-not-land');
        return new Response(JSON.stringify({ error: 'attempt_not_found' }), { status: 404 });
      },
    );

    await assert.rejects(
      client.createAttempt(EXPECTED.attempt, EXPECTED),
      (error: unknown) => {
        assert.deepEqual(
          (error as Phase3ClientError & { diagnostic?: unknown }).diagnostic,
          {
            operationStage: 'attempt_create',
            failureClass: 'request_construction',
          },
        );
        assert.equal(JSON.stringify(error).includes('must-not-land'), false);
        return true;
      },
    );
  });

  it('never retries mutation after reconciliation returns the wrong identity', async () => {
    const complete = await syntheticExport();
    const wrongIdentity = {
      ...complete,
      attempt: {
        ...(complete['attempt'] as object),
        founderOsSha: '9'.repeat(40),
      },
    };
    let posts = 0;
    let reads = 0;
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      50,
      1,
      async (_input, init) => {
        if (init?.method === 'POST') {
          posts += 1;
          return new Response(JSON.stringify({ error: 'not_leader' }), { status: 503 });
        }
        reads += 1;
        return new Response(JSON.stringify(wrongIdentity), { status: 200 });
      },
    );
    await assert.rejects(
      client.appendEvent(
        ATTEMPT_ID,
        {
          kind: 'lifecycle_stage',
          idempotencyKey: '20000000-0000-4000-8000-000000000002',
          stage: 'connect',
          artifactSha256: '7'.repeat(64),
        },
        EXPECTED,
      ),
      (error: unknown) =>
        error instanceof Phase3ClientError && error.code === 'commit_outcome_unresolved',
    );
    assert.equal(posts, 1);
    assert.equal(reads, 1);
  });
});

describe('Phase 3 HTTP client — identity before bearer', () => {
  it('reads public identity without Authorization and refuses redirects', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: Phase3Fetch = async (input, init = {}) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          service: '@build-room/control-plane',
          commit: '1'.repeat(40),
          environment: 'test',
        }),
        { status: 200 },
      );
    };
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      1_000,
      1,
      fetchImpl,
    );
    assert.deepEqual(await client.version(), { commit: '1'.repeat(40), environment: 'test' });
    assert.equal((calls[0]?.init.headers as Record<string, string> | undefined)?.['authorization'], undefined);
    assert.equal(calls[0]?.init.redirect, 'error');
  });

  it('accepts a complete redacted export and rejects an incomplete heartbeat object', async () => {
    const complete = await syntheticExport();
    const responses = [complete, { ...complete, heartbeat: {} }];
    const client = new Phase3ControlPlaneClient(
      'https://control-plane.example',
      'sensitive-test-token',
      1_000,
      1,
      async () => new Response(JSON.stringify(responses.shift()), { status: 200 }),
    );
    assert.equal(
      (await client.exportAttempt(ATTEMPT_ID, EXPECTED)).heartbeat?.algorithm,
      'Ed25519',
    );
    await assert.rejects(
      client.exportAttempt(ATTEMPT_ID, EXPECTED),
      (error: unknown) => error instanceof Phase3ClientError && error.code === 'invalid_response',
    );
  });

  it('independently verifies canonical Ed25519 heartbeat proof and freshness', async () => {
    const complete = await signedExport();
    const client = clientFor(complete);
    assert.deepEqual(await client.waitForHeartbeat(ATTEMPT_ID, 300_000, EXPECTED), {
      captured: true,
    });
  });

  for (const testCase of [
    {
      name: 'a corrupted gateway identity',
      code: 'heartbeat_invalid',
      mutate: (heartbeat: Record<string, unknown>) => {
        const signedBytes = Buffer.from(String(heartbeat['signedBytesBase64']), 'base64');
        const wrongGateway = '22222222-3333-4444-8555-666666666666';
        return {
          ...heartbeat,
          signedBytesBase64: Buffer.from(
            signedBytes.toString('utf8').replace(EXPECTED.attempt.gatewayId, wrongGateway),
          ).toString('base64'),
        };
      },
    },
    {
      name: 'corrupted canonical signed bytes',
      code: 'heartbeat_invalid',
      mutate: (heartbeat: Record<string, unknown>) => {
        const signedBytes = Buffer.from(String(heartbeat['signedBytesBase64']), 'base64');
        signedBytes[0] = (signedBytes[0] ?? 0) ^ 1;
        return { ...heartbeat, signedBytesBase64: signedBytes.toString('base64') };
      },
    },
    {
      name: 'a corrupted signature',
      code: 'bad_signature',
      mutate: (heartbeat: Record<string, unknown>) => {
        const signature = Buffer.from(String(heartbeat['signatureBase64']), 'base64');
        signature[0] = (signature[0] ?? 0) ^ 1;
        return { ...heartbeat, signatureBase64: signature.toString('base64') };
      },
    },
    {
      name: 'corrupted freshness evidence',
      code: 'stale_heartbeat',
      mutate: (heartbeat: Record<string, unknown>) => ({
        ...heartbeat,
        acceptedAt: new Date(Number(heartbeat['timestampMs']) + 300_001).toISOString(),
        freshnessMs: 300_001,
      }),
    },
  ] as const) {
    it(`rejects ${testCase.name}`, async () => {
      const complete = await signedExport();
      const heartbeat = complete['heartbeat'] as Record<string, unknown>;
      const corrupted = {
        ...complete,
        heartbeat: testCase.mutate(heartbeat),
      };

      await assert.rejects(
        clientFor(corrupted).waitForHeartbeat(ATTEMPT_ID, 300_000, EXPECTED),
        (error: unknown) =>
          error instanceof Phase3ClientError && error.code === testCase.code,
      );
    });
  }

  it('aborts heartbeat polling on the operator signal', async () => {
    const complete = await pristineExport();
    const controller = new AbortController();
    const waiting = clientFor(complete, 1_000).waitForHeartbeat(
      ATTEMPT_ID,
      300_000,
      EXPECTED,
      controller.signal,
    );
    setImmediate(() => controller.abort());
    await assert.rejects(waiting, (error: unknown) => error instanceof Phase3AbortError);
  });
});

async function syntheticExport(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile('test/fixtures/phase3-run-evidence.synthetic.json', 'utf8'),
  ) as Record<string, unknown>;
}

async function signedExport(): Promise<Record<string, unknown>> {
  const complete = await syntheticExport();
  const attempt = complete['attempt'] as Record<string, unknown>;
  const keypair = generateKeyPairSync('ed25519');
  const jwk = createPublicKey(keypair.privateKey).export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') throw new Error('test public key has no x member');
  const publicKey = Buffer.from(jwk.x, 'base64url');
  const keyId = createHash('sha256').update(publicKey).digest('hex');
  const timestampMs = Date.parse('2026-08-25T12:00:00.000Z');
  const signedBytes = heartbeatSignedBytes({
    gatewayId: String(attempt['gatewayId']),
    keyId,
    epoch: 'a'.repeat(64),
    sequence: 1,
    nonce: 'b'.repeat(64),
    timestampMs,
  });
  return {
    ...complete,
    heartbeat: {
      algorithm: 'Ed25519',
      keyId,
      sequence: 1,
      timestampMs,
      acceptedAt: new Date(timestampMs + 1_000).toISOString(),
      freshnessMs: 1_000,
      freshnessWindowMs: 300_000,
      signedBytesBase64: Buffer.from(signedBytes).toString('base64'),
      signatureBase64: sign(null, Buffer.from(signedBytes), keypair.privateKey).toString('base64'),
      publicKeyBase64: publicKey.toString('base64'),
      signatureVerified: true,
    },
  };
}

async function pristineExport(): Promise<Record<string, unknown>> {
  const complete = await syntheticExport();
  const first = (complete['events'] as Record<string, unknown>[])[0]!;
  return {
    ...complete,
    attempt: { ...(complete['attempt'] as object), state: 'active' },
    heartbeat: null,
    events: [
      first,
      {
        ...first,
        eventId: '10000000-0000-4000-8000-000000000002',
        eventIndex: 2,
        eventType: 'entry_verified',
      },
    ],
  };
}

function clientFor(exported: Record<string, unknown>, pollIntervalMs = 1) {
  return new Phase3ControlPlaneClient(
    'https://control-plane.example',
    'sensitive-test-token',
    1_000,
    pollIntervalMs,
    async () => new Response(JSON.stringify(exported), { status: 200 }),
  );
}
