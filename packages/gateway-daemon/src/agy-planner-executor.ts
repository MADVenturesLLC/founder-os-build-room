/**
 * The Planner's executor on Antigravity: agy, run headless on Gateway
 * `1880c12d` only (FOUNDER-RULING-20261026-BR-PLANNER-EXECUTOR and its
 * Amendments 1, 2 and 3, recorded in FounderOS `DEC-20260827-01` Section
 * 12, Amendment 3 being the text with SHA-256
 * c3a257ef954239cdd1391b8d1b612e3843237219ba060b0c458057742fdfa2f5; and its
 * Amendments 4 and 5, SHA-256
 * d514039964bb60eb0c634a19a6c34e18931ace19499960a80369d106c8cfe39d and
 * f2aa86a251cb6a2399c92b42f66606309cba807f5a416a6ff4e76622b192fdee, signed in
 * builders' sessions on 2026-10-27).
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
 * C1). The executor ends agy through `sudo`, which relays SIGTERM, then
 * SIGKILLs sudo, waiting a bounded time for it to exit and never on agy's
 * output pipes; then it runs the second privilege rule, `sudo -n -u
 * <planner user> -- /usr/bin/pkill -KILL -u <planner user>`, so the planner
 * user ends everything it still runs, and asks the operating system whether
 * any of its processes remain. The executor HALTS when one does, when one
 * runs before a start, when either check cannot be made, when sudo's exit is
 * not seen in time, when a checkout cannot be removed, or when an evidence
 * record cannot be written or read: it writes `planner-halted.json` in the
 * Gateway's directory, logs why, and takes no further Planner work while
 * that file exists. Only the Founder's direction restarts it, by removing
 * the file. The daemon stopping is a cancellation that ends the start in
 * flight the same way, from its first check on; the daemon starting reaps
 * and checks before any Planner work.
 *
 * EVIDENCE (Amendment 5 B3; ruling B8). For each command the executor
 * writes one record in the Gateway's directory: the `init` model and
 * conversation id, the times, the agy copy's hash, whether the checkout was
 * removed, how the run ended. A run's record is durable before its work is
 * written to agy; if it cannot be, nothing is sent. The record is
 * supplemental evidence, not the journal and not a substitute for it: the
 * control plane's journal rows are written as before, and the custody
 * filing of a counted run files the record beside them. Amendment 5 B1
 * puts the init model and conversation id into the canonical journal
 * itself; the wire-protocol and control-plane change for that is a later
 * act's, and until it merges no counted run proceeds (Amendment 5 B2).
 */

import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
import { syncDirectory, type PlannerExecutor, type PlannerStart } from './planner-worker.js';

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
  /** Removes a run's checkout, rejecting when it remains. Production is `removeCheckout`. */
  readonly removeCheckout?: (path: string) => Promise<void>;
  /**
   * The primary Gateway identity the daemon holds now. A promotion can
   * replace it after the executor was selected, so `attest` and `start` ask
   * each time and serve only while it is `1880c12d`.
   */
  readonly currentGatewayId?: () => Promise<string | null>;
  /**
   * The primary Gateway identity held in memory, read synchronously. The last
   * checks before the work is written are made with nothing awaited between
   * them and the write, so a promotion cannot land in between.
   */
  readonly heldGatewayId?: () => string | null;
  /** Makes a directory's entries durable (fsync). Production is `syncDirectory`. */
  readonly syncDirectory?: (path: string) => Promise<void>;
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

/** `attest` issues `randomUUID()`; an execution id of any other shape is not one it produced. */
const EXECUTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function identityIsLane(identity: PlannerIdentityWire): boolean {
  return (
    EXECUTION_ID_PATTERN.test(identity.executionId) &&
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

/**
 * Every `model` value anywhere in an event, at any depth, so a mid-run
 * switch cannot hide in a nested field. A stack, not recursion: a line is at
 * most `MAX_LINE_BYTES`, and nesting that deep must not end the scan early.
 */
export function modelsNamed(value: unknown): string[] {
  const found: string[] = [];
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === null || typeof next !== 'object') continue;
    for (const [key, inner] of Object.entries(next as Record<string, unknown>)) {
      if (key === 'model' && typeof inner === 'string') found.push(inner);
      else pending.push(inner);
    }
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
  /** Whether the run's checkout was removed (Amendment 1 C5); `null` when there was none, or the run is still going. */
  readonly checkoutRemoved: boolean | null;
}

/** Enough of a record's shape to close it at boot: an object with a command id and an outcome. */
function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record['commandId'] === 'string' && record['commandId'] !== '' && typeof record['outcome'] === 'string';
}

