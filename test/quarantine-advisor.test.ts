/**
 * Lane E — pre-dispatch quarantine advisor (OMP→MAD Evolve Pack v0, Founder
 * act of 2026-09-13). Stacked on Lane D (hooks) and Lane A.
 *
 * Imports the package entry, the daemon entry (Lane D interceptor), and node
 * builtins. The reviewer seat is a scripted fixture — no provider.
 *
 * Proven here:
 *   - the parser accepts exactly the closed shape and quarantines everything
 *     else (unknown severity, extra keys, non-JSON, oversized, duplicate ids,
 *     malformed targets, non-object output);
 *   - rate limit: N reviews per window, over-limit batches are deferred and
 *     coalesced into the next permitted review, the window rolls with the
 *     injected clock, bounds are enforced;
 *   - blocker → dispatch blocked through the Lane D interceptor (dispatcher
 *     count 0) by scope, tool pattern, and call id; resolution is explicit;
 *   - concern / nit → dispatched, visible in status;
 *   - malformed advisor output or a throwing seat → quarantined → blocked,
 *     never auto-PASS; a later clean review does not lift it; a recorded
 *     lift does;
 *   - unreviewed and deferred scopes block by default; opt-out only by
 *     explicit `require_review: false`;
 *   - static: bounded imports, no socket/env/clock/provider tokens.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ADVISOR_BLOCK_CODES,
  ADVISOR_SEVERITIES,
  MAX_ADVISOR_OUTPUT_BYTES,
  MAX_FINDINGS_PER_REVIEW,
  QuarantineAdvisor,
  QuarantineAdvisorError,
  RATE_LIMIT_BOUNDS,
  RateLimitPolicyError,
  SCOPE_REVIEW_STATES,
  SlidingWindowLimiter,
  parseAdvisorOutput,
  quarantinePreHook,
  validateRateLimitPolicy,
  type AdvisorFinding,
  type TranscriptBatch,
} from '../packages/quarantine-advisor/src/index.js';
import { ToolCallInterceptor, type ToolCall } from '../packages/gateway-daemon/src/index.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGE_SRC = join(REPO_ROOT, 'packages', 'quarantine-advisor', 'src');

const POLICY = { max_reviews_per_window: 2, window_ms: 10_000 };

function finding(overrides: Partial<AdvisorFinding> = {}): AdvisorFinding {
  return { finding_id: 'F-1', severity: 'blocker', summary: 'writes outside the fixture root', target: { kind: 'scope' }, ...overrides };
}

function batch(scope = 'room-1/run-1', batch_id = 'b-1'): TranscriptBatch {
  return { batch_id, scope, deltas: [{ seq: 1, role: 'seat', text: 'plan: write /etc/passwd' }] };
}

function call(overrides: Partial<ToolCall> = {}): ToolCall {
  return { call_id: 'c-1', tool: 'fs.write', tool_class: 'write', args: {}, seat_id: 'builder', scope: 'room-1/run-1', authorization_ref: null, ...overrides };
}

interface Rig {
  readonly advisor: QuarantineAdvisor;
  readonly interceptor: ToolCallInterceptor;
  readonly dispatched: () => number;
  readonly script: unknown[];
  readonly seen: TranscriptBatch[];
  now: number;
  dispatchCount: number;
}

/** A scripted seat: each submit pops the next scripted output (a thrower is a function). */
function rig(options: { require_review?: boolean } = {}): Rig {
  const script: unknown[] = [];
  const seen: TranscriptBatch[] = [];
  const r: Rig = {
    script,
    seen,
    now: 5_000_000,
    dispatchCount: 0,
    dispatched: () => r.dispatchCount,
    advisor: new QuarantineAdvisor({
      seat: (b) => {
        seen.push(b);
        const next = script.shift();
        if (typeof next === 'function') return (next as () => unknown)();
        return next;
      },
      clock: () => r.now,
      rate_limit: POLICY,
      ...(options.require_review === undefined ? {} : { require_review: options.require_review }),
    }),
    interceptor: undefined as unknown as ToolCallInterceptor,
  };
  (r as { interceptor: ToolCallInterceptor }).interceptor = new ToolCallInterceptor({ pre: [quarantinePreHook(r.advisor)] });
  return r;
}

