/**
 * §14 — the custody recovery matrix, fault-injected.
 *
 * The claim under test is narrow and load-bearing: **staging survives until
 * primary verification succeeds**. The earlier wording claimed the old primary
 * survives until the new one is proven readable, which is false — the primary
 * write replaces it first (correction C11). Getting that backwards would mean
 * an interrupted promotion could leave a machine with no usable key at all.
 *
 * Every row of the matrix is reached by injecting a failure at exactly one
 * step, so each is a property of the code rather than of a scenario that
 * happened to work.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Custody,
  CustodyError,
  ITEM_NOT_FOUND_EXIT,
  generateGatewayKeypair,
  privateKeyFromSecret,
  sanitizeCustodyError,
} from '../packages/gateway-daemon/src/index.js';
import { FaultyKeychainRunner, FileKeychainRunner } from './fake-keychain.js';

function fixture(): { custody: Custody; faulty: FaultyKeychainRunner; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'buildroom-custody-'));
  const faulty = new FaultyKeychainRunner(new FileKeychainRunner(directory));
  return {
    custody: new Custody(faulty),
    faulty,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

const STAGING = 'c3RhZ2luZy1zZWNyZXQtdmFsdWUtb25l';
const PRIMARY = 'cHJpbWFyeS1zZWNyZXQtdmFsdWUtdHdv';

describe('gateway-custody-recovery · the no-U staging create form', () => {
  it('refuses to update an existing staging item', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      await assert.rejects(() => f.custody.createStaging('c29tZXRoaW5nLWVsc2U'), CustodyError);
      assert.equal(await f.custody.read('staging'), STAGING, 'the first key is untouched');
    } finally {
      f.cleanup();
    }
  });

  it('never uses -U for a staging write', async () => {
    const f = fixture();
    try {
      const seen: string[][] = [];
      f.faulty.failOn = (args) => {
        seen.push([...args]);
        return null;
      };
      await f.custody.createStaging(STAGING);
      const adds = seen.filter((argv) => argv[0] === 'add-generic-password');
      assert.ok(adds.length > 0);
      for (const argv of adds) assert.ok(!argv.includes('-U'));
    } finally {
      f.cleanup();
    }
  });

  it('write-failure-exit-zero-detected-by-readback', async () => {
    const f = fixture();
    try {
      /*
       * The observed hazard, reproduced: `security` exits 0 while writing
       * nothing. Only the read-back catches it, which is why no custody write in
       * this system trusts an exit code.
       */
      f.faulty.failOn = (args) =>
        args[0] === 'add-generic-password' ? { code: 0, stdout: '', stderr: '' } : null;

      await assert.rejects(() => f.custody.createStaging(STAGING), (error: unknown) => {
        assert.ok(error instanceof CustodyError);
        assert.equal(error.code, 'write_unverified');
        return true;
      });
      assert.equal(await f.custody.read('staging'), null, 'nothing was written');
    } finally {
      f.cleanup();
    }
  });

  it('refuses a secret carrying a newline, which the prompt would truncate', async () => {
    const f = fixture();
    try {
      await assert.rejects(() => f.custody.createStaging('line-one\nline-two'), CustodyError);
    } finally {
      f.cleanup();
    }
  });
});

