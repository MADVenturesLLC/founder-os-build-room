---
title: Execution-Surface Registry
type: agent
owner: founder
company: mad-ventures
product: mad-ventures-os
status: active
created: 2026-07-15
updated: 2026-08-26
version: 0.9
review_cycle: on-change
source_of_truth: true
related_decisions:
  - DEC-20260715-17-stable-roles-and-replaceable-execution-architecture
  - DEC-20260718-05-g3-slice-a-role-attribution-handoff-taxonomy
  - DEC-20260807-01-g3-slice-b-plus-coding-execution-surface-governance
  - DEC-20260815-06-execution-surface-registration
related_workflows: []
used_by:
  - builder
read_by:
  - all-active-roles
written_by:
  - builder
tags:
  - agent
  - execution-surface
  - coding-execution-surface
  - registry
  - foundation
  - active
---

# Execution-Surface Registry

## Purpose
Classifies the environments and harnesses through which role-model work is performed, per `/00-system/identity-taxonomy.md` §6 and §8–§9. An execution surface is never a role. Listing a surface here does **not** approve it for unrestricted production work — operational routing, task isolation, repository permissions, and approval gates for the coding surfaces are deferred to package **G3 (Coding Execution Surface Governance and Pilot)**.

**This registry is active and authoritative**, promoted by the G2 activation package: `04-agents/claude-code.md`, `04-agents/cursor.md`, `04-agents/codex.md`, and `04-agents/plato-chatgpt.md` are reconciled to it — each identifies its subject as an application/execution surface, not a role. Operational governance of the coding surfaces remains deferred to package G3.

## Owner
Founder. `builder` maintains structure (G1 drafting executed via Claude Code and the Fable 5 temporary Builder assignment — provenance).

## Used By / Read By
Any audit record distinguishing `execution_surface` from `role_id`; the future G3 coding-surface governance package.

## Written By
`builder`. Provenance: initial foundation via Claude Code; Phase G1 repair via the Fable 5 founder-directed temporary Builder assignment.

## Update Cadence
On-change.

## Current Status
Active — promoted by the G2 activation package executing `DEC-20260715-16` item 8 and `DEC-20260715-17` item 16. `migration_status: governance-activated`. `activation_status: active`. **G3 Slice B+ is ratified** (`DEC-20260807-01`, 2026-08-07): `antigravity` and `hermes-local-code` registrations are active; all six coding surfaces carry G3 permission projections. MP-1 remains approved-not-active; the Temporary Task-Assignment Policy remains controlling.

## Next Action
**G3 Slice A is ruled**: commit/PR role attribution and handoff-taxonomy closure are governed by `DEC-20260718-05` (active). **G3 Slice B+ is ratified**: coding-surface routing policy, task isolation, repository permission matrices, and the governance package are active per `DEC-20260807-01`. Implementation and the controlled pilot proceed under Phase 0's architect-commission sequence; MP-1 activation remains a later, separate Founder ruling.

## Done Criteria
Every execution surface role work is known to pass through is classified here, distinctly from any role, model, interface, tool, or framework, with an explicit authority statement.

---

## Standing authority statement (applies to every surface below)

**The surface owns no independent governance authority and performs work only on behalf of an authorized role under an approved task and approval policy.**

---

## Registry

### `claude-code`

```yaml
surface_id: claude-code
display_name: Claude Code
classification: coding-execution-surface
surface_subtype: agentic-coding-harness
application_id: claude-code
application_classification: agentic-coding-application
provider_context: anthropic
current_status: in-active-use          # the operator lane exists in active doctrine
governance_status: classified-in-g1-operational-governance-deferred-to-g3
supported_work_types: repository implementation, validation, commits, pull requests (per the active operator lane)
underlying_model_selection: session-configured; not governed by a role binding yet
repository_access_status: full repository access in current practice (per active operator doctrine)
runtime_integration_status: none        # not a founder-os-telegram runtime adapter
approval_requirements: existing CLAUDE.md and constitution approval gates apply unchanged
audit_requirements: future audit records must record this surface as execution_surface (G3+)
activation_phase: G3
```

- **Identity rule:** Claude Code is an agentic coding application and coding execution surface — **not a model**, **not a provider** (the provider behind it is `anthropic`), **not a role**, and specifically **not the Builder**; the `builder` role may be performed *through* this surface. It is also not a tool in the future taxonomy.
- **Evidence sources:** `04-agents/claude-code.md`, `04-agents/claude-code/capability-profile.md`, `CLAUDE.md` (all existing, active, unchanged).

### `cursor`

