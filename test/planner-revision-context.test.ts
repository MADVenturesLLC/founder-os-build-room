/**
 * A revision round gives the Planner its earlier plan
 * (FOUNDER-ACT-20261109-BR-PLANNER-REVISION-CONTEXT, Part B).
 *
 * Rehearsals R4 and R5 showed each revision round dropping or changing true
 * statements of the earlier plan that the Founder's feedback had not touched:
 * a revision carried the feedback and the earlier plan's hash only, and agy
 * starts afresh each round, so the Planner wrote each plan anew. The act adds
 * the earlier plan's document to the revision on the wire (B1), which the
 * control plane binds to the recorded hash (B2, tested in
 * planner-loop.storage.test.ts), and tells the Planner to revise that plan
 * rather than replace it (B3), changing no other line of the prompt (B4).
 *
 * The expected lines are the act's text, written out here rather than read
 * from the source, so a change to the prompt cannot pass by changing both.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLANDOC_SCHEMA_V1 } from '../packages/seat-output-schema/src/index.js';
import { plannerPrompt } from '../packages/gateway-daemon/src/index.js';
import {
  MAX_PLANNER_PAYLOAD_BYTES,
  validatePlannerRequest,
  type PlannerWorkWire,
} from '../packages/gateway-protocol/src/index.js';

/** B3, in order: the two instruction lines, a blank line, the heading; the plan's JSON follows. */
const REVISE =
  'Your earlier plan follows, exactly as the control plane stored it. Revise that plan; do not write a new one. Make each correction and change the feedback asks for, and treat each correction as true. Keep every other statement of the earlier plan as it is, unless the feedback asks you to change it, you find in the checkout that it is false, or you must remove it to keep within rule 6 below. Add nothing the feedback does not ask for. Take repository, base_sha and work_id from the ANSWER section, not from the earlier plan.';
const RULES_SCOPE =
  'Rules 1, 2 and 5 below apply to what you add or change in this round. A statement you keep unchanged from the earlier plan needs no new reading.';
const HEADING = 'EARLIER PLAN';

/** B2 of FOUNDER-ACT-20261108-BR-PLANNER-PROMPT-GROUNDING: the line B3 removes. */
const OLD_NOTE =
  'You do not have the earlier plan, only this feedback on it. Treat each correction in the feedback as true, and check everything else against the checkout as the rules below say.';

/**
 * The prompt as it was at f90506b34ba2abd4fd6318e58a6aacb03a602333, before this act,
 * written out: B4 keeps every one of these lines but OLD_NOTE, word for word and in order.
 */
function promptAtF90506b(work: PlannerWorkWire): string {
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
    lines.push(OLD_NOTE);
  }
  lines.push(
    '',
    'HOW TO WRITE THE PLAN',
    '1. Name a file, directory, function, type, constant, route, table, field, environment variable, error code, script, test or value only if you saw it in this checkout during this turn, in a file you opened or a directory you listed. If you did not see it, describe the behaviour in plain words or leave it out. Never name something because it seems likely to exist.',
    '2. Give a line number or a range of lines only for lines you read, and quote only text you read.',
    '3. Name only what the plan needs. A plan does not need every function, constant or error code of the code it describes.',
    '4. You cannot run commands, so you do not know whether any test, lint, type check or other check passes at this commit. Do not say that one passes or fails. Where the plan relies on a check, require only that the change adds no new failure to it compared with this commit.',
    '5. Before you answer, check every name, path, line number and quotation in the plan against what you saw, and remove any you did not see.',
    '6. Keep the whole answer under 25,000 characters.',
    '',
    'ANSWER',
    'Reply with exactly one JSON object and nothing else: no prose, no code fence. It must satisfy this schema, in which `additional_properties: false` means no other key is allowed:',
    JSON.stringify(PLANDOC_SCHEMA_V1),
    `Use "repository": ${JSON.stringify(work.repository)}, "base_sha": ${JSON.stringify(work.baseSha)} and "work_id": ${JSON.stringify(work.commandId)}.`,
    'Set "terminal_status" to "PLAN_READY_FOR_FOUNDER_APPROVAL" only if the plan is complete; otherwise to the blocked or inconclusive status that applies.',
    'Write that object once, at the end of your turn, after you have finished reading.',
  );
  return lines.join('\n');
}

const SHA40 = 'a'.repeat(40);

/** An earlier plan whose text has what a JSON line must escape: line breaks, quotes, a backslash, non-ASCII. */
const EARLIER_PLAN = {
  schema_version: 'plandoc/1',
  objective: 'Describe the health route in the README.',
  current_state: 'The README has no "Health" section.\nIts last section is Verifying.',
  implementation_sequence: ['Add a section after Verifying.', 'Name the route GET /health — it answers {"status":"ok"}.'],
  constraints: 'Paths use / not \\.',
} as const;

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
function revisionRound(earlierPlan: { readonly [key: string]: unknown } = EARLIER_PLAN): PlannerWorkWire {
  return {
    ...firstRound(),
    commandId: 'cmd_planner_fedcba9876543210fedcba9876543210',
    revision: {
      feedback: 'Revise. One statement is false.\n1. The route answers {"ok":true}, not {"status":"ok"}.',
      revisingPlanHash: 'b'.repeat(64),
      earlierPlan,
    },
  };
}

