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
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const JUDGE_STEP = 'Judge the current head and publish the status';

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
    ['the head followed directly by letters', [comment(19, `Authorized: merge ${REPO}#${PR} at head ${HEAD}xyz`)]],
    ['the head followed directly by an underscore', [comment(24, `Authorized: merge ${REPO}#${PR} at head ${HEAD}_x`)]],
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

  it('is triggered by pull_request_target, issue_comment and issues only', () => {
    const onIndex = lines.findIndex((l) => l === 'on:');
    assert.ok(onIndex !== -1, 'expected a top-level on: block');
    const triggers: string[] = [];
    for (const l of lines.slice(onIndex + 1)) {
      if (!/^\s/.test(l)) break;
      const m = /^ {2}([a-z_]+):/.exec(l);
      if (m?.[1] !== undefined) triggers.push(m[1]);
    }
    assert.deepEqual(triggers, ['pull_request_target', 'issue_comment', 'issues']);
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

  it('queues runs for one PR instead of cancelling one mid-evaluation', () => {
    assert.ok(lines.some((l) => l.trim() === 'cancel-in-progress: false'), 'cancel-in-progress: false');
    assert.ok(!lines.some((l) => /cancel-in-progress:\s*true/.test(l)), 'never cancel-in-progress: true');
  });

  it('publishes the founder-authorization context and names the Founder login', () => {
    assert.ok(text.includes('context: "founder-authorization"'), 'status context is founder-authorization');
    assert.ok(lines.some((l) => l.trim() === `FOUNDER_LOGINS: ${FOUNDER}`), `FOUNDER_LOGINS is ${FOUNDER}`);
    assert.ok(text.includes('bash scripts/founder-authorization-check.sh'), 'the decision is the tested script');
  });
});

/**
 * The workflow's own shell, run for real against a fake GitHub API: a `curl`
 * on PATH that serves fixture JSON by URL and records every status POST. This
 * is the only way to observe the two behaviours the run: script owns — that a
 * head shared with another open PR is refused, and that an evaluation which
 * cannot complete publishes failure instead of leaving an earlier success.
 */
describe('founder-authorization workflow script against a fake GitHub API', () => {
  const FAKE_CURL = `#!/usr/bin/env bash
url=""; post=0; data=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -X) [[ "$2" == POST ]] && post=1; shift 2 ;;
    -d) data="$2"; shift 2 ;;
    -H) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
if [[ -n "\${FAKE_FAIL:-}" && "$url" == *"$FAKE_FAIL"* ]]; then exit 22; fi
# Fails the FIRST matching call only, so the fallback post that follows a
# failed post goes through and is recorded.
if [[ -n "\${FAKE_FAIL_ONCE:-}" && "$url" == *"$FAKE_FAIL_ONCE"* && ! -e "$FAKE_FAILED" ]]; then : > "$FAKE_FAILED"; exit 22; fi
if [[ -n "\${FAKE_SLEEP_ON:-}" && "$url" == *"$FAKE_SLEEP_ON"* ]]; then : > "$FAKE_SLEEPING"; sleep 30; fi
if [[ $post -eq 1 ]]; then printf '%s\\n' "$data" >> "$FAKE_LOG"; echo '{}'; exit 0; fi
case "$url" in
  */pulls\\?state=open*) cat "$FAKE_OPEN" ;;
  */pulls/*) cat "$FAKE_PR" ;;
  */issues/*/comments*) cat "$FAKE_COMMENTS" ;;
  *) exit 22 ;;
esac
`;

  function runScript(): string {
    const text = readFileSync(WORKFLOW, 'utf8').split('\n');
    const step = text.findIndex((l) => l.trim() === `- name: ${JUDGE_STEP}`);
    const start = text.findIndex((l, i) => i > step && /^\s+run: \|$/.test(l));
    assert.ok(start !== -1, 'expected one run: block');
    const runIndent = (text[start] ?? '').length - (text[start] ?? '').trimStart().length;
    const body: string[] = [];
    for (const l of text.slice(start + 1)) {
      if (l.trim() !== '' && l.length - l.trimStart().length <= runIndent) break;
      body.push(l.slice(runIndent + 2));
    }
    return body.join('\n');
  }

  function simulate(opts: { comments: Comment[]; openPrs?: Array<{ number: number; head: { sha: string } }>; failOn?: string; failOnceOn?: string }) {
    const dir = mkdtempSync(join(tmpdir(), 'founder-auth-'));
    try {
      const bin = join(dir, 'bin');
      spawnSync('mkdir', ['-p', bin]);
      writeFileSync(join(bin, 'curl'), FAKE_CURL);
      chmodSync(join(bin, 'curl'), 0o755);
      const files = {
        FAKE_PR: join(dir, 'pr.json'),
        FAKE_OPEN: join(dir, 'open.json'),
        FAKE_COMMENTS: join(dir, 'comments.json'),
        FAKE_LOG: join(dir, 'posts.log'),
        FAKE_FAILED: join(dir, 'failed-once'),
      };
      writeFileSync(files.FAKE_PR, JSON.stringify({ number: PR, head: { sha: HEAD } }));
      writeFileSync(files.FAKE_OPEN, JSON.stringify(opts.openPrs ?? [{ number: PR, head: { sha: HEAD } }]));
      writeFileSync(files.FAKE_COMMENTS, JSON.stringify(opts.comments));
      writeFileSync(files.FAKE_LOG, '');
      const result = spawnSync('bash', ['-c', runScript()], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...files,
          ...(opts.failOn === undefined ? {} : { FAKE_FAIL: opts.failOn }),
          ...(opts.failOnceOn === undefined ? {} : { FAKE_FAIL_ONCE: opts.failOnceOn }),
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          GH_TOKEN: 'fake-token-for-tests',
          REPO,
          PR_NUMBER: String(PR),
          FOUNDER_LOGINS: FOUNDER,
        },
      });
      const posts = readFileSync(files.FAKE_LOG, 'utf8').split('\n').filter((l) => l !== '')
        .map((l) => JSON.parse(l) as { state: string; context: string; description: string });
      return { status: result.status, posts, stderr: result.stderr };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('publishes success when the current head is authorized', () => {
    const r = simulate({ comments: [comment(30, block())] });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.posts.map((p) => [p.context, p.state]), [['founder-authorization', 'success']]);
  });

  it('publishes failure when it is not, and the job fails', () => {
    const r = simulate({ comments: [comment(31, block(PR, OLDER_HEAD))] });
    assert.notEqual(r.status, 0, 'the job fails too, so its check run cannot stay green');
    assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
  });

  it('refuses a head shared with another open PR even when this PR is authorized', () => {
    const r = simulate({
      comments: [comment(32, block())],
      openPrs: [{ number: PR, head: { sha: HEAD } }, { number: 99, head: { sha: HEAD } }],
    });
    assert.notEqual(r.status, 0, 'the job fails too');
    assert.equal(r.posts.length, 1);
    assert.equal(r.posts[0]?.state, 'failure');
    assert.match(r.posts[0]?.description ?? '', /shared with open PR #99/);
  });

  it('publishes failure when the comments cannot be fetched, so no earlier success survives', () => {
    const r = simulate({ comments: [comment(33, block())], failOn: '/comments' });
    assert.notEqual(r.status, 0, 'the job itself still fails');
    assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
    assert.match(r.posts[0]?.description ?? '', /did not complete/);
  });

  it('publishes failure when the open-PR list cannot be fetched', () => {
    const r = simulate({ comments: [comment(34, block())], failOn: 'state=open' });
    assert.notEqual(r.status, 0);
    assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
  });

  // Tier-2 review of PR #84 (gemini-3.1-pro, FAIL at 100f653): a status post
  // that itself fails must not end the run with nothing posted. The failure
  // happens inside a function, where no ERR trap fires; only the EXIT trap
  // catches it. Each case fails the run's one verdict post and expects the
  // fallback failure in its place.
  it('posts failure in place of an authorized verdict whose post fails', () => {
    const r = simulate({ comments: [comment(35, block())], failOnceOn: '/statuses/' });
    assert.notEqual(r.status, 0, 'a run whose verdict never landed does not exit 0');
    assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
    assert.match(r.posts[0]?.description ?? '', /did not complete/);
  });

  it('posts failure in place of a failure verdict whose post fails, so a revocation still lands', () => {
    const r = simulate({ comments: [comment(36, block(PR, OLDER_HEAD))], failOnceOn: '/statuses/' });
    assert.notEqual(r.status, 0);
    assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
    assert.match(r.posts[0]?.description ?? '', /did not complete/);
  });

  it('posts failure when the shared-head refusal post fails', () => {
    const r = simulate({
      comments: [comment(37, block())],
      openPrs: [{ number: PR, head: { sha: HEAD } }, { number: 99, head: { sha: HEAD } }],
      failOnceOn: '/statuses/',
    });
    assert.notEqual(r.status, 0);
    assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
    assert.match(r.posts[0]?.description ?? '', /did not complete/);
  });
});

