/**
 * The journal guard's bearer shape (FOUNDER-ACT-20261105-BR-BEARER-SHAPE as
 * amended, Amendment 5 last).
 *
 * Phase4-CR1 of the counted set of 2026-11-04 returned a valid plan whose
 * prose said "bearer" followed by an ordinary word, and the plan store refused
 * it as credential material. A bearer value now counts when it is 20 or more
 * characters of RFC 6750's token alphabet, and the control plane refuses to
 * boot with a token outside that alphabet, so every token it accepts is
 * detected and redacted whole. The shape redacts before every shape but the
 * PEM block. The act's stated limits and false positives are pinned below.
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
/** 43 characters of base64url, the alphabet of the control plane's pairing codes. */
const BASE64URL43 = `${scheme} ${'Zq7_-x'.repeat(7)}a`;
/** Tokens of the alphabet holding another credential's shape: a provider key, and an AWS key id. */
const EMBEDDED_PROVIDER = `${scheme} abc_${'s' + 'k-'}${'Zq7'.repeat(9)}`;
const EMBEDDED_AWS = `${scheme} ${'q7R'.repeat(3)}_${'AK' + 'IA'}ABCDEFGHIJKLMNOP_tail`;
/** The review of 04f2739: two bearer values in one JSON-serialized string. */
const TWO_HEADERS = JSON.stringify([`${scheme} ${'a'.repeat(32)}`, `${scheme} ${'b'.repeat(32)}`]);
/** A labelled secret written right after a bearer value, with a comma between. */
const LABEL_AFTER = `${scheme} ${'a'.repeat(32)},pass` + 'word: hunter2hunter2';
/** Values holding a character outside the alphabet, which the control plane refuses as tokens. */
const PUNCTUATED32 = `${scheme} ${'q7R'.repeat(5)}X!${'m8S'.repeat(5)}`;
const RUN21_PUNCTUATED34 = `${scheme} ${'q7R'.repeat(7)}!${'m8S'.repeat(4)}`;
const MARKED32 = `${scheme} ${'q7R'.repeat(3)}${REDACTED}${'!'.repeat(13)}`;
/** A provider-key shape that reaches its length only with "-bearer" glued after it. */
const GLUED_PREFIX = `${'s' + 'k-'}${'Zq7'.repeat(4)}x-`;
const GLUED = `${GLUED_PREFIX}${scheme.toLowerCase()} ${'0123456789abcdef'.repeat(2)}`;
const LONG_URL = 'The client sends a bearer https://rare-enjoyment-production-0869.up.railway.app/control-plane value.';
const DOLLAR = String.fromCharCode(36);
const TICK = String.fromCharCode(96);
const TOKEN_VARIABLES = ['CONTROL_PLANE_TOKEN', 'PHASE3_ADJUDICATION_TOKEN', 'PHASE4_COUNTED_RUN_TOKEN'];
/** Every name with a leading $, with or without backticks, and CONTROL_PLANE_TOKEN bare. */
const NAMES_NOT_DETECTED = [
  ...TOKEN_VARIABLES.flatMap((name) => [
    `Authorization: ${scheme} ${DOLLAR}${name}`,
    `${TICK}Authorization: ${scheme} ${DOLLAR}${name}${TICK}`,
  ]),
  `Authorization: ${scheme} CONTROL_PLANE_TOKEN`,
];
/** The two bare names of 20 or more characters, detected as they were at 3a1409a. */
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

  it('detects and redacts whole a bearer value of 20 characters, 64 hexadecimal characters in either case, and 43 of base64url', () => {
    for (const secret of [TWENTY, HEX64, LOWERCASE_HEX64, BASE64URL43]) {
      assert.equal(containsCredentialMaterial([secret]), true, secret.slice(0, 12));
      assert.equal(containsCredentialMaterial([`fetch failed for ${secret}`]), true);
      const [redacted] = redactArgv([`authorization: ${secret}`]);
      assert.equal(redacted, `authorization: ${REDACTED}`, 'no part of the value survives');
    }
  });

  it('does not detect a bearer value of 19 characters: a stated limit', () => {
    assert.equal(containsCredentialMaterial([NINETEEN]), false);
  });

  it('redacts whole a token of the alphabet in which another shape would match: bearer_token runs before it', () => {
    for (const secret of [EMBEDDED_PROVIDER, EMBEDDED_AWS]) {
      assert.equal(containsCredentialMaterial([secret]), true, secret.slice(0, 12));
      const [redacted] = redactArgv([`authorization: ${secret}`]);
      assert.equal(redacted, `authorization: ${REDACTED}`, 'no part of the value survives');
      assert.equal(containsCredentialMaterial([redacted!]), false);
    }
  });

  it('redacts both of two bearer values in one JSON-serialized string, and a labelled secret right after one', () => {
    assert.equal(redactArgv([TWO_HEADERS])[0], JSON.stringify([REDACTED, REDACTED]));
    assert.equal(redactArgv([LABEL_AFTER])[0], `${REDACTED},${REDACTED}`);
  });

  it('catches a value holding a character outside the alphabet only by its leading run: the stated limit the control plane config closes for its tokens', () => {
    for (const value of [PUNCTUATED32, MARKED32]) {
      assert.equal(containsCredentialMaterial([value]), false, value.slice(0, 12));
      assert.equal(redactArgv([value])[0], value);
    }
    assert.equal(containsCredentialMaterial([RUN21_PUNCTUATED34]), true);
    assert.equal(redactArgv([`authorization: ${RUN21_PUNCTUATED34}`])[0], `authorization: ${REDACTED}!${'m8S'.repeat(4)}`);
  });

  it('does not detect a URL after "bearer": its ":" ends the run at five characters', () => {
    assert.equal(containsCredentialMaterial([LONG_URL]), false);
  });

  it('does not detect a token variable name written with a leading $, or CONTROL_PLANE_TOKEN written bare', () => {
    for (const text of NAMES_NOT_DETECTED) assert.equal(containsCredentialMaterial([text]), false, text);
  });

  it('detects PHASE3_ADJUDICATION_TOKEN and PHASE4_COUNTED_RUN_TOKEN written bare: an accepted false positive', () => {
    for (const text of NAMES_DETECTED) assert.equal(containsCredentialMaterial([text]), true, text);
  });

  it('leaves the start of a provider-key shape that reached its length only with "-bearer" glued after it: a stated limit', () => {
    assert.equal(containsCredentialMaterial([GLUED]), true);
    const [redacted] = redactArgv([GLUED]);
    assert.equal(redacted, `${GLUED_PREFIX}${REDACTED}`);
  });
});
