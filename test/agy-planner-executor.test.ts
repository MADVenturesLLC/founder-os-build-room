/**
 * The Planner's agy executor against a fake agy
 * (FOUNDER-RULING-20261026-BR-PLANNER-EXECUTOR, C1 second step: "tests
 * against a fake agy"). No provider, network or second user is involved:
 * the fake stands in for agy, and the test stands in for `sudo`, so the
 * whole command line the privilege rule must match reaches the fake.
 *
 * What is proven:
 *   - the command line is `sudo -n -u <planner user> -- <agy>` and exactly
 *     the arguments Amendment 1 C3 fixes, none of C4's banned flags among
 *     them, in plan mode;
 *   - `attest` answers only for the architect seat on the bound lane, and
 *     starts nothing;
 *   - the work is written to agy only after its `init` event names
 *     `gemini-4-argon-high` (Amendment 1 B2). A wrong model, `auto`, a first
 *     line that is not `init` or not JSON, and an agy that waits for its input
 *     before saying which model it serves all end in `not_sent`, with nothing
 *     written to agy's input;
 *   - a later event naming another model, an agy error, an answer that is
 *     not JSON, an agy that exits without a result, and a run past its time
 *     all fail the run;
 *   - a leftover planner-user process, a probe that fails, a checkout that
 *     fails, a busy executor and an identity off the lane all refuse with
 *     `not_sent` before agy is started (Amendment 2 C1);
 *   - each run's checkout is agy's working directory and is removed after;
 *     making it read-only follows no symbolic link, so a link in a hostile
 *     tree cannot change the mode of a file outside it;
 *   - the evidence record carries the init model and conversation id;
 *   - the worker drives the executor end to end: attest, execute, status;
 *   - the daemon selects the executor only on Linux, on Gateway 1880c12d,
 *     with every setting present.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGY_PLANNER_GATEWAY_ID,
  AGY_PLANNER_ROUTE,
  AgyPlannerExecutor,
  BANNED_AGY_ARGUMENTS,
  GatewayPlannerWorker,
  PINNED_AGY_ARGUMENTS,
  PlannerRecordStore,
  choosePlannerExecutor,
  planDocumentFrom,
  sha256OfFile,
  readOnly,
  removeCheckout,
  type AgyPlannerDeps,
  type Launch,
} from '../packages/gateway-daemon/src/index.js';
import type { PlannerIdentityWire, PlannerWorkWire } from '../packages/gateway-protocol/src/index.js';
import { judgePlanDoc } from '../packages/control-plane/src/plan-doc.js';
import { readyPlanFor } from './support/synthetic-planner.js';
import { uuid } from './gateway-helpers.js';

const FAKE_AGY = fileURLToPath(new URL('./support/fake-agy.js', import.meta.url));
/** The hash the Founder's act records for the copy, in these cases. */
const AGY_HASH = 'e'.repeat(64);
const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function temporary(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function work(overrides: Partial<PlannerWorkWire> = {}): PlannerWorkWire {
  return {
    commandId: uuid(),
    roomId: uuid(),
    repository: 'MADVenturesLLC/example',
    baseSha: 'a'.repeat(40),
    scopePaths: ['src/health.ts', 'test/health.test.ts'],
    goalEventId: uuid(),
    goal: 'Add an uptime field to the health route.',
    goalDigest: 'c'.repeat(64),
    ...overrides,
  };
}

interface Harness {
  readonly executor: AgyPlannerExecutor;
  readonly logPath: string;
  readonly gatewayDirectory: string;
  readonly checkouts: string[];
  launches: number;
  /** How many times the second privilege rule ran. */
  readonly reaps: () => number;
  /** What the fake saw: its argv and cwd, then every input line. */
  seen(): { argv: string[]; cwd: string; stdin: string[] };
}

function harness(options: {
  mode: string;
  plan?: unknown;
  probe?: AgyPlannerDeps['probe'];
  checkout?: AgyPlannerDeps['checkout'];
  timings?: AgyPlannerDeps['timings'];
  hashFile?: AgyPlannerDeps['hashFile'];
}): Harness {
  const root = temporary('buildroom-agy-');
  const logPath = join(root, 'fake.log');
  const gatewayDirectory = join(root, 'gateway');
  const checkoutParent = join(root, 'checkouts');
  mkdirSync(checkoutParent);
  const checkouts: string[] = [];
  const state = { launches: 0, reaps: 0 };
  const launch: Launch = (file, args, launchOptions) => {
    state.launches += 1;
    assert.equal(file, '/usr/bin/sudo');
    return spawn(process.execPath, [FAKE_AGY, ...args], {
      cwd: launchOptions.cwd,
      stdio: 'pipe',
      env: {
        ...process.env,
        FAKE_AGY_MODE: options.mode,
        FAKE_AGY_LOG: logPath,
        FAKE_AGY_PLAN: JSON.stringify(options.plan ?? {}),
      },
    });
  };
  const executor = new AgyPlannerExecutor(
    {
      sudoPath: '/usr/bin/sudo',
      plannerUser: 'buildroom-planner',
      agyPath: '/opt/agy/bin/agy',
      agySha256: AGY_HASH,
      checkoutParent,
      gatewayDirectory,
    },
    {
      launch,
      probe: options.probe ?? (() => Promise.resolve(false)),
      reap: () => {
        state.reaps += 1;
        return Promise.resolve();
      },
      hashFile: options.hashFile ?? (() => Promise.resolve(AGY_HASH)),
      checkout:
        options.checkout ??
        (async (_work, parent) => {
          const directory = await mkdtemp(join(parent, 'run-'));
          checkouts.push(directory);
          return directory;
        }),
      timings: { initTimeoutMs: 3_000, runTimeoutMs: 5_000, stopGraceMs: 1_000, ...options.timings },
    },
  );
  return {
    executor,
    logPath,
    gatewayDirectory,
    checkouts,
    get launches() {
      return state.launches;
    },
    set launches(value: number) {
      state.launches = value;
    },
    reaps: () => state.reaps,
    seen() {
      const lines = existsSync(logPath)
        ? readFileSync(logPath, 'utf8').trim().split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Record<string, unknown>)
        : [];
      const head = (lines[0] ?? {}) as { argv?: string[]; cwd?: string };
      return {
        argv: head.argv ?? [],
        cwd: head.cwd ?? '',
        stdin: lines.slice(1).map((line) => String(line['stdin'])),
      };
    },
  };
}

