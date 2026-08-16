/**
 * AC#3 — The four core invariants (`DEC-20260815-11` v0.10 clause 3) each have
 * a failing test: a case that the ledger must reject, which would pass if the
 * invariant were not enforced.
 *
 *   INV-1  no MERGE_CONFIRMED without a consumed Founder authorization
 *   INV-2  SHA-stale verdicts rejected
 *   INV-3  push-voids cascade (T18 range verified)
 *   INV-4  replay idempotency
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { STATES, TRANSITIONS, range, type State } from '../packages/contracts/src/index.js';
import { apply, type LedgerState } from '../packages/ledger/src/index.js';
import { SHA, SHA_OLD, ledgerAt, makeEvent, PERMISSIVE_FACTS } from './helpers.js';

describe('AC#3 / INV-1 — no MERGE_CONFIRMED without a consumed Founder authorization', () => {
  it('rejects merge.confirmed when no authorization is on record', () => {
    const result = apply(ledgerAt('AUTHORIZED', { authorization: null }), makeEvent('merge.confirmed'));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'guard_failed');
      assert.match(result.reason, /no Founder authorization on record/);
    }
  });

  it('rejects merge.confirmed when the authorization was already consumed (single-use)', () => {
    const result = apply(
      ledgerAt('AUTHORIZED', {
        authorization: { authorizedSha: SHA, consumed: true, voided: false, round: 0 },
      }),
      makeEvent('merge.confirmed'),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /already consumed/);
  });

  it('rejects merge.confirmed when the authorization was voided by a push', () => {
    const result = apply(
      ledgerAt('AUTHORIZED', {
        authorization: { authorizedSha: SHA, consumed: false, voided: true, round: 0 },
      }),
      makeEvent('merge.confirmed'),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /voided/);
  });

  it('rejects merge.confirmed when the authorization is from a stale review round', () => {
    const result = apply(
      ledgerAt('AUTHORIZED', {
        round: 2,
        authorization: { authorizedSha: SHA, consumed: false, voided: false, round: 1 },
      }),
      makeEvent('merge.confirmed'),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /stale review round/);
  });

  it('consumes the authorization in the same step that reaches MERGE_CONFIRMED', () => {
    const result = apply(ledgerAt('AUTHORIZED'), makeEvent('merge.confirmed'));
    assert.ok(result.ok && result.kind === 'transition');
    if (result.ok && result.kind === 'transition') {
      assert.equal(result.state.state, 'MERGE_CONFIRMED');
      assert.equal(result.state.authorization?.consumed, true);
    }
  });

  it('reaches MERGE_CONFIRMED only via T16 — no other transition targets it', () => {
    const targeting = TRANSITIONS.filter(
      (t) => t.target.kind === 'state' && t.target.state === 'MERGE_CONFIRMED',
    ).map((t) => t.id);
    assert.deepEqual(targeting, ['T16']);
    for (const state of STATES) {
      if (state === 'AUTHORIZED') continue;
      for (const event of ['merge.confirmed'] as const) {
        const result = apply(ledgerAt(state), makeEvent(event));
        assert.equal(
          result.ok && result.kind === 'transition',
          false,
          `${state} reached MERGE_CONFIRMED outside T16`,
        );
      }
    }
  });

  it('rejects a second authorization while one is already outstanding (T15 single-use)', () => {
    const result = apply(
      ledgerAt('AWAITING_FOUNDER_AUTH', {
        authorization: { authorizedSha: SHA, consumed: false, voided: false, round: 0 },
      }),
      makeEvent('founder.authorization.granted'),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /already outstanding/);
  });
});

describe('AC#3 / INV-2 — SHA-stale verdicts rejected', () => {
  it('rejects review.opened when reviewed_sha is not the remote head (T10)', () => {
    const result = apply(
      ledgerAt('PUSHED'),
      makeEvent('review.opened', {
        facts: {
          ...PERMISSIVE_FACTS,
          reviewedSha: 'stale-sha',
          remoteHeadSha: 'live-sha',
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /reviewed_sha is stale/);
  });

  it('rejects review.passed when checks are green at a stale sha (T13)', () => {
    const result = apply(
      ledgerAt('IN_REVIEW'),
      makeEvent('review.passed', {
        facts: { ...PERMISSIVE_FACTS, checksGreenAtSha: 'old-sha', remoteHeadSha: 'live-sha' },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /checks green at a stale sha/);
  });

  it('rejects authorization when authorized_sha != head != reviewed_sha (T15)', () => {
    const result = apply(
      ledgerAt('AWAITING_FOUNDER_AUTH'),
      makeEvent('founder.authorization.granted', {
        facts: {
          ...PERMISSIVE_FACTS,
          authorizedSha: 'auth-sha',
          remoteHeadSha: 'head-sha',
          reviewedSha: 'reviewed-sha',
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /SHA-stale/);
  });

  it('rejects a merge whose merged head is not the authorized sha (T16)', () => {
    const result = apply(
      ledgerAt('AUTHORIZED'),
      makeEvent('merge.confirmed', { facts: { ...PERMISSIVE_FACTS, mergedHeadSha: 'other-sha' } }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /merged head != authorized_sha/);
  });
});

describe('AC#3 / INV-3 — push-voids cascade (T18)', () => {
  const t18Range = range('PUSHED', 'AUTHORIZED');

  it('spans exactly the six states PUSHED..AUTHORIZED under declaration order', () => {
    assert.deepEqual(
      [...t18Range],
      ['PUSHED', 'IN_REVIEW', 'REMEDIATION', 'CHECKS_VERIFIED', 'AWAITING_FOUNDER_AUTH', 'AUTHORIZED'],
    );
    assert.equal(t18Range.length, 6);
  });

  it('fires from every one of the six, landing in IN_REVIEW with the round incremented', () => {
    for (const state of t18Range) {
      const result = apply(ledgerAt(state), makeEvent('git.push.voided'));
      assert.ok(result.ok && result.kind === 'transition', `T18 did not fire from ${state}`);
      if (result.ok && result.kind === 'transition') {
        assert.equal(result.state.state, 'IN_REVIEW');
        assert.equal(result.state.round, 1);
      }
    }
  });

  it('excludes the states the ruling deliberately leaves out', () => {
    // EVIDENCE_CAPTURE (no review or auth yet), BLOCKED_ON_FOUNDER (none in
    // flight), MERGE_CONFIRMED (the merge already landed).
    for (const state of ['EVIDENCE_CAPTURE', 'BLOCKED_ON_FOUNDER', 'MERGE_CONFIRMED'] as State[]) {
      const result = apply(ledgerAt(state), makeEvent('git.push.voided'));
      assert.equal(result.ok && result.kind === 'transition', false, `T18 wrongly fired from ${state}`);
    }
  });

  it('voids a live authorization, retains the VOIDED record, and marks auth_voided', () => {
    const result = apply(ledgerAt('AUTHORIZED'), makeEvent('git.push.voided'));
    assert.ok(result.ok && result.kind === 'transition');
    if (result.ok && result.kind === 'transition') {
      assert.equal(result.state.authorization?.voided, true);
      assert.equal(result.state.voidedAuthorizations.length, 1);
      assert.ok(result.state.overlays.includes('auth_voided'));
      assert.equal(result.state.reviewedSha, null, 'stale review verdict survived the push');
    }
  });

  it('leaves a voided authorization unusable — the exact-SHA control fails closed', () => {
    const pushed = apply(ledgerAt('AUTHORIZED'), makeEvent('git.push.voided'));
    assert.ok(pushed.ok && pushed.kind === 'transition');
    if (pushed.ok && pushed.kind === 'transition') {
      // Park the voided-auth ledger back at AUTHORIZED and attempt the merge.
      const revived: LedgerState = { ...pushed.state, state: 'AUTHORIZED' };
      const merge = apply(revived, makeEvent('merge.confirmed'));
      assert.equal(merge.ok, false, 'a stale authorization survived a push');
    }
  });

  it('is unconditional — G18 passes with no facts asserted at all', () => {
    const result = apply(ledgerAt('IN_REVIEW'), makeEvent('git.push.voided', { facts: {} }));
    assert.ok(result.ok && result.kind === 'transition');
  });
});

describe('AC#3 / INV-4 — replay idempotency', () => {
  it('yields the same state and no second entry when the same event id is re-applied', () => {
    const start = ledgerAt('ROOM_CREATED');
    const event = makeEvent('scope.captured');

    const first = apply(start, event);
    assert.ok(first.ok && first.kind === 'transition');
    if (!(first.ok && first.kind === 'transition')) return;

    const second = apply(first.state, event);
    assert.ok(second.ok && second.kind === 'replay');
    if (second.ok && second.kind === 'replay') {
      assert.equal(second.state, first.state, 'replay produced a different state object');
      assert.equal(second.state.entries.length, 1, 'replay added a duplicate ledger entry');
      assert.equal(second.entry?.eventId, event.eventId);
    }
  });

  it('is idempotent under repeated replay, not just the second application', () => {
    let state = ledgerAt('ROOM_CREATED');
    const event = makeEvent('scope.captured');
    const applied = apply(state, event);
    assert.ok(applied.ok);
    if (applied.ok) state = applied.state;

    for (let i = 0; i < 5; i += 1) {
      const again = apply(state, event);
      assert.ok(again.ok && again.kind === 'replay');
      if (again.ok) state = again.state;
    }
    assert.equal(state.entries.length, 1);
    assert.equal(state.state, 'SCOPED');
  });

  it('does not re-validate a replayed event against changed facts', () => {
    // A replay must be identity-based. If it re-ran the guard with the facts
    // now supplied, this would reject instead of replaying.
    const start = ledgerAt('ROOM_CREATED');
    const event = makeEvent('scope.captured');
    const first = apply(start, event);
    assert.ok(first.ok && first.kind === 'transition');
    if (!(first.ok && first.kind === 'transition')) return;

    const replayWithBrokenFacts = apply(first.state, {
      ...event,
      facts: { repoInAllowlist: false, baseSha: 'x', remoteHeadSha: 'y' },
    });
    assert.ok(replayWithBrokenFacts.ok && replayWithBrokenFacts.kind === 'replay');
  });

  it('keeps distinct event ids distinct — idempotency is not deduplication by content', () => {
    const start = ledgerAt('BUILDING', { headSha: SHA_OLD });
    const a = apply(start, makeEvent('decision.requested'));
    assert.ok(a.ok && a.kind === 'transition');
    if (!(a.ok && a.kind === 'transition')) return;
    const back = apply(a.state, makeEvent('decision.answered'));
    assert.ok(back.ok && back.kind === 'transition');
    if (back.ok && back.kind === 'transition') {
      assert.equal(back.state.entries.length, 2);
    }
  });
});
