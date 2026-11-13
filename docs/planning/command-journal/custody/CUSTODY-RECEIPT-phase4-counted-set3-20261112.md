# CUSTODY RECEIPT — Phase 4 counted set 3: three consecutive passes (2026-11-12 to 2026-11-13)

**This receipt records the landing of one Founder act,
`FOUNDER-ACT-20261112-BR-PHASE4-COUNTED-RUNS`, the five rulings he gave
under it, the readings and outputs he gave, the builder's reads, checks
and audit record, and the evidence F1 names: the run records, the
attempts log, the room exports and the Planner's executor records. It
records thirteen findings and authorizes nothing.** The act's own text
governs. The filing is ordered by F3 of the act and C1 of
`FOUNDER-RULING-20261015-BUILD-ROOM-TO-DONE` (one custody filing per
act, after the act completes). It closes nothing: closing Phase 4 and
certifying item 13 are the Founder's separate stop-gate ruling (Part G).
The merge of this record needs the Founder's separate SHA-named
authorization.

**Masked, under F3:** user names as `<user>` and the PC's host name as
`<pc-host>`. No address, tailnet name, node key or token appears in any
file filed here. The Planner's service account name is not masked: the
Founder first ruled it masked, then reversed that ruling once the
builder reported that the name is already public in this repository
(finding 9). The act is filed exactly as signed.

## The instrument

The text the builder delivered in session, byte for byte, signed in
session.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACT-20261112-BR-PHASE4-COUNTED-RUNS.txt` |
| Git blob id | `5a6c0397dbed2b8437c8cd94921b1b60c9185f2d` |
| SHA-256 | `1a1827903f58ccccd319a5a2bf46d23b5bef9dfc48909c84bf8616e7182335c9` |
| Bytes | 26390 |
| Lines | 151 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261112-BR-PHASE4-COUNTED-RUNS`, the counted-run act for a third set; signed at 2026-11-12T17:53:54Z, naming its hash by its first and last characters |

**The signature, verbatim**, given in session:

> I sign FOUNDER-ACT-20261112-BR-PHASE4-COUNTED-RUNS (1a182790…35c9) as delivered

## The rulings

### On Phase4-CR1's start (2026-11-12T19:14:05Z)

Given in session as the Founder's choice between two options the
builder put to him at 19:12:11Z (finding 1). The question, opening line:

> CR1 started outside the act. D5 requires both of our readings within
> 15 minutes before a run. Mine were from 18:17Z, and I have none of
> yours, yet the run started at 19:07:22Z. The act says what happens when
> a reading fails, not when one is missing, so whether this run stands is
> your ruling.

The options:

> 1. Let CR1 stand, with the deviation on record (my recommendation).
> My logs stand in for my readings. Your PC readings close the rest.
> [...] The deviation goes into the F3 filing as your ruling.
>
> 2. Stop CR1 now (Ctrl-C). That ends the run interrupted and spends the
> set.

The answer: "1". (Rewrapped for this file; the builder's full message
is in the session transcript, and the Founder's answer and his PC
readings of 19:14:48Z are in the readings file below.)

### On this filing (2026-11-13T01:32:39Z)

The builder put three decisions to the Founder at 00:40:26Z, with the
first draft of this record. Verbatim, rewrapped:

> 1. **The journal rows.** Do the rows inside each run record count as
> F1's "journal rows from the control plane's routes" (finding 4)? I
> recommend yes; the alternative needs an act to re-set the value.
> 2. **The service account name.** I left the PC's `buildroom-planner`
> unmasked, as earlier filings did. F3's "account name" could be read
> to cover it. Say if you want it masked.
> 3. **Scope.** Should the filings owed since 2026-11-02 (the R8
> correction, R1–R11) share this PR? I recommend a separate PR. That
> evidence isn't all in this session, and it would hold set 3 up.

The answers, verbatim:

> 1. Yes
> 2. account name
> 3. a separate PR

So: the journal rows inside the run records stand for F1's journal rows
(finding 4); the Planner's service account name is an account name under
F3, to be masked; and the filings owed since 2026-11-02 go in a
separate pull request. The second was reversed at 02:56:04Z, below.

### Reversing the masking (2026-11-13T02:56:04Z)

The builder drafted this record with the account name masked, then
reported that the name is already public in this repository and that
masking it cost the filed act its match to the signature (finding 9),
and put two options at 02:41:47Z. Verbatim:

> 1. **Keep the act masked**, as drafted.
> 2. **Unmask the account name** in the act, readings and audit (my
> recommendation). I'd regenerate and re-run every check, and finding
> 9 would record your reversal.

The answer, verbatim, quoting option 2 by its text (rewrapped):

