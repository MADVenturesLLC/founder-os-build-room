# Phase 2 run evidence

`DEC-20260815-17` exit criterion 5 — *"evidence retained and exportable."* This
directory is where it is retained. The bundles are the harness's own output,
committed unmodified.

## Read this first

Six bundles. **Two satisfy the gate; four do not, and all six are kept.**

| bundle | commit | verdict |
|---|---|---|
| **`01-20-03`** | **`b731ba7`** | **gate SATISFIED, and the current evidence** — 3 consecutive passes, 0 failed, harness-driven restarts |
| `23-58-26` | `fb74dd7` | gate satisfied, **superseded** — health-only dwell, human-driven restarts |
| `23-50-50` | `e5f5ff8` | NOT satisfied — 0 of 3; all three failed, and the cause was `builder`'s |
| `23-47-17` | `66ee472` | NOT satisfied — 2 of 3 consecutive; run #1 failed |
| `21-50-57` | `19b4968` | superseded — produced by the defective harness described below |
| `21-10-24` | `d4dab78` | superseded — defective harness, and a runtime no longer deployed |

**Two failed attempts and two superseded bundles precede the satisfied one, and
none of them is deleted.** Exit criterion 4 wants a failure visible as an
interruption rather than absent from the record; a directory holding only the
successful attempt would tell a reader the gate was met first time, which is
false.

### `01-20-03` — the current evidence, and why it supersedes `23-58-26`

Commit `b731ba7`, three consecutive passes, no failed runs, **and no human in
the loop**. `platformKind` is `command` rather than `external`, and every
restart records `actor: harness` — the harness called
`scripts/railway-restart.sh`, which restarts the service through Railway's API.

Three things are stronger here than in `23-58-26`, and they are the three
things review kept finding fault with:

**The dwell proves a single process served it.** Each of the 11 samples per run
reads `/version` as well as `/health`, and every run recorded exactly one
identity across the whole 30-second window:

```text
run #1  dwell identities [01:16:32.804Z]   11 samples
run #2  dwell identities [01:18:46.232Z]   11 samples
run #3  dwell identities [01:19:23.112Z]   11 samples
```

`23-58-26` could not do this. Its run #1 dwell ended at `23:56:25.242Z` while a
new process had started at `23:56:25.152Z` — ninety milliseconds earlier — and
a health-only dwell had no way to see it. That is why this bundle supersedes
it rather than merely joining it.

**The restart is caused, not merely followed.** The call that requests each
restart is the call that performs it, so a run cannot credit a restart nobody
asked for. The latency is consistent to a tenth of a second:

```text
run #1  requested 01:18:43.728Z  ->  01:18:46.232Z   (+2.5s)
run #2  requested 01:19:20.554Z  ->  01:19:23.112Z   (+2.6s)
run #3  requested 01:19:57.117Z  ->  01:19:59.682Z   (+2.6s)
```

**On reading those figures against the older bundle.** `23-58-26`'s runs took
+26.8s, +25.6s and +2.1s, and the +2.1s outlier was called suspect *because*
the other two took twenty-six seconds. That reasoning was calibrated on
dashboard restarts. An API `deploymentRestart` genuinely completes in about two
and a half seconds — consistently, as the three runs above show — so a short
delta is this mechanism's normal latency rather than a warning sign. The
earlier inference stands for the dashboard path it was about, and does not
transfer here.

**Event ids are read from an export on each side and compared in order**, as in
`23-58-26`. Distinct per run, matching across each restart.

**What is still not established.** `deploymentRestart` returns `true`, not a
restart identifier, so the link is "this call performed a restart" rather than
"the process now serving is the one this call produced" — a concurrent restart
from elsewhere could still interleave. See `docs/phase-2-known-limits.md` §3,
which is narrowed rather than closed.

### `23-58-26` — superseded, and what it did and did not establish

Commit `fb74dd7`, three consecutive passes, no failed runs. Every condition
held in every run.

**The ordering defect is closed, demonstrated against a live accident.** The
two recorded identities of run `#1` differ:

