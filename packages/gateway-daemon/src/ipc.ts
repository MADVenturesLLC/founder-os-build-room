/**
 * The daemon's IPC socket (contract §15, §16).
 *
 * A unix domain socket under the 0700 gateway directory, carrying newline
 * delimited JSON. Two operations, both read-only: `status` reports both lanes,
 * `tail` returns recent ring-buffer entries. Nothing here can mutate custody or
 * state — the CLI's mutating verb is `enroll`, and it does its own work under
 * the staging lock rather than asking the daemon to do it.
 */

import { createServer, type Server, type Socket } from 'node:net';
import { chmod, mkdir, unlink } from 'node:fs/promises';
import { DIRECTORY_MODE, FILE_MODE, type GatewayPaths } from './paths.js';
import type { RingBuffer } from './ring-buffer.js';

export interface IpcStatus {
  readonly primary: Record<string, unknown>;
  readonly staging: Record<string, unknown>;
}

export interface IpcHandlers {
  status(): IpcStatus;
  ring(): RingBuffer;
}

export type IpcRequest = { readonly op: 'status' } | { readonly op: 'tail'; readonly limit?: number };

export class IpcServer {
  private server: Server | null = null;

  constructor(
    private readonly paths: GatewayPaths,
    private readonly handlers: IpcHandlers,
  ) {}

  async start(): Promise<void> {
    await mkdir(this.paths.directory, { recursive: true, mode: DIRECTORY_MODE });
    // A stale socket file from a crashed daemon would refuse the bind. This is
    // the daemon's own socket path and carries no mutual-exclusion meaning —
    // unlike the staging lock, which is never removed by anything but its owner.
    await unlink(this.paths.socketPath).catch(() => undefined);

    const server = createServer((socket: Socket) => this.serve(socket));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.paths.socketPath, () => resolve());
    });
    // 0600: the socket is as sensitive as the state file it reports on.
    await chmod(this.paths.socketPath, FILE_MODE);
    this.server = server;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server === null) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await unlink(this.paths.socketPath).catch(() => undefined);
  }

  private serve(socket: Socket): void {
    let buffered = '';
    socket.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
      let newline = buffered.indexOf('\n');
      while (newline !== -1) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        socket.write(`${JSON.stringify(this.answer(line))}\n`);
        newline = buffered.indexOf('\n');
      }
    });
    socket.on('error', () => socket.destroy());
  }

  private answer(line: string): Record<string, unknown> {
    let request: IpcRequest;
    try {
      request = JSON.parse(line) as IpcRequest;
    } catch {
      return { error: 'invalid_request' };
    }

    if (request.op === 'status') return { ok: true, ...this.handlers.status() };
    if (request.op === 'tail') {
      return { ok: true, entries: this.handlers.ring().recent(request.limit ?? 50) };
    }
    return { error: 'unknown_op' };
  }
}

/** Send one request to a running daemon, or report that none is listening. */
export async function ipcRequest(
  socketPath: string,
  request: IpcRequest,
  timeoutMs = 2_000,
): Promise<{ readonly ok: true; readonly body: Record<string, unknown> } | { readonly ok: false; readonly reason: string }> {
  const { createConnection } = await import('node:net');

  return new Promise((resolve) => {
    const socket = createConnection(socketPath);
    let settled = false;
    let buffered = '';

    const finish = (result: { ok: true; body: Record<string, unknown> } | { ok: false; reason: string }): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, reason: 'daemon did not answer in time' }), timeoutMs);
    timer.unref();

    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
      const newline = buffered.indexOf('\n');
      if (newline === -1) return;
      try {
        finish({ ok: true, body: JSON.parse(buffered.slice(0, newline)) as Record<string, unknown> });
      } catch {
        finish({ ok: false, reason: 'daemon returned an unreadable answer' });
      }
    });
    socket.on('error', () => finish({ ok: false, reason: 'daemon not running' }));
  });
}
