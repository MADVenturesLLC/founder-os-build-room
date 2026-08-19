/**
 * §16 — the CLI entrypoint's main-module guard.
 *
 * The guard in `bin.ts` exists so suites can import the module without side
 * effects, while `node bin.js` runs the CLI. Its comparison must accept every
 * spelling of the same entry file: `import.meta.url` is always the physical
 * path of the module, but `process.argv[1]` keeps the spelling the operator
 * used. A path that traverses a symlinked directory (the platform gate's
 * `/tmp` -> `/private/tmp` finding) or an npm-style executable symlink
 * (`node_modules/.bin/buildroom`) made the raw template comparison fail, and
 * the process exited 0 having done nothing — a silent no-op.
 *
 * Every case here spawns a real `node <entry>` child with no verb: the guard
 * reads process-global state, so importing `main` in-process proves nothing.
 * The CLI must answer with usage on stderr and exit 2 through all three
 * spellings, and a verb-less invocation must never exit 0.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The built entrypoint this suite exercises (always the physical module path). */
const BIN = fileURLToPath(new URL('../packages/gateway-cli/src/bin.js', import.meta.url));

interface Ran {
  readonly code: number | null;
  readonly stderr: string;
}

/**
 * Run `node <entry>` with no verb under a throwaway HOME. The redirected HOME
 * and the dead control-plane URL keep the child off any real state; a
 * verb-less run writes usage to stderr and exits before any collaborator is
 * constructed.
 */
function runEntry(entry: string): Promise<Ran> {
  const home = mkdtempSync(join(tmpdir(), 'buildroom-bin-entry-'));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        HOME: home,
        BUILDROOM_CONTROL_PLANE_URL: 'http://127.0.0.1:1',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      rmSync(home, { recursive: true, force: true });
      resolve({ code, stderr });
    });
  });
}

/** Assert the CLI actually ran: usage on stderr, exit 2 — never a silent 0. */
function assertUsage(ran: Ran): void {
  assert.notEqual(ran.code, 0, 'a verb-less invocation must never exit 0');
  assert.equal(ran.code, 2);
  assert.match(ran.stderr, /buildroom <verb>/);
  assert.match(ran.stderr, /providers/);
}

describe('gateway-cli-entrypoint', () => {
  it('entrypoint:runs-through-physical-absolute-path', async () => {
    assertUsage(await runEntry(BIN));
  });

  it('entrypoint:runs-through-symlinked-directory-path', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'buildroom-bin-symlink-'));
    try {
      // Symlink the entry's whole directory, so the invocation spelling
      // traverses a symlinked directory exactly the way an absolute path does
      // when the worktree sits under a symlink (`/tmp` -> `/private/tmp`).
      symlinkSync(dirname(BIN), join(sandbox, 'linked-src'));
      assertUsage(await runEntry(join(sandbox, 'linked-src', 'bin.js')));
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('entrypoint:runs-through-npm-style-executable-symlink', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'buildroom-bin-exec-'));
    try {
      // `node_modules/.bin/buildroom` is a symlink to the entry file itself;
      // the shebang hands node the symlink's spelling, not the target's.
      mkdirSync(join(sandbox, 'bin'));
      symlinkSync(BIN, join(sandbox, 'bin', 'buildroom'));
      assertUsage(await runEntry(join(sandbox, 'bin', 'buildroom')));
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
