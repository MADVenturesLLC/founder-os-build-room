/**
 * A1 — provider-free planner admission fixture (Background-Agents work
 * package A, first slice).
 *
 * Commission: FOUNDER COMMISSION — BACKGROUND-AGENT ADAPTATION: A0 / A1 ONLY
 * (2026-09-12), over handoff BR-Builder-Background-Agents-Handoff-r2.md
 * (reviewed body SHA-256
 * acd9be05153da4e0c77faa92a934dd679ab020650c37dcce1a0ff4bb1244c77a,
 * PROCEED-WITH-PLAN plan review).
 *
 * Proves, with NO provider, database, Keychain, or Gateway:
 * 1. the real registry seat-policy gate refuses while the real cost meter
 *    permits, and the fake invocation is never reached (0 calls);
 * 2. the real cost meter refuses while a clearly-labelled synthetic policy
 *    permits, and the fake invocation is never reached (0 calls);
 * 3. both gates can refuse together, both negative decisions preserved;
 * 4. a reachable positive control completes the fake invocation exactly
 *    once, with policy/cost evaluated BEFORE invocation (trace order);
 * 5. a fake invocation failure returns `failed` without serializing the
 *    raw exception message (FAKE_SECRET_SENTINEL never appears);
 * 6. malformed token counts are refused by the existing meter contract
 *    (token_inputs limb pauses; unknown accounting is never converted to
 *    zero);
 * 7. a thrown policy callback propagates BEFORE invocation (0 calls);
 * 8. current-behavior characterization: spent 700 / reserved 0 / ceiling
 *    1000 / request 300 / perRunTokenCap 300 — the EXCLUSIVE per-room limb
 *    refuses. This is pinned characterization of the current non-compliant
 *    meter at this base (meter.ts perRoomTokenLimb includes
 *    requestedTokens), NOT the ruled comparison. DEC-20260815-16 §Ceiling
 *    Inclusivity Clarified (2026-08-29) rules the comparison "refuse when
 *    spent + reserved >= ceiling"; the per-run cap cannot explain this
 *    refusal (300 > 300 is false). A separately authorized WF-04 Step 3
 *    meter correction must update this expectation within that
 *    correction's scope; never revert a compliant correction to keep this
 *    test green.
 * 9. an import-boundary detector rejects runtime references to
 *    planner-admission-fixture from production locations (control-plane,
 *    gateway-daemon, gateway-cli, run-harness production entry points) and
 *    the detector itself is proven with a synthetic forbidden import.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import {
  accountingInstant,
  type DispatchRequest,
} from '../packages/cost-meter/src/index.js';
// Direct seat-policy.js import (not the package barrel) per the handoff's
// Revision 2 narrowing: the fixture consumes the gate, not the control-plane
// server surface.
import { createSeatPolicyGate } from '../packages/control-plane/src/seat-policy.js';
import {
  runPlannerAdmissionFixture,
  type FixturePolicyVerdict,
} from '../packages/run-harness/src/planner-admission-fixture.js';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function request(overrides: Partial<DispatchRequest> = {}): DispatchRequest {
  return {
    asOf: accountingInstant(2026, 9, 11),
    ledger: { infrastructure: [], runs: [] },
    budget: {
      roomId: 'fixture-room',
      tokenCeiling: 1000,
      tokensSpent: 0,
      tokensReserved: 0,
      perRunTokenCap: 100,
    },
    requestedTokens: 50,
    priceTable: { hasVersion: () => false, rateFor: () => null },
    ...overrides,
  };
}

function budget(overrides: Partial<DispatchRequest['budget']> = {}): DispatchRequest['budget'] {
  return {
    roomId: 'fixture-room',
    tokenCeiling: 1000,
    tokensSpent: 0,
    tokensReserved: 0,
    perRunTokenCap: 100,
    ...overrides,
  };
}

const SYNTHETIC_ALLOW: FixturePolicyVerdict = {
  allowed: true,
  source: 'synthetic-fixture',
  reason: 'test only — synthetic-fixture authority, never a production grant',
};

/* ------------------------------------------------------------------ */
/* 1–4: the admission gates                                            */
/* ------------------------------------------------------------------ */

