# Seat Registry V1 — Implementation Plan, Revision 5 (Builder Handoff — Build Room)

**Status:** DRAFT r5 — derived from r4 (sha256 809632d7f54e23e3c6b59d4d29e8f50abd8b591e7b2523b3d114a8ab016d0a6f, at Build Room `abd69671cad67b496e9915da977277b2145d56e5`) by applying `r5worklist-v2.md` revision 3 (sha256 7971d738477e1b8c1de19846dfc7e36a6bb92b79c6b97468053870d962efa9de) row by row under **FOUNDER AUTHORIZATION — SEAT REGISTRY V1 R5 DRAFTING ONLY**, whose authority ends at this off-repository draft and its closure matrix. r4 was itself derived from the Founder's FINAL RULING "Seat Registry V1 Reserved Items", issued 2026-09-01 22:20 ET and posted as a comment on the r4 filing PR (identified exactly on the Controlling ruling line below). Nothing here is authorized to build. r5 is a planning draft; it is not a DEC, it confers no authority, it is not a complete-corpus bare PASS, and it is not implementation-ready until the later Founder acts and independent review that §11 names.
**Supersedes:** `seat-registry-v1-implementation-plan-r4.md` (sha256 809632d7f54e23e3c6b59d4d29e8f50abd8b591e7b2523b3d114a8ab016d0a6f, filed at Build Room `abd69671cad67b496e9915da977277b2145d56e5`), which in turn superseded `seat-registry-v1-implementation-plan-r3.md` (sha256 bbc71885f2db5f486ec750064c5ad346b5c03d3f48b30c3e920223eecdad7244). Neither r3 nor r4 is taken down or edited. r5 is drafted off-repository and is not filed by this draft.
**Controlling ruling:** posted at `https://github.com/MADVenturesLLC/founder-os-build-room/pull/15#issuecomment-5503747619`, 2026-09-02T03:11:07Z, comment-body sha256 f58b5257c8e58c6356d51296b34e3a13c880844243a8096974028f6dbf615425 (exact stored body, CRLF, 17,216 bytes). The same ruling's retained LF form is sha256 02be78850fadcbedf734632ae8266062c6d3ade478a84096a5d29170b671925a (16,966 bytes): one document in two line-ending encodings, equal only after CRLF→LF normalization and not byte-identical as posted. Section references of the form "ruling A", "ruling C-3" point into that text.
**Produced:** 2026-09-02 (r5 draft). **Doctrine pin:** every FounderOS registry and decision cited below was read at FounderOS `origin/main` `4ab38e7eccb5a6f488984877651f250121be26cc` — the full 40-character SHA, per runtime-contract-v2 §6's pinning rule (one commit SHA resolved at the first doctrine read and used for every later read). `e1d1c0e0a254841c3a68afd6413751399bc9dcd2` is the immutable Pass 3R recovery corpus only and is not this plan's doctrine pin. The ratified command-journal contract was read at Build Room `abd69671cad67b496e9915da977277b2145d56e5`.
**Target repository:** `MADVenturesLLC/founder-os-build-room` (local `~/MADVenturesOPs/founder-os-build-room`)
**Build Room identities — four, each with exactly one role and no other:**

| SHA | Role — and only this role |
|---|---|
| `ad23c6ea6117a54bce5be7208a5a5768ec5bfbc9` | the base still embedded in `DEC-20260815-17`'s own file text |
| `6ff0ee2893a22f59700f21ed825e8b974c3c3b9f` | the last Founder-recorded Phase 4 rebind (decision-log v4.49, recorded 2026-09-01T12:23:46Z) |
| `5c5fc25beaf5e3311f7664ab2c6fbae833d6f760` | the AC8 measurement pin only (§9.2) |
| `abd69671cad67b496e9915da977277b2145d56e5` | the r5 drafting base and r4's location only; it grants no implementation authority |

This plan does not resolve the documentary split between `DEC-20260815-17`'s embedded base and decision-log v4.49's recorded rebind; it does not rebind Phase 4; it authorizes no Seat Registry implementation; implementation of packages/seat-registry requires a later Founder authorization naming an exact then-current Build Room `main` SHA; and PR 2b is outside this plan. Neither `5c5fc25beaf5e3311f7664ab2c6fbae833d6f760`, nor `abd69671cad67b496e9915da977277b2145d56e5`, nor any later Build Room `main` SHA is a Phase 4 implementation base, and this plan labels none of them so.
**Freeze posture:** the Founder has invoked the **narrow exception in `DEC-20260814-03` clause 4**. The blocked ship is the Build Room v1 slice with the TUI, specifically its Phase 4 planner-loop slice. The blocker is that journal-first dispatch can carry `role_id`, but it cannot mechanically resolve that identity to an authorized seat and binding state — or fail closed on absence, ambiguity, expiration, or unavailable binding — before dispatch. Seat Registry V1 mechanizes existing identity, binding, refusal, and accountability rules; it creates no new role, seat, model authority, merge authority, deployment authority, or decision rule. This clause-4 freeze permission is not a Phase 4 implementation grant. Not a governance change, not a roster change, not a role activation.

**Derivation rule for this document.** Every routing fact below is read from a controlling registry or decision and carries its citation. No lane, model identifier, provider class, surface, or binding status is asserted, inferred from a nearby value, or carried forward from r3's Hermes-suite draft. Where the corpus establishes nothing, the row reads ABSENT with the reason.

**Named paths and their state at the r5 drafting base.** Required of every plan filed under `docs/planning/` by the Founder ruling of 2026-09-01 on path-audit scope. Measured against Build Room `abd69671cad67b496e9915da977277b2145d56e5`, not asserted (r4 measured at `5c5fc25…`; the rows are re-measured here because the drafting base moved):

| Path named in this plan | State at the base | Why it is named |
|---|---|---|
| docs/planning/ | **exists** at `abd69671cad67b496e9915da977277b2145d56e5` (it did not exist at `5c5fc25…`; r3 and r4 are filed under `docs/planning/seat-registry-v1/`) | the directory the ruling scopes itself to; kept in this table for continuity with r4 |
| packages/seat-registry | **does not exist** at `abd69671cad67b496e9915da977277b2145d56e5` | the deliverable package this plan proposes; it is created only after a ratified DEC and Founder authorization, which these rulings do not grant |
| contracts/seats/ | **does not exist** at `abd69671cad67b496e9915da977277b2145d56e5` | the seat-contract directory this plan proposes, four files, one per seat |

The paths in the table above are written without code quoting for one reason, stated so it is not mistaken for style: `scripts/path-audit.sh` resolves backtick-quoted repo-relative references against the working tree, and quoting a path that does not exist produces a finding. The un-quoting is disclosure, not evasion, which is why this table exists.

Every other repository path this plan names exists at `abd69671cad67b496e9915da977277b2145d56e5` and was checked: `docs/command-journal-contract.md`, `packages/control-plane/src/migrations.ts`, `packages/gateway-cli`, and `scripts/path-audit.sh`. References of the form `00-system/...` and `/04-agents/...` are FounderOS paths, not Build Room paths, and are resolved against that repository.

r3, filed unmodified beside this file, names packages/seat-registry (twice) and contracts/seats/ (three times). Those are the same two non-existent paths, for the same reason. r3 is not edited to change them.

---

## 0. Changelog r3 → r4

### 0.1 One row per ruling item

| Ruling item | Disposition in r4 | r4 section |
|---|---|---|
| A — Seat identity | Seats are the four canonical role IDs; `br-*` retired everywhere including narrative; four display names, one per seat; Lab assignment-versus-role split stated verbatim | §1 |
| B — Fourth seat and Lab hold | Fourth seat is `independent-reviewer`, display name Argus; consumes existing independent-review machinery under `DEC-20260815-05`; Lab seats remain held and unfilled | §1.4, §1.5, §2.5 |
| C-1 — Provider set | Restricted to the five providers and their registered surfaces under `DEC-20260815-04`; no new provider enabled; Hermes-suite providers excluded | §2.1, §10.3 |
| C-2 — Model set | Every lane references an existing registered `model_id`; unregistered identifiers fail closed; no nearby-ID substitution | §2.2 |
| C-3 — Binding status | Each lane carries its actual `DEC-20260716-02` item-2 status; the registry mirrors, never assigns; TTA is not a lane | §2.3, §3 |
| C-4 — Data class | Internal by default per `DEC-20260716-01` item 2; matrix obeyed; grok-build and glm-5.2 conditions carried verbatim | §2.4 |
| C-5 — Seat-to-lane derivation | Derivation basis stated per seat exactly as C-5 names it; ABSENT rows carry reasons; researcher ABSENT is a valid outcome | §2.5 |
| C-6 — Surfaces | Every `default_surface` is a registered `surface_id` and passes the `DEC-20260807-01` §3.3 roles-permitted check; `CONSUMED_SURFACES` deleted | §2.6 |
| 7.1 — Attribution | No `Seat-Id:` trailer; `Role-Id:` carries seat accountability; r3 C13 deleted | §6 |
| 7.2 / D — Command journal | No `seat_id` element and no contract amendment in V1; journal identity consumed as-is; contract hash pins live in the registry | §5 |
| Retry and failover semantics | Every retry and failover is a new `command_id`; correlation through existing bindings; no element repurposed as lineage; at most one dispatch per `command_id`; retries ≤ 2 | §4 |
| 7.3 — Sequencing | No-touch list carried verbatim, including `packages/control-plane/src/migrations.ts` while PR 2b is open; stop at any collision | §8 |
| CLI and dispatch placement | r3 §3.8 and r3 test 11 deleted as written; resolution binds to the governed Phase 4 dispatch path; the five CLI verbs untouched | §7 |
| Later IDs (out of V1, not blocked) | The six later acts listed under "Later IDs, not V1", none of them r4 work | §10.3 |
| Venue | r4 lands in a repository as a draft before compiler pass 3 and before any Seat Registry DEC; the compiler can resolve its hash from a repo | this file, on PR #15 |

No ruling item is without an r4 section.

### 0.2 One row per r4-instruction item

| # | Instruction | r4 section |
|---|---|---|
| 1 | Use the four canonical role IDs as Seat Registry identities | §1.1 |
| 2 | Retain the four display names, one per seat | §1.2 |
| 3 | Retire `br-*` as identifiers, aliases, and display names | §1.3 |
| 4 | Remove the proposed `Seat-Id:` trailer | §6 |
| 5 | Derive routing from controlling registries and decisions | §2 |
| 6 | Use registered providers, surfaces, and model IDs only | §2.1, §2.2, §2.6 |
| 7 | Carry actual item-2 binding status; create no binding authority | §2.3 |
| 8 | Classify ordinary Build Room work internal by default | §2.4 |
| 9 | Represent unavailable or absent routes honestly | §2.5 |
| 10 | A seat with no lawful standing lane is a valid V1 outcome | §2.5.1 |
| 11 | TTA is never a registry lane or `resolveSeat` authority; honored on the dispatch path via element 7 and §5.3 | §3.2 |
| 12 | Validate `default_surface` against the registry and §3.3; no `CONSUMED_SURFACES` | §2.6 |
| 13 | Preserve the Lab-seat boundary, the lift-on-ratification, and the assignment-versus-role split | §1.4, §1.5 |
| 14 | Preserve command-journal ownership of observed execution identity | §5.1 |
| 15 | Add no `seat_id` journal amendment in V1 | §5.2 |
| 16 | Retries and failovers are distinct `command_id` records with no repurposed lineage element | §4 |
| 17 | Remove `--seat`; bind resolution to the governed dispatch path | §7 |
| 18 | State the parallel-lane no-touch boundary explicitly | §8 |
| 19 | Paste no Hermes profile configuration; enable no excluded provider; substitute no nearby ID | §2.2, §10.3 |
| 20 | Land r4 in a repository as a draft before compiler pass 3 | this file, on PR #15 |
| 21 | Complete a full-corpus compiler pass with full reads of every matching DEC | §11 |

### 0.3 What changed against r3, by r3 section

