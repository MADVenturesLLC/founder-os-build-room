/**
 * The Linux socket-pair proof that Prerequisite C tests 5.2 and 5.6 rely on on
 * Linux (`test/support/linux-socket-proof.ts`), exercised in the ordinary
 * suite so CI proves it on Linux without the pinned Prerequisite C runtime.
 *
 * A child spawned with `stdio` 'pipe' on fds 3 to 5 holds the same kind of
 * channel the worker supervisor creates: Node/libuv socket pairs. The proof
 * must hold for them, and must fail for a named, listening socket.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseSsUnix,
  proveUnnamedConnectedPairs,
  procNetUnix,
  socketInodeOf,
  socketInodesHeldBy,
  ssUnix,
} from './support/linux-socket-proof.js';

const SKIP = process.platform === 'linux' ? false : 'Linux only: the proof reads /proc and ss';

function spawnWithChannels(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  });
  return new Promise((resolve) => setTimeout(() => resolve(child), 300));
}

describe('linux-socket-proof · Node/libuv channels', { skip: SKIP }, () => {
  it('proves fds 3 to 5 are unnamed, unbound, connected and held by this process alone', async () => {
    const child = await spawnWithChannels();
    try {
      const proof = proveUnnamedConnectedPairs(child.pid!, [3, 4, 5], process.pid);
      assert.deepEqual(proof.failures, []);
      assert.equal(proof.inodes.length, 3);
      assert.equal(proof.peers.length, 3);
      for (const peer of proof.peers) {
        assert.ok(socketInodesHeldBy(process.pid).has(peer), `peer ${peer} is this process's`);
      }
    } finally {
      child.kill('SIGKILL');
    }
  });

  it('fails when the claimed Gateway is some other process', async () => {
    const child = await spawnWithChannels();
    try {
      const proof = proveUnnamedConnectedPairs(child.pid!, [3, 4, 5], child.pid!);
      assert.ok(proof.failures.length > 0, 'a peer held elsewhere is refused');
    } finally {
      child.kill('SIGKILL');
    }
  });

  it('shares no channel with an unrelated sibling (the 5.6 form)', async () => {
    const child = await spawnWithChannels();
    const sibling = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const proof = proveUnnamedConnectedPairs(child.pid!, [3, 4, 5], process.pid);
      const siblingHeld = socketInodesHeldBy(sibling.pid!);
      const shared = [...proof.inodes, ...proof.peers].filter((inode) => siblingHeld.has(inode));
      assert.deepEqual(shared, []);
    } finally {
      sibling.kill('SIGKILL');
      child.kill('SIGKILL');
    }
  });
});

describe('linux-socket-proof · what it refuses', { skip: SKIP }, () => {
  it('records a named, listening socket as bound and listening', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'socket-proof-'));
    const path = join(directory, 'listen.sock');
    const server: Server = createServer();
    try {
      await new Promise<void>((resolve) => server.listen(path, resolve));
      const listening = [...procNetUnix().values()].find((entry) => entry.path === path);
      assert.ok(listening !== undefined, 'the listening socket appears in /proc/net/unix');
      assert.ok((listening.flags & 0x10000) !== 0, 'it carries the listening flag');
      assert.notEqual(listening.state, '03', 'it is not connected');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reads a non-socket descriptor as no socket', () => {
    assert.equal(socketInodeOf(process.pid, 999_999), null);
  });
});

/*
 * The PC's certification run (Ubuntu 26.04, iproute2 6.19, a desktop with
 * thousands of Unix sockets) failed every proof with "ss exited null": the
 * host-wide `ss` listing passed spawnSync's default 1 MiB buffer and `ss` was
 * killed. These are two lines of that host's real output, padding included.
 */
const PC_SS_SAMPLE =
  'u_str ESTAB  0      0                                                                                                  * 10862456 * 10862457 users:(("node",pid=4185616,fd=22))\n' +
  'u_str ESTAB  0      0                                                                                                  * 10862457 * 10862456 users:(("sleep",pid=4185623,fd=3))\n';

describe('linux-socket-proof · ss on a busy host', () => {
  it('parses the padded ss lines of the PC into inode, peer and holder', () => {
    const entries = parseSsUnix(PC_SS_SAMPLE);
    assert.deepEqual(entries.get('10862457'), {
      localInode: '10862457',
      peerInode: '10862456',
      state: 'ESTAB',
      pids: [4185623],
    });
    assert.deepEqual(entries.get('10862456')?.pids, [4185616]);
  });

  it('names the cause when the ss listing outgrows the buffer', { skip: SKIP }, async () => {
    const child = await spawnWithChannels();
    try {
      assert.throws(() => ssUnix(16), /ss could not list Unix sockets \(ENOBUFS/);
      assert.ok(ssUnix().size > 0, 'with the default buffer the listing is read');
    } finally {
      child.kill('SIGKILL');
    }
  });
});
