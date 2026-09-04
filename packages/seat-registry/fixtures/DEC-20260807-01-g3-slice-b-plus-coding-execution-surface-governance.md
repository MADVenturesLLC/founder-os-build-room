---
title: DEC-20260807-01 — G3 Slice B+ Coding Execution Surface Governance and Multi-Surface Builder Pilot
type: decision
owner: founder
company: mad-ventures
product: mad-ventures-os
status: active
created: 2026-08-07
updated: 2026-08-07
version: 0.3
review_cycle: on-change
source_of_truth: true
related_decisions:
  - DEC-20260715-11-canonical-serialization-authority
  - DEC-20260715-17-stable-roles-and-replaceable-execution-architecture
  - DEC-20260716-01-data-boundary-policy
  - DEC-20260716-02-model-portfolio-and-routing-strategy
  - DEC-20260717-03-durable-evidence-store-provider
  - DEC-20260718-04-founder-voice-merge-authorization
  - DEC-20260718-05-g3-slice-a-role-attribution-handoff-taxonomy
  - DEC-20260719-02-independent-reviewer-two-tier-binding
  - DEC-20260730-01-agent-isolation-act-time-logging-schedule-gates
  - DEC-20260801-02-founder-authorization-handoff-readiness
related_workflows:
  - wf-11-agent-handoff
  - wf-13-code-review
used_by:
  - founder
  - builder
  - architect
  - strategist
  - independent-reviewer
read_by:
  - all-active-roles
written_by:
  - builder
tags:
  - decision
  - proposed
  - governance
  - g3
  - g3-slice-b-plus
  - coding-execution-surface
  - routing
  - task-isolation
  - multi-surface-pilot
  - mp-1
---

# DEC-20260807-01: G3 Slice B+ Coding Execution Surface Governance and Multi-Surface Builder Pilot

> **Ratified. This decision authorizes the governed implementation package and
> controlled pilot defined below.** MP-1 activation remains a separate, later
> Founder ruling after implementation, pilot evidence, and exact-SHA
> independent review of the release manifest — nothing here activates MP-1,
> retires the Temporary Task-Assignment Policy, or grants unbounded
> repository, data, merge, or production authority.

## Founder ratification (2026-08-07)

> I, Michael Daley, Founder, ratify DEC-20260807-01 — G3 Slice B+ Coding
> Execution Surface Governance and Multi-Surface Builder Pilot — at the exact
> reviewed proposal head SHA `58ca6366297fa372308aa295db11f64769ff8fdd`,
> whose content was verified as identical to canonical main merge commit
> `60257dd0bf21277e38abdc0d5ad3ac9d9d42f2a2`.
>
> I direct DEC-20260807-01 and its ratified companion artifacts to become
> active and authoritative. This ratification authorizes the governed
> implementation package and controlled pilot defined by the decision.
>
> This ratification does not activate MP-1, retire the Temporary
> Task-Assignment Policy, authorize repository-wide model routing, authorize
> production migrations or deployment, or grant any unbounded repository,
> data, merge, or production authority. MP-1 remains approved but inactive,
> and the Temporary Task-Assignment Policy remains controlling until a later,
> separate Founder activation ruling is issued against the exact reviewed
> implementation release manifest.
>
> No clause of the reviewed proposal is amended by this ratification.

Exact reviewed PR head `58ca6366297fa372308aa295db11f64769ff8fdd` and the
`main` merge commit `60257dd0bf21277e38abdc0d5ad3ac9d9d42f2a2` carry identical
file content — content-verified, not the same commit. Neither SHA is
described as the other; both are recorded here for exact-SHA traceability.

**Disposition:** every clause of the reviewed proposal ratifies as drafted.
No clause is amended by this ratification.

## Decision-ID allocation record

Canonical identifier `DEC-20260807-01` was allocated on 2026-08-07 under
`/01-constitution/decision-rules.md` §13 after a clean five-source search:

1. **Current working artifact:** zero prior hits for `DEC-20260807-01`.
2. **Committed repository history:** GitHub commit search returned zero hits.
3. **All remote branch trees:** all 78 remote branches were enumerated; 77
   non-`main` branches were compared to `main`; zero paths claimed the ID
   and every comparison completed without error.
4. **Canonical decision log:** zero hits at source SHA
   `7bfe4d60550c1fcce6dff546091813710b642b06`.
5. **Active reservation registry:** zero hits at source SHA
   `c788608ad1243ca050e860b568d84c63618dafee`.

The identifier was allocated on branch `agent/g3-slice-b-plus-draft-v0-2`
(PR #211, superseded as delivery vehicle after its commits failed the
attribution gate). The identifier remains consumed by this same canonical
proposed artifact, now carried by the compliant reconstruction branch; no
new identifier was allocated. The matching reservation and decision-log
entries are part of the same proposal package.

## Purpose

Complete the governance remainder that
`DEC-20260718-05` names **G3 Slice B+**: coding-surface routing enforcement,
task isolation, repository permission matrices, validation, production
approval gates, collision protection, model-selection recording, failure
behavior, and the controlled multi-surface Builder pilot.

