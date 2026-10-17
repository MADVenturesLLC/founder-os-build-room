# Phase 4 counted runs — proposed run unit (r1)

**Status:** DRAFT, builder's proposal (plan r1 slice 10, Phase 4 step 6). It
authorizes nothing, and no counted run has executed. The Phase 4
authorization §7 item 13 says the entry authorization for the counted runs
"shall define the Phase 4 run unit and state whether it authorizes the runs
individually or as a set". `FOUNDER-RULING-20261015-BUILD-ROOM-TO-DONE` C6
answers the second half: "When I authorize the counted Phase 4 runs, I will
authorize the three as one set, in one act, and that act will define the run
unit." This document proposes that definition. The harness in
`packages/run-harness/src/phase4/` implements the proposal. Where the
Founder's act defines the unit differently, the act governs and the harness
changes to match it before any run.

## 1. What the act would name

The harness reads the act's terms as a closed shape (`run-set.ts`), refusing
anything it cannot read exactly. Each field comes from a ruling already given
or is the act's to state:

| Field | Source |
|---|---|
| The act's identifier, journaled as each planner command's authorization | the act |
| The FounderOS commit, and the Build Room commit the control plane must serve | the act |
| The control plane's origin | the act |
| The Gateway: `1880c12d`, on the PC | C5 |
| The Planner's execution surface, today the Antigravity adapter; no Auto mode | Q2a, keyed to surfaces by `BR-PHASE4-SURFACE-KEYED-SEATS-R1` |
| The builder's and the reviewer's execution surfaces, each on an approved lane of its seat, the two different | Q7a, `DEC-20260815-05`, keyed to surfaces by `BR-PHASE4-SURFACE-KEYED-SEATS-R1` |
| Per run: a fresh room id, the repository, base commit, scope paths and the goal text | Q7c, the act |
| The surface relaying the Founder's T1 | the act |
| How long a run waits for the Founder's plan decision | the act |

At Build Room's pinned seat registry the architect seat's one Antigravity
lane is `google` / `gemini-3.1-pro`. The act names surfaces, not models
(`BR-PHASE4-SURFACE-KEYED-SEATS-R1`): each entry check reads `surface_id`
and `binding_status` only, so a seat may re-pin its lanes' models without
the act changing. Two surfaces that resolve to the same model are the
Founder's call, not a check; the reviewer's surface must differ from the
builder's.

## 2. The run unit (proposed)

One run is one room, taken from scope capture to a settled plan decision.
**A run passes** only if all of the following hold. `run-unit.ts` checks each
one against the run's record, never against a caller's summary of it:

1. **Entry passed** before anything was written (§4).
2. **T1** carried the act's goal, and the goal's digest is the server's
   evidence on it.
3. **Each round's T2** is attributed as Q7b rules: role `builder`, actor
   `control-plane:<deployment id>` naming the deployment the run started on,
   model `n/a (deterministic control-plane act)`, surface
   `build-room-control-plane`.
4. **Each planner command** was journaled under the act's identifier, with
   the provider, model and Antigravity surface of the act's planner
   surface's approved lane as its intended route, and was dispatched on
   that route.
5. **Each command completed.** The one exception is an earlier attempt of a
   round that failed `not_sent` and was retried, which is Q8's governed
   retry. A command with an `unresolved` or `resolved` row fails the run: its
   outcome was once unknown.
6. **Each T3** is attributed to the architect role, on the model the
   act's planner surface resolves to and the Antigravity surface.
7. **Every plan decision is the Founder's**, made at the control plane. The
   decisions are zero or more revisions and then one approval (T5) of the
   plan under review: the approval's hash is the last plan's hash.
8. **Nothing follows the approval.** The room is in BUILDING, and no builder
   is dispatched (Phase 4 §2).
9. **The journal verifies from genesis** after the run, and the control
   plane's deployment did not change during it.

The outcomes:

| Outcome | When |
|---|---|
| `passed` | All nine hold. |
| `rejected` | The Founder cancelled the room (T22): a recorded rejection, not a pass. |
| `interrupted` | The run did not settle: the deployment changed, the Founder did not decide within the act's time, the round bound was reached, or the room stopped short of BUILDING without a cancel. |
| `failed` | It settled, and the record breaks the unit. |
| `not_started` | Entry refused. Nothing was written. |

The proposed round bound is three: the first round and up to two revisions.

## 3. The set (proposed)

