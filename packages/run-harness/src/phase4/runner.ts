/**
 * The Phase 4 counted-run runner (plan r1 slice 10). It drives ONE run of an
 * authorized set through a `Phase4RunDriver` and judges it by the proposed
 * run unit. No counted run executes in this repository: the entry act does
 * not exist, and nothing in production implements the driver.
 *
 * WHAT THE RUNNER NEVER DOES. It decides no plan. The driver has no decision
 * method, so the runner cannot originate an approval, a revision or a cancel:
 * the Founder makes each one at the control plane (Phase 4 authorization §5),
 * and the runner only watches the room until one lands. It retries nothing a
 * planner round reports; the loop's own Q8 retry is the only one. It runs a
 * label only when the set's progress says that label is next.
 *
 * THE DRIVER is what a counted run needs the deployed control plane to
 * offer: an entry observation, room creation and scope capture (existing
 * routes), a way to start a planning round, the room's state, and the record
 * the run unit reads. `http-driver.ts` is that driver over the deployed
 * routes, starting rounds and reading the journal through the run-unit Q9
 * routes (`control-plane/src/counted-run.ts`).
 */

import { createHash } from 'node:crypto';
import { evaluatePhase4Entry, type Phase4EntryObservation, type Phase4EntryOptions } from './entry.js';
import { evaluatePhase4Run } from './run-unit.js';
import { phase4SetStatus } from './run-sequence.js';
import {
  PHASE4_MAX_ROUNDS_PER_RUN,
  type Phase4AttemptSummary,
  type Phase4EntryFailure,
  type Phase4PlannedRun,
  type Phase4RunFailure,
  type Phase4RunLabel,
  type Phase4RunOutcome,
  type Phase4RunRecord,
  type Phase4RunSet,
} from './model.js';

export interface Phase4RunDriver {
  observeEntry(set: Phase4RunSet): Promise<Phase4EntryObservation>;
  createRoom(roomId: string): Promise<void>;
  /** T1: the run's scope and goal, relayed for the Founder with the act's relay attribution. */
  captureScope(roomId: string, run: Phase4PlannedRun, relay: Phase4RunSet['founderRelay']): Promise<void>;
  /** Open one planning round; resolves when the round has settled, with its outcome kind. */
  runRound(roomId: string): Promise<{ readonly kind: string }>;
  roomState(roomId: string): Promise<string>;
  collectRecord(roomId: string, deploymentIdAtStart: string): Promise<Phase4RunRecord>;
}

export interface Phase4RunnerOptions {
  readonly pollMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly entry?: Phase4EntryOptions;
}

export interface Phase4AttemptResult {
  readonly label: Phase4RunLabel;
  readonly roomId: string;
  readonly outcome: Phase4RunOutcome;
  readonly entryFailures: readonly Phase4EntryFailure[];
  readonly failures: readonly Phase4RunFailure[];
  /** SHA-256 of the record's canonical JSON; absent when nothing ran. */
  readonly recordDigest?: string;
  readonly record?: Phase4RunRecord;
}

export class Phase4SetNotRunnableError extends Error {
  override readonly name = 'Phase4SetNotRunnableError';
}

export class Phase4Runner {
  private readonly pollMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly driver: Phase4RunDriver,
    private readonly options: Phase4RunnerOptions = {},
  ) {
    this.pollMs = options.pollMs ?? 5_000;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Run the set's next label. `prior` is every earlier attempt of this set, in order. */
  async runNext(set: Phase4RunSet, prior: readonly Phase4AttemptSummary[]): Promise<Phase4AttemptResult> {
    const status = phase4SetStatus(prior);
    if (status.nextLabel === null) {
      throw new Phase4SetNotRunnableError(status.satisfied ? 'the set is complete' : 'the set is spent: a new act is needed');
    }
    const run = set.runs.find((r) => r.label === status.nextLabel);
    if (run === undefined) throw new Phase4SetNotRunnableError(`the set names no ${status.nextLabel}`);
    if (prior.some((a) => a.outcome !== 'not_started' && set.runs.find((r) => r.label === a.label)?.roomId === run.roomId)) {
      throw new Phase4SetNotRunnableError(`room ${run.roomId} was already used`);
    }

    const observation = await this.driver.observeEntry(set);
    const entry = evaluatePhase4Entry(set, observation, this.options.entry);
    if (!entry.ok) {
      return { label: run.label, roomId: run.roomId, outcome: 'not_started', entryFailures: entry.failures, failures: [] };
    }
    const deploymentIdAtStart = observation.controlPlane.deploymentId;

    await this.driver.createRoom(run.roomId);
    await this.driver.captureScope(run.roomId, run, set.founderRelay);

    let decisionTimedOut = false;
    let roundsExceeded = false;
    for (let round = 1; ; round += 1) {
      if (round > PHASE4_MAX_ROUNDS_PER_RUN) {
        roundsExceeded = true;
        break;
      }
      const opened = await this.driver.runRound(run.roomId);
      if (opened.kind !== 'plan_review') break;
      const settled = await this.awaitFounder(run.roomId, set.decisionTimeoutMs);
      if (settled === null) {
        decisionTimedOut = true;
        break;
      }
      if (settled !== 'PLANNING') break; // approved, cancelled, or elsewhere: the record says which
    }

    const record = await this.driver.collectRecord(run.roomId, deploymentIdAtStart);
    const verdict = evaluatePhase4Run(set, run, record, { decisionTimedOut, roundsExceeded });
    return {
      label: run.label,
      roomId: run.roomId,
      outcome: verdict.outcome,
      entryFailures: [],
      failures: verdict.failures,
      recordDigest: phase4RecordDigest(record),
      record,
    };
  }

  /** Watch the room until it leaves PLAN_REVIEW; null when the Founder has not decided in time. */
  private async awaitFounder(roomId: string, timeoutMs: number): Promise<string | null> {
    const deadline = this.now() + timeoutMs;
    for (;;) {
      const state = await this.driver.roomState(roomId);
      if (state !== 'PLAN_REVIEW') return state;
      if (this.now() >= deadline) return null;
      await this.sleep(this.pollMs);
    }
  }
}

/** SHA-256 over the record's canonical JSON: keys sorted, no whitespace. */
export function phase4RecordDigest(record: Phase4RunRecord): string {
  return createHash('sha256').update(canonicalJson(record), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
