# CUSTODY RECEIPT — Tranche E, Gate VI: rotation of `neondb_owner` (cutover step 14) (2026-10-09)

**This receipt records the landing of four instruments: the Founder's
Gate VI act for rotating the password of `neondb_owner` and replacing
the one copy the protected administrative plane holds, his two rulings
that each extended the act by one proving run, and his acceptance,
which declares custody of `neondb_owner` remediated under r6 section
15. It also records the builder's reads, the four proving runs and why
three of them failed, and the credentials that reached runner jobs by
mistake. It authorizes nothing: no new `br_app_runtime` password, no
rotation of any other credential, no removal of the `pending_cutover`
tolerance, no sealing of the two Railway tokens, no migration, no
change to the environment, its reviewers or any workflow, no deploy,
no merge.** Each instrument's own text governs.

## The instruments

Each file is the text of the Founder's message as recorded in the session
transcript, byte for byte, plus one final LF; no post carried a final
newline.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-gate6-neondb-owner-rotation-20261009.txt` |
| Git blob id | `ba2ce111658a969c6b60028568781fb589043130` |
| SHA-256 | `40ced8935893b94eaf0bc5c125ca4dc9e23d48ee135e9de55ae0d30a884c2ea8` |
| Bytes | 8605 |
| Lines | 155 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's Gate VI act at `main` `a9aefb34cf45145bedec6bd202394fdb91f6b547`: three acts by his own hands in a Chrome Guest window (reset `neondb_owner`'s password in Neon; a proving run P3 under the superseded secret, to be refused; update `MIGRATE_ADMIN_DATABASE_URL` and a proving run P4, to be a recorded no-op). The builder drafted it after PR #101 merged; the Founder told the builder to read at 00:52:47Z, and the builder found every condition holding and changed the draft's date line to 2026-10-09 because UTC had rolled over. He posted it in the builder session at 2026-10-09T01:58:27Z, byte-identical to the dated draft. Extended twice by the rulings below; spent by the acceptance |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-gate6-extension-1-20261009.txt` |
| Git blob id | `4156a0b8ea9b16893f5fe85d74ad926e69aaa246` |
| SHA-256 | `2d261fec5ef09b7691dc2f2620d795782ef6775305065bf57f82c137b57455d6` |
| Bytes | 192 |
| Lines | 3 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's first extension, posted at 2026-10-09T11:12:10Z after P4 had failed twice, the act's limit ("At most twice; then I stop"). It allows one further P4 after he corrected the secret. The builder had declined to dispatch on "correcting now" alone and drafted this wording; the Founder posted it unchanged |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-gate6-extension-2-20261009.txt` |
| Git blob id | `df26b7f86f6003747274b73d7712f4ee5f1d52d7` |
| SHA-256 | `cbadab095a599373eae7664112baeecd3f73662cc9dba80f2f3446bea631b0e6` |
| Bytes | 256 |
| Lines | 4 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's second extension, posted at 2026-10-09T11:26:55Z after the run allowed by the first had failed, its own stop line ("If it fails, I stop"). It states that the string saved at 11:11:40Z logged in as `br_app_runtime` and allows one further P4. Drafted by the builder; posted unchanged |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACCEPTANCE-gate6-neondb-owner-rotation-20261009.txt` |
| Git blob id | `11045302a1647d41fd90e2e65faa7b09bab42916` |
| SHA-256 | `aeea24ef5df5c3fdfc4dca30cfc8db9c4377e710742dd51ce7277cd95819f36f` |
| Bytes | 1764 |
| Lines | 36 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's acceptance, posted at 2026-10-09T11:43:05Z. It records the departures, records conditions 5, 6 and 7 of r6 section 15 observed, declares custody of `neondb_owner` remediated, spends the act, and lists what stays open. Drafted by the builder at about 11:33Z; the Founder posted it unchanged |

## What happened, in order

All times are UTC on 2026-10-09. Session times are the transcript's;
GitHub and Neon times are their APIs'; database times are the database
clock.

