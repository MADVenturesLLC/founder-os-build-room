/**
 * Seat Registry V1 — Schema, Vocabulary, and Contracts tests (C2).
 *
 * Implements tests 1, 2, 3, 6, 7, and 11 per r7 §9.1.
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
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  DISPLAY_NAMES,
  RATIFIED_SEATS,
  RESEARCHER_CONTRACT_SHA256,
  ARCHITECT_CONTRACT_SHA256,
  BUILDER_CONTRACT_SHA256,
  INDEPENDENT_REVIEWER_CONTRACT_SHA256,
  SEAT_IDS,
  SEAT_TERMINAL_STATUSES,
  isDisplayName,
  isSeatId,
  isTerminalStatusFor,
  toAttentionState,
  type AttentionState,
  type SeatId,
  type SeatRegistrationV1,
} from '../packages/seat-registry/src/index.js';

import { STATES } from '../packages/contracts/src/index.js';

const contractsDir = fileURLToPath(new URL('../../contracts/seats/', import.meta.url));
const roleRegistryFixturePath = fileURLToPath(
  new URL('../../packages/seat-registry/fixtures/role-registry.md', import.meta.url),
);

function sha256OfFile(filePath: string): string {
  const bytes = readFileSync(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

describe('Test 1 — Registry shape (r7 §9.1 test 1)', () => {
  it('RATIFIED_SEATS contains exactly the four canonical seats with set-equality', () => {
    assert.equal(RATIFIED_SEATS.length, 4, 'RATIFIED_SEATS has exactly four registrations');
    const ids = RATIFIED_SEATS.map((s) => s.seat_id);
    const expectedIds: SeatId[] = ['researcher', 'architect', 'builder', 'independent-reviewer'];
    assert.deepEqual(new Set(ids), new Set(expectedIds), 'RATIFIED_SEATS matches the four canonical seat IDs');
    assert.equal(new Set(ids).size, 4, 'each seat_id appears exactly once');
  });

  it('RATIFIED_SEATS is deep-frozen and mutation attempts are rejected', () => {
    assert.ok(Object.isFrozen(RATIFIED_SEATS), 'RATIFIED_SEATS array is frozen');
    for (const seat of RATIFIED_SEATS) {
      assert.ok(Object.isFrozen(seat), `seat ${seat.seat_id} is frozen`);
      assert.ok(Object.isFrozen(seat.authority), `seat ${seat.seat_id}.authority is frozen`);
      assert.ok(Object.isFrozen(seat.handoff), `seat ${seat.seat_id}.handoff is frozen`);
      assert.ok(Object.isFrozen(seat.routing), `seat ${seat.seat_id}.routing is frozen`);
      assert.ok(Object.isFrozen(seat.absent_lanes), `seat ${seat.seat_id}.absent_lanes is frozen`);

      // Verify runtime mutation throws in strict mode
      assert.throws(() => {
        // @ts-expect-error mutating frozen object
        seat.mission = 'tampered';
      }, /Cannot assign to read only property/);
    }
  });
});

describe('Test 2 — Display-name table (r7 §9.1 test 2)', () => {
  it('registration.display_name === DISPLAY_NAMES[seat_id] for all four seats', () => {
    for (const seat of RATIFIED_SEATS) {
      assert.equal(
        seat.display_name,
        DISPLAY_NAMES[seat.seat_id],
        `display_name for ${seat.seat_id} matches DISPLAY_NAMES mapping`,
      );
    }
  });

  it('the four display names are distinct and match the RESERVED ITEMS ruling', () => {
    const names = Object.values(DISPLAY_NAMES);
    assert.equal(names.length, 4);
    assert.equal(new Set(names).size, 4, 'all 4 display names are distinct');
    assert.equal(DISPLAY_NAMES['researcher'], 'Aletheia');
    assert.equal(DISPLAY_NAMES['architect'], 'Daedalus');
    assert.equal(DISPLAY_NAMES['builder'], 'Hephaestus');
    assert.equal(DISPLAY_NAMES['independent-reviewer'], 'Argus');
  });

  it('no display name appears as a seat_id, Role-Id, or Execution-Surface anywhere in the package', () => {
    for (const name of Object.values(DISPLAY_NAMES)) {
      assert.ok(!isSeatId(name), `${name} must not be a seat_id`);
      for (const seat of RATIFIED_SEATS) {
        assert.notEqual(seat.seat_id, name, `${name} must not be seat.seat_id`);
        for (const lane of seat.routing) {
          assert.notEqual(lane.surface_id, name, `${name} must not be a surface_id`);
        }
      }
    }
    assert.ok(isDisplayName('Aletheia'));
    assert.ok(isDisplayName('Daedalus'));
    assert.ok(isDisplayName('Hephaestus'));
    assert.ok(isDisplayName('Argus'));
    assert.ok(!isDisplayName('builder'));
  });
});

describe('Test 3 — Contract integrity (r7 §9.1 test 3)', () => {
  const contractPins: Record<SeatId, string> = {
    researcher: RESEARCHER_CONTRACT_SHA256,
    architect: ARCHITECT_CONTRACT_SHA256,
    builder: BUILDER_CONTRACT_SHA256,
    'independent-reviewer': INDEPENDENT_REVIEWER_CONTRACT_SHA256,
  };

  for (const seat of RATIFIED_SEATS) {
    it(`seat contract for ${seat.seat_id} exists, matches hash pin, and contains identity`, () => {
      const contractFile = `${contractsDir}${seat.seat_id}.md`;
      assert.ok(existsSync(contractFile), `contract file ${contractFile} must exist`);

      const actualHash = sha256OfFile(contractFile);
      assert.equal(
        actualHash,
        seat.contract_sha256,
        `recomputed hash for ${seat.seat_id} must equal registration.contract_sha256`,
      );
      assert.equal(
        actualHash,
        contractPins[seat.seat_id],
        `recomputed hash for ${seat.seat_id} must equal exported pin`,
      );

      const content = readFileSync(contractFile, 'utf8');
      assert.ok(
        content.includes(seat.seat_id),
        `contract for ${seat.seat_id} must contain seat_id ${seat.seat_id}`,
      );
      assert.ok(
        content.includes(seat.display_name),
        `contract for ${seat.seat_id} must contain display_name ${seat.display_name}`,
      );
      assert.ok(
        content.includes('Not a filesystem sandbox') || content.includes('not a filesystem sandbox'),
        `contract for ${seat.seat_id} must contain the "not a filesystem sandbox" clause`,
      );
    });
  }
});

describe('Test 6 — Registry membership (r7 §9.1 test 6)', () => {
  it('every seat_id is in the 30-role registry and in the assignable 29-role set', () => {
    const fixtureContent = readFileSync(roleRegistryFixturePath, 'utf8');
    // Extract role rows from markdown table: lines starting with `| role-id |`
    const roleTableRows = fixtureContent
      .split('\n')
      .filter((line) => line.trim().startsWith('|') && !line.includes('---') && !line.includes('role_id'))
      .map((line) => line.split('|')[1]?.trim())
      .filter((id): id is string => Boolean(id && id.length > 0));

    assert.equal(roleTableRows.length, 30, 'role-registry fixture defines exactly 30 roles');

    // Every V1 seat must be in the 30-role registry
    for (const seatId of SEAT_IDS) {
      assert.ok(
        roleTableRows.includes(seatId),
        `seat_id ${seatId} must be present in the 30-role registry fixture`,
      );
    }

    // Negative assertions per r7 test 6:
    // 1. operator (homonym that forced r3 placeholder) is NOT in the 30-role registry
    assert.ok(!roleTableRows.includes('operator'), 'operator is not in the 30-role registry');
    assert.ok(!isSeatId('operator'), 'operator is not a valid seat_id');

    // 2. founder (not a valid Role-Id under DEC-20260718-05)
    assert.ok(!roleTableRows.includes('founder'), 'founder is not a role_id in role-registry');
    assert.ok(!isSeatId('founder'), 'founder is not a valid seat_id');

    // 3. Hephaestus (display name, never authority identifier)
    assert.ok(!isSeatId('Hephaestus'), 'Hephaestus is not a valid seat_id');

    // 4. Any retired non-registry label (e.g. br-builder, br-researcher)
    assert.ok(!isSeatId('br-builder'), 'br-builder is not a valid seat_id');
    assert.ok(!isSeatId('br-researcher'), 'br-researcher is not a valid seat_id');
    assert.ok(!isSeatId('br-operator'), 'br-operator is not a valid seat_id');

    // 5. investment-acquisition-lead is in the registry's 30, but excluded from assignable 29 (activation_status: deferred)
    assert.ok(
      roleTableRows.includes('investment-acquisition-lead'),
      'investment-acquisition-lead is in the 30-role registry',
    );
    assert.ok(
      !isSeatId('investment-acquisition-lead'),
      'investment-acquisition-lead is deferred and cannot be a seat_id',
    );
  });
});

describe('Test 7 — Vocabulary namespace (r7 §9.1 test 7)', () => {
  it('no string in SEAT_TERMINAL_STATUSES collides with any ratified closed vocabulary', () => {
    const allSeatStatuses = Object.values(SEAT_TERMINAL_STATUSES).flat();

    // 1. DEC-20260815-11 lifecycle states (packages/contracts STATES)
    const lifecycleStates = new Set<string>(STATES);
    for (const status of allSeatStatuses) {
      assert.ok(
        !lifecycleStates.has(status),
        `status ${status} must not collide with lifecycle states`,
      );
    }

    // 2. Tier-2 verdict enum {PASS, PASS-WITH-ADVISORIES, FAIL} (DEC-20260826-01)
    const tier2Verdicts = new Set<string>(['PASS', 'PASS-WITH-ADVISORIES', 'FAIL']);
    for (const status of allSeatStatuses) {
      assert.ok(
        !tier2Verdicts.has(status),
        `status ${status} must not collide with Tier-2 verdict enum`,
      );
    }

    // 3. Command journal contract v0.17 §5 event vocabulary
    const journalEvents = new Set<string>([
      'journaled',
      'identity_bound',
      'dispatched',
      'completed',
      'failed',
      'unresolved',
      'resolved',
    ]);
    for (const status of allSeatStatuses) {
      assert.ok(
        !journalEvents.has(status),
        `status ${status} must not collide with contract §5 event vocabulary`,
      );
    }

    // 4. Council roster names (DEC-20260726-01): Augustus, Plato, Socrates, Turing, Marcus
    const councilNames = new Set<string>(['Augustus', 'Plato', 'Socrates', 'Turing', 'Marcus']);
    for (const status of allSeatStatuses) {
      assert.ok(
        !councilNames.has(status),
        `status ${status} must not collide with council roster names`,
      );
    }
  });
});

describe('Test 11 — toAttentionState (r7 §9.1 test 11)', () => {
  it('maps all SEAT_TERMINAL_STATUSES[seat] ∪ {null} into AttentionState for all four seats', () => {
    const validAttentionStates = new Set<AttentionState>(['working', 'blocked', 'done']);

    for (const seat of SEAT_IDS) {
      // null status always maps to 'working'
      const nullAttention = toAttentionState(seat, null);
      assert.equal(nullAttention, 'working', `null status for ${seat} maps to 'working'`);

      const statuses = SEAT_TERMINAL_STATUSES[seat];
      assert.ok(statuses.length > 0, `seat ${seat} has terminal statuses`);

      for (const status of statuses) {
        assert.ok(isTerminalStatusFor(seat, status));
        const attention = toAttentionState(seat, status);
        assert.ok(
          validAttentionStates.has(attention),
          `status ${status} for ${seat} maps to valid AttentionState ${attention}`,
        );

        // Specific semantic assertions:
        if (
          status === 'RESEARCH_READY' ||
          status === 'PLAN_READY_FOR_FOUNDER_APPROVAL' ||
          status === 'BUILD_READY_FOR_INDEPENDENT_VERIFICATION' ||
          status === 'SEAT_VERIFIED'
        ) {
          assert.equal(attention, 'done', `${status} must map to 'done'`);
        } else {
          assert.equal(attention, 'blocked', `${status} must map to 'blocked'`);
        }
      }
    }
  });

  it('rejects statuses outside the seat set with a RangeError', () => {
    assert.throws(
      () => toAttentionState('researcher', 'NOT_A_STATUS'),
      RangeError,
      'unknown status must throw RangeError',
    );
    // Cross-seat status rejection
    assert.throws(
      () => toAttentionState('researcher', 'BUILD_READY_FOR_INDEPENDENT_VERIFICATION'),
      RangeError,
      'builder status must throw when checked on researcher',
    );
    assert.throws(
      () => toAttentionState('builder', 'RESEARCH_READY'),
      RangeError,
      'researcher status must throw when checked on builder',
    );
    assert.throws(
      () => toAttentionState('independent-reviewer', 'PLAN_READY_FOR_FOUNDER_APPROVAL'),
      RangeError,
    );
  });
});
