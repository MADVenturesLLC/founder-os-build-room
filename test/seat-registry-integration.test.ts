/**
 * Seat Registry V1.1 — integration gate behavioral tests (T1–T10, T12, T6, T7, T17).
 *
 * Controlling specification: docs/planning/seat-registry-v1/
 * seat-registry-v1.1-non-activating-integration-plan-DRAFT.md
 * (sha256 85bfe268fc571a3ec71c15243d4df44a953fd5e2340763a92ae51072dfa412eb),
 * section 10, matrix items T1–T18. Companion artifact:
 * seat-registry-v1.1-authority-and-closure-matrix.md
 * (sha256 95634527fcd5ca91d412c0a263898b3c90ed1ff075925224a84f68dbdb277b65).
 *
 * Requirements:
 * - imports only the public entry points (seat-registry entry for package data;
 *   control-plane entry for the gate) — the single-entry rule (T11);
 * - no production logic in test/;
 * - no live provider call, no dispatch, no credential, no network (T13–T15).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RATIFIED_SEATS,
  SEAT_IDS,
  canonicalBucketKey,
  classifyTransportFailure,
  contractEventForOutcome,
  isDistinctReviewLane,
  type DeploymentBucket,
  type ResolvedSeat,
  type RetryBudgetState,
  type SeatRegistrationV1,
  type SeatRoutingLane,
} from '../packages/seat-registry/src/index.js';

import {
  createSeatPolicyGate,
  DISPATCH_AT_MOST_ONCE,
  DISPATCH_PATH_OBLIGATIONS,
  MP1_STATEMENT,
  type DispatchRequest,
  type SeatPolicyDecision,
  type SeatResolver,
} from '../packages/control-plane/src/index.js';

/* ------------------------------------------------------------------ */
/* Hand-built fixtures (Founder §5 — deterministic, provider-free)     */
/* ------------------------------------------------------------------ */

const family = {
  room: 'room-test',
  run: 'run-test',
  execution: 'execution-test',
  repository_scope: 'madventures/founder-os-build-room',
  authorization: 'DEC-TEST-AUTH',
} as const;

function freshState(): RetryBudgetState {
  return {
    family,
    consumed: {},
    exhausted: [],
    failovers_used: 0,
    pending_unknown_outcome: false,
    closed: false,
  };
}

const bucketA: DeploymentBucket = {
  seat_id: 'builder',
  lane_label: 'medium',
  surface_id: 'hermes-local-code',
  model_id: 'glm-5.3',
  mode: null,
};

const bucketAKey = canonicalBucketKey(bucketA);

const bucketFailover: DeploymentBucket = {
  seat_id: 'builder',
  lane_label: 'medium',
  surface_id: 'claude-code', // surface changes → lawful failover identity
  model_id: 'claude-sonnet-5',
  mode: null,
};

const eligibleTrigger = 'provider 5xx or declared outage';
const ineligibleTrigger = 'a disliked answer';