> Unmask the account name in the act, readings and audit (my
> recommendation). I’d regenerate and re-run every check, and finding
> 9 would record your reversal.

So the account name is filed as it stands, in the act, the readings and
the audit record, and the act is filed as signed.

## The evidence

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-terms-20261112.json` |
| Git blob id | `00fa68463abe588bcfc88c1e047503476a242943` |
| SHA-256 | `5a031647b2a96849080795ce3c1d72eed3202d8b5e33ca4a956ccbdcb47231d2` |
| Bytes | 1927 |
| Lines | 58 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the set's terms file (C3, D4), byte for byte as the runner read it through `PHASE4_TERMS_FILE`; its SHA-256 is the one every runner start pinned through `PHASE4_TERMS_SHA256` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-EVIDENCE-founder-readings-20261112.txt` |
| Git blob id | `cd932eca4b20dcfea6c8320a86421f9eeb3d057e` |
| SHA-256 | `5e0e42bdd8549d1a3fdc6c11cbb751a2a237e48ee1c92997940b8f3ee22c8a65` |
| Bytes | 34502 |
| Lines | 575 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's fifty-one messages as he gave them in session, from "draft the counted run act" to "file it": D4 on the MacBook, the PC readings of D5 for each run, the runner's lines, each decision's answer, the E7 report, F1's reads, his rulings on this filing and the files he pasted for it. User and host names masked; each pasted plan replaced by the name of the filed plan file its hash recomputes to; each pasted file replaced by the name and SHA-256 of the filed file it equals byte for byte; the R11 approval that opened one paste left for R11's filing (finding 7) |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-EVIDENCE-builder-audit-20261112.txt` |
| Git blob id | `ea2036b7cadbf279a7c059305ade252561dc777a` |
| SHA-256 | `c33c4582f5c87c144421486f48885ef1600a6f7dcc2798ce55ef22a55c6c7f28` |
| Bytes | 56148 |
| Lines | 629 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's audit record under F2, verbatim from the entry that opens this act through this filing's transfers and rulings, masked as above: each line of the Founder's, each reading, check, notification and result, stamped from the clock; it holds the readings of D3, D5 and E7, the `/health` and `/version` polls, and each transfer's check (finding 12) |

### The plans, as the runner saved them

Each file is byte-identical to the file the runner wrote in the
Founder's evidence directory: its SHA-256 and size equal those he read
there at 2026-11-13T00:31Z, and its plan hash, recomputed by
`packages/journal/src/index.ts`'s `planHash` at `6b80c22`, equals the
hash in its name and in the runner's `PLAN` line.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-plan-c421cf1e857b92b8e16a8df958886e041cd26ee87f60f76cb800437ad51968f3.json` |
| Git blob id | `52133d2d82e93eaf9821b6c5b1204fb84ca913d3` |
| SHA-256 | `129b722b54967475a01ec203603cb947dffeeada9ca76be78766c4b1696c68be` |
| Bytes | 28440 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1 round 1, command `cmd_planner_4d8dafcc80c49df73e1be3e5e99360e1`; revision requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-plan-c4ff00adfc73ffb01311478f2d3d06b8d41a1319fe164c0b7ace7c664a9eb493.json` |
| Git blob id | `51bd53e91b5b58798edcf917d57f8c607684dc9a` |
| SHA-256 | `0d0e90d60d0c32c4efa62c435fecd5415ef38cbd80f16eeee33155852621eab3` |
| Bytes | 29329 |
| Lines | 66 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1 round 2, command `cmd_planner_828393372669582053adfdbe43c02d20`; approved |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-plan-00eee4cdae20823aab046fcf016c9ea116951d075dd845757311dee526366bcc.json` |
| Git blob id | `3ff5c5f6561042ffc1770fca150aa91f244661d1` |
| SHA-256 | `f876a7cf45342f09d22f02edca067e36fb8ac5a92690c3beac2d2f7bba2baaf2` |
| Bytes | 29297 |
| Lines | 69 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR2 round 1, command `cmd_planner_7fff6b3bd5a83e0c7d0452553f7c8ad0`; revision requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-plan-7b17f532a3e381e1210b89ca614e530dee0834ef620ee36e704b53096a5fa1fd.json` |
| Git blob id | `a8ace222170f0a6645888a213afd5939795461a0` |
| SHA-256 | `4b191eb5b7d8af92f1e8233d7d9fd70ce15e5ed9cc9149a461ed30252c6bea4a` |
| Bytes | 29706 |
| Lines | 69 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR2 round 2, command `cmd_planner_6d626bf5465a5855c27d8997504cfe97`; revision requested (finding 2) |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-plan-a7e0dcdbb11e80537c28a77c7813622d157a5a4058eab82ba93b51537c79c01d.json` |
| Git blob id | `d93aa4420f16fb6dd462bd1c5d2af65014e73e5d` |
| SHA-256 | `24db6de6d6611b7804e835b2610992576434a4e8d9b19572d01646b91079098d` |
| Bytes | 30199 |
| Lines | 69 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR2 round 3, command `cmd_planner_ee2f100355f72c28b6c3212591dc089b`; approved |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-plan-b45e69830d9073c51b4880f3af20782aca7028935273fe1edd50962ba98a8176.json` |
| Git blob id | `db93cb7546e3af4e3317026fceb8436966a24409` |
| SHA-256 | `8c1fb91f060d18eb14840dcc2b46f74e4b9e383b93fe6a1f4520616f35864659` |
| Bytes | 37578 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR3 round 1, command `cmd_planner_4cab80d3befa573a14da8c43f7e51e5a`; revision requested |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-plan-427217b4c338b838d6b9649fa4211b42babff3c69e2cdc27806e3288b9ced0d0.json` |
| Git blob id | `e2939033ac5c58077f875e3fc99ac4a5b0ae82a5` |
| SHA-256 | `1d5318803dfa6141f75c3984d28dac3c4eb59751bccd4bfc6b8cf8ae003b2401` |
| Bytes | 40291 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR3 round 2, command `cmd_planner_3232ea81e79e24d0b0cabde7cfc3f796`; approved (finding 3) |

