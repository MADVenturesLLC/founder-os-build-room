#!/usr/bin/env node
/**
 * `npm run phase4:counted-run` — run the next label of the counted Phase 4
 * set (FOUNDER-ACT-20261102-BR-PHASE4-COUNTED-RUNS D2).
 *
 * ONE LABEL PER INVOCATION. It reads the act's terms file, checks it against
 * the SHA-256 the Founder's amendment names, reads the set's attempts from
 * the evidence directory, and runs only the label the set's progress names:
 * a spent or complete set refuses to run. The Founder runs it, on his own
 * machine; it decides no plan and holds no credential that could.
 *
 * Configuration, all from the environment:
 *   PHASE4_TERMS_FILE         the act's terms file (the run set, as JSON)
 *   PHASE4_TERMS_SHA256       its SHA-256, as the Founder's amendment names it
 *   PHASE4_EVIDENCE_DIR       where the attempts and each run's record are kept
 *   CONTROL_PLANE_TOKEN       the control plane's API token (rooms, export)
 *   PHASE4_COUNTED_RUN_TOKEN  the counted-run token (rounds, journal)
 *   FOUNDEROS_PATH            a FounderOS checkout, read for its commit and cleanliness
 *   PHASE4_EXECUTOR_CONFIRMED `yes`, once the Founder's readings of the act's
 *                             D6 show the PC's executor ready; the control
 *                             plane cannot see it
 * The control plane is the one the terms name. Neither token is ever printed,
 * logged or written; they are held in memory for the requests that need them.
 *
 * THE LIVE CHECK (the act's E2). For Phase4-CR1, once the first round has
 * settled and before the runner waits on the Founder, the room's journal is
 * read; the run continues only if the first planner command's dispatched row
 * carries init_model and provider_conversation_id, each non-empty. The
 * reading is printed with its time and kept with the attempt.
 *
 * Exit codes: 0 the run passed; 1 it ran and did not pass (the set is spent);
 * 2 nothing ran: the configuration, the terms or the set refused; 3 entry
 * refused, nothing was written and the set is not spent.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  acquirePhase4Lock,
  loadPhase4Attempts,
  phase4AttemptSummaries,
  savePhase4Attempts,
  writePhase4EvidenceFile,
  type Phase4AttemptLog,
  type Phase4StoredAttempt,
} from './attempt-store.js';
import { HttpPhase4Driver } from './http-driver.js';
import { evaluatePhase4LiveCheck, type Phase4LiveCheckReading } from './live-check.js';
import type { Phase4PlannedRun } from './model.js';
import { phase4SetStatus } from './run-sequence.js';
import { validatePhase4RunSet } from './run-set.js';
import { Phase4Runner, Phase4SetNotRunnableError, phase4RecordDigest } from './runner.js';

export const PHASE4_CLI_EXIT = { passed: 0, notPassed: 1, refused: 2, notStarted: 3 } as const;

/** Test seams. The entry point passes none of them. */
export interface Phase4CliDeps {
  readonly fetch?: typeof fetch;
  /** Runs `git` with the given arguments and answers its standard output. */
  readonly git?: (args: readonly string[]) => Promise<string>;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollMs?: number;
  readonly out?: (line: string) => void;
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const SHA_RE = /^[0-9a-f]{40}$/;

export async function phase4CountedRunMain(env: Readonly<Record<string, string | undefined>>, deps: Phase4CliDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = deps.now ?? (() => Date.now());
  const iso = (): string => new Date(now()).toISOString();
  const git = deps.git ?? defaultGit;
  const refuse = (reason: string): number => {
    out(`phase4:counted-run: refused, nothing ran: ${reason}`);
    return PHASE4_CLI_EXIT.refused;
  };

  const required = ['PHASE4_TERMS_FILE', 'PHASE4_TERMS_SHA256', 'PHASE4_EVIDENCE_DIR', 'CONTROL_PLANE_TOKEN', 'PHASE4_COUNTED_RUN_TOKEN', 'FOUNDEROS_PATH'];
  const missing = required.filter((name) => (env[name] ?? '').trim() === '');
  if (missing.length > 0) return refuse(`not set: ${missing.join(', ')}`);
  if (env['PHASE4_EXECUTOR_CONFIRMED'] !== 'yes') {
    return refuse("PHASE4_EXECUTOR_CONFIRMED is not 'yes': the PC's readings of the act's D6 come first");
  }
  const apiToken = env['CONTROL_PLANE_TOKEN']!;
  const countedRunToken = env['PHASE4_COUNTED_RUN_TOKEN']!;
  if (apiToken === countedRunToken) return refuse('the API token and the counted-run token are the same value');

  const expectedTermsSha = env['PHASE4_TERMS_SHA256']!.trim().toLowerCase();
  if (!SHA256_RE.test(expectedTermsSha)) return refuse('PHASE4_TERMS_SHA256 is not a SHA-256');
  let termsBytes: Buffer;
  try {
    termsBytes = await readFile(env['PHASE4_TERMS_FILE']!);
  } catch {
    return refuse('the terms file cannot be read');
  }
  const termsSha = createHash('sha256').update(termsBytes).digest('hex');
  if (termsSha !== expectedTermsSha) return refuse(`the terms file's SHA-256 is ${termsSha}, not ${expectedTermsSha}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(termsBytes.toString('utf8'));
  } catch {
    return refuse('the terms file is not JSON');
  }
  const validated = validatePhase4RunSet(parsed);
  if (!validated.ok) return refuse(`the terms file is not a run set (${validated.failure})`);
  const set = validated.value;

  let founderOs: { sha: string; clean: boolean };
  try {
    const path = env['FOUNDEROS_PATH']!;
    const sha = (await git(['-C', path, 'rev-parse', 'HEAD'])).trim();
    const status = await git(['-C', path, 'status', '--porcelain=v1', '--untracked-files=all']);
    founderOs = { sha: SHA_RE.test(sha) ? sha : '', clean: status.trim() === '' };
  } catch {
    return refuse('the FounderOS checkout cannot be read');
  }

  const evidenceDir = env['PHASE4_EVIDENCE_DIR']!;
  let release: () => Promise<void>;
  try {
    release = await acquirePhase4Lock(evidenceDir, `pid ${process.pid} at ${iso()}`);
  } catch (error) {
    return refuse(describe(error));
  }
  try {
    let log: Phase4AttemptLog;
    try {
      log = await loadPhase4Attempts(evidenceDir, set.setId, termsSha);
    } catch (error) {
      return refuse(describe(error));
    }
    if (log.attempts.some((a) => a.pending)) {
      return refuse('an attempt is still marked under way; a run that dies is recorded as interrupted, and the set is spent');
    }
    const status = phase4SetStatus(phase4AttemptSummaries(log));
    if (status.nextLabel === null) {
      return refuse(status.satisfied ? 'the set is complete: three consecutive passes are on record' : 'the set is spent: a new act is needed');
    }

    const driver = new HttpPhase4Driver({
      origin: set.controlPlaneOrigin,
      apiToken,
      countedRunToken,
      founderOs,
      executorAvailable: true,
      observeRemoteHead: (repository) => observeRemoteHead(git, repository),
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      now,
      ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
      ...(deps.pollMs === undefined ? {} : { pollMs: deps.pollMs }),
    });

    const progress: { pending: Phase4StoredAttempt | null } = { pending: null };
    let liveCheck: (Phase4LiveCheckReading & { readonly readAt: string }) | undefined;
    const save = async (attempt: Phase4StoredAttempt): Promise<void> => {
      const others = log.attempts.filter((a) => !(a.pending && a.label === attempt.label && a.roomId === attempt.roomId));
      log = { ...log, attempts: [...others, attempt] };
      await savePhase4Attempts(evidenceDir, log);
    };

    const runner = new Phase4Runner(driver, {
      now,
      ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
      ...(deps.pollMs === undefined ? {} : { pollMs: deps.pollMs }),
      onEntryPassed: async (run: Phase4PlannedRun) => {
        const attempt: Phase4StoredAttempt = { label: run.label, roomId: run.roomId, outcome: 'interrupted', pending: true, startedAt: iso(), entryFailures: [], failures: [] };
        progress.pending = attempt;
        await save(attempt);
        out(`${run.label}: entry passed at ${attempt.startedAt}; room ${run.roomId}`);
      },
      afterRound: async ({ label, roomId, round, kind }) => {
        out(`${label}: round ${round} settled (${kind}) at ${iso()}`);
        if (label !== 'Phase4-CR1' || round !== 1) return 'continue';
        let reading: Phase4LiveCheckReading;
        try {
          reading = evaluatePhase4LiveCheck(await driver.journalCommands(roomId));
        } catch (error) {
          reading = { passed: false, commandId: null, initModel: null, providerConversationId: null, reason: `the journal could not be read: ${describe(error)}` };
        }
        liveCheck = { ...reading, readAt: iso() };
        out(`LIVE CHECK at ${liveCheck.readAt}: command ${reading.commandId ?? 'none'}; init_model ${reading.initModel ?? 'absent'}; provider_conversation_id ${reading.providerConversationId ?? 'absent'}`);
        if (reading.passed) {
          out('LIVE CHECK PASSED: the run continues and counts.');
          return 'continue';
        }
        out(`LIVE CHECK FAILED (${reading.reason ?? 'unknown'}): the run stops here and does not count; the set is spent, and nothing more is dispatched on this binding without a new act.`);
        return 'stop';
      },
    });

    let result;
    try {
      result = await runner.runNext(set, phase4AttemptSummaries(log));
    } catch (error) {
      if (error instanceof Phase4SetNotRunnableError) return refuse(error.message);
      const started = progress.pending;
      if (started === null) {
        out(`${status.nextLabel}: did not start, nothing was written: ${describe(error)}`);
        return PHASE4_CLI_EXIT.notStarted;
      }
      await save({ ...started, pending: false, endedAt: iso(), error: describe(error), ...(liveCheck === undefined ? {} : { liveCheck }) });
      out(`${started.label}: interrupted at ${iso()}: ${describe(error)}`);
      out('The set is spent: a new act is needed for another attempt.');
      return PHASE4_CLI_EXIT.notPassed;
    }

    if (result.outcome === 'not_started') {
      out(`${result.label}: entry refused, nothing was written, the set is not spent: ${result.entryFailures.join(', ')}`);
      return PHASE4_CLI_EXIT.notStarted;
    }
    const startedAt = progress.pending?.startedAt ?? iso();
    const final: Phase4StoredAttempt = {
      label: result.label,
      roomId: result.roomId,
      outcome: result.outcome,
      pending: false,
      startedAt,
      endedAt: iso(),
      entryFailures: [],
      failures: result.failures,
      ...(result.recordDigest === undefined ? {} : { recordDigest: result.recordDigest }),
      ...(liveCheck === undefined ? {} : { liveCheck }),
    };
    await save(final);
    if (result.record !== undefined) {
      const base = `${result.label}-${result.roomId}`;
      await writePhase4EvidenceFile(evidenceDir, `${base}.record.json`, `${JSON.stringify(result.record, null, 2)}\n`);
      await writePhase4EvidenceFile(evidenceDir, `${base}.record.sha256`, `${phase4RecordDigest(result.record)}  ${base}.record (canonical JSON)\n`);
    }
    out(`${result.label}: ${result.outcome} at ${final.endedAt}; record SHA-256 ${result.recordDigest ?? 'none'}`);
    if (result.failures.length > 0) out(`${result.label}: failures: ${result.failures.join(', ')}`);
    const after = phase4SetStatus(phase4AttemptSummaries(log));
    out(
      after.satisfied
        ? 'The set is complete: three consecutive passes.'
        : after.spent
          ? 'The set is spent: a new act is needed for another attempt.'
          : `Next label: ${after.nextLabel}.`,
    );
    return result.outcome === 'passed' ? PHASE4_CLI_EXIT.passed : PHASE4_CLI_EXIT.notPassed;
  } finally {
    await release();
  }
}

/** The repository's live default-branch head, read from GitHub without credentials. */
async function observeRemoteHead(git: (args: readonly string[]) => Promise<string>, repository: string): Promise<string | null> {
  const output = await git(['ls-remote', `https://github.com/${repository}.git`, 'HEAD']);
  const sha = output.trim().split(/\s+/)[0] ?? '';
  return SHA_RE.test(sha) ? sha : null;
}

const execFileAsync = promisify(execFile);

async function defaultGit(args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], { timeout: 60_000, maxBuffer: 1024 * 1024 });
  return stdout;
}

function describe(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  phase4CountedRunMain(process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stdout.write(`phase4:counted-run: ${describe(error)}\n`);
      process.exitCode = PHASE4_CLI_EXIT.notPassed;
    },
  );
}