| r3 section | r4 disposition |
|---|---|
| §3.1 `SeatId` = `br-researcher` / `br-architect` / `br-builder` / `br-operator` | Deleted. Seat IDs are `researcher`, `architect`, `builder`, `independent-reviewer` (ruling A). The `br-operator` homonym is gone with it: there is no `operator` role in the registry, which is what forced r3's placeholder |
| §3.1 `SEAT_TERMINAL_STATUSES['br-operator']` renamed to avoid the Tier-2 enum | Retained as a real collision hazard, rekeyed to `independent-reviewer`; the collision test survives as r4 test 7 |
| §3.2 `SeatRoutingLane` | Gains `binding_status` and `surface_id`; `provider_class` is read from the model registry, never asserted; `provider_org` drops out of the independence test (r4 test 4) |
| §3.2 C10 draft routing table (8 rows from the Hermes suite) | Deleted in full and replaced by the derived table in §2. Every one of its eight rows named a provider, a model, or both that the controlling corpus does not make eligible |
| §3.7 journal integration | Rewritten: no `seat_id` element, no amendment proposal in V1 (ruling 7.2/D) |
| §3.8 CLI `--seat` and `Seat-Id:` trailer | Deleted (ruling CLI, ruling 7.1) |
| §3.9 test 4 (provider-org independence) | Becomes the per-run model-distinctness check (r4 test 4) |
| §3.9 test 5 (`default_surface` ∈ `CONSUMED_SURFACES`) | Becomes the registry plus roles-permitted check (r4 test 5); `CONSUMED_SURFACES` does not exist in any registry |
| §3.9 test 6 (vocabulary collision) | Becomes the 30-role registry membership check (r4 test 6); the collision check moves to r4 test 7 |
| §3.9 test 11 (CLI) | Deleted |
| §5 AC2 `resolveSeat('br-operator')` | Becomes `resolveSeat('independent-reviewer')` |
| §5 AC8 "618-baseline" | Replaced by the measured baseline at `5c5fc25`: 659 tests, 229 suites, 659 pass, 0 fail (§9.2) |
| §5 AC6 scope list | Drops `packages/gateway-cli`; V1 touches no CLI file |
| §7 items 7.1, 7.2, 7.3, 7.4, A, B, C, D | All ruled. §7 is retired as an open-questions section |
| Lines 7, 40, 203, 283 "ratified" contract | Restated with the ratification record (§5.3) |

### 0.4 Changelog r4 → r5 — one row per applied worklist finding

Applied from `r5worklist-v2.md` revision 3 (sha256 7971d738477e1b8c1de19846dfc7e36a6bb92b79c6b97468053870d962efa9de). Provenance is the worklist's: **FR** = Founder-ruled; **FDEC** = Founder-directed evidence correction; **PTS** = proposed technical synthesis, incorporated under the r5 drafting authorization as the selected correction, not as ratified standing policy; **B** = Builder finding with Builder-proposed correction.

| Finding | Prov. | r5 change | r5 section |
|---|---|---|---|
| P1 | FR | r4's nonexistent "exception" clause label deleted from the header; `DEC-20260814-03` clause-4 narrow exception, ship, blocker, no-new-authority and not-an-implementation-grant statements as ruled | header |
| P3 | B | Architect fails closed: per-task `antigravity` condition in §3.1, conditions in test 10, AC10, no "standing" description of architect | §2.4.2, §2.5.2, §3.1, §9.1, §9.2, §14 |
| P4 | FR | Four Build Room identities with one role each; no implementation base labelled; path table re-measured at the drafting base | header, §5.3, §8, §11 |
| P6 | FR | `role_binding_status` admits `accountability-approved`; researcher row not normalized; declaration reconciliation is separate hygiene | §2.3, §2.5.1, §2.7 |
| P7 | FR | `unresolved` (Seat Registry / result layer; journal §5 vocabulary unamended: `unresolved` → `resolved`) and `unknown_outcome` (internal Seat Registry / dispatch-policy classification only — explicitly not a journal event, outcome, field, or vocabulary member), each named once; no `failed` without affirmative no-effect evidence; retry prohibited until reconciliation | §4.2, §9.1 test 12, AC6 |
| P2b | FDEC | r4's own allowlist descriptor and its `grok-build` allowlist locator removed; "no standing routing authority" accurately re-sourced inside the byte-exact `DEC-20260716-02` amendment quotation | §2.4.2, §2.5 |
| P8 | PTS | the bare failure-count trigger field removed from `DispatchPolicyV1`; failover triggers are `DEC-20260720-03` item 4's exact ELIGIBLE list; INELIGIBLE limb carried | §4 |
| P9 | PTS | Cap sourced solely to `DEC-20260716-02` item 5; r4 carried no other decision's citation for the cap at the drafting base, and §4 now says so explicitly | §4 |
| P10 | FR | Preserved unchanged: every retry and every failover is a new `command_id`; `attempt_id` neither introduced nor substituted | §4 |
| P11 | FR | The ruled sentence inserted verbatim, unquoted | §4 |
| P12 | B | Verdict enum re-sourced to `DEC-20260826-01`; `DEC-20260814-02` cited for the gate only | §2.5.4, §8, §9.1 test 7 |
| P13 | B | the word "complete" and its "as registered" claim removed from §2.6; scope stated as `DEC-20260807-01` §3.3's six coding surfaces | §2.6 |
| P14 | PTS | Test 8 restated against `portfolio_classification` | §2.3, §9.1 test 8 |
| P15 | B | `DEC-20260718-05` clause 6 | §6 |
| P16 | PTS | §11 floor restated as `DEC-20260718-03` clause 3 reads; no unilateral Tier change | §11 |
| P17 | PTS | `absent_lanes` kept narrow; ABSENT-row columns declared non-persisted derivation evidence | §2.5, §2.7 |
| P18 | B | Hermes row provider is "Hermes (local)"; `founder-operated-local` identified as the channel class | §2.5.3 |
| P19 | FR | Retry budget as ruled: correlation family, deployment bucket, free initial dispatch, two-retry ceiling, exhaustion, lawful failover, anti-evasion, no reset; pure transition function under test 12 | §4.1, §9.1 test 12, AC6 |
| R1 | B | Doctrine pin `4ab38e7eccb5a6f488984877651f250121be26cc` in basis, entry gate, closure record and doctrine-verification tests | header, §11, §13, §9.1 test 14 |
| R2 | PTS | Tests 4, 5, 6, 8 assert against vendored fixtures captured at the doctrine pin, each with source path and SHA-256; fixture-integrity test 14 | §9.1 |
| R3 | B | `SeatId`, `DISPLAY_NAMES`, `ReadinessProbeRunner`, `SEAT_TERMINAL_STATUSES`, `AttentionState`, `toAttentionState` declared | §2.7, §3 |
| R4 | PTS | `handoff` widened to the fields test 13 validates | §2.7, §9.1 test 13 |
| R5 | B | `deployment_channel` → `ProviderClass` derivation rule stated, including prefix forms | §2.2 |
| R6 | PTS | One row, one `model_id`; multi-model rows split; ABSENT rows are one `absent_lanes` entry per label | §2.5.3, §2.5.4 |
| R7 | PTS | `tier2_attestation_id` and `mode` persisted on the lane; `tier1_review_binding` on the registration; standing-approval marker lives in `conditions` | §2.5.4, §2.7 |
| R8 | B | One `resolveSeat` return contract: resolved, refused-with-reason, TTA-refusal | §3 |
| R9 | B | Test 10 names source, section, exact strings and lanes | §9.1 test 10 |
| R10 | B | Tests 4 and 12 assert package-held data and a pure transition function; no dispatch | §9.1 |
| P2a | FDEC | Byte-exact quotations preserved; locators repointed to `DEC-20260716-02`'s amendment section | §2.4.2, §2.5 |
| R53 | FR | Display names sourced to the RESERVED ITEMS ruling by title, date, comment id and LF SHA-256; no registry cited | §1.2, §2.7 |
| R30 | B | `antigravity` conditions (surface registry :311–:316) and `DEC-20260815-05` clause 3 carried into `conditions` and test 10 | §2.4.2, §9.1 test 10 |
| R58 | B | the "Role-level" phrasing in §2.5.1–§2.5.4 renamed to the declared field `role_binding_status` | §2.5.1–§2.5.4 |
| R60 | B (ruled subclause) | The `large fallback` data-boundary condition is initial eligibility and route selection, not a failover trigger | §2.5.3, §4 |
| R65 | B | `DEC-20260807-01` bounded-reconciliation preconditions carried as `conditions`, a §3.1 rule and test-10 coverage | §2.5.2, §3.1, §9.1 |
| R68 | B (ruled subclause) | `default_surface` = `surface_id` of the first standing Eligible lane, else `null`; `null` for all four V1 seats | §2.6, §2.7 |
| P5 | FDEC | Both `DEC-20260827-01` Section 11 citations preserved and reverified at `4ab38e7eccb5a6f488984877651f250121be26cc` | §5.2, §5.3 |
| R40 | FR | No r5 action; closed through P10 | — |

---

## 1. Identity (ruling A)

### 1.1 Seats are the four existing canonical FounderOS roles

```
seat_id ∈ { researcher, architect, builder, independent-reviewer }
```

No new `seat` identity class and no second authoritative seat namespace is created. The Seat Registry is a projection of already-governed identity, routing, model, surface, and review authority. Recording a row does not create authority (ruling A).

`seat_id` is not a new type. It is a `role_id`, and it must be a member of the canonical role registry at `/04-agents/role-registry.md`, which holds **thirty** roles under `DEC-20260812-03` (that decision, at its own words: "registry is **thirty** roles; the assignable/attributable set is **twenty-nine**"). The registry's thirtieth entry, `investment-acquisition-lead`, carries `activation_status: deferred` and is the single id excluded from the twenty-nine: it is non-assignable, non-routable, and ineligible for attributed work until a separate explicit Founder activation ruling. That exclusion is enforced mechanically by `ROLE_ID_REGEX` in the attribution shape checker, which is why the checker enumerates twenty-nine while the registry holds thirty.

**V1 uses four of those thirty.** All four are in both sets: the registry's thirty and the assignable twenty-nine.

### 1.2 Display names

One display name per seat, and only these four (ruling A, ruling B):

| `seat_id` | Display name | Source of the display name |
|---|---|---|
| `researcher` | Aletheia | FOUNDER RULING — SEAT REGISTRY V1 RESERVED ITEMS (below) |
| `architect` | Daedalus | same |
| `builder` | Hephaestus | same |
| `independent-reviewer` | Argus | same |

The four display names are supplied by the **FOUNDER RULING — SEAT REGISTRY V1 RESERVED ITEMS**, issued 2026-09-01 22:20 ET and published as Build Room PR #15 comment `5503747619`, identified by its retained LF SHA-256 `02be78850fadcbedf734632ae8266062c6d3ade478a84096a5d29170b671925a` (16,966 bytes); its posted CRLF representation is separately recorded as `f58b5257c8e58c6356d51296b34e3a13c880844243a8096974028f6dbf615425` (17,216 bytes). No registry is the source of these names: the role registry's `display_name` fields read `Architect`, `Builder`, `Researcher` and `Independent Reviewer` (role-registry.md :152, :203, :286, :352 at `4ab38e7eccb5a6f488984877651f250121be26cc`), and neither the model registry nor the execution-surface registry carries them. The ruling creates no new identity authority by naming them, and this plan changes none of them.

Display names "are never authority identifiers, role aliases, routing identities, journal identities, or handoff targets" (ruling A). They are never `Role-Id` values, never `Execution-Surface` values, and never journal element-3 values.

### 1.3 `br-*` is retired

The `br-*` labels are retired as identifiers. They are not canonical IDs, not a second alias layer, and not display names (ruling A). No `br-*` value survives into r4's code, schema, tests, acceptance criteria, or narrative. The only occurrences anywhere in this document are §0's record of what r3 carried and this section's statement of the retirement, both of which exist to discharge r4-instruction 3 and neither of which uses the label as an identifier. The accountability mapping from the 2026-09-01 ruling is unchanged; only the implementation mechanism is refined to use the existing role registry directly.

### 1.4 Lab assignments are a job layer, not registry seats

Stated verbatim from ruling A:

> Lab assignments under my 2026-08-21 ruling are per-study job labels recorded in study records, not registry seats. R&D Lead and Technical Researcher remain two assignments under the single registry role `researcher`. Lab Engineer remains a scoped assignment under `builder`. Independent Research Verifier remains an assignment under `independent-reviewer`. The revised Lab packet names the canonical role ID as the authority layer and keeps its assignment label as the job layer. Seat-equals-role for the Build Room registry does not collapse those Lab jobs into one.

### 1.5 The Lab hold is untouched

The Build Room Seat Registry is distinct in scope from the held Lab-seat work under `DEC-20260821-01` item 3: shared identity layer (the four role IDs), separate scope, separate ratification act (ruling B). `DEC-20260821-01` records items 2 and 3 as "**NOT RATIFIED — held *for now*.** Temporary; expected to return, not rejected", and item 5 as "Held with item 3". The Lab seats remain held and unfilled; nothing in this plan lifts, amends, satisfies, fills, or activates that hold. The 2026-09-01 lift remains effective only on ratification of the Lab activation packet, and this registry does not fill those seats. Nothing here ratifies, amends, or authorizes signature of the Lab activation packet.

### 1.6 Closure of the V1 set

V1 is a closed set of these four role IDs as seats. Additional V1-class seats later must be existing canonical role IDs named in a later Founder ruling (ruling A). See §10.3.

---

## 2. Routing (ruling C-1 through C-6)

### 2.1 Provider set (C-1)

