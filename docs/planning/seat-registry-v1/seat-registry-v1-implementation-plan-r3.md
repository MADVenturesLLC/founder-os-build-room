# Seat Registry V1 — Implementation Plan, Revision 3 (Builder Handoff — Build Room)

**Status:** DRAFT-FROZEN r3 — awaiting its own DEC + Founder authorization naming this file and its SHA-256. Nothing here is authorized to build yet.
**Supersedes:** `seat-registry-v1-implementation-plan-r2.md` (sha256 b641d1066f0e8e9a35bbefacba865c8b4d439db51c69a5c21d2c79413b20f25a) — r2 retained unmodified per Lab correction rules.
**Produced:** 2026-09-01. Basis: decision-compiler verdict (3 BLOCKING / 5 MAJOR / 2 MINOR, PARTIAL CORPUS) + independent verification of every load-bearing claim against the ratified corpus (all confirmed accurate).
**Target repository:** `MADVenturesLLC/founder-os-build-room` (local `~/MADVenturesOPs/founder-os-build-room`)
**Explicitly NOT touched:** `madventures-tui` (Task 44 lane), FounderOS doctrine, TUI adapter registry, DEC-20260815-11 lifecycle vocabulary, the ratified command-journal contract (v0.17 @ 6ff0ee2), counted-run surfaces.

---

## 0. Revision 3 changelog (r2 → r3, per compiler verdict + verification)

| # | Change | Compiler finding | Verification |
|---|---|---|---|
| C10 | Routing rows gain provider-class (P1–P5) + data-class columns; unverified lanes marked; failing rows flagged, never silently kept | 1 BLOCKING | DEC-20260716-01 items 1,2,7 verified: internal permits P1/P2/P5, P3 only w/ standing Founder approval, NEVER P4 |
| C11 | §3.7 shrinks: served_model/lane/observed-identity already ratified journal obligations (contract §2 element 4); seat_id DEFERRED to post-foundation contract-amendment proposal | 2, 8 BLOCKING/MAJOR | Contract §2 element 4 verified: observed identity on `dispatched`, authoritative, never from config; §2 "any change = contract amendment" verified |
| C12 | DispatchOutcome maps totally onto contract §5 closed vocabulary; `completed` kind renamed (collision); failed_over = data on existing path | 7 MAJOR | Contract §5 verified: journaled/identity_bound/dispatched/completed/failed/unresolved/resolved, closed |
| C13 | §7.1 rewrites: `Seat-Contract-Hash:` trailer (85 chars) violates 72-char bound; propose `Seat-Id:` only (26 chars); hash lives in journal + PR body | 3 BLOCKING | v4.45 ruling verified verbatim: "each attribution trailer source line must be 72 characters or fewer" |
| C14 | Test 6 extends to ALL ratified closed vocabularies (operator PASS/REQUEST_CHANGES collide with DEC-20260814-02 Tier-2 enum) | 9 MINOR | v4.36 verified: Tier-2 enum closed {PASS, PASS-WITH-ADVISORIES, FAIL}; "REQUEST-CHANGES and any other vocabulary is rejected" |
| C15 | Retry counts: ≤2 per DEC-20260716-02 item 5 (or named variance for Founder ruling); fallback-never-final-high-impact rule adopted | 5 MAJOR | Item 5 verified: "no more than two per deployment before stepping to the next tier"; "fallback … can never independently issue a role's final high-impact recommendation" |
| C16 | Governance statements added: DEC-20260814-03 freeze posture; OA-1 L169 citation; seat-namespace sentence vs DEC-20260726-01 | 10 MINOR | OA-1 L169 verified: "Automatic fail-closed routing to any new seat requires that separate later ruling"; Console-council five-seat roster verified |
| C17 | Seat identifiers + personas: FOUNDER-RESERVED (rename vs ruled-namespace-relation); drafted with placeholders | 4 MAJOR | DEC-20260715-17 §10/§12 verified: persona identifiers never role aliases; routing targets role IDs; researcher/architect/builder ARE role_ids, operator absent |
| C18 | Lab-hold relation: DEC must state relation to DEC-20260821-01 item 3 hold | 6 MAJOR | Hold verified: "establish the Lab seats and separation rules — NOT RATIFIED — held for now"; "no seat is filled" |

