/**
 * L0 — the process-local session-state serialization boundary (contract §7,
 * §13, correction Requirement A).
 *
 * The database fence is released by COMMIT, and the in-memory publication that
 * follows a commit happens after that. Without a second boundary a concurrent
 * request can take the fence in exactly that gap, observe the same nonce or the
 * same sequence as absent, and accept a duplicate — the durable side is
 * serialized and the memory side is not. L0 closes the gap by spanning the
 * whole operation: taken before nonce, cursor or liveness state is read or
 * staged, held across the fenced transaction, and released only after every
 * staged effect has been applied.
 *
 * It is a queue rather than a flag, so waiters resume in arrival order and no
 * request can be starved by a stream of newcomers.
 */

export type Release = () => void;

export class Mutex {
  private tail: Promise<void> = Promise.resolve();
  private held = false;
  private waiting = 0;

  /** True while some holder has not yet released. Diagnostics only. */
  get isHeld(): boolean {
    return this.held;
  }

  /** Number of callers queued behind the current holder. Diagnostics only. */
  get queueDepth(): number {
    return this.waiting;
  }

  async acquire(): Promise<Release> {
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });

    const ahead = this.tail;
    this.tail = ahead.then(() => mine);

    this.waiting += 1;
    try {
      await ahead;
    } finally {
      this.waiting -= 1;
    }
    this.held = true;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.held = false;
      release();
    };
  }

  /** Run `fn` under the lock, releasing on every path including a throw. */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
