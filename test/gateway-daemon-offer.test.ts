/**
 * §16 (correction B4, Rev 4.7 tester) — the post-enrolment daemon start offer.
 *
 * The delivered `bin.ts` exited immediately after a successful enrolment and
 * never offered what §16 rules: "offers to start the daemon (spawn-detach;
 * launchd out of scope)". These tests pin the offer's mechanics — it asks, it
 * spawns only on an explicit yes, a failure is reported rather than swallowed,
 * and the entry it spawns is the real shipped executable — while the lifecycle
 * suite proves that executable actually runs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DAEMON_ENTRY, offerDaemonStart } from '../packages/gateway-cli/src/index.js';

describe('gateway-cli · the §16 post-enrolment start offer', () => {
  it('offer:an-explicit-yes-spawns-the-daemon-entry', async () => {
    const spawned: string[] = [];
    const started = await offerDaemonStart({
      readAnswer: async () => 'y',
      print: () => undefined,
      spawnDaemon: (entry) => {
        spawned.push(entry);
        return { ok: true };
      },
      daemonEntry: '/resolved/daemon-entry.js',
    });

    assert.equal(started, true);
    assert.deepEqual(spawned, ['/resolved/daemon-entry.js'], 'exactly one spawn of the entry');
  });

  it('offer:a-capitalised-yes-with-a-carriage-return-is-still-an-explicit-yes', async () => {
    // A terminal in CRLF mode sends "Y\r"; trim already handles the CR.
    const started = await offerDaemonStart({
      readAnswer: async () => 'Y\r',
      print: () => undefined,
      spawnDaemon: () => ({ ok: true }),
      daemonEntry: '/resolved/daemon-entry.js',
    });
    assert.equal(started, true);
  });

  it('offer:anything-but-an-explicit-yes-spawns-nothing', async () => {
    for (const answer of ['', '\n', '   \n', 'n', 'N', 'no', 'yes please']) {
      const spawned: string[] = [];
      const started = await offerDaemonStart({
        readAnswer: async () => answer,
        print: () => undefined,
        spawnDaemon: (entry) => {
          spawned.push(entry);
          return { ok: true };
        },
        daemonEntry: '/resolved/daemon-entry.js',
      });

      assert.equal(started, false, `answer ${JSON.stringify(answer)} must not start the daemon`);
      assert.equal(spawned.length, 0);
    }
  });

  it('offer:a-failed-spawn-is-reported-not-swallowed', async () => {
    const printed: string[] = [];
    const started = await offerDaemonStart({
      readAnswer: async () => 'yes',
      print: (line) => printed.push(line),
      spawnDaemon: () => ({ ok: false, reason: 'spawn ENOENT' }),
      daemonEntry: '/resolved/daemon-entry.js',
    });

    assert.equal(started, false);
    assert.ok(printed.some((line) => line.includes('spawn ENOENT')), 'the failure reason reaches the operator');
  });

  it('offer:the-entry-it-would-spawn-is-the-shipped-executable', () => {
    assert.ok(
      DAEMON_ENTRY.endsWith(join('gateway-daemon', 'src', 'main.js')),
      `the entry resolves inside the daemon package — got ${DAEMON_ENTRY}`,
    );
    assert.ok(existsSync(DAEMON_ENTRY), 'the entry exists on disk (from the compiled tree)');
  });
});
