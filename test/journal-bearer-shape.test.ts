/**
 * The journal guard's bearer shape (FOUNDER-ACT-20261105-BR-BEARER-SHAPE).
 *
 * Phase4-CR1 of the counted set of 2026-11-04 returned a valid plan whose
 * prose said "bearer" followed by an ordinary word, and the plan store refused
 * it as credential material. A bearer value must now be 20 characters or more:
 * prose passes, every credential this system accepts or mints is still caught,
 * and a value of 19 characters is the stated limit of the act's B2.
 *
 * Token-shaped fixtures are assembled at runtime, as `journal-7.3-secrets`
 * does, so the repository's secret scan does not read them as leaks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REDACTED, containsCredentialMaterial, redactArgv } from '../packages/journal/src/index.js';
import { judgePlanDoc } from '../packages/control-plane/src/plan-doc.js';

/** The phrases of the refused plan's kind: "bearer", then a lowercase word of 8 to 11 letters. */
const PROSE = [
  'bearer credentials',
  'The counted-run route takes a bearer credential.',
  'Each route checks the bearer authority.',
  'Services pass BEARER credentials between them.',
];

const scheme = 'Bear' + 'er';
const TWENTY = `${scheme} ${'Zq7'.repeat(6)}xy`;
const HEX64 = `${scheme} ${'0123456789abcdef'.repeat(4)}`;
const LOWERCASE_HEX64 = `${scheme.toLowerCase()} ${'fedcba9876543210'.repeat(4)}`;
const NINETEEN = `${scheme} ${'Zq7'.repeat(6)}x`;

/** Every key and string value of a document, as the plan store scans it. */
function stringsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, out);
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      stringsOf(v, out);
    }
  }
  return out;
}

function planWith(prose: string): Record<string, unknown> {
  return {
    schema_version: 'plandoc/1',
    work_id: 'W-bearer-shape',
    objective: 'Describe the Phase 4 planner loop in README.md.',
    terminal_status: 'PLAN_READY_FOR_FOUNDER_APPROVAL',
    controlling_inputs: [{ path: 'README.md', sha256: 'b'.repeat(64) }],
    repository: 'MADVenturesLLC/founder-os-build-room',
    base_sha: 'a'.repeat(40),
    scope_paths: ['README.md'],
    current_state: 'README.md does not describe the loop.',
    constraints: 'Documentation only.',
    non_goals: 'No code.',
    architecture_decision: 'One new section.',
    alternatives_considered: 'A separate document; rejected.',
    components_and_boundaries: 'README.md only.',
    interfaces_and_contracts: 'None.',
    data_flow: 'None.',
    trust_and_security_boundaries: prose,
    migration_and_compatibility: 'Additive.',
    error_and_failure_behavior: 'Unchanged.',
    observability: 'None added.',
    test_strategy: 'Read the rendered section.',
    rollback_plan: 'Revert the commit.',
    dependency_ordering: 'None.',
    acceptance_criteria: ['The section is present.'],
    implementation_sequence: ['Write the section', `Name the routes: ${prose}`],
    known_risks: [`The section could go stale; ${prose}`],
    unresolved_founder_decisions: [],
    plan_drift_stop_conditions: ['Base moved'],
    next_role: 'founder_approval',
    claims: { plan_approved: false, builder_authorized: false },
  };
}

describe('journal guard · bearer shape (FOUNDER-ACT-20261105-BR-BEARER-SHAPE)', () => {
  it('takes "bearer" followed by an ordinary word as prose, not credential material', () => {
    for (const prose of PROSE) assert.equal(containsCredentialMaterial([prose]), false, prose);
  });

  it('keeps such prose in a plan document: the document judges, and none of its strings is credential material', () => {
    for (const prose of PROSE) {
      const document = planWith(prose);
      const verdict = judgePlanDoc(document);
      assert.ok(verdict.ok && verdict.readyForDecision, 'the fixture plan judges');
      assert.equal(containsCredentialMaterial(stringsOf(document)), false, prose);
    }
  });

  it('still detects and redacts a bearer value of 20 characters, and of 64 hexadecimal characters in either case', () => {
    for (const secret of [TWENTY, HEX64, LOWERCASE_HEX64]) {
      assert.equal(containsCredentialMaterial([secret]), true);
      assert.equal(containsCredentialMaterial([`fetch failed for ${secret}`]), true);
      const [redacted] = redactArgv([`authorization: ${secret}`]);
      assert.ok(redacted?.includes(REDACTED), 'the value is redacted');
      assert.ok(!redacted?.includes(secret.slice(7)), 'no part of the value survives');
    }
  });

  it('does not detect a bearer value of 19 characters: the stated limit of B2', () => {
    assert.equal(containsCredentialMaterial([NINETEEN]), false);
  });
});
