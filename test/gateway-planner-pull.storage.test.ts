/**
 * The planner pull channel end to end (plan r1 Q2b): a real control plane
 * over a real socket, the daemon's real `PrimaryLane` and planner worker, and
 * the loop's `PlannerPort` from the gateway surface's own mailbox.
 *
 * What is proven:
 *   - a whole planner round crosses the channel: the PC only calls out, its
 *     poll collects each question and its report answers it, and the work is
 *     started once;
 *   - poll and report are session-bound: they take the heartbeat's next
 *     sequence numbers, refuse a stale sequence and a foreign epoch, and
 *     never make a Gateway online (only an accepted heartbeat does);
 *   - a report is believed only over its exact signed bytes: a payload
 *     changed after signing is refused for its digest, a report signed by
 *     another key is refused for its signature, and a payload outside the
 *     closed shapes is refused, each settling nothing;
 *   - a well-formed report for no open request is accepted as traffic and
 *     answered `accepted: false`;
 *   - a question is visible only to the Gateway it is addressed to.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ControlPlaneClient,
  GatewayPlannerWorker,
  PlannerRecordStore,
  PrimaryLane,
  buildPlannerPoll,
  buildPlannerReport,
  createDaemonClock,
  type GatewayIdentity,
} from '../packages/gateway-daemon/src/index.js';
import type { PlannerWork } from '../packages/control-plane/src/planner-loop.js';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import {
  availabilityRows,
  enrollGateway,
  makeSessionNode,
  openSession,
  promoteNode,
  startNodeServer,
  type EnrolledGateway,
  type SessionNode,
} from './gateway-session-helpers.js';
import { SYNTHETIC_ROUTE } from './support/synthetic-planner.js';
import { SyntheticExecutor } from './support/synthetic-executor.js';
import { generateTestKeypair, uuid } from './gateway-helpers.js';

let harness: GatewayHarness | undefined;
let node: SessionNode | undefined;
let surface: { url: string; close: () => Promise<void> } | undefined;
let root: string | undefined;
/*
 * Two Gateways, enrolled once and shared: the registry's ratified cap is two
 * (`DEC-20260818-01` clause 5). Each case opens its own session.
 */
let gatewayA: EnrolledGateway | undefined;
let gatewayB: EnrolledGateway | undefined;

before(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('planner_pull');
  node = await makeSessionNode(harness);
  await promoteNode(node);
  surface = await startNodeServer(harness, node);
  root = mkdtempSync(join(tmpdir(), 'buildroom-planner-pull-'));
  gatewayA = await enrollGateway(node);
  gatewayB = await enrollGateway(node);
});

