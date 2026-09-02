# Seat Registry V1 — Implementation Plan, Revision 4 (Builder Handoff — Build Room)

**Status:** DRAFT r4 — derived from the Founder's FINAL RULING "Seat Registry V1 Reserved Items", issued 2026-09-01 22:20 ET and posted as the first comment on this filing PR. Nothing here is authorized to build. r4 is a planning document filed for compiler pass 3; it is not a DEC and it confers no authority.
**Supersedes:** `seat-registry-v1-implementation-plan-r3.md` (sha256 bbc71885f2db5f486ec750064c5ad346b5c03d3f48b30c3e920223eecdad7244), which is filed unmodified beside this file. r3 is not taken down and is not edited.
**Controlling ruling:** posted at `https://github.com/MADVenturesLLC/founder-os-build-room/pull/15#issuecomment-5503747619`, 2026-09-02T03:11:07Z, comment-body sha256 f58b5257c8e58c6356d51296b34e3a13c880844243a8096974028f6dbf615425 (exact stored body, CRLF, 17,216 bytes). Section references of the form "ruling A", "ruling C-3" point into that text.
**Produced:** 2026-09-02. Basis: full reads of every registry and decision cited below, at the FounderOS working tree, and of the ratified command-journal contract at the Build Room base SHA.
**Target repository:** `MADVenturesLLC/founder-os-build-room` (local `~/MADVenturesOPs/founder-os-build-room`)
**Base SHA:** `5c5fc25beaf5e3311f7664ab2c6fbae833d6f760`
**Freeze posture (ruling header):** a planning ruling on Build Room shipping work under the `DEC-20260814-03` Build Room exception. Not a governance change, not a roster change, not a role activation. No clause-4 exception is claimed.

**Derivation rule for this document.** Every routing fact below is read from a controlling registry or decision and carries its citation. No lane, model identifier, provider class, surface, or binding status is asserted, inferred from a nearby value, or carried forward from r3's Hermes-suite draft. Where the corpus establishes nothing, the row reads ABSENT with the reason.

**Named paths that do not exist at the base.** Required of every plan filed under `docs/planning/` by the Founder ruling of 2026-09-01 on path-audit scope. Measured against base SHA `5c5fc25beaf5e3311f7664ab2c6fbae833d6f760`, not asserted:

| Path named in this plan | State at the base | Why it is named |
|---|---|---|
| packages/seat-registry | **does not exist** | the deliverable package this plan proposes; it is created only after a ratified DEC and Founder authorization, which these rulings do not grant |
| contracts/seats/ | **does not exist** | the seat-contract directory this plan proposes, four files, one per seat |

Every other repository path this plan names exists at the base and was checked: `docs/command-journal-contract.md`, `packages/control-plane/src/migrations.ts`, `packages/gateway-cli`, and `scripts/path-audit.sh`. References of the form `00-system/...` and `/04-agents/...` are FounderOS paths, not Build Room paths, and are resolved against that repository.

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

| `seat_id` | Display name | Registry entry |
|---|---|---|
| `researcher` | Aletheia | role-registry §4 |
| `architect` | Daedalus | role-registry §2 |
| `builder` | Hephaestus | role-registry §3 |
| `independent-reviewer` | Argus | role-registry §6 |

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

`provider_class` is read from the model registry's `deployment_channel` field, never asserted. Where that field carries a value that is not a P1 through P5 class token, the class is **not recorded**, and the lane is unavailable for internal work under C-4. The registry states this device explicitly at the `gpt-5.6-luna` entry: `deployment_channel: verification-pending` is a "governance sentinel, not a P1-P5 provider class. `codex-founder-operated` describes the EXECUTION SURFACE (see surface_availability), not a verified provider retention posture; asserting it here would imply a boundary check that has not been run".

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
- the **role-level** `binding_status` field in the role registry, whose values are `active`, `approved`, `proposed`, `unassigned` (role-registry "How to read this registry").

`SeatRoutingLane` carries the model-level value. `SeatRegistrationV1` records the role-level value separately, as read.

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

and from the `DEC-20260807-01` surface-specific allowlist for `grok-build`:

> Every execution, public or internal, requires an exact task-scoped Founder authorization naming repository, data class, scope, and expiration/completion boundary — no standing routing authority exists until MP-1 activation. That authorization may permit public-class data immediately; internal or private-repository data requires the same authorization plus explicit disclosure until channel verification is recorded. Secrets, credentials, production data, personal data, and confidential-or-higher material remain excluded unless separately and exactly Founder-authorized.

**`glm-5.2`**, from the `DEC-20260807-01` surface-specific allowlist for `cursor`:

> `glm-5.2` is limited to public and ordinary-internal data through the existing P3/Z.ai approval; governance/doctrine, confidential-or-higher, secrets, credentials, personal data, and production data are prohibited. This does not replace or broaden its Deputy runtime binding.

`glm-5.2` has **no lawful Seat Registry V1 lane**: its only `builder` binding is `cursor-secondary-manual-task-scoped`, and `cursor` is not one of the five providers named eligible for the Build Room under `DEC-20260815-04`. Its condition is carried here because C-4 requires it carried accurately, not because a V1 row uses it. Its registered `deployment_channel` is `P3-zai-international`; the Deputy Chief of Staff primary binding under `DEC-20260717-02` and `DEC-20260801-01` is untouched by anything in this plan.

