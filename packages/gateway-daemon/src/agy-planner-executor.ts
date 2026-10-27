/**
 * The Planner's executor on Antigravity: agy, run headless on Gateway
 * `1880c12d` only (FOUNDER-RULING-20261026-BR-PLANNER-EXECUTOR and its
 * Amendments 1 and 2, recorded in FounderOS `DEC-20260827-01` Section 12;
 * its Amendment 3, SHA-256 `c3a257ef…2fa5`, recorded in FounderOS pull
 * request 409; and its Amendment 4).
 *
 * WHAT IT IS BOUND TO (the ruling's B1). One seat, `architect`; one lane,
 * `antigravity`, `gemini-4-argon`, effort high, which agy names
 * `gemini-4-argon-high`. `attest` refuses any other route, and `start`
 * refuses any identity `attest` would not have produced.
 *
 * HOW THE MODEL IS ESTABLISHED (ruling B3; Amendment 1, B1 and B2). agy is
 * started with the work held back. Its first stream-json line must be the
 * `init` event, and the work is written to its standard input only if that
 * event's `init.model` is exactly `gemini-4-argon-high`. A missing,
 * malformed, late, `auto` or different model ends the process with nothing
 * written, and `start` answers `not_sent`: the work provably never reached
 * a provider. A later event that names a different model fails the run.
 * Nothing about the model is read from any other output.
 *
 * HOW agy IS STARTED (Amendment 1, Part C; Amendment 3 B1(a); Amendment 4
 * Part C). Never as the Gateway's user: only through the first privilege
 * rule, `sudo -n -u <planner user> -- <agy>` followed by exactly
 * `PINNED_AGY_ARGUMENTS`, where `<agy>` is the planner user's own root-owned
 * copy. Before every run the executor hashes that copy, and a hash that is
 * not the one the Founder's latest act recorded starts nothing. The arguments are a frozen
 * constant, so no command, room or caller can add one; the banned flags of
 * Amendment 1 C4 are refused at module load. Each run reads a fresh
 * checkout of the target repository at the work's base commit, made by the
 * Gateway's user, readable by the planner user and writable by no one, and
 * removed after the run (C5). No repository credential is used: the
 * checkout is fetched anonymously, which only a public repository allows
 * (ruling B5).
 *
 * HOW A RUN ENDS (Amendment 3, Parts B and C, which replace Amendment 2
 * C1). The executor ends agy through `sudo`, which relays the signal, and
 * then runs the second privilege rule, `sudo -n -u <planner user> --
 * /usr/bin/pkill -KILL -u <planner user>`, so the planner user ends
 * everything it still runs, and asks the operating system whether any of
 * its processes remain. If one does, or one is running before a start, the
 * executor HALTS: it writes `planner-halted.json` in the Gateway's
 * directory, logs why, and takes no further Planner work while that file
 * exists. Only the Founder's direction restarts it, by removing the file.
 * The daemon stopping is a cancellation that ends the run in flight the same
 * way; the daemon starting reaps and checks before any Planner work.
 *
 * EVIDENCE (Amendment 1 B2; ruling B8). For each command the executor
 * writes one record in the Gateway's directory: the `init` model and
 * conversation id, the times, how the run ended. The control plane's
 * journal rows are written as before; the record is what the custody filing
 * of a counted run cites beside them.
 */

import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, open, readdir, rename, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type {
  Clock,
  PlannerIdentityWire,
  PlannerResultWire,
  PlannerRouteWire,
  PlannerWorkWire,
} from '../../gateway-protocol/src/index.js';
import { PLANDOC_SCHEMA_V1 } from '../../seat-output-schema/src/index.js';
import { createDaemonClock } from './clock.js';
import { DIRECTORY_MODE, FILE_MODE } from './paths.js';
import type { PlannerExecutor, PlannerStart } from './planner-worker.js';

/** The one lane this executor serves (the ruling's B1). */
export const AGY_PLANNER_LANE = {
  role: 'architect',
  surface: 'antigravity',
  provider: 'google',
  model: 'gemini-4-argon',
  effort: 'high',
  /** What agy calls that model at that effort, and what `init.model` must be. */
  agyModel: 'gemini-4-argon-high',
} as const;

