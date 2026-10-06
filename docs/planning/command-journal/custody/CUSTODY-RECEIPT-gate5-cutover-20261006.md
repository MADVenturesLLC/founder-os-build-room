# CUSTODY RECEIPT — Gate V, Tranche D: the Founder's act, notes and acceptance, and the runtime cutover (2026-10-06)

**This receipt records the landing of four instruments: the Founder's Gate
V act for the runtime cutover, the attestation that stands in for the
act's unfilled Railway attestation, the Founder's note on the first of
three deploys, and the Founder's acceptance. It also records what the
builder read before and after the cutover. It authorizes nothing: no
cutover step 10, no variable audit (PC-19), no rotation of
`neondb_owner` (Gate VI), no removal of the `pending_cutover` tolerance,
no deploy or redeploy, no merge, and no change to any variable, role,
database, workflow, runner, environment or secret.** Each instrument's
own text governs.

## The instruments

Each file is the text of the Founder's message as recorded in the session
transcript, byte for byte, plus one final LF; no post carried a final
newline.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-gate5-cutover-20261006.txt` |
| Git blob id | `dbcdd23fa08d0570c6cb294b61c7d07bc31614f5` |
| SHA-256 | `47ed3eb2f7c9f6142dccd6f16d8a4a3dd5003318d914bd9d6f8668f54a9ea0e4` |
| Bytes | 13664 |
| Lines | 244 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's Gate V act for the runtime cutover at deployed commit `9f39f4bb9afd49b1ad4f8f8650642eab7af2f946`, drafted by the builder at the Founder's direction ("draft the Gate V act", 2026-10-05) and posted by the Founder in the builder session at 2026-10-06T08:34:42Z. The message's first line was `read`, the instruction for the act's step a; that line is not part of the act and is not preserved here. The posted text is byte-identical to the builder's draft (same SHA-256 as the draft the builder delivered): the two Railway-attestation placeholders `<<DATE>>` and `<<HH:MM>>` were posted unfilled, and the date line reads `2026-10-05 (UTC)` although the act was posted on 2026-10-06. Spent by the acceptance below |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ATTESTATION-gate5-railway-20261006.txt` |
| Git blob id | `23391576c651eb3f659542f9257d3a2db7a78b9e` |
| SHA-256 | `6e64c0cda52cb77abd31d82c1c1354fce55f3dfa2876144b1da798c4ecd4b0c4` |
| Bytes | 410 |
| Lines | 8 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's attestation, posted at 2026-10-06T10:17:39Z, standing in for the act's unfilled Railway attestation. For Railway it relies on the builder's names-only read of 2026-10-06 at about 09:19Z; it attests on the Founder's own word that he can restore the prior value of `DATABASE_URL` himself. Drafted by the builder after the Founder asked whether the builder could look at the Railway dashboard (09:19:14Z) |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-NOTE-gate5-deploys-20261006.txt` |
| Git blob id | `33b29ceb946f143f0c8d22d6c82aa616adbada96` |
| SHA-256 | `a07daede818da4799d61b343a6c349090ce9a6cc29d244b5f6cda1b14c4344e0` |
| Bytes | 335 |
| Lines | 6 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's note, posted at 2026-10-06T12:00:37Z, recording the 11:53Z deploy (`a8e1809e`) as his mistake and continuing under the act with one more deploy. Drafted by the builder; the Founder posted it unchanged |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACCEPTANCE-gate5-cutover-20261006.txt` |
| Git blob id | `e372235779efd2a451df40c82a8ffabf87911c11` |
| SHA-256 | `9d211983fb0d4b7c6858ccd93743502faf13c36c3400ab1d7e28cc0a0928ecba` |
| Bytes | 549 |
| Lines | 9 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's acceptance, posted at 2026-10-06T12:12:03Z after the builder's report. It accepts the cutover, waives two differences from the act (the ending of the new `DATABASE_URL`, and three deploys instead of one), states that ChatGPT did no clicking or copying during the work, and authorizes no step 10. Under the act's ACCEPTANCE clause, the act is spent. Drafted by the builder; the Founder posted it unchanged |

