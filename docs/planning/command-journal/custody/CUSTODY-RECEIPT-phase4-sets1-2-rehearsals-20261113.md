# CUSTODY RECEIPT — counted sets 1 and 2, the two rehearsals and the bearer rehearsal (filing B)

**This receipt records the landing of the evidence of five Phase 4 runs
made between 2026-11-03 and 2026-11-06, and authorizes nothing.** No run
here counts toward Section 7 item 13: both counted sets were spent at
their first label, and the three rehearsals count for nothing by their
acts.

Each act files its evidence under C1 of
FOUNDER-RULING-20261015-BUILD-ROOM-TO-DONE, with every user name, host
name, address, tailnet name, node key and account name masked, and no
token: F2 of `FOUNDER-ACT-20261102-BR-PHASE4-COUNTED-RUNS` (with its
Amendments 1 D1 and 2 C1), F1 of `FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL`,
whose Parts B3 to F govern rehearsal 2 too (D2 of
`FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL-FIXES`), F2 of
`FOUNDER-ACT-20261104-BR-PHASE4-COUNTED-RUNS`, and V6 of Amendment 7 of
`FOUNDER-ACT-20261105-BR-BEARER-SHAPE`. Each act and amendment is on
`main`, filed by pull request 155. This is part of the filing the
Founder's authorization of pull request 154 (comment 6842976612)
reserved for a separate pull request, with its scope set in the
builder's session as "everything owed" (2026-11-13T04:11:02Z). The
account name is not masked, by his ruling of 2026-11-13T11:42:33Z
(finding 8).

With this receipt, 37 files land here: 4 run records with their 4
digest files, 5 attempts logs, 5 terms files, 2 plans, 5 room exports,
3 journal reads, 6 Planner executor records, 1 revision feedback file,
the Founder's readings and the builder's audit record.

## How each file was checked

By script, against the files as they stand in this filing:

- Each terms file's SHA-256 and size are the ones its governing act
  names, and its SHA-256 is the one its attempts log names.
- Each run record's `phase4RecordDigest`, recomputed, equals its digest
  file and the attempts log's `recordDigest`; each record says
  `journalVerified: true`.
- Each plan's `planHash`, recomputed, equals the hash in its name, and
  each is the plan its round's command row names.
- Each room export's `roomId` is its room and its `logLength` its event
  count; where a record exists, its events are the record's, the same
  event ids in the same order.
- Each journal read answers `verified: true`. For counted set 1 and
  rehearsal 2, its command rows are the record's, and its decision rows
  are the record's with the route's `recordedState` added.
- The three journal reads and three exports read in a window hash to the
  SHA-256 the builder recorded when the Founder read them.
- Each command has one Planner executor record, whose `commandId` is
  that command and whose file name is the SHA-256 of the command id.
- The bearer rehearsal's revision feedback hashes to the digest its
  record journaled.

Every file but the bearer rehearsal's feedback (finding 6) came byte
for byte from the Founder's machines by the transport of finding 9.

## The Founder's lines

Verbatim from the builder's session; times are when the session
received each. A "/" stands for a line break.

| Received | Line | What followed |
|---|---|---|
| 2026-11-02T13:11:49.919Z | I sign FOUNDER-ACT-20261102-BR-PHASE4-COUNTED-RUNS as delivered | signed counted set 1's act |
| 2026-11-03T02:16:20.087Z | I sign both amendments as delivered | signed that act's Amendments 1 (D5) and 2 (D6's freeze) |
| 2026-11-03T13:01:57.149Z | I sign FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL (6623ce5b…0998) as delivered | signed rehearsal 1's act |
| 2026-11-03T13:43:30.893Z | his terminal: the plan-decision POST for room 87dd8cbf…, `plan.approved` of `f55f7200…42fe`, answered `"outcome":"transition"` | rehearsal 1's decision, 18 min after its runner had stopped (finding 1) |
| 2026-11-03T13:45:27.126Z | Phase4-CR1: passed | a misreading of the runner's output (finding 1) |
| 2026-11-03T13:54:21.616Z | the runner's scrollback, ending "Phase4-CR1: interrupted at 2026-11-03T13:25:05.933Z: fetch failed" / "The set is spent: a new act is needed for another attempt." | rehearsal 1's outcome |
| 2026-11-03T14:16:23.695Z | I sign FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL-FIXES (af53b493…5f94) as delivered | signed the fix act |
| 2026-11-04T11:39:00.408Z | I sign Amendment 1 of FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL-FIXES (847caeb7…f815) as delivered | signed Part D, rehearsal 2 |
| 2026-11-04T23:39:11.274Z | I sign FOUNDER-ACT-20261104-BR-PHASE4-COUNTED-RUNS (6ccac4bd…8339) as delivered | signed counted set 2's act |
| 2026-11-06T01:06:53.925Z | I sign Amendment 7 (1747dd7a…885a) as delivered | signed the bearer rehearsal (Amendment 7 of FOUNDER-ACT-20261105-BR-BEARER-SHAPE) |

