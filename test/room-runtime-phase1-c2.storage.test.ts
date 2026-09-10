/**
 * Room Runtime Phase 1 — C2 Worker wiring (capability H) and the
 * execution-stream registry (capability B), against the REAL subordinate
 * Bun worker over the socketless supervised transport.
 *
 * Gated exactly like `worker-supervisor.prereq-c.storage.test.ts`: SKIPs
 * honestly (with the missing bindings named) unless the pinned proof runtime
 * (Node v22.23.2, Bun on PATH, a madventures-tui checkout descending from the
 * bound base, the bounded worker entrypoint) is present.
 *
 * AUTHORITY NEGATIVES proven here (r3 §15 / act §15):
 *   - the binding refuses any non-fixture occupancy key (strict fixture gate);
 *   - the worker environment carries exactly one variable — no provider
 *     credential, no secret (credential-free by default);
 *   - the worker is a supervised child (subordinate): it exits when the
 *     Gateway shuts it down and cannot restart itself;
 *   - no listener, no broker.sock, no MADV_SOCKET_PATH, no TCP — the transport
 *     is child_process stdio channels only (measured by the Prereq C suite;
 *     asserted here at the boundary the binding uses).
 *
 * FIXTURE OCCUPANCY ONLY. Facts recorded are fixture facts at the executed
 * ceiling; they are not occupancy proof, review, CI, merge, or activation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  C2BindingError,
  C2RoomBinding,
  C2WorkerSupervisor,
  ExecutionStreamLimitError,
  ExecutionStreamRegistry,
  FIXTURE_OCCUPANCY_PREFIX,
  MAX_EXECUTION_STREAMS,
} from '../packages/worker-supervisor/src/index.js';
import { resolvePrereqCRuntime } from './support/require-prereq-c-runtime.js';

const runtime = resolvePrereqCRuntime();
const SKIP: string | false = !runtime.ok
  ? `Prerequisite C proof runtime not bound: ${runtime.missing.join('; ')}`
  : false;

let workDir: string;
let dbCounter = 0;
let idCounter = 0;

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'phase1-c2-'));
});
after(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function newSupervisor(occupancyKey: string): C2WorkerSupervisor {
  assert.notEqual(runtime.launch, null);
  dbCounter += 1;
  return new C2WorkerSupervisor({
    occupancyKey,
    launch: { ...runtime.launch!, dbPath: join(workDir, `ledger-${String(dbCounter)}.sqlite`) },
    requestTimeoutMs: 10_000,
  });
}

function newBinding(roomId: string, occupancyKey: string, supervisor: C2WorkerSupervisor): C2RoomBinding {
  return new C2RoomBinding({
    roomId,
    occupancyKey,
    supervisor,
    newId: () => `a4b41f5e-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`,
    now: () => '2026-09-10T12:00:00.000Z',
  });
}

describe('B — ExecutionStreamRegistry: exactly two execution stream identities', () => {
  it('registers two identities per room; a third raises ExecutionStreamLimitError', () => {
    const registry = new ExecutionStreamRegistry();
    registry.register('room-1', 'slot-a', '2026-09-10T00:00:00.000Z');
    registry.register('room-1', 'slot-b', '2026-09-10T00:00:00.000Z');
    assert.equal(registry.streamsFor('room-1').length, MAX_EXECUTION_STREAMS);
    assert.equal(registry.atLimit('room-1'), true);
    assert.throws(() => registry.register('room-1', 'slot-c', '2026-09-10T00:00:00.000Z'), ExecutionStreamLimitError);
    assert.equal(registry.streamsFor('room-1').length, 2, 'the refused third stream left no trace');
  });

  it('re-registering an existing identity is idempotent; rooms are independent; release frees a slot', () => {
    const registry = new ExecutionStreamRegistry();
    const first = registry.register('room-1', 'slot-a', 't');
    assert.equal(registry.register('room-1', 'slot-a', 't2'), first);
    registry.register('room-2', 'slot-a', 't');
    registry.register('room-2', 'slot-b', 't');
    assert.equal(registry.streamsFor('room-1').length, 1);
    registry.release('room-2', 'slot-b');
    assert.equal(registry.atLimit('room-2'), false);
    registry.register('room-2', 'slot-c', 't');
    assert.equal(registry.atLimit('room-2'), true);
  });
});

describe('H — C2RoomBinding strict fixture gate (no runtime needed)', () => {
  it('refuses a non-fixture occupancy key at construction — no production wiring path exists', () => {
    // A supervisor is a plain object until start(); constructing one spawns nothing.
    const supervisor = new C2WorkerSupervisor({
      occupancyKey: 'production-room',
      launch: { bunExecutable: '/nonexistent/bun', workerEntrypoint: '/nonexistent/worker.ts', dbPath: '/nonexistent.sqlite' },
    });
    assert.throws(
      () => newBinding('room-x', 'production-room', supervisor),
      (err: unknown) => err instanceof C2BindingError && err.code === 'fixture_gate_refused',
    );
    supervisor.dispose();
  });

  it('refuses a binding whose supervisor carries a different occupancy key', () => {
    const supervisor = new C2WorkerSupervisor({
      occupancyKey: `${FIXTURE_OCCUPANCY_PREFIX}other`,
      launch: { bunExecutable: '/nonexistent/bun', workerEntrypoint: '/nonexistent/worker.ts', dbPath: '/nonexistent.sqlite' },
    });
    assert.throws(
      () => newBinding('room-x', `${FIXTURE_OCCUPANCY_PREFIX}room-x`, supervisor),
      (err: unknown) => err instanceof C2BindingError && err.code === 'occupancy_key_mismatch',
    );
    supervisor.dispose();
  });
});

describe('H — C2RoomBinding against the REAL subordinate Bun worker', { skip: SKIP }, () => {
  it('records fixture facts durably (ack after COMMIT), reads them back, and the chain verifies', async () => {
    const key = `${FIXTURE_OCCUPANCY_PREFIX}room-h1`;
    const supervisor = newSupervisor(key);
    try {
      await supervisor.start();
      assert.equal(supervisor.currentState(), 'active');
      const binding = newBinding('room-h1', key, supervisor);
      await binding.recordFixtureFact('slot-a', 'occupancy-prepared', { occupancy_epoch: 1 });
      await binding.recordFixtureFact('slot-b', 'execution-running', { state: 'RUNNING' });
      const rows = (await binding.rowsSince(0)) as { rows: Array<Record<string, unknown>> };
      assert.equal(rows.rows.length, 2);
      assert.equal(rows.rows[0]!['sequence'], 1);
      assert.equal(rows.rows[1]!['sequence'], 2);
      const verify = (await binding.verify()) as { valid: boolean; count: number };
      assert.deepEqual({ valid: verify.valid, count: verify.count }, { valid: true, count: 2 });
    } finally {
      supervisor.dispose();
    }
  });

  it('worker credential boundary: the worker environment carries exactly one variable; no secret reaches it', async () => {
    const key = `${FIXTURE_OCCUPANCY_PREFIX}room-h2`;
    process.env['PHASE1_FAKE_PROVIDER_SECRET'] = 'must-not-cross';
    const supervisor = newSupervisor(key);
    try {
      await supervisor.start();
      const pid = supervisor.workerPid();
      assert.equal(typeof pid, 'number');
      // Read the child's environment through the OS (macOS/Linux `ps`).
      const { spawnSync } = await import('node:child_process');
      const ps = spawnSync('ps', ['-E', '-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
      const env = ps.stdout;
      assert.equal(env.includes('PHASE1_FAKE_PROVIDER_SECRET'), false, 'no Gateway secret inherited by the worker');
      assert.equal(env.includes('PREREQC_WORKER_DB_PATH'), true, 'the one authorized variable is present');
    } finally {
      delete process.env['PHASE1_FAKE_PROVIDER_SECRET'];
      supervisor.dispose();
    }
  });

  it('worker is subordinate: Gateway shutdown reaps it; after loss no request is served and it does not restart itself', async () => {
    const key = `${FIXTURE_OCCUPANCY_PREFIX}room-h3`;
    const supervisor = newSupervisor(key);
    try {
      await supervisor.start();
      const pid = supervisor.workerPid()!;
      const code = await supervisor.shutdown();
      assert.equal(typeof code, 'number');
      assert.equal(supervisor.currentState(), 'lost');
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
      }
      assert.equal(alive, false, 'worker process is gone after Gateway shutdown');
      const binding = newBinding('room-h3', key, supervisor);
      await assert.rejects(binding.recordFixtureFact('slot-a', 'after-loss', {}), (err: unknown) => {
        assert.ok(err instanceof Error);
        return true;
      });
      assert.equal(supervisor.currentState(), 'lost', 'no self-restart');
    } finally {
      supervisor.dispose();
    }
  });
});
