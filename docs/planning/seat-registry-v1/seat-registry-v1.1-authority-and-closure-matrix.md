SEAT REGISTRY V1.1 — AUTHORITY AND CLOSURE MATRIX (DRAFT)
=========================================================

Work ID: seat-reg-v1.1-integration-plan-draft (companion to
seat-registry-v1.1-non-activating-integration-plan-DRAFT.md)
Authoring seat: architect (Daedalus) — planning authority only
Status: DRAFT — UNRATIFIED — FOUNDER REVIEW REQUIRED. This matrix
records authority citations and closure obligations; it confers none.

------------------------------------------------------------
SECTION A — CORPUS AND REPOSITORY IDENTITIES
------------------------------------------------------------

A1. Target repository: MADVenturesLLC/founder-os-build-room
    Local path: /Users/michaeldaley/MADVenturesOPs/founder-os-build-room
    Declared main (Founder disposition): 407f025cc1b33c8c3d8f796d09967f08ab2a7ed8
    Verified live: local main = origin/main = 407f025cc1b33c8c3d8f796d09967f08ab2a7ed8
    Working tree: detached at 8c2e87c1d2340a5a935a057aca0c23ab74712400,
    clean except pre-existing untracked .worktrees/; tree diff
    8c2e87c..407f025c is EMPTY (verified: git diff --stat | wc -l = 0;
    merge-base = 8c2e87c), so the inspected tree is byte-identical in
    content to the declared corpus.
    Open PRs at inspection: #21 (audit-remediation integration, hygiene
    gates) — OPEN; no PR 2b; no other open PRs.

A2. Seat Registry V1 governing identities (verified this session):
    - Ratified plan r7: docs/planning/seat-registry-v1/
      seat-registry-v1-implementation-plan-r7-DRAFT.md
      SHA-256 b1bc4159b8cdb1ce6c342d84b4be3650a340abfc467624154ea5ba2a54815b60
      141,867 bytes; 895 lines; one trailing newline.
    - Governing DEC: DEC-20260902-02 (active, source_of_truth true,
      version 0.2; FounderOS merge 8198ecf002324cc4e00cf035c7cb98c6de0bc746;
      decision merged as 127c1b841c20b630a573c1db1afdc32d9b7672f8).
    - Doctrine fixture pin: bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda
      (ten vendored fixtures, each hash-pinned; integrity test recomputes).
    - Implementation merge: PR #20, merge commit 407f025c (main), second
      parent 8c2e87c, base fb6ad8f; 28 changed paths; 706/243/0 suite.

A3. Environment: macOS 26.6.2; Node v22.23.2 (repo pins 22:
    .nvmrc, engines, CI, Railway); TMPDIR=/tmp/br; suite verified green
    at the declared corpus (706/243/0, this session).

------------------------------------------------------------
SECTION B — AUTHORITY MATRIX (ROW PER QUESTION)
------------------------------------------------------------

Each row: the question, the controlling clause(s), and the closure
answer. "Plan §" references are to the companion plan draft.

