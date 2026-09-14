# FOUNDER DECISION BRIEF — PR 2b Gate-III / Tranche B
## FD-B1 through FD-B6

| Field | Value |
|---|---|
| Work ID | `BR-PR2B-GATE3-FOUNDER-DECISION-BRIEF-R1` |
| Frozen subject | `DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-20260913.md` |
| **Frozen SHA-256** | `4fee6482420b95062e5133f0c575f8a377ff73ec951ba806194095bb6be2e4eb` (106,924 bytes / 1,722 lines) |
| Freeze verified | re-derived on disk. **The frozen draft is unrevised by this brief.** |
| Drafting seat | `br-architect` (Plan Authority; no approval, build, operate, merge, release, or risk-acceptance authority) |
| Status | **ADVISORY. No authority, signature, or approval is created by this brief.** |

**What this brief is.** For each open decision: the exact controlling clause, the
conflict or permission that needs your ruling, my recommended ruling written as
executable Founder wording, the scope and acceptance consequence, and the exact
sections of the frozen draft the ruling would touch.

**What this brief is not.** It creates no gate, issues no authorization, and
resolves nothing by itself. No revision of the frozen draft was performed while
producing it.

---

## 0. Classification — genuine requirement changes vs. ordinary implementation choices

Your instruction distinguishes these, and the distinction is real: three of the
six are controlling-requirement questions, one is a permission expansion, one is
a stop-condition lift, and **one is not a controlling-requirement question at
all**.

| Id | Class | Founder ruling required? |
|---|---|---|
| **FD-B1** | **Genuine controlling-requirement conflict.** Two clauses of the same controlling document (C-3 §9 table cell vs. C-3 §9.1 prose) state incompatible Gate-III preconditions | **YES** — gate sequencing is reserved to the Founder |
| **FD-B2** | **Genuine permission expansion.** Requires SQL classes that E-4, as ratified by E-5, expressly prohibits; the Tranche-A exception cannot be widened by inference | **YES** |
| **FD-B3** | **Genuine stop-condition lift.** r1 §15 stop condition 1 has fired and C-4 §6 forbids the Builder re-basing on its own initiative | **YES** |
| **FD-B4** | **Genuine tranche-boundary conflict.** r1 §6.1 and C-2 §13 step 2 place the same operation in different tranches; one placement is circular | **YES** |
| **FD-B5** | **ORDINARY IMPLEMENTATION CHOICE — already authorized.** The plan's PO-6 pattern delegates implementation shape to the Builder subject to review. The signature is unspecified, but the draft's stated consequence for it is **overstated** (see §5). Confirm the delegation; do not fix an argument list | **Confirmation only — NOT a requirement change** |
| **FD-B6** | **Administrative assignment within an already-authorized file map.** Confirming it creates no new path and changes no requirement | **Confirmation only — one line** |
| **FD-B7** | **Not a blocker.** Substantively resolved at draft §2.5 | **Optional record act only** |

---

## 1. FD-B1 — C-3 §9 table versus §9.1

**Exact controlling clauses.**

C-3 (`pr2b-implementation-plan-r1.md`, `08f3ea74…`) §9, Gate III row, verbatim:

> "| **III** | Tranche B database role/schema migration | the **migration authorized Git SHA** (40 hex); the tranche id | **Gate II merged; Gate IV complete (the plane must exist to execute through)** | rotation; runtime cutover; a second privileged credential (S1/S8) |"

C-3 §9.1, verbatim:

> "Gate III authorizes the migration, but the migration cannot **execute** until Gate IV's plane exists. The code of Tranche B can be authorized and merged before Gate IV; only its execution waits. Two SHAs are therefore in play at Gate III and must not be conflated: the SHA at which B's code merged, and the SHA the migration run asserts as `founder_authorized_sha`."

C-3 §3.1, tranche table, verbatim:

> "| **B** | Database migration package + admin runner | code change + later privileged execution | code fully; execution partially | Gate III |"

**The conflict.** The §9 cell lists *"Gate IV complete"* as a Gate-III precondition. §9.1 says in express terms that B's code may be authorized and merged before Gate IV and that only its execution waits. These are incompatible on their face: one makes Gate IV a precondition of *authorization*, the other of *execution*.

**My recommendation — the §9.1 reading controls, and §3.1 corroborates it.** §3.1's own row splits B into *"code change + later privileged execution"* with the reach field *"code fully; execution partially"*. Two independent clauses of the same document therefore describe exactly the split §9.1 states. The §9 cell is read as an execution precondition. **This is the reading the whole frozen draft is already written to; the ruling confirms it rather than changing it.**

**Recommended Founder wording.**

