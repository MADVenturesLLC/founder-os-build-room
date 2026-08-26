import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import type {
  Phase3AttemptPlan,
  Phase3EntryObservation,
} from '../packages/run-harness/src/phase3/model.js';
import {
  Phase3AbortError,
  Phase3ClientError,
} from '../packages/run-harness/src/phase3/client.js';
import {
  performPhase3Attempt,
  type Phase3AttemptRunnerDeps,
  type Phase3EventPort,
  type Phase3FixturePort,
} from '../packages/run-harness/src/phase3/runner.js';
import { verifyFixtureRepository } from '../packages/run-harness/src/phase3/repository.js';
import type { Phase3EventInput } from '../packages/control-plane/src/phase3-run.js';

const execute = promisify(execFile);
const tempDirectories: string[] = [];

afterEach(async () => {
  for (const directory of tempDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

const ATTEMPT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const GATEWAY_ID = '11111111-2222-4333-8444-555555555555';
const BUILD_SHA = '5df7bd222a99e49c5f5a8ea449ffa2ef28a14de4';

const PLAN: Phase3AttemptPlan = {
  runAttemptId: ATTEMPT_ID,
  label: 'Phase3-CR1',
  entryAuthorizationId: 'founder:phase3-cr1:test',
  founderOsSha: '9e87ba2b3cf632d892207b29211727bdf89c87d7',
  founderOs: { repository: 'MADVenturesLLC/FounderOS', path: '/tmp/FounderOS' },
  buildRoomSha: BUILD_SHA,
  controlPlaneOrigin: 'https://control-plane.example',
  gatewayId: GATEWAY_ID,
  expectedEnrollments: [{ gatewayId: GATEWAY_ID, state: 'enrolled' }],
  fixture: {
    repository: 'MADVenturesLLC/phase3-fixture',
    path: '/tmp/phase3-fixture',
    sha: '1'.repeat(40),
  },
  environment: 'test',
  machine: 'test-mac',
  heartbeatFreshnessMs: 300_000,
};

const OBSERVATION: Phase3EntryObservation = {
  status: 'complete',
  observedAt: '2026-08-25T12:00:00.000Z',
  founderOs: {
    repository: PLAN.founderOs.repository,
    sha: PLAN.founderOsSha,
    treeSha: '9'.repeat(40),
    clean: true,
  },
  buildRoom: {
    repository: 'MADVenturesLLC/founder-os-build-room',
    sha: BUILD_SHA,
    treeSha: '8'.repeat(40),
    clean: true,
    buildPassed: true,
  },
  controlPlane: { commit: BUILD_SHA, environment: 'test', status: 200 },
  machineIdentity: 'test-mac',
  nodeMajor: 22,
  fixture: {
    repository: PLAN.fixture.repository,
    sha: PLAN.fixture.sha,
    treeSha: '7'.repeat(40),
    clean: true,
  },
  enrollments: PLAN.expectedEnrollments,
  doctor: {
    daemonReachable: true,
    primaryLane: 'IDLE',
    stagingLane: 'INACTIVE',
    primaryCustody: true,
    stagingCustody: false,
    custodyError: false,
    stagingLockPresent: false,
  },
};

function fixture(matched = true): Phase3FixturePort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    connect: async () => {
      calls.push('connect');
      return { sessionId: 'session', artifactSha256: '1'.repeat(64) };
    },
    register: async () => {
      calls.push('adapter_registered');
      return { adapterId: 'adapter', artifactSha256: '2'.repeat(64) };
    },
    request: async () => {
      calls.push('request');
      calls.push('matched_response');
      return {
        exchangeId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        requestSha256: '3'.repeat(64),
        responseSha256: '4'.repeat(64),
        matched,
      };
    },
    disconnect: async () => {
      calls.push('disconnect');
      return { artifactSha256: '5'.repeat(64) };
    },
  };
}

function port(
  refuseCleanupDisconnect = false,
  heartbeatError: Error | null = null,
  created = true,
): Phase3EventPort & {
  attempts: Array<Record<string, unknown>>;
  events: Phase3EventInput[];
} {
  const attempts: Array<Record<string, unknown>> = [];
  const events: Phase3EventInput[] = [];
  return {
    attempts,
    events,
    createAttempt: async (input) => {
      attempts.push(input as unknown as Record<string, unknown>);
      return {
        created,
        runAttemptId: input.runAttemptId,
        state: input.mode === 'not_started' ? 'not_started' : 'active',
      };
    },
    waitForHeartbeat: async () => {
      if (heartbeatError !== null) throw heartbeatError;
      return { captured: true };
    },
    appendEvent: async (_attemptId, event) => {
      events.push(event);
      if (
        refuseCleanupDisconnect &&
        event.kind === 'lifecycle_stage' &&
        event.stage === 'disconnect'
      ) {
        return {
          accepted: false,
          replayed: false,
          eventId: '00000000-0000-4000-8000-000000000099',
          reasonCode: 'out_of_order_stage',
        };
      }
      return {
        accepted: true,
        replayed: false,
        eventId: `00000000-0000-4000-8000-${String(events.length).padStart(12, '0')}`,
      };
    },
    exportAttempt: async () => ({
      schema: 'build-room/phase3-run-evidence@1',
      authorizes: 'Nothing.',
    }),
  };
}

function deps(
  eventPort: Phase3EventPort,
  fixturePort: Phase3FixturePort,
  observation: Phase3EntryObservation = OBSERVATION,
  fixtureStillBound = true,
  signal?: AbortSignal,
): Phase3AttemptRunnerDeps {
  let ids = 0;
  return {
    observeEntry: async () => observation,
    eventPort,
    fixture: fixturePort,
    fixtureStillBound: async () => fixtureStillBound,
    newId: () => {
      ids += 1;
      return `10000000-0000-4000-8000-${String(ids).padStart(12, '0')}`;
    },
    now: () => '2026-08-25T12:00:00.000Z',
    signal,
  };
}

describe('Phase 3 attempt runner — fail-closed entry', () => {
  it('rejects invalid plans locally before observation or remote attempt creation', async () => {
    const cases = [
      {
        plan: { ...PLAN, runAttemptId: PLAN.label },
        reasonCode: 'attempt_identity_invalid',
      },
      {
        plan: { ...PLAN, entryAuthorizationId: '' },
        reasonCode: 'authorization_invalid',
      },
      {
        plan: { ...PLAN, heartbeatFreshnessMs: 0 },
        reasonCode: 'context_invalid',
      },
      {
        plan: { ...PLAN, expectedEnrollments: [] },
        reasonCode: 'enrollment_projection_failed',
      },
    ] as const;

    for (const testCase of cases) {
      const eventPort = port();
      const fixturePort = fixture();
      let observationCalls = 0;
      const runnerDeps: Phase3AttemptRunnerDeps = {
        ...deps(eventPort, fixturePort),
        observeEntry: async () => {
          observationCalls += 1;
          return OBSERVATION;
        },
      };

      const result = await performPhase3Attempt(testCase.plan, runnerDeps);

      assert.deepEqual(
        {
          outcome: result.outcome,
          reasonCode: result.reasonCode,
          schema: (result.evidence as Record<string, unknown>)['schema'],
          observationCalls,
          attemptWrites: eventPort.attempts.length,
          eventWrites: eventPort.events.length,
          fixtureCalls: fixturePort.calls.length,
        },
        {
          outcome: 'not_started',
          reasonCode: testCase.reasonCode,
          schema: 'build-room/phase3-local-plan-rejected@1',
          observationCalls: 0,
          attemptWrites: 0,
          eventWrites: 0,
          fixtureCalls: 0,
        },
      );
    }
  });

  it('records not-started and performs no fixture action', async () => {
    const eventPort = port();
    const fixturePort = fixture();
    const result = await performPhase3Attempt(
      PLAN,
      deps(eventPort, fixturePort, {
        ...OBSERVATION,
        buildRoom: { ...OBSERVATION.buildRoom, buildPassed: false },
      }),
    );

    assert.equal(result.outcome, 'not_started');
    assert.equal(eventPort.attempts[0]?.['mode'], 'not_started');
    assert.equal(eventPort.attempts[0]?.['reasonCode'], 'build_failed');
    assert.deepEqual(fixturePort.calls, []);
    assert.deepEqual(eventPort.events, []);
  });

  it('canonicalizes enrollment order in the entry-evidence identity', async () => {
    const denied = {
      gatewayId: '22222222-3333-4444-8555-666666666666',
      state: 'denied' as const,
    };
    const plan = { ...PLAN, expectedEnrollments: [...PLAN.expectedEnrollments, denied] };
    const firstPort = port();
    const secondPort = port();
    await performPhase3Attempt(
      plan,
      deps(firstPort, fixture(), {
        ...OBSERVATION,
        buildRoom: { ...OBSERVATION.buildRoom, buildPassed: false },
        enrollments: plan.expectedEnrollments,
      }),
    );
    await performPhase3Attempt(
      plan,
      deps(secondPort, fixture(), {
        ...OBSERVATION,
        buildRoom: { ...OBSERVATION.buildRoom, buildPassed: false },
        enrollments: [...plan.expectedEnrollments].reverse(),
      }),
    );
    assert.equal(
      firstPort.attempts[0]?.['entryEvidenceSha256'],
      secondPort.attempts[0]?.['entryEvidenceSha256'],
    );
  });

  it('records real wrong-SHA and dirty fixture preflights as not-started', async () => {
    const repository = await fixtureRepository();
    const cases = [
      {
        expectedSha: '9'.repeat(40),
        expectedReason: 'fixture_sha_mismatch',
      },
      {
        expectedSha: repository.sha,
        expectedReason: 'fixture_unavailable',
        dirty: true,
      },
    ] as const;

    for (const testCase of cases) {
      if ('dirty' in testCase && testCase.dirty === true) {
        await writeFile(join(repository.path, 'untracked.txt'), 'dirty\n', 'utf8');
      }
      const eventPort = port();
      const fixturePort = fixture();
      const runnerDeps = {
        ...deps(eventPort, fixturePort),
        observeEntry: async () => {
          await verifyFixtureRepository({
            path: repository.path,
            expectedSha: testCase.expectedSha,
            expectedRepository: PLAN.fixture.repository,
          });
          return OBSERVATION;
        },
      };
      const result = await performPhase3Attempt(
        { ...PLAN, fixture: { ...PLAN.fixture, path: repository.path, sha: testCase.expectedSha } },
        runnerDeps,
      );

      assert.equal(result.outcome, 'not_started');
      assert.equal(result.reasonCode, testCase.expectedReason);
      assert.equal(eventPort.attempts[0]?.['mode'], 'not_started');
      assert.deepEqual(fixturePort.calls, []);
    }
  });

  it('does not restart an existing attempt or touch the fixture', async () => {
    const eventPort = port(false, null, false);
    const fixturePort = fixture();
    const result = await performPhase3Attempt(PLAN, deps(eventPort, fixturePort));

    assert.equal(result.outcome, 'existing_attempt');
    assert.deepEqual(fixturePort.calls, []);
    assert.deepEqual(eventPort.events, []);
  });

  it('records continuous creation ambiguity plus transport or 404 as local unresolved', async () => {
    for (const finalError of [clientError('transport_error'), clientError('attempt_not_found', 404)]) {
      const eventPort = port();
      eventPort.createAttempt = async () => {
        throw clientError('commit_outcome_unresolved');
      };
      eventPort.exportAttempt = async () => {
        throw finalError;
      };
      const fixturePort = fixture();
      const result = await performPhase3Attempt(PLAN, deps(eventPort, fixturePort));
      assert.equal(result.outcome, 'unresolved_commit');
      assert.equal(
        (result.evidence as Record<string, unknown>)['schema'],
        'build-room/phase3-local-unresolved@1',
      );
      assert.equal((result.evidence as Record<string, unknown>)['remoteState'], 'unknown');
      assert.equal(JSON.stringify(result.evidence).includes('"outcome":"failed"'), false);
      assert.deepEqual(fixturePort.calls, []);
    }
  });

  it('carries only the closed client diagnostic into versioned local evidence', async () => {
    const eventPort = port();
    eventPort.createAttempt = async () => {
      throw Object.assign(
        new Phase3ClientError(0, 'commit_outcome_unresolved', {
          operationStage: 'attempt_create',
          failureClass: 'dns_resolution',
        }),
        {
        unsafeDetail: 'Bearer must-not-land',
        },
      );
    };
    eventPort.exportAttempt = async () => {
      throw clientError('attempt_not_found', 404);
    };

    const result = await performPhase3Attempt(PLAN, deps(eventPort, fixture()));

    assert.equal(result.outcome, 'unresolved_commit');
    assert.deepEqual(
      {
        schema: (result.evidence as Record<string, unknown>)['schema'],
        diagnostic: (result.evidence as Record<string, unknown>)['diagnostic'],
        leaked: JSON.stringify(result.evidence).includes('must-not-land'),
      },
      {
        schema: 'build-room/phase3-local-unresolved@2',
        diagnostic: {
          operationStage: 'attempt_create',
          failureClass: 'dns_resolution',
        },
        leaked: false,
      },
    );
  });

  it('uses recovery diagnostics only when no primary diagnostic exists', async () => {
    for (const testCase of [
      {
        source: new Phase3ClientError(0, 'commit_outcome_unresolved'),
        expected: { operationStage: 'evidence_export', failureClass: 'request_timeout' },
      },
      {
        source: new Phase3ClientError(0, 'commit_outcome_unresolved', {
          operationStage: 'attempt_create',
          failureClass: 'dns_resolution',
        }),
        expected: { operationStage: 'attempt_create', failureClass: 'dns_resolution' },
      },
    ] as const) {
      const eventPort = port();
      eventPort.createAttempt = async () => {
        throw testCase.source;
      };
      eventPort.exportAttempt = async () => {
        throw new Phase3ClientError(0, 'transport_error', {
          operationStage: 'evidence_export',
          failureClass: 'request_timeout',
        });
      };

      const result = await performPhase3Attempt(PLAN, deps(eventPort, fixture()));

      assert.deepEqual(
        (result.evidence as Record<string, unknown>)['diagnostic'],
        testCase.expected,
      );
    }
  });
});

describe('Phase 3 attempt runner — lifecycle', () => {
  it('records the five ordered stages and stops at awaiting adjudication', async () => {
    const eventPort = port();
    const fixturePort = fixture();
    const result = await performPhase3Attempt(PLAN, deps(eventPort, fixturePort));

    assert.equal(result.outcome, 'awaiting_adjudication');
    assert.deepEqual(fixturePort.calls, [
      'connect',
      'adapter_registered',
      'request',
      'matched_response',
      'disconnect',
    ]);
    assert.deepEqual(
      eventPort.events
        .filter((event) => event.kind === 'lifecycle_stage')
        .map((event) => event.stage),
      ['connect', 'adapter_registered', 'request', 'matched_response', 'disconnect'],
    );
    const finish = eventPort.events.at(-1);
    assert.equal(finish?.kind, 'attempt_finished');
    if (finish?.kind === 'attempt_finished') assert.equal(finish.result, 'awaiting_adjudication');
    assert.equal(JSON.stringify(result.evidence).includes('passed'), false);
  });

  it('fails on a mismatched response and still disconnects', async () => {
    const eventPort = port(true);
    const fixturePort = fixture(false);
    const result = await performPhase3Attempt(PLAN, deps(eventPort, fixturePort));

    assert.equal(result.outcome, 'failed');
    assert.equal(result.reasonCode, 'response_mismatch');
    assert.equal(fixturePort.calls.at(-1), 'disconnect');
  });

  it('preserves response_mismatch when best-effort disconnect evidence throws', async () => {
    const eventPort = port();
    const append = eventPort.appendEvent;
    eventPort.appendEvent = async (runAttemptId, event, expected, signal) => {
      if (event.kind === 'lifecycle_stage' && event.stage === 'disconnect') {
        throw new Error('synthetic disconnect evidence failure');
      }
      return append(runAttemptId, event, expected, signal);
    };

    const result = await performPhase3Attempt(PLAN, deps(eventPort, fixture(false)));

    assert.equal(result.outcome, 'failed');
    assert.equal(result.reasonCode, 'response_mismatch');
    const terminal = eventPort.events.filter((event) => event.kind === 'attempt_finished');
    assert.equal(terminal.length, 1);
    if (terminal[0]?.kind === 'attempt_finished') {
      assert.equal(terminal[0].reasonCode, 'response_mismatch');
    }
  });

  it('interrupts when the fixture SHA or cleanliness drifts after lifecycle work', async () => {
    const eventPort = port();
    const result = await performPhase3Attempt(PLAN, deps(eventPort, fixture(), OBSERVATION, false));

    assert.equal(result.outcome, 'interrupted');
    assert.equal(result.reasonCode, 'fixture_sha_mismatch');
    const finish = eventPort.events.at(-1);
    assert.equal(finish?.kind, 'attempt_finished');
    if (finish?.kind === 'attempt_finished') assert.equal(finish.result, 'interrupted');
  });

  it('durably fails a polling error instead of stranding an active attempt', async () => {
    const eventPort = port(false, new Error('transport'));
    const result = await performPhase3Attempt(PLAN, deps(eventPort, fixture()));

    assert.equal(result.outcome, 'failed');
    assert.equal(result.reasonCode, 'heartbeat_invalid');
    const finish = eventPort.events.at(-1);
    assert.equal(finish?.kind, 'attempt_finished');
  });

  it('stops without follow-up append, export, or fixture calls when heartbeat evidence is untrusted', async () => {
    for (const testCase of [
      ['evidence_identity_mismatch', 'evidence_export'],
      ['invalid_response', 'evidence_export'],
      ['response_too_large', 'evidence_export'],
      ['heartbeat_invalid', 'heartbeat_verify'],
      ['bad_signature', 'heartbeat_verify'],
      ['stale_heartbeat', 'heartbeat_verify'],
    ] as const) {
      const [code, operationStage] = testCase;
      const eventPort = port(false, clientError(code));
      let exportCalls = 0;
      const exportAttempt = eventPort.exportAttempt;
      eventPort.exportAttempt = async (...args) => {
        exportCalls += 1;
        return exportAttempt(...args);
      };
      const fixturePort = fixture();

      const result = await performPhase3Attempt(PLAN, deps(eventPort, fixturePort));

      assert.deepEqual(
        {
          injectedTrustFailure: code,
          outcome: result.outcome,
          reasonCode: result.reasonCode,
          attemptWrites: eventPort.attempts.length,
          followUpEventWrites: eventPort.events.length,
          exportCalls,
          fixtureCalls: fixturePort.calls.length,
        },
        {
          injectedTrustFailure: code,
          outcome: 'unresolved_commit',
          reasonCode: 'evidence_write_failed',
          attemptWrites: 1,
          followUpEventWrites: 0,
          exportCalls: 0,
          fixtureCalls: 0,
        },
      );
      assert.equal(
        (result.evidence as Record<string, unknown>)['schema'],
        'build-room/phase3-local-unresolved@2',
      );
      assert.deepEqual((result.evidence as Record<string, unknown>)['diagnostic'], {
        operationStage,
        failureClass: code,
      });
    }
  });

  it('retains a safe diagnostic on a heartbeat trust stop without follow-up writes', async () => {
    const eventPort = port(
      false,
      new Phase3ClientError(200, 'invalid_response', {
        operationStage: 'evidence_export',
        failureClass: 'invalid_response',
      }),
    );
    const result = await performPhase3Attempt(PLAN, deps(eventPort, fixture()));

    assert.deepEqual(
      {
        schema: (result.evidence as Record<string, unknown>)['schema'],
        diagnostic: (result.evidence as Record<string, unknown>)['diagnostic'],
        followUpWrites: eventPort.events.length,
      },
      {
        schema: 'build-room/phase3-local-unresolved@2',
        diagnostic: {
          operationStage: 'evidence_export',
          failureClass: 'invalid_response',
        },
        followUpWrites: 0,
      },
    );
  });

  it('binds completed teardown evidence to the adapter disconnect artifact', async () => {
    const eventPort = port();
    await performPhase3Attempt(PLAN, deps(eventPort, fixture()));
    const finish = eventPort.events.at(-1);
    assert.equal(finish?.kind, 'attempt_finished');
    if (finish?.kind === 'attempt_finished') {
      assert.equal(finish.teardownEvidenceSha256, '5'.repeat(64));
    }
  });

  it('turns operator abort into interrupted evidence after bounded teardown', async () => {
    const controller = new AbortController();
    const eventPort = port();
    const fixturePort = fixture();
    const originalConnect = fixturePort.connect;
    fixturePort.connect = async () => {
      const connected = await originalConnect();
      controller.abort(new Phase3AbortError());
      return connected;
    };

    const result = await performPhase3Attempt(
      PLAN,
      deps(eventPort, fixturePort, OBSERVATION, true, controller.signal),
    );
    assert.equal(result.outcome, 'interrupted');
    assert.equal(result.reasonCode, 'operator_interrupted');
    assert.equal(fixturePort.calls.at(-1), 'disconnect');
    const finish = eventPort.events.at(-1);
    assert.equal(finish?.kind, 'attempt_finished');
    if (finish?.kind === 'attempt_finished') assert.equal(finish.result, 'interrupted');
  });

  it('does not cross the next lifecycle boundary when an append receives SIGINT', async () => {
    for (const abortAfter of ['connect', 'adapter_registered', 'request'] as const) {
      const controller = new AbortController();
      const eventPort = port();
      const append = eventPort.appendEvent;
      eventPort.appendEvent = async (runAttemptId, event, expected) => {
        const result = await append(runAttemptId, event, expected);
        if (event.kind === 'lifecycle_stage' && event.stage === abortAfter) controller.abort();
        return result;
      };
      const result = await performPhase3Attempt(
        PLAN,
        deps(eventPort, fixture(), OBSERVATION, true, controller.signal),
      );
      assert.equal(result.outcome, 'interrupted');
      const stages = eventPort.events
        .filter((event) => event.kind === 'lifecycle_stage')
        .map((event) => event.stage);
      const boundary = stages.indexOf(abortAfter);
      assert.equal(boundary >= 0, true);
      assert.equal(
        stages.slice(boundary + 1).every((stage) => stage === 'disconnect'),
        true,
      );
    }
  });

  it('classifies an aborted heartbeat wait as interrupted, not invalid', async () => {
    const eventPort = port(false, new Phase3AbortError());
    const result = await performPhase3Attempt(PLAN, deps(eventPort, fixture()));
    assert.equal(result.outcome, 'interrupted');
    assert.equal(result.reasonCode, 'operator_interrupted');
  });

  it('records continuous append and export outage as local unresolved', async () => {
    const eventPort = port(false, new Error('poll failed'));
    eventPort.appendEvent = async () => {
      throw clientError('commit_outcome_unresolved');
    };
    eventPort.exportAttempt = async () => {
      throw clientError('transport_error');
    };
    const result = await performPhase3Attempt(PLAN, deps(eventPort, fixture()));
    assert.equal(result.outcome, 'unresolved_commit');
    assert.equal((result.evidence as Record<string, unknown>)['schema'], 'build-room/phase3-local-unresolved@1');
  });

  it('keeps acknowledged awaiting finalization when its export is unavailable', async () => {
    for (const code of ['transport_error', 'response_too_large']) {
      const eventPort = port();
      eventPort.exportAttempt = async () => {
        throw clientError(code);
      };
      const result = await performPhase3Attempt(PLAN, deps(eventPort, fixture()));
      assert.equal(result.outcome, 'unresolved_commit');
      assert.equal(
        eventPort.events.filter(
          (event) => event.kind === 'attempt_finished' && event.result === 'awaiting_adjudication',
        ).length,
        1,
      );
      assert.equal(
        eventPort.events.filter(
          (event) => event.kind === 'attempt_finished' && event.result === 'failed',
        ).length,
        0,
      );
    }
  });

  it('does not append a second terminal event when post-final export rejects', async () => {
    const eventPort = port();
    eventPort.exportAttempt = async () => {
      throw clientError('unauthorized', 401);
    };

    await assert.rejects(
      performPhase3Attempt(PLAN, deps(eventPort, fixture())),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        (error as { code: unknown }).code === 'unauthorized',
    );
    assert.equal(
      eventPort.events.filter((event) => event.kind === 'attempt_finished').length,
      1,
    );
    const terminal = eventPort.events.at(-1);
    assert.equal(terminal?.kind, 'attempt_finished');
    if (terminal?.kind === 'attempt_finished') {
      assert.equal(terminal.result, 'awaiting_adjudication');
    }
  });
});

function clientError(
  code: string,
  status = 0,
): Error & { readonly code: string; readonly status: number } {
  return Object.assign(new Error(code), { code, status });
}

async function fixtureRepository(): Promise<{ readonly path: string; readonly sha: string }> {
  const path = await mkdtemp(join(tmpdir(), 'phase3-runner-fixture-'));
  tempDirectories.push(path);
  await execute('git', ['init', '-q', path]);
  await execute('git', ['-C', path, 'config', 'user.email', 'fixture@example.invalid']);
  await execute('git', ['-C', path, 'config', 'user.name', 'Fixture']);
  await execute('git', [
    '-C',
    path,
    'remote',
    'add',
    'origin',
    `https://github.com/${PLAN.fixture.repository}.git`,
  ]);
  await writeFile(join(path, 'phase3-stub.json'), '{}\n', 'utf8');
  await execute('git', ['-C', path, 'add', 'phase3-stub.json']);
  await execute('git', ['-C', path, 'commit', '-q', '-m', 'fixture']);
  const { stdout } = await execute('git', ['-C', path, 'rev-parse', 'HEAD']);
  return { path, sha: stdout.trim() };
}
