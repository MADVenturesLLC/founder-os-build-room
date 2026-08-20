/**
 * §16 (correction 5, review finding #11) — the IPC line handler bounds what it
 * will buffer and validates what it will honor.
 *
 * `serve()` accumulated `buffered` without a ceiling, so a connected peer that
 * simply wrote bytes without a newline grew the daemon's memory without bound;
 * and `tail`'s `limit` reached `RingBuffer.recent()` unvalidated, where a
 * non-positive or fractional limit returns the wrong slice. Both are answered
 * the same way the rest of the socket is: an oversized line destroys the
 * connection before it is ever parsed, and a limit that is not a positive
 * integer is `invalid_request`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import {
  IpcServer,
  RingBuffer,
  gatewayPaths,
  ipcRequest,
  type GatewayPaths,
} from '../packages/gateway-daemon/src/index.js';

interface RawOutcome {
  readonly lines: string[];
  readonly closed: boolean;
}

function rawExchange(
  socketPath: string,
  payload: string,
  expectLines: number,
  timeoutMs = 3_000,
): Promise<RawOutcome> {
  return new Promise((resolve) => {
    const socket = createConnection(socketPath);
    const lines: string[] = [];
    let buffered = '';
    let closed = false;
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ lines, closed });
    };
    const timer = setTimeout(finish, timeoutMs);
    timer.unref();
    socket.on('connect', () => socket.write(payload));
    socket.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
      let newline = buffered.indexOf('\n');
      while (newline !== -1) {
        lines.push(buffered.slice(0, newline));
        buffered = buffered.slice(newline + 1);
        newline = buffered.indexOf('\n');
      }
      if (lines.length >= expectLines) {
        clearTimeout(timer);
        finish();
      }
    });
    socket.on('close', () => {
      closed = true;
      clearTimeout(timer);
      finish();
    });
    socket.on('error', () => {
      closed = true;
      clearTimeout(timer);
      finish();
    });
  });
}

async function withServer(fn: (socketPath: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-ipc-overflow-'));
  const paths: GatewayPaths = gatewayPaths(join(root, 'gateway'));
  const server = new IpcServer(paths, {
    status: () => ({ primary: { lane: 'IDLE' }, staging: { lane: 'INACTIVE' } }),
    ring: () => new RingBuffer(),
  });
  await server.start();
  try {
    await fn(paths.socketPath);
  } finally {
    await server.stop();
    rmSync(root, { recursive: true, force: true });
  }
}

describe('gateway-ipc · a frame past the bound is refused, not absorbed', () => {
  it('overflow:a-request-line-past-the-bound-destroys-the-connection-unanswered', async () => {
    await withServer(async (socketPath) => {
      const outcome = await rawExchange(socketPath, `${'x'.repeat(70_000)}\n`, 1);
      assert.equal(outcome.lines.length, 0, 'an oversized line is never parsed or answered');
      assert.equal(outcome.closed, true, 'the connection is destroyed');
    });
  });

  it('overflow:the-server-still-serves-the-next-connection', async () => {
    await withServer(async (socketPath) => {
      const oversized = rawExchange(socketPath, `${'x'.repeat(70_000)}\n`, 1);
      await oversized;
      const status = await ipcRequest(socketPath, { op: 'status' });
      assert.equal(status.ok, true, 'a refused peer does not take the socket down for others');
    });
  });

  it('limit:a-tail-limit-that-is-not-a-positive-integer-is-refused', async () => {
    await withServer(async (socketPath) => {
      const outcome = await rawExchange(socketPath, '{"op":"tail","limit":0}\n', 1);
      assert.deepEqual(JSON.parse(outcome.lines[0] ?? '"no answer"'), { error: 'invalid_request' });
    });
  });
});
