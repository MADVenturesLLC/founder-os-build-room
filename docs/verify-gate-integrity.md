# Verify-check integrity gate — an unverified check is a failing check

**Status: ADOPTED.** Founder-merged PR #5 (2026-08-21) added `scripts/verify-check.sh`,
the `gate:verify-check` npm script, and the CI step below. `npm run
gate:verify-check` runs today as a required step in the `build-and-test` job
of `.github/workflows/ci.yml`. The document below is retained as the design
record; it is no longer a proposal awaiting adoption.

## The defect it closes

The Build Room's gates validate **presence**, never **runnability**:

- `attribution-shape-check.sh` exits 0 when the attributed block is
  well-formed. If the checker itself could not run — missing on base,
  unreadable, failed to execute — the workflow's bash step fails loudly in
  CI, but nothing anywhere refuses on "this gate did not verify."
- `path-audit.sh` exits 0 when every referenced path resolves. If the
  audit surface or a tool vanished, the run fails or silently passes with
  an empty surface; nothing distinguishes "audited and clean" from
  "audited nothing".

The failure mode this leaves open: **a check that silently did nothing is
reported as clean.** A missing script, a tool absent from PATH, a CI step
that never ran — all can read as green.

## The rule adopted

**Unchecked counts as failing.** A check that could not be verified is
treated exactly like a failed check:

- every declared check runs and passes → `exit 0`
- a check cannot run (tool/script missing, unreadable, not a regular
  file, not executable, mktemp failed, or no checks declared) →
  `exit 2` — **never reported as clean**
- at least one check runs and fails **and no check is unverified** →
  `exit 1`

**UNVERIFIED takes precedence over FAILED.** If any check could not run,
the gate exits 2 even if other checks also failed. An unverified check
means we genuinely cannot know whether the failed check would have passed
had it been able to run, so we cannot honestly report "clean". Exit 1
applies only when every declared check actually ran.

This is the "unchecked = failing" behavior taken from the procoder audit
(`build-room/source/procoder-audit/README.md`, verified against
`internal/gate/gate.go` 2026-08-20, clone `d410b7f`). The audit's verdict
was audit-don't-install; this is the one idea adopted, as a feature, not
as a dependency.

## What it changes

- `scripts/verify-check.sh` (new) — runs the declared gates and enforces
  the rule above.
- `package.json` — new `gate:verify-check` npm script.
- `.github/workflows/ci.yml` — new step in the build-and-test job.

It does **not** change attribution-shape, path-audit, or their workflows.
It is an envelope that refuses to call a gate "clean" when the gate could
not verify.

## Authority

This is a `builder` change to repository tooling under the same class as
`DEC-20260815-18` (gate conventions), adopted by convention here and not
governance: FounderOS remains the system of record. The change adds a
check; it removes none. Merging requires the founder's PR approval like
any other PR in this repository.

## Evidence

- Local self-test harness (explicit cases, asserted counts):
  - PASS case — all checks pass → `0`
  - FAIL case — one check exits 1 → `1`
  - UNVERIFIED case — a check's tool is missing → `2`
  - EMPTY case — no checks declared → `2`
- `bash -n` on `scripts/verify-check.sh`
- CI green on the PR (required checks: CI, Path Audit, Attribution Shape)
