/**
 * FOUNDER-ACT-20261111-BR-PLANNER-REASK, B11 (a), (c), (d) and (e): the wire of
 * the Gateway's failure reason and of a round's one corrective re-ask, the
 * re-ask a failure earns, the re-ask's prompt lines, how the Gateway reports
 * a run that ended without a plan, and the run unit's reading of a re-asked
 * round. B11 (b), the control plane against PostgreSQL, is in
 * planner-reask.storage.test.ts.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_PLANNER_PAYLOAD_BYTES,
  PLANNER_FAILURE_REASONS,
  PLANNER_REASK_PATH_MAX,
  PLANNER_REASK_VIOLATIONS_MAX,
  REASKED_FAILURE_REASONS,
  isPlannerReask,
  validatePlannerReportPayload,
  validatePlannerRequest,
  type PlannerIdentityWire,
  type PlannerReaskViolationCode,
  type PlannerReaskWire,
  type PlannerResultWire,
  type PlannerRouteWire,
  type PlannerWorkWire,
} from '../packages/gateway-protocol/src/index.js';
import type { ViolationCode } from '../packages/seat-output-schema/src/index.js';
import {
  PLAN_REFUSAL_VIOLATIONS_KEPT,
  judgeRoundPlan,
  plannerCommandIdFor,
  reaskFor,
  refusedPlanHash,
  type RoundInputs,
} from '../packages/control-plane/src/planner-loop.js';
import { founderGoalDigest } from '../packages/control-plane/src/founder-goal.js';
import { GatewayPlannerChannel, createSystemClock } from '../packages/control-plane/src/gateway/index.js';
import type { PlannerWork } from '../packages/control-plane/src/planner-loop.js';
import { planHash, type CanonicalDocument } from '../packages/journal/src/index.js';
import {
  AGY_PLANNER_ROUTE,
  AgyPlannerExecutor,
  GatewayPlannerWorker,
  PlannerRecordStore,
  plannerPrompt,
  type Launch,
  type PlannerExecutor,
  type PlannerStart,
} from '../packages/gateway-daemon/src/index.js';
import { PlannerRunEndedWithoutPlanError } from '../packages/gateway-daemon/src/planner-worker.js';
import {
  PHASE4_DISPATCHER,
  evaluatePhase4Run,
  type Phase4RecordedEvent,
  type Phase4RunRecord,
  type Phase4RunSet,
} from '../packages/run-harness/src/phase4/index.js';
import { readyPlanFor, SYNTHETIC_ROUTE } from './support/synthetic-planner.js';
import { uuid } from './gateway-helpers.js';

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function temporary(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function work(overrides: Partial<PlannerWorkWire> = {}): PlannerWorkWire {
  return {
    commandId: 'cmd_planner_00000000000000000000000000000001',
    roomId: '00000000-0000-4000-8000-000000000001',
    repository: 'example-org/example-repo',
    baseSha: 'a'.repeat(40),
    scopePaths: ['src/health.ts', 'test/health.test.ts'],
    goalEventId: 'evt_t1',
    goal: 'Add an uptime field to the health route.',
    goalDigest: 'c'.repeat(64),
    ...overrides,
  };
}

const REFUSED_PLAN: Record<string, unknown> = { ...readyPlanFor(work() as never), objective: 7 };

const SCHEMA_REASK: PlannerReaskWire = {
  refused: 'plan_invalid',
  reason: {
    kind: 'schema',
    violationCount: 23,
    violations: [
      { code: 'pattern_mismatch', path: '/controlling_inputs/0/sha256' },
      { code: 'length', path: '/implementation_sequence/1', found: 4808, bound: 4000 },
      { code: 'additional_property', path: '/<undeclared key>', undeclaredKeyLength: 5 },
      { code: 'type_mismatch', path: '' },
      { code: 'required_missing', path: '<unresolved path>' },
    ],
  },
  refusedPlan: REFUSED_PLAN,
};

const execute = (w: PlannerWorkWire): Record<string, unknown> => ({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: 'exec-1', work: w });
const finished = (result: unknown): Record<string, unknown> => ({
  kind: 'finished',
  executionId: 'exec-1',
  observed: { provider: 'google', model: 'gemini-4-argon', executionSurface: 'antigravity' },
  result,
});

/* ---------------- (a) the wire ---------------- */