## What happened, in order

All times are UTC on 2026-10-06 unless stated. Session times are the
transcript's; Railway times are its API's; database times are the
database clock.

| Time | Event | Source |
|---|---|---|
| 08:34:42Z | act posted, prefixed `read` | session |
| 08:36:25Z to 08:43:53Z | step a: every condition holds. `main` at `9f39f4bb`, no commit since 2026-10-05T00:20:13Z, no open pull request, no workflow run queued or in progress; latest deployment `d79ee5ac` SUCCESS at that commit; ledger 0001 to 0008; `br_app_runtime` attributes, memberships, reach, ownership and settings as in the act's WHY; grants equal the pinned matrix (38 relation rows, 23 column `UPDATE` rows); journal empty | GitHub API, Railway API, Neon `run_sql` as `neondb_owner` |
| 09:06:48Z, 09:19:14Z | the Founder asks for the steps to be made easier, then whether the builder can look at the Railway dashboard | session |
| about 09:19Z | builder's names-only Railway read: service `rare-enjoyment` has `CONTROL_PLANE_TOKEN`, `DATABASE_URL`, `PHASE3_ADJUDICATION_TOKEN`; the environment has no shared variables and one service; nothing staged | Railway `describe-service`, `describe-environment`, `get-staged-changes`, which return names, never values |
| 10:17:39Z | attestation posted | session |
| 10:18:40Z, 10:18:59Z | re-check: nothing changed | GitHub API, Railway API, Neon |
| 10:35:40Z | the Founder writes `Go`; the builder runs step c (10:36:35Z to 10:49:56Z): Neon's role list still shows `br_app_runtime` with authentication method `no_login`; STOP | Neon API, Neon `run_sql` |
| 10:50:44Z | the Founder writes `act 1 done`; step c again (10:51:23Z to 10:52:05Z): no password stored for `br_app_runtime`, and Neon's operations log shows no operation in the project since 2026-10-04T04:00:22Z; STOP | Neon `run_sql` (booleans only), Neon API |
| 11:13:41Z to 11:25:52Z | walk-through by screenshot. The Founder's console was in project `madventures_os`; he switched to `founder-os-build-room`. He stated he reset nothing in `madventures_os` (11:16:21Z). On the `br_app_runtime` row, Neon's **Reset password** refused with `cannot update password for role without password` | session; the Founder's screenshots |
| 11:38:42Z | act 1: the password is set by the SQL statement below, run by the Founder in the Neon SQL Editor | Neon role list `updated_at`; `pg_authid` read at 11:39:27Z |
| 11:39:27Z to 11:42:42Z | step c: every condition holds, and Neon's role list shows `br_app_runtime` with authentication method `password`; GO | GitHub API, Railway API, Neon |
| 11:51:43Z | screenshot: a new variable named `br_app_runtime` staged on the service instead of a change to `DATABASE_URL`, shown with the icon of an unsealed variable | the Founder's screenshot |
| 11:53:01Z | deployment `a8e1809e` (SUCCESS 11:54:17Z) carries that variable; `boot.preflight` 11:54:11.957Z: role `neondb_owner`, `privilegeAudit` `pending_cutover` | Railway API, deploy log |
| 11:55:04Z | the Founder: "I changed database url to the br_app_runtime link with pw. was that what you needed me to add to new variable?" | session |
| 11:57:19Z | the Founder: "okay deleted and changed the URL back to original." At 11:57:45Z the staged change set (created 11:54:11Z, updated 11:57:02Z) holds one change, the removal of `br_app_runtime`, and none to `DATABASE_URL` | session; Railway `get-staged-changes` |
| 12:00:37Z | note posted | session |
| 12:00:45Z | deployment `b40118f2` (SUCCESS 12:01:24Z) removes the variable; `boot.preflight` 12:01:19.851Z: role `neondb_owner`, `pending_cutover` | Railway API, deploy log |
| 12:02:59Z | the Founder shows the new value's shape, its password replaced by a placeholder: user `br_app_runtime`, host `ep-little-meadow-avqfkjcp.c-11.us-east-1.aws.neon.tech`, database `neondb`, parameters `sslmode=require&channel_binding=require` | session |
| 12:03:28Z | staged: `DATABASE_URL` with a new value, sealed | Railway `get-staged-changes` (value shown as `<redacted>`) |
| 12:03:55Z | screenshot received: one staged change, `DATABASE_URL` shown sealed, and Chrome's bar `"ChatGPT" started debugging this browser` | the Founder's screenshot |
| 12:04:40Z | the builder: click Cancel on that bar first, do not deploy, and say whether ChatGPT did any of the clicking or copying | session |
| 12:05:06Z | deployment `aae63936`, the cutover (SUCCESS 12:05:47.517Z); the Founder writes `deployed` at 12:05:11Z | Railway API; session |
| 12:08:53Z to 12:10:00Z | the builder's reads after the cutover, below | Neon, Railway, public `/health` |
| 12:10:45Z | the builder's report, asking whether ChatGPT did any clicking or copying while the password was on screen | session |
| 12:11:24Z | the Founder: ChatGPT did no clicking or copying ("no it was me") | session |
| 12:12:03Z | acceptance posted | session |
| after 12:12Z | the Founder reports he removed the ChatGPT browser extension "just incase" | session |