### The builder's checks (E3)

Each revision's feedback, byte for byte as the Founder's decision
command read it: the command checked each file's SHA-256 before sending
it, and the control plane journaled it in the decision. The journaled
`founder_feedback` digest of each is the SHA-256 of the file without its
final newline, which the decision command strips, so each filed file is
the text the control plane journaled. Each approval had no feedback; the
builder's check of every plan, statement by statement, is in the audit
record.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-feedback-CR1-round1.txt` |
| Git blob id | `f6794dabfa1c585331288fe9705a9c4cee6094bd` |
| SHA-256 | `be0945d477f095b0d284b165c9f0389867248b557d6c99b96235fe948e9929b9` |
| Bytes | 3341 |
| Lines | 14 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the revision of Phase4-CR1's round-1 plan `c421cf1e…`: eleven false statements |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-feedback-CR2-round1.txt` |
| Git blob id | `e6d005c0f5440ca0acfce0d8841d690882474dbc` |
| SHA-256 | `91c05e93e1fee07d0fcd288b5a4bb691c71f08efd10cc9378ca85fa3efb5b96e` |
| Bytes | 1878 |
| Lines | 8 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the revision of Phase4-CR2's round-1 plan `00eee4cd…`: five false statements |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-feedback-CR2-round2.txt` |
| Git blob id | `21767d52ab8559c13aed238d9578d5cd20af1e5f` |
| SHA-256 | `c1853f92dc9e35dad59ddc4e8831ce54f5c9b4befa36e95ce82a312a9ef4c703` |
| Bytes | 1165 |
| Lines | 4 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the revision of Phase4-CR2's round-2 plan `7b17f532…`: one false statement, present since round 1 (finding 2) |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-feedback-CR3-round1.txt` |
| Git blob id | `e2fb62abe86cbd043d9bb51236b1d4391edfeb78` |
| SHA-256 | `f86222b26016e8eccb2121804941d6054e87007335ef5520debc28da9f515faf` |
| Bytes | 3201 |
| Lines | 11 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the revision of Phase4-CR3's round-1 plan `b45e6983…`: eight false statements |

### The run records and the attempts log

