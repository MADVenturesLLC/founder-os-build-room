# CUSTODY RECEIPT — TLS verification the connection string cannot turn off (2026-10-10)

**This receipt records the landing of one instrument, the Founder's act
of 2026-10-10 authorizing the builder to make the code, not the
connection string, decide whether each Postgres connection uses TLS and
verifies the server, in the same pull request as the code change the act
authorizes. It records how the act was issued, the builder's step a
reads and what the change does. It authorizes nothing: no merge, no
deploy, redeploy or rollback, no change to any Railway variable, Neon
role, grant, password or database, no migration and no run of DB Admin
Migration, no change to the DB Admin Migration workflow file, the
db-admin-migration environment, its secret, the GitHub runner or any
other secret, and no dependency version change.** The act's own text
governs.

## The instrument

The file is the sign-ready text the builder delivered to the Founder in
session, byte for byte; it ends with a single LF, as delivered.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-tls-verification-20261010.txt` |
| Git blob id | `209c3acdf6c9580b7c05286f8efa55c112ccee5b` |
| SHA-256 | `fde3c70107c147e822792d5d117ce31df367dd7a712ba59a83ed1484d711af3d` |
| Bytes | 6393 |
| Lines | 126 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's act at `main` `06c608e4ba24f3f2a53ad0a8056e9ceb018daeb2`: one code change, in one pull request, so that TLS is on and verified unless the URL says `sslmode=disable` or its host is loopback, whatever else the URL says; used by the control plane's pool and both of the administrative runner's connections; with the misleading comment in `db.ts` corrected and tests that read the settings node-postgres actually connects with. It is spent when the Founder accepts or stops |

## How the act was issued

The Founder did not post the act's text. He signed the delivered text by
reference, and the builder records exactly what happened rather than
treating the reference as a post.

| Time (UTC, 2026-10-10) | Event | Source |
|---|---|---|
| 16:31:48Z to 16:31:56Z | the builder writes the draft, at the Founder's request ("draft the db.ts fix act while we wait"), and corrects one sentence of its ORDER clause | session |
| 16:32:03Z | the builder delivers the sign-ready file to the Founder; the text above is that file | session |
| 16:34:57Z | the Founder, verbatim: `* Approved, Michael Daley 2026-10-10, push it` | session |

Two readings the builder made, stated so the Founder can correct them:

1. **Which act.** Two drafts were open: this act and the act setting
   `DATABASE_URL` to `sslmode=verify-full`. The builder read the
   approval as this act's, because it was the draft delivered
   immediately before it and because "push it" describes a code change;
   the `sslmode` act is performed by the Founder's own hands in Railway
   and pushes nothing. The `sslmode` act has not been issued.
2. **Step a.** The act's SEQUENCE has the Founder tell the builder to
   read. The builder took "push it" as that instruction and began the
   step a reads at 16:35Z.

The text's own signature block (`Signed: Michael Daley`,
`Date: 2026-10-10 (UTC)`) was written by the builder in the draft as the
place for the Founder's signature; the Founder's signature is the
message above.

## The conditions at step a

| Condition | Read |
|---|---|
| `main`'s tip | `06c608e4ba24f3f2a53ad0a8056e9ceb018daeb2` (GitHub, 16:35Z) |
| latest deployment | `ae86a775` `SUCCESS` at `06c608e`; its `boot.preflight` at 15:54:39.968Z reads role `br_app_runtime`, `migrationsPresent` 8, `privilegeAudit` `enforced`, forbidden attributes `[]`, forbidden memberships `[]`; nothing queued, building or staged (Railway API, 16:35Z) |
| open pull requests | none, so none touches `db.ts` or `migrate-cli.ts` (GitHub API, 16:35Z) |
| DB Admin Migration | no run queued or waiting; the latest, `37923976750`, completed 2026-10-09T11:28:49Z (GitHub API, 16:35Z) |
| service | `/health` 200, uptime 2438 s, at 16:35:17Z |

## What the change does

- `packages/control-plane/src/pg-tls.ts` (new): `pgConnectionSettings`
  decides TLS from the URL's host and its `sslmode=disable`, read as a
  query parameter rather than matched anywhere in the string, and
  returns `ssl: { rejectUnauthorized: true }` or `ssl: false` with the
  URL's TLS parameters (every `ssl*` key and `uselibpqcompat`) removed
  from the query. The scheme, credentials, host, port, database and
  every other parameter pass through unchanged. An unparseable URL is
  refused with a message that does not contain it.
- `packages/control-plane/src/db.ts`: `createPool` uses it; the old
  `isLoopback` helper moves into `pg-tls.ts`; the comment that said an
  explicit `ssl` option overrides the connection string is corrected.
- `packages/control-plane/src/migrate-cli.ts`: the administrative URL is
  resolved once through `pgConnectionSettings`; both the `Client` that
  reads `schema_migrations` and the migrator's `Pool` use the result.
  An unparseable `MIGRATE_ADMIN_DATABASE_URL` is a usage error (exit 2)
  that does not echo the URL.
- `test/control-plane-config.test.ts`: the TLS-defaults test now reads
  the settings node-postgres resolves (a `Client` built from the pool's
  options) instead of the pool's options object, and covers
  `sslmode=require`, `prefer`, `verify-full`, `no-verify`, `require`
  with `uselibpqcompat=true`, `ssl=0`, `ssl=false`, no `sslmode`,
  `sslmode=disable`, loopback by address and by name, and credentials
  that merely contain `localhost` or `sslmode=disable`; and checks that
  the non-TLS parameters survive.
- `test/pg-tls.test.ts` (new): the same decision, read the same way,
  for 21 URL forms; the rewritten query; credentials with
  percent-encoded characters passed through; a fragment kept out of the
  query; the unparseable refusal; and the administrative runner, by its
  compiled source and by running it with an unparseable URL.
- `README.md`: a bullet for this change and the status heading.

## Red first

Against `main` at `06c608e`, the rewritten TLS-defaults test failed 7 of
its 13 URL cases. Four are the defect the act names: `sslmode=no-verify`
and `sslmode=require&uselibpqcompat=true` resolved to
`rejectUnauthorized: false`, and `ssl=0` and `ssl=false` resolved to
`ssl: false`, no TLS. Three, `sslmode=require`, `prefer` and
`verify-full`, resolved to `{}`: verified only because Node's TLS
default is to verify and pg-connection-string 2.14 treats those modes as
`verify-full`, not because of the code's setting. With the change every
case resolves exactly as the table expects.

## Review findings taken

Copilot's review of the first head (`929c09a`, review 5479953064) posted
two medium findings, both correct and both within the act:

1. r4238424941: the query was sliced to the end of the string, so a
   `#fragment` became part of the last parameter's value
   (`application_name=br#x` reached node-postgres as `br%23x`), against
   the pass-through the act requires. The query now ends at the first
   `#`, the fragment passes through unchanged, and a `?` inside a
   fragment is not treated as a query. Two tests cover it; both fail
   against `929c09a`.
