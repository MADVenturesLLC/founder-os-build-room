/**
 * Completion Gate v0 — SuccessContract IR + independent verifier tests.
 *
 * Authority: Founder Act "MiMo→MAD Long-Horizon Core v0" (2026-09-15),
 * Lane 1 — an INDEPENDENT verifier judges a seat's stop/completion claim
 * against a BOUND success contract, not natural-language vibes. No
 * MiMo/OpenCode source was available or vendored; the mechanism was
 * implemented from the act's description (see the lane handoff under
 * docs/planning/mimo-evolve-v0/).
 *
 * Imports only the package's public entry
 * (../packages/completion-gate/src/index.js) plus, for fixture vocabulary,
 * the Seat Registry public entry. No production logic in test/.
 *
 * What is proven:
 *   - the contract IR refuses wrong versions, unknown fields, wrong types,
 *     bad enum values, non-strict handoff modes, unknown schema ids, and a
 *     vacuous contract (no clause at all) — schema reject, never a verdict;
 *   - the evidence bundle refuses its own malformed instances;
 *   - dogfood (a): worker claims done with failing tests => `gap`;
 *   - dogfood (b): green suite + valid strict handoff => `pass`;
 *   - dogfood (c): contradictions (artifact sha256 mismatch, forbidden claim
 *     asserted) => `gap` / `impossible` as appropriate;
 *   - a PASS is never prose-only and never rests on the worker's `done`
 *     claim (a green bundle passes with `done: false`; a claiming bundle
 *     with failing evidence gains `worker_claim_contradicted`);
 *   - the package is pure: relative imports only, no I/O, no clock, no env.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPLETION_GATE_VERIFIER_SEAT_ID,
  EVIDENCE_BUNDLE_VERSION,
  FORBIDDEN_CLAIM_KEYS,
  GAP_CODES,
  HANDOFF_SCHEMA_IDS,
  SKIP_POLICIES,
  SUCCESS_CONTRACT_VERSION,
  VERDICT_KINDS,
  checkEvidenceBundle,
  checkSuccessContract,
  verifyCompletion,
  type EvidenceBundleV1,
  type SuccessContractV1,
  type WorkerClaims,
} from '../packages/completion-gate/src/index.js';
import type { SeatHandoff } from '../packages/seat-registry/src/index.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGE_SRC = join(REPO_ROOT, 'packages', 'completion-gate', 'src');

const SHA40 = '0123456789abcdef0123456789abcdef01234567';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

/** The builder seat's dogfood terminal payload (same shape Lane A proves). */
const REPORT = {
  work_id: 'MIMO-EVOLVE-V0-LANE1-DOGFOOD',
  plan: { path: 'docs/planning/mimo-evolve-v0/HANDOFF-completion-gate.md', sha256: HASH_A },
  repository: 'MADVenturesLLC/founder-os-build-room',
  branch: 'build/completion-gate-v0',
  base_sha: '1f8328cce68a35e2b5014693d8138380b9e54734',
  head_sha: SHA40,
  changed_paths: ['packages/completion-gate/src/index.ts'],
  commands: [{ command: 'node --test dist/test/completion-gate.test.js', exit_code: 0, result: 'pass' }],
  acceptance: [{ criterion: 'independent verdict on bound contract', status: 'met', evidence: 'this suite' }],
  unresolved_issues: [],
  next_role: 'independent-reviewer',
  claims: { merge_authorized: false, production: false, provider_execution: false },
} as const;

const V1_HANDOFF: SeatHandoff = {
  receives_from: 'architect',
  produces: 'Build Report',
  terminal_status: 'BUILD_READY_FOR_INDEPENDENT_VERIFICATION',
  committed_sha: SHA40,
  authorization_refs: ['FOUNDER-ACT-MIMO-EVOLVE-V0-2026-09-15'],
};

const CLAIMS_CLEAN: WorkerClaims = {
  done: true,
  merge_authorized: false,
  production: false,
  provider_execution: false,
};

