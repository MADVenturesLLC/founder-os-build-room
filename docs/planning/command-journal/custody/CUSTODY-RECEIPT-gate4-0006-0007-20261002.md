# CUSTODY RECEIPT — Gate IV, Tranche C: the acts, the runs, and the application of 0006 (2026-10-02)

**This receipt records the landing of seven instruments: the Founder's
three Gate IV acts and the confirmation of the first, the stage-5
evidence of run 37028874575 and of the application of 0006 at 07:43Z on
2026-10-02, and the Founder's disposition on that application. It
authorizes nothing: no dispatch, no merge, no deployment, no change to
the workflow, the runner, the environment or any secret.** Each
instrument's own text governs.

## The instruments

Each act and the confirmation is the text as posted in the builder
session, byte for byte, plus one final LF; the chat posts carried no
final newline. The evidence files are the runner's output as the
Founder pasted it, with one final LF. The disposition is the builder's
draft with its two signature lines filled, see below.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-gate4-0006-20260930.txt` |
| Git blob id | `e8060a2f29b772e67d1668c656033f61f2039cb5` |
| SHA-256 | `b23eb5264b19458a580da911b3de9534a9b27166529a36ca67f9749586c0e009` |
| Bytes | 2502 |
| Lines | 56 (`wc -l`) |
| Trailing newline | present (single LF) |
| What it is | the Founder's first Gate IV act (main `1e53ca78`), posted in the builder session 2026-09-30T12:36:41Z; two bracketed clauses and a bracketed time, completed by the confirmation below; its `Date:` line is empty as posted; the stray bracket in its Target line is the typo the confirmation names. Spent by run 36836638497. An earlier paste of the same text with `[FILL]` placeholders preceded it in the session and is not an instrument |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-gate4-0006-CONFIRMATION-20261001.txt` |
| Git blob id | `f863638e81dbe2dee373f15e948f706dd7461fd2` |
| SHA-256 | `de6c80e7d15bc66ae20bf1bce8733ccbeb0345d85aafa99c2e681efb6e99bd7d` |
| Bytes | 781 |
| Lines | 15 (`wc -l`) |
| Trailing newline | present (single LF) |
| What it is | the confirmation that completed the first act, posted 2026-10-01T08:29:04Z; the act took effect on its posting, and run 36836638497 was dispatched at 08:29:37Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-gate4-0006-second-act-20261002.txt` |
| Git blob id | `06c176f23e1c120f962d62088f74a643fc0fbb72` |
| SHA-256 | `6265273fffb7b2244019cfd4131c95eca1a8eb44990a2c2c063d5654183de7f2` |
| Bytes | 3419 |
| Lines | 71 (`wc -l`) |
| Trailing newline | present (single LF) |
| What it is | the second act (main `fc1ffb6e`), posted 2026-10-02T08:35:59Z without a `DISPATCH IF CLEAN` or `CHECK ONLY` line and treated as check only; never dispatched; withdrawn by the third act and void under the disposition |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-gate4-0007-20261002.txt` |
| Git blob id | `22fb27a5f99cff66ca5e0a89363abe9d9c39a9ff` |
| SHA-256 | `7b4a4f28bf40e447133c7fc82b748779a4691129692f0931f46dde935354194f` |
| Bytes | 3982 |
| Lines | 80 (`wc -l`) |
| Trailing newline | present (single LF) |
| What it is | the third act (main `e2a7828c`), posted 2026-10-02T15:32:17Z; the go came as a separate message, `DISPATCH IF CLEAN`, at 15:39:05Z; executed by run 37028874575 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/GATE4-EVIDENCE-run37028874575-stage5-20261002.json` |
| Git blob id | `2de62ab6e4da5c51048a553033b877e3cb2e7b2f` |
| SHA-256 | `73e52547038780ae4ad9fcbbe32e9d2a6247708f9aaac44e722e75b9c12eb39e` |
| Bytes | 915 |
| Lines | 29 (`wc -l`) |
| Trailing newline | present (single LF) |
| What it is | the stage-5 evidence of run 37028874575, pasted by the Founder from the run's Summary page at 2026-10-02T18:52:46Z (the builder cannot read that page); every field verified by the builder against the act and against production, see below. `approver_identity` is `null` by the runner's design; the approver is platform-recorded. Its `run_id` is the runner's own id, not GitHub's run id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/GATE4-EVIDENCE-application-6dac6f12-stage5-20261002.json` |
| Git blob id | `70a76ce687f3156e4209aafcbc17f8c2399f357e` |
| SHA-256 | `02be7e5624f0810e3b1aaaed7726758b97fc17cd0324ef2e2328d10af18e69b3` |
| Bytes | 707 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF) |
| What it is | the runner's single evidence line from the application of 0006 to production on 2026-10-02 from 07:43:10Z to 07:43:14Z, taken from the Founder's paste of the runner's terminal output at 07:44:46Z. The paste's preceding lines (the builder's prompt text and the pg SSL warning) are not preserved. `expected_sha` and `observed_sha` are `null`: the runner ran outside the workflow |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-gate4-0006-nongoverned-application-20261002.txt` |
| Git blob id | `231cb885a22250d4700b121048fe5dd98199c6b5` |
| SHA-256 | `5090dd1b540c8383019b4d73dfd26aab796a2574c5e8a8e8d0c69da975b45abe` |
| Bytes | 6467 |
| Lines | 111 (`wc -l`) |
| Trailing newline | present (single LF) |
| What it is | the Founder's disposition on that application: `NONGOVERNED_APPLICATION_RECORDED`. 0006 stands as applied; the second act is void; no revert; remediation 3 and 4 are new direction. See "How the disposition was signed" below |

## The runs

| Run | Dispatched | Inputs | Approval | Outcome |
|---|---|---|---|---|
| 36712705903 (#1) | 2026-09-30T12:06:46Z by `decivantiq` | `founder_authorized_sha` all zeros, `tranche_id` `control-wrong-sha-no-migration`, at `main` `1e53ca78` | none requested | control run: `preflight` failed closed at "Assert the run's SHA is the authorized SHA" (expected `0000…0000`, observed `1e53ca78…`); `migrate` skipped; nothing privileged |
| 36836638497 (#2), attempt 1 | 2026-10-01T08:29:37Z by `decivantiq`, through the builder session, under the first act | `1e53ca78…`, `0006_command_journal_authority_split` | `daley40-lab`, environment `db-admin-migration` (the approvals API lists one approval record for the run) | `preflight` passed; `migrate` reached the apply step 08:52:37Z to 08:52:40Z and failed, SQLSTATE 42501, rolled back; nothing applied |
| 36836638497 (#2), attempt 2 | re-run started 2026-10-01T09:38:50Z, `triggering_actor` `decivantiq`; not triggered by the builder session | same | as above | apply step 09:39:52Z to 09:39:53Z, SQLSTATE 42501, rolled back; nothing applied. The first act was spent by this run |
| 37028874575 (#3) | 2026-10-02T15:42:33Z by `decivantiq`, through the builder session, under the third act, after the Founder's `DISPATCH IF CLEAN` of 15:39:05Z | `e2a7828c0501613baa23a9b0ae2be84eaa9d9a96`, `0007_gate_runs` | `daley40-lab`, environment `db-admin-migration` | `preflight` passed (SHA match); `migrate` approved, apply step 16:27:31Z to 16:27:33Z, success; evidence above |

The cause of the 42501 failures and its fix are PR #89, merged as
`fc1ffb6e7c733a6904469d3903c824ca3ffc0338` under the Founder's merge
authorization, comment 5929808451 (2026-10-01T10:48:31Z).

## The database

Neon project `founder-os-build-room` (`orange-art-29526355`), branch
`production` (`br-summer-sun-avroco6a`), endpoint
`ep-little-meadow-avqfkjcp`, database `neondb`, PostgreSQL 18.6. The
Railway service `rare-enjoyment` resolved that endpoint on 2026-10-01 at
10:55Z (Railway DNS log) and its boot logs report this database's
`schema_migrations`.

| Event | Time (UTC) | Source |
|---|---|---|
| 0006 applied, outside Gate IV, by the runner at `fc1ffb6e` run from the Founder's machine (runner `run_id` `6dac6f12-1d0c-4102-9b19-6da4ae19f446`) | 2026-10-02 07:43:10Z to 07:43:14Z; `schema_migrations` row `2026-10-02 07:43:12.872774+00` | the Founder's paste; the row read by the builder |
| builder's read-only reads of production: ledger 0001 to 0006; `command_journal_events` and `command_journal_chain_head` owned by `br_journal_owner`; neither new role holds CREATE on schema `public`; `neondb_owner` holds both roles with ADMIN OPTION only (no SET, no INHERIT); `command_journal_events` 0 rows; `build_room_gate_runs` absent | 2026-10-02 between 09:09Z and 09:25Z | `run_sql` as `neondb_owner` |
| 0007 applied through Gate IV (run 37028874575) | 2026-10-02 16:27:31Z to 16:27:33Z; `schema_migrations` row `2026-10-02 16:27:32.833553+00` | the evidence above; the row read by the builder at 16:33Z |
| builder's read: ledger 0001 to 0007; `build_room_gate_runs` present, owned by `neondb_owner`, three immutability triggers, 0 rows | 2026-10-02 16:33Z | `run_sql` as `neondb_owner` |

Neon lists one branch in the project, created 2026-08-17, and no
deleted branch (read with `include_deleted`, 2026-10-02 09:09Z). Two
`apply_config` operations on the production endpoint at 09:04:05Z and
09:06:00Z on 2026-10-02 are of unstated origin.

## Railway

| Deployment | Created (UTC) | What | Outcome |
|---|---|---|---|
| `0b81ceb8` | 2026-10-02 11:40:58Z | automatic deploy of `main` at `e2a7828c` | FAILED: `schema preflight failed: required migration id(s) absent from schema_migrations: 0007_gate_runs`; later REMOVED |
| `1cd7ff6b` | 2026-10-02 19:36:00Z | the Founder's redeploy of the 2026-09-16 build (`0edf2604`), 121 commits behind `main` | SUCCESS; booted with `migrationsPresent: 5` |
| `1837c5df` | 2026-10-02 23:17:18Z | the builder's redeploy of the `0b81ceb8` build (`e2a7828c`), on the Founder's reply `continue` (22:42:14Z) to the builder's recommendation to deploy `main`; the builder read that reply as the go | SUCCESS: `boot.preflight` `migrationsPresent: 7`, `boot.listening` 23:17:55Z, `/health` 200 from the new container at 23:18:02Z |

The redeploys were outside the Gate IV acts, which authorize no deploy;
they are recorded here as the Founder's and the builder's acts
respectively.

## How the disposition was signed

- The builder showed the draft with empty `Signed:` and `Date:` lines
  on 2026-10-02 after 23:19Z, flagging four points for the Founder to
  keep or strike: FINDING 1's two statements on the Founder's word,
  FINDING 4's unstated operations, REMEDIATION 3 and 4 as new
  direction, and the disposition label.
- The Founder replied, verbatim: "keep all, signed and dated, land it",
  on 2026-10-03 (UTC). On that instruction the builder filled the two
  lines (`Signed: Michael Daley`, `Date: 2026-10-03`) and landed the
  file at the path the disposition's CUSTODY clause names. No other
  line differs from the draft shown, verified with `diff`. The file
  name carries the date of the application it rules on; the signature
  carries the date of adoption.

## What the builder verified and what it did not

- Verified against live systems, read-only: the production ledger and
  role state (Neon `run_sql`), the Neon branch list and operations, the
  workflow runs, jobs, logs and approvals (GitHub API), the Railway
  deployments, DNS and boot logs, and `main`'s tip before each dispatch.
- Verified against each other: the pasted stage-5 evidence of run
  37028874575 (both SHAs equal the act's; one migration applied; before
  and after lists equal the builder's reads at 15:42Z and 16:33Z; the
  ledger row's time falls inside the runner's `started_at` and
  `finished_at`).
- Recorded on the Founder's word, consistent with the evidence but not
  independently observed: that the connection string pasted at 07:43Z
  was production's (the ledger row is the consequence); that the
  Founder created no Neon branch (Neon lists none).
- Not stated: the origin of the two endpoint operations at 09:04:05Z
  and 09:06:00Z.
- Not read by the builder: the run Summary pages. The stage-5 evidence
  is the Founder's paste, cross-checked as above.

## Provenance and transport

| Step | Identity |
|---|---|
| Acts and confirmation drafted | by the `builder` seat as templates, filled and posted by the Founder in session |
| Dispatches | run 36836638497 and run 37028874575 dispatched by the builder session through the GitHub API under the `decivantiq` account, each after the Founder's act and, for run 3, the Founder's `DISPATCH IF CLEAN` |
| Approvals | `daley40-lab`, platform-recorded on each run's environment deployment review |
| Disposition | drafted by the `builder` seat 2026-10-02; adopted by the Founder 2026-10-03, "keep all, signed and dated, land it" |
| Transport | files written by the builder from the session texts, each ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: "go ahead" (2026-10-02T09:29:17Z,
the record and the 0007 act), "DISPATCH IF CLEAN" (15:39:05Z),
"continue" (22:42:14Z, the deploy of `main`), and "keep all, signed and
dated, land it" (2026-10-03). Merge is a separate exact-SHA Founder act
under DEC-20260718-04; this receipt asserts none.
