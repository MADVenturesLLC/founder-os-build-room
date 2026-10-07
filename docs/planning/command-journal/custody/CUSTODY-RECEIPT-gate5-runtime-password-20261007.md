# CUSTODY RECEIPT — Gate V follow-up, Tranche D: a new password for `br_app_runtime` (2026-10-07)

**This receipt records the landing of two instruments: the Founder's act
for one replacement of the password of `br_app_runtime`, and his
acceptance. It also records what the builder read before, during and
after the replacement. It authorizes nothing: no cutover step 10, no
variable audit (PC-19), no rotation of `neondb_owner` (Gate VI), no
removal of the `pending_cutover` tolerance, no deploy or redeploy, no
merge, and no change to any variable, role, database, workflow, runner,
environment or secret.** Each instrument's own text governs.

## The instruments

Each file is the text of the Founder's message as recorded in the session
transcript, byte for byte, plus one final LF; neither post carried a
final newline.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-gate5-runtime-password-20261007.txt` |
| Git blob id | `0bc6e2e002323f5903d21be0c57d6e9b1e4cffde` |
| SHA-256 | `88b8e1a018ce1679cf217f03807c662af844b1150b5269e420e752c39313f1c8` |
| Bytes | 4756 |
| Lines | 98 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's act for one replacement of the password of `br_app_runtime`, used by the Railway service `rare-enjoyment` at deployed commit `d3d3d1dc946a61ebbabb1f21158a5b4d683728a7`. The builder asked at 09:49:31Z and again at 09:50:17Z whether the Founder wanted such an act; he answered "yes one click at a time please" at 11:25:08Z, and the builder delivered the draft at 11:27:22Z. He posted it in the builder session at 2026-10-07T11:35:03Z. The message's first line was `read`, the instruction for the act's step a, followed by one blank line; neither is part of the act and neither is preserved here. The posted text is byte-identical to the builder's draft. Spent by the acceptance below |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACCEPTANCE-gate5-runtime-password-20261007.txt` |
| Git blob id | `1cf522a609e9087a2b82b91b7241d5661cf8555b` |
| SHA-256 | `6ade280208a2dd0259e614916c3ad69fcc14ef6edbe84f7d98c2efd816d7d920` |
| Bytes | 1369 |
| Lines | 29 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's acceptance, posted at 2026-10-07T16:56:44Z. It accepts the replacement, records and waives three departures (departures 1 to 3 below), spends the act, retires the password set on 2026-10-06, and settles the exposure in departures 3 and 6 of the Gate V receipt for that password only; it states that it does not settle `neondb_owner`'s exposure and authorizes nothing further. Drafted by the builder at 15:53:08Z, after the Founder said he had clicked Run himself (departure 1); the Founder posted it unchanged |

## What happened, in order

All times are UTC on 2026-10-07. Session times are the transcript's;
Railway times are its API's; database times are the database clock or
Neon's API.

