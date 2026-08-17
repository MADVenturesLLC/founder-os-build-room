# Phase 2 — known limits, recorded rather than fixed

Findings raised during review of the Phase 2 cloud skeleton that are **real,
understood, and deliberately not addressed in this phase**. Each one names what
breaks, when it starts to matter, and what closing it would take.

This file exists because "we know" is worthless unless it is written down. A
limit that lives only in a reviewer's comment thread is indistinguishable, six
months later, from one nobody noticed.

Nothing here is a waiver. None of these is a Founder decision, and none of them
authorizes anything — recording a limit is not accepting a risk on the
Founder's behalf. Where a limit needs a Founder call, this file says so.

---

## 1. Append cost grows with the log — replay is unbounded

**What it is.** `PostgresLedgerStore.append` reads the whole room log and
re-reduces it on every write. Cost per append therefore grows with log length,
so N appends cost O(N²) in total. A long-lived room slows every write, and once
replay exceeds the connection's `statement_timeout`, writes start failing
outright rather than merely getting slow.

**Why the design is still right.** Rebuild-from-log is what makes "survives a
restart without data loss" a property rather than a hope: no state lives in the
process, so no state can be lost with it. The problem is the missing bound, not
the approach.

**When it starts to matter.** Not at Phase 2 scale. A Phase 2 run appends one
event to a fresh room. It matters as soon as a room accumulates a real build's
worth of events — hundreds, not tens — which is Phase 3 onwards.

**What closing it takes.** A cached reduced state per room, keyed by
`logLength`, so a replay only runs when the cache is stale; or periodic
snapshots with tail-only replay. Either is a storage-layer change with its own
correctness argument about snapshot staleness, which is more than this phase's
scope holds.

**Raised by** CodeRabbit on PR #2, which said in terms that it "does not need to
land in Phase 2, but record the limit." This is that record.

---

## 2. The three-run gate counts within one harness invocation

**What it is.** `gateStatus` derives its verdict from the sequence held in
memory by the current `phase2:runs` process. The CLI starts from
`emptySequence()` every time and writes its own evidence file. So a run of
three attempts that records a failure could, in principle, be followed by a
fresh invocation that records three passes — and the second file, read alone,
shows a satisfied gate.

**What actually prevents that, and why it is not the harness.** Bundles are
committed and never edited; `evidence/README.md` states that a failed run is
retained on the same terms as a passing one, and exit criterion 4 requires a
failure to be visible as an interruption of the sequence rather than absent
from it. The control is the commit history and the retention rule — a
suppressed bundle is a missing file in a directory whose README says files are
never removed, which is visible in a diff.

**That is a weaker control than a persisted sequence, and calling it equivalent
would be dishonest.** It relies on the operator committing what the harness
produced. It is an *audit* control, not a *mechanical* one.

**When it starts to matter.** As soon as gate evidence is produced by anything
other than a Founder-witnessed session — an automated re-run, a scheduled job,
or any path where nobody would notice a missing file.

**What closing it takes.** An append-only run history loaded before runs are
appended, or persisting each run before `gateStatus` is computed. Both need a
decision about where that history lives (the ledger itself is the obvious
candidate) and how a legitimately fresh start is distinguished from a
suppressed one — which is a design question, not a patch.

**Raised by** CodeRabbit on PR #2.

---

## 3. The restart check proves ordering, not causation

**What it is.** `waitForNewProcess` now compares against the process identity
read immediately before `platform.restart`, so a new process can only satisfy
the condition if it appeared **after** the request. That closes the defect where
a run credited a restart that predated its own request.

It does not establish that the run's request **caused** the restart. If two
restarts are performed in quick succession, or a platform-initiated replacement
overlaps an operator one, a run can still credit a process change it did not
cause — provided the change lands after its request.

**Observed, not hypothetical.** In the 2026-08-17T23:47 bundle, run #2's new
process appeared **22.8 seconds** after its request and run #3's appeared
**2.0 seconds** after its own. A Railway restart does not complete in two
seconds, so run #3 most likely observed the tail of the same restart action
that run #2 had already credited. Both runs pass the ordering test; only one of
them plausibly caused what it counted.

