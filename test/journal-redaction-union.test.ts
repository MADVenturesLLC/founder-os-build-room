/**
 * Redaction of every match of every shape in the value as it was written,
 * and the guard's agreement with what redaction leaves
 * (FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION, Part B; Amendment 6 U5
 * of FOUNDER-ACT-20261105-BR-BEARER-SHAPE).
 *
 * Until this act, redactString replaced shape after shape, each over what the
 * shapes before it had left, so one shape's match decided what a later shape
 * could see. R1 of the review of 6dbfa08 is that case: a bearer value took a
 * secret's label as characters of its alphabet, and the labelled value after
 * it stayed in the journal row.
 *
 * Token-shaped fixtures are assembled at runtime, as `journal-7.3-secrets`
 * does, so the repository's secret scan does not read them as leaks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REDACTED, containsCredentialMaterial, redactArgv } from '../packages/journal/src/index.js';

const scheme = 'Bear' + 'er';
const PROVIDER = 's' + 'k-';
const GITHUB = 'gh' + 'p_';
const PRIVATE_KEY = 'PRIV' + 'ATE KEY';
/** The eight label forms labelled_secret knows. */
const LABELS = ['tok' + 'en', 'api' + '_key', 'api' + '-key', 'api' + 'key', 'sec' + 'ret', 'pass' + 'word', 'pass' + 'wd', 'creden' + 'tial'];

/** R1 of the review of 6dbfa08: a secret's label glued to the end of a 32-character bearer value. */
function r1(label: string): string {
  return `${scheme} ${'a'.repeat(32)}_${label}= hunter2`;
}

function redactOne(value: string): string {
  const [out] = redactArgv([value]);
  assert.ok(out !== undefined);
  return out;
}