/** A start from its first check to its last evidence write; `run` once agy is launched. */
interface InFlight {
  run: AgyRun | null;
  readonly settled: Promise<void>;
}

/** The checkout failed and its directory could not be removed either. */
export class CheckoutLeftBehindError extends Error {
  constructor(
    readonly directory: string,
    cause: unknown,
  ) {
    super(`checkout failed, and ${directory} could not be removed: ${describe(cause)}`);
  }
}

export class AgyPlannerExecutor implements PlannerExecutor {
  private readonly launch: Launch;
  private readonly probe: PlannerProcessProbe;
  private readonly reap: PlannerReaper;
  private readonly hashFile: FileHasher;
  private readonly checkout: CheckoutMaker;
  private readonly removeDirectory: (path: string) => Promise<void>;
  private readonly clock: Clock;
  private readonly initTimeoutMs: number;
  private readonly runTimeoutMs: number;
  private readonly stopGraceMs: number;
  /** One run at a time: the planner user is one user, and the lingering-process check reads the whole user. */
  private busy = false;
  /** The start in flight, from its first check to its last evidence write, so a stopping daemon can cancel it (Amendment 3 C2). */
  private inFlight: InFlight | null = null;
  /** Set by `shutdown`: no start begins after the daemon begins to stop. */
  private shuttingDown = false;
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
    this.launch = deps.launch ?? ((file, args, options) => spawn(file, [...args], { cwd: options.cwd, stdio: 'pipe', env: childEnvironment() }));
    this.probe = deps.probe ?? pgrepProbe(config.plannerUser);
    this.reap = deps.reap ?? pkillReaper(this.reapCommandLine());
    this.hashFile = deps.hashFile ?? sha256OfFile;
    this.checkout = deps.checkout ?? gitCheckout;
    this.removeDirectory = deps.removeCheckout ?? removeCheckout;
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

  /** Whether the daemon still holds Gateway 1880c12d's identity. A reader that fails is not proof that it does. */
  private async onBoundGateway(): Promise<boolean> {
    if (this.deps.currentGatewayId === undefined) return this.holdsBoundGateway();
    try {
      return (await this.deps.currentGatewayId()) === AGY_PLANNER_GATEWAY_ID && this.holdsBoundGateway();
    } catch (error) {
      this.log('error', 'agy.gateway_identity_unreadable', { message: describe(error) });
      return false;
    }
  }

  /** Whether the identity held in memory is still 1880c12d's, with nothing awaited. */
  private holdsBoundGateway(): boolean {
    return this.deps.heldGatewayId === undefined || this.deps.heldGatewayId() === AGY_PLANNER_GATEWAY_ID;
  }

  /** Answered from the lane alone: no process starts and no provider is contacted. */
  async attest(request: { readonly commandId: string; readonly role: string; readonly intended: PlannerRouteWire }): Promise<PlannerIdentityWire> {
    if (!(await this.onBoundGateway())) return Promise.reject(new Error('the daemon no longer holds Gateway 1880c12d\'s identity'));
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
    if (!(await this.onBoundGateway())) return this.refuse(work, identity, 'gateway_identity_changed');
    if (!REPOSITORY_PATTERN.test(work.repository) || !FULL_SHA_PATTERN.test(work.baseSha)) {
      return this.refuse(work, identity, 'work_not_checkoutable');
    }
    if (this.shuttingDown) return this.refuse(work, identity, 'daemon_stopping');
    if (await this.isHalted()) return this.refuse(work, identity, 'executor_halted');
    if (this.busy) return this.refuse(work, identity, 'executor_busy');
    // From here until the run's evidence is written, this start is the one in flight.
    this.busy = true;
    let settle!: () => void;
    const inFlight: InFlight = { run: null, settled: new Promise<void>((resolve) => (settle = resolve)) };
    this.inFlight = inFlight;
    const finish = (): void => {
      if (this.inFlight === inFlight) this.inFlight = null;
      this.busy = false;
      settle();
    };
    try {
      const started = await this.startHeld(work, identity, inFlight);
      if (started.kind === 'accepted') started.completion.then(finish, finish);
      else finish();
      return started;
    } catch (error) {
      finish();
      throw error;
    }
  }

