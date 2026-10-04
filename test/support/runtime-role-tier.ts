/**
 * The runtime-role tier: which storage suites run with the application's data
 * access connected as `br_app_runtime` (PR 2b Tranche D; Founder decision of
 * 2026-10-04, D3).
 *
 * WHY A TIER. Every other storage suite connects the application as a
 * superuser or as the database owner, so none of them can discover that the
 * application needs a privilege `br_app_runtime` does not hold. After cutover
 * the application connects as that role and nothing else; a statement it
 * issues without a grant fails in production with `42501`. This tier runs the
 * application's real data-access code — the same stores, gateway surface,
 * leadership coordinator and HTTP server — over a genuine `br_app_runtime`
 * login on an owned instance migrated through the full canonical sequence, so
 * each missing grant fails here, in PostgreSQL's own words, naming the
 * privilege, before it can fail in production.
 *
 * The partition below is exhaustive on purpose: `runtime-role-tier.test.ts`
 * fails when a `*.storage.test` suite is in neither list, so adding a storage
 * suite forces a decision about which side it is on, and an exclusion carries
 * its reason in the open rather than in anyone's memory.
 *
 * Names are suite file names without the `.storage.test.js` suffix.
 */

/** Suites that run in the tier. Each one reaches the application only through `br_app_runtime`. */
export const RUNTIME_ROLE_SUITES: readonly string[] = [
  'control-plane-postgres',
  'gate-runs',
  'gateway-enroll-redeem',
  'gateway-heartbeat',
  'gateway-invariants',
  'gateway-lanes',
  'gateway-leadership',
  'gateway-online',
  'gateway-projection',
  'gateway-registry-immutability',
  'gateway-retention',
  'gateway-session',
  'phase3-heartbeat-evidence',
  'phase3-run-events',
  'phase3-run-routes',
  'runtime-role-boot',
];

/**
 * Storage suites that do NOT run in the tier, each with why. An excluded suite
 * is not an unexamined one: every reason names what the suite proves instead,
 * or why a database identity is not its subject.
 */
export const RUNTIME_ROLE_EXCLUDED: Readonly<Record<string, string>> = {
  'boot-no-ddl':
    'proves the boot issues no DDL by installing a superuser event trigger and booting as its own fixture login; the runtime login\'s boot is runtime-role-boot\'s subject',
  'journal-append-atomicity':
    'its subject is the journal routine\'s atomicity; it already runs the append over a genuine br_app_runtime login on its own owned instance and drops the cluster-wide roles at teardown',
  'journal-authority':
    'the journal authority denial matrix: every row already executes over a genuine br_app_runtime login, and it creates and drops the cluster-wide roles itself',
  'journal-migration-nonsuperuser':
    'proves the canonical sequence applies for a plain non-superuser administrative login on three throwaway clusters; it never runs the application',
  'journal-store':
    'already builds the journal store on a genuine br_app_runtime login on its own owned instance, and manages the cluster-wide roles itself',
  'room-runtime-phase1-c2':
    'uses no database: its storage suffix marks the proof-runtime gate (Bun worker over a supervised transport), not a data-access identity',
  'schema-preflight':
    'builds role fixtures (forbidden attributes, memberships) and runs the audit against them; role management is its subject, and runtime-role-boot covers the audit on the real runtime login',
  'worker-supervisor.prereq-c':
    'uses no database: it proves the gateway-side worker supervisor over a private transport, under its own gate (npm run test:prereq-c)',
};

export interface SpecSummary {
  readonly tests: number;
  readonly pass: number;
  readonly fail: number;
  readonly cancelled: number;
  readonly skipped: number;
  readonly todo: number;
}

/** Remove ANSI colour sequences, which some CI environments force onto a non-terminal. */
function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * Read the final counters of Node's `spec` reporter. Returns `undefined` when
 * ANY counter is missing, so a change in the reporter's format makes the tier
 * fail loudly instead of passing on a summary nobody could read.
 */
export function readSpecSummary(output: string): SpecSummary | undefined {
  const text = stripAnsi(output);
  const read = (name: string): number | undefined => {
    const matches = [...text.matchAll(new RegExp(`^ℹ ${name} (\\d+)\\s*$`, 'gm'))];
    const last = matches.at(-1);
    return last === undefined ? undefined : Number(last[1]);
  };
  const tests = read('tests');
  const pass = read('pass');
  const fail = read('fail');
  const cancelled = read('cancelled');
  const skipped = read('skipped');
  const todo = read('todo');
  if (
    tests === undefined ||
    pass === undefined ||
    fail === undefined ||
    cancelled === undefined ||
    skipped === undefined ||
    todo === undefined
  ) {
    return undefined;
  }
  return { tests, pass, fail, cancelled, skipped, todo };
}

/**
 * Why a finished run must NOT be reported as a pass, or `null` when it may be.
 * A tier that exercises the runtime role cannot succeed by skipping: a suite
 * that quietly skipped would report green for a run that proved nothing.
 */
export function tierVerdict(exitCode: number | null, summary: SpecSummary | undefined): string | null {
  if (summary === undefined) {
    return 'the test runner printed no readable summary, so the result cannot be trusted';
  }
  if (exitCode !== 0) return `the test runner exited ${String(exitCode)} (${summary.fail} failed, ${summary.cancelled} cancelled)`;
  if (summary.tests === 0) return 'no tests ran';
  if (summary.skipped > 0 || summary.todo > 0) {
    return `${summary.skipped} skipped and ${summary.todo} todo: the tier must run every test it names`;
  }
  if (summary.fail > 0 || summary.cancelled > 0) return `${summary.fail} failed, ${summary.cancelled} cancelled`;
  if (summary.pass !== summary.tests) return `${summary.pass} of ${summary.tests} passed`;
  return null;
}
