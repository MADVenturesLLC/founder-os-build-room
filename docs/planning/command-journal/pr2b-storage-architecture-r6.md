# PR 2b — Command-Journal Storage Architecture, Revision 6 (Ratified Deployment Authority Split)

Status: **PROPOSED — design phase closed, awaiting one independent
architecture review bound to this artifact's SHA-256.** No implementation
authority exists. This artifact creates no code, PostgreSQL role, credential,
token, permission, GitHub environment, GitHub secret, repository setting,
Railway service, Railway variable, Neon object, migration, branch, commit, or
PR.

Work ID: `BR-PR2B-JOURNAL-STORE-R6`
Consolidates: `BR-PR2B-JOURNAL-STORE-R5`, `-R5-A01`, `-R5-A02`, and the Founder
Option-A ratification act
Seat: `br-architect` (Plan Authority; no approval, build, operate, or
risk-acceptance authority)
Next role: **one independent architecture review at this hash, then a separate
exact-SHA implementation authorization.**

r6 is self-contained. Every operative rule from r5, addendum 01, and addendum
02 is carried here in full text. The prior artifacts remain immutable
provenance and are not amended.

---

## 0. Provenance and controlling stack

| Artifact | Path / identity | SHA-256 | Verified |
|---|---|---|---|
| Founder ratification (controlling) | "BINDING EXECUTION HEADER — PR 2b FOUNDER OPTION-A RATIFICATION / FINAL r6 CONSOLIDATION", this session | not a file artifact; operative clauses quoted verbatim throughout | quoted, not paraphrased |
| Revision r5 | `docs/planning/command-journal/pr2b-storage-architecture-r5.md` | `20137feec1204fcee763e1900c248fa351a37c83748ca42da062daa68962017a` | **re-hashed at write time, MATCHES the ratification header** (38,307 bytes, 662 lines) |
| Addendum 01 | `docs/planning/command-journal/pr2b-storage-architecture-r5-addendum-01.md` | `d1ce29ca7aa5d113aea0dddc99f74407d274a5a140da107b6ab4d2500d51a340` | **re-hashed at write time, MATCHES** (32,965 bytes, 511 lines) |
| Addendum 02 | `docs/planning/command-journal/pr2b-storage-architecture-r5-addendum-02.md` | `0497354a34a808e19dbfa912e9e89cfa0b713f90e43c6462a11ada537136d01e` | **re-hashed at write time, MATCHES** (10,769 bytes, 214 lines) |
| Revision r4 | `docs/planning/command-journal/pr2b-storage-architecture-r4.md` | `c8146f3858df83c5bacbed878da10035849eeabe64b398a2925db3a75131317a` | per r5 §0 |
| Journal contract v0.17 | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` | per r5 §0 |
| Live Neon preflight (accepted finding) | `/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/HANDOFF-operator-to-founder-pr2b-live-neon-preflight-20260905.md` | `f8f63cbccb5dcd69b3db07ed38927523130d0649094419d7d38d9844a4501a64` | per r5 §0 (19,030 bytes, 250 lines) |

Repository HEAD at binding: `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`, branch
`builder/prereq-c-c2-broker-ledger-worker`. No drift across r5, A01, A02, or
this artifact.

Live Neon state is carried from the accepted preflight and was not re-verified
here: project `orange-art-29526355`, branch `br-summer-sun-avroco6a`, database
`neondb`, sole customer LOGIN `neondb_owner`, which is `pg_database.datdba`,
holds `CREATEROLE`, `CREATEDB`, `REPLICATION`, `BYPASSRLS`, and carries
`INHERIT`+`SET` membership in `neon_superuser`. **No Neon access was performed
in the production of r6 and no Neon authorization is held.**

---

## 1. Change ledger relative to r5

A reviewer should be able to see intent, not reconstruct it. Everything r6
changes relative to r5 is listed here. Everything not listed is carried
unchanged.

| Id | Change | Source | Type |
|---|---|---|---|
| **C-A** | `br_app_runtime` promoted from *specified* to **Founder-ratified** | Ratification acts 1 and 3 | ruling recorded |
| **C-B** | `neondb_owner` rotation promoted from *recommended* to **MANDATORY AT CUTOVER**, with a seven-condition remediation gate | Ruling 2, restated in the ratification act | ruling recorded |
| **C-C** | Option A ratified as the controlling administrative plane; custody-domain move **APPROVED** | Ratification act | ruling recorded |
| **C-D** | `daley40-lab` confirmed exclusively Founder-controlled; bypass classified `RESIDUAL FOUNDER PLATFORM AUTHORITY`; binding vocabulary rule attached | A02 §§1 to 3, restated in the ratification act | ruling recorded |
| **C-E** | Railway blanket ordering claim in r5 §4.3 **withdrawn** and replaced with the corrected finding | A01 §3, restated in the ratification act | factual correction |
| **C-F** | C1 (exact-SHA assertion) and C2 (concurrency) promoted from recommended conditions to **binding**, with exact mechanisms specified | A01 §5.2, promoted by the ratification act | requirement promoted |
| **C-G** | **Agent credential boundary** added as a first-class custody rule | Ratification act | new binding rule |
| **C-H** | Property 5 mechanism **corrected**: r5 §4.4 said "the deploy step runs only on the migration job's success", which assumed the workflow triggers the runtime deploy. It does not. Fail-closed is achieved at the runtime boundary by the ratified boot preflight, which is trigger-independent and strictly stronger. See §11.3 | r6 analysis, reconciled against the ratified boot-migration ruling | factual correction |
| **C-I** | Post-cutover matrix extended from PC-0 to PC-24 with PC-25 to PC-31 covering the GitHub plane, C1, C2, rotation, and the agent boundary | r6 | additive |
| **C-J** | Stop conditions S14 and S15 added, derived from the agent-credential and residual-authority rulings | Ratification act | additive |

No r4 or r5 database security invariant is weakened by any entry above.

---

## 2. Ratified rulings register

Every Founder ruling controlling this architecture, quoted verbatim. Paraphrase
is prohibited; where this document restates a ruling in its own words, the
quotation governs.

### 2.1 Runtime role name (Ruling 1)

> The restricted production runtime LOGIN role name is ratified as:
> `br_app_runtime`
>
> Preserve the r5 privilege model.
>
> This ruling authorizes the name only.
>
> It does not authorize role creation.

### 2.2 Owner credential rotation (Ruling 2)

> The existing `neondb_owner` credential MUST be rotated as part of the
> eventual authority-split cutover because it has historical runtime exposure.
>
> Rotation timing:
>
> - after the restricted runtime identity has been created and proven;
> - after the application runtime has been switched away from `neondb_owner`;
> - as part of an explicitly authorized cutover;
> - before declaring owner credential custody remediated.
>
> No credential rotation is authorized by this architecture act.

### 2.3 Founder identity confirmation

> `daley40-lab` is confirmed by the Founder to be an **exclusively
> Founder-controlled GitHub identity**.
>
> It is not:
>
> - a separate employee;
> - an agent-controlled identity;
> - a shared account;
> - an independent reviewer;
> - an autonomous deployment actor.
>
> Its GitHub admin/bypass authority is classified as:
>
> `RESIDUAL FOUNDER PLATFORM AUTHORITY`
>
> This is **separation of execution identities**, not independent-human review.
>
> Do not describe `daley40-lab` as an independent reviewer.

### 2.4 Option A ratification

> I ratify:
>
> `Option A — GitHub protected-environment one-shot administrative migration job`
>
> as the controlling PR 2b administrative/deployment database plane.
>
> The custody-domain move is:
>
> `APPROVED`
>
> GitHub may become the protected custody domain for the existing
> administrative database credential associated with:
>
> `neondb_owner`
>
> after an explicitly authorized implementation/cutover.
>
> No credential movement is authorized by this architecture act.

### 2.5 Agent credential boundary

> Founder-controlled GitHub identities may have separately scoped automation
> credentials for ordinary agent work, but:
>
> **no agent may receive a credential capable of releasing/approving the
> protected administrative migration environment.**
>
> In particular:
>
> - do not place an approval-capable Founder PAT in an agent environment;
> - do not place it in repository secrets;
> - do not place it in Railway;
> - do not make environment approval an agent action.
>
> An agent may prepare or dispatch an already Founder-authorized migration
> using an appropriately restricted automation credential.
>
> The protected-environment release remains a Founder-controlled authenticated
> action through the other eligible Founder identity.
>
> Do not conflate normal agent GitHub access with administrative migration
> approval authority.

### 2.6 C1, binding

> Because `workflow_dispatch` is ref-addressed rather than
> immutable-SHA-addressed, the workflow must fail closed unless the executing
> commit matches the exact Founder-authorized SHA.
>
> The workflow must compare its immutable execution SHA to an exact
> 40-character:
>
> `FOUNDER_AUTHORIZED_SHA`
>
> or equivalently strong bound value.
>
> A branch or tag is insufficient.
>
> Mismatch means:
>
> `FAIL CLOSED — UNAUTHORIZED SHA`
>
> No privileged database action may execute.
>
> The migration evidence must record both expected and observed SHA.

### 2.7 C2, binding

> Privileged migration executions must be serialized.
>
> Only one administrative migration may execute at a time.
>
> Prefer queued serialization.
>
> Do not configure a newer dispatch to automatically cancel a migration that
> may already be executing DDL unless transaction-safe cancellation is
> independently proven.

### 2.8 Boot migrations

> Schema-mutating migrations must leave application boot.
>
> `MIGRATIONS` may remain the ordered in-repository migration source of truth.
>
> Execution moves to the ratified administrative plane.
>
> Runtime startup uses a read-only fail-closed schema compatibility/preflight
> check.
>
> Schema mismatch must prevent runtime startup.
>
> Runtime must never regain owner authority to repair schema automatically.

### 2.9 Residual Founder authority

> The normal migration system must not use bypass.
>
> Any actual environment/ruleset bypass for privileged migration requires a
> separate explicit Founder emergency act and evidence.
>
> The correct claim is:
>
> `platform-enforced against ordinary execution identities; residual Founder
> platform authority remains`
>
> not that the Founder is technically incapable of bypass.

---

## 3. Runtime identity model

### 3.1 Ratified LOGIN

**`br_app_runtime`** (Founder-ratified, §2.1). One new restricted runtime
credential is approved. No second privileged PostgreSQL LOGIN is authorized by
this architecture.

### 3.2 Required attributes

| Property | Required value |
|---|---|
| `rolcanlogin` | **true** (it is the application's login) |
| `rolsuper` | false |
| `rolcreaterole` | **false** |
| `rolcreatedb` | **false** |
| `rolbypassrls` | **false** |
| `rolreplication` | **false** |
| `rolinherit` | true (irrelevant, it will hold no memberships) |
| Membership in `neon_superuser` | **none** |
| Membership in `br_journal_owner` | **none**, no modifier variant |
| Membership in `command_journal_writer` | **none**, no modifier variant |
| Membership in `neondb_owner` | **none** |
| Membership in any `pg_write_all_data` / `pg_read_all_data` class role | **none** |
| Ownership of journal objects | **none** |
| Journal `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE` | **none** |

### 3.3 Complete journal privilege set

- `SELECT` on `command_journal_events` and `command_journal_chain_head`.
  Justified specifically: required for `verify()` chain recomputation from
  genesis (contract §4.1) and for the projection over events. Read is not a
  write path and is required for the tamper-evidence property to be
  exercisable by the application.
- `EXECUTE` on `public.command_journal_append(...)`.

Nothing else on journal objects. Non-journal operational privileges
(`build_room_events`, `gateway_registry_events`, `phase3_run_*`, and the rest)
are whatever the application already requires, enumerated at implementation
time from the existing schema, granted explicitly, never by blanket `ALL`.

### 3.4 Membership rules

**RULE R-1 (binding).** `br_app_runtime` shall receive no membership edge in
`br_journal_owner`, `command_journal_writer`, `neondb_owner`, or
`neon_superuser`, **including `WITH INHERIT FALSE`, `WITH SET FALSE`, or
both.** Proven necessary in r4 by measurement: with `inherit=false set=true` a
runtime login was denied ambient privilege but still executed `SET ROLE`, then
disabled the append-only trigger, tampered a row, and truncated the table.
`SET FALSE` closes the hole only until one later plain `GRANT` silently
restores `SET TRUE`.

**RULE R-3 (binding, CI-enforced).** The negative suite asserts
`pg_auth_members` contains **zero** edges from `br_app_runtime` to any of the
four roles above, and asserts `rolcreaterole` / `rolcreatedb` / `rolbypassrls` /
`rolreplication` are all false. A modifier-based edge must fail the assertion
exactly as a plain edge does.

**Reachability, not just direct edges.** The ratification act requires "no
membership or reachable privilege path". R-3's assertion is therefore a
recursive walk, not a single-level lookup, and is paired with a
`pg_default_acl` review (PC-16).

---

## 4. Administrative identity model

### 4.1 `neondb_owner`, repurposed not replaced

| Property | Required value |
|---|---|
| Identity | the **existing** Neon project-owner credential. No new admin credential is created |
| LOGIN | true |
| Use | administrative and deployment **only**, after cutover |
| Present in the Railway application service | **false**, removed at cutover |
| Present in ordinary request handling | **false** |
| Present in application boot migrations | **false** |
| Custody after cutover | the GitHub protected administrative environment only (§7) |
| Capability | owns, or can assign ownership of, every object required to establish the journal boundary |

No second project-owner or admin credential is created merely to satisfy this
architecture. The existing owner credential changes *where it lives* and *what
may use it*, not what it is.

### 4.2 `br_journal_owner`

`NOLOGIN`. No credential exists for it. Owns `command_journal_events`,
`command_journal_chain_head`, `command_journal_immutable()`, and both
append-only triggers. Zero membership edges from any runtime login.

### 4.3 `command_journal_writer`

`NOLOGIN`. No credential exists for it. Owns **only** the narrowly scoped
`command_journal_append(...)` routine, deliberately not the tables, so the
routine's body cannot inherit trigger-disabling power (the r3 finding, §6.7).
Holds `SELECT, INSERT` on events and `SELECT, UPDATE` on head. Zero membership
edges from any runtime login.

### 4.4 The invariant

`runtime compromise != administrative database compromise`

Measured support (local PostgreSQL 18.4, r4 harness) for the *shape* of this
model once instantiated: with all membership revoked, the runtime login was
denied `SET ROLE` to both privileged roles, denied `SET SESSION
AUTHORIZATION`, denied trigger disable, denied direct DML, and denied
alteration of the definer routine, while still appending successfully through
the routine. Those are local proofs of the design. The live-platform
equivalents are the §14 matrix, which are checks to be executed, not results.

---

## 5. Credential custody model

No credential value appears in this artifact. Nothing is created, rotated,
copied, or moved by it.

| Credential | Identity | Custodian / store | Consumers | Explicitly denied to |
|---|---|---|---|---|
| **Administrative** | `neondb_owner` (existing) | the GitHub protected administrative environment's environment-scoped secret store **only** (§7) | the one-shot administrative migration job, after Founder approval of that specific run | the Railway application service; any runtime process; boot migrations; ordinary request handling; repository-wide secrets; organization-wide secrets; any agent environment |
| **Runtime** | `br_app_runtime` (new, restricted) | Railway application service variables, **sealed** | the application service (build and runtime) | the administrative plane does not need it and should not hold it |
| **Dispatch automation** | a restricted automation credential (agent-usable) | wherever agent credentials are already held | preparing and dispatching an already Founder-authorized migration run | approving or releasing the protected environment; reading the administrative secret |
| **Approval** | a Founder-controlled GitHub identity's authenticated session | the Founder, and nowhere else | releasing a specific protected-environment deployment | every agent environment; repository secrets; Railway; any automation |

### 5.1 Custody rules, binding

1. The application service must **never** receive the administrative
   credential. Not as a service variable, not as a shared variable, not as a
   reference variable, not in a pre-deploy command (§11.2).
2. Values that live in Railway are stored as Railway **sealed** variables.
   Railway documents sealed variables as write-only: "provided to builds and
   deployments but never visible in the UI nor retrievable via the API." This
   protects the runtime credential against dashboard-session or API-token
   leakage.
3. **Railway shared variables must not be used for either credential.** A
   shared variable is referenceable by any service in the environment, which is
   the precise property this split exists to defeat.
4. Railway cross-service reference syntax (`${{ServiceName.VAR}}`) means
   Railway does not *enforce* one service's inability to reference another's
   variable. Isolation there is configuration discipline plus review, not a
   platform guarantee. Stated as a limitation, not papered over. It is one
   reason the administrative credential does not live in Railway at all under
   the ratified plane.
5. Rotation of `neondb_owner` at cutover is a Founder act and is **MANDATORY**
   (§2.2, §15). It is not authorized now.
6. **Agent credential boundary (§2.5).** No agent may hold a credential capable
   of approving or releasing the protected administrative environment. An
   approval-capable Founder PAT must not exist in an agent environment, in
   repository secrets, or in Railway. Environment approval is never an agent
   action. An agent may prepare and dispatch an already Founder-authorized
   migration using a restricted automation credential that cannot approve.

### 5.2 Why the boundary in rule 6 is enforceable, and where it is not

**Enforceable by the platform.** Environment approval requires an identity on
the required-reviewer list. A restricted automation credential that is not a
listed reviewer cannot release the deployment, and `prevent_self_review`
additionally bars the dispatching identity from approving its own job. An agent
holding a dispatch-only credential therefore cannot reach the administrative
secret by any sequence of its own actions.

**Not enforceable by the platform, and therefore a custody discipline.**
Nothing in GitHub prevents a Founder-controlled PAT with approval capability
from being pasted into an agent environment. That is a handling rule, and it is
why it appears as a stop condition (S14) with a verification check (PC-31)
rather than as an assumed property.

---

## 6. Founder identity and approval semantics

### 6.1 The two identities

The Founder controls both `decivantiq` and `daley40-lab`. Both are
Founder-controlled identities. Their repository and platform administrator
capabilities are classified `RESIDUAL FOUNDER PLATFORM AUTHORITY`.

### 6.2 The ratified pattern

Both identities are listed as required reviewers on the protected environment,
`prevent_self_review` is enabled, and one approval is sufficient. Whichever
identity initiates a privileged migration is barred by the platform from
releasing it; the other performs the approval. The pattern is symmetric, so it
does not depend on which identity initiates.

### 6.3 The actual guarantee, stated exactly

> `a privileged migration cannot be initiated and released by the same
> authenticated GitHub session`

and each privileged tranche carries a two-identity audit trail.

**What this does not provide:** independent human review. Both identities are
the Founder. There is no second judgment in the loop, no adversarial check, and
no constraint on the Founder, who additionally holds residual bypass (§6.5).

### 6.4 Binding vocabulary rule

**Never describe this pattern, or `daley40-lab`, as any of:** independent
review; second independent reviewer; two-person control; four-eyes; dual-human
control; external approval; peer review in a sense implying a second person.

**Approved phrasing:** `separation of execution identities`,
`Founder-controlled approver identity`, `the non-initiating Founder-controlled
identity`.

Independent review, where this architecture requires it (§20), means a reviewer
that is not the Founder and not spawned by the executing session. Nothing in
this pattern supplies that, and it must never be offered in its place.

### 6.5 Residual authority, stated correctly

Observed, read-only, at A01 write time: both org members hold `admin` on the
repository; both existing environments report `can_admins_bypass: true`; the
active `main` ruleset lists `OrganizationAdmin` with `bypass_mode: "always"`;
classic branch protection is off, so the ruleset is the whole of the branch
control.

The correct claim, and the only one permitted in any status line, PR body, or
evidence pack:

> `platform-enforced against ordinary execution identities; residual Founder
> platform authority remains`

**The normal migration system must not use bypass.** Any actual environment or
ruleset bypass for a privileged migration requires a separate explicit Founder
emergency act and its own evidence (S15).

---

## 7. GitHub protected administrative environment

One dedicated protected environment for privileged database administration.
**None exists today and none is created here.** Observed read-only at A01 write
time: the repository has exactly two environments, `compassionate-happiness /
production` (the Railway integration's deployment environment) and `copilot`,
both with empty `protection_rules`.

### 7.1 Specification

| Element | Specified value | Rationale |
|---|---|---|
| Environment name | `db-admin-migration` | Names the function. Distinct from the Railway integration environment, which must never be reused for this purpose |
| Secret | one environment-scoped secret carrying the `neondb_owner` connection string | Environment scope is a separate store, not a filter over repository secrets (observed: repository and environment secret endpoints are distinct) |
| Repository-wide copy | **prohibited** | S11, PC-26 |
| Organization-wide copy | **prohibited** | S11, PC-26 |
| Railway copy | **prohibited** | Custody rule 1, PC-19 |
| Required reviewers | `decivantiq` and `daley40-lab` | Both Founder-controlled; documented limit is "up to 6 people or teams", and "Only one of the required reviewers needs to approve the job for it to proceed" |
| `prevent_self_review` | **enabled** | "Whether or not a user who created the job is prevented from approving their own job" |
| Administrator bypass | **disabled** ("Allow administrators to bypass configured protection rules" deselected) | Reduces the residual to identity-level rather than setting-level. The residual does not vanish (§6.5) |
| Deployment branch policy | restricted to the default branch (`main`) | A tranche authorized on any other ref requires a separate Founder act to widen the policy. Narrowest default |
| Wait timer | not used | Approval is the gate; a timer adds delay without adding authority |
| Normal CI access | **none** | `ci.yml`, `path-audit.yml`, `attribution-shape.yml`, and `claude-code-review.yml` must not reference this environment |

### 7.2 Why the secret is unreachable before approval

GitHub documents, and this design depends on, exactly two properties:

> A workflow job cannot access environment secrets until approval is granted by
> required approvers.

> workflow jobs that use this environment can only access these secrets after
> any configured rules (for example, required reviewers) pass.

A job that does not reference the environment has no resolution path to that
store. A job that does reference it inherits the gate, so declaring the
environment buys a place in the approval queue, not the secret.

### 7.3 The environment is not blanket authority

> The environment must not be treated as blanket migration authority.
>
> Every migration tranche still requires an explicit Founder act.

The environment is the enforcement mechanism for an authorization that already
exists. It never substitutes for one. A run that is approved without a
corresponding Founder authorization act naming that exact SHA and tranche scope
is an unauthorized migration regardless of the platform's verdict.

---

## 8. C1 — exact-SHA mechanism

### 8.1 The problem C1 exists to close

`workflow_dispatch` is ref-addressed. It dispatches against a branch or tag,
and `GITHUB_SHA` is set to the "Last commit on the `GITHUB_REF` branch or tag
that received dispatch". A branch or tag is therefore insufficient as an
authorization boundary: the tip can move between the Founder naming a SHA and
the run starting.

### 8.2 The mechanism

1. The workflow declares a **required** `workflow_dispatch` input
   `founder_authorized_sha`.
2. The input is validated as an exact 40-character lowercase hexadecimal
   string. Anything else fails closed before any other step.
3. The **first** step of the gated job, before any step that could touch the
   administrative secret, compares the run's immutable execution SHA to that
   input.
4. On mismatch the job exits non-zero with `FAIL CLOSED — UNAUTHORIZED SHA`.
   **No privileged database action may execute.**
5. The evidence artifact and the run summary record **both** the expected and
   the observed SHA, whether or not they matched.
6. The checkout is pinned to the asserted SHA, so the migration content is the
   authorized tree and not a ref tip resolved later.

### 8.3 Threat model, stated honestly

**Closed by C1.** Ref-tip drift between authorization and dispatch. A
mis-dispatch against the wrong branch or tag. A run that would otherwise
migrate a tree the Founder never named. In each case the run fails before
touching the secret, and the failure is recorded with both SHAs.

**Not closed by C1 alone.** A dispatcher that controls both the ref and the
input can dispatch ref X while passing `founder_authorized_sha` equal to X's
tip, and the assertion will pass. C1 verifies internal consistency; it cannot
by itself know what the Founder authorized.

**What closes it.** Three controls in combination, all ratified:

- the **approval gate**: the run halts before secret access, and the approving
  Founder identity sees the run, its ref, and its asserted SHA before releasing
  it. Approval is of a specific run, not of the workflow in general;
- the **deployment branch policy** (§7.1), which limits dispatch to the default
  branch, so candidate SHAs are commits that already passed the `main`
  ruleset's pull-request and status-check rules;
- the **agent credential boundary** (§2.5, §5.1 rule 6), which guarantees the
  dispatching identity cannot also be the releasing identity.

Stated plainly: C1 is an integrity assertion, and the approval gate is the
authorization. Neither is sufficient alone, and r6 requires both.

---

## 9. C2 — concurrency mechanism

### 9.1 Specification

| Element | Specified value |
|---|---|
| Concurrency group key | the constant string `pr2b-admin-migration`, not interpolated with the SHA or the ref |
| `cancel-in-progress` | **false**, explicit |
| Queue behavior | queued serialization: `queue: max` |

### 9.2 Why each value

**Constant key, not per-SHA.** The requirement is "Only one administrative
migration may execute at a time". A key interpolated with the SHA or ref would
create one group per tranche and permit two different migrations to run
concurrently, which is exactly what the requirement forbids.

**`cancel-in-progress: false`.** GitHub cancels an in-progress run in the same
group only when this is true. A cancellation mid-DDL is not transaction-safe
unless proven so, and the ratification act forbids configuring it without that
proof:

> Do not configure a newer dispatch to automatically cancel a migration that
> may already be executing DDL unless transaction-safe cancellation is
> independently proven.

No such proof exists. The value is therefore false.

**`queue: max`.** GitHub's documented default is that "any existing `pending`
job or workflow in the same concurrency group will be canceled and the new
queued job or workflow will take its place". Under the default, a second
dispatch would silently cancel a tranche that is waiting for Founder approval.
`queue: max` preserves queued runs instead of replacing them, which is the
"prefer queued serialization" instruction. Documented constraint honored:
`queue: max` combined with `cancel-in-progress: true` "is not allowed and will
result in a workflow validation error", and this design sets
`cancel-in-progress: false`, so the combination is valid.

**Documented guarantee relied upon:** "only a single job or workflow using the
same concurrency group will run at a time."

---

## 10. Administrative plane, workflow shape

Specified as design. No workflow file is created by this artifact.

| Stage | Content | Gate |
|---|---|---|
| 0 | `workflow_dispatch` with required inputs: `founder_authorized_sha` (40 hex), `tranche_id`, and the migration range or identifier being applied | dispatchable by a restricted automation credential or by a Founder identity |
| 1 | Ungated preflight job: validate input shape, assert `github.sha` equals `founder_authorized_sha`, print expected and observed SHA to the run summary. **No environment reference. No secret access.** | fails closed on mismatch, before any approval is requested |
| 2 | Gated job: `environment: db-admin-migration`. Waits for a Founder-controlled approver identity | secret is unreachable until approval |
| 3 | Re-assert the SHA equality inside the gated job, then checkout the asserted SHA | defends against any state change between stages |
| 4 | Apply exactly the authorized tranche from `MIGRATIONS`, as `neondb_owner`, one tranche per run | the environment is not blanket authority (§7.3) |
| 5 | Emit evidence: expected SHA, observed SHA, tranche id, applied migration ids, `schema_migrations` state before and after, approver identity, run id, and timestamps | evidence is platform-generated, not self-reported |

Concurrency (§9) applies at the workflow level so that stages 1 to 5 of two
different dispatches cannot interleave.

---

## 11. Fail-closed semantics and the Railway disposition

### 11.1 Corrected Railway findings

r5 §4.3's blanket claim, "Railway provides no cross-service deployment ordering
or gating primitive", is **withdrawn**. The corrected finding, carried from A01
§3 and restated in the ratification act:

- Railway supports deployment dependencies through service reference
  relationships for certain batched deployments. Railway documents: "When
  multiple services deploy together, Railway uses reference variables to
  determine the deploy order. A service that references another service waits
  for that service to finish deploying before it starts."
- Ordering **applies** to batched deploys: template deploys, applying staged
  changes, duplicating an environment, and PR environments.
- Ordering **does not apply** where services deploy independently: "GitHub push
  deploys — even in a monorepo where one push triggers multiple services, each
  service deploys independently", and "Single-service redeploys — there is
  nothing to order against."
- **The actual Founder OS deployment is a single-service GitHub-push flow.**
  Verified read-only: `railway.toml` configures one service; no workflow in
  `.github/workflows/` deploys to Railway; every recent GitHub deployment was
  created by `railway-app[bot]`, task `deploy`, into `compassionate-happiness /
  production`, on pushed commit SHAs. Those ordering semantics therefore do not
  provide the required privileged-admin-before-runtime gate.
- **Failure propagation is insufficiently proven.** Railway documents *waiting*
  for a dependency to finish deploying. It does not document that a failed
  dependency blocks or fails the dependent deployment.
- **Railway deployment approval is not the selected exact-SHA Founder
  authorization boundary.** It exists for a different purpose: "If a member of
  a GitHub repo doesn't have a linked Railway account. Railway by default will
  not deploy any pushes to a connected GitHub branch."

### 11.2 Dispositions

| Option | Disposition |
|---|---|
| Option A, GitHub protected-environment one-shot job | **RATIFIED**, controlling |
| Option B, isolated Railway administrative service | **REJECTED**, on the §11.1 grounds |
| Same-service Railway pre-deploy | **PROHIBITED.** Railway documents: "They execute within your private network and have access to your application's environment variables." The existing application service must never receive the administrative DB credential |
| Option C, hybrid | **RETIRED.** It introduces a privileged Railway API token, a new privileged credential of a different kind |
| Option D, Founder-operated one-shot | **Emergency and fallback architecture only.** Not the selected normal plane |

### 11.3 Correction C-H: how fail-closed is actually achieved

r5 §4.4 justified property 5 by saying "the privileged migration job and the
runtime-deploy trigger are ordered jobs in one workflow: the deploy step runs
only on the migration job's success." **That is not the case here.** The
runtime deploy is triggered by Railway on GitHub push, not by this workflow, so
no workflow ordering can gate it. Left uncorrected, this would be a false
platform claim in the controlling architecture.

The ratified boot-migration ruling supplies the correct and stronger mechanism.
Fail-closed is enforced at the **runtime boundary**, not at the deployment
boundary:

1. Schema-mutating migrations no longer run at boot (§12).
2. Runtime boot performs a read-only schema compatibility preflight and exits
   non-zero on mismatch.
3. Railway holds traffic until `healthcheckPath` answers, and `railway.toml`
   sets `restartPolicyType = "ON_FAILURE"` with `restartPolicyMaxRetries = 3`.
   A revision that fails its preflight never becomes healthy, is recorded as a
   failed deploy, and the previous healthy revision continues serving.

**Consequence.** Whether the migration fails, or a runtime revision races ahead
of its migration, the new revision does not serve. This holds regardless of
deployment trigger, ordering primitive, or vendor. It does not depend on
Railway documenting failure propagation, which is precisely the thing that
could not be proven.

**Residual, stated.** This is fail-closed on *serving*, not on *deploy
initiation*. A runtime deploy will still start and then fail its healthcheck.
Nothing serves a mismatched schema; something does briefly attempt to boot. The
architecture treats a visible failed deploy as an acceptable and auditable
outcome, and r5 §5 already required exactly that: "A deploy that runs ahead of
its migration fails visibly instead of serving a broken schema."

---

## 12. Boot migration disposition

**RULE R-4 / R-5 (binding).**

1. Journal owner-class DDL never runs through
   `packages/control-plane/src/migrations.ts`'s boot-applied `MIGRATIONS`
   array.
2. The normal application process must not need project-owner authority to
   start, and a runtime deployment must be able to start and operate holding
   only `br_app_runtime`.

**Current state**, re-read and consistent with the preflight: `main.ts:39`
calls `migrate(pool)` on the `DATABASE_URL` pool during boot
(`config → pool → migrate → listen`), and `migrations.ts` contains DDL
requiring ownership-class authority (`CREATE TABLE`, `CREATE FUNCTION`,
`CREATE TRIGGER`, `ALTER TABLE ... VALIDATE CONSTRAINT`). Under a restricted
runtime identity that call will fail, so boot migration cannot simply be left
in place.

**Design:**

- **All** schema-mutating migrations move to the ratified administrative plane.
  `MIGRATIONS` remains the ordered, append-only, in-repository source of truth.
  What changes is **who executes it and when**: the admin plane, under Founder
  authorization, not the runtime at boot.
- `main.ts` replaces `migrate(pool)` with a **read-only boot preflight
  assertion** that fails closed. It verifies the expected schema version is
  present (`schema_migrations`) and that the runtime login holds none of the
  forbidden privileges, and exits non-zero otherwise. The existing boot
  contract, "the process does not begin serving until the schema is present",
  is preserved; only the actor changes.
- **Runtime must never regain owner authority to repair schema automatically.**
  The preflight reports and exits. It never creates, alters, or repairs.
- Ordering intent remains **admin plane migrates, then runtime serves**,
  enforced as described at §11.3.

---

## 13. Cutover sequence, fail-closed

No cutover implementation is authorized. Each step names its actor, its proof,
and its abort condition. **Any step that fails aborts the cutover at that
point; no later step proceeds.**

| # | Step | Actor | Proof required to proceed | Abort |
|---|---|---|---|---|
| 1 | Create `br_app_runtime` LOGIN with the §3.2 attributes; generate its credential | Founder / admin plane | `pg_roles` shows `rolcanlogin=t`, `rolcreaterole=f`, `rolcreatedb=f`, `rolbypassrls=f`, `rolreplication=f`, `rolsuper=f` | any attribute wrong |
| 2 | Grant `br_app_runtime` the enumerated non-journal operational privileges it needs; verify existing suites pass against it in a non-production branch | admin plane | full existing test suite green under the restricted identity | any required privilege missing, then enumerate, never blanket-grant |
| 3 | Create `br_journal_owner` and `command_journal_writer` as `NOLOGIN` | admin plane | `rolcanlogin=f` for both; no password set | either can log in |
| 4 | Create journal objects owned by `br_journal_owner`; create the append routine owned by `command_journal_writer`; apply §§3 to 4 grants and revokes; initialize the singleton head row to `seq=0` plus 64-zero genesis | admin plane | ownership confirmed via `pg_tables` / `pg_proc`; exactly one head row | any ownership lands on a runtime-reachable role |
| 5 | Prove the runtime denial matrix (PC-10 to PC-16, R-1 / R-3) as `br_app_runtime` | admin plane / CI | every denial observed as an actual PostgreSQL error | any denial does not fire |
| 6 | Prove the controlled append path: `EXECUTE` succeeds; single-transaction lifecycle plus journal COMMIT / ROLLBACK / journal-failure cases | CI | all three §16.2 outcomes reproduced live | any case diverges |
| 7 | Remove privileged DDL from the boot path; replace with the read-only preflight assertion (§12) | Builder, separately authorized | boot issues no DDL; preflight fails closed on missing schema | boot still requires owner authority |
| 8 | Switch the Railway application service's `DATABASE_URL` to the `br_app_runtime` identity (sealed variable) | Founder | staged change reviewed and deployed | rollback available until step 10 |
| 9 | Prove application startup and required runtime behavior under the restricted identity: boot completes, `/health` serves, room lifecycle writes succeed, journal append succeeds via the routine | Founder / CI | green | any runtime failure, then roll `DATABASE_URL` back to the prior identity |
| 10 | Prove `neondb_owner` is absent from the application's environment: no service variable, no shared variable, no reference variable resolves to it | Founder | variable audit clean | any residue |
| 11 | Prove zero runtime membership paths to `br_journal_owner`, `command_journal_writer`, `neondb_owner`, `neon_superuser`: recursive `pg_auth_members` walk from `br_app_runtime` | CI | zero edges at any depth | any edge |
| 12 | Establish the GitHub protected administrative environment per §7 and place the administrative credential there | Founder | environment reports the specified reviewers, `prevent_self_review`, disabled admin bypass, branch policy; secret present at environment scope only | any deviation from §7.1 |
| 13 | Prove the administrative plane end to end: C1 mismatch fails closed; C2 serializes; an unapproved run cannot read the secret; an approved run applies exactly one tranche and emits evidence | Founder / CI | PC-23, PC-25, PC-27, PC-28 pass | any control does not fire |
| 14 | **Rotate `neondb_owner`** under separate Founder authority (§15) | Founder | rotation recorded; superseded credential no longer authenticates; replacement exists only in the protected administrative custody plane | rotation incomplete, then custody is not remediated |

**Rollback posture.** Steps 1 to 7 are additive and reversible: the application
still runs as `neondb_owner` and nothing has been taken away. **Step 8 is the
first irreversible-in-practice step** for runtime behavior. Step 10 is the point
after which admin authority is no longer in the runtime environment. Rollback
before step 8 is configuration-only. After step 10, rollback means
re-provisioning admin custody, which is a Founder act.

**Journal-history rollback boundary.** Before the first append, removal may be
permissible with the `count(*) = 0` precondition **checked, not assumed**.
After the first appended event, dropping journal history is destruction of
governed records, not ordinary rollback, and is unavailable to the Builder or
Operator. The safe reversal after first write is `REVOKE EXECUTE` on the append
routine, which fails dispatch closed per contract §5.1, never a drop.

---

## 14. Post-cutover verification matrix

The preflight is **not to be rerun unchanged**. Its NP checks returned
`NOT-PROVABLE-READ-ONLY` because the objects did not exist and mutation was
forbidden. They become provable only after cutover steps 1 to 4, executed by
the authorized admin plane. Every row below is a check to be executed, not a
result.

**Group A — the S9 gate, re-asked, must pass first:**

| ID | Check | Pass criterion |
|---|---|---|
| **PC-0** | The role in the application's `DATABASE_URL` is `br_app_runtime`, not `neondb_owner` | `current_user` = `br_app_runtime` from the app's own connection |
| **PC-1** | `br_app_runtime` is not the database owner | `pg_database.datdba` is not `br_app_runtime` |
| **PC-2** | No membership in `neon_superuser` at any depth | recursive `pg_auth_members` walk returns zero; `pg_has_role(..., 'neon_superuser', 'USAGE'/'MEMBER'/'SET')` all false |
| **PC-3** | `br_app_runtime` attributes | `rolcreaterole=f`, `rolcreatedb=f`, `rolbypassrls=f`, `rolreplication=f`, `rolsuper=f` |
| **PC-4** | No `pg_write_all_data` / `pg_read_all_data` class membership | zero |

**Group B — previously unprovable NP checks, now executable:**

| ID | Former NP | Check | Pass criterion |
|---|---|---|---|
| PC-5 | NP-1/NP-2 | `br_journal_owner`, `command_journal_writer` exist as `NOLOGIN` | `rolcanlogin=f` both |
| PC-6 | NP-3/NP-5 | Journal tables owned by `br_journal_owner` | `pg_tables.tableowner` confirms both |
| PC-7 | NP-4 | Append routine owned by `command_journal_writer`, not the table owner | `pg_proc.proowner` confirms |
| PC-8 | NP-6 | No journal sequence exists (design assigns `seq` in the routine); any introduced is owned by `br_journal_owner` | confirmed |
| PC-9 | NP-7 | `command_journal_immutable()` and both triggers owned by `br_journal_owner` | confirmed |
| PC-10 | NP-8/NP-9 | Runtime cannot `SET ROLE` to either privileged role | `permission denied to set role`, both |
| PC-11 | — | Runtime cannot `SET SESSION AUTHORIZATION` to either | `permission denied`, both |
| PC-12 | NP-10 | Runtime denied `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on both journal tables | eight distinct `permission denied for table` |
| PC-13 | NP-11 | Runtime cannot disable, drop, or add journal triggers | `must be owner of table` |
| PC-14 | NP-12 | Runtime cannot `ALTER` / `CREATE OR REPLACE` the routine or change its owner | `must be owner of function` |
| PC-15 | NP-13 | Runtime cannot `SET session_replication_role='replica'` | `permission denied to set parameter` |
| PC-16 | NP-14 | No Neon-managed role silently grants broader privilege: full `pg_auth_members` audit plus `pg_default_acl` review | zero unexpected edges or default grants |
| PC-17 | NP-15 | Positive path intact: runtime `EXECUTE`s the routine and `SELECT`s both tables | succeeds |
| PC-18 | NP-16 | Routine ACL carries no `PUBLIC` execute entry | `proacl` has no bare `=X/` |