/** The Gateway this executor may run on, and no other (the ruling's B1 and C1). */
export const AGY_PLANNER_GATEWAY_ID = '1880c12d-d98d-4a91-b25a-23320aa7f58a';

/** agy's own limit on one turn; the executor's limit sits above it. */
export const AGY_PRINT_TIMEOUT = '900s';

/**
 * The arguments the privilege rule fixes, in the order it lists them; the
 * rule matches this list character for character.
 *
 * Amendment 3 B1(a) sets them, replacing Amendment 1 C3's list: `--print`
 * is gone, because agy 1.4.7 refuses it without a value and standard input
 * starts print mode on its own (the Founder's readings on the PC,
 * 2026-10-26, 22:54Z to 22:59Z). Its B2 permits no other argument.
 */
export const PINNED_AGY_ARGUMENTS: readonly string[] = Object.freeze([
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--model',
  AGY_PLANNER_LANE.agyModel,
  '--effort',
  AGY_PLANNER_LANE.effort,
  '--mode',
  'plan',
  '--sandbox',
  '--print-timeout',
  AGY_PRINT_TIMEOUT,
]);

/** Amendment 1 C4. None may ever appear; `--add-dir` and the plugin and MCP subcommands are not used at all. */
export const BANNED_AGY_ARGUMENTS: readonly string[] = Object.freeze([
  '--dangerously-skip-permissions',
  '--remote-control',
  '--continue',
  '-c',
  '--conversation',
  '--add-dir',
]);

for (const banned of BANNED_AGY_ARGUMENTS) {
  if (PINNED_AGY_ARGUMENTS.includes(banned)) throw new Error(`banned agy argument ${banned} is pinned`);
}
if (PINNED_AGY_ARGUMENTS[PINNED_AGY_ARGUMENTS.indexOf('--mode') + 1] !== 'plan') {
  throw new Error('agy must run in plan mode');
}

/** How long agy may take to say which model it is serving, before any work is sent. */
const INIT_TIMEOUT_MS = 60_000;
/** A run that outlives agy's own limit by this much is ended by the executor. */
const RUN_GRACE_MS = 60_000;
/** After SIGTERM, how long agy has before SIGKILL. */
const STOP_GRACE_MS = 10_000;
/** One stream-json line is never larger than this; a larger one fails the run. */
const MAX_LINE_BYTES = 1024 * 1024;

const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

/** How the executor launches a process. Production is `node:child_process.spawn`. */
export type Launch = (file: string, args: readonly string[], options: { readonly cwd: string }) => ChildProcessWithoutNullStreams;

/** The second privilege rule's command (Amendment 3 B1(b)), run as the planner user. */
export const PKILL_PATH = '/usr/bin/pkill';

/** Whether any process of the planner user is running. Production asks `pgrep`. */
export type PlannerProcessProbe = () => Promise<boolean>;

/** Ends every process of the planner user. Production runs the second privilege rule. */
export type PlannerReaper = () => Promise<void>;

/** The SHA-256 of a file, as lowercase hex. */
export type FileHasher = (path: string) => Promise<string>;

/** Makes the run's read-only checkout and returns its path. Production fetches anonymously with git. */
export type CheckoutMaker = (work: PlannerWorkWire, parent: string) => Promise<string>;

export interface AgyPlannerConfig {
  /** Absolute path of `sudo`. */
  readonly sudoPath: string;
  /** The dedicated, unprivileged planner user (Amendment 1 C1). */
  readonly plannerUser: string;
  /** Absolute path of the planner user's root-owned agy copy, which the privilege rule names (Amendment 4 C1). */
  readonly agyPath: string;
  /** The copy's SHA-256 as the Founder's latest act records it (Amendment 4 C3). */
  readonly agySha256: string;
  /** A directory the Gateway's user owns and the planner user may traverse; checkouts are made below it. */
  readonly checkoutParent: string;
  /** The Gateway's own directory; evidence records are written below it. */
  readonly gatewayDirectory: string;
}