async function dispatch(r: Rig, c: ToolCall = call()): Promise<ReturnType<ToolCallInterceptor['intercept']> extends Promise<infer T> ? T : never> {
  return r.interceptor.intercept(c, async () => {
    r.dispatchCount += 1;
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Parser                                                               */
/* ------------------------------------------------------------------ */

describe('quarantine-advisor · strict parser', () => {
  it('the severity enum is closed and the parser accepts exactly the shape', () => {
    assert.deepEqual([...ADVISOR_SEVERITIES], ['nit', 'concern', 'blocker']);
    assert.deepEqual([...SCOPE_REVIEW_STATES], ['unreviewed', 'clear', 'concerns', 'blocked', 'quarantined', 'deferred']);
    const parsed = parseAdvisorOutput({ findings: [finding(), finding({ finding_id: 'F-2', severity: 'nit', target: { kind: 'tool', tool_pattern: 'fs.*' } }), finding({ finding_id: 'F-3', severity: 'concern', target: { kind: 'call', call_id: 'c-9' } })] });
    assert.equal(parsed.kind, 'parsed');
    if (parsed.kind === 'parsed') assert.equal(parsed.review.findings.length, 3);
    const fromString = parseAdvisorOutput(JSON.stringify({ findings: [] }));
    assert.equal(fromString.kind, 'parsed');
    if (fromString.kind === 'parsed') assert.deepEqual(fromString.review.findings, []);
  });

  it('quarantines every deviation, naming the reason', () => {
    const cases: [unknown, RegExp][] = [
      [{ findings: [finding({ severity: 'BLOCKER' as never })] }, /severity "BLOCKER" is not nit \| concern \| blocker/],
      [{ findings: [finding({ severity: 'critical' as never })] }, /severity "critical"/],
      [{ findings: [], verdict: 'PASS' }, /must be exactly \{ findings \}/],
      [{ findings: [{ ...finding(), extra: 1 }] }, /must be exactly \{ finding_id, severity, summary, target \}/],
      [{ findings: [finding(), finding()] }, /duplicate finding_id F-1/],
      [{ findings: [finding({ target: { kind: 'tool', tool_pattern: 'rm -rf' } as never })] }, /tool_pattern is not a dotted pattern/],
      [{ findings: [finding({ target: { kind: 'everything' } as never })] }, /target kind "everything"/],
      [{ findings: [finding({ target: { kind: 'scope', all: true } as never })] }, /extra keys/],
      [{ findings: [finding({ summary: '' })] }, /summary must be/],
      [{ findings: [finding({ finding_id: '' })] }, /finding_id invalid/],
      [{ findings: 'none' }, /findings must be an array/],
      ['PASS — looks good to me', /not JSON/],
      ['{"findings": [}', /not JSON/],
      [null, /null, not an object/],
      [42, /number, not an object/],
      [undefined, /undefined, not an object/],
      [[], /not an object/],
      [{ findings: Array.from({ length: MAX_FINDINGS_PER_REVIEW + 1 }, (_, i) => finding({ finding_id: `F-${i}` })) }, /more than 50 findings/],
      ['x'.repeat(MAX_ADVISOR_OUTPUT_BYTES + 1), /exceeds/],
      [{ findings: [finding({ summary: 'y'.repeat(MAX_ADVISOR_OUTPUT_BYTES) })] }, /exceeds/],
    ];
    for (const [raw, expected] of cases) {
      const parsed = parseAdvisorOutput(raw);
      assert.equal(parsed.kind, 'quarantined', String(JSON.stringify(raw) ?? raw).slice(0, 80));
      if (parsed.kind === 'quarantined') assert.match(parsed.reason, expected);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Rate limit                                                           */
/* ------------------------------------------------------------------ */

describe('quarantine-advisor · rate limit', () => {
  it('policy bounds are enforced at construction', () => {
    assert.deepEqual(validateRateLimitPolicy(POLICY), []);
    assert.ok(validateRateLimitPolicy({ max_reviews_per_window: 0, window_ms: 10_000 }).length > 0);
    assert.ok(validateRateLimitPolicy({ max_reviews_per_window: RATE_LIMIT_BOUNDS.max_reviews_per_window.max + 1, window_ms: 10_000 }).length > 0);
    assert.ok(validateRateLimitPolicy({ max_reviews_per_window: 1, window_ms: 10 }).length > 0);
    assert.ok(validateRateLimitPolicy({ max_reviews_per_window: 1, window_ms: 10_000, burst: 5 }).length > 0);
    assert.throws(() => new SlidingWindowLimiter({ max_reviews_per_window: 0, window_ms: 1 }, () => 0), RateLimitPolicyError);
  });

  it('allows N per window, defers beyond, coalesces deferred batches into the next permitted review, rolls with the clock', async () => {
    const r = rig();
    r.script.push({ findings: [] }, { findings: [] }, { findings: [] });
    assert.equal((await r.advisor.submit(batch('s', 'b-1'))).kind, 'reviewed');
    assert.equal((await r.advisor.submit(batch('s', 'b-2'))).kind, 'reviewed');
    const limited = await r.advisor.submit(batch('s', 'b-3'));
    assert.equal(limited.kind, 'rate_limited');
    if (limited.kind === 'rate_limited') {
      assert.equal(limited.retry_after_ms, POLICY.window_ms);
      assert.equal(limited.deferred_batches, 1);
    }
    assert.equal(r.advisor.status('s').state, 'deferred');
    assert.equal(r.seen.length, 2, 'the seat was not called for the deferred batch');
    const again = await r.advisor.submit(batch('s', 'b-4'));
    assert.equal(again.kind, 'rate_limited');
    assert.equal(r.advisor.status('s').deferred_batches, 2);

    r.now += POLICY.window_ms;
    const flushed = await r.advisor.submit(batch('s', 'b-5'));
    assert.equal(flushed.kind, 'reviewed');
    if (flushed.kind === 'reviewed') assert.equal(flushed.coalesced_batches, 2);
    assert.equal(r.seen.length, 3);
    assert.equal(r.seen[2]?.deltas.length, 3, 'b-3, b-4, and b-5 deltas reached the seat as one review');
    assert.equal(r.seen[2]?.batch_id, 'b-5');
    assert.equal(r.advisor.status('s').deferred_batches, 0);
    assert.equal(r.advisor.status('s').state, 'clear');
  });
});

/* ------------------------------------------------------------------ */
/* Blockers quarantine pre-dispatch                                     */
/* ------------------------------------------------------------------ */

describe('quarantine-advisor · blocker → dispatch blocked', () => {
  it('a scope-wide blocker blocks every call in the scope until explicitly resolved; other scopes are unaffected', async () => {
    const r = rig({ require_review: false });
    r.script.push({ findings: [finding()] });
    assert.equal((await r.advisor.submit(batch())).kind, 'reviewed');
    assert.equal(r.advisor.status('room-1/run-1').state, 'blocked');

    const blocked = await dispatch(r);
    assert.equal(blocked.kind, 'blocked');
    if (blocked.kind === 'blocked') {
      assert.equal(blocked.by, 'quarantine-advisor');
      assert.equal(blocked.code, `${ADVISOR_BLOCK_CODES.blocker}:F-1`);
      assert.equal(blocked.reason, 'writes outside the fixture root');
    }
    assert.equal((await dispatch(r, call({ call_id: 'c-2', tool: 'fs.read', tool_class: 'read' }))).kind, 'blocked');
    assert.equal(r.dispatched(), 0, 'the dispatcher was never invoked');
    assert.equal((await dispatch(r, call({ scope: 'room-2/run-1' }))).kind, 'dispatched');
    assert.equal(r.dispatched(), 1);

    assert.throws(() => r.advisor.resolveFinding('room-1/run-1', 'F-1', { by: '', note: '' }), QuarantineAdvisorError);
    assert.equal(r.advisor.resolveFinding('room-1/run-1', 'F-9', { by: 'founder', note: 'n/a' }), false);
    assert.equal(r.advisor.resolveFinding('room-1/run-1', 'F-1', { by: 'founder', note: 'fixture root confirmed' }), true);
    assert.equal(r.advisor.status('room-1/run-1').state, 'clear');
    assert.equal(r.advisor.status('room-1/run-1').resolved[0]?.resolution?.by, 'founder');
    assert.equal((await dispatch(r)).kind, 'dispatched');
    assert.equal(r.dispatched(), 2);
  });

  it('tool-pattern and call-id blockers block only what they target', async () => {
    const r = rig({ require_review: false });
    r.script.push({ findings: [finding({ finding_id: 'T-1', target: { kind: 'tool', tool_pattern: 'shell.**' } }), finding({ finding_id: 'C-1', target: { kind: 'call', call_id: 'c-42' } })] });
    await r.advisor.submit(batch());
    assert.equal((await dispatch(r, call({ tool: 'shell.exec', tool_class: 'exec' }))).kind, 'blocked');
    assert.equal((await dispatch(r, call({ call_id: 'c-42', tool: 'fs.read', tool_class: 'read' }))).kind, 'blocked');
    assert.equal((await dispatch(r, call({ call_id: 'c-43', tool: 'fs.read', tool_class: 'read' }))).kind, 'dispatched');
    assert.equal(r.dispatched(), 1);
  });

  it('concerns and nits do not block; they are visible in status', async () => {
    const r = rig();
    r.script.push({ findings: [finding({ finding_id: 'N-1', severity: 'nit', summary: 'trailing whitespace' }), finding({ finding_id: 'K-1', severity: 'concern', summary: 'large diff' })] });
    await r.advisor.submit(batch());
    const status = r.advisor.status('room-1/run-1');
    assert.equal(status.state, 'concerns');
    assert.deepEqual(status.concerns.map((f) => f.finding_id), ['K-1']);
    assert.deepEqual(status.nits.map((f) => f.finding_id), ['N-1']);
    assert.equal((await dispatch(r)).kind, 'dispatched');
    assert.equal(r.dispatched(), 1);
  });
});

/* ------------------------------------------------------------------ */
/* Malformed advisor → quarantine, never auto-PASS                      */
/* ------------------------------------------------------------------ */

describe('quarantine-advisor · malformed or failing advisor → quarantine', () => {
  it('unparseable output quarantines the scope; dispatch is blocked; a later clean review does not lift it; a recorded lift does', async () => {
    const r = rig({ require_review: false });
    r.script.push('PASS');
    const result = await r.advisor.submit(batch());
    assert.equal(result.kind, 'quarantined');
    assert.equal(r.advisor.status('room-1/run-1').state, 'quarantined');
    const blocked = await dispatch(r);
    assert.equal(blocked.kind, 'blocked');
    if (blocked.kind === 'blocked') assert.equal(blocked.code, ADVISOR_BLOCK_CODES.quarantined);

    r.script.push({ findings: [] });
    assert.equal((await r.advisor.submit(batch('room-1/run-1', 'b-2'))).kind, 'reviewed');
    assert.equal(r.advisor.status('room-1/run-1').state, 'quarantined', 'a clean review does not lift a quarantine');
    assert.equal((await dispatch(r)).kind, 'blocked');

    assert.throws(() => r.advisor.liftQuarantine('room-1/run-1', { by: 'x', note: '' }), QuarantineAdvisorError);
    assert.equal(r.advisor.liftQuarantine('room-1/run-1', { by: 'founder', note: 'seat output inspected' }), true);
    assert.equal(r.advisor.liftQuarantine('room-1/run-1', { by: 'founder', note: 'again' }), false);
    assert.equal(r.advisor.status('room-1/run-1').state, 'clear');
    assert.equal((await dispatch(r)).kind, 'dispatched');
    assert.equal(r.dispatched(), 1);
  });

  it('an unknown severity, an extra verdict key, and a throwing seat each quarantine and block', async () => {
    for (const bad of [{ findings: [finding({ severity: 'critical' as never })] }, { findings: [], verdict: 'PASS' }, () => { throw new Error('seat unavailable'); }]) {
      const r = rig({ require_review: false });
      r.script.push(bad);
      const result = await r.advisor.submit(batch());
      assert.equal(result.kind, 'quarantined');
      assert.equal((await dispatch(r)).kind, 'blocked');
      assert.equal(r.dispatched(), 0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Fail-closed defaults                                                 */
/* ------------------------------------------------------------------ */

describe('quarantine-advisor · unreviewed and deferred scopes', () => {
  it('block by default; opt-out only by explicit require_review: false', async () => {
    const strict = rig();
    const blocked = await dispatch(strict);
    assert.equal(blocked.kind, 'blocked');
    if (blocked.kind === 'blocked') assert.equal(blocked.code, ADVISOR_BLOCK_CODES.review_pending);
    assert.equal(strict.dispatched(), 0);

    strict.script.push({ findings: [] }, { findings: [] });
    await strict.advisor.submit(batch('room-1/run-1', 'b-1'));
    assert.equal((await dispatch(strict)).kind, 'dispatched');
    await strict.advisor.submit(batch('room-1/run-1', 'b-2'));
    await strict.advisor.submit(batch('room-1/run-1', 'b-3')); // rate-limited → deferred
    const deferred = await dispatch(strict);
    assert.equal(deferred.kind, 'blocked');
    if (deferred.kind === 'blocked') assert.match(deferred.reason, /held by the rate limit/);

    const lax = rig({ require_review: false });
    assert.equal((await dispatch(lax)).kind, 'dispatched');
  });

  it('the advisor refuses to exist without a seat', () => {
    assert.throws(() => new QuarantineAdvisor({ seat: undefined as never, clock: () => 0, rate_limit: POLICY }), QuarantineAdvisorError);
  });
});

/* ------------------------------------------------------------------ */
/* Static                                                               */
/* ------------------------------------------------------------------ */

describe('quarantine-advisor · static', () => {
  function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...tsFiles(full));
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  it('imports only sibling modules and the Lane D hooks barrel; no socket, env, clock, or provider tokens', () => {
    const forbidden = ['node:net', 'node:http', 'node:https', 'node:child_process', 'node:fs', 'pro' + 'cess.env', 'Date.now(', 'new Date(', 'Math.random(', 'fet' + 'ch(', 'anthropic', 'openai', 'MADV_SOCKET_PATH', 'broker.sock'];
    for (const file of tsFiles(PACKAGE_SRC)) {
      const source = readFileSync(file, 'utf8');
      const specifiers = [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      for (const specifier of specifiers) {
        assert.ok(/^\.\/[a-z-]+\.js$/.test(specifier) || specifier === '../../gateway-daemon/src/hooks/index.js', `${relative(REPO_ROOT, file)} imports ${specifier}`);
      }
      for (const token of forbidden) assert.ok(!source.includes(token), `${relative(REPO_ROOT, file)} contains ${token}`);
    }
  });

  it('carries no package manifest — not a workspace member, no lockfile change', () => {
    assert.throws(() => readFileSync(join(REPO_ROOT, 'packages', 'quarantine-advisor', 'package.json')));
  });
});