describe('A1 planner admission fixture — gates and invocation', () => {
  it('1. real registry refusal prevents invocation while cost permits', async () => {
    let calls = 0;
    // The REAL production seat policy gate, default (registry) binding.
    // The V1 registry never resolves a seat, so the real binding refuses —
    // that refusal is exactly what must be preserved through the fixture.
    const actual = createSeatPolicyGate().evaluateDispatch({ seat_id: 'builder' });
    assert.equal(actual.kind, 'refused');
    assert.equal(actual.allowed, false);

    const result = await runPlannerAdmissionFixture(request(), {
      policy: () => ({
        allowed: actual.allowed,
        source: 'registry',
        reason: actual.reason,
      }),
      invokeFixture: async () => {
        calls += 1;
      },
    });

    assert.equal(result.cost.permit, true, 'cost must permit in this case');
    assert.equal(result.policy.allowed, false);
    assert.equal(result.outcome, 'refused');
    assert.equal(calls, 0, 'invocation must not run when policy refuses');
  });

  it('2. cost refusal prevents invocation independently of policy', async () => {
    let calls = 0;
    const result = await runPlannerAdmissionFixture(
      request({ budget: budget({ tokensSpent: 1000 }) }),
      {
        policy: () => SYNTHETIC_ALLOW,
        invokeFixture: async () => {
          calls += 1;
        },
      },
    );

    assert.equal(result.policy.allowed, true, 'clearly synthetic policy permits');
    assert.equal(
      result.policy.source,
      'synthetic-fixture',
      'synthetic positive authority is explicitly labelled',
    );
    assert.equal(result.cost.permit, false, 'real meter must refuse');
    assert.equal(result.outcome, 'refused');
    assert.equal(calls, 0);
  });

  it('3. both gates can refuse together, both negatives preserved', async () => {
    let calls = 0;
    const result = await runPlannerAdmissionFixture(
      request({ budget: budget({ tokensSpent: 1000 }) }),
      {
        policy: () => ({
          allowed: false,
          source: 'registry',
          reason: 'fixture registry refusal (test)',
        }),
        invokeFixture: async () => {
          calls += 1;
        },
      },
    );

    assert.equal(result.policy.allowed, false, 'policy negative decision preserved');
    assert.equal(result.cost.permit, false, 'cost negative decision preserved');
    assert.equal(result.outcome, 'refused');
    assert.equal(calls, 0);
    // The full cost record (limbs) survives alongside the policy verdict.
    const paused = result.cost.pausedBy.map((limb) => limb.limb);
    assert.ok(paused.includes('per_room_tokens'), `per-room limb paused: ${paused.join(',')}`);
  });

  it('4. positive control: fake invocation completes exactly once, gates evaluated before it', async () => {
    let calls = 0;
    const order: string[] = [];
    const result = await runPlannerAdmissionFixture(request(), {
      policy: () => {
        order.push('policy');
        return SYNTHETIC_ALLOW;
      },
      invokeFixture: async () => {
        order.push('invoke');
        calls += 1;
      },
    });

    assert.equal(result.fixture, true);
    assert.equal(result.outcome, 'completed');
    assert.equal(calls, 1, 'fake invocation ran exactly once');
    assert.deepEqual(order, ['policy', 'invoke'], 'policy evaluated before invocation');
    assert.deepEqual(result.trace, [
      'policy_evaluated',
      'cost_evaluated',
      'fixture_invoked',
    ]);
  });

  it('5. invocation failure is explicit and does not serialize the raw error', async () => {
    const result = await runPlannerAdmissionFixture(request(), {
      policy: () => SYNTHETIC_ALLOW,
      invokeFixture: async () => {
        throw new Error('FAKE_SECRET_SENTINEL');
      },
    });

    assert.equal(result.outcome, 'failed');
    assert.equal(
      JSON.stringify(result).includes('FAKE_SECRET_SENTINEL'),
      false,
      'raw exception text must not be serialized',
    );
  });

  it('6. malformed token counts are refused by the existing meter contract (never zero)', async () => {
    let calls = 0;
    const result = await runPlannerAdmissionFixture(
      request({ budget: budget({ tokensSpent: Number.NaN }), requestedTokens: 50 }),
      {
        policy: () => SYNTHETIC_ALLOW,
        invokeFixture: async () => {
          calls += 1;
        },
      },
    );

    assert.equal(result.cost.permit, false, 'NaN inputs must pause, not pass as zero');
    const inputs = result.cost.limbs.find((limb) => limb.limb === 'token_inputs');
    assert.ok(inputs, 'token_inputs limb present');
    assert.equal(inputs?.verdict, 'pause');
    assert.equal(result.outcome, 'refused');
    assert.equal(calls, 0);

    // Negative requestedTokens likewise refuses (a negative would otherwise
    // BUY room under the ceiling — the existing contract pauses instead).
    const neg = await runPlannerAdmissionFixture(request({ requestedTokens: -1 }), {
      policy: () => SYNTHETIC_ALLOW,
      invokeFixture: async () => {
        calls += 1;
      },
    });
    assert.equal(neg.cost.permit, false);
    assert.equal(neg.outcome, 'refused');
    assert.equal(calls, 0);
  });

  it('7. a thrown policy callback propagates before invocation', async () => {
    let calls = 0;
    await assert.rejects(
      runPlannerAdmissionFixture(request(), {
        policy: () => {
          throw new Error('policy callback exploded');
        },
        invokeFixture: async () => {
          calls += 1;
        },
      }),
      /policy callback exploded/,
    );
    assert.equal(calls, 0, 'invocation must not run when the policy callback throws');
  });

  it('8. CHARACTERIZATION (current base): exclusive meter refuses 700 + 300 request at ceiling 1000 — not the ruled comparison, and the per-run cap cannot explain it', async () => {
    let calls = 0;
    const result = await runPlannerAdmissionFixture(
      request({
        budget: budget({ tokensSpent: 700, tokensReserved: 0, tokenCeiling: 1000, perRunTokenCap: 300 }),
        requestedTokens: 300,
      }),
      {
        policy: () => SYNTHETIC_ALLOW,
        invokeFixture: async () => {
          calls += 1;
        },
      },
    );

    assert.equal(result.policy.allowed, true);
    assert.equal(result.cost.permit, false, 'CURRENT exclusive per-room limb refuses');
    assert.equal(result.outcome, 'refused');
    assert.equal(calls, 0);

    // Label the refusal as the exclusive limb — the distinguishing boundary.
    const perRoom = result.cost.limbs.find((limb) => limb.limb === 'per_room_tokens');
    assert.ok(perRoom, 'per_room_tokens limb present');
    assert.equal(perRoom?.verdict, 'pause');
    // And prove the per-run cap is NOT what refused: request == cap.
    const perRun = result.cost.limbs.find((limb) => limb.limb === 'per_run_cap');
    assert.ok(perRun);
    assert.notEqual(perRun?.verdict, 'pause', 'per-run cap must not explain this refusal');
    // The ruled comparison (DEC-20260815-16 §Ceiling Inclusivity Clarified,
    // 2026-08-29) — refuse when spent + reserved >= ceiling — would PERMIT
    // here (700 < 1000). This test pins the observed EXCLUSIVE behavior of
    // the current implementation only; see the file header note.
  });
});