From the Founder's MacBook (`~/phase4-set3/evidence`), as the runner
wrote them. Each was pasted in session and checked by the builder
against the SHA-256 and size the Founder read there at 00:31Z before it
was filed (finding 12). Each run record's digest, recomputed by the
runner's own `phase4RecordDigest` at `6b80c22` over the record's
canonical JSON, equals the digest in the runner's line, in its
`.record.sha256` file and in `attempts.json`. The journal rows each run
was judged on are the record's `commands` and `decisions`, read by the
runner through the counted-run journal route at the run's close and
covered by that digest (finding 4).

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-attempts.json` |
| Git blob id | `b272b6f94e7589a4c6ff08f5055daea2b5ed7273` |
| SHA-256 | `0371fdf82344ba68272ae1d8eeb27811f8d699f7a6511e6bb3d8d8d41900631d` |
| Bytes | 1589 |
| Lines | 46 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's attempts log for the set: the three attempts in order, each `passed`, with no entry failures or failures, each with its start, end and record digest; CR1's live check names command `cmd_planner_4d8dafcc…`, model `gemini-4-argon-high` and conversation `cd90200b…` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-Phase4-CR1-e006e499-58a4-4392-a624-e6170a393e36.record.json` |
| Git blob id | `47c1935cd531e667b70dbe82249376aa2f40361f` |
| SHA-256 | `158f492bd4453fcd770020feb053e60dd44824d65a84a8bc214a2cc7b50f8878` |
| Bytes | 11233 |
| Lines | 293 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1's run record as the runner wrote it (`JSON.stringify(record, null, 2)` and a newline): room `e006e499…`, two rounds, six events, two commands, two decisions, final state `BUILDING`, `journalVerified` true; `phase4RecordDigest` over its canonical JSON is `83757a5c…c09c` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-Phase4-CR1-e006e499-58a4-4392-a624-e6170a393e36.record.sha256` |
| Git blob id | `14d2a63bdb732fc859aa593a17b5446971c81218` |
| SHA-256 | `421c1e34248c5d92b1a0bbccd9b87ec6be009881aade6d296181d4e0bbcb0e06` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR1: `83757a5c…c09c`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-Phase4-CR2-9bdb8cd9-8937-4058-9365-d27439e6142d.record.json` |
| Git blob id | `966afcde0b9834e6a6605ca3ba394ab7ab4885a2` |
| SHA-256 | `eeb2555e97e80900be59ec1e68356251b155f5eb83a2f9fce969b312ccb58fa9` |
| Bytes | 16112 |
| Lines | 416 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR2's run record as the runner wrote it: room `9bdb8cd9…`, three rounds, eight events, three commands, three decisions, final state `BUILDING`, `journalVerified` true; `phase4RecordDigest` `3ae583b1…7d81` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-Phase4-CR2-9bdb8cd9-8937-4058-9365-d27439e6142d.record.sha256` |
| Git blob id | `da87f7012e6f6417e74f6f3d0feb6dc8f9b1af79` |
| SHA-256 | `8305e666eaabe0d884c0721c30ae539138e951da566b4a0d0fd6d3f0e8903971` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR2: `3ae583b1…7d81`, two spaces, the record's name and "(canonical JSON)" |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-Phase4-CR3-eb4ccc7a-e014-48a8-a019-986f8fe7babe.record.json` |
| Git blob id | `0c2448d7104bf0f75681cab6b7a9a64c4a32a544` |
| SHA-256 | `b9d786abe7dca42e75dc69838c9c3572a7c3762b1e9b1ba10d92e6919eda29cf` |
| Bytes | 11233 |
| Lines | 293 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR3's run record as the runner wrote it: room `eb4ccc7a…`, two rounds, six events, two commands, two decisions, final state `BUILDING`, `journalVerified` true; `phase4RecordDigest` `e1517700…98c2` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-Phase4-CR3-eb4ccc7a-e014-48a8-a019-986f8fe7babe.record.sha256` |
| Git blob id | `83e2eddff456654a18b0fc6f29c8f0628f5f4cf9` |
| SHA-256 | `4bc3508f21f85627c0ee79f1b43146304388b836eb799b434ab103076217129f` |
| Bytes | 138 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the runner's digest file for Phase4-CR3: `e1517700…98c2`, two spaces, the record's name and "(canonical JSON)" |

### The room exports

Read on the MacBook by F1's command with the API token at
2026-11-13T00:28Z, after E7. The control plane sends each export as one
line of JSON with no trailing newline, and each is filed that way.
Each was pasted in session and checked against the SHA-256 and size the
Founder read at 00:31Z before it was filed. Each export's events are the
room's committed journal events, as many as its `logLength`; the
Founder's feedback in each revision's payload hashes to the digest the
control plane journaled for it, and to the filed feedback file without
its final newline.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-export-e006e499-58a4-4392-a624-e6170a393e36.json` |
| Git blob id | `74aac0b48eb9f487d0a8d88656a0e9815986531a` |
| SHA-256 | `5b09dcdcffd66d33fed9080b0199ef8852c046478bc4641f82b5c0f88d244d0d` |
| Bytes | 13251 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `e006e499…` (Phase4-CR1) as `GET /rooms/:id/export` gave it at 2026-11-13T00:28:27.365Z: snapshot `BUILDING`, `logLength` 6, six events, no rejections; the round-1 revision's feedback in its T4 payload hashes to the journaled `founder_feedback` digest `d8d29adf…` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-export-9bdb8cd9-8937-4058-9365-d27439e6142d.json` |
| Git blob id | `7f994cb3656790241588cbe3778606515b3b260b` |
| SHA-256 | `226484092fd85c2d243c192ded3a142ecb24ce51935fda73f0fc2b1bf43f780f` |
| Bytes | 16550 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `9bdb8cd9…` (Phase4-CR2) as exported at 00:28:27.652Z: snapshot `BUILDING`, `logLength` 8, eight events, no rejections; the two revisions' feedback hashes to the journaled digests `5e37eec0…` and `3c4fd57c…` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-export-eb4ccc7a-e014-48a8-a019-986f8fe7babe.json` |
| Git blob id | `2f4a110fe35bb2ea63b4b326fa119f786d9153a3` |
| SHA-256 | `6e3ca1b1c5905c9a7bef29548cb2e0f1d6041ee3a2150a60ff29ceb3a001fec6` |
| Bytes | 13471 |
| Lines | 0 (`wc -l`) |
| Trailing newline | absent; no CR bytes |
| What it is | room `eb4ccc7a…` (Phase4-CR3) as exported at 00:28:28.008Z: snapshot `BUILDING`, `logLength` 6, six events, no rejections; the revision's feedback hashes to the journaled digest `9b1c2062…` (finding 12) |

