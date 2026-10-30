# Phase 4 stop gate — test map

**Status:** DRAFT, builder's map (plan r1 slice 9, Phase 4 step 5). It
authorizes nothing and decides nothing. The stop gate is the Phase 4
authorization §7 in FounderOS `DEC-20260815-17`; the contract rows are
`docs/command-journal-contract.md` §10. Where this map and they differ, they
win. Phase 4 closes only through a separate Founder stop-gate ruling after
the Founder reviews the evidence (§7); this map is an index to some of it.

## How to read it

Each row names one test that evidences its label, by file and by the exact
title its source gives `it(`. `S` marks a storage suite, which runs only
against PostgreSQL (`npm run test:storage`, and the runtime-role tier,
`npm run test:storage:runtime-role`, both in CI); `D` marks the default
suite (`npm test`). A title written with `${…}` is a template literal and
is quoted as its source text.

`test/phase4-stop-gate-map.test.ts` holds this file to the tests: every
cited title must open an `it(` call in the cited file, the S/D mark must
match the file name, every label below must have a row, and the contract's
§10 table must still have the 15 rows this map was built against. It checks
that the citations exist, not that the tests prove what the last column
says; that column is the builder's reading, checked by reading each test.

Items 11 to 13 (repository gates, exact-head Tier-2, three counted runs)
bind the pull request and the runs, not tests, and are not mapped.

## Labels

| Label | Stop-gate item, or contract §10 row |
|---|---|
| 1 | the canonical command journal is append-only, tamper-evident, reconstructable, and singular |
| 2 | governed commands cannot bypass the required journal path |
| 3 | secrets and credentials are not persisted in journal records |
| 4 | a Founder-scoped goal reaches a Planner through the governed execution path |
| 5 | the Planner produces a durable structured plan |
| 6 | Founder approval and rejection are both enforced |
| 7 | an unapproved or invalidated plan cannot progress into Builder execution |
| 8 | identity, role, provider, model, execution surface, scope, authorization, journal, and evidence remain bound through the lifecycle |
| 9 | interruption, restart, ambiguous outcome, gateway loss, and reconciliation paths fail closed |
| 10 | persisted state reconstructs without creating duplicate commands, approvals, or authority |
| §12-a | a decision record cannot carry elements 4, 8, or 9 |
| §12-b | a command record cannot use the decision shape |
| §12-c | a decision record whose lifecycle write fails commits nothing |
| §12-d | rebuild over a mixed chain reproduces both classes and their order |
| §2-a | a pre-plan T22 cancellation record (state recorded, `plan_hash` absent) verifies |
| §2-b | a post-plan decision record missing `plan_hash` fails |
| §5.3 | matching intended and observed identities with a non-covering authorization does not reach `completed` |

## Map