/**
 * Tier-2 review of 2026-09-27 (gemini-3.1-pro, FAIL at 60a024c): a run that
 * is interrupted rather than errored must still publish failure, and no
 * comment text may ever reach the shell. Both are driven for real here.
 */
describe('founder-authorization — interruption and hostile comment text', () => {
  const FAKE_CURL_PATH = (): string => {
    // Reuse the fake API from the block above by re-reading this file would be
    // circular; the script under test only needs the same four behaviours.
    return `#!/usr/bin/env bash
url=""; post=0; data=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -X) [[ "$2" == POST ]] && post=1; shift 2 ;;
    -d) data="$2"; shift 2 ;;
    -H) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
if [[ -n "\${FAKE_FAIL:-}" && "$url" == *"$FAKE_FAIL"* ]]; then exit 22; fi
# Sleeps on the FIRST matching call only, so a post the signal handler makes
# after the interrupted one goes straight through and is recorded.
if [[ -n "\${FAKE_SLEEP_ON:-}" && "$url" == *"$FAKE_SLEEP_ON"* && ! -e "$FAKE_SLEEPING" ]]; then : > "$FAKE_SLEEPING"; sleep "\${FAKE_SLEEP_SECS:-30}"; fi
if [[ $post -eq 1 ]]; then printf '%s\\n' "$data" >> "$FAKE_LOG"; echo '{}'; exit 0; fi
case "$url" in
  */pulls\\?state=open*) cat "$FAKE_OPEN" ;;
  */pulls/*) cat "$FAKE_PR" ;;
  */issues/*/comments*) cat "$FAKE_COMMENTS" ;;
  *) exit 22 ;;
esac
`;
  };

  function workflowRunScript(): string {
    const text = readFileSync(WORKFLOW, 'utf8').split('\n');
    const step = text.findIndex((l) => l.trim() === `- name: ${JUDGE_STEP}`);
    const start = text.findIndex((l, i) => i > step && /^\s+run: \|$/.test(l));
    const runIndent = (text[start] ?? '').length - (text[start] ?? '').trimStart().length;
    const body: string[] = [];
    for (const l of text.slice(start + 1)) {
      if (l.trim() !== '' && l.length - l.trimStart().length <= runIndent) break;
      body.push(l.slice(runIndent + 2));
    }
    return body.join('\n');
  }

  function stage(comments: Comment[], openPrs: Array<{ number: number; head: { sha: string } }> = [{ number: PR, head: { sha: HEAD } }]) {
    const dir = mkdtempSync(join(tmpdir(), 'founder-auth-sig-'));
    const bin = join(dir, 'bin');
    spawnSync('mkdir', ['-p', bin]);
    writeFileSync(join(bin, 'curl'), FAKE_CURL_PATH());
    chmodSync(join(bin, 'curl'), 0o755);
    const files = {
      FAKE_PR: join(dir, 'pr.json'),
      FAKE_OPEN: join(dir, 'open.json'),
      FAKE_COMMENTS: join(dir, 'comments.json'),
      FAKE_LOG: join(dir, 'posts.log'),
      FAKE_SLEEPING: join(dir, 'sleeping'),
    };
    writeFileSync(files.FAKE_PR, JSON.stringify({ number: PR, head: { sha: HEAD } }));
    writeFileSync(files.FAKE_OPEN, JSON.stringify(openPrs));
    writeFileSync(files.FAKE_COMMENTS, JSON.stringify(comments));
    writeFileSync(files.FAKE_LOG, '');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...files,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      GH_TOKEN: 'fake-token-for-tests',
      REPO,
      PR_NUMBER: String(PR),
      FOUNDER_LOGINS: FOUNDER,
    };
    const posts = () => readFileSync(files.FAKE_LOG, 'utf8').split('\n').filter((l) => l !== '')
      .map((l) => JSON.parse(l) as { state: string; description: string });
    return { dir, files, env, posts };
  }

  /**
   * Runs the workflow script until the fake API is sleeping on the first call
   * whose URL contains `sleepOn`, then sends SIGTERM to the whole process
   * group, as Actions does on cancel, killing that call mid-flight.
   */
  async function interruptAt(s: ReturnType<typeof stage>, sleepOn: string, extra: NodeJS.ProcessEnv = {}) {
    const child = spawn('bash', ['-c', workflowRunScript()], {
      cwd: REPO_ROOT,
      env: { ...s.env, ...extra, FAKE_SLEEP_ON: sleepOn },
      detached: true,
      stdio: 'ignore',
    });
    const deadline = Date.now() + 10_000;
    while (!existsSync(s.files.FAKE_SLEEPING)) {
      assert.ok(Date.now() < deadline, `the run never reached a call to ${sleepOn}`);
      await new Promise((r) => setTimeout(r, 25));
    }
    process.kill(-(child.pid ?? 0), 'SIGTERM');
    return new Promise<number | null>((r) => child.on('close', (c) => r(c)));
  }

  it('publishes failure when the run is interrupted with SIGTERM mid-evaluation', async () => {
    const s = stage([comment(40, block())]);
    try {
      const code = await interruptAt(s, '/comments');
      assert.notEqual(code, 0, 'an interrupted run does not exit 0');
      assert.deepEqual(s.posts().map((p) => p.state), ['failure']);
      assert.match(s.posts()[0]?.description ?? '', /interrupted/);
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  // Copilot review on PR #84 (4117742217): a signal that kills a status post
  // must not leave the run with nothing posted. Each case kills the one post
  // the run was making and expects the handler's failure to follow it.
  it('cannot be stopped by a signal during the fallback failure post', async () => {
    // The comments fetch fails, the run exits, and the EXIT trap's fallback
    // post is the one that sleeps when the signal arrives. Signals are
    // ignored for that post, so it completes: the fake sleeps briefly and
    // records it rather than being killed.
    const s = stage([comment(41, block())]);
    try {
      const code = await interruptAt(s, '/statuses/', { FAKE_FAIL: '/comments', FAKE_SLEEP_SECS: '1' });
      assert.notEqual(code, 0);
      assert.deepEqual(s.posts().map((p) => p.state), ['failure']);
      assert.match(s.posts()[0]?.description ?? '', /did not complete/);
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  it('publishes failure when the verdict post is interrupted, even for an authorized head', async () => {
    const s = stage([comment(42, block())]);
    try {
      const code = await interruptAt(s, '/statuses/');
      assert.notEqual(code, 0, 'an interrupted run does not exit 0, even when the head was authorized');
      assert.deepEqual(s.posts().map((p) => p.state), ['failure']);
      assert.match(s.posts()[0]?.description ?? '', /interrupted/);
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  it('publishes failure when the shared-head refusal post is interrupted', async () => {
    const s = stage([comment(43, block())], [{ number: PR, head: { sha: HEAD } }, { number: 99, head: { sha: HEAD } }]);
    try {
      const code = await interruptAt(s, '/statuses/');
      assert.notEqual(code, 0);
      assert.deepEqual(s.posts().map((p) => p.state), ['failure']);
      assert.match(s.posts()[0]?.description ?? '', /interrupted/);
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  it('never lets comment text reach the shell, in the script or the workflow', () => {
    const s = stage([]);
    try {
      const marker = join(s.dir, 'PWNED');
      const hostile = [
        `$(touch ${marker})`,
        `\`touch ${marker}\``,
        `"; touch ${marker}; echo "`,
        `Authorized: merge ${REPO}#${PR} at head $(touch ${marker})`,
        `Authorized: merge ${REPO}#${PR} at head ${HEAD} $(touch ${marker}) \`touch ${marker}\``,
      ].map((body, i) => comment(50 + i, body));
      writeFileSync(s.files.FAKE_COMMENTS, JSON.stringify(hostile));

      const direct = spawnSync('bash', [CHECK, REPO, String(PR), HEAD], {
        input: JSON.stringify(hostile), encoding: 'utf8', env: s.env,
      });
      assert.equal(direct.status, 0, direct.stderr);
      assert.equal((JSON.parse(direct.stdout) as Verdict).comment_id, 54, 'the one well-formed block still counts');

      const wf = spawnSync('bash', ['-c', workflowRunScript()], { cwd: REPO_ROOT, encoding: 'utf8', env: s.env });
      assert.equal(wf.status, 0, wf.stderr);
      assert.deepEqual(s.posts().map((p) => p.state), ['success']);

      assert.equal(existsSync(marker), false, 'no comment text was executed');
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });
});

/**
 * The envelope route (FOUNDER-ACT-20261031-BR-MILESTONE-AUTH-GUARD, Part B):
 * a head with no single-PR authorization also counts when its description
 * links a milestone-carrier issue holding a Founder envelope in the
 * DEC-20261027-01 Appendix B form. The script is driven with ENVELOPE_INPUT
 * in the shape the REST API returns: the PR, its file list, the carrier
 * issue, and the carrier's comments.
 */
const CARRIER = 200;
const CARRIER_URL = `https://github.com/${REPO}/issues/${CARRIER}`;
const MILESTONE = 'BR-M7';
const OTHER_HEAD = '1111111111111111111111111111111111111111';
const STAMP = '2026-10-31T21:30:00Z';

interface EnvelopeFields {
  milestone?: string;
  boundedBy?: string;
  scope?: string;
  carrier?: string;
  members?: string[];
  attestation?: boolean;
}

function memberLine(repo: string, pr: number, head: string): string {
  return `  MADVenturesLLC/${repo}#${pr}  head ${head}`;
}

const ATTESTATION = `I have reviewed each member's diff at the head named for it. Each line
is a separate authorization. A line is void the moment that pull
request's head moves, or when a later review finds an unresolved
merge-blocking issue on it; the other lines stay in force. A void line
is re-authorized only by a new comment, never by editing this one. This
authorization does not cover any pull request that DEC-20261027-01
clause 4 excludes, and does not extend to any pull request not listed
above.`;

/** DEC-20261027-01 Appendix B, completed. */
function envelopeText(f: EnvelopeFields = {}): string {
  const members = f.members ?? [
    memberLine('founder-os-build-room', PR, HEAD),
    memberLine('madventures-tui', 12, OLDER_HEAD),
  ];
  return [
    'FOUNDER MILESTONE AUTHORIZATION',
    'I, Michael Daley, Founder (MAD Ventures), authorize merge of each pull',
    'request listed below at the full 40-character head named on its line.',
    'Merge each only if its live head still matches the head named for it.',
    '',
    `  milestone: ${f.milestone ?? MILESTONE}`,
    `  bounded by: ${f.boundedBy ?? 'Build Room plan BR-P3 task list'}`,
    `  scope: ${f.scope ?? 'Phase 3 runtime slices'}`,
    `  carrier: ${f.carrier ?? CARRIER_URL}`,
    '',
    ...members,
    '',
    ...(f.attestation === false ? [] : [ATTESTATION]),
    '— Michael Daley',
  ].join('\n');
}

interface IssueComment extends Comment {
  created_at: string;
  updated_at: string;
}

function carrierComment(id: number, body: string, opts: { login?: string; edited?: boolean } = {}): IssueComment {
  return {
    id,
    html_url: `${CARRIER_URL}#issuecomment-${id}`,
    user: { login: opts.login ?? FOUNDER },
    body,
    created_at: STAMP,
    updated_at: opts.edited === true ? '2026-10-31T21:31:00Z' : STAMP,
  };
}

interface FileEntry { filename: string; status?: string; previous_filename?: string }

interface EnvelopeInput {
  pull: { number: number; head: { sha: string }; body: string | null; changed_files: number };
  files: FileEntry[];
  issue: Record<string, unknown> | null;
  comments: IssueComment[];
}

function milestoneLine(id: string = MILESTONE, url: string = CARRIER_URL): string {
  return `Milestone-Auth: ${id} ${url}`;
}

function envelopeInput(over: {
  body?: string;
  files?: FileEntry[];
  changedFiles?: number;
  issue?: Record<string, unknown> | null;
  comments?: IssueComment[];
} = {}): EnvelopeInput {
  const files = over.files ?? [{ filename: 'packages/run-harness/src/cli.ts', status: 'modified' }];
  return {
    pull: {
      number: PR,
      head: { sha: HEAD },
      body: over.body ?? `Phase 3 slice.\n\n${milestoneLine()}\n`,
      changed_files: over.changedFiles ?? files.length,
    },
    files,
    issue: over.issue === undefined
      ? { number: CARRIER, state: 'open', labels: [{ name: 'milestone-carrier' }], html_url: CARRIER_URL }
      : over.issue,
    comments: over.comments ?? [carrierComment(900, envelopeText())],
  };
}

function judgeEnvelope(input: EnvelopeInput | string, prComments: Comment[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'founder-auth-env-'));
  try {
    const path = join(dir, 'envelope.json');
    writeFileSync(path, typeof input === 'string' ? input : JSON.stringify(input));
    const result = spawnSync('bash', [CHECK, REPO, String(PR), HEAD], {
      input: JSON.stringify(prComments),
      encoding: 'utf8',
      env: { ...process.env, FOUNDER_LOGINS: FOUNDER, ENVELOPE_INPUT: path },
    });
    return { status: result.status, verdict: JSON.parse(result.stdout) as Verdict, stderr: result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertRefused(r: ReturnType<typeof judgeEnvelope>, reason: RegExp): void {
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.verdict.authorized, false);
  assert.equal(r.verdict.comment_id, null);
  assert.match(r.verdict.description, reason);
}

describe('envelope route — authorized forms (B1, B2, B3)', () => {
  it('accepts a complete envelope naming this PR at its current head', () => {
    const r = judgeEnvelope(envelopeInput());
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.verdict.authorized, true);
    assert.equal(r.verdict.comment_id, 900);
    assert.equal(r.verdict.description, `Authorized at head ${HEAD.slice(0, 7)} by envelope comment 900 on carrier #${CARRIER}`);
  });

  it('names the single-PR comment, not the envelope, when the single-PR route authorizes (B3)', () => {
    const r = judgeEnvelope(envelopeInput(), [comment(7, block())]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.verdict.comment_id, 7);
    assert.equal(r.verdict.description, `Authorized at head ${HEAD.slice(0, 7)} by comment 7`);
  });

  it('ignores the envelope entirely when ENVELOPE_INPUT is not set (B5.1)', () => {
    const r = judge([]);
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.verdict.description, `No Founder authorization names head ${HEAD.slice(0, 7)} on #${PR}`);
  });

  it('accepts carriage-return line endings', () => {
    const r = judgeEnvelope(envelopeInput({ comments: [carrierComment(901, envelopeText().replace(/\n/g, '\r\n'))] }));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.verdict.comment_id, 901);
  });

  it('accepts an envelope inside one code fence', () => {
    const r = judgeEnvelope(envelopeInput({ comments: [carrierComment(902, `\`\`\`text\n${envelopeText()}\n\`\`\`\n`)] }));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.verdict.comment_id, 902);
  });

  it("accepts Appendix B's sentences wrapped across lines differently", () => {
    const rewrapped = envelopeText()
      .replace('of each pull\nrequest', 'of each\npull request')
      .replace('Each line\nis a separate', 'Each\nline is a separate')
      .replace('stay in force. A void line\nis', 'stay\nin force.\n  A void line is')
      .replace('— Michael Daley', '\n— Michael Daley');
    assert.notEqual(rewrapped, envelopeText());
    const r = judgeEnvelope(envelopeInput({ comments: [carrierComment(903, rewrapped)] }));
    assert.equal(r.status, 0, r.stderr);
  });

  it('accepts a member reference turned into a Markdown link', () => {
    const linked = `  [MADVenturesLLC/founder-os-build-room#${PR}](https://github.com/${REPO}/pull/${PR})  head ${HEAD}`;
    const r = judgeEnvelope(envelopeInput({ comments: [carrierComment(904, envelopeText({
      members: [linked, memberLine('madventures-tui', 12, OLDER_HEAD)],
    }))] }));
    assert.equal(r.status, 0, r.stderr);
  });
});

describe('envelope route — refused descriptions (B1.1)', () => {
  it('refuses a Milestone-Auth line naming another repository', () => {
    const r = judgeEnvelope(envelopeInput({
      body: milestoneLine(MILESTONE, `https://github.com/MADVenturesLLC/madventures-tui/issues/${CARRIER}`),
    }));
    assertRefused(r, /does not name an issue in/);
  });

  it('refuses two Milestone-Auth lines', () => {
    const r = judgeEnvelope(envelopeInput({ body: `${milestoneLine()}\n${milestoneLine()}\n` }));
    assertRefused(r, /2 Milestone-Auth lines/);
  });
});

describe('envelope route — refused carriers (B1.2)', () => {
  const base = { number: CARRIER, state: 'open', labels: [{ name: 'milestone-carrier' }] };
  it('refuses a carrier that is a pull request', () => {
    assertRefused(judgeEnvelope(envelopeInput({ issue: { ...base, pull_request: { url: 'x' } } })), /is a pull request/);
  });
  it('refuses a closed carrier', () => {
    assertRefused(judgeEnvelope(envelopeInput({ issue: { ...base, state: 'closed' } })), /is not open/);
  });
  it('refuses a carrier without the milestone-carrier label', () => {
    assertRefused(judgeEnvelope(envelopeInput({ issue: { ...base, labels: [{ name: 'other' }] } })), /milestone-carrier label/);
  });
  it('refuses a carrier that could not be read', () => {
    assertRefused(judgeEnvelope(envelopeInput({ issue: null })), /could not be read/);
  });
});

describe('envelope route — refused envelope comments (B1.3, B1.6, B1.7)', () => {
  it('refuses an envelope by a login not allowed', () => {
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(910, envelopeText(), { login: 'cursor[bot]' })] })),
      /no comment from an allowed login/);
  });

  it('refuses an edited envelope', () => {
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(911, envelopeText(), { edited: true })] })),
      /has been edited/);
  });

  const placeholders: Array<[string, EnvelopeFields | ((t: string) => string)]> = [
    ['<MILESTONE-ID>', (t) => t.replace(`milestone: ${MILESTONE}`, 'milestone: <MILESTONE-ID>')],
    ['<governing plan / task list / ruling>', { boundedBy: '<governing plan / task list / ruling>' }],
    ['<one line>', { scope: '<one line>' }],
    ['<full URL of this milestone issue>', (t) => t.replace(`carrier: ${CARRIER_URL}`, 'carrier: <full URL of this milestone issue>')],
    ['<repo>', (t) => t.replace('MADVenturesLLC/madventures-tui#12', 'MADVenturesLLC/<repo>#12')],
    ['<n>', (t) => t.replace('MADVenturesLLC/madventures-tui#12', 'MADVenturesLLC/madventures-tui#<n>')],
    ['<40-character SHA>', (t) => t.replace(`#12  head ${OLDER_HEAD}`, '#12  head <40-character SHA>')],
  ];
  for (const [p, edit] of placeholders) {
    it(`refuses an envelope still holding the placeholder ${p}`, () => {
      const text = typeof edit === 'function' ? edit(envelopeText()) : envelopeText(edit);
      assert.ok(text.includes(p), `fixture holds ${p}`);
      // Milestone placeholders also need the description to agree, so the
      // placeholder rule is the one that refuses.
      const body = p === '<MILESTONE-ID>' ? milestoneLine('<MILESTONE-ID>') : undefined;
      assertRefused(judgeEnvelope(envelopeInput({ ...(body === undefined ? {} : { body }), comments: [carrierComment(912, text)] })),
        /placeholder/);
    });
  }

  it('refuses an envelope without the review-attestation paragraph', () => {
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(913, envelopeText({ attestation: false }))] })),
      /is not the Appendix B text/);
  });

  it('refuses an empty bounded by field', () => {
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(914, envelopeText({ boundedBy: '' }))] })),
      /not the Appendix B text|empty field/);
  });

  it('refuses an empty scope field', () => {
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(915, envelopeText({ scope: '' }))] })),
      /not the Appendix B text|empty field/);
  });

  it("refuses a field value holding a later field's label (scope: inside bounded by)", () => {
    const text = envelopeText({ boundedBy: 'plan X scope: all of it' });
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(916, text)] })), /holding a field label/);
  });

  it("refuses a field value holding two later fields' labels", () => {
    const text = envelopeText({ boundedBy: 'plan X scope: everything carrier: anywhere' });
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(918, text)] })), /holding a field label/);
  });

  it('refuses text before or after the envelope', () => {
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(917, `Draft:\n${envelopeText()}`)] })),
      /is not the Appendix B text/);
  });
});