describe('the re-ask act · the wire (B2, B3; B11(a))', () => {
  it('holds the violation codes and their bound equal to the control plane\'s', () => {
    type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const codesMatch: Same<ViolationCode, PlannerReaskViolationCode> = true;
    assert.equal(codesMatch, true);
    assert.equal(PLANNER_REASK_VIOLATIONS_MAX, PLAN_REFUSAL_VIOLATIONS_KEPT);
  });

  it('a failed report may carry each reason of B2, or none; nothing else', () => {
    assert.deepEqual([...PLANNER_FAILURE_REASONS].sort(), ['agy_error', 'malformed_output', 'model_switched', 'no_result', 'oversize', 'timed_out', 'unparseable_plan']);
    for (const reason of PLANNER_FAILURE_REASONS) {
      assert.notEqual(validatePlannerReportPayload(finished({ kind: 'failed', reason })), null, reason);
    }
    assert.notEqual(validatePlannerReportPayload(finished({ kind: 'failed' })), null, 'no reason stays valid');
    for (const reason of ['plan', 'other', '', 7, null]) {
      assert.equal(validatePlannerReportPayload(finished({ kind: 'failed', reason })), null, String(reason));
    }
    assert.equal(validatePlannerReportPayload(finished({ kind: 'failed', reason: 'no_result', extra: true })), null);
    assert.equal(validatePlannerReportPayload(finished({ kind: 'plan', document: {}, reason: 'no_result' })), null, 'a plan carries no reason');
  });

  it('re-asks only malformed or missing output: not a timeout or a model switch', () => {
    assert.deepEqual([...REASKED_FAILURE_REASONS].sort(), ['agy_error', 'malformed_output', 'no_result', 'oversize', 'unparseable_plan']);
    for (const reason of REASKED_FAILURE_REASONS) assert.equal(isPlannerReask({ refused: 'planner_reported_failure', reason }), true, reason);
    for (const reason of ['timed_out', 'model_switched', 'other', undefined]) {
      assert.equal(isPlannerReask({ refused: 'planner_reported_failure', reason }), false, String(reason));
    }
  });

  it('accepts every refusal shape B3(a) allows', () => {
    assert.equal(isPlannerReask(SCHEMA_REASK), true);
    assert.equal(isPlannerReask({ refused: 'plan_invalid', reason: { kind: 'scope_path', index: 2 }, refusedPlan: REFUSED_PLAN }), true);
    assert.equal(isPlannerReask({ refused: 'plan_invalid', reason: { kind: 'scope_path', index: null }, refusedPlan: REFUSED_PLAN }), true);
    assert.equal(isPlannerReask({ refused: 'plan_invalid', reason: { kind: 'encoding' }, refusedPlan: REFUSED_PLAN }), true);
    const kept = Array.from({ length: PLANNER_REASK_VIOLATIONS_MAX }, (_, i) => ({ code: 'type_mismatch', path: `/acceptance_criteria/${i}` }));
    assert.equal(isPlannerReask({ refused: 'plan_invalid', reason: { kind: 'schema', violationCount: 40, violations: kept }, refusedPlan: REFUSED_PLAN }), true);
    const longest = { code: 'type_mismatch', path: '/'.padEnd(PLANNER_REASK_PATH_MAX, 'a') };
    assert.equal(isPlannerReask({ refused: 'plan_invalid', reason: { kind: 'schema', violationCount: 1, violations: [longest] }, refusedPlan: REFUSED_PLAN }), true);
  });

  it('refuses any other shape', () => {
    const schema = (reason: Record<string, unknown>) => ({ refused: 'plan_invalid', reason, refusedPlan: REFUSED_PLAN });
    const one = [{ code: 'type_mismatch', path: '/objective' }];
    const big = { blob: 'x'.repeat(MAX_PLANNER_PAYLOAD_BYTES) };
    const cases: Array<[string, unknown]> = [
      ['no refused', { reason: { kind: 'encoding' }, refusedPlan: REFUSED_PLAN }],
      ['another refused', { refused: 'plan_refused', reason: { kind: 'encoding' }, refusedPlan: REFUSED_PLAN }],
      ['an extra member', { ...SCHEMA_REASK, extra: 1 }],
      ['no refused plan', { refused: 'plan_invalid', reason: { kind: 'encoding' } }],
      ['an array for a plan', { refused: 'plan_invalid', reason: { kind: 'encoding' }, refusedPlan: [] }],
      ['null for a plan', { refused: 'plan_invalid', reason: { kind: 'encoding' }, refusedPlan: null }],
      ['a string for a plan', { refused: 'plan_invalid', reason: { kind: 'encoding' }, refusedPlan: '{}' }],
      ['a plan over the bound', { refused: 'plan_invalid', reason: { kind: 'encoding' }, refusedPlan: big }],
      ['a failure carrying a plan', { refused: 'planner_reported_failure', reason: 'no_result', refusedPlan: REFUSED_PLAN }],
      ['not_ready', schema({ kind: 'not_ready', terminalStatus: 'BLOCKED_BY_MISSING_INPUT' })],
      ['outside the scope', schema({ kind: 'outside_captured_scope', repositoryMatches: true, baseShaMatches: true, scopePathsWithin: false })],
      ['no violations', schema({ kind: 'schema', violationCount: 0, violations: [] })],
      ['too many violations', schema({ kind: 'schema', violationCount: 21, violations: Array.from({ length: 21 }, () => one[0]) })],
      ['a count under the kept', schema({ kind: 'schema', violationCount: 0, violations: one })],
      ['a fractional count', schema({ kind: 'schema', violationCount: 1.5, violations: one })],
      ['no count', schema({ kind: 'schema', violations: one })],
      ['an unknown code', schema({ kind: 'schema', violationCount: 1, violations: [{ code: 'too_long', path: '/objective' }] })],
      ['a path over the bound', schema({ kind: 'schema', violationCount: 1, violations: [{ code: 'type_mismatch', path: '/'.padEnd(PLANNER_REASK_PATH_MAX + 1, 'a') }] })],
      ['a path that is not text', schema({ kind: 'schema', violationCount: 1, violations: [{ code: 'type_mismatch', path: 7 }] })],
      ['a negative size', schema({ kind: 'schema', violationCount: 1, violations: [{ code: 'length', path: '/objective', found: -1, bound: 4 }] })],
      ['an extra violation member', schema({ kind: 'schema', violationCount: 1, violations: [{ code: 'length', path: '/objective', text: 'x' }] })],
      ['a negative index', schema({ kind: 'scope_path', index: -1 })],
      ['a fractional index', schema({ kind: 'scope_path', index: 1.5 })],
      ['an index as text', schema({ kind: 'scope_path', index: '2' })],
      ['encoding with a message', schema({ kind: 'encoding', reason: 'non-integer number' })],
    ];
    for (const [name, value] of cases) assert.equal(isPlannerReask(value), false, name);
  });

  it('an execute request carries a valid re-ask, and is refused with an invalid one; work without one is unchanged', () => {
    assert.notEqual(validatePlannerRequest(execute(work())), null);
    assert.notEqual(validatePlannerRequest(execute(work({ reask: SCHEMA_REASK }))), null);
    assert.notEqual(validatePlannerRequest(execute(work({ reask: { refused: 'planner_reported_failure', reason: 'unparseable_plan' } }))), null);
    const revision = { feedback: 'Narrow it.', revisingPlanHash: 'd'.repeat(64), earlierPlan: readyPlanFor(work() as never) };
    assert.notEqual(validatePlannerRequest(execute(work({ revision, reask: SCHEMA_REASK }))), null, 'a revision round re-asks with its earlier plan');
    assert.equal(validatePlannerRequest(execute(work({ reask: { refused: 'planner_reported_failure', reason: 'timed_out' } as never }))), null);
    assert.equal(validatePlannerRequest(execute(work({ reask: { ...SCHEMA_REASK, refusedPlan: [] } as never }))), null);
  });
});