Seat Registry V1 is restricted to the five Build Room providers and their registered execution surfaces already eligible under `DEC-20260815-04`, discharged by that decision's Founder Naming Act of 2026-08-21:

| Provider | Registered surface | Roles the surface permits | Source |
|---|---|---|---|
| Anthropic (Claude) | `claude-code` | `builder`, `architect`, `strategist`, `independent-reviewer` | `DEC-20260815-04` Naming Act; `DEC-20260807-01` §3.3 |
| OpenAI (Codex) | `codex` | `builder`, `architect`, `strategist`, `independent-reviewer` | same |
| Google (Gemini) | `antigravity` | `builder`, `architect`, `independent-reviewer` | same |
| xAI (Grok) | `grok-build` | `builder`, `independent-reviewer` | same, two conditions at §2.4.2 |
| Hermes (local) | `hermes-local-code` | `builder` only | same, two conditions at §2.4.2 |

No new provider is enabled. Google work, if any lawful V1 lane exists, uses the registered `antigravity` surface only; `gemini-direct` is not enabled. See §10.3 for the excluded set.

### 2.2 Model set (C-2)

Every lane must reference an existing registered `model_id` in `/04-agents/model-registry.md`. An unregistered identifier is unavailable for governed routing and fails closed; it may not be guessed, aliased, silently substituted, or treated as available because it appeared in research, a live Hermes profile, or prior planning material. A nearby registered identifier is not a substitute for an unregistered one.

Three corrections this rule forces on r3's draft table, each verified against the registry:

| r3 wrote | Registry records | Consequence |
|---|---|---|
| `gemini-3.1-pro-preview` | `model_id: gemini-3.1-pro`; the preview string appears only inside that entry's `last_verified` availability note, never as a second `model_id` | Use `gemini-3.1-pro`. The registry does not record two model IDs here |
| `glm-5.3`, `grok-4.6`, `qwen3.8-max`, `kimi-k3`, `deepseek-v4-pro` as a builder lane, `MiniMax-M3` | None of these is a registered `model_id` reachable through a Build Room surface. `glm-5.2` and `grok-4.5` are registered; `deepseek-v4-pro` is registered but its provider is not among the five | Every one of r3's eight draft rows is deleted |
| `gemini-direct`, `nous`, `zai`, `ollama-cloud`, `minimax`, `xai-oauth` as providers | Not eligible providers under `DEC-20260815-04` | Deleted; see §10.3 |