**Verification notes (compiler partial-corpus gaps, closed here):**
- V1: contract v0.17 IS on main at `6ff0ee2` (sha256 eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52) — in force. Its header still reads `Status: proposed`; flag for the DEC whether that field needs a record-keeping bump or is the contract's convention.
- V2: the merge-commit message for PR #11 says "v0.1" while the file is v0.17 — stale PR title, content verified. Observation for the record, not a defect.
- V3: runtime-contract-v2 exists (DEC-20260715-15). Baseline v4.0, audit-reference-contract, canonical-execution-envelope-v1.0 exist in the corpus (grep hits) but were not full-read by the compiler; r3's path includes a second compiler pass with all four loaded before any DEC draft.

## 1. Objective

Give Build Room a closed, Founder-ratified SEAT REGISTRY — governed role
identities that the CLI resolves at launch, that handoffs are validated
against, and whose authority data the V1.1 gateway slice will enforce.
The command journal already owns observed execution identity (contract §2
element 4); the registry supplies the WHO and the authority contract, and
consumes the journal's observed identity — it never restates it.

Seat = who works and what they may do. Adapter (TUI) = what surface runs.
Journal = what happened (observed identity, already ratified). The registry
is the authority layer; it never adjudicates authority and never restates
adapter or journal fields.

## 2. Entry gate (builder verifies before any file change)

1. A ratified DEC naming this exact plan file and its SHA-256.
2. Founder authorization naming the exact Build Room base SHA; isolated
   branch `builder/seat-registry-v1` from that SHA.
3. Founder rulings on ALL §7 items (including the four reserved A–D).
4. A SECOND compiler pass with the four missing sources loaded (Baseline
   v4.0, runtime-contract-v2, audit-reference-contract,
   canonical-execution-envelope-v1.0) returning a CLEAN gate — the r2 pass
   was PARTIAL and this plan does not proceed on a qualified gate.
5. If 7.3 = parallel: confirm the DEC's no-touch list for journal files.
6. Confirm prohibited list (§8) unchanged.
Missing or mismatched → STOP, report `BLOCKED_MISSING_AUTHORIZATION`.

## 3. Deliverables (file-by-file)

New package `packages/seat-registry/` (Node 22 / TypeScript, repo
conventions; `npm ci --include=dev`; local runs `export TMPDIR=/tmp/br`).

