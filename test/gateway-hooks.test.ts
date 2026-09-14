/**
 * Lane D — cancelable pre/post hooks + policy bundles (OMP→MAD Evolve Pack
 * v0, Founder act of 2026-09-13). Stacked on Lane A (output schemas).
 *
 * Imports the daemon package entry (the hooks are exported from it), the
 * Seat Registry public entry (for the expected refusal), the V1.1 gate
 * module (for its test seam), and the Lane A entry.
 *
 * Proven here:
 *   - block: a pre-hook block ends the pipeline; the dispatcher is never
 *     invoked (counted, not logged);
 *   - revise-args: a revise reaches the dispatcher and later hooks; identity
 *     fields cannot be revised; a malformed revise blocks;
 *   - fail-closed on hook error: throw, timeout, and an out-of-enum decision
 *     all block; a post-hook failure is never a clean dispatch; an empty
 *     gate cannot be built; a malformed call blocks;
 *   - policy bundles: allow/deny, deny wins, default deny, no grant → deny,
 *     segment-wise patterns, malformed bundles refused at construction;
 *   - a seat-registry deny actually prevents dispatch: the production gate
 *     blocks the builder seat with the resolver's own refusal and the
 *     dispatcher count stays 0; the seam's allow dispatches once;
 *   - the Lane A output-schema post-hook rejects (strict) or flags
 *     (permissive) a result, and a defective schema fails the post-hook;
 *   - static: no second daemon, no broker.sock, no MADV_SOCKET_PATH, no
 *     socket API, no environment read, bounded imports, lockfile/manifest
 *     of the daemon unchanged.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  INTERCEPTOR_BLOCK_CODES,
  INTERCEPT_OUTCOMES,
  InterceptorConfigError,
  PolicyBundleError,
  PolicyBundleSet,
  SEAT_HOOK_CODES,
  ToolCallInterceptor,
  isCleanDispatch,
  malformedCallField,
  matchTool,
  outputSchemaPostHook,
  policyBundleHook,
  seatPolicyHook,
  validateBundles,
  type InterceptOutcome,
  type PolicyBundle,
  type PreHook,
  type ToolCall,
} from '../packages/gateway-daemon/src/index.js';
import { resolveSeat, type SeatResolution } from '../packages/seat-registry/src/index.js';
import { createSeatPolicyGate } from '../packages/control-plane/src/seat-policy.js';
import type { OutputSchema } from '../packages/seat-output-schema/src/index.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS_SRC = join(REPO_ROOT, 'packages', 'gateway-daemon', 'src', 'hooks');

function call(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    call_id: 'call-1',
    tool: 'fs.read',
    tool_class: 'read',
    args: { path: '/fixture/a.txt' },
    seat_id: 'builder',
    scope: 'room-fixture/run-1',
    authorization_ref: 'FOUNDER-ACT-2026-09-13',
    ...overrides,
  };
}

/** A dispatcher that counts: the evidence that a block is not log-only. */
function countingDispatcher(): { dispatch: (c: ToolCall) => Promise<unknown>; count: () => number; last: () => ToolCall | null } {
  let n = 0;
  let last: ToolCall | null = null;
  return {
    dispatch: async (c) => {
      n += 1;
      last = c;
      return { echoed: c.args };
    },
    count: () => n,
    last: () => last,
  };
}

const allowAll: PreHook = { name: 'allow-all', run: () => ({ decision: 'allow' }) };

/* ------------------------------------------------------------------ */
/* Block / revise / fail-closed                                         */
/* ------------------------------------------------------------------ */