The statement the Founder ran for act 1. It generates the password inside
the database, sets it, and returns it once to the Founder's screen. The
password is not in the statement text, so the statement the editor keeps
in its history carries none; whether the editor also keeps results, the
builder did not check. The builder tested this exact text on a scratch
PostgreSQL 16 instance before giving it (password set, SCRAM, no function
left after the session).

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

## The cutover, as read by the builder

Deployment `aae63936-4c19-4e9c-a289-53d3246edd52`, service
`rare-enjoyment`, environment `production`, commit
`9f39f4bb9afd49b1ad4f8f8650642eab7af2f946`, reason `deploy`, created
12:05:06.528Z, SUCCESS 12:05:47.517Z. Its deploy log, the structured
events verbatim (attributes as Railway returns them):

```text
12:05:38.065Z boot.start         commit "9f39f4bb9afd49b1ad4f8f8650642eab7af2f946" environment "production"
12:05:38.227Z boot.preflight     role "br_app_runtime" migrationsPresent 8 privilegeAudit "enforced" forbiddenAttributes [] forbiddenMemberships []
12:05:38.237Z boot.listening     port 8080
12:06:28.300Z gateway.leadership.serving generation 62
```

No `boot.failed`. The log's error-level lines are one Node warning from
the database driver, emitted at 12:05:38Z; its first line, verbatim:
`(node:15) Warning: SECURITY WARNING: The SSL modes 'prefer', 'require',
and 'verify-ca' are treated as aliases for 'verify-full'.` The rest of
it says that `pg` v9 will give those modes libpq's weaker meaning and
advises `sslmode=verify-full` to keep today's behaviour.

