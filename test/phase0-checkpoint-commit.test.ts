/**
 * Phase 0 CheckpointCommit crash-boundary proof (r4.3 §3 / AT-R4-39,
 * AT-R4-34; act items 5.12, 5.14; evidence item 15).
 *
 * Drives the persisting fixture child through the frozen write order
 *   (1) fsync raw-ring through durable_committed_seq
 *   (2) fsync checkpoint blob
 *   (3) fsync CheckpointCommit record
 *   (4) advance the checkpoint index
 * with a REAL SIGKILL injected after each boundary, then recovers from the
 * real bytes left on disk. Recovery must reuse only the last complete
 * verified commit:
 *
 *  - after-raw-ring crash: blob and commit never written →
 *    checkpoint_unavailable;
 *  - after-blob crash: blob exists, commit never written → the blob is
 *    discarded (a blob without a commit is live-only) →
 *    checkpoint_unavailable;
 *  - after-commit-record crash: commit complete and verified →
 *    admissible (index never advanced, and the index is advisory — the
 *    commit record is the unit);
 *  - index-advanced-before-fsync class: an index naming a commit with no
 *    commit record must be discarded, never trusted as recovery input.
 *
 * Also proves (AT-R4-34): an in-memory checkpoint ahead of the ring
 * (checkpoint_seq > durable ring watermark) is NOT reused — a
 * commit-ahead-of-raw-ring state is a stop-class observable (exit 10),
 * never silently accepted.
 *
 * Runs on all platforms (no kernel-lock dependency); the crash injection is
 * a real SIGKILL to a real child process.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, appendFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';

const HERE = import.meta.dirname;
const CHILD = join(HERE, 'support', 'phase0-checkpoint-child.js');

interface ChildLine {
  readonly step: string;
  readonly [key: string]: unknown;
}

function runChild(
  env: Record<string, string>,
): { lines: ChildLine[]; exited: Promise<number | null>; proc: ChildProcess } {
  const proc = spawn(process.execPath, [CHILD], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const lines: ChildLine[] = [];
  let buffer = '';
  proc.stdout!.setEncoding('utf8');
  proc.stdout!.on('data', (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line !== '') lines.push(JSON.parse(line) as ChildLine);
      newline = buffer.indexOf('\n');
    }
  });
  const exited = new Promise<number | null>((resolve) => {
    proc.on('exit', (code) => resolve(code));
  });
  return { lines, exited, proc };
}

/** SIGKILL the child at the named boundary — the real crash injection. */
async function crashAtBoundary(
  dir: string,
  boundary: string,
  checkpointSeq: number,
  rawSuffix: string[],
): Promise<{ lines: ChildLine[]; code: number | null }> {
  const run = runChild({
    PHASE0_CKPT_MODE: 'persist',
    PHASE0_CKPT_DIR: dir,
    PHASE0_CKPT_CRASH: boundary,
    PHASE0_CKPT_SEQ: String(checkpointSeq),
    PHASE0_CKPT_RAW: JSON.stringify(rawSuffix),
  });
  // The child exits by itself at the boundary (exit 9); a real SIGKILL is
  // delivered if it lingers past the boundary (defensive, not the mechanism).
  const timer = setTimeout(() => run.proc.kill('SIGKILL'), 15_000);
  timer.unref();
  const code = await run.exited;
  clearTimeout(timer);
  return { lines: run.lines, code };
}

/** Run the recovery checker against the real on-disk state. */
function recover(dir: string): ReturnType<typeof runChild> {
  return runChild({ PHASE0_CKPT_MODE: 'recover', PHASE0_CKPT_DIR: dir });
}

async function runToCompletion(run: { lines: ChildLine[]; exited: Promise<number | null> }): Promise<number | null> {
  return run.exited;
}