**`hermes-local-code`**, from `DEC-20260815-04`:

> - **`builder` only.** The registry permits no other role, and excludes `researcher` deliberately.
> - **May not issue a sole binding Tier-2 verdict**, and may not self-review, merge, deploy, or operate in production — `prohibited_actions`, ratified 2026-08-07. External transmission is denied by default.

### 2.5 Seat-to-lane derivation (C-5)

The seat-to-lane table is derived from the controlling registries and decisions, not designed by hand from the Hermes suite. The derivation basis per seat, exactly as C-5 names it:

| Seat | Derivation basis (C-5) | Sources actually read |
|---|---|---|
| `architect` | controlling Architect tier and binding decisions | `DEC-20260715-14` via role-registry §2 and the model registry; `DEC-20260716-02` item 7 (naming correction) |
| `builder` | controlling Build Room builder and work-size routing decisions | `DEC-20260807-01` work-size routing schedule and surface-specific allowlists; the model registry's per-model `builder` bindings |
| `researcher` | controlling researcher authority plus eligible registered routing candidates | role-registry §4; `DEC-20260721-04`; `DEC-20260812-04`; `DEC-20260807-01` §3.3 |
| `independent-reviewer` | controlling independent-review roster (`DEC-20260815-05`) and per-run distinctness requirements | `DEC-20260815-05`; `DEC-20260719-02` v1.1 via role-registry §6 and the model-registry Tier-2 reconciliation |

Each derived lane carries enough citation to reconstruct its provider, model, surface, binding status, provider class, and data eligibility. Where the controlling corpus establishes no lawful lane, the row reads ABSENT with the reason. **No fallback is invented to satisfy a schema.** V1 does not require every seat to have both a primary and a fallback route.

#### 2.5.1 `researcher` (Aletheia) — ABSENT, and that is a valid V1 outcome

| Field | Value | Citation |
|---|---|---|
| Standing Build Room lane | **ABSENT** | derived below |
| Reason | No registered Build Room execution surface permits `researcher` | `DEC-20260807-01` §3.3 roles-permitted table lists `researcher` for none of the six coding surfaces; `DEC-20260815-04` role-coverage table omits `researcher` entirely |
| Reason (Hermes) | The only registered Hermes surface in the Build Room permits `builder` only, and excludes `researcher` deliberately | execution-surface-registry `hermes-local-code`: `permitted_role_ids: [builder]`, "The `researcher` role is deliberately excluded"; `DEC-20260815-04` |
| Research surface | The Hermes full agent, a runtime research lane, not a registered Build Room execution surface | `DEC-20260812-04` item 1 |
| Model bindings | none | role-registry §4 `approved_bindings: []`; `DEC-20260812-04` item 2: "`approved_bindings` for the researcher role remain `[]`" |
| Role-level binding_status | `accountability-approved` (capability accountability only; model bindings unassigned) | role-registry §4; `DEC-20260721-04` |

Ruling C-5 states this outcome in advance: "Researcher is expected to have no lawful standing Build Room lane in V1 ... That absence is valid under this section, not a defect to fill." The registration records the seat with an empty routing set and a stated reason. It does not borrow a lane from another seat, and it does not invent one.

#### 2.5.2 `architect` (Daedalus)

| Lane | Provider | `surface_id` | `model_id` | `binding_status` (item-2) | `provider_class` | Internal-work eligibility |
|---|---|---|---|---|---|---|
| primary | google (`DEC-20260815-04`) | `antigravity` — registered; `architect` permitted (`DEC-20260807-01` §3.3) | `gemini-3.1-pro` — registered (model registry) | `approved-binding` — `portfolio_classification: approved-binding`; `role_id: architect`, `binding_class: primary`, `decision: DEC-20260715-14` (active) | **P1** — `deployment_channel: P1` (model registry) | **Eligible.** P1 is permitted for internal (`DEC-20260716-01` item 3) |
| bounded reconciliation | anthropic | `claude-code` — registered; `architect` permitted | `opus-4.7` — registered | `approved-binding` — `role_id: architect`, `binding_class: post-review-reconciliation-read-only`, `decision: DEC-20260807-01` | **P1** — `deployment_channel: P1-anthropic-first-party` | **Eligible**, within the binding class only |
| secondary | deepseek | **ABSENT** | `deepseek-v4-pro` (mode `thinking`) | `approved-binding` for the role, but unreachable | `azure-ai-foundry` (P2) for the fallback binding only | **ABSENT.** deepseek is not among the five eligible providers (`DEC-20260815-04`) and no registered Build Room surface hosts it. The model registry additionally records the secondary binding's implementation as "separately unauthorized" |
| advisor | xai | **ABSENT** | `grok-4.5` | `approved-binding` for the role (`binding_class: advisor`, `DEC-20260715-14`) | `deployment_channel: unverified` | **ABSENT.** `grok-build` permits `builder` and `independent-reviewer` only; `architect` fails the §3.3 roles-permitted check |
| fallback | deepseek | **ABSENT** | `deepseek-v4-pro` (mode `standard`) | `approved-binding` for the role, but unreachable | `azure-ai-foundry` — Data Zone United States (P2) | **ABSENT**, same reason as secondary |

