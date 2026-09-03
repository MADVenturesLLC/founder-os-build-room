# Build Report — Seat Registry V1 Implementation

**Work ID:** `seat-reg-v1-impl`  
**Role:** `builder` (Hephaestus)  
**Actor-Id:** `session:hermes-local-code/seat-reg-v1-impl`  
**Execution-Surface:** `hermes-local-code`  
**Executing Provider/Model:** `deepseek-v4-flash:0731` via `ollama-cloud`  
**Status:** `BUILD_READY_FOR_INDEPENDENT_VERIFICATION`  
**Date:** 2026-09-03  

---

## 1. Executive Summary

Implementation of Seat Registry V1 in `MADVenturesLLC/founder-os-build-room` has been completed in strict accordance with ratified plan `r7` and governing decision `DEC-20260902-02`.

- **Implementation base:** `fb6ad8f09fffb16ea8efa27fbe0aa94e45a5ae27`
- **Governing plan:** `docs/planning/seat-registry-v1/seat-registry-v1-implementation-plan-r7-DRAFT.md` (SHA-256: `b1bc4159b8cdb1ce6c342d84b4be3650a340abfc467624154ea5ba2a54815b60`)
- **Governing decision:** `DEC-20260902-02` (FounderOS reconciliation merge: `8198ecf002324cc4e00cf035c7cb98c6de0bc746`, status: `active`, source_of_truth: `true`, version: `0.2`)
- **Doctrine fixture pin:** `bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda` (retained unchanged for all 10 fixtures)
- **Branch:** `builder/seat-registry-v1-implementation`
- **Worktree:** `/Users/michaeldaley/MADVenturesOPs/worktrees/founder-os-build-room-seat-registry-v1`
- **Test suite results:** Baseline 659 pass; new suite 701 pass (N = 42 tests across 14 new suites), 0 fail, 0 skipped, three consecutive green runs
- **Repository gates:** `gate:path-audit`, `gate:attribution-selftest`, `gate:verify-check` all PASS

---

## 2. Changed Paths Manifest

Changes are strictly confined to authorized paths (`packages/seat-registry/**`, `contracts/seats/**`, `test/seat-registry-*.test.ts` per revised disposition, and this Build Report):

### Seat Contracts (`contracts/seats/`)
1. `contracts/seats/researcher.md` (SHA-256: `ad5cddb0ff038f8e41ad418f0f531ab8da9b88724dbd1c6b10ead369111c9ea0`)
2. `contracts/seats/architect.md` (SHA-256: `63787471913a266c05bad9499904a20e14d39cec05a3bd55803d9e378dee8e32`)
3. `contracts/seats/builder.md` (SHA-256: `5a0c3eecd002684433d1dbe47c9229187bcdcacda4300ebcd2584f2f5069b6ae`)
4. `contracts/seats/independent-reviewer.md` (SHA-256: `10992c6feb5d047d6d922b1bf8d73c15d70c639758dd5fd6e3c9aa6fede32996`)

### Vendored Doctrine Fixtures (`packages/seat-registry/fixtures/`)
Captured byte-identical from FounderOS at `bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda`:
5. `packages/seat-registry/fixtures/role-registry.md` (`100bb73f1364a92dad072587cb5f51eb6ccb77aea6a0033fc08abc83eb5b936b`)
6. `packages/seat-registry/fixtures/model-registry.md` (`7e45438a5c17f6765a6842df6e17bd0d1c0898576839ae1e66c6dd14de03fe0b`)
7. `packages/seat-registry/fixtures/execution-surface-registry.md` (`4054e58dd0f5e053436cfacfa09ed779a668a822cfe435f4a4038cd16417b060`)
8. `packages/seat-registry/fixtures/DEC-20260815-05-reviewer-eligibility-roster.md` (`97f1ab0ab1f82a216e9b3adead5e35a5c9b2f8b0c9ed3b05767c3fdc66c2e4bc`)
9. `packages/seat-registry/fixtures/tier2-shape-check.sh` (`95d498299f61ad4695b899543dfd7f2a35b658b5d6b5b3c78d167597a05415ad`)
10. `packages/seat-registry/fixtures/DEC-20260716-02-model-portfolio-and-routing-strategy.md` (`b7ed223d84c5b97de2f5a70d848715a46e9505c9924be1e135edfb334dd2bc17`)
11. `packages/seat-registry/fixtures/DEC-20260815-04-provider-selection-ordering.md` (`dca03d37ebdbb740bb1784708f8c2f5659c13f643ac6cd79c4e3fc7bb7dd9042`)
12. `packages/seat-registry/fixtures/DEC-20260807-01-g3-slice-b-plus-coding-execution-surface-governance.md` (`d582698066d47aad816e44e94b0b80ba9695c952cff10e8857493d491cb1b72f`)
13. `packages/seat-registry/fixtures/DEC-20260720-02-architect-fallback-azure-access-channel.md` (`de67e9908cbab9cbca19fdde37a41832b9e64843dca1a71cfb1460703a9f61b4`)
14. `packages/seat-registry/fixtures/decision-log.md` (`fdb2b4f37fca5eba7351dd30c867fa1875239d27df915c181d1c058d5000a706`)

