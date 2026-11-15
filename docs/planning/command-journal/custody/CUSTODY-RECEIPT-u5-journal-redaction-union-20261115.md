# CUSTODY RECEIPT — U5, the journal redaction union: the act, its amendments, its review, merge, deployment and benchmark table

**This receipt records the landing of
`FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION`, its three amendments
and the records E2 of that act names, and authorizes nothing.**

E2 of the act reads: "This act, its review, the merge and deploy
verification and the benchmark table are filed with the next custody
filing under C1 of FOUNDER-RULING-20261015-BUILD-ROOM-TO-DONE, which
needs my separate authorization." C1 of that ruling
(`FOUNDER-RULING-build-room-to-done-20261015.txt`) files, once per act
and after the act completes, "the act verbatim, any rulings on it, the
outputs, the merge verification, and the /health polls, with one
receipt, in one pull request". B6 of `FOUNDER-ACT-20261028-VELOCITY`
files an act verbatim with the next custody filing, not in a pull
request of its own. The act completed when pull request 157 merged as
`f3e884b` and its deployment was verified on 2026-11-14. The Founder
authorized this filing in the builder's session at
2026-11-15T17:18:53.516Z: "E2 go ahead".

With this receipt, 13 files land here: the act and its Amendments 1 to 3
as signed, the three Tier-2 reviews as the Founder pasted them, the
three briefs the reviewers read, the deployment poll log, the
benchmark table, and the builder's audit record for the act. The merge
verification and the deployment reading are entries of that audit
record; the table below names each one.

## How each file was checked

- Each act file is the signed copy whose SHA-256 the builder recorded
  when the Founder signed it, byte for byte. The audit record gives each
  signature line verbatim, the SHA-256 of the draft as delivered, and
  what changed between draft and signed copy.
- Each review is the Founder's message as the session received it, with
  one final newline. None needed masking. The third is byte-identical to
  the copy the builder saved when it arrived.
- Each brief's SHA-256 is the one the builder recorded when it sent it,
  and the one the Founder's MacBook printed before the review ran
  (audit entries 2026-11-13T22:35:23Z, 2026-11-14T01:51:09Z and
  2026-11-14T03:45:38Z).
- The poll log names the merge commit the deployment served.
- The audit record is lines verbatim from the builder's record, with one
  header line and one blank line added above them. Nothing in it needed
  masking.
- At 2026-11-15T17:23Z the builder read the merge commit again from git:
  its parents are `4ebea4c` and `1f4c00c`, its tree
  `b2cff21123adccce4600eb8494422043a45f99e5` equals the tree of
  `1f4c00c`, the head the Founder authorized, and
  `scripts/attribution-shape-check.sh main f3e884bb76af208ab1bc5d93e0da1c441ef12041`
  passes.

## The pull request

| Pull request | Act | Clause | Authorized head | Authorization comment | Merge commit | Merged by | Deployment | Its check | Audit entries |
|---|---|---|---|---|---|---|---|---|---|
| 157 | `FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION`, as amended by Amendments 1 to 3 | C2; filed under E2 | `1f4c00c` | 6871555031, 2026-11-14T04:16:15Z | `f3e884b` | the Founder (finding 5) | `b9b3aff4` | SUCCESS 04:20:00.627Z; boot.start 04:19:57.372Z names f3e884b | 2026-11-14T04:18:42Z, 2026-11-14T04:20:43Z |

## The reviews

Each row's verdict is the review's own words. Times are when the
session received the Founder's paste. Each was run by Codex on the
Founder's MacBook, with the model the operator read from Codex CLI
`/status`.

| Review | Head | Received | What | Model | Verdict | Brief |
|---|---|---|---|---|---|---|
| PR 157, 2026-11-13T22:49:58Z | `37fdf8f` | 2026-11-13T22:49:58.794Z | first review | GPT-6.1-Sol xhigh Fast | REQUEST-CHANGES | `ACTS-BRIEF-PR157-37fdf8f.txt` |
| PR 157, 2026-11-14T03:09:50Z | `7e8c9cf` | 2026-11-14T03:09:50.971Z | confirmation run | GPT-6.1-Sol xhigh Fast | REQUEST-CHANGES | `ACTS-BRIEF-PR157-7e8c9cf.txt` |
| PR 157, 2026-11-14T04:01:11Z | `1f4c00c` | 2026-11-14T04:01:11.807Z | third review | GPT-6.1-Sol | PASS-WITH-ADVISORIES | `ACTS-BRIEF-PR157-1f4c00c.txt` |