The `post-review-reconciliation-read-only` binding carries its own constraint verbatim from the model registry: "Post-review reconciliation is read-only on the reviewed SHA. Any code edit is a new `builder` execution, produces a new SHA, and requires fresh verification and review. An execution that authored the code state cannot reconcile it as an independent post-review execution."

Role-level `binding_status` for `architect`: `approved` (role-registry §2).

#### 2.5.3 `builder` (Hephaestus)

Role-level `binding_status` for `builder`: **`unassigned`**, annotated in the role registry as "permanent binding", with `approved_bindings: []`, `proposed_bindings: []`, `implementation_observed_bindings: []`. `DEC-20260716-02` item 12 names `builder` among the fourteen roles that "receive no binding of any status by this decision". The model-level task-scoped bindings below therefore coexist with an unassigned permanent binding; both facts are recorded, neither is collapsed into the other.

| Lane (work size) | Provider | `surface_id` | `model_id` | `binding_status` (item-2) | `provider_class` | Internal-work eligibility |
|---|---|---|---|---|---|---|
| large | xai | `grok-build` — `builder` permitted | `grok-4.5` | `approved-binding`; `binding_class: large-implementation-primary-task-scoped`, `decision: DEC-20260807-01`, with `limits` requiring a Founder-authorized task-scoped assignment per task until MP-1 activation | **not established** — `deployment_channel: unverified` | **Unavailable for internal work by default.** Public-class only until xAI channel verification, or explicit internal-class disclosure authorization per task (§2.4.2) |
| large fallback | anthropic | `claude-code` — `builder` permitted | `sonnet-5` | `approved-binding`; `binding_class: large-implementation-fallback-task-scoped`, `decision: DEC-20260807-01`, `limits`: engaged only when the `grok-4.5` data boundary cannot be satisfied for the task | **P1** — `deployment_channel: P1` | **Eligible** |
| medium | anthropic | `claude-code` — `builder` permitted | `opus-4.7` | `approved-binding`; `binding_class: medium-work-primary`, `decision: DEC-20260807-01` | **P1** — `deployment_channel: P1-anthropic-first-party` | **Eligible** |
| light | anthropic | `claude-code` — `builder` permitted | `claude-haiku-4-5` | `approved-binding`; `binding_class: light-implementation-task-scoped`, `decision: DEC-20260807-01` | **not established** — `deployment_channel: verification-pending` | **Unavailable for internal work** until the channel is verified. The registry records that the source fetch returned HTTP 403 from the G2 environment and that "failure ≠ unavailability"; the field is pending, not denied |
| Codex complex / high-risk | openai | `codex` — `builder` permitted | `gpt-5.6-sol` | `approved-binding`; `binding_class: codex-complex-analysis-planning-and-surgical-fixes`, `decision: DEC-20260807-01`; `max` mode requires exact Founder authorization and a recorded reason | **not established** — `deployment_channel: codex-founder-operated`, a surface descriptor, not a P1–P5 class (§2.2) | **Unavailable for internal work** until a class is recorded. `data_class_boundary`: active data-boundary policy and exact task scope |
| Codex routine / bounded | openai | `codex` — `builder` permitted | `gpt-5.6-terra` | `approved-binding`; `binding_class: routine-verification-and-bounded-fixes`, `decision: DEC-20260807-01` | **not established** — same as above | **Unavailable for internal work** until a class is recorded |
| Hermes local | founder-operated-local | `hermes-local-code` — `builder` only | `deepseek-v4-flash` | `approved-binding`; `binding_class: hermes-local-code-current-model`, `decision: DEC-20260807-01` | **P5** — `deployment_channel: P5-founder-operated-local` | **Constrained to local-only.** `data_class_boundary`: "local-only; external transmission denied unless exactly Founder-authorized". Only a registered, Founder-approved local model may replace the selection, and the actual model is recorded per execution |
| Cursor primary / alternative / secondary | — | **ABSENT** | `grok-4.5` / `sonnet-5` / `glm-5.2` | recorded bindings exist | — | **ABSENT.** `cursor` is not one of the five providers named eligible for the Build Room (`DEC-20260815-04`), so no Cursor row is a V1 lane |

**No `builder` lane is an approved standing route.** Every row above is task-scoped, and `DEC-20260807-01` states the activation ladder explicitly: "Ratification authorizes implementation and the controlled pilot; it does not activate MP-1", with "MP-1 approved but inactive" as the ladder's first rung. `DEC-20260815-04` clause 4 is the same fact from the provider side: "**No provider is bound by this decision.** Selection is eligibility and ordering; binding a provider to a role is a separate Founder act." `resolveSeat` therefore fails closed for `builder` in V1 (§3.1).

#### 2.5.4 `independent-reviewer` (Argus)

Role-level `binding_status`: **`active`** (two-tier, `DEC-20260719-02` v1.1, role-registry §6).