### Package Source (`packages/seat-registry/src/`)
15. `packages/seat-registry/src/vocabulary.ts`
16. `packages/seat-registry/src/schema.ts`
17. `packages/seat-registry/src/fixtures.ts`
18. `packages/seat-registry/src/conditions.ts`
19. `packages/seat-registry/src/registry-data.ts`
20. `packages/seat-registry/src/model-distinctness.ts`
21. `packages/seat-registry/src/resolve.ts`
22. `packages/seat-registry/src/dispatch-policy.ts`
23. `packages/seat-registry/src/handoff.ts`
24. `packages/seat-registry/src/index.ts`

### Flat Test Files (`test/seat-registry-*.test.ts`)
25. `test/seat-registry-schema.test.ts` (Tests 1, 2, 3, 6, 7, 11)
26. `test/seat-registry-fixtures.test.ts` (Tests 5, 8, 10, 14)
27. `test/seat-registry-policy.test.ts` (Tests 4, 9, 12, 13)

### Build Report (`docs/planning/seat-registry-v1/`)
28. `docs/planning/seat-registry-v1/seat-registry-v1-build-report.md` (this file)

---

## 3. Implementation Summary Mapped to r7 §12

1. **Step 1: Branch from authorized base:** Checked out branch `builder/seat-registry-v1-implementation` at `fb6ad8f09fffb16ea8efa27fbe0aa94e45a5ae27`.
2. **Step 2: Vocabulary, identity, and attention mapping:** Implemented `vocabulary.ts` and `schema.ts`. Drove tests 1, 2, 6, 7, 11 to GREEN.
3. **Step 3: Seat contracts (4 files) and hash pins:** Authored `contracts/seats/{researcher,architect,builder,independent-reviewer}.md`. Drove test 3 to GREEN.
4. **Step 4: Vendored fixtures & registry data:** Captured 10 fixtures byte-exact at doctrine pin `bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda`. Implemented `registry-data.ts`, `conditions.ts`, and `deriveProviderClass`. Drove tests 5, 8, 10, 14 to GREEN.
5. **Step 5: Resolution & readiness probes:** Implemented `resolve.ts` with fail-closed behavior, registration inspection, and `model-distinctness.ts`. Drove tests 4 and 9 to GREEN.
6. **Step 6: Dispatch policy:** Implemented `dispatch-policy.ts` with pure `retryBudgetTransition`, transport uncertainty classification (`seat_unresolved`), and carried dispatch obligations. Drove test 12 to GREEN.
7. **Step 7: Handoff validator:** Implemented `handoff.ts` with non-empty reference validation and terminal-status verification. Drove test 13 to GREEN.
8. **Step 8: Full suite 3x green:** Ran `npm test` three consecutive times with 701 tests / 243 suites / 0 failures each run.
9. **Step 9: Build report & draft PR:** Authored this Build Report; ready to commit, push, and open draft PR.

---

## 4. Targeted Mutation Evidence (All Guards Proven RED)

