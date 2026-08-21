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

**What closing it takes — the design, now decided.** The two open questions
were where the history lives and how a legitimately fresh start is
distinguished from a suppressed one. Both resolve the same way, and the second
dissolves rather than gets answered:

- **The history lives in Postgres**, in a `build_room_gate_runs` table beside
  the ledger, carrying the same `build_room_events_immutable()` UPDATE/DELETE
  triggers. The control plane assigns `seq` under a lock, exactly as it does
  for log positions; the harness cannot choose it.
- **It is global to the database and never reset** — not scoped per commit.
  Scoping to a commit would make a trivial push a way to clear a failure, which
  is the same hole one level up.
- **There is no "fresh start" to distinguish.** A re-invocation does not begin
  a new sequence; it appends to the existing one. An invocation that fails and
  is re-run writes rows 1(fail), 2, 3 then 4, 5, 6 — and the gate is satisfied
  at row 6 by a streak that is genuinely three consecutive passes, while row 1
  remains permanently in the record and in every bundle assembled afterwards.
  That is exactly what exit criterion 4 asks for: the failure is *an
  interruption of the sequence rather than absent from it*. The defect was
  never that re-running is possible — it is that the record restarted.
- **Unreachable storage must be a hard failure, not a fallback to memory.** A
  silent fallback restores the hole under a different name.

Concretely: migration `0005_gate_runs`; `appendGateRun` / `listGateRuns` in the
store; token-guarded `POST`/`GET /gate/runs`; the CLI loading history before the
run loop and appending each run as it completes; `gateStatus` reading the
persisted sequence.

(The number moved. This plan was written when `0003` was free; the gateway
registry took it, and `0004_validate_pending_is_bare` took the next. `0005` is
the first free id as of 2026-08-21 — check `MIGRATIONS` again before writing
it rather than trusting this line, since the same drift is what made the
original wrong.)

**Why this is not in PR #2, and the sequencing that follows.** Closing §2 means
changing the harness *in a way that changes what a run must show to pass*, and
§8 below establishes what that costs: a bundle produced by a superseded harness
is not evidence for the harness that ships. §8 was closed by *re-running* —
three fresh passes from the fixed code — and the same would be required here.

Re-running is not available. The Railway project token that drove the restarts
was revoked on 2026-08-18 immediately after the gate was satisfied, verified
against the API (`projectToken` → *"Project Token not found"*). Minting another
is a Founder act. So landing the fix here would trade a documented audit control
for an untested mechanical one **and** leave §8 open with no path to close it —
strictly worse than the state this PR is in.

**The rule that does the work here is narrower than "the harness changed", and
an earlier draft of this section got it wrong.** That draft said no source under
`packages/` had changed since `b731ba7`, and rested the argument on that. It is
no longer true: the dwell's identity check was hardened after review found that
a failed or `startedAt`-less `/version` recorded nothing and let the dwell pass
reporting *"identity unavailable"* (see §7). The bundle is nevertheless **not**
superseded, and the reason is the general one:

> A harness change supersedes prior evidence when the recorded observations no
> longer demonstrate the condition. When the recorded observations already
> satisfy the stricter rule — and the bundle carries the data to show it — the
> evidence stands and the change is hardening.

Checked, not assumed: all three runs of
`phase2-runs-2026-08-18T01-20-03-087Z.json` record exactly one identity across
11 dwell samples each, so every sample returned a usable `startedAt` and the
stricter rule would have passed those runs unchanged. §8's case was the other
kind — the defective harness produced a demonstrably false pass (a `processAfter`
2.1s *before* its own `requestedAt`), which no re-reading of the bundle could
repair.

§2 is the first kind, which is why it still cannot land here: a persisted run
history changes what the gate counts, so the recorded runs would no longer be
the whole record the verdict was computed from.

**Therefore:** §2 stays open through Phase 2, and closes in a follow-up PR
carrying its own gate re-run, before the gate is next relied upon. Its urgency
is set by *when gate evidence stops being Founder-witnessed* — the condition
stated above — not by Phase 2's merge.

**Raised by** CodeRabbit on PR #2. Design decided 2026-08-18; execution
deferred with the reason recorded rather than the limit quietly carried.

---

## 3. The restart check proves ordering, not causation — NARROWED

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

**NARROWED, 2026-08-18.** `scripts/railway-restart.sh` performs the restart
through Railway's API, and `PHASE2_RESTART_COMMAND` points the harness at it —
so the call that requests the restart is the call that performs it. A run can
no longer credit a restart nobody asked for, because the asking and the doing
are the same act.

What remains: Railway's `deploymentRestart` returns `true`, not a restart
identifier, so the link is "this call performed a restart" rather than "the
process now serving is the one this call produced". A concurrent restart from
another source could still interleave. That is a materially smaller gap than a
human with a stopwatch, and it is stated rather than treated as closed.