describe('envelope route — refused member entries and fields (B1.4, B1.5)', () => {
  it('refuses a member entry naming another head', () => {
    const text = envelopeText({ members: [memberLine('founder-os-build-room', PR, OTHER_HEAD)] });
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(920, text)] })), /names another head/);
  });

  it('refuses two member entries for this pull request', () => {
    const text = envelopeText({ members: [memberLine('founder-os-build-room', PR, HEAD), memberLine('founder-os-build-room', PR, HEAD)] });
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(921, text)] })), /2 entries for #81/);
  });

  it('refuses an envelope with no member entry for this pull request', () => {
    const text = envelopeText({ members: [memberLine('founder-os-build-room', 80, HEAD)] });
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(922, text)] })), /0 entries for #81/);
  });

  it('refuses a MILESTONE-ID mismatch', () => {
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(923, envelopeText({ milestone: 'BR-M8' }))] })),
      /names milestone BR-M8, not BR-M7/);
  });

  it('refuses a carrier URL mismatch', () => {
    const text = envelopeText({ carrier: `https://github.com/${REPO}/issues/201` });
    assertRefused(judgeEnvelope(envelopeInput({ comments: [carrierComment(924, text)] })), /names another carrier/);
  });
});

describe('envelope route — excluded paths and incomplete file lists (B1.8)', () => {
  const excluded = [
    '.github/workflows/ci.yml',
    'AGENTS.md',
    'packages/gateway-daemon/AGENTS.md',
    'CLAUDE.md',
    'docs/CLAUDE.md',
    'scripts/path-audit.sh',
    'railway.toml',
    'package.json',
    'package-lock.json',
    'packages/control-plane/src/migrations.ts',
    'packages/control-plane/src/migrate-cli.ts',
    'packages/control-plane/sql/0007_add.sql',
  ];
  for (const filename of excluded) {
    it(`refuses a pull request changing ${filename}`, () => {
      const files = [{ filename: 'packages/run-harness/src/cli.ts' }, { filename }];
      assertRefused(judgeEnvelope(envelopeInput({ files })), new RegExp(`changes ${filename.replace(/\./g, '\\.')}, which`));
    });
  }

  it('refuses a rename out of an excluded path', () => {
    const files = [{ filename: 'docs/path-audit.sh', status: 'renamed', previous_filename: 'scripts/path-audit.sh' }];
    assertRefused(judgeEnvelope(envelopeInput({ files })), /changes scripts\/path-audit\.sh, which/);
  });

  it('accepts files that only resemble excluded paths', () => {
    const files = [
      { filename: 'packages/control-plane/package.json.md' },
      { filename: 'docs/scripts/notes.md' },
      { filename: 'packages/x/src/migrations.ts' },
    ];
    const r = judgeEnvelope(envelopeInput({ files }));
    assert.equal(r.status, 0, r.stderr);
  });

  it('refuses a file list holding fewer files than the pull request reports changed', () => {
    assertRefused(judgeEnvelope(envelopeInput({ changedFiles: 2 })), /may be incomplete/);
  });

  it("refuses a file list that reaches the API's 3,000-file limit", () => {
    const files = Array.from({ length: 3000 }, (_, i) => ({ filename: `packages/x/src/f${i}.ts` }));
    assertRefused(judgeEnvelope(envelopeInput({ files })), /may be incomplete/);
  });

  it('refuses a pull request object that does not report changed_files', () => {
    const input = envelopeInput();
    const pull = { ...input.pull } as Partial<EnvelopeInput['pull']>;
    delete pull.changed_files;
    assertRefused(judgeEnvelope({ ...input, pull: pull as EnvelopeInput['pull'] }), /may be incomplete/);
  });

  it('refuses envelope input that is not a JSON object (exit 2)', () => {
    const r = judgeEnvelope('[1]');
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.verdict.description, /^refused: envelope input/);
  });
});