B1. May the V1.1 tranche proceed on the V1 ratification alone?
    Controlling: DEC-20260902-02 "Authority not granted" ("Any
    implementation tranche requires a separate, exact Founder
    authorization") and "Next action" ("Separate Founder authorization
    for any implementation tranche (r7 §11 items 3–5), naming the
    then-current Build Room main SHA and an isolated branch from that
    SHA"); PR #20 merge authorization ("S3 remains deferred to the first
    separately authorized integration-consumer tranche").
    Answer: NO. An exact-SHA Founder implementation authorization naming
    the then-current main SHA is REQUIRED before any file change. Plan
    §11.1, §13.

B2. Does the tranche as scoped require a NEW DEC?
    Controlling: Decision Rules §1 (what counts as a decision: affects
    product direction, architecture, source-of-truth structure, agent
    roles, risk posture, hard-to-reverse choices; small edits and
    low-risk execution do not); DEC-20260902-02 freeze posture
    ("mechanizes existing identity, binding, refusal, and accountability
    rules; it creates no new role, seat, model authority, merge
    authority, deployment authority, or decision rule"); r7 §10.1
    ("No policy-engine binding beyond exported data (V1.1)" — the V1.1
    tag defers the binding; it does not condition it on a DEC); r7
    §10.2/§14 (the gateway-zone slice is deferred, not this tranche).
    Answer: NOT REQUIRED for the scoped tranche (binding the control
    plane to the already-ratified fail-closed refusals; additive,
    reversible, no new rule/role/identity/vocabulary). FLIPS to REQUIRED
    if any §11.2 condition enters scope (enforcement-label change,
    contract/fixture re-pin, §14 deferred-observation dispositioning,
    gateway-zone boundary, doctrine/journal amendment). A DEC remains
    AVAILABLE as a Founder record-keeping choice (plan FD-3). No DEC
    identifier is allocated by this draft.

B3. Was a complete-corpus compiler PASS required before this plan?
    Controlling: r7 §11 item 1 required the fresh independent PASS over
    r7 itself before the Seat Registry DEC (discharged by Pass 9,
    recorded in DEC-20260902-02). No controlling clause extends a
    compiler-PASS entry gate to a V1.1 control-plane tranche; r7 §14
    records deferred observations "for the Seat Registry DEC," not for
    V1.1 integration.
    Answer: NOT REQUIRED by the controlling corpus. An advisory compiler
    pass over THIS plan is AVAILABLE under DEC-20260718-03 (manual,
    founder- or builder-invoked, advisory per its clause 6). Plan FD-5.

B4. What mechanism authorizes the tranche's file changes?
    Controlling: r7 §11 item 3 pattern; DEC-20260902-02 Next action; PR
    #20 merge authorization boundary.
    Answer: Founder implementation authorization naming: the then-current
    main SHA; the isolated branch; the plan's exact path and SHA-256 (or
    its corrected revision); the 4-path changed-path ceiling; the §3.2
    exclusion list; the §17 stop conditions. Plan §11.1 checklist.

B5. What authorizes MERGE of the tranche's PR?
    Controlling: DEC-20260718-04 (SHA-named Founder merge authorization);
    DEC-20260721-01 ruling item 3 (builder executes the merge on founder
    authorization — no independent builder merge authority); AGENTS.md
    (CI green before merge); DEC-20260815-18 (required-check conventions).
    Answer: SHA-named Founder merge authorization after advisory review
    and exact-head Tier-2 review; builder executes only on it. Plan §14.

B6. Does the tranche require S3 (package/workspace registration)?
    Controlling: Founder S3 DEFER ruling (PR #20 corrections comment):
    "Package registration is deferred to the first separately authorized
    Seat Registry integration-consumer tranche"; PR #20 merge
    authorization ("does not authorize: workspace or package
    registration").
    Answer: NO. The first consumer binds by RELATIVE SOURCE IMPORT
    ('../../seat-registry/src/index.js'), matching the repository's
    actual cross-package convention (ledger.ts:39, decision-row.ts:22,
    client.ts:29, routes.ts:17 — all relative; '@build-room/*' appears
    only in package.json metadata and comments). The build compiles
    seat-registry transitively (dist/packages/seat-registry verified);
    root configs need no change. S3 remains deferred and EXCLUDED.
    Plan §4, FD-1.

B7. May the tranche change the registry itself?
    Controlling: r7 §10.1 (V1 prohibited list); fixture/contract
    hash-pinning tests (tamper fails closed).
    Answer: NO. Every seat-registry source file, contracts/seats file,
    and fixture is untouchable in this tranche (changed-path ceiling of
    4 paths; stop condition S4).

B8. Does integration make any lane eligible or standing?
    Controlling: r7 §2.5/§3.1 (every approved-binding lane requires a
    per-task/per-run/per-invocation Founder act or manual selection —
    lane_not_standing by construction); resolve.ts (resolved only when
    an approved-binding lane has no standing requirement — never in V1).
    Answer: NO. The gate can only ECHO the registry's refusals; it adds
    no eligibility. Proven by T5 (all four seats refuse through the
    gate) and the T5 negative control (a seam-injected 'resolved'
    resolver returns allowed — proving the registry, not the gate,
    holds the closure). Plan §5.3, §10.

B9. May the tranche wire the gate into a live dispatch route?
    Controlling: r7 §3 (seat resolution belongs on the governed Phase 4
    dispatch path at the control plane); the journal contract §5
    (command_id idempotency owned by the dispatch path); F11 (no
    dispatch path exists).
    Answer: The gate is BUILT consumable but deliberately UNWIRED. No
    route, route handler, or counted-run surface changes in this
    tranche. The wiring is the next tranche's separately authorized
    scope. Plan §5.3, §18 item 6.

B10. Which review chain obligations apply to the tranche?
    Controlling: decision-log v4.51 advisory reviewer set; DEC-20260815-05
    (Tier-2 roster and distinctness); DEC-20260826-01 (marker written
    with the attestation id); DEC-20260718-04 (merge authorization);
    DEC-20260721-01 item 3 (merge execution).
    Answer: Unchanged and mandatory: advisory review → exact-head Tier-2
    → SHA-named Founder merge authorization. Plan §14, FD-6.

B11. Do Lab study-record mechanics apply?
    Controlling: madventures-engineering-lab AGENTS.md (the Lab's
    controlling rule) is the ENGINEERING LAB's rule, not Build Room's;
    Build Room work runs under its own AGENTS.md and the Founder
    disposition chain. The Founder's §5 excludes Lab work from V1.1.
    Answer: NO Lab study record is required for, or implicated by, this
    Build Room tranche. Lab work remains excluded.

B12. Does the tranche alter FounderOS doctrine?
    Controlling: Build Room AGENTS.md ("Never create or modify
    governance doctrine (lives in FounderOS)"); the Founder's §5
    exclusion; DEC-20260902-02's freeze-posture precedent.
    Answer: NO. Zero FounderOS paths in the changed-path ceiling. Any
    doctrine need is a STOP condition (S4), not a design choice.

------------------------------------------------------------
SECTION C — CLOSURE OBLIGATIONS (WHAT "DONE" REQUIRES FOR THE TRANCHE)
------------------------------------------------------------

The authorized tranche closes only when the build report contains ALL of:

C1. Identities: the authorized base SHA; the candidate head SHA; this
    plan's path and SHA-256 (or its ratified revision's); executing
    identity (seat/surface/model) with attribution trailers.
C2. Changed paths: exactly the 4 paths of plan §6, verified by
    git diff --name-only against the authorized base.
C3. Acceptance: T1–T18 evidence mapped to the Founder's §7 items 1–18,
    pass/fail per item; the cannot-prove list restated.
C4. Mutation evidence: every new guard proven RED by targeted mutation
    (resolver-binding, unknown-outcome, ceilings, failover identity,
    replay no-new-id, distinctness, static-surface guards).
C5. Suite: three consecutive full-suite green runs (Node 22,
    TMPDIR=/tmp/br), verbatim output; all repository gates passing
    (plus PR #21's gates if merged at base).
C6. Rollback drill: revert on a scratch branch; suite returns to the
    pre-tranche baseline (706/243/0 or the base's recorded baseline).
C7. Review chain: advisory-review dispositions; the Tier-2 marker bound
    to the exact candidate head (attestation id); the SHA-named Founder
    merge authorization; merge executed by builder only on it.
C8. Post-merge verification: merge SHA and both parents; merge-versus-
    first-parent path set equals the 4 reviewed paths; recomputed
    identities; suite + gates on the merged tree; final worktree state.
C9. Terminal line: SEAT-REGISTRY-V1.1-INTEGRATION-COMPLETE — ACTIVATION
    REMAINS SEPARATELY GATED (wording final at Founder authorization;
    the semantic content is fixed).

A missing element means not closed.

------------------------------------------------------------
SECTION D — DRIFT AND INVALIDATION
------------------------------------------------------------

D1. This matrix and the plan are bound to the declared corpus
    (main 407f025c, tree-identical working state). If main moves, the
    plan's base references must be re-verified and the Founder
    authorization must name the then-current SHA (stop condition S1).
D2. Symbol contract: the plan binds to named symbols (plan §17 S2):
    resolveSeat, RetryBudgetState, retryBudgetTransition,
    DISPATCH_POLICY, isDistinctReviewLane, validateHandoff, SEAT_IDS,
    RATIFIED_SEATS, ROLE_REGISTRAR, LANE_STANDING_REQUIREMENT,
    TIER2_ROSTER_ATTESTATION_IDS, MP1_STATEMENT, DISPATCH_AT_MOST_ONCE,
    classifyTransportFailure. Any moved/changed/disappeared symbol
    invalidates the plan pending re-derivation.
D3. The authority citations are valid as read at the inspected corpus
    and FounderOS commit (DEC files read this session). Supersession of
    any cited clause by a later Founder act invalidates the affected row
    of Section B pending re-derivation.
D4. Any of the §11.2 flip conditions (enforcement-label change,
    contract/fixture re-pin, §14 dispositioning, gateway-zone work,
    doctrine/journal amendment) entering scope converts B2's answer to
    "both" (new DEC + authorization) and stops the tranche.

------------------------------------------------------------
## What this does not prove

- This matrix does not prove any authority is held. Both artifacts are
  advisory drafts; every Founder act in Section B remains to be
  performed by the Founder.
- The readiness report referenced by the Founder's §6 was not located as
  a distinct artifact in the inspected corpus; B2's answer is derived
  from the controlling clauses, per the Founder's direction not to
  assume a DEC from a report's suggestion. If such a report exists
  outside the inspected surfaces, its suggestion does not change B2.
- No repository, worktree, branch, commit, push, PR, or DEC allocation
  was performed in producing this matrix. No identifier was reserved.
- The detached working tree was treated as the declared corpus on the
  verified empty tree diff (A1); no byte-level claim is made about refs
  beyond those verified.
- PR #21's gates were not executed against the proposed files (their
  interaction is bounded to CI gating, not design).
- Nothing here proves, claims, or implies activation, eligibility,
  standing routing authority, or operational readiness of any kind.
  MP-1 remains approved but inactive.

— END OF MATRIX DRAFT —