/** An execute request for the work, naming the work's own command. */
function execute<W extends { readonly commandId: string }>(work: W): unknown {
  return {
    requestId: '00000000-0000-4000-8000-0000000000aa',
    kind: 'execute',
    commandId: work.commandId,
    executionId: 'exec-1',
    work,
  };
}

/** An earlier plan whose JSON text is exactly `bytes` UTF-8 bytes long. */
function planOfBytes(bytes: number): { readonly [key: string]: unknown } {
  const shell = JSON.stringify({ objective: '' });
  return { objective: 'x'.repeat(bytes - shell.length) };
}

function count(lines: readonly string[], line: string): number {
  return lines.filter((candidate) => candidate === line).length;
}

describe('the wire carries the earlier plan (B1)', () => {
  it('a revision with its earlier plan is valid, and a first round is unchanged', () => {
    assert.ok(validatePlannerRequest(execute(revisionRound())));
    assert.ok(validatePlannerRequest(execute(firstRound())));
  });

  it('a revision without its earlier plan is refused', () => {
    const work = revisionRound();
    const rest = { feedback: work.revision!.feedback, revisingPlanHash: work.revision!.revisingPlanHash };
    assert.equal(validatePlannerRequest(execute({ ...work, revision: rest })), null);
  });

  it('an earlier plan that is not a plain object is refused', () => {
    for (const earlierPlan of [null, [], ['a'], 'a plan', 7, true]) {
      const work = { ...firstRound(), revision: { feedback: 'Revise.', revisingPlanHash: 'b'.repeat(64), earlierPlan } };
      assert.equal(validatePlannerRequest(execute(work)), null, JSON.stringify(earlierPlan));
    }
  });

  it('a revision with any other member is refused', () => {
    const work = revisionRound();
    assert.equal(validatePlannerRequest(execute({ ...work, revision: { ...work.revision!, earlierPlanHash: 'b'.repeat(64) } })), null);
  });

  it('an earlier plan within the report payload bound passes, and one byte over it is refused', () => {
    assert.equal(new TextEncoder().encode(JSON.stringify(planOfBytes(MAX_PLANNER_PAYLOAD_BYTES))).length, MAX_PLANNER_PAYLOAD_BYTES);
    assert.ok(validatePlannerRequest(execute(revisionRound(planOfBytes(MAX_PLANNER_PAYLOAD_BYTES)))));
    assert.equal(validatePlannerRequest(execute(revisionRound(planOfBytes(MAX_PLANNER_PAYLOAD_BYTES + 1)))), null);
  });

  it('the bound counts UTF-8 bytes, not characters', () => {
    const shell = JSON.stringify({ objective: '' });
    const characters = Math.floor((MAX_PLANNER_PAYLOAD_BYTES - shell.length) / 2) + 1;
    const wide = { objective: 'é'.repeat(characters) };
    assert.ok(JSON.stringify(wide).length <= MAX_PLANNER_PAYLOAD_BYTES, 'within the bound in characters');
    assert.equal(validatePlannerRequest(execute(revisionRound(wide))), null);
  });
});

describe('the prompt revises the earlier plan (B3, B4)', () => {
  it('a revision prompt is the f90506b prompt with the old note replaced by B3, line for line', () => {
    const work = revisionRound();
    const before = promptAtF90506b(work).split('\n');
    const note = before.indexOf(OLD_NOTE);
    assert.notEqual(note, -1);
    const expected = [...before.slice(0, note), REVISE, RULES_SCOPE, '', HEADING, JSON.stringify(EARLIER_PLAN), ...before.slice(note + 1)];
    assert.deepEqual(plannerPrompt(work).split('\n'), expected);
  });

  it('the lines come right after the whole feedback, and the rules right after the plan', () => {
    const work = revisionRound();
    const prompt = plannerPrompt(work);
    assert.ok(prompt.includes(`${work.revision!.feedback}\n${REVISE}\n${RULES_SCOPE}\n\n${HEADING}\n${JSON.stringify(EARLIER_PLAN)}\n\nHOW TO WRITE THE PLAN\n`));
  });

  it('the earlier plan is one line that parses back to the plan', () => {
    const lines = plannerPrompt(revisionRound()).split('\n');
    const heading = lines.indexOf(HEADING);
    assert.notEqual(heading, -1);
    assert.deepEqual(JSON.parse(lines[heading + 1]!), EARLIER_PLAN);
  });

  it('each line of B3 appears once, and the old note nowhere', () => {
    const lines = plannerPrompt(revisionRound()).split('\n');
    for (const line of [REVISE, RULES_SCOPE, HEADING]) assert.equal(count(lines, line), 1, line.slice(0, 40));
    assert.equal(count(lines, OLD_NOTE), 0);
  });

  it('a first-round prompt is the f90506b prompt, byte for byte, with none of B3', () => {
    const prompt = plannerPrompt(firstRound());
    assert.equal(prompt, promptAtF90506b(firstRound()));
    for (const line of [REVISE, RULES_SCOPE, HEADING]) assert.equal(count(prompt.split('\n'), line), 0, line.slice(0, 40));
  });
});