/* ------------------------------------------------------------------ */
/* 9: import-boundary detector                                         */
/* ------------------------------------------------------------------ */

/** Recursively collect .ts files under a directory (skipping dist); a missing directory yields no files. */
function tsFilesUnder(root: string): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'dist' || entry === 'node_modules' || entry.startsWith('.')) continue;
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (p.endsWith('.ts')) out.push(p);
    }
  };
  walk(root);
  return out;
}

/**
 * Locate the repository worktree root from the running test file: walk up
 * from this file's directory until package.json appears (source layout:
 * <root>/test/…; compiled layout: <root>/dist/test/…).
 */
function findWorktreeRoot(): string {
  let dir = import.meta.dirname;
  for (let i = 0; i < 5; i += 1) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('worktree root not found: no package.json above the test file');
}

/**
 * Scan PRODUCTION sources for runtime references to the fixture module.
 * Production locations (per the handoff): packages/control-plane,
 * packages/gateway-daemon, packages/gateway-cli, and the run-harness
 * production entry points (everything under packages/run-harness/src
 * EXCEPT planner-admission-fixture.ts itself). Tests and docs are
 * excluded — they are the fixture's legitimate consumers.
 *
 * Returns the violations plus the list of files actually scanned, so the
 * caller can assert the scan was non-vacuous (a mis-resolved root must
 * fail loudly, not pass silently with an empty file set).
 */