**Tier 1** is `tool_id: coderabbit`, `binding_status: active`. It is a tool, not a model, not a provider, and not an execution surface. It is recorded on the registration as the Tier-1 review binding and is **not** a `SeatRoutingLane`.

**Tier 2** is a closed roster. `DEC-20260815-05` clause 1 extends it to Build Room reviews unchanged, and clause 2 states: "**No model is bound by this decision.** The roster is eligibility; actual binding per run is a separate Founder act (model-assignment governance)."

| Lane | Provider | `surface_id` | `model_id` | `Tier2-Reviewer-Id` | `binding_status` (item-2) | `provider_class` | Internal-work eligibility |
|---|---|---|---|---|---|---|---|
| tier-2 | google | `antigravity` — `independent-reviewer` permitted | `gemini-3.1-pro` | `gemini-3.1-pro` | `approved-binding`; `binding_class: tier-2`, `mode: invoked`, `decision: DEC-20260719-02` | **P1** | **Eligible** |
| tier-2 | openai | `codex` — permitted | `gpt-5.6-sol` | `chatgpt-5.6-sol` | `approved-binding`; `binding_class: tier-2-full-roster`, `mode: xhigh` | **not established** (§2.2) | Unavailable for internal work until a class is recorded |
| tier-2 | openai | `codex` — permitted | `gpt-5.6-terra` | `chatgpt-5.6-terra` | `approved-binding`; `binding_class: tier-2-full-roster`, `mode: high`, `decision: DEC-20260719-02` v1.1 (2026-08-15) | **not established** | Unavailable for internal work until a class is recorded |
| tier-2 | openai | `codex` — permitted | `gpt-5.6-luna` | `chatgpt-5.6-luna` | `approved-binding`; `binding_class: tier-2-full-roster`, `mode: invoked`, `decision: DEC-20260719-02` v1.1 | **not established** — `deployment_channel: verification-pending` | **Public-class only.** `data_class_boundary`: fail-closed pending provider verification; internal-class review material requires explicit, auditable per-invocation Founder authorization |
| tier-2 | xai | `grok-build` — permitted | `grok-4.5` | `grok-4.5` | `approved-binding`; `binding_class: tier-2`, `mode: invoked` | **not established** — `deployment_channel: unverified` | Public-class only by default (§2.4.2). "Same data-boundary rules apply to review material as to advisor material" |
| tier-2 via `claude-code` | anthropic | `claude-code` — permitted | **ABSENT** | — | — | — | **ABSENT.** No Anthropic model is on the Tier-2 roster: `opus-4.8` was removed 2026-08-15, founder-directed (`DEC-20260719-02` v1.1). The surface permits the role; the roster supplies no eligible model for it |
| restricted local | — | `hermes-local-code` | `hermes-4-14b`, `tencent-hy3` | — | restricted roster, non-binding | P5 | **ABSENT as a standing lane.** These provide paired, non-binding findings only and cannot independently satisfy the binding Tier-2 verdict on any artifact, absent the Founder's exact one-task / one-repository / one-committed-SHA local-only exception. `hermes-local-code` additionally permits `builder` only and lists "sole binding Tier-2 verdict" among its `prohibited_actions` |

Two live hazards are recorded on the registration rather than discovered at runtime:

1. **Attestation-id variance.** The `Tier2-Reviewer-Id` token the gate accepts is not the `model_id` for the three Codex models. `00-system/scripts/tier2-shape-check.sh` pins `REVIEWER_ROSTER_REGEX` to `gemini-3.1-pro|chatgpt-5.6-sol|chatgpt-5.6-terra|chatgpt-5.6-luna|grok-4.5`. A marker written with the `model_id` form fails the gate with "not on the founder-ratified roster" even though the model is genuinely on the roster. The registry records this as an open item for the Founder; V1 records both strings and never derives one from the other.
2. **A superseded denial.** `DEC-20260807-01`'s work-size schedule says of the `codex` / `gpt-5.6-terra` route: "not eligible for Tier-2". That was correct on 2026-08-07 and was **superseded** by the Founder's ratification of 2026-08-14, amended into `DEC-20260719-02` at v1.1 on 2026-08-15, which places the model on the Tier-2 full roster. The model registry carries the dated correction. r4 derives from the superseding record, not the superseded line.

This does not replace, weaken, or redefine Tier-2 review authority or its verdict vocabulary (ruling B). That vocabulary is the closed enum `{PASS, PASS-WITH-ADVISORIES, FAIL}` per the Founder ruling recorded at decision-log v4.36: "REQUEST-CHANGES and any other vocabulary is rejected."

### 2.6 Surfaces (C-6)

Every `default_surface` must be a registered `surface_id` from the FounderOS execution-surface registry, and the seat's role ID must appear in that surface's roles-permitted table (`DEC-20260807-01` §3.3). The complete table, as registered:

| Registered surface ID | Stable roles permitted to execute via the surface |
|---|---|
| `claude-code` | `builder`, `architect`, `strategist`, `independent-reviewer` |
| `grok-build` | `builder`, `independent-reviewer` |
| `codex` | `builder`, `architect`, `strategist`, `independent-reviewer` |
| `cursor` | `builder`, `architect`, `independent-reviewer` |
| `antigravity` | `builder`, `architect`, `independent-reviewer` |
| `hermes-local-code` | `builder` |