| Time | Event | Source |
|---|---|---|
| 00:52:47Z | the Founder: `read`, before posting the act; the builder reads every condition at 00:53Z to 00:56Z and reports them holding | session; GitHub, Railway, Neon |
| 01:58:27Z | act posted | session |
| 02:00:23Z | the Founder: "in guest, signed in" | session |
| 02:24:33Z, 02:25:08Z | two screenshots from the Guest window: the project's branch list, then its Roles page; neither shows a credential. The builder asks for none after the second | session |
| 02:41:28Z | **act 1**: `neondb_owner`'s password reset in Neon (the role entry's `updated_at`) | Neon API |
| 02:41:52Z | the Founder: "reset done, screen closed" | session |
| 02:42:17Z | **P3**, run 37875825882, dispatched by the builder as `decivantiq` | GitHub API |
| 02:43:16Z | the Founder: "P3 approved"; at 02:45:28Z the run is still waiting with no approval record | session; GitHub API |
| 02:46:23Z | the Founder: "P3 approved as daley40-lab" | session |
| 02:46:35Z | P3's apply step: `could not connect to the administrative database (code 28P01)`; nothing ran | job log |
| 03:10:36Z | **act 3, first save**: the secret updated to a string for another Neon endpoint, `ep-withered-bonus-au1982ty.c-10…`, database `Evidence` | the Founder's read at 03:11:12Z; his statement at 11:09:16Z |
| 03:11:47Z | **P4 (1)**, run 37878149940; approved by `daley40-lab`; apply step 03:13:14Z: `one tranche per run … would apply 8 migrations … nothing applied` | GitHub API, job log |
| 10:27Z to 10:55Z | the builder's reads: the runner logged in where no ledger exists; the branch lists one database, `neondb` | Neon |
| 10:59:55Z, 11:00:08Z | the Founder: "I fixed the secret", then "continue with p4"; the builder had asked for the read block first and did not get it | session |
| 11:00:19Z | **P4 (2)**, run 37921057895; approved; apply step 11:01:20Z: the same refusal. The secret had not changed: the next save is 11:11:40Z | GitHub API, job log |
| 11:09:16Z | the Founder shows the saved string's host and database, password and user omitted | session |
| 11:11:40Z | **second save**: production's host and database `neondb`, but as `br_app_runtime` | the Founder's read at 11:12:43Z; his ruling at 11:26:55Z |
| 11:12:10Z | first extension posted | session |
| 11:13:18Z | **P4 (3)**, run 37922388864; approved; apply step 11:21:17Z: `migration failed (code 42501)` | GitHub API, job log |
| 11:24:47Z | the builder's read: of the two roles, only `neondb_owner` may create in schema `public` | Neon |
| 11:26:45Z | **third save**: production's `neondb_owner` string | the Founder's read at 11:27:36Z |
| 11:26:55Z | second extension posted | session |
| 11:28:49Z | **P4 (4)**, run 37923976750; approved by `daley40-lab`; every step succeeds, apply step 11:29:59Z to 11:30:01Z; run `success` | GitHub API |
| 11:31:45Z to 11:32:03Z | the builder's reads: production unchanged; the service unchanged; only `neondb_owner` among login roles may create in `public` | Neon, public `/health`, GitHub |
| 11:43:05Z | acceptance posted | session |

## The four proving runs

Each was dispatched by the builder as `decivantiq` on `main` with
`founder_authorized_sha` `a9aefb34cf45145bedec6bd202394fdb91f6b547` and
`tranche_id` `0008_runtime_operational_grants`. Each passed `preflight`;
each pending-deployment record listed reviewers `decivantiq` and
`daley40-lab` and denied approval to `decivantiq`
(`current_user_can_approve` false); each approval record names
`daley40-lab`.

| Run | Secret it ran under | Apply step's line | Meaning |
|---|---|---|---|
| P3 37875825882 | the pre-rotation string, superseded password | `could not connect to the administrative database (code 28P01)` | the superseded password is refused (condition 6) |
| P4 37878149940 | `ep-withered-bonus`, database `Evidence` (saved 03:10:36Z) | `one tranche per run: … would apply 8 migrations …; nothing applied` | logged in to a database with no ledger; one read, no write |
| P4 37921057895 | the same string; the correction came later | the same refusal | the same |
| P4 37922388864 | production `neondb` as `br_app_runtime` (saved 11:11:40Z) | `migration failed (code 42501); the migrator rolled back the failing entry` | read the ledger, then refused the migrator's first statement, `CREATE TABLE IF NOT EXISTS schema_migrations`, which needs create rights in `public` |
| P4 37923976750 | production `neondb` as `neondb_owner` (saved 11:26:45Z) | none; every step `success` | the replacement works in the plane; re-selecting the applied 0008 is a recorded no-op (`migrate-cli.ts` rule 5) |

The runner's code (`packages/control-plane/src/migrate-cli.ts`) opens
a connection, checks whether `schema_migrations` exists with one read,
and refuses before the migrator when more than one migration would
apply; that is why the two runs against `Evidence` wrote nothing. The
migrator (`packages/control-plane/src/migrations.ts`, `migrate()`)
takes an advisory lock and runs `CREATE TABLE IF NOT EXISTS
schema_migrations` before reading the ledger; that is why the
`br_app_runtime` run failed with 42501 and why only `neondb_owner` can
pass it.