**The script was rewritten after the gate ran, and re-verified live rather than
against a stand-in.** Review found it built and read JSON with string tools —
greedy `sed` capturing the last id on a line, unescaped interpolation, and
`--fail-with-body` blind to GraphQL errors arriving at HTTP 200 — and that
`first:1` was being treated as "newest" when Railway documents no ordering
guarantee. The rewrite (jq throughout, explicit `createdAt` sort) was first
verified only against a locally written fake endpoint, which is a weaker claim
than the version it replaced: the pre-rewrite script's live verification *was*
the three gate runs. A fake returns the shape its author assumed, so it cannot
falsify the assumption.

Verified against the real API on 2026-08-18 under a second Founder-issued
project token, revoked immediately afterwards:

- `deployments(first:20, …)` is accepted, returns 20 nodes, and **every node
  carries a non-null `createdAt`** — the assumption the new sort depends on,
  and the one the fake could not test.
- Railway does in fact return newest-first, so the old `first:1` was
  accidentally correct; the sort no longer depends on that holding.
- End to end: request at `02:59:27.074Z` → the script selected deployment
  `17337d55` (the newest `SUCCESS`) → `/version` `startedAt` moved to
  `02:59:29.804Z`, strictly after the request. `/health` and `/ready` both
  answered afterwards, database reachable.

**The client-side sort moved the ordering assumption rather than removing it —
corrected 2026-08-21.** The rewrite above replaced `first:1` with "pull a page
and sort by `createdAt` here", and described that as no longer trusting
Railway's ordering. It still did. Sorting a page is exact only if the page
CONTAINS the newest deployment, and with no documented ordering the thing that
would have to promise that is the same guarantee the sort was introduced to
stop relying on. The dependence did not go away; it went one level down, where
it stopped being visible in the code.

The live check on 2026-08-18 could not have caught it: it observed
`first:20` returning twenty nodes, which is exactly the case where the set is
truncated and the newest is not provably present. That the newest *was*
present followed from the separate observation that Railway returns
newest-first — an observation this section is otherwise careful to treat as not
a guarantee.

The script now refuses rather than assumes. `PAGE_SIZE` is 50, and a response
carrying a full page exits non-zero naming the reason, because a truncated page
is one the script cannot establish the newest deployment from. Fewer than
`PAGE_SIZE` edges means the page is the complete set and the sort is exact.

**What remains open.** `PAGE_SIZE` is an interim bound, not a fix: a service
that accumulates more than fifty deployments will start refusing, and the
message says to raise it. The real fix is cursor pagination to exhaustion, or a
server-side sort, and both need Railway's connection schema (`pageInfo`,
`after`, any ordering argument) confirmed against the live API under a scoped
token — which is a Founder-issued credential, so it is not something this
session can establish on its own. Refusing was chosen over proceeding because
a gate that stops loudly costs a token and a minute, and a gate that restarts a
deployment it cannot identify writes bad evidence into a run bundle.

**Raised by** `builder` while reading the 23:47 bundle, after the ordering fix
had already landed. Narrowed once the Founder issued a scoped Railway project
token; the rewrite re-verified live under a second one. The residual ordering
dependence was found on 2026-08-21 in the Phase 2 close-out review
(`HO-20260818-01`, finding 6).

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

## 5. Restart cadence is timed against a clock the operator cannot see — CLOSED

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

**CLOSED, 2026-08-18.** `PHASE2_RESTART_COMMAND` now points at
`scripts/railway-restart.sh`, so the harness performs each restart itself at
exactly the moment it wants one. There is no human in the loop and therefore no
human timing to get wrong. The Founder issued a Railway **project** token —
scoped to one project and environment — held in the gate's shell environment
only and revoked afterwards; it appears in no committed artifact
(`DEC-20260815-07`).

This also matters for the dwell. Now that a mid-dwell identity change **fails**
`deploys_and_stays_up` (§7), a mistimed manual restart is no longer a missed
window but an outright failure — so keeping a human in the loop had become
riskier, not safer, exactly as the fix landed.

**Raised by** `builder`, from the 2026-08-17T23:47 and T23:50 bundles.

---

## 6. Leap seconds are checked for shape, not against the IERS schedule

**What is fixed.** Second 60 is now validated after applying the numeric
offset, so RFC3339 §5.7's own example — `2017-01-01T00:59:60+01:00`, the
2016-12-31 leap second seen from +01:00 — is accepted where the previous
local-fields check wrongly refused it.

**What is deliberately NOT fixed.** `occurredAt` still accepts a second 60 at
the end of *any* UTC day, including days on which no leap second was scheduled:
`2026-02-28T23:59:60Z` passes, and IERS Bulletin C 71 and 72 confirm no leap
second in 2026 at all.

