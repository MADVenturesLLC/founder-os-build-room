/**
 * The judgement behind `npm run test:strict`: did the whole suite run?
 *
 * `npm test` lets suites skip themselves when their environment is missing,
 * which is the right default for a developer without a database. It is the
 * wrong basis for a claim that "all tests pass": a run with no database skips
 * every storage group and still exits 0. `test:strict` refuses to start
 * without the environment, and refuses to call a finished run a pass when
 * anything skipped that is not on the short list below.
 *
 * SKIPPED GROUPS ARE INVISIBLE TO NODE'S COUNTERS. A `describe(..., { skip })`
 * registers none of its children, so Node's `skipped` total stays 0 and its
 * `tests` total simply shrinks. The spec reporter does print a skip marker
 * (U+FE63) for every skipped group and every skipped test, so the verdict here
 * reads those markers rather than trusting the counter.
 * `test/strict-reach.test.ts` pins that behaviour against a real Node run.
 */

import { tierVerdict, type SpecSummary } from './runtime-role-tier.js';

/** Node's spec reporter prefixes a skipped test or group with this character. */
const SKIP_MARKER = '﹣';

export interface SkipMarker {
  readonly name: string;
  /** The text after ` # `, or '' when the skip gave no reason. */
  readonly reason: string;
}

export interface AllowedSkip {
  /** The exact reason a suite prints, verbatim from its source. */
  readonly reason: string;
  /** Whether the skip is expected on this platform; anywhere else it fails the run. */
  readonly expectedOn: (platform: NodeJS.Platform) => boolean;
  /** The npm script that does run it. */
  readonly command: string;
  /** Where and why it runs instead, printed with every report. */
  readonly runsWhere: string;
}

/**
 * The skips a strict run may contain. Each is bound to a platform or is an
 * explicit opt-in, and each names where it does run. Anything else skipped
 * fails the run, including a reason that changed wording: that fails closed.
 */
export const STRICT_ALLOWED_SKIPS: readonly AllowedSkip[] = [
  {
    reason: 'Linux only: the proof reads /proc and ss',
    expectedOn: (platform) => platform !== 'linux',
    command: 'test',
    runsWhere: "Linux only; runs under `npm test` in CI's Linux build-and-test job",
  },
  {
    reason: 'not linux — the real systemd-creds suite did not run',
    expectedOn: (platform) => platform !== 'linux',
    command: 'test:custody:linux',
    runsWhere: 'Linux only, via `npm run test:custody:linux`; no CI job runs it today',
  },
  {
    reason: 'BUILDROOM_CUSTODY_MACOS is not set — run `npm run test:custody:macos` to exercise the real Keychain',
    expectedOn: (platform) => platform === 'darwin',
    command: 'test:custody:macos',
    runsWhere:
      "writes to the real macOS Keychain under a synthetic service name, so it runs only when asked: `npm run test:custody:macos`, which CI's macOS job runs",
  },
];

/** Remove ANSI colour sequences, which some environments force onto a non-terminal. */
function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/** Every skipped test and skipped group the spec reporter printed, in order. */
export function readSkipMarkers(output: string): readonly SkipMarker[] {
  return stripAnsi(output)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(SKIP_MARKER))
    .map((line) => {
      const body = line.slice(SKIP_MARKER.length).trim();
      const split = body.lastIndexOf(' # ');
      const head = split === -1 ? body : body.slice(0, split);
      const reason = split === -1 ? '' : body.slice(split + 3).trim();
      return { name: head.replace(/\s\([^)]*\)$/, '').trim(), reason };
    });
}

export function isAllowedSkip(marker: SkipMarker, platform: NodeJS.Platform): boolean {
  return STRICT_ALLOWED_SKIPS.some((allowed) => allowed.reason === marker.reason && allowed.expectedOn(platform));
}

/**
 * Why a finished strict run must NOT be reported as a pass, or `null` when it
 * may be. The counter checks are `tierVerdict`'s; the skip markers are added
 * here because those counters cannot see a skipped group.
 */
export function strictVerdict(
  exitCode: number | null,
  summary: SpecSummary | undefined,
  markers: readonly SkipMarker[],
  platform: NodeJS.Platform,
): string | null {
  const base = tierVerdict(exitCode, summary);
  const refused = markers.filter((marker) => !isAllowedSkip(marker, platform));
  if (refused.length === 0) return base;
  const listed = refused.map((m) => `  - ${m.name} # ${m.reason === '' ? '(no reason given)' : m.reason}`).join('\n');
  const skipped = `${refused.length} skipped (tests or whole groups) that a strict run may not skip:\n${listed}`;
  return base === null ? skipped : `${base}\nand ${skipped}`;
}

export interface PrerequisiteFacts {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly hasPgBinaries: boolean;
  /** `resolvePrereqCRuntime().missing`: the proof runtime's own named gaps. */
  readonly prereqCMissing: readonly string[];
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

/** Every missing prerequisite, named, so one attempt shows them all. */
export function missingPrerequisites(facts: PrerequisiteFacts): readonly string[] {
  const missing: string[] = [];
  if (isBlank(facts.env['TEST_DATABASE_URL'])) {
    missing.push(
      'TEST_DATABASE_URL is not set. Point it at a THROWAWAY database, never the deployed one (whose variable is DATABASE_URL).',
    );
  }
  if (!facts.hasPgBinaries) {
    missing.push(
      'PostgreSQL server binaries (initdb, pg_ctl, postgres) were not found. Set BUILDROOM_TEST_PG_BINDIR to a PostgreSQL bin directory, or put pg_ctl on PATH.',
    );
  }
  for (const gap of facts.prereqCMissing) {
    missing.push(`Prerequisite C proof runtime: ${gap}`);
  }
  if (isBlank(facts.env['MADBRIDGE_CHECKOUT'])) {
    missing.push('MADBRIDGE_CHECKOUT is not set. Point it at a madventures-tui clone so the pinned MadBridge blobs are re-resolved.');
  }
  return missing;
}

/** The sentence a strict pass may be cited as, allowed skips included by name. */
export function reachReport(summary: SpecSummary, markers: readonly SkipMarker[], fileCount: number): string {
  const head = `${summary.tests} tests in ${fileCount} files ran and passed`;
  if (markers.length === 0) return `${head}; nothing was skipped.`;
  const counts = new Map<string, number>();
  for (const marker of markers) counts.set(marker.reason, (counts.get(marker.reason) ?? 0) + 1);
  const lines = [...counts].map(([reason, count]) => {
    const where = STRICT_ALLOWED_SKIPS.find((allowed) => allowed.reason === reason)?.runsWhere ?? '';
    return `  - ${count} skipped: "${reason}" (${where})`;
  });
  return `${head}; ${markers.length} skipped by platform or opt-in, not run here:\n${lines.join('\n')}`;
}