**Why it is not closed here.** Distinguishing "the restart I asked for" from
"a restart" needs a platform-side handle the harness does not have — a
deployment or restart id returned by the provider and echoed back by the
service, or an API-driven restart whose response identifies the action.
`ExternalPlatform` exists precisely because this session has no Railway API
access, and inventing a causation claim on top of a timing observation would
repeat the original mistake in a subtler form.

**What reduces it in practice.** Spacing restarts so each run's request is the
only outstanding one — which is an operating discipline, not a mechanism, and
is stated here as such. A run whose new process appears implausibly fast after
its request deserves the same suspicion as one that appears before it.

**Raised by** `builder` while reading the 23:47 bundle, after the ordering fix
had already landed.

---

## 4. A push to the branch redeploys the service, and the gate cannot survive it

**What it is.** Railway watches the PR branch, so **every `git push` replaces
the running process**. The Founder-defined run requires the service to answer
`/health` continuously across a 30-second dwell, and a deploy landing inside
that window fails `deploys_and_stays_up` — correctly, since the service
genuinely stopped answering.

**Observed.** `e5f5ff8` was pushed at `23:49:03`, the gate was launched at
`~23:49:50`, and the deploy landed at `23:50:07` — inside run #1's dwell. All
three runs failed with `502 Application failed to respond`. The bundle records
`deploys_and_stays_up` as failed for all three, which read literally is a claim
about the service that is not true: the service was healthy and was being
replaced.

**The operating rule this implies.** *Never launch the gate within a few
minutes of a push, and confirm a stable `startedAt` first.* The sequence is:
push → wait for the deploy → confirm the same `startedAt` across at least a
minute → then launch. Committing the evidence bundle **after** the gate rather
than before is part of the same rule.

**Why it is a limit and not a bug.** The harness is right to fail here — a
service that stops answering has not stayed up, and a harness that excused a
deploy would excuse a crash. Closing it properly means a deployment-aware
platform port that can distinguish "replaced by a deploy I did not request"
from "stopped answering", which needs the same platform-side handle §3 needs.
Until then it is a scheduling discipline, and it is written down here because
it was learned by burning a sequence.

**Raised by** `builder`, from the 2026-08-17T23:50 bundle.

---

## 5. Restart cadence is timed against a clock the operator cannot see

**What it is.** With `ExternalPlatform`, a human performs each restart while
the harness waits. But the harness's restart request comes **~35 seconds into
each run** — after the 30-second dwell and the write — and the operator has no
view of that clock. Restart too early and it lands during the next run's dwell,
failing `deploys_and_stays_up`; too late and the 180-second window expires,
failing `survives_restart`. Both failure modes were hit on 2026-08-17, in that
order.

**What makes it worse than it sounds.** The service returns in ~12 seconds, so
"wait for it to come back, then restart again" — which reads like patience —
produces restarts roughly every 12 seconds, four times faster than the run
cycle can absorb. Six process starts landed between `23:50:07` and `23:51:40`.

**What reduces it.** A long `PHASE2_RESTART_TIMEOUT_MS` so the window cannot
expire, plus an explicit instruction to wait a fixed wall-clock interval after
the service returns rather than "until it returns". Neither is a mechanism.

**What would close it.** `PHASE2_RESTART_COMMAND` pointed at a real platform
restart, so the harness performs the restart itself at exactly the right moment
and no human timing is involved. That needs Railway API access this session
does not have — the same gap that makes the port `external` in the first place.

**Raised by** `builder`, from the 2026-08-17T23:47 and T23:50 bundles.

---

## 6. `evidence/` holds bundles produced by a harness with known defects

**What it is.** Both bundles committed under `evidence/` were produced before
two harness defects were found and fixed: a restart comparison against a stale
process identity, and an event-id comparison that could not fail. Neither
bundle is sound evidence for the `survives_restart` condition.

**Status: open until the gate is re-run.** This is not a limit being accepted —
it is work outstanding. `evidence/README.md` opens with the full account, and
the bundles are retained rather than deleted because a retracted claim is part
of the record.

**Raised by** CodeRabbit on PR #2, fixed in the harness, and closed only when a
bundle produced by the fixed harness supersedes both.

---

## Related

- `docs/phase-2-provider-controls.md` — the Neon spend-control gap, which is a
  Founder-accepted limit rather than a deferred one
- `evidence/README.md` — what the retained bundles do and do not support
- `packages/control-plane/src/store.ts` — where limit 1 lives
- `packages/run-harness/src/sequence.ts` — where limit 2 lives
