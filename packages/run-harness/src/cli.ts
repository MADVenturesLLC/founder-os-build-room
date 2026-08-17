/**
 * `npm run phase2:runs` — perform the Phase 2 runs and write the evidence.
 *
 * Configuration is environment-driven, and the defaults are deliberately
 * conservative rather than convenient:
 *
 *   CONTROL_PLANE_URL      required — the deployed control plane
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
import { buildBundle, serializeBundle, summarizeBundle } from './evidence.js';
import { CommandPlatform, ExternalPlatform, type Platform } from './platform.js';
import { DEFAULT_RUNNER_CONFIG, defaultDeps, performRun, type RunnerConfig } from './runner.js';
import { appendRun, emptySequence, gateStatus, type RunSequence } from './sequence.js';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required and was not set`);
  }
  return value.trim();
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer; got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

export async function main(): Promise<number> {
  const baseUrl = required('CONTROL_PLANE_URL');
  const attempts = integer('PHASE2_RUNS', 3);
  const evidencePath = process.env['PHASE2_EVIDENCE_PATH']?.trim() ?? 'evidence';

  const config: RunnerConfig = {
    ...DEFAULT_RUNNER_CONFIG,
    baseUrl,
    dwellMs: integer('PHASE2_DWELL_MS', DEFAULT_RUNNER_CONFIG.dwellMs),
    sampleIntervalMs: integer('PHASE2_SAMPLE_INTERVAL_MS', DEFAULT_RUNNER_CONFIG.sampleIntervalMs),
    restartTimeoutMs: integer('PHASE2_RESTART_TIMEOUT_MS', DEFAULT_RUNNER_CONFIG.restartTimeoutMs),
    deployTimeoutMs: integer('PHASE2_DEPLOY_TIMEOUT_MS', DEFAULT_RUNNER_CONFIG.deployTimeoutMs),
  };

  const restartCommand = process.env['PHASE2_RESTART_COMMAND']?.trim();
  const platform: Platform =
    restartCommand === undefined || restartCommand === ''
      ? new ExternalPlatform('requested outside this process (Railway API or dashboard)')
      : new CommandPlatform({
          restartCommand,
          ...(process.env['PHASE2_DEPLOY_COMMAND']?.trim()
            ? { deployCommand: process.env['PHASE2_DEPLOY_COMMAND']!.trim() }
            : {}),
        });

  const deps = defaultDeps(config, platform);

  let sequence: RunSequence = emptySequence();
  let commit = 'unknown';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(`\n=== Phase 2 run attempt ${attempt} of ${attempts} ===`);
    const draft = await performRun(config, deps);
    const appended = appendRun(sequence, draft);
    sequence = appended.sequence;
    if (draft.commit !== 'unknown') commit = draft.commit;
    console.log(`--- run #${appended.run.seq}: ${appended.run.verdict.toUpperCase()}`);
  }

  const bundle = buildBundle(sequence, {
    assembledAt: new Date().toISOString(),
    commit,
    baseUrl,
    environment: process.env['PHASE2_ENVIRONMENT']?.trim() ?? 'unknown',
    platformKind: platform.kind,
    attribution: {
      roleId: process.env['PHASE2_ROLE_ID']?.trim() ?? 'builder',
      actorId: required('PHASE2_ACTOR_ID'),
      actualModel: required('PHASE2_ACTUAL_MODEL'),
      executionSurface: process.env['PHASE2_EXECUTION_SURFACE']?.trim() ?? 'claude-code',
    },
  });

  await mkdir(evidencePath, { recursive: true });
  const file = join(evidencePath, `phase2-runs-${bundle.context.assembledAt.replace(/[:.]/g, '-')}.json`);
  await writeFile(file, serializeBundle(bundle), 'utf8');

  console.log(`\n${summarizeBundle(bundle)}`);
  console.log(`\nevidence written to ${file}`);

  return gateStatus(sequence).satisfied ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
