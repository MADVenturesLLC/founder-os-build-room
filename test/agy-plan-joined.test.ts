/**
 * The Gateway's reading of an agy result that holds more than one answer
 * (FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS B1, the Founder's "Fix it"
 * of 2026-11-08).
 *
 * agy's result joins every text the Planner writes in its turn. In round 3 of
 * rehearsal R3 the Planner wrote a complete answer (23,851 bytes), read nine
 * more files, and wrote a second complete answer (24,319 bytes, a valid
 * 30-key object); agy returned both as 48,172 bytes, and the Gateway refused
 * the whole as unparseable_plan. A response made only of complete answers is
 * now read as its last; the closing evidence record says how many there were.
 * Every other broken answer is refused as before.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGY_PLANNER_ROUTE,
  AgyPlannerExecutor,
  parsePlanResponse,
  planDocumentFrom,
  type Launch,
} from '../packages/gateway-daemon/src/index.js';
import type { PlannerWorkWire } from '../packages/gateway-protocol/src/index.js';
import { uuid } from './gateway-helpers.js';

const BS = '\\';
const FENCE = '```';
const FAKE_AGY = fileURLToPath(new URL('./support/fake-agy.js', import.meta.url));
const AGY_HASH = 'e'.repeat(64);
const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A plan-shaped object of roughly `size` characters as one-line JSON, its strings full of brackets and quotes. */
function planOfAbout(size: number, marker: string): Record<string, unknown> {
  const steps: string[] = [];
  let length = 0;
  for (let i = 0; length < size; i += 1) {
    const step = `Step ${i}: in README.md under ## Status, keep {"braces"} and [brackets] and a "quote" (${marker}).`;
    steps.push(step);
    length += step.length + 8;
  }
  return { schema_version: 'plandoc/1', objective: `objective ${marker}`, implementation_sequence: steps };
}

