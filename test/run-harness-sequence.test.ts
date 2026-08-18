/**
 * Phase 2 — the three-run gate's semantics.
 *
 * `DEC-20260815-17` exit criterion 4 requires three consecutive successful
 * runs *"ordered and countable, with a failed run visible as an interruption
 * of the sequence rather than absent from it"*. Each clause of that gets a
 * test, because each is a way the gate could be satisfied on paper while
 * certifying something it never established.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendRun,
  buildBundle,
  consecutivePassesAtEnd,
  emptySequence,
  gateStatus,
  REQUIRED_CONDITIONS,
  REQUIRED_CONSECUTIVE_PASSES,
  summarizeBundle,
  verdictFor,
  type ConditionRecord,
  type RunDraft,
  type RunSequence,
} from '../packages/run-harness/src/index.js';

const ALL_HELD: readonly ConditionRecord[] = REQUIRED_CONDITIONS.map((condition) => ({
  condition,
  held: true,
  evidence: 'observed',
}));

function draft(runId: string, conditions: readonly ConditionRecord[] = ALL_HELD): RunDraft {
  return {
    runId,
    startedAt: '2026-08-17T12:00:00.000Z',
    endedAt: '2026-08-17T12:05:00.000Z',
    commit: 'abc1234',
    steps: [],
    conditions,
  };
}

function failing(which: ConditionRecord['condition']): readonly ConditionRecord[] {
  return ALL_HELD.map((condition) =>
    condition.condition === which
      ? { ...condition, held: false, evidence: 'did not hold' }
      : condition,
  );
}

function sequenceOf(...verdicts: readonly ('pass' | 'fail')[]): RunSequence {
  let sequence = emptySequence();
  verdicts.forEach((verdict, index) => {
    const conditions = verdict === 'pass' ? ALL_HELD : failing('reads_and_writes');
    sequence = appendRun(sequence, draft(`run-${index + 1}`, conditions)).sequence;
  });
  return sequence;
}

describe('run gate — a run passes only when all three conditions held', () => {
  it('passes when every condition held', () => {
    assert.equal(verdictFor(ALL_HELD).verdict, 'passed');
  });

  it('fails when any single condition did not hold', () => {
    for (const condition of REQUIRED_CONDITIONS) {
      const result = verdictFor(failing(condition));
      assert.equal(result.verdict, 'failed', `${condition} failing should fail the run`);
      assert.match(result.failureReason ?? '', new RegExp(condition));
    }
  });

  it('fails when a condition was never evaluated rather than treating it as satisfied', () => {
    // A run that crashed before testing restart survival has not shown restart
    // survival. Absence must not read as success.
    const partial = ALL_HELD.filter((c) => c.condition !== 'survives_restart');
    const result = verdictFor(partial);

    assert.equal(result.verdict, 'failed');
    assert.match(result.failureReason ?? '', /never evaluated/);
    assert.match(result.failureReason ?? '', /survives_restart/);
  });

  it('derives the verdict on append rather than trusting the caller', () => {
    const { run } = appendRun(emptySequence(), draft('r1', failing('survives_restart')));
    assert.equal(run.verdict, 'failed');
  });
});

describe('run gate — ordered and countable', () => {
  it('numbers every run from 1, gaplessly, pass or fail', () => {
    const sequence = sequenceOf('pass', 'fail', 'pass');
    assert.deepEqual(
      sequence.runs.map((run) => run.seq),
      [1, 2, 3],
    );
  });

  it('keeps a failed run in the record rather than dropping it', () => {
    const sequence = sequenceOf('pass', 'fail', 'pass');
    assert.equal(sequence.runs.length, 3);
    assert.equal(sequence.runs[1]?.verdict, 'failed');
  });
});

describe('run gate — consecutive means consecutive', () => {
  it('is not satisfied by three passes interrupted by a failure', () => {
    // pass, pass, FAIL, pass — three passes on record, but not three in a row.
    const status = gateStatus(sequenceOf('pass', 'pass', 'fail', 'pass'));

    assert.equal(status.satisfied, false);
    assert.equal(status.consecutivePasses, 1, 'the failure resets the streak');
    assert.equal(status.totalRuns, 4);
    assert.equal(status.failedRuns, 1);
  });

  it('is satisfied by three passes in a row', () => {
    const status = gateStatus(sequenceOf('pass', 'pass', 'pass'));

    assert.equal(status.satisfied, true);
    assert.equal(status.consecutivePasses, REQUIRED_CONSECUTIVE_PASSES);
    assert.deepEqual(status.satisfyingRuns, [1, 2, 3]);
  });

  it('is satisfied by a recovered streak, and still reports the earlier failure', () => {
    const status = gateStatus(sequenceOf('fail', 'pass', 'pass', 'pass'));

    assert.equal(status.satisfied, true);
    assert.deepEqual(status.satisfyingRuns, [2, 3, 4]);
    assert.equal(status.failedRuns, 1, 'the failure is still counted');
    assert.match(status.summary, /1 failed/);
    assert.match(status.summary, /#1 failed/, 'the failure stays visible in the sequence');
  });

  it('counts nothing on an empty record', () => {
    const status = gateStatus(emptySequence());
    assert.equal(status.satisfied, false);
    assert.equal(status.consecutivePasses, 0);
    assert.match(status.summary, /no runs on record/);
  });

  it('counts the streak backwards from the most recent run only', () => {
    assert.equal(consecutivePassesAtEnd(sequenceOf('pass', 'pass', 'pass', 'fail')), 0);
    assert.equal(consecutivePassesAtEnd(sequenceOf('fail', 'pass', 'pass')), 2);
  });
});

describe('run gate — the evidence bundle', () => {
  const context = {
    assembledAt: '2026-08-17T13:00:00.000Z',
    commit: 'abc1234',
    baseUrl: 'https://control-plane.example',
    environment: 'production',
    platformKind: 'external',
    attribution: {
      roleId: 'builder',
      actorId: 'session:test',
      actualModel: 'model-under-test',
      executionSurface: 'claude-code',
    },
  };

  it('retains every run, including the failures, not only the satisfying three', () => {
    const bundle = buildBundle(sequenceOf('fail', 'pass', 'pass', 'pass'), context);

    assert.equal(bundle.runs.length, 4);
    assert.equal(bundle.gate.satisfied, true);
    assert.equal(bundle.gate.failedRuns, 1);
  });

  it('states plainly that a satisfied gate authorizes nothing', () => {
    const bundle = buildBundle(sequenceOf('pass', 'pass', 'pass'), context);

    assert.match(bundle.authorizes, /authorizes nothing/);
    assert.match(bundle.authorizes, /confers no activation/);
    assert.match(summarizeBundle(bundle), /authorizes nothing/);
  });

  it('records who ran it rather than leaving attribution to be inferred', () => {
    const bundle = buildBundle(sequenceOf('pass'), context);
    assert.equal(bundle.context.attribution.actorId, 'session:test');
    assert.equal(bundle.context.attribution.roleId, 'builder');
  });

  it('shows each failed run its reason in the summary', () => {
    const bundle = buildBundle(sequenceOf('pass', 'fail'), context);
    const summary = summarizeBundle(bundle);

    assert.match(summary, /#2 FAILED/);
    assert.match(summary, /reads_and_writes/);
  });
});
