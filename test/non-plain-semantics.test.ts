/**
 * AC#4 — Non-plain transition semantics correct.
 *
 * Source: `DEC-20260815-11` v0.10, the two `## Founder Ruling` sections plus
 * `## Founder Ruling — manual_required Blocks Resume`. These are the rows the
 * 17-state set alone does not resolve (T18-T22).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  NON_TERMINAL_STATES,
  STATES,
  TRANSITIONS,
  anyNonTerminalExcluding,
  range,
} from '../packages/contracts/src/index.js';
import { apply } from '../packages/ledger/src/index.js';
import { ledgerAt, makeEvent } from './helpers.js';

const spec = (id: string) => {
  const found = TRANSITIONS.find((t) => t.id === id);
  assert.ok(found, `${id} missing`);
  return found;
};

describe('AC#4 — T18 range is exactly 6 states under declaration order', () => {
  it('resolves {PUSHED..AUTHORIZED} to six states, in canonical order', () => {
    assert.deepEqual(
      [...spec('T18').from],
      ['PUSHED', 'IN_REVIEW', 'REMEDIATION', 'CHECKS_VERIFIED', 'AWAITING_FOUNDER_AUTH', 'AUTHORIZED'],
    );
    assert.equal(spec('T18').from.length, 6);
  });

  it('derives the range from declaration order rather than a second hard-coded list', () => {
    assert.deepEqual([...spec('T18').from], [...range('PUSHED', 'AUTHORIZED')]);
  });
});

describe('AC#4 — T19 and T22 exclude the current state', () => {
  it('bars the RECONCILING -> RECONCILING self-loop on T19', () => {
    assert.equal(spec('T19').from.includes('RECONCILING'), false);
    assert.equal(spec('T19').from.length, NON_TERMINAL_STATES.length - 1);
    assert.equal(spec('T19').from.length, 14);

    const result = apply(ledgerAt('RECONCILING'), makeEvent('recon.opened'));
    assert.equal(result.ok && result.kind === 'transition', false, 'T19 self-loop was permitted');
    if (!result.ok) assert.equal(result.code, 'state_not_in_from_set');
  });

  it('lets T19 fire from every other non-terminal state', () => {
    for (const state of anyNonTerminalExcluding('RECONCILING')) {
      const result = apply(ledgerAt(state), makeEvent('recon.opened'));
      assert.ok(result.ok && result.kind === 'transition', `T19 did not fire from ${state}`);
    }
  });

  it('excludes terminal states from T22, leaving all 15 non-terminal sources', () => {
    // For T22 the "excludes the current state" rule is vacuous — its target
    // CLOSED_ABANDONED is terminal and so was never in the non-terminal set.
    assert.equal(spec('T22').from.length, 15);
    assert.equal(spec('T22').from.includes('CLOSED_ABANDONED'), false);
    assert.equal(spec('T22').from.includes('CLOSED_DELIVERED'), false);
    assert.deepEqual([...spec('T22').from], [...anyNonTerminalExcluding('CLOSED_ABANDONED')]);
  });

  it('keeps the terminal set closed — no transition lists a terminal source', () => {
    for (const t of TRANSITIONS) {
      for (const from of t.from) {
        assert.ok(
          from !== 'CLOSED_DELIVERED' && from !== 'CLOSED_ABANDONED',
          `${t.id} leaves terminal state ${from}`,
        );
      }
    }
    assert.equal(STATES.length - NON_TERMINAL_STATES.length, 2);
  });
});

describe('AC#4 — RECONCILING stores prior_state on entry and resumes to it', () => {
  it('stores the state it came from when T19 fires', () => {
    const result = apply(ledgerAt('BUILDING', { priorState: null }), makeEvent('recon.opened'));
    assert.ok(result.ok && result.kind === 'transition');
    if (result.ok && result.kind === 'transition') {
      assert.equal(result.state.state, 'RECONCILING');
      assert.equal(result.state.priorState, 'BUILDING');
    }
  });

  it('resumes to the stored prior state on T20, then clears the slot', () => {
    const entered = apply(ledgerAt('CHECKS_VERIFIED', { priorState: null }), makeEvent('recon.opened'));
    assert.ok(entered.ok && entered.kind === 'transition');
    if (!(entered.ok && entered.kind === 'transition')) return;

    const resumed = apply(entered.state, makeEvent('recon.resumed'));
    assert.ok(resumed.ok && resumed.kind === 'transition');
    if (resumed.ok && resumed.kind === 'transition') {
      assert.equal(resumed.state.state, 'CHECKS_VERIFIED', 'did not resume to the stored prior state');
      assert.equal(resumed.state.priorState, null, 'prior_state slot was not cleared');
    }
  });

  it('uses a single slot — the self-loop bar is what makes that sufficient', () => {
    const entered = apply(ledgerAt('PLANNING', { priorState: null }), makeEvent('recon.opened'));
    assert.ok(entered.ok && entered.kind === 'transition');
    if (!(entered.ok && entered.kind === 'transition')) return;
    // A second T19 cannot fire from RECONCILING, so no second slot is needed.
    const again = apply(entered.state, makeEvent('recon.opened'));
    assert.equal(again.ok && again.kind === 'transition', false);
    assert.equal(entered.state.priorState, 'PLANNING');
  });

  it('rejects T20 when there is no stored prior state', () => {
    const result = apply(ledgerAt('RECONCILING', { priorState: null }), makeEvent('recon.resumed'));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /prior_state/);
  });
});

describe('AC#4 — manual_required is set by T21 and blocks T20', () => {
  it('sets the overlay without leaving RECONCILING', () => {
    const result = apply(ledgerAt('RECONCILING'), makeEvent('recon.exhausted'));
    assert.ok(result.ok && result.kind === 'transition');
    if (result.ok && result.kind === 'transition') {
      assert.equal(result.state.state, 'RECONCILING', 'an overlay flag changed the current state');
      assert.ok(result.state.overlays.includes('manual_required'));
    }
  });

  it('blocks T20 once set — fail closed', () => {
    const exhausted = apply(ledgerAt('RECONCILING'), makeEvent('recon.exhausted'));
    assert.ok(exhausted.ok && exhausted.kind === 'transition');
    if (!(exhausted.ok && exhausted.kind === 'transition')) return;

    const resume = apply(exhausted.state, makeEvent('recon.resumed'));
    assert.equal(resume.ok, false, 'T20 fired while manual_required was set');
    if (!resume.ok) {
      assert.equal(resume.code, 'guard_failed');
      assert.match(resume.reason, /manual_required is set/);
    }
  });

  it('leaves T22 (founder.cancel) as the only exit from that condition', () => {
    const exhausted = apply(ledgerAt('RECONCILING'), makeEvent('recon.exhausted'));
    assert.ok(exhausted.ok && exhausted.kind === 'transition');
    if (!(exhausted.ok && exhausted.kind === 'transition')) return;
    const stuck = exhausted.state;

    // Every event except founder.cancel must fail to move the room.
    for (const t of TRANSITIONS) {
      for (const trigger of t.triggers) {
        if (trigger === 'founder.cancel') continue;
        const result = apply(stuck, makeEvent(trigger));
        const moved = result.ok && result.kind === 'transition' && result.state.state !== 'RECONCILING';
        assert.equal(moved, false, `${trigger} escaped manual_required`);
      }
    }

    const cancelled = apply(stuck, makeEvent('founder.cancel'));
    assert.ok(cancelled.ok && cancelled.kind === 'transition');
    if (cancelled.ok && cancelled.kind === 'transition') {
      assert.equal(cancelled.state.state, 'CLOSED_ABANDONED');
    }
  });
});

describe('AC#4 — compound (AND) triggers hold until both members arrive', () => {
  it('parks T9 in conjunction_pending until pr.draft_created also arrives', () => {
    const clean = ledgerAt('EVIDENCE_CAPTURE', { observedCompanions: [] });
    const first = apply(clean, makeEvent('git.pushed'));
    assert.ok(first.ok && first.kind === 'conjunction_pending');
    if (first.ok && first.kind === 'conjunction_pending') {
      assert.deepEqual([...first.awaiting], ['pr.draft_created']);
      assert.equal(first.state.state, 'EVIDENCE_CAPTURE');
    }
    if (!first.ok) return;

    const second = apply(first.state, makeEvent('pr.draft_created'));
    assert.ok(second.ok && second.kind === 'transition');
    if (second.ok && second.kind === 'transition') {
      assert.equal(second.state.state, 'PUSHED');
      assert.deepEqual([...second.state.observedCompanions], []);
    }
  });

  it('parks T13 the same way until checks.verified also arrives', () => {
    const clean = ledgerAt('IN_REVIEW', { observedCompanions: [] });
    const first = apply(clean, makeEvent('review.passed'));
    assert.ok(first.ok && first.kind === 'conjunction_pending');
    if (!first.ok) return;
    const second = apply(first.state, makeEvent('checks.verified'));
    assert.ok(second.ok && second.kind === 'transition');
    if (second.ok && second.kind === 'transition') {
      assert.equal(second.state.state, 'CHECKS_VERIFIED');
    }
  });
});
