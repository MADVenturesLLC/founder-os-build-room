import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PHASE3_LIFECYCLE_STAGES,
  PHASE3_REASON_CODES,
  validatePhase3AttemptInput,
  validatePhase3EventInput,
} from '../packages/control-plane/src/phase3-run.js';

const ATTEMPT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const STARTED = {
  mode: 'started',
  runAttemptId: ATTEMPT_ID,
  runLabel: 'Phase3-CR1',
  entryAuthorizationId: 'founder:phase3-cr1:2026-08-25',
  founderOsSha: '1'.repeat(40),
  buildRoomSha: '2'.repeat(40),
  fixtureRepository: 'MADVenturesLLC/phase3-fixture',
  fixtureSha: '3'.repeat(40),
  gatewayId: '11111111-2222-4333-8444-555555555555',
  expectedEnrollments: [
    { gatewayId: '11111111-2222-4333-8444-555555555555', state: 'enrolled' },
  ],
  machineIdentity: 'michael-macbook',
  entryEvidenceSha256: '4'.repeat(64),
};

describe('Phase 3 control-plane attempt input', () => {
  it('accepts the exact started shape and no extra fields', () => {
    const result = validatePhase3AttemptInput(STARTED);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, STARTED);

    assert.deepEqual(validatePhase3AttemptInput({ ...STARTED, token: 'must-not-land' }), {
      ok: false,
      code: 'invalid_request',
    });
  });

  it('accepts a terminal not-started attempt only with a closed reason code', () => {
    const result = validatePhase3AttemptInput({
      ...STARTED,
      mode: 'not_started',
      reasonCode: 'custody_failed',
    });
    assert.equal(result.ok, true);

    assert.deepEqual(
      validatePhase3AttemptInput({ ...STARTED, mode: 'not_started', reasonCode: 'free_text' }),
      { ok: false, code: 'invalid_request' },
    );
  });

  it('requires the separate revocation authorization only for CR3', () => {
    assert.deepEqual(validatePhase3AttemptInput({ ...STARTED, runLabel: 'Phase3-CR3' }), {
      ok: false,
      code: 'invalid_request',
    });
    assert.equal(
      validatePhase3AttemptInput({
        ...STARTED,
        runLabel: 'Phase3-CR3',
        revocationAuthorizationId: 'founder:phase3-cr3:revocation:test',
      }).ok,
      true,
    );
    assert.deepEqual(
      validatePhase3AttemptInput({
        ...STARTED,
        revocationAuthorizationId: 'founder:unexpected',
      }),
      { ok: false, code: 'invalid_request' },
    );
  });
});

describe('Phase 3 control-plane event input', () => {
  it('accepts only the five closed lifecycle stages', () => {
    assert.deepEqual(PHASE3_LIFECYCLE_STAGES, [
      'connect',
      'adapter_registered',
      'request',
      'matched_response',
      'disconnect',
    ]);

    const request = validatePhase3EventInput({
      kind: 'lifecycle_stage',
      idempotencyKey: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      stage: 'request',
      artifactSha256: '5'.repeat(64),
      exchangeId: 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa',
    });
    assert.equal(request.ok, true);

    assert.deepEqual(
      validatePhase3EventInput({
        kind: 'lifecycle_stage',
        idempotencyKey: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        stage: 'execute_shell',
        artifactSha256: '5'.repeat(64),
      }),
      { ok: false, code: 'invalid_request' },
    );
  });

  it('refuses client-submitted heartbeat evidence', () => {
    assert.deepEqual(validatePhase3EventInput({ kind: 'heartbeat_verified' }), {
      ok: false,
      code: 'invalid_request',
    });
  });

  it('allows technical completion only as awaiting adjudication, never passed', () => {
    const completion = {
      kind: 'attempt_finished',
      idempotencyKey: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      result: 'awaiting_adjudication',
      teardownResult: 'completed',
      teardownEvidenceSha256: '6'.repeat(64),
    };
    assert.equal(validatePhase3EventInput(completion).ok, true);
    assert.deepEqual(validatePhase3EventInput({ ...completion, result: 'passed' }), {
      ok: false,
      code: 'invalid_request',
    });
  });

  it('keeps failure reasons closed and non-secret', () => {
    assert.ok(PHASE3_REASON_CODES.includes('bad_signature'));
    assert.ok(PHASE3_REASON_CODES.includes('stale_heartbeat'));
    assert.equal(PHASE3_REASON_CODES.includes('raw_error' as never), false);
  });
});