export interface AgyPlannerDeps {
  readonly launch?: Launch;
  readonly probe?: PlannerProcessProbe;
  readonly reap?: PlannerReaper;
  readonly hashFile?: FileHasher;
  readonly checkout?: CheckoutMaker;
  /** The daemon's clock boundary (contract §4). */
  readonly clock?: Clock;
  readonly log?: (level: 'info' | 'warn' | 'error', at: string, fields: Record<string, unknown>) => void;
  /** Bounds, for suites that cannot wait a minute. Production uses the constants above. */
  readonly timings?: { readonly initTimeoutMs?: number; readonly runTimeoutMs?: number; readonly stopGraceMs?: number };
}

/** The route the control plane must intend, and the route a run is observed on. */
export const AGY_PLANNER_ROUTE: PlannerRouteWire = Object.freeze({
  provider: AGY_PLANNER_LANE.provider,
  model: AGY_PLANNER_LANE.model,
  executionSurface: AGY_PLANNER_LANE.surface,
});

function routeIsLane(route: PlannerRouteWire): boolean {
  return (
    route.provider === AGY_PLANNER_LANE.provider &&
    route.model === AGY_PLANNER_LANE.model &&
    route.executionSurface === AGY_PLANNER_LANE.surface
  );
}

function identityIsLane(identity: PlannerIdentityWire): boolean {
  return (
    identity.role === AGY_PLANNER_LANE.role &&
    identity.surface === AGY_PLANNER_LANE.surface &&
    identity.provider === AGY_PLANNER_LANE.provider &&
    identity.model === AGY_PLANNER_LANE.model &&
    identity.effort === AGY_PLANNER_LANE.effort
  );
}

/** One line of agy's stream-json output, or `null` when it is not a JSON object. */
function parseEvent(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function objectAt(value: unknown, key: string): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object') return null;
  const inner = (value as Record<string, unknown>)[key];
  return inner !== null && typeof inner === 'object' && !Array.isArray(inner) ? (inner as Record<string, unknown>) : null;
}

/** Every `model` value anywhere in an event, so a mid-run switch cannot hide in a nested field. */
function modelsNamed(value: unknown, found: string[] = [], depth = 0): string[] {
  if (depth > 8 || value === null || typeof value !== 'object') return found;
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'model' && typeof inner === 'string') found.push(inner);
    else modelsNamed(inner, found, depth + 1);
  }
  return found;
}

/**
 * The work as the Planner reads it. Everything here is public-class by the
 * ruling's B5: the goal and scope the Founder's counted-run act names, and
 * the schema the control plane judges the answer against.
 */
export function plannerPrompt(work: PlannerWorkWire): string {
  const lines = [
    'You are the architect seat of the MAD Ventures Build Room, acting as its Planner.',
    'Write an Implementation Plan for the goal below. Plan only: do not modify, create or delete any file, do not run any command that changes anything, and do not contact any service.',
    `The repository ${work.repository} is checked out read-only in your working directory at commit ${work.baseSha}.`,
    '',
    'GOAL',
    work.goal,
    '',
    'SCOPE PATHS (the plan may touch only these)',
    ...work.scopePaths.map((path) => `- ${path}`),
  ];
  if (work.revision !== undefined) {
    lines.push('', 'THE FOUNDER ASKED FOR A REVISION OF AN EARLIER PLAN', `Earlier plan hash: ${work.revision.revisingPlanHash}`, work.revision.feedback);
  }
  lines.push(
    '',
    'ANSWER',
    'Reply with exactly one JSON object and nothing else: no prose, no code fence. It must satisfy this schema, in which `additional_properties: false` means no other key is allowed:',
    JSON.stringify(PLANDOC_SCHEMA_V1),
    `Use "repository": ${JSON.stringify(work.repository)}, "base_sha": ${JSON.stringify(work.baseSha)} and "work_id": ${JSON.stringify(work.commandId)}.`,
    'Set "terminal_status" to "PLAN_READY_FOR_FOUNDER_APPROVAL" only if the plan is complete; otherwise to the blocked or inconclusive status that applies.',
  );
  return lines.join('\n');
}

/**
 * One user turn on agy's stream-json input: the same `event` envelope as its
 * output. The Founder's readings of agy 1.4.7 on the PC (2026-10-26, 23:01Z
 * and 23:36Z) found this the only accepted shape: without `event` agy refuses
 * the line, an unknown event is ignored with a warning, and a string
 * `message` fails to decode.
 */
