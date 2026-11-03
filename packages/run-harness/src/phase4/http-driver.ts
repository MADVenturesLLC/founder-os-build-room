/**
 * The Phase 4 run driver over the deployed control plane's routes (plan r1
 * slice 10, run-unit Q9). It is the driver a counted run would use; nothing
 * runs one until the Founder's counted-run act is given and configured.
 *
 * Routes it reads and writes, and with which credential:
 *   - `GET /version` (none): the commit the control plane serves;
 *   - `GET /control-plane/enrollments` (API token): enrolled Gateways;
 *   - `POST /rooms`, `POST /rooms/:id/events` (API token): the room and its
 *     T1, the act's scope and goal relayed (Q14);
 *   - `GET /rooms/:id`, `GET /rooms/:id/export` (API token): state and record;
 *   - `POST|GET /control-plane/rooms/:id/planner-round` and
 *     `GET /control-plane/rooms/:id/journal` (counted-run token): the Q9
 *     routes, inert unless the act is configured;
 *   - `GET /control-plane/rooms/:id/plan` (API token): the plan under the
 *     room's latest T3, saved for the Founder to read (REHEARSAL-FIXES B2).
 * It never calls the plan-decision route, and holds no credential that opens
 * it: the counted-run token is distinct from the adjudication token, and the
 * Founder decides there.
 *
 * Two facts the control plane cannot see are the caller's to supply, read
 * where they live: FounderOS's checkout (commit and cleanliness) and whether
 * the PC's Gateway has a planner executor (its `doctor`). The repository's
 * live head is neither: the driver OBSERVES it (Copilot, 2026-10-16) and
 * refuses to capture scope against a head it could not observe or that is
 * not the act's base — it never asserts the fact it was going to check.
 * Tokens are held in memory and never logged or echoed.
 *
 * REQUESTS (FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL-FIXES B1). Every request
 * ends within `PHASE4_REQUEST_TIMEOUT_MS` or fails. A read (GET) that fails
 * with no HTTP answer, or is answered 502 or 504, is tried again on
 * `PHASE4_READ_RETRY_DELAYS_MS`, then every `PHASE4_READ_RETRY_STEADY_MS`,
 * for at most `PHASE4_READ_RETRY_WINDOW_MS` from its first failure, and then
 * fails as it did before: no try starts, runs or is taken after the window.
 * A request whose status has arrived is answered, even if its body stalls. A write (POST) is never tried again: a write whose
 * answer was lost may have taken effect. No other answer is retried, 503
 * included, which the control plane answers for states that are not
 * transient. The first rehearsal ended on one lost read in a four-hour
 * decision window (2026-11-03, 13:25:05Z).
 */

import { readPhase4Export } from './export-reader.js';
import { PHASE4_DISPATCHER } from './model.js';
import type { Phase4EntryObservation } from './entry.js';
import type { Phase4PlannedRun, Phase4RecordedCommand, Phase4RecordedDecision, Phase4RunRecord, Phase4RunSet } from './model.js';
import type { Phase4RunDriver } from './runner.js';

export interface HttpPhase4DriverOptions {
  readonly origin: string;
  readonly apiToken: string;
  /** `PHASE4_COUNTED_RUN_TOKEN`: starts rounds and reads the journal, and opens nothing else. */
  readonly countedRunToken: string;
  readonly founderOs: { readonly sha: string; readonly clean: boolean };
  readonly executorAvailable: boolean;
  /**
   * Observes the repository's live head (the harness has egress; the control
   * plane does not). Required: without it the driver refuses to capture
   * scope rather than assert the remote head itself.
   */
  readonly observeRemoteHead?: (repository: string) => Promise<string | null>;
  /** How long one planning round may run before the driver stops waiting on it. */
  readonly roundTimeoutMs?: number;
  readonly pollMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly fetch?: typeof fetch;
  /** Told one line, with no token and no body, each time a read is tried again. */
  readonly onRetry?: (line: string) => void;
  readonly requestTimeoutMs?: number;
}

export class Phase4DriverError extends Error {
  override readonly name: string = 'Phase4DriverError';
}

/** A request that got no HTTP answer: the network failed, or nothing answered in time. */
export class Phase4TransportError extends Phase4DriverError {
  override readonly name = 'Phase4TransportError';
}

export const PHASE4_REQUEST_TIMEOUT_MS = 30_000;
export const PHASE4_READ_RETRY_DELAYS_MS: readonly number[] = Object.freeze([5_000, 10_000, 20_000, 40_000]);
export const PHASE4_READ_RETRY_STEADY_MS = 60_000;
export const PHASE4_READ_RETRY_WINDOW_MS = 10 * 60_000;
/** The answers to a read that are tried again: the edge's gateway errors. */
const RETRIED_STATUSES: ReadonlySet<number> = new Set([502, 504]);

