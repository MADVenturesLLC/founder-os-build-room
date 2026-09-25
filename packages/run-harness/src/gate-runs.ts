/**
 * The persisted gate-run sequence, from the harness's side
 * (`docs/phase-2-known-limits.md` §2; migration `0007_gate_runs`).
 *
 * The three-run gate used to count within one invocation, from a sequence
 * this process built in memory — so a re-run restarted the record. Now the
 * record lives in the control plane and this module is the harness's only way
 * to it:
 *
 * - `load()` returns the whole persisted sequence. The CLI calls it before the
 *   run loop, and again after it to compute the gate.
 * - `append()` sends one run and returns it with the `seq` the STORE assigned.
 *   The harness never numbers a run.
 *
 * **There is no fallback.** A store that cannot be reached, answers non-2xx,
 * or returns a history that is not gapless from 1 is a `GateRunHistoryError`,
 * and the CLI exits `GATE_STORE_UNAVAILABLE_EXIT`. Counting in memory when the
 * store is down would restore the defect under a different name.
 */

import type { ControlPlaneClient, Probe } from './client.js';
import type { RunRecord } from './record.js';
import type { RunSequence, UnsequencedRunRecord } from './sequence.js';

export type { UnsequencedRunRecord } from './sequence.js';

/** The gate a Phase 2 run counts toward — the `gate` CHECK in `0007_gate_runs`. */
export const PHASE2_GATE = 'phase2_three_run';

/**
 * Exit code when the gate-run store is unreachable or its history is invalid.
 * Distinct from 1 (ran, gate not satisfied) and 3 (redaction refused): a
 * scripted caller must be able to tell "the gate failed" from "the record
 * could not be read or written".
 */
export const GATE_STORE_UNAVAILABLE_EXIT = 4;

export type GateRunHistoryErrorCode =
  /** Transport failure or a non-2xx answer. */
  | 'store_unavailable'
  /** The store answered, and what it holds is not a gapless sequence of runs from 1. */
  | 'history_invalid'
  /** The store refused this run (400 invalid, 409 run-id conflict). */
  | 'append_refused';

export class GateRunHistoryError extends Error {
  override readonly name = 'GateRunHistoryError';
  constructor(
    readonly code: GateRunHistoryErrorCode,
    readonly operation: 'load' | 'append',
    /** Status and transport error only — never a response body. */
    readonly detail: string,
  ) {
    super(`gate run history ${code} during ${operation}: ${detail}`);
  }
}

export interface GateRunStore {
  load(): Promise<RunSequence>;
  append(run: UnsequencedRunRecord): Promise<RunRecord>;
}

type GateRunClient = Pick<ControlPlaneClient, 'listGateRuns' | 'appendGateRun'>;

/** The control plane's `GET`/`POST /gate/runs`. */
export class HttpGateRunStore implements GateRunStore {
  constructor(private readonly client: GateRunClient) {}

  async load(): Promise<RunSequence> {
    const probe = await this.client.listGateRuns();
    if (!probe.ok) throw new GateRunHistoryError('store_unavailable', 'load', describe(probe));
    const runs = (probe.body as { runs?: unknown } | null)?.runs;
    if (!Array.isArray(runs)) throw new GateRunHistoryError('history_invalid', 'load', 'no runs array');
    const parsed = runs.map(parseRunRecord);
    if (parsed.some((run) => run === null)) {
      throw new GateRunHistoryError('history_invalid', 'load', 'a listed run is not a run record');
    }
    return validateHistory({ runs: parsed as RunRecord[] });
  }

  async append(run: UnsequencedRunRecord): Promise<RunRecord> {
    const probe = await this.client.appendGateRun({ gate: PHASE2_GATE, run });
    if (!probe.ok) {
      const refused = probe.status === 400 || probe.status === 409;
      throw new GateRunHistoryError(refused ? 'append_refused' : 'store_unavailable', 'append', describe(probe));
    }
    const persisted = parseRunRecord((probe.body as { run?: unknown } | null)?.run);
    if (persisted === null || persisted.runId !== run.runId) {
      throw new GateRunHistoryError('history_invalid', 'append', 'the store did not return the appended run');
    }
    return persisted;
  }
}

/**
 * A persisted sequence must be gapless from 1, in order. Anything else is an
 * integrity finding, surfaced as a hard failure — never repaired or renumbered
 * here, because renumbering is exactly how a failure becomes absent.
 */
export function validateHistory(sequence: RunSequence): RunSequence {
  sequence.runs.forEach((run, index) => {
    if (run.seq !== index + 1) {
      throw new GateRunHistoryError(
        'history_invalid',
        'load',
        `position ${index + 1} holds seq ${String(run.seq)}; the sequence must be gapless from 1`,
      );
    }
  });
  return sequence;
}

function describe(probe: Probe): string {
  return probe.status === 0 ? `transport: ${probe.error ?? 'no response'}` : `HTTP ${probe.status}`;
}

function parseRunRecord(value: unknown): RunRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!Number.isInteger(v['seq']) || (v['seq'] as number) < 1) return null;
  for (const key of ['runId', 'startedAt', 'endedAt', 'commit'] as const) {
    if (typeof v[key] !== 'string') return null;
  }
  if (!Array.isArray(v['steps']) || !Array.isArray(v['conditions'])) return null;
  if (v['verdict'] !== 'passed' && v['verdict'] !== 'failed') return null;
  if (v['failureReason'] !== undefined && typeof v['failureReason'] !== 'string') return null;
  return {
    seq: v['seq'] as number,
    runId: v['runId'] as string,
    startedAt: v['startedAt'] as string,
    endedAt: v['endedAt'] as string,
    commit: v['commit'] as string,
    steps: v['steps'] as RunRecord['steps'],
    conditions: v['conditions'] as RunRecord['conditions'],
    verdict: v['verdict'],
    ...(v['failureReason'] === undefined ? {} : { failureReason: v['failureReason'] as string }),
  };
}