/**
 * The workflow's two steps run for real against a fake GitHub API that
 * serves fixture files by URL path and logs every call, so the event-driven
 * re-judging of B4 and the no-call promise of B5.2 can be observed.
 */
describe('founder-authorization workflow — envelope route and carrier re-judging', () => {
  const ROUTED_CURL = `#!/usr/bin/env bash
url=""; post=0; data=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -X) [[ "$2" == POST ]] && post=1; shift 2 ;;
    -d) data="$2"; shift 2 ;;
    -H) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
if [[ $post -eq 1 ]]; then printf '%s\\n' "$data" >> "$FAKE_DIR/posts.log"; echo '{}'; exit 0; fi
printf '%s\\n' "$url" >> "$FAKE_DIR/calls.log"
path="\${url#https://api.github.com/repos/*/*/}"
query=""; [[ "$path" == *\\?* ]] && query="\${path#*\\?}"
path="\${path%%\\?*}"
page=1; [[ "$query" =~ (^|&)page=([0-9]+) ]] && page="\${BASH_REMATCH[2]}"
name="\${path//\\//_}"
if [[ -n "\${FAKE_FAIL:-}" && "$url" == *"$FAKE_FAIL"* ]]; then exit 22; fi
if [[ "$page" -gt 1 ]]; then echo '[]'; exit 0; fi
count="$FAKE_DIR/.count-$name"; n=$(( $(cat "$count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$count"
if [[ -e "$FAKE_DIR/$name.call$n" ]]; then cat "$FAKE_DIR/$name.call$n"; exit 0; fi
[[ -e "$FAKE_DIR/$name" ]] || exit 22
cat "$FAKE_DIR/$name"
`;

  function stepRun(name: string): string {
    const text = readFileSync(WORKFLOW, 'utf8').split('\n');
    const step = text.findIndex((l) => l.trim() === `- name: ${name}`);
    assert.ok(step !== -1, `expected a step named ${name}`);
    const start = text.findIndex((l, i) => i > step && /^\s+run: \|$/.test(l));
    const runIndent = (text[start] ?? '').length - (text[start] ?? '').trimStart().length;
    const body: string[] = [];
    for (const l of text.slice(start + 1)) {
      if (l.trim() !== '' && l.length - l.trimStart().length <= runIndent) break;
      body.push(l.slice(runIndent + 2));
    }
    return body.join('\n');
  }

  interface World {
    pull?: Record<string, unknown>;
    files?: FileEntry[];
    prComments?: Comment[];
    open?: Array<Record<string, unknown>>;
    issue?: Record<string, unknown> | null;
    carrierComments?: IssueComment[];
    pullSecondRead?: Record<string, unknown>;
  }

  function stageWorld(w: World) {
    const dir = mkdtempSync(join(tmpdir(), 'founder-auth-wf-'));
    const bin = join(dir, 'bin');
    spawnSync('mkdir', ['-p', bin]);
    writeFileSync(join(bin, 'curl'), ROUTED_CURL);
    chmodSync(join(bin, 'curl'), 0o755);
    const input = envelopeInput();
    const pull = w.pull ?? input.pull;
    const files = w.files ?? input.files;
    const put = (name: string, v: unknown) => writeFileSync(join(dir, name), JSON.stringify(v));
    put(`pulls_${PR}`, pull);
    if (w.pullSecondRead !== undefined) put(`pulls_${PR}.call2`, w.pullSecondRead);
    put(`pulls_${PR}_files`, files);
    put(`issues_${PR}_comments`, w.prComments ?? []);
    put('pulls', w.open ?? [{ number: PR, head: { sha: HEAD }, body: pull.body }]);
    if (w.issue !== null) put(`issues_${CARRIER}`, w.issue ?? input.issue);
    put(`issues_${CARRIER}_comments`, w.carrierComments ?? input.comments);
    writeFileSync(join(dir, 'posts.log'), '');
    writeFileSync(join(dir, 'calls.log'), '');
    writeFileSync(join(dir, 'output'), '');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      FAKE_DIR: dir,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      GH_TOKEN: 'fake-token-for-tests',
      REPO,
      FOUNDER_LOGINS: FOUNDER,
      GITHUB_OUTPUT: join(dir, 'output'),
    };
    const read = (f: string) => readFileSync(join(dir, f), 'utf8').split('\n').filter((l) => l !== '');
    return {
      dir,
      env,
      put,
      remove: (name: string) => rmSync(join(dir, name), { force: true }),
      judge: (extra: NodeJS.ProcessEnv = {}) => {
        writeFileSync(join(dir, 'posts.log'), '');
        writeFileSync(join(dir, 'calls.log'), '');
        for (const f of ['pulls', `pulls_${PR}`]) rmSync(join(dir, `.count-${f}`), { force: true });
        const r = spawnSync('bash', ['-c', stepRun(JUDGE_STEP)], {
          cwd: REPO_ROOT, encoding: 'utf8', env: { ...env, PR_NUMBER: String(PR), ...extra },
        });
        return {
          status: r.status,
          stderr: r.stderr,
          posts: read('posts.log').map((l) => JSON.parse(l) as { state: string; description: string }),
          calls: read('calls.log'),
        };
      },
      targets: (event: { EVENT_PR?: string; CARRIER?: string }) => {
        writeFileSync(join(dir, 'output'), '');
        const r = spawnSync('bash', ['-c', stepRun('Find the pull requests to judge')], {
          cwd: REPO_ROOT, encoding: 'utf8', env: { ...env, EVENT_PR: event.EVENT_PR ?? '', CARRIER: event.CARRIER ?? '' },
        });
        const line = read('output').find((l) => l.startsWith('prs='));
        return { status: r.status, stderr: r.stderr, prs: line === undefined ? null : JSON.parse(line.slice(4)) as number[] };
      },
    };
  }

  it('publishes success for a member authorized by an envelope, naming the envelope and carrier', () => {
    const w = stageWorld({});
    try {
      const r = w.judge();
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(r.posts.map((p) => p.state), ['success']);
      assert.match(r.posts[0]?.description ?? '', /envelope comment 900 on carrier #200/);
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  });

  it('makes no envelope API call when the description has no Milestone-Auth line (B5.2)', () => {
    const input = envelopeInput();
    const w = stageWorld({ pull: { ...input.pull, body: 'No milestone here.' } });
    try {
      const r = w.judge();
      assert.notEqual(r.status, 0);
      assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
      assert.equal(r.posts[0]?.description, `No Founder authorization names head ${HEAD.slice(0, 7)} on #${PR}`);
      assert.ok(!r.calls.some((u) => /\/files|\/issues\/200/.test(u)), `unexpected calls: ${r.calls.join(' ')}`);
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  });

  it('makes no envelope API call when the single-PR route already authorizes the head', () => {
    const w = stageWorld({ prComments: [comment(60, block())] });
    try {
      const r = w.judge();
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.posts[0]?.description ?? '', /by comment 60$/);
      assert.ok(!r.calls.some((u) => /\/files|\/issues\/200/.test(u)), `unexpected calls: ${r.calls.join(' ')}`);
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  });

  it('refuses when the head moves while the envelope inputs are read', () => {
    const input = envelopeInput();
    const w = stageWorld({ pullSecondRead: { ...input.pull, head: { sha: OTHER_HEAD } } });
    try {
      const r = w.judge();
      assert.notEqual(r.status, 0);
      assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
      assert.match(r.posts[0]?.description ?? '', /moved during evaluation/);
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  });

  it('publishes failure when the file list cannot be fetched', () => {
    const w = stageWorld({});
    try {
      const r = w.judge({ FAKE_FAIL: '/files' });
      assert.notEqual(r.status, 0);
      assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
      assert.match(r.posts[0]?.description ?? '', /did not complete/);
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  });

  it('refuses a carrier that cannot be read (deleted or transferred)', () => {
    const w = stageWorld({ issue: null });
    try {
      const r = w.judge();
      assert.notEqual(r.status, 0);
      assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
      assert.match(r.posts[0]?.description ?? '', /could not be read/);
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  });

  it('a PR event judges exactly that PR, with no API call', () => {
    const w = stageWorld({});
    try {
      const t = w.targets({ EVENT_PR: String(PR), CARRIER: String(PR) });
      assert.equal(t.status, 0, t.stderr);
      assert.deepEqual(t.prs, [PR]);
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  });

  it('a carrier event re-judges every open PR whose description links the carrier, and no other', () => {
    const w = stageWorld({
      open: [
        { number: PR, body: `x\n${milestoneLine()}` },
        { number: 82, body: `see ${CARRIER_URL.toUpperCase()}` },
        { number: 83, body: `${CARRIER_URL}1 is another issue` },
        { number: 84, body: null },
      ],
    });
    try {
      const t = w.targets({ CARRIER: String(CARRIER) });
      assert.equal(t.status, 0, t.stderr);
      assert.deepEqual(t.prs, [PR, 82]);
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  });

  it('a carrier event with no linking PR yields an empty list, which the judging job skips', () => {
    const w = stageWorld({ open: [{ number: 85, body: 'nothing' }] });
    try {
      assert.deepEqual(w.targets({ CARRIER: String(CARRIER) }).prs, []);
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  });

  it('removing the milestone-carrier label turns a member success into failure (B6.2)', () => {
    const w = stageWorld({});
    try {
      assert.deepEqual(w.judge().posts.map((p) => p.state), ['success']);
      // The unlabeled event names the member; its re-judgment fails.
      assert.deepEqual(w.targets({ CARRIER: String(CARRIER) }).prs, [PR]);
      w.put(`issues_${CARRIER}`, { number: CARRIER, state: 'open', labels: [] });
      const r = w.judge();
      assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
      assert.match(r.posts[0]?.description ?? '', /milestone-carrier label/);
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  });

  it('deleting the envelope comment turns a member success into failure (B6.2)', () => {
    const w = stageWorld({});
    try {
      assert.deepEqual(w.judge().posts.map((p) => p.state), ['success']);
      assert.deepEqual(w.targets({ CARRIER: String(CARRIER) }).prs, [PR]);
      w.put(`issues_${CARRIER}_comments`, []);
      const r = w.judge();
      assert.deepEqual(r.posts.map((p) => p.state), ['failure']);
      assert.match(r.posts[0]?.description ?? '', /no comment from an allowed login/);
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
    }
  });

  it('never lets envelope or description text reach the shell', () => {
    const marker = join(tmpdir(), `founder-auth-pwned-${process.pid}`);
    const hostile = `$(touch ${marker}) \`touch ${marker}\``;
    const input = envelopeInput();
    const w = stageWorld({
      pull: { ...input.pull, body: `${hostile}\n${milestoneLine()}\n` },
      carrierComments: [carrierComment(930, `${hostile}\n${envelopeText()}`), carrierComment(931, envelopeText())],
      open: [{ number: PR, body: `${hostile} ${CARRIER_URL}` }],
    });
    try {
      const r = w.judge();
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.posts[0]?.description ?? '', /envelope comment 931/);
      assert.deepEqual(w.targets({ CARRIER: String(CARRIER) }).prs, [PR]);
      assert.equal(existsSync(marker), false, 'no text was executed');
    } finally {
      rmSync(w.dir, { recursive: true, force: true });
      rmSync(marker, { force: true });
    }
  });
});

describe('founder-authorization workflow shape — per-PR concurrency and carrier triggers (B4)', () => {
  const text = readFileSync(WORKFLOW, 'utf8');
  const lines = text.split('\n').filter((l) => l.trim() !== '' && !/^\s*#/.test(l));

  function block(start: number): string[] {
    const indent = (lines[start] ?? '').length - (lines[start] ?? '').trimStart().length;
    const out: string[] = [];
    for (const l of lines.slice(start + 1)) {
      if (l.length - l.trimStart().length <= indent) break;
      out.push(l);
    }
    return out;
  }

  it('sets concurrency per job, never at workflow level, keyed by the judged PR', () => {
    assert.ok(!lines.some((l) => l === 'concurrency:'), 'no workflow-level concurrency');
    const conc = lines.flatMap((l, i) => (/^\s+concurrency:$/.test(l) ? [i] : []));
    assert.equal(conc.length, 1, 'exactly one job-level concurrency block');
    assert.deepEqual(block(conc[0] ?? -1).map((l) => l.trim()), [
      'group: founder-authorization-${{ matrix.pr }}',
      'cancel-in-progress: false',
    ]);
    assert.ok(!/github\.event\.(issue|pull_request)\.number[^\n]*\n?[^\n]*group:/.test(text));
  });

  it('judges each PR in its own matrix job, and only the judging job carries the key', () => {
    const jobs = lines.findIndex((l) => l === 'jobs:');
    const evaluate = lines.findIndex((l, i) => i > jobs && l === '  evaluate:');
    const job = block(evaluate).map((l) => l.trim());
    assert.ok(job.includes('needs: targets'));
    assert.ok(job.includes("if: needs.targets.outputs.prs != '' && needs.targets.outputs.prs != '[]'"), 'skipped by a condition on an empty list');
    assert.ok(job.includes('pr: ${{ fromJSON(needs.targets.outputs.prs) }}'));
    assert.ok(job.includes('concurrency:'), 'the judging job holds the concurrency key');
    assert.ok(job.includes('PR_NUMBER: ${{ matrix.pr }}'), 'judges the matrix PR');
    assert.ok(job.includes(`- name: ${JUDGE_STEP}`));
  });

  it('re-judges on carrier comments and the six carrier issue events', () => {
    const on = lines.findIndex((l) => l === 'on:');
    const triggers = block(on).map((l) => l.trim());
    assert.deepEqual(triggers, [
      'pull_request_target:',
      'types: [opened, synchronize, reopened, edited, ready_for_review]',
      'issue_comment:',
      'types: [created, edited, deleted]',
      'issues:',
      'types: [labeled, unlabeled, closed, reopened, deleted, transferred]',
    ]);
  });

  it('starts judging only for PR events and milestone-carrier issues', () => {
    const targets = lines.findIndex((l) => l === '  targets:');
    const cond = block(targets).map((l) => l.trim());
    for (const want of [
      "github.event_name == 'pull_request_target'",
      '|| github.event.issue.pull_request',
      "|| contains(github.event.issue.labels.*.name, 'milestone-carrier')",
      "|| (github.event.action == 'unlabeled' && github.event.label.name == 'milestone-carrier')",
    ]) {
      assert.ok(cond.includes(want), `targets condition holds: ${want}`);
    }
  });

  it('keeps ${{ }} out of every run: script', () => {
    const runs = lines.flatMap((l, i) => (/^\s+run: \|$/.test(l) ? [i] : []));
    assert.equal(runs.length, 2, 'two run: blocks');
    for (const r of runs) {
      for (const l of block(r)) assert.ok(!l.includes('${{'), `expression inside a run: script: ${l.trim()}`);
    }
  });

  it('checks out only the default branch, once', () => {
    assert.equal(lines.filter((l) => /uses:\s*actions\/checkout@/.test(l)).length, 1);
  });
});
