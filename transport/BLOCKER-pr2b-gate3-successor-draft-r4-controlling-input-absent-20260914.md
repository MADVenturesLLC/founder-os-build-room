# BLOCKER FINDING — PR 2b Gate III successor draft (r4): controlling input absent

**Status: BLOCKED. NO r4 DRAFT ACT WAS PRODUCED. THIS FILE IS NOT AN ACT, NOT A
DRAFT, AND CONFERS NO AUTHORITY OF ANY KIND.**

Produced by the `br-architect` seat (Plan Authority; no approval, build, operate,
merge, release, or risk-acceptance authority) in response to the Founder handoff
titled *"PR 2b Gate III successor draft (r4)"*, received 2026-09-14.

Written under the seat's stop condition for a missing controlling input. No r3
text was modified. No repository mutation was made. No commit, push, or PR was
produced.

---

## 1. The controlling input, exactly as the handoff names it

The handoff's first and load-bearing instruction is:

> Incorporate the Founder's D-1 scope ruling, custody copy at
>   path:  `docs/planning/command-journal/custody/FOUNDER-RULING-pr2b-D1-scope-amendment-20260914.txt`
>   blob:  `<filled at landing>`
>   sha256: `<filled at landing>`
> and cite it by that exact path, blob, and SHA.

**Both the `blob` and the `sha256` fields are unfilled literal placeholders.** The
handoff therefore does not itself carry an identity for the artifact it orders me
to cite by exact identity.

## 2. Exhaustive search result: the artifact does not exist

Checked against repository `MADVenturesLLC/founder-os-build-room`, live, read-only,
2026-09-14.

| # | Surface checked | Result |
|---|---|---|
| 1 | `origin/main` = `ca3dea3e681a1804e4c0d8b65f7c9d88ca212aa9` (tree `f46292a514a545ce30f7a701af8d1a8697665a75`), path `docs/planning/command-journal/custody/` | **ABSENT.** The directory holds exactly 7 files, listed in §3. No `20260914` ruling of any kind is present. |
| 2 | All 46 remote heads (`git ls-remote --heads origin`) | **ABSENT** from every one. |
| 3 | All local refs (`refs/heads`, `refs/remotes`, 233 reachable commits via `git rev-list --all`) | **ABSENT.** `git cat-file -e <ref>:<path>` failed for every ref. |
| 4 | Full file history, path-filtered (`git log --all --name-only --diff-filter=A -- '*FOUNDER-RULING-pr2b-D1*'`) | **Zero hits.** `git log --all --name-only \| grep -c 'D1-scope-amendment'` → `0`. |
| 5 | Local working tree | **ABSENT.** `docs/planning/command-journal/custody/` does not exist on the current checkout at all. |
| 6 | Founder custody directory `/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/` (178 entries) | **ABSENT.** No file named `*D1*`, `*D-1*`, or `*scope-amendment*`. Its only `20260914` entry is the directory `pr2b-trancheB-evidence-20260914/`, containing one file: `SECTION-4.3-STARTING-BASE-BINDING-20260914.md`. Its `FOUNDER-RULING-*` file set is the 2026-09-13 gate-3 ruling only. |
| 7 | Transport worktree `br-transport-20260914/transport/` | **ABSENT.** Six gate-3 copies only, all dated `20260913`. |
| 8 | FounderOS sibling repository | **ABSENT.** No matching path or filename. |
| 9 | Hermes session store for this seat (`~/.hermes/profiles/br-architect/{pastes,state.db,.hermes_history,logs}`) | **PRESENT ONLY AS THE HANDOFF TEXT ITSELF.** The single hit, `pastes/paste_1_180227.txt` (1,513 bytes, 2026-09-14 18:02), is the handoff verbatim — including the two `<filled at landing>` placeholders. It is not the ruling. |
| 10 | Bounded filesystem sweep for `*D1-scope-amendment*` / `*scope-amendment*` under the user home | **Zero hits.** |

**Conclusion.** The D-1 scope ruling exists on no surface this seat can read. The
placeholder text `blob: <filled at landing>` indicates the landing has not
occurred; the fields cannot be filled from a landing that has not happened.

## 3. What `origin/main` custody actually contains (the PR #43 set)

`git ls-tree -r origin/main -- docs/planning/command-journal/custody`:

| Git blob | File |
|---|---|
| `833e106b9da1d87bc3e9c0b16e30b887cec1c31e` | `AMENDMENT-pr2b-test-role-fixture-r2-20260910.md` |
| `70c212194416ac353ac390b6f6ad367c1031a49b` | `BRIEF-founder-decisions-pr2b-gate3-FD-B1-B6-20260913.md` |
| `7260487caaf75c577b215924d2dd83cc5463529f` | `CUSTODY-RECEIPT-pr2b-gate3-copies-20260914.md` |
| `78ef441422714044663bf2c2cd34d493fdf00e00` | `DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-r3-20260913.md` |
| `19de437e0050502363a8dd5758c5a6cd4b8ba047` | `FOUNDER-AUTHORIZATION-pr2b-gate1-ISSUANCE-RECEIPT-20260910.md` |
| `477f10901ef95dd518fcfb173dc97e554569dcb2` | `FOUNDER-AUTHORIZATION-pr2b-gate3-PROPOSED-ISSUANCE-RECEIPT-20260913.md` |
| `55e5fbde58614de2e13b53a5c784fe9652657cf3` | `FOUNDER-RULING-pr2b-gate3-trancheB-complete-replacement-source-20260913.txt` |

Merge `f95d7995f984d06fa4c8b1f8e9e51fb9accc229c` (PR #43) **is** an ancestor of
`origin/main` — that handoff claim is **correct**. But PR #43 landed **six
instruments plus a receipt, and no 2026-09-14 D-1 ruling.** See finding F9.

## 4. Reference input verification (handoff's second block)

| Handoff claim | Verified result |
|---|---|
| Addendum 02 r6, blob `01f60a4e8f021e8eff3d2a310c9c393c9ee3f493` | **CONFIRMED.** `git cat-file -p` over that blob yields `16e316be4e8d52ae0e856cf53801180cd2a18209450c7e94954d80d107a8dcac`, 35,805 bytes, 529 lines. Path: `docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-02-r6.md` on `origin/main`. |
| Addendum 02 r6, sha256 `16e316be4e8d52ae0e856cf53801180cd2a18209450c7e94954d80d107a8dcac` | **CONFIRMED** — matches byte-for-byte. |
| Custody copies, merge `f95d7995f984d06fa4c8b1f8e9e51fb9accc229c` (PR #43), receipt included | **MERGE CONFIRMED** as an ancestor of `origin/main`; receipt `7260487caaf75c577b215924d2dd83cc5463529f` present. **Scope caveat at F9.** |

The handoff's one fully hash-bound reference input resolves cleanly. The ruling it
orders me to cite does not.

## 5. Why this seat halts rather than infers

1. The handoff requires citation **by exact path, blob, and SHA.** A Git blob id
   and a SHA-256 are functions of the artifact's bytes. The bytes are unavailable,
   so no conforming citation can be constructed. Substituting any value would
   place a fabricated exact-SHA citation inside a governance act — the precise
   failure mode the custody apparatus exists to prevent.
2. The handoff *summarises* the D-1 ruling's intended effect in five amendment
   bullets. **A downstream summary of a ruling is not the ruling.** Reconstructing
   a Founder ruling from a handoff's description of it is the inference of
   authority, which this seat may not do.
3. `BLOCKED — controlling input missing` is the seat's stated stop condition, and
   the correct terminal state. "No r4 draft act exists yet" is a true statement;
   "r4 amends r3 incorporating the D-1 ruling" would be false.

## 6. Findings that must be disposed of before r4 can be drafted

These are reported now, at zero cost, because each one would otherwise surface as
a defect in the r4 act after the ruling lands. **None of them is decided here.**

**F1 — Controlling input absent.** §1 and §2 above. The block.

**F2 — Identifier collision on `B-R14`.** r3 §6.3 (committed line 1113) already
assigns **B-R14** to *"Both privileged roles are `NOLOGIN` (`rolcanlogin=f`) with
no password set"* (PC-5). Addendum 02 r6 §4 (committed line 381) proposes **B-R14**
as *"the §2.8 denial and positive-control rows for the pure encoder."* The same
identifier is claimed by two different assertions. The handoff's bullet 4
("add ... B-R14 as D-1 scope") does not resolve which. **Disposition required:**
re-use B-R14 for the pure-encoder row and renumber the NOLOGIN assertion, or
assign the pure-encoder row a free identifier. This is the handoff's call or the
Founder's, not mine to invent.

**F3 — Namespace conflation in handoff bullet 4.** The instruction is to add
"B-N2, B-N3, B-T4, B-R14" to the **§6 file map**. But r3's §6 file-map table
contains only file-scoped ids (`B-M1`–`B-M4`, `B-N1`, `B-T1`–`B-T3`); assertion-scoped
ids (`B-R*`, `B-P*`, `B-H*`, `B-A*`) live in §6.3, §6.4 and §7.3, never in the §6
table. `B-R14` is an assertion id. **Placement decision required** before the edit
is well-formed.

**F4 — "Addition only" collides with a standing prohibition.** r3 §9 (committed
line 1654) states: *"**No alternate journal implementation is added.**
`packages/journal` remains the serialization and chain source of truth"*, and §5
(committed line 844) states: *"No alternate journal implementation alongside the
one specified."* Handoff bullet 1 orders the addition of: *"SQL encoder is a
second conforming serializer."* An unqualified addition leaves both prohibitions
standing and produces a self-contradicting act. This is **the same defect class
as the R3 repair's blocker #1** (r3 §0.5: surviving prohibition text contradicting
a later permitted behaviour). **A companion narrowing edit, or an express
reconciliation clause, is required** — which means the act is not purely additive.

**F5 — Handoff bullet 5 is a no-op as an edit.** r3's §2.3 table (committed line
326) already reads `| **III** | **This gate** | **PROPOSED** | this artifact |`.
No change is needed to preserve PROPOSED; the required edit is the addition of a
sentence, which needs an explicit anchor.

