/**
 * The Planner's prompt: what a plan may name, and what a revision round lacks
 * (FOUNDER-ACT-20261108-BR-PLANNER-PROMPT-GROUNDING, Part B).
 *
 * Rehearsal R4's three plans named files, functions, scripts and tests that
 * do not exist, and the third required a check to pass that fails at the
 * base commit, which a Planner that may not run commands cannot know. A
 * revision round carries only the Founder's feedback and the earlier plan's
 * hash, and agy starts afresh each round, so the Planner never sees its
 * earlier plan. The act adds rules for what a plan may name (B1), a
 * revision round's note (B2) and a last line asking for one answer (B3),
 * and changes no earlier line (B4).
 *
 * The expected lines are the act's text, written out here rather than read
 * from the source, so a change to the prompt cannot pass by changing both.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLANDOC_SCHEMA_V1 } from '../packages/seat-output-schema/src/index.js';
import { plannerPrompt } from '../packages/gateway-daemon/src/index.js';
import type { PlannerWorkWire } from '../packages/gateway-protocol/src/index.js';

/** B1, in order: a blank line, the heading and the six rules. */
const RULES: readonly string[] = [
  '',
  'HOW TO WRITE THE PLAN',
  '1. Name a file, directory, function, type, constant, route, table, field, environment variable, error code, script, test or value only if you saw it in this checkout during this turn, in a file you opened or a directory you listed. If you did not see it, describe the behaviour in plain words or leave it out. Never name something because it seems likely to exist.',
  '2. Give a line number or a range of lines only for lines you read, and quote only text you read.',
  '3. Name only what the plan needs. A plan does not need every function, constant or error code of the code it describes.',
  '4. You cannot run commands, so you do not know whether any test, lint, type check or other check passes at this commit. Do not say that one passes or fails. Where the plan relies on a check, require only that the change adds no new failure to it compared with this commit.',
  '5. Before you answer, check every name, path, line number and quotation in the plan against what you saw, and remove any you did not see.',
  '6. Keep the whole answer under 25,000 characters.',
];

/** B2. */
const REVISION_NOTE =
  'You do not have the earlier plan, only this feedback on it. Treat each correction in the feedback as true, and check everything else against the checkout as the rules below say.';

/** B3. */
const ANSWER_ONCE = 'Write that object once, at the end of your turn, after you have finished reading.';

/**
 * The prompt as it was at 0a7f2a7a21da745f0cee16fff76dc36c13d01c39, before
 * this act: B4 keeps every one of these lines, word for word and in order.
 */
function promptBeforeTheAct(work: PlannerWorkWire): string {
  const lines = [
    'You are the architect seat of the MAD Ventures Build Room, acting as its Planner.',
    'Write an Implementation Plan for the goal below. Plan only. You may read files in your working directory with your file-reading tool. You may not run any command or program of any kind, even one that only reads: a request to run one ends your turn with no plan. Do not modify, create or delete any file, and do not contact any service. Give your whole answer in this one turn.',
    `The repository ${work.repository} is checked out read-only in your working directory at commit ${work.baseSha}.`,
    '',
    'GOAL',
    work.goal,
    '',
    'SCOPE PATHS (the plan may touch only these)',
    ...work.scopePaths.map((path) => `- ${path}`),
  ];
  if (work.revision !== undefined) {
    lines.push('', 'THE FOUNDER ASKED FOR A REVISION OF AN EARLIER PLAN', `Earlier plan hash: ${work.revision.revisingPlanHash}`, work.revision.feedback);
  }
  lines.push(
    '',
    'ANSWER',
    'Reply with exactly one JSON object and nothing else: no prose, no code fence. It must satisfy this schema, in which `additional_properties: false` means no other key is allowed:',
    JSON.stringify(PLANDOC_SCHEMA_V1),
    `Use "repository": ${JSON.stringify(work.repository)}, "base_sha": ${JSON.stringify(work.baseSha)} and "work_id": ${JSON.stringify(work.commandId)}.`,
    'Set "terminal_status" to "PLAN_READY_FOR_FOUNDER_APPROVAL" only if the plan is complete; otherwise to the blocked or inconclusive status that applies.',
  );
  return lines.join('\n');
}

const SHA40 = 'a'.repeat(40);

