---
title: "DEC-20260720-02 — Architect Tier Fallback: Azure AI Foundry Access Channel (US Data Zone)"
type: decision
owner: founder
company: mad-ventures
product: founder-os
status: active
created: 2026-07-20
updated: 2026-07-20
version: 1.1
review_cycle: on-change
source_of_truth: true
related_decisions:
  - DEC-20260715-14-technical-architect-agent-tier
  - DEC-20260716-01-data-boundary-policy
  - DEC-20260716-02-model-portfolio-and-routing-strategy
  - DEC-20260720-01-fallback-configuration-audit
related_workflows: [WF-11]
used_by:
  - founder
  - builder
read_by: [all-active-roles]
written_by:
  - builder
tags:
  - decision
  - architecture
  - model-routing
  - data-boundary
  - founder-os-telegram
  - azure
  - deepseek
  - fallback
---

# DEC-20260720-02: Architect Tier Fallback — Azure AI Foundry Access Channel (US Data Zone)

## Purpose
Resolves the `deployment_channel: undecided` field recorded against `deepseek-v4-pro` in `/04-agents/model-registry.md` (deferred there per `DEC-20260716-02`) for the Technical Architect tier's **fallback** binding (`DEC-20260715-14` item 5) specifically: authorizes routing that binding through Azure AI Foundry, Data Zone: United States, instead of DeepSeek's own official API. This is the scoped, separately-tracked decision that `DEC-20260720-01` item 3 required before any fallback-wiring implementation in `founder-os-telegram`, and it closes the open question tracked by `HO-20260720-01`.

## Context

### What this decision is not
A builder-drafted task description for this work cited `/00-system/model-portfolio-and-routing-strategy.md` §8 as the compliance rule requiring this channel change. On verification, **§8 contains no such rule** — it is a generic evaluation-candidate/watchlist table naming no DeepSeek- or Azure-specific compliance concern. That citation was false and is not relied on anywhere in this decision. §7 of the same file is real but is a naming correction to the *secondary* binding's `model_id` (`DEC-20260716-02` item 7) — it does not authorize any channel change either. This decision replaces that citation with the actual, verified rationale below.

### The actual rationale
`/00-system/data-boundary-policy.md` already anticipates exactly this question:

- §2 (Provider classes) lists **P2 — US-domiciled open-weight hosting under US terms of service** with the named membership example **"Azure AI Foundry (DeepSeek V4 Flash/Pro)."** The same table lists **P4 — China-domiciled official provider APIs** with the named membership example **`api.deepseek.com`** — DeepSeek's own official API.
- §4 (class-to-provider matrix), **internal** row: permitted provider classes are P1, P2, P5 (P3 only with standing Founder approval); explicitly "never route to P4."
- §5 item 3: **"No P4 provider may serve internal-or-above work; P4 is public-class only. Model weights available under open licenses (e.g., DeepSeek V4, GLM-5.2) remain usable above public class only through a P1/P2/P5 channel."**

Architect-tier work (ADRs, architecture artifacts, technical decision support) is internal-class by default classification (`data-boundary-policy.md` §5 item 1: unclassified work defaults to internal). DeepSeek's own official API is P4 — public-class only — and therefore cannot lawfully serve this internal-class work under the Founder's own approved data-boundary policy. Azure AI Foundry hosting the same DeepSeek V4 Pro weights is P2, and is explicitly named in the policy as the compliant channel for exactly this model.

`/04-agents/model-registry.md`'s own `deepseek-v4-pro` entry already carries this unresolved tension in its `deployment_channel` field: `undecided # Founder channel decision deferred per DEC-20260716-02 — official API is P4 (public-class only per data-boundary-policy.md); Azure AI Foundry / Bedrock are P2 alternatives`. This decision is that deferred Founder channel decision.

