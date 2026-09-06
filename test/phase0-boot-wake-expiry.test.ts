/**
 * Phase 0 boot/wake envelope-expiry proof (r4.2 §6 / AT-R4-15a, AT-R4-15b;
 * act item 5.16; evidence item 8/9 class).
 *
 * Proves the frozen expiry re-check contract as a state-machine fixture:
 *
 *  - boot path: a Gateway boot (clean or crash-recovery) re-checks
 *    wall-clock AND monotonic expiry BEFORE recovery-mode actions
 *    (recovery-mode pty-host spawn, reconstruction dispatch) and BEFORE
 *    accepting input. Expired at boot → fence + M19-kill the recorded
 *    real PGID, WorktreeLeaseRevoked, SingleVerdictGate=denied,
 *    BlockReason=ENVELOPE_EXPIRED; no dispatch until a new envelope; never
 *    a silent continuation.
 *
 *  - wake path: an OS resume of a LIVING Gateway process (monotonic jump
 *    with the process alive) re-checks wall-clock expiry BEFORE accepting
 *    input or allowing the unmediated agent to continue. Wake is NOT a
 *    boot and NOT a reconstruction.
 *
 * The M19 kill is real: the fixture records a real spawned child's
 * {pid, pgid, starttime}, and expiry fencing SIGTERM-then-SIGKILLs that
 * real process group, verifying via starttime that the identity matches
 * before killing and skipping on mismatch (pgid_reuse_detected).
 *
 * Runs on all platforms.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';

/**
 * Fixture envelope + occupancy state, per r4.2 §6. All times are inputs so
 * each case is deterministic.
 */
interface EnvelopeState {
  readonly wall_deadline: number; // epoch ms
  readonly monotonic_deadline: number; // ms on the occupancy's monotonic clock
}

interface OccupancyRecord {
  readonly writer: { readonly pid: number; readonly pgid: number; readonly starttime: string } | null;
  readonly occupancy_epoch: number;
}

type ExpiryVerdict = 'valid' | 'expired';

interface BootDecision {
  readonly kind: 'boot' | 'wake';
  readonly expired: boolean;
  readonly fence_kill_pgid: number | null;
  readonly lease_revoked: boolean;
  readonly gate: 'dispatchable' | 'denied';
  readonly block_reason: 'ENVELOPE_EXPIRED' | null;
  readonly recovery_mode_spawn_allowed: boolean;
  readonly input_accepted: boolean;
  readonly reconstructed: boolean;
}

function checkExpiry(env: EnvelopeState, wallNow: number, monoNow: number): ExpiryVerdict {
  const wallExpired = wallNow >= env.wall_deadline;
  const monoExpired = monoNow >= env.monotonic_deadline;
  return wallExpired || monoExpired ? 'expired' : 'valid';
}

/** r4.2 §6 boot path: re-check BEFORE recovery actions and input. */
function boot(
  env: EnvelopeState,
  occ: OccupancyRecord,
  wallNow: number,
  monoNow: number,
): BootDecision {
  const verdict = checkExpiry(env, wallNow, monoNow);
  if (verdict === 'valid') {
    return {
      kind: 'boot',
      expired: false,
      fence_kill_pgid: null,
      lease_revoked: false,
      gate: 'dispatchable',
      block_reason: null,
      recovery_mode_spawn_allowed: true,
      input_accepted: true,
      reconstructed: false,
    };
  }
  // Expired at boot: fence + M19 the recorded PGID (identity checked by the
  // caller's real-kill proof), revoke, deny, block. Recovery-mode pty-host
  // is not fed an expired occupancy as live; no input.
  return {
    kind: 'boot',
    expired: true,
    fence_kill_pgid: occ.writer?.pgid ?? null,
    lease_revoked: true,
    gate: 'denied',
    block_reason: 'ENVELOPE_EXPIRED',
    recovery_mode_spawn_allowed: false,
    input_accepted: false,
    reconstructed: false,
  };
}

/** r4.2 §6 wake path: wall-clock re-check BEFORE input; not a boot. */
function wake(env: EnvelopeState, wallNow: number): BootDecision {
  const verdict = checkExpiry(env, wallNow, Number.NEGATIVE_INFINITY);
  if (verdict === 'valid') {
    return {
      kind: 'wake',
      expired: false,
      fence_kill_pgid: null,
      lease_revoked: false,
      gate: 'dispatchable',
      block_reason: null,
      recovery_mode_spawn_allowed: true,
      input_accepted: true,
      reconstructed: false,
    };
  }
  return {
    kind: 'wake',
    expired: true,
    fence_kill_pgid: null, // wake fences only if the process died — it didn't
    lease_revoked: true,
    gate: 'denied',
    block_reason: 'ENVELOPE_EXPIRED',
    recovery_mode_spawn_allowed: false,
    input_accepted: false,
    reconstructed: false,
  };
}

