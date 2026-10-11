# CUSTODY RECEIPT — two enrolled Gateways: the merge, migration 0009 and the deployment (2026-10-11)

**This receipt records the landing of four instruments and the evidence
for the acts three of them authorized: the Founder's ratification of his
merge of PR #109, the comment that merge rested on, his act applying
migration `0009_two_enrolled_gateways`, and his act deploying the code
that boots on it. It records the builder's reads and two findings. It
authorizes nothing.** Each instrument's own text governs. The harness
act of 2026-10-10 and its receipt are
`docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-two-gateways-harness-20261010.txt`
and
`docs/planning/command-journal/custody/CUSTODY-RECEIPT-two-gateways-harness-20261010.md`,
which landed with PR #109.

## The instruments

Each file is the comment's body as the GitHub API returns it, with CR
bytes removed, plus one final LF; the comments carried no final
newline. The three acts are byte-identical, after that normalization, to
the builder's drafts.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-two-gateways-merge-ratification-20261011.txt` |
| Git blob id | `0ff1e9174975e574ba0402930d02f8073838b9d6` |
| SHA-256 | `5ab794b6559169141e23133d1caa4abb4ee3b8ce516884aa0cfd1f5f893575dd` |
| Bytes | 2990 |
| Lines | 20 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261011-BR109-MERGE-RATIFICATION`, comment 6112080746 on PR #109, posted 2026-10-11T18:09:31Z from `decivantiq`, not edited |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-COMMENT-two-gateways-6104804586-as-edited-20261011.txt` |
| Git blob id | `d5da1fee27a8939e685b36692735bb71a94d2306` |
| SHA-256 | `d45375f0e41122e7585c9491e2759315cb3f14b85d8b17aa2bd06b1fac22affa` |
| Bytes | 1429 |
| Lines | 30 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | comment 6104804586 on PR #109, posted 2026-10-11T02:56:14Z and last edited 15:50:58Z, as it stands. The ratification's C1 files it here. It describes FounderOS PR #371 and authorizes nothing for PR #109 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-two-gateways-0009-apply-20261011.txt` |
| Git blob id | `62a979434b384994b51773d3185985bcf2d15d3f` |
| SHA-256 | `5fed8127f32eae161183f762e5f9b6d3fb66fc64182254969d228252a4e11240` |
| Bytes | 8204 |
| Lines | 76 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261011-BR-0009-APPLY`, comment 6112637352 on PR #109, posted 2026-10-11T19:09:30Z from `decivantiq`, not edited |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-two-gateways-deploy-20261011.txt` |
| Git blob id | `4acd400023068499871728db7c0fbd248b4d4792` |
| SHA-256 | `bed84f64ab7d7fa33ccf24c2f2b3a907b6229babcdc78bb229a9d76ff8547057` |
| Bytes | 5776 |
| Lines | 45 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261011-BR-348FAEC-DEPLOY`, comment 6114320016 on PR #109, posted 2026-10-11T22:03:04Z from `decivantiq`, not edited |

## The evidence

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/TWO-GATEWAYS-EVIDENCE-0009-pre-read-query-20261011.sql` |
| Git blob id | `66d574317a4b20eaffcfcd51d9d76aef49ed4066` |
| SHA-256 | `5a7e7598537b876f66512ec992a2fe750a5546c4bd0fa6e7b39cb52c594c4720` |
| Bytes | 2452 |
| Lines | 14 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the read-only query the builder wrote and tested on a throwaway PostgreSQL 16 at `0008`, run by the Founder before the apply; it opens `BEGIN TRANSACTION READ ONLY` and ends `ROLLBACK` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/TWO-GATEWAYS-EVIDENCE-0009-pre-read-20261011.json` |
| Git blob id | `ff4afd2093d66bfddbcc587ccc6da346d9819557` |
| SHA-256 | `c359050601d7f5197fed5b97766638fb50c74ba898605d7cea907e05528de44b` |
| Bytes | 1457 |
| Lines | 37 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's result of that query in the Neon SQL editor, as he delivered it in session, plus one final LF: database clock 18:40:16Z, role `neondb_owner`, PostgreSQL 18.6, `schema_migrations` 0001 to 0008 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/TWO-GATEWAYS-EVIDENCE-run38167186970-stage5-20261011.json` |
| Git blob id | `4dcf536c90ad1d8be4477684eaaab581cb97ca54` |
| SHA-256 | `a4dd9fd4dc4508dae89c5642f42780c83fe23f92e44b7d8bba5ced82d0f39e95` |
| Bytes | 1073 |
| Lines | 33 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | run 38167186970's stage-5 evidence, copied by the Founder from the run's summary page and delivered in session, plus one final LF. The workflow writes it only to the step summary, which no API the builder holds returns |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/TWO-GATEWAYS-EVIDENCE-0009-post-read-query-20261011.sql` |
| Git blob id | `a3858536961b61ca53af4d66226f0d65f8c817af` |
| SHA-256 | `0b721a4a51113463f9962ada5450c541025c5b5fd8764849684b7b0d9cd9bf56` |
| Bytes | 2656 |
| Lines | 14 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the read-only query the builder wrote and tested on the throwaway instance after applying `0009` there, run by the Founder after the apply |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/TWO-GATEWAYS-EVIDENCE-0009-post-read-20261011.json` |
| Git blob id | `1fb602acc4e254eab6d0ecf44f6c7650fbdf1208` |
| SHA-256 | `51a2d88a468bb9e66f3a24fce401c841c0b5c561e9975988e896ac48d449cb9e` |
| Bytes | 1546 |
| Lines | 37 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's result of that query, as he delivered it in session, plus one final LF: database clock 21:07:16Z, `schema_migrations` 0001 to 0009 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/TWO-GATEWAYS-EVIDENCE-deploy-fb691b45-health-polls-20261011.txt` |
| Git blob id | `fb83732ae38a9fd64a792c472ab171fbc110dd66` |
| SHA-256 | `6e239bd7d1cbb60f02a23a4370073562de83b485d6ae322db7cb165eb71b32be` |
| Bytes | 672 |
| Lines | 48 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's polls of public `/health`, 15 seconds apart, from 22:03:58Z to 22:16:03Z, one line each, status only |