function validContract(): SuccessContractV1 {
  return {
    version: SUCCESS_CONTRACT_VERSION,
    required_tests: [{ command: 'npm test', expect: 'exit_0' }],
    required_artifacts: [{ path: 'packages/completion-gate/src/index.ts', sha256: HASH_B }],
    required_handoff: { seat_output_schema_id: 'builder-verification-handoff/v1', schema_mode: 'strict' },
    forbidden_claims: [...FORBIDDEN_CLAIM_KEYS],
  };
}

function validBundle(): EvidenceBundleV1 {
  // Fresh copies of the shared fixture pieces: schema-reject tests mutate
  // (delete/cast) what they are given, and a shared reference would poison
  // every later bundle — an order-dependent suite is a vacuous-pass hazard.
  return {
    version: EVIDENCE_BUNDLE_VERSION,
    worker: { seat_id: 'builder', claims: { ...CLAIMS_CLEAN } },
    observations: {
      commands: [{ command: 'npm test', exit_code: 0 }],
      artifacts: [{ path: 'packages/completion-gate/src/index.ts', sha256: HASH_B }],
      skips: [],
    },
    handoff: { seat_id: 'builder', handoff: { ...V1_HANDOFF }, output: REPORT },
  };
}

/** Immutable variation helper: fixtures are readonly, so vary by rebuild. */
function varyBundle(overrides: {
  claims?: WorkerClaims;
  commands?: EvidenceBundleV1['observations']['commands'];
  artifacts?: EvidenceBundleV1['observations']['artifacts'];
  skips?: EvidenceBundleV1['observations']['skips'];
  handoff?: EvidenceBundleV1['handoff'];
  argus_packet?: EvidenceBundleV1['argus_packet'];
}): EvidenceBundleV1 {
  const base = validBundle();
  return {
    version: base.version,
    worker: { ...base.worker, claims: overrides.claims ?? base.worker.claims },
    observations: {
      commands: overrides.commands ?? base.observations.commands,
      artifacts: overrides.artifacts ?? base.observations.artifacts,
      skips: overrides.skips ?? base.observations.skips,
    },
    ...(overrides.handoff !== undefined ? { handoff: overrides.handoff } : { handoff: base.handoff }),
    ...(overrides.argus_packet !== undefined ? { argus_packet: overrides.argus_packet } : {}),
  };
}

function gapCodes(result: ReturnType<typeof verifyCompletion>): string[] {
  assert.equal(result.outcome, 'judged', 'expected a judged verdict, got schema_reject');
  if (result.outcome !== 'judged') return [];
  return result.verdict.gaps.map((g) => g.code);
}

/* ------------------------------------------------------------------ */
/* Contract schema — closed fields, fail-closed                          */
/* ------------------------------------------------------------------ */