| Guard / Test | File Mutated | Mutation Applied | Failure Observed | Result |
|---|---|---|---|---|
| **Test 1** (Registry shape) | `registry-data.ts` | Removed `independent-reviewer` from `RATIFIED_SEATS` | `AssertionError: RATIFIED_SEATS contains exactly four registrations` | **PROVEN RED** (exit 1) |
| **Test 2** (Display names) | `vocabulary.ts` | Changed `builder` display name to `'builder'` | `AssertionError: builder must not be a seat_id` | **PROVEN RED** (exit 1) |
| **Test 3** (Contract integrity) | `researcher.md` | Appended comment byte to contract file | `AssertionError: recomputed hash for researcher must equal registration.contract_sha256` | **PROVEN RED** (exit 1) |
| **Test 6** (Registry membership) | `vocabulary.ts` | Admitted `'operator'` into `isSeatId` check | `AssertionError: operator is not a valid seat_id` | **PROVEN RED** (exit 1) |
| **Test 7** (Vocabulary collision) | `vocabulary.ts` | Added `'PASS'` to builder terminal statuses | `AssertionError: status PASS must not collide with Tier-2 verdict enum` | **PROVEN RED** (exit 1) |
| **Test 11** (`toAttentionState`) | `vocabulary.ts` | Returned `'working'` on unmapped status instead of throwing | `AssertionError: Missing expected exception (RangeError)` | **PROVEN RED** (exit 1) |
| **Test 14** (Fixture pin) | `role-registry.md` | Appended comment to fixture | `AssertionError: recomputed SHA-256 for fixture role-registry.md must match recorded pin` | **PROVEN RED** (exit 1) |
| **Test 5** (Surface resolution) | `registry-data.ts` | Set builder `default_surface` to `'hermes-local-code'` | `AssertionError: default_surface for builder must be null in V1` | **PROVEN RED** (exit 1) |
| **Test 8** (Binding status mirror) | `registry-data.ts` | Set sonnet-5 binding status to `'proposed-binding'` | `AssertionError: lane for sonnet-5 binding_status must equal portfolio_classification` | **PROVEN RED** (exit 1) |
| **Test 10 (a)** (Internal eligibility) | `registry-data.ts` | Granted `'internal'` eligibility to `grok-4.5` (NOT_RECORDED class) | `AssertionError: lane large (grok-4.5) with NOT_RECORDED provider_class must NOT be eligible for internal work` | **PROVEN RED** (exit 1) |
| **Test 10 (b)** (Condition strings) | `conditions.ts` | Tampered with `GROK_BULLET_1` text | `AssertionError: builder large carries grokBullet1 byte-exact` | **PROVEN RED** (exit 1) |
| **Test 10 (c)** (Provider class step 1) | `registry-data.ts` | Returned `'NOT_RECORDED'` for `azure-ai-foundry` | `AssertionError: azure-ai-foundry yields P2 by DEC-20260720-02 precedence step 1` | **PROVEN RED** (exit 1) |
| **Test 4** (Model distinctness) | `model-distinctness.ts` | Bypassed same-model check | `AssertionError: same implementation and review model must be rejected` | **PROVEN RED** (exit 1) |
| **Test 9** (resolveSeat fail-closed) | `resolve.ts` | Resolved builder instead of refusing | `AssertionError: returns RefusedSeat with lane_not_standing for builder` | **PROVEN RED** (exit 1) |
| **Test 12** (Retry cap) | `dispatch-policy.ts` | Allowed 3 retries instead of 2 | `AssertionError: third retry must be refused` | **PROVEN RED** (exit 1) |
| **Test 13** (Handoff validator) | `handoff.ts` | Accepted short SHA (`^[0-9a-f]{7,40}$`) | `AssertionError: committed_sha must be a full 40-hex string` | **PROVEN RED** (exit 1) |

---

## 5. Test Suite and Repository Verification Runs

Environment: Node `v22.23.2`, macOS, `TMPDIR=/tmp/br`.

### Three Consecutive Full-Suite Runs (`npm test`):
```text
=== RUN 1/3 ===
# tests 701
# suites 243
# pass 701
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 10512.345292

=== RUN 2/3 ===
# tests 701
# suites 243
# pass 701
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 10667.031792

=== RUN 3/3 ===
# tests 701
# suites 243
# pass 701
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 10637.60525
```

### Repository Gates:
1. `npm run gate:path-audit`:
   `path-audit: PASS — every audited path reference resolves`
2. `npm run gate:attribution-selftest`:
   `attribution-shape-check: PASS — attribution shape valid (shape-only; attested values are not verified)`
3. `npm run gate:verify-check`:
   `verify-check: 3 passed, 0 failed, 0 unverified`
   `verify-check: PASS — every check ran and passed`

---

## 6. Verification of Invariants and Non-Authorities

- **PR 2b state at entry:** Verified closed (zero open PRs on `MADVenturesLLC/founder-os-build-room`).
- **No-touch list:** Preserved untouched (`packages/control-plane/src/migrations.ts`, CLI packages, control plane, migrations, command journal, counted runs, CI workflows, root package.json, package-lock.json, and tsconfig.json).
- **Untouched dirty checkout:** `/Users/michaeldaley/MADVenturesOPs/founder-os-build-room` was completely untouched during this work.
- **Explicit non-authorities:** This work authorizes no merge, no deployment, no activation, no Phase 4 rebind, no PR 2b, no Room Runtime integration, no Lab work, no provider activation, no credentials, no paid calls, and no spending.
- **Review chain requirements:** This candidate requires advisory review, independent Tier-2 review on the exact candidate head by a distinct roster model, and exact-SHA Founder merge authorization.

Role-Id: builder
Actor-Id: session:hermes-local-code/seat-reg-v1-impl
Execution-Surface: hermes-local-code
