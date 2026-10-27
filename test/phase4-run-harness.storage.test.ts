/**
 * The Phase 4 run harness over the real assembly (plan r1 slice 10). This is
 * not a counted run. Nothing here is authorized as one, the Planner is a
 * synthetic executor, and the database is a disposable test instance.
 *
 * What it proves is that the harness reads real records truly. The runner
 * drives a run through a test driver over the same assembly as
 * `test/phase4-lifecycle.storage.test.ts`. The driver uses the real room
 * routes, the export route read by the harness's own `readPhase4Export`, and
 * the production store classes; the planner loop runs with the Q2a route and
 * the Q7b attribution. The run unit then judges what was actually persisted.
 * The test plays the Founder at the plan-decision route, which the runner
 * never touches.
 *
 * Cases: a run that the Founder approves passes, and its T2 carries the Q7b
 * attribution the ledger accepted; a run that the Founder revises and then
 * approves passes in two rounds; a run that the Founder cancels is rejected;
 * and the set's progress follows.
 *
 * Runtime-role tier only, as the lifecycle suite: the journal accepts only
 * `br_app_runtime`.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  ControlPlaneClient,
  GatewayPlannerWorker,
  PlannerRecordStore,
  PrimaryLane,
  createDaemonClock,
} from '../packages/gateway-daemon/src/index.js';
import { JournalStore } from '../packages/control-plane/src/journal-store.js';
import { PlanStore } from '../packages/control-plane/src/plan-store.js';
import { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import { PlannerLoop, plannerCommandIdFor } from '../packages/control-plane/src/planner-loop.js';
import {
  HttpPhase4Driver,
  PHASE4_DISPATCHER,
  Phase4DriverError,
  Phase4Runner,
  phase4SetStatus,
  readPhase4Export,
  registeredSurfaceIds,
  type Phase4AttemptResult,
  type Phase4AttemptSummary,
  type Phase4EntryObservation,
  type Phase4RecordedCommand,
  type Phase4RunDriver,
  type Phase4RunRecord,
  type Phase4RunSet,
} from '../packages/run-harness/src/phase4/index.js';
import { createGatewayHarness, destroyGatewayHarness, RUNTIME_ROLE_MODE, STORAGE_SKIP, type GatewayHarness } from './gateway-storage-helpers.js';
import { enrollGateway, makeSessionNode, promoteNode, startNodeServer, type EnrolledGateway, type SessionNode } from './gateway-session-helpers.js';
import { SyntheticExecutor } from './support/synthetic-executor.js';
import { closeServer } from './support/close-server.js';
import { createServer } from '../packages/control-plane/src/server.js';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const SKIP =
  STORAGE_SKIP !== false
    ? STORAGE_SKIP
    : RUNTIME_ROLE_MODE
      ? false
      : 'runs in the runtime-role tier (npm run test:storage:runtime-role): the journal accepts only br_app_runtime';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADJUDICATION_TOKEN = 'phase4-harness-adjudication-token-long-enough';
/** The driver's credential: rounds and the journal, never the plan decision. */
const COUNTED_RUN_TOKEN = 'phase4-harness-counted-run-token-long-enough';
const DEPLOYMENT = 'test-deployment-0001';
const SET_ID = 'FOUNDER-ACT-EXAMPLE-PHASE4-COUNTED-RUNS';
const PLANNER = { provider: 'google', model: 'gemini-4-argon' };
const PLANNER_ROUTE = { provider: PLANNER.provider, model: PLANNER.model, executionSurface: 'antigravity' };
const TIMINGS = { answerTimeoutMs: 2_000, planTimeoutMs: 5_000, statusIntervalMs: 20 };

let harness: GatewayHarness | undefined;
let node: SessionNode | undefined;
let surface: { url: string; close: () => Promise<void> } | undefined;
let gateway: EnrolledGateway | undefined;
let recordsRoot: string | undefined;
let stopDriving: (() => Promise<void>) | undefined;
const executor = new SyntheticExecutor();