describe('gateway-hooks · block, revise, fail-closed', () => {
  it('exposes a closed outcome set, and only `dispatched` is clean', () => {
    assert.deepEqual([...INTERCEPT_OUTCOMES], ['blocked', 'dispatched', 'dispatched_flagged', 'dispatched_rejected', 'dispatched_post_hook_failed', 'dispatch_failed']);
  });

  it('block: the first blocking hook ends the pipeline; later hooks and the dispatcher never run', async () => {
    let laterRan = 0;
    const interceptor = new ToolCallInterceptor({
      pre: [
        { name: 'deny-writes', run: (c) => (c.tool_class === 'write' ? { decision: 'block', code: 'no_writes', reason: 'writes are not approved' } : { decision: 'allow' }) },
        { name: 'later', run: () => { laterRan += 1; return { decision: 'allow' }; } },
      ],
    });
    const d = countingDispatcher();
    const outcome = await interceptor.intercept(call({ tool: 'fs.write', tool_class: 'write' }), d.dispatch);
    assert.equal(outcome.kind, 'blocked');
    if (outcome.kind !== 'blocked') return;
    assert.equal(outcome.by, 'deny-writes');
    assert.equal(outcome.code, 'no_writes');
    assert.equal(d.count(), 0, 'blocked means the dispatcher was never invoked');
    assert.equal(laterRan, 0);
    assert.equal(isCleanDispatch(outcome), false);

    const allowed = await interceptor.intercept(call(), d.dispatch);
    assert.equal(allowed.kind, 'dispatched');
    assert.equal(d.count(), 1);
    assert.equal(laterRan, 1);
    assert.equal(isCleanDispatch(allowed), true);
  });

  it('revise-args: the dispatcher and later hooks receive the revised args; identity fields are never taken from a hook', async () => {
    const seen: ToolCall[] = [];
    const interceptor = new ToolCallInterceptor({
      pre: [
        {
          name: 'redirect-to-fixture-root',
          run: (c) => ({
            decision: 'revise',
            args: { ...c.args, path: `/fixture-root${String(c.args.path)}` },
            reason: 'paths are confined to the fixture root',
          }),
        },
        { name: 'observer', run: (c) => { seen.push(c); return { decision: 'allow' }; } },
      ],
    });
    const d = countingDispatcher();
    const outcome = await interceptor.intercept(call(), d.dispatch);
    assert.equal(outcome.kind, 'dispatched');
    assert.deepEqual(d.last()?.args, { path: '/fixture-root/fixture/a.txt' });
    assert.deepEqual(seen[0]?.args, { path: '/fixture-root/fixture/a.txt' });
    assert.equal(outcome.revisions.length, 1);
    assert.deepEqual(outcome.revisions[0]?.before, { path: '/fixture/a.txt' });
    assert.equal(outcome.revisions[0]?.by, 'redirect-to-fixture-root');

    // A hook that tries to smuggle identity through the revise payload changes nothing but args.
    const smuggler = new ToolCallInterceptor({
      pre: [{ name: 'smuggler', run: () => ({ decision: 'revise', args: { tool: 'shell.exec', tool_class: 'exec', seat_id: 'founder', x: 1 }, reason: 'try' }) }],
    });
    const d2 = countingDispatcher();
    const out2 = await smuggler.intercept(call(), d2.dispatch);
    assert.equal(out2.kind, 'dispatched');
    assert.equal(d2.last()?.tool, 'fs.read');
    assert.equal(d2.last()?.tool_class, 'read');
    assert.equal(d2.last()?.seat_id, 'builder');
    assert.equal(d2.last()?.call_id, 'call-1');
    assert.deepEqual(d2.last()?.args, { tool: 'shell.exec', tool_class: 'exec', seat_id: 'founder', x: 1 }, 'args carry whatever the hook put there; identity does not');
  });

  it('fail-closed: a hook that throws, times out, or returns an out-of-enum decision blocks the call', async () => {
    const d = countingDispatcher();
    const thrower = new ToolCallInterceptor({ pre: [{ name: 'thrower', run: () => { throw new Error('boom'); } }] });
    const t = await thrower.intercept(call(), d.dispatch);
    assert.equal(t.kind, 'blocked');
    if (t.kind === 'blocked') {
      assert.equal(t.code, INTERCEPTOR_BLOCK_CODES.hook_error);
      assert.match(t.reason, /thrower: Error: boom/);
    }

    const hanging = new ToolCallInterceptor({ pre: [{ name: 'hangs', run: () => new Promise(() => undefined) }], hookTimeoutMs: 20 });
    const h = await hanging.intercept(call(), d.dispatch);
    assert.equal(h.kind, 'blocked');
    if (h.kind === 'blocked') assert.equal(h.code, INTERCEPTOR_BLOCK_CODES.hook_timeout);

    for (const bad of [{ decision: 'maybe' }, { decision: 'block' }, { decision: 'revise', args: 'not-an-object', reason: 'x' }, null, 'allow', undefined]) {
      const invalid = new ToolCallInterceptor({ pre: [{ name: 'invalid', run: () => bad as never }] });
      const outcome = await invalid.intercept(call(), d.dispatch);
      assert.equal(outcome.kind, 'blocked', JSON.stringify(bad));
      if (outcome.kind === 'blocked') assert.equal(outcome.code, INTERCEPTOR_BLOCK_CODES.hook_result_invalid);
    }
    assert.equal(d.count(), 0, 'no failing hook let a call through');
  });

  it('fail-closed: a malformed call blocks before any hook; an empty gate cannot be built; hook names are unique', async () => {
    let hookRan = 0;
    const interceptor = new ToolCallInterceptor({ pre: [{ name: 'counter', run: () => { hookRan += 1; return { decision: 'allow' }; } }] });
    const d = countingDispatcher();
    for (const [bad, field] of [
      [{ ...call(), tool: 'rm -rf /' }, 'tool'],
      [{ ...call(), tool_class: 'admin' }, 'tool_class'],
      [{ ...call(), args: [] }, 'args'],
      [{ ...call(), scope: '' }, 'scope'],
      [{ ...call(), call_id: '' }, 'call_id'],
      [{ ...call(), seat_id: 7 }, 'seat_id'],
      ['not a call', 'call'],
    ] as [unknown, string][]) {
      assert.equal(malformedCallField(bad), field);
      const outcome = await interceptor.intercept(bad as ToolCall, d.dispatch);
      assert.equal(outcome.kind, 'blocked');
      if (outcome.kind === 'blocked') {
        assert.equal(outcome.code, INTERCEPTOR_BLOCK_CODES.malformed_call);
        assert.equal(outcome.by, 'interceptor');
      }
    }
    assert.equal(hookRan, 0);
    assert.equal(d.count(), 0);
    assert.throws(() => new ToolCallInterceptor({ pre: [] }), InterceptorConfigError);
    assert.throws(() => new ToolCallInterceptor({ pre: [allowAll, allowAll] }), InterceptorConfigError);
    assert.throws(() => new ToolCallInterceptor({ pre: [allowAll], hookTimeoutMs: 0 }), InterceptorConfigError);
  });

  it('post-hooks: flags → dispatched_flagged; rejected → dispatched_rejected; throw/timeout/invalid → dispatched_post_hook_failed; none is clean', async () => {
    const d = countingDispatcher();
    const flagged = new ToolCallInterceptor({ pre: [allowAll], post: [{ name: 'note', observe: () => ({ flags: ['result is large'], rejected: false }) }] });
    const f = await flagged.intercept(call(), d.dispatch);
    assert.equal(f.kind, 'dispatched_flagged');
    if (f.kind === 'dispatched_flagged') assert.deepEqual(f.flags, ['note: result is large']);

    const rejecting = new ToolCallInterceptor({ pre: [allowAll], post: [{ name: 'judge', observe: () => ({ flags: ['bad shape'], rejected: true }) }] });
    const r = await rejecting.intercept(call(), d.dispatch);
    assert.equal(r.kind, 'dispatched_rejected');
    if (r.kind === 'dispatched_rejected') assert.deepEqual(r.rejected_by, ['judge']);

    const throwing = new ToolCallInterceptor({ pre: [allowAll], post: [{ name: 'broken', observe: () => { throw new Error('observer crashed'); } }] });
    const t = await throwing.intercept(call(), d.dispatch);
    assert.equal(t.kind, 'dispatched_post_hook_failed');
    if (t.kind === 'dispatched_post_hook_failed') {
      assert.equal(t.failed_hook, 'broken');
      assert.deepEqual(t.result, { echoed: { path: '/fixture/a.txt' } }, 'the result is retained, not lost — but never reported clean');
    }

    const hanging = new ToolCallInterceptor({ pre: [allowAll], post: [{ name: 'hangs', observe: () => new Promise(() => undefined) }], hookTimeoutMs: 20 });
    assert.equal((await hanging.intercept(call(), d.dispatch)).kind, 'dispatched_post_hook_failed');

    const invalid = new ToolCallInterceptor({ pre: [allowAll], post: [{ name: 'invalid', observe: () => ({ flags: 'x' }) as never }] });
    assert.equal((await invalid.intercept(call(), d.dispatch)).kind, 'dispatched_post_hook_failed');

    for (const outcome of [f, r, t]) assert.equal(isCleanDispatch(outcome), false);
  });

  it('a dispatcher that throws yields dispatch_failed and runs no post-hook', async () => {
    let observed = 0;
    const interceptor = new ToolCallInterceptor({ pre: [allowAll], post: [{ name: 'obs', observe: () => { observed += 1; return { flags: [], rejected: false }; } }] });
    const outcome = await interceptor.intercept(call(), async () => { throw new Error('provider_forbidden'); });
    assert.equal(outcome.kind, 'dispatch_failed');
    if (outcome.kind === 'dispatch_failed') assert.match(outcome.error, /provider_forbidden/);
    assert.equal(observed, 0);
  });
});

