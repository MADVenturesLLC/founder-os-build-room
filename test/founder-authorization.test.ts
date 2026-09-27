/**
 * The merge guard's one decision, and the workflow that publishes it.
 *
 * `scripts/founder-authorization-check.sh` decides whether a pull request's
 * current head carries the SHA-named Founder authorization DEC-20260718-04
 * requires; `.github/workflows/founder-authorization.yml` publishes that
 * decision as the `founder-authorization` commit status. Nothing in this
 * repository can run the workflow, so the script is driven here with comment
 * payloads in the shape the REST API returns, including the exact forms seen
 * on real PRs on 2026-09-27: a single-line block (PR #79), a block whose
 * repository reference GitHub's editor turned into a markdown link (PR #77),
 * a block whose SHA wraps onto the next line, and a builder prompt pasted
 * where the authorization was meant to go (PR #81).
 *
 * The workflow half is text assertions only, in the manner of
 * test/admin-workflow-shape.test.ts: the repository carries no YAML parser.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = join(REPO_ROOT, 'scripts', 'founder-authorization-check.sh');
const WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'founder-authorization.yml');
const CI = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');

const REPO = 'MADVenturesLLC/founder-os-build-room';
const PR = 81;
const HEAD = 'cac52010ca49ec2ecb15837d4e47c2cbb2673924';
const OLDER_HEAD = '9ead1233ee6f0f6ffbc53b740c95e9d290eae91e';
const FOUNDER = 'decivantiq';

interface Comment {
  id: number;
  html_url?: string;
  user: { login: string };
  body: string;
}

interface Verdict {
  authorized: boolean;
  description: string;
  comment_id: number | null;
  html_url: string | null;
}

function comment(id: number, body: string, login: string = FOUNDER): Comment {
  return { id, html_url: `https://github.com/${REPO}/pull/${PR}#issuecomment-${id}`, user: { login }, body };
}

function judge(
  comments: unknown,
  opts: { pr?: number | string; head?: string; logins?: string; repo?: string } = {},
) {
  const input = typeof comments === 'string' ? comments : JSON.stringify(comments);
  const env: NodeJS.ProcessEnv = { ...process.env, FOUNDER_LOGINS: opts.logins ?? FOUNDER };
  const result = spawnSync('bash', [CHECK, opts.repo ?? REPO, String(opts.pr ?? PR), opts.head ?? HEAD], {
    input,
    encoding: 'utf8',
    env,
  });
  const verdict = JSON.parse(result.stdout) as Verdict;
  return { status: result.status, verdict, stderr: result.stderr };
}

function block(pr: number | string = PR, head: string = HEAD, repo: string = REPO): string {
  return `Authorized: merge ${repo}#${pr} at head ${head}. Custody landing; all checks green.\n— Michael Daley, Founder`;
}

describe('founder authorization check — authorized forms', () => {
  it('accepts a single-line block naming this PR and its current head (the PR #79 form)', () => {
    const r = judge([comment(1, block())]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.verdict.authorized, true);
    assert.equal(r.verdict.comment_id, 1);
  });

  it('accepts a block whose SHA wraps onto the next line', () => {
    const r = judge([comment(2, `Authorized: merge ${REPO}#${PR} at head\r\n${HEAD}, onto main at x.`)]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.verdict.comment_id, 2);
  });

  it('accepts a repository reference turned into a markdown link (the PR #77 form)', () => {
    const body = `Authorized: merge [${REPO}#${PR}](https://github.com/${REPO}/issues/${PR}) at head ${HEAD}. Docs-only.`;
    const r = judge([comment(3, body)]);
    assert.equal(r.status, 0, r.stderr);
  });

  it('accepts the SHA in backticks and leading whitespace before the block', () => {
    const r = judge([comment(4, `  \nAuthorized: merge ${REPO}#${PR} at head \`${HEAD}\`.`)]);
    assert.equal(r.status, 0, r.stderr);
  });

  it('picks the comment that names the current head when older authorizations exist', () => {
    const r = judge([comment(5, block(PR, OLDER_HEAD)), comment(6, block())]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.verdict.comment_id, 6);
  });
});

describe('founder authorization check — refused forms', () => {
  const refused: Array<[string, unknown, Parameters<typeof judge>[1]?]> = [
    ['no comments at all', []],
    ['an authorization naming an older head (any push voids it)', [comment(10, block(PR, OLDER_HEAD))]],
    ['an authorization for a different PR', [comment(11, block(80))]],
    ['an authorization for a different repository', [comment(12, block(PR, HEAD, 'MADVenturesLLC/FounderOS'))]],
    ['an authorization from a login not on the list', [comment(13, block(), 'cursor[bot]')]],
    ['the phrase anywhere but the opening words', [comment(14, `Draft for the Founder: ${block()}`)]],
    ['a builder prompt pasted where the authorization was meant (the PR #81 form)', [
      comment(15, 'PR #82, head 22cfe5ea8affb980b5d8a39ea7767993ce963c62. Founder-authorized\r\nfix commit for two findings, test file only.'),
    ]],
    ['a short SHA', [comment(16, `Authorized: merge ${REPO}#${PR} at head ${HEAD.slice(0, 7)}`)]],
    ['a longer hex run that only starts with the head', [comment(17, `Authorized: merge ${REPO}#${PR} at head ${HEAD}ab`)]],
    ['a linked reference to a different PR', [
      comment(18, `Authorized: merge [${REPO}#80](https://example.invalid/80) at head ${HEAD}`),
    ]],
  ];

  for (const [label, comments] of refused) {
    it(`refuses ${label}`, () => {
      const r = judge(comments);
      assert.equal(r.status, 1, r.stderr);
      assert.equal(r.verdict.authorized, false);
      assert.equal(r.verdict.comment_id, null);
    });
  }
});

describe('founder authorization check — input it refuses to judge (fail closed, exit 2)', () => {
  const cases: Array<[string, unknown, Parameters<typeof judge>[1]]> = [
    ['comments that are not JSON', 'not json', {}],
    ['comments that are not an array', { id: 1 }, {}],
    ['an empty login list', [comment(20, block())], { logins: '' }],
    ['a head that is not 40 lowercase hex', [comment(21, block())], { head: HEAD.toUpperCase() }],
    ['a PR number that is not a positive integer', [comment(22, block())], { pr: '81; true' }],
    ['a malformed repository name', [comment(23, block())], { repo: 'no-slash' }],
  ];

  for (const [label, comments, opts] of cases) {
    it(`refuses ${label}`, () => {
      const r = judge(comments, opts);
      assert.equal(r.status, 2, r.stderr);
      assert.equal(r.verdict.authorized, false);
      assert.match(r.verdict.description, /^refused: /);
    });
  }
});

describe('founder-authorization workflow shape', () => {
  const text = readFileSync(WORKFLOW, 'utf8');
  const lines = text.split('\n').filter((l) => l.trim() !== '' && !/^\s*#/.test(l));

  it('is triggered by pull_request_target and issue_comment only', () => {
    const onIndex = lines.findIndex((l) => l === 'on:');
    assert.ok(onIndex !== -1, 'expected a top-level on: block');
    const triggers: string[] = [];
    for (const l of lines.slice(onIndex + 1)) {
      if (!/^\s/.test(l)) break;
      const m = /^ {2}([a-z_]+):/.exec(l);
      if (m?.[1] !== undefined) triggers.push(m[1]);
    }
    assert.deepEqual(triggers, ['pull_request_target', 'issue_comment']);
  });

  it('never checks out or references the PR head', () => {
    assert.ok(!/github\.event\.pull_request\.head/.test(text), 'no reference to the PR head');
    assert.ok(!/github\.head_ref/.test(text), 'no reference to github.head_ref');
    assert.ok(lines.some((l) => l.trim() === 'ref: ${{ github.event.repository.default_branch }}'), 'checkout pins the default branch');
    assert.ok(lines.some((l) => l.trim() === 'persist-credentials: false'), 'checkout does not persist credentials');
  });

  it('checks out with the same action pin ci.yml uses', () => {
    const pin = readFileSync(CI, 'utf8').split('\n').find((l) => /uses:\s*actions\/checkout@[0-9a-f]{40}/.test(l));
    assert.ok(pin !== undefined, 'ci.yml pins actions/checkout by SHA');
    assert.ok(lines.some((l) => l.trim() === pin.trim()), `same pin as ci.yml: ${pin.trim()}`);
  });

  it('holds exactly the permissions it needs, at workflow level only', () => {
    const start = lines.findIndex((l) => l === 'permissions:');
    assert.ok(start !== -1, 'expected a workflow-level permissions: block');
    const grants: string[] = [];
    for (const l of lines.slice(start + 1)) {
      if (!/^\s/.test(l)) break;
      grants.push(l.trim());
    }
    assert.deepEqual(grants.sort(), ['contents: read', 'issues: read', 'pull-requests: read', 'statuses: write']);
    assert.equal(lines.filter((l) => /^\s*permissions:/.test(l)).length, 1, 'no job-level permissions');
  });

  it('keeps ${{ }} out of run: scripts; event values reach the shell through env only', () => {
    const runStart = lines.findIndex((l) => /^\s+run: \|$/.test(l));
    assert.ok(runStart !== -1, 'expected one run: block');
    const indent = (lines[runStart] ?? '').length - (lines[runStart] ?? '').trimStart().length;
    for (const l of lines.slice(runStart + 1)) {
      if (l.length - l.trimStart().length <= indent) break;
      assert.ok(!l.includes('${{'), `expression inside the run: script: ${l.trim()}`);
    }
  });

  it('publishes the founder-authorization context and names the Founder login', () => {
    assert.ok(text.includes('context: "founder-authorization"'), 'status context is founder-authorization');
    assert.ok(lines.some((l) => l.trim() === `FOUNDER_LOGINS: ${FOUNDER}`), `FOUNDER_LOGINS is ${FOUNDER}`);
    assert.ok(text.includes('bash scripts/founder-authorization-check.sh'), 'the decision is the tested script');
  });
});