function findForbiddenFixtureReferences(
  worktreeRoot: string,
): { violations: string[]; checked: string[] } {
  const violations: string[] = [];
  const forbiddenRoots = [
    join(worktreeRoot, 'packages/control-plane/src'),
    join(worktreeRoot, 'packages/gateway-daemon/src'),
    join(worktreeRoot, 'packages/gateway-cli/src'),
  ];
  // Run-harness production entry points: every .ts under src except the
  // fixture module itself (matched by EXACT path, so a same-basename file
  // in another production root is still scanned).
  const harnessSrc = join(worktreeRoot, 'packages/run-harness/src');
  const fixturePath = join(harnessSrc, 'planner-admission-fixture.ts');
  const checked: string[] = [];
  for (const root of [...forbiddenRoots, harnessSrc]) {
    for (const file of tsFilesUnder(root)) {
      if (file === fixturePath) continue;
      checked.push(file);
      const text = readFileSync(file, 'utf8');
      for (const hit of runtimeFixtureReferences(text)) {
        violations.push(`${relative(worktreeRoot, file)}: ${hit}`);
      }
    }
  }
  return { violations, checked };
}

/**
 * Find RUNTIME references to the fixture module in TypeScript source
 * text. Matching is whole-text (not line-anchored) so wrapped/multi-line
 * import statements and mid-line dynamic forms cannot evade it:
 *
 *   import { x } from '…/planner-admission-fixture.js'   (static)
 *   export { x } from '…/planner-admission-fixture.js'   (re-export)
 *   const m = await import('…/planner-admission-fixture.js')  (dynamic)
 *   const m = require('…/planner-admission-fixture.js')       (CJS)
 *
 * A type-only import (`import type`/`export type`) is erased at runtime
 * and does not put the fixture on a production module graph, so it is
 * exempt. Line-level exemption is decided on the whole statement text
 * surrounding the match: the specifier's enclosing `import`/`export`
 * clause must not be `type`-qualified.
 */
