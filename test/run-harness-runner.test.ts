/**
 * Phase 2 — the run cycle itself.
 *
 * These drive `performRun` against a scripted control plane, so each of the
 * Founder's three conditions can be failed on purpose and the resulting
 * verdict checked. The point is not that the happy path works; it is that each
 * failure mode is *detected* rather than passed over:
 *
 * - a service that answers once and then stops answering
 * - a restart that never actually restarted anything
 * - a database that lost the write across the restart
 *
 * Each of those would leave a run looking complete. The conditions are what
 * make them fail.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ExternalPlatform,
  performRun,
  type ConditionRecord,
  type Probe,
  type RunnerConfig,
  type RunnerDeps,
} from '../packages/run-harness/src/index.js';
import type { ControlPlaneClient } from '../packages/run-harness/src/client.js';

const CONFIG: RunnerConfig = {
  baseUrl: 'http://fake',
  // Zero-length windows keep the suite fast: the dwell loop takes one sample
  // and the restart wait makes one probe. The logic under test is the same.
  dwellMs: 0,
  sampleIntervalMs: 0,
  restartTimeoutMs: 0,
  deployTimeoutMs: 0,
  requestTimeoutMs: 1_000,
};

const ok = (body: unknown): Probe => ({ ok: true, status: 200, body, latencyMs: 1 });
const bad = (status: number, body: unknown): Probe => ({ ok: false, status, body, latencyMs: 1 });

interface Script {
  /** Called per /health probe, 1-indexed, so a service can fail partway. */
  health?: (call: number) => Probe;
  /** Called per /version probe, 1-indexed. */
  startedAt?: (call: number) => string;
  ready?: Probe;
  createRoom?: Probe;
  append?: Probe;
  /** Room state before and after the restart; differing values model data loss. */
  roomBefore?: { logLength: number; entryCount: number; snapshot: unknown };
  roomAfter?: { logLength: number; entryCount: number; snapshot: unknown };
}

function fakeClient(script: Script): { client: ControlPlaneClient; restarted: () => void } {
  let healthCalls = 0;
  let versionCalls = 0;
  let afterRestart = false;

  const roomBefore = script.roomBefore ?? { logLength: 1, entryCount: 1, snapshot: { state: 'SCOPED' } };
  const roomAfter = script.roomAfter ?? roomBefore;

  const client = {
    health: async () => {
      healthCalls += 1;
      return script.health?.(healthCalls) ?? ok({ status: 'ok' });
    },
    ready: async () => script.ready ?? ok({ status: 'ready' }),
    version: async () => {
      versionCalls += 1;
      const startedAt = script.startedAt?.(versionCalls) ?? (afterRestart ? 'T2' : 'T1');
      const version = { commit: 'abc1234', startedAt };
      return { ...ok(version), version };
    },
    createRoom: async () => script.createRoom ?? ok({ created: true }),
    appendEvent: async () => script.append ?? ok({ outcome: 'transition' }),
    getRoom: async () => ok(afterRestart ? roomAfter : roomBefore),
    exportRoom: async () => ok({ events: [], rejections: [] }),
  } as unknown as ControlPlaneClient;

  return {
    client,
    restarted: () => {
      afterRestart = true;
    },
  };
}

function deps(client: ControlPlaneClient, onRestart?: () => void): RunnerDeps {
  let tick = 0;
  return {
    client,
    platform: {
      kind: 'test',
      deploy: async (now) => ({
        action: 'deploy',
        actor: 'performed_externally',
        requestedAt: now(),
        detail: 'test',
      }),
      restart: async (now) => {
        onRestart?.();
        return {
          action: 'restart',
          actor: 'performed_externally',
          requestedAt: now(),
          detail: 'test',
        };
      },
    },
    now: () => {
      tick += 1;
      return `2026-08-17T12:00:${String(tick).padStart(2, '0')}.000Z`;
    },
    sleep: async () => undefined,
    newId: () => '11111111-2222-4333-8444-555555555555',
  };
}

function condition(
  conditions: readonly ConditionRecord[],
  which: ConditionRecord['condition'],
): ConditionRecord | undefined {
  return conditions.find((c) => c.condition === which);
}