> I rule that C-3 §9's Gate III precondition "Gate IV complete (the plane must exist to execute through)" is a precondition on the **execution** of migration `0006`, and not on the authorization, review, or merge of Tranche B's code, tests, and bounded CI integration. Consistent with C-3 §9.1 and C-3 §3.1, I authorize Tranche B's code, tests, and CI integration to be authorized, independently reviewed, and merged before Gate IV, on the condition that **no execution of migration `0006` occurs** until Gate IV's protected administrative plane exists and a separate Founder act names the exact commit on `main` asserted as `founder_authorized_sha`. Gate III authorizes no protected-plane execution of any kind.

**Scope and acceptance consequence.** Gate III may be issued without Gate IV. Acceptance is unchanged and is met by code, tests, and CI only. Two SHAs are never conflated: the commit at which B's *code* merges (this gate) and the later `founder_authorized_sha` (Gate IV execution). Nothing in this ruling shortens the path to execution.

**Frozen draft sections affected.** §2.6 (the conflict as raised), §5.1 (the distinction preserved), §17.1 (FD-B1 row), §18 (disposition field).

---

## 2. FD-B2 — Disposable fixture operations and teardown authority

**Exact controlling clauses.**

E-4 (`AMENDMENT-pr2b-test-role-fixture-r2-20260910.md`, `c7098b3f…`) §3, amended r1 §4.1 text, verbatim:

> "This exception does not permit **LOGIN capability, passwords, connection credentials, membership grants or revokes, `ALTER ROLE`, privilege grants or revokes, attribute changes**, or any persistent/shared/governed/Neon/production effect. Teardown proof is required: before test completion, assert every fixture role is absent from `pg_roles` and report the assertion result; fixture setup or teardown failure fails the test. If A-R3 cannot be proved within those limits, stop with `SCOPE DECISION REQUIRED` and do not broaden the exception"

E-5 (`362c7b47…`), verbatim:

> "only the amendment's minimum ephemeral **NON-LOGIN** test-role fixtures for A-R3 inside a disposable local `TEST_DATABASE_URL` instance, using **`SET ROLE` from the existing test session**"

**The permission required.** Tranche B's PO-1 acceptance requires every denial and positive assertion to execute over a connection whose **`session_user` is `br_app_runtime`** (draft §8.3). That needs `CREATE ROLE … LOGIN` with a password, a second password-authenticated connection, and privilege grants and revokes — **four of the classes E-4 forbids by name.** The Tranche-A exception cannot be widened by inference: E-5 ratified a deliberately narrow set, and E-4's own `SCOPE DECISION REQUIRED` stop forbids broadening. This is a Founder act.

**Recommended Founder wording.**

> For Tranche B only, I grant the disposable-fixture authority enumerated at §7.3 of `DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-20260913.md` (SHA-256 `4fee6482420b95062e5133f0c575f8a377ff73ec951ba806194095bb6be2e4eb`), items 1 through 17, subject to every bounding condition stated there, of which the following are restated as binding: (a) **disposable instances only** — the CI `postgres:16` service container or a throwaway local container addressed by `TEST_DATABASE_URL`; never Neon, production, shared, staging, or governed infrastructure; the runner and the suites must refuse any DSN not proven disposable; (b) the fixture role names are the **real production role names and are cluster-wide**, so setup must be idempotent and the suite must refuse a non-disposable target; (c) the ephemeral password is generated **per run**, never logged, never written to evidence, never committed, and never placed in a repository secret, environment secret, environment, workflow file, or Railway variable; (d) **no membership grant to `br_app_runtime` in any form, ever**; (e) **no `ALTER ROLE`** on any role outside the three fixture roles, and no change to the CI `postgres` superuser; (f) teardown is mandatory and same-run, every fixture role must be asserted **absent from `pg_roles`** with the assertion result reported, and **fixture setup or teardown failure fails the test** — a skipped teardown is not a pass; (g) if any Tranche-B acceptance criterion cannot be proved within these limits, the executor returns `SCOPE DECISION REQUIRED` and **does not broaden this exception**. This grant is new and separate; it does **not** amend, widen, or reinterpret the Tranche-A exception, which continues to govern Tranche A on its own terms.

**Scope and acceptance consequence.** PO-1 becomes satisfiable and B-T1 can run under a genuine non-superuser login. Acceptance is **not** weakened: the `session_user = 'br_app_runtime'` requirement stands at full strength, and the draft's §8.5 disposition changes from *"FEASIBLE — NOT BLOCKED, conditional on FD-B2"* to unconditionally feasible. The container's superuser remains the **privileged disposable setup** identity only — never the identity under test.