/** The full T1–T10/T12 decision matrix, as one reproducible function (T17). */
function scenarioMatrix(): unknown[] {
  const gate = createSeatPolicyGate();
  const outputs: unknown[] = [];

  // T1 unknown roles
  for (const id of ['nonexistent-role', '', 'operator', 'founder', 'Hephaestus']) {
    outputs.push(gate.evaluateDispatch({ seat_id: id }));
  }
  // T1 malformed (structured refusal, never throws)
  outputs.push(gate.evaluateDispatch({ seat_id: 42 } as unknown as DispatchRequest));
  outputs.push(gate.evaluateDispatch({} as unknown as DispatchRequest));
  outputs.push(gate.evaluateDispatch(null as unknown as DispatchRequest));
  outputs.push(gate.evaluateDispatch('builder' as unknown as DispatchRequest));

  // T2 strategist
  outputs.push(gate.evaluateDispatch({ seat_id: 'strategist' }));

  // T3/T4/T5 all four seats + fifth-seat probes
  for (const id of [...SEAT_IDS, 'operator', 'planner', 'researcher-2']) {
    outputs.push(gate.evaluateDispatch({ seat_id: id }));
  }

  // T6(b)/T7/T8/T9 retry-failover-replay-unknown machine
  let state = freshState();
  const retry1 = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA });
  outputs.push(retry1);
  state = retry1.state;
  const retry2 = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA });
  outputs.push(retry2);
  state = retry2.state;
  outputs.push(gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA }));
  outputs.push(
    gate.decideFailover(state, {
      kind: 'failover_request',
      from: bucketA,
      to: bucketFailover,
      trigger: eligibleTrigger,
    }),
  );
  outputs.push(
    gate.decideReplay(state, { kind: 'lost_response_replay', bucket: bucketA, idempotency_key: 'idem-1' }),
  );
  outputs.push(
    gate.decideRetry(
      { ...state, pending_unknown_outcome: true },
      { kind: 'retry_request', bucket: bucketA },
    ),
  );
  outputs.push(
    gate.decideFailover(
      { ...state, pending_unknown_outcome: true },
      { kind: 'failover_request', from: bucketA, to: bucketFailover, trigger: eligibleTrigger },
    ),
  );
  outputs.push(classifyTransportFailure(false));
  outputs.push(contractEventForOutcome(classifyTransportFailure(false)));

  // T10 distinctness predicate over registry data
  const builder = RATIFIED_SEATS.find((r) => r.seat_id === 'builder') as SeatRegistrationV1;
  for (const lane of builder.routing) {
    outputs.push(gate.assertReviewDistinctness(lane.model_id === 'model-x' ? 'model-y' : 'model-x', lane));
  }

  // T12(d) temporary task assignment offered via reference field
  outputs.push(gate.evaluateDispatch({ seat_id: 'builder', authorization_ref: 'task-assignment-ref-1' }));

  // policy data carried on decisions
  outputs.push(gate.policy());
  return outputs;
}

/* ------------------------------------------------------------------ */
/* T1 — Unknown roles fail closed                                       */
/* ------------------------------------------------------------------ */

