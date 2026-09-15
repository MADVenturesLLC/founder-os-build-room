import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  TEST_TOKEN,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import {
  TEST_IP,
  enrollGateway,
  makeSessionNode,
  openSession,
  promoteNode,
  signedBeat,
  startNodeServer,
  type SessionNode,
} from './gateway-session-helpers.js';
import { Phase3ControlPlaneClient } from '../packages/run-harness/src/phase3/client.js';
import type { GatewayHooks } from '../packages/control-plane/src/gateway/hooks.js';
import {
  phase3EntryEvidenceSha256,
  type Phase3AttemptInput,
  type Phase3EvidenceExport,
  type Phase3EvidenceExpectation,
} from '../packages/control-plane/src/phase3-run.js';
import { performPhase3Attempt, type Phase3FixturePort } from '../packages/run-harness/src/phase3/runner.js';
import type { Phase3AttemptPlan, Phase3EntryObservation } from '../packages/run-harness/src/phase3/model.js';

let harness: GatewayHarness | undefined;
let node: SessionNode | undefined;
let server: { url: string; close: () => Promise<void> } | undefined;
const ADJUDICATION_TOKEN = 'phase3-adjudication-test-token-value';
/** Request timeout for the harness `Phase3ControlPlaneClient`s in this file. */
const CLIENT_REQUEST_TIMEOUT_MS = 1_000;
/**
 * Reconciliation budget for the one `runWithPostCommitDemotion` scenario
 * that must actually reconcile a real commit-then-re-export round trip
 * (see `FINALIZATION_COMMIT`). Kept independent of
 * `CLIENT_REQUEST_TIMEOUT_MS` — they happen to share a value today, but
 * one is "enough for ordinary test traffic" and the other is "enough
 * headroom that a real round trip under load won't be mistaken for a
 * lost write"; tuning one for its own reasons shouldn't silently move
 * the other. Also independent of `DEMOTION_CLIENT_TIMEOUT_MS` for the
 * same reason, even though it too now shares the value.
 */
const FINALIZATION_RECONCILIATION_TIMEOUT_MS = 1_000;
/** Default `requestTimeoutMs` for `runWithPostCommitDemotion` — see its doc comment. */
const DEMOTION_CLIENT_TIMEOUT_MS = 1_000;
// Commit indices (1-based, counting `afterCommit` fires) in a clean
// `runWithPostCommitDemotion` run: create, connect, adapter_registered,
// request, matched_response, disconnect, attempt_finished.
const CREATE_COMMIT = 1;
const FIRST_LIFECYCLE_STAGE_COMMIT = 2;
const FINALIZATION_COMMIT = 7;

beforeEach(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('phase3-routes');
  node = await makeSessionNode(harness, { configOverrides: { commitSha: '2'.repeat(40) } });
  await promoteNode(node);
  server = await startNodeServer(harness, node);
});

afterEach(async () => {
  await server?.close();
  await node?.surface.stop();
  await destroyGatewayHarness(harness);
  harness = undefined;
  node = undefined;
  server = undefined;
});

describe('Phase 3 run routes — authentication before parsing', { skip: STORAGE_SKIP }, () => {
  it('returns the same 401 for missing and wrong tokens without parsing the body', async () => {
    for (const authorization of [undefined, 'Bearer wrong-token']) {
      const response = await fetch(`${server!.url}/control-plane/phase3/run-attempts`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(authorization === undefined ? {} : { authorization }),
        },
        body: '{malformed',
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'unauthorized' });
    }
  });
});