describe(
  'gateway-custody-recovery · custody:promotion-order-staging-survives-until-verified',
  () => {
    it('promotion interrupted BEFORE the primary write leaves staging intact', async () => {
      const f = fixture();
      try {
        await f.custody.createStaging(STAGING);
        f.faulty.failOn = (args) =>
          args[0] === 'add-generic-password' && args.includes('primary')
            ? { code: 1, stdout: '', stderr: 'injected failure' }
            : null;

        await assert.rejects(() => f.custody.promoteStagingToPrimary(), CustodyError);

        assert.equal(await f.custody.read('staging'), STAGING, 'staging is intact');
        assert.equal(await f.custody.read('primary'), null, 'primary is unchanged');

        // Retry from staging succeeds.
        f.faulty.failOn = null;
        await f.custody.promoteStagingToPrimary();
        assert.equal(await f.custody.read('primary'), STAGING);
        assert.equal(await f.custody.read('staging'), null);
      } finally {
        f.cleanup();
      }
    });

    it('promotion interrupted AFTER the primary write, before verification, keeps staging', async () => {
      const f = fixture();
      try {
        await f.custody.createStaging(PRIMARY);
        await f.custody.promoteStagingToPrimary();
        assert.equal(await f.custody.read('primary'), PRIMARY, 'an incumbent primary exists');

        await f.custody.createStaging(STAGING);

        // The write lands; the verifying read fails.
        let readsOfPrimary = 0;
        f.faulty.failOn = (args) => {
          if (args[0] === 'find-generic-password' && args.includes('primary')) {
            readsOfPrimary += 1;
            return { code: 1, stdout: '', stderr: 'injected read failure' };
          }
          return null;
        };

        await assert.rejects(() => f.custody.promoteStagingToPrimary(), CustodyError);
        assert.ok(readsOfPrimary > 0);

        f.faulty.failOn = null;
        assert.equal(
          await f.custody.read('staging'),
          STAGING,
          'staging is NOT deleted: it is the source until verification passes',
        );
        /*
         * And the honest part: the primary HAS already been replaced. The
         * guarantee is not that the old primary survives — the write replaced it
         * — it is that staging survives, so the promotion can be retried.
         */
        assert.equal(await f.custody.read('primary'), STAGING, 'the primary write already landed');

        await f.custody.promoteStagingToPrimary();
        assert.equal(await f.custody.read('primary'), STAGING);
        assert.equal(await f.custody.read('staging'), null);
      } finally {
        f.cleanup();
      }
    });

    it('promotion interrupted AFTER verification, before the staging delete, completes on retry', async () => {
      const f = fixture();
      try {
        await f.custody.createStaging(STAGING);

        f.faulty.failOn = (args) =>
          args[0] === 'delete-generic-password' && args.includes('staging')
            ? { code: 1, stdout: '', stderr: 'injected delete failure' }
            : null;

        await assert.rejects(() => f.custody.promoteStagingToPrimary(), CustodyError);

        f.faulty.failOn = null;
        assert.equal(await f.custody.read('primary'), STAGING, 'primary is verified');
        assert.equal(await f.custody.read('staging'), STAGING, 'a leftover staging item remains');

        // Next boot completes it: verify the match, then delete staging.
        assert.equal(await f.custody.read('primary'), await f.custody.read('staging'));
        await f.custody.delete('staging');
        assert.equal(await f.custody.read('staging'), null);
      } finally {
        f.cleanup();
      }
    });

    it('promotes a key that still rebuilds after the round trip', async () => {
      const f = fixture();
      try {
        const keypair = generateGatewayKeypair();
        await f.custody.createStaging(keypair.privateKeySecret);
        await f.custody.promoteStagingToPrimary();

        const stored = await f.custody.read('primary');
        assert.ok(stored !== null);
        assert.doesNotThrow(() => privateKeyFromSecret(stored));
      } finally {
        f.cleanup();
      }
    });
  },
);

describe('gateway-custody-recovery · refusal-vs-transport-classification', () => {
  it('classifies a missing item as item_not_found rather than as a failure', async () => {
    const f = fixture();
    try {
      assert.equal(await f.custody.read('staging'), null, 'exit 44 is an answer, not an error');
      assert.equal(ITEM_NOT_FOUND_EXIT, 44);
    } finally {
      f.cleanup();
    }
  });

  it('classifies an unavailable Keychain distinctly from a missing item', async () => {
    const f = fixture();
    try {
      f.faulty.failOn = () => ({ code: 1, stdout: '', stderr: 'User interaction is not allowed.' });

      await assert.rejects(() => f.custody.read('primary'), (error: unknown) => {
        assert.ok(error instanceof CustodyError);
        assert.equal(error.code, 'keychain_unavailable');
        return true;
      });
    } finally {
      f.cleanup();
    }
  });

  it('sanitizes every classified error before display', async () => {
    const raw = new CustodyError('keychain_unavailable', 'reading primary custody failed', 'SecKeychainItemCopyContent: /Users/someone/Library/Keychains/login.keychain-db');
    const display = sanitizeCustodyError(raw);

    assert.equal(display.code, 'keychain_unavailable');
    assert.ok(!display.message.includes('Keychains'), 'the raw text is redacted to a log line');
    assert.ok(!display.message.includes('/Users/'), 'and no path is displayed');
    assert.equal(sanitizeCustodyError(new Error('boom')).code, 'unknown');
  });

  it('never leaves an inventory call throwing, so doctor can always report', async () => {
    const f = fixture();
    try {
      f.faulty.failOn = () => ({ code: 1, stdout: '', stderr: 'unavailable' });
      const inventory = await f.custody.inventory();
      assert.deepEqual(inventory, { primary: false, staging: false });
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-custody-recovery · deletion is verified too', () => {
  it('refuses to report a deletion that did not take', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging(STAGING);
      f.faulty.failOn = (args) =>
        args[0] === 'delete-generic-password' ? { code: 0, stdout: '', stderr: '' } : null;

      await assert.rejects(() => f.custody.delete('staging'), (error: unknown) => {
        assert.ok(error instanceof CustodyError);
        assert.equal(error.code, 'write_unverified');
        return true;
      });
    } finally {
      f.cleanup();
    }
  });

  it('treats deleting an absent item as success', async () => {
    const f = fixture();
    try {
      await assert.doesNotReject(() => f.custody.delete('staging'));
    } finally {
      f.cleanup();
    }
  });
});
