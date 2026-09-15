# ADDENDUM — PR 2b Gate III successor draft (r4): the block re-verified, findings refined

**Status: BLOCKED (unchanged). NO r4 DRAFT ACT EXISTS. THIS FILE IS NOT AN ACT,
NOT A DRAFT, AND CONFERS NO AUTHORITY OF ANY KIND.**

Produced by the `br-architect` seat (Plan Authority; no approval, build, operate,
merge, release, or risk-acceptance authority) on resumption of the session that
received the Founder handoff titled *"PR 2b Gate III successor draft (r4)"*.

**Relation to the original finding.** This file is an **append-only continuation**
of:

    path:   /Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/BLOCKER-pr2b-gate3-successor-draft-r4-controlling-input-absent-20260914.md
    sha256: a253f1aa11c82fb6e72fcfd1aa693c38bc5e93cb7785888de65c16d40e9ff54d
    size:   16332 bytes, 260 lines, trailing newline present

That file is **not superseded and not amended**; it remains the primary finding
record, including its §2 search matrix and its §8 prepared amendment payload.
This addendum adds only: (a) a fresh re-verification pass, (b) two refinements to
its findings §6, and (c) an explicit bullet-by-bullet disposition of the handoff's
five amendment instructions.

---

## 1. Fresh re-verification, and its result

Performed 2026-09-14 18:57 EDT, read-only, after fresh `git fetch origin`.

| # | Surface | Fresh result | vs. original finding |
|---|---|---|---|
| 1 | `origin/main` = `ca3dea3e681a1804e4c0d8b65f7c9d88ca212aa9`, tree `f46292a514a545ce30f7a701af8d1a8697665a75` | Path absent; custody holds the same **7** files | **UNCHANGED** |
| 2 | All remote heads — `git ls-remote --heads origin` | **46** heads, path absent from every one | **UNCHANGED** |
| 3 | All reachable objects — `git rev-list --all --objects`, filtered for `FOUNDER-RULING` | Exactly **one** match: the 2026-09-13 gate-3 ruling (`55e5fbde…f3`) | **UNCHANGED** |
| 4 | Same object sweep, filtered for `D1-scope` / `20260914` | Exactly **one** match: `CUSTODY-RECEIPT-pr2b-gate3-copies-20260914.md` (`7260487c…9f`) — the PR #43 receipt, not a ruling | **UNCHANGED** |
| 5 | Local working tree | `docs/planning/command-journal/custody/` does not exist; HEAD `75b52a23…c242` is **not** a descendant of `origin/main` | **UNCHANGED** |
| 6 | Founder custody `/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/` | No `*D1*`, `*D-1*`, or `*scope-amendment*` entry. **Nothing has been written to this directory since 2026-09-14 18:30** | **UNCHANGED — no landing since the block was filed** |
| 7 | Session paste store `~/.hermes/profiles/br-architect/pastes/` | Newest entry is still `paste_1_180227.txt` (1,513 bytes, 18:02) — **the handoff itself, placeholders intact**. No later paste exists | **UNCHANGED** |
| 8 | Bounded filesystem sweep — `MADVenturesOPs` maxdepth 4, and `Documents`/`Desktop`/`Downloads` maxdepth 3, for `*D1*scope*` / `*D-1*scope*` / `*scope-amendment*` | **Zero hits** | **UNCHANGED** |

**No unlanded input has arrived.** No surface holds the D-1 scope ruling's bytes.
The `blob: <filled at landing>` / `sha256: <filled at landing>` placeholders in the
handoff remain unfillable, because the landing has still not occurred.

## 2. Identities re-derived in this pass (not inherited from memory)

| Artifact | Committed identity | Byte / line | Verification |
|---|---|---|---|
| `origin/main` | `ca3dea3e681a1804e4c0d8b65f7c9d88ca212aa9`, tree `f46292a514a545ce30f7a701af8d1a8697665a75` | — | read live |
| r3 draft act, `docs/planning/command-journal/custody/DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-r3-20260913.md` | blob `78ef441422714044663bf2c2cd34d493fdf00e00`, sha256 `d024e508d77169c5d85d323fb28f32c6ea5c2b709d2e12cc3470f0bde37f5945` | 137,939 bytes, 2,285 lines | **BYTE-IDENTICAL** to the identity cited in the original blocker |
| Addendum 02 r6, `docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-02-r6.md` | blob `01f60a4e8f021e8eff3d2a310c9c393c9ee3f493`, sha256 `16e316be4e8d52ae0e856cf53801180cd2a18209450c7e94954d80d107a8dcac` | 35,805 bytes, 529 lines | **CONFIRMED** — handoff's hash matches |

Both hash-bound inputs the handoff actually supplies resolve cleanly, again. The
toolchain is sound; exactly one controlling input is missing.

## 3. Refinements to the original findings §6

