/**
 * The served-model check, its data file, and the workflow that runs it.
 *
 * `scripts/served-model-check.sh` decides whether every commit a pull request
 * adds records the model that served it (FounderOS DEC-20261020-01 clauses 3
 * to 5, Amendment 2): a claude-code commit by its own Co-Authored-By trailer,
 * a commit on another builder surface by a `Served-Model:` line in the PR
 * body. It is driven here against throwaway git repositories, with
 * CHECK_DATE set on both sides of the 2026-11-15 phase-in.
 *
 * The workflow half is text assertions only, in the manner of
 * test/founder-authorization.test.ts: the repository carries no YAML parser.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = join(REPO_ROOT, 'scripts', 'served-model-check.sh');
const LANES = join(REPO_ROOT, 'scripts', 'served-model-lanes.json');
const WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'served-model.yml');
const TEMPLATE = join(REPO_ROOT, '.github', 'pull_request_template.md');
const CI = join(REPO_ROOT, '.github', 'workflows', 'ci.yml');

const BEFORE = '2026-11-14';
const FROM = '2026-11-15';

function git(cwd: string, args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** A repository with one base commit; returns helpers to add commits. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'served-model-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  git(dir, ['config', 'user.name', 'test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'base.txt'), 'base\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-q', '-m', 'base']);
  const base = git(dir, ['rev-parse', 'HEAD']);
  let n = 0;
  return {
    dir,
    base,
    commit(trailers: string[], opts: { empty?: boolean } = {}): string {
      n += 1;
      const msg = `change ${n}\n\n${trailers.join('\n')}`;
      if (opts.empty) {
        git(dir, ['commit', '-q', '--allow-empty', '-m', msg]);
      } else {
        writeFileSync(join(dir, `f${n}.txt`), `${n}\n`);
        git(dir, ['add', '.']);
        git(dir, ['commit', '-q', '-m', msg]);
      }
      return git(dir, ['rev-parse', 'HEAD']);
    },
    done() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function run(dir: string, base: string, head: string, body: string | undefined, date = BEFORE) {
  const env: NodeJS.ProcessEnv = { ...process.env, CHECK_DATE: date, LANES_FILE: LANES };
  delete env.PR_BODY;
  if (body !== undefined) env.PR_BODY = body;
  const r = spawnSync('bash', [CHECK, base, head], { cwd: dir, encoding: 'utf8', env });
  return { status: r.status, out: r.stdout + r.stderr };
}

const BUILDER = ['Role-Id: builder', 'Actor-Id: session:claude-code/test'];
const CLAUDE = [...BUILDER, 'Execution-Surface: claude-code'];
const CODEX = ['Role-Id: builder', 'Actor-Id: session:codex/test', 'Execution-Surface: codex'];
const OPUS = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';

describe('served-model check — claude-code commits (Co-Authored-By is the record)', () => {
  it('passes a commit whose trailer maps to an allowlisted model', () => {
    const r = repo();
    const head = r.commit([...CLAUDE, OPUS]);
    const res = run(r.dir, r.base, head, '');
    r.done();
    assert.equal(res.status, 0, res.out);
    assert.match(res.out, /served by claude-opus-5\.5/);
    assert.match(res.out, /PASS/);
  });

  it('passes Claude Fable 5.1, also on the claude-code:anthropic allowlist', () => {
    const r = repo();
    const head = r.commit([...CLAUDE, 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>']);
    const res = run(r.dir, r.base, head, '');
    r.done();
    assert.equal(res.status, 0, res.out);
  });

  it('fails at once, even before the phase-in date, on a registered model that is off the allowlist', () => {
    const r = repo();
    const head = r.commit([...CLAUDE, 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>']);
    const res = run(r.dir, r.base, head, '', BEFORE);
    r.done();
    assert.equal(res.status, 1, res.out);
    assert.match(res.out, /OFF-LIST/);
  });

  it('counts a missing trailer as MISSING: advisory before 2026-11-15, failing from it', () => {
    const r = repo();
    const head = r.commit(CLAUDE);
    const before = run(r.dir, r.base, head, '', BEFORE);
    const from = run(r.dir, r.base, head, '', FROM);
    r.done();
    assert.equal(before.status, 0, before.out);
    assert.match(before.out, /ALERT/);
    assert.equal(from.status, 1, from.out);
    assert.match(from.out, /MISSING/);
  });

  it('counts a trailer that maps to no registry entry (a human co-author) as MISSING', () => {
    const r = repo();
    const head = r.commit([...CLAUDE, 'Co-Authored-By: Some Person <person@example.invalid>']);
    const res = run(r.dir, r.base, head, '', FROM);
    r.done();
    assert.equal(res.status, 1, res.out);
    assert.match(res.out, /no Co-Authored-By trailer that maps/);
  });

  it('ignores a Served-Model body line for claude-code work', () => {
    const r = repo();
    const head = r.commit([...CLAUDE, OPUS]);
    const res = run(r.dir, r.base, head, 'Served-Model: grok-9 (made up)\n');
    r.done();
    assert.equal(res.status, 0, res.out);
  });
});

describe('served-model check — other builder surfaces (the body line is the record)', () => {
  it('passes a codex commit with a well-formed, allowlisted body line', () => {
    const r = repo();
    const head = r.commit(CODEX);
    const res = run(r.dir, r.base, head, 'Summary.\n\nServed-Model: gpt-6.1-sol (codex session report)\n\nRole-Id: builder\n', FROM);
    r.done();
    assert.equal(res.status, 0, res.out);
    assert.match(res.out, /served by gpt-6\.1-sol/);
  });

  it('accepts one line per model', () => {
    const r = repo();
    const head = r.commit(CODEX);
    const body = 'Served-Model: gpt-6.1-sol (codex session report)\nServed-Model: gpt-6-astra (codex session report)\n';
    const res = run(r.dir, r.base, head, body, FROM);
    r.done();
    assert.equal(res.status, 0, res.out);
  });

  it('fails at once on an off-list body line', () => {
    const r = repo();
    const head = r.commit(CODEX);
    const res = run(r.dir, r.base, head, 'Served-Model: gpt-6-luna (codex session report)\n', BEFORE);
    r.done();
    assert.equal(res.status, 1, res.out);
    assert.match(res.out, /OFF-LIST body: gpt-6-luna/);
  });

  const missing: Array<[string, string]> = [
    ['no body line at all', 'Summary only.\n'],
    ['a line with no evidence source', 'Served-Model: gpt-6.1-sol\n'],
    ['a line with an empty evidence source', 'Served-Model: gpt-6.1-sol ( )\n'],
    ['a line that is not at column 0', '  Served-Model: gpt-6.1-sol (codex session report)\n'],
    ['a line only inside an HTML comment (the template example)', '<!--\nServed-Model: gpt-6.1-sol (codex session report)\n-->\n'],
    ['unavailable-from-current-harness (unverified, not on-list)', 'Served-Model: unavailable-from-current-harness (codex has no report)\n'],
  ];
  for (const [label, body] of missing) {
    it(`counts ${label} as MISSING, failing from 2026-11-15`, () => {
      const r = repo();
      const head = r.commit(CODEX);
      const before = run(r.dir, r.base, head, body, BEFORE);
      const from = run(r.dir, r.base, head, body, FROM);
      r.done();
      assert.equal(before.status, 0, before.out);
      assert.match(before.out, /MISSING/);
      assert.equal(from.status, 1, from.out);
    });
  }

  it('reads a CRLF body', () => {
    const r = repo();
    const head = r.commit(CODEX);
    const res = run(r.dir, r.base, head, 'Summary.\r\n\r\nServed-Model: gpt-6.1-sol (codex session report)\r\n', FROM);
    r.done();
    assert.equal(res.status, 0, res.out);
  });
});

describe('served-model check — coverage fails closed', () => {
  it('counts a commit with no Execution-Surface as MISSING', () => {
    const r = repo();
    const head = r.commit([...BUILDER, OPUS]);
    const res = run(r.dir, r.base, head, '', FROM);
    r.done();
    assert.equal(res.status, 1, res.out);
    assert.match(res.out, /no Execution-Surface/);
  });

  it('counts a surface with no builder lane as MISSING', () => {
    const r = repo();
    const head = r.commit([...BUILDER, 'Execution-Surface: cursor', OPUS]);
    const res = run(r.dir, r.base, head, 'Served-Model: gpt-6.1-sol (x)\n', FROM);
    r.done();
    assert.equal(res.status, 1, res.out);
    assert.match(res.out, /'cursor' has no builder lane/);
  });

  it('judges every commit, so one bad commit fails a range of good ones', () => {
    const r = repo();
    r.commit([...CLAUDE, OPUS]);
    const head = r.commit(CLAUDE);
    const res = run(r.dir, r.base, head, '', FROM);
    r.done();
    assert.equal(res.status, 1, res.out);
  });

  it('does not cover direct-founder work (Actor-Id: founder, no Role-Id)', () => {
    const r = repo();
    const head = r.commit(['Actor-Id: founder', 'Execution-Surface: claude-code']);
    const res = run(r.dir, r.base, head, '', FROM);
    r.done();
    assert.equal(res.status, 0, res.out);
    assert.match(res.out, /direct-founder work/);
  });

  it('does not cover a commit that changes no file', () => {
    const r = repo();
    const head = r.commit(CLAUDE, { empty: true });
    const res = run(r.dir, r.base, head, '', FROM);
    r.done();
    assert.equal(res.status, 0, res.out);
  });

  it('covers a merge commit that adds content of its own, and not a clean merge', () => {
    const r = repo();
    git(r.dir, ['checkout', '-q', '-b', 'side']);
    r.commit([...CLAUDE, OPUS]);
    git(r.dir, ['checkout', '-q', '-']);
    r.commit([...CLAUDE, OPUS]);
    git(r.dir, ['merge', '-q', '--no-edit', 'side', '-m', `clean merge\n\n${CLAUDE.join('\n')}`]);
    const clean = run(r.dir, r.base, git(r.dir, ['rev-parse', 'HEAD']), '', FROM);
    git(r.dir, ['reset', '-q', '--hard', 'HEAD~1']);
    git(r.dir, ['merge', '-q', '--no-commit', 'side']);
    writeFileSync(join(r.dir, 'added-in-merge.txt'), 'x\n');
    git(r.dir, ['add', '.']);
    git(r.dir, ['commit', '-q', '-m', `merge adding a file\n\n${CLAUDE.join('\n')}`]);
    const evil = run(r.dir, r.base, git(r.dir, ['rev-parse', 'HEAD']), '', FROM);
    r.done();
    assert.equal(clean.status, 0, clean.out);
    assert.equal(evil.status, 1, evil.out);
    assert.match(evil.out, /no Co-Authored-By trailer that maps/);
  });

  it('reads trailers as git does, so trailer-shaped text above the block does not count', () => {
    const r = repo();
    const head = r.commit(['Execution-Surface: claude-code', OPUS, '', 'Body text after.']);
    const res = run(r.dir, r.base, head, '', FROM);
    r.done();
    assert.equal(res.status, 1, res.out);
  });
});

describe('served-model check — input it refuses (fail closed, exit 2)', () => {
  it('refuses when PR_BODY is unset', () => {
    const r = repo();
    const head = r.commit([...CLAUDE, OPUS]);
    const res = run(r.dir, r.base, head, undefined);
    r.done();
    assert.equal(res.status, 2, res.out);
  });

  it('refuses a malformed SHA, an unknown commit and a bad CHECK_DATE', () => {
    const r = repo();
    const head = r.commit([...CLAUDE, OPUS]);
    assert.equal(run(r.dir, r.base, 'abc', '').status, 2);
    assert.equal(run(r.dir, r.base, 'f'.repeat(40), '').status, 2);
    assert.equal(run(r.dir, r.base, head, '', '15/11/2026').status, 2);
    r.done();
  });

  it('refuses a missing or malformed lanes file', () => {
    const r = repo();
    const head = r.commit([...CLAUDE, OPUS]);
    const bad = join(r.dir, 'bad.json');
    writeFileSync(bad, '{"builder_lanes": {}}');
    for (const file of [join(r.dir, 'absent.json'), bad]) {
      const env: NodeJS.ProcessEnv = { ...process.env, PR_BODY: '', CHECK_DATE: BEFORE, LANES_FILE: file };
      const res = spawnSync('bash', [CHECK, r.base, head], { cwd: r.dir, encoding: 'utf8', env });
      assert.equal(res.status, 2, res.stdout);
    }
    r.done();
  });
});

describe('served-model lanes file — a pinned copy of the FounderOS registry', () => {
  const lanes = JSON.parse(readFileSync(LANES, 'utf8')) as {
    source: { repository: string; commit: string };
    blocking_from: string;
    builder_lanes: Record<string, { lane: string; record: string; allowlist: string[] }>;
    display_names: Record<string, string>;
  };

  it('names the FounderOS commit it was copied from', () => {
    assert.equal(lanes.source.repository, 'MADVenturesLLC/FounderOS');
    assert.match(lanes.source.commit, /^[0-9a-f]{40}$/);
  });

  it('carries clause 4 phase-in date', () => {
    assert.equal(lanes.blocking_from, FROM);
  });

  it('holds exactly the two builder lanes of DEC-20261020-01 clause 2, models "on registration" excluded', () => {
    assert.deepEqual(lanes.builder_lanes, {
      'claude-code': { lane: 'claude-code:anthropic', record: 'co-authored-by', allowlist: ['claude-opus-5.5', 'claude-fable-5.1'] },
      codex: { lane: 'codex:openai', record: 'served-model-line', allowlist: ['gpt-6.1-sol', 'gpt-6-astra'] },
    });
  });

  it('maps every allowlisted model from its display name', () => {
    const ids = new Set(Object.values(lanes.display_names));
    for (const lane of Object.values(lanes.builder_lanes)) {
      for (const id of lane.allowlist) assert.ok(ids.has(id), `${id} has a display name`);
    }
  });
});

describe('served-model workflow and PR template shape', () => {
  const text = readFileSync(WORKFLOW, 'utf8');
  const lines = text.split('\n').filter((l) => l.trim() !== '' && !/^\s*#/.test(l));

  it('runs on pull requests, including body edits', () => {
    assert.ok(lines.some((l) => l.trim() === 'types: [opened, synchronize, reopened, edited]'));
    assert.ok(lines.some((l) => l === '  pull_request:'));
  });

  it('publishes a job named served-model with read-only contents permission', () => {
    assert.ok(lines.some((l) => l === '  served-model:'));
    const start = lines.findIndex((l) => l === 'permissions:');
    assert.equal(lines[start + 1]?.trim(), 'contents: read');
    assert.ok(!/write/.test(lines.slice(start, start + 3).join('\n')));
  });

  it('takes the checker and its data from the base revision when the base has them', () => {
    assert.match(text, /git show "\$BASE_SHA:scripts\/served-model-check\.sh"/);
    assert.match(text, /git show "\$BASE_SHA:scripts\/served-model-lanes\.json"/);
  });

  it('passes the PR body through env only, never interpolated into a run script', () => {
    assert.ok(lines.some((l) => l.trim() === 'PR_BODY: ${{ github.event.pull_request.body }}'));
    const runBlocks = text.split(/\n\s*run: \|\n/).slice(1).map((b) => b.split(/\n\s{6}- name:/)[0] ?? '');
    for (const b of runBlocks) assert.ok(!/\$\{\{/.test(b), 'no ${{ }} inside run:');
  });

  it('checks out with the same action pin ci.yml uses, without persisted credentials', () => {
    const pin = readFileSync(CI, 'utf8').split('\n').find((l) => /uses:\s*actions\/checkout@[0-9a-f]{40}/.test(l));
    assert.ok(pin !== undefined);
    assert.ok(lines.some((l) => l.trim() === pin.trim()));
    assert.ok(lines.some((l) => l.trim() === 'persist-credentials: false'));
  });

  it('keeps the template example out of reach of the check', () => {
    const template = readFileSync(TEMPLATE, 'utf8');
    assert.ok(!/^Served-Model:/m.test(template), 'no Served-Model line at column 0 in the template');
    assert.ok(!/^---/m.test(template), 'no git message divider in the template');
  });
});