| Time | Event | Source |
|---|---|---|
| 11:26:12Z | before drafting: `main` at `d3d3d1dc`, deployment `834d764d` serving, `/health` 200 | GitHub, Railway API, public `/health` |
| 11:35:03Z | act posted, prefixed `read` | session |
| 11:35:27Z to 11:36:21Z | step a: every condition holds. `main` at `d3d3d1dc`, no workflow run queued or in progress; latest deployment `834d764d` SUCCESS at that commit; nothing staged in Railway; `br_app_runtime`'s attributes, memberships, ownership and settings as the Gate V receipt records them; grants equal the pinned matrix (38 relation rows, 23 column `UPDATE` rows); ledger 0001 to 0008; journal empty. Neon's role list shows `br_app_runtime` updated 2026-10-06T11:38:42Z, the Gate V password | GitHub API, Railway API, Neon `run_sql` as `neondb_owner`, Neon API |
| 11:36:57Z | the builder's report; step 1: check Chrome for a debugging bar | session |
| 11:39:12Z | the Founder: `clear` | session |
| 11:39:19Z, 11:39:36Z | step 2: open Railway's variables page, change nothing; the Founder: `railway open` | session |
| 11:39:40Z | step 3: open the Neon SQL Editor on project `founder-os-build-room`, branch `production`; "Don't type or run anything yet" | session |
| 11:39:52Z | **run 1.** The Founder clicks Run in the SQL Editor, which he stated at 15:52:28Z. The run creates the helper function and sets a password. Neon's role list shows `br_app_runtime` updated at 11:39:52Z, and the editor's database session started at 11:39:52.428951Z | Neon API; Neon `run_sql` |
| 11:40:03Z | the Founder: `neon open` | session |
| 11:40:18Z | step 4: paste the statement below and do not click Run yet | session |
| 11:41:49Z | **run 2.** The Founder reports `ERROR: function "set_br_app_runtime_password" already exists with same argument types (SQLSTATE 42723)`: the pasted statement was run and failed at its first command, changing nothing | session |
| 11:42:06Z to 11:42:27Z | the builder's reads: role list still updated 11:39:52Z; the helper function present in `pg_temp_0`, owner `neondb_owner`; a password stored; the running revision still holds its two `br_app_runtime` sessions from 2026-10-06T22:01:57Z and 22:02:07Z | Neon API; Neon `run_sql` |
| 11:42:41Z | step 5: the builder has the Founder run only the statement's last line, once, and copy the value to his private note. The builder did not first ask whether run 1's value had been copied | session |
| 11:43:20Z | **run 3.** The password in force is set | Neon API (role list `updated_at`), read 11:43:46Z |
| 11:43:37Z | the Founder: "copied and pasted got a new pw" | session |
| 11:43:50Z | step 6: change the sealed `DATABASE_URL` to the new value and do not deploy. The builder gave the value's form with the password replaced by a placeholder: user `br_app_runtime`, host `ep-little-meadow-avqfkjcp.c-11.us-east-1.aws.neon.tech`, database `neondb`, parameters `sslmode=require&channel_binding=require`, the ending Gate V's acceptance waived | session |
| 11:44:38Z | staged change set `85f5c4c3` created: one change, to `DATABASE_URL` on `rare-enjoyment`, and nothing else | Railway `get-staged-changes` (value shown as `<redacted>`), read 11:45:05Z |
| 11:45:00Z | the Founder: `saved`, with a screenshot of Railway's variables page: three service variables (`CONTROL_PLANE_TOKEN`, `DATABASE_URL`, `PHASE3_ADJUDICATION_TOKEN`), `DATABASE_URL` with the sealed icon, every value masked, one change staged, no debugging bar | session; the Founder's screenshot |
| 11:45:08Z | step 7: deploy once | session |
| 11:45:48Z | deployment `a1fa2933` created; the Founder writes `deployed` at 11:45:53Z | Railway API; session |
| 11:45:58Z to 11:54:32Z | the builder's reads after the deploy, below | Railway, Neon, public `/health` |
| 11:56:41Z | the builder's report. It led with run 1's timing, asked the Founder to close the Neon tab, and asked whether run 1 was his click | session |
| 12:35:06Z | the Founder: `closed now.` | session |
| 15:50:47Z | the Founder asks whether the builder clicked Run. The builder answers at 15:51:07Z that it did not: no tool in its session operates a browser, it made no tool call between 11:36:21Z and 11:42:06Z, and the change came from the editor's session, not the builder's | session |
| 15:52:28Z | the Founder: "I pressed run" | session |
| 15:53:08Z | the acceptance drafted and delivered | session |
| 16:56:44Z | acceptance posted | session |

The statement for act 1 is the one the Gate V receipt records, unchanged.
It generates the password inside the database, sets it, and returns it
once to the Founder's screen; the password is not in the statement text.
Run 1 executed it; run 2 executed it and failed at `CREATE FUNCTION`
because run 1 had already created the function in the same editor
session. The builder did not see the editor's text at run 1; the function
that run left behind has the statement's name and owner.

```sql
CREATE FUNCTION pg_temp.set_br_app_runtime_password() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  pw text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  EXECUTE format('ALTER ROLE br_app_runtime WITH PASSWORD %L', pw);
  RETURN pw;
END
$$;
SELECT pg_temp.set_br_app_runtime_password() AS new_password;
```

Run 3 executed only the last line, against the function run 1 had left in
that session:

```sql
SELECT pg_temp.set_br_app_runtime_password() AS new_password;
```

## The replacement, as read by the builder

