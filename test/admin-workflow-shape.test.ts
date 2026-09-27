/**
 * C-T1 — static shape assertions over the administrative migration workflow,
 * `.github/workflows/db-admin-migration.yml` (PR 2b Tranche C; plan r1 §4.3
 * C-T1 and §5.3 C-R1, C-R2, C-R4, C-R8; r6 §7.1, §8.2, §9.1, §10).
 *
 * The workflow is YAML the platform executes; nothing in this repository can
 * run it. What CAN be asserted here, before any GitHub environment exists, is
 * the text: the trigger set; the concurrency block that C-R4's no-cancel
 * guarantee rests on; the 40-hex input validation; the order in which the SHA
 * is validated, then compared, and only then allowed anywhere near the
 * environment or the secret; that the ungated job declares no environment;
 * and that no sibling workflow references the environment (C-R8, PC-30). A
 * mis-specified concurrency group caught here costs nothing; caught live it
 * costs a privileged run (plan r1 §5.3).
 *
 * Text and line assertions only. The repository carries no YAML parser and
 * adding one would change the pinned lockfile. Comment lines are dropped
 * before every assertion, so a comment can neither satisfy nor defeat one.
 * C-R3, C-R5, C-R7 and C-R9 are live-platform checks and are not claimed
 * here.
 *
 * Follows the static-analysis convention of test/purity.test.ts: this file
 * reads the tree so that it can inspect it; the assertions are about the
 * shipped workflow text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');
const WORKFLOW_FILE = 'db-admin-migration.yml';
const WORKFLOW_PATH = join(WORKFLOWS_DIR, WORKFLOW_FILE);
const CI_PATH = join(WORKFLOWS_DIR, 'ci.yml');

/** r6 §7.1: the protected environment's name. */
const ENVIRONMENT_NAME = 'db-admin-migration';
/** r6 §9.1: the constant concurrency group, never interpolated. */
const CONCURRENCY_GROUP = 'pr2b-admin-migration';
/** r6 §8.2 step 2: exactly 40 lowercase hexadecimal characters. */
const SHA_SHAPE = '^[0-9a-f]{40}$';
/** r6 §8.2 step 4: the fail-closed marker, verbatim. */
const FAIL_CLOSED_MARKER = 'FAIL CLOSED — UNAUTHORIZED SHA';
/** A comparison of the two SHAs, whichever side each is written on. */
const SHA_COMPARISON = /FOUNDER_AUTHORIZED_SHA.*!=.*OBSERVED_SHA|OBSERVED_SHA.*!=.*FOUNDER_AUTHORIZED_SHA/;
const SECRET_CONTEXT = '${{ secrets.';
const ENVIRONMENT_KEY = /^\s+environment:/;
const REQUIRED_INPUTS = ['founder_authorized_sha', 'tranche_id'];

interface Line {
  /** Zero-based position in the file, so ordering assertions read in file order. */
  readonly index: number;
  readonly text: string;
}

function readWorkflow(): string {
  assert.ok(
    existsSync(WORKFLOW_PATH),
    `C-N1 is absent: ${relative(REPO_ROOT, WORKFLOW_PATH)} does not exist`,
  );
  return readFileSync(WORKFLOW_PATH, 'utf8');
}