/* ---------------- the re-ask a failure earns (B1, B3) ---------------- */

describe('the re-ask act · what earns a re-ask (B1)', () => {
  const w = work();
  const inputs: RoundInputs = {
    repository: w.repository,
    baseSha: w.baseSha,
    scopePaths: ['src', 'test'],
    goalEventId: w.goalEventId,
    goal: w.goal,
    goalDigest: founderGoalDigest(w.goal),
  };

  it('a Planner failure the Gateway names as malformed or missing output, and nothing else', () => {
    for (const reason of REASKED_FAILURE_REASONS) {
      assert.deepEqual(reaskFor({ classification: 'planner_reported_failure', reason }), { refused: 'planner_reported_failure', reason });
    }
    for (const reason of ['timed_out', 'model_switched', undefined] as const) {
      assert.equal(reaskFor({ classification: 'planner_reported_failure', reason }), null, String(reason));
    }
  });

  it('a plan refused for its schema, a scope path or its encoding, carried back with the reason', () => {
    const document = { ...readyPlanFor(w as never), objective: 7 };
    const verdict = judgeRoundPlan(document, inputs);
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.equal(verdict.classification, 'plan_invalid');
    assert.deepEqual(reaskFor({ classification: 'plan_invalid', reason: verdict.reason, document }), {
      refused: 'plan_invalid',
      reason: verdict.reason,
      refusedPlan: document,
    });
    for (const reason of [{ kind: 'scope_path', index: 0 }, { kind: 'scope_path', index: null }, { kind: 'encoding' }] as const) {
      assert.deepEqual(reaskFor({ classification: 'plan_invalid', reason, document }), { refused: 'plan_invalid', reason, refusedPlan: document });
    }
  });

  it('not a blocked or inconclusive plan, nor one outside the captured scope', () => {
    const blocked = { ...readyPlanFor(w as never), terminal_status: 'BLOCKED_FOUNDER_DECISION' };
    for (const terminal_status of ['BLOCKED_RESEARCH_GAP', 'BLOCKED_REPOSITORY_DRIFT', 'BLOCKED_FOUNDER_DECISION', 'INCONCLUSIVE_ARCHITECTURE']) {
      const document = { ...blocked, terminal_status };
      const verdict = judgeRoundPlan(document, inputs);
      assert.ok(!verdict.ok && verdict.reason.kind === 'not_ready', terminal_status);
      if (verdict.ok) return;
      assert.equal(reaskFor({ classification: 'plan_invalid', reason: verdict.reason, document }), null, terminal_status);
    }
    const outside = { kind: 'outside_captured_scope', repositoryMatches: true, baseShaMatches: true, scopePathsWithin: false } as const;
    assert.equal(reaskFor({ classification: 'plan_invalid', reason: outside, document: blocked }), null);
  });

  it('none the wire would refuse: a refused document that is not a plain object within the bound', () => {
    const reason = { kind: 'schema', violationCount: 1, violations: [{ code: 'type_mismatch', path: '' }] } as const;
    for (const document of [[], 'a plan', null, 7, { blob: 'x'.repeat(MAX_PLANNER_PAYLOAD_BYTES) }]) {
      assert.equal(reaskFor({ classification: 'plan_invalid', reason, document }), null, typeof document);
    }
  });

  it('the refused plan\'s hash, where it has one', () => {
    const document = { ...readyPlanFor(w as never), objective: 7 };
    assert.equal(refusedPlanHash(document), planHash(document as unknown as CanonicalDocument));
    assert.equal(refusedPlanHash({ ...document, objective: 1.5 }), null, 'a number with no canonical form');
    assert.equal(refusedPlanHash([1, 2]), null, 'a root that is not an object');
  });
});