## The Founder's lines on this act

Verbatim as the builder's audit record holds them.

| Received | Line | On |
|---|---|---|
| 2026-11-13T19:40:42.404Z | "1a, 4a, accept 2 3 5, scope b; draft U5" | his choices on the draft Part G ruling, and the request for this act |
| 2026-11-13T19:55:57.466Z | "set 3 stands, B7 a; I sign U5" | B7 resolved to option (a), and his signature of the act |
| 2026-11-13T21:37:06.650Z | "I sign U5 Amendment 1" | Amendment 1, after Copilot's finding on `c542c24` |
| 2026-11-13T23:00:29.473Z | "I sign U5 Amendment 2" | Amendment 2, after the first review |
| 2026-11-14T03:26:04.460Z | "X3 B; I sign U5 Amendment 3" | Amendment 3 with X3 resolved to (b), after the confirmation run |
| 2026-11-14T04:20:15.328Z | "157 merged. 151 (a)" | his confirmation that he merged pull request 157 |
| 2026-11-15T17:18:53.516Z | "E2 go ahead" | this filing |

His merge authorization is comment 6871555031 on pull request 157,
named in the table above.

## The benchmark table (B6)

The median of five runs of `redactArgv`, in ms, on the builder's
machine, for `6dbfa08` (whose `redact.ts` the base carried unchanged)
and the final head `1f4c00c`. B6's bound is twice the base median plus
25 ms. This is the table pull request 157 reported; it is also in the
merge commit's message. The filed file is the builder's output as the
benchmark printed it; its labels map to the table's rows in order.

| Input | `6dbfa08` | `1f4c00c` | Bound |
|---|---:|---:|---:|
| "a" ×65,536 | 0.5 | 0.7 | 26.0 |
| "a+" ×32,768 | 1,024.1 | 5.8 | 2,073.1 |
| "Bearer " then the alphabet to 65,536 | 0.1 | 0.5 | 25.2 |
| "token=x " repeated | 1.6 | 3.7 | 28.3 |
| "sk-" keys repeated | 0.7 | 1.5 | 26.4 |
| PEM BEGIN line then 65,505 "A" | 0.5 | 0.8 | 26.1 |
| PEM BEGIN lines repeated | 24.1 | 48.2 | 73.1 |
| Amendment 1's input | 0.8 | 1.0 | 26.7 |
| R1 of the review of `37fdf8f` | 0.2 | 6.2 | 25.3 |
| "a-" ×32,768 | 984.4 | 11.4 | 1,993.7 |
| the confirmation run's JWT input | 0.1 | 3.8 | 25.3 |
| "eyJ-" ×16,384 | 1,545.9 | 7.1 | 3,116.8 |
| random base64 | 0.6 | 0.7 | 26.2 |

The third review reran 27 inputs on the Founder's MacBook and reported
every one within the bound.

## The files

### The act and its amendments

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION.txt` |
| Git blob id | `cc0aa71ce00a4d7b5bd0bb2d1848a61e4de61407` |
| SHA-256 | `639f08adab0d2f8a777712c6fe68559a790c30c1c7c2ad9dfada34177c626c98` |
| Bytes | 12174 |
| Lines | 68 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the act as the Founder signed it, 2026-11-13T19:55:57Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION-AMENDMENT-1.txt` |
| Git blob id | `676b361af735819ecdbead9903de25e5243f7108` |
| SHA-256 | `eb35842d452b1425113225bdd9ba960aaadc1db13a1746730353c2d3bbc8be4a` |
| Bytes | 3092 |
| Lines | 29 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Amendment 1 as signed, 2026-11-13T21:37:06Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION-AMENDMENT-2.txt` |
| Git blob id | `ad6185876bf5bd9aba8d5e7aeafdb53d376d9d10` |
| SHA-256 | `8fa644524b76ddcc9c9860ed004b84e588f6774dbac98e499683314453bee115` |
| Bytes | 4058 |
| Lines | 30 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Amendment 2 as signed, 2026-11-13T23:00:29Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACT-20261113-BR-JOURNAL-REDACTION-UNION-AMENDMENT-3.txt` |
| Git blob id | `d94514eb95f702fea8e88a3c0e1c0f1fb38861dc` |
| SHA-256 | `51713089fd2a41bc1d226727da6b340e3ab056559f878e49bd8269c55586ee4a` |
| Bytes | 6365 |
| Lines | 30 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Amendment 3 as signed, with X3 resolved to (b), 2026-11-14T03:26:04Z |

