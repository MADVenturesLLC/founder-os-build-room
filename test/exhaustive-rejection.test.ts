/**
 * AC#2 — Every transition not in the table is rejected, EXHAUSTIVELY, not by
 * sampling.
 *
 * The matrix is the full cartesian product: 17 states x 29 events = 493 pairs.
 * Each pair is applied to a ledger parked at that state, with facts permissive
 * enough that any guard the table permits will pass. A pair is expected to be
 * accepted if and only if it appears in the table.
 *
 * The expectation set is derived from `TRANSITIONS` by `acceptedPairs()` rather
 * than restated here, so the two cannot drift; AC#1's suite is what pins
 * `TRANSITIONS` itself to the decision's prose.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EVENTS, STATES } from '../packages/contracts/src/index.js';
import { acceptedPairs, apply } from '../packages/ledger/src/index.js';
import { ledgerAt, makeEvent } from './helpers.js';

describe('AC#2 — exhaustive transition rejection', () => {
  const accepted = acceptedPairs();

  it('covers the whole 17 x 29 matrix', () => {
    assert.equal(STATES.length * EVENTS.length, 493);
  });

  it('accepts exactly the table pairs and rejects every other pair', () => {
    const wronglyAccepted: string[] = [];
    const wronglyRejected: string[] = [];
    let checked = 0;

    for (const state of STATES) {
      for (const event of EVENTS) {
        checked += 1;
        const key = `${state}|${event}`;
        const result = apply(ledgerAt(state), makeEvent(event));
        const fired = result.ok && result.kind === 'transition';

        if (accepted.has(key) && !fired) {
          const detail = result.ok ? result.kind : `${result.code}: ${result.reason}`;
          wronglyRejected.push(`${key} -> ${detail}`);
        }
        if (!accepted.has(key) && fired) {
          wronglyAccepted.push(key);
        }
      }
    }

    assert.equal(checked, 493, 'the matrix was not walked exhaustively');
    assert.deepEqual(wronglyAccepted, [], 'transitions accepted that the table does not define');
    assert.deepEqual(wronglyRejected, [], 'table transitions that were rejected');
  });

  it('rejects every event from both terminal states', () => {
    for (const state of ['CLOSED_DELIVERED', 'CLOSED_ABANDONED'] as const) {
      for (const event of EVENTS) {
        const result = apply(ledgerAt(state), makeEvent(event));
        assert.equal(result.ok && result.kind === 'transition', false, `${state} accepted ${event}`);
        if (!result.ok) {
          assert.equal(result.code, 'terminal_state');
        }
      }
    }
  });

  it('rejects an event raised by an actor the event table does not authorize', () => {
    // `scope.captured` is the founder's; the gateway may not raise it.
    const result = apply(ledgerAt('ROOM_CREATED'), makeEvent('scope.captured', { actor: 'gateway' }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'actor_not_authorized');
    }
  });

  it('rejects an event whose attribution block is not shape-valid', () => {
    const result = apply(
      ledgerAt('ROOM_CREATED'),
      makeEvent('scope.captured', {
        // `Role-Id: founder` is invalid; direct-Founder work is Actor-Id alone.
        attribution: {
          roleId: 'founder' as never,
          actorId: 'founder',
          actualModel: 'n/a',
          executionSurface: 'claude-code',
        },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'attribution_invalid');
    }
  });

  it('rejects a table pair whose guard is not satisfied', () => {
    // T1 is in the table from ROOM_CREATED, but G1 needs base_sha == remote head.
    const result = apply(
      ledgerAt('ROOM_CREATED'),
      makeEvent('scope.captured', {
        facts: { repoInAllowlist: true, baseSha: 'stale', remoteHeadSha: 'live' },
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'guard_failed');
      assert.match(result.reason, /^G1 \(T1\)/);
    }
  });

  it('treats an absent fact as unsatisfied rather than as satisfied', () => {
    const result = apply(ledgerAt('ROOM_CREATED'), makeEvent('scope.captured', { facts: {} }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'guard_failed');
    }
  });
});
