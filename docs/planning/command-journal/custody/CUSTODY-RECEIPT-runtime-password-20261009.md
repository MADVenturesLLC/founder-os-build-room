# CUSTODY RECEIPT — PR 2b: a new password for `br_app_runtime`, the exposure left open until Gate VI (2026-10-09)

**This receipt records the landing of two instruments: the Founder's
act replacing the password of `br_app_runtime`, and his acceptance,
which retires the password set on 2026-10-07 and settles, for that
password, the exposure he left open on 2026-10-07 and the runner
exposure recorded in the Gate VI receipt. It also records the
builder's reads before, between and after the Founder's three acts.
It authorizes nothing: no removal of the `pending_cutover` tolerance,
no sealing of the two Railway tokens, no change to the credential for
`ep-withered-bonus-au1982ty` or any other, no change to any variable,
service, setting, database, role, workflow or secret, no deploy, no
merge.** Each instrument's own text governs.

## The instruments

Each file is the text of the Founder's message as recorded in the session
transcript, byte for byte, plus one final LF; no post carried a final
newline.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-runtime-password-20261009.txt` |
| Git blob id | `8f91e9480bd098e385eb2072cb5a5f26bb9c9cdc` |
| SHA-256 | `75f6cf0870df826d6683beb60ba4ae72b0f128148c90f2df460ad57a5257fabf` |
| Bytes | 6321 |
| Lines | 120 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's act at `main` `6c71c6404aa98adfff99fc0bdc72dd77938ca897`: three acts by his own hands in a Chrome Guest window (run the Gate V password statement once in Neon's SQL Editor; edit `DATABASE_URL`, and no other variable, in Railway; deploy that staged change once). The builder drafted it after PR #102 merged, at the Founder's request. He posted it in the builder session at 2026-10-09T20:45:30Z, byte-identical to the draft. Spent by the acceptance |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACCEPTANCE-runtime-password-20261009.txt` |
| Git blob id | `23a21484d88d6b5cccdefbd167dfee519afbf7a8` |
| SHA-256 | `3d54602f969b45546903cee25517b36dd9dceb6c5afde44872d2cb1cb09248bc` |
| Bytes | 1445 |
| Lines | 31 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's acceptance, posted at 2026-10-09T22:29:42Z. It records two departures, restates the builder's evidence, spends the act and retires the 2026-10-07 password. Drafted by the builder; the Founder posted it unchanged |

## What happened, in order

All times are UTC on 2026-10-09. Session times are the transcript's;
Neon and Railway times are their APIs'; database times are the
database clock.

| Time | Event | Source |
|---|---|---|
| 20:45:30Z | act posted, with no separate instruction to read; the builder treats the posting as step a | session |
| 20:45Z to 21:49Z | the builder's step a reads; every condition holds (below) | GitHub, Railway, Neon, public `/health` |
| 21:49:40Z | the builder reports the conditions holding | session |
| 21:49:55Z, 21:50:01Z | the Founder: "send links"; the builder sends the Neon and Railway links | session |
| 21:54:18Z | the Founder: "I am there" (step b) | session |
| 21:54:31Z | the builder gives the statement recorded in the Gate V receipt (step c) | session |
| 21:54:33Z | a `neondb_owner` session opens from application `neon-internal-sql-editor`, the Founder's SQL Editor | Neon `pg_stat_activity` |
| 21:54:58Z | **act 1**: `br_app_runtime`'s password changed (the role entry's `updated_at`) | Neon API |
| 21:55:10Z | the Founder: "act 1 done" | session |
| 21:55:23Z | the builder's step d read: the password changed; attributes and memberships unchanged | Neon |
| 22:22:23Z | a staged change is created in Railway | Railway API |
| 22:23:04Z | the Founder shows the string's tail from `@`, naming the `-pooler` host; the message also shows the password's last character | session |
| 22:23:11Z | the builder: not that host; remove `-pooler` before saving | session |
| 22:23:49Z | the Founder shows the corrected tail, the direct host `ep-little-meadow-avqfkjcp.c-11.us-east-1.aws.neon.tech`, database `neondb` | session |
| 22:24:12Z | the staged change last updated: one change, `DATABASE_URL` | Railway API |
| 22:24:20Z | the Founder: "act 2 saved" | session |
| 22:24:42.513Z | **act 3**: deployment `e297c2fa-b861-4ea3-b459-6b6a4c25ad82` created, commit `6c71c64` | Railway API |
| 22:24:54Z | the Founder: "deployed" | session |
| 22:25:14.285Z to 22:25:14.367Z | `boot.start`, `boot.preflight`, `boot.listening` | deployment log |
| 22:25:14.342958Z, 22:25:24.403533Z | two `br_app_runtime` sessions open | Neon `pg_stat_activity` |
| 22:25:18.763Z | deployment `SUCCESS`; `3429b80d` goes to `REMOVING` | Railway API |
| 22:25:21Z | `/health` 200, uptime 7 | public `/health` |
| 22:25:34Z | the builder's EVIDENCE reads in Neon (below) | Neon |
| 22:25:44.400Z | `gateway.leadership.serving`, generation 69 | deployment log |
| 22:25:50Z | `/health` 200, uptime 36 | public `/health` |
| 22:29:42Z | acceptance posted | session |

## The conditions at step a