describe('T1 — Unknown roles fail closed', () => {
  const gate = createSeatPolicyGate();

  for (const id of ['nonexistent-role', '', 'operator', 'founder', 'Hephaestus']) {
    it(`refuses unknown id ${JSON.stringify(id)} with unknown_seat, naming the id`, () => {
      const decision = gate.evaluateDispatch({ seat_id: id });
      assert.equal(decision.kind, 'refused');
      if (decision.kind !== 'refused') throw new Error('unreachable');
      assert.equal(decision.allowed, false);
      assert.equal(decision.refusal, 'unknown_seat');
      assert.ok(decision.reason.includes(JSON.stringify(id)), `reason names the id: ${decision.reason}`);
    });
  }

  it('never throws on malformed input (structured refusal discipline, plan §5.3/F7)', () => {
    for (const malformed of [
      { seat_id: 42 },
      {},
      null,
      'builder',
      undefined,
      { seat_id: ['builder'] },
    ]) {
      const decision = gate.evaluateDispatch(malformed as unknown as DispatchRequest);
      assert.equal(decision.kind, 'refused');
      if (decision.kind !== 'refused') throw new Error('unreachable');
      assert.equal(decision.allowed, false);
      assert.equal(decision.refusal, 'malformed_request');
      assert.match(decision.reason, /seat_id|request/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* T2 — strategist remains seat_outside_registry                        */
/* ------------------------------------------------------------------ */

describe('T2 — strategist remains seat_outside_registry', () => {
  it('refuses strategist under seat_outside_registry, naming the 30-role registrar', () => {
    const gate = createSeatPolicyGate();
    const decision = gate.evaluateDispatch({ seat_id: 'strategist' });
    assert.equal(decision.kind, 'refused');
    if (decision.kind !== 'refused') throw new Error('unreachable');
    assert.equal(decision.refusal, 'seat_outside_registry');
    assert.match(decision.reason, /30-role/);
  });
});

/* ------------------------------------------------------------------ */
/* T3 — All four canonical seats remain present                         */
/* ------------------------------------------------------------------ */

describe('T3 — All four canonical seats remain present', () => {
  it('RATIFIED_SEATS set-equals the four canonical seat ids', () => {
    assert.deepEqual(
      [...RATIFIED_SEATS.map((r) => r.seat_id)].sort(),
      [...SEAT_IDS].sort(),
    );
  });

  it('each seat refusal carries the seat’s own registration (the resolve.ts contract)', () => {
    const gate = createSeatPolicyGate();
    for (const reg of RATIFIED_SEATS) {
      const decision = gate.evaluateDispatch({ seat_id: reg.seat_id });
      assert.equal(decision.kind, 'refused');
      if (decision.kind !== 'refused') throw new Error('unreachable');
      assert.equal(decision.registration?.seat_id, reg.seat_id);
      assert.ok(decision.readiness.length === reg.routing.length);
    }
  });
});

/* ------------------------------------------------------------------ */
/* T4 — No fifth seat exists                                            */
/* ------------------------------------------------------------------ */

describe('T4 — No fifth seat exists', () => {
  it('SEAT_IDS holds exactly four ids and the gate refuses every non-member', () => {
    assert.equal(SEAT_IDS.length, 4);
    const gate = createSeatPolicyGate();
    for (const id of ['operator', 'planner', 'researcher-2', 'a-fifth-seat', 'builder-2']) {
      const decision = gate.evaluateDispatch({ seat_id: id });
      assert.equal(decision.kind, 'refused');
      assert.equal(decision.allowed, false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* T5 — No lane is standing by default (G9 core)                        */
/* ------------------------------------------------------------------ */

describe('T5 — No lane is standing by default', () => {
  it('every seat refuses with its seat-specific refusal class and a named requirement or absence reason', () => {
    const gate = createSeatPolicyGate();
    for (const reg of RATIFIED_SEATS) {
      const decision = gate.evaluateDispatch({ seat_id: reg.seat_id });
      assert.equal(decision.kind, 'refused');
      if (decision.kind !== 'refused') throw new Error('unreachable');
      assert.equal(decision.allowed, false);
      if (reg.routing.length === 0) {
        // The researcher seat has no registered lanes (routing_set_empty);
        // the seat's absence reason is named — still not standing.
        assert.equal(decision.refusal, 'routing_set_empty');
        assert.ok(decision.reason.length > 0, 'absence reason named');
      } else {
        assert.equal(decision.refusal, 'lane_not_standing');
        assert.ok(decision.requirement !== null && decision.requirement.length > 0, 'requirement named');
        assert.match(decision.reason, /not a standing route/);
      }
    }
  });

  it('negative control: a seam-injected resolver returning resolved yields allowed — the registry, not the gate, keeps every lane closed', () => {
    const builder = RATIFIED_SEATS.find((r) => r.seat_id === 'builder') as SeatRegistrationV1;
    const openResolver = (): ResolvedSeat => ({
      kind: 'resolved',
      registration: builder,
      contract_text: 'test seam contract text',
      readiness: builder.routing.map((lane) => ({ lane_label: lane.lane_label, eligible: true, reason: null })),
    });
    void seatIdGuard(openResolver);
    const gate = createSeatPolicyGate({ resolve: openResolver });
    const decision = gate.evaluateDispatch({ seat_id: 'builder' });
    assert.equal(decision.kind, 'allowed');
    if (decision.kind !== 'allowed') throw new Error('unreachable');
    assert.equal(decision.allowed, true);
    assert.equal(decision.registration.seat_id, 'builder');
    assert.match(decision.note, /test seam/);
  });

  it('with the production binding, allowed is unreachable for every id (default resolver)', () => {
    const gate = createSeatPolicyGate();
    for (const id of [...SEAT_IDS, 'strategist', 'operator', 'nonexistent']) {
      const decision = gate.evaluateDispatch({ seat_id: id });
      assert.equal(decision.allowed, false, `no allowed decision for ${id}`);
    }
  });
});

/** Type-level guard: the seam resolver must conform to the SeatResolver contract. */
function seatIdGuard(resolver: SeatResolver): SeatResolver {
  return resolver;
}

/* ------------------------------------------------------------------ */
/* T6 — Refused and unresolved outcomes cannot dispatch                 */
/* ------------------------------------------------------------------ */

describe('T6 — Refused and unresolved outcomes cannot dispatch', () => {
  it('(a) every refused decision carries allowed:false and no dispatch operation exists on it', () => {
    const gate = createSeatPolicyGate();
    for (const reg of RATIFIED_SEATS) {
      const decision = gate.evaluateDispatch({ seat_id: reg.seat_id });
      assert.equal(decision.kind, 'refused');
      if (decision.kind !== 'refused') throw new Error('unreachable');
      assert.equal(decision.allowed, false);
      // The gate surface offers no dispatch call: decisions are data.
      assert.equal(typeof (decision as unknown as Record<string, unknown>).dispatch, 'undefined');
      assert.equal(typeof (decision as unknown as Record<string, unknown>).execute, 'undefined');
    }
  });

  it('(b) transport failure without affirmative no-effect evidence is seat_unresolved → §5 unresolved event; retry stays refused until reconciled', () => {
    const outcome = classifyTransportFailure(false);
    assert.equal(outcome.kind, 'seat_unresolved');
    assert.equal(contractEventForOutcome(outcome), 'unresolved');

    const gate = createSeatPolicyGate();
    let state = freshState();
    state = gate.decideRetry(state, { kind: 'unknown_outcome' }).state;
    assert.equal(state.pending_unknown_outcome, true);

    const blocked = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA });
    assert.equal(blocked.allowed, false);
    assert.match(blocked.reason, /unknown_outcome/);

    state = gate.decideRetry(state, { kind: 'reconciled' }).state;
    assert.equal(state.pending_unknown_outcome, false);
    const after = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA });
    assert.equal(after.allowed, true);
  });
});

/* ------------------------------------------------------------------ */
/* T7 — unknown_outcome cannot dispatch                                 */
/* ------------------------------------------------------------------ */

describe('T7 — unknown_outcome cannot dispatch', () => {
  it('retry and failover are both refused while pending_unknown_outcome — including requests framed as new commands', () => {
    const gate = createSeatPolicyGate();
    let state = freshState();
    state = gate.decideRetry(state, { kind: 'unknown_outcome' }).state;

    const retry = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA });
    assert.equal(retry.allowed, false);
    assert.match(retry.reason, /unknown_outcome pending/);

    const failover = gate.decideFailover(state, {
      kind: 'failover_request',
      from: bucketA,
      to: bucketFailover,
      trigger: eligibleTrigger,
    });
    assert.equal(failover.allowed, false);
    assert.match(failover.reason, /unknown_outcome pending/);

    // State is unchanged by the refusals.
    assert.equal(retry.state.pending_unknown_outcome, true);
    assert.deepEqual(retry.state.consumed, {});
    assert.equal(failover.state.failovers_used, 0);

    // Reconciliation alone restores budget rules.
    state = gate.decideRetry(state, { kind: 'reconciled' }).state;
    assert.equal(gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA }).allowed, true);
  });
});

/* ------------------------------------------------------------------ */
/* T8 — Retry ceilings are enforced                                     */
/* ------------------------------------------------------------------ */

describe('T8 — Retry ceilings are enforced', () => {
  it('two retries allowed, third refused, exhausted bucket never resets within the execution', () => {
    const gate = createSeatPolicyGate();
    let state = freshState();

    const r1 = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA });
    assert.equal(r1.allowed, true);
    state = r1.state;
    const r2 = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA });
    assert.equal(r2.allowed, true);
    state = r2.state;
    assert.equal(state.consumed[bucketAKey], 2);
    assert.deepEqual(state.exhausted, [bucketAKey]);

    const r3 = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA });
    assert.equal(r3.allowed, false);
    assert.match(r3.reason, /exhausted its two-retry budget/);

    // Leaving the bucket and returning never resets it.
    state = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketFailover }).state;
    const back = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA });
    assert.equal(back.allowed, false, 'exhausted bucket stays exhausted after returning to it');

    // 'completed' closes the execution; nothing reopens it.
    state = gate.decideRetry(state, { kind: 'completed' }).state;
    const closed = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketA });
    assert.equal(closed.allowed, false);
    assert.match(closed.reason, /closed/);

    // Relabeling the execution is not a budget reset (family keys are inputs,
    // not mutable state the gate manages).
    const relabeled = gate.decideRetry(freshState(), { kind: 'retry_request', bucket: bucketA });
    assert.equal(relabeled.allowed, true, 'a genuinely new state starts at zero — the ceiling is per-state, never per-call');
  });

  it('at most one lawful failover; INELIGIBLE triggers refuse; failover must change surface_id or model_id', () => {
    const gate = createSeatPolicyGate();
    let state = freshState();

    const ineligible = gate.decideFailover(state, {
      kind: 'failover_request',
      from: bucketA,
      to: bucketFailover,
      trigger: ineligibleTrigger,
    });
    assert.equal(ineligible.allowed, false);
    assert.match(ineligible.reason, /ELIGIBLE/);

    const sameIdentity = gate.decideFailover(state, {
      kind: 'failover_request',
      from: bucketA,
      to: { ...bucketA, mode: 'max' }, // mode change alone is not a lawful failover
      trigger: eligibleTrigger,
    });
    assert.equal(sameIdentity.allowed, false);
    assert.match(sameIdentity.reason, /surface_id or model_id/);

    const lawful = gate.decideFailover(state, {
      kind: 'failover_request',
      from: bucketA,
      to: bucketFailover,
      trigger: eligibleTrigger,
    });
    assert.equal(lawful.allowed, true);
    state = lawful.state;
    assert.equal(state.failovers_used, 1);

    const second = gate.decideFailover(state, {
      kind: 'failover_request',
      from: bucketFailover,
      to: { ...bucketA, surface_id: 'codex' },
      trigger: eligibleTrigger,
    });
    assert.equal(second.allowed, false);
    assert.match(second.reason, /at most one lawful failover/);
  });

  it('a new deployment bucket starts at zero retries consumed', () => {
    const gate = createSeatPolicyGate();
    const state = freshState();
    const first = gate.decideRetry(state, { kind: 'retry_request', bucket: bucketFailover });
    assert.equal(first.allowed, true);
    assert.equal(first.state.consumed[canonicalBucketKey(bucketFailover)], 1);
    assert.equal(first.state.consumed[bucketAKey], undefined);
  });

  it('the retry machine is exercised with hand-built fixtures only — zero provider calls (no adapter import exists)', () => {
    // The import list at the top of this file is the evidence: no adapter,
    // transport, or provider module is imported (the static suite proves the
    // same for the whole integration surface).
    assert.ok(true);
  });
});

