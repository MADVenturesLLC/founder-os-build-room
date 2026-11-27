---
title: Model Registry
type: agent
owner: founder
company: mad-ventures
product: mad-ventures-os
status: active
created: 2026-07-15
updated: 2026-11-18
version: 0.32
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
  - DEC-20261016-01-gemini-4-argon-architect-antigravity-lane
  - DEC-20261019-01-model-registry-repin
  - DEC-20261020-01-surface-bound-builder-and-tier2-lanes
  - DEC-20261027-02-moonshot-kimi-channel-classification
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

**Tier-2 roster reconciled 2026-08-15** (`DEC-20260719-02` v1.1, founder-directed): full roster is now `gemini-3.1-pro`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `grok-4.5`. `gpt-5.6-terra` gains a Tier-2 binding (superseding its `DEC-20260807-01` not-Tier-2 status); `gpt-5.6-luna` is created as a new entry; `opus-4.8` and `gpt-5.6` are removed. This aligns the registry with the roster the `tier2-shape` gate has enforced since 2026-08-14. See *Tier-2 full roster* in the amendment record below for the `model_id` / attestation-id variance.

**Tier-2 attestation by surface, 2026-10-11** (`FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION`, recorded in `DEC-20260719-02` v1.2): in FounderOS a binding Tier-2 verdict now names the execution surface the review ran on (`antigravity`, `codex`, `chatgpt` or `grok-build`) and records the model in a `Tier2-Reviewer-Model:` line without binding it. A model's entry in this registry is no longer a condition of a binding FounderOS verdict. Two model rules still bind whatever the surface: a restricted-roster model never issues a binding verdict, and a model's data-boundary condition binds any review it performs. The per-model Tier-2 bindings below stay in force as the roster for Build Room reviews (`DEC-20260815-05`); for FounderOS they, and their `tier2_attestation_id` fields, are dated history. (For Build Room, superseded by `DEC-20261020-01` Amendment 4 when FounderOS pull request 434 merges: see the entry below.) Build Room and `madventures-tui` keep their own review rules.


**Tier-2 roster reconciled 2026-10-19 — Antigravity** (`DEC-20261019-01` Clause A, founder-directed): `gemini-3.1-pro` is replaced by `gemini-4-argon` on the architect primary lane and the independent-reviewer Tier-2 lane. The surface no longer serves `gemini-3.1-pro` at any effort (catalog read 2026-10-19 with `agy models`). Prior bindings are retired, not erased; verdicts issued while they were active remain valid for the work they reviewed.

**Tier-2 roster reconciled 2026-10-19 — GPT-6 and Claude 5.5** (`DEC-20261019-01` Clauses B and D, founder-directed): `gpt-5.6-sol`, `gpt-5.6-terra` and `gpt-5.6-luna` are replaced by `gpt-6.1-sol`, `gpt-6-astra` and `gpt-6-luna`. `gpt-5.6-terra` → `gpt-6-astra` is an **explicit substitution, not a rename**. `claude-opus-5.5` and `claude-sonnet-5.5`, already registered to executive seats, gain Build Room builder and Tier-2 bindings and are served on the `antigravity` surface. The roster is now `gemini-4-argon`, `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-luna`, `grok-4.5`, plus the Claude 5.5 pair as `antigravity`-served lanes.

**Lanes bound by surface, 2026-10-22** (`DEC-20261020-01`, active since FounderOS pull request 389 merged as `ba3b6184287cc70b526dfd0ed7edd756aa09ddd7`, with Amendment 1 since pull request 391 merged as `5b047ca03165e69a5f9ab57a31011b663545f5c2`): Build Room builder seat lanes and `independent-reviewer` Tier-2 lanes now bind to `surface:provider` with a model allowlist; see *Lanes* below. It corrects the paragraph above: `claude-opus-5.5`'s builder lane is `claude-code:anthropic`, not the `antigravity` surface, and Antigravity serves the Claude 5.5 pair only on the `antigravity:anthropic` Tier-2 lane (`DEC-20261020-01` clause 9). `claude-sonnet-5.5` holds a Tier-2 binding only, not a builder binding (`DEC-20261019-01` Clause D). The 2026-10-19 Antigravity paragraph and the `gemini-3.1-pro` retirement note say `DEC-20261019-01` Clause A moves the architect `primary` lane; that ruling says "The architect primary lane stays as DEC-20261016-01 binds it", and the `gemini-4-argon` YAML binds it so. These corrections answer items 3 and 4 of the known inconsistencies `DEC-20261019-01` records; items 1 and 2, the Claude 5.5 and `gemini-4-argon` attestation ids, are answered by the field's retirement. `claude-fable-5.1` gains the Build Room builder binding on `claude-code:anthropic`. The per-model `tier2_attestation_id` field is retired on the seven lane models that carried it.

**Grok models registered, 2026-10-25** (`DEC-20261020-01`: its clause 2 table admits them "on registration", following the Founder's answer of 2026-10-21, "Add served models"): `grok-4.6`, `grok-4.7` and `grok-4.7-build-fast` gain entries built from xAI's documentation and join the `grok-build:xai` Tier-2 allowlist. Each is public-class only while xAI's data-retention terms stay unverified. `grok-4.7-build-fast`'s id string is the one `grok-build` reports; xAI documents the variant as Grok 4.7 Fast but publishes no ID for it. `claude-fable-5.5` stays unregistered: Anthropic has not released it.

**`claude-fable-5.2` registered and added to the `claude-code:anthropic` builder lane, 2026-11-17** (`DEC-20261020-01` clause 2: "Adding to it is a Founder act recorded in `/04-agents/model-registry.md`"): the entry below is built from Anthropic's documentation, read 2026-11-17. The Founder's direction, given in the builder's session on 2026-11-17, verbatim: "keep claude-fable-5-2". It followed the builder's report that the session's model, `claude-fable-5-2`, was not on the lane's allowlist and that Build Room builder work on it needed this entry and this addition. The Founder's SHA-named merge authorization of the pull request that carries this entry names the addition. The model binds to the builder lane only: `experience-architect` primary stays `claude-fable-5.1` (`DEC-20261005-01`). It is a Covered Model under Anthropic's data-retention terms (30-day retention, no Zero Data Retention), as `claude-fable-5.1` and `fable-5` are on the same page; `/00-system/data-boundary-policy.md` names only Fable 5 in its §2 note and §5 item 2, and is not edited here.

**Tier-2 lanes bound to surface and provider alone, 2026-11-18** (`FOUNDER-RULING-20261118-TIER2-SURFACE-LANES`, recorded as Amendment 4 to `DEC-20261020-01`; in force when FounderOS pull request 434 merges): the four Build Room Tier-2 lanes keep their `surface:provider` tokens and lose their allowlists; a review records its model in its `Tier2-Reviewer-Model:` line, and its model stops it only on the conditions the *Lanes* section names. Builder lanes are unchanged. Its consumers act, `FOUNDER-ACT-20261118-TIER2-SURFACE-LANES-CONSUMERS`, brings this registry's remaining Build Room roster statements into line, each with its superseded wording kept.

**Registry consolidated 2026-10-30 — structure only, no binding change.** The
forty-three model entries were previously distributed across this file's
`Registry` section and six further sections titled after the decision that
introduced each group (`G3 Slice B+ …`, `Bindings added by DEC-20261005-01`,
`Tier-2 roster reconciliation`, `Binding added by DEC-20261016-01`,
`Bindings added by DEC-20261019-01`, `Entries registered under DEC-20261020-01`),
so finding a model required knowing which decision had registered it. There is
now one `Registry` section, ordered alphabetically by `model_id`. Every entry is
carried over byte-for-byte — no `model_id`, `approved_role_bindings`,
`portfolio_classification`, `binding_status`, `last_verified`, or evidence line
was altered — and the six former sections are preserved verbatim as `###`
subsections of the *Amendment and reconciliation record*, each opening with the
list of entries it used to hold, so every original heading and every
decision-to-model mapping still resolves. `Lanes` and the verified-runtime-env
table keep their own `##` sections. Record-keeping under the G2 documentation
governance (`DEC-20261025-01`); no authority, binding, or activation state is
changed by the reorganisation.

## Next Action
Permanent binding assignments for unassigned roles follow `/00-system/model-portfolio-and-routing-strategy.md`'s staged evaluation track; routing enforcement remains gated by its own implementation package.

**2026-10-05:** `DEC-20261005-01` (ratified by the Founder 2026-10-05) added the sixteen entries below and amended two, binding eighteen seats. Routing enforcement remains gated by MP-1. **2026-10-05 (later):** `DEC-20261005-03` recorded the complete-route records and the sensitive-seat boundary records on seven of the entries below (fields `route_record` / `boundary_record`).

## Done Criteria
Every model referenced by an approved or proposed role binding (per `/04-agents/role-registry.md`) resolves to an entry here; no entry claims a binding status stronger than its governing decision supports.

---

## Registry

One entry per model id, **ordered alphabetically by `model_id`** — not by the
decision that registered it. The decision that created or last amended an entry
is named in that entry's own `approved_role_bindings[].decision` field, and the
reconciliation prose it was originally introduced under is preserved in the
*Amendment and reconciliation record* below. The `Lanes` section and the
*Verified runtime model references* table follow this registry directly.

### `claude-fable-5.1`

```yaml
model_id: claude-fable-5.1
display_name: Claude Fable 5.1
provider: anthropic
provider_identifier: claude-fable-5.1
modes: [standard]
approved_role_bindings:
  - role_id: experience-architect
    binding_class: primary
    decision: DEC-20261005-01
  - role_id: builder
    binding_class: large-implementation-primary-task-scoped
    decision: DEC-20261020-01   # clause 2: claude-code:anthropic builder allowlist
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: claude-code:anthropic
    role_id: builder
governance_status: active-experience-architect-primary-and-build-room-builder
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://docs.anthropic.com/en/release-notes/api
deployment_channel: P1
data_class_boundary: active data-boundary policy; US-domiciled first-party
```

- **Binding:** `experience-architect` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. Current Fable; `fable-5.5` is not released (parked in DEC-20261005-01). **Build Room builder:** on the `claude-code:anthropic` builder lane's allowlist, `DEC-20261020-01` clause 2 (active 2026-10-21); `claude-fable-5.5` joins that allowlist only once its own entry merges.
- **Authority statement:** owns no independent governance authority; the `experience-architect` role remains accountable.

### `claude-fable-5.2`

```yaml
model_id: claude-fable-5.2
display_name: Claude Fable 5.2
provider: anthropic
provider_identifier: claude-fable-5-2   # Anthropic's Claude API ID (models overview, read 2026-11-17); the 5.1 and 5.5 entries carry dotted values, not changed here
modes: [standard]
approved_role_bindings:
  - role_id: builder
    binding_class: large-implementation-primary-task-scoped
    decision: DEC-20261020-01   # clause 2: claude-code:anthropic builder allowlist, added by Founder act 2026-11-17
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: claude-code:anthropic
    role_id: builder
governance_status: active-build-room-builder
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261020-01 clause 2 lane addition by Founder act, 2026-11-17
last_verified: 2026-11-17
source: https://platform.claude.com/docs/en/about-claude/models/overview
deployment_channel: P1
data_class_boundary: Covered Model under Anthropic's data-retention terms — 30-day retention, not ZDR-eligible unless Anthropic expressly authorizes it; no restricted-class work (data-boundary policy §4)
```

- **Binding:** Build Room builder only, on the `claude-code:anthropic` builder lane's allowlist by the Founder's act of 2026-11-17 (`DEC-20261020-01` clause 2). It holds no other role binding: `experience-architect` primary stays `claude-fable-5.1` (`DEC-20261005-01`).
- **The Founder's direction, verbatim** (builder's session, 2026-11-17): "keep claude-fable-5-2". It followed the builder's report that the session's model was not on the lane's allowlist and that Build Room builder work on it needed this entry and this addition. The Founder's SHA-named merge authorization of the pull request carrying this entry names the addition. Work the model served on a Build Room lane before this entry merged is off-list (*Lanes*, below); none was offered.
- **Provider documentation, read 2026-11-17:** Anthropic's models overview (`https://platform.claude.com/docs/en/about-claude/models/overview`) lists Claude Fable 5.2 with Claude API ID `claude-fable-5-2`, a 1M-token context window, 128K max output tokens and $8 / $40 per MTok, retirement "Not sooner than November 9, 2027". Its API release notes (`https://platform.claude.com/docs/en/release-notes/api`): "We've launched **Claude Fable 5.2** (`claude-fable-5-2`), built for demanding reasoning and long-horizon agentic work", dated 2026-11-09.
- **Data boundary, read 2026-11-17:** Anthropic's API and data retention page (`https://platform.claude.com/docs/en/build-with-claude/zero-data-retention`) names "Claude Fable 5.2, Claude Mythos 5.2, Claude Fable 5.1, Claude Mythos 5.1, Claude Fable 5, and Claude Mythos 5" as Covered Models: "They require 30-day data retention. ZDR is therefore not available for any of them unless expressly authorized by Anthropic." Under `/00-system/data-boundary-policy.md` §4 that excludes restricted-class work, which needs ZDR. The builder lane's work is public or internal class.
- **Display name:** `Claude Fable 5.2` is the name the claude-code harness writes in `Co-Authored-By:`, which Build Room's served-model check maps to this `model_id` (`DEC-20261020-01` clause 3).
- **Authority statement:** owns no independent governance authority; the `builder` role remains accountable.

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

