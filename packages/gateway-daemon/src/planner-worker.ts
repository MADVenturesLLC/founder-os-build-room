/**
 * The planner pull channel's Gateway side (Founder answer to Phase 4 plan r1
 * Q2b, "Gateway pulls, in Phase 4").
 *
 * The worker answers the control plane's three planner questions — `attest`,
 * `execute`, `status` — from a DURABLE record per command, kept in the
 * Gateway's own directory. The record is what makes the channel's promises
 * true across a restart of either side:
 *
 *   - AT MOST ONE EXECUTION PER COMMAND ID. `execute` writes `starting`,
 *     synced to disk with its directory entry, before it asks the executor
 *     to start, and answers every later `execute` for the command from the
 *     record, never by starting again. The executor keeps its own guard: a
 *     command whose evidence says its work was sent is never started again
 *     (`agy-planner-executor.ts`), so a worker record lost to a crash cannot
 *     run a command twice.
 *   - `not_sent` AND `never_received` ARE AFFIRMATIVE. They are answered only
 *     when the record proves the work never reached a provider: no record,
 *     an attestation only, or an executor that said it sent nothing; and,
 *     where the executor keeps its own record (`sent`), only when that record
 *     agrees. A record of the worker's that a crash left behind an
 *     executor's record of sent work gets neither answer.
 *   - SILENCE WHEN UNKNOWN. A start that threw, or an execution a previous
 *     process held (`starting` or `running` at boot, now `lost`), is not
 *     knowable here: the worker answers nothing, and the control plane
 *     records `unresolved` rather than a guess.
 *
 * THE EXECUTOR is the seam where an adapter plugs in. Which one runs the
 * Planner is ruled (Q2a: Antigravity, on the active model). The one provider
 * binding the Founder authorizes (FOUNDER-RULING-20261026-BR-PLANNER-EXECUTOR)
 * is `agy-planner-executor.ts`, selected only on Gateway `1880c12d`
 * (`planner-executor-factory.ts`); without it the daemon polls nothing.
 */

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  MAX_PLANNER_PAYLOAD_BYTES,
  PLANNER_SURFACES,
  validatePlannerReportPayload,
  validatePlannerRequest,
  type PlannerIdentityWire,
  type PlannerReportPayload,
  type PlannerRequestWire,
  type PlannerResultWire,
  type PlannerRouteWire,
  type PlannerWorkWire,
} from '../../gateway-protocol/src/index.js';
import { DIRECTORY_MODE, FILE_MODE } from './paths.js';

export type PlannerStart =
  /** The executor proves the work never reached a provider. */
  | { readonly kind: 'not_sent' }
  | {
      readonly kind: 'accepted';
      readonly observed: PlannerRouteWire;
      /** Settles with the plan, or rejects when the run fails. */
      readonly completion: Promise<PlannerResultWire>;
    };

/** What runs the Planner on this Gateway. `attest` contacts no provider. */
export interface PlannerExecutor {
  attest(request: { readonly commandId: string; readonly role: string; readonly intended: PlannerRouteWire }): Promise<PlannerIdentityWire>;
  /** Throws when the outcome is unknown; the worker then answers nothing. */
  start(work: PlannerWorkWire, identity: PlannerIdentityWire): Promise<PlannerStart>;
  /** Before the daemon takes any planner work, if the executor needs to prepare. */
  boot?(): Promise<void>;
  /** When the daemon stops: end what is in flight. */
  shutdown?(): Promise<void>;
  /** Whether it would attest now. Asked before a recorded attestation is answered again. */
  serves?(): Promise<boolean>;
  /**
   * What the executor's own record says of a command's work: `true` sent, `false` not sent
   * or no record, `null` when it cannot say. Asked before the worker affirms `not_sent` or
   * `never_received`, which it then does only on `false`.
   */
  sent?(commandId: string): Promise<boolean | null>;
}

