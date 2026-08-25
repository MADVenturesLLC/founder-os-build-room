import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { GATEWAY_EVENT_TYPES } from '../packages/gateway-registry/src/index.js';
import { MIGRATIONS } from '../packages/control-plane/src/migrations.js';
import {
  Phase3RunConflictError,
  Phase3RunStore,
  type Phase3AttemptInput,
  type Phase3HeartbeatEvidence,
} from '../packages/control-plane/src/phase3-run.js';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';

let harness: GatewayHarness | undefined;
let store: Phase3RunStore | undefined;

beforeEach(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('phase3-run-events');
  store = new Phase3RunStore(harness.pool, harness.config);
});

afterEach(async () => {
  await destroyGatewayHarness(harness);
  harness = undefined;
  store = undefined;
});

describe('0005_phase3_run_evidence — additive migration contract', () => {
  it('is registered exactly once after every existing migration', () => {
    const ids = MIGRATIONS.map((migration) => migration.id);
    assert.equal(ids.at(-1), '0005_phase3_run_evidence');
    assert.equal(ids.filter((id) => id === '0005_phase3_run_evidence').length, 1);
  });

  it('does not alter the closed six-event gateway enrollment vocabulary', () => {
    assert.deepEqual(GATEWAY_EVENT_TYPES, [
      'minted',
      'key_received',
      'enrolled',
      'denied',
      'revoked',
      'expired',
    ]);
  });
});