### 3.1 `src/vocabulary.ts` — one copy cannot drift
```ts
// FOUNDER-RESERVED (C17): SeatId values are placeholders pending the
// Founder's ruling on rename vs ruled-namespace-relation with the
// DEC-20260715-17 role roster (researcher/architect/builder are role_ids;
// operator is absent). Drafted as BR_SEAT_* to avoid homonym collision
// until ruled; the DEC names the final values.
export type SeatId = 'br-researcher' | 'br-architect' | 'br-builder' | 'br-operator';
export const SEAT_IDS: readonly SeatId[] = [...];
export const AGENT_NAMES: Readonly<Record<SeatId, string>> = {
  'br-researcher': 'Aletheia', 'br-architect': 'Daedalus',
  'br-builder': 'Hephaestus', 'br-operator': 'Argus',
};
// C14: operator statuses renamed to avoid collision with the ratified
// Tier-2 enum {PASS, PASS-WITH-ADVISORIES, FAIL} (DEC-20260814-02/v4.36).
// Placeholder names pending Founder ruling; alternatives: VERIFIED_* /
// SEAT_* prefixes, or a ruled justification for reuse.
export const SEAT_TERMINAL_STATUSES: Readonly<Record<SeatId, readonly string[]>> = {
  'br-researcher': ['RESEARCH_READY','INCONCLUSIVE_EVIDENCE','BLOCKED_MISSING_SOURCE','BLOCKED_MISSING_AUTHORITY'],
  'br-architect':  ['PLAN_READY_FOR_FOUNDER_APPROVAL','BLOCKED_RESEARCH_GAP','BLOCKED_REPOSITORY_DRIFT','BLOCKED_FOUNDER_DECISION','INCONCLUSIVE_ARCHITECTURE'],
  'br-builder':    ['BUILD_READY_FOR_INDEPENDENT_VERIFICATION','MATERIAL_PLAN_DRIFT','BLOCKED_ENVIRONMENT_MISMATCH','BLOCKED_TEST_FAILURE','BLOCKED_MISSING_AUTHORIZATION','INCOMPLETE_BUILD'],
  'br-operator':   ['SEAT_VERIFIED','SEAT_REQUEST_CHANGES','SEAT_INCONCLUSIVE'],  // renamed, pending ruling
};
export type AttentionState = 'working' | 'blocked' | 'done';
export function toAttentionState(seat: SeatId, status: string | null): AttentionState;
```
Test 6 (C14) asserts no seat status string collides with ANY ratified
closed vocabulary: DEC-20260815-11 lifecycle, DEC-20260814-02 Tier-2 enum,
contract v0.17 §5 event vocabulary, DEC-20260726-01 council roster names.

### 3.2 `src/registry.ts` — closed, deep-frozen registrations
```ts
export type ProviderClass = 'P1'|'P2'|'P3'|'P4'|'P5'|'UNVERIFIED';   // C10
export type DataClass = 'public'|'internal'|'confidential'|'restricted'|'local-only';
export type CredentialDisposition = 'oauth-store' | 'env-key-injected' | 'keychain';
export interface SeatRoutingLane {
  readonly provider_org: string;
  readonly provider: string;
  readonly model: string;                 // REQUESTED; observed identity is journal-owned (C11)
  readonly provider_class: ProviderClass; // C10 — classification basis stated in docs; UNVERIFIED is a first-class value, never assumed
  readonly data_class: DataClass;        // C10 — what this lane may serve
  readonly credential: CredentialDisposition;
  readonly readiness_probe: 'oauth-expiry' | 'key-present' | 'none-documented';
}
export interface SeatRegistrationV1 {
  readonly seat_id: SeatId;
  readonly agent_name: string;            // === AGENT_NAMES[seat_id] (test)
  readonly mission: string;
  readonly contract_ref: string;          // contracts/seats/<seat_id>.md
  readonly contract_sha256: string;      // pin; test recomputes
  readonly default_surface: string;       // validated vs CONSUMED_SURFACES
  readonly routing: { readonly primary: SeatRoutingLane; readonly fallback: SeatRoutingLane };
  readonly authority: {
    readonly allowed: readonly string[];
    readonly prohibited: readonly string[];
    readonly enforcement: 'behavioral';   // V1 honest label; V1.1 = gateway-zone
  };
  readonly handoff: { readonly receives_from: SeatId | null; readonly produces: string };
}
export const RATIFIED_SEATS: readonly SeatRegistrationV1[]; // deep-frozen
```
**C10 routing table — classification basis REQUIRED per lane; unverified
lanes marked UNVERIFIED, never assumed.** Draft rows (informative mapping
from the Hermes suite; FINAL lane selection is Founder-reserved, item C):

