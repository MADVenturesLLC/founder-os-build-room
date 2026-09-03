---
title: Role Registry
type: role
owner: founder
company: mad-ventures
product: mad-ventures-os
status: active
created: 2026-07-15
updated: 2026-08-15
version: 0.21
review_cycle: on-change
source_of_truth: true
related_decisions:
  - DEC-20260715-17-stable-roles-and-replaceable-execution-architecture
  - DEC-20260719-02-independent-reviewer-two-tier-binding
  - DEC-20260717-01-chief-of-staff-model-stack
  - DEC-20260717-02-deputy-binding-ratification
  - DEC-20260706-01-founder-os-architecture
  - DEC-20260714-01-deputy-chief-of-staff-role-and-preferred-model
  - DEC-20260715-08-system-architect-disposition
  - DEC-20260715-14-technical-architect-agent-tier
  - DEC-20260716-02-model-portfolio-and-routing-strategy
  - DEC-20260716-01-data-boundary-policy
  - DEC-20260721-04-researcher-accountability-binding
  - DEC-20260801-01-deputy-p3-channel-approval
  - DEC-20260801-08-chief-of-staff-runtime-activation
related_workflows: []
used_by:
  - builder
read_by:
  - all-active-roles
written_by:
  - builder
tags:
  - role
  - registry
  - foundation
  - active
---

# Role Registry

## Purpose
Records the canonical roster of 17 stable roles approved by `DEC-20260715-17-stable-roles-and-replaceable-execution-architecture`, each separated from the model(s) bound to it per `/00-system/identity-taxonomy.md`. **This registry is active and authoritative**, promoted by the G2 activation package: the role files in `04-agents/roles/`, `04-agents/agent-registry.md`, `01-constitution/agent-rules.md`, and the active workflows and templates target this roster's role IDs. Promotion changes no binding status recorded below — approval of a roster identity still does not promote any underlying role contract, decision, or model policy beyond its recorded status.

## Owner
Founder (ruling authority for the roster and its bindings, per `DEC-20260715-17`). `builder` maintains structure (G1 drafting executed via Claude Code and the Fable 5 temporary Builder assignment — provenance).

## Used By / Read By
Every workflow, handoff, capability, and approval that targets a stable role; `builder` maintains the records.

## Written By
`builder`. Provenance: initial foundation via Claude Code; Phase G1 repair via the Fable 5 founder-directed temporary Builder assignment.

## Update Cadence
On-change; adding, renaming, retiring a role, or changing a binding status requires a decision.

## Current Status
Active — promoted by the G2 activation package executing `DEC-20260715-17` item 16. `migration_status: governance-activated`. `activation_status: active`. Active workflows, handoff templates, and the `04-agents/roles/*` files target these role IDs. Binding statuses: the `architect` tier (`DEC-20260715-14`), the Chief of Staff stack (`DEC-20260717-01`), and the Deputy primary (`DEC-20260717-02`) are the approved governance bindings — the latter two ratified by the durable Founder authorization of 2026-07-17. **Runtime activation is now uniform:** Chief of Staff is `runtime_activation: active` under `DEC-20260801-08` (env vars provisioned; live operation gated by COS_INTELLIGENT_ROUTING_ENABLED + kill switch). Deputy primary is `runtime_activation: active` under `DEC-20260801-01` v1.1 (P3 Z.ai international channel + founder activation clarification; live `/deputy` still requires Railway `DEPUTY_DELEGATION_ENABLED=true`, `ZAI_API_KEY`, and `ZAI_DEPUTY_MODEL=glm-5.2`). Package MP-1 (`DEC-20260716-01`, `DEC-20260716-02`) corrected the `architect` tier's secondary binding in naming only and gave `hermes` an owning role; its former CoS proposal is preserved as dated binding history — see `/00-system/model-portfolio-and-routing-strategy.md` for the governing policy and `/00-system/data-boundary-policy.md` for the privacy classes any future routing implementation must respect. Unassigned roles remain visibly unassigned.


**Roster expanded to thirty roles — `DEC-20260812-03` ratified by the Founder 2026-08-12** at reviewed head `b2a741c53f0c79fddc3de19fc649b639b12cc4d1`, after Tier-2 independent review (`gemini-3.1-pro`) returned APPROVAL bound to that exact commit. It adds thirteen role IDs, executing OA-1, the first workstream of the organizational architecture plan: five executive roles (`chief-strategy-officer`, `chief-operating-officer`, `chief-financial-officer`, `chief-marketing-creative-officer`, `chief-compliance-officer`) and eight functional leads (`security-lead`, `data-intelligence-lead`, `reliability-lead`, `portfolio-venture-lead`, `growth-commercial-lead`, `innovation-futures-lead`, `program-execution-lead`, `investment-acquisition-lead`). **All thirteen are `binding_status: unassigned` and carry no model binding** — `DEC-20260812-03` creates none, and automatic fail-closed routing to any of them additionally requires MP-1 activation, which remains a separate later Founder ruling. Each new role's authority boundary against every adjacent role is stated in `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3. The seventeen pre-existing roles are unchanged: none is renamed, retired, re-homed, or narrowed, and none gained an `activation_status` field.

> **⚠ Thirty roles registered, twenty-nine attributable — deliberate.**
> Founder ruling 2026-08-12 separates **taxonomy state** from **activation
> state**. `roster_status` records that a role and its authority boundary are
> ratified; `activation_status` records whether it may operate.
> **Assignability derives from `activation_status` and never follows
> automatically from taxonomy ratification.**
>
> `investment-acquisition-lead` is `activation_status: deferred`: ratified as to
> its authority boundary, but **non-assignable, non-routable, and ineligible for
> attributed work** until a separate explicit Founder activation ruling (org
> plan §7.2). That invariant is **enforced, not merely documented** — the role
> is **excluded from `ROLE_ID_REGEX`** in
> `/00-system/scripts/attribution-shape-check.sh`, so the required
> `attribution-shape` check rejects any commit attributing work to it, and the
> script's `selftest` carries negative assertions proving the rejection holds.
>
> **The 30 ÷ 29 gap is that control, not an omission.** Do not "fix" it by
> adding the role to the regex. Adding it requires a Founder activation ruling
> flipping `activation_status` to `active` here, in the same change.

**Separately, 2026-08-12:** `DEC-20260812-02` (active) assigned first bindings to `product-lead` (`gpt-5.5`), `marketing-lead` (`gemini-3.6-flash`), and `pre-mortem-reviewer` (`gemini-3.5-flash`).

## Next Action
Remaining model-binding assignments for the unassigned roles, and any future routing implementation, follow `/00-system/model-portfolio-and-routing-strategy.md`'s staged evaluation track and `/04-agents/temporary-task-assignment-policy.md`'s lifecycle. Routing enforcement remains gated by its own implementation package.

## Done Criteria
Every role below has a unique, taxonomy-compliant `role_id`; purpose and responsibilities traceable to cited evidence (not invented); every binding carries an explicit typed status; every compatibility alias is same-class and resolves to exactly one canonical role.

---

## How to read this registry

