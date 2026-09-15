# CUSTODY RECEIPT — PR 2b Gate III Tranche B draft act, R4 (2026-09-14)

**This receipt records a hash-verified custody copy of a DRAFT act. The
act is not effective Gate III issuance, carries no signature (its
signature fields are deliberately unfilled), and confers no
implementation, execution, merge, deployment, or issuance authority.**
The act's own status line says so and governs. Gate III remains
PROPOSED and unsigned on `main`.

## The instrument

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-r4-20260914.md` |
| Git blob id | `e34aa28d0679b7bc06544cea6e9ec0082911077d` |
| SHA-256 | `466469cc3f015f6dc8b3b9713e8d771f0b3cbf9461f78ddea7270427ee013dae` |
| Bytes | 161862 |
| Lines | 2619 (`wc -l`) |
| Trailing newline | present (single LF) |
| Work ID | `BR-PR2B-GATE3-TRANCHE-B-DRAFT-R4` |
| Drafting seat | `br-architect` (Plan Authority; no approval, build, operate, merge, release, or risk-acceptance authority) |
| Predecessor | R3, `DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-r3-20260913.md`, blob `78ef441422714044663bf2c2cd34d493fdf00e00`, SHA-256 `d024e508d77169c5d85d323fb28f32c6ea5c2b709d2e12cc3470f0bde37f5945`, already on `main` and byte-unchanged by this commit |
| What it amends | Incorporates the Founder D-1 scope ruling of 2026-09-14 (§0.6), citing it by exact path, blob `6be4e0576533a5a459a19e7338f245d1fa0634b0`, and SHA-256 `da1b3b5f7814f6cdfb623945028d12484e379f94997c768f42edb9885dff3e33` as landed on `main` by merge `baee3fb2910348c8d256ea6d0ad3c49f5beafcb2` (PR #44); adds B-R16 to the §6.3 matrix; rules B-M4 / S4 by the §8 mechanism at §8.8; restates its reference `main` at §4.6.1; separates drafting, delivery, and landing at §13.3 |

The act's citation of the ruling was checked from this surface against
`origin/main` at `baee3fb2…`: path present, blob id and SHA-256 identical
to the values cited at the act's §0.6.

## Provenance and transport

| Step | Identity |
|---|---|
| Drafted | by `br-architect` at the Founder's direction, 2026-09-14/15 (UTC), from committed truth via `git show origin/main:<path>` per the act's §13.3 |
| Supersession, disclosed by the drafting seat | an earlier R4 (reported SHA-256 `5b80b57d73f749d373d484ea773ad3ced0c1b0cc385a7219fabbfc9bc5aa74ef`, 159756 bytes) stated at its §0.6 that the ruling was not yet landed; PR #44's merge falsified that claim before delivery, so the seat regenerated §0.6 and §4.6.1 against the landed state and archived the earlier bytes off-repository as `SUPERSEDED-DRAFT-r4-20260914-pre-D1-landing-claim.md`. The seat reports the amendment content (five amendments, eleven instructions) identical between the two. The earlier version was never landed anywhere. It is not copied here and is not verified from this surface |
| Founder-side hash | `466469cc3f015f6dc8b3b9713e8d771f0b3cbf9461f78ddea7270427ee013dae` (`shasum -a 256`, 2026-09-15), identical to the SHA-256 above |
| Transport | Founder committed the file unchanged into `transport/pr2b-gate3-copies-20260914` at commit `00e809a` (transport only, never merged); builder took the bytes from that commit via `git show`, re-hashed them, and placed them at the path above |
| Delivery receipt | `br-architect` reports a delivery receipt (revision 2, SHA-256 `f33716e8eafa378f065b56d86dd9ea20d17b5b14884630fb26203167416a3750`) held off-repository. Not copied here and not verified from this surface |

## Boundary note, recorded as reported

The drafting seat reports it also wrote the act directly into the
Founder's working checkout of `founder-os-build-room` at the act's named
path, with no commit, branch, PR, or merge. That copy is untracked in the
Founder's checkout and is not the source of this commit; the transport
branch is. Recorded so the write is not erased.

## What this commit does not do

It places no signature, issues no Gate III receipt, names no CI
bootstrap or identity mechanism, and does not satisfy the D-1
acceptance condition. Those are Founder acts. Landing a draft into
custody is a custody act only, following the PR #43 and PR #44
precedent, and the act's §13.3 states that it neither performs nor
authorizes its own landing.

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`, Execution-Surface
`claude-code`, from Founder transport of 2026-09-15. Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