This proposal adopts **layered native enforcement with gateway-ready
contracts**. FounderOS doctrine remains canonical authority. Repository
instructions, CLI configuration, plugins, hooks, adapters, CI checks, and
GitHub protections are enforcement projections. They may narrow or enforce
authority; they may never create or expand it.

## Context and evidence base

This proposal is the result of a seven-section Founder-reviewed design process
completed on 2026-08-06. The review resolved, before drafting:

- the required `G3 Slice B+` name and complete deferred-remainder scope;
- separation of the Coding Governance Execution Record from the existing
  canonical execution envelope;
- explicit registration work for `antigravity` and `hermes-local-code`;
- reference-not-restate handling for existing authority;
- stable-role-only vocabulary;
- MP-1 activation and Temporary Task-Assignment Policy retirement;
- the restricted-local-model/no-cloud deadlock;
- failure recovery transitions;
- Neon as the durable operational evidence store;
- exact registered execution-surface IDs; and
- positive and negative pilot coverage for the Founder local-only exception.

The full session review trail is preserved as migration evidence in the
superseded PR #211 draft history and review record (retained, not deleted).
It is evidence of design review, not a substitute for exact-SHA Tier-2
review or the Founder ruling.

---

## Decision

### 1. Scope, status, and authority boundary

1. G3 Slice B+ covers the complete deferred remainder identified by
   `DEC-20260718-05`, including the controlled multi-surface Builder pilot.
2. FounderOS doctrine and its active registries remain the source of authority.
   This proposal does not create a parallel policy registry.
3. The G3 Slice B+ policy reference and enforcement index MUST reference,
   rather than restate as independent authority:
   - model portfolio and routing authority under `DEC-20260716-02` / MP-1;
   - stable role IDs under `DEC-20260715-17` and the active role registry;
   - Tier-1/Tier-2 review binding under `DEC-20260719-02`;
   - execution-surface identity under
     `/04-agents/execution-surface-registry.md`;
   - data boundaries under `DEC-20260716-01`;
   - canonical approval binding and `effectKey` serialization under
     `DEC-20260715-11`; and
   - Founder-only merge-authorization rules under `DEC-20260718-04` and
     `DEC-20260801-02`.
4. Thin surface adapters MUST implement a common versioned contract so they
   can later point to a central governance gateway without changing role,
   policy, evidence, or authorization semantics.
5. A future central governance gateway and the paused MADVentures_OS
   Build Room are explicitly outside this decision's implementation scope.
6. This proposal does not authorize general multi-agent runtime orchestration,
   autonomous production deployment, or replacement of vendor CLI behavior.

### 2. Coding Governance Execution Record and canonical approval binding

1. G3 Slice B+ introduces a separate **Coding Governance Execution Record**.
   It is not called an execution envelope and does not redefine, extend, or
   alter `/00-system/canonical-execution-envelope-serialization-v1.0.md`.
2. Each governed coding execution MUST record at least:
   - task ID and authorization reference;
   - parent and child execution IDs, when applicable;
   - assigned stable role;
   - registered execution-surface ID;
   - exact model/provider identifier and effort or reasoning level;
   - work-size classification;
   - Tier-1/Tier-2 review binding and applicable trigger(s);
   - repository, branch, worktree, and ownership state;
   - allowed read, write, execution, command, data, and egress scope;
   - base/head SHA or captured uncommitted diff fingerprint;
   - verification results, review verdicts, material findings, and outcome;
   - handoff manifests and ownership transfers; and
   - linked canonical-envelope reference and `effectKey` where an
     approval-bound external effect exists.
3. Coding Governance Execution Records are durable operational evidence and
   MUST persist in the **Neon durable evidence store** under
   `DEC-20260717-03`. Supabase remains Console identity/auth only and MUST NOT
   become the durable store for these records.
4. Raw prompts, transcripts, source files, credentials, and secrets MUST NOT
   be copied into durable evidence by default. Sanitized transcript evidence
   may be promoted only when required for Tier-2 review, security review,
   incident handling, or an explicit Founder direction.
5. Merge, deployment, migration, destructive, and production actions continue
   to use the existing canonical execution envelope and `effectKey` machinery.
6. The exact committed head SHA MUST be part of the approval-bound merge
   effect. Any subsequent commit changes the approved effect and invalidates
   the prior review and Founder authorization.

### 3. Execution-surface registrations and model-selection amendments

#### 3.1 Registry additions

The ratification package MUST amend
`/04-agents/execution-surface-registry.md` to register:

##### `antigravity`

- Identity: Founder-operated interactive coding and review surface.
- Permitted stable roles: `builder`, `architect`, `independent-reviewer`.
- Model rule: the Founder may manually select a Gemini model available inside
  `antigravity` for a named task; that exact manual selection is the
  task-scoped approval for the model used in that execution.
- Required evidence: exact model, provider, effort, role, task, repository,
  worktree, and code-state binding.