`researcher` appears in no row. That is the mechanical basis for §2.5.1.

**The CLI is not an execution surface** (`DEC-20260815-06`, whose registration text reads "The CLI is a front end to the Gateway and is not a separate registered surface"). r3's `CONSUMED_SURFACES` identifier **does not exist in any registry** and is deleted from the plan, from the schema, and from the tests.

### 2.7 Schema changes this forces

```ts
export type ProviderClass = 'P1'|'P2'|'P3'|'P4'|'P5'|'NOT_RECORDED';
export type DataClass = 'public'|'internal'|'confidential'|'restricted'|'local-only';
export type BindingLadderStatus =
  | 'approved-binding' | 'proposed-binding' | 'implementation-observed'
  | 'temporary-task-assignment' | 'evaluation-candidate' | 'watchlist'
  | 'rejected' | 'unverified' | 'deprecated';

export interface SeatRoutingLane {
  readonly lane_label: string;            // e.g. 'primary', 'medium', 'tier-2'
  readonly provider: string;              // one of the five (DEC-20260815-04)
  readonly surface_id: string;            // C-6: registered surface_id
  readonly model_id: string;              // C-2: registered model_id
  readonly binding_status: BindingLadderStatus;   // C-3: mirrored, never assigned
  readonly binding_class: string;         // as recorded on the model's own entry
  readonly provider_class: ProviderClass; // C-2: READ from deployment_channel
  readonly data_eligibility: readonly DataClass[];
  readonly conditions: readonly string[]; // verbatim, from the controlling record
  readonly derivation: readonly string[]; // decision/registry ids per field
}

export interface SeatRegistrationV1 {
  readonly seat_id: SeatId;               // === a role_id in the 30-role registry
  readonly display_name: string;          // === DISPLAY_NAMES[seat_id]
  readonly role_binding_status: 'active'|'approved'|'proposed'|'unassigned';
  readonly mission: string;
  readonly contract_ref: string;
  readonly contract_sha256: string;       // pinned HERE, not a journal element (§5.3)
  readonly default_surface: string | null;   // null where every lane is ABSENT
  readonly routing: readonly SeatRoutingLane[];  // MAY be empty (§2.5.1)
  readonly absent_lanes: readonly { label: string; reason: string }[];
  readonly authority: {
    readonly allowed: readonly string[];
    readonly prohibited: readonly string[];
    readonly enforcement: 'behavioral';   // V1 honest label; V1.1 = gateway-zone
  };
  readonly handoff: { readonly receives_from: SeatId | null; readonly produces: string };
}

export const RATIFIED_SEATS: readonly SeatRegistrationV1[];  // deep-frozen
```

`routing` is an array, not a `{ primary, fallback }` pair, because C-5 makes an empty routing set and a single-lane set both valid V1 outcomes, and a fixed pair shape is exactly the schema pressure that produces an invented fallback.

The new package is packages/seat-registry (Node 22 / TypeScript, repository conventions), with seat contracts under contracts/seats/. Both paths are written here without code quoting, deliberately: `scripts/path-audit.sh` resolves backtick-quoted repo-relative references against the working tree, and neither path exists yet by design, because these rulings authorize no implementation. r3 carries two quoted references to the package, and those are the two path-audit findings already recorded on this PR. r4 adds none. Neither the document nor the gate is altered to hide them, and the finding is reported to the Founder rather than worked around.

---

## 3. `resolveSeat` — fail-closed

```ts
export interface LaneReadiness {
  lane_label: string;
  eligible: boolean;
  reason: string | null;   // never null when eligible === false
}
export interface ResolvedSeat {
  registration: SeatRegistrationV1;
  contract_text: string;
  readiness: readonly LaneReadiness[];
}
export function resolveSeat(seatId: string, probes?: ReadinessProbeRunner): ResolvedSeat;
```

### 3.1 Fail-closed rule

`resolveSeat` fails closed on any lane below `approved-binding`, and on any lane whose `approved-binding` is not a **standing** route. Concretely, in V1:

- unknown `seat_id`, or a `seat_id` outside the 30-role registry: typed error;
- contract hash mismatch: error naming both hashes;
- a lane at `proposed-binding`, `implementation-observed`, `temporary-task-assignment`, `evaluation-candidate`, `watchlist`, `unverified`, `rejected`, or `deprecated`: refused, with the status named;
- a lane at `approved-binding` whose controlling record requires a per-task Founder authorization (every `builder` lane, §2.5.3) or a per-run Founder act (every Tier-2 lane, §2.5.4): refused as a **standing** route, with the requirement named;
- a seat with an empty routing set (`researcher`): refused, with the absence reason from §2.5.1, and never by substituting another seat's lane.

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
3. **Each `command_id` may be dispatched at most once.** The contract's own ordering invariant already enforces it: "`dispatched` at most once, only after `journaled`".
4. **Retries are bounded at two**, per `DEC-20260716-02` item 5: "no more than two per deployment before stepping to the next tier", and each retry is logged with its reason.
5. **No silent third attempt, hidden redispatch, parallel outcome vocabulary, or unjournaled failover is authorized.**
6. Tier-stepping never crosses a data-class boundary to preserve availability (`DEC-20260716-02` item 5). A fallback exists for availability continuity only and can never independently issue a role's final high-impact recommendation.

