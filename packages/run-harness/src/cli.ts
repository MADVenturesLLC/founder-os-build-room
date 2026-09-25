/**
 * `npm run phase2:runs` — perform the Phase 2 runs and write the evidence.
 *
 * Configuration is environment-driven, and the defaults are deliberately
 * conservative rather than convenient:
 *
 *   CONTROL_PLANE_URL      required — the deployed control plane
 *   CONTROL_PLANE_TOKEN    required — the shared secret the room endpoints
 *                          demand; the same value the service is deployed with
 *   PHASE2_RUNS            how many runs to attempt (default 3)
 *   PHASE2_DWELL_MS        how long /health must keep answering (default 30000)
 *   PHASE2_RESTART_COMMAND a command that restarts the service; when absent,
 *                          the restart is treated as performed externally and
 *                          recorded as such
 *   PHASE2_EVIDENCE_PATH   where the bundle is written (default ./evidence)
 *   PHASE2_ACTOR_ID        who is running this; required, never inferred
 *   PHASE2_ACTUAL_MODEL    the model that actually performed the work
 *
 * **The exit code follows the gate.** Non-zero when three consecutive passes
 * are not on record, so a scripted caller cannot mistake an incomplete
 * sequence for a satisfied one. The evidence is written either way — a failed
 * sequence is exactly the evidence exit criterion 4 wants retained.
 *
 * **The sequence is the control plane's, not this process's**
 * (`docs/phase-2-known-limits.md` §2, migration `0007_gate_runs`). The CLI
 * loads the persisted gate-run history before the first run, appends each run
 * as it completes — an interrupted run included — and computes the gate over
 * what the store holds after the loop. A re-run continues the record; it
 * never restarts it. If the store cannot be read or written, the CLI stops
 * with exit 4 (`GATE_STORE_UNAVAILABLE_EXIT`) and writes no bundle: there is
 * no fallback to counting in memory.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessStreams, HmacKeyCustody } from '../../redaction/src/index.js';
import { ControlPlaneClient } from './client.js';
import { buildBundle, summarizeBundle } from './evidence.js';
import {
  GATE_STORE_UNAVAILABLE_EXIT,
  GateRunHistoryError,
  HttpGateRunStore,
  PHASE2_GATE,
  validateHistory,
  type GateRunStore,
} from './gate-runs.js';
import { CommandPlatform, ExternalPlatform, type Platform } from './platform.js';
import {
  REDACTION_REFUSED_EXIT,
  openHarnessRedactionBoundary,
  processHarnessStreams,
  redactedHarnessStreams,
  redactionRefusalLine,
  type HarnessEnvironment,
} from './redaction-boundary.js';
import {
  DEFAULT_RUNNER_CONFIG,
  defaultDeps,
  performRun,
  type RunnerConfig,
  type RunnerDeps,
} from './runner.js';
import { gateStatus, recordFor, type RunDraft, type RunSequence, type UnsequencedRunRecord } from './sequence.js';

function required(environment: HarnessEnvironment, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required and was not set`);
  }
  return value.trim();
}

/**
 * An environment value, falling back when it is unset OR blank.
 *
 * `process.env[name]?.trim() ?? fallback` looks equivalent and is not: it
 * falls back only when the variable is *unset*. Set to `''` or to whitespace,
 * `?.trim()` yields `''`, which is not nullish, so the empty string wins. That
 * put `mkdir('')` on the evidence path — a run that completes and then writes
 * nothing — and empty `environment`, `roleId` and `executionSurface` values
 * into the bundle. Raised by CodeRabbit on PR #2.
 */
