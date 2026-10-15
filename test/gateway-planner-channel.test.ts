/**
 * The planner pull channel without a network (plan r1 Q2b): the control
 * plane's mailbox and the `PlannerPort` it backs, against the Gateway's
 * worker and its durable records, joined by an in-process pump that does
 * what a signed poll and report do — collect, answer, settle.
 *
 * What is proven:
 *   - a whole round over the channel: attest, execute, status until the plan
 *     is finished;
 *   - `dispatch` answers `not_sent` only on affirmative evidence: the
 *     Gateway said so, or the request was withdrawn before any poll carried
 *     it; a delivered, unanswered `execute` throws (the loop's `unresolved`);
 *   - a request is visible only to the Gateway it is addressed to, and an
 *     answer settles it only if it was delivered and answers its kind;
 *   - the worker executes a command at most once: a repeated `execute`, and
 *     a repeated `attest`, are answered from the record;
 *   - the worker answers nothing it cannot know: a start that threw, and an
 *     execution a previous process held (`lost` at boot);
 *   - an oversized plan is recorded as a failed run, never truncated.
 */

import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GatewayPlannerChannel,
  PlannerChannelUnansweredError,
  createSystemClock,
} from '../packages/control-plane/src/gateway/index.js';
import { GatewayPlannerWorker, PlannerRecordStore } from '../packages/gateway-daemon/src/index.js';
import type { PlannerPort, PlannerWork } from '../packages/control-plane/src/planner-loop.js';
import { SYNTHETIC_ROUTE } from './support/synthetic-planner.js';
import { SyntheticExecutor } from './support/synthetic-executor.js';
import { uuid } from './gateway-helpers.js';

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function recordsDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-planner-'));
  roots.push(root);
  return root;
}

const TIMINGS = { answerTimeoutMs: 200, planTimeoutMs: 2_000, statusIntervalMs: 10 };

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

/** One poll and report: collect a request for the Gateway, answer it, settle it. */
async function exchange(channel: GatewayPlannerChannel, gatewayId: string, worker: GatewayPlannerWorker): Promise<boolean> {
  const request = channel.collect(gatewayId);
  if (request === null) return false;
  const payload = await worker.handle(request);
  if (payload !== null) channel.answer(gatewayId, request.requestId, payload);
  return true;
}

