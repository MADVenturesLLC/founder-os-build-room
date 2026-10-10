import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatMachineIdentity } from '../packages/run-harness/src/phase3/cli.js';
import {
  phase3PlanFailure,
  validatePhase3Plan,
} from '../packages/run-harness/src/phase3/plan.js';

const PLAN = {
  runAttemptId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  label: 'Phase3-CR1',
  entryAuthorizationId: 'founder:phase3-cr1:2026-08-25',
  founderOsSha: '1'.repeat(40),
  founderOs: { repository: 'MADVenturesLLC/FounderOS', path: '/tmp/FounderOS' },
  buildRoomSha: '2'.repeat(40),
  controlPlaneOrigin: 'https://control-plane.example',
  gatewayId: '11111111-2222-4333-8444-555555555555',
  expectedEnrollments: [
    { gatewayId: '11111111-2222-4333-8444-555555555555', state: 'enrolled' },
    { gatewayId: '22222222-3333-4444-8555-666666666666', state: 'denied' },
  ],
  fixture: {
    repository: 'MADVenturesLLC/phase3-fixture',
    path: '/tmp/phase3-fixture',
    sha: '3'.repeat(40),
  },
  environment: 'production',
  machine: 'michael-macbook',
  heartbeatFreshnessMs: 600_000,
};

describe('Phase 3 plan validation', () => {
  it('classifies every invalid-plan category before generic shape refusal', () => {
    const { founderOs: _founderOs, ...withoutFounderOs } = PLAN;
    const cases = [
      [{ ...PLAN, runAttemptId: 'invalid' }, 'attempt_identity_invalid'],
      [{ ...PLAN, entryAuthorizationId: '' }, 'authorization_invalid'],
      [{ ...PLAN, label: 'Phase3-CR3' }, 'authorization_invalid'],
      [{ ...PLAN, revocationAuthorizationId: 'founder:unexpected' }, 'authorization_invalid'],
      [{ ...PLAN, founderOsSha: 'invalid' }, 'governing_sha_invalid'],
      [withoutFounderOs, 'founder_os_invalid'],
      [{ ...PLAN, gatewayId: 'invalid' }, 'gateway_identity_invalid'],
      [{ ...PLAN, controlPlaneOrigin: 'invalid' }, 'context_invalid'],
      [{ ...PLAN, fixture: undefined }, 'fixture_unavailable'],
      [{ ...PLAN, expectedEnrollments: [] }, 'enrollment_projection_failed'],
      [{ ...PLAN, unexpected: true }, 'context_invalid'],
    ] as const;

    for (const [value, reasonCode] of cases) {
      assert.equal(phase3PlanFailure(value), reasonCode);
    }
  });

  it('requires the governed FounderOS repository identity and absolute root', () => {
    const { founderOs, ...withoutFounderOs } = PLAN;
    assert.equal(validatePhase3Plan(PLAN).ok, true);
    assert.equal(validatePhase3Plan(withoutFounderOs).ok, false);
    assert.equal(
      validatePhase3Plan({
        ...PLAN,
        founderOs: { ...founderOs, repository: 'MADVenturesLLC/not-founder-os' },
      }).ok,
      false,
    );
    assert.equal(validatePhase3Plan({ ...PLAN, founderOs: { ...founderOs, path: 'relative' } }).ok, false);
  });

  it('accepts one exact nonsecret CR1 plan', () => {
    const result = validatePhase3Plan(PLAN);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, PLAN);
  });

  it('accepts the exact machine identity shape emitted on macOS', () => {
    const machine = formatMachineIdentity('Michaels-iMac', '13.7.8', 'x64');
    assert.equal(machine, 'Michaels-iMac+macOS:13.7.8+x64');
    assert.equal(validatePhase3Plan({ ...PLAN, machine }).ok, true);
  });

  it('requires exactly one enrolled row matching the authorized gateway, so two enrolled are refused (two-Gateways act B4)', () => {
    assert.equal(validatePhase3Plan({ ...PLAN, expectedEnrollments: [] }).ok, false);
    assert.equal(
      validatePhase3Plan({
        ...PLAN,
        expectedEnrollments: [
          ...PLAN.expectedEnrollments,
          { gatewayId: '33333333-4444-4555-8666-777777777777', state: 'enrolled' },
        ],
      }).ok,
      false,
    );
    assert.equal(
      validatePhase3Plan({
        ...PLAN,
        expectedEnrollments: [
          PLAN.expectedEnrollments[0],
          ...Array.from({ length: 1_000 }, (_, index) => ({
            gatewayId: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
            state: 'denied',
          })),
        ],
      }).ok,
      false,
    );
  });

  it('refuses awaiting approval, relative fixture paths, excessive freshness, and secret-shaped fields', () => {
    assert.equal(
      validatePhase3Plan({
        ...PLAN,
        expectedEnrollments: [{ gatewayId: PLAN.gatewayId, state: 'awaiting_approval' }],
      }).ok,
      false,
    );
    assert.equal(validatePhase3Plan({ ...PLAN, fixture: { ...PLAN.fixture, path: 'relative' } }).ok, false);
    assert.equal(validatePhase3Plan({ ...PLAN, heartbeatFreshnessMs: 600_001 }).ok, false);
    assert.equal(validatePhase3Plan({ ...PLAN, controlPlaneOrigin: 'https://user:pass@example.com' }).ok, false);
    assert.deepEqual(validatePhase3Plan({ ...PLAN, controlPlaneToken: 'secret' }), {
      ok: false,
      code: 'invalid_plan',
    });
  });

  it('requires the separate CR3 revocation authorization and forbids it on CR1', () => {
    assert.equal(validatePhase3Plan({ ...PLAN, label: 'Phase3-CR3' }).ok, false);
    assert.equal(
      validatePhase3Plan({
        ...PLAN,
        label: 'Phase3-CR3',
        revocationAuthorizationId: 'founder:phase3-cr3:revocation:test',
      }).ok,
      true,
    );
    assert.equal(
      validatePhase3Plan({ ...PLAN, revocationAuthorizationId: 'founder:unexpected' }).ok,
      false,
    );
  });
});