**Group C — the split itself:**

| ID | Check | Pass criterion |
|---|---|---|
| PC-19 | The Railway application service holds no administrative credential in any form (service, shared, or reference variable) | variable audit clean |
| PC-20 | The application boots and serves holding only `br_app_runtime` | boot completes, `/health` 200 |
| PC-21 | Boot issues no DDL | preflight-assertion path only |
| PC-22 | A runtime revision whose required schema is absent does not serve | preflight exits non-zero, healthcheck fails, deploy recorded failed, prior revision continues serving (§11.3) |
| PC-23 | The administrative secret is inaccessible without Founder approval | an unapproved run cannot read the environment secret |

**Group D — retained:**

| ID | Check | Status |
|---|---|---|
| PC-24 | U3: pool `search_path` does not alter resolution of the schema-qualified call site | **Already PASSED** in the preflight: repo pool sets only `statement_timeout`; live pooled and unpooled `search_path` both `"$user", public`. Re-confirm once post-cutover, as the pool identity changes |

**Group E — the ratified administrative plane (new in r6):**

| ID | Check | Pass criterion |
|---|---|---|
| PC-25 | C1 fails closed on mismatch | a dispatch whose `founder_authorized_sha` does not equal the execution SHA exits with `FAIL CLOSED — UNAUTHORIZED SHA`, before any secret access, and records both SHAs |
| PC-26 | No repository-wide or organization-wide copy of the administrative credential | repository and organization secret listings contain no administrative credential entry; the value exists only at environment scope |
| PC-27 | C2 serializes | two overlapping dispatches produce one executing run and one queued run; the queued run is not canceled by the newer dispatch; no in-progress run is canceled |
| PC-28 | Approval semantics hold | the initiating identity cannot approve its own run; the non-initiating Founder-controlled identity can; the run's approver identity appears in the evidence |
| PC-29 | Environment configuration matches §7.1 | reviewers, `prevent_self_review`, disabled administrator bypass, and the branch policy all read back as specified |
| PC-30 | No normal CI path to the environment | no workflow other than the administrative migration workflow references `db-admin-migration` |
| PC-31 | Agent credential boundary holds | no approval-capable credential exists in any agent environment, repository secret, or Railway variable; the dispatch automation credential cannot approve a deployment |

