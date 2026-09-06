/**
 * The `npm run test:prereq-c` prelude and proof-runtime resolver (R4
 * manifest B6, Founder-confirmed 2026-09-04).
 *
 * The Prerequisite C storage suite SKIPs itself when the pinned proof
 * runtime is not active, and that is the right default for `npm test`: a
 * developer on any Node should be able to run the repository's suites
 * without a throwaway checkout of madventures-tui. It is exactly the wrong
 * default for `test:prereq-c`, whose entire purpose is to run that suite —
 * a strict command that quietly skipped everything would report success
 * for a run that proved nothing.
 *
 * So this module does two jobs:
 *
 * 1. `resolvePrereqCRuntime()` — pure resolution of the proof-runtime
 *    facts, consumed by the suite to decide run-vs-skip and to build the
 *    supervisor launch descriptor. Every fact is measured, never assumed:
 *
 *    - the RUNNING node version (the pinned proof runtime is Founder
 *      ruling v22.23.2 — the host default is NOT a substitute);
 *    - whether the pinned nvm Node exists on this machine (a how-to-fix
 *      hint, not a binding);
 *    - the bun executable and version on PATH;
 *    - the madventures-tui checkout: `BUILDROOM_PREREQC_TUI_ROOT`
 *      override, else relative candidates from this repository's root,
 *      verified AT THE BOUND BASE COMMIT `3d5c4c97…` (the base the R4
 *      commission bound the real ledger/protocol/broker seams to);
 *    - the bounded C2 Worker entrypoint inside that checkout.
 *
 * 2. When executed directly (the `test:prereq-c` prelude, mirroring
 *    `require-test-database-url.js`): print the facts and exit 1 loudly
 *    when any binding is missing — naming exactly what is missing.
 *
 * This file represents FIXTURE/runtime state only. It never claims
 * production Gateway state, mints no authority, and reads no secrets.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Founder-confirmed proof runtime (host default Node is NOT used). */
export const PINNED_NODE_VERSION = 'v22.23.2';

/** The madventures-tui base commit the R4 commission bound the seams to. */
export const BOUND_TUI_BASE = '3d5c4c97fd5eba739215688eb2f4f2fa4b7071e3';

export interface PrereqCRuntimeFacts {
  readonly runningNode: string;
  readonly pinnedNode: string;
  readonly nvmPinnedNodePresent: boolean;
  readonly nvmPinnedNodePath: string | null;
  readonly bunExecutable: string | null;
  readonly bunVersion: string | null;
  readonly tuiRoot: string | null;
  readonly tuiHead: string | null;
  readonly tuiAtBoundBase: boolean;
  readonly workerEntrypoint: string | null;
}

export interface PrereqCLaunchDescriptor {
  /** Absolute path to the Bun executable (proof runtime). */
  readonly bunExecutable: string;
  /** Absolute path to the bounded C2 Worker entrypoint (.ts, run by Bun). */
  readonly workerEntrypoint: string;
}

export interface PrereqCRuntime {
  /** True only when every binding the proofs depend on is present. */
  readonly ok: boolean;
  /** Each missing binding, named exactly — the honest skip diagnostics. */
  readonly missing: readonly string[];
  readonly facts: PrereqCRuntimeFacts;
  readonly launch: PrereqCLaunchDescriptor | null;
}

