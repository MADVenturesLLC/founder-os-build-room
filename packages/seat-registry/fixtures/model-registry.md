---
title: Model Registry
type: agent
owner: founder
company: mad-ventures
product: mad-ventures-os
status: active
created: 2026-07-15
updated: 2026-08-15
version: 0.18
review_cycle: on-change
source_of_truth: true
related_decisions:
  - DEC-20260715-17-stable-roles-and-replaceable-execution-architecture
  - DEC-20260719-02-independent-reviewer-two-tier-binding
  - DEC-20260717-01-chief-of-staff-model-stack
  - DEC-20260717-02-deputy-binding-ratification
  - DEC-20260715-14-technical-architect-agent-tier
  - DEC-20260714-01-deputy-chief-of-staff-role-and-preferred-model
  - DEC-20260716-02-model-portfolio-and-routing-strategy
  - DEC-20260716-01-data-boundary-policy
  - DEC-20260720-02-architect-fallback-azure-access-channel
  - DEC-20260801-01-deputy-p3-channel-approval
  - DEC-20260807-01-g3-slice-b-plus-coding-execution-surface-governance
  - DEC-20260814-02-tier2-shape-check-gate
related_workflows: []
used_by:
  - builder
read_by:
  - all-active-roles
written_by:
  - builder
tags:
  - agent
  - model
  - registry
  - foundation
  - active
---

# Model Registry

## Purpose
Records the canonical list of AI models referenced by approved bindings, proposed role decisions, verified implementation evidence, historical migration evidence, or temporary task assignments on this pull request, per `/00-system/identity-taxonomy.md` §4. **Every model in this registry owns no independent governance authority** — a model executes work only because a role's binding selected it; the role remains accountable.

**This registry is active and authoritative**, promoted by the G2 activation package: `04-agents/opus.md`, `04-agents/sonnet-5.md`, `04-agents/gemini.md`, `04-agents/fable-5.md`, `04-agents/hermes-4-14b-local.md`, `04-agents/plato-chatgpt.md`, and `04-agents/agent-registry.md` are reconciled to it — each of those files now identifies its subject's identity class and defers governance meaning to the registries and role files. The broader model portfolio architecture, classification ladder, and routing/failure policy are recorded in `/00-system/model-portfolio-and-routing-strategy.md`, ratified by `DEC-20260716-02-model-portfolio-and-routing-strategy` — this registry records the resulting per-model classification, dated availability, and deployment-channel fields, not the policy itself. Every availability, pricing, or release-status claim below carries a `last_verified` date and rests on the evidence gathered for that decision; none is invented.

## Owner
Founder. `builder` maintains structure (G1 drafting executed via Claude Code and the Fable 5 temporary Builder assignment — provenance).

## Used By / Read By
The role registry's binding resolution and, when implemented, any runtime routing layer that resolves a role's binding to a model.

## Written By
`builder`. Provenance: initial foundation via Claude Code; Phase G1 repair via the Fable 5 founder-directed temporary Builder assignment.

## Update Cadence
On-change; this registry reflects already-approved, proposed, observed, or temporary statuses — it does not itself approve new bindings.

## Current Status
Active — promoted by the G2 activation package executing `DEC-20260715-16` item 8 and `DEC-20260715-17` item 16. `migration_status: governance-activated`. `activation_status: active`. **G3 Slice B+ is ratified** (`DEC-20260807-01`, 2026-08-07): `opus-4.7`, `gpt-5.6-sol`, `gpt-5.6-terra`, `deepseek-v4-flash`, `gemini-3.6-flash`, and `gemini-3.5-flash` are added with approved bindings; `grok-4.5`, `sonnet-5`, `glm-5.2`, and `claude-haiku-4-5` each gain a task-scoped `builder` binding. Grok's `builder` binding is not standing authority — it requires a per-task Temporary Task-Assignment until MP-1 activation.

**Tier-2 roster reconciled 2026-08-15** (`DEC-20260719-02` v1.1, founder-directed): full roster is now `gemini-3.1-pro`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `grok-4.5`. `gpt-5.6-terra` gains a Tier-2 binding (superseding its `DEC-20260807-01` not-Tier-2 status); `gpt-5.6-luna` is created as a new entry; `opus-4.8` and `gpt-5.6` are removed. This aligns the registry with the roster the `tier2-shape` gate has enforced since 2026-08-14. See *Tier-2 full roster* at the end of this file for the `model_id` / attestation-id variance.

## Next Action
Permanent binding assignments for unassigned roles follow `/00-system/model-portfolio-and-routing-strategy.md`'s staged evaluation track; routing enforcement remains gated by its own implementation package.

## Done Criteria
Every model referenced by an approved or proposed role binding (per `/04-agents/role-registry.md`) resolves to an entry here; no entry claims a binding status stronger than its governing decision supports.

---

## Registry

### `gemini-3.1-pro`

```yaml
model_id: gemini-3.1-pro
display_name: Gemini 3.1 Pro
provider: google
modes: [standard, invoked]
approved_role_bindings:
  - role_id: architect
    binding_class: primary
    decision: DEC-20260715-14   # active
  - role_id: independent-reviewer
    binding_class: tier-2       # full roster; DEC-20260719-02 v0.7
    mode: invoked
    decision: DEC-20260719-02
proposed_role_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
tier2_attestation_id: gemini-3.1-pro   # matches model_id; no variance
governance_status: approved-binding-architect-primary-and-tier-2-reviewer
model_compatibility_aliases: []
portfolio_classification: approved-binding   # per DEC-20260716-02 §3 classification ladder
last_verified: 2026-07-16   # public availability: preview status (gemini-3.1-pro-preview), not GA — permitted for production use
deployment_channel: P1      # google paid API / Vertex tier, per /00-system/data-boundary-policy.md
```

- **Current implementation use:** the architecture tier's PRIMARY adapter is implemented in `founder-os-telegram` (`adapters/architecture-pipeline-adapter.ts`, Increment 1, merged 2026-07-18 via PR #27 per `DEC-20260715-14`'s Implementation note), env-backed via `GEMINI_ARCHITECT_PRIMARY_MODEL` (ships empty) behind `ARCHITECTURE_TIER_ENABLED` (default off). The fallback transport (Azure channel, `DEC-20260720-01`/`-02`) and the advisor increment (2026-07-23, merged to `main` at `b4265d49`) are likewise implemented behind their own default-off switches. Nothing is live: no model value is committed and the switches are off; an earlier revision of this entry ("tier is doctrine-only; adapters deferred") described the pre-Increment-1 state and is superseded by this dated correction. **Tier 2 independent-reviewer:** invoked outside Telegram (e.g. Gemini app / API / coding surface) per `DEC-20260719-02` v0.7 — no runtime review capability required.
- **Authority statement:** owns no independent governance authority; executes on behalf of the bound role.
- **Evidence sources:** `04-agents/architecture/technical-architect-tier.yaml` (active), `07-decisions/DEC-20260715-14-technical-architect-agent-tier.md` (active), `07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md` (v0.7).

### `deepseek-v4-pro`