Two corrections are owed against the original blocker. Both were surfaced by
re-reading the committed artifacts directly (`git show origin/main:<path> | grep -n`)
rather than by reading the earlier session's own line arithmetic. All line numbers
below were produced by `grep -n` over the committed blob and are exact.

### R1 — F2 understates the `B-R14` collision: the id appears at **two** sites in r3, and both are affected

The original blocker cited the r3 §6.3 table row. A full grep of the committed r3
shows **two** occurrences, and the second is a hand-maintained enumeration that a
renumbering must also update or it will silently contradict §6.3:

| r3 committed line | Text | Effect of a renumber |
|---|---|---|
| **1113** | `| B-R14 | Both privileged roles are NOLOGIN (rolcanlogin=f) with no password set | PC-5 |` | the assertion row itself (§6.3 table) |
| **1534** | `Catalog-only assertions (B-R4, B-R8, B-R9, B-R10, B-R11, B-R12, B-R13, B-R14,` | a prose enumeration of catalog-only assertions at §11 |

Either disposition — renumber the NOLOGIN assertion, or give the pure-encoder row a
free id — therefore carries a **second edit obligation at r3 line 1534**, in
addition to the §6.3 row. The original blocker named only the first. This is added
scope, and it is a reason the five amendment bullets are not purely additive (see
F4/R2 below).

The colliding proposal is confirmed on the r6 side at **r6 line 381**
(`| B-R14 (proposed addition to B-T1) | MOD | test/journal-authority.storage.test.ts |`),
and is named again at r6 lines 391, 442, and 500. `B-R14` is, in r6, a **proposed
row inside B-T1** — not a standalone file-map id — which is the substance of F3.

### R2 — F6 is confirmed in full, and its wording obligation is sharper than stated

Both halves of F6 verify exactly as filed:

- **S4 is a stop condition.** `docs/planning/command-journal/pr2b-storage-architecture-r6.md` line **951**: `- **S4** — CI cannot run the negative matrix as a non-superuser login.`
- **The carrier of S4 is B-M4.** `docs/planning/command-journal/pr2b-implementation-plan-r1.md` line **867**: `| S4 | CI cannot run the negative matrix as a non-superuser login | **UNKNOWN** — PO-1 | B-M4 |` — the row's "Cleared by" column names `B-M4`.
- **B-M4 is a file-map id.** r3 line **1061**: `| **B-M4** | MOD | **.github/workflows/ci.yml** |` — a job extension in the existing workflow, with *"No second CI mechanism. No new workflow file."*
- **And r3 states the same carrier relation itself**, at §8: `B-M4 carries S4`.

So the handoff's phrase *"the B-M4/S4 carrier"* conflates one file-map id, one stop
condition, and one status, as filed at F6. The sharper obligation: the r4 sentence
must say that **B-M4 carries stop condition S4** — not that S4 is a carrier — and
must not imply the mechanism and the stop condition are the same object class.

### Confirmed without refinement

- **F4** — the standing prohibitions are exactly as filed: r3 line **1654**
  (`**No alternate journal implementation is added.**`) and r3 line **844**
  (`- No alternate journal implementation alongside the one specified.`), against
  handoff bullet 1's addition of *"SQL encoder is a second conforming serializer."*
- **F5** — r3 line **326** already reads `| **III** | **This gate** | **PROPOSED** | this artifact |`. Bullet 5 preserves a state that already holds; the only real edit is an added sentence and it needs an explicit anchor.
- **F7** — r6 line **400** confirms *"B-M3 (tsconfig.json) still expected to need no change"*, while B-N2/B-N3 land under `packages/control-plane/src/` (r6 lines 378–379) and B-T4 is a new test file (r6 line 380). The re-verify-don't-inherit point stands.
- **F8** — starting-base drift re-derived live: `f21693e0` is an ancestor of `origin/main`, **45** commits beyond; `dace9af9` ancestor, **7** beyond; `f95d7995` ancestor, **5** beyond; `736b12b3` ancestor, **37** beyond. Main has **not** advanced since the block was filed. r3's stated reference remains `f21693e0`, tree `9ca61132b14de175685fee9dee4fae579380eef9` (r3 line 26). FD-B3's bounded newer-main allowance applies; r4's own reference row must still be restated.
- **F9** — PR #43 landed the 2026-09-13 instrument set; the D-1 ruling is dated 2026-09-14 and is not in it. The conflation and the landing-vehicle question stand.
- **F10** — reconfirmed: `docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-02-r6.md` and `docs/planning/command-journal/custody/` are both **absent** from this checkout, and `origin/main` is **not** an ancestor of HEAD. Every repository read in this session was made via `git show origin/main:<path>`. r4 must be drafted the same way, and its delivery surface must be named by the Founder.

## 4. Disposition of the handoff's five amendment bullets

None is drafting-ready. Each is blocked on the same controlling input, and four
carry a live collateral finding that must be disposed of first.

