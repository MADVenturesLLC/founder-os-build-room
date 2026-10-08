# CUSTODY RECEIPT — Tranche D, cutover step 10: the administrative credential absent from Railway (PC-19) (2026-10-08)

**This receipt records the landing of two instruments: the Founder's act
for cutover step 10, an audit proving that `neondb_owner`'s credential is
absent from the Railway application environment, and his acceptance. It
also records what the builder read. It authorizes nothing: no rotation of
`neondb_owner` (Gate VI), no change to the `db-admin-migration` secret, no
new `br_app_runtime` password, no removal of the `pending_cutover`
tolerance, no sealing of the two tokens, no deploy, redeploy or rollback,
no merge, and no change to any variable, role, database, workflow, runner,
environment or secret.** Each instrument's own text governs.

## The instruments

Each file is the text of the Founder's message as recorded in the session
transcript, byte for byte, plus one final LF; neither post carried a
final newline.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-step10-pc19-20261008.txt` |
| Git blob id | `fc026704c6e07209f16f1057777862e7f7fdf3e2` |
| SHA-256 | `8bb46182ff964c38209a1fb0d134fbab0ad9db7f3cc213a99a03a10950b67bc4` |
| Bytes | 5269 |
| Lines | 108 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's act for cutover step 10 at deployed commit `6b3d3ce12990d022d2089a97a3656a1f5f40f044`. The Founder asked for Gate VI's act at 09:41:17Z; the builder answered at 09:43:13Z that plan r1 forbids it until r6 section 15 conditions 1 to 4 hold, condition 3 being step 10; the Founder chose "draft step 10 first" at 09:54:06Z, and the builder delivered the draft at 09:57:29Z. He posted it in the builder session at 2026-10-08T09:59:29Z. The message's first line was `read`, the instruction for the act's step a, followed by one blank line; neither is part of the act and neither is preserved here. The posted text is byte-identical to the builder's draft. Spent by the acceptance below |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACCEPTANCE-step10-pc19-20261008.txt` |
| Git blob id | `5a10137642ab2f3aad034d1a43514cfb42d7335a` |
| SHA-256 | `88cd0e3d81bebcf331bfcdbb1d6028f580b03bdeaa1a959a8a5a40f75e10a77d` |
| Bytes | 964 |
| Lines | 19 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's acceptance, posted at 2026-10-08T11:13:28Z. It states his findings in formal terms, records PC-19 as observed, spends the act, keeps the act's dispositions of Gate V departures 1 and 3, commits him not to roll back to any deployment created before `aae63936`, records that he deletes his `OLD - undo` value, and declares neither custody remediated nor any further authority. Drafted by the builder at 10:08:13Z; the Founder posted it unchanged, after a first post at 11:12:52Z that carried only its title line, which the builder did not treat as an acceptance |

## What happened, in order

All times are UTC on 2026-10-08. Session times are the transcript's;
Railway times are its API's; database times are the database clock.

| Time | Event | Source |
|---|---|---|
| 09:59:29Z | act posted, prefixed `read` | session |
| 09:59:48Z to 10:00:58Z | step a: every condition holds. `main` at `6b3d3ce`; the latest deployment `a5596777` SUCCESS at that commit, the only process since 00:55:56Z by `/health` uptime, booted as `br_app_runtime` with `privilegeAudit` `enforced` (its deploy log, read at 00:56Z); nothing staged; one environment and one service; the service's variables by name exactly `CONTROL_PLANE_TOKEN`, `DATABASE_URL`, `PHASE3_ADJUDICATION_TOKEN`; no shared variable; no `neondb_owner` session from the application | GitHub, public `/health`, Railway `describe-environment`, `describe-service`, `list-services` (names, never values), Neon `run_sql` |
| 10:01:30Z | the builder's report; step 1: open a Chrome Guest window and sign in to Railway there | session |
| 10:02:43Z | the Founder: `on guest window` | session |
| 10:02:53Z, 10:04:14Z | step 2: open the service's Variables page in that window; the Founder: `variables open` | session |
| 10:04:20Z | step 3: reveal each token, one at a time, and say whether it starts with `postgres` or contains `${{`, with no value in the reply and no screenshot | session |
| 10:05:48Z | the Founder: "no they are just both tokens" | session |
| 10:05:55Z | step 4: open the project's Shared Variables page | session |
| 10:06:50Z | the Founder: "no variables shared" | session |
| 10:07:40Z | step c: the builder's reads below | Railway, Neon, GitHub, public `/health` |
| 10:08:13Z | the builder's report, with the acceptance drafted in formal terms | session |
| 11:12:52Z | a post carrying only the acceptance's title line; the builder answered at 11:13:13Z that it was not an acceptance | session |
| 11:13:28Z | acceptance posted | session |

## What the builder read at step c