Each run was started by the Founder on his MacBook, with the act's
runner command; the start is the "entry passed" time below.

## The runs

From each attempts log and, where there is one, the run record.

| Run | Room | Entry passed | Ended | Outcome | Failures | Final state | Record digest |
|---|---|---|---|---|---|---|---|
| Counted set 1 Phase4-CR1 | `1086e073-e181-49a9-a275-cd1e35541f7c` | 2026-11-03T02:28:10.062Z | 2026-11-03T02:29:13.388Z | interrupted | lifecycle_incomplete, command_not_clean | PLANNING | `a624ec9e…99be` |
| Rehearsal 1 Phase4-CR1 | `87dd8cbf-926a-4fe8-abec-3a480d7e9281` | 2026-11-03T13:12:31.820Z | 2026-11-03T13:25:05.919Z | interrupted | none | no record (finding 1) | none |
| Rehearsal 2 Phase4-CR1 | `7e82f03d-b0d5-45c1-84e8-776eb6a43285` | 2026-11-04T11:50:59.569Z | 2026-11-04T12:08:26.776Z | passed | none | BUILDING | `0417f0da…61a2` |
| Counted set 2 Phase4-CR1 | `64acc3e5-0016-4090-8efd-cf6657453399` | 2026-11-04T23:51:09.720Z | 2026-11-04T23:57:11.929Z | interrupted | lifecycle_incomplete, command_not_clean | PLANNING | `d67bc9a4…6c5a` |
| The bearer rehearsal Phase4-CR1 | `9c39c6eb-307a-4eb5-a455-e29afcc6754c` | 2026-11-06T01:42:07.338Z | 2026-11-06T02:05:06.042Z | interrupted | lifecycle_incomplete, command_not_clean | PLANNING | `5aa5155b…880d` |

Rehearsal 2 is the only one that passed.

### Rounds

| Round | Command | Ended | Plan | Decision |
|---|---|---|---|---|
| Counted set 1 round 1 | `cmd_planner_aeac012967b496da88a142b3a86a54b3` | failed | none | none |
| Rehearsal 1 round 1 | `cmd_planner_09d9bd0378ff1b684869d2dc29bdaf4f` | completed (journal read) | `f55f7200…42fe`, not saved by the runner | plan.approved (finding 1) |
| Rehearsal 2 round 1 | `cmd_planner_9db6ad285b5732315923514346d670cf` | completed | `939c75ba…08e2` | plan.approved |
| Counted set 2 round 1 | `cmd_planner_c82b82c3890525fa255df385b11b1463` | failed | none | none |
| The bearer rehearsal round 1 | `cmd_planner_3297befea962d0ce72924125cd2b4ae6` | completed | `32d314e5…6e0e` | plan.revision_requested |
| The bearer rehearsal round 2 | `cmd_planner_02a25763402e5f7af4949f048ade1657` | failed | none | none |

### Windows

Opening deployments are from each record, closing ones from the
builder's audit record, filed here.

