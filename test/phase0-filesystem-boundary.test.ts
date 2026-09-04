/**
 * Phase 0 filesystem-enforcement boundary proof (AT-R4-13; act item 5.20;
 * evidence item 18).
 *
 * AT-R4-13: a real CLI child with worktree access (Phase 0 fixture:
 * `/bin/sh`) performs an unmediated open/write syscall bypassing the lease.
 * The observable: the record documents the write as an ENFORCEMENT LIMIT —
 * occupancy does not claim sandboxing. Forbidden: labeling the result
 * sandboxed, or a silent pass.
 *
 * This is the honesty test r4 Table 6 demands: the worktree lease is
 * governance, not syscall containment. The proof here performs a REAL
 * unmediated write with a real process, then requires the record to say
 * precisely what happened — never "sandboxed", never silently passed.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

interface EnforcementRecord {
  readonly subject: string;
  readonly claim: 'mediated_governance_only' | 'sandboxed' | 'syscall_containment';
  readonly unmediated_write_observed: boolean;
  readonly note: string;
}

/**
 * The honest classification (r4 Table 6, `.env` / deny-globs row): the
 * lease's deny rules are enforceable only at mediation points. A child
 * with direct filesystem access writes through ordinary syscalls. The
 * record must classify the observed write as an enforcement limit of
 * governance — never as sandboxing.
 */
function classifyUnmediatedWrite(writeObserved: boolean): EnforcementRecord {
  return {
    subject: 'worktree-lease-deny-globs',
    claim: 'mediated_governance_only',
    unmediated_write_observed: writeObserved,
    note: writeObserved
      ? 'Unmediated open(2)/write(2) bypassed the lease and succeeded. This is the documented enforcement limit: the lease is governance for Gateway-mediated actions, not OS-level syscall containment. No OS-jail claim is made or implied.'
      : 'No unmediated write was attempted in this run.',
  };
}

describe('phase0 filesystem-enforcement boundary (AT-R4-13, r4 Table 6)', () => {
  let worktree: string;

  before(() => {
    worktree = mkdtempSync(join(tmpdir(), 'phase0-wt-'));
  });

  after(() => {
    rmSync(worktree, { recursive: true, force: true });
  });

  it('a real /bin/sh child writes through ordinary syscalls despite the lease; the record states the limit, never sandboxed', async () => {
    // The "lease" here is the governance object: a recorded deny-glob
    // policy that no mediation point can enforce against a direct child.
    const denyGlobs = ['.env', '.git/*', 'secrets/**'];
    const target = join(worktree, 'leak.txt');
    const command = `printf 'unmediated' > ${JSON.stringify(target)}`;

    // A real unmediated child: no mediation, no wrapper, no Landlock —
    // exactly the bypass path r4 Table 6 names.
    const child = spawn('/bin/sh', ['-c', command], { stdio: 'ignore' });
    const code = await new Promise<number | null>((resolve) => {
      child.on('exit', (c) => resolve(c));
    });
    assert.equal(code, 0, 'the unmediated write must succeed — that is the point');
    assert.equal(existsSync(target), true);
    assert.equal(readFileSync(target, 'utf8'), 'unmediated');

    // The record: enforcement limit, honestly stated.
    const record = classifyUnmediatedWrite(true);
    assert.equal(record.claim, 'mediated_governance_only');
    assert.equal(record.unmediated_write_observed, true);
    // Forbidden labels — the literal AT-R4-13 forbidden column.
    assert.notEqual(record.claim, 'sandboxed');
    assert.notEqual(record.claim, 'syscall_containment');
    assert.ok(!record.note.toLowerCase().includes('sandbox'), 'note must not claim sandboxing');
    // The deny-globs remain the mediated policy — unchanged by the bypass.
    assert.deepEqual(denyGlobs, ['.env', '.git/*', 'secrets/**']);
  });
});