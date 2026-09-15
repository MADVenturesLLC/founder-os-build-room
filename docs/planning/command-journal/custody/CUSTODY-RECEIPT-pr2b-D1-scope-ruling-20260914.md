# CUSTODY RECEIPT — Founder D-1 scope ruling (2026-09-14)

**This receipt records the landing of a Founder-signed scope ruling. The
ruling is scope-only; it is not Gate III implementation issuance and
confers no implementation, execution, merge, or issuance authority.**
The ruling's own text says so and governs.

## The instrument

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-pr2b-D1-scope-amendment-20260914.txt` |
| Git blob id | `6be4e0576533a5a459a19e7338f245d1fa0634b0` |
| SHA-256 | `da1b3b5f7814f6cdfb623945028d12484e379f94997c768f42edb9885dff3e33` |
| Bytes | 3912 |
| Lines | 82 (`wc -l`) |
| Trailing newline | present (single LF) |
| Signed | Michael Alberto Daley, dated 2026-09-14, in the ruling's own closing lines |
| What it rules | Conditional acceptance of Addendum 02 r6 as a proposed Tranche B scope amendment (D-1); renumbers r6's proposed denial row from "B-R14" to B-R16 because plan r1 §5.2 already assigns B-R14; binds three reconciliation sentences on the successor Gate III draft; names its own custody path |

The successor Gate III draft is directed by the ruling to cite it by this
exact path, blob id, and SHA-256 as landed on `main`. The blob id and
SHA-256 above are content-addressed and are unchanged by the merge; the
merge commit that lands them is recorded in the PR body.

## Provenance and transport

| Step | Identity |
|---|---|
| Ruling drafted for signature | by the `builder` seat in session, 2026-09-14, at Founder direction; three drafts (r1 custody-receipt path reference; r2 B-R14→B-R16; r3 self-named path). Only r3 was signed |
| Founder signature and recording | recorded by the Founder's custody-recording seat into `build-room/founder-acts/2026-09-14-founder-ruling-pr2b-D1-scope-amendment-ISSUED.md` (off-repository; reported SHA-256 `ae1c453e159568979998bf6c9985e32fb9f394019a8ae5463c11c61ad5ae9fbf`, 6002 bytes, 139 lines); that receipt is not copied here and is not verified from this surface |
| Founder-side hash of the ruling file | `da1b3b5f7814f6cdfb623945028d12484e379f94997c768f42edb9885dff3e33` (`shasum -a 256`, 2026-09-14), identical to the SHA-256 above |
| Transport | Founder copied the file unchanged into `transport/pr2b-gate3-copies-20260914` at commit `016198349341313654a5c2d274d949689d4dc0e2` (transport only, never merged); builder took the bytes from that commit via `git show` |

## Boundary event, recorded as reported

The custody-recording seat reported, verbatim in substance, that it had
written the ruling file directly into the Founder's working checkout of
`founder-os-build-room` at the ruling's named path, that this was
outside its lane ("You hold custody on disk. You do not write into a
governed repository"), and that no commit, PR, or merge was made. It
returned `FOUNDER_DECISION_REQUIRED` with three options. The Founder
resolved it by moving the bytes through the transport branch, which is
the option the builder recommended: the seat's uncommitted write is left
untracked in the Founder's checkout (`?? docs/planning/command-journal/custody/`
at the time of transport) for the Founder to clear, and this commit
carries the actual actor. The seat's refusal-and-report behaviour is the
lane working correctly and is recorded here so it is not erased.

## Not included

The two `br-architect` blocker artifacts transported at the same commit
(`BLOCKER-…-controlling-input-absent-20260914.md`, SHA-256
`a253f1aa11c82fb6e72fcfd1aa693c38bc5e93cb7785888de65c16d40e9ff54d`;
`ADDENDUM-BLOCKER-…-reverification-20260914.md`, SHA-256
`9de918674d53241a9be3c8e7b1da4397f84f90fbd21663ac75eaf3b4517447d9`)
are review artifacts, not instruments. They stay on the transport branch
and are not committed here unless the Founder directs.

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`, Execution-Surface
`claude-code`, at Founder direction of 2026-09-14 ("Record D-1 in one
Founder-signed Gate III custody ruling … Use a new custody file under
docs/planning/command-journal/custody/"). Merge is a separate exact-SHA
Founder act under DEC-20260718-04; this receipt asserts none.
