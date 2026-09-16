/**
 * Checkpoint persistence: one checkpoint file per checkpoint, written
 * ATOMICALLY (temp file + rename) under an EXCLUSIVE single-writer lock,
 * with the sha256 of the persisted bytes recorded and verified on every
 * write. No hash, no claim.
 *
 * SINGLE-WRITER, code-enforced: `beginWrite` creates `<target>.lock` with
 * the exclusive-create flag (`wx`); a second writer attempting to write the
 * same checkpoint file gets a `SingleWriterError`, never a merge and never
 * a silent wait. A lease is single-use: commit/abort exactly once.
 *
 * v0 is files + hashes only — no SQLite, no FTS (out of scope per the act).
 */

import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { encodeCheckpointV1, parseCheckpointV1, type CheckpointV1 } from './schema.js';

export class CheckpointStoreError extends Error {
  override readonly name: string = 'CheckpointStoreError';
}

export class SingleWriterError extends CheckpointStoreError {
  override readonly name = 'SingleWriterError';
}

export interface WriteLease {
  readonly targetPath: string;
  readonly lockPath: string;
  readonly owner: string;
  readonly acquiredAtMs: number;
}

export interface PersistedCheckpoint {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly checkpoint: CheckpointV1;
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export class CheckpointStore {
  constructor(private readonly dir: string) {
    if (typeof dir !== 'string' || dir.length === 0) throw new CheckpointStoreError('a checkpoint directory is required');
  }

  /** Deterministic file layout: <dir>/<session_id>/checkpoint-<seq>.json. */
  pathFor(sessionId: string, seq: number): string {
    if (!SAFE_SEGMENT.test(sessionId)) {
      throw new CheckpointStoreError(`unsafe session id ${JSON.stringify(sessionId)} (allowed: [A-Za-z0-9._-])`);
    }
    if (!Number.isInteger(seq) || seq < 1) throw new CheckpointStoreError(`seq must be an integer >= 1, got ${seq}`);
    return join(this.dir, sessionId, `checkpoint-${String(seq).padStart(4, '0')}.json`);
  }

  isLocked(targetPath: string): boolean {
    return existsSync(`${targetPath}.lock`);
  }

  /**
   * Acquire the exclusive write lease for one checkpoint file. FAIL-CLOSED:
   * an existing lock means another writer owns (or crashed owning) this
   * file; the error names the recorded owner when it can be read. v0 never
   * breaks a lock itself — a stale lock is an operator act, not a library
   * decision.
   */
  beginWrite(targetPath: string, owner: string, acquiredAtMs: number): WriteLease {
    if (typeof owner !== 'string' || owner.length === 0) throw new CheckpointStoreError('a writer owner identity is required');
    const lockPath = `${targetPath}.lock`;
    mkdirSync(dirname(targetPath), { recursive: true });
    const lockBody = `${JSON.stringify({ owner, acquired_at_ms: acquiredAtMs })}\n`;
    let fd: number;
    try {
      fd = openSync(lockPath, 'wx');
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'EEXIST') {
        let holder = '(unreadable lock)';
        try {
          holder = readFileSync(lockPath, 'utf8').trim();
        } catch {
          /* fall through with the generic holder note */
        }
        throw new SingleWriterError(`checkpoint file is already owned by another writer: ${lockPath} — ${holder}`);
      }
      throw cause;
    }
    try {
      writeFileSync(fd, lockBody, 'utf8');
    } finally {
      closeSync(fd);
    }
    return { targetPath, lockPath, owner, acquiredAtMs };
  }

  /**
   * Persist under the lease: encode canonically, write to a unique temp
   * file, atomically rename over the target, then RE-READ the persisted
   * bytes and prove they hash to the recorded sha256. Only then is the
   * lock released. A hash mismatch is a PersistenceError, not a PASS.
   */
  commit(lease: WriteLease, checkpoint: CheckpointV1): PersistedCheckpoint {
    const bytes = encodeCheckpointV1(checkpoint);
    const sha256 = sha256Hex(bytes);
    const tmp = `${lease.targetPath}.tmp-${process.pid}-${lease.acquiredAtMs}`;
    try {
      writeFileSync(tmp, bytes, 'utf8');
      renameSync(tmp, lease.targetPath);
      const persisted = readFileSync(lease.targetPath, 'utf8');
      const persistedSha = sha256Hex(persisted);
      if (persistedSha !== sha256) {
        throw new CheckpointStoreError(
          `persistence hash mismatch for ${lease.targetPath}: wrote ${sha256}, read back ${persistedSha}`,
        );
      }
      return { path: lease.targetPath, sha256, bytes: Buffer.byteLength(bytes, 'utf8'), checkpoint };
    } finally {
      if (existsSync(tmp)) rmSync(tmp);
      rmSync(lease.lockPath);
    }
  }

  /** Release the lease without writing (seat failure, schema reject, …). */
  abort(lease: WriteLease): void {
    rmSync(lease.lockPath);
  }

  /** Read + validate one checkpoint file, with its recorded content hash. */
  read(targetPath: string): PersistedCheckpoint {
    const raw = readFileSync(targetPath, 'utf8');
    return {
      path: targetPath,
      sha256: sha256Hex(raw),
      bytes: Buffer.byteLength(raw, 'utf8'),
      checkpoint: parseCheckpointV1(raw),
    };
  }

  /** Highest-seq checkpoint for a session, or null when none exist. */
  readLatest(sessionId: string): PersistedCheckpoint | null {
    const sessionDir = join(this.dir, sessionId);
    let names: string[];
    try {
      names = readdirSync(sessionDir);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw cause;
    }
    const checkpointFiles = names.filter((n) => /^checkpoint-\d+\.json$/.test(n)).sort();
    const latest = checkpointFiles[checkpointFiles.length - 1];
    if (latest === undefined) return null;
    return this.read(join(sessionDir, latest));
  }
}
