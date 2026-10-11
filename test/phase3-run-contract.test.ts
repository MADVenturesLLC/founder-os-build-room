import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PHASE3_LIFECYCLE_STAGES,
  PHASE3_REASON_CODES,
  phase3EntryEvidenceSha256,
  validatePhase3AdjudicationInput,
  validatePhase3AttemptInput,
  validatePhase3EventInput,
} from '../packages/control-plane/src/phase3-run.js';

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
    repository: 'MADVenturesLLC/phase3-fixture',
    sha: '3'.repeat(40),
    treeSha: 'c'.repeat(40),
    clean: true,
  },
  controlPlane: { commit: '2'.repeat(40), environment: 'test', status: 200 },
  machineIdentity: 'michael-macbook',
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
  entryEvidence: ENTRY_EVIDENCE,
  entryEvidenceSha256: phase3EntryEvidenceSha256(ENTRY_EVIDENCE),
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
    const healthy = validatePhase3AttemptInput({
      ...STARTED,
      mode: 'not_started',
      reasonCode: 'custody_failed',
    });
    assert.equal(healthy.ok, false);

    const entryEvidence = {
      ...ENTRY_EVIDENCE,
      doctor: { ...ENTRY_EVIDENCE.doctor, primaryCustody: false },
    };
    const result = validatePhase3AttemptInput({
      ...STARTED,
      mode: 'not_started',
      reasonCode: 'custody_failed',
      entryEvidence,
      entryEvidenceSha256: phase3EntryEvidenceSha256(entryEvidence),
    });
    assert.equal(result.ok, true);
    assert.equal(
      validatePhase3AttemptInput({
        ...STARTED,
        mode: 'not_started',
        reasonCode: 'lane_state_failed',
        entryEvidence,
        entryEvidenceSha256: phase3EntryEvidenceSha256(entryEvidence),
      }).ok,
      false,
    );

    assert.deepEqual(
      validatePhase3AttemptInput({ ...STARTED, mode: 'not_started', reasonCode: 'free_text' }),
      { ok: false, code: 'invalid_request' },
    );
  });

  it('requires entry evidence whose canonical preimage matches its digest', () => {
    assert.deepEqual(validatePhase3AttemptInput({ ...STARTED, entryEvidence: undefined }), {
      ok: false,
      code: 'invalid_request',
    });
    assert.deepEqual(
      validatePhase3AttemptInput({ ...STARTED, entryEvidenceSha256: 'f'.repeat(64) }),
      { ok: false, code: 'invalid_request' },
    );
    assert.deepEqual(
      validatePhase3AttemptInput({
        ...STARTED,
        entryEvidence: { ...ENTRY_EVIDENCE, controlPlaneToken: 'must-not-land' },
      }),
      { ok: false, code: 'invalid_request' },
    );
    const denied = {
      gatewayId: '22222222-3333-4444-8555-666666666666',
      state: 'denied',
    } as const;
    const ordered = { ...ENTRY_EVIDENCE, enrollments: [...ENTRY_EVIDENCE.enrollments, denied] };
    const reversed = { ...ordered, enrollments: [...ordered.enrollments].reverse() };
    const expectedDigest = '830325cb4e7797186c4123e7c1de83d8050cd98a2a0712f107524e08702bc164';
    assert.equal(phase3EntryEvidenceSha256(ordered), expectedDigest);
    assert.equal(phase3EntryEvidenceSha256(reversed), expectedDigest);
  });

  it('binds a started attempt to the passing entry observation', () => {
    const mismatches = [
      { ...ENTRY_EVIDENCE, founderOs: { ...ENTRY_EVIDENCE.founderOs, sha: '4'.repeat(40) } },
      { ...ENTRY_EVIDENCE, machineIdentity: 'different-machine' },
      { ...ENTRY_EVIDENCE, enrollments: [] },
      {
        ...ENTRY_EVIDENCE,
        doctor: { ...ENTRY_EVIDENCE.doctor, daemonReachable: false },
      },
    ];
    for (const entryEvidence of mismatches) {
      assert.deepEqual(
        validatePhase3AttemptInput({
          ...STARTED,
          entryEvidence,
          entryEvidenceSha256: phase3EntryEvidenceSha256(entryEvidence),
        }),
        { ok: false, code: 'invalid_request' },
      );
    }
  });

  it('binds incomplete evidence to the requested attempt identity', () => {
    const entryEvidence = {
      status: 'incomplete',
      observedAt: '2026-08-25T12:00:00.000Z',
      failureReason: 'founder_os_invalid',
      expected: {
        founderOsSha: STARTED.founderOsSha,
        buildRoomSha: STARTED.buildRoomSha,
        fixtureRepository: STARTED.fixtureRepository,
        fixtureSha: STARTED.fixtureSha,
        environment: 'test',
        machineIdentity: STARTED.machineIdentity,
        gatewayId: STARTED.gatewayId,
      },
    } as const;
    const input = {
      ...STARTED,
      mode: 'not_started',
      reasonCode: 'founder_os_invalid',
      entryEvidence,
      entryEvidenceSha256: phase3EntryEvidenceSha256(entryEvidence),
    };
    assert.equal(validatePhase3AttemptInput(input).ok, true);
    const mismatched = {
      ...entryEvidence,
      expected: { ...entryEvidence.expected, buildRoomSha: '9'.repeat(40) },
    };
    assert.deepEqual(
      validatePhase3AttemptInput({
        ...input,
        entryEvidence: mismatched,
        entryEvidenceSha256: phase3EntryEvidenceSha256(mismatched),
      }),
      { ok: false, code: 'invalid_request' },
    );
  });

  it('refuses an expected projection with two enrolled gateways (FOUNDER-ACT-20261010-TWO-GATEWAYS B4)', () => {
    const expectedEnrollments = [
      ...STARTED.expectedEnrollments,
      { gatewayId: '33333333-4444-4555-8666-777777777777', state: 'enrolled' as const },
    ];
    assert.deepEqual(validatePhase3AttemptInput({ ...STARTED, expectedEnrollments }), {
      ok: false,
      code: 'invalid_request',
    });
  });

  it('bounds the retained enrollment projection', () => {
    const expectedEnrollments = [
      ...STARTED.expectedEnrollments,
      ...Array.from({ length: 1_000 }, (_, index) => ({
        gatewayId: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
        state: 'denied' as const,
      })),
    ];
    assert.deepEqual(validatePhase3AttemptInput({ ...STARTED, expectedEnrollments }), {
      ok: false,
      code: 'invalid_request',
    });
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
  it('keeps adjudication on a separate closed input contract', () => {
    const input = {
      idempotencyKey: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      verdict: 'passed',
      tier2ReviewerId: 'Gemini 3.1 Pro (High)',
      tier2EvidenceSha256: '7'.repeat(64),
      founderAuthorizationId: 'founder:phase3-cr1:pass:test',
    };
    assert.equal(validatePhase3AdjudicationInput(input).ok, true);
    assert.deepEqual(validatePhase3AdjudicationInput({ ...input, verdict: 'approved' }), {
      ok: false,
      code: 'invalid_request',
    });
    assert.deepEqual(validatePhase3AdjudicationInput({ ...input, token: 'must-not-land' }), {
      ok: false,
      code: 'invalid_request',
    });
    for (const tier2ReviewerId of ['   ', '---', '()']) {
      assert.equal(
        validatePhase3AdjudicationInput({ ...input, tier2ReviewerId }).ok,
        false,
      );
    }
  });

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
    const failure = {
      kind: 'attempt_finished',
      idempotencyKey: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      result: 'failed',
      reasonCode: 'internal_error',
      teardownResult: 'not_required',
      teardownEvidenceSha256: '6'.repeat(64),
    };
    assert.equal(validatePhase3EventInput(failure).ok, true);
    const { teardownEvidenceSha256: _omitted, ...withoutEvidence } = failure;
    assert.deepEqual(validatePhase3EventInput(withoutEvidence), {
      ok: false,
      code: 'invalid_request',
    });
  });
});