describe('Phase 3 run routes — closed write and export surface', { skip: STORAGE_SKIP }, () => {
  it('rejects CR2 as the first durable attempt', async () => {
    const input = { ...attemptBody(), runLabel: 'Phase3-CR2' as const };
    await insertEnrolledGateway(input.gatewayId);
    const response = await request('/control-plane/phase3/run-attempts', 'POST', input);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'sequence_invalid' });
  });

  it('creates and exports one exact attempt', async () => {
    const input = attemptBody();
    await insertEnrolledGateway(input.gatewayId);
    const created = await request('/control-plane/phase3/run-attempts', 'POST', input);
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), {
      runAttemptId: input.runAttemptId,
      state: 'active',
      created: true,
    });

    const exported = await request(
      `/control-plane/phase3/run-attempts/${input.runAttemptId}/export`,
      'GET',
    );
    assert.equal(exported.status, 200);
    const body = (await exported.json()) as Record<string, unknown>;
    assert.equal(body['schema'], 'build-room/phase3-run-evidence@1');
    assert.match(String(body['authorizes']), /Nothing/);
  });

  it('refuses a client attempt to write heartbeat evidence', async () => {
    const input = attemptBody();
    await insertEnrolledGateway(input.gatewayId);
    assert.equal((await request('/control-plane/phase3/run-attempts', 'POST', input)).status, 201);

    const response = await request(
      `/control-plane/phase3/run-attempts/${input.runAttemptId}/events`,
      'POST',
      {
        kind: 'heartbeat_verified',
        idempotencyKey: randomUUID(),
        signature: 'not-accepted',
      },
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  });

  it('is consumable through the token-holding harness client without leaking its token', async () => {
    const input = attemptBody();
    await insertEnrolledGateway(input.gatewayId);
    const client = new Phase3ControlPlaneClient(server!.url, TEST_TOKEN, CLIENT_REQUEST_TIMEOUT_MS, 1);
    const expected = routeExpectation(input);
    await client.createAttempt(input, expected);
    const exported = await client.exportAttempt(input.runAttemptId, expected);
    assert.equal(exported.attempt.runAttemptId, input.runAttemptId);

    const secret = 'wrong-but-sensitive-client-token';
    const wrong = new Phase3ControlPlaneClient(server!.url, secret, CLIENT_REQUEST_TIMEOUT_MS, 1);
    await assert.rejects(
      wrong.exportAttempt(input.runAttemptId, expected),
      (error: unknown) => error instanceof Error && !error.message.includes(secret),
    );
  });

  it('returns a durable 409 lifecycle refusal through the harness client', async () => {
    const input = attemptBody();
    await insertEnrolledGateway(input.gatewayId);
    const client = new Phase3ControlPlaneClient(server!.url, TEST_TOKEN, CLIENT_REQUEST_TIMEOUT_MS, 1);
    const expected = routeExpectation(input);
    assert.equal((await client.createAttempt(input, expected)).created, true);
    const refusal = await client.appendEvent(input.runAttemptId, {
      kind: 'lifecycle_stage',
      idempotencyKey: randomUUID(),
      stage: 'connect',
      artifactSha256: 'a'.repeat(64),
    }, expected);
    assert.equal(refusal.accepted, false);
    assert.equal(refusal.reasonCode, 'out_of_order_stage');
    assert.equal(
      (await client.exportAttempt(input.runAttemptId, expected)).attempt.state,
      'failure_pending_teardown',
    );
  });

  it('carries a real-route refusal through the runner without losing its reason', async () => {
    const gateway = await enrollGateway(node!);
    const epoch = await openSession(node!, gateway);
    const client = new Phase3ControlPlaneClient(server!.url, TEST_TOKEN, CLIENT_REQUEST_TIMEOUT_MS, 1);
    const plan: Phase3AttemptPlan = {
      runAttemptId: randomUUID(),
      label: 'Phase3-CR1',
      entryAuthorizationId: 'founder:phase3-cr1:test',
      founderOsSha: '1'.repeat(40),
      founderOs: { repository: 'MADVenturesLLC/FounderOS', path: '/tmp/FounderOS' },
      buildRoomSha: '2'.repeat(40),
      controlPlaneOrigin: server!.url,
      gatewayId: gateway.gatewayId,
      expectedEnrollments: [{ gatewayId: gateway.gatewayId, state: 'enrolled' }],
      fixture: {
        repository: 'MADVenturesLLC/phase3-fixture',
        path: '/synthetic/fixture',
        sha: '3'.repeat(40),
      },
      environment: node!.config.environment,
      machine: 'test-mac',
      heartbeatFreshnessMs: node!.config.gatewayTimestampWindowMs,
    };
    const observation: Phase3EntryObservation = {
      status: 'complete',
      observedAt: new Date().toISOString(),
      founderOs: {
        repository: plan.founderOs.repository,
        sha: plan.founderOsSha,
        treeSha: '9'.repeat(40),
        clean: true,
      },
      buildRoom: {
        repository: 'MADVenturesLLC/founder-os-build-room',
        sha: plan.buildRoomSha,
        treeSha: '8'.repeat(40),
        clean: true,
        buildPassed: true,
      },
      controlPlane: { commit: plan.buildRoomSha, environment: plan.environment, status: 200 },
      machineIdentity: plan.machine,
      nodeMajor: 22,
      fixture: {
        repository: plan.fixture.repository,
        sha: plan.fixture.sha,
        treeSha: '7'.repeat(40),
        clean: true,
      },
      enrollments: plan.expectedEnrollments,
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
    let replacedConnect = false;
    const result = await performPhase3Attempt(plan, {
      observeEntry: async () => observation,
      eventPort: {
        createAttempt: (input, expected, signal) => client.createAttempt(input, expected, signal),
        waitForHeartbeat: async (runAttemptId, freshnessMs, expected, signal) => {
          assert.equal(
            (await node!.service.heartbeat(signedBeat(node!, gateway, epoch, 1), TEST_IP)).status,
            200,
          );
          return client.waitForHeartbeat(runAttemptId, freshnessMs, expected, signal);
        },
        appendEvent: (runAttemptId, event, expected, signal) => {
          if (!replacedConnect && event.kind === 'lifecycle_stage') {
            replacedConnect = true;
            return client.appendEvent(runAttemptId, {
              kind: 'lifecycle_stage',
              idempotencyKey: event.idempotencyKey,
              stage: 'request',
              artifactSha256: event.artifactSha256,
              exchangeId: randomUUID(),
            }, expected, signal);
          }
          return client.appendEvent(runAttemptId, event, expected, signal);
        },
        exportAttempt: (runAttemptId, expected) => client.exportAttempt(runAttemptId, expected),
      },
      fixture: syntheticFixture(),
      fixtureStillBound: async () => true,
      newId: randomUUID,
      now: () => new Date().toISOString(),
    });

    assert.equal(result.outcome, 'failed');
    assert.equal(result.reasonCode, 'out_of_order_stage');
  });

  it('does not expose adjudication to the harness-held control-plane token', async () => {
    const { input } = await createAwaitingAttempt();
    const response = await request(
      `/control-plane/phase3/run-attempts/${input.runAttemptId}/adjudication`,
      'POST',
      {
        idempotencyKey: randomUUID(),
        verdict: 'passed',
        tier2ReviewerId: 'Gemini 3.1 Pro (High)',
        tier2EvidenceSha256: '9'.repeat(64),
        founderAuthorizationId: 'founder:phase3-cr1:pass:test',
      },
    );
    assert.equal(response.status, 404);
  });

  it('authenticates adjudication separately before parsing and then permits CR2', async () => {
    await restartNode({}, { phase3AdjudicationToken: ADJUDICATION_TOKEN });
    const { input, gateway } = await createAwaitingAttempt();
    const path = `/control-plane/phase3/run-attempts/${input.runAttemptId}/adjudication`;
    const body = {
      idempotencyKey: randomUUID(),
      verdict: 'passed',
      tier2ReviewerId: 'Gemini 3.1 Pro (High)',
      tier2EvidenceSha256: '9'.repeat(64),
      founderAuthorizationId: 'founder:phase3-cr1:pass:test',
    };
    const sharedToken = await fetch(`${server!.url}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TEST_TOKEN}`, 'content-type': 'application/json' },
      body: '{malformed',
    });
    assert.equal(sharedToken.status, 401);

    const adjudicated = await fetch(`${server!.url}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ADJUDICATION_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    assert.equal(adjudicated.status, 201);
    assert.equal((await node!.surface.phase3Runs.exportAttempt(input.runAttemptId)).attempt.state, 'passed');

    const cr2 = {
      ...attemptBody(gateway.gatewayId),
      runLabel: 'Phase3-CR2' as const,
      entryAuthorizationId: 'founder:phase3-cr2:test',
    };
    assert.equal((await request('/control-plane/phase3/run-attempts', 'POST', cr2)).status, 201);
  });
});

describe('Phase 3 run routes — leadership fence', { skip: STORAGE_SKIP }, () => {
  it('rolls back when leadership is lost before commit', async () => {
    let fencedNode!: SessionNode;
    await restartNode({
      phase3Run: {
        beforePreCommitRecheck: () => fencedNode.leadership.demote('phase3_test_precommit'),
      },
    }).then((value) => {
      fencedNode = value;
    });
    const input = attemptBody();
    await insertEnrolledGateway(input.gatewayId);

    const response = await request('/control-plane/phase3/run-attempts', 'POST', input);
    assert.equal(response.status, 503);
    assert.equal(await attemptCount(input.runAttemptId), 0);
  });

  it('withholds success after post-commit demotion while retaining the fenced write', async () => {
    let fencedNode!: SessionNode;
    await restartNode({
      phase3Run: {
        afterCommit: () => fencedNode.leadership.demote('phase3_test_postcommit'),
      },
    }).then((value) => {
      fencedNode = value;
    });
    const input = attemptBody();
    await insertEnrolledGateway(input.gatewayId);

    const response = await request('/control-plane/phase3/run-attempts', 'POST', input);
    assert.equal(response.status, 503);
    assert.equal(await attemptCount(input.runAttemptId), 1);
  });

  it('returns an explicit unresolved stop when creation committed before demotion', async () => {
    const result = await runWithPostCommitDemotion(CREATE_COMMIT);
    assert.equal(result.outcome, 'unresolved_commit');
    assert.equal((result.evidence as Phase3EvidenceExport).attempt.state, 'active');
    assert.equal(
      (result.evidence as Phase3EvidenceExport).events.some(
        (event) => event.eventType === 'attempt_finished',
      ),
      false,
    );
  });

  it('reconciles a committed lifecycle stage before returning an unresolved stop', async () => {
    const result = await runWithPostCommitDemotion(FIRST_LIFECYCLE_STAGE_COMMIT);
    assert.equal(result.outcome, 'unresolved_commit');
    assert.deepEqual(
      (result.evidence as Phase3EvidenceExport).events
        .filter((event) => event.eventType === 'lifecycle_stage_recorded')
        .map((event) => event.lifecycleStage),
      ['connect'],
    );
  });

  it('reconciles committed finalization and returns awaiting adjudication', async () => {
    // See `runWithPostCommitDemotion`'s doc comment for why this scenario,
    // unlike the two above, needs a real reconciliation budget.
    const result = await runWithPostCommitDemotion(FINALIZATION_COMMIT, FINALIZATION_RECONCILIATION_TIMEOUT_MS);
    assert.equal(result.outcome, 'awaiting_adjudication');
    assert.equal((result.evidence as Phase3EvidenceExport).attempt.state, 'awaiting_adjudication');
  });
});

async function request(path: string, method: 'GET' | 'POST', body?: unknown): Promise<Response> {
  return fetch(`${server!.url}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TEST_TOKEN}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function attemptBody(gatewayId: string = randomUUID()) {
  const entryEvidence = syntheticEntryEvidence(gatewayId, node?.config.environment ?? 'test');
  return {
    mode: 'started',
    runAttemptId: randomUUID(),
    runLabel: 'Phase3-CR1',
    entryAuthorizationId: 'founder:phase3-cr1:test',
    founderOsSha: '1'.repeat(40),
    buildRoomSha: '2'.repeat(40),
    fixtureRepository: 'MADVenturesLLC/phase3-fixture',
    fixtureSha: '3'.repeat(40),
    gatewayId,
    expectedEnrollments: [{ gatewayId, state: 'enrolled' }],
    machineIdentity: 'test-mac',
    entryEvidence,
    entryEvidenceSha256: phase3EntryEvidenceSha256(entryEvidence),
  } as const;
}

async function createAwaitingAttempt() {
  const gateway = await enrollGateway(node!);
  const epoch = await openSession(node!, gateway);
  const input = attemptBody(gateway.gatewayId);
  await node!.surface.phase3Runs.createAttempt(input);
  assert.equal(
    (await node!.service.heartbeat(signedBeat(node!, gateway, epoch, 1), TEST_IP)).status,
    200,
  );
  await appendCompleteLifecycle(input.runAttemptId);
  await node!.surface.phase3Runs.appendEvent(input.runAttemptId, {
    kind: 'attempt_finished',
    idempotencyKey: randomUUID(),
    result: 'awaiting_adjudication',
    teardownResult: 'completed',
    teardownEvidenceSha256: '8'.repeat(64),
  });
  return { input, gateway };
}

async function appendCompleteLifecycle(runAttemptId: string): Promise<void> {
  const exchangeId = randomUUID();
  let requestEventId = '';
  for (const stage of ['connect', 'adapter_registered', 'request', 'matched_response', 'disconnect'] as const) {
    const result = await node!.surface.phase3Runs.appendEvent(runAttemptId, {
      kind: 'lifecycle_stage',
      idempotencyKey: randomUUID(),
      stage,
      artifactSha256: '7'.repeat(64),
      ...(stage === 'request' ? { exchangeId } : {}),
      ...(stage === 'matched_response'
        ? { exchangeId, matchedRequestEventId: requestEventId, matchVerified: true as const }
        : {}),
    });
    if (stage === 'request') requestEventId = result.eventId;
  }
}

function syntheticEntryEvidence(gatewayId: string, environment: string) {
  return {
    status: 'complete',
    observedAt: new Date().toISOString(),
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
      repository: 'MADVenturesLLC/phase3-fixture',
      sha: '3'.repeat(40),
      treeSha: 'c'.repeat(40),
      clean: true,
    },
    controlPlane: { commit: '2'.repeat(40), environment, status: 200 },
    machineIdentity: 'test-mac',
    nodeMajor: 22,
    enrollments: [{ gatewayId, state: 'enrolled' }],
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
}

async function insertEnrolledGateway(gatewayId: string): Promise<void> {
  const { rows } = await harness!.pool.query<{ seq: string }>(
    `INSERT INTO gateway_registry_events
       (event_id, event_type, gateway_id, actor, attribution, occurred_at, payload)
     VALUES ($1, 'enrolled', $2, $3, $4, now(), $5) RETURNING seq`,
    [
      randomUUID(),
      gatewayId,
      JSON.stringify({ kind: 'founder' }),
      JSON.stringify({ roleId: 'builder' }),
      JSON.stringify({ synthetic: true }),
    ],
  );
  await harness!.pool.query(
    `INSERT INTO gateway_current_state
       (gateway_id, state, state_since, last_event_seq, is_currently_enrolled)
     VALUES ($1, 'enrolled', now(), $2, true)`,
    [gatewayId, rows[0]!.seq],
  );
}

async function restartNode(
  hooks: GatewayHooks,
  configOverrides: { readonly phase3AdjudicationToken?: string | null } = {},
): Promise<SessionNode> {
  await server?.close();
  await node?.leadership.releaseGracefully();
  await node?.surface.stop();
  node = await makeSessionNode(harness!, {
    hooks,
    configOverrides: { commitSha: '2'.repeat(40), ...configOverrides },
  });
  await promoteNode(node);
  server = await startNodeServer(harness!, node);
  return node;
}

async function attemptCount(runAttemptId: string): Promise<number> {
  const { rows } = await harness!.pool.query<{ count: string }>(
    'SELECT count(*) FROM phase3_run_attempts WHERE run_attempt_id = $1',
    [runAttemptId],
  );
  return Number(rows[0]?.count ?? '-1');
}

function syntheticFixture(): Phase3FixturePort {
  return {
    connect: async () => ({ sessionId: 'synthetic-session', artifactSha256: '1'.repeat(64) }),
    register: async () => ({ adapterId: 'synthetic-adapter', artifactSha256: '2'.repeat(64) }),
    request: async () => ({
      exchangeId: randomUUID(),
      requestSha256: '3'.repeat(64),
      responseSha256: '4'.repeat(64),
      matched: true,
    }),
    disconnect: async () => ({ artifactSha256: '5'.repeat(64) }),
  };
}

function routeExpectation(input: Phase3AttemptInput): Phase3EvidenceExpectation {
  return { attempt: input, environment: node!.config.environment };
}

/**
 * `requestTimeoutMs` bounds the client's own reconciliation deadline (a
 * small multiple of it — see `Phase3ControlPlaneClient.writeReconciliationDeadline`).
 * It has to stay generous everywhere in this helper, not just for
 * `FINALIZATION_COMMIT`: every fenced write's route commits
 * unconditionally, even a pure idempotent replay of an already-applied
 * write (see `createAttemptFenced`/`appendEventFenced` in
 * `packages/control-plane/src/phase3-run.ts`), so a too-tight budget that
 * client-side-aborts a merely slow-but-successful response causes the
 * client to retry it — and that retry's harmless replay still fires
 * `afterCommit` again. That injects an extra counted commit before the
 * step this test actually means to target, silently demoting the wrong
 * write. (This is how `FINALIZATION_COMMIT`'s original 50ms budget being
 * unsafe generalized: under load it corrupted the commit *count* here,
 * not just that one write's outcome.) `FINALIZATION_COMMIT` additionally
 * needs `FINALIZATION_RECONCILIATION_TIMEOUT_MS` at its own call site
 * because, unlike every other scenario, its demoted write is expected to
 * actually succeed via reconciliation rather than stay unresolved.
 */
async function runWithPostCommitDemotion(demoteAtCommit: number, requestTimeoutMs = DEMOTION_CLIENT_TIMEOUT_MS) {
  let phase3Commits = 0;
  let fencedNode!: SessionNode;
  fencedNode = await restartNode({
    phase3Run: {
      afterCommit: () => {
        phase3Commits += 1;
        if (phase3Commits === demoteAtCommit) {
          fencedNode.leadership.demote(`phase3_test_postcommit_${demoteAtCommit}`);
        }
      },
    },
  });
  const gateway = await enrollGateway(fencedNode);
  const epoch = await openSession(fencedNode, gateway);
  const plan: Phase3AttemptPlan = {
    runAttemptId: randomUUID(),
    label: 'Phase3-CR1',
    entryAuthorizationId: 'founder:phase3-cr1:postcommit-test',
    founderOsSha: '1'.repeat(40),
    founderOs: { repository: 'MADVenturesLLC/FounderOS', path: '/tmp/FounderOS' },
    buildRoomSha: '2'.repeat(40),
    controlPlaneOrigin: server!.url,
    gatewayId: gateway.gatewayId,
    expectedEnrollments: [{ gatewayId: gateway.gatewayId, state: 'enrolled' }],
    fixture: {
      repository: 'MADVenturesLLC/phase3-fixture',
      path: '/synthetic/fixture',
      sha: '3'.repeat(40),
    },
    environment: fencedNode.config.environment,
    machine: 'test-mac',
    heartbeatFreshnessMs: 100,
  };
  const observation: Phase3EntryObservation = {
    status: 'complete',
    observedAt: new Date().toISOString(),
    founderOs: {
      repository: plan.founderOs.repository,
      sha: plan.founderOsSha,
      treeSha: '9'.repeat(40),
      clean: true,
    },
    buildRoom: {
      repository: 'MADVenturesLLC/founder-os-build-room',
      sha: plan.buildRoomSha,
      treeSha: '8'.repeat(40),
      clean: true,
      buildPassed: true,
    },
    controlPlane: { commit: plan.buildRoomSha, environment: plan.environment, status: 200 },
    machineIdentity: plan.machine,
    nodeMajor: 22,
    fixture: {
      repository: plan.fixture.repository,
      sha: plan.fixture.sha,
      treeSha: '7'.repeat(40),
      clean: true,
    },
    enrollments: plan.expectedEnrollments,
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
  const client = new Phase3ControlPlaneClient(server!.url, TEST_TOKEN, requestTimeoutMs, 1);
  let heartbeatSent = false;
  return performPhase3Attempt(plan, {
    observeEntry: async () => observation,
    eventPort: {
      createAttempt: (input, expected, signal) => client.createAttempt(input, expected, signal),
      waitForHeartbeat: async (runAttemptId, freshnessMs, expected, signal) => {
        if (demoteAtCommit === 1) return { captured: false };
        if (!heartbeatSent) {
          heartbeatSent = true;
          assert.equal(
            (await fencedNode.service.heartbeat(
              signedBeat(fencedNode, gateway, epoch, 1),
              TEST_IP,
            )).status,
            200,
          );
        }
        return client.waitForHeartbeat(runAttemptId, freshnessMs, expected, signal);
      },
      appendEvent: (runAttemptId, event, expected, signal) =>
        client.appendEvent(runAttemptId, event, expected, signal),
      exportAttempt: (runAttemptId, expected) => client.exportAttempt(runAttemptId, expected),
    },
    fixture: syntheticFixture(),
    fixtureStillBound: async () => true,
    newId: randomUUID,
    now: () => new Date().toISOString(),
  });
}
