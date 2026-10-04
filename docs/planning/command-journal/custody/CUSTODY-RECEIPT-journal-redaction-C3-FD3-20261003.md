# CUSTODY RECEIPT — Founder ruling on journal write-path redaction: C3 reconciliation and FD-3 (drafted 2026-10-03, signed 2026-10-04)

**This receipt records the landing of a Founder-signed ruling. The ruling
reconciles C3 by designating the pre-write guard as the redaction boundary
of the production journal write path, resolves FD-3 as no HMAC key for the
journal path, and makes the Tranche D condition of the 2026-09-27 ruling
dischargeable once two things hold: this landing, and the guard's two added
shapes with a parity test on `main`. It authorizes no merge, migration,
Gate IV act, dispatch, deployment, Tranche D cutover, DATABASE_URL change,
credential, key provisioning, or Railway or Neon change.** The ruling's own
text says so and governs.

## The instrument

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-journal-redaction-C3-FD3-20261003.txt` |
| Git blob id | `f491d939a9a777c819698f551e8eef4503140dc3` |
| SHA-256 | `a49055516ad3cd2eb99c6caddbcb6b7c58f493ed1196d1f139716481b80512a0` |
| Bytes | 7737 |
| Lines | 142 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| Signed | "Michael Daley", dated 2026-10-04, in the ruling's closing lines; its opening line names "Michael Alberto Daley" |
| What it rules | C3: the pre-write guard in `packages/journal/src/redact.ts`, applied before any database contact, is the redaction boundary of the production journal write path; `JournalAppendSink` stays unwired and is never stacked on it; one condition, that the guard's detection list contain every shape in `packages/redaction`'s registry, with `aws-access-key-id` and `slack-token` added and a parity test landed. FD-3: no HMAC key for the journal write path; addendum 02 §5 option (a) not commissioned, option (c) rejected, option (b) as the landed code makes it; the run-harness Keychain custody untouched. Effect: the 2026-09-27 Tranche D condition is discharged when this ruling is landed and the shapes and parity test are on `main`; until both hold it stands |

The ruling pins three documents under `docs/planning/command-journal/` by
path, blob id and SHA-256: the 2026-09-27 ruling, the correction note of
2026-09-26, and addendum 02 to the PR 2b implementation plan. What the
gate checks of those pins, exactly: `gate:custody-pin-check` reads the
working tree, finds the three lowercase `sha256` values near those paths,
and recomputes each from the checked-out file. It does not read the
`blob:` lines and it does not resolve `main`. The three blob ids were
verified by the builder with `git rev-parse origin/main:<path>` at
`c292c805` on 2026-10-03, not by the gate. The ruling also pins five code
files as they stood at `main` `c292c805` (`packages/journal/src/redact.ts`,
`packages/redaction/src/registry.ts`, `packages/redaction/src/sinks.ts`,
`packages/control-plane/src/journal-store.ts`,
`packages/control-plane/src/journal-routes.ts`). The gate prints those pins
and does not count them, by its own design: it reads pins only on paths
under `docs/planning/command-journal/`. That is the right behaviour here,
because the ruling itself commissions edits to two of those files. No gate
verifies the five; the builder computed them on 2026-10-03.

## How the ruling was signed

- The builder presented the draft in session on 2026-10-03 with empty
  `Signed:` and `Date:` lines, in full, byte-identical to its scratch copy,
  as the recommended one of two texts. The other text narrowed the
  condition to Gate VII instead of resolving C3 and FD-3; it was not signed
  and is not landed. Five additions beyond the Founder's words were flagged
  for him to keep or strike: the shapes-and-parity precondition of
  discharge; the FD-3 option mapping; the sentence that a keyed boundary
  may replace the guard only under a later act that names it; the
  directive that `redact.ts` and the redaction README cite the ruling; and
  the "I accept, with this ruling" sentence naming the residual. All five
  were kept.
- The Founder's direction to prepare the ruling, verbatim, 2026-10-03: "I
  approve, a signed ruling in the custody shape that either resolves C3
  and FD-3, or narrows the condition to activation (Gate VII) and accepts
  the pre-write guard as the interim boundary." The signed text is the
  resolving one.
- The Founder replied, verbatim: "— Michael Daley, Date: 2026-10-04, push
  it", on 2026-10-04 (UTC). On that instruction the builder filled the two
  lines (`Signed: Michael Daley`, `Date: 2026-10-04`) and landed the file
  at the path the ruling's CUSTODY clause names. No other line differs
  from the draft shown, verified with `diff`. The file name carries the
  date of drafting; the signature carries the date of adoption.

## What the builder verified and what it did not

| Claim in the ruling | How verified | When |
|---|---|---|
| The append route is mounted behind the shared token; the guard runs before any database contact; the route answers `400 credential_material` and echoes nothing; the latch refuses every session that is not `br_app_runtime` | read `packages/control-plane/src/server.ts` line 306, `journal-routes.ts`, and `journal-store.ts` (`buildJournaledRow` runs before `acquire`) at `main` `c292c805` | 2026-10-03 |
| Production connects as `neondb_owner` today | Railway `get-logs` for deployment `86f8a579-c05a-4d06-853e-64a7cb92f241` (commit `c292c805`, the auto-deploy of PR #91's merge): `boot.preflight` at 2026-10-03T11:41:47.943Z with role `neondb_owner`, `migrationsPresent` 7, `privilegeAudit` `pending_cutover` | 2026-10-03 |
| Of the registry's six shapes, four are detected and redacted by the guard and two (`aws-access-key-id`, `slack-token`) are neither | `tsc --build` of `main` `c292c805`'s tree (exit 0), then synthetic vectors run through `containsCredentialMaterial` and `redactArgv` against the registry's `BUILTIN_SHAPES` | 2026-10-03T21:41Z |
| No later ruling on C3 or FD-3 exists | listing of this directory; search of FounderOS `07-decisions/` for Tranche D, FD-3 and `JournalAppendSink` | 2026-10-03 |
| Blob ids and SHA-256 values of the bound instruments | `git rev-parse origin/main:<path>`; `git show origin/main:<path>` piped to `sha256sum` | 2026-10-03 |
| PR #78's write path is on `main` | `git merge-base --is-ancestor` for `3bf8d51`, `4bcb136`, `c2921d3` | 2026-10-03 |

Not verified, and not claimed by the ruling or this receipt: whether
`br_app_runtime` holds a password in production (`pg_authid` is unreadable
to `neondb_owner`); any Neon state; anything about the shapes-and-parity
change, which does not yet exist.

## What this landing does not do

- It discharges nothing by itself. The ruling's EFFECT clause requires both
  this landing and the shapes-and-parity change on `main`. Until the second
  holds, the 2026-09-27 condition stands and no Tranche D cutover occurs.
- It edits no code and no other custody file. The 2026-09-27 ruling's file
  is untouched.
- It authorizes nothing: no merge, migration, Gate IV act, dispatch,
  deployment, DATABASE_URL change, credential, or key provisioning.

## Provenance and transport

| Step | Identity |
|---|---|
| Direction to draft | the Founder, in session, 2026-10-03 (quoted above) |
| Drafted for signature | the `builder` seat, in session, 2026-10-03, from a brief comparing the resolving and the narrowing text; the brief and the unsigned narrowing draft stayed in session scratch and are not governed artifacts |
| Signature | the Founder, in session, 2026-10-04: "— Michael Daley, Date: 2026-10-04, push it" |
| Transport | the builder filled the two signature lines in its own copy of the draft it had shown; the Founder re-sent no text |
| Difference from the draft | the two filled lines only, verified with `diff` |
| Founder-side hash | none supplied; the values above are computed by the builder over the landed file |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction of 2026-10-03 ("I approve, a signed
ruling in the custody shape ...") and 2026-10-04 ("push it"). Merge is a
separate exact-SHA Founder act under DEC-20260718-04; this receipt asserts
none.
