/**
 * The Planner's agy executor against a fake agy
 * (FOUNDER-RULING-20261026-BR-PLANNER-EXECUTOR, C1 second step: "tests
 * against a fake agy"). No provider, network or second user is involved:
 * the fake stands in for agy, and the test stands in for `sudo` and for the
 * second privilege rule, so the whole command line the first rule must
 * match reaches the fake.
 *
 * What is proven:
 *   - the command line is `sudo -n -u <planner user> -- <agy>` and exactly
 *     the arguments Amendment 3 B1(a) fixes, none of Amendment 1 C4's banned
 *     flags among them, in plan mode; the reap is exactly rule B1(b);
 *   - `attest` answers only for the architect seat on the bound lane, and
 *     starts nothing; a recorded attestation is answered again only while
 *     the daemon still holds Gateway 1880c12d's identity; the identity
 *     check (`boundGatewayReader`) answers the Gateway only while the id held
 *     in memory and the one on disk agree, reading memory after the file, so
 *     a promotion that adopts while the file read is pending answers null;
 *     `start` asks again after agy's init and after the running record is
 *     written, the last time with nothing awaited before the input is
 *     written, so a change at either point sends nothing (shown for a
 *     change at launch and one during the record's write);
 *   - the work is written to agy only after its `init` event names
 *     `gemini-4-argon-high` (Amendment 1 B2). A wrong model, `auto`, a first
 *     line that is not `init` or not JSON, and an agy that waits for its input
 *     before saying which model it serves, and an init with no conversation
 *     id or an empty one, all end in `not_sent`, with nothing written to agy's
 *     input;
 *   - a later event naming another model, at any depth, an agy error, an
 *     answer that is not JSON, an agy that exits without a result, and a run
 *     past its time all fail the run;
 *   - a leftover planner-user process, a probe that fails, a hash that is
 *     not the recorded one, a checkout that fails, a busy executor and an
 *     identity off the lane all refuse with `not_sent` before agy is started;
 *     the leftover process and the failed probe also halt;
 *   - ending a run never waits on agy's output pipes: an agy that ignores
 *     SIGTERM and leaves a process holding them is still reaped, and an exit
 *     not seen in time is reaped and halts (Amendment 3 C1);
 *   - a process surviving the reap, a check that cannot be made after it, a
 *     checkout left behind and an evidence record that cannot be written or
 *     read all halt, and only removing the halt file restarts the executor;
 *     the halt marker is synced and then its directory, so the halt is still
 *     there after a crash, and a marker that cannot be made durable keeps
 *     this process halted even once the file is gone, and is written again
 *     in full (a new file, synced, renamed, its directory synced) before the
 *     next start, never synced again; a marker an earlier process left is
 *     written again in full at boot the same way, a failure there holding
 *     the halt in memory, and one that is not a regular file is replaced by
 *     a marker saying so, never read or written through;
 *   - each run's checkout is agy's working directory and is removed after;
 *     making it read-only follows no symbolic link, so a link in a hostile
 *     tree cannot change the mode of a file outside it;
 *   - the evidence record carries the init model, conversation id, agy copy
 *     hash and checkout removal, and is written before the work is sent: the
 *     file is synced, renamed, and its directory synced (and the gateway
 *     directory too when the evidence directory is new, and every directory
 *     the same mkdir made) before the input line, and a sync that fails
 *     sends nothing and halts; after an evidence write fails, at any step,
 *     no record is read or written again in this process: `sent` answers
 *     that it cannot say, and every start rejects; at boot each record is
 *     written again in full, never synced again, and then their directory and
 *     the Gateway's are synced, before any is read, and a step that fails
 *     there halts the same way. The directory
 *     syncs are shown through an injected sync, and the file's own sync by
 *     recording the real fsyncs by inode; that the disk keeps what was synced
 *     across a power loss is the kernel's, not shown here. A command whose
 *     record says its work was sent, by this process or one a crash ended, is
 *     never started again: `start` rejects, and the record stands, whatever
 *     refuses the start, because every refusal reads the record before it
 *     writes (shown for each refusal before launch; that the read and the
 *     write are one step in the executor's evidence queue is read, not
 *     raced); a second start of the command whose start is under way is
 *     rejected, not refused, before any other check and before anything is
 *     awaited, so two starts of one command that arrive together cannot
 *     both pass, nothing is written over the start in flight and no
 *     not_sent is answered for it, whatever else would have refused it; a record that cannot be read, or lacks `sent`, halts, at a
 *     start, at boot, and when the worker asks; an earlier refusal lets a
 *     retry through. Once the running record has been attempted, `not_sent`
 *     is answered only when the record then says so: a downgrade that
 *     cannot be written or made durable rejects instead, as the running
 *     record's own failed write does; a run whose closing record cannot be
 *     written rejects its completion rather than deliver a result its record
 *     contradicts; a link to nowhere at a record's path is a record that
 *     cannot be read, and so is a path whose existence check itself fails:
 *     only a confirmed absence is no record; a halt raised since the start began is seen again
 *     after the running record, before the input. A
 *     record still running at boot is closed in place, and only one that is
 *     at its command's own path, so a stray file naming a command never
 *     writes over that command's record; boot reaps even when an
 *     evidence record or a worker record cannot be read, and
 *     `GatewayDaemon.boot` boots the Planner even when the lanes' recovery
 *     rejects (shown with the recovery step replaced by hand to reject);
 *   - the executor's `shutdown` cancels a start before launch, while agy
 *     announces its model, while the running record is written, or while agy
 *     works; `GatewayDaemon.stop`
 *     calls it before waiting for a tick in flight (shown with a tick held
 *     open by hand, not by a running daemon), and waits for a boot under way
 *     to finish, its reap and check included, before stopping;
 *   - `childEnvironment()` and `runChild()` give the allowlisted environment,
 *     never the daemon's. The production launch passes `childEnvironment()`
 *     to `spawn`, but every test injects its own launch, so that call is read,
 *     not run;
 *   - the worker drives the executor end to end: attest, execute, status;
 *     its records are synced, file then directory, and `execute`'s
 *     write-ahead `starting` record is on disk, synced, before the executor
 *     is asked; a worker record that a crash left at `attested` beside
 *     evidence that says the work was sent gets no second run, and the
 *     worker answers nothing for it: `not_sent` and `never_received` are
 *     affirmed only while the executor's record agrees, and a record that
 *     says sent, or cannot be read, gets no answer from `status` or
 *     `execute`, the executor's own `not_sent` answer included, and no
 *     attestation from `attest`; the worker's records are read and written
 *     in order, so a read never sees a record whose directory entry is not
 *     yet synced; a write that fails at any step closes the store for the
 *     rest of the process, so no read, write or `all` answers from it, the
 *     failed sync never being tried again; a store opened afresh, as after a
 *     restart, writes each of its records again in full, never syncing an
 *     earlier process's file again, then syncs its directory and the
 *     Gateway's, before anything else; a `running` record whose write fails does not stop the
 *     `finished` one; a `finished` record that cannot be written is never
 *     answered as running, only as nothing until it can be; a torn worker
 *     record is answered as nothing, not thrown out of the tick; at boot a
 *     `starting` record whose work the executor's record proves never sent
 *     becomes `not_sent`, not `lost`;
 *   - `choosePlannerExecutor` selects the executor only on Linux, on Gateway
 *     1880c12d, with every setting present. That is the factory alone: no
 *     test here starts `main.ts`, so its wiring of the factory is read, not
 *     run.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, open as openFile, type FileHandle } from 'node:fs/promises';
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
  plannerRecordsDirectory,
  boundGatewayReader,
  choosePlannerExecutor,
  ControlPlaneClient,
  Custody,
  GatewayDaemon,
  gatewayPaths,
  planDocumentFrom,
  childEnvironment,
  modelsNamed,
  runChild,
  sha256OfFile,
  readOnly,
  recordAbsence,
  removeCheckout,
  syncDirectory,
  syncMadeDirectories,
  type AgyPlannerDeps,
  type Launch,
  type PlannerExecutor,
  type PlannerRecord,
} from '../packages/gateway-daemon/src/index.js';
import type { PlannerIdentityWire, PlannerResultWire, PlannerWorkWire } from '../packages/gateway-protocol/src/index.js';
import { judgePlanDoc } from '../packages/control-plane/src/plan-doc.js';
import { readyPlanFor } from './support/synthetic-planner.js';
import { uuid } from './gateway-helpers.js';
import { FileKeychainRunner } from './fake-keychain.js';

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
  /** Every line the executor logged, by its `at`. */
  readonly logged: string[];
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
  currentGatewayId?: AgyPlannerDeps['currentGatewayId'];
  heldGatewayId?: AgyPlannerDeps['heldGatewayId'];
  syncDirectory?: AgyPlannerDeps['syncDirectory'];
  removeCheckout?: AgyPlannerDeps['removeCheckout'];
  /** Stands in for the second privilege rule; the count is kept either way. */
  reap?: () => Promise<void>;
  /** Sees each launched child, for cases that must interfere with it. */
  onLaunch?: (child: ReturnType<Launch>) => void;
}): Harness {
  const root = temporary('buildroom-agy-');
  const logPath = join(root, 'fake.log');
  const gatewayDirectory = join(root, 'gateway');
  const checkoutParent = join(root, 'checkouts');
  mkdirSync(checkoutParent);
  const checkouts: string[] = [];
  const state = { launches: 0, reaps: 0 };
  const logged: string[] = [];
  const launch: Launch = (file, args, launchOptions) => {
    state.launches += 1;
    assert.equal(file, '/usr/bin/sudo');
    const child = spawn(process.execPath, [FAKE_AGY, ...args], {
      cwd: launchOptions.cwd,
      stdio: 'pipe',
      env: {
        ...process.env,
        FAKE_AGY_MODE: options.mode,
        FAKE_AGY_LOG: logPath,
        FAKE_AGY_PLAN: JSON.stringify(options.plan ?? {}),
      },
    });
    options.onLaunch?.(child);
    return child;
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
        return options.reap?.() ?? Promise.resolve();
      },
      log: (_level, at) => {
        logged.push(at);
      },
      ...(options.removeCheckout === undefined ? {} : { removeCheckout: options.removeCheckout }),
      hashFile: options.hashFile ?? (() => Promise.resolve(AGY_HASH)),
      ...(options.currentGatewayId === undefined ? {} : { currentGatewayId: options.currentGatewayId }),
      ...(options.heldGatewayId === undefined ? {} : { heldGatewayId: options.heldGatewayId }),
      ...(options.syncDirectory === undefined ? {} : { syncDirectory: options.syncDirectory }),
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
    logged,
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

function haltReason(gatewayDirectory: string): string | null {
  const file = join(gatewayDirectory, 'planner-halted.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { reason: string }).reason : null;
}

function evidenceName(commandId: string): string {
  return `${createHash('sha256').update(commandId, 'utf8').digest('hex')}.json`;
}

function evidenceOf(gatewayDirectory: string): Record<string, unknown>[] {
  const directory = join(gatewayDirectory, 'planner-evidence');
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')) as Record<string, unknown>);
}

interface SyncSeen {
  readonly directory: boolean;
  readonly ino: number;
}

/**
 * Records every `FileHandle.sync()` made until `stop`: the real fsyncs the
 * code makes, file or directory, by inode, so a test can say which file was
 * synced and whether its directory was synced after it. A rename keeps the
 * inode, so a record's file is found by the inode at its final path.
 */
async function startRecordingSyncs(): Promise<{ readonly syncs: SyncSeen[]; stop: () => void }> {
  const probe = await openFile(FAKE_AGY, 'r');
  const prototype = Object.getPrototypeOf(probe) as unknown as { sync: (this: FileHandle) => Promise<void> };
  await probe.close();
  const original = prototype.sync;
  const syncs: SyncSeen[] = [];
  prototype.sync = async function (this: FileHandle): Promise<void> {
    const info = await this.stat();
    syncs.push({ directory: info.isDirectory(), ino: info.ino });
    return original.call(this);
  };
  return {
    syncs,
    stop: () => {
      prototype.sync = original;
    },
  };
}

/** `index` of the sync of this inode, a directory or not, after position `from`. */
function syncAt(syncs: readonly SyncSeen[], ino: number, directory: boolean, from = -1): number {
  return syncs.findIndex((seen, index) => index > from && seen.directory === directory && seen.ino === ino);
}

/** An evidence record as boot leaves one whose work was sent, with `fields` over it. */
function evidenceLine(commandId: string, executionId: string, fields: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    commandId,
    executionId,
    startedAt: '2026-10-27T00:00:00.000Z',
    agySha256: AGY_HASH,
    initModel: 'gemini-4-argon-high',
    conversationId: '3b2c7a4c-1bda-46b1-8dc1-44641701df02',
    sent: true,
    endedAt: '2026-10-27T00:00:01.000Z',
    outcome: 'daemon_ended_during_run',
    exitCode: null,
    signal: null,
    checkoutRemoved: null,
    ...fields,
  })}\n`;
}

/** Puts `line` where the command's evidence record goes, and returns that path. */
function placeEvidence(h: Harness, commandId: string, line: string): string {
  mkdirSync(join(h.gatewayDirectory, 'planner-evidence'), { recursive: true });
  const path = join(h.gatewayDirectory, 'planner-evidence', evidenceName(commandId));
  writeFileSync(path, line);
  return path;
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
    ['no_conversation', 'init_missing_conversation_id'],
    ['empty_conversation', 'init_missing_conversation_id'],
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

  it('when a planner-user process is still running, and then halts', async () => {
    const w = work();
    const h = harness({ mode: 'ok', probe: () => Promise.resolve(true) });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
    assert.equal(evidenceOf(h.gatewayDirectory)[0]?.['outcome'], 'planner_user_has_processes');
    assert.ok(existsSync(join(h.gatewayDirectory, 'planner-halted.json')), 'the executor halts');
  });

  it('when the probe fails, and then halts', async () => {
    const w = work();
    const h = harness({ mode: 'ok', probe: () => Promise.reject(new Error('pgrep missing')) });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
    assert.equal(haltReason(h.gatewayDirectory), 'planner_user_check_failed_before_start', 'a check that cannot be made halts');
  });

  it('when the checkout fails, recording the hash it had already read', async () => {
    const w = work();
    const h = harness({ mode: 'ok', checkout: () => Promise.reject(new Error('fetch failed')) });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
    const [evidence] = evidenceOf(h.gatewayDirectory);
    assert.equal(evidence?.['outcome'], 'checkout_failed');
    assert.equal(evidence?.['agySha256'], AGY_HASH);
  });

  it('when the execution id is not one attest would issue', async () => {
    const h = harness({ mode: 'ok' });
    const w = work();
    const attested = await identityFor(h.executor, w.commandId);
    for (const executionId of ['', 'not-a-uuid', 'A'.repeat(36)]) {
      assert.deepEqual(await h.executor.start(w, { ...attested, executionId }), { kind: 'not_sent' });
    }
    assert.equal(h.launches, 0);
  });

  it('when the daemon no longer holds Gateway 1880c12d\'s identity, or cannot say', async () => {
    const other = harness({ mode: 'ok', currentGatewayId: () => Promise.resolve('2222132d-0000-4000-8000-000000000000') });
    const w = work();
    await assert.rejects(other.executor.attest({ commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } }));
    const identity = await harness({ mode: 'ok' }).executor.attest({ commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } });
    assert.deepEqual(await other.executor.start(w, identity), { kind: 'not_sent' });
    assert.equal(other.launches, 0);
    assert.equal(evidenceOf(other.gatewayDirectory)[0]?.['outcome'], 'gateway_identity_changed');

    const unreadable = harness({ mode: 'ok', currentGatewayId: () => Promise.reject(new Error('state unreadable')) });
    assert.deepEqual(await unreadable.executor.start(w, identity), { kind: 'not_sent' });
    assert.equal(unreadable.launches, 0);

    const bound = harness({ mode: 'ok', plan: readyPlanFor({ ...w } as never), currentGatewayId: () => Promise.resolve(AGY_PLANNER_GATEWAY_ID) });
    const started = await bound.executor.start(w, await identityFor(bound.executor, w.commandId));
    assert.equal(started.kind, 'accepted');
    if (started.kind === 'accepted') await started.completion;
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

describe('halting (Amendment 3 C1)', () => {
  it('halts when a process survives the reap, and takes no work until the halt file is removed', async () => {
    // Clean before the start, a survivor after the reap, clean again later.
    const answers = [false, true];
    const h = harness({ mode: 'ok', plan: readyPlanFor({ ...work() } as never), probe: () => Promise.resolve(answers.shift() ?? false) });
    const first = work();
    const started = await h.executor.start(first, await identityFor(h.executor, first.commandId));
    assert.equal(started.kind, 'accepted');
    if (started.kind === 'accepted') await started.completion.catch(() => undefined);
    const haltFile = join(h.gatewayDirectory, 'planner-halted.json');
    assert.ok(existsSync(haltFile));
    assert.equal((JSON.parse(readFileSync(haltFile, 'utf8')) as { reason: string }).reason, 'planner_user_survived_reap');

    const second = work();
    assert.deepEqual(await h.executor.start(second, await identityFor(h.executor, second.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 1, 'nothing starts while halted');
    assert.equal(evidenceOf(h.gatewayDirectory).find((e) => e['commandId'] === second.commandId)?.['outcome'], 'executor_halted');

    rmSync(haltFile);
    const third = work();
    const resumed = await h.executor.start(third, await identityFor(h.executor, third.commandId));
    assert.equal(resumed.kind, 'accepted', 'the Founder removing the file restarts it');
    if (resumed.kind === 'accepted') await resumed.completion.catch(() => undefined);
  });

  it('never writes the halt marker through a link already at its path', async () => {
    const h = harness({ mode: 'ok', probe: () => Promise.resolve(true) });
    mkdirSync(h.gatewayDirectory, { recursive: true });
    const outside = join(temporary('buildroom-agy-outside-'), 'target');
    writeFileSync(outside, 'untouched');
    symlinkSync(outside, join(h.gatewayDirectory, 'planner-halted.json'));
    const w = work();
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.equal(readFileSync(outside, 'utf8'), 'untouched');
    const again = work();
    assert.deepEqual(await h.executor.start(again, await identityFor(h.executor, again.commandId)), { kind: 'not_sent' });
    assert.equal(evidenceOf(h.gatewayDirectory).find((e) => e['commandId'] === again.commandId)?.['outcome'], 'executor_halted');
  });

  it('halts when the check after the reap cannot be made', async () => {
    const answers: (boolean | Error)[] = [false, new Error('pgrep missing')];
    const h = harness({
      mode: 'ok',
      probe: () => {
        const next = answers.shift() ?? false;
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
      },
    });
    const w = work();
    const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
    if (started.kind === 'accepted') await started.completion.catch(() => undefined);
    assert.ok(existsSync(join(h.gatewayDirectory, 'planner-halted.json')));
  });
});

describe('the daemon starting and stopping (Amendment 3 C2)', () => {
  it('boot reaps and checks before any work, and halts on a survivor', async () => {
    const clean = harness({ mode: 'ok' });
    await clean.executor.boot();
    assert.equal(clean.reaps(), 1);
    assert.equal(existsSync(join(clean.gatewayDirectory, 'planner-halted.json')), false);

    const dirty = harness({ mode: 'ok', probe: () => Promise.resolve(true) });
    await dirty.executor.boot();
    assert.equal(dirty.reaps(), 1);
    assert.ok(existsSync(join(dirty.gatewayDirectory, 'planner-halted.json')));
  });

  it('shutdown cancels the run in flight: agy is ended, the user reaped, the checkout removed', async () => {
    const h = harness({ mode: 'hang', timings: { runTimeoutMs: 60_000 } });
    const w = work();
    const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
    assert.equal(started.kind, 'accepted');
    const begun = Date.now();
    await h.executor.shutdown();
    assert.ok(Date.now() - begun < 30_000, 'shutdown does not wait out the run');
    if (started.kind === 'accepted') await assert.rejects(started.completion);
    assert.equal(h.reaps(), 1);
    assert.equal(existsSync(h.checkouts[0] ?? ''), false);
    await h.executor.shutdown(); // nothing in flight: a no-op
  });

  it('the worker hands boot and shutdown to the executor', async () => {
    const h = harness({ mode: 'hang', timings: { runTimeoutMs: 60_000 } });
    const worker = new GatewayPlannerWorker({ executor: h.executor, records: new PlannerRecordStore(temporary('buildroom-agy-records-')) });
    await worker.boot();
    assert.equal(h.reaps(), 1);
    const w = work();
    const attested = await worker.handle({ requestId: uuid(), kind: 'attest', commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } });
    if (attested?.kind !== 'attested') return assert.fail('not attested');
    await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: attested.identity.executionId, work: w });
    await worker.shutdown();
    assert.equal(h.reaps(), 2);
    const status = await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId });
    assert.equal(status?.kind, 'finished');
    if (status?.kind === 'finished') assert.deepEqual(status.result, { kind: 'failed' });
  });
});

describe('evidence at boot (act B4)', () => {
  it('closes a record still marked running, and leaves finished ones alone', async () => {
    const h = harness({ mode: 'ok' });
    const directory = join(h.gatewayDirectory, 'planner-evidence');
    mkdirSync(directory, { recursive: true });
    const base = { executionId: uuid(), startedAt: '2026-10-27T00:00:00.000Z', agySha256: AGY_HASH, initModel: 'gemini-4-argon-high', conversationId: 'c', sent: true, exitCode: null, signal: null, checkoutRemoved: null };
    const running = uuid();
    const done = uuid();
    // Named as the executor names them, so the boot rewrites the running record in place.
    writeFileSync(join(directory, evidenceName(running)), `${JSON.stringify({ ...base, commandId: running, endedAt: null, outcome: 'running' })}\n`);
    const doneRecord = `${JSON.stringify({ ...base, commandId: done, endedAt: '2026-10-27T00:01:00.000Z', outcome: 'plan' })}\n`;
    writeFileSync(join(directory, evidenceName(done)), doneRecord);
    await h.executor.boot();
    assert.deepEqual(readdirSync(directory).sort(), [evidenceName(running), evidenceName(done)].sort(), 'exactly the two records, no copy beside them');
    const closed = JSON.parse(readFileSync(join(directory, evidenceName(running)), 'utf8')) as Record<string, unknown>;
    assert.equal(closed['outcome'], 'daemon_ended_during_run');
    assert.match(String(closed['endedAt']), /^\d{4}-\d\d-\d\dT/);
    assert.equal(readFileSync(join(directory, evidenceName(done)), 'utf8'), doneRecord, 'a finished record is left byte for byte');
    assert.ok(h.logged.includes('agy.evidence_closed_at_boot'));
    assert.equal(haltReason(h.gatewayDirectory), null);
  });

  it('halts, and does not report the record closed, when it cannot be rewritten', async () => {
    // Boot's own sync of the directory passes; the rewrite's directory sync fails, so the
    // closing record cannot be made durable.
    let evidenceSyncs = 0;
    const h = harness({
      mode: 'ok',
      syncDirectory: (path) => {
        if (basename(path) !== 'planner-evidence') return syncDirectory(path);
        evidenceSyncs += 1;
        return evidenceSyncs === 1 ? syncDirectory(path) : Promise.reject(new Error('EIO'));
      },
    });
    const commandId = uuid();
    placeEvidence(h, commandId, evidenceLine(commandId, uuid(), { outcome: 'running', endedAt: null }));
    await h.executor.boot();
    assert.ok(!h.logged.includes('agy.evidence_closed_at_boot'));
    assert.equal(haltReason(h.gatewayDirectory), 'evidence_write_failed');
    assert.equal(h.reaps(), 1);
  });

  it('halts when a record cannot be read', async () => {
    const h = harness({ mode: 'ok' });
    const directory = join(h.gatewayDirectory, 'planner-evidence');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'torn.json'), '{"commandId":');
    await h.executor.boot();
    assert.equal(haltReason(h.gatewayDirectory), 'evidence_unreadable');
  });
});

describe('the child environment (act B5)', () => {
  const injected = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'injected-by-the-daemon-env', HTTPS_PROXY: 'http://proxy.invalid:9' };

  it('carries only the allowlist and the git isolation, never GIT_*, SSH_* or *_PROXY from the daemon', () => {
    const env = childEnvironment({ ...injected, PATH: '/somewhere/else', LANG: 'C.UTF-8', SSH_AUTH_SOCK: '/tmp/agent', https_proxy: 'x', ALL_PROXY: 'y', HOME: '/home/founder' });
    assert.equal(env['PATH'], '/usr/bin:/bin');
    assert.equal(env['LANG'], 'C.UTF-8');
    for (const name of [...Object.keys(injected), 'SSH_AUTH_SOCK', 'https_proxy', 'ALL_PROXY']) assert.equal(env[name], undefined, name);
    assert.equal(env['GIT_CONFIG_GLOBAL'], '/dev/null');
    // The daemon's HOME never reaches a child: git's HTTP transport would read a ~/.netrc there.
    assert.equal(env['HOME'], '/nonexistent');
    assert.equal(existsSync('/nonexistent'), false);
  });

  it('keeps GIT_CONFIG_COUNT and HTTPS_PROXY in the daemon\'s environment from reaching git', async () => {
    const saved = Object.fromEntries(Object.keys(injected).map((name) => [name, process.env[name]]));
    Object.assign(process.env, injected);
    try {
      const repo = temporary('buildroom-agy-git-');
      // Control: git started with the daemon's own environment does see the injected setting.
      const control = spawnSync('/usr/bin/git', ['config', '--get', 'user.name'], { cwd: repo, env: process.env, encoding: 'utf8' });
      assert.equal(control.stdout.trim(), 'injected-by-the-daemon-env');
      // The executor's children do not.
      assert.equal((await runChild('/usr/bin/git', ['config', '--get', 'user.name'], repo)).code, 1, 'git finds no user.name');
      assert.equal((await runChild('/bin/sh', ['-c', 'test -z "$HTTPS_PROXY" && test -z "$GIT_CONFIG_COUNT"'])).code, 0, 'neither variable is set in the child');
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) Reflect.deleteProperty(process.env, name);
        else process.env[name] = value;
      }
    }
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

describe('ending a run never waits on agy\'s pipes (Amendment 3 C1; Tier-2 B1)', () => {
  it('reaps when agy ignores SIGTERM and a process it started keeps its output open', async () => {
    const w = work();
    const plan = readyPlanFor({ ...w } as never);
    let holder: number | undefined;
    const h = harness({
      mode: 'stubborn',
      plan,
      // The second privilege rule ends what the planner user still runs: here, the holder.
      reap: () => {
        const line = readFileSync(h.logPath, 'utf8').split('\n').find((l) => l.includes('"holder"'));
        holder = line === undefined ? undefined : (JSON.parse(line) as { holder: number }).holder;
        if (holder !== undefined) process.kill(holder, 'SIGKILL');
        return Promise.resolve();
      },
    });
    const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
    assert.equal(started.kind, 'accepted');
    if (started.kind !== 'accepted') return;
    const begun = Date.now();
    assert.deepEqual(await started.completion, { kind: 'plan', document: plan });
    assert.ok(Date.now() - begun < 20_000, 'the end is bounded by the grace, not by the holder');
    assert.ok(holder !== undefined, 'the holder was there to reap');
    assert.equal(h.reaps(), 1);
    assert.equal(haltReason(h.gatewayDirectory), null, 'its exit was seen and nothing survived');
    assert.equal(evidenceOf(h.gatewayDirectory)[0]?.['checkoutRemoved'], true);
  });

  it('still reaps, then halts, when sudo\'s exit is not seen in time', async () => {
    const w = work();
    const children: ReturnType<Launch>[] = [];
    const h = harness({
      mode: 'stubborn',
      plan: readyPlanFor({ ...w } as never),
      // sudo that no signal reaches: the executor's kills land nowhere.
      onLaunch: (child) => {
        children.push(child);
        child.kill = () => true;
      },
      reap: () => {
        for (const child of children) if (child.pid !== undefined) process.kill(child.pid, 'SIGKILL');
        return Promise.resolve();
      },
    });
    const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
    assert.equal(started.kind, 'accepted');
    if (started.kind === 'accepted') await started.completion.catch(() => undefined);
    assert.equal(h.reaps(), 1, 'the reap runs although the exit was not seen');
    assert.equal(haltReason(h.gatewayDirectory), 'agy_exit_unconfirmed');
    const line = readFileSync(h.logPath, 'utf8').split('\n').find((l) => l.includes('"holder"'));
    if (line !== undefined) process.kill((JSON.parse(line) as { holder: number }).holder, 'SIGKILL');
  });
});

describe('the evidence record is durable before the work is sent (Amendment 5 B3; Tier-2 B2)', () => {
  it('sends nothing, halts, and rejects rather than answer not_sent, when the running record cannot be written', async () => {
    const w = work();
    const h = harness({ mode: 'ok', plan: readyPlanFor({ ...w } as never) });
    // The evidence directory is a link to nowhere: nothing can be made in it, even by
    // root, and there is no earlier record for the command to read.
    mkdirSync(h.gatewayDirectory, { recursive: true });
    symlinkSync(join(h.gatewayDirectory, 'nowhere'), join(h.gatewayDirectory, 'planner-evidence'));
    await assert.rejects(h.executor.start(w, await identityFor(h.executor, w.commandId)), /could not be made to say so/);
    assert.equal(h.launches, 1);
    assert.deepEqual(h.seen().stdin, [], 'nothing was written to agy');
    assert.equal(h.reaps(), 1);
    assert.equal(existsSync(h.checkouts[0] ?? ''), false);
    assert.equal(haltReason(h.gatewayDirectory), 'evidence_write_failed');
  });

  it('writes the running record before the input line', async () => {
    const w = work();
    let recordAtSend: Record<string, unknown> | null = null;
    const h = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      onLaunch: (child) => {
        const write = child.stdin.end.bind(child.stdin) as (chunk: string) => void;
        (child.stdin as unknown as { end: (chunk: string) => void }).end = (chunk: string) => {
          const path = join(h.gatewayDirectory, 'planner-evidence', evidenceName(w.commandId));
          recordAtSend = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>) : {};
          write(chunk);
        };
      },
    });
    const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
    if (started.kind === 'accepted') await started.completion;
    assert.equal(recordAtSend?.['outcome'], 'running');
    assert.equal(recordAtSend?.['sent'], true);
    assert.equal(recordAtSend?.['initModel'], 'gemini-4-argon-high');
  });

  it('syncs the running record\'s file before the input line, not only its directory', async () => {
    const w = work();
    const recording = await startRecordingSyncs();
    let fileSyncedAtSend: boolean | null = null;
    try {
      const h: Harness = harness({
        mode: 'ok',
        plan: readyPlanFor({ ...w } as never),
        onLaunch: (child) => {
          const write = child.stdin.end.bind(child.stdin) as (chunk: string) => void;
          (child.stdin as unknown as { end: (chunk: string) => void }).end = (chunk: string) => {
            // The file at the record's path is the one that was synced as a temporary file: a rename keeps the inode.
            const ino = statSync(join(h.gatewayDirectory, 'planner-evidence', evidenceName(w.commandId))).ino;
            fileSyncedAtSend = syncAt(recording.syncs, ino, false) !== -1;
            write(chunk);
          };
        },
      });
      const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
      if (started.kind === 'accepted') await started.completion;
    } finally {
      recording.stop();
    }
    assert.equal(fileSyncedAtSend, true);
  });
});

describe('the checkout is removed, or the executor halts (Amendment 1 C5; Tier-2 B4)', () => {
  it('records the checkout left behind, and halts', async () => {
    const w = work();
    const plan = readyPlanFor({ ...w } as never);
    const h = harness({ mode: 'ok', plan, removeCheckout: () => Promise.reject(new Error('EBUSY')) });
    const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
    assert.equal(started.kind, 'accepted');
    if (started.kind === 'accepted') assert.deepEqual(await started.completion, { kind: 'plan', document: plan });
    assert.equal(evidenceOf(h.gatewayDirectory)[0]?.['checkoutRemoved'], false);
    assert.equal(haltReason(h.gatewayDirectory), 'checkout_not_removed');
  });

  it('removeCheckout succeeds on a path already gone, and checks the path is gone after', async () => {
    await assert.doesNotReject(removeCheckout(join(temporary('buildroom-agy-gone-'), 'never-made')));
    const tree = join(temporary('buildroom-agy-stays-'), 'run');
    mkdirSync(join(tree, 'src'), { recursive: true });
    await readOnly(tree);
    await removeCheckout(tree);
    assert.equal(existsSync(tree), false);
  });
});

describe('a later model cannot hide at any depth (Tier-2 B5)', () => {
  it('fails the run when a step names another model twelve levels deep', async () => {
    const w = work();
    const h = harness({ mode: 'deep_switch', plan: readyPlanFor({ ...w } as never) });
    const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
    assert.equal(started.kind, 'accepted');
    if (started.kind === 'accepted') await assert.rejects(started.completion, /model_switched/);
    assert.equal(evidenceOf(h.gatewayDirectory)[0]?.['outcome'], 'model_switched');
  });

  it('finds a model nested ten thousand levels down', () => {
    let nested: unknown = { model: 'other' };
    for (let level = 0; level < 10_000; level += 1) nested = [{ inner: nested }];
    assert.deepEqual(modelsNamed({ event: 'step_update', step_update: nested }), ['other']);
  });
});

describe('a recorded attestation is answered again only while the executor serves (Tier-2 B6)', () => {
  it('refuses the repeated attest once the daemon holds another identity', async () => {
    let gateway = AGY_PLANNER_GATEWAY_ID;
    const h = harness({ mode: 'ok', currentGatewayId: () => Promise.resolve(gateway) });
    const worker = new GatewayPlannerWorker({ executor: h.executor, records: new PlannerRecordStore(temporary('buildroom-agy-records-')) });
    const w = work();
    const request = { requestId: uuid(), kind: 'attest', commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } } as const;
    const first = await worker.handle(request);
    assert.equal(first?.kind, 'attested');
    const again = await worker.handle({ ...request, requestId: uuid() });
    assert.deepEqual(again, first, 'while bound, the same identity is answered again');
    gateway = '2222132d-0000-4000-8000-000000000000';
    assert.deepEqual(await worker.handle({ ...request, requestId: uuid() }), { kind: 'attest_failed' });
  });
});

describe('the daemon stopping while a start is still preparing (Amendment 3 C2)', () => {
  it('cancels a start that is waiting for agy\'s init: nothing is sent, the user is reaped', async () => {
    const w = work();
    const h = harness({ mode: 'slow_init', timings: { initTimeoutMs: 10_000 } });
    const starting = h.executor.start(w, await identityFor(h.executor, w.commandId));
    while (h.launches === 0) await new Promise((resolve) => setTimeout(resolve, 20));
    await h.executor.shutdown();
    assert.deepEqual(await starting, { kind: 'not_sent' });
    assert.deepEqual(h.seen().stdin, []);
    assert.equal(h.reaps(), 1);
    assert.equal(existsSync(h.checkouts[0] ?? ''), false);
    assert.ok(['no_init_event', 'cancelled_before_send'].includes(String(evidenceOf(h.gatewayDirectory)[0]?.['outcome'])));
    const later = work();
    assert.deepEqual(await h.executor.start(later, await identityFor(h.executor, later.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 1, 'nothing starts after the daemon began to stop');
  });

  it('waits for a start still making its checkout, which then launches nothing', async () => {
    const w = work();
    let made = (): void => undefined;
    const h = harness({
      mode: 'ok',
      checkout: async (_work, parent) => {
        await new Promise<void>((resolve) => (made = resolve));
        return mkdtemp(join(parent, 'run-'));
      },
    });
    const starting = h.executor.start(w, await identityFor(h.executor, w.commandId));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const stopping = h.executor.shutdown();
    made();
    await stopping;
    assert.deepEqual(await starting, { kind: 'not_sent' });
    assert.equal(h.launches, 0);
    assert.equal(evidenceOf(h.gatewayDirectory)[0]?.['outcome'], 'daemon_stopping');
  });
});

describe('the daemon stopping tells the executor before it waits for its tick (Tier-2 N1)', () => {
  it('shutdown reaches the executor while a tick is still in flight', async () => {
    const root = temporary('buildroom-agy-daemon-');
    const events: string[] = [];
    const executor = {
      attest: () => Promise.reject(new Error('unused')),
      start: () => Promise.reject(new Error('unused')),
      shutdown: () => {
        events.push('executor.shutdown');
        return Promise.resolve();
      },
    };
    const daemon = new GatewayDaemon({
      paths: gatewayPaths(join(root, 'gateway')),
      clock: { wallNow: () => Date.now(), monotonicNow: () => 1_000 },
      custody: new Custody(new FileKeychainRunner(join(root, 'keychain'))),
      client: new ControlPlaneClient('http://control-plane.invalid', () => Promise.reject(new Error('no network in this test'))),
      heartbeatCadenceMs: 10_000,
      plannerExecutor: executor,
    });
    // A tick that is still running when stop() is called: one already past its `stopping` check.
    let finishTick = (): void => undefined;
    (daemon as unknown as { tickInFlight: Promise<void> }).tickInFlight = new Promise<void>((resolve) => {
      finishTick = () => {
        events.push('tick.settled');
        resolve();
      };
    });
    const stopping = daemon.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(events, ['executor.shutdown'], 'the executor hears of the stop before the tick settles');
    finishTick();
    await stopping;
    assert.deepEqual(events, ['executor.shutdown', 'tick.settled']);
  });
});

describe('the bound Gateway is the one held in memory and on disk alike (Tier-2 N2)', () => {
  it('answers the Gateway only while both name it, and null otherwise', async () => {
    const other = '2222132d-0000-4000-8000-000000000000';
    const ask = (held: string | null, disk: string | null): Promise<string | null> => boundGatewayReader(() => held, () => Promise.resolve(disk))();
    assert.equal(await ask(AGY_PLANNER_GATEWAY_ID, AGY_PLANNER_GATEWAY_ID), AGY_PLANNER_GATEWAY_ID);
    assert.equal(await ask(other, AGY_PLANNER_GATEWAY_ID), null, 'promoted in memory, file write not landed');
    assert.equal(await ask(AGY_PLANNER_GATEWAY_ID, other), null, 'file says another Gateway');
    assert.equal(await ask(null, AGY_PLANNER_GATEWAY_ID), null, 'nothing held yet');
    await assert.rejects(boundGatewayReader(() => AGY_PLANNER_GATEWAY_ID, () => Promise.reject(new Error('unreadable')))());
  });

  it('the executor refuses attest and start when the two disagree', async () => {
    const h = harness({ mode: 'ok', currentGatewayId: boundGatewayReader(() => '2222132d-0000-4000-8000-000000000000', () => Promise.resolve(AGY_PLANNER_GATEWAY_ID)) });
    const w = work();
    await assert.rejects(h.executor.attest({ commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } }));
    const identity = await harness({ mode: 'ok' }).executor.attest({ commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } });
    assert.deepEqual(await h.executor.start(w, identity), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
  });
});

describe('boot always reaps and checks (Amendment 3 C2; Tier-2 N3)', () => {
  it('the executor boots even when the worker cannot read its records, and the error still surfaces', async () => {
    const h = harness({ mode: 'ok' });
    const records = new PlannerRecordStore(temporary('buildroom-agy-records-'));
    records.all = () => Promise.reject(new Error('records unreadable'));
    const worker = new GatewayPlannerWorker({ executor: h.executor, records });
    await assert.rejects(worker.boot(), /records unreadable/);
    assert.equal(h.reaps(), 1, 'the reap ran regardless');
  });

  it('an evidence record that parses but is not a record halts, and the reap still runs', async () => {
    for (const body of ['null', '[]', '42', '{"commandId":"x"}', '{"commandId":"x","outcome":"running"}']) {
      const h = harness({ mode: 'ok' });
      const directory = join(h.gatewayDirectory, 'planner-evidence');
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'odd.json'), body);
      await h.executor.boot();
      assert.equal(h.reaps(), 1, body);
      assert.equal(haltReason(h.gatewayDirectory), 'evidence_unreadable', body);
    }
  });
});

describe('the bound Gateway is read after the file, and again before the work is written (Tier-2 R1)', () => {
  const other = '2222132d-0000-4000-8000-000000000000';

  it('answers null when a promotion adopts while the file read is pending', async () => {
    let held: string | null = AGY_PLANNER_GATEWAY_ID;
    const reader = boundGatewayReader(
      () => held,
      () =>
        new Promise((resolve) => {
          // The file still names 1880c12d, but memory has moved on by the time it is read.
          held = other;
          setImmediate(() => resolve(AGY_PLANNER_GATEWAY_ID));
        }),
    );
    assert.equal(await reader(), null);
  });

  it('sends nothing when the identity changes after the start began, before agy\'s init', async () => {
    let held: string | null = AGY_PLANNER_GATEWAY_ID;
    const w = work();
    const outcomes: unknown[] = [];
    const h = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      heldGatewayId: () => held,
      onLaunch: () => {
        held = other;
      },
      syncDirectory: async (path) => {
        const file = join(path, evidenceName(w.commandId));
        if (existsSync(file)) outcomes.push((JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>)['outcome']);
        await syncDirectory(path);
      },
    });
    const identity = await identityFor(h.executor, w.commandId);
    assert.deepEqual(await h.executor.start(w, identity), { kind: 'not_sent' });
    assert.equal(h.launches, 1);
    assert.deepEqual(h.seen().stdin, [], 'nothing was written to agy');
    assert.deepEqual(outcomes, ['gateway_identity_changed'], 'refused at init: no running record was ever written');
    assert.equal(h.reaps(), 1);
  });

  it('sends nothing when the identity changes while the running record is written', async () => {
    let held: string | null = AGY_PLANNER_GATEWAY_ID;
    const w = work();
    const h = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      heldGatewayId: () => held,
      syncDirectory: async (path) => {
        // The running record is the first one written; it lands, then memory moves on.
        if (existsSync(join(path, evidenceName(w.commandId)))) held = other;
        await syncDirectory(path);
      },
    });
    const identity = await identityFor(h.executor, w.commandId);
    assert.deepEqual(await h.executor.start(w, identity), { kind: 'not_sent' });
    assert.deepEqual(h.seen().stdin, [], 'nothing was written to agy');
    const [record] = evidenceOf(h.gatewayDirectory);
    assert.equal(record?.['outcome'], 'gateway_identity_changed');
    assert.equal(record?.['sent'], false);
  });
});

describe('the daemon stopping while the running record is written (Tier-2 R1 advisory 1)', () => {
  it('sends nothing: the stop is checked after the record, with nothing awaited before the write', async () => {
    const w = work();
    let stopping: Promise<void> | null = null;
    const h: Harness = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      syncDirectory: async (path) => {
        if (stopping === null && existsSync(join(path, evidenceName(w.commandId)))) stopping = h.executor.shutdown();
        await syncDirectory(path);
      },
    });
    const identity = await identityFor(h.executor, w.commandId);
    assert.deepEqual(await h.executor.start(w, identity), { kind: 'not_sent' });
    await stopping;
    assert.deepEqual(h.seen().stdin, [], 'nothing was written to agy');
    assert.equal(evidenceOf(h.gatewayDirectory)[0]?.['outcome'], 'cancelled_before_send');
    assert.equal(h.reaps(), 1);
  });
});

describe('the running record survives a crash before the work is written (Tier-2 R3)', () => {
  it('syncs the evidence directory, and the gateway directory that gained it, before the input line', async () => {
    const w = work();
    const synced: { path: string; stdinSoFar: number }[] = [];
    const h: Harness = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      syncDirectory: async (path) => {
        synced.push({ path, stdinSoFar: h.seen().stdin.length });
        await syncDirectory(path);
      },
    });
    const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
    if (started.kind === 'accepted') await started.completion;
    const evidenceDirectory = join(h.gatewayDirectory, 'planner-evidence');
    assert.deepEqual(synced.slice(0, 2), [
      { path: evidenceDirectory, stdinSoFar: 0 },
      { path: h.gatewayDirectory, stdinSoFar: 0 },
    ]);
    assert.equal(synced.filter((entry) => entry.path === h.gatewayDirectory).length, 1, 'the parent only when the directory is made');
    assert.deepEqual(synced[2], { path: dirname(h.gatewayDirectory), stdinSoFar: 0 }, 'and the directory that gained the Gateway directory, made in the same mkdir');
    assert.equal(synced.filter((entry) => entry.path === dirname(h.gatewayDirectory)).length, 1);
    assert.equal(synced.at(-1)?.path, evidenceDirectory, 'the final record is synced too');
  });

  it('sends nothing, halts, and rejects rather than answer not_sent, when the directory cannot be synced', async () => {
    const w = work();
    const h = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      // Only the record's own directory fails, so the parent's sync cannot stand in for it.
      syncDirectory: (path) => (basename(path) === 'planner-evidence' ? Promise.reject(new Error('EIO')) : syncDirectory(path)),
    });
    await assert.rejects(h.executor.start(w, await identityFor(h.executor, w.commandId)), /could not be made to say so/);
    assert.deepEqual(h.seen().stdin, [], 'nothing was written to agy');
    assert.equal(haltReason(h.gatewayDirectory), 'evidence_write_failed');
    assert.equal(h.reaps(), 1);
  });

  it('syncDirectory syncs a real directory, and rejects one that is not there', async () => {
    const root = temporary('buildroom-agy-sync-');
    await syncDirectory(root);
    await assert.rejects(syncDirectory(join(root, 'absent')));
  });
});

describe('daemon boot reaps and checks however the lanes\' recovery goes (Tier-2 R2)', () => {
  it('boots the Planner when lane recovery fails, and the error still surfaces', async () => {
    const root = temporary('buildroom-agy-daemon-boot-');
    const events: string[] = [];
    const executor = {
      attest: () => Promise.reject(new Error('unused')),
      start: () => Promise.reject(new Error('unused')),
      boot: () => {
        events.push('executor.boot');
        return Promise.resolve();
      },
    };
    const daemon = new GatewayDaemon({
      paths: gatewayPaths(join(root, 'gateway')),
      clock: { wallNow: () => Date.now(), monotonicNow: () => 1_000 },
      custody: new Custody(new FileKeychainRunner(join(root, 'keychain'))),
      client: new ControlPlaneClient('http://control-plane.invalid', () => Promise.reject(new Error('no network in this test'))),
      heartbeatCadenceMs: 10_000,
      plannerExecutor: executor,
    });
    // Stands in for a recovery branch that rejects (a custody delete, a state publish).
    (daemon as unknown as { completeInterruptedStaging: () => Promise<void> }).completeInterruptedStaging = () =>
      Promise.reject(new Error('staging recovery failed'));
    await assert.rejects(daemon.boot(), /staging recovery failed/);
    assert.deepEqual(events, ['executor.boot']);
  });
});

describe('a halt survives a crash (Amendment 3 C1; Tier-2 F1)', () => {
  it('syncs the halt marker, then its directory', async () => {
    const w = work();
    const synced: { path: string; markerVisible: boolean }[] = [];
    const recording = await startRecordingSyncs();
    let h: Harness;
    try {
      h = harness({
        mode: 'ok',
        probe: () => Promise.resolve(true),
        syncDirectory: async (path) => {
          synced.push({ path, markerVisible: existsSync(join(h.gatewayDirectory, 'planner-halted.json')) });
          await syncDirectory(path);
        },
      });
      assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    } finally {
      recording.stop();
    }
    assert.equal(haltReason(h.gatewayDirectory), 'planner_user_has_processes_before_start');
    const marker = statSync(join(h.gatewayDirectory, 'planner-halted.json'));
    assert.notEqual(syncAt(recording.syncs, marker.ino, false), -1, 'the marker file was synced');
    assert.deepEqual(synced[0], { path: h.gatewayDirectory, markerVisible: true }, 'the first directory sync is the marker\'s, after it is there');
  });

  it('stays halted in this process when the marker cannot be made durable, even once the file is gone', async () => {
    const w = work();
    const answers = [true];
    const h: Harness = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      probe: () => Promise.resolve(answers.shift() ?? false),
      syncDirectory: (path) => (path === h.gatewayDirectory ? Promise.reject(new Error('EIO')) : syncDirectory(path)),
    });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.ok(h.logged.includes('agy.halt_write_failed'));
    rmSync(join(h.gatewayDirectory, 'planner-halted.json'));
    // Still halted. The first refusal's own record could not be made durable either (its new
    // directory's parent is the Gateway's), so no record is read again: the start rejects.
    await assert.rejects(h.executor.start(w, await identityFor(h.executor, w.commandId)), /cannot be read/);
    assert.equal(h.launches, 0);
  });
});

describe('the worker\'s records survive a crash, and no command runs twice (Tier-2 F2)', () => {
  it('write syncs the record\'s file, then its directory, and the Gateway\'s when the directory is new', async () => {
    const root = temporary('buildroom-agy-records-');
    const directory = plannerRecordsDirectory(root);
    const records = new PlannerRecordStore(directory);
    const identity = await identityFor(harness({ mode: 'ok' }).executor, 'c1');
    const recording = await startRecordingSyncs();
    try {
      await records.write({ commandId: 'c1', phase: 'attested', identity });
    } finally {
      recording.stop();
    }
    const fileAt = syncAt(recording.syncs, statSync(join(directory, evidenceName('c1'))).ino, false);
    assert.notEqual(fileAt, -1, 'the file was synced');
    assert.notEqual(syncAt(recording.syncs, statSync(directory).ino, true, fileAt), -1, 'then its directory');
    assert.notEqual(syncAt(recording.syncs, statSync(root).ino, true, fileAt), -1, 'and the directory that gained it');
  });

  it('execute\'s starting record is on disk, synced with its directory, before the executor is asked', async () => {
    const w = work();
    const directory = plannerRecordsDirectory(temporary('buildroom-agy-records-'));
    const identity = await identityFor(harness({ mode: 'ok' }).executor, w.commandId);
    const recording = await startRecordingSyncs();
    let atStart: { phase: unknown; fileSynced: boolean; directorySyncedAfter: boolean } | null = null;
    const executor: PlannerExecutor = {
      attest: () => Promise.resolve(identity),
      start: () => {
        const path = join(directory, evidenceName(w.commandId));
        const fileAt = syncAt(recording.syncs, statSync(path).ino, false);
        atStart = {
          phase: (JSON.parse(readFileSync(path, 'utf8')) as { phase: unknown }).phase,
          fileSynced: fileAt !== -1,
          directorySyncedAfter: syncAt(recording.syncs, statSync(directory).ino, true, fileAt) !== -1,
        };
        return Promise.resolve({ kind: 'not_sent' });
      },
    };
    try {
      const worker = new GatewayPlannerWorker({ executor, records: new PlannerRecordStore(directory) });
      await worker.handle({ requestId: uuid(), kind: 'attest', commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } });
      assert.deepEqual(await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: identity.executionId, work: w }), { kind: 'not_sent' });
    } finally {
      recording.stop();
    }
    assert.deepEqual(atStart, { phase: 'starting', fileSynced: true, directorySyncedAfter: true });
  });

  it('a command whose evidence says its work was sent is not started again, whatever the worker\'s record says', async () => {
    const w = work();
    const h = harness({ mode: 'ok', plan: readyPlanFor({ ...w } as never) });
    const identity = await identityFor(h.executor, w.commandId);
    // What a crash can leave: the worker's `starting` record lost, so its record still
    // says `attested`, while the executor's evidence, closed at boot, says the work was sent.
    const records = new PlannerRecordStore(plannerRecordsDirectory(temporary('buildroom-agy-records-')));
    await records.write({ commandId: w.commandId, phase: 'attested', identity });
    const evidenceDirectory = join(h.gatewayDirectory, 'planner-evidence');
    mkdirSync(evidenceDirectory, { recursive: true });
    const evidencePath = join(evidenceDirectory, evidenceName(w.commandId));
    const earlier = `${JSON.stringify({
      commandId: w.commandId,
      executionId: identity.executionId,
      startedAt: '2026-10-27T00:00:00.000Z',
      agySha256: AGY_HASH,
      initModel: 'gemini-4-argon-high',
      conversationId: '3b2c7a4c-1bda-46b1-8dc1-44641701df02',
      sent: true,
      endedAt: '2026-10-27T00:00:01.000Z',
      outcome: 'daemon_ended_during_run',
      exitCode: null,
      signal: null,
      checkoutRemoved: null,
    })}\n`;
    writeFileSync(evidencePath, earlier);
    const worker = new GatewayPlannerWorker({ executor: h.executor, records });
    const answer = await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: identity.executionId, work: w });
    assert.equal(answer, null, 'unknown, not not_sent: the work did reach agy once');
    assert.equal((await records.read(w.commandId))?.phase, 'lost');
    assert.equal(h.launches, 0);
    assert.equal(readFileSync(evidencePath, 'utf8'), earlier, 'the earlier record stands');
    assert.ok(h.logged.includes('agy.already_sent'));
  });

  it('an earlier refusal does not stop a retry; a record that cannot be read halts, and nothing starts', async () => {
    const refused = (w: PlannerWorkWire, identity: PlannerIdentityWire): string =>
      `${JSON.stringify({
        commandId: w.commandId,
        executionId: identity.executionId,
        startedAt: '2026-10-27T00:00:00.000Z',
        agySha256: null,
        initModel: null,
        conversationId: null,
        sent: false,
        endedAt: '2026-10-27T00:00:00.000Z',
        outcome: 'agy_hash_mismatch',
        exitCode: null,
        signal: null,
        checkoutRemoved: null,
      })}\n`;
    {
      const w = work();
      const h = harness({ mode: 'ok', plan: readyPlanFor({ ...w } as never) });
      const identity = await identityFor(h.executor, w.commandId);
      mkdirSync(join(h.gatewayDirectory, 'planner-evidence'), { recursive: true });
      writeFileSync(join(h.gatewayDirectory, 'planner-evidence', evidenceName(w.commandId)), refused(w, identity));
      const started = await h.executor.start(w, identity);
      assert.equal(started.kind, 'accepted');
      if (started.kind === 'accepted') await started.completion;
      assert.equal(h.launches, 1);
    }
    for (const shape of ['not json', 'a directory', 'another command\'s record'] as const) {
      const w = work();
      const h = harness({ mode: 'ok', plan: readyPlanFor({ ...w } as never) });
      const identity = await identityFor(h.executor, w.commandId);
      const path = join(h.gatewayDirectory, 'planner-evidence', evidenceName(w.commandId));
      mkdirSync(join(h.gatewayDirectory, 'planner-evidence'), { recursive: true });
      if (shape === 'a directory') mkdirSync(path);
      else writeFileSync(path, shape === 'not json' ? '{not json' : refused(work(), identity));
      const before = shape === 'a directory' ? null : readFileSync(path, 'utf8');
      await assert.rejects(h.executor.start(w, identity), /cannot be read/, shape);
      assert.equal(h.launches, 0, shape);
      assert.equal(haltReason(h.gatewayDirectory), 'evidence_unreadable', shape);
      assert.equal(shape === 'a directory' ? null : readFileSync(path, 'utf8'), before, `${shape}: untouched`);
    }
  });
});

describe('a record that says sent stands, whatever refuses the start (Tier-2 G1)', () => {
  it('every refusal before launch rejects instead, and leaves the record as it is', async () => {
    const other = '2222132d-0000-4000-8000-000000000000';
    const cases: {
      name: string;
      mode?: string;
      currentGatewayId?: AgyPlannerDeps['currentGatewayId'];
      work?: (w: PlannerWorkWire) => PlannerWorkWire;
      identity?: (identity: PlannerIdentityWire) => PlannerIdentityWire;
      arrange?: (h: Harness) => Promise<void>;
    }[] = [
      { name: 'identity off the lane', identity: (identity) => ({ ...identity, surface: 'claude-code' }) },
      { name: 'Gateway identity changed', currentGatewayId: () => Promise.resolve(other) },
      { name: 'work not checkoutable', work: (w) => ({ ...w, repository: 'not a repository' }) },
      { name: 'daemon stopping', arrange: (h) => h.executor.shutdown() },
      {
        name: 'executor halted',
        arrange: (h) => {
          mkdirSync(h.gatewayDirectory, { recursive: true });
          writeFileSync(join(h.gatewayDirectory, 'planner-halted.json'), '{"reason":"test"}\n');
          return Promise.resolve();
        },
      },
      {
        name: 'executor busy',
        mode: 'hang',
        arrange: async (h) => {
          const held = work();
          const started = await h.executor.start(held, await identityFor(h.executor, held.commandId));
          assert.equal(started.kind, 'accepted');
          if (started.kind === 'accepted') started.completion.catch(() => undefined);
        },
      },
    ];
    for (const c of cases) {
      const w = c.work?.(work()) ?? work();
      const h = harness({ mode: c.mode ?? 'ok', ...(c.currentGatewayId === undefined ? {} : { currentGatewayId: c.currentGatewayId }) });
      const identity = await identityFor(harness({ mode: 'ok' }).executor, w.commandId);
      const path = placeEvidence(h, w.commandId, evidenceLine(w.commandId, identity.executionId));
      const before = readFileSync(path, 'utf8');
      await c.arrange?.(h);
      const launches = h.launches;
      await assert.rejects(h.executor.start(w, c.identity?.(identity) ?? identity), /already sent/, c.name);
      assert.equal(h.launches, launches, `${c.name}: nothing launched`);
      assert.equal(readFileSync(path, 'utf8'), before, `${c.name}: the record stands`);
      assert.ok(h.logged.includes('agy.already_sent'), c.name);
      await h.executor.shutdown();
    }
  });
});

describe('the worker affirms nothing against the executor\'s record (Tier-2 G2)', () => {
  async function stale(): Promise<{ w: PlannerWorkWire; h: Harness; identity: PlannerIdentityWire; worker: GatewayPlannerWorker; records: PlannerRecordStore }> {
    const w = work();
    const h = harness({ mode: 'ok', plan: readyPlanFor({ ...w } as never) });
    const identity = await identityFor(h.executor, w.commandId);
    const records = new PlannerRecordStore(plannerRecordsDirectory(temporary('buildroom-agy-records-')));
    return { w, h, identity, records, worker: new GatewayPlannerWorker({ executor: h.executor, records }) };
  }

  it('status answers nothing, not never_received, for an attested record beside evidence that says sent', async () => {
    const { w, h, identity, records, worker } = await stale();
    await records.write({ commandId: w.commandId, phase: 'attested', identity });
    placeEvidence(h, w.commandId, evidenceLine(w.commandId, identity.executionId));
    assert.equal(await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), null);
  });

  it('execute answers nothing, not not_sent, with no worker record or another execution id, beside evidence that says sent', async () => {
    const { w, h, identity, records, worker } = await stale();
    placeEvidence(h, w.commandId, evidenceLine(w.commandId, identity.executionId));
    assert.equal(await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: identity.executionId, work: w }), null, 'no record');
    await records.write({ commandId: w.commandId, phase: 'attested', identity });
    assert.equal(await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: uuid(), work: w }), null, 'another execution id');
    assert.equal(h.launches, 0);
  });

  it('both answer nothing when the executor cannot read its record, and the executor halts', async () => {
    const { w, h, identity, records, worker } = await stale();
    placeEvidence(h, w.commandId, '{not json');
    assert.equal(await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), null);
    assert.equal(haltReason(h.gatewayDirectory), 'evidence_unreadable', 'asked by the worker, an unreadable record halts too');
    await records.write({ commandId: w.commandId, phase: 'attested', identity });
    assert.equal(await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: uuid(), work: w }), null);
  });

  it('with no such evidence, the affirmative answers stand', async () => {
    const { w, identity, records, worker } = await stale();
    assert.deepEqual(await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), { kind: 'never_received' });
    assert.deepEqual(await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: identity.executionId, work: w }), { kind: 'not_sent' });
    await records.write({ commandId: w.commandId, phase: 'attested', identity });
    assert.deepEqual(await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), { kind: 'never_received' });
  });
});

describe('a record that does not say whether the work was sent is not a record (Tier-2 G3)', () => {
  it('halts the start, launches nothing, and halts at boot', async () => {
    for (const fields of [{ sent: undefined }, { sent: null }, { sent: 'yes' }]) {
      const w = work();
      const h = harness({ mode: 'ok', plan: readyPlanFor({ ...w } as never) });
      const identity = await identityFor(h.executor, w.commandId);
      const path = placeEvidence(h, w.commandId, evidenceLine(w.commandId, identity.executionId, fields));
      const before = readFileSync(path, 'utf8');
      assert.equal(JSON.stringify(JSON.parse(before)).includes('"sent":true'), false);
      await assert.rejects(h.executor.start(w, identity), /cannot be read/, String(fields.sent));
      assert.equal(h.launches, 0);
      assert.equal(haltReason(h.gatewayDirectory), 'evidence_unreadable');
      assert.equal(readFileSync(path, 'utf8'), before, 'untouched');
      const booted = harness({ mode: 'ok' });
      placeEvidence(booted, w.commandId, before);
      await booted.executor.boot();
      assert.equal(haltReason(booted.gatewayDirectory), 'evidence_unreadable', `boot: ${String(fields.sent)}`);
      assert.equal(booted.reaps(), 1);
    }
  });
});

describe('not_sent is answered only when the record says so (Tier-2 H2)', () => {
  it('rejects when the downgrade after the running record cannot be made durable', async () => {
    const other = '2222132d-0000-4000-8000-000000000000';
    let held: string | null = AGY_PLANNER_GATEWAY_ID;
    const w = work();
    let evidenceSyncs = 0;
    const h = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      heldGatewayId: () => held,
      syncDirectory: async (path) => {
        if (basename(path) !== 'planner-evidence') return syncDirectory(path);
        evidenceSyncs += 1;
        // The running record lands and is synced; then the identity moves on, and the
        // record that would say the work was not sent cannot be made durable.
        if (evidenceSyncs === 1) {
          held = other;
          return syncDirectory(path);
        }
        throw new Error('EIO');
      },
    });
    const identity = await identityFor(h.executor, w.commandId);
    await assert.rejects(h.executor.start(w, identity), /could not be made to say so/);
    assert.deepEqual(h.seen().stdin, [], 'nothing was written to agy');
    assert.equal(h.reaps(), 1);
    assert.equal(haltReason(h.gatewayDirectory), 'evidence_write_failed');
    assert.ok(h.logged.includes('agy.not_sent') && h.logged.includes('agy.evidence_failed'));
  });

  it('the worker relays an executor\'s not_sent only while the executor\'s record agrees', async () => {
    const w = work();
    const identity = await identityFor(harness({ mode: 'ok' }).executor, w.commandId);
    const executor: PlannerExecutor = {
      attest: () => Promise.resolve(identity),
      start: () => Promise.resolve({ kind: 'not_sent' }),
      // An executor whose answer and record disagree: the worker affirms neither.
      sent: () => Promise.resolve(true),
    };
    const records = new PlannerRecordStore(plannerRecordsDirectory(temporary('buildroom-agy-records-')));
    const worker = new GatewayPlannerWorker({ executor, records });
    // Placed directly: attest itself now refuses beside a record that says sent.
    await records.write({ commandId: w.commandId, phase: 'attested', identity });
    assert.equal(await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: identity.executionId, work: w }), null);
    assert.equal((await records.read(w.commandId))?.phase, 'not_sent', 'what the executor answered is still recorded');
  });
});

describe('the builder\'s own pre-review of 10f6a24: three advisories taken', () => {
  it('syncMadeDirectories syncs the directory and every directory the same mkdir made, up to the one that existed', async () => {
    const seen: string[] = [];
    const record = (path: string): Promise<void> => {
      seen.push(path);
      return Promise.resolve();
    };
    await syncMadeDirectories('/a/b/c', '/a/b', record);
    assert.deepEqual(seen, ['/a/b/c', '/a/b', '/a']);
    seen.length = 0;
    await syncMadeDirectories('/a/b/c', '/a/b/c', record);
    assert.deepEqual(seen, ['/a/b/c', '/a/b']);
    seen.length = 0;
    await syncMadeDirectories('/a/b/c', undefined, record);
    assert.deepEqual(seen, ['/a/b/c']);
  });

  it('boot closes a running record only at its command\'s own path, and halts on a stray file naming a command', async () => {
    const w = work();
    const h = harness({ mode: 'ok' });
    const identity = await identityFor(h.executor, w.commandId);
    const own = placeEvidence(h, w.commandId, evidenceLine(w.commandId, identity.executionId, { outcome: 'plan' }));
    const stray = join(h.gatewayDirectory, 'planner-evidence', 'other.json');
    writeFileSync(stray, evidenceLine(w.commandId, identity.executionId, { outcome: 'running', endedAt: null }));
    const before = { own: readFileSync(own, 'utf8'), stray: readFileSync(stray, 'utf8') };
    await h.executor.boot();
    assert.equal(haltReason(h.gatewayDirectory), 'evidence_unreadable');
    assert.equal(h.reaps(), 1);
    assert.deepEqual({ own: readFileSync(own, 'utf8'), stray: readFileSync(stray, 'utf8') }, before, 'neither file was written');
  });

  it('a second start of the command whose start is under way is rejected, and its start goes on untouched', async () => {
    const w = work();
    let release = (): void => undefined;
    const parked = new Promise<void>((resolve) => (release = resolve));
    const h = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      checkout: async (_work, parent) => {
        await parked;
        return mkdtemp(join(parent, 'run-'));
      },
    });
    const identity = await identityFor(h.executor, w.commandId);
    const first = h.executor.start(w, identity);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await assert.rejects(h.executor.start(w, identity), /already being started/);
    assert.ok(h.logged.includes('agy.already_starting'));
    release();
    const started = await first;
    assert.equal(started.kind, 'accepted');
    if (started.kind === 'accepted') await started.completion;
    const records = evidenceOf(h.gatewayDirectory);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.['outcome'], 'plan');
    assert.equal(records[0]?.['sent'], true);
  });
});

describe('the builder\'s own pre-review of 10f6a24, second set: the worker\'s records and replies', () => {
  class FlakyRecords extends PlannerRecordStore {
    readonly failing = new Set<string>();
    override write(record: PlannerRecord): Promise<void> {
      if (this.failing.has(record.phase)) return Promise.reject(new Error(`ENOSPC writing ${record.phase}`));
      return super.write(record);
    }
  }

  function accepting(identity: PlannerIdentityWire): { executor: PlannerExecutor; finish: (result: PlannerResultWire) => void } {
    let finish: (result: PlannerResultWire) => void = () => undefined;
    const completion = new Promise<PlannerResultWire>((resolve) => (finish = resolve));
    return {
      finish,
      executor: {
        attest: () => Promise.resolve(identity),
        start: () => Promise.resolve({ kind: 'accepted', observed: { ...AGY_PLANNER_ROUTE }, completion }),
        sent: () => Promise.resolve(false),
      },
    };
  }

  it('a read of the records waits for a write under way, so it never sees a record whose directory entry is not yet synced', async () => {
    const directory = plannerRecordsDirectory(temporary('buildroom-agy-records-'));
    const records = new PlannerRecordStore(directory);
    const identity = await identityFor(harness({ mode: 'ok' }).executor, 'c1');
    await records.write({ commandId: 'c1', phase: 'attested', identity });
    const probe = await openFile(FAKE_AGY, 'r');
    const prototype = Object.getPrototypeOf(probe) as unknown as { sync: (this: FileHandle) => Promise<void> };
    await probe.close();
    const original = prototype.sync;
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let holds = 0;
    // The first directory sync from here on is held open: the rename before it has landed.
    prototype.sync = async function (this: FileHandle): Promise<void> {
      if ((await this.stat()).isDirectory() && holds === 0) {
        holds += 1;
        await held;
      }
      return original.call(this);
    };
    try {
      const writing = records.write({ commandId: 'c1', phase: 'starting', identity });
      const path = join(directory, evidenceName('c1'));
      for (let i = 0; i < 400 && (JSON.parse(readFileSync(path, 'utf8')) as { phase: string }).phase !== 'starting'; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.equal((JSON.parse(readFileSync(path, 'utf8')) as { phase: string }).phase, 'starting', 'renamed into place, directory sync held');
      let resolved = false;
      const reading = records.read('c1').then((record) => {
        resolved = true;
        return record;
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal(resolved, false, 'the read waits for the write');
      release();
      await writing;
      assert.equal((await reading)?.phase, 'starting');
    } finally {
      prototype.sync = original;
    }
  });

  it('a running record whose write fails does not stop the finished one: the result is still recorded and answered', async () => {
    const w = work();
    const identity = await identityFor(harness({ mode: 'ok' }).executor, w.commandId);
    const { executor, finish } = accepting(identity);
    const records = new FlakyRecords(plannerRecordsDirectory(temporary('buildroom-agy-records-')));
    const worker = new GatewayPlannerWorker({ executor, records });
    assert.equal((await worker.handle({ requestId: uuid(), kind: 'attest', commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } }))?.kind, 'attested');
    records.failing.add('running');
    await assert.rejects(worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: identity.executionId, work: w }), /ENOSPC/);
    records.failing.delete('running');
    const plan: PlannerResultWire = { kind: 'plan', document: readyPlanFor({ ...w } as never) };
    finish(plan);
    await worker.settled();
    assert.equal((await records.read(w.commandId))?.phase, 'finished');
    assert.deepEqual(await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), { kind: 'finished', executionId: identity.executionId, observed: AGY_PLANNER_ROUTE, result: plan });
  });

  it('a finished record that cannot be written is never answered as running: nothing until it can be written, then finished', async () => {
    const w = work();
    const identity = await identityFor(harness({ mode: 'ok' }).executor, w.commandId);
    const { executor, finish } = accepting(identity);
    const records = new FlakyRecords(plannerRecordsDirectory(temporary('buildroom-agy-records-')));
    const worker = new GatewayPlannerWorker({ executor, records });
    await worker.handle({ requestId: uuid(), kind: 'attest', commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } });
    assert.equal((await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: identity.executionId, work: w }))?.kind, 'accepted');
    records.failing.add('finished');
    const plan: PlannerResultWire = { kind: 'plan', document: readyPlanFor({ ...w } as never) };
    finish(plan);
    await worker.settled();
    assert.equal((await records.read(w.commandId))?.phase, 'running', 'the record could not move on');
    assert.equal(await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), null, 'not running: the run ended');
    records.failing.delete('finished');
    assert.deepEqual(await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), { kind: 'finished', executionId: identity.executionId, observed: AGY_PLANNER_ROUTE, result: plan });
    assert.equal((await records.read(w.commandId))?.phase, 'finished');
  });

  it('attest answers attest_failed beside a record that says the work was sent, and writes nothing', async () => {
    const w = work();
    const h = harness({ mode: 'ok' });
    const identity = await identityFor(h.executor, w.commandId);
    const records = new PlannerRecordStore(plannerRecordsDirectory(temporary('buildroom-agy-records-')));
    const worker = new GatewayPlannerWorker({ executor: h.executor, records });
    placeEvidence(h, w.commandId, evidenceLine(w.commandId, identity.executionId));
    assert.deepEqual(await worker.handle({ requestId: uuid(), kind: 'attest', commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } }), { kind: 'attest_failed' });
    assert.equal(await records.read(w.commandId), null, 'no record written');
    await records.write({ commandId: w.commandId, phase: 'attested', identity });
    assert.deepEqual(await worker.handle({ requestId: uuid(), kind: 'attest', commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } }), { kind: 'attest_failed' }, 'nor re-answered');
  });

  it('a torn worker record is answered as nothing, not thrown out of the tick', async () => {
    const w = work();
    const h = harness({ mode: 'ok', plan: readyPlanFor({ ...w } as never) });
    const identity = await identityFor(h.executor, w.commandId);
    const directory = plannerRecordsDirectory(temporary('buildroom-agy-records-'));
    const records = new PlannerRecordStore(directory);
    const worker = new GatewayPlannerWorker({ executor: h.executor, records });
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, evidenceName(w.commandId)), '{"commandId":"');
    assert.equal(await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), null);
    assert.equal(await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: identity.executionId, work: w }), null);
    assert.deepEqual(await worker.handle({ requestId: uuid(), kind: 'attest', commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } }), { kind: 'attest_failed' });
    assert.equal(h.launches, 0);
  });

  it('at boot, a starting record whose work the executor\'s record proves never sent becomes not_sent; one it cannot clear becomes lost', async () => {
    for (const sent of [false, true]) {
      const w = work();
      const h = harness({ mode: 'ok' });
      const identity = await identityFor(h.executor, w.commandId);
      const records = new PlannerRecordStore(plannerRecordsDirectory(temporary('buildroom-agy-records-')));
      await records.write({ commandId: w.commandId, phase: 'starting', identity });
      if (sent) placeEvidence(h, w.commandId, evidenceLine(w.commandId, identity.executionId));
      const worker = new GatewayPlannerWorker({ executor: h.executor, records });
      await worker.boot();
      assert.equal((await records.read(w.commandId))?.phase, sent ? 'lost' : 'not_sent', `sent=${String(sent)}`);
      assert.deepEqual(await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), sent ? null : { kind: 'never_received' });
    }
  });
});

describe('the builder\'s own pre-review of 10f6a24, third set: the executor\'s closing record, a link to nowhere, a late halt', () => {
  it('a run whose closing record cannot be written rejects its completion, and halts', async () => {
    const w = work();
    let evidenceSyncs = 0;
    const h = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      syncDirectory: (path) => {
        if (basename(path) !== 'planner-evidence') return syncDirectory(path);
        evidenceSyncs += 1;
        // The running record lands; the closing record's directory sync fails.
        return evidenceSyncs === 1 ? syncDirectory(path) : Promise.reject(new Error('EIO'));
      },
    });
    const started = await h.executor.start(w, await identityFor(h.executor, w.commandId));
    assert.equal(started.kind, 'accepted');
    if (started.kind === 'accepted') await assert.rejects(started.completion, /could not be written/);
    assert.equal(h.seen().stdin.length, 1, 'the work was sent');
    assert.equal(haltReason(h.gatewayDirectory), 'evidence_write_failed');
    assert.equal(h.reaps(), 1);
  });

  it('a link to nowhere at a record\'s path is a record that cannot be read: nothing starts, and the executor halts', async () => {
    const w = work();
    const h = harness({ mode: 'ok', plan: readyPlanFor({ ...w } as never) });
    const identity = await identityFor(h.executor, w.commandId);
    const directory = join(h.gatewayDirectory, 'planner-evidence');
    mkdirSync(directory, { recursive: true });
    symlinkSync(join(directory, 'nowhere'), join(directory, evidenceName(w.commandId)));
    await assert.rejects(h.executor.start(w, identity), /cannot be read/);
    assert.equal(h.launches, 0);
    assert.equal(haltReason(h.gatewayDirectory), 'evidence_unreadable');
  });

  it('a halt raised while the running record is written is seen before the input line: nothing is sent', async () => {
    const w = work();
    let evidenceSyncs = 0;
    const h: Harness = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      syncDirectory: async (path) => {
        if (basename(path) === 'planner-evidence') {
          evidenceSyncs += 1;
          // The running record lands; a halt lands with it, as another request's unreadable record would raise.
          if (evidenceSyncs === 1) writeFileSync(join(h.gatewayDirectory, 'planner-halted.json'), '{"reason":"elsewhere"}\n');
        }
        await syncDirectory(path);
      },
    });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.deepEqual(h.seen().stdin, [], 'nothing was written to agy');
    assert.equal(evidenceOf(h.gatewayDirectory)[0]?.['outcome'], 'executor_halted');
    assert.equal(h.reaps(), 1);
  });
});

describe('the seventh Tier-2 (I1 to I3) and its advisories', () => {
  it('I1: the command whose start is under way is rejected before any other check, even with an identity that would be refused', async () => {
    const w = work();
    let release = (): void => undefined;
    const parked = new Promise<void>((resolve) => (release = resolve));
    const h = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      checkout: async (_work, parent) => {
        await parked;
        return mkdtemp(join(parent, 'run-'));
      },
    });
    const identity = await identityFor(h.executor, w.commandId);
    const first = h.executor.start(w, identity);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Off the lane: on its own this would be refused with not_sent and a record written.
    await assert.rejects(h.executor.start(w, { ...identity, surface: 'claude-code' }), /already being started/);
    assert.equal(existsSync(join(h.gatewayDirectory, 'planner-evidence', evidenceName(w.commandId))), false, 'nothing was written for the command');
    release();
    const started = await first;
    assert.equal(started.kind, 'accepted');
    if (started.kind === 'accepted') await started.completion;
    assert.equal(evidenceOf(h.gatewayDirectory)[0]?.['outcome'], 'plan');
  });

  it('I2: a worker record whose directory sync failed after its rename is never reported in this process; a store opened afresh syncs it, then reports it', async () => {
    const w = work();
    const identity = await identityFor(harness({ mode: 'ok' }).executor, w.commandId);
    let finish: (result: PlannerResultWire) => void = () => undefined;
    const completion = new Promise<PlannerResultWire>((resolve) => (finish = resolve));
    const executor: PlannerExecutor = {
      attest: () => Promise.resolve(identity),
      start: () => Promise.resolve({ kind: 'accepted', observed: { ...AGY_PLANNER_ROUTE }, completion }),
      sent: () => Promise.resolve(false),
    };
    const directory = plannerRecordsDirectory(temporary('buildroom-agy-records-'));
    const records = new PlannerRecordStore(directory);
    const worker = new GatewayPlannerWorker({ executor, records });
    await worker.handle({ requestId: uuid(), kind: 'attest', commandId: w.commandId, role: 'architect', intended: { ...AGY_PLANNER_ROUTE } });
    assert.equal((await worker.handle({ requestId: uuid(), kind: 'execute', commandId: w.commandId, executionId: identity.executionId, work: w }))?.kind, 'accepted');
    // The next directory sync of the records directory fails: the finished record is renamed into place but not durable.
    const probe = await openFile(FAKE_AGY, 'r');
    const prototype = Object.getPrototypeOf(probe) as unknown as { sync: (this: FileHandle) => Promise<void> };
    await probe.close();
    const original = prototype.sync;
    const directoryIno = statSync(directory).ino;
    let failing = true;
    prototype.sync = async function (this: FileHandle): Promise<void> {
      const info = await this.stat();
      if (failing && info.isDirectory() && info.ino === directoryIno) throw new Error('EIO');
      return original.call(this);
    };
    const plan: PlannerResultWire = { kind: 'plan', document: readyPlanFor({ ...w } as never) };
    try {
      finish(plan);
      await worker.settled();
      assert.equal((JSON.parse(readFileSync(join(directory, evidenceName(w.commandId)), 'utf8')) as { phase: string }).phase, 'finished', 'visible on disk');
      assert.equal(await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), null, 'not reported while the write is not durable');
      failing = false;
      // The sync is not tried again in this process (K1): the store stays closed.
      assert.equal(await worker.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), null, 'nor once the failure clears');
      // A store opened afresh, as after a restart, syncs the record before it reads it.
      const restarted = new GatewayPlannerWorker({ executor, records: new PlannerRecordStore(directory) });
      assert.deepEqual(await restarted.handle({ requestId: uuid(), kind: 'status', commandId: w.commandId }), { kind: 'finished', executionId: identity.executionId, observed: AGY_PLANNER_ROUTE, result: plan });
    } finally {
      prototype.sync = original;
    }
  });

  it('I3: only a confirmed absence is no record; an entry, or an existence check that fails, is unreadable', () => {
    assert.equal(recordAbsence({ exists: false, code: 'ENOENT' }), 'none');
    assert.equal(recordAbsence({ exists: true }), 'unreadable');
    assert.equal(recordAbsence({ exists: false, code: 'EIO' }), 'unreadable');
    assert.equal(recordAbsence({ exists: false, code: 'EACCES' }), 'unreadable');
    assert.equal(recordAbsence({ exists: false, code: undefined }), 'unreadable');
  });

  it('advisory 5: a stop that overlaps a boot waits for the boot, reap and check included', async () => {
    const root = temporary('buildroom-agy-daemon-boot-stop-');
    const events: string[] = [];
    let finishBoot = (): void => undefined;
    const executor = {
      attest: () => Promise.reject(new Error('unused')),
      start: () => Promise.reject(new Error('unused')),
      boot: () =>
        new Promise<void>((resolve) => {
          finishBoot = () => {
            events.push('executor.boot');
            resolve();
          };
        }),
      shutdown: () => {
        events.push('executor.shutdown');
        return Promise.resolve();
      },
    };
    const daemon = new GatewayDaemon({
      paths: gatewayPaths(join(root, 'gateway')),
      clock: { wallNow: () => Date.now(), monotonicNow: () => 1_000 },
      custody: new Custody(new FileKeychainRunner(join(root, 'keychain'))),
      client: new ControlPlaneClient('http://control-plane.invalid', () => Promise.reject(new Error('no network in this test'))),
      heartbeatCadenceMs: 10_000,
      plannerExecutor: executor,
    });
    const booting = daemon.boot();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const stopping = daemon.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(events, [], 'stop waits for the boot');
    finishBoot();
    await booting;
    await stopping;
    assert.deepEqual(events, ['executor.boot', 'executor.shutdown']);
  });
});

describe('the eighth Tier-2 (J1 and J2)', () => {
  it('J1: two starts of one command that arrive together: the second is rejected before either has reserved the executor', async () => {
    const w = work();
    let release = (): void => undefined;
    const parked = new Promise<void>((resolve) => (release = resolve));
    const h = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      checkout: async (_work, parent) => {
        await parked;
        return mkdtemp(join(parent, 'run-'));
      },
    });
    const identity = await identityFor(h.executor, w.commandId);
    // No await between the two calls: both are entered before the first has awaited anything.
    const first = h.executor.start(w, identity);
    const second = h.executor.start(w, identity);
    await assert.rejects(second, /already being started/);
    assert.equal(existsSync(join(h.gatewayDirectory, 'planner-evidence', evidenceName(w.commandId))), false, 'nothing was written for the command');
    release();
    const started = await first;
    assert.equal(started.kind, 'accepted');
    if (started.kind === 'accepted') await started.completion;
    const records = evidenceOf(h.gatewayDirectory);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.['outcome'], 'plan');
    // Once the run has completed, the command may be started again, and its record then refuses it.
    await assert.rejects(h.executor.start(w, identity), /already sent to agy/);
  });

});

describe('the ninth Tier-2 (K1 to K3): a sync that fails is not tried again', () => {
  /** Records every real fsync by inode, and fails those `failWhen` names while it does. */
  async function failingSyncs(): Promise<{ readonly syncs: SyncSeen[]; failWhen: (seen: SyncSeen) => boolean; stop: () => void }> {
    const probe = await openFile(FAKE_AGY, 'r');
    const prototype = Object.getPrototypeOf(probe) as unknown as { sync: (this: FileHandle) => Promise<void> };
    await probe.close();
    const original = prototype.sync;
    const control = {
      syncs: [] as SyncSeen[],
      failWhen: ((): boolean => false) as (seen: SyncSeen) => boolean,
      stop: () => {
        prototype.sync = original;
      },
    };
    prototype.sync = async function (this: FileHandle): Promise<void> {
      const info = await this.stat();
      const seen = { directory: info.isDirectory(), ino: info.ino };
      control.syncs.push(seen);
      if (control.failWhen(seen)) throw new Error('EIO');
      return original.call(this);
    };
    return control;
  }

  it('K1: a write whose own file sync fails closes the store, and a store opened afresh syncs the directory it made and the Gateway\'s before anything else', async () => {
    const w = work();
    const other = work();
    const identity = await identityFor(harness({ mode: 'ok' }).executor, w.commandId);
    const gateway = temporary('buildroom-agy-k1-');
    const directory = plannerRecordsDirectory(gateway);
    const records = new PlannerRecordStore(directory);
    const control = await failingSyncs();
    try {
      // The first write makes the records directory; its record file's own sync fails.
      control.failWhen = (seen) => !seen.directory;
      await assert.rejects(records.write({ commandId: w.commandId, phase: 'attested', identity }), /EIO/);
      control.failWhen = () => false;
      // Not tried again: a later write would have synced only this directory, never the Gateway's.
      await assert.rejects(records.write({ commandId: other.commandId, phase: 'attested', identity }), /closed until the daemon restarts/);
      await assert.rejects(records.read(w.commandId), /closed until the daemon restarts/);
      await assert.rejects(records.all(), /closed until the daemon restarts/);
      control.syncs.length = 0;
      const reopened = new PlannerRecordStore(directory);
      await reopened.write({ commandId: other.commandId, phase: 'attested', identity });
      const made = syncAt(control.syncs, statSync(directory).ino, true);
      const above = syncAt(control.syncs, statSync(gateway).ino, true, made);
      const written = control.syncs.findIndex((seen) => !seen.directory);
      assert.ok(made !== -1 && above !== -1 && above < written, `the directory, then the Gateway's, before the new write: ${JSON.stringify(control.syncs)}`);
      assert.equal((await reopened.read(other.commandId))?.phase, 'attested');
    } finally {
      control.stop();
    }
  });

  it('K1: all() answers nothing from a store whose write failed after its rename, though the file is there to see', async () => {
    const w = work();
    const identity = await identityFor(harness({ mode: 'ok' }).executor, w.commandId);
    const directory = plannerRecordsDirectory(temporary('buildroom-agy-k1-all-'));
    mkdirSync(directory, { recursive: true });
    const directoryIno = statSync(directory).ino;
    const records = new PlannerRecordStore(directory);
    const control = await failingSyncs();
    try {
      assert.deepEqual(await records.all(), [], 'opened, and synced, before the failure');
      control.failWhen = (seen) => seen.directory && seen.ino === directoryIno;
      await assert.rejects(records.write({ commandId: w.commandId, phase: 'attested', identity }), /EIO/);
      control.failWhen = () => false;
      assert.ok(existsSync(join(directory, evidenceName(w.commandId))), 'renamed into place');
      await assert.rejects(records.all(), /closed until the daemon restarts/);
    } finally {
      control.stop();
    }
  });

  it('K2: an evidence record whose write failed is never read back as not sent: the executor cannot say, and halts', async () => {
    const w = work();
    let failing = true;
    const h = harness({ mode: 'ok', syncDirectory: (path) => (failing && basename(path) === 'planner-evidence' ? Promise.reject(new Error('EIO')) : syncDirectory(path)) });
    const identity = await identityFor(h.executor, w.commandId);
    // A refusal whose record is renamed into place but whose directory cannot be synced.
    assert.deepEqual(await h.executor.start(w, { ...identity, surface: 'claude-code' }), { kind: 'not_sent' });
    assert.equal(haltReason(h.gatewayDirectory), 'evidence_write_failed');
    failing = false;
    assert.ok(existsSync(join(h.gatewayDirectory, 'planner-evidence', evidenceName(w.commandId))), 'the record is there to see');
    assert.equal(await h.executor.sent(w.commandId), null, 'not read back as not sent');
    const next = work();
    await assert.rejects(h.executor.start(next, await identityFor(h.executor, next.commandId)), /cannot be read/);
    assert.equal(h.launches, 0);
  });

  it('K2: at boot the evidence records are written again in full, then their directory and the Gateway\'s synced, before any is read; a step that fails halts and closes them', async () => {
    const commandId = uuid();
    const ok = harness({ mode: 'ok' });
    const file = placeEvidence(ok, commandId, evidenceLine(commandId, uuid(), { outcome: 'running', endedAt: null }));
    const fileIno = statSync(file).ino;
    // A hard link holds the earlier file's inode, so no file made at boot can reuse its number.
    linkSync(file, join(temporary('buildroom-agy-held-'), 'earlier.json'));
    const control = await failingSyncs();
    try {
      await ok.executor.boot();
      // The file an earlier process wrote is not synced again: a second sync proves nothing.
      assert.equal(syncAt(control.syncs, fileIno, false), -1, `the earlier process's file is not synced again: ${JSON.stringify(control.syncs)}`);
      const rewritten = control.syncs.findIndex((seen) => !seen.directory && seen.ino !== fileIno);
      const directory = syncAt(control.syncs, statSync(join(ok.gatewayDirectory, 'planner-evidence')).ino, true, rewritten);
      const above = syncAt(control.syncs, statSync(ok.gatewayDirectory).ino, true, directory);
      assert.ok(rewritten !== -1 && directory !== -1 && above !== -1, `a new copy synced, then the directory, then the Gateway's: ${JSON.stringify(control.syncs)}`);
      assert.notEqual(statSync(file).ino, fileIno, 'the record at the path is the copy written here');
    } finally {
      control.stop();
    }
    assert.ok(ok.logged.includes('agy.evidence_closed_at_boot'));

    const failed = harness({ mode: 'ok', syncDirectory: (path) => (basename(path) === 'planner-evidence' ? Promise.reject(new Error('EIO')) : syncDirectory(path)) });
    placeEvidence(failed, commandId, evidenceLine(commandId, uuid(), { sent: false, outcome: 'executor_busy' }));
    await failed.executor.boot();
    assert.equal(haltReason(failed.gatewayDirectory), 'evidence_sync_failed');
    assert.equal(await failed.executor.sent(commandId), null, 'not read once its sync failed');
    assert.equal(failed.reaps(), 1);
  });

  it('K3: a halt marker that could not be made durable is written again in full before the next start, not synced again', async () => {
    const w = work();
    let failing = true;
    const answers = [true];
    const h: Harness = harness({
      mode: 'ok',
      plan: readyPlanFor({ ...w } as never),
      probe: () => Promise.resolve(answers.shift() ?? false),
      syncDirectory: (path) => (failing && path === h.gatewayDirectory ? Promise.reject(new Error('EIO')) : syncDirectory(path)),
    });
    // The evidence directory already exists, so a refusal's record syncs only its own directory.
    mkdirSync(join(h.gatewayDirectory, 'planner-evidence'), { recursive: true });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.ok(h.logged.includes('agy.halt_write_failed'));
    const marker = join(h.gatewayDirectory, 'planner-halted.json');
    const reason = haltReason(h.gatewayDirectory);
    const firstIno = statSync(marker).ino;
    failing = false;
    const control = await failingSyncs();
    try {
      const next = work();
      assert.deepEqual(await h.executor.start(next, await identityFor(h.executor, next.commandId)), { kind: 'not_sent' }, 'still halted');
      const rewrittenIno = statSync(marker).ino;
      assert.notEqual(rewrittenIno, firstIno, 'a new file, not the first one synced again');
      const file = syncAt(control.syncs, rewrittenIno, false);
      const directory = syncAt(control.syncs, statSync(h.gatewayDirectory).ino, true, file);
      assert.ok(file !== -1 && directory !== -1, `the new marker, then its directory: ${JSON.stringify(control.syncs)}`);
    } finally {
      control.stop();
    }
    assert.ok(h.logged.includes('agy.halt_persisted'));
    assert.equal(haltReason(h.gatewayDirectory), reason, 'the first reason stands');
    assert.equal(h.launches, 0);
  });
});

