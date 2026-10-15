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
   act's B3). Built as `0010_plan_store` (table `build_room_plans`): one
   plan per planner command, keyed by `command_id`, with a foreign key to
   the T3 event that submitted it. The store keeps only a ready plan that
   `judgePlanDoc` accepts and that carries no credential-shaped text. It
   writes the plan only in the transaction that wrote its T3 event, whose
   `planHash` fact must equal the hash it computes, and it recomputes the
   hash on every read. Tests: `test/plan-store.storage.test.ts`.
5. **The plan-decision endpoint.** `POST /control-plane/rooms/:roomId/plan-decision`
   for approve (T5), revise with feedback (T4) and cancel (T22), behind the
   adjudication token, which becomes mandatory for this route (refuse if
   unset, §8.2). The server recomputes `plan_hash` from the stored plan and
   compares it with the submitted one; the decision row and the lifecycle
   event commit in one transaction. Built for approve (T5) and revise
   (T4) in `control-plane/src/plan-decision.ts`; cancel (T22) answers 501
   until Q5 is ruled (Founder direction in session, 2026-10-15: "build
   approve and revise now"). The plan under review is read inside the
   room's fenced append transaction, after the room lock, so a concurrent
   revision and resubmission cannot change what is being approved. The
   ledger store gained `appendDerived` for that: the event is built from
   the locked state and a further step runs before the commit. Tests:
   `test/plan-decision.test.ts` and `test/plan-decision.storage.test.ts`.
6. **Consumed capabilities (step 3).** See Q1 and the ruling on unpinned
   dependencies. Built in `packages/madbridge-consumed`, a package with no
   manifest:
   - §3.1: the ownership machine and the path policy.
   - §3.3: the artifact store, manifest and hash-chained ledger, with the
     ledger in memory because §3.5 consumes no storage medium.
   - §3.4: the closed adapter registry and the `AdapterV1` contract.
   - §3.5: rebuild and reconciliation.
   `PROVENANCE.json` records all 34 files of the pinned closure with their
   blob ids and statuses. The concrete adapters wait on Q2.
   `evaluateAction` and its policies wait for a slice that needs them.
   Tests: `test/madbridge-consumed.test.ts`.
7. **The governed planner loop.** Also carries `founder.cancel` (T22)
   under the Q5 ruling: bound to the room's planner command, G22's fact
   derived from that command's journaled state, refused before a planner
   command exists. `control-plane/src/planner-loop.ts`:
   journal `journaled`, then T2, then dispatch with the permit, then
   identity binding, then the plan back as T3 with its schema check and
   hash, then PLAN_REVIEW. Fail closed on every failure the authorization's
   §5 lists. First against a synthetic Planner (§6 allows "fixtures and
   synthetic provider behavior"); the real path depends on Q2.
   Built in `control-plane/src/planner-loop.ts`:
   - T2 and the planner command's `journaled` row commit in one
     transaction, the row bound to its room and to T2. G2's role facts come
     from an injected role assignment and `gatewayOnline` from the fence;
     the loop refuses an unfenced store. A refused T2 is the store's
     recorded rejection, and no command exists.
   - A revision round is a second command, journaled under the room lock
     and bound to the T4 that asked for it.
   - Each round's command id is derived from the room and the transition
     that opened it, because a journal row has no room column and Q5 allows
     no migration. A room's planner commands are the ids its T2 and T4
     entries derive that the journal holds.
   - Before contact: the route's authorization and the Planner's attested
     identity, each a pre-send `failed` when it fails. Then
     `identity_bound`, `dispatched` with the observed route, and the plan.
     A divergent route, a reported failure, an invalid plan or one outside
     the captured repository, base and scope is `failed`. A dispatch or
     wait whose outcome is unknown is `unresolved`.
   - T3, the stored plan and `completed` commit in one transaction. The
     journal's resolver must say the authorization covers the observed
     route; otherwise nothing of it remains and the command is `failed`
     (does not cover) or `unresolved` (indeterminate, or no resolver).
     Production builds its journal store with no resolver, and nothing in
     `server.ts` constructs a loop, so no planner command can complete
     outside tests until Q2 and the counted-run authorization.
   - No retry: a failed or unresolved round leaves the room in PLANNING and
     is never reopened. That is slice 8's.
   - Cancel (T22) on the plan-decision endpoint, under the Q5 ruling. It
     binds to the room's latest journaled planner command. It answers 409
     `founder_cancel_unavailable` when the room has none, and 409
     `planner_command_in_flight` while any is pending or unresolved (Q6).
     G22's `runningTasksCancelled` is asserted only when every planner
     command is terminal. `plan_hash` is required in a plan-bearing state
     and refused in PLANNING, and a RECONCILING room records its prior
     state.
   Tests: `test/planner-loop.storage.test.ts` (with
   `test/support/synthetic-planner.ts`) and cancel cases in
   `test/plan-decision.test.ts`.
8. **Recovery.** `journaled` without `dispatched`, and `unresolved` without
   `resolved`, reconcile by `command_id` before any retry, and a bounded
   retry of a failed round is decided here; restart rebuilds without
   duplicate commands, approvals or authority (stop gate items 9 and 10).
   Built in `control-plane/src/planner-recovery.ts`:
   - Recovery verifies the journal from genesis first; a chain that does
     not verify stops it before anything is read or written.
   - The Planner is asked about the room's open command by its id
     (`PlannerPort.reconcile`), never given it again. Recovery mints no
     command and dispatches nothing.
   - Latest `journaled` or `identity_bound`: never received is a pre-send
     `failed`; accepted is recorded `dispatched` with the route the Planner
     reports, then finishes like a round; no answer is `unresolved` (§5.3).
   - Latest `dispatched`: a finished plan is submitted with `completed`
     (T3, the plan and the row in one transaction); still running, or no
     answer, writes nothing; "never received" contradicts the journal and
     is `unresolved`, reported as a mismatch.
   - Latest `unresolved`: only a `reconciled` answer resolves, the consumed
     §3.5 rule (MadBridge's `resumeSession` continues only on
     `reconciled`). A reconciled plan resolves `completed` with T3 and the
     plan, through the same completion test; a reconciled failure, an
     unacceptable plan or a diverged route resolves `failed`. `ambiguous`
     (no answer, still running, or a finished command whose dispatch the
     journal never recorded) and `mismatch` (another execution id or
     route) are reported and stay `unresolved`.
   - The execution id is the re-attestation: the Planner's answer must name
     the execution the journal bound.
   - No retry, by choice (Q8). §5.3 allows a never-received command to
     "proceed to a governed dispatch attempt"; this slice records it as
     `failed` instead.
   Tests: `test/planner-recovery.storage.test.ts`. They inject each
   interruption where it happens: a journal append failing mid-round, a
   lost dispatch response, a lost wait, a crash before T3. They include a
   restart on fresh stores over the same database.
9. **The integrated lifecycle tests (step 5).** The stop gate's items 1 to
   10 and the contract's §10 map, unit and storage. Built, on the Founder's
   direction "go ahead with slices 9-10":
   - `test/phase4-lifecycle.storage.test.ts`: the pieces assembled as
     production assembles them. The real composition root runs over a socket.
     One enrolled Gateway runs the daemon's real lane and worker against a
     synthetic executor. The goal enters on T1 and every decision enters on
     the plan-decision route, both over HTTP. The cases, in order:
     - a round to PLAN_REVIEW, bound end to end;
     - every bypass refused;
     - credential-shaped feedback refused;
     - a revision whose superseded hash approves nothing;
     - approval that dispatches nothing;
     - a Gateway lost mid-round, then recovered over the real channel after
       a restart, executing once;
     - a rebuild on fresh stores, with the mixed chain's classes in order and
       nothing duplicated;
     - a scan of every persisted row for the tokens, the Gateway key and the
       database password;
     - T2 refused once real heartbeats go stale.
     It runs in the runtime-role tier only, because the journal accepts no
     login but `br_app_runtime`.
   - `docs/phase4-stop-gate-test-map.md`: each item and each §10 row mapped
     to the tests that evidence it, by exact title, with what the map does
     not show.
   - `test/phase4-stop-gate-map.test.ts`: holds the map to the tests it
     cites, and to the contract's 15 §10 rows.
10. **Counted-run preparation (step 6).** A Phase 4 run harness under
    `packages/run-harness/src/phase4/`, and a proposed run unit for the act
    C6 of the ruling calls for. No counted run executes.

## Open questions for the Founder

These change the build. Slices 1 to 5 do not depend on Q1, Q2 or Q4.
Slice 5's cancel path depended on Q5, now ruled (below); cancel moves to
slice 7.

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
  **Founder ruling in session, 2026-10-15, verbatim:** "Consume the
  unpinned dependencies at 7d37a61, blob ids recorded". It answers the
  builder's finding that the thirteen pinned files import twenty-one
  MadBridge files `DEC-20260827-01` §5 does not list (the protocol
  types, the session machine, three policy modules, the ledger's hash
  chain and schema, and each adapter's shell, attestation and config
  modules). Those are consumed in their `7d37a61` form, and every
  consumed file, pinned or not, is recorded with its blob id.
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
  ruled, this branch cancels no room in any state: the generic route
  refuses T22 and the plan-decision endpoint answers 501. The options
  are a governed cancel command journaled first, a sentinel-free
  schema change that lets a decision row carry no `command_id`, or
  leaving pre-planning cancel unavailable in Phase 4.
  **Founder ruling in session, 2026-10-15, verbatim:** "Apprtoved: (d)
  For Phase 4, allow cancel only once a planner command exists, and leave
  pre-planning cancel unavailable. No migration and no stand-in values."
  Builder's reading, for the record: a T22 decision row carries the
  room's planner command id, as Q3 binds plan decisions; from
  `ROOM_CREATED` and `SCOPED` cancel stays refused. Cancel is built in
  slice 7, not slice 5, because G22 needs a fact the server must derive
  rather than accept ("running tasks cancelled or recorded
  unconfirmed_cancel"), and whether a planner command is still running is
  the planner loop's state. Until slice 7 the endpoint answered 501 for
  `founder.cancel`. Built in slice 7.
- **Q6. Cancel while a planner command is running.** Raised by slice 7.
  G22 passes on "running tasks cancelled or recorded unconfirmed_cancel".
  Build Room has no channel to stop a running Planner (Q2). The journal's
  closed vocabulary has no unconfirmed-cancel record either. So this
  branch refuses a cancel while any planner command of the room is
  pending or `unresolved` (409 `planner_command_in_flight`). The cost: an
  `unresolved` command blocks cancel until slice 8 reconciles it, and an
  ambiguous reconciliation could block it indefinitely. The options:
  (a) keep refusing;
  (b) treat "recorded unconfirmed_cancel" as the cancel's own transaction
  appending `unresolved` to the running command, leaving reconciliation to
  own its outcome;
  (c) another record, which needs a contract amendment.
  This is a Founder call; the builder has not chosen.
- **Q7. Inputs the system does not yet hold.** Raised by slice 7. Three
  facts the planner loop needs have no source in Build Room today. The
  loop takes each as an injected input, and production wires none.
  - Who assigns a room's planner, builder and reviewer seats. G2 reads
    `rolesAssigned` and `reviewerIsNotBuilder` from that assignment.
  - Which role and identity the control plane's own T2 act is attributed
    to.
  - The Founder goal as text. T1 carries the repository, base and scope
    paths but no goal statement, so the Planner is handed the T1 event as
    its goal reference.
  Builder's reading, for the record: the reviewer seat's role is
  `independent-reviewer`, and "reviewer≠builder" means the two seats run
  different models (`DEC-20260815-05`). Each of these is a Founder call
  before a counted run.
- **Q8. Retrying a failed planning round.** Raised by slice 8. A failed
  round leaves the room in PLANNING, and the only way out is the
  Founder's cancel. A ratified budget exists: `DEC-20260716-02` item 5,
  consumed in `packages/seat-registry/src/dispatch-policy.ts` as
  `retryBudgetTransition`.
  - Two retries per deployment within one execution, at most.
  - Each retry is a new `command_id`.
  - No retry while any outcome is unknown.
  - One failover, on the listed triggers only.
  The Seat Registry V1.1 plan reserves wiring that policy into a dispatch
  path for "a separately authorized tranche". Each retry contacts a
  provider again. So this branch retries nothing. The builder's proposal,
  if retries are wanted: retry only a round whose command failed as
  `not_sent`, which is a transport failure with affirmative no-effect
  evidence. Derive each retry's id from the room, the opening transition
  and the attempt number, and gate it on `retryBudgetTransition`. A plan
  that fails the schema would instead take the one corrective re-ask the
  same item names. This is a Founder call.

## Founder answers of 2026-10-15 (Q2, Q4, Q6, Q7, Q8)

Asked one at a time in session at the Founder's direction ("Ask me each
question needed 1 by 1"). Where the Founder chose an option, the answer
is recorded as that option's label and text, as presented. Where the
Founder wrote an answer, it is quoted verbatim. Q6, Q8 and Q7c are built
(below, "Built for Q6, Q8 and Q7c", on the Founder's direction "go ahead
with the Q6, Q8 and Q7c slice"); the rest are not.

- **Q6, cancel while a planner command runs.** Selected: "Allow, mark
  unconfirmed (Recommended)". Option text: "Cancel goes through. In the
  same transaction, a still-pending command is recorded `unresolved`;
  one already unresolved stays so. That counts as the guard's 'recorded
  unconfirmed_cancel'. Risk: the Planner may keep running unseen; any
  plan it later returns is rejected because the room is closed."
- **Q8, retrying a failed round.** Selected: "Retry only not_sent
  (Recommended)". Option text: "Retry only a round whose command
  provably never left (not_sent: a transport failure with affirmative
  no-effect evidence). At most 2 per deployment, each a new command id
  with the attempt number, gated on the existing retry-budget function.
  Nothing else retries."
- **Q2a, the Planner's adapter.** Founder, verbatim: "Antigravity but
  model wise would need to be active model. Not sure how you would want
  to word it." The builder proposed this wording: "The Planner runs on
  the Antigravity adapter, on the active model: the Gemini model the
  Founder has manually selected for the run, which must be registered
  and provider-verified with a model-registry entry. Build Room records
  it as the intended model before dispatch; an attested or observed
  model that differs fails the round closed. No Auto mode or silent
  switching." Asked where the active model comes from, the Founder
  selected "Named in the run's authorization (Recommended)". Option
  text: "Your entry authorization for each counted run names the
  selected model. Build Room journals that as the intended model, then
  checks Antigravity's attestation against it."
- **Q2b, handing work to the Gateway.** Selected: "Gateway pulls, in
  Phase 4 (Recommended)". Option text: "The Gateway asks for assigned
  planner commands over its existing authenticated session, and reports
  results the same way. The PC still accepts no inbound connection.
  Built on this branch as Phase 4 work."
- **Q7a, who assigns seats.** Selected: "Named in the run's
  authorization (Recommended)". Option text: "Your counted-run
  authorization names each seat's model, the same instrument as Q2a.
  Build Room checks each against that seat's approved lanes in the seat
  registry; reviewer must run a different model from builder
  (DEC-20260815-05)."
- **Q7b, attribution of the control plane's T2.** The Founder first
  asked, verbatim: "I thought MADVentures-Tui was the control plane? Am
  I mistaken, If yes ask again." The builder answered that the control
  plane is the Railway service in this repository, and that MadBridge
  is a consumed client-side bridge with no authority over command
  history (`DEC-20260827-01`). Re-asked, the Founder selected "New
  control-plane surface (Recommended)". Option text: "Register
  `build-room-control-plane` in the execution-surface registry (a
  FounderOS change under DEC-20260815-06). T2 records role `builder`,
  actor `control-plane:<deployment id>`, model `n/a (deterministic
  control-plane act)`. Truthful; needs that registration before a
  counted run."
- **Q7c, the goal text.** Selected: "Captured with the scope
  (Recommended)". Option text: "You supply the goal text when the room's
  scope is captured (T1), alongside repository, base and paths. Build
  Room stores it with the event, scans it for credentials, records its
  digest as evidence, and it is immutable for the room from then on."
- **Q4, the ceiling code fix.** Selected: "Separate small PR
  (Recommended)". Option text: "A focused PR on main with the
  one-condition change, its tests and the §9 doc update. Reviewed and
  merged on its own SHA-named authorization."

Built for Q6, Q8 and Q7c:
- **Q6** in `control-plane/src/plan-decision.ts`. A cancel while a planner
  command is pending or `unresolved` goes through, with G22's
  `unconfirmedCancelRecorded`. In the same transaction each pending
  command is recorded `unresolved`, bound to the T22 event, with evidence
  `unconfirmed-cancel`. An `unresolved` one is left as it is. A round
  still running when its room is cancelled reports `cancelled` once its
  next journal append is refused. Any plan that comes back later changes
  nothing.
- **Q8** in `control-plane/src/planner-loop.ts`. A round whose latest
  attempt failed `not_sent` is retried as a new command when
  `retryBudgetTransition` allows it.
  - Attempt ids derive from the room, the opening transition and the
    attempt number; attempt 1 keeps its id.
  - The retry's `journaled` row carries `retry-of/<command>` and
    `retry-reason/not_sent`.
  - The builder's reading of "within one execution" is one round, so a
    revision round starts a fresh budget.
  - Any other failure answers `round_failed`. A pending or unresolved
    attempt answers `round_already_open`. A spent budget answers
    `retry_budget_exhausted`.
  - Cancel and recovery read every attempt.
- **Q7c** in `control-plane/src/founder-goal.ts` and the room route. A
  goal on T1 is checked (non-empty, at most 20000 characters, no
  credential-shaped text) and its digest is added as server evidence
  (`founder_goal`). A goal on any other event, or caller-supplied goal
  evidence, is refused with 400. The planner loop opens no round without
  a goal, or when the goal no longer matches its digest. It hands the
  goal to the Planner and journals the digest. A T1 with no goal is still
  accepted, because the run harness captures scope without one.

Tests: Q6, Q8 and Q7c cases in `test/planner-loop.storage.test.ts`,
`test/plan-decision.test.ts`, `test/planner-recovery.storage.test.ts` and
`test/control-plane-server.test.ts`.

Built for Q2b, on the Founder's direction "go ahead with the Q2b Gateway
pull channel":
- **Transport.** The ratified one: `DEC-20260815-15` clause 2,
  outbound-only HTTPS long-poll plus POST, with a zero wait. A poll
  answers at once and the Gateway polls on its session cadence. The PC
  accepts no inbound connection. Clause 3's delivery confirmation is per
  request: a request is re-delivered until answered, and `status` is the
  reconciliation poll.
- **Protocol** (`packages/gateway-protocol`). Two new session-bound
  purposes, `planner_poll` and `planner_report`, each signed under its
  own domain tag on the heartbeat's epoch and sequence counter. A report
  signs its request id and the SHA-256 of its payload text. The payload
  is carried beside the signed array, bounded at 200 KiB of UTF-8, and
  parsed only once the signature and digest both hold. The request and
  report shapes are closed and validated by one module both sides use
  (`planner.ts`).
- **Control plane** (`gateway/planner-channel.ts`, `session.ts`,
  `routes.ts`). An in-memory mailbox addressed by Gateway id, and the
  `PlannerPort` it backs.
  - `POST /gateway/planner/poll` collects one request.
  - `POST /gateway/planner/report` answers one, with its own 256 KB body
    limit.
  - Both run the heartbeat's guard order and fenced checks. They advance
    the session cursor and never touch liveness.
  - Nothing is durable, so there is no migration. A restart ends the loop,
    and recovery asks the Gateway `status` again.
  - `dispatch` answers `not_sent` only when the Gateway says so, or when
    the `execute` request was withdrawn before any poll carried it. A
    delivered, unanswered `execute` throws, and the loop records
    `unresolved`.
  - `PlannerPort.attest` now takes the command id, so the Gateway binds
    its execution to that one command.
- **Gateway** (`gateway-daemon/src/planner-worker.ts`, `lanes.ts`,
  `daemon.ts`). A worker answers `attest`, `execute` and `status` from a
  durable record per command, kept in the Gateway's directory.
  - It writes `starting` before it starts anything, so a command executes
    at most once.
  - It answers `never_received` and `not_sent` only on proof.
  - It answers nothing when it cannot know: a start that threw, or an
    execution a previous process held, which is marked `lost` at boot.
  - The primary lane exchanges after each heartbeat, in the same
    single-flight tick, on the same sequence counter.
- **What is not built.** No executor ships. Q2a rules Antigravity on the
  active model, but `DEC-20260827-01` §3.4 authorizes no provider binding,
  and the two adapter classes remain deferred (`madbridge-consumed`). So
  the daemon polls nothing unless an executor is injected. Nothing in
  `server.ts` runs a loop either: the counted-run authorization that names
  the model and the seats (Q2a, Q7a) is slice 10's. Cancelling a running
  Gateway execution is not built: Q6's unconfirmed cancel stands, and the
  Gateway may keep running unseen.
- **For the Founder.** The Gateway protocol was built from the Gateway
  Enrollment Pairing contract Rev 4.7, an artifact outside this
  repository. Its code said "two purposes exist and no more". This slice
  adds two more under the Q2b ruling. The builder cannot see whether that
  contract expects an amendment record of its own.

Tests:
- `test/gateway-planner-protocol.test.ts`: signed bytes, cross-purpose
  refusal, the payload bound, the closed shapes.
- `test/gateway-planner-channel.test.ts`: the port and the worker over an
  in-process pump.
- `test/gateway-planner-pull.storage.test.ts`: a real control plane over a
  socket, the real lane and worker. It runs in the runtime-role tier.
- A Q2b case in `test/planner-loop.storage.test.ts`: the real loop reaching
  PLAN_REVIEW over the channel.

What these answers do not yet settle:
- Q7b's surface needs a FounderOS registry change before a counted run.
  That is a FounderOS pull request needing the Founder's own merge
  authorization.
- Q2a and Q7a name an instrument that does not exist yet: the counted-run
  entry authorization, slice 10's proposal.
- Q2a's executor: the Gateway's Antigravity adapter is a provider binding,
  which `DEC-20260827-01` §3.4 does not authorize.

## Verification

Every slice: typecheck, the default suite as an unprivileged user, lint on
the changed files, and the repository gates. Slices that touch storage
also run `test:storage` and `test:storage:runtime-role` against a scratch
PostgreSQL 16.
