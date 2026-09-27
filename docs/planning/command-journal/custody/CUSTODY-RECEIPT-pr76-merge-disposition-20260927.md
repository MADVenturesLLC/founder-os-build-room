# CUSTODY RECEIPT — Founder PR #76 merge disposition (2026-09-27)

**This receipt records the landing of a Founder-signed disposition and of
the review text it pins. The disposition records a noncompliant merge and
authorizes nothing: no migration, no Gate IV act, no dispatch of the
workflow, no deployment, and no merge.** The disposition's own text says
so and governs.

## The instrument

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-pr76-merge-disposition-20260927.txt` |
| Git blob id | `7504cfd9e41e6583437c583a4c2ec9f3a00d8bac` |
| SHA-256 | `12f18cdb10c1c428cac2032048242c9cf9ad9595db7551bcf5510133db013747` |
| Bytes | 5410 |
| Lines | 100 (`wc -l`) |
| Trailing newline | present (single LF) |
| Signed | "Michael Daley", dated 2026-09-27, in the disposition's closing lines; its opening line names "Michael Alberto Daley" |
| What it rules | `NONCOMPLIANT_MERGE_RECORDED` for the merge of PR #76 at `9c7e0447848b8435a98a97aa18f4c0188e46f577`: merged with no Tier-2 review before it, no SHA-named authorization, and a merge commit without attribution trailers; no revert; `main` not rewritten; no Gate IV act before the disposition lands on `main`; names its own custody path |

## The review text

The disposition pins the post-merge Tier-2 review by path and SHA-256.
`gate:custody-pin-check` verifies that pin against the file landed in the
same commit as this receipt, and verifies it again here:

  docs/planning/command-journal/custody/TIER2-REVIEW-pr76-post-merge-gemini-20260927.txt
  sha256 d4ba2de082017daa6b3d24b464b00c03c6801c5a48ddba38a3621e91f32c5431

- Git blob id `79d6bef487f4aa7e2b7b3c52a4810ce92b2103e5`; 4882 bytes; 66
  lines (`wc -l`); single trailing LF.
- Reviewer: attestation id `gemini-3.1-pro`, on the reviewer's own
  statement of its model ("Gemini 3.1 Pro (High)"). It is not the author
  of PR #76 and not this session.
- Reviewed: merge commit `9c7e0447848b8435a98a97aa18f4c0188e46f577`, after
  the merge. Verdict `PASS-WITH-ADVISORIES`, four advisory findings, none
  blocking Gate IV.
- Prompt: drafted by this session. Output: pasted into this session by the
  Founder on 2026-09-27.
- Changes from the pasted output, formatting only: the terminal's
  two-space indentation and trailing space padding were removed. Words,
  punctuation and line breaks are as pasted, including the `***` that
  follows the verdict on the last line.

## A known imprecision in the signed text

FINDING 3 says the merge commit's message "is the PR title alone". The
message is the PR title with ` (#76)` appended, on one line with no body:
`ci(db-admin-migration): add the administrative migration workflow and its
shape test (Tranche C) (#76)`. The finding's conclusion holds: the message
carries no attribution trailers, and Attribution Shape Check run
`36331083888` concluded failure on it. The error was in the builder's
draft; Copilot review `5331377483` found it (comment `4116298221`). The
signed text lands unaltered, as its CUSTODY section requires; this receipt
records the correction.

## Provenance and transport

| Step | Identity |
|---|---|
| Disposition chosen | proposed by the `builder` seat in session after PR #76 merged, on the form of the PR #75 disposition; requested by the Founder ("provide me the disposition please") and adopted by the Founder's signature, 2026-09-27 |
| Drafted for signature | by the `builder` seat in session, 2026-09-27, at Founder direction. Shown twice; the second showing refreshed the Remediation 1 dispatch-check time from 16:15:34Z to 16:45:49Z after a fresh read. Only the second was signed |
| Founder signature | the Founder filled the `Signed:` and `Date:` lines and sent the signed text into the session on 2026-09-27 |
| Transport | pasted into the session; the builder wrote the received text character for character, ending with a single LF |
| Difference from the signed-for draft | the filled `Signed:` and `Date:` lines only, verified with `diff`; no other line differs |
| Founder-side hash | none supplied; the values above are computed by the builder over the landed files |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/br-pr76-disposition-custody`, Execution-Surface
`claude-code`, at Founder direction of 2026-09-27 (the disposition's
CUSTODY section). Merge is a separate exact-SHA Founder act under
DEC-20260718-04; this receipt asserts none.