**Disposition.** Any Group A failure means `FOUNDER_DECISION_REQUIRED` and S9
persists. Any Group B ownership failure prohibited by Neon is **S3**: return
`FOUNDER_DECISION_REQUIRED` and do not redesign around the limitation. Any
Group C or Group E failure means the cutover is incomplete: do not certify.

---

## 15. Mandatory owner-rotation sequence

Rotation of `neondb_owner` is **MANDATORY AT CUTOVER** and is **not authorized
now**. Administrative custody must not be declared remediated until all seven
conditions hold, in order:

1. `br_app_runtime` exists and passes verification (PC-0 to PC-4, PC-17);
2. the Railway runtime has switched to `br_app_runtime` (PC-0, PC-20);
3. `neondb_owner` is absent from the application-service environment (PC-19);
4. GitHub protected administrative custody is operational (PC-23, PC-26 to
   PC-30);
5. the owner credential is rotated under separate Founder authority;
6. the superseded credential no longer authenticates;
7. the replacement owner credential exists only in the protected
   administrative custody plane.

Conditions 5, 6, and 7 are proven by evidence produced at rotation time:
rotation recorded, an authentication attempt with the superseded credential
refused, and a custody audit showing the replacement present at environment
scope only.

**S13 preserved.** Any status line, PR body, or evidence pack asserting custody
remediation before all seven conditions hold is a false claim and a stop.