| Condition | Read |
|---|---|
| `main`'s tip | `6c71c6404aa98adfff99fc0bdc72dd77938ca897` |
| latest deployment | `3429b80d` `SUCCESS` at `6c71c64`, booted at 14:51:19Z as `br_app_runtime` with `privilegeAudit` `enforced`; none queued, building or deploying; nothing staged |
| `br_app_runtime`'s role entry | `updated_at` 2026-10-07T11:43:20Z; can log in; not superuser; no `CREATEROLE`, `CREATEDB`, `BYPASSRLS` or `REPLICATION`; member of no role |
| production | `schema_migrations` 0001 to 0008; journal empty; no run of DB Admin Migration queued or waiting |
| service | `/health` 200 at 20:45:50Z; two `br_app_runtime` sessions, from 14:51Z |

## The EVIDENCE at step f

| Item | Read |
|---|---|
| Neon's role entry for `br_app_runtime` | `updated_at` 2026-10-09T21:54:58Z, after act 1 |
| attributes and memberships | unchanged at 21:55:23Z and 22:25:34Z; member of no role |
| staged change | one, `services.rare-enjoyment.variables.DATABASE_URL`, value encrypted and not shown; nothing staged after the deploy |
| the new deployment | `e297c2fa`, commit `6c71c64`, created 22:24:42.513Z, `SUCCESS` 22:25:18.763Z; the only deployment from this act |
| `boot.preflight` | 22:25:14.363Z: role `br_app_runtime`, `migrationsPresent` 8, `privilegeAudit` `enforced`, forbidden attributes `[]`, forbidden memberships `[]` |
| `boot.listening` | 22:25:14.367Z, port 8080 |
| `gateway.leadership.serving` | 22:25:44.400Z, generation 69 |
| error lines | the PostgreSQL client's SSL-mode warning only |
| `/health` | 200 at 22:25:21Z and at 22:25:50Z |
| sessions after act 1 | `br_app_runtime` from 22:25:14Z and 22:25:24Z; `neondb_owner` only from `neon-internal-sql-editor`, opened 21:54:33Z; none from the application |
| ledger and journal | `schema_migrations` 0001 to 0008, `0008` `applied_at` `2026-10-04T21:08:29.242Z`; journal 0 events |

## Departures and findings

1. **No separate instruction to read.** The act's step a begins "I
   tell the builder to read." The Founder posted the act without that
   line; the builder treated the posting as step a. The acceptance
   records this.
2. **One step a read ran about an hour after it was issued.** A Neon
   read issued at about 20:45Z executed at about 21:49Z; the builder
   reported only after it returned, at 21:49:40Z.
3. **The `-pooler` host.** At act 2 the Founder first showed a tail
   naming `ep-little-meadow-avqfkjcp-pooler`. The act requires the
   direct host. The builder said so, and the Founder corrected it
   before saving; the deployment then booted and connected. The
   acceptance records this.
4. **One character of the new password reached the session.** The
   22:23:04Z message began with the password's last character, before
   `@`. It is in this session's transcript. The password is 64
   hexadecimal characters from two random UUIDs; one character
   removes about four bits. The builder did not quote it here or
   anywhere else.
5. **The window was about thirty minutes.** From act 1 (21:54:58Z) to
   the first new session (22:25:14Z) was 30m16s. The act says the
   Founder keeps it short. The builder did not read `/health` or the
   old deployment's live behaviour inside the window. A log read of
   `3429b80d` returned no line after its boot at 14:51:20Z, so no
   error was logged, but that is not proof the service served. The
   acceptance's statement that it kept serving is the Founder's.
6. **The SQL Editor's `neondb_owner` session.** Neon's SQL Editor ran
   act 1 as `neondb_owner`, from application `neon-internal-sql-editor`.
   It was still open at 22:25:34Z. It is the Founder's session, not
   the application's. Closing the tab ends it.
7. **The superseded string in the Founder's note.** The act says he
   deletes it. The builder cannot see his note, and the acceptance
   does not mention it.

## What the builder verified and what it did not

- Verified against live systems, read-only: `main` (git); deployments,
  deployment logs and staged changes (Railway, names only, values
  encrypted); role entries, ledger, journal, sessions and role
  attributes and memberships (Neon API and `run_sql` as `neondb_owner`,
  read-only); the public `/health` endpoint.
- Not called: Railway `list-variables` or any tool that returns a
  variable's value or a connection string.
- On the Founder's word: that he worked in a Chrome Guest window with
  no extension; that he ran the statement once; that the password went
  only into `DATABASE_URL` and his note; that he took no screenshot
  while it was on screen; the string's start, which he was told to
  check before saving.
- Not read by the builder: any password or connection string, except
  the tails the Founder showed from `@` and the one character in
  finding 4.

## What this landing does not do

- It edits no code, no workflow and no other custody file. It touches
  `README.md` only to record this act and point at this receipt, and
  to restate what is not done.
- It authorizes nothing: no removal of the `pending_cutover`
  tolerance, no sealing of the tokens, no rotation of the
  `ep-withered-bonus` credential or any other, no deploy, no merge.

## Provenance and transport

| Step | Identity |
|---|---|
| Act and acceptance drafted | the `builder` seat, in session |
| Act and acceptance posted | the Founder, in session, at 20:45:30Z and 22:29:42Z |
| Statement run, variable edit and deploy | the Founder, by hand, in Neon and Railway |
| Reads | the builder session, read-only, through the GitHub, Railway and Neon APIs, Neon `run_sql` as `neondb_owner`, and public `/health` |
| Transport | files written by the builder from the session texts as recorded in the session transcript, each ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the act's CUSTODY clause (posted
2026-10-09T20:45:30Z) and the acceptance (22:29:42Z). Merge is a
separate exact-SHA Founder act under DEC-20260718-04; this receipt
asserts none.
