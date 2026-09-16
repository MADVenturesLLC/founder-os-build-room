/**
 * The `sun_path` boundary, tested at the boundary.
 *
 * `assertSocketPathFits` is exported public API and the lifecycle suite now
 * depends on it to choose a temp base, so the rule it enforces is worth
 * pinning directly rather than only through a daemon that spawns. The cases
 * are the ones that actually bite: the exact limit (the NUL makes it one byte
 * tighter than it reads), and a byte/character divergence.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUN_PATH_MAX, assertSocketPathFits, ipcRequest } from '../packages/gateway-daemon/src/index.js';

const under = `/${'a'.repeat(SUN_PATH_MAX - 2)}`;
const exact = `/${'a'.repeat(SUN_PATH_MAX - 1)}`;

describe('sun_path guard', () => {
  it('states the platform limit: 108 only on Linux, the conservative 104 elsewhere', () => {
    assert.equal(SUN_PATH_MAX, process.platform === 'linux' ? 108 : 104);
  });

  it('accepts the longest usable path — one byte under the field, leaving room for the NUL', () => {
    assert.equal(Buffer.byteLength(under), SUN_PATH_MAX - 1);
    assert.doesNotThrow(() => {
      assertSocketPathFits(under);
    });
  });

  it('refuses a path that exactly fills the field, because the NUL would not fit', () => {
    assert.equal(Buffer.byteLength(exact), SUN_PATH_MAX);
    assert.throws(() => {
      assertSocketPathFits(exact);
    }, /does not fit the \d+-byte sun_path limit/);
  });

  it('names the offending path and both lengths, so the message is actionable alone', () => {
    const tooLong = `/${'b'.repeat(SUN_PATH_MAX + 40)}`;
    assert.throws(
      () => {
        assertSocketPathFits(tooLong);
      },
      (error: unknown) => {
        const message = (error as Error).message;
        assert.match(message, new RegExp(`is ${String(Buffer.byteLength(tooLong))} bytes`));
        assert.match(message, new RegExp(`${String(SUN_PATH_MAX)}-byte sun_path limit`));
        assert.match(message, new RegExp(`longest usable path is ${String(SUN_PATH_MAX - 1)} bytes`));
        assert.ok(message.endsWith(tooLong), 'the path itself must appear in the message');
        return true;
      },
    );
  });

  it('measures bytes, not characters — a path under the limit in characters can still overflow', () => {
    // Each of these is one character and two UTF-8 bytes, so half the limit
    // in characters is comfortably short by a character count, and over the
    // field by the only count that matters.
    const multibyte = `/${'\u00e9'.repeat(Math.floor(SUN_PATH_MAX / 2))}`;
    assert.ok(multibyte.length < SUN_PATH_MAX, 'fewer characters than the limit');
    assert.ok(Buffer.byteLength(multibyte) > SUN_PATH_MAX, 'more bytes than the limit');
    assert.throws(() => {
      assertSocketPathFits(multibyte);
    });
  });

  it('ipcRequest reports the length as the reason instead of the false "daemon not running"', async () => {
    const result = await ipcRequest(exact, { op: 'status' }, 200);
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.match(result.reason, /sun_path limit/);
    assert.notEqual(result.reason, 'daemon not running');
  });
});