/** The plan the plan route answers. */
export interface Phase4PlanReading {
  readonly commandId: string;
  readonly planHash: string;
  readonly document: unknown;
}

interface RoundView {
  readonly actId?: string;
  readonly deploymentId: string | null;
  readonly gateway: { readonly id: string; readonly online: boolean };
  readonly dispatcherSurfaceRegistered: boolean;
  readonly round: {
    readonly status: string;
    readonly roomId?: string;
    readonly outcome?: { readonly kind: string; readonly code?: string; readonly reason?: string };
  };
}

function routeRefusal(action: string, status: number, body: Record<string, unknown>): string {
  const details = [body['error'], body['code'], body['outcome'], body['reason'], body['message']].filter(
    (v): v is string => typeof v === 'string' && v.length > 0 && v !== 'rejected',
  );
  const suffix = details.length > 0 ? `: ${details.join(' — ')}` : '';
  return `${action} answered ${status}${suffix}`;
}

export class HttpPhase4Driver implements Phase4RunDriver {
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HttpPhase4DriverOptions) {
    this.fetch = options.fetch ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async observeEntry(set: Phase4RunSet): Promise<Phase4EntryObservation> {
    // Bound to the act it drives (Copilot, 2026-10-16): every request this
    // driver makes goes to this origin, so an act naming another control
    // plane is refused before anything is read or written.
    const named = new URL(set.controlPlaneOrigin).origin;
    const driven = new URL(this.options.origin).origin;
    if (named !== driven) {
      throw new Phase4DriverError(`the act names control plane ${named}; this driver is bound to ${driven}`);
    }
    const version = await this.call('GET', '/version', null);
    const view = await this.roundView(set.runs[0]!.roomId).catch(() => null);
    const enrollments = await this.call('GET', '/control-plane/enrollments', this.options.apiToken).catch(() => null);
    const enrolled = Array.isArray(enrollments?.body['enrollments'])
      ? (enrollments!.body['enrollments'] as { gatewayId?: unknown; state?: unknown }[])
          .filter((e) => e.state === 'enrolled' && typeof e.gatewayId === 'string')
          .map((e) => e.gatewayId as string)
      : [];
    const commit = typeof version.body['commit'] === 'string' ? (version.body['commit'] as string) : '';
    const ok = version.status === 200 && view !== null && view.deploymentId !== null && enrollments?.status === 200;
    return {
      controlPlane: { status: ok ? 200 : 503, commit, deploymentId: view?.deploymentId ?? '' },
      founderOs: this.options.founderOs,
      enrolledGateways: enrolled,
      gatewayOnline: view !== null && view.gateway.id === set.gatewayId && view.gateway.online,
      executorAvailable: this.options.executorAvailable,
      // The one surface entry checks, as the control plane itself reads its registry.
      registeredSurfaces: new Set(view?.dispatcherSurfaceRegistered === true ? [PHASE4_DISPATCHER.executionSurface] : []),
    };
  }

  async createRoom(roomId: string): Promise<void> {
    const created = await this.call('POST', '/rooms', this.options.apiToken, { roomId });
    if (created.status !== 201) throw new Phase4DriverError(routeRefusal('room creation', created.status, created.body));
  }

  async captureScope(roomId: string, run: Phase4PlannedRun, relay: Phase4RunSet['founderRelay']): Promise<void> {
    const observer = this.options.observeRemoteHead;
    if (observer === undefined) {
      throw new Phase4DriverError('no remote-head observer: the driver observes the repository head instead of asserting it');
    }
    let observed: string | null;
    try {
      observed = await observer(run.inputs.repository);
    } catch (error) {
      const reason = error instanceof Error && error.message.length > 0 ? `: ${error.message}` : '';
      throw new Phase4DriverError(`remote head not observed for ${run.inputs.repository}${reason}`);
    }
    if (observed === null || observed !== run.inputs.baseSha) {
      throw new Phase4DriverError(`remote head ${observed ?? 'unobserved'} does not match the act's base ${run.inputs.baseSha}`);
    }
    const t1 = await this.call('POST', `/rooms/${roomId}/events`, this.options.apiToken, {
      eventId: `evt_t1_${roomId}`,
      event: 'scope.captured',
      actor: 'founder',
      attribution: { roleId: null, actorId: 'founder', actualModel: relay.actualModel, executionSurface: relay.executionSurface },
      scope: { roomId, repo: run.inputs.repository, paths: [...run.inputs.scopePaths] },
      evidence: [],
      occurredAt: new Date(this.now()).toISOString(),
      facts: { repoInAllowlist: true, baseSha: run.inputs.baseSha, remoteHeadSha: observed },
      goal: run.inputs.goal,
    });
    if (t1.status !== 201) throw new Phase4DriverError(routeRefusal('scope capture', t1.status, t1.body));
  }

  async runRound(roomId: string): Promise<{ readonly kind: string; readonly planHash?: string }> {
    const started = await this.call('POST', `/control-plane/rooms/${roomId}/planner-round`, this.options.countedRunToken, {});
    if (started.status !== 202) {
      throw new Phase4DriverError(routeRefusal('planner-round start', started.status, started.body));
    }
    const timeoutMs = this.options.roundTimeoutMs ?? 45 * 60_000;
    const deadline = this.now() + timeoutMs;
    for (;;) {
      const view = await this.roundView(roomId);
      if (view.round.status === 'settled' && view.round.roomId === roomId) {
        const outcome = view.round.outcome;
        if (outcome?.kind === 'refused' || outcome?.kind === 'error') {
          const detail = [outcome.code, outcome.reason].filter((v): v is string => typeof v === 'string' && v.length > 0).join(' — ');
          throw new Phase4DriverError(`planner-round ${outcome.kind}${detail.length > 0 ? `: ${detail}` : ''}`);
        }
        const planHash = (outcome as { planHash?: unknown } | undefined)?.planHash;
        return { kind: outcome?.kind ?? 'unknown', ...(typeof planHash === 'string' ? { planHash } : {}) };
      }
      if (this.now() >= deadline) {
        throw new Phase4DriverError(`planner-round timed out after ${timeoutMs}ms in room ${roomId} (status: ${view.round.status})`);
      }
      await this.sleep(this.options.pollMs ?? 5_000);
    }
  }

  async roomState(roomId: string): Promise<string> {
    const view = await this.call('GET', `/rooms/${roomId}`, this.options.apiToken);
    const state = (view.body['snapshot'] as { state?: unknown } | undefined)?.state;
    if (view.status !== 200 || typeof state !== 'string') {
      throw new Phase4DriverError(routeRefusal('room read', view.status, view.body));
    }
    return state;
  }

  async collectRecord(roomId: string, deploymentIdAtStart: string): Promise<Phase4RunRecord> {
    const exported = await this.call('GET', `/rooms/${roomId}/export`, this.options.apiToken);
    if (exported.status !== 200) throw new Phase4DriverError(routeRefusal('export', exported.status, exported.body));
    const reading = readPhase4Export(exported.body, roomId);
    const journal = await this.call('GET', `/control-plane/rooms/${roomId}/journal`, this.options.countedRunToken);
    if (journal.status !== 200) throw new Phase4DriverError(routeRefusal('journal read', journal.status, journal.body));
    const commands = journal.body['commands'] as Phase4RecordedCommand[];
    const decisions = (journal.body['decisions'] as { commandId: string; decision: string; planHash?: string }[]).map(
      (d): Phase4RecordedDecision => ({ commandId: d.commandId, decision: d.decision, ...(d.planHash === undefined ? {} : { planHash: d.planHash }) }),
    );
    const verified = (journal.body['journal'] as { verified?: unknown } | undefined)?.verified === true;
    const view = await this.roundView(roomId);
    return {
      roomId,
      deploymentIdAtStart,
      deploymentIdAtEnd: view.deploymentId ?? '',
      finalState: reading.finalState,
      events: reading.events,
      commands,
      decisions,
      journalVerified: verified,
    };
  }

  /**
   * The room's planner commands as the journal route returns them, each row
   * as decoded (FOUNDER-ACT-20261029-BR-PLANNER-READINESS Part B reads a
   * dispatched row's `initModel` and `providerConversationId` here).
   */
  async journalCommands(roomId: string): Promise<readonly { readonly commandId: string; readonly rows: readonly Record<string, unknown>[] }[]> {
    const journal = await this.call('GET', `/control-plane/rooms/${roomId}/journal`, this.options.countedRunToken);
    if (journal.status !== 200) throw new Phase4DriverError(routeRefusal('journal read', journal.status, journal.body));
    const commands = journal.body['commands'];
    if (!Array.isArray(commands)) throw new Phase4DriverError('journal read answered without a commands list');
    return commands as { commandId: string; rows: Record<string, unknown>[] }[];
  }

  /** The plan under the room's latest T3 (REHEARSAL-FIXES B2). */
  async readPlan(roomId: string): Promise<Phase4PlanReading> {
    const read = await this.call('GET', `/control-plane/rooms/${roomId}/plan`, this.options.apiToken);
    if (read.status !== 200) throw new Phase4DriverError(routeRefusal('plan read', read.status, read.body));
    const { commandId, planHash, document } = read.body;
    if (typeof commandId !== 'string' || typeof planHash !== 'string' || document === undefined) {
      throw new Phase4DriverError('plan read answered without a commandId, planHash and document');
    }
    return { commandId, planHash, document };
  }

  /** The act the control plane's counted-run surface is configured for, or null when it names none. */
  async countedRunActId(roomId: string): Promise<string | null> {
    const view = await this.roundView(roomId);
    return typeof view.actId === 'string' && view.actId !== '' ? view.actId : null;
  }

  private async roundView(roomId: string): Promise<RoundView> {
    const view = await this.call('GET', `/control-plane/rooms/${roomId}/planner-round`, this.options.countedRunToken);
    if (view.status !== 200) throw new Phase4DriverError(routeRefusal('planner-round read', view.status, view.body));
    return view.body as unknown as RoundView;
  }

  /** One request, or for a read as many as B1 allows. */
  private async call(
    method: 'GET' | 'POST',
    path: string,
    token: string | null,
    body?: Record<string, unknown>,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const timeoutMs = this.options.requestTimeoutMs ?? PHASE4_REQUEST_TIMEOUT_MS;
    if (method !== 'GET') return this.once(method, path, token, timeoutMs, body);
    // The window runs from the first failure. Every try ends inside it: a try
    // is never dispatched without time left, its timeout is cut to the time
    // left, and an answer that still comes after the window is not taken
    // (Codex, PR 143). The last failure is what the read fails with, as before.
    let deadline: number | null = null;
    let last: Phase4TransportError | { status: number; body: Record<string, unknown> } | null = null;
    const failAsBefore = (): { status: number; body: Record<string, unknown> } => {
      if (last instanceof Phase4TransportError) throw last;
      return last!;
    };
    for (let retries = 0; ; retries += 1) {
      const budget = deadline === null ? timeoutMs : Math.min(timeoutMs, deadline - this.now());
      if (budget <= 0) return failAsBefore();
      let answer: { status: number; body: Record<string, unknown> } | null = null;
      let failure: Phase4TransportError | null = null;
      try {
        answer = await this.once('GET', path, token, budget);
      } catch (error) {
        if (!(error instanceof Phase4TransportError)) throw error;
        failure = error;
      }
      if (answer !== null && !RETRIED_STATUSES.has(answer.status)) {
        if (deadline !== null && this.now() > deadline) return failAsBefore();
        return answer;
      }
      last = failure ?? answer;
      const at = this.now();
      deadline ??= at + PHASE4_READ_RETRY_WINDOW_MS;
      const delay = PHASE4_READ_RETRY_DELAYS_MS[retries] ?? PHASE4_READ_RETRY_STEADY_MS;
      // No wait that would leave no time for the try after it.
      if (at + delay >= deadline) return failAsBefore();
      const reason = failure !== null ? failure.message : `answered ${answer!.status}`;
      this.options.onRetry?.(`${new Date(at).toISOString()} GET ${path}: ${reason}; trying again in ${Math.ceil(delay / 1000)}s`);
      await this.sleep(delay);
    }
  }

  /**
   * One request, ended within `timeoutMs`. No HTTP answer is a
   * `Phase4TransportError`. Once the status has arrived the request is
   * answered, whatever happens to its body: a body that does not arrive in
   * time is read as empty, under the status received (Codex, PR 143), so a
   * 503 whose body stalls is still a 503 and is not tried again.
   */
  private async once(
    method: 'GET' | 'POST',
    path: string,
    token: string | null,
    timeoutMs: number,
    body?: Record<string, unknown>,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers: Record<string, string> = {};
    if (token !== null) headers['authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const controller = new AbortController();
    let received: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        if (received !== null) resolve({ status: received, body: {} });
        else reject(new Phase4TransportError(`no answer within ${timeoutMs}ms`));
      }, timeoutMs);
    });
    const exchange = (async () => {
      let response: Response;
      try {
        response = await this.fetch(`${this.options.origin}${path}`, {
          method,
          headers,
          signal: controller.signal,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch (error) {
        // The message only ("fetch failed"): a cause can carry addresses.
        throw new Phase4TransportError(error instanceof Error && error.message.length > 0 ? error.message : 'the request failed');
      }
      received = response.status;
      const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: response.status, body: parsed };
    })();
    try {
      return await Promise.race([exchange, timedOut]);
    } finally {
      clearTimeout(timer);
    }
  }
}
