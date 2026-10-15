# Phase 4 steps 3 to 6 — implementation plan (r1)

**Status:** DRAFT, builder's plan. It authorizes nothing. The Phase 4
authorization in FounderOS `DEC-20260815-17` (2026-08-31) and the ruling
`FOUNDER-RULING-20261015-BUILD-ROOM-TO-DONE` govern; where this plan and
they differ, they win.

**Base:** Build Room `main` at `3f16f576a995e1068b08934eb383b31d306e3082`
(C2). **Carrier:** one branch, one draft pull request, one Tier-2 review of
its exact final head and one SHA-named merge authorization (C3).

## Where things stand

- Steps 1 and 2 are on `main`: `docs/command-journal-contract.md` and
  `packages/journal`. The two step-1 contract rulings of 2026-09-01 are in
  force: the journal store and sole writer (§3) and plan-decision
  authentication by `PHASE3_ADJUDICATION_TOKEN` plus the exact `plan_hash`
  (§8.2).
- The Postgres journal writer (`packages/control-plane/src/journal-store.ts`)
  appends `journaled` rows only. It has no other command event, no
  decision rows, no read path, no `verify()` and no reconstruction.
- The ledger implements T1 to T22, but only T1 has ever run. There is no
  PlanDoc schema, no server-side `plan_hash`, no scope canonicalizer, no
  plan store and no plan-decision endpoint.
- No consumed MadBridge capability is in the repository.
- No adapter exists, and nothing lets the control plane hand work to a
  Gateway: the Gateway only calls in (enroll, session, heartbeat).

## Slices, in order

Each slice lands as commits on the one branch, with its tests.

1. **The generic route refuses the planner path.** Done in `6208628`:
   `POST /rooms/:roomId/events` answers 403 for T2, T3, T4, T5 and T22, so
   no token holder can post a Founder plan decision with self-asserted
   guard facts. Tests in `test/control-plane-server.test.ts`.
2. **PlanDoc and scope.** A closed PlanDoc schema in
   `packages/seat-output-schema`, the server-side `plan_hash` from
   `packages/journal/src/plandoc.ts`, and a scope-path canonicalizer for
   G5 in `packages/contracts`.
3. **The journal writer, complete.** `identity_bound`, `dispatched`,
   `completed`, `failed`, `unresolved` and `resolved` appends; decision
   rows; a variant that joins a caller's transaction, so that a decision
   record and its lifecycle event commit together (§1.4); row decoders,
   Postgres `verify()` and reconstruction. All in `journal-store.ts`, which
   the sole-writer test requires. Built: decoders and the cross-row rules
   in `packages/journal` (`decode.ts`, `sequence.ts`); every append in one
   transaction under a journal advisory lock, taken after the room lock;
   the rules checked after the insert and before the commit; a decision
   accepted only with a lifecycle event its own transaction wrote. A
   `completed` needs an authorization resolver the store is given, and is
   refused without one, so no `completed` can be written until slice 7
   supplies the resolver. Tests: `test/journal-decode.test.ts` and
   `test/journal-writer.storage.test.ts`.
