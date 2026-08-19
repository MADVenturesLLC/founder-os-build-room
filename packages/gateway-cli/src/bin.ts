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
} from '../../gateway-daemon/src/index.js';
import { runDoctor, renderDoctor } from './doctor.js';
import { runEnroll } from './enroll.js';
import { runProviders, runStatus, runTail } from './commands.js';
import { DAEMON_ENTRY, offerDaemonStart, spawnDaemonDetached } from './offer.js';
import { USAGE, isVerb } from './verbs.js';

async function readCodeFromStdin(): Promise<string> {
  const rl = createInterface({ input: process.stdin, terminal: false });
  try {
    for await (const line of rl) return line;
    return '';
  } finally {
    rl.close();
  }
}

/** The offer's answer comes from stdin like the pairing code does. */
async function readAnswerFromStdin(): Promise<string> {
  return readCodeFromStdin();
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
  const baseUrl = process.env['BUILDROOM_CONTROL_PLANE_URL'] ?? 'http://127.0.0.1:8080';
  const client = new ControlPlaneClient(baseUrl);

  switch (verb) {
    case 'enroll': {
      process.stdout.write('pairing code: ');
      const result = await runEnroll({
        paths,
        custody,
        client,
        clock,
        state,
        readCode: readCodeFromStdin,
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
        readAnswer: readAnswerFromStdin,
        print: (line) => process.stdout.write(line),
        spawnDaemon: spawnDaemonDetached,
        daemonEntry: DAEMON_ENTRY,
      });
      return 0;
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