---

## 16. Preserved invariants, none weakened

**16.1 Same-connection journal atomicity.** The runtime performs the lifecycle
insert and calls the append routine on **one connection, in one transaction**.
No second pool, no second runtime login, no two-phase commit. The authority
split changes *which* login the runtime uses, not how many.

**16.2 COMMIT / ROLLBACK / journal-failure proofs** (r3 / r4, local PG 18.4):

```
COMMIT   : lifecycle rows=1  journal refs=1     (both persisted)
ROLLBACK : lifecycle rows=0  journal refs=0     (neither persisted; head did not advance)
FAILURE  : duplicate command_id inside the act -> lifecycle rows=0
```

A journal failure cannot orphan a lifecycle insertion. The act does not take
effect.

**16.3 `SECURITY DEFINER` hardening.** Pinned `search_path = pg_catalog,
pg_temp` (`public` deliberately absent); fully qualified object names; `PUBLIC
EXECUTE` revoked with a single explicit grant; no dynamic SQL; no shadowing
path. Containment measured: inside the routine `current_user` is the writer,
after the call it is the runtime login, and the runtime still cannot `INSERT`.
`SET ROLE` inside a definer function is refused by PostgreSQL, retained as
defense in depth, never as a substitute for removing membership.

**16.4 Zero runtime membership edges.** §3.4 R-1 / R-3, verified by PC-2,
PC-10, PC-11, PC-16.