export function agyInputLine(prompt: string): string {
  return `${JSON.stringify({ event: 'user', message: { role: 'user', content: prompt } })}\n`;
}

/** The plan document in agy's final response: the whole response, or one fenced JSON block. */
export function planDocumentFrom(response: string): unknown {
  const trimmed = response.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
  return JSON.parse(fenced === null ? trimmed : (fenced[1] ?? ''));
}

interface EvidenceRecord {
  readonly commandId: string;
  readonly executionId: string;
  readonly startedAt: string;
  /** The agy copy's SHA-256 as read before the run, or `null` when it was not read. */
  readonly agySha256: string | null;
  readonly initModel: string | null;
  readonly conversationId: string | null;
  readonly sent: boolean;
  readonly endedAt: string | null;
  readonly outcome: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
}

export class AgyPlannerExecutor implements PlannerExecutor {
  private readonly launch: Launch;
  private readonly probe: PlannerProcessProbe;
  private readonly reap: PlannerReaper;
  private readonly hashFile: FileHasher;
  private readonly checkout: CheckoutMaker;
  private readonly clock: Clock;
  private readonly initTimeoutMs: number;
  private readonly runTimeoutMs: number;
  private readonly stopGraceMs: number;
  /** One run at a time: the planner user is one user, and the lingering-process check reads the whole user. */
  private busy = false;
  /** The run in flight and its settling, so a stopping daemon can cancel it (Amendment 3 C2). */
  private inFlight: { readonly run: AgyRun; readonly settled: Promise<unknown> } | null = null;
  /** A halt whose file could not be written still holds for this process. */
  private haltedInMemory = false;