### Prior governance this decision does not reopen or change
- `DEC-20260715-14` item 5 — the fallback's role and authority boundary: it generates ADRs and routine artifacts and **cannot make the final architecture decision**. Unchanged.
- `DEC-20260715-14`'s Increment 1 posture and `DEC-20260720-01`'s audit — the fallback is currently unwired (fail-closed, no real transport) in `founder-os-telegram`'s `core/adapter-registry.ts`. This decision authorizes wiring it; it does not itself wire it.
- `ARCHITECTURE_FALLBACK_ENABLED` — the runtime kill switch gating the whole fallback tier, default off. This decision does not change that default.
- The secondary binding (`DEC-20260715-14` item 3, thinking mode) — its own implementation remains a separate deferred increment, not authorized by this decision. (Note: the same `deepseek-v4-pro` model entry's `deployment_channel` field is shared across bindings for this model_id, so this decision's channel resolution will also apply if/when the secondary binding is separately implemented — but that implementation itself still requires its own authorization.)

### Mode discrepancy noted and corrected
The originating task description referred to "the Architect tier's fallback model (DeepSeek-V4-Pro, mode: thinking)." Per `DEC-20260715-14` item 5, the **fallback** binding runs in **standard mode**; **thinking mode belongs to the secondary binding** (item 3), which is a different, still-unimplemented binding. This decision authorizes the channel change for the fallback binding in **standard mode**, consistent with `DEC-20260715-14`. It does not authorize or address the secondary binding's implementation.

## Decision

1. **Access channel resolved.** The Technical Architect tier's fallback binding (`deepseek-v4-pro`, `mode: standard`, `DEC-20260715-14` item 5) is authorized to route through **Azure AI Foundry**, using a **Data Zone: United States** deployment (or an explicit US-regional deployment if Data Zone US is unavailable for this model at implementation time), instead of DeepSeek's own official API (`api.deepseek.com`, provider class P4).
2. **Rationale is the data-boundary policy, not §8.** The compliance basis is `data-boundary-policy.md` §2/§4/§5(3) (P4 is public-class only; Architect-tier work is internal-class; Azure AI Foundry is the named P2 alternative for this model) — not `model-portfolio-and-routing-strategy.md` §8, which this decision confirms does not address this question.
3. **Role boundary unchanged.** The fallback remains an operational/cost model per `DEC-20260715-14` item 5 and `model-portfolio-and-routing-strategy.md` §6/§7: it cannot independently issue the tier's final architecture recommendation, regardless of access channel. This decision changes only how the model is reached, not what it is authorized to decide.
4. **Kill switch unchanged.** `ARCHITECTURE_FALLBACK_ENABLED` remains the gating switch for the entire fallback tier and remains default-off. This decision does not enable the fallback by default; it only authorizes what transport may be wired behind that switch once explicitly enabled.
5. **Implementation authorized, gated.** `founder-os-telegram` (`builder`, via its coding execution surface) is authorized to implement an Azure AI Foundry client for `deepseek-v4-pro` (standard mode) and wire it into the existing `resolveArchitectureFallback()` seam in `core/adapter-registry.ts`, replacing the current fail-closed transport for this binding only — **conditioned on verifying, against Azure's own current documentation at implementation time, that the exact deployment configuration (model availability, Data Zone: United States support, deployment name/SKU) is real and currently valid.** If Azure's actual current DeepSeek V4 Pro availability, pricing, or Data Zone configuration does not match what was verified when this decision was drafted, implementation must stop and report the discrepancy rather than proceed on assumption.
6. **Registry update on ratification.** Once ratified (`status` → `active`), `/04-agents/model-registry.md`'s `deepseek-v4-pro` entry `deployment_channel` field is updated from `undecided` to reflect this decision (`azure-ai-foundry`, Data Zone: United States), citing this decision ID, in the same activation commit.
7. **`HO-20260720-01` updated on ratification.** The open handoff is updated to reference this decision as the scoped work order and decision it required, rather than closed outright — the handoff's acceptance criteria (no wiring without a separate ratified decision; boundary and kill-switch preservation) are satisfied by this record once active, but the handoff itself continues tracking the implementation until it lands.

## Owner
Founder (ratification authority). `builder` drafted this record and will carry the implementation once ratified, per `HO-20260720-01`.

