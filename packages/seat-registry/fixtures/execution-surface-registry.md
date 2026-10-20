---
title: Execution-Surface Registry
type: agent
owner: founder
company: mad-ventures
product: mad-ventures-os
status: active
created: 2026-07-15
updated: 2026-10-16
version: 0.11
review_cycle: on-change
source_of_truth: true
related_decisions:
  - DEC-20260715-17-stable-roles-and-replaceable-execution-architecture
  - DEC-20260718-05-g3-slice-a-role-attribution-handoff-taxonomy
  - DEC-20260807-01-g3-slice-b-plus-coding-execution-surface-governance
  - DEC-20260815-06-execution-surface-registration
  - DEC-20261015-01-build-room-control-plane-execution-surface
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
- **Tier-2 review (2026-10-11):** one of the four surfaces a binding FounderOS Tier-2 verdict may name, under `FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION` B2 (recorded in `DEC-20260719-02`); it may execute `independent-reviewer`. The model is recorded, not bound (B3). Build Room and `madventures-tui` keep their own review rules (B7).
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

- **Identity rule:** Grok Build is an agentic coding application and coding execution surface (an xAI CLI / agent session) — **not a model**, **not a provider** (the provider behind it is `xai`; the underlying model is `grok-4.5`), **not a role**, and specifically **not the Builder**; the `builder` role may be performed *through* this surface. **Tier-2 review (amended 2026-10-11).** Under `FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION` B2 (recorded in `DEC-20260719-02`), `grok-build` is one of the four surfaces a binding FounderOS Tier-2 verdict may name, and it may execute `independent-reviewer`. The model behind it is recorded in the marker's `Tier2-Reviewer-Model:` line and is not bound (B3); the data-boundary condition on `grok-4.5` — public-class content only while its `deployment_channel` is unverified, unless the Founder authorizes more per `DEC-20260716-01` clause 6 — still binds any review it performs. Build Room and `madventures-tui` keep their own review rules (B7). Superseded wording, kept as history: "This **surface** is not a Tier-2 `independent-reviewer` roster member, and registering it as an execution surface does not add it to any review roster — the roster lists **models**, not surfaces. **The distinction is live, not academic: the model behind this surface, `grok-4.5`, *is* on the Tier-2 full roster** (`DEC-20260719-02`, added 2026-07-26). So a Grok 4.5 Tier-2 review satisfies the role while `grok-build` remains only the surface it may run on. Note the roster entry's data-boundary condition on `grok-4.5`: while its `deployment_channel` is unverified, internal-class review content requires explicit auditable founder authorization per `DEC-20260716-01` clause 6 — public-class only by default. **Read the roster in `DEC-20260719-02` or `/04-agents/role-registry.md`, never a count enumerated here** — an earlier revision of this line asserted "that roster is Opus 4.8 / GPT-5.6", which the 2026-07-26 expansion superseded, and a `claude-code` session relied on that stale text on 2026-07-31 to tell the founder a Grok Tier-2 would not discharge the gate. The founder corrected it. Enumerating a roster in a second place is what created the defect; this entry now points at the source instead."
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
- **Tier-2 review (2026-10-11):** one of the four surfaces a binding FounderOS Tier-2 verdict may name, under `FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION` B2 (recorded in `DEC-20260719-02`); it may execute `independent-reviewer`, and only that role is added (see the permission table below). The model is recorded, not bound (B3). Build Room and `madventures-tui` keep their own review rules (B7).
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

### `build-room-control-plane`

**Authority:** `DEC-20261015-01`, **active**, ratified by the Founder on
2026-10-16 (comment 6205065988 on FounderOS pull request 380). It
attributes one act, T2. No act is attributed to it until Build Room's
planner loop sets T2's attribution.

