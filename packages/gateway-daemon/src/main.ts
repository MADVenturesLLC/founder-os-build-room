/**
 * The daemon's executable entry point (contract §15, §16; correction B4, Rev
 * 4.7 tester).
 *
 * The delivered package exported `GatewayDaemon` but declared no executable,
 * so no production code ever constructed, booted, started, or signal-stopped
 * it — without a hand-written host program, the staging lane never probed,
 * promotion never occurred, and heartbeats never started. This file is the
 * composition root that closes that gap, and it is deliberately the ONLY place
 * the real wiring exists.
 *
 * It constructs the REAL collaborators and nothing injectable: the fixed
 * documented paths, the real clock, `/usr/bin/security` custody (no
 * environment variable selects a different custody backend, and there is no
 * plaintext-file fallback — ruling clause 2), and the real control-plane
 * client. Suites that need seams construct `GatewayDaemon` themselves with
 * their own collaborators; production carries no test seam.
 *
 * §16 starts this entry detached after a successful enrolment (the CLI's
 * post-enrolment offer); a human runs it the same way. Shutdown is
 * signal-driven: SIGTERM or SIGINT stop the cadence timer, close and unlink
 * the IPC socket, and exit 0 — the daemon holds no server-side lease to
 * release, so there is nothing else it owes anyone on the way out.
 */

import { GatewayDaemon } from './daemon.js';
import { ControlPlaneClient } from './client.js';
import { Custody, SecurityCommandRunner } from './custody.js';
import { createDaemonClock } from './clock.js';
import { gatewayPaths } from './paths.js';

/** The heartbeat cadence §15 drives both lanes at (10 s). */
const HEARTBEAT_CADENCE_MS = 10_000;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<number> {
  const daemon = new GatewayDaemon({
    paths: gatewayPaths(),
    clock: createDaemonClock(),
    custody: new Custody(new SecurityCommandRunner()),
    client: new ControlPlaneClient(
      process.env['BUILDROOM_CONTROL_PLANE_URL'] ?? 'http://127.0.0.1:8080',
    ),
    heartbeatCadenceMs: HEARTBEAT_CADENCE_MS,
  });

  let stopping = false;
  const stop = (): void => {
    if (stopping) return; // A second signal during shutdown changes nothing.
    stopping = true;
    void daemon.stop().then(
      () => {
        process.exit(0);
      },
      (error: unknown) => {
        process.stderr.write(`daemon shutdown failed: ${describe(error)}\n`);
        process.exit(1);
      },
    );
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  await daemon.boot();
  daemon.start();
  // The IPC listener holds the event loop open; the cadence timer is unref'd
  // so a healthy daemon lives exactly as long as its socket.
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`daemon failed to start: ${describe(error)}\n`);
    process.exitCode = 1;
  });
