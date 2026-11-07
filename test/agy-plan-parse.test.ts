/**
 * The Gateway's reading of agy's final answer as a plan document
 * (FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS B1, the Founder's "Fix it"
 * of 2026-11-06).
 *
 * Round 2 of R1 returned 46,961 characters of one-line JSON with one
 * backslash that JSON does not allow, at character 38,890, and the strict
 * parse threw the whole plan away. A failed strict parse now gets one more
 * try, with each such backslash read as a literal backslash; the closing
 * evidence record says how many. Valid documents never reach the repair, and
 * every other kind of broken answer is refused as before.
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
  repairInvalidEscapes,
  type Launch,
} from '../packages/gateway-daemon/src/index.js';
import type { PlannerWorkWire } from '../packages/gateway-protocol/src/index.js';
import { uuid } from './gateway-helpers.js';

const BS = '\\';
const FAKE_AGY = fileURLToPath(new URL('./support/fake-agy.js', import.meta.url));
const AGY_HASH = 'e'.repeat(64);
const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('repairInvalidEscapes', () => {
  it('copies every escape JSON allows, an escaped backslash among them, and counts nothing', () => {
    const valid = ['"', BS, '/', 'b', 'f', 'n', 'r', 't', 'u00e9', 'uABCD'].map((e) => `${BS}${e}`).join(' ');
    assert.deepEqual(repairInvalidEscapes(valid), { text: valid, count: 0 });
    const escapedThenUnderscore = `command${BS}${BS}_journal`;
    assert.deepEqual(repairInvalidEscapes(escapedThenUnderscore), { text: escapedThenUnderscore, count: 0 });
  });

  it('doubles each backslash that begins no allowed escape, and counts each', () => {
    assert.deepEqual(repairInvalidEscapes(`a${BS}_b`), { text: `a${BS}${BS}_b`, count: 1 });
    assert.deepEqual(repairInvalidEscapes(`${BS}s+ ${BS}| ${BS}$`), { text: `${BS}${BS}s+ ${BS}${BS}| ${BS}${BS}$`, count: 3 });
    assert.deepEqual(repairInvalidEscapes(`${BS}u12`), { text: `${BS}${BS}u12`, count: 1 }, 'a \\u without four hex digits');
    assert.deepEqual(repairInvalidEscapes(`end${BS}`), { text: `end${BS}${BS}`, count: 1 }, 'a lone final backslash');
  });
});

describe('parsePlanResponse', () => {
  it('parses a valid document strictly, with nothing repaired', () => {
    const document = { objective: `a ${BS} b`, nested: { list: ['x', 'y'] } };
    assert.deepEqual(parsePlanResponse(JSON.stringify(document)), { document, invalidEscapesRepaired: 0 });
    assert.deepEqual(parsePlanResponse(`\`\`\`json\n${JSON.stringify(document)}\n\`\`\``), { document, invalidEscapesRepaired: 0 });
  });

  it('reads the R1 shape: one-line JSON with a backslash JSON does not allow, deep inside a string', () => {
    const text = `{"objective":"${'x'.repeat(38_000)}","current_state":"the tables command${BS}_journal${BS}_events and br${BS}_app${BS}_runtime"}`;
    assert.throws(() => JSON.parse(text), 'the strict parse refuses it');
    const parsed = parsePlanResponse(text);
    assert.equal(parsed.invalidEscapesRepaired, 4);
    const document = parsed.document as Record<string, string>;
    assert.equal(document['current_state'], `the tables command${BS}_journal${BS}_events and br${BS}_app${BS}_runtime`, 'every character the model wrote is kept');
    assert.equal(document['objective']?.length, 38_000);
  });

  it('repairs inside a fenced block too', () => {
    const parsed = parsePlanResponse(`\`\`\`json\n{"a":"x${BS}.y"}\n\`\`\``);
    assert.deepEqual(parsed, { document: { a: `x${BS}.y` }, invalidEscapesRepaired: 1 });
  });

  it('still refuses an answer broken any other way, repairable backslashes or not', () => {
    for (const text of [
      '{"a":"unterminated}',
      `{"a":"x${BS}_y"`,
      `I corrected the facts. {"a":"x${BS}_y"}`,
      'plan: {"a":1}',
      '{"a":1} trailing',
      '',
    ]) {
      assert.throws(() => parsePlanResponse(text), text.slice(0, 30));
    }
  });

  it('keeps planDocumentFrom as the document alone', () => {
    assert.deepEqual(planDocumentFrom('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(planDocumentFrom(`{"a":"x${BS}_y"}`), { a: `x${BS}_y` });
    assert.throws(() => planDocumentFrom('plan: {"a":1}'));
  });
});

/** The executor with the fake agy answering exactly `response`, as the suite's harness starts it. */
function executorAnswering(response: string): { executor: AgyPlannerExecutor; gatewayDirectory: string } {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-agy-parse-'));
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

describe('AgyPlannerExecutor: the closing record of a repaired plan', () => {
  it('returns the plan, and records how many backslashes were read as literal', async () => {
    const { result, evidence } = await run(`{"objective":"tables quokka${BS}_ledger${BS}_wombat"}`);
    assert.deepEqual(result, { kind: 'plan', document: { objective: `tables quokka${BS}_ledger${BS}_wombat` } });
    assert.equal(evidence['outcome'], 'plan');
    assert.equal(evidence['invalidEscapesRepaired'], 2);
    assert.doesNotMatch(JSON.stringify(evidence), /quokka|ledger|wombat/, 'no text agy wrote is kept');
  });

  it('records nothing about a repair for a plan that parsed strictly', async () => {
    const { result, evidence } = await run('{"objective":"plain"}');
    assert.deepEqual(result, { kind: 'plan', document: { objective: 'plain' } });
    assert.equal(evidence['outcome'], 'plan');
    assert.equal('invalidEscapesRepaired' in evidence, false);
  });

  it('still ends unparseable_plan when the repair does not make the answer JSON, and records no repair', async () => {
    const { result, evidence } = await run(`{"objective":"x${BS}_y"`);
    assert.match(String((result as { failed?: string }).failed), /unparseable_plan/);
    assert.equal(evidence['outcome'], 'unparseable_plan');
    assert.equal('invalidEscapesRepaired' in evidence, false);
  });
});
