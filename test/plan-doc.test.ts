/**
 * PlanDoc v1, canonical scope paths, and the control plane's plan judgement.
 *
 * The facts G3 and G5 need (schema valid, plan_hash computed, scope paths
 * canonical) come from `judgePlanDoc`, never from a caller. These tests pin
 * what makes a plan approvable and what makes its hash.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SCOPE_PATHS,
  checkScopePaths,
  isCanonicalScopePaths,
  scopePathDefect,
} from '../packages/contracts/src/index.js';
import {
  PLANDOC_SCHEMA_V1,
  PLAN_TERMINAL_STATUSES,
  checkSchema,
  type PlanDocV1,
} from '../packages/seat-output-schema/src/index.js';
import { judgePlanDoc } from '../packages/control-plane/src/plan-doc.js';

const SHA40 = 'a'.repeat(40);
const SHA64 = 'b'.repeat(64);

function plan(overrides: Record<string, unknown> = {}): PlanDocV1 {
  return {
    schema_version: 'plandoc/1',
    work_id: 'W-1',
    objective: 'Add a health detail field.',
    terminal_status: 'PLAN_READY_FOR_FOUNDER_APPROVAL',
    controlling_inputs: [{ path: 'research/packet.md', sha256: SHA64 }],
    repository: 'MADVenturesLLC/example',
    base_sha: SHA40,
    scope_paths: ['src/health.ts', 'test/health.test.ts'],
    current_state: 'Health answers status only.',
    constraints: 'No new dependency.',
    non_goals: 'No UI.',
    architecture_decision: 'Extend the existing handler.',
    alternatives_considered: 'A new route; rejected as wider.',
    components_and_boundaries: 'The health handler only.',
    interfaces_and_contracts: 'Response gains one field.',
    data_flow: 'Read uptime, return it.',
    trust_and_security_boundaries: 'Public route; no secrets.',
    migration_and_compatibility: 'Additive.',
    error_and_failure_behavior: 'Unchanged.',
    observability: 'None added.',
    test_strategy: 'One unit test.',
    rollback_plan: 'Revert the commit.',
    dependency_ordering: 'None.',
    acceptance_criteria: ['The field is present.'],
    implementation_sequence: ['Edit handler', 'Add test'],
    known_risks: [],
    unresolved_founder_decisions: [],
    plan_drift_stop_conditions: ['Base moved'],
    next_role: 'founder_approval',
    claims: { plan_approved: false, builder_authorized: false },
    ...overrides,
  } as PlanDocV1;
}

describe('canonical scope paths', () => {
  it('accepts sorted, unique, repository-relative paths', () => {
    assert.equal(isCanonicalScopePaths(['a', 'a/b.ts', 'b']), true);
  });

  for (const [path, why] of [
    ['', 'empty path'],
    ['/etc/passwd', 'absolute path'],
    ['src/', 'trailing slash'],
    ['src//a', 'empty segment'],
    ['./a', '"." segment'],
    ['a/../b', '".." segment'],
    ['src/*.ts', 'contains a glob, backslash or control character'],
    ['src\\a', 'contains a glob, backslash or control character'],
    ['a\u0000b', 'contains a glob, backslash or control character'],
  ] as const) {
    it(`refuses ${JSON.stringify(path)}: ${why}`, () => {
      assert.equal(scopePathDefect(path), why);
      assert.equal(isCanonicalScopePaths([path]), false);
    });
  }

  it('refuses an unsorted list and a duplicate, without rewriting either', () => {
    assert.deepEqual(checkScopePaths(['b', 'a']), {
      ok: false,
      index: 1,
      reason: 'not strictly ascending (unsorted or duplicate)',
    });
    assert.equal(isCanonicalScopePaths(['a', 'a']), false);
  });

  it('refuses an empty list and an oversized one', () => {
    assert.equal(isCanonicalScopePaths([]), false);
    const many = Array.from({ length: MAX_SCOPE_PATHS + 1 }, (_, i) => `f${String(i).padStart(5, '0')}`);
    assert.equal(isCanonicalScopePaths(many), false);
  });
});

describe('PlanDoc v1 schema', () => {
  it('is a well-formed schema in the closed language', () => {
    assert.deepEqual(checkSchema(PLANDOC_SCHEMA_V1), []);
  });

  it('lists the architect contract terminal statuses exactly', () => {
    assert.deepEqual(
      [...PLAN_TERMINAL_STATUSES],
      [
        'PLAN_READY_FOR_FOUNDER_APPROVAL',
        'BLOCKED_RESEARCH_GAP',
        'BLOCKED_REPOSITORY_DRIFT',
        'BLOCKED_FOUNDER_DECISION',
        'INCONCLUSIVE_ARCHITECTURE',
      ],
    );
  });
});

describe('judgePlanDoc', () => {
  it('accepts a complete plan, computes its hash, and marks it ready for decision', () => {
    const verdict = judgePlanDoc(plan());
    assert.equal(verdict.ok, true);
    if (!verdict.ok) return;
    assert.match(verdict.planHash, /^[0-9a-f]{64}$/);
    assert.equal(verdict.readyForDecision, true);
  });

  it('gives the same document the same hash, whatever its key order', () => {
    const a = judgePlanDoc(plan());
    const reordered = Object.fromEntries(Object.entries(plan()).reverse());
    const b = judgePlanDoc(reordered);
    assert.ok(a.ok && b.ok);
    if (a.ok && b.ok) assert.equal(a.planHash, b.planHash);
  });

  it('changes the hash when any content changes', () => {
    const base = judgePlanDoc(plan());
    const changed = judgePlanDoc(plan({ scope_paths: ['src/health.ts'] }));
    assert.ok(base.ok && changed.ok);
    if (base.ok && changed.ok) assert.notEqual(base.planHash, changed.planHash);
  });

  it('accepts a blocked plan but does not mark it ready for decision', () => {
    const verdict = judgePlanDoc(plan({ terminal_status: 'BLOCKED_FOUNDER_DECISION' }));
    assert.equal(verdict.ok, true);
    if (verdict.ok) assert.equal(verdict.readyForDecision, false);
  });

  it('refuses a plan that claims it was approved or authorizes the Builder', () => {
    for (const claims of [
      { plan_approved: true, builder_authorized: false },
      { plan_approved: false, builder_authorized: true },
    ]) {
      const verdict = judgePlanDoc(plan({ claims }));
      assert.equal(verdict.ok, false);
      if (!verdict.ok) assert.equal(verdict.kind, 'schema');
    }
  });

  it('refuses an unlisted key and a missing section, with no hash', () => {
    const extra = judgePlanDoc(plan({ approved_by: 'founder' }));
    assert.equal(extra.ok, false);
    const missing: Record<string, unknown> = { ...plan() };
    delete missing['rollback_plan'];
    const short = judgePlanDoc(missing);
    assert.equal(short.ok, false);
    if (!short.ok) assert.equal(short.kind, 'schema');
  });

  it('refuses non-canonical scope paths after the schema passes', () => {
    const verdict = judgePlanDoc(plan({ scope_paths: ['test/health.test.ts', 'src/health.ts'] }));
    assert.deepEqual(verdict, {
      ok: false,
      kind: 'scope',
      index: 1,
      reason: 'not strictly ascending (unsorted or duplicate)',
    });
  });

  it('refuses a document that is not a plan at all', () => {
    for (const value of [null, 'plan', [], 42]) {
      const verdict = judgePlanDoc(value);
      assert.equal(verdict.ok, false);
    }
  });
});
