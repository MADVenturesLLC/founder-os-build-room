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
import { fileURLToPath } from 'node:url';

/** The shipped daemon executable, resolved next to this compiled module. */
export const DAEMON_ENTRY = fileURLToPath(new URL('../../gateway-daemon/src/main.js', import.meta.url));

export interface OfferDeps {
  /** Reads the answer line. EOF means "no" — silence never starts a daemon. */
  readonly readAnswer: () => Promise<string>;
  readonly print: (line: string) => void;
  /** The spawn, injectable so the suites assert the offer, not the OS. */
  readonly spawnDaemon: (entry: string) => { readonly ok: boolean; readonly reason?: string };
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

  const spawned = deps.spawnDaemon(deps.daemonEntry);
  if (!spawned.ok) {
    deps.print(`daemon failed to start: ${spawned.reason ?? 'unknown reason'}\n`);
    return false;
  }
  deps.print('daemon started (detached)\n');
  return true;
}

/** The real §16 spawn: detached, silenced, unreferenced. */
export function spawnDaemonDetached(entry: string): { readonly ok: boolean; readonly reason?: string } {
  try {
    const child = spawn(process.execPath, [entry], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
