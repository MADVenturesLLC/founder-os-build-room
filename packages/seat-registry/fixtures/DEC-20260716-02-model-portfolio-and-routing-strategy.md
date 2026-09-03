---
title: DEC-20260716-02 — Model Portfolio and Routing Strategy
type: decision
owner: founder
company: mad-ventures
product: founder-os
status: approved
created: 2026-07-16
updated: 2026-08-07
version: 0.4
review_cycle: monthly
source_of_truth: true
related_decisions:
  - DEC-20260716-01-data-boundary-policy
  - DEC-20260715-17-stable-roles-and-replaceable-execution-architecture
  - DEC-20260715-16-mad-ventures-os-system-identity
  - DEC-20260715-14-technical-architect-agent-tier
  - DEC-20260714-01-deputy-chief-of-staff-role-and-preferred-model
  - DEC-20260715-05-langgraph-deferral-ratification
  - DEC-20260807-01-g3-slice-b-plus-coding-execution-surface-governance
related_workflows: []
used_by:
  - claude-code
  - founder
read_by:
  - all-active-operators
written_by:
  - claude-code
tags:
  - decision
  - model-portfolio
  - routing
  - taxonomy
  - foundation
  - approved-not-active
---

# DEC-20260716-02: Model Portfolio and Routing Strategy

## Purpose
Approves the Minimal Governed Core portfolio architecture, the model-classification ladder, the provider-diversification and model-replacement policies, the routing and failure policy, one narrow correction to the approved Architect tier's model identifier, the `hermes` capability's role ownership, and the explicit ratification of the temporary-task-assignment policy including its immediate-effectiveness exception — completing the governance foundation Package MP-1 exists to establish. This decision ratifies policy and two bounded corrections; it approves **no new permanent model binding** beyond the Architect tier already ratified by `DEC-20260715-14`, and — apart from the single, narrowly scoped temporary-assignment exception in item 14 — it does not activate anything repository-wide.

## Context
`DEC-20260715-17` approved the 17-role roster and the taxonomy separating roles from replaceable execution elements, but explicitly deferred "the future model portfolio" and "validation automation" to a later package (items 14–15), naming it the **MAD Ventures OS Model Portfolio and Routing Strategy**. `/04-agents/model-registry.md` itself states this package "is not made here." This decision is that package's governance component.

An independent evidence-gathering and research exercise, conducted read-only against the live repository state and current external provider documentation (verification date 2026-07-16), found: every model named in the approved Architect tier now exists publicly, with one correction required — `deepseek-v4-pro-thinking` is not a distinct provider SKU; DeepSeek V4 Pro is a single hybrid model whose thinking mode is toggled by an API parameter, not a separate model identifier. The same review found the `hermes` capability has no owning role in the current role registry — a gap that would leave the capability unroutable once fail-closed role routing activates. Every other candidate binding examined (Chief of Staff, Deputy Chief of Staff, Builder, Researcher, and the remaining unassigned roles) had implementation-observed or proposed evidence only, insufficient to ratify permanence under the evidentiary standard this decision adopts in item 3.

## Decision

