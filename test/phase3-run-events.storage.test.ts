import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { PoolClient } from 'pg';
import { GATEWAY_EVENT_TYPES } from '../packages/gateway-registry/src/index.js';
import {
  GATEWAY_REGISTRY_LOCK_KEY,
  MIGRATIONS,
} from '../packages/control-plane/src/migrations.js';
import {
  phase3EntryEvidenceSha256,
  phase3EnrollmentProjectionSha256,
  phase3RequestSha256,
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
  store = new Phase3RunStore(harness.appPool, { ...harness.config, commitSha: '2'.repeat(40) });
});

afterEach(async () => {
  await destroyGatewayHarness(harness);
  harness = undefined;
  store = undefined;
});

describe('0005_phase3_run_evidence — additive migration contract', () => {
  it('is registered exactly once after every existing migration', () => {
    const ids = MIGRATIONS.map((migration) => migration.id);
    assert.equal(ids.at(-1), '0009_two_enrolled_gateways');
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
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);

    await assert.rejects(
      () =>
        harness!.pool.query(
          `UPDATE phase3_run_events SET event_type = 'attempt_not_started'
            WHERE run_attempt_id = $1`,
          [input.runAttemptId],
        ),
      /append-only/,
    );
    await assert.rejects(
      () =>
        harness!.pool.query('DELETE FROM phase3_run_events WHERE run_attempt_id = $1', [
          input.runAttemptId,
        ]),
      /append-only/,
    );
  });

  it('rejects unknown event types, duplicate positions, and a second active attempt for one gateway', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);

    await assert.rejects(
      harness!.pool.query(
        `INSERT INTO phase3_run_events
           (event_id, run_attempt_id, event_index, event_type, occurred_at)
         VALUES ($1,$2,3,'invented_event',now())`,
        [randomUUID(), input.runAttemptId],
      ),
      /invalid progression/,
    );
    await assert.rejects(
      harness!.pool.query(
        `INSERT INTO phase3_run_events
           (event_id, run_attempt_id, event_index, event_type, occurred_at)
         VALUES ($1,$2,2,'attempt_started',now())`,
        [randomUUID(), input.runAttemptId],
      ),
      /invalid progression/,
    );
    await assert.rejects(
      () => insertCompetingActiveAttempt(randomUUID(), input.gatewayId),
      /active_gateway/,
    );
  });

  it('rejects stage evidence whose typed exchange fields do not match its stage', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    for (const stage of ['connect', 'adapter_registered'] as const) {
      await store!.appendEvent(input.runAttemptId, {
        kind: 'lifecycle_stage',
        idempotencyKey: randomUUID(),
        stage,
        artifactSha256: '9'.repeat(64),
      });
    }
    await assert.rejects(
      () =>
        harness!.pool.query(
          `INSERT INTO phase3_run_events
             (event_id, run_attempt_id, event_index, event_type, lifecycle_stage,
              stage_artifact_sha256, occurred_at)
           VALUES ($1,$2,6,'lifecycle_stage_recorded','request',$3,now())`,
          [randomUUID(), input.runAttemptId, 'a'.repeat(64)],
        ),
      /lifecycle_exchange_shape/,
    );
  });

  it('requires teardown proof for awaiting adjudication', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    await appendCompleteLifecycle(input.runAttemptId);
    await assert.rejects(
      () =>
        harness!.pool.query(
          `INSERT INTO phase3_run_events
             (event_id, run_attempt_id, event_index, event_type, result,
              teardown_result, occurred_at)
           VALUES ($1,$2,9,'attempt_finished','awaiting_adjudication','completed',now())`,
          [randomUUID(), input.runAttemptId],
        ),
      /terminal_shape/,
    );
  });

  it('rejects initial entry evidence whose digest differs from its attempt', async () => {
    const input = await enrolledAttemptInput();
    const client = await harness!.pool.connect();
    try {
      await client.query('BEGIN');
      await insertRawAttempt(client, input, input.entryEvidenceSha256);
      await insertRawStartEvent(client, input.runAttemptId);
      await assert.rejects(
        client.query(
          `INSERT INTO phase3_run_events
             (event_id, run_attempt_id, event_index, event_type,
              entry_evidence, entry_evidence_sha256, occurred_at)
           VALUES ($1,$2,2,'entry_verified',$3::jsonb,$4,now())`,
          [randomUUID(), input.runAttemptId, JSON.stringify(input.entryEvidence), 'f'.repeat(64)],
        ),
        /phase3_run_events invalid progression/,
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('rejects malformed entry JSON before it becomes immutable', async () => {
    const input = await enrolledAttemptInput();
    const invalidDate = {
      ...input.entryEvidence,
      observedAt: '2026-02-30T12:00:00.000Z',
    };
    const validity = await harness!.pool.query<{ valid: boolean }>(
      'SELECT phase3_entry_evidence_valid($1::jsonb) AS valid',
      [JSON.stringify(invalidDate)],
    );
    assert.equal(validity.rows[0]?.valid, false);
    for (const malformed of [
      { ...input.entryEvidence, machineIdentity: 123 },
      {
        ...input.entryEvidence,
        founderOs: { ...syntheticEntryEvidence(input.gatewayId).founderOs, repository: 123 },
      },
      {
        ...input.entryEvidence,
        doctor: { ...syntheticEntryEvidence(input.gatewayId).doctor, primaryLane: 123 },
      },
      { ...input.entryEvidence, nodeMajor: 22.5 },
    ]) {
      const result = await harness!.pool.query<{ valid: boolean }>(
        'SELECT phase3_entry_evidence_valid($1::jsonb) AS valid',
        [JSON.stringify(malformed)],
      );
      assert.equal(result.rows[0]?.valid, false);
    }
    const invalidAdjudication = await harness!.pool.query<{ valid: boolean }>(
      'SELECT phase3_adjudication_evidence_valid($1::jsonb) AS valid',
      [
        JSON.stringify({
          verdict: 'passed',
          tier2ReviewerId: 123,
          tier2EvidenceSha256: '9'.repeat(64),
          founderAuthorizationId: 'founder:test',
        }),
      ],
    );
    assert.equal(invalidAdjudication.rows[0]?.valid, false);
    const client = await harness!.pool.connect();
    try {
      await client.query('BEGIN');
      await insertRawAttempt(client, input, 'e'.repeat(64));
      await insertRawStartEvent(client, input.runAttemptId);
      await assert.rejects(
        client.query(
          `INSERT INTO phase3_run_events
             (event_id, run_attempt_id, event_index, event_type,
              entry_evidence, entry_evidence_sha256, occurred_at)
           VALUES ($1,$2,2,'entry_verified',$3::jsonb,$4,now())`,
          [
            randomUUID(),
            input.runAttemptId,
            JSON.stringify({ status: 'complete', controlPlaneToken: 'must-not-land' }),
            'e'.repeat(64),
          ],
        ),
        /phase3_run_events invalid entry evidence/,
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('rejects a projection change with no matching next event', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await assert.rejects(
      () =>
        harness!.pool.query(
          `UPDATE phase3_run_attempts
              SET state = 'failed', finished_at = now()
            WHERE run_attempt_id = $1`,
          [input.runAttemptId],
        ),
      /projection update lacks matching event/,
    );
  });

  it('rejects an out-of-order lifecycle event before it enters the append-only log', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    await assert.rejects(
      harness!.pool.query(
        `INSERT INTO phase3_run_events
           (event_id, run_attempt_id, event_index, event_type, lifecycle_stage,
            stage_artifact_sha256, occurred_at)
         VALUES ($1,$2,4,'lifecycle_stage_recorded','adapter_registered',$3,now())`,
        [randomUUID(), input.runAttemptId, 'a'.repeat(64)],
      ),
      /phase3_run_events invalid progression/,
    );
    assert.equal(await eventCount(input.runAttemptId), 3);
  });

  it('rejects awaiting adjudication before prerequisites at event INSERT', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await assert.rejects(
      harness!.pool.query(
        `INSERT INTO phase3_run_events
           (event_id, run_attempt_id, event_index, event_type, result,
            teardown_result, teardown_evidence_sha256, occurred_at)
         VALUES ($1,$2,3,'attempt_finished','awaiting_adjudication','completed',$3,now())`,
        [randomUUID(), input.runAttemptId, 'b'.repeat(64)],
      ),
      /phase3_run_events invalid progression/,
    );
    assert.equal(await eventCount(input.runAttemptId), 2);
  });

  it('rejects lifecycle evidence on a terminal not-started attempt', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt({ ...input, mode: 'not_started', reasonCode: 'build_failed' });
    await assert.rejects(
      harness!.pool.query(
        `INSERT INTO phase3_run_events
           (event_id, run_attempt_id, event_index, event_type, lifecycle_stage,
            stage_artifact_sha256, occurred_at)
         VALUES ($1,$2,2,'lifecycle_stage_recorded','connect',$3,now())`,
        [randomUUID(), input.runAttemptId, 'd'.repeat(64)],
      ),
      /phase3_run_events invalid progression/,
    );
    assert.equal(await eventCount(input.runAttemptId), 1);
  });

  it('rolls back a valid-looking event when no matching projection update commits', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    await assert.rejects(
      harness!.pool.query(
        `INSERT INTO phase3_run_events
           (event_id, run_attempt_id, event_index, event_type, lifecycle_stage,
            stage_artifact_sha256, occurred_at)
         VALUES ($1,$2,4,'lifecycle_stage_recorded','connect',$3,now())`,
        [randomUUID(), input.runAttemptId, 'e'.repeat(64)],
      ),
      /phase3_run_events projection not advanced/,
    );
    assert.equal(await eventCount(input.runAttemptId), 3);
  });

  it('serializes concurrent event inserts against the current projection', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    const first = await harness!.pool.connect();
    const second = await harness!.pool.connect();
    try {
      await first.query('BEGIN');
      await first.query(
        `INSERT INTO phase3_run_events
           (event_id, run_attempt_id, event_index, event_type, lifecycle_stage,
            stage_artifact_sha256, occurred_at)
         VALUES ($1,$2,4,'lifecycle_stage_recorded','connect',$3,now())`,
        [randomUUID(), input.runAttemptId, 'f'.repeat(64)],
      );
      await first.query(
        `UPDATE phase3_run_attempts
            SET lifecycle_position = 1, last_event_index = 4
          WHERE run_attempt_id = $1`,
        [input.runAttemptId],
      );

      let settled = false;
      const competing = second
        .query(
          `INSERT INTO phase3_run_events
             (event_id, run_attempt_id, event_index, event_type, lifecycle_stage,
              stage_artifact_sha256, exchange_id, occurred_at)
           VALUES ($1,$2,5,'lifecycle_stage_recorded','request',$3,$4,now())`,
          [randomUUID(), input.runAttemptId, '0'.repeat(64), randomUUID()],
        )
        .finally(() => {
          settled = true;
        });
      void competing.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.equal(settled, false);

      await first.query('COMMIT');
      await assert.rejects(competing, /phase3_run_events invalid progression/);
      assert.equal(await eventCount(input.runAttemptId), 4);
    } finally {
      await first.query('ROLLBACK').catch(() => undefined);
      first.release();
      second.release();
    }
  });

  it('rejects adjudication whose teardown digest differs from technical completion', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    await appendCompleteLifecycle(input.runAttemptId);
    await store!.appendEvent(input.runAttemptId, {
      kind: 'attempt_finished',
      idempotencyKey: randomUUID(),
      result: 'awaiting_adjudication',
      teardownResult: 'completed',
      teardownEvidenceSha256: '8'.repeat(64),
    });
    const adjudication = {
      verdict: 'passed',
      tier2ReviewerId: 'tier2-storage-test',
      tier2EvidenceSha256: '9'.repeat(64),
      founderAuthorizationId: 'founder:phase3-cr1:pass:test',
    };
    const client = await harness!.pool.connect();
    try {
      await client.query('BEGIN');
      await assert.rejects(
        client.query(
        `INSERT INTO phase3_run_events
           (event_id, run_attempt_id, event_index, event_type, idempotency_key,
            request_sha256, result, teardown_result, teardown_evidence_sha256,
            adjudication, occurred_at)
         VALUES ($1,$2,10,'attempt_adjudicated',$3,$4,'passed','completed',$5,$6::jsonb,now())`,
        [
          randomUUID(),
          input.runAttemptId,
          randomUUID(),
          'a'.repeat(64),
          '0'.repeat(64),
          JSON.stringify(adjudication),
        ],
        ),
        /phase3_run_events invalid progression/,
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('requires terminal finished_at to equal its matching event timestamp', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    const client = await harness!.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ occurred_at: Date }>(
        `INSERT INTO phase3_run_events
           (event_id, run_attempt_id, event_index, event_type, result, reason_code,
            teardown_result, teardown_evidence_sha256, occurred_at)
         VALUES ($1,$2,3,'attempt_finished','failed','internal_error','not_required',$3,now())
         RETURNING occurred_at`,
        [randomUUID(), input.runAttemptId, 'c'.repeat(64)],
      );
      await assert.rejects(
        client.query(
        `UPDATE phase3_run_attempts
            SET state = 'failed', last_event_index = 3, finished_at = $2
          WHERE run_attempt_id = $1`,
        [input.runAttemptId, new Date(rows[0]!.occurred_at.getTime() + 1_000)],
        ),
        /projection update lacks matching event/,
      );
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});

describe('Phase 3 run store — ordered, bounded evidence', { skip: STORAGE_SKIP }, () => {
  it('enforces the durable counted-run label from the first attempt', async () => {
    const input = await enrolledAttemptInput();
    for (const runLabel of ['Phase3-CR2', 'Phase3-CR3'] as const) {
      await assert.rejects(
        store!.createAttempt(nextAttempt(input, runLabel)),
        (error: unknown) =>
          error instanceof Phase3RunConflictError && error.code === 'sequence_invalid',
      );
    }
  });

  it('holds CR1 after not-started and resets to CR1 after failure', async () => {
    const first = await enrolledAttemptInput();
    await store!.createAttempt({ ...first, mode: 'not_started', reasonCode: 'build_failed' });
    await assert.rejects(
      store!.createAttempt(nextAttempt(first, 'Phase3-CR2')),
      (error: unknown) =>
        error instanceof Phase3RunConflictError && error.code === 'sequence_invalid',
    );

    const started = nextAttempt(first, 'Phase3-CR1');
    await store!.createAttempt(started);
    await store!.appendEvent(started.runAttemptId, {
      kind: 'attempt_finished',
      idempotencyKey: randomUUID(),
      result: 'failed',
      reasonCode: 'internal_error',
      teardownResult: 'not_required',
      teardownEvidenceSha256: '9'.repeat(64),
    });
    await assert.rejects(
      store!.createAttempt(nextAttempt(first, 'Phase3-CR2')),
      (error: unknown) =>
        error instanceof Phase3RunConflictError && error.code === 'sequence_invalid',
    );
    assert.equal((await store!.createAttempt(nextAttempt(first, 'Phase3-CR1'))).created, true);
  });

  it('blocks another attempt while adjudication is pending', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    await appendCompleteLifecycle(input.runAttemptId);
    await store!.appendEvent(input.runAttemptId, {
      kind: 'attempt_finished',
      idempotencyKey: randomUUID(),
      result: 'awaiting_adjudication',
      teardownResult: 'completed',
      teardownEvidenceSha256: '8'.repeat(64),
    });

    await assert.rejects(
      store!.createAttempt(nextAttempt(input, 'Phase3-CR1')),
      (error: unknown) =>
        error instanceof Phase3RunConflictError && error.code === 'sequence_blocked',
    );
  });

  it('resets the counted sequence after a failed adjudication', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    await capture(input.gatewayId);
    await appendCompleteLifecycle(input.runAttemptId);
    await store!.appendEvent(input.runAttemptId, {
      kind: 'attempt_finished',
      idempotencyKey: randomUUID(),
      result: 'awaiting_adjudication',
      teardownResult: 'completed',
      teardownEvidenceSha256: '8'.repeat(64),
    });
    await store!.adjudicateAttempt(input.runAttemptId, {
      idempotencyKey: randomUUID(),
      verdict: 'failed',
      tier2ReviewerId: 'tier2-storage-test',
      tier2EvidenceSha256: '9'.repeat(64),
      founderAuthorizationId: 'founder:phase3-cr1:fail:test',
    });

    const exported = await store!.exportAttempt(input.runAttemptId);
    assert.equal(exported.attempt.state, 'failed');
    assert.equal(exported.events.at(-1)?.reasonCode, 'adjudication_failed');
    assert.equal((await store!.createAttempt(nextAttempt(input, 'Phase3-CR1'))).created, true);
  });

  it('permits CR3 only after durable CR1 and CR2 passes', async () => {
    const input = await enrolledAttemptInput();
    await insertAdjudicatedPass(input, 'Phase3-CR1');
    await insertAdjudicatedPass(input, 'Phase3-CR2');
    const result = await store!.createAttempt(nextAttempt(input, 'Phase3-CR3'));
    assert.equal(result.created, true);
  });

  it('refuses to start against a nonexistent gateway', async () => {
    await assert.rejects(
      store!.createAttempt(attemptInput()),
      (error: unknown) => error instanceof Error && error.message === 'enrollment_projection_failed',
    );
  });

  it('refuses to start while two gateways are enrolled (FOUNDER-ACT-20261010-TWO-GATEWAYS B4)', async () => {
    const input = await enrolledAttemptInput();
    // A second enrolled gateway in the other slot: the run requires exactly one.
    await insertEnrolledGateway(randomUUID(), 2);
    await assert.rejects(
      store!.createAttempt(input),
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

  it('refuses entry evidence bound to a different control-plane environment', async () => {
    const input = await enrolledAttemptInput();
    const entryEvidence = {
      ...syntheticEntryEvidence(input.gatewayId),
      controlPlane: {
        commit: input.buildRoomSha,
        environment: 'different-environment',
        status: 200,
      },
    } as const;
    await assert.rejects(
      store!.createAttempt({
        ...input,
        entryEvidence,
        entryEvidenceSha256: phase3EntryEvidenceSha256(entryEvidence),
      }),
      (error: unknown) =>
        error instanceof Phase3RunConflictError && error.code === 'context_invalid',
    );
  });

  it('refuses an attempt bound to a different control-plane commit', async () => {
    const input = await enrolledAttemptInput();
    const entryEvidence = {
      ...syntheticEntryEvidence(input.gatewayId),
      buildRoom: {
        ...syntheticEntryEvidence(input.gatewayId).buildRoom,
        sha: '9'.repeat(40),
      },
      controlPlane: {
        ...syntheticEntryEvidence(input.gatewayId).controlPlane,
        commit: '9'.repeat(40),
      },
    } as const;
    await assert.rejects(
      store!.createAttempt({
        ...input,
        buildRoomSha: '9'.repeat(40),
        entryEvidence,
        entryEvidenceSha256: phase3EntryEvidenceSha256(entryEvidence),
      }),
      (error: unknown) =>
        error instanceof Phase3RunConflictError && error.code === 'build_sha_mismatch',
    );
  });

  it('refuses stale or future entry observations before attempt mutation', async () => {
    const input = await enrolledAttemptInput();
    for (const offset of [
      -harness!.config.gatewayTimestampWindowMs - 1,
      harness!.config.gatewayTimestampWindowMs + 1_000,
    ]) {
      const entryEvidence = {
        ...syntheticEntryEvidence(input.gatewayId),
        observedAt: new Date(Date.now() + offset).toISOString(),
      } as const;
      await assert.rejects(
        store!.createAttempt({
          ...input,
          runAttemptId: randomUUID(),
          entryEvidence,
          entryEvidenceSha256: phase3EntryEvidenceSha256(entryEvidence),
        }),
        (error: unknown) =>
          error instanceof Phase3RunConflictError && error.code === 'entry_evidence_stale',
      );
    }
    assert.equal(await attemptCount(), 0);
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

  it('takes the registry fence before the attempt-identity lock', async () => {
    const input = await enrolledAttemptInput();
    const blocker = await harness!.pool.connect();
    const contender = await harness!.pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock($1)', [GATEWAY_REGISTRY_LOCK_KEY]);
      const creating = store!.createAttempt(input);
      void creating.catch(() => undefined);
      await waitForWaitingAdvisoryLock();

      await contender.query('BEGIN');
      const { rows } = await contender.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) AS acquired',
        [input.runAttemptId],
      );
      assert.equal(rows[0]?.acquired, true);
      await contender.query('ROLLBACK');
      await blocker.query('COMMIT');
      assert.equal((await creating).created, true);
    } finally {
      await contender.query('ROLLBACK').catch(() => undefined);
      await blocker.query('ROLLBACK').catch(() => undefined);
      contender.release();
      blocker.release();
    }
  });

  it('judges entry freshness after waiting for the registry fence', async () => {
    const input = await enrolledAttemptInput();
    const shortWindowStore = new Phase3RunStore(harness!.appPool, {
      ...harness!.config,
      commitSha: '2'.repeat(40),
      gatewayTimestampWindowMs: 25,
    });
    const blocker = await harness!.pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock($1)', [GATEWAY_REGISTRY_LOCK_KEY]);
      const creating = shortWindowStore.createAttempt(input);
      void creating.catch(() => undefined);
      await waitForWaitingAdvisoryLock();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await blocker.query('COMMIT');
      await assert.rejects(
        creating,
        (error: unknown) =>
          error instanceof Phase3RunConflictError && error.code === 'entry_evidence_stale',
      );
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      blocker.release();
    }
  });

  it('refuses every later mutation from a different deployment identity', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    const wrongStore = new Phase3RunStore(harness!.appPool, {
      ...harness!.config,
      commitSha: '9'.repeat(40),
    });

    const heartbeatClient = await harness!.pool.connect();
    try {
      await heartbeatClient.query('BEGIN');
      await assert.rejects(
        wrongStore.captureHeartbeat(heartbeatClient, heartbeatEvidence(input.gatewayId)),
        (error: unknown) =>
          error instanceof Phase3RunConflictError &&
          error.code === 'attempt_process_identity_mismatch',
      );
      await heartbeatClient.query('ROLLBACK');
    } finally {
      await heartbeatClient.query('ROLLBACK').catch(() => undefined);
      heartbeatClient.release();
    }
    await assert.rejects(
      wrongStore.appendEvent(input.runAttemptId, {
        kind: 'lifecycle_stage',
        idempotencyKey: randomUUID(),
        stage: 'connect',
        artifactSha256: 'a'.repeat(64),
      }),
      (error: unknown) =>
        error instanceof Phase3RunConflictError &&
        error.code === 'attempt_process_identity_mismatch',
    );
    assert.equal(await eventCount(input.runAttemptId), 2);

    await capture(input.gatewayId);
    await appendCompleteLifecycle(input.runAttemptId);
    await store!.appendEvent(input.runAttemptId, {
      kind: 'attempt_finished',
      idempotencyKey: randomUUID(),
      result: 'awaiting_adjudication',
      teardownResult: 'completed',
      teardownEvidenceSha256: '8'.repeat(64),
    });
    await assert.rejects(
      wrongStore.adjudicateAttempt(input.runAttemptId, {
        idempotencyKey: randomUUID(),
        verdict: 'passed',
        tier2ReviewerId: 'tier2-storage-test',
        tier2EvidenceSha256: '9'.repeat(64),
        founderAuthorizationId: 'founder:phase3-cr1:pass:test',
      }),
      (error: unknown) =>
        error instanceof Phase3RunConflictError &&
        error.code === 'attempt_process_identity_mismatch',
    );
    assert.equal(await eventCount(input.runAttemptId), 9);
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
    assert.deepEqual(exported.entryEvidence, input.entryEvidence);
    assert.equal(
      phase3EntryEvidenceSha256(exported.entryEvidence),
      exported.attempt.entryEvidenceSha256,
    );
    assert.match(exported.entryEvidenceRecordedAt, /^\d{4}-\d{2}-\d{2}T/);
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

  it('refuses malformed retained entry evidence even after database corruption', async () => {
    const input = await enrolledAttemptInput();
    await store!.createAttempt(input);
    const malformed = { status: 'complete', controlPlaneToken: 'must-not-land' };
    const digest = phase3RequestSha256(malformed);
    try {
      await harness!.pool.query(
        'ALTER TABLE phase3_run_events DISABLE TRIGGER phase3_run_events_no_update',
      );
      await harness!.pool.query(
        'ALTER TABLE phase3_run_attempts DISABLE TRIGGER phase3_run_attempts_protect',
      );
      await harness!.pool.query(
        `UPDATE phase3_run_events
            SET entry_evidence = $2::jsonb, entry_evidence_sha256 = $3
          WHERE run_attempt_id = $1 AND event_type = 'entry_verified'`,
        [input.runAttemptId, JSON.stringify(malformed), digest],
      );
      await harness!.pool.query(
        `UPDATE phase3_run_attempts SET entry_evidence_sha256 = $2
          WHERE run_attempt_id = $1`,
        [input.runAttemptId, digest],
      );
    } finally {
      await harness!.pool.query(
        'ALTER TABLE phase3_run_attempts ENABLE TRIGGER phase3_run_attempts_protect',
      );
      await harness!.pool.query(
        'ALTER TABLE phase3_run_events ENABLE TRIGGER phase3_run_events_no_update',
      );
    }
    await assert.rejects(
      store!.exportAttempt(input.runAttemptId),
      (error: unknown) =>
        error instanceof Phase3RunConflictError && error.code === 'entry_evidence_missing',
    );
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

async function insertCompetingActiveAttempt(attemptId: string, gatewayId: string): Promise<void> {
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

async function insertEnrolledGateway(gatewayId: string, slot: 1 | 2 = 1): Promise<void> {
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
       (gateway_id, state, state_since, last_event_seq, is_currently_enrolled, enrollment_slot)
     VALUES ($1, 'enrolled', now(), $2, true, $3)
     ON CONFLICT (gateway_id) DO NOTHING`,
    [gatewayId, rows[0]!.seq, slot],
  );
}

async function insertRawAttempt(
  client: PoolClient,
  input: Phase3AttemptInput,
  entryEvidenceSha256: string,
): Promise<void> {
  await client.query(
    `INSERT INTO phase3_run_attempts
       (run_attempt_id, run_label, entry_authorization_id, founder_os_sha,
        build_room_sha, fixture_repository, fixture_sha, requested_gateway_id, gateway_id,
        enrollment_projection_sha256, machine_identity, environment_label,
        entry_evidence_sha256, state, last_event_index, started_at, capture_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,'active',2,now(),
             now() + interval '5 minutes')`,
    [
      input.runAttemptId,
      input.runLabel,
      input.entryAuthorizationId,
      input.founderOsSha,
      input.buildRoomSha,
      input.fixtureRepository,
      input.fixtureSha,
      input.gatewayId,
      phase3EnrollmentProjectionSha256(input.expectedEnrollments),
      input.machineIdentity,
      harness!.config.environment,
      entryEvidenceSha256,
    ],
  );
}

async function insertRawStartEvent(client: PoolClient, runAttemptId: string): Promise<void> {
  await client.query(
    `INSERT INTO phase3_run_events
       (event_id, run_attempt_id, event_index, event_type, occurred_at)
     VALUES ($1,$2,1,'attempt_started',now())`,
    [randomUUID(), runAttemptId],
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

function attemptInput(): Phase3AttemptInput {
  const gatewayId = randomUUID();
  const entryEvidence = syntheticEntryEvidence(gatewayId);
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
  };
}

function syntheticEntryEvidence(gatewayId: string) {
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
    controlPlane: { commit: '2'.repeat(40), environment: harness!.config.environment, status: 200 },
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
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

function nextAttempt(
  input: Phase3AttemptInput,
  runLabel: Phase3AttemptInput['runLabel'],
): Phase3AttemptInput {
  return {
    ...input,
    runAttemptId: randomUUID(),
    runLabel,
    ...(runLabel === 'Phase3-CR3'
      ? { revocationAuthorizationId: 'founder:phase3-cr3:revocation:test' }
      : { revocationAuthorizationId: undefined }),
  };
}

async function appendCompleteLifecycle(runAttemptId: string): Promise<void> {
  let requestEventId: string | null = null;
  const exchangeId = randomUUID();
  for (const stage of ['connect', 'adapter_registered', 'request', 'matched_response', 'disconnect'] as const) {
    const result = await store!.appendEvent(runAttemptId, {
      kind: 'lifecycle_stage',
      idempotencyKey: randomUUID(),
      stage,
      artifactSha256: '7'.repeat(64),
      ...(stage === 'request' ? { exchangeId } : {}),
      ...(stage === 'matched_response'
        ? { exchangeId, matchedRequestEventId: requestEventId!, matchVerified: true as const }
        : {}),
    });
    if (stage === 'request') requestEventId = result.eventId;
  }
}

async function insertAdjudicatedPass(
  input: Phase3AttemptInput,
  runLabel: 'Phase3-CR1' | 'Phase3-CR2',
): Promise<void> {
  const attempt = nextAttempt(input, runLabel);
  await store!.createAttempt(attempt);
  await capture(attempt.gatewayId);
  await appendCompleteLifecycle(attempt.runAttemptId);
  await store!.appendEvent(attempt.runAttemptId, {
    kind: 'attempt_finished',
    idempotencyKey: randomUUID(),
    result: 'awaiting_adjudication',
    teardownResult: 'completed',
    teardownEvidenceSha256: 'a'.repeat(64),
  });

  await store!.adjudicateAttempt(attempt.runAttemptId, {
    idempotencyKey: randomUUID(),
    verdict: 'passed',
    tier2ReviewerId: 'tier2-storage-test',
    tier2EvidenceSha256: 'b'.repeat(64),
    founderAuthorizationId: `founder:${runLabel.toLowerCase()}:pass:test`,
  });
}

async function eventCount(runAttemptId: string): Promise<number> {
  const { rows } = await harness!.pool.query<{ count: string }>(
    'SELECT count(*) FROM phase3_run_events WHERE run_attempt_id = $1',
    [runAttemptId],
  );
  return Number(rows[0]?.count ?? '-1');
}

async function attemptCount(): Promise<number> {
  const { rows } = await harness!.pool.query<{ count: string }>(
    'SELECT count(*) FROM phase3_run_attempts',
  );
  return Number(rows[0]?.count ?? '-1');
}

async function waitForWaitingAdvisoryLock(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await harness!.pool.query<{ count: string }>(
      `SELECT count(*) FROM pg_locks
        WHERE locktype = 'advisory' AND granted = false`,
    );
    if (Number(rows[0]?.count ?? '0') > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('timed out waiting for the blocked advisory lock');
}
