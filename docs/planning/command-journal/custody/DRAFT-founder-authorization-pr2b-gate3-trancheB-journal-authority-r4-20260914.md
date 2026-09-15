# DRAFT FOUNDER AUTHORIZATION — PR 2b Gate-III Tranche B (R4)
## Journal Database Authority, Database Append Primitive, and Administrative Migration Runner

**Status: DRAFT — NOT EFFECTIVE. NO IMPLEMENTATION AUTHORITY EXISTS UNTIL A SEPARATE SIGNED FOUNDER ISSUANCE RECEIPT NAMES THIS ARTIFACT'S SHA-256.**

**Plan rulings FD-B1 through FD-B7 are RULED and incorporated once at §0.** The
rulings are prospective and govern preparation and independent document review
only. They confer no implementation, execution, merge, or deployment authority.
A separate Gate III implementation issuance, after the independent document
review, remains required before any operational permission described here may be
exercised.

This artifact creates no code, test, PostgreSQL role, credential, token,
permission, GitHub environment, GitHub secret, repository setting, Railway
service, Railway variable, Neon object, migration, branch, commit, or PR.

| Field | Value |
|---|---|
| Work ID | `BR-PR2B-GATE3-TRANCHE-B-DRAFT-R3` |
| Repository | `MADVenturesLLC/founder-os-build-room` |
| Gate | **III** (r1 §9) |
| Authorizes | Tranche B **code, tests, and the bounded CI integration**, and the **authorized disposable-fixture acceptance tests** of migration `0006` and `migrate:admin`, including their per-run ephemeral fixture credentials (§5.1, §7.3). **No governed, shared, staging, production, or Neon execution. No production administrative credential. No Gate IV protected-plane execution.** |
| Drafting seat | `br-architect` (Plan Authority; no approval, build, operate, merge, release, or risk-acceptance authority) |
| Drafted | 2026-09-13 (UTC) |
| Finalized | 2026-09-13 (UTC). Finalization pass added §2.5 (B6 base-naming trace), §5.2 (B5 A2 prerequisite), §5.3 (A2 recovery mapping), §2.8 (qualification input) |
| **Starting base (reference)** | `origin/main` = `f21693e0c9c5d063b8cd150346477d0e49dc183e`, tree `9ca61132b14de175685fee9dee4fae579380eef9` |
| **Starting base (reference), restated at R4** | `origin/main` = `baee3fb2910348c8d256ea6d0ad3c49f5beafcb2`, tree `cd3463b56af8642ef933d5bc47fc1997b9283bd9` — restated from fresh inspection in this round; see §4.6.1 (F8). **R3's row above is retained, not replaced.** |
| Actual starting base | **Not fixed by this draft.** Bound by the executor at execution time per §4.3, recorded in writing before the worktree is created |
| Signature fields | **DELIBERATELY UNFILLED** |
| Predecessor (frozen R1) | `DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-20260913.md`, SHA-256 `4fee6482420b95062e5133f0c575f8a377ff73ec951ba806194095bb6be2e4eb`, preserved byte-unchanged |
| Predecessor (reviewed R2) | `DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-r2-20260913.md`, SHA-256 `5da119c9b0e9ce61b2e89b50a03fb7cb0f99399efe79975821e054fa8303eb80`, preserved byte-unchanged |
| Predecessor (this act's R3) | `DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-r3-20260913.md`, blob `78ef441422714044663bf2c2cd34d493fdf00e00`, SHA-256 `d024e508d77169c5d85d323fb28f32c6ea5c2b709d2e12cc3470f0bde37f5945`, 137,939 bytes, 2,285 lines, **preserved byte-unchanged** |
| Incorporated rulings | FD-B1 to FD-B7, Founder message `ff56f500-d562-4a73-835f-5c6bf4144ae1`, see §0 |
| Incorporated rulings (R4 round) | Founder D-1 scope ruling of 2026-09-14, **landed on `main`** by merge `baee3fb2910348c8d256ea6d0ad3c49f5beafcb2` (PR #44), blob `6be4e0576533a5a459a19e7338f245d1fa0634b0`, SHA-256 `da1b3b5f7814f6cdfb623945028d12484e379f94997c768f42edb9885dff3e33`, see §0.6 |
| Work ID (this act) | `BR-PR2B-GATE3-TRANCHE-B-DRAFT-R4` |

---

## 0. Founder plan rulings, incorporated once

### 0.1 Source and custody

This R2 successor incorporates, **once**, the Founder plan rulings issued in the
message titled *"FOUNDER RULING — PR 2b GATE III / TRANCHE B — COMPLETE
REPLACEMENT SOURCE AND DRAFTING AUTHORIZATION"*.

| Field | Value |
|---|---|
| Preserved verbatim at | `hermes-profile-suite/FOUNDER-RULING-pr2b-gate3-trancheB-complete-replacement-source-20260913.txt` |
| SHA-256 | `2431c6338d45d2eea074d2fe0ac797f70f0a555e78d80b005a2ee2924a9dcd6d` |
| Bytes | 11194 |
| Newlines (`wc -l`) | 256 |
| Text lines | 257 |
| Trailing newline | absent |
| Message identifier | `ff56f500-d562-4a73-835f-5c6bf4144ae1` |
| Session-store timestamp | `2026-09-13T21:11:18.319Z` |
| Session id | `be3a0f36-6823-4160-be95-d65590a9c971` |

**Timestamp semantics, stated rather than assumed.** The timestamp above is the
Claude Code session-store record timestamp for that message. The ruling states:
*"These plan rulings take effect upon my posting this message in the receiving
conversation. That conversation is the governance thread for this act; a GitHub
posting is not required."* On that instruction the value above is the governance
thread posting time. **No assistant clock was used, and no time was inferred,
substituted, or backdated.**

### 0.2 The superseded reference, disclosed not hidden

The Founder's two earlier messages of the same date adopted a block titled
*"FINAL PROPOSED RULING BLOCK — FOR FOUNDER APPROVAL"*. **That block was never
transmitted and was never located.** A read-only search of the full workspace
tree and of every transcript in both session stores returned no instance of it,
of `FD-B2(a)`, or of the four-plus-one membership probe wording. It was **not**
reconstructed, and the earlier `BRIEF-…-FD-B1-B6-20260913.md` §10 block was
**not** substituted for it.

The ruling message resolves this expressly: *"This message is self-contained. It
replaces the missing ruling-block reference in my earlier approval and
clarification messages. Those messages remain preserved as historical evidence;
no missing source is reconstructed, and this message is not represented as a
verbatim copy of an earlier block."*

Custody of the superseded history is preserved at
`CUSTODY-RECORD-pr2b-gate3-trancheB-founder-messages-20260913.md`, together with
both earlier Founder messages, verbatim.

### 0.3 Effect and execution boundary, quoted

> "These rulings authorize preparation and independent document review only.
> All operational permissions described below remain conditional on a separate
> Gate III implementation issuance after that review.
>
> No code implementation, fixture SQL, execution dispatch, repository mutation,
> GitHub write, ready transition, merge, deployment, or A2 work is authorized
> by this message."

### 0.4 Disposition map

| Id | Disposition | Incorporated at |
|---|---|---|
| **FD-B1** | **RULED.** Gate IV completion gates governed execution of `0006`, not authorization, review, or merge of Tranche-B code. | §2.6, §5.1, §15.4 |
| **FD-B2** | **RULED.** §7.3 authority permitted only as bounded by the ruling, with exclusive disposable ownership, enumerated cleanup, and credential handling. | §7.3 |
| **FD-B2(a)** | **RULED.** B-R8 positive detection controls via one ephemeral NOLOGIN probe role. | §6.3.1, §7.3 |
| **FD-B3** | **RULED.** Bounded newer-`origin/main` starting base for Tranche B only. | §4.2, §4.3, §15.4 |
| **FD-B4** | **RULED.** `0006` implements C-3 §6.1 steps 1 to 13; step 15 moves to B-R11, step 16 to B-R8; step 14 defers to Tranche D. | §7.2.1 |
| **FD-B5** | **DELEGATED.** Append signature and return type are the Builder's choice under PO-6, subject to review. | §9.1 |
| **FD-B6** | **DELEGATED.** B-T1 carries its assigned denial, positive-path, and hash-binding assertions within the existing file map. | §6.3 |
| **FD-B7** | **NON-BLOCKING.** Unchanged. | §2.5.4 |

Neither FD-B5 nor FD-B6 is an additional Founder issuance prerequisite.

### 0.5 R3 repair scope — drafting under the existing ruling

**R3 is a repair of R2, not a new decision.** It incorporates no new Founder
ruling, opens no gate, and reopens nothing settled. The controlling authority is
unchanged and remains the message preserved at §0.1, SHA-256
`2431c6338d45d2eea074d2fe0ac797f70f0a555e78d80b005a2ee2924a9dcd6d`.

R3 closes the two issuance blockers returned by the independent document review
of R2:

| Artifact | SHA-256 |
|---|---|
| Reviewed target (R2), preserved unchanged | `5da119c9b0e9ce61b2e89b50a03fb7cb0f99399efe79975821e054fa8303eb80` |
| Review report, `REQUEST CHANGES` / `DOCUMENT REVIEW FAILED`, preserved unchanged | `2a7b188bf3cc3db854ce33ff71b10064cc441ce133fee54cd0dc9931eec9b032` |

| Blocker | Defect | Repaired at |
|---|---|---|
| **1** | Surviving R1 prohibition text forbade disposable `migrate:admin` and runner execution that FD-B1 permits, contradicting §2.6, §15.4, and §17.1 | header **Authorizes** row; **§5.1** prohibition paragraph; **§5.1** r6 §11.2 execution-route paragraph |
| **2** | §8.4 cited predecessor item range "1 through 17" after §7.3 was rewritten to items 1 to 19, excluding the `pg_roles` absence assertion and the fail-qualification rule from PO-1's stated set | **§8.4** |

**No other provision was rewritten.** The repair adds no gate, grants no
permission the ruling does not already contain, and narrows nothing. A full
scan for repetitions of both defect classes is recorded at §19.

### 0.6 The D-1 scope ruling of 2026-09-14 — incorporated once (this amendment)

**This is the only Founder ruling this R4 round incorporates.** Like R3, R4 is
an amendment of its predecessor and not a new decision: it opens no gate, grants
no permission the incorporated rulings do not already contain, and confers no
implementation authority.

**Citation, exact — required by the ruling's own closing terms** (ruling lines
66–67: *"The successor draft must cite this ruling by its exact repository path,
git blob id, and SHA-256 as landed on founder-os-build-room main."*):

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-pr2b-D1-scope-amendment-20260914.txt` |
| Git blob id | `6be4e0576533a5a459a19e7338f245d1fa0634b0` |
| SHA-256 | `da1b3b5f7814f6cdfb623945028d12484e379f94997c768f42edb9885dff3e33` |
| Bytes | 3912 |
| Lines | 82 (`wc -l`) |
| Trailing newline | present (single LF) |
| Signed | Michael Alberto Daley, dated 2026-09-14, in the ruling's own closing lines |

**Landed, and verified as landed this round.** The ruling's own requirement is
citation *"as landed on founder-os-build-room main"*. That landing has now
occurred, and each element was re-read from committed truth:

| | Value |
|---|---|
| `origin/main` | `baee3fb2910348c8d256ea6d0ad3c49f5beafcb2`, tree `cd3463b56af8642ef933d5bc47fc1997b9283bd9` |
| Merge commit | `baee3fb2910348c8d256ea6d0ad3c49f5beafcb2` — *"Merge pull request #44: docs: land Founder D-1 scope ruling in custody (scope-only)"*, parents `ca3dea3e681a1804e4c0d8b65f7c9d88ca212aa9` and `2d80de07f27e3da905fcd96f6688bd9cfc377e4a` |
| Merge is an ancestor of `main` | **YES**, verified |
| Path on `main` | **PRESENT** at the path cited above |
| Blob on `main` | `6be4e0576533a5a459a19e7338f245d1fa0634b0` — **matches the citation** |
| SHA-256 re-derived from `main` | `da1b3b5f7814f6cdfb623945028d12484e379f94997c768f42edb9885dff3e33` — **matches the citation byte-for-byte** |
| Bytes / lines on `main` | 3,912 / 82, trailing LF present |
| Accompanying custody receipt | `custody/CUSTODY-RECEIPT-pr2b-D1-scope-ruling-20260914.md`, blob `8b4b790c8056e953cce294bfe77ed45a65197d87`, landed by the same merge |
| PR #44 change set | exactly **two added paths**, plus the merge; `ca3dea3e…` → `baee3fb2…` is **2** commits, **2** changed paths |

**This closes F1 and F9.** F1 (controlling input absent) is closed because the
instrument's bytes and its landed identity both resolve exactly as cited; F9 (the
handoff's PR #43 claim conflated two landings) is closed because PR #44 is now a
completed landing, not a pending vehicle, and the two PRs are distinguishable by
their own merge commits.

**What D-1 rules, quoted verbatim.** The ruling states its own scope first
(ruling lines 6–8):

> This ruling is scope-only. It is not Gate III implementation issuance.
> It creates no implementation, execution, merge, deployment, credential,
> or fixture authority. Gate III remains PROPOSED and unsigned.

The D-1 acceptance and its condition (ruling lines 31–44):

> I accept D-1 as a proposed Tranche B scope amendment only, including
> B-N2, B-N3, B-T4, r6 §2.8, and the denial row r6 labels "B-R14",
> which is renumbered B-R16 by this ruling because plan r1 §5.2 already
> assigns B-R14 to the NOLOGIN assertion (PC-5); r1's B-R14 and B-R15
> are unchanged, and every r6 reference to its proposed "B-R14" reads
> B-R16. Acceptance is conditional on the governing Gate III instrument
> adopting r6 §2.3's interface and on B-M4, the ci.yml file-map change,
> clearing plan r1 stop condition S4 by the mechanism r3 §8 specifies.
> Otherwise the caller is withdrawn.
>
> No Gate III execution authority is effective unless the issuance names
> the CI bootstrap/identity mechanism under which the denial matrix and
> vector tests run as the required non-superuser login, thereby clearing
> S4 through B-M4. The mechanism is not chosen by this ruling.

**The three binding reconciliation sentences, quoted verbatim** (ruling lines
50–54, 56–59, 61–64). Each is inserted below at the site the handoff directs;
none is paraphrased anywhere in this act:

> 1. r6's SQL encoder is a second conforming serializer implementation
>    required to produce byte-identical canonical bytes with
>    packages/journal; it is not a second journal, chain, sequence space,
>    writer, or runtime consumer, and does not displace packages/journal
>    as the contract and reference-vector source.
>
> 2. r6 §2.8 does not return step 15 to migration 0006 or extend that
>    migration's DDL. Its functions/routines default-privilege review
>    belongs to FD-B4's B-R11 carrier; migration 0006 remains steps 1–13
>    only, with no step-15 SQL.
>
> 3. For this D-1 scope amendment only, r6's specified append and
>    pure-encoder signatures and return forms supersede FD-B5's otherwise
>    delegated signature/return choice; creation, revocation, grants, and
>    catalog tests must bind those exact signatures.

**Where each instruction was placed.**

| Ruling / handoff instruction | Insertion site (R3 committed line) | Finding it disposes |
|---|---|---|
| Sentence 1 — SQL encoder is a second conforming serializer | §5 after line 844, and §9 after line 1655 | F4, Founder-accepted |
| Sentence 2 — `0006` stays steps 1–13; the default-privilege review rides B-R11 | §7.2.1 after line 1263 | FD-B4 (no conflict found) |
| Sentence 3 — r6's signatures supersede FD-B5's delegated choice for D-1 | §9.1 after line 1682 | FD-B5 |
| `B-N2`, `B-N3`, `B-T4` as D-1 scope | §6 file map, after line 1060, with a scope note after line 1063 | F3 — ruled |
| Pure-encoder denial row renumbered `B-R16`; r1/r3 `B-R14` and `B-R15` untouched | §6.3 table, after line 1120 | F2, F3, R1 — ruled |
| `B-M4` clears `S4`; D-1's condition met only when the issuance names the mechanism | §8.8, new, after line 1624 | F6, R2 — ruled |
| Gate III remains PROPOSED; scope-only, not issuance | §2.3, after line 326 | F5, Founder-accepted |
| `B-M3` carried as `re-verify at execution against actual compiler and import behaviour` | §6, after the B-M3 row at line 1057 | F7, Founder-accepted |
| Reference main restated at R4's own base | header row after line 26; §4.6.1, new, after line 790; §18 note after line 2140 | F8, Founder-accepted |
| Draft from `git show origin/main:<path>`; delivery and landing separated | §13.3, new, after line 1824; §19 unchanged | F10, Founder-accepted |
| F1 and F9 | closed by the PR #44 landing; recorded at §0.6 above | F1, F9 |

**One declared deviation from strict addition, disclosed.** Handoff bullet 1
orders amendment *"by addition only"* and *"delete nothing"*. This act changes
exactly one existing character run: the title line's revision designator,
`(R3)` → `(R4)`, so that the artifact identifies itself correctly. **R3 set this
precedent when it designated itself `(R3)` as a repair of R2 (§0.5).** Everything
else in this act is pure insertion; R3's line 1 is the only replaced line, and it
is recorded here rather than changed silently.

---

## 1. Controlling artifact bindings

Every hash below was computed live in this session against the resolved path
shown. Repository artifacts were read from committed truth via
`git show origin/main:<path>`, never from the working tree.

### 1.1 In-repository (committed) controlling stack

| # | Artifact | Exact repository path | SHA-256 (content) | Git blob | Source commit (last change) |
|---|---|---|---|---|---|
| C-1 | Journal contract **v0.17** | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` | `f982b3d3cf94be0b682dde36fe292c5f60d2b0ef` | `b92889e6b16e9e4ca221247458cfd39ea46fc9e2` (2026-09-01) |
| C-2 | Storage architecture **r6** (frozen) | `docs/planning/command-journal/pr2b-storage-architecture-r6.md` | `658daa9c0194d5f56d7506fb8ade05d24d413cd08b106a067ff9100ce5815954` | `4d3e78c055f2fa7871890fd54d7b74ecc37685c7` | `f1d1026c33d1ac13562c1e36063f6c3cf86a5ff0` (2026-09-09) |
| C-3 | Implementation plan **r1** | `docs/planning/command-journal/pr2b-implementation-plan-r1.md` | `08f3ea7418db7052ffd7fb4cf6df4672f169c95933a7c07c71ef637ae775b3ce` | `c9436f11ec11312264295f99389649fe986f7f87` | `f1d1026c33d1ac13562c1e36063f6c3cf86a5ff0` (2026-09-09) |
| C-4 | Implementation plan r1 **Addendum 01** (FD-1 disposition) | `docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-01.md` | `91c0133448dc632ee269313fc56092dad95b3fedc7d41d65baf29297dfd1dc87` | `97a6f9455b9e7ab5cdf0e33942a7e89a306d9bac` | `f1d1026c33d1ac13562c1e36063f6c3cf86a5ff0` (2026-09-09) |

**Contract version verified, not assumed.** C-1's own line 1 reads
`# Build Room Canonical Command Journal — Contract v0.17 (PROPOSED)`. The
commissioning prompt's "v0.17" is **confirmed correct**. Its SHA-256 is
unchanged from the value bound at Gate I, so **S2 is NOT TRIGGERED**.

### 1.2 Off-repository (Founder authority) effective issuance identities

| # | Artifact | Resolved path (under `/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/`) | SHA-256 | Effective status |
|---|---|---|---|---|
| E-1 | Gate-I issuance receipt | `FOUNDER-AUTHORIZATION-pr2b-gate1-ISSUANCE-RECEIPT-20260910.md` | `277f85e3f98acbe91d84cb82a174a64c096997edab4828a806fb2225239883d1` | **EFFECTIVE** 2026-09-11T10:32:00Z |
| E-2 | Gate-I authorized draft (named by E-1) | `DRAFT-founder-authorization-pr2b-gate1-r2-20260910.md` | `fd44b947bd61bf50386f554b5bd07dae827dd13adef6b3021633d682c03f3cc7` | authorized by E-1 |
| E-3 | Preflight-sequencing amendment r3 rebind | `AMENDMENT-pr2b-preflight-sequencing-r3-rebind-20260910.md` | `aab512085a56fb343c8b746200f3963112950986b3856704152480116f175424` | **IN ACTIVE PLAN STACK — REBOUND THIS STACK'S EXACT BASE** to `ef7a4792…` / tree `31b132de…`. Decisive at §2.5 |
| E-4 | Test-role fixture amendment r2 | `AMENDMENT-pr2b-test-role-fixture-r2-20260910.md` | `c7098b3f45cd755b7360b4cc339c41bd39117c1970da38301b0d8a4d33f363ff` | **RATIFIED** by E-5 |
| E-5 | Gate-I supplement (ratifies E-4) | `FOUNDER-SUPPLEMENT-pr2b-gate1-test-role-fixture-20260911.md` | `362c7b475cf02a3e1dbe04af53549637ec88c079d297182dbd66967e56ea06e2` | **EFFECTIVE — PLAN AMENDMENT AND GATE-I SUPPLEMENT ONLY.** Carries unfilled placeholder fields; checked narrowly at §1.4 and **not** relied on for any timing. No superseding act found |
| E-6 | Independent recheck named by E-5 | `HANDOFF-operator-to-founder-pr2b-test-role-fixture-r2-recheck-20260911.md` | `565f00a32ed3c249a2ddcdd4df42c43964cb5e0e9a92536c5b70e108677e4950` | matches E-5's citation |
| E-7 | PR 2b lane A2-prerequisite qualification receipt | `QUALIFICATION-RECEIPT-pr2b-lane-A2-prerequisite-20260913.md` | `22b96d1d6f0f607a8732d4621259aaf92a271aeb15d52e501dbed9a84121cc66` | **NOT QUALIFIED** — supporting evidence, **not authority**. Names this draft at a superseded hash; see §2.8 |
| E-8 | Re-ratification of E-3 (binds the successor base) | `FOUNDER-ACCEPTANCE-pr2b-preflight-sequencing-r3-phase1-rebind-20260910.md` | `b7c424b5648f06493d46657235c7c84668f74aa31c2181d5465713da7b934264` | **EFFECTIVE.** Binds base `ef7a4792…` / tree `31b132de…`. Decisive at §2.5 |

Every hash E-5 cites was re-verified against its file in this session and
**matches**. E-3's hash matches the value E-4 carries in its own active-plan-stack
list. No authority below is carried on trust.

**E-3, E-4, and E-5 are Tranche-A scoped.** Grep of E-3 and its acceptance and
addendum companions returned zero references to Tranche B, migration `0006`,
`migrate-cli`, `migrate:admin`, or journal authority. **E-4/E-5's role exception
amends r1 §4.1 (Tranche A's FORBIDDEN list) only.** See §7.4.

### 1.3 Safety protocol

| Artifact | Custody paths | SHA-256 | Verified |
|---|---|---|---|
| Safe-tree advisory | `_quarantine-20260912-stale-tree/ADVISORY-update-all-defect-20260912.md` **and** `hermes-profile-suite/advisories/ADVISORY-update-all-defect-20260912.md` | `cf341c668d88dfaf2adac3c2ddb30e7b571d8c14fa54b9ba13854d46ae16699b` | **MATCHES the commissioned hash at both custody copies** (5,435 bytes each) |

### 1.4 The Gate-I supplement's placeholder defect — determined narrowly

A defect is **alleged** against E-5. It is checked here against **E-5 alone**, on
its own bytes and its own original posting. **No finding is generalised from
another receipt's defect**, and no defect from a different act is imported here.

**The exact file and hash.** `FOUNDER-SUPPLEMENT-pr2b-gate1-test-role-fixture-20260911.md`,
SHA-256 `362c7b475cf02a3e1dbe04af53549637ec88c079d297182dbd66967e56ea06e2`,
1,684 bytes / 43 newline counts / trailing newline **false** (last byte `0x79` =
`y`). Re-derived on disk in this session; it matches the value this draft carries
at §1.2 E-5 and the value E-5's own text is cited by elsewhere in the stack.

**The placeholder fields, quoted literally.** Lines 5 and 6 read exactly:

```
Preflight verified at (UTC): <actual verification timestamp>
Issued at (UTC): <actual posting timestamp>
```

No datetime value appears in either field. Every other field in E-5 is filled:
the amendment and recheck hashes, the signature-time repository binding
(`ef7a4792…` / `31b132de…`), the supplemented receipt hash (`277f85e3…`), the
exception text, and the status line.

**The original Founder posting — located and compared byte-for-byte.** The act
is the Founder's own posting, preserved in the Architect session store as
`~/.hermes/profiles/br-architect/state.db`, `messages.id=1376`, `role=user`,
session `20260911_132859_d8e78d`, recorded `2026-09-11 17:29:00` local. That
message's stored content is **byte-identical** to the on-disk file: both are
exactly **1,684 UTF-8 bytes** and both carry **no trailing newline**; extracting
the posting and hashing it yields the same value, `362c7b47…06e2`. The
placeholders are therefore **in the Founder's own signed posting** — the defect
is the Founder's own unfilled fields, not an artifact of transcription, copying,
or this seat. The `Signed:` line is present and is not a placeholder.

**Effective superseding act — none found.** A search across every Hermes profile
store and the repository for a later Founder act that fills, replaces, amends,
or re-issues E-5 returned **no such act**. The two subsequent acts in this line
that do address receipt timestamps deal with **different receipts**: the
retention disposition `2aab0196…` rules the *assistant-substituted* timestamps in
the earlier adoption-receipt copies (`4557ebed…`, `3ffd42dd…`) invalid as
issuance receipts; it does not touch E-5. The Gate-II merge act `e5c5566…970c`
contains no provision addressing E-5.

**Its specific effect on Tranche-B entry: NONE.** Stated precisely, and without
borrowing reasoning from the other receipt's disposition:

1. **The defect is not the same defect class as the ruled-upon one.** The ruled
   defect was *assistant substitution* of a timestamp into the Founder's text —
   an agent writing a value the Founder did not post. E-5's fields are
   *unfilled placeholders in the Founder's own posting*: no value was
   substituted by anyone. The act is exactly as the Founder posted it.
2. **The unfilled fields are not operative to Tranche B.** E-5's operative
   content is the ratification of E-4, the adoption of the amendment into the
   plan stack, the scope of the A-R3 exception, and the status line
   `EFFECTIVE — PLAN AMENDMENT AND GATE-I SUPPLEMENT ONLY`. None of the
   unfilled fields is a precondition to any of that, and none is cited by any
   clause this draft relies on.
3. **This draft does not carry E-5's temporal validity as authority.** §1.2 E-5
   is bound for its *scope* — what the exception permits and forbids — not for a
   timestamp. Tranche B's entry conditions are Gate I (E-1, `277f85e3…`, which
   is dated `2026-09-11T10:32:00Z` and is not defective), Gate III issuance, and
   §4's base allowance. E-5 supplies none of them.
4. **The effect on Tranche B is nil in both directions.** This defect neither
   blocks Tranche-B entry nor grants it. It is recorded, not demanded: **no
   retroactive re-issuance, no re-execution, and no cure act is required or
   requested.** If the Founder elects to re-issue E-5 for record completeness
   that is his act alone; nothing in this draft depends on it, and its absence
   creates no stop condition.

**Confidence.** Certain on the file identity, the literal placeholder text, the
byte-equality of the posting to the file, and the absence of a superseding act
— each observed directly. The *characterisation* of the defect's class is
reasoning from those observations, stated as such.

**The scope limit.** This finding concerns E-5 and nothing else. It is **not** a
finding about E-1, E-2, E-3, E-4, or any Gate-II receipt, and no conclusion here
may be extended to any of them.

### 1.5 Non-bindings

No authority in this draft derives from "latest," "already approved," an
unissued draft, or a document's own self-citation. The Gate-II Tranche-A drafts
(`DRAFT-founder-authorization-pr2b-gate2-trancheA-r3/r4/r5-*.md`) are **not**
cited as authority here; they governed Tranche A and are spent.

---

## 2. Prerequisite and gate mapping — verified live

### 2.1 PR state, verified against GitHub, not against a prior report

| PR | Title | State | Head (reviewed candidate) | Merge commit | Merged at (UTC) | Merged by |
|---|---|---|---|---|---|---|
| **#29** | `feat(run-harness): provider-free planner admission fixture (A1 — Background-Agents)` | **MERGED** | `19f08143004f496ab79df04020fef69b1976d548` | `9a43d0aae98c0f2fb72dce059a951bd9a9f201ad` | 2026-09-13T11:01:04Z | `decivantiq` |
| **#27** | `feat(control-plane): replace boot migration with staged schema preflight (PR 2b Tranche A) [DRAFT]` | **MERGED** | `8f9916044d662a184f2fa324893c4fe5578560be` | `f21693e0c9c5d063b8cd150346477d0e49dc183e` | 2026-09-13T16:36:56Z | `decivantiq` |

**Both Founder-reported identities are CONFIRMED.** PR #27's reviewed candidate
head is exactly `8f991604…60be` and its merge commit is exactly
`f21693e0…83be`, as reported. PR #29 merged **first**; PR #27 was based on
`9a43d0aa…01ad` (PR #29's merge commit) and merged on top of it.

### 2.1.1 The ready/merge act, bound in full

The act that transitioned and merged PR #27 is a Founder authorization posted on
the PR. It is bound here in full, not abbreviated, because it is the controlling
authority for the completed repository work:

| Field | Value |
|---|---|
| Act body SHA-256 | `e5c5566710ef9a2d07fc4ffcaecd22ff02154107a2a9b8f0a91c18abb633970c` |
| Live PR record | `issues/27` comment `id=5654523254`, `user=decivantiq`, `created_at=2026-09-13T16:27:18Z` |
| Off-repository custody copy | `~/.hermes/profiles/br-builder/advisories/FOUNDER-ACT-pr27-ready-transition-and-merge-20260913.md`, 1,872 bytes; **re-derived in this session, MATCHES** |
| Names exactly | head `8f9916044d662a184f2fa324893c4fe5578560be`; tree `9ca61132b14de175685fee9dee4fae579380eef9`; expected main `9a43d0aae98c0f2fb72dce059a951bd9a9f201ad` |
| Names the independent review as | `HANDOFF-operator-to-founder-pr27-8f991604-final-integration-review-20260913.md`, SHA-256 `46e9bfde57081cbc93074d9995eaa0fb83e194f215b01810d150c7d001d0d7ad` — **re-derived in this session, MATCHES** |
| Prohibits | squash, rebase, force-push, admin override, ruleset bypass, branch deletion |
| States expressly | *"This act does not retroactively authorize earlier execution."* |
| Grants | no product edits, no PR-body edits, no deployment, no activation, **no later-tranche authority** |

**No later-tranche authority is derived from this act.** It closed out PR #27; it
authorizes nothing in Tranche B. `MERGE_AUTHORITY=NONE` and
`TRANCHE_B_AUTHORITY=NONE` in the Gate-II rebind act
(`~/.hermes/profiles/br-builder/pastes/paste_2_091300.txt`, 5,257 bytes,
SHA-256 `61c049c699152e046eaf0f74cf3588686ba89441f9977389dc62189ec5e7219b`,
re-derived here) remain the positions of that act.

### 2.2 Ancestry

| Commit | Ancestor of `origin/main`? |
|---|---|
| `8f9916044d662a184f2fa324893c4fe5578560be` (PR #27 head) | **YES** |
| `f21693e0c9c5d063b8cd150346477d0e49dc183e` (PR #27 merge) | **YES** (it *is* `origin/main`) |
| `19f08143004f496ab79df04020fef69b1976d548` (PR #29 head) | **YES** |
| `9a43d0aae98c0f2fb72dce059a951bd9a9f201ad` (PR #29 merge) | **YES** |

### 2.3 Gate-by-gate status, stated without inference

| Gate | Requirement (r1 §9) | Status | Evidence |
|---|---|---|---|
| **I** | Plan approval; names the plan artifact SHA-256 and FD-1's disposition | **CLOSED** | E-1 effective 2026-09-11; supplemented by E-5 |
| **FD-1** | Implementation base selection | **CLOSED BY FOUNDER** | C-4 §1: base `6d6110d41e65f7484a167d499141c639e6e403c2` selected; `75b52a23…c242` not selected |
| **II** | Tranche A code/runtime refactor merged | **REPOSITORY WORK COMPLETE — B6 RESOLVED AT §2.5** | r1 §9 Gate II row: must name *"the implementation base Git SHA"*. Verified complete: the A file map landed in full under Founder act `e5c5566…970c`, PR #27 merged at `f21693e0…`, tree `9ca61132…`, branch preserved, Gate I effective, FD-1 closed. **B6 resolved:** `6d6110d4…` is a *historical* base, superseded by the Founder-ratified E-3/E-8 rebind to `ef7a479…`/`31b132de…` before Gate II was authorized; the generic exact-SHA naming requirement is met by E-1, E-5, and the merge act. See §2.5. **Not closed by this draft** — the closure *record* act is FD-B7 (§17), supplied prospectively at §2.5.4 |
| **FD-2** | Recording the new administrative custody domain | **OPEN** | C-3 §12; required **before Gate IV**, does **not** block Gate III code (C-4 §9 states FD-2 "does not block Gate II"; the same logic and C-3 §9.1 extend it to Gate III code) |
| **IV** | Tranche C protected environment | **NOT STARTED** | `.github/workflows/db-admin-migration.yml` absent at `origin/main`; both existing GitHub environments carry empty `protection_rules` per C-3 §5.3 / PO-7 |
| **III** | **This gate** | **PROPOSED** | this artifact |

**Scope-only, not issuance (this amendment).** Gate III remains **PROPOSED**, and
the D-1 scope ruling of 2026-09-14 (§0.6) together with this amendment are
**scope-only**: neither is Gate III implementation issuance, and this act places
no signature, fills no signature field (§18), and confers no implementation,
execution, merge, deployment, credential, or fixture authority. (F5,
Founder-accepted 2026-09-15.)

### 2.4 The Tranche-A file map, examined rather than assumed

PR #27 merging does **not** by itself prove every Gate-II requirement met. The A
file map (C-3 §4.1) was compared against the actual merged diff
(`9a43d0aa…01ad` to `f21693e0…83be`):

| Id | Planned path | Landed |
|---|---|---|
| A-M1 | `packages/control-plane/src/main.ts` | **M** yes |
| A-N1 | `packages/control-plane/src/schema-preflight.ts` | **A** yes |
| A-M2 | `packages/control-plane/src/index.ts` | **M** yes |
| A-M3 | `packages/control-plane/src/db.ts` | **M** yes |
| A-M4 | `package.json` (conditional, PO-5) | **not changed** — consistent with PO-5's low-risk conditional; no preflight script exists at `origin/main` |
| A-T1 | `test/schema-preflight.storage.test.ts` | **A** yes |
| A-T2 | `test/boot-no-ddl.storage.test.ts` | **A** yes |

**Finding: the Tranche-A file map is fully discharged.** Nothing outside it
landed in that merge. **No unmet Gate-II requirement was identified in the file
map.** That is a finding about deliverables only. It is **not** a finding that
Gate II is formally closed — see §2.5.

### 2.5 Gate II closure — B6 resolved by tracing the base-binding chain

**B6 asked whether C-4 §6's exact-naming requirement is an unmet present
prerequisite for Gate III entry. Traced through the ratified amendments, the
rebinds, the retention disposition, and the completed merge act, it is not:
`6d6110d4…` is a historical base whose naming was superseded by a
Founder-ratified rebind before Gate II was authorized. The requirement was met,
with the successor SHA. A Founder record-act remains available; it is not a
blocker.**

#### 2.5.1 The exact effective clause

C-4 (`pr2b-implementation-plan-r1-addendum-01.md`, SHA-256
`91c0133448dc632ee269313fc56092dad95b3fedc7d41d65baf29297dfd1dc87`) §6,
under its identifier table, states verbatim:

> "**No implementation authorization may refer only to a branch name.** Gate II
> must name `6d6110d41e65f7484a167d499141c639e6e403c2` explicitly."

C-3 §9's Gate II row states the same requirement generically: *"Must name: the
**implementation base Git SHA**; the A file map; commit subjects."*

Two distinct obligations follow, and §2.5.3 separates them:

1. **Generic** — Gate II must name the implementation base **Git SHA**, never
   only a branch name (C-3 §9).
2. **Specific** — as of the addendum's drafting, that SHA was
   `6d6110d41e65f7484a167d499141c639e6e403c2` (C-4 §6), because FD-1 had
   selected it.

#### 2.5.2 Trace through the ratified record

Every step is a verified artifact, cited by hash.

**(a) FD-1 selected `6d6110d4…`, and C-4 fixed it as the base.** C-4 §6's
identifier table reads: *"Implementation base Git SHA |
`6d6110d41e65f7484a167d499141c639e6e403c2` — RESOLVED by Founder ruling"*,
and closes with a live stop condition: *"if `origin/main` advances past
`6d6110d…` before the Builder's first edit, the Builder stops and returns
rather than re-basing on its own initiative."* **The clause and its stop
condition are base-drift tripwires, not a permanent naming obligation.** They bind
the base *as it stood* at that drafting.

**(b) `origin/main` advanced, and the Founder ratified a rebind that moved this
stack's exact base to `ef7a479…`.** E-3,
`AMENDMENT-pr2b-preflight-sequencing-r3-rebind-20260910.md`, SHA-256
`aab512085a56fb343c8b746200f3963112950986b3856704152480116f175424`, §1 binds
verbatim:

> "**Bound Base (Post-Phase-1):** — `main` SHA:
> `ef7a47920b8a2a022f9e6bf26ce22119fe466217`; `tree`:
> `31b132deedcb180036edee2b267f1d824078b4f6`"

Its §0 records that the **original r3 ratification was voided** because
`origin/main` advanced before the ratification timestamp, *"violating the
signature-time drift condition"*, and that the successor *"rebases the exact r3
staged-enforcement semantics onto the post-Phase-1 `main`."* Its §1 declares
the signature-time rule: *"If `origin/main` differs from `ef7a479…`, stop with
`REVIEW TARGET DRIFT` and prepare a rebind; do not sign."*

E-3 was re-ratified by E-8
(`FOUNDER-ACCEPTANCE-pr2b-preflight-sequencing-r3-phase1-rebind-20260910.md`,
SHA-256 `b7c424b5648f06493d46657235c7c84668f74aa31c2181d5465713da7b934264`),
which binds *"Bound main: `ef7a47920b8a2a022f9e6bf26ce22119fe466217`"* and
*"Bound tree: `31b132deedcb180036edee2b267f1d824078b4f6`"*, and states *"The prior
r3 ratification remains void."* The superseded original acceptance
(`456056d020dd32515c5ec4bc653c060fd1aa2f7a708c237918248003d6a79031`) is
preserved byte-identical and carries no force.

**(c) The rebind is in the active plan stack, and it rebinds the stack that
contains C-4.** E-3 §1 declares: *"This amendment strictly binds to and
modifies the following artifacts:"* and lists r6 (`658daa9c…`), r1
(`08f3ea74…`), and **C-4 addendum-01 (`91c01334…`)** by hash. Its §2
closes: *"**Every other r6/r1/addendum-01 provision remains unchanged.**"* **C-4
§6's generic requirement therefore survives; its specific 40-hex value does
not** — the amendment that owns the base binding rebinds it.

**(d) Two EFFECTIVE Gate-I acts bind the successor commit and tree at signature
time.** E-1 (`FOUNDER-AUTHORIZATION-pr2b-gate1-ISSUANCE-RECEIPT-20260910.md`,
`277f85e3…`, effective 2026-09-11T10:32:00Z) records *"Signature-time
repository binding: origin/main SHA: `ef7a4792…`; Tree SHA:
`31b132de…`"*. E-5
(`FOUNDER-SUPPLEMENT-pr2b-gate1-test-role-fixture-20260911.md`,
`362c7b47…`) carries the identical binding. Both are **exact-SHA namings by
the Founder in effective acts**, and both satisfy C-3 §9's generic
requirement.

**(e) The Gate-II authorization draft itself named the successor base.** The r5
draft
(`DRAFT-founder-authorization-pr2b-gate2-trancheA-r5-test-role-fixture-20260911.md`,
`38286c8b…`) §5 requires: *"A new isolated branch and worktree MUST be
created from the exact bound base (`ef7a479...`) only AFTER Founder signature."*
Its §7 carries `BASE DRIFT` as a stop condition.

**(f) The base movement was a strict advance with zero divergence.**
`6d6110d41e65f7484a167d499141c639e6e403c2` **is a direct ancestor** of
`ef7a47920b8a2a022f9e6bf26ce22119fe466217`. Verified live in this session:
`git merge-base` returns `6d6110d4…` itself;
`git rev-list --count 6d6110d4..ef7a479` = **11**;
`git rev-list --count ef7a479..6d6110d4` = **0**. No divergence, no replacement
history. The 35 paths changed between them include **neither** `migrations.ts`
**nor** `ci.yml` — both are byte-identical at the two bases.

**(g) The executed result matches the named successor identities.** The merge act
`e5c5566…970c` named head `8f991604…`, tree `9ca61132…`, expected
main `9a43d0aa…`; the resulting merge commit `f21693e0…` carries tree
`9ca61132…`, equal to the reviewed head's own tree. Verified live:
`6d6110d4` → `ef7a479` → `9a43d0aa` → `f21693e0` is an unbroken
ancestry chain, and `8f991604` is an ancestor of `f21693e0`.

#### 2.5.3 Distinguishing a historical base from an unmet present prerequisite

| | Naming `6d6110d4…` | Generic "must name the base Git SHA" |
|---|---|---|
| Status | **HISTORICAL.** FD-1's selected base; superseded by the Founder-ratified E-3 rebind **before** Gate II was authorized | **SATISFIED.** Exact SHAs named by E-1 and E-5 (effective Gate-I acts), and by the merge act |
| Scope | the plan stack *as drafted 2026-09-05*, and its own base-drift stop | the live Gate II / Gate III entry question |
| Unmet today? | **NO** — the value was rebound by the amendment that owns the base binding, with Founder re-ratification | **NO** |

**Finding: B6 does not independently block Gate III entry on the strict-naming
reading.** That reading assumes `6d6110d4…` remained the operative base name.
It did not. It was superseded by a ratified rebind, and the successor commit and
tree were named by exact SHA in two effective Founder acts. The clause's own
protective purpose — *"no implementation authorization may refer only to a
branch name"* — is met: every operative naming here is an exact 40-hex SHA.

**What remains is a record act, not a prerequisite.** Whether the Founder *records*
Gate II formally closed is his to make, because gate closure determines gate entry
and C-3 §9's preamble bars inferring it: *"Approval of one gate never implies
the next."* Narrow prospective wording follows.

#### 2.5.4 Narrow prospective wording, if the Founder elects the record act

Offered, not assumed. **Prospective and non-retroactive by construction.**

> **GATE-II FORMAL CLOSURE — PROSPECTIVE, NON-RETROACTIVE**
>
> I record that the Tranche A code/runtime refactor has landed on `main` at merge
> commit `f21693e0c9c5d063b8cd150346477d0e49dc183e`, tree
> `9ca61132b14de175685fee9dee4fae579380eef9`, from reviewed head
> `8f9916044d662a184f2fa324893c4fe5578560be`.
>
> I record that the implementation-base naming requirement of
> `pr2b-implementation-plan-r1-addendum-01.md` §6 (SHA-256
> `91c0133448dc632ee269313fc56092dad95b3fedc7d41d65baf29297dfd1dc87`) was
> discharged by the Founder-ratified Phase-1 rebind
> `AMENDMENT-pr2b-preflight-sequencing-r3-rebind-20260910.md` (SHA-256
> `aab512085a56fb343c8b746200f3963112950986b3856704152480116f175424`, re-ratified
> by `FOUNDER-ACCEPTANCE-pr2b-preflight-sequencing-r3-phase1-rebind-20260910.md`,
> SHA-256 `b7c424b5648f06493d46657235c7c84668f74aa31c2181d5465713da7b934264`),
> which rebound this plan stack's exact base to
> `ef7a47920b8a2a022f9e6bf26ce22119fe466217` / tree
> `31b132deedcb180036edee2b267f1d824078b4f6`, and by the effective Gate-I acts
> that bind that same commit and tree at signature time.
> `6d6110d41e65f7484a167d499141c639e6e403c2` is a strict ancestor of
> `ef7a47920b8a2a022f9e6bf26ce22119fe466217` and is a historical base, superseded
> before Gate II was authorized. Its explicit naming is not an unmet present
> prerequisite.
>
> This act closes Gate II for the sole purpose of Gate III entry. **It does not
> authorize, ratify, cure, or backdate any prior execution authority.** The
> `AUTHORITY NOT LOCATED` determination for the original Gate-II execution
> authorization, the successor-session `20260912_000443_9319f3` gap, and the
> retention disposition's findings remain exactly as recorded and are not cured,
> narrowed, or re-opened by this act. **No retroactive authorization is granted
> or implied.**

**Not proposed:** retroactive issuance, re-execution of Tranche A, a re-review, a
re-merge, or any amendment of the retention disposition `2aab0196…`.

### 2.6 The one genuinely unsatisfied Gate-III precondition

C-3 §9's Gate III row states preconditions: *"Gate II merged; **Gate IV complete
(the plane must exist to execute through)**."* **Gate IV is not complete.**

C-3 §9.1 addresses this directly and in express terms:

> "Gate III authorizes the migration, but the migration cannot **execute** until
> Gate IV's plane exists. The code of Tranche B can be authorized and merged
> before Gate IV; only its execution waits."

**This was a material textual conflict between the §9 table cell and §9.1's
prose. It is now resolved by Founder ruling FD-B1 (§0), quoted:**

> "Gate IV completion is required before migration 0006 executes against a
> governed database. It is not required before Tranche-B code and tests are
> authorized, independently reviewed, or separately authorized for merge."

**What the future Gate III implementation act may authorize**, quoted from
FD-B1:

> "- migration 0006 source;
> - the administrative migration runner and migrate:admin script;
> - the authorized Tranche-B tests and bounded CI changes;
> - migration and runner execution inside verified disposable acceptance
>   fixtures, including selection, refusal, and evidence-output tests."

**What it must not authorize**, quoted:

> "It must not authorize governed, shared, staging, production, or Neon database
> execution, production administrative credentials, runtime cutover, rotation,
> or protected-plane execution."

Governed migration execution remains subject to Gate IV, FD-2, the ratified
protected GitHub environment route, and a separate Founder-named commit on
`main`. **No Railway pre-deploy substitute is permitted.** The reviewed and
merged code SHA and the Founder-authorized execution SHA serve different
purposes but may identify the same commit. Gate III implementation ends at the
draft PR and execution handoff; ready transition and merge require separate
authorization.

**This draft is written to that reading.** The permissions above are not
conferred by this artifact; they become exercisable only on the separate Gate III
implementation issuance.

### 2.7 Background-Agent A2

**Background-Agent A2 remains UNAUTHORIZED.** PR #29 merged A1 (the
provider-free planner admission fixture). A1's merged status authorizes nothing
about A2. This authorization touches neither, and A2 appears in §15's prohibited
surfaces.

### 2.8 The lane qualification input, and a hash-chain discontinuity disclosed

The Founder-supplied qualification receipt verifies exactly:

| Field | Value |
|---|---|
| Path | `hermes-profile-suite/QUALIFICATION-RECEIPT-pr2b-lane-A2-prerequisite-20260913.md` |
| SHA-256 | `22b96d1d6f0f607a8732d4621259aaf92a271aeb15d52e501dbed9a84121cc66` — **re-derived on disk this session, MATCHES the supplied value** |
| Size | 13,685 bytes / 242 lines |
| Reviewer | `br-operator` session `20260913_120934_f6a51c`, xai-oauth / grok-4.6; `actor_id: UNAVAILABLE` |
| Result | **`A2-JOURNAL-PREREQUISITE-NOT-QUALIFIED`** — accepted as the supported current result |

**Its B1–B5 findings are accepted and not re-litigated:** B1 no landed durable
pre-dispatch writer; B2 no landed recovery / `verify()` path; B3 no Tranche B
implementation candidate; B4 no effective Gate III authorization; B5 F-N1/F-N2
absent. **B6 is addressed and resolved at §2.5**; the receipt correctly
records it as Founder-owned and expressly declines to choose.

**Accepted without amendment:** A2 remains **paused**. This draft authorizes no A2
work, and A2 appears in §15's prohibited surfaces.

**Disclosed hash-chain discontinuity.** The receipt binds this draft at
`60d5727092c7ea2f4ec1b62b5d66cabd042b6fef51a6d208537cae5be34ed837` — the
value current at its `2026-09-13T19:00:00Z` observation. **This finalization act
amends the same path**, so that value no longer describes this file. The draft's
operative identity is now the value at §19. **Any issuance must name
§19's value, not the receipt's.** The receipt is **not** edited to match: it
is a true record of what it observed, preserved exactly as the retention
disposition requires of historical evidence.

---

---

## 3. Safe-tree protocol — applied, with findings

The advisory at §1.3 was read and its §5 pre-flight executed **before** any
repository content was read.

```
repo:      /Users/michaeldaley/MADVenturesOPs/founder-os-build-room
porcelain: ?? docs/planning/command-journal/
           ?? docs/planning/room-runtime-phase1/
           ?? packages/run-harness/src/phase1-fixture.ts
HEAD=75b52a23c1fe4bec02bdcb7257ac6273f4b4c242
branch=builder/prereq-c-c2-broker-ledger-worker
origin/main=f21693e0c9c5d063b8cd150346477d0e49dc183e
unmerged=0
behind=26
```

**Findings, reported rather than repaired:**

1. The primary checkout is **not on `main`**. It sits on
   `builder/prereq-c-c2-broker-ledger-worker` at `75b52a23…c242`, the base FD-1
   expressly **did not** select, 26 commits behind `origin/main`.
2. Three untracked paths are present. Two of them
   (`docs/planning/command-journal/`, `docs/planning/room-runtime-phase1/`) are
   now **committed on `origin/main`**, so the on-disk copies are stale
   shadows of committed truth. `packages/run-harness/src/phase1-fixture.ts` is
   untracked and uncommitted.
3. `unmerged=0`; no conflict markers; **no stop condition fired**.

**Actions taken: none.** No stash, pop, merge, reset, switch, clean, checkout,
or repair was performed on this or any other worktree. `update-all.sh` was not
run. `git fetch origin --prune` was run; it advances refs only and mutates no
working tree. Every repository fact in this draft was read through
`git show <ref>:<path>`, never from the working tree.

**Standing instruction to the executor:** this checkout belongs to another
writer's in-progress line. Tranche B must be executed in a **new worktree**
(§13), never by moving this one.

### 3.1 Bound reference state

| Field | Value |
|---|---|
| `origin/main` commit | `f21693e0c9c5d063b8cd150346477d0e49dc183e` |
| `origin/main` tree | `9ca61132b14de175685fee9dee4fae579380eef9` |
| PR #27 merge commit is an ancestor of `origin/main` | **YES** (identity) |
| Issuance reference main (this draft) | `f21693e0c9c5d063b8cd150346477d0e49dc183e` |
| `origin/main` at this drafting session's live re-verification (2026-09-13T18:47:39Z) | `f21693e0c9c5d063b8cd150346477d0e49dc183e` — **unchanged** |
| PR #27 live state at that same observation | **MERGED**, `closed=true`, `isDraft=false`, `merged_at 2026-09-13T16:36:56Z`, `merge_commit_sha f21693e0…`, `merged_by decivantiq` |
| PR #27 branch `builder/pr2b-tranche-a-schema-preflight-r5` | **PRESERVED** at `8f991604…` (not deleted, as the merge act required) |
| Proposed Tranche-B branch `builder/pr2b-tranche-b-journal-authority` | **VERIFIED FREE** — `git ls-remote --heads origin` returns nothing for that pattern |

---

## 4. Starting-base rule — proposed bounded allowance

### 4.1 Why this allowance is required and not merely convenient

C-4 §6 closes with a live stop condition:

> "**r1 §15 stop condition 1 remains live and now has a concrete referent:** if
> `origin/main` advances past `6d6110d…` before the Builder's first edit, the
> Builder stops and returns rather than re-basing on its own initiative."

`origin/main` **has** advanced past `6d6110d…`: **22 commits** touching **45
paths**, spanning the Tranche-A merge, the A1 merge, the Prerequisite-C /
Phase-0 / Phase-1 room runtime work, and the filing of the plan documents
themselves. (Counts measured in this session:
`git rev-list --count 6d6110d…..f21693e0…` = 22;
`git diff --name-only` between them = 45.)

**Under the plan exactly as written, a Builder starting Tranche B today must
halt.** The allowance below is the narrow Founder act that cures that stop for
Tranche B only. Without it, this authorization is void on its own terms.

### 4.2 The allowance — RULED (FD-B3)

**Issued by the Founder at §0.** Quoted:

> "For Tranche B only, permit a starting origin/main newer than the issuance's
> reference main, subject to the assessment below. This is a narrow exception
> to r1 §15 stop condition 1."

The executor may start Tranche B from an `origin/main` newer than this
issuance's reference main, **and from no other base**, subject to completing
every step in §4.3 and recording its results. **Ancestry and zero direct path
overlap alone are insufficient.**

This allowance is **Tranche B only**. It lifts r1 §15 stop condition 1 for no
other tranche.

### 4.3 Mandatory executor steps before the worktree is created or any file edited

1. Verify PR #27's merge commit `f21693e0c9c5d063b8cd150346477d0e49dc183e`
   remains an ancestor of the actual starting `origin/main`. If it is not, stop.
2. Record the issuance reference main (`f21693e0…83be`) and the actual starting
   main side by side, with both commit and tree SHAs.
3. Enumerate the **complete** intervening commit set and the **complete**
   changed-path set between them. Not a sample, not a filter.
4. Assess every intervening change against: the B file map paths; C-1's hashes;
   C-2 and C-3's frozen surfaces; `package.json` dependencies and scripts;
   `tsconfig.json` include coverage; `.github/workflows/**`; the
   `storage-integration` job's shape; and every acceptance assumption in §11
   and §12.
5. Re-hash C-1 through C-4 at the actual starting base and confirm each matches
   §1.1. **Any change to C-1's hash is S2: stop.**
6. Re-verify migration id `0006` is still unused and that `MIGRATIONS` still
   ends at `0005_phase3_run_evidence`.
7. Re-run the §1.3 advisory pre-flight against the new worktree.
8. Bind the actual starting commit SHA and tree SHA in writing **before**
   creating the worktree or editing any file.

**FD-B3 issues steps 1 to 8 above as binding**, and states the assessment
dimensions expressly: *"Assess scope, controlling artifacts, dependencies,
scripts, compiler coverage, workflows, storage-job shape, and acceptance
assumptions."* Step 4 already enumerates each of those surfaces; step 5 is the
controlling-stack re-hash; step 6 is the `0006` and `MIGRATIONS` re-verification;
step 7 is the standing safe-tree advisory. No step is removed or weakened.

### 4.4 Drift disposition

Material drift in scope, contract, dependency, workflow, or acceptance
assumptions requires the executor to return, verbatim:

```
REVIEW TARGET DRIFT — FOUNDER DECISION REQUIRED
```

with the exact intervening commit and path set and the specific assumption
disturbed. The executor does not redesign around drift and does not decide
materiality by convenience.

### 4.5 Base immutability after start

Once the bound base is recorded and the first edit made, the executor
**preserves it**. No silent rebase, no merge of later `main`, no cherry-pick of
later `main` commits. If `main` advances during execution, that is recorded in
the return and left for the merge act, which is a separate Founder decision.

### 4.6 Pre-computed drift assessment at this draft's reference main

Performed in this session so the Founder can see the actual exposure rather than
a promise to look. Comparison: FD-1's selected base `6d6110d41e65f7484a167d499141c639e6e403c2`
to the reference main `f21693e0c9c5d063b8cd150346477d0e49dc183e`.

| B-map path | Blob at `6d6110d…` | Blob at `f21693e0…` | Drift |
|---|---|---|---|
| `packages/control-plane/src/migrations.ts` (B-M1) | `da633c01f9c5…` | `da633c01f9c5…` | **NONE — byte-identical** |
| `.github/workflows/ci.yml` (B-M4) | `7e485bdf3764…` | `7e485bdf3764…` | **NONE — byte-identical** |
| `package.json` (B-M2) | `c7bc8ab1788a…` | `609a872f766f…` | **+1 line** |
| `tsconfig.json` (B-M3) | `0a1721ecabdc…` | `c6ac255a4a14…` | **+1 line** |

Non-B controlling surfaces:

| Path | Drift |
|---|---|
| `docs/command-journal-contract.md` | **NONE** (`f982b3d3cf94…` both). S2 NOT TRIGGERED |
| `packages/journal/src/chain.ts` (genesis constant) | **NONE** (`a27bc2305f7f…` both) |
| `scripts/path-audit.sh` | **NONE** (`d8997db0dc0f…` both) |
| `railway.toml` | **NONE** (`5980ce064e10…` both) |
| `packages/control-plane/src/index.ts` | changed by Tranche A as planned (A-M2); not a B path |

Exact content of the two B-path drifts:

```
package.json  @@ -25,6 +25,7 @@
+    "test:prereq-c": "npm run build && node dist/test/support/require-prereq-c-runtime.js && node --test dist/test/*.prereq-c.storage.test.js",

tsconfig.json @@ -21,6 +21,7 @@
+    "packages/worker-supervisor/src/**/*.ts",
```

**Assessment: NOT MATERIAL.**

- B-M1 and B-M4, the two substantive Tranche-B targets, are **byte-identical**
  to the Founder-selected base. Every line-anchored claim C-3 and C-4 make about
  them still holds exactly (re-verified at §6).
- C-4 §4.2 observed that the selected base *lacked* `test:prereq-c` and called
  that "mildly favorable" isolation. **That specific favorable observation no
  longer holds** at the reference main, which now carries the script. The effect
  on B-M2 is nil: B-M2 appends one new script to the same block and the `start`
  pattern it follows is unchanged at line 24. **Recorded because C-4's stated
  reasoning changed, even though its verdict did not.**
- C-4 §4.3's PO-4 closure verdict (`B-M3 = NOT NEEDED`) **still holds**:
  `packages/control-plane/src/**/*.ts` remains at line 19 and `test/**/*.ts` at
  line 25, so both new source files and all new tests stay covered by existing
  globs. The `worker-supervisor` glob is additive and irrelevant to Tranche B.

### 4.6.1 Reference-main restatement at R4's own base (F8, Founder-accepted)

R3's reference main was `f21693e0…`. This amendment is drafted against a newer
`origin/main` — and, in this round, an `origin/main` that has **advanced again**
by the D-1 landing. Per FD-B3's bounded newer-main allowance this act **restates
its own reference row rather than inheriting R3's** (§4.6 above is retained
unchanged and is *not* superseded; it remains the R3-round assessment at the R3
reference).

| | Commit | Tree |
|---|---|---|
| **R4 reference main** (this act) | `baee3fb2910348c8d256ea6d0ad3c49f5beafcb2` | `cd3463b56af8642ef933d5bc47fc1997b9283bd9` |
| R3 reference main (retained, §4.6) | `f21693e0c9c5d063b8cd150346477d0e49dc183e` | `9ca61132b14de175685fee9dee4fae579380eef9` |
| Custody-bound §4.3 base | `dace9af9da158be8480b91d9576472645d068e3f` | — |
| FD-1 selected base | `6d6110d41e65f7484a167d499141c639e6e403c2` | — |

**Distances, measured this round against the R4 reference.** FD-1 base → R4
reference: **69** commits, **110** changed paths. R3 reference → R4 reference:
**47** commits, **70** changed paths. Custody-bound base → R4 reference: **9**
commits, **10** changed paths. All four bases are confirmed **ancestors** of
`origin/main`.

**What advanced since the immediately preceding state, and why it is immaterial.**
The last `main` observed by this seat before the D-1 landing was
`ca3dea3e681a1804e4c0d8b65f7c9d88ca212aa9`. `ca3dea3e…` → `baee3fb2…` is **2**
commits over exactly **2** changed paths, and **both are inside
`docs/planning/command-journal/custody/`**: the D-1 ruling itself and its custody
receipt. **No code, test, configuration, migration, workflow, or contract path
changed.** `docs/command-journal-contract.md` remains byte-identical (`f982b3d3cf94…`),
so **S2 remains NOT TRIGGERED**.

**B-path drift at the R4 reference (the substantive check).**

| B-map path | Blob at FD-1 base | Blob at R4 reference | Drift since FD-1 |
|---|---|---|---|
| `packages/control-plane/src/migrations.ts` (B-M1) | `da633c01f9c5…` | `da633c01f9c5…` | **NONE — byte-identical** |
| `.github/workflows/ci.yml` (B-M4) | `7e485bdf3764…` | `7e485bdf3764…` | **NONE — byte-identical** |
| `package.json` (B-M2) | `c7bc8ab1788a…` (41 lines) | `07bd5787acde…` (43 lines) | **+2 lines** (was +1 at R3's reference) |
| `tsconfig.json` (B-M3) | `0a1721ecabdc…` (26 lines) | `c1adc0a87ab7…` (30 lines) | **+4 lines** (was +1 at R3's reference) |

Non-B controlling surfaces at the R4 reference: `docs/command-journal-contract.md`
**byte-identical** (`f982b3d3cf94…`, **S2 NOT TRIGGERED**); C-2
`pr2b-storage-architecture-r6.md` **byte-identical** (`4d3e78c055f2…`); C-3
`pr2b-implementation-plan-r1.md` **byte-identical** (`c9436f11ec11…`).

**Assessment: NOT MATERIAL, with one consequence recorded.** B-M1 and B-M4 — the
two substantive Tranche-B targets — remain byte-identical to the Founder-selected
base, so every line-anchored claim C-3 and C-4 make about them still holds. The
additional `package.json` and `tsconfig.json` growth is the Prerequisite-C /
room-runtime work landing; it touches neither B-M2's target block nor the two
glob patterns B-M3 turns on (re-verified at §6 below, per F7). **Nothing here
lifts or narrows §4.3's mandatory executor steps**, which run against the actual
starting main as §4.3 already requires.

**D-1 paths re-checked free at the R4 reference.** `packages/control-plane/src/journal-append.ts`
(B-N2), `packages/control-plane/src/redaction-boundary.ts` (B-N3), and
`test/journal-redaction.storage.test.ts` (B-T4) are each **absent** at the R4
reference — the D-1 landing added no code path, so the D-1 scope remains
unimplemented and these paths remain free.

### 4.7 Historical authority defects and the issued retention disposition — preserved

**No retroactive issuance is demanded and no re-execution is requested.** This
draft preserves the record exactly as the effective retention disposition
requires, and reopens nothing.

**The issued disposition, cited by exact hash.**
`FOUNDER-DISPOSITION-pr27-candidate-retention-EFFECTIVE-20260913.md`, SHA-256
`2aab0196a1d2841ba76443d90fb5214790e72205347453a013a4c7907c1666a2` (issued; the
`-v2-` copy is byte-identical — both re-derived in this session). It prospectively
retains candidate `0cad0c8…` for further review only, and expressly provides that
the earlier adoption-receipt copies identified by `4557ebed…` and `3ffd42dd…`
**"must be preserved as historical evidence and must not serve as effective
issuance receipts."** That decision is **settled** and is not reopened here.

**Defects preserved, each as recorded, none demanded to be cured:**

| # | Preserved item | Disposition here |
|---|---|---|
| H-1 | Original Gate-II execution authority for candidate `ca300dd6…` — determination **AUTHORITY NOT LOCATED** | Preserved verbatim. Not cured, not backdated, not re-litigated |
| H-2 | Successor session `20260912_000443_9319f3` authorship gap | Preserved. The merge act `e5c5566…970c` states in express terms that it **"does not retroactively authorize earlier execution."** No classification is requested as a Tranche-B precondition |
| H-3 | Posted adoption-receipt digest discrepancy (`4557ebed…` bytes not located on disk; `3ffd42dd…` remains) | Preserved as previously recorded. Not reopened |
| H-4 | E-5 placeholder fields | Recorded at §1.4. Effect on Tranche B: none. No cure requested |

**No act demanded of the Builder or the Operator for any of H-1 to H-4.** None is
a Tranche-B entry condition, and none is a stop condition under this draft.

**Stale observations reconciled without modifying old evidence.** The prior
completion map's readback (`PR #27 OPEN at 0cad0c8`) was accurate when taken at
`2026-09-13T12:37:02Z` and is superseded, not corrected in place. **No prior
evidence file was edited, moved, or deleted by this act.** Reconciliation is by
superseding live observation only: at `2026-09-13T18:47:39Z`, PR #27 is MERGED,
`origin/main` is `f21693e0…`, and the branch is preserved at `8f991604…`.

---

## 5. Purpose and scope

This authorization is for **PR 2b Tranche B only**:

1. Journal database authority and ownership (migration `0006`).
2. The planned database append primitive `public.command_journal_append(...)`.
3. The bounded administrative migration runner.
4. The required Tranche-B tests and their integration into the **existing** CI
   storage suite.

**Explicitly not authorized and not described as authorized:**

- No runtime writer consumer. No dispatch integration. No recovery service.
- No Background-Agent A2 integration.
- No redesign of the journal. No second journal, chain, `seq` space, or writer
  (C-1 §1.2, C-2 §16.8).
- No alternate journal implementation alongside the one specified.

- **The D-1 reconciliation for this bullet — RULED 2026-09-14 (§0.6).** The
  prohibition above is **not withdrawn**. Ruling sentence 1 fixes its scope:

> 1. r6's SQL encoder is a second conforming serializer implementation
>    required to produce byte-identical canonical bytes with
>    packages/journal; it is not a second journal, chain, sequence space,
>    writer, or runtime consumer, and does not displace packages/journal
>    as the contract and reference-vector source.

  Read against the prohibition, this bullet continues to forbid **a second
  journal, chain, sequence space, writer, or runtime consumer, and any
  displacement of `packages/journal` as the contract and reference-vector
  source**. What it does **not** forbid is a second *serializer implementation*
  that must produce **byte-identical canonical bytes**. That is the whole of the
  narrowing, and it is stated here rather than left to inference. (F4,
  Founder-accepted 2026-09-15.)

The non-activating scope claim at C-3 §16 and C-2 §18 is carried in full. **This
tranche does not satisfy contract §1.4's dual-write rule**, and no PR body, test
name, commit subject, or status line may claim it does. **Tamper-evident, not
tamper-proof** (C-2 §16.7): owner and superuser retain the bypass. No artifact
may claim journal history is immutable or tamper-proof.

### 5.1 Gate III code/test authority versus Gate IV protected migration execution — the distinction preserved

The plan's wording is carried exactly, not paraphrased into agreement with
anything convenient.

**C-3 §9.1, the operative clause, quoted verbatim:**

> "Gate III authorizes the migration, but the migration cannot **execute** until
> Gate IV's plane exists. The code of Tranche B can be authorized and merged
> before Gate IV; only its execution waits. Two SHAs are therefore in play at
> Gate III and must not be conflated: the SHA at which B's code merged, and the
> SHA the migration run asserts as `founder_authorized_sha`. Under r6 §7.1's
> branch policy the latter must be a commit on `main`."

**C-3 §9, the Gate III row, quoted verbatim:** preconditions *"Gate II merged;
Gate IV complete (the plane must exist to execute through)"*; and the gate does
**not** authorize *"rotation; runtime cutover; a second privileged credential
(S1/S8)."*

**What Gate III authorizes under this draft.** Tranche-B **code, tests, and the
bounded CI integration** only — migration `0006`'s *text*, the `migrate-cli`
*implementation*, the script line, and the test suites. All of it is ordinary
repository work on a branch, reviewed and merged as code.

**What Gate III does not authorize, stated positively and not by implication.**
No execution of migration `0006` against any **governed, shared, staging,
production, or Neon** database. No `founder_authorized_sha` assertion run
against the protected plane. No `migrate:admin` invocation **outside the
authorized disposable acceptance fixtures**. No **production administrative**
credential use. No runtime cutover. No rotation. **Gate III authorizes no
protected-plane execution of any kind.**

**What Gate III does authorize inside the fixture, stated expressly so it is not
read out by the list above.** FD-B1 permits the future Gate III implementation
act to authorize *"migration and runner execution inside verified disposable
acceptance fixtures, including selection, refusal, and evidence-output tests."*
Accordingly, and **only** inside a disposable instance whose exclusive,
run-specific provisioning is externally verified per §7.3.1:

- migration `0006` may be **applied** to the fixture;
- `migrate:admin` and the administrative runner may be **invoked** to exercise
  tranche selection, refusal, one-tranche-per-run behavior, and the required
  evidence-output shape (**B-T3**, §6.5);
- the **per-run ephemeral fixture credentials** at §7.3.3 may be generated and
  used, including the disposable container's own `postgres` superuser for setup
  as §8.2 requires.

**These are disposable acceptance tests, not privileged execution.** None of
them is a production administrative credential, and none of them is
protected-plane execution.

**R6 §11.2 binds the execution route.** The administrative one-shot job through
a GitHub protected environment is **RATIFIED, controlling**; the same-service
Railway pre-deploy route is **PROHIBITED**; Option D, Founder-operated one-shot,
is emergency and fallback architecture only. **Against any governed, shared,
staging, production, or Neon database**, `0006` **executes only through Gate
IV's protected plane**, at a Founder-named commit on `main`, after FD-2 is
dispositioned. The disposable-fixture application of `0006` described above is
not execution through that plane and does not reach it. Nothing in this draft
shortens that path, and no artifact in it may be read as pre-approving the
plane.

**Two SHAs are never conflated.** The SHA at which B's *code* merges is what
Gate III concerns; the SHA the *migration run* asserts as `founder_authorized_sha`
is a later, separate identifier that comes into existence only after that merge
and must be a commit on `main`. Neither is determined by this draft.

**The fixture boundary restated, because it is the point of the distinction.**
The disposable acceptance fixtures enumerated at §7.3 — the CI `postgres:16`
service container, or a throwaway local container reached via `TEST_DATABASE_URL`
— are **disposable acceptance tests.** They are **not** production migration
execution, they are **not** protected-plane execution, and Gate III conferring
authority over them **must not** be read as authorizing protected-plane
execution. No fixture operation in §7.3 touches Neon, production, shared,
staging, or governed infrastructure, and the ephemeral roles created and dropped
inside that container are test scaffolding, not the production authority split.

**If the two are conflated anywhere in execution**, that is a scope breach and
the executor returns `FOUNDER_DECISION_REQUIRED` rather than proceeding.

### 5.2 A2's writer-and-recovery prerequisite versus full PR 2b qualification (B5)

**B5 asked whether any controlling A2 clause requires all Tranche F F-N1/F-N2
qualification before A2 implementation consumption. Searched and quoted: there is
no such clause.**

**A2's exact controlling acceptance**, quoted verbatim from
`BR-Builder-Background-Agents-Handoff-r2-REVIEWED-BODY.md`, SHA-256
`acd9be05153da4e0c77faa92a934dd679ab020650c37dcce1a0ff4bb1244c77a`
(56,321 bytes, at
`/Users/michaeldaley/MADVenturesOPs/review-evidence/background-agents-a0-a1/`),
§4 delivery-order table, line 147:

> "| A2 | Command-journal foundation consumption | **One qualified durable
> pre-dispatch writer and recovery path** | Existing journal lane
> completed/assigned, storage qualification, schema preflight integration |"

And §5, Task A2, start condition:

> "**Start condition:** A0 identifies the assigned journal owner and
> landed/qualified implementation. PR #27 is observed schema preflight work, not
> proof the whole writer exists. If the writer remains another active lane, report
> dependency ownership and continue B/C if assigned; do not create a second
> writer."

**Four observations settle B5.**

1. **A2's dependency is a three-item list, and Tranche F is not among them:**
   *"Existing journal lane completed/assigned, storage qualification, schema
   preflight integration."*
2. **A2's prerequisite is a conjunction of two things — the writer and the
   recovery path** — named in the same row. It is not a qualification
   artifact, and it is not F-N1/F-N2.
3. **r1 contains no clause tying A2 to Tranche F.** A full read of
   `pr2b-implementation-plan-r1.md` (`08f3ea74…`) for "A2" returns only the
   atomicity row **B-A2** and the base SHAs `75b52a2…` / `6d6110d…`. The
   plan never references the Background-Agent A2 work package at all. Tranche F
   appears solely as §4.6 *"Final qualification (PC-0–PC-31,
   S1–S15)"*, verification only, Gate VII.
4. **Gate VII could not gate A2 even if ordered first.** C-3 §9's Gate VII row
   states it does **not** authorize *"activating dispatch; satisfying contract
   §1.4"*. A2 is a dispatch-path consumption task.

**Classification — two separate requirements, neither substituting for the
other:**

| | A2 writer-and-recovery prerequisite | Full PR 2b qualification |
|---|---|---|
| Controlling source | Background-Agents handoff r2 §4 / §5 Task A2 (`acd9be05…`) | r1 §4.6 and §9 Gate VII (`08f3ea74…`) |
| Deliverable | One qualified durable pre-dispatch writer **and** recovery path | F-N1 `docs/planning/command-journal/pr2b-qualification-evidence.md` + F-N2 provenance receipt |
| Nature | *Capability* — a landed writer and recovery path | *Verification* only; F records results and **does not repair** |
| Gate | none of its own; it is a lane prerequisite | Gate VII |
| Depends on | Tranche B's mechanism **plus** a recovery consumer (§5.3) | all of A–E complete |
| If satisfied | A2 may be commissioned | records the lane's result; **does not authorize activation** |

**Consequence for Tranche-B entry: none.** Tranche F is not a Gate-III
precondition, and A2 is not a Tranche-B deliverable. **This authorization does not
expand Tranche B to cover A2's writer, A2's recovery path, or Tranche F.**

### 5.3 A2 recovery behavior mapped to Tranche-B scope

Required A2 recovery behavior is quoted from its controlling sources: contract
§5 and its §5.3 *"Dispatch idempotency and crash recovery"* sub-clause
(`docs/command-journal-contract.md`, `eaeb6178…`), and Task A2's acceptance
cases (`acd9be05…`). Each is mapped to the §6 file map and the
§6.3/§6.4 tests. **Anything unmapped is named below and is NOT added to
Tranche B.**

**(a) Mapping.**

| A2 required recovery behavior | Tranche-B coverage | In scope? |
|---|---|---|
| Durable pre-dispatch append: no dispatch unless the `journaled` event is durably committed (contract §5.1) | B-M1 append primitive; B-T2 **B-A1** (COMMIT: one connection, one transaction) | **Mechanism only — YES** |
| Journal write failure, timeout, or unavailability means no dispatch — fail closed, never journal-after (contract §5.1) | B-T2 **B-A3** (FAILURE: a journal failure rolls back the lifecycle insert) | **Mechanism only — YES** |
| Chain-head/event-tail divergence detected **inside the append transaction** aborts the append, inserts nothing (contract §5.1, §4.1) | B-T2 **B-A5** (head-divergence rollback; head left at pre-transaction value); **B-A2** (ROLLBACK) | **Mechanism only — YES** |
| At-most-once per `command_id`; duplicate refused by constraint, not silently reconciled | B-T2 **B-A4**; B-T1 **B-R6**, **B-R12** | **Mechanism only — YES** |
| `verify()` chain recomputation from genesis in `seq` order requires runtime read access | B-P2 (`br_app_runtime` `SELECT` on both tables succeeds); §7.2 grant; §10 | **Grant and read path — YES** |
| Hash-integrity of the recomputation: builtin `pg_catalog.sha256()` only, no shadowing | B-H1, B-H2 (S6) | **YES** |
| Runtime cannot disable or drop triggers, nor rewrite the append routine | B-R5, B-R7 | **YES** |
| **Crash after append but before send → recover by recorded command identity** | **none** | **NO — out of scope** |
| **Crash after send but before response → reconcile or mark unknown; never blind retry** | **none** | **NO — out of scope** |
| **Dispatch-attempt reconciliation before any retry: downstream queried by `command_id`; `dispatched` appended carrying the observed identity; `unresolved` appended if indeterminate** (contract §5.3) | **none** | **NO — out of scope** |
| **Runtime verify / rebuild *consumer*** | **none** — §10 defers it expressly | **NO — out of scope** |
| **`unresolved` / `resolved` terminal-determination semantics blocking success claims and retries** (contract §5.4–§5.5) | **none** | **NO — out of scope** |
| **Idempotency enforced by the dispatch path, gateway, and adapter** (contract §5.3) | **none** — Gateway is a prohibited surface (§15.1) | **NO — out of scope** |
| **Reservation persistence integrated at the writer boundary, not held only in a worker map** (Task A2 required contract) | **none** | **NO — out of scope** |

**(b) This draft's own scope already excludes it, and this section changes
nothing.** §5 states: *"**Explicitly not authorized and not described as
authorized:** No runtime writer consumer. No dispatch integration. No recovery
service."* §10 carries `RUNTIME VERIFY CONSUMER — DEFERRED / SEPARATE
AUTHORITY REQUIRED`.

**(c) The exact point where the A2 boundary touches Tranche B.** Contract
§5.1's divergence clause is a fail-closed condition *inside the append
transaction* — the abort itself. Tranche B proves the **abort**. It does not
prove, and does not claim, the *resolution* of a divergence ("dispatch is blocked
until the divergence is resolved as an integrity finding"), which is
recovery-path behavior.

**(d) The consequence the Founder must see — and it is not a Tranche-B
defect.** Tranche B's landing will **not**, by itself, satisfy A2's prerequisite.
Tranche B supplies the durable append primitive, the atomicity and refusal
semantics, and the `SELECT` grant that makes recomputation possible. It supplies
**no consumer** and **no reconciliation**. The qualification receipt
(`22b96d1d…`, §4–§5) independently reaches the same finding as
B1/B2, and adds: *"Tranche-B completion, if it later occurs, would still be
insufficient for A2 if any required recovery behavior remained merely defined or
deferred."* **A2's recovery conjunct therefore requires a separately authorized
consumer. That work is identified here and deliberately not added to Tranche B.**

**(e) No A2 work is authorized, commissioned, scoped, or prepared by this draft.**
A2 remains paused.

---

## 6. File map — validated against C-3 §4.2 and re-anchored at the reference main

Legend: `MOD` existing file modified, `NEW` file created.

| Id | Action | **Exact repository path** | Scope | Verified anchor at `f21693e0…` |
|---|---|---|---|---|
| **B-M1** | MOD | `packages/control-plane/src/migrations.ts` | Append one entry, id `0006_command_journal_authority_split`, to `MIGRATIONS`. Create and configure **only** the journal authority objects named in §7. | `export const MIGRATIONS` at **line 42**; `0005_phase3_run_evidence` at **line 478**; `migrate(pool)` at **line 1362**; file is 1,454 lines. Ids present: `0001_ledger_core`, `0002_pending_rows_carry_no_transition_fields`, `0003_gateway_registry`, `0004_validate_pending_is_bare`, `0005_phase3_run_evidence`. **`0006` is free — collides with nothing.** |
| **B-N1** | NEW | `packages/control-plane/src/migrate-cli.ts` | Bounded administrative migration runner (§6.2). | Path free at `origin/main`. |
| **B-M2** | MOD | `package.json` | Add **only** the script `migrate:admin`, following the compiled-output pattern of `start`. No dependency added. | `"scripts"` opens at **line 14**; `"start": "node dist/packages/control-plane/src/main.js"` at **line 24**; `devDependencies` at **line 34**. No `migrate:admin` present. |
| **B-M3** | MOD | `tsconfig.json` | **Conditional only.** | `packages/control-plane/src/**/*.ts` at **line 19**; `test/**/*.ts` at **line 25**. Both new source files and all new tests already covered. **Expected disposition: `B-M3 = NOT NEEDED`** (PO-4 closed at C-4 §4.3, re-verified here). Change it only if actual compiler or import behavior requires it, and then report the concrete need rather than editing silently. |
| *(B-M3 carry-forward, this amendment)* | — | `tsconfig.json` | **Carry as `re-verify at execution against actual compiler and import behaviour`** (F7, Founder-accepted 2026-09-15) — **not** as a settled `NOT NEEDED`. | The two globs this row turns on were **re-verified at the R4 reference this round** (§4.6.1): `packages/control-plane/src/**/*.ts` and `test/**/*.ts` both still cover the D-1 source and test paths listed below and in §6.3. But at that same reference `tsconfig.json` had drifted **+4 lines** since the FD-1 base, so the executor re-verifies the globs at the actual starting main **against actual compiler and import behaviour** and reports the concrete result rather than inheriting the expectation. |
| **B-T1** | NEW | `test/journal-authority.storage.test.ts` | The authority and denial matrix (§6.3). | Path free. |
| **B-T2** | NEW | `test/journal-append-atomicity.storage.test.ts` | Durable append atomicity (§6.4). | Path free. |
| **B-T3** | NEW | `test/migrate-cli.test.ts` | Runner behavior (§6.5). | Path free. |
| **B-N2** (D-1) | NEW | `packages/control-plane/src/journal-append.ts` | The bounded append client, per Addendum 02 r6 §4. Encodes nothing; imports nothing from `packages/journal` except types. **Dormant on merge: nothing calls it.** | Path **free at the R4 reference** (`baee3fb2…`), verified this round |
| **B-N3** (D-1) | NEW | `packages/control-plane/src/redaction-boundary.ts` | The redaction boundary, per Addendum 02 r6 §4 (as r3 §5). No switch. | Path **free at the R4 reference** (`baee3fb2…`), verified this round |
| **B-T4** (D-1) | NEW | `test/journal-redaction.storage.test.ts` | The r6 §6 redaction matrix, composed with a transaction owner of the store's exact shape and B-N2. | Path **free at the R4 reference** (`baee3fb2…`), verified this round |
| **B-M4** | MOD | **`.github/workflows/ci.yml`** | Extend the **existing `storage-integration` job** so the new suites run under the §8 non-superuser shape. **No second CI mechanism. No new workflow file.** | `storage-integration:` job at **line 73**; `image: postgres:16` at **78**; `POSTGRES_PASSWORD: postgres` at **80**; `POSTGRES_DB: buildroom_test` at **81**; `TEST_DATABASE_URL` at **113** and **123**; `npm run test:storage` run twice. |

**No path outside this table is authorized, by implication or otherwise.**

**D-1 scope, and the limit of this amendment's scope statement.** `B-N2`, `B-N3`,
and `B-T4` are added to this table as **D-1 scope** by the ruling of 2026-09-14
(§0.6), which is **landed on `main`** at merge `baee3fb2…` (PR #44). The
pure-encoder denial row is an **assertion** id and is added at **§6.3**, not here:
this table holds file-scoped ids only, and `B-R16` belongs to the B-T1 matrix (F3).
The §8 non-superuser mechanism is carried by **B-M4**, which is the carrier of stop
condition **S4**; **D-1's condition is met only when the Gate III issuance names
that mechanism** (§8.8, §18). (F3 — ruled; F6, R2 — ruled.)

### 6.1 Discrepancies found between the commissioning scope and C-3 §4.2

Reported explicitly, as required. None is resolved silently.

| # | Item | Finding |
|---|---|---|
| **D-1** | B-M4 "the existing storage-integration workflow path" | **RESOLVED: `.github/workflows/ci.yml`**, the `storage-integration` job at line 73. C-3 §4.2 names it exactly. `.github/workflows/` contains exactly four files at the reference main and `db-admin-migration.yml` is absent (that file belongs to Tranche C and is **not** authorized here). |
| **D-2** | B-T1 "PC-5 through PC-18" | **THE PLAN'S OWN LABEL IS INACCURATE IN BOTH DIRECTIONS.** C-3 §5.2's denial matrix actually asserts **PC-2, PC-3, PC-4** (below PC-5, via B-R4/B-R8/B-R9/B-R10) and does **not** assert **PC-17**, which C-3 §14.1 maps to the *positive* path B-P1/B-P2. The correct B-T1 mapping is enumerated at §6.3 and supersedes the "PC-5–PC-18" shorthand. |
| **D-3** | B-T2 cross-reference | C-3 §4.2's B-T2 row cites *"The §5.3 three-direction atomicity proofs."* **§5.3 is "Tranche C tests."** The atomicity table is in **§5.2**. This is a mis-citation inside r1. The substance is unaffected; the correct anchor is C-3 §5.2's atomicity table, basis C-2 §16.1 and §16.2. |
| **D-4** | B-T2 "three directions" | The table is headed *"Atomicity — proven in three directions, not one"* and contains **five** rows, B-A1 to B-A5. The **three directions** are named exactly by C-2 §16.2: **COMMIT, ROLLBACK, FAILURE**. B-A4 and B-A5 sit in the same table and are equally required. See §6.4. |
| **D-5** | Unassigned tests in §5.2 | C-3 §4.2 assigns B-T1 "the denial matrix" and B-T2 "the atomicity proofs," but §5.2 also contains a **positive path** table (B-P1, B-P2, B-P3) and a **hash-binding security** table (B-H1, B-H2, B-H3) with **no file assignment anywhere in §4.2**. Since no path is authorized by implication, §6.3 assigns them explicitly to B-T1. **This assignment is a construction this authorization makes, not a finding in the plan.** |
| **D-6** | Append routine signature | **`public.command_journal_append(...)` is never given a parameter signature anywhere in the controlling stack.** Verified by exhaustive grep across C-1, C-2, C-3, and the r5 / r5-addendum-01 / r5-addendum-02 predecessors: every occurrence is the literal ellipsis. The signature determines the function's identity, therefore the exact `REVOKE ALL ON FUNCTION …` and `GRANT EXECUTE ON FUNCTION …` targets and the test assertions. **Ruled as FD-B5 — DELEGATED** (§0, §9.1, §17.1). |
| **D-7** | r1 §6.1 steps 14 to 16 | C-3 §6.1's ordered migration steps include step 14, "grant enumerated non-journal operational privileges." **PO-3 states that list "cannot be produced without executing that run, which requires Tranche B."** Placing step 14 inside `0006` is therefore circular. C-2 §13 independently places the same grants at **cutover step 2** (Tranche D), *before* journal objects exist, not inside the migration. **Ruled as FD-B4** (§0, §7.2.1, §17.1): `0006` is steps 1 to 13; step 14 defers to Tranche D. |

### 6.2 B-N1 — administrative migration runner behavior

| Requirement | Binding source |
|---|---|
| Explicit tranche selection, required argument | C-3 §4.2 B-N1; IF-2 |
| **Exactly one tranche per invocation**; refuse if more than one would apply | C-3 §4.2 B-N1 |
| **Fail closed** on an absent, malformed, unknown, or ambiguous selector: non-zero exit, nothing applied | C-3 §4.2; C-2 §10 stage 4 |
| Emit the C-2 §10 **stage-5 evidence to stdout as JSON** | C-3 §4.2 B-N1. Executor must read C-2 §10 and implement the stage-5 shape it actually specifies, not a shape assumed here |
| Connects with the administrative credential **from the environment** | C-3 §4.2 B-N1 |
| **No runtime-server activation path**: importing or invoking the CLI must not start the control-plane server, open the application listener, or run boot | C-3 §4.2; C-2 §12 |
| Implementation shape (parameterize `migrate()` vs. wrap it) is **the Builder's choice, subject to review** | C-3 PO-6 |
| Single-transaction property is supplied by the existing migrator (`migrations.ts:1416-1422` `BEGIN`/`COMMIT`, guarded `ROLLBACK` at `1438`) **provided `0006` is a single migration entry** | C-3 §6.2 |

### 6.3 B-T1 — authority and denial matrix, with the corrected PC mapping

Every denial row executes over a connection whose **`session_user` is
`br_app_runtime`** (see §8.3) and records **literal PostgreSQL output**, not
prose.

| # | Assertion | PC |
|---|---|---|
| B-R1 | Runtime `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on both journal tables: eight distinct `permission denied for table …` | PC-12 |
| B-R2 | Runtime `SET ROLE` to `br_journal_owner` and to `command_journal_writer`: denied, both | PC-10 |
| B-R3 | Runtime `SET SESSION AUTHORIZATION` to either: denied, both | PC-11 |
| B-R4 | Runtime cannot reach `neon_superuser`: recursive `pg_auth_members` walk returns zero; `pg_has_role(…,'USAGE'/'MEMBER'/'SET')` all false | PC-2, PC-16 |
| B-R5 | Runtime cannot disable, drop, or add journal triggers: `must be owner of table …` | PC-13 |
| B-R6 | `SET session_replication_role='replica'` refused at parameter level | PC-15 |
| B-R7 | Runtime cannot `ALTER` / `CREATE OR REPLACE` the append routine or change its owner: `must be owner of function …` | PC-14 |
| B-R8 | Zero membership edges at any depth to all four privileged roles, **including `WITH INHERIT FALSE` and `WITH SET FALSE` variants**, which must fail the assertion exactly as a plain edge does. **Carries the positive detection controls ruled at FD-B2(a); see §6.3.1** | PC-2 (R-1, R-3) |
| B-R9 | Role attributes: `rolsuper=f`, `rolcreaterole=f`, `rolcreatedb=f`, `rolbypassrls=f`, `rolreplication=f` | PC-3 (R-3) |
| B-R10 | No `pg_write_all_data` / `pg_read_all_data` class membership | PC-4 |
| B-R11 | `pg_default_acl` review: no default grant reaches the runtime | PC-16 |
| B-R12 | Routine ACL carries no `PUBLIC` execute entry (`proacl` has no bare `=X/`) | PC-18 |
| B-R13 | Ownership placement: tables and triggers owned by `br_journal_owner`; the routine owned by `command_journal_writer`, **not** the table owner | PC-6, PC-7, PC-9 |
| B-R14 | Both privileged roles are `NOLOGIN` (`rolcanlogin=f`) with no password set | PC-5 |
| B-R15 | No journal sequence exists | PC-8 |
| B-P1 | `SECURITY DEFINER` append succeeds: runtime `EXECUTE`s the routine and the row lands | PC-17 |
| B-P2 | Runtime `SELECT` on both tables succeeds, **required for `verify()` chain recomputation from genesis** (C-1 §4.1, C-2 §3.3) | PC-17 |
| B-P3 | Containment: inside the routine `current_user` is the writer; after the call it is the runtime login; the runtime still cannot `INSERT` | C-2 §16.3 |
| B-H1 | A user-defined hash helper cannot shadow `pg_catalog.sha256()`: a non-superuser cannot create `pg_catalog.sha256`; a `pg_temp` overload does not capture resolution; verified against the NIST vector for `"abc"`. **No pgcrypto `digest()` substitution** | C-2 §16.5 (S6) |
| B-H2 | `search_path` hardening: the routine pins `search_path = pg_catalog, pg_temp` with `public` **absent**; all non-builtin references fully qualified; no dynamic SQL | C-2 §16.3 |
| B-H3 | Pool `search_path` does not alter resolution of the schema-qualified call site. **Tranche-B portion only**; PC-24's post-cutover re-confirmation belongs to Tranche D | PC-24 (partial) |
| B-R16 | **Pure encoder, denial and positive control** (r6 §2.8's rows for `command_journal_encode_row`; r6 labeled this row `"B-R14"` and **the ruling of 2026-09-14 renumbers it `B-R16`** because plan r1 §5.2 already assigns `B-R14` to the NOLOGIN assertion). Executed over a connection whose **`session_user` is `br_app_runtime`**, with **literal PostgreSQL output recorded**: the schema-qualified call yields `ERROR: permission denied for function command_journal_encode_row`; `has_function_privilege('br_app_runtime', 'public.command_journal_encode_row(text,jsonb,jsonb,bigint,text)', 'EXECUTE')` is `false`; the pure encoder's `pg_proc.proacl` **IS NOT NULL** and `aclexplode` yields exactly one row (`grantee = proowner`, `EXECUTE`) — no `grantee = 0` (`PUBLIC`) row and none for `br_app_runtime`; `proowner` is `command_journal_writer` (extends B-R13 / PC-7). **Positive control** (the §6.3.1 rule, applied): `command_journal_append(...)` as `br_app_runtime` with a valid `journaled` row returns one row, proving the routine still reaches the encoder through the owner's privilege after the `PUBLIC` revoke. | PC-7 (extends), r6 §2.8 |

**Complete B-T1 PC coverage: PC-2, PC-3, PC-4, PC-5, PC-6, PC-7, PC-8, PC-9,
PC-10, PC-11, PC-12, PC-13, PC-14, PC-15, PC-16, PC-17, PC-18, and the
Tranche-B portion of PC-24.** This enumeration governs; "PC-5 through PC-18"
does not.

**FD-B6 disposition.** The Founder delegated this assignment rather than ruling
it as a prerequisite: *"B-T1, test/journal-authority.storage.test.ts, carries its
assigned denial, positive-path, and hash-binding assertions within the existing
file map."* **No new path is created and no path outside the §6 table is
authorized.**

### 6.3.1 B-R8 positive detection controls — RULED (FD-B2(a))

A negative assertion that has never been shown to fire is not evidence. FD-B2(a)
authorizes bounded positive controls that make B-R8 falsifiable.

**The probe role, bounded.** One uniquely named, ephemeral **`NOLOGIN`** probe
role, with **no password and no administrative role attributes**, created inside
the same exclusive fixture. It is **never `br_app_runtime` and never a production
role name**. Its membership target is a fixture-created `br_journal_owner` or
`command_journal_writer` role.

**The four sequential membership controls**, quoted from FD-B2(a):

> "1. Plain membership.
> 2. WITH INHERIT FALSE.
> 3. WITH SET FALSE.
> 4. Both modifiers false."

**Per case, all four required**, quoted:

> "- Use the identical recursive detection query parameterized by probe identity.
> - Assert the actual stored inherit_option and set_option values.
> - Assert that the forbidden membership is detected.
> - Revoke the membership and verify absence before the next case."

**Plus the no-membership control**: executed expecting **zero findings**. Five
controls in total, four positive and one negative.

**The real-runtime assertion is maintained separately and is not replaced by the
probe.** `br_app_runtime` has no forbidden direct or transitive memberships and
no prohibited role attributes.

**Same-run removal.** Every probe membership is revoked and the probe role
dropped in the same run, with absence from `pg_roles` asserted. Probe
memberships are removed **before** the probe role is dropped.

**Permission is not proof.** Quoted: *"B-R8 passes only after successful
execution and review of the required evidence."* This draft confers no execution;
see §7.5.

**Stop, do not weaken.** Quoted: *"If any required control cannot execute within
these limits, stop with SCOPE DECISION REQUIRED. Do not weaken the test or grant
memberships to br_app_runtime."*

### 6.4 B-T2 — durable append atomicity

**The three directions, stated exactly from C-2 §16.2:**

```
COMMIT   : lifecycle rows=1  journal refs=1     (both persisted)
ROLLBACK : lifecycle rows=0  journal refs=0     (neither persisted; head did not advance)
FAILURE  : duplicate command_id inside the act -> lifecycle rows=0
```

| # | Assertion | Basis |
|---|---|---|
| B-A1 | **COMMIT.** Journal append and lifecycle insert share **one connection, one transaction**: lifecycle rows=1, journal refs=1 | C-2 §16.1, §16.2 |
| B-A2 | **ROLLBACK.** Neither persists, and **the chain head is unchanged** — the head latch did not advance | C-2 §16.2 |
| B-A3 | **FAILURE.** A journal failure rolls back the lifecycle insert: duplicate `command_id` inside the act gives lifecycle rows=0. **The governance-critical case**: a journal failure cannot orphan a lifecycle insertion | C-2 §16.2 |
| B-A4 | Duplicate command ID is refused **by constraint**, not silently reconciled | C-2 §16.2, C-1 §2 |
| B-A5 | Head-divergence rollback: a concurrent append that would diverge the head is refused and rolls back; the chain head is left at its pre-transaction value | C-2 §4.1, C-1 §4.1 |

B-A1 through B-A3 are the three directions. B-A4 and B-A5 are additional rows of
the same C-3 §5.2 atomicity table and are equally required for B-T2.

### 6.5 B-T3 — runner tests

Covers: tranche selection; refusal of an invalid, unknown, absent, or ambiguous
tranche; one-tranche-per-run behavior; the required stage-5 evidence output
shape; and **no accidental runtime activation** (importing or invoking the CLI
starts no server and opens no listener).

---

## 7. Database authority, ownership, and disposable fixture permissions

### 7.1 The authority split, verbatim from C-2 §3 and §4

| Object | Kind | Attributes / owner | Source |
|---|---|---|---|
| `br_app_runtime` | **LOGIN** role | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT`. `rolcanlogin=t`, everything else in C-2 §3.2 false. Zero memberships. | C-2 §3.1, §3.2 |
| `br_journal_owner` | role | **`NOLOGIN`**, `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`; **no credential exists for it**; no password | C-2 §4.2 |
| `command_journal_writer` | role | **`NOLOGIN`**, same attribute set; **no credential exists for it**; no password | C-2 §4.3 |
| `command_journal_events` | table | owner **`br_journal_owner`** | C-2 §4.2 |
| `command_journal_chain_head` | singleton table | owner **`br_journal_owner`** | C-2 §4.2 |
| `command_journal_immutable()` | trigger function | owner **`br_journal_owner`** | C-2 §4.2 |
| append-only trigger on `command_journal_events` | trigger | implicitly the table owner | C-2 §16.6 |
| append-only trigger on `command_journal_chain_head` | trigger | implicitly the table owner | C-3 §4.2.1 |
| `public.command_journal_append(...)` | `SECURITY DEFINER` function | owner **`command_journal_writer`, deliberately NOT the table owner**, so the body cannot inherit trigger-disabling power | C-2 §4.3, §16.3 |
| genesis head row | data | `seq=0`, chain hash = 64 ASCII `0`, exactly one row | C-3 §4.2.1, C-1 §4.1 |

**Genesis binding.** `GENESIS_CHAIN_HASH = '0'.repeat(64)` at
`packages/journal/src/chain.ts:17` (blob `a27bc2305f7f…`, unchanged at the
reference main). The migration's literal must equal that value, and **a test
asserts the equality rather than restating the constant.**

**No sequence is created for `seq`** (PC-8: the routine assigns it).

### 7.2 Privilege grants, exact

| Grantee | Grant | Source |
|---|---|---|
| `command_journal_writer` | `SELECT, INSERT` on `command_journal_events`; `SELECT, UPDATE` on `command_journal_chain_head`. **Not `ALL`.** | C-2 §4.3, C-3 §6.1 step 8 |
| `br_app_runtime` | `EXECUTE` on `public.command_journal_append(...)` — the single explicit grant, after a mandatory `REVOKE ALL … FROM PUBLIC` | C-2 §3.3, C-3 §6.1 steps 10 and 11 |
| `br_app_runtime` | `SELECT` on both journal tables, and **nothing else on journal objects** | C-2 §3.3, C-3 §6.1 step 12 |
| `PUBLIC` | `REVOKE ALL` on both tables **before any grant**, and `REVOKE ALL ON FUNCTION` **before** the `EXECUTE` grant | C-3 §6.1 steps 7 and 10 |

**Separation that must be preserved, and is the point of the tranche:**

```
object owner        : br_journal_owner        (NOLOGIN, no credential)
journal writer      : command_journal_writer  (NOLOGIN, no credential, owns only the routine)
runtime login       : br_app_runtime          (LOGIN; EXECUTE + SELECT only)
read/verification   : br_app_runtime SELECT   (for verify() recomputation)
administrative      : neondb_owner            (existing owner credential; NOT provisioned here)
```

**The runtime must never receive direct `UPDATE` or `DELETE` authority over
journal events.** **RULE R-1 is binding**: no membership edge from
`br_app_runtime` to `br_journal_owner`, `command_journal_writer`, `neondb_owner`,
or `neon_superuser`, **including `WITH INHERIT FALSE`, `WITH SET FALSE`, or
both** (C-2 §3.4; measured necessary in r4). Proposing any such edge is **S5**
and a plan-drift stop.

**The administrative migration runner must not become a production runtime
privilege path.** B-N1 is an administrative-plane entrypoint only. It is not
imported by, reachable from, or started by the control-plane server.

#### 7.2.1 Migration `0006` placement — RULED (FD-B4)

**Content of `0006`.** Migration `0006` implements **C-3 §6.1 steps 1 to 13**,

**D-1 reconciliation (this amendment). RULED 2026-09-14 (§0.6).** Ruling
sentence 2, quoted verbatim:

> 2. r6 §2.8 does not return step 15 to migration 0006 or extend that
>    migration's DDL. Its functions/routines default-privilege review
>    belongs to FD-B4's B-R11 carrier; migration 0006 remains steps 1–13
>    only, with no step-15 SQL.

Read with the paragraph above: C-3 §6.1 steps 1–13 remain the **only** content of
`0006`. r6 §2.8's step 15 (`ALTER DEFAULT PRIVILEGES` review) **does not return to
`0006` and does not extend its DDL**; that review **belongs to the B-R11 carrier**,
whose row already reads *"`pg_default_acl` review: no default grant reaches the
runtime"* (§6.3, committed line 1109). `0006` therefore gains **no step-15 SQL**,
and §7.2's `0006` content is unchanged by r6 §2.8. No SCOPE DECISION is raised by
this reconciliation; the migrator's transaction boundary obligation above is
untouched.
and only those.

**Atomicity, verified not assumed.** FD-B4: *"Steps 4–13 remain atomic as
required by C-3 §6.2. Verify the existing migrator provides the required
transaction boundary; do not merely assume it."* The executor must **prove** the
migrator's transaction boundary rather than infer it from the migrator's
ordinary behavior; a failure to prove it is a `SCOPE DECISION REQUIRED`, not a
design change.

**Relocations, at full acceptance strength.**

| C-3 §6.1 step | Disposition | Carrier |
|---|---|---|
| 15 — default-privilege review | Not a migration statement; **no SQL in `0006`** | **B-R11** |
| 16 — recursive membership assertion | Not a migration statement; **no SQL in `0006`** | **B-R8**, including the §6.3.1 positive detection controls |

FD-B4: *"Preserve their full acceptance strength."* **No required check is
dropped; two are relocated to the tests that already own them.**

**Step 14 deferral.** Step 14's enumerated non-journal operational grants are
**deferred to Tranche D**, where the controlling cutover plan (C-2 §13 step 2)
places them and where PO-3 becomes producible. **PO-3 and its downstream
verification requirement are preserved and remain open.** They are **not**
authored, guessed, or stubbed in Tranche B.

**Grant ceiling in Tranche B.** FD-B4: *"In Tranche B, br_app_runtime receives
only the planned append-routine EXECUTE and journal-table SELECT privileges."*
**No blanket `ALL` grant, guessed grant, or stub grant is permitted** (r1 §15
stop condition 4, C-2 §3.3).

**This resolves a placement conflict between two controlling documents. It adds,
removes, and weakens no required grant.**

### 7.3 Enumerated disposable-fixture authority — RULED (FD-B2, FD-B2(a))

**Do not assume that permission to use a disposable environment authorizes every
SQL operation within it.** The operations below are enumerated so that each is
granted deliberately or not at all.

**Scope of the grant**, quoted from FD-B2: *"permit the original §7.3 items 1–17
only to the extent consistent with this ruling, plus the B-R8 probe below."*
Where the predecessor's item text and this ruling differ, **this ruling
governs**. Two predecessor provisions are expressly overridden below: item 15's
`DROP OWNED BY` teardown, and the "safe drop before create" idempotency
rationale.

Permitted **exclusively inside a disposable PostgreSQL instance whose exclusive,
run-specific provisioning is externally verifiable per §7.3.1**.

**Role operations**
1. `CREATE ROLE br_journal_owner` with the C-2 §4.2 attributes. **`NOLOGIN`, no password.**
2. `CREATE ROLE command_journal_writer` with the C-2 §4.3 attributes. **`NOLOGIN`, no password.**
3. `CREATE ROLE br_app_runtime` **`LOGIN`** with the C-2 §3.2 attributes **and a per-run ephemeral password** (§7.3.3). This is the operation the Tranche-A exception expressly forbids; see §7.4.
4. `CREATE ROLE <unique-probe-name>` **`NOLOGIN`, no password, no administrative role attributes**, for the FD-B2(a) controls at §6.3.1. Never a production role name.

**Ownership and object operations**
5. `CREATE TABLE` for `command_journal_events` and `command_journal_chain_head`.
6. `ALTER TABLE … OWNER TO br_journal_owner` for both, **in the same transaction as creation** (C-3 §6.1 step 4: ownership must never rest, even transiently across a commit boundary, on a runtime-reachable role).
7. `CREATE FUNCTION command_journal_immutable()` and `ALTER FUNCTION … OWNER TO br_journal_owner`.
8. `CREATE TRIGGER` for both append-only triggers.
9. `CREATE FUNCTION public.command_journal_append(...) SECURITY DEFINER SET search_path = pg_catalog, pg_temp` and `ALTER FUNCTION … OWNER TO command_journal_writer`. **The table-owner and writer-authority roles remain separate** (FD-B2).

**Privilege operations**
10. `REVOKE ALL … FROM PUBLIC` on both tables and on the routine.
11. `GRANT SELECT, INSERT` / `GRANT SELECT, UPDATE` to `command_journal_writer`.
12. `GRANT EXECUTE` on the routine and `GRANT SELECT` on both tables to `br_app_runtime`, **and nothing further** (FD-B4).
13. `INSERT` the singleton genesis head row.

**Membership operations, probe only**
14. `GRANT <fixture-target-role> TO <probe>` in the four FD-B2(a) variants, and the matching `REVOKE`, **against a fixture-created `br_journal_owner` or `command_journal_writer` target only**. **No membership may be granted to `br_app_runtime` in any form.**

**Connection operation**
15. Open a **second connection whose `session_user` is `br_app_runtime`**, authenticated with the ephemeral password over the disposable instance's loopback listener. Required by §8.3.

**Negative-control operations (expected to fail; failure is the assertion)**
16. Attempt `CREATE FUNCTION pg_catalog.sha256(...)` as a non-superuser, and a `pg_temp` overload, for B-H1.

**Teardown, mandatory and same-run** (§7.3.2 governs the method)
17. Explicitly enumerate and remove **only this run's** objects, grants, and memberships, then drop this run's roles.
18. **Assert every fixture role and the probe role are absent from `pg_roles`** and report the assertion result.
19. **Setup, assertion, or teardown failure fails qualification.** A skipped teardown is not a pass.

**Exact SQL enumeration is required.** FD-B2: *"The successor must enumerate
exact SQL permissions and cleanup operations. It must not infer unrestricted
ALTER ROLE authority from a prohibition against altering other roles."*
Accordingly: the only `ALTER ROLE`-class authority granted is that required to
set the per-run ephemeral password on `br_app_runtime` at creation. **No other
`ALTER ROLE` on any role, including the three fixture roles and the probe, is
authorized.** No change to the CI `postgres` superuser.

#### 7.3.1 Exclusive disposable ownership — the gate before any fixture state

Quoted from FD-B2:

> "Before creating or removing fixture state, establish externally verifiable,
> run-specific provisioning of the instance.
>
> A TEST_DATABASE_URL value, familiar role name, or sentinel written inside
> the database is insufficient by itself."

**This supersedes the predecessor's reliance on `TEST_DATABASE_URL` as the
disposability proof.** A DSN is an address, not a property.

**Acceptable evidence**, quoted: *"the CI job's own service-container lifecycle
and identity, or a locally provisioned disposable instance's run-specific
identity and lifecycle. The instance must be exclusive to the qualification run
and scheduled for destruction afterward."*

**Pre-existing state is a stop, not a cleanup task**, quoted: *"Unexpected
pre-existing fixture roles, objects, or dependencies require SCOPE DECISION
REQUIRED. Do not pre-drop unidentified state or use DROP OWNED BY to erase it."*

**Concurrency.** Quoted: *"Coordinate fixture users within the exclusive run so
concurrent tests do not race over cluster-wide role names."* The fixture role
names are the **real production role names** and are **cluster-wide**, not
database-scoped.

#### 7.3.2 Cleanup — enumerated, not blanket

- Remove **only this run's** objects and grants, explicitly enumerated, **before**
  dropping its roles.
- **Remove probe memberships before dropping the probe.**
- **`DROP OWNED BY` is not authorized** for teardown. The predecessor's item 15
  is overridden on this point.
- Assert **every** fixture role is absent from `pg_roles` before successful
  completion.
- Setup, assertion, or teardown failure **fails qualification**.

**The twice-run CI case, corrected.** FD-B2: *"A second storage-suite invocation
must not silently clean residue left by the first invocation."* CI runs
`test:storage` twice in the same container. Under mandatory same-run teardown a
correct first invocation leaves nothing. **Residue found by the second
invocation is therefore a defect signal, and it is routed to §7.3.1's
`SCOPE DECISION REQUIRED`, not absorbed by a drop-before-create.** The
predecessor's "safe drop before create" idempotency rationale is **overridden**.

#### 7.3.3 Credential handling

Quoted from FD-B2:

> "Generate the runtime fixture password in process memory and supply it
> through a non-persistent, non-logged connection mechanism. Do not place it
> in evidence, source, repository/environment secrets, workflow files,
> persistent configuration, shell history, or process arguments.
>
> Use correct SQL literal handling when assigning the password. Prevent
> credential-bearing SQL from appearing in server or harness logs, including
> error paths. The probe role has no password."

**Never logged, never written to evidence, never committed**, and never placed in
a workflow file, repository secret, environment secret, or Railway variable.

#### 7.3.4 Bounding conditions, binding

- **Disposable instances only.** Never Neon. Never a production, shared, staging,
  or governed database. The runner and the suites must **refuse** to operate
  against any instance not proven disposable under §7.3.1.
- **No membership grant to `br_app_runtime`, ever**, in any form.
- **No blanket `ALL` grant at any point** (FD-B4).
- No persistent, shared, governed, Neon, or production effect of any kind.
- If a Tranche-B acceptance criterion cannot be proved within these limits, the
  executor stops with `SCOPE DECISION REQUIRED` and **does not broaden the
  exception**.

### 7.4 This is NOT the Tranche-A exception, and does not broaden it

E-4, as ratified by E-5, amends **r1 §4.1 (Tranche A's FORBIDDEN list) only**.
Its permitted set, quoted from E-5:

> "only the amendment's minimum ephemeral **NON-LOGIN** test-role fixtures for
> A-R3 inside a disposable local `TEST_DATABASE_URL` instance, using **`SET
> ROLE` from the existing test session**, with same-run teardown and verified
> absence from `pg_roles`."

E-4's own text prohibits, in express terms: "**LOGIN capability, passwords,
connection credentials, membership grants or revokes, `ALTER ROLE`, privilege
grants or revokes, attribute changes,** or any persistent/shared/governed/Neon/
production effect."

**Tranche B requires LOGIN capability, a password, a second connection, and
privilege grants and revokes. Every one of those is expressly outside the
Tranche-A exception.**

Accordingly:

- **§7.3 is a new, separate, broader fixture authority**, requested on its own
  merits for Tranche B. It is **not** presented as previously authorized and
  **not** an extension of E-4.
- **The Tranche-A exception is not amended, widened, or reinterpreted by this
  draft.** It continues to govern Tranche A on its own terms.
- Nothing in §7.3 is characterized as a previously prohibited operation that was
  previously authorized. It was prohibited for Tranche A and is **requested,
  newly, for Tranche B**.

**Ruled as FD-B2 — GRANTED AS BOUNDED** (§0, §7.3, §17.1). The grant is new and separate; it does not amend, widen, or reinterpret the Tranche-A exception.

### 7.5 No fixture execution under this commission

**No database fixture SQL was executed in the production of this draft or of
this R2 successor.** No connection was opened to any PostgreSQL instance,
disposable or otherwise. Every database fact above is read from the controlling
documents, not observed.

**The FD-B2 and FD-B2(a) grants are prospective.** They describe what a separate
Gate III implementation issuance may permit inside a verified disposable fixture.
The plan rulings at §0 authorize **preparation and independent document review
only**, and confer no execution. Quoted from the ruling: *"No code
implementation, fixture SQL, execution dispatch, repository mutation, GitHub
write, ready transition, merge, deployment, or A2 work is authorized by this
message."*

---

## 8. PO-1 — CI non-superuser shape, read-only assessment

### 8.1 Observed CI facts, read from committed truth

`.github/workflows/ci.yml` at `origin/main` (blob `7e485bdf3764…`, **byte-identical
to FD-1's selected base**):

| Fact | Observed value |
|---|---|
| Job | `storage-integration:` at **line 73**, `runs-on: ubuntu-latest` |
| Service | `postgres`, `image: postgres:16` (line 78) |
| Service env | `POSTGRES_PASSWORD: postgres` (80), `POSTGRES_DB: buildroom_test` (81) |
| Port | `5432:5432` (83) |
| Health gate | `pg_isready -U postgres`, 5s interval, 10 retries (84 to 88) |
| Test binding | `TEST_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/buildroom_test` at lines **113** and **123** |
| Command | `npm run test:storage`, **run twice** (lines 114 and 124), the second run deliberately proving re-runnability |
| Identity under test today | **`postgres`, a superuser** |

**PO-1 stands exactly as C-3 stated it.** Nothing in the intervening main advance
changed this job.

### 8.2 Privileged disposable setup vs. the identity under test

These are two distinct identities inside one disposable container, and the
distinction is the whole of PO-1:

| Role in the fixture | Identity | Purpose |
|---|---|---|
| **Privileged disposable setup** | `postgres` (superuser **within the container only**) | Applies migration `0006`, creates the three roles and all objects, performs grants and revokes, and performs teardown. Never the identity under test. |
| **Identity under test** | `br_app_runtime` over a **second connection** | Every denial and positive assertion in §6.3 executes here. |

The container's superuser is not a production credential and has no reach beyond
the disposable instance. Using it for setup is not an owner-class shortcut; using
it for the **assertions** would be.

### 8.3 Why an owner-class shortcut invalidates the test

**`SET ROLE br_app_runtime` from the superuser session is NOT an acceptable
substitute for a genuine `br_app_runtime` login**, and the suite must not use it
for the denial matrix.

The decisive reason is definitional rather than a contested claim about
PostgreSQL internals: `SET ROLE` changes `current_user` but leaves
**`session_user` as the superuser**. S4 and PO-1 are stated in terms of running
the matrix **"as a non-superuser login."** A session whose `session_user` is a
superuser is not a non-superuser login, whatever `current_user` reports.

The practical consequence is concrete for at least **B-R3**: `SET SESSION
AUTHORIZATION` is gated on the **session** user's superuser status. From a
`SET ROLE`-ed superuser session it would **succeed**, so the denial would never
fire and the assertion would pass for the wrong reason or fail for the wrong
reason. The same class of exposure applies to **B-R6**'s `SET
session_replication_role` parameter check. (Confidence: **Likely** on the exact
per-assertion mechanics; **Certain** on the definitional point that
`session_user` is unchanged. The RED observation required by §11 will settle the
mechanics empirically, which is the correct place to settle them.)

Catalog-only assertions (B-R4, B-R8, B-R9, B-R10, B-R11, B-R12, B-R13, B-R14,
B-R15) are identity-independent and would read the same either way, which is
precisely why they must not be used to argue the matrix is satisfied.

**Requirement: every §6.3 denial and positive row executes over a connection
whose `session_user` is `br_app_runtime`.** The suite asserts this
(`SELECT session_user`) before running the matrix, and fails closed if it is not.

### 8.4 Exact fixture operations and permissions PO-1 needs

**Permitted operations.** Enumerated at **§7.3**, items **1 to 19**, together
with the bounding conditions at §7.3.1 through §7.3.4. **PO-1 requests no
permitted operation beyond that set.** The FD-B2(a) probe membership operations
at item 14 belong to **B-R8** rather than to PO-1; PO-1 neither requires nor
extends them.

**Mandatory verification obligations, which are not narrowed by PO-1's operation
scope.** The complete authorized fixture scope applies in full to any run that
exercises PO-1. These are obligations, not permissions, and they are carried
here at their §7.3 strength rather than restated in a weaker form:

- **§7.3.1** exclusive disposable ownership, externally verified **before** any
  fixture state is created or removed. Unexpected pre-existing fixture state is
  `SCOPE DECISION REQUIRED`.
- **§7.3 item 17** enumerated same-run removal of **only this run's** objects,
  grants, and memberships, with probe memberships removed before the probe role.
- **§7.3 item 18** the assertion that **every fixture role and the FD-B2(a)
  probe role are absent from `pg_roles`**, with the result reported.
- **§7.3 item 19** **setup, assertion, or teardown failure fails
  qualification.** A skipped teardown is not a pass.
- **§7.3.2** cleanup method, including that **`DROP OWNED BY` is not
  authorized** and that a second storage-suite invocation must not silently
  clean residue from the first.
- **§7.3.3** credential handling for the per-run ephemeral password.
- **B-R8** and its §6.3.1 positive detection controls, where a run exercises
  them. **B-R8's evidence obligation is not discharged by PO-1** and is not
  weakened by PO-1's narrower operation set.

**The two lists are deliberately distinct.** The first is what PO-1 is permitted
to do. The second is what any run must prove regardless of which operations it
uses. **Nothing here broadens FD-B2 or FD-B2(a).**

### 8.5 Disposition

**PO-1: FEASIBLE — NOT BLOCKED. Conditional on FD-B2.**

`BLOCKED — PO-1 CI NON-SUPERUSER SHAPE` is **not** returned.

Reasoning: the CI Postgres is a disposable service container in which the test
harness already holds superuser authority. Creating a `LOGIN` role with a
password and opening a second connection on `127.0.0.1:5432` is within that
authority. The official `postgres:16` image with `POSTGRES_PASSWORD` set
configures host authentication such that a password-holding role can connect
over the loopback listener. **Confidence: Likely, not Certain** — this rests on
the image's documented default host-auth configuration, which was **not**
observed live under this read-only commission.

**The obstacle to PO-1 is authority, not feasibility.** The blocking item is
FD-B2, because the operations required (LOGIN, password, grants) are exactly
those the Tranche-A exception forbids. **The acceptance criterion is not
weakened**; the non-superuser-login requirement is carried at full strength in
§8.3.

### 8.6 Smallest bounded feasibility probe, specified but NOT executed

Offered only if the Founder wants the residual `Likely` closed before issuance.
**Not executed under this drafting commission.**

| Field | Value |
|---|---|
| Scope | One throwaway local `postgres:16` container, created and destroyed by the probe. **No CI run. No GitHub mutation. No Neon. No repository change.** |
| Permission required | Start and stop one local disposable container; connect to it |
| Operations | `CREATE ROLE probe_tmp_login LOGIN PASSWORD '<generated>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`; open a second connection as it; `SELECT session_user, current_user`; confirm `session_user = 'probe_tmp_login'`; `DROP ROLE probe_tmp_login`; assert absent from `pg_roles`; destroy the container |
| Settles | Whether a second password-authenticated non-superuser login is reachable on the image's default host-auth configuration |
| Does not settle | Anything about Neon, production, or GitHub. **PO-2 remains open and is not touched.** |
| Role name | Deliberately **not** a real role name, so the probe cannot be mistaken for the fixture |

### 8.7 Prohibited in PO-1 work

No production credential is invented, requested, or provisioned. **No GitHub
secret or environment is created, read, modified, or listed.** No second CI
mechanism is created. The `db-admin-migration` environment belongs to Tranche C
and Gate IV and is untouched.

**Re-verified live at this drafting session.** `gh api .../environments` returns
exactly two environments, `compassionate-happiness / production` and `copilot`,
**both with `protection_rules` length 0**. No `db-admin-migration` environment
exists. `.github/workflows/` at `origin/main` holds exactly four files
(`attribution-shape.yml`, `ci.yml`, `claude-code-review.yml`, `path-audit.yml`);
`db-admin-migration.yml` is **absent**. This is Gate IV's plane and it does not
yet exist — which is the whole of §5.1's distinction.

### 8.8 The §8 mechanism, B-M4, and stop condition S4 — RULED (D-1, 2026-09-14)

**The relation, stated precisely, because three different object classes are in
play.** From the committed stack: *S4* is a **stop condition**, defined at C-2
storage architecture r6 committed line 951 (*"CI cannot run the negative matrix as
a non-superuser login"*). *B-M4* is a **file-map id** — the `.github/workflows/ci.yml`
row of §6 (committed line 1061) — and §8 of this act specifies the **mechanism**
that operates through it. *FD-B2* is the **authority** for the disposable fixture
operations the mechanism needs. This section states **B-M4 clears S4 by the §8
mechanism**, which is the relation r3 already asserts (*"B-M4 carries S4"*) and
which C-3 implementation plan r1 committed line 867 records in its S4 row with
`B-M4` in the *Cleared by* column.

**D-1's condition, quoted verbatim from the ruling (§0.6, ruling lines 36–44):**

> Acceptance is conditional on the governing Gate III instrument
> adopting r6 §2.3's interface and on B-M4, the ci.yml file-map change,
> clearing plan r1 stop condition S4 by the mechanism r3 §8 specifies.
> Otherwise the caller is withdrawn.
>
> No Gate III execution authority is effective unless the issuance names
> the CI bootstrap/identity mechanism under which the denial matrix and
> vector tests run as the required non-superuser login, thereby clearing
> S4 through B-M4. The mechanism is not chosen by this ruling.

**Therefore, binding on this act and on the issuer.** (1) The mechanism is the
one **§8 of this act specifies**, and §8.1–§8.7 are the R3 text retained unchanged.
(2) **The mechanism is NOT chosen by the ruling**, and it is **not chosen by this
act** either; this act has no authority to choose it. (3) **D-1's condition is met
only when the Gate III issuance names that mechanism** — a scope acceptance is not
a naming, and no naming exists yet (§2.3, §18). (4) If B-M4 does not clear S4 by
that mechanism, **the D-1 caller is withdrawn**, and that is the Founder's call,
not this act's. (F6, R2 — ruled.)

---

## 9. Durable append requirements

The implementation follows C-1 and C-2 exactly:

- **Append-only journal semantics.** One appended row per command event; nothing
  on a journal row is ever updated (C-1 §3, and the event-sourced row model
  fixed in C-1's header). Enforced at the database layer by trigger, not by
  convention.
- **Chain-head serialization.** The singleton `command_journal_chain_head` holds
  no journal state, only the append latch (C-1 §3, §4.1).
- **Atomic event and chain-head transition** in one transaction on one
  connection (C-2 §16.1).
- **Failure rollback with no partial durable state**: on any failure neither the
  event nor the head advance persists (C-2 §16.2, B-A2, B-A5).
- **Replay and verification compatible**: state supports `verify()` chain
  recomputation from genesis over `command_journal_events` ordered by `seq`
  (C-1 §4.1); `br_app_runtime` holds the `SELECT` required for it (C-2 §3.3).
- **Specified errors and fail-closed behavior**, including duplicate
  `command_id` refused by constraint (B-A4) and head divergence aborting the
  transaction (B-A5).
- **Builtin `pg_catalog.sha256()` only.** No user-defined hash helper, no
  pgcrypto `digest()` substitution. Substitution is **S6** (C-2 §16.5).
- **`SECURITY DEFINER` hardening**: `search_path = pg_catalog, pg_temp` with
  `public` **absent**; fully qualified non-builtin references; no dynamic SQL;
  `PUBLIC EXECUTE` revoked before the single explicit grant (C-2 §16.3).

**No alternate journal implementation is added.** `packages/journal` remains the
serialization and chain source of truth; migration `0006` establishes the

**The D-1 reconciliation for this clause — RULED 2026-09-14 (§0.6).** The
prohibition above (*"No alternate journal implementation is added."*) is **not
withdrawn**. Ruling sentence 1, quoted verbatim, fixes its scope:

> 1. r6's SQL encoder is a second conforming serializer implementation
>    required to produce byte-identical canonical bytes with
>    packages/journal; it is not a second journal, chain, sequence space,
>    writer, or runtime consumer, and does not displace packages/journal
>    as the contract and reference-vector source.

On that text: the r6 SQL encoder is a second **serializer implementation** and is
permitted **only** in that character — it must produce **byte-identical canonical
bytes** with `packages/journal`. It is **not** a second journal, chain, sequence
space, writer, or runtime consumer, and it **does not displace** `packages/journal`
as the contract and reference-vector source. **This clause and §5's are reconciled
to the same reading; neither prohibition is deleted**, which is why this amendment
is addition-with-narrowing rather than pure insertion on this single point. (F4,
Founder-accepted 2026-09-15.)
database-side authority for it.

### 9.1 Append signature and return type — DELEGATED (FD-B5)

Quoted from the ruling:

> "The append signature and return type remain the Builder's implementation
> choice under PO-6, subject to the contract and independent review.
> Creation, grants, revocations, and catalog assertions must identify the
> same exact function. Record the final signature and return type."

**Identity consistency is the binding constraint.** The migration's
`REVOKE ALL ON FUNCTION` and `GRANT EXECUTE ON FUNCTION` must name the
**identical** argument list used at creation, and the §6.3 catalog assertions
must resolve the routine **from the catalog by name** rather than hardcoding a
literal argument list.

**Binding non-negotiables, not Builder choices**, carried from §9 above and C-2
§16.3 and §16.5: exactly one function exists at `public.command_journal_append`;
it is `SECURITY DEFINER`; it is **owned by `command_journal_writer` and not by
the table owner**; it pins `SET search_path = pg_catalog, pg_temp` with `public`
**absent**; it uses the builtin `pg_catalog.sha256()` only, with no user-defined
hash helper and **no pgcrypto `digest()` substitution**; it contains no dynamic
SQL; every non-builtin reference is fully qualified.

**The resolved signature and return type are recorded verbatim in the executor's
return** (§16 item 7). **FD-B5 is not an additional Founder issuance

**The D-1 reconciliation for this clause — RULED 2026-09-14 (§0.6).** The
delegation above **stands for every tranche except this one**. Ruling sentence 3,
quoted verbatim:

> 3. For this D-1 scope amendment only, r6's specified append and
>    pure-encoder signatures and return forms supersede FD-B5's otherwise
>    delegated signature/return choice; creation, revocation, grants, and
>    catalog tests must bind those exact signatures.

**For D-1 only**, r6's specified **append and pure-encoder signatures and return
forms** therefore **supersede** the choice this clause otherwise delegates, and
creation, revocation, grants, and the catalog tests **bind those exact signatures**.
FD-B5's delegate-and-record mechanism is unchanged for every other purpose, and
**§16 item 7 still requires the executor to record the resolved signatures** — they
are now r6's, not the executor's. FD-B5 remains **not** an additional Founder
issuance prerequisite. The row binding those signatures to their tests is **B-R16**
(§6.3), which is why F2's renumber and this clause are one instruction, not two.
prerequisite.**

---

## 10. Recovery and verification scope

**In scope for Tranche B**: the `verify()` recomputation *grant* and the
read path it requires, proven by **B-P2** (`br_app_runtime` `SELECT` on both
tables succeeds), mapped to **PC-17** at C-3 §14.1, basis C-1 §4.1 and C-2 §3.3.
The commissioning prompt's reference to "B-P2 / PC-17" is **verified correct**
against C-3 §5.2 and §14.1.

**Out of scope.** The runtime verify and rebuild consumer is **not** in the
Tranche-B file map at C-3 §4.2. No path in §6 implements one.

```
RUNTIME VERIFY CONSUMER — DEFERRED / SEPARATE AUTHORITY REQUIRED
```

No recovery service is invented. The file map is not expanded to accommodate
one. The safe reversal posture after first write is `REVOKE EXECUTE` on the
append routine, never a drop (C-2 §13, journal-history rollback boundary), and
that act is not authorized here.

---

## 11. Test-first discipline and evidence

**The plan's RED-before-implementation rule is carried at full strength and is
not softened to "tests-first where practical."** C-3 §5's global RED discipline
is binding:

> "A test is admitted as RED only when it has been *observed failing* with the
> recorded message before implementation. A test that passes before
> implementation is proving nothing and must be rewritten."

Required sequence:

1. **Baseline at the bound starting base**, before any edit: full suite and
   storage suite counts, recorded.
2. **Meaningful RED for each applicable acceptance criterion**, with the literal
   failure message recorded per criterion.
3. **Minimal implementation.**
4. **GREEN**, with counts.
5. **Regression verification** against the baseline.
6. Any plan-mandated mutation or repetition evidence. **Mutation is evidence
   only after it makes the test FAIL.**

**If a criterion cannot produce meaningful RED**, the executor identifies the
criterion, states the reason, and proposes an alternative **before**
implementing it. A compilation error or a fixture setup failure is **not** a
behavioral negative control and may not be silently substituted for one.

**Evidence separation, recorded distinctly:**

| Layer | What it proves |
|---|---|
| Source inspection | what the code says |
| Local disposable-Postgres execution | behavior on the executor's machine |
| CI execution | behavior in `storage-integration`, including the double run |
| Independent review | a second party's verdict |

Record actual **Node and PostgreSQL versions**, execution targets, every skip
with its gating condition, every failure, and teardown results. **A skipped test
is not a pass.** The repository pins Node `^22.13.0` with `.nvmrc` at 22 and CI
on Node 22; the executor records the version actually used, not the host default.

**Test integrity.** C-3 §15 item 12 is binding: a test may not be modified to
make a failing assertion pass. Tests are not implementation.

---

## 12. Final verification

Commands are the repository's actual ones, read from `package.json` and
`scripts/` at the reference main. **No optional gate is invented, and no
required gate is waived.**

| # | Command | Requirement |
|---|---|---|
| 1 | `npm run build` | exit 0 |
| 2 | `npm run typecheck` | exit 0 |
| 3 | Focused Tranche-B unit tests (`test/migrate-cli.test.ts`) | green, counts recorded |
| 4 | Focused Tranche-B storage tests (`test/journal-authority.storage.test.ts`, `test/journal-append-atomicity.storage.test.ts`) | green, counts recorded |
| 5 | `npm test` (full suite) | exit 0; counts vs. baseline; every `# SKIP` enumerated with its gate |
| 6 | `npm run test:storage` (storage suite, disposable Postgres) | exit 0; **run twice consecutively**, matching CI's re-runnability proof; teardown assertion green on both |
| 7 | `npm run gate:path-audit` | PASS |
| 8 | `npm run gate:secret-scan` | PASS |
| 9 | `npm run gate:attribution-selftest` | exit 0 |
| 10 | `bash scripts/attribution-shape-check.sh pr <base> <head> <branch>` | PASS, pre-validated locally before push |
| 11 | `npm run gate:verify-check` | exit 0 (unverified checks count as failing) |
| 12 | `git diff --check` | clean |
| 13 | `npm run lint` | **advisory by repository design; not a required check.** Report findings in changed paths and confirm the unchanged-path finding set matches the base tree |
| 14 | `npm run gate:integrity <contract-path>` | Per `ci.yml` lines 61 to 65 this gate is deliberately **not** a CI step and runs pre-PR, with its result and the artifact's SHA-256 recorded in the PR body |

All of `scripts/path-audit.sh`, `secret-scan.sh`, `attribution-shape-check.sh`,
`verify-check.sh`, and `contract-integrity-scan.sh` were confirmed present at
`origin/main`.

**No gate is waived by "skip with cause"** unless the controlling authority
expressly permits that disposition for that gate. The executor does not create
the exception.

---

## 13. Branch, worktree, and PR boundary

| Field | Value |
|---|---|
| Proposed branch | **`builder/pr2b-tranche-b-journal-authority`** |
| Availability | **VERIFIED FREE** — absent from local refs and from `git ls-remote --heads origin` at drafting time. Re-verify immediately before creation. |
| Worktree | A **new, dedicated** worktree created from the bound starting main |
| Reuse prohibition | **Do not reuse PR #27's branch (`builder/pr2b-tranche-a-schema-preflight-r5`, tip `8f991604…60be`) or its worktree** (`/Users/michaeldaley/MADVenturesOPs/founder-os-build-room-pr2b-tranche-a-r5`). Do not reuse the primary checkout, which holds another writer's line (§3). |
| PR state | **DRAFT ONLY** |
| Ready transition | **NOT AUTHORIZED** |
| Merge | **NOT AUTHORIZED** |

### 13.1 Exact GitHub writes allowed

1. `git push` of the new branch to `origin`.
2. Creating **one draft PR** against `main` with its body.
3. Editing that PR's own body and title.
4. Posting the execution-handoff comment on that PR.

**Nothing else.** Specifically **not** authorized: ready transition, merge,
review submission or dismissal, label, milestone, assignee, or project changes,
branch deletion, releases, repository settings, rulesets, required checks,
environments, secrets, variables, Actions administration, workflow dispatch, or
**any GitHub administrative-plane authority**.

Per **DEC-20260721-01**, file writes land through local git (edit, commit, push).
GitHub API file-write tools (`create_or_update_file`, `push_files`) are **not**
used to land content.

Per **DEC-20260718-04**, the executor **must never** post, back-fill, or simulate
a Founder-voice merge authorization comment.

### 13.2 Attribution

Commits carry the `DEC-20260718-05` trailers: `Role-Id`, `Actor-Id`,
`Execution-Surface`. `founder` is **not** a valid `Role-Id`. Agent-authored work
is **never** attributed to the Founder.

### 13.3 Drafting surface, delivery, and landing — separated by this amendment

**Drafting surface (F10, Founder-accepted 2026-09-15).** Every repository fact in
this act was read from committed truth via `git show origin/main:<path>`, **never
from the working tree** — R3's own method statement already binds this (committed
line 138). The constraint is concrete, not stylistic: the ordinary checkout for
this seat is on `builder/prereq-c-c2-broker-ledger-worker` at
`75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`, which is **not** a descendant of
`origin/main` and does **not** contain `docs/planning/command-journal/` at all.
Reading the working tree would have produced absent files and spurious diff mass.

**Delivery.** The R4 artifact is delivered as a custody copy to the transport
surface for reading, following the standing gate-3 copy convention. **This act
performs no landing.** It creates no commit, ref, branch, or PR in any governed
repository.

**Landing is a separate act (F10).** Landing this artifact — as a further
docs-only PR following the PR #43 and PR #44 precedent — is **NOT AUTHORIZED by
this act and is not performed by it**. Note the distinction from the D-1 ruling,
which **has** landed (PR #44, merge `baee3fb2…`, §0.6): the ruling's landing was a
Founder act, and this act neither performed nor asserts one of its own. §13.1's
GitHub-write list governs the *executor's* tranche work; it does not license a
docs landing by this seat.

---

## 14. Executor and reviewer identity

### 14.1 Executing profile

**`br-builder`.**

### 14.2 MISSING IDENTITY RETURN

```
EXECUTOR SESSION IDENTITY — NOT OBTAINABLE AT DRAFTING TIME
```

The commission requires the intended executor's **actual live session identity**
before the final issuance fields are prepared. **That session does not exist
yet.** It is the session that will receive this authorization, and it cannot be
known by the drafting session.

**I did not choose a session from an unclosed-session list, and I did not reuse a
prior session ID by assumption.** In particular, Tranche A's recorded sessions
(`20260911_140844_626a3c`, `20260911_143714_32e966`, and the PR #27 correction
sessions) are **spent** and must not be carried forward into a Tranche-B
issuance field.

**Resolution path, one of:**

- **(a)** The Founder starts the intended `br-builder` session, that session
  reports its own live identity, and the identity is written into the issuance
  before signature; or
- **(b)** The issuance leaves the executor-identity fields **blank and
  mandatory**, and the **receiving session records its own live identity as its
  first recorded act**, before any repository read, and returns it in item 1 of
  §16.

**(b) is recommended**, because it is the only form that cannot be satisfied by a
stale or assumed identity.

### 14.3 Provider and model evidence

The executor records, **distinguishing runtime evidence from configuration
defaults**:

- Provider and exact model **actually used**, as reported at runtime.
- Whether that value is runtime-observed or a configuration default, stated
  explicitly. A configured default is **not** evidence of what ran.
- **Any activated fallback model**, with the point at which it activated.
- The execution surface.

Honest-claim discipline is binding: no fabricated SHAs, paths, sessions, models,
or identities. Founder and ratified text is quoted verbatim or the gap is
flagged; it is never paraphrased.

### 14.4 Independent review

- **Fresh independent review of the exact final candidate head is required.**
  A review of an earlier head does not carry.
- Independence is assessed against the **actual authoring sessions and model
  families**, per the controlling independence requirements, following the
  pattern already applied in this line (Tranche A recorded author and reviewer
  session IDs and distinct model families).
- **The implementing session must not issue its own independent verdict.**
- `daley40-lab` is a **Founder-controlled identity**, never "an independent
  reviewer" (C-3 §16, binding vocabulary).

---

## 15. Prohibited implementation surfaces

### 15.1 Paths that must not be changed

- `packages/control-plane/src/main.ts`
- `railway.toml`
- Gateway code (`packages/gateway-*`, `packages/gateway-daemon/**`)
- Provider integration
- Background-Agent A2 surfaces
- Anything belonging to Tranches **C, D, E, or F**, including
  `.github/workflows/db-admin-migration.yml`
- Activation surfaces
- Any path not in §6

### 15.2 Acts that must not be performed

- SQL against **Neon** or any production or shared database
- GitHub **environment** or **secret** creation, modification, or deletion
- Production credential provisioning
- Gateway startup
- External provider invocation
- Deployed-service changes
- Production privilege cutover
- Production writer activation
- Deployment or spend
- Merging, deploying, provisioning, minting, confirming, denying, or revoking
  anything live (Founder acts)
- Creating or modifying governance doctrine from this repository

### 15.3 Database test boundary

Database tests operate **only** within a disposable instance whose exclusive,
run-specific provisioning is externally verified per §7.3.1, and **only** with
the fixture permissions enumerated at §7.3.

### 15.4 Stop conditions

The executor returns `FOUNDER_DECISION_REQUIRED` and halts when required
authorization, base SHA, or scope is missing or contradictory; when a governing
document conflicts with this authorization; or when the work would need
additional credentials, spend, or scope. C-3 §15's twelve plan-drift stops and
C-2 §17's S1 to S15 remain live in full.

**Two stop conditions are modified by the §0 rulings, and only these two.**

- **r1 §15 stop condition 1 (starting base)** is lifted **for Tranche B only**
  by FD-B3, subject to §4.3 in full. FD-B3: *"Other stop conditions remain
  applicable."* It is lifted for no other tranche.
- **The protected-plane execution stop** is clarified, not lifted. FD-B3: *"The
  protected-plane execution stop concerns governed execution and does not
  prohibit the expressly authorized disposable migration and runner tests."*
  Governed, shared, staging, production, and Neon execution remain barred under
  FD-B1.

**Additional stops introduced by the rulings.**

- **Exclusive disposable ownership not externally verifiable**, or unexpected
  pre-existing fixture roles, objects, or dependencies: `SCOPE DECISION REQUIRED`
  (§7.3.1). Do not pre-drop unidentified state and do not use `DROP OWNED BY`.
- **Any FD-B2(a) control that cannot execute within its limits**:
  `SCOPE DECISION REQUIRED` (§6.3.1). Do not weaken the test and do not grant
  memberships to `br_app_runtime`.
- **Migrator transaction boundary not provable** for C-3 §6.2 steps 4 to 13:
  `SCOPE DECISION REQUIRED` (§7.2.1).
- **Material drift at the starting base**: the verbatim
  `REVIEW TARGET DRIFT — FOUNDER DECISION REQUIRED` return (§4.4).

---

## 16. Required implementation return

The executor returns all nineteen items. An item that cannot be produced is
reported as missing, never approximated.

1. Session, role, provider, exact model, and execution surface, with runtime
   evidence distinguished from configuration defaults, and any activated
   fallback.
2. Bound base SHA and tree, plus the complete §4.3 intervening-main assessment.
3. Branch name and worktree path.
4. Final candidate SHA and tree.
5. Exact changed paths with per-file SHA-256.
6. Migration `0006` summary: id, object set, ordered steps, transaction
   boundaries.
7. Append primitive authority and ownership summary, including the **resolved
   signature** (FD-B5) and the exact `REVOKE`/`GRANT` targets.
8. `migrate-cli` behavior summary: selector, one-tranche enforcement, fail-closed
   paths, evidence shape, proof of no runtime activation.
9. **PO-1 disposition**, with the observed `session_user` of the matrix
   connection.
10. **B-M3 disposition** (`NOT NEEDED`, or the concrete compiler need).
11. **Recovery and verify-path disposition**, carrying the §10 deferral verbatim.
12. Baseline, and RED then GREEN evidence per criterion with literal messages.
13. Complete verification results per §12, plus teardown evidence and the
    `pg_roles` absence assertion **for every fixture role and the FD-B2(a)
    probe role**.
14. **Exclusive disposable ownership evidence** (§7.3.1): the external,
    run-specific provisioning identity and lifecycle relied on, and the proof
    that it is not merely a `TEST_DATABASE_URL` value, a familiar role name, or
    an in-database sentinel.
15. **B-R8 control evidence** (§6.3.1): for each of the four membership variants,
    the stored `inherit_option` and `set_option` values actually observed, the
    detection result from the identical parameterized recursive query, and the
    post-revoke absence verification; plus the no-membership control's zero-finding
    result; plus the separate real-runtime `br_app_runtime` assertion.
16. **Migrator transaction-boundary proof** for C-3 §6.2 steps 4 to 13 (§7.2.1),
    stated as observed behavior rather than as an assumption.
17. Draft PR number and its exact head SHA.
18. Findings and **explicit evidence limitations**, including anything
    environment-gated or skipped.
19. `FRESH EXACT-HEAD INDEPENDENT REVIEW REQUIRED`.

**Implementation stops after the authorized draft-PR publication and handoff.**
The executor does not self-authorize readiness, merge, or another tranche.

---

## 17. Founder decisions — dispositions

**FD-B1 through FD-B7 are ruled or delegated as recorded at §0.** No decision was
manufactured, and none was resolved by inference. **None required repository
work, re-review, re-merge, or repetition of any completed test, and none
reopened a settled retention decision.**

### 17.1 Scope and preconditions — RULED

| Id | Disposition | Substance |
|---|---|---|
| **FD-B1** | **RULED** | Gate IV completion gates **governed execution** of `0006`, not the authorization, independent review, or separate merge authorization of Tranche-B code and tests. The future Gate III implementation act may authorize `0006` source, the admin runner and `migrate:admin`, the authorized tests and bounded CI changes, and migration and runner execution **inside verified disposable acceptance fixtures**. It may **not** authorize governed, shared, staging, production, or Neon execution, production administrative credentials, runtime cutover, rotation, or protected-plane execution. No Railway pre-deploy substitute. Gate III implementation ends at the draft PR and execution handoff. See §2.6, §5.1, §15.4. |
| **FD-B2** | **RULED** | The §7.3 disposable-fixture authority is granted **as bounded by the ruling**: exclusive disposable ownership externally verified (§7.3.1), enumerated cleanup with `DROP OWNED BY` **not authorized** (§7.3.2), process-memory credential handling (§7.3.3), no membership to `br_app_runtime` in any form, and no inferred unrestricted `ALTER ROLE`. Two predecessor provisions are expressly overridden: item 15's `DROP OWNED BY` teardown and the "safe drop before create" idempotency rationale. This grant is **new and separate**; it does not amend, widen, or reinterpret the Tranche-A exception (§7.4). |
| **FD-B2(a)** | **RULED** | One uniquely named ephemeral **`NOLOGIN`** probe role, no password, no administrative attributes, targeting a fixture-created `br_journal_owner` or `command_journal_writer`. Four sequential membership controls (plain, `INHERIT FALSE`, `SET FALSE`, both false) plus a no-membership control expecting zero findings. Same-run removal with `pg_roles` absence asserted. **Permission is not proof**; B-R8 passes only after successful execution and review of the evidence. See §6.3.1. |
| **FD-B3** | **RULED** | A starting `origin/main` newer than the issuance reference main is permitted **for Tranche B only**, subject to §4.3 in full. Ancestry and zero path overlap alone are insufficient. Material drift returns the verbatim `REVIEW TARGET DRIFT — FOUNDER DECISION REQUIRED`. The bound base is preserved: no silent rebase, merge, or cherry-pick. See §4.2, §4.3, §15.4. |
| **FD-B4** | **RULED** | `0006` implements C-3 §6.1 **steps 1 to 13**, with steps 4 to 13 atomic per C-3 §6.2 and the migrator's transaction boundary **verified, not assumed**. Step 15 moves to **B-R11**, step 16 to **B-R8**, both at full acceptance strength and with no SQL in `0006`. Step 14 defers to **Tranche D**; **PO-3 and its downstream verification requirement are preserved and remain open**. In Tranche B `br_app_runtime` receives only the append-routine `EXECUTE` and journal-table `SELECT`. No blanket `ALL`, guessed, or stub grant. See §7.2.1. |
| **FD-B5** | **DELEGATED** | Append signature and return type are the Builder's choice under PO-6, subject to the contract and independent review, with creation, grants, revocations, and catalog assertions identifying the same exact function, and the final signature and return type recorded. **Not an additional issuance prerequisite.** See §9.1. |
| **FD-B6** | **DELEGATED** | B-T1, `test/journal-authority.storage.test.ts`, carries its assigned denial, positive-path, and hash-binding assertions **within the existing file map**. No new path. **Not an additional issuance prerequisite.** See §6.3. |
| **FD-B7** | **NON-BLOCKING** | Unchanged. §2.5 resolves the substantive question; the optional Gate-II formal-closure record act remains available to the Founder under the narrow prospective, explicitly non-retroactive wording supplied verbatim at §2.5.4. **No retroactive authorization is granted or implied by any ruling.** |

### 17.1.1 Preserved history and the A2 boundary

Quoted from the ruling:

> "Preserve all historical execution-authority findings, the successor-session
> 9319f3 gap, the placeholder-receipt findings, and prospective retention
> disposition:
> 2aab0196a1d2841ba76443d90fb5214790e72205347453a013a4c7907c1666a2
>
> Nothing here retroactively authorizes prior execution.
>
> FD-B7 remains non-blocking. A2 remains unauthorized. Tranche B does not
> inherit authority to implement an out-of-scope recovery consumer or
> production dispatch."

**All are preserved unchanged**: the `AUTHORITY NOT LOCATED` determination for
the original Gate-II execution authority (§4.7); the successor-session
`20260912_000443_9319f3` gap (§2.8); the E-5 placeholder finding (§1.4); the
retention disposition
`FOUNDER-DISPOSITION-pr27-candidate-retention-EFFECTIVE-20260913.md`
SHA-256 `2aab0196a1d2841ba76443d90fb5214790e72205347453a013a4c7907c1666a2`; and
the merge act's statement that it does not retroactively authorize earlier
execution. **A2 remains unauthorized** (§2.7, §5.3), and the runtime verify and
rebuild consumer remains deferred (§10).

**Carried forward, not blocking Gate III code:** **FD-2** (recording the new
administrative custody domain) remains **OPEN** and is required **before Gate
IV**. **PO-2** (whether Neon permits the required ownership operations and the
§6.2 transaction shape) remains **OPEN** and is untouched by this tranche, since
no SQL runs against Neon here; it is settled at Tranche-B *execution*, under
Gate IV's plane, and if prohibited it is **S3**: return
`FOUNDER_DECISION_REQUIRED` and do not redesign around it. **PO-3** and **PO-7**
remain open. **PO-4** is **CLOSED** (C-4 §4.3, re-verified at §4.6). **PO-5** is
resolved in the negative by Tranche A's merged shape (no script added).

**S9 and S10 — entry state, stated precisely.** r1 §15 records both as
**CURRENTLY TRIGGERED**, and r1 §15.1 adds: *"Two stop conditions are triggered
right now (S9, S10). That is the expected entry state."* They are therefore the
**expected** entry state for Tranche B, not a defect in this draft.

- **S10** clears at r1 §15's own stated points: **Tranche A (step 7)** for the
  boot-DDL half, and **PC-20/PC-21** for the owner-authority half. The boot-DDL
  half is now dischargeable because Tranche A merged; the owner-authority half
  remains **Tranche-D work**. **This draft does not claim S10 is cleared** —
  r1 §15 permits the boot-DDL half to be *recorded* cleared only after required
  Tranche-A evidence passes, and that recording is not made here.
- **S9** clears at **PC-0–PC-4 post-cutover (Tranche D)**. Untouched by this
  tranche.

Neither S9 nor S10 is asserted cleared by this authorization.

### 17.2 Decisions carried forward, not listed as Gate-III blockers

**No optional gate is created here, and none is waived.** The items above are
the plan's own, carried at their own strength.

---

## 18. Founder issuance block

**DELIBERATELY UNFILLED. This draft is NOT EFFECTIVE.**

**The §0 plan rulings do not fill this block.** They are prospective plan
rulings, effective on posting, that authorize preparation and independent
document review only. The signature fields below are filled by a **separate
Gate III implementation issuance**, after the independent document review, and
not before.

```
Founder:                        [UNFILLED]
Preflight verified at (UTC):    [UNFILLED]
Issued at (UTC):                [UNFILLED]

Authorized draft:               [this artifact]
SHA-256:                        [UNFILLED — MUST be this file's §19 value,
                                not the qualification receipt's
                                60d57270… value; see §2.8]

Independent review:             [UNFILLED]
SHA-256:                        [UNFILLED]

Signature-time repository binding:
  Repository:                   MADVenturesLLC/founder-os-build-room
  origin/main SHA:              [UNFILLED — verify live at signature]
  Tree SHA:                     [UNFILLED — verify live at signature]

Starting base:
  Reference main (this draft):  f21693e0c9c5d063b8cd150346477d0e49dc183e
  Reference tree:               9ca61132b14de175685fee9dee4fae579380eef9
  Actual starting base:         [BOUND BY EXECUTOR per §4.3, before any edit]

FD-B1 disposition:              RULED 2026-09-13T21:11:18.319Z (msg
                                ff56f500-d562-4a73-835f-5c6bf4144ae1); see §0, §2.6
FD-B2 disposition:              RULED, as bounded; see §0, §7.3
FD-B2(a) disposition:           RULED; see §0, §6.3.1
FD-B3 disposition:              RULED, Tranche B only; see §0, §4.2
FD-B4 disposition:              RULED, steps 1-13; see §0, §7.2.1
FD-B5 disposition:              DELEGATED (PO-6); not an issuance prerequisite
FD-B6 disposition:              DELEGATED; not an issuance prerequisite
FD-B7 disposition:              NON-BLOCKING — see §2.5.4 for prospective wording

Executor session identity:      [UNFILLED — see §14.2]

Status:                         [UNFILLED]
Signed:                         [UNFILLED]
```

**Signature-time drift rule.** If `origin/main` differs from
`f21693e0c9c5d063b8cd150346477d0e49dc183e` at signature time, that is not itself
a bar to signing, because §4 exists precisely to govern a newer base. It **must**
be recorded in the block above as the issuance reference main, and §4.3's steps
run against it.

**R4's reference-main restatement reaches this block (F8, Founder-accepted).**
§4.6.1 states this act's own reference main (`baee3fb2…` / tree `cd3463b5…`), the
`origin/main` produced by the D-1 landing (PR #44), rather than R3's, under FD-B3's
bounded newer-main allowance; §4.6 and the header row R3 set are **retained, not
replaced**. The row this block must carry when the Founder signs is the **issuance
reference main at signature time**, per the rule above, against which §4.3's steps
run. Signature fields remain **DELIBERATELY UNFILLED**: the D-1 ruling is
scope-only (§2.3) and this amendment signs nothing and opens no gate.

---

## 19. Attribution and provenance

Drafted by the `br-architect` seat. **No commit was produced by this act, so no
attribution trailer is attached.** If this file is later committed, the
committing act carries its own trailers per `DEC-20260718-05` and its own
authorization.

**Nothing was created or modified in the production of the R1 artifact.** No code,
test, PostgreSQL role, credential, GitHub environment, GitHub secret, Railway
configuration, Neon object, migration, branch, commit, PR, fixture SQL, or
deployment. No SQL was executed against any database. **No GitHub mutation was
performed** — every `gh` call was a GET or a view. `git fetch`/`ls-remote`
(ref-only) and read-only `gh` reads were the sole network operations. No
repository file was created or modified, and the ordinary checkout was **not
moved**: it remains at `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242` on
`builder/prereq-c-c2-broker-ledger-worker`.

**Prior artifacts were preserved.** No existing file in `hermes-profile-suite/`
or in the repository was modified, moved, renamed, or deleted. **No prior
evidence file was edited** — the stale completion map was reconciled by
**superseding observation only** (§4.7), not by rewriting it.

**Revision history of this draft.** R1 was drafted. Revision round 1 added
§1.4 (narrow Gate-I supplement check), §4.7 (preserved historical defects and
the retention disposition), §5.1 (Gate III code/test authority versus Gate IV
protected execution), and §17.1/§17.2. **Revision round 2 (the R1 finalization
pass)** replaced §2.5 with the full B6 base-binding trace and the narrow
prospective wording, and added §5.2 (B5: A2's prerequisite versus full PR 2b
qualification), §5.3 (A2 recovery behavior mapped to Tranche-B scope, with
everything out of scope named and not added), §2.8 (the qualification input,
with its hash-chain discontinuity disclosed), and the E-3/E-8/E-7 binding rows.

**Revision round 3 — this R2 successor.** The Founder plan rulings FD-B1 to
FD-B7 were incorporated **once**, from the message preserved at §0.1. Sections
changed: **§0 added** (ruling custody, superseded-reference disclosure, effect
boundary, disposition map); **§2.6** FD-B1 resolved with the execution boundary
quoted; **§4.2** the starting-base allowance changed from proposed to ruled, and
**§4.3** gained the FD-B3 binding note; **§6.3** gained the FD-B6 disposition and
**§6.3.1** the FD-B2(a) positive detection controls; **§7.2.1 added** (FD-B4
migration placement); **§7.3 rewritten** under FD-B2 with **§7.3.1** exclusive
disposable ownership, **§7.3.2** enumerated cleanup, **§7.3.3** credential
handling, **§7.3.4** bounding conditions; **§7.5** scoped to prospective grants;
**§9.1 added** (FD-B5 delegation with binding non-negotiables); **§15.3/§15.4**
updated for the modified and added stops; **§16** expanded from sixteen to
nineteen return items; **§17** restated as dispositions with **§17.1.1**
preserved history and the A2 boundary; **§18** annotated to state that plan
rulings do not fill the issuance block.

**Revision round 4 — this R3 repair.** Produced in response to the independent
document review of R2 (`2a7b188b…c9b032`), which returned `REQUEST CHANGES` /
`DOCUMENT REVIEW FAILED` on two issuance blockers. **This round incorporates no
new ruling and reopens no settled matter**; it is drafting under the existing
Founder ruling.

Sections changed, and only these: the header **Authorizes** row and the
**Work ID** and **Predecessor** rows; **§0.5 added** (repair scope and blocker
map); **§5.1** prohibition paragraph qualified and a new express
fixture-authorization paragraph added; **§5.1** r6 §11.2 execution-route
paragraph qualified to governed databases; **§8.4** retargeted to the R2 item
numbering and split into permitted operations versus mandatory verification
obligations; **§19** revision history.

**Full-document scan for repetitions of both defect classes.** Both classes were
swept across the whole artifact, not only at the two cited locations.

- **Class A, absolute execution prohibitions.** Four occurrences found, all
  repaired: the header Authorizes row, and three passages inside §5.1. Other
  matches were checked and are correct as written: §6.3.1 and §7.5 state that
  *this drafting act* confers no execution, which remains true; §7.2.1's "no SQL
  in `0006`" concerns migration content, not fixture execution; §15.4's stops and
  §19's provenance statements describe the drafting act.
- **Class B, stale item ranges.** One stale occurrence found and repaired
  (§8.4). Four other item-number references were examined and **deliberately
  left unchanged** because each names the **predecessor's** numbering and is
  labelled as such: §7.3's quotation of FD-B2's "items 1–17", §7.3's and
  §7.3.2's "the predecessor's item 15", §17.1's override record, and §19's
  override record. Renumbering those would falsify quotations of the ruling and
  of the predecessor.

**All four non-blocking review findings were deliberately not actioned in this
round**, and remain open. The repair authorization was scoped to the two
issuance blockers and to repetitions of those two defect classes; actioning
non-blocking findings would enlarge the diff the focused recheck must examine.
Each is named in the recheck handoff and carries its original review identity:

- **Finding A** — §17.1.1 cites the successor-session `20260912_000443_9319f3`
  gap as "§2.8". It is at **§4.7 H-2**; §2.8 is the qualification-receipt
  hash-chain discontinuity. **Pointer error only; the history content is
  preserved and unweakened.** One-line repair, available on request.
- **Finding B** — §2.8 and §18 say "this file's §19 value" while §19 carries no
  self-referential hash by convention. Wording residue; issuance can still bind
  the on-disk SHA-256.
- **Finding C** — several ruling sentences are restated rather than quoted.
  Substance held in each cited instance.
- **Finding D** — §5.1 still describes the local fixture as "reached via
  `TEST_DATABASE_URL`". Leftover addressing language; §7.3.1 is the operative
  disposability proof and supersedes it, and §15.3 points at §7.3.1.

**Two predecessor provisions were expressly overridden, and are recorded as
overrides rather than silently dropped**: the predecessor §7.3 item 15
`DROP OWNED BY` teardown, and the predecessor §7.3 "safe drop before create"
idempotency rationale for the twice-run CI case. Both are superseded by FD-B2.

**Provenance of the R2 act.** This successor was produced by the `br-architect`
seat. **No code, test, PostgreSQL role, credential, GitHub environment, GitHub
secret, Railway configuration, Neon object, migration, branch, commit, PR,
fixture SQL, or deployment was created or modified.** No SQL was executed against
any database and no database connection was opened. **No GitHub operation of any
kind was performed, and no `git` command was run.** The only writes were
off-repository files in `hermes-profile-suite/`, expressly authorized by the
Founder for this custody task, with no commit or push required or authorized.
The predecessor draft, the earlier brief, the qualification receipt, and the
earlier Founder messages were **preserved byte-unchanged**, verified by SHA-256
before and after.

**No completed Tranche-A work is re-requested, no test is repeated, no A2 work is
scoped, and no settled retention decision is reopened.**

**Operative identity of this artifact.** Following the established convention
for this line (`OUTPUT_SHA256: recorded in the reviewer reply after on-disk
shasum, not written into this file`), this file carries **no self-referential
hash** — writing a SHA-256 into the artifact would change it. The value is
computed on disk after the final write and reported in the drafting seat's reply.

**Any issuance must name that on-disk value — not the qualification receipt's
`60d57270…` value, which describes the pre-finalization bytes (§2.8).** The
Founder recomputes the hash at signature time and binds it in §18, whose
`Authorized draft` field says so expressly.

**Companion artifact (this revision round):**
`REMAINING-WORK-MAP-pr2b-corrected-20260913.md` in the same directory, SHA-256
recorded on disk rather than asserted here.

**Observation timestamps used in this artifact** are the live clock values
recorded at read time (2026-09-13T18:47:34Z through 18:54:17Z), not
reconstructions. Where a prior artifact's own timestamp is cited (the superseded
map's `12:37:02Z`; the merge act's `16:27:18Z` and `16:36:56Z`), it is quoted
from that artifact or from the live GitHub record, and labelled as such.

**Attribution.** Drafted by the `br-architect` seat. No commit was produced by
this act, so no attribution trailer is attached. Founder and ratified text is
quoted verbatim or the gap is flagged; it is never paraphrased.