### The Planner's executor records

From the PC, in the Gateway's `planner-evidence` directory, as the
executor wrote them: one record per command, named by the SHA-256 of its
`commandId`, filed here under that name with the run and round put in
front. The Founder printed each with its name, SHA-256, size and last
byte at 2026-11-13T02:31Z; the builder rebuilt each from the printed
fields and filed it only when its SHA-256 and size equalled both that
print and his listing of 00:29Z (finding 12). Every record reports model
`gemini-4-argon-high`, the agy binary `4341b80b…94ed4` the act pins,
`sent` true, outcome `plan`, `resultStatus` SUCCESS and the checkout
removed. Each record's `executionId`, `conversationId` and `initModel`
appear in the run record of the same run, so the PC's evidence and the
control plane's journal agree on all seven commands.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-planner-evidence-CR1-round1-09413b802221ca14b1d826813ca052261b55707188682b53da7671ccb919827a.json` |
| Git blob id | `b11d02c276bf262709fb3582b382a8e4beae3f9c` |
| SHA-256 | `7804053da3102c965e1fab0306d41dabe7db51644024e92bf62d589d374ca41d` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1 round 1, command `cmd_planner_4d8dafcc80c49df73e1be3e5e99360e1`: 19:07:25.035Z to 19:14:10.711Z, exit 0, response 28144 bytes |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-planner-evidence-CR1-round2-ea50a07b38290fbe33cf307613f5d4c26231c4d92068f1a06e089c56c330ff33.json` |
| Git blob id | `60e2e19caad286500eff90950a7182ad4156218c` |
| SHA-256 | `ef7cd0ec24c2b6f5b4801181dede65d4521bea31410b773db80812129e836d30` |
| Bytes | 1418 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR1 round 2, command `cmd_planner_828393372669582053adfdbe43c02d20`: 21:14:48.519Z to 21:18:01.616Z, ended by SIGKILL (finding 13), response 29038 bytes |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-planner-evidence-CR2-round1-e04fa13233a6fcea27ecc1148c2b84d586aad04daadefe2d51d3e44a3b7f2300.json` |
| Git blob id | `f96d08b849086a727e9b8defe22d046a3172db7d` |
| SHA-256 | `2d6ca9cd3b480edf9429a1173e8146c653daf2414ea20894dad03093be016919` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR2 round 1, command `cmd_planner_7fff6b3bd5a83e0c7d0452553f7c8ad0`: 21:51:09.548Z to 21:59:41.776Z, exit 0, response 28985 bytes |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-planner-evidence-CR2-round2-b312bd54d65c9e966c961db9e50f329577436c3dff09e44dd746305fcfe90832.json` |
| Git blob id | `f320914d643e8f7c034340b8d7105da3ee711ead` |
| SHA-256 | `7a4ea79b233b20a7a824396b5771b37a0f41ac25c4b9063d743ce3aa06005f7f` |
| Bytes | 1418 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR2 round 2, command `cmd_planner_6d626bf5465a5855c27d8997504cfe97`: 22:20:10.193Z to 22:22:31.946Z, ended by SIGKILL (finding 13), response 29394 bytes |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-planner-evidence-CR2-round3-2a70b246538609b28a8ba461d6df7cad9543d98ea41da9669afe0875d50a3bae.json` |
| Git blob id | `34ff989b9abc37b24fefa495b5c4943e5707cce2` |
| SHA-256 | `53a45f5e3d196d14b2d4439e4fe02fc78ba9b909a0b5234d4d1603327afa92b1` |
| Bytes | 1418 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR2 round 3, command `cmd_planner_ee2f100355f72c28b6c3212591dc089b`: 22:34:50.586Z to 22:36:57.369Z, ended by SIGKILL (finding 13), response 29887 bytes |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-planner-evidence-CR3-round1-a811c554aa429b02e51c444b664b4168bb31f967bd91f50928b3b32e5365e9ac.json` |
| Git blob id | `8077c5f04f5507ee85cbc02a835ec2dd00d9ccd0` |
| SHA-256 | `641fb27a4d0c06fc697d9933c8dbe1a6e1edd2756838965c994021cf1f79fec2` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR3 round 1, command `cmd_planner_4cab80d3befa573a14da8c43f7e51e5a`: 22:53:31.023Z to 23:03:00.600Z, exit 0, response 37282 bytes |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PHASE4-SET3-planner-evidence-CR3-round2-8bf0c410d9e1f77f70628ae5d1df047c26205dd855d79693bd3c1eac261bbecf.json` |
| Git blob id | `5897fc41ccf83f057b788aede0bc90e559a9e627` |
| SHA-256 | `6614b602f336a4cf77883afcbc5cb48807de3302d64ec38277606dc18a3855d8` |
| Bytes | 1410 |
| Lines | 1 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | Phase4-CR3 round 2, command `cmd_planner_3232ea81e79e24d0b0cabde7cfc3f796`: 23:18:21.604Z to 23:22:07.313Z, exit 0, response 39995 bytes |