`DispatchOutcome` kinds map **totally** onto the contract §5 closed vocabulary, as r3 C12 had it. The §5 closed set for command records, read at the base SHA, is `journaled`, `identity_bound`, `dispatched`, then exactly one of `completed` | `failed` | `unresolved`, and only after `unresolved`, `resolved`.

```ts
export interface DispatchPolicyV1 {
  readonly transport_retries_max: 2;   // DEC-20260716-02 item 5
  readonly lane_failovers_max: 1;      // primary -> next lawful lane, ONCE
  readonly consecutive_lane_failures_to_switch: 2;
}
export type DispatchOutcome =
  | { kind: 'seat_completed';  lane_label: string }              // -> §5 `completed`
  | { kind: 'seat_failed';     last_error_class: 'shed'|'auth'|'transport'|'other' }  // -> §5 `failed`
  | { kind: 'seat_unresolved'; reason: string };                 // -> §5 `unresolved`
```

The kind names stay prefixed because `completed` is taken by §5 with different membership; renaming avoids a homonym, and the mapping above is the whole relationship. `failed_over` is **not** an outcome kind and **not** a new event: a failover produces a new `command_id`, per item 1 above. Nothing in this policy adds a §5 event, and any change to that vocabulary is a contract amendment.

---

## 5. Journal relationship (ruling 7.2/D)

### 5.1 The journal owns observed execution identity

Seat Registry V1 consumes the journal's existing role identity and observed execution identity contracts **as-is**. Observed provider, model, and execution surface remain command-journal truth and must not be restated as independent Seat Registry truth.

The contract's element 4 is the controlling text: `intended_provider`, `intended_model`, `intended_surface` on `journaled`; `provider`, `model`, `execution_surface` on `dispatched`; "intent labeled as intent pre-dispatch; the observed actual identity is recorded on `dispatched`, is authoritative for this element, and is never backfilled from configuration."

The registry supplies **intended** routing identity for a lane. It never writes, mirrors, or re-asserts the observed values.

### 5.2 No `seat_id` element in V1

No `seat_id` command-journal element and no contract amendment is authorized in V1. Under ruling A the existing journal `role_id` already carries canonical seat identity: element 3 is `actor_id`, `role_id`, "registry-valid values only", and the seat IDs are exactly registry-valid role IDs.

The expected outcome is that no separate `seat_id` amendment will be necessary. That is an expectation, not a permanent prohibition: if later implementation evidence demonstrates that `role_id` is insufficient, a separate contract-amendment proposal may be brought for Founder ruling. `DEC-20260827-01` Section 11 records the same open question from the contract side: "a deferred amendment question (seat identity as an element-3 refinement) exists and is not resolved here." r4 proposes no amendment and drafts none.

### 5.3 Contract hash pins live in the registry

Seat contract sha256 pins are `SeatRegistrationV1.contract_sha256`, verified by r4 test 3, which recomputes the hash from the file. They are **not attribution fields and not journal elements** (ruling 7.1, ruling 7.2/D).

**The command-journal contract's status, restated.** r3 calls the contract "ratified" at its lines 7, 40, 203 and 283 while the contract's own header reads `Status: proposed`. Both are accurate about different things, and r4 states the ratification with its record: the contract is ratified at v0.17 under **Tier-2 round 5 PASS-WITH-ADVISORIES (`gemini-3.1-pro`) at exact head `b92889e6b16e9e4ca221247458cfd39ea46fc9e2`**, and **merged to Build Room `main` at `6ff0ee2893a22f59700f21ed825e8b974c3c3b9f`** with a SHA-named Founder merge authorization and post-merge verification passing against the merge SHA. Recorded at FounderOS `DEC-20260827-01` Section 11, PR #326. Contract pin: sha256 `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52`, recomputed from `docs/command-journal-contract.md` at base SHA `5c5fc25` and matching.

r3 line 26's flag stands: the contract's header field still reads `Status: proposed`, and whether that needs a record-keeping bump or is the contract's own convention is a question for the DEC. **The contract is not edited by this plan**, and its no-touch status is restated at §8.

---

## 6. Attribution (ruling 7.1)

**No `Seat-Id:` trailer is authorized.** r3 C13 is deleted, along with r3 §3.8's trailer proposal and r3 §6's "no new attribution trailer beyond Seat-Id" clause.

Because the canonical Seat Registry V1 identity is the existing role ID, the existing `Role-Id:` attribution field carries seat accountability. The three-field block is unchanged (`DEC-20260718-05` clause 2): `Actor-Id`, `Role-Id`, `Execution-Surface`. `Role-Id` takes a value from the canonical role registry, "no exceptions, no extra-registry values", and `founder` is not a valid `Role-Id`.

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