/* ---------------- (c) the prompt ---------------- */

const B5_HEAD = [
  '',
  'YOUR EARLIER ANSWER TO THIS REQUEST WAS REFUSED',
  'You have answered this request once already. The control plane refused that answer, for this reason:',
];
const B5_PLAN = [
  'Your refused answer follows, exactly as the control plane received it. Correct what the reason names, change nothing else, and give the whole corrected plan as your answer. Rules 1, 2 and 5 below apply to what you change.',
  '',
  'REFUSED ANSWER',
];
const B5_AGAIN = 'Answer the request again, in full, following every rule below.';

/** The same work's prompt without the re-ask, with `inserted` before the blank line that opens HOW TO WRITE THE PLAN. */
function withInserted(base: string, inserted: readonly string[]): string {
  const lines = base.split('\n');
  const at = lines.indexOf('HOW TO WRITE THE PLAN') - 1;
  assert.equal(lines[at], '', 'a blank line opens HOW TO WRITE THE PLAN');
  return [...lines.slice(0, at), ...inserted, ...lines.slice(at)].join('\n');
}

describe('the re-ask act · the prompt (B5 to B7; B11(c))', () => {
  const revision = { feedback: 'Revise. Narrow the scope to the handler.', revisingPlanHash: 'd'.repeat(64), earlierPlan: readyPlanFor(work() as never) };

  const failures: Array<[PlannerReaskWire, string[]]> = [
    [{ refused: 'planner_reported_failure', reason: 'unparseable_plan' }, ['It was not one JSON object.']],
    [{ refused: 'planner_reported_failure', reason: 'oversize' }, ['It was too large to send. Keep within rule 6 below.']],
    [{ refused: 'planner_reported_failure', reason: 'malformed_output' }, ['No answer reached the control plane.']],
    [{ refused: 'planner_reported_failure', reason: 'no_result' }, ['No answer reached the control plane.']],
    [{ refused: 'planner_reported_failure', reason: 'agy_error' }, ['No answer reached the control plane.']],
  ];
  const refusals: Array<[PlannerReaskWire, string[]]> = [
    [
      SCHEMA_REASK,
      [
        'It does not satisfy the schema in the ANSWER section. Each line below names a place in that answer, as a JSON pointer, and what is wrong there:',
        '- /controlling_inputs/0/sha256: pattern_mismatch',
        '- /implementation_sequence/1: length (found 4808, limit 4000)',
        '- /<undeclared key>: additional_property',
        '- : type_mismatch',
        '- <unresolved path>: required_missing',
        '- and 18 more',
      ],
    ],
    [
      { refused: 'plan_invalid', reason: { kind: 'schema', violationCount: 1, violations: [{ code: 'length', path: '/objective', found: 9 }] }, refusedPlan: REFUSED_PLAN },
      [
        'It does not satisfy the schema in the ANSWER section. Each line below names a place in that answer, as a JSON pointer, and what is wrong there:',
        '- /objective: length',
      ],
    ],
    [
      { refused: 'plan_invalid', reason: { kind: 'schema', violationCount: 2, violations: [{ code: 'type_mismatch', path: '/objective' }] }, refusedPlan: REFUSED_PLAN },
      [
        'It does not satisfy the schema in the ANSWER section. Each line below names a place in that answer, as a JSON pointer, and what is wrong there:',
        '- /objective: type_mismatch',
        '- and 1 more',
      ],
    ],
    [{ refused: 'plan_invalid', reason: { kind: 'scope_path', index: 3 }, refusedPlan: REFUSED_PLAN }, ['Its scope_paths entry at index 3 is not a valid repository path.']],
    [{ refused: 'plan_invalid', reason: { kind: 'scope_path', index: null }, refusedPlan: REFUSED_PLAN }, ['Its scope_paths are not valid repository paths.']],
    [
      { refused: 'plan_invalid', reason: { kind: 'encoding' }, refusedPlan: REFUSED_PLAN },
      ['It holds a number that is not a whole number, or a negative zero, which a plan cannot carry.'],
    ],
  ];

  it('a failure re-ask is the same prompt with B5\'s lines and B6\'s reason inserted, line for line, first round or revision', () => {
    for (const [reask, reason] of failures) {
      for (const base of [work(), work({ revision })]) {
        assert.equal(plannerPrompt({ ...base, reask }), withInserted(plannerPrompt(base), [...B5_HEAD, ...reason, B5_AGAIN]), JSON.stringify(reask));
      }
    }
  });

  it('a refused plan re-ask also carries that plan, as one line of JSON that parses back to it', () => {
    for (const [reask, reason] of refusals) {
      if (reask.refused !== 'plan_invalid') continue;
      for (const base of [work(), work({ revision })]) {
        const prompt = plannerPrompt({ ...base, reask });
        assert.equal(prompt, withInserted(plannerPrompt(base), [...B5_HEAD, ...reason, ...B5_PLAN, JSON.stringify(reask.refusedPlan)]), JSON.stringify(reask.reason));
        const lines = prompt.split('\n');
        assert.deepEqual(JSON.parse(lines[lines.indexOf('REFUSED ANSWER') + 1] ?? ''), reask.refusedPlan);
      }
    }
  });

  it('each line of B5 appears once; a prompt without a re-ask has none of them', () => {
    const lines = plannerPrompt(work({ revision, reask: SCHEMA_REASK })).split('\n');
    for (const line of [...B5_HEAD.slice(1), B5_PLAN[0]!, 'REFUSED ANSWER']) assert.equal(lines.filter((l) => l === line).length, 1, line);
    for (const base of [work(), work({ revision })]) {
      const plain = plannerPrompt(base).split('\n');
      for (const line of [...B5_HEAD.slice(1), B5_PLAN[0]!, 'REFUSED ANSWER', B5_AGAIN]) assert.equal(plain.includes(line), false, line);
    }
  });
});

