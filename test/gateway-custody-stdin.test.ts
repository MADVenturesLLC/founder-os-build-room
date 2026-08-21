/**
 * §15 (correction 5, review finding #8) — a custody child that exits without
 * reading its stdin must stay a classified result.
 *
 * The no-`-U` staging create is the live trigger: when the item already
 * exists, `/usr/bin/security` exits 45 immediately without draining the
 * password it was about to be handed, and the pending `stdin.write` surfaces
 * as EPIPE. Nothing listened for it, so the error escaped the runner as an
 * uncaught exception — the outcome is decided by the exit code and the
 * read-back verification, and the stdin stream's own lifetime must never
 * outrank that verdict.
 *
 * `/usr/bin/false` models the child faithfully: it exits nonzero at once and
 * never reads. The stdin payload is far past any pipe buffer, so the write can
 * never complete synchronously — the EPIPE is forced, not raced.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SecurityCommandRunner } from '../packages/gateway-daemon/src/custody.js';

describe('gateway-custody · a child that exits without reading stdin', () => {
  it('run:reports-the-exit-code-instead-of-crashing-on-stdin-EPIPE', async () => {
    const runner = new SecurityCommandRunner('/usr/bin/false');
    const result = await runner.run(
      ['add-generic-password', '-a', 'staging', '-s', 'com.madventures.buildroom.gateway', '-w'],
      `${'x'.repeat(1 << 20)}\n${'x'.repeat(1 << 20)}\n`,
    );
    assert.equal(result.code, 1, 'the exit code is the verdict; the stdin EPIPE never escapes the runner');
  });
});
