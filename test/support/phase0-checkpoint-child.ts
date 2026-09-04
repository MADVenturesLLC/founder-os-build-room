/**
 * Phase 0 CheckpointCommit persisting fixture child (r4.3 §3 / AT-R4-39,
 * AT-R4-34).
 *
 * A real child process persists the frozen write order
 *   (1) fsync raw-ring records through durable_committed_seq
 *   (2) fsync checkpoint blob
 *   (3) fsync CheckpointCommit record
 *   (4) advance the checkpoint index
 * against a REAL directory, and the parent test SIGKILLs it at each
 * boundary. Recovery must reuse only the last complete verified commit —
 * an in-process mock cannot prove crash semantics because a SIGKILL to the
 * test process kills the harness too.
 *
 * The child also runs the same persist path with an injected partial write
 * (PHASE0_CKPT_CRASH=after-raw-ring / after-blob / after-commit-record /
 * before-fsync-index / none) so the recovery checker can exercise every
 * half-written state against real bytes on disk.
 *
 * Speaks JSONL progress on stdout; the parent asserts on them.
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export interface CheckpointCommitRecord {
  readonly execution_id: string;
  readonly checkpoint_seq: number;
  readonly durable_committed_seq: number;
  readonly checkpoint_digest: string;
  readonly vt_codec_version: string;
  readonly committed_at: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

function emit(record: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function syncAppend(path: string, line: string): void {
  const fd = openSync(path, 'a');
  try {
    writeSync(fd, line);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Frozen write order (r4.3 §3), with a named crash boundary after each
 * step. `crash` names the boundary at which this child stops persisting
 * and waits to be SIGKILLed (or, for unit boundaries, simply exits,
 * leaving the partial state on disk for recovery to reject).
 */
function persistWithCrashBoundary(
  dir: string,
  executionId: string,
  checkpointSeq: number,
  rawSuffix: string[],
  crash: string,
): void {
  const ringPath = join(dir, 'raw-ring.jsonl');
  const blobDir = join(dir, 'blobs');
  mkdirSync(blobDir, { recursive: true });

  // Step 1: fsync raw-ring records through durable_committed_seq.
  const startingSeq = checkpointSeq - rawSuffix.length;
  let seq = startingSeq;
  const ringRecords: string[] = [];
  for (const bytes of rawSuffix) {
    seq += 1;
    ringRecords.push(JSON.stringify({ execution_id: executionId, pty_output_seq: seq, bytes }));
  }
  appendFileSync(ringPath, `${ringRecords.map((r) => `${r}\n`).join('')}`);
  const ringFd = openSync(ringPath, 'r+');
  try {
    fsyncSync(ringFd);
  } finally {
    closeSync(ringFd);
  }
  const durableCommittedSeq = seq;
  emit({ step: 'raw-ring-fsynced', durable_committed_seq: durableCommittedSeq });

  if (crash === 'after-raw-ring') {
    emit({ step: 'crash-boundary', boundary: crash });
    process.exit(9);
  }

  // Step 2: fsync checkpoint blob (blob.seq <= durable_committed_seq).
  const blob = JSON.stringify({
    execution_id: executionId,
    checkpoint_seq: checkpointSeq,
    grid: 'G'.repeat(64),
    parser_state: { partial_utf8: '', partial_csi: '' },
    vt_codec_version: 'phase0-vt-1',
  });
  const digest = sha256(blob);
  const blobPath = join(blobDir, `${digest}.json`);
  const blobFd = openSync(blobPath, 'wx');
  try {
    writeSync(blobFd, blob);
    fsyncSync(blobFd);
  } finally {
    closeSync(blobFd);
  }
  emit({ step: 'blob-fsynced', checkpoint_digest: digest, checkpoint_seq: checkpointSeq });

  if (crash === 'after-blob') {
    emit({ step: 'crash-boundary', step_no: 2, boundary: crash });
    process.exit(9);
  }

  // Step 3: fsync CheckpointCommit record (all fields together).
  const commit: CheckpointCommitRecord = {
    execution_id: executionId,
    checkpoint_seq: checkpointSeq,
    durable_committed_seq: durableCommittedSeq,
    checkpoint_digest: digest,
    vt_codec_version: 'phase0-vt-1',
    committed_at: new Date().toISOString(),
  };
  const commitPath = join(dir, 'checkpoint-commits.jsonl');
  syncAppend(commitPath, `${JSON.stringify(commit)}\n`);
  emit({
    step: 'commit-fsynced',
    checkpoint_seq: checkpointSeq,
    durable_committed_seq: durableCommittedSeq,
  });

  if (crash === 'after-commit-record') {
    emit({ step: 'crash-boundary', step_no: 3, boundary: crash });
    process.exit(9);
  }

  // Step 4: advance the checkpoint index (names only a complete commit).
  const indexPath = join(dir, 'checkpoint-index.json');
  const newIndex = { latest_commit: digest, checkpoint_seq: checkpointSeq };
  const indexFd = openSync(indexPath, 'w');
  try {
    writeSync(indexFd, JSON.stringify(newIndex));
    fsyncSync(indexFd);
  } finally {
    closeSync(indexFd);
  }
  emit({ step: 'index-advanced', checkpoint_seq: checkpointSeq });

  if (crash === 'after-index') {
    emit({ step: 'crash-boundary', step_no: 4, boundary: crash });
    process.exit(9);
  }

  emit({ step: 'persist-complete' });
}

