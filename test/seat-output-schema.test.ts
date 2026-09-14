/**
 * Lane A — structured seat outputs (OMP→MAD Evolve Pack v0, Founder act of
 * 2026-09-13).
 *
 * Imports only the package's public entry (packages/seat-output-schema) and,
 * for vocabulary, the Seat Registry public entry. No production logic here.
 *
 * What is proven:
 *   - the schema language refuses its own malformed instances (fail-closed);
 *   - strict mode REJECTS an invalid output; permissive mode FLAGS it; neither
 *     returns the PASS-shaped `accepted` verdict for an invalid output;
 *   - an unknown mode, a defective schema, a refused V1 record, and a
 *     malformed candidate are all `rejected`, never defaulted;
 *   - the dogfood builder path returns a machine-checkable handoff, and the
 *     vendored fixture pair proves invalid ≠ accepted under both modes;
 *   - the package sources are pure and import the registry only via its entry.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUILDER_VERIFICATION_OUTPUT_SCHEMA,
  HANDOFF_VERDICTS,
  MAX_SCHEMA_DEPTH,
  SCHEMA_MODES,
  builderVerificationHandoff,
  checkSchema,
  evaluateStructuredHandoff,
  isCleanAcceptance,
  isSchemaMode,
  validateOutput,
  type BuilderVerificationReport,
  type HandoffEvaluation,
  type OutputSchema,
  type StructuredHandoff,
} from '../packages/seat-output-schema/src/index.js';
import { SEAT_TERMINAL_STATUSES, type SeatHandoff } from '../packages/seat-registry/src/index.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = join(REPO_ROOT, 'packages', 'seat-output-schema', 'fixtures');
const PACKAGE_SRC = join(REPO_ROOT, 'packages', 'seat-output-schema', 'src');

const SHA = '0123456789abcdef0123456789abcdef01234567';

const REPORT: BuilderVerificationReport = {
  work_id: 'LANE-A-DOGFOOD',
  plan: { path: 'docs/planning/omp-evolve-pack-v0/HANDOFF-lane-a-seat-output-schema.md', sha256: 'f'.repeat(64) },
  repository: 'MADVenturesLLC/founder-os-build-room',
  branch: 'build/seat-output-schema-v0',
  base_sha: '736b12b33a20dd055d88ba0ec1e30621797cc959',
  head_sha: SHA,
  changed_paths: ['packages/seat-output-schema/src/index.ts'],
  commands: [{ command: 'node --test dist/test/seat-output-schema.test.js', exit_code: 0, result: 'pass' }],
  acceptance: [{ criterion: 'strict rejects', status: 'met', evidence: 'this suite' }],
  unresolved_issues: [],
  next_role: 'independent-reviewer',
  claims: { merge_authorized: false, production: false, provider_execution: false },
};

const V1_HANDOFF: SeatHandoff = {
  receives_from: 'architect',
  produces: 'Build Report',
  terminal_status: 'BUILD_READY_FOR_INDEPENDENT_VERIFICATION',
  committed_sha: SHA,
  authorization_refs: ['FOUNDER-ACT-2026-09-13'],
};

const SIMPLE_SCHEMA: OutputSchema = {
  type: 'object',
  additional_properties: false,
  required: ['count', 'label'],
  properties: {
    count: { type: 'integer', minimum: 0 },
    label: { type: 'string', enum: ['a', 'b'] },
  },
};

function candidate(overrides: Partial<StructuredHandoff> & { output?: unknown }): StructuredHandoff {
  return {
    seat_id: 'builder',
    handoff: V1_HANDOFF,
    output_schema: SIMPLE_SCHEMA,
    schema_mode: 'strict',
    output: { count: 1, label: 'a' },
    ...overrides,
  };
}

/** The invariant every evaluation must satisfy: clean ⇔ accepted. */
function assertInvariant(evaluation: HandoffEvaluation): void {
  assert.equal(evaluation.clean, evaluation.verdict === 'accepted');
  assert.ok((HANDOFF_VERDICTS as readonly string[]).includes(evaluation.verdict));
  assert.equal(evaluation.flags.length > 0, evaluation.verdict === 'accepted_with_flags');
  if (evaluation.verdict === 'rejected') assert.notEqual(evaluation.rejection, null);
  else assert.equal(evaluation.rejection, null);
}