Deployment `a1fa2933-fa0a-49bd-bf61-68ae104f9726`, service
`rare-enjoyment`, environment `production`, commit
`d3d3d1dc946a61ebbabb1f21158a5b4d683728a7`, reason `deploy`, created
11:45:48.680Z, SUCCESS 11:46:32.615Z. Its deploy log, the structured
events verbatim (attributes as Railway returns them):

```text
11:46:25.141Z boot.start         commit "d3d3d1dc946a61ebbabb1f21158a5b4d683728a7" environment "production"
11:46:25.234Z boot.preflight     role "br_app_runtime" migrationsPresent 8 privilegeAudit "enforced" forbiddenAttributes [] forbiddenMemberships []
11:46:25.244Z boot.listening     port 8080
11:47:05.286Z gateway.leadership.serving generation 64
```

No `boot.failed`. The log's error-level lines are the Node warning from
the database driver that the Gate V receipt quotes, emitted at 11:46:25Z.
The log holds no line between 11:47:16Z and 11:51:34Z, when it was read.

| Check | Result | Read at |
|---|---|---|
| `/health` on `rare-enjoyment-production-0869.up.railway.app` | HTTP 200, `{"status":"ok","uptimeSeconds":13}` at 11:46:37Z, which dates the serving process to 11:46:24Z, the new deployment; HTTP 200, uptime 297, at 11:51:20Z | 11:46:37Z, 11:51:20Z |
| host the new deployment resolves | `ep-little-meadow-avqfkjcp.c-11.us-east-1.aws.neon.tech`, no `-pooler`, the same host as before | Railway DNS log, 11:46:35Z |
| the previous deployment | `834d764d` `REMOVED` at 11:46:37Z. Its deploy log from 11:39:00Z to 11:47:30Z holds only its shutdown on `SIGTERM` at 11:46:36Z: no authentication or connection error while the old password was retired | Railway API, deploy log |
| database sessions | `br_app_runtime`: 2, started 11:46:25.211272Z and 11:46:35.273087Z, both after run 3; no `neondb_owner` session from the application. The only `neondb_owner` sessions are the builder's own read session, from 11:36:18Z, and at 11:47:04Z the SQL Editor's, from 11:39:52Z; the editor's is gone at 11:54:32Z | 11:47:04Z, 11:54:32Z |
| `br_app_runtime` | can log in; not superuser; none of `CREATEROLE`, `CREATEDB`, `BYPASSRLS`, `REPLICATION`; no expiry; a password stored, in SCRAM format (read as booleans, never the hash). Memberships, ownership, settings and grants were read at step a, not again; the statement changes only the password | 11:47:04Z; step a 11:36:18Z to 11:36:21Z |
| Neon's role list | `br_app_runtime`, authentication method `password`, updated 11:39:52Z (read 11:42:10Z), then 11:43:20Z (read 11:43:46Z and 11:51:18Z). `neondb_owner` unchanged since 2026-10-02T07:43:14Z | Neon API |
| ledger and journal | ledger 0001 to 0008; journal empty, 0 event rows, head `seq` 0 | 11:47:04Z, 11:54:32Z |
| the helper function | present in the SQL Editor's temporary schema (`pg_temp_0`, owner `neondb_owner`) at 11:42:27Z and 11:47:04Z; gone at 11:54:32Z, with the editor's session | Neon `run_sql` |
| `main` and staging | `main` at `d3d3d1dc` at 11:35:27Z and 11:51:20Z, so no commit reached `main` before act 3; nothing staged in Railway at 11:35:30Z and 11:51:17Z | GitHub, Railway `get-staged-changes` |

Every item of the act's EVIDENCE list is above. The new deployment boots
as `br_app_runtime` with `privilegeAudit` `enforced` and answers `/health`
with 200, so the act's ABORT AND ROLLBACK did not apply.

## Departures and findings

1. **Act 1 ran before the builder gave the statement.** Step 3 said
   "Don't type or run anything yet". The Founder clicked Run at
   11:39:52Z, when the editor opened, 26 seconds before step 4 handed him
   the statement; he stated this at 15:52:28Z, after the builder asked.
   Whether he copied that run's password is not recorded. It stopped
   working at 11:43:20Z, and no session the builder observed was opened
   while it was in force: at 11:42:27Z the only `br_app_runtime`
   sessions were the running revision's, opened on 2026-10-06 with the
   Gate V password, and those at 11:47:04Z were opened after 11:43:20Z.
   Waived by the acceptance, item 1.