| Seat | Lane | Provider | Model | Class (basis) | Data class |
|---|---|---|---|---|---|
| br-researcher | primary | gemini-direct | gemini-3.1-pro-preview | P1/P2 (US-domiciled; verify endpoint) | internal |
| br-researcher | fallback | nous | qwen3.8-max | UNVERIFIED (aggregator; underlying Alibaba P3 — verify) | internal* |
| br-architect | primary | zai | glm-5.3 | UNVERIFIED (P3-or-P4 by endpoint — verify domicile) | internal* |
| br-architect | fallback | nous | kimi-k3 | UNVERIFIED (aggregator; underlying Moonshot P4 — verify) | internal* |
| br-builder | primary | anthropic | claude-sonnet-5 | P1 (US-domiciled) | internal |
| br-builder | fallback | ollama-cloud | deepseek-v4-pro | UNVERIFIED (aggregator; underlying DeepSeek P4 — verify) | internal* |
| br-operator | primary | xai-oauth | grok-4.6 | P1/P2 (US-domiciled; verify) | internal |
| br-operator | fallback | minimax | MiniMax-M3 | UNVERIFIED (P4-shaped official API — verify domicile) | internal* |

*Rows marked internal* FAIL the DEC-20260716-01 internal-class matrix as
drafted (P3 needs standing Founder approval; P4 never serves internal).
They are FLAGGED, not silently kept: the DEC must either (a) carry the
standing Founder approval for the P3 lanes, (b) re-point the lane, or
(c) classify the work public-only. This is Founder-reserved (item C).

### 3.3 `contracts/seats/*.md` — four seat contracts
Ported from the proven SOUL.md set as Build-Room-owned copies. Each:
identity, mission, reasoning style, evidence standard, authority limits,
report contract, terminal statuses, stop conditions, "not a filesystem
sandbox" clause. Changes only by PR; hash pin updates with them.

### 3.4 `src/resolve.ts` — fail-closed per seat, honest about probes
```ts
export interface LaneReadiness { lane: 'primary'|'fallback'; ready: boolean; reason: string | null; }
export interface ResolvedSeat {
  registration: SeatRegistrationV1;
  contract_text: string;
  readiness: readonly LaneReadiness[];
}
export function resolveSeat(seatId: string, probes?: ReadinessProbeRunner): ResolvedSeat;
```
Unknown id → typed error. Contract hash mismatch → error naming both
hashes. Both lanes dead → refuse. Dead primary + ready fallback → warning,
proceed. Readiness proves credentials, NOT capacity (incident R-5.4.02:
PONG passed while the real workload shed across three pools).

### 3.5 `src/dispatch-policy.ts` — C12 + C15: named budgets, total mapping
```ts
// C15: retries ≤2 per DEC-20260716-02 item 5 (adopted; variance requires
// Founder ruling). Fallback never issues a role's final high-impact
// recommendation (item 5, adopted).
export interface DispatchPolicyV1 {
  readonly transport_retries_max: 2;        // DEC-20260716-02 item 5
  readonly lane_failovers_max: 1;           // primary→fallback, ONCE, journaled
  readonly consecutive_lane_failures_to_switch: 2;
}
// C12: NO parallel outcome vocabulary. Dispatch outcomes map TOTALLY onto
// the contract §5 closed events. `completed` is taken (different
// membership) — renamed kinds below; failed_over is DATA on the existing
// retry path, not a new event (a new event requires a contract amendment).
export type DispatchOutcome =
  | { kind: 'seat_completed'; lane: 'primary'|'fallback' }   // maps to §5 `completed`
  | { kind: 'seat_failed'; last_error_class: 'shed'|'auth'|'transport'|'other' }  // maps to §5 `failed`
  | { kind: 'seat_unresolved'; reason: string };             // maps to §5 `unresolved`
// failover_occurred + served identity: carried as data on the journaled/
// dispatched events per contract §2 element 4 — never new fields, never
// new events, unless a contract amendment rules otherwise.
```
Rules: transport retries never cross lanes; lane failover is a recorded
event; a failed fallback → `seat_failed`/`seat_unresolved` → seat reports
a BLOCKED status; no third silent attempt.

