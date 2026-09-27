# CUSTODY RECEIPT — Founder ruling on the journal HTTP write path: D-1 and C3 (2026-09-27)

**This receipt records the landing of a Founder-signed ruling. The ruling
withdraws D-1 for the journal HTTP write path and accepts PR #78's
pre-write guard, conditioning any Tranche D cutover on the C3
reconciliation and FD-3. It authorizes no merge, migration, Gate IV act,
dispatch, deployment, Tranche D cutover, key provisioning, or redaction
work.** The ruling's own text says so and governs.

## The instrument

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-journal-http-D1-C3-20260927.txt` |
| Git blob id | `9305820f8abca53b065907344f6da032b6788a11` |
| SHA-256 | `ec2730bce600c0881b0ccd479c1c11e2784815f9ac443fb64afd1a39090cde2e` |
| Bytes | 3519 |
| Lines | 62 (`wc -l`) |
| Trailing newline | present (single LF) |
| Signed | "Michael Daley", dated 2026-09-27, in the ruling's closing lines; its opening line names "Michael Alberto Daley" |
| What it rules | D-1 withdrawn and superseded by Option B for the journal HTTP write path; D-1's RECONCILIATION sentences lapse with it; the pre-write guard accepted for PR #78; no Tranche D cutover until the `JournalAppendSink` reconciliation is ruled and FD-3 key custody is resolved; names its own custody path |

The ruling pins the D-1 scope ruling and the journal HTTP plan r1
correction note by path, blob id and SHA-256. `gate:custody-pin-check`
verifies both pins against those files as they stand on `main`.

## Provenance and transport

| Step | Identity |
|---|---|
| Questions posed | the correction note's C1 (D-1) and C3 (redaction boundary), explained to the Founder in session on 2026-09-27 with a proposed one-line ruling for each |
| Rulings given | by the Founder in session, 2026-09-27: "D-1 withdrawn, C3 accepted as written, draft the ruling" |
| Drafted for signature | by the `builder` seat in session, 2026-09-27. Three sentences beyond the Founder's words were flagged for him to keep or strike before signing: that Option B supersedes D-1, that D-1's RECONCILIATION sentences lapse with it, and that the withdrawal does not depend on the msg 9052 disposition. All three were kept |
| Founder signature | the Founder filled the `Signed:` and `Date:` lines and sent the signed text into the session on 2026-09-27 |
| Transport | pasted into the session; the builder wrote the received text character for character, ending with a single LF |
| Difference from the draft | the filled `Signed:` and `Date:` lines only, verified with `diff`; no other line differs |
| Founder-side hash | none supplied; the values above are computed by the builder over the landed file |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/br-journal-d1-c3-custody`, Execution-Surface
`claude-code`, at Founder direction of 2026-09-27 (the ruling's CUSTODY
section). Merge is a separate exact-SHA Founder act under DEC-20260718-04;
this receipt asserts none.
