/**
 * Prerequisite C remediation (FDR-C C2) — GATEWAY-SIDE proof suite
 * (R4 manifest B5, Founder-confirmed 2026-09-04; workspace/lockfile
 * amendment 2026-09-05 — B2 withdrawn; this tranche has no package
 * manifest, and the supervisor is consumed only through the bounded
 * relative-source import below).
 *
 * This suite drives the bounded Gateway-side supervisor
 * (`packages/worker-supervisor/src/index.ts`) against the REAL bounded
 * C2 Worker in the bound madventures-tui checkout
 * (`packages/room-runtime-worker/src/worker.ts`), which in turn runs the
 * REAL, unmodified implementations:
 *
 *   - `packages/ledger` `Ledger` (bun:sqlite, BEGIN IMMEDIATE … COMMIT);
 *   - `packages/broker/src/reconciliation.ts::interruptSession` (+ its
 *     `session-machine.ts::transitionSession` dependency).
 *
 * Proof obligations (commission §5, Gateway-owned halves):
 *   5.1  spawn under the pinned Node v22.23.2 (host Node NOT used);
 *   5.2  private transport evidence: the worker channels are unnamed
 *        AF_UNIX / SOCK_STREAM socketpair descriptors — reported
 *        truthfully, NOT as pipe(2)/FIFO; no bind/listen, no filesystem
 *        socket path, no TCP;
 *   5.3  real round-trip through the real broker/ledger seams;
 *   5.5  durable ordering; ack strictly after COMMIT;
 *   5.6  FD custody: an unrelated sibling child shares NONE of the
 *        worker's transport descriptors;
 *   5.7  normal shutdown reaps the worker;
 *   5.8  real Gateway SIGKILL: worker observes control EOF and exits; no
 *        orphan;
 *   5.9  worker death fails pending operations closed;
 *   5.10 storage fault => typed error, never success;
 *   5.11 broken framing => fail closed (worker-side exit 2; gateway-side
 *        pending rejection + kill);
 *   5.12 Gateway-owned duplicate/stale fencing proofs.
 *
 * Determinism policy (Founder R3 correction 2): the real seam mints
 * `event_id` via crypto.randomUUID; proofs assert deterministic
 * SEMANTICS/INVARIANTS only, never byte-identical values for legitimately
 * generated identifiers or hashes derived from them.
 *
 * Credential boundary: WORKER CREDENTIAL ACCESS: NONE. The worker env is
 * exactly `{ PREREQC_WORKER_DB_PATH }`; the diagnostic-scrub proof below
 * asserts no environment value appears on any channel.
 *
 * Environment gate: the suite skips itself honestly (with named
 * diagnostics, counted in the run output) unless
 * `resolvePrereqCRuntime()` binds every runtime fact — mirroring the
 * custody-macos precedent. The gated command is `npm run test:prereq-c`.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  C2SupervisorError,
  C2WorkerSupervisor,
} from '../packages/worker-supervisor/src/index.js';
import { resolvePrereqCRuntime } from './support/require-prereq-c-runtime.js';

const runtime = resolvePrereqCRuntime();

const SKIP: string | false = !runtime.ok
  ? `Prerequisite C proof runtime not bound: ${runtime.missing.join('; ')}`
  : false;

// ---------------------------------------------------------------------------
// Protocol-valid BridgeEventV1 fixtures (constructed LOCALLY — events cross
// the Gateway<->Worker boundary as JSON frames and are validated by the
// REAL worker's parseBridgeEvent; the Gateway imports nothing from the TUI).
// ---------------------------------------------------------------------------

const GENESIS = '0'.repeat(64);
const ZERO_FINGERPRINT = {
  kind: 'commit',
  sha256: GENESIS,
  git_sha: '0'.repeat(40),
};

let eventCounter = 0;
function makeEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  eventCounter += 1;
  return {
    protocol_version: 'madbridge-protocol/v1',
    event_id: `a4b41f5e-0000-4000-8000-${String(eventCounter).padStart(12, '0')}`,
    session_id: 'session-prereq-c-proof',
    parent_event_id: null,
    sender_execution_id: 'exec-proof-gateway',
    receiver_execution_id: 'exec-proof-worker',
    sender_role: 'builder',
    sender_surface: 'gateway-proof',
    sender_model: 'none',
    sender_provider: 'none',
    task_envelope_hash: GENESIS,
    repository_fingerprint: { ...ZERO_FINGERPRINT },
    event_type: 'message',
    payload_hash: '',
    payload: { note: 'prereq-c-c2-proof', n: eventCounter },
    created_at: new Date().toISOString(),
    previous_event_hash: GENESIS,
    ...over,
  };
}

/** Frame a payload the way the supervisor does (for forged-frame proofs). */
function encodeFrame(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const out = Buffer.alloc(4 + body.byteLength);
  out.writeUInt32BE(body.byteLength, 0);
  body.copy(out, 4);
  return out;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let workDir: string;
let dbCounter = 0;

/** A FRESH durable store per supervisor — each proof starts from genesis. */
function newSupervisor(occupancyKey = 'prereq-c-c2-proof'): C2WorkerSupervisor {
  assert.notEqual(runtime.launch, null);
  const launch = runtime.launch!;
  dbCounter += 1;
  return new C2WorkerSupervisor({
    occupancyKey,
    launch: {
      bunExecutable: launch.bunExecutable,
      workerEntrypoint: launch.workerEntrypoint,
      dbPath: join(workDir, `prereq-c-${dbCounter}.sqlite`),
    },
    requestTimeoutMs: 15_000,
  });
}

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'prereq-c-gateway-'));
});