  constructor(
    private readonly config: AgyPlannerConfig,
    private readonly deps: AgyPlannerDeps = {},
  ) {
    for (const [name, value] of Object.entries({ sudoPath: config.sudoPath, agyPath: config.agyPath, checkoutParent: config.checkoutParent })) {
      if (!value.startsWith('/')) throw new Error(`${name} must be an absolute path`);
    }
    if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(config.plannerUser)) throw new Error('plannerUser is not a user name');
    if (!/^[0-9a-f]{64}$/.test(config.agySha256)) throw new Error('agySha256 is not a lowercase SHA-256');
    this.launch = deps.launch ?? ((file, args, options) => spawn(file, [...args], { cwd: options.cwd, stdio: 'pipe' }));
    this.probe = deps.probe ?? pgrepProbe(config.plannerUser);
    this.reap = deps.reap ?? pkillReaper(this.reapCommandLine());
    this.hashFile = deps.hashFile ?? sha256OfFile;
    this.checkout = deps.checkout ?? gitCheckout;
    this.clock = deps.clock ?? createDaemonClock();
    this.initTimeoutMs = deps.timings?.initTimeoutMs ?? INIT_TIMEOUT_MS;
    this.runTimeoutMs = deps.timings?.runTimeoutMs ?? parseSeconds(AGY_PRINT_TIMEOUT) * 1000 + RUN_GRACE_MS;
    this.stopGraceMs = deps.timings?.stopGraceMs ?? STOP_GRACE_MS;
  }

  /** The command line the first privilege rule must match, exactly. */
  commandLine(): readonly string[] {
    return [this.config.sudoPath, '-n', '-u', this.config.plannerUser, '--', this.config.agyPath, ...PINNED_AGY_ARGUMENTS];
  }

  /** The command line the second privilege rule must match, exactly (Amendment 3 B1(b)). */
  reapCommandLine(): readonly string[] {
    return [this.config.sudoPath, '-n', '-u', this.config.plannerUser, '--', PKILL_PATH, '-KILL', '-u', this.config.plannerUser];
  }

  /** Answered from the lane alone: no process starts and no provider is contacted. */
  attest(request: { readonly commandId: string; readonly role: string; readonly intended: PlannerRouteWire }): Promise<PlannerIdentityWire> {
    if (request.role !== AGY_PLANNER_LANE.role) return Promise.reject(new Error(`role ${request.role} is not bound to this executor`));
    if (!routeIsLane(request.intended)) return Promise.reject(new Error('the intended route is not the bound lane'));
    return Promise.resolve({
      executionId: randomUUID(),
      role: AGY_PLANNER_LANE.role,
      surface: AGY_PLANNER_LANE.surface,
      model: AGY_PLANNER_LANE.model,
      provider: AGY_PLANNER_LANE.provider,
      effort: AGY_PLANNER_LANE.effort,
    });
  }

  async start(work: PlannerWorkWire, identity: PlannerIdentityWire): Promise<PlannerStart> {
    // Everything before the work is written is refusable with `not_sent`.
    if (!identityIsLane(identity)) return this.refuse(work, identity, 'identity_not_lane');
    if (!REPOSITORY_PATTERN.test(work.repository) || !FULL_SHA_PATTERN.test(work.baseSha)) {
      return this.refuse(work, identity, 'work_not_checkoutable');
    }
    if (await this.isHalted()) return this.refuse(work, identity, 'executor_halted');
    if (this.busy) return this.refuse(work, identity, 'executor_busy');
    this.busy = true;
    let released = false;
    const release = (): void => {
      if (!released) {
        released = true;
        this.busy = false;
      }
    };
    try {
      return await this.startHeld(work, identity, release);
    } catch (error) {
      release();
      throw error;
    }
  }

  private async startHeld(work: PlannerWorkWire, identity: PlannerIdentityWire, release: () => void): Promise<PlannerStart> {
    let lingering: boolean;
    try {
      lingering = await this.probe();
    } catch (error) {
      this.log('error', 'agy.probe_failed', { message: describe(error) });
      release();
      return this.refuse(work, identity, 'probe_failed');
    }
    if (lingering) {
      await this.halt('planner_user_has_processes_before_start');
      release();
      return this.refuse(work, identity, 'planner_user_has_processes');
    }

    let agySha256: string;
    try {
      agySha256 = await this.hashFile(this.config.agyPath);
    } catch (error) {
      this.log('error', 'agy.hash_failed', { message: describe(error) });
      release();
      return this.refuse(work, identity, 'agy_hash_failed');
    }
    if (agySha256 !== this.config.agySha256) {
      this.log('error', 'agy.hash_mismatch', { expected: this.config.agySha256, read: agySha256 });
      release();
      return this.refuse(work, identity, 'agy_hash_mismatch', agySha256);
    }

    let directory: string;
    try {
      directory = await this.checkout(work, this.config.checkoutParent);
    } catch (error) {
      this.log('warn', 'agy.checkout_failed', { message: describe(error) });
      release();
      return this.refuse(work, identity, 'checkout_failed');
    }

    const startedAt = this.isoNow();
    const [file, ...args] = this.commandLine() as [string, ...string[]];
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.launch(file, args, { cwd: directory });
    } catch (error) {
      await removeCheckout(directory);
      release();
      this.log('warn', 'agy.launch_failed', { message: describe(error) });
      return this.refuse(work, identity, 'launch_failed');
    }
    const run = new AgyRun(child, this.stopGraceMs, this.clock);

    const init = await run.firstEvent(this.initTimeoutMs);
    const initBody = init === null ? null : objectAt(init, 'init');
    const initModel = initBody !== null && typeof initBody['model'] === 'string' ? initBody['model'] : null;
    const conversationId = init !== null && typeof init['conversation_id'] === 'string' ? init['conversation_id'] : null;
    if (init === null || init['event'] !== 'init' || initModel !== AGY_PLANNER_LANE.agyModel) {
      // Nothing was written to agy's input: the work never left this host.
      const ended = await run.stop();
      await this.reapPlannerUser();
      await removeCheckout(directory);
      release();
      const outcome = init === null ? 'no_init_event' : init['event'] !== 'init' ? 'first_event_not_init' : 'init_model_mismatch';
      await this.evidence({
        commandId: work.commandId,
        executionId: identity.executionId,
        startedAt,
        agySha256,
        initModel,
        conversationId,
        sent: false,
        endedAt: this.isoNow(),
        outcome,
        ...ended,
      });
      this.log('warn', 'agy.not_sent', { outcome, initModel });
      return { kind: 'not_sent' };
    }

    // The model is the lane's: the work goes in, and from here contact cannot be ruled out.
    run.send(agyInputLine(plannerPrompt(work)));
    const evidenceBase = { commandId: work.commandId, executionId: identity.executionId, startedAt, agySha256, initModel, conversationId, sent: true };
    await this.evidence({ ...evidenceBase, endedAt: null, outcome: 'running', exitCode: null, signal: null });

    const completion = run.result(this.runTimeoutMs).then(
      async (outcome) => {
        this.inFlight = null;
        const ended = await run.stop();
        await this.reapPlannerUser();
        await removeCheckout(directory);
        release();
        await this.evidence({ ...evidenceBase, endedAt: this.isoNow(), outcome: outcome.kind, ...ended });
        if (outcome.kind !== 'plan') throw new Error(`agy run ended without a plan: ${outcome.kind}`);
        return { kind: 'plan', document: outcome.document } satisfies PlannerResultWire;
      },
    );
    this.inFlight = { run, settled: completion.catch(() => undefined) };
    return { kind: 'accepted', observed: { ...AGY_PLANNER_ROUTE }, completion };
  }

  /** Before the daemon takes any Planner work: reap and check (Amendment 3 C2). */
  async boot(): Promise<void> {
    await this.reapPlannerUser();
  }

  /** The daemon is stopping: a run in flight is a cancellation, ended under Amendment 3 C1. */
  async shutdown(): Promise<void> {
    const inFlight = this.inFlight;
    if (inFlight === null) return;
    this.log('warn', 'agy.cancelled_by_shutdown', {});
    await inFlight.run.stop();
    await inFlight.settled;
  }

  /**
   * The second privilege rule, then the check (Amendment 3 C1). A process
   * that survives, or a check that cannot be made, halts the executor.
   */
  private async reapPlannerUser(): Promise<void> {
    try {
      await this.reap();
    } catch (error) {
      this.log('error', 'agy.reap_failed', { message: describe(error) });
    }
    let remains: boolean;
    try {
      remains = await this.probe();
    } catch (error) {
      this.log('error', 'agy.probe_failed', { message: describe(error) });
      remains = true;
    }
    if (remains) await this.halt('planner_user_survived_reap');
  }

  private haltPath(): string {
    return join(this.config.gatewayDirectory, 'planner-halted.json');
  }

  private async isHalted(): Promise<boolean> {
    if (this.haltedInMemory) return true;
    try {
      await lstat(this.haltPath());
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== 'ENOENT';
    }
  }

  /**
   * Take no further Planner work until the Founder directs otherwise
   * (Amendment 3 C1), by removing the file. The log line is what the builder
   * reports to the Founder.
   */
  private async halt(reason: string): Promise<void> {
    this.log('error', 'agy.halted', { reason, haltFile: this.haltPath(), plannerUser: this.config.plannerUser });
    try {
      await mkdir(this.config.gatewayDirectory, { recursive: true, mode: DIRECTORY_MODE });
      const handle = await open(this.haltPath(), 'w', FILE_MODE);
      try {
        await handle.writeFile(`${JSON.stringify({ haltedAt: this.isoNow(), reason, plannerUser: this.config.plannerUser })}\n`, { encoding: 'utf8' });
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      this.log('error', 'agy.halt_write_failed', { message: describe(error) });
      this.haltedInMemory = true;
    }
  }

  private async refuse(work: PlannerWorkWire, identity: PlannerIdentityWire, outcome: string, agySha256: string | null = null): Promise<PlannerStart> {
    await this.evidence({
      commandId: work.commandId,
      executionId: identity.executionId,
      startedAt: this.isoNow(),
      agySha256,
      initModel: null,
      conversationId: null,
      sent: false,
      endedAt: this.isoNow(),
      outcome,
      exitCode: null,
      signal: null,
    });
    return { kind: 'not_sent' };
  }

  /** Atomic tmp+rename, mode 0600, one file per command, overwritten as the run moves on. */
  private async evidence(record: EvidenceRecord): Promise<void> {
    const directory = join(this.config.gatewayDirectory, 'planner-evidence');
    try {
      await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
      const target = join(directory, `${createHash('sha256').update(record.commandId, 'utf8').digest('hex')}.json`);
      const temporary = join(directory, `.evidence.${randomUUID()}.tmp`);
      const handle = await open(temporary, 'wx', FILE_MODE);
      try {
        await handle.writeFile(`${JSON.stringify(record)}\n`, { encoding: 'utf8' });
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, target).catch(async (error: unknown) => {
        await unlink(temporary).catch(() => undefined);
        throw error;
      });
    } catch (error) {
      this.log('error', 'agy.evidence_failed', { message: describe(error) });
    }
  }

  private isoNow(): string {
    return new Date(this.clock.wallNow()).toISOString();
  }

  private log(level: 'info' | 'warn' | 'error', at: string, fields: Record<string, unknown>): void {
    this.deps.log?.(level, at, fields);
  }
}