before(async () => {
  if (SKIP !== false) return;
  harness = await createGatewayHarness('phase4_harness');
  node = await makeSessionNode(harness, { configOverrides: { phase3AdjudicationToken: ADJUDICATION_TOKEN } });
  await promoteNode(node);
  surface = await startNodeServer(harness, node);
  gateway = await enrollGateway(node);
  recordsRoot = mkdtempSync(join(tmpdir(), 'buildroom-phase4-harness-'));
  // The Gateway attests and runs on the Q2a route.
  executor.reset({ attest: { surface: 'antigravity', provider: PLANNER.provider }, observed: PLANNER_ROUTE });
  const worker = new GatewayPlannerWorker({ executor, records: new PlannerRecordStore(recordsRoot) });
  // Wait for the worker's async settle write before reporting `execute` back
  // to the control plane, so the first `status` poll always sees `finished`
  // rather than racing disk persistence and triggering the 10 s production
  // status interval on `countedRunServer`.
  const settledWorker = {
    handle: async (request: Parameters<GatewayPlannerWorker['handle']>[0]) => {
      const response = await worker.handle(request);
      await worker.settled();
      return response;
    },
  };
  const lane = new PrimaryLane(new ControlPlaneClient(surface.url), createDaemonClock(), {
    gatewayId: gateway.gatewayId,
    keyId: gateway.key.keyId,
    pubkeyBase64: gateway.key.pubkeyBase64,
    privateKey: gateway.key.privateKey,
  });
  const deadline = Date.now() + 8_000;
  while (node.session.livenessFor(gateway.gatewayId) === null) {
    if (Date.now() > deadline) throw new Error('the Gateway never came online');
    await lane.step();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  // `node.clock` is a `ScriptedClock`, so its rate-limit buckets do not advance
  // on wall time: once liveness is established, exchange planner questions only
  // when the channel holds one, rather than exhausting the 60-request window on
  // idle polls.
  let running = true;
  const loop = (async () => {
    while (running) {
      if (node!.surface.planner.openCount > 0) {
        await lane.exchangePlanner(settledWorker, 1);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  })();
  stopDriving = async () => {
    running = false;
    await loop;
  };
});

let countedRunServer: Server | undefined;

after(async () => {
  await stopDriving?.();
  node?.clock.advance(60 * 60_000);
  if (countedRunServer !== undefined) await closeServer(countedRunServer);
  await surface?.close();
  await destroyGatewayHarness(harness);
  if (recordsRoot !== undefined) rmSync(recordsRoot, { recursive: true, force: true });
});

/* ---------------- the set, as an act would state it ---------------- */

function runSet(): Phase4RunSet {
  const run = (label: string) => ({
    label,
    roomId: randomUUID(),
    inputs: { repository: 'example-org/example-repo', baseSha: 'c'.repeat(40), scopePaths: ['src', 'test'], goal: 'Add a health detail field to the status route.' },
  });
  return {
    setId: SET_ID,
    founderOsSha: 'a'.repeat(40),
    buildRoomSha: 'b'.repeat(40),
    controlPlaneOrigin: surface!.url,
    gatewayId: gateway!.gatewayId,
    planner: PLANNER,
    seats: { builder: 'codex', reviewer: 'grok-build' },
    founderRelay: { actualModel: 'n/a (human Founder act)', executionSurface: 'claude-code' },
    decisionTimeoutMs: 60_000,
    runs: [run('Phase4-CR1'), run('Phase4-CR2'), run('Phase4-CR3')],
  } as Phase4RunSet;
}

/* ---------------- HTTP ---------------- */

async function http(method: 'GET' | 'POST', path: string, token: string, body?: Record<string, unknown>) {
  const response = await fetch(`${surface!.url}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/* ---------------- the test's driver ---------------- */

/**
 * What a counted run needs of the deployed control plane, implemented over
 * the test assembly. `observeEntry` reports this instance truly, the
 * registry's surfaces read from the copy the counted run reads, except that
 * the test instance, which has no commit, reports the set's. `runRound` builds
 * the loop in process, which production cannot do yet (the plan's Q9).
 */
class AssemblyDriver implements Phase4RunDriver {
  constructor(private readonly set: Phase4RunSet) {}

  async observeEntry(): Promise<Phase4EntryObservation> {
    const health = await fetch(`${surface!.url}/health`);
    const registry = readFileSync(join(REPO_ROOT, 'packages', 'control-plane', 'fixtures', 'execution-surface-registry.md'), 'utf8');
    return {
      controlPlane: { status: health.status, commit: this.set.buildRoomSha, deploymentId: DEPLOYMENT },
      founderOs: { sha: this.set.founderOsSha, clean: true },
      enrolledGateways: [gateway!.gatewayId],
      gatewayOnline: node!.session.livenessFor(gateway!.gatewayId) !== null,
      executorAvailable: true,
      registeredSurfaces: registeredSurfaceIds(registry),
    };
  }

  async createRoom(roomId: string): Promise<void> {
    const created = await http('POST', '/rooms', node!.config.apiToken, { roomId });
    assert.equal(created.status, 201, JSON.stringify(created.body));
  }

  async captureScope(roomId: string, run: Phase4RunSet['runs'][number], relay: Phase4RunSet['founderRelay']): Promise<void> {
    const t1 = await http('POST', `/rooms/${roomId}/events`, node!.config.apiToken, {
      eventId: `evt_t1_${roomId.slice(0, 8)}`,
      event: 'scope.captured',
      actor: 'founder',
      attribution: { roleId: null, actorId: 'founder', ...relay },
      scope: { roomId, repo: run.inputs.repository, paths: [...run.inputs.scopePaths] },
      evidence: [],
      occurredAt: new Date().toISOString(),
      facts: { repoInAllowlist: true, baseSha: run.inputs.baseSha, remoteHeadSha: run.inputs.baseSha },
      goal: run.inputs.goal,
    });
    assert.equal(t1.status, 201, JSON.stringify(t1.body));
  }

  async runRound(roomId: string): Promise<{ kind: string }> {
    const outcome = await new PlannerLoop({
      ...stores(),
      planner: node!.surface.planner.port({ gatewayId: gateway!.gatewayId, role: 'architect', intended: PLANNER_ROUTE, timings: TIMINGS }),
      route: {
        actorId: 'session:test/phase4-harness-planner',
        authorizationRef: this.set.setId,
        intendedProvider: PLANNER.provider,
        intendedModel: PLANNER.model,
        intendedSurface: 'antigravity',
        laneLabel: 'primary',
      },
      dispatcher: {
        roleId: PHASE4_DISPATCHER.roleId,
        actorId: `${PHASE4_DISPATCHER.actorIdPrefix}${DEPLOYMENT}`,
        actualModel: PHASE4_DISPATCHER.actualModel,
        executionSurface: PHASE4_DISPATCHER.executionSurface,
      },
      roomRoles: async () => ({
        planner: { roleId: 'architect', surface: PLANNER_ROUTE.executionSurface, model: PLANNER.model },
        builder: { roleId: 'builder', surface: this.set.seats.builder, model: null },
        reviewer: { roleId: 'independent-reviewer', surface: this.set.seats.reviewer, model: null },
      }),
      authorizeRoute: async () => 'covers',
    }).runRound(roomId);
    return { kind: outcome.kind };
  }

  async roomState(roomId: string): Promise<string> {
    const view = await http('GET', `/rooms/${roomId}`, node!.config.apiToken);
    return (view.body['snapshot'] as { state: string }).state;
  }

  async collectRecord(roomId: string, deploymentIdAtStart: string): Promise<Phase4RunRecord> {
    const exported = await http('GET', `/rooms/${roomId}/export`, node!.config.apiToken);
    const reading = readPhase4Export(exported.body, roomId);
    const { journal } = stores();
    const commands: Phase4RecordedCommand[] = [];
    const decisions: Phase4RunRecord['decisions'][number][] = [];
    for (const opening of reading.events.filter((e) => e.event === 'task.dispatched.planner' || e.event === 'plan.revision_requested')) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const commandId = plannerCommandIdFor(roomId, opening.eventId, attempt);
        const history = await journal.commandHistory(commandId);
        if (history.entries.length === 0) break;
        const rows = history.entries.flatMap((e) => (e.decoded.recordClass === 'command' ? [e.decoded.row] : []));
        commands.push({ commandId, rows });
        for (const e of history.entries) {
          if (e.decoded.recordClass === 'decision') {
            decisions.push({ commandId, decision: e.decoded.row.decision, ...(e.decoded.row.planHash === undefined ? {} : { planHash: e.decoded.row.planHash }) });
          }
        }
      }
    }
    return {
      roomId,
      deploymentIdAtStart,
      deploymentIdAtEnd: DEPLOYMENT,
      finalState: reading.finalState,
      events: reading.events,
      commands,
      decisions,
      journalVerified: (await journal.verify()).ok,
    };
  }
}

function stores() {
  const pool = harness!.appPool;
  return {
    ledger: new PostgresLedgerStore(pool, node!.surface.roomAppendFence),
    journal: new JournalStore(pool, { resolveCompletionAuthorization: async () => 'covers' }),
    plans: new PlanStore(pool),
  };
}

function describeAttempt(result: Phase4AttemptResult): string {
  return JSON.stringify({
    label: result.label,
    roomId: result.roomId,
    outcome: result.outcome,
    entry: result.entryFailures,
    failures: result.failures,
    finalState: result.record?.finalState ?? null,
  });
}

/**
 * The Founder, in the test: watches the run's room and decides at the
 * plan-decision route while `drive` runs. Stops as soon as `drive` settles so
 * a refused or early-stopped run reaches its assertion immediately instead of
 * waiting on the Founder's deadline.
 */
async function driveWithFounder<T>(
  roomId: string,
  script: ('revise' | 'approve' | 'cancel')[],
  drive: () => Promise<T>,
): Promise<T> {
  let active = true;
  const remaining = [...script];
  const deciding = (async () => {
    const deadline = Date.now() + 10_000;
    let reviewed: string | null = null;
    let lastState: string | null = null;
    while (active && remaining.length > 0) {
      if (Date.now() > deadline) {
        throw new Error(
          `the scripted Founder timed out waiting for PLAN_REVIEW in room ${roomId} (last state: ${lastState ?? 'unobserved'}, remaining: ${remaining.join(',')})`,
        );
      }
      const view = await http('GET', `/rooms/${roomId}`, node!.config.apiToken).catch(() => null);
      const state = view?.status === 200 ? (view.body['snapshot'] as { state: string }).state : null;
      lastState = state;
      if (state === 'PLAN_REVIEW') {
        const exported = await http('GET', `/rooms/${roomId}/export`, node!.config.apiToken);
        const planHash = readPhase4Export(exported.body, roomId).events.filter((e) => e.event === 'plan.submitted').at(-1)?.planHash ?? null;
        if (planHash !== null && planHash !== reviewed) {
          reviewed = planHash;
          const next = remaining.shift()!;
          const body =
            next === 'approve'
              ? { decision: 'plan.approved', planHash }
              : next === 'revise'
                ? { decision: 'plan.revision_requested', planHash, feedback: 'Narrow it to one field.' }
                : { decision: 'founder.cancel', planHash };
          const decided = await http('POST', `/control-plane/rooms/${roomId}/plan-decision`, ADJUDICATION_TOKEN, {
            ...body,
            attribution: { actualModel: 'n/a (human Founder decision)', executionSurface: 'claude-code' },
          });
          assert.equal(decided.status, 201, `plan-decision answered ${decided.status}: ${JSON.stringify(decided.body)}`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  })();
  try {
    return await Promise.race([
      drive(),
      deciding.then(() => new Promise<never>(() => {})),
    ]);
  } finally {
    active = false;
    await deciding.catch(() => {});
  }
}

const runner = (set: Phase4RunSet) =>
  new Phase4Runner(new AssemblyDriver(set), { pollMs: 20, entry: { namedGatewayPrefix: gateway!.gatewayId.slice(0, 8) } });

/* ---------------- cases ---------------- */

describe('phase 4 run harness · the runner over the real assembly', { skip: SKIP }, () => {
  const set = (): Phase4RunSet => shared!;
  let shared: Phase4RunSet | undefined;
  const attempts: Phase4AttemptSummary[] = [];

  it('passes a run the Founder approves, judging what was persisted, with the Q7b attribution on T2', async () => {
    shared = runSet();
    const result = await driveWithFounder(set().runs[0]!.roomId, ['approve'], () => runner(set()).runNext(set(), attempts));
    assert.equal(result.outcome, 'passed', describeAttempt(result));
    attempts.push(result);
    const t2 = result.record!.events.find((e) => e.event === 'task.dispatched.planner')!;
    assert.deepEqual(t2.attribution, {
      roleId: 'builder',
      actorId: `control-plane:${DEPLOYMENT}`,
      actualModel: 'n/a (deterministic control-plane act)',
      executionSurface: 'build-room-control-plane',
    });
    assert.equal(result.record!.commands.length, 1);
    assert.deepEqual(result.record!.decisions.map((d) => d.decision), ['plan.approved']);
    assert.equal(result.record!.finalState, 'BUILDING');
  });

  it('passes a run the Founder revises and then approves, in two rounds', async () => {
    const result = await driveWithFounder(set().runs[1]!.roomId, ['revise', 'approve'], () => runner(set()).runNext(set(), attempts));
    assert.equal(result.outcome, 'passed', describeAttempt(result));
    attempts.push(result);
    assert.equal(result.record!.commands.length, 2);
    assert.deepEqual(result.record!.decisions.map((d) => d.decision), ['plan.revision_requested', 'plan.approved']);
    assert.deepEqual(phase4SetStatus(attempts), { consecutivePasses: 2, nextLabel: 'Phase4-CR3', spent: false, satisfied: false });
  });

  it('rejects a run the Founder cancels, and the set is spent', async () => {
    const result = await driveWithFounder(set().runs[2]!.roomId, ['cancel'], () => runner(set()).runNext(set(), attempts));
    assert.deepEqual([result.outcome, result.failures], ['rejected', []], describeAttempt(result));
    assert.equal(result.record!.finalState, 'CLOSED_ABANDONED');
    attempts.push(result);
    assert.deepEqual(phase4SetStatus(attempts), { consecutivePasses: 0, nextLabel: null, spent: true, satisfied: false });
  });
});

describe('phase 4 run harness · a run over the Q9 routes, as a counted run would make it', { skip: SKIP }, () => {
  let set: Phase4RunSet;
  let origin: string;

  before(async () => {
    if (SKIP !== false) return;
    set = runSet();
    // The control plane as an act would configure it (run-unit Q9): the same
    // node and Gateway surface, served with the act's terms and a deployment
    // id, reading the pinned registry copy as production would.
    const app = createServer({
      config: {
        ...node!.config,
        deploymentId: DEPLOYMENT,
        countedRunToken: COUNTED_RUN_TOKEN,
        // The act's terms as the control plane parses them: surfaces only,
        // with the planner's provider and model resolved from the approved
        // Antigravity lane as routing detail (BR-PHASE4-SURFACE-KEYED-SEATS-R1),
        // and each seat's surface with its resolved lane's provider.
        countedRun: {
          actId: set.setId,
          gatewayId: set.gatewayId,
          planner: { surface: 'antigravity', provider: PLANNER.provider, model: PLANNER.model },
          seats: { builder: { surface: set.seats.builder, provider: 'openai' }, reviewer: { surface: set.seats.reviewer, provider: 'xai' } },
        },
      },
      pool: harness!.appPool,
      store: new PostgresLedgerStore(harness!.appPool, node!.surface.roomAppendFence),
      startedAt: Date.now(),
      gateway: node!.surface,
    });
    countedRunServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => countedRunServer!.once('listening', () => resolve()));
    origin = `http://127.0.0.1:${(countedRunServer.address() as AddressInfo).port}`;
  });

  it('passes a run driven only through HTTP: the routes start the round and read the journal; the Founder decides at the plan-decision route', async () => {
    const driver = new HttpPhase4Driver({
      origin,
      apiToken: node!.config.apiToken,
      countedRunToken: COUNTED_RUN_TOKEN,
      founderOs: { sha: set.founderOsSha, clean: true },
      executorAvailable: true,
      observeRemoteHead: async () => set.runs[0]!.inputs.baseSha,
      roundTimeoutMs: 5_000,
      pollMs: 20,
    });
    const result = await driveWithFounder(set.runs[0]!.roomId, ['approve'], () =>
      new Phase4Runner(driver, { pollMs: 20, entry: { namedGatewayPrefix: gateway!.gatewayId.slice(0, 8) } }).runNext(
        // The commit this test instance reports on /version, as an act would name the deployed one;
        // and the origin the run actually drives, as the act must name (the driver is bound to it).
        { ...set, buildRoomSha: node!.config.commitSha, controlPlaneOrigin: origin },
        [],
      ),
    );
    assert.equal(result.outcome, 'passed', describeAttempt(result));
    const record = result.record!;
    const t2 = record.events.find((e) => e.event === 'task.dispatched.planner')!;
    assert.deepEqual(t2.attribution, {
      roleId: 'builder',
      actorId: `control-plane:${DEPLOYMENT}`,
      actualModel: 'n/a (deterministic control-plane act)',
      executionSurface: 'build-room-control-plane',
    });
    const journaled = record.commands[0]!.rows.find((r) => r.eventType === 'journaled')!;
    assert.deepEqual([journaled.authorizationRef, journaled.intendedModel, journaled.intendedSurface], [set.setId, 'gemini-4-argon', 'antigravity']);
    assert.deepEqual(record.commands[0]!.rows.map((r) => r.eventType), ['journaled', 'identity_bound', 'dispatched', 'completed']);
    assert.equal(record.journalVerified, true);
    assert.equal(record.deploymentIdAtEnd, DEPLOYMENT);
  });

  it('names the refusal when entry observation, scope capture, a Q9 route, or the record judgment refuses a run', async () => {
    const fresh = runSet();
    const act = { ...fresh, buildRoomSha: node!.config.commitSha, controlPlaneOrigin: origin };
    const makeDriver = (overrides: Partial<ConstructorParameters<typeof HttpPhase4Driver>[0]> = {}) =>
      new HttpPhase4Driver({
        origin,
        apiToken: node!.config.apiToken,
        countedRunToken: COUNTED_RUN_TOKEN,
        founderOs: { sha: act.founderOsSha, clean: true },
        executorAvailable: true,
        observeRemoteHead: async () => act.runs[0]!.inputs.baseSha,
        roundTimeoutMs: 5_000,
        pollMs: 20,
        ...overrides,
      });
    const makeRunner = (driver: HttpPhase4Driver) =>
      new Phase4Runner(driver, { pollMs: 20, entry: { namedGatewayPrefix: gateway!.gatewayId.slice(0, 8) } });

    // 1. Entry observation refusal: returns immediately with the named entry failure, without waiting on the Founder.
    const entryRefused = await driveWithFounder(act.runs[0]!.roomId, ['approve'], () =>
      makeRunner(makeDriver()).runNext({ ...act, buildRoomSha: 'd'.repeat(40) }, []),
    );
    assert.equal(entryRefused.outcome, 'not_started', describeAttempt(entryRefused));
    assert.deepEqual(entryRefused.entryFailures, ['build_sha_mismatch']);

    // 2. Scope capture refusal: remote-head mismatch and route rejection name the refusal.
    await assert.rejects(
      driveWithFounder(act.runs[0]!.roomId, ['approve'], () =>
        makeRunner(makeDriver({ observeRemoteHead: async () => 'e'.repeat(40) })).runNext(act, []),
      ),
      (err: unknown) => err instanceof Phase4DriverError && /remote head e{40} does not match/.test(err.message),
    );
    await assert.rejects(
      makeDriver().captureScope(act.runs[1]!.roomId, act.runs[1]!, act.founderRelay),
      (err: unknown) => err instanceof Phase4DriverError && /scope capture answered 404: not_found/.test(err.message),
    );

    // 3. Q9 route refusal: bad counted-run token (401) and unplannable room (settled `refused`) name the refusal.
    await assert.rejects(
      makeDriver({ countedRunToken: 'wrong-counted-run-token' }).runRound(act.runs[1]!.roomId),
      (err: unknown) => err instanceof Phase4DriverError && /planner-round start answered 401: unauthorized/.test(err.message),
    );
    await assert.rejects(
      makeDriver().runRound(act.runs[1]!.roomId),
      (err: unknown) => err instanceof Phase4DriverError && /planner-round refused: not_plannable/.test(err.message),
    );

    // 4. Strict record judgment refusal: an observed route off the act's model fails completion and names the record failures.
    executor.reset({
      attest: { surface: 'antigravity', provider: PLANNER.provider },
      observed: { ...PLANNER_ROUTE, model: 'gemini-3.6-flash' },
    });
    try {
      const judged = await driveWithFounder(act.runs[2]!.roomId, ['approve'], () =>
        makeRunner(makeDriver()).runNext(act, [
          { label: 'Phase4-CR1', outcome: 'passed' },
          { label: 'Phase4-CR2', outcome: 'passed' },
        ]),
      );
      assert.equal(judged.outcome, 'interrupted', describeAttempt(judged));
      assert.deepEqual(judged.failures, ['lifecycle_incomplete', 'command_route_wrong', 'command_not_clean']);
    } finally {
      executor.reset({ attest: { surface: 'antigravity', provider: PLANNER.provider }, observed: PLANNER_ROUTE });
    }
  });
});