Field semantics (per `/00-system/identity-taxonomy.md`):
- **roster_status** — this registry entry's own status in the future taxonomy, and **only** that. Canonical values: `approved-for-future-taxonomy` (all thirty roles — the seventeen ratified before 2026-08-12 and the thirteen ratified by `DEC-20260812-03` on 2026-08-12); `proposed` (an entry created by a decision the Founder has not yet ratified — it confers nothing and may not be assigned). **This field never expresses activation.** Per the Founder ruling of 2026-08-12, no combined taxonomy-plus-activation value may be minted; activation lives in `activation_status`.
- **activation_status** — whether the role may operate. Values: `active` (may operate; assignable once bound) and `deferred` (authority boundary ratified, but **not assignable, not routable, and not eligible for attributed work** until a separate explicit Founder activation ruling). **Assignability derives from this field, never from `roster_status`.** Explicit — never an implicit default — on each of the thirteen roles added by `DEC-20260812-03`. The seventeen previously ratified roles do **not** carry it: that decision expressly changed no existing role. A `deferred` role is excluded from `ROLE_ID_REGEX` in `/00-system/scripts/attribution-shape-check.sh`; currently `investment-acquisition-lead` alone.
- **underlying_contract_status** — the current status of the existing role-contract/prompt file(s) this entry is drawn from; not changed by this registry.
- **approved_bindings / proposed_bindings / implementation_observed_bindings / temporary_task_assignments** — typed per the binding-status taxonomy; empty means none on record.
- **binding_status** — the overall status of the role's model binding: `active` (an active Founder decision binds who satisfies the role), `approved`, `proposed`, `unassigned`, or `accountability-approved` (capability accountability only; model bindings remain unassigned — `DEC-20260721-04`).
- **role_compatibility_aliases** — same-class (role) aliases only. Model, surface, capability, persona, and tool identifiers are never role aliases; historical associations of that kind appear under `historical_identifiers` instead.
- **runtime_routable** — whether the role corresponds to a live runtime routing target today, per evidence.

---

## 1. `strategist`

```yaml
role_id: strategist
display_name: Strategist
roster_status: approved-for-future-taxonomy
underlying_contract_status: draft   # 04-agents/roles/strategist.md
runtime_routable: yes               # via the frozen `plato` capability (/plato)
approved_bindings:
  primary:
    model_id: claude-sonnet-5        # exact canonical Anthropic API ID (dateless pinned snapshot) — verified 2026-07-20
    provider: anthropic
    mode: standard
    binding_status: approved         # DEC-20260720-03 (active)
  fallback:
    model_id: gpt-5.6-terra          # exact canonical OpenAI API ID — verified 2026-07-20 (see DEC-20260720-03 verification caveat)
    provider: openai
    mode: standard
    binding_class: operational-only  # availability continuity only; can never independently issue the role's final high-impact recommendation (routing-strategy §6)
    binding_status: approved         # DEC-20260720-03 (active)
proposed_bindings: []
implementation_observed_bindings:
  - provider: anthropic
    model_env_var: ANTHROPIC_PLATO_MODEL   # model ID not committed to the repository; DEC-20260720-03 rules its value is claude-sonnet-5
    context: founder-os-telegram `plato` capability
temporary_task_assignments: []
binding_status: approved
role_compatibility_aliases:
  - strategist-agent                 # prior role-prompt label ("Strategist Agent")
historical_identifiers:
  - plato                            # legacy persona / frozen capability ID — not a role alias
  - plato-chatgpt                    # legacy composite operator identifier — not a role alias
```

- **Purpose:** Sharpen strategy — wedge, positioning, sequencing, and tradeoffs for MAD Ventures and DecivantIQ.
- **Responsibilities:** Strategic framing and tradeoff analysis for founder decisions; strategy-to-build handoffs.
- **Known authority:** Strategy formation; no implementation or final architecture authority.
- **Owned capabilities:** `plato` (frozen Telegram capability) is the closest current runtime analog; the capability registry does not itself declare a role owner — recorded as evidence, not invention.
- **Binding (DEC-20260720-03, active, founder-ratified 2026-07-20):** two-tier — primary `claude-sonnet-5` (Anthropic, standard); fallback `gpt-5.6-terra` (OpenAI, standard, **operational-only**). Per routing-strategy §6 the fallback exists for availability continuity only and can never independently issue the strategist's final high-impact recommendation; fallback output is immutably classified as a non-recommendation and only a fresh primary execution produces a canonical strategist recommendation. Runtime wiring (plato→strategist role mapping, `STRATEGIST_FALLBACK_ENABLED` kill switch default OFF) lands in `founder-os-telegram` under the same decision.
- **Evidence sources:** `04-agents/roles/strategist.md`; `04-agents/plato-chatgpt.md`; `capability-registry.ts` and `.env.example` (`founder-os-telegram`, inspected read-only); `07-decisions/DEC-20260720-03-strategist-two-tier-binding.md`.

## 2. `architect`

```yaml
role_id: architect
display_name: Architect
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/architecture/README.md + technical-architect-tier.yaml + output contract
runtime_routable: yes               # frozen capability `architecture-analysis`, frozen command /architect
approved_bindings:
  primary:
    model_id: gemini-3.1-pro
    mode: standard
    binding_status: approved        # DEC-20260715-14 (active)
  secondary:
    model_id: deepseek-v4-pro        # corrected from `deepseek-v4-pro-thinking` — DEC-20260716-02 item 7 (naming only, same decision, same tier)
    mode: thinking
    binding_status: approved        # DEC-20260715-14 (active)
  advisor:
    model_id: grok-4.5
    mode: standard
    binding_status: approved        # DEC-20260715-14 (active)
  fallback:
    model_id: deepseek-v4-pro
    mode: standard
    binding_status: approved        # DEC-20260715-14 (active)
proposed_bindings: []
implementation_observed_bindings:      # corrected 2026-07-23 — an earlier revision ("tier is doctrine-only; adapters deferred") described the pre-Increment-1 state
  - env_var: GEMINI_ARCHITECT_PRIMARY_MODEL        # primary adapter, Increment 1 (PR #27, merged 2026-07-18); behind ARCHITECTURE_TIER_ENABLED
  - env_var: DEEPSEEK_ARCHITECT_FALLBACK_MODEL     # fallback via the Azure P2 channel (DEC-20260720-01/-02); behind ARCHITECTURE_FALLBACK_ENABLED
  - env_var: GROK_ARCHITECT_ADVISOR_MODEL          # advisor increment merged 2026-07-23 (founder-os-telegram main @ b4265d49); behind ARCHITECTURE_ADVISOR_ENABLED + XAI_API_KEY; enablement gated (xAI retention unverified per data-boundary §5(4); current-data tooling not yet wired vs tier.yaml required tool) — see model-registry grok-4.5
  # secondary (deepseek-v4-pro, mode: thinking) remains declared-only: no code path reads DEEPSEEK_ARCHITECT_SECONDARY_MODEL (deferred increment)
temporary_task_assignments: []
binding_status: approved
role_compatibility_aliases:
  - system-architect                 # DEC-20260715-08 role name
  - technical-architect              # DEC-20260715-14 role name
  - architecture                     # loose role label in agent-registry/tier YAML top key
historical_identifiers:
  - "Technical Architect Agent Tier"
  - "System Architect"
```

