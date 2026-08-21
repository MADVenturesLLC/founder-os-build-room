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

/**
 * §16 — the socket is untrusted input. A peer that writes past this bound
 * without a newline is refused before its bytes are ever parsed; the handler's
 * memory cannot grow without limit because a peer simply wrote at it.
 */
const MAX_REQUEST_BYTES = 64 * 1024;

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
      if (buffered.length > MAX_REQUEST_BYTES) {
        socket.destroy();
        return;
      }
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
    let request: unknown;
    try {
      request = JSON.parse(line);
    } catch {
      return { error: 'invalid_request' };
    }

    /*
     * (correction 5, finding #12) Anything that is not a request object — a
     * JSON null, an array, a bare string — is `invalid_request`, never a
     * dereference and never an `unknown_op` verdict handed to a shape the
     * protocol never declared.
     */
    if (typeof request !== 'object' || request === null || Array.isArray(request)) {
      return { error: 'invalid_request' };
    }
    const record = request as Record<string, unknown>;
    if (record['op'] === 'status') {
      return this.guarded(() => ({ ok: true, ...this.handlers.status() }));
    }
    if (record['op'] === 'tail') {
      const limit = record['limit'];
      if (limit !== undefined && !(typeof limit === 'number' && Number.isInteger(limit) && limit >= 1)) {
        return { error: 'invalid_request' };
      }
      return this.guarded(() => ({
        ok: true,
        entries: this.handlers.ring().recent((limit as number | undefined) ?? 50),
      }));
    }
    return { error: 'unknown_op' };
  }

  /** (correction 5, finding #11) A handler that throws is answered, not propagated. */
  private guarded(answer: () => Record<string, unknown>): Record<string, unknown> {
    try {
      return answer();
    } catch {
      return { error: 'internal_error' };
    }
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