| Check | Result | Read at |
|---|---|---|
| `/health` on `rare-enjoyment-production-0869.up.railway.app` | HTTP 200, `{"status":"ok","uptimeSeconds":245}`, which dates the serving process to 12:05:37Z, the new deployment | 12:09:42Z |
| host the new deployment resolves | `ep-little-meadow-avqfkjcp.c-11.us-east-1.aws.neon.tech`, no `-pooler`, the same host as before (12:05:38Z and 12:05:48Z) | Railway DNS log |
| database sessions | `br_app_runtime`: 2, started 12:05:38.192Z and 12:05:48.264Z; no `neondb_owner` session from the application (the only one is the builder's own read session) | 12:08:53Z |
| `br_app_runtime` | can log in; not superuser; none of `CREATEROLE`, `CREATEDB`, `BYPASSRLS`, `REPLICATION`; no membership at any depth; reaches no other role by `USAGE`, `MEMBER` or `SET`; owns no relation; no role-level or database-level setting; cannot create in schema `public` or set `session_replication_role`; password set, SCRAM, no expiry | 12:09:58Z (attributes), 11:39:27Z (password) |
| grants | equal the matrix pinned in `test/runtime-role-boot.storage.test.ts`: 38 of 38 relation rows, 23 of 23 column `UPDATE` rows, none missing, none unexpected, no grant option, nothing to `PUBLIC`, nothing on the Neon sample table | 12:10:00Z |
| ownership | the database owned by `neondb_owner`; the journal tables by `br_journal_owner`; `command_journal_append` by `command_journal_writer`, its ACL unchanged and without a `PUBLIC` entry | 12:09:58Z |
| ledger and journal | ledger 0001 to 0008; journal empty, 0 event rows, head `seq` 0 with the 64-zero genesis hash | 12:08:53Z, 12:09:58Z |
| the helper function from act 1 | present in the SQL Editor's temporary schema (`pg_temp_14`, owner `neondb_owner`) at 11:42:42Z; gone at 12:09:58Z | Neon |
| Neon's role list | `br_app_runtime`, authentication method `password`, updated 11:38:42Z | Neon API, 11:39Z |

Against plan r1: PC-0 (the role in the application's own connection is
`br_app_runtime`) and PC-20 (it boots and serves holding only that role)
are observed; PC-1 to PC-4 hold after act 3, so S9 is cleared on
observation. PC-24 holds from the catalog: no role-level or
database-level setting exists, so the session `search_path` is the
server default. PC-10 to PC-15 and PC-17 stand as the act ruled: refusals
observed in CI on PostgreSQL 16, catalog-proven in production. PC-19 and
cutover step 10 are not done.

## Departures and findings

1. **The act's Railway attestation was posted unfilled.** The builder
   reported it at 08:43Z; the attestation instrument above replaces it,
   relying on the builder's names-only read. No variable value was read.
2. **Act 1 was done by SQL, not by the console.** Neon's console refuses
   to reset a password for a role that has none; the builder had flagged
   this as unmeasured when it drafted the act. Two earlier messages
   (`Go`, 10:35:40Z; `act 1 done`, 10:50:44Z) preceded any password; the
   builder answered STOP both times from live reads.
3. **Three deploys instead of one.** 11:53Z added a variable named
   `br_app_runtime`; 12:00Z removed it; 12:05Z changed `DATABASE_URL`.
   The Founder waived the three deploys in the acceptance, and his note
   records the first. The acceptance does not address what follows. The
   extra variable was unsealed, by its icon in the Founder's 11:51:43Z
   screenshot (`{}`, where the sealed `DATABASE_URL` in his 12:03:55Z
   screenshot shows a struck-through eye), and his message at 11:55:04Z
   indicates it held the `br_app_runtime` connection string with the
   new password. The builder never read its value. If it held the
   password, that password was readable in Railway, as unsealed values
   are, from about 11:51Z until 12:00:45Z.
   Deployment `a8e1809e` is now `REMOVED`; whether Railway keeps that
   variable in the removed deployment's snapshot is not known to the
   builder.
4. **Sealing.** The note says `DATABASE_URL` would be sealed after the
   builder confirmed the cutover. It was sealed before the 12:05Z
   deploy, which is what the act itself says.
5. **The ending of the new `DATABASE_URL` differs from the old one.**
   The driver warning above appears in `aae63936`'s log and in no
   earlier deployment's log (`d79ee5ac`, `a8e1809e`, `b40118f2`, same
   commit), so the old value did not carry `sslmode=require`. Effect
   today: none adverse; driver `pg` 8 treats `require` as
   `verify-full`. Waived by the Founder. Follow-up, not authorized
   here: if `pg` is ever upgraded to v9, the same change should set
   `sslmode=verify-full`.