after(async () => {
  await surface?.close();
  await destroyGatewayHarness(harness);
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

const TIMINGS = { answerTimeoutMs: 3_000, planTimeoutMs: 10_000, statusIntervalMs: 20 };

function identityOf(gateway: EnrolledGateway): GatewayIdentity {
  return {
    gatewayId: gateway.gatewayId,
    keyId: gateway.key.keyId,
    pubkeyBase64: gateway.key.pubkeyBase64,
    privateKey: gateway.key.privateKey,
  };
}

function work(commandId: string): PlannerWork {
  return {
    commandId,
    roomId: uuid(),
    repository: 'example-org/example-repo',
    baseSha: 'a'.repeat(40),
    scopePaths: ['src', 'test'],
    goalEventId: 'evt_goal',
    goal: 'Add a health detail field.',
    goalDigest: 'b'.repeat(64),
  };
}

async function post(path: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${surface!.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** Drive the daemon's lane on a short cadence, as its tick does: heartbeat, then planner exchanges. */
function drive(lane: PrimaryLane, worker: GatewayPlannerWorker): () => Promise<void> {
  let running = true;
  const loop = (async () => {
    while (running) {
      await lane.step();
      await lane.exchangePlanner(worker);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  })();
  return async () => {
    running = false;
    await loop;
  };
}

describe('gateway-planner-pull · a planner round over the signed channel', { skip: STORAGE_SKIP }, () => {
  it('collects each question on a poll, answers it on a report, and starts the work once', async () => {
    const gateway = gatewayA!;
    const executor = new SyntheticExecutor().reset();
    const worker = new GatewayPlannerWorker({ executor, records: new PlannerRecordStore(join(root!, 'round')) });
    const lane = new PrimaryLane(new ControlPlaneClient(surface!.url), createDaemonClock(), identityOf(gateway));
    const port = node!.surface.planner.port({
      gatewayId: gateway.gatewayId,
      role: 'architect',
      intended: SYNTHETIC_ROUTE,
      timings: TIMINGS,
    });

    const stop = drive(lane, worker);
    try {
      const identity = await port.attest('cmd_pull_round');
      assert.equal(identity.model, SYNTHETIC_ROUTE.model);
      assert.deepEqual(await port.dispatch(work('cmd_pull_round')), { kind: 'accepted', observed: SYNTHETIC_ROUTE });
      const result = await port.awaitPlan('cmd_pull_round');
      assert.equal(result.kind, 'plan');
      const reconciled = await port.reconcile('cmd_pull_round');
      assert.equal(reconciled.kind === 'finished' && reconciled.executionId, identity.executionId);
    } finally {
      await stop();
    }
    assert.equal(executor.startsOf('cmd_pull_round'), 1);
    assert.equal(lane.laneState, 'HEARTBEATING');
    // The poll and report took sequence numbers on the session's one counter.
    const cursor = node!.session.cursorFor(gateway.gatewayId);
    assert.equal(cursor?.lastSequence, lane.lastSequence);
    assert.ok(lane.lastSequence > 4, 'heartbeats and planner traffic share the counter');
  });
});

describe('gateway-planner-pull · session-bound like a heartbeat', { skip: STORAGE_SKIP }, () => {
  it('refuses a stale sequence and a foreign epoch, and a poll never makes the Gateway online', async () => {
    // B has never heartbeated: nothing but a poll could make it online here.
    const gateway = gatewayB!;
    const id = identityOf(gateway);
    const epoch = await openSession(node!, gateway);

    const first = await post('/gateway/planner/poll', buildPlannerPoll(id, epoch, 1, node!.clock));
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body['request'], null);
    const replay = await post('/gateway/planner/poll', buildPlannerPoll(id, epoch, 1, node!.clock));
    assert.deepEqual([replay.status, replay.body['error']], [409, 'stale_sequence']);
    const foreign = await post('/gateway/planner/poll', buildPlannerPoll(id, 'f'.repeat(64), 2, node!.clock));
    assert.deepEqual([foreign.status, foreign.body['error']], [409, 'session_required']);

    assert.equal(node!.session.livenessFor(gateway.gatewayId), null, 'no liveness from a poll');
    assert.deepEqual(await availabilityRows(node!.pool, gateway.gatewayId), [], 'no went_online from a poll');
  });
});

describe('gateway-planner-pull · a report is believed only over its signed bytes', { skip: STORAGE_SKIP }, () => {
  it('refuses a changed payload, another key, and an unknown shape; settles nothing; accepts a stray report as traffic', async () => {
    const gateway = gatewayA!;
    const id = identityOf(gateway);
    const epoch = await openSession(node!, gateway);
    const port = node!.surface.planner.port({
      gatewayId: gateway.gatewayId,
      role: 'architect',
      intended: SYNTHETIC_ROUTE,
      timings: { ...TIMINGS, answerTimeoutMs: 2_000 },
    });

    const asking = port.reconcile('cmd_signed_bytes');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const polled = await post('/gateway/planner/poll', buildPlannerPoll(id, epoch, 1, node!.clock));
    const request = polled.body['request'] as { requestId: string; kind: string } | null;
    assert.equal(request?.kind, 'status');
    const requestId = request!.requestId;

    // Signed over one payload, carrying another.
    const signed = buildPlannerReport(id, epoch, 2, requestId, JSON.stringify({ kind: 'never_received' }), node!.clock);
    const swapped = await post('/gateway/planner/report', {
      ...signed,
      payload: JSON.stringify({ kind: 'finished', executionId: 'x', observed: SYNTHETIC_ROUTE, result: { kind: 'failed' } }),
    });
    assert.deepEqual([swapped.status, swapped.body['error']], [400, 'invalid_request']);

    // Signed by a key the registry does not hold for this Gateway.
    const stranger = generateTestKeypair();
    const forged = buildPlannerReport(
      { ...id, privateKey: stranger.privateKey },
      epoch,
      2,
      requestId,
      JSON.stringify({ kind: 'never_received' }),
      node!.clock,
    );
    const forgedResult = await post('/gateway/planner/report', forged);
    assert.deepEqual([forgedResult.status, forgedResult.body['error']], [401, 'bad_signature']);

    // Validly signed, outside the closed shapes.
    const odd = await post(
      '/gateway/planner/report',
      buildPlannerReport(id, epoch, 2, requestId, JSON.stringify({ kind: 'never_received', note: 'x' }), node!.clock),
    );
    assert.deepEqual([odd.status, odd.body['error']], [400, 'invalid_request']);

    // A report for no open request is traffic, not an answer.
    const stray = await post(
      '/gateway/planner/report',
      buildPlannerReport(id, epoch, 2, uuid(), JSON.stringify({ kind: 'never_received' }), node!.clock),
    );
    assert.equal(stray.status, 200, JSON.stringify(stray.body));
    assert.equal(stray.body['accepted'], false);

    // None of the refusals settled the question; the honest answer does.
    const honest = await post(
      '/gateway/planner/report',
      buildPlannerReport(id, epoch, 3, requestId, JSON.stringify({ kind: 'never_received' }), node!.clock),
    );
    assert.equal(honest.body['accepted'], true);
    assert.deepEqual(await asking, { kind: 'never_received' });
  });

  it('shows a question only to the Gateway it is addressed to', async () => {
    const addressed = gatewayA!;
    const other = gatewayB!;
    const otherEpoch = await openSession(node!, other);
    const port = node!.surface.planner.port({
      gatewayId: addressed.gatewayId,
      role: 'architect',
      intended: SYNTHETIC_ROUTE,
      timings: { ...TIMINGS, answerTimeoutMs: 300 },
    });

    const asking = port.reconcile('cmd_addressed');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const polled = await post('/gateway/planner/poll', buildPlannerPoll(identityOf(other), otherEpoch, 1, node!.clock));
    assert.equal(polled.status, 200);
    assert.equal(polled.body['request'], null);
    await assert.rejects(asking);
  });
});