```yaml
surface_id: cursor
display_name: Cursor
classification: coding-execution-surface
surface_subtype: agentic-coding-environment
application_id: cursor
application_classification: agentic-coding-application
current_status: registered-operator     # listed among the ten day-one operators
governance_status: classified-in-g1-operational-governance-deferred-to-g3
supported_work_types: coding environment work per the active Cursor lane in agent-rules
underlying_model_selection: environment-configured; not governed by a role binding yet
repository_access_status: per its active operator lane; not re-verified here
runtime_integration_status: none
approval_requirements: existing agent-rules lane rules apply unchanged
audit_requirements: future audit records must record this surface as execution_surface (G3+)
activation_phase: G3
```

- **Classification correction (G1 repair):** Cursor was previously placed in the Tool Registry by this foundation's first draft; its correct future classification is **coding execution surface**. The existing `04-agents/cursor.md` file remains unchanged in G1 — its current frontmatter (`type: agent`) and body (describing Cursor as a coding environment) are preserved migration evidence; the future classification recorded here takes effect through G2.
- **Identity rule:** Cursor is a coding execution surface, not a role and not a tool in the future taxonomy.
- **Evidence sources:** `04-agents/cursor.md` (existing, unchanged); `01-constitution/agent-rules.md` (Cursor lane, "Coding environment"); `04-agents/agent-registry.md` §1.

### `codex`

```yaml
surface_id: codex
display_name: Codex
classification: coding-execution-surface
surface_subtype: agentic-coding-harness
application_id: codex
application_classification: agentic-coding-application
provider_context: openai
current_status: registered-operator
governance_status: classified-in-g1-operational-governance-deferred-to-g3
supported_work_types: coding work per the active Codex lane in agent-rules
underlying_model_selection: product-configured; not governed by a role binding yet
repository_access_status: per its active operator lane; not re-verified here
runtime_integration_status: none
approval_requirements: existing agent-rules lane rules apply unchanged
audit_requirements: future audit records must record this surface as execution_surface (G3+)
activation_phase: G3
```

- **Identity rule:** Codex, in current-product contexts, is an agentic coding application and coding execution surface — not a canonical organizational role, not the Builder, not a tool, not a permanent governance authority, and not a model identifier. OpenAI is the provider/company behind it; the application identity is distinct from the provider. Historical references to an older Codex *model* remain explicitly historical model references and are not merged with the current application identity.
- **Evidence sources:** `04-agents/codex.md` (existing, unchanged); `01-constitution/agent-rules.md` (Codex lane).

### `grok-build`

```yaml
surface_id: grok-build
display_name: Grok Build
classification: coding-execution-surface
surface_subtype: agentic-coding-harness      # CLI / agent session
application_id: grok-build
application_classification: agentic-coding-application
provider_context: xai
current_status: in-active-use                # performed real founder-directed work (telegram PR #48)
governance_status: classified-in-g1-operational-governance-deferred-to-g3
supported_work_types: repository implementation, commits, pull requests (per founder-directed task assignment)
underlying_model_selection: grok-4.5; session-configured, not governed by a role binding yet
repository_access_status: per founder-directed task; not a standing grant, not re-verified here
runtime_integration_status: none             # not a founder-os-telegram runtime adapter
approval_requirements: existing CLAUDE.md / agent-rules approval gates apply unchanged
audit_requirements: future audit records must record this surface as execution_surface (G3+)
activation_phase: G3
```

- **Identity rule:** Grok Build is an agentic coding application and coding execution surface (an xAI CLI / agent session) — **not a model**, **not a provider** (the provider behind it is `xai`; the underlying model is `grok-4.5`), **not a role**, and specifically **not the Builder**; the `builder` role may be performed *through* this surface. This **surface** is not a Tier-2 `independent-reviewer` roster member, and registering it as an execution surface does not add it to any review roster — the roster lists **models**, not surfaces. **The distinction is live, not academic: the model behind this surface, `grok-4.5`, *is* on the Tier-2 full roster** (`DEC-20260719-02`, added 2026-07-26). So a Grok 4.5 Tier-2 review satisfies the role while `grok-build` remains only the surface it may run on. Note the roster entry's data-boundary condition on `grok-4.5`: while its `deployment_channel` is unverified, internal-class review content requires explicit auditable founder authorization per `DEC-20260716-01` clause 6 — public-class only by default. **Read the roster in `DEC-20260719-02` or `/04-agents/role-registry.md`, never a count enumerated here** — an earlier revision of this line asserted "that roster is Opus 4.8 / GPT-5.6", which the 2026-07-26 expansion superseded, and a `claude-code` session relied on that stale text on 2026-07-31 to tell the founder a Grok Tier-2 would not discharge the gate. The founder corrected it. Enumerating a roster in a second place is what created the defect; this entry now points at the source instead.
- **Evidence sources:** founder-directed addition (2026-07-23); attributed implementation work on founder-os-telegram **PR #48** (advisory follow-up), committed under `Actor-Id: session:grok-build/…` / `Execution-Surface: grok-build`, recorded in `09-handoffs/HO-20260722-02-independent-reviewer-to-builder.md` (v0.15).