### The reviews

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/ACTS-REVIEW-PR157-37fdf8f-20261113T224958Z.txt` |
| Git blob id | `0dcebc9659744992ae42cfe804c5da562825a4eb` |
| SHA-256 | `26a6557618fdde39ee5e32b393f50b4f01ed43881d2a817153a839c6a40b0e9d` |
| Bytes | 5953 |
| Lines | 57 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's paste of the first review of PR 157 at `37fdf8f`, received 2026-11-13T22:49:58.794Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/ACTS-REVIEW-PR157-7e8c9cf-20261114T030950Z.txt` |
| Git blob id | `dc13413dfd3197c844cb98a613ec89fe00126e80` |
| SHA-256 | `726e599c5b6afd41f0ce2279ef97c88fc3e02b0b4d2d438c169eb7aa9bb6de94` |
| Bytes | 4693 |
| Lines | 40 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's paste of the confirmation run of PR 157 at `7e8c9cf`, received 2026-11-14T03:09:50.971Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/ACTS-REVIEW-PR157-1f4c00c-20261114T040111Z.txt` |
| Git blob id | `de13d84e2a9b45d0e876f66653b2189a8566b66c` |
| SHA-256 | `c55144b90f84e4074523be1b54548d78b1025edf397c4d53ced439bb6c6fd4c1` |
| Bytes | 4800 |
| Lines | 34 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's paste of the third review of PR 157 at `1f4c00c`, received 2026-11-14T04:01:11.807Z |