/* ---------------- (d) the Gateway's report ---------------- */

const FAKE_AGY = fileURLToPath(new URL('./support/fake-agy.js', import.meta.url));
const AGY_HASH = 'e'.repeat(64);

function agyExecutor(mode: string, plan: unknown): AgyPlannerExecutor {
  const root = temporary('buildroom-reask-');
  const gatewayDirectory = join(root, 'gateway');
  mkdirSync(gatewayDirectory);
  const checkoutParent = join(root, 'checkouts');
  mkdirSync(checkoutParent);
  const launch: Launch = (_file, args, options) =>
    spawn(process.execPath, [FAKE_AGY, ...args], {
      cwd: options.cwd,
      stdio: 'pipe',
      env: { ...process.env, FAKE_AGY_MODE: mode, FAKE_AGY_LOG: join(root, 'fake.log'), FAKE_AGY_PLAN: JSON.stringify(plan) },
    });
  return new AgyPlannerExecutor(
    { sudoPath: '/usr/bin/sudo', plannerUser: 'buildroom-planner', agyPath: '/opt/agy/bin/agy', agySha256: AGY_HASH, checkoutParent, gatewayDirectory },
    {
      launch,
      probe: () => Promise.resolve(false),
      reap: () => Promise.resolve(),
      log: () => undefined,
      hashFile: () => Promise.resolve(AGY_HASH),
      checkout: (_work, parent) => mkdtemp(join(parent, 'run-')),
      timings: { initTimeoutMs: 3_000, runTimeoutMs: 1_500, stopGraceMs: 1_000, reapSettleMs: 300 },
    },
  );
}

/** An executor whose run ends as `ending` says, and which shows each work it was handed. */
class EndingExecutor implements PlannerExecutor {
  constructor(
    private readonly ending: () => Promise<PlannerResultWire>,
    private readonly onStart: (work: PlannerWorkWire) => void = () => undefined,
  ) {}

  async attest(request: { readonly commandId: string; readonly role: string; readonly intended: PlannerRouteWire }): Promise<PlannerIdentityWire> {
    return { executionId: `exec-${request.commandId}`, role: request.role, surface: 'claude-code', model: request.intended.model, provider: request.intended.provider, effort: 'n/a' };
  }

