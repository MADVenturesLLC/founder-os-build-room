SEAT REGISTRY V1.1 — NON-ACTIVATING INTEGRATION PLAN (DRAFT)
=============================================================

Work ID: seat-reg-v1.1-integration-plan-draft
Authoring seat: architect (Daedalus) — planning authority only, no build authority
Commissioning act: Founder disposition "SEAT REGISTRY V1.1 NON-ACTIVATING
INTEGRATION PLAN" (Michael Daley, 2026-09-03), which authorizes PLANNING for
V1.1 integration only and does not authorize activation.
Status: DRAFT — UNRATIFIED — FOUNDER REVIEW REQUIRED. This plan confers no
authority. No clause of this plan authorizes implementation, merge,
deployment, activation, provider access, credentials, or spend.

--------------------------------------------------------------------------
0. CONTROLLING INPUT AND AUTHORITY
--------------------------------------------------------------------------

0.1 Commissioning disposition

  Founder disposition, received 2026-09-03 (quoted structure, not verbatim
  wholesale): distinguish V1.1 INTEGRATION (technically consumable by the
  control plane, enforcement proven in tests, all unauthorized execution
  fail-closed) from ACTIVATION (providers, models, surfaces, routing lanes,
  credentials, live execution, spend). Planning authorized for integration
  only. S3 may be included only if repository evidence proves it required.
  Artifacts off-repository only. Do not modify any repository, branch,
  commit, push, open a PR, allocate a DEC, or begin implementation.

