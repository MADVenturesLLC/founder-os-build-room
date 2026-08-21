/**
 * §14 — real Keychain custody, on the real machine.
 *
 * This is the suite that verified the mechanism live on 2026-08-18, and it is
 * the only place the claims about `/usr/bin/security` are checked against
 * `/usr/bin/security` rather than against an emulator.
 *
 * It does NOT run in CI and does not run by accident. Two conditions must both
 * hold: the platform is darwin, and `BUILDROOM_CUSTODY_MACOS=1` is set — which
 * `npm run test:custody:macos` does and nothing else does. Touching a
 * developer's login Keychain because they typed `npm test` would be a
 * surprising thing for a test suite to do.
 *
 * The item is synthetic: a fixed service name that belongs to no real gateway,
 * a value that is not a key, and a delete in `after` whatever happens.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Custody, CustodyError, SecurityCommandRunner } from '../packages/gateway-daemon/src/index.js';

const OPTED_IN = process.env['BUILDROOM_CUSTODY_MACOS'] === '1';
const ON_DARWIN = process.platform === 'darwin';

const SKIP: string | false =
  !ON_DARWIN
    ? 'not darwin — the real-Keychain suite did not run'
    : !OPTED_IN
      ? 'BUILDROOM_CUSTODY_MACOS is not set — run `npm run test:custody:macos` to exercise the real Keychain'
      : false;

/**
 * A synthetic service, distinct from the product's own
 * (`com.madventures.buildroom.gateway`), so this suite can never read, write or
 * delete a real gateway's custody.
 */
const SYNTHETIC_SERVICE = 'com.madventures.buildroom.gateway.selftest';
const SYNTHETIC_VALUE = 'c3ludGhldGljLXRlc3QtdmFsdWUtbm90LWEta2V5';
const SYNTHETIC_SECOND = 'c3ludGhldGljLXNlY29uZC12YWx1ZS1ub3QtYS1rZXk';

const custody = new Custody(new SecurityCommandRunner(), SYNTHETIC_SERVICE);

async function clean(): Promise<void> {
  await custody.delete('staging').catch(() => undefined);
  await custody.delete('primary').catch(() => undefined);
}

before(async () => {
  if (SKIP !== false) return;
  await clean();
});

after(async () => {
  if (SKIP !== false) return;
  await clean();
});

describe('custody-macos · write-read-delete', { skip: SKIP }, () => {
  it('creates, reads back, and deletes a synthetic item unattended', async () => {
    await custody.createStaging(SYNTHETIC_VALUE);
    assert.equal(await custody.read('staging'), SYNTHETIC_VALUE, 'the value round-trips exactly');

    await custody.delete('staging');
    assert.equal(await custody.read('staging'), null, 'and is confirmed gone');
  });

  it('reports a missing item as absent rather than as a failure', async () => {
    assert.equal(await custody.read('primary'), null);
  });
});

describe('custody-macos · write-failure-exit-zero-detected-by-readback', { skip: SKIP }, () => {
  it('refuses to create over an existing staging item', async () => {
    await custody.createStaging(SYNTHETIC_VALUE);
    try {
      await assert.rejects(
        () => custody.createStaging(SYNTHETIC_SECOND),
        (error: unknown) => {
          // Asserted on the CLASSIFIED code, not on the tool's wording: the
          // message is `security`'s to change, and the classification is ours.
          assert.ok(error instanceof CustodyError, 'a classified custody error');
          assert.equal(error.code, 'write_unverified');
          return true;
        },
        'the no-U form must fail on an existing item',
      );
      assert.equal(await custody.read('staging'), SYNTHETIC_VALUE, 'the original survives');
    } finally {
      await custody.delete('staging');
    }
  });
});

describe('custody-macos · promotion-order', { skip: SKIP }, () => {
  it('promotes staging into primary and deletes staging only after verification', async () => {
    await custody.createStaging(SYNTHETIC_VALUE);
    await custody.promoteStagingToPrimary();

    assert.equal(await custody.read('primary'), SYNTHETIC_VALUE, 'primary holds the promoted value');
    assert.equal(await custody.read('staging'), null, 'staging is deleted only after verification');
  });

  it('replaces a prior primary, which is the honest description of -U', async () => {
    await custody.createStaging(SYNTHETIC_SECOND);
    await custody.promoteStagingToPrimary();
    assert.equal(await custody.read('primary'), SYNTHETIC_SECOND, 'the prior primary is replaced');
  });
});

describe('custody-macos · refusal-vs-transport-classification', { skip: SKIP }, () => {
  it('classifies a missing item distinctly from an unavailable Keychain', async () => {
    await clean();
    // Missing is null, not a throw. An unavailable Keychain would throw with
    // `keychain_unavailable`, which cannot be provoked here without breaking
    // the developer's session — and is covered by the fault-injected suite.
    assert.equal(await custody.read('staging'), null);
    assert.deepEqual(await custody.inventory(), { primary: false, staging: false });
  });
});

describe('custody-macos · existing-item-with-large-stdin', { skip: SKIP }, () => {
  it('classifies the refusal without the stdin write crashing on the dead child (correction 5, #8)', async () => {
    /*
     * The no-`-U` staging create is stdin-fed, and a refusal exits early —
     * before draining stdin. With a payload far beyond the pipe buffer, that
     * write is exactly the EPIPE that escaped as an uncaughtException before
     * correction 5 and killed the enrolment process. Here it meets the REAL
     * binary: the refusal must still be the classified `write_unverified`,
     * never a crash.
     */
    await custody.createStaging(SYNTHETIC_VALUE);
    try {
      const large = 'x'.repeat(2 * 1024 * 1024); // synthetic, and visibly not a key
      await assert.rejects(
        () => custody.createStaging(large),
        (error: unknown) => {
          assert.ok(error instanceof CustodyError, 'a classified custody error');
          assert.equal(error.code, 'write_unverified');
          return true;
        },
        'the existing-item refusal must reject, never crash the process',
      );
      assert.equal(await custody.read('staging'), SYNTHETIC_VALUE, 'the original survives');
    } finally {
      await custody.delete('staging');
    }
  });
});