## Production and the service, as read by the builder

| Read at (database clock unless noted) | `schema_migrations` | `0008` `applied_at` | journal | sessions |
|---|---|---|---|---|
| 00:56:08Z (step a) | 0001 to 0008 | `2026-10-04T21:08:29.242Z` | 0 events, head seq 0 | `br_app_runtime` 2, from 22:14:08Z and 22:14:18Z on 2026-10-08 |
| 02:42:05Z (after act 1) | 0001 to 0008 | not read | 0 events | the same two |
| 02:47:00Z (after P3) | 0001 to 0008 | unchanged | 0 events | the same two |
| 10:07:01Z, 11:06:49Z, 11:21:37Z (after each failed P4) | 0001 to 0008 | unchanged | 0 events | the same two |
| 11:31:45Z (after the last P4) | 0001 to 0008, 8 rows | unchanged | 0 events, head seq 0 | the same two |

Neon's role entries: `neondb_owner` `updated_at` 2026-10-02T07:43:14Z
at step a and 2026-10-09T02:41:28Z from act 1 on; `br_app_runtime`
2026-10-07T11:43:20Z throughout. The service: deployment `23f60ea5` at
`a9aefb34`, nothing staged in Railway at step a; `/health` 200 at
00:53:11Z and at 11:31:46Z, both from the process started on
2026-10-08 at 22:14Z. `main` stayed at `a9aefb34` throughout.

## The Founder's environment reads (condition 7)

The builder's session cannot read the environment or the secret lists
(the proxy returns 403), so the Founder ran the step 13 read block in
his own terminal and pasted its output three times. It prints names,
settings and dates, never values.

| `date -u` | `MIGRATE_ADMIN_DATABASE_URL` `updated_at` | everything else |
|---|---|---|
| 03:11:12Z | 03:10:36Z | `can_admins_bypass` false; one `required_reviewers` rule, `prevent_self_review` true, reviewers `decivantiq` and `daley40-lab`, no wait timer; a branch policy allowing only `main`; repository secrets by name `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_REVIEWER_APP_ID`, `CLAUDE_REVIEWER_APP_PRIVATE_KEY`, `GEMINI_API_KEY`, `GEMINI_REVIEWER_APP_ID`, `GEMINI_REVIEWER_APP_PRIVATE_KEY`; organization secrets by name `CLAUDE_CODE_OAUTH_TOKEN` |
| 11:12:43Z | 11:11:40Z | identical |
| 11:27:36Z | 11:26:45Z | identical |

Everything but the secret's date matches the read of 2026-10-08 at
16:16Z recorded in the step 13 receipt. The administrative credential
is at environment scope only, by name; GitHub secrets are write-only,
so no read can show that a differently named secret does not hold the
same value.

## Against r6 section 15

- Condition 5, the owner credential rotated under separate Founder
  authority: observed. The act, act 1 by the Founder's hand, and
  Neon's record of the change at 02:41:28Z.
- Condition 6, the superseded credential no longer authenticates:
  observed. P3 was refused with 28P01 under the pre-rotation secret,
  produced by the platform with no one handling the credential.
- Condition 7, the replacement exists only in the protected custody
  plane: observed. At environment scope only by the 11:27:36Z read,
  and shown to work by the last P4. Outside the plane the new password
  exists in the Founder's private note and in Neon, which manages it.

With conditions 1 to 4 observed earlier (Gate V, step 10, step 13),
the Founder declared custody of `neondb_owner` remediated. S13 is
cleared by that declaration, made after all seven conditions were
recorded.

## Departures and findings

1. **Two credentials that do not belong in the plane reached runner
   jobs.** A credential for the endpoint `ep-withered-bonus-au1982ty`,
   database `Evidence`, sat in the secret from 03:10:36Z to 11:11:40Z
   and reached two approved runs, masked. Each ran one read there.
   `br_app_runtime`'s production string sat there from 11:11:40Z to
   11:26:45Z and reached one approved run, masked, which read the
   ledger. Neither is in the secret now. The builder does not know
   which Neon project owns `ep-withered-bonus` and did not look. The
   acceptance leaves both for the Founder's own acts.
2. **P4 ran four times under an act that allowed two.** The act said
   "At most twice; then I stop." The Founder lifted that limit twice,
   by the two rulings above, each in his own words and each for one
   run. After the second failure the builder had drafted a stop record
   instead, recording condition 7 as not observed; the Founder chose
   to correct the secret and extend.
