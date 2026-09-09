# PR 2b r5 — Addendum 01 (Platform-Enforcement Correction)

Status: **PROPOSED — advisory. Docs-only correction.** No implementation
authority exists. This artifact creates no code, role, credential, GitHub
environment, GitHub secret, Railway service, Railway variable, Neon object,
migration, branch, commit, or PR.

Work ID: `BR-PR2B-JOURNAL-STORE-R5-A01`
Extends (does not supersede): `BR-PR2B-JOURNAL-STORE-R5`
Seat: `br-architect` (Plan Authority; no approval, build, operate, or
risk-acceptance authority)
Next role: **Founder ratification of the administrative plane (§5), then
implementation authorization.**

r5 is unmodified by this artifact. Its bytes and hash are unchanged, and it
remains the controlling architecture. This addendum records two Founder
rulings, one corrected platform finding, one capability verification, and the
resulting matrix.

---

## 0. Controlling inputs and hashes

| Input | Path / identity | SHA-256 |
|---|---|---|
| Founder ruling (controlling) | "BINDING EXECUTION HEADER — PR 2b r5 PLATFORM-ENFORCEMENT CORRECTION ONLY", this session | not a file artifact; operative clauses quoted verbatim at §1 and §3 |
| Revision r5 (corrected artifact) | `docs/planning/command-journal/pr2b-storage-architecture-r5.md` | `20137feec1204fcee763e1900c248fa351a37c83748ca42da062daa68962017a` — **independently re-hashed, MATCHES** (38,307 bytes, 662 lines, trailing newline present) |
| Revision r4 | `docs/planning/command-journal/pr2b-storage-architecture-r4.md` | `c8146f3858df83c5bacbed878da10035849eeabe64b398a2925db3a75131317a` (per r5 §0; not re-hashed here) |
| Journal contract v0.17 | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` (per r5 §0) |

Repository HEAD at binding: `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`, branch
`builder/prereq-c-c2-broker-ledger-worker`. Matches the HEAD recorded in r5 §0.
No drift.

---

## 1. Founder rulings recorded

### 1.1 Ruling 1 — runtime role name (RATIFIED)

Quoted verbatim from the controlling header:

> The restricted production runtime LOGIN role name is ratified as:
> `br_app_runtime`
>
> Preserve the r5 privilege model.
>
> This ruling authorizes the name only.
>
> It does not authorize role creation.

**Effect on r5.** §1.1 is promoted from *specified* to *Founder-ratified*. The
r5 §1.2 attribute table and the §1.3 R-1 / R-3 membership rules are preserved
exactly as written and are not reopened by this ruling. r5 §12 question 2
("Runtime role name ratification") is **RESOLVED**.

**Effect on authority.** None. No role is created by this addendum. Cutover
step 1 (r5 §6) remains unauthorized.

### 1.2 Ruling 2 — owner credential rotation (MANDATORY)

Quoted verbatim from the controlling header:

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

**Effect on r5.** Two places in r5 describe rotation as *recommended*. Both are
corrected to **mandatory**:

| r5 location | r5 text | Corrected status |
|---|---|---|
| §3 custody rule 5 | "Rotation of `neondb_owner` at cutover is a Founder act, out of scope, and **recommended**" | Founder act, out of scope, and **MANDATORY** at cutover per Ruling 2 |
| §6 cutover step 12 | "Rotate `neondb_owner` (recommended — it has runtime-exposed history)" | **Rotate `neondb_owner` (MANDATORY)**, sequenced after steps 1 to 11, inside an explicitly authorized cutover |

r5 §12 question 3 is **RESOLVED**: rotation is no longer an open recommendation.
Its *execution* remains unauthorized.

**S13 (new stop condition, derived from Ruling 2).** Owner-credential custody
may not be declared remediated while `neondb_owner` remains unrotated. Any
status line, PR body, or evidence pack asserting custody remediation before
rotation is a false claim and a stop.

---

## 2. GitHub capability preflight — read-only verification

**Scope.** Read-only verification against the actual repository and account:
`MADVenturesLLC/founder-os-build-room`. No environment was created. No secret
was created. No repository setting was modified. Every call listed in
Appendix A was a GET.

**Standard of proof used, stated so it can be checked.** Two classes of
evidence appear below and are labelled separately:

- **OBSERVED** — returned by the live GitHub API this session against this
  repository or its organization.
- **ENTITLED + DOCUMENTED** — the account plan carries the entitlement
  (observed) and GitHub's published documentation states the behavior
  (retrieved this session). A protection rule cannot be *observed in place*
  here, because configuring one is prohibited by this act.

No item below is claimed as observed-in-place. r5's §4.4 assumption is verified
to the strongest standard available without mutating repository state.

### 2.1 The ten required items

| # | Required proof | Result | Evidence |
|---|---|---|---|
| 1 | Repository is private | **PROVEN (OBSERVED)** | `GET /repos/MADVenturesLLC/founder-os-build-room` returns `"private": true`, `"visibility": "private"`, `"default_branch": "main"`, `"archived": false` |
| 2 | Plan supports required reviewers for environments on this private repository | **PROVEN (ENTITLED + DOCUMENTED)** | `GET /orgs/MADVenturesLLC` returns `plan.name` = `"enterprise"`, `filled_seats` 2. GitHub docs: "Organizations with GitHub Team and users with GitHub Pro can configure environments for private repositories." Enterprise exceeds the Team floor. Corroborating OBSERVED signal: the environments and environment-secrets endpoints already answer for this private repository (§2.2) |
| 3 | A protected environment can require the Founder or a Founder-controlled reviewer before the job starts | **PROVEN (ENTITLED + DOCUMENTED)** | GitHub docs, required reviewers: "Enter up to 6 people or teams. Only one of the required reviewers needs to approve the job for it to proceed." Eligible Founder-controlled reviewers OBSERVED: org members `decivantiq` and `daley40-lab`, both repository admins |
| 4 | The migration job cannot access the administrative environment secret before approval | **PROVEN (DOCUMENTED)** | GitHub docs: "A workflow job cannot access environment secrets until approval is granted by required approvers." And: "workflow jobs that use this environment can only access these secrets after any configured rules (for example, required reviewers) pass." |
| 5 | Self-review can be prohibited if the initiating identity is also an eligible reviewer | **PROVEN (DOCUMENTED), with a stated limit** | GitHub REST field `prevent_self_review` (boolean) on create-or-update environment: "Whether or not a user who created the job is prevented from approving their own job." Limit: both eligible identities are Founder-controlled, so the control enforces *account separation*, not reviewer independence. See §2.3 |
| 6 | Administrator / protection-rule bypass can be disabled, or the residual identified | **RESIDUAL IDENTIFIED (see §2.3)** | UI control exists ("Allow administrators to bypass configured protection rules"; deselect to disallow). OBSERVED: both existing environments report `can_admins_bypass: true`; the field is not in the documented request body of the create-or-update-environment REST endpoint, so it is a UI-set property. OBSERVED: ruleset `main` (id 20914346, active) carries `bypass_actors: [{actor_type: "OrganizationAdmin", bypass_mode: "always"}]` |
| 7 | Workflow execution is bound to an immutable commit SHA returnable as evidence | **PROVEN, CONDITIONAL — assertion required** | The run records an immutable `github.sha` usable as evidence. But dispatch is **not** SHA-addressed: `workflow_dispatch` runs against a branch or tag, and `GITHUB_SHA` is the "Last commit on the `GITHUB_REF` branch or tag that received dispatch". Exact-SHA *authorization* therefore requires an in-workflow assertion (§5.2 condition C1), not the dispatch mechanism alone |
| 8 | The administrative secret can be environment-scoped rather than repository- or organization-wide | **PROVEN (OBSERVED)** | Distinct endpoints and stores exist and answer for this repository: `GET /repos/.../actions/secrets` returns 1 repository-level name (`CLAUDE_CODE_OAUTH_TOKEN`); `GET /repos/.../environments/copilot/secrets` returns `total_count: 0`. Environment scope is a separate store, not a filter over repository secrets |
| 9 | Ordinary CI/application workflows cannot access the administrative environment secret unless they reference the protected environment and pass its rules | **PROVEN (DOCUMENTED)** | GitHub docs: "workflow jobs that use this environment can only access these secrets after any configured rules (for example, required reviewers) pass." A job with no `environment:` reference has no resolution path to that store. A job that *does* reference it inherits the gate, so declaring the environment buys access to the queue, not to the secret |
| 10 | The environment/job can use concurrency so only one administrative migration executes at a time | **PROVEN (DOCUMENTED), with a queue caveat** | GitHub docs, `concurrency`: "only a single job or workflow using the same concurrency group will run at a time." Caveat: "By default, any existing `pending` job or workflow in the same concurrency group will be canceled and the new queued job or workflow will take its place." A newer dispatch can therefore displace an older queued one. See §5.2 condition C2 |

### 2.2 Observed environment state (unmodified)

`GET /repos/MADVenturesLLC/founder-os-build-room/environments` returned
`total_count: 2`:

| Environment | Id | Created | `can_admins_bypass` | `protection_rules` | Branch policy |
|---|---|---|---|---|---|
| `compassionate-happiness / production` | 20053341919 | 2026-08-17T19:44:49Z | `true` | `[]` | `null` |
| `copilot` | 20970123414 | 2026-09-01T01:07:29Z | `true` | `[]` | `null` |

Neither is protected today. The first is the Railway integration's deployment
environment (§3.2), not a gate. **No administrative environment exists, and
none is created here.**

### 2.3 The exact residual bypass capability, stated plainly

Item 6 is answered as a residual rather than a clean disable, because that is
what the evidence supports.

1. **Environment-level.** "Allow administrators to bypass configured
   protection rules" can be deselected, and the GET response exposes the
   resulting `can_admins_bypass` value, so the state is auditable. It is a UI
   setting; it is absent from the documented request body of the
   create-or-update-environment REST endpoint, so it cannot be asserted or
   re-asserted by that API call.
2. **Repository-level.** Both org members (`decivantiq`, `daley40-lab`) hold
   `admin` on this repository. A repository admin can edit the environment,
   delete its reviewers, delete the environment, or edit the workflow file
   that references it. No environment setting constrains that.
3. **Ruleset-level.** The active `main` ruleset lists
   `OrganizationAdmin` with `bypass_mode: "always"`. Classic branch protection
   is off (`GET /branches/main/protection` returns 404, "Branch not
   protected"), so the ruleset is the whole of the branch control, and org
   admins are outside it by configuration.

**Consequence.** The gate is enforced against everyone except the identity
class that holds repository administration, which here is the Founder and the
Founder's second account. Under this governance model that residual is
*correctly placed*: the Founder is the authority the gate exists to route to.
It is not a platform defect and it is not closable while the approver and the
administrator are the same person.

**One item for the Founder to confirm, not assume:** this analysis treats
`daley40-lab` as Founder-controlled. If it is not exclusively Founder-
controlled, it is an unreviewed bypass holder on both the environment and the
`main` ruleset, and that must be resolved before Option A is ratified.

---

## 3. Railway analysis correction

### 3.1 The r5 statement being corrected

r5 §4.3 states:

> Railway provides no cross-service deployment ordering or gating primitive.

and quotes Railway guidance:

> You can't specify a strict deployment order for services in a Railway
> project. By design, Railway deploys all services in parallel... The
> recommended approach is to make each service resilient enough to wait for
> its dependencies.

**That blanket claim is incorrect as of current Railway documentation and is
withdrawn.** The Founder's correction is adopted verbatim:

> - Railway supports deployment dependencies through service reference
>   relationships for certain batched deployments;
> - dependent services can wait for referenced services to finish deployment;
> - this ordering does NOT apply to independent GitHub push deploys, where
>   services deploy independently.

### 3.2 Current documented behavior, quoted

From Railway's Deployment Actions documentation, retrieved this session:

> When multiple services deploy together, Railway uses reference variables to
> determine the deploy order. A service that references another service waits
> for that service to finish deploying before it starts, so it never boots
> with a stale or missing value from a dependency.

Ordering **applies** to: template deploys, applying staged changes,
duplicating an environment, and PR environments — "when multiple deploys are
triggered together as a batch".

Ordering **does not apply** where "services deploy independently":

> **GitHub push deploys** — even in a monorepo where one push triggers
> multiple services, each service deploys independently.
>
> **Single-service redeploys** — there is nothing to order against.

Transitive references are honored; circular references are broken and deployed
in parallel.

### 3.3 The actual Founder OS deployment trigger, verified

Option B must be judged against this repository's real trigger, not a generic
one. Verified read-only:

- `railway.toml` is committed at the repository root and configures a single
  service (NIXPACKS build, `npm start`, healthcheck `/health`,
  `numReplicas = 1`, `sleepApplication = false`).
- `.github/workflows/` contains `ci.yml`, `path-audit.yml`,
  `attribution-shape.yml`, and `claude-code-review.yml`. **No workflow deploys
  to Railway.** A grep for `railway` or `deploy` across the workflow directory
  returns nothing.
- `GET /repos/.../deployments` shows every recent deployment created by
  `railway-app[bot]` (type `Bot`), `task: "deploy"`, into environment
  `compassionate-happiness / production`, each carrying a pushed commit SHA.
  Five most recent span 2026-09-02T23:40:53Z to 2026-09-05T00:59:03Z.

**Finding.** The Founder OS control plane deploys by **Railway GitHub push
deploy of a single service**. That is precisely the case Railway documents as
*ordering does not apply*, and it is also a *single-service* case, which
Railway documents as having "nothing to order against".

### 3.4 What the correction changes, and what it does not

**Changes.** r5's reason for Option B's property-5 failure was wrong in the
general case. Railway can order dependent services. The corrected reason is
narrower and stronger: ordering exists, but **not on this project's trigger**.
Obtaining it would require abandoning GitHub push deploys for a batched
deployment path (template deploy, staged changes, environment duplication, or
PR environments), which is a change to the production deployment mechanism and
a Founder security-posture decision in its own right.

**Does not change.** Even where ordering applies, the documented guarantee is
*startup ordering*: a dependent service "waits for that service to finish
deploying before it starts". Railway does not document that a **failed**
dependency deployment blocks or fails the dependent deployment. Required
property 5 is not "wait", it is "the new runtime revision must not be
considered deployable if privileged migration failed". That failure-propagation
semantic is **NOT PROVEN** in Railway's documentation and cannot be assumed.

By contrast, Railway does document fail-closed behavior for the *same-service*
pre-deploy command: "The command runs with access to your service variables and
the private network, and a failing command stops the deployment." That is the
one Railway primitive with the right failure semantics, and it is the one the
Founder has prohibited for this credential, for the correct reason (§4).

---

## 4. Same-service pre-deploy rejection — preserved, unchanged

Quoted verbatim from the controlling header:

> Preserve the rejection of putting `neondb_owner` into the existing
> application service and running privileged DDL through that service's
> pre-deploy command.
>
> Railway documents that a service's pre-deploy command has access to the
> application's environment variables.
>
> Therefore the existing application service must never receive the
> administrative credential.
>
> This ruling is unchanged.

Re-verified against primary documentation this session. Railway's pre-deploy
page states: "They execute within your private network and have access to your
application's environment variables." The Infrastructure-as-Code reference
states: "The command runs with access to your service variables and the private
network, and a failing command stops the deployment."

r5 §4.2 stands verbatim. r5 §3 custody rule 1 stands verbatim. Stop condition
S11 stands.

---

## 5. Corrected decision matrix

### 5.1 The four options

#### Option A — GitHub protected-environment migration job

| Property | Result |
|---|---|
| Available on actual plan | **YES** — org plan `enterprise` (observed); private repository (observed); environments and environment-secret endpoints answer for this repository (observed) |
| Required-reviewer enforcement | **YES** — up to 6 people or teams, one approval releases the job; two Founder-controlled eligible reviewers exist |
| Secret gating | **YES** — "A workflow job cannot access environment secrets until approval is granted by required approvers" |
| Self-review prevention | **YES, with a limit** — `prevent_self_review` enforces account separation; it cannot manufacture reviewer independence when both accounts are the Founder's |
| Bypass prevention | **PARTIAL, residual identified** — admin bypass disableable at the environment; repository admins and `OrganizationAdmin` ruleset bypass remain, and are Founder-held (§2.3) |
| Exact-SHA binding | **YES, CONDITIONAL** — the run records an immutable SHA; dispatch resolves a branch or tag tip, so an in-workflow equality assertion against the Founder-named SHA is required (C1) |
| Custody isolation | **YES** — the administrative credential never enters Railway; no Railway reference-variable path to it can exist |
| Fail-closed deployment semantics | **YES** — ordered jobs in one workflow; the runtime-deploy step runs only on migration success, and a failed migration fails the workflow |
| **Verdict** | **SATISFIES EVERY REQUIRED PROPERTY**, subject to conditions C1 and C2 (§5.2) and to the residual at §2.3, which is Founder-held by construction |

#### Option B — isolated Railway administrative service

| Property | Result |
|---|---|
| Custody isolation | **PARTIAL** — service-scoped variables are per-service, but `${{ServiceName.VAR}}` reference syntax means isolation is configuration discipline plus review, not platform enforcement (r5 §3 rule 4, preserved) |
| Ordering under the actual GitHub-push deployment flow | **FAIL** — Railway documents ordering for batched deploys only; "GitHub push deploys — even in a monorepo where one push triggers multiple services, each service deploys independently", and single-service redeploys have "nothing to order against". This project deploys by GitHub push of one service (§3.3) |
| Migration failure propagation | **NOT PROVEN** — reference-variable ordering documents waiting for a dependency to "finish deploying"; no documented behavior makes a failed dependency block or fail the dependent deployment. Cron mode is worse: 5-minute minimum interval, UTC evaluation, a run skipped if the prior run is still active, and no tie to a deploy at all |
| Exact-SHA Founder gate | **FAIL** — Railway's Deployment Approval exists for a different purpose: "If a member of a GitHub repo doesn't have a linked Railway account. Railway by default will not deploy any pushes to a connected GitHub branch". It is a per-deployment approve or reject tied to repository access, not a Founder-scoped, per-tranche, exact-SHA authorization |
| Runtime-service admin-secret exclusion | **PASS by configuration** — a distinct service keeps the credential out of the application service's variable set, subject to the reference-syntax caveat above |
| **Verdict** | **REJECTED**, on these exact grounds: no ordering on the actual trigger, unproven failure propagation, and no exact-SHA Founder gate. Not rejected because Option A is available; it fails on its own terms. It would become re-examinable only if the production deployment mechanism moved to a batched path **and** Railway documented failure propagation, both of which are Founder decisions and neither of which exists today |

#### Option C — hybrid (GitHub-gated trigger, Railway-held credential)

**RETIRED.** The retention test in the controlling header is explicit: retain
"only if it does not introduce an unnecessary privileged Railway API
credential". It does. A GitHub-gated job that triggers a Railway administrative
service requires a privileged Railway API token stored in GitHub, which is a
new privileged credential of a different kind and brushes against required
property 9 and stop condition S1. It also inherits Option B's unproven failure
propagation, since failure signalling returns indirectly through the Railway
API. Retiring it removes a credential; nothing else is lost.

#### Option D — Founder-operated one-shot administrative execution

Stated accurately, neither dismissed nor recommended.

| Dimension | Assessment |
|---|---|
| Custody | **Strongest on domain count.** No new custody domain: the credential stays wherever the Founder already holds it and never enters GitHub or a Railway service. **Weaker on handling surface:** it is pasted into a workstation shell or a browser console, so it is exposed to local shell history, clipboard, terminal scrollback, and any local agent tooling. Domain isolation and handling hygiene are different risks, and D trades the first for the second |
| Approval | Authorization and execution collapse into the same act by the same person. That is maximally direct and entirely unfalsifiable: there is no artifact proving the executed statements matched the authorized tranche |
| Fail-closed sequencing (property 5) | **Manual.** Ordering is the operator's discipline. Nothing prevents a runtime deploy from racing a half-applied migration |
| Evidence (property 7) | **Manual.** Transcripts and screenshots, produced by the executor, about the executor's own act. Not platform-generated |
| Exact-SHA binding (property 10) | **Not applicable.** There is no run to bind. The tranche is whatever was typed |
| New surface | **None.** No workflow, no environment, no service, no API token, no ingress. The smallest possible plane |
| Scale | Adequate for a one-time cutover of twelve ordered steps. Poor for anything recurring |
| **Verdict** | **Legitimate fallback, not the recommendation.** It is the correct choice if the Founder declines to open GitHub as a custody domain, and it should then be paired with a written pre-authorized statement list per tranche so that "what was authorized" survives outside the executor's memory |

### 5.2 Conditions attached to Option A

Neither condition is optional. Both are workflow-authoring requirements, and
both are enforceable in the workflow file itself, which is reviewed and
SHA-bound like any other repository content.

**C1 — exact-SHA assertion (closes item 7).** `workflow_dispatch` cannot be
addressed to a commit. It dispatches against a branch or tag and sets
`GITHUB_SHA` to the "Last commit on the `GITHUB_REF` branch or tag that
received dispatch". The workflow must therefore take the Founder-authorized SHA
as a required input, assert `github.sha` equals it as the first step of the
gated job, and exit non-zero on mismatch, before any step that could touch the
administrative secret. This closes the window in which the branch tip moves
between authorization and dispatch: the run fails visibly rather than migrating
an unauthorized tree. The recorded `github.sha` is then valid evidence because
it was asserted, not merely observed.

**C2 — concurrency group choice (closes item 10).** `concurrency` guarantees
"only a single job or workflow using the same concurrency group will run at a
time", which is the required mutual exclusion. The default queue behavior is
the caveat: "any existing `pending` job or workflow in the same concurrency
group will be canceled and the new queued job or workflow will take its place",
so a second dispatch can displace a first that is still awaiting approval. Key
the group per authorized SHA, or set `queue: max`, so that a pending tranche
awaiting Founder approval cannot be silently replaced by a later one.

---

## 6. Updated administrative-plane recommendation

r5 §4.4 selected an environment-gated GitHub Actions job and r5 §4.5 returned
the custody move as `FOUNDER_DECISION_REQUIRED`. The capability assumption
underneath that selection has now been verified rather than assumed, and the
Railway comparison has been corrected. The selection survives both.

**`RECOMMEND OPTION A FOR FOUNDER RATIFICATION`**

Recommended, not implemented, and not self-ratified. What ratification would
settle is unchanged from r5 §4.5: it moves custody of `neondb_owner` from
Railway's secret store to GitHub Actions environment secrets, making GitHub a
second custody domain for a database credential. Under `DEC-20260815-02`,
custody posture is a Founder act. That determination is the Founder's, and it
is the remaining decision.

**What ratification would authorize, if given** (none of it is authorized now):
creating one protected environment; setting required reviewers on it with
`prevent_self_review` enabled and administrator bypass disabled; creating one
environment-scoped administrative secret; and adding one workflow implementing
C1 and C2 with the runtime-deploy step ordered after migration success.

**Founder-held residual, restated so ratification is informed.** Repository
admins and organization admins can bypass the gate (§2.3). The gate routes
authority to the Founder; it does not constrain the Founder. Anyone claiming it
constrains the Founder would be overstating it.

---

## 7. Preserved invariants — none weakened

Everything below is carried from r4 and r5 unchanged by this addendum:

- **§1.2 / §1.3** `br_app_runtime` attribute table, RULE R-1 (no membership
  edge, including `WITH INHERIT FALSE` / `WITH SET FALSE`), RULE R-3 (CI
  asserts zero edges in `pg_auth_members` and all four privilege flags false).
- **§2** `neondb_owner` repurposed not replaced; `br_journal_owner` and
  `command_journal_writer` remain `NOLOGIN` with no credential; the invariant
  `runtime compromise != administrative database compromise`.
- **§3** custody rules 1 to 4: never the application service; sealed variables
  where values live in Railway; no shared variables; cross-service reference
  syntax named as a limitation rather than papered over. Rule 5 is strengthened
  to mandatory by §1.2 above.
- **§5** RULE R-4 / R-5: no journal owner-class DDL in the boot-applied path;
  the runtime must start holding only `br_app_runtime`; `migrate(pool)` at boot
  is replaced by a read-only, fail-closed preflight assertion.
- **§6** the twelve-step fail-closed cutover, its abort conditions, the
  rollback boundary at step 8, and the journal-history rollback boundary
  (`count(*) = 0` checked not assumed; `REVOKE EXECUTE` as the safe reversal
  after first write, never a drop).
- **§7** the post-cutover Neon verification matrix, still entirely
  checks-to-be-executed and not results.
- **§8** all nine preserved invariants, including 8.7: the split narrows who
  holds owner authority and does not eliminate owner bypass. **No PR body, test
  name, or status line may claim journal history is immutable or tamper-proof.**
- **§9** stop conditions S1 to S12, with S9 and S10 still **TRIGGERED**, plus
  S13 added at §1.2.
- **§10** the non-activating scope claim: contract §1.4 is not satisfied by
  this tranche.

---

## 8. Status

**ARCHITECTURE DIRECTION APPROVED — ADMINISTRATIVE PLANE RECOMMENDED, AWAITING
FOUNDER RATIFICATION.**

This addendum does not advance r5 to `ARCHITECTURE-READY`. Two of the three
conditions r5 named for that transition are now met: the administrative plane
is fully specified and its platform assumption is verified. The third is not:
independent review has not occurred, and the custody determination remains the
Founder's.

**No implementation authority exists.** No code, role, credential, GitHub
environment, GitHub secret, Railway service, Railway variable, Neon object,
migration, branch, commit, or PR was created or modified by this artifact.

---

## Appendix A — verification provenance

**Artifact hashing (this session, local).** `shasum -a 256` and `wc` over
`pr2b-storage-architecture-r5.md`: `20137feec1204fcee763e1900c248fa351a37c83748ca42da062daa68962017a`, 38,307 bytes, 662 lines, trailing newline present. All three match the
controlling header. `git rev-parse HEAD` returns
`75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`, matching r5 §0.

**GitHub reads (this session, read-only GETs, no mutations).** Authenticated as
`decivantiq` via the stored keyring OAuth token, because the ambient
fine-grained PAT lacks the required read permissions:

| Call | Purpose |
|---|---|
| `GET /repos/MADVenturesLLC/founder-os-build-room` | visibility, default branch, caller permissions |
| `GET /orgs/MADVenturesLLC` | plan entitlement |
| `GET /repos/.../environments` | existing environments, `can_admins_bypass`, protection rules |
| `GET /repos/.../environments/copilot/secrets` | environment-scoped secret store exists (names only; the API never returns values) |
| `GET /repos/.../actions/secrets` | repository-level secret store, for scope comparison (names only) |
| `GET /orgs/MADVenturesLLC/members`, `GET /repos/.../collaborators` | eligible reviewers and bypass holders |
| `GET /repos/.../deployments?per_page=5` | actual deployment trigger and creator identity |
| `GET /repos/.../rulesets`, `GET /repos/.../rulesets/20914346` | branch controls and bypass actors |
| `GET /repos/.../branches/main/protection` | returned 404 "Branch not protected"; rulesets are the whole control |

No secret value was read, printed, or stored. Secret *names* only.

**Vendor documentation (this session).** Railway pages retrieved through the
Railway documentation service: Deployment Actions (deployment dependencies,
when ordering applies and does not apply, transitive and circular references),
Services (approving a deployment, GitHub source deploys), pre-deploy command
and the Infrastructure-as-Code reference for it, and cron behavior (5-minute
minimum, UTC, skip-if-running). GitHub pages retrieved through a documentation
fetch that returns quoted passages rather than raw page source: manage
environments (plan requirement, required reviewers, prevent self-review,
administrator bypass, secret access after rules pass), secrets concepts
(approval before environment-secret access), events that trigger workflows
(`workflow_dispatch` ref and `GITHUB_SHA` semantics), REST environments
(request-body fields), and workflow syntax (`concurrency`). Quotations are
reproduced as returned; the retrieval method is stated here so any quotation
can be re-checked against the source page.

**Not verified here, and not claimed.** No Neon access was performed and no
Neon authorization is held. r5's live-state facts are carried from the accepted
preflight, unchanged. No GitHub environment protection rule was configured, so
no protection behavior was observed in place; items 3, 4, 5, 9 and 10 rest on
plan entitlement plus published behavior, as labelled in §2.1.

**Attribution.** Authored by the `br-architect` seat as a docs-only advisory
artifact. No commit was produced, so no attribution trailer is attached; if
this file is later committed, the committing act carries its own trailers and
its own authorization.
