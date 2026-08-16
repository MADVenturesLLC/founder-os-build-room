/**
 * AC#6 — Every accepted transition records role, actual model, execution
 * surface, scope, evidence, and resulting state in the event structure.
 *
 * Source: `DEC-20260815-11` v0.10 `## Context`, restating architecture §3.8;
 * `DEC-20260815-18` adopts the FounderOS attribution vocabulary.
 *
 * The check runs over EVERY accepted (state, event) pair the table defines, not
 * a sample, so a transition that forgets to carry the record fails here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENTS,
  ROLE_IDS,
  STATES,
  isRoleId,
  isAttributionShapeValid,
} from '../packages/contracts/src/index.js';
import { acceptedPairs, apply } from '../packages/ledger/src/index.js';
import { ledgerAt, makeEvent, ATTRIBUTION, SCOPE, EVIDENCE } from './helpers.js';

describe('AC#6 — the attributed record on every accepted transition', () => {
  it('records all six required fields on every accepted (state, event) pair', () => {
    const accepted = acceptedPairs();
    const missing: string[] = [];
    let fired = 0;

    for (const state of STATES) {
      for (const event of EVENTS) {
        if (!accepted.has(`${state}|${event}`)) continue;
        const result = apply(ledgerAt(state), makeEvent(event));
        if (!(result.ok && result.kind === 'transition')) continue;
        fired += 1;
        const entry = result.entry;
        const where = `${state}|${event} (${entry.transition})`;

        // 1 — accountable role.
        //
        // The check is "shape-valid attribution", NOT "non-null roleId".
        // Direct-Founder work carries `roleId: null` with `actorId: 'founder'`,
        // because `Role-Id: founder` is invalid under DEC-20260718-05 and the
        // actor trailer stands alone. Requiring a non-null role here would
        // reject a legitimately attributed founder-raised event — it passed
        // only because this fixture always sets `builder`, which is fixture
        // shape, not a property of the ledger.
        if (!isAttributionShapeValid(entry.attribution)) {
          missing.push(`${where}: attribution`);
        }
        // 2 — the model that ACTUALLY performed the work
        if (!entry.attribution.actualModel) missing.push(`${where}: actualModel`);
        // 3 — execution surface
        if (!entry.attribution.executionSurface) missing.push(`${where}: executionSurface`);
        // 4 — scope
        if (!entry.scope?.roomId || !entry.scope.repo || entry.scope.paths.length === 0) {
          missing.push(`${where}: scope`);
        }
        // 5 — evidence
        if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
          missing.push(`${where}: evidence`);
        }
        // 6 — resulting state
        if (!entry.resultingState || entry.resultingState !== result.state.state) {
          missing.push(`${where}: resultingState`);
        }
      }
    }

    // Pinned, not just `> 0`: the table defines 61 accepted (state, event)
    // pairs, so a silent drop in coverage fails here instead of passing on a
    // smaller set.
    assert.equal(fired, accepted.size, 'not every accepted pair produced a transition');
    assert.equal(fired, 61);
    assert.deepEqual(missing, [], 'accepted transitions with an incomplete attribution record');
  });

  it('accepts a founder-raised event carrying direct-Founder attribution', () => {
    // The fixture always sets `roleId: 'builder'`, which is why the completeness
    // check above used to pass while silently rejecting the direct-Founder
    // shape. This drives the real thing end to end so the loosened assertion is
    // backed by a case that exercises it. Found by CodeRabbit on PR #1.
    const direct = {
      roleId: null,
      actorId: 'founder',
      actualModel: 'n/a',
      executionSurface: 'claude-code',
    } as const;

    const result = apply(
      ledgerAt('ROOM_CREATED'),
      makeEvent('scope.captured', { attribution: direct }),
    );
    assert.ok(result.ok && result.kind === 'transition', 'direct-Founder work was rejected');
    if (result.ok && result.kind === 'transition') {
      assert.equal(result.entry.attribution.roleId, null);
      assert.equal(result.entry.attribution.actorId, 'founder');
      assert.equal(result.entry.resultingState, 'SCOPED');
    }
  });

  it('still rejects a null role whose actor is not the founder', () => {
    const result = apply(
      ledgerAt('ROOM_CREATED'),
      makeEvent('scope.captured', {
        attribution: {
          roleId: null,
          actorId: 'session:someone',
          actualModel: 'm',
          executionSurface: 'claude-code',
        },
      }),
    );
    assert.equal(result.ok, false, 'a roleless non-founder attribution was accepted');
    if (!result.ok) assert.equal(result.code, 'attribution_invalid');
  });

  it('also records the transition and guard that admitted the event', () => {
    const result = apply(ledgerAt('ROOM_CREATED'), makeEvent('scope.captured'));
    assert.ok(result.ok && result.kind === 'transition');
    if (result.ok && result.kind === 'transition') {
      assert.equal(result.entry.transition, 'T1');
      assert.equal(result.entry.guard, 'G1');
      assert.equal(result.entry.fromState, 'ROOM_CREATED');
      assert.equal(result.entry.resultingState, 'SCOPED');
      assert.equal(result.entry.seq, 1);
      assert.equal(result.entry.occurredAt, '2026-08-16T00:00:00.000Z');
    }
  });

  it('carries the caller-supplied timestamp rather than reading a clock', () => {
    const result = apply(
      ledgerAt('ROOM_CREATED'),
      makeEvent('scope.captured', { occurredAt: '2001-01-01T00:00:00.000Z' }),
    );
    assert.ok(result.ok && result.kind === 'transition');
    if (result.ok && result.kind === 'transition') {
      assert.equal(result.entry.occurredAt, '2001-01-01T00:00:00.000Z');
    }
  });

  it('numbers entries monotonically from 1', () => {
    let state = ledgerAt('ROOM_CREATED');
    const first = apply(state, makeEvent('scope.captured'));
    assert.ok(first.ok && first.kind === 'transition');
    if (!(first.ok && first.kind === 'transition')) return;
    state = first.state;
    const second = apply(state, makeEvent('task.dispatched.planner'));
    assert.ok(second.ok && second.kind === 'transition');
    if (second.ok && second.kind === 'transition') {
      assert.deepEqual(second.state.entries.map((e) => e.seq), [1, 2]);
    }
  });
});

describe('AC#6 — attribution shape rules match the adopted convention', () => {
  it('accepts the 29-role roster', () => {
    assert.equal(ROLE_IDS.length, 29);
    for (const role of ROLE_IDS) {
      assert.ok(isAttributionShapeValid({ ...ATTRIBUTION, roleId: role }));
    }
  });

  it('rejects the activation-deferred role, matching the gate script exactly', () => {
    // `investment-acquisition-lead` is ratified as to its authority boundary
    // but is `activation_status: deferred` (DEC-20260812-03). Excluding it is
    // the enforcement of that invariant, not an omission.
    assert.equal(isRoleId('investment-acquisition-lead'), false);
  });

  it('rejects `founder` as a Role-Id but accepts direct-Founder work', () => {
    assert.equal(isRoleId('founder'), false);
    assert.ok(
      isAttributionShapeValid({
        roleId: null,
        actorId: 'founder',
        actualModel: 'n/a',
        executionSurface: 'claude-code',
      }),
    );
    // A null role with a non-founder actor is not direct-Founder work.
    assert.equal(
      isAttributionShapeValid({
        roleId: null,
        actorId: 'session:x',
        actualModel: 'm',
        executionSurface: 's',
      }),
      false,
    );
  });

  it('requires a non-empty actual model and execution surface', () => {
    assert.equal(isAttributionShapeValid({ ...ATTRIBUTION, actualModel: '  ' }), false);
    assert.equal(isAttributionShapeValid({ ...ATTRIBUTION, executionSurface: '' }), false);
    assert.equal(isAttributionShapeValid({ ...ATTRIBUTION, actorId: '' }), false);
  });

  it('keeps scope and evidence opaque to the pure core but structurally required', () => {
    assert.ok(SCOPE.paths.length > 0);
    assert.ok(EVIDENCE.every((e) => e.kind && e.ref && e.digest));
  });
});