## Status
`active` — ratified by the Founder on 2026-07-20. Drafted `proposed` by
`builder` on `claude/azure-deepseek-fallback-routing-jufy5r`, then activated
(`status` → `active`) in the same commit per the standard draft-then-activate
pattern (see `DEC-20260720-01`). Implementation of Decision item 5 proceeds
in `founder-os-telegram` under this authorization; it is not itself executed
by this doctrine commit.

## Rationale
- The false `§8` citation in the originating task description would have caused this channel change to be attributed to a compliance rule that does not exist, which is exactly the false-attribution/governance-honesty failure mode `/01-constitution/agent-rules.md` and `DEC-20260718-04` treat seriously. Citing the real rule (`data-boundary-policy.md`) instead keeps the decision record honest and independently checkable.
- `data-boundary-policy.md` already named Azure AI Foundry as the compliant channel for this exact model before this decision existed (in the model registry's own deferred-channel note) — this decision exercises that already-anticipated choice rather than inventing new policy.
- Keeping the role-boundary and kill-switch clauses explicit in this decision (items 3–4) prevents a channel-only decision from being read, later, as having quietly expanded the fallback's authority.

## Alternatives Considered
- **Route through DeepSeek's own official API (status quo intent, minus compliance):** rejected — P4, public-class only, cannot lawfully serve internal-class Architect-tier work per `data-boundary-policy.md` §5 item 3.
- **Amazon Bedrock (also P2 per data-boundary-policy.md §2):** not selected here because the originating request specified Azure AI Foundry and no Bedrock DeepSeek V4 Pro availability was verified for this decision; Bedrock remains a viable future P2 alternative if Azure's offering changes.
- **Fold this into `DEC-20260715-14` as an amendment:** considered and rejected — `DEC-20260715-14` establishes the fallback's *role and authority boundary*, which is unchanged here; conflating a channel/compliance decision into that record would blur two independent questions (what the fallback is allowed to decide, vs. how it is reached) and `DEC-20260720-01` item 3 already anticipated this as its own separate, scoped decision.
- **Amend `model-portfolio-and-routing-strategy.md` §8 directly instead of a decision record:** rejected — that file is an approved-not-active foundation artifact whose `Update Cadence` requires a decision to change any promotion/routing content; a decision record is the correct instrument, and the foundation file will only ever cite this decision, not originate the rule.

## Risks
- **Deployment-config drift:** Azure AI Foundry's model catalog, Data Zone availability, and deployment naming can change between this decision's drafting and implementation. Item 5 requires re-verification against Azure's current documentation at implementation time, not reliance on this document as a standing source of truth for that detail.
- **Scope creep risk:** because `deepseek-v4-pro`'s `deployment_channel` field is shared across the secondary and fallback bindings in the model registry, resolving it here could be misread as authorizing the secondary binding's implementation. It does not; §Context above and Decision item 5 scope implementation authorization to the fallback binding only.
- **Kill-switch default drift:** any future PR touching this area must not flip `ARCHITECTURE_FALLBACK_ENABLED`'s default. Item 4 exists to make that an explicit, checkable constraint on the implementing PR.

## Next Action
Ratification and activation are complete (Decision items 6–7 executed: the
`/04-agents/model-registry.md` `deployment_channel` update and the
`/09-handoffs/HO-20260720-01-architect-fallback-wiring.md` update both landed
in the activation commit). Remaining:
1. The `founder-os-telegram` implementation described in Decision item 5 has
   been carried out on branch `claude/azure-deepseek-fallback-routing-jufy5r`
   (PR #36) — an Azure AI Foundry client wired into the fallback transport
   seam, subject to the Azure-documentation re-verification gate and the
   boundary/kill-switch constraints above. `HO-20260720-01` carries the
   verified deployment-configuration evidence.
2. This doctrine record's own activation is tracked in `FounderOS` PR #41.
3. No merge to `main` of either repository without separate Founder
   authorization naming the audited head SHA, per standing practice
   (`DEC-20260718-04`).

## Review Date
2026-08-20
