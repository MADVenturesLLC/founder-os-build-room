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
    const start = text.findIndex((l) => /^\s+run: \|$/.test(l));
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
    const start = text.findIndex((l) => /^\s+run: \|$/.test(l));
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
