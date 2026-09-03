---
title: DEC-20260815-05 — Build Room Reviewer Eligibility Roster
type: decision
owner: founder
company: mad-ventures
product: mad-ventures-os
status: active
created: 2026-08-15
updated: 2026-08-15
version: 0.2
review_cycle: monthly
source_of_truth: true
related_decisions:
  - DEC-20260719-02-independent-reviewer-two-tier-binding
  - DEC-20260814-02-tier2-shape-check-gate
  - DEC-20260814-03-governance-change-freeze
related_workflows: [WF-04, WF-13]
used_by: [builder, independent-reviewer]
read_by: [all-active-roles]
written_by: [builder]
tags: [decision, build-room, wf-04, reviewer, roster]
---

# DEC-20260815-05: Build Room Reviewer Eligibility Roster

> **Ratified `active` by the Founder 2026-08-15 — WF-04 Step 2 candidate C-5.**
> The canonical identifier `DEC-20260815-05` was allocated 2026-08-15 after the
> mandatory five-source search (decision-rules §13) — zero prior uses across
> all five sources. The Founder's verbatim ratification is recorded below in
> `## Founder Authorization (2026-08-15)`. This decision authorizes exactly
> what its own text states, and nothing beyond it.

## Purpose

Decide which models may hold the `independent-reviewer` role for Build Room
reviews, extending the Tier-2 closed roster of `DEC-20260719-02` to the
Build Room scope.

## Context

- PRD row 13 requires the reviewing model to differ from the implementation
  model. The architecture (§3.11) requires independence checked at assignment
  **and** re-checked at review-open, and a read-only, credential-free,
  push-incapable reviewer workspace.
- `DEC-20260719-02` establishes the two-tier reviewer doctrine: Tier-1
  CodeRabbit on all three repos; Tier-2 a closed model roster. The current
  Tier-2 roster (per `DEC-20260814-02` and the freeze record) is:
  `gemini-3.1-pro`, `chatgpt-5.6-sol/terra/luna`, `grok-4.5`.
- The Fable package (v1.0) flags this as FD-7: "Reviewer eligibility roster:
  which provider connections may hold the Reviewer role (extends
  DEC-20260719-02 Tier-2 closed roster to Build Room reviews)."
- The architecture reconciliation classifies reviewer eligibility as
  `deferred to WF-04 Step 2` (F-48): "Row 13 requires model independence;
  **which** models are eligible is a binding decision no architect may make."

## Decision

**Founder ruling (2026-08-15): roster confirmed.** Ratified by the Founder
2026-08-15. Operative:

1. **Extend** the Tier-2 closed roster of `DEC-20260719-02` to Build Room
   reviews. The Founder confirmed the existing roster applies unchanged:
   `gemini-3.1-pro`, `chatgpt-5.6-sol/terra/luna`, `grok-4.5` — with the
   Build Room-specific constraint that the reviewing model must differ from
   the implementation model of the same run (PRD row 13) — enforced at
   assignment and re-checked at review-open.
2. **No model is bound by this decision.** The roster is eligibility; actual
   binding per run is a separate Founder act (model-assignment governance).
3. **The reviewer workspace** is read-only, credential-free, and
   push-incapable by construction (architecture §3.11), attested by the
   Gateway before review opens.

## Owner

`founder` (roster is a binding decision).

## Founder Authorization (2026-08-15)

Given by the Founder and recorded verbatim, unmodified:

> I, Michael Daley ratify DEC-20260815-01 through DEC-20260815-18. I have reviewed the proposed text at main@85b8179. This ratification activates the decisions as written; it authorizes nothing beyond the decisions' own text.

Hermes recorded this authorization and executed the recording acts it covers.
Hermes did not author, back-fill, imply, or simulate any part of it
(`DEC-20260718-04`).

## Status

active — authorized by the Founder 2026-08-15 (see *Founder Authorization* above).

## Rationale

PRD row 13 requires model independence; the roster is the mechanism that
makes independence checkable. Reusing the existing Tier-2 roster avoids a
second, divergent roster and keeps one closed set of eligible reviewers
across FounderOS and the Build Room. The Build Room-specific constraint
(model ≠ implementation model per run) is the row-13 requirement made
operational.

## Alternatives Considered

- **A separate Build Room-only roster** — rejected: two rosters drift and
  complicate independence checks; one closed roster with a per-run
  constraint is simpler and stricter.
- **No roster (any model may review)** — rejected: row 13's independence
  requirement is uncheckable without a closed set.

## Risks

- Roster changes are frozen during the freeze window (`DEC-20260814-03`
  clause 2: role activations/roster changes frozen). This decision extends
  the roster's *scope* to Build Room reviews; it does not add members. If the
  Founder wants to add a model, that is a separate, freeze-gated act.
- The freeze's clause-4 exception test applies if this is read as a roster
  change; the record names the ship: **Build Room v1 slice**.

## Drift Risk

medium

## Decision Health

green

## Next Action

The Build Room review-assignment logic must enforce the roster together with
the per-run independence constraint. No such logic exists yet; this states the
requirement it is built to, not a state already reached.

## Review Date

2026-09-15

## Related Files

- `/07-decisions/DEC-20260719-02-independent-reviewer-two-tier-binding.md`
- `/07-decisions/DEC-20260814-02-tier2-shape-check-gate.md`
- `/03-products/mad-ventures-os/technical-architecture.md` (§3.11)
- `/03-products/mad-ventures-os/prd/build-room.md` (row 13)

## Related Workflows

- WF-04 — PRD to Build
- WF-13 — Code Review

## Related Handoffs

- None at proposal time.

## Notes

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
