/**
 * Single-flight, keyed per `runId`.
 *
 * The keying choice (per `runId`, not per `roomId`) is made here rather than
 * buried: the commission offers either. `runId` is what a refresh carries and
 * what an in-flight turn is identified by, so it is the unit that serializes
 * naturally; two DIFFERENT runs in one room each need their own mint, and
 * serializing those across runs would couple unrelated turns. The per-room
 * ceiling is still enforced for concurrent runs — each mint's check sees the
 * reservations the others have already recorded, so the room cannot be
 * double-issued past its ceiling across runs either. The runId lock guarantees
 * ordering within one turn; the reservation ledger guarantees the arithmetic
 * across all of them.
 *
 * Implementation is a promise-chain queue per key: a task waits for the
 * previous task on the same key to settle, then runs. No timers, no shared
 * mutable state beyond the tail map. A rejected task does not poison the
 * queue — the next waiter runs regardless.
 */

export class RunKeyLocks {
  private readonly tails = new Map<string, Promise<void>>();

  /** Run `task` exclusively per key: queued behind any prior task on the key. */
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    // A rejected tail must not stop the queue: both handlers run `task`.
    const queued = previous.then(task, task);
    const settled = queued.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, settled);
    void settled.then(() => {
      // Only clear the tail if no newer task has already replaced it.
      if (this.tails.get(key) === settled) this.tails.delete(key);
    });
    return queued;
  }

  /** Whether a task is currently queued or running on the key. */
  isBusy(key: string): boolean {
    return this.tails.has(key);
  }
}
