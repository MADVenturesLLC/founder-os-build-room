# CUSTODY RECEIPT — PR 2b: removal of the `pending_cutover` tolerance (Tranche D close-out) (2026-10-10)

**This receipt records the landing of one instrument, the Founder's act
of 2026-10-10 authorizing the builder to end the tolerance his decision
of 2026-10-04 left for any role other than `br_app_runtime`, in the same
pull request as the code change the act authorizes. It records the
builder's step a reads and what the change does. It authorizes nothing:
no merge, no deploy, redeploy or rollback, no change to any Railway
variable, Neon role, grant, password or database, no migration, no
change to the DB Admin Migration workflow, the runner, the environment
or any secret, no sealing of the two Railway tokens, and no change to
the `ep-withered-bonus-au1982ty` credential or the review-bot
credentials.** The act's own text governs.

## The instrument

The file is the text of the Founder's message as recorded in the session
transcript, byte for byte, plus one final LF; the post carried no final
newline.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-pending-cutover-removal-20261010.txt` |
| Git blob id | `0dbc14def67b80a0c4297631036540872e4a9a80` |
| SHA-256 | `63f42a59de44635eb9265c6a630f5e8ec9bdd801fb4e4a3628af181ce69c8a88` |
| Bytes | 4772 |
| Lines | 95 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's act at `main` `faaad0bc401cc4b46b8868e69dea30766fb9e5b7`: one code change, in one pull request, that makes the boot preflight refuse every role other than `br_app_runtime`, keeps the audit on `br_app_runtime` as it was, removes `pending_cutover` from the code, changes the tests to prove the new rule and updates `README.md` and the preflight's comments. The builder drafted it at the Founder's request; he chose the strict rule (refuse any other login, whatever it holds) over a weaker one the builder described (refuse only a login that holds forbidden authority). He posted it in the builder session at 2026-10-10T01:19:32Z, byte-identical to the draft. It is spent when he accepts or stops |

## What happened, in order

All times are UTC on 2026-10-10. Session times are the transcript's;
GitHub, Railway and `/health` times are theirs.

| Time | Event | Source |
|---|---|---|
| 01:19:32Z | act posted; the builder checks it against the draft (identical) and waits for the instruction to read | session |
| 01:20:55Z | the Founder: `READ` (step a) | session |
| 01:21:04Z to 01:21:14Z | the builder's step a reads; every condition holds (below) | GitHub, Railway, repository, public `/health` |
| after 01:21Z | the builder writes the change and runs the suites (step b) | local |

## The conditions at step a

| Condition | Read |
|---|---|
| `main`'s tip | `faaad0bc401cc4b46b8868e69dea30766fb9e5b7` (GitHub API, 01:21:04Z) |
| latest deployment | `0bb5c618` `SUCCESS` at `faaad0bc`; its `boot.preflight` at 00:04:10.922Z reads role `br_app_runtime`, `privilegeAudit` `enforced`, forbidden attributes `[]`, forbidden memberships `[]`; nothing queued, building or staged (Railway API) |
| who calls the preflight | only `packages/control-plane/src/main.ts`; `packages/control-plane/src/migrate-cli.ts` imports only `migrations.js` and never calls it (repository at `faaad0bc`) |
| open pull requests | none (GitHub API, 01:21Z) |
| service | `/health` 200, uptime 4623 s, at 01:21:14Z |

## What the change does

- `packages/control-plane/src/schema-preflight.ts`: a new first step,
  `runtimeIdentityRefusal`, reads `session_user` and `current_user` and
  refuses unless both are `br_app_runtime`, as the journal's identity
  latch already requires; an owner-class login that sets its role to
  `br_app_runtime` at connect is refused as
  `the connected role is postgres (acting as br_app_runtime), ...`.
  `privilegeAuditRefusal`, as a second layer,
  refuses any connected role other than `br_app_runtime` with
  `privilege audit refused: the connected role is <role>, not the runtime
  identity br_app_runtime. The runtime serves only as br_app_runtime`,
  naming the two roles and nothing else; for `br_app_runtime` it refuses
  any finding exactly as before. `PrivilegeAuditStatus` has the single
  value `enforced`. `schemaPreflight` now checks the identity, then runs
  the audit, before it reads `schema_migrations`: the identity read needs
  no privilege and the audit reads only `pg_roles` and `pg_auth_members`,
  which any login may read, so a wrong login is refused for its identity,
  with that message, rather than failing on a table it was never granted
  or on a catalog read. For `br_app_runtime` the order changes
  nothing: a finding refused boot before the schema check already, and
  the schema checks are unchanged.
- `packages/control-plane/src/main.ts`: comments only. The
  `boot.preflight` log line keeps its fields.
- Tests:
  - `test/schema-preflight-enforcement.test.ts`: `neondb_owner`,
    `postgres` and an arbitrary login are each refused, with nothing
    forbidden and with every forbidden attribute and membership, and the
    refusal names the two roles only; a non-runtime role is refused
    before the schema is read.
  - `test/schema-preflight.storage.test.ts`: the schema cases (A-R1,
    A-R4, A-R5) and the passing control connect as `br_app_runtime`; the
    superuser session is refused by the preflight, and a real boot as
    the superuser exits non-zero before listening with zero DDL.
  - `test/runtime-role-boot.storage.test.ts`: D-R5 now shows that a
    rollback of `DATABASE_URL` to the owner-class login is refused before
    any preflight report, and that the runtime then boots again and reads
    the room it wrote; a non-superuser login named `neondb_owner`, even
    one granted `SELECT` on the ledger, is refused; and a superuser that
    sets its role to `br_app_runtime` at connect is refused. The builder
    ran that last test against the code without the `session_user` check
    and saw it fail, then pass with it.
  - `test/boot-no-ddl.storage.test.ts`: both real boots connect as
    `br_app_runtime`.
  - `test/support/runtime-role-tier.ts`: the reasons for excluding
    `boot-no-ddl` and `schema-preflight` from the runtime-role tier now
    say their boots already connect as `br_app_runtime`.
  - No test was skipped, disabled or deleted. The tolerance tests were
    rewritten into refusal tests.
- `README.md`: the Tranche D enforcement bullet, the Tranche A bullet,
  a new bullet for this act, and the "Not done" list.

## Review finding taken

Copilot's review of the first head (`5f75a22`, comment r4235891700,
marked high) found that the identity check compared only
`current_user`, so a superuser connecting with
`options=-c role=br_app_runtime` would pass it while the audit read
`br_app_runtime`'s clean attributes instead of its own. The finding is
correct and within the act's item 1: the connected role is the login.
The builder added the `session_user` check and the tests above in the
next commit.

## What the builder verified and what it did not

- Verified, read-only, at step a: the conditions above.
- Run locally, as a non-root user against PostgreSQL 16 on owned
  instances: the changed storage suites, `runtime-role-boot` (22 of 22),
  `boot-no-ddl` (6 of 6) and `schema-preflight` (12 of 12), none
  skipped; the full default suite, the runtime-role tier and every
  storage suite, with the counts recorded in the pull request body.
- Not done by the builder: any merge, deploy or production write. The
  production effect is the deployment the merge starts, which the
  Founder authorizes in his merge authorization and which the builder
  then reads and reports on.

## Provenance and transport

| Step | Identity |
|---|---|
| Act drafted | the `builder` seat, in session |
| Act posted | the Founder, in session, at 01:19:32Z |
| Reads | the builder session, read-only, through the GitHub and Railway APIs, the repository and public `/health` |
| Code change and tests | the builder session, in this pull request |
| Transport | file written by the builder from the session text as recorded in the session transcript, ending with a single LF; pins above computed by the builder over the landed file |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the act's AUTHORIZED WORK and
CUSTODY clauses (posted 2026-10-10T01:19:32Z). Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