describe('0005_phase3_run_evidence — storage shape', { skip: STORAGE_SKIP }, () => {
  it('creates the attempt projection and append-only event log', async () => {
    const { rows } = await harness!.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'phase3_run_%'
        ORDER BY table_name`,
    );
    assert.deepEqual(rows.map((row) => row.table_name), [
      'phase3_run_attempts',
      'phase3_run_events',
    ]);
  });

  it('accepts a valid attempt and start event, then rejects mutation', async () => {
    const attemptId = randomUUID();
    await insertAttempt(attemptId);
    await insertEvent(attemptId, 'attempt_started', 1);

    await assert.rejects(
      () =>
        harness!.pool.query(
          `UPDATE phase3_run_events SET event_type = 'attempt_not_started'
            WHERE run_attempt_id = $1`,
          [attemptId],
        ),
      /append-only/,
    );
    await assert.rejects(
      () => harness!.pool.query('DELETE FROM phase3_run_events WHERE run_attempt_id = $1', [attemptId]),
      /append-only/,
    );
  });

  it('rejects unknown event types, duplicate positions, and a second active attempt for one gateway', async () => {
    const attemptId = randomUUID();
    const gatewayId = randomUUID();
    await insertAttempt(attemptId, gatewayId);

    await assert.rejects(() => insertEvent(attemptId, 'invented_event', 1), /event_type/);
    await insertEvent(attemptId, 'attempt_started', 1);
    await assert.rejects(
      () => insertEvent(attemptId, 'entry_verified', 1),
      /phase3_run_events_attempt_index_unique/,
    );
    await assert.rejects(() => insertAttempt(randomUUID(), gatewayId), /active_gateway/);
  });

  it('rejects stage evidence whose typed exchange fields do not match its stage', async () => {
    const attemptId = randomUUID();
    await insertAttempt(attemptId);
    await insertEvent(attemptId, 'attempt_started', 1);
    await assert.rejects(
      () =>
        harness!.pool.query(
          `INSERT INTO phase3_run_events
             (event_id, run_attempt_id, event_index, event_type, lifecycle_stage,
              stage_artifact_sha256, occurred_at)
           VALUES ($1,$2,2,'lifecycle_stage_recorded','request',$3,now())`,
          [randomUUID(), attemptId, 'a'.repeat(64)],
        ),
      /lifecycle_exchange_shape/,
    );
  });

  it('requires teardown proof for awaiting adjudication', async () => {
    const attemptId = randomUUID();
    await insertAttempt(attemptId);
    await insertEvent(attemptId, 'attempt_started', 1);
    await assert.rejects(
      () =>
        harness!.pool.query(
          `INSERT INTO phase3_run_events
             (event_id, run_attempt_id, event_index, event_type, result,
              teardown_result, occurred_at)
           VALUES ($1,$2,2,'attempt_finished','awaiting_adjudication','completed',now())`,
          [randomUUID(), attemptId],
        ),
      /terminal_shape/,
    );
  });

  it('rejects a projection change with no matching next event', async () => {
    const attemptId = randomUUID();
    await insertAttempt(attemptId);
    await insertEvent(attemptId, 'attempt_started', 1);
    await assert.rejects(
      () =>
        harness!.pool.query(
          `UPDATE phase3_run_attempts
              SET state = 'failed', finished_at = now()
            WHERE run_attempt_id = $1`,
          [attemptId],
        ),
      /projection update lacks matching event/,
    );
  });

  it('rejects a lifecycle projection advanced by the wrong recorded stage', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    await harness!.pool.query(
      `INSERT INTO phase3_run_events
         (event_id, run_attempt_id, event_index, event_type, lifecycle_stage,
          stage_artifact_sha256, occurred_at)
       VALUES ($1,$2,4,'lifecycle_stage_recorded','adapter_registered',$3,now())`,
      [randomUUID(), input.runAttemptId, 'a'.repeat(64)],
    );
    await assert.rejects(
      harness!.pool.query(
        `UPDATE phase3_run_attempts
            SET lifecycle_position = 1, last_event_index = 4
          WHERE run_attempt_id = $1`,
        [input.runAttemptId],
      ),
      /projection update lacks matching event/,
    );
  });

  it('rejects awaiting adjudication before heartbeat and all five stages', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await harness!.pool.query(
      `INSERT INTO phase3_run_events
         (event_id, run_attempt_id, event_index, event_type, result,
          teardown_result, teardown_evidence_sha256, occurred_at)
       VALUES ($1,$2,3,'attempt_finished','awaiting_adjudication','completed',$3,now())`,
      [randomUUID(), input.runAttemptId, 'b'.repeat(64)],
    );
    await assert.rejects(
      harness!.pool.query(
        `UPDATE phase3_run_attempts
            SET state = 'awaiting_adjudication', last_event_index = 3
          WHERE run_attempt_id = $1`,
        [input.runAttemptId],
      ),
      /projection update lacks matching event/,
    );
  });

  it('requires terminal finished_at to equal its matching event timestamp', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    const { rows } = await harness!.pool.query<{ occurred_at: Date }>(
      `INSERT INTO phase3_run_events
         (event_id, run_attempt_id, event_index, event_type, result, reason_code,
          teardown_result, teardown_evidence_sha256, occurred_at)
       VALUES ($1,$2,3,'attempt_finished','failed','internal_error','not_required',$3,now())
       RETURNING occurred_at`,
      [randomUUID(), input.runAttemptId, 'c'.repeat(64)],
    );
    await assert.rejects(
      harness!.pool.query(
        `UPDATE phase3_run_attempts
            SET state = 'failed', last_event_index = 3, finished_at = $2
          WHERE run_attempt_id = $1`,
        [input.runAttemptId, new Date(rows[0]!.occurred_at.getTime() + 1_000)],
      ),
      /projection update lacks matching event/,
    );
  });
});

describe('Phase 3 run store — ordered, bounded evidence', { skip: STORAGE_SKIP }, () => {
  it('refuses to start against a nonexistent gateway', async () => {
    await assert.rejects(
      store!.createAttempt(attemptInput()),
      (error: unknown) => error instanceof Error && error.message === 'enrollment_projection_failed',
    );
  });

  it('refuses an unexpected projection row added after local observation', async () => {
    const input = await enrolledAttemptInput();
    await insertTerminalGateway(randomUUID());
    await assert.rejects(
      store!.createAttempt(input),
      (error: unknown) => error instanceof Error && error.message === 'enrollment_projection_failed',
    );
  });

  it('retains not-started evidence for a requested gateway that does not exist', async () => {
    const input: Phase3AttemptInput = {
      ...attemptInput(),
      mode: 'not_started',
      reasonCode: 'gateway_not_enrolled',
    };
    const result = await store!.createAttempt(input);
    assert.equal(result.created, true);
    assert.equal(result.state, 'not_started');

    const { rows } = await harness!.pool.query<{
      requested_gateway_id: string;
      gateway_id: string | null;
    }>(
      `SELECT requested_gateway_id, gateway_id FROM phase3_run_attempts
        WHERE run_attempt_id = $1`,
      [input.runAttemptId],
    );
    assert.equal(rows[0]?.requested_gateway_id, input.gatewayId);
    assert.equal(rows[0]?.gateway_id, null);
    assert.equal((await store!.exportAttempt(input.runAttemptId)).attempt.gatewayId, input.gatewayId);
  });

  it('creates started evidence idempotently and stamps the control-plane environment', async () => {
    const input = await enrolledAttemptInput();
    const first = await store!.createAttempt(input);
    const replay = await store!.createAttempt(input);

    assert.equal(first.created, true);
    assert.equal(replay.created, false);
    assert.equal(first.state, 'active');

    const { rows } = await harness!.pool.query<{
      event_type: string;
      event_index: number;
      environment_label: string;
    }>(
      `SELECT e.event_type, e.event_index, a.environment_label
         FROM phase3_run_events e
         JOIN phase3_run_attempts a USING (run_attempt_id)
        WHERE e.run_attempt_id = $1 ORDER BY e.event_index`,
      [input.runAttemptId],
    );
    assert.deepEqual(rows.map(({ event_type, event_index }) => ({ event_type, event_index })), [
      { event_type: 'attempt_started', event_index: 1 },
      { event_type: 'entry_verified', event_index: 2 },
    ]);
    assert.equal(rows[0]?.environment_label, harness!.config.environment);
  });

  it('serializes concurrent identical creation into one create and one replay', async () => {
    const input = await enrolledAttemptInput();
    const results = await Promise.all([
      store!.createAttempt(input),
      store!.createAttempt(input),
    ]);
    assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
    const { rows } = await harness!.pool.query<{ count: string }>(
      'SELECT count(*) FROM phase3_run_events WHERE run_attempt_id = $1',
      [input.runAttemptId],
    );
    assert.equal(rows[0]?.count, '2');
  });

  it('rejects a run-attempt UUID replayed with a different start mode', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await assert.rejects(
      store!.createAttempt({ ...input, mode: 'not_started', reasonCode: 'build_failed' }),
      (error: unknown) => error instanceof Error && error.message === 'attempt_identity_conflict',
    );
  });

  it('captures only the first accepted heartbeat and exports repeatable verification material', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    const evidence = heartbeatEvidence(input.gatewayId);

    const client = await harness!.pool.connect();
    try {
      await client.query('BEGIN');
      assert.equal(await store!.captureHeartbeat(client, evidence), true);
      assert.equal(await store!.captureHeartbeat(client, evidence), false);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const exported = await store!.exportAttempt(input.runAttemptId);
    assert.equal(exported.schema, 'build-room/phase3-run-evidence@1');
    assert.equal(exported.attempt.runAttemptId, input.runAttemptId);
    assert.equal(exported.heartbeat?.algorithm, 'Ed25519');
    assert.equal(exported.heartbeat?.signatureVerified, true);
    assert.equal(Buffer.from(exported.heartbeat?.signedBytesBase64 ?? '', 'base64').length, 32);
    assert.equal(Buffer.from(exported.heartbeat?.signatureBase64 ?? '', 'base64').length, 64);
    assert.equal(Buffer.from(exported.heartbeat?.publicKeyBase64 ?? '', 'base64').length, 32);
    assert.match(exported.authorizes, /Nothing/);

    const serialized = JSON.stringify(exported);
    for (const forbidden of ['token', 'privateKey', 'sourceIp', 'rawBody']) {
      assert.equal(serialized.includes(forbidden), false, `${forbidden} must not be exported`);
    }
  });

  it('records the five stages in order and ends awaiting independent adjudication', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);

    let requestEventId: string | null = null;
    const exchangeId = randomUUID();
    for (const stage of ['connect', 'adapter_registered', 'request', 'matched_response', 'disconnect'] as const) {
      const result = await store!.appendEvent(input.runAttemptId, {
        kind: 'lifecycle_stage',
        idempotencyKey: randomUUID(),
        stage,
        artifactSha256: randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64),
        ...(stage === 'request' ? { exchangeId } : {}),
        ...(stage === 'matched_response'
          ? { exchangeId, matchedRequestEventId: requestEventId!, matchVerified: true as const }
          : {}),
      });
      assert.equal(result.accepted, true);
      if (stage === 'request') requestEventId = result.eventId;
    }

    const finished = await store!.appendEvent(input.runAttemptId, {
      kind: 'attempt_finished',
      idempotencyKey: randomUUID(),
      result: 'awaiting_adjudication',
      teardownResult: 'completed',
      teardownEvidenceSha256: 'a'.repeat(64),
    });
    assert.equal(finished.accepted, true);

    const exported = await store!.exportAttempt(input.runAttemptId);
    assert.equal(exported.attempt.state, 'awaiting_adjudication');
    assert.deepEqual(
      exported.events
        .filter((event) => event.eventType === 'lifecycle_stage_recorded')
        .map((event) => event.lifecycleStage),
      ['connect', 'adapter_registered', 'request', 'matched_response', 'disconnect'],
    );
  });

  it('replays creation without changing progress after every lifecycle position', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    let requestEventId: string | null = null;
    const exchangeId = randomUUID();
    for (const stage of ['connect', 'adapter_registered', 'request', 'matched_response', 'disconnect'] as const) {
      const result = await store!.appendEvent(input.runAttemptId, {
        kind: 'lifecycle_stage',
        idempotencyKey: randomUUID(),
        stage,
        artifactSha256: 'd'.repeat(64),
        ...(stage === 'request' ? { exchangeId } : {}),
        ...(stage === 'matched_response'
          ? { exchangeId, matchedRequestEventId: requestEventId!, matchVerified: true as const }
          : {}),
      });
      if (stage === 'request') requestEventId = result.eventId;
      const before = await eventCount(input.runAttemptId);
      const replay = await store!.createAttempt(input);
      assert.equal(replay.created, false);
      assert.equal(await eventCount(input.runAttemptId), before);
    }
  });

  it('turns an out-of-order stage into durable refusal evidence', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);

    const result = await store!.appendEvent(input.runAttemptId, {
      kind: 'lifecycle_stage',
      idempotencyKey: randomUUID(),
      stage: 'request',
      artifactSha256: 'b'.repeat(64),
      exchangeId: randomUUID(),
    });
    assert.equal(result.accepted, false);
    assert.equal(result.reasonCode, 'out_of_order_stage');

    const exported = await store!.exportAttempt(input.runAttemptId);
    assert.equal(exported.attempt.state, 'failure_pending_teardown');
    assert.equal(exported.events.at(-1)?.eventType, 'lifecycle_stage_refused');
  });

  it('rejects a reused idempotency key carrying different evidence', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    const idempotencyKey = randomUUID();
    const first = await store!.appendEvent(input.runAttemptId, {
      kind: 'lifecycle_stage',
      idempotencyKey,
      stage: 'connect',
      artifactSha256: 'c'.repeat(64),
    });
    assert.equal(first.accepted, true);

    await assert.rejects(
      store!.appendEvent(input.runAttemptId, {
        kind: 'lifecycle_stage',
        idempotencyKey,
        stage: 'adapter_registered',
        artifactSha256: 'd'.repeat(64),
      }),
      (error: unknown) =>
        error instanceof Error && error.message === 'idempotency_key_mismatch',
    );
  });

  it('returns a bounded conflict when teardown is claimed unnecessary after lifecycle progress', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    await store!.appendEvent(input.runAttemptId, {
      kind: 'lifecycle_stage',
      idempotencyKey: randomUUID(),
      stage: 'connect',
      artifactSha256: 'e'.repeat(64),
    });

    await assert.rejects(
      store!.appendEvent(input.runAttemptId, {
        kind: 'attempt_finished',
        idempotencyKey: randomUUID(),
        result: 'failed',
        reasonCode: 'internal_error',
        teardownResult: 'not_required',
        teardownEvidenceSha256: 'f'.repeat(64),
      }),
      (error: unknown) =>
        error instanceof Phase3RunConflictError && error.code === 'attempt_incomplete',
    );
  });

  it('requires teardown after a position-zero lifecycle refusal', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    const refusal = await store!.appendEvent(input.runAttemptId, {
      kind: 'lifecycle_stage',
      idempotencyKey: randomUUID(),
      stage: 'request',
      artifactSha256: 'a'.repeat(64),
      exchangeId: randomUUID(),
    });
    assert.equal(refusal.accepted, false);

    await assert.rejects(
      store!.appendEvent(input.runAttemptId, {
        kind: 'attempt_finished',
        idempotencyKey: randomUUID(),
        result: 'failed',
        reasonCode: 'out_of_order_stage',
        teardownResult: 'not_required',
        teardownEvidenceSha256: 'b'.repeat(64),
      }),
      (error: unknown) =>
        error instanceof Phase3RunConflictError && error.code === 'attempt_incomplete',
    );
  });
});

async function insertAttempt(attemptId: string, gatewayId = randomUUID()): Promise<void> {
  await insertEnrolledGateway(gatewayId);
  await harness!.pool.query(
    `INSERT INTO phase3_run_attempts
       (run_attempt_id, run_label, entry_authorization_id, founder_os_sha,
        build_room_sha, fixture_repository, fixture_sha, requested_gateway_id, gateway_id,
        enrollment_projection_sha256, machine_identity, environment_label, entry_evidence_sha256, state,
        started_at, capture_expires_at)
     VALUES ($1, 'Phase3-CR1', 'founder:phase3-cr1:test', $2, $3,
             'MADVenturesLLC/phase3-fixture', $4, $5, $5, $7, 'test-mac', 'test', $6,
             'active', now(), now() + interval '5 minutes')`,
    [
      attemptId,
      '1'.repeat(40),
      '2'.repeat(40),
      '3'.repeat(40),
      gatewayId,
      '4'.repeat(64),
      '7'.repeat(64),
    ],
  );
}

async function enrolledAttemptInput(): Promise<Phase3AttemptInput> {
  const input = attemptInput();
  await insertEnrolledGateway(input.gatewayId);
  return input;
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
     VALUES ($1, 'enrolled', now(), $2, true)
     ON CONFLICT (gateway_id) DO NOTHING`,
    [gatewayId, rows[0]!.seq],
  );
}

async function insertTerminalGateway(gatewayId: string): Promise<void> {
  const { rows } = await harness!.pool.query<{ seq: string }>(
    `INSERT INTO gateway_registry_events
       (event_id, event_type, gateway_id, actor, attribution, occurred_at, payload)
     VALUES ($1, 'denied', $2, $3, $4, now(), $5) RETURNING seq`,
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
     VALUES ($1, 'denied', now(), $2, false)`,
    [gatewayId, rows[0]!.seq],
  );
}

async function insertEvent(attemptId: string, eventType: string, eventIndex: number): Promise<void> {
  await harness!.pool.query(
    `INSERT INTO phase3_run_events
       (event_id, run_attempt_id, event_index, event_type, occurred_at)
     VALUES ($1, $2, $3, $4, now())`,
    [randomUUID(), attemptId, eventIndex, eventType],
  );
}

function attemptInput(): Phase3AttemptInput {
  const gatewayId = randomUUID();
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
    entryEvidenceSha256: '4'.repeat(64),
  };
}

function heartbeatEvidence(gatewayId: string): Phase3HeartbeatEvidence {
  return {
    gatewayId,
    keyId: '5'.repeat(64),
    sequence: 1,
    timestampMs: Date.now() - 1_000,
    signedBytes: Buffer.alloc(32, 1),
    signature: Buffer.alloc(64, 2),
    publicKey: Buffer.alloc(32, 3),
    acceptedAt: new Date(),
    freshnessWindowMs: harness!.config.gatewayTimestampWindowMs,
    signatureVerified: true,
  };
}

async function capture(gatewayId: string): Promise<void> {
  const client = await harness!.pool.connect();
  try {
    await client.query('BEGIN');
    assert.equal(await store!.captureHeartbeat(client, heartbeatEvidence(gatewayId)), true);
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

async function eventCount(runAttemptId: string): Promise<number> {
  const { rows } = await harness!.pool.query<{ count: string }>(
    'SELECT count(*) FROM phase3_run_events WHERE run_attempt_id = $1',
    [runAttemptId],
  );
  return Number(rows[0]?.count ?? '-1');
}