describe('completion-gate · success-contract/v1 schema', () => {
  it('accepts the valid dogfood contract', () => {
    assert.deepEqual(checkSuccessContract(validContract()), []);
  });

  it('rejects a non-object, a wrong version, and an unknown top-level field', () => {
    assert.deepEqual(checkSuccessContract('done, trust me'), [
      { path: '', message: 'contract must be a plain object' },
    ]);
    assert.ok(checkSuccessContract({ ...validContract(), version: 'success-contract/v2' }).some((d) => d.path === '/version'));
    assert.ok(checkSuccessContract({ ...validContract(), vibes: 'good' }).some((d) => d.path === '/vibes'));
  });

  it('rejects missing/non-array required_tests and required_artifacts', () => {
    const noTests = validContract() as unknown as Record<string, unknown>;
    delete noTests['required_tests'];
    assert.ok(checkSuccessContract(noTests).some((d) => d.path === '/required_tests'));
    assert.ok(checkSuccessContract({ ...validContract(), required_artifacts: 'dist' }).some((d) => d.path === '/required_artifacts'));
  });

  it('rejects a test entry with an unknown key, with both forms, and with neither form', () => {
    assert.ok(
      checkSuccessContract({ ...validContract(), required_tests: [{ command: 'npm test', expect: 'exit_0', retries: 3 }] })
        .some((d) => d.path === '/required_tests/0/retries'),
    );
    assert.ok(
      checkSuccessContract({
        ...validContract(),
        required_tests: [{ command: 'npm test', expect: 'exit_0', skip_policy: 'not_applicable' }],
      }).some((d) => d.path === '/required_tests/0' && d.message.includes('mutually exclusive')),
    );
    assert.ok(
      checkSuccessContract({ ...validContract(), required_tests: [{ command: 'npm test' }] })
        .some((d) => d.path === '/required_tests/0' && d.message.includes('exactly one')),
    );
  });

  it('rejects an unknown expect value and an unknown skip policy', () => {
    assert.ok(
      checkSuccessContract({ ...validContract(), required_tests: [{ command: 'npm test', expect: 'exit_1' }] })
        .some((d) => d.path === '/required_tests/0/expect'),
    );
    assert.ok(
      checkSuccessContract({ ...validContract(), required_tests: [{ command: 'npm test', skip_policy: 'felt_slow' }] })
        .some((d) => d.path === '/required_tests/0/skip_policy'),
    );
    for (const policy of SKIP_POLICIES) {
      assert.deepEqual(
        checkSuccessContract({ ...validContract(), required_tests: [{ command: 'npm test', skip_policy: policy }] }),
        [],
        `named skip policy ${policy} must validate`,
      );
    }
  });

  it('rejects a bad artifact sha256 and duplicate artifact paths', () => {
    assert.ok(
      checkSuccessContract({ ...validContract(), required_artifacts: [{ path: 'a', sha256: 'ABC' }] })
        .some((d) => d.path === '/required_artifacts/0/sha256'),
    );
    assert.ok(
      checkSuccessContract({ ...validContract(), required_artifacts: [{ path: 'a' }, { path: 'a' }] })
        .some((d) => d.path === '/required_artifacts' && d.message.includes('duplicate')),
    );
  });

  it('rejects a non-strict handoff mode and an unknown seat-output-schema id', () => {
    assert.ok(
      checkSuccessContract({
        ...validContract(),
        required_handoff: { seat_output_schema_id: 'builder-verification-handoff/v1', schema_mode: 'permissive' },
      }).some((d) => d.path === '/required_handoff/schema_mode'),
    );
    assert.ok(
      checkSuccessContract({
        ...validContract(),
        required_handoff: { seat_output_schema_id: 'made-up/v9', schema_mode: 'strict' },
      }).some((d) => d.path === '/required_handoff/seat_output_schema_id'),
    );
    for (const id of HANDOFF_SCHEMA_IDS) {
      assert.deepEqual(
        checkSuccessContract({ ...validContract(), required_handoff: { seat_output_schema_id: id, schema_mode: 'strict' } }),
        [],
        `registered schema id ${id} must validate`,
      );
    }
  });

  it('rejects unknown and duplicate forbidden-claim keys', () => {
    assert.ok(
      checkSuccessContract({ ...validContract(), forbidden_claims: ['looks_done'] })
        .some((d) => d.path === '/forbidden_claims/0'),
    );
    assert.ok(
      checkSuccessContract({ ...validContract(), forbidden_claims: ['production', 'production'] })
        .some((d) => d.message.includes('duplicate')),
    );
    assert.ok(
      checkSuccessContract(validContract() as unknown as Record<string, unknown>).length === 0,
      'control: the unmodified contract is valid',
    );
  });

  it('checks single_verdict against the registry’s independent-reviewer terminal statuses', () => {
    assert.ok(
      checkSuccessContract({ ...validContract(), single_verdict: 'SEAT_VERIFIED' }).length === 0,
      'SEAT_VERIFIED is a terminal status of independent-reviewer',
    );
    assert.ok(
      checkSuccessContract({ ...validContract(), single_verdict: 'BUILD_READY_FOR_INDEPENDENT_VERIFICATION' })
        .some((d) => d.path === '/single_verdict'),
      'a builder terminal status is not an independent-reviewer one',
    );
  });

  it('rejects a malformed argus_packet bind', () => {
    assert.ok(
      checkSuccessContract({ ...validContract(), argus_packet: { packet_sha256: 'short' } })
        .some((d) => d.path === '/argus_packet/packet_sha256'),
    );
    assert.ok(
      checkSuccessContract({ ...validContract(), argus_packet: { packet_sha256: HASH_C, extra: 1 } })
        .some((d) => d.path === '/argus_packet/extra'),
    );
  });

  it('rejects a vacuous contract — a PASS must never be decorative', () => {
    const vacuous = {
      version: SUCCESS_CONTRACT_VERSION,
      required_tests: [],
      required_artifacts: [],
      forbidden_claims: [],
    };
    assert.ok(
      checkSuccessContract(vacuous).some((d) => d.path === '' && d.message.includes('no requirement clause')),
    );
  });

  it('treats a forbidden-claims-only contract as non-vacuous (a real gate)', () => {
    const claimsOnly = {
      version: SUCCESS_CONTRACT_VERSION,
      required_tests: [],
      required_artifacts: [],
      forbidden_claims: ['merge_authorized'],
    };
    assert.deepEqual(checkSuccessContract(claimsOnly), []);
  });
});