**F6 — "the B-M4/S4 carrier" mixes three different object classes.** `B-M4` is a
file-map id (`.github/workflows/ci.yml`, r3 §6 committed line 1061). `S4` is a
**stop condition**, defined at C-2 storage architecture r6 line 951 (*"CI cannot
run the negative matrix as a non-superuser login"*) and at C-3 implementation plan
r1 line 867 (stop-condition row, disposition `UNKNOWN — PO-1`, carrier `B-M4`).
r3 §8 is the PO-1 assessment. S4 is not a "carrier"; the carrier of the S4 stop
condition is B-M4. **Precise wording required** so the r4 sentence does not
misstate the C-2/C-3 id space.

**F7 — `B-M3` interaction.** r6 §4 states `B-M3 (tsconfig.json)` is still expected
to need no change. With B-N2 and B-N3 landing under `packages/control-plane/src/`
(r6 §4 lines 378–379), r3's `B-M3 = NOT NEEDED` expectation should be re-verified
rather than carried — r3 §6 already conditions B-M3 on "actual compiler or import
behaviour."

**F8 — Starting-base drift, disclosed.** r3's reference main is
`f21693e0c9c5d063b8cd150346477d0e49dc183e`; the §4.3 binding recorded in Founder
custody binds `dace9af9da158be8480b91d9576472645d068e3f`. Live `origin/main` is now
`ca3dea3e681a1804e4c0d8b65f7c9d88ca212aa9` — **45 commits beyond r3's reference**
main and **7 beyond the §4.3 bound base**, over 8 changed paths. All four bases
(`f21693e0`, `dace9af9`, `f95d7995`, `736b12b3`) are confirmed ancestors of
`origin/main`. FD-B3's bounded newer-main allowance applies, and main advancement
alone is not a stop, but **r4's own reference-main row must be restated**, not
inherited.

**F9 — The handoff's PR #43 claim conflates two landings.** "Custody copies merge
`f95d7995` (PR #43), receipt included" is literally true, but PR #43 landed the
**2026-09-13 gate-3 instruments**. The D-1 ruling is dated **2026-09-14**. A
reader could take the handoff to mean the D-1 custody landing already happened. It
has not. **Confirm the intended landing vehicle** for
`FOUNDER-RULING-pr2b-D1-scope-amendment-20260914.txt` (a further docs-only PR
following the PR #43 precedent, or the Founder supplying the bytes directly).

**F10 — Drafting surface.** The local working tree for this session is on branch
`builder/prereq-c-c2-broker-ledger-worker` at `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`,
which is **not** a descendant of `origin/main`. That checkout does **not** contain
`docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-02-r6.md` and
does **not** contain the `custody/` directory. Therefore **r4 must be drafted from
`git show origin/main:<path>`**, never from the working tree, and the delivery
surface for the r4 artifact must be named by the Founder. r3's own method
statement already binds this: *"Repository artifacts were read from committed
truth via `git show origin/main:<path>`, never from the working tree."*

## 7. What is required to proceed

Any one of the following unblocks the drafting:

1. The Founder lands `FOUNDER-RULING-pr2b-D1-scope-amendment-20260914.txt` into
   `docs/planning/command-journal/custody/` on `origin/main` (PR #43 precedent),
   and supplies the resulting blob id and SHA-256; **or**
2. The Founder supplies the ruling's exact bytes plus its byte count, line count,
   and SHA-256, with a named custody path; **or**
3. The Founder rules that the five amendment bullets in the handoff **are** the
   D-1 ruling text, and authorises citation by the handoff's own identity — this
   requires an explicit act, because it makes the handoff the controlling
   instrument rather than the ruling.

Additionally required before the act is well-formed: dispositions for **F2**
(identifier collision), **F3** (id namespace placement), **F4** (prohibition
conflict — additive vs. narrowing), **F6** (S4/B-M4 wording), and **F9** (landing
vehicle).

## 8. Prepared amendment payload (NOT AN ACT — for the Founder's use)

Recorded so no drafting work is lost. **This is payload text, not a draft act. It
has no path, no blob, no SHA-256, no authority, and it may not be cited.** Each
item is quoted as the Foundation may wish to adopt, alter, or reject it.

Anchor: **§9, after the sentence ending "…migration `0006` establishes the database-side authority for it."** (r3 committed lines 1654–1656)

    The SQL encoder specified by Addendum 02 r6 §2.3 is a second conforming
    serializer of the same contract bytes; `packages/journal` remains the
    contract and vector source of truth, and no second serialization contract
    is created.

Anchor: **§7.2.1, appended to the "Content of `0006`" paragraph** (r3 committed line 1261 ff.)

    Migration `0006` remains C-3 §6.1 steps 1 to 13; the functions/routines
    default-privilege review rides the B-R11 row, and Addendum 02 r6 §2.8 adds
    no step-15 SQL.

Anchor: **§9.1, appended after the sentence ending "**FD-B5 is not an additional Founder issuance prerequisite.**"** (r3 committed lines 1682–1683)

    For D-1 only, Addendum 02 r6's append and pure-encoder signatures and return
    forms supersede the delegated choice; creation, revocation, grants, and the
    catalog tests bind those exact signatures.

Anchor: **§6 file map, before the closing line "**No path outside this table is authorized, by implication or otherwise.**"** (r3 committed line 1063)

    B-N2, B-N3, B-T4, and B-R14 are D-1 scope. The §8 non-superuser mechanism
    is carried by B-M4 and is the carrier of stop condition S4; D-1's condition
    is met only when the Gate III issuance names it.

Anchor: **§2.3 gate table, the `III` row** (r3 committed line 326)

    Gate III remains PROPOSED. This scope amendment, and the D-1 ruling it
    incorporates, are scope-only; neither is issuance.

## 9. Authority and provenance

- No repository mutation was performed. No file in `founder-os-build-room` was
  created, modified, or deleted. No commit, push, branch, PR, or merge occurred.
- No r3 text was altered. r3 remains byte-identical at its committed identity
  (`78ef441422714044663bf2c2cd34d493fdf00e00`,
  SHA-256 `d024e508d77169c5d85d323fb28f32c6ea5c2b709d2e12cc3470f0bde37f5945`,
  137,939 bytes, 2,285 lines).
- Every current-state claim in this file comes from fresh read-only inspection
  performed in this session on 2026-09-14, not from memory. Repository facts were
  read via `git show origin/main:<path>` and `git ls-tree`, per r3's method.
- This file is advisory. It confers no approval, implementation, execution, merge,
  or issuance authority, and it may not be cited as authority for any purpose.

**Attribution.** Drafted by the `br-architect` seat. No commit was produced by
this act, so no attribution trailer is attached.

---

**TERMINAL STATUS: BLOCKED — CONTROLLING INPUT ABSENT. The Founder's D-1 scope
ruling, ordered to be cited by exact path, blob, and SHA, is present on no
surface this seat can read; the handoff's `blob` and `sha256` fields are unfilled
literal placeholders. No r4 draft act was produced.**

**FOUNDER DECISION REQUIRED — the D-1 scope ruling's exact bytes and custody
path (or an express ruling that the handoff's five amendment bullets are the
controlling text), together with dispositions for F2, F3, F4, F6, and F9.**