### The briefs

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/ACTS-BRIEF-PR157-37fdf8f.txt` |
| Git blob id | `e21ff46af2377446d148c6a40e45c38d02529136` |
| SHA-256 | `f8139a224afb4d5d8be7e9af49e313b631797803649aa81787aea08c58d7b890` |
| Bytes | 10585 |
| Lines | 80 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's Tier-2 brief for `37fdf8f`, sent 2026-11-13T22:34Z; its SHA-256 matched on the Founder's MacBook at 22:35:23Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/ACTS-BRIEF-PR157-7e8c9cf.txt` |
| Git blob id | `ed48471a40490dfb2acdc978289277c53da1774e` |
| SHA-256 | `abec170c03c5bedf3f50cd52e4f4c17289de429d3847d86fd13b3a88cba4bbc6` |
| Bytes | 7434 |
| Lines | 64 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's confirmation-run brief for `7e8c9cf`, recorded 2026-11-13T23:12Z; its SHA-256 matched on the Founder's MacBook at 2026-11-14T01:51:09Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/ACTS-BRIEF-PR157-1f4c00c.txt` |
| Git blob id | `b8d30d999c3aa041dfb20b87cacde80ddd285b22` |
| SHA-256 | `34ddff0314754fd98566a87d2322c0db48c3994fd83393ca740ac5d17f683c18` |
| Bytes | 10286 |
| Lines | 76 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's third-review brief for `1f4c00c`, recorded 2026-11-14T03:37Z; its SHA-256 matched on the Founder's MacBook at 03:45:38Z |

### The merge, the deployment and the benchmark

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/ACTS-DEPLOY-POLLS-PR157-f3e884b.txt` |
| Git blob id | `eed470bfb717469a272c36037f3dd82031e064af` |
| SHA-256 | `81dc8daa101353f9389002829a34dc6be1fbc13763e9fd6a245ca67916425b73` |
| Bytes | 439 |
| Lines | 8 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's /health and /version polls after the merge, 2026-11-14T04:18:38Z to 04:20:13Z (finding 7) |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/ACTS-BENCH-PR157-1f4c00c.txt` |
| Git blob id | `f7122e96d002a098b03ff09346f029a35852547e` |
| SHA-256 | `824ce116a6de5fce1795d6bb8478902a07445f225054f3406461ba027d6fe9f1` |
| Bytes | 1198 |
| Lines | 13 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | B6's table at `1f4c00c` as the builder's benchmark printed it, 2026-11-14T03:29Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/U5-EVIDENCE-builder-audit-20261113-20261114.txt` |
| Git blob id | `a9bf6fa716d260612c84d4d1c85b362de8663688` |
| SHA-256 | `73a221664da22f66cb7ae46a1f2ce5f25e14183ba328d73370481be7ebb85d8c` |
| Bytes | 25115 |
| Lines | 44 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's audit record under E1, 42 entries from 2026-11-13T19:41:05Z to 2026-11-14T04:20:50Z, verbatim, below a header line and a blank line; it holds the merge verification and the deployment reading (findings 3 and 4) |

## Findings

1. **PASS-WITH-ADVISORIES is not written PASS.** Exception 1 (a) of the
   Founder's Part G choices holds the Phase 4 stop gate open until this
   change merges "with a Tier-2 PASS at its exact final head" (A1 of
   the act). The final review's verdict is PASS-WITH-ADVISORIES. D1 of
   the act leaves the further ruling that closes Exception 1 (a) to
   the Founder, and this record does not decide it.
2. **The advisories stay open.** The third review named two, as
   follow-ups outside B8's paths: the `jwt` pattern at
   `packages/redaction/src/registry.ts:108` still has the former
   quadratic first part, and
   `test/room-runtime-phase1-acceptance-gateway.test.ts` leaves a Unix
   server open, so the default suite does not finish in some
   sandboxes. Each needs its own act.
3. **Two audit entries carry a time that had not yet come.** The two
   entries stamped 2026-11-14T03:40:00Z were typed by hand and written
   between about 03:15Z and 03:20Z; the entry stamped 03:22:39Z says so.
   They are filed as written, so the record is out of time order there.
4. **The builder's errors on the way are in the record as written.** A
   paste-in block for Amendment 2 left the file empty on the Founder's
   MacBook (01:50:24Z), and pull request 157's first body said Cursor
   had not reported (04:07:20Z). Each was caught and fixed before the
   review or authorization it bore on.
5. **The Founder merged pull request 157 himself**, at 04:17:28Z on
   2026-11-14; the builder verified the merge commit and the
   deployment afterwards (04:18:42Z and 04:20:43Z).
6. **Pull request 157 had four heads and three Tier-2 reviews.** The
   builder drafted a brief for the first head, `c542c24`, but never
   sent it: Copilot's finding there (B2 rescanned the whole value
   once per match) needed Amendment 1 first. The first review ran at
   `37fdf8f`; its finding was answered under Amendment 2, the
   confirmation run's under Amendment 3, and VELOCITY B2 allowed a
   third review because the confirmation run found a defect in the
   correction itself.
7. **The poll log gives times only.** Every line is on 2026-11-14 UTC,
   and the last line, "DONE", is where the poll loop ended.
8. **No masking.** No file holds a user name, host name, email
   address, IP address, tailnet name, node key or token. The GitHub
   account name in the audit record is not masked, as in earlier
   filings.

## Not filed here

- The Founder's merge authorization: comment 6871555031 on GitHub.
- The brief for `c542c24`, drafted and never sent (finding 6).
- The builder's benchmark outputs at `c542c24`, `37fdf8f` and
  `7e8c9cf`, and the benchmark, prototype and mutation scripts. Each
  brief states the numbers the reviewer was given.
- The drafts of the act and its amendments as delivered. The audit
  record gives the SHA-256 of each and what the signature changed.
- `FOUNDER-ACT-20261105-BR-BEARER-SHAPE` and its Amendments 1 to 7,
  under whose Amendment 6 U5 this act was owed, filed already
  (pull request 155).
- The Part G ruling, whose drafts the audit record mentions. Recording
  it is a separate step.
- Pull request 157's body and diff: on GitHub, and the body is also the
  merge commit's message.
- The records of pull request 158, which E2 does not cover.

## Not authorized by this record

Anything. Filing these records changes nothing they record.

## Identity

| Step | Identity |
|---|---|
| The act's signature and amendments, each review run and paste, the merge authorization and the merge | the Founder (the Tier-2 reviews by Codex, on his MacBook) |
| The act's drafts, the briefs, the build, the benchmark, the checks, the polls and this record | the builder session |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: E2 of the act and his "E2 go ahead"
at 2026-11-15T17:18:53.516Z, his authorization of this filing. Merge is
a separate exact-SHA Founder act under DEC-20260718-04; this receipt
asserts none.