## What happened, in order

All times are UTC on 2026-10-11.

| Time | Event | Source |
|---|---|---|
| 02:56:14Z | comment 6104804586 posted on PR #109, from `decivantiq`, carrying an authorization for FounderOS PR #371 | GitHub API |
| 15:50:58Z | comment 6104804586 last edited; its body still describes FounderOS PR #371 and its Tree field gives a commit SHA | GitHub API |
| 15:53:00Z | PR #109 merged by the Founder; merge commit `348faec182857f19dc80207d17c89d8483385a62`, parents `2ae30adf` and `38dc3503`, tree `c636ee1c8b4a118cbe179c5a564280eea2279208`, the reviewed tree; trailers intact; `attribution-shape-check.sh main` PASS | GitHub API, git |
| 15:55:09Z | deployment `7def1a14` at `348faec1` FAILED: `schema preflight failed: required migration id(s) absent from schema_migrations: 0009_two_enrolled_gateways`. `f1e0c145` at `2ae30adf` kept serving; `/health` 200 on 12 polls from 15:53:44Z to 15:56:34Z | Railway API, deployment log, public `/health` |
| 18:09:31Z | the ratification posted | GitHub API |
| 18:40:16Z | the Founder's pre-apply read | Neon SQL editor |
| 19:07:00Z | the Founder's read of the `db-admin-migration` environment, recorded in the apply act | `gh api`, Founder side |
| 19:09:30Z | the apply act posted | GitHub API |
| 19:14:41Z | DB Admin Migration dispatched by the builder as `decivantiq`, on `main` at `348faec1`, `tranche_id` `0009_two_enrolled_gateways`, after every dispatch condition held; run 38167186970. Preflight succeeded 19:14:46Z to 19:14:50Z | GitHub API |
| 21:05:12Z | the migrate job started; the platform records the approval as `daley40-lab`, environment `db-admin-migration` | GitHub API |
| 21:05:26.198Z to 21:05:27.274Z | the runner: expected and observed SHA `348faec1`; `applied_migration_ids` exactly `0009_two_enrolled_gateways`; `schema_migrations` 0001 to 0008 before, 0001 to 0009 after. Production records `0009` at 21:05:26.710498Z | stage-5 evidence, post-apply read |
| 21:05:29Z | run 38167186970 success | GitHub API |
| 21:07:16Z | the Founder's post-apply read: `2222132d` enrolled in slot 1, `4369975d` and `48476acc` with no slot; the one-Gateway-per-slot index, the two slot CHECKs and the trigger present and the one-enrolled index gone; the refusal CHECK including `enrollment_cap_reached`, the one existing refusal row unchanged; `br_app_runtime` holding its previous privileges plus `UPDATE (enrollment_slot)`; every object owned by `neondb_owner` | Neon SQL editor |
| 22:03:04Z | the deploy act posted | GitHub API |
| 22:03:29Z to 22:04Z | every redeploy condition held: `main` at `348faec1`; Railway with `7def1a14` FAILED, `f1e0c145` SUCCESS, nothing staged; `/health` 200; no DB Admin Migration run active | GitHub and Railway APIs, public `/health` |
| about 22:04Z | redeploy of `7def1a14` requested by the builder through the Railway API; the call returned deployment `fb691b45-9e0a-4575-880f-644ec0986c77`, `INITIALIZING`. Railway records it as created at 22:07:21.280Z, reason `redeploy`, commit `348faec1` | Railway API |
| 22:07:25Z to 22:07:44Z | Railway built an image from a source snapshot (finding 1) | build log |
| 22:07:51.860Z | `Starting Container` | deployment log |
| 22:07:52.635Z | Railway's health check of `/health` succeeded on the first attempt | build log |
| 22:07:55Z | `fb691b45` SUCCESS | Railway API |
| 22:07:59Z | `f1e0c145` REMOVED; at 22:08:00Z to 22:08:04Z its container logged `npm error signal SIGTERM` for `node dist/packages/control-plane/src/main.js`, from its log file of 00:41:44Z, its own boot | Railway API, deployment log |
| 22:08:32.075Z | `gateway.leadership.serving`, generation 76 (the serving revision's last was 75) | deployment log |
| 22:03:58Z to 22:16:03Z | `/health` 200 on all 48 polls | public `/health` |

## Findings

**1. Railway rebuilt the image.** The deploy act says a redeploy reuses
the earlier deployment's build and nothing is rebuilt. That came from
the Railway tool's own description, which the builder did not verify.
The redeploy built a new image from a source snapshot, `c08606df`,
where `7def1a14`'s was `b7e8ae74`: `npm ci`, then `npm install
--include=dev && npm run build`. Railway records the deployment's
commit as `348faec182857f19dc80207d17c89d8483385a62`, and `npm ci`
installs exactly what `package-lock.json` pins. The code running is
therefore the reviewed commit's, built a second time; the image is not
the one built at 15:53Z.

**2. No boot line was logged.** The deploy act's EVIDENCE names the
deployment's `boot.start`, `boot.preflight` and `boot.listening` lines,
verbatim. Railway's log API returns none of them for `fb691b45`, by
deployment, by service or by filter, and the Founder found none in the
dashboard's deploy logs. The boot is shown by the code instead: in
`packages/control-plane/src/main.ts` at `348faec1` the order is
config, pool, preflight, listen, and a preflight failure logs
`boot.failed` and exits before `app.listen` runs; Railway's health
check reached `/health` at 22:07:52.635Z, so the preflight, which
requires `0009` and enforces the privilege audit, passed. The likely
cause, not shown: the boot completed within a second of `Starting
Container`, before Railway attached its log stream. On `f1e0c145`'s
boot those three lines were captured 22 milliseconds before that line.
The same logger's `gateway.leadership.serving` line was captured.

Neither finding was corrected. The deploy act's rollback was not used:
`/health` never failed.

## What the builder read and did not do

- Every repository fact in the two acts was read from git: the workflow
  file's blob `5061f1d5` unchanged since `42ae00c0` and `a9aefb34`; the
  runner's one change, in PR #107; `migrations.ts` gaining only `0009`
  since `42ae00c0`; the preflight byte-identical in `2ae30adf` and
  `348faec1`.
- The builder rehearsed `0009` with the runner on a throwaway local
  PostgreSQL 16 carrying the same Gateway and refusal rows, and wrote
  and tested both read queries there. It never connected to production;
  every production read in this receipt is the Founder's.
- The builder holds no connection string or password, and called no
  tool that returns a variable's value.
- Nothing else was deployed, redeployed, rolled back, enrolled, revoked
  or minted. Production has one enrolled Gateway, `2222132d`, in slot 1.

## Provenance and transport

| Step | Identity |
|---|---|
| Ratification, both acts, environment read, both database reads, approval of the migrate job | the Founder (`decivantiq` for the comments, `daley40-lab` for the approval) |
| Merge of PR #109 | the Founder |
| Dispatch of run 38167186970, redeploy request, Railway and GitHub reads, health polls | the builder session, under the two acts |
| Stage-5 evidence | copied by the Founder from the run's summary page |
| Transport | files written by the builder from the GitHub API and from the Founder's in-session deliveries, ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the ratification's C1 and the two
acts' CUSTODY clauses. Merge is a separate exact-SHA Founder act under
DEC-20260718-04; this receipt asserts none.
