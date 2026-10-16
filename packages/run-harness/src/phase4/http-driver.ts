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
 *     routes, inert unless the act is configured.
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
}

export class Phase4DriverError extends Error {
  override readonly name = 'Phase4DriverError';
}

interface RoundView {
  readonly deploymentId: string | null;
  readonly gateway: { readonly id: string; readonly online: boolean };
  readonly dispatcherSurfaceRegistered: boolean;
  readonly round: { readonly status: string; readonly roomId?: string; readonly outcome?: { readonly kind: string } };
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
    if (created.status !== 201) throw new Phase4DriverError(`room creation answered ${created.status}`);
  }

  async captureScope(roomId: string, run: Phase4PlannedRun, relay: Phase4RunSet['founderRelay']): Promise<void> {
    const observer = this.options.observeRemoteHead;
    if (observer === undefined) {
      throw new Phase4DriverError('no remote-head observer: the driver observes the repository head instead of asserting it');
    }
    let observed: string | null;
    try {
      observed = await observer(run.inputs.repository);
    } catch {
      throw new Phase4DriverError(`remote head not observed for ${run.inputs.repository}`);
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
    if (t1.status !== 201) throw new Phase4DriverError(`scope capture answered ${t1.status}`);
  }

  async runRound(roomId: string): Promise<{ readonly kind: string }> {
    const started = await this.call('POST', `/control-plane/rooms/${roomId}/planner-round`, this.options.countedRunToken, {});
    if (started.status !== 202) return { kind: `not_started:${String(started.body['error'] ?? started.status)}` };
    const deadline = this.now() + (this.options.roundTimeoutMs ?? 45 * 60_000);
    for (;;) {
      const view = await this.roundView(roomId);
      if (view.round.status === 'settled' && view.round.roomId === roomId) return { kind: view.round.outcome?.kind ?? 'unknown' };
      if (this.now() >= deadline) return { kind: 'unknown' };
      await this.sleep(this.options.pollMs ?? 5_000);
    }
  }

  async roomState(roomId: string): Promise<string> {
    const view = await this.call('GET', `/rooms/${roomId}`, this.options.apiToken);
    const state = (view.body['snapshot'] as { state?: unknown } | undefined)?.state;
    if (view.status !== 200 || typeof state !== 'string') throw new Phase4DriverError(`room read answered ${view.status}`);
    return state;
  }

  async collectRecord(roomId: string, deploymentIdAtStart: string): Promise<Phase4RunRecord> {
    const exported = await this.call('GET', `/rooms/${roomId}/export`, this.options.apiToken);
    if (exported.status !== 200) throw new Phase4DriverError(`export answered ${exported.status}`);
    const reading = readPhase4Export(exported.body, roomId);
    const journal = await this.call('GET', `/control-plane/rooms/${roomId}/journal`, this.options.countedRunToken);
    if (journal.status !== 200) throw new Phase4DriverError(`journal read answered ${journal.status}`);
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

  private async roundView(roomId: string): Promise<RoundView> {
    const view = await this.call('GET', `/control-plane/rooms/${roomId}/planner-round`, this.options.countedRunToken);
    if (view.status !== 200) throw new Phase4DriverError(`planner-round read answered ${view.status}`);
    return view.body as unknown as RoundView;
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    token: string | null,
    body?: Record<string, unknown>,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const headers: Record<string, string> = {};
    if (token !== null) headers['authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await this.fetch(`${this.options.origin}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, body: parsed };
  }
}
