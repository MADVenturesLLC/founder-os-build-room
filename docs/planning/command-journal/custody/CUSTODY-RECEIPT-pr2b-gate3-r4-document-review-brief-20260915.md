# CUSTODY RECEIPT — independent document review brief, R4 (2026-09-15)

**This receipt records a builder-authored dispatch brief. The brief is an
input to a review, not a review, not a ruling, and not Gate III
issuance.** It confers no authority, states no verdict, and does not
satisfy the independent document review it asks for. Gate III remains
PROPOSED and unsigned on `main`.

## The brief

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/BRIEF-independent-document-review-pr2b-gate3-r4-20260915.txt` |
| Git blob id (as landed) | `f85b715a5ad98bdd467a388b0fc263a763c1006a` |
| SHA-256 (as landed) | `debfc65d00b34f4edeb047bc58ab1a8e495ba7f67a565aaed9d5d77ec0730654` |
| Bytes / lines (as landed) | 7744 bytes, 137 lines |
| SHA-256 (dispatched text) | `3aac089e2e5cf5d68d8c56d96ec05768719f74a4beb216ce2cbe52a7ac3eca9f`, 6142 bytes, 110 lines |
| Trailing newline | present (single LF) |
| Authored by | the `builder` seat in session, 2026-09-15, at Founder direction ("write the document review brief") |
| Dispatched | the Founder reports sending this text to the operator before it was landed |

The landed file is the dispatched text preceded by a supersession
banner added at landing, so a reader opening it alone is not misled by
defects the addendum corrects. The banner is marked as not part of the
dispatched text, and the dispatched bytes remain recoverable and
checkable:

```
REF=origin/main
P=docs/planning/command-journal/custody/BRIEF-independent-document-review-pr2b-gate3-r4-20260915.txt
git show "$REF:$P" \
  | sed -n '/^INDEPENDENT DOCUMENT REVIEW BRIEF$/,$p' \
  | shasum -a 256
# 3aac089e2e5cf5d68d8c56d96ec05768719f74a4beb216ce2cbe52a7ac3eca9f
```

Use `sha256sum` in place of `shasum -a 256` on Linux. The ref and path
are shell variables, not `<...>` placeholders, because `<` and `>` are
redirection operators: an earlier revision of this recipe wrote
`git show <ref>:<path>` and failed to parse when run, which is the
defect this paragraph previously claimed the recipe avoided. Reading
through `git show` rather than a working-tree file keeps the check on
committed truth.

The `sed` anchor matches exactly one line in the brief; the banner's own
mention of that heading carries quotes and trailing text, so the range
starts at the section header. Any future edit that adds a second exact
match above the rule breaks recovery silently — a different hash, not an
error.

The Founder reports that those bytes are the dispatched text verbatim;
that identity rests on the same report and is not verifiable from the
repository, since dispatch preceded landing. On that basis the brief the
reviewer worked from is citable by hash rather than by recollection.

## Brief addendum 1, correcting the brief

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/ADDENDUM-independent-document-review-pr2b-gate3-r4-20260915.txt` |
| Git blob id | `ea921078ef06817ba005ce79d7ed4246558f740e` |
| SHA-256 | `a2ace9031aae010ab3b96e09ff3ac88a9b8d87c3ab3df544001b2301d4514a7e` |
| Bytes | 7547 |
| Lines | 155 (`wc -l`) |
| Trailing newline | present (single LF) |
| Dispatched | **never — overtaken, see below** |

**Overtaken: the review completed without it.** The brief reached the
operator before these defects were found, and the addendum was never
dispatched. On 2026-09-15 the operator returned `PASS` on the R4 act,
produced from the brief alone. The addendum is therefore kept as a
record of defects found in the brief, not as an instruction to a
reviewer, and the review's standing is qualified accordingly:

- Q6 was answered against the brief's wrong premise, which attributed
  the `B-R14` to `B-R16` renumbering to the act. The reviewer
  nonetheless recorded it correctly as D-1's act, so correction 3
  changed nothing about the answer.
- Q6 was answered without the plan identity correction 2 supplies. The
  reviewer located plan r1 independently and cited section 5.2 lines 455
  and 456, which is the location correction 2 names. Q7 never needed the
  plan; the brief implied it did.
- The brief's ambiguous hunk figure went unremarked. The reviewer
  reported the live count of 14 at default context where the brief said
  18 and did not flag the difference. Correction 1 explains it.
- Q8 was answered under the unnarrowed constraint that correction 4
  scopes. The brief both asked for a judgment on drafted text and
  barred resolving an ambiguity by choosing an answer. The reviewer
  answered "pass as drafted" and gave reasons, treating it as a
  judgment rather than refusing it, which is the reading correction 4
  makes explicit. Of the five, this is the one whose absence could most
  plausibly have changed what the reviewer did.
- `CANNOT COMPLETE — BRIEF DEFECT`, added by correction 5, did not
  exist when the review ran. The reviewer was not blocked, so the gap
  did not bite.

These are observations about what the reviewer wrote, not claims about
what a corrected brief would have produced. That counterfactual is not
this seat's to assert: the same seat landed the artifact under review,
wrote the brief, and wrote this receipt. The record keeps both the brief
as dispatched and the defects found in it so a later reader can judge
for themselves.

The addendum carries five corrections, three of which change what the
brief asks, and says so in its own header rather than claiming to change
nothing:

1. The R3-to-R4 delta was stated in an ambiguous unit: "17 insertions"
   is a hunk count that reads as a line count and cannot be reconciled
   with the sizes the brief itself gives. Measured from committed truth:
   335 lines added, 1 removed, net +334, reconciling R3's 2285 lines
   with R4's 2619. Hunk counts are rendering-dependent (18 at
   `--unified=0`, 14 at the default) and `--numstat` reports none, so
   the addendum tells the reviewer to cite lines, not hunks.
2. Question 6 requires reading the implementation plan, which the brief
   never identified while demanding committed-truth reading everywhere
   else. Path, blob, SHA-256 and size are supplied for plan r1 and plan
   addendum 02 revision r6, with the section and line locations Q6
   depends on. Q7 is framed against the act's own sections, so it does
   not depend on the plan; the brief implied otherwise.
3. **Changes Q6.** The brief attributed the B-R14 to B-R16 renumbering
   to the authorization act; it is the D-1 ruling's act, which R4
   carries into its matrix. Q6 is restated accordingly.
4. **Narrows a constraint.** The bar on resolving an ambiguity by
   choosing an answer is scoped to gaps and contradictions in the act,
   not to Q8, which asks for a judgment deliberately.
5. **Adds a verdict.** The brief offered only `PASS` and
   `REQUEST CHANGES / DOCUMENT REVIEW FAILED`, both verdicts on the act.
   A reviewer blocked by a defect in the brief had no way to say so and
   would have had to fail the act for the builder's fault. A third
   first-line verdict, `CANNOT COMPLETE — BRIEF DEFECT`, is now
   available and is explicitly not a verdict on the act.

The addendum also records that two things the brief cites cannot be
given repository identity: act revisions R1 and R2 are not in this
repository (only R3 and R4 are on `main`), and the R2 document review
output is not either. No question depends on them.

## What it asks for

The independent document review that FD-B1 through FD-B7 require before a
Gate III implementation issuance. It names the artifact under review as
landed on `main` — the R4 draft act, blob
`e34aa28d0679b7bc06544cea6e9ec0082911077d`, SHA-256
`466469cc3f015f6dc8b3b9713e8d771f0b3cbf9461f78ddea7270427ee013dae` — puts
eight questions, fixes the output format and verdict vocabulary, and bars
the reviewer from editing, committing, signing, or resolving an ambiguity
by choosing an answer.

Revision R2 went through the same review and returned
`REQUEST CHANGES` / `DOCUMENT REVIEW FAILED` on two issuance blockers,
which R3 repaired. Question 1 targets that same defect class
deliberately.

## The review, and what is not held here

The review completed on 2026-09-15 and returned `PASS`, reviewer
`br-operator` session `20260914_234018_5b1c61`, `actor_id`
`UNAVAILABLE`, against artifact SHA-256 `466469cc…13dae`.

**The one enforceable independence check is unverifiable.** The brief's
independence rule is written against an Actor-Id, and the reviewer's is
reported `UNAVAILABLE`. Independence therefore rests on the seat name
`br-operator` alone. That name is neither of the two barred identities,
but a seat name is not the field the rule names, so the one enforceable
check cannot be made.

**That output is not in this repository.** The operator reports it at
`hermes-profile-suite/HANDOFF-operator-to-founder-pr2b-gate3-trancheB-r4-document-review-20260915.md`,
SHA-256 `a5ba787f736eca8675c53f219f772a614009c08e22ca610e317cb127d51fc21b`,
11251 bytes, 91 lines. Those figures are the operator's report and are
not verified from this surface. This is the same gap the addendum charges
against the brief's handling of the R2 review output, named here rather
than left implicit: the verdict a Gate III issuance would rest on has no
repository identity. The directory holding it is the subject of FounderOS
`DEC-20260914-01`.

The verdict's citations were spot-checked against committed truth rather
than accepted. **Every line number below names its file**, because an
earlier revision of this receipt attributed act line numbers to plan r1,
which is 974 lines and cannot contain them:

| Claim | File | Lines |
|---|---|---|
| Section 18 is `DELIBERATELY UNFILLED` | R4 act | 2414 |
| `B-R16` added to the section 6.3 matrix | R4 act | 1333 |
| `B-R14` and `B-R15` restated, unchanged | R4 act | 1325, 1326 |
| `B-R14` and `B-R15` as plan r1 assigns them | plan r1 | 455, 456 |
| Their control mappings PC-5 and PC-8 | plan r1 | 827, 830 |

The live R3-to-R4 diff is 14 hunks at default context, as reported.
`B-R16` appears nowhere in plan r1, so the plan-wide half of Q6 holds;
the reviewer asserted it and it is confirmed here.

Open findings the reviewer marked non-blocking: the FD-B5 row at act
section 17.1 against the D-1 supersession at act section 9.1; act
section 12 item 4 omitting B-T4; and R3 findings A, B, C and D. That is
six findings in three items, not three.

## What this commit does not do

It performs no review and records no verdict of its own: the `PASS`
above is the operator's, reported here. It names no CI bootstrap or
identity mechanism, fills no signature or executor identity field, and
does not satisfy D-1's condition. Those remain Founder acts.

## Independence, and its limit

The brief bars two identities from performing the review: the drafting
seat `br-architect`, and the builder session that landed the artifact
(`session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`), which is the
session that also authored the brief, this addendum and this receipt.

Authoring the questions is not performing the review, so the stated rule
holds. It is recorded here that the rule nonetheless leaves the party
whose landing is under review setting the questions the reviewer
answers. Whether the independence rule should also cover brief
authorship is the Founder's to decide; it is not decided here.

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`, Execution-Surface
`claude-code`, at Founder direction of 2026-09-15. Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