- The runs go in label order: `Phase4-CR1`, `Phase4-CR2`, `Phase4-CR3`.
- A `not_started` run consumes no label, because nothing ran.
- Three consecutive passes satisfy item 13.
- **Any other outcome spends the set.** §7: "A failed or interrupted counted
  run resets the consecutive-run count." The proposal reads C6's "the three
  as one set, in one act" as authorizing three runs, not an open-ended
  series, so after a reset the next attempt needs a new act. The proposal
  treats a rejected run the same way.
  - Alternative: the act grants an attempt budget, and the count restarts
    inside it.

`run-sequence.ts` implements the recommendation.

## 4. Entry

Before each run, `entry.ts` reports every gap between the act and the live
system, not only the first:

- the control plane answers and serves the act's commit;
- FounderOS is clean at the act's commit;
- the act names C5's Gateway, which is enrolled, online, and reports a
  planner executor;
- the T2 surface is registered;
- each seat's model is on an approved lane;
- the reviewer differs from the builder.

## 5. Evidence

Each run yields its record (`Phase4RunRecord`) and that record's SHA-256 over
canonical JSON. The record holds:

- the room's applied transitions;
- every planner command's journal rows;
- the decision rows;
- the journal's verification result;
- the deployment ids.

How the evidence is filed is the act's to state. Evidence-custody changes
are outside the Phase 4 authorization (§6).

## 6. What must exist before a run can start

None of these is this pull request's to provide. Each needs its own act, or
work under one:

1. **`DEC-20261015-01` ratified and merged: met.** Ratified in comment
   6205065988 and merged from FounderOS pull request 380 as `8146435`.
   The counted run reads a copy of the registry pinned at that commit
   (§10), which carries `build-room-control-plane`, so entry no longer
   fails with `dispatcher_surface_unregistered`.