4. **The plan store.** Migration `0010` (an append-only plans table with
   `0008`-style grants) and `control-plane/src/plan-store.ts`. A migration
   means the merge's deployment refuses to boot until `0010` is applied;
   the merge authorization must sequence that apply (the Oct 10 rebind
   act's B3).
5. **The plan-decision endpoint.** `POST /control-plane/rooms/:roomId/plan-decision`
   for approve (T5), revise with feedback (T4) and cancel (T22), behind the
   adjudication token, which becomes mandatory for this route (refuse if
   unset, §8.2). The server recomputes `plan_hash` from the stored plan and
   compares it with the submitted one; the decision row and the lifecycle
   event commit in one transaction.
6. **Consumed capabilities (step 3).** See the open question Q1.
7. **The governed planner loop.** `control-plane/src/planner-loop.ts`:
   journal `journaled`, then T2, then dispatch with the permit, then
   identity binding, then the plan back as T3 with its schema check and
   hash, then PLAN_REVIEW. Fail closed on every failure the authorization's
   §5 lists. First against a synthetic Planner (§6 allows "fixtures and
   synthetic provider behavior"); the real path depends on Q2.
8. **Recovery.** `journaled` without `dispatched`, and `unresolved` without
   `resolved`, reconcile by `command_id` before any retry; restart rebuilds
   without duplicate commands, approvals or authority (stop gate items 9
   and 10).
9. **The integrated lifecycle tests (step 5).** The stop gate's items 1 to
   10 and the contract's §10 map, unit and storage.
10. **Counted-run preparation (step 6).** A Phase 4 run harness under
    `packages/run-harness/src/phase4/`, and a proposed run unit for the act
    C6 of the ruling calls for. No counted run executes.

## Open questions for the Founder

These change the build. Slices 1 to 5 do not depend on Q1, Q2 or Q4.
Slice 5's cancel path depends on Q5.

**Founder direction in session, 2026-10-15, verbatim: "GO".** Given in
answer to the builder's request to approve, together: this work's own
branch `builder/phase4-steps3-6` (the session's designated branch carries
custody PR #120, and C2 requires the base `3f16f57`), and the builder's
proposed resolutions of Q1 and Q3 below. Q2 and Q4 stay open.

- **Q1. How MadBridge capabilities are consumed.** `DEC-20260827-01` says
  "adopts" and "consumes" but names no mechanism. The pinned sources
  import `bun:sqlite` and `@madventures/protocol`, which Build Room cannot
  take without lockfile and workspace changes that need their own
  authorization. The builder's proposed resolution: reimplement each
  consumed interface in Build Room, as manifest-less source, against the
  exports and invariants pinned at `7d37a61`, with tests asserting each
  invariant and the pinned blob ids recorded as provenance. Seven of the
  thirteen pinned files have changed on MadBridge's `main` since the pin
  (one removes `resumeSession`, a consumed export), so only the `7d37a61`
  form is consumed.
- **Q2. How the Planner actually runs.** No adapter exists and §6 forbids
  new provider onboarding. Steps 4 and 5 can be built and tested end to end
  against a synthetic Planner. The counted runs need a real one: the
  architect seat on the PC Gateway, through MadBridge's claude-code or
  antigravity adapter (consumed under §3.4, if Q1 is ruled that way) and a
  new path for the control plane to hand a planner command to the Gateway.
  That path is Gateway work. Which adapter, and whether that path is in
  Phase 4's scope, are Founder calls.
- **Q3. The decision row's `command_id`.** Migration `0006` makes
  `command_id` NOT NULL for every row; the contract says a decision row has
  none. The builder's proposed resolution: a decision row carries the
  `command_id` of the planner command whose plan it decides, which keeps
  the schema and links the decision to its plan. The alternative changes
  the schema.
- **Q4. The ceiling code correction.** Your ruling of 2026-08-29 left the
  inclusive-ceiling code fix as separate work it did not authorize; the
  planner admission path runs through the cost meter.
- **Q5. A cancel with no planner command.** Raised by slice 3. Under Q3
  a decision row carries the planner command's `command_id`. T22
  (`founder.cancel`) also fires from `ROOM_CREATED` and `SCOPED`, before
  any planner command exists, so that row has no `command_id` to carry,
  and slice 1 already refuses T22 on the generic route. Until this is
  ruled, a room can be cancelled only once a planner command exists. The
  options are a governed cancel command journaled first, a sentinel-free
  schema change that lets a decision row carry no `command_id`, or
  leaving pre-planning cancel unavailable in Phase 4. This is a Founder
  call; the builder has not chosen.

## Verification

Every slice: typecheck, the default suite as an unprivileged user, lint on
the changed files, and the repository gates. Slices that touch storage
also run `test:storage` and `test:storage:runtime-role` against a scratch
PostgreSQL 16.
