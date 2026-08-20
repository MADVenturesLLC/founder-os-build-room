/**
 * The daemon's in-memory ring buffer, read by `buildroom tail` over IPC.
 *
 * Bounded by construction: the daemon runs for weeks and an unbounded log in a
 * long-lived process is a memory leak with a plausible excuse. Entries carry
 * classified codes and lane states — never secrets, never raw tool output.
 */

export interface RingEntry {
  readonly at: string;
  readonly level: 'info' | 'warn' | 'error';
  readonly at_: string;
  readonly fields: Record<string, unknown>;
}

export const RING_CAPACITY = 500;

export class RingBuffer {
  private readonly entries: RingEntry[] = [];

  constructor(private readonly capacity: number = RING_CAPACITY) {}

  push(entry: RingEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
  }

  recent(limit = 50): readonly RingEntry[] {
    // A limit that is not a positive integer is a caller's bug, not a slice
    // instruction — `slice(-0)` and `slice(-NaN)` would both return the whole
    // buffer, so the default stands in instead.
    const sane = Number.isInteger(limit) && limit >= 1 ? Math.min(limit, this.capacity) : 50;
    return this.entries.slice(-sane);
  }

  get size(): number {
    return this.entries.length;
  }
}
