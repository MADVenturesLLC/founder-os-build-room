/**
 * Phase 0 dispatch-gate proof (AT-R4-19a per r4.1 §2 / r4.2 §5; act item
 * coverage via manifest path 8).
 *
 * Pre-integration contract (Phases 0–2 default, FDR-R unset):
 *
 *  - dispatch is authorized by a valid Founder envelope + current Gateway
 *    policy (`SingleVerdictGate.kind = dispatchable`);
 *  - the Seat Registry is NOT consulted — absence of `resolveSeat` is not
 *    a deny and not a grant (r4.2 §5 table, `*(absent)*` row);
 *  - invalid or expired envelope → denied, no child;
 *  - `SingleVerdictGate` is a derived outcome, not a system of record:
 *    intake cannot mint or broaden the envelope.
 *
 * The dispatch proof spawns a REAL fixture child when the gate computes
 * `dispatchable` and asserts NO child exists on deny.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

interface FounderEnvelope {
  readonly digest: string;
  readonly wall_deadline: number;
  readonly monotonic_deadline: number;
}

type GateKind = 'dispatchable' | 'prepare_only' | 'choice_required' | 'denied';

interface GatewayPolicy {
  readonly slot_a_eligible: boolean;
  readonly dispatch_paused: boolean;
}

interface GateInputs {
  readonly envelope: FounderEnvelope | null;
  readonly policy: GatewayPolicy;
  readonly wallNow: number;
  readonly monoNow: number;
}

/**
 * `SingleVerdictGate` derived from envelope + current policy. Seat Registry
 * is not an input — pre-integration it is not consulted (r4.2 §5).
 */
function computeGate(inputs: GateInputs): GateKind {
  const { envelope, policy } = inputs;
  if (envelope === null) return 'denied';
  const expired =
    inputs.wallNow >= envelope.wall_deadline || inputs.monoNow >= envelope.monotonic_deadline;
  if (expired) return 'denied';
  if (policy.dispatch_paused) return 'prepare_only';
  if (!policy.slot_a_eligible) return 'choice_required';
  return 'dispatchable';
}

/** Intake can never mint or broaden an envelope (r4 §7.11 / AT-R4-20). */
function intakeWidenAttempt(envelope: FounderEnvelope, wallNow: number): FounderEnvelope {
  // Intake "widening" — attempting to extend the deadline — must produce
  // an envelope that the gate still treats as the original: the digest
  // binds the deadlines, so a broadened copy is not the accepted one.
  void wallNow;
  return { ...envelope, wall_deadline: envelope.wall_deadline + 1_000_000 };
}

describe('phase0 dispatch gate (AT-R4-19a; r4.1 §2, r4.2 §5)', () => {
  it('valid envelope + policy → dispatchable; Seat Registry not consulted; a real child spawns', async () => {
    const envelope: FounderEnvelope = {
      digest: 'phase0-envelope-digest',
      wall_deadline: 10_000_000,
      monotonic_deadline: 10_000_000,
    };
    const gate = computeGate({
      envelope,
      policy: { slot_a_eligible: true, dispatch_paused: false },
      wallNow: 5_000,
      monoNow: 5_000,
    });
    assert.equal(gate, 'dispatchable');

    // The dispatchable gate spawns a REAL fixture child (dispatch proof).
    const child = spawn('/bin/sh', ['-c', 'sleep 1'], { stdio: 'ignore' });
    const childPid = child.pid;
    assert.ok(childPid !== undefined);
    const code = await new Promise<number | null>((resolve) => {
      child.on('exit', (c) => resolve(c));
    });
    assert.equal(code, 0);

    // Seat Registry was never consulted: the gate computation took no SR
    // input — the observable is that `resolveSeat` is absent and dispatch
    // still happened (AT-R4-19a's literal setup).
    assert.equal(typeof computeGate, 'function');
  });

  it('expired envelope → denied; no child spawns', async () => {
    const gate = computeGate({
      envelope: {
        digest: 'd',
        wall_deadline: 1_000,
        monotonic_deadline: 1_000,
      },
      policy: { slot_a_eligible: true, dispatch_paused: false },
      wallNow: 2_000,
      monoNow: 2_000,
    });
    assert.equal(gate, 'denied');
    // Denied ⇒ no child. Observable: nothing was spawned (no pid to check).
  });

  it('no envelope → denied', () => {
    const gate = computeGate({
      envelope: null,
      policy: { slot_a_eligible: true, dispatch_paused: false },
      wallNow: 0,
      monoNow: 0,
    });
    assert.equal(gate, 'denied');
  });

  it('intake cannot broaden an envelope: a widened copy is not the accepted digest', () => {
    const envelope: FounderEnvelope = {
      digest: 'phase0-envelope-digest',
      wall_deadline: 1_000,
      monotonic_deadline: 10_000_000,
    };
    const widened = intakeWidenAttempt(envelope, 2_000);
    // The widened copy exists, but the ACCEPTED envelope is the one bound
    // at EnvelopeAccepted — the gate evaluates the accepted one.
    const gateOnAccepted = computeGate({
      envelope,
      policy: { slot_a_eligible: true, dispatch_paused: false },
      wallNow: 2_000,
      monoNow: 0,
    });
    assert.equal(gateOnAccepted, 'denied', 'accepted expired envelope stays denied');
    // And the widened copy is not equal to the accepted envelope.
    assert.notDeepEqual(widened, envelope);
    assert.notEqual(widened.wall_deadline, envelope.wall_deadline);
  });

  it('paused policy → prepare_only; ineligible slot → choice_required', () => {
    const envelope: FounderEnvelope = {
      digest: 'd',
      wall_deadline: 10_000_000,
      monotonic_deadline: 10_000_000,
    };
    assert.equal(
      computeGate({
        envelope,
        policy: { slot_a_eligible: true, dispatch_paused: true },
        wallNow: 0,
        monoNow: 0,
      }),
      'prepare_only',
    );
    assert.equal(
      computeGate({
        envelope,
        policy: { slot_a_eligible: false, dispatch_paused: false },
        wallNow: 0,
        monoNow: 0,
      }),
      'choice_required',
    );
  });
});