  private async startHeld(work: PlannerWorkWire, identity: PlannerIdentityWire, inFlight: InFlight): Promise<PlannerStart> {
    // At most one execution per command: a record that says the work was sent, by this
    // process or one a crash ended, stands, and the command is not started again. The
    // answer is a rejection, not `not_sent`, because the work did reach agy once; the
    // worker records that as unknown. Neither case writes over the record.
    const prior = await this.priorEvidence(work.commandId);
    if (prior === 'sent') {
      this.log('error', 'agy.already_sent', { commandId: work.commandId });
      throw new Error('this command was already sent to agy by an earlier execution, and is not started again');
    }
    if (prior === 'unreadable') {
      await this.halt('evidence_unreadable');
      throw new Error('this command\'s evidence record cannot be read, so whether it was sent is unknown');
    }

    let lingering: boolean;
    try {
      lingering = await this.probe();
    } catch (error) {
      // A check that cannot be made is not proof that nothing runs (Amendment 3 C3).
      this.log('error', 'agy.probe_failed', { message: describe(error) });
      await this.halt('planner_user_check_failed_before_start');
      return this.refuse(work, identity, 'probe_failed');
    }
    if (lingering) {
      await this.halt('planner_user_has_processes_before_start');
      return this.refuse(work, identity, 'planner_user_has_processes');
    }

    let agySha256: string;
    try {
      agySha256 = await this.hashFile(this.config.agyPath);
    } catch (error) {
      this.log('error', 'agy.hash_failed', { message: describe(error) });
      return this.refuse(work, identity, 'agy_hash_failed');
    }
    if (agySha256 !== this.config.agySha256) {
      this.log('error', 'agy.hash_mismatch', { expected: this.config.agySha256, read: agySha256 });
      return this.refuse(work, identity, 'agy_hash_mismatch', agySha256);
    }

    let directory: string;
    try {
      directory = await this.checkout(work, this.config.checkoutParent);
    } catch (error) {
      this.log('warn', 'agy.checkout_failed', { message: describe(error) });
      const left = error instanceof CheckoutLeftBehindError;
      if (left) await this.halt('checkout_not_removed');
      return this.refuse(work, identity, 'checkout_failed', agySha256, left ? false : null);
    }
    if (this.shuttingDown) {
      return this.refuse(work, identity, 'daemon_stopping', agySha256, await this.removeRunCheckout(directory));
    }

    const startedAt = this.isoNow();
    const [file, ...args] = this.commandLine() as [string, ...string[]];
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.launch(file, args, { cwd: directory });
    } catch (error) {
      this.log('warn', 'agy.launch_failed', { message: describe(error) });
      return this.refuse(work, identity, 'launch_failed', agySha256, await this.removeRunCheckout(directory));
    }
    const run = new AgyRun(child, this.stopGraceMs, this.clock);
    inFlight.run = run;

    const init = await run.firstEvent(this.initTimeoutMs);
    const initBody = init === null ? null : objectAt(init, 'init');
    const initModel = initBody !== null && typeof initBody['model'] === 'string' ? initBody['model'] : null;
    const conversationId = init !== null && typeof init['conversation_id'] === 'string' ? init['conversation_id'] : null;
    // The identity was checked when the start began; a promotion can have landed since.
    const bound = await this.onBoundGateway();
    const evidenceBase = { commandId: work.commandId, executionId: identity.executionId, startedAt, agySha256, initModel, conversationId };
    const refused =
      init === null ? 'no_init_event'
      : init['event'] !== 'init' ? 'first_event_not_init'
      : initModel !== AGY_PLANNER_LANE.agyModel ? 'init_model_mismatch'
      // Amendment 1 B2 needs the conversation id with the command: without one, nothing is sent.
      : conversationId === null || conversationId.trim() === '' ? 'init_missing_conversation_id'
      : !bound ? 'gateway_identity_changed'
      : this.shuttingDown || run.stopping ? 'cancelled_before_send'
      : null;
    if (refused !== null) {
      // Nothing was written to agy's input: the work never left this host.
      const ended = await this.endRun(run, directory);
      await this.evidence({ ...evidenceBase, sent: false, endedAt: this.isoNow(), outcome: refused, ...ended });
      this.log('warn', 'agy.not_sent', { outcome: refused, initModel });
      return { kind: 'not_sent' };
    }