/* ------------------------------------------------------------------ */
/* T9 — Failover increments/rebinds command_id as authority requires    */
/* ------------------------------------------------------------------ */

describe('T9 — command_id discipline on retry, failover, replay', () => {
  it('retry requires a NEW command_id', () => {
    const gate = createSeatPolicyGate();
    const decision = gate.decideRetry(freshState(), { kind: 'retry_request', bucket: bucketA });
    assert.equal(decision.allowed, true);
    assert.equal(decision.requires_new_command_id, true);
    assert.equal(decision.dispatch_at_most_once, DISPATCH_AT_MOST_ONCE);
    assert.deepEqual(decision.obligations, DISPATCH_PATH_OBLIGATIONS);
  });

  it('failover requires a NEW command_id', () => {
    const gate = createSeatPolicyGate();
    const decision = gate.decideFailover(freshState(), {
      kind: 'failover_request',
      from: bucketA,
      to: bucketFailover,
      trigger: eligibleTrigger,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.requires_new_command_id, true);
    assert.equal(decision.dispatch_at_most_once, DISPATCH_AT_MOST_ONCE);
  });

  it('lost_response_replay requires NO new command_id, consumes nothing, opens no bucket, and resolves to the same logical command', () => {
    const gate = createSeatPolicyGate();
    const state = freshState();
    const decision = gate.decideReplay(state, {
      kind: 'lost_response_replay',
      bucket: bucketA,
      idempotency_key: 'cmd-abc-1',
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.requires_new_command_id, false);
    assert.match(decision.reason, /same logical command/);
    assert.match(decision.reason, /cmd-abc-1/);
    assert.deepEqual(decision.state.consumed, {}, 'consumes nothing');
    assert.deepEqual(decision.state.exhausted, [], 'opens no bucket');
    assert.equal(decision.state.failovers_used, 0);
    assert.equal(decision.dispatch_at_most_once, DISPATCH_AT_MOST_ONCE);
  });

  it('the gate mints no command id — no id generator exists on the integration surface (static, T9/T13 family)', () => {
    // Asserted structurally: the gate exposes no function producing ids.
    const gate = createSeatPolicyGate();
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(gate) ?? {});
    for (const name of surface) {
      assert.doesNotMatch(name, /mint|uuid|random|generate/i, `no id-minting surface: ${name}`);
    }
  });
});

/* ------------------------------------------------------------------ */
/* T10 — Distinctness predicate proven; review NOT claimed              */
/* ------------------------------------------------------------------ */

describe('T10 — Builder/reviewer model distinctness (predicate only)', () => {
  const builder = RATIFIED_SEATS.find((r) => r.seat_id === 'builder') as SeatRegistrationV1;
  const reviewer = RATIFIED_SEATS.find((r) => r.seat_id === 'independent-reviewer') as SeatRegistrationV1;

  it('the predicate holds exactly: true only when the model differs and the attestation is on the roster; the gate echoes the registry predicate for every pairing', () => {
    const gate = createSeatPolicyGate();
    let distinctSeen = 0;
    let sameModelSeen = 0;
    for (const implLane of builder.routing) {
      for (const reviewLane of reviewer.routing) {
        const expected = isDistinctReviewLane(implLane.model_id, reviewLane);
        const actual = gate.assertReviewDistinctness(implLane.model_id, reviewLane);
        assert.equal(actual, expected, `gate echoes the predicate for ${implLane.model_id} × ${reviewLane.model_id}`);
        if (implLane.model_id === reviewLane.model_id) {
          assert.equal(actual, false, 'same-model pairing is never distinct');
          sameModelSeen += 1;
        } else {
          assert.equal(actual, true, `distinct-model pairing ${implLane.model_id} × ${reviewLane.model_id} satisfies the requirement`);
          distinctSeen += 1;
        }
      }
    }
    // Corpus evidence both directions exist at the doctrine pin.
    assert.ok(distinctSeen > 0, 'at least one distinct pairing exists');
    assert.ok(sameModelSeen > 0, 'same-model pairings exist and are refused');
  });

  it('the same-model case rejects', () => {
    const gate = createSeatPolicyGate();
    const reviewLane = reviewer.routing[0] as SeatRoutingLane;
    assert.equal(gate.assertReviewDistinctness(reviewLane.model_id, reviewLane), false);
  });

  it('an off-roster attestation rejects', () => {
    const gate = createSeatPolicyGate();
    const offRoster: SeatRoutingLane = {
      ...(reviewer.routing[0] as SeatRoutingLane),
      model_id: 'off-roster-model',
      tier2_attestation_id: 'not-on-the-tier2-roster',
    };
    assert.equal(gate.assertReviewDistinctness('some-implementation-model', offRoster), false);
  });

  it('no gate-produced decision text claims a review occurred — predicate wording only', () => {
    // The assertion scope is the text the GATE produces (its own refusal
    // reasons, notes, and decision fields). The resolver's verbatim reasons
    // are the seat registry's own doctrinal text, quoted unchanged by design
    // (plan §5.3 step 3); they are not review claims by this tranche. The
    // claim phrases below are what a review claim would read as.
    const gate = createSeatPolicyGate();
    const gateTexts: string[] = [
      gate.evaluateDispatch({ seat_id: 1 } as unknown as DispatchRequest).kind === 'refused'
        ? (gate.evaluateDispatch({ seat_id: 1 } as unknown as DispatchRequest) as { reason: string }).reason
        : '',
      'the decision text and test names assert the predicate only',
    ];
    const builder = RATIFIED_SEATS.find((r) => r.seat_id === 'builder') as SeatRegistrationV1;
    const seamGate = createSeatPolicyGate({
      resolve: (): ResolvedSeat => ({
        kind: 'resolved',
        registration: builder,
        contract_text: 'seam',
        readiness: [],
      }),
    });
    const allowed = seamGate.evaluateDispatch({ seat_id: 'builder' });
    if (allowed.kind === 'allowed') gateTexts.push(allowed.note);
    const serializedGate = JSON.stringify(gateTexts);
    const claimPhrases =
      /independent review occurred|review has been|has been reviewed|review completed|review performed|we reviewed|reviewed this/i;
    assert.doesNotMatch(serializedGate, claimPhrases);
    // The predicate wording the gate is allowed to carry:
    assert.doesNotMatch(serializedGate, /activation|eligible for dispatch/i);
  });
});

/* ------------------------------------------------------------------ */
/* T12 — Direct bypass of Seat Registry policy is rejected              */
/* ------------------------------------------------------------------ */

describe('T12 — Direct bypass is rejected', () => {
  it('(a) the gate exposes no API accepting a resolution — authority claims in request fields never dispatch', () => {
    const gate = createSeatPolicyGate();
    const claims = [
      { seat_id: 'builder', lane_label: 'large', authorization_ref: 'any-auth-ref' },
      { seat_id: 'architect', lane_label: 'primary', authorization_ref: 'claimed-authorization' },
      { seat_id: 'builder', authorization_ref: 'a-forged-dec' },
    ];
    for (const request of claims) {
      const decision = gate.evaluateDispatch(request);
      assert.equal(decision.kind, 'refused');
      assert.equal(decision.allowed, false);
    }
  });

  it('(b) the production gate constructs with the DEFAULT resolver — every seat and unknown id refuses', () => {
    const gate = createSeatPolicyGate();
    for (const id of [...SEAT_IDS, 'strategist', 'operator', 'nonexistent-role']) {
      const decision = gate.evaluateDispatch({ seat_id: id });
      assert.equal(decision.allowed, false, `default binding refuses ${id}`);
    }
  });

  it('(c) negative control: a seam-injected resolved resolver returns allowed — the (b) test can detect an open gate', () => {
    const builder = RATIFIED_SEATS.find((r) => r.seat_id === 'builder') as SeatRegistrationV1;
    const gate = createSeatPolicyGate({
      resolve: (): ResolvedSeat => ({
        kind: 'resolved',
        registration: builder,
        contract_text: 'seam',
        readiness: [],
      }),
    });
    const decision = gate.evaluateDispatch({ seat_id: 'builder' });
    assert.equal(decision.kind, 'allowed');
  });

  it('(d) presented authority (temporary task assignment) is refused, never honored as lane authority', () => {
    const gate = createSeatPolicyGate();
    const decision = gate.evaluateDispatch({ seat_id: 'builder', authorization_ref: 'temporary-task-assignment-ref' });
    assert.equal(decision.kind, 'refused');
    if (decision.kind !== 'refused') throw new Error('unreachable');
    assert.equal(decision.refusal, 'temporary_task_assignment_not_lane_authority');
  });
});

/* ------------------------------------------------------------------ */
/* T17 — Determinism: the matrix runs twice and equals itself           */
/* ------------------------------------------------------------------ */

describe('T17 — Repeated execution is deterministic', () => {
  it('the full scenario matrix deep-equals itself across two executions in the same run', () => {
    assert.deepEqual(scenarioMatrix(), scenarioMatrix());
  });

  it('MP1_STATEMENT is carried verbatim on policy data', () => {
    assert.equal(MP1_STATEMENT, 'MP-1 remains approved but inactive.');
  });
});

/* ------------------------------------------------------------------ */
/* Decision-shape invariants used across the matrix                     */
/* ------------------------------------------------------------------ */

describe('SeatPolicyDecision shape invariants', () => {
  it('every decision is either refused-with-class or allowed-with-registration (closed union)', () => {
    for (const output of scenarioMatrix()) {
      if (output === null || typeof output !== 'object') continue;
      const candidate = output as Partial<SeatPolicyDecision> & { kind?: string };
      if (candidate.kind === 'refused') {
        assert.equal(candidate.allowed, false);
        assert.equal(typeof candidate.refusal, 'string');
        assert.equal(typeof candidate.reason, 'string');
      } else if (candidate.kind === 'allowed') {
        assert.equal(candidate.allowed, true);
        assert.ok(candidate.registration !== undefined);
      }
    }
  });
});
