/**
 * A child process that runs `runEnroll` with test collaborators.
 *
 * This exists because the property under test in
 * `enroll:two-concurrent-invocations-exactly-one-writes-staging` is what
 * happens between TWO PROCESSES contending on a real `wx` lock file. A
 * single-process test with two promises would exercise a different mechanism
 * entirely and would pass whether or not the lock worked.
 *
 * The production entrypoint (`packages/gateway-cli/src/bin.ts`) constructs the
 * real Keychain runner and the real paths. This harness injects the file-backed
 * runner instead, so the seam is in the test tree rather than in shipped code.
 */

import { arch, platform } from 'node:os';
import { createInterface } from 'node:readline';
import {
  ControlPlaneClient,
  Custody,
  GatewayStateStore,
  createDaemonClock,
  gatewayPaths,
} from '../../packages/gateway-daemon/src/index.js';
import { runEnroll } from '../../packages/gateway-cli/src/index.js';
import { FileKeychainRunner } from '../fake-keychain.js';

async function readLine(): Promise<string> {
  const rl = createInterface({ input: process.stdin, terminal: false });
  try {
    for await (const line of rl) return line;
    return '';
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const directory = required('BUILDROOM_TEST_DIR');
  const keychainDirectory = required('BUILDROOM_TEST_KEYCHAIN');
  const baseUrl = required('BUILDROOM_TEST_URL');
  const code = required('BUILDROOM_TEST_CODE');

  const paths = gatewayPaths(directory);
  const custody = new Custody(new FileKeychainRunner(keychainDirectory));
  const state = new GatewayStateStore(paths);
  // A widened request bound: the concurrency test's winner is held mid-redeem
  // by the stub server's gate while the loser is admitted and refused, and
  // that coordination must not race the production 5 s bound.
  const client = new ControlPlaneClient(baseUrl, undefined, 30_000);

  // A deterministic barrier: both children block here until the parent writes
  // to stdin, so neither can win merely by starting first.
  await readLine();

  const result = await runEnroll({
    paths,
    custody,
    client,
    clock: createDaemonClock(),
    state,
    readCode: async () => code,
    hostDescriptor: { hostname: 'example-host.test', os: platform(), arch: arch() },
    print: () => undefined,
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

await main();