/**
 * Recovery checker (r4.2 §4 invariants / r4.3 §3 invariants): reads only
 * committed state and returns the last admissible checkpoint or an honest
 * `checkpoint_unavailable` — never a half-written blob, never a commit
 * whose digest fails, never a commit ahead of the raw-ring watermark,
 * never an index without its commit.
 */
function recoverLatestAdmissible(dir: string): void {
  const ringPath = join(dir, 'raw-ring.jsonl');
  const commitPath = join(dir, 'checkpoint-commits.jsonl');
  const indexPath = join(dir, 'checkpoint-index.json');
  const blobDir = join(dir, 'blobs');

  const result: {
    kind: 'admissible' | 'checkpoint_unavailable';
    checkpoint_seq?: number;
    durable_committed_seq?: number;
    checkpoint_digest?: string;
    reason?: string;
  } = { kind: 'checkpoint_unavailable' };

  if (!existsSync(commitPath)) {
    result.reason = 'no-commit-record';
    emit({ step: 'recovered', ...result });
    return;
  }

  // durable_committed_seq is the highest PTY sequence fsynced in the raw
  // ring (r4.3 §3 invariant 3).
  let ringSeq = 0;
  if (existsSync(ringPath)) {
    for (const line of readFileSync(ringPath, 'utf8').split('\n')) {
      if (line === '') continue;
      const rec = JSON.parse(line) as { pty_output_seq: number };
      if (rec.pty_output_seq > ringSeq) ringSeq = rec.pty_output_seq;
    }
  }

  let last: CheckpointCommitRecord | null = null;
  for (const line of readFileSync(commitPath, 'utf8').split('\n')) {
    if (line === '') continue;
    const rec = JSON.parse(line) as CheckpointCommitRecord;
    last = rec;
  }
  if (last === null) {
    result.reason = 'commit-file-empty';
    emit({ step: 'recovered', ...result });
    return;
  }

  // Index-only recovery is forbidden: a moved index without its commit is
  // discarded. The index is advisory; the commit record is the unit.
  if (existsSync(indexPath)) {
    let index: { latest_commit?: string };
    try {
      index = JSON.parse(readFileSync(indexPath, 'utf8')) as { latest_commit?: string };
    } catch {
      index = {};
    }
    if (index.latest_commit !== undefined && index.latest_commit !== last.checkpoint_digest) {
      // Index names a commit that does not exist in the commit record —
      // index-advanced-before-fsync class. Discard the index.
      emit({ step: 'index_discarded', named: index.latest_commit });
    }
  }

  // A blob without a commit is discarded; a commit whose digest does not
  // verify is discarded (r4.3 §3 invariant 2).
  const blobPath = join(blobDir, `${last.checkpoint_digest}.json`);
  if (!existsSync(blobPath)) {
    result.reason = 'blob-missing';
    emit({ step: 'recovered', ...result });
    return;
  }
  const blobBytes = readFileSync(blobPath, 'utf8');
  if (sha256(blobBytes) !== last.checkpoint_digest) {
    result.reason = 'digest-mismatch';
    emit({ step: 'recovered', ...result });
    return;
  }
  // checkpoint_seq <= durable_committed_seq is impossible to violate under
  // the write order; observing it is a stop (r4.3 §3 invariant 2).
  if (last.checkpoint_seq > ringSeq) {
    result.reason = 'commit-ahead-of-raw-ring';
    emit({ step: 'recovered', ...result });
    process.exitCode = 10; // stop-class observable, distinct from unavailable
    return;
  }
  if (last.checkpoint_seq > last.durable_committed_seq) {
    result.reason = 'commit-ahead-of-own-watermark';
    emit({ step: 'recovered', ...result });
    process.exitCode = 10;
    return;
  }

  result.kind = 'admissible';
  result.checkpoint_seq = last.checkpoint_seq;
  result.durable_committed_seq = Math.min(last.durable_committed_seq, ringSeq);
  result.checkpoint_digest = last.checkpoint_digest;
  emit({ step: 'recovered', ...result });
}

const mode = required('PHASE0_CKPT_MODE');
const dir = required('PHASE0_CKPT_DIR');

if (mode === 'persist') {
  const crash = process.env['PHASE0_CKPT_CRASH'] ?? 'none';
  const checkpointSeq = Number(required('PHASE0_CKPT_SEQ'));
  const rawSuffix = JSON.parse(required('PHASE0_CKPT_RAW')) as string[];
  persistWithCrashBoundary(dir, 'phase0-exec-a', checkpointSeq, rawSuffix, crash);
  emit({ step: 'exit', code: 0 });
  process.exit(0);
}

if (mode === 'recover') {
  recoverLatestAdmissible(dir);
  process.exit(process.exitCode ?? 0);
}

throw new Error(`unknown PHASE0_CKPT_MODE: ${mode}`);