function text(environment: HarnessEnvironment, name: string, fallback: string): string {
  const raw = environment[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.trim();
}

function integer(environment: HarnessEnvironment, name: string, fallback: number): number {
  const raw = environment[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer; got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

/** Test seams (Lane B wiring). The entrypoint passes none of them. */
export interface Phase2MainOptions {
  readonly keyCustody?: HmacKeyCustody;
  readonly streams?: HarnessStreams;
  /** The inner bundle writer the redacting sink wraps; defaults to `writeFile`. */
  readonly writeBundle?: (path: string, content: string) => Promise<void>;
  /** Runner collaborators; defaults to `defaultDeps`. Never called when the boundary refuses. */
  readonly deps?: (config: RunnerConfig, platform: Platform, token: string) => RunnerDeps;
  /**
   * The persisted gate-run store; defaults to the control plane's
   * `/gate/runs`. Never called when the boundary refuses. There is no
   * in-memory store in this module — a test supplies its own double.
   */
  readonly gateRuns?: (baseUrl: string, token: string, timeoutMs: number) => GateRunStore;
}

export async function main(
  environment: HarnessEnvironment = process.env,
  options: Phase2MainOptions = {},
): Promise<number> {
  const streams = options.streams ?? processHarnessStreams();
  const baseUrl = required(environment, 'CONTROL_PLANE_URL');
  const token = required(environment, 'CONTROL_PLANE_TOKEN');
  const attempts = integer(environment, 'PHASE2_RUNS', 3);
  const evidencePath = text(environment, 'PHASE2_EVIDENCE_PATH', 'evidence');

  /*
   * Every required value is read HERE, before a single run executes.
   *
   * These two were previously read down in the bundle-building call, after the
   * run loop. An unset `PHASE2_ACTOR_ID` therefore threw only once all three
   * runs had been performed against the deployed control plane — and the throw
   * skipped `writeFile`, so every completed run was lost. That directly
   * contradicts this file's own header: "The evidence is written either way."
   * Raised by CodeRabbit on PR #2.
   */
  const attribution = {
    roleId: text(environment, 'PHASE2_ROLE_ID', 'builder'),
    actorId: required(environment, 'PHASE2_ACTOR_ID'),
    actualModel: required(environment, 'PHASE2_ACTUAL_MODEL'),
    executionSurface: text(environment, 'PHASE2_EXECUTION_SURFACE', 'claude-code'),
  };
  const bundleEnvironment = text(environment, 'PHASE2_ENVIRONMENT', 'unknown');

  const config: RunnerConfig = {
    ...DEFAULT_RUNNER_CONFIG,
    baseUrl,
    dwellMs: integer(environment, 'PHASE2_DWELL_MS', DEFAULT_RUNNER_CONFIG.dwellMs),
    sampleIntervalMs: integer(
      environment,
      'PHASE2_SAMPLE_INTERVAL_MS',
      DEFAULT_RUNNER_CONFIG.sampleIntervalMs,
    ),
    restartTimeoutMs: integer(
      environment,
      'PHASE2_RESTART_TIMEOUT_MS',
      DEFAULT_RUNNER_CONFIG.restartTimeoutMs,
    ),
    deployTimeoutMs: integer(
      environment,
      'PHASE2_DEPLOY_TIMEOUT_MS',
      DEFAULT_RUNNER_CONFIG.deployTimeoutMs,
    ),
  };

  const restartCommand = text(environment, 'PHASE2_RESTART_COMMAND', '');
  const deployCommand = text(environment, 'PHASE2_DEPLOY_COMMAND', '');
  const platform: Platform =
    restartCommand === ''
      ? new ExternalPlatform('requested outside this process (Railway API or dashboard)')
      : new CommandPlatform({
          restartCommand,
          ...(deployCommand === '' ? {} : { deployCommand }),
        });

  /*
   * The secret boundary opens HERE — after the configuration is read and
   * before any collaborator exists. A refused boundary ends the harness with
   * one line naming the refusal code and exit 3: no run is performed, no
   * request is sent, no evidence file is written. There is no switch that
   * turns this off (Lane B wiring act, 2026-09-14).
   */
  const boundary = await openHarnessRedactionBoundary(environment, {
    ...(options.keyCustody === undefined ? {} : { keyCustody: options.keyCustody }),
  });
  if (boundary.state.kind === 'refused') {
    streams.err(redactionRefusalLine(boundary.state.code));
    return REDACTION_REFUSED_EXIT;
  }
  const out = redactedHarnessStreams(boundary, streams);
  const writer = boundary.evidenceBundleWriter(
    options.writeBundle ?? ((path, content) => writeFile(path, content, 'utf8')),
  );

  // The runner logs synchronously; the sink writes synchronously under a ready
  // boundary, so ordering holds. A sink failure is kept and surfaced at the end
  // rather than swallowed.
  let sinkFailure: unknown = null;
  const log = (message: string): void => {
    out.log(`${message}\n`).catch((error: unknown) => {
      sinkFailure ??= error;
    });
  };

  try {
    /*
     * The persisted history is read FIRST — before any run collaborator
     * exists — so a store that cannot be read stops the harness before a
     * single deploy or restart is requested. Nothing below counts from
     * memory.
     */
    const gateRuns = (options.gateRuns ?? defaultGateRuns)(baseUrl, token, config.requestTimeoutMs);
    const history = validateHistory(await gateRuns.load());
    log(`gate history: ${history.runs.length} run(s) already on record for ${PHASE2_GATE}`);

    const deps: RunnerDeps = {
      ...(options.deps?.(config, platform, token) ?? defaultDeps(config, platform, token)),
      log,
    };
    // The record leaves this process for the store; it crosses the same
    // boundary the bundle does, before it is sent.
    const redactor = boundary.require();

    let commit = 'unknown';

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      log(`\n=== Phase 2 run attempt ${attempt} of ${attempts} ===`);
      const draft = await performOrInterrupt(config, deps);
      const record = redactor.redactValue(recordFor(draft)) as UnsequencedRunRecord;
      const persisted = await gateRuns.append(record);
      if (draft.commit !== 'unknown') commit = draft.commit;
      log(`--- run #${persisted.seq}: ${persisted.verdict.toUpperCase()}`);
    }

    // The gate is computed over what the STORE holds now — the whole record,
    // including runs other invocations appended — never over this loop.
    const sequence: RunSequence = validateHistory(await gateRuns.load());

    const bundle = buildBundle(
      sequence,
      {
        assembledAt: new Date().toISOString(),
        commit,
        baseUrl,
        environment: bundleEnvironment,
        platformKind: platform.kind,
        attribution,
      },
      { kind: 'persisted', gate: PHASE2_GATE, route: '/gate/runs' },
    );

    await mkdir(evidencePath, { recursive: true });
    const file = join(evidencePath, `phase2-runs-${bundle.context.assembledAt.replace(/[:.]/g, '-')}.json`);
    // The sink redacts the bundle tree and serializes it exactly as
    // `serializeBundle` does (`JSON.stringify(bundle, null, 2)` + newline).
    await writer.write(file, bundle);

    log(`\n${summarizeBundle(bundle)}`);
    log(`\nevidence written to ${file}`);
    if (sinkFailure !== null) throw sinkFailure;

    return gateStatus(sequence).satisfied ? 0 : 1;
  } catch (error) {
    /*
     * The gate-run store could not be read or written. One line, code and
     * operation only, and a distinct exit — no bundle, because a bundle
     * written now would describe a sequence the store does not hold.
     */
    if (error instanceof GateRunHistoryError) {
      await out.err(`gate run history: ${error.code} during ${error.operation}\n`);
      return GATE_STORE_UNAVAILABLE_EXIT;
    }
    // Post-boundary failures leave through the redacting error path; the
    // pre-boundary ones above carry variable names only and never reach here.
    await out.error(error);
    return 1;
  }
}

function defaultGateRuns(baseUrl: string, token: string, timeoutMs: number): GateRunStore {
  return new HttpGateRunStore(new ControlPlaneClient(baseUrl, timeoutMs, token));
}

/**
 * Perform one run; if the harness itself throws mid-flight, the run becomes an
 * interruption draft rather than vanishing. It fails — `recordFor` makes an
 * interrupted run fail whatever it had reached — and it is appended like any
 * other run, because an interruption is part of the sequence, not absent
 * from it (`DEC-20260815-17` exit criterion 4).
 */
async function performOrInterrupt(config: RunnerConfig, deps: RunnerDeps): Promise<RunDraft> {
  const startedAt = deps.now();
  try {
    return await performRun(config, deps);
  } catch (error) {
    const interruption = error instanceof Error ? error.message : String(error);
    deps.log?.(`--- run interrupted: ${interruption}`);
    return {
      runId: deps.newId(),
      startedAt,
      endedAt: deps.now(),
      commit: 'unknown',
      steps: [],
      conditions: [],
      interruption,
    };
  }
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