    // The record is durable before the work goes in, so no run is ever sent without one
    // (Amendment 5 B3). It says `sent` from here: contact cannot be ruled out once the
    // input may have been written, and a daemon that dies now leaves this record to boot.
    const sentBase = { ...evidenceBase, sent: true };
    if (!(await this.evidence({ ...sentBase, endedAt: null, outcome: 'running', exitCode: null, signal: null, checkoutRemoved: null }))) {
      const ended = await this.endRun(run, directory);
      await this.evidence({ ...evidenceBase, sent: false, endedAt: this.isoNow(), outcome: 'evidence_write_failed', ...ended });
      return { kind: 'not_sent' };
    }
    // The record took time to write: ask again, and make the last checks with nothing
    // awaited between them and the write, so neither a promotion nor a stop lands between.
    const boundStill = await this.onBoundGateway();
    const late =
      !boundStill || !this.holdsBoundGateway() ? 'gateway_identity_changed'
      : this.shuttingDown || run.stopping ? 'cancelled_before_send'
      : null;
    if (late !== null) {
      const ended = await this.endRun(run, directory);
      await this.evidence({ ...evidenceBase, sent: false, endedAt: this.isoNow(), outcome: late, ...ended });
      this.log('warn', 'agy.not_sent', { outcome: late, initModel });
      return { kind: 'not_sent' };
    }
    run.send(agyInputLine(plannerPrompt(work)));