## The runs

| Run | Room | Rounds and decisions | Passed at | Record digest |
|---|---|---|---|---|
| Phase4-CR1 | `e006e499-58a4-4392-a624-e6170a393e36` | `c421cf1e…` revision; `c4ff00ad…` approved | 2026-11-12T21:44:21.116Z | `83757a5c…c09c` |
| Phase4-CR2 | `9bdb8cd9-8937-4058-9365-d27439e6142d` | `00eee4cd…` revision; `7b17f532…` revision; `a7e0dcdb…` approved | 22:50:39.848Z | `3ae583b1…7d81` |
| Phase4-CR3 | `eb4ccc7a-e014-48a8-a019-986f8fe7babe` | `b45e6983…` revision; `427217b4…` approved | 23:51:39.630Z | `e1517700…98c2` |

Each record shows the room in `BUILDING` and its journal verified from
genesis. The runner's last line: "The set is complete: three
consecutive passes."

## What happened, in order

All times are UTC.

| Time | Event | Source |
|---|---|---|
| 2026-11-12 16:35:32Z | "draft the counted run act" | the Founder, in session |
| 17:53:54Z | the act signed | the Founder, in session |
| 18:08:34Z | D4 on the MacBook (checkout at `6b80c22`, terms `5a031647…`, FounderOS clean at `973717d`) and the PC's readings | the Founder, in session |
| 18:12:13.849Z | D3: deployment `568e87dd` created with `PHASE4_COUNTED_RUN`; started 18:15:36.667Z; leadership generation 157 at 18:16:16.810Z | Railway |
| 18:17:15Z | the builder's D5 readings, good to 18:32:15Z | the builder |
| 19:07:22.919Z | Phase4-CR1 entered, without readings within D5's fifteen minutes (finding 1) | the runner (`attempts.json`) |
| 19:12:11Z, 19:14:05Z | the question; the ruling "1" | the builder; the Founder, in session |
| 19:14:15.544Z | CR1 round 1 settled, plan `c421cf1e…` | the runner |
| 19:14:48Z | the PC's readings | the Founder, in session |
| 21:14:41.971Z | CR1 round 1: revision | Railway HTTP log |
| about 21:18:12Z | CR1 round 2 settled, plan `c4ff00ad…` | the runner |
| 21:44:19.137Z, 21:44:21.116Z | CR1 approved; CR1 passed | Railway HTTP log; the runner |
| about 21:48Z, 21:49Z | the PC's readings; the builder's readings and "go" | the Founder; the builder |
| 21:51:00.595Z | Phase4-CR2 entered | the runner (`attempts.json`) |
| 22:00:00.740Z, 22:20:05.749Z | CR2 round 1 settled, `00eee4cd…`; revision | the runner; Railway |
| 22:22:39.246Z, 22:34:35.592Z | CR2 round 2 settled, `7b17f532…`; revision (finding 2) | the runner; Railway |
| 22:37:00.853Z, 22:50:36.556Z | CR2 round 3 settled, `a7e0dcdb…`; approved | the runner; Railway |
| 22:50:39.848Z | CR2 passed | the runner |
| about 22:52Z, 22:52:23Z | the PC's readings; the builder's readings and "go" | the Founder; the builder |
| 22:53:23.817Z | Phase4-CR3 entered | the runner (`attempts.json`) |
| 23:03:12.637Z, 23:18:04.448Z | CR3 round 1 settled, `b45e6983…`; revision | the runner; Railway |
| 23:22:15.360Z, 23:51:34.859Z | CR3 round 2 settled, `427217b4…`; approved (finding 3) | the runner; Railway |
| 23:51:39.630Z | CR3 passed; the set complete | the runner |
| 2026-11-13 00:00:23.551Z | E7: deployment `20960723` created without `PHASE4_COUNTED_RUN` | Railway |
| 00:03:37.639Z, 00:03:41.680Z | `20960723` SUCCESS on `6b80c22`, started 00:03:34.191Z; `568e87dd` removed | Railway |
| 00:04:14.290Z, 00:04:51Z | leadership generation 158; the Gateway's new session | Railway |
| 00:28Z to 00:31Z | F1: the room exports (00:28Z), the PC's executor records listed (00:29Z), the run records and plans read (00:31Z) | the Founder, in session |
| 00:32:06Z | "draft the F3 filing" | the Founder, in session |
| 00:40:26Z | the first draft of this record, and three decisions put to the Founder | the builder |
| 01:29:22Z to 02:31:42Z | the attempts log, the digest files, the run records, the exports and the executor records pasted, each checked and filed (finding 12) | the Founder, in session; the builder |
| 01:32:39Z | the rulings on this filing | the Founder, in session |
| 02:41:47Z, 02:56:04Z | the masking put back to the Founder; his reversal | the builder; the Founder, in session |
| 02:59:42Z | "file it": the authorization F3 requires for this filing's pull request | the Founder, in session |