```text
healthCheckIdentity  23:54:27.014Z
baselineBeforeReq    23:56:25.152Z
requestedAt          23:56:25.689Z
processAfter         23:56:52.445Z   (+26.8s)
```

A restart landed **between** the health check and the restart request. The
pre-fix harness compared against the health-check identity, so it would have
seen `23:56:25.152Z` and passed instantly — crediting a restart it had not
requested, which is precisely the defect found on PR #2. The fixed harness
rebaselined immediately before asking and required a *further* change. This is
the fix preventing the real failure, not a stubbed reproduction of it.

Every run's new process appears after its own request:

```text
run #1  requested 23:56:25.689Z  ->  23:56:52.445Z   (+26.8s)
run #2  requested 23:57:24.654Z  ->  23:57:50.295Z   (+25.6s)
run #3  requested 23:58:23.120Z  ->  23:58:25.212Z   ( +2.1s)
```

**Event ids are genuinely compared now** — read from a `/rooms/:id/export` on
each side of the restart and compared in order, rather than the pre-restart
array being passed through as the post-restart one.

**Run #3 carries the causation limit, and it is named rather than glossed.**
Its process appeared 2.1 seconds after its request while runs #1 and #2 took
about 26 — which is what a Railway restart actually costs. A restart does not
complete in two seconds, so run #3 most likely observed one the Founder had
already initiated. What run #3 establishes is that a restart occurred and the
room read back identically across it; what it does **not** establish is that
the harness's request caused that restart. See
`docs/phase-2-known-limits.md` §3. Runs #1 and #2, at +26.8s and +25.6s, are
consistent with a restart beginning at request time — but with an external
platform port and no restart identifier, causation is never *proved* for any
run, only made plausible.

**`23-47-17` was the first bundle produced by the FIXED harness, and it records
a failure.** It is retained precisely because it failed: `DEC-20260815-17` exit criterion 4 requires a failure to be visible as
an interruption of the sequence rather than absent from it. A directory holding
only successes would defeat that, so this one stays.

### What failed in `23-50-50` — a `builder` scheduling error, not a service fault

All three runs failed at `health_check` with
`502 Application failed to respond`, and the bundle therefore records
`deploys_and_stays_up` as failed three times. **Read literally that is a claim
about the service which is not true.**

`e5f5ff8` was pushed at `23:49:03`. Railway watches this branch, so the push
triggered a deploy. The gate was launched at `~23:49:50` and the new process
came up at `23:50:07` — inside run #1's 30-second dwell. The service was not
failing; it was being replaced, by a commit `builder` had pushed moments
earlier.

A second error compounded it. The restart instruction given to the Founder was
"wait for it to come back, then restart again" — but the service returns in
about twelve seconds, so that phrasing produced restarts roughly every twelve
seconds rather than the ninety the instruction elsewhere claimed. Six process
starts landed between `23:50:07` and `23:51:40`, each one interrupting a dwell.

**The harness was right and the operator was wrong.** A service that stops
answering has not stayed up, and a harness that excused a deploy would excuse a
crash. The bundle is retained on the same terms as any other, and both errors
are written into `docs/phase-2-known-limits.md` §4 and §5 so the next sequence
does not repeat them.

### What failed in `23-47-17`, stated plainly

Run #1's restart was requested at `23:42:43.870Z` and no new process appeared
within the 180-second window. The restart was performed at `23:46:41.200Z` —
**57 seconds after the deadline** — and run #2 picked it up instead.

**The service did not misbehave.** Run #1 held `deploys_and_stays_up` and
`reads_and_writes`; it deployed, answered all 11 health samples, wrote to the
ledger and read back correctly. What failed was operator timing: the restart
was requested of a human who was not at the dashboard when the clock started.
The harness reported what it observed rather than what was intended, which is
the behaviour wanted from it.

The gate needs three **consecutive** passes. The sequence reads `FAILED,
PASSED, PASSED`, so two consecutive is the most it can offer. A fresh sequence
is required, and this bundle is not superseded by it — it is the record that
the first attempt was interrupted.

