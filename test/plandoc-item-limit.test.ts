/**
 * PlanDoc v1's list items run to 20,000 characters, and a refused plan names
 * the rules it broke without a word of its text
 * (FOUNDER-ACT-20261107-BR-PLANDOC-ITEM-LIMIT B2, B3 and B6).
 *
 * Rehearsal R2 of 2026-11-07: round 2's revised plan was complete and right
 * in every field but one, an implementation step of 4,808 characters against
 * a bound of 4,000, and the control plane refused the whole plan as
 * plan_invalid with no word of why. The bound for a list item is now a prose
 * section's, objective keeps 4,000, and judgeRoundPlan says why it refused,
 * holding only the schema's own names, codes, numbers and booleans.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { judgePlanDoc } from '../packages/control-plane/src/plan-doc.js';
import {
  PLAN_REFUSAL_VIOLATIONS_KEPT,
  UNDECLARED_KEY,
  consolePlannerLog,
  judgeRoundPlan,
  logPlanRefused,
  planDocRefusalReason,
  type PlannerLog,
  type PlannerWork,
  type RoundInputs,
  type RoundPlanVerdict,
} from '../packages/control-plane/src/planner-loop.js';
import { PLANDOC_SCHEMA_V1 } from '../packages/seat-output-schema/src/index.js';
import { planHash, type CanonicalDocument } from '../packages/journal/src/index.js';
import { plannerPrompt } from '../packages/gateway-daemon/src/index.js';
import type { PlannerWorkWire } from '../packages/gateway-protocol/src/index.js';
import { readyPlanFor } from './support/synthetic-planner.js';

const LISTS = ['acceptance_criteria', 'implementation_sequence', 'known_risks', 'unresolved_founder_decisions', 'plan_drift_stop_conditions'] as const;
const PROSE = [
  'current_state', 'constraints', 'non_goals', 'architecture_decision', 'alternatives_considered',
  'components_and_boundaries', 'interfaces_and_contracts', 'data_flow', 'trust_and_security_boundaries',
  'migration_and_compatibility', 'error_and_failure_behavior', 'observability', 'test_strategy', 'rollback_plan',
  'dependency_ordering',
] as const;

const SHA40 = 'a'.repeat(40);
const REPO = 'example-org/example-repo';
const WORK: PlannerWork = {
  commandId: 'cmd_planner_00000000000000000000000000000001',
  roomId: '00000000-0000-4000-8000-000000000001',
  repository: REPO,
  baseSha: SHA40,
  scopePaths: ['src', 'test'],
  goalEventId: 'evt_t1',
  goal: 'Add a health detail field to the status route.',
  goalDigest: `sha256:${'c'.repeat(64)}`,
};
const INPUTS: RoundInputs = { repository: REPO, baseSha: SHA40, scopePaths: ['src', 'test'], goalEventId: 'evt_t1', goal: WORK.goal, goalDigest: WORK.goalDigest };

const plan = (overrides: Record<string, unknown> = {}): Record<string, unknown> => readyPlanFor(WORK, overrides);
const refused = (verdict: RoundPlanVerdict): Extract<RoundPlanVerdict, { ok: false }> => {
  assert.equal(verdict.ok, false, 'the plan is refused');
  return verdict as Extract<RoundPlanVerdict, { ok: false }>;
};

describe('PlanDoc v1 bounds after the act', () => {
  it('lets every list item run to 20,000 characters and keeps objective at 4,000; nothing else moves', () => {
    for (const list of LISTS) {
      const schema = PLANDOC_SCHEMA_V1.properties[list];
      assert.ok(schema !== undefined && schema.type === 'array' && schema.items.type === 'string', list);
      assert.equal(schema.items.max_length, 20_000, list);
      assert.equal(schema.items.min_length, 1, list);
      assert.equal(schema.max_items, 200, list);
    }
    for (const section of PROSE) {
      const schema = PLANDOC_SCHEMA_V1.properties[section];
      assert.ok(schema !== undefined && schema.type === 'string', section);
      assert.equal(schema.max_length, 20_000, section);
    }
    const objective = PLANDOC_SCHEMA_V1.properties['objective'];
    assert.ok(objective !== undefined && objective.type === 'string');
    assert.equal(objective.max_length, 4_000);
  });

  it('accepts R2 round 2\'s 4,808-character step and an item of exactly 20,000, in every list; refuses 20,001', () => {
    for (const list of LISTS) {
      for (const length of [4_808, 20_000]) {
        const document = plan({ [list]: ['First item.', 'x'.repeat(length)] });
        const verdict = judgePlanDoc(document);
        assert.ok(verdict.ok && verdict.readyForDecision, `${list} ${length}`);
        assert.equal(judgeRoundPlan(document, INPUTS).ok, true, `${list} ${length} in the round`);
      }
      const over = refused(judgeRoundPlan(plan({ [list]: ['First item.', 'x'.repeat(20_001)] }), INPUTS));
      assert.equal(over.classification, 'plan_invalid');
      assert.deepEqual(over.reason, {
        kind: 'schema',
        violationCount: 1,
        violations: [{ code: 'length', path: `/${list}/1`, found: 20_001, bound: 20_000 }],
      }, list);
    }
  });

  it('still refuses an objective of 4,001 characters, and accepts 4,000', () => {
    assert.equal(judgeRoundPlan(plan({ objective: 'o'.repeat(4_000) }), INPUTS).ok, true);
    const over = refused(judgeRoundPlan(plan({ objective: 'o'.repeat(4_001) }), INPUTS));
    assert.deepEqual(over.reason, { kind: 'schema', violationCount: 1, violations: [{ code: 'length', path: '/objective', found: 4_001, bound: 4_000 }] });
  });

  it('keeps R2 round 1\'s plan valid, with its hash a659c6ed...', async () => {
    const document = JSON.parse(await readFile('test/fixtures/phase4-r2-round1-plan.json', 'utf8')) as Record<string, unknown>;
    const verdict = judgePlanDoc(document);
    assert.ok(verdict.ok && verdict.readyForDecision);
    assert.equal(verdict.planHash, 'a659c6ed95af407fd67a3b168ef7d7178c0987efc9c29f65f8481cb0279d1a49');
    assert.equal(planHash(document as unknown as CanonicalDocument), verdict.planHash);
  });

  it('tells the Planner the new bounds: the schema its prompt carries says 20,000 for list items and 4,000 for objective', () => {
    const work: PlannerWorkWire = {
      commandId: WORK.commandId,
      roomId: WORK.roomId,
      repository: 'MADVenturesLLC/example',
      baseSha: SHA40,
      scopePaths: ['src/health.ts'],
      goalEventId: '00000000-0000-4000-8000-000000000002',
      goal: 'Add an uptime field to the health route.',
      goalDigest: 'c'.repeat(64),
    };
    const lines = plannerPrompt(work).split('\n');
    const schemaLines = lines.filter((line) => line.startsWith('{') && line.includes('"schema_version"'));
    assert.equal(schemaLines.length, 1, 'the prompt carries the schema once, on its own line');
    const embedded = JSON.parse(schemaLines[0] as string) as { properties: Record<string, { max_length?: number; items?: { max_length?: number } }> };
    assert.deepEqual(embedded, JSON.parse(JSON.stringify(PLANDOC_SCHEMA_V1)), 'it is the schema the control plane judges with');
    for (const list of LISTS) assert.equal(embedded.properties[list]?.items?.max_length, 20_000, list);
    assert.equal(embedded.properties['objective']?.max_length, 4_000);
  });
});

describe('judgeRoundPlan: why a plan was refused', () => {
  it('a schema refusal: each violation\'s code and declared path, a length with what was found and the bound', () => {
    const verdict = refused(judgeRoundPlan(plan({
      implementation_sequence: ['Edit handler', 'y'.repeat(20_050)],
      acceptance_criteria: [],
      claims: { plan_approved: true, builder_authorized: false },
      terminal_status: 'NOT_A_STATUS',
      controlling_inputs: [{ path: 'research/packet.md', sha256: 'not-a-hash' }],
    }), INPUTS));
    assert.equal(verdict.classification, 'plan_invalid');
    assert.ok(verdict.reason.kind === 'schema');
    const byPath = new Map(verdict.reason.violations.map((v) => [v.path, v]));
    assert.deepEqual(byPath.get('/implementation_sequence/1'), { code: 'length', path: '/implementation_sequence/1', found: 20_050, bound: 20_000 });
    assert.deepEqual(byPath.get('/acceptance_criteria'), { code: 'length', path: '/acceptance_criteria', found: 0, bound: 1 }, 'too few items: the count and the minimum');
    assert.deepEqual(byPath.get('/claims/plan_approved'), { code: 'const_mismatch', path: '/claims/plan_approved' });
    assert.deepEqual(byPath.get('/terminal_status'), { code: 'enum_mismatch', path: '/terminal_status' });
    assert.deepEqual(byPath.get('/controlling_inputs/0/sha256'), { code: 'pattern_mismatch', path: '/controlling_inputs/0/sha256' });
    assert.equal(verdict.reason.violationCount, 5);
  });

  it('a key the schema does not declare is named only as <undeclared key> with its length, at any depth', () => {
    const document = plan({ revision_notes: 'what changed' });
    (document['controlling_inputs'] as Record<string, unknown>[])[0] = { path: 'research/packet.md', sha256: 'b'.repeat(64), note: 'x' };
    document['a/b/c'] = 'slashes';
    const verdict = refused(judgeRoundPlan(document, INPUTS));
    assert.ok(verdict.reason.kind === 'schema');
    assert.deepEqual(
      [...verdict.reason.violations].sort((a, b) => a.path.localeCompare(b.path) || (a.undeclaredKeyLength ?? 0) - (b.undeclaredKeyLength ?? 0)),
      [
        { code: 'additional_property', path: `/${UNDECLARED_KEY}`, undeclaredKeyLength: 5 },
        { code: 'additional_property', path: `/${UNDECLARED_KEY}`, undeclaredKeyLength: 14 },
        { code: 'additional_property', path: `/controlling_inputs/0/${UNDECLARED_KEY}`, undeclaredKeyLength: 4 },
      ],
    );
  });

  it('keeps the first 20 violations and counts them all', () => {
    const extra = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`extra_${i}`, 'x']));
    const verdict = refused(judgeRoundPlan(plan(extra), INPUTS));
    assert.ok(verdict.reason.kind === 'schema');
    assert.equal(verdict.reason.violationCount, 25);
    assert.equal(verdict.reason.violations.length, PLAN_REFUSAL_VIOLATIONS_KEPT);
    assert.equal(PLAN_REFUSAL_VIOLATIONS_KEPT, 20);
  });

  it('a scope-path refusal: the index; a plan not ready: its terminal_status; outside the captured scope: three booleans', () => {
    const unsorted = refused(judgeRoundPlan(plan({ scope_paths: ['src/b.ts', 'src/a.ts'] }), INPUTS));
    assert.deepEqual([unsorted.classification, unsorted.reason], ['plan_invalid', { kind: 'scope_path', index: 1 }]);
    const blocked = refused(judgeRoundPlan(plan({ terminal_status: 'BLOCKED_FOUNDER_DECISION' }), INPUTS));
    assert.deepEqual([blocked.classification, blocked.reason], ['plan_invalid', { kind: 'not_ready', terminalStatus: 'BLOCKED_FOUNDER_DECISION' }]);
    const cases: Array<[Record<string, unknown>, [boolean, boolean, boolean]]> = [
      [{ repository: 'example-org/other-repo' }, [false, true, true]],
      [{ base_sha: 'c'.repeat(40) }, [true, false, true]],
      [{ scope_paths: ['docs/readme.md'] }, [true, true, false]],
      [{ repository: 'example-org/other-repo', base_sha: 'c'.repeat(40), scope_paths: ['docs/readme.md'] }, [false, false, false]],
    ];
    for (const [overrides, [repositoryMatches, baseShaMatches, scopePathsWithin]] of cases) {
      const outside = refused(judgeRoundPlan(plan(overrides), INPUTS));
      assert.equal(outside.classification, 'plan_outside_captured_scope');
      assert.deepEqual(outside.reason, { kind: 'outside_captured_scope', repositoryMatches, baseShaMatches, scopePathsWithin }, JSON.stringify(overrides));
    }
  });

  it('an encoding refusal is the word alone, never the encoder\'s message', () => {
    assert.deepEqual(planDocRefusalReason({ ok: false, kind: 'encoding', reason: 'value has no canonical form at $.qz7canary' }, {}), { kind: 'encoding' });
    assert.deepEqual(planDocRefusalReason({ ok: false, kind: 'scope', index: 3, reason: 'qz7canary is not canonical' }, {}), { kind: 'scope_path', index: 3 });
  });

  it('an accepted plan has no reason, and verdicts are as before', () => {
    const accepted = judgeRoundPlan(plan(), INPUTS);
    assert.ok(accepted.ok);
    assert.equal(Object.keys(accepted).sort().join(','), 'ok,planHash');
  });
});

describe('the planner.plan_refused line holds no string the plan wrote', () => {
  const CANARY = 'qz7canary';
  /** Every string the plan writes carries the canary. */
  function seeded(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const document = plan();
    for (const key of ['work_id', 'objective', ...PROSE]) document[key] = `${CANARY} ${key}`;
    for (const list of LISTS) document[list] = [`${CANARY} ${list}`];
    document['controlling_inputs'] = [{ path: `${CANARY}/packet.md`, sha256: 'b'.repeat(64) }];
    document['scope_paths'] = [`src/${CANARY}.ts`];
    return { ...document, ...overrides };
  }
  const variants: Array<[string, Record<string, unknown>]> = [
    ['an item over the bound', { implementation_sequence: [`${CANARY} `.repeat(3_000)] }],
    ['an undeclared key', { [`${CANARY}_notes`]: `${CANARY} value` }],
    ['an undeclared key holding slashes', { [`${CANARY}/a/b`]: CANARY }],
    ['an undeclared key in an input', { controlling_inputs: [{ path: `${CANARY}/p.md`, sha256: 'b'.repeat(64), [CANARY]: CANARY }] }],
    ['a status that is not one', { terminal_status: CANARY }],
    ['a wrong type', { objective: { [CANARY]: CANARY } }],
    ['a list of the wrong type', { known_risks: CANARY }],
    ['a plan not ready', { terminal_status: 'BLOCKED_RESEARCH_GAP' }],
    ['scope paths out of order', { scope_paths: [`src/${CANARY}b.ts`, `src/${CANARY}a.ts`] }],
    ['another repository', { repository: `${CANARY}/repo` }],
    ['a path outside the scope', { scope_paths: [`${CANARY}/x.ts`] }],
  ];

  for (const [name, overrides] of variants) {
    it(name, () => {
      const verdict = refused(judgeRoundPlan(seeded(overrides), INPUTS));
      const lines: string[] = [];
      const log: PlannerLog = (level, at, fields) => lines.push(JSON.stringify({ level, at, ...fields }));
      logPlanRefused(log, 'room-1', 'cmd_planner_1', verdict);
      assert.equal(lines.length, 1);
      const line = JSON.parse(lines[0] as string) as Record<string, unknown>;
      assert.deepEqual([line['level'], line['at'], line['roomId'], line['commandId'], line['classification']], ['error', 'planner.plan_refused', 'room-1', 'cmd_planner_1', verdict.classification]);
      assert.deepEqual(line['reason'], JSON.parse(JSON.stringify(verdict.reason)));
      assert.doesNotMatch(lines[0] as string, /qz7canary/i, 'no string from the plan');
    });
  }

  it('the seeded plan itself is accepted, so each variant is refused for its own change only', () => {
    assert.equal(judgeRoundPlan(seeded(), { ...INPUTS, scopePaths: ['src'] }).ok, true);
  });
});

describe('logPlanRefused and the console log', () => {
  const verdict = refused(judgeRoundPlan(plan({ terminal_status: 'BLOCKED_FOUNDER_DECISION' }), INPUTS));

  it('a log that throws changes nothing', () => {
    assert.doesNotThrow(() => logPlanRefused(() => { throw new Error('the log is gone'); }, 'room-1', 'cmd_planner_1', verdict));
  });

  it('the default writes one JSON line on standard error, stamped', () => {
    const original = console.error;
    const written: unknown[][] = [];
    console.error = (...args: unknown[]) => { written.push(args); };
    try {
      logPlanRefused(consolePlannerLog, 'room-1', 'cmd_planner_1', verdict);
    } finally {
      console.error = original;
    }
    assert.equal(written.length, 1);
    const line = JSON.parse(String(written[0]?.[0])) as Record<string, unknown>;
    assert.equal(line['level'], 'error');
    assert.equal(line['at'], 'planner.plan_refused');
    assert.match(String(line['ts']), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.deepEqual(line['reason'], { kind: 'not_ready', terminalStatus: 'BLOCKED_FOUNDER_DECISION' });
  });
});