### `chatgpt`

```yaml
surface_id: chatgpt
display_name: ChatGPT
classification: general-execution-surface
surface_subtype: conversational-ai-environment
application_id: chatgpt
application_classification: conversational-ai-application
provider_context: openai
current_status: in-active-use            # the Plato/ChatGPT lane exists in active doctrine
governance_status: classified-in-g1
supported_work_types: strategy, deliberation, drafting (per the active Plato/ChatGPT lane)
underlying_model_selection: product-configured; not governed by a role binding yet
repository_access_status: none verified   # no direct repository write path in evidence
runtime_integration_status: none
approval_requirements: existing agent-rules lane rules apply unchanged
audit_requirements: future audit records must record this surface as execution_surface (G3+)
activation_phase: G2-classification-only
```

- **Identity rule:** ChatGPT is a conversational AI application and general execution surface — **not the Strategist role and not the Chief of Staff role**. OpenAI is the provider behind it; the provider is not the application identity. `plato`/`plato-chatgpt` are legacy persona/operator identifiers, not surface aliases and not role aliases.
- **Evidence sources:** `04-agents/plato-chatgpt.md` (existing, unchanged); `01-constitution/agent-rules.md` (Plato/ChatGPT lane).

### `api-runtime`

```yaml
surface_id: api-runtime
display_name: API Runtime
classification: runtime-execution-surface
surface_subtype: service-runtime
current_status: in-active-use             # every live founder-os-telegram capability executes this way
governance_status: classified-in-g1
supported_work_types: provider API invocation for routed capabilities
underlying_model_selection: env-var-configured per capability/policy (see model registry)
repository_access_status: none            # the runtime reads doctrine via GitHub API; it does not write the repository
runtime_integration_status: live           # founder-os-telegram adapters
approval_requirements: runtime approval gates per the active audit/runtime contracts
audit_requirements: execution records already separate roleId/capabilityId/providerId/modelId
activation_phase: already-operative-as-implementation; G1 classifies it only
```

- **Identity rule:** direct provider API invocation without an interactive harness — the pattern `founder-os-telegram`'s adapters implement. Not a role.
- **Evidence sources:** `adapters/*.ts` (`founder-os-telegram`, inspected read-only); `/00-system/runtime-contract-v2.md` (active).

### `local-runtime`

```yaml
surface_id: local-runtime
display_name: Local Runtime
classification: runtime-execution-surface
surface_subtype: local-model-runtime
current_status: implemented-and-gated     # Hermes worker, kill-switch gated
governance_status: classified-in-g1
supported_work_types: local inference only (no file access, no shell access, per the runtime's own docs)
underlying_model_selection: HERMES_LOCAL_MODEL (value not committed)
repository_access_status: none
runtime_integration_status: live-when-enabled (HERMES_ENABLED)
approval_requirements: runtime approval gates per the active audit/runtime contracts
audit_requirements: same as api-runtime
activation_phase: already-operative-as-implementation; G1 classifies it only
```

- **Identity rule:** a self-hosted, local inference environment — the pattern the Hermes worker implements. Not a role; distinct from the `hermes-4-14b` model and the frozen `hermes` capability.
- **Evidence sources:** `04-agents/hermes-4-14b-local.md` (existing, unchanged); `adapters/local-worker-adapter.ts`, `hermes-worker/index.ts`, `.env.example` (`founder-os-telegram`, inspected read-only).


## Build Room execution surfaces

**Authority:** active `DEC-20260815-06`. Registration records identity and
permission boundaries only. It grants no standing permission to execute,
deploy, merge, adjudicate, or advance a phase.

### `build-room-gateway`

```yaml
surface_id: build-room-gateway
display_name: Build Room Gateway
classification: execution-surface
surface_subtype: local-agent-gateway
application_id: build-room-gateway
application_classification: local-gateway-execution-surface
current_status: implemented-and-in-governed-use
governing_decision: DEC-20260815-06
permitted_role_ids: [builder]
independent_authority: none
repository_access_status: bounded by the separately authorized Builder task and worktree
approval_authority: prohibited
merge_authority: prohibited
founder_impersonation: prohibited
credential_disclosure: prohibited
state_transitions: prohibited unless originated by the separately authenticated Founder control-plane surface
audit_requirements: retain execution-surface identity separately from role, model, and actor identity
activation_phase: build-room-v1-slice
```

