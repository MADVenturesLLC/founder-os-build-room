/**
 * The post-enrolment daemon start offer (contract §16; correction B4, Rev 4.7
 * tester).
 *
 * §16 rules the shape exactly: after a successful enrolment the CLI "offers to
 * start the daemon (spawn-detach; launchd out of scope)". The delivered `bin`
 * exited immediately instead. The offer is a question, never an assumption —
 * a spawned daemon heartbeats from this machine, and starting it is the
 * operator's call.
 *
 * The spawn is detached and unreferenced: the enrolment process exits, the
 * daemon survives it, and the daemon's own lifecycle (IPC listener plus signal
 * handlers in its entry point) takes over from there.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The shipped daemon executable, resolved next to this compiled module. */
export const DAEMON_ENTRY = fileURLToPath(new URL('../../gateway-daemon/src/main.js', import.meta.url));

export interface OfferDeps {
  /** Reads the answer line. EOF means "no" — silence never starts a daemon. */
  readonly readAnswer: () => Promise<string>;
  readonly print: (line: string) => void;
  /** The spawn, injectable so the suites assert the offer, not the OS. */
  readonly spawnDaemon: (
    entry: string,
  ) => Promise<{ readonly ok: boolean; readonly reason?: string }>;
  readonly daemonEntry: string;
}

/** Offer §16's post-enrolment daemon start. True when a daemon was spawned. */
export async function offerDaemonStart(deps: OfferDeps): Promise<boolean> {
  deps.print('start the gateway daemon now? [y/N] ');
  const answer = (await deps.readAnswer()).trim().toLowerCase();
  if (answer !== 'y' && answer !== 'yes') {
    deps.print('daemon not started — run buildroom-gateway when you want it heartbeating\n');
    return false;
  }

  const spawned = await deps.spawnDaemon(deps.daemonEntry);
  if (!spawned.ok) {
    deps.print(`daemon failed to start: ${spawned.reason ?? 'unknown reason'}\n`);
    return false;
  }
  deps.print('daemon started (detached)\n');
  return true;
}

/** The spawn verdict: ok only once the child has actually spawned. */
export interface SpawnVerdict {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * One line of truth for what a spawn failure means to the operator — the
 * errno message ("spawn node ENOENT"), never a stack trace or internals.
 */
function spawnFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `daemon spawn failed: ${message}`;
}

/**
 * What spawnDaemonDetached needs from a spawned child, stated structurally so
 * the suites can hand it a child whose spawn outcome is fully scripted. The
 * case the contract cares about — an error that arrives after the spawn phase
 * — cannot be produced on demand by a real OS, so the seam is the only honest
 * way to control it (correction 7, finding A). The default is the real spawn.
 */
export interface DetachedDaemonChild {
  once(event: 'spawn', listener: () => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
  unref(): void;
}

/**
 * The real §16 spawn: detached, silenced, unreferenced.
 *
 * (correction 5, finding #6) A missing entry point is detected BEFORE the
 * spawn. With `stdio: 'ignore'` a failed exec surfaces only as an 'error'
 * event on the child, which nothing detached and unreferenced is listening
 * for — so the previous version answered `ok: true` for an entry that does
 * not exist, and the offer printed "daemon started" about nothing.
 *
 * (correction 6, finding 2) Correction 5 closed the missing-entry case, but a
 * spawn can still fail asynchronously AFTER the entry check passes — the
 * executable itself unspawnable (EMFILE, EAGAIN, ENOENT). `spawn()` reports
 * those only on the child's 'error' event, never by throwing.
 *
 * (correction 7, finding A) The tester rejected Correction 6's proxy for the
 * spawn outcome: one immediate callback inferred success from the ABSENCE of
 * an error, so a valid error arriving later than that callback was misread as
 * success, and `unref()` ran without a confirmed spawn. The verdict now waits
 * for the child's own signal and nothing else: Node emits exactly one of
 * 'spawn' (the successful spawn signal, v15.1.0+) or 'error' for the spawn
 * attempt, and the first of the two settles the verdict. No event-loop phase
 * is assumed, `unref()` runs only inside the 'spawn' arm, and the 'error'
 * listener stays attached for the child's lifetime so no ChildProcess error
 * can escape unhandled even after the verdict is returned.
 */
export async function spawnDaemonDetached(
  entry: string,
  spawnChild: (
    command: string,
    args: readonly string[],
    options: { detached: boolean; stdio: 'ignore'; env: NodeJS.ProcessEnv },
  ) => DetachedDaemonChild = spawn,
): Promise<SpawnVerdict> {
  if (!existsSync(entry)) {
    return { ok: false, reason: `daemon entry not found: ${entry}` };
  }
  let child: DetachedDaemonChild;
  try {
    child = spawnChild(process.execPath, [entry], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
  } catch (error) {
    return { ok: false, reason: spawnFailureReason(error) };
  }
  const failure = await new Promise<unknown | null>((resolve) => {
    child.once('spawn', () => resolve(null));
    child.once('error', (error) => resolve(error));
  });
  if (failure !== null) {
    return { ok: false, reason: spawnFailureReason(failure) };
  }
  child.unref();
  return { ok: true };
}