async function identityFor(executor: AgyPlannerExecutor, commandId: string): Promise<PlannerIdentityWire> {
  return executor.attest({ commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } });
}

function evidenceOf(gatewayDirectory: string): Record<string, unknown>[] {
  const directory = join(gatewayDirectory, 'planner-evidence');
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')) as Record<string, unknown>);
}

describe('the command line', () => {
  it('is sudo -n -u <planner user> -- <agy> and exactly the pinned arguments, in plan mode', () => {
    const { executor } = harness({ mode: 'ok' });
    assert.deepEqual(executor.commandLine(), [
      '/usr/bin/sudo',
      '-n',
      '-u',
      'buildroom-planner',
      '--',
      '/opt/agy/bin/agy',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--model',
      'gemini-4-argon-high',
      '--effort',
      'high',
      '--mode',
      'plan',
      '--sandbox',
      '--disable-slash-commands',
      '--print-timeout',
      '900s',
    ]);
    for (const banned of BANNED_AGY_ARGUMENTS) assert.ok(!PINNED_AGY_ARGUMENTS.includes(banned), banned);
    assert.ok(Object.isFrozen(PINNED_AGY_ARGUMENTS));
  });

  it('passes agy 1.4.7\'s own argument rules, which the fake enforces', async () => {
    // The fake refuses what agy refuses: a bare --print, and --print taking a flag as its prompt.
    const exitOf = (args: string[]): Promise<{ code: number | null; out: string }> =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [FAKE_AGY, '--', '/opt/agy/bin/agy', ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FAKE_AGY_MODE: 'ok' } });
        let out = '';
        child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
        child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString()));
        child.on('close', (code) => resolve({ code, out }));
      });
    const leading = await exitOf(['--print', ...PINNED_AGY_ARGUMENTS]);
    assert.equal(leading.code, 2);
    assert.match(leading.out, /took "--input-format" as its prompt/);
    const trailing = await exitOf([...PINNED_AGY_ARGUMENTS, '--print']);
    assert.equal(trailing.code, 2);
    assert.match(trailing.out, /flag needs an argument: -print/);
    assert.ok(!PINNED_AGY_ARGUMENTS.includes('--print'));
  });

  it('reaps through exactly the second privilege rule: pkill -KILL -u, as the planner user', () => {
    const { executor } = harness({ mode: 'ok' });
    assert.deepEqual(executor.reapCommandLine(), ['/usr/bin/sudo', '-n', '-u', 'buildroom-planner', '--', '/usr/bin/pkill', '-KILL', '-u', 'buildroom-planner']);
  });

  it('refuses a relative path, a malformed user name or a malformed hash', () => {
    const base = { sudoPath: '/usr/bin/sudo', plannerUser: 'buildroom-planner', agyPath: '/opt/agy', agySha256: AGY_HASH, checkoutParent: '/tmp', gatewayDirectory: '/tmp' };
    assert.throws(() => new AgyPlannerExecutor({ ...base, agyPath: 'agy' }));
    assert.throws(() => new AgyPlannerExecutor({ ...base, plannerUser: 'root; rm' }));
    assert.throws(() => new AgyPlannerExecutor({ ...base, agySha256: 'E'.repeat(64) }));
    assert.throws(() => new AgyPlannerExecutor({ ...base, agySha256: '' }));
  });

  it('hashes a file as sha256sum does', async () => {
    const root = temporary('buildroom-agy-hash-');
    const file = join(root, 'agy');
    writeFileSync(file, 'agy 1.4.7\n');
    assert.equal(await sha256OfFile(file), createHash('sha256').update('agy 1.4.7\n').digest('hex'));
  });
});