function runtimeFixtureReferences(text: string): string[] {
  const hits: string[] = [];
  // Strip block and line comments so commented-out code cannot be (mis)-
  // counted and comment prose cannot mask a real statement.
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');
  const specifier = /['"][^'"]*planner-admission-fixture[^'"]*['"]/g;
  for (const match of stripped.matchAll(specifier)) {
    const idx = match.index ?? 0;
    // Reject type-only specifiers: `import type ... '<spec>'` /
    // `export type ... '<spec>'`. Walk back to the statement start.
    const before = stripped.slice(0, idx);
    const stmtStart = Math.max(
      before.lastIndexOf('import'),
      before.lastIndexOf('export'),
    );
    const clause = stmtStart >= 0 ? before.slice(stmtStart) : '';
    const typeOnly =
      /^import\s+type\b/.test(clause) || /^export\s+type\b/.test(clause);
    if (!typeOnly) {
      const lineNo = stripped.slice(0, idx).split('\n').length;
      hits.push(`line ${lineNo}: …${match[0]}…`);
    }
  }
  return hits;
}

describe('A1 import-boundary detector', () => {
  const worktreeRoot = findWorktreeRoot();

  it('9a. no production location runtime-imports the fixture (scan is empty AND non-vacuous)', () => {
    const { violations, checked } = findForbiddenFixtureReferences(worktreeRoot);
    assert.deepEqual(violations, []);
    // The scan must have actually covered the production sources: assert
    // known production files are in the scanned set, so a mis-resolved or
    // renamed root fails loudly instead of passing vacuously.
    const relChecked = checked.map((f) => relative(worktreeRoot, f));
    for (const anchor of [
      'packages/control-plane/src/server.ts',
      'packages/run-harness/src/cli.ts',
      'packages/gateway-daemon/src/main.ts',
      'packages/gateway-cli/src/index.ts',
    ]) {
      assert.ok(relChecked.includes(anchor), `scan must cover ${anchor}`);
    }
    assert.ok(checked.length >= 60, `scan covered suspiciously few files: ${checked.length}`);
  });

  it('9b. CONTROL: the detector itself detects synthetic forbidden imports (static, wrapped, dynamic, require; type-only and same-basename exempt)', () => {
    // Feed the detector a synthetic production-like source tree containing
    // every runtime reference form of the fixture. An empty scan alone
    // would be insufficient proof that the detector works. Built under the
    // OS temp dir so nothing ever touches the tracked tree.
    const syntheticRoot = join(tmpdir(), `bga-import-detector-control-${process.pid}`);
    const cpDir = join(syntheticRoot, 'packages', 'control-plane', 'src');
    const harnessDir = join(syntheticRoot, 'packages', 'run-harness', 'src');
    const daemonDir = join(syntheticRoot, 'packages', 'gateway-daemon', 'src');
    const cliDir = join(syntheticRoot, 'packages', 'gateway-cli', 'src');

    mkdirRecursive(cpDir);
    mkdirRecursive(harnessDir);
    mkdirRecursive(daemonDir);
    mkdirRecursive(cliDir);

    // 1. single-line static value import (control-plane)
    writeFileSyncUtf8(
      join(cpDir, 'synthetic-static-import.ts'),
      "import { runPlannerAdmissionFixture } from '../../run-harness/src/planner-admission-fixture.js';\nexport const x = runPlannerAdmissionFixture;\n",
    );
    // 2. wrapped/multi-line import — the specifier sits on its own line
    //    (gateway-daemon); a line-anchored detector would miss it.
    writeFileSyncUtf8(
      join(daemonDir, 'synthetic-wrapped-import.ts'),
      "import {\n  runPlannerAdmissionFixture,\n} from '../../run-harness/src/planner-admission-fixture.js';\nexport const y = runPlannerAdmissionFixture;\n",
    );
    // 3. mid-line dynamic import() (gateway-cli)
    writeFileSyncUtf8(
      join(cliDir, 'synthetic-dynamic-import.ts'),
      "export async function load(): Promise<unknown> {\n  return import('../../run-harness/src/planner-admission-fixture.js');\n}\n",
    );
    // 4. require() form (run-harness production sibling)
    writeFileSyncUtf8(
      join(harnessDir, 'synthetic-require.ts'),
      "export const z = require('../src/planner-admission-fixture.js');\n",
    );
    // EXEMPT: type-only import is erased at runtime and must NOT count.
    writeFileSyncUtf8(
      join(harnessDir, 'type-only-file.ts'),
      "import type { AdmissionFixtureResult } from './planner-admission-fixture.js';\nexport type Z = AdmissionFixtureResult | null;\n",
    );
    // EXEMPT: a DIFFERENT file that merely shares the fixture's basename is
    // still a production source and must be scanned — but this one is
    // clean, so it must not appear in violations.
    writeFileSyncUtf8(
      join(daemonDir, 'planner-admission-fixture.ts'),
      'export const unrelated = 1;\n',
    );

    try {
      const { violations, checked } = findForbiddenFixtureReferences(syntheticRoot);
      const names = violations.map((v) => v.split(':')[0]);
      assert.deepEqual(names.sort(), [
        'packages/control-plane/src/synthetic-static-import.ts',
        'packages/gateway-cli/src/synthetic-dynamic-import.ts',
        'packages/gateway-daemon/src/synthetic-wrapped-import.ts',
        'packages/run-harness/src/synthetic-require.ts',
      ].sort());
      // The same-basename file in a production root WAS scanned (not
      // skipped) and produced no violation.
      const relChecked = checked.map((f) => relative(syntheticRoot, f));
      assert.ok(
        relChecked.includes('packages/gateway-daemon/src/planner-admission-fixture.ts'),
        'same-basename production file must be scanned, not skipped',
      );
      assert.ok(!names.includes('packages/run-harness/src/type-only-file.ts'));
    } finally {
      rmRecursive(syntheticRoot);
    }
  });
});

/* Small fs helpers kept local so this test introduces no new deps. */
import { mkdirSync, writeFileSync as writeFileSyncNode, rmSync } from 'node:fs';
function mkdirRecursive(dir: string): void {
  mkdirSync(dir, { recursive: true });
}
function writeFileSyncUtf8(path: string, text: string): void {
  writeFileSyncNode(path, text, 'utf8');
}
function rmRecursive(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
