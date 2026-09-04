---
title: DEC-20260815-04 — Build Room Provider Selection and Ordering
type: decision
owner: founder
company: mad-ventures
product: mad-ventures-os
status: active
created: 2026-08-15
updated: 2026-08-21
version: 0.3
review_cycle: monthly
source_of_truth: true
related_decisions:
  - DEC-20260716-01-data-boundary-policy
  - DEC-20260807-01-g3-slice-b-plus-coding-execution-surface-governance
  - DEC-20260719-02-independent-reviewer-two-tier-binding
related_workflows: [WF-04]
used_by: [builder, architect]
read_by: [all-active-roles]
written_by: [builder]
tags: [decision, build-room, wf-04, providers]
---

# DEC-20260815-04: Build Room Provider Selection and Ordering

> **Ratified `active` by the Founder 2026-08-15 — WF-04 Step 2 candidate C-4.**
> The canonical identifier `DEC-20260815-04` was allocated 2026-08-15 after the
> mandatory five-source search (decision-rules §13) — zero prior uses across
> all five sources. The Founder's verbatim ratification is recorded below in
> `## Founder Naming Act (2026-08-21)

Clause 1 reserved the exact providers to the Founder. The Founder named them
on 2026-08-21. **This discharges clause 1 only** — it is an eligibility and
ordering act, not a binding, and clause 4 is untouched.

### Named eligible — five providers

| Provider | Surface | Roles the surface permits | Recorded condition |
|---|---|---|---|
| **Anthropic (Claude)** | `claude-code` | `builder`, `architect`, `strategist`, `independent-reviewer` | Retained by `DEC-20260807-01` §3.2 |
| **OpenAI (Codex)** | `codex` | `builder`, `architect`, `strategist`, `independent-reviewer` | — |
| **Google (Gemini)** | `antigravity` | `builder`, `architect`, `independent-reviewer` | Registered by `DEC-20260807-01` §3.1 |
| **xAI (Grok)** | `grok-build` | `builder`, `independent-reviewer` | **Two conditions, see below** |
| **Hermes (local)** | `hermes-local-code` | **`builder` only** | **Two conditions, see below** |

### Ordering — clause 2

**First adapter: `claude-code`.** It proves the abstraction. The remaining four
are **not sequenced by this act**; each is a separate enablement act under
clause 2, in whatever order the phase gates and the Founder allow.

### Conditions carried by two of the five

Recorded because they are live constraints from the surface registry and the
data-boundary policy, not new rules created here:

**`grok-build` / `grok-4.5`**

- **Public-class only by default.** The `grok-4.5` roster entry carries a
  data-boundary condition: while its `deployment_channel` is unverified,
  internal-class content requires explicit auditable Founder authorization per
  `DEC-20260716-01` clause 6.
- **xAI first-party API terms are not verified** in
  `/04-agents/subscription-vs-api-inventory.md`, which states that a decision
  relying on them must independently verify via `docs.x.ai` at that time. The
  path in active use is the `grok-build` CLI/agent session, not a verified
  first-party API channel.
- Note the surface/model distinction the registry stresses: `grok-build` is
  **not** a Tier-2 `independent-reviewer` roster member — the roster lists
  models. `grok-4.5` **is** on the Tier-2 full roster (`DEC-20260719-02`,
  added 2026-07-26), so a Grok 4.5 Tier-2 review discharges the role while
  `grok-build` remains only the surface it runs on.

**`hermes-local-code`**

- **`builder` only.** The registry permits no other role, and excludes
  `researcher` deliberately.
- **May not issue a sole binding Tier-2 verdict**, and may not self-review,
  merge, deploy, or operate in production — `prohibited_actions`, ratified
  2026-08-07. External transmission is denied by default.
- Its `provider_context` is `founder-operated-local` (P5). That is the one
  named provider whose channel class can carry data above public-class without
  a cloud-custody question.

### Coverage the five actually give

Stated so a later role-binding act works from fact rather than assumption:

| Role | Surfaces that permit it |
|---|---|
| `builder` | all five |
| `independent-reviewer` | `claude-code`, `codex`, `antigravity`, `grok-build` |
| `architect` | `claude-code`, `codex`, `antigravity` |
| `strategist` | `claude-code`, `codex` |

PRD row 13 requires the reviewing **model** to differ from the implementation
**model** — not the surface. With five named providers that is satisfiable
many ways, and remains a per-run property to be asserted, not a property this
naming act establishes.

### What this act does not do

It binds no provider to a role, sequences no adapter beyond the first,
authorizes no connection, provisions no credential, incurs no spend, and
changes no registry. Clause 3's authorization step remains a Founder act on
the Gateway host, and the Gateway has never been enrolled.

## Founder Authorization (2026-08-15)`. This decision authorizes exactly
> what its own text states, and nothing beyond it.

## Purpose

Decide which providers the Build Room supports, in what order, and through
which authorization method.

## Context

- PRD row 2 requires connection flows that use each provider's own
  documented authorization method; Scope §In requires that connection grant
  no authority; Scope §Out excludes unsupported third-party OAuth work.
- The architecture (§3.7) requires a shape-only provider abstraction: a
  connection is a record that a provider-native authorization was completed
  on the Gateway host; the core holds no provider-specific logic; a
  connection has exactly five states (connected, expired, unavailable,
  suspended, unauthorized).
- The Fable package (v1.0) proposes six providers (Claude, Codex, Gemini,
  Grok, Cursor, Hermes) with three live adapters at MVP (claude-code, codex,
  one API-based adapter proving neutrality). The reconciliation classifies
  provider selection as `deferred to WF-04 Step 2` (F-62, F-91, F-96) and
  rejects the "three live adapters" MVP definition as restating approved
  scope (F-91).