| Check | Result | Read at |
|---|---|---|
| Railway names | one environment (`production`) and one service (`rare-enjoyment`); the service's variables exactly `CONTROL_PLANE_TOKEN`, `DATABASE_URL`, `PHASE3_ADJUDICATION_TOKEN`; no shared variable; nothing staged | 10:07Z, as at step a |
| deployments | the latest is still `a5596777`, SUCCESS at `6b3d3ce`, created 2026-10-08T00:54:26Z; none since step a | 10:07Z |
| `/health` | HTTP 200, uptime 33104 seconds, the same process as at step a | 10:07:40Z |
| database sessions | `br_app_runtime`: 2, started 00:55:57.625726Z and 00:56:07.669884Z; no `neondb_owner` session from the application (the only one is the builder's own read session) | 10:07:40Z |
| `main` | `6b3d3ce12990d022d2089a97a3656a1f5f40f044`, as at step a | 10:07:40Z |
| rollback copies | `d79ee5ac` (2026-10-05T00:20:16Z), `a8e1809e` (2026-10-06T11:53:01Z) and `b40118f2` (2026-10-06T12:00:45Z), created before the cutover deployment `aae63936` (2026-10-06T12:05:06Z), still report `canRollback` | 10:07Z |

Against plan r1 and r6: PC-19 (the Railway application service holds no
administrative credential as a service, shared or reference variable) is
observed on the Founder's findings and the builder's names-only reads.
With PC-0 to PC-4, PC-17 and PC-20 already observed, r6 section 15
conditions 1 to 3 hold. Condition 4 (PC-23, PC-26 to PC-30) is not
addressed here, and conditions 5 to 7 belong to Gate VI.

## Departures and findings

1. **The token findings rest on the Founder's words.** The builder
   cannot read a Railway variable's value and did not. The Founder's
   reply, "no they are just both tokens", was informal; the builder
   recorded it as given, said how it read it (neither a connection
   string nor containing `${{`) at 10:05:55Z, and drafted the acceptance
   to state the findings in those terms, which the Founder posted
   unchanged.
2. **`DATABASE_URL` was not viewed.** It is sealed, so no one can view
   it. The act relies on its history: the Founder replaced its whole
   value with a literal `br_app_runtime` connection string on 2026-10-07
   at about 11:44Z, recorded in the receipt for that act, and every
   deployment since boots as `br_app_runtime`.
3. **Rollback copies remain.** Railway's rollback restores a
   deployment's variables as well as its image (docs.railway.com, "Roll
   Back a Bad Deploy Fast"). The three deployments in the table above
   carry the pre-cutover `DATABASE_URL` with `neondb_owner`'s credential
   and still offer rollback. No act removes them; the acceptance commits
   the Founder not to roll back to any deployment created before
   `aae63936`, and Gate VI's rotation is what makes those copies
   useless. Rollback to `aae63936`, `834d764d` or `a1fa2933` would
   restore a retired `br_app_runtime` password and fail to connect,
   though it restores no administrative credential.
4. **The two tokens are stored unsealed.** r6 section 5.1 rule 2 says
   values that live in Railway are stored as sealed variables. Sealing
   them changes the variables and redeploys; the act excludes it, and it
   needs its own act.
5. **Two Gate V departures are now disposed of.** The act waives Gate V
   departure 1 (the unattested reference-variable point) and departure
   3 (the change to a variable other than `DATABASE_URL`), and the
   acceptance keeps both waivers.
6. **An incomplete first post.** At 11:12:52Z the acceptance arrived as
   its title line only. The builder did not treat it as an acceptance;
   the full text followed at 11:13:28Z.

## What the builder verified and what it did not

- Verified against live systems, read-only: `main` (GitHub); deployments,
  staged changes, environment, service and variable names (Railway, which
  returns names, never values, through the calls used); sessions (Neon
  `run_sql` as `neondb_owner`); the public `/health` endpoint.
- On the Founder's word: that he worked in a Chrome Guest window; that
  both tokens are tokens, neither a connection string nor containing
  `${{`; that the project lists no shared variable (which the builder's
  names-only read also shows); that he deletes his `OLD - undo` value.
- Not read by the builder: any Railway variable value; any password,
  token or hash; the Founder's private note.

## What this landing does not do

- It edits no code, no workflow and no other custody file. It touches
  `README.md` only to record step 10 and point at this receipt, and to
  restate what is not done.
- It authorizes nothing: no Gate VI, no change to any Railway variable or
  setting, no sealing of the tokens, no removal of the `pending_cutover`
  tolerance, no deploy, rollback or merge.

## Provenance and transport

| Step | Identity |
|---|---|
| Act and acceptance drafted | the `builder` seat, in session, after the Founder's "draft step 10 first" (09:54:06Z) |
| Act and acceptance posted | the Founder, in session, at 09:59:29Z and 11:13:28Z |
| Audit | the Founder, in a Chrome Guest window, in the Railway dashboard |
| Reads | the builder session, read-only, through the GitHub, Railway and Neon APIs and Neon `run_sql` as `neondb_owner` |
| Transport | files written by the builder from the session texts as recorded in the session transcript, each ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the act's CUSTODY clause (posted
2026-10-08T09:59:29Z) and the acceptance (11:13:28Z). Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
