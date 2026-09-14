# CUSTODY RECEIPT — PR 2b Gate III instruments, hash-verified copies (2026-09-14)

**These are hash-verified custody copies. They are not effective Gate III
issuance.** Nothing in this directory confers, implies, or simulates
implementation, execution, merge, or issuance authority. The copies exist so
that the Gate III instruments the Addendum 02 review chain cites can be read
and reconciled from a repository, instead of only from one un-versioned
directory on one workstation.

## Founder act

Issued in session on 2026-09-14 by the Founder, as the fallback to the stated
preference for a private custody repository:

> If Build Room must hold them, use a separate docs-only PR plus a receipt
> stating the copies are hash-verified custody records, not effective Gate III
> issuance.

The preference could not be met. The custody directory
`/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/` was checked on the
Founder's host on 2026-09-14 and is **not a git repository**
(`git rev-parse --show-toplevel` → `NOT-A-GIT-REPO`). No remote exists. That
finding is recorded here and is not resolved by this receipt.

**Override disclosed.** The controlling ruling copied below states, for the
2026-09-13 drafting task: *"Off-repository custody writes are expressly
authorized for this task. No git commit or push is required or authorized for
those files."* That clause governed that task. The 2026-09-14 Founder act above
is the later, explicit authority for these repository copies. The ruling's
text is unchanged; only its custody location is duplicated.

## Transport

The Founder copied the files unchanged from the custody directory into a
transport branch and pushed it; the builder took the bytes from that branch,
never from a paste:

| Step | Identity |
|---|---|
| Transport branch | `transport/pr2b-gate3-copies-20260914` (never merged; transport only) |
| First push (two reviewer-cited files) | `b1070876e6615ad65d95b7444f4dad1dddf45fa6`, parent `dace9af9` (`origin/main`) |
| Second push (four further files) | `4c74bc17b0c83c7c699f35d61f365ac51850755e` |
| Founder-side hashes | printed by `shasum -a 256` in the custody directory and again in the transport worktree; identical to the committed bytes |
| Builder-side verification | `sha256sum` over `git show <transport>:transport/<file>` for each file, then over the copies in this directory |

## Files and verification

| File | Bytes | Lines | Trailing newline | SHA-256 | Prior hash to verify against |
|---|---|---|---|---|---|
| `DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-r3-20260913.md` | 137939 | 2285 | yes | `d024e508d77169c5d85d323fb28f32c6ea5c2b709d2e12cc3470f0bde37f5945` | **matches** the reviewer citation relayed in the Addendum 02 r3 review, and the Gate III proposed receipt §1 |
| `FOUNDER-RULING-pr2b-gate3-trancheB-complete-replacement-source-20260913.txt` | 11194 | 256 newlines, 257 text lines | no | `2431c6338d45d2eea074d2fe0ac797f70f0a555e78d80b005a2ee2924a9dcd6d` | **matches** the reviewer citation, the draft act §0.1 custody record (bytes, newlines, trailing-newline status all match), and the proposed receipt §2 |
| `FOUNDER-AUTHORIZATION-pr2b-gate1-ISSUANCE-RECEIPT-20260910.md` | 1138 | 22 | yes | `277f85e3f98acbe91d84cb82a174a64c096997edab4828a806fb2225239883d1` | **matches** draft act §1.2 row E-1 and the test-role amendment's active-plan-stack list |
| `AMENDMENT-pr2b-test-role-fixture-r2-20260910.md` | 3775 | 46 | yes | `c7098b3f45cd755b7360b4cc339c41bd39117c1970da38301b0d8a4d33f363ff` | **matches** draft act §1.2 row E-4 |
| `FOUNDER-AUTHORIZATION-pr2b-gate3-PROPOSED-ISSUANCE-RECEIPT-20260913.md` | 15424 | 295 | yes | `0ebcb485fae7b4f856549b6b788d55a1e8abdc4a095765ff99966c6869fb02bc` | **none found** in any instrument readable here; hashed at transport time only |
| `BRIEF-founder-decisions-pr2b-gate3-FD-B1-B6-20260913.md` | 38511 | 385 | yes | `0afa653f42278fa4287bc91e6aaa1cea822b435f5645818dc945d09be8faafe8` | **none found**; hashed at transport time only |

Founder-side and builder-side hashes agree on all six. Four of six are bound
to a prior citation; two are bound only to this transport and carry no earlier
identity.

## What each file is, and its status as it states it

| File | What it is | Status, as the file itself states |
|---|---|---|
| Draft act r3 | Gate III Tranche B authorization draft, `br-architect` seat, finalized 2026-09-13 | **DRAFT — NOT EFFECTIVE**; signature fields deliberately unfilled |
| Founder ruling | Complete replacement source for plan rulings FD-B1 through FD-B7 and the drafting authorization, signed Michael Alberto Daley | Plan rulings effective on posting; per draft act §0.1 the session-store posting timestamp is 2026-09-13T21:11:18.319Z, message `ff56f500-d562-4a73-835f-5c6bf4144ae1`. Confers no implementation authority |
| Gate I issuance receipt | Founder issuance of Gate I plan approval, signature-time base `ef7a4792…` / tree `31b132de…` | **EFFECTIVE** 2026-09-11T10:32:00Z; grants no implementation authority |
| Test-role fixture amendment r2 | Proposed amendment to plan r1 §4.1's Tranche A exception | Per draft act §1.2 row E-4, ratified by the Gate I supplement (E-5); Tranche A scoped |
| Gate III proposed issuance receipt | Posting block prepared for the Founder | **UNSIGNED. NOT EFFECTIVE.** No agent may sign it |
| FD-B1–B6 decision brief | Advisory brief on six Founder decisions against the frozen r1 draft (`4fee6482…`) | Advisory; creates no authority |

**Not copied**, and therefore still unreadable from any repository: the r3
focused-recheck handoff the proposed receipt binds (`d95aef52…`), the Gate I
authorized draft (`fd44b947…`), the Gate I supplement (`362c7b47…`), the
custody record of the superseded Founder messages, and every other file in
the custody directory. Nothing about them is inferred here.

## Relationship to the Addendum 02 record (PR #41, merge `dace9af9`)

Addendum 02 r6 §0 and §1 recorded these instruments as "unreadable from this
surface" and left Gate I "not determined" and Gate III issuance "not located;
not inferred". With these copies readable: Gate I is closed by an effective
receipt; Gate III has a proposed, unsigned receipt and no effective one. The
Addendum 02 files are not modified by this PR; any reconciliation is a
separate advisory act.

## Attribution

Copies transported by the Founder (`Actor-Id: founder` for the transport
commits, which are never merged). This directory and receipt committed by the
`builder` seat, Actor-Id `session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`,
Execution-Surface `claude-code`. Merge is a separate exact-SHA Founder act
under DEC-20260718-04; this receipt asserts none.