- `DEC-20260716-01` (data-boundary policy) governs provider routing by data
  class, fail-closed. `DEC-20260807-01` registers the coding surfaces.

## Decision

Ratified by the Founder 2026-08-15. Operative:

1. **Select** the MVP provider set. The default proposal: the three providers
   the PRD's role set implies — one for planning, one for building, one for
   independent review — with the reviewer differing from the builder by
   model (row 13) and the exact providers named by the Founder. The Fable
   proposal (Claude/Codex/Gemini) is a candidate, not a default.
2. **Order** provider enablement by the phase gates of the roadmap (C-17):
   the first adapter proves the abstraction; each additional adapter is a
   separate enablement act.
3. **Authorization method** per provider: each provider's own documented
   method, run on the Gateway host by the Founder (architecture §3.7, PRD
   row 2). No cloud custody of subscription credentials (Scope §Out).
4. **No provider is bound by this decision.** Selection is eligibility and
   ordering; binding a provider to a role is a separate Founder act
   (model-assignment governance).

## Owner

`founder` (provider selection binds credential handling, capability
assumptions, and cost).

## Founder Authorization (2026-08-15)

Given by the Founder and recorded verbatim, unmodified:

> I, Michael Daley ratify DEC-20260815-01 through DEC-20260815-18. I have reviewed the proposed text at main@85b8179. This ratification activates the decisions as written; it authorizes nothing beyond the decisions' own text.

Hermes recorded this authorization and executed the recording acts it covers.
Hermes did not author, back-fill, imply, or simulate any part of it
(`DEC-20260718-04`).

## Status

active — authorized by the Founder 2026-08-15 (see *Founder Authorization* above).

## Rationale

The PRD's role set (architect/planner, builder, independent-reviewer) needs
at least three distinct execution capabilities; provider selection is a
binding decision that shapes credential handling, cost, and the adapter
contract. Ordering by phase gates keeps the abstraction provable before
additional providers are enabled.

## Alternatives Considered

- **All six providers at MVP** — rejected: violates the PRD's one-at-a-time
  scope and the F-91 rejection of "three live adapters" as an MVP definition.
- **No provider selection (defer entirely)** — rejected: the adapter
  contract and the first slice need at least one named provider to be
  testable.

## Risks

- Provider facts are time-sensitive (terms, rate limits, auth mechanics);
  the Fable package flags these as unverified (F-96). Each provider's facts
  must be re-verified at enablement time.
- Data-boundary routing (`DEC-20260716-01`) applies per provider; the
  routing matrix must be checked at enablement.

## Drift Risk

medium

## Decision Health

green

## Next Action

**The clause-1 naming act is discharged — see `## Founder Naming Act
(2026-08-21)`.** Five providers are named eligible and the first adapter is
`claude-code`. Adapter work for that first adapter is no longer blocked on
clause 1.

Still outstanding, and unchanged by the naming:

1. **Binding a provider to a role is a separate Founder act** (clause 4).
   Eligibility is not assignment; no provider is bound to `builder`,
   `architect`, `strategist`, or `independent-reviewer` by this decision.
2. **Each additional adapter is its own enablement act** (clause 2). Only the
   first is ordered; the remaining four are not sequenced here.
3. **Per-provider authorization** (clause 3) runs on the Gateway host, by the
   Founder, using each provider's own documented method. The Gateway is
   `implemented-not-activated` and has never been enrolled, so no provider
   connection can be completed until enrollment happens.

## Review Date

2026-09-15

## Related Files

- `/03-products/mad-ventures-os/technical-architecture.md` (§3.7)
- `/03-products/mad-ventures-os/prd/build-room.md` (rows 2, 5, 13)
- `/07-decisions/DEC-20260716-01-data-boundary-policy.md`

## Related Workflows

- WF-04 — PRD to Build

## Related Handoffs

- None at proposal time.

## Notes

**v0.3 (2026-08-21).** The clause-1 naming act, reserved to the Founder since
ratification, was performed: **five providers named eligible** — Anthropic
(`claude-code`), OpenAI (`codex`), Google (`antigravity`), xAI (`grok-build`),
and Hermes (`hermes-local-code`) — with **`claude-code` as the first adapter**
under clause 2. Recorded in `## Founder Naming Act (2026-08-21)` with each
surface's permitted roles, the two conditions carried by `grok-build`/`grok-4.5`
(public-class default pending `deployment_channel` verification; xAI
first-party API terms unverified in the subscription inventory) and the two
carried by `hermes-local-code` (`builder` only; no sole binding Tier-2
verdict), plus a role-coverage table so a later binding act reasons from the
registry rather than from assumption. Clause 4 is untouched — **no provider is
bound to any role** — and clauses 2 and 3 remain outstanding for the four
un-sequenced adapters and for per-provider authorization on the Gateway host,
which has never been enrolled. Next Action rewritten from "no provider is
named" to the three items that actually remain. `DEC-20260814-03` clause-3
exempt: this executes an existing decision's reserved clause and creates no
rule.

- Drafted 2026-08-15 under the Founder's WF-04 Step 2 drafting authorization,
  and ratified `active` by the Founder the same day. The identifier was
  allocated 2026-08-15 after the mandatory five-source search
  (decision-rules §13) — zero prior uses; a reservation row exists in
  `/07-decisions/decision-id-reservations.md`; and this decision file is on
  `main`. The earlier drafting-stage note said the opposite of all three and
  is superseded by this line.
- Provenance, kept distinct: the **ratification** was PR #251 (merge
  `f79dc5a`, 2026-08-15), which flipped `status: proposed` -> `active`. The
  **reconciliation of this file's draft-stage text** — banner, preamble, Next
  Action, cross-references, and this Notes entry — lands separately and is
  not part of that merge.