/** A deterministic generator, so the 200,000 inputs are the same on every run. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 4294967296;
  };
}

describe('journal redaction · every match of every shape (FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION)', () => {
  it('B9(a): redacts R1 whole for each of the eight label forms, and the guard passes the result', () => {
    for (const label of LABELS) {
      const input = r1(label);
      assert.equal(containsCredentialMaterial([input]), true, label);
      const out = redactOne(input);
      assert.equal(out, REDACTED, label);
      assert.equal(out.includes('hunter2'), false, label);
      assert.equal(containsCredentialMaterial([out]), false, label);
    }
  });

  it('B9(b): every case of the four reviews of pull request 146 comes out as stated', () => {
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      // 984518d: a 32-character token holding "!"; its leading run is 16 characters. The stated limit the control plane's config closes for its tokens.
      ['984518d', `${scheme} ${'q7R'.repeat(5)}X!${'m8S'.repeat(5)}`, `${scheme} ${'q7R'.repeat(5)}X!${'m8S'.repeat(5)}`],
      // 65d5591 R1: a 39-character token holding "!" and a provider key. The same limit: the key is redacted, the leading run is too short.
      [
        '65d5591 R1',
        `${scheme} ${'q7R'.repeat(3)}!${PROVIDER}${'Zq7'.repeat(7)}!tail`,
        `${scheme} ${'q7R'.repeat(3)}!${REDACTED}!tail`,
      ],
      // 65d5591 R2: a token holding the marker itself. Unchanged.
      ['65d5591 R2', `${scheme} ${'q7R'.repeat(3)}${REDACTED}${'!'.repeat(13)}`, `${scheme} ${'q7R'.repeat(3)}${REDACTED}${'!'.repeat(13)}`],
      // 04f2739: two bearer values in one JSON-serialized string. Both redacted.
      [
        '04f2739',
        JSON.stringify([`${scheme} ${'a'.repeat(32)}`, `${scheme} ${'b'.repeat(32)}`]),
        JSON.stringify([REDACTED, REDACTED]),
      ],
      // 6dbfa08 R1. Redacted whole.
      ['6dbfa08 R1', r1('pass' + 'word'), REDACTED],
    ];
    for (const [review, input, expected] of cases) {
      const out = redactOne(input);
      assert.equal(out, expected, review);
      assert.equal(containsCredentialMaterial([out]), false, review);
    }
  });

  it('B9(d): the guard passes every output of 200,000 generated inputs, and every input the guard flags is changed', () => {
    const fragments = [
      `${scheme} `,
      'a'.repeat(32),
      `_${'pass' + 'word'}=`,
      ' ',
      'hunter2',
      `${GITHUB}${'A'.repeat(20)}`,
      PROVIDER,
      'Zq7'.repeat(6),
      REDACTED,
      `${'tok' + 'en'}:`,
      '=',
      'xo' + 'xb-',
      'AK' + 'IA',
      'ABCDEFGHIJKLMNOP',
      'ey' + 'J',
      'abcdefgh.',
      '!',
      ',',
      '"',
      'https://u:p' + '@h',
      `-----BEGIN RSA ${PRIVATE_KEY}-----`,
      `-----END RSA ${PRIVATE_KEY}-----`,
      '0123456789abcdef'.repeat(3),
      'evt_2193d484-d29f-4569-85c2-afe364a062eb',
    ];
    const next = lcg(12345);
    let flagged = 0;
    for (let i = 0; i < 200_000; i++) {
      let input = '';
      const parts = 1 + Math.floor(next() * 7);
      for (let j = 0; j < parts; j++) input += fragments[Math.floor(next() * fragments.length)];
      const out = redactOne(input);
      if (containsCredentialMaterial([out])) assert.fail(`the guard still flags the redaction of ${JSON.stringify(input)}: ${JSON.stringify(out)}`);
      if (containsCredentialMaterial([input])) {
        flagged += 1;
        if (out === input) assert.fail(`an input the guard flags came back unchanged: ${JSON.stringify(input)}`);
      }
    }
    assert.ok(flagged > 50_000, `the generator should mostly build flagged inputs; it built ${flagged}`);
  });

  it('B9(e): an argv entry in which no shape matches comes back unchanged', () => {
    const plain = [
      'The control plane journals the command before it dispatches it.',
      'bearer credentials',
      '6b80c2259558e93d4f12dca474cc1d491930bd5d',
      '83757a5c1a22e1314c3a6e5d0f88ca1d58d01277d6f0927f1d08c39431b5c09c',
      'e006e499-58a4-4392-a624-e6170a393e36',
      'packages/journal/src/redact.ts',
      'git log --oneline -1',
    ];
    for (const value of plain) {
      assert.equal(containsCredentialMaterial([value]), false, value);
      assert.equal(redactOne(value), value, value);
    }
    const plannerArgv = ['--room', 'e006e499-58a4-4392-a624-e6170a393e36', '--opened-by', 'evt_2193d484-d29f-4569-85c2-afe364a062eb'];
    assert.deepEqual(redactArgv(plannerArgv), plannerArgv);
  });

  it('B9(f): overlapping ranges take one marker, touching ranges one each, and a value whose credentials appear only once its markers are removed becomes one marker', () => {
    // Overlap: a provider key inside a bearer value, and R1's bearer value and labelled secret.
    assert.equal(redactOne(`${scheme} abc_${PROVIDER}${'Zq7'.repeat(9)}`), REDACTED);
    assert.equal(redactOne(r1('sec' + 'ret')), REDACTED);

    // Touching: a GitHub token ends where a PEM block begins.
    const pem = `-----BEGIN RSA ${PRIVATE_KEY}-----\nabc\n-----END RSA ${PRIVATE_KEY}-----`;
    assert.equal(redactOne(`${GITHUB}${'A'.repeat(20)}${pem}`), `${REDACTED}${REDACTED}`);

    // Two credentials that exist only once the markers inside them are removed:
    // no shape matches the value as written, the guard would find them, so the whole value goes (Amendment 1 V1).
    const split = `${GITHUB}${REDACTED}${'A'.repeat(20)} ${PROVIDER}${REDACTED}${'B'.repeat(16)}`;
    assert.equal(containsCredentialMaterial([split]), true);
    assert.equal(redactOne(split), REDACTED);

    // Text on both sides of a marker that joins into a bearer value.
    const joined = `${scheme} ${REDACTED}evt_2193d484-d29f-4569-85c2-afe364a062eb`;
    assert.equal(containsCredentialMaterial([joined]), true);
    assert.equal(redactOne(joined), REDACTED);
  });

  it('B9(f): the input of Amendment 1\'s basis, 1,872 marker-split GitHub tokens, is redacted in one step', () => {
    const unit = `${GITHUB}${REDACTED}${'A'.repeat(20)} `;
    const input = unit.repeat(1872);
    assert.equal(input.length, 65_520);
    const started = performance.now();
    const out = redactOne(input);
    const elapsed = performance.now() - started;
    assert.equal(out, REDACTED);
    // The act's first B2 took about two seconds here. B6's own bound, twice the
    // base plus 25 ms, is measured by the benchmark the act names, not by CI;
    // this ceiling only catches a return of the quadratic loop.
    assert.ok(elapsed < 500, `took ${elapsed.toFixed(1)} ms`);
  });
  it('B9(i): the URL shape takes linear time, and still matches a scheme of 64 characters but not one of 65 (Amendment 2 W1, W6)', () => {
    const r1Of37fdf8f = `${'tok' + 'en'}=${'a-'.repeat(32765)}`;
    const hyphens = 'a-'.repeat(32768);
    for (const input of [r1Of37fdf8f, hyphens]) {
      const started = performance.now();
      const out = redactOne(input);
      containsCredentialMaterial([input]);
      const elapsed = performance.now() - started;
      assert.equal(containsCredentialMaterial([out]), false);
      // Unbounded, the scheme part took about three seconds on each.
      assert.ok(elapsed < 500, `took ${elapsed.toFixed(1)} ms`);
    }
    const userinfo = 'adm' + 'in:hun' + 'ter2';
    // 64 characters: matched, and the user and password are redacted.
    const matched = `x${'a-'.repeat(31)}a://${userinfo}@host`;
    assert.equal(containsCredentialMaterial([matched]), true);
    assert.equal(redactOne(matched), `${REDACTED}host`);
    // 65 characters with no "+", "." or "-" in them: not matched. The entropy
    // shape takes the scheme, and the user and password stay (the stated limit).
    const unmatched = `x${'a'.repeat(64)}://${userinfo}@host`;
    assert.equal(containsCredentialMaterial([unmatched]), false);
    assert.equal(redactOne(unmatched), `${REDACTED}://${userinfo}@host`);
    // 65 characters with a "-" in the last 64: matched from the letter after it.
    const later = `x${'a-'.repeat(32)}://${userinfo}@host`;
    assert.equal(containsCredentialMaterial([later]), true);
    assert.equal(redactOne(later), `xa-${REDACTED}host`);
  });
});