- **Purpose:** System architecture, repository-wide dependency analysis, service and runtime boundaries, integration architecture, and architecture decision recommendations — provider-independent.
- **Responsibilities (from the active tier contract):** system-wide topology design; repository-wide dependency and import graph analysis; system-level service and runtime boundaries; integration and event architecture mapping; compiler and runtime compatibility mapping; architecture decision recommendations.
- **Known authority:** Owns the architecture recommendation; holds no implementation authority (`implementation_authority: false` per the tier's own governance block).
- **Owned capabilities:** `architecture-analysis` (frozen; never renamed by this migration).
- **Routing intent (restated from the active tier, not altered):** primary produces the final architecture recommendation; secondary performs deeper decomposition and adversarial challenge; advisor validates current APIs, SDKs, frameworks, deprecations, and security advisories; fallback handles routine architecture analysis and artifact production and **cannot** independently make a final high-impact recommendation. **Authority belongs to `architect` — not to Gemini, DeepSeek, Grok, Fable, or any surface.**
- **Consolidation note:** `architect` is the single canonical role for the architecture function ratified twice — as "System Architect" (`DEC-20260715-08`, permanent and model-independent, contract file never created) and as "Technical Architect" (`DEC-20260715-14`, the concrete active tier). Both decisions' authority is preserved, not overridden; neither prior decision's file is edited by this package.
- **Naming correction (DEC-20260716-02 item 7):** the secondary binding's `model_id` was corrected from `deepseek-v4-pro-thinking` to `deepseek-v4-pro` with `mode: thinking` — external verification found the former does not correspond to a distinct provider SKU (DeepSeek V4 Pro is one hybrid model; thinking is an API-request parameter). The tier's four binding classes, models, providers, and routing intent are otherwise unchanged; `DEC-20260715-14` itself is not edited.
- **Evidence sources:** `04-agents/architecture/README.md`, `04-agents/architecture/technical-architect-tier.yaml`, `04-agents/architecture/architecture-output-contract.md`, `07-decisions/DEC-20260715-14-technical-architect-agent-tier.md`, `07-decisions/DEC-20260715-08-system-architect-disposition.md`, `07-decisions/DEC-20260716-02-model-portfolio-and-routing-strategy.md` (naming correction).

## 3. `builder`

```yaml
role_id: builder
display_name: Builder
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/builder.md
runtime_routable: yes               # frozen `claude` capability (/claude), currently a stub adapter
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []   # the `claude` capability has no live provider configured (StubAdapter)
temporary_task_assignments:
  - model_id: fable-5
    provider_id: anthropic
    application_id: claude-code
    execution_surface: claude-code
    assignment_type: founder-directed-temporary-task-assignment
    work_item: PR-14-G1-repair        # historical, pre-policy record — lapsed with this work item; no present execution authority; see prose below and /04-agents/temporary-task-assignment-policy.md §9
    permanent_binding_effect: none
  - assignment_id: TTA-20260716-01
    role_id: builder
    model_id: fable-5
    provider_id: anthropic
    application_id: claude-code
    execution_surface: claude-code
    assignment_type: founder-directed-temporary-task-assignment
    work_item: founderos-g2-governance-activation   # issue #17 work order; bounded to the G2 activation pull request
    permitted_repositories:
      - MADVenturesLLC/FounderOS
    permitted_data_classes:
      - public
      - internal
    created_at: 2026-07-16T22:05:50Z
    expires_at: 2026-07-30T22:05:50Z                # 14-day ceiling per /04-agents/temporary-task-assignment-policy.md §4
    authorized_by: michael-daley
    authorized_at: 2026-07-16T21:46:58Z             # actual timestamp of the Founder authorization comment
    authorization_reference: https://github.com/MADVenturesLLC/FounderOS/issues/17#issuecomment-4996894218
    assignment_record: https://github.com/MADVenturesLLC/FounderOS/issues/17#issuecomment-4997035849
    permanent_binding_effect: none
    binding_status: temporary-task-assignment
  - assignment_id: TTA-20260807-01
    role_id: builder
    model_id: fable-5
    provider_id: anthropic
    application_id: claude-code
    execution_surface: claude-code
    assignment_type: founder-directed-temporary-task-assignment
    work_item: dec-20260807-01-ratification-pr   # Phase 0 step 3 of the reviewed G3 Slice B+ plan; bounded to PR #213
    permitted_repositories:
      - MADVenturesLLC/FounderOS
    permitted_data_classes:
      - public
      - internal
    prohibited_data_classes:
      - confidential
      - restricted
      - local-only
    permitted_actions: branch, read, edit only files required by this step, verify, commit, push, open PR, respond to review findings
    prohibited_actions: merge, MP-1 activation, retiring the Temporary Task-Assignment Policy, production/deployment actions, Neon migrations, out-of-scope data access, scope expansion, permanent bindings
    created_at: 2026-08-07   # exact time not separately logged — authorized directly in-session (PR #213 body: "Founder-issued 2026-08-07, this conversation"); work under it began no later than commit 7094121's timestamp 2026-08-07T22:15:13-04:00 (2026-08-08T02:15:13Z), the earliest verifiable evidence of execution start
    expires_at: 2026-08-22T02:15:13Z    # 14-day ceiling per /04-agents/temporary-task-assignment-policy.md §4, computed from the earliest verifiable execution-start evidence above; superseded by early completion below
    authorized_by: michael-daley
    authorized_at: 2026-08-07   # same recording gap as created_at — exact time not separately logged
    authorization_reference: https://github.com/MADVenturesLLC/FounderOS/pull/213
    completed_at: 2026-08-08T06:18:20Z   # PR #213 merged, commit 328f40dbec8ebce7b9704ea405e8e90eed9da7f0 — Founder-confirmed completion
    completion_reference: https://github.com/MADVenturesLLC/FounderOS/pull/213 (merge commit 328f40dbec8ebce7b9704ea405e8e90eed9da7f0)
    permanent_binding_effect: none
    binding_status: completed
binding_status: unassigned            # permanent binding
role_compatibility_aliases:
  - builder-agent                    # prior role-prompt label ("Builder Agent")
historical_identifiers:
  - claude-code                      # coding execution surface historically hosting Builder work — not a role alias
```

- **Purpose:** Turn approved plans into shipped artifacts with clean scope and visible next actions.
- **Responsibilities:** Implementation execution of approved plans.
- **Known authority:** Implementation execution; no architecture-recommendation authority.
- **Owned capabilities:** `claude` (frozen Telegram capability; presently a stub with no live provider).
- **Execution provenance for this foundation:** the first three commits of the Phase G1 pull request were produced before the corrective execution, under the prior implementation assignment (model `sonnet-5`, provider `anthropic`, application/surface `claude-code` — recorded in the identity map and PR provenance); the corrective commits were produced under the founder-directed temporary `fable-5` assignment above (provider `anthropic`, application/surface `claude-code`), for work item `PR-14-G1-repair` only. Neither fact creates a permanent Builder binding. Claude Code, Cursor, and Codex are agentic coding applications and coding execution surfaces — none of them is a model, a provider, or the Builder.
- **Historical record status (correction):** the `temporary_task_assignments` block above predates `/04-agents/temporary-task-assignment-policy.md`'s complete audit schema (`assignment_id`, `created_at`, `expires_at`, `authorized_by`, `authorized_at`, `authorization_reference`, per that policy §3/§5) and does not carry those fields. It is retained as historical evidence of the assignment's identity, scope, and no-permanent-binding pattern only — it is not a currently governing or execution-authorizing assignment, and no missing field is fabricated to make it appear otherwise. Per that policy §9, it is the sole grandfathered pre-policy record; every assignment authorized after that policy took effect must carry the complete schema.
- **Evidence sources:** `04-agents/roles/builder.md` ("Default host operator: claude-code"); `04-agents/claude-code.md`; `capability-registry.ts`, `adapters/stub-adapter.ts` (`founder-os-telegram`, inspected read-only); this pull request's own commit history; `04-agents/temporary-task-assignment-policy.md` §9 (historical-record grandfather clause).

## 4. `researcher`

```yaml
role_id: researcher
display_name: Researcher
roster_status: approved-for-future-taxonomy
underlying_contract_status: draft   # 04-agents/roles/researcher.md
runtime_routable: yes               # frozen `research` capability (/research); `hermes` capability also owned (DEC-20260716-02 item 8)
capability_accountability:           # DEC-20260721-04 (active) — attribution binding only, NOT a model binding
  - capability: research
    binding_status: approved         # DEC-20260721-04 item 1; runtime mapping via resolveRoleForCapability('research')
  - capability: hermes
    binding_status: unbound          # founder ruling at DEC-20260721-04 ratification: explicitly out of scope — own future decision required; doctrine ownership (DEC-20260716-02 item 8) unchanged. DEC-20260812-04 (ratified active 2026-08-12) reverses this for the researcher lane: /hermes executions in the research lane resolve to the researcher policy
approved_bindings: []                # model-level — deliberately still empty per DEC-20260721-04 item 1: stage models stay implementation-observed pending the routing-strategy §8 pipeline-redesign decision
proposed_bindings: []
implementation_observed_bindings:
  - context: founder-os-telegram research pipeline (staged)
    stages:
      - provider: google
        model_env_var: GEMINI_RESEARCH_MODEL      # model ID not committed
      - provider: perplexity
        model_env_var: PERPLEXITY_RESEARCH_MODEL  # model ID not committed
      - provider: openai
        model_env_var: OPENAI_RESEARCH_MODEL      # model ID not committed
temporary_task_assignments: []
binding_status: accountability-approved   # DEC-20260721-04 — capability accountability only; model bindings remain unassigned
permanent_approved_binding: none
role_compatibility_aliases:
  - research-agent                   # prior role-prompt label ("Research Agent")
historical_identifiers:
  - gemini                           # model/model-family named as default host in the draft role file — not a role alias
  - research                         # frozen capability ID and prior role filename slug — not a role alias
```

- **Purpose:** Answer the assigned research question with sourced evidence.
- **Responsibilities (preserved from the draft role contract):** answer the assigned research question; use sourced evidence; rate confidence; separate raw capture from operator-ready synthesis; avoid deciding strategy outside delegated authority; hand interpretation to the appropriate decision-owning role.
- **Known authority:** Research findings only; no strategy, implementation, or architecture authority.
- **Owned capabilities:** `research` (frozen Telegram capability, `maxAttempts: 1`); `hermes` (frozen Telegram capability) — assigned by `DEC-20260716-02` item 8, closing a gap where this capability had no role owner and would otherwise be unroutable once fail-closed role routing activates. This assignment does not change the capability's ID, its runtime behavior, or the `hermes-4-14b` model's `unassigned` permanent-binding status.
- **Binding (DEC-20260721-04, active, founder-ratified 2026-07-21):** capability-accountability binding only — `researcher` is the approved accountable role for the `research` capability. The runtime mapping executing it (`resolveRoleForCapability('research')` in `founder-os-telegram` `core/role-policy.ts`) is implemented on the companion branch (founder-os-telegram PR #44) and held for founder review; once that merges, `/research` execution records carry `roleId: researcher` with the capability id preserved separately. Flat, non-delegating; **no fallback tier** (`DEC-20260720-01` item 2 reaffirmed); **no model binding ratified** — the three pipeline-stage models stay implementation-observed and env-resolved pending the routing-strategy §8 pipeline-redesign decision (OpenAI deep-research retirement 2026-07-23 / Perplexity Sonar transition). **`hermes` is explicitly excluded by founder ruling at ratification** — the binding covers `/research` only; `/hermes` remains unbound (`resolveRoleForCapability('hermes')` stays `undefined`, records keep the capability-id fall-through) until its own future decision, while its doctrine ownership under `DEC-20260716-02` item 8 is unchanged.
- **Binding note (model level):** the existing draft role file names Gemini as a *default host*; no active decision establishes Gemini as the permanent Researcher primary, so the permanent model binding remains `unassigned` and the multi-stage pipeline above is recorded strictly as implementation-observed evidence — unchanged by `DEC-20260721-04`, which binds accountability, not models.
- **Evidence sources:** `04-agents/roles/researcher.md` (draft); `04-agents/gemini.md`; `capability-registry.ts`, `adapters/research-pipeline-adapter.ts`, `adapters/gemini-client.ts`, `adapters/perplexity-client.ts`, `adapters/openai-adapter.ts`, `adapters/local-worker-adapter.ts`, `.env.example` (`founder-os-telegram`, inspected read-only); `07-decisions/DEC-20260716-02-model-portfolio-and-routing-strategy.md` (`hermes` ownership assignment); `07-decisions/DEC-20260721-04-researcher-accountability-binding.md` (accountability binding).

## 5. `experience-architect`

```yaml
role_id: experience-architect
display_name: Experience Architect
roster_status: approved-for-future-taxonomy
underlying_contract_status: draft   # 04-agents/roles/experience-architect.md — created at G2, held draft pending Founder review
runtime_routable: yes               # frozen `fable` capability (/fable), currently a stub adapter
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []   # the `fable` capability has no live provider configured (StubAdapter)
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers:
  - fable-5                          # model whose operator file currently carries this lane — not a role alias
```

- **Purpose:** Creative-systems planning, experience architecture, product-surface structure, interaction and workflow experience design, interface concept planning, and design-to-build plans handing experience constraints to Builder and Architect.
- **Responsibilities (from `04-agents/fable-5.md`, active, unchanged):** creative-systems plans; experience architecture; product-surface structure; interaction and workflow experience design; interface concept planning; design-to-build plans; experience constraints and handoffs for Builder and Architect.
- **Known authority:** Owns experience and creative-systems recommendations; explicitly does **not** own runtime topology, service boundaries, data ownership, authorization boundaries, security architecture, state-machine execution semantics, integration architecture, or technical ADR recommendations — those belong to `architect` (per the fable-5 operator file's own Lane section).
- **Owned capabilities:** `fable` (frozen Telegram capability; presently a stub).
- **Evidence sources:** `04-agents/fable-5.md` (reclassified to creative-systems and experience planning by `DEC-20260715-14`, its own currently active content); `capability-registry.ts` (`founder-os-telegram`, inspected read-only).

## 6. `independent-reviewer`

```yaml
role_id: independent-reviewer
display_name: Independent Reviewer
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/independent-reviewer.md — created at G2; founder-reviewed and activated 2026-07-19 with tier-alignment additions (DEC-20260719-02)
runtime_routable: no                # no dedicated capability or command exists today
approved_bindings:
  tier-1:
    tool_id: coderabbit              # automated code-review service (GitHub App), verified installed and active on all three repositories 2026-07-19
    scope: routine code-review PRs across FounderOS, founder-os-console, founder-os-telegram (WF-13 merge gate)
    binding_status: active           # DEC-20260719-02, founder-activated 2026-07-19
  tier-2:
    # Closed roster per DEC-20260719-02 v1.1. No "equivalent model" escape hatch.
    model_ids_full: [gemini-3.1-pro, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, grok-4.5]
    # Tier2-Reviewer-Id attestation ids differ from model_id for the Codex models:
    # chatgpt-5.6-sol | chatgpt-5.6-terra | chatgpt-5.6-luna. See /04-agents/model-registry.md.
    model_ids_full_removed: [opus-4.8, gpt-5.6]        # removed 2026-08-15, founder-directed (v1.1)
    model_ids_restricted: [hermes-4-14b, tencent-hy3]
    # clause 5 (v0.9): paired, NON-BINDING findings only; cannot independently satisfy
    # the binding Tier-2 verdict on ANY artifact — not merely doctrine packages — except
    # under the Founder's exact one-task/one-repo/one-SHA local-only exception.
    mode: invoked                    # per-case, never automatic
    binding_status: active           # DEC-20260719-02; v0.7 full expansion; v0.8 restricted +tencent-hy3; v1.1 roster reconciliation 2026-08-15
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: active               # two-tier binding, DEC-20260719-02 (v0.8 restricted roster 2026-07-26; v1.1 full-roster reconciliation 2026-08-15)
role_compatibility_aliases: []
historical_identifiers:
  - opus                             # model family named in the review lane and wf-13 guidance — not a role alias
```

- **Purpose:** Deep review, complex reasoning, high-risk architecture critique, and strategic risk review, independent of the work being reviewed.
- **Responsibilities (from the active Opus lane in `01-constitution/agent-rules.md`):** deep review; complex reasoning; high-risk architecture critique; strategic risk review — used when a decision is hard to reverse, tradeoffs are complex, operators disagree, or risk is high.
- **Known authority:** Review and critique; no implementation or final architecture authority.
- **Owned capabilities:** none verified.
- **Tier 2 roster (DEC-20260719-02 v1.1, 2026-08-15):** **full** — `gemini-3.1-pro`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `grok-4.5` (`opus-4.8` and `gpt-5.6` removed 2026-08-15, founder-directed); **restricted (local)** — `hermes-4-14b`, `tencent-hy3`, which provide paired, **non-binding** Tier-2 findings only and **cannot independently satisfy the binding Tier-2 verdict on any artifact** — not merely on doctrine packages — unless the Founder grants the exact one-task / one-repository / one-committed-SHA local-only exception. *(Corrected 2026-08-15: this line previously scoped the restriction to `07-decisions/` / `01-constitution/` / `00-system/` packages, clause 5's superseded v0.8 wording.)* Any **one** full-roster model independently satisfies the role for in-scope work; dual full-roster review encouraged for high stakes. Author of the PR cannot serve Tier 2 for that PR.
- **Evidence sources:** `01-constitution/agent-rules.md` (Opus lane); `04-agents/opus.md`; `05-workflows/wf-13-code-review.md` (reviewer-routing guidance); `07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md` (two-tier binding; v0.8 restricted roster; v1.1 full-roster reconciliation 2026-08-15).

## 7. `product-lead`

```yaml
role_id: product-lead
display_name: Product Lead
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/product-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases:
  - product-agent                    # prior role-prompt label ("Product Agent")
historical_identifiers: []
```

- **Purpose:** Protect the DecivantIQ product loop — decision capture, ownership, health, drift.
- **Responsibilities:** Product-decision capture and health tracking.
- **Known authority:** Product-loop stewardship; no implementation authority.
- **Owned capabilities:** none verified.
- **Evidence sources:** `04-agents/roles/product-lead.md`.

## 8. `brand-lead`

```yaml
role_id: brand-lead
display_name: Brand Lead
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/brand-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases:
  - brand-agent                      # prior role-prompt label ("Brand Agent")
historical_identifiers: []
```

- **Purpose:** Keep every artifact on-brand and on-voice for MAD Ventures and DecivantIQ.
- **Responsibilities:** Brand and voice consistency review.
- **Known authority:** Brand/voice stewardship; no implementation authority.
- **Owned capabilities:** none verified.
- **Evidence sources:** `04-agents/roles/brand-lead.md`.

## 9. `marketing-lead`

```yaml
role_id: marketing-lead
display_name: Marketing Lead
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/marketing-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases:
  - marketing-agent                  # prior role-prompt label ("Marketing Agent")
historical_identifiers: []
```

- **Purpose:** Turn product truth and tester evidence into launch and founder-content sequences.
- **Responsibilities:** Launch and content-sequence planning.
- **Known authority:** Marketing/launch stewardship; no implementation authority.
- **Owned capabilities:** none verified.
- **Evidence sources:** `04-agents/roles/marketing-lead.md`.

## 10. `operations-lead`

```yaml
role_id: operations-lead
display_name: Operations Lead
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/operations-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases:
  - operations-agent                 # prior role-prompt label ("Operations Agent")
historical_identifiers: []
```

- **Purpose:** Keep the operating cadence honest — reviews happen, handoffs close, files stay healthy.
- **Responsibilities:** Cadence and handoff-hygiene stewardship.
- **Known authority:** Operating-cadence stewardship; no implementation authority.
- **Owned capabilities:** none verified.
- **Evidence sources:** `04-agents/roles/operations-lead.md`.

## 11. `finance-lead`

```yaml
role_id: finance-lead
display_name: Finance Lead
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/finance-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases:
  - finance-agent                    # prior role-prompt label ("Finance Agent")
historical_identifiers: []
```

- **Purpose:** Make cost, pricing, and financial-exposure implications explicit before decisions are approved.
- **Responsibilities:** Financial-exposure and cost review.
- **Known authority:** Financial-review stewardship; no implementation authority.
- **Owned capabilities:** none verified.
- **Evidence sources:** `04-agents/roles/finance-lead.md`.

## 12. `legal-risk`

```yaml
role_id: legal-risk
display_name: Legal & Risk
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/legal-risk.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases:
  - legal-risk-agent                 # prior role-prompt label ("Legal/Risk Agent")
historical_identifiers: []
```

- **Purpose:** Surface legal, privacy, regulatory, and reputation risk before it ships.
- **Responsibilities:** Legal/regulatory/reputation risk review.
- **Known authority:** Legal/risk review stewardship; no implementation authority.
- **Owned capabilities:** none verified.
- **Evidence sources:** `04-agents/roles/legal-risk.md`.

## 13. `qa-lead`

```yaml
role_id: qa-lead
display_name: QA Lead
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/qa-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases:
  - qa-agent                         # prior role-prompt label ("QA Agent")
historical_identifiers: []
```

- **Purpose:** Verify built work against acceptance criteria before it reaches the founder.
- **Responsibilities:** Acceptance-criteria verification.
- **Known authority:** Verification/QA stewardship; no implementation authority.
- **Owned capabilities:** none verified.
- **Evidence sources:** `04-agents/roles/qa-lead.md`.

## 14. `pre-mortem-reviewer`

```yaml
role_id: pre-mortem-reviewer
display_name: Pre-Mortem Reviewer
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/pre-mortem-reviewer.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases:
  - pre-mortem-agent                 # prior role-prompt label ("Pre-Mortem Agent")
historical_identifiers: []
```

- **Purpose:** Assume the plan failed; explain why before it runs.
- **Responsibilities:** Pre-mortem failure analysis.
- **Known authority:** Pre-mortem review stewardship; no implementation authority.
- **Owned capabilities:** none verified.
- **Evidence sources:** `04-agents/roles/pre-mortem-reviewer.md`.

## 15. `chief-of-staff`

```yaml
role_id: chief-of-staff
display_name: Chief of Staff
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/chief-of-staff.md
runtime_routable: yes               # frozen `request-routing` capability; the runtime's default routing entry point
approved_bindings:
  primary:
    model_id: gpt-4o-mini            # provider: openai
    mode: standard
    binding_status: approved         # DEC-20260717-01, ratified by the durable Founder authorization of 2026-07-17; runtime activation authorized active 2026-08-01 via DEC-20260801-08; env vars provisioned; live operation gated by COS_INTELLIGENT_ROUTING_ENABLED
    runtime_activation: active       # DEC-20260801-08 (was pending)
  secondary:
    model_id: claude-haiku-4-5       # provider: anthropic; conditional escalation on transport-level primary failure only; versioned identifier where supported: claude-haiku-4-5-20251001
    mode: standard
    binding_status: approved         # DEC-20260717-01; runtime activation authorized active 2026-08-01 via DEC-20260801-08 (conditional escalation only)
    runtime_activation: active       # DEC-20260801-08 (was pending; conditional escalation on transport-level primary failure only)
proposed_bindings: []
binding_history:
  - model_id: sonnet-5
    binding_class: primary
    binding_status: proposed         # dated superseded proposal history: recorded by DEC-20260716-02 item 9 (2026-07-16); superseded by DEC-20260717-01 (2026-07-17) per the durable Founder authorization; original decision body preserved byte-identically
implementation_observed_bindings:
  - provider: openai
    model_env_var: OPENAI_COS_MODEL      # primary; model ID not committed to the repository; example file ships the entry empty
    context: founder-os-telegram intelligent-routing path (COS_INTELLIGENT_ROUTING_ENABLED), merged 2026-07-23 (main @ b4265d49)
  - provider: anthropic
    model_env_var: ANTHROPIC_COS_SECONDARY_MODEL  # conditional secondary; consulted only on an eligible transport-level primary failure
    context: same merge (main @ b4265d49); replaces the retired single-tier ANTHROPIC_COS_MODEL var, which is no longer read anywhere
temporary_task_assignments: []
binding_status: approved             # governance approval active (DEC-20260717-01); runtime_activation: active (DEC-20260801-08, 2026-08-01)
role_compatibility_aliases:
  - chief-of-staff-agent             # prior role-prompt label ("Chief of Staff Agent")
historical_identifiers:
  - plato                            # legacy persona has served Chief-of-Staff-adjacent contexts — not a role alias
```

- **Purpose:** Keep the Founder's attention on the highest-leverage next action; the runtime's request-routing authority.
- **Responsibilities (preserved from the active role contract and runtime evidence):** maintain Founder focus on the highest-leverage next action; surface active objectives, blocking decisions, and open handoffs; classify requests; select approved workflows; route to permitted specialists; enforce existing approval requirements; coordinate execution; surface exceptions; escalate unresolved issues.
- **Known authority — and preserved limits:** routes and coordinates, but cannot invent workflows, create approval policy, independently approve restricted actions, redefine doctrine, alter permissions, override Founder decisions, create hidden governance in code, or become an unrestricted planner or builder (per the active role contract's runtime-orchestration boundary and `/00-system/runtime-boundary.md`).
- **Owned capabilities:** `request-routing` (frozen; the runtime's execution records already use `roleId: 'chief-of-staff'` for the routing step).
- **Identity note:** Chief of Staff is the role. Plato is a legacy persona and capability context; ChatGPT is a surface/product context. The Founder-ratified governance stack (`DEC-20260717-01`, durable authorization https://github.com/MADVenturesLLC/FounderOS/issues/17#issuecomment-4998245091) is `gpt-4o-mini` (openai) approved primary and `claude-haiku-4-5` (anthropic) approved conditional secondary. **Runtime wiring implemented 2026-07-23 and merged** (Founder-directed; `founder-os-telegram` `main` @ `b4265d49` via PR #50, doctrine half `main` @ `a16506b` via PR #82) with Founder-ruled fail-closed semantics recorded in `DEC-20260717-01` v0.4. **`runtime_activation: active` authorized 2026-08-01** via `DEC-20260801-08` for both primary and secondary (conditional escalation only). Live operation still requires Railway env (`COS_INTELLIGENT_ROUTING_ENABLED=true`, `OPENAI_COS_MODEL` / `ANTHROPIC_COS_SECONDARY_MODEL`; the retired `ANTHROPIC_COS_MODEL` should be removed) **and** a matching transcription in `founder-os-telegram` `core/binding-activation.ts` (the runtime does not re-parse this registry at call time). The former Sonnet 5 proposal and its 30-day promotion path (`DEC-20260716-02` item 9) are superseded and preserved as dated `binding_history` above; the MP-2 decision body is unchanged.
- **Evidence sources:** `04-agents/roles/chief-of-staff.md` (active); `core/cos-router.ts`, `core/model-selection.ts`, `core/execution-records.ts`, `.env.example`, `__tests__/cos-router.test.ts`, `__tests__/execution-records.test.ts` (`founder-os-telegram`); `07-decisions/DEC-20260717-01-chief-of-staff-model-stack.md` v0.4; `07-decisions/DEC-20260801-08-chief-of-staff-runtime-activation.md`; `07-decisions/DEC-20260716-02-model-portfolio-and-routing-strategy.md` (proposed-binding recording).

## 16. `deputy-chief-of-staff`

```yaml
role_id: deputy-chief-of-staff
display_name: Deputy Chief of Staff
roster_status: approved-for-future-taxonomy
underlying_contract_status: draft        # 04-agents/roles/deputy-chief-of-staff.md
underlying_decision_status: proposed     # DEC-20260714-01 — preserved historical record; its proposed-only binding treatment superseded by DEC-20260717-02
model_policy_status: proposed            # `deputy-default` runtime policy implementation remains proposed/implementation-observed
runtime_implementation_status: implementation-observed
runtime_routable: yes                    # frozen `executive-coordination` capability, explicit /deputy, kill-switch gated
approved_bindings:
  primary:
    model_id: glm-5.2                    # provider: zai
    mode: standard
    binding_status: approved             # DEC-20260717-02; channel+activation: DEC-20260801-01 v1.1 (P3 zai intl); runtime_activation: active
proposed_bindings: []
binding_history:
  - model_id: glm-5.2
    binding_class: primary
    binding_status: proposed             # dated superseded proposal history: recorded by DEC-20260714-01 (2026-07-14), reconfirmed by DEC-20260716-02 item 10; superseded by DEC-20260717-02 (2026-07-17); original decision body preserved byte-identically
implementation_observed_bindings:
  - provider: zai
    model_env_var: ZAI_DEPUTY_MODEL      # expected glm-5.2; no code default; missing config fails closed — typed runtime evidence, not activation
    context: core/model-selection.ts `deputy-default` policy + adapters/zai-adapter.ts
temporary_task_assignments: []
binding_status: approved                 # governance approval active (DEC-20260717-02); runtime_activation: active (DEC-20260801-01 v1.1)
role_compatibility_aliases:
  - deputy-chief-of-staff-agent      # prior role-prompt label ("Deputy Chief of Staff Agent")
historical_identifiers: []
```

- **Purpose:** The second command layer — bounded delegation under the Chief of Staff.
- **Responsibilities (preserved from the draft contract and first-increment implementation):** receive a delegated objective from Chief of Staff; create a bounded plan; delegate one bounded subtask; use one approved specialist; review specialist output; identify missing or contradictory work; consolidate results; return a recommendation; escalate rejection or failure.
- **Known authority — first-increment implementation evidence (preserved):** explicit `/deputy` command only; kill-switch controlled (`DEPUTY_DELEGATION_ENABLED`); maximum depth one; maximum one specialist child; no recursive specialist delegation; upstream deterministic approval gates; no independent high-risk approval authority.
- **Owned capabilities:** `executive-coordination` (frozen; `routing: explicit-only`).
- **Status note:** the primary governance binding is **approved** by `DEC-20260717-02`. The **deployment channel is closed** and **runtime activation is authorized active** for the primary binding under `DEC-20260801-01` v1.1 (Z.ai international / P3; public + ordinary internal FounderOS coordination; hard exclusions; no P4/`bigmodel.cn`). Live operation remains gated by Railway kill switch + Z.AI env (not by a pending binding). The underlying role contract remains **draft**; `DEC-20260714-01` remains historical. Do not send confidential-or-higher material to `/deputy`.
- **Evidence sources:** `04-agents/roles/deputy-chief-of-staff.md` (draft); `07-decisions/DEC-20260717-02-deputy-binding-ratification.md`; `07-decisions/DEC-20260801-01-deputy-p3-channel-approval.md`; `07-decisions/DEC-20260714-01-deputy-chief-of-staff-role-and-preferred-model.md` (proposed historical); `core/role-policy.ts`, `core/model-selection.ts`, `adapters/zai-adapter.ts` (`founder-os-telegram`); `/00-system/data-boundary-policy.md`.

## 17. `founder-mirror`

```yaml
role_id: founder-mirror
display_name: Founder Mirror
roster_status: approved-for-future-taxonomy
underlying_contract_status: active  # 04-agents/roles/founder-mirror.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases:
  - founder-mirror-agent             # prior role-prompt label ("Founder Mirror Agent")
historical_identifiers: []
```

- **Purpose:** Reflect the Founder's own principles back when behavior drifts from them.
- **Responsibilities:** Principle-consistency reflection.
- **Known authority:** Reflective/advisory only; no implementation or approval authority.
- **Owned capabilities:** none verified.
- **Evidence sources:** `04-agents/roles/founder-mirror.md`.

---

## 18. `chief-strategy-officer`

```yaml
role_id: chief-strategy-officer
display_name: Chief Strategy Officer
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/chief-strategy-officer.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Own portfolio- and venture-scope strategy: cross-venture tradeoffs, strategic thesis formation, and the analysis half of Tier 3 escalations.
- **Responsibilities:** Internal research briefs for Founder ideas and approved ventures; option comparison; opportunity and risk identification; strategy recommendation.
- **Known authority:** Recommendation only. May not initiate external outreach, spend, begin implementation, change portfolio priority, or commit the company to a direction.
- **Authority boundary:** Distinct from `strategist`, which retains single-initiative strategy work and remains the **sole** holder of the doctrine-proposal capability under `DEC-20260720-05`. That capability is not inherited by this role.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/chief-strategy-officer.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary A; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 19. `chief-operating-officer`

```yaml
role_id: chief-operating-officer
display_name: Chief Operating Officer
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/chief-operating-officer.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Own delivery mechanics across approved initiatives: plans, dependencies, milestones, sequencing, and operating cadence.
- **Responsibilities:** Delivery planning and adjustment; cross-initiative throughput; Medium-risk disposition inside the delegated envelope.
- **Known authority:** May not create a new initiative, change approved scope, commit resources, authorize spend, or create external impact without escalation.
- **Authority boundary:** Distinct from `operations-lead`: this role owns cadence **across** initiatives; `operations-lead` owns execution health **within** a department and an approved plan.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/chief-operating-officer.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary B; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 20. `chief-financial-officer`

```yaml
role_id: chief-financial-officer
display_name: Chief Financial Officer
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/chief-financial-officer.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Own financial intelligence and control recommendations at portfolio scope.
- **Responsibilities:** Spend monitoring; cost forecasting; budget modelling; threshold-breach identification; financial recommendation.
- **Known authority:** **May not spend.** No price change, contract, billing activation, or financial commitment. Those are Founder-reserved.
- **Authority boundary:** Distinct from `finance-lead`, which owns departmental finance work inside an approved plan. Neither role may spend.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/chief-financial-officer.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary C; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 21. `chief-marketing-creative-officer`

```yaml
role_id: chief-marketing-creative-officer
display_name: Chief Marketing and Creative Officer
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/chief-marketing-creative-officer.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Own positioning and creative direction at portfolio scope for approved ventures.
- **Responsibilities:** Internal brand, positioning, campaign, and creative drafting; creative direction across approved ventures.
- **Known authority:** Internal-only. May not publish externally, contact customers or partners, make performance claims, or incur marketing spend.
- **Authority boundary:** Distinct from `marketing-lead` (campaign execution) and `brand-lead` (brand-system stewardship).
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/chief-marketing-creative-officer.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary D; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 22. `chief-compliance-officer`

```yaml
role_id: chief-compliance-officer
display_name: Chief Compliance Officer
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/chief-compliance-officer.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Hold the immediate documented stop right over work presenting a plausible governance, privacy, security, legal, credential, or evidence-integrity concern.
- **Responsibilities:** Scoped stop of an active `build_run_id` or `work_order_id`; credential and session freeze; evidence preservation; `incident_id` logging; disposition recommendation; verification check-suite review under charter §6.3.
- **Known authority:** **Holds no override or restart right.** Only the Founder may authorize resumption, clear an incident, or accept the underlying risk.
- **Authority boundary:** **This role alone holds the stop right.** Distinct from `legal-risk` (legal and regulatory analysis) and `security-lead` (security posture): analysis and posture work carry no stop right.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/chief-compliance-officer.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary E; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 23. `security-lead`

```yaml
role_id: security-lead
display_name: Security Lead
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/security-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Own security posture and security-risk recommendations independently of the roles implementing the systems.
- **Responsibilities:** Application and infrastructure security posture; threat modelling; vulnerability governance; secrets, credential, and identity/access review; security architecture review; incident-security readiness.
- **Known authority:** Recommends security exceptions; the Founder alone grants them. Holds no stop right.
- **Authority boundary:** Must not collapse into `builder` or `architect`, or independent security review ceases to exist. Distinct from `chief-compliance-officer`: this role diagnoses, the CCO stops.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/security-lead.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary L; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 24. `data-intelligence-lead`

```yaml
role_id: data-intelligence-lead
display_name: Data & Intelligence Lead
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/data-intelligence-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Own enterprise data strategy, decision-grade analytical truth, cross-venture intelligence, and data-quality stewardship.
- **Responsibilities:** Data architecture stewardship; data quality; analytical definitions; metrics truth; decision-grade data products; intelligence provenance.
- **Known authority:** Stewardship and definition authority within an approved plan. No execution authority over the systems producing the data.
- **Authority boundary:** Distinct from `researcher`, which gathers and synthesizes external evidence and proves what is happening. Evidence collection versus data stewardship.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/data-intelligence-lead.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary F; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 25. `reliability-lead`

```yaml
role_id: reliability-lead
display_name: Reliability / SRE Lead
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/reliability-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Own production reliability and resilience standards across MAD Ventures OS and venture runtimes.
- **Responsibilities:** Service-level objectives; observability requirements; recovery posture; incident readiness; runtime health; capacity; resilience; post-incident learning.
- **Known authority:** Standards and requirements authority. No deployment, migration, or production-change authority.
- **Authority boundary:** Distinct from `operations-lead` (delivery cadence), `architect` (system design), `qa-lead` (verification and acceptance), and `security-lead` (security posture). Reliability is a property of running systems; those four are properties of building them.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/reliability-lead.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary I; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 26. `portfolio-venture-lead`

```yaml
role_id: portfolio-venture-lead
display_name: Portfolio & Venture Lead
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/portfolio-venture-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Own venture lifecycle and cross-venture prioritization across MAD Ventures.
- **Responsibilities:** Portfolio health; venture lifecycle; incubation governance; cross-venture priority conflicts; kill/hold/invest recommendation; venture-cell creation and dissolution recommendation.
- **Known authority:** Recommendation only on kill, hold, invest, and cell lifecycle. Portfolio change is Founder-reserved.
- **Authority boundary:** Distinct from `product-lead`, which owns product definition and stewardship **within** a venture.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/portfolio-venture-lead.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary G; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 27. `growth-commercial-lead`

```yaml
role_id: growth-commercial-lead
display_name: Growth & Commercial Lead
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/growth-commercial-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Own growth, distribution, monetization, partnerships, and revenue-expansion strategy.
- **Responsibilities:** Growth strategy; distribution channels; partnership development; commercial experiments; pricing and monetization opportunity identification; acquisition channels.
- **Known authority:** Strategy and experiment design only. No external commitment, pricing change, or spend.
- **Authority boundary:** Distinct from `marketing-lead`, which owns messaging and campaign **execution**. This role owns revenue and distribution **outcomes**.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/growth-commercial-lead.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary H; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 28. `innovation-futures-lead`

```yaml
role_id: innovation-futures-lead
display_name: Innovation & Futures Lead
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/innovation-futures-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Explore non-obvious technological, behavioral, business-model, and market shifts before they become obvious operating priorities.
- **Responsibilities:** Horizon scanning; weak-signal detection; future scenarios; technology-convergence analysis; business-model disruption theses; contrarian opportunity generation.
- **Known authority:** Advisory only. Produces hypotheses for Council or Core 4 consideration; creates no execution authority.
- **Authority boundary:** Distinct from `researcher` (proves what is happening) and `chief-strategy-officer` (decides implications). This role addresses signals **not yet evidenced**.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/innovation-futures-lead.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary J; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 29. `program-execution-lead`

```yaml
role_id: program-execution-lead
display_name: Program & Execution Lead
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, ratified 2026-08-12
activation_status: active                    # may operate; assignability derives from THIS field
underlying_contract_status: active    # 04-agents/roles/program-execution-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Own cross-functional execution of approved multi-team initiatives without absorbing functional decision authority.
- **Responsibilities:** Program sequencing; dependency management; milestone health; cross-team handoff coordination; blocker escalation; execution-plan integrity.
- **Known authority:** **Holds no functional decision authority.** Coordinates delivery; does not become a universal manager.
- **Authority boundary:** Each functional Lead retains its own domain. Distinct from `chief-operating-officer`, which owns operating cadence across initiatives as an executive.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/program-execution-lead.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.3 boundary K; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## 30. `investment-acquisition-lead`

```yaml
role_id: investment-acquisition-lead
display_name: Investment & Acquisition Lead
roster_status: approved-for-future-taxonomy  # DEC-20260812-03, boundary ratified 2026-08-12
activation_status: deferred                  # NOT assignable/routable/attributable; org plan §7.2;
                                             # excluded from ROLE_ID_REGEX by Founder ruling 2026-08-12
underlying_contract_status: active    # 04-agents/roles/investment-acquisition-lead.md
runtime_routable: no
approved_bindings: []
proposed_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
binding_status: unassigned
role_compatibility_aliases: []
historical_identifiers: []
```

- **Purpose:** Own acquisition sourcing, strategic fit, diligence coordination, deal economics, and portfolio-integration recommendations when MAD Ventures enters active acquisition mode.
- **Responsibilities:** Acquisition opportunity screening; diligence orchestration; strategic fit; unit and deal economics; investment memos; integration analysis; downside scenarios.
- **Known authority:** Recommendation only. **`activation_status: deferred`** — `DEC-20260812-03` (ratified 2026-08-12) established this role's authority boundary and **nothing more**. It carries no assignable authority, is not routable, and is **excluded from `ROLE_ID_REGEX`** so the required `attribution-shape` check rejects any work attributed to it. A separate explicit Founder activation ruling is required before it may be assigned, bound, or attributed; a model binding is a further separate decision after that.
- **Authority boundary:** Distinct from `chief-financial-officer` (portfolio finance and cost control) and `portfolio-venture-lead` (lifecycle of ventures already held). Conditioned by the organizational plan §7.2 on actual acquisition workflows justifying the boundary, not on conceptual usefulness.
- **Owned capabilities:** none.
- **Evidence sources:** `04-agents/roles/investment-acquisition-lead.md`; `/01-constitution/oa-1-authority-decision-rights-escalation-charter.md` §10.2; `07-decisions/DEC-20260812-03-oa-1-authority-decision-rights-escalation-charter.md`.

---

## Roster summary

| role_id | display_name | binding_status | runtime_routable | underlying_contract_status |
|---|---|---|---|---|
| strategist | Strategist | approved (two-tier, DEC-20260720-03): claude-sonnet-5 primary; gpt-5.6-terra operational-only fallback | yes | draft |
| architect | Architect | approved (4-tier) | yes | active |
| builder | Builder | unassigned (temporary fable-5 task assignment only) | yes | active |
| researcher | Researcher | accountability-approved (DEC-20260721-04): accountable for `research` only (`hermes` explicitly excluded by founder ruling — own future decision); no fallback; model bindings unassigned pending §8 pipeline-redesign | yes | draft |
| experience-architect | Experience Architect | unassigned | yes | draft (created at G2) |
| independent-reviewer | Independent Reviewer | active (two-tier, DEC-20260719-02 v1.1): CodeRabbit (Tier 1); full gemini-3.1-pro / gpt-5.6-sol / gpt-5.6-terra / gpt-5.6-luna / grok-4.5; restricted hermes-4-14b / tencent-hy3 | no | active (2026-07-19; roster 2026-07-26, reconciled 2026-08-15) |
| product-lead | Product Lead | approved (primary, DEC-20260812-02): gpt-5.5 | no | active |
| brand-lead | Brand Lead | unassigned | no | active |
| marketing-lead | Marketing Lead | approved (primary, DEC-20260812-02): gemini-3.6-flash | no | active |
| operations-lead | Operations Lead | unassigned | no | active |
| finance-lead | Finance Lead | unassigned | no | active |
| legal-risk | Legal & Risk | unassigned | no | active |
| qa-lead | QA Lead | unassigned | no | active |
| pre-mortem-reviewer | Pre-Mortem Reviewer | approved (primary, DEC-20260812-02): gemini-3.5-flash | no | active |
| chief-of-staff | Chief of Staff | approved (governance; runtime activation active DEC-20260801-08) | yes | active |
| deputy-chief-of-staff | Deputy Chief of Staff | approved (governance; P3 channel + runtime activation active DEC-20260801-01 v1.1) | yes | draft |
| founder-mirror | Founder Mirror | unassigned | no | active |
| chief-strategy-officer | Chief Strategy Officer | unassigned (proposed, DEC-20260812-03) | no | proposed |
| chief-operating-officer | Chief Operating Officer | unassigned (proposed, DEC-20260812-03) | no | proposed |
| chief-financial-officer | Chief Financial Officer | unassigned (proposed, DEC-20260812-03) | no | proposed |
| chief-marketing-creative-officer | Chief Marketing and Creative Officer | unassigned (proposed, DEC-20260812-03) | no | proposed |
| chief-compliance-officer | Chief Compliance Officer | unassigned (proposed, DEC-20260812-03) | no | proposed |
| security-lead | Security Lead | unassigned (proposed, DEC-20260812-03) | no | proposed |
| data-intelligence-lead | Data & Intelligence Lead | unassigned (proposed, DEC-20260812-03) | no | proposed |
| reliability-lead | Reliability / SRE Lead | unassigned (proposed, DEC-20260812-03) | no | proposed |
| portfolio-venture-lead | Portfolio & Venture Lead | unassigned (proposed, DEC-20260812-03) | no | proposed |
| growth-commercial-lead | Growth & Commercial Lead | unassigned (proposed, DEC-20260812-03) | no | proposed |
| innovation-futures-lead | Innovation & Futures Lead | unassigned (proposed, DEC-20260812-03) | no | proposed |
| program-execution-lead | Program & Execution Lead | unassigned (proposed, DEC-20260812-03) | no | proposed |
| investment-acquisition-lead | Investment & Acquisition Lead | unassigned (proposed, DEC-20260812-03; **activation-deferred**) | no | proposed |

## Cross-references
- `/00-system/identity-taxonomy.md` — the class definitions and binding-status taxonomy this registry applies.
- `/00-system/identity-map.md` — the full current-to-future mapping, including every legacy identifier and affected file.
- `/04-agents/model-registry.md` — canonical model definitions for every model referenced above.
- `/04-agents/execution-surface-registry.md`, `/04-agents/interface-registry.md`, `/04-agents/tool-registry.md`, `/00-system/orchestration-framework-registry.md` — the surface/interface/tool/framework registries this role registry is deliberately separate from.
- `04-agents/roles/*` — the role-contract files this registry's evidence is drawn from; retargeted to this roster by the G2 activation package.
- `/00-system/model-portfolio-and-routing-strategy.md`, `/00-system/data-boundary-policy.md` — the portfolio architecture, routing/failure policy, and privacy classes this registry's binding statuses are governed by, per `DEC-20260716-02` and `DEC-20260716-01`.
- `/04-agents/temporary-task-assignment-policy.md` — the lifecycle governing every `temporary_task_assignments` entry above.