/** Pump on a short cadence until stopped, as the daemon's tick does. */
function pump(channel: GatewayPlannerChannel, gatewayId: string, worker: GatewayPlannerWorker): () => void {
  let running = true;
  void (async () => {
    while (running) {
      await exchange(channel, gatewayId, worker);
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  })();
  return () => {
    running = false;
  };
}

let channel: GatewayPlannerChannel;
let executor: SyntheticExecutor;
let records: PlannerRecordStore;
let worker: GatewayPlannerWorker;
let port: PlannerPort;
const GATEWAY = uuid();

beforeEach(() => {
  channel = new GatewayPlannerChannel(createSystemClock());
  executor = new SyntheticExecutor().reset();
  records = new PlannerRecordStore(recordsDir());
  worker = new GatewayPlannerWorker({ executor, records });
  port = channel.port({ gatewayId: GATEWAY, role: 'architect', intended: SYNTHETIC_ROUTE, timings: TIMINGS });
});

describe('gateway-planner-channel · a round over the channel', () => {
  it('attests, executes once, and returns the finished plan', async () => {
    const stop = pump(channel, GATEWAY, worker);
    try {
      const identity = await port.attest('cmd_a');
      assert.equal(identity.role, 'architect');
      assert.equal(identity.model, SYNTHETIC_ROUTE.model);
      const receipt = await port.dispatch(work('cmd_a'));
      assert.deepEqual(receipt, { kind: 'accepted', observed: SYNTHETIC_ROUTE });
      const result = await port.awaitPlan('cmd_a');
      assert.equal(result.kind, 'plan');
      assert.equal(executor.startsOf('cmd_a'), 1);
      const reconciled = await port.reconcile('cmd_a');
      assert.equal(reconciled.kind, 'finished');
      assert.equal(reconciled.kind === 'finished' && reconciled.executionId, identity.executionId);
    } finally {
      stop();
    }
    assert.equal(channel.openCount, 0);
  });

  it('waits on a running plan, asking status until it finishes', async () => {
    executor.reset({ result: 'hold' });
    const stop = pump(channel, GATEWAY, worker);
    try {
      await port.attest('cmd_hold');
      await port.dispatch(work('cmd_hold'));
      const waiting = port.awaitPlan('cmd_hold');
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal((await port.reconcile('cmd_hold')).kind, 'running');
      executor.release();
      assert.equal((await waiting).kind, 'plan');
    } finally {
      stop();
    }
  });

  it('carries a Planner-reported failure, and a rejected run, as failed', async () => {
    const stop = pump(channel, GATEWAY, worker);
    try {
      executor.reset({ result: 'failed' });
      await port.attest('cmd_f1');
      await port.dispatch(work('cmd_f1'));
      assert.deepEqual(await port.awaitPlan('cmd_f1'), { kind: 'failed' });
      executor.reset({ result: 'reject' });
      await port.attest('cmd_f2');
      await port.dispatch(work('cmd_f2'));
      assert.deepEqual(await port.awaitPlan('cmd_f2'), { kind: 'failed' });
    } finally {
      stop();
    }
  });
});

describe('gateway-planner-channel · not_sent is affirmative, never inferred', () => {
  it('answers not_sent when the Gateway says the work never left', async () => {
    executor.reset({ start: 'not_sent' });
    const stop = pump(channel, GATEWAY, worker);
    try {
      await port.attest('cmd_ns');
      assert.deepEqual(await port.dispatch(work('cmd_ns')), { kind: 'not_sent' });
      assert.equal((await port.reconcile('cmd_ns')).kind, 'never_received');
    } finally {
      stop();
    }
  });

  it('answers not_sent when the execute was withdrawn before any poll carried it', async () => {
    const stop = pump(channel, GATEWAY, worker);
    await port.attest('cmd_w');
    stop();
    // No poll runs now: the execute request times out undelivered.
    assert.deepEqual(await port.dispatch(work('cmd_w')), { kind: 'not_sent' });
    assert.equal(channel.openCount, 0);
    // Withdrawn means gone: a later poll cannot collect it.
    assert.equal(channel.collect(GATEWAY), null);
    assert.equal(executor.startsOf('cmd_w'), 0);
  });

  it('throws when the execute was delivered and never answered: contact cannot be ruled out', async () => {
    await (async () => {
      const stop = pump(channel, GATEWAY, worker);
      await port.attest('cmd_d');
      stop();
    })();
    const dispatching = port.dispatch(work('cmd_d'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Delivered to a Gateway that then goes silent.
    const request = channel.collect(GATEWAY);
    assert.equal(request?.kind, 'execute');
    await assert.rejects(dispatching, PlannerChannelUnansweredError);
  });

  it('throws on an attestation that never comes, or that failed', async () => {
    await assert.rejects(port.attest('cmd_silent'), PlannerChannelUnansweredError);
    executor.reset({ attest: 'throw' });
    const stop = pump(channel, GATEWAY, worker);
    try {
      await assert.rejects(port.attest('cmd_af'), PlannerChannelUnansweredError);
    } finally {
      stop();
    }
  });

  it('dispatches nothing for a command that was never attested', async () => {
    assert.deepEqual(await port.dispatch(work('cmd_unattested')), { kind: 'not_sent' });
    assert.equal(channel.openCount, 0);
  });
});

describe('gateway-planner-channel · addressing and settlement', () => {
  it('shows a request only to its Gateway, and settles only a delivered request with an answer of its kind', async () => {
    const asking = port.reconcile('cmd_x');
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(channel.collect(uuid()), null, 'another Gateway sees nothing');
    // Not yet delivered: an answer settles nothing.
    const peek = [...(channel as unknown as { pending: Map<string, { request: { requestId: string } }> }).pending.values()][0];
    assert.ok(peek);
    assert.equal(channel.answer(GATEWAY, peek.request.requestId, { kind: 'never_received' }), false);
    const request = channel.collect(GATEWAY);
    assert.ok(request);
    assert.equal(channel.answer(uuid(), request.requestId, { kind: 'never_received' }), false, 'wrong Gateway');
    assert.equal(channel.answer(GATEWAY, request.requestId, { kind: 'not_sent' }), false, 'not a status answer');
    assert.equal(channel.answer(GATEWAY, request.requestId, { kind: 'never_received' }), true);
    assert.equal(channel.answer(GATEWAY, request.requestId, { kind: 'never_received' }), false, 'already settled');
    assert.deepEqual(await asking, { kind: 'never_received' });
  });

  it('re-delivers an unanswered request, least recently delivered first', async () => {
    const first = port.reconcile('cmd_r1');
    const second = port.reconcile('cmd_r2');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const a = channel.collect(GATEWAY);
    const b = channel.collect(GATEWAY);
    const c = channel.collect(GATEWAY);
    assert.ok(a && b && c);
    assert.notEqual(a.requestId, b.requestId);
    assert.equal(c.requestId, a.requestId);
    channel.answer(GATEWAY, a.requestId, { kind: 'never_received' });
    channel.answer(GATEWAY, b.requestId, { kind: 'never_received' });
    await Promise.all([first, second]);
  });

  it('refuses a status that names a different execution than the one bound', async () => {
    const stop = pump(channel, GATEWAY, worker);
    try {
      await port.attest('cmd_m');
      await port.dispatch(work('cmd_m'));
    } finally {
      stop();
    }
    const waiting = port.awaitPlan('cmd_m');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const request = channel.collect(GATEWAY);
    assert.ok(request);
    channel.answer(GATEWAY, request.requestId, {
      kind: 'finished',
      executionId: 'exec-someone-else',
      observed: SYNTHETIC_ROUTE,
      result: { kind: 'failed' },
    });
    await assert.rejects(waiting, PlannerChannelUnansweredError);
  });
});

describe('gateway-planner-channel · the worker executes at most once and says only what it knows', () => {
  async function attested(commandId: string): Promise<string> {
    const answer = await worker.handle({ requestId: uuid(), kind: 'attest', commandId, role: 'architect', intended: SYNTHETIC_ROUTE });
    assert.equal(answer?.kind, 'attested');
    return answer?.kind === 'attested' ? answer.identity.executionId : '';
  }

  function executeRequest(commandId: string, executionId: string): Record<string, unknown> {
    return { requestId: uuid(), kind: 'execute', commandId, executionId, work: work(commandId) };
  }

  it('re-answers a repeated attest with the identity already bound', async () => {
    const first = await attested('cmd_1');
    const second = await attested('cmd_1');
    assert.equal(first, second);
    assert.equal(executor.calls.attest.length, 1);
  });

  it('starts a command once, and answers every later execute from the record', async () => {
    const executionId = await attested('cmd_once');
    assert.equal((await worker.handle(executeRequest('cmd_once', executionId)))?.kind, 'accepted');
    assert.equal((await worker.handle(executeRequest('cmd_once', executionId)))?.kind, 'accepted');
    await worker.settled();
    assert.equal((await worker.handle(executeRequest('cmd_once', executionId)))?.kind, 'accepted');
    assert.equal(executor.startsOf('cmd_once'), 1);
  });

  it('starts nothing for an unattested command or a different execution', async () => {
    assert.deepEqual(await worker.handle(executeRequest('cmd_none', 'exec-x')), { kind: 'not_sent' });
    const executionId = await attested('cmd_other');
    assert.deepEqual(await worker.handle(executeRequest('cmd_other', `${executionId}-not`)), { kind: 'not_sent' });
    assert.equal(executor.calls.start.length, 0);
  });

  it('answers nothing after a start that threw, and never starts it again', async () => {
    executor.reset({ start: 'throw' });
    const executionId = await attested('cmd_throw');
    assert.equal(await worker.handle(executeRequest('cmd_throw', executionId)), null);
    assert.equal(await worker.handle({ requestId: uuid(), kind: 'status', commandId: 'cmd_throw' }), null);
    executor.reset();
    assert.equal(await worker.handle(executeRequest('cmd_throw', executionId)), null);
    assert.equal(executor.startsOf('cmd_throw'), 0, 'the reset cleared the first call; no second start happened');
  });

  it('marks an execution a previous process held as lost at boot, and answers nothing for it', async () => {
    executor.reset({ result: 'hold' });
    const executionId = await attested('cmd_lost');
    assert.equal((await worker.handle(executeRequest('cmd_lost', executionId)))?.kind, 'accepted');
    assert.equal((await worker.handle({ requestId: uuid(), kind: 'status', commandId: 'cmd_lost' }))?.kind, 'running');

    // A new process over the same records.
    const restarted = new GatewayPlannerWorker({ executor: new SyntheticExecutor(), records });
    await restarted.boot();
    assert.equal((await records.read('cmd_lost'))?.phase, 'lost');
    assert.equal(await restarted.handle({ requestId: uuid(), kind: 'status', commandId: 'cmd_lost' }), null);
    assert.equal(await restarted.handle(executeRequest('cmd_lost', executionId)), null);
  });

  it('answers never_received for no record, an attestation only, and a not_sent start', async () => {
    const status = (commandId: string) => worker.handle({ requestId: uuid(), kind: 'status', commandId });
    assert.deepEqual(await status('cmd_unknown'), { kind: 'never_received' });
    await attested('cmd_attested_only');
    assert.deepEqual(await status('cmd_attested_only'), { kind: 'never_received' });
    executor.reset({ start: 'not_sent' });
    const executionId = await attested('cmd_ns');
    assert.deepEqual(await worker.handle(executeRequest('cmd_ns', executionId)), { kind: 'not_sent' });
    assert.deepEqual(await status('cmd_ns'), { kind: 'never_received' });
  });

  it('records an oversized plan as a failed run, never a truncated one', async () => {
    executor.reset({ result: 'oversized' });
    const executionId = await attested('cmd_big');
    await worker.handle(executeRequest('cmd_big', executionId));
    await worker.settled();
    const answer = await worker.handle({ requestId: uuid(), kind: 'status', commandId: 'cmd_big' });
    assert.equal(answer?.kind, 'finished');
    assert.deepEqual(answer?.kind === 'finished' && answer.result, { kind: 'failed' });
  });

  it('sends no report the control plane would refuse: an over-long observed route goes unanswered', async () => {
    executor.reset({ observed: { ...SYNTHETIC_ROUTE, model: 'm'.repeat(300) } });
    const executionId = await attested('cmd_long_route');
    // The run started, so the record says so; but the report would halt the lane, so none is sent.
    assert.equal(await worker.handle(executeRequest('cmd_long_route', executionId)), null);
    assert.equal(executor.startsOf('cmd_long_route'), 1);
    assert.equal(await worker.handle({ requestId: uuid(), kind: 'status', commandId: 'cmd_long_route' }), null);
  });

  it('answers nothing to a request that does not validate', async () => {
    assert.equal(await worker.handle({ kind: 'status', commandId: 'cmd_1' }), null);
    assert.equal(await worker.handle(null), null);
  });
});