describe('run cycle — the happy path', () => {
  it('records all three conditions as held', async () => {
    const fake = fakeClient({});
    const draft = await performRun(CONFIG, deps(fake.client, fake.restarted));

    assert.equal(draft.conditions.length, 3);
    assert.ok(draft.conditions.every((c) => c.held), 'every condition should hold');
    assert.equal(draft.commit, 'abc1234');
  });

  it('walks the Founder-defined cycle in order', async () => {
    const fake = fakeClient({});
    const draft = await performRun(CONFIG, deps(fake.client, fake.restarted));

    assert.deepEqual(
      draft.steps.map((step) => step.step),
      ['deploy', 'health_check', 'verify_write', 'restart', 'verify_after_restart', 'teardown'],
    );
    assert.ok(draft.steps.every((step) => step.outcome === 'passed'));
  });

  it('retains the room at teardown rather than deleting the run evidence', async () => {
    const fake = fakeClient({});
    const draft = await performRun(CONFIG, deps(fake.client, fake.restarted));
    const teardown = draft.steps.find((step) => step.step === 'teardown');

    assert.match(teardown?.detail ?? '', /retained, not deleted/);
  });
});

describe('run cycle — a service that does not stay up', () => {
  it('fails the deploy condition when health stops answering during the dwell', async () => {
    // Answers the first probe (so deploy looks fine), then stops.
    const fake = fakeClient({ health: (call) => (call === 1 ? ok({}) : bad(502, 'gone')) });
    const draft = await performRun(CONFIG, deps(fake.client, fake.restarted));

    assert.equal(condition(draft.conditions, 'deploys_and_stays_up')?.held, false);
    assert.equal(draft.conditions.length, 1, 'later conditions are not reached');
  });

  it('skips the remaining steps rather than leaving them absent', async () => {
    const fake = fakeClient({ health: (call) => (call === 1 ? ok({}) : bad(502, 'gone')) });
    const draft = await performRun(CONFIG, deps(fake.client, fake.restarted));
    const skipped = draft.steps.filter((step) => step.outcome === 'skipped').map((s) => s.step);

    assert.deepEqual(skipped, ['verify_write', 'restart', 'verify_after_restart', 'teardown']);
  });

  it('fails when the service never becomes healthy at all', async () => {
    const fake = fakeClient({ health: () => bad(0, null) });
    const draft = await performRun(CONFIG, deps(fake.client, fake.restarted));

    assert.equal(condition(draft.conditions, 'deploys_and_stays_up')?.held, false);
    assert.equal(draft.steps[0]?.outcome, 'failed');
  });
});

describe('run cycle — reads and writes', () => {
  it('fails when the ledger refuses the verification event', async () => {
    const fake = fakeClient({ append: bad(409, { code: 'guard_failed' }) });
    const draft = await performRun(CONFIG, deps(fake.client, fake.restarted));

    assert.equal(condition(draft.conditions, 'reads_and_writes')?.held, false);
    assert.equal(condition(draft.conditions, 'survives_restart'), undefined);
  });

  it('fails when the room reads back with an empty log after an accepted write', async () => {
    const fake = fakeClient({ roomBefore: { logLength: 0, entryCount: 0, snapshot: null } });
    const draft = await performRun(CONFIG, deps(fake.client, fake.restarted));

    assert.equal(condition(draft.conditions, 'reads_and_writes')?.held, false);
    assert.match(condition(draft.conditions, 'reads_and_writes')?.evidence ?? '', /empty log/);
  });
});

describe('run cycle — surviving a restart', () => {
  it('fails when no new process appears — a restart that restarted nothing', async () => {
    // startedAt never moves, so the old process is still serving.
    const fake = fakeClient({ startedAt: () => 'T1' });
    const draft = await performRun(CONFIG, deps(fake.client));

    assert.equal(condition(draft.conditions, 'survives_restart')?.held, false);
    assert.match(condition(draft.conditions, 'survives_restart')?.evidence ?? '', /no new process/);
  });

  it('fails when the ledger lost events across the restart', async () => {
    const fake = fakeClient({
      roomBefore: { logLength: 1, entryCount: 1, snapshot: { state: 'SCOPED' } },
      roomAfter: { logLength: 0, entryCount: 0, snapshot: { state: 'ROOM_CREATED' } },
    });
    const draft = await performRun(CONFIG, deps(fake.client, fake.restarted));

    assert.equal(condition(draft.conditions, 'survives_restart')?.held, false);
    assert.match(condition(draft.conditions, 'survives_restart')?.evidence ?? '', /data loss or drift/);
  });

  it('fails on a state change even when the counts match', async () => {
    // A room that kept its row count but came back in a different lifecycle
    // state has not survived intact, and the count alone would not show it.
    const fake = fakeClient({
      roomBefore: { logLength: 1, entryCount: 1, snapshot: { state: 'SCOPED' } },
      roomAfter: { logLength: 1, entryCount: 1, snapshot: { state: 'ROOM_CREATED' } },
    });
    const draft = await performRun(CONFIG, deps(fake.client, fake.restarted));

    assert.equal(condition(draft.conditions, 'survives_restart')?.held, false);
    assert.match(condition(draft.conditions, 'survives_restart')?.evidence ?? '', /state differs/);
  });
});
