/**
 * One Phase 2 run: deploy → health check → verify → teardown.
 *
 * The cycle is the Founder's (`DEC-20260815-17`, 2026-08-17). The six steps
 * below are that four-phase cycle with `verify` opened up, because "survives a
 * restart without data loss" cannot be observed in a single step — it needs a
 * write, a restart, and a read that proves the write outlived the process.
 *
 *   deploy → health_check → verify_write → restart → verify_after_restart → teardown
 *
 * The three conditions are judged from what these steps observed, not from
 * whether they completed. See `record.ts` for why those are different things.
 *
 * **What "stays up" is taken to mean here, stated because the Founder's words
 * do not fix a duration.** The health check samples `/health` repeatedly
 * across a dwell window and requires every sample to pass. A single 200 proves
 * the process answered once; a service that boots, answers, and dies seconds
 * later would pass that and fail the condition it was meant to establish. The
 * window is configurable and recorded in the evidence, so the reader sees what
 * was actually required rather than inferring it.
 *
 * **What "without data loss" is taken to mean.** The exact ledger the room
 * held before the restart is the ledger it holds after: same log length, same
 * entry count, same state, and the same event ids in the same order. A weaker
 * check — "the room still exists" — would pass a database that had silently
 * dropped events.
 */

import { randomUUID } from 'node:crypto';
import { ControlPlaneClient, type Probe } from './client.js';
import type { Platform, PlatformAction } from './platform.js';
import type { ConditionRecord, StepName, StepRecord } from './record.js';
import type { RunDraft } from './sequence.js';

export interface RunnerConfig {
  readonly baseUrl: string;
  /** How long `/health` must keep answering, and how often it is sampled. */
  readonly dwellMs: number;
  readonly sampleIntervalMs: number;
  /** How long to wait for a new process to appear after a restart. */
  readonly restartTimeoutMs: number;
  /** How long to wait for the service to become healthy after a deploy. */
  readonly deployTimeoutMs: number;
  readonly requestTimeoutMs: number;
}

export const DEFAULT_RUNNER_CONFIG: RunnerConfig = {
  baseUrl: 'http://127.0.0.1:8080',
  dwellMs: 30_000,
  sampleIntervalMs: 3_000,
  restartTimeoutMs: 180_000,
  deployTimeoutMs: 180_000,
  requestTimeoutMs: 10_000,
};

export interface RunnerDeps {
  readonly client: ControlPlaneClient;
  readonly platform: Platform;
  /** Injected so tests need no wall-clock wait and no clock in the pure core. */
  readonly now: () => string;
  readonly sleep: (ms: number) => Promise<void>;
  readonly newId: () => string;
  readonly log?: (message: string) => void;
}