### `claude-opus-5.5`

```yaml
model_id: claude-opus-5.5
display_name: Claude Opus 5.5
provider: anthropic
provider_identifier: claude-opus-5.5
modes: [standard]
approved_role_bindings:
  - role_id: chief-compliance-officer
    binding_class: primary
    decision: DEC-20261005-01
  - role_id: builder
    binding_class: large-implementation-primary-task-scoped
    decision: DEC-20261020-01   # clause 2, lane claude-code:anthropic; first bound by DEC-20261019-01 Clause D, superseded by clause 9
  - role_id: independent-reviewer
    binding_class: tier-2
    decision: DEC-20261020-01   # clause 2, lane antigravity:anthropic; first bound by DEC-20261019-01 Clause D, superseded by clause 9
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: claude-code:anthropic
    role_id: builder
  - lane: antigravity:anthropic
    role_id: independent-reviewer
# tier2_attestation_id retired (DEC-20261020-01 clause 6); was: claude-code
governance_status: active-compliance-primary-and-build-room-builder-and-tier-2-reviewer
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://support.claude.com/en/articles/12138966-release-notes
deployment_channel: P1
data_class_boundary: sensitive-seat row (DEC-20260813-03 item 9): US-domiciled first-party; exact task-scope, channel and retention posture recorded at execution
boundary_record: recorded 2026-10-05 (`DEC-20261005-03`) — seat `chief-compliance-officer` ("Hold the immediate documented stop right over work presenting a plausible governance, privacy, security, legal, credential, or evidence-integrity concern"); provider Anthropic, US; ZDR available to qualified accounts (platform.claude.com API and data retention).
```

- **Binding:** `chief-compliance-officer` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. Released 2026-09-22, first of the Claude 5.5 family; the stop-right seat takes the top current brain.
- **Authority statement:** owns no independent governance authority; the `chief-compliance-officer` role remains accountable.

### `claude-sonnet-5.5`

```yaml
model_id: claude-sonnet-5.5
display_name: Claude Sonnet 5.5
provider: anthropic
provider_identifier: claude-sonnet-5.5
modes: [standard]
approved_role_bindings:
  - role_id: security-lead
    binding_class: primary
    decision: DEC-20261005-01
  - role_id: independent-reviewer
    binding_class: tier-2
    decision: DEC-20261020-01   # clause 2, lane antigravity:anthropic; first bound by DEC-20261019-01 Clause D, superseded by clause 9
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: antigravity:anthropic
    role_id: independent-reviewer
# tier2_attestation_id retired (DEC-20261020-01 clause 6); was: claude-code
governance_status: active-security-lead-primary-and-tier-2-reviewer
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://support.claude.com/en/articles/12138966-release-notes
deployment_channel: P1
data_class_boundary: sensitive-seat row (DEC-20260813-03 item 9): US-domiciled first-party; exact task-scope, channel and retention posture recorded at execution
boundary_record: recorded 2026-10-05 (`DEC-20261005-03`) — seat `security-lead` ("Own security posture and security-risk recommendations independently of the roles implementing the systems"); provider Anthropic, US; ZDR available to qualified accounts (platform.claude.com API and data retention).
```

- **Binding:** `security-lead` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. Released 2026-09-28. Chosen over a retention-gated provider for this seat; the grok path re-opens only when xAI retention is verified.
- **Authority statement:** owns no independent governance authority; the `security-lead` role remains accountable.

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

### `deepseek-v4.1-flash`

```yaml
model_id: deepseek-v4.1-flash
display_name: DeepSeek V4.1 Flash
provider: ollama-cloud
provider_identifier: deepseek-v4.1-flash
modes: [standard]
approved_role_bindings:
  - role_id: architect
    binding_class: br-architect-primary
    decision: DEC-20260912-01
  - role_id: data-intelligence-lead
    binding_class: primary
    decision: DEC-20261005-01
    note: complete-route classification record owed at execution (DEC-20261005-01)
governance_status: approved-binding
portfolio_classification: approved-binding
last_verified: 2026-09-12
source: https://ollama.com/v1/models
deployment_channel: P3-ollama-cloud
data_class_boundary: public and ordinary internal FounderOS only; no confidential-or-higher material
surface_availability: [hermes-local-code]
route_record: complete-route classification recorded 2026-10-05 (`DEC-20261005-03`) — US-hosted `ollama-cloud` channel (P3 posture per `DEC-20260912-01`); transient processing, no training (ollama.com/privacy); public + ordinary-internal only; no confidential-or-higher.
```