type RunOutcome =
  | { readonly kind: 'plan'; readonly document: unknown }
  | { readonly kind: 'agy_error' | 'no_result' | 'unparseable_plan' | 'model_switched' | 'malformed_output' | 'timed_out' };

/** One agy process: its output as events, its input written once, its end. */
class AgyRun {
  private readonly events: Record<string, unknown>[] = [];
  private readonly waiters: (() => void)[] = [];
  private closed = false;
  private malformed = false;
  private readonly exited: Promise<{ exitCode: number | null; signal: string | null }>;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly stopGraceMs: number,
    private readonly clock: Clock,
  ) {
    this.exited = new Promise((resolve) => {
      child.once('error', () => resolve({ exitCode: null, signal: null }));
      child.once('close', (code, signal) => resolve({ exitCode: code, signal }));
    });
    child.stdin.on('error', () => undefined);
    child.stderr.resume();
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', (line) => {
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
        this.malformed = true;
        return this.wake();
      }
      if (line.trim() === '') return;
      const event = parseEvent(line);
      if (event === null) this.malformed = true;
      else this.events.push(event);
      this.wake();
    });
    lines.on('close', () => {
      this.closed = true;
      this.wake();
    });
  }

  private wake(): void {
    for (const waiter of this.waiters.splice(0)) waiter();
  }

  private next(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      this.waiters.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  /** The first output line, if it is a JSON object and arrives in time. Nothing has been written yet. */
  async firstEvent(timeoutMs: number): Promise<Record<string, unknown> | null> {
    const deadline = this.clock.monotonicNow() + timeoutMs;
    while (this.events.length === 0 && !this.malformed && !this.closed) {
      const remaining = deadline - this.clock.monotonicNow();
      if (remaining <= 0 || !(await this.next(remaining))) return null;
    }
    return this.malformed ? null : (this.events[0] ?? null);
  }

  send(line: string): void {
    this.child.stdin.end(line);
  }

  /** Read on until the `result` event; every event after `init` must name no other model. */
  async result(timeoutMs: number): Promise<RunOutcome> {
    const deadline = this.clock.monotonicNow() + timeoutMs;
    let index = 1;
    for (;;) {
      while (index < this.events.length) {
        const event = this.events[index++] ?? {};
        if (modelsNamed(event).some((model) => model !== AGY_PLANNER_LANE.agyModel)) return { kind: 'model_switched' };
        if (event['event'] === 'result') {
          const result = objectAt(event, 'result');
          if (result === null || result['status'] !== 'SUCCESS' || typeof result['response'] !== 'string') return { kind: 'agy_error' };
          try {
            return { kind: 'plan', document: planDocumentFrom(result['response']) };
          } catch {
            return { kind: 'unparseable_plan' };
          }
        }
      }
      if (this.malformed) return { kind: 'malformed_output' };
      if (this.closed) return { kind: 'no_result' };
      const remaining = deadline - this.clock.monotonicNow();
      if (remaining <= 0 || !(await this.next(remaining))) return { kind: 'timed_out' };
    }
  }

  /** End agy: SIGTERM through sudo, then SIGKILL after the grace. Resolves when it has exited. */
  async stop(): Promise<{ exitCode: number | null; signal: string | null }> {
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.stdin.destroy();
      this.child.kill('SIGTERM');
      const timer = setTimeout(() => this.child.kill('SIGKILL'), this.stopGraceMs);
      const ended = await this.exited;
      clearTimeout(timer);
      return ended;
    }
    return this.exited;
  }
}