**Why the schedule is not embedded.** Validating against the real schedule
means shipping the IERS leap-second table, which is amended by bulletin roughly
every six months. A table baked into this service goes stale silently, and a
stale table **rejects a genuinely valid future timestamp** — turning an
over-permissive check by one second per month into a wrongly-rejected real
event. For an `occurredAt` field the trade is not close: the residual looseness
is a single non-existent second at a month boundary, and the alternative
failure mode rejects real data.

**What would close it.** A maintained leap-second source consulted at runtime,
or a decision that non-Z leap seconds are simply refused. Both are choices this
phase should not make unilaterally, since either changes what the ledger will
accept.

**Raised by** CodeRabbit on PR #2; the offset half taken, the schedule half
declined with this reasoning.

---

## 7. The dwell now samples identity — CLOSED, and demonstrated

**What it is.** `deploys_and_stays_up` was answered by `/health` alone, so a
process **replacement** during the 30-second dwell was invisible: every sample
answered, because the replacement answered too.

**Observed in the satisfied gate itself.** Run #1 of the
`23-58-26` bundle has a dwell ending at `23:56:25.242Z` and a new process
starting at `23:56:25.152Z` — ninety milliseconds earlier. The dwell passed
across a replacement it could not see. Raised by CodeRabbit on PR #2.

**What changed.** Each dwell sample now reads `/version` as well, records every
distinct identity seen, and **fails** the condition if the identity changes
mid-dwell. The passing evidence names the single process that served the whole
window, so a reader can see it rather than assume it.

**CLOSED, 2026-08-18, by re-running rather than by argument.** The Founder
ruled for the clean route, so the gate was performed again against the fixed
harness. `evidence/phase2-runs-2026-08-18T01-20-03-087Z.json` at commit
`b731ba7` records exactly one process identity across all 11 dwell samples in
each of three runs — the dwell now *shows* that one process served the window
rather than leaving a reader to assume it.

**What that does to `23-58-26`.** It is superseded, not deleted. Its run #1
`deploys_and_stays_up` held under a health-only dwell while the process was in
fact replaced ninety milliseconds before the dwell ended, so that condition was
always weaker than it read. The bundle stays retained and unedited, and
`evidence/README.md` says which bundle is current and why.

**The fix itself had a hole, found by review of the fix.** `note()` ignored an
undefined identity, so a `/version` that failed — or answered without
`startedAt` — recorded nothing at all. `identities` stayed empty, the
"changed mid-dwell" comparison never fired, and the dwell returned **passing**
with the detail *"identity unavailable"*: the same verdict as a dwell that
positively established one process served it. That is the original §7 defect
surviving inside its own remedy, reachable whenever `/version` is unhealthy
while `/health` is not.

The dwell now **fails** when a sample yields no usable identity, distinguishing
a dead `/version` from a live one whose answer carries no `startedAt`, with a
regression test for each — both verified to fail against the pre-fix code, so
neither passes vacuously.

**This did not supersede the bundle**, and that was checked rather than
asserted: all three recorded runs return exactly one identity across 11 samples
each, so every sample already yielded a usable `startedAt` and the stricter rule
passes them unchanged. See §2 for the general rule this is an instance of.

**Raised by** CodeRabbit on PR #2 — the original defect from reading the
satisfied bundle's own timestamps, and the hole in the fix from reading the fix.

---

## 8. Two retained bundles were produced by a harness with known defects — CLOSED

**What it is.** The two `21:xx` bundles under `evidence/` were produced before
two harness defects were found and fixed: a restart comparison against a stale
process identity, and an event-id comparison that could not fail. Neither
bundle is sound evidence for the `survives_restart` condition.

**Status: CLOSED** by `evidence/phase2-runs-2026-08-17T23-58-26-478Z.json` at
commit `fb74dd7` — three consecutive passes from the fixed harness, with run #1
demonstrating the ordering fix against a real mistimed restart.

The scope of this entry is the two `21:xx` bundles only. It is not a limit
being accepted and never was; it was work outstanding, and the work is done.
The bundles stay retained rather than deleted because a retracted claim is part
of the record.

**Raised by** CodeRabbit on PR #2, fixed in the harness, closed by the re-run.

---

## Related

- `docs/phase-2-provider-controls.md` — the Neon spend-control gap, which is a
  Founder-accepted limit rather than a deferred one
- `evidence/README.md` — what the retained bundles do and do not support
- `packages/control-plane/src/store.ts` — where limit 1 lives
- `packages/run-harness/src/sequence.ts` — where limit 2 lives
- `packages/run-harness/src/runner.ts` — where limits 3 and 7 live