1. **Portfolio architecture: Minimal Governed Core.** Zero new permanent model bindings are ratified by this decision. The Architect tier ratified by `DEC-20260715-14` is carried forward with its models, modes, tiers, and routing intent unchanged in substance (see item 7 for its sole correction). All other roles proceed on a staged evaluation track: a role gains a permanent binding only when a future, separate Founder decision ratifies specific evidence for it — never by accumulation of runtime usage alone.
2. **Model classification ladder.** Every model referenced anywhere in FounderOS governance carries exactly one of these statuses: `approved-binding`, `proposed-binding`, `implementation-observed`, `temporary-task-assignment`, `evaluation-candidate`, `watchlist`, `rejected`, `unverified`, `deprecated`. Promotion between statuses requires the evidence the receiving status demands; in particular, an `implementation-observed` model never self-promotes to `proposed-binding` or `approved-binding` by repetition alone — a decision must draft and a Founder must ratify the promotion.
3. **Provider-diversification policy.** At least two distinct providers must hold approved or proposed bindings across the runtime-routable roles considered as a whole. Once bound, a role designated `independent-reviewer` must not share its primary provider with the role designated `builder`'s primary provider. No data class defined in `DEC-20260716-01` may depend on a single provider for its only compliant route, except the local-only class, which is single-provider-class (P5) by definition.
4. **Model-replacement policy.** Doctrine records a binding's `model_id` and `mode` as intent; the literal provider SKU a deployment resolves to lives in the environment-carried deployment-resolution layer, exactly as `founder-os-telegram`'s `core/model-selection.ts` already implements. A same-provider, same-class model swap is an operational change logged in the decision log; a swap that changes provider, privacy class, or binding class requires a Founder decision. A provider's deprecation notice for a bound model triggers a mandatory review no later than half the deprecation window. Every model registry entry carries a `last_verified` date on its availability claim.
5. **Routing and failure policy.** For every role with an approved or proposed binding: the **primary** serves by default within the role's permitted data class (per `DEC-20260716-01`). The **secondary** is invoked only by the role's declared conditions, never by silent load balancing. The **advisor** informs the deciding lane and never issues the final answer. The **fallback** exists for availability continuity only and can never independently issue a role's final high-impact recommendation — generalizing the rule `DEC-20260715-14` already established for the Architect tier to every role that adopts a fallback tier. Retries are bounded (no more than two per deployment before stepping to the next tier), and each retry is logged with its reason. Tier-stepping on provider or model failure never crosses a data-class boundary to preserve availability — a class-compliant fallback is used, or the role goes offline visibly. Malformed structured output receives exactly one corrective re-ask before the execution fails, preserving the malformed payload for audit. Context overflow fails explicitly rather than silently truncating governance-relevant input. A privacy-policy conflict (per `DEC-20260716-01`) always overrides availability, cost, and quality considerations and fails closed. A budget-policy conflict may degrade to a cheaper compliant binding within the same data class, or halt and escalate — it may never force a class crossing. Exhausting a role's approved tier takes that role visibly offline in its audit record and to the Founder, rather than substituting an unapproved model. Final-answer authority belongs to the role, exercised through its primary (or secondary where the role's own policy delegates depth) — never through an advisor, a fallback, or a temporary task assignment beyond its bounded work item.
6. **Cross-provider review principle.** Once the `independent-reviewer` role is bound, its primary provider must differ from the `builder` role's primary provider — adopted now, as a standing constraint on future binding decisions, rather than left to be discovered after a same-provider binding has already been made.
7. **Architect tier correction (narrow amendment, naming only).** `DEC-20260715-14`'s secondary binding is corrected from the model identifier `deepseek-v4-pro-thinking` to the model identifier `deepseek-v4-pro` operated in `mode: thinking`, matching the actual DeepSeek V4 Pro API, which exposes one model with thinking toggled by request parameter rather than two distinct models. The fallback binding (`deepseek-v4-pro`, `mode: standard`) is unaffected. This amendment changes naming only: the tier's four binding classes, the models and providers they resolve to, the routing intent (primary owns the final recommendation; secondary challenges; advisor validates current information; fallback cannot issue the final high-impact recommendation), and `DEC-20260715-14`'s own file are otherwise unchanged and are not reopened. `DEC-20260715-14` remains `active` and is not superseded; this item is recorded as an amendment to its naming, executed in `/04-agents/model-registry.md` and `/04-agents/role-registry.md`, not in `DEC-20260715-14`'s own file.
8. **`hermes` capability ownership.** The frozen `hermes` Telegram capability, previously unowned in `/04-agents/role-registry.md`, is assigned to the `researcher` role, reflecting the capability's local research/summarization shape and closing the gap that would otherwise leave this capability unroutable once fail-closed role routing activates. This assignment does not change the capability's ID, its runtime behavior, or the `hermes-4-14b` model's `unassigned` permanent-binding status.
9. **Chief of Staff — recorded as proposed, not approved.** A proposed primary binding for `chief-of-staff` — model `sonnet-5`, mode `standard`, provider `anthropic` — is recorded in `/04-agents/role-registry.md` at `proposed-binding` status, reflecting that Sonnet 5 is the evident vehicle behind the runtime's `ANTHROPIC_COS_MODEL` routing path. This is not a ratified permanent binding. Promotion to `approved-binding` requires a future decision supported by at least 30 days of routing-accuracy evidence gathered after the G2 activation package lands.
10. **Deputy Chief of Staff — unchanged.** `DEC-20260714-01` remains `proposed`; GLM-5.2 remains a `proposed-binding`, not approved; nothing in this decision promotes it. Ratification requires the pending live smoke test to pass and a deployment-channel decision (per `DEC-20260716-01`'s provider classes) before a future decision may approve it.
11. **Explicit rejections and deferrals.** No China-domiciled official provider API may serve internal-or-above work (per `DEC-20260716-01`). Claude Fable 5 may not serve restricted-class work (per `DEC-20260716-01`). LiteLLM evaluation is deferred to the role-routing implementation phase; it may, if later adopted, own provider-protocol normalization, deployment resolution, retry mechanics, budget enforcement, and telemetry — it may never own role identity, binding approval, privacy classification, routing-policy intent, or final-answer authority. LangGraph remains under active deferral per `DEC-20260715-05`, untouched and not superseded by this decision. Google ADK is not evaluated by this decision.
12. **Fourteen roles remain intentionally unassigned.** `strategist`, `builder`, `researcher`, `experience-architect`, `independent-reviewer`, `product-lead`, `brand-lead`, `marketing-lead`, `operations-lead`, `finance-lead`, `legal-risk`, `qa-lead`, `pre-mortem-reviewer`, and `founder-mirror` receive no binding of any status by this decision. Unassigned routes fail closed by design; naming permanent candidates for roles without real work volume would manufacture doctrine rather than record evidence.
13. **Activation is deferred.** This decision's own status is `approved`, not `active`. It does not become active until a future routing implementation phase actually wires role routing to it, itself gated behind the G2 activation package `DEC-20260715-16`/`DEC-20260715-17` already require.
14. **Temporary Task-Assignment Policy — explicit ratification and activation exception.** `04-agents/temporary-task-assignment-policy.md` is ratified in full: Founder-only authorization (no role, model, or operator may self-assign); the bounded-work-item requirement with its 14-day calendar ceiling as a backstop; the durable authorization fields (`authorized_by`, `authorized_at`, `authorization_reference`) and lifecycle fields (`assignment_id`, `created_at`, `expires_at`, `completed_at`, `revoked_at`, `review_triggered_at`, `review_completed_at`) that make the policy's rules independently verifiable from the record; `permanent_binding_effect: none` on every assignment; and the rule that a third same-model/same-role assignment within 60 days triggers a mandatory evaluation review whose output is a candidacy assessment only — repetition is never authority to promote, and no assignment converts to a permanent binding by usage alone. This decision authorizes the policy's immediate effectiveness upon this package's merge to `main` — the sole activation exception within Package MP-1. This exception governs temporary-assignment conduct only: it does not activate role routing, any permanent model binding, the broader model portfolio described in `/00-system/model-portfolio-and-routing-strategy.md`, the data-boundary routing policy in `DEC-20260716-01`, or the G2 activation package, all of which remain `approved`, not `active`, exactly as items 1–13 above establish.

## Owner
Founder (ruling). Claude Code (drafting, recording, and the model/role registry corrections this decision authorizes).

## Status
approved — the portfolio architecture, classification ladder, diversification and replacement policies, routing/failure policy, the Architect-tier naming correction, the `hermes` ownership assignment, the Chief-of-Staff proposed-binding recording, and the explicit ratification of the temporary-task-assignment policy (item 14) above are approved as of this decision. `migration_status: foundation-established`. `activation_status: pending`. This decision's own status does not become `active` until a routing implementation actually enforces its routing/failure policy. The single exception is item 14: it authorizes `04-agents/temporary-task-assignment-policy.md` to carry `status: active` immediately upon this package's merge — the sole activation exception in Package MP-1. That exception governs temporary-assignment conduct only; it does not activate role routing, any permanent binding, the broader model portfolio, the data-boundary routing policy, or G2. This decision does **not** approve GLM-5.2 as a permanent Deputy binding, does **not** promote the Chief of Staff proposed binding to approved, and does **not** supersede `DEC-20260715-14`, `DEC-20260714-01`, or `DEC-20260715-05`.

## Rationale
An evidentiary standard that requires a drafted-and-ratified decision for every promotion — rather than allowing runtime usage alone to accumulate into permanence — is the same discipline `DEC-20260715-17` already applied to the roster; this decision applies it to bindings. Correcting the Architect tier's secondary identifier now, while it is still narrowly scoped and well-understood, is cheaper and lower-risk than discovering the mismatch during a future routing implementation attempt. Assigning `hermes` to `researcher` now closes a fail-closed gap before it can silently disable a capability at G2 activation, rather than after. Item 14 closes a separate gap: `04-agents/temporary-task-assignment-policy.md` cited this decision as its ratifying authority, and cited its own `status: active` as an explicit, deliberate exception, but this decision had not previously named that ratification or that exception as one of its own items — leaving the policy's authority implicit rather than stated. Naming it explicitly, with its scope bounded to temporary-assignment conduct alone, closes that gap without reopening or expanding anything else this decision approves.

## Alternatives Considered
- **Ratifying permanent bindings for Chief of Staff and Deputy Chief of Staff now, given their live runtime usage:** rejected — the Deputy's smoke test has not run and the evidentiary bar this decision sets (item 2) is not met by implementation-observed usage alone; recording both as proposed preserves the evidence honestly without ratifying under-tested paths.
- **Reopening the Architect tier's model *preferences* while correcting its naming:** rejected — the Founder's review explicitly evaluated the tier for internal consistency and naming accuracy only, not for reconsideration of which models serve which tier position; item 7 is scoped to naming alone.
- **Leaving `hermes` unowned pending a future package:** rejected — the gap is a concrete fail-closed defect discoverable today with no new evidence required; deferring a one-line ownership assignment serves no governance purpose.
- **Naming evaluation candidates for every unassigned role:** rejected — candidates are recorded in `/00-system/model-portfolio-and-routing-strategy.md` only for roles with actual runtime shape (builder, researcher, strategist, independent-reviewer, founder-mirror); the remaining roles have no work volume to evaluate against.

## Risks
- The Architect-tier naming correction (item 7) touches an active decision's practical implementation surface (the model and role registries) without editing `DEC-20260715-14`'s own file; a future reader must consult both this decision and `DEC-20260715-14` to see the complete picture — mitigated by the explicit cross-reference in both directions.
- Recording Chief of Staff as `proposed-binding` risks being mistaken for approval if read out of context; the registry entry and this decision both state its status and promotion requirement explicitly.
- The `hermes` → `researcher` assignment is a shape-fit judgment, not a usage-evidence judgment; if a future package finds a better-fitting owner, this assignment is a normal decision-log change, not a reopening of the roster.
- Nothing in this decision enforces anything yet — it is doctrine a future routing implementation must consult, exactly as `DEC-20260716-01` is.
- Item 14 is this decision's only activation exception; a future reader skimming only the Status header could mistake the whole decision for active. The Status section, item 14 itself, and `04-agents/temporary-task-assignment-policy.md`'s own header all state the exception's exact and narrow scope to guard against that misreading.

## Drift Risk
low

## Decision Health
green

## Next Action
A future routing-implementation phase (post-G2, alongside or within G3's runtime work) wires role routing to this decision's policy and to `DEC-20260716-01`'s data-boundary matrix. The Deputy's pending smoke test and channel decision precede any future ratification of `DEC-20260714-01`. Thirty days of post-G2 routing-accuracy evidence precede any future ratification of the Chief of Staff proposed binding. LiteLLM evaluation, if pursued, occurs no earlier than that same routing-implementation phase.

## Review Date
2026-08-16

## Related Files
`/00-system/model-portfolio-and-routing-strategy.md`, `/00-system/data-boundary-policy.md`, `/04-agents/temporary-task-assignment-policy.md`, `/04-agents/model-registry.md`, `/04-agents/role-registry.md`, `/07-decisions/DEC-20260716-01-data-boundary-policy.md`

## Related Workflows
None yet — a routing-implementation workflow is future work.

## Related Handoffs
None yet.

## Notes
This decision's identifier, `DEC-20260716-02`, was allocated after a full five-source search (working tree, repository history, all fetched local and remote refs, `decision-log.md`, `decision-id-reservations.md`) confirmed no branch, historical commit, or reservation claims it or any `DEC-20260716-*` identifier, alongside `DEC-20260716-01` in the same search session. It is the next available identifier after `DEC-20260716-01`, dated to this decision's own creation date per decision-rules §2.


---

## Amendment under DEC-20260807-01 — effective

Ratified 2026-08-07 by `DEC-20260807-01`. This decision's own status remains
approved-not-active; MP-1 routing enforcement remains inactive, and item 14's
Temporary Task-Assignment Policy remains globally controlling — ratification
authorizes the routing schedule and implementation package below, not MP-1
activation.

### Work-size routing schedule

Work size and review tier are separate axes. A light task may still trigger
Tier-2; a large task does not gain new authority from its size.

| Work size / surface | Governed Builder route | Boundary |
|---|---|---|
| large | `grok-build` / `grok-4.5` primary | every execution requires an exact, auditable, task-scoped Founder authorization (including pilot tasks) — no standing authority regardless of data class; that authorization permits public-class data immediately; internal/private data requires the same authorization plus explicit disclosure until xAI channel verification is recorded; otherwise use the fallback |
| large fallback | `claude-code` / `sonnet-5` | used only when the Grok data boundary cannot be satisfied |
| medium | `claude-code` / `opus-4.7` | active data-boundary policy and task scope |
| light | `claude-code` / `claude-haiku-4-5` | registered ID only; no shorthand duplicate |
| Codex complex/high-risk | `codex` / `gpt-5.6-sol` | record exact effort; `max` requires exact Founder authorization and reason |
| Codex routine/bounded | `codex` / `gpt-5.6-terra` | not eligible for Tier-2 |
| Hermes local coding | `hermes-local-code` / `deepseek-v4-flash` | `builder` only; local boundary; registered Founder-approved replacements only |

### Surface-specific allowlists

- `cursor`: manual `grok-4.5` primary, `sonnet-5` alternative, and
  `glm-5.2` secondary. Cursor Auto and silent switching are prohibited.
  `glm-5.2` is limited to public and ordinary-internal data through the
  existing P3/Z.ai approval; governance/doctrine, confidential-or-higher,
  secrets, credentials, personal data, and production data are prohibited.
  This does not replace or broaden its Deputy runtime binding.
- `antigravity`: the Founder may manually select a registered Gemini model
  for an exact task. The model and effort are recorded. Auto and silent
  switching are prohibited. `gemini-3.6-flash` is the primary supplemental
  fast reviewer and `gemini-3.5-flash` the fallback; both are non-binding.
  Only `gemini-3.1-pro` retains Gemini binding Tier-2 eligibility.
- `grok-build`: `grok-4.5` remains the large-work primary Builder in name —
  the unverified xAI channel does not nullify that designation, it constrains
  where and when the route may actually execute. Every execution, public or
  internal, requires an exact task-scoped Founder authorization naming
  repository, data class, scope, and expiration/completion boundary — no
  standing routing authority exists until MP-1 activation. That authorization
  may permit public-class data immediately; internal or private-repository
  data requires the same authorization plus explicit disclosure until channel
  verification is recorded. Secrets, credentials, production data, personal
  data, and confidential-or-higher material remain excluded unless separately
  and exactly Founder-authorized.

No unavailable or out-of-boundary model, provider, surface, or effort may be
silently substituted. The task uses an already authorized fallback or pauses.

### Activation and temporary-policy disposition

Ratification authorizes implementation and the controlled pilot; it does not
activate MP-1. The only permitted activation ladder is:

```text
MP-1 approved but inactive
→ enforcement implementation
→ controlled multi-surface Builder pilot
→ required verification and Neon evidence
→ exact-SHA independent Tier-2 review
→ explicit Founder activation ruling
→ MP-1 active
```

The later Founder ruling must identify the exact reviewed implementation SHA,
activate MP-1, and retire item 14's Temporary Task-Assignment Policy at the
same effective moment. There is no dual-governance window. A failed pilot
leaves MP-1 inactive and the temporary policy controlling. After activation,
a routing-control outage fails closed; it does not silently reactivate the
temporary policy. The Founder may issue a task-specific assignment through
the canonical approval machinery.