describe('parsePlanResponse: a response that holds more than one answer', () => {
  it('reads the R3 shape, two complete plans joined by a blank line, as the last', () => {
    const first = planOfAbout(23_800, 'draft');
    const last = planOfAbout(24_300, 'final');
    const text = `${JSON.stringify(first)}\n\n${JSON.stringify(last)}`;
    assert.throws(() => JSON.parse(text), 'the joined text is not one document');
    const parsed = parsePlanResponse(text);
    assert.deepEqual(parsed.document, last);
    assert.equal(parsed.answersJoined, 2);
    assert.equal(parsed.invalidEscapesRepaired, 0);
  });

  it('reads the last of answers joined by any whitespace, or none', () => {
    for (const join of ['', ' ', '\n', '\r\n', '\n\n\t ']) {
      const parsed = parsePlanResponse(`{"n":1}${join}{"n":2}`);
      assert.deepEqual(parsed.document, { n: 2 }, JSON.stringify(join));
      assert.equal(parsed.answersJoined, 2);
    }
    const padded = parsePlanResponse('  \n{"n":1}\n\n{"n":2}\n  ');
    assert.deepEqual(padded.document, { n: 2 });
  });

  it('reads the last of three or more', () => {
    const parsed = parsePlanResponse('{"n":1}\n\n{"n":2}\n\n{"n":3}');
    assert.deepEqual(parsed.document, { n: 3 });
    assert.equal(parsed.answersJoined, 3);
  });

  it('reads fenced answers, alone or beside bare ones', () => {
    const twoFenced = `${FENCE}json\n{"n":1}\n${FENCE}\n\n${FENCE}json\n{"n":2}\n${FENCE}`;
    assert.deepEqual(parsePlanResponse(twoFenced).document, { n: 2 });
    assert.equal(parsePlanResponse(twoFenced).answersJoined, 2);
    const fencedThenBare = `${FENCE}\n{"n":1}\n${FENCE}\n{"n":2}`;
    assert.deepEqual(parsePlanResponse(fencedThenBare).document, { n: 2 });
    const bareThenFenced = `{"n":1}\n${FENCE}json\n{"n":2}\n${FENCE}`;
    assert.deepEqual(parsePlanResponse(bareThenFenced).document, { n: 2 });
  });

  it('does not end an answer at a brace, bracket or escaped quote inside a string', () => {
    const tricky = `{"a":"} { ] [ ${BS}" }","b":[{"c":"}"}]}`;
    const parsed = parsePlanResponse(`${tricky}\n\n{"n":2}`);
    assert.deepEqual(parsed.document, { n: 2 });
    assert.equal(parsed.answersJoined, 2);
    const lastTricky = parsePlanResponse(`{"n":1}\n${tricky}`);
    assert.deepEqual(lastTricky.document, JSON.parse(tricky));
  });

  it('repairs backslashes inside joined answers, and counts those of the answer it reads', () => {
    const parsed = parsePlanResponse(`{"a":"x${BS}_y"}\n\n{"b":"p${BS}_q${BS}_r"}`);
    assert.deepEqual(parsed.document, { b: `p${BS}_q${BS}_r` });
    assert.equal(parsed.answersJoined, 2);
    assert.equal(parsed.invalidEscapesRepaired, 2);
    const firstOnly = parsePlanResponse(`{"a":"x${BS}_y"}\n\n{"b":"plain"}`);
    assert.deepEqual(firstOnly.document, { b: 'plain' });
    assert.equal(firstOnly.invalidEscapesRepaired, 0);
  });

  it('reads one answer exactly as before, with no count', () => {
    assert.deepEqual(parsePlanResponse('{"a":1}'), { document: { a: 1 }, invalidEscapesRepaired: 0 });
    assert.deepEqual(parsePlanResponse(`${FENCE}json\n{"a":1}\n${FENCE}`), { document: { a: 1 }, invalidEscapesRepaired: 0 });
    assert.deepEqual(parsePlanResponse(`{"a":"x${BS}_y"}`), { document: { a: `x${BS}_y` }, invalidEscapesRepaired: 1 });
    assert.deepEqual(parsePlanResponse('[{"a":1},{"b":2}]'), { document: [{ a: 1 }, { b: 2 }], invalidEscapesRepaired: 0 });
  });

  it('still refuses anything that is not answers alone, each complete', () => {
    for (const text of [
      'Here is the plan: {"n":1}\n\n{"n":2}',
      '{"n":1}\n\nHere is the revised plan:\n\n{"n":2}',
      '{"n":1}\n\n{"n":2}\n\nDone.',
      '{"n":1} and {"n":2}',
      '{"n":1}\n\n{"n":',
      '{"n":"cut} {"n":2}',
      '{"n":1}\n\n[1,2]',
      '[1,2]\n\n{"n":1}',
      '{"n":1}\n\nnull',
      '{"n":1}\n\n{"n":2,}',
      '{"n":1,}\n\n{"n":2}',
      '{"n":1} {"n":2} }',
      `{"n":1}\n${FENCE}json\n{"n":2}`,
      `{"n":1}\n${FENCE}json\n{"n":2,}\n${FENCE}`,
      `${FENCE}json\n[1,2]\n${FENCE}\n{"n":2}`,
      `{"n":1}\n${FENCE}json\nnull\n${FENCE}`,
      `${FENCE}json\n{"n":1}\n\n{"n":2}\n${FENCE}`,
    ]) {
      assert.throws(() => parsePlanResponse(text), text.slice(0, 40));
    }
  });

  it('keeps planDocumentFrom as the document alone', () => {
    assert.deepEqual(planDocumentFrom('{"n":1}\n\n{"n":2}'), { n: 2 });
    assert.throws(() => planDocumentFrom('{"n":1}\n\nthen {"n":2}'));
  });
});