```yaml
surface_id: build-room-control-plane
display_name: Build Room Control Plane
classification: runtime-execution-surface
surface_subtype: deterministic-control-plane-service
application_id: build-room-control-plane
current_status: registered-operator # registered; no act attributed to it until Build Room's planner loop sets T2's attribution
governing_decision: DEC-20261015-01
permitted_role_ids: [builder]
independent_authority: none
repository_access_status: none
approval_authority: prohibited
merge_authority: prohibited
founder_impersonation: prohibited
credential_disclosure: prohibited
state_transitions: T2 task.dispatched.planner only, with guard facts it derives itself; any other needs a further Founder decision
audit_requirements: retain execution-surface identity separately from role, model, and actor identity
activation_phase: build-room-phase-4
```

- **Classification:** execution surface only — never a role, model, provider, tool, or authority.
- **Surface purpose:** the Build Room control-plane service (the Railway-hosted application in `MADVenturesLLC/founder-os-build-room`), for one deterministic act it performs itself, with no model invoked: the Phase 4 planner loop's T2 `task.dispatched.planner`. Any other act needs a further Founder decision.
- **Attribution of that act:** `Role-Id: builder`; `Actor-Id: control-plane:<deployment id>`, naming the deployment that acted; model `n/a (deterministic control-plane act)`; `Execution-Surface: build-room-control-plane`.
- **Not attributed here:** a Founder act received through its authenticated routes stays `Actor-Id: founder`; a seat's work stays on the surface that seat ran on.
- **Independent authority:** none. It invokes no model, originates no Founder act, approves, merges and adjudicates nothing, and discloses no credential.
- **Registration boundary:** registration grants no standing permission to execute and authorizes no counted run, deployment, merge, or roster change.
- **Current status:** registered under `DEC-20261015-01`, ratified 2026-10-16; no act attributed to it yet.

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

**Tier-2 review (2026-10-11).** Under `FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION`
B2 (recorded in `DEC-20260719-02`), `antigravity` is one of the four surfaces
a binding FounderOS Tier-2 verdict may name. For that review only, B3
replaces the model condition above: the model is recorded in the marker's
`Tier2-Reviewer-Model:` line as the reviewer reports it, or
`unavailable-from-current-harness`, and a model-registry entry is no longer a
condition of a binding verdict. The yaml line it supersedes for Tier-2 review,
kept as written: "underlying_model_selection: founder-manual-selection-required;
must be a registered, provider-verified Gemini model ID carrying a
model-registry entry; exact model and effort recorded". For every other role
on this surface that line stands. Build Room and `madventures-tui` keep their
own review rules (B7).

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

### `kimi-cli`

```yaml
surface_id: kimi-cli
display_name: Kimi CLI
classification: coding-execution-surface
surface_subtype: agentic-coding-harness
application_id: kimi-cli
application_classification: agentic-coding-application
provider_context: moonshot                            # Moonshot AI; operator's kimi.com subscription route
current_status: registered-operator                    # no DEC-traced commit/PR work yet; C7 task44 was a brief, not task work
governance_status: classified-in-g3                  # consistent with G3 Slice B+ activation pattern
supported_work_types: coding work per the Kimi CLI lane; CLI non-interactive mode (`kimi --prompt`)
underlying_model_selection: session-configured; default `kimi-code/k3` per `~/.kimi-code/config.toml`
repository_access_status: per a separately authorized task assignment; not a standing grant
runtime_integration_status: none
approval_requirements: existing agent-rules approval gates apply unchanged
audit_requirements: future audit records must record this surface as `execution_surface`
activation_phase: G3
```

- **Identity rule:** Kimi CLI is the Moonshot-AI-branded coding CLI
  harness. It is **not a model** (`kimi-code/k3` is a model;
  `moonshotai/kimi-k3` is the OpenRouter-routed model — Kimi CLI does
  not use that route); **not a provider** (Moonshot AI is the provider);
  **not a role**; **not the Builder**.
- **Permission projection:** `builder`, `architect` (no
  `independent-reviewer`; no `strategist`).