describe('attest', () => {
  it('answers for the architect seat on the bound lane and starts nothing', async () => {
    const h = harness({ mode: 'ok' });
    const identity = await identityFor(h.executor, uuid());
    assert.equal(identity.role, 'architect');
    assert.equal(identity.surface, 'antigravity');
    assert.equal(identity.provider, 'google');
    assert.equal(identity.model, 'gemini-4-argon');
    assert.equal(identity.effort, 'high');
    assert.equal(h.launches, 0);
  });

  it('refuses another seat or route', async () => {
    const h = harness({ mode: 'ok' });
    await assert.rejects(h.executor.attest({ commandId: uuid(), role: 'builder', intended: { ...AGY_PLANNER_ROUTE } }));
    for (const intended of [
      { ...AGY_PLANNER_ROUTE, model: 'gemini-3.8-flash' },
      { ...AGY_PLANNER_ROUTE, provider: 'anthropic' },
      { ...AGY_PLANNER_ROUTE, executionSurface: 'claude-code' },
    ]) {
      await assert.rejects(h.executor.attest({ commandId: uuid(), role: 'architect', intended }));
    }
    assert.equal(h.launches, 0);
  });
});

describe('start: the init gate', () => {
  it('sends the work after init names gemini-4-argon-high, and returns the plan', async () => {
    const w = work();
    const plan = readyPlanFor({ ...w, revision: undefined } as never);
    const h = harness({ mode: 'ok', plan });
    const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
    assert.equal(started.kind, 'accepted');
    if (started.kind !== 'accepted') return;
    assert.deepEqual(started.observed, AGY_PLANNER_ROUTE);
    const result = await started.completion;
    assert.deepEqual(result, { kind: 'plan', document: plan });
    assert.equal(judgePlanDoc(plan).ok, true);

    const seen = h.seen();
    assert.deepEqual(seen.argv, ['/opt/agy/bin/agy', ...PINNED_AGY_ARGUMENTS]);
    assert.equal(seen.stdin.length, 1, 'exactly one input line');
    const message = JSON.parse(seen.stdin[0] ?? '') as { message: { content: string } };
    assert.match(message.message.content, /Add an uptime field to the health route\./);
    assert.match(message.message.content, /MADVenturesLLC\/example/);
    // The checkout is gone by now; resolve its parent, since macOS reports /var as /private/var.
    const checkout = h.checkouts[0] ?? '';
    assert.equal(seen.cwd, join(realpathSync(dirname(checkout)), basename(checkout)));
    assert.equal(existsSync(h.checkouts[0] ?? ''), false, 'the checkout is removed after the run');

    const [evidence] = evidenceOf(h.gatewayDirectory);
    assert.equal(h.reaps(), 1, 'the planner user is reaped after the run');
    assert.equal(evidence?.['agySha256'], AGY_HASH);
    assert.equal(evidence?.['initModel'], 'gemini-4-argon-high');
    assert.equal(evidence?.['conversationId'], '3b2c7a4c-1bda-46b1-8dc1-44641701df02');
    assert.equal(evidence?.['sent'], true);
    assert.equal(evidence?.['outcome'], 'plan');
  });

  for (const [mode, outcome] of [
    ['wrong_model', 'init_model_mismatch'],
    ['auto', 'init_model_mismatch'],
    ['not_init', 'first_event_not_init'],
    ['garbage', 'no_init_event'],
    ['stdin_first', 'no_init_event'],
  ] as const) {
    it(`answers not_sent and writes nothing to agy when ${mode}`, async () => {
      const w = work();
      const h = harness({ mode, timings: { initTimeoutMs: 1_500 } });
      const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
      assert.deepEqual(started, { kind: 'not_sent' });
      assert.equal(h.launches, 1);
      assert.deepEqual(h.seen().stdin, [], 'nothing was written to agy');
      assert.equal(h.reaps(), 1, 'the planner user is reaped after a refused run too');
      assert.equal(existsSync(h.checkouts[0] ?? ''), false);
      const [evidence] = evidenceOf(h.gatewayDirectory);
      assert.equal(evidence?.['sent'], false);
      assert.equal(evidence?.['outcome'], outcome);
    });
  }
});