| Window | Opened by deployment | Closed by deployment | Closed by | Note |
|---|---|---|---|---|
| Counted set 1 | `09b2be1c` | `8032cbe1`, new start 2026-11-03T02:40:14Z | the Founder (E6) |  |
| Rehearsal 1 | `86d201aa` | `ce7b0227`, new start 2026-11-03T13:51:55Z | the Founder (E1) | no record names the opening deployment; it is from the audit record |
| Rehearsal 2 | `abbb2821` | `3628658c`, SUCCESS 2026-11-04T12:19:34Z | the Founder (E1) |  |
| Counted set 2 | `31276e02` | `2aaf1399`, new start 2026-11-05T01:18:48Z | the Founder (E6) | 1 h 21 min after the runner stopped (finding 7) |
| The bearer rehearsal | `9d442c32` | `356e3d69`, SUCCESS 2026-11-06T02:28:08Z | the Founder (E6) |  |

## The causes

From the builder's audit record, where each is set out with its reads.

- **Counted set 1:** round 1 failed `unparseable_plan`. agy's answer
  ended on a `run_command` step with no plan after it. The prompt fix
  act of 2026-11-03 followed.
- **Rehearsal 1:** the runner's room-state poll failed once ("fetch
  failed") while the control plane was serving, and the runner had no
  retry, so one transient failure ended the run (finding 1). The fix
  act of 2026-11-03 added a request timeout and a retry.
- **Counted set 2:** round 1 failed `plan_refused`. The plan store's
  credential guard refused the plan because its `bearer_token` pattern
  matched ordinary English ("bearer" followed by a word) in three
  places. `FOUNDER-ACT-20261105-BR-BEARER-SHAPE` followed.
- **The bearer rehearsal:** round 1's plan was stored, which set 2's
  could not be, and the Founder asked for a revision. In round 2, Google's
  Cloud Code API answered agy's twelfth model request with `NOT_FOUND`
  (404); agy ended with an error and no response, and the control plane
  classed the round `planner_reported_failure`. The evidence implicates
  nothing in Build Room, the bearer change, the control plane, the
  Gateway or the PC's configuration; what was not found is not in the
  log.

## The evidence, by run

### Counted set 1

Governed by `FOUNDER-ACT-20261102-BR-PHASE4-COUNTED-RUNS`.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET1-terms.json` |
| Git blob id | `998046070e84eb39342aab573113b54aee83ae12` |
| SHA-256 | `dcf26438b66a9b0e23ae5d9af8ac3fbba353e04e531442a9127c77d6e9e109f8` |
| Bytes | 1927 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Counted set 1's terms; Amendment 1 B5 of its act names this SHA-256 and size |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET1-attempts.json` |
| Git blob id | `f2d09a15f4b756e88faa1e255b87af40abaddc38` |
| SHA-256 | `8b9268f7f03a013bb57e815fbd600e801cd82dbc6e745feb818af94c9038d352` |
| Bytes | 903 |
| Lines | 27 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log (`evidence/attempts.json`), set id `FOUNDER-ACT-20261102-BR-PHASE4-COUNTED-RUNS` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET1-Phase4-CR1-1086e073-e181-49a9-a275-cd1e35541f7c.record.json` |
| Git blob id | `461db33d3b82c8be1ae8607893c513f3541407f5` |
| SHA-256 | `f2c94ac2e0034564a08389b1c3c00d2ffadfecff89bf075d8bc0fda6471622a5` |
| Bytes | 4434 |
| Lines | 117 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `1086e073-e181-49a9-a275-cd1e35541f7c`; outcome interrupted; `phase4RecordDigest` `a624ec9ed984e2aea35fcd7a6b3c128664f72f1c84d7ab42494e1c721d4e99be` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET1-Phase4-CR1-1086e073-e181-49a9-a275-cd1e35541f7c.record.sha256` |
| Git blob id | `69c2370aaaff5074c70107b12cd4d9b7d1d5bbd9` |
| SHA-256 | `bd4ee96e9e53ba057135daecdae5b667ab4ff0191ef95a311df8467decdc367f` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file: `a624ec9e…99be`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET1-export-1086e073-e181-49a9-a275-cd1e35541f7c.json` |
| Git blob id | `d903a370577f08ed5d4299ca9a9cabee307df8a6` |
| SHA-256 | `f0885e991fdc769e803c7d2af5da7a40869099ffa3231d6b307fca8286c4dd49` |
| Bytes | 3555 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `1086e073-e181-49a9-a275-cd1e35541f7c`'s export, read 2026-11-03T02:37:00.466Z in a window, from the control plane at `03cd29f`; the builder recorded its SHA-256 at 2026-11-03T02:37:18Z; one line of JSON as served, 2 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET1-journal-1086e073-e181-49a9-a275-cd1e35541f7c.json` |
| Git blob id | `628a0ca2dc683ad547135ff34d2cc3f53de8542b` |
| SHA-256 | `c5fd9df0afe841a95a59d3572b96e71047f012c350ef4844a15e0ee072e33057` |
| Bytes | 2288 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `1086e073-e181-49a9-a275-cd1e35541f7c`'s journal route read in a window (deployment `09b2be1c`): its command and decision rows, `verified: true`, head seq 4; the builder recorded its SHA-256 at 2026-11-03T02:37:18Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET1-planner-evidence-CR1-round1-0f32d7da77b3c6e1726ba847af0a0452e40adddbfde510450ecd160c9f1fc915.json` |
| Git blob id | `c632242753d129edc364302f1dd30442ef0a1019` |
| SHA-256 | `82be97f913ef828a10238bba771dcb4f351ca7795c93105a002282ad5987b4bc` |
| Bytes | 450 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of round 1, command `cmd_planner_aeac012967b496da88a142b3a86a54b3`; its file name on the PC is the SHA-256 of the command id |