**16.5 Builtin `pg_catalog.sha256()` binding.** `sha256(bytea)` is a
`pg_catalog` builtin; a non-superuser cannot create `pg_catalog.sha256`, and a
`pg_temp` overload does not capture resolution (verified against the NIST
vector for `"abc"`). **No user-defined hash helper may be substituted**,
including pgcrypto `digest()`, because a helper reopens the overload-hijack
vector demonstrated in r3. Stop condition S6.

**16.6 Trigger-bypass protections.** Append-only triggers on
`command_journal_events`; `session_replication_role` denied to the runtime at
parameter level; trigger disable requires ownership the runtime does not hold.

**16.7 Tamper-evident, not tamper-proof.** Owner and superuser can still
disable triggers or `TRUNCATE`. Demonstrated: owner tamper succeeded and the
recomputed chain returned `MISMATCH-DETECTED`. **The authority split narrows
who holds owner authority; it does not eliminate the owner bypass.** No PR
body, test name, or status line may claim journal history is immutable or
tamper-proof.

**16.8 No second journal chain.** One canonical journal, one chain, one `seq`
space, two record classes (contract §1.2). Nothing here creates, permits, or
implies a second authoritative command history.

**16.9 No runtime owner authority.** The purpose of the whole revision line.

---

## 17. Stop conditions

