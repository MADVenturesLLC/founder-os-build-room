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
 * any of its processes remain, again for up to REAP_SETTLE_MS while a killed
 * one finishes exiting (`remainsAfterReap`). Each of these privileged calls and
 * checks has REAP_ANSWER_MS to answer, so ending a run fits PLANNER_STOP_BUDGET_MS,
 * inside the PC service's stop timeout. The executor HALTS when one does, when one
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
import { chmod, lstat, mkdtemp, open, readdir, rename, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  Clock,
  PlannerIdentityWire,
  PlannerResultWire,
  PlannerRouteWire,
  PlannerWorkWire,
} from '../../gateway-protocol/src/index.js';
import type { PlannerReaskWire } from '../../gateway-protocol/src/planner.js';
import { PLANDOC_SCHEMA_V1 } from '../../seat-output-schema/src/index.js';
import { createDaemonClock } from './clock.js';
import { FILE_MODE } from './paths.js';
import {
  PlannerRunEndedWithoutPlanError,
  makeLeafDirectory,
  readRegularFile,
  rewriteInFull,
  syncDirectory,
  syncMadeDirectories,
  type PlannerExecutor,
  type PlannerStart,
} from './planner-worker.js';

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
/** After SIGTERM, how long agy has before SIGKILL; and after SIGKILL, how long sudo has to exit. */
export const STOP_GRACE_MS = 4_000;
/** After the second privilege rule, how long a killed process has to finish exiting. */
export const REAP_SETTLE_MS = 5_000;
/** How often the check is asked again within that time. */
export const REAP_RECHECK_MS = 100;
/** How long the second privilege rule, and the check after the settle time, have to answer. */
export const REAP_ANSWER_MS = 2_000;
/**
 * The longest the executor takes to end a run, as when the daemon stops: both
 * stop graces, the second privilege rule, and the settle time with the last
 * check's answer. The PC's service gives the daemon 20 seconds to stop before
 * SIGKILL (TimeoutStopSec=20). A halt marker's write and sync are not on this
 * path: the cleanup never waits for them, and no timer can make them durable.
 */
export const PLANNER_STOP_BUDGET_MS = 2 * STOP_GRACE_MS + REAP_ANSWER_MS + REAP_SETTLE_MS + REAP_ANSWER_MS;
/** The longest a timer can wait: Node fires a longer one at once. */
const MAX_TIMER_MS = 2_147_483_647;
/** One stream-json line is never larger than this; a larger one fails the run. */
const MAX_LINE_BYTES = 1024 * 1024;
/** At most this many of agy's output lines after init are named in a closing record (fix act B2 item 1). */
const STREAM_EVENTS_RECORDED = 64;
const STREAM_EVENT_RE = /^[a-z_]{1,32}$/;
const RESULT_STATUS_RE = /^[A-Z_]{1,32}$/;

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
  readonly timings?: { readonly initTimeoutMs?: number; readonly runTimeoutMs?: number; readonly stopGraceMs?: number; readonly reapSettleMs?: number; readonly reapAnswerMs?: number };
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
 *
 * FOUNDER-ACT-20261108-BR-PLANNER-PROMPT-GROUNDING adds the rules for what a
 * plan may name (B1), before ANSWER, and the prompt's last line, to write the
 * answer once (B3). Its B2 note, that a revision round had only the feedback,
 * gave way to FOUNDER-ACT-20261109-BR-PLANNER-REVISION-CONTEXT B3: agy starts
 * afresh each round, so a revision round now carries the earlier plan itself,
 * which the Planner is told to revise rather than replace, and which follows
 * as one line of JSON. A first round's prompt is unchanged.
 *
 * FOUNDER-ACT-20261111-BR-PLANNER-REASK B5 and B6: a round's one corrective re-ask
 * says why the earlier answer was refused, after the revision lines when there are
 * any and otherwise after the scope paths. A refused plan follows as one line of
 * JSON, to be corrected rather than rewritten; an answer that never arrived is asked
 * for again in full. Work without a re-ask is written as before, byte for byte.
 */
export function plannerPrompt(work: PlannerWorkWire): string {
  const lines = [
    'You are the architect seat of the MAD Ventures Build Room, acting as its Planner.',
    'Write an Implementation Plan for the goal below. Plan only. You may read files in your working directory with your file-reading tool. You may not run any command or program of any kind, even one that only reads: a request to run one ends your turn with no plan. Do not modify, create or delete any file, and do not contact any service. Give your whole answer in this one turn.',
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
    lines.push(
      'Your earlier plan follows, exactly as the control plane stored it. Revise that plan; do not write a new one. Make each correction and change the feedback asks for, and treat each correction as true. Keep every other statement of the earlier plan as it is, unless the feedback asks you to change it, you find in the checkout that it is false, or you must remove it to keep within rule 6 below. Add nothing the feedback does not ask for. Take repository, base_sha and work_id from the ANSWER section, not from the earlier plan.',
      'Rules 1, 2 and 5 below apply to what you add or change in this round. A statement you keep unchanged from the earlier plan needs no new reading.',
      '',
      'EARLIER PLAN',
      JSON.stringify(work.revision.earlierPlan),
    );
  }
  if (work.reask !== undefined) {
    lines.push(
      '',
      'YOUR EARLIER ANSWER TO THIS REQUEST WAS REFUSED',
      'You have answered this request once already. The control plane refused that answer, for this reason:',
      ...reaskReasonLines(work.reask),
    );
    if (work.reask.refused === 'plan_invalid') {
      lines.push(
        'Your refused answer follows, exactly as the control plane received it. Correct what the reason names, change nothing else, and give the whole corrected plan as your answer. Rules 1, 2 and 5 below apply to what you change.',
        '',
        'REFUSED ANSWER',
        JSON.stringify(work.reask.refusedPlan),
      );
    } else {
      lines.push('Answer the request again, in full, following every rule below.');
    }
  }
  lines.push(
    '',
    'HOW TO WRITE THE PLAN',
    '1. Name a file, directory, function, type, constant, route, table, field, environment variable, error code, script, test or value only if you saw it in this checkout during this turn, in a file you opened or a directory you listed. If you did not see it, describe the behaviour in plain words or leave it out. Never name something because it seems likely to exist.',
    '2. Give a line number or a range of lines only for lines you read, and quote only text you read.',
    '3. Name only what the plan needs. A plan does not need every function, constant or error code of the code it describes.',
    '4. You cannot run commands, so you do not know whether any test, lint, type check or other check passes at this commit. Do not say that one passes or fails. Where the plan relies on a check, require only that the change adds no new failure to it compared with this commit.',
    '5. Before you answer, check every name, path, line number and quotation in the plan against what you saw, and remove any you did not see.',
    '6. Keep the whole answer under 25,000 characters.',
  );
  lines.push(
    '',
    'ANSWER',
    'Reply with exactly one JSON object and nothing else: no prose, no code fence. It must satisfy this schema, in which `additional_properties: false` means no other key is allowed:',
    JSON.stringify(PLANDOC_SCHEMA_V1),
    `Use "repository": ${JSON.stringify(work.repository)}, "base_sha": ${JSON.stringify(work.baseSha)} and "work_id": ${JSON.stringify(work.commandId)}.`,
    'Set "terminal_status" to "PLAN_READY_FOR_FOUNDER_APPROVAL" only if the plan is complete; otherwise to the blocked or inconclusive status that applies.',
    'Write that object once, at the end of your turn, after you have finished reading.',
  );
  return lines.join('\n');
}