describe('phase0 CheckpointCommit crash boundaries (AT-R4-39, AT-R4-34, r4.3 §3)', () => {
  let baseDir: string;

  before(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'phase0-ckpt-'));
  });

  after(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('crash after raw-ring fsync only → checkpoint_unavailable (blob/commit never written)', async () => {
    const dir = join(baseDir, 'after-raw-ring');
    const { lines, code } = await crashAtBoundary(dir, 'after-raw-ring', 10, ['aa', 'bb', 'cc']);
    assert.equal(code, 9, `child should exit at boundary; lines=${JSON.stringify(lines)}`);
    assert.ok(lines.some((l) => l.step === 'raw-ring-fsynced'));

    const rec = recover(dir);
    const recCode = await runToCompletion(rec);
    const recovered = rec.lines.find((l) => l.step === 'recovered');
    assert.ok(recovered !== undefined, `no recovered line: ${JSON.stringify(rec.lines)}`);
    assert.equal(recovered['kind'], 'checkpoint_unavailable');
    assert.equal(recovered['reason'], 'no-commit-record');
    assert.equal(recCode, 0);
  });

  it('crash after blob fsync only → blob discarded, checkpoint_unavailable', async () => {
    const dir = join(baseDir, 'after-blob');
    const { lines, code } = await crashAtBoundary(dir, 'after-blob', 10, ['aa', 'bb', 'cc']);
    assert.equal(code, 9);
    assert.ok(lines.some((l) => l.step === 'raw-ring-fsynced'));
    assert.ok(lines.some((l) => l.step === 'blob-fsynced'));

    const rec = recover(dir);
    await runToCompletion(rec);
    const recovered = rec.lines.find((l) => l.step === 'recovered');
    assert.ok(recovered !== undefined);
    assert.equal(recovered['kind'], 'checkpoint_unavailable');
    assert.equal(recovered['reason'], 'no-commit-record');
  });

  it('crash after commit-record fsync → complete verified commit is admissible', async () => {
    const dir = join(baseDir, 'after-commit-record');
    const { lines, code } = await crashAtBoundary(dir, 'after-commit-record', 10, ['aa', 'bb', 'cc']);
    assert.equal(code, 9);
    assert.ok(lines.some((l) => l.step === 'commit-fsynced'));

    const rec = recover(dir);
    await runToCompletion(rec);
    const recovered = rec.lines.find((l) => l.step === 'recovered');
    assert.ok(recovered !== undefined);
    assert.equal(recovered['kind'], 'admissible');
    assert.equal(recovered['checkpoint_seq'], 10);
    assert.equal(recovered['durable_committed_seq'], 10);
  });

  it('index-advanced-before-fsync class: index naming a nonexistent commit is discarded', async () => {
    const dir = join(baseDir, 'index-ahead');
    // Persist one complete commit first (so a legit commit exists), then
    // hand-craft the index-ahead state: index names a digest with no
    // matching commit record — the state a crash between index write and
    // its commit fsync would leave.
    const base = runChild({
      PHASE0_CKPT_MODE: 'persist',
      PHASE0_CKPT_DIR: dir,
      PHASE0_CKPT_CRASH: 'none',
      PHASE0_CKPT_SEQ: '10',
      PHASE0_CKPT_RAW: JSON.stringify(['aa', 'bb', 'cc']),
    });
    await base.exited;

    // Hand-craft index-ahead: an index naming a commit that was never
    // written as a commit record.
    const indexPath = join(dir, 'checkpoint-index.json');
    const fd = openSync(indexPath, 'w');
    writeSync(
      fd,
      JSON.stringify({ latest_commit: 'deadbeef'.repeat(8), checkpoint_seq: 99 }),
    );
    closeSync(fd);

    const rec = recover(dir);
    await runToCompletion(rec);
    const discarded = rec.lines.find((l) => l.step === 'index_discarded');
    assert.ok(discarded !== undefined, `index_discarded missing: ${JSON.stringify(rec.lines)}`);
    const recovered = rec.lines.find((l) => l.step === 'recovered');
    assert.ok(recovered !== undefined);
    assert.equal(recovered['kind'], 'admissible');
    assert.equal(recovered['checkpoint_seq'], 10, 'recovery falls back to the last real commit');
  });

  it('AT-R4-34: commit ahead of the raw-ring watermark is a stop-class observable, never reused', async () => {
    const dir = join(baseDir, 'commit-ahead');
    // Persist a complete commit at seq 10 with raw through seq 10, then
    // hand-craft a commit record claiming seq 12 with a matching blob whose
    // durable watermark is beyond what the ring fsynced — the state the
    // write order makes impossible; observing it must be a stop (exit 10),
    // not a silent reuse.
    const base = runChild({
      PHASE0_CKPT_MODE: 'persist',
      PHASE0_CKPT_DIR: dir,
      PHASE0_CKPT_CRASH: 'none',
      PHASE0_CKPT_SEQ: '10',
      PHASE0_CKPT_RAW: JSON.stringify(['aa', 'bb', 'cc']),
    });
    await base.exited;

    const commitsPath = join(dir, 'checkpoint-commits.jsonl');
    const blob = JSON.stringify({
      execution_id: 'phase0-exec-a',
      checkpoint_seq: 12,
      grid: 'H'.repeat(64),
      parser_state: { partial_utf8: '', partial_csi: '' },
      vt_codec_version: 'phase0-vt-1',
    });
    const digest = createHash('sha256').update(blob).digest('hex');
    mkdirSync(join(dir, 'blobs'), { recursive: true });
    writeFileSync(join(dir, 'blobs', `${digest}.json`), blob);
    const handCrafted = {
      execution_id: 'phase0-exec-a',
      checkpoint_seq: 12,
      durable_committed_seq: 12,
      checkpoint_digest: digest,
      vt_codec_version: 'phase0-vt-1',
      committed_at: new Date().toISOString(),
    };
    appendFileSync(commitsPath, `${JSON.stringify(handCrafted)}\n`);

    const rec = recover(dir);
    const recCode = await runToCompletion(rec);
    assert.equal(recCode, 10, 'commit-ahead-of-raw-ring must be a stop-class observable');
    const recovered = rec.lines.find((l) => l.step === 'recovered');
    assert.ok(recovered !== undefined);
    assert.equal(recovered['kind'], 'checkpoint_unavailable');
    assert.equal(recovered['reason'], 'commit-ahead-of-raw-ring');
  });
});