### Rehearsal 1

Governed by `FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL`.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL1-terms.json` |
| Git blob id | `7c32f90ddc1f5ee6f24e4c42b03755d65a06f4ef` |
| SHA-256 | `062b6cdaa53b2958198c8d5a0a35948e83177b3949cc0b19261046f9883ccc50` |
| Bytes | 1924 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Rehearsal 1's terms; B2 of its act names this SHA-256 and size |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL1-attempts.json` |
| Git blob id | `84a26eb660bbfaef7ab24733e9f6a73c6e9de5fd` |
| SHA-256 | `eeff4f404d80e60f57223d62f4d90ad0bbe2a0459847bfda0c393441942bbf7f` |
| Bytes | 774 |
| Lines | 24 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log (`evidence/attempts.json`), set id `FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL1-export-87dd8cbf-926a-4fe8-abec-3a480d7e9281.json` |
| Git blob id | `aff00f8001096fcb795040ed872aef14ea2060a7` |
| SHA-256 | `612ab212e9ebb947d7a941a2a43752ed44a8283b7551b1334b388cf7464990c4` |
| Bytes | 6640 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `87dd8cbf-926a-4fe8-abec-3a480d7e9281`'s export, read 2026-11-04T12:10:43.692Z in a window, from the control plane at `5cbadd4`; the builder recorded its SHA-256 at 2026-11-04T12:11:06Z; one line of JSON as served, 4 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL1-journal-87dd8cbf-926a-4fe8-abec-3a480d7e9281.json` |
| Git blob id | `54d3d458c881f12e86c871481ca91cca26b85574` |
| SHA-256 | `af13c66c4efc8db8826f4dd1fd6d0e7c895ede3944840832f9f709b077197b64` |
| Bytes | 2630 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `87dd8cbf-926a-4fe8-abec-3a480d7e9281`'s journal route read in a window (deployment `abbb2821`): its command and decision rows, `verified: true`, head seq 14; the builder recorded its SHA-256 at 2026-11-04T12:11:06Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL1-planner-evidence-CR1-round1-c4e4434478e5c14054b82a1632d1324997d78e057a3062f6ee15c20b51ef0e74.json` |
| Git blob id | `7d79e59bf1e7177bd814457ec7464f564c9feff4` |
| SHA-256 | `9c6f22f24acc952b500b25c4193f187febc130ac371c871a94d465b240d94755` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of round 1, command `cmd_planner_09d9bd0378ff1b684869d2dc29bdaf4f`; its file name on the PC is the SHA-256 of the command id |

### Rehearsal 2

