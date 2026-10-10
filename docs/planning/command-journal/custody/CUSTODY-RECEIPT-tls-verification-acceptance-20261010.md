# CUSTODY RECEIPT — acceptance of TLS verification the connection string cannot turn off (2026-10-10)

**This receipt records the landing of one instrument: the Founder's
acceptance of the change his act of 2026-10-10 authorized, merged as
PR #107. It records the builder's post-merge reads. It authorizes
nothing.** The acceptance's own text governs. The act and its first
receipt are
`docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-tls-verification-20261010.txt`
and
`docs/planning/command-journal/custody/CUSTODY-RECEIPT-tls-verification-20261010.md`,
which landed with the change.

## The instrument

The file is the text of the Founder's message as recorded in the session
transcript, byte for byte, plus one final LF; the message carried no
final newline.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACCEPTANCE-tls-verification-20261010.txt` |
| Git blob id | `b10228787e84f9411d431597ec381cf7330df672` |
| SHA-256 | `327a1c2f04a4a92a7107acdd2b5565bfa5b571aa9915a8cc4f674fdda0cad5ad` |
| Bytes | 20 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's acceptance, given in session at 2026-10-10T23:12:02Z. Under the act's ACCEPTANCE clause it spends the act |

## How the acceptance was given

The builder reported on the deployment the merge started and drafted a
longer acceptance text for the Founder to post on PR #107, restating
that report. The Founder did not post the draft. He replied in session,
verbatim, `I accept the change`, and this receipt lands that reply,
not the draft.

One reading the builder made, stated so the Founder can correct it:
"the change" is the change his act of 2026-10-10 authorized and PR #107
merged. It was the only acceptance the builder's previous message asked
for, and no other act was awaiting acceptance in the session.

The act setting `DATABASE_URL` to `sslmode=verify-full`, drafted the
same day, has not been issued; the acceptance does not touch it.

## What happened, in order

All times are UTC on 2026-10-10.

| Time | Event | Source |
|---|---|---|
| 21:25:31Z | the Founder's merge authorization for PR #107 at head `8f09111`, comment 6102340382, from `decivantiq`, byte-identical to the builder's draft | GitHub API |
| 21:25:41Z | `founder-authorization` success on `8f09111` | GitHub API |
| 21:34:43Z | the Cursor security agent's run on `8f09111` that the comment started completed with no finding | GitHub API |
| 21:35:14Z | PR #107 merged by the builder with the expected head; merge commit `3a58b3892359899549f2aea70499471fc7bd6ac4`, parents `06c608e` and `8f09111`, tree `22ab2a3fd57bd81efa32a7ea252cdb5dfcf8c982`, the authorized tree; trailers intact; `attribution-shape-check.sh main` PASS | GitHub API, git |
| 21:35:16.621Z | deployment `71d11246` created at `3a58b38` | Railway API |
| 21:36:40.538Z | `boot.start`, commit `3a58b38` | deployment log |
| 21:36:40.683Z | `boot.preflight`: role `br_app_runtime`, `migrationsPresent` 8, `privilegeAudit` `enforced`, forbidden attributes `[]`, forbidden memberships `[]`; `boot.listening` on port 8080 at 21:36:40.694Z | deployment log |
| 21:36:45.295Z | deployment `SUCCESS`; `ae86a775` removed | Railway API |
| 21:37:20.786Z | `gateway.leadership.serving`, generation 74 | deployment log |
| 21:35Z to 21:45Z | `/health` 200 on all 30 polls, 20 seconds apart, across the switch | public `/health` |
| 21:44:08Z | `/health` 200, uptime 448 seconds; nothing staged in Railway | public `/health`, Railway API |
| 23:12:02Z | acceptance given | session |

## What the boot shows about the change

Deployment `ae86a775`, at `06c608e`, logged node-postgres's warning
that the SSL modes `prefer`, `require` and `verify-ca` are treated as
aliases for `verify-full`, as every recent boot had. Deployment
`71d11246`, at `3a58b38`, logs no such warning: the connection string's
`sslmode` no longer reaches node-postgres, and `pgConnectionSettings`
sets verified TLS itself. The deployment log has no error-level line.

## Provenance and transport

| Step | Identity |
|---|---|
| Acceptance given | the Founder, in session, at 23:12:02Z |
| Merge | the builder session, through the GitHub API, after the Founder's authorization |
| Reads | the builder session, read-only, through the GitHub and Railway APIs and public `/health` |
| Transport | file written by the builder from the session text as recorded in the session transcript, ending with a single LF; pins above computed by the builder over the landed file |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the acceptance (given
2026-10-10T23:12:02Z). Merge is a separate exact-SHA Founder act under
DEC-20260718-04; this receipt asserts none.
