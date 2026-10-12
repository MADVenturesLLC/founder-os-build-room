/**
 * The Linux proof that a worker's channels are unnamed, unbound, connected
 * AF_UNIX socket pairs held by the supervising Gateway and nothing else
 * (Linux Gateway design note §6.3; Founder act
 * FOUNDER-ACT-20261012-BR-LINUX-GATEWAY-IMPLEMENTATION B3.5).
 *
 * On macOS `lsof` names a connected unnamed socket by its peer (`->0x…`). On
 * Linux it prints only `type=STREAM`, which proves nothing about being
 * connected, so this proof reads the kernel's own records instead:
 *
 *   - `/proc/<pid>/fd/<n>` gives the descriptor's socket inode;
 *   - `/proc/net/unix` gives that socket's path (empty: unnamed), state
 *     (`03`: connected) and flags (no `__SO_ACCEPTCON`: never listened);
 *   - `ss -x -a -n -H -p` gives its peer's inode and the processes holding
 *     the peer, which must be the Gateway alone.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, readlinkSync } from 'node:fs';

/** `__SO_ACCEPTCON` in `/proc/net/unix` Flags: the socket is listening. */
const SO_ACCEPTCON = 0x10000;

/** `SS_CONNECTED` in `/proc/net/unix` St. */
const SS_CONNECTED = '03';

export interface ProcUnixEntry {
  readonly inode: string;
  readonly flags: number;
  readonly state: string;
  readonly path: string;
}

/** `/proc/net/unix`, keyed by inode. */
export function procNetUnix(): Map<string, ProcUnixEntry> {
  const entries = new Map<string, ProcUnixEntry>();
  const lines = readFileSync('/proc/net/unix', 'utf8').split('\n').slice(1);
  for (const line of lines) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 7) continue;
    // Num RefCount Protocol Flags Type St Inode [Path]
    const inode = tokens[6]!;
    entries.set(inode, {
      inode,
      flags: Number.parseInt(tokens[3]!, 16),
      state: tokens[5]!,
      path: tokens.slice(7).join(' '),
    });
  }
  return entries;
}

/** The socket inode behind `/proc/<pid>/fd/<fd>`, or null if it is not a socket. */
export function socketInodeOf(pid: number, fd: number): string | null {
  let target: string;
  try {
    target = readlinkSync(`/proc/${String(pid)}/fd/${String(fd)}`);
  } catch {
    return null;
  }
  const match = /^socket:\[(\d+)\]$/.exec(target);
  return match === null ? null : match[1]!;
}

/** Every socket inode a process holds. */
export function socketInodesHeldBy(pid: number): Set<string> {
  const inodes = new Set<string>();
  let fds: string[];
  try {
    fds = readdirSync(`/proc/${String(pid)}/fd`);
  } catch {
    return inodes;
  }
  for (const fd of fds) {
    const inode = socketInodeOf(pid, Number(fd));
    if (inode !== null) inodes.add(inode);
  }
  return inodes;
}

export interface SsUnixEntry {
  readonly localInode: string;
  readonly peerInode: string;
  readonly state: string;
  readonly pids: readonly number[];
}

/** `ss -x -a -n -H -p`, keyed by local inode. */
export function ssUnix(): Map<string, SsUnixEntry> {
  const result = spawnSync('ss', ['-x', '-a', '-n', '-H', '-p'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ss exited ${String(result.status)}: ${result.stderr.trim()}`);
  }
  const entries = new Map<string, SsUnixEntry>();
  for (const line of result.stdout.split('\n')) {
    // Netid State Recv-Q Send-Q Local-Address Local-Inode Peer-Address Peer-Inode [users:(...)]
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 8) continue;
    const pids = [...line.matchAll(/pid=(\d+)/g)].map((match) => Number(match[1]));
    entries.set(tokens[5]!, { localInode: tokens[5]!, peerInode: tokens[7]!, state: tokens[1]!, pids });
  }
  return entries;
}

export interface SocketPairProof {
  /** Every failed condition, in words; empty when the proof holds. */
  readonly failures: readonly string[];
  /** The worker's channel inodes, in fd order. */
  readonly inodes: readonly string[];
  /** Their peers' inodes, in the same order. */
  readonly peers: readonly string[];
}

/**
 * Prove each of `fds` in `workerPid` is an unnamed, unbound, connected
 * AF_UNIX socket whose peer is held by `gatewayPid` and by no other process.
 */
export function proveUnnamedConnectedPairs(
  workerPid: number,
  fds: readonly number[],
  gatewayPid: number,
): SocketPairProof {
  const failures: string[] = [];
  const inodes: string[] = [];
  const peers: string[] = [];
  const kernel = procNetUnix();
  const sockets = ssUnix();
  const gatewayHeld = socketInodesHeldBy(gatewayPid);

  for (const fd of fds) {
    const inode = socketInodeOf(workerPid, fd);
    if (inode === null) {
      failures.push(`fd ${String(fd)} is not a socket`);
      continue;
    }
    inodes.push(inode);

    const entry = kernel.get(inode);
    if (entry === undefined) {
      failures.push(`fd ${String(fd)} (inode ${inode}) is not an AF_UNIX socket`);
      continue;
    }
    if (entry.path !== '') failures.push(`fd ${String(fd)} is bound to a name: ${entry.path}`);
    if (entry.state !== SS_CONNECTED) failures.push(`fd ${String(fd)} is not connected (St ${entry.state})`);
    if ((entry.flags & SO_ACCEPTCON) !== 0) failures.push(`fd ${String(fd)} is a listening socket`);

    const local = sockets.get(inode);
    if (local === undefined) {
      failures.push(`fd ${String(fd)} (inode ${inode}) is missing from ss`);
      continue;
    }
    const peer = local.peerInode;
    peers.push(peer);
    if (!/^[1-9][0-9]*$/.test(peer)) {
      failures.push(`fd ${String(fd)} has no peer (peer ${peer})`);
      continue;
    }
    if (!gatewayHeld.has(peer)) failures.push(`fd ${String(fd)}'s peer ${peer} is not held by the Gateway`);
    const peerEntry = sockets.get(peer);
    const holders = peerEntry === undefined ? [] : [...new Set(peerEntry.pids)];
    if (holders.length !== 1 || holders[0] !== gatewayPid) {
      failures.push(`fd ${String(fd)}'s peer ${peer} is held by pids [${holders.join(', ')}], not the Gateway alone`);
    }
  }
  return { failures, inodes, peers };
}
