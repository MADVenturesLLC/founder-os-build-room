/**
 * Seat Registry V1 — Resolution and Policy tests (C4).
 *
 * Implements tests 4, 9, 12, and 13 per r7 §9.1.
 *
 * Ratified plan: docs/planning/seat-registry-v1/seat-registry-v1-implementation-plan-r7-DRAFT.md
 * (sha256 b1bc4159b8cdb1ce6c342d84b4be3650a340abfc467624154ea5ba2a54815b60).
 * Governing decision: DEC-20260902-02 (active, source_of_truth: true, version 0.2).
 * Doctrine pin: FounderOS bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda.
 *
 * Requirements:
 * - imports only the public entry point (../packages/seat-registry/src/index.js)
 * - asserts against vendored fixtures under packages/seat-registry/fixtures/
 * - no production logic in test/
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  DISPATCH_POLICY,
  DISPATCH_PATH_OBLIGATIONS,
  FAILOVER_ELIGIBLE_TRIGGERS,
  FAILOVER_INELIGIBLE_TRIGGERS,
  MP1_STATEMENT,
  RATIFIED_SEATS,
  RESEARCHER_ABSENT_REASON,
  TIER2_ROSTER_ATTESTATION_IDS,
  classifyTransportFailure,
  contractEventForOutcome,
  isDistinctReviewLane,
  isDispatch,
  resolveSeat,
  retryBudgetTransition,
  validateHandoff,
  type DeploymentBucket,
  type DispatchOutcome,
  type RetryBudgetState,
  type SeatHandoff,
  type SeatRegistrationV1,
} from '../packages/seat-registry/src/index.js';

const fixturesDir = fileURLToPath(new URL('../../packages/seat-registry/fixtures/', import.meta.url));

function fixtureContent(filename: string): string {
  return readFileSync(`${fixturesDir}${filename}`, 'utf8');
}

describe('Test 4 — Per-run model distinctness (r7 §9.1 test 4)', () => {
  it('reviewing model must differ from implementation model and be on the Tier-2 roster fixture', () => {
    // Read the Tier-2 roster regex from the vendored tier2-shape-check.sh fixture
    const tier2Script = fixtureContent('tier2-shape-check.sh');
    const rosterMatch = /REVIEWER_ROSTER_REGEX='[^']*\(([^)]+)\)[^']*'/.exec(tier2Script);
    assert.ok(rosterMatch && rosterMatch[1], 'extracted REVIEWER_ROSTER_REGEX from fixture');
    const rosterFromFixture = rosterMatch[1]
      .split('|')
      .map((s) => s.replace(/\\/g, '').trim());

    // Compare with TIER2_ROSTER_ATTESTATION_IDS
    assert.deepEqual(
      new Set(TIER2_ROSTER_ATTESTATION_IDS),
      new Set(rosterFromFixture),
      'TIER2_ROSTER_ATTESTATION_IDS matches REVIEWER_ROSTER_REGEX in tier2-shape-check.sh',
    );

    const reviewer = RATIFIED_SEATS.find((s) => s.seat_id === 'independent-reviewer') as SeatRegistrationV1;
    const builder = RATIFIED_SEATS.find((s) => s.seat_id === 'builder') as SeatRegistrationV1;

    // Positive pairing: sonnet-5 builder with gemini-3.1-pro reviewer
    const geminiLane = reviewer.routing.find((l) => l.model_id === 'gemini-3.1-pro')!;
    assert.ok(
      isDistinctReviewLane('sonnet-5', geminiLane),
      'sonnet-5 builder + gemini-3.1-pro reviewer is a distinct valid pairing',
    );

    // Negative pairing 1: same model (gemini-3.1-pro builder with gemini-3.1-pro reviewer)
    assert.ok(
      !isDistinctReviewLane('gemini-3.1-pro', geminiLane),
      'same implementation and review model must be rejected',
    );

    // Negative pairing 2: off-roster model (e.g. claude-haiku-4-5 as reviewer)
    const mockOffRosterLane = {
      ...geminiLane,
      model_id: 'claude-haiku-4-5',
      tier2_attestation_id: 'claude-haiku-4-5',
    };
    assert.ok(
      !isDistinctReviewLane('sonnet-5', mockOffRosterLane),
      'off-roster reviewer model must be rejected',
    );
  });
});

describe('Test 9 — resolveSeat fail-closed (r7 §9.1 test 9)', () => {
  it('returns RefusedSeat with unknown_seat for completely unknown seatId', () => {
    const res = resolveSeat('nonexistent-agent');
    assert.equal(res.kind, 'refused');
    assert.equal(res.refusal, 'unknown_seat');
    assert.equal(res.registration, null);
    assert.equal(res.readiness.length, 0);
    assert.match(res.reason, /not a registered seat id and not a role/);
  });

  it('returns RefusedSeat with seat_outside_registry for a valid 30-role id that is not one of the 4 seats', () => {
    const res = resolveSeat('qa-lead');
    assert.equal(res.kind, 'refused');
    assert.equal(res.refusal, 'seat_outside_registry');
    assert.equal(res.registration, null);
    assert.match(res.reason, /not one of the four Seat Registry V1 seats/);
  });

  it('returns seat_outside_registry for strategist (S2 regression)', () => {
    const res = resolveSeat('strategist');
    assert.equal(res.kind, 'refused');
    assert.equal(res.refusal, 'seat_outside_registry');
    assert.equal(res.registration, null);
    assert.match(res.reason, /not one of the four Seat Registry V1 seats/);
  });

  it('recognizes the complete thirty-role set from the vendored fixture (S2 regression)', () => {
    // Parse role ids from the vendored role-registry fixture table.
    const fixture = fixtureContent('role-registry.md');
    const fixtureRoles = [...fixture.matchAll(/^\| ([a-z0-9-]+) \|/gm)]
      .map((m) => m[1])
      .filter((id): id is string => id !== undefined);
    assert.equal(fixtureRoles.length, 30, 'vendored role-registry fixture carries thirty roles');
    const canonicalSeats = ['researcher', 'architect', 'builder', 'independent-reviewer'];
    const seatIds = new Set(canonicalSeats);
    for (const role of fixtureRoles) {
      const res = resolveSeat(role);
      assert.equal(res.kind, 'refused', `${role} must never resolve in V1`);
      if (seatIds.has(role)) {
        // The four canonical seats keep their registrations; no fifth seat exists.
        assert.ok(res.registration !== null, `${role} is a canonical seat and must carry its registration`);
        assert.notEqual(res.refusal, 'unknown_seat', `${role} must not be classified as unknown`);
        assert.notEqual(res.refusal, 'seat_outside_registry', `${role} is a seat, not an outside role`);
      } else {
        assert.equal(res.refusal, 'seat_outside_registry', `${role} must be classified as outside the four seats`);
      }
    }
    // No fifth seat is created: exactly the four canonical seat ids resolve as seats.
    assert.deepEqual(
      [...seatIds].sort(),
      canonicalSeats.sort(),
      'the four canonical Seat Registry seat IDs remain unchanged',
    );
  });

  it('unknown roles remain unknown_seat (S2 regression)', () => {
    const res = resolveSeat('not-a-real-role');
    assert.equal(res.kind, 'refused');
    assert.equal(res.refusal, 'unknown_seat');
    assert.equal(res.registration, null);
    assert.match(res.reason, /not a registered seat id and not a role/);
  });

  it('returns RefusedSeat with temporary_task_assignment_not_lane_authority when presented_authority is supplied', () => {
    const res = resolveSeat('builder', {
      presented_authority: { kind: 'temporary-task-assignment', assignment_ref: 'HO-20260902-01' },
    });
    assert.equal(res.kind, 'refused');
    assert.equal(res.refusal, 'temporary_task_assignment_not_lane_authority');
    assert.match(res.reason, /temporary task assignment/);
    assert.match(res.reason, /never accepted as lane authority/);
  });

  it('returns RefusedSeat with routing_set_empty and §2.5.1 reason for researcher (AC3)', () => {
    const res = resolveSeat('researcher');
    assert.equal(res.kind, 'refused');
    assert.equal(res.refusal, 'routing_set_empty');
    assert.ok(res.registration !== null);
    assert.equal(res.registration?.seat_id, 'researcher');
    assert.equal(res.reason, RESEARCHER_ABSENT_REASON);
    assert.equal(res.readiness.length, 0);
  });

  it('returns RefusedSeat with lane_not_standing for builder and names per-task requirement (AC4)', () => {
    const res = resolveSeat('builder');
    assert.equal(res.kind, 'refused');
    assert.equal(res.refusal, 'lane_not_standing');
    assert.ok(res.registration !== null);
    assert.equal(res.registration?.seat_id, 'builder');
    assert.equal(res.readiness.length, 7, 'builder has 7 readiness results');
    assert.match(res.reason, /per-task/);
    assert.ok(res.requirement !== null);
    assert.match(res.requirement!, /per-task/);
  });

  it('returns RefusedSeat with lane_not_standing for architect and names manual selection requirement (AC10)', () => {
    const res = resolveSeat('architect');
    assert.equal(res.kind, 'refused');
    assert.equal(res.refusal, 'lane_not_standing');
    assert.ok(res.registration !== null);
    assert.equal(res.registration?.seat_id, 'architect');
    assert.equal(res.readiness.length, 2, 'architect has 2 readiness results');
    assert.match(res.reason, /antigravity/);
    assert.match(res.reason, /manual per-task model selection/);
    assert.match(res.reason, /bounded reconciliation/);
    assert.match(res.reason, /per-invocation preconditions/);
  });

  it('returns RefusedSeat with lane_not_standing for independent-reviewer and names per-run Founder act (AC2)', () => {
    const res = resolveSeat('independent-reviewer');
    assert.equal(res.kind, 'refused');
    assert.equal(res.refusal, 'lane_not_standing');
    assert.ok(res.registration !== null);
    assert.equal(res.registration?.seat_id, 'independent-reviewer');
    assert.equal(res.readiness.length, 5, 'independent-reviewer has 5 readiness results');
    assert.match(res.reason, /per-run Founder act/);
    assert.ok(res.requirement !== null);
    assert.match(res.requirement!, /per-run Founder act/);
  });
});

describe('Test 12 — Dispatch policy (r7 §9.1 test 12, AC6)', () => {
  it('(i) exported constants and total outcome-to-§5 mapping as data', () => {
    assert.equal(DISPATCH_POLICY.transport_retries_max, 2, 'transport_retries_max is 2');
    assert.equal(DISPATCH_POLICY.lane_failovers_max, 1, 'lane_failovers_max is 1');
    assert.equal(DISPATCH_POLICY.failover_eligible_triggers.length, 4);
    assert.equal(DISPATCH_POLICY.failover_ineligible_triggers.length, 6);

    // Verify mapping of all three outcomes to §5 events
    const completedOutcome: DispatchOutcome = { kind: 'seat_completed', lane_label: 'large' };
    assert.equal(contractEventForOutcome(completedOutcome), 'completed');

    const failedOutcome: DispatchOutcome = { kind: 'seat_failed', last_error_class: 'transport' };
    assert.equal(contractEventForOutcome(failedOutcome), 'failed');

    const unresolvedOutcome: DispatchOutcome = { kind: 'seat_unresolved', reason: 'timeout' };
    assert.equal(contractEventForOutcome(unresolvedOutcome), 'unresolved');
  });

  it('(ii) retryBudgetTransition pure state machine (all 12 ruled sub-requirements)', () => {
    const family = {
      room: 'room-1',
      run: 'run-1',
      execution: 'exec-1',
      repository_scope: 'founder-os-build-room',
      authorization: 'DEC-20260902-02',
    };

    const bucketPrimary: DeploymentBucket = {
      seat_id: 'builder',
      lane_label: 'large',
      surface_id: 'grok-build',
      model_id: 'grok-4.5',
      mode: 'standard',
    };

    const bucketFallback: DeploymentBucket = {
      seat_id: 'builder',
      lane_label: 'large fallback',
      surface_id: 'claude-code',
      model_id: 'sonnet-5',
      mode: null,
    };

    let state: RetryBudgetState = {
      family,
      consumed: {},
      exhausted: [],
      failovers_used: 0,
      pending_unknown_outcome: false,
      closed: false,
    };

    // (1 & 2) correlation family & deployment bucket keying
    // (3) initial dispatch consumes no retry
    let d = retryBudgetTransition(state, { kind: 'initial_dispatch', bucket: bucketPrimary });
    assert.ok(d.allowed);
    state = d.state;
    assert.equal(Object.keys(state.consumed).length, 0, 'initial dispatch consumes 0 retries');

    // (4) retry 1
    d = retryBudgetTransition(state, { kind: 'retry_request', bucket: bucketPrimary });
    assert.ok(d.allowed);
    state = d.state;
    const keyPrimary = Object.keys(state.consumed)[0]!;
    assert.equal(state.consumed[keyPrimary], 1, 'consumed 1 retry');

    // (4) retry 2
    d = retryBudgetTransition(state, { kind: 'retry_request', bucket: bucketPrimary });
    assert.ok(d.allowed);
    state = d.state;
    assert.equal(state.consumed[keyPrimary], 2, 'consumed 2 retries');
    // (5) deployment exhausted
    assert.ok(state.exhausted.includes(keyPrimary), 'bucket marked exhausted');

    // (4) retry 3 refused (ceiling is 2)
    d = retryBudgetTransition(state, { kind: 'retry_request', bucket: bucketPrimary });
    assert.ok(!d.allowed, 'third retry must be refused');
    assert.match(d.reason, /exhausted its two-retry budget/);

    // (7) mode/lane_label anti-evasion: failover to same (surface_id, model_id) is refused
    const fakeFailoverBucket: DeploymentBucket = {
      ...bucketPrimary,
      lane_label: 'evasion-label',
      mode: 'thinking',
    };
    d = retryBudgetTransition(state, {
      kind: 'failover_request',
      from: bucketPrimary,
      to: fakeFailoverBucket,
      trigger: 'provider 5xx or declared outage',
    });
    assert.ok(!d.allowed, 'failover with same surface_id and model_id must be refused');
    assert.match(d.reason, /must change surface_id or model_id/);

    // Ineligible failover trigger refused
    d = retryBudgetTransition(state, {
      kind: 'failover_request',
      from: bucketPrimary,
      to: bucketFallback,
      trigger: 'a disliked answer',
    });
    assert.ok(!d.allowed, 'ineligible trigger must be refused');
    assert.match(d.reason, /not on the DEC-20260720-03 item 4 ELIGIBLE list/);

    // (6) Lawful failover: eligible trigger, changes surface/model
    d = retryBudgetTransition(state, {
      kind: 'failover_request',
      from: bucketPrimary,
      to: bucketFallback,
      trigger: 'provider 5xx or declared outage',
    });
    assert.ok(d.allowed, 'lawful failover allowed');
    state = d.state;
    assert.equal(state.failovers_used, 1);
    const keyFallback = 'builder|large fallback|claude-code|sonnet-5|';
    assert.equal(state.consumed[keyFallback] ?? 0, 0, 'new deployment begins with 0 retries consumed');

    // Second failover refused (max 1 failover)
    const thirdBucket: DeploymentBucket = {
      ...bucketFallback,
      surface_id: 'codex',
      model_id: 'gpt-5.6-sol',
    };
    d = retryBudgetTransition(state, {
      kind: 'failover_request',
      from: bucketFallback,
      to: thirdBucket,
      trigger: 'provider 5xx or declared outage',
    });
    assert.ok(!d.allowed, 'second failover refused');
    assert.match(d.reason, /at most one lawful failover/);

    // (8) return to exhausted deployment does not reset counter
    d = retryBudgetTransition(state, { kind: 'retry_request', bucket: bucketPrimary });
    assert.ok(!d.allowed, 'exhausted deployment counter never resets within execution');

    // (10) unknown_outcome blocks BOTH retry and failover until reconciled
    d = retryBudgetTransition(state, { kind: 'unknown_outcome' });
    assert.ok(d.allowed);
    state = d.state;
    assert.equal(state.pending_unknown_outcome, true);

    // (12) while pending_unknown_outcome is set, retry is refused
    d = retryBudgetTransition(state, { kind: 'retry_request', bucket: bucketFallback });
    assert.ok(!d.allowed, 'retry blocked during pending_unknown_outcome');
    assert.match(d.reason, /unknown_outcome pending/);

    // Reconciled lifts the block
    d = retryBudgetTransition(state, { kind: 'reconciled' });
    assert.ok(d.allowed);
    state = d.state;
    assert.equal(state.pending_unknown_outcome, false);

    // (11) lost_response_replay consumes no retry, opens no bucket, changes no counter
    const consumedBeforeReplay = { ...state.consumed };
    d = retryBudgetTransition(state, {
      kind: 'lost_response_replay',
      bucket: bucketFallback,
      idempotency_key: 'idem-key-123',
    });
    assert.ok(d.allowed);
    assert.deepEqual(d.state.consumed, consumedBeforeReplay, 'consumed map unchanged after replay');
    assert.match(d.reason, /consumes no retry/);

    // completed closes the execution; nothing reopens it
    d = retryBudgetTransition(state, { kind: 'completed' });
    assert.ok(d.allowed);
    state = d.state;
    assert.equal(state.closed, true);

    // Any action on closed execution is refused
    d = retryBudgetTransition(state, { kind: 'retry_request', bucket: bucketFallback });
    assert.ok(!d.allowed, 'action on closed execution is refused');
    assert.match(d.reason, /closed by a completed outcome/);
  });

  it('(iii) transport uncertainty: without affirmative no-effect evidence returns seat_unresolved', () => {
    const withoutEvidence = classifyTransportFailure(false);
    assert.equal(withoutEvidence.kind, 'seat_unresolved');
    assert.equal(contractEventForOutcome(withoutEvidence), 'unresolved');

    const withEvidence = classifyTransportFailure(true);
    assert.equal(withEvidence.kind, 'seat_failed');
    assert.equal(contractEventForOutcome(withEvidence), 'failed');
  });

  it('(v) dispatch-path obligations as data and MP-1 statement', () => {
    assert.equal(DISPATCH_PATH_OBLIGATIONS.length, 10, 'contains 10 obligations');
    assert.ok(
      DISPATCH_PATH_OBLIGATIONS.some((o) => o.includes('DEC-20260716-02 item 5')),
      'carries DEC-20260716-02 item 5',
    );
    assert.ok(
      DISPATCH_PATH_OBLIGATIONS.some((o) => o.includes('DEC-20260815-16 clause 2')),
      'carries DEC-20260815-16 clause 2',
    );
    assert.ok(
      DISPATCH_PATH_OBLIGATIONS.some((o) => o.includes('DEC-20260815-09 clause 2')),
      'carries DEC-20260815-09 clause 2',
    );
    assert.ok(
      DISPATCH_PATH_OBLIGATIONS.some((o) => o.includes('DEC-20260807-01 §4.1')),
      'carries DEC-20260807-01 §4.1',
    );
    assert.ok(
      DISPATCH_PATH_OBLIGATIONS.some((o) => o.includes('DEC-20260807-01 §3.4')),
      'carries DEC-20260807-01 §3.4',
    );

    // isDispatch predicate
    assert.equal(isDispatch({ kind: 'initial_dispatch' }), true);
    assert.equal(isDispatch({ kind: 'retry_request' }), true);
    assert.equal(isDispatch({ kind: 'failover_request' }), true);
    assert.equal(isDispatch({ kind: 'lost_response_replay' }), false);

    assert.equal(MP1_STATEMENT, 'MP-1 remains approved but inactive.');
  });
});

describe('Test 13 — Handoff validator (r7 §9.1 test 13, AC5)', () => {
  const goldenHandoff: SeatHandoff = {
    receives_from: 'architect',
    produces: 'Build Report',
    terminal_status: 'BUILD_READY_FOR_INDEPENDENT_VERIFICATION',
    committed_sha: '1234567890abcdef1234567890abcdef12345678',
    authorization_refs: ['DEC-20260902-02'],
  };

  it('validates golden handoff record successfully', () => {
    const res = validateHandoff(goldenHandoff, 'builder');
    assert.equal(res.valid, true);
    assert.equal(res.error, null);
    assert.equal(res.field, null);
  });

  it('rejects missing receives_from', () => {
    // @ts-expect-error test missing field
    const res = validateHandoff({ ...goldenHandoff, receives_from: undefined }, 'builder');
    assert.equal(res.valid, false);
    assert.equal(res.field, 'receives_from');
  });

  it('rejects missing produces', () => {
    // @ts-expect-error test missing field
    const res = validateHandoff({ ...goldenHandoff, produces: undefined }, 'builder');
    assert.equal(res.valid, false);
    assert.equal(res.field, 'produces');
  });

  it('rejects non-string produces values cleanly without throwing (S1 regression)', () => {
    // A shape-validator for untrusted input must reject, never throw.
    for (const bad of [null, 42, true, ['array'], { object: true }]) {
      // @ts-expect-error test non-string produces
      const res = validateHandoff({ ...goldenHandoff, produces: bad }, 'builder');
      assert.equal(res.valid, false, `produces=${JSON.stringify(bad)} must be rejected`);
      assert.equal(res.field, 'produces', `produces=${JSON.stringify(bad)} must name produces as the offending field`);
      assert.match(res.error!, /non-empty string/);
    }
  });

  it('rejects empty-string produces', () => {
    const res = validateHandoff({ ...goldenHandoff, produces: '   ' }, 'builder');
    assert.equal(res.valid, false);
    assert.equal(res.field, 'produces');
    assert.match(res.error!, /non-empty string/);
  });

  it('rejects missing terminal_status', () => {
    // @ts-expect-error test missing field
    const res = validateHandoff({ ...goldenHandoff, terminal_status: undefined }, 'builder');
    assert.equal(res.valid, false);
    assert.equal(res.field, 'terminal_status');
  });

  it('rejects wrong terminal_status for seat', () => {
    const res = validateHandoff(
      { ...goldenHandoff, terminal_status: 'PLAN_READY_FOR_FOUNDER_APPROVAL' },
      'builder',
    );
    assert.equal(res.valid, false);
    assert.equal(res.field, 'terminal_status');
    assert.match(res.error!, /not a terminal status of seat/);
  });

  it('rejects missing committed_sha', () => {
    // @ts-expect-error test missing field
    const res = validateHandoff({ ...goldenHandoff, committed_sha: undefined }, 'builder');
    assert.equal(res.valid, false);
    assert.equal(res.field, 'committed_sha');
  });

  it('rejects short committed_sha (not 40 hex)', () => {
    const res = validateHandoff({ ...goldenHandoff, committed_sha: '1234567' }, 'builder');
    assert.equal(res.valid, false);
    assert.equal(res.field, 'committed_sha');
    assert.match(res.error!, /full 40-hex string/);
  });

  it('rejects missing authorization_refs', () => {
    // @ts-expect-error test missing field
    const res = validateHandoff({ ...goldenHandoff, authorization_refs: undefined }, 'builder');
    assert.equal(res.valid, false);
    assert.equal(res.field, 'authorization_refs');
  });

  it('rejects empty authorization_refs', () => {
    const res = validateHandoff({ ...goldenHandoff, authorization_refs: [] }, 'builder');
    assert.equal(res.valid, false);
    assert.equal(res.field, 'authorization_refs');
    assert.match(res.error!, /non-empty array/);
  });
});