Governed by `FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL-FIXES (its Amendment 1, Part D)`.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL2-terms.json` |
| Git blob id | `1fc1bb488798cc5f4625355795029776d708b6bc` |
| SHA-256 | `73b294eedd9c6bae26e4ff38fb76ec70f567c372c2fb10588a059e2568d16981` |
| Bytes | 1930 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Rehearsal 2's terms; Amendment 1 B5 of its act names this SHA-256 and size |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL2-attempts.json` |
| Git blob id | `bd26f2204755ae18738773a3340640a3c99cd5e0` |
| SHA-256 | `9a6c1db4d43979c28f675d0fed4b1b76528ad15f03ec7cc9339d29c96b83c8ff` |
| Bytes | 834 |
| Lines | 24 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log (`evidence/attempts.json`), set id `FOUNDER-ACT-20261103-BR-PHASE4-REHEARSAL-FIXES` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL2-Phase4-CR1-7e82f03d-b0d5-45c1-84e8-776eb6a43285.record.json` |
| Git blob id | `d05904f33fb99f0fce91427e5b75bdbda811b629` |
| SHA-256 | `91883309371c3d328ab1dcbe70fb1fb0f59acdd6c3b4e9155fb9909c07c0d555` |
| Bytes | 6157 |
| Lines | 166 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `7e82f03d-b0d5-45c1-84e8-776eb6a43285`; outcome passed; `phase4RecordDigest` `0417f0daac8473cf9ad24f88815b8c1e76d530e48c36522ca334002ba82161a2` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL2-Phase4-CR1-7e82f03d-b0d5-45c1-84e8-776eb6a43285.record.sha256` |
| Git blob id | `000f85853a622313599fb5984127dee203cd2284` |
| SHA-256 | `bb6d26070c7efce4a56467b37c8522bd51b865ee3c8d6e8942b8d1fb0c502397` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file: `0417f0da…61a2`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL2-plan-939c75baf9e3c0668bbfa418ff0d10ad1cc32352a546af799dd97a6a8d8808e2.json` |
| Git blob id | `9ae61abd6bb86fc0d8aa7b73023755096bf4254a` |
| SHA-256 | `5b784cfb33e0c4d16d8b21f63da8287865b044370cbf30acf0b3e2cc5664602d` |
| Bytes | 31285 |
| Lines | 73 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of round 1, command `cmd_planner_9db6ad285b5732315923514346d670cf`, as the runner saved it; decision: plan.approved |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL2-export-7e82f03d-b0d5-45c1-84e8-776eb6a43285.json` |
| Git blob id | `a4a3020e89110eef4898cbe225440597aaed5c15` |
| SHA-256 | `ecd86690d9d954d4b453bf0e6f760775b6f4c0d5d97051c16ddff0706256d224` |
| Bytes | 6640 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `7e82f03d-b0d5-45c1-84e8-776eb6a43285`'s export, read 2026-11-04T12:10:44.020Z in a window, from the control plane at `5cbadd4`; the builder recorded its SHA-256 at 2026-11-04T12:11:06Z; one line of JSON as served, 4 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL2-journal-7e82f03d-b0d5-45c1-84e8-776eb6a43285.json` |
| Git blob id | `748f3633ce2cd03677df6cd1d14ac9a609e9d8ab` |
| SHA-256 | `501f433c6b50acbfdd59db4e922d58be89086f01798c48ee443e76b29a91fd6f` |
| Bytes | 2640 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `7e82f03d-b0d5-45c1-84e8-776eb6a43285`'s journal route read in a window (deployment `abbb2821`): its command and decision rows, `verified: true`, head seq 14; the builder recorded its SHA-256 at 2026-11-04T12:11:06Z |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-REHEARSAL2-planner-evidence-CR1-round1-6b465089ba797b0a1e4e27daca558f3a6a97483dadec544642d20a3488931601.json` |
| Git blob id | `3e34e827b9c5fb324009647e57de2a5f700165c0` |
| SHA-256 | `280105bdf530fd2bf619508bc7b504b920584305cc7723cd0488158a087dcc72` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of round 1, command `cmd_planner_9db6ad285b5732315923514346d670cf`; its file name on the PC is the SHA-256 of the command id |

### Counted set 2