3. **The second P4 ran before any correction.** At 10:59:55Z the
   Founder said the secret was fixed and at 11:00:08Z said to
   continue. The builder had asked for the read block first and
   dispatched without it. The later read shows the next save at
   11:11:40Z, so that run used the 03:10:36Z string. From the first
   extension on, the builder dispatched only after a read showing a
   new `updated_at`.
4. **The guidance for the first save was incomplete.** The builder's
   instruction at 02:47:40Z named the environment and secret but did
   not ask the Founder to compare the copied string's host, database
   and role with production's before saving. Its instruction at
   10:57:17Z did name host, database, role and pooling; the 11:11:40Z
   save still carried the wrong role. The fourth save followed a check of the
   string's start, `postgresql://neondb_owner:`.
5. **The first approval of P3 did not register**, the same pattern as
   the first reported rejection in step 13. The second, made after the
   builder asked the Founder to confirm the signed-in account, did.
6. **Screenshots.** Two screenshots from the Guest window reached the
   session at 02:24Z and 02:25Z, before the reset; they show the
   branch list and the Roles page and no credential. None followed.
7. **The last run's evidence document was not read.** The runner
   writes its stage-5 JSON to the run summary, which the builder's
   API access does not return. The ledger reads and the run's
   conclusion stand in for it.
8. **The deleted authorization comment on PR #101.** The act's CUSTODY
   clause asks this receipt to record it. The Founder's first merge
   authorization for PR #101, comment 6069454554, was posted from
   `daley40-lab` at 2026-10-08T21:32:03Z; the `founder-authorization`
   check recognizes only `decivantiq` and stayed red. The comment was
   deleted at 22:11:32Z (the PR timeline's `comment_deleted` event),
   and the `decivantiq` comment 6070046912, byte-identical to the
   builder's draft once CR bytes are removed, followed at 22:11:37Z.
   The text of the deleted comment survives in this session's
   transcript.
9. **Rollback copies of the old credential are now useless.** The
   three pre-cutover deployments that Railway still offers for
   rollback carry `neondb_owner`'s pre-rotation password, which no
   longer authenticates.

## What the builder verified and what it did not

- Verified against live systems, read-only: `main` and the workflow
  blob (git); deployments and staged changes (Railway, names only);
  the runs, jobs, steps, approvals, pending deployments and job logs
  (GitHub API); role entries, databases, compute endpoints, ledger,
  journal, sessions and schema privileges (Neon API and `run_sql` as
  `neondb_owner`); the public `/health` endpoint.
- Dispatched by the builder, under the act and the two rulings: P3 and
  the four P4 runs, through the GitHub API as `decivantiq`. The builder
  approved or rejected nothing and holds no credential that can.
- On the Founder's word: that he worked in a Chrome Guest window with
  no extension; that the reset's password went only into his note and
  the secret; the three environment reads; the hosts, databases and
  roles of the strings he saved.
- Not read by the builder: any password, connection string or secret
  value; the environment and secret lists (403); the runs' summary
  pages; Neon's connection logs, which returned nothing for the run
  windows.

## What this landing does not do

- It edits no code, no workflow and no other custody file. It touches
  `README.md` only to record Gate VI and point at this receipt, and to
  restate what is not done.
- It authorizes nothing: no new `br_app_runtime` password, no rotation
  of the `ep-withered-bonus` credential or any other, no removal of
  the `pending_cutover` tolerance, no sealing of the tokens, no deploy,
  no merge.

## Provenance and transport

| Step | Identity |
|---|---|
| Act, rulings and acceptance drafted | the `builder` seat, in session |
| Act, rulings and acceptance posted | the Founder, in session, at 01:58:27Z, 11:12:10Z, 11:26:55Z and 11:43:05Z |
| Reset and secret saves | the Founder, by hand, in Neon and GitHub |
| Environment reads | the Founder, in his own terminal |
| Dispatches | the builder session, through the GitHub API as `decivantiq` |
| Approvals | `daley40-lab`, on the run pages, recorded by the platform |
| Reads | the builder session, read-only, through the GitHub, Railway and Neon APIs and Neon `run_sql` as `neondb_owner` |
| Transport | files written by the builder from the session texts as recorded in the session transcript, each ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the act's CUSTODY clause (posted
2026-10-09T01:58:27Z) and the acceptance (11:43:05Z). Merge is a
separate exact-SHA Founder act under DEC-20260718-04; this receipt
asserts none.
