# CUSTODY RECEIPT — Gate IV, Tranche D: the Founder's act and the run of 0008_runtime_operational_grants (2026-10-04)

**This receipt records the landing of two instruments: the Founder's Gate
IV act for `0008_runtime_operational_grants`, and the stage-5 evidence of
run 37234634362, the one run that act authorized. It authorizes nothing:
no dispatch, no merge, no deployment, no Tranche D cutover, no password
or credential for `br_app_runtime`, no change to the workflow, the
runner, the environment or any secret, and no second run.** Each
instrument's own text governs.

## The instruments

The act is the text as posted in the builder session, byte for byte, plus
one final LF; the chat post carried no final newline. The evidence file
is the JSON object the runner emitted, as the Founder pasted it from the
run's Summary page, with one final LF. The lines the paste carried above
the object (the tail of a SHA row, a verdict row of one of the page's
assertion tables, and the section heading) are not preserved.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-gate4-0008-20261004.txt` |
| Git blob id | `1fa98b653da31f8c250691605c3e9fd239a01d47` |
| SHA-256 | `405698e08d3c843d0a0346b36b75d89160a116dfa67023f72420ac8c423596ad` |
| Bytes | 6722 |
| Lines | 129 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's Gate IV act for `0008_runtime_operational_grants` (main `42ae00c0`): drafted by the builder, completed from the Founder's own `gh api` read of the environment, and posted by the Founder in the builder session at 2026-10-04T21:02:39Z. Spent by run 37234634362. Two earlier session messages carried no act body and are not instruments: `Signed: Michael Daley` with its date line at 18:10:47Z, and `Michael Daley`, `2026-10-04`, `post it` at 19:19:11Z. The builder did not treat either as the act |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/GATE4-EVIDENCE-run37234634362-stage5-20261004.json` |
| Git blob id | `03012d25da1a2b03500f24076200ba1cf70e6add` |
| SHA-256 | `425ddf875448c7170b0b8ad75706929e0febb948ef360f6697923f1996adc64c` |
| Bytes | 1010 |
| Lines | 31 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the stage-5 evidence of run 37234634362, pasted by the Founder from the run's Summary page at 2026-10-04T23:21:30Z (the builder cannot read that page); every field verified by the builder against the act and against production, see below. `approver_identity` is `null` by the runner's design; the approver is platform-recorded. Its `run_id` is the runner's own id, not GitHub's run id |

## The run

| Run | Dispatched | Inputs | Approval | Outcome |
|---|---|---|---|---|
| 37234634362 | 2026-10-04T21:05:04Z by `decivantiq`, through the builder session, under the act | `42ae00c0967267154473cefc9e78b705d3afeb8a`, `0008_runtime_operational_grants`, at `main` | `daley40-lab`, environment `db-admin-migration` (the approvals API lists one record, state `approved`, empty comment); the Founder wrote `approved` in session at 21:09:01Z | `preflight` passed 21:05:09Z to 21:05:12Z (SHA match); `migrate` waited for review, started 21:08:16Z and finished 21:08:33Z with every step successful; the runner's own window was 21:08:28.462Z to 21:08:30.738Z; evidence above |