Every decision came within B5's four hours of its round settling, the
longest at 2 h 0 min 26 s (CR1 round 1).

## Findings

1. **Phase4-CR1 started without D5's readings.** The builder's
   readings were from 18:17:15Z, good to 18:32:15Z; the Founder's PC
   block had been run on the MacBook (its output is in the readings
   file, received 19:16:22Z); the run entered at 19:07:22.919Z. The act
   says what follows a failed reading, not a missing one, so the builder
   put it to the Founder, who ruled "1": CR1 stands, the builder's log
   reconstruction for 18:52Z to 19:07Z standing in for its readings,
   and his PC readings of 19:14:48Z closing the rest (`pgrep` exit 1,
   round 1 having settled at 19:14:15Z). The builder's own share: it
   gave a fifteen-minute expiry without tying the start to its word.
   From CR2 the order was the PC's readings, the builder's readings and
   "go", then the start, and both later runs entered within a minute or
   two of the "go".
2. **The builder missed a false statement in its CR2 round-1 check.**
   The round-1 plan named three pieces of automation that read the
   contract; the builder's feedback added a fourth, the stop-gate test,
   and implied the list was then complete. Two advisory review
   workflows also read it. The builder found the miss in round 2, said
   so, and asked for the correction, which spent CR2's last round;
   round 3 corrected it exactly.
3. **One judgment call in CR3 round 2, disclosed before the decision.**
   The plan says both 400 and 409 on `POST /gateway/enroll` are recorded
   in `gateway_enrollment_refusals`. Read in its bullet, which lists the
   validation 400s, it is true; read alone it misses a malformed-JSON
   400 from the body parser, which `buildroom enroll` cannot send. The
   builder recommended approval on that reading and said so; the
   Founder approved.
