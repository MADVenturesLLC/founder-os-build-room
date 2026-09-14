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
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HarnessStreams, HmacKeyCustody } from '../../redaction/src/index.js';
import { buildBundle, summarizeBundle } from './evidence.js';
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
import { appendRun, emptySequence, gateStatus, type RunSequence } from './sequence.js';

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
    const deps: RunnerDeps = {
      ...(options.deps?.(config, platform, token) ?? defaultDeps(config, platform, token)),
      log,
    };

    let sequence: RunSequence = emptySequence();
    let commit = 'unknown';

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      log(`\n=== Phase 2 run attempt ${attempt} of ${attempts} ===`);
      const draft = await performRun(config, deps);
      const appended = appendRun(sequence, draft);
      sequence = appended.sequence;
      if (draft.commit !== 'unknown') commit = draft.commit;
      log(`--- run #${appended.run.seq}: ${appended.run.verdict.toUpperCase()}`);
    }

    const bundle = buildBundle(sequence, {
      assembledAt: new Date().toISOString(),
      commit,
      baseUrl,
      environment: bundleEnvironment,
      platformKind: platform.kind,
      attribution,
    });

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
    // Post-boundary failures leave through the redacting error path; the
    // pre-boundary ones above carry variable names only and never reach here.
    await out.error(error);
    return 1;
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