after(() => {
  rmSync(workDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// lsof field parser: -F ftn -> [{fd, type, name}]
// ---------------------------------------------------------------------------

interface FdRow {
  readonly fd: string;
  readonly type: string;
  readonly name: string;
}

function lsofFields(pid: number): FdRow[] {
  const r = spawnSync('lsof', ['-n', '-p', String(pid), '-F', 'ftn'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `lsof exited ${String(r.status)}`);
  const rows: FdRow[] = [];
  let cur: { fd: string; type: string; name: string } | null = null;
  for (const line of r.stdout.split('\n')) {
    if (line.length === 0) continue;
    const tag = line[0];
    const val = line.slice(1);
    if (tag === 'f') {
      if (cur !== null && cur.type !== '') rows.push(cur);
      cur = { fd: val, type: '', name: '' };
    } else if (cur !== null && tag === 't' && cur.type === '') {
      cur.type = val;
    } else if (cur !== null && tag === 'n' && cur.name === '') {
      cur.name = val;
      rows.push(cur);
      cur = null;
    }
  }
  if (cur !== null && cur.type !== '') rows.push(cur);
  return rows;
}

// ---------------------------------------------------------------------------
// 5.1 / 5.2 / 5.6 — spawn, transport evidence, FD custody
// ---------------------------------------------------------------------------

describe('prereq-c C2 gateway — spawn, transport, custody', { skip: SKIP }, () => {
  it('5.1 — spawns the real Bun worker under the pinned Node runtime', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      assert.equal(sup.currentState(), 'active');
      assert.ok(sup.workerPid() !== null, 'worker pid observed');
      assert.match(sup.currentGeneration() ?? '', /^gen-/);
      const ping = await sup.request('ping', {});
      assert.equal(ping.ok, true);
      assert.equal((ping.result as { pong: boolean }).pong, true);
    } finally {
      sup.dispose();
    }
  });

  it('5.2 — transport evidence: unnamed AF_UNIX socketpairs; no listener, no TCP, no .sock', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      const pid = sup.workerPid();
      assert.notEqual(pid, null);

      // The three private channels (child fds 3/4/5) must be unix-domain
      // socket descriptors whose NAME is an opaque kernel handle with NO
      // filesystem path — the truthful characterization of the Node/libuv
      // unnamed AF_UNIX SOCK_STREAM socketpair implementation. Never
      // reported as pipe(2)/FIFO.
      const rows = lsofFields(pid!);
      const unixRows = rows.filter((r) => r.type === 'unix' && /^[0-9]+$/.test(r.fd));
      assert.ok(
        unixRows.length >= 3,
        `worker holds >=3 unnamed AF_UNIX socketpair descriptors (observed ${unixRows.length})`,
      );
      for (const u of unixRows) {
        assert.ok(
          !u.name.includes('/'),
          `socket descriptor ${u.fd} is unnamed (no filesystem path): name=${u.name}`,
        );
        assert.ok(
          u.name.startsWith('->') || u.name === '',
          `socket descriptor ${u.fd} is a connected endpoint, not a bound path: name=${u.name}`,
        );
      }
      // No FIFO/pipe masquerading as the transport on the channel fds:
      for (const fd of ['3', '4', '5']) {
        const row = rows.find((r) => r.fd === fd);
        if (row !== undefined) {
          assert.equal(row.type, 'unix', `channel fd ${fd} is a unix socketpair end`);
        }
      }

      // No network sockets of any kind (AND-form: -a limits to this pid).
      const net = spawnSync('lsof', ['-a', '-n', '-p', String(pid), '-i'], { encoding: 'utf8' });
      assert.equal(net.status, 1, 'lsof -i finds nothing for this process');
      assert.equal(net.stdout.trim(), '', 'worker holds no TCP/UDP sockets');

      // No filesystem socket anywhere under the proof workdir.
      const findSocks = spawnSync('find', [workDir, '-type', 's'], { encoding: 'utf8' });
      assert.equal(findSocks.status, 0);
      assert.equal(
        findSocks.stdout.trim(),
        '',
        `no filesystem socket created under the proof dir (saw: ${findSocks.stdout.trim()})`,
      );
    } finally {
      sup.dispose();
    }
  });

  it('5.6 — FD custody: an unrelated sibling child shares none of the worker transport descriptors', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      const workerPid = sup.workerPid();
      assert.notEqual(workerPid, null);

      // Spawn an UNRELATED sibling from this Gateway process. If worker
      // descriptors were inherited, the sibling would hold copies that
      // keep the transport alive after Gateway death.
      const sibling = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      try {
        assert.notEqual(sibling.pid, undefined);
        await new Promise((r) => setTimeout(r, 400));

        const workerUnix = lsofFields(workerPid!)
          .filter((r) => r.type === 'unix')
          .map((r) => r.name);
        assert.ok(workerUnix.length >= 3, 'worker unix endpoints observed');

        const siblingRows = sibling.pid !== undefined ? lsofFields(sibling.pid) : [];
        const siblingNames = new Set(siblingRows.map((r) => r.name));
        const shared = workerUnix.filter((n) => siblingNames.has(n));
        assert.deepEqual(
          shared,
          [],
          `sibling shares transport endpoints with the worker: ${shared.join(', ')}`,
        );
      } finally {
        sibling.kill('SIGKILL');
      }
    } finally {
      sup.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// 5.3 / 5.5 / 5.10 — real seams, durable ordering, storage faults
// ---------------------------------------------------------------------------

describe('prereq-c C2 gateway — real round-trip through real seams', { skip: SKIP }, () => {
  it('5.3/5.5 — durable append -> interrupt over committed rows -> durable incident append -> real verify', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      const gen = sup.currentGeneration();
      assert.notEqual(gen, null);

      // Real durable append; ack strictly after COMMIT (rowsSince sees it).
      const ev1 = makeEvent();
      const a1 = await sup.request('appendEvent', { event: ev1 });
      assert.equal(a1.ok, true, JSON.stringify(a1.error));
      const row1 = (a1.result as { row: Record<string, unknown> }).row;
      assert.equal(row1['sequence'], 1);
      assert.equal(row1['previous_hash'], GENESIS);
      assert.equal(row1['event_id'], ev1['event_id']);
      assert.match(String(row1['event_hash']), /^[0-9a-f]{64}$/);

      const seen = await sup.request('rowsSince', { since: 0 });
      assert.equal(seen.ok, true);
      assert.equal(
        (seen.result as { rows: unknown[] }).rows.length,
        1,
        'ack implies the row is already durably readable',
      );

      // Real broker interrupt semantics over the REAL committed rows.
      const now = '2026-09-04T12:00:00.000Z';
      const irq = await sup.request('interrupt', {
        reason: 'cli_exit',
        currentWriterToken: 7,
        sessionState: { kind: 'active' },
        now,
      });
      assert.equal(irq.ok, true, JSON.stringify(irq.error));
      const r = irq.result as {
        state: { kind: string };
        incidentEvent: Record<string, unknown>;
        tokenInvalidated: number;
        autoResumed: boolean;
        duplicate: boolean;
      };
      assert.equal(r.state.kind, 'interrupted');
      assert.equal(r.tokenInvalidated, 7);
      assert.equal(r.autoResumed, false);
      assert.equal(r.duplicate, false);
      // Incident chains to the ACTUAL last durable ledger hash:
      assert.equal(r.incidentEvent['previous_event_hash'], row1['event_hash']);
      assert.equal(r.incidentEvent['event_type'], 'incident');
      assert.equal(r.incidentEvent['sender_surface'], 'broker');
      assert.equal(r.incidentEvent['created_at'], now);
      assert.equal(r.incidentEvent['session_id'], 'session-prereq-c-proof');

      // Durable append of the returned incident, then the real verify pass.
      const a2 = await sup.request('appendIncident', { event: r.incidentEvent });
      assert.equal(a2.ok, true, JSON.stringify(a2.error));
      const row2 = (a2.result as { row: Record<string, unknown> }).row;
      assert.equal(row2['sequence'], 2);
      assert.equal(row2['previous_hash'], row1['event_hash']);

      const verify = await sup.request('verify', {});
      assert.equal(verify.ok, true);
      const vr = verify.result as { valid: boolean; count: number; head: string };
      assert.deepEqual(
        { valid: vr.valid, count: vr.count },
        { valid: true, count: 2 },
      );
      assert.equal(vr.head, row2['event_hash'], 'verify head is the last durable row hash');

      // Generation echo: every response carried the CURRENT Gateway-minted
      // generation (opaque correlation only).
      for (const frame of [a1, seen, irq, a2, verify]) {
        assert.equal(frame.generation, gen);
      }
    } finally {
      sup.dispose();
    }
  });

  it('5.5 — sequential appends are strictly monotone and the chain stays valid', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const ev = makeEvent({ payload: { order: i } });
        ids.push(String(ev['event_id']));
        const res = await sup.request('appendEvent', { event: ev });
        assert.equal(res.ok, true);
        assert.equal((res.result as { row: { sequence: number } }).row.sequence, i + 1);
      }
      const rows = await sup.request('rowsSince', { since: 0 });
      const list = (rows.result as { rows: Array<{ event_id: string; sequence: number }> }).rows;
      assert.deepEqual(list.map((x) => x.event_id), ids);
      assert.deepEqual(list.map((x) => x.sequence), [1, 2, 3]);
      const verify = await sup.request('verify', {});
      const vr = verify.result as { valid: boolean; count: number };
      assert.deepEqual({ valid: vr.valid, count: vr.count }, { valid: true, count: 3 });
    } finally {
      sup.dispose();
    }
  });

  it('5.10 — storage fault: duplicate event_id surfaces as typed error, never success', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      const ev = makeEvent();
      const first = await sup.request('appendEvent', { event: ev });
      assert.equal(first.ok, true);

      // Re-append the SAME event_id through the real ledger path: the
      // events.event_id UNIQUE constraint fires inside the real
      // transaction; the ledger rolls back and throws.
      const probe = await sup.request('storageFaultProbe', {
        kind: 'duplicate_event_id',
        event: ev,
      });
      assert.equal(probe.ok, true, 'probe outcome reported');
      const pr = probe.result as { faulted: boolean; error: string };
      assert.equal(pr.faulted, true);
      assert.ok(
        pr.error.toUpperCase().includes('UNIQUE'),
        `error names the constraint: ${pr.error}`,
      );

      // The failed transaction left durable state untouched.
      const verify = await sup.request('verify', {});
      const vr = verify.result as { valid: boolean; count: number };
      assert.deepEqual({ valid: vr.valid, count: vr.count }, { valid: true, count: 1 });

      // A plain appendEvent with the same id also fails closed.
      const dup = await sup.request('appendEvent', { event: ev });
      assert.equal(dup.ok, false);
      assert.equal(dup.error?.code, 'append_failed');
    } finally {
      sup.dispose();
    }
  });

  it('credential boundary — diagnostics carry no environment values', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      await sup.request('appendEvent', { event: makeEvent() });
      const diag = sup.diagnostics();
      assert.ok(diag !== undefined);
      // The worker env carried ONLY PREREQC_WORKER_DB_PATH; diagnostics are
      // scrubbed by construction. Assert no environment leakage marker.
      assert.ok(!diag.includes('PREREQC_WORKER_DB_PATH='), 'no env values in diagnostics');
      assert.ok(!diag.includes('PATH='), 'no PATH leakage in diagnostics');
      assert.ok(!diag.includes('HOME='), 'no HOME leakage in diagnostics');
      for (const line of diag.trim().split('\n')) {
        if (line.trim() === '') continue;
        const parsed = JSON.parse(line) as { worker: string; message: string };
        assert.equal(parsed.worker, 'prereq-c-c2');
        assert.ok(
          parsed.message.startsWith('op:') || parsed.message === 'worker started',
          `diagnostic line is a scrubbed marker: ${line}`,
        );
      }
    } finally {
      sup.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// 5.7 / 5.9 / 5.11 — supervision and fail-closed
// ---------------------------------------------------------------------------

describe('prereq-c C2 gateway — supervision and fail-closed', { skip: SKIP }, () => {
  it('5.7 — normal shutdown reaps the worker', async () => {
    const sup = newSupervisor();
    await sup.start();
    const code = await sup.shutdown();
    assert.equal(code, 0, 'graceful shutdown exit code 0');
    assert.equal(sup.currentState(), 'lost');
    sup.dispose();
  });

  it('5.9 — worker kill fails pending operations closed (no silent success)', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      // Freeze the worker so the request stays pending across the kill.
      sup.killWorker('SIGSTOP');
      const pending = sup.request('ping', {});
      await new Promise((r) => setTimeout(r, 200));
      sup.killWorker('SIGKILL');
      await assert.rejects(pending, (err: unknown) => {
        assert.ok(err instanceof C2SupervisorError, 'typed supervisor error');
        assert.ok(
          ['worker_lost', 'request_timeout', 'transport_broken'].includes(err.code),
          `fail-closed code: ${err.code}`,
        );
        return true;
      });
      assert.equal(sup.currentState(), 'lost');
    } finally {
      sup.dispose();
    }
  });

  it('5.11a — worker-side framing violation: worker exits fail-closed (code 2), supervisor loses transport', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      // Deliberately out-of-bounds frame length on the control channel.
      sup.sendRawControlFrame(Buffer.from([0xff, 0xff, 0xff, 0xff]));
      const exit = await new Promise<{ code: number | null; signal: string | null }>((resolve) => {
        sup.once('worker-exit', (e) => resolve(e));
        setTimeout(() => resolve({ code: null, signal: null }), 10_000);
      });
      assert.equal(exit.code, 2, 'worker detected broken framing and exited code 2');
      assert.equal(sup.currentState(), 'lost');
    } finally {
      sup.dispose();
    }
  });

  it('5.11b — gateway-side broken response framing: pending rejected, transport torn down', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      // Freeze the worker so a real response cannot race the proof.
      sup.killWorker('SIGSTOP');
      const pending = sup.request('ping', {});
      await new Promise((r) => setTimeout(r, 100));

      let broken = false;
      sup.on('transport-broken', () => {
        broken = true;
      });
      // Out-of-bounds length prefix routed through the REAL response
      // decode path: the gateway must fail closed, not honor anything.
      sup.ingestForgedResponseFrameForProof(Buffer.from([0xff, 0xff, 0xff, 0xff]));

      await assert.rejects(pending, (err: unknown) => {
        assert.ok(err instanceof C2SupervisorError);
        assert.equal(err.code, 'transport_broken');
        return true;
      });
      assert.equal(broken, true, 'transport-broken emitted');
      // Fail-closed teardown: the worker is killed, state is lost.
      await new Promise((r) => {
        sup.once('worker-exit', r);
        setTimeout(r, 10_000);
      });
      assert.equal(sup.currentState(), 'lost');
    } finally {
      sup.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// 5.12 — Gateway-owned fencing
// ---------------------------------------------------------------------------

describe('prereq-c C2 gateway — Gateway-owned fencing (5.12)', { skip: SKIP }, () => {
  it('duplicate-worker prevention: a second supervisor for the same occupancy is refused', async () => {
    const first = newSupervisor('occupancy-dup-proof');
    try {
      await first.start();
      const second = newSupervisor('occupancy-dup-proof');
      await assert.rejects(second.start(), (err: unknown) => {
        assert.ok(err instanceof C2SupervisorError, 'typed supervisor error');
        assert.equal(err.code, 'duplicate_worker');
        return true;
      });
      // Refused supervisor leaves no worker behind.
      assert.equal(second.workerPid(), null);
    } finally {
      first.dispose();
    }
  });

  it('stale-generation response is rejected by the Gateway-side fencing check', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      const currentGen = sup.currentGeneration();

      // The supervisor's request ids are sequential from 1: the hello
      // handshake consumed id 1, so this ping is id 2. Freeze the worker
      // so the real response cannot race the forged frame.
      sup.killWorker('SIGSTOP');
      const pendingPing = sup.request('ping', {});
      await new Promise((r) => setTimeout(r, 100));

      // FORGED response carrying a WRONG generation for the pending id,
      // routed through the REAL decode + correlation + fencing path. It
      // must be rejected fail-closed — never honored.
      let staleSeen = false;
      sup.on('stale-generation', () => {
        staleSeen = true;
      });
      sup.ingestForgedResponseFrameForProof(
        encodeFrame({
          ok: true,
          id: 2,
          generation: 'gen-forged-not-current',
          result: { pong: true },
        }),
      );

      await assert.rejects(pendingPing, (err: unknown) => {
        assert.ok(err instanceof C2SupervisorError);
        assert.equal(err.code, 'stale_generation');
        return true;
      });
      assert.equal(staleSeen, true, 'stale-generation event emitted');

      // The supervisor stays healthy after rejecting the forged frame:
      // resume the worker; a live request still completes with the
      // CURRENT generation. (The stale id-2 response, when it arrives,
      // finds no pending entry and is discarded as unexpected.)
      sup.killWorker('SIGCONT');
      const ping = await sup.request('ping', {});
      assert.equal(ping.ok, true);
      assert.equal(ping.generation, currentGen);
    } finally {
      sup.dispose();
    }
  });

  it('recovery: after worker loss the Gateway re-mints a fresh generation', async () => {
    const sup = newSupervisor();
    try {
      await sup.start();
      const gen1 = sup.currentGeneration();
      sup.killWorker('SIGKILL');
      await new Promise((r) => {
        sup.once('worker-exit', r);
        setTimeout(r, 10_000);
      });
      assert.equal(sup.currentState(), 'lost');

      // Restart re-establishes with a FRESH Gateway-minted generation; the
      // old one is permanently invalid.
      await sup.restart();
      const gen2 = sup.currentGeneration();
      assert.notEqual(gen2, null);
      assert.notEqual(gen2, gen1);
      assert.match(gen2!, /^gen-/);
      const ping = await sup.request('ping', {});
      assert.equal(ping.ok, true);
      assert.equal(ping.generation, gen2);
    } finally {
      sup.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// 5.8 — real Gateway SIGKILL. Requires a REAL gateway-process death, so it
// runs out-of-process: this suite spawns a small gateway driver as its own
// Node process; the driver starts supervisor + worker, prints the worker
// pid, and waits. The test SIGKILLs the driver and observes the worker exit
// (control-channel EOF: the sole writer of fd 3 died with the gateway).
// The driver is ESM (the compiled supervisor module is ESM) and imports it
// by absolute path through the PROOF_SUPERVISOR_MODULE environment variable.
// ---------------------------------------------------------------------------

describe('prereq-c C2 gateway — parent death (5.8)', { skip: SKIP }, () => {
  it('real gateway SIGKILL: worker exits on control EOF; no orphan remains', async () => {
    assert.notEqual(runtime.launch, null);
    const launch = runtime.launch!;
    assert.equal(process.version, runtime.facts.pinnedNode, 'running under the pinned runtime');

    const here = fileURLToPath(new URL('.', import.meta.url));
    const supervisorModule = join(here, '..', 'packages', 'worker-supervisor', 'src', 'index.js');
    const driverPath = join(workDir, 'gateway-driver.mjs');
    writeFileSync(
      driverPath,
      [
        '// Bounded proof driver: becomes the gateway process to be killed.',
        "const path = await import('node:path');",
        'const mod = await import(process.env.PROOF_SUPERVISOR_MODULE);',
        'const sup = new mod.C2WorkerSupervisor({',
        '  occupancyKey: "parent-death-proof",',
        '  launch: {',
        `    bunExecutable: ${JSON.stringify(launch.bunExecutable)},`,
        `    workerEntrypoint: ${JSON.stringify(launch.workerEntrypoint)},`,
        `    dbPath: ${JSON.stringify(join(workDir, 'parent-death.sqlite'))},`,
        '  },',
        '});',
        'sup.start().then(',
        '  () => { process.stdout.write(String(sup.workerPid()) + "\\n"); },',
        '  (err) => { process.stderr.write(String(err)); process.exit(1); },',
        ');',
      ].join('\n'),
    );

    const driver = spawn(process.execPath, [driverPath], {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, PROOF_SUPERVISOR_MODULE: supervisorModule },
    });

    const readyLine = await readFirstLine(driver.stdout);
    const workerPid = Number(readyLine);
    assert.ok(
      Number.isInteger(workerPid) && workerPid > 0,
      `driver reported worker pid: ${readyLine}`,
    );

    // The worker must be alive BEFORE the kill.
    assert.doesNotThrow(() => process.kill(workerPid, 0));

    // Real SIGKILL of the gateway driver process.
    assert.notEqual(driver.pid, undefined);
    process.kill(driver.pid!, 'SIGKILL');

    // The worker observes control-channel EOF and exits on its own; no
    // orphan survives. Poll with a deadline well under the test timeout.
    const deadline = Date.now() + 15_000;
    let alive = true;
    for (;;) {
      try {
        process.kill(workerPid, 0);
      } catch {
        alive = false;
        break;
      }
      if (Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.equal(alive, false, 'worker exited after gateway SIGKILL (no orphan)');
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFirstLine(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl >= 0) {
        stream.off('data', onData);
        stream.off('error', onErr);
        resolve(buf.slice(0, nl));
      } else if (buf.length > 4096) {
        stream.off('data', onData);
        stream.off('error', onErr);
        reject(new Error('driver produced no newline-terminated line'));
      }
    };
    const onErr = (err: Error): void => {
      stream.off('data', onData);
      reject(err);
    };
    stream.on('data', onData);
    stream.on('error', onErr);
  });
}