  async start(work: PlannerWorkWire): Promise<PlannerStart> {
    this.onStart(work);
    const completion = this.ending();
    completion.catch(() => undefined);
    return { kind: 'accepted', observed: { ...SYNTHETIC_ROUTE }, completion };
  }
}

async function reportedResult(executor: PlannerExecutor): Promise<unknown> {
  const worker = new GatewayPlannerWorker({ executor, records: new PlannerRecordStore(temporary('buildroom-reask-records-')) });
  const commandId = 'cmd_reask_report';
  const attested = await worker.handle({ requestId: uuid(), kind: 'attest', commandId, role: 'architect', intended: SYNTHETIC_ROUTE });
  assert.equal(attested?.kind, 'attested');
  const executionId = attested?.kind === 'attested' ? attested.identity.executionId : '';
  assert.equal((await worker.handle({ requestId: uuid(), kind: 'execute', commandId, executionId, work: work({ commandId }) }))?.kind, 'accepted');
  await worker.settled();
  const status = await worker.handle({ requestId: uuid(), kind: 'status', commandId });
  assert.equal(status?.kind, 'finished');
  return status?.kind === 'finished' ? status.result : undefined;
}

describe('the re-ask act · the Gateway reports how a run ended without a plan (B2; B11(d))', () => {
  for (const [mode, reason] of [
    ['switch', 'model_switched'],
    ['error', 'agy_error'],
    ['unparseable', 'unparseable_plan'],
    ['exit', 'no_result'],
    ['hang', 'timed_out'],
    ['bad_then_result', 'malformed_output'],
  ] as const) {
    it(`a run that ends ${mode} rejects with ${reason}`, async () => {
      const w = work({ commandId: `cmd_planner_${mode}` });
      const executor = agyExecutor(mode, readyPlanFor({ ...w } as never));
      const identity = await executor.attest({ commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } });
      const started = await executor.start(w, identity);
      assert.equal(started.kind, 'accepted');
      if (started.kind !== 'accepted') return;
      await assert.rejects(started.completion, (error: unknown) => error instanceof PlannerRunEndedWithoutPlanError && error.reason === reason);
    });
  }

  it('the worker reports the reason it was given, oversize for a result too large, and none for any other failure', async () => {
    for (const reason of PLANNER_FAILURE_REASONS.filter((r) => r !== 'oversize')) {
      assert.deepEqual(await reportedResult(new EndingExecutor(() => Promise.reject(new PlannerRunEndedWithoutPlanError(reason)))), { kind: 'failed', reason });
    }
    const huge = { kind: 'plan' as const, document: { blob: 'x'.repeat(MAX_PLANNER_PAYLOAD_BYTES) } };
    assert.deepEqual(await reportedResult(new EndingExecutor(() => Promise.resolve(huge))), { kind: 'failed', reason: 'oversize' });
    assert.deepEqual(await reportedResult(new EndingExecutor(() => Promise.reject(new Error('the record could not be written')))), { kind: 'failed' });
  });
});