/** The executor with the fake agy answering exactly `response`, as the parse suite's harness starts it. */
function executorAnswering(response: string): { executor: AgyPlannerExecutor; gatewayDirectory: string } {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-agy-joined-'));
  roots.push(root);
  const gatewayDirectory = join(root, 'gateway');
  mkdirSync(gatewayDirectory);
  const checkoutParent = join(root, 'checkouts');
  mkdirSync(checkoutParent);
  const launch: Launch = (file, args, launchOptions) => {
    assert.equal(file, '/usr/bin/sudo');
    return spawn(process.execPath, [FAKE_AGY, ...args], {
      cwd: launchOptions.cwd,
      stdio: 'pipe',
      env: { ...process.env, FAKE_AGY_MODE: 'ok', FAKE_AGY_LOG: join(root, 'fake.log'), FAKE_AGY_PLAN: response },
    });
  };
  const executor = new AgyPlannerExecutor(
    {
      sudoPath: '/usr/bin/sudo',
      plannerUser: 'buildroom-planner',
      agyPath: '/opt/agy/bin/agy',
      agySha256: AGY_HASH,
      checkoutParent,
      gatewayDirectory,
    },
    {
      launch,
      probe: () => Promise.resolve(false),
      reap: () => Promise.resolve(),
      hashFile: () => Promise.resolve(AGY_HASH),
      checkout: async (_work, parent) => mkdtemp(join(parent, 'run-')),
      timings: { initTimeoutMs: 3_000, runTimeoutMs: 5_000, stopGraceMs: 1_000, reapSettleMs: 300 },
    },
  );
  return { executor, gatewayDirectory };
}

function work(): PlannerWorkWire {
  return {
    commandId: uuid(),
    roomId: uuid(),
    repository: 'MADVenturesLLC/example',
    baseSha: 'a'.repeat(40),
    scopePaths: ['src/health.ts'],
    goalEventId: uuid(),
    goal: 'Add an uptime field to the health route.',
    goalDigest: 'c'.repeat(64),
  };
}

function evidenceOf(gatewayDirectory: string): Record<string, unknown> {
  const directory = join(gatewayDirectory, 'planner-evidence');
  const [name] = readdirSync(directory).filter((n) => n.endsWith('.json'));
  return JSON.parse(readFileSync(join(directory, name ?? ''), 'utf8')) as Record<string, unknown>;
}

async function run(response: string): Promise<{ result: unknown; evidence: Record<string, unknown> }> {
  const { executor, gatewayDirectory } = executorAnswering(response);
  const w = work();
  const identity = await executor.attest({ commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } });
  const started = await executor.start(w, identity);
  assert.equal(started.kind, 'accepted');
  if (started.kind !== 'accepted') throw new Error('not accepted');
  const result = await started.completion.catch((error: unknown) => ({ failed: String(error) }));
  return { result, evidence: evidenceOf(gatewayDirectory) };
}

describe('AgyPlannerExecutor: the closing record of joined answers', () => {
  it('returns the last answer as the plan, and records how many answers there were', async () => {
    const { result, evidence } = await run('{"objective":"draft quokka"}\n\n{"objective":"final wombat"}');
    assert.deepEqual(result, { kind: 'plan', document: { objective: 'final wombat' } });
    assert.equal(evidence['outcome'], 'plan');
    assert.equal(evidence['answersJoined'], 2);
    assert.equal('invalidEscapesRepaired' in evidence, false);
    assert.doesNotMatch(JSON.stringify(evidence), /quokka|wombat|draft|final/, 'no text agy wrote is kept');
  });

  it('records both a repair and the count when the last answer needed one', async () => {
    const { result, evidence } = await run(`{"objective":"draft"}\n\n{"objective":"p${BS}_q"}`);
    assert.deepEqual(result, { kind: 'plan', document: { objective: `p${BS}_q` } });
    assert.equal(evidence['answersJoined'], 2);
    assert.equal(evidence['invalidEscapesRepaired'], 1);
  });

  it('records nothing about answers for a plan that was one answer', async () => {
    const { evidence } = await run('{"objective":"plain"}');
    assert.equal(evidence['outcome'], 'plan');
    assert.equal('answersJoined' in evidence, false);
  });

  it('still ends unparseable_plan when one of the answers is broken, and records no count', async () => {
    const { result, evidence } = await run('{"objective":"draft"}\n\n{"objective":');
    assert.match(String((result as { failed?: string }).failed), /unparseable_plan/);
    assert.equal(evidence['outcome'], 'unparseable_plan');
    assert.equal('answersJoined' in evidence, false);
  });
});