/* ------------------------------------------------------------------ */
/* Policy bundles                                                       */
/* ------------------------------------------------------------------ */

const READ_ONLY_GATE: PolicyBundle = {
  bundle_id: 'gate-read-only',
  tier: 'gate',
  authorization_ref: 'GATE-ACT-FIXTURE-01',
  allow: [{ tool_class: 'read', tool_pattern: 'fs.*' }, { tool_class: 'read', tool_pattern: 'git.status' }],
  deny: [{ tool_class: 'read', tool_pattern: 'fs.read_secret' }],
};

const TRANCHE_WRITE: PolicyBundle = {
  bundle_id: 'tranche-write-src',
  tier: 'tranche',
  authorization_ref: 'TRANCHE-ACT-FIXTURE-02',
  allow: [{ tool_class: 'write', tool_pattern: 'fs.write' }, { tool_class: 'exec', tool_pattern: 'test.**' }],
  deny: [{ tool_class: 'exec', tool_pattern: 'shell.**' }],
};

describe('gateway-hooks · policy bundles', () => {
  it('matchTool is segment-wise: * is one segment, ** the rest, exact otherwise; malformed inputs never match', () => {
    assert.equal(matchTool('fs.*', 'fs.read'), true);
    assert.equal(matchTool('fs.*', 'fs.read.raw'), false);
    assert.equal(matchTool('fs.**', 'fs.read.raw'), true);
    assert.equal(matchTool('fs.**', 'fs'), true);
    assert.equal(matchTool('**', 'anything.at.all'), true);
    assert.equal(matchTool('git.status', 'git.status'), true);
    assert.equal(matchTool('git.status', 'git.commit'), false);
    assert.equal(matchTool('*.status', 'git.status'), true);
    assert.equal(matchTool('fs.*', 'FS.READ'), true);
    assert.equal(matchTool('fs.[a]', 'fs.a'), false);
    assert.equal(matchTool('fs.*', 'fs.read; rm'), false);
  });

  it('allow, deny-wins, default-deny, and no-grant, each naming the rule', () => {
    const set = new PolicyBundleSet([READ_ONLY_GATE, TRANCHE_WRITE], [
      { bundle_id: 'gate-read-only', scope: 'scope-gate' },
      { bundle_id: 'gate-read-only', scope: 'scope-both' },
      { bundle_id: 'tranche-write-src', scope: 'scope-both' },
    ]);
    const allow = set.evaluate(call({ scope: 'scope-gate' }));
    assert.equal(allow.decision, 'allow');
    if (allow.decision === 'allow') assert.deepEqual(allow.allowed_by, { bundle_id: 'gate-read-only', tier: 'gate', rule: { tool_class: 'read', tool_pattern: 'fs.*' } });

    const denied = set.evaluate(call({ scope: 'scope-gate', tool: 'fs.read_secret' }));
    assert.equal(denied.decision, 'deny');
    if (denied.decision === 'deny') {
      assert.equal(denied.code, 'policy_denied');
      assert.equal(denied.denied_by[0]?.rule.tool_pattern, 'fs.read_secret');
    }

    const noAllow = set.evaluate(call({ scope: 'scope-gate', tool: 'fs.write', tool_class: 'write' }));
    assert.equal(noAllow.decision, 'deny');
    if (noAllow.decision === 'deny') assert.equal(noAllow.code, 'policy_no_allow');

    const classMismatch = set.evaluate(call({ scope: 'scope-gate', tool: 'fs.read', tool_class: 'exec' }));
    assert.equal(classMismatch.decision, 'deny', 'a pattern match under the wrong class is not an allow');

    const noGrant = set.evaluate(call({ scope: 'scope-unknown' }));
    assert.equal(noGrant.decision, 'deny');
    if (noGrant.decision === 'deny') assert.equal(noGrant.code, 'policy_no_grant');

    const both = set.evaluate(call({ scope: 'scope-both', tool: 'fs.write', tool_class: 'write' }));
    assert.equal(both.decision, 'allow');
    const shell = set.evaluate(call({ scope: 'scope-both', tool: 'shell.exec', tool_class: 'exec' }));
    assert.equal(shell.decision, 'deny');
    if (shell.decision === 'deny') assert.equal(shell.code, 'policy_denied');
    const tests = set.evaluate(call({ scope: 'scope-both', tool: 'test.run.unit', tool_class: 'exec' }));
    assert.equal(tests.decision, 'allow');
  });

  it('the policy hook turns a deny into a block, and the dispatcher is never reached', async () => {
    const set = new PolicyBundleSet([READ_ONLY_GATE], [{ bundle_id: 'gate-read-only', scope: 'scope-gate' }]);
    const interceptor = new ToolCallInterceptor({ pre: [policyBundleHook(set)] });
    const d = countingDispatcher();
    const denied = await interceptor.intercept(call({ scope: 'scope-gate', tool: 'fs.write', tool_class: 'write' }), d.dispatch);
    assert.equal(denied.kind, 'blocked');
    if (denied.kind === 'blocked') {
      assert.equal(denied.by, 'policy-bundles');
      assert.equal(denied.code, 'policy_no_allow');
    }
    assert.equal(d.count(), 0);
    const allowed = await interceptor.intercept(call({ scope: 'scope-gate' }), d.dispatch);
    assert.equal(allowed.kind, 'dispatched');
    assert.equal(d.count(), 1);
  });

  it('malformed bundles and grants are refused at construction — a hole is not a permission', () => {
    const defects = validateBundles([
      { bundle_id: '', tier: 'founder', authorization_ref: '', allow: [{ tool_class: 'admin', tool_pattern: 'fs.*' }], deny: 'none', extra: 1 },
      { bundle_id: 'empty', tier: 'gate', authorization_ref: 'X', allow: [], deny: [] },
      { bundle_id: 'empty', tier: 'gate', authorization_ref: 'X', allow: [{ tool_class: 'read', tool_pattern: 'fs.[x]' }], deny: [] },
      null,
    ]);
    for (const needle of ['bundle_id required', 'tier must be one of gate, tranche', 'authorization_ref required', 'tool_class must be one of', 'deny must be an array', 'unknown key extra', 'approves nothing', 'duplicate bundle_id empty', 'not a dotted pattern', 'must be an object']) {
      assert.ok(defects.some((d) => d.includes(needle)), `missing defect ${needle}: ${JSON.stringify(defects)}`);
    }
    assert.throws(() => new PolicyBundleSet([{ ...READ_ONLY_GATE, tier: 'founder' as never }], []), PolicyBundleError);
    assert.throws(() => new PolicyBundleSet([READ_ONLY_GATE], [{ bundle_id: 'ghost', scope: 's' }]), PolicyBundleError);
    assert.throws(() => new PolicyBundleSet([READ_ONLY_GATE], [{ bundle_id: 'gate-read-only', scope: '' }]), PolicyBundleError);
    assert.deepEqual(validateBundles([READ_ONLY_GATE, TRANCHE_WRITE]), []);
  });
});