- **Attribution (Founder directive, 2026-09-28):** any PR attributed
  to work performed through the Kimi CLI surface MUST carry the
  Attribution block per `DEC-20260718-05` (Role-Id / Actor-Id /
  Execution-Surface) on the PR body and as commit-message trailers.
  No exception. Kimi is not special; the Attribution Shape Check
  applies as it does for every other registered surface.
- **Standing authority statement (inherited):** the surface owns no
  independent governance authority and performs work only on behalf of
  an authorized role under an approved task and approval policy.
- **Evidence sources:** `~/.kimi-code/AGENTS.md` (101 lines, SHA
  `de60af6b…`, last modified 2026-09-04); `~/.kimi-code/config.toml`
  (`default_model = "kimi-code/k3"`, `provider = "managed:kimi-code"`,
  OAuth access); `which kimi` → `/usr/local/bin/kimi`; `kimi --help`
  (verified: `--prompt` non-interactive mode present); Phase 2
  alignment document
  `~/MADVenturesOPs/build-room/verification/TOOL-CONFIG-ALIGNMENT-PHASE2-20260904.md`
  (Kimi row, line 35); `subscription-vs-api-inventory.md` Moonshot row
  (line 157).

### `zcode`

```yaml
surface_id: zcode
display_name: Zcode
classification: coding-execution-surface
surface_subtype: agentic-coding-harness
application_id: zcode
application_classification: agentic-coding-application
provider_context: z-ai                                # Z.ai; the z.ai coding plan is the authorized route
current_status: registered-operator                    # daily protocol logs but no DEC-traced task work yet
governance_status: classified-in-g3
supported_work_types: coding work per the Zcode app lane; interactive session harness with v2 runtime
underlying_model_selection: session-configured; default `GLM-5.3` per `~/.zcode/v2/provider_config.json`
repository_access_status: per a separately authorized task assignment; not a standing grant
runtime_integration_status: none
approval_requirements: existing agent-rules approval gates apply unchanged
audit_requirements: future audit records must record this surface as `execution_surface`
activation_phase: G3
```

- **Identity rule:** Zcode is the Z.ai-branded interactive coding
  application. It is **not a model** (GLM-5.3 is a model; the surface
  is the harness); **not a provider** (Z.ai is the provider behind it);
  **not a role**; **not the Builder**.
  Recording this explicitly so a future reader doesn't read the
  `anthropic-messages` API type as `provider_context: anthropic`.
- **Permission projection:** `builder`, `architect` (no
  `independent-reviewer`; no `strategist`).
- **Standing authority statement (inherited).**
- **Evidence sources:** `~/.zcode/AGENTS.md` (120 lines, SHA
  `ac3175e5…`, last modified 2026-09-04); `~/.zcode/v2/provider_config.json`
  (`providerId: account:zai-individual-coding-plan`, `modelOrder`
  includes GLM-5.3, GLM-5.3-Flash, deepseek-v4.1-flash, qwen3.8 max);
  `~/.zcode/v2/runtime/.../zcode-builtin.json` (`zai-api` template:
  `zhipu-coding-plan-api-key` access, `anthropic-messages` API at
  `https://api.z.ai/api/anthropic`); `~/.zcode/cli/log/zcode-2026-09-28.jsonl`
  (1,649 heartbeat lines today alone, active session and `v4.publishers`
  counters); Phase 2 alignment document
  (`TOOL-CONFIG-ALIGNMENT-PHASE2-20260904.md`, Zcode row, line 34);
  `subscription-vs-api-inventory.md` Z.ai row (line 156).

### `minimax`