```yaml
model_id: deepseek-v4-pro
display_name: DeepSeek V4 Pro
provider: deepseek
modes: [standard, thinking]   # one model; thinking is an API-request parameter, not a separate model — see the naming-correction note below
approved_role_bindings:
  - role_id: architect
    binding_class: secondary
    mode: thinking
    decision: DEC-20260715-14   # active; model_id corrected by DEC-20260716-02 item 7 (naming only)
  - role_id: architect
    binding_class: fallback
    mode: standard
    decision: DEC-20260715-14   # active
proposed_role_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
governance_status: approved-binding-not-yet-runtime-implemented
model_compatibility_aliases: []
historical_identifiers:
  - deepseek-v4-pro-thinking   # prior doctrine-recorded name; matched no provider SKU — corrected by DEC-20260716-02, not a role alias
portfolio_classification: approved-binding   # per DEC-20260716-02 §3 classification ladder
last_verified: 2026-07-16   # official API (China-domiciled) $1.74/$3.48 per MTok; open weights (MIT) also available via US-hosted channels
deployment_channel: azure-ai-foundry   # fallback binding (mode: standard) only, per DEC-20260720-02 — Data Zone: United States (P2); official API (P4) is public-class only per data-boundary-policy.md §5(3). Secondary binding (mode: thinking) implementation remains separately unauthorized.
```

- **Current implementation use:** none verified in this repository. The `founder-os-telegram` implementation of the fallback binding's Azure AI Foundry transport is authorized and tracked under `DEC-20260720-02` / `HO-20260720-01`, not recorded here as `implementation-observed` until verified runtime source/configuration exists in that repo. Per the tier's own governance block, the fallback binding may not independently produce the role's final recommendation.
- **Channel resolution (`DEC-20260720-02`):** the fallback binding's `deployment_channel` was resolved from `undecided` to `azure-ai-foundry`, Data Zone: United States, replacing DeepSeek's own official API (P4, public-class only) as the compliant channel for this internal-class work. Resolution is scoped to the fallback binding; the secondary binding's implementation remains a separate, unauthorized increment.
- **Naming correction (DEC-20260716-02 item 7):** this registry previously carried two entries — `deepseek-v4-pro-thinking` (secondary) and `deepseek-v4-pro` (fallback) — as if they were distinct models. External verification (2026-07-16) found DeepSeek V4 Pro is one hybrid model; thinking mode is toggled by an API request parameter, not a separate model identifier. The two entries are consolidated here into one, with the secondary binding now recording `mode: thinking` explicitly. The tier's four binding classes, models, and routing intent are otherwise unchanged; `DEC-20260715-14` itself is not edited.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `04-agents/architecture/technical-architect-tier.yaml`, `DEC-20260715-14`, `DEC-20260716-02` (naming correction), `DEC-20260720-02` (fallback deployment-channel resolution).

### `grok-4.5`

```yaml
model_id: grok-4.5
display_name: Grok 4.5
provider: xai
modes: [standard, invoked]   # advisor standard; Tier 2 review invoked
approved_role_bindings:
  - role_id: architect
    binding_class: advisor
    decision: DEC-20260715-14   # active
  - role_id: independent-reviewer
    binding_class: tier-2       # full roster; DEC-20260719-02 v0.7
    mode: invoked
    decision: DEC-20260719-02
  - role_id: builder
    binding_class: large-implementation-primary-task-scoped   # DEC-20260807-01; requires a Temporary Task-Assignment per task, not standing authority — see limits
    decision: DEC-20260807-01
    limits: Founder-authorized task-scoped assignment required per task until MP-1 activation; public-class only until xAI channel verification, or explicit internal-class disclosure authorization per task
proposed_role_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
tier2_attestation_id: grok-4.5   # matches model_id; no variance
governance_status: approved-binding-architect-advisor-tier-2-reviewer-and-task-scoped-builder   # advisor runtime wired-not-live; Tier 2 is invoked off-runtime (e.g. grok-build); builder requires per-task Temporary Task-Assignment
model_compatibility_aliases: []
portfolio_classification: approved-binding   # per DEC-20260716-02 §3 classification ladder
last_verified: 2026-07-16   # public availability since 2026-07-08; $2/$6 per MTok; 500k context; native live-search tooling; not yet available in the EU
deployment_channel: unverified   # xAI API data-retention policy could not be independently verified as of last_verified; per data-boundary-policy.md §5 item 4, while retention is unverified advisor use is limited to public-class data only, internal-class use requires explicit, auditable Founder authorization for that specific invocation (no standing internal-class presumption), and confidential/restricted/local-only remain prohibited until retention is verified and qualifying
```

- **Current implementation use:** the advisor increment is implemented in `founder-os-telegram` (merged 2026-07-23, `main` @ `b4265d49`; `adapters/xai-client.ts`, `core/architecture-advisor.ts`) behind `ARCHITECTURE_ADVISOR_ENABLED` (exact-string `true`, default OFF) + `GROK_ARCHITECT_ADVISOR_MODEL` + `XAI_API_KEY` (both unset; ship empty). **Not live**, and enablement is gated: (a) the `deployment_channel: unverified` constraint above stands — per data-boundary-policy §5(4) an unverified advisor provider is public-class-only while architecture requests default internal-class, so the switch must stay off until xAI's retention posture is independently verified (and xAI is provider-class-assigned by decision) or the Founder rules an auditable authorization; (b) the increment carries NO current-data tooling, while the tier specification (`technical-architect-tier.yaml` `web_search: required: true`) requires it — resolving that variance (tooling increment or tier-spec amendment) also gates enablement. Recorded per the 2026-07-23 decision-compiler reconciliation of PR #82. **Tier 2 independent-reviewer:** full roster member per `DEC-20260719-02` v0.7; typically invoked via `grok-build` / xAI surfaces outside Telegram. Same data-boundary rules apply to review material as to advisor material.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `04-agents/architecture/technical-architect-tier.yaml`, `DEC-20260715-14` (v0.4 advisor Implementation note), `DEC-20260716-01` item 6, `DEC-20260719-02` v0.7.

### `glm-5.2`

```yaml
model_id: glm-5.2
display_name: GLM-5.2
provider: zai
modes: [standard]
approved_role_bindings:
  - role_id: deputy-chief-of-staff
    binding_class: primary
    mode: standard
    decision: DEC-20260717-02         # binding; runtime_activation: active (DEC-20260801-01 v1.1)
  - role_id: builder
    binding_class: cursor-secondary-manual-task-scoped   # DEC-20260807-01; does not alter the Deputy primary binding above
    decision: DEC-20260807-01
    limits: public and ordinary-internal only per DEC-20260801-01; no governance/doctrine, confidential-or-higher, secrets, credentials, personal, or production data
proposed_role_bindings: []
binding_history:
  - role_id: deputy-chief-of-staff
    binding_class: primary
    binding_status: proposed          # dated superseded proposal history: recorded by DEC-20260714-01 (2026-07-14), reconfirmed by DEC-20260716-02 item 10; superseded by DEC-20260717-02 (2026-07-17); original decision body preserved byte-identically
    model_policy: deputy-default      # the runtime policy implementation itself remains proposed/implementation-observed
implementation_observed_bindings:
  - role_context: deputy-chief-of-staff
    provider: zai
    model_env_var: ZAI_DEPUTY_MODEL   # expected glm-5.2; no code default; missing config fails closed
    implementation_status: implementation-observed  # adapter path observed; binding activation authorized active DEC-20260801-01 v1.1
temporary_task_assignments: []
governance_status: approved-deputy-primary-runtime-activation-active
model_compatibility_aliases: []
portfolio_classification: approved-binding   # MP-2 §3 ladder — an active Founder decision (DEC-20260717-02) names the role, model, mode, and binding class
last_verified: 2026-07-16   # public availability since 2026-06-13; MIT open weights; Z.ai intl API $1.40/$4.40 per MTok
deployment_channel: P3-zai-international   # DEC-20260801-01 — P3 Z.ai intl; public + ordinary internal FounderOS only; no P4; runtime_activation: active (v1.1)
```