/* ------------------------------------------------------------------ */
/* Seat-registry policy with teeth                                      */
/* ------------------------------------------------------------------ */

describe('gateway-hooks · a seat-registry deny prevents dispatch', () => {
  it('production binding: the V1 resolver refuses every seat, the hook blocks with the resolver\'s own refusal, dispatcher count stays 0', async () => {
    // The production binding is composed HERE: the real V1.1 gate with no
    // options over the real V1 resolver. The hook module itself imports
    // nothing from control-plane (see the static test below).
    const interceptor = new ToolCallInterceptor({ pre: [seatPolicyHook(createSeatPolicyGate())] });
    const d = countingDispatcher();
    for (const seat of ['researcher', 'architect', 'builder', 'independent-reviewer']) {
      const expected: SeatResolution = resolveSeat(seat);
      assert.equal(expected.kind, 'refused', `V1 has no standing route for ${seat}`);
      const outcome = await interceptor.intercept(call({ seat_id: seat, call_id: `call-${seat}` }), d.dispatch);
      assert.equal(outcome.kind, 'blocked');
      if (outcome.kind === 'blocked' && expected.kind === 'refused') {
        assert.equal(outcome.by, 'seat-policy');
        assert.equal(outcome.code, `${SEAT_HOOK_CODES.seat_policy_refused}:${expected.refusal}`);
        assert.equal(outcome.reason, expected.reason);
      }
    }
    const unknown = await interceptor.intercept(call({ seat_id: 'Hephaestus' }), d.dispatch);
    assert.equal(unknown.kind, 'blocked');
    if (unknown.kind === 'blocked') assert.equal(unknown.code, `${SEAT_HOOK_CODES.seat_policy_refused}:unknown_seat`);
    const unbound = await interceptor.intercept(call({ seat_id: null }), d.dispatch);
    assert.equal(unbound.kind, 'blocked');
    if (unbound.kind === 'blocked') assert.equal(unbound.code, SEAT_HOOK_CODES.seat_unbound);
    const tta = await interceptor.intercept(call({ authorization_ref: 'temporary-task-assignment TTA-1' }), d.dispatch);
    assert.equal(tta.kind, 'blocked');
    if (tta.kind === 'blocked') assert.equal(tta.code, `${SEAT_HOOK_CODES.seat_policy_refused}:temporary_task_assignment_not_lane_authority`);
    assert.equal(d.count(), 0, 'not one seat-refused call reached the dispatcher');
  });

  it('positive control through the V1.1 gate\'s test seam: an allowed resolution dispatches exactly once', async () => {
    const seam = createSeatPolicyGate({
      resolve: (seatId) => {
        const real = resolveSeat(seatId);
        if (real.kind === 'refused' && real.registration !== null) {
          return { kind: 'resolved', registration: real.registration, contract_text: '', readiness: real.readiness };
        }
        return real;
      },
    });
    const interceptor = new ToolCallInterceptor({ pre: [seatPolicyHook(seam)] });
    const d = countingDispatcher();
    const outcome = await interceptor.intercept(call({ seat_id: 'builder' }), d.dispatch);
    assert.equal(outcome.kind, 'dispatched');
    assert.equal(d.count(), 1);
    const unknown = await interceptor.intercept(call({ seat_id: 'nobody' }), d.dispatch);
    assert.equal(unknown.kind, 'blocked');
    assert.equal(d.count(), 1);
  });

  it('seat policy composes with policy bundles: both must allow', async () => {
    const seam = createSeatPolicyGate({ resolve: (seatId) => { const r = resolveSeat(seatId); return r.kind === 'refused' && r.registration !== null ? { kind: 'resolved', registration: r.registration, contract_text: '', readiness: r.readiness } : r; } });
    const set = new PolicyBundleSet([READ_ONLY_GATE], [{ bundle_id: 'gate-read-only', scope: 'scope-gate' }]);
    const interceptor = new ToolCallInterceptor({ pre: [seatPolicyHook(seam), policyBundleHook(set)] });
    const d = countingDispatcher();
    assert.equal((await interceptor.intercept(call({ scope: 'scope-gate' }), d.dispatch)).kind, 'dispatched');
    assert.equal((await interceptor.intercept(call({ scope: 'scope-gate', tool: 'fs.write', tool_class: 'write' }), d.dispatch)).kind, 'blocked');
    assert.equal((await interceptor.intercept(call({ scope: 'scope-gate', seat_id: null }), d.dispatch)).kind, 'blocked');
    assert.equal(d.count(), 1);
  });
});

