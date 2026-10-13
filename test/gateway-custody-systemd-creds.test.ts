/**
 * The Linux custody backend (`SystemdCredsCustody`) against the fake
 * `systemd-creds`, so every guarantee of the Linux Gateway design note §4.3 is
 * checked in CI on any host. The real tool is exercised by
 * `test/custody-linux.test.ts`, on the PC, at certification.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Custody,
  CustodyError,
  SYSTEMD_CREDS_KEY_MODE,
  SystemdCredsCustody,
  UnavailableCustody,
  custodyDirectory,
  defaultGatewayCustody,
  gatewayPaths,
} from '../packages/gateway-daemon/src/index.js';
import { FakeSystemdCredsRunner, FaultySystemdCredsRunner, UnavailableSystemdCredsRunner } from './fake-systemd-creds.js';

const STAGING = 'c3RhZ2luZy1zZWNyZXQtdmFsdWUtb25l';
const OTHER = 'b3RoZXItc2VjcmV0LXZhbHVlLXR3bw';

interface Fixture {
  readonly directory: string;
  readonly fake: FakeSystemdCredsRunner;
  readonly faulty: FaultySystemdCredsRunner;
  readonly custody: SystemdCredsCustody;
  readonly cleanup: () => void;
}

function fixture(namePrefix = ''): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-creds-'));
  const directory = join(root, 'custody');
  const fake = new FakeSystemdCredsRunner();
  const faulty = new FaultySystemdCredsRunner(fake);
  return {
    directory,
    fake,
    faulty,
    custody: new SystemdCredsCustody(faulty, directory, namePrefix),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function codeOf(error: unknown): string {
  assert.ok(error instanceof CustodyError, 'a classified custody error');
  return error.code;
}

describe('gateway-custody-systemd-creds · staging creation', () => {
  it('writes ciphertext only, mode 0600 in a 0700 directory, and reads it back', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      const file = join(f.directory, 'staging.cred');
      assert.ok(!readFileSync(file, 'utf8').includes(STAGING), 'no plaintext on disk');
      assert.equal(statSync(file).mode & 0o777, 0o600);
      assert.equal(statSync(f.directory).mode & 0o777, 0o700);
      assert.equal(await f.custody.read('staging'), STAGING);
    } finally {
      f.cleanup();
    }
  });

  it('fails when a staging item exists, and leaves the first untouched', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      await assert.rejects(() => f.custody.createStaging(OTHER), (error) => codeOf(error) === 'write_unverified');
      assert.equal(await f.custody.read('staging'), STAGING);
    } finally {
      f.cleanup();
    }
  });

  it('leaves no temporary file behind, on success or refusal', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      await f.custody.createStaging(OTHER).catch(() => undefined);
      assert.deepEqual(readdirSync(f.directory).sort(), ['staging.cred']);
    } finally {
      f.cleanup();
    }
  });

  it('refuses a write that does not read back', async () => {
    const f = fixture();
    try {
      f.faulty.failOn = (args) => (args.includes('decrypt') ? { code: 0, stdout: 'something else', stderr: '' } : null);
      await assert.rejects(() => f.custody.createStaging(STAGING), (error) => codeOf(error) === 'write_unverified');
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-custody-systemd-creds · promotion', () => {
  it('re-encrypts under the primary name, verifies, then deletes staging', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      await f.custody.promoteStagingToPrimary();
      assert.equal(await f.custody.read('primary'), STAGING);
      assert.equal(await f.custody.read('staging'), null);
      assert.ok(
        f.fake.argvLog.some((argv) => argv.includes('encrypt') && argv.includes('--name=primary')),
        'primary was sealed under its own name, not renamed from staging',
      );
    } finally {
      f.cleanup();
    }
  });

  it('keeps staging when primary does not read back', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      f.faulty.failOn = (args) =>
        args.includes('decrypt') && args.includes('--name=primary') ? { code: 0, stdout: 'wrong', stderr: '' } : null;
      await assert.rejects(() => f.custody.promoteStagingToPrimary(), (error) => codeOf(error) === 'write_unverified');
      f.faulty.failOn = null;
      assert.equal(await f.custody.read('staging'), STAGING, 'staging is retained for retry');
    } finally {
      f.cleanup();
    }
  });

  it('replaces a prior primary', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      await f.custody.promoteStagingToPrimary();
      await f.custody.createStaging(OTHER);
      await f.custody.promoteStagingToPrimary();
      assert.equal(await f.custody.read('primary'), OTHER);
    } finally {
      f.cleanup();
    }
  });

  it('refuses with item_not_found when there is no staging item', async () => {
    const f = fixture();
    try {
      await assert.rejects(() => f.custody.promoteStagingToPrimary(), (error) => codeOf(error) === 'item_not_found');
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-custody-systemd-creds · one-line secrets, as the Keychain backend', () => {
  it('refuses to create staging from a secret with a newline, and writes nothing', async () => {
    const f = fixture();
    try {
      for (const secret of [`${STAGING}\n${OTHER}`, `${STAGING}\r`]) {
        await assert.rejects(() => f.custody.createStaging(secret), (error) => codeOf(error) === 'write_unverified');
      }
      assert.equal(existsSync(join(f.directory, 'staging.cred')), false, 'no staging item');
      assert.ok(!f.fake.argvLog.some((argv) => argv.includes('encrypt')), 'nothing was even encrypted');
    } finally {
      f.cleanup();
    }
  });

  it('refuses to promote a staged secret with a newline, and keeps staging', async () => {
    const f = fixture();
    try {
      // A staging item written by something other than createStaging.
      const multiline = `${STAGING}\n${OTHER}`;
      const sealed = await f.fake.run(['--user', '--with-key=host+tpm2', '--name=staging', 'encrypt', '-', '-'], multiline);
      mkdirSync(f.directory, { recursive: true, mode: 0o700 });
      writeFileSync(join(f.directory, 'staging.cred'), sealed.stdout, { mode: 0o600 });
      await assert.rejects(() => f.custody.promoteStagingToPrimary(), (error) => codeOf(error) === 'write_unverified');
      assert.equal(existsSync(join(f.directory, 'primary.cred')), false, 'no primary was written');
      assert.equal(await f.custody.read('staging'), multiline, 'staging is retained');
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-custody-systemd-creds · read and delete', () => {
  it('reads a missing item as null', async () => {
    const f = fixture();
    try {
      assert.equal(await f.custody.read('primary'), null);
    } finally {
      f.cleanup();
    }
  });

  it('refuses a credential renamed to another item: the name is sealed inside it', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      copyFileSync(join(f.directory, 'staging.cred'), join(f.directory, 'primary.cred'));
      await assert.rejects(() => f.custody.read('primary'), (error) => codeOf(error) === 'keychain_unavailable');
    } finally {
      f.cleanup();
    }
  });

  it('verifies a deletion, and treats deleting a missing item as done', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      await f.custody.delete('staging');
      assert.equal(existsSync(join(f.directory, 'staging.cred')), false);
      await f.custody.delete('staging');
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-custody-systemd-creds · the secret never leaves stdin and stdout', () => {
  it('never puts a secret in argv, and always seals with host+tpm2 in --user scope', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      await f.custody.promoteStagingToPrimary();
      const flattened = JSON.stringify(f.fake.argvLog);
      assert.ok(!flattened.includes(STAGING), 'the secret is never in argv');
      for (const argv of f.fake.argvLog) {
        assert.ok(argv.includes('--user'), `--user in ${argv.join(' ')}`);
        if (argv.includes('encrypt')) {
          assert.ok(argv.includes(`--with-key=${SYSTEMD_CREDS_KEY_MODE}`), 'host+tpm2, never auto or null');
          assert.equal(SYSTEMD_CREDS_KEY_MODE, 'host+tpm2');
        }
      }
      assert.ok(f.fake.stdinLog.some((stdin) => stdin === STAGING), 'the secret went on stdin');
    } finally {
      f.cleanup();
    }
  });

  it('carries the tool stderr, never its stdout, in an error', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      f.faulty.failOn = (args) => (args.includes('decrypt') ? { code: 1, stdout: STAGING, stderr: 'refused' } : null);
      await assert.rejects(
        () => f.custody.read('staging'),
        (error) => {
          assert.ok(error instanceof CustodyError);
          assert.ok(!error.detail.includes(STAGING) && !error.message.includes(STAGING));
          return true;
        },
      );
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-custody-systemd-creds · probe and inventory fail closed', () => {
  it('probes by a round trip that writes nothing to disk', async () => {
    const f = fixture();
    try {
      await f.custody.probe();
      assert.equal(existsSync(f.directory), false, 'the probe created nothing');
    } finally {
      f.cleanup();
    }
  });

  it('reports an unusable backend as keychain_unavailable, never as absent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'buildroom-creds-'));
    try {
      const custody = new SystemdCredsCustody(new UnavailableSystemdCredsRunner(), join(root, 'custody'));
      await assert.rejects(() => custody.probe(), (error) => codeOf(error) === 'keychain_unavailable');
      await assert.rejects(() => custody.inventory(), (error) => codeOf(error) === 'keychain_unavailable');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('inventories what exists', async () => {
    const f = fixture();
    try {
      assert.deepEqual(await f.custody.inventory(), { primary: false, staging: false });
      await f.custody.createStaging(STAGING);
      assert.deepEqual(await f.custody.inventory(), { primary: false, staging: true });
    } finally {
      f.cleanup();
    }
  });

  it('keeps a prefixed suite apart from the Gateway items', async () => {
    const f = fixture('selftest-');
    try {
      await f.custody.createStaging(STAGING);
      assert.deepEqual(readdirSync(f.directory), ['selftest-staging.cred']);
      assert.ok(f.fake.argvLog.some((argv) => argv.includes('--name=selftest-staging')));
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-custody-systemd-creds · the factory', () => {
  it('chooses the backend by platform, and nothing else', async () => {
    const paths = gatewayPaths('/nonexistent/gateway');
    assert.ok(defaultGatewayCustody(paths, 'darwin') instanceof Custody);
    assert.ok(defaultGatewayCustody(paths, 'linux') instanceof SystemdCredsCustody);
    const other = defaultGatewayCustody(paths, 'win32');
    assert.ok(other instanceof UnavailableCustody);
    await assert.rejects(() => other.probe(), (error) => codeOf(error) === 'keychain_unavailable');
    await assert.rejects(() => other.inventory(), (error) => codeOf(error) === 'keychain_unavailable');
    assert.equal(custodyDirectory(paths), join('/nonexistent/gateway', 'custody'));
  });
});
