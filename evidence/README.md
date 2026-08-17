# Phase 2 run evidence

`DEC-20260815-17` exit criterion 5 — *"evidence retained and exportable."* This
directory is where it is retained. The bundles are the harness's own output,
committed unmodified.

## Read this first — both bundles below were produced by a defective harness

**Neither bundle on disk is sound evidence for the `survives_restart`
condition, and both are retained anyway.** Two defects were found in the
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

## What is here

Two bundles. Both are kept; the second supersedes the first as the description
of what is deployed, and neither is edited.

**`phase2-runs-2026-08-17T21-50-57-741Z.json` — current.** Commit
`19b496899c87781257e1c8961a3c2ab6de41c728`, **Node 22 pinned**. Three
consecutive passes, no failed runs. This is the bundle that describes the
deployed configuration.

**`phase2-runs-2026-08-17T21-10-24-425Z.json` — superseded, retained.** Commit
`d4dab780e0790fde49ed0907b2f81f9a7bf37245` on Node v24.10.0. Three consecutive
passes, no failed runs. Superseded not because anything in it failed or was
wrong, but because the runtime it exercised is no longer the deployed one — see
*A gate is bound to a runtime* below. Deleting it would erase the reason the
second gate exists.

Everything below describes both, except where a difference is named.

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

```
run #1  21:37:24.777Z -> 21:49:02.323Z
run #2  21:49:02.323Z -> 21:49:34.771Z
run #3  21:49:34.771Z -> 21:50:56.447Z
```

Node 24 gate (`21-10-24`), superseded:

```
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

## A gate is bound to a runtime, which is why there are two bundles

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