describe('the re-ask act · the planner channel carries the re-ask out and the reason back (B2, B3)', () => {
  it('the Gateway receives the work\'s re-ask as sent, and the control plane the failure\'s reason', async () => {
    const channel = new GatewayPlannerChannel(createSystemClock());
    const gatewayId = uuid();
    const handed: PlannerWorkWire[] = [];
    const executor = new EndingExecutor(() => Promise.reject(new PlannerRunEndedWithoutPlanError('unparseable_plan')), (w) => handed.push(w));
    const worker = new GatewayPlannerWorker({ executor, records: new PlannerRecordStore(temporary('buildroom-reask-channel-')) });
    const port = channel.port({ gatewayId, role: 'architect', intended: SYNTHETIC_ROUTE, timings: { answerTimeoutMs: 10_000, planTimeoutMs: 60_000, statusIntervalMs: 10 } });
    let running = true;
    const pumping = (async () => {
      while (running) {
        const request = channel.collect(gatewayId);
        if (request !== null) {
          const payload = await worker.handle(request);
          if (payload !== null) channel.answer(gatewayId, request.requestId, payload);
        }
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    })();
    try {
      const commandId = 'cmd_reask_channel';
      await port.attest(commandId);
      const sent: PlannerWork = { ...work({ commandId }), reask: SCHEMA_REASK };
      assert.equal((await port.dispatch(sent)).kind, 'accepted');
      assert.deepEqual(handed[0]?.reask, SCHEMA_REASK);
      assert.deepEqual(await port.awaitPlan(commandId), { kind: 'failed', reason: 'unparseable_plan' });
    } finally {
      running = false;
      await pumping;
    }
  });
});

/* ---------------- (e) the run unit ---------------- */

const ROOM = '00000000-0000-4000-8000-000000000001';
const SET_ID = 'FOUNDER-ACT-EXAMPLE-PHASE4-COUNTED-RUNS';
const DEPLOYMENT = 'dep-0001';
const GOAL = 'Add a health detail field to the status route.';

function runSet(): Phase4RunSet {
  return {
    setId: SET_ID,
    founderOsSha: 'a'.repeat(40),
    buildRoomSha: 'b'.repeat(40),
    controlPlaneOrigin: 'https://control-plane.example',
    gatewayId: '1880c12d-0000-4000-8000-000000000001',
    planner: { provider: 'google', model: 'gemini-4-argon' },
    seats: { builder: 'codex', reviewer: 'grok-build' },
    founderRelay: { actualModel: 'n/a (human Founder act)', executionSurface: 'claude-code' },
    decisionTimeoutMs: 3_600_000,
    runs: [{ label: 'Phase4-CR1', roomId: ROOM, inputs: { repository: 'example-org/example-repo', baseSha: 'a'.repeat(40), scopePaths: ['src', 'test'], goal: GOAL } }],
  } as unknown as Phase4RunSet;
}

const who = (roleId: string | null, actorId: string, actualModel: string, executionSurface: string) => ({ roleId, actorId, actualModel, executionSurface });
const AT = '2026-11-11T14:00:00.000Z';
const ev = (eventId: string, name: string, actor: string, a: Phase4RecordedEvent['attribution'], extra: Partial<Phase4RecordedEvent> = {}): Phase4RecordedEvent => ({
  eventId,
  event: name,
  actor,
  attribution: a,
  evidence: [],
  committedAt: AT,
  ...extra,
});

type Terminal = { readonly eventType: string; readonly failureClassification?: string; readonly evidenceRefs?: readonly string[] };

/** One command's rows as the journal route returns them, its request's evidence references included. */
function cmd(commandId: string, terminal: Terminal = { eventType: 'completed' }, requestRefs: readonly string[] = []) {
  return {
    commandId,
    rows: [
      { eventType: 'journaled', authorizationRef: SET_ID, intendedProvider: 'google', intendedModel: 'gemini-4-argon', intendedSurface: 'antigravity', evidenceRefs: requestRefs },
      { eventType: 'identity_bound' },
      { eventType: 'dispatched', provider: 'google', model: 'gemini-4-argon', executionSurface: 'antigravity' },
      terminal,
    ],
  };
}

/** A failed row; a planner_reported_failure carries the Gateway's reason, unparseable_plan unless `refs` says otherwise. */
const failedAs = (failureClassification: string, refs?: readonly string[]): Terminal => ({
  eventType: 'failed',
  failureClassification,
  evidenceRefs: refs ?? (failureClassification === 'planner_reported_failure' ? ['planner-failure/unparseable_plan'] : []),
});

/**
 * One round, opened by t2, to approval; `revised` adds a revision round opened by t4-1.
 * `attempts` gives each round's commands as its attempts' terminal rows, in order.
 */
function record(attempts: ReadonlyArray<ReadonlyArray<Terminal>>): Phase4RunRecord {
  const planner = who('architect', 'session:planner', 'gemini-4-argon', 'antigravity');
  const founder = who(null, 'founder', 'n/a (human Founder decision)', 'claude-code');
  const events: Phase4RecordedEvent[] = [
    ev('t1', 'scope.captured', 'founder', who(null, 'founder', 'n/a (human Founder act)', 'claude-code'), {
      evidence: [{ kind: 'founder_goal', ref: 'goal', digest: founderGoalDigest(GOAL) }],
    }),
  ];
  const commands: ReturnType<typeof cmd>[] = [];
  const decisions: Phase4RunRecord['decisions'][number][] = [];
  attempts.forEach((round, r) => {
    const opening = r === 0 ? 't2' : `t4-${r}`;
    if (r === 0) events.push(ev('t2', 'task.dispatched.planner', 'control-plane', who('builder', `control-plane:${DEPLOYMENT}`, PHASE4_DISPATCHER.actualModel, PHASE4_DISPATCHER.executionSurface)));
    else {
      events.push(ev(opening, 'plan.revision_requested', 'founder', founder));
      decisions.push({ commandId: commands.at(-1)!.commandId, decision: 'plan.revision_requested', planHash: `h${r - 1}`.padEnd(64, '0') });
    }
    // Each later attempt is journaled as a retry of the one before, for its reason, as the loop journals it.
    round.forEach((terminal, a) => {
      const before = a === 0 ? undefined : round[a - 1];
      const retry = before === undefined ? [] : [`retry-of/${plannerCommandIdFor(ROOM, opening, a)}`, `retry-reason/${before.failureClassification ?? 'none'}`];
      commands.push(cmd(plannerCommandIdFor(ROOM, opening, a + 1), terminal, retry));
    });
    events.push(ev(`t3-${r}`, 'plan.submitted', 'agent.planner', planner, { planHash: `h${r}`.padEnd(64, '0') }));
  });
  const reviewed = `h${attempts.length - 1}`.padEnd(64, '0');
  events.push(ev('t5', 'plan.approved', 'founder', founder, { planHash: reviewed }));
  decisions.push({ commandId: commands.at(-1)!.commandId, decision: 'plan.approved', planHash: reviewed });
  return { roomId: ROOM, deploymentIdAtStart: DEPLOYMENT, deploymentIdAtEnd: DEPLOYMENT, finalState: 'BUILDING', events, commands, decisions, journalVerified: true };
}

const judge = (r: Phase4RunRecord) => evaluatePhase4Run(runSet(), runSet().runs[0]!, r);
const done: Terminal = { eventType: 'completed' };

describe('the re-ask act · the run unit (B8; B11(e))', () => {
  it('passes a round re-asked after plan_invalid or planner_reported_failure, first round or revision', () => {
    assert.deepEqual(judge(record([[done]])), { outcome: 'passed', failures: [] });
    for (const classification of ['plan_invalid', 'planner_reported_failure']) {
      assert.deepEqual(judge(record([[failedAs(classification), done]])), { outcome: 'passed', failures: [] }, classification);
      assert.deepEqual(judge(record([[done], [failedAs(classification), done]])), { outcome: 'passed', failures: [] }, classification);
      assert.deepEqual(judge(record([[failedAs(classification), done], [failedAs(classification), done]])), { outcome: 'passed', failures: [] }, 'one re-ask in each round');
    }
    assert.deepEqual(judge(record([[failedAs('not_sent'), failedAs('plan_invalid'), done]])), { outcome: 'passed', failures: [] }, 'after a not_sent retry');
    for (const reason of REASKED_FAILURE_REASONS) {
      const r = record([[failedAs('planner_reported_failure', [`planner-failure/${reason}`]), done]]);
      assert.deepEqual(judge(r), { outcome: 'passed', failures: [] }, reason);
    }
  });

  it('fails a second re-ask in a round, a failure followed by another round\'s attempt, a failed last command, or any other failure', () => {
    const notClean = (r: Phase4RunRecord, name: string) => assert.ok(judge(r).failures.includes('command_not_clean'), name);
    notClean(record([[failedAs('plan_invalid'), failedAs('planner_reported_failure'), done]]), 'two re-asks in one round');
    notClean(record([[failedAs('plan_invalid')], [done]]), 'a failure followed by the next round');
    notClean(record([[done], [failedAs('plan_invalid')]]), 'a failed last command');
    for (const classification of ['plan_outside_captured_scope', 'plan_refused', 'route_mismatch', 'identity_mismatch', 'completion_not_covered']) {
      notClean(record([[failedAs(classification), done]]), classification);
    }
    const crossed = record([[failedAs('plan_invalid')], [done]]);
    const [first, other] = crossed.commands;
    const asRetry = other!.rows.map((row) =>
      row.eventType === 'journaled' ? { ...row, evidenceRefs: [`retry-of/${first!.commandId}`, 'retry-reason/plan_invalid'] } : row,
    );
    notClean(
      { ...crossed, commands: [first!, { commandId: plannerCommandIdFor(ROOM, 't4-1', 2), rows: asRetry }] },
      'a failure followed by the next attempt number of another round, journaled as its retry',
    );
    notClean(record([[failedAs('plan_invalid'), done, done]]), 'an attempt after the re-ask, though both completed');
    notClean(record([[failedAs('plan_invalid'), failedAs('not_sent'), done]]), 'a retry after the re-ask');
    for (const refs of [['planner-failure/timed_out'], ['planner-failure/model_switched'], [], ['planner-failure/other']]) {
      notClean(record([[failedAs('planner_reported_failure', refs), done]]), `a failure the round does not re-ask: ${JSON.stringify(refs)}`);
    }
    const unmarked = record([[failedAs('plan_invalid'), done]]);
    const [failed, reask] = unmarked.commands;
    for (const refs of [[], [`retry-of/${failed!.commandId}`], ['retry-reason/plan_invalid'], [`retry-of/${failed!.commandId}`, 'retry-reason/not_sent']]) {
      const rows = reask!.rows.map((row) => (row.eventType === 'journaled' ? { ...row, evidenceRefs: refs } : row));
      notClean({ ...unmarked, commands: [failed!, { ...reask!, rows }] }, `a next attempt not journaled as this re-ask: ${JSON.stringify(refs)}`);
    }
    const skipped = record([[failedAs('plan_invalid'), done]]);
    notClean({ ...skipped, commands: [skipped.commands[0]!, { ...skipped.commands[1]!, commandId: plannerCommandIdFor(ROOM, 't2', 3) }] }, 'an attempt skipped');
  });
});