export function defaultDeps(config: RunnerConfig, platform: Platform): RunnerDeps {
  return {
    client: new ControlPlaneClient(config.baseUrl, config.requestTimeoutMs),
    platform,
    now: () => new Date().toISOString(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    newId: () => randomUUID(),
    log: (message) => console.log(message),
  };
}

/** A step in progress, so `finish` can stamp both ends without a shared mutable. */
interface OpenStep {
  readonly step: StepName;
  readonly startedAt: string;
}

export async function performRun(config: RunnerConfig, deps: RunnerDeps): Promise<RunDraft> {
  const { client, platform, now, newId, log } = deps;
  const runId = newId();
  const startedAt = now();
  const steps: StepRecord[] = [];
  const conditions: ConditionRecord[] = [];
  const say = (message: string): void => log?.(`[run ${runId.slice(0, 8)}] ${message}`);

  const open = (step: StepName): OpenStep => ({ step, startedAt: now() });
  const finish = (
    started: OpenStep,
    outcome: StepRecord['outcome'],
    detail: string,
    observations?: Record<string, unknown>,
  ): StepRecord => {
    const record: StepRecord = {
      step: started.step,
      outcome,
      startedAt: started.startedAt,
      endedAt: now(),
      detail,
      ...(observations === undefined ? {} : { observations }),
    };
    steps.push(record);
    say(`${record.step}: ${outcome} — ${detail}`);
    return record;
  };

  const skipRemaining = (remaining: readonly StepName[], why: string): void => {
    for (const step of remaining) {
      const started = open(step);
      finish(started, 'skipped', why);
    }
  };

  let commit = 'unknown';

  // ---- deploy ------------------------------------------------------------
  const deployStep = open('deploy');
  const deployAction = await platform.deploy(now);
  const deployHealthy = await waitForHealthy(client, config, deps, config.deployTimeoutMs);
  if (!deployHealthy.ok) {
    finish(deployStep, 'failed', `service did not become healthy after deploy: ${deployHealthy.detail}`, {
      platformAction: deployAction,
    });
    conditions.push({
      condition: 'deploys_and_stays_up',
      held: false,
      evidence: `never reached a healthy state: ${deployHealthy.detail}`,
    });
    skipRemaining(
      ['health_check', 'verify_write', 'restart', 'verify_after_restart', 'teardown'],
      'deploy did not reach a healthy state',
    );
    return draft(runId, startedAt, now(), commit, steps, conditions);
  }
  finish(deployStep, 'passed', `healthy after deploy (${deployAction.actor})`, {
    platformAction: deployAction,
  });

  // ---- health check ------------------------------------------------------
  const healthStep = open('health_check');
  const version = await client.version();
  commit = version.version.commit ?? 'unknown';
  const processBefore = version.version.startedAt ?? null;

  const dwell = await dwellHealthy(client, config, deps);
  const ready = await client.ready();

  if (!dwell.ok || !ready.ok) {
    const why = !dwell.ok ? dwell.detail : `readiness failed: ${describe(ready)}`;
    finish(healthStep, 'failed', why, { dwell, ready, commit });
    conditions.push({
      condition: 'deploys_and_stays_up',
      held: false,
      evidence: why,
    });
    skipRemaining(
      ['verify_write', 'restart', 'verify_after_restart', 'teardown'],
      'health check failed',
    );
    return draft(runId, startedAt, now(), commit, steps, conditions);
  }

  finish(
    healthStep,
    'passed',
    `answered ${dwell.samples} health samples over ${config.dwellMs}ms and reported ready`,
    { commit, processBefore, dwell, ready },
  );
  conditions.push({
    condition: 'deploys_and_stays_up',
    held: true,
    evidence:
      `deployed and answered every one of ${dwell.samples} /health samples across a ` +
      `${config.dwellMs}ms window; /ready reported the database reachable`,
  });

  // ---- verify: write and read back ---------------------------------------
  const roomId = newId();
  const writeStep = open('verify_write');
  const written = await writeAndReadBack(client, roomId, deps);
  if (!written.ok) {
    finish(writeStep, 'failed', written.detail, written.observations);
    conditions.push({ condition: 'reads_and_writes', held: false, evidence: written.detail });
    skipRemaining(['restart', 'verify_after_restart'], 'write verification failed');
    await teardown(client, roomId, open, finish);
    return draft(runId, startedAt, now(), commit, steps, conditions);
  }
  finish(writeStep, 'passed', written.detail, written.observations);
  conditions.push({ condition: 'reads_and_writes', held: true, evidence: written.detail });

  // ---- restart -----------------------------------------------------------
  const restartStep = open('restart');
  const restartAction: PlatformAction = await platform.restart(now);
  const restarted = await waitForNewProcess(client, config, deps, processBefore);
  if (!restarted.ok) {
    finish(restartStep, 'failed', restarted.detail, { platformAction: restartAction });
    conditions.push({
      condition: 'survives_restart',
      held: false,
      evidence: `no new process observed after the restart request: ${restarted.detail}`,
    });
    skipRemaining(['verify_after_restart'], 'restart was not observed');
    await teardown(client, roomId, open, finish);
    return draft(runId, startedAt, now(), commit, steps, conditions);
  }
  finish(restartStep, 'passed', restarted.detail, {
    platformAction: restartAction,
    processBefore,
    processAfter: restarted.processAfter,
  });

  // ---- verify after restart ----------------------------------------------
  const afterStep = open('verify_after_restart');
  const survived = await compareAfterRestart(client, roomId, written.before);
  if (!survived.ok) {
    finish(afterStep, 'failed', survived.detail, survived.observations);
    conditions.push({ condition: 'survives_restart', held: false, evidence: survived.detail });
    await teardown(client, roomId, open, finish);
    return draft(runId, startedAt, now(), commit, steps, conditions);
  }
  finish(afterStep, 'passed', survived.detail, survived.observations);
  conditions.push({ condition: 'survives_restart', held: true, evidence: survived.detail });

  await teardown(client, roomId, open, finish);
  return draft(runId, startedAt, now(), commit, steps, conditions);
}

function draft(
  runId: string,
  startedAt: string,
  endedAt: string,
  commit: string,
  steps: readonly StepRecord[],
  conditions: readonly ConditionRecord[],
): RunDraft {
  return { runId, startedAt, endedAt, commit, steps, conditions };
}

async function teardown(
  client: ControlPlaneClient,
  roomId: string,
  open: (step: StepName) => OpenStep,
  finish: (
    started: OpenStep,
    outcome: StepRecord['outcome'],
    detail: string,
    observations?: Record<string, unknown>,
  ) => StepRecord,
): Promise<void> {
  const started = open('teardown');

  /*
   * The room is NOT deleted. `build_room_events` is append-only at the
   * database and the ledger is the record of what happened — a teardown that
   * erased the run's own evidence would defeat exit criterion 5. Teardown here
   * means exporting the room's ledger so the evidence is captured, and
   * releasing the client's hold on it.
   */
  const exported = await client.exportRoom(roomId);
  finish(
    started,
    exported.ok ? 'passed' : 'failed',
    exported.ok
      ? `exported the room ledger; the room is retained, not deleted — the ledger is append-only evidence`
      : `could not export the room ledger: ${describe(exported)}`,
    { roomId, export: exported.body },
  );
}

interface DwellResult {
  readonly ok: boolean;
  readonly samples: number;
  readonly detail: string;
}

async function dwellHealthy(
  client: ControlPlaneClient,
  config: RunnerConfig,
  deps: RunnerDeps,
): Promise<DwellResult> {
  const deadline = Date.now() + config.dwellMs;
  let samples = 0;

  for (;;) {
    const probe = await client.health();
    samples += 1;
    if (!probe.ok) {
      return {
        ok: false,
        samples,
        detail: `/health stopped answering on sample ${samples}: ${describe(probe)}`,
      };
    }
    if (Date.now() >= deadline) break;
    await deps.sleep(Math.min(config.sampleIntervalMs, Math.max(0, deadline - Date.now())));
  }

  return { ok: true, samples, detail: `${samples} consecutive healthy samples` };
}

async function waitForHealthy(
  client: ControlPlaneClient,
  config: RunnerConfig,
  deps: RunnerDeps,
  timeoutMs: number,
): Promise<{ readonly ok: boolean; readonly detail: string }> {
  const deadline = Date.now() + timeoutMs;
  let last = 'never attempted';

  for (;;) {
    const probe = await client.health();
    if (probe.ok) return { ok: true, detail: 'healthy' };
    last = describe(probe);
    if (Date.now() >= deadline) return { ok: false, detail: `timed out after ${timeoutMs}ms; last: ${last}` };
    await deps.sleep(config.sampleIntervalMs);
  }
}

/**
 * Wait until `/version` reports a different `startedAt` than before.
 *
 * That is what proves a **new process** is serving. Polling `/health` alone
 * would be satisfied by the old process that never restarted, which is the
 * failure this condition exists to catch.
 */
async function waitForNewProcess(
  client: ControlPlaneClient,
  config: RunnerConfig,
  deps: RunnerDeps,
  processBefore: string | null,
): Promise<{ readonly ok: boolean; readonly detail: string; readonly processAfter?: string }> {
  if (processBefore === null) {
    return {
      ok: false,
      detail: '/version reported no startedAt before the restart, so a new process cannot be proved',
    };
  }

  const deadline = Date.now() + config.restartTimeoutMs;

  for (;;) {
    const probe = await client.version();
    const processAfter = probe.version.startedAt;
    if (probe.ok && processAfter !== undefined && processAfter !== processBefore) {
      return {
        ok: true,
        detail: `new process observed — /version startedAt moved from ${processBefore} to ${processAfter}`,
        processAfter,
      };
    }
    if (Date.now() >= deadline) {
      return {
        ok: false,
        detail:
          `/version still reports startedAt ${processBefore} after ${config.restartTimeoutMs}ms — ` +
          `no new process was observed`,
      };
    }
    await deps.sleep(config.sampleIntervalMs);
  }
}

interface RoomFingerprint {
  readonly logLength: number;
  readonly entryCount: number;
  readonly state: unknown;
  readonly eventIds: readonly string[];
}

interface WriteResult {
  readonly ok: boolean;
  readonly detail: string;
  readonly before: RoomFingerprint;
  readonly observations: Record<string, unknown>;
}

const EMPTY_FINGERPRINT: RoomFingerprint = {
  logLength: 0,
  entryCount: 0,
  state: null,
  eventIds: [],
};

/**
 * Condition 2: connects to Postgres and reads and writes correctly.
 *
 * The write goes through the real ledger path — a room, then a `scope.captured`
 * event, which is the lifecycle's opening transition — so this exercises the
 * reducer, the store and the schema together rather than a synthetic table.
 */
async function writeAndReadBack(
  client: ControlPlaneClient,
  roomId: string,
  deps: RunnerDeps,
): Promise<WriteResult> {
  const created = await client.createRoom(roomId);
  if (!created.ok) {
    return {
      ok: false,
      detail: `could not create room: ${describe(created)}`,
      before: EMPTY_FINGERPRINT,
      observations: { roomId, created: created.body },
    };
  }

  const eventId = deps.newId();
  const event = {
    eventId,
    event: 'scope.captured',
    actor: 'founder',
    attribution: {
      roleId: null,
      actorId: 'founder',
      actualModel: 'n/a — harness-generated verification event',
      executionSurface: 'claude-code',
    },
    scope: { roomId, repo: 'MADVenturesLLC/founder-os-build-room', paths: [] },
    evidence: [],
    occurredAt: deps.now(),
    facts: { repoInAllowlist: true, scopePathsCanonical: true, rolesAssigned: true },
  };

  const appended = await client.appendEvent(roomId, event);
  if (!appended.ok) {
    return {
      ok: false,
      detail: `the ledger did not accept the verification event: ${describe(appended)}`,
      before: EMPTY_FINGERPRINT,
      observations: { roomId, eventId, appended: appended.body },
    };
  }

  const read = await client.getRoom(roomId);
  if (!read.ok) {
    return {
      ok: false,
      detail: `wrote the event but could not read the room back: ${describe(read)}`,
      before: EMPTY_FINGERPRINT,
      observations: { roomId, eventId, read: read.body },
    };
  }

  const fingerprint = fingerprintOf(read.body, [eventId]);
  if (fingerprint.logLength < 1) {
    return {
      ok: false,
      detail: `the room read back with an empty log after an accepted write`,
      before: fingerprint,
      observations: { roomId, eventId, read: read.body },
    };
  }

  return {
    ok: true,
    detail:
      `created the room, the ledger accepted a scope.captured event, and the room read back ` +
      `with ${fingerprint.logLength} log position(s) and ${fingerprint.entryCount} entry/entries`,
    before: fingerprint,
    observations: { roomId, eventId, read: read.body },
  };
}

/**
 * Condition 3: survives a restart without data loss.
 *
 * The comparison is against the exact fingerprint taken before the restart —
 * log length, entry count, state and event ids. "The room still exists" would
 * pass a database that had dropped every event in it.
 */
async function compareAfterRestart(
  client: ControlPlaneClient,
  roomId: string,
  before: RoomFingerprint,
): Promise<{ readonly ok: boolean; readonly detail: string; readonly observations: Record<string, unknown> }> {
  const read = await client.getRoom(roomId);
  if (!read.ok) {
    return {
      ok: false,
      detail: `the room could not be read after the restart: ${describe(read)}`,
      observations: { roomId, read: read.body },
    };
  }

  const after = fingerprintOf(read.body, before.eventIds);
  const differences: string[] = [];

  if (after.logLength !== before.logLength) {
    differences.push(`log length ${before.logLength} -> ${after.logLength}`);
  }
  if (after.entryCount !== before.entryCount) {
    differences.push(`entry count ${before.entryCount} -> ${after.entryCount}`);
  }
  if (JSON.stringify(after.state) !== JSON.stringify(before.state)) {
    differences.push('lifecycle state differs');
  }

  if (differences.length > 0) {
    return {
      ok: false,
      detail: `data loss or drift across the restart: ${differences.join('; ')}`,
      observations: { roomId, before, after },
    };
  }

  return {
    ok: true,
    detail:
      `the room read back identically after the restart — ${after.logLength} log position(s), ` +
      `${after.entryCount} entry/entries, same lifecycle state`,
    observations: { roomId, before, after },
  };
}

function fingerprintOf(body: unknown, eventIds: readonly string[]): RoomFingerprint {
  const record = (body ?? {}) as Record<string, unknown>;
  return {
    logLength: typeof record['logLength'] === 'number' ? record['logLength'] : 0,
    entryCount: typeof record['entryCount'] === 'number' ? record['entryCount'] : 0,
    state: record['snapshot'] ?? null,
    eventIds,
  };
}

function describe(probe: Probe): string {
  if (probe.error !== undefined) return `${probe.error} (no response)`;
  return `HTTP ${probe.status} ${JSON.stringify(probe.body).slice(0, 300)}`;
}
