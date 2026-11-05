/**
 * The journal guard's bearer shape (FOUNDER-ACT-20261105-BR-BEARER-SHAPE and
 * its Amendments 1 to 4).
 *
 * Phase4-CR1 of the counted set of 2026-11-04 returned a valid plan whose
 * prose said "bearer" followed by an ordinary word, and the plan store refused
 * it as credential material. A bearer value now counts when it is 32 or more
 * characters that are not whitespace, or 20 or more characters of the shape's
 * alphabet: prose passes, and a token of 32 or more characters with no
 * whitespace in it is caught and redacted whole, even when another shape would
 * match inside it. The amendments' stated limits and false positives are
 * pinned below.
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
/** Amendment 1 M1: a 32-character token whose alphabet run is cut to 16 by punctuation. */
const PUNCTUATED32 = `${scheme} ${'q7R'.repeat(5)}X!${'m8S'.repeat(5)}`;
const PUNCTUATION32 = `${scheme} ${'!@#%^&*()?'.repeat(3)}!@`;
/** 31 characters, leading run 16: under both branches. */
const PUNCTUATED31 = `${scheme} ${'q7R'.repeat(5)}X!${'m8S'.repeat(4)}mm`;
/** Amendment 3 P1: a leading run of 21, then punctuation, 34 characters in all. */
const RUN21_PUNCTUATED34 = `${scheme} ${'q7R'.repeat(7)}!${'m8S'.repeat(4)}`;
/** Amendment 3 P3: a leading run of 20, then punctuation, 26 characters in all. */
const RUN20_PUNCTUATED26 = `${scheme} ${'Zq7'.repeat(6)}xy!m8Smm`;
/** Amendment 4 Q1 (R1 of the review of 65d5591): a provider-key shape inside a 39-character token. */
const EMBEDDED_PROVIDER39 = `${scheme} ${'q7R'.repeat(3)}!${'s' + 'k-'}${'Zq7'.repeat(7)}!tail`;
/** An AWS key id shape inside a 35-character token. */
const EMBEDDED_AWS35 = `${scheme} ${'q7R'.repeat(3)}!${'AK' + 'IA'}${'ABCDEFGHIJKLMNOP'}!tail`;
/** Amendment 4 Q3 (R2 of the review of 65d5591): a 32-character token holding the marker's text. */
const MARKED32 = `${scheme} ${'q7R'.repeat(3)}${REDACTED}${'!'.repeat(13)}`;
/** Amendment 4 Q3: a provider-key shape that reaches its length only with "-bearer" glued after it. */
const GLUED_PREFIX = `${'s' + 'k-'}${'Zq7'.repeat(4)}x-`;
const GLUED = `${GLUED_PREFIX}${scheme.toLowerCase()} ${'0123456789abcdef'.repeat(2)}`;
const LONG_URL = 'The client sends a bearer https://rare-enjoyment-production-0869.up.railway.app/control-plane value.';
const DOLLAR = String.fromCharCode(36);
const TICK = String.fromCharCode(96);
const TOKEN_VARIABLES = ['CONTROL_PLANE_TOKEN', 'PHASE3_ADJUDICATION_TOKEN', 'PHASE4_COUNTED_RUN_TOKEN'];
/** Amendment 2 N2: every name with a leading $, with or without backticks, and CONTROL_PLANE_TOKEN bare. */
const NAMES_NOT_DETECTED = [
  ...TOKEN_VARIABLES.flatMap((name) => [
    `Authorization: ${scheme} ${DOLLAR}${name}`,
    `${TICK}Authorization: ${scheme} ${DOLLAR}${name}${TICK}`,
  ]),
  `Authorization: ${scheme} CONTROL_PLANE_TOKEN`,
];
/** Amendment 2 N2 and N3: the two bare names of 20 or more characters, detected as they were at 3a1409a. */
const NAMES_DETECTED = [`Authorization: ${scheme} PHASE3_ADJUDICATION_TOKEN`, `Authorization: ${scheme} PHASE4_COUNTED_RUN_TOKEN`];

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

  it('detects and redacts a 32-character token broken by punctuation, in either case, and 32 characters of punctuation (Amendment 1 M2)', () => {
    for (const secret of [PUNCTUATED32, PUNCTUATED32.replace(scheme, scheme.toLowerCase()), PUNCTUATION32]) {
      assert.equal(containsCredentialMaterial([secret]), true, secret.slice(0, 12));
      assert.equal(containsCredentialMaterial([`fetch failed for ${secret}`]), true);
      const [redacted] = redactArgv([`authorization: ${secret}`]);
      assert.ok(redacted?.includes(REDACTED), 'the value is redacted');
      const value = secret.slice(7);
      for (const part of [value.slice(0, 16), value.slice(16)]) assert.ok(!redacted?.includes(part), 'no part of the value survives');
    }
  });

  it('does not detect a 31-character punctuated value whose leading run is under 20: the stated limit of Amendment 1 M3', () => {
    assert.equal(containsCredentialMaterial([PUNCTUATED31]), false);
  });

  it('detects a long URL right after "bearer": the false positive Amendment 1 M3 accepts', () => {
    assert.equal(containsCredentialMaterial([LONG_URL]), true);
  });

  it('does not detect a token variable name written with a leading $, or CONTROL_PLANE_TOKEN written bare (Amendment 2 N2)', () => {
    for (const text of NAMES_NOT_DETECTED) assert.equal(containsCredentialMaterial([text]), false, text);
  });

  it('detects PHASE3_ADJUDICATION_TOKEN and PHASE4_COUNTED_RUN_TOKEN written bare: the false positive Amendment 2 N3 accepts', () => {
    for (const text of NAMES_DETECTED) assert.equal(containsCredentialMaterial([text]), true, text);
  });

  it('redacts whole a value of 32 or more whose leading run is 20 or more, then punctuation, in either case (Amendment 3 P2)', () => {
    for (const secret of [RUN21_PUNCTUATED34, RUN21_PUNCTUATED34.replace(scheme, scheme.toLowerCase())]) {
      assert.equal(containsCredentialMaterial([secret]), true, secret.slice(0, 12));
      const [redacted] = redactArgv([`authorization: ${secret}`]);
      assert.equal(redacted, `authorization: ${REDACTED}`, 'no part of the value survives');
    }
  });

  it('redacts a value under 32 whose leading run is 20 or more only to its first punctuation: the stated limit of Amendment 3 P3', () => {
    const [redacted] = redactArgv([`authorization: ${RUN20_PUNCTUATED26}`]);
    assert.equal(redacted, `authorization: ${REDACTED}!m8Smm`);
  });

  it('redacts whole a token in which another shape matches first: bearer_token runs before it (Amendment 4 Q1)', () => {
    for (const secret of [EMBEDDED_PROVIDER39, EMBEDDED_AWS35]) {
      assert.equal(containsCredentialMaterial([secret]), true, secret.slice(0, 12));
      const [redacted] = redactArgv([`authorization: ${secret}`]);
      assert.equal(redacted, `authorization: ${REDACTED}`, 'no part of the value survives');
      assert.equal(containsCredentialMaterial([redacted!]), false);
    }
  });

  it('judges a token holding the redaction marker text on what remains, and still redacts it whole: the stated limit of Amendment 4 Q3', () => {
    assert.equal(containsCredentialMaterial([MARKED32]), false);
    const [redacted] = redactArgv([`authorization: ${MARKED32}`]);
    assert.equal(redacted, `authorization: ${REDACTED}`);
  });

  it('leaves the start of a provider-key shape that reached its length only with "-bearer" glued after it: the stated limit of Amendment 4 Q3', () => {
    assert.equal(containsCredentialMaterial([GLUED]), true);
    const [redacted] = redactArgv([GLUED]);
    assert.equal(redacted, `${GLUED_PREFIX}${REDACTED}`);
  });
});