`provider_class` is read from the model registry's `deployment_channel` field, never asserted. **Derivation rule, executable as written:** if `deployment_channel` is exactly one of the tokens `P1`, `P2`, `P3`, `P4`, `P5`, or begins with one of those tokens immediately followed by `-` (the registry's prefix forms: `P1-anthropic-first-party` → `P1`, `P3-zai-international` → `P3`, `P5-founder-operated-local` → `P5`), then `provider_class` is that token. Any other value — including `unverified`, `verification-pending`, `codex-founder-operated` and `azure-ai-foundry` — yields `NOT_RECORDED`, the class is **not recorded**, and the lane is unavailable for internal work under C-4. A class stated only in a registry comment beside a non-class token (the `deepseek-v4-pro` entry's "(P2)" annotation on `azure-ai-foundry`) is derivation evidence for an ABSENT row in §2.5 and is never persisted as a `provider_class`. This rule reproduces every `provider_class` value this plan records and refuses every value it refuses. The registry states the device explicitly at the `gpt-5.6-luna` entry: `deployment_channel: verification-pending` is a "governance sentinel, not a P1-P5 provider class. `codex-founder-operated` describes the EXECUTION SURFACE (see surface_availability), not a verified provider retention posture; asserting it here would imply a boundary check that has not been run".

No later model ID is pre-created. A model becomes eligible only after it exists in the controlling model registry with a status from `DEC-20260716-02` item 2, a provider class, and data eligibility, and only under a later Founder ruling or binding decision.

### 2.3 Binding status (C-3)

Every lane carries its actual controlling binding status from the `DEC-20260716-02` item 2 ladder, whose nine values are:

```
approved-binding | proposed-binding | implementation-observed | temporary-task-assignment
| evaluation-candidate | watchlist | rejected | unverified | deprecated
```

The Seat Registry **mirrors** that status. It does not assign it, and this plan creates no new permanent model binding merely to populate the registry.

Two vocabularies must not be conflated, and r4 keeps them apart:

- the **model-level** ladder above, recorded per model in the model registry;
- the **role-level** `binding_status` field in the role registry. Its declaration ("How to read this registry", role-registry.md :101 at `4ab38e7eccb5a6f488984877651f250121be26cc`) lists `active`, `approved`, `proposed`, `unassigned`; the registry's own researcher row (:307) records `accountability-approved`, exactly as `DEC-20260721-04` Decision item 1 directs ("with `binding_status` updated to state exactly that: accountability approved, model bindings still unassigned"). The declaration is what is out of date, not the row.

`SeatRoutingLane` carries the model-level value; the model registry holds it in the field `portfolio_classification` (twenty entries at `4ab38e7eccb5a6f488984877651f250121be26cc`; the token `binding_status` occurs in that registry only inside `binding_history` sub-records of superseded proposals, never as a model-level field). `SeatRegistrationV1.role_binding_status` records the role-level value separately, as read, and its declared type admits all five values the registry actually carries: `active`, `approved`, `proposed`, `unassigned`, `accountability-approved` (§2.7). The researcher row is **not** normalized to `unassigned`. Reconciling the registry's declaration to add `accountability-approved` is a separate FounderOS hygiene change requiring its own exact-SHA Founder authorization and separate review; this plan does not perform it, and no Seat Registry DEC may proceed until this plan and that separately authorized reconciliation both receive the required new complete-corpus bare PASS.

Where no approved standing binding exists, a lane may be represented at its actual ladder status, but it is **unavailable for standing governed dispatch** until the required binding authority exists. `resolveSeat` fails closed rather than treating a non-approved ladder status as an approved standing route (§3).

### 2.4 Data class (C-4)

#### 2.4.1 The matrix

Ordinary governed Build Room work is classified **internal** by default, as `DEC-20260716-01` item 2 already provides ("Unclassified work defaults to **internal**"). This plan classifies no corpus; classification is Founder authority under that decision's item 8.

For internal work, from the item-3 matrix row and item 7:

- only provider classes authorized for internal data may be used: **P1, P2, P5**;
- **P3** requires applicable standing Founder approval for the eligible lane;
- **P4** must never serve internal work;
- any lane whose provider class, deployment channel, retention posture, or data eligibility is unverified is **unavailable for internal work**;
- existing provider- or model-specific restrictions remain in force and are carried below.

This plan creates no new P3 approvals for otherwise ineligible providers or lanes. The five-column table in `DEC-20260716-01` item 3 is that decision's summary, not the complete matrix; the nine-column matrix at `/00-system/data-boundary-policy.md` §4 is authoritative for any column not reproduced there, and an implementation must consult it.

#### 2.4.2 Conditions carried verbatim

**`grok-build` / `grok-4.5`**, from `DEC-20260815-04` "Conditions carried by two of the five":

> - **Public-class only by default.** The `grok-4.5` roster entry carries a data-boundary condition: while its `deployment_channel` is unverified, internal-class content requires explicit auditable Founder authorization per `DEC-20260716-01` clause 6.
> - **xAI first-party API terms are not verified** in `/04-agents/subscription-vs-api-inventory.md`, which states that a decision relying on them must independently verify via `docs.x.ai` at that time. The path in active use is the `grok-build` CLI/agent session, not a verified first-party API channel.

and from `DEC-20260716-02`, section `## Amendment under DEC-20260807-01 — effective`, its `grok-build` item (lines 152–160 at `4ab38e7eccb5a6f488984877651f250121be26cc`; the amendment was made under `DEC-20260807-01`, and its text lives in `DEC-20260716-02`'s file):

> Every execution, public or internal, requires an exact task-scoped Founder authorization naming repository, data class, scope, and expiration/completion boundary — no standing routing authority exists until MP-1 activation. That authorization may permit public-class data immediately; internal or private-repository data requires the same authorization plus explicit disclosure until channel verification is recorded. Secrets, credentials, production data, personal data, and confidential-or-higher material remain excluded unless separately and exactly Founder-authorized.

**`glm-5.2`**, from `DEC-20260716-02`, section `## Amendment under DEC-20260807-01 — effective`, its `cursor` item (lines 141–144 at `4ab38e7eccb5a6f488984877651f250121be26cc`):

> `glm-5.2` is limited to public and ordinary-internal data through the existing P3/Z.ai approval; governance/doctrine, confidential-or-higher, secrets, credentials, personal data, and production data are prohibited. This does not replace or broaden its Deputy runtime binding.

`glm-5.2` has **no lawful Seat Registry V1 lane**: its only `builder` binding is `cursor-secondary-manual-task-scoped`, and `cursor` is not one of the five providers named eligible for the Build Room under `DEC-20260815-04`. Its condition is carried here because C-4 requires it carried accurately, not because a V1 row uses it. Its registered `deployment_channel` is `P3-zai-international`; the Deputy Chief of Staff primary binding under `DEC-20260717-02` and `DEC-20260801-01` is untouched by anything in this plan.

**`hermes-local-code`**, from `DEC-20260815-04`:

> - **`builder` only.** The registry permits no other role, and excludes `researcher` deliberately.
> - **May not issue a sole binding Tier-2 verdict**, and may not self-review, merge, deploy, or operate in production — `prohibited_actions`, ratified 2026-08-07. External transmission is denied by default.

**`antigravity` / `gemini-3.1-pro`**, from `DEC-20260716-02`, section `## Amendment under DEC-20260807-01 — effective`, its `antigravity` item (lines 145–149 at `4ab38e7eccb5a6f488984877651f250121be26cc`):

> - `antigravity`: the Founder may manually select a registered Gemini model for an exact task. The model and effort are recorded. Auto and silent switching are prohibited. `gemini-3.6-flash` is the primary supplemental fast reviewer and `gemini-3.5-flash` the fallback; both are non-binding. Only `gemini-3.1-pro` retains Gemini binding Tier-2 eligibility.

and from the execution-surface registry's `antigravity` entry (execution-surface-registry.md :311–:316 at `4ab38e7eccb5a6f488984877651f250121be26cc`), carried into every `antigravity` lane's `conditions` verbatim:

> `underlying_model_selection: founder-manual-selection-required; must be a registered, provider-verified Gemini model ID carrying a model-registry entry; exact model and effort recorded`
> `approval_requirements: no Auto or silent switching; no self-review; exact task and code-state binding`
> `prohibited_actions: merge, deployment, production operation, authority expansion`

and, for the `independent-reviewer` Tier-2 lane on that surface, `DEC-20260815-05` clause 3, carried into that lane's `conditions` verbatim:

> **The reviewer workspace** is read-only, credential-free, and push-incapable by construction (architecture §3.11), attested by the Gateway before review opens.

These conditions make the architect primary lane a **per-task** route, not a standing one (§2.5.2, §3.1).

### 2.5 Seat-to-lane derivation (C-5)

The seat-to-lane table is derived from the controlling registries and decisions, not designed by hand from the Hermes suite. The derivation basis per seat, exactly as C-5 names it:

| Seat | Derivation basis (C-5) | Sources actually read |
|---|---|---|
| `architect` | controlling Architect tier and binding decisions | `DEC-20260715-14` via role-registry §2 and the model registry; `DEC-20260716-02` item 7 (naming correction) |
| `builder` | controlling Build Room builder and work-size routing decisions | `DEC-20260807-01` work-size routing schedule; the per-surface items of `DEC-20260716-02`'s `## Amendment under DEC-20260807-01 — effective`; the model registry's per-model `builder` bindings |
| `researcher` | controlling researcher authority plus eligible registered routing candidates | role-registry §4; `DEC-20260721-04`; `DEC-20260812-04`; `DEC-20260807-01` §3.3 |
| `independent-reviewer` | controlling independent-review roster (`DEC-20260815-05`) and per-run distinctness requirements | `DEC-20260815-05`; `DEC-20260719-02` v1.1 via role-registry §6 and the model-registry Tier-2 reconciliation |

Each derived lane carries enough citation to reconstruct its provider, model, surface, binding status, provider class, and data eligibility. Where the controlling corpus establishes no lawful lane, the row reads ABSENT with the reason. **No fallback is invented to satisfy a schema.** V1 does not require every seat to have both a primary and a fallback route.

**Non-persisted derivation columns.** In every ABSENT row below, the provider, model, surface, binding-status, provider-class and eligibility columns are derivation evidence in this document only; they are not persisted. A persisted `absent_lanes` entry carries exactly `{ label, reason }` (§2.7) — which is what §3.1's refusal needs and nothing more — and each ABSENT row below is one such entry, keyed by the label given in its rightmost column.

#### 2.5.1 `researcher` (Aletheia) — ABSENT, and that is a valid V1 outcome

| Field | Value | Citation |
|---|---|---|
| Standing Build Room lane | **ABSENT** | derived below |
| Reason | No registered Build Room execution surface permits `researcher` | `DEC-20260807-01` §3.3 roles-permitted table lists `researcher` for none of the six coding surfaces; `DEC-20260815-04` role-coverage table omits `researcher` entirely |
| Reason (Hermes) | The only registered Hermes surface in the Build Room permits `builder` only, and excludes `researcher` deliberately | execution-surface-registry `hermes-local-code`: `permitted_role_ids: [builder]`, "The `researcher` role is deliberately excluded"; `DEC-20260815-04` |
| Research surface | The Hermes full agent, a runtime research lane, not a registered Build Room execution surface | `DEC-20260812-04` item 1 |
| Model bindings | none | role-registry §4 `approved_bindings: []`; `DEC-20260812-04` item 2: "`approved_bindings` for the researcher role remain `[]`" |
| `role_binding_status` (role-level) | `accountability-approved` — recorded exactly as the registry's researcher row carries it and as `DEC-20260721-04` Decision item 1 directs (capability accountability only; model bindings unassigned); **not normalized to `unassigned`** | role-registry §4 (:307); `DEC-20260721-04` Decision item 1 |

Ruling C-5 states this outcome in advance: "Researcher is expected to have no lawful standing Build Room lane in V1 ... That absence is valid under this section, not a defect to fill." The registration records the seat with an empty routing set and a stated reason. It does not borrow a lane from another seat, and it does not invent one.

#### 2.5.2 `architect` (Daedalus)

| Lane | Provider | `surface_id` | `model_id` | `binding_status` (item-2) | `provider_class` | Internal-work eligibility |
|---|---|---|---|---|---|---|
| primary | google (`DEC-20260815-04`) | `antigravity` — registered; `architect` permitted (`DEC-20260807-01` §3.3) | `gemini-3.1-pro` — registered (model registry) | `approved-binding` — `portfolio_classification: approved-binding`; `role_id: architect`, `binding_class: primary`, `decision: DEC-20260715-14` (active) | **P1** — `deployment_channel: P1` (model registry) | **Eligible by class** (P1 is permitted for internal, `DEC-20260716-01` item 3) — **and not a standing route:** the surface requires the Founder's manual per-task model selection with model and effort recorded (§2.4.2 `antigravity` conditions, carried in `conditions`), so `resolveSeat` refuses it as a standing route with that requirement named (§3.1) |
| bounded reconciliation | anthropic | `claude-code` — registered; `architect` permitted | `opus-4.7` — registered | `approved-binding` — `role_id: architect`, `binding_class: post-review-reconciliation-read-only`, `decision: DEC-20260807-01` | **P1** — `deployment_channel: P1-anthropic-first-party` | **Eligible by class**, within the binding class only — **and not a standing route:** its preconditions from `DEC-20260807-01` (lines 446–452 at `4ab38e7eccb5a6f488984877651f250121be26cc`) are carried in `conditions`: it may run only after the binding Tier-2 verdict; only by an execution assigned the `architect` (or `strategist`) stable role; it is not the binding Tier-2 verdict and does not replace Founder authority; and an `opus-4.7` execution that authored the work cannot reconcile that code state. `resolveSeat` refuses it as a standing route with those preconditions named (§3.1); test 10 byte-compares them |
| secondary | deepseek | **ABSENT** | `deepseek-v4-pro` (mode `thinking`) | `approved-binding` for the role, but unreachable | `azure-ai-foundry` (P2) for the fallback binding only | **ABSENT.** deepseek is not among the five eligible providers (`DEC-20260815-04`) and no registered Build Room surface hosts it. The model registry additionally records the secondary binding's implementation as "separately unauthorized" |
| advisor | xai | **ABSENT** | `grok-4.5` | `approved-binding` for the role (`binding_class: advisor`, `DEC-20260715-14`) | `deployment_channel: unverified` | **ABSENT.** `grok-build` permits `builder` and `independent-reviewer` only; `architect` fails the §3.3 roles-permitted check |
| fallback | deepseek | **ABSENT** | `deepseek-v4-pro` (mode `standard`) | `approved-binding` for the role, but unreachable | `azure-ai-foundry` — Data Zone United States (P2) | **ABSENT**, same reason as secondary |

The `post-review-reconciliation-read-only` binding carries its own constraint verbatim from the model registry: "Post-review reconciliation is read-only on the reviewed SHA. Any code edit is a new `builder` execution, produces a new SHA, and requires fresh verification and review. An execution that authored the code state cannot reconcile it as an independent post-review execution."

`role_binding_status` for `architect`: `approved` (role-registry §2).

**Architect fails closed in V1.** No architect lane is a standing route: the primary requires the Founder's manual per-task model selection on `antigravity`, and the bounded-reconciliation lane requires its post-verdict preconditions on every invocation. `resolveSeat('architect')` therefore refuses every lane as a standing route with the requirement named (§3.1, AC10), exactly as it does for `builder` and `independent-reviewer`. Nothing in this plan describes architect as a standing lane.

#### 2.5.3 `builder` (Hephaestus)

`role_binding_status` for `builder`: **`unassigned`**, annotated in the role registry as "permanent binding", with `approved_bindings: []`, `proposed_bindings: []`, `implementation_observed_bindings: []`. `DEC-20260716-02` item 12 names `builder` among the fourteen roles that "receive no binding of any status by this decision". The model-level task-scoped bindings below therefore coexist with an unassigned permanent binding; both facts are recorded, neither is collapsed into the other.

| Lane (work size) | Provider | `surface_id` | `model_id` | `binding_status` (item-2) | `provider_class` | Internal-work eligibility |
|---|---|---|---|---|---|---|
| large | xai | `grok-build` — `builder` permitted | `grok-4.5` | `approved-binding`; `binding_class: large-implementation-primary-task-scoped`, `decision: DEC-20260807-01`, with `limits` requiring a Founder-authorized task-scoped assignment per task until MP-1 activation | **not established** — `deployment_channel: unverified` | **Unavailable for internal work by default.** Public-class only until xAI channel verification, or explicit internal-class disclosure authorization per task (§2.4.2) |
| large fallback | anthropic | `claude-code` — `builder` permitted | `sonnet-5` | `approved-binding`; `binding_class: large-implementation-fallback-task-scoped`, `decision: DEC-20260807-01`, `limits`: engaged only when the `grok-4.5` data boundary cannot be satisfied for the task — **as ruled, that data-boundary condition is initial eligibility and route selection at assignment time, not a failover trigger (§4)** | **P1** — `deployment_channel: P1` | **Eligible** |
| medium | anthropic | `claude-code` — `builder` permitted | `opus-4.7` | `approved-binding`; `binding_class: medium-work-primary`, `decision: DEC-20260807-01` | **P1** — `deployment_channel: P1-anthropic-first-party` | **Eligible** |
| light | anthropic | `claude-code` — `builder` permitted | `claude-haiku-4-5` | `approved-binding`; `binding_class: light-implementation-task-scoped`, `decision: DEC-20260807-01` | **not established** — `deployment_channel: verification-pending` | **Unavailable for internal work** until the channel is verified. The registry records that the source fetch returned HTTP 403 from the G2 environment and that "failure ≠ unavailability"; the field is pending, not denied |
| Codex complex / high-risk | openai | `codex` — `builder` permitted | `gpt-5.6-sol` | `approved-binding`; `binding_class: codex-complex-analysis-planning-and-surgical-fixes`, `decision: DEC-20260807-01`; `max` mode requires exact Founder authorization and a recorded reason | **not established** — `deployment_channel: codex-founder-operated`, a surface descriptor, not a P1–P5 class (§2.2) | **Unavailable for internal work** until a class is recorded. `data_class_boundary`: active data-boundary policy and exact task scope |
| Codex routine / bounded | openai | `codex` — `builder` permitted | `gpt-5.6-terra` | `approved-binding`; `binding_class: routine-verification-and-bounded-fixes`, `decision: DEC-20260807-01` | **not established** — same as above | **Unavailable for internal work** until a class is recorded |
| Hermes local | Hermes (local) — the provider name of `DEC-20260815-04`'s Naming Act (§2.1); the model registry records `provider: deepseek` for `deepseek-v4-flash`; `founder-operated-local` is the surface's `provider_context` / channel class (`DEC-20260815-04`; `deployment_channel: P5-founder-operated-local`), not the provider | `hermes-local-code` — `builder` only | `deepseek-v4-flash` | `approved-binding`; `binding_class: hermes-local-code-current-model`, `decision: DEC-20260807-01` | **P5** — `deployment_channel: P5-founder-operated-local` | **Constrained to local-only.** `data_class_boundary`: "local-only; external transmission denied unless exactly Founder-authorized". Only a registered, Founder-approved local model may replace the selection, and the actual model is recorded per execution |
| Cursor primary | — | **ABSENT** | `grok-4.5` | recorded binding exists (`cursor` primary, `DEC-20260716-02` amendment) | — | **ABSENT.** `cursor` is not one of the five providers named eligible for the Build Room (`DEC-20260815-04`); `absent_lanes` label `cursor-primary` |
| Cursor alternative | — | **ABSENT** | `sonnet-5` | recorded binding exists (`cursor` alternative) | — | **ABSENT**, same reason; `absent_lanes` label `cursor-alternative` |
| Cursor secondary | — | **ABSENT** | `glm-5.2` | recorded binding exists (`cursor-secondary-manual-task-scoped`) | — | **ABSENT**, same reason; `absent_lanes` label `cursor-secondary` |

**No `builder` lane is an approved standing route.** Every row above is task-scoped, and `DEC-20260807-01` states the activation ladder explicitly: "Ratification authorizes implementation and the controlled pilot; it does not activate MP-1", with "MP-1 approved but inactive" as the ladder's first rung. `DEC-20260815-04` clause 4 is the same fact from the provider side: "**No provider is bound by this decision.** Selection is eligibility and ordering; binding a provider to a role is a separate Founder act." `resolveSeat` therefore fails closed for `builder` in V1 (§3.1).

#### 2.5.4 `independent-reviewer` (Argus)

`role_binding_status`: **`active`** (two-tier, `DEC-20260719-02` v1.1, role-registry §6).

**Tier 1** is `tool_id: coderabbit`, `binding_status: active`. It is a tool, not a model, not a provider, and not an execution surface. It is recorded on the registration as the Tier-1 review binding — persisted as `SeatRegistrationV1.tier1_review_binding: 'coderabbit'` (§2.7) — and is **not** a `SeatRoutingLane`.

**Tier 2** is a closed roster. `DEC-20260815-05` clause 1 extends it to Build Room reviews unchanged, and clause 2 states: "**No model is bound by this decision.** The roster is eligibility; actual binding per run is a separate Founder act (model-assignment governance)."

| Lane | Provider | `surface_id` | `model_id` | `tier2_attestation_id` (the `Tier2-Reviewer-Id` token) | `binding_status` (item-2) and `mode` | `provider_class` | Internal-work eligibility |
|---|---|---|---|---|---|---|---|
| tier-2 | google | `antigravity` — `independent-reviewer` permitted | `gemini-3.1-pro` | `gemini-3.1-pro` | `approved-binding`; `binding_class: tier-2`, `mode: invoked`, `decision: DEC-20260719-02` | **P1** | **Eligible by class**; `conditions` carry the §2.4.2 `antigravity` surface conditions and `DEC-20260815-05` clause 3; per-run Founder act still required (clause 2) |
| tier-2 | openai | `codex` — permitted | `gpt-5.6-sol` | `chatgpt-5.6-sol` | `approved-binding`; `binding_class: tier-2-full-roster`, `mode: xhigh` | **not established** (§2.2) | Unavailable for internal work until a class is recorded |
| tier-2 | openai | `codex` — permitted | `gpt-5.6-terra` | `chatgpt-5.6-terra` | `approved-binding`; `binding_class: tier-2-full-roster`, `mode: high`, `decision: DEC-20260719-02` v1.1 (2026-08-15) | **not established** | Unavailable for internal work until a class is recorded |
| tier-2 | openai | `codex` — permitted | `gpt-5.6-luna` | `chatgpt-5.6-luna` | `approved-binding`; `binding_class: tier-2-full-roster`, `mode: invoked`, `decision: DEC-20260719-02` v1.1 | **not established** — `deployment_channel: verification-pending` | **Public-class only.** `data_class_boundary`: fail-closed pending provider verification; internal-class review material requires explicit, auditable per-invocation Founder authorization |
| tier-2 | xai | `grok-build` — permitted | `grok-4.5` | `grok-4.5` | `approved-binding`; `binding_class: tier-2`, `mode: invoked` | **not established** — `deployment_channel: unverified` | Public-class only by default (§2.4.2). "Same data-boundary rules apply to review material as to advisor material" |
| tier-2 via `claude-code` | anthropic | `claude-code` — permitted | **ABSENT** | — | — | — | **ABSENT.** No Anthropic model is on the Tier-2 roster: `opus-4.8` was removed 2026-08-15, founder-directed (`DEC-20260719-02` v1.1). The surface permits the role; the roster supplies no eligible model for it |
| restricted local | — | `hermes-local-code` | `hermes-4-14b` | — | restricted roster, non-binding | P5 | **ABSENT as a standing lane.** Provides paired, non-binding findings only and cannot independently satisfy the binding Tier-2 verdict on any artifact, absent the Founder's exact one-task / one-repository / one-committed-SHA local-only exception. `hermes-local-code` additionally permits `builder` only and lists "sole binding Tier-2 verdict" among its `prohibited_actions`; `absent_lanes` label `restricted-local-hermes-4-14b` |
| restricted local | — | `hermes-local-code` | `tencent-hy3` | — | restricted roster, non-binding | P5 | **ABSENT as a standing lane**, same reason; `absent_lanes` label `restricted-local-tencent-hy3` |

Two live hazards are recorded on the registration rather than discovered at runtime:

1. **Attestation-id variance.** The `Tier2-Reviewer-Id` token the gate accepts is not the `model_id` for the three Codex models. `00-system/scripts/tier2-shape-check.sh` pins `REVIEWER_ROSTER_REGEX` to `gemini-3.1-pro|chatgpt-5.6-sol|chatgpt-5.6-terra|chatgpt-5.6-luna|grok-4.5`. A marker written with the `model_id` form fails the gate with "not on the founder-ratified roster" even though the model is genuinely on the roster. The registry records this as an open item for the Founder; V1 persists both strings on the lane — `model_id` and `tier2_attestation_id` (§2.7) — and never derives one from the other. Each Tier-2 row's `mode` value (`invoked`, `xhigh`, `high`) is likewise persisted on the lane as `mode`, because §2.5.4 records it per lane; §13 requires the closure marker be written with the attestation id, which is why it is load-bearing.
2. **A superseded denial.** `DEC-20260807-01`'s work-size schedule says of the `codex` / `gpt-5.6-terra` route: "not eligible for Tier-2". That was correct on 2026-08-07 and was **superseded** by the Founder's ratification of 2026-08-14, amended into `DEC-20260719-02` at v1.1 on 2026-08-15, which places the model on the Tier-2 full roster. The model registry carries the dated correction. r4 derives from the superseding record, not the superseded line.

This does not replace, weaken, or redefine Tier-2 review authority or its verdict vocabulary (ruling B). That vocabulary is the closed enum `{PASS, PASS-WITH-ADVISORIES, FAIL}` ratified by `DEC-20260826-01` (which also records the Founder ruling at decision-log v4.36: "REQUEST-CHANGES and any other vocabulary is rejected"); `DEC-20260814-02` establishes the Tier-2 shape-check gate that enforces the marker and defines no enum of its own.

### 2.6 Surfaces (C-6)

Every non-null `default_surface` must be a registered `surface_id` from the FounderOS execution-surface registry, and the seat's role ID must appear in that surface's roles-permitted table (`DEC-20260807-01` §3.3). The six coding surfaces of `DEC-20260807-01` §3.3 ("Roles permitted to execute via each coding surface"), as registered — this is §3.3's coding-surface table, not the whole execution-surface registry:

| Registered surface ID | Stable roles permitted to execute via the surface |
|---|---|
| `claude-code` | `builder`, `architect`, `strategist`, `independent-reviewer` |
| `grok-build` | `builder`, `independent-reviewer` |
| `codex` | `builder`, `architect`, `strategist`, `independent-reviewer` |
| `cursor` | `builder`, `architect`, `independent-reviewer` |
| `antigravity` | `builder`, `architect`, `independent-reviewer` |
| `hermes-local-code` | `builder` |

`researcher` appears in no row. That is the mechanical basis for §2.5.1.

**`default_surface` rule.** `default_surface` is the `surface_id` of the seat's first standing Eligible lane; where the seat has no standing Eligible lane it is `null`. In V1 it is `null` for all four seats, because no seat has a standing lane (§2.5, §3.1, §14):

| `seat_id` | First standing Eligible lane | `default_surface` in V1 |
|---|---|---|
| `researcher` | none — the routing set is empty (§2.5.1) | `null` |
| `architect` | none — every lane is per-task or per-invocation (§2.5.2) | `null` |
| `builder` | none — every lane is task-scoped (§2.5.3) | `null` |
| `independent-reviewer` | none — every lane requires a per-run Founder act (§2.5.4) | `null` |

**The CLI is not an execution surface** (`DEC-20260815-06`, whose registration text reads "The CLI is a front end to the Gateway and is not a separate registered surface"). r3's `CONSUMED_SURFACES` identifier **does not exist in any registry** and is deleted from the plan, from the schema, and from the tests.

### 2.7 Schema changes this forces

```ts
export type SeatId = 'researcher' | 'architect' | 'builder' | 'independent-reviewer';  // §1.1: each is a role_id in the 30-role registry
export const DISPLAY_NAMES: Readonly<Record<SeatId, string>> = {
  researcher: 'Aletheia', architect: 'Daedalus', builder: 'Hephaestus', 'independent-reviewer': 'Argus',
};  // §1.2: from the RESERVED ITEMS ruling; never authority identifiers

export type ProviderClass = 'P1'|'P2'|'P3'|'P4'|'P5'|'NOT_RECORDED';   // §2.2 derivation rule
export type DataClass = 'public'|'internal'|'confidential'|'restricted'|'local-only';
export type BindingLadderStatus =
  | 'approved-binding' | 'proposed-binding' | 'implementation-observed'
  | 'temporary-task-assignment' | 'evaluation-candidate' | 'watchlist'
  | 'rejected' | 'unverified' | 'deprecated';                       // DEC-20260716-02 item 2, read from portfolio_classification
export type RoleBindingStatus =
  | 'active' | 'approved' | 'proposed' | 'unassigned'
  | 'accountability-approved';                                       // §2.3: as the role registry actually carries (researcher row, DEC-20260721-04 item 1)

export interface SeatRoutingLane {
  readonly lane_label: string;            // e.g. 'primary', 'medium', 'tier-2'
  readonly provider: string;              // one of the five (DEC-20260815-04), by the Naming Act's provider name
  readonly surface_id: string;            // C-6: registered surface_id
  readonly model_id: string;              // C-2: registered model_id — exactly one per lane
  readonly binding_status: BindingLadderStatus;   // C-3: mirrored from portfolio_classification, never assigned
  readonly binding_class: string;         // as recorded on the model's own entry
  readonly mode?: string;                 // persisted where the controlling record states it per lane (§2.5.2, §2.5.4)
  readonly tier2_attestation_id?: string; // the Tier2-Reviewer-Id token; persisted, never derived from model_id (§2.5.4)
  readonly provider_class: ProviderClass; // C-2: DERIVED from deployment_channel by the §2.2 rule
  readonly data_eligibility: readonly DataClass[];
  readonly conditions: readonly string[]; // verbatim, from the controlling record; a standing-approval marker, where one exists, is a member here, not a field
  readonly derivation: readonly string[]; // decision/registry ids per field
}

export const SEAT_TERMINAL_STATUSES: Readonly<Record<SeatId, readonly string[]>>;  // per-seat terminal statuses, read from each seat contract (below); test 7 proves none collides with a ratified closed vocabulary
export type AttentionState = 'working' | 'blocked' | 'done';
export function toAttentionState(seat: SeatId, status: string | null): AttentionState;  // total over SEAT_TERMINAL_STATUSES[seat] ∪ {null}; test 11

export interface SeatHandoff {
  readonly receives_from: SeatId | null;
  readonly produces: string;
  readonly terminal_status: string;               // must be a member of SEAT_TERMINAL_STATUSES[seat_id] (test 13: wrong status-for-seat)
  readonly committed_sha: string;                 // full 40-hex (test 13: short SHA)
  readonly authorization_refs: readonly string[]; // references only: shape-checked, never adjudicated; non-empty (test 13)
}

export interface SeatRegistrationV1 {
  readonly seat_id: SeatId;               // === a role_id in the 30-role registry
  readonly display_name: string;          // === DISPLAY_NAMES[seat_id]
  readonly role_binding_status: RoleBindingStatus;   // §2.3: as read; the researcher row is 'accountability-approved'
  readonly mission: string;
  readonly contract_ref: string;
  readonly contract_sha256: string;       // pinned HERE, not a journal element (§5.3)
  readonly tier1_review_binding?: string; // 'coderabbit' on independent-reviewer; a tool binding on the registration, never a lane (§2.5.4)
  readonly default_surface: string | null;   // §2.6 rule: surface_id of the first standing Eligible lane, else null; null for all four seats in V1
  readonly routing: readonly SeatRoutingLane[];  // MAY be empty (§2.5.1)
  readonly absent_lanes: readonly { label: string; reason: string }[];  // exactly this shape; §2.5's other ABSENT-row columns are non-persisted derivation evidence
  readonly authority: {
    readonly allowed: readonly string[];
    readonly prohibited: readonly string[];
    readonly enforcement: 'behavioral';   // V1 honest label; V1.1 = gateway-zone
  };
  readonly handoff: SeatHandoff;
}

export const RATIFIED_SEATS: readonly SeatRegistrationV1[];  // deep-frozen
```

`routing` is an array, not a `{ primary, fallback }` pair, because C-5 makes an empty routing set and a single-lane set both valid V1 outcomes, and a fixed pair shape is exactly the schema pressure that produces an invented fallback.

The new package is packages/seat-registry (Node 22 / TypeScript, repository conventions), with seat contracts under contracts/seats/. Neither exists at the base, by design, because these rulings authorize no implementation; both are declared in the header table, which also states why they are written without code quoting.

Seat contracts are ported from the proven SOUL.md set as Build-Room-owned copies. Each carries identity, mission, reasoning style, evidence standard, authority limits, report contract, terminal statuses, stop conditions, and the "not a filesystem sandbox" clause. They change only by PR, and the hash pin updates with them.

---

## 3. `resolveSeat` — fail-closed

```ts
export interface LaneReadiness {
  lane_label: string;
  eligible: boolean;
  reason: string | null;   // never null when eligible === false
}
export interface ReadinessProbeRunner {
  probe(lane: SeatRoutingLane): LaneReadiness;   // proves credentials, never capacity (§3.1); no live provider call in tests
}
export type RefusalClass =
  | 'unknown_seat' | 'seat_outside_registry' | 'contract_hash_mismatch'
  | 'lane_below_approved_binding' | 'lane_not_standing' | 'routing_set_empty'
  | 'temporary_task_assignment_not_lane_authority';
export interface ResolvedSeat {
  kind: 'resolved';
  registration: SeatRegistrationV1;
  contract_text: string;
  readiness: readonly LaneReadiness[];
}
export interface RefusedSeat {
  kind: 'refused';
  seat_id: string;
  registration: SeatRegistrationV1 | null;   // populated when the seat exists (AC2, AC3, AC4, AC10); null for unknown_seat / seat_outside_registry
  readiness: readonly LaneReadiness[];        // per-lane readiness where a registration exists, else empty
  refusal: RefusalClass;
  reason: string;                             // the status, requirement, precondition, or absence reason, named
  requirement: string | null;                 // the per-task / per-run / per-invocation Founder act a lane needs, when refusal === 'lane_not_standing'
}
export type SeatResolution = ResolvedSeat | RefusedSeat;
export interface ResolveOptions {
  probes?: ReadinessProbeRunner;
  presented_authority?: { kind: 'temporary-task-assignment'; assignment_ref: string };  // always refused (§3.2)
}
export function resolveSeat(seatId: string, opts?: ResolveOptions): SeatResolution;
```

**One return contract.** `resolveSeat` returns a `SeatResolution` and does not throw for a governed refusal. `resolved` is returned only when at least one lane is a standing route — which in V1 is never (§2.5, §14). Every other case returns `refused` with the refusal class, the reason named, and — where the seat exists — the registration and per-lane readiness, so that AC2 ("returns the Argus registration … and refuses every lane") and AC3/AC4/AC10 ("refuses") are the same contract read at different seats. The absence reason for `researcher` lives in `reason` under `routing_set_empty`. A temporary task assignment is offered through `presented_authority` and is refused under `temporary_task_assignment_not_lane_authority` (§3.2, test 9).

### 3.1 Fail-closed rule

`resolveSeat` fails closed on any lane below `approved-binding`, and on any lane whose `approved-binding` is not a **standing** route. Concretely, in V1:

- unknown `seat_id`, or a `seat_id` outside the 30-role registry: typed error;
- contract hash mismatch: error naming both hashes;
- a lane at `proposed-binding`, `implementation-observed`, `temporary-task-assignment`, `evaluation-candidate`, `watchlist`, `unverified`, `rejected`, or `deprecated`: refused, with the status named;
- a lane at `approved-binding` whose controlling record requires a per-task Founder authorization (every `builder` lane, §2.5.3), a per-run Founder act (every Tier-2 lane, §2.5.4), the Founder's manual per-task model selection (the `architect` primary on `antigravity`, §2.4.2, §2.5.2), or per-invocation preconditions (the `architect` bounded-reconciliation lane: after the binding Tier-2 verdict, by an execution assigned the `architect` or `strategist` stable role, not the binding verdict, not replacing Founder authority, and never by the execution that authored the code state — `DEC-20260807-01` lines 446–452, §2.5.2): refused as a **standing** route, with the requirement or precondition named;
- a seat with an empty routing set (`researcher`): refused, with the absence reason from §2.5.1, and never by substituting another seat's lane;
- a temporary task assignment presented as lane authority (`presented_authority`): refused, always (§3.2).

Readiness proves credentials, never capacity. Incident R-5.4.02 is the evidence: PONG passed while the real workload shed across three pools.

### 3.2 A temporary task assignment is not lane authority

`resolveSeat` **does not accept a temporary task assignment**. A fail-closed seat does not prohibit a Founder temporary task assignment under `DEC-20260716-02` item 14, whose ratified shape is Founder-only authorization (no role, model, or operator may self-assign), a bounded work item with a 14-day calendar ceiling as a backstop, the durable authorization and lifecycle fields that make the policy independently verifiable from the record, and `permanent_binding_effect: none` on every assignment. That assignment is not a registry lane, is not standing binding, and is not accepted by `resolveSeat` as lane authority.

A temporary task assignment is honored on the **governed Phase 4 dispatch path**, not in the registry: the command's `authorization_ref` (journal element 7) resolves to the assignment record, whose granted scope must cover the observed provider, model, and execution surface under contract §5.3. Absent a resolvable, unexpired assignment, the dispatch fails closed.

The contract's own words at §5.3, read at the base SHA, are the mechanism: `completed` requires that `authorization_ref` "**resolves** to an authorization that exists, is valid, and is applicable to the command's repository, scope, and run, whose granted scope **covers** the observed `(provider, model, execution_surface)`. Coverage may be by set or roster and need not enumerate the intended-to-observed pair — but **silence is not coverage** ... Matching intended and observed identities do not exempt a command from this test."

**This plan builds none of that dispatch path.** Element 7 resolution, coverage evaluation, and the Phase 4 dispatch surface are owned by the journal and dispatch lanes. Seat Registry V1 states the relationship and stops at the boundary.

---

## 4. Dispatch policy (ruling 7.2/D, retry and failover semantics)

Retries and lane failovers do not create new journal event vocabulary and are not hidden redispatches inside an existing command record.

1. **Each retry or failover attempt is a distinct governed command record**: a new `command_id` under the existing eleven-element contract.
2. **Correlation runs through the existing bindings only** — room, run, execution (element 2), repository and governed scope (element 5), and the governing authorization (element 7). **No existing journal element is repurposed to create an explicit retry-lineage relation.** If implementation proves such a relation necessary, that returns as a separate contract-amendment proposal.

Retry and failover remain new `command_id` records. Do not add a journal element and do not repurpose element 10 `evidence_refs` as parent lineage. Correlation stays room, run, execution, repository/scope, and authorization.

No parent pointer, new journal field, governed `HO-*` artifact, or new authority mechanism is created for retry or failover; `attempt_id` is neither introduced nor substituted for `command_id` as retry or failover identity (Founder ruling, §4.1 of the RESERVED ITEMS ruling, instruction 16).
3. **Each `command_id` may be dispatched at most once.** The contract's own ordering invariant already enforces it: "`dispatched` at most once, only after `journaled`".
4. **Retries are bounded at two**, per `DEC-20260716-02` item 5: "no more than two per deployment before stepping to the next tier", and each retry is logged with its reason. Item 5 is the sole source of this cap; no other decision is cited for it (r4 carried no other citation for it at the drafting base, and none is added). Its scope — per deployment, within one execution — is stated in §4.1 as ruled.
5. **No silent third attempt, hidden redispatch, parallel outcome vocabulary, or unjournaled failover is authorized.**
6. Tier-stepping never crosses a data-class boundary to preserve availability (`DEC-20260716-02` item 5). A fallback exists for availability continuity only and can never independently issue a role's final high-impact recommendation.
7. **Failover triggers are exactly `DEC-20260720-03` item 4's lists.** ELIGIBLE — the only conditions that may step to the next lawful lane: provider timeout after the approved attempt policy; provider 5xx or declared outage; quota/rate-limit exhaustion; temporary model unavailability. INELIGIBLE — these must NOT invoke failover: a disliked answer; disagreement with the primary; a lower price preference; routing experimentation; a prompt-quality failure; a policy refusal. No bare failure count is a trigger. A data-boundary condition recorded on a lane's `limits` (the `builder` large-fallback lane, §2.5.3) is initial eligibility and route selection at assignment time, not a failover trigger, and does not widen the ELIGIBLE list.

`DispatchOutcome` kinds map **totally** onto the contract §5 closed vocabulary, as r3 C12 had it. The §5 closed set for command records, read at the base SHA, is `journaled`, `identity_bound`, `dispatched`, then exactly one of `completed` | `failed` | `unresolved`, and only after `unresolved`, `resolved`.

```ts
export const FAILOVER_ELIGIBLE_TRIGGERS = [
  'provider timeout after the approved attempt policy',
  'provider 5xx or declared outage',
  'quota/rate-limit exhaustion',
  'temporary model unavailability',
] as const;   // DEC-20260720-03 item 4, ELIGIBLE — the only conditions that may step to the fallback
export const FAILOVER_INELIGIBLE_TRIGGERS = [
  'a disliked answer', 'disagreement with the primary', 'a lower price preference',
  'routing experimentation', 'a prompt-quality failure', 'a policy refusal',
] as const;   // DEC-20260720-03 item 4, INELIGIBLE — must NOT invoke the fallback
export interface DispatchPolicyV1 {
  readonly transport_retries_max: 2;   // DEC-20260716-02 item 5 — sole source; per deployment, within one execution (§4.1)
  readonly lane_failovers_max: 1;      // primary -> next lawful lane, ONCE
  readonly failover_eligible_triggers: typeof FAILOVER_ELIGIBLE_TRIGGERS;
  readonly failover_ineligible_triggers: typeof FAILOVER_INELIGIBLE_TRIGGERS;
}
export type DispatchOutcome =
  | { kind: 'seat_completed';  lane_label: string }              // -> §5 `completed`
  | { kind: 'seat_failed';     last_error_class: 'shed'|'auth'|'transport'|'other' }  // -> §5 `failed`; only on a determinate failure or affirmative no-effect evidence (§4.2)
  | { kind: 'seat_unresolved'; reason: string };                 // -> §5 `unresolved`; the transport-uncertainty case (§4.2)
```

The kind names stay prefixed because `completed` is taken by §5 with different membership; renaming avoids a homonym, and the mapping above is the whole relationship. `failed_over` is **not** an outcome kind and **not** a new event: a failover produces a new `command_id`, per item 1 above. Nothing in this policy adds a §5 event, and any change to that vocabulary is a contract amendment.

### 4.1 Retry budget — scope and reset boundary, as ruled

Incorporated from the Founder clarification on P19, without alternatives:

- `transport_retries_max: 2` is a **per-deployment retry budget within one logical execution**.
- The retry **family** is keyed by the existing correlation tuple: room, run, execution, repository/scope, and governing authorization.
- Within that family, the counter is **partitioned by the resolved seat and exact deployment identity**. For V1 that identity comprises the existing `seat_id`, `lane_label`, `surface_id`, `model_id`, and `mode` values of the resolved lane. This is a **derived dispatch-policy key** — not a new journal element, parent pointer, lineage relation, correlation field, or authority artifact.
- **The initial dispatch does not consume the retry counter.** Each additional dispatch to the same deployment after a retry-eligible transport failure consumes one retry. Two retries exhaust that deployment's budget within the execution.
- A **lawful failover** retains the original room, run, execution, repository/scope, and authorization bindings; receives a new `command_id`; changes the resolved deployment bucket; and begins with zero retries consumed for the new deployment.
- **A lawful failover must change `surface_id` or `model_id`.** A change of `mode` or `lane_label` alone is not a lawful failover and does not open a new retry budget.
- **An exhausted deployment's counter never resets within that execution.** Returning to that deployment does not restore its retry budget.
- A `completed` outcome **closes** the execution; it does not reset or reopen its counters. Only a genuinely new, separately authorized execution begins a new retry family. **A retry or failover must not be relabeled as a new execution to evade the cap. A new `command_id` alone never resets the counter.**
- An `unknown_outcome` continues to prohibit retry or failover until reconciliation resolves the uncertainty (§4.2).
- No `attempt_id`, parent pointer, journal element, new correlation field, or `evidence_refs` lineage relation is added or substituted.

```ts
export interface RetryFamilyKey {          // the existing correlation tuple — a derived key, never a journal element
  readonly room: string; readonly run: string; readonly execution: string;
  readonly repository_scope: string; readonly authorization: string;
}
export interface DeploymentBucket {        // exact deployment identity within the family — derived, never persisted as a journal element
  readonly seat_id: SeatId; readonly lane_label: string; readonly surface_id: string;
  readonly model_id: string; readonly mode: string | null;
}
export interface RetryBudgetState {
  readonly family: RetryFamilyKey;
  readonly consumed: Readonly<Record<string, 0|1|2>>;   // keyed by a canonical serialization of DeploymentBucket
  readonly exhausted: readonly string[];                // bucket keys at 2; never removed within the execution
  readonly failovers_used: 0|1;
  readonly pending_unknown_outcome: boolean;            // §4.2: blocks retry and failover until reconciled
  readonly closed: boolean;                             // set by `completed`; nothing reopens it
}
export type RetryBudgetEvent =
  | { kind: 'initial_dispatch';  bucket: DeploymentBucket }
  | { kind: 'transport_failure'; bucket: DeploymentBucket; trigger: string }
  | { kind: 'retry_request';     bucket: DeploymentBucket }
  | { kind: 'failover_request';  from: DeploymentBucket; to: DeploymentBucket; trigger: string }
  | { kind: 'unknown_outcome' } | { kind: 'reconciled' } | { kind: 'completed' };
export interface RetryBudgetDecision { readonly state: RetryBudgetState; readonly allowed: boolean; readonly reason: string }
export function retryBudgetTransition(state: RetryBudgetState, event: RetryBudgetEvent): RetryBudgetDecision;  // pure and deterministic; no I/O, no dispatch, no provider access; test 12
```

The transition function is data over data: it dispatches nothing, contacts no provider, and writes no journal element. It exists so that test 12 can prove the ruled semantics without crossing §3.2's boundary.

### 4.2 Transport uncertainty, as ruled

For a transport failure without affirmative evidence that the attempted command had no effect, two layers are named, each once:

- the **Seat Registry / result state** is `unresolved` (surfaced as `DispatchOutcome` kind `seat_unresolved`, which maps to the contract §5 `unresolved` event — the journal's own closed vocabulary, unamended: `unresolved`, then `resolved` on reconciliation);
- internally, the Seat Registry / dispatch-policy layer classifies this condition as `unknown_outcome` (§4.1's `RetryBudgetEvent`). **`unknown_outcome` is an internal Seat Registry / dispatch-policy classification only. It is explicitly not a journal event, outcome, field, or vocabulary member, and this plan proposes no journal contract amendment to add one.**

Neither may become `failed` without affirmative evidence that the attempted command had no effect. **Retry is prohibited until reconciliation resolves the internal `unknown_outcome` classification**, and so is failover (§4.1). The contract's own §5 rule is the same fact from the journal side, using the journal's own unamended term: "`unresolved` blocks any success claim, any retry, and any representation of completion until `resolved`." This plan adds no §5 event, no journal field, and no element to carry either term.

---

## 5. Journal relationship (ruling 7.2/D)

### 5.1 The journal owns observed execution identity

Seat Registry V1 consumes the journal's existing role identity and observed execution identity contracts **as-is**. Observed provider, model, and execution surface remain command-journal truth and must not be restated as independent Seat Registry truth.

The contract's element 4 is the controlling text: `intended_provider`, `intended_model`, `intended_surface` on `journaled`; `provider`, `model`, `execution_surface` on `dispatched`; "intent labeled as intent pre-dispatch; the observed actual identity is recorded on `dispatched`, is authoritative for this element, and is never backfilled from configuration."

The registry supplies **intended** routing identity for a lane. It never writes, mirrors, or re-asserts the observed values.

### 5.2 No `seat_id` element in V1

No `seat_id` command-journal element and no contract amendment is authorized in V1. Under ruling A the existing journal `role_id` already carries canonical seat identity: element 3 is `actor_id`, `role_id`, "registry-valid values only", and the seat IDs are exactly registry-valid role IDs.

The expected outcome is that no separate `seat_id` amendment will be necessary. That is an expectation, not a permanent prohibition: if later implementation evidence demonstrates that `role_id` is insufficient, a separate contract-amendment proposal may be brought for Founder ruling. `DEC-20260827-01` Section 11 records the same open question from the contract side: "a deferred amendment question (seat identity as an element-3 refinement) exists and is not resolved here." (Reverified at FounderOS `4ab38e7eccb5a6f488984877651f250121be26cc`: `DEC-20260827-01` Section 11, lines 555–558, text matching.) This plan proposes no amendment and drafts none.

### 5.3 Contract hash pins live in the registry

Seat contract sha256 pins are `SeatRegistrationV1.contract_sha256`, verified by r4 test 3, which recomputes the hash from the file. They are **not attribution fields and not journal elements** (ruling 7.1, ruling 7.2/D).

**The command-journal contract's status, restated.** r3 calls the contract "ratified" at its lines 7, 40, 203 and 283 while the contract's own header reads `Status: proposed`. Both are accurate about different things, and r4 states the ratification with its record: the contract is ratified at v0.17 under **Tier-2 round 5 PASS-WITH-ADVISORIES (`gemini-3.1-pro`) at exact head `b92889e6b16e9e4ca221247458cfd39ea46fc9e2`**, and **merged to Build Room `main` at `6ff0ee2893a22f59700f21ed825e8b974c3c3b9f`** with a SHA-named Founder merge authorization and post-merge verification passing against the merge SHA. Recorded at FounderOS `DEC-20260827-01` Section 11, PR #326 — reverified at `4ab38e7eccb5a6f488984877651f250121be26cc` (Section 11, lines 528–538: v0.17, merge SHA `6ff0ee2893a22f59700f21ed825e8b974c3c3b9f`, Tier-2 round 5 PASS-WITH-ADVISORIES (`gemini-3.1-pro`) at exact head `b92889e6b16e9e4ca221247458cfd39ea46fc9e2`, SHA-named Founder merge authorization, post-merge verification, and the contract pin, all present and matching). Contract pin: sha256 `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52`, recomputed from `docs/command-journal-contract.md` at Build Room `abd69671cad67b496e9915da977277b2145d56e5` (the r5 drafting base) and matching both Section 11's pin and r4's recomputation at `5c5fc25…`.

r3 line 26's flag stands: the contract's header field still reads `Status: proposed`, and whether that needs a record-keeping bump or is the contract's own convention is a question for the DEC. **The contract is not edited by this plan**, and its no-touch status is restated at §8.

---

## 6. Attribution (ruling 7.1)

**No `Seat-Id:` trailer is authorized.** r3 C13 is deleted, along with r3 §3.8's trailer proposal and r3 §6's "no new attribution trailer beyond Seat-Id" clause.

Because the canonical Seat Registry V1 identity is the existing role ID, the existing `Role-Id:` attribution field carries seat accountability. The three-field block is unchanged (`DEC-20260718-05` clause 6): `Actor-Id`, `Role-Id`, `Execution-Surface`. `Role-Id` takes a value from the canonical role registry, "no exceptions, no extra-registry values", and `founder` is not a valid `Role-Id`.

No `DEC-20260718-05` attribution amendment and no attribution-shape checker change are required for Seat Registry V1. Display names and contract hashes are not attribution fields.

The 72-character bound is unchanged and unaffected: each attribution trailer source line must be 72 characters or fewer, leaving a maximum `Actor-Id` value length of 62 characters (Founder ruling of 2026-08-30, recorded at decision-log v4.45). r4 proposes no trailer, so it consumes none of that budget.

---

## 7. CLI

Seat Registry V1 **does not add a `--seat` CLI flag** and does not otherwise enlarge the Founder-fixed CLI authority surface. r3 §3.8 is deleted as written, and r3 test 11 with it.

Seat resolution belongs on the **governed Phase 4 dispatch path at the control plane**. The CLI may display already-authorized truthful information where permitted, but it does not originate seat authority or a new dispatch authority.

The CLI's five verbs are untouched. `DEC-20260815-13` fixes the surface as `enroll`, `status`, `doctor`, `providers`, `tail`, records that "**No command originates an authority-bearing act.** The CLI is a front end to the Gateway's policy, never a second door around it", and states that a published command surface is a compatibility commitment. Seat Registry V1 adds no verb, removes no verb, and changes no verb's behavior.

---

## 8. Sequencing (ruling 7.3)

Seat Registry V1 may proceed in parallel with the command-journal foundation. The lanes must remain file- and authority-isolated.

The Seat Registry lane may not modify, verbatim from ruling 7.3:

> - the ratified command-journal contract;
> - journal-foundation files owned by the concurrent journal lane;
> - `packages/control-plane/src/migrations.ts` for as long as PR 2b is open;
> - lifecycle vocabulary;
> - counted-run surfaces;
> - MadBridge or TUI files;
> - or any other prohibited scope named by the final plan.

> If an actual dependency or file collision emerges, the affected Seat Registry work stops at that dependency rather than silently crossing the lane boundary.

**Observed state at the r4 head, recorded and not substituted for the rule.** `packages/control-plane/src/migrations.ts` exists at Build Room `abd69671cad67b496e9915da977277b2145d56e5` (re-checked for r5). As of r4's observation on 2026-09-02, PR #15 (this filing PR) is the only open pull request in `MADVenturesLLC/founder-os-build-room`; the most recent merges are #12 (PR 2a, journal serialization contracts and golden vectors), #13 and #14. **PR 2b is not open yet.** The no-touch condition binds whenever it is open, and the builder re-checks the state at the moment work starts rather than relying on this line.

Prohibited scope named by this plan, in addition to the list above: `madventures-tui` (Task 44 lane), FounderOS doctrine, the TUI adapter registry, `DEC-20260815-11` lifecycle vocabulary, the Tier-2 verdict enum ratified by `DEC-20260826-01` and gated by `DEC-20260814-02`, contract §5 event vocabulary, and the `DEC-20260726-01` council roster names.

---

## 9. Tests

Write first. The mutation-evidence rule applies to every guard: each guard is proven RED by its own targeted mutation before the suite is claimed meaningful.

### 9.1 The suite

1. **Registry shape.** Set-equality against `RATIFIED_SEATS`; each `seat_id` appears exactly once; the structure is deep-frozen and a mutation attempt is detected.
2. **Display-name table.** `registration.display_name === DISPLAY_NAMES[seat_id]` for all four; the four names are distinct; no name appears as a `seat_id`, a `Role-Id` value, or an `Execution-Surface` value anywhere in the package.
3. **Contract integrity.** Each seat contract file exists; its SHA-256 equals the pin, recomputed live; its content contains its own `seat_id` and display name.
4. **Per-run model distinctness (replaces r3's provider-org check) — asserted over package-held data, never by dispatch.** The test is an assignment-time check over the vendored roster fixture (test 14): for any candidate pairing of an implementation lane with a review lane, the reviewing `model_id` must differ from the implementation `model_id` of the same run, and the reviewing `model_id` must be on the `DEC-20260815-05` Tier-2 roster as the fixture records it. The same predicate is what the dispatch path re-asserts at review-open, as `DEC-20260815-05` clause 1 requires; this test proves the predicate, not the dispatch. This is a **model** check, not a provider-organization check: PRD row 13 and `DEC-20260815-04` both state the requirement in terms of the model, and `DEC-20260815-04` records that the roster "remains a per-run property to be asserted, not a property this naming act establishes". The separate `DEC-20260716-02` item 6 constraint (once bound, the reviewer's primary provider must differ from the builder's primary provider) is recorded as a standing constraint on future binding decisions; neither role is bound in V1, so it is not a V1 assertion.
5. **Surface resolution.** Every non-null `default_surface` and every lane `surface_id` is a registered `surface_id` in the execution-surface registry, **and** the seat's `seat_id` appears in that surface's roles-permitted table (`DEC-20260807-01` §3.3). The surface registry is read from the vendored fixture (test 14), never from another repository at run time. A seat with no standing Eligible lane has `default_surface === null` and passes by that branch — in V1, all four seats (§2.6). The identifier `CONSUMED_SURFACES` appears nowhere in the package; a test asserts its absence so it cannot be reintroduced.
6. **Registry membership.** Every `seat_id` is a member of the 30-role registry at `/04-agents/role-registry.md` (`DEC-20260812-03`), read from the vendored role-registry fixture (test 14). A `seat_id` outside those thirty is rejected. A `seat_id` whose `activation_status` is `deferred` is rejected: the registry holds thirty roles and the assignable set is twenty-nine, the one exclusion being `investment-acquisition-lead`. Negative cases assert rejection of `operator` (no such role, and the homonym that forced r3's placeholder), `founder` (not a valid `Role-Id` under `DEC-20260718-05`), `Hephaestus` (a display name, never an authority identifier), any retired non-registry label, and `investment-acquisition-lead` (in the registry's thirty, excluded from the assignable twenty-nine).
7. **Vocabulary namespace (r3 test 6, retained).** No string in `SEAT_TERMINAL_STATUSES` (§2.7) collides with any ratified closed vocabulary: `DEC-20260815-11` lifecycle states, the Tier-2 verdict enum `{PASS, PASS-WITH-ADVISORIES, FAIL}` ratified by `DEC-20260826-01` (gated by `DEC-20260814-02`), contract v0.17 §5 event vocabulary, and the `DEC-20260726-01` council roster names (Augustus, Plato, Socrates, Turing, Marcus).
8. **Binding status is mirrored, never assigned.** Every lane's `binding_status` is one of the nine `DEC-20260716-02` item-2 values, and equals the `portfolio_classification` value recorded on that model's own entry in the vendored model-registry fixture (test 14) — that is the registry field which holds the item-2 ladder value (e.g. `portfolio_classification: approved-binding   # per DEC-20260716-02 §3 classification ladder`); the registry has no model-level `binding_status` field. A lane whose model entry carries no `portfolio_classification` fails; the test cannot be satisfied by a default.
9. **`resolveSeat` fail-closed — every case is a `RefusedSeat` with its class and reason (§3).** Unknown id → `unknown_seat`; a `seat_id` outside the thirty → `seat_outside_registry`; a tampered contract → `contract_hash_mismatch` naming both hashes; every lane below `approved-binding` → `lane_below_approved_binding` with its status named; an `approved-binding` lane that requires a per-task or per-run Founder act, the Founder's manual per-task model selection (`architect` primary), or per-invocation preconditions (`architect` bounded reconciliation) → `lane_not_standing` with the requirement named; a seat with an empty routing set → `routing_set_empty` with its absence reason and never another seat's lane; a temporary task assignment offered through `presented_authority` → `temporary_task_assignment_not_lane_authority`. Each of the four seats is exercised, `architect` included (AC10).
10. **Data eligibility and carried conditions.** No lane whose `provider_class` is `NOT_RECORDED` is eligible for internal work; no P4 lane serves internal work; a P3 lane is eligible for internal work only where the applicable standing Founder approval is recorded in the lane's `conditions` (§2.7). The byte-comparison half names its sources, strings and lanes exactly: (a) the `grok-build` conditions — the two `DEC-20260815-04` "Conditions carried by two of the five" bullets and the `DEC-20260716-02` amendment `grok-build` item (lines 152–160), compared on the `builder` `large` lane and the `independent-reviewer` `grok-4.5` tier-2 lane; (b) the `hermes-local-code` conditions — the two `DEC-20260815-04` bullets, compared on the `builder` `Hermes local` lane; (c) the `antigravity` conditions — the three execution-surface-registry lines (:311–:316) and, on the `independent-reviewer` `gemini-3.1-pro` tier-2 lane, `DEC-20260815-05` clause 3, compared on the `architect` `primary` lane and that tier-2 lane; (d) the `architect` bounded-reconciliation preconditions — `DEC-20260807-01` lines 446–452, compared on that lane. The `glm-5.2` condition (`DEC-20260716-02` amendment lines 141–144) is compared on the `builder` `cursor-secondary` `absent_lanes` entry's `reason`, because `glm-5.2` has no lane (§2.4.2); it is carried, not routed. Each comparison reads the string from the vendored fixture of its named source (test 14), and each string is complete, not truncated or composited.
11. **`toAttentionState`.** Full mapping table over `SEAT_TERMINAL_STATUSES[seat] ∪ {null}` for all four seats, into the declared `AttentionState` (§2.7); a status outside the seat's set is rejected, not mapped.
12. **Dispatch policy — data and a pure transition function; no dispatch, no provider.** (i) The exported `DispatchPolicyV1` constants and the outcome-to-§5 mapping as data: cap value 2; at most one failover; `failover_eligible_triggers` equals `DEC-20260720-03` item 4's four ELIGIBLE triggers and `failover_ineligible_triggers` its six INELIGIBLE ones; each ineligible trigger does not fail over; the three outcome kinds map totally onto §5, with a test that fails if a fourth kind is added without a mapping. (ii) `retryBudgetTransition` (§4.1), exercised as a pure deterministic state machine with no live dispatch and no provider access, asserting each of: (1) the correlation family; (2) the deployment bucket; (3) the free initial dispatch; (4) the two-retry ceiling; (5) deployment exhaustion; (6) the lawful-failover requirements — bindings retained, new `command_id`, bucket changed, zero retries consumed for the new deployment; (7) the `mode`/`lane_label` anti-evasion rule; (8) no reset within an execution, including on return to an exhausted deployment and after `completed`; (9) no evasion of the cap through a new `command_id` alone or a relabeled execution; (10) `unknown_outcome` blocks **both** retry and failover until `reconciled`. (iii) Transport uncertainty (§4.2): without affirmative no-effect evidence the result is `seat_unresolved`, never `seat_failed`. (iv) A retry or failover produces a **new** `command_id` and never a second dispatch on an existing one; no element outside the correlation set is written as lineage; no `attempt_id` is introduced or substituted as retry/failover identity; no parent pointer, new journal element, or new correlation field is introduced.
13. **Handoff validator.** Over the declared `SeatHandoff` (§2.7): golden valid record; one test per missing field (`receives_from`, `produces`, `terminal_status`, `committed_sha`, `authorization_refs`); `terminal_status` not in `SEAT_TERMINAL_STATUSES[seat_id]` (wrong status-for-seat); `committed_sha` not 40 hex (short SHA); empty `authorization_refs` — all reject, each naming the offending field. `authorization_refs` are references only: shape-checked, never adjudicated.
14. **Fixture integrity (doctrine pin).** The package vendors, from FounderOS at the doctrine pin `4ab38e7eccb5a6f488984877651f250121be26cc`, these fixtures with their source paths and SHA-256 values as captured at that commit: `04-agents/role-registry.md` (7f9ff4142d43ad3e3d3b6cd64f8dadaa3bb058d3d0cb598070156972f0d2edf9), `04-agents/model-registry.md` (7e45438a5c17f6765a6842df6e17bd0d1c0898576839ae1e66c6dd14de03fe0b), `04-agents/execution-surface-registry.md` (4054e58dd0f5e053436cfacfa09ed779a668a822cfe435f4a4038cd16417b060), `07-decisions/DEC-20260815-05-reviewer-eligibility-roster.md` (97f1ab0ab1f82a216e9b3adead5e35a5c9b2f8b0c9ed3b05767c3fdc66c2e4bc), and `00-system/scripts/tier2-shape-check.sh` (95d498299f61ad4695b899543dfd7f2a35b658b5d6b5b3c78d167597a05415ad), plus the `DEC-20260716-02`, `DEC-20260815-04` and `DEC-20260807-01` files that test 10 compares against. The test recomputes each fixture's SHA-256 and asserts it equals the recorded value and that the recorded doctrine pin is the full 40-character `4ab38e7eccb5a6f488984877651f250121be26cc`. Tests 4, 5, 6, 8 and 10 read only these fixtures; no test reads another repository at run time (AC7).

No test in this suite makes a live provider call, dispatches a command, or reads another repository at run time.

### 9.2 Acceptance criteria

- **AC1** Every §9.1 test exists, passes three times consecutively, and every guard is mutation-proven RED.
- **AC2** `resolveSeat('independent-reviewer')` returns a `RefusedSeat` carrying the Argus registration with a live-recomputed contract-hash match and populated per-lane readiness, and **refuses** every lane as a standing route (`lane_not_standing`) with the per-run Founder act named (§2.5.4, §3).
- **AC3** `resolveSeat('researcher')` refuses with the §2.5.1 absence reason, and does not resolve to any other seat's lane.
- **AC4** `resolveSeat('builder')` refuses every lane as a standing route with the per-task authorization requirement named, and refuses a temporary task assignment offered as lane authority.
- **AC5** Handoff validator rejects every missing-field case by name.
- **AC6** Dispatch policy: ≤ 2 retries per deployment within one execution under the §4.1 family and bucket rules; at most one lawful failover, which must change `surface_id` or `model_id`; a new `command_id` per attempt and never a reset by a new `command_id` alone or a relabeled execution; failover only on the `DEC-20260720-03` item 4 ELIGIBLE triggers and never on an INELIGIBLE one; the Seat Registry `unresolved` state (journal §5 vocabulary unamended) with the internal `unknown_outcome` dispatch-policy classification (not a journal term) on transport uncertainty, retry and failover blocked until reconciliation; total §5 mapping; no silent third attempt; no `attempt_id`.
- **AC7** Zero changes outside the seat-registry package (including its vendored fixtures, test 14), its seat-contract directory, and `docs/`. No CLI file is touched. No file on the §8 no-touch list is touched. No test reads another repository at run time.
- **AC8** The repository suite is still green. **Baseline measured at `5c5fc25`, not asserted:** `npm test` (credential-free acceptance-criteria suite, Node 22, `TMPDIR=/tmp/br`) reports **659 tests, 229 suites, 659 pass, 0 fail, 0 skipped, 0 todo**, exit 0. The r3 figure of "618-baseline" is superseded by this measurement. The storage suite is separate and requires `TEST_DATABASE_URL`.
- **AC9** No journal contract amendment in V1, and no `seat_id` element proposed or drafted.
- **AC10** `resolveSeat('architect')` refuses every lane as a standing route: the primary with the Founder's manual per-task model selection requirement named (§2.4.2 `antigravity` conditions), and the bounded-reconciliation lane with its `DEC-20260807-01` preconditions named (§2.5.2, §3.1).

---

## 10. Prohibited, deferred, and later IDs

### 10.1 Prohibited (r3 §6, carried forward and corrected)

No TUI repository changes. No Task 44 references. No new lifecycle events or states. No contract §5 vocabulary changes. No journal contract amendment in V1. **No new attribution trailer at all** (r3's "beyond Seat-Id" carve-out is deleted with the trailer). No `--seat` flag and no CLI change. No deployment, activation, spend, credentials, or providers. No live provider calls in tests. No counted-run interaction. No policy-engine binding beyond exported data (V1.1). No web UI. No merge by builder. No Hermes profile configuration pasted into the registry.

### 10.2 Deferred, not V1 (r3 §8, carried forward)

Gateway-zone authority enforcement (V1.1) · worktree-per-seat (own DEC) · ring-buffer seq and rehydration (own DEC) · command-palette authority tiers (TUI-side) · Temporal-class durable runs (Lab study first) · dynamic seats · per-seat memory · skins · web UI · more than four seats · automated Hermes-suite sync · a journal `seat_id` amendment (post-foundation, only on later implementation evidence).

### 10.3 Later IDs, not V1

These rulings close V1. They do not freeze the OS against later IDs. A later Founder ruling may, without amending this identity model:

1. Add more seats by naming additional existing canonical role IDs into the registry.
2. Add a second Lab assignment over an existing role, recorded in study records, not as a new registry seat class.
3. Enable additional providers or surfaces by the required naming act.
4. Register additional model IDs with a status from `DEC-20260716-02` item 2, provider class, and data eligibility.
5. Grant standing P3 approvals for specific eligible lanes.
6. Register Hermes-suite routing into doctrine, after which a later registry revision derives from the updated registries.

**None of those acts is r4 work. None of them is implied by populating a schema.**

Out of V1, named so no reader mistakes silence for eligibility: **Hermes-suite routing**, **`gemini-direct`**, **Nous**, **Z.ai**, **Ollama Cloud**, **MiniMax**. Providers appearing in prior planning or Hermes-suite material but not presently eligible for Build Room use are out of V1 unless separately enabled by the required Founder naming act and reflected in the controlling registries. Making Hermes-suite providers or unregistered model IDs eligible for governed Build Room routing requires a separate Founder naming and registration act; these rulings are not that act.

---

## 11. Entry gate

Before any Seat Registry DEC is drafted, and before any file changes:

1. **A new complete-corpus bare PASS from the decision compiler** over this plan. The required-corpus floor is `DEC-20260718-03` clause 3 as it reads: all `DEC-*.md`, `decision-log.md`, `decision-id-reservations.md` always required (Tier 1); named baseline/contract docs required by default for technical rulings (Tier 2); ruling-cited sources beyond that (Tier 3). Changing the Tier list requires founder approval, so this plan neither narrows nor extends that floor. A qualified or partial gate is not a PASS and this plan does not proceed on one; Pass 3 (2026-09-02) returned `GATE: FAIL` and was regenerated as Pass 3R, and r5 is the correction draft, not a PASS. This pass runs from the Founder's side; the plan lands in the repository first so the compiler can resolve its hash from a repo and the DEC can cite it (ruling Venue, r4-instruction 20 and 21). The separately authorized role-registry vocabulary reconciliation (§2.3) must also receive the new complete-corpus bare PASS before any Seat Registry DEC proceeds.
2. A ratified DEC naming this exact plan file and its SHA-256.
3. Founder authorization naming the exact then-current Build Room `main` SHA as the implementation base, and an isolated branch from that SHA. No SHA in this plan is that base: `5c5fc25beaf5e3311f7664ab2c6fbae833d6f760` is the AC8 measurement pin only, `abd69671cad67b496e9915da977277b2145d56e5` is the r5 drafting base only, and neither they nor any later Build Room `main` SHA is a Phase 4 implementation base by virtue of appearing here.
4. Confirmation of the §8 no-touch list against live repository state at the moment work starts, including whether PR 2b is open.
5. Confirmation that §10.1 is unchanged.
6. The doctrine pin `4ab38e7eccb5a6f488984877651f250121be26cc` reconfirmed as the FounderOS commit the plan was derived from, or a new Founder disposition for a later pin; the fixtures of test 14 are captured at that pin.

Missing or mismatched: **STOP**, report `BLOCKED_MISSING_AUTHORIZATION`.

---

## 12. Implementation sequence

1. Branch from the authorized base SHA.
2. Vocabulary, identity, and attention mapping; tests 1, 2, 6, 7, 11 RED to GREEN.
3. Seat contracts (four files) and hash pins; test 3.
4. Vendored fixtures at the doctrine pin (test 14); registry and derived lane data; tests 5, 8, 10.
5. `resolve.ts` and readiness probes; tests 4, 9.
6. `dispatch-policy.ts`; test 12.
7. `handoff.ts`; test 13.
8. Full suite three consecutive times green; record exact commands and verbatim output.
9. Build report; draft PR; STOP for the review chain (Tier-2, CodeRabbit, Founder SHA-named authorization). No merge by builder.

There is no CLI step. r3's step 8 is deleted with r3 §3.8.

---

## 13. Completion gate

The closure record must contain: the merge commit SHA; the exact reviewed head with its Tier-2 marker, written with the **attestation id** and not the `model_id` (§2.5.4); the SHA-named Founder merge authorization; full three-times suite evidence, verbatim, with full 64-character hashes; the `resolveSeat` refusal transcripts for AC2, AC3, and AC4; the mutation-evidence table (guard, mutation, RED proof); the doctrine pin `4ab38e7eccb5a6f488984877651f250121be26cc` in full with the test-14 fixture-integrity evidence; and the new complete-corpus bare PASS (§11 item 1). Any missing element means not closed.

---

## 14. What this does not prove

- Behavioral authority stays behavioral in V1. Only the V1.1 gateway slice makes any boundary technical.
- Readiness probes prove credentials, never capacity. Incident-proven.
- **Every seat fails closed in V1, `architect` included.** `architect` is the only seat with a lane at an approved binding on an eligible surface with a recorded provider class, but that lane is per-task by the Founder's manual model selection on `antigravity` and its bounded-reconciliation lane is per-invocation by its post-verdict preconditions; no seat holds a standing lane, and no seat holds per-run dispatch authority that this plan grants. That is the honest state of the corpus, not a defect in the derivation, and it is what ruling C-3 and C-5 anticipate.
- Provider classes recorded as `NOT_RECORDED` are exactly that. They are not P1 by inference from a provider's reputation or from another model's entry, and the DEC must close them before any such lane serves internal work.
- The registry records what the corpus establishes today. It confers nothing, and a later registry revision derives from the registries as they then stand.
- The compiler's r2 pass was PARTIAL; pass 3 over r4 returned `GATE: FAIL` and was regenerated as Pass 3R. r5 is the correction draft and proceeds only on a new complete-corpus bare PASS (§11).

---

**These rulings resolve planning choices only. They do not authorize Seat Registry implementation, deployment, activation, new providers, new credentials, new spend, counted runs, Lab activation, journal-contract changes, or merge.**
