# CUSTODY RECEIPT — Founder PR #83 merge disposition (2026-09-28)

**This receipt records the landing of a Founder disposition. The
disposition records a noncompliant merge and authorizes nothing: no
merge, no dispatch, no deployment, and no change to repository
settings.** The disposition's own text says so and governs.

## The instrument

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-pr83-merge-disposition-20260928.txt` |
| Git blob id | `01ffdbd2af4c2ce751f83fedd7512ed78910847e` |
| SHA-256 | `6dfa0fcad9db85aefc42c32d304463b5c288744bfdca868bc2fab3a1a25540ce` |
| Bytes | 5155 |
| Lines | 97 (`wc -l`) |
| Trailing newline | present (single LF) |
| Signed | "Michael Daley", dated 2026-09-28, in the disposition's closing lines; its opening line names "Michael Alberto Daley". See "How it was signed" below |
| What it rules | `NONCOMPLIANT_MERGE_RECORDED` for the merge of PR #83 at `69ca61bb0fa516a0e3a4920294bf28fccf35d783`: merged at the head its Tier-2 review failed, with no SHA-named authorization, and with a merge commit whose attribution lines git cannot parse; no revert; `main` not rewritten; records PR #84 as the remediation; names its own custody path |

The disposition pins the three files PR #83 added by blob and SHA-256.
None of them is under `docs/planning/command-journal/`, so
`gate:custody-pin-check` does not verify those pins. The builder
verified each against the merge commit `69ca61b` before drafting.

## How it was signed

- The builder showed the draft with empty `Signed:` and `Date:` lines on
  2026-09-28. The draft flagged three points for the Founder to keep or
  strike: REMEDIATION 3 and 4 record the Founder's own acts on his word,
  and REMEDIATION 5 is a new direction.
- The Founder replied, verbatim: "keep all, signed and dated, land it".
  On that instruction, the builder filled the two lines as the Founder
  signed the earlier instruments (`Signed: Michael Daley`,
  `Date: 2026-09-28`) and landed the file in `24ff3dc`. No other line
  differs from the draft shown, verified with `diff`.
- The Founder then posted the full signed text on this pull request as
  comment 5868025725, created 2026-09-28T10:21:22Z and edited once at
  10:21:44Z. The builder compared it line by line with the landed file,
  as the GitHub API returned the comment after that edit: identical,
  apart from the comment's CRLF line endings and its missing final
  newline. The comment's content before the 10:21:44Z edit was not seen
  by the builder.
- This differs from the PR #76 and D-1/C3 instruments, whose signed text
  the Founder pasted into the session. Here the signed text is on the
  pull request itself.

## What the builder verified and what it did not

- Verified against the repository: the merge commit, its parents and
  tree, the three blobs and SHA-256 values, the `---` line at line 55 of
  the merge message, zero trailers from `git interpret-trailers --parse`,
  the check run ids on `60a024c`, PR #83's comments, and PR #84's merge
  commit and time.
- Recorded on the Founder's word, not observed by the builder:
  REMEDIATION 3 (`founder-authorization` required on `main`, no bypass)
  and REMEDIATION 4 (Cursor Bugbot set to post its summary as a
  comment). For REMEDIATION 3, PR #82 reading `blocked` with only
  `founder-authorization` failing is consistent with it. For
  REMEDIATION 4, Bugbot had not run since the change when this landed.
- The Tier-2 review of `60a024c` is cited by its attestation lines only.
  The copy pasted into the session begins at its findings, so it is not
  landed here.

## Provenance and transport

| Step | Identity |
|---|---|
| Disposition chosen | proposed by the `builder` seat after PR #84 merged, on the form of the PR #76 disposition; requested by the Founder ("draft the #83 disposition") |
| Drafted for signature | by the `builder` seat in session, 2026-09-28 |
| Founder adoption | "keep all, signed and dated, land it", 2026-09-28; then the signed text posted by the Founder on this pull request, comment 5868025725 |
| Transport | written by the builder from the draft shown, with the two signature lines filled, ending with a single LF; matches the Founder's posted comment line for line |
| Founder-side hash | none supplied; the values above are computed by the builder over the landed file |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/br-pr83-disposition-custody`, Execution-Surface
`claude-code`, at Founder direction of 2026-09-28 (the disposition's
CUSTODY section). Merge is a separate exact-SHA Founder act under
DEC-20260718-04; this receipt asserts none.