4. **The builder's F1 command read the journal with the wrong token;
   the Founder ruled the records' rows stand.** `GET
   /control-plane/rooms/:roomId/journal` is a counted-run route, open
   only to the counted-run token and inert once E7 removed the value;
   the command sent the API token and got 401 three times. A fresh read
   would need the value set again, which the act does not authorize.
   The journal rows each run was judged on are in its record
   (`commands`, `decisions`, `journalVerified`), read through that route
   by the runner at the run's close and covered by the record's digest.
   The Founder ruled at 01:32:39Z ("1. Yes") that those rows stand for
   F1's "journal rows from the control plane's routes".
5. **The MacBook changed networks during CR3.** The approval and the
   runner's closing reads came from a different network than its
   earlier polls, with the same client as every earlier decision; the
   runner's polls continued across the change. No effect on the record.
   Addresses are not filed.
6. **No re-ask in the set.** The three records hold seven commands, one
   per round, with no `retry-of/`, `plan-refusal/` or
   `planner-failure/` reference; the PC's seven executor records are
   the same seven commands, each with outcome `plan`, and CR1's live
   check in `attempts.json` names the conversation of its round-1
   executor record.
7. **One paste opened with R11's approval.** The paste received at
   18:08:34Z began with R11's approval command and answer; that part is
   left for R11's filing and marked in the readings file.
8. **A documentation defect found while checking CR3's plans.**
   `docs/gateway-ops-actions-log-runbook.md` line 23 says the control
   plane emits a structured log line named `founder_act`; no code at
   `6b80c22` emits one. Not corrected here.

9. **The Planner's service account name: ruled masked, then
   unmasked.** The Founder ruled it an account name under F3 (ruling 2),
   and the builder drafted this record with it masked in the act (twice,
   both in D5; the builder first reported once, a count of lines rather
   than occurrences, and corrected it in the audit record), the readings
   and the audit record. The builder then reported that masking it hides
   nothing: the same name appears 260 times in 13 files on `main` at
   `6b80c22` (the PC Planner act of 2026-10-30 and two of its amendments,
   that act's custody receipt and readings, and seven test files and one
   test fixture), and the Planner fetches this repository without a
   credential, which only a public repository allows (ruling B5 of that
   act), as every counted run did; while masking cost the filed act its
   match to the signature. The Founder reversed the masking at 02:56:04Z
   (the fifth ruling). The name is filed unmasked, as earlier filings
   carry it, and the act is filed as signed.

10. **The decisions came within B5.** CR1: 2 h 0 min 26 s and about
    26 min. CR2: 20 min 5 s, 11 min 56 s and 13 min 36 s. CR3:
    14 min 52 s and 29 min 19 s.
11. **E7 by the Founder, without the backstop.** The removal deployment
    was created 8 min 44 s after the set ended, inside E5(c)(1)'s
    thirty minutes; the builder verified it under E7 and set nothing.
12. **The Founder's files came by paste; one copy failed its check
    before filing.** Seventeen files reached the builder this way, and
    each was filed only once its SHA-256 and size equalled the
    Founder's listing. The builder's first copy of the CR3 room export
    skipped 710 bytes of its sixth event while transcribing; it did not
    parse or match, the paste itself was complete, and the builder
    restored the span from the paste, after which it matched. The seven
    executor records were rebuilt from their printed fields rather than
    copied, and each matched. One PC read, at 02:30:17Z, ran first on
    the MacBook and its screen was then pasted into the PC; every
    command that ran was a read or failed, nothing changed on either
    machine, and the read was repeated, guarded to run only on Linux.
    The readings file shows every paste, and each pasted file in it
    equals its filed copy byte for byte.
13. **Three Planner runs ended by SIGKILL after delivering their
    plans.** CR1 round 2 and CR2 rounds 2 and 3: `exitCode` null,
    `signal` SIGKILL, outcome `plan`, `resultStatus` SUCCESS, checkout
    removed. At `6b80c22` the executor, once a plan is in, ends agy
    through sudo with SIGTERM and SIGKILLs sudo if it has not exited
    four seconds later (`STOP_GRACE_MS`, in `endRun` and `stopNow` of
    `packages/gateway-daemon/src/agy-planner-executor.ts`); an exit seen
    in time does not halt the executor, and none of these halted it. So
    these are the executor's own escalation, not a failure, and they
    touch no plan. Why agy outlived SIGTERM on those three rounds is not
    in the evidence.

## Follow-ups, not decided here

- Closing Phase 4 and certifying item 13, the Founder's stop-gate
  ruling under Part G.
- The filings owed since 2026-11-02, the R8 correction and R1 to R11's
  evidence, in a separate pull request (ruling 3).
- The runbook's line 23 (finding 8).
- Build Room pull request 151, open and untouched by this act.

## Not authorized by this record

Anything. In particular: building any of the three approved plans,
dispatching a builder or a reviewer, any change to a target repository,
another counted run, any Railway variable or setting, any deploy,
redeploy or rollback, and any change on the PC or the MacBook.

## Identity

| Step | Identity |
|---|---|
| The act's signature, the rulings, the readings, the decisions, D3, E7 and F1's reads | the Founder (in session) |
| The act's draft, the plan checks and the feedback, the GitHub, Railway, `/health` and `/version` reads, the masking, the checks of every received file, this record | the builder session, under the act and the Founder's direction in session |
| Transport | the act from the builder's signed copy; the terms, plans and feedback from the builder's copies, each matching the Founder's hash; the run records, attempts log, digest files and exports as the Founder pasted them, and the executor records rebuilt from his print, each matching his hash; readings from the session transcript, masked by the builder; the exports end without a newline, as the control plane sent them, and every other file with a single LF; pins above computed by the builder |
| Founder-side hash | the signature names the act's hash by its first and last characters; the decision commands checked each feedback file's SHA-256 before sending it; the Founder read every F1 file's SHA-256 and size on his machines |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: F3 of
`FOUNDER-ACT-20261112-BR-PHASE4-COUNTED-RUNS` and C1 of
`FOUNDER-RULING-20261015-BUILD-ROOM-TO-DONE`. Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