| Label | Suite | File | Test title | What it shows |
|---|---|---|---|---|
| 1 | D | test/journal-7.1-foundation.test.ts | refuses a second authoritative journal while one is active | a second journal is refused (singular) |
| 1 | D | test/journal-7.1-foundation.test.ts | detects an in-place row mutation | a mutated row fails verification at its seq |
| 1 | S | test/journal-authority.storage.test.ts | B-R1 runtime INSERT/UPDATE/DELETE/TRUNCATE on both journal tables: eight distinct permission denied for table | the runtime login cannot change journal rows |
| 1 | S | test/journal-writer.storage.test.ts | finds a chain-hash tamper at its seq, then passes once restored | PostgreSQL verify names the tampered seq; reconstruction is refused |
| 1 | S | test/journal-store.storage.test.ts | every persisted row re-encodes to its own column seq and re-chains from genesis to the head | every row re-encodes and re-chains to the head |
| 1 | D | test/journal-sole-writer.test.ts | names the routine in exactly journal-store.ts and migrations.ts under packages/, and nowhere else | one module writes the journal |
| 1 | S | test/phase4-lifecycle.storage.test.ts | items 1, 10: fresh stores over the same database rebuild every room, the journal verifies from genesis, and nothing is duplicated | after a whole lifecycle, the journal verifies and rebuilds |
| 2 | D | test/control-plane-server.test.ts | refuses ${name} with 403 and never reaches the store | the generic route refuses every planner-path event before the store |
| 2 | S | test/journal-store.storage.test.ts | the identity latch: the owner-class login that applied the migrations is refused — 503, no statement past the latch, zero rows — while WITHOUT the latch its append succeeds (the bypass is real) | no login but the runtime one reaches the journal |
| 2 | S | test/planner-loop.storage.test.ts | a round: T2 with its journaled command, then identity_bound, dispatched, and T3 committing with the plan and completed | T2 commits with its journaled command; its evidence is that row |
| 2 | S | test/phase4-lifecycle.storage.test.ts | items 2, 6, 7: no surface but the plan-decision route decides, and only with the adjudication token and the plan under review | over HTTP, the generic route refuses every planner-path event |
| 3 | S | test/journal-store.storage.test.ts | persists exactly encodeCommandEventRow of the submitted fields at the persisted seq with the injected clock, chained as packages/journal chains | a token in an argument is stored as `[REDACTED]` |
| 3 | D | test/journal-7.3-secrets.test.ts | refuses credential material in a row field outside the envelope | credential text in a row field is refused |
| 3 | D | test/journal-routes.test.ts | a token-shaped argv entry is REDACTED before the write, not refused: the routine receives the marker and never the value | the route redacts before the write |
| 3 | S | test/phase4-lifecycle.storage.test.ts | items 3, 6: a credential in the revision feedback is refused and leaves nothing behind | credential-shaped feedback is refused with no row written |
| 3 | S | test/phase4-lifecycle.storage.test.ts | item 3: no persisted row carries a token, a key or the database password | after a whole lifecycle, no journal, event or plan row holds a token, the Gateway key or the database password |
| 4 | S | test/planner-loop.storage.test.ts | Q7c: no round opens without the Founder goal, or with a goal that no longer matches its digest | no goal, or a changed one, opens no round |
| 4 | D | test/control-plane-server.test.ts | adds the goal digest as the server’s evidence on T1 | the goal's digest is the server's evidence on T1 |
| 4 | S | test/phase4-lifecycle.storage.test.ts | items 4, 5, 8: the goal captured on T1 reaches the Planner on the Gateway and returns as a stored, bound plan | a goal posted over HTTP reaches the Gateway's Planner over the signed channel |
| 5 | S | test/plan-store.storage.test.ts | records a ready plan and reads it back, judged again, by event and by command | the plan is stored with T3 and read back with its hash |
| 5 | S | test/plan-store.storage.test.ts | the runtime holds SELECT and INSERT only, and the table refuses UPDATE, DELETE and TRUNCATE from anyone | the plan table is append-only |
| 5 | D | test/plan-doc.test.ts | accepts a complete plan, computes its hash, and marks it ready for decision | the PlanDoc schema is closed and hashed |
| 5 | S | test/phase4-lifecycle.storage.test.ts | items 4, 5, 8: the goal captured on T1 reaches the Planner on the Gateway and returns as a stored, bound plan | the Gateway's plan is stored once, keyed by its command |
| 6 | S | test/plan-decision.storage.test.ts | a wrong hash is G5’s recorded rejection, with no decision record | a wrong hash approves nothing |
| 6 | S | test/plan-decision.storage.test.ts | a revision moves the room back to PLANNING and carries the feedback | rejection by revision is a recorded transition |
| 6 | D | test/plan-decision.test.ts | with the token set, the control-plane token and no token are both unauthorized | only the adjudication token decides |
| 6 | S | test/phase4-lifecycle.storage.test.ts | items 6, 7, 8: a revision invalidates the plan; the revised plan, not the first, is approved and enters BUILDING | revise, re-plan and approve over HTTP |
| 7 | S | test/plan-decision.storage.test.ts | a decided plan cannot be decided again | one decision per plan |
| 7 | S | test/planner-loop.storage.test.ts | cancel in PLAN_REVIEW carries the plan hash; afterwards nothing plans or approves | a cancelled room plans and approves nothing |
| 7 | D | test/exhaustive-rejection.test.ts | accepts exactly the table pairs and rejects every other pair | BUILDING is reached only by the table's transitions |
| 7 | D | test/plan-doc.test.ts | refuses a plan that claims it was approved or authorizes the Builder | a plan cannot claim its own approval |
| 7 | S | test/phase4-lifecycle.storage.test.ts | items 6, 7, 8: a revision invalidates the plan; the revised plan, not the first, is approved and enters BUILDING | the superseded plan's hash approves nothing |
| 7 | S | test/phase4-lifecycle.storage.test.ts | items 7, 10: approval dispatches nothing, a replayed approval decides nothing twice, and BUILDING opens no round | BUILDING dispatches nothing and opens no round |
| 8 | S | test/journal-writer.storage.test.ts | appends journaled → identity_bound → dispatched → completed, asks the resolver once, and derives completed | the completion resolver sees the bound identities |
| 8 | S | test/planner-loop.storage.test.ts | before contact: an uncovered or indeterminate route, a failed attestation or a mismatched identity is a pre-send failed | a wrong identity or uncovered route never dispatches |
| 8 | S | test/planner-loop.storage.test.ts | dispatch: not sent is failed; a throw is unresolved; a divergent observed route is dispatched then failed, never awaited | a substituted model is recorded and fails |
| 8 | D | test/plan-decision.test.ts | an approval asserts the stored plan’s hash, the submitted hash, and canonical scope — never the caller’s | the decision's facts are the server's |
| 8 | S | test/phase4-lifecycle.storage.test.ts | items 4, 5, 8: the goal captured on T1 reaches the Planner on the Gateway and returns as a stored, bound plan | room, role, actor, authorization, route, execution, scope and evidence bound across T1, T2, the journal and T3 |
| 9 | S | test/planner-recovery.storage.test.ts | journaled, never dispatched (the journal failed mid-round): the Planner never received it, so it is a pre-send failed | an interrupted round recovers to failed, with no re-dispatch |
| 9 | S | test/planner-recovery.storage.test.ts | mismatches are reported, never resolved: another execution, or "never received" for a dispatched command | a mismatch stays unresolved |
| 9 | D | test/gateway-planner-channel.test.ts | throws when the execute was delivered and never answered: contact cannot be ruled out | a silent Gateway after delivery is never not_sent |
| 9 | S | test/planner-loop.storage.test.ts | gateway offline: T2 is the recorded rejection and no command exists; cancel stays unavailable | no live Gateway, no command |
| 9 | S | test/phase4-lifecycle.storage.test.ts | items 9, 10: a plan the control plane stopped hearing about is unresolved; recovery after a restart reconciles it by command id, without dispatching again | a Gateway lost mid-round over the real channel, then recovered after a restart |
| 9 | S | test/phase4-lifecycle.storage.test.ts | item 9: with no live Gateway, T2 is refused and no planner command exists | liveness derived from real heartbeats going stale refuses T2 |
| 10 | S | test/planner-recovery.storage.test.ts | restart: fresh stores rebuild the same rooms, and nothing creates a second command, approval or authority | a restart creates nothing |
| 10 | S | test/plan-decision.storage.test.ts | two concurrent approvals of one plan produce one transition and one decision record | racing approvals decide once |
| 10 | S | test/journal-append-atomicity.storage.test.ts | B-A4 duplicate command_id is refused by CONSTRAINT, not silently reconciled | a duplicate command is a constraint violation |
| 10 | S | test/phase4-lifecycle.storage.test.ts | items 7, 10: approval dispatches nothing, a replayed approval decides nothing twice, and BUILDING opens no round | a replayed approval over HTTP writes nothing |
| 10 | S | test/phase4-lifecycle.storage.test.ts | items 1, 10: fresh stores over the same database rebuild every room, the journal verifies from genesis, and nothing is duplicated | one command per round, nothing written on restart |
| §12-a | D | test/journal-serialization.test.ts | cannot carry elements 1, 4, 8, or 9: the byte grammar has no slot for them | smuggled fields encode to the plain row |
| §12-b | D | test/journal-serialization.test.ts | rejects a command shape passed as a decision | a command event is not a decision |
| §12-b | D | test/journal-decode.test.ts | refuses an unknown spec id, and a spec (c) row offered as spec (d) | command bytes are refused as a decision |
| §12-c | S | test/journal-writer.storage.test.ts | a rolled-back caller transaction leaves neither the lifecycle event nor the decision | rollback leaves neither row |
| §12-c | S | test/journal-writer.storage.test.ts | refuses a missing lifecycle event, a different act, and a different state | no decision without its lifecycle event |
| §12-c | S | test/plan-decision.storage.test.ts | when the decision record cannot be written, the transition does not stand either | the converse: the transition rolls back with the decision |
| §12-d | D | test/journal-vectors.test.ts | the mixed chain verifies from the 64-zero genesis in seq order | the committed mixed chain verifies in order |
| §12-d | S | test/phase4-lifecycle.storage.test.ts | items 1, 10: fresh stores over the same database rebuild every room, the journal verifies from genesis, and nothing is duplicated | PostgreSQL's rebuild of a mixed chain reproduces both classes in seq order |
| §2-a | D | test/journal-vectors.test.ts | the mixed chain verifies from the 64-zero genesis in seq order | the chain holds a pre-plan cancel with no `plan_hash`, and verifies |
| §2-a | D | test/plan-decision.test.ts | in PLANNING after a failed command: no plan hash, bound to that command, G22 fact derived | a cancel in PLANNING carries no hash |
| §2-b | D | test/journal-serialization.test.ts | requires plan_hash at a post-plan state and forbids it pre-plan (no sentinel) | a post-plan decision without its hash is refused |
| §2-b | D | test/plan-decision.test.ts | in PLAN_REVIEW the Founder sends the plan’s hash, and the row carries it | a hash-less decision in PLAN_REVIEW is refused |
| §5.3 | S | test/journal-writer.storage.test.ts | refuses completed ${label}, and writes nothing | a non-covering authorization refuses `completed` |
| §5.3 | S | test/planner-loop.storage.test.ts | a refused completion leaves no T3 and no plan: does_not_cover is failed, indeterminate and no resolver are unresolved | end to end: no T3 and no plan |
| §5.3 | S | test/planner-recovery.storage.test.ts | a resolved completion still needs the completion test: indeterminate stays unresolved with no T3; does_not_cover resolves failed | recovery applies the same test |