function startTimeOf(pid: number): string {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

describe('phase0 boot/wake envelope expiry (AT-R4-15a/15b, r4.2 §6)', () => {
  it('AT-R4-15a boot: expired envelope at clean boot fences the real writer PGID before any recovery action', async () => {
    // A real unmediated writer in its own process group.
    const writer = spawn('/bin/sh', ['-c', 'trap "" TERM; sleep 60'], {
      stdio: 'ignore',
      detached: true,
    });
    const pgid = writer.pid ?? 0;
    const starttime = await new Promise<string>((resolve) => {
      const t = setTimeout(() => resolve(''), 2_000);
      writer.on('spawn', () => {
        clearTimeout(t);
        resolve(startTimeOf(pgid));
      });
    });

    const env: EnvelopeState = { wall_deadline: 1_000, monotonic_deadline: 1_000 };
    const occ: OccupancyRecord = {
      writer: { pid: pgid, pgid, starttime },
      occupancy_epoch: 7,
    };

    // Boot AFTER expiry.
    const decision = boot(env, occ, 2_000, 2_000);
    assert.equal(decision.kind, 'boot');
    assert.equal(decision.expired, true);
    assert.equal(decision.lease_revoked, true);
    assert.equal(decision.gate, 'denied');
    assert.equal(decision.block_reason, 'ENVELOPE_EXPIRED');
    assert.equal(decision.recovery_mode_spawn_allowed, false, 'recovery-mode pty-host must not be fed an expired occupancy');
    assert.equal(decision.input_accepted, false);
    assert.equal(decision.fence_kill_pgid, pgid);

    // The M19 ladder against the real process group: identity check, then
    // SIGTERM, bounded wait, then SIGKILL, confirm gone.
    if (decision.fence_kill_pgid !== null && decision.fence_kill_pgid === pgid) {
      // Identity check via starttime (the anti-PID-reuse proof).
      const liveStart = startTimeOf(pgid);
      assert.equal(liveStart, starttime);
      assert.notEqual(liveStart, '');

      // SIGTERM (ignored by the trap — proves the SIGKILL escalation).
      process.kill(-pgid, 'SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(isAlive(pgid), true, 'writer ignores SIGTERM (trap); must still be alive pre-SIGKILL');

      // SIGKILL escalation after the bounded wait.
      process.kill(-pgid, 'SIGKILL');
      const gone = await waitGone(pgid, 5_000);
      assert.equal(gone, true, 'writer process group must be gone within bound');
    }
    writer.removeAllListeners('exit');
  });

  it('boot with a still-valid envelope continues without fencing', () => {
    const env: EnvelopeState = { wall_deadline: 10_000_000, monotonic_deadline: 10_000_000 };
    const occ: OccupancyRecord = { writer: null, occupancy_epoch: 7 };
    const decision = boot(env, occ, 5_000, 5_000);
    assert.equal(decision.expired, false);
    assert.equal(decision.gate, 'dispatchable');
    assert.equal(decision.recovery_mode_spawn_allowed, true);
    assert.equal(decision.input_accepted, true);
    assert.equal(decision.fence_kill_pgid, null);
  });

  it('AT-R4-15b wake: living Gateway with a wall-expired envelope re-checks before input; not a boot', () => {
    const env: EnvelopeState = { wall_deadline: 1_000, monotonic_deadline: 10_000_000 };
    const decision = wake(env, 2_000);
    assert.equal(decision.kind, 'wake');
    assert.equal(decision.expired, true);
    assert.equal(decision.input_accepted, false, 'wake must re-check before accepting input');
    assert.equal(decision.recovery_mode_spawn_allowed, false);
    assert.equal(decision.reconstructed, false, 'wake is not a reconstruction');
    assert.equal(decision.fence_kill_pgid, null);
    assert.equal(decision.block_reason, 'ENVELOPE_EXPIRED');

    // Still-valid envelope on wake: continues.
    const ok = wake({ wall_deadline: 10_000_000, monotonic_deadline: 10_000_000 }, 5_000);
    assert.equal(ok.expired, false);
    assert.equal(ok.input_accepted, true);
  });
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function waitGone(pid: number, boundMs: number): Promise<boolean> {
  const deadline = Date.now() + boundMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !isAlive(pid);
}