### What `23-47-17` does establish

**The ordering defect is fixed, against the live system rather than a stub.**
Every observed process now appears after the request that asked for it:

```text
run #1  requested 23:42:43.870Z  ->  none within 180s
run #2  requested 23:46:18.360Z  ->  23:46:41.200Z   (+22.8s)
run #3  requested 23:47:14.165Z  ->  23:47:16.152Z   (+2.0s)
```

Compare the `21-50-57` bundle's run #2, where the new process was observed
**2.1 seconds before** its own restart request. That inversion is gone.

**But see `docs/phase-2-known-limits.md` §3 before reading run #3 as clean.**
Its process appeared 2.0 seconds after its request while run #2's took 22.8
seconds; a Railway restart does not complete in two seconds, so run #3 most
likely observed the tail of the restart run #2 had already credited. Ordering
holds; causation is not established. That limit is recorded rather than
papered over.

## The two earlier bundles were produced by a defective harness

**Neither of the two earlier bundles is sound evidence for the
`survives_restart` condition, and both are retained anyway.** Two defects were found in the
harness on 2026-08-17 by CodeRabbit on PR #2, after both gates had been
recorded as satisfied. Both were defects in the *evidence* rather than in the
service — the runs may well have been sound; the harness could not have shown
it either way.

1. **The restart comparison ran against a stale process identity.** `/version`
   was read at the health check, then a 30-second dwell and a write happened,
   and only then was the restart requested. Any process change inside that
   window satisfied the wait. This is not hypothetical: in the `21-50-57`
   bundle, run #2's `processAfter` is `21:49:34.771Z` against a `requestedAt`
   of `21:49:36.893Z` — **the "new" process was observed 2.1 seconds before
   the restart that was supposed to have caused it.** That run credited the
   tail of the previous run's restart.
2. **The event-id comparison never happened.** `compareAfterRestart` was handed
   the pre-restart ids as the post-restart ids, so the two arrays were equal by
   construction and the check could not fail — while the code comments and the
   PR body both said the ids were compared. The counts and lifecycle state were
   genuinely compared; the ids were not.

The harness is fixed and both defects carry a regression test that fails
against the pre-fix code. **The gate must be re-run against the fixed harness
before these bundles support anything.** These two are retained because a
retracted claim is part of the record — deleting them would leave the fix
looking like routine work rather than the correction of a finding.

Both are kept; neither is edited.

**`phase2-runs-2026-08-17T21-50-57-741Z.json` — superseded.** Commit
`19b496899c87781257e1c8961a3c2ab6de41c728`, **Node 22 pinned**. Three
consecutive passes, no failed runs — but produced by the defective harness, and
describing a commit two changes behind the deployed one.

**`phase2-runs-2026-08-17T21-10-24-425Z.json` — superseded, retained.** Commit
`d4dab780e0790fde49ed0907b2f81f9a7bf37245` on Node v24.10.0. Three consecutive
passes, no failed runs. Superseded not because anything in it failed or was
wrong, but because the runtime it exercised is no longer the deployed one — see
*A gate is bound to a runtime* below. Deleting it would erase the reason the
second gate exists.

Everything below describes those two, except where a difference is named. The
`23-47-17`, `23-50-50` and `23-58-26` bundles share the same stack and platform
port — same `baseUrl`, same `platformKind: external` — and differ only in
commit (`66ee472`, `e5f5ff8`, `fb74dd7`) and outcome.

- **Commit under test:** as the service itself reported it on `/version` — not
  as the harness assumed it.
- **Stack:** Railway service `rare-enjoyment` (project
  `compassionate-happiness`) plus Neon project `founder-os-build-room`. This is
  the bound reduced Phase 2 stack; the web tier, gateway platform and
  Redis/queue are deferred and were not deployed.
- **Platform port:** `external`. Each restart was performed by the Founder in
  the Railway dashboard, and the bundle records it as `performed_externally`
  rather than implying the harness did it. This session has no Railway API
  access.