2. **Run 2 was clicked before the timed step.** Step 4 said not to click
   Run yet. The run failed at `CREATE FUNCTION` and changed nothing;
   Neon's role list still showed 11:39:52Z at 11:42:10Z. Waived by the
   acceptance, item 2.
3. **Two replacements, not one.** The act authorizes "One replacement of
   the password". The password was replaced at 11:39:52Z and at
   11:43:20Z. The second was the builder's instruction, given without
   first asking whether run 1's value had been copied; had it been, a
   second replacement was not needed. Waived by the acceptance, item 3.
4. **The window between act 1 and act 3 ran six and a half minutes**,
   from 11:39:52Z until the new revision opened its first session at
   11:46:25Z. Throughout it the running revision could not have opened a
   new connection with the password it held; its log records no error in
   that window, and its two existing sessions were still open at
   11:42:27Z.
5. **The new password may have stayed on screen.** Run 3's result was in
   the Neon tab, which the Founder closed after the builder asked
   (`closed now.`, 12:35:06Z). The builder cannot see what the tab showed
   in between. The Founder's 11:45:00Z screenshot is of the Railway tab,
   with every value masked.
6. **The debugging check, and what it does not show.** The Founder
   reported no debugging bar before act 1 (`clear`, 11:39:12Z), and his
   11:45:00Z screenshot shows none. As the Gate V receipt notes, the bar
   can be closed, so its absence does not show that nothing was attached.
   The same screenshot shows an extension icon in the toolbar that looks
   like the Claude in Chrome extension, and Chrome's "Ask Gemini"
   button; the builder named both to the Founder as things that could
   act on a page if driven. Nothing indicates either did, and the Founder
   states he clicked Run himself.
7. **What stays open from Gate V.** The acceptance settles the exposure
   of the 2026-10-06 `br_app_runtime` password only. It does not settle
   `neondb_owner`'s exposure (Gate V departure 6; Gate VI), the change
   to a variable other than `DATABASE_URL` (Gate V departure 3), or the
   unattested reference-variable point (Gate V departure 1).

## What the builder verified and what it did not

- Verified against live systems, read-only: `main` and workflow runs
  (GitHub); deployments, deploy and DNS logs, and staged changes
  (Railway); role attributes, password presence and format, sessions,
  ledger, journal and the helper function (Neon `run_sql` as
  `neondb_owner`); Neon's role list (Neon API); the public `/health`
  endpoint.
- On the Founder's word: that he clicked Run at run 1; that he copied
  run 3's password into his private note and into `DATABASE_URL`; that
  he closed the Neon tab.
- Not read by the builder: any Railway variable value, the old or new
  `DATABASE_URL` included; any password or password hash; the SQL
  Editor's results or text; the Founder's private notes. The builder used
  no Railway call that returns variable values, and ran no SQL in
  production other than read-only reads.

## What this landing does not do

- It edits no code, no workflow and no other custody file. It touches
  `README.md` only to update the status heading's SHA, to record the
  replacement and point at this receipt, and to restate what is not done.
- It authorizes nothing: no cutover step 10, no PC-19 variable audit, no
  rotation of `neondb_owner`, no removal of the `pending_cutover`
  tolerance, no deploy, no merge, no change to any Railway variable.

## Provenance and transport

| Step | Identity |
|---|---|
| Act and acceptance drafted | the `builder` seat, in session: the act after the Founder's "yes one click at a time please" (11:25:08Z), the acceptance after "I pressed run" (15:52:28Z) |
| Act and acceptance posted | the Founder, in session, at 11:35:03Z and 16:56:44Z |
| Password set | the Founder, in the Neon SQL Editor, running the statement above, which returned the password only to his screen |
| `DATABASE_URL` changed and deployed | the Founder, in the Railway dashboard |
| Reads | the builder session, read-only, through the GitHub, Railway and Neon APIs and Neon `run_sql` as `neondb_owner` |
| Transport | files written by the builder from the session texts as recorded in the session transcript, each ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the act's CUSTODY clause (posted
2026-10-07T11:35:03Z) and the acceptance (16:56:44Z). Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