2. **The PC Gateway as a supervised service** (C5's act), with its checkout
   carrying this branch's planner worker.
3. **A planner executor on the Gateway.** The worker has none, and none
   ships. An Antigravity executor is a provider binding, which
   `DEC-20260827-01` §3.4 does not authorize.
4. **The counted-run surface configured (Q9 below).** The routes are
   built and deploy inert. A run needs `PHASE4_COUNTED_RUN` set to the
   act's terms, `PHASE4_COUNTED_RUN_TOKEN` set (§9), and the platform's
   `RAILWAY_DEPLOYMENT_ID`. Setting either variable is a production change
   and is the Founder's act.
5. **This pull request merged and deployed,** with migration `0010` applied
   as its merge authorization sequences it.
6. **The act itself.**

## 7. Questions for the Founder

- **Q9. How a counted run reaches the control plane.** The runner's driver
  needs two things no route offers: starting a planning round for a room,
  and reading the room's journal rows. The builder's proposal is one
  authenticated control-plane route for each, behind the adjudication token
  and inert unless the act's identifier is configured. Building them is
  Phase 4 code. Deploying them is a production change that each merge
  authorization already sequences. The alternative is that the run executes
  in a process holding the database credential directly, which the builder
  does not recommend: the builder holds no credentials, and the control plane
  is the one writer.
- **Q10. Whether a cancel spends the set** (§3), or counts as neither a pass
  nor a reset.
- **Q11. Whether a run may contain a Q8 `not_sent` retry** and still pass
  (§2 item 5).
- **Q12. The round bound** (§2): three proposed.
- **Q13. Spent or budget** (§3): spent proposed.
- **Q14. Who relays T1.** The proposal has the harness capture each run's
  scope and goal from the act's text, attributed to the Founder with the act's
  relay surface. That is a relay of the Founder's words, not a Founder act,
  and the plan decisions remain the Founder's own at the control plane.

## 8. Founder answers of 2026-10-16 (Q9 to Q14)

Asked in session at the Founder's direction ("ask me Q9 through Q14 in
the run-unit proposal"). The Founder chose an option for each question.
Each answer is recorded as that option's label and text, as presented.
These answer the questions. They do not define the run unit: under C6,
the counted-run act defines it.

- **Q9, how a counted run reaches the control plane.** Selected: "Two
  inert routes (Recommended)". Option text: "Build two control-plane
  routes in #121, behind the adjudication token: start a room's planning
  round, and read its journal rows. Each answers 503 unless your
  counted-run act's id is configured. Its merge deploys them inert."
- **Q10, a cancel and the set.** Selected: "Cancel spends the set
  (Recommended)". Option text: "A cancel is a recorded rejection, not a
  pass. As with a failure, the next attempt needs a new act."
- **Q11, a not_sent retry in a passing run.** Selected: "Allowed
  (Recommended)". Option text: "A not_sent retry within the budget is
  governed behaviour you ruled on, so it doesn't fail the run. Any other
  failed or once-unresolved command still does."
- **Q12, the round bound.** Selected: "Three (Recommended)". Option text:
  "The first plan plus up to two revisions."
- **Q13, spent or budget.** Selected: "Spent (Recommended)". Option text:
  "The act authorizes three runs, not an open-ended series. After any
  non-pass, the next attempt needs a new act from you."
- **Q14, who relays T1.** Selected: "Harness relays the act
  (Recommended)". Option text: "The harness captures each run's scope and
  goal from your act's text, attributed to you through the act's relay
  surface. It is a relay of your words, not a Founder act; plan decisions
  stay yours, made at the control plane."

The harness already implements Q10 to Q14 as answered:
- `run-sequence.ts`: any non-pass spends the set;
- `run-unit.ts`: a `not_sent` retry may precede a completed attempt;
- `PHASE4_MAX_ROUNDS_PER_RUN` is 3;
- `runner.ts`: `captureScope` relays the act's inputs.

Q9 is built, on the Founder's direction "go ahead with the Q9 routes":
`control-plane/src/counted-run.ts` and `counted-run-config.ts`, and the
harness's `http-driver.ts`, which drives a run through those routes and
the existing room routes and never calls the plan-decision route. The
builder's finding against its own recommendation is in §9.

## 9. A finding against the Q9 answer

The builder's own, raised after the answer and not acted on. The
control plane's README records the adjudication token as "Founder-only
... and never available to the counted-run harness". Phase 3 kept it
from the harness so the harness could never adjudicate. As answered,
Q9 puts the counted-run routes behind that same token. Whatever runs the
harness therefore holds a credential that also posts plan decisions. The
runner never calls that route, and its driver has no method for it, but
that is a property of the code, not of the credential.

That is harmless only if the Founder runs the harness in person. The
alternative is a separate counted-run token, distinct from both existing
tokens. With it, the harness can start rounds and read the journal but
cannot decide a plan. This is a Founder call. The builder recommended
the answer as given and did not see this when it did.

### Founder answer, 2026-10-16

Given in session at about 00:38Z, in the Founder's words: "Add a separate
counted-run token. It would differ from both existing tokens and could
start rounds and read the journal, but not decide a plan. It’s a small
change, and I’d recommend it."

This supersedes the token named in the Q9 answer (§8); the rest of that
answer stands. Built:
- `PHASE4_COUNTED_RUN_TOKEN` (`config.ts`): at least 32 characters, and
  distinct from `CONTROL_PLANE_TOKEN` and `PHASE3_ADJUDICATION_TOKEN`, or
  boot refuses. Unset, every counted-run route answers 503
  `counted_run_disabled`.
- The three counted-run routes take that token and no other. The API
  token and the adjudication token are refused with 401 there, and the
  counted-run token is refused with 401 at the plan decision.
- The harness's `http-driver.ts` holds the API token and the counted-run
  token, and no credential that opens the plan decision.

What the boot check proves, and what it does not: it refuses a value equal
to either other token. It cannot tell whether a value was generated
independently of them. Generating it independently is part of the act
that sets it.

## 10. Which registry the counted run reads

The Seat Registry's ten fixtures are pinned together at FounderOS r7
`bd0a9acb`, and the Founder retained that pin. That copy of the
execution-surface registry predates `DEC-20261015-01`. Re-pinning it alone
would split the set across two FounderOS commits.

The Founder's selection of 2026-10-16, recorded as the option chosen,
"Separate counted-run copy (Recommended)": "Vendor one copy of the
execution-surface registry at FounderOS 8146435, hash-pinned, read only by
the counted-run surface check. The Seat Registry's ten fixtures stay on r7
bd0a9acb exactly as you ruled."

Built:
- `packages/control-plane/fixtures/execution-surface-registry.md`: FounderOS
  `814643594ac21558a3a90626360efebd664a4bce`
  `04-agents/execution-surface-registry.md`, byte for byte (blob
  `474f7bf6`, SHA-256 `060a16a4…2055`).
- `COUNTED_RUN_REGISTRY` in `counted-run.ts` names the commit, the path and
  the hash. A text that is not that copy byte for byte declares no surfaces,
  so an altered or missing file fails closed.
- Entry and the round-start check read only this copy. The Seat Registry's
  fixtures are unchanged.

The copy publishes, in this public repository, the registry's current
text: the r7 copy already here plus the surfaces registered since. It holds
no secret; the only URLs are a provider's public API host and two
home-relative log paths.