describe('start: a run that fails after the work is sent', () => {
  for (const mode of ['switch', 'error', 'unparseable', 'exit', 'hang'] as const) {
    it(`fails the run when ${mode}`, async () => {
      const w = work();
      const h = harness({ mode, plan: readyPlanFor({ ...w } as never), timings: { runTimeoutMs: 1_500 } });
      const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
      assert.equal(started.kind, 'accepted');
      if (started.kind !== 'accepted') return;
      await assert.rejects(started.completion);
      assert.equal(h.seen().stdin.length, 1);
      assert.equal(existsSync(h.checkouts[0] ?? ''), false);
      const [evidence] = evidenceOf(h.gatewayDirectory);
      assert.equal(evidence?.['sent'], true);
      assert.notEqual(evidence?.['outcome'], 'plan');
    });
  }

  it('reads a plan from a fenced JSON answer', async () => {
    const w = work();
    const plan = readyPlanFor({ ...w } as never);
    const h = harness({ mode: 'fenced', plan });
    const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
    assert.equal(started.kind, 'accepted');
    if (started.kind === 'accepted') assert.deepEqual(await started.completion, { kind: 'plan', document: plan });
    assert.deepEqual(planDocumentFrom('```json\n{"a":1}\n```'), { a: 1 });
    assert.throws(() => planDocumentFrom('plan: {"a":1}'));
  });
});

describe('start: refused before agy starts', () => {
  it('when the agy copy\'s hash is not the recorded one', async () => {
    const w = work();
    const h = harness({ mode: 'ok', hashFile: () => Promise.resolve('f'.repeat(64)) });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
    const [evidence] = evidenceOf(h.gatewayDirectory);
    assert.equal(evidence?.['outcome'], 'agy_hash_mismatch');
    assert.equal(evidence?.['agySha256'], 'f'.repeat(64));
  });

  it('when the agy copy cannot be read', async () => {
    const w = work();
    const h = harness({ mode: 'ok', hashFile: () => Promise.reject(new Error('ENOENT')) });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
    assert.equal(evidenceOf(h.gatewayDirectory)[0]?.['outcome'], 'agy_hash_failed');
  });

  it('when a planner-user process is still running', async () => {
    const w = work();
    const h = harness({ mode: 'ok', probe: () => Promise.resolve(true) });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
    assert.equal(evidenceOf(h.gatewayDirectory)[0]?.['outcome'], 'planner_user_has_processes');
  });

  it('when the probe fails', async () => {
    const w = work();
    const h = harness({ mode: 'ok', probe: () => Promise.reject(new Error('pgrep missing')) });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
  });

  it('when the checkout fails', async () => {
    const w = work();
    const h = harness({ mode: 'ok', checkout: () => Promise.reject(new Error('fetch failed')) });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
  });

  it('when the work names no checkoutable repository or commit', async () => {
    const h = harness({ mode: 'ok' });
    for (const w of [work({ repository: '../etc' }), work({ baseSha: 'main' })]) {
      assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    }
    assert.equal(h.launches, 0);
  });

  it('when the identity is not the lane', async () => {
    const w = work();
    const h = harness({ mode: 'ok' });
    const identity = { ...(await identityFor(h.executor, w.commandId)), model: 'gemini-3.8-flash' };
    assert.deepEqual(await h.executor.start(w, identity), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
  });

  it('when another run is in flight', async () => {
    const first = work();
    const h = harness({ mode: 'hang', timings: { runTimeoutMs: 2_000 } });
    const running = await h.executor.start(first, await identityFor(h.executor, first.commandId));
    assert.equal(running.kind, 'accepted');
    const second = work();
    assert.deepEqual(await h.executor.start(second, await identityFor(h.executor, second.commandId)), { kind: 'not_sent' });
    if (running.kind === 'accepted') await assert.rejects(running.completion);
    assert.equal(h.launches, 1);
  });
});

describe('the checkout', () => {
  it('is made read-only without following a symbolic link, and removed', async () => {
    const root = temporary('buildroom-agy-tree-');
    const outside = join(root, 'secret');
    writeFileSync(outside, 'key');
    chmodSync(outside, 0o600);
    const tree = join(root, 'run');
    mkdirSync(join(tree, 'src'), { recursive: true });
    writeFileSync(join(tree, 'src', 'a.ts'), 'export {};');
    symlinkSync(outside, join(tree, 'src', 'link'));
    symlinkSync(root, join(tree, 'up'));
    await readOnly(tree);
    assert.equal(statSync(outside).mode & 0o777, 0o600, 'the outside file is untouched');
    assert.equal(statSync(root).mode & 0o200, 0o200, 'the outside directory is untouched');
    assert.equal(statSync(join(tree, 'src', 'a.ts')).mode & 0o777, 0o444);
    assert.equal(statSync(join(tree, 'src')).mode & 0o777, 0o555);
    assert.equal(statSync(tree).mode & 0o777, 0o555);
    assert.ok(lstatSync(join(tree, 'src', 'link')).isSymbolicLink());
    await removeCheckout(tree);
    assert.equal(existsSync(tree), false);
    assert.equal(readFileSync(outside, 'utf8'), 'key', 'removal follows no link either');
  });
});

describe('the worker drives the executor', () => {
  it('attest, execute, then status finished with the plan', async () => {
    const w = work();
    const plan = readyPlanFor({ ...w } as never);
    const h = harness({ mode: 'ok', plan });
    const worker = new GatewayPlannerWorker({ executor: h.executor, records: new PlannerRecordStore(temporary('buildroom-agy-records-')) });
    const attested = await worker.handle({ requestId: uuid(), kind: 'attest', commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } });
    assert.equal(attested?.kind, 'attested');
    if (attested?.kind !== 'attested') return;
    const accepted = await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: attested.identity.executionId, work: w });
    assert.deepEqual(accepted, { kind: 'accepted', observed: AGY_PLANNER_ROUTE });
    await worker.settled();
    const status = await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId });
    assert.deepEqual(status, { kind: 'finished', executionId: attested.identity.executionId, observed: AGY_PLANNER_ROUTE, result: { kind: 'plan', document: plan } });
  });
});