### 3.6 `src/handoff.ts` — HandoffV1 + validator (unchanged from r2)
work_id, from_seat, to_seat, status (∈ SEAT_TERMINAL_STATUSES[from_seat]),
objective, repository, base_sha/head_sha (40-hex), artifacts
(path+sha256)[], authorization_refs (REFERENCES ONLY, shape-checked, never
adjudicated), assumptions, known_risks, next_required_action. Missing
field → reject naming it.

### 3.7 Journal integration — C11: SHRUNK to consumption + amendment proposal
- The registry CONSUMES contract §2 element 4 (observed provider/model/
  surface on `dispatched`) — it never restates or re-proposes it.
- seat_id as a journal element is DEFERRED. The contract is already
  ratified (v0.17 @ 6ff0ee2); §2 rules any element change is a contract
  amendment, not a refactor. §3.7 therefore ships as the AMENDMENT
  PROPOSAL (post-foundation, its own ruling): element 3 (`actor_id`,
  `role_id` — "registry-valid values only") is the natural home for seat
  identity, either as a refinement of element 3 or a new element — the
  amendment decides, per the compiler's finding 2. This is the
  MATERIAL_PLAN_DRIFT branch r2 already anticipated; it is now the plan.
- The journal lane proceeds independently; seat_id deferral removes the
  only coupling (compiler: "no time pressure").

### 3.8 CLI integration — `packages/gateway-cli`
- `--seat <id>` (+ env passthrough): resolves BEFORE any launch/dispatch;
  banner (agent, seat, contract hash, lane-readiness incl. dead-lane
  warnings).
- Refusal: unknown seat, hash mismatch, both lanes dead → exit non-zero.
- C13: `Seat-Id:` trailer ONLY (26 chars ≤ 72-char bound). The contract
  hash lives in the journal record and the PR body — never a trailer.
  Any NEW trailer beyond Seat-Id is a DEC-20260718-05 amendment plus an
  attribution-shape-check change, needing its own ruling (noted in plan).

### 3.9 Tests (write first; mutation-evidence rule applies to every guard)
1. Registry shape: set-equality vs RATIFIED_SEATS; each SeatId once;
   deep-frozen (mutation attempt detected).
2. Agent-name table: registration.agent_name === AGENT_NAMES[seat_id] ∀.
3. Contract integrity: file exists; SHA-256 === pin; content contains its
   own seat_id AND agent_name.
4. Independence: builder vs operator share NO provider_org across primary
   AND fallback (4 pairwise checks).
5. Surface resolution: every default_surface ∈ CONSUMED_SURFACES.
6. **C14: vocabulary namespace — no seat status collides with ANY ratified
   closed vocabulary** (lifecycle, Tier-2 enum, contract §5 events,
   council roster).
7. resolveSeat: unknown id fails; tampered contract fails naming hashes;
   dead-primary/ready-fallback warns; both-dead refuses.
8. toAttentionState: full mapping table, all statuses × all seats.
9. Dispatch policy: retry cap ≤2; exactly one failover; failed fallback →
   seat_failed/unresolved; outcome kinds map totally onto §5 (C12/C15).
10. Handoff validator: golden valid; one test per missing field; wrong
    status-for-seat; short SHA; empty authorization_refs — all reject.
11. CLI: --seat unknown → non-zero + no dispatch; valid → banner +
    Seat-Id trailer (harness-level, no live provider call).
Each guard proven RED by its targeted mutation before the suite is claimed
meaningful.

## 4. Implementation sequence
1. Branch from authorized base SHA.
2. Vocabulary + attention mapping + tests 1,2,6,8 RED→GREEN.
3. Contracts (4 files) + pins + test 3.
4. Registry + tests 4,5 (C10 classification table as documented data).
5. resolve.ts + probes + test 7.
6. dispatch-policy.ts + test 9 (C12/C15).
7. handoff.ts + test 10.
8. CLI flag + test 11 (C13 trailer).
9. Full suite ×3 consecutive green; record exact commands + verbatim output.
10. Build report; draft PR; STOP for review chain (Tier-2 + CodeRabbit +
    Founder SHA-named authorization). No merge by builder.