/* ------------------------------------------------------------------ */
/* Output-schema post-hook (Lane A)                                     */
/* ------------------------------------------------------------------ */

describe('gateway-hooks · output-schema post-hook over Lane A', () => {
  const schema: OutputSchema = { type: 'object', additional_properties: false, required: ['ok', 'lines'], properties: { ok: { type: 'boolean' }, lines: { type: 'integer', minimum: 0 } } };

  it('strict rejects, permissive flags, conforming is clean, a defective schema fails the post-hook', async () => {
    const good = async (): Promise<unknown> => ({ ok: true, lines: 3 });
    const bad = async (): Promise<unknown> => ({ ok: 'yes', lines: -1, extra: true });
    const strict = new ToolCallInterceptor({ pre: [allowAll], post: [outputSchemaPostHook(schema, 'strict')] });
    const permissive = new ToolCallInterceptor({ pre: [allowAll], post: [outputSchemaPostHook(schema, 'permissive')] });

    assert.equal((await strict.intercept(call(), good)).kind, 'dispatched');
    const rejected = await strict.intercept(call(), bad);
    assert.equal(rejected.kind, 'dispatched_rejected');
    if (rejected.kind === 'dispatched_rejected') assert.equal(rejected.flags.length, 3);

    const flagged = await permissive.intercept(call(), bad);
    assert.equal(flagged.kind, 'dispatched_flagged');
    if (flagged.kind === 'dispatched_flagged') assert.equal(flagged.flags.length, 3);
    assert.equal((await permissive.intercept(call(), good)).kind, 'dispatched');

    const defective = new ToolCallInterceptor({ pre: [allowAll], post: [outputSchemaPostHook({ type: 'object', properties: {}, required: [] } as unknown as OutputSchema, 'strict')] });
    const failed = await defective.intercept(call(), good);
    assert.equal(failed.kind, 'dispatched_post_hook_failed');
    if (failed.kind === 'dispatched_post_hook_failed') assert.match(failed.error, /malformed/);
    const badMode = new ToolCallInterceptor({ pre: [allowAll], post: [outputSchemaPostHook(schema, 'lenient' as never)] });
    assert.equal((await badMode.intercept(call(), good)).kind, 'dispatched_post_hook_failed');
  });
});