function parseSeconds(value: string): number {
  const match = /^(\d+)s$/.exec(value);
  if (match === null) throw new Error(`not a seconds value: ${value}`);
  return Number(match[1]);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * git runs with none of the Gateway user's configuration: no global or
 * system file (so no `insteadOf` can turn the anonymous HTTPS fetch into an
 * SSH one with the Founder's key), no credential helper, no prompt.
 */
const ISOLATED_GIT_ENV: Readonly<Record<string, string>> = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '/bin/false',
  SSH_ASKPASS: '/bin/false',
  GIT_SSH_COMMAND: '/bin/false',
};

function execute(file: string, args: readonly string[], cwd?: string): Promise<{ code: number }> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { cwd, timeout: 300_000, env: { ...process.env, ...ISOLATED_GIT_ENV } }, (error) => {
      if (error === null) return resolve({ code: 0 });
      const code = (error as NodeJS.ErrnoException & { code?: unknown }).code;
      if (typeof code === 'number') return resolve({ code });
      reject(error);
    });
  });
}

/** The second privilege rule. `pkill` exits 0 when it signalled a process and 1 when none matched; both are a clean reap. */
export function pkillReaper(commandLine: readonly string[]): PlannerReaper {
  return async () => {
    const [file, ...args] = commandLine as [string, ...string[]];
    const { code } = await execute(file, args);
    if (code !== 0 && code !== 1) throw new Error(`pkill rule exited ${code}`);
  };
}