/** Why the earlier answer was refused, in the lines of FOUNDER-ACT-20261111-BR-PLANNER-REASK B6. */
export function reaskReasonLines(reask: PlannerReaskWire): string[] {
  if (reask.refused === 'planner_reported_failure') {
    switch (reask.reason) {
      case 'unparseable_plan':
        return ['It was not one JSON object.'];
      case 'oversize':
        return ['It was too large to send. Keep within rule 6 below.'];
      case 'malformed_output':
      case 'no_result':
      case 'agy_error':
        return ['No answer reached the control plane.'];
    }
  }
  const reason = reask.reason;
  switch (reason.kind) {
    case 'schema': {
      const lines = [
        'It does not satisfy the schema in the ANSWER section. Each line below names a place in that answer, as a JSON pointer, and what is wrong there:',
        ...reason.violations.map((violation) => {
          const sizes =
            violation.code === 'length' && violation.found !== undefined && violation.bound !== undefined
              ? ` (found ${violation.found}, limit ${violation.bound})`
              : '';
          return `- ${violation.path}: ${violation.code}${sizes}`;
        }),
      ];
      if (reason.violationCount > reason.violations.length) lines.push(`- and ${reason.violationCount - reason.violations.length} more`);
      return lines;
    }
    case 'scope_path':
      return [
        reason.index === null
          ? 'Its scope_paths are not valid repository paths.'
          : `Its scope_paths entry at index ${reason.index} is not a valid repository path.`,
      ];
    case 'encoding':
      return ['It holds a number that is not a whole number, or a negative zero, which a plan cannot carry.'];
  }
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
  return parsePlanResponse(response).document;
}

/**
 * The plan document in agy's final response, how many backslashes had to be read as literal
 * backslashes for it to parse, and, when the response held more than one complete answer,
 * how many.
 *
 * JSON allows a backslash only before `"`, `\`, `/`, `b`, `f`, `n`, `r`, `t` or `u` and four
 * hex digits. Phase4-CR1's second round of R1 (2026-11-06) returned 46,961 characters of
 * one-line JSON with one other backslash in a string, and the strict parse threw the whole
 * plan away. So: the strict parse first, always; only if it fails, each backslash that does
 * not begin an allowed escape is read as a literal backslash, and the text is parsed once
 * more. A valid document never reaches the repair, and the repair keeps every character the
 * model wrote.
 *
 * agy's result joins every text the Planner writes in its turn. In round 3 of R3
 * (2026-11-08) the Planner wrote a complete answer, read nine more files, and wrote a second
 * complete answer; agy returned both, 48,172 bytes, and the whole was not one document. So,
 * only when the single reading fails: a response made of two or more answers, each a JSON
 * object or one fenced JSON block, with nothing but whitespace between them, is read as its
 * last answer, the Planner's final word. Every answer must parse (each with the same
 * repair) and be an object, or nothing is taken. Anything else that breaks the text, a
 * missing quote, a cut-off answer or prose around the JSON, still throws, as before.
 */
export function parsePlanResponse(response: string): {
  readonly document: unknown;
  readonly invalidEscapesRepaired: number;
  /** Present only when the response held more than one answer and the document is its last: how many. */
  readonly answersJoined?: number;
} {
  const trimmed = response.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
  const body = fenced === null ? trimmed : (fenced[1] ?? '');
  try {
    return parseOneAnswer(body);
  } catch (error) {
    const answers = joinedAnswers(trimmed);
    if (answers === null) throw error;
    const read = answers.map((answer) => {
      try {
        return parseOneAnswer(answer);
      } catch {
        return null;
      }
    });
    if (read.some((one) => one === null || !isPlainObject(one.document))) throw error;
    const last = read[read.length - 1]!;
    return { document: last.document, invalidEscapesRepaired: last.invalidEscapesRepaired, answersJoined: answers.length };
  }
}

/** One answer: the strict parse, then, only if it fails and there is a backslash to repair, one more. */
function parseOneAnswer(text: string): { readonly document: unknown; readonly invalidEscapesRepaired: number } {
  try {
    return { document: JSON.parse(text), invalidEscapesRepaired: 0 };
  } catch (error) {
    const repaired = repairInvalidEscapes(text);
    if (repaired.count === 0) throw error;
    return { document: JSON.parse(repaired.text), invalidEscapesRepaired: repaired.count };
  }
}

