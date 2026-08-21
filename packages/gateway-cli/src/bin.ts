#!/usr/bin/env node
/**
 * `buildroom` — the five-verb CLI (contract §16).
 *
 * The entrypoint constructs the REAL collaborators and nothing else: the
 * `/usr/bin/security` runner, the real clock, the documented paths. There is no
 * environment variable that selects a different custody backend and no
 * plaintext-file fallback — fail-closed custody means an unavailable Keychain
 * refuses the enrolment and `doctor` says why (ruling clause 2).
 *
 * Suites that need two real processes contending on the staging lock import
 * `runEnroll` and friends and inject their own collaborators, so the lock under
 * test is the real one and production carries no test seam.
 */

import { realpathSync } from 'node:fs';
import { arch, hostname, platform } from 'node:os';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import {
  ControlPlaneClient,
  Custody,
  GatewayStateStore,
  SecurityCommandRunner,
  createDaemonClock,
  gatewayPaths,
  validateControlPlaneUrl,
} from '../../gateway-daemon/src/index.js';
import { runDoctor, renderDoctor } from './doctor.js';
import { runEnroll } from './enroll.js';
import { runProviders, runStatus, runTail } from './commands.js';
import { DAEMON_ENTRY, offerDaemonStart, spawnDaemonDetached } from './offer.js';
import { USAGE, isVerb } from './verbs.js';

/**
 * Both enrolment reads — the pairing code, then the daemon-start answer — come
 * from ONE readline interface (correction 5, M5).
 *
 * A readline interface drops any input it has already buffered the moment it
 * closes, and leaving the loop after the first line closes it. A second
 * interface built for the second read therefore never sees the answer when the
 * input was piped (`printf 'code\ny\n' | buildroom enroll` reads the code,
 * discards the `y`, and the offer reads EOF, which means "no"). One interface,
 * closed only when the enrolment verb is done, hands both lines out in order.
 */
interface StdinLines {
  readLine(): Promise<string>;
  close(): void;
}

function openStdinLines(): StdinLines {
  const rl = createInterface({ input: process.stdin, terminal: false });
  const buffered: string[] = [];
  const waiters: Array<(line: string) => void> = [];
  let ended = false;
  rl.on('line', (line: string) => {
    const waiter = waiters.shift();
    if (waiter !== undefined) waiter(line);
    else buffered.push(line);
  });
  rl.on('close', () => {
    ended = true;
    for (const waiter of waiters.splice(0)) waiter('');
  });
  return {
    readLine: () =>
      new Promise<string>((resolve) => {
        if (buffered.length > 0) {
          resolve(buffered.shift() ?? '');
          return;
        }
        if (ended) {
          resolve('');
          return;
        }
        waiters.push(resolve);
      }),
    close: () => rl.close(),
  };
}

export async function main(argv: readonly string[]): Promise<number> {
  const verb = argv[0];
  if (verb === undefined || !isVerb(verb)) {
    process.stderr.write(USAGE);
    return 2;
  }

  const paths = gatewayPaths();
  const clock = createDaemonClock();
  const custody = new Custody(new SecurityCommandRunner());
  const state = new GatewayStateStore(paths);
  /*
   * (correction 5, finding #3) The plane URL is process configuration, and
   * hostile configuration is refused at the entry point for every verb rather
   * than trusted by whichever verb happens to build a client. Plain HTTP is
   * accepted only to loopback; anything else must say https.
   */
  const urlVerdict = validateControlPlaneUrl(
    process.env['BUILDROOM_CONTROL_PLANE_URL'] ?? 'http://127.0.0.1:8080',
  );
  if (!urlVerdict.ok) {
    process.stderr.write(`BUILDROOM_CONTROL_PLANE_URL refused: ${urlVerdict.reason}\n`);
    return 1;
  }
  const client = new ControlPlaneClient(urlVerdict.url);

  switch (verb) {
    case 'enroll': {
      const stdin = openStdinLines();
      try {
        process.stdout.write('pairing code: ');
        const result = await runEnroll({
          paths,
          custody,
          client,
          clock,
          state,
          readCode: () => stdin.readLine(),
          hostDescriptor: { hostname: hostname(), os: platform(), arch: arch() },
          print: (line) => process.stdout.write(`${line}\n`),
        });
        if (!result.ok) {
          process.stderr.write(`${result.code}: ${result.message}\n`);
          return 1;
        }
        // §16: offer the spawn-detached daemon start after a successful
        // enrolment (correction B4). An explicit yes starts the shipped entry
        // point; anything else — including EOF — starts nothing.
        await offerDaemonStart({
          readAnswer: () => stdin.readLine(),
          print: (line) => process.stdout.write(line),
          spawnDaemon: spawnDaemonDetached,
          daemonEntry: DAEMON_ENTRY,
        });
        return 0;
      } finally {
        stdin.close();
      }
    }
    case 'status': {
      const report = await runStatus({ paths, state });
      process.stdout.write(`${report.rendered}\n`);
      return 0;
    }
    case 'doctor': {
      process.stdout.write(`${renderDoctor(await runDoctor({ paths, custody, client, state }))}\n`);
      return 0;
    }
    case 'providers': {
      const refusal = runProviders();
      process.stderr.write(`${refusal.message}\n`);
      return refusal.exitCode;
    }
    case 'tail': {
      const result = await runTail({ paths });
      process.stdout.write(`${result.rendered}\n`);
      return result.exitCode;
    }
    default:
      process.stderr.write(USAGE);
      return 2;
  }
}

// The main-module guard. `import.meta.url` is always the entry's physical
// path, but `process.argv[1]` keeps the spelling the operator used — which may
// traverse a symlinked directory or be an npm-style executable symlink. The
// raw `file://${argv[1]}` template disagreed with those spellings and the CLI
// silently exited 0, so both sides are normalized: realpath resolves the
// invoked spelling to the physical entry, and the file-URL encoder matches
// `import.meta.url`'s encoding exactly.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