**Ratified `approved-binding` by the Founder 2026-09-12** (`DEC-20260912-01`,
v0.2), recording the br-architect primary binding. The 2026-09-11 draft
proposition of this model as br-architect fallback (`DEC-20260911-02`, not
merged) is superseded by this record where the two conflict.

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
tier2_attestation_id: gemini   # was: gemini-3.1-pro (DEC-20261001-01 clause 1 maps it to `gemini`; v1.3)
governance_status: approved-binding-architect-primary-and-tier-2-reviewer
model_compatibility_aliases: []
portfolio_classification: approved-binding   # per DEC-20260716-02 §3 classification ladder
last_verified: 2026-07-16   # public availability: preview status (gemini-3.1-pro-preview), not GA — permitted for production use
deployment_channel: P1      # google paid API / Vertex tier, per /00-system/data-boundary-policy.md
```

- **Current implementation use:** the architecture tier's PRIMARY adapter is implemented in `founder-os-telegram` (`adapters/architecture-pipeline-adapter.ts`, Increment 1, merged 2026-07-18 via PR #27 per `DEC-20260715-14`'s Implementation note), env-backed via `GEMINI_ARCHITECT_PRIMARY_MODEL` (ships empty) behind `ARCHITECTURE_TIER_ENABLED` (default off). The fallback transport (Azure channel, `DEC-20260720-01`/`-02`) and the advisor increment (2026-07-23, merged to `main` at `b4265d49`) are likewise implemented behind their own default-off switches. Nothing is live: no model value is committed and the switches are off; an earlier revision of this entry ("tier is doctrine-only; adapters deferred") described the pre-Increment-1 state and is superseded by this dated correction. **Tier 2 independent-reviewer:** invoked outside Telegram (e.g. Gemini app / API / coding surface) per `DEC-20260719-02` v0.7 — no runtime review capability required.
- **Authority statement:** owns no independent governance authority; executes on behalf of the bound role.
- **Evidence sources:** `04-agents/architecture/technical-architect-tier.yaml` (active), `07-decisions/DEC-20260715-14-technical-architect-agent-tier.md` (active), `07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md` (v0.7).

- **Bindings retired 2026-10-19** (`DEC-20261019-01` Clause A). The Antigravity surface no longer offers this model at any effort (catalog read 2026-10-19). The architect primary and independent-reviewer bindings move to `gemini-4-argon`. Verdicts issued while the binding was active remain valid for the work they reviewed.

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
governance_status: approved-supplemental-review-not-tier-1-or-tier-2; active-pre-mortem-reviewer-primary-binding   # the supplemental binding; a Build Room Tier-2 lane review it serves follows DEC-20261020-01 clause 4 (Amendment 4) from FounderOS PR 434's merge
portfolio_classification: approved-binding
last_verified: 2026-08-07
source: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash
deployment_channel: antigravity-primary; google-ai-studio-api-fallback
data_class_boundary: exact task approval plus active Google-channel data boundary; unresolved channel fails closed
surface_availability: [antigravity, google-ai-studio-api]
```

This model cannot replace CodeRabbit Tier-1 or satisfy binding Tier-2. That sentence describes its supplemental fast-review binding (`DEC-20260807-01` §3.4). From the merge of FounderOS pull request 434, a Build Room review on the `antigravity:google` lane that this model serves counts on the conditions of `DEC-20261020-01` clause 4 as its Amendment 4 amends it, flagged because Google labels the model Flash (B4); its `data_class_boundary` still binds (B3).

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
governance_status: approved-supplemental-review-not-tier-1-or-tier-2; active-marketing-lead-primary-binding   # the supplemental binding; a Build Room Tier-2 lane review it serves follows DEC-20261020-01 clause 4 (Amendment 4) from FounderOS PR 434's merge
portfolio_classification: approved-binding
last_verified: 2026-08-07
source: https://ai.google.dev/gemini-api/docs/latest-model
deployment_channel: antigravity-primary; google-ai-studio-api-fallback
data_class_boundary: exact task approval plus active Google-channel data boundary; unresolved channel fails closed
surface_availability: [antigravity, google-ai-studio-api]
```

This model cannot replace CodeRabbit Tier-1 or satisfy binding Tier-2. That sentence describes its supplemental fast-review binding (`DEC-20260807-01` §3.4). From the merge of FounderOS pull request 434, a Build Room review on the `antigravity:google` lane that this model serves counts on the conditions of `DEC-20261020-01` clause 4 as its Amendment 4 amends it, flagged because Google labels the model Flash (B4); its `data_class_boundary` still binds (B3).

### `gemini-3.8-flash`

```yaml
model_id: gemini-3.8-flash
display_name: Gemini 3.8 Flash
provider: google
provider_identifier: gemini-3.8-flash
modes: [standard]
approved_role_bindings:
  - role_id: chief-operating-officer
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-chief-operating-officer-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/
deployment_channel: gemini-direct-lane
data_class_boundary: US-domiciled first-party; active data-boundary policy; US-domiciled first-party
```

- **Binding:** `chief-operating-officer` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. Released 2026-09-02. Gemini 3.8 ships as Flash only — no 3.8 Pro exists (recorded in DEC-20261005-01).
- **Authority statement:** owns no independent governance authority; the `chief-operating-officer` role remains accountable.

### `gemini-4-argon`

```yaml
model_id: gemini-4-argon
display_name: Gemini 4 Argon
provider: google
provider_identifier: gemini-4-argon
modes: [high]   # the one effort DEC-20261016-01 binds; Google documents LOW, MEDIUM (default) and HIGH
approved_role_bindings:
  - role_id: architect
    binding_class: primary   # Build Room Seat Registry V1 architect `primary` lane only; surface antigravity, effort high
    decision: DEC-20261016-01   # active
    limits: public-class data only; invoked on Antigravity as `gemini-4-argon-high`; recorded as model gemini-4-argon, effort high
  - role_id: independent-reviewer
    binding_class: tier-2
    decision: DEC-20261019-01   # Clause A: Tier-2 reviewer lane on the antigravity surface
    limits: public-class review material only, inheriting this entry's data boundary
proposed_role_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: antigravity:google
    role_id: independent-reviewer
