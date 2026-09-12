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
 */
function findForbiddenFixtureReferences(worktreeRoot: string): string[] {
  const violations: string[] = [];
  const forbiddenRoots = [
    join(worktreeRoot, 'packages/control-plane/src'),
    join(worktreeRoot, 'packages/gateway-daemon/src'),
    join(worktreeRoot, 'packages/gateway-cli/src'),
  ];
  // Run-harness production entry points: every .ts under src except the
  // fixture module itself.
  const harnessSrc = join(worktreeRoot, 'packages/run-harness/src');
  const checked: string[] = [];
  for (const root of [...forbiddenRoots, harnessSrc]) {
    for (const file of tsFilesUnder(root)) {
      if (file.endsWith('planner-admission-fixture.ts')) continue;
      checked.push(file);
      const text = readFileSync(file, 'utf8');
      // Runtime reference = an import/export-from that is NOT type-only.
      // A `import type` (or `export type`) reference is erased at runtime
      // and does not put the fixture on a production module graph.
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        const isImportLine = /^\s*import\b/.test(line) || /^\s*export\b.*\bfrom\b/.test(line);
        if (!isImportLine) return;
        if (!line.includes('planner-admission-fixture')) return;
        const typeOnly = /^\s*import\s+type\b/.test(line) || /^\s*export\s+type\b/.test(line);
        if (!typeOnly) {
          violations.push(`${relative(worktreeRoot, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  }
  return violations;
}

describe('A1 import-boundary detector', () => {
  const worktreeRoot = findWorktreeRoot();

  it('9a. no production location runtime-imports the fixture (scan is empty)', () => {
    const violations = findForbiddenFixtureReferences(worktreeRoot);
    assert.deepEqual(violations, []);
  });

  it('9b. CONTROL: the detector itself detects a synthetic forbidden import', () => {
    // Feed the detector a synthetic production-like source tree containing
    // a runtime (non-type-only) import of the fixture. An empty scan alone
    // would be insufficient proof that the detector works. Built under the
    // OS temp dir so nothing ever touches the tracked tree.
    const syntheticRoot = join(tmpdir(), `bga-import-detector-control-${process.pid}`);
    const violatingDir = join(syntheticRoot, 'packages', 'control-plane', 'src');
    const violatingFile = join(violatingDir, 'synthetic-production-file.ts');
    const cleanDir = join(syntheticRoot, 'packages', 'run-harness', 'src');
    const cleanFile = join(cleanDir, 'clean-file.ts');
    const typeOnlyFile = join(cleanDir, 'type-only-file.ts');

    mkdirRecursive(violatingDir);
    mkdirRecursive(cleanDir);
    writeFileSyncUtf8(
      violatingFile,
      "import { runPlannerAdmissionFixture } from '../../run-harness/src/planner-admission-fixture.js';\nexport const x = runPlannerAdmissionFixture;\n",
    );
    writeFileSyncUtf8(cleanFile, 'export const y = 1;\n');
    // A type-only import is erased at runtime and must NOT count.
    writeFileSyncUtf8(
      typeOnlyFile,
      "import type { AdmissionFixtureResult } from '../src/planner-admission-fixture.js';\nexport type Z = AdmissionFixtureResult | null;\n",
    );

    try {
      const violations = findForbiddenFixtureReferences(syntheticRoot);
      assert.equal(violations.length, 1, `exactly the synthetic violation: ${violations.join(' | ')}`);
      const first = violations[0];
      assert.ok(first !== undefined && first.includes('synthetic-production-file.ts'));
      assert.ok(first !== undefined && !first.includes('type-only-file.ts'));
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