- **Current implementation use:** implemented runtime path — `core/model-selection.ts` resolves the `deputy-default` policy to provider `zai` and env var `ZAI_DEPUTY_MODEL`; `adapters/zai-adapter.ts` pins `https://api.z.ai/api/paas/v4/chat/completions` (international; not `bigmodel.cn`). First production smoke after env enable remains operator-owned; binding is authorized active.
- **Status:** GLM-5.2 is the **approved primary governance binding** for the Deputy Chief of Staff per `DEC-20260717-02`. **Deployment channel is closed** by `DEC-20260801-01` (P3 / Z.ai international, standing approval for public + ordinary internal FounderOS work, hard exclusions for confidential-or-higher and listed categories). **Runtime activation is active** for the Deputy primary binding as of `DEC-20260801-01` v1.1 (P3 standing approval + founder activation clarification). Operational gates remain: `DEPUTY_DELEGATION_ENABLED`, `ZAI_API_KEY`, `ZAI_DEPUTY_MODEL=glm-5.2`. Role contract remains draft. ZDR / US residency / no-training claims are **not** asserted. Confidential-or-higher material must not be sent on this path.
- **Authority statement:** owns no independent governance authority; the `deputy-chief-of-staff` role remains accountable.
- **Evidence sources:** `07-decisions/DEC-20260717-02-deputy-binding-ratification.md`; `07-decisions/DEC-20260801-01-deputy-p3-channel-approval.md`; `07-decisions/DEC-20260714-01-deputy-chief-of-staff-role-and-preferred-model.md` (proposed historical); `04-agents/roles/deputy-chief-of-staff.md` (draft); `core/model-selection.ts`, `core/role-policy.ts`, `adapters/zai-adapter.ts` (`founder-os-telegram`).

### `fable-5`

```yaml
model_id: fable-5
display_name: Fable 5
provider: anthropic  # per the founder-directed repair assignment for this PR; the existing operator file is surface/harness-calibrated and names no provider
modes: []            # none approved
approved_role_bindings: []
proposed_role_bindings: []
implementation_observed_bindings: []   # the `fable` Telegram capability is a stub with no live provider
temporary_task_assignments:
  - role_id: builder
    provider_id: anthropic
    application_id: claude-code
    execution_surface: claude-code
    assignment_type: founder-directed-temporary-task-assignment
    work_item: PR-14-G1-repair        # historical, pre-policy record — lapsed with this work item; no present execution authority; see prose below and /04-agents/temporary-task-assignment-policy.md §9
    permanent_binding_effect: none
governance_status: historical-operator-and-lapsed-temporary-task-assignment
model_compatibility_aliases: []
portfolio_classification: temporary-task-assignment   # historical provenance classification per DEC-20260716-02 §3's ladder — reflects the PR-14-G1-repair assignment's classification at the time it was authorized, not current execution authority; the assignment itself lapsed with that work item and no present temporary assignment exists
last_verified: 2026-07-16   # GA since 2026-06-09; $10/$50 per MTok; "Covered Model" — mandatory 30-day retention, NOT ZDR-eligible
deployment_channel: P1   # anthropic first-party API; rejected for restricted-class work categorically per /00-system/data-boundary-policy.md §5 item 2 (ZDR-ineligible)
```

- **Current implementation use:** none live — the `fable` capability uses the stub adapter.
- **Identity corrections:** `fable-5` is a model identifier. It is **not** a role alias for `experience-architect` (the historical association is recorded as a typed `historical_identifiers` entry on that role and in the identity map). It is **not** the Architect — the architecture function belongs to the `architect` role and its approved tier. It is **not** the permanent Builder — the assignment above was a founder-directed temporary task assignment for this pull request's repair only, with no permanent binding effect; it has since lapsed with that work item and carries no present execution authority (see the historical-record clarification below).
- **Historical record status (correction):** the `temporary_task_assignments` block above predates `/04-agents/temporary-task-assignment-policy.md`'s complete audit schema (`assignment_id`, `created_at`, `expires_at`, `authorized_by`, `authorized_at`, `authorization_reference`, per that policy §3/§5) and does not carry those fields; none is fabricated here to complete it retroactively. It is retained as historical evidence of the assignment's identity, scope, and no-permanent-binding pattern only. Per that policy §9, it is the sole grandfathered pre-policy record and has lapsed with its work item — it is not a current or execution-authorizing assignment.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `04-agents/fable-5.md` (active operator file, unchanged); `capability-registry.ts` (`founder-os-telegram`); this pull request's provenance record; `04-agents/temporary-task-assignment-policy.md` §9 (historical-record grandfather clause).

### `sonnet-5`

```yaml
model_id: sonnet-5
display_name: Sonnet 5
provider: anthropic
modes: [standard]
approved_role_bindings:
  - role_id: builder
    binding_class: large-implementation-fallback-task-scoped   # DEC-20260807-01
    decision: DEC-20260807-01
    limits: engaged only when the grok-4.5 data boundary cannot be satisfied for the task
  - role_id: builder
    binding_class: cursor-alternative-manual-task-scoped   # DEC-20260807-01
    decision: DEC-20260807-01
proposed_role_bindings: []
binding_history:
  - role_id: chief-of-staff
    binding_class: primary
    binding_status: proposed    # dated superseded proposal history: recorded by DEC-20260716-02 item 9 (2026-07-16); superseded by DEC-20260717-01 (2026-07-17) per the durable Founder authorization; original decision body preserved byte-identically
implementation_observed_bindings: []   # see the untyped env-var references section below for the CoS routing path
temporary_task_assignments: []
historical_execution_evidence:
  - work_item: PR-14-G1-initial-implementation
    provider_id: anthropic
    application_id: claude-code
    execution_surface: claude-code
    context: the first three commits of this pull request were produced under a sonnet-5 session
      on the claude-code application/surface, before the current corrective assignment
governance_status: former-cos-proposal-superseded-by-DEC-20260717-01
model_compatibility_aliases: []
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20260807-01 added task-scoped builder bindings (large-implementation-fallback-task-scoped; cursor-alternative-manual-task-scoped); the former proposed-binding classification lapsed with the DEC-20260717-01 supersession and does not describe current status
last_verified: 2026-07-16   # GA; intro pricing $2/$10 per MTok through 2026-08-31, then $3/$15; 1M context; ZDR-eligible
deployment_channel: P1   # anthropic first-party API
```

- **Current implementation use:** `05-workflows/wf-13-code-review.md` names "Sonnet for routine" review as workflow guidance (not a runtime binding); the Chief of Staff intelligent-routing path resolves a model from `ANTHROPIC_COS_MODEL`, whose value is not committed to the repository — so no verified claim ties that path to this specific model ID.
- **Status:** the former Chief of Staff primary **proposal** (`DEC-20260716-02` item 9, including its 30-day promotion path) was **superseded** by `DEC-20260717-01` on 2026-07-17 per the durable Founder authorization, and is preserved above as dated superseded proposal history; the original MP-2 decision body is byte-identical. Sonnet 5 is not the permanent Builder — no active decision establishes that. It now holds two task-scoped, non-permanent `builder` bindings per `DEC-20260807-01`: large-implementation fallback (only when the `grok-4.5` data boundary cannot be satisfied) and Cursor alternative selection.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `04-agents/sonnet-5.md` (unchanged); `01-constitution/agent-rules.md` (Sonnet 5 lane); `05-workflows/wf-13-code-review.md`; `.env.example` (`founder-os-telegram`); this pull request's provenance record.

### `opus-4.8`

