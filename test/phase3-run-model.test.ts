import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluatePhase3Entry,
  phase3SequenceStatus,
  type Phase3AttemptPlan,
  type Phase3AttemptSummary,
  type Phase3EntryObservation,
} from '../packages/run-harness/src/phase3/model.js';

const BUILD_SHA = '5df7bd222a99e49c5f5a8ea449ffa2ef28a14de4';
const FOUNDER_OS_SHA = '9e87ba2b3cf632d892207b29211727bdf89c87d7';
const FIXTURE_SHA = '1111111111111111111111111111111111111111';
const GATEWAY_ID = '11111111-2222-4333-8444-555555555555';

const PLAN: Phase3AttemptPlan = {
  runAttemptId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  label: 'Phase3-CR1',
  entryAuthorizationId: 'founder:phase3-cr1:2026-08-25',
  founderOsSha: FOUNDER_OS_SHA,
  founderOs: { repository: 'MADVenturesLLC/FounderOS', path: '/tmp/FounderOS' },
  buildRoomSha: BUILD_SHA,
  controlPlaneOrigin: 'https://control-plane.example',
  gatewayId: GATEWAY_ID,
  expectedEnrollments: [
    { gatewayId: GATEWAY_ID, state: 'enrolled' },
    { gatewayId: '22222222-3333-4444-8555-666666666666', state: 'denied' },
  ],
  fixture: {
    repository: 'MADVenturesLLC/phase3-fixture',
    path: '/tmp/phase3-fixture',
    sha: FIXTURE_SHA,
  },
  environment: 'production',
  machine: 'michael-macbook',
  heartbeatFreshnessMs: 10 * 60 * 1_000,
};