2. r4238424956: a TLS-defaults assertion message interpolated the
   fixture URL, so a failure would have printed a connection string,
   against the act's item 5. The message now names the case only.

## What the builder verified and what it did not

- Verified, read-only, at step a: the conditions above.
- Run locally against PostgreSQL 16: the default suite as root (the
  only failures are `migrate-cli.test.js`, whose owned instance refuses
  `initdb` as root), `migrate-cli` as a non-root user (12 of 12), every
  storage suite (338 of 338) and the runtime-role tier (15 suites as
  `br_app_runtime`, none skipped); counts in the pull request body. One
  storage run failed on connection refusals because the local
  PostgreSQL server had stopped; after restarting it the same build
  passed 338 of 338.
- Not done by the builder: any merge, deploy or production write. The
  production effect is the deployment the merge starts, which the
  Founder authorizes in his merge authorization and which the builder
  then reads and reports on.

## Provenance and transport

| Step | Identity |
|---|---|
| Act drafted | the `builder` seat, in session |
| Act signed | the Founder, in session, at 16:34:57Z, by reference to the delivered text |
| Reads | the builder session, read-only, through the GitHub and Railway APIs, the repository and public `/health` |
| Code change and tests | the builder session, in this pull request |
| Transport | the delivered file, copied byte for byte; pins above computed by the builder over the landed file |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the act's AUTHORIZED WORK and
CUSTODY clauses (signed 2026-10-10T16:34:57Z). Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