/* ------------------------------------------------------------------ */
/* Evidence bundle schema                                                */
/* ------------------------------------------------------------------ */

describe('completion-gate · evidence-bundle/v1 schema', () => {
  it('accepts the valid dogfood bundle', () => {
    assert.deepEqual(checkEvidenceBundle(validBundle()), []);
  });

  it('rejects a non-object, a wrong version, and an unknown top-level field', () => {
    assert.deepEqual(checkEvidenceBundle(42), [{ path: '', message: 'evidence bundle must be a plain object' }]);
    assert.ok(checkEvidenceBundle({ ...validBundle(), version: 'evidence-bundle/v0' }).some((d) => d.path === '/version'));
    assert.ok(checkEvidenceBundle({ ...validBundle(), narrative: 'all green' }).some((d) => d.path === '/narrative'));
  });

  it('rejects an unknown worker seat and malformed claims', () => {
    const badSeat = validBundle() as unknown as { worker: Record<string, unknown> };
    badSeat.worker = { ...badSeat.worker, seat_id: 'completion-gate-verifier' };
    assert.ok(
      checkEvidenceBundle(badSeat).some((d) => d.path === '/worker/seat_id'),
      'the verifier seat id is not a registry seat and cannot be a worker',
    );
    const badClaims = validBundle() as unknown as { worker: { claims: Record<string, unknown> } };
    badClaims.worker.claims = { ...badClaims.worker.claims, done: 'yes' };
    assert.ok(checkEvidenceBundle(badClaims).some((d) => d.path === '/worker/claims/done'));
    const missingClaim = validBundle() as unknown as { worker: { claims: Record<string, unknown> } };
    delete missingClaim.worker.claims['production'];
    assert.ok(checkEvidenceBundle(missingClaim).some((d) => d.path === '/worker/claims/production'));
  });

  it('rejects out-of-range exit codes and unhashed artifacts', () => {
    const cmd = (exit_code: unknown) => ({
      ...validBundle(),
      observations: { commands: [{ command: 'npm test', exit_code }], artifacts: [], skips: [] },
    });
    assert.ok(checkEvidenceBundle(cmd(300)).some((d) => d.path === '/observations/commands/0/exit_code'));
    assert.ok(checkEvidenceBundle(cmd(-1)).some((d) => d.path === '/observations/commands/0/exit_code'));
    assert.ok(checkEvidenceBundle(cmd(0.5)).some((d) => d.path === '/observations/commands/0/exit_code'));
    const noHash = {
      ...validBundle(),
      observations: { commands: [], artifacts: [{ path: 'a' }], skips: [] },
    };
    assert.ok(checkEvidenceBundle(noHash).some((d) => d.path === '/observations/artifacts/0/sha256'));
  });

  it('rejects an unknown skip policy and a keyless skip record', () => {
    const badPolicy = {
      ...validBundle(),
      observations: { commands: [], artifacts: [], skips: [{ command: 'npm test', policy: 'felt_slow', reason: 'x' }] },
    };
    assert.ok(checkEvidenceBundle(badPolicy).some((d) => d.path === '/observations/skips/0/policy'));
    const badKeys = {
      ...validBundle(),
      observations: { commands: [], artifacts: [], skips: [{ command: 'npm test', policy: 'not_applicable', reason: 'x', who: 'me' }] },
    };
    assert.ok(checkEvidenceBundle(badKeys).some((d) => d.path === '/observations/skips/0/who'));
  });

  it('rejects a handoff with an unknown seat, a non-object record, or no output', () => {
    const badSeat = { ...validBundle(), handoff: { seat_id: 'nobody', handoff: {}, output: {} } };
    assert.ok(checkEvidenceBundle(badSeat).some((d) => d.path === '/handoff/seat_id'));
    const badRecord = { ...validBundle(), handoff: { seat_id: 'builder', handoff: 'prose', output: {} } };
    assert.ok(checkEvidenceBundle(badRecord).some((d) => d.path === '/handoff/handoff'));
    const noOutput = { ...validBundle(), handoff: { seat_id: 'builder', handoff: {} } };
    assert.ok(checkEvidenceBundle(noOutput).some((d) => d.path === '/handoff/output'));
  });

  it('rejects a malformed argus packet observation', () => {
    const bad = { ...validBundle(), argus_packet: { packet_sha256: 'nope', terminal_status: 'SEAT_VERIFIED' } };
    assert.ok(checkEvidenceBundle(bad).some((d) => d.path === '/argus_packet/packet_sha256'));
    const extra = { ...validBundle(), argus_packet: { packet_sha256: HASH_C, terminal_status: 'SEAT_VERIFIED', note: 'ok' } };
    assert.ok(checkEvidenceBundle(extra).some((d) => d.path === '/argus_packet/note'));
  });
});