0.2 Governing authority stack inspected (full reads, this session)

  A. DEC-20260902-02 — Seat Registry V1 r7 Plan Ratification
     (FounderOS 07-decisions/DEC-20260902-02-seat-registry-v1-r7-ratification.md,
     status active, source_of_truth true, version 0.2).
     Load-bearing clauses:
       - "Any implementation tranche requires a separate, exact Founder
         authorization."
       - Next action: "Separate Founder authorization for any implementation
         tranche (r7 §11 items 3–5), naming the then-current Build Room
         main SHA and an isolated branch from that SHA. No implementation
         proceeds on this ratification alone."
       - Authority-not-granted list: ratification alone does not implement,
         activate, create standing routes, enable providers/credentials/
         spend, or grant merge authority.

  B. Ratified plan r7
     (docs/planning/seat-registry-v1/seat-registry-v1-implementation-plan-r7-DRAFT.md,
     SHA-256 b1bc4159b8cdb1ce6c342d84b4be3650a340abfc467624154ea5ba2a54815b60,
     141,867 bytes, 895 lines, one trailing newline — identity recorded in
     DEC-20260902-02 and re-verified this session).
     Load-bearing clauses:
       - §10.1 prohibited list, V1 tranche: "No policy-engine binding
         beyond exported data (V1.1)." The (V1.1) tag marks this prohibition
         as the one a V1.1 tranche relaxes: V1.1 is where policy binding may
         go beyond exported data. r7 does not itself authorize V1.1; it
         defers it.
       - §10.2 deferred, not V1: "Gateway-zone authority enforcement
         (V1.1) · worktree-per-seat (own DEC) · ... a journal seat_id
         amendment (post-foundation, only on later implementation evidence)."
       - §14: "Behavioral authority stays behavioral in V1. Only the V1.1
         gateway slice makes any boundary technical."
       - §11 item 3 pattern: "Founder authorization naming the exact
         then-current Build Room main SHA as the implementation base, and
         an isolated branch from that SHA."
       - §8 no-touch list (lane isolation): command-journal contract,
         journal-foundation files, migrations.ts while PR 2b is open,
         lifecycle vocabulary, counted-run surfaces, MadBridge/TUI files.
       - Closing line: the plan resolves planning choices only; it
         authorizes no implementation, deployment, activation, providers,
         credentials, spend, counted runs, Lab activation, journal-contract
         changes, or merge.

  C. PR #20 Founder merge authorization (2026-09-03), comment record read
     this session. Load-bearing clauses:
       - "This authorization permits merging the reviewed Seat Registry V1
         implementation only. It does not authorize: Seat Registry
         activation; workspace or package registration; a live provider or
         execution-surface binding; integration with Room Runtime or the
         Lab; Phase 4 rebind; PR 2b; deployment; spending; FounderOS
         doctrine changes; a fifth seat; conversion of an execution slot
         into a seat."
       - "S3 remains deferred to the first separately authorized
         integration-consumer tranche."
     This plan drafts that tranche. The tranche exists only when the Founder
     separately authorizes it; this draft is not that authorization.

  D. Founder S3 disposition (PR #20 corrections comment, 2026-09-03):
     "Package registration is deferred to the first separately authorized
     Seat Registry integration-consumer tranche. This deferral does not
     authorize Room Runtime, Lab, activation, deployment, provider binding,
     or any other integration." The same comment forbids, under the S3
     DEFER ruling: packages/seat-registry/package.json, workspace
     registration, root package.json changes, root package-lock.json
     changes, root tsconfig.json changes.

  E. founder-os-build-room AGENTS.md (56 lines, read in full): builder
     implements; founder authorizes and reviews; never create or modify
     governance doctrine (lives in FounderOS); never self-provision
     credentials; never deploy without separate Founder authorization;
     attribution trailers per DEC-20260718-05 on role-accountable commits.

  F. Decision Rules (FounderOS 01-constitution/decision-rules.md, §1
     "What Counts as a Decision"): a decision should be logged when it
     affects product direction, architecture, source-of-truth structure,
     roadmap, agent roles, risk posture, or any hard-to-reverse choice;
     "Small edits, formatting changes, minor wording changes, and low-risk
     task execution do not need a decision entry."

  G. Command journal contract v0.17 (docs/command-journal-contract.md),
     §1 dispatch-idempotency clause: "command_id is the end-to-end
     idempotency key: the dispatch path presents it to the gateway and
     adapter, which must enforce at-most-once execution per command_id. A
     retry is safe only because of this binding, and no dispatch
     integration that cannot honor it is a conforming dispatch path."
     Read in full for §2 (eleven-element record) and §5 (event vocabulary).

0.3 What this draft is not

  This draft is not a DEC, not a ratification, not an implementation
  authorization, not a merge authorization, and not a study record under
  the Engineering Lab. It is an advisory implementation plan produced
  under the Founder's drafting authority. Every open Founder decision is
  enumerated in section 16; none is decided here.

--------------------------------------------------------------------------
1. CORPUS AND REPOSITORY IDENTITIES (EVIDENCE BASE)
--------------------------------------------------------------------------

All identities below were captured by live command this session
(2026-09-03, UTC), not from memory.

1.1 Target repository: MADVenturesLLC/founder-os-build-room
    (local path /Users/michaeldaley/MADVenturesOPs/founder-os-build-room)

  - Declared main (Founder disposition): 407f025cc1b33c8c3d8f796d09967f08ab2a7ed8
  - Verified: local main and origin/main both at 407f025cc1b33c8c3d8f796d09967f08ab2a7ed8.
  - Working tree state: DETACHED at 8c2e87c1d2340a5a935a057aca0c23ab74712400
    (branch tip merged by PR #20). Relationship verified:
      * 8c2e87c is the merge-base of itself and 407f025c (git merge-base).
      * 407f025c is a merge whose second parent is 8c2e87c; the tree diff
        8c2e87c..407f025c is EMPTY (git diff --stat | wc -l = 0).
    Therefore the detached working tree is BYTE-IDENTICAL in content to the
    declared main corpus. All inspection below is valid for 407f025c.
  - Tracked-file state: clean (git status --porcelain shows only an
    untracked .worktrees/ directory, pre-existing, not touched).
  - Build/test verification runs performed this session (disclosure): npm
    run build and TMPDIR=/tmp/br npm test were executed under Node
    v22.23.2. These wrote only gitignored build output (dist/, *.tsbuildinfo)
    and TMPDIR scratch. The tracked tree was unchanged before and after
    (git status identical). Result: 706 tests / 243 suites / 706 pass /
    0 fail / 0 skipped. This is the measured AC16 baseline for this plan.

1.2 Open repository state that can move the base (drift risk)

  - PR #21 "ci(hygiene): verified 12-path audit-remediation integration"
    is OPEN against main (opened 2026-09-03, branch
    build-room-audit-remediation-integration, adds lint and secret-scan
    gates and pins actions). PR 2b is NOT open (gh pr list: no PR 2b; the
    r7 §8 migrations.ts no-touch condition is dormant but must be
    re-checked at implementation start).
  - Consequence: any implementation authorization must name the
    then-current main SHA at authorization time. If PR #21 merges first,
    the V1.1 branch must be cut from the new main and must also pass the
    new lint/secret-scan gates; no content of this plan depends on PR #21.

1.3 Seat Registry V1 package (implemented, merged, inactive)

  - packages/seat-registry/src/: index.ts (entry), vocabulary.ts,
    schema.ts, fixtures.ts, conditions.ts, registry-data.ts,
    model-distinctness.ts, resolve.ts, dispatch-policy.ts, handoff.ts.
  - packages/seat-registry/fixtures/: ten vendored doctrine fixtures with
    recorded SHA-256 pins (doctrine pin bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda).
  - contracts/seats/{researcher,architect,builder,independent-reviewer}.md
    with SHA-256 pins recomputed live by test 3.
  - NO packages/seat-registry/package.json exists (S3 deferred).
  - Existing tests: test/seat-registry-{schema,fixtures,policy}.test.ts
    (47 tests across 14 suites at the merged head), all importing only the
    public entry '../packages/seat-registry/src/index.js'.

1.4 Environment identity

  - Host: macOS 26.6.2 (Darwin). Node v22.23.2 (via
    ~/.nvm/versions/node/v22.23.2) — REQUIRED: the repo pins engines
    node 22.x, .nvmrc 22, CI setup-node 22, and Railway pins 22. The
    machine default node is a different major and produces spurious
    failures; the implementation tranche must run under Node 22.
  - Test convention: TMPDIR=/tmp/br npm test (matches the Build Report and
    prior verification runs).
  - Storage suite: requires TEST_DATABASE_URL; optional locally, supplied
    by CI. Not required for V1.1 (the gate adds no storage surface).

--------------------------------------------------------------------------
2. CURRENT-STATE FINDINGS
--------------------------------------------------------------------------

Each finding: evidence, then inference. Line anchors are valid at the
declared corpus; the contract is the named symbol (section 17).

F1. Package entry point exists and is stable.
    Evidence: packages/seat-registry/src/index.ts re-exports exactly the
    nine public modules (vocabulary, schema, fixtures, conditions,
    registry-data, model-distinctness, resolve, dispatch-policy, handoff).
    Inference: a consumer has one stable internal surface;
    '.../seat-registry/src/index.js' is the public entry point.

F2. resolveSeat is fail-closed and never resolves in V1.
    Evidence: resolve.ts — resolveSeat returns ResolvedSeat only when an
    approved-binding lane has no entry in LANE_STANDING_REQUIREMENT; every
    approved-binding lane of all four seats has an entry (per-task
    Founder authorization, Founder's manual per-task model selection,
    per-invocation preconditions, or per-run Founder act). Refusal classes:
    unknown_seat, seat_outside_registry, contract_hash_mismatch,
    lane_below_approved_binding, lane_not_standing, routing_set_empty,
    temporary_task_assignment_not_lane_authority.
    Inference: binding any consumer to resolveSeat preserves
    lane_not_standing as the default result for every seat; the refusal
    reason names the per-task/per-run/per-invocation requirement.

F3. Readiness proves registration, never credentials or capacity.
    Evidence: resolve.ts ReadinessProbeRunner/DEFAULT_PROBE — probe checks
    lane.surface_id against the six registered coding surfaces
    (SURFACE_IDS); doc comment: "readiness proves credentials, never
    capacity" (incident R-5.4.02). No provider call, no credential read.
    Inference: V1.1 cannot and does not attempt credential readiness; a
    later activation tranche is required for that (section 18).

F4. Dispatch policy is exported data plus a pure transition function.
    Evidence: dispatch-policy.ts — DISPATCH_POLICY
    (transport_retries_max: 2, lane_failovers_max: 1, the
    DEC-20260720-03 item-4 ELIGIBLE and INELIGIBLE trigger lists);
    retryBudgetTransition (pure state machine over RetryBudgetState);
    classifyTransportFailure (without affirmative no-effect evidence the
    outcome is seat_unresolved, never seat_failed);
    contractEventForOutcome (total mapping onto contract §5 events);
    DISPATCH_AT_MOST_ONCE; DISPATCH_PATH_OBLIGATIONS;
    MP1_STATEMENT = 'MP-1 remains approved but inactive.';
    isDispatch(event) true only for initial_dispatch, retry_request,
    failover_request.
    Retry semantics (header comment): "each retry or failover is a distinct
    governed command record (a new command_id under the eleven-element
    contract)... each command_id may be dispatched at most once... retries
    are bounded at two per deployment within one execution, per
    DEC-20260716-02 item 5 — its sole source... at most one lawful
    failover, which must change surface_id or model_id."
    Unknown-outcome semantics: pending_unknown_outcome blocks both retry
    and failover until 'reconciled'; a new command_id never bypasses it;
    lost_response_replay consumes nothing, opens no bucket, and resolves
    to the same logical command.
    Inference: all dispatch-decision mechanics the Founder's §3 names are
    already exported, pure, and provider-free. V1.1 binds them; it adds no
    new semantics.

F5. Model distinctness is an exported predicate over package data.
    Evidence: model-distinctness.ts — isDistinctReviewLane
    (implementationModelId, reviewLane): false when model_ids are equal;
    true only when the lane's attestation id is on
    TIER2_ROSTER_ATTESTATION_IDS (gemini-3.1-pro, chatgpt-5.6-sol,
    chatgpt-5.6-terra, chatgpt-5.6-luna, grok-4.5). Doc comment: "This is
    a model check, not a provider-organization check... this package
    proves the predicate, not the dispatch."
    Inference: V1.1 can prove the requirement is enforced at the policy
    boundary WITHOUT claiming any independent review occurred; any claim
    that a review happened would be false (section 18).

F6. Role registrar is the thirty-role set including strategist.
    Evidence: resolve.ts ROLE_REGISTRAR (thirty role ids, strategist
    present — the S2 correction); resolveSeat('strategist') returns
    seat_outside_registry; unknown ids return unknown_seat. SEAT_IDS is
    exactly the four canonical seats; isSeatId admits nothing else.
    Inference: acceptance items 1-4 are already provable at the package
    layer and re-provable through the integrated gate.

F7. Handoff validator rejects structured, never throws.
    Evidence: handoff.ts validateHandoff — missing/invalid fields reject
    by name (receives_from, produces, terminal_status, committed_sha,
    authorization_refs); authorization_refs are "references only:
    shape-checked, never adjudicated" (S1 correction).
    Inference: the V1.1 gate must copy this error discipline: structured
    refusal, no thrown TypeError on malformed input.

F8. Cross-package import convention is RELATIVE SOURCE IMPORTS.
    Evidence (git grep over src, this corpus):
      - packages/ledger/src/ledger.ts:39 imports
        '../../contracts/src/index.js'
      - packages/journal/src/decision-row.ts:22 imports
        '../../contracts/src/index.js'
      - packages/gateway-daemon/src/client.ts:29 imports
        '../../gateway-protocol/src/index.js'
      - packages/control-plane/src/gateway/routes.ts:17 imports
        '../../../gateway-protocol/src/index.js'
      - packages/control-plane/src/gateway/records.ts imports
        '../../../gateway-registry/src/index.js'
    '@build-room/*' specifiers appear ONLY in package.json dependencies
    blocks and in doc comments; ZERO src files import through them.
    Inference (LOAD-BEARING): a first control-plane consumer of
    seat-registry follows the same convention — a relative import of
    '../../seat-registry/src/index.js' from packages/control-plane/src/.
    No workspace registration is mechanically involved. See section 4.

F9. The build already compiles seat-registry transitively.
    Evidence: root tsconfig.json include lists ten package srcs plus test/
    and does NOT list packages/seat-registry/src; yet npm run build emits
    dist/packages/seat-registry/** (verified this session) because tsc
    follows the test files' imports of the package. The include list is
    non-exhaustive by behavior, and the V1 build report recorded the same
    arrangement (no root config changes were made in V1).
    Inference: a control-plane module importing seat-registry compiles
    with ZERO changes to root tsconfig.json, root package.json, or
    package-lock.json.

F10. The control plane has NO seat or role concept today.
    Evidence: git grep for 'seat' and 'role' over
    packages/control-plane/src returns only incidental prose in comments
    (server.ts:116, :340, :468 — error-message and calendar text);
    phase3-run.ts: zero hits.
    Inference: the V1.1 integration introduces the FIRST seat-aware
    module into the control plane; there is no existing dispatch path to
    rewire and no existing policy seam to conflict with.

F11. No governed dispatch path exists in the control plane.
    Evidence: packages/control-plane/src routes are gateway enrollment,
    heartbeats, staging, sweeps, and the Phase 3 counted-run harness
    (phase3-run.ts, phase3-run-routes.ts — counted-run surfaces are
    excluded from V1.1 by r7 §10.1 and the Founder's §5 exclusions).
    The governed Phase 4 dispatch path is planned but not built.
    Inference: V1.1 makes the registry "technically consumable" by
    exporting a policy gate the future dispatch path will call; V1.1 does
    not and cannot wire it into a live dispatch route. The gate is
    consumable-but-unwired by design.

F12. Static purity-scan convention exists and is extensible.
    Evidence: test/purity.test.ts parses module specifiers out of
    packages/*/src and matches them against forbidden sets
    (FORBIDDEN_NODE_MODULES, FORBIDDEN_DB_MODULES), with an explicit
    PACKAGE_SOURCES allowlist.
    Inference: the V1.1 static test (no network, no env/credentials, no
    live adapter) reuses this proven pattern scoped to the integration
    surface. Note: node:fs must NOT be forbidden for seat-registry
    (resolve.ts legitimately reads contract and fixture files, all
    in-repo); the forbidden set for the integration surface is network,
    process-env, credential, and fs-WRITE surfaces (section 10).

F13. path-audit excludes docs/planning (Founder ruling 2026-09-01).
    Evidence: scripts/path-audit.sh header; the exclusion was ratified in
    PR #16 and is recorded in the script; in exchange a plan filed there
    must state which named paths do not exist at its base.
    Compliance: every path this plan names as NEW does not exist at the
    base 407f025c — packages/control-plane/src/seat-policy.ts,
    test/seat-registry-integration.test.ts,
    test/seat-registry-integration-static.test.ts, and (if filed) the
    plan's own docs/planning/ location. All existing referenced paths
    exist at the base.

F14. Suite baseline (AC16) measured, not asserted.
    Evidence: this session, Node v22.23.2, TMPDIR=/tmp/br npm test at the
    declared corpus tree: 706 tests / 243 suites / 706 pass / 0 fail /
    0 skipped, exit 0. Matches the merged Build Report (706/243/0 at the
    correction parent; the merge added no test changes).
    Inference: V1.1's AC is: existing suite remains green at 706/243 plus
    the new integration tests; three consecutive green runs; all four
    repository gates pass.

F15. Attribution convention for the implementation tranche.
    Evidence: AGENTS.md Attribution section; DEC-20260718-05 trailer shape
    (Role-Id / Actor-Id / Execution-Surface) used on PR #20's commits.
    Inference: the V1.1 implementation commit carries the trailers; the
    plan's build report records the executing identity.

F16. r7's V1.1 tag governs scope boundaries, and the Founder's V1.1
    disposition is narrower than r7's deferred gateway slice.
    Evidence: r7 §10.1 "(V1.1)" tag on policy-engine binding; r7 §10.2
    defers "Gateway-zone authority enforcement (V1.1)"; r7 §14 "Only the
    V1.1 gateway slice makes any boundary technical." The Founder's
    disposition scopes V1.1 to CONTROL-PLANE policy evaluation binding
    and names no gateway work.
    Inference (design constraint): this plan's V1.1 binds control-plane
    policy evaluation only. The gateway-zone technical boundary, the
    'enforcement: behavioral' label (schema.ts, 'V1 honest label; V1.1 =
    gateway-zone'), and any seat-contract byte change remain OUT OF SCOPE
    and deferred. The enforcement label is NOT changed by this tranche.

--------------------------------------------------------------------------
3. SCOPE — INTEGRATION vs ACTIVATION, GOALS AND NON-GOALS
--------------------------------------------------------------------------

3.1 Goals (the Founder's §3, each mapped forward)

  G1. Register packages/seat-registry consistently with repository
      conventions → section 4 (determination: no registration files; the
      consumer binds by relative import; the V1 arrangement already
      satisfies every convention).
  G2. Expose a stable internal package interface → section 5.2 (the
      stable surface is the existing src/index.ts; the control plane
      adds one narrow, pure gate module whose types are the contract for
      the future dispatch path).
  G3. Bind control-plane policy evaluation to resolveSeat → section 5.3.
  G4. Bind dispatch decisions to DispatchPolicyV1 → section 5.4.
  G5. Preserve lane_not_standing as the default result → sections 5.3,
      10 (T5).
  G6. Prevent refused, unresolved, and unknown_outcome states from
      dispatching → sections 5.3, 5.4, 10 (T6, T7).
  G7. Enforce retry ceilings without provider calls → sections 5.4, 10
      (T8).
  G8. Prove model-distinctness requirements without claiming an
      independent review occurred → sections 5.5, 10 (T10), 18.
  G9. Demonstrate no live lane becomes eligible merely because
      integration exists → sections 5.3, 10 (T5, T13), 18.

3.2 Non-goals (explicit, per the Founder's §5 and r7 §10.1)

  No live provider calls. No credentials or secret access. No provider or
  model eligibility changes. No standing routing authority. No deployment.
  No activation. No counted-run spend. No Room Runtime activation. No
  Phase 4 rebind. No PR 2b. No Lab work. No fifth seat. No execution slot
  becoming a seat. No FounderOS doctrine changes. ADDITIONALLY, from the
  controlling authority stack: no gateway-zone technical boundary work
  (r7 §10.2 stays deferred); no change to the 'enforcement: behavioral'
  label or any seat-contract byte (hash pins stay valid); no journal
  contract amendment and no seat_id journal element (r7 §5.2, §10.1); no
  migrations.ts, CLI, gateway-daemon, counted-run, or CI workflow change;
  no S3 registration files (section 4); no workspace/package registration;
  no attribution-trailer additions (r7 §10.1: no new trailer at all).

3.3 The integration/activation boundary, stated as a rule

  V1.1 may add code that EVALUATES policy and REFUSES. V1.1 may not add
  code that EXECUTES anything. The gate's only allowed positive decision
  is 'allowed' on a seat resolution of kind 'resolved' — which the real
  registry never returns in V1/V1.1 (F2). Every other input yields a
  structured refusal. There is no adapter, no transport, no provider
  client, and no id minting in this tranche. The future dispatch path —
  a separately authorized tranche — will consume the gate's decisions and
  own command_id minting under the journal contract.

--------------------------------------------------------------------------
4. S3 / PACKAGE-REGISTRATION DETERMINATION (FOUNDER §4)
--------------------------------------------------------------------------

Question: does the first authorized control-plane consumer require any of
  (a) packages/seat-registry/package.json
  (b) root package.json changes
  (c) root package-lock.json changes
  (d) root tsconfig.json changes
  (e) import-path changes to existing files
  (f) build or CI changes?

Determination: NO — none of the six is required. S3 remains deferred and
is EXCLUDED from this tranche. Evidence and reasoning:

  D1. The repository's actual convention for cross-package consumption is
      relative source import (F8: four cited production examples across
      ledger, journal, gateway-daemon, and control-plane itself). The
      '@build-room/*' workspace names are declarative metadata in
      package.json dependencies blocks; no src file imports through them.
      A first consumer of seat-registry writes
      "from '../../seat-registry/src/index.js'" in its own NEW module —
      that is the entire registration mechanic under this corpus's
      conventions.

  D2. The build already compiles packages/seat-registry transitively
      without any root config listing it (F9). Adding a consumer under the
      already-included packages/control-plane/src tree changes nothing
      about the build graph's root configuration.

  D3. npm install/ci is untouched: seat-registry has no package.json, no
      dependencies, and no install surface; the consumer adds no new
      dependency (it imports source within the workspace tree). CI's
      locked install, typecheck, test, path-audit, attribution-selftest,
      and verify-check steps run unchanged.

  D4. Adding packages/seat-registry/package.json (the S3 files) would
      have a negative risk profile with zero mechanical benefit in this
      tranche: it would force a package-lock.json regeneration (CI's
      npm ci fails when package.json and lockfile disagree — the
      railway.toml comment records why lockfile drift is load-bearing),
      widening the changed-path surface into root configuration files
      that the PR #20 authorization explicitly reserved ("does not
      authorize: workspace or package registration"), for a specifier
      form no existing package uses.

  D5. What would REQUIRE S3 later: a consumer that must import via an
      '@build-room/seat-registry' specifier (e.g., code outside the
      workspace tree, or tooling that resolves workspace names), or a
      packaging/deployment need to list the package. Neither exists in
      this tranche. The determination is recorded so the first tranche
      that needs it can cite this analysis.

Founder decision required (section 16, FD-1): accept this exclusion, or
name S3 into the tranche (which would add the five files the S3 DEFER
ruling lists and reopen root-config review).

--------------------------------------------------------------------------
5. ARCHITECTURE — THE SEAT POLICY GATE (CONTROL-PLANE INTEGRATION BOUNDARY)
--------------------------------------------------------------------------

5.1 Component and boundary map

  NEW COMPONENT (the only production code in this tranche):

    packages/control-plane/src/seat-policy.ts
    — "the seat policy gate". A PURE module. It:
      * imports ONLY from '../../seat-registry/src/index.js' (the stable
        public entry, F1) and node:* builtin type utilities;
      * evaluates seat policy for a proposed dispatch by calling a bound
        resolver (default: the real resolveSeat);
      * exposes retry/failover decisions by delegating to
        retryBudgetTransition (DispatchPolicyV1 binding);
      * exposes the distinctness predicate by delegating to
        isDistinctReviewLane;
      * mints NO command_id (the future dispatch path owns minting under
        the journal contract; the gate only states the requirement);
      * performs NO I/O beyond what resolveSeat itself performs (contract
        and fixture reads inside the seat-registry package);
      * writes NOTHING, reads NO environment, opens NO socket.

  EXISTING COMPONENTS (unchanged): every file of packages/seat-registry
  (frozen by its own fixture and contract hash tests), the journal
  contract, migrations, routes, phase3 surfaces, CLI, gateway-daemon.

  INTERFACE BOUNDARY (the contract for the future Phase 4 dispatch path):

    createSeatPolicyGate(options?)
      options.resolve? — injectable resolver, DEFAULT resolveSeat.
        Production wiring constructs the gate with NO options. The seam
        exists for the positive-control test only (10, T-negative).
      options.policy?  — injectable policy data, DEFAULT DISPATCH_POLICY.
    Returns a SeatPolicyGate:
      evaluateDispatch(request: DispatchRequest): SeatPolicyDecision
      decideRetry(state: RetryBudgetState, event: RetryBudgetEvent):
          RetryDecision
      decideFailover(state, event): FailoverDecision
      policy(): DispatchPolicyV1
      assertReviewDistinctness(implementationModelId: string,
          reviewLane: SeatRoutingLane): boolean

    DispatchRequest = {
      seat_id: string;                       // any string; validated
      lane_label?: string;                   // optional claim; never trusted
      authorization_ref?: string;           // reference only, never
    }                                       // adjudicated (handoff.ts rule)

    SeatPolicyDecision =
      | { kind: 'refused'; allowed: false; seat_id: string;
          refusal: string;   // the RefusalClass or 'malformed_request'
          reason: string;     // the resolver's named reason, verbatim
          requirement: string | null }   // the Founder act a lane needs
      | { kind: 'allowed'; allowed: true; registration; readiness;
          note: string }   // reachable ONLY via a resolver that returns
                          // 'resolved' — the real one never does (F2)

    RetryDecision / FailoverDecision = the retryBudgetTransition decision
      plus requires_new_command_id: boolean — true for retry and failover
      (each is a distinct governed command record), false for
      lost_response_replay (same logical command, consumes nothing).

  DATA FLOW (one direction, no cycles):

    proposed dispatch (seat_id) →
      gate.evaluateDispatch →
        bound resolveSeat(seat_id) → SeatResolution (refused in V1) →
      gate maps resolution to SeatPolicyDecision (refused, reason named) →
    caller (future dispatch path) receives a structured refusal and may
    not proceed. Retry/failover questions flow through
    retryBudgetTransition identically. No state is stored by the gate; it
    is a pure function over its inputs.

5.2 Stable interface rule (G2)

  The stable internal package interface is, and remains,
  packages/seat-registry/src/index.ts. The control plane's added surface is
  the gate module itself, exported through
  packages/control-plane/src/index.ts so the future dispatch path and the
  tests consume the package the way every consumer in this corpus does.
  The gate re-exports seat-registry TYPES (SeatRoutingLane,
  RetryBudgetState, RetryBudgetEvent, DispatchPolicyV1) so downstream
  consumers never deep-import seat-registry modules — the single-entry
  rule is enforced by a static test (10, T11).

5.3 Policy-evaluation binding (G3, G5, G6, G9)

  evaluateDispatch:
    1. Rejects malformed input STRUCTURED (never throws): a non-string
       seat_id or a request missing seat_id returns refusal
       'malformed_request' naming the field — the validateHandoff S1
       discipline (F7).
    2. Calls the bound resolver. The caller's claims (lane_label,
       authorization_ref) are NEVER trusted as authority; they are
       reference material only. This is the anti-bypass property: there is
       NO API surface by which a caller presents a resolution — the gate
       re-derives it from the bound resolver every time (10, T12).
    3. Maps kind 'refused' to a refused decision carrying the refusal
       class, the resolver's verbatim reason, and the named requirement.
       For all four seats in V1 this is lane_not_standing (or the seat's
       specific class) — the default is preserved because the gate can
       only echo the resolver.
    4. Maps kind 'resolved' to allowed. With the production binding this
       branch is unreachable (F2); its existence is what makes the gate a
       faithful binding rather than a hardcoded refusal, and it is
       reachable only through the test seam.

5.4 Dispatch-decision binding (G4, G6, G7)

  decideRetry / decideFailover delegate to retryBudgetTransition and add
  the command_id discipline:
    - a retry is a NEW command_id (journal contract §1: command_id is the
      end-to-end idempotency key; a retry is safe only because each
      attempt is its own command record);
    - a failover is a NEW command_id and must change surface_id or
      model_id (DISPATCH_POLICY);
    - a lost_response_replay is the SAME logical command — no new
      command_id, no consumption;
    - while pending_unknown_outcome is set, retry and failover are both
      refused, including requests carrying a new command_id — the
      unknown-outcome state cannot dispatch (Founder §7 item 7);
    - ceilings: two retries per deployment within one execution, no
      reset; at most one lawful failover; INELIGIBLE triggers refuse;
    - seat_unresolved (classifyTransportFailure without affirmative
      no-effect evidence) maps to a refusal to dispatch — an unresolved
      command may not be re-dispatched until reconciled (Founder §7
      item 6);
    - the decisions carry the §4.3 obligations and MP1_STATEMENT as data
      (re-exported), so a caller can surface them without re-importing
      the package.
  NO provider call exists anywhere in this chain — the state machine is
  exercised by tests with hand-built fixtures only (Founder §5).

5.5 Distinctness binding (G8)

  assertReviewDistinctness delegates to isDistinctReviewLane over the
  registry's own review lanes: for every (builder implementation lane,
  independent-reviewer review lane) pairing the predicate must hold
  (model differs; attestation id on the Tier-2 roster). The gate asserts
  the PREDICATE at assignment; it records nothing about any actual review.
  The test (10, T10) proves the predicate over package data and asserts
  the decision text does NOT claim a review occurred — the wording is
  "distinctness requirement satisfied for the pairing," never "reviewed."

5.6 Trust and security boundaries

  - Trust boundary 1 (caller → gate): the caller is untrusted for
    authority. Every authority fact is re-derived from the bound
    resolver; request fields are references, never adjudicated evidence
    (the handoff.ts rule, applied to dispatch).
  - Trust boundary 2 (gate → seat-registry): the gate trusts the package
    exactly as its own tests do — fixture-pinned data, live-recomputed
    contract hashes, doctrine pin. The package is the sole authority
    source; the gate adds none of its own.
  - Trust boundary 3 (gate → future dispatch path): the gate's decision
    is advisory-mandatory: it returns structured refusals the dispatch
    path must honor. V1.1 cannot enforce consumption (there is no dispatch
    path yet, F11); the plan records this as an honest limit (section 18)
    and the future tranche's plan must wire the gate as the only seam.
  - Credential boundary: nothing in this tranche reads env, keychains,
    token stores, or credential files; proven by the static test (10,
    T13, T14). The .env/.env.* gitignore rules and the repository
    credential prohibitions are untouched.
  - Network boundary: no network module is imported anywhere on the
    integration surface; proven statically (10, T13, T15) and by the fact
    that seat-registry declares no dependencies at all (no package.json,
    F-D1).

5.7 Error and failure behavior

  - Malformed requests: structured refusal naming the field; no throws
    (F7 discipline).
  - Unknown seat/role: structured refusal (unknown_seat /
    seat_outside_registry), never a fallback to a default seat.
  - Resolver contract-hash mismatch: passed through as
    contract_hash_mismatch naming both hashes (fail-closed on tamper).
  - retryBudgetTransition's exhaustive-switch default throws only on an
    unmapped event kind — a type-level impossibility today; documented,
    and the gate does not wrap or downgrade it (a silent catch would
    break fail-closed).
  - The gate holds no state, so it has no failure-recovery surface;
    determinism is by construction (pure functions over pinned data).

5.8 Observability

  V1.1 adds no telemetry, no logs, no metrics — there is no deployment
  (Founder §5). The observability of this tranche is: (a) the structured
  decision objects themselves (every refusal names its class, reason, and
  requirement); (b) the test transcripts; (c) the build report's recorded
  commands and outputs. The future dispatch path's journaling of gate
  decisions is that tranche's scope (and must not add journal vocabulary —
  the contract's §5 set is closed).

--------------------------------------------------------------------------
6. EXPECTED CHANGED PATHS (THE COMPLETE MANIFEST)
--------------------------------------------------------------------------

  NEW (3):
    1. packages/control-plane/src/seat-policy.ts
    2. test/seat-registry-integration.test.ts
    3. test/seat-registry-integration-static.test.ts

  MODIFIED (1):
    4. packages/control-plane/src/index.ts — exactly one added export
       line: the gate's types and factory.

  DELETED: none.

  TOTAL: 4 tracked paths, one of them a one-line additive edit. No root
  package.json, no package-lock.json, no tsconfig.json, no CI workflow,
  no journal file, no migrations.ts, no CLI, no gateway-daemon, no
  seat-registry file, no contracts/seats file, no FounderOS file.

  OPTIONAL (Founder decision, section 16 FD-4): filing THIS plan as a
  DRAFT into docs/planning/seat-registry-v1.1/ at implementation time,
  following the r7 filing pattern (path-audit-excluded surface, F13). If
  filed: +1 doc path, no code impact.

  Estimated test volume: ~35-50 new tests across 2 new suites (estimate,
  not a contract); expected suite total ~741-756 tests / ~245 suites,
  with the existing 706/243 remaining green (F14).

--------------------------------------------------------------------------
7. IMPLEMENTATION SEQUENCE (FOR THE AUTHORIZED TRANCHE, NOT THIS DRAFT)
--------------------------------------------------------------------------

  Preconditions (the Founder's acts, in order — section 13):
    P1. Founder approval of this plan (or its corrected revision).
    P2. Founder implementation authorization naming the THEN-CURRENT
        main SHA (per section 13; NOT necessarily 407f025c — re-verify at
        authorization; stop-condition S1 if main has moved without
        re-naming) and an isolated branch from that SHA.

  Steps:
    1. Confirm live repository state at start: main SHA matches the
       authorization; PR 2b not open; PR #21 state recorded; working tree
       clean. Stop on drift (section 17).
    2. Branch builder/seat-registry-v1.1-integration from the authorized
       base.
    3. Write the failing tests first (test files 2 and 3 of section 6),
       covering the T1-T18 matrix (section 10) — RED.
    4. Implement packages/control-plane/src/seat-policy.ts — GREEN.
    5. Add the single export line to packages/control-plane/src/index.ts.
    6. Mutation evidence: prove each new guard RED by targeted mutation
       (the V1 Build Report's table is the template; guards: the
       resolver-binding guard, the unknown-outcome dispatch guard, the
       retry ceiling, the failover identity rule, the replay no-new-id
       rule, the distinctness guard, the static-surface guards).
    7. Full suite three consecutive times green under Node 22,
       TMPDIR=/tmp/br (record verbatim output).
    8. All four repository gates: gate:path-audit,
       gate:attribution-selftest, gate:verify-check, and (if PR #21 has
       merged) its lint/secret-scan gates.
    9. Build report at docs/planning/seat-registry-v1.1/ recording
       identities, changed paths, commands, outputs, mutation table.
   10. Attribution trailers on the commit (F15).
   11. STOP for the review chain (section 14): advisory reviewers →
       independent Tier-2 review on the exact candidate head → SHA-named
       Founder merge authorization. The builder executes the merge only
       on that authorization (DEC-20260721-01 ruling item 3).

  There is no CLI step, no journal step, no deployment step, no provider
  step. Every attempt to add one is plan drift (section 17).

--------------------------------------------------------------------------
8. ROLLBACK AND REMOVABILITY (FOUNDER §7 ITEM 18)
--------------------------------------------------------------------------

  - The tranche is additive-only: reverting the single implementation
    commit (or deleting the 3 new files and the 1 export line) restores
    the exact pre-tranche tree; the suite returns to the 706/243
    baseline; no migration, no persisted state, no schema, no ledger
    row, no journal element is touched by this tranche.
  - The gate holds no durable state (5.7) — proven by the static test's
    forbidden-write scan (10, T18b).
  - Rollback procedure (for the authorized tranche): git revert of the
    merge/implementation commit, re-run TMPDIR=/tmp/br npm test expecting
    706/243/0, re-run gates. No data repair is required because no data
    was written.
  - Disable-without-remove: not applicable and intentionally not offered
    — a runtime "off switch" for a policy gate would itself be a bypass
    surface. The removability unit is the file set, not a flag.

--------------------------------------------------------------------------
9. TEST STRATEGY — DESIGN (THE MATRIX IS SECTION 10)
--------------------------------------------------------------------------

  9.1 Conventions: node:test + node:assert/strict; flat test/ files;
      imports only from the public entry points
      ('../packages/seat-registry/src/index.js' and
      '../packages/control-plane/src/index.js' for the gate); no
      production logic in test/; hand-built fixtures; the mutation-evidence
      rule applies to every new guard.

  9.2 Case groups (the skill's static matrix):
      - Happy path: none in production binding (the honest happy path of
        V1.1 is a REFUSAL — every seat refuses with lane_not_standing and
        the named requirement). The positive control (gate honors a
        'resolved' resolution) runs ONLY through the injected test seam.
      - Missing/malformed-field cases: non-string seat_id; missing
        seat_id; non-object request; each must reject structured, naming
        the field, without throwing.
      - Alternate-route cases: strategist (seat_outside_registry), the
        four canonical seats (each lane_not_standing with its own named
        requirement), temporary-task-assignment presentation
        (temporary_task_assignment_not_lane_authority).
      - Negative controls (removing the guard makes the test fail):
        mutate the gate to trust caller claims → anti-bypass test fails;
        mutate to allow third retry → ceiling test fails; mutate to
        allow failover on INELIGIBLE trigger → trigger test fails; mutate
        replay to mint a new command_id → replay test fails; mutate to
        dispatch on pending_unknown_outcome → unknown-outcome test fails;
        inject a permissive resolver into the PRODUCTION binding
        construction → the default-binding test fails.
      - Static controls: the pure-import scan (no network, no env, no
        credential, no fs-write on the integration surface; single-entry
        import rule; no deep imports of seat-registry modules; no
        '@build-room/seat-registry' specifier — the convention is
        relative source import, F8).

  9.3 No test in this tranche makes a live provider call, dispatches a
      command, reads another repository at run time, or reads any
      credential. The suite remains credential-free (CI runs it with no
      secrets — the existing ci.yml contract).

  9.4 Determinism: the gate scenario matrix runs twice per test run and
      deep-strict-equals both passes; the suite itself runs three
      consecutive times (7.7). resolveSeat's outputs are pure functions
      of pinned, hash-verified fixture bytes.

  9.5 Storage suite: unaffected; no new storage surface. If
      TEST_DATABASE_URL is available locally the storage suite may be run
      for completeness; it is not an acceptance requirement of this
      tranche (the gate touches no store).

--------------------------------------------------------------------------
10. ACCEPTANCE-TEST MATRIX (FOUNDER §7 — EVERY ITEM, EXECUTABLE)
--------------------------------------------------------------------------

  Test IDs T1-T18. "Gate" = the seat policy gate (5.1); "entry" =
  packages/seat-registry/src/index.js. Existing suite = the 47 V1 tests
  remain and are added to, not replaced.

  T1  Unknown roles fail closed.
       Gate: evaluateDispatch('nonexistent-role' | '' | 'operator' |
       'founder' | 'Hephaestus') → refused, refusal unknown_seat (or
       malformed_request for non-strings), reason names the id.
       Negative control: mutate isSeatId to admit the id → test fails.

  T2  strategist remains seat_outside_registry.
       Gate: evaluateDispatch('strategist') → refused,
       refusal seat_outside_registry, reason names the 30-role registrar.
       (S2 regression, re-asserted through the gate.)

  T3  All four canonical seats remain present.
       Entry: RATIFIED_SEATS set-equality on seat_ids; gate:
       evaluateDispatch for each of the four returns the seat's own
       registration in the refusal payload (registration populated for
       known seats — the resolve.ts contract).

  T4  No fifth seat exists.
       Entry: SEAT_IDS.length === 4; isSeatId rejects every non-member
       (probe list incl. 'operator', 'planner', 'researcher-2'); gate:
       no request returns allowed for any id (see T5).

  T5  No lane is standing by default (G9 core).
       Gate: evaluateDispatch over ALL FOUR seats → every result is
       refused with lane_not_standing (or the seat's specific refusal
       class) and requirement named per lane. THE DEFAULT IS PRESERVED
       BY CONSTRUCTION: with the production binding, allowed is
       unreachable — and the negative control proves it is the REGISTRY
       that keeps it closed: inject a resolver returning 'resolved' →
       the gate returns allowed (the test detects an open gate; the real
       registry does not open one). No lane becomes eligible because the
       integration exists — the integration only reads the registry.

  T6  Refused and unresolved outcomes cannot dispatch.
       (a) Every SeatPolicyDecision of kind 'refused' carries
           allowed:false and the gate offers NO dispatch operation for a
           refused seat (there is no API to dispatch; asserted by type
           and by attempting the retry path, which also refuses).
       (b) classifyTransportFailure(false) → seat_unresolved; the gate
           refuses retry/failover for an unresolved command until
           'reconciled'; contractEventForOutcome(seat_unresolved) maps to
           the §5 'unresolved' event (data only; no journal write).

  T7  unknown_outcome cannot dispatch.
       retryBudgetTransition with pending_unknown_outcome: retry_request
       AND failover_request both refused; a request carrying a new
       command_id is still refused (r7 test 12 items 10-12); state
       unchanged until 'reconciled'; then, and only then, budget rules
       resume.

  T8  Retry ceilings are enforced.
       Two retries per deployment bucket allowed, third refused,
       exhausted bucket never resets within the execution (incl. after
       returning to an exhausted bucket and after 'completed' closes);
       relabeled execution does not evade; failover max one; INELIGIBLE
       triggers refuse; failover must change surface_id or model_id;
       new bucket starts at zero consumed. All exercised as a pure state
       machine — zero provider calls (assert: the test imports no
       adapter; static scan proves none exists to import).

  T9  Failover increments/rebinds command_id exactly as controlling
      authority requires.
       Journal contract §1 + dispatch-policy header: retry and failover
       each require a NEW command_id (requires_new_command_id: true);
       lost_response_replay requires NONE (false), consumes nothing,
       opens no bucket, resolves to the same logical command;
       DISPATCH_AT_MOST_ONCE ('dispatched at most once, only after
       journaled') is carried on the decisions. The gate itself mints no
       id — asserted: no id generator exists on the integration surface
       (static scan for the cmd_ namespace / uuid / crypto.randomUUID on
       the gate surface).

  T10 Builder and independent-review models must remain distinct —
       predicate proven, review NOT claimed.
       For every registry pairing of a builder implementation lane with
       an independent-reviewer review lane: isDistinctReviewLane is true
       (model_id differs; attestation id on the Tier-2 roster). The
       same-model case rejects; off-roster attestation rejects. The
       decision text and test names assert the PREDICATE only — a
       textual assertion (regex) that no output string contains
       'reviewed', 'verified', or 'independent review occurred'.
       What this does NOT prove (recorded in the test's own comment and
       section 18): that any review ever ran, or that distinctness was
       re-asserted at a live review-open (that is per-run, activation-
       tranche territory).

  T11 Package consumers use the stable public entry point.
       Static: every import of seat-registry in
       packages/control-plane/src and test/ resolves to
       '*/seat-registry/src/index.js' — no deep module imports
       ('*/resolve.js', '*/dispatch-policy.js', etc.); the gate module
       itself imports only the entry.

  T12 Direct bypass of Seat Registry policy is rejected.
       (a) The gate exposes no API accepting a resolution or an
           authority claim: evaluateDispatch takes only seat_id +
           reference fields; a caller cannot present 'resolved'.
       (b) The production gate constructs with the DEFAULT resolver —
           asserted by calling evaluateDispatch for all four seats and
           unknown ids and observing refusals (a permissively-injected
           resolver would return allowed somewhere).
       (c) Negative control: constructing the gate with an injected
           'resolved' resolver DOES return allowed — proving (b)'s test
           can detect an open gate and that only the binding keeps it
           closed.
       (d) presented_authority (temporary task assignment) offered via
           request field → temporary_task_assignment_not_lane_authority
           (never honored as lane authority).

  T13 No live provider adapter is reachable.
       Static over the whole integration surface
       (packages/seat-registry/src, packages/control-plane/src/
       seat-policy.ts, the two new test files): no import of net, tls,
       http, https, http2, dns, dgram, child_process, worker_threads,
       undici, node-fetch; no 'fetch(' or 'WebSocket' call sites; no
       adapter module exists anywhere under the changed paths (file-set
       assertion). seat-registry declares no dependencies (no
       package.json) and the gate adds none.

  T14 No credentials are loaded.
       Static: no 'process.env' read on the integration surface; no
       import of keychain/credential/token modules; no read of .env or
       credential file patterns. Runtime: the gate's decisions and the
       test fixtures contain no credential-shaped material (regex over
       serialized decisions for token/key/secret shapes — expected: zero
       hits).

  T15 No network call occurs.
       Covered by T13's static import scan plus: the suite runs
       credential-free and offline (existing CI contract — the acceptance
       run is the evidence; no test opens a socket, and the static scan
       proves no socket API is even imported on the surface).

  T16 Existing repository tests remain green.
       The full suite (existing 706 + new) passes three consecutive
       times, Node 22, TMPDIR=/tmp/br, exit 0; the four repository gates
       pass (plus PR #21's gates if merged first). Baseline 706/243/0 is
       the pre-tranche reference (F14).

  T17 Repeated execution is deterministic.
       The full gate scenario matrix (T1-T10, T12) executes twice in the
       same run; deepStrictEqual on decisions; a second full-suite run
       (already required, T16's three runs) confirms suite-level
       determinism; resolveSeat re-reads the same hash-pinned fixture
       bytes (test 14's integrity guarantee feeds this).

  T18 Integration can be removed or disabled without corrupting existing
      state.
       (a) Changed-path manifest is exactly the 4 paths of section 6 —
           asserted in the build report by git diff --name-only against
           the authorized base (the PR #20 post-merge verification
           pattern).
       (b) Static: no fs-write API (writeFileSync, appendFile,
           createWriteStream, open with write flags, mkdir, rm) on the
           gate surface — the gate cannot corrupt state because it
           cannot write any.
       (c) The rollback drill: on a scratch branch, revert the tranche,
           re-run the suite, observe 706/243/0 — recorded in the build
           report as executed evidence (not merely asserted).

  Claims that CANNOT be proven in V1.1 (each also listed in section 18):
       - that a standing lane would dispatch end-to-end (no dispatch
         path exists; positive control is seam-injected only);
       - credential-based readiness (readiness proves registration, F3);
       - per-run distinctness re-assertion at a live review-open;
       - provider behavior under any trigger (no provider calls);
       - spend gating under DEC-20260815-16/09 ceilings (no spend path —
         the obligations are carried as data only);
       - that the future Phase 4 dispatch path will actually consult the
         gate (that wiring is a later, separately authorized tranche).

--------------------------------------------------------------------------
11. GOVERNANCE DETERMINATION (FOUNDER §6)
--------------------------------------------------------------------------

  Question: does V1.1 require (a) a new DEC, (b) an exact-SHA Founder
  implementation authorization, (c) both, or (d) another mechanism?

  DETERMINATION: (b) is REQUIRED. (a) is NOT required by any controlling
  clause for the tranche as scoped by the Founder's disposition — with
  named conditions that would flip it to (c). The full citations follow;
  the companion artifact (seat-registry-v1.1-authority-and-closure-
  matrix.md) carries the row-by-row authority matrix.

  11.1 The exact-SHA Founder implementation authorization — REQUIRED.

       Citations:
         - PR #20 Founder merge authorization: "S3 remains deferred to the
           first separately authorized integration-consumer tranche" —
           this tranche exists only by a separate Founder authorization.
         - Its authority boundary: the merge authorization "does not
           authorize ... integration with Room Runtime or the Lab ...
           workspace or package registration" — the V1.1 tranche's acts
           are precisely the ones reserved to a later authorization.
         - DEC-20260902-02, Authority not granted: "Any implementation
           tranche requires a separate, exact Founder authorization."
         - DEC-20260902-02, Next action: "Separate Founder authorization
           for any implementation tranche (r7 §11 items 3–5), naming the
           then-current Build Room main SHA and an isolated branch from
           that SHA. No implementation proceeds on this ratification
           alone."
         - r7 §11 item 3 (the tranche pattern): authorization naming the
           exact then-current main SHA as implementation base, isolated
           branch from that SHA.
       Content the authorization must name (checklist for the Founder):
         the then-current main SHA (re-verified at authorization —
         today 407f025c, with PR #21 open, section 1.2); the isolated
         branch; this plan's exact path and SHA-256 (or its corrected
         revision's); the 4-path changed-path ceiling of section 6; the
         exclusion list of section 3.2; and the stop conditions of
         section 17.

  11.2 A new DEC — NOT REQUIRED for this scope. Citations and reasoning:

         - Decision Rules §1: a decision should be logged when it affects
           product direction, architecture, source-of-truth structure,
           agent roles, risk posture, or any hard-to-reverse choice; small
           edits and low-risk task execution do not need an entry. V1.1
           as scoped creates no new rule, role, seat, authority, identity,
           binding, provider, or vocabulary: it binds the control plane
           to the ALREADY-ratified fail-closed refusals of the V1
           registry. It is reversible by construction (section 8) — the
           opposite of a hard-to-reverse choice.
         - DEC-20260902-02 freeze posture (the controlling precedent for
           Seat Registry work): "Seat Registry V1, as planned in r7,
           mechanizes existing identity, binding, refusal, and
           accountability rules; it creates no new role, seat, model
           authority, merge authority, deployment authority, or decision
           rule. Plan ratification is record-keeping for the
           already-authorized Build Room shipping lane." The same
           characterization holds for V1.1's control-plane binding: it
           mechanizes the existing refusals; the shipping lane is
           DEC-20260814-03 clause 3 ("venture and build work itself"); no
           clause-4 exception is claimed or needed.
         - The V1 DEC (DEC-20260902-02) existed because r7 §11 item 2
           REQUIRED one as that plan's own entry gate. No controlling
           clause extends that entry gate to a V1.1 tranche; r7 §10.1's
           "(V1.1)" tag defers the binding; it does not condition it on
           a DEC.
         - The readiness-report suggestion of a DEC (Founder §6: "Do not
           assume that a new DEC is required merely because the
           readiness report suggested one") is therefore not followed
           mechanically: the determination above is made from the
           controlling clauses, not from the report's suggestion.

       CONDITIONS THAT WOULD FLIP THIS TO "BOTH" (a new DEC becomes
       REQUIRED the moment any of these enters scope — all are excluded
       by the Founder's §5 and section 3.2, and listed here so the
       boundary is explicit):
         - any change to the 'enforcement: behavioral' label in the
           registry schema (the V1.1-gateway-zone act r7 §14 names);
         - any seat-contract byte change (hash re-pin) or fixture re-pin
           (doctrine rebind);
         - dispositioning r7 §14's deferred compiler observations
           (DEC-20260902-02 explicitly left them open "for the Seat
           Registry DEC" — closing them is a DEC act, not a V1.1 act);
         - the gateway-zone technical boundary (r7 §10.2's deferred
           "Gateway-zone authority enforcement");
         - any FounderOS doctrine edit, journal-contract amendment, or
           seat_id journal element.
       A DEC also REMAINS AVAILABLE to the Founder as a record-keeping
       act if he prefers that posture for the tranche notwithstanding the
       above — that is Founder judgment (section 16, FD-3), not a
       requirement of the controlling corpus.

  11.3 Other governed mechanisms in play (not substitutes for 11.1):

         - The optional decision-compiler advisory pass (DEC-20260718-03)
           over this plan BEFORE authorization: available, founder- or
           builder-invoked, advisory (its clause 6: the report is an input
           to founder judgment, not a gate). NOT required by any clause
           for this tranche. Offered as a Founder option (FD-5).
         - The review chain before merge is REQUIRED and unchanged
           (section 14): advisory reviewers per decision-log v4.51,
           independent Tier-2 review on the exact candidate head
           (DEC-20260815-05; marker per DEC-20260826-01 written with the
           attestation id), SHA-named Founder merge authorization
           (DEC-20260718-04), builder executes the merge only on that
           authorization (DEC-20260721-01 ruling item 3).
         - NO DEC IDENTIFIER IS ALLOCATED BY THIS DRAFT (Founder §8).
           None is proposed, reserved, or suggested by number.

--------------------------------------------------------------------------
12. RISKS (LIKELIHOOD / BLAST RADIUS)
--------------------------------------------------------------------------

  R1. Base drift before authorization (PR #21 or any merge moves main).
      Likelihood: medium-high (PR #21 is open now). Blast radius: the
      authorization names a stale SHA → the whole tranche's base is
      wrong. Control: authorization names the then-current SHA; stop
      condition S1; re-verify at branch creation (7.1).
  R2. Scope creep toward the gateway slice / enforcement-label change.
      Likelihood: low-medium (the (V1.1) tag invites conflation). Blast
      radius: doctrine-adjacent change requiring a DEC (11.2 flips),
      seat-contract re-pins, voided hash guarantees. Control: section
      3.2 non-goals; stop condition S4.
  R3. Anti-bypass seam misuse: the injectable resolver read as a
      production bypass. Likelihood: low (code-level act, not runtime
      input). Blast radius: a future dispatch path constructing a
      permissive gate. Control: T12(b)/(c) pin the default binding; the
      future dispatch-path tranche must construct with defaults and its
      own plan must assert it.
  R4. Determinism surprise from resolve.ts's file reads (contract paths
      resolved relative to import.meta.url). Likelihood: low (the V1
      suite already runs green from dist/). Blast radius: a moved
      contract file fails closed (contract_hash_mismatch) — the failure
      mode is safe, not unsafe. Control: T16 three green runs; the
      failure mode itself is fail-closed.
  R5. Reviewer confusion between "integration proven" and "activated".
      Likelihood: medium (same shape as DEC-20260902-02's stated risk).
      Blast radius: an activation claim without authorization. Control:
      MP1_STATEMENT carried on decisions; section 18; the required
      report line of section 15.
  R6. PR #21's new gates (lint/secret-scan) failing on the new files.
      Likelihood: low-medium if merged first. Blast radius: CI red on the
      V1.1 PR. Control: run the new gates locally if present at base;
      the plan's code is lint-clean by construction (strict TS, no any).

--------------------------------------------------------------------------
13. DEPENDENCY ORDERING AND GATES
--------------------------------------------------------------------------

  Founder plan approval → Founder exact-SHA implementation authorization
  → branch → tests RED → gate GREEN → mutation evidence → suite 3x →
  gates → build report → advisory review → Tier-2 exact-head review →
  SHA-named Founder merge authorization → builder merges → post-merge
  verification (the PR #20 pattern: merge SHA, parents, path set, recom-
  puted identities, suite + gates on the merged tree).

  No step in this tranche depends on: any provider, any credential, any
  deployment target, any external repository at run time, any Lab
  facility, PR 2b, or Room Runtime.

--------------------------------------------------------------------------
14. REVIEW CHAIN (UNCHANGED OBLIGATIONS, RESTATED)
--------------------------------------------------------------------------

  1. Advisory reviewers authorized by decision-log v4.51 (Greptile,
     Copilot, the Claude Code review workflow, Gemini Code Assist where
     installed) — bar-2 inputs per DEC-20260801-02; every finding
     dispositioned on the record; gating nothing.
  2. Independent Tier-2 review on the EXACT candidate head by a roster
     model distinct from the implementation model (DEC-20260815-05);
     three-line marker per DEC-20260826-01 written with the ATTESTATION
     id, never the model_id.
  3. SHA-named Founder merge authorization (DEC-20260718-04); builder
     executes the merge only after it (DEC-20260721-01 ruling item 3).
  No advisory reviewer substitutes for Tier-2; no review substitutes for
  the Founder's merge authorization. Required checks must be green
  before merge (AGENTS.md; DEC-20260815-18 conventions).

--------------------------------------------------------------------------
15. COMPLETION REPORT (FOR THE AUTHORIZED TRANCHE)
--------------------------------------------------------------------------

  The tranche's build report must contain: study/work ID; the exact
  authorized base and candidate head; this plan's path and SHA-256 (or
  its ratified revision's); the 4-path manifest verified by
  git diff --name-only; T1-T18 evidence mapped to every acceptance item
  (pass/fail per item); the mutation-evidence table; three verbatim
  suite runs; all gate outputs; the rollback drill result (T18c); the
  attribution trailers; the Tier-2 marker; and the required terminal
  line, which for this tranche is:

  SEAT-REGISTRY-V1.1-INTEGRATION-COMPLETE — ACTIVATION REMAINS
  SEPARATELY GATED

  (final wording at the Founder's authorization; the semantic content —
  integration complete, activation NOT granted — is fixed by this plan.)

--------------------------------------------------------------------------
16. UNRESOLVED FOUNDER DECISIONS (NONE DECIDED HERE)
--------------------------------------------------------------------------

  FD-1. S3 exclusion: accept section 4's determination (no registration
        files in this tranche), or name S3 into the tranche (adding the
        five files the S3 DEFER ruling lists and reopening root-config
        review).
  FD-2. The exact implementation base: the then-current main SHA at
        authorization time (today 407f025c; PR #21 open — section 1.2),
        the isolated branch name, and the executing builder assignment
        (seat/surface/model for the tranche) — all Founder acts.
  FD-3. DEC posture: accept 11.2 (no new DEC required for this scope),
        or direct a DEC as record-keeping. If a DEC is directed, its
        identifier is allocated by the Founder-side process (five-source
        search per decision-rules §13 / DEC-20260715-13); this draft
        allocates nothing.
  FD-4. Plan filing: whether this DRAFT is filed into the repository
        under docs/planning/seat-registry-v1.1/ before implementation
        (the r7 pattern; path-audit-excluded, F13), and if so at which
        revision.
  FD-5. Optional decision-compiler advisory pass over this plan before
        authorization (available under DEC-20260718-03, advisory only;
        not required).
  FD-6. Tier-2 reviewer model for the candidate head (must be a
        DEC-20260815-05 roster model distinct from the implementation
        model; named at review time per FD-2's assignment).
  FD-7. Whether the future dispatch-path tranche (the first CONSUMER of
        this gate) is scoped next or deferred — informational; nothing
        in this plan schedules it.

  Plan-drift stop conditions follow; any of them halts the tranche with
  FOUNDER_DECISION_REQUIRED (the Engineering-Lab vocabulary is not used
  here; this is Build Room governed work — the stop phrase is the
  disposition-level one below).

--------------------------------------------------------------------------
17. PLAN-DRIFT STOP CONDITIONS
--------------------------------------------------------------------------

  S1. The authorized base SHA does not match live main at branch time
      (or main moves mid-tranche before branch): STOP, report, re-authorization
      required.
  S2. Any named symbol of this plan (resolveSeat, RetryBudgetState,
      retryBudgetTransition, DISPATCH_POLICY, isDistinctReviewLane,
      validateHandoff, SEAT_IDS, RATIFIED_SEATS, ROLE_REGISTRAR,
      LANE_STANDING_REQUIREMENT, TIER2_ROSTER_ATTESTATION_IDS,
      MP1_STATEMENT, DISPATCH_AT_MOST_ONCE, classifyTransportFailure)
      has moved, changed signature, or disappeared at the base: STOP —
      the plan is stale against the corpus.
  S3. The suite baseline at the authorized base is not 706/243/0 (or the
      base's recorded baseline if PR #21 moved it): STOP, re-baseline,
      re-approve the delta.
  S4. Any requirement emerges to touch: a seat-registry source file, a
      contracts/seats file, a fixture, the journal contract, migrations.ts,
      a CLI file, a counted-run surface, a CI workflow, a root config
      file, or FounderOS: STOP — out of tranche scope (section 3.2/6);
      each is either prohibited (r7 §10.1) or a separate authorization.
  S5. PR 2b is open at implementation start: the r7 §8 migrations.ts
      condition activates — STOP if the work would collide, per r7 §8.
  S6. A test cannot be written without inventing behavior (e.g., the
      gate would need a semantics the corpus does not state): STOP —
      ambiguity is a blocker, not a design choice (FD list).
  S7. Any observed drift between the Founder disposition's assumptions
      and live state (e.g., a fifth seat appears; a lane becomes
      standing; MP-1 activates): STOP — the plan's premises are void.

--------------------------------------------------------------------------
18. CLAIMS EXPLICITLY NOT PROVEN IN V1.1 (ACTIVATION-TRANSCHE LIMITS)
--------------------------------------------------------------------------

  1. No end-to-end dispatch occurs or is proven possible on a standing
     lane: no dispatch path exists (F11); the positive control runs
     through the test seam only.
  2. Readiness remains registration-proof, not credential-proof (F3);
     credential readiness is activation-tranche territory.
  3. Model distinctness is proven as a predicate over registry data;
     per-run re-assertion at a live review-open is not performed and no
     review is claimed to have occurred.
  4. No provider behavior is exercised: triggers, ceilings, and failover
     are proven as a pure state machine only.
  5. Spend gating (DEC-20260815-16 clause 2, DEC-20260815-09 clause 2)
     is carried as data (DISPATCH_PATH_OBLIGATIONS) and NOT enforced —
     there is no spend path in this tranche.
  6. The future Phase 4 dispatch path's actual consultation of the gate
     is not enforceable in this tranche; V1.1 proves the gate exists,
     is correct, and is the only seat-authorivity seam on the control
     plane's surface — the wiring is the next tranche's obligation.
  7. MP-1 remains approved but inactive; nothing here moves it.

--------------------------------------------------------------------------
## What this does not prove

  - This draft does not prove the plan is approved. A finished plan is
    not an authorized plan; implementation requires the Founder acts of
    section 13.
  - No repository state was modified in producing this draft; the
    verification runs of section 1.1 wrote only gitignored build output
    and TMPDIR scratch (tracked tree verified unchanged before and
    after). Nothing was committed, pushed, branched, or PR'd; no DEC was
    allocated; no identifier was reserved.
  - The "readiness report" the Founder's §6 references was not located as
    a distinct artifact in the inspected corpus; the DEC suggestion
    attributable to it is dispositioned on the controlling clauses alone
    (11.2), which is the disposition the Founder directed. If a distinct
    report exists outside the inspected surfaces, its suggestion does
    not change the determination.
  - The detached working tree at 8c2e87c was treated as the declared
    corpus because the tree diff to main 407f025c is empty (1.1); no
    byte-level claim is made about refs beyond those verified.
  - PR #21's content (lint/secret-scan gates) was not executed against
    this plan's proposed files; its interaction is bounded to CI gating
    (R6), not design.
  - The estimated test volume (section 6) is an estimate, not a
    contract; the acceptance contract is the T1-T18 matrix.
  - Nothing in this draft proves, claims, or implies activation,
    provider eligibility, standing routing authority, or operational
    readiness of any kind. MP-1 remains approved but inactive.

— END OF PLAN DRAFT —