- **S1** — the administrative plane would require a **new privileged
  credential**. Resolved for the runtime identity only: one new **restricted
  runtime** credential is approved; no new admin or owner credential is
  permitted. If a selected plane would need a second privileged credential,
  stop: `FOUNDER_DECISION_REQUIRED`.
- **S2** — the controlling contract hash changes from `eaeb6178…9e52`.
- **S3** — any required Neon ownership operation (PC-5 to PC-9) is prohibited
  by the platform. Return `FOUNDER_DECISION_REQUIRED`; do not redesign around
  it.
- **S4** — CI cannot run the negative matrix as a non-superuser login.
- **S5** — any design change granting a runtime login direct journal DML,
  membership in a privileged role (**with or without `INHERIT FALSE` /
  `SET FALSE`**), or ownership of journal objects.
- **S6** — substituting a user-defined hash helper for the builtin `sha256()`.
- **S7** — implementation would write a real control-plane act, activating
  contract §1.4 (out of scope, §18).
- **S8** — a second *privileged* database login is proposed. The one new
  **restricted runtime** login is approved and is not an S8 trigger.
- **S9** — the runtime login is, or can reach, the Neon project owner.
  **Currently TRIGGERED**; cleared only by PC-0 to PC-4 passing post-cutover.
- **S10** — privileged DDL remains in the boot-applied path, or the application
  requires project-owner authority to start. **Currently TRIGGERED**; cleared
  by cutover step 7 and PC-20 / PC-21.