describe('the daemon selects the executor', () => {
  const env = {
    BUILDROOM_PLANNER_EXECUTOR: 'agy',
    BUILDROOM_PLANNER_USER: 'buildroom-planner',
    BUILDROOM_PLANNER_AGY: '/opt/agy/bin/agy',
    BUILDROOM_PLANNER_AGY_SHA256: 'e'.repeat(64),
    BUILDROOM_PLANNER_CHECKOUTS: '/var/lib/buildroom-planner/checkouts',
  };
  const context = { env, platform: 'linux' as const, gatewayId: AGY_PLANNER_GATEWAY_ID, gatewayDirectory: '/tmp/gateway' };

  it('only on Linux, on Gateway 1880c12d, with every setting', () => {
    const chosen = choosePlannerExecutor(context);
    assert.equal(chosen.kind, 'agy');
    if (chosen.kind === 'agy') assert.equal(chosen.commandLine[3], 'buildroom-planner');
  });

  it('not at all when the variable is unset', () => {
    assert.deepEqual(choosePlannerExecutor({ ...context, env: {} }), { kind: 'none' });
  });

  it('refused elsewhere, or with a setting missing', () => {
    assert.equal(choosePlannerExecutor({ ...context, platform: 'darwin' }).kind, 'refused');
    assert.equal(choosePlannerExecutor({ ...context, gatewayId: '2222132d-0000-4000-8000-000000000000' }).kind, 'refused');
    assert.equal(choosePlannerExecutor({ ...context, gatewayId: null }).kind, 'refused');
    assert.equal(choosePlannerExecutor({ ...context, env: { ...env, BUILDROOM_PLANNER_EXECUTOR: 'claude-code' } }).kind, 'refused');
    assert.equal(choosePlannerExecutor({ ...context, env: { ...env, BUILDROOM_PLANNER_AGY: undefined } }).kind, 'refused');
    assert.equal(choosePlannerExecutor({ ...context, env: { ...env, BUILDROOM_PLANNER_AGY: 'agy' } }).kind, 'refused');
    assert.equal(choosePlannerExecutor({ ...context, env: { ...env, BUILDROOM_PLANNER_AGY_SHA256: undefined } }).kind, 'refused');
    assert.equal(choosePlannerExecutor({ ...context, env: { ...env, BUILDROOM_PLANNER_AGY_SHA256: 'not-a-hash' } }).kind, 'refused');
  });
});