- **Classification:** execution surface only — never a role, model, provider, tool, or authority.
- **Surface purpose:** local gateway credential custody; authorized worktree and execution-surface launch support; local execution and evidence observation.
- **Permitted role projection:** `builder` execution only, under a separate authorized task.
- **Independent authority:** none. The Gateway is an untrusted proposer and execution surface.
- **State transitions:** prohibited unless originated by the separately authenticated Founder control-plane surface.
- **Approvals:** prohibited.
- **Merge authority:** prohibited.
- **Founder impersonation:** prohibited.
- **Credential disclosure:** prohibited.
- **Repository access:** bounded by the separately authorized Builder task and worktree.
- **Audit requirement:** retain execution-surface identity separately from role, model, and actor identity.
- **Governing decision:** `DEC-20260815-06`.
- **Current status:** implemented and in governed use.
- **Registration boundary:** registration grants no standing permission to execute. The CLI is a front end to the Gateway and is not a separate registered surface. Founder authority-bearing acts originate only through the separately authenticated control-plane path. This registration does not authorize a gateway action, deployment, run, merge, or Phase 4.
- **Outstanding under the same decision:** `build-room-web` remains unregistered and gains no authority from this entry.

## Cross-references
- `/00-system/identity-taxonomy.md` §6, §8–§9 — application, surface, and coding-surface definitions.
- `/04-agents/role-registry.md` — roles performed through these surfaces.
- `/04-agents/tool-registry.md` — tools (Cursor is **not** there; see the classification correction above).
- `/00-system/identity-map.md` — full current-to-future mapping.


---

## G3 Slice B+ registrations and permission projection

**Authority state:** active, ratified by
`DEC-20260807-01-g3-slice-b-plus-coding-execution-surface-governance`
(2026-08-07). Each execution still requires a named task, one accountable
stable role, task-scoped permissions, and a Coding Governance Execution
Record. A surface is never a role and never inherits standing merge,
deployment, production, or policy-waiver authority.

### `antigravity`

```yaml
surface_id: antigravity
display_name: Gemini Antigravity
classification: coding-execution-surface
surface_subtype: founder-operated-interactive-coding-and-review-application
application_id: antigravity
application_classification: interactive-coding-application
provider_context: google-multi-model-ui
current_status: founder-operated
proposal_status: ratified-2026-08-07
operation_mode_when_ratified: founder-operated
permitted_role_ids: [builder, architect, independent-reviewer]
underlying_model_selection: founder-manual-selection-required; must be a registered, provider-verified Gemini model ID carrying a model-registry entry; exact model and effort recorded
repository_access_status: task-scoped only
approval_requirements: no Auto or silent switching; no self-review; exact task and code-state binding
audit_requirements: Coding Governance Execution Record plus child record for every plugin/CLI execution
prohibited_actions: merge, deployment, production operation, authority expansion
activation_phase: G3-slice-b-plus-active
```

Non-Gemini models visible in the application receive no authority merely from
being listed. Their own registered model, provider, channel, and data-boundary
rules continue to control.

### `hermes-local-code`

```yaml
surface_id: hermes-local-code
display_name: Hermes Local Code
classification: coding-execution-surface
surface_subtype: model-independent-local-coding-harness
application_id: hermes-local-code
application_classification: local-coding-application
provider_context: founder-operated-local
current_status: founder-operated
proposal_status: ratified-2026-08-07
operation_mode_when_ratified: founder-operated
permitted_role_ids: [builder]
current_proposed_model_selection: deepseek-v4-flash
repository_access_status: standing read limited to registered FounderOS roots; writes limited to assigned repository/worktree
approval_requirements: registered Founder-approved local model; actual model recorded; doctrine writes and sensitive paths require exact Founder assignment
audit_requirements: Coding Governance Execution Record; external transmission denied by default
prohibited_actions: sole binding Tier-2 verdict, self-review, merge, deployment, production operation, unauthorized egress
activation_phase: G3-slice-b-plus-active
```

This surface is distinct from `local-runtime`, the frozen `hermes` capability,
and any model record. `hermes-4-14b` remains a historical restricted model;
it is not renamed. Repository analysis and path audits execute as `builder`.
The `researcher` role is deliberately excluded.

### Roles permitted to execute via each coding surface

| Registered surface ID | Stable roles permitted to execute via the surface |
|---|---|
| `claude-code` | `builder`, `architect`, `strategist`, `independent-reviewer` |
| `grok-build` | `builder`, `independent-reviewer` |
| `codex` | `builder`, `architect`, `strategist`, `independent-reviewer` |
| `cursor` | `builder`, `architect`, `independent-reviewer` |
| `antigravity` | `builder`, `architect`, `independent-reviewer` |
| `hermes-local-code` | `builder` |

These are permissions, not permanent bindings. Every execution has exactly one
stable role. Coordination is expressed through parent/child execution records;
planning uses `architect` or `strategist`; integration is a `builder` task
assignment. Plugin and CLI children receive equal-or-narrower authority than
their parent and must be independently recorded.