6. **A ChatGPT browser extension was attached to the Founder's
   browser.** Chrome's bar `"ChatGPT" started debugging this browser` is
   in the screenshot received at 12:03:55Z. It is not in the screenshots
   of 11:39:12Z, 11:47:46Z and 11:51:43Z, but the bar can be closed, so
   its absence does not show that nothing was attached then. An
   extension debugging the browser can read what its pages show. In
   this work those pages showed, or would have shown when opened, the
   new password (the SQL Editor's result, the extra variable, Railway's
   edit box when `DATABASE_URL` was changed) and the old `DATABASE_URL`
   with `neondb_owner`'s password (the same edit box, before the value
   was replaced). The Founder states that ChatGPT did no clicking or
   copying and that he removed the extension afterwards. The builder
   asked about clicking and copying, not reading, and can observe none
   of it. Whether the extension read either credential is not known.
   The remedy, which nothing here authorizes, is a new password for
   `br_app_runtime` and Gate VI's rotation of `neondb_owner`.
7. **Wrong Neon project, briefly.** At 11:13:41Z the Founder's console
   was in project `madventures_os`; he states he reset nothing there. The
   builder did not read that project.
8. **Correction to the Gate IV receipt** for `0008`
   (`docs/planning/command-journal/custody/CUSTODY-RECEIPT-gate4-0008-20261004.md`,
   which is not edited). It says `pg_authid` is unreadable to
   `neondb_owner`. It is readable: `neondb_owner` holds
   `pg_read_all_data` through `neon_superuser`. On 2026-10-06 the builder
   read from it only whether a password is stored, whether it is in
   SCRAM format, and its expiry; never a hash.
9. **`pg_stat_ssl` shows `ssl = false` for every session**, the
   builder's own TLS connection included. Neon's proxy terminates TLS and
   the compute sees the proxy's connection, so this is not evidence of a
   plaintext client connection; the driver warning shows the client
   requires full certificate verification.

## What the builder verified and what it did not

- Verified against live systems, read-only: `main`, pull requests and
  workflow runs (GitHub API); deployments, deploy and DNS logs, staged
  changes and variable names (Railway); role state, grants, ownership,
  settings, sessions, ledger and journal (Neon `run_sql` as
  `neondb_owner`); Neon's role list and operations log (Neon API); the
  public `/health` endpoint.
- On the Founder's word: that he can restore the prior `DATABASE_URL`;
  that he reset nothing in `madventures_os`; that ChatGPT did no clicking
  or copying; that he removed the extension.
- Not read by the builder: any Railway variable value (the old or new
  `DATABASE_URL`, the extra variable, the tokens); any password or
  password hash; the SQL Editor's result; the Founder's private notes;
  project `madventures_os`. The builder used no Railway call that
  returns variable values.

## What this landing does not do

- It edits no code, no workflow and no other custody file. It touches
  `README.md` only to update the status heading's SHA, to record the
  cutover and point at this receipt, and to restate what is not done.
- It authorizes nothing: no cutover step 10, no PC-19 variable audit, no
  rotation of `neondb_owner`, no removal of the `pending_cutover`
  tolerance, no deploy, no merge, no change to any Railway variable.

## Provenance and transport

| Step | Identity |
|---|---|
| Act drafted | the `builder` seat, in session, at the Founder's direction, 2026-10-05 |
| Act posted | the Founder, in session, 2026-10-06T08:34:42Z |
| Attestation, note and acceptance drafted | the `builder` seat, in session, each at the Founder's request or after his question |
| Attestation, note and acceptance posted | the Founder, in session, at 10:17:39Z, 12:00:37Z and 12:12:03Z |
| Password set | the Founder, in the Neon SQL Editor, running the builder's statement, which returned the password only to his screen |
| `DATABASE_URL` changed, sealed, deployed | the Founder, in the Railway dashboard |
| Reads | the builder session, read-only, through the GitHub, Railway and Neon APIs and Neon `run_sql` as `neondb_owner` |
| Transport | files written by the builder from the session texts as recorded in the session transcript, each ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the act's CUSTODY clause (posted
2026-10-06T08:34:42Z) and the acceptance (12:12:03Z). Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