| Bullet | Instruction (handoff) | Anchor verified at r3 committed line | Status |
|---|---|---|---|
| **1** | §5 or §9: SQL encoder is a second conforming serializer; `packages/journal` remains contract and vector source | §9, lines 1654–1656 | **BLOCKED** on D-1 bytes; **F4 conflict live** — addition is not purely additive |
| **2** | §7.2.1 (FD-B4): migration `0006` stays steps 1–13; functions/routines default-privilege review rides B-R11; r6 §2.8 adds no step-15 SQL | §7.2.1, line 1263 (`**Content of \`0006\`.** Migration \`0006\` implements **C-3 §6.1 steps 1 to 13**`) | **BLOCKED** on D-1 bytes; no collision found; cleanest of the five |
| **3** | §9.1 (FD-B5): for D-1 only, r6's append and pure-encoder signatures and return forms supersede the delegated choice | §9.1, line 1682 (`**FD-B5 is not an additional Founder issuance prerequisite.**`) | **BLOCKED** on D-1 bytes; **F2/F7 interaction** — binding *"the catalog tests"* to exact signatures is affected by which id owns the pure-encoder assertion row |
| **4** | §6 file map: add B-N2, B-N3, B-T4, B-R14 as D-1 scope; state §8's non-superuser mechanism is the B-M4/S4 carrier and D-1's condition is met only when the issuance names it | §6, line 1063 (closing line `**No path outside this table is authorized…**`) | **BLOCKED** on D-1 bytes; **F2 + R1 collision, F3 namespace, F6 wording — all three live** |
| **5** | §2.3 gate table: Gate III remains PROPOSED; scope-only, not issuance | §2.3, line 326 | **BLOCKED** on D-1 bytes; **F5 no-op** — state already holds |

## 5. The prepared payload remains intact and byte-anchored

The original blocker's §8 payload is preserved unchanged at the identity given in
§1 above. All five of its anchors were re-verified against the committed r3 blob in
this pass and bind **exactly**: §9 lines 1654–1656; §7.2.1 line 1263; §9.1 line
1682; §6 line 1063; §2.3 line 326. **It remains payload, not an act. It has no
path, no blob, no SHA-256, no authority, and it may not be cited.** Bullet 4's
payload sentence additionally requires the F6/R2 rewording before it can be adopted.

## 6. What would unblock, unchanged

The original blocker's §7 enumerates three acceptable unblock routes; all three
remain open and none has occurred. Restated for completeness:

1. The Founder lands `FOUNDER-RULING-pr2b-D1-scope-amendment-20260914.txt` into
   `docs/planning/command-journal/custody/` on `origin/main` (PR #43 precedent) and
   supplies the resulting blob id and SHA-256; **or**
2. The Founder supplies the ruling's exact bytes with byte count, line count,
   SHA-256, and a named custody path; **or**
3. The Founder expressly rules that the handoff's five amendment bullets **are** the
   D-1 ruling text and authorises citation by the handoff's own identity.

Additionally required before r4 is well-formed: dispositions for **F2/R1**
(identifier collision, two sites), **F3** (id namespace placement), **F4**
(prohibition conflict), **F6/R2** (S4/B-M4 wording), and **F9** (landing vehicle).

## 7. Authority and provenance

- **No repository mutation.** No file in `founder-os-build-room` was created,
  modified, or deleted in this pass. No commit, push, branch, PR, or merge occurred.
  `git status --short` is byte-identical to its state at the original session's
  start: four `??` entries, HEAD still `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`.
- **No r3 or r6 text was altered.** Both remain byte-identical at the identities in §2.
- **The original blocker was not overwritten.** This is a separate file; see §1.
- Every current-state claim here comes from fresh read-only inspection performed
  2026-09-14 after 18:57 EDT, not from memory. Repository facts were read via
  `git show origin/main:<path>`, `git ls-tree`, `git rev-parse`, and `git rev-list`;
  line citations were produced by `grep -n` over committed blobs.
- This file is advisory. It confers no approval, implementation, execution, merge,
  or issuance authority, and it may not be cited as authority for any purpose.

**Attribution.** Drafted by the `br-architect` seat. No commit was produced by this
act, so no attribution trailer is attached. Actor-Id, Session ID, Provider, and
Model telemetry for this pass: Session `20260914_185348_bc0c94`; Provider
`ollama-cloud`; Model `deepseek-v4.1-flash`; Actor-Id **UNAVAILABLE** (not issued by
this execution surface).

---

**TERMINAL STATUS: BLOCKED — CONTROLLING INPUT ABSENT. Re-verified on resumption:
the Founder's D-1 scope ruling is present on no surface this seat can read, no
landing has occurred since the block was filed, and no r4 draft act exists. The
handoff's five amendment bullets remain undraftable, now with four live collateral
findings and two refined ones.**

**FOUNDER DECISION REQUIRED — the D-1 scope ruling's exact bytes and custody path
(or an express ruling that the handoff's five amendment bullets are the controlling
text), together with dispositions for F2/R1, F3, F4, F6/R2, and F9.**