- Prohibitions: automatic or silent switching; self-review; default autonomous
  routing; merge; deployment; production operation.
- Non-Gemini models exposed by the application receive no authority merely
  because the UI lists them. Their separate model and provider rules govern.

##### `hermes-local-code`

- Identity: model-independent local coding surface, distinct from
  `local-runtime`, the frozen `hermes` capability, and any individual local
  model record.
- Permitted stable role: `builder` only.
- Current proposed model selection: `deepseek-v4-flash`, self-hosted.
- Historical model handling: `hermes-4-14b` remains historical/restricted and
  is not renamed into the surface.
- Only registered, Founder-approved local models may write or execute governed
  work through this surface. The actual model MUST be recorded each time.
- Read-only path audits and technical analysis are `builder` activities. The
  `researcher` role is deliberately excluded because its registered lane is
  public-information and market-signal research, not repository analysis.

#### 3.2 Existing surface IDs retained

The existing `claude-code`, `cursor`, `codex`, and `grok-build` registrations
remain. This decision does not replace them. Informal labels such as Claude,
Grok, Hermes, Gemini, or Cursor MUST NOT substitute for the registered surface
ID in governed records.

#### 3.3 Roles permitted to execute via each coding surface

| Registered surface ID | Stable roles permitted to execute via the surface |
|---|---|
| `claude-code` | `builder`, `architect`, `strategist`, `independent-reviewer` |
| `grok-build` | `builder`, `independent-reviewer` |
| `codex` | `builder`, `architect`, `strategist`, `independent-reviewer` |
| `cursor` | `builder`, `architect`, `independent-reviewer` |
| `antigravity` | `builder`, `architect`, `independent-reviewer` |
| `hermes-local-code` | `builder` |

These are permissions, not permanent surface-role bindings. Each execution
receives exactly one accountable stable role. Plugin coordination is a surface
capability represented by parent/child executions, not a `coordinator` role.
Planning occurs under `architect` or `strategist`. Governed independent review
occurs under `independent-reviewer`. Integration is a task assignment held by
`builder`, not a new `integrator` role.

#### 3.4 Authoritative routing amendments

The ratifying package MUST amend the authoritative model-routing and model
registry artifacts rather than copy an independent route table into the G3
enforcement index. The approved amendment schedule is:

- Large implementation: `grok-build` with `grok-4.5` is the governed primary
  Builder. `claude-code` with `sonnet-5` is the fallback only when the Grok
  data boundary cannot be satisfied.
- Medium implementation: `claude-code` with `opus-4.7`.
- Light implementation: `claude-code` with the existing registered model ID
  `claude-haiku-4-5`. No duplicate shorthand entry is created.
- `codex` approved models: `gpt-5.6-sol` and `gpt-5.6-terra`; actual model and
  reasoning effort recorded. `gpt-5.6-sol` high supports complex analysis,
  planning, and surgical fixes; xhigh supports Tier-2/high-risk and fallback
  implementation; max requires exact Founder authorization and a recorded
  reason. `gpt-5.6-terra` high supports routine verification and bounded fixes.
- `cursor` Founder-approved allowlist: `grok-4.5` primary,
  `sonnet-5` alternative, and `glm-5.2` as a manually selected secondary
  Builder behind a verification gate. Cursor Auto is prohibited. This surface
  binding does not replace any runtime `glm-5.2` record. Under the existing
  P3/Z.ai channel approval, `glm-5.2` is limited to public-class and
  ordinary-internal work. Governance/doctrine repository work,
  confidential-or-higher material, secrets, credentials, personal data, and
  production data are prohibited. A task outside that boundary MUST route to
  another approved Builder; neither Cursor availability nor FounderOS surface
  registration broadens the channel approval.
- `antigravity`: only a registered, provider-verified Gemini model ID carrying
  a model-registry entry may be manually selected and task-approved by the
  Founder; a Gemini model exposed by the application UI but absent from the
  model registry may not execute governed work. Exact model and effort are
  mandatory evidence. No Auto or silent switch is permitted. `gemini-3.6-flash` is the primary supplemental
  fast-review model and `gemini-3.5-flash` is its fallback; both are
  non-binding. The existing `gemini-3.1-pro` entry remains the Gemini model
  eligible to provide a binding Tier-2 verdict.
- `hermes-local-code`: current proposed model `deepseek-v4-flash`; other local
  models require registration and Founder approval before writes or execution.

The ratifying package MUST add model-registry entries for `opus-4.7`,
`gpt-5.6-sol`, `gpt-5.6-terra`, `deepseek-v4-flash`, `gemini-3.6-flash`, and
`gemini-3.5-flash` before those identifiers may satisfy an enforced route. Each
entry MUST record the externally verified provider SKU, provider evidence URL
and verification date, deployment channel, data-class boundary, and surface
availability. A registry row alone does not activate a route whose channel or
data-class approval remains unresolved.

External provider verification performed for this proposal on 2026-08-07:

| Proposed FounderOS model ID | Verified provider identifier | Provider evidence |
|---|---|---|
| `opus-4.7` | `claude-opus-4-7` | [Anthropic Claude Platform model-ID documentation](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions) |
| `gpt-5.6-sol` | `gpt-5.6-sol` | [OpenAI API model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-sol) |
| `gpt-5.6-terra` | `gpt-5.6-terra` | [OpenAI API model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-terra) |
| `deepseek-v4-flash` | `deepseek-v4-flash` | [DeepSeek API changelog/model documentation](https://api-docs.deepseek.com/updates/) |
| `gemini-3.6-flash` | `gemini-3.6-flash` | [Google Gemini model documentation](https://ai.google.dev/gemini-api/docs/latest-model) |
| `gemini-3.5-flash` | `gemini-3.5-flash` | [Google Gemini model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash) (model-specific page verified 2026-08-07; the computer-use page cited at first verification also lists it) |

These are additions, not silent replacements or retirements of existing
registered models. If the canonical proposal cannot preserve the verification
evidence or the target deployment channel exposes a different identifier, the
affected route remains inactive and the identifier MUST NOT be inferred.

Ratification of this decision does not activate `grok-build` / `grok-4.5`
routing. Until the later MP-1 activation ruling, Grok executes only inside
exact, auditable, task-scoped Founder-authorized tasks (including pilot
tasks), each authorization naming the repository, permitted data class,
scope, and expiration or completion boundary — and public-class work only
until the xAI deployment channel is verified and recorded under the active
data-boundary policy. Internal or private-repository code additionally
requires that explicit task-scoped Founder authorization in every case before
channel verification. Once channel verification is complete, standing use is limited to
the verified channel and approved data classes. Secrets, credentials,
production data, personal data, and confidential-or-higher material remain
excluded unless separately and exactly authorized by the Founder. Failure to
satisfy this boundary routes the task to `sonnet-5`; it does not alter Grok's
registered primary-Builder status.

No unavailable model, provider, surface, or effort level may be silently
substituted. A task pauses or uses an already approved alternative, with the
reason and replacement recorded.

### 4. Task classification, permissions, isolation, and handoffs

#### 4.1 Three separate classifications

Every governed task MUST keep separate:

1. **Work size:** light, medium, large, or multi-phase. This drives routing and
   implementation expectations.
2. **Review binding:** existing Tier 1 or Tier 2. This drives review obligations.
3. **Stable role:** an ID from the active role registry. This identifies the
   accountability target.

The Tier-2 trigger catalog may escalate a task but may never create a third
review tier or downgrade an existing obligation. Uncertain classification
defaults upward. Only the Founder may authorize a downgrade.

#### 4.2 Mandatory Tier-2 triggers

Tier-2 review is mandatory, regardless of change size, for work affecting:

- governance, doctrine, authority, approvals, or model permissions;
- authentication, authorization, secrets, privacy, or security boundaries;
- durable evidence, audit logic, billing, financial logic, or data-loss risk;
- database schemas, migrations, backups, or restoration;
- infrastructure, CI/CD, production configuration, or deployment behavior;
- cross-repository contracts or public APIs;
- autonomous execution, external transmission, scheduled jobs, or new tools;
- destructive or difficult-to-reverse operations; or
- major architecture or uncertain high-impact behavior.

#### 4.3 Repository and data permissions

Every execution MUST receive task-scoped repository, worktree, data-class,
command, and egress permissions. Plugin installation or surface availability
does not grant repository write authority.

`hermes-local-code` receives the following stricter boundary:

- solo work is allowed only for explicitly assigned Tier-1 changes in
  registered application repositories where no Tier-2 trigger applies, no
  sensitive data is involved, and the work is bounded and reversible;
- solo read and analysis of the FounderOS governance repository is allowed;
  doctrine or governance writes require an explicit Founder assignment and an
  eligible independent reviewer from another provider;
- Tier-2-triggering work in any repository may use `hermes-local-code` as an
  assigned `builder`, but never as the sole execution responsible for review;
- standing read is limited to registered FounderOS roots;
- writes are limited to the assigned repository/worktree;
- secrets, keys, production dumps, personal/HR/legal data, and unregistered
  directories require exact Founder approval; and
- external transmission is denied by default and requires task-scoped Founder
  authorization.

#### 4.4 Single-writer and governed-handoff rule

1. One active writer is permitted per worktree at any moment.
2. Sequential surface handoffs within the same worktree are allowed after the
   current code state and ownership transfer are recorded.
3. A transfer MUST record the prior and receiving executions, commit SHA,
   uncommitted diff fingerprint when applicable, file/context manifest, and
   timestamp.
4. Multiple read-only reviewers may inspect the same recorded code state.
5. Parallel Builders MUST use separate worktrees with explicit non-overlapping
   scopes. Integration is assigned to a `builder` execution.
6. A child execution receives equal or narrower authority than its parent.
   Parent/child status never imports undeclared permissions.
7. `claude-code`, `grok-build`, `codex`, `cursor`, `antigravity`, and
   `hermes-local-code` may share an authorized worktree and exchange
   task-scoped files, diffs, plans, sanitized context, and review results under
   these controls.

### 5. Review chain, post-review authority, and exact-SHA control

#### 5.1 Review chain

- Light code changes require deterministic checks and the binding Tier-1
  CodeRabbit review required by `DEC-20260719-02`. A task-approved
  `gemini-3.6-flash` execution may provide the primary supplemental fast
  review, with `gemini-3.5-flash` as fallback. Both are non-binding and cannot
  replace or independently satisfy the Tier-1 gate.
- Medium changes normally route to `opus-4.7` for building and an independent
  approved model for review.
- Large or Tier-2 changes normally route to `grok-4.5` as primary Builder,
  subject to the data-class controls in clause 3.4, or to `sonnet-5` when that
  boundary cannot be satisfied. The binding independent Tier-2 verdict must
  come from an exact model on the closed Tier-2 roster. This proposal adds
  `gpt-5.6-sol` to that roster while retaining the existing `gpt-5.6`,
  `gemini-3.1-pro`, `grok-4.5`, and `opus-4.8` entries. `gpt-5.6-terra` is
  limited to routine verification and bounded fixes and cannot satisfy Tier-2.
  Other Gemini models selected through `antigravity` may build or provide
  supplemental review but cannot satisfy Tier-2 until an explicit roster
  amendment names the exact model.
- After the binding Tier-2 verdict, an `opus-4.7` execution assigned the
  `architect` or `strategist` stable role may reconcile findings before
  Founder merge authority is requested. This reconciliation is not the
  binding Tier-2 verdict and does not replace Founder authority.
- Tier-2 independence requires a different execution and model/provider from
  the Builder. If `opus-4.7` authored the work, it cannot perform the
  post-review reconciliation for that code state.
- No execution may author and independently review the same code state.
- Reviews bind to an exact commit SHA. A working-tree review may bind to a
  captured diff fingerprint for iteration, but it cannot support merge
  authorization until the committed SHA is reviewed.

Post-review reconciliation occurs within `review-pending`, after the binding
Tier-2 verdict and before `Founder-authorization-pending`. An `opus-4.7`
execution assigned `architect` or `strategist` may read, reconcile, classify,
and disposition findings without changing the reviewed code state. This does
not restrict `opus-4.7` from coding: it remains an approved medium-work Builder.
If reconciliation requires code changes, a new `builder` execution—including
an eligible `opus-4.7` execution—may take ownership and return the task to
`active`. The resulting code state receives a new SHA, and the prior
verification, Tier-2 verdict, and authorization cannot transfer to it. Fresh
verification and exact-SHA review are mandatory.

#### 5.2 Post-review authority

Approved Builder executions may edit, test, commit, push, and open or update a
pull request on the assigned branch. No execution surface may:

- push directly to a protected branch;
- approve its own pull request;
- merge;
- modify branch protection;
- manually deploy;
- execute a production migration, destructive operation, or rollback; or
- waive a failed control.

Founder merge authorization MUST name the exact reviewed head SHA. A changed
SHA invalidates the review and authorization. Pre-approved CI/CD may deploy
after an authorized merge. Manual production deployment, migration,
destructive operation, and rollback require separate Founder authorization.

### 6. MP-1 enforcement, activation, and temporary-policy retirement

#### 6.1 Current authority remains unchanged during implementation

`DEC-20260716-02` / MP-1 remains `approved`, not `active`, while the
enforcement package and pilot are built. Its item 14 Temporary Task-Assignment
Policy remains the globally controlling assignment mechanism during that
period.

The controlled pilot may exercise candidate MP-1 enforcement only inside
exact Founder-authorized pilot tasks. It does not claim global MP-1 activation.

#### 6.2 Activation ladder

The only permitted transition is:

```text
MP-1 approved but inactive
→ enforcement implementation
→ controlled multi-surface Builder pilot
→ required verification and Neon evidence
→ exact-SHA independent Tier-2 review
→ explicit Founder activation ruling
→ MP-1 active
```

The ratified decision authorizes implementation and defines the activation
conditions. It does not itself satisfy them.

#### 6.3 Atomic policy transition

The later Founder activation ruling MUST:

1. identify the exact reviewed implementation SHA;
2. declare MP-1 routing enforcement active;
3. retire the Temporary Task-Assignment Policy at the same effective moment;
4. update the authoritative status/index artifacts in the activation package;
   and
5. record that no dual-governance window exists.

If routing enforcement later becomes unavailable, work fails closed. The
temporary policy does not silently reactivate. The Founder may issue a
task-specific manual assignment through the canonical approval machinery.

### 7. Restricted local models, clause-5 reconciliation, and local-only exception

#### 7.1 Clause-5 tightening

The ratifying package MUST explicitly amend or qualify
`DEC-20260719-02` clause 5 and the corresponding `agent-rules.md` text.

- The stricter rule applies to all restricted local models, including
  `hermes-4-14b`, `tencent-hy3`, and registered replacements.
- Restricted local models may provide paired, non-binding Tier-2 findings
  under the local/no-cloud requirement.
- A restricted local model operating through `hermes-local-code` cannot
  independently satisfy the sole Tier-2 `independent-reviewer` requirement.
- The `hermes-local-code` surface restriction controls executions through that
  surface.
- An eligible reviewer from another approved provider must issue the binding
  Tier-2 verdict unless the Founder uses the local-only exception below.

This tightening is intentional for `tencent-hy3` as well as Hermes-family or
replacement local models; it is not an implied side effect.

#### 7.2 No-cloud escape paths

For a Tier-2-triggering task with a hard no-cloud constraint:

1. local models may produce paired, non-binding findings;
2. if a sanitized evidence package can safely leave the local boundary, the
   Founder must explicitly approve that disclosure before an eligible cloud
   reviewer receives it;
3. if nothing can leave the local boundary, the task remains blocked unless
   the Founder grants a recorded **Founder local-only exception** through the
   canonical approval machinery; and
4. agents, roles, models, plugins, and surfaces cannot grant, broaden, reuse,
   or transfer that exception.

The local-only exception does not claim Tier-2 was satisfied. It records that
Tier-2 was unavailable, the no-cloud reason, the local findings, and the
Founder's explicit acceptance of that identified risk.

#### 7.3 Exception binding

A local-only exception applies to exactly one task, one repository, one exact
committed head SHA, one recorded permission scope, and one stated no-cloud
reason. Any later commit invalidates it. An uncommitted fingerprint may support
investigation but cannot authorize merge or become a standing waiver.

### 8. Fail-closed state machine, recovery, and evidence

#### 8.1 Lifecycle states

```text
proposed → classified → assigned → active
→ verification-pending → review-pending
→ Founder-authorization-pending → authorized
→ merged or closed
```

Within `review-pending`, post-review reconciliation may either preserve the
reviewed SHA and advance to `Founder-authorization-pending`, or require code
changes and return the task to `active`. It cannot change code and advance on
the prior SHA's review authority.

Failure states are:

- `verification-failed`
- `review-rejected`
- `stale-authorization`
- `interrupted`
- `blocked`
- `incident`

A crash, timeout, incomplete response, unavailable routing control, failed
test, unresolved blocking finding, missing evidence, secret-access violation,
unauthorized egress, or changed SHA cannot produce success.

#### 8.2 Recovery transitions

| Failure state | Only permitted recovery |
|---|---|
| `verification-failed` | Return to `active` under the assigned `builder`; rerun every affected check |
| `review-rejected` | Return to `active`; corrections create a new code state requiring fresh verification and review |
| `stale-authorization` | Return to `verification-pending`; prior review and Founder authorization are not reusable |
| `interrupted` | Reconcile partial repository state, record it, reacquire worktree ownership, then return to `active` |
| `blocked` | Resume only after the named prerequisite or authorization is satisfied |
| `incident` | Remain blocked through incident disposition; any resumed work receives a new execution record |

No failure state may transition directly to `authorized` or `merged`.
`closed` is reachable only from `merged` or `authorized` (direct-close
case), never from a failure state.

#### 8.3 Audit-evidence policy

Durable Neon evidence MUST retain task/execution identity, role, surface,
exact model/effort, repository/worktree, permissions, authorization references,
code-state binding, verification, review, handoff, exception, failure, and
outcome metadata. Complete raw transcripts and source content remain in native
CLI/local storage unless a sanitized promotion is required.

### 9. Controlled multi-surface Builder pilot and activation evidence

#### 9.1 Pilot boundaries

The pilot validates G3 Slice B+ controls; it is not a production deployment,
general orchestration runtime, central gateway, or Build Room implementation.
Pilot targets MUST be registered, low-risk repositories and exact
Founder-authorized tasks. No secrets, production migrations, destructive
operations, or manual deployments are in scope.

#### 9.2 Pilot stages

1. **Registry and contract validation:** resolve all six coding surfaces,
   stable-role permissions, model references, record schemas, and repository
   matrices without duplicate authority.
2. **Read-only surface validation:** each surface demonstrates governed access,
   exact-model recording, and data-boundary enforcement. The Grok control MUST
   prove that public-class access is allowed, unauthorized internal/private
   access is blocked before xAI channel verification, and an exact task-scoped
   Founder authorization permits only its recorded repository, data class,
   scope, and duration. The Cursor control MUST prove that `glm-5.2` is blocked
   from governance/doctrine and confidential-or-higher material while its
   public and ordinary-internal boundary remains available.
3. **Bounded write validation:** authorized Builder surfaces perform low-risk
   work in isolated branches/worktrees.
4. **Multi-surface handoff validation:** demonstrate sequential ownership
   transfer, code-state fingerprinting, and equal-or-narrower child authority.
5. **Independent-review validation:** an eligible non-authoring provider
   reviews an exact SHA; a correction changes the SHA and invalidates the prior
   verdict.
6. **Negative controls:** prove rejection of simultaneous writers, silent
   switching, unauthorized files/commands/egress, self-review, failed
   verification, stale SHA evidence, unauthorized merge/deploy, and any agent
   or surface attempt to grant or reuse a Founder exception.
7. **Local boundary and exception controls:** verify `hermes-local-code` as
   `builder` only; no-cloud behavior; one synthetic, non-production positive
   Founder local-only exception recorded through canonical approval, bound to
   an exact SHA, and persisted to Neon; and one sanitized-disclosure branch
   requiring explicit Founder approval before cloud review.
8. **Evidence and activation review:** verify complete execution, handoff,
   verification, review, failure, exception, authorization, and reconciliation
   evidence in Neon.

#### 9.3 Required implementation verification

The implementation package MUST include:

- contract and schema tests;
- adapter-parity tests;
- permission-matrix negative tests;
- worktree ownership and recovery tests;
- review-independence tests;
- exact-SHA invalidation tests;
- local-only exception positive and negative tests;
- sanitized-disclosure authorization tests;
- Neon persistence and reconciliation tests;
- GitHub branch-protection and CI-gate tests; and
- end-to-end pilot evidence.

An eligible, non-authoring Tier-2 reviewer MUST review the completed
implementation and pilot evidence against the exact implementation SHA.

#### 9.4 Activation blockers

MP-1 activation remains blocked unless all required controls pass, every
blocking finding is resolved, durable Neon evidence is complete, the temporary
policy retirement package is ready, and the Founder issues the exact-SHA
activation ruling. A failed pilot leaves MP-1 inactive and the Temporary
Task-Assignment Policy controlling.

### 10. Explicit deferrals and future Large Multi-Phase Assurance DEC

#### 10.1 G3 Slice B+ exclusions

This decision does not authorize:

- the central governance gateway;
- the MADVentures_OS Build Room;
- general multi-agent runtime orchestration;
- autonomous merge or production deployment;
- unregistered model execution;
- unapproved external transmission; or
- the future Large Multi-Phase Assurance Track.

#### 10.2 Separately ratifiable future package

The Founder-approved design concept for a **Large Multi-Phase Assurance Track**
is recorded as net-new future scope, not as part of the deferred G3 Slice B+
remainder and not as a condition of B+ completion.

A separate future DEC, requiring its own Founder ratification after drafting,
may establish:

- a versioned Founder-approved design and acceptance baseline;
- an independent continuity reviewer assigned before implementation;
- phase-by-phase requirement-to-code/test/review/SHA evidence;
- Tier-1 review at each phase and Tier-2 review for trigger-matching phases;
- mandatory Tier-2 architecture-baseline, cross-phase integration, and final
  completion review;
- Founder approval for every material baseline change; and
- a final evidence matrix marking each requirement satisfied, intentionally
  deferred, or Founder-approved as changed.

Until that future DEC is ratified, `multi-phase` is only a work-size
classification. Existing Tier-2 triggers apply; no assurance-track authority
or role is active.

---

## Companion governance edits required by the ratification package

The canonical proposal package MUST reconcile, at minimum:

1. `/00-system/system-index.md` — G3 Slice B+ proposal/implementation/activation
   state and MP-1 gate status.
2. `/04-agents/execution-surface-registry.md` — `antigravity` and
   `hermes-local-code` registrations and G3 governance status.
3. `/07-decisions/DEC-20260716-02-model-portfolio-and-routing-strategy.md`,
   `/04-agents/model-registry.md`, and the other authoritative routing/model
   artifacts — exact model additions, the closed Tier-2 roster amendment,
   proposed routing amendments, and the conditional activation/temporary-policy
   retirement path.
4. `/07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md` —
   restricted-local clause-5 reconciliation and local-only exception path.
5. `/01-constitution/agent-rules.md` — matching surface, restricted-local,
   review, isolation, and state vocabulary only after Founder ratification
   authorizes those edits.
6. The versioned Coding Governance Execution Record contract and Neon evidence
   mapping in the repository's established canonical contract location.
7. Workflow/template artifacts required for handoff manifests, pilot evidence,
   and SHA-bound review/activation.
8. `/07-decisions/decision-log.md` — the canonical decision entry in the same
   proposal package; this register MUST NOT lag.
9. `/07-decisions/decision-id-reservations.md` — reservation/consumption row
   updated immediately after a five-source-clean allocation.
10. Any derived indexes, cross-references, and state lists affected by the
    amendments.

The existing canonical execution-envelope serialization is referenced and
tested at the integration boundary; it is not rewritten.

## Owner

Founder. `builder` may draft and maintain the proposal and implementing
artifacts within explicit assignments. Only the Founder may ratify this
decision, grant the local-only exception, approve sanitized disclosure,
authorize merge/deployment, or later activate MP-1.

## Status

`active` / `source_of_truth: true`. Ratified 2026-08-07 — see "Founder
ratification" above.

This canonical artifact is active and authoritative. Ratification authorizes
the implementation package and controlled pilot only; MP-1 remains inactive
until the separate exact-SHA activation ruling defined in clause 6, and the
Temporary Task-Assignment Policy remains globally controlling until that
ruling.

## Rationale

G3 Slice A closed attribution and identity drift but deliberately deferred the
operational coding-surface remainder. Current coding work spans multiple local,
interactive, plugin-mediated, and cloud execution surfaces. Documentation-only
governance is insufficient because child CLIs may possess different machine
permissions from their host, concurrent writers can collide, and reviews can
silently lose independence or SHA binding.

Layered native enforcement closes those gaps using existing doctrine,
registries, repository controls, CI, GitHub protection, and durable evidence.
The contracts remain transport-neutral so a future gateway can centralize
policy evaluation without rewriting identity or authority.

## Alternatives considered

1. **Central governance gateway now.** Rejected for this slice because it adds
   a new service, availability boundary, and significant integration scope
   before the policies and contracts have been validated.
2. **Documentation and manual review only.** Rejected because it cannot
   reliably enforce permissions, concurrency, independence, or SHA binding.
3. **Layered native enforcement with gateway-ready contracts.** Selected as
   the smallest approach that provides technical enforcement now and a clean
   migration path later.

## Risks and controls

- **Adapter drift:** controlled by one versioned contract and adapter-parity
  tests.
- **Duplicate authority:** controlled by reference-not-restate indexing and
  targeted amendments to authoritative artifacts.
- **Permission inheritance through plugins:** controlled by equal-or-narrower
  child authority and explicit child records.
- **Concurrent overwrite:** controlled by one writer per worktree and recorded
  ownership transfer.
- **False review independence:** controlled by author/provider/execution checks
  and exact-SHA review binding.
- **No-cloud deadlock:** controlled by sanitized-disclosure approval or the
  Founder-only local exception, without falsely recording Tier-2 satisfaction.
- **Premature MP-1 activation:** controlled by the pilot, Tier-2 gate, and
  separate Founder activation ruling.
- **Scope growth:** controlled by separating the future Large Multi-Phase
  Assurance DEC from G3 Slice B+ completion.
- **Decision-ID collision:** controlled by the allocation guard and mandatory
  five-source search before canonicalization.

## Drift Risk

high — the package changes coding-surface permissions, model routing, review
bindings, repository controls, and future activation gates across multiple
authoritative artifacts.

## Decision Health

green — the proposal is internally specified and allocation-clean; it remains
non-active pending companion-package verification, exact-SHA Tier-2 review, and
Founder ratification.

## Related Files

`/00-system/system-index.md`,
`/00-system/coding-governance-execution-record-v1.0.md`,
`/01-constitution/agent-rules.md`,
`/04-agents/execution-surface-registry.md`,
`/04-agents/model-registry.md`,
`/07-decisions/DEC-20260716-02-model-portfolio-and-routing-strategy.md`,
`/07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md`,
`/07-decisions/decision-log.md`,
`/07-decisions/decision-id-reservations.md`, and the templates named in the
companion package.

## Related Workflows

`WF-11` and `WF-13`.

## Related Handoffs

None. Parent/child execution and coding-surface ownership transfers use the
Coding Governance Execution Record and handoff manifest introduced by this
proposal; they do not allocate an organizational handoff record by default.

## Done criteria

This proposal package is drafting-complete only when:

1. a canonical ID has been allocated through the five-source process;
2. the DEC, decision log, and reservation registry agree;
3. all companion amendments are internally consistent and reference existing
   authority rather than duplicating it;
4. the proposed surface, role, routing, permission, state, exception, and
   evidence contracts are explicit and testable;
5. an independent Tier-2 reviewer has reviewed the exact proposal SHA;
6. every blocking finding is resolved; and
7. the Founder has reviewed and ratified the canonical proposal.

G3 Slice B+ implementation is complete only after the enforcement package and
pilot satisfy clause 9. MP-1 is active only after the later Founder activation
ruling satisfies clause 6.3.

## Next action

1. Commission a registered `architect`-role execution (per `DEC-20260715-14`)
   to produce the durable technical recommendation for the CGER
   implementation, the six-surface adapter protocol, the release-manifest
   design, and the Stage 8 evidence-read mechanism.
2. Independent, non-authoring Tier-2 review of that exact recommendation.
3. Founder acceptance of the (possibly revised) recommendation.
4. Only then, implement the enforcement package under task-scoped Builder
   assignments per phase and run the controlled pilot. MP-1 activation
   remains a later, separate ruling against the exact reviewed release
   manifest, per clause 6.

## Review date

2026-09-07, on change, before Founder ratification, and before any MP-1
activation ruling.

## Notes

- This proposed artifact and its companion edits authorize no merge, runtime,
  production, deployment, or MP-1 activation action before Founder ratification.
- The central gateway is a future transport for the same contracts; it is not
  a dependency of G3 Slice B+.
- The MADVentures_OS Build Room remains paused until the Founder separately
  resumes it.
- The Large Multi-Phase Assurance Track remains a future proposed package and
  requires its own Founder-ratified DEC once completed.
