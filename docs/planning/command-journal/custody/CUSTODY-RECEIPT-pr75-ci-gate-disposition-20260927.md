# CUSTODY RECEIPT — Founder PR #75 CI gate disposition (2026-09-27)

**This receipt records the landing of a Founder-signed disposition. The
disposition records a breach of the CI gate and authorizes nothing: no
migration, no redaction work, no deployment, and no merge.** The
disposition's own text says so and governs.

## The instrument

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-pr75-ci-gate-disposition-20260927.txt` |
| Git blob id | `89825c72bf484c375abcbdc8ae8d46d29a5b0f63` |
| SHA-256 | `5a3cb9d151a9e5df7b551744ba7f66993df12b521eb27b1b7554b904df0c134c` |
| Bytes | 4654 |
| Lines | 84 (`wc -l`) |
| Trailing newline | present (single LF) |
| Signed | "Michael Daley", dated 2026-09-27, in the disposition's closing lines; its opening line names "Michael Alberto Daley" |
| What it rules | `NONCOMPLIANT_MERGE_RECORDED` for the merge of PR #75 at `41de91d9a61b6c4453570370adff60dc005be32c`; no revert; the first hosted runs on a `main` commit containing `41de91d` (on `9fda98771a3016f96e45b707e1228483c885e1d8`) recorded as verification, not cure; names its own custody path |

The disposition pins the correction note it relies on by path, blob id and
SHA-256. That pin is verified by `gate:custody-pin-check` against the note
as it stands on `main`.

## Provenance and transport

| Step | Identity |
|---|---|
| Disposition chosen | by the Founder in session, 2026-09-27: "NONCOMPLIANT_MERGE_RECORDED; draft it at" this path |
| Drafted for signature | by the `builder` seat in session, 2026-09-27, at Founder direction; two drafts. r1 was written while PR #77 was open. r2 updated it after PR #77 merged: the merge commit recorded, remediation item 2 filled with the four run ids, and two sentences that assumed PR #77 was still open removed. Only r2 was signed |
| Founder signature | the Founder filled the `Signed:` and `Date:` lines and sent the signed text into the session on 2026-09-27 |
| Transport | pasted into the session; the builder wrote the received text character for character, ending with a single LF |
| Difference from the r2 draft | two kinds, verified with `diff`: the filled `Signed:` and `Date:` lines, and the absence of the draft's blank lines between sections, which the received text does not carry. No word differs. Landed as received, under the disposition's own "Do not alter the text" |
| Founder-side hash | none supplied; the values in the table above are computed by the builder over the landed file |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/br-pr75-disposition-custody`, Execution-Surface
`claude-code`, at Founder direction of 2026-09-27 (the disposition's
CUSTODY section, and "draft it at" this path in session). Merge is a
separate exact-SHA Founder act under DEC-20260718-04; this receipt asserts
none.