describe('the tenth round: what an earlier process left is written again in full at boot, never synced again', () => {
  it('a worker record store writes each record an earlier process left again in full before its first read, then syncs its directory and the Gateway\'s', async () => {
    const w = work();
    const identity = await identityFor(harness({ mode: 'ok' }).executor, w.commandId);
    const root = temporary('buildroom-agy-records-earlier-');
    const directory = plannerRecordsDirectory(root);
    mkdirSync(directory, { recursive: true });
    const file = join(directory, evidenceName(w.commandId));
    const text = `${JSON.stringify({ commandId: w.commandId, phase: 'attested', identity })}\n`;
    writeFileSync(file, text);
    const fileIno = statSync(file).ino;
    linkSync(file, join(temporary('buildroom-agy-held-'), 'earlier.json'));
    const recording = await startRecordingSyncs();
    let record: PlannerRecord | null;
    try {
      record = await new PlannerRecordStore(directory).read(w.commandId);
    } finally {
      recording.stop();
    }
    assert.equal(record?.phase, 'attested');
    assert.equal(syncAt(recording.syncs, fileIno, false), -1, 'the earlier process\'s file is not synced again');
    const copy = statSync(file).ino;
    assert.notEqual(copy, fileIno, 'the record at the path is the copy written here');
    assert.equal(readFileSync(file, 'utf8'), text, 'with the same bytes');
    const copied = syncAt(recording.syncs, copy, false);
    const directoryAt = syncAt(recording.syncs, statSync(directory).ino, true, copied);
    const above = syncAt(recording.syncs, statSync(root).ino, true, directoryAt);
    assert.ok(copied !== -1 && directoryAt !== -1 && above !== -1, `the copy, then its directory, then the Gateway's: ${JSON.stringify(recording.syncs)}`);
  });

  it('a halt marker an earlier process left is written again in full at boot, then its directory synced; the executor stays halted', async () => {
    const w = work();
    const h = harness({ mode: 'ok', plan: readyPlanFor({ ...w } as never) });
    mkdirSync(h.gatewayDirectory, { recursive: true });
    const marker = join(h.gatewayDirectory, 'planner-halted.json');
    const text = `${JSON.stringify({ haltedAt: '2026-10-27T00:00:00.000Z', reason: 'planner_user_survived_reap', plannerUser: 'planner' })}\n`;
    writeFileSync(marker, text);
    const markerIno = statSync(marker).ino;
    linkSync(marker, join(temporary('buildroom-agy-held-'), 'earlier-marker.json'));
    const recording = await startRecordingSyncs();
    try {
      await h.executor.boot();
    } finally {
      recording.stop();
    }
    assert.equal(syncAt(recording.syncs, markerIno, false), -1, 'the earlier marker is not synced again');
    const copy = statSync(marker).ino;
    assert.notEqual(copy, markerIno, 'the marker at the path is the copy written here');
    assert.equal(readFileSync(marker, 'utf8'), text, 'with the same reason');
    const copied = syncAt(recording.syncs, copy, false);
    assert.ok(copied !== -1 && syncAt(recording.syncs, statSync(h.gatewayDirectory).ino, true, copied) !== -1, `the copy, then the Gateway's directory: ${JSON.stringify(recording.syncs)}`);
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
  });

  it('a halt marker an earlier process left that cannot be rewritten at boot holds the halt in memory, and is written again before the next start', async () => {
    const w = work();
    const h = harness({ mode: 'ok', plan: readyPlanFor({ ...w } as never) });
    // The evidence directory is there and empty, so boot writes no file but the marker's copy.
    mkdirSync(join(h.gatewayDirectory, 'planner-evidence'), { recursive: true });
    const marker = join(h.gatewayDirectory, 'planner-halted.json');
    const text = `${JSON.stringify({ haltedAt: '2026-10-27T00:00:00.000Z', reason: 'planner_user_survived_reap', plannerUser: 'planner' })}\n`;
    writeFileSync(marker, text);
    // During boot only, every file sync fails: the marker's copy cannot be made durable.
    const probe = await openFile(FAKE_AGY, 'r');
    const prototype = Object.getPrototypeOf(probe) as unknown as { sync: (this: FileHandle) => Promise<void> };
    await probe.close();
    const original = prototype.sync;
    prototype.sync = async function (this: FileHandle): Promise<void> {
      if (!(await this.stat()).isDirectory()) throw new Error('EIO');
      return original.call(this);
    };
    try {
      await h.executor.boot();
    } finally {
      prototype.sync = original;
    }
    assert.ok(h.logged.includes('agy.halt_write_failed'));
    // The file is gone, but the halt boot could not make durable holds in this process, and the
    // next start's halt check writes the marker again in full before it refuses.
    rmSync(marker, { force: true });
    assert.deepEqual(await h.executor.start(w, await identityFor(h.executor, w.commandId)), { kind: 'not_sent' });
    assert.equal(h.launches, 0);
    assert.equal(readFileSync(marker, 'utf8'), text, 'written again in full, with the earlier reason');
  });

  it('a halt marker at boot that is not a regular file is never read or written through: it is replaced by a marker that says so', async () => {
    const h = harness({ mode: 'ok' });
    mkdirSync(h.gatewayDirectory, { recursive: true });
    const elsewhere = join(temporary('buildroom-agy-elsewhere-'), 'target.json');
    writeFileSync(elsewhere, 'not a marker\n');
    const marker = join(h.gatewayDirectory, 'planner-halted.json');
    symlinkSync(elsewhere, marker);
    await h.executor.boot();
    assert.equal(lstatSync(marker).isFile(), true, 'the link is replaced by a regular file');
    assert.equal(haltReason(h.gatewayDirectory), 'halt_marker_unreadable_at_boot');
    assert.equal(readFileSync(elsewhere, 'utf8'), 'not a marker\n', 'what the link pointed to is untouched');
  });
});