**Observed state at the r4 head, recorded and not substituted for the rule.** `packages/control-plane/src/migrations.ts` exists at base SHA `5c5fc25`. As of 2026-09-02, PR #15 (this filing PR) is the only open pull request in `MADVenturesLLC/founder-os-build-room`; the most recent merges are #12 (PR 2a, journal serialization contracts and golden vectors), #13 and #14. **PR 2b is not open yet.** The no-touch condition binds whenever it is open, and the builder re-checks the state at the moment work starts rather than relying on this line.

Prohibited scope named by this plan, in addition to the list above: `madventures-tui` (Task 44 lane), FounderOS doctrine, the TUI adapter registry, `DEC-20260815-11` lifecycle vocabulary, the `DEC-20260814-02` Tier-2 verdict enum, contract §5 event vocabulary, and the `DEC-20260726-01` council roster names.

---

## 9. Tests

Write first. The mutation-evidence rule applies to every guard: each guard is proven RED by its own targeted mutation before the suite is claimed meaningful.

### 9.1 The suite

1. **Registry shape.** Set-equality against `RATIFIED_SEATS`; each `seat_id` appears exactly once; the structure is deep-frozen and a mutation attempt is detected.
2. **Display-name table.** `registration.display_name === DISPLAY_NAMES[seat_id]` for all four; the four names are distinct; no name appears as a `seat_id`, a `Role-Id` value, or an `Execution-Surface` value anywhere in the package.
3. **Contract integrity.** Each seat contract file exists; its SHA-256 equals the pin, recomputed live; its content contains its own `seat_id` and display name.
4. **Per-run model distinctness (replaces r3's provider-org check).** For any run pairing an implementation lane with a review lane, the reviewing `model_id` must differ from the implementation `model_id` of the same run, and the reviewing `model_id` must be on the `DEC-20260815-05` Tier-2 roster. Asserted at assignment and re-asserted at review-open, as `DEC-20260815-05` clause 1 requires. This is a **model** check, not a provider-organization check: PRD row 13 and `DEC-20260815-04` both state the requirement in terms of the model, and `DEC-20260815-04` records that the roster "remains a per-run property to be asserted, not a property this naming act establishes". The separate `DEC-20260716-02` item 6 constraint (once bound, the reviewer's primary provider must differ from the builder's primary provider) is recorded as a standing constraint on future binding decisions; neither role is bound in V1, so it is not a V1 assertion.
5. **Surface resolution.** Every non-null `default_surface` and every lane `surface_id` is a registered `surface_id` in the execution-surface registry, **and** the seat's `seat_id` appears in that surface's roles-permitted table (`DEC-20260807-01` §3.3). A seat whose lanes are all ABSENT has `default_surface === null` and passes by that branch. The identifier `CONSUMED_SURFACES` appears nowhere in the package; a test asserts its absence so it cannot be reintroduced.
6. **Registry membership.** Every `seat_id` is a member of the 30-role registry at `/04-agents/role-registry.md` (`DEC-20260812-03`). A `seat_id` outside those thirty is rejected. A `seat_id` whose `activation_status` is `deferred` is rejected: the registry holds thirty roles and the assignable set is twenty-nine, the one exclusion being `investment-acquisition-lead`. Negative cases assert rejection of `operator` (no such role, and the homonym that forced r3's placeholder), `founder` (not a valid `Role-Id` under `DEC-20260718-05`), `Hephaestus` (a display name, never an authority identifier), any retired non-registry label, and `investment-acquisition-lead` (in the registry's thirty, excluded from the assignable twenty-nine).
7. **Vocabulary namespace (r3 test 6, retained).** No seat status string collides with any ratified closed vocabulary: `DEC-20260815-11` lifecycle states, the `DEC-20260814-02` Tier-2 verdict enum `{PASS, PASS-WITH-ADVISORIES, FAIL}`, contract v0.17 §5 event vocabulary, and the `DEC-20260726-01` council roster names (Augustus, Plato, Socrates, Turing, Marcus).
8. **Binding status is mirrored, never assigned.** Every lane's `binding_status` is one of the nine `DEC-20260716-02` item-2 values, and equals the value recorded on that model's own registry entry. A lane whose recorded status is absent from the registry fails; the test cannot be satisfied by a default.
9. **`resolveSeat` fail-closed.** Unknown id fails; a `seat_id` outside the thirty fails; a tampered contract fails naming both hashes; every lane below `approved-binding` is refused with its status named; an `approved-binding` lane that requires a per-task or per-run Founder act is refused as a standing route with the requirement named; a seat with an empty routing set is refused with its absence reason and never resolves to another seat's lane; a temporary task assignment presented as lane authority is refused.
10. **Data eligibility.** No lane whose `provider_class` is `NOT_RECORDED` is eligible for internal work; no P4 lane serves internal work; a P3 lane is eligible for internal work only where the applicable standing Founder approval is recorded on the lane; the `grok-build`, `glm-5.2`, and `hermes-local-code` conditions are present verbatim in the lane's `conditions` array and a byte-comparison test proves it.
11. **`toAttentionState`.** Full mapping table, all statuses across all four seats.
12. **Dispatch policy.** Retry cap ≤ 2; at most one failover; a retry or failover produces a **new** `command_id` and never a second dispatch on an existing one; no element outside the correlation set is written as lineage; a failed final lane yields `seat_failed` or `seat_unresolved`; the three outcome kinds map totally onto §5, with a test that fails if a fourth kind is added without a mapping.
13. **Handoff validator.** Golden valid record; one test per missing field; wrong status-for-seat; short SHA; empty `authorization_refs` — all reject, each naming the offending field. `authorization_refs` are references only: shape-checked, never adjudicated.

No test in this suite makes a live provider call.

### 9.2 Acceptance criteria

- **AC1** Every §9.1 test exists, passes three times consecutively, and every guard is mutation-proven RED.
- **AC2** `resolveSeat('independent-reviewer')` returns the Argus registration with a live-recomputed contract-hash match and populated per-lane readiness, and **refuses** every lane as a standing route with the per-run Founder act named (§2.5.4).
- **AC3** `resolveSeat('researcher')` refuses with the §2.5.1 absence reason, and does not resolve to any other seat's lane.
- **AC4** `resolveSeat('builder')` refuses every lane as a standing route with the per-task authorization requirement named, and refuses a temporary task assignment offered as lane authority.
- **AC5** Handoff validator rejects every missing-field case by name.
- **AC6** Dispatch policy: ≤ 2 retries, at most one failover, a new `command_id` per attempt, total §5 mapping, no silent third attempt.
- **AC7** Zero changes outside the seat-registry package, its seat-contract directory, and `docs/`. No CLI file is touched. No file on the §8 no-touch list is touched.
- **AC8** The repository suite is still green. **Baseline measured at `5c5fc25`, not asserted:** `npm test` (credential-free acceptance-criteria suite, Node 22, `TMPDIR=/tmp/br`) reports **659 tests, 229 suites, 659 pass, 0 fail, 0 skipped, 0 todo**, exit 0. The r3 figure of "618-baseline" is superseded by this measurement. The storage suite is separate and requires `TEST_DATABASE_URL`.
- **AC9** No journal contract amendment in V1, and no `seat_id` element proposed or drafted.

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

1. **A bare PASS from compiler pass 3**, run over the full corpus with full reads of every DEC whose anchor terms match, including Baseline v4.0, runtime-contract-v2, audit-reference-contract, and canonical-execution-envelope-v1.0. A qualified or partial gate is not a PASS and this plan does not proceed on one. This pass runs from the Founder's side; r4 lands in the repository first so the compiler can resolve its hash from a repo and the DEC can cite it (ruling Venue, r4-instruction 20 and 21).
2. A ratified DEC naming this exact plan file and its SHA-256.
3. Founder authorization naming the exact Build Room base SHA, and an isolated branch from that SHA.
4. Confirmation of the §8 no-touch list against live repository state at the moment work starts, including whether PR 2b is open.
5. Confirmation that §10.1 is unchanged.

Missing or mismatched: **STOP**, report `BLOCKED_MISSING_AUTHORIZATION`.

---

## 12. Implementation sequence

1. Branch from the authorized base SHA.
2. Vocabulary, identity, and attention mapping; tests 1, 2, 6, 7, 11 RED to GREEN.
3. Seat contracts (four files) and hash pins; test 3.
4. Registry and derived lane data; tests 5, 8, 10.
5. `resolve.ts` and readiness probes; tests 4, 9.
6. `dispatch-policy.ts`; test 12.
7. `handoff.ts`; test 13.
8. Full suite three consecutive times green; record exact commands and verbatim output.
9. Build report; draft PR; STOP for the review chain (Tier-2, CodeRabbit, Founder SHA-named authorization). No merge by builder.

There is no CLI step. r3's step 8 is deleted with r3 §3.8.

---

## 13. Completion gate

The closure record must contain: the merge commit SHA; the exact reviewed head with its Tier-2 marker, written with the **attestation id** and not the `model_id` (§2.5.4); the SHA-named Founder merge authorization; full three-times suite evidence, verbatim, with full 64-character hashes; the `resolveSeat` refusal transcripts for AC2, AC3, and AC4; the mutation-evidence table (guard, mutation, RED proof); and the bare PASS from compiler pass 3. Any missing element means not closed.

---

## 14. What this does not prove

- Behavioral authority stays behavioral in V1. Only the V1.1 gateway slice makes any boundary technical.
- Readiness probes prove credentials, never capacity. Incident-proven.
- **Every seat fails closed in V1.** `architect` is the only seat with a lawful standing lane at an approved binding on an eligible surface with a recorded provider class, and even it holds no per-run dispatch authority that this plan grants. That is the honest state of the corpus, not a defect in the derivation, and it is what ruling C-3 and C-5 anticipate.
- Provider classes recorded as `NOT_RECORDED` are exactly that. They are not P1 by inference from a provider's reputation or from another model's entry, and the DEC must close them before any such lane serves internal work.
- The registry records what the corpus establishes today. It confers nothing, and a later registry revision derives from the registries as they then stand.
- The compiler's r2 pass was PARTIAL. This plan proceeds only on a clean pass 3.

---

**These rulings resolve planning choices only. They do not authorize Seat Registry implementation, deployment, activation, new providers, new credentials, new spend, counted runs, Lab activation, journal-contract changes, or merge.**