/** The SHA-256 of a file, streamed. */
export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  const handle = await open(path, 'r');
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk as Buffer);
  } finally {
    await handle.close().catch(() => undefined);
  }
  return hash.digest('hex');
}

/** `pgrep -u <user>` exits 0 when the user has a process, 1 when it has none; anything else is an error. */
export function pgrepProbe(user: string, pgrep = '/usr/bin/pgrep'): PlannerProcessProbe {
  return async () => {
    const { code } = await execute(pgrep, ['-u', user]);
    if (code === 0) return true;
    if (code === 1) return false;
    throw new Error(`pgrep exited ${code}`);
  };
}

/**
 * The run's checkout: the work's repository at its base commit, fetched with
 * no credential, every file read-only to everyone. The Gateway's user owns
 * it, so the planner user, who is not the owner, can read it and cannot
 * write it.
 */
export async function gitCheckout(work: PlannerWorkWire, parent: string): Promise<string> {
  const directory = await mkdtemp(join(parent, 'run-'));
  try {
    const git = '/usr/bin/git';
    const steps: (readonly string[])[] = [
      ['init', '--quiet'],
      ['-c', 'credential.helper=', 'fetch', '--quiet', '--depth', '1', '--no-tags', `https://github.com/${work.repository}.git`, work.baseSha],
      ['-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach', work.baseSha],
    ];
    for (const step of steps) {
      const { code } = await execute(git, step, directory);
      if (code !== 0) throw new Error(`git ${step[0] === '-c' ? step[2] : step[0]} exited ${code}`);
    }
    await readOnly(directory);
    return directory;
  } catch (error) {
    await removeCheckout(directory);
    throw error;
  }
}

/**
 * Directories 0555 and files 0444, depth first, so nothing in the tree is
 * writable. `lstat`, never `stat`: a symbolic link in the repository is
 * left alone and never followed, so a hostile tree cannot point the chmod
 * at a file outside the checkout, such as a private key.
 */
export async function readOnly(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isDirectory()) {
    for (const name of await readdir(path)) await readOnly(join(path, name));
    await chmod(path, 0o555);
  } else if (info.isFile()) {
    await chmod(path, 0o444);
  }
}

/** Owner write is restored on each directory first, so the tree can be removed. */
export async function removeCheckout(path: string): Promise<void> {
  const writable = async (target: string): Promise<void> => {
    const info = await lstat(target).catch(() => null);
    if (info === null || !info.isDirectory()) return;
    await chmod(target, 0o755).catch(() => undefined);
    for (const name of await readdir(target).catch(() => [] as string[])) await writable(join(target, name));
  };
  await writable(path);
  await rm(path, { recursive: true, force: true }).catch(() => undefined);
}
