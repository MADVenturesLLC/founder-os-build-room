/**
 * Real `systemd-creds` custody, on the real machine (Linux Gateway design
 * note §3.3; Founder act FOUNDER-ACT-20261012-BR-LINUX-GATEWAY-IMPLEMENTATION
 * B3.5, B4).
 *
 * This is the only place the Linux backend's claims are checked against
 * `/usr/bin/systemd-creds`, the host key and the TPM, rather than against the
 * emulator. It runs at certification, on the PC.
 *
 * It never touches real custody, on the real-Keychain suite's pattern:
 *   - it does NOT run in CI and does not run by accident: the platform must be
 *     linux and `BUILDROOM_CUSTODY_LINUX=1` must be set, which
 *     `npm run test:custody:linux` does and nothing else does;
 *   - its custody directory is a fresh temporary directory, mode 0700, never
 *     the Gateway directory, and it refuses to start if that directory
 *     resolves inside the real Gateway directory;
 *   - its credential names are synthetic (`selftest-primary`,
 *     `selftest-staging`, `selftest-probe`), never `primary`, `staging` or
 *     `hmac-v1`, and its values are not keys;
 *   - it removes its directory in `after`, whatever happens.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import {
  CustodyError,
  SystemdCredsCommandRunner,
  SystemdCredsCustody,
  defaultGatewayDirectory,
} from '../packages/gateway-daemon/src/index.js';

const OPTED_IN = process.env['BUILDROOM_CUSTODY_LINUX'] === '1';
const ON_LINUX = process.platform === 'linux';

const SKIP: string | false = !ON_LINUX
  ? 'not linux — the real systemd-creds suite did not run'
  : !OPTED_IN
    ? 'BUILDROOM_CUSTODY_LINUX is not set — run `npm run test:custody:linux` to exercise real systemd-creds'
    : false;

/** A name prefix that belongs to no real Gateway item. */
const SYNTHETIC_PREFIX = 'selftest-';
const SYNTHETIC_VALUE = 'c3ludGhldGljLXRlc3QtdmFsdWUtbm90LWEta2V5';
const SYNTHETIC_SECOND = 'c3ludGhldGljLXNlY29uZC12YWx1ZS1ub3QtYS1rZXk';

let root = '';
let directory = '';
let custody: SystemdCredsCustody;

function insideRealGateway(candidate: string): boolean {
  let gateway: string;
  try {
    gateway = realpathSync(defaultGatewayDirectory());
  } catch {
    gateway = defaultGatewayDirectory();
  }
  const from = relative(gateway, realpathSync(candidate));
  return from === '' || (!from.startsWith('..') && !from.startsWith(sep));
}

before(() => {
  if (SKIP !== false) return;
  root = mkdtempSync(join(tmpdir(), 'buildroom-custody-linux-'));
  assert.equal(insideRealGateway(root), false, 'the suite refuses a directory inside the real Gateway directory');
  directory = join(root, 'custody');
  custody = new SystemdCredsCustody(new SystemdCredsCommandRunner(), directory, SYNTHETIC_PREFIX);
});

after(() => {
  if (root !== '') rmSync(root, { recursive: true, force: true });
});

describe('custody-linux · the backend works on this machine', { skip: SKIP }, () => {
  it('probes by a real round trip, writing nothing', async () => {
    await custody.probe();
    assert.equal(readdirSync(root).length, 0, 'the probe created nothing');
  });

  it('creates, reads back, and deletes a synthetic item', async () => {
    await custody.createStaging(SYNTHETIC_VALUE);
    assert.equal(await custody.read('staging'), SYNTHETIC_VALUE, 'the value round-trips exactly');
    const file = join(directory, `${SYNTHETIC_PREFIX}staging.cred`);
    assert.ok(!readFileSync(file, 'utf8').includes(SYNTHETIC_VALUE), 'only ciphertext is on disk');
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    await custody.delete('staging');
    assert.equal(await custody.read('staging'), null, 'and is confirmed gone');
  });

  it('reports a missing item as absent rather than as a failure', async () => {
    assert.equal(await custody.read('primary'), null);
    assert.deepEqual(await custody.inventory(), { primary: false, staging: false });
  });
});

describe('custody-linux · staging is never overwritten', { skip: SKIP }, () => {
  it('refuses to create over an existing staging item', async () => {
    await custody.createStaging(SYNTHETIC_VALUE);
    try {
      await assert.rejects(
        () => custody.createStaging(SYNTHETIC_SECOND),
        (error: unknown) => {
          assert.ok(error instanceof CustodyError, 'a classified custody error');
          assert.equal(error.code, 'write_unverified');
          return true;
        },
      );
      assert.equal(await custody.read('staging'), SYNTHETIC_VALUE, 'the original survives');
    } finally {
      await custody.delete('staging');
    }
  });
});

describe('custody-linux · promotion order', { skip: SKIP }, () => {
  it('promotes staging into primary and deletes staging only after verification', async () => {
    await custody.createStaging(SYNTHETIC_VALUE);
    await custody.promoteStagingToPrimary();
    assert.equal(await custody.read('primary'), SYNTHETIC_VALUE);
    assert.equal(await custody.read('staging'), null);
  });

  it('replaces a prior primary', async () => {
    await custody.createStaging(SYNTHETIC_SECOND);
    await custody.promoteStagingToPrimary();
    assert.equal(await custody.read('primary'), SYNTHETIC_SECOND);
    await custody.delete('primary');
  });
});

describe('custody-linux · the sealed name is checked', { skip: SKIP }, () => {
  it('refuses a credential copied under another item name', async () => {
    await custody.createStaging(SYNTHETIC_VALUE);
    try {
      const sealed = readFileSync(join(directory, `${SYNTHETIC_PREFIX}staging.cred`));
      const { writeFileSync } = await import('node:fs');
      writeFileSync(join(directory, `${SYNTHETIC_PREFIX}primary.cred`), sealed, { mode: 0o600 });
      await assert.rejects(
        () => custody.read('primary'),
        (error: unknown) => error instanceof CustodyError && error.code === 'keychain_unavailable',
      );
    } finally {
      await custody.delete('primary');
      await custody.delete('staging');
    }
  });
});