/* ------------------------------------------------------------------ */
/* Static locks                                                         */
/* ------------------------------------------------------------------ */

describe('gateway-hooks · static locks', () => {
  function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...tsFiles(full));
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }
  const specifiers = (source: string): string[] =>
    [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);

  it('no second daemon, socket path, broker socket, socket API, process spawn, or environment read in the hooks', () => {
    const forbidden = ['MADV_SOCKET_PATH', 'broker.sock', 'node:net', 'node:http', 'node:child_process', 'node:fs', 'createServer', '.listen(', 'pro' + 'cess.env', 'new GatewayDaemon', 'IpcServer'];
    for (const file of tsFiles(HOOKS_SRC)) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const token of forbidden) assert.ok(!source.includes(token), `${relative(REPO_ROOT, file)} contains ${token}`);
    }
  });

  it('hook imports are bounded: sibling hook modules, the Lane A entry, and the seat-registry entry only — never control-plane', () => {
    for (const file of tsFiles(HOOKS_SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of specifiers(source)) {
        const ok =
          /^\.\/[a-z-]+\.js$/.test(specifier) ||
          specifier === '../../../seat-output-schema/src/index.js' ||
          specifier === '../../../seat-registry/src/index.js';
        assert.ok(ok, `${relative(REPO_ROOT, file)} imports ${specifier}`);
        assert.ok(!specifier.includes('control-plane'), `${relative(REPO_ROOT, file)} takes a dependency edge onto the control-plane workspace member`);
      }
    }
  });

  it('seatPolicyHook has no default gate: a missing or malformed gate throws before any call is judged', () => {
    assert.throws(() => seatPolicyHook(undefined as never), TypeError);
    assert.throws(() => seatPolicyHook({} as never), TypeError);
  });

  it('the daemon manifest declares no new dependency, and the hooks are reachable from the daemon entry', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'packages', 'gateway-daemon', 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    assert.deepEqual(Object.keys(manifest.dependencies), ['@build-room/gateway-protocol']);
    const entry = readFileSync(join(REPO_ROOT, 'packages', 'gateway-daemon', 'src', 'index.ts'), 'utf8');
    assert.ok(entry.includes("export * from './hooks/index.js';"));
  });

  it('every outcome the suite produced is a member of the closed set', async () => {
    const interceptor = new ToolCallInterceptor({ pre: [allowAll] });
    const outcome: InterceptOutcome = await interceptor.intercept(call(), async () => 1);
    assert.ok((INTERCEPT_OUTCOMES as readonly string[]).includes(outcome.kind));
  });
});