/* ------------------------------------------------------------------ */
/* Schema well-formedness                                               */
/* ------------------------------------------------------------------ */

describe('seat-output-schema · checkSchema refuses malformed schemas', () => {
  it('accepts the simple schema and the dogfood schema', () => {
    assert.deepEqual(checkSchema(SIMPLE_SCHEMA), []);
    assert.deepEqual(checkSchema(BUILDER_VERIFICATION_OUTPUT_SCHEMA), []);
  });

  it('refuses non-objects, unknown types, and unknown keys', () => {
    assert.ok(checkSchema(null).length > 0);
    assert.ok(checkSchema('string').length > 0);
    assert.ok(checkSchema({ type: 'any' }).length > 0);
    assert.ok(checkSchema({ type: 'string', minimum: 1 }).length > 0, 'a number key on a string schema is a defect');
  });

  it('refuses an object schema without properties, required, or additional_properties (no default)', () => {
    assert.ok(checkSchema({ type: 'object', properties: {}, required: [] }).length > 0);
    assert.ok(checkSchema({ type: 'object', required: [], additional_properties: false }).length > 0);
    assert.ok(checkSchema({ type: 'object', properties: {}, additional_properties: false }).length > 0);
  });

  it('refuses a required key that is not declared', () => {
    const defects = checkSchema({ type: 'object', properties: {}, required: ['x'], additional_properties: false });
    assert.match(defects.map((d) => d.message).join('\n'), /required key "x" is not declared/);
  });

  it('refuses a pattern that does not compile, and an oversized pattern', () => {
    assert.ok(checkSchema({ type: 'string', pattern: '(' }).length > 0);
    assert.ok(checkSchema({ type: 'string', pattern: 'a'.repeat(513) }).length > 0);
  });

  it('refuses inverted bounds', () => {
    assert.ok(checkSchema({ type: 'string', min_length: 3, max_length: 1 }).length > 0);
    assert.ok(checkSchema({ type: 'integer', minimum: 3, maximum: 1 }).length > 0);
    assert.ok(checkSchema({ type: 'array', items: { type: 'null' }, min_items: 2, max_items: 1 }).length > 0);
  });

  it('refuses an array schema without items, and bounds nesting depth', () => {
    assert.ok(checkSchema({ type: 'array' }).length > 0);
    let deep: unknown = { type: 'null' };
    for (let i = 0; i <= MAX_SCHEMA_DEPTH + 1; i += 1) deep = { type: 'array', items: deep };
    assert.ok(checkSchema(deep).some((d) => /nesting exceeds/.test(d.message)));
  });

  it('names the defect path', () => {
    const defects = checkSchema({
      type: 'object',
      additional_properties: false,
      required: [],
      properties: { inner: { type: 'array', items: { type: 'bogus' } } },
    });
    assert.ok(defects.some((d) => d.path === '/properties/inner/items'));
  });
});

/* ------------------------------------------------------------------ */
/* Output validation                                                    */
/* ------------------------------------------------------------------ */