## What the map does not show

These are the builder's own findings, stated so the Founder does not read
more into the map than it holds.

- **There is no Builder.** Items 7 and 8 end at BUILDING, because Phase 4
  ends there: approval records the approved plan and dispatches nothing
  (§2). "Cannot progress into Builder execution" is shown as BUILDING being
  reachable only through the transition table, and dispatching nothing and
  opening no round once reached. Nothing carries the bindings past BUILDING.
- **The loop runs only behind the counted-run gate.** `PlannerLoop` and
  `PlannerRecovery` have no caller in `server.ts`, and the store
  `server.ts` builds carries no completion resolver. What constructs a
  loop is the counted-run surface (slice 10, on this head): a request
  that passes its token, act, deployment-id and registry checks builds a
  `JournalStore` with the counted-run completion resolver and runs one
  round (`control-plane/src/counted-run.ts`); with the token or act
  unset every counted-run route answers 503 and no loop exists. The
  counted-run entry act itself is still not issued, so no run is
  authorized. The lifecycle suite builds the loop the way that caller
  does, over production's store classes.
- **The Planner is synthetic.** Every planner test runs a synthetic executor
  or Planner (§6 allows it), and no provider is contacted. The one executor
  that ships, agy on Gateway `1880c12d`
  (FOUNDER-RULING-20261026-BR-PLANNER-EXECUTOR), is tested against a fake
  agy in `test/agy-planner-executor.test.ts`.
- **Item 2's in-memory cases.** `test/journal-7.2-fail-closed.test.ts` tests
  `dispatchGovernedCommand` over the in-memory journal, which no production
  path calls. The production planner path keeps journal-first by its own
  construction (T2 and `journaled` in one transaction) and is cited above.
- **§12-c.** No test injects a failure into the lifecycle insert inside
  `decidePlan`; the rollback is shown from the caller's transaction and from
  a refused decision record.
- **§2-b.** No test offers PostgreSQL's `verify()` stored post-plan decision
  bytes that lack `plan_hash`, because the encoder will not produce them;
  the refusal is shown at the encoder and at `decidePlan`.
- **Most of the evidence is storage-suite evidence.** A run without
  PostgreSQL skips it. CI runs both storage tiers; the lifecycle suite runs
  in the runtime-role tier only, because the journal accepts no other login.
