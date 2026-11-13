# CUSTODY RECEIPT — standing rehearsal tracks R1 to R11 (filing B)

**This receipt records the landing of the evidence of rehearsals R1 to
R11 under `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS`, with that
act's Amendments 1 and 2, and authorizes nothing.** Each rehearsal counts
for nothing under Section 7 item 13, passed or not (D7 of the act; E1 of
Amendment 2).

It is filed under F2 of the act ("Each rehearsal's evidence, kept as F1
of FOUNDER-ACT-20261104-BR-PHASE4-COUNTED-RUNS keeps a run's, Part E's
outputs, and each move's readings are filed with the next custody filing
under C1 of FOUNDER-RULING-20261015-BUILD-ROOM-TO-DONE"), E2 of
Amendment 1 and F2 of Amendment 2, which file those amendments and their
rehearsals' evidence the same way, and the Founder's authorization of
pull request 154 (comment 6842976612, 2026-11-13T03:32:33Z): "They go in
the separate filing of my ruling 3, with the R8 correction and R1 to
R11." In the builder's session he then said "draft the R1–R11 filing"
(03:50:17Z), chose two pull requests, "1" (03:55:52Z), and set this
filing's scope, "everything owed" (04:11:02Z). Pull request 155, the
first of the two, filed the signed instruments; this filing is the
second.

With this receipt, 148 files land here: 16 run records
with their 16 digest files, 11 attempts logs, 11 terms
files, 26 plans, 16 room exports, 32 Planner executor records,
16 revision feedback files, the two amendments, the Founder's
readings and the builder's audit record.

## How each file was checked

By script, against the files as they stand in this filing:

- Each run record's `phase4RecordDigest`, recomputed, equals its digest
  file and the attempts log's `recordDigest` for that room; each record
  says `journalVerified: true`.
- Each attempts log names the SHA-256 of its terms file, and each start
  line below names the same.
- Each plan's `planHash`, recomputed, equals the hash in its name, and
  each is the plan a command row of its run names as completed. Every
  plan filed is one some round produced.
- Each room export's `roomId` is the record's room and its `logLength`
  is its event count; its events are the record's events, the same
  event ids in the same order.
- Each command a record names has one Planner executor record, whose
  `commandId` is that command.
- Each revision feedback file, without its final newline, hashes to the
  digest the control plane journaled for a revision the record holds,
  and every such digest has its file.

Every evidence file but R1's feedback (finding 3) came to this
repository byte for byte from the Founder's machines by the transport of
finding 8, and each matches the hash lists computed on his machines. The
amendments are the builder's signed copies; the two extracts are the
builder's.

## The Founder's lines

Verbatim from the builder's session; times are when the session
received each. A "/" stands for a line break in the message.

| Received | Line | What followed |
|---|---|---|
| 2026-11-06T03:17:50.391Z | Rehearse R1 at c440a470046ef2cfe1408ccfff849e3586b1626b, terms 877304c34835b864c7446f83a75d073bfb83ca5fe598d92d8f8f0df01c19a5a7 | started R1 (D1) |
| 2026-11-06T12:36:24.955Z | Fix it | started one fix (B1), in answer to the defect the builder had named: a round failed because the Gateway's strict JSON parse rejected one invalid backslash escape in the Planner's answer |
| 2026-11-07T04:20:23.454Z | Move the Gateway to 3bc3c5211cef798cf54ff0d248d056a48b32a682 | a move (Part C) |
| 2026-11-07T14:17:47.590Z | Rehearse R2 at 3bc3c5211cef798cf54ff0d248d056a48b32a682, terms 383db41da6a169dd1c5eb64b708dbdcf87196ef0f33643218c88894dbab39f02 | started R2 |
| 2026-11-08T03:45:31.906Z | Rehearse R3 at 41e008194f1cbb92b9c986df74feb7810f33aa23, terms bdf6b7de7d7cc56109753925bfa82010aedd3351f2ba9b5d64838a26e718dd99 | started R3 |
| 2026-11-08T18:30:01.643Z | Move the Gateway to 0a7f2a7a21da745f0cee16fff76dc36c13d01c39 | a move |
| 2026-11-08T18:40:05.412Z | Rehearse R4 at 0a7f2a7a21da745f0cee16fff76dc36c13d01c39, terms 99149849e2f6a040d48e076dc3de4dd4257d3cd1d0d18548719356e9862af599 | started R4 |
| 2026-11-09T00:26:01.080Z | Move the Gateway to f90506b34ba2abd4fd6318e58a6aacb03a602333 | a move |
| 2026-11-09T00:37:57.603Z | Rehearse R5 at f90506b34ba2abd4fd6318e58a6aacb03a602333, terms 52625c468001f63a56e006af690f715eb1a56ae06d4cafcb2707fbbdecf6ed15 | started R5 |
| 2026-11-10T03:39:01.573Z | Move the Gateway to 8a62e2cea084eb38c486aebc73e1f7feacc41e39 | a move |
| 2026-11-10T04:16:32.890Z | Rehearse R6 at 8a62e2cea084eb38c486aebc73e1f7feacc41e39, terms 58a03d4df80b2d5d98abd3ff27fbe8a100e44a75c987a66b4da9eb13fe2f154c | started R6 |
| 2026-11-10T12:46:25.954Z | I sign FOUNDER-ACT-20261110-BR-PHASE4-STANDING-TRACKS-AMENDMENT-1 (754f8dc1…3ab2) as delivered | signed Amendment 1 |
| 2026-11-10T17:07:50.834Z | Rehearse R7 at 8a62e2cea084eb38c486aebc73e1f7feacc41e39, terms 145cfb6192bb7e03a0840913a724a83fe90691c5e75661603900608da72d537c | started R7 (Phase4-CR1) |
| 2026-11-11T03:00:56.430Z | I sign FOUNDER-ACT-20261111-BR-PHASE4-STANDING-TRACKS-AMENDMENT-2 (a7f07372…b974) as delivered / Continue R7 with Phase4-CR2 and Phase4-CR3 at 8a62e2cea084eb38c486aebc73e1f7feacc41e39, terms 145cfb6192bb7e03a0840913a724a83fe90691c5e75661603900608da72d537c | signed Amendment 2 and, in the same message, continued R7 (Amendment 2 B1) |
| 2026-11-11T14:44:16.096Z | Rehearse R8 through Phase4-CR3 at 8a62e2cea084eb38c486aebc73e1f7feacc41e39, terms 05d7c5f7b745bbae49c0c50bebee8ba97a017967dce40e6a79663360a7bd18f2 | started R8 (Amendment 2 B2) |
| 2026-11-11T18:40:44.625Z | Rehearse R9 through Phase4-CR3 at 8a62e2cea084eb38c486aebc73e1f7feacc41e39, terms c22199d8a86ff04ae6b847f66ae6d33027c3d08f05d5de040c16478f0af63fa6 | started R9 |
| 2026-11-12T02:36:18.232Z | Move the Gateway to 6b80c2259558e93d4f12dca474cc1d491930bd5d | a move |
| 2026-11-12T03:23:25.858Z | * `Rehearse R10 through Phase4-CR3 at 6b80c2259558e93d4f12dca474cc1d491930bd5d, terms 8fb8f92afab4b057e05f76e70690673b063649234222841e59d807cef3b4081a` | refused by the builder: 43 s short of Amendment 2 C4's eight hours (finding 2) |
| 2026-11-12T03:26:49.846Z | lets run the full set through CR3 (Amendment 2 B2), as R8 and R9 did: / `Rehearse R10 through Phase4-CR3 at 6b80c2259558e93d4f12dca474cc1d491930bd5d, terms 8fb8f92afab4b057e05f76e70690673b063649234222841e59d807cef3b4081a` | refused again: 7 h 55 min before the PC's update, under C4's eight hours |
| 2026-11-12T03:27:37.868Z | For R10 only, I amend C4 to seven hours fifty minutes | amended C4 for R10; the builder took the 03:26:49Z line as given under it and started R10 |
| 2026-11-12T11:28:54.851Z | Rehearse R11 through Phase4-CR3 at 6b80c2259558e93d4f12dca474cc1d491930bd5d, terms 221b94c968c65d77ccff69a6dfcb6dc45800ddc527fda372561b8abe3047b754 | started R11 |

## The runs

From each run's record and its run's attempts log. "Outcome" and
"Failures" are the attempts log's; "Final state" is the record's.

| Run | Room | Entry passed | Ended | Outcome | Failures | Final state | Record digest |
|---|---|---|---|---|---|---|---|
| R1 Phase4-CR1 | `6cb812c1-9e12-4bc8-b6f6-7a9e0971bf2e` | 2026-11-06T03:40:41.559Z | 2026-11-06T04:00:59.844Z | interrupted | lifecycle_incomplete, command_not_clean | PLANNING | `d58bd512…d500` |
| R2 Phase4-CR1 | `a4f20289-2726-47b9-a274-840865a82dc6` | 2026-11-07T14:37:14.724Z | 2026-11-07T17:27:57.411Z | interrupted | lifecycle_incomplete, command_not_clean | PLANNING | `3e1df6b5…879e` |
| R3 Phase4-CR1 | `bc16d439-d638-49fa-a570-ce2e2c9b96d7` | 2026-11-08T03:56:06.438Z | 2026-11-08T04:49:04.481Z | interrupted | lifecycle_incomplete, command_not_clean | PLANNING | `77250231…ae27` |
| R4 Phase4-CR1 | `a75e4a24-0aaf-4fc6-bb40-267de7c645fe` | 2026-11-08T18:53:23.255Z | 2026-11-08T20:35:44.608Z | rejected | none | CLOSED_ABANDONED | `3b7bad4c…4b0e` |
| R5 Phase4-CR1 | `e8111291-317f-45c9-aafe-12d4f4508bd3` | 2026-11-09T00:55:57.951Z | 2026-11-09T03:02:52.534Z | interrupted | lifecycle_incomplete, command_not_clean | PLANNING | `fb34880d…588d` |
| R6 Phase4-CR1 | `e8d6219b-ecf5-428f-a204-6437d2d56ae1` | 2026-11-10T04:38:44.147Z | 2026-11-10T09:06:45.733Z | interrupted | founder_decision_timeout, lifecycle_incomplete | PLAN_REVIEW | `3ab30351…5b74` |
| R7 Phase4-CR1 | `c6a7e1f3-e1f7-421d-90f2-1c0118e5c9d4` | 2026-11-10T21:23:36.804Z | 2026-11-10T22:56:46.438Z | passed | none | BUILDING | `69c042c5…6002` |
| R7 Phase4-CR2 | `4088903e-bfc2-4a31-bfea-be1b61ba3778` | 2026-11-11T03:08:32.760Z | 2026-11-11T07:17:24.136Z | interrupted | founder_decision_timeout, lifecycle_incomplete | PLAN_REVIEW | `24d69b8f…c3a7` |
| R8 Phase4-CR1 | `7f4b2f45-dfc0-41c4-b534-169c3deebc6c` | 2026-11-11T15:18:34.634Z | 2026-11-11T16:26:31.396Z | passed | none | BUILDING | `f6ef02c3…3a59` |
| R8 Phase4-CR2 | `10d2604c-99b1-4e21-93ff-76a94863dfd9` | 2026-11-11T16:30:48.468Z | 2026-11-11T17:29:48.949Z | passed | none | BUILDING | `300e38c2…7c0f` |
| R8 Phase4-CR3 | `fad7f5ff-cbf0-49ac-813b-5a650de6b1b0` | 2026-11-11T17:36:21.248Z | 2026-11-11T17:56:25.028Z | interrupted | lifecycle_incomplete, command_not_clean | PLANNING | `46ee0b34…3b0c` |
| R9 Phase4-CR1 | `06147929-1d35-4102-b1e6-37ac5e80c32e` | 2026-11-11T18:52:55.939Z | 2026-11-11T18:59:56.456Z | interrupted | lifecycle_incomplete, command_not_clean | PLANNING | `52dccc0e…9f97` |
| R10 Phase4-CR1 | `fcca38f3-38e1-4ff7-8cfd-a185be1d4175` | 2026-11-12T03:36:28.815Z | 2026-11-12T08:15:54.314Z | interrupted | founder_decision_timeout, lifecycle_incomplete | PLAN_REVIEW | `6888cb8c…1067` |
| R11 Phase4-CR1 | `72a6b018-5784-4b8c-8b6e-6423f6694ed8` | 2026-11-12T11:37:28.235Z | 2026-11-12T11:58:23.278Z | passed | none | BUILDING | `921c698a…c112` |
| R11 Phase4-CR2 | `8fb5d32b-5ee5-4580-bd4f-c4a549c61759` | 2026-11-12T12:35:27.978Z | 2026-11-12T13:00:21.794Z | passed | none | BUILDING | `d056b44c…54a4` |
| R11 Phase4-CR3 | `20813999-489e-40ee-83e6-742fb174d2af` | 2026-11-12T13:15:06.513Z | 2026-11-12T16:14:14.666Z | passed | none | BUILDING | `e54ec20f…fc9f` |

R11 is the only rehearsal whose three labels all passed. R7's Phase4-CR1
passed and its continuation's Phase4-CR2 did not, so R7 is not a set of
three passes.

### Rounds

Each round is one Planner command. "Ended" is the command's last journal
row; the plan is the one that row names; the decision is the record's.

| Round | Command | Ended | Plan | Decision |
|---|---|---|---|---|
| R1 Phase4-CR1 round 1 | `cmd_planner_ff3397aee4ff14c61098654621ea3364` | completed | `3343d99b…fb04` | plan.revision_requested |
| R1 Phase4-CR1 round 2 | `cmd_planner_ad00c624809e0f3cebe47ae8d8c4ec33` | failed | none | none |
| R2 Phase4-CR1 round 1 | `cmd_planner_b33c0969f7b0be49bd9c6324d00790c4` | completed | `a659c6ed…1a49` | plan.revision_requested |
| R2 Phase4-CR1 round 2 | `cmd_planner_bc7513750d61ba4c3f1434d56d3d1153` | failed | none | none |
| R3 Phase4-CR1 round 1 | `cmd_planner_ee7d2505b7ddccb4bea30dff15f4a0f3` | completed | `9cf64fc9…a148` | plan.revision_requested |
| R3 Phase4-CR1 round 2 | `cmd_planner_683ed51637960e4ba4399fba12afe1d8` | completed | `513c8a94…62bb` | plan.revision_requested |
| R3 Phase4-CR1 round 3 | `cmd_planner_f9c5888e9d827d5f4a0c971422d8a653` | failed | none | none |
| R4 Phase4-CR1 round 1 | `cmd_planner_5aec1bf11865dceb969f9eaab2292a45` | completed | `12605d7b…69f6` | plan.revision_requested |
| R4 Phase4-CR1 round 2 | `cmd_planner_c327b71f81e823f2df4cb7bf05f66c65` | completed | `a241678b…5e6a` | plan.revision_requested |
| R4 Phase4-CR1 round 3 | `cmd_planner_4cadadc3f570ca9cd014edb30434c042` | completed | `3c8d9d31…15a2` | founder.cancel |
| R5 Phase4-CR1 round 1 | `cmd_planner_4c500280a02767ec16406123e576d3d2` | completed | `416ba63a…3769` | plan.revision_requested |
| R5 Phase4-CR1 round 2 | `cmd_planner_76d1b7d5d46e86571e5118a3eba9c28a` | completed | `b68d3203…1857` | plan.revision_requested |
| R5 Phase4-CR1 round 3 | `cmd_planner_c89d81adf1c183e8d066ac96b1c845f3` | failed | none | none |
| R6 Phase4-CR1 round 1 | `cmd_planner_f833f030c739e2121c868aa6b3d9bf6d` | completed | `291cec12…cd09` | plan.revision_requested |
| R6 Phase4-CR1 round 2 | `cmd_planner_864891c9ccf6c3d87bebf8029ec143a6` | completed | `4f7683b6…5d5e` | none |
| R7 Phase4-CR1 round 1 | `cmd_planner_f4c32df68e476302726f4114a3d8e337` | completed | `61d07883…dc0f` | plan.revision_requested |
| R7 Phase4-CR1 round 2 | `cmd_planner_d459522921a7c97051345a36c6b56141` | completed | `622175a9…b157` | plan.revision_requested |
| R7 Phase4-CR1 round 3 | `cmd_planner_220d092704a87dccf62d5ef97b137268` | completed | `9e6ca0a7…0f42` | plan.approved |
| R7 Phase4-CR2 round 1 | `cmd_planner_7d3d9d073a89969a0c40679666d4d4f8` | completed | `69a43431…5762` | none |
| R8 Phase4-CR1 round 1 | `cmd_planner_ffb061e979f3dab3cf1e6b188d6afc2e` | completed | `15bd40ba…f854` | plan.revision_requested |
| R8 Phase4-CR1 round 2 | `cmd_planner_95b69c4b606cb14f0f8ff6d7ba765bb9` | completed | `9e04c54b…1cdd` | plan.approved |
| R8 Phase4-CR2 round 1 | `cmd_planner_3613b4269e0873d6fc5b5e856ab7bb43` | completed | `1065bb45…8f46` | plan.revision_requested |
| R8 Phase4-CR2 round 2 | `cmd_planner_aaeb48dca3912afaab0cadedf807f11f` | completed | `3c7f658a…47a7` | plan.approved |
| R8 Phase4-CR3 round 1 | `cmd_planner_393f03b0a29f4e4f7228ec55ef406eba` | completed | `5368e06e…1e5c` | plan.revision_requested |
| R8 Phase4-CR3 round 2 | `cmd_planner_f0a154895739a81b096ccd0c5a82e954` | failed | none | none |
| R9 Phase4-CR1 round 1 | `cmd_planner_6c89b66c6c79c6f6b2b9c93b17f633b9` | failed | none | none |
| R10 Phase4-CR1 round 1 | `cmd_planner_2bff5aa245876507ad05c96678a84dc0` | completed | `613c899e…4b5d` | plan.revision_requested |
| R10 Phase4-CR1 round 2 | `cmd_planner_f79d3dcd3c5db2fd97005e00bdfa5008` | completed | `1952499e…caa8` | none |
| R11 Phase4-CR1 round 1 | `cmd_planner_2be5f9664d4145f8c4953060bda1ec9b` | completed | `414c929d…92a5` | plan.approved |
| R11 Phase4-CR2 round 1 | `cmd_planner_b4a10b285db231693bd22bd2a5917c4f` | completed | `821b7cf0…42ec` | plan.approved |
| R11 Phase4-CR3 round 1 | `cmd_planner_539a128d3b9eb92ad5a95f5d9aff5a88` | completed | `00c8329a…8dba` | plan.revision_requested |
| R11 Phase4-CR3 round 2 | `cmd_planner_202fcad1fbc4b5dfa9276c120d932505` | completed | `1fae4b7c…e25e` | plan.approved |

### Windows

The opening deployment is the one each record names at its start and at
its end. The closing deployment, and who closed it, are from the
builder's audit record, filed here.

| Window | Opened by deployment | Closed by deployment | Closed by | Note |
|---|---|---|---|---|
| R1 from Phase4-CR1 | `0cd5f4cf` | `7a65adf2`, SUCCESS 2026-11-06T04:26:48Z | the Founder |  |
| R2 from Phase4-CR1 | `26261c41` | `e81f4423`, SUCCESS 2026-11-07T18:31:23Z | the Founder | his first "deployed" (about 18:21Z) left the removal staged, not deployed; the builder found it and asked him to deploy it (audit, 18:21:26Z) |
| R3 from Phase4-CR1 | `8aaa3851` | `41527755`, SUCCESS 2026-11-08T05:15:33Z | the Founder |  |
| R4 from Phase4-CR1 | `8b4c3aeb` | `244339f4`, SUCCESS 2026-11-08T20:44:03Z | the Founder |  |
| R5 from Phase4-CR1 | `47dfa264` | `f600a5cb`, SUCCESS 2026-11-09T03:10:07Z | the Founder |  |
| R6 from Phase4-CR1 | `51801e62` | `308dce62`, new start 2026-11-10T12:07:41Z | the Founder | 47.6 min after the PC's apt-daily-upgrade at 11:20:05Z, before which it was to close (Amendment 1 A3; finding 6) |
| R7 from Phase4-CR1 | `2362242c` | `0e9b3606`, new start 2026-11-10T23:24:49Z | the Founder |  |
| R7 from Phase4-CR2 | `2de9407f` | `19c8b3ab`, SUCCESS 2026-11-11T09:54:28Z | the builder, Amendment 1 B1(a) | about 2 h after B1(a) first allowed it, and not as B2 requires (finding 6) |
| R8 from Phase4-CR1 | `5943ceaa` | `54f5d809`, SUCCESS 2026-11-11T18:04:25Z | the Founder | one window for all three labels |
| R9 from Phase4-CR1 | `87ea91a3` | `b3714e51`, new start 2026-11-11T19:40:32Z | the builder, Amendment 1 B1(a) | about 7 min after B1(a) first allowed it (finding 6) |
| R10 from Phase4-CR1 | `4e5a9493` | `eecdbc18`, new start 2026-11-12T11:06:08Z | the builder, Amendment 1 B1 | 2 h 20 min after B1(a) first allowed it, 16 min 34 s before the PC's apt-daily-upgrade at 11:22:43Z (finding 6) |
| R11 from Phase4-CR1 | `60057454` | `a0b7bde3`, new start 2026-11-12T16:24:18Z | the Founder | one window for all three labels |

## The amendments

Each is the builder's copy of the text it delivered for signature,
unchanged since. Each hashes to the SHA-256 its signature line names.

### `FOUNDER-ACT-20261110-BR-PHASE4-STANDING-TRACKS-AMENDMENT-1`

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACT-20261110-BR-PHASE4-STANDING-TRACKS-AMENDMENT-1.txt` |
| Git blob id | `8510318076f835fe65b037616f9402869e639819` |
| SHA-256 | `754f8dc1d563a7ec6dbeb360458491d3785e246d88490c9e224c28974ccd3ab2` |
| Bytes | 6308 |
| Lines | 55 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Amendment 1 of the standing act: the builder may close a rehearsal's window; R7 |

Signed, 2026-11-10T12:46:25Z:

> I sign FOUNDER-ACT-20261110-BR-PHASE4-STANDING-TRACKS-AMENDMENT-1 (754f8dc1…3ab2) as delivered

### `FOUNDER-ACT-20261111-BR-PHASE4-STANDING-TRACKS-AMENDMENT-2`

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACT-20261111-BR-PHASE4-STANDING-TRACKS-AMENDMENT-2.txt` |
| Git blob id | `b1ebd184c2eea8f0366a234bc3551894b221c6c6` |
| SHA-256 | `a7f07372b81ef19d5f802ffb4bb9a26183fc84a0564287b779f9e2ab50c3b974` |
| Bytes | 6099 |
| Lines | 53 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Amendment 2 of the standing act: rehearsing Phase4-CR2 and Phase4-CR3 |

Signed, 2026-11-11T03:00:56Z:

> I sign FOUNDER-ACT-20261111-BR-PHASE4-STANDING-TRACKS-AMENDMENT-2 (a7f07372…b974) as delivered

Both belonged in pull request 155 and were missed there (finding 1).

## The evidence, by rehearsal

### R1

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R1-terms.json` |
| Git blob id | `32f0ef68cdb64338bd0ffaf79f58c5b15a0750c1` |
| SHA-256 | `877304c34835b864c7446f83a75d073bfb83ca5fe598d92d8f8f0df01c19a5a7` |
| Bytes | 1933 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | R1's terms; the start line names this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R1-attempts.json` |
| Git blob id | `2d94e9ce82866b4ccb5283dee6ffdcfa1e98ec2a` |
| SHA-256 | `70cd75279ea575db87fb5ce4c3718bc7717892d3074ef600056519fb02e6aea9` |
| Bytes | 909 |
| Lines | 27 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for R1 (`evidence/attempts.json`), set id `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS-R1` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R1-Phase4-CR1-6cb812c1-9e12-4bc8-b6f6-7a9e0971bf2e.record.json` |
| Git blob id | `7dbe118c74eec28bbf8eef1a7b6e223bfbb8658e` |
| SHA-256 | `4b3c238dca50a3f074dfecf4c51ffdaf4cf49d9ea8aa28e19ca4a86149d51c43` |
| Bytes | 9425 |
| Lines | 243 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `6cb812c1-9e12-4bc8-b6f6-7a9e0971bf2e`; outcome interrupted; `phase4RecordDigest` `d58bd5125c1e3c9d52afddc518ab536fe7756376536600a50f7e5a18f72ad500` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R1-Phase4-CR1-6cb812c1-9e12-4bc8-b6f6-7a9e0971bf2e.record.sha256` |
| Git blob id | `7f6810d5036121379045093b592e43f43d380969` |
| SHA-256 | `4471be9168b50e5932c85ca7a69e1af0c152959e4ef32d89e2677dc848db78c3` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `d58bd512…d500`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R1-export-6cb812c1-9e12-4bc8-b6f6-7a9e0971bf2e.json` |
| Git blob id | `130ee39e72182ae00f89dd4c9184bff19105b69d` |
| SHA-256 | `b1487eb0d94f869e819beb25058db838bafe35cd77567fbc9c7a6ec9dd3c1879` |
| Bytes | 9793 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `6cb812c1-9e12-4bc8-b6f6-7a9e0971bf2e`'s export, read 2026-11-13T04:43:59.841Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 4 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R1-plan-3343d99bb3809a3be55440673a6c110f118bb3c17e03c3a202770b0c20f2fb04.json` |
| Git blob id | `7459169985fa47114199b83d64a7acf5c7905446` |
| SHA-256 | `a4609ce119a98b2c0f4fa70ecab5b112bac3d66ff5f882866d25f2b7838c5be1` |
| Bytes | 32769 |
| Lines | 72 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 1, command `cmd_planner_ff3397aee4ff14c61098654621ea3364`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R1-planner-evidence-CR1-command1-7ac659db4c3d34742a848ffb9ebd2b6350cce838a43a493c7f21797c3a66a175.json` |
| Git blob id | `0d78780050e874f59a4e308efab6e414b263c7f6` |
| SHA-256 | `76553b253d0f737d4dba7bfb933c0b11a5d9350502ab66dbeff45384cc19ecfc` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 1, command `cmd_planner_ff3397aee4ff14c61098654621ea3364`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R1-planner-evidence-CR1-command2-44ae11eb5726bb233700e11ebb617a8b00f5b82389364b145b177d13233a6021.json` |
| Git blob id | `655817a7b3fe5e47194941dd24bc960597064089` |
| SHA-256 | `06c4a2ad770c4e861abd948339772a8465c5d805f9e2223a8a2c64b5262282ce` |
| Bytes | 1422 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 2, command `cmd_planner_ad00c624809e0f3cebe47ae8d8c4ec33`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R1-revision-feedback-round1.txt` |
| Git blob id | `52ee250f739bb67a120dfc8ca51a542a7e7a431f` |
| SHA-256 | `4a7a06160a3831d0a60840149f9af506d78749ebf253a1f0e33c753e46070e7c` |
| Bytes | 2967 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `8dbd7aad…e06f` (finding 3). |

### R2

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R2-terms.json` |
| Git blob id | `5cb81d7e16c029ed9ea187091dd7ee416af6ddfa` |
| SHA-256 | `383db41da6a169dd1c5eb64b708dbdcf87196ef0f33643218c88894dbab39f02` |
| Bytes | 1933 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | R2's terms; the start line names this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R2-attempts.json` |
| Git blob id | `745ab03f914c95b3913f08449f1ad754e9cee54a` |
| SHA-256 | `0423667f840d6bfb75c2a74ae809092c4cf9e2af09a27c3213cce26de5972b68` |
| Bytes | 909 |
| Lines | 27 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for R2 (`evidence/attempts.json`), set id `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS-R2` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R2-Phase4-CR1-a4f20289-2726-47b9-a274-840865a82dc6.record.json` |
| Git blob id | `7b131ad904096ffb16dd5f23368be430d0cd8bb8` |
| SHA-256 | `0809690625621742f6cdaed8e3b7a8cfe51c2a644eb884cb0259523abfb15082` |
| Bytes | 9413 |
| Lines | 243 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `a4f20289-2726-47b9-a274-840865a82dc6`; outcome interrupted; `phase4RecordDigest` `3e1df6b5d1502287fe5cdf742d087969cca6e2081ed00f2d054395dcb2fa879e` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R2-Phase4-CR1-a4f20289-2726-47b9-a274-840865a82dc6.record.sha256` |
| Git blob id | `13df2bb78b1691882f8a31135de6ac03e4ee0c73` |
| SHA-256 | `b4a8d04d3603b9ba03b160a4f6de331b9d6ffc145c026593cffc108ec735162b` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `3e1df6b5…879e`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R2-export-a4f20289-2726-47b9-a274-840865a82dc6.json` |
| Git blob id | `b28115f4b6e86a1a5eeb0f83f3a0d4a066b4f6b9` |
| SHA-256 | `a8473b8ffbab2249876d507cb3aeb81ad86a4ee60ca43f89ef70109fc2e29265` |
| Bytes | 9680 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `a4f20289-2726-47b9-a274-840865a82dc6`'s export, read 2026-11-13T04:44:01.115Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 4 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R2-plan-a659c6ed95af407fd67a3b168ef7d7178c0987efc9c29f65f8481cb0279d1a49.json` |
| Git blob id | `fb729fbc4246131cec402ff477d25a906e9f0dc2` |
| SHA-256 | `a59e588989713d65a4270032e19991740e7e998ef0e6abda4fddcc143ba49a20` |
| Bytes | 27779 |
| Lines | 74 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 1, command `cmd_planner_b33c0969f7b0be49bd9c6324d00790c4`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R2-planner-evidence-CR1-command1-26aed74b8724ae9eb9a3ee5223537d327df4b61016618ee33cb695890dc0fa4e.json` |
| Git blob id | `d8a44e157586d4b9dcc8353d595189f5664dc7b2` |
| SHA-256 | `0c82bcb47da72fef3ec34467f6fd9a75e15bac2b43365ab9330d5d9f1af44fc8` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 1, command `cmd_planner_b33c0969f7b0be49bd9c6324d00790c4`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R2-planner-evidence-CR1-command2-780e5b52176e391bc32fcdc9c5cc66694bd1f55bd313127bf5ba43c8db65c892.json` |
| Git blob id | `87a141fff0a976d4af6d0726c05e486e66386609` |
| SHA-256 | `df90f63c58b3e9c48723c7085fc604439a6e621d01eb3b03f8436418c9e6eeca` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 2, command `cmd_planner_bc7513750d61ba4c3f1434d56d3d1153`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R2-revision-feedback-round1.txt` |
| Git blob id | `f81b0c6e4995633444e2730834b05e7ae57074fd` |
| SHA-256 | `f9c0085a7f0e76b01a0c704f0ee412824e3e5d562b302f776eac7a69a6f93e53` |
| Bytes | 2854 |
| Lines | 15 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `c9766ed4…fb6f`. |

### R3

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-terms.json` |
| Git blob id | `14dae1c21245a912a18b4a8d82a56f741428e8fa` |
| SHA-256 | `bdf6b7de7d7cc56109753925bfa82010aedd3351f2ba9b5d64838a26e718dd99` |
| Bytes | 1933 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | R3's terms; the start line names this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-attempts.json` |
| Git blob id | `d155968f87223ff59ddfbcee63945e053e07c7b2` |
| SHA-256 | `f0723a2353fbe7a8852793d092b353199d19409c967684ad63c42e909bb20043` |
| Bytes | 909 |
| Lines | 27 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for R3 (`evidence/attempts.json`), set id `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS-R3` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-Phase4-CR1-bc16d439-d638-49fa-a570-ce2e2c9b96d7.record.json` |
| Git blob id | `93ba0edf030390aa97c7f9c6f0f2ebeda5487980` |
| SHA-256 | `323e2e073b96492f140828c562b428714da12c62477f57bc08b5408d825822de` |
| Bytes | 14306 |
| Lines | 366 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `bc16d439-d638-49fa-a570-ce2e2c9b96d7`; outcome interrupted; `phase4RecordDigest` `77250231823890e2fbe440036d12a1798d932a6f4f942d66316ee6ddfee6ae27` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-Phase4-CR1-bc16d439-d638-49fa-a570-ce2e2c9b96d7.record.sha256` |
| Git blob id | `544a6791db7d61f396bda6345e33391417c104e8` |
| SHA-256 | `f8942e3077ca361ace5c1d0f899826483365bbd498993b25b1924a234d0a367c` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `77250231…ae27`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-export-bc16d439-d638-49fa-a570-ce2e2c9b96d7.json` |
| Git blob id | `c179d717c48d3d75c7439743de8492b052f047e8` |
| SHA-256 | `85b11cf5291a309d740c04588710183b03f55bf6d653f242d603de67a6bdebf8` |
| Bytes | 19029 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `bc16d439-d638-49fa-a570-ce2e2c9b96d7`'s export, read 2026-11-13T04:44:01.263Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 6 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-plan-9cf64fc9f5a32dc094eaa7f41271dc3af2d12b0da1254b91976d08ce8cb6a148.json` |
| Git blob id | `4cdde6c8c543a736ffb70294eff6f7075491ba3e` |
| SHA-256 | `b23e058da13403a968d58b4fb1ebf69c95b6e26aa510c63856d4a8b2626d04dc` |
| Bytes | 36549 |
| Lines | 75 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 1, command `cmd_planner_ee7d2505b7ddccb4bea30dff15f4a0f3`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-plan-513c8a94a63d9d932cdc18ce4776e28151f044eb72e841cb6720eeb9233462bb.json` |
| Git blob id | `18ece1090aabf5d672e18454579aff30bbd346d9` |
| SHA-256 | `fae1aa66cc86b828f882a6e057ed4417aa55d37f9010f27e527c36be4e978e8b` |
| Bytes | 49036 |
| Lines | 82 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 2, command `cmd_planner_683ed51637960e4ba4399fba12afe1d8`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-planner-evidence-CR1-command1-d401d66bb5a85c79cb2e3fa6e4fcc3b3b5812013a9502a8763cd7c44d5ac2cd4.json` |
| Git blob id | `1bfeaa9ab554a8da40286255cc9d2d932912a5ff` |
| SHA-256 | `8dc5a4d556ffe87bb7a3bad6bf8e4aada7e6ec70162372c831cfd719128f1258` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 1, command `cmd_planner_ee7d2505b7ddccb4bea30dff15f4a0f3`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-planner-evidence-CR1-command2-0cbb7fc95d74b22b1942175a32d033955cf87cf1bd155abfee4223c574c380c8.json` |
| Git blob id | `3bbda2e44e964d885c6d0495d6eb31e0ed68a21e` |
| SHA-256 | `2663bd7c09389629a51700ef75da697f65241d70eaca3b884892ea3bc19f9aa3` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 2, command `cmd_planner_683ed51637960e4ba4399fba12afe1d8`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-planner-evidence-CR1-command3-88de55986c9495690122f889c00044617dfb42f6d50837647025be9b975df527.json` |
| Git blob id | `33971ddb6d46f278df47a881a896aee2e2b28697` |
| SHA-256 | `2d94d47b69a36413ae5f822e5bb15e09525e5fc988e0de6d80c08e332063f287` |
| Bytes | 1422 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 3, command `cmd_planner_f9c5888e9d827d5f4a0c971422d8a653`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-revision-feedback-round1.txt` |
| Git blob id | `999a3b90e54f031c5d248ecdd5ebd81cde429aed` |
| SHA-256 | `507bc98a6f577f1c651588974919b40e8054ce1020f262d302f77f0065057561` |
| Bytes | 3540 |
| Lines | 18 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `a1ded9ad…ce43`. |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R3-revision-feedback-round2.txt` |
| Git blob id | `64d8dc9a46394d2e6d21a770cf68d90bac64b1b0` |
| SHA-256 | `2e564d13575ddf0ff9410b16b8561a7ee78edc646d0f3bb4db4a8ccbae60b318` |
| Bytes | 5384 |
| Lines | 20 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `4f13aae9…ae94`. |

### R4

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-terms.json` |
| Git blob id | `15e6dacc6b54bc7883c2a8274c399a1101dbb23f` |
| SHA-256 | `99149849e2f6a040d48e076dc3de4dd4257d3cd1d0d18548719356e9862af599` |
| Bytes | 1933 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | R4's terms; the start line names this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-attempts.json` |
| Git blob id | `5d31ac249fb0b15854c24547774ba1601a247028` |
| SHA-256 | `f7f555d7888bb8dc345bfe63e5659cea8a0ad251c1393ee1efb24abc2ebf300c` |
| Bytes | 839 |
| Lines | 24 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for R4 (`evidence/attempts.json`), set id `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS-R4` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-Phase4-CR1-a75e4a24-0aaf-4fc6-bb40-267de7c645fe.record.json` |
| Git blob id | `b220cd7a7136e63eee7e9576d7083e0f7a3bdaff` |
| SHA-256 | `0a387dbbab27b507f2263725e42becd8a6b60c1970cd16d55f81484ee5562a67` |
| Bytes | 16042 |
| Lines | 415 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `a75e4a24-0aaf-4fc6-bb40-267de7c645fe`; outcome rejected; `phase4RecordDigest` `3b7bad4c469e880b5c5c36d30258473af9931c9f9859c25eea5f4c1abb6b4b0e` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-Phase4-CR1-a75e4a24-0aaf-4fc6-bb40-267de7c645fe.record.sha256` |
| Git blob id | `a513375fbbbc44f2e7acff9b619352262694663b` |
| SHA-256 | `8420201bd8ad8336c54fa4f4d5b51e031d614cf92b91af0663bc97ba9b8d6bea` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `3b7bad4c…4b0e`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-export-a75e4a24-0aaf-4fc6-bb40-267de7c645fe.json` |
| Git blob id | `fabe9bfbc6b710baa262dca092ac70503b33921a` |
| SHA-256 | `f6551a3bc99cccbee2df0649b40f00997971a979a66de96cf8214c5db5a1ce93` |
| Bytes | 21417 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `a75e4a24-0aaf-4fc6-bb40-267de7c645fe`'s export, read 2026-11-13T04:44:01.439Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 8 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-plan-12605d7b5b724e47140e1c449be974ad0fbe2cc30cc29ce710a15e19fc0e69f6.json` |
| Git blob id | `810c7768c6558de9e7ae6f92187ae02a6836bf04` |
| SHA-256 | `92c87e2e128ee59c4dbf185d4294cdc45afea7e9dda4e4e902ddf04706148837` |
| Bytes | 29120 |
| Lines | 83 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 1, command `cmd_planner_5aec1bf11865dceb969f9eaab2292a45`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-plan-a241678be7f8faeb1070b08f1f3ad6646aedb7db6f6e8fd3a66970ef2ecc5e6a.json` |
| Git blob id | `5d26e98bb9be7c21bef40863c91f3f8dab1645bc` |
| SHA-256 | `b10a7661950bc573b6e79f448bc778607771bf5c0c1f1f7d35ce682a057a53e3` |
| Bytes | 34368 |
| Lines | 59 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 2, command `cmd_planner_c327b71f81e823f2df4cb7bf05f66c65`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-plan-3c8d9d311c2d24330593ca1d9c2df721e547eae21682ebebca736b83776f15a2.json` |
| Git blob id | `51f4be2187b8c839f3c1361c36dc6bcc54d1bbaa` |
| SHA-256 | `c1eea92e821f1006818000f4f453f5a1e13262b59fb5a10e192946ea38f6b0b9` |
| Bytes | 27292 |
| Lines | 81 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 3, command `cmd_planner_4cadadc3f570ca9cd014edb30434c042`, as the runner saved it; decision: founder.cancel |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-planner-evidence-CR1-command1-07fed5d92ecc165b467b4a61f2d456011c7e231097bd6bbb0fd5e6861cdbc667.json` |
| Git blob id | `9b17f7e62a0c40b8c7abcc606e905699952e6d5a` |
| SHA-256 | `3c14d01edb7e48968646a3f8a951471d1692fff6a782858b2ff65a1ffa08d38d` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 1, command `cmd_planner_5aec1bf11865dceb969f9eaab2292a45`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-planner-evidence-CR1-command2-88ea13f36b2e41cb1b33a9faec1bfa77253366745317f2c7ac430eb8342293ce.json` |
| Git blob id | `dbd86b8fea725d9f7a94b9cc8959c05fcf0624f3` |
| SHA-256 | `369ade1479edbcb3e5d84889eeca79081b0f3c74654963e4d5490aa8c53b92a5` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 2, command `cmd_planner_c327b71f81e823f2df4cb7bf05f66c65`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-planner-evidence-CR1-command3-115c0d10383edb1b5a8f82b8082e5be774263c2cd5766bdf2cb580e6f09469c9.json` |
| Git blob id | `565e7d90ee6ae110d771f13176f8edc0217b639f` |
| SHA-256 | `57eb1fd5d023f6f36203c9d6658440a7274fdf589c9e0a7671164262fba56caa` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 3, command `cmd_planner_4cadadc3f570ca9cd014edb30434c042`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-revision-feedback-round1.txt` |
| Git blob id | `73aba2e4bc3e9f1f8310e6f153486c1d0d625f6a` |
| SHA-256 | `1df711ab29bd3d254ada612793ee4b6bb592f1ede01e654af4e8a572339396b7` |
| Bytes | 3569 |
| Lines | 18 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `25e75f1a…a397`. |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R4-revision-feedback-round2.txt` |
| Git blob id | `8812135e2888f8f164940f5ebdecb4b089d33e5e` |
| SHA-256 | `9cca954f3665f0d4fab75881c7e61e48fe901fc723402ca37b3cc0ac816b791a` |
| Bytes | 4802 |
| Lines | 18 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `2673e0a6…9b01`. |

### R5

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-terms.json` |
| Git blob id | `7d826cf12cb595b33c38bbe1d483692719e78952` |
| SHA-256 | `52625c468001f63a56e006af690f715eb1a56ae06d4cafcb2707fbbdecf6ed15` |
| Bytes | 1933 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | R5's terms; the start line names this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-attempts.json` |
| Git blob id | `562bc9fd7ed4c2d852a9dcddf152dd0a4b02fdd3` |
| SHA-256 | `af89d21d9ca73f36d31a7a178c282dd65f96cabf59026b0fbcd94d4de09ed59c` |
| Bytes | 909 |
| Lines | 27 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for R5 (`evidence/attempts.json`), set id `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS-R5` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-Phase4-CR1-e8111291-317f-45c9-aafe-12d4f4508bd3.record.json` |
| Git blob id | `5288a9577c9d9e5469e660bdce0b9e1618663306` |
| SHA-256 | `c4c79eeee568de91ff0e456a242b4a4cd6ccbd8552d5b16a8fdff032d383d32b` |
| Bytes | 14294 |
| Lines | 366 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `e8111291-317f-45c9-aafe-12d4f4508bd3`; outcome interrupted; `phase4RecordDigest` `fb34880d768e348bcb1cebd2cfe0f9a8e18e3a69ef06bce37614811f5859588d` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-Phase4-CR1-e8111291-317f-45c9-aafe-12d4f4508bd3.record.sha256` |
| Git blob id | `0b9048432e3ec3fd78073e60a8b7fee7bfa55f02` |
| SHA-256 | `1ce48a5adfb05f6e0d30a6da8cb30e63753dd4f8bb835104c0f282d9b5c73379` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `fb34880d…588d`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-export-e8111291-317f-45c9-aafe-12d4f4508bd3.json` |
| Git blob id | `991cba5d37b4ff9db34d2109eb6e88f57caeabe8` |
| SHA-256 | `ea267fec90b2a6ba94fc4ac2abb7e8c2939b04bbe47a65fe6f0b12944a92d42f` |
| Bytes | 17565 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `e8111291-317f-45c9-aafe-12d4f4508bd3`'s export, read 2026-11-13T04:44:01.575Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 6 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-plan-416ba63ac2305f67ae326248ac99d98d54a5b8ec422794b664a2c1d1a6233769.json` |
| Git blob id | `70565123e1afd26956549ac816d60bb89cc86593` |
| SHA-256 | `2450ef94517009ed0e72f37ca65b2431fc6ea7fd3e993b467650bd14a903a519` |
| Bytes | 27555 |
| Lines | 65 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 1, command `cmd_planner_4c500280a02767ec16406123e576d3d2`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-plan-b68d320309519a846cadf5b5f85470104f8391d6834380382fa323fd0f051857.json` |
| Git blob id | `79f2969cacd816d93a6b961b1f92ddd816658e92` |
| SHA-256 | `f5af680f7fa318fd1fbf4c82b1901ec276a7509bfa1a764f03548a181e693179` |
| Bytes | 42826 |
| Lines | 78 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 2, command `cmd_planner_76d1b7d5d46e86571e5118a3eba9c28a`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-planner-evidence-CR1-command1-718d3dedc879a5e04b19933d70a1c8a587af3c7958b23f0114f423e54e3e8b53.json` |
| Git blob id | `a766928fe29740ce9c86158dd160df0dff504933` |
| SHA-256 | `05e29a73d96d2baf8a252b3b3a4486e8a523197eee4bf4dd8c421cc19fd69235` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 1, command `cmd_planner_4c500280a02767ec16406123e576d3d2`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-planner-evidence-CR1-command2-36ccf021212d7bc52301ed7db7e5a82b318b92bb7760e11ac7eca2bc47e680e0.json` |
| Git blob id | `7768434381ec611fd63ccb09ad1fdf2148e0cf2d` |
| SHA-256 | `85865bbcf39457fa68175f2d9938edbfddc42d755b71a3b9d6dcb6705385e88a` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 2, command `cmd_planner_76d1b7d5d46e86571e5118a3eba9c28a`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-planner-evidence-CR1-command3-6d29fd10fbd6df40a2db9600390de52415590b5b63cdd053830fde2f0598ab96.json` |
| Git blob id | `19316d7c42e806eab489de277c591acf7001a574` |
| SHA-256 | `d0bd420c2105be5f8e1df648ebbcaaa476a2d6bbd364b2778dd8f115817dc6c6` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 3, command `cmd_planner_c89d81adf1c183e8d066ac96b1c845f3`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-revision-feedback-round1.txt` |
| Git blob id | `2b93e82cceb2e788b5d560d0f9c46d982dfe1b7d` |
| SHA-256 | `e52a5545789edd76b79f6be999a78ff548253605158630fc39d3435a3a05d626` |
| Bytes | 2302 |
| Lines | 12 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `a244006a…2bfa`. |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R5-revision-feedback-round2.txt` |
| Git blob id | `1d895a266978b90aa4c3ef23ff15faa4620b38f5` |
| SHA-256 | `ec1a214dfb8570a5b654828d22874e7cfae3ec69807acb8184e21af6fdff5452` |
| Bytes | 5164 |
| Lines | 20 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `627abfcd…d8b4`. |

### R6

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R6-terms.json` |
| Git blob id | `9ec2e40728e6a6456170640a3f692f418541ee0b` |
| SHA-256 | `58a03d4df80b2d5d98abd3ff27fbe8a100e44a75c987a66b4da9eb13fe2f154c` |
| Bytes | 1933 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | R6's terms; the start line names this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R6-attempts.json` |
| Git blob id | `bd32a7b5072afc89ac9c496e25e1de306456f754` |
| SHA-256 | `a3a5187f4e9e08aa01d3327bcd64036f4edf0a418bf32bcc6cae99338196f3ef` |
| Bytes | 916 |
| Lines | 27 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for R6 (`evidence/attempts.json`), set id `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS-R6` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R6-Phase4-CR1-e8d6219b-ecf5-428f-a204-6437d2d56ae1.record.json` |
| Git blob id | `302224b30287c007c6194335491207e9649409e0` |
| SHA-256 | `899ef57f75e1a69a618388e233aad40e1efe42646af17cc9d1e198e61dd7b205` |
| Bytes | 10356 |
| Lines | 268 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `e8d6219b-ecf5-428f-a204-6437d2d56ae1`; outcome interrupted; `phase4RecordDigest` `3ab30351ff0d57e6c83dc4dc2fe70a4c16b3e68c98e31ea33d5f4e9ef2355b74` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R6-Phase4-CR1-e8d6219b-ecf5-428f-a204-6437d2d56ae1.record.sha256` |
| Git blob id | `328467c3cdb76da28da85bc835b6a327928ce348` |
| SHA-256 | `541f9b41e504e4aa4629a2be7cd71aa3fa98f57838caba0194e2c657bf7ef4e2` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `3ab30351…5b74`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R6-export-e8d6219b-ecf5-428f-a204-6437d2d56ae1.json` |
| Git blob id | `df598cdfdf0c5cc244e5cda10351b7a594375dfe` |
| SHA-256 | `dca6fc5df8beddd74b39d0dbd8e06338c354b761615e2592be45da58b829b69b` |
| Bytes | 12440 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `e8d6219b-ecf5-428f-a204-6437d2d56ae1`'s export, read 2026-11-13T04:44:01.705Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 5 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R6-plan-291cec129ef00b7a4698c960229d612428e20dc42c6923b0b3046b1530e6cd09.json` |
| Git blob id | `9b9a5bc99a8d773676d122447bdf1af7f6af3ad3` |
| SHA-256 | `3f422f08368992c1a79512c852cdd6052d1c03242d17347f2a0cbfe504c8fdca` |
| Bytes | 41013 |
| Lines | 74 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 1, command `cmd_planner_f833f030c739e2121c868aa6b3d9bf6d`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R6-plan-4f7683b64557c001f6171d77704a7e61705d9e889b0554df5e7fc03dd1995d5e.json` |
| Git blob id | `397e0beb60de14f185a393746730dcf574f42c4d` |
| SHA-256 | `83868350cea7510456244b1f7e14b390293abcd4f0d6aa7177787528e346b96e` |
| Bytes | 32191 |
| Lines | 74 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 2, command `cmd_planner_864891c9ccf6c3d87bebf8029ec143a6`, as the runner saved it; decision: none |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R6-planner-evidence-CR1-command1-c4e2536df0171b858ae8899a56d33537d60b78f2b07824f3b69d582fc5000110.json` |
| Git blob id | `9908cfb8189949ff571a8f00b89562f48bedf6b8` |
| SHA-256 | `36bec5e47297b90872b15bd3d304f5dcd1fd9ab9b8b267dc312c0bc9f2553499` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 1, command `cmd_planner_f833f030c739e2121c868aa6b3d9bf6d`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R6-planner-evidence-CR1-command2-c2b33793781bfd06fca31d87531b8ae91ba6cb1955115c15090d00851d02e6b8.json` |
| Git blob id | `ff20b4f1d671d2b12cbc80f9a79fa5f229d1bed1` |
| SHA-256 | `f3840c71185d74994768b2a86261b3ec7a0d8d20b6cc1d4e1d59aeaae25bf9d3` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 2, command `cmd_planner_864891c9ccf6c3d87bebf8029ec143a6`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R6-revision-feedback-round1.txt` |
| Git blob id | `fcb92a03ddaef5e42908d2cf240c91f7a386bfdc` |
| SHA-256 | `8a23c2e7701d2d9facf40cd58bd6891c4bed7e8d5c16bce6e1fbd863d5f7f0a6` |
| Bytes | 4074 |
| Lines | 21 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `d78275c0…30b5`. |

### R7

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-terms.json` |
| Git blob id | `a344cd2126911e4fd481cb467956d383dabe9adf` |
| SHA-256 | `145cfb6192bb7e03a0840913a724a83fe90691c5e75661603900608da72d537c` |
| Bytes | 1933 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | R7's terms; the start line names this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-attempts.json` |
| Git blob id | `b5dcb6aacee3fc3353873fa06622142671d00e44` |
| SHA-256 | `e9b71a0fafcc494c7ac46836a63bdf3d5b13b70c8fc634721dab536be2c0784b` |
| Bytes | 1295 |
| Lines | 38 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for R7 (`evidence/attempts.json`), set id `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS-R7` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-Phase4-CR1-c6a7e1f3-e1f7-421d-90f2-1c0118e5c9d4.record.json` |
| Git blob id | `04df2f5dc781033b08cc7680cc74860b83384a34` |
| SHA-256 | `ba0b8346f2d2ec1d69e6c1b333cf2885e84059709e1ee25f30813c40e6288096` |
| Bytes | 16128 |
| Lines | 416 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `c6a7e1f3-e1f7-421d-90f2-1c0118e5c9d4`; outcome passed; `phase4RecordDigest` `69c042c5918f4dfa795f8591c0210307b79e31ddc41eb5b99409b689b6df6002` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-Phase4-CR1-c6a7e1f3-e1f7-421d-90f2-1c0118e5c9d4.record.sha256` |
| Git blob id | `7a3ff7ed8f2cf63af121a600a339ba8157562a3d` |
| SHA-256 | `64d07872fefdc9ba1b14214137e80ac05bdfa40e4ca126a5f234ace722545151` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `69c042c5…6002`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-export-c6a7e1f3-e1f7-421d-90f2-1c0118e5c9d4.json` |
| Git blob id | `3264e9d5b85ca0b474f066d5d9df2ba36fc55b26` |
| SHA-256 | `a31db44f340718ec7e66dce061952d03e434e6295349c8ecef87fad8daf608ba` |
| Bytes | 15380 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `c6a7e1f3-e1f7-421d-90f2-1c0118e5c9d4`'s export, read 2026-11-13T04:44:01.915Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 8 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-plan-61d0788398243aa5e3671868e3dd8f68e74a4faf76d5c70f0238d0804228dc0f.json` |
| Git blob id | `ad8350ed68ecd4600f6d949bca8411800c18c973` |
| SHA-256 | `4544e40260b826e142f7ff5c6753bc72ccaafd1edce136bdcf00520bdeff1b05` |
| Bytes | 29279 |
| Lines | 64 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 1, command `cmd_planner_f4c32df68e476302726f4114a3d8e337`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-plan-622175a96f1476855f6ae6beb90816d3018430a0d3507dd715c9a6e7caaab157.json` |
| Git blob id | `4a47e155f624de465ed52df82a18f07d15e67dcc` |
| SHA-256 | `ae584546084089b9a486ca6609605b0a7a0bfb16cbd803b4306390e5d2410507` |
| Bytes | 25850 |
| Lines | 64 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 2, command `cmd_planner_d459522921a7c97051345a36c6b56141`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-plan-9e6ca0a7de5bf1cdf0dd3c009cb9d28c89b375e992808b7150863db720230f42.json` |
| Git blob id | `a91ea6cb47548f836cce07ca77edf7ac3ad20aff` |
| SHA-256 | `d94a95aa800afff97cb5b8977a9d1be404f9008dce8f91b76dd02091f1677baa` |
| Bytes | 24739 |
| Lines | 64 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 3, command `cmd_planner_220d092704a87dccf62d5ef97b137268`, as the runner saved it; decision: plan.approved |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-planner-evidence-CR1-command1-9ad28d491ebb02df6cc94c08bc4e84de5ebde330c52faa70c91fbb6f91ca6296.json` |
| Git blob id | `7ce8df293a071b00f8471a52d212c66c05657538` |
| SHA-256 | `620c94424d7b69de34749709d88700557581dca2a701759fd9927dd923703fdc` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 1, command `cmd_planner_f4c32df68e476302726f4114a3d8e337`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-planner-evidence-CR1-command2-e44bea81001cfede35c517ba6540f5093445cba8ac15b7390f1b9bd675faec06.json` |
| Git blob id | `9cfc4193d6d5bb37aba4606e4a197153b17cc18c` |
| SHA-256 | `2c5391a9d298526be0c17bb9911a694674a5feac3a29824196f7df7fa63e032f` |
| Bytes | 1418 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 2, command `cmd_planner_d459522921a7c97051345a36c6b56141`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-planner-evidence-CR1-command3-a4dc8d6336ed9115c7f68792b37fe458118dab2fa161081fbc22e19b10120d20.json` |
| Git blob id | `dca3160f4cb145df86062b12612c20fcc62847cf` |
| SHA-256 | `741832daaa80a0964e43de08927f1e8aa6eb4d22b659188691b0cd1d93163d24` |
| Bytes | 1418 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 3, command `cmd_planner_220d092704a87dccf62d5ef97b137268`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-revision-feedback-round1.txt` |
| Git blob id | `1de1e77fce433cb1c8bc94ee02acf5cd7d0b21ef` |
| SHA-256 | `e536d95e501fa215f3fba04641bf9adace6b3b600a18af0f1b8d46536fbc587a` |
| Bytes | 1209 |
| Lines | 5 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `a95efcea…6c0d`. |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-revision-feedback-round2.txt` |
| Git blob id | `8b3778e6a83d901712fb0f711f635232a49cc573` |
| SHA-256 | `b54fe10316bb986f0f7a43c7e9d3d1abf757a906bc81483e9666b11528d4f2ed` |
| Bytes | 1008 |
| Lines | 4 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `7c1340b9…13d8`. |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-Phase4-CR2-4088903e-bfc2-4a31-bfea-be1b61ba3778.record.json` |
| Git blob id | `007ad65c2fbe3f69d3e19dc1a7dbfb95a0f7f17b` |
| SHA-256 | `cbb970a3c148dda9712601b7a353857abbd35798db6757e023f22130559eae5e` |
| Bytes | 5477 |
| Lines | 144 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR2's run record, room `4088903e-bfc2-4a31-bfea-be1b61ba3778`; outcome interrupted; `phase4RecordDigest` `24d69b8fa057378c475da590f163a07d21786139055deb8d146d9c0fb699c3a7` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-Phase4-CR2-4088903e-bfc2-4a31-bfea-be1b61ba3778.record.sha256` |
| Git blob id | `cb35a56206d798ce9ef4dabca1ad7157f373c402` |
| SHA-256 | `8a48b067c5085da9f19e5a56fb010525c81080f106263d3c15f33d55afb98273` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR2: `24d69b8f…c3a7`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-export-4088903e-bfc2-4a31-bfea-be1b61ba3778.json` |
| Git blob id | `d675747e5083e1a84244299d42ba7f7bef84c786` |
| SHA-256 | `0dd8692fc58ebadb50a28219264bda2bb8a41ceaed7d690b3f0652ef0d03ca13` |
| Bytes | 5196 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `4088903e-bfc2-4a31-bfea-be1b61ba3778`'s export, read 2026-11-13T04:44:02.044Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 3 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-plan-69a4343196b6ea11966b8626949c4def5dd18dd692d784038ebe308fd0d75762.json` |
| Git blob id | `f71450c62ee4db656f401b4ba98bfaad7a0e5e9b` |
| SHA-256 | `a7850038085a13840c70517c212945b18ceac60814641f6a2f31d27bce65ce56` |
| Bytes | 23643 |
| Lines | 62 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR2 round 1, command `cmd_planner_7d3d9d073a89969a0c40679666d4d4f8`, as the runner saved it; decision: none |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R7-planner-evidence-CR2-command1-035f43f0ffcdb3e53989fe79d93c44a4df5e4a02352171451bf6b35db36a4cdd.json` |
| Git blob id | `858ec86f2a1602a2664669aad7ad7e3d962f738c` |
| SHA-256 | `18cd760891947db0ddeeae2a83c21d70ae049cd16c7bc05160fb154f6e069156` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR2 round 1, command `cmd_planner_7d3d9d073a89969a0c40679666d4d4f8`; its file name on the PC is the SHA-256 of the command id |

### R8

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-terms.json` |
| Git blob id | `f9a2e96666ba1a0edda0ed262385479a0b4b1d20` |
| SHA-256 | `05d7c5f7b745bbae49c0c50bebee8ba97a017967dce40e6a79663360a7bd18f2` |
| Bytes | 1933 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | R8's terms; the start line names this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-attempts.json` |
| Git blob id | `9750ef9be9b08a1e5bdeb16f1e347f9f9ae1d59c` |
| SHA-256 | `4004bdd363a7e3ef7b44b17c4c9630e179b232e7f5477db1355dca05de1db9eb` |
| Bytes | 1667 |
| Lines | 49 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for R8 (`evidence/attempts.json`), set id `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS-R8` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-Phase4-CR1-7f4b2f45-dfc0-41c4-b534-169c3deebc6c.record.json` |
| Git blob id | `ca16f1a0f6a7b0e8b43d3fb0dd7a5b55464cfd5f` |
| SHA-256 | `eaf1200cda45c703d75dc596c479c1ffc457465b18fd04f157db0bd774c5f552` |
| Bytes | 11245 |
| Lines | 293 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `7f4b2f45-dfc0-41c4-b534-169c3deebc6c`; outcome passed; `phase4RecordDigest` `f6ef02c360b5ef6ce63e734c2c58276cdf77ebc11a92315b588d66b314ff3a59` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-Phase4-CR1-7f4b2f45-dfc0-41c4-b534-169c3deebc6c.record.sha256` |
| Git blob id | `c00e83ef84b5e53234d4b8dd50381ac470e1bdee` |
| SHA-256 | `22db54476259952b1589ec9c5c21076405baac03b88128138a16849340f26034` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `f6ef02c3…3a59`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-export-7f4b2f45-dfc0-41c4-b534-169c3deebc6c.json` |
| Git blob id | `611f370a3ff4aff1e973a99e4659fd06025e2888` |
| SHA-256 | `a0128f78352e911eb280f79396a00d8d2ae734c1c6744431b3a0a212391213af` |
| Bytes | 11553 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `7f4b2f45-dfc0-41c4-b534-169c3deebc6c`'s export, read 2026-11-13T04:44:02.167Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 6 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-plan-15bd40baaba12a88e1614f52354f868d083537dabe6e758f98158b9a3afef854.json` |
| Git blob id | `210a83f432e1ce308efbc0ca1e324bb406c42555` |
| SHA-256 | `2c46d6b076431e721d656c188eea647a8ae20acb11db303bd90deb6d3683ca8b` |
| Bytes | 40752 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 1, command `cmd_planner_ffb061e979f3dab3cf1e6b188d6afc2e`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-plan-9e04c54b311aff9d924da39b65cbe6a2e52747570c2afd341b3f022296071cdd.json` |
| Git blob id | `5e53255598df9fbf1ceb19a15fd5732a706dd66a` |
| SHA-256 | `c92f1ea4d02a8301c64cde47ff83b711d506ae9e6fafceadd69817661320e388` |
| Bytes | 42417 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 2, command `cmd_planner_95b69c4b606cb14f0f8ff6d7ba765bb9`, as the runner saved it; decision: plan.approved |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-planner-evidence-CR1-command1-198e65d6a4a6894f278c7795993e2ff14667d66b1868f95fd2705fd139cec67d.json` |
| Git blob id | `1dbc9949cf4d8126da1d1df9468a55525aba5069` |
| SHA-256 | `cd8168547b0d680629e82c01ab6323900cb3465510009f8da6550737ea1dbf38` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 1, command `cmd_planner_ffb061e979f3dab3cf1e6b188d6afc2e`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-planner-evidence-CR1-command2-5ac0bbf317fefe7280b4c8a4b71e1c5a918e73dc641f3796eddd1cc700252017.json` |
| Git blob id | `d53dc3fbb600b7baec3b90acd5df54e49c4fa9aa` |
| SHA-256 | `a25b2d20d3bbebb4bdfe6e85cc4b8e41c329f5d3a24fc432587639a950695b97` |
| Bytes | 1418 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 2, command `cmd_planner_95b69c4b606cb14f0f8ff6d7ba765bb9`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-revision-feedback-cr1-round1.txt` |
| Git blob id | `2c4f042490f63981faa2d6da87b08848c984af5b` |
| SHA-256 | `c872731f24eb7c7ea3d7c35426298e35a33d2121d20db4b97c164ac28d960093` |
| Bytes | 1651 |
| Lines | 6 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `c30e1ae0…70b6`. |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-Phase4-CR2-10d2604c-99b1-4e21-93ff-76a94863dfd9.record.json` |
| Git blob id | `ed71e24c71a57883faaf84ef07c1913dd6d760c5` |
| SHA-256 | `ded02e16d3b149fe2e7228694bb11184c70602929ad9ad9d01f3201d51b92b13` |
| Bytes | 11245 |
| Lines | 293 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR2's run record, room `10d2604c-99b1-4e21-93ff-76a94863dfd9`; outcome passed; `phase4RecordDigest` `300e38c28ecb4e0896626c6c2f8c673fc20d621c4b49f42610fa7142a36c7c0f` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-Phase4-CR2-10d2604c-99b1-4e21-93ff-76a94863dfd9.record.sha256` |
| Git blob id | `eb82cfd0e8e11275af986eef12ff57ea9955fefe` |
| SHA-256 | `7c8918241464b39fba0e5228741970645861fff9198beffe68b03654db07c1cd` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR2: `300e38c2…7c0f`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-export-10d2604c-99b1-4e21-93ff-76a94863dfd9.json` |
| Git blob id | `8503eda366b744cc38949039132afd6448219191` |
| SHA-256 | `b2f5741aaded8c457bb644502d2bfeb878af8d9c039dddf44762e81fff3e6291` |
| Bytes | 10865 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `10d2604c-99b1-4e21-93ff-76a94863dfd9`'s export, read 2026-11-13T04:44:02.506Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 6 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-plan-1065bb456bc7289763e02a9c46cdd1e2ef71b9d3b684464797a4074270b78f46.json` |
| Git blob id | `e65d1c75b876df836a18cbe57ed49e739c931308` |
| SHA-256 | `6cf8c24522ea4338fb9228aac581544a6f32e0ea28f188acb051e96afc50fb22` |
| Bytes | 34636 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR2 round 1, command `cmd_planner_3613b4269e0873d6fc5b5e856ab7bb43`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-plan-3c7f658a4041398511027fe8a414ea5fc04fd2282978e8fcdf9c28c6028a47a7.json` |
| Git blob id | `25556c3d58c64d90f722ee573263bce08f4aa822` |
| SHA-256 | `6291f960d3786c834e5637303fa089306838eaf1442bc11666de3a229eabc9cc` |
| Bytes | 34641 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR2 round 2, command `cmd_planner_aaeb48dca3912afaab0cadedf807f11f`, as the runner saved it; decision: plan.approved |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-planner-evidence-CR2-command1-49296a2f79822ea226b1f6ff7fc72f6275517ee59e9f431f05402f36f56da1fb.json` |
| Git blob id | `d8ca4a70bdf0f418ce595f9bae91316779e42812` |
| SHA-256 | `09ce04bcfa8b649b3b13a1032c632525af8d1837d054fc34e41a7998c1e00a00` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR2 round 1, command `cmd_planner_3613b4269e0873d6fc5b5e856ab7bb43`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-planner-evidence-CR2-command2-35fb8d339b1437a6fdb326ddb47c0d4029adc5344377d552c2e4915a671ca3ac.json` |
| Git blob id | `e03be5e0d9eb3cd4fe33c43306b332f968cf674d` |
| SHA-256 | `aac342322651fc5d7a96c0becc30c7e6e0952da3e7e5c62d7717269fd4499115` |
| Bytes | 1418 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR2 round 2, command `cmd_planner_aaeb48dca3912afaab0cadedf807f11f`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-revision-feedback-cr2-round1.txt` |
| Git blob id | `e142cdd97f29974c67a1cc867ad845cee1371d98` |
| SHA-256 | `35cab9c55e0dc630869366c7dcabb054ec87b97d3fedd9984a645a5f213982b0` |
| Bytes | 721 |
| Lines | 3 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR2, sent with the Founder's revision; without its final newline it hashes to the journaled digest `63286489…0710`. |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-Phase4-CR3-fad7f5ff-cbf0-49ac-813b-5a650de6b1b0.record.json` |
| Git blob id | `803143bae10056e6aa9374b22f5edee034b068a6` |
| SHA-256 | `d47a0a12ce33dfdd692e6e4b9c0a0d00bc9517bbed917750510f3e5929e30c59` |
| Bytes | 9421 |
| Lines | 243 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR3's run record, room `fad7f5ff-cbf0-49ac-813b-5a650de6b1b0`; outcome interrupted; `phase4RecordDigest` `46ee0b34b94bb6a17fb4a5208fe0d15fd2d82911297bfe3429838b8f8c503b0c` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-Phase4-CR3-fad7f5ff-cbf0-49ac-813b-5a650de6b1b0.record.sha256` |
| Git blob id | `d2a7aba2de9dc169e54942e840637c5d024213ab` |
| SHA-256 | `3a0c3fa67241830daddbf24e8c35db6d824dab3b9d2ed129fc12f7a84a7e9e42` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR3: `46ee0b34…3b0c`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-export-fad7f5ff-cbf0-49ac-813b-5a650de6b1b0.json` |
| Git blob id | `99ed8b9ba1003a738b04f0fe76652877da2f97ac` |
| SHA-256 | `2508814dc629f5180ff0bad87c99957e98ba880cd97eb2dbfaee64e726300eef` |
| Bytes | 8387 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `fad7f5ff-cbf0-49ac-813b-5a650de6b1b0`'s export, read 2026-11-13T04:44:02.628Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 4 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-plan-5368e06ee6982b42f1e407457198ecf476849090ca16de3dcd03290ac5021e5c.json` |
| Git blob id | `6832db41789930aaf4a4a724a6104affaac297f6` |
| SHA-256 | `9b50dafd8730951cd529b3b28cb34dd70cd302bf38f9685b3a8d3e251a8bd60a` |
| Bytes | 33667 |
| Lines | 65 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR3 round 1, command `cmd_planner_393f03b0a29f4e4f7228ec55ef406eba`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-planner-evidence-CR3-command1-e28dfcb94d1a0bdcd419757e018645578adf239a49e1d5ee09b5388453b042e7.json` |
| Git blob id | `9f919a52f1293450cd6d6636f4ad70bfb1c5f0d8` |
| SHA-256 | `874b206bcaf604cbd39687e20d6268fc4296d8c824893ce4a83dfa04b4b2efa8` |
| Bytes | 1438 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR3 round 1, command `cmd_planner_393f03b0a29f4e4f7228ec55ef406eba`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-planner-evidence-CR3-command2-32365261e1640b96a7da55bc5cbd266583e198d4ab7c244c4e9ed210b59fc794.json` |
| Git blob id | `ac2c5c865efdca33209297e8060f698d5c9c3787` |
| SHA-256 | `47fde1cc2084c0eb1f9b958648ed15cb6e5963365aaf39aedc23b58c3abc7ade` |
| Bytes | 1418 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR3 round 2, command `cmd_planner_f0a154895739a81b096ccd0c5a82e954`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R8-revision-feedback-cr3-round1.txt` |
| Git blob id | `a1c1f3bad63e47fc095d14909ae9e88f62c31245` |
| SHA-256 | `b1b73aebae9ec7475bd9b1f19c5b271010ee0fa8c05783789fc0576ce038c93f` |
| Bytes | 1340 |
| Lines | 5 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR3, sent with the Founder's revision; without its final newline it hashes to the journaled digest `709b03b6…1faf`. It carries the false statement of finding 5. |

### R9

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R9-terms.json` |
| Git blob id | `b8d6e31a0a8249d49d8f7b183e7244fd0e2b8046` |
| SHA-256 | `c22199d8a86ff04ae6b847f66ae6d33027c3d08f05d5de040c16478f0af63fa6` |
| Bytes | 1933 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | R9's terms; the start line names this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R9-attempts.json` |
| Git blob id | `822977628214391130c9ceb6bccd06906732cb6e` |
| SHA-256 | `a24b08172e4c934a0bfbae4718e30f81923dd075845b9edc40879b47e0194266` |
| Bytes | 909 |
| Lines | 27 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for R9 (`evidence/attempts.json`), set id `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS-R9` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R9-Phase4-CR1-06147929-1d35-4102-b1e6-37ac5e80c32e.record.json` |
| Git blob id | `3eeab70e4eee49b66714f9ec104d7696f024ed00` |
| SHA-256 | `6f04bd3523c477a99e3d8d7c4536440038a7878e60105250c272577fcf95aaff` |
| Bytes | 4546 |
| Lines | 119 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `06147929-1d35-4102-b1e6-37ac5e80c32e`; outcome interrupted; `phase4RecordDigest` `52dccc0e7190b80abe6e3be7908c85299d210bacf05b3bba358422800b2e9f97` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R9-Phase4-CR1-06147929-1d35-4102-b1e6-37ac5e80c32e.record.sha256` |
| Git blob id | `4b561ea0713daad3a2b3e95dd58465bd250ddcaa` |
| SHA-256 | `2c2589cd40bbd47203c2f292cddf6c1f0e6850fefb1fa6e2d19399132b98d785` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `52dccc0e…9f97`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R9-export-06147929-1d35-4102-b1e6-37ac5e80c32e.json` |
| Git blob id | `b0a7e60851af38b6eb7964317abe6a9820002377` |
| SHA-256 | `765cf8ab25b8b1daf7c27f654666883ef8e5902a868fba8c169e4e734311426a` |
| Bytes | 3555 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `06147929-1d35-4102-b1e6-37ac5e80c32e`'s export, read 2026-11-13T04:44:02.763Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 2 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R9-planner-evidence-CR1-command1-aaf83eb179c30a920d5541e25450800066da4bf8d53a4239d0e8238b75861799.json` |
| Git blob id | `ce9803d94553fb5c43f5404257302c9f84a67764` |
| SHA-256 | `76238e34bae4a6c2f114e158bf22d76f268b570e355391f1d4aae455d0035470` |
| Bytes | 1422 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 1, command `cmd_planner_6c89b66c6c79c6f6b2b9c93b17f633b9`; its file name on the PC is the SHA-256 of the command id |

### R10

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R10-terms.json` |
| Git blob id | `43821dbd872f93a5375e65bfb9e024194b6df9c8` |
| SHA-256 | `8fb8f92afab4b057e05f76e70690673b063649234222841e59d807cef3b4081a` |
| Bytes | 1934 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | R10's terms; the start line names this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R10-attempts.json` |
| Git blob id | `f612105f17a3b4d60140c9a9fe62b11c6286b7c0` |
| SHA-256 | `588e8b2f1fe63c00d93d4e83d2c50043846767c5f09f5ca1fa88474f0e372388` |
| Bytes | 917 |
| Lines | 27 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for R10 (`evidence/attempts.json`), set id `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS-R10` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R10-Phase4-CR1-fcca38f3-38e1-4ff7-8cfd-a185be1d4175.record.json` |
| Git blob id | `a525fb3dc283b4649bd3eca7d52779b812e51a13` |
| SHA-256 | `b5b0c37eaebf981807b2ba9adf3d0c8e46a44ed8d268647ac1b9ed042dc610ae` |
| Bytes | 10366 |
| Lines | 268 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `fcca38f3-38e1-4ff7-8cfd-a185be1d4175`; outcome interrupted; `phase4RecordDigest` `6888cb8cca476c7c8c40def759a468876d8665a424b1497fd2194525681e1067` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R10-Phase4-CR1-fcca38f3-38e1-4ff7-8cfd-a185be1d4175.record.sha256` |
| Git blob id | `a155e378b10ba1b0c6bdb0fffae7688684d105ac` |
| SHA-256 | `a5d49c0c46c0614c6379698273ddb6a24d2c5bb03c10f06a29c5f4ebfdd42f5d` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `6888cb8c…1067`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R10-export-fcca38f3-38e1-4ff7-8cfd-a185be1d4175.json` |
| Git blob id | `256930e8f5ef85c7b2d7563e710eab72c1bdfd0d` |
| SHA-256 | `57184be9fe63cabfd18e363e979b6e33c5feca975de87f88c1b7529ca910786d` |
| Bytes | 10613 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `fcca38f3-38e1-4ff7-8cfd-a185be1d4175`'s export, read 2026-11-13T04:44:00.069Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 5 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R10-plan-613c899eb2afdcdbd6856e369916d2a726d82a5b3b800bc332a099878b144b5d.json` |
| Git blob id | `52e23c2e1633761d2695882e8e0ab98cea0dcbcf` |
| SHA-256 | `1bcf0c31be8f813bb388faa894ed984e27695b4b0de007681735a775822cc683` |
| Bytes | 44379 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 1, command `cmd_planner_2bff5aa245876507ad05c96678a84dc0`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R10-plan-1952499eef0425e8a4064a853cbdb875668b497bf6005334023bbc124688caa8.json` |
| Git blob id | `2b9009b91f3fd1a359e97beec9ee24bef6b14ecd` |
| SHA-256 | `075bbde750db948fb00de59fac22a11a15be8bff8d5ae19bf96ec6aea72be63e` |
| Bytes | 44943 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 2, command `cmd_planner_f79d3dcd3c5db2fd97005e00bdfa5008`, as the runner saved it; decision: none |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R10-planner-evidence-CR1-command1-3a9f6b326cc437c87e7b9490af307d841822c8cfe42bc10e54ade959662f8acc.json` |
| Git blob id | `1426fd64bddd932cf48aa5680e45babcd7b98e75` |
| SHA-256 | `f26b51c438fab6e490789157c03744d328cb63e7311f9ecb1f7fa358a637a27d` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 1, command `cmd_planner_2bff5aa245876507ad05c96678a84dc0`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R10-planner-evidence-CR1-command2-20347d154f63440f063522e08243b35aae63742cce33c31cc41f2c5b0946c95f.json` |
| Git blob id | `47b805bfa6f10abf5ad4e7b7167387ae8a0014bd` |
| SHA-256 | `a9d8e3b76226e4a36d7c5aad70831d08a415734abc714d01860c17963d0d7a91` |
| Bytes | 1418 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 2, command `cmd_planner_f79d3dcd3c5db2fd97005e00bdfa5008`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R10-revision-feedback-cr1-round1.txt` |
| Git blob id | `4c90e49f87739482011a873fc8b6d18b9f7dae17` |
| SHA-256 | `030071611f7e7718f86e58a6ebf4e00089c09131625a4aebb3d89b567936eded` |
| Bytes | 2260 |
| Lines | 8 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR1, sent with the Founder's revision; without its final newline it hashes to the journaled digest `224da3a4…3f02`. |

### R11

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-terms.json` |
| Git blob id | `f80376c0f9caccdec1a38be8ed19bee6f8fb5d3a` |
| SHA-256 | `221b94c968c65d77ccff69a6dfcb6dc45800ddc527fda372561b8abe3047b754` |
| Bytes | 1934 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | R11's terms; the start line names this SHA-256 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-attempts.json` |
| Git blob id | `9fde49e75efb0fb3ea619b4ae52a030a2592265b` |
| SHA-256 | `ab66f89aae3f6ee5322e5927c6f5e205c09bc3a03391876ac19b5dccb042c1da` |
| Bytes | 1596 |
| Lines | 46 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for R11 (`evidence/attempts.json`), set id `FOUNDER-ACT-20261106-BR-PHASE4-STANDING-TRACKS-R11` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-Phase4-CR1-72a6b018-5784-4b8c-8b6e-6423f6694ed8.record.json` |
| Git blob id | `a96dd10fad77a9640fa6f8da47b70ae4d6a8def7` |
| SHA-256 | `34bc5542d4792ff754748f2c8e5d33fbddc8b1fd43c29e481fc1e4d08aece9d0` |
| Bytes | 6361 |
| Lines | 170 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record, room `72a6b018-5784-4b8c-8b6e-6423f6694ed8`; outcome passed; `phase4RecordDigest` `921c698a4a6f9f5f9512d126f25c9a98fdac6a04e1b0ec8f349ce6065ee5c112` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-Phase4-CR1-72a6b018-5784-4b8c-8b6e-6423f6694ed8.record.sha256` |
| Git blob id | `7d08de35518250f6a8aee5a1bdb79659fad700a6` |
| SHA-256 | `625929384f267c220d9e98207eeb0249f15874240ebeb9fac7cef73f148fb590` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `921c698a…c112`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-export-72a6b018-5784-4b8c-8b6e-6423f6694ed8.json` |
| Git blob id | `db42cff447fa0f7ed7ec5e75590b2177f8d400ea` |
| SHA-256 | `d9c4c51a669ed6edf40e70c065bd0acd801d2c27e0980a631500421718155719` |
| Bytes | 6640 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `72a6b018-5784-4b8c-8b6e-6423f6694ed8`'s export, read 2026-11-13T04:44:00.388Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 4 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-plan-414c929dc176e12ca1f3c02da44e69984328f0acace9c4c1eb7e22c2c44492a5.json` |
| Git blob id | `71de6292dcacf9ecc7f2ffcadd2a2c305e536472` |
| SHA-256 | `2e71e671d7702dddba977ffbbb43991bf3b5a44ad385db67191f5445cd43021d` |
| Bytes | 34359 |
| Lines | 70 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR1 round 1, command `cmd_planner_2be5f9664d4145f8c4953060bda1ec9b`, as the runner saved it; decision: plan.approved |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-planner-evidence-CR1-command1-e6e355d69b06c161148aedb7a8744f4b68c89185b7cf4a223cd8e3516e3edf8d.json` |
| Git blob id | `ef15b496a63b86a3a71eb1fe17cd543c78459c22` |
| SHA-256 | `5929f8c5edea317f30bbc1a791f55d493f02da60c1bb2a216be5c9ef9c3f1cc8` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR1 round 1, command `cmd_planner_2be5f9664d4145f8c4953060bda1ec9b`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-Phase4-CR2-8fb5d32b-5ee5-4580-bd4f-c4a549c61759.record.json` |
| Git blob id | `2fdaf2c6d719f945d4b17fbadd64ce656776254a` |
| SHA-256 | `5fccf850a080cab05e0c5f1c57ca49e277873109a345b4ebb0a2dd9756634fe2` |
| Bytes | 6361 |
| Lines | 170 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR2's run record, room `8fb5d32b-5ee5-4580-bd4f-c4a549c61759`; outcome passed; `phase4RecordDigest` `d056b44cf7ebfc6e6850f146d5cb1e4f993edb399ca8330f8e6a0efab8d854a4` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-Phase4-CR2-8fb5d32b-5ee5-4580-bd4f-c4a549c61759.record.sha256` |
| Git blob id | `ecff67544782e6286da2e3b48b92b159a1147204` |
| SHA-256 | `7833c780f28322b6533195962d64778d2f45f831241670ac5e546f137eecfe38` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR2: `d056b44c…54a4`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-export-8fb5d32b-5ee5-4580-bd4f-c4a549c61759.json` |
| Git blob id | `ce034456ce562e8ddca2aa9a82b0adbb56f7f1bf` |
| SHA-256 | `9e8b143b6eed6c07991b8c57fd035f9054d08c4f038a9960ac03811807572142` |
| Bytes | 6793 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `8fb5d32b-5ee5-4580-bd4f-c4a549c61759`'s export, read 2026-11-13T04:44:00.543Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 4 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-plan-821b7cf08c817a018d72128c9cac15c65f6158ac0073bc6c7091a21e237a42ec.json` |
| Git blob id | `fd776a84f91af3723d8932b3553733fddd7d4075` |
| SHA-256 | `091b3d7f4e01f2d9a1e9cb403ef99253b00cff2c47afda0e114ba2fe7494007f` |
| Bytes | 32527 |
| Lines | 64 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR2 round 1, command `cmd_planner_b4a10b285db231693bd22bd2a5917c4f`, as the runner saved it; decision: plan.approved |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-planner-evidence-CR2-command1-d46dc79973aa0c036e472e0744668c33e5b75acd29373fda836208490f6de4a2.json` |
| Git blob id | `675b0a6f81f223a8fc2f0e51b3bd47ac665db467` |
| SHA-256 | `ad1f04658854e3538f83c92d8211677e478cd60e5152371ee52f95b5e8977e80` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR2 round 1, command `cmd_planner_b4a10b285db231693bd22bd2a5917c4f`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-Phase4-CR3-20813999-489e-40ee-83e6-742fb174d2af.record.json` |
| Git blob id | `280af36b57dc2a302cef6f81b796f3fea7f8228a` |
| SHA-256 | `045d120ef44de23fa96fbc628e8a1aef6f73dbcfee266ad43c7a3219ceff7dfd` |
| Bytes | 11247 |
| Lines | 293 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR3's run record, room `20813999-489e-40ee-83e6-742fb174d2af`; outcome passed; `phase4RecordDigest` `e54ec20fdb86288a277e2203e1187f2c54f0af823417cdc54e5cdc1c3eccfc9f` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-Phase4-CR3-20813999-489e-40ee-83e6-742fb174d2af.record.sha256` |
| Git blob id | `0a07d7f8b227337798462a86a426d942d4b33a76` |
| SHA-256 | `249688a0129eef1242647a9dcdc9ed1d40b743ce5234a955451983df992351a3` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR3: `e54ec20f…fc9f`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-export-20813999-489e-40ee-83e6-742fb174d2af.json` |
| Git blob id | `13ceea379d1fed24418c075c83982012dacbc332` |
| SHA-256 | `2d3dd1132130bdeb63ca47f366fce4f2c52372c8cdb5c9260397564f059de0a8` |
| Bytes | 10831 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `20813999-489e-40ee-83e6-742fb174d2af`'s export, read 2026-11-13T04:44:00.698Z from the control plane at `adde0a9` (finding 4); one line of JSON as served, 6 events |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-plan-00c8329ae4e0811d22f4513928f8304449d81b90036dc9f584fa54609b8e8dba.json` |
| Git blob id | `dfa82c654025480d45dcf9a644ca8ac806a3d170` |
| SHA-256 | `efb1c3ea65e7198d216020ba7f32cd6404bda78f598627cd35eafbcc50625446` |
| Bytes | 28210 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR3 round 1, command `cmd_planner_539a128d3b9eb92ad5a95f5d9aff5a88`, as the runner saved it; decision: plan.revision_requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-plan-1fae4b7c3bf721e7afb0700e54125bae7e42c9468ea8855dcf56b2bb16c5e25e.json` |
| Git blob id | `ec700d50e60ca92804bdd70bf342ac618ec2edaa` |
| SHA-256 | `01cfb5e1c3cf435f25a864a7bd2e0090984286ec283edf1720b685f820965641` |
| Bytes | 28212 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the plan of Phase4-CR3 round 2, command `cmd_planner_202fcad1fbc4b5dfa9276c120d932505`, as the runner saved it; decision: plan.approved |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-planner-evidence-CR3-command1-db6e0732b84c5cad999f110c529e1bfb8ff582c6ca33cd58cc851f6d78006de0.json` |
| Git blob id | `1226097fef5e33cebdaff2a40f4e19a87eb7f32a` |
| SHA-256 | `048b09251af59b46fada0e4d313693a098b10ba449ac0d74e7ef306388bef87a` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR3 round 1, command `cmd_planner_539a128d3b9eb92ad5a95f5d9aff5a88`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-planner-evidence-CR3-command2-9142954f424f7e2089a92538a30128a00efdcfaa1adfd827c2b9a601f2d2d2fa.json` |
| Git blob id | `8e023413fb3a40932963cc7c088e153b23b447de` |
| SHA-256 | `5402602b0cc64f66fbda7137fc772246ca92b3cb239cf43c1a7bbf81eb9769fd` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the PC Planner executor's record of Phase4-CR3 round 2, command `cmd_planner_202fcad1fbc4b5dfa9276c120d932505`; its file name on the PC is the SHA-256 of the command id |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-R11-revision-feedback-cr3-round1.txt` |
| Git blob id | `e940f1b4243b392b91702541f48011d3512069d9` |
| SHA-256 | `04e25fef8506ed03fe5321836bacb0a9d6f890900bea00c03b4f06571a2dc2e7` |
| Bytes | 580 |
| Lines | 4 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's revision feedback in Phase4-CR3, sent with the Founder's revision; without its final newline it hashes to the journaled digest `bdf7b712…2fb7`. |

## The extracts

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-EVIDENCE-founder-readings-20261106-20261112.txt` |
| Git blob id | `1a4d019eedaf966ba77e77535dae6d27dd519a19` |
| SHA-256 | `7ea063c2d26fb953c897951a96bfab140babb482a8327b7c3fe50fbd0d2e1682` |
| Bytes | 762726 |
| Lines | 6184 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's lines, readings and outputs in the builder's session, 2026-11-06T03:05Z to 2026-11-12T16:35Z, masked (finding 7); each plan he pasted that parses and hashes to a filed plan is replaced by that file's name (finding 9) |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-STANDING-EVIDENCE-builder-audit-20261106-20261112.txt` |
| Git blob id | `34c159fc3f8a9ba1ec88f22ec6a885cb60e088aa` |
| SHA-256 | `5c9a2db50637e439285bfacc91cac011a6f33039887c653ea7da2b4e5ebe467d` |
| Bytes | 291020 |
| Lines | 542 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's audit record under F1 for the same period, verbatim, masked (finding 7) |

## The journal rows

F2 keeps each rehearsal's evidence as F1 of
FOUNDER-ACT-20261104-BR-PHASE4-COUNTED-RUNS keeps a run's, and that F1
names the journal rows from the control plane's routes. Those routes
answered only while each window was open. The builder asked
(2026-11-13T04:32:29Z): "For set 3 you ruled that the rows inside each
run record stand for F1's "journal rows from the control plane's
routes". … I recommend the same ruling for all of them. … Answer "yes"
to apply it to all." The Founder answered at 04:44:35Z:

> yes” on journal rows.

So the command rows inside each run record filed here stand for its
journal rows.

## The R8 correction

On 2026-11-11 (about 17:51Z) the builder told the Founder, and wrote
into R8's Phase4-CR3 round 1 revision feedback
(`b1b73aebae9ec7475bd9b1f19c5b271010ee0fa8c05783789fc0576ce038c93f`),
that a confirm of a gateway no longer `awaiting_approval` answers 409
`fingerprint_mismatch` because "every state but awaiting_approval clears
the stored public key". **That is false** at `8a62e2c` and `6b80c22`.
`upsertProjection` writes `pubkey = COALESCE(EXCLUDED.pubkey,
gateway_current_state.pubkey)`, and the reducer carries `pubkeyBase64`
forward (`projection.ts:154`), so the key survives enrolled, denied,
revoked and expired. `confirmEnrollment` checks the fingerprint first,
then the state. A probe at `6b80c22` against a local PostgreSQL 16 gave:
enrolled, revoked, denied or expired with the right fingerprint, 409
`not_awaiting_approval`; enrolled with a wrong fingerprint, 409
`fingerprint_mismatch`.

The Planner's round 1 statement was true, and the builder's feedback put
a false statement into round 2's input. Round 2 then failed with an
invalid plan, so the run ended interrupted; its record is unaffected,
and the feedback is filed as sent. The builder found the error on
2026-11-12 at 13:29:09Z, while checking R11's Phase4-CR3 plan, which
described the same behaviour as R8's round 1 plan, and recorded this
correction in its audit record then.

## Findings

1. **Pull request 155 missed both amendments.** Its inventory of the
   builder's signed copies globbed two folder levels, and these two were
   three deep. A recursive search on 2026-11-13 found no other signed
   text missed. Both are filed here, with their signature lines.
2. **R10 started on an amendment made in the session.** The 03:23:25Z
   line left 7 h 59 min 17 s before the PC's next apt-daily-upgrade
   (11:22:43Z), and Amendment 2 C4 requires eight hours, so the builder
   refused it. The 03:26:49Z line left 7 h 55 min and was refused too.
   At 03:27:37Z the Founder wrote "For R10 only, I amend C4 to seven
   hours fifty minutes"; the builder took the 03:26:49Z line as given
   under the amended C4 and started R10. The amendment exists only as
   that line, quoted above.
3. **R1's feedback is the builder's copy.** The Founder's R1 folder held
   none. The copy filed hashes, without its final newline, to the digest
   R1's record journaled (`8dbd7aad…e06f`), so it is the text the
   control plane received.
4. **The exports were read after the rehearsals.** All 16 were read on
   2026-11-13 between 04:43:59Z and 04:44:02Z, with the control plane's
   API token on the Founder's MacBook, from the control plane at
   `adde0a9`. Each holds exactly its record's events, so nothing was
   added to any room after its run.
5. **The R8 correction**, above.
6. **Four windows closed late or by the builder's backstop.** D5 gives
   the removal to the Founder as soon as the runner exits, and
   Amendment 1 B5 keeps that the first course.
   - R6 closed at 12:07:41Z, 47.6 min after the PC's apt-daily-upgrade at
     11:20:05Z, before which it was to close. Amendment 1 A3 records
     this; the builder recorded the breach at 11:21:51Z.
   - The builder closed R7's continuation, R9 and R10 under Amendment 1
     B1, about 2 h, about 7 min and 2 h 20 min after B1(a) first allowed
     it. R10's closed 16 min 34 s before the PC's apt-daily-upgrade at
     11:22:43Z; the builder's write had waited on an in-session approval
     that went unanswered twice.
   - For R7's continuation, the builder also wrote without first saying
     so in the session, and on a staged-changes read from 07:50Z rather
     than a fresh one, both contrary to B2.
7. **Masking.** In both extracts, user names, the PC's host name, email
   addresses, IP addresses, tailnet names and node keys are masked. The
   raw files hold none of these. No token is in any file. The account
   name: not masked. It appears in the act itself, filed verbatim on `main` by
   pull request 155, in four raw files here (R1's round 1 plan, R2's round
   1 plan, R1's feedback and R1's export), where masking would break the
   hashes their records pin, and in both extracts. The builder asked the
   Founder, and he answered at 2026-11-13T11:42:33Z: "Unmask the account
   name in all of filing B (my recommendation)." That reverses F2's
   account-name mask for this filing only, as his ruling of
   2026-11-13T02:56:04Z did for counted set 3.
8. **Transport.** Remote Control's folder share, the Founder's first
   choice, was not available to this session. The Founder instead pushed
   the files from his MacBook to the branch
   `founder/evidence-filing-b-20261113`, in commits
   `37cc3c305154dbfed536d802b2a37fa1de13519b` and
   `ae157305533704f38df5194f90ae7d8cb89b022e`, after a scan for names,
   addresses and tokens. Each commit carries hash lists computed on his
   machines (`MAC-SHA256.txt`, `MAC-SHA256-2.txt`, `PC-SHA256.txt`). That
   branch is transport only and is not merged.
9. **Plan pastes in the readings.** The 14 plans the Founder pasted
   that parse as they stand each hash to a filed plan, and each is
   replaced by that file's name. The 13 that do not parse as they stand,
   since he pasted several plans in parts, are kept as given.
10. **Three runs ended on a decision timeout**: R6's and R10's
    Phase4-CR1, and R7's Phase4-CR2. In each the plan was delivered and
    no decision came within its round's four hours, so that plan is
    filed with no decision.

## Not filed here

- The evidence of counted sets 1 and 2, the two rehearsals before the
  standing act and the bearer rehearsal: their own receipts, in this
  same filing.
- The merge authorizations and deployment checks of the pull requests
  merged under these acts: their own receipt, in this same filing.
- The standing act itself, filed on `main` by pull request 155.

## Not authorized by this record

Anything. Filing this evidence changes nothing it records, and nothing
here starts, revives or extends any act or rehearsal.

## Identity

| Step | Identity |
|---|---|
| Each line, signature and amendment | the Founder, in the builder's session |
| Runs, exports and the copies on his machines | the Founder, on his MacBook and his PC, with commands the builder gave |
| Transport | the Founder's pushed branch (finding 8) |
| Checks, extracts and this record | the builder session |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction ("draft the R1–R11 filing", "1",
"everything owed", and "File filing B, all three parts" at 2026-11-13T12:39:54Z, his authorization of this filing).
Merge is a separate exact-SHA Founder act under DEC-20260718-04; this
receipt asserts none.