function isPlainObject(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The answers in a response made only of answers: each a span from `{` to its matching `}`
 * (outside strings), or one fenced block, with whitespace alone around and between them.
 * `null` when the response is anything else or holds fewer than two. Whether each answer is
 * JSON is the caller's question.
 */
function joinedAnswers(text: string): string[] | null {
  const answers: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i]!)) {
      i += 1;
      continue;
    }
    if (text.startsWith('```', i)) {
      const block = /^```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text.slice(i));
      if (block === null) return null;
      answers.push(block[1] ?? '');
      i += block[0].length;
      continue;
    }
    if (text[i] !== '{') return null;
    const end = objectEnd(text, i);
    if (end === -1) return null;
    answers.push(text.slice(i, end));
    i = end;
  }
  return answers.length >= 2 ? answers : null;
}

/** The index just past the `}` that closes the `{` at `start`, counting brackets outside strings; -1 if none does. */
function objectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Each backslash that does not begin an escape JSON allows becomes an escaped backslash; an
 * allowed escape, `\\` among them, is copied whole. `count` is how many were changed.
 */
export function repairInvalidEscapes(text: string): { readonly text: string; readonly count: number } {
  const out: string[] = [];
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch !== '\\') {
      out.push(ch);
      continue;
    }
    const next = text[i + 1];
    if (next !== undefined && '"\\/bfnrt'.includes(next)) {
      out.push(ch, next);
      i += 1;
    } else if (next === 'u' && /^[0-9A-Fa-f]{4}$/.test(text.slice(i + 2, i + 6))) {
      out.push(text.slice(i, i + 6));
      i += 5;
    } else {
      out.push('\\\\');
      count += 1;
    }
  }
  return { text: out.join(''), count };
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
  /**
   * How a run that started agy ended (FOUNDER-ACT-20261103-BR-PLANNER-PROMPT-FIX B2), on its
   * closing record only: the `event` of each line agy wrote after init, the result's status,
   * and the response's byte length. Never any text agy or the model wrote.
   */
  readonly streamEvents?: readonly string[];
  readonly resultStatus?: string | null;
  readonly responseBytes?: number | null;
  /** Present only when the plan parsed after parsePlanResponse's repair: how many backslashes it read as literal. */
  readonly invalidEscapesRepaired?: number;
  /** Present only when the response held more than one answer and the plan is its last (parsePlanResponse): how many. */
  readonly answersJoined?: number;
}

/** Enough of a record's shape to close it at boot: an object with a command id and an outcome. */
function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['commandId'] === 'string' &&
    record['commandId'] !== '' &&
    typeof record['outcome'] === 'string' &&
    // Whether the work was sent is what the guard against a second run reads: a record
    // without it says nothing either way, and is not a record.
    typeof record['sent'] === 'boolean'
  );
}

/** A start from its first check to its last evidence write; `run` once agy is launched. */
// (the command id is kept so a second start of the same command meets a rejection, not a refusal)
interface InFlight {
  readonly commandId: string;
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
  private readonly reapSettleMs: number;
  private readonly reapAnswerMs: number;
  /** One run at a time: the planner user is one user, and the lingering-process check reads the whole user. */
  private busy = false;
  /** The start in flight, from its first check to its last evidence write, so a stopping daemon can cancel it (Amendment 3 C2). */
  private inFlight: InFlight | null = null;
  /**
   * The commands whose start is under way, from the moment start() is entered, before
   * anything is awaited, until the start has refused, rejected, or run to its completion
   * (its cleanup included). A second start of such a command is rejected at entry, so two
   * starts of one command that arrive together cannot both pass the checks before either
   * has reserved the executor.
   */
  private readonly underWay = new Set<string>();
  /** Set by `shutdown`: no start begins after the daemon begins to stop. */
  private shuttingDown = false;
  /** A halt whose file could not be written still holds for this process. */
  private haltedInMemory = false;
  /**
   * A halt whose marker could not be made durable: the marker's text. Until a write of it
   * succeeds, the marker is written again in full (a new file, synced, renamed into place,
   * its directory synced), never synced again, at boot and before every start is answered.
   */
  private pendingHalt: string | null = null;
  /** The halt marker's rewrites, one at a time. */
  private haltWrites: Promise<void> = Promise.resolve();
  /**
   * Set when an evidence write fails, at any step, or when boot cannot list the evidence
   * directory or write what it holds again: no record in it is read or written for the
   * rest of the process. A sync
   * that fails is not tried again, because a second fsync after a failed one can report
   * success for data the kernel has already dropped.
   */
  private evidenceFailed = false;
  /** Every evidence read and write, in order: a refusal's read-then-write is one step, so nothing lands between them. */
  private evidenceQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: AgyPlannerConfig,
    private readonly deps: AgyPlannerDeps = {},
  ) {
    for (const [name, value] of Object.entries({ sudoPath: config.sudoPath, agyPath: config.agyPath, checkoutParent: config.checkoutParent })) {
      if (!value.startsWith('/')) throw new Error(`${name} must be an absolute path`);
    }
    if (!isPlannerUserName(config.plannerUser)) throw new Error('plannerUser is not a user name');
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
    this.reapSettleMs = deps.timings?.reapSettleMs ?? REAP_SETTLE_MS;
    this.reapAnswerMs = deps.timings?.reapAnswerMs ?? REAP_ANSWER_MS;
  }

  /** The command line the first privilege rule must match, exactly. */
  commandLine(): readonly string[] {
    return [this.config.sudoPath, '-n', '-u', this.config.plannerUser, '--', this.config.agyPath, ...PINNED_AGY_ARGUMENTS];
  }

  /** The command line the second privilege rule must match, exactly (Amendment 3 B1(b)). */
  reapCommandLine(): readonly string[] {
    return reapCommandLine(this.config.sudoPath, this.config.plannerUser);
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
    // Everything before the work is written is refusable with `not_sent`, except for a
    // command whose record says its work was already sent: every refusal, and the launch,
    // first asks the record (rejectIfSent), so no path answers not_sent for such a command
    // or writes over its record.
    //
    // First of all, and before anything is awaited: the same command again while its own
    // start is under way is not refused, which would answer not_sent for work that may be
    // about to go and write a record over nothing yet, but rejected, which the worker
    // records as unknown; whatever else would have refused it. The command is held as under
    // way synchronously here, so two starts of it that arrive together cannot both pass.
    if (this.underWay.has(work.commandId)) {
      this.log('error', 'agy.already_starting', { commandId: work.commandId });
      throw new Error('this command is already being started');
    }
    this.underWay.add(work.commandId);
    const release = (): void => {
      this.underWay.delete(work.commandId);
    };
    try {
      const started = await this.startEntered(work, identity);
      // An accepted run keeps the command under way until its completion, cleanup included.
      if (started.kind === 'accepted') started.completion.then(release, release);
      else release();
      return started;
    } catch (error) {
      release();
      throw error;
    }
  }

  private async startEntered(work: PlannerWorkWire, identity: PlannerIdentityWire): Promise<PlannerStart> {
    // A halt marker not yet durable is written again before any start is answered, whichever
    // check refuses it: a refusal that lands its own record must not leave the halt unwritten.
    if (this.pendingHalt !== null) await this.persistPendingHalt();
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
    const inFlight: InFlight = { commandId: work.commandId, run: null, settled: new Promise<void>((resolve) => (settle = resolve)) };
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
    // process or one a crash ended, stands, and the command is not started again.
    await this.serialized(() => this.rejectIfSent(work.commandId));

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
      await this.evidence({ ...evidenceBase, sent: false, endedAt: this.isoNow(), outcome: refused, ...ended, ...run.diagnostics() });
      this.log('warn', 'agy.not_sent', { outcome: refused, initModel });
      return { kind: 'not_sent' };
    }

    // The record is durable before the work goes in, so no run is ever sent without one
    // (Amendment 5 B3). It says `sent` from here: contact cannot be ruled out once the
    // input may have been written, and a daemon that dies now leaves this record to boot.
    const sentBase = { ...evidenceBase, sent: true };
    if (!(await this.evidence({ ...sentBase, endedAt: null, outcome: 'running', exitCode: null, signal: null, checkoutRemoved: null }))) {
      const ended = await this.endRun(run, directory);
      return this.notSentOnceRecorded({ ...evidenceBase, sent: false, endedAt: this.isoNow(), outcome: 'evidence_write_failed', ...ended, ...run.diagnostics() });
    }
    // The record took time to write: ask again, and make the last checks with nothing
    // awaited between them and the write, so neither a promotion nor a stop lands between.
    const boundStill = await this.onBoundGateway();
    const haltedNow = await this.isHalted();
    const late =
      !boundStill || !this.holdsBoundGateway() ? 'gateway_identity_changed'
      : haltedNow ? 'executor_halted'
      : this.shuttingDown || run.stopping ? 'cancelled_before_send'
      : null;
    if (late !== null) {
      const ended = await this.endRun(run, directory);
      this.log('warn', 'agy.not_sent', { outcome: late, initModel });
      return this.notSentOnceRecorded({ ...evidenceBase, sent: false, endedAt: this.isoNow(), outcome: late, ...ended, ...run.diagnostics() });
    }
    run.send(agyInputLine(plannerPrompt(work)));

    const completion = run.result(this.runTimeoutMs).then(async (outcome) => {
      const ended = await this.endRun(run, directory);
      // A run whose closing record cannot be written is not reported as having ended as it
      // did: the record would still say running, and boot would close it as a daemon death.
      if (!(await this.evidence({ ...sentBase, endedAt: this.isoNow(), outcome: outcome.kind, ...ended, ...run.diagnostics() }))) {
        throw new Error(`the run ended (${outcome.kind}), but its record could not be written`);
      }
      // How the run ended goes to the control plane with the failure (FOUNDER-ACT-20261111-BR-PLANNER-REASK B2).
      if (outcome.kind !== 'plan') throw new PlannerRunEndedWithoutPlanError(outcome.kind);
      return { kind: 'plan', document: outcome.document } satisfies PlannerResultWire;
    });
    // Both were checked above, the model against the lane and the conversation id non-empty,
    // or the start was refused: they go to the control plane with the acceptance, for the
    // canonical journal (Amendment 5 B1; FOUNDER-ACT-20261028-BR-PLANNER-JOURNAL-FIELDS B2).
    return {
      kind: 'accepted',
      observed: { ...AGY_PLANNER_ROUTE },
      initModel: initModel as string,
      conversationId: conversationId as string,
      completion,
    };
  }

  /**
   * Amendment 3 C1, after every run that started agy: end agy through sudo,
   * use rule B1(b), check the planner user, remove the checkout. An exit not
   * seen in time, a survivor, a failed check or a checkout left behind halts.
   * An exit not seen halts as soon as it is known, before the reap; but the
   * reap, the check and the checkout's removal do not wait for its marker to
   * be durable, so a write or sync that stalls cannot keep them from running.
   */
  private async endRun(run: AgyRun, directory: string): Promise<{ exitCode: number | null; signal: string | null; checkoutRemoved: boolean }> {
    const ended = await run.stop();
    let marking: Promise<void> = Promise.resolve();
    if (!ended.confirmed) {
      this.log('error', 'agy.exit_unconfirmed', { graceMs: this.stopGraceMs });
      marking = this.halt('agy_exit_unconfirmed');
      // Awaited below; handled now, so a rejection while the cleanup runs is not unhandled.
      marking.catch(() => undefined);
    }
    await this.reapPlannerUser();
    const checkoutRemoved = await this.removeRunCheckout(directory);
    await marking;
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
      await this.rewriteHaltMarkerAtBoot();
      await this.persistPendingHalt();
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
      // Not one record could be written again, so none is read in this process.
      this.evidenceFailed = true;
      this.log('error', 'agy.evidence_unreadable', { message: describe(error) });
      await this.halt('evidence_unreadable');
      return;
    }
    // What an earlier process left, whose own write may have failed, is written again in full
    // before it is read, each record, and then the directory and the Gateway's directory
    // above it are synced: rewritten, not synced again, because a second sync can confirm
    // data an earlier process's failed write already lost.
    try {
      for (const name of names) {
        if (!name.endsWith('.json') || name.startsWith('.')) continue;
        await rewriteInFull(join(directory, name));
      }
      const sync = this.deps.syncDirectory ?? syncDirectory;
      await sync(directory);
      await sync(this.config.gatewayDirectory);
    } catch (error) {
      this.evidenceFailed = true;
      this.log('error', 'agy.evidence_sync_failed', { message: describe(error) });
      await this.halt('evidence_sync_failed');
      return;
    }
    const bootedAt = this.isoNow();
    for (const name of names) {
      // A closing write that failed latches the evidence: nothing more is read or written.
      if (this.evidenceFailed) return;
      if (!name.endsWith('.json') || name.startsWith('.')) continue;
      let record: EvidenceRecord;
      try {
        const parsed: unknown = JSON.parse((await readRegularFile(join(directory, name))).toString('utf8'));
        if (!isEvidenceRecord(parsed)) throw new Error('not an evidence record');
        // The file must be the one its command's record lives in: closing it rewrites that
        // path, and a stray file naming another command's id must not write over its record.
        if (join(directory, name) !== this.evidencePath(parsed.commandId)) throw new Error('not at its command\'s path');
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
      await answerWithin(this.reap(), this.reapAnswerMs, 'the second privilege rule');
    } catch (error) {
      this.log('error', 'agy.reap_failed', { message: describe(error) });
    }
    let remains: boolean;
    try {
      remains = await remainsAfterReap(this.probe, this.reapSettleMs, REAP_RECHECK_MS, this.reapAnswerMs);
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
    if (this.haltedInMemory) {
      await this.persistPendingHalt();
      return true;
    }
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
    // A halt already held whose marker is not yet durable: the first reason stands, and
    // its marker is written again.
    if (this.pendingHalt !== null) {
      await this.persistPendingHalt();
      return;
    }
    const text = `${JSON.stringify({ haltedAt: this.isoNow(), reason, plannerUser: this.config.plannerUser })}\n`;
    try {
      // The Gateway's directory is the daemon's to make, and is not made here: a marker that
      // cannot be written into it is held in memory, below, as any other failed write is.
      // Exclusive create: a path already there, link or file, is never written through.
      const handle = await open(this.haltPath(), 'wx', FILE_MODE);
      try {
        await handle.writeFile(text, { encoding: 'utf8' });
        await handle.sync();
      } finally {
        await handle.close();
      }
      // The marker's directory entry survives a crash only once the directory is synced;
      // a halt that a crash could clear would let work through with no one's direction
      // (Amendment 3 C1).
      await (this.deps.syncDirectory ?? syncDirectory)(this.config.gatewayDirectory);
    } catch (error) {
      // Already there: the executor is halted already, and the first reason stands.
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return;
      // The file may or may not be there to be found after a crash; this process stays
      // halted, and writes the marker again in full before every start until it lands.
      this.log('error', 'agy.halt_write_failed', { message: describe(error) });
      this.haltedInMemory = true;
      this.pendingHalt ??= text;
    }
  }

  /**
   * A halt marker an earlier process left is written again in full at boot, as the evidence
   * records are, and its directory synced: that process's own write of it may have failed,
   * and a sync made here could not prove it on disk. A marker that is not a regular file, or
   * cannot be read, is replaced by one that says so. If the rewrite fails, this process holds
   * the halt in memory and writes the marker again before every start, as for a halt it
   * raised itself.
   */
  private async rewriteHaltMarkerAtBoot(): Promise<void> {
    let text: string;
    try {
      text = (await readRegularFile(this.haltPath())).toString('utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      // Not a regular file (a link is refused at the open, ELOOP), or not readable: it still
      // halts, and is replaced by a marker that says so.
      text = '';
    }
    if (text === '') {
      text = `${JSON.stringify({ haltedAt: this.isoNow(), reason: 'halt_marker_unreadable_at_boot', plannerUser: this.config.plannerUser })}\n`;
    }
    this.pendingHalt = text;
    await this.persistPendingHalt();
    if (this.pendingHalt !== null) this.haltedInMemory = true;
  }

  /**
   * Writes a halt marker that could not be made durable again, in full: a new file,
   * synced, renamed over whatever is at the path, then the Gateway's directory synced. Not
   * a second sync of the first file, which can report success for data already lost. The
   * process stays halted either way.
   */
  private persistPendingHalt(): Promise<void> {
    // One rewrite at a time (pull request 133, R1): two at once could each leave the
    // marker to the other, so a held halt is cleared only by the rewrite of that halt.
    const next = this.haltWrites.then(() => this.persistPendingHaltNow());
    this.haltWrites = next.catch(() => undefined);
    return next;
  }

  private async persistPendingHaltNow(): Promise<void> {
    const pending = this.pendingHalt;
    if (pending === null) return;
    const temporary = join(this.config.gatewayDirectory, `.planner-halted.${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, 'wx', FILE_MODE);
      try {
        await handle.writeFile(pending, { encoding: 'utf8' });
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.haltPath());
      await (this.deps.syncDirectory ?? syncDirectory)(this.config.gatewayDirectory);
      if (this.pendingHalt === pending) this.pendingHalt = null;
      this.log('warn', 'agy.halt_persisted', { haltFile: this.haltPath() });
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      this.log('error', 'agy.halt_write_failed', { message: describe(error) });
    }
  }

  private async refuse(
    work: PlannerWorkWire,
    identity: PlannerIdentityWire,
    outcome: string,
    agySha256: string | null = null,
    checkoutRemoved: boolean | null = null,
  ): Promise<PlannerStart> {
    // The record is read and then written as one step: a refusal never writes `sent: false`
    // over a record that says the work was sent, whatever refused the start.
    await this.serialized(async () => {
      await this.rejectIfSent(work.commandId);
      await this.writeEvidence({
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
    });
    return { kind: 'not_sent' };
  }

  /**
   * `not_sent` once the running record has been attempted: only when the record now says
   * so. A record that could not be written, or made durable, may still say the work was
   * sent, or say so again after a crash, so the answer is then a rejection, which the
   * worker records as unknown; the failed write has already halted the executor.
   */
  private async notSentOnceRecorded(record: EvidenceRecord): Promise<PlannerStart> {
    if (!(await this.evidence(record))) {
      throw new Error(`the work was not sent (${record.outcome}), but the record could not be made to say so`);
    }
    return { kind: 'not_sent' };
  }

  /**
   * Rejects when the command's record says its work was sent, or cannot say. The answer is
   * a rejection, not `not_sent`, because the work did reach agy once, or may have; the
   * worker records that as unknown. Neither case writes over the record.
   */
  private async rejectIfSent(commandId: string): Promise<void> {
    const prior = await this.priorEvidence(commandId);
    if (prior === 'sent') {
      this.log('error', 'agy.already_sent', { commandId });
      throw new Error('this command was already sent to agy by an earlier execution, and is not started again');
    }
    if (prior === 'unreadable') {
      await this.halt('evidence_unreadable');
      throw new Error('this command\'s evidence record cannot be read, so whether it was sent is unknown');
    }
  }

  /**
   * What this command's record says about its work, for the worker's affirmative answers:
   * `true` when it was sent, `false` when it was not or there is no record, `null` when the
   * record cannot be read.
   */
  async sent(commandId: string): Promise<boolean | null> {
    const prior = await this.serialized(() => this.priorEvidence(commandId));
    // A record that cannot be read halts, whoever asked: the executor may be holding a run it cannot account for.
    if (prior === 'unreadable') await this.halt('evidence_unreadable');
    return prior === 'sent' ? true : prior === 'unreadable' ? null : false;
  }

  private serialized<T>(step: () => Promise<T>): Promise<T> {
    const next = this.evidenceQueue.then(step, step);
    this.evidenceQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** What this command's evidence record already says: nothing, sent, not sent, or unreadable. */
  private async priorEvidence(commandId: string): Promise<'none' | 'sent' | 'not_sent' | 'unreadable'> {
    if (this.evidenceFailed) {
      this.log('error', 'agy.evidence_unreadable', { commandId, message: 'an evidence write could not be made durable; no record is read until the daemon restarts' });
      return 'unreadable';
    }
    let text: string;
    try {
      text = (await readRegularFile(this.evidencePath(commandId))).toString('utf8');
    } catch (error) {
      // No entry at the path is no record, and only a confirmed absence is: an entry that
      // cannot be read through (a link to nowhere), or an existence check that itself fails,
      // is a record that cannot be read, as boot treats it.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const outcome = await lstat(this.evidencePath(commandId)).then(
          () => ({ exists: true as const }),
          (lstatError: NodeJS.ErrnoException) => ({ exists: false as const, code: lstatError.code }),
        );
        if (recordAbsence(outcome) === 'none') return 'none';
      }
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
  private evidence(record: EvidenceRecord): Promise<boolean> {
    return this.serialized(() => this.writeEvidence(record));
  }

  private async writeEvidence(record: EvidenceRecord): Promise<boolean> {
    const directory = join(this.config.gatewayDirectory, 'planner-evidence');
    if (this.evidenceFailed) {
      this.log('error', 'agy.evidence_failed', { message: 'an earlier evidence write could not be made durable; nothing is written until the daemon restarts' });
      await this.halt('evidence_write_failed');
      return false;
    }
    try {
      const created = await makeLeafDirectory(directory);
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
      // synced; a directory just made needs its own entry synced, in each parent made with it.
      await syncMadeDirectories(directory, created, this.deps.syncDirectory ?? syncDirectory);
      return true;
    } catch (error) {
      // Whatever step failed, the file at the path may say more than the disk will after a
      // crash: no record is read or written again in this process.
      this.evidenceFailed = true;
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

/**
 * Splits agy's output into lines without ever holding more than one line's bytes
 * (Tier-2 confirmation at ac1097f, under the Founder's ruling of 2026-11-03 bounding the
 * buffer). Lines end where readline with `crlfDelay: Infinity` ends them: at LF, at CR LF
 * (one break, even across chunks), and at a lone CR (the Founder's ruling of 2026-11-03 on
 * the third review at 5cd4b33). A break is never part of a line, so a line is at most
 * MAX_LINE_BYTES; one that grows past it is reported once, as soon as it does, and its
 * remaining bytes are dropped up to its break. A final line without a break is a line.
 */
export class BoundedLineSplitter {
  private readonly parts: Buffer[] = [];
  private held = 0;
  private dropping = false;
  /** The last break was a CR: an LF that follows it, in this chunk or the next, is the same break. */
  private afterCR = false;

  constructor(
    private readonly onLine: (line: string) => void,
    private readonly onOversized: () => void,
    private readonly maxLineBytes: number = MAX_LINE_BYTES,
  ) {}

  /** The bytes held for the line being assembled; never more than maxLineBytes. */
  get heldBytes(): number {
    return this.held;
  }

  push(chunk: Buffer): void {
    let start = 0;
    while (start < chunk.length) {
      if (this.afterCR) {
        this.afterCR = false;
        if (chunk[start] === 0x0a) {
          start += 1;
          continue;
        }
      }
      const lf = chunk.indexOf(0x0a, start);
      const cr = chunk.indexOf(0x0d, start);
      const brk = lf === -1 ? cr : cr === -1 ? lf : Math.min(lf, cr);
      const end = brk === -1 ? chunk.length : brk;
      if (!this.dropping) {
        const piece = chunk.subarray(start, end);
        if (this.held + piece.length > this.maxLineBytes) {
          this.parts.length = 0;
          this.held = 0;
          this.dropping = true;
          this.onOversized();
        } else if (piece.length > 0) {
          this.parts.push(Buffer.from(piece));
          this.held += piece.length;
        }
      }
      if (brk === -1) return;
      if (chunk[brk] === 0x0d) this.afterCR = true;
      this.finishLine();
      start = brk + 1;
    }
  }

  /** The stream ended: a last line without a break is still a line. */
  end(): void {
    if (this.dropping || this.held > 0) this.finishLine();
  }

  private finishLine(): void {
    if (this.dropping) {
      this.dropping = false;
      return;
    }
    const line = Buffer.concat(this.parts, this.held);
    this.parts.length = 0;
    this.held = 0;
    this.onLine(line.toString('utf8'));
  }
}

/**
 * One agy process: its output judged line by line, its input written once, its end.
 *
 * Nothing agy writes is kept beyond what judging it needs (fix act B2, the Founder's
 * ruling of 2026-11-03 on Tier-2 finding 2): the first event, which start() checks; the
 * run's outcome once a line decides it; the first result's status and size; and the
 * names of at most STREAM_EVENTS_RECORDED lines after init. However long agy writes,
 * memory stays bounded by one line (MAX_LINE_BYTES).
 */
class AgyRun {
  /** The first JSON object agy wrote, unless a line that was not one came before it. */
  private first: Record<string, unknown> | null = null;
  /** Set by the first line after `first` that decides how the run ends; later lines decide nothing. */
  private outcome: RunOutcome | null = null;
  private resultSummary: { readonly status: string | null; readonly bytes: number | null } | null = null;
  /** How many backslashes the plan's parse read as literal (parsePlanResponse); 0 unless it repaired. */
  private escapesRepaired = 0;
  /** How many answers the response held when the plan is the last of several (parsePlanResponse); 0 otherwise. */
  private answersJoined = 0;
  /** The name of each output line after init, `other` when it has none that fits; at most STREAM_EVENTS_RECORDED. */
  private readonly kinds: string[] = [];
  private kindsOverflow = false;
  private readonly waiters: (() => void)[] = [];
  private closed = false;
  private malformed = false;
  private stopped = false;
  private stopOnce: Promise<{ exitCode: number | null; signal: string | null; confirmed: boolean }> | null = null;
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
    const lines = new BoundedLineSplitter(
      (line) => this.onLine(line),
      () => {
        this.noteKind(null);
        this.markMalformed();
        this.wake();
      },
    );
    child.stdout.on('data', (chunk: Buffer) => lines.push(chunk));
    let ended = false;
    const finish = (): void => {
      if (ended) return;
      ended = true;
      lines.end();
      this.closed = true;
      this.wake();
    };
    child.stdout.once('end', finish);
    child.stdout.once('close', finish);
  }

  /** One complete line of agy's output, at most MAX_LINE_BYTES. */
  private onLine(line: string): void {
    // A blank line is a line, and has no event: it is named `other` (Tier-2 finding 1).
    if (line.trim() === '') {
      this.noteKind(null);
      return;
    }
    const event = parseEvent(line);
    if (event === null) {
      this.noteKind(null);
      this.markMalformed();
      return this.wake();
    }
    if (this.first === null && !this.malformed) {
      // start() checks the first event itself; only what follows it is judged here.
      this.first = event;
      if (event['event'] === 'init') {
        // The kinds recorded are those after init: anything before it, blank lines only, is dropped.
        this.kinds.length = 0;
        this.kindsOverflow = false;
      } else {
        this.noteKind(event);
      }
      this.noteResult(event);
      return this.wake();
    }
    this.noteKind(event);
    this.noteResult(event);
    this.judge(event);
    this.wake();
  }

  private wake(): void {
    for (const waiter of this.waiters.splice(0)) waiter();
  }

  /** One more output line's kind: its `event` if that is a short lowercase name, otherwise `other`. */
  private noteKind(event: Record<string, unknown> | null): void {
    // What is beyond the recorded lines is only counted as more.
    if (this.kinds.length >= STREAM_EVENTS_RECORDED) {
      this.kindsOverflow = true;
      return;
    }
    const name = event === null ? undefined : event['event'];
    this.kinds.push(typeof name === 'string' && STREAM_EVENT_RE.test(name) ? name : 'other');
  }

  /** The first result event's status and response size, for the closing record; never its text. */
  private noteResult(event: Record<string, unknown>): void {
    if (this.resultSummary !== null || event['event'] !== 'result') return;
    const result = objectAt(event, 'result');
    const status = result === null ? undefined : result['status'];
    const response = result === null ? undefined : result['response'];
    this.resultSummary = {
      status: typeof status === 'string' && RESULT_STATUS_RE.test(status) ? status : null,
      bytes: typeof response === 'string' ? Buffer.byteLength(response, 'utf8') : null,
    };
  }

  /** A line that is not a bounded JSON object: if nothing has decided the run yet, it ends malformed. */
  private markMalformed(): void {
    this.malformed = true;
    if (this.first !== null && this.outcome === null) this.outcome = { kind: 'malformed_output' };
  }

  /** An event after the first: every one must name no other model, and the first `result` ends the run. */
  private judge(event: Record<string, unknown>): void {
    if (this.outcome !== null) return;
    if (modelsNamed(event).some((model) => model !== AGY_PLANNER_LANE.agyModel)) {
      this.outcome = { kind: 'model_switched' };
      return;
    }
    if (event['event'] !== 'result') return;
    const result = objectAt(event, 'result');
    if (result === null || result['status'] !== 'SUCCESS' || typeof result['response'] !== 'string') {
      this.outcome = { kind: 'agy_error' };
      return;
    }
    try {
      const parsed = parsePlanResponse(result['response']);
      this.escapesRepaired = parsed.invalidEscapesRepaired;
      this.answersJoined = parsed.answersJoined ?? 0;
      this.outcome = { kind: 'plan', document: parsed.document };
    } catch {
      this.outcome = { kind: 'unparseable_plan' };
    }
  }

  /**
   * How the run ended, for its closing record (fix act B2): the kinds of the lines after
   * init, the first result's status and its response's byte length; only when the plan
   * parsed after a repair, how many backslashes were read as literal; and only when the plan
   * is the last of several answers, how many there were. No text is kept.
   */
  diagnostics(): {
    streamEvents: string[];
    resultStatus: string | null;
    responseBytes: number | null;
    invalidEscapesRepaired?: number;
    answersJoined?: number;
  } {
    return {
      streamEvents: this.kindsOverflow ? [...this.kinds, 'truncated'] : [...this.kinds],
      resultStatus: this.resultSummary?.status ?? null,
      responseBytes: this.resultSummary?.bytes ?? null,
      ...(this.escapesRepaired > 0 ? { invalidEscapesRepaired: this.escapesRepaired } : {}),
      ...(this.answersJoined > 1 ? { answersJoined: this.answersJoined } : {}),
    };
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
    while (this.first === null && !this.malformed && !this.closed) {
      const remaining = deadline - this.clock.monotonicNow();
      if (remaining <= 0 || !(await this.next(remaining))) return null;
    }
    // A line that was not a JSON object before any that was leaves `first` unset.
    return this.first;
  }

  send(line: string): void {
    this.child.stdin.end(line);
  }

  /** Wait for the line that decides the run: the first `result`, another model named, or a malformed line. */
  async result(timeoutMs: number): Promise<RunOutcome> {
    const deadline = this.clock.monotonicNow() + timeoutMs;
    for (;;) {
      if (this.outcome !== null) return this.outcome;
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
  stop(): Promise<{ exitCode: number | null; signal: string | null; confirmed: boolean }> {
    // Asked twice, by the daemon stopping and then by the run's end, it waits its graces once.
    return (this.stopOnce ??= this.stopNow());
  }

  private async stopNow(): Promise<{ exitCode: number | null; signal: string | null; confirmed: boolean }> {
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

/** How long git and the other children may run before they are killed and the call rejects. */
const COMMAND_TIMEOUT_MS = 300_000;

function execute(file: string, args: readonly string[], cwd?: string, timeoutMs: number = COMMAND_TIMEOUT_MS): Promise<{ code: number }> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { cwd, timeout: timeoutMs, env: childEnvironment() }, (error) => {
      if (error === null) return resolve({ code: 0 });
      const code = (error as NodeJS.ErrnoException & { code?: unknown }).code;
      if (typeof code === 'number') return resolve({ code });
      reject(error);
    });
  });
}

/** A name the privilege rules can carry: a plain POSIX user name, nothing sudo could read as an option. */
export function isPlannerUserName(name: string): boolean {
  return /^[a-z_][a-z0-9_-]{0,31}$/.test(name);
}

/** The second privilege rule's command line (Amendment 3 B1(b)), for the executor and for a daemon that does not run one. */
export function reapCommandLine(sudoPath: string, plannerUser: string): readonly string[] {
  return [sudoPath, '-n', '-u', plannerUser, '--', PKILL_PATH, '-KILL', '-u', plannerUser];
}

/** The second privilege rule. `pkill` exits 0 when it signalled a process and 1 when none matched; both are a clean reap. */
export function pkillReaper(commandLine: readonly string[]): PlannerReaper {
  return async () => {
    const [file, ...args] = commandLine as [string, ...string[]];
    const { code } = await execute(file, args, undefined, REAP_ANSWER_MS);
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

/**
 * The check after the second privilege rule (Amendment 3 C1). SIGKILL ends a
 * process at once, but the process is still listed until it has finished
 * exiting and its parent has collected it, which takes moments: a check made
 * the instant after the kill can list a process that is already dead, as the
 * PC's first boot reap did (2026-10-30). So the check is asked again, every
 * `recheckMs`, until no process is listed or `settleMs` has passed; a process
 * still listed then remains. The number of checks is fixed before the first,
 * and the whole check is bounded by one timer of `settleMs + answerMs`, so it
 * ends whatever the clock does and however long a check takes: a check still
 * unanswered when that timer fires rejects, as one that cannot be made does.
 * Bounds that would not end it, or that no timer can hold, are refused.
 */
export async function remainsAfterReap(
  probe: PlannerProcessProbe,
  settleMs: number = REAP_SETTLE_MS,
  recheckMs: number = REAP_RECHECK_MS,
  answerMs: number = REAP_ANSWER_MS,
): Promise<boolean> {
  const rechecks = Math.ceil(settleMs / recheckMs);
  const limitMs = settleMs + answerMs;
  if (
    !(settleMs >= 0) || !(recheckMs > 0) || !(answerMs > 0) ||
    !Number.isSafeInteger(rechecks) || !(recheckMs <= MAX_TIMER_MS) || !(limitMs <= MAX_TIMER_MS)
  ) {
    throw new RangeError(
      `the settle time must not be negative, the recheck interval and answer time must be positive, and every bound must fit a timer (${String(settleMs)}, ${String(recheckMs)}, ${String(answerMs)})`,
    );
  }
  const timers: NodeJS.Timeout[] = [];
  const limit = new Promise<'limit'>((resolve) => timers.push(setTimeout(() => resolve('limit'), limitMs)));
  try {
    for (let attempt = 0; ; attempt += 1) {
      const answer = await Promise.race([probe(), limit]);
      if (answer === 'limit') throw new Error(`the check did not answer within ${String(limitMs)} ms`);
      if (!answer) return false;
      if (attempt >= rechecks) return true;
      const waited = await Promise.race([new Promise<'waited'>((resolve) => timers.push(setTimeout(() => resolve('waited'), recheckMs))), limit]);
      if (waited === 'limit') return true;
    }
  } finally {
    for (const timer of timers) clearTimeout(timer);
  }
}

/** `call`'s answer, or a rejection naming `what` when it has none within `ms`. */
export async function answerWithin<T>(call: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      call,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} did not answer within ${String(ms)} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** `pgrep -u <user>` exits 0 when the user has a process, 1 when it has none; anything else is an error. */
export function pgrepProbe(user: string, pgrep = '/usr/bin/pgrep'): PlannerProcessProbe {
  return async () => {
    const { code } = await execute(pgrep, ['-u', user], undefined, REAP_ANSWER_MS);
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
/**
 * What a record path whose read answered ENOENT is, from the existence check that follows:
 * `none` only when that check confirms there is no entry; an entry that exists (a link to
 * nowhere), or a check that fails for any other reason, is a record that cannot be read.
 */
export function recordAbsence(outcome: { readonly exists: true } | { readonly exists: false; readonly code: string | undefined }): 'none' | 'unreadable' {
  if (outcome.exists) return 'unreadable';
  return outcome.code === 'ENOENT' ? 'none' : 'unreadable';
}

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