## What each run established

One run is the Founder-defined cycle — deploy → health check → verify →
teardown — passing only if all three conditions hold (`DEC-20260815-17`,
*Founder Definition — what "a run" means at Phase 2*, 2026-08-17):

| Condition | How it was established |
|---|---|
| deploys and stays up | 11 consecutive `/health` samples across a 30-second window, every one passing, plus `/ready` reporting Postgres reachable |
| connects to Postgres and reads and writes correctly | a room created, a `scope.captured` event accepted by the ledger (T1 via guard G1, `ROOM_CREATED` → `SCOPED`), and the room read back |
| survives a restart without data loss | `/version` reporting a new `startedAt` — and the room then reading back with identical log length, entry count and lifecycle state. **Read against the defects above: "a genuinely new process" is what this was meant to establish and, for the `21-50-57` run #2, is not what it established. The event ids were not compared in either bundle.** |

## The restart chain, because "a restart happened" is the easiest thing to fake

Each run's process identity before the restart equals the previous run's
identity after it:

Node 22 gate (`21-50-57`), the current one:

```text
run #1  21:37:24.777Z -> 21:49:02.323Z
run #2  21:49:02.323Z -> 21:49:34.771Z
run #3  21:49:34.771Z -> 21:50:56.447Z
```

Node 24 gate (`21-10-24`), superseded:

```text
run #1  21:01:13.178Z -> 21:08:40.666Z
run #2  21:08:40.666Z -> 21:09:25.894Z
run #3  21:09:25.894Z -> 21:10:21.328Z
```

Four distinct processes across three runs, chained end to end. A service that
never restarted would show one identity throughout, and a harness that only
polled `/health` could not tell the difference.

**What that chain does and does not show, restated after the finding.** The
identities are real and the chain is genuine — four distinct processes did
serve, in that order. What it does not show is that each run's own restart
request caused the change it credited. The identities on the left are the ones
read at each run's *health check*, not immediately before its *restart
request*, and in the `21-50-57` bundle run #2 those two are not the same value.
A chain built from stale endpoints can be perfectly consistent and still credit
the wrong cause.

## What this does not do

**It authorizes nothing.** Architecture §3.17: *"Completing three runs
authorizes nothing."* `DEC-20260815-17` clause 2 requires the phase's exit
criteria to be met **and Founder-confirmed** before Phase 3 begins. This bundle
is evidence offered toward that confirmation. It is not the confirmation, and
it confers no activation, no further phase, and no spend authority.

The bundle states the same thing in its own `authorizes` field, so a reader who
sees only the JSON is told as plainly as one who reads this file.

## A gate is bound to a runtime, which is why the first bundle was superseded

The first gate ran against **Node v24.10.0**. That was not a choice — it
followed from `engines.node` reading `>=22`, under which Nixpacks took the
newest satisfying version, while CI and every local verification ran on 22.
Production was the one place running a runtime nothing had been tested against.

The Founder ruled Railway **pinned to Node 22** (recorded verbatim in
`railway.toml`), which made the first bundle describe a configuration that was
no longer deployed. The bundle stayed true of what it described and simply
stopped describing the deployed system.

**That gap was closed by re-running rather than by argument.** The pinned build
deployed as commit `19b4968` with `/version` reporting `v22.14.0` — verified,
not assumed, because a pin is a request to the builder and only the running
service proves it was honoured. The gate was then performed again against it:
three consecutive passes, no failed runs.

The principle worth keeping: **the three-run gate shows the skeleton is stable
enough to build on, and the runtime is part of the skeleton.** A gate satisfied
on one runtime does not carry to another. Re-running cost three restarts and a
few minutes; a stale claim would have cost more, and would have been discovered
at the stop gate rather than before it.

## Retention

Bundles are committed, never edited. A later run adds a file; it does not
replace one. A failed run is retained on the same terms as a passing one —
exit criterion 4 requires a failure to be visible as an interruption of the
sequence rather than absent from it, and a directory that held only successes
would defeat that.
