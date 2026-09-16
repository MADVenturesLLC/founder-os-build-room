/**
 * Notes scratch channel (MiMo notes.md pattern, MAD-shaped): the MAIN
 * WORKER's only write channel — an append-only scratch log it can drop
 * unstructured working notes into at any time. At checkpoint time the
 * independent writer seat reads the scratch, promotes what matters into
 * structured checkpoint fields, and only then clears WHAT IT READ.
 *
 * The scratch file is JSONL — one `{"at_ms":…,"text":…}` record per line.
 * (MiMo's scratch is markdown; the mechanism — append-only worker notes,
 * writer-side promotion, clear-on-checkpoint — is the act's description;
 * the byte format is MAD-invented v0.) JSONL over markdown so promotion is
 * lossless and a corrupt record fails closed instead of being skimmed.
 *
 * Ordering contract enforced by the writer: READ → checkpoint durably
 * persisted → CLEAR THE READ PREFIX (`clearThrough`). A note the worker
 * appends WHILE the seat is still writing lands after the read prefix and
 * survives the clear — promotion never silently eats it. Mutations
 * (append / clearThrough / clear) serialize on an exclusive lock file
 * (`wx` create, fail-closed on contention, released in `finally`), so a
 * rewrite never atomically replaces a file an append just landed in.
 */

import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface NoteEntry {
  /** 1-based line number within the scratch file at read time. */
  readonly seq: number;
  readonly at_ms: number;
  readonly text: string;
}

export class NotesLogError extends Error {
  override readonly name = 'NotesLogError';
}

export class NotesLog {
  constructor(private readonly filePath: string) {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new NotesLogError('a scratch file path is required');
    }
  }

  get path(): string {
    return this.filePath;
  }

  /** Serialize a mutation on the scratch's exclusive lock (fail-closed). */
  private locked<T>(mutate: () => T): T {
    const lockPath = `${this.filePath}.lock`;
    mkdirSync(dirname(this.filePath), { recursive: true });
    let fd: number;
    try {
      fd = openSync(lockPath, 'wx');
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new NotesLogError(`scratch is locked by another writer: ${lockPath}`);
      }
      throw cause;
    }
    try {
      writeFileSync(fd, `${JSON.stringify({ pid: process.pid })}\n`, 'utf8');
    } finally {
      closeSync(fd);
    }
    try {
      return mutate();
    } finally {
      rmSync(lockPath);
    }
  }

  /** Append one note. Append-only: this channel has no edit or delete-one. */
  append(text: string, atMs: number): void {
    if (typeof text !== 'string' || text.length === 0) throw new NotesLogError('note text must be a non-empty string');
    if (typeof atMs !== 'number' || !Number.isInteger(atMs) || atMs < 0) {
      throw new NotesLogError(`at_ms must be an integer >= 0, got ${atMs}`);
    }
    if (text.includes('\n') || text.includes('\r')) {
      throw new NotesLogError('note text must be single-line (promotion into structured fields is the writer seat’s job)');
    }
    this.locked(() => {
      appendFileSync(this.filePath, `${JSON.stringify({ at_ms: atMs, text })}\n`, 'utf8');
    });
  }

  /** Read every note in append order. A corrupt line fails closed. */
  readAll(): readonly NoteEntry[] {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf8');
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw cause;
    }
    const lines = raw.split('\n').filter((line) => line.length > 0);
    return lines.map((line, i) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new NotesLogError(`corrupt scratch line ${i + 1} in ${this.filePath}`);
      }
      const rec = value as Record<string, unknown>;
      if (typeof rec !== 'object' || rec === null || typeof rec.at_ms !== 'number' || typeof rec.text !== 'string') {
        throw new NotesLogError(`corrupt scratch line ${i + 1} in ${this.filePath}`);
      }
      return { seq: i + 1, at_ms: rec.at_ms, text: rec.text };
    });
  }

  /**
   * Clear exactly the entries with `seq <= maxSeq` (the prefix a checkpoint
   * promoted), keeping anything appended since. Atomic temp-file + rename
   * under the scratch lock. Returns the cleared entries.
   */
  clearThrough(maxSeq: number): readonly NoteEntry[] {
    if (!Number.isInteger(maxSeq) || maxSeq < 0) throw new NotesLogError(`maxSeq must be an integer >= 0, got ${maxSeq}`);
    return this.locked(() => {
      const all = this.readAll();
      const cleared = all.filter((n) => n.seq <= maxSeq);
      const kept = all.filter((n) => n.seq > maxSeq);
      if (cleared.length > 0) {
        const tmp = `${this.filePath}.rewrite-${process.pid}`;
        writeFileSync(tmp, kept.map((n) => `${JSON.stringify({ at_ms: n.at_ms, text: n.text })}\n`).join(''), 'utf8');
        renameSync(tmp, this.filePath);
      }
      return cleared;
    });
  }

  /** Clear the entire scratch, returning what was cleared. */
  clear(): readonly NoteEntry[] {
    return this.locked(() => {
      const all = this.readAll();
      if (all.length > 0) {
        const tmp = `${this.filePath}.rewrite-${process.pid}`;
        writeFileSync(tmp, '', 'utf8');
        renameSync(tmp, this.filePath);
      }
      return all;
    });
  }
}