/* ------------------------------------------------------------------ */
/* Verifier — the three dogfood fixtures from the act                    */
/* ------------------------------------------------------------------ */

describe('completion-gate · verifier dogfood', () => {
  it('(b) green suite + valid strict handoff + matching artifact => pass, and PASS is structured', () => {
    const result = verifyCompletion(validContract(), validBundle());
    assert.equal(result.outcome, 'judged');
    if (result.outcome !== 'judged') return;
    assert.equal(result.verdict.verdict, 'pass');
    assert.deepEqual(result.verdict.gaps, []);
    assert.equal(result.verdict.verifier_seat_id, COMPLETION_GATE_VERIFIER_SEAT_ID);
    assert.equal(result.verdict.contract_version, SUCCESS_CONTRACT_VERSION);
    // 1 test + 1 artifact + 1 handoff + 3 forbidden claims: a real count,
    // so a vacuous PASS is structurally impossible to confuse with this one.
    assert.equal(result.verdict.requirements_checked, 6);
  });

  it('(a) worker claims done with failing tests => gap, with test_failed and worker_claim_contradicted', () => {
    const bundle = varyBundle({ commands: [{ command: 'npm test', exit_code: 1 }] });
    const result = verifyCompletion(validContract(), bundle);
    assert.equal(result.outcome, 'judged');
    if (result.outcome !== 'judged') return;
    assert.equal(result.verdict.verdict, 'gap');
    const codes = gapCodes(result);
    assert.ok(codes.includes('test_failed'));
    assert.ok(codes.includes('worker_claim_contradicted'), 'the done-claim contradicting evidence is named, not silent');
    const failed = result.verdict.gaps.find((g) => g.code === 'test_failed');
    assert.equal(failed?.evidence_pointer, '/observations/commands/0/exit_code');
  });

  it('(c1) artifact claimed but sha256 mismatch => gap with artifact_sha256_mismatch', () => {
    const bundle = varyBundle({ artifacts: [{ path: 'packages/completion-gate/src/index.ts', sha256: HASH_C }] });
    const result = verifyCompletion(validContract(), bundle);
    assert.equal(result.outcome, 'judged');
    if (result.outcome !== 'judged') return;
    assert.equal(result.verdict.verdict, 'gap');
    const codes = gapCodes(result);
    assert.ok(codes.includes('artifact_sha256_mismatch'));
    assert.ok(codes.includes('worker_claim_contradicted'));
  });

  it('(c2) forbidden claim asserted true => impossible, even when everything else is green', () => {
    const bundle = varyBundle({ claims: { ...CLAIMS_CLEAN, merge_authorized: true } });
    const result = verifyCompletion(validContract(), bundle);
    assert.equal(result.outcome, 'judged');
    if (result.outcome !== 'judged') return;
    assert.equal(result.verdict.verdict, 'impossible');
    const codes = gapCodes(result);
    assert.ok(codes.includes('forbidden_claim_asserted'));
    const gap = result.verdict.gaps.find((g) => g.code === 'forbidden_claim_asserted');
    assert.equal(gap?.evidence_pointer, '/worker/claims/merge_authorized');
  });

  it('forbidden claim asserted with done: false is still impossible — it is the claim, not the narrative', () => {
    const bundle = varyBundle({ claims: { done: false, merge_authorized: false, production: true, provider_execution: false } });
    const result = verifyCompletion(validContract(), bundle);
    assert.equal(result.outcome, 'judged');
    if (result.outcome !== 'judged') return;
    assert.equal(result.verdict.verdict, 'impossible');
    assert.deepEqual(gapCodes(result), ['forbidden_claim_asserted']);
  });
});