# tier2_attestation_id retired (DEC-20261020-01 clause 6); was: gemini
governance_status: approved-binding-architect-primary-and-tier-2-reviewer
portfolio_classification: approved-binding   # per DEC-20260716-02 §3 classification ladder; DEC-20261016-01, ratified 2026-10-16
last_verified: 2026-10-16   # Google Cloud model page: "Launch stage: GA", "Release date: October 13, 2026", thinking levels LOW, MEDIUM (default), HIGH; listed by `agy models` (agy 1.3.5) on the Founder's PC
source: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-argon
deployment_channel: unverified   # Antigravity on the Founder's Google sign-in; its no-training and retention terms are unverified, and nothing here classifies it P1
data_class_boundary: public-class only; internal-or-higher prohibited until a Founder decision cites written no-training terms for the exact Antigravity access path, or amends the data-boundary policy
```

- **Binding:** the Build Room Seat Registry V1 `architect` seat's `primary` lane, replacing `gemini-3.1-pro`, which `agy` 1.3.5 no longer lists. `DEC-20261016-01`, ratified by the Founder 2026-10-16 (comment 6207273443 on FounderOS pull request 381). The Seat Registry code change lands in Build Room under its own review. `gemini-3.1-pro`'s entry and bindings are unchanged.
- **Authority statement:** owns no independent governance authority; the `architect` role remains accountable.

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

### `glm-5.3`

```yaml
model_id: glm-5.3
display_name: GLM-5.3
provider: zai
provider_identifier: glm-5.3
modes: [standard]
approved_role_bindings:
  - role_id: program-execution-lead
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-program-execution-lead-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://docs.z.ai/guides/llm/glm-5.3
deployment_channel: P3-zai-international
data_class_boundary: P3 Z.ai international posture (deputy precedent, DEC-20260801-01): public + ordinary internal FounderOS only; no confidential-or-higher; the `madc` D-FS-1 no-GLM ruling stands untouched
```

- **Binding:** `program-execution-lead` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. FounderOS-side binding only; any `madc` use requires its own amendment act there. Released 2026-08-18; 1M ctx; reasoning always on.
- **Authority statement:** owns no independent governance authority; the `program-execution-lead` role remains accountable.

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

- **Tier 2 binding removed (2026-08-15).** From 2026-07-19 to 2026-08-15 this model held an active `independent-reviewer` Tier 2 **full roster** binding per `DEC-20260719-02` (founder-activated 2026-07-19; roster expanded v0.7 2026-07-26 alongside `opus-4.8`, `gemini-3.1-pro`, `grok-4.5`). The founder removed it from the roster on 2026-08-15 (`DEC-20260719-02` v1.1). **This model can no longer satisfy Tier-2.** (That was written of the model roster. For FounderOS, `FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION` B3 records a review's model without binding it; for Build Room, from the merge of FounderOS pull request 434, a review on a Tier-2 lane whose surface serves this model counts on the conditions of `DEC-20261020-01` clause 4 as Amendment 4 amends it.) The `tier2-shape` gate has not accepted `gpt-5.6` as a `Tier2-Reviewer-Id` since the gate shipped on 2026-08-14 (`DEC-20260814-02`); this entry now matches that behaviour. Verdicts issued while the binding was active remain valid for the work they reviewed. No Telegram runtime capability existed or was authorized for this model as a reviewer.
- **Classification ladder gap (2026-08-15, flagged not filled).** This field read `portfolio_classification: approved-binding` until 2026-08-15, justified by "an active Founder decision names the role, model, mode, and binding class." After the Tier-2 removal no active decision names any binding for this model, so that value became a false claim. **No ladder status in `DEC-20260716-02` §3 means "binding retired":** `evaluation-candidate` requires dated external verification this entry lacks, and `/00-system/model-portfolio-and-routing-strategy.md` §8 does not list `gpt-5.6` as a candidate for any role; `deprecated` means provider end-of-life, which has not been announced; `rejected` means considered and declined, which is not what happened. The field now carries **`unverified`**, which *is* one of the nine defined statuses — "a claim that could not be confirmed from primary or corroborated sources", promoted out by "independent verification". It is accurate on its own terms: this entry's `last_verified` has read `verification-pending` since creation, so its availability, pricing, and retention claims were never confirmed. **An interim revision of this entry carried an invented value, `no-active-classification`, explicitly marked as outside the ladder; that was withdrawn on Tier-1 review** — introducing an unvalidated sentinel into a `source_of_truth: true` registry is itself a data-model change, and no validator or consumer defines it. **The underlying gap is real and remains open for the founder:** the ladder has no status meaning "was bound, no longer is", and `unverified` records why this entry's claims are unconfirmed rather than that its binding ended — `governance_status` carries that. Resolving it needs a ladder amendment or a founder call; it is not the roster amendment's to decide. Note the contrast with `opus-4.8`, which legitimately carries `evaluation-candidate`: §8 does list it as a candidate for `independent-reviewer`, `strategist`, and `builder`, so its classification survives the same retirement.
- **Not the same model as the Codex entries.** `gpt-5.6` is the ChatGPT-surface entry created 2026-07-19. It is distinct from `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`, which are the Codex-surface models on the current roster. Removing `gpt-5.6` does not affect those three.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md` (Context, Rationale, v0.7 expansion, v1.1 removal).

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
tier2_attestation_id: codex   # was: chatgpt-5.6-luna (DEC-20261001-01 clause 1 maps it to codex; entry surface_availability [codex]; v1.3)
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
- **Evidence sources:** `07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md` (v1.1 amendment); `07-decisions/DEC-20260814-03-governance-change-freeze.md` (Founder Ratification section, verbatim statement); `00-system/scripts/tier2-shape-check.sh` (`REVIEWER_ROSTER_REGEX` until 2026-10-11; since `FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION`'s implementation, `REVIEWER_SURFACE_REGEX`, which accepts surface ids only).

- **Bindings retired 2026-10-19** (`DEC-20261019-01` Clause B). The 6-family successor is `gpt-6-luna`.

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
tier2_attestation_id: codex   # was: chatgpt-5.6-sol (DEC-20261001-01 clause 1 maps it to codex; entry surface_availability [codex]; v1.3)
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

- **Bindings retired 2026-10-19** (`DEC-20261019-01` Clause B). The 6-family successor is `gpt-6.1-sol`. Verdicts issued while the binding was active remain valid for the work they reviewed.

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
  - role_id: finance-lead
    binding_class: primary
    decision: DEC-20261005-01
tier2_attestation_id: codex   # was: chatgpt-5.6-terra (DEC-20261001-01 clause 1 maps it to codex; entry surface_availability [codex]; v1.3)
governance_status: approved-g3-slice-b-plus-tier-2-full-roster
portfolio_classification: approved-binding
last_verified: 2026-08-07
source: https://developers.openai.com/api/docs/models/gpt-5.6-terra
deployment_channel: codex-founder-operated
data_class_boundary: active data-boundary policy and exact task scope
surface_availability: [codex]
boundary_record: recorded 2026-10-05 (`DEC-20261005-03`) — seat `finance-lead` ("Make cost, pricing, and financial-exposure implications explicit before decisions are approved"); provider OpenAI, US first-party; paid-API retention is no-training with a 30-day default; ZDR by arrangement (developers.openai.com data controls).
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

- **Bindings retired 2026-10-19** (`DEC-20261019-01` Clause B). The successor is `gpt-6-astra` — an explicit substitution, not a rename: no terra exists in the 6 family.

### `gpt-6-astra`

```yaml
model_id: gpt-6-astra
display_name: GPT-6 Astra
provider: openai
provider_identifier: gpt-6-astra
modes: [standard]
approved_role_bindings:
  - role_id: builder
    binding_class: large-implementation-primary-task-scoped
    decision: DEC-20261019-01   # Clause B: explicit substitution for gpt-5.6-terra
  - role_id: independent-reviewer
    binding_class: tier-2
    decision: DEC-20261019-01
proposed_role_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: codex:openai
    role_id: builder
  - lane: codex:openai
    role_id: independent-reviewer
# tier2_attestation_id retired (DEC-20261020-01 clause 6); was: codex
governance_status: active-build-room-builder-and-tier-2-reviewer
portfolio_classification: approved-binding
last_verified: 2026-10-19   # configured model of the codex surface (`~/.codex/config.toml`); provider pricing/limits not re-verified
source: ~/.codex/config.toml (model = gpt-6-astra)
surface_availability: [codex]
deployment_channel: verification-pending
```

- **Binding:** `DEC-20261019-01` Clause B. `gpt-5.6-terra` has **no** 6-family successor; this is an explicit substitution, not a rename. Astra's capability must never be quoted as terra's.
- **Authority statement:** owns no independent governance authority; the roles it serves remain accountable.

### `gpt-6-luna`

```yaml
model_id: gpt-6-luna
display_name: GPT-6 Luna
provider: openai
provider_identifier: gpt-6-luna
modes: [invoked]   # tier-2 review is invoked per-case, never automatic
approved_role_bindings:
  - role_id: independent-reviewer
    binding_class: tier-2
    decision: DEC-20261019-01   # Clause B: 6-family replacement for gpt-5.6-luna
proposed_role_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: codex:openai
    role_id: independent-reviewer
# tier2_attestation_id retired (DEC-20261020-01 clause 6); was: codex
governance_status: active-independent-reviewer-tier-2-binding
portfolio_classification: approved-binding
last_verified: 2026-10-19   # runtime catalog presence; provider pricing/limits not re-verified
source: hermes models_catalog_static.py
surface_availability: [codex]
deployment_channel: verification-pending
```

- **Binding:** `DEC-20261019-01` Clause B, replacing `gpt-5.6-luna` on the Tier-2 roster.
- **Authority statement:** owns no independent governance authority; the `independent-reviewer` role remains accountable.

### `gpt-6.1-sol`

```yaml
model_id: gpt-6.1-sol
display_name: GPT-6.1 Sol
provider: openai
provider_identifier: gpt-6.1-sol
modes: [standard]
approved_role_bindings:
  - role_id: chief-financial-officer
    binding_class: primary
    decision: DEC-20261005-01
  - role_id: builder
    binding_class: large-implementation-primary-task-scoped
    decision: DEC-20261019-01   # Clause B: 6-family replacement for gpt-5.6-sol
  - role_id: independent-reviewer
    binding_class: tier-2
    decision: DEC-20261019-01
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: codex:openai
    role_id: builder
  - lane: codex:openai
    role_id: independent-reviewer
# tier2_attestation_id retired (DEC-20261020-01 clause 6); was: codex
governance_status: active-cfo-primary-and-build-room-builder-and-tier-2-reviewer
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://openai.com/index/introducing-gpt-6-1-sol/
deployment_channel: openai-first-party-api
data_class_boundary: sensitive-seat row (DEC-20260813-03 item 9): US-domiciled first-party; exact task-scope, channel and retention posture recorded at execution
boundary_record: recorded 2026-10-05 (`DEC-20261005-03`) — seat `chief-financial-officer` ("Own financial intelligence and control recommendations at portfolio scope — forecasts, budgets, cost tracking, and threshold monitoring"); provider OpenAI, US first-party; paid-API retention is no-training with a 30-day default; ZDR by arrangement (developers.openai.com data controls).
```

- **Binding:** `chief-financial-officer` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. Released 2026-09-29; near-Astra at a fifth of Astra pricing.
- **Authority statement:** owns no independent governance authority; the `chief-financial-officer` role remains accountable.

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
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: grok-build:xai
    role_id: independent-reviewer
# tier2_attestation_id retired (DEC-20261020-01 clause 6); was: grok (and before v1.3 of DEC-20260719-02, grok-4.5)
governance_status: approved-binding-architect-advisor-tier-2-reviewer-and-task-scoped-builder   # advisor runtime wired-not-live; Tier 2 is invoked off-runtime (e.g. grok-build); builder requires per-task Temporary Task-Assignment
model_compatibility_aliases: []
portfolio_classification: approved-binding   # per DEC-20260716-02 §3 classification ladder
last_verified: 2026-07-16   # public availability since 2026-07-08; $2/$6 per MTok; 500k context; native live-search tooling; not yet available in the EU
deployment_channel: unverified   # xAI API data-retention policy could not be independently verified as of last_verified; per data-boundary-policy.md §5 item 4, while retention is unverified advisor use is limited to public-class data only, internal-class use requires explicit, auditable Founder authorization for that specific invocation (no standing internal-class presumption), and confidential/restricted/local-only remain prohibited until retention is verified and qualifying
```

- **Current implementation use:** the advisor increment is implemented in `founder-os-telegram` (merged 2026-07-23, `main` @ `b4265d49`; `adapters/xai-client.ts`, `core/architecture-advisor.ts`) behind `ARCHITECTURE_ADVISOR_ENABLED` (exact-string `true`, default OFF) + `GROK_ARCHITECT_ADVISOR_MODEL` + `XAI_API_KEY` (both unset; ship empty). **Not live**, and enablement is gated: (a) the `deployment_channel: unverified` constraint above stands — per data-boundary-policy §5(4) an unverified advisor provider is public-class-only while architecture requests default internal-class, so the switch must stay off until xAI's retention posture is independently verified (and xAI is provider-class-assigned by decision) or the Founder rules an auditable authorization; (b) the increment carries NO current-data tooling, while the tier specification (`technical-architect-tier.yaml` `web_search: required: true`) requires it — resolving that variance (tooling increment or tier-spec amendment) also gates enablement. Recorded per the 2026-07-23 decision-compiler reconciliation of PR #82. **Tier 2 independent-reviewer:** full roster member per `DEC-20260719-02` v0.7; typically invoked via `grok-build` / xAI surfaces outside Telegram. Same data-boundary rules apply to review material as to advisor material.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `04-agents/architecture/technical-architect-tier.yaml`, `DEC-20260715-14` (v0.4 advisor Implementation note), `DEC-20260716-01` item 6, `DEC-20260719-02` v0.7.

### `grok-4.6`

```yaml
model_id: grok-4.6
display_name: Grok 4.6
provider: xai
provider_identifier: grok-4.6
modes: [invoked]   # Tier-2 review is invoked per case, never automatic
approved_role_bindings:
  - role_id: independent-reviewer
    binding_class: tier-2
    mode: invoked
    decision: DEC-20261020-01   # clause 2 table: grok-build:xai allowlist, "on registration" (retired by Amendment 4 when FounderOS PR 434 merges); the Founder's answer of 2026-10-21, "Add served models"
    limits: public-class review material only while deployment_channel is unverified; internal-class needs the Founder's authorization for that specific invocation (data-boundary-policy §5 item 4)
proposed_role_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: grok-build:xai
    role_id: independent-reviewer
governance_status: active-independent-reviewer-tier-2-binding
portfolio_classification: approved-binding
last_verified: 2026-10-25   # xAI grok-4.6 model page: model name grok-4.6; text and image input; 500,000-token context; reasoning efforts low, medium, high, xhigh (default high); $2.00 input, $0.50 cached input, $6.00 output per 1M tokens below 200k prompt tokens, $4.00 / $1.00 / $12.00 at or above; also on the US regional endpoint (pricing page); no release date, data-retention or no-training statement
source: https://docs.x.ai/developers/models/grok-4.6
surface_availability: [grok-build]   # grok-build served grok-4.6 on Build Room pull request 121 (recorded in DEC-20261020-01)
deployment_channel: unverified   # xAI's model pages state no data-retention or no-training terms (read 2026-10-25); per data-boundary-policy.md §5 item 4, public-class only, internal-class only under the Founder's explicit authorization for that specific invocation, confidential/restricted/local-only prohibited
data_class_boundary: public-class only; internal-class needs per-invocation Founder authorization; confidential, restricted and local-only prohibited
```

- **Binding:** `independent-reviewer` Tier-2 on the `grok-build:xai` lane, admitted "on registration" by `DEC-20261020-01`'s clause 2 table, following the Founder's answer of 2026-10-21 ("Add served models"); this entry is that registration. That admission is history from the merge of FounderOS pull request 434: Amendment 4 to `DEC-20261020-01` retires the lane's allowlist, so a Build Room review on `grok-build:xai` needs no entry here and counts as clause 4 states. This entry's `data_class_boundary` still binds any review this model serves (Amendment 4, B3). FounderOS Tier-2 verdicts stay under `FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION` B2 and B3 (surface named, model recorded, not bound).
- **Authority statement:** owns no independent governance authority; the `independent-reviewer` role remains accountable.

### `grok-4.7`

```yaml
model_id: grok-4.7
display_name: Grok 4.7
provider: xai
provider_identifier: grok-4.7
modes: [invoked]   # Tier-2 review is invoked per case, never automatic
approved_role_bindings:
  - role_id: independent-reviewer
    binding_class: tier-2
    mode: invoked
    decision: DEC-20261020-01   # clause 2 table: grok-build:xai allowlist, "on registration" (retired by Amendment 4 when FounderOS PR 434 merges); the Founder's answer of 2026-10-21, "Add served models"
    limits: public-class review material only while deployment_channel is unverified; internal-class needs the Founder's authorization for that specific invocation (data-boundary-policy §5 item 4)
proposed_role_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: grok-build:xai
    role_id: independent-reviewer
governance_status: active-independent-reviewer-tier-2-binding
portfolio_classification: approved-binding
last_verified: 2026-10-25   # xAI Grok 4.7 guide and model page: model name grok-4.7; text and image input; 500,000-token context; reasoning efforts low, medium, high, xhigh (default high); $2.00 input, $0.50 cached input, $6.00 output per 1M tokens below 200k prompt tokens, $4.00 / $1.00 / $12.00 at or above; on the xAI API, the US regional endpoint at a 10% premium, Grok Build (its default model), Cursor and gateways; no release date, data-retention or no-training statement
source: https://docs.x.ai/docs/grok-4-7 and https://docs.x.ai/developers/models/grok-4.7
surface_availability: [grok-build]   # the Grok Build default model per xAI; grok-build served grok-4.7 for a review authorized as grok-4.5 on FounderOS pull request 380 (recorded in DEC-20261020-01)
deployment_channel: unverified   # xAI's model pages state no data-retention or no-training terms (read 2026-10-25); per data-boundary-policy.md §5 item 4, public-class only, internal-class only under the Founder's explicit authorization for that specific invocation, confidential/restricted/local-only prohibited
data_class_boundary: public-class only; internal-class needs per-invocation Founder authorization; confidential, restricted and local-only prohibited
```

- **Binding:** `independent-reviewer` Tier-2 on the `grok-build:xai` lane, admitted "on registration" by `DEC-20261020-01`'s clause 2 table, following the Founder's answer of 2026-10-21 ("Add served models"); this entry is that registration. That admission is history from the merge of FounderOS pull request 434: Amendment 4 to `DEC-20261020-01` retires the lane's allowlist, so a Build Room review on `grok-build:xai` needs no entry here and counts as clause 4 states. This entry's `data_class_boundary` still binds any review this model serves (Amendment 4, B3). FounderOS Tier-2 verdicts stay under `FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION` B2 and B3 (surface named, model recorded, not bound).
- **Authority statement:** owns no independent governance authority; the `independent-reviewer` role remains accountable.

### `grok-4.7-build-fast`

```yaml
model_id: grok-4.7-build-fast
display_name: Grok 4.7 Fast
provider: xai
provider_identifier: grok-4.7-build-fast   # the id grok-build reports serving (Build Room pull request 121, recorded in DEC-20261020-01); xAI documents Grok 4.7 Fast but publishes no model ID for it
modes: [invoked]   # Tier-2 review is invoked per case, never automatic
approved_role_bindings:
  - role_id: independent-reviewer
    binding_class: tier-2
    mode: invoked
    decision: DEC-20261020-01   # clause 2 table: grok-build:xai allowlist, "on registration" (retired by Amendment 4 when FounderOS PR 434 merges); the Founder's answer of 2026-10-21, "Add served models"
    limits: public-class review material only while deployment_channel is unverified; internal-class needs the Founder's authorization for that specific invocation (data-boundary-policy §5 item 4)
proposed_role_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
lanes:   # DEC-20261020-01 clause 2; the Lanes section below is the table
  - lane: grok-build:xai
    role_id: independent-reviewer
governance_status: active-independent-reviewer-tier-2-binding
portfolio_classification: approved-binding
last_verified: 2026-10-25   # xAI Grok 4.7 guide and pricing page, Grok 4.7 Fast: "the same Grok 4.7 model served on faster infrastructure"; 2x the standard token rates, 1.5x for long-context requests ($4.00 input, $1.00 cached input, $12.00 output per 1M tokens below 200k prompt tokens; $6.00 / $1.50 / $18.00 above); "available only in Cursor and Grok Build", "not available on the public xAI API", not in Grok Build's free tier; the models page lists no fast variant
source: https://docs.x.ai/docs/grok-4-7 and https://docs.x.ai/developers/pricing (Grok 4.7 Fast); the id string from grok-build's report on Build Room pull request 121
surface_availability: [grok-build]   # Cursor and Grok Build only, per xAI
deployment_channel: unverified   # xAI's model pages state no data-retention or no-training terms (read 2026-10-25); per data-boundary-policy.md §5 item 4, public-class only, internal-class only under the Founder's explicit authorization for that specific invocation, confidential/restricted/local-only prohibited
data_class_boundary: public-class only; internal-class needs per-invocation Founder authorization; confidential, restricted and local-only prohibited
```

- **Binding:** `independent-reviewer` Tier-2 on the `grok-build:xai` lane, admitted "on registration" by `DEC-20261020-01`'s clause 2 table, following the Founder's answer of 2026-10-21 ("Add served models"); this entry is that registration. That admission is history from the merge of FounderOS pull request 434: Amendment 4 to `DEC-20261020-01` retires the lane's allowlist, so a Build Room review on `grok-build:xai` needs no entry here and counts as clause 4 states. This entry's `data_class_boundary` still binds any review this model serves (Amendment 4, B3). FounderOS Tier-2 verdicts stay under `FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION` B2 and B3 (surface named, model recorded, not bound).
- **Identifier:** xAI documents the variant but publishes no model ID for it. The Founder chose on 2026-10-25 to register it under the id string `grok-build` reports (option label: "Own entry, ID from surface (Recommended)"). Capability statements for `grok-4.7` apply to it only as xAI's "same model" statement supports; if xAI publishes a different ID, this entry is corrected, not duplicated.
- **Authority statement:** owns no independent governance authority; the `independent-reviewer` role remains accountable.

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

### `kimi-k3`

```yaml
model_id: kimi-k3
display_name: Kimi K3
provider: moonshotai
provider_identifier: kimi-k3
modes: [standard]
approved_role_bindings:
  - role_id: chief-strategy-officer
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-chief-strategy-officer-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-27
source: https://www.cnbc.com/2026/07/17/moonshot-ai-kimi-k3-model-openai-anthropic-china.html
deployment_channel: verification-pending   # DEC-20261027-02 (proposed; the Founder ratified it on 2026-11-08 and the assignment is not asserted until the decision is recorded `active`) would assign P3-moonshot-open-platform; the PRC-parentage premise it rests on was disposed of by the Founder's 2026-11-08 ruling — this is the registry's existing token for a channel whose provider class is not asserted (cf. gpt-5.6-luna)
data_class_boundary: not permitted on this channel while it carries no asserted provider class — §4's public row permits P1, P2, P3, P4, P5 only, and §5 item 1 defaults unclassified work to internal; once DEC-20261027-02 is recorded `active` the route is P3 and may carry public-class work, with ordinary internal FounderOS work permitted only where a contractual no-training term is in force and evidenced in the agreement in hand and recorded in DEC-20261027-02 by the Founder's amendment, or authorized for the specific invocation under that decision's clause 10 — enterprise status alone is not sufficient, and enabling ZDR is not sufficient either, because the vendor states ZDR changes retention only and not usage policies — and only where the model's MP-2 status is `approved` or `proposed`, as §4's internal row requires; no confidential-or-higher, no restricted, no local-only, no secrets, credentials, tokens, authentication data, the Founder's personal material, legal matters, financial records, production data, or FounderOS doctrine and governance content
```

- **Binding:** `chief-strategy-officer` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. Press record of the 2026-07-16/17 release; first-party Moonshot release blog referenced by press, catalog-resolved.
- **Channel classification (2026-10-27, `DEC-20261027-02`, proposed; the Founder ratified it on 2026-11-08 and it takes effect when the decision is recorded `active`).** The channel label `moonshotai-first-party` previously in this entry is **narrowed** by the proposed decision to mean the Kimi Open Platform first-party API, overseas endpoint `https://api.moonshot.ai/v1`, which the decision would class as **P3**. **That assignment is not asserted until the decision is recorded `active`:** the `deployment_channel` field therefore reads `verification-pending`, this repository's existing token for a channel whose provider class is not asserted, and the proposed class is recorded here in prose instead of as a field value. The decision's **PRC-parentage premise** — that Moonshot AI PTE. LTD. is the international arm of a PRC-parented provider — was put to the Founder for disposition, because no vendor document read establishes it, and the **Founder's 2026-11-08 ruling disposed of it**. The **data scope is unchanged** from `DEC-20261005-01`: public and ordinary internal FounderOS only; no confidential-or-higher, no secrets, credentials, personal or production data. What the proposed decision changes is the provider class and the retention condition attached to the internal permission — see `data_class_boundary` above. The Kimi Code membership route (`https://api.kimi.com/coding/v1`), which the live CLI actually uses, is a **separate channel** with an unverified retention posture and **no provider class at all**; it is not reachable through this entry's classification and may not be used for any data class until a decision classifies it.
- **Evidence sources:** `07-decisions/DEC-20261027-02-moonshot-kimi-channel-classification.md`; Kimi Open Platform Terms of Service (last updated 2026-07-30, `https://platform.kimi.ai/docs/agreement/modeluse.md`); Privacy Policy (`https://platform.kimi.ai/docs/agreement/userprivacy.md`); Zero Data Retention page (`https://platform.kimi.ai/docs/guide/zero-data-retention.md`); product comparison page (`https://platform.kimi.ai/docs/guide/product-plans.md`); Kimi Code FAQ (`https://www.kimi.com/code/docs/en/kimi-code/faq.html`) — all read 2026-10-27.
- **Authority statement:** owns no independent governance authority; the `chief-strategy-officer` role remains accountable.

### `mimo-v2.6-pro`

```yaml
model_id: mimo-v2.6-pro
display_name: Xiaomi MiMo-V2.6-Pro
provider: xiaomi
provider_identifier: mimo-v2.6-pro
modes: [standard]
approved_role_bindings:
  - role_id: reliability-lead
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-reliability-lead-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://mimo.mi.com/models/en-US/mimo-v2.6-pro
deployment_channel: xiaomi-first-party
data_class_boundary: China-class: public and ordinary internal FounderOS only; no confidential-or-higher, no secrets, credentials, personal or production data; complete-route classification record owed (DEC-20261005-01)
route_record: complete-route classification recorded 2026-10-05 (`DEC-20261005-03`) — first-party Xiaomi channel (mimo.mi.com); PRC-parented provider family; public + ordinary-internal only; no confidential-or-higher, no secrets, credentials, personal or production data.
```

- **Binding:** `reliability-lead` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. Officially released and open-sourced; flagship reasoning model, omni-modal.
- **Authority statement:** owns no independent governance authority; the `reliability-lead` role remains accountable.

### `minimax-m2.7`

```yaml
model_id: minimax-m2.7
display_name: MiniMax-M2.7
provider: minimax
provider_identifier: minimax-m2.7
modes: [standard]
approved_role_bindings:
  - role_id: growth-commercial-lead
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-growth-commercial-lead-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://platform.minimax.io/docs/release-notes/models
deployment_channel: minimax-first-party
data_class_boundary: China-class: public and ordinary internal FounderOS only; no confidential-or-higher, no secrets, credentials, personal or production data
```

- **Binding:** `growth-commercial-lead` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model.
- **Authority statement:** owns no independent governance authority; the `growth-commercial-lead` role remains accountable.

### `minimax-m3`

```yaml
model_id: minimax-m3
display_name: MiniMax-M3
provider: minimax
provider_identifier: minimax-m3
modes: [standard]
approved_role_bindings:
  - role_id: chief-marketing-creative-officer
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-chief-marketing-creative-officer-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://platform.minimax.io/docs/release-notes/models
deployment_channel: minimax-first-party
data_class_boundary: China-class: public and ordinary internal FounderOS only; no confidential-or-higher, no secrets, credentials, personal or production data
```

- **Binding:** `chief-marketing-creative-officer` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. Released 2026-06-01; frontier coding / 1M context / native multimodality.
- **Authority statement:** owns no independent governance authority; the `chief-marketing-creative-officer` role remains accountable.

### `muse-spark-1.3`

```yaml
model_id: muse-spark-1.3
display_name: Muse Spark 1.3
provider: meta
provider_identifier: muse-spark-1.3
modes: [max-reasoning]
approved_role_bindings:
  - role_id: legal-risk
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-legal-risk-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://research.meta.ai/blog/introducing-muse-spark-1-3
deployment_channel: meta-first-party
data_class_boundary: sensitive-seat row (DEC-20260813-03 item 9): US-domiciled first-party; exact task-scope, channel and retention posture recorded at execution
boundary_record: recorded 2026-10-05 (`DEC-20261005-03`) — seat `legal-risk` ("Surface legal, privacy, regulatory, and reputation risk before it ships"); provider Meta, US first-party (dev.meta.ai); **retention posture not independently verified → public-class only** until verified (`data-boundary-policy.md` §4 item 4); max-reasoning pin per `DEC-20261005-01`.
```

- **Binding:** `legal-risk` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. Binding pins the max-reasoning configuration (DEC-20261005-01 item 5): top of the Vals Legal Research Bench at 55.29% all-pass only at max reasoning; xhigh scores 40.87%, below claude-sonnet-5.5. Released 2026-09-02.
- **Authority statement:** owns no independent governance authority; the `legal-risk` role remains accountable.

### `nemotron-3.5-lightning`

```yaml
model_id: nemotron-3.5-lightning
display_name: Nemotron 3.5 Lightning
provider: nvidia
provider_identifier: nemotron-3.5-lightning
modes: [standard]
approved_role_bindings:
  - role_id: operations-lead
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-operations-lead-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://developer.nvidia.com/blog/nvidia-nemotron-3-5-lightning-delivers-fast-accurate-specialized-task-execution-for-long-running-agents/
deployment_channel: nvidia-first-party
data_class_boundary: active data-boundary policy; US-domiciled first-party
```

- **Binding:** `operations-lead` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. 30B MoE with 3B active; built for high-volume, low-latency agent work.
- **Authority statement:** owns no independent governance authority; the `operations-lead` role remains accountable.

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
- **Tier 2 binding removed (2026-08-15).** From 2026-07-19 to 2026-08-15 `DEC-20260719-02` bound this model as an `independent-reviewer` Tier 2 **full roster** reviewer (invoked per-case; no runtime capability — Tier 2 is performed outside the Telegram runtime); roster peers as of v0.7 were `gpt-5.6`, `gemini-3.1-pro`, `grok-4.5` (full) and `hermes-4-14b` (restricted). The founder removed it from the roster on 2026-08-15 (`DEC-20260719-02` v1.1). **This model can no longer satisfy Tier-2.** (That was written of the model roster. For FounderOS, `FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION` B3 records a review's model without binding it; for Build Room, from the merge of FounderOS pull request 434, a review on a Tier-2 lane whose surface serves this model counts on the conditions of `DEC-20261020-01` clause 4 as Amendment 4 amends it.) The `tier2-shape` gate has not accepted `opus-4.8` as a `Tier2-Reviewer-Id` since the gate shipped on 2026-08-14 (`DEC-20260814-02`); this entry now matches that behaviour. Verdicts issued while the binding was active remain valid for the work they reviewed.
- **Identity correction:** `opus` is a **model-family compatibility alias** within the model class. It is not a role alias for `independent-reviewer` — that historical association is typed evidence on the role entry and in the identity map.
- **Authority statement:** owns no independent governance authority.
- **Evidence sources:** `04-agents/opus.md` (unchanged); `01-constitution/agent-rules.md` (Opus lane); `05-workflows/wf-13-code-review.md`; `07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md` (tier-2 binding: active v0.7, removed v1.1 on 2026-08-15).

### `qwen3.7-flash`

```yaml
model_id: qwen3.7-flash
display_name: Qwen3.7-Flash
provider: alibaba
provider_identifier: qwen3.7-flash
modes: [standard]
approved_role_bindings:
  - role_id: qa-lead
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-qa-lead-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://modelstudio.console.alibabacloud.com
deployment_channel: alibaba-model-studio
data_class_boundary: China-class: public and ordinary internal FounderOS only; no confidential-or-higher, no secrets, credentials, personal or production data
```

- **Binding:** `qa-lead` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model.
- **Authority statement:** owns no independent governance authority; the `qa-lead` role remains accountable.

### `qwen3.7-max`

```yaml
model_id: qwen3.7-max
display_name: Qwen3.7-Max
provider: alibaba
provider_identifier: qwen3.7-max
modes: [standard]
approved_role_bindings:
  - role_id: portfolio-venture-lead
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-portfolio-venture-lead-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://modelstudio.console.alibabacloud.com
deployment_channel: alibaba-model-studio
data_class_boundary: China-class: public and ordinary internal FounderOS only; no confidential-or-higher, no secrets, credentials, personal or production data
```

- **Binding:** `portfolio-venture-lead` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model.
- **Authority statement:** owns no independent governance authority; the `portfolio-venture-lead` role remains accountable.

### `qwen3.8-max`

```yaml
model_id: qwen3.8-max
display_name: Qwen3.8-Max
provider: alibaba
provider_identifier: qwen3.8-max
modes: [standard]
approved_role_bindings:
  - role_id: brand-lead
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-brand-lead-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://modelstudio.console.alibabacloud.com
deployment_channel: alibaba-model-studio
data_class_boundary: China-class: public and ordinary internal FounderOS only; no confidential-or-higher, no secrets, credentials, personal or production data
```

- **Binding:** `brand-lead` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. Latest `qwen3.8-max-0902` per Model Studio; 2.4T-parameter MoE flagship.
- **Authority statement:** owns no independent governance authority; the `brand-lead` role remains accountable.

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

### `step-3.7-flash`

```yaml
model_id: step-3.7-flash
display_name: Step 3.7 Flash
provider: stepfun
provider_identifier: step-3.7-flash
modes: [standard]
approved_role_bindings:
  - role_id: innovation-futures-lead
    binding_class: primary
    decision: DEC-20261005-01
governance_status: active-innovation-futures-lead-primary-binding
portfolio_classification: approved-binding   # MP-2 §3 ladder — DEC-20261005-01 names the role, model, mode and class
last_verified: 2026-10-05
source: https://platform.stepfun.ai/docs/en/guides/models/step-3.7-flash
deployment_channel: stepfun-first-party
data_class_boundary: China-class: public and ordinary internal FounderOS only; no confidential-or-higher, no secrets, credentials, personal or production data
```

- **Binding:** `innovation-futures-lead` primary, `DEC-20261005-01` (ratified 2026-10-05). Runtime routing remains gated by MP-1 activation; the binding names the accountable model. 198B/11B sparse MoE vision-language model; 256K context.
- **Authority statement:** owns no independent governance authority; the `innovation-futures-lead` role remains accountable.

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

## Entries registered under `DEC-20261027-02` (2026-10-27)

### `kimi-k3.1`

```yaml
model_id: kimi-k3.1
display_name: Kimi K3.1 Pro
provider: moonshotai
provider_identifier: kimi-k3.1-pro
modes: [standard]
approved_role_bindings: []
proposed_role_bindings: []
implementation_observed_bindings: []
temporary_task_assignments: []
governance_status: registered-no-role-binding
model_compatibility_aliases: []
portfolio_classification: evaluation-candidate   # per DEC-20260716-02 §3 and /00-system/model-portfolio-and-routing-strategy.md §8 (builder); registered without a binding by DEC-20261027-02
last_verified: 2026-10-27   # vendor model list: first model of the K3.1 series, 3T-class, native visual understanding, 1M-token context
source: https://platform.kimi.ai/docs/models.md
surface_availability: [kimi-cli]
deployment_channel: verification-pending   # DEC-20261027-02 (proposed; the Founder ratified it on 2026-11-08 and the assignment is not asserted until the decision is recorded `active`) would assign P3-moonshot-open-platform
data_class_boundary: not permitted on this channel while it carries no asserted provider class; once DEC-20261027-02 is recorded `active` the Open Platform route https://api.moonshot.ai/v1 is P3, and the model's `evaluation-candidate` status then permits public-class work only on that route — the kimi-cli route https://api.kimi.com/coding/v1 remains unclassified and carries no data class until its own classification decision; §4's internal row permits internal-class work on models whose MP-2 status is `approved` or `proposed`, so internal-class use would require a decision that binds the model and the Founder's ratification of the promotion; no confidential-or-higher, no restricted, no local-only, no secrets, credentials, tokens, authentication data, the Founder's personal material, legal matters, financial records, production data, or FounderOS doctrine and governance content
```

- **Registration (2026-10-27, `DEC-20261027-02`, proposed).** The current-generation Kimi flagship, as the vendor's own model list describes it: the first model of the K3.1 series and the most capable flagship to date, a 3T-class model with native visual understanding and a 1M-token context window. It is registered here with **no role binding**. `DEC-20261027-02` is a channel-classification decision, not a binding decision; the portfolio's `builder` evaluation-candidate slot names this model, which is a different construct from a binding and confers none. Because its MP-2 status is `evaluation-candidate` and not `approved` or `proposed`, it **cannot carry internal-class work on any channel** under the policy's §4 internal row — see `data_class_boundary` above.
- **Identifier.** The vendor publishes `kimi-k3.1-pro` for the flagship and `kimi-k3.1-pro-highspeed` for the high-speed variant; the Kimi Code CLI configures its own surface-local ids (`kimi-code/k3.1-pro`, `kimi-code/k3.1-pro-highspeed`). This entry carries the family id `kimi-k3.1` with `provider_identifier: kimi-k3.1-pro`. The high-speed variant is the same model on faster infrastructure and is not a separate registry entry.
- **Retirement context.** The K2 series (`kimi-k2.7-code`, `kimi-k2.7-code-highspeed`, `kimi-k2.6`) is closed to newly registered users from 2026-10-31, and the vendor plans to retire all K2 series models by the end of December 2026. `kimi-k2.7-code` was the portfolio's `builder` evaluation candidate until this registration and is retired as a candidate by the portfolio update in `DEC-20261027-02`; `kimi-k3.1` replaces it there.
- **Surface availability.** The `kimi-cli` execution surface (Kimi Code CLI 2.3.3) configures `kimi-code/k3.1-pro-highspeed` as its default model, per `~/.kimi-code/config.toml` line 5, read 2026-10-27. That surface's channel is the Kimi Code route, which is **classified into no provider class** and therefore may carry **no data class at all** until a separate decision classifies it; the Open Platform route named by `deployment_channel` above is a different channel, under a different agreement, with a different billing model — and neither route lifts this entry's public-class-only boundary while the model remains an `evaluation-candidate`.
- **Authority statement:** owns no independent governance authority; no role is bound to this model.
- **Evidence sources:** `07-decisions/DEC-20261027-02-moonshot-kimi-channel-classification.md`; `https://platform.kimi.ai/docs/models.md` (read 2026-10-27); `~/.kimi-code/config.toml` (read 2026-10-27).

## Lanes (`DEC-20261020-01`, active 2026-10-21)


Every Build Room builder seat lane binds to a `surface:provider` token
plus the closed allowlist below, and every `independent-reviewer` Tier-2
lane binds to its `surface:provider` token alone, with no allowlist
(`DEC-20261020-01` clauses 1 and 2, as its Amendment 4 amends them). The
table is copied from that decision's clause 2, with the one addition named
below; the decision governs if the two otherwise differ.
Each listed model's entry above carries a `lanes:` field naming its
lanes. Adding a lane, or a model to a builder lane's allowlist, is a
Founder act recorded here. Superseded wording, kept as history: "Every
Build Room builder seat lane and every `independent-reviewer` Tier-2
lane binds to a `surface:provider` token plus the closed allowlist below
(`DEC-20261020-01` clauses 1 and 2)." and "Adding a lane or a model to an
allowlist is a Founder act recorded here."

| Lane | Role | Allowlist | Source |
|---|---|---|---|
| `claude-code:anthropic` | builder | `claude-opus-5.5`, `claude-fable-5.1`, `claude-fable-5.2`; `claude-fable-5.5` on registration | Opus 5.5: `DEC-20261019-01` Clause D. Fable 5.1 and 5.5: the Founder's answer of 2026-10-21. Fable 5.2: the Founder's act of 2026-11-17, recorded here |
| `codex:openai` | builder | `gpt-6.1-sol`, `gpt-6-astra` | `DEC-20261019-01` Clause B |
| `codex:openai` | Tier-2 | none (any model the surface serves from the provider) | `DEC-20261019-01` Clause B; allowlist retired by `FOUNDER-RULING-20261118-TIER2-SURFACE-LANES` B1, formerly `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-luna` |
| `antigravity:google` | Tier-2 | none (any model the surface serves from the provider) | `DEC-20261019-01` Clause A; public class only; allowlist retired by `FOUNDER-RULING-20261118-TIER2-SURFACE-LANES` B1, formerly `gemini-4-argon` |
| `antigravity:anthropic` | Tier-2 | none (any model the surface serves from the provider) | `DEC-20261019-01` Clause D; public class only (the Founder's answer of 2026-10-21); allowlist retired by `FOUNDER-RULING-20261118-TIER2-SURFACE-LANES` B1, formerly `claude-opus-5.5`, `claude-sonnet-5.5` |
| `grok-build:xai` | Tier-2 | none (any model the surface serves from the provider) | `DEC-20260719-02`; allowlist retired by `FOUNDER-RULING-20261118-TIER2-SURFACE-LANES` B1, formerly `grok-4.5`; `grok-4.6`, `grok-4.7`, `grok-4.7-build-fast` on registration (the Founder's answer of 2026-10-21) |

`claude-code` carries no Tier-2 lane. A model marked "on registration"
joins its allowlist only once its own entry, built from its provider's
documentation, merges here; work it serves before then is off-list.
`grok-4.6`, `grok-4.7` and `grok-4.7-build-fast` are registered (2026-10-25,
above) and so joined the `grok-build:xai` allowlist, which
`FOUNDER-RULING-20261118-TIER2-SURFACE-LANES` later retired (below).
Superseded wording, kept as history: "`grok-4.6`, `grok-4.7` and
`grok-4.7-build-fast` are registered (2026-10-25, above) and so join the
`grok-build:xai` allowlist." `claude-fable-5.5` has
no entry yet: Anthropic has not released it (models overview, read
2026-10-25). `claude-fable-5.2` is not in clause 2's table: the Founder
added it to the `claude-code:anthropic` allowlist on 2026-11-17, an act
clause 2 provides for and this registry records, and it is registered
(above).

The per-model `tier2_attestation_id` field is retired for these lanes
(`DEC-20261020-01` clause 6); each entry keeps its last value in a
comment. Entries outside the table, including retired ones such as
`gemini-3.1-pro` and the `gpt-5.6` family, keep the field as dated
history. FounderOS Tier-2 verdicts stay under
`FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION` B2 and B3 (surface
named, model recorded, not bound); clause 4's refusal of off-list work
applies on Build Room builder lanes only. Superseded wording, kept as
history: "clause 4's refusal of off-list work applies on Build Room lanes
only."

**Tier-2 lanes bound to surface and provider alone (ruled 2026-11-18).** The Founder's
`FOUNDER-RULING-20261118-TIER2-SURFACE-LANES`, recorded verbatim as
Amendment 4 to `DEC-20261020-01`, retires the allowlists of the four
Tier-2 rows above when FounderOS pull request 434 merges; a review run
before then is judged under the allowlist in force when it ran (B6). A Build Room review on one of these lanes may run on
any model the surface serves from that provider, with no act and no
entry here. It records the model or models that served it in its
`Tier2-Reviewer-Model:` line, from the surface's own report (on `codex`,
the client's `/status`, recorded as
`<model id> (requested and routed; codex client /status)`). It does not
count when it announces no model, as when that line is missing or reads
`unavailable-from-current-harness`; when a model it names has the
builder's family or is on the restricted roster of `DEC-20260719-02`
clause 5; or when the material's data class is not permitted by its
lane's terms or by stricter terms that a named model's own provider
documentation or registry entry states. A review that names more than one
model is judged on each, and nothing else about the model stops it. The
builder flags, without refusing, a model its provider does not present as
a main model, and the Founder accepts the review or has it run again. The "on
registration" rule above now applies to builder lanes only; the Tier-2
lanes' former allowlists are kept in their Source cells, and the model
entries keep their `lanes:` fields as they stand. Build Room's seat
registry copy of these lanes follows in its own pull request (the
ruling's C2).

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

## Amendment and reconciliation record

The registry above was formerly split across this file's `Registry` section and
six further `##` sections titled after the decision that introduced each group of
models, so locating a model required knowing which decision had registered it.
Those sections are preserved verbatim below as `###` subsections — every original
heading still exists, so citations resolve — with their model entries moved up
into the single registry. Each subsection opens with the list of entries it used
to hold.

### G3 Slice B+ model additions and routing projection

Entries moved to the registry above: `opus-4.7`, `gpt-5.6-sol`, `gpt-5.6-terra`, `deepseek-v4-flash`, `deepseek-v4.1-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`.

**Authority state:** active, ratified by `DEC-20260807-01` (2026-08-07).
Registration does not override channel or data-class controls. A route whose
channel, model identity, or permission boundary cannot be verified fails
closed; no model is silently substituted.

### Bindings added by `DEC-20261005-01` (ratified 2026-10-05) — 16 new entries; two existing entries amended above (18 seats total)

Entries moved to the registry above: `kimi-k3`, `gemini-3.8-flash`, `gpt-6.1-sol`, `minimax-m3`, `claude-opus-5.5`, `claude-sonnet-5.5`, `mimo-v2.6-pro`, `qwen3.7-max`, `qwen3.8-max`, `minimax-m2.7`, `step-3.7-flash`, `glm-5.3`, `nemotron-3.5-lightning`, `muse-spark-1.3`, `claude-fable-5.1`, `qwen3.7-flash`.

#### G3 Slice B+ Builder bindings for existing registered IDs — applied

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

### Tier-2 roster reconciliation (`DEC-20260719-02` v1.1, 2026-08-15)

Entries moved to the registry above: `gpt-5.6-luna`.

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

#### Tier-2 full roster — dated history, and the `model_id` / attestation-id variance

*Heading updated 2026-11-18; it read "Tier-2 full roster — current, and
the `model_id` / attestation-id variance". No roster in this section is
current: for Build Room, Tier-2 lanes are surfaces and providers with no
model roster from the merge of FounderOS pull request 434
(`DEC-20261020-01` Amendment 4), and for FounderOS the surface act below
governs. The full-roster Tier-2 bindings the cross-reference below
points to are dated history on the same terms; the restricted roster is
unaffected.*

*Dated history for the FounderOS gate from 2026-10-11.* Under
`FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION` (recorded in
`DEC-20260719-02` v1.2), once its implementing pull request merges the
FounderOS `tier2-shape` gate accepts only the surface ids `antigravity`,
`codex`, `chatgpt` and `grok-build` in `Tier2-Reviewer-Id:`, and records the
model in `Tier2-Reviewer-Model:` as the reviewer reports it. The table and
the variance below describe the gate from 2026-08-14 until that merge, and
the roster as it applied outside FounderOS (Build Room reviews under
`DEC-20260815-05`) until `DEC-20261020-01` and its Amendment 4
(`FOUNDER-RULING-20261118-TIER2-SURFACE-LANES`), under which a Build Room
Tier-2 lane is a surface and provider with no model roster. Superseded
wording, kept as history: "the roster as it still applies outside
FounderOS (Build Room reviews under `DEC-20260815-05`)". The open item at the end of the variance note is closed
for FounderOS by the same act: the gate no longer matches model ids, so the
trap no longer exists there.

Cross-reference only; the authority is `DEC-20260719-02` clause 2 (v1.1,
2026-08-15) and the binding lives on each model's own entry above.

**Superseded 2026-10-19** (`DEC-20261019-01`): the live roster is `gemini-4-argon`, `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-luna`, `grok-4.5`, plus the Claude 5.5 pair; every attestation id is a surface token per `DEC-20261001-01`. The table below is retained as the record of the variance as it stood.

| `model_id` (this registry) | `Tier2-Reviewer-Id` (the gate accepts) | Same string? |
|---|---|---|
| `gemini-3.1-pro` | `gemini-3.1-pro` | yes |
| `gpt-5.6-sol` | `chatgpt-5.6-sol` | **no** |
| `gpt-5.6-terra` | `chatgpt-5.6-terra` | **no** |
| `gpt-5.6-luna` | `chatgpt-5.6-luna` | **no** |
| `grok-4.5` | `grok-4.5` | yes |

**The variance was live in the FounderOS gate, and it bit** (2026-08-14 until
the surface act's implementation merged). `00-system/scripts/tier2-shape-check.sh`
matched `Tier2-Reviewer-Id:` against a fixed regex that spelled the three Codex
models with a `chatgpt-` prefix, while this registry — following
`DEC-20260807-01` — spells them `gpt-`. A marker written with the `model_id`
form (`Tier2-Reviewer-Id: gpt-5.6-sol`) **failed** the gate with *"not on the
founder-ratified roster"*, even though the model was genuinely on the roster.
In that period, the attestation id was the token to write. A FounderOS marker
now names a surface and records the model in `Tier2-Reviewer-Model:`.

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

### Binding added by `DEC-20261016-01` (ratified 2026-10-16)

Entries moved to the registry above: `gemini-4-argon`.

### Bindings added by `DEC-20261019-01` (ratified 2026-10-19)

Entries moved to the registry above: `gpt-6-astra`, `gpt-6-luna`.

### Entries registered under `DEC-20261020-01` (2026-10-25)

Entries moved to the registry above: `grok-4.6`, `grok-4.7`, `grok-4.7-build-fast`.

Three of the four models `DEC-20261020-01`'s clause 2 table admits "on registration", each built from its provider's documentation as read on 2026-10-25. From the merge of FounderOS pull request 434, Amendment 4 retires the `grok-build:xai` allowlist, so the three Grok entries are no longer a condition of a Build Room review; their data-boundary conditions stand, and `claude-fable-5.5`'s builder-lane admission is unchanged. xAI's pages now name the company SpaceXSI; the registry keeps provider `xai`, as the lane token `grok-build:xai` does. `claude-fable-5.5` has no entry: Anthropic's models overview (https://platform.claude.com/docs/en/models/overview, read 2026-10-25) lists Claude Fable 5.1, Opus 5.5, Sonnet 5.5 and Haiku 5.5 and no Fable 5.5, so the Founder's condition ("once becomes available") is not met.

## Cross-references

- `/00-system/identity-taxonomy.md` §4/§5/§7 — model, provider, and binding-status definitions.
- `/04-agents/role-registry.md` — the roles these models are (or are not) bound to, with matching statuses.
- `/00-system/identity-map.md` — full current-to-future mapping.
- `/00-system/model-portfolio-and-routing-strategy.md` — the portfolio architecture, classification ladder, and routing/failure policy each entry's `portfolio_classification` field refers to.
- `/00-system/data-boundary-policy.md` — the provider classes (P1–P5) each entry's `deployment_channel` field refers to.
- `/04-agents/temporary-task-assignment-policy.md` — the lifecycle governing every `temporary_task_assignments` entry above.

---