## 5. Acceptance criteria
- AC1 All §3.9 tests exist, pass 3× consecutively, every guard mutation-proven RED.
- AC2 resolveSeat('br-operator') returns Argus, live-recomputed hash match, both-lane readiness populated.
- AC3 --seat unknown/tampered/both-dead refuses (exit ≠ 0, nothing dispatched); dead-primary warns and proceeds on fallback.
- AC4 Handoff validator rejects every missing-field case by name.
- AC5 Dispatch policy: ≤2 retries, exactly one failover, total §5 mapping, no silent third attempt.
- AC6 Zero changes outside `packages/seat-registry`, `contracts/seats/`, `packages/gateway-cli` (flag wiring), and docs.
- AC7 No madventures-tui file referenced/changed; no lifecycle vocabulary, Tier-2 enum, or contract §5 vocabulary touched (test 6 green).
- AC8 Repo suite still green (618-baseline + new; TMPDIR=/tmp/br; Node 22).
- AC9 No journal contract amendment in V1; seat_id deferral documented as the amendment proposal (§3.7).

## 6. Prohibited (unchanged authority + C13/C15 additions)
No TUI repo changes; no Task 44 references; no new lifecycle events/states;
no contract §5 vocabulary changes; no journal contract amendment in V1; no
new attribution trailer beyond Seat-Id; no deployment, activation, spend,
credentials, providers; no live provider calls in tests; no counted-run
interaction; no policy-engine binding beyond exported data (V1.1); no web
UI; no merge by builder.

## 7. Founder decisions (rule before or at DEC — ALL required)
7.1 Attribution: `Seat-Id:` trailer only (recommended, 26 chars ≤ 72 bound);
    hash in journal + PR body. Any further trailer = separate amendment.
7.2 Journal: seat_id DEFERRED to post-foundation contract-amendment ruling
    (recommended — the contract is ratified; §2 rules amendments). The
    amendment decides element-3 refinement vs new element.
7.3 Parallel with journal work (recommended) vs sequenced.
7.4 Routing rows: per-lane classification + standing P3 approvals + final
    lane selection (C10 table) — Founder-reserved.
A. Seat identifiers: rename (br-* or other) vs ruled-namespace-relation
   with DEC-20260715-17 roster — Founder-reserved (C17).
B. DEC-20260821-01 item-3 hold relation: distinct scope vs lift —
   Founder-reserved (C18).
C. Every routing row's final lane selection + P3 standing approvals (C10).
D. The seat_id contract amendment itself (post-foundation).

## 8. Deferred (NOT V1)
Gateway-zone authority enforcement (V1.1) · worktree-per-seat (own DEC) ·
ring-buffer seq + rehydration (own DEC) · command-palette authority tiers
(TUI-side) · Temporal-class durable runs (Lab study first) · dynamic seats ·
per-seat memory · skins · web UI · >4 seats (schema ready per C8) ·
automated Hermes-suite sync · journal seat_id amendment (post-foundation).

## 9. Completion gate (hard to close falsely — HO-20260831-01 pattern)
Closure record must contain: merge commit SHA; exact reviewed head with its
Tier-2 marker; Founder SHA-named merge authorization; full 3× suite evidence
(verbatim, full 64-char hashes); CLI refusal transcript (AC3); mutation-
evidence table (guard → mutation → RED proof); the clean second compiler
pass (entry gate 4). Any missing element = not closed.

## What this does not prove
- Behavioral authority stays behavioral in V1; only the V1.1 gateway slice makes any boundary technical.
- Readiness probes prove credentials, never capacity (incident-proven).
- Provider-class classifications marked UNVERIFIED are exactly that — the DEC must close them before any lane serves internal work.
- The Hermes suite and incident transfer the pattern and failure modes, not the runtime: this is new code and earns its own verification.
- The compiler's r2 pass was PARTIAL (four sources unloaded); this plan proceeds only on a clean second pass.