/* ------------------------------------------------------------------ */
/* Verifier — independence, trace semantics, skips, Argus binds          */
/* ------------------------------------------------------------------ */

describe('completion-gate · verifier semantics', () => {
  it('a green bundle passes with done: false — the worker’s self-claim is never a PASS input', () => {
    const bundle = varyBundle({ claims: { ...CLAIMS_CLEAN, done: false } });
    const result = verifyCompletion(validContract(), bundle);
    assert.equal(result.outcome, 'judged');
    if (result.outcome !== 'judged') return;
    assert.equal(result.verdict.verdict, 'pass');
    assert.deepEqual(result.verdict.gaps, []);
  });

  it('a test never observed is a gap, not an assumption', () => {
    const result = verifyCompletion(validContract(), varyBundle({ commands: [] }));
    assert.equal(result.outcome, 'judged');
    if (result.outcome !== 'judged') return;
    assert.equal(result.verdict.verdict, 'gap');
    assert.ok(gapCodes(result).includes('test_not_observed'));
  });

  it('last trace record wins: re-run to green passes; green then red fails', () => {
    const toGreen = varyBundle({
      commands: [
        { command: 'npm test', exit_code: 1 },
        { command: 'npm test', exit_code: 0 },
      ],
    });
    const greenResult = verifyCompletion(validContract(), toGreen);
    assert.equal(greenResult.outcome, 'judged');
    if (greenResult.outcome === 'judged') assert.equal(greenResult.verdict.verdict, 'pass');

    const toRed = varyBundle({
      commands: [
        { command: 'npm test', exit_code: 0 },
        { command: 'npm test', exit_code: 2 },
      ],
    });
    const redResult = verifyCompletion(validContract(), toRed);
    assert.equal(redResult.outcome, 'judged');
    if (redResult.outcome === 'judged') assert.equal(redResult.verdict.verdict, 'gap');
  });

  it('a required artifact never observed is a gap', () => {
    const result = verifyCompletion(validContract(), varyBundle({ artifacts: [] }));
    assert.equal(result.outcome, 'judged');
    if (result.outcome === 'judged') {
      assert.equal(result.verdict.verdict, 'gap');
      assert.ok(result.verdict.gaps.some((g) => g.code === 'artifact_not_observed'));
    }
  });

  it('a contracted handoff absent from the bundle is a gap — green tests alone never pass', () => {
    const bundle = validBundle() as unknown as Record<string, unknown>;
    delete bundle['handoff'];
    const result = verifyCompletion(validContract(), bundle);
    assert.equal(result.outcome, 'judged');
    if (result.outcome === 'judged') {
      assert.equal(result.verdict.verdict, 'gap');
      assert.ok(result.verdict.gaps.some((g) => g.code === 'handoff_missing'));
    }
  });

  it('a handoff whose output violates the strict schema is rejected, never accepted', () => {
    const base = validBundle();
    const bundle = varyBundle({
      handoff: {
        seat_id: 'builder',
        handoff: V1_HANDOFF,
        output: { ...REPORT, claims: { merge_authorized: false, production: true, provider_execution: false } },
      },
    });
    assert.ok(base.handoff !== undefined, 'control: the base fixture carries a handoff');
    const result = verifyCompletion(validContract(), bundle);
    assert.equal(result.outcome, 'judged');
    if (result.outcome === 'judged') {
      assert.equal(result.verdict.verdict, 'gap');
      assert.ok(result.verdict.gaps.some((g) => g.code === 'handoff_rejected'));
    }
  });

  it('a handoff from a different seat than the claiming worker is a gap', () => {
    const bundle = varyBundle({
      handoff: { seat_id: 'architect', handoff: V1_HANDOFF, output: REPORT },
    });
    const result = verifyCompletion(validContract(), bundle);
    assert.equal(result.outcome, 'judged');
    if (result.outcome === 'judged') {
      assert.equal(result.verdict.verdict, 'gap');
      assert.ok(result.verdict.gaps.some((g) => g.code === 'handoff_seat_mismatch'));
    }
  });

  it('skip form: honored by a matching recorded skip, gapped otherwise', () => {
    const contract: SuccessContractV1 = {
      ...validContract(),
      required_tests: [{ command: 'npm run test:storage', skip_policy: 'environment_unavailable' }],
    };
    const honored = verifyCompletion(
      contract,
      varyBundle({
        commands: [],
        skips: [{ command: 'npm run test:storage', policy: 'environment_unavailable', reason: 'no TEST_DATABASE_URL in this lane' }],
      }),
    );
    assert.equal(honored.outcome, 'judged');
    if (honored.outcome === 'judged') assert.equal(honored.verdict.verdict, 'pass');

    const missing = verifyCompletion(contract, varyBundle({ commands: [] }));
    assert.equal(missing.outcome, 'judged');
    if (missing.outcome === 'judged') {
      assert.equal(missing.verdict.verdict, 'gap');
      assert.ok(missing.verdict.gaps.some((g) => g.code === 'skip_not_recorded'));
    }

    const mismatched = verifyCompletion(
      contract,
      varyBundle({
        commands: [],
        skips: [{ command: 'npm run test:storage', policy: 'not_applicable', reason: 'x' }],
      }),
    );
    assert.equal(mismatched.outcome, 'judged');
    if (mismatched.outcome === 'judged') {
      assert.equal(mismatched.verdict.verdict, 'gap');
      assert.ok(mismatched.verdict.gaps.some((g) => g.code === 'skip_policy_mismatch'));
    }
  });

  it('argus binds: missing packet, sha mismatch, verdict mismatch, and the matching pass', () => {
    const contract: SuccessContractV1 = {
      ...validContract(),
      argus_packet: { packet_sha256: HASH_C },
      single_verdict: 'SEAT_VERIFIED',
    };
    const missing = verifyCompletion(contract, validBundle());
    assert.equal(missing.outcome, 'judged');
    if (missing.outcome === 'judged') {
      assert.equal(missing.verdict.verdict, 'gap');
      assert.ok(missing.verdict.gaps.some((g) => g.code === 'argus_packet_missing'));
    }

    const shaResult = verifyCompletion(
      contract,
      varyBundle({ argus_packet: { packet_sha256: HASH_A, terminal_status: 'SEAT_VERIFIED' } }),
    );
    assert.equal(shaResult.outcome, 'judged');
    if (shaResult.outcome === 'judged') {
      assert.ok(shaResult.verdict.gaps.some((g) => g.code === 'argus_packet_sha256_mismatch'));
    }

    const verdictResult = verifyCompletion(
      contract,
      varyBundle({ argus_packet: { packet_sha256: HASH_C, terminal_status: 'SEAT_REQUEST_CHANGES' } }),
    );
    assert.equal(verdictResult.outcome, 'judged');
    if (verdictResult.outcome === 'judged') {
      assert.ok(verdictResult.verdict.gaps.some((g) => g.code === 'argus_verdict_mismatch'));
    }

    const boundResult = verifyCompletion(
      contract,
      varyBundle({ argus_packet: { packet_sha256: HASH_C, terminal_status: 'SEAT_VERIFIED' } }),
    );
    assert.equal(boundResult.outcome, 'judged');
    if (boundResult.outcome === 'judged') {
      assert.equal(boundResult.verdict.verdict, 'pass');
      assert.equal(boundResult.verdict.requirements_checked, 7);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Schema reject — a refusal is not a verdict                            */
/* ------------------------------------------------------------------ */

describe('completion-gate · schema reject', () => {
  it('a malformed contract is schema_reject at stage contract — never a verdict', () => {
    const result = verifyCompletion({ version: 'nope' }, validBundle());
    assert.equal(result.outcome, 'schema_reject');
    if (result.outcome !== 'schema_reject') return;
    assert.equal(result.stage, 'contract');
    assert.ok(result.defects.length > 0);
  });

  it('a malformed bundle is schema_reject at stage evidence', () => {
    const result = verifyCompletion(validContract(), { version: EVIDENCE_BUNDLE_VERSION });
    assert.equal(result.outcome, 'schema_reject');
    if (result.outcome !== 'schema_reject') return;
    assert.equal(result.stage, 'evidence');
    assert.ok(result.defects.some((d) => d.path === '/worker'));
  });

  it('contract defects are reported before the bundle is judged', () => {
    const result = verifyCompletion('garbage', 'also garbage');
    assert.equal(result.outcome, 'schema_reject');
    if (result.outcome === 'schema_reject') assert.equal(result.stage, 'contract');
  });

  it('verdict and gap vocabularies stay closed', () => {
    assert.deepEqual([...VERDICT_KINDS], ['pass', 'gap', 'impossible']);
    assert.equal(new Set(GAP_CODES).size, GAP_CODES.length, 'gap codes are distinct');
    assert.ok(GAP_CODES.includes('forbidden_claim_asserted'));
  });
});

/* ------------------------------------------------------------------ */
/* Static surface — purity and the seat-registry placement pattern       */
/* ------------------------------------------------------------------ */

describe('completion-gate · static surface', () => {
  function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...tsFiles(full));
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }
  function specifiers(source: string): string[] {
    return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
  }

  it('imports only relative modules via public entries; no node: I/O, no env, no clock', () => {
    const files = tsFiles(PACKAGE_SRC);
    assert.ok(files.length >= 5, 'expected the package sources to exist — a vacuous purity pass is a finding');
    const envRead = 'pro' + 'cess.env';
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of specifiers(source)) {
        assert.ok(specifier.startsWith('.'), `${relative(REPO_ROOT, file)} imports non-relative ${specifier}`);
        if (specifier.includes('seat-registry') || specifier.includes('seat-output-schema')) {
          assert.match(specifier, /src\/index\.js$/, `${relative(REPO_ROOT, file)} deep-imports a sibling package`);
        }
      }
      assert.ok(!source.includes(envRead), `${relative(REPO_ROOT, file)} reads the environment`);
      assert.ok(!/\bDate\.now\s*\(|\bnew\s+Date\s*\(|\bMath\.random\s*\(/.test(source), `${relative(REPO_ROOT, file)} reads ambient state`);
    }
  });

  it('carries no package manifest — tsconfig-include package, byte-identical lockfile (seat-registry pattern)', () => {
    // Recent pack practice (seat-registry, seat-output-schema, Lane 2 of this
    // act): a sibling directory under packages/ is compiled via the root
    // tsconfig include and registered NOWHERE in package-lock.json.
    assert.throws(() => readFileSync(join(REPO_ROOT, 'packages', 'completion-gate', 'package.json')));
  });
});