/** Every line YAML would act on: not blank and not a `#` comment line. */
function significantLines(text: string): Line[] {
  return text
    .split('\n')
    .map((t, index) => ({ index, text: t }))
    .filter(({ text: t }) => t.trim() !== '' && !/^\s*#/.test(t));
}

function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

/**
 * The lines nested under the mapping key `key` found at exactly `indent`
 * spaces: everything after it that is indented deeper, stopping at the next
 * line at or above `indent`. `undefined` when the key is absent.
 */
function blockUnder(lines: readonly Line[], key: string, indent: number): Line[] | undefined {
  const start = lines.findIndex((l) => indentOf(l.text) === indent && l.text.trim() === `${key}:`);
  if (start === -1) return undefined;
  const block: Line[] = [];
  for (const line of lines.slice(start + 1)) {
    if (indentOf(line.text) <= indent) break;
    block.push(line);
  }
  return block;
}

/** The mapping keys at exactly `indent` spaces within `block`, in order. */
function keysAt(block: readonly Line[], indent: number): string[] {
  const keys: string[] = [];
  for (const line of block) {
    if (indentOf(line.text) !== indent) continue;
    const match = /^([A-Za-z0-9_-]+):/.exec(line.text.trim());
    if (match?.[1] !== undefined) keys.push(match[1]);
  }
  return keys;
}

function matches(line: Line, pattern: RegExp | string): boolean {
  return typeof pattern === 'string' ? line.text.includes(pattern) : pattern.test(line.text);
}

function firstMatching(block: readonly Line[], pattern: RegExp | string, what: string): Line {
  const found = block.find((l) => matches(l, pattern));
  assert.ok(found !== undefined, `expected ${what}`);
  return found;
}

function countMatching(block: readonly Line[], pattern: RegExp | string): number {
  return block.filter((l) => matches(l, pattern)).length;
}

/** `jobs.<name>` as a block, asserting the job exists. */
function job(lines: readonly Line[], name: string): Line[] {
  const jobs = blockUnder(lines, 'jobs', 0);
  assert.ok(jobs !== undefined, 'expected a top-level jobs: block');
  const block = blockUnder(jobs, name, 2);
  assert.ok(block !== undefined, `expected job ${name}`);
  return block;
}

/** The lines of one step: from its `uses:`/`run:` anchor to the next `- name:`. */
function stepAfter(block: readonly Line[], anchor: Line): Line[] {
  const next = block.find((l) => l.index > anchor.index && /^\s*-\s+name:/.test(l.text));
  return block.filter((l) => l.index > anchor.index && (next === undefined || l.index < next.index));
}

/** The steps of a job: the list items under `steps:`, each with its nested lines. */
function stepsOf(block: readonly Line[]): Line[][] {
  const first = block.find((l) => /^\s*-\s/.test(l.text));
  const stepIndent = first === undefined ? -1 : indentOf(first.text);
  const out: Line[][] = [];
  for (const line of block) {
    if (/^\s*-\s/.test(line.text) && indentOf(line.text) === stepIndent) out.push([]);
    const current = out[out.length - 1];
    if (current !== undefined) current.push(line);
  }
  return out;
}

/** Every line of shell the platform would execute: `run:` block scalars and inline `run:` values. */
function runScriptLines(block: readonly Line[]): Line[] {
  const out: Line[] = [];
  let i = 0;
  while (i < block.length) {
    const line = block[i];
    i += 1;
    if (line === undefined) continue;
    const key = /^(\s*(?:-\s+)?)run:\s*(.*)$/.exec(line.text);
    if (key === null) continue;
    const keyIndent = (key[1] ?? '').length;
    const value = (key[2] ?? '').trim();
    if (/^[|>][-+]?$/.test(value)) {
      while (i < block.length) {
        const body = block[i];
        if (body === undefined || indentOf(body.text) <= keyIndent) break;
        out.push(body);
        i += 1;
      }
    } else {
      out.push(line);
    }
  }
  return out;
}

describe('db-admin-migration workflow shape (C-T1)', () => {
  it('exists at .github/workflows/db-admin-migration.yml (C-N1)', () => {
    assert.ok(existsSync(WORKFLOW_PATH), `${relative(REPO_ROOT, WORKFLOW_PATH)} does not exist`);
  });

  it('is triggered by workflow_dispatch and nothing else (plan r1 §7)', () => {
    const lines = significantLines(readWorkflow());
    const on = blockUnder(lines, 'on', 0);
    assert.ok(on !== undefined, 'expected a top-level on: block');
    assert.deepEqual(keysAt(on, 2), ['workflow_dispatch']);
    assert.equal(countMatching(lines, /^on:/), 1, 'exactly one on: key');
    for (const trigger of [
      'push', 'pull_request', 'pull_request_target', 'schedule',
      'workflow_call', 'workflow_run', 'repository_dispatch', 'release',
    ]) {
      assert.equal(countMatching(lines, new RegExp(`^\\s*${trigger}:`)), 0, `no ${trigger}: anywhere`);
    }
  });

  it('declares founder_authorized_sha and tranche_id, both required, and no other input (plan r1 §7)', () => {
    const lines = significantLines(readWorkflow());
    const on = blockUnder(lines, 'on', 0);
    assert.ok(on !== undefined, 'expected a top-level on: block');
    const dispatch = blockUnder(on, 'workflow_dispatch', 2);
    assert.ok(dispatch !== undefined, 'expected workflow_dispatch: as a block carrying inputs');
    const inputs = blockUnder(dispatch, 'inputs', 4);
    assert.ok(inputs !== undefined, 'expected workflow_dispatch.inputs');
    assert.deepEqual(keysAt(inputs, 6), REQUIRED_INPUTS);
    for (const name of REQUIRED_INPUTS) {
      const input = blockUnder(inputs, name, 6);
      assert.ok(input !== undefined, `expected input ${name}`);
      assert.ok(input.some((l) => l.text.trim() === 'required: true'), `${name} must be required: true`);
    }
  });

  it('serialises administrative migrations: constant group, never cancelled, queued (r6 §9.1, C-R4)', () => {
    const lines = significantLines(readWorkflow());
    const concurrency = blockUnder(lines, 'concurrency', 0);
    assert.ok(concurrency !== undefined, 'expected a workflow-level concurrency: block');
    assert.equal(countMatching(lines, /^\s*concurrency:\s*$/), 1, 'exactly one concurrency: key, at workflow level');
    const entries = concurrency.map((l) => l.text.trim());
    assert.ok(entries.includes(`group: ${CONCURRENCY_GROUP}`), `group is the constant ${CONCURRENCY_GROUP}`);
    assert.ok(entries.includes('cancel-in-progress: false'), 'cancel-in-progress: false, explicit');
    assert.ok(entries.includes('queue: max'), 'queue: max');
    assert.equal(countMatching(concurrency, '${{'), 0, 'the group is never interpolated');
    assert.equal(countMatching(lines, /cancel-in-progress:\s*true/), 0, 'cancel-in-progress is never true');
  });

  it('holds least privilege: permissions are contents: read and nothing wider (plan r1 §7)', () => {
    const lines = significantLines(readWorkflow());
    const permissions = blockUnder(lines, 'permissions', 0);
    assert.ok(permissions !== undefined, 'expected a workflow-level permissions: block');
    assert.deepEqual(permissions.map((l) => l.text.trim()), ['contents: read']);
    assert.equal(countMatching(lines, /^\s*permissions:/), 1, 'no job-level permissions: that could widen the grant');
  });

  it('has exactly two jobs, preflight then migrate (plan r1 §7.1)', () => {
    const lines = significantLines(readWorkflow());
    const jobs = blockUnder(lines, 'jobs', 0);
    assert.ok(jobs !== undefined, 'expected a top-level jobs: block');
    assert.deepEqual(keysAt(jobs, 2), ['preflight', 'migrate']);
  });

  it('preflight validates the 40-hex shape, then compares, and both precede any environment or secret (r6 §8.2; C-R1, C-R2)', () => {
    const lines = significantLines(readWorkflow());
    const preflight = job(lines, 'preflight');
    const shape = firstMatching(preflight, SHA_SHAPE, `the shape check ${SHA_SHAPE} in preflight`);
    const comparison = firstMatching(preflight, SHA_COMPARISON, 'a comparison of the authorized and observed SHAs in preflight');
    const marker = firstMatching(preflight, FAIL_CLOSED_MARKER, `the marker "${FAIL_CLOSED_MARKER}" in preflight`);
    assert.ok(shape.index < comparison.index, 'shape validation runs before the comparison');
    assert.ok(comparison.index < marker.index, 'the marker is the failing branch of the comparison');

    const environment = firstMatching(lines, ENVIRONMENT_KEY, 'an environment: key somewhere in the file');
    const secret = firstMatching(lines, SECRET_CONTEXT, 'a secrets. reference somewhere in the file');
    assert.ok(comparison.index < environment.index, 'the comparison precedes the first environment: key');
    assert.ok(comparison.index < secret.index, 'the comparison precedes the first secrets. reference');

    assert.ok(countMatching(preflight, 'GITHUB_STEP_SUMMARY') > 0, 'preflight writes to the run summary');
    assert.ok(countMatching(preflight, 'OBSERVED_SHA') > 0, 'the observed SHA is printed');
    assert.ok(countMatching(preflight, 'FOUNDER_AUTHORIZED_SHA') > 0, 'the expected SHA is printed');
  });

  it('preflight is ungated: no environment: key and no secret access (r6 §10 stage 1)', () => {
    const lines = significantLines(readWorkflow());
    const preflight = job(lines, 'preflight');
    assert.equal(countMatching(preflight, ENVIRONMENT_KEY), 0, 'preflight declares no environment');
    assert.equal(countMatching(preflight, SECRET_CONTEXT), 0, 'preflight touches no secret');
  });

  it('migrate needs preflight and runs in environment db-admin-migration (r6 §10 stage 2)', () => {
    const lines = significantLines(readWorkflow());
    const migrate = job(lines, 'migrate');
    assert.ok(migrate.some((l) => l.text.trim() === 'needs: preflight'), 'needs: preflight');
    assert.ok(migrate.some((l) => l.text.trim() === `environment: ${ENVIRONMENT_NAME}`), `environment: ${ENVIRONMENT_NAME}`);
    assert.equal(countMatching(lines, ENVIRONMENT_KEY), 1, 'the environment is declared exactly once, on migrate');
  });

  it('migrate re-asserts the SHA before checkout and before the secret (r6 §8.2 step 3; §10 stage 3)', () => {
    const lines = significantLines(readWorkflow());
    const migrate = job(lines, 'migrate');
    const comparison = firstMatching(migrate, SHA_COMPARISON, 'a re-assertion of the SHAs in migrate');
    const marker = firstMatching(migrate, FAIL_CLOSED_MARKER, 'the fail-closed marker in migrate');
    const checkout = firstMatching(migrate, /uses:\s*actions\/checkout@/, 'a checkout in migrate');
    const secret = firstMatching(migrate, SECRET_CONTEXT, 'the secret reference in migrate');
    assert.ok(comparison.index < marker.index, 'the marker is the failing branch of the re-assertion');
    assert.ok(comparison.index < checkout.index, 're-assertion precedes checkout');
    assert.ok(checkout.index < secret.index, 'checkout precedes the secret');
  });

  it('checks out the asserted SHA, not a ref, with the pins ci.yml uses (r6 §8.2 step 6)', () => {
    const lines = significantLines(readWorkflow());
    const migrate = job(lines, 'migrate');
    const ci = significantLines(readFileSync(CI_PATH, 'utf8'));
    for (const action of ['actions/checkout', 'actions/setup-node']) {
      const pin = firstMatching(ci, new RegExp(`uses:\\s*${action}@[0-9a-f]{40}`), `${action} pinned by SHA in ci.yml`).text.trim();
      assert.ok(migrate.some((l) => l.text.trim() === pin), `migrate uses the same pin as ci.yml: ${pin}`);
    }
    const checkout = firstMatching(migrate, /uses:\s*actions\/checkout@/, 'a checkout in migrate');
    const step = stepAfter(migrate, checkout).map((l) => l.text.trim());
    assert.ok(step.includes('ref: ${{ inputs.founder_authorized_sha }}'), 'checkout ref is the asserted SHA input');
    assert.ok(step.includes('persist-credentials: false'), 'checkout does not persist credentials');
  });

  it('runs the bounded runner for the one id; the secret reaches only that step, as its documented env var (r6 §10 stages 4 and 5)', () => {
    const lines = significantLines(readWorkflow());
    const migrate = job(lines, 'migrate');
    firstMatching(migrate, /npm run\b.*\bmigrate:admin\b/, 'an npm run migrate:admin invocation');
    assert.equal(countMatching(lines, SECRET_CONTEXT), 1, 'the secret is referenced exactly once in the file');
    firstMatching(migrate, /^\s+MIGRATE_ADMIN_DATABASE_URL:\s*\$\{\{\s*secrets\./, 'the secret bound to MIGRATE_ADMIN_DATABASE_URL');
    firstMatching(migrate, /^\s+FOUNDER_AUTHORIZED_SHA:\s*\$\{\{\s*inputs\.founder_authorized_sha\s*\}\}/, 'FOUNDER_AUTHORIZED_SHA set from the input');
    assert.ok(countMatching(migrate, 'GITHUB_STEP_SUMMARY') > 0, 'stage-5 evidence goes to the run summary');
    assert.equal(countMatching(lines, /postgres(ql)?:\/\//), 0, 'no literal connection string anywhere');
  });

  it('C-R8: no other workflow references db-admin-migration (PC-30)', () => {
    const files = readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f)).sort();
    assert.ok(files.includes(WORKFLOW_FILE), `${WORKFLOW_FILE} is present among: ${files.join(', ')}`);
    const others = files.filter((f) => f !== WORKFLOW_FILE);
    assert.ok(others.length > 0, 'the directory holds sibling workflows to check');
    for (const file of others) {
      const text = readFileSync(join(WORKFLOWS_DIR, file), 'utf8');
      assert.ok(!text.includes(ENVIRONMENT_NAME), `${file} must not reference ${ENVIRONMENT_NAME}`);
    }
  });
  // PR #76 review finding 5: five mutants the first thirteen cases let through.

  it('run: scripts never interpolate ${{ }} expressions; inputs and context reach the shell through env only', () => {
    const lines = significantLines(readWorkflow());
    const scripts = runScriptLines(lines);
    assert.ok(scripts.length > 0, 'expected run: scripts to inspect');
    for (const l of scripts) {
      assert.ok(!l.text.includes('${{'), `expression inside a run: script at line ${l.index + 1}: ${l.text.trim()}`);
    }
  });

  it('no run: script names the administrative URL variable, and no shell tracing is enabled anywhere', () => {
    const lines = significantLines(readWorkflow());
    for (const l of runScriptLines(lines)) {
      assert.ok(!l.text.includes('MIGRATE_ADMIN_DATABASE_URL'), `run: script references the secret variable at line ${l.index + 1}`);
    }
    assert.equal(countMatching(lines, /\bset\s+-[a-zA-Z]*x|\bxtrace\b|\bbash\s+-x\b/), 0, 'no set -x, set -o xtrace, or bash -x');
  });

  it('the secret is bound from secrets.MIGRATE_ADMIN_DATABASE_URL only, on the migrate:admin step only', () => {
    const lines = significantLines(readWorkflow());
    const binding = 'MIGRATE_ADMIN_DATABASE_URL: ${{ secrets.MIGRATE_ADMIN_DATABASE_URL }}';
    const named = lines.filter((l) => l.text.includes('MIGRATE_ADMIN_DATABASE_URL'));
    assert.equal(named.length, 1, 'the variable name appears exactly once outside comments');
    assert.equal(named[0]?.text.trim(), binding, 'and that once is the exact env binding from the environment secret');
    const apply = stepsOf(job(lines, 'migrate')).find((step) => step.some((l) => /\bmigrate:admin\b/.test(l.text)));
    assert.ok(apply !== undefined, 'expected the migrate:admin step');
    assert.ok(apply.some((l) => l.text.trim() === binding), 'the binding sits on the migrate:admin step');
  });

  it('every fail-closed marker is followed by exit 1 on the next line', () => {
    const lines = significantLines(readWorkflow());
    const markers = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.text.includes('::error::FAIL CLOSED'));
    assert.ok(markers.length >= 2, 'expected fail-closed markers in both jobs');
    for (const { l, i } of markers) {
      assert.equal(lines[i + 1]?.text.trim(), 'exit 1', `marker at line ${l.index + 1} must be followed by exit 1`);
    }
    for (const name of ['preflight', 'migrate']) {
      assert.ok(job(lines, name).some((l) => l.text.includes(FAIL_CLOSED_MARKER)), `${name} carries the UNAUTHORIZED SHA marker`);
    }
  });

  it('preflight executes nothing before the input-shape validation', () => {
    const lines = significantLines(readWorkflow());
    const preflight = job(lines, 'preflight');
    const shape = firstMatching(preflight, SHA_SHAPE, 'the shape check in preflight');
    const executables = preflight.filter((l) => l.index < shape.index && /^\s*(-\s+)?(run|uses):/.test(l.text));
    assert.equal(executables.length, 1, 'exactly one run:/uses: precedes the shape check');
    assert.match(executables[0]?.text ?? '', /\brun:/, 'and it is the run: that contains the check, not a uses:');
    assert.equal(stepsOf(preflight).findIndex((step) => step.some((l) => l.text.includes(SHA_SHAPE))), 0, 'the shape check is in the first step');
  });
});