describe('seat-output-schema · validateOutput', () => {
  it('returns no violations for a conforming value', () => {
    assert.deepEqual(validateOutput(SIMPLE_SCHEMA, { count: 3, label: 'b' }), []);
  });

  it('reports type mismatches, missing required keys, and undeclared keys with paths', () => {
    const violations = validateOutput(SIMPLE_SCHEMA, { count: '3', extra: true });
    const codes = violations.map((v) => `${v.code}@${v.path}`).sort();
    assert.deepEqual(codes, ['additional_property@/extra', 'required_missing@/label', 'type_mismatch@/count']);
  });

  it('distinguishes integer from number and refuses non-finite numbers', () => {
    assert.equal(validateOutput({ type: 'integer' }, 1.5).length, 1);
    assert.equal(validateOutput({ type: 'number' }, 1.5).length, 0);
    assert.equal(validateOutput({ type: 'number' }, Number.NaN).length, 1);
    assert.equal(validateOutput({ type: 'number' }, Number.POSITIVE_INFINITY).length, 1);
  });

  it('enforces pattern, enum, length, range, const, and array items', () => {
    assert.equal(validateOutput({ type: 'string', pattern: '^[a-f0-9]{4}$' }, 'zzzz')[0]?.code, 'pattern_mismatch');
    assert.equal(validateOutput({ type: 'string', enum: ['x'] }, 'y')[0]?.code, 'enum_mismatch');
    assert.equal(validateOutput({ type: 'string', min_length: 2 }, 'a')[0]?.code, 'length');
    assert.equal(validateOutput({ type: 'integer', maximum: 1 }, 2)[0]?.code, 'range');
    assert.equal(validateOutput({ type: 'boolean', const: false }, true)[0]?.code, 'const_mismatch');
    const items = validateOutput({ type: 'array', items: { type: 'integer' }, min_items: 3 }, [1, 'x']);
    assert.deepEqual(items.map((v) => `${v.code}@${v.path}`).sort(), ['length@', 'type_mismatch@/1']);
  });

  it('never throws on any value', () => {
    for (const value of [undefined, null, 0, '', [], {}, () => 1, Symbol('s'), 10n]) {
      assert.doesNotThrow(() => validateOutput(SIMPLE_SCHEMA, value));
      assert.ok(validateOutput(SIMPLE_SCHEMA, value).length > 0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Strict vs permissive                                                 */
/* ------------------------------------------------------------------ */

describe('seat-output-schema · strict rejects, permissive flags, neither accepts', () => {
  const invalidOutput = { count: -1, label: 'z' };

  it('exposes exactly two modes and a closed verdict set', () => {
    assert.deepEqual([...SCHEMA_MODES], ['strict', 'permissive']);
    assert.deepEqual([...HANDOFF_VERDICTS], ['accepted', 'accepted_with_flags', 'rejected']);
    assert.equal(isSchemaMode('strict'), true);
    assert.equal(isSchemaMode('lenient'), false);
    assert.equal(isSchemaMode(undefined), false);
  });

  it('accepts a valid output cleanly under both modes', () => {
    for (const schema_mode of SCHEMA_MODES) {
      const evaluation = evaluateStructuredHandoff(candidate({ schema_mode }));
      assertInvariant(evaluation);
      assert.equal(evaluation.verdict, 'accepted');
      assert.equal(isCleanAcceptance(evaluation), true);
      assert.deepEqual(evaluation.violations, []);
    }
  });

  it('strict mode rejects an invalid output and names the violations', () => {
    const evaluation = evaluateStructuredHandoff(candidate({ schema_mode: 'strict', output: invalidOutput }));
    assertInvariant(evaluation);
    assert.equal(evaluation.verdict, 'rejected');
    assert.equal(evaluation.rejection, 'output_violations');
    assert.equal(evaluation.schema_mode, 'strict');
    assert.equal(evaluation.violations.length, 2);
    assert.equal(isCleanAcceptance(evaluation), false);
  });

  it('permissive mode flags the same output — accepted_with_flags, never accepted, never clean', () => {
    const strict = evaluateStructuredHandoff(candidate({ schema_mode: 'strict', output: invalidOutput }));
    const evaluation = evaluateStructuredHandoff(candidate({ schema_mode: 'permissive', output: invalidOutput }));
    assertInvariant(evaluation);
    assert.equal(evaluation.verdict, 'accepted_with_flags');
    assert.equal(evaluation.clean, false);
    assert.equal(isCleanAcceptance(evaluation), false);
    assert.equal(evaluation.flags.length, 2);
    assert.deepEqual(evaluation.violations, strict.violations, 'permissive sees exactly what strict saw');
    assert.match(evaluation.flags.join('\n'), /range at \/count/);
    assert.match(evaluation.flags.join('\n'), /enum_mismatch at \/label/);
  });
});

/* ------------------------------------------------------------------ */
/* Fail-closed paths                                                    */
/* ------------------------------------------------------------------ */

describe('seat-output-schema · fail-closed: nothing is defaulted into acceptance', () => {
  it('an unknown or missing mode is rejected, not defaulted to permissive', () => {
    for (const schema_mode of ['lenient', '', undefined, null, 1] as unknown[]) {
      const evaluation = evaluateStructuredHandoff({ ...candidate({}), schema_mode });
      assertInvariant(evaluation);
      assert.equal(evaluation.verdict, 'rejected');
      assert.equal(evaluation.rejection, 'invalid_schema_mode');
      assert.equal(evaluation.schema_mode, null);
    }
  });

  it('a defective schema is rejected even when the output would satisfy anything', () => {
    for (const schema_mode of SCHEMA_MODES) {
      const evaluation = evaluateStructuredHandoff({
        ...candidate({ schema_mode }),
        output_schema: { type: 'object', properties: {}, required: [] } as unknown as OutputSchema, // no additional_properties
      });
      assertInvariant(evaluation);
      assert.equal(evaluation.verdict, 'rejected');
      assert.equal(evaluation.rejection, 'malformed_schema');
      assert.ok(evaluation.schema_defects.length > 0);
    }
  });

  it('a malformed candidate, an unknown seat, and a refused V1 record are rejected', () => {
    for (const bad of [null, 'prose handoff', 42, [], undefined]) {
      const evaluation = evaluateStructuredHandoff(bad);
      assertInvariant(evaluation);
      assert.equal(evaluation.rejection, 'malformed_candidate');
    }
    const unknownSeat = evaluateStructuredHandoff({ ...candidate({}), seat_id: 'Hephaestus' });
    assert.equal(unknownSeat.rejection, 'unknown_seat', 'a display name is not a seat id (r7 §1.2)');

    const badStatus = evaluateStructuredHandoff(
      candidate({ handoff: { ...V1_HANDOFF, terminal_status: 'SEAT_VERIFIED' } }),
    );
    assertInvariant(badStatus);
    assert.equal(badStatus.rejection, 'invalid_handoff');
    assert.match(badStatus.handoff_error ?? '', /not a terminal status of seat "builder"/);

    const shortSha = evaluateStructuredHandoff(candidate({ handoff: { ...V1_HANDOFF, committed_sha: 'abc' } }));
    assert.equal(shortSha.rejection, 'invalid_handoff');

    const noHandoff = evaluateStructuredHandoff({ ...candidate({}), handoff: 'BUILD READY' });
    assert.equal(noHandoff.rejection, 'invalid_handoff');
  });

  it('the V1 handoff record is checked before the output, so a prose-only handoff never reaches the schema', () => {
    const evaluation = evaluateStructuredHandoff({
      ...candidate({ output: 'looks good, ship it' }),
      handoff: { ...V1_HANDOFF, authorization_refs: [] },
    });
    assert.equal(evaluation.rejection, 'invalid_handoff');
    assert.deepEqual(evaluation.violations, []);
  });
});

/* ------------------------------------------------------------------ */
/* Dogfood: the builder seat's terminal handoff is machine-checkable    */
/* ------------------------------------------------------------------ */

describe('seat-output-schema · dogfood builder handoff', () => {
  it('builds a strict structured handoff whose V1 record mirrors the ratified builder registration', () => {
    const structured = builderVerificationHandoff({ report: REPORT, authorization_refs: ['FOUNDER-ACT-2026-09-13'] });
    assert.equal(structured.seat_id, 'builder');
    assert.equal(structured.schema_mode, 'strict');
    assert.equal(structured.handoff.receives_from, 'architect');
    assert.equal(structured.handoff.produces, 'Build Report');
    assert.ok(SEAT_TERMINAL_STATUSES.builder.includes(structured.handoff.terminal_status));
    assert.equal(structured.handoff.committed_sha, REPORT.head_sha, 'the record and the output cannot disagree about the SHA');
    const evaluation = evaluateStructuredHandoff(structured);
    assertInvariant(evaluation);
    assert.equal(evaluation.verdict, 'accepted');
    assert.equal(isCleanAcceptance(evaluation), true);
  });

  it('a builder handoff that asserts merge, production, or provider execution is schema-invalid by construction', () => {
    for (const claim of ['merge_authorized', 'production', 'provider_execution'] as const) {
      const report = { ...REPORT, claims: { ...REPORT.claims, [claim]: true } } as unknown as BuilderVerificationReport;
      const evaluation = evaluateStructuredHandoff(builderVerificationHandoff({ report, authorization_refs: ['x'] }));
      assertInvariant(evaluation);
      assert.equal(evaluation.verdict, 'rejected');
      assert.ok(evaluation.violations.some((v) => v.path === `/claims/${claim}` && v.code === 'const_mismatch'));
    }
  });

  it('a prose-only "output" is rejected, so the dogfood path cannot degrade to narrative', () => {
    const structured = builderVerificationHandoff({ report: REPORT, authorization_refs: ['x'] });
    const evaluation = evaluateStructuredHandoff({ ...structured, output: 'Build complete. All tests pass.' });
    assert.equal(evaluation.verdict, 'rejected');
    assert.equal(evaluation.violations[0]?.code, 'type_mismatch');
  });
});

/* ------------------------------------------------------------------ */
/* Fixture pair: invalid schema ≠ accepted verdict                      */
/* ------------------------------------------------------------------ */

describe('seat-output-schema · vendored fixture pair', () => {
  const valid = JSON.parse(readFileSync(join(FIXTURES, 'builder-verification-handoff.valid.json'), 'utf8')) as StructuredHandoff;
  const invalid = JSON.parse(readFileSync(join(FIXTURES, 'builder-verification-handoff.invalid.json'), 'utf8')) as StructuredHandoff;

  it('the valid fixture is accepted cleanly, and its schema equals the exported dogfood schema', () => {
    assert.deepEqual(valid.output_schema, BUILDER_VERIFICATION_OUTPUT_SCHEMA);
    const evaluation = evaluateStructuredHandoff(valid);
    assertInvariant(evaluation);
    assert.equal(evaluation.verdict, 'accepted');
  });

  it('the invalid fixture is rejected under strict and flagged under permissive — never accepted', () => {
    assert.equal(invalid.schema_mode, 'strict');
    const strict = evaluateStructuredHandoff(invalid);
    assertInvariant(strict);
    assert.equal(strict.verdict, 'rejected');
    assert.equal(strict.rejection, 'output_violations');
    const paths = strict.violations.map((v) => v.path).sort();
    assert.deepEqual(paths, ['/claims/merge_authorized', '/commands/0/exit_code', '/head_sha', '/worktree']);

    const permissive = evaluateStructuredHandoff({ ...invalid, schema_mode: 'permissive' });
    assertInvariant(permissive);
    assert.equal(permissive.verdict, 'accepted_with_flags');
    assert.equal(permissive.clean, false);
    assert.equal(permissive.flags.length, 4);

    for (const evaluation of [strict, permissive]) {
      assert.notEqual(evaluation.verdict, 'accepted');
      assert.equal(isCleanAcceptance(evaluation), false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Static: purity and the single-entry rule                             */
/* ------------------------------------------------------------------ */

describe('seat-output-schema · static surface', () => {
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

  it('imports only relative modules and the seat-registry public entry; no node: I/O, no env, no clock', () => {
    const files = tsFiles(PACKAGE_SRC);
    assert.ok(files.length >= 4);
    const envRead = 'pro' + 'cess.env';
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of specifiers(source)) {
        assert.ok(specifier.startsWith('.'), `${relative(REPO_ROOT, file)} imports non-relative ${specifier}`);
        if (specifier.includes('seat-registry')) {
          assert.match(specifier, /seat-registry\/src\/index\.js$/, `${relative(REPO_ROOT, file)} deep-imports seat-registry`);
        }
      }
      assert.ok(!source.includes(envRead), `${relative(REPO_ROOT, file)} reads the environment`);
      assert.ok(!/\bDate\.now\s*\(|\bnew\s+Date\s*\(|\bMath\.random\s*\(/.test(source), `${relative(REPO_ROOT, file)} reads ambient state`);
    }
  });

  it('carries no package manifest — not a workspace member, no lockfile change (Founder ruling 2026-09-05)', () => {
    assert.throws(() => readFileSync(join(REPO_ROOT, 'packages', 'seat-output-schema', 'package.json')));
  });
});
