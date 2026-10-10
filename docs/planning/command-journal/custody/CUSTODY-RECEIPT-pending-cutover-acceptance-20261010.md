# CUSTODY RECEIPT — PR 2b: acceptance of the end of the `pending_cutover` tolerance (2026-10-10)

**This receipt records the landing of one instrument: the Founder's
acceptance of the change his act of 2026-10-10 authorized, merged as
PR #104. It records the builder's post-merge reads and the one read not
done. It authorizes nothing.** The acceptance's own text governs. The
act and its first receipt are
`docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-pending-cutover-removal-20261010.txt`
and
`docs/planning/command-journal/custody/CUSTODY-RECEIPT-pending-cutover-removal-20261010.md`,
which landed with the change.

## The instrument

The file is the text of the Founder's message as recorded in the session
transcript, byte for byte, plus one final LF; the post carried no final
newline.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACCEPTANCE-pending-cutover-removal-20261010.txt` |
| Git blob id | `75f1fe77d7433fb3c5cac4b750437ad6348547b0` |
| SHA-256 | `97aa5d6adcf5e6f1c8ed76f9e5935f5769e477b4fd411254e2e175233bd170d6` |
| Bytes | 1104 |
| Lines | 25 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's acceptance, posted in session at 2026-10-10T02:50:24Z, byte-identical to the builder's draft. It records one departure (no Neon read after the merge), restates the builder's report, and spends the act |

## What happened, in order

All times are UTC on 2026-10-10.

| Time | Event | Source |
|---|---|---|
| 02:08:39Z | the Founder's merge authorization for PR #104 at head `79a78bb`, comment 6092545014, from `decivantiq` | GitHub API |
| 02:08:59Z | `founder-authorization` success on `79a78bb` | GitHub API |
| 02:09:18Z | PR #104 merged by the builder with the expected head; merge commit `afe17fdecca4d4d19250dd096710801eedb58b71`, tree `2ad5ac22126b7d113af085ad8f26f7478b666bc4`, the authorized tree; trailers intact; `attribution-shape-check.sh main` PASS | GitHub API, git |
| 02:09:20.192Z | deployment `1a00c715` created at `afe17fd` | Railway API |
| 02:09:49.806Z | `boot.preflight`: role `br_app_runtime`, `migrationsPresent` 8, `privilegeAudit` `enforced`, forbidden attributes `[]`, forbidden memberships `[]`; `boot.listening` at 02:09:49.811Z | deployment log |
| 02:09:53.609Z | deployment `SUCCESS`; `0bb5c618` removed | Railway API |
| 02:09:56Z, 02:10:22Z, 02:11:35Z | `/health` 200, uptime 7, 34 and 106 seconds | public `/health` |
| 02:10:29.844Z | `gateway.leadership.serving`, generation 71 | deployment log |
| after 02:11Z | nothing staged in Railway | Railway API |
| 02:50:24Z | acceptance posted | session |

The deployment's only error-level lines are the PostgreSQL client's
SSL-mode warning that every recent boot logs.

## The read not done

The act and the merge authorization name a read of Neon sessions after
the deployment. The builder's Neon connector had signed out at 02:04Z
and stayed signed out, so the read was not made; a session reads its
connectors when it starts, so signing in again would not have restored
it here. The builder recommended accepting without it: the change
refuses any login other than `br_app_runtime`, and the boot log shows
the process running as `br_app_runtime`. The acceptance records the
departure.

## Provenance and transport

| Step | Identity |
|---|---|
| Acceptance drafted | the `builder` seat, in session |
| Acceptance posted | the Founder, in session, at 02:50:24Z |
| Merge | the builder session, through the GitHub API, after the Founder's authorization |
| Reads | the builder session, read-only, through the GitHub and Railway APIs and public `/health` |
| Transport | file written by the builder from the session text as recorded in the session transcript, ending with a single LF; pins above computed by the builder over the landed file |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the acceptance (posted
2026-10-10T02:50:24Z). Merge is a separate exact-SHA Founder act under
DEC-20260718-04; this receipt asserts none.
