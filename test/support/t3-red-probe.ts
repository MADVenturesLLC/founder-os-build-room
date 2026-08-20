/**
 * T3 RED probe (correction T3, Rev 4.7 tester) — deterministic demonstration
 * of the timing-dependent diagnostic.
 *
 * The delivered test released both children together and asserted the loser
 * reports `staging_busy_or_recovery_required`. But that diagnostic is only
 * produced while the winner still HOLDS the lock; a loser that arrives after
 * the release passes the lock and is stopped by the enrolment guard with
 * `staging_enrollment_unresolved` instead — the same mutual exclusion, a
 * different code. This probe forces that ordering deterministically: run one
 * enrollment to completion, then start the second, and check the delivered
 * assertion against the second's result.
 *
 * Run: node dist/test/support/t3-red-probe.js
 * Exits 1 with the mismatch (the delivered assertion is order-dependent).
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const CHILD = fileURLToPath(new URL('./enroll-child.js', import.meta.url));
const CODE = 'ZmFrZS1jb2RlLWZvci10ZXN0aW5nLW9ubHktbm90LXJlYWw';

const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk: Buffer) => {
    raw += chunk.toString('utf8');
  });
  req.on('end', () => {
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        gatewayId: '11111111-2222-4333-8444-555555555555',
        keyId: 'a'.repeat(64),
        fingerprint: 'a'.repeat(64),
        awaitingApprovalExpiresAt: new Date().toISOString(),
      }),
    );
  });
});

function enroll(dir: string, keychain: string, baseUrl: string): Promise<{ code?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD], {
      env: {
        ...process.env,
        BUILDROOM_TEST_DIR: dir,
        BUILDROOM_TEST_KEYCHAIN: keychain,
        BUILDROOM_TEST_URL: baseUrl,
        BUILDROOM_TEST_CODE: CODE,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    /*
     * (correction 5, M9) stderr is piped, so it MUST be drained: unread, a
     * chatty child fills the pipe buffer and blocks before the close handler
     * ever runs — the probe would hang instead of reporting. Forwarded to the
     * parent's stderr, which is where a person debugging wants it.
     */
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.on('close', () => {
      try {
        resolve(JSON.parse(stdout.trim() || '{}') as { code?: string });
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.write('go\n');
    child.stdin.end();
  });
}

/*
 * (correction 5, M10) The exit code is a return value now, not a process.exit
 * inside the try: process.exit does not unwind the stack, so every early exit
 * previously leaked the temporary directory and left the probe server open.
 * Cleanup runs on every path; the process exits once, afterwards.
 */
const root = mkdtempSync(join(tmpdir(), 'buildroom-t3-red-'));

async function run(): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // The winner completes ENTIRELY — lock acquired, held, released.
  const winner = await enroll(join(root, 'gateway'), join(root, 'keychain'), baseUrl);
  if (winner.code !== undefined) {
    console.error(`probe is miswired: the first enrollment refused (${String(winner.code)})`);
    return 2;
  }

  // The loser arrives after the release — a legal interleaving of the
  // delivered test's "released together" start.
  const loser = await enroll(join(root, 'gateway'), join(root, 'keychain'), baseUrl);
  console.error(`second enrollment diagnostic: ${String(loser.code)}`);

  if (loser.code === 'staging_busy_or_recovery_required') {
    console.error('the guard diagnostic appeared; the ordering did not demonstrate the defect');
    return 2;
  }
  if (loser.code !== 'staging_enrollment_unresolved') {
    console.error('unexpected diagnostic; probe is miswired');
    return 2;
  }

  console.error(
    'RED: a legally-ordered loser reports staging_enrollment_unresolved, ' +
      'so the delivered assertion of staging_busy_or_recovery_required is timing-dependent',
  );
  return 1;
}

let exitCode = 1;
try {
  exitCode = await run();
} finally {
  rmSync(root, { recursive: true, force: true });
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
process.exit(exitCode);