- **S11** — the administrative credential is found in the application service's
  variable set, in repository-wide secrets, or in organization-wide secrets, in
  any form. PC-19, PC-26.
- **S12** — the administrative plane cannot fail closed on privileged-migration
  failure. Under r6 this is measured at the runtime boundary: PC-22.
- **S13** — administrative custody is declared remediated before all seven
  rotation conditions hold (§15).
- **S14 (new)** — an approval-capable credential for the protected
  administrative environment is placed in an agent environment, in repository
  secrets, in Railway, or is otherwise made usable by an agent; or environment
  approval is performed as an agent action. PC-31.
- **S15 (new)** — environment or ruleset bypass is used for a normal privileged
  migration. Bypass requires a separate explicit Founder emergency act and its
  own evidence (§6.5).

---

## 18. Non-activating scope claim

1. Permitted once authorized: journal tables, singleton head row and genesis
   initialization, immutability triggers, the two `NOLOGIN` roles, the
   restricted runtime role, grants and revokes, the append routine, and tests.
2. **This tranche does not claim to satisfy contract §1.4's dual-write rule.**
   §16.2 proves the *mechanism* can carry a lifecycle insert and a journal
   append in one transaction. §1.4 is satisfied only when a **later authorized
   dispatch integration performs both writes in one transaction as a real
   control-plane act.** That act does not exist here.