```yaml
surface_id: minimax
display_name: MiniMax
classification: coding-execution-surface
surface_subtype: agentic-coding-harness
application_id: minimax
application_classification: agentic-coding-application
provider_context: minimax                              # MiniMax; the operator's MiniMax subscription is the authorized route
current_status: registered-operator                    # real application dir present; no DEC-traced task work yet
governance_status: classified-in-g3
supported_work_types: coding work per the MiniMax lane; interactive + CLI session harness with v2 runtime
underlying_model_selection: session-configured; default per `~/.minimax/config.yaml`
repository_access_status: per a separately authorized task assignment; not a standing grant
runtime_integration_status: none
approval_requirements: existing agent-rules approval gates apply unchanged
audit_requirements: future audit records must record this surface as `execution_surface`
activation_phase: G3
```

- **Identity rule:** MiniMax is the MiniMax-branded agentic coding
  application and coding execution surface. It is **not a model**
  (the `minimax` family of models — `MiniMax-M2.7`, `MiniMax-M3`,
  etc. — is the model layer; the surface is the harness); **not a
  provider** (MiniMax is the provider behind it); **not a role**;
  **not the Builder**.
- **Permission projection:** `builder`, `architect` (no
  `independent-reviewer`; no `strategist`).
- **Attribution:** any PR attributed to work performed through the
  MiniMax surface MUST carry the Attribution block per `DEC-20260718-05`
  on the PR body and as commit-message trailers. Same rule as Kimi,
  same rule as every other registered surface.