const OBSERVATION: Phase3EntryObservation = {
  status: 'complete',
  observedAt: '2026-08-25T12:00:00.000Z',
  founderOs: {
    repository: PLAN.founderOs.repository,
    sha: FOUNDER_OS_SHA,
    treeSha: '4'.repeat(40),
    clean: true,
  },
  buildRoom: {
    repository: 'MADVenturesLLC/founder-os-build-room',
    sha: BUILD_SHA,
    treeSha: '5'.repeat(40),
    clean: true,
    buildPassed: true,
  },
  controlPlane: { commit: BUILD_SHA, environment: 'production', status: 200 },
  machineIdentity: 'michael-macbook',
  nodeMajor: 22,
  fixture: {
    repository: PLAN.fixture.repository,
    sha: FIXTURE_SHA,
    treeSha: '6'.repeat(40),
    clean: true,
  },
  enrollments: [...PLAN.expectedEnrollments].reverse(),
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

describe('Phase 3 entry gate', () => {
  it('binds entry to the observed clean FounderOS repository and authority SHA', () => {
    const founderOs = PLAN.founderOs;
    const plan = PLAN;
    const observedFounderOs = {
      repository: founderOs.repository,
      sha: FOUNDER_OS_SHA,
      treeSha: '4'.repeat(40),
      clean: true,
    };
    const observation = {
      ...OBSERVATION,
      observedAt: '2026-08-25T12:00:00.000Z',
      founderOs: observedFounderOs,
    } as Phase3EntryObservation;
    assert.deepEqual(evaluatePhase3Entry(plan, observation), { ok: true, failures: [] });
    assert.deepEqual(
      evaluatePhase3Entry(plan, {
        ...observation,
        founderOs: { ...observedFounderOs, sha: 'f'.repeat(40) },
      } as Phase3EntryObservation),
      { ok: false, failures: ['founder_os_invalid'] },
    );
  });

  it('passes only the exact authorized, clean observation', () => {
    assert.deepEqual(evaluatePhase3Entry(PLAN, OBSERVATION), { ok: true, failures: [] });
  });

  it('fails closed with every mismatched boundary visible', () => {
    const result = evaluatePhase3Entry(PLAN, {
      ...OBSERVATION,
      buildRoom: {
        ...OBSERVATION.buildRoom,
        sha: '2222222222222222222222222222222222222222',
        buildPassed: false,
      },
      nodeMajor: 23,
      fixture: { ...OBSERVATION.fixture, clean: false },
      enrollments: [],
      doctor: {
        ...OBSERVATION.doctor,
        daemonReachable: false,
        primaryCustody: false,
        stagingLockPresent: true,
      },
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, [
      'build_sha_mismatch',
      'node_version_mismatch',
      'build_failed',
      'fixture_unavailable',
      'enrollment_projection_failed',
      'daemon_unreachable',
      'custody_failed',
      'staging_lock_present',
    ]);
  });

  it('rejects a run attempt id that is merely the counted-run label', () => {
    const result = evaluatePhase3Entry({ ...PLAN, runAttemptId: PLAN.label }, OBSERVATION);
    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, ['attempt_identity_invalid']);
  });

  it('refuses a control-plane environment different from the authorized label', () => {
    const result = evaluatePhase3Entry(
      PLAN,
      { ...OBSERVATION, controlPlane: { ...OBSERVATION.controlPlane, environment: 'staging' } },
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, ['context_invalid']);
  });

  it('refuses a different physical machine identity', () => {
    const result = evaluatePhase3Entry(
      PLAN,
      { ...OBSERVATION, machineIdentity: 'michael-imac' },
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, ['context_invalid']);
  });
});

describe('Phase 3 counted-run sequence', () => {
  const attempt = (
    label: Phase3AttemptSummary['label'],
    outcome: Phase3AttemptSummary['outcome'],
  ): Phase3AttemptSummary => ({ label, outcome });

  it('advances only adjudicated passes through CR1, CR2, and CR3', () => {
    assert.deepEqual(phase3SequenceStatus([]), {
      consecutivePasses: 0,
      nextLabel: 'Phase3-CR1',
      blockedByAdjudication: false,
      satisfied: false,
    });
    assert.equal(phase3SequenceStatus([attempt('Phase3-CR1', 'passed')]).nextLabel, 'Phase3-CR2');
    assert.equal(
      phase3SequenceStatus([
        attempt('Phase3-CR1', 'passed'),
        attempt('Phase3-CR2', 'passed'),
      ]).nextLabel,
      'Phase3-CR3',
    );
    assert.deepEqual(
      phase3SequenceStatus([
        attempt('Phase3-CR1', 'passed'),
        attempt('Phase3-CR2', 'passed'),
        attempt('Phase3-CR3', 'passed'),
      ]),
      {
        consecutivePasses: 3,
        nextLabel: null,
        blockedByAdjudication: false,
        satisfied: true,
      },
    );
  });

  it('keeps CR3 and two passes when custody refuses before CR3 starts', () => {
    const status = phase3SequenceStatus([
      attempt('Phase3-CR1', 'passed'),
      attempt('Phase3-CR2', 'passed'),
      attempt('Phase3-CR3', 'not_started'),
    ]);

    assert.equal(status.consecutivePasses, 2);
    assert.equal(status.nextLabel, 'Phase3-CR3');
  });

  it('resets to CR1 after a failed or interrupted started attempt', () => {
    for (const outcome of ['failed', 'interrupted'] as const) {
      const status = phase3SequenceStatus([
        attempt('Phase3-CR1', 'passed'),
        attempt('Phase3-CR2', outcome),
      ]);
      assert.equal(status.consecutivePasses, 0);
      assert.equal(status.nextLabel, 'Phase3-CR1');
    }
  });

  it('blocks another attempt while independent adjudication is pending', () => {
    assert.deepEqual(phase3SequenceStatus([attempt('Phase3-CR1', 'awaiting_adjudication')]), {
      consecutivePasses: 0,
      nextLabel: null,
      blockedByAdjudication: true,
      satisfied: false,
    });
  });

  it('rejects misordered counted-run labels instead of counting their outcomes', () => {
    assert.throws(
      () => phase3SequenceStatus([attempt('Phase3-CR2', 'passed')]),
      /expected Phase3-CR1, received Phase3-CR2/,
    );
    assert.throws(
      () =>
        phase3SequenceStatus([
          attempt('Phase3-CR1', 'passed'),
          attempt('Phase3-CR1', 'passed'),
        ]),
      /expected Phase3-CR2, received Phase3-CR1/,
    );
  });
});