Governed by `FOUNDER-ACT-20261104-BR-PHASE4-COUNTED-RUNS`.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET2-terms.json` |
| Git blob id | `d01a1c4673d5c409576ef7f8c12f41da32f7f96b` |
| SHA-256 | `786f3ea2b422d35c1d8c7aae919315a032e2fc82f264ba93c5003f9ce1ef0630` |
| Bytes | 1927 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Counted set 2's terms; C3 of its act names this SHA-256 and size |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET2-attempts.json` |
| Git blob id | `cd9c0fff43bcd9315c4427157ede77b94a076d1d` |
| SHA-256 | `92a3606c025d1aa101bc3d7e40cda928665c6470385e7f386edeabf4d69b36b3` |
| Bytes | 903 |
| Lines | 27 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log (`evidence/attempts.json`), set id `FOUNDER-ACT-20261104-BR-PHASE4-COUNTED-RUNS` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET2-Phase4-CR1-64acc3e5-0016-4090-8efd-cf6657453399.record.json` |
| Git blob id | `47f34a4a6fcc103ac5b1401e3232a98090bd6dd6` |
| SHA-256 | `039aff397832489f1ab30427a3e9d4964a80948b2dfac2bc48ef6e9860798b3e` |
| Bytes | 4524 |
| Lines | 119 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `64acc3e5-0016-4090-8efd-cf6657453399`; outcome interrupted; `phase4RecordDigest` `d67bc9a440b037e900a9dfccb7c196c562f4ce064d5446eacf98e7637e396c5a` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET2-Phase4-CR1-64acc3e5-0016-4090-8efd-cf6657453399.record.sha256` |
| Git blob id | `3d490f1c73356312962f797041533934a0e7fe92` |
| SHA-256 | `e4f86c62fbd27a907be19f9f78b6e4262e7059eb6b9fa2918967ef7ddbcbd93d` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file: `d67bc9a4…6c5a`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET2-export-64acc3e5-0016-4090-8efd-cf6657453399.json` |
| Git blob id | `9c915bfa5d4650d2576e3db07721d6da542584c2` |
| SHA-256 | `c1247bfd8ac80442225fbdeef9eb63087724161e31df2b59c3768d3bc8e77e3f` |
| Bytes | 3555 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `64acc3e5-0016-4090-8efd-cf6657453399`'s export, read 2026-11-13T04:43:59.622Z after the run, from the control plane at `adde0a9` (finding 3); one line of JSON as served, 2 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET2-planner-evidence-CR1-round1-208c63d0832fda18f3c8c67f2d16366648643edb5ad1b161e7aee12630d485a7.json` |
| Git blob id | `6152ddb92f625393e9dd6ea7285f22189f4a6c07` |
| SHA-256 | `88859d16f90d0ce3eee1e21176a566187ec1077f9862df66805d8249e420d290` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of round 1, command `cmd_planner_c82b82c3890525fa255df385b11b1463`; its file name on the PC is the SHA-256 of the command id |

### The bearer rehearsal