function firstRound(): PlannerWorkWire {
  return {
    commandId: 'cmd_planner_0123456789abcdef0123456789abcdef',
    roomId: '00000000-0000-4000-8000-000000000001',
    repository: 'MADVenturesLLC/example',
    baseSha: SHA40,
    scopePaths: ['README.md', 'src/health.ts'],
    goalEventId: '00000000-0000-4000-8000-000000000002',
    goal: 'Describe the health route in the README.',
    goalDigest: 'c'.repeat(64),
  };
}

/** A revision whose feedback runs over several lines, as the Founder's does. */
function revisionRound(): PlannerWorkWire {
  return {
    ...firstRound(),
    commandId: 'cmd_planner_fedcba9876543210fedcba9876543210',
    revision: {
      revisingPlanHash: 'b'.repeat(64),
      feedback: 'Revise. Two statements are false.\n1. There is no src/codec.ts.\n2. The route is /health, not /status.',
    },
  };
}

function linesOf(work: PlannerWorkWire): string[] {
  return plannerPrompt(work).split('\n');
}

/** Where `block` starts in `lines`, as a contiguous run; -1 when absent. */
function indexOfBlock(lines: readonly string[], block: readonly string[]): number {
  for (let start = 0; start + block.length <= lines.length; start += 1) {
    if (block.every((line, offset) => lines[start + offset] === line)) return start;
  }
  return -1;
}

function count(lines: readonly string[], line: string): number {
  return lines.filter((candidate) => candidate === line).length;
}

describe('the rules for what a plan may name (B1)', () => {
  it('a first-round prompt holds each rule exactly once, in order, as one block', () => {
    const lines = linesOf(firstRound());
    for (const rule of RULES.slice(1)) assert.equal(count(lines, rule), 1, rule.slice(0, 40));
    assert.notEqual(indexOfBlock(lines, RULES), -1, 'the blank line, the heading and the six rules are contiguous and in order');
  });

  it('comes after the scope paths and right before the blank line and ANSWER', () => {
    const lines = linesOf(firstRound());
    const start = indexOfBlock(lines, RULES);
    assert.equal(lines[start - 1], '- src/health.ts', 'the last scope path is the line before the block');
    assert.deepEqual(lines.slice(start + RULES.length, start + RULES.length + 2), ['', 'ANSWER']);
  });

  it('a first-round prompt does not carry the revision note', () => {
    assert.equal(count(linesOf(firstRound()), REVISION_NOTE), 0);
  });
});

describe('the revision note (B2)', () => {
  it('a revision prompt holds the note once, right after the whole feedback', () => {
    const work = revisionRound();
    const prompt = plannerPrompt(work);
    assert.equal(count(prompt.split('\n'), REVISION_NOTE), 1);
    assert.ok(prompt.includes(`${work.revision!.feedback}\n${REVISION_NOTE}\n`), 'the note follows the feedback\'s last line');
  });

  it('the rules come after the note in a revision prompt', () => {
    const lines = linesOf(revisionRound());
    const note = lines.indexOf(REVISION_NOTE);
    const rules = indexOfBlock(lines, RULES);
    assert.notEqual(rules, -1);
    assert.equal(rules, note + 1, 'the block starts on the line after the note');
  });
});

describe('one answer (B3)', () => {
  for (const [name, work] of [['first round', firstRound()], ['revision', revisionRound()]] as const) {
    it(`is the prompt's last line, once (${name})`, () => {
      const lines = linesOf(work);
      assert.equal(lines.at(-1), ANSWER_ONCE);
      assert.equal(count(lines, ANSWER_ONCE), 1);
    });
  }
});

describe('every earlier line is kept (B4)', () => {
  for (const [name, work] of [['first round', firstRound()], ['revision', revisionRound()]] as const) {
    it(`taking out B1, B2 and B3 gives the prompt before the act, line for line (${name})`, () => {
      const lines = linesOf(work);
      const start = indexOfBlock(lines, RULES);
      assert.notEqual(start, -1);
      lines.splice(start, RULES.length);
      if (work.revision !== undefined) {
        const note = lines.indexOf(REVISION_NOTE);
        assert.notEqual(note, -1);
        lines.splice(note, 1);
      }
      assert.equal(lines.pop(), ANSWER_ONCE);
      assert.deepEqual(lines, promptBeforeTheAct(work).split('\n'));
    });
  }
});