- **Standing authority statement (inherited).**
- **Evidence sources:** `~/.minimax/` (live application dir, last
  modified 2026-09-28 05:24, containing `agents/`, `auth/`,
  `bin/`, `cache/`, `config.yaml`, `integrations/`,
  `mcp-runtime-names.json`, `permission.json`, `plugins/`,
  `run/`, `sessions/`, `shims/`, `skill-hub.json`, `skills/`,
  `v2/`); `~/.minimax/config.yaml`; Phase 2 alignment document
  (`TOOL-CONFIG-ALIGNMENT-PHASE2-20260904.md`, no MiniMax row — this
  registration is the first formal classification for the MiniMax
  `subscription-vs-api-inventory.md` (MiniMax is
  referenced as a China-origin candidate alongside Kimi, line 157).

### `mimo`

```yaml
surface_id: mimo
display_name: Mimo
classification: coding-execution-surface
surface_subtype: agentic-coding-harness
application_id: mimo
application_classification: agentic-coding-application
provider_context: mimo
current_status: registered-operator
governance_status: classified-in-g3
supported_work_types: coding work per the Mimo lane; interactive CLI + daemon runtime
underlying_model_selection: session-configured; default per `~/.config/mimocode/mimocode.jsonc`
repository_access_status: per a separately authorized task assignment; not a standing grant
runtime_integration_status: none
approval_requirements: existing agent-rules approval gates apply unchanged
audit_requirements: future audit records must record this surface as `execution_surface`
activation_phase: G3
```

- **Identity rule:** Mimo is the MiniMax-affiliated agentic coding
  application and coding execution surface. It is **not a model**;
  **not a provider** (the provider behind it is recorded on the
  model layer, not on this surface); **not a role**; **not the
  Builder**.
- **Permission projection:** `builder`, `architect` (no
  `independent-reviewer`; no `strategist`).
- **Attribution:** any PR attributed to work performed through the
  Mimo surface MUST carry the Attribution block per `DEC-20260718-05`
  on the PR body and as commit-message trailers.
- **Standing authority statement (inherited).**
- **Asymmetry:** Mimo does **not** have a `~/.config/mimocode/AGENTS.md`
  MAD-kernel pointer; the Phase 2 tool-config alignment
  (2026-09-04) covered Kimi, Zcode, MiniMax, and Qwen but did not
  cover Mimo. This is not blocking for registration but is flagged
  as a follow-on: either add the MAD-kernel pointer at
  `~/.config/mimocode/AGENTS.md` (recommended) or note explicitly
  that Mimo runs without one. Recording the asymmetry so a future
  reviewer doesn't mistake it for "Mimo is ungoverned."
- **Evidence sources:** `~/.config/mimocode/` (last modified
  2026-09-14 23:32, containing `mimocode.jsonc`, `package.json`,
  `package-lock.json`, `node_modules/@mimo-ai/`); `~/.local/share/mimocode/`
  (last modified 2026-09-17 20:26, containing `auth.json`, `mcp-auth.json`,
  `mimocode.db` 10.9 MB, `memory/`, `log/`).

### `qwen`

```yaml
surface_id: qwen
display_name: Qwen
classification: coding-execution-surface
surface_subtype: agentic-coding-harness
application_id: qwen
application_classification: agentic-coding-application
provider_context: alibaba
current_status: registered-operator
governance_status: classified-in-g3
supported_work_types: coding work per the Qwen lane; interactive CLI + session harness
underlying_model_selection: session-configured; default per `~/.qwen/settings.json`
repository_access_status: per a separately authorized task assignment; not a standing grant
runtime_integration_status: none
approval_requirements: existing agent-rules approval gates apply unchanged
audit_requirements: future audit records must record this surface as `execution_surface`
activation_phase: G3
```

- **Identity rule:** Qwen is the Alibaba-branded agentic coding
  application and coding execution surface. It is **not a model**
  (`qwen3.7-plus`, `qwen3.8-max`, etc. are the model layer; the
  surface is the harness); **not a provider** (Alibaba is the
  provider behind it); **not a role**; **not the Builder**.
- **Permission projection:** `builder`, `architect` (no
  `independent-reviewer`; no `strategist`).
- **Attribution:** any PR attributed to work performed through the
  Qwen surface MUST carry the Attribution block per `DEC-20260718-05`
  on the PR body and as commit-message trailers.
- **Standing authority statement (inherited).**
- **OpenRouter note:** the existing inventory row
  (`subscription-vs-api-inventory.md` line 155) recommends
  OpenRouter for closed Qwen variants. The Qwen CLI surface
  registered here is **not** OpenRouter-routed; it routes via the
  operator's own subscription. The OpenRouter recommendation
  continues to apply to any surface that uses the OpenRouter model
  route. Recording the distinction explicitly so a future reader
  doesn't conflate the two routes.
- **Evidence sources:** `~/.qwen/QWEN.md` (102 lines, SHA-256
  `001c400e3720e3bfeabf4ef7f83acf692296a10c0e9a7b5595071df403a547de`,
  last modified 2026-09-04); `~/.qwen/settings.json` (10,581 bytes,
  last modified 2026-09-28 08:03); `~/.qwen/sessions/`,
  `~/.qwen/skills/`, `~/.qwen/projects/`; Phase 2 alignment document
  (`TOOL-CONFIG-ALIGNMENT-PHASE2-20260904.md`, Qwen row, line 36);
  `subscription-vs-api-inventory.md` Alibaba row (line 155).

### Roles permitted to execute via each coding surface

| Registered surface ID | Stable roles permitted to execute via the surface |
|---|---|
| `claude-code` | `builder`, `architect`, `strategist`, `independent-reviewer` |
| `grok-build` | `builder`, `independent-reviewer` |
| `codex` | `builder`, `architect`, `strategist`, `independent-reviewer` |
| `cursor` | `builder`, `architect`, `independent-reviewer` |
| `antigravity` | `builder`, `architect`, `independent-reviewer` |
| `chatgpt` | `independent-reviewer` (FounderOS Tier-2 review, added 2026-10-11 by `FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION` B2; a general surface, listed here for that role only) |
| `hermes-local-code` | `builder` |
| `kimi-cli` | `builder`, `architect` |
| `zcode` | `builder`, `architect` |
| `minimax` | `builder`, `architect` |
| `mimo` | `builder`, `architect` |
| `qwen` | `builder`, `architect` |

These are permissions, not permanent bindings. Every execution has exactly one
stable role. Coordination is expressed through parent/child execution records;
planning uses `architect` or `strategist`; integration is a `builder` task
assignment. Plugin and CLI children receive equal-or-narrower authority than
their parent and must be independently recorded.