3. No dispatch path is activated; contract §5.1's pre-dispatch fail-closed rule
   is not exercised.
4. Phase 4 stop-gate items 2 and 4 to 10 are not discharged; storage-layer
   evidence contributes to items 1 and 3 only.

---

## 19. Governance

- **Storage locus and sole-writer rule:** already ruled, `DEC-20260827-01` §10;
  contract §3 **[RULED]**. This revision implements them.
- **Credentials:** the Founder has expressly approved **one new restricted
  runtime credential** and expressly forbidden a second admin credential.
  `DEC-20260815-17` §6's "new credentials" prohibition is addressed by that
  ruling, not by inference. The two privileged database roles remain `NOLOGIN`
  with no credential.
- **Custody:** the custody-domain question raised at r5 §4.5 is **settled**.
  Under `DEC-20260815-02` custody posture is a Founder act, and the Founder has
  ratified the move to a GitHub protected environment. A DEC may still be
  required to *record* the new custody domain; that determination is the
  Founder's and is not an architecture question.
- **Security posture:** moving admin authority out of the runtime service is a
  security-posture change and an `AGENTS.md` approval gate. The Founder has
  directed and ratified it, which supplies the authority.
- **Freeze:** per `DEC-20260827-01`'s recorded freeze disposition, the work is
  demanded by a shipping build; `DEC-20260814-03` clause 2 does not reach it,
  and no clause 4 exception is claimed.
- **Attribution:** authored by the `br-architect` seat. No commit was produced,
  so no attribution trailer is attached. If this file is later committed, the
  committing act carries its own trailers and its own authorization.

---

## 20. Remaining Founder questions

**None.** The custody decision returned at r5 §4.5 is ratified. The role name
is ratified. Rotation is ratified as mandatory. The identity model is confirmed
and classified. C1 and C2 are binding with mechanisms specified. Every
implementation detail that remains is implementation, not architecture, and no
Founder decision has been manufactured for it.

`FOUNDER_DECISION_REQUIRED` is **not** returned by this artifact.

One item is recorded as a matter of fact rather than as a question: correction
C-H (§11.3) changes the mechanism by which property 5 is satisfied, from
workflow-ordered deploy to runtime-boundary fail-closed preflight. It selects
no new plane, moves no custody, and is derived from the Founder's own ratified
boot-migration ruling. It is flagged here so the independent reviewer examines
it directly rather than discovering it.

---

## 21. Architecture status

**DESIGN PHASE CLOSED — AWAITING ONE INDEPENDENT ARCHITECTURE REVIEW AT THIS
ARTIFACT'S SHA-256.**

Upon a `PASS` verdict from one fresh independent architecture review bound to
this artifact's exact hash, and with no material Founder question outstanding,
the status becomes:

`ARCHITECTURE-READY — IMPLEMENTATION REQUIRES EXACT-SHA FOUNDER AUTHORIZATION`

r6 does not self-declare that status. The review is a precondition, not a
formality, and this artifact cannot certify itself.

**Review independence, binding.** The review must be launched by the Founder,
from a session and surface the authoring session did not spawn. A reviewer
spawned by the authoring session is self-approval at the session level and its
verdict is void. Permitted verdicts: `PASS`, `REQUEST-CHANGES`,
`INCONCLUSIVE`.

**No implementation authority exists.** The next legitimate act after a `PASS`
verdict is a separate exact-SHA implementation authorization naming base SHA,
file scope, commit subjects, and required outcomes.

---

## Appendix A — verification provenance

**Hashing (this session, local `shasum -a 256` and `wc`).** r5 at
`20137feec1…62017a`, 38,307 bytes, 662 lines. Addendum 01 at
`d1ce29ca7a…51a340`, 32,965 bytes, 511 lines. Addendum 02 at
`0497354a34…36d01e`, 10,769 bytes, 214 lines. All three re-hashed at r6 write
time and all three match the values named in the ratification header.
`git rev-parse HEAD` returns `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`.

**GitHub evidence** is carried from A01 Appendix A, where it was gathered by
read-only GETs authenticated as `decivantiq`: repository visibility and
permissions, organization plan (`enterprise`), environments and their
`can_admins_bypass` state, environment-scoped and repository-scoped secret
listings (names only; the API never returns values), organization members and
repository collaborators, recent deployments and their creator identity, and
rulesets with their bypass actors. No secret value was read at any point. No
new platform reads were required for r6 and none were performed.

**Vendor documentation** is carried from A01 Appendix A: Railway deployment
actions (dependency ordering, when it applies and does not apply), services
(deployment approval, GitHub source deploys), pre-deploy command and its
Infrastructure-as-Code reference, and cron behavior; GitHub environments (plan
requirement, required reviewers, prevent self-review, administrator bypass,
secret access after rules pass), secrets concepts, `workflow_dispatch` ref and
`GITHUB_SHA` semantics, REST environment fields, and `concurrency` syntax
including `queue` behavior. Quotations are reproduced as retrieved; the
retrieval method is recorded in A01 so any quotation can be re-checked against
its source page.

**Not verified here, and not claimed.** No Neon access was performed and no
Neon authorization is held. No GitHub environment protection rule was
configured, so no protection behavior has been observed in place; the platform
capability rests on plan entitlement plus published behavior, as labelled in
A01 §2.1. Every check in §14 is a check to be executed, not a result.

**Nothing was created or modified.** No code, PostgreSQL role, credential,
token, permission, GitHub environment, GitHub secret, repository setting,
Railway service, Railway variable, Neon object, migration, branch, commit, or
PR was created or modified in the production of this artifact.