/** One command, as this Gateway knows it. */
export type PlannerRecord =
  | { readonly commandId: string; readonly phase: 'attested'; readonly identity: PlannerIdentityWire }
  | { readonly commandId: string; readonly phase: 'starting'; readonly identity: PlannerIdentityWire }
  | { readonly commandId: string; readonly phase: 'not_sent'; readonly identity: PlannerIdentityWire }
  | {
      readonly commandId: string;
      readonly phase: 'running';
      readonly identity: PlannerIdentityWire;
      readonly observed: PlannerRouteWire;
    }
  | {
      readonly commandId: string;
      readonly phase: 'finished';
      readonly identity: PlannerIdentityWire;
      readonly observed: PlannerRouteWire;
      readonly result: PlannerResultWire;
    }
  /** Started, or starting, in a way this process cannot see the end of. */
  | { readonly commandId: string; readonly phase: 'lost'; readonly identity: PlannerIdentityWire; readonly observed?: PlannerRouteWire };

const PHASES = new Set(['attested', 'starting', 'not_sent', 'running', 'finished', 'lost']);

/** The planner records' directory, beside the daemon's state file. */
export function plannerRecordsDirectory(gatewayDirectory: string): string {
  return join(gatewayDirectory, 'planner');
}

/** Syncs a directory, so the renames and links already made in it survive a crash. */
export async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class PlannerRecordStore {
  constructor(private readonly directory: string) {}

  /** A command id is arbitrary text; its file name is its digest, so no id can name a path. */
  private pathOf(commandId: string): string {
    return join(this.directory, `${createHash('sha256').update(commandId, 'utf8').digest('hex')}.json`);
  }

  async read(commandId: string): Promise<PlannerRecord | null> {
    let text: string;
    try {
      text = await readFile(this.pathOf(commandId), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const record = JSON.parse(text) as PlannerRecord;
    if (record.commandId !== commandId || !PHASES.has(record.phase)) {
      throw new Error(`planner record for ${commandId} is not a planner record`);
    }
    return record;
  }

  /**
   * Atomic tmp+rename, mode 0600, as the daemon's state file: the file is
   * synced before the rename and the directory after it (and the Gateway's
   * directory too when this one was just made), so a record that was written
   * is still there after a crash. The write-ahead `starting` record depends
   * on that: a lost one would leave an older phase that permits the command
   * to start again.
   */
  async write(record: PlannerRecord): Promise<void> {
    const created = await mkdir(this.directory, { recursive: true, mode: DIRECTORY_MODE });
    const temporary = join(this.directory, `.record.${randomUUID()}.tmp`);
    const handle = await open(temporary, 'wx', FILE_MODE);
    try {
      await handle.writeFile(`${JSON.stringify(record)}\n`, { encoding: 'utf8' });
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, this.pathOf(record.commandId));
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    await syncDirectory(this.directory);
    if (created !== undefined) await syncDirectory(dirname(this.directory));
  }

  async all(): Promise<PlannerRecord[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const records: PlannerRecord[] = [];
    for (const name of names) {
      if (!name.endsWith('.json') || name.startsWith('.')) continue;
      records.push(JSON.parse(await readFile(join(this.directory, name), 'utf8')) as PlannerRecord);
    }
    return records;
  }
}

function isIdentity(value: PlannerIdentityWire): boolean {
  const text = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '' && v.length <= 256;
  return (
    text(value.executionId) &&
    text(value.role) &&
    (PLANNER_SURFACES as readonly string[]).includes(value.surface) &&
    text(value.model) &&
    text(value.provider) &&
    text(value.effort)
  );
}

/** A finished result whose report would not fit the payload bound is a failed run, not a truncated plan. */
function boundedResult(result: PlannerResultWire, record: Omit<Extract<PlannerRecord, { phase: 'finished' }>, 'result'>): PlannerResultWire {
  const payload: PlannerReportPayload = {
    kind: 'finished',
    executionId: record.identity.executionId,
    observed: record.observed,
    result,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  return bytes <= MAX_PLANNER_PAYLOAD_BYTES ? result : { kind: 'failed' };
}

export interface PlannerWorkerDeps {
  readonly executor: PlannerExecutor;
  readonly records: PlannerRecordStore;
  readonly log?: (level: 'info' | 'warn' | 'error', at: string, fields: Record<string, unknown>) => void;
}

export class GatewayPlannerWorker {
  /** Completions still settling in this process, so a test can wait for them. */
  private readonly settling = new Set<Promise<void>>();

  constructor(private readonly deps: PlannerWorkerDeps) {}

  /**
   * At boot, nothing is running in this process yet. A record left
   * `starting` or `running` is an execution this process cannot see the end
   * of: it becomes `lost`, and `status` answers nothing for it.
   */
  async boot(): Promise<void> {
    try {
      for (const record of await this.deps.records.all()) {
        if (record.phase === 'starting') {
          await this.deps.records.write({ commandId: record.commandId, phase: 'lost', identity: record.identity });
        } else if (record.phase === 'running') {
          await this.deps.records.write({
            commandId: record.commandId,
            phase: 'lost',
            identity: record.identity,
            observed: record.observed,
          });
        }
      }
    } finally {
      // The executor prepares last, so nothing it does is mistaken for a lost execution;
      // and it prepares even when a record cannot be read or rewritten, so its boot
      // cleanup never depends on the worker's own records.
      await this.deps.executor.boot?.();
    }
  }

  /** The daemon is stopping: the executor ends what it has in flight, then its records settle. */
  async shutdown(): Promise<void> {
    await this.deps.executor.shutdown?.();
    await this.settled();
  }

  /** Wait for every completion this process is still recording. */
  async settled(): Promise<void> {
    await Promise.all([...this.settling]);
  }

  /**
   * Answer one request, or `null` when there is no honest answer to give. A
   * request that does not validate is answered with nothing, too: the
   * control plane is the only producer, so it is a defect, logged, never
   * guessed at.
   */
  async handle(raw: unknown): Promise<PlannerReportPayload | null> {
    const request = validatePlannerRequest(raw);
    if (request === null) {
      this.log('error', 'planner.request_invalid', {});
      return null;
    }
    const payload = await this.answer(request);
    /*
     * The control plane refuses a signed report outside the closed shapes
     * with `invalid_request`, which the primary table halts the lane on —
     * heartbeats included. So a payload is checked here against the same
     * validator first, and one that would fail (an executor's over-long
     * route, say) is not sent: the question goes unanswered, which the
     * control plane records as `unresolved`, and the session lives.
     */
    if (payload !== null && validatePlannerReportPayload(JSON.parse(JSON.stringify(payload))) === null) {
      this.log('error', 'planner.report_invalid', { kind: payload.kind });
      return null;
    }
    return payload;
  }

  private answer(request: PlannerRequestWire): Promise<PlannerReportPayload | null> {
    switch (request.kind) {
      case 'attest':
        return this.attest(request);
      case 'execute':
        return this.execute(request);
      case 'status':
        return this.status(request.commandId);
    }
  }

  private async attest(request: Extract<PlannerRequestWire, { kind: 'attest' }>): Promise<PlannerReportPayload> {
    const existing = await this.deps.records.read(request.commandId);
    // One execution per command: a repeated attest re-answers the identity already bound,
    // while the executor would still attest now.
    if (existing !== null) {
      if (this.deps.executor.serves !== undefined && !(await this.deps.executor.serves())) {
        this.log('warn', 'planner.attest_failed', { message: 'the executor no longer serves this Gateway' });
        return { kind: 'attest_failed' };
      }
      return { kind: 'attested', identity: existing.identity };
    }

    let identity: PlannerIdentityWire;
    try {
      identity = await this.deps.executor.attest({
        commandId: request.commandId,
        role: request.role,
        intended: request.intended,
      });
    } catch (error) {
      this.log('warn', 'planner.attest_failed', { message: describe(error) });
      return { kind: 'attest_failed' };
    }
    if (!isIdentity(identity)) return { kind: 'attest_failed' };
    await this.deps.records.write({ commandId: request.commandId, phase: 'attested', identity: { ...identity } });
    return { kind: 'attested', identity: { ...identity } };
  }

  private async execute(request: Extract<PlannerRequestWire, { kind: 'execute' }>): Promise<PlannerReportPayload | null> {
    const record = await this.deps.records.read(request.commandId);
    // No attestation, or a different execution than the one attested: nothing starts.
    if (record === null || record.identity.executionId !== request.executionId) return this.affirm('not_sent', request.commandId);

    switch (record.phase) {
      case 'not_sent':
        return this.affirm('not_sent', request.commandId);
      case 'running':
      case 'finished':
        return { kind: 'accepted', observed: record.observed };
      case 'starting':
      case 'lost':
        return null;
      case 'attested':
        break;
    }

    // Write-ahead: from here on, contact with a provider cannot be ruled out.
    await this.deps.records.write({ commandId: record.commandId, phase: 'starting', identity: record.identity });
    let started: PlannerStart;
    try {
      started = await this.deps.executor.start(request.work, record.identity);
    } catch (error) {
      this.log('error', 'planner.start_unknown', { message: describe(error) });
      await this.deps.records.write({ commandId: record.commandId, phase: 'lost', identity: record.identity });
      return null;
    }
    if (started.kind === 'not_sent') {
      await this.deps.records.write({ commandId: record.commandId, phase: 'not_sent', identity: record.identity });
      return { kind: 'not_sent' };
    }

    const running = { commandId: record.commandId, identity: record.identity, observed: { ...started.observed } };
    /*
     * The completion is handled BEFORE anything else is awaited: a run that
     * fails at once must not be an unhandled rejection while the `running`
     * record is still being written. Its `finished` record is written only
     * after the `running` one, so the record never moves backwards.
     */
    const outcome = started.completion.then(
      (result) => boundedResult(result, { ...running, phase: 'finished' }),
      (error: unknown): PlannerResultWire => {
        this.log('warn', 'planner.run_failed', { message: describe(error) });
        return { kind: 'failed' };
      },
    );
    const written = this.deps.records.write({ ...running, phase: 'running' });
    const settle = written
      .then(() => outcome)
      .then((result) => this.deps.records.write({ ...running, phase: 'finished', result }))
      .catch((error: unknown) => this.log('error', 'planner.record_failed', { message: describe(error) }));
    await written;
    this.settling.add(settle);
    void settle.finally(() => this.settling.delete(settle));
    return { kind: 'accepted', observed: { ...started.observed } };
  }

  /**
   * An affirmative answer, only while the executor's own record agrees that nothing was
   * sent. One that says the work was sent, or cannot be read, is a contradiction of the
   * worker's record (a crash can lose the worker's later phase), and the answer is nothing.
   */
  private async affirm(kind: 'not_sent' | 'never_received', commandId: string): Promise<PlannerReportPayload | null> {
    if (this.deps.executor.sent === undefined) return { kind };
    let sent: boolean | null;
    try {
      sent = await this.deps.executor.sent(commandId);
    } catch (error) {
      this.log('error', 'planner.evidence_unknown', { commandId, message: describe(error) });
      return null;
    }
    if (sent === false) return { kind };
    this.log('error', 'planner.evidence_contradicts', { commandId, kind, sent });
    return null;
  }

  private async status(commandId: string): Promise<PlannerReportPayload | null> {
    const record = await this.deps.records.read(commandId);
    if (record === null) return this.affirm('never_received', commandId);
    switch (record.phase) {
      case 'attested':
      case 'not_sent':
        return this.affirm('never_received', commandId);
      case 'running':
        return { kind: 'running', executionId: record.identity.executionId, observed: record.observed };
      case 'finished':
        return {
          kind: 'finished',
          executionId: record.identity.executionId,
          observed: record.observed,
          result: record.result,
        };
      case 'starting':
      case 'lost':
        return null;
    }
  }

  private log(level: 'info' | 'warn' | 'error', at: string, fields: Record<string, unknown>): void {
    this.deps.log?.(level, at, fields);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
