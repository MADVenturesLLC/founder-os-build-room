/**
 * Custody fails closed, on both backends (Linux Gateway design note §4.5;
 * Founder act FOUNDER-ACT-20261012-BR-LINUX-GATEWAY-IMPLEMENTATION B3.2).
 *
 * Before this change `inventory()` swallowed every error, so with custody
 * broken `doctor` printed "absent" and "error: none", and `enroll` read the
 * pairing code and generated a keypair before failing. Now an unusable backend
 * is reported by its code, and `enroll` refuses before it reads the code.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ControlPlaneClient,
  Custody,
  GatewayStateStore,
  SystemdCredsCustody,
  createDaemonClock,
  gatewayPaths,
  type GatewayCustody,
} from '../packages/gateway-daemon/src/index.js';
import { renderDoctor, runDoctor, runEnroll } from '../packages/gateway-cli/src/index.js';
import { FaultyKeychainRunner, FileKeychainRunner } from './fake-keychain.js';
import { FakeSystemdCredsRunner, UnavailableSystemdCredsRunner } from './fake-systemd-creds.js';

type Backend = 'keychain' | 'systemd-creds';

interface Fixture {
  readonly paths: ReturnType<typeof gatewayPaths>;
  readonly custody: GatewayCustody;
  readonly keychainArgv: () => readonly string[][];
  readonly cleanup: () => void;
}

function fixture(backend: Backend, broken: boolean): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-failclosed-'));
  const paths = gatewayPaths(join(root, 'gateway'));
  mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
  if (backend === 'keychain') {
    const file = new FileKeychainRunner(join(root, 'keychain'));
    const faulty = new FaultyKeychainRunner(file);
    if (broken) faulty.failOn = () => ({ code: 51, stdout: '', stderr: 'User interaction is not allowed.' });
    return {
      paths,
      custody: new Custody(faulty),
      keychainArgv: () => file.argvLog,
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
  }
  const runner = broken ? new UnavailableSystemdCredsRunner() : new FakeSystemdCredsRunner();
  return {
    paths,
    custody: new SystemdCredsCustody(runner, join(paths.directory, 'custody')),
    keychainArgv: () => [],
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const client = new ControlPlaneClient('http://127.0.0.1:1');

for (const backend of ['keychain', 'systemd-creds'] as const) {
  describe(`gateway-custody-fail-closed · ${backend}`, () => {
    it('doctor reports an unusable backend by its code, not as absent', async () => {
      const f = fixture(backend, true);
      try {
        const report = await runDoctor({ paths: f.paths, custody: f.custody, client, state: new GatewayStateStore(f.paths) });
        assert.equal(report.custody.error, 'keychain_unavailable');
        const rendered = renderDoctor(report);
        assert.match(rendered, /error: {8}keychain_unavailable/);
        assert.doesNotMatch(rendered, /: +absent$/m, 'no item is reported absent');
        assert.match(rendered, /primary item: unknown \(custody unavailable\)/);
        assert.match(rendered, /staging item: unknown \(custody unavailable\)/);
        assert.match(rendered, /keychain: +unknown \(custody unavailable\)/);
      } finally {
        f.cleanup();
      }
    });

    it('doctor reports no error when the backend works', async () => {
      const f = fixture(backend, false);
      try {
        const report = await runDoctor({ paths: f.paths, custody: f.custody, client, state: new GatewayStateStore(f.paths) });
        assert.equal(report.custody.error, null);
        assert.deepEqual({ primary: report.custody.primary, staging: report.custody.staging }, { primary: false, staging: false });
        assert.match(renderDoctor(report), /primary item: absent/);
      } finally {
        f.cleanup();
      }
    });

    it('enroll refuses before it reads the pairing code or generates a key', async () => {
      const f = fixture(backend, true);
      try {
        let codeRead = false;
        const result = await runEnroll({
          paths: f.paths,
          custody: f.custody,
          client,
          clock: createDaemonClock(),
          state: new GatewayStateStore(f.paths),
          readCode: async () => {
            codeRead = true;
            return 'ZmFrZS1jb2RlLWZvci10ZXN0aW5nLW9ubHktbm90LXJlYWw';
          },
          hostDescriptor: { hostname: 'example-host.test', os: process.platform, arch: 'x64' },
          print: () => undefined,
        });
        assert.equal(result.ok, false);
        assert.equal(!result.ok && result.code, 'keychain_unavailable');
        assert.equal(codeRead, false, 'the pairing code was never read');
        assert.ok(
          !f.keychainArgv().some((argv) => argv[0] === 'add-generic-password'),
          'no key was written',
        );
        const state = await new GatewayStateStore(f.paths).read();
        assert.equal(state.staging.lane, 'INACTIVE', 'no state was written');
      } finally {
        f.cleanup();
      }
    });
  });
}