/** This repository's root, derived from the compiled file location. */
function repoRoot(): string {
  // dist/test/support/require-prereq-c-runtime.js -> repo root
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

/**
 * Read a checkout's HEAD commit id from .git without invoking git.
 * Handles a plain checkout (ref file or packed-refs) and detached HEAD.
 * Returns null when anything is unreadable — the caller reports it.
 */
function readGitHead(checkoutRoot: string): string | null {
  const dotGit = join(checkoutRoot, '.git');
  if (!existsSync(join(dotGit, 'HEAD'))) return null;
  let head: string;
  try {
    head = readFileSync(join(dotGit, 'HEAD'), 'utf8').trim();
  } catch {
    return null;
  }
  if (!head.startsWith('ref: ')) {
    return /^[0-9a-f]{40}$/.test(head) ? head : null;
  }
  const ref = head.slice('ref: '.length);
  const refFile = join(dotGit, ...ref.split('/'));
  if (existsSync(refFile)) {
    try {
      const sha = readFileSync(refFile, 'utf8').trim();
      if (/^[0-9a-f]{40}$/.test(sha)) return sha;
    } catch {
      // fall through to packed-refs
    }
  }
  const packed = join(dotGit, 'packed-refs');
  if (existsSync(packed)) {
    try {
      for (const line of readFileSync(packed, 'utf8').split('\n')) {
        const match = /^([0-9a-f]{40}) (.+)$/.exec(line.trim());
        if (match !== null && match[2] === ref) return match[1] ?? null;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** Resolve the madventures-tui checkout root (override first, then candidates). */
function resolveTuiRoot(): string | null {
  const override = process.env['BUILDROOM_PREREQC_TUI_ROOT'];
  const candidates = override !== undefined && override !== ''
    ? [override]
    : [
        join(repoRoot(), '..', '..', 'madventures-tui'),
        join(repoRoot(), '..', 'madventures-tui'),
      ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, '.git', 'HEAD'))) return candidate;
  }
  return null;
}

export function resolvePrereqCRuntime(): PrereqCRuntime {
  const missing: string[] = [];

  // --- Node proof runtime ---------------------------------------------
  const runningNode = process.version;
  const nvmPinnedNodePath = join(
    homedir(),
    '.nvm',
    'versions',
    'node',
    PINNED_NODE_VERSION,
    'bin',
    'node',
  );
  const nvmPinnedNodePresent = existsSync(nvmPinnedNodePath);
  if (runningNode !== PINNED_NODE_VERSION) {
    missing.push(
      `pinned proof runtime Node ${PINNED_NODE_VERSION} is not the running process ` +
        `(running ${runningNode}) — run under it, e.g. ` +
        `PATH="${dirname(nvmPinnedNodePath)}:$PATH" npm run test:prereq-c` +
        (nvmPinnedNodePresent ? '' : ` (the pinned nvm Node is not installed at ${nvmPinnedNodePath})`),
    );
  }

  // --- Bun --------------------------------------------------------------
  let bunExecutable: string | null = null;
  let bunVersion: string | null = null;
  const which = spawnSync('which', ['bun'], { encoding: 'utf8' });
  const whichPath = which.status === 0 ? which.stdout.trim() : '';
  if (whichPath !== '') {
    const version = spawnSync(whichPath, ['--version'], { encoding: 'utf8' });
    if (version.status === 0) {
      bunExecutable = whichPath;
      bunVersion = version.stdout.trim();
    }
  }
  if (bunExecutable === null) {
    missing.push('bun executable not found on PATH (the C2 Worker is a Bun process)');
  }

  // --- madventures-tui checkout at or descended from the bound base ------
  const tuiRoot = resolveTuiRoot();
  let tuiHead: string | null = null;
  if (tuiRoot === null) {
    missing.push(
      'madventures-tui checkout not found — set BUILDROOM_PREREQC_TUI_ROOT or place a ' +
        'checkout at ../../madventures-tui or ../madventures-tui relative to this repository',
    );
  } else {
    tuiHead = readGitHead(tuiRoot);
    if (tuiHead === null) {
      missing.push(`madventures-tui checkout at ${tuiRoot} has an unreadable HEAD`);
    } else if (tuiHead !== BOUND_TUI_BASE) {
      // The proofs run against the committed candidate, which descends from
      // the bound base. Accept the base or any descendant; reject anything
      // that is not on the bound base's ancestry (a divergent or unrelated
      // checkout would not carry the bound ledger/protocol/broker seams).
      const ancestry = spawnSync(
        'git',
        ['-C', tuiRoot, 'merge-base', '--is-ancestor', BOUND_TUI_BASE, tuiHead],
        { encoding: 'utf8' },
      );
      if (ancestry.status !== 0) {
        missing.push(
          `madventures-tui checkout at ${tuiRoot} is not on the bound base ancestry ` +
            `${BOUND_TUI_BASE} (observed ${tuiHead})`,
        );
      }
    }
  }

  // --- Bounded C2 Worker entrypoint ------------------------------------
  const workerEntrypoint =
    tuiRoot === null
      ? null
      : join(tuiRoot, 'packages', 'room-runtime-worker', 'src', 'worker.ts');
  if (workerEntrypoint !== null && !existsSync(workerEntrypoint)) {
    missing.push(`bounded C2 Worker entrypoint missing: ${workerEntrypoint}`);
  } else if (workerEntrypoint === null) {
    missing.push('bounded C2 Worker entrypoint unresolvable (no TUI checkout)');
  }

  const facts: PrereqCRuntimeFacts = {
    runningNode,
    pinnedNode: PINNED_NODE_VERSION,
    nvmPinnedNodePresent,
    nvmPinnedNodePath: nvmPinnedNodePresent ? nvmPinnedNodePath : null,
    bunExecutable,
    bunVersion,
    tuiRoot,
    tuiHead,
    tuiAtBoundBase: tuiHead === BOUND_TUI_BASE,
    workerEntrypoint,
  };

  const ok = missing.length === 0 && workerEntrypoint !== null && bunExecutable !== null;

  return {
    ok,
    missing,
    facts,
    launch: ok && workerEntrypoint !== null && bunExecutable !== null
      ? { bunExecutable, workerEntrypoint }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Prelude main (the `test:prereq-c` script runs this file directly).
// ---------------------------------------------------------------------------

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const runtime = resolvePrereqCRuntime();
  process.stdout.write(
    'test:prereq-c — proof runtime facts (measured, never assumed):\n' +
      `  running node:        ${runtime.facts.runningNode}\n` +
      `  pinned node:         ${runtime.facts.pinnedNode}` +
      (runtime.facts.nvmPinnedNodePresent
        ? ` (installed at ${runtime.facts.nvmPinnedNodePath ?? ''})\n`
        : ' (NOT installed under nvm)\n') +
      `  bun:                 ${runtime.facts.bunExecutable ?? 'not found'}` +
      (runtime.facts.bunVersion !== null ? ` (${runtime.facts.bunVersion})\n` : '\n') +
      `  tui checkout:        ${runtime.facts.tuiRoot ?? 'not found'}\n` +
      `  tui HEAD:            ${runtime.facts.tuiHead ?? 'unreadable'}\n` +
      `  tui at bound base:   ${runtime.facts.tuiAtBoundBase ? `yes (${BOUND_TUI_BASE})` : 'NO'}\n` +
      `  worker entrypoint:   ${runtime.facts.workerEntrypoint ?? 'unresolvable'}\n`,
  );
  if (!runtime.ok) {
    process.stderr.write(
      '\nThe Prerequisite C proof runtime is NOT bound; the suite would prove nothing:\n' +
        runtime.missing.map((m) => `  - ${m}\n`).join('') +
        '\nFix the missing bindings (or run `npm test`, where this suite skips itself honestly).\n',
    );
    process.exit(1);
  }
  const launch = runtime.launch;
  if (launch !== null) {
    process.stdout.write(
      `test:prereq-c — launch descriptor: bun=${launch.bunExecutable} ` +
        `worker=${launch.workerEntrypoint}\n` +
        'test:prereq-c — runtime bound; the Prerequisite C suite will run\n',
    );
  }
}