    const completion = run.result(this.runTimeoutMs).then(async (outcome) => {
      const ended = await this.endRun(run, directory);
      await this.evidence({ ...sentBase, endedAt: this.isoNow(), outcome: outcome.kind, ...ended });
      if (outcome.kind !== 'plan') throw new Error(`agy run ended without a plan: ${outcome.kind}`);
      return { kind: 'plan', document: outcome.document } satisfies PlannerResultWire;
    });
    return { kind: 'accepted', observed: { ...AGY_PLANNER_ROUTE }, completion };
  }

  /**
   * Amendment 3 C1, after every run that started agy: end agy through sudo,
   * use rule B1(b), check the planner user, remove the checkout. An exit not
   * seen in time, a survivor, a failed check or a checkout left behind halts.
   */
  private async endRun(run: AgyRun, directory: string): Promise<{ exitCode: number | null; signal: string | null; checkoutRemoved: boolean }> {
    const ended = await run.stop();
    await this.reapPlannerUser();
    if (!ended.confirmed) {
      this.log('error', 'agy.exit_unconfirmed', { graceMs: this.stopGraceMs });
      await this.halt('agy_exit_unconfirmed');
    }
    const checkoutRemoved = await this.removeRunCheckout(directory);
    return { exitCode: ended.exitCode, signal: ended.signal, checkoutRemoved };
  }

  /** Amendment 1 C5: the checkout is removed after the run. One that remains halts. */
  private async removeRunCheckout(directory: string): Promise<boolean> {
    try {
      await this.removeDirectory(directory);
      return true;
    } catch (error) {
      this.log('error', 'agy.checkout_not_removed', { message: describe(error) });
      await this.halt('checkout_not_removed');
      return false;
    }
  }

  /**
   * Before the daemon takes any Planner work: reap and check (Amendment 3 C2),
   * whatever happens while stale evidence is closed.
   */
  async boot(): Promise<void> {
    try {
      await this.closeStaleEvidence();
    } finally {
      await this.reapPlannerUser();
    }
  }

  /**
   * A record still marked `running` at boot belongs to a run the previous
   * daemon did not see end (FOUNDER-ACT-20261027-BR-131-BRINGUP B4). It is
   * given a terminal outcome saying so, at the boot time.
   */
  private async closeStaleEvidence(): Promise<void> {
    const directory = join(this.config.gatewayDirectory, 'planner-evidence');
    // A record that cannot be read may be one still running: it halts, as a write that fails does.
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      this.log('error', 'agy.evidence_unreadable', { message: describe(error) });
      await this.halt('evidence_unreadable');
      return;
    }
    const bootedAt = this.isoNow();
    for (const name of names) {
      if (!name.endsWith('.json') || name.startsWith('.')) continue;
      let record: EvidenceRecord;
      try {
        const parsed: unknown = JSON.parse(await readFile(join(directory, name), 'utf8'));
        if (!isEvidenceRecord(parsed)) throw new Error('not an evidence record');
        record = parsed;
      } catch (error) {
        this.log('error', 'agy.evidence_unreadable', { name, message: describe(error) });
        await this.halt('evidence_unreadable');
        continue;
      }
      if (record.outcome !== 'running') continue;
      if (await this.evidence({ ...record, endedAt: bootedAt, outcome: 'daemon_ended_during_run' })) {
        this.log('warn', 'agy.evidence_closed_at_boot', { commandId: record.commandId });
      }
    }
  }

  /**
   * Whether the executor would serve an attestation now: the daemon still
   * holds Gateway 1880c12d's identity. The worker asks this before it
   * re-answers an attestation it already recorded.
   */
  serves(): Promise<boolean> {
    return this.onBoundGateway();
  }

  /**
   * The daemon is stopping: a run in flight is a cancellation, ended under
   * Amendment 3 C1, whether agy is still announcing its model or already
   * working. No start begins after this.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    const inFlight = this.inFlight;
    if (inFlight === null) return;
    this.log('warn', 'agy.cancelled_by_shutdown', {});
    if (inFlight.run !== null) await inFlight.run.stop();
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
      const created = await mkdir(this.config.gatewayDirectory, { recursive: true, mode: DIRECTORY_MODE });
      // Exclusive create: a path already there, link or file, is never written through.
      const handle = await open(this.haltPath(), 'wx', FILE_MODE);
      try {
        await handle.writeFile(`${JSON.stringify({ haltedAt: this.isoNow(), reason, plannerUser: this.config.plannerUser })}\n`, { encoding: 'utf8' });
        await handle.sync();
      } finally {
        await handle.close();
      }
      // The marker's directory entry survives a crash only once the directory is synced;
      // a halt that a crash could clear would let work through with no one's direction
      // (Amendment 3 C1).
      const sync = this.deps.syncDirectory ?? syncDirectory;
      await sync(this.config.gatewayDirectory);
      if (created !== undefined) await sync(dirname(this.config.gatewayDirectory));
    } catch (error) {
      // Already there: the executor is halted already, and the first reason stands.
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return;
      // The file may or may not be there to be found after a crash; this process stays halted.
      this.log('error', 'agy.halt_write_failed', { message: describe(error) });
      this.haltedInMemory = true;
    }
  }

  private async refuse(
    work: PlannerWorkWire,
    identity: PlannerIdentityWire,
    outcome: string,
    agySha256: string | null = null,
    checkoutRemoved: boolean | null = null,
  ): Promise<PlannerStart> {
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
      checkoutRemoved,
    });
    return { kind: 'not_sent' };
  }

  /** What this command's evidence record already says: nothing, sent, not sent, or unreadable. */
  private async priorEvidence(commandId: string): Promise<'none' | 'sent' | 'not_sent' | 'unreadable'> {
    let text: string;
    try {
      text = await readFile(this.evidencePath(commandId), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'none';
      this.log('error', 'agy.evidence_unreadable', { commandId, message: describe(error) });
      return 'unreadable';
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      this.log('error', 'agy.evidence_unreadable', { commandId, message: describe(error) });
      return 'unreadable';
    }
    if (!isEvidenceRecord(parsed) || parsed.commandId !== commandId) {
      this.log('error', 'agy.evidence_unreadable', { commandId, message: 'not this command\'s evidence record' });
      return 'unreadable';
    }
    return parsed.sent ? 'sent' : 'not_sent';
  }

  private evidencePath(commandId: string): string {
    return join(this.config.gatewayDirectory, 'planner-evidence', `${createHash('sha256').update(commandId, 'utf8').digest('hex')}.json`);
  }

  /**
   * Atomic tmp+rename, mode 0600, one file per command, overwritten as the
   * run moves on; the file is synced before the rename and its directory
   * after, so the record survives a crash once this answers `true`. The
   * record is the supplemental evidence Amendment 5 B3 keeps, filed in
   * custody beside the journal rows, so a write that fails halts the
   * executor and answers `false`.
   */
  private async evidence(record: EvidenceRecord): Promise<boolean> {
    const directory = join(this.config.gatewayDirectory, 'planner-evidence');
    try {
      const created = await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
      const target = this.evidencePath(record.commandId);
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
      // A rename is visible at once but survives a crash only once its directory is
      // synced; a directory just made needs its own entry synced in the parent too.
      const sync = this.deps.syncDirectory ?? syncDirectory;
      await sync(directory);
      if (created !== undefined) await sync(dirname(directory));
      return true;
    } catch (error) {
      this.log('error', 'agy.evidence_failed', { message: describe(error) });
      await this.halt('evidence_write_failed');
      return false;
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
  private stopped = false;
  private errored = false;
  private readonly exited: Promise<{ exitCode: number | null; signal: string | null }>;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly stopGraceMs: number,
    private readonly clock: Clock,
  ) {
    // 'exit', not 'close': 'close' also waits for every holder of agy's pipes.
    this.exited = new Promise((resolve) => {
      child.once('error', () => {
        this.errored = true;
        resolve({ exitCode: null, signal: null });
      });
      child.once('exit', (code, signal) => resolve({ exitCode: code, signal }));
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

  /**
   * End agy: SIGTERM through sudo, SIGKILL to sudo after the grace, and at
   * most one more grace for it to exit. Never waits on agy's output pipes,
   * which a process sudo could not signal may still hold: the reap that
   * follows ends that process. `confirmed` is false when the exit was not
   * seen in time, and the caller halts.
   */
  async stop(): Promise<{ exitCode: number | null; signal: string | null; confirmed: boolean }> {
    this.stopped = true;
    if (this.child.exitCode === null && this.child.signalCode === null && !this.errored) {
      this.child.stdin.destroy();
      this.child.kill('SIGTERM');
      const timers: NodeJS.Timeout[] = [];
      const ended = await Promise.race([
        this.exited,
        new Promise<null>((resolve) => {
          timers.push(
            setTimeout(() => {
              this.child.kill('SIGKILL');
              timers.push(setTimeout(() => resolve(null), this.stopGraceMs));
            }, this.stopGraceMs),
          );
        }),
      ]);
      for (const timer of timers) clearTimeout(timer);
      this.release();
      return ended === null ? { exitCode: null, signal: null, confirmed: false } : { ...ended, confirmed: true };
    }
    this.release();
    return { ...(await this.exited), confirmed: true };
  }

  /** Whether `stop` has been asked, by a completion or by the daemon stopping. */
  get stopping(): boolean {
    return this.stopped;
  }

  /** Let go of agy's output, so a descendant that keeps a pipe open cannot keep this process waiting. */
  private release(): void {
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    this.closed = true;
    this.wake();
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
 * SSH one with the Founder's key), no credential helper, no prompt. `HOME`
 * names no directory, so git's HTTP transport finds no `~/.netrc` to send:
 * curl reads `$HOME/.netrc` and looks no further while `HOME` is set.
 */
const ISOLATED_GIT_ENV: Readonly<Record<string, string>> = {
  HOME: '/nonexistent',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '/bin/false',
  SSH_ASKPASS: '/bin/false',
  GIT_SSH_COMMAND: '/bin/false',
};

/**
 * The only variables a child of the executor inherits from the daemon
 * (FOUNDER-ACT-20261027-BR-131-BRINGUP B5). Everything else, every `GIT_*`,
 * `SSH_*` and `*_PROXY` among it, stays behind; `PATH` is fixed.
 */
const CHILD_ENV_ALLOWLIST: readonly string[] = Object.freeze(['LANG', 'LC_ALL', 'TZ']);

/** The environment every child the executor starts gets: git, sudo, pkill, pgrep. */
export function childEnvironment(parent: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = { PATH: '/usr/bin:/bin' };
  for (const name of CHILD_ENV_ALLOWLIST) {
    const value = parent[name];
    if (value !== undefined) env[name] = value;
  }
  return { ...env, ...ISOLATED_GIT_ENV };
}

/** Run a child to completion with `childEnvironment()`; its exit code, or a rejection when it could not run. */
export function runChild(file: string, args: readonly string[], cwd?: string): Promise<{ code: number }> {
  return execute(file, args, cwd);
}

function execute(file: string, args: readonly string[], cwd?: string): Promise<{ code: number }> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { cwd, timeout: 300_000, env: childEnvironment() }, (error) => {
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
    try {
      await removeCheckout(directory);
    } catch {
      throw new CheckoutLeftBehindError(directory, error);
    }
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

/**
 * Owner write is restored on each directory first, so the tree can be
 * removed; then it is removed, and its absence is checked. Rejects when the
 * path still exists afterwards, so a checkout left behind is never reported
 * as removed.
 */
export async function removeCheckout(path: string): Promise<void> {
  const writable = async (target: string): Promise<void> => {
    const info = await lstat(target).catch(() => null);
    if (info === null || !info.isDirectory()) return;
    await chmod(target, 0o755);
    for (const name of await readdir(target)) await writable(join(target, name));
  };
  let failure: unknown = null;
  try {
    await writable(path);
    await rm(path, { recursive: true, force: true });
  } catch (error) {
    failure = error;
  }
  const remains = await lstat(path).then(
    () => true,
    (error: NodeJS.ErrnoException) => error.code !== 'ENOENT',
  );
  if (remains) throw new Error(`the checkout ${path} remains${failure === null ? '' : `: ${describe(failure)}`}`);
}