```yaml
model_id: opus-4.8
display_name: Opus 4.8
provider: anthropic
modes: [invoked]     # invocation mode only; NO active Tier-2 binding — removed 2026-08-15 (DEC-20260719-02 v1.1). Prior comment cited clause 2 and described an active per-case Tier-2 review, which is no longer true of this entry.
approved_role_bindings: []   # Tier-2 binding removed 2026-08-15 by DEC-20260719-02 v1.1 (founder-directed)
retired_role_bindings:
  - role_id: independent-reviewer
    binding_class: tier-2       # governance/architecture-significant review
    mode: invoked
    decision: DEC-20260719-02   # founder-activated 2026-07-19
    active_from: 2026-07-19
    retired: 2026-08-15
    retired_by: DEC-20260719-02  # v1.1 amendment — founder-directed roster reconciliation
proposed_role_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
governance_status: no-active-binding-tier-2-removed-2026-08-15
model_compatibility_aliases:
  - opus             # model-family alias — resolves to this model entry, never to a role
portfolio_classification: evaluation-candidate   # per DEC-20260716-02 §3 and /00-system/model-portfolio-and-routing-strategy.md §8 (independent-reviewer, strategist, builder)
last_verified: 2026-07-16   # GA; $5/$25 per MTok; 1M context; ZDR-eligible; retirement not before 2027-05-28
deployment_channel: P1   # anthropic first-party API
```

- **Current implementation use:** none verified as a dedicated runtime capability; `01-constitution/agent-rules.md`'s Opus lane and `wf-13`'s "Opus for high-risk" reviewer guidance are lane/workflow evidence, not bindings.
- **Tier 2 binding removed (2026-08-15).** From 2026-07-19 to 2026-08-15 `DEC-20260719-02` bound this model as an `independent-reviewer` Tier 2 **full roster** reviewer (invoked per-case; no runtime capability — Tier 2 is performed outside the Telegram runtime); roster peers as of v0.7 were `gpt-5.6`, `gemini-3.1-pro`, `grok-4.5` (full) and `hermes-4-14b` (restricted). The founder removed it from the roster on 2026-08-15 (`DEC-20260719-02` v1.1). **This model can no longer satisfy Tier-2.** The `tier2-shape` gate has not accepted `opus-4.8` as a `Tier2-Reviewer-Id` since the gate shipped on 2026-08-14 (`DEC-20260814-02`); this entry now matches that behaviour. Verdicts issued while the binding was active remain valid for the work they reviewed.
- **Identity correction:** `opus` is a **model-family compatibility alias** within the model class. It is not a role alias for `independent-reviewer` — that historical association is typed evidence on the role entry and in the identity map.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `04-agents/opus.md` (unchanged); `01-constitution/agent-rules.md` (Opus lane); `05-workflows/wf-13-code-review.md`; `07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md` (tier-2 binding: active v0.7, removed v1.1 on 2026-08-15).

### `hermes-4-14b`

```yaml
model_id: hermes-4-14b
display_name: Hermes 4 14B (Q4_K_M, local)
provider: self-hosted     # locally run, no external provider; executes through the local-runtime execution surface
modes: [invoked]          # Tier 2 restricted only — DEC-20260719-02 clause 5 (rewritten at v0.9, effective 2026-08-07)
approved_role_bindings:
  - role_id: independent-reviewer
    binding_class: tier-2-restricted   # NOT full governance; see DEC clause 5
    mode: invoked
    decision: DEC-20260719-02
proposed_role_bindings: []
implementation_observed_bindings:
  - context: founder-os-telegram `hermes` capability → local worker
    model_env_var: HERMES_LOCAL_MODEL   # value not committed
    implementation_status: implementation-observed
temporary_task_assignments: []
governance_status: approved-binding-tier-2-restricted-plus-implementation-observed-capability
model_compatibility_aliases:
  - hermes-4-14b-local   # prior operator-file slug — resolves to this model entry, never to a role
portfolio_classification: approved-binding   # DEC-20260716-02 §2/§3 — one status only; active restricted Tier-2 approval is DEC-20260719-02 clause 5 as rewritten at v0.9 (implementation evidence stays in implementation_observed_bindings)
last_verified: 2026-07-16   # NousResearch/Hermes-4-14B, Apache 2.0, Qwen3-14B base — runs on a single 24GB GPU quantized
deployment_channel: P5   # self-hosted / local-runtime — zero external data exposure
```

