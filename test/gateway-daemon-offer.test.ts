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
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DAEMON_ENTRY, offerDaemonStart, spawnDaemonDetached } from '../packages/gateway-cli/src/index.js';

describe('gateway-cli · the §16 post-enrolment start offer', () => {
  it('offer:an-explicit-yes-spawns-the-daemon-entry', async () => {
    const spawned: string[] = [];
    const started = await offerDaemonStart({
      readAnswer: async () => 'y',
      print: () => undefined,
      spawnDaemon: async (entry) => {
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
      spawnDaemon: async () => ({ ok: true }),
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
        spawnDaemon: async (entry) => {
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
      spawnDaemon: async () => ({ ok: false, reason: 'daemon spawn failed: spawn node ENOENT' }),
      daemonEntry: '/resolved/daemon-entry.js',
    });

    assert.equal(started, false);
    assert.ok(printed.some((line) => line.includes('spawn node ENOENT')), 'the failure reason reaches the operator');
  });

  it('offer:the-entry-it-would-spawn-is-the-shipped-executable', () => {
    assert.ok(
      DAEMON_ENTRY.endsWith(join('gateway-daemon', 'src', 'main.js')),
      `the entry resolves inside the daemon package — got ${DAEMON_ENTRY}`,
    );
    assert.ok(existsSync(DAEMON_ENTRY), 'the entry exists on disk (from the compiled tree)');
  });
});

describe('gateway-cli · the spawn reports a missing entry honestly (correction 5, #6)', () => {
  it('spawn:a-nonexistent-daemon-entry-is-a-failure-not-a-silent-ok', async () => {
    const result = await spawnDaemonDetached(join(tmpdir(), 'buildroom-no-such-daemon-entry.js'));
    assert.equal(result.ok, false, 'a missing entry must be reported, not spawned and forgotten');
    assert.ok(typeof result.reason === 'string' && result.reason.length > 0, 'the failure says why');
  });
});

/*
 * Correction 7, finding A. The tester rejected Correction 6's proxy for the
 * spawn outcome — one immediate callback — with a control proving that a valid
 * error arriving after that callback was misreported as success and that
 * unref() ran without a confirmed spawn: {"verdict":{"ok":true},"unrefCalls":1}.
 * The verdict must observe the child's own signal: 'spawn' means success,
 * 'error' means failure, and nothing else settles the question.
 *
 * An error later than the spawn phase cannot be produced on demand by a real
 * OS — a real exec failure is reported back to spawn() and Node defers only
 * the event — so those controls hand spawnDaemonDetached a scripted child
 * through the structural seam it accepts. The scripted 'error' fires on a
 * timer, strictly after any single event-loop phase, which is the exact shape
 * the tester's control used. The two real-OS controls below them keep the
 * default spawn path honest: a genuinely unspawnable executable is a failure,
 * a genuinely spawned child is a success.
 */
class ScriptedChild {
  private readonly listeners = new Map<string, Array<(error: Error) => void>>();
  private deliveries = 0;
  public unrefCalls = 0;

  once(event: 'spawn' | 'error', listener: (error: Error) => void): this {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
    return this;
  }

  unref(): void {
    this.unrefCalls += 1;
  }

  /** Delivered on a macrotask — later than any immediate callback. */
  emitOnTimer(event: 'spawn' | 'error', error?: Error): void {
    setTimeout(() => {
      for (const listener of this.listeners.get(event) ?? []) {
        this.deliveries += 1;
        // Spawn listeners are 0-arity and ignore the payload.
        listener(error ?? new Error(event));
      }
    }, 20);
  }

  delivered(): number {
    return this.deliveries;
  }
}

describe('gateway-cli · success means the spawn signal, not the absence of an error (correction 7, finding A)', () => {
  it('spawn:a-late-error-with-no-spawn-signal-is-a-failure-not-a-misread-success', async () => {
    const entry = join(tmpdir(), 'buildroom-c7-existing-entry.js');
    writeFileSync(entry, 'process.exit(0);\n');
    const child = new ScriptedChild();
    try {
      // No 'spawn' will ever come; the error arrives after any immediate
      // callback, so a phase-based gate has already answered by then.
      child.emitOnTimer('error', Object.assign(new Error('spawn node EACCES'), { code: 'EACCES' }));
      const result = await spawnDaemonDetached(entry, () => child);
      assert.equal(
        result.ok,
        false,
        'a child that never emitted the spawn signal is a failure, whatever a phase-based gate guessed',
      );
      assert.ok(
        typeof result.reason === 'string' && result.reason.includes('EACCES'),
        'the failure carries the sanitized reason',
      );
      assert.ok(!result.reason!.includes('\n'), 'the reason carries no stack trace');
      assert.equal(child.unrefCalls, 0, 'a child that never spawned is never unrefed');
    } finally {
      unlinkSync(entry);
    }
  });

  it('spawn:success-is-reported-on-the-spawn-signal-and-unrefs-exactly-once', async () => {
    const entry = join(tmpdir(), 'buildroom-c7-harmless-entry.js');
    writeFileSync(entry, 'process.exit(0);\n');
    const child = new ScriptedChild();
    try {
      child.emitOnTimer('spawn');
      const result = await spawnDaemonDetached(entry, () => child);
      assert.equal(result.ok, true, "the child's own spawn signal is the success verdict");
      assert.equal(result.reason, undefined, 'success carries no reason');
      assert.equal(child.unrefCalls, 1, 'detachment happens exactly once, after the signal');
    } finally {
      unlinkSync(entry);
    }
  });

  it('spawn:an-error-after-a-confirmed-spawn-is-contained-not-unhandled', async () => {
    const entry = join(tmpdir(), 'buildroom-c7-late-error-entry.js');
    writeFileSync(entry, 'process.exit(0);\n');
    const child = new ScriptedChild();
    try {
      child.emitOnTimer('spawn');
      child.emitOnTimer('error', new Error('child died after spawn'));
      const result = await spawnDaemonDetached(entry, () => child);
      assert.equal(result.ok, true, 'a confirmed spawn stays a success; later death is the daemon lifecycle');
      // Let the late error land: the verdict must have already returned, and
      // the still-attached listener must swallow it rather than let it escape.
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.ok(child.delivered() >= 2, 'the late error was delivered to a listener, not unhandled');
      assert.equal(child.unrefCalls, 1);
    } finally {
      unlinkSync(entry);
    }
  });

  it('spawn:an-unspawnable-executable-with-an-existing-entry-is-a-real-os-failure', async () => {
    const entry = join(tmpdir(), 'buildroom-c7-real-entry.js');
    writeFileSync(entry, 'process.exit(0);\n');
    const realExecPath = process.execPath;
    process.execPath = join(tmpdir(), 'buildroom-c7-no-such-executable');
    try {
      const result = await spawnDaemonDetached(entry);
      assert.equal(result.ok, false, 'the real OS verdict: the executable could not be spawned');
      assert.ok(
        typeof result.reason === 'string' && result.reason.length > 0,
        'the failure says why, sanitized',
      );
    } finally {
      process.execPath = realExecPath;
      unlinkSync(entry);
    }
  });

  it('spawn:a-genuinely-spawned-real-child-is-a-success', async () => {
    const entry = join(tmpdir(), 'buildroom-c7-real-ok-entry.js');
    writeFileSync(entry, 'process.exit(0);\n');
    try {
      const result = await spawnDaemonDetached(entry);
      assert.equal(result.ok, true, 'a real child that emitted its spawn signal is ok');
      assert.equal(result.reason, undefined, 'success carries no reason');
    } finally {
      unlinkSync(entry);
    }
  });
});