**Frozen draft sections affected.** §7.3 (the enumerated set), §7.4 (the non-broadening statement), §8.4 (fixture permissions PO-1 needs), §8.5 (disposition), §17.1 (FD-B2 row), §18 (disposition field).

---

## 3. FD-B3 — Bounded newer-main allowance

**Exact controlling clauses.**

r1 §15 stop condition 1, verbatim:

> "The Builder halts and returns to the Founder — **without** repairing the architecture in place — on any of: 1. The selected implementation base moves before the Builder's first edit."

C-4 (`91c01334…`) §6, verbatim:

> "**r1 §15 stop condition 1 remains live and now has a concrete referent:** if `origin/main` advances past `6d6110d…` before the Builder's first edit, the Builder stops and returns rather than re-basing on its own initiative."

**Why your decision is required.** The stop has fired, and it fires twice over. `origin/main` has advanced past `6d6110d…` (FD-1's base), and — following draft §2.5's resolution that the operative base was rebound to `ef7a479…` by E-3/E-8 — it has advanced past that too. `origin/main` is now `f21693e0…`. C-4 §6 forbids the Builder re-basing on its own initiative, and only the Founder can lift a plan-drift stop. Without the allowance the draft is void on its own terms.

**Recommended Founder wording.**

> I lift r1 §15 stop condition 1 for Tranche B only, and authorize the executor to start Tranche B from an `origin/main` newer than this issuance's reference main, **and from no other base**, subject to completing every step of §4.3 and recording its results. Ancestry alone, and zero direct path overlap alone, are **not** sufficient grounds to proceed. If material drift is found in scope, contract, dependency, workflow, or acceptance assumptions, the executor returns verbatim `REVIEW TARGET DRIFT — FOUNDER DECISION REQUIRED` with the exact intervening commit and path set and the specific assumption disturbed, and does not redesign around it. Once the bound base is recorded and the first edit made, the executor **preserves** it: no silent rebase, no merge of later `main`, no cherry-pick. This allowance does not lift stop condition 1 for any other tranche.

**Scope and acceptance consequence.** Tranche B may begin from a current `main` with the drift assessed rather than assumed. The allowance is bounded to Tranche B, requires the §4.3 eight-step record, and preserves the §4.4 drift-return. Acceptance is unchanged: the §4.3 steps are executed and reported, and any change to the contract hash is still **S2**.

**Frozen draft sections affected.** §4.1 (why the allowance is required), §4.2 (the allowance text), §4.3 (mandatory executor steps), §4.4 (drift disposition), §4.5 (base immutability), §17.1 (FD-B3 row), §18 (disposition field).

---

## 4. FD-B4 — Migration `0006` steps 14–16

**Exact controlling clauses.**

r1 §6.1, ordered steps 14–16, verbatim:

> "| 14 | Grant enumerated non-journal operational privileges to `br_app_runtime`, explicitly, never blanket | Depends on §5.4's enumeration | abort; **never resolve by blanket `ALL`** |
> | 15 | `ALTER DEFAULT PRIVILEGES` review | Confirm no default privilege silently grants the runtime future journal objects | abort |
> | 16 | Assert zero `pg_auth_members` edges from `br_app_runtime`, recursively | The closing assertion | **abort and do not certify** |"

r1 §6.2, verbatim:

> "Steps 4–13 are the ownership-and-grant establishment and must be **one transaction**."

C-2 (`pr2b-storage-architecture-r6.md`, `658daa9c…`) §13, cutover step 2, verbatim:

> "| 2 | Grant `br_app_runtime` the enumerated non-journal operational privileges it needs; verify existing suites pass against it in a non-production branch | admin plane | full existing test suite green under the restricted identity | any required privilege missing, then enumerate, never blanket-grant |"

r1 §15 stop condition 4, verbatim:

> "A required privilege cannot be enumerated and the only path forward is a blanket `ALL` grant — violates r6 §3.3 and §13 step 2."

**The conflict.** r1 §6.1 places steps 14–16 inside `0006`'s ordered steps. But step 14 *"Depends on §5.4's enumeration"*, and PO-3 records that this enumeration *"cannot be produced without executing that run, which requires Tranche B"* — **circular**: the migration would need a result only the migration can produce. C-2 §13 step 2 independently places the identical grant at **cutover** (Tranche D), before journal objects exist. And r1 §15 stop condition 4 confirms §13 step 2 as the grant's home, in the same breath as forbidding blanket `ALL`.

Two textual signals show 14–16 are not the migration's transactional core: §6.2 scopes the single transaction to **steps 4–13**, and steps 15 and 16 are review and assertion operations that produce no DDL.

**Recommended Founder wording.**

> Migration `0006` comprises ordered steps **1 through 13** of C-3 §6.1, and only those. Steps 15 and 16 are **not** migration statements: they are discharged as the tests already assigned in the authorized file map — step 15's default-privilege review as **B-R11** and step 16's recursive `pg_auth_members` assertion as **B-R8** — and appear in `0006` as no SQL. Step 14's enumerated non-journal operational grants are **deferred to Tranche D**, where C-2 §13 step 2 places them and where PO-3 becomes producible; they are not authored, guessed, or stubbed in Tranche B, and `0006` must not grant `br_app_runtime` any privilege beyond the routine `EXECUTE` and the two-table `SELECT` already specified at §7.2. This ruling resolves a placement conflict between two controlling documents; it does not add, remove, or weaken any required grant. **No blanket `ALL` grant is authorized at any point** (r1 §15 stop condition 4, C-2 §3.3).

**Scope and acceptance consequence.** `0006`'s content is fixed and no longer circular. B-R11 and B-R8 carry step 15 and step 16 at full strength, so **no required check is dropped** — two are relocated to the tests that already own them. PO-3 remains open, correctly, and resolves at Tranche D. Acceptance unchanged for steps 1–13; the §6.2 single-transaction property is preserved intact.

**Frozen draft sections affected.** §6 (B-M1 row scope), §6.1 (discrepancy **D-7**), §7.2 (the exact grants, unchanged and now exhaustive), §17.1 (FD-B4 row), §18 (disposition field).

---

## 5. FD-B5 — Append signature and return type

**This is not a controlling-requirement question, and the draft overstated its consequence.** Stated plainly so you are not asked to decide something the plan already covers.

**Exact controlling clauses.**

C-3 PO-6, verbatim (the delegation the plan already makes):

> "Implementation shape (parameterize `migrate()` vs. wrap it) is the **Builder's choice, subject to review**"

C-3 §4.2 / §6.1 step 9–11, as written: every occurrence of the routine is the literal `public.command_journal_append(...)` with an ellipsis argument list. The signature is genuinely unspecified anywhere in C-1, C-2, C-3, or the r5 predecessors.

**Why the draft's stated consequence is overstated.** Draft §6.1 D-6 says the signature *"determines … the exact `REVOKE ALL ON FUNCTION …` and `GRANT EXECUTE ON FUNCTION …` targets and the test assertions."* The first half is true but harmless: within one migration the `CREATE`, `REVOKE`, and `GRANT` are authored together and necessarily use the same argument list. The second half is **not** supported by C-3 §5.2. Read its assertions as written — **B-R12** requires that *"`proacl` has no bare `=X/`"*, and **B-R7**/**B-R13** assert ownership and `must be owner of function …`. **None requires a hardcoded literal argument list**; each is a catalog-state assertion, correctly resolved from `pg_proc`/`pg_proc.proacl` by name. The signature therefore does not need to be Founder-fixed for the tests to be correct.

**Recommended Founder wording.**

> I confirm that the parameter list of `public.command_journal_append` is the **Builder's choice within Tranche B, subject to review**, on the C-3 PO-6 pattern, because the controlling stack fixes no signature and the plan's own §5.2 assertions are catalog-state assertions rather than literals. The resolved signature is binding once recorded. **I fix the following as binding non-negotiables, which are not Builder choices:** exactly one function exists at `public.command_journal_append`; it is declared `SECURITY DEFINER`; it is owned by `command_journal_writer` and **not** by the table owner; it pins `SET search_path = pg_catalog, pg_temp` with `public` **absent**; it uses the builtin `pg_catalog.sha256()` only, with no user-defined hash helper and no pgcrypto `digest()` substitution; it contains no dynamic SQL; every non-builtin reference is fully qualified. The migration's `REVOKE ALL ON FUNCTION` and `GRANT EXECUTE ON FUNCTION` statements must name the identical argument list used at creation, and the §6.3 assertions must resolve the routine from the catalog by name rather than hardcoding a literal argument list. The resolved signature **and return type** are recorded verbatim in the executor's return, item 7.

**On the return type specifically.** The plan fixes no return type. The one constraint that is contract-derived rather than stylistic: the append must make the assigned `seq` and the resulting chain hash available to the caller, because PC-8 requires that **the routine assigns `seq`** (*"No journal sequence exists"*, B-R15) and contract §4.1's append verifies the locked head against event rows before write. Any return shape exposing those two values satisfies it; the choice is the Builder's, recorded in item 7.

**Scope and acceptance consequence.** No requirement changes. Scope is bounded by the non-negotiables above, which are precisely the surfaces S6, B-H1, B-H2, B-R7, B-R12, and B-R13 already test. Acceptance unchanged. This removes a decision from your desk rather than moving one onto it.

**Frozen draft sections affected.** §6.1 (**D-6** — whose consequence statement should be corrected to the catalog-resolution form), §6.2, §7.2 (the REVOKE/GRANT targets), §9 (append requirements), §16 item 7 (return), §17.1 (FD-B5 row), §18 (disposition field).

---

## 6. FD-B6 — B-T1 file assignment

**Exact controlling clauses.**

C-3 §4.2, verbatim, the only two assignments it makes:

> "| B-T1 | NEW | `test/journal-authority.storage.test.ts` | The §5.2 negative/denial matrix (PC-5–PC-18) | r6 §14 Group B |
> | B-T2 | NEW | `test/journal-append-atomicity.storage.test.ts` | The §5.3 three-direction atomicity proofs | r6 §16.1, §16.2 |"

C-3 §5.2 contains three further tables — **positive path** (B-P1–B-P3), **atomicity** (B-A1–B-A5, assigned to B-T2), and **hash-binding security** (B-H1–B-H3) — and **§4.2 assigns the positive-path and hash-binding tables to no file.**

**The conflict or permission required.** No clause is contradicted; what is missing is an assignment. Since the draft holds that *"no path outside this table is authorized, by implication or otherwise"*, leaving six required assertions unassigned would force the Builder to invent a path. Confirming an existing authorized file resolves it without adding one.

**Recommended Founder wording.**

> I confirm that `test/journal-authority.storage.test.ts` (**B-T1**), as already authorized in the §6 file map, carries the C-3 §5.2 **positive-path** assertions **B-P1, B-P2, B-P3** and the **hash-binding security** assertions **B-H1, B-H2, B-H3**, in addition to the denial matrix already assigned to it. **No new path is created, no path outside the §6 table is authorized, and no requirement is added or removed.** This is a file assignment, not a scope change.

**Scope and acceptance consequence.** All six previously unassigned assertions acquire an authorized home. B-T1's PC coverage stands as enumerated at draft §6.3 — PC-2 through PC-18 plus the Tranche-B portion of PC-24 — and the commissioning shorthand *"PC-5 through PC-18"* does not govern. No other file changes.

**Frozen draft sections affected.** §6.1 (**D-5**), §6.3 (the corrected PC mapping and file assignment), §17.1 (FD-B6 row), §18 (disposition field).

---

## 7. FD-B7 — non-blocking, and what it does not do

**Kept non-blocking, as instructed.** Draft §2.5 resolves the substantive question: C-4 §6's base-naming requirement was discharged by the Founder-ratified E-3 rebind (`aab51208…`, re-ratified by E-8 `b7c424b5…`), which rebound this stack's exact base to `ef7a479…` / tree `31b132de…`, and by E-1 (`277f85e3…`) and E-5 (`362c7b47…`) binding that same commit and tree at signature time. `6d6110d4…` is a **historical** base — a strict ancestor of `ef7a479…` (merge-base = itself; 11 ahead / 0 behind) — superseded **before** Gate II was authorized.

**B6 is not an unmet prerequisite for Gate III entry.** Whether you *record* Gate II formally closed is a record act and remains yours, because C-3 §9's preamble bars inferring gate closure: *"Approval of one gate never implies the next."* Narrow prospective, **explicitly non-retroactive** wording is supplied verbatim at draft §2.5.4. It requires no repository work, no re-review, and no re-merge.

**Historical authority findings — preserved, unchanged, and not cured.** Nothing in this brief or in any recommended ruling proposes retroactive authorization. Specifically preserved exactly as recorded:

- The original Gate-II execution authority determination for candidate `ca300dd6…` — **`AUTHORITY NOT LOCATED`**.
- The successor-session gap `20260912_000443_9319f3` — **un-ratified**.
- The retention disposition `FOUNDER-DISPOSITION-pr27-candidate-retention-EFFECTIVE-20260913.md`, SHA-256 `2aab0196a1d2841ba76443d90fb5214790e72205347453a013a4c7907c1666a2` — **settled and not re-opened**. Its bar on the `4557ebed…`/`3ffd42dd…` copies serving as effective issuance receipts stands.
- The Gate-I supplement E-5's unfilled placeholder fields — **recorded at draft §1.4, effect on Tranche B none, no cure requested**.
- The merge act `e5c5566…970c`'s own words remain governing: *"This act does not retroactively authorize earlier execution."*

---

## 8. B5 — the Tranche-F prerequisite claim is unsupported

**Stated plainly because it is a correction to a live claim, not a new finding.**

The qualification receipt (`QUALIFICATION-RECEIPT-pr2b-lane-A2-prerequisite-20260913.md`, SHA-256 `22b96d1d6f0f607a8732d4621259aaf92a271aeb15d52e501dbed9a84121cc66`) lists at §5:

> "B5. Tranche F qualification artifacts F-N1 and F-N2 are absent … Gate VII is not issuable."

**The *absence* is true. The *prerequisite* framing is not supported.** The receipt's §5 heading is *"INDEPENDENTLY BLOCKING CONDITIONS"* for A2's prerequisite, and B1–B5 are presented as conditions on A2. That is correct for B1–B4. It is **not** correct for B5:

1. **A2's exact controlling acceptance** (`BR-Builder-Background-Agents-Handoff-r2-REVIEWED-BODY.md`, `acd9be05…`, line 147) names A2's dependency as *"Existing journal lane completed/assigned, storage qualification, schema preflight integration"* — **three items, none of them Tranche F**, and its prerequisite is *"One qualified durable pre-dispatch writer and recovery path."*
2. **r1 never references the Background-Agent A2 work package at all.** A full read of `pr2b-implementation-plan-r1.md` (`08f3ea74…`) for "A2" returns only the atomicity row **B-A2** and the base SHAs. Tranche F appears solely as §4.6 *"Final qualification (PC-0–PC-31, S1–S15)"*, verification only, Gate VII.
3. **Gate VII could not gate A2 even if ordered first**, because C-3 §9's Gate VII row does **not** authorize *"activating dispatch; satisfying contract §1.4"*, and A2 is a dispatch-path consumption task.

**Conclusion.** F-N1/F-N2's absence is a **separate PR-2b qualification requirement** under Gate VII, correctly classified apart from A2's writer-and-recovery prerequisite. It does **not** independently block A2 on the controlling clauses; B1–B4 do. The two requirements do not substitute for one another.

**The original qualification receipt remains historical and unchanged.** It is a true record of what it observed, including the `60d57270…` draft hash that its `2026-09-13T19:00:00Z` observation correctly captured. **It has not been edited, and it will not be edited to match the frozen draft.** Its B5 finding stands as a recorded observation of fact; only its prerequisite *framing* is corrected here, prospectively.

---

## 9. Minimum missing recovery capabilities for A2

Separately listed, as instructed. **This is a gap statement, not a design.** The consumer is **not** designed here and is **not** added to Tranche B. Sources are cited so explicit requirements are distinguishable from inference.

| # | Missing capability A2 needs | Source | Status |
|---|---|---|---|
| 1 | **Dispatch-attempt reconciliation before any retry** — query the downstream by `command_id`; append `dispatched` carrying the *observed* identity from reconciliation evidence, never a re-execution | contract §5.3 (`eaeb6178…`), verbatim: *"On recovery, a command whose latest event is `journaled` or `identity_bound` enters dispatch-attempt reconciliation before any retry"* | **EXPLICIT** |
| 2 | **Never re-dispatch on a missing `dispatched` event alone** | contract §5.3, verbatim: *"Recovery never re-dispatches on the strength of a missing `dispatched` event alone"* | **EXPLICIT** |
| 3 | **`unresolved` append when the answer is indeterminate, then a terminal `resolved` determination** with semantics `reconciled` / `ambiguous` / `mismatch`, where `ambiguous` never resolves silently | contract §5.2, §5.3, §5.4; `packages/journal/src/event-row.ts` already encodes `RESOLUTION_SEMANTICS = ['reconciled','ambiguous','mismatch']` | **EXPLICIT** |
| 4 | **`unresolved` blocks every success claim, retry, and completion representation until `resolved`** | contract §5.5, verbatim: *"`unresolved` blocks any success claim, any retry, and any representation of completion until `resolved`"* | **EXPLICIT** |
| 5 | **Crash-after-append-before-send recovery by recorded command identity** — do not infer delivery from a missing response | Task A2 acceptance cases (`acd9be05…`), verbatim: *"Crash after append but before send \| Recover by recorded command identity; do not infer delivery from missing response"* | **EXPLICIT** |
| 6 | **Crash-after-send-before-response reconciliation or marking unknown — never a blind retry** | Task A2 acceptance cases, verbatim: *"Crash after send but before response \| Reconcile or mark unknown using canonical semantics; never blind retry"* | **EXPLICIT** |
| 7 | **At-most-once per `command_id` enforced by the dispatch path, gateway, and adapter** | contract §5.3, verbatim: *"the dispatch path presents it to the gateway and adapter, which must enforce at-most-once execution per `command_id`"*; Task A2 acceptance case 4 | **EXPLICIT** |
| 8 | **Fault-injection obligations**: journal store down; gateway loss mid-dispatch; crash between `journaled` and dispatch; duplicate replay after restart — no duplicate dispatch, no duplicate authority, no silent success | contract §5.6, verbatim, citing stop-gate items §7.9–7.10 | **EXPLICIT** |
| 9 | **Reservation persistence integrated at the writer boundary** — not held only in a worker map | Task A2 required contract (`acd9be05…`), verbatim: *"Reservation persistence must be integrated at that writer boundary, not held only in a worker map"* | **EXPLICIT** |
| 10 | **A runtime `verify()` / rebuild *consumer*** — the artifact that actually recomputes the chain from genesis and uses it, beyond the `SELECT` grant Tranche B provides | contract §4.1 defines `verify()` recomputation; C-2 §3.3 grants `br_app_runtime` the `SELECT` it requires; C-3 §10 defers the consumer expressly. **No plan artifact names a consumer.** It follows from A2's *"and recovery path"* conjunct combined with contract §4.1 | **INFERENCE** — derived from the A2 conjunct plus contract §4.1, **not** an explicitly named artifact anywhere in the controlling stack |

**Items 1–9 are explicit requirements** found verbatim in the contract or in A2's own acceptance cases. **Item 10 is inference**, and is labelled as such: the plan grants the *read path* and defers the *consumer* without naming one. If you require a consumer, that requirement originates with your ruling, not with a clause now in the record.

**What Tranche B supplies, and what it does not.** Tranche B lands the durable append primitive, the atomicity and refusal semantics (B-A1–B-A5), the fail-closed divergence abort, and the `SELECT` grant enabling recomputation (B-P2, §7.2). It supplies **no consumer and no reconciliation**. **Tranche B's landing will not, by itself, satisfy A2's prerequisite** — a finding the qualification receipt independently reaches at its §4 and §5. That consumer requires separate authorization and is deliberately **not** added to Tranche B.

---

## 10. Consolidated recommended ruling block — FD-B1 through FD-B6

Offered as one quotable block. **No signature, gate, or implementation authority is created by drafting it.** Each ruling below is prospective; none authorizes, ratifies, cures, or backdates any prior execution authority.

```
FOUNDER RULINGS — PR 2b GATE III / TRANCHE B (FD-B1 to FD-B6)
Binding on:
DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-20260913.md
SHA-256 4fee6482420b95062e5133f0c575f8a377ff73ec951ba806194095bb6be2e4eb

FD-B1 — GATE-III ORDERING. The C-3 §9 Gate III precondition "Gate IV complete
  (the plane must exist to execute through)" is a precondition on the EXECUTION
  of migration 0006, not on the authorization, review, or merge of Tranche B's
  code, tests, and CI integration. Consistent with C-3 §9.1 and C-3 §3.1,
  Tranche B's code, tests, and CI integration may be authorized, independently
  reviewed, and merged before Gate IV, provided that NO execution of migration
  0006 occurs until Gate IV's protected administrative plane exists and a
  separate Founder act names the exact commit on main asserted as
  founder_authorized_sha. Gate III authorizes no protected-plane execution.

FD-B2 — DISPOSABLE FIXTURE AUTHORITY (TRANCHE B ONLY). I grant the disposable-
  fixture authority enumerated at §7.3 of the above draft, items 1 through 17,
  subject to every bounding condition there, with these restated as binding:
  disposable instances only (the CI postgres:16 service container or a throwaway
  local container via TEST_DATABASE_URL; never Neon, production, shared,
  staging, or governed infrastructure); the suite and runner must refuse any DSN
  not proven disposable; setup must be idempotent because the fixture role names
  are the real production names and are cluster-wide; the ephemeral password is
  generated per run and is never logged, never written to evidence, never
  committed, and never placed in a repository secret, environment secret,
  environment, workflow file, or Railway variable; NO membership grant to
  br_app_runtime in any form, ever; NO ALTER ROLE outside the three fixture
  roles and no change to the CI postgres superuser; teardown is mandatory and
  same-run, every fixture role must be asserted absent from pg_roles with the
  result reported, and setup or teardown failure FAILS the test; if any
  acceptance criterion cannot be proved within these limits the executor returns
  SCOPE DECISION REQUIRED and does not broaden this exception. This grant is new
  and separate: it does not amend, widen, or reinterpret the Tranche-A
  exception.

FD-B3 — BOUNDED NEWER-MAIN ALLOWANCE. I lift r1 §15 stop condition 1 for
  Tranche B only and authorize the executor to start Tranche B from an
  origin/main newer than this issuance's reference main, and from no other base,
  subject to completing every step of §4.3 and recording its results. Ancestry
  alone, and zero direct path overlap alone, are not sufficient grounds to
  proceed. Material drift requires the executor to return verbatim
  REVIEW TARGET DRIFT — FOUNDER DECISION REQUIRED with the exact intervening
  commit and path set and the specific assumption disturbed, without redesign.
  Once the bound base is recorded and the first edit made, the executor
  preserves it: no silent rebase, no merge of later main, no cherry-pick. This
  allowance does not lift stop condition 1 for any other tranche.

FD-B4 — MIGRATION 0006 SCOPE. Migration 0006 comprises ordered steps 1 through
  13 of C-3 §6.1, and only those. Steps 15 and 16 are not migration statements:
  they are discharged as B-R11 (default-privilege review) and B-R8 (recursive
  pg_auth_members assertion) and appear in 0006 as no SQL. Step 14's enumerated
  non-journal operational grants are deferred to Tranche D, where C-2 §13 step 2
  places them and where PO-3 becomes producible; they are not authored, guessed,
  or stubbed in Tranche B, and 0006 must not grant br_app_runtime any privilege
  beyond the routine EXECUTE and the two-table SELECT specified at §7.2. No
  blanket ALL grant is authorized at any point. This resolves a placement
  conflict between two controlling documents; it adds, removes, and weakens no
  required grant.

FD-B5 — APPEND SIGNATURE. The parameter list of public.command_journal_append is
  the Builder's choice within Tranche B, subject to review, on the C-3 PO-6
  pattern; the controlling stack fixes no signature, and the plan's own §5.2
  assertions are catalog-state assertions rather than literals. The resolved
  signature is binding once recorded. I fix as binding non-negotiables, which
  are not Builder choices: exactly one function exists at
  public.command_journal_append; it is SECURITY DEFINER; it is owned by
  command_journal_writer and NOT by the table owner; it pins
  SET search_path = pg_catalog, pg_temp with public absent; it uses the builtin
  pg_catalog.sha256() only, with no user-defined hash helper and no pgcrypto
  digest() substitution; it contains no dynamic SQL; every non-builtin reference
  is fully qualified. The migration's REVOKE ALL ON FUNCTION and
  GRANT EXECUTE ON FUNCTION must name the identical argument list used at
  creation, and the §6.3 assertions must resolve the routine from the catalog by
  name rather than hardcoding a literal argument list. The resolved signature and
  return type are recorded verbatim in the executor's return, item 7.

FD-B6 — B-T1 FILE ASSIGNMENT. I confirm that test/journal-authority.storage.test.ts
  (B-T1), as already authorized in the §6 file map, carries the C-3 §5.2
  positive-path assertions B-P1, B-P2, B-P3 and the hash-binding security
  assertions B-H1, B-H2, B-H3, in addition to the denial matrix already assigned
  to it. No new path is created, no path outside the §6 table is authorized, and
  no requirement is added or removed.

FD-B7 — NOT ADDRESSED BY THIS BLOCK. Non-blocking. The Gate-II formal-closure
  record act remains available to the Founder under the narrow prospective,
  non-retroactive wording at draft §2.5.4. No retroactive authorization is
  granted or implied by any ruling above.

PRESERVED UNCHANGED. The AUTHORITY NOT LOCATED determination for the original
  Gate-II execution authority; the successor-session 20260912_000443_9319f3 gap;
  retention disposition
  FOUNDER-DISPOSITION-pr27-candidate-retention-EFFECTIVE-20260913.md
  SHA-256 2aab0196a1d2841ba76443d90fb5214790e72205347453a013a4c7907c1666a2;
  the E-5 placeholder finding at draft §1.4; and the merge act e5c5566…970c's
  statement that it does not retroactively authorize earlier execution.

NO SIGNATURE OR IMPLEMENTATION AUTHORITY IS CREATED BY THIS BLOCK.
```

---

## 11. What remains after your rulings

Once FD-B1 through FD-B6 are ruled, the frozen draft is revised **once**, and the
resulting artifact goes to **one independent review of the document itself** —
not a candidate-code review, and not a review of a moving draft. Drafting the
rulings above creates no authority; issuance remains a separate signed act.

Still outstanding after FD-B1–FD-B6, and not created by this brief: **FD-2**
(before Gate IV), **PO-2**, **PO-3**, **PO-7**, and the S9/S10 entry state. None
blocks Gate III code.

**Nothing was implemented. No SQL was executed, no fixture was created, no
database was contacted, no dispatch occurred, no repository file was changed, and
no GitHub write was made. The frozen draft is byte-unchanged.** The qualification
receipt was not modified.