- **Current implementation use:** the `hermes` capability (`provider: hermes`) enqueues work to a local worker (`adapters/local-worker-adapter.ts`, `hermes-worker/index.ts`), gated by `HERMES_ENABLED`/`HERMES_LOCAL_MODEL`. Runtime proof remains under `implementation_observed_bindings`; it does **not** set `portfolio_classification`.
- **Context separation (correction):** "Hermes" spans three distinct typed identities that must never be merged — the **model** (`hermes-4-14b`, this entry), the frozen **capability** (`hermes`, owned per the role registry, never a role alias), and the **local-runtime execution surface** through which the model runs (see the execution-surface registry). None of the three is a role. **"Hermes Agent" is not a separate roster role.**
- **Tier 2 independent-reviewer (restricted):** may act only under `DEC-20260719-02` clause 5 (rewritten at v0.9, effective 2026-08-07) — it may provide paired, **non-binding** Tier-2 findings only and **cannot independently satisfy the binding Tier-2 verdict on any artifact** — not merely on doctrine packages — unless the Founder grants the exact one-task / one-repository / one-committed-SHA local-only exception. Restricted peer: `tencent-hy3`. *(Corrected 2026-08-15: this line previously read "must not alone clear doctrine packages under `07-decisions/`, `01-constitution/`, or `00-system/`", which was clause 5's narrower **v0.8** scope. v0.9 removed the artifact-type qualifier and made the non-binding rule universal; the stale wording would have permitted a restricted model to issue a binding verdict on non-doctrine artifacts.)*
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `04-agents/hermes-4-14b-local.md` (unchanged); `capability-registry.ts`, `adapters/local-worker-adapter.ts`, `hermes-worker/index.ts`, `.env.example` (`founder-os-telegram`, inspected read-only); `DEC-20260719-02` clause 5 (v0.9).

### `tencent-hy3`

```yaml
model_id: tencent-hy3
display_name: Tencent HY3 (local)
provider: self-hosted     # founder-operated local instance (e.g. Ollama); not Tencent cloud API by default
modes: [invoked]          # Tier 2 restricted only — DEC-20260719-02 clause 5 (rewritten at v0.9, effective 2026-08-07)
approved_role_bindings:
  - role_id: independent-reviewer
    binding_class: tier-2-restricted
    mode: invoked
    decision: DEC-20260719-02
proposed_role_bindings: []
implementation_observed_bindings:
  - context: founder local runtime (alongside Hermes weights)
    model_env_var: HERMES_LOCAL_MODEL   # or operator-local tag; value not committed
    implementation_status: founder-reported-2026-07-26
temporary_task_assignments: []
governance_status: approved-binding-tier-2-restricted
model_compatibility_aliases: []
portfolio_classification: approved-binding   # DEC-20260716-02 §2/§3 — one status only; restricted Tier-2 approval is DEC-20260719-02 clause 5 as rewritten at v0.9 (local use evidence stays in implementation_observed_bindings)
last_verified: 2026-07-26   # founder-reported local use; no public pricing/context fetch invented
deployment_channel: P5   # self-hosted / local-runtime
```

- **Current implementation use:** founder operates Tencent HY3 **locally** as a restricted Tier 2 reviewer option (and general local inference). Not a Telegram capability ID of its own; may share the local-runtime / Ollama path used by Hermes depending on operator config. Founder-reported local use remains under `implementation_observed_bindings`; it does **not** set `portfolio_classification`.
- **Tier 2 independent-reviewer (restricted):** same clause 5 rules as `hermes-4-14b` — it may provide paired, **non-binding** Tier-2 findings only and **cannot independently satisfy the binding Tier-2 verdict on any artifact** — not merely on doctrine packages — unless the Founder grants the exact one-task / one-repository / one-committed-SHA local-only exception. Quant/tag changes for this `model_id` are operator config; **adding a different local family (e.g. Qwen) requires a roster amend**. *(Corrected 2026-08-15: previously "not solo on doctrine packages", clause 5's superseded v0.8 scope.)*
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** founder session direction 2026-07-26; `DEC-20260719-02` clause 5 (v0.9).

---

### `gpt-4o-mini`

```yaml
model_id: gpt-4o-mini
display_name: GPT-4o mini
provider: openai
modes: [standard]
approved_role_bindings:
  - role_id: chief-of-staff
    binding_class: primary
    mode: standard
    decision: DEC-20260717-01   # ratified 2026-07-17; runtime wiring Founder-directed 2026-07-23 and merged (see Status bullet); live activation pending
proposed_role_bindings: []
implementation_observed_bindings:
  - env_var: OPENAI_COS_MODEL   # founder-os-telegram main @ b4265d49 (merged 2026-07-23); ruled value gpt-4o-mini, no value committed; read only behind COS_INTELLIGENT_ROUTING_ENABLED
temporary_task_assignments: []
governance_status: approved-cos-primary-governance-binding-runtime-wired-not-live
model_compatibility_aliases: []
portfolio_classification: approved-binding   # MP-2 §3 ladder — an active Founder decision names the role, model, mode, and binding class
last_verified: verification-pending   # direct fetch of the official source returned HTTP 403 from the G2 execution environment (2026-07-16/17); failure ≠ unavailability; no verification date invented; verification_status: pending
source: https://developers.openai.com/api/docs/models/gpt-4o-mini
deployment_channel: verification-pending   # pricing, context limits, retention, regional availability, data-boundary eligibility (per data-boundary-policy.md), routing compatibility, and account/channel availability all verification-pending — these gate runtime activation, not this governance record
```

- **Status:** approved CoS primary governance binding per `DEC-20260717-01` (durable Founder authorization https://github.com/MADVenturesLLC/FounderOS/issues/17#issuecomment-4998245091). The item 3 runtime-wiring package was Founder-directed and merged 2026-07-23 (`founder-os-telegram` `main` @ `b4265d49`; `core/cos-router.ts` via the `cos-routing-primary` model policy and `OPENAI_COS_MODEL`, per `DEC-20260717-01` v0.4's Implementation note). **Wired is not live**: the env value is unset in deployment, the item 7 operational verifications remain pending, and routing fails closed until both are resolved. An earlier revision of this entry ("no environment variable, adapter, or routing logic references this model") described the pre-wiring state and is superseded by this dated correction.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `DEC-20260717-01` (active); the durable Founder authorization above.

### `claude-haiku-4-5`

```yaml
model_id: claude-haiku-4-5
display_name: Claude Haiku 4.5
provider: anthropic
versioned_identifier: claude-haiku-4-5-20251001   # where the provider API supports version pinning
modes: [standard]
approved_role_bindings:
  - role_id: chief-of-staff
    binding_class: secondary
    mode: standard
    decision: DEC-20260717-01   # conditional escalation; ratified 2026-07-17; runtime wiring Founder-directed 2026-07-23 and merged (see Status bullet); live activation pending
  - role_id: builder
    binding_class: light-implementation-task-scoped   # DEC-20260807-01; light work-size class only; chief-of-staff binding above unchanged
    decision: DEC-20260807-01
proposed_role_bindings: []
implementation_observed_bindings:
  - env_var: ANTHROPIC_COS_SECONDARY_MODEL   # founder-os-telegram main @ b4265d49 (merged 2026-07-23); ruled value claude-haiku-4-5, no value committed; consulted only on an eligible transport-level primary failure
temporary_task_assignments: []
governance_status: approved-cos-secondary-governance-binding-runtime-wired-not-live
model_compatibility_aliases: []
portfolio_classification: approved-binding   # MP-2 §3 ladder — an active Founder decision names the role, model, mode, and binding class
last_verified: verification-pending   # direct fetch of the official source returned HTTP 403 from the G2 execution environment (2026-07-16/17); failure ≠ unavailability; no verification date invented; verification_status: pending
source: https://www.anthropic.com/claude/haiku
deployment_channel: verification-pending   # pricing, context limits, retention, regional availability, data-boundary eligibility, routing compatibility, and account/channel availability all verification-pending — these gate runtime activation, not this governance record
```

- **Status:** approved CoS conditional secondary governance binding per `DEC-20260717-01` (durable Founder authorization https://github.com/MADVenturesLLC/FounderOS/issues/17#issuecomment-4998245091). Runtime wiring merged 2026-07-23 (`founder-os-telegram` `main` @ `b4265d49`; `ANTHROPIC_COS_SECONDARY_MODEL` via the `cos-routing-secondary` model policy) — consulted only on a transport-level primary failure per the Founder fail-closed rulings recorded in `DEC-20260717-01` v0.4; a half-configured secondary means primary-only routing. **Wired is not live**: no env value set, item 7 verifications pending.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `DEC-20260717-01` (active); the durable Founder authorization above.

### `gpt-5.6`

```yaml
model_id: gpt-5.6
display_name: GPT-5.6 (ChatGPT)
provider: openai
modes: [invoked]     # invocation mode only; NO active Tier-2 binding — removed 2026-08-15 (DEC-20260719-02 v1.1). Prior comment cited clause 2 and described an active per-case Tier-2 review, which is no longer true of this entry.
approved_role_bindings: []   # Tier-2 binding removed 2026-08-15 by DEC-20260719-02 v1.1 (founder-directed)
retired_role_bindings:
  - role_id: independent-reviewer
    binding_class: tier-2       # governance/architecture-significant review
    mode: invoked
    decision: DEC-20260719-02   # founder-activated 2026-07-19
    active_from: 2026-07-19
    retired: 2026-08-15
    retired_by: DEC-20260719-02  # v1.1 amendment — founder-directed roster reconciliation
proposed_role_bindings: []
implementation_observed_bindings: []   # no runtime integration exists or is authorized; Tier 2 review is performed outside the Telegram runtime (ChatGPT surface)
temporary_task_assignments: []
governance_status: no-active-binding-tier-2-removed-2026-08-15
model_compatibility_aliases: []
portfolio_classification: unverified   # defined DEC-20260716-02 §3 status; supported by this entry's own last_verified: verification-pending — see the ladder-gap note below
last_verified: verification-pending   # entry created 2026-07-19 from DEC-20260719-02's evidence (ChatGPT/GPT-5.6 cross-repository citation work on the 2026-07-19 workflow-ownership audit); provider pricing/context/retention specifics not fetched; no verification date invented
deployment_channel: chatgpt   # accessed via the ChatGPT surface for invoked review, not via a runtime API integration
```

- **Tier 2 binding removed (2026-08-15).** From 2026-07-19 to 2026-08-15 this model held an active `independent-reviewer` Tier 2 **full roster** binding per `DEC-20260719-02` (founder-activated 2026-07-19; roster expanded v0.7 2026-07-26 alongside `opus-4.8`, `gemini-3.1-pro`, `grok-4.5`). The founder removed it from the roster on 2026-08-15 (`DEC-20260719-02` v1.1). **This model can no longer satisfy Tier-2.** The `tier2-shape` gate has not accepted `gpt-5.6` as a `Tier2-Reviewer-Id` since the gate shipped on 2026-08-14 (`DEC-20260814-02`); this entry now matches that behaviour. Verdicts issued while the binding was active remain valid for the work they reviewed. No Telegram runtime capability existed or was authorized for this model as a reviewer.
- **Classification ladder gap (2026-08-15, flagged not filled).** This field read `portfolio_classification: approved-binding` until 2026-08-15, justified by "an active Founder decision names the role, model, mode, and binding class." After the Tier-2 removal no active decision names any binding for this model, so that value became a false claim. **No ladder status in `DEC-20260716-02` §3 means "binding retired":** `evaluation-candidate` requires dated external verification this entry lacks, and `/00-system/model-portfolio-and-routing-strategy.md` §8 does not list `gpt-5.6` as a candidate for any role; `deprecated` means provider end-of-life, which has not been announced; `rejected` means considered and declined, which is not what happened. The field now carries **`unverified`**, which *is* one of the nine defined statuses — "a claim that could not be confirmed from primary or corroborated sources", promoted out by "independent verification". It is accurate on its own terms: this entry's `last_verified` has read `verification-pending` since creation, so its availability, pricing, and retention claims were never confirmed. **An interim revision of this entry carried an invented value, `no-active-classification`, explicitly marked as outside the ladder; that was withdrawn on Tier-1 review** — introducing an unvalidated sentinel into a `source_of_truth: true` registry is itself a data-model change, and no validator or consumer defines it. **The underlying gap is real and remains open for the founder:** the ladder has no status meaning "was bound, no longer is", and `unverified` records why this entry's claims are unconfirmed rather than that its binding ended — `governance_status` carries that. Resolving it needs a ladder amendment or a founder call; it is not the roster amendment's to decide. Note the contrast with `opus-4.8`, which legitimately carries `evaluation-candidate`: §8 does list it as a candidate for `independent-reviewer`, `strategist`, and `builder`, so its classification survives the same retirement.
- **Not the same model as the Codex entries.** `gpt-5.6` is the ChatGPT-surface entry created 2026-07-19. It is distinct from `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`, which are the Codex-surface models on the current roster. Removing `gpt-5.6` does not affect those three.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md` (Context, Rationale, v0.7 expansion, v1.1 removal).

### `gpt-5.5`

```yaml
model_id: gpt-5.5
display_name: GPT-5.5 (research pipeline executive synthesis)
provider: openai
provider_identifier: gpt-5.5
modes: [standard]
approved_role_bindings:
  - role_id: product-lead
    binding_class: primary
    decision: DEC-20260812-02
proposed_role_bindings: []
implementation_observed_bindings:
  - role_id: researcher
    binding_class: pipeline-stage-3-executive-synthesis   # observed in founder-os-telegram core/research-worker.ts (Gemini → Perplexity → GPT-5.5)
governance_status: active-product-lead-primary-binding
portfolio_classification: approved-binding
last_verified: 2026-08-12
deployment_channel: research-pipeline-api   # distinct from gpt-5.6's ChatGPT surface
data_class_boundary: exact task approval plus active OpenAI-channel data boundary
```

- **Status:** registered by `DEC-20260812-02`. Also observed as the unregistered
  stage-3 executive-synthesis model in the research pipeline
  (`core/research-worker.ts`: Gemini → Perplexity → GPT-5.5); that observation is
  recorded as implementation-observed, not as an approved researcher binding.
- **Compatibility note (superseded 2026-08-15):** this entry originally read
  "`gpt-5.6` remains the Tier-2 review SKU (ChatGPT surface, DEC-20260719-02)".
  `gpt-5.6` was removed from the Tier-2 roster on 2026-08-15 (`DEC-20260719-02`
  v1.1, founder-directed), so it is no longer any review SKU. The point the note
  was making still holds: **this `gpt-5.5` entry does not affect Tier-2
  eligibility either way.** If the
  pipeline migrates to a newer SKU, product-lead may be rebound without reopening
  DEC-20260812-02.
- **Authority statement:** owns no independent governance authority.

## Verified runtime model references without committed model IDs

These environment-variable references are verified in `founder-os-telegram`'s `.env.example` and source, but their **values are not committed** anywhere in the repository, so no specific model ID can be claimed for them. They are recorded as implementation-observed reference points, not model entries:

| Env var | Provider | Role context | Notes |
|---|---|---|---|
| `OPENAI_COS_MODEL` | openai | chief-of-staff (intelligent routing, primary) | required only when `COS_INTELLIGENT_ROUTING_ENABLED=true`; ships empty; replaced `ANTHROPIC_COS_MODEL` 2026-07-23 |
| `ANTHROPIC_COS_SECONDARY_MODEL` | anthropic | chief-of-staff (intelligent routing, conditional secondary) | optional; consulted only on an eligible transport-level primary failure; ships empty |
| `ANTHROPIC_COS_MODEL` | anthropic | RETIRED (was: chief-of-staff intelligent routing, single-tier) | no longer read anywhere as of 2026-07-23 (`DEC-20260717-01` v0.4); remove from deployment env |
| `GEMINI_ARCHITECT_PRIMARY_MODEL` | google | architect (primary) | read only behind `ARCHITECTURE_TIER_ENABLED`; ships empty |
| `DEEPSEEK_ARCHITECT_SECONDARY_MODEL` | (via P2 channel, undecided) | architect (secondary — declared-only) | declared per `DEC-20260715-14`; NO code path reads it (deferred increment) |
| `DEEPSEEK_ARCHITECT_FALLBACK_MODEL` | azure (P2 channel per `DEC-20260720-02`) | architect (fallback) | read only behind `ARCHITECTURE_FALLBACK_ENABLED`; ships empty |
| `GROK_ARCHITECT_ADVISOR_MODEL` | xai | architect (advisor) | read only behind `ARCHITECTURE_ADVISOR_ENABLED` (default off); enablement gated — see the `grok-4.5` entry |
| `ANTHROPIC_PLATO_MODEL` | anthropic | strategist (`plato` capability) | ships empty |
| `GEMINI_RESEARCH_MODEL` | google | researcher (pipeline stage 1) | ships empty |
| `PERPLEXITY_RESEARCH_MODEL` | perplexity | researcher (pipeline stage 2) | ships empty; `perplexity` is a provider/product context here, not a role or role alias |
| `OPENAI_RESEARCH_MODEL` | openai | researcher (pipeline stage 3) | ships empty |
| `ZAI_DEPUTY_MODEL` | zai | deputy-chief-of-staff | expected `glm-5.2` per the proposed decision; see the `glm-5.2` entry |
| `HERMES_LOCAL_MODEL` | self-hosted | local Hermes worker (local-runtime execution surface) | see the `hermes-4-14b` entry |

---

## Cross-references
- `/00-system/identity-taxonomy.md` §4/§5/§7 — model, provider, and binding-status definitions.
- `/04-agents/role-registry.md` — the roles these models are (or are not) bound to, with matching statuses.
- `/00-system/identity-map.md` — full current-to-future mapping.
- `/00-system/model-portfolio-and-routing-strategy.md` — the portfolio architecture, classification ladder, and routing/failure policy each entry's `portfolio_classification` field refers to.
- `/00-system/data-boundary-policy.md` — the provider classes (P1–P5) each entry's `deployment_channel` field refers to.
- `/04-agents/temporary-task-assignment-policy.md` — the lifecycle governing every `temporary_task_assignments` entry above.


---

## G3 Slice B+ model additions and routing projection

**Authority state:** active, ratified by `DEC-20260807-01` (2026-08-07).
Registration does not override channel or data-class controls. A route whose
channel, model identity, or permission boundary cannot be verified fails
closed; no model is silently substituted.

### `opus-4.7`

```yaml
model_id: opus-4.7
display_name: Claude Opus 4.7
provider: anthropic
provider_identifier: claude-opus-4-7
modes: [standard, thinking]
approved_role_bindings:
  - role_id: builder
    binding_class: medium-work-primary
    decision: DEC-20260807-01
  - role_id: architect
    binding_class: post-review-reconciliation-read-only
    decision: DEC-20260807-01
  - role_id: strategist
    binding_class: post-review-reconciliation-read-only
    decision: DEC-20260807-01
governance_status: approved-g3-slice-b-plus
portfolio_classification: approved-binding
last_verified: 2026-08-07
source: https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions
deployment_channel: P1-anthropic-first-party
data_class_boundary: active data-boundary policy and exact task scope
surface_availability: [claude-code]
```

Post-review reconciliation is read-only on the reviewed SHA. Any code edit is
a new `builder` execution, produces a new SHA, and requires fresh verification
and review. An execution that authored the code state cannot reconcile it as
an independent post-review execution.

### `gpt-5.6-sol`

```yaml
model_id: gpt-5.6-sol
display_name: GPT-5.6 Sol
provider: openai
provider_identifier: gpt-5.6-sol
modes: [high, xhigh, max]
approved_role_bindings:
  - role_id: builder
    binding_class: codex-complex-analysis-planning-and-surgical-fixes
    decision: DEC-20260807-01
  - role_id: independent-reviewer
    binding_class: tier-2-full-roster
    mode: xhigh
    decision: DEC-20260807-01
tier2_attestation_id: chatgpt-5.6-sol   # the Tier2-Reviewer-Id token the tier2-shape gate accepts — NOT the model_id
governance_status: approved-g3-slice-b-plus
portfolio_classification: approved-binding
last_verified: 2026-08-07
source: https://developers.openai.com/api/docs/models/gpt-5.6-sol
deployment_channel: codex-founder-operated
data_class_boundary: active data-boundary policy and exact task scope
surface_availability: [codex]
```

`high` supports complex analysis, planning, and surgical fixes; `xhigh`
supports Tier-2/high-risk review and fallback implementation; `max` requires
exact Founder authorization and a recorded reason.

Tier-2 roster membership reconfirmed 2026-08-15 by `DEC-20260719-02` v1.1;
this entry's binding is unchanged by that amendment.

### `gpt-5.6-terra`

```yaml
model_id: gpt-5.6-terra
display_name: GPT-5.6 Terra
provider: openai
provider_identifier: gpt-5.6-terra
modes: [high]
approved_role_bindings:
  - role_id: builder
    binding_class: routine-verification-and-bounded-fixes
    decision: DEC-20260807-01
  - role_id: independent-reviewer
    binding_class: tier-2-full-roster
    mode: high
    decision: DEC-20260719-02   # v1.1 amendment, 2026-08-15; founder ratification of 2026-08-14
tier2_attestation_id: chatgpt-5.6-terra   # the Tier2-Reviewer-Id token the tier2-shape gate accepts — NOT the model_id
governance_status: approved-g3-slice-b-plus-tier-2-full-roster
portfolio_classification: approved-binding
last_verified: 2026-08-07
source: https://developers.openai.com/api/docs/models/gpt-5.6-terra
deployment_channel: codex-founder-operated
data_class_boundary: active data-boundary policy and exact task scope
surface_availability: [codex]
```

**Tier-2 status corrected (2026-08-15).** This entry previously read
`governance_status: approved-g3-slice-b-plus-not-tier-2` and carried the flat
sentence "This model cannot satisfy Tier-2." That was correct under
`DEC-20260807-01` (2026-08-07) and is **superseded** by the founder's
ratification of 2026-08-14, recorded in `DEC-20260814-03` and amended into
`DEC-20260719-02` at v1.1 (2026-08-15), which places this model on the Tier-2
full roster. The prior text is preserved in this note as the dated record of
what it said; it is no longer operative. Note the divergence it caused: the
`tier2-shape` gate accepted `chatgpt-5.6-terra` from 2026-08-14 while this
entry still denied the binding.

This model's only declared mode is `high`; unlike `gpt-5.6-sol` it has no
`xhigh`, so Tier-2 review here runs at `high`.

### `deepseek-v4-flash`

```yaml
model_id: deepseek-v4-flash
display_name: DeepSeek V4 Flash
provider: deepseek
provider_identifier: deepseek-v4-flash
modes: [standard]
approved_role_bindings:
  - role_id: builder
    binding_class: hermes-local-code-current-model
    decision: DEC-20260807-01
governance_status: approved-local-builder-not-tier-2
portfolio_classification: approved-binding
last_verified: 2026-08-07
source: https://api-docs.deepseek.com/updates/
deployment_channel: P5-founder-operated-local
data_class_boundary: local-only; external transmission denied unless exactly Founder-authorized
surface_availability: [hermes-local-code]
```

Only a registered, Founder-approved local model may replace this selection.
The actual model is recorded per execution. This entry does not rename or
retire `hermes-4-14b`.

### `gemini-3.6-flash`

```yaml
model_id: gemini-3.6-flash
display_name: Gemini 3.6 Flash
provider: google
provider_identifier: gemini-3.6-flash
modes: [standard]
approved_role_bindings:
  - role_id: independent-reviewer
    binding_class: supplemental-fast-review-non-binding-primary
    decision: DEC-20260807-01
  - role_id: marketing-lead
    binding_class: primary
    decision: DEC-20260812-02
governance_status: approved-supplemental-review-not-tier-1-or-tier-2; active-marketing-lead-primary-binding
portfolio_classification: approved-binding
last_verified: 2026-08-07
source: https://ai.google.dev/gemini-api/docs/latest-model
deployment_channel: antigravity-primary; google-ai-studio-api-fallback
data_class_boundary: exact task approval plus active Google-channel data boundary; unresolved channel fails closed
surface_availability: [antigravity, google-ai-studio-api]
```

This model cannot replace CodeRabbit Tier-1 or satisfy binding Tier-2.

### `gemini-3.5-flash`

```yaml
model_id: gemini-3.5-flash
display_name: Gemini 3.5 Flash
provider: google
provider_identifier: gemini-3.5-flash
modes: [standard]
approved_role_bindings:
  - role_id: independent-reviewer
    binding_class: supplemental-fast-review-non-binding-fallback
    decision: DEC-20260807-01
  - role_id: pre-mortem-reviewer
    binding_class: primary
    decision: DEC-20260812-02
governance_status: approved-supplemental-review-not-tier-1-or-tier-2; active-pre-mortem-reviewer-primary-binding
portfolio_classification: approved-binding
last_verified: 2026-08-07
source: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash
deployment_channel: antigravity-primary; google-ai-studio-api-fallback
data_class_boundary: exact task approval plus active Google-channel data boundary; unresolved channel fails closed
surface_availability: [antigravity, google-ai-studio-api]
```

This model cannot replace CodeRabbit Tier-1 or satisfy binding Tier-2.

### G3 Slice B+ Builder bindings for existing registered IDs — applied

Ratified 2026-08-07 by `DEC-20260807-01`. The task-scoped `builder` bindings
below are now recorded directly on each model's own `approved_role_bindings`
entry above (`grok-4.5`, `sonnet-5`, `glm-5.2`, `claude-haiku-4-5`) — this
table is a summary cross-reference, not a separate authority:

| Work/surface | Route | Exact limit |
|---|---|---|
| large implementation | `grok-build` / `grok-4.5` primary | not standing authority — a task-scoped Temporary Task-Assignment is required per task until MP-1 activation; public-class only until xAI channel verification, or explicit internal-class disclosure authorization; secrets, credentials, production/personal data, and confidential-or-higher excluded unless separately and exactly authorized |
| large fallback | `claude-code` / `sonnet-5` | only when the Grok data boundary cannot be satisfied |
| light implementation | `claude-code` / `claude-haiku-4-5` | reuse the registered ID; no `haiku-4.5` duplicate |
| Cursor primary/alternative | `grok-4.5` / `sonnet-5` | exact manual selection; Cursor Auto prohibited |
| Cursor secondary | `glm-5.2` | public and ordinary-internal only; no governance/doctrine, confidential-or-higher, secrets, credentials, personal data, or production data; does not alter the Deputy runtime binding |
| Gemini binding Tier-2 | `gemini-3.1-pro` | existing closed-roster entry retained; other Gemini models do not inherit Tier-2 authority |

These additions do not replace or retire any existing registered model.

---

## Tier-2 roster reconciliation (`DEC-20260719-02` v1.1, 2026-08-15)

**Authority for everything in this section is `DEC-20260719-02` v1.1**, on the
founder's ratification statement of 2026-08-14 recorded verbatim in
`DEC-20260814-03`, and the founder's direction of 2026-08-15. It is **not**
`DEC-20260807-01`.

This section exists because of a Tier-1 review finding: `gpt-5.6-luna` was
initially placed inside *G3 Slice B+ model additions and routing projection*,
whose stated authority is `DEC-20260807-01` — a decision that did not add Luna.
A reader or cross-reference checker scanning by section would have attributed
Luna's binding to the wrong decision. The roster cross-reference below sat in
the same section and carried the same defect. Both are moved here rather than
annotated in place, so section context and authority agree.

`gpt-5.6-terra` deliberately stays in the G3 Slice B+ section: its *entry* was
created by `DEC-20260807-01`, and only the Tier-2 binding it gained on
2026-08-15 comes from v1.1 — recorded inline on that binding's own `decision:`
field, where it cannot be misread.

### `gpt-5.6-luna`

```yaml
model_id: gpt-5.6-luna
display_name: GPT-5.6 Luna
provider: openai
provider_identifier: gpt-5.6-luna
modes: [invoked]     # tier-2 review is invoked per-case, never automatic (DEC-20260719-02 clause 3); provider mode tiers not verified — see below
approved_role_bindings:
  - role_id: independent-reviewer
    binding_class: tier-2-full-roster
    mode: invoked
    decision: DEC-20260719-02   # v1.1 amendment, 2026-08-15; founder ratification of 2026-08-14
proposed_role_bindings: []
implementation_observed_bindings: []   # no runtime integration exists or is authorized; Tier 2 review is performed outside the Telegram runtime (Codex surface)
temporary_task_assignments: []
tier2_attestation_id: chatgpt-5.6-luna   # the Tier2-Reviewer-Id token the tier2-shape gate accepts — NOT the model_id
governance_status: active-independent-reviewer-tier-2-binding
model_compatibility_aliases: []
portfolio_classification: approved-binding   # an active Founder decision names the role, model, mode, and binding class
last_verified: verification-pending   # entry created 2026-08-15 from the founder's 2026-08-14 ratification statement; provider pricing, context limits, mode tiers, retention, and catalog availability NOT fetched — no verification date invented
source: verification-pending           # no provider documentation URL verified for this model_id
deployment_channel: verification-pending   # governance sentinel, not a P1-P5 provider class. `codex-founder-operated` describes the EXECUTION SURFACE (see surface_availability), not a verified provider retention posture; asserting it here would imply a boundary check that has not been run
data_class_boundary: fail-closed pending provider verification — public-class only; internal-class review material requires explicit, auditable per-invocation Founder authorization, and confidential/restricted/local-only remain prohibited until retention is verified and qualifying (DEC-20260716-01 §5 item 4 / clause 6)
surface_availability: [codex]
```

- **Data boundary fails closed (2026-08-15).** An interim revision of this entry
  copied `deployment_channel: codex-founder-operated` and the generic
  `data_class_boundary` line from the `gpt-5.6-sol` / `gpt-5.6-terra` entries.
  That was inconsistent with the rest of this record: those two carry a dated
  2026-08-07 provider check and this one carries none, so the copied fields
  asserted a verified provider posture that does not exist. Corrected on Tier-1
  review to the `verification-pending` sentinel — the same governance device
  `deepseek-v4-pro` and `glm-5.2` use for founder-deferred channels — with the
  `DEC-20260716-01` unverified-provider rule stated explicitly. **Practical
  effect: route only public-class material to this reviewer until the catalog
  check lands.** `surface_availability: [codex]` is unaffected; the Codex
  surface is observed, not inferred.
- **Origin.** Created 2026-08-15 by `DEC-20260719-02` v1.1. Unlike
  `gpt-5.6-sol` and `gpt-5.6-terra`, this model was **not** added by
  `DEC-20260807-01` — it enters the registry solely on the founder's
  ratification statement of 2026-08-14 recorded in `DEC-20260814-03`
  (*"Codex models (Chatgpt 5.6 Sol, Terra and Luna)"*), the same statement
  the `tier2-shape` gate's roster regex was built from on 2026-08-14. Until
  this entry existed, the gate accepted a reviewer id that resolved to no
  registered model.
- **Open verification item.** Provider identity, mode tiers, pricing,
  context window, and retention posture are **unverified**. Sol and Terra
  each carry a `last_verified: 2026-08-07` date and a provider
  documentation URL from `DEC-20260807-01`'s catalog check; no equivalent
  check has been run for this model, and none is fabricated here. The
  binding is a governance record, not a verification claim — the same
  pattern the `gpt-5.6` entry used at creation. Resolve at the next
  catalog verification pass.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md` (v1.1 amendment); `07-decisions/DEC-20260814-03-governance-change-freeze.md` (Founder Ratification section, verbatim statement); `00-system/scripts/tier2-shape-check.sh` (`REVIEWER_ROSTER_REGEX`).

### Tier-2 full roster — current, and the `model_id` / attestation-id variance

Cross-reference only; the authority is `DEC-20260719-02` clause 2 (v1.1,
2026-08-15) and the binding lives on each model's own entry above.

| `model_id` (this registry) | `Tier2-Reviewer-Id` (the gate accepts) | Same string? |
|---|---|---|
| `gemini-3.1-pro` | `gemini-3.1-pro` | yes |
| `gpt-5.6-sol` | `chatgpt-5.6-sol` | **no** |
| `gpt-5.6-terra` | `chatgpt-5.6-terra` | **no** |
| `gpt-5.6-luna` | `chatgpt-5.6-luna` | **no** |
| `grok-4.5` | `grok-4.5` | yes |

**The variance is live and it bites.** `00-system/scripts/tier2-shape-check.sh`
matches `Tier2-Reviewer-Id:` against a fixed regex that spells the three Codex
models with a `chatgpt-` prefix, while this registry — following
`DEC-20260807-01` — spells them `gpt-`. A marker written with the `model_id`
form (`Tier2-Reviewer-Id: gpt-5.6-sol`) **fails** the gate with *"not on the
founder-ratified roster"*, even though the model is genuinely on the roster.
Write the attestation id.

Neither spelling is renamed here: changing the `model_id` would break
`DEC-20260807-01`'s references, and changing the regex would edit a gate
ratified 2026-08-14. Recording the mapping is the smaller, reversible fix.
**Open item for the founder** — worth collapsing to one spelling at the next
occasion that already touches the gate, so the trap stops existing.

**Removed from the Tier-2 roster 2026-08-15** (`DEC-20260719-02` v1.1,
founder-directed): `opus-4.8` and `gpt-5.6`. Their entries above are retained
with `retired_role_bindings` and are not deleted. The restricted local roster
(`hermes-4-14b`, `tencent-hy3`) is unchanged and remains non-binding per
clause 5.