Governed by `FOUNDER-ACT-20261105-BR-BEARER-SHAPE (its Amendment 7)`.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-BEARER-REHEARSAL-terms.json` |
| Git blob id | `99f561094e2ffe7a1d41fa37d3deb0d642819a7f` |
| SHA-256 | `57feb3e779f03a6185c79ed251f24ca04c2d18945be223a894d73b2dc8a26172` |
| Bytes | 1920 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | The bearer rehearsal's terms; Amendment 7 V2(e) of its act names this SHA-256 and size |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-BEARER-REHEARSAL-attempts.json` |
| Git blob id | `c71cecc67839799febeac01966bffe86dfb39648` |
| SHA-256 | `969beae1070cd86f775d6fffb9c159d515e27088c338c2c580760e8408b8d90f` |
| Bytes | 896 |
| Lines | 27 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log (`evidence/attempts.json`), set id `FOUNDER-ACT-20261105-BR-BEARER-SHAPE` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-BEARER-REHEARSAL-Phase4-CR1-9c39c6eb-307a-4eb5-a455-e29afcc6754c.record.json` |
| Git blob id | `a1b75f0b0ff6b9eecb87556baa3997ef927680ab` |
| SHA-256 | `7ce6afbb7743af3fd9d103004dfb8705261d0694290a12931ec32d48843e276a` |
| Bytes | 9399 |
| Lines | 243 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `9c39c6eb-307a-4eb5-a455-e29afcc6754c`; outcome interrupted; `phase4RecordDigest` `5aa5155b6aaf125a9f731d8189924724c233e8a3761a8d00a728855bb03c880d` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-BEARER-REHEARSAL-Phase4-CR1-9c39c6eb-307a-4eb5-a455-e29afcc6754c.record.sha256` |
| Git blob id | `6ac6bc3cef14f61d31db9dba0ff9403ae3e6b002` |
| SHA-256 | `82c0fe0845fdf1db63f942a90c1f34c71420492de5762f51b295dc133e360e7b` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file: `5aa5155b…880d`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-BEARER-REHEARSAL-plan-32d314e5c9411bbb8293555dd7205fe36546743ec05918821383aa8fb0ab6e0e.json` |
| Git blob id | `2808b027b00a500dd835c1c027eff6cfc14299d8` |
| SHA-256 | `63cf28021094aadc8f32e5c596b78d19485e7e05795d456d8315a05ec49a297c` |
| Bytes | 31364 |
| Lines | 84 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of round 1, command `cmd_planner_3297befea962d0ce72924125cd2b4ae6`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-BEARER-REHEARSAL-export-9c39c6eb-307a-4eb5-a455-e29afcc6754c.json` |
| Git blob id | `3e7487702f22db416d5aed2a0c497265eba5e4f6` |
| SHA-256 | `d2b191dd86b3fbdca41eea9fe2116f8e2b9351a313a4f760ca2d0749a7be8cd8` |
| Bytes | 7901 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `9c39c6eb-307a-4eb5-a455-e29afcc6754c`'s export, read 2026-11-13T04:43:59.481Z after the run, from the control plane at `adde0a9` (finding 3); one line of JSON as served, 4 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-BEARER-REHEARSAL-planner-evidence-CR1-round1-2eeb8a7cc4a68d9a4802ec077302cb11efd5002391c3f48649b57f2b60c4b578.json` |
| Git blob id | `2179af8979127cd0130777138a6c5a196c059aa4` |
| SHA-256 | `a254709a95fe98c563420a3a832e939d09c1165666769f43aae47adb70921610` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of round 1, command `cmd_planner_3297befea962d0ce72924125cd2b4ae6`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-BEARER-REHEARSAL-planner-evidence-CR1-round2-2f7ccfde6bfacf434b521a4f9fb0e0a2ce35303269e1263a4ff402ec42490be8.json` |
| Git blob id | `63ac7593bca2dba5d9a1a1db00c61bf7b2984bea` |
| SHA-256 | `ba993215923021e713d45dc0c5fc9f90ab538c17adb6fda85179feaae8d0ddf2` |
| Bytes | 1409 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of round 2, command `cmd_planner_02a25763402e5f7af4949f048ade1657`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-BEARER-REHEARSAL-revision-feedback-round1.txt` |
| Git blob id | `848ef3fe0b02ef0cac86a8c64a0e95926038d345` |
| SHA-256 | `bdf770d22f580a308b982168fb2a2d45c6fb934131ddd37b0a118ea93c27f207` |
| Bytes | 1088 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | the builder's revision feedback for round 1, sent with the Founder's revision; it hashes to the journaled digest `bdf770d2…f207` (finding 6) |

## The extracts

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SETS1-2-EVIDENCE-founder-readings-20261102-20261106.txt` |
| Git blob id | `a325912e7cdee82ae97c2fe5dedd9e448063ea12` |
| SHA-256 | `23810342bb5ac8dfadad0b9a4e49c8e6c5d373be3136483d4fb05b02967e98e4` |
| Bytes | 245167 |
| Lines | 2891 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's lines, readings and outputs in the builder's session, 2026-11-02T10:30Z to 2026-11-06T03:05Z, 216 messages, masked (finding 8); no plan he pasted in that period parses as it stands, so none is replaced |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SETS1-2-EVIDENCE-builder-audit-20261102-20261106.txt` |
| Git blob id | `ebcb8067df8ed10938dfc40b3d19bb8f51c640e9` |
| SHA-256 | `0b8af10f08d9d25555da93bde79ed13a15b56c5c8c79a2eeca95ad742ed09134` |
| Bytes | 96566 |
| Lines | 258 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's audit record for the same period, verbatim, masked (finding 8) |

