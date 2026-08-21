/**
 * §16 (correction 5, review finding #12) — the IPC line handler treats what
 * arrives on the socket as untrusted data.
 *
 * `answer()` parsed each line and immediately dereferenced the result as an
 * `IpcRequest`. `JSON.parse('null')` succeeds, so a null line reached
 * `request.op` and threw inside the socket's data handler — an uncaught
 * exception that takes the daemon down. A JSON array line fell through to
 * `unknown_op`, handing an attacker-controlled shape a protocol verdict. And
 * nothing wrapped the handlers themselves, so a throwing `status` handler was
 * equally fatal. Parsing is containment: anything that is not a request
 * object with a known op is answered `invalid_request`, and a handler that
 * throws is answered, not propagated.
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
  type GatewayPaths,
  type IpcHandlers,
  type IpcStatus,
} from '../packages/gateway-daemon/src/index.js';

interface RawOutcome {
  readonly lines: string[];
  readonly closed: boolean;
}

/**
 * Write `payload` to the socket raw and collect newline-delimited answers
 * until `expectLines` arrive or the connection closes or the bound expires.
 */
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

async function withServer(handlers: IpcHandlers, fn: (socketPath: string) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-ipc-null-'));
  const paths: GatewayPaths = gatewayPaths(join(root, 'gateway'));
  const server = new IpcServer(paths, handlers);
  await server.start();
  try {
    await fn(paths.socketPath);
  } finally {
    await server.stop();
    rmSync(root, { recursive: true, force: true });
  }
}

describe('gateway-ipc · a line that is not a request is answered, not fatal', () => {
  it('array:a-json-array-line-is-invalid-request-not-unknown-op', async () => {
    await withServer(
      {
        status: () => ({ primary: { lane: 'IDLE' }, staging: { lane: 'INACTIVE' } }),
        ring: () => new RingBuffer(),
      },
      async (socketPath) => {
        const outcome = await rawExchange(socketPath, '[1,2]\n{"op":"status"}\n', 2);
        assert.deepEqual(JSON.parse(outcome.lines[0] ?? '"no answer"'), { error: 'invalid_request' });
        const followUp = JSON.parse(outcome.lines[1] ?? 'null') as { ok?: boolean };
        assert.equal(followUp.ok, true, 'the connection stays usable after the refused line');
      },
    );
  });

  it('null:a-json-null-line-is-answered-and-the-daemon-lives', async () => {
    await withServer(
      {
        status: () => ({ primary: { lane: 'IDLE' }, staging: { lane: 'INACTIVE' } }),
        ring: () => new RingBuffer(),
      },
      async (socketPath) => {
        const outcome = await rawExchange(socketPath, 'null\n{"op":"status"}\n', 2);
        assert.deepEqual(JSON.parse(outcome.lines[0] ?? '"no answer"'), { error: 'invalid_request' });
        const followUp = JSON.parse(outcome.lines[1] ?? '"no answer"') as { ok?: boolean };
        assert.equal(followUp.ok, true, 'the daemon still answers after the null line');
      },
    );
  });

  it('escape:a-throwing-handler-is-answered-not-propagated', async () => {
    await withServer(
      {
        status: (): IpcStatus => {
          throw new Error('handler exploded');
        },
        ring: () => new RingBuffer(),
      },
      async (socketPath) => {
        const outcome = await rawExchange(socketPath, '{"op":"status"}\n{"op":"tail"}\n', 2);
        const first = JSON.parse(outcome.lines[0] ?? '"no answer"') as { error?: string };
        assert.equal(typeof first.error, 'string', 'the failure is answered on the socket');
        const followUp = JSON.parse(outcome.lines[1] ?? '"no answer"') as { ok?: boolean };
        assert.equal(followUp.ok, true, 'the throwing handler is contained; tail still answers');
      },
    );
  });
});
