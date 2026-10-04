/**
 * Registry parity for the journal write-path redaction guard.
 *
 * The Founder's ruling of 2026-10-04 (C3 — RULING, landed at
 * docs/planning/command-journal/custody/
 * FOUNDER-RULING-journal-redaction-C3-FD3-20261003.txt) designates
 * `packages/journal`'s pre-write guard as the redaction boundary of the
 * production journal write path, on one condition: the guard's detection
 * list contains every shape in `packages/redaction`'s registry. This test
 * is the instrument that holds that condition.
 *
 * For every `BUILTIN_SHAPES` entry there is a synthetic vector here. Each
 * vector must (1) match the registry shape it is written for, so it is a
 * fair sample of that shape; (2) be DETECTED by `containsCredentialMaterial`,
 * which is what refuses the whole row at the write path; and (3) be REDACTED
 * by `redactArgv`, which is what normalization applies. A registry shape
 * with no vector here fails the first case by name, so a shape added to the
 * registry cannot silently reopen the gap the ruling closed.
 *
 * Every vector is synthetic. No value here is, or ever was, a credential.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_SHAPES } from '../packages/redaction/src/registry.js';
import { REDACTED, containsCredentialMaterial, redactArgv } from '../packages/journal/src/redact.js';

/**
 * One fair sample per registry shape, keyed by the registry's shape name.
 *
 * Every vector is ASSEMBLED at runtime from pieces that are not themselves
 * credential-shaped, the same way `test/redaction.test.ts` and
 * `test/journal-7.3-secrets.test.ts` spell theirs. The repository's secret
 * scan (gitleaks, over the whole git history) would otherwise flag this
 * file's source as a leak, and a literal that scanners flag is exactly the
 * kind of string this test must never commit.
 */
const VECTORS: Readonly<Record<string, string>> = {
  'pem-private-key': ['-----BEGIN', 'PRIVATE KEY-----', 'AAAA', '-----END', 'PRIVATE KEY-----']
    .join('\n')
    .replace('BEGIN\n', 'BEGIN ')
    .replace('END\n', 'END '),
  'openai-style-sk': `sk-${'A'.repeat(24)}`,
  'github-pat': `ghp_${'A'.repeat(36)}`,
  'aws-access-key-id': 'AKIA' + 'A'.repeat(16),
  'slack-token': 'xoxb-' + 'a'.repeat(14),
  jwt: `eyJ${'A'.repeat(10)}.${'B'.repeat(10)}.${'C'.repeat(10)}`,
};

/** A non-global copy, so `.test()` cannot carry `lastIndex` between calls. */
function nonGlobal(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.replace('g', ''));
}

describe('journal redaction guard — parity with packages/redaction BUILTIN_SHAPES (ruling of 2026-10-04, C3)', () => {
  it('every registry shape has a parity vector (a new registry shape must be added here and detected)', () => {
    const missing = BUILTIN_SHAPES.map((shape) => shape.name).filter((name) => !(name in VECTORS));
    assert.deepEqual(missing, [], `registry shapes without a parity vector: ${missing.join(', ')}`);
  });

  it('every vector is a fair sample: it matches the registry shape it is written for', () => {
    for (const shape of BUILTIN_SHAPES) {
      const vector = VECTORS[shape.name];
      assert.ok(vector !== undefined, `no vector for ${shape.name}`);
      assert.ok(nonGlobal(shape.pattern).test(vector), `vector for ${shape.name} does not match the registry pattern`);
    }
  });

  for (const shape of BUILTIN_SHAPES) {
    it(`${shape.name}: detected by containsCredentialMaterial and redacted by redactArgv`, () => {
      const vector = VECTORS[shape.name];
      assert.ok(vector !== undefined, `no vector for ${shape.name}`);
      assert.equal(containsCredentialMaterial([vector]), true, `${shape.name} is not detected by the guard`);
      const [redacted] = redactArgv([vector]);
      assert.ok(redacted !== undefined);
      assert.notEqual(redacted, vector, `${shape.name} is not redacted by the guard`);
      assert.ok(!redacted.includes(vector), `${shape.name}: the vector survives redaction`);
      assert.ok(redacted.includes(REDACTED), `${shape.name}: redaction left no ${REDACTED} marker`);
    });
  }

  it('the guard still detects a vector embedded in a larger argv string', () => {
    for (const shape of BUILTIN_SHAPES) {
      const vector = VECTORS[shape.name];
      assert.ok(vector !== undefined);
      const embedded = `--note=see ${vector} before dispatch`;
      assert.equal(containsCredentialMaterial([embedded]), true, `${shape.name} embedded in argv is not detected`);
      const [redacted] = redactArgv([embedded]);
      assert.ok(redacted !== undefined && !redacted.includes(vector), `${shape.name} embedded in argv survives redaction`);
    }
  });
});