## The journal rows

For counted set 1 and both rehearsals, the Founder read the journal
route while a window was open, and the reads are filed above. For
counted set 2 and the bearer rehearsal he did not. For those two, the
command rows inside each run record stand for the journal rows, by his
answer at 2026-11-13T04:44:35Z to the builder's question of 04:32:29Z,
which asked to apply set 3's ruling to every run before set 3:

> yes” on journal rows.

## Findings

1. **Rehearsal 1 wrote no record.** The runner's room-state poll after
   13:24:50Z never reached the control plane. At 13:25:05.933Z the
   runner printed "interrupted … fetch failed" and wrote only its
   attempts log. The Founder's approval of the round 1 plan
   (`f55f7200…42fe`) reached the control plane at 13:43Z, after the
   runner had stopped, so the room went to BUILDING with no run
   watching. At 13:45:27Z he reported "Phase4-CR1: passed"; the builder
   found no record on disk, and the scrollback he then pasted showed the
   interruption. The runner also ran under Node v26.5.1, not v22; the act
   named no version, and this is not excluded as a factor. The plan
   was not saved by the runner and is not filed; its hash is in the
   export and the journal read.
2. **Rehearsal 1's export and journal were read in rehearsal 2's
   window**, on 2026-11-04 at 12:10:43Z, because the routes answer only
   while a window is open. The journal read names rehearsal 2's
   deployment `abbb2821`, the one that served it.
3. **Counted set 2's and the bearer rehearsal's exports were read
   after the runs**, on 2026-11-13 at 04:43:59Z, from the control plane
   at `adde0a9`. F1 of set 2's act names a journal read and an export
   the Founder takes in the window; neither was taken. Each export now
   holds exactly its record's events, and the journal rows stand on the
   ruling above.
4. **The causes**, above.
5. **Set 3's executor records came with this transport and are not
   filed again.** Seven of the transfer's records are counted set 3's,
   and each is byte for byte the copy pull request 154 filed.
6. **The bearer rehearsal's feedback is the builder's copy.** It has no
   final newline, and its SHA-256 equals the journaled digest as it
   stands.
7. **Counted set 2's window stayed open 1 h 21 min after its run.**
   The runner stopped at 23:57:11Z; the removal deployment was created
   at 01:07:41Z and took about 11 min to build, during a Railway partial
   outage the Founder pointed to; it served from 01:18:48Z. E6 of that
   act sets no time for the removal.
8. **Masking.** In both extracts, user names, the PC's host name, email
   addresses, IP addresses, tailnet names and node keys are masked; the
   raw files hold none of these, and no token is in any file. The
   account name is not masked: the Founder answered at
   2026-11-13T11:42:33Z, "Unmask the account name in all of filing B
   (my recommendation)."
9. **Transport.** The Founder pushed these files from his MacBook to the
   branch `founder/evidence-filing-b-20261113`, in commits
   `37cc3c305154dbfed536d802b2a37fa1de13519b` and
   `ae157305533704f38df5194f90ae7d8cb89b022e`, with hash lists his
   machines computed, which every file here matches. That branch is
   transport only and is not merged.

## Not filed here

- The acts and amendments themselves: on `main`, by pull request 155.
- The evidence of R1 to R11 and its period's extracts: their own
  receipt, in this same filing.
- The merge authorizations, reviews and deployment checks of the pull
  requests merged under these and the other acts of the period: their
  own receipt, in this same filing.

## Not authorized by this record

Anything. Filing this evidence changes nothing it records, and nothing
here starts, revives or extends any act, set or rehearsal.

## Identity

| Step | Identity |
|---|---|
| Each line, signature and decision | the Founder, in the builder's session |
| Runs, reads and the copies on his machines | the Founder, on his MacBook and his PC, with commands the builder gave |
| Transport | the Founder's pushed branch (finding 9) |
| Checks, extracts and this record | the builder session |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction ("draft the R1–R11 filing", "1",
"everything owed", and "File filing B, all three parts" at 2026-11-13T12:39:54Z, his authorization of this filing).
Merge is a separate exact-SHA Founder act under DEC-20260718-04; this
receipt asserts none.
