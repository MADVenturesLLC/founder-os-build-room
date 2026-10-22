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
 *
 * TWO PASSES. Some storage suites run only with the application connected as
 * `br_app_runtime` (`BUILDROOM_RUNTIME_ROLE=1`) and skip otherwise. The runner
 * runs every file in the ordinary pass, then `RUNTIME_ROLE_SUITES` in the
 * runtime-role pass. The ordinary pass may skip with the runtime-role reason
 * because the second pass runs those suites; the second pass may skip nothing.
 */

import { tierVerdict, type SpecSummary } from './runtime-role-tier.js';

/** Node's spec reporter prefixes a skipped test or group with this character. */
const SKIP_MARKER = '﹣';

/** The two passes `test:strict` makes over the suite. */
export type StrictPass = 'ordinary' | 'runtime-role';

/** The reason a storage suite gives when it runs only as `br_app_runtime`, verbatim from its source. */
export const RUNTIME_ROLE_TIER_REASON =
  'runs in the runtime-role tier (npm run test:storage:runtime-role): the journal accepts only br_app_runtime';

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

const notOn = (excluded: NodeJS.Platform) => (platform: NodeJS.Platform): boolean => platform !== excluded;
const onlyOn = (included: NodeJS.Platform) => (platform: NodeJS.Platform): boolean => platform === included;

/**
 * The skips the ordinary pass may contain. Each is bound to a platform, is an
 * explicit opt-in, or is run by the runtime-role pass, and each names where it
 * does run. Anything else skipped fails the run, including a reason that
 * changed wording: that fails closed.
 */
export const STRICT_ALLOWED_SKIPS: readonly AllowedSkip[] = [
  {
    reason: RUNTIME_ROLE_TIER_REASON,
    expectedOn: () => true,
    command: 'test:storage:runtime-role',
    runsWhere: "run in this command's runtime-role pass, as br_app_runtime",
  },
  {
    reason: 'Linux only: the proof reads /proc and ss',
    expectedOn: notOn('linux'),
    command: 'test',
    runsWhere: "Linux only; runs under `npm test` in CI's Linux build-and-test job",
  },
  {
    reason: 'not linux — the real systemd-creds suite did not run',
    expectedOn: notOn('linux'),
    command: 'test:custody:linux',
    runsWhere: 'Linux only, via `npm run test:custody:linux`; no CI job runs it today',
  },
  {
    reason: 'BUILDROOM_CUSTODY_LINUX is not set — run `npm run test:custody:linux` to exercise real systemd-creds',
    expectedOn: onlyOn('linux'),
    command: 'test:custody:linux',
    runsWhere: 'uses the real systemd-creds store, so it runs only when asked: `npm run test:custody:linux`; no CI job runs it today',
  },
  {
    reason: 'not darwin — the real-Keychain suite did not run',
    expectedOn: notOn('darwin'),
    command: 'test:custody:macos',
    runsWhere: "macOS only, via `npm run test:custody:macos`, which CI's macOS job runs",
  },
  {
    reason: 'BUILDROOM_CUSTODY_MACOS is not set — run `npm run test:custody:macos` to exercise the real Keychain',
    expectedOn: onlyOn('darwin'),
    command: 'test:custody:macos',
    runsWhere:
      "writes to the real macOS Keychain under a synthetic service name, so it runs only when asked: `npm run test:custody:macos`, which CI's macOS job runs",
  },
  {
    reason: 'macOS only: the occupancy-lock proof uses the macOS O_EXLOCK kernel lock',
    expectedOn: notOn('darwin'),
    command: 'test',
    runsWhere: "macOS only; runs under `npm test` in CI's macOS build-and-test job",
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

/** The runtime-role pass exists to run what the ordinary pass skipped, so it may skip nothing. */
export function isAllowedSkip(marker: SkipMarker, platform: NodeJS.Platform, pass: StrictPass): boolean {
  if (pass === 'runtime-role') return false;
  return STRICT_ALLOWED_SKIPS.some((allowed) => allowed.reason === marker.reason && allowed.expectedOn(platform));
}

/**
 * Why a finished strict pass must NOT be reported as a pass, or `null` when it
 * may be. The counter checks are `tierVerdict`'s; the skip markers are added
 * here because those counters cannot see a skipped group.
 */
export function strictVerdict(
  exitCode: number | null,
  summary: SpecSummary | undefined,
  markers: readonly SkipMarker[],
  platform: NodeJS.Platform,
  pass: StrictPass,
): string | null {
  const base = tierVerdict(exitCode, summary);
  const refused = markers.filter((marker) => !isAllowedSkip(marker, platform, pass));
  if (refused.length === 0) return base;
  const listed = refused.map((m) => `  - ${m.name} # ${m.reason === '' ? '(no reason given)' : m.reason}`).join('\n');
  const skipped = `${refused.length} skipped (tests or whole groups) that the ${pass} pass may not skip:\n${listed}`;
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
    missing.push(
      'MADBRIDGE_CHECKOUT is not set. Point it at a madventures-tui clone that contains commit 7d37a61, so the pinned MadBridge blobs are re-resolved. ' +
        'It is separate from BUILDROOM_PREREQC_TUI_ROOT, which the Prerequisite C check reads; the same clone may serve both if it contains that commit.',
    );
  }
  return missing;
}

export interface PassResult {
  readonly summary: SpecSummary;
  readonly markers: readonly SkipMarker[];
  readonly fileCount: number;
}

/** The text a strict pass may be cited as: both passes, and every allowed skip with where it runs. */
export function reachReport(ordinary: PassResult, runtimeRole: PassResult): string {
  const lines = [
    `ordinary pass: ${ordinary.summary.tests} tests in ${ordinary.fileCount} files ran and passed`,
    `runtime-role pass: ${runtimeRole.summary.tests} tests in ${runtimeRole.fileCount} files ran and passed as br_app_runtime, nothing skipped`,
  ];
  const counts = new Map<string, number>();
  for (const marker of ordinary.markers) counts.set(marker.reason, (counts.get(marker.reason) ?? 0) + 1);
  for (const [reason, count] of counts) {
    const where = STRICT_ALLOWED_SKIPS.find((allowed) => allowed.reason === reason)?.runsWhere ?? '';
    lines.push(`  - ${count} skipped in the ordinary pass: "${reason}" (${where})`);
  }
  if (counts.size === 0) lines.push('  - nothing skipped in the ordinary pass');
  return lines.join('\n');
}