**Dispatch without a separate go.** The builder had told the Founder it
would dispatch after he posted the act and said dispatch. The act,
posted at 21:02:39Z, carried no separate go. The builder re-read the
production ledger and object ownership (21:04:10Z), re-checked in the
dispatching shell that main's tip was the authorized SHA, that no run was
queued, waiting or in progress, and that the session identity was
`decivantiq`, and dispatched at 21:05:04Z, reading the act's `AUTHORIZED
ACT`, `APPROVAL` and `CONDITIONS AT DISPATCH` sections as the
instruction. The dispatch changed nothing in production: the `migrate`
job waited for approval, which came from `daley40-lab` and is
platform-recorded.

## The database

Neon project `founder-os-build-room` (`orange-art-29526355`), branch
`production` (`br-summer-sun-avroco6a`), endpoint
`ep-little-meadow-avqfkjcp`, database `neondb`, PostgreSQL 18.6. The
Railway service `rare-enjoyment` resolved that endpoint on 2026-10-04
from 07:30:13Z to 07:30:16Z (Railway DNS log, deployment `ac2361b5`). The
environment secret's value is unreadable. Its last update,
`2026-09-30T08:40:13Z`, is unchanged from the Founder's attestation of
2026-10-02; the Founder read it with `gh api` on 2026-10-04 from 20:43:49Z
to 20:43:52Z and pasted the output at 20:44:11Z.

| Event | Time (UTC) | Source |
|---|---|---|
| builder's read-only reads before the run: ledger 0001 to 0007; the 15 tables and 6 sequences that 0008 names all owned by `neondb_owner`; `br_app_runtime` holding 2 relation privileges (`SELECT` on the two journal tables), no column privilege, no forbidden attribute, no membership | 2026-10-04 15:57:12Z to 15:59:03Z; again 20:51:51Z and 21:04:10Z | `run_sql` as `neondb_owner` |
| 0008 applied through Gate IV (run 37234634362) | 2026-10-04 21:08:28Z to 21:08:30Z; `schema_migrations` row `2026-10-04 21:08:29.242754+00` | the evidence above; the row read by the builder at 21:11:08Z |
| builder's read-only reads after the run | 2026-10-04 21:10:56Z (grants) and 21:11:08Z (ledger, ownership, role) | `run_sql` as `neondb_owner` |

What the after-reads showed:

- Ledger: 0001 to 0008. The 0001 to 0007 rows are unchanged, and 0008's
  row time falls inside the runner's `started_at` and `finished_at` and
  inside the `migrate` job's window.
- Grants: compared with `EXPECTED_TABLE_PRIVILEGES`,
  `EXPECTED_SEQUENCE_PRIVILEGES` and `EXPECTED_UPDATE_COLUMNS`, pinned in
  `test/runtime-role-boot.storage.test.ts` at `42ae00c0`, with the
  expected rows generated mechanically from that file. 38 relation-level
  rows expected and found (32 table-level, 6 sequence `USAGE`); 23 column
  `UPDATE` rows expected and found; none missing, none unexpected. No
  non-`UPDATE` column privilege, no grant option, no grant to `PUBLIC` on
  a relation in schema `public`. `playing_with_neon` and its sequence
  carry nothing for the runtime role.
- Unchanged: 21 of 21 named objects owned by `neondb_owner`; the two
  journal tables still owned by `br_journal_owner`. `br_app_runtime` can
  log in, is not superuser, holds none of `CREATEROLE`, `CREATEDB`,
  `BYPASSRLS` or `REPLICATION`, is a member of no role, owns no relation,
  cannot create in schema `public`; no event trigger exists.
- Findings: none.

## Railway

| Deployment | Created (UTC) | What | Outcome |
|---|---|---|---|
| `ac2361b5` | 2026-10-04 07:29:44Z | automatic deploy of `main` at `42ae00c0`, the merge of PR #96 | FAILED: `schema preflight failed: required migration id(s) absent from schema_migrations: 0008_runtime_operational_grants`, boot log 07:30:13Z to 07:30:16Z |
| `5e3769cb` | triggered 2026-10-04 21:49:37Z by the builder's redeploy call | the builder's redeploy of the `ac2361b5` build (`42ae00c0`), on the Founder's instruction `redeploy ac2361b5` (21:49:06Z) | SUCCESS: `boot.start` 21:53:20.464Z at commit `42ae00c0967267154473cefc9e78b705d3afeb8a`; `boot.preflight` 21:53:20.556Z, role `neondb_owner`, `migrationsPresent` 8, `privilegeAudit` `pending_cutover`, listing the forbidden attributes (`rolcreaterole`, `rolcreatedb`, `rolbypassrls`, `rolreplication`) and memberships (`br_journal_owner`, `command_journal_writer`, `neon_superuser`, `pg_read_all_data`, `pg_write_all_data`) that the audit finds on that role; `boot.listening` 21:53:20.562Z, port 8080; a filtered log search for `error` returned nothing |

The redeploy was outside the Gate IV act, which authorizes no deploy or
redeploy. It is recorded here as the Founder's instruction and the
builder's act. The application still connects as `neondb_owner`: no
`DATABASE_URL` change, password or credential is involved.

## How the act was drafted, completed and posted

- The Founder directed the draft, verbatim: "Draft the Gate IV act for
  0008" (2026-10-04T14:49:59Z, repeated twice while the builder worked).
  The builder delivered it with four blanks in the environment
  attestation, saying that only the Founder's own read could fill them,
  because the builder's session cannot read that environment (the proxy
  returns 403).
- Two session messages without an act body followed, at 18:10:47Z and
  19:19:11Z. The builder declined to fill the blanks, post anything or
  dispatch, and said why.
- The Founder ran the builder's read-only `gh api` block in his own
  terminal from 20:43:49Z to 20:43:52Z and pasted the output at
  20:44:11Z. Every attested bullet matched that output.
- The builder filled the four markers from that output and changed
  nothing else (three lines differ from the draft, verified with `diff`),
  then re-checked the act's conditions between 20:45Z and 20:52Z.
- The Founder posted the text in session at 2026-10-04T21:02:39Z. The
  builder compared the session transcript's text of that message with
  its filled draft: identical, with the same SHA-256 and no `<<` marker
  left.

## What the builder verified and what it did not

- Verified against live systems, read-only: `main`'s tip, open pull
  requests and the workflow's runs before dispatch; the run's jobs,
  pending deployment and approvals (GitHub API); the production ledger,
  object ownership, role state and grants (Neon `run_sql`); the Railway
  deployments, boot and DNS logs.
- Verified against each other: the pasted stage-5 evidence (both SHAs
  equal the act's; one migration applied; the before list equals the
  builder's read at 21:04:10Z and the after list its read at 21:11:08Z;
  the ledger row's time falls inside the runner's window).
- Recorded on the Founder's word, consistent with the evidence but not
  independently observed: the environment attestation (reviewers,
  `prevent_self_review`, administrator bypass off, branch policy, no wait
  timer, the secret's scope and last update), which the builder's session
  cannot read; that the evidence the Founder pasted is the Summary page's
  content (it parses as JSON and agrees field for field with the
  builder's reads).
- Not read by the builder: the run's Summary page and its job logs (this
  session's `gh` refuses the redirect to the log host); whether
  `br_app_runtime` holds a password (`pg_authid` is unreadable to
  `neondb_owner`).

## What this landing does not do

- It edits no code, no workflow and no other custody file. It touches
  `README.md` only to point at this receipt.
- It authorizes nothing: no dispatch, no merge, no deployment, no Tranche
  D cutover (Gate V), no `DATABASE_URL` change, no password or credential
  for `br_app_runtime`. The act is spent; no second run is authorized.

## Provenance and transport

| Step | Identity |
|---|---|
| Act drafted | the `builder` seat, in session, at the Founder's direction, as a template with four blanks it could not fill |
| Environment read | the Founder, in his own terminal with `gh api`, 2026-10-04 20:43:49Z to 20:43:52Z; output pasted in session at 20:44:11Z |
| Blanks filled | the `builder` seat, from that output; three lines differ from the draft |
| Act posted | the Founder, in session, 2026-10-04T21:02:39Z |
| Dispatch | the builder session through the GitHub API under the `decivantiq` account, 2026-10-04T21:05:04Z |
| Approval | `daley40-lab`, platform-recorded on the run's environment deployment review |
| Evidence | the Founder's paste of the Summary page's JSON, 2026-10-04T23:21:30Z |
| Redeploy | the builder session through the Railway API, 2026-10-04T21:49:37Z, on the Founder's instruction |
| Transport | files written by the builder from the session texts as recorded in the session transcript, each ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the act's CUSTODY clause (posted
2026-10-04T21:02:39Z) and "redeploy ac2361b5" (21:49:06Z) for the Railway
record. Merge is a separate exact-SHA Founder act under DEC-20260718-04;
this receipt asserts none.
