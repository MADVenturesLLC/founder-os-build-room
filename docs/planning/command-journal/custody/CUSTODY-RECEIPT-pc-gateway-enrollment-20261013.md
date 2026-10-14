# CUSTODY RECEIPT — the Ubuntu PC enrolled as the second Build Room Gateway (2026-10-13)

**This receipt records the landing of two Founder instruments and the
evidence for the enrollment they govern: his act enrolling the Ubuntu
PC as the second Gateway, and his ruling on the late B6 reading of that
enrollment. It files the B3 to B6 output he delivered and the
read-only registry query, pins the query's result without filing it,
records the builder's reads and seven findings, and authorizes
nothing.** Each instrument's own text governs.
The filing is ordered by C1 of the act, which says each pull request
needs the Founder's separate SHA-named merge authorization.

## The instruments

Each file is the comment's body as the GitHub API returns it, with CR
bytes removed, plus one final LF; the comments carried no final
newline. Neither was edited after posting. Each is byte-identical,
after that normalization, to the builder's draft.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-pc-gateway-enrollment-20261013.txt` |
| Git blob id | `7d57298423e6c5b547dd6b96083bb71b1d5bdbd8` |
| SHA-256 | `fb23b5264f38a31ce9d32ea77bd2d48c6ff276efecbfa4535550d9a439c407d8` |
| Bytes | 5389 |
| Lines | 29 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261013-BR-PC-GATEWAY-ENROLLMENT`, comment 6143424572 on PR #113, posted 2026-10-13T10:21:24Z from `decivantiq` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-pc-gateway-enrollment-b6-20261013.txt` |
| Git blob id | `9e96c4b24f4eb019011c559cbd05de4d90396e88` |
| SHA-256 | `860682d720f5294dd834b46192f4d145ca5d0318762ab3dc2166924b671afb0e` |
| Bytes | 1937 |
| Lines | 15 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-RULING-20261013-BR-PC-ENROLLMENT-B6`, comment 6155286746 on PR #113, posted 2026-10-13T21:11:52Z from `decivantiq`: the readings of 11:33Z accepted as meeting B6, the B7 departure closed, the enrollment standing (finding 2) |

## The evidence

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PC-GATEWAY-EVIDENCE-b3-b6-delivery-masked-20261013.txt` |
| Git blob id | `ab0665622d7288569656662c79c80bbd4bc589df` |
| SHA-256 | `597d101b4501f9efce5e0a4d5028714ee7e46403a7c0bb165881c0d9e0cfe645` |
| Bytes | 10498 |
| Lines | 230 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the commands the builder gave for B3, B4 and B5 and B6 and their output on the PC, as the Founder delivered them in this session, with each 64-hex key fingerprint and key id cut to its first 8 hex characters and `…` (finding 4). Every other byte is as delivered |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/PC-GATEWAY-EVIDENCE-registry-read-query-20261013.sql` |
| Git blob id | `190fcf4e4be13171c9bb7f48737756a4b2a9e7b2` |
| SHA-256 | `b126657103acd5c0190ca4b0807c4f0af3fa5d3fa6b2970531e63692578006ac` |
| Bytes | 847 |
| Lines | 6 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the read-only query of B6, written by the builder: it opens `BEGIN TRANSACTION READ ONLY` and ends `ROLLBACK`, and reads the registry events of pairing `c0a96b06` and Gateway `1880c12d` and the currently enrolled Gateways, ids cut to 8 characters except the event ids |

The result of that query, as the Founder delivered it from the Neon
SQL editor, is pinned here and not filed (finding 7): 475 bytes, 5
lines, single final LF, no CR bytes, SHA-256
`95f5f7526a1145bd5f09b26c1dc6078e3a818a48b44fe0e5e326327a70594800`.
It reads, at database clock 2026-10-13 12:43:48Z under role
`neondb_owner`: event 15 `minted`, id
`af824593-96c8-48a7-b26f-3288e5c0e613`, pairing `c0a96b06`, at
10:39:15.074Z; event 16 `key_received`, id
`24dde971-a905-451c-954c-904ef31fcc10`, Gateway `1880c12d`, pairing
`c0a96b06`, at 10:39:16.833Z; event 17 `enrolled`, id
`b3a530b8-a100-441b-9fac-9cda4b7f2f94`, Gateway `1880c12d`, at
10:47:58.159Z; and enrolled now `2222132d` in slot 1 and `1880c12d` in
slot 2.

## What happened, in order

All times are UTC, on 2026-10-13 unless marked.

| Time | Event | Source |
|---|---|---|
| 10:21:24Z | the act posted | GitHub API |
| about 10:22Z | the builder's B3 reads: `main` at `750b6839`; deployment `e048c9c3` SUCCESS at `750b6839`, nothing staged, nothing building; `/health` 200 at 10:22:00Z | GitHub and Railway APIs, public `/health` |
| 10:35:36Z | the Founder's B3 reads on the PC: checkout `~/buildroom-gateway` at `750b6839` with no local changes, built under Node v22.23.2; `doctor` with custody error none, no staging item, no staging lock; `2222132d` enrolled in slot 1, no other enrollment, none awaiting approval, every pairing code expired | the filed delivery |
| 10:39:15.074Z | one pairing code minted, pairing `c0a96b06-33e7-449d-9f1e-4249da5d5e1b`, expiring 10:49:15.074Z; the code went from the mint response to the PC's standard input only | the filed delivery, the pinned result |
| 10:39:16.833Z | `key_received` for Gateway `1880c12d`: `buildroom enroll` on the PC printed the fingerprint and started the daemon on the Founder's `y` | the filed delivery, the pinned result |
| 10:47:58Z | the Founder confirmed with the gateway id and fingerprint read from the PC's screen; HTTP 201, state `enrolled`; registry event at 10:47:58.159Z | the filed delivery, the pinned result |
| 10:48:07Z | `/health` 200, the builder's read | public `/health` |
| 11:33:18Z to 11:33:33Z | the other B6 reads, 45 minutes after the confirmation (finding 2): `status` primary HEARTBEATING; `doctor` primary item present, staging absent, daemon reachable; daemon process 26506; `1880c12d` enrolled in slot 2 since 10:47:58.159Z and `2222132d` in slot 1 | the filed delivery |
| 12:43:48Z | the Founder's read-only registry query | the pinned result |
| 12:45:53Z | the two C1 ops-log rows committed in FounderOS (`334ce99`); FounderOS PR #378 opened at 12:46:03Z | git, GitHub API |
| 15:04:26Z | the ruling first posted on FounderOS PR #378, comment 6148593444; by its own text it did not take effect there (finding 3) | GitHub API |
| 21:11:52Z | the ruling posted on Build Room PR #113, in effect | GitHub API |
| 21:13:32Z | the ruling's ops-log row committed (`94f166d`) | git |
| 23:17:12Z | FounderOS PR #378 body set with the Tier-2 marker: antigravity, PASS on `94f166d` | GitHub API |
| 23:20:01Z | FounderOS PR #378 merged by the Founder as `09b80afa4deddacc182e6c43c8b47c24aed4a23b`, parents `764ef6ed` and `94f166df`, tree `4901a82ae9fe3235aa9dd4aeeaf954ac00fdd193`, before any authorization was posted (finding 5) | GitHub API, git |
| 2026-10-14 00:52:12Z | `FOUNDER-RULING-20261014-FOS378-MERGE-RECORD` posted on FounderOS PR #378, comment 6158399116, recording that merge and authorizing it as made | GitHub API |

## Findings

**1. The B3 to B6 output was delivered in session, not posted.** B3
asks the builder to report each condition with its check and time; the
act does not say the Founder posts his output. He pasted it into this
session, and the builder files that delivery. No Founder-side hash was
supplied.

**2. The B6 reads came 45 minutes after the confirmation, and a ruling
accepts them.** B6 asks for its checks within 15 minutes of the
confirmation. Only `/health` was read inside that window, at 10:48:07Z.
The rest were read at 11:33:18Z to 11:33:33Z. Under B7 the builder
stopped and reported; nothing was retried, revoked or minted again. The
Founder's ruling of 21:11:52Z accepts those readings as meeting B6 and
closes the departure.

**3. The ruling was first posted where it did not take effect.** Its
text says it takes effect when posted on Build Room PR #113. It was
posted first on FounderOS PR #378 at 15:04:26Z, then on Build Room
PR #113 at 21:11:52Z. The two bodies are byte-identical; the first copy
is left unedited and is not filed here.

**4. The key fingerprints are filed cut to 8 hex characters.** The
delivery carried four Gateways' 64-hex fingerprints and key ids, twelve
occurrences in all: `08b6179e` (the PC, `1880c12d`), `3c8975f9`
(`2222132d`), `75e35718` (revoked `4369975d`) and `730a964f` (denied
`48476acc`). They are public-key fingerprints, not secrets, but this
repository is public, no earlier filing here carries a full
fingerprint, and the FounderOS rows omit it. The Founder chose to file
them cut. The delivery as received, before the cut, has SHA-256
`b76906377acd94ec4ab175f5096c5af12ba88ef33b2dec230ca792da3226df2f`,
11134 bytes, 230 lines; the cut is the only change.

**5. The FounderOS filing was merged before any merge authorization.**
C1 needs a separate SHA-named authorization for each pull request. The
builder drafted one for FounderOS PR #378 at 23:18Z; it was not posted,
and the Founder merged the PR at 23:20:01Z. The builder checked the
merge commit at 23:21Z: its tree is the reviewed head's, its message
carries the Tier-2 marker and the attribution trailers, and
`attribution-shape-check.sh main` passes on it. The Founder's ruling of
2026-10-14 00:52:12Z records the merge and authorizes it as made; it
says it is not an authorization given before the merge. The merge path
is not recorded.

**6. The registry query ran as the database owner.** The result shows
`current_user` `neondb_owner`: the Founder ran it in the Neon SQL editor
under the owner role. B6 requires a read-only query that opens a
read-only transaction and ends in `ROLLBACK`, and this one does; it
names no role.

**7. The query's result is pinned, not filed.** This repository's
secret scan (gitleaks 8.30.1, a hard failure, over the whole history)
flags line 4 of the delivered result under its `generic-api-key` rule:
the word `key_received` followed by `event_id=` and a long value. The
value is a registry event id, not a secret. The repository has no
gitleaks allowlist, and a commit carrying the file would fail the scan
on `main` from then on. The Founder chose to pin the result by its hash
and state its values here rather than add the scan's first suppression.
The file was in this branch's first commit, `e60c631`, which the builder
replaced before review; that commit is not on `main`.

None of the findings was corrected.

## What the builder read and did not do

- Every comment, check, review and merge fact above was read from the
  GitHub API; every deployment fact from the Railway API, listing
  deployments and staged changes only.
- The builder held no control-plane token, pairing code, key or
  connection string, called no tool that returns one, and ran no SQL.
  Every step that used the token was the Founder's, on the PC.
- No Gateway was revoked or denied, no second code was minted, and no
  redaction key was minted, moved or read. Nothing was deployed,
  redeployed or rolled back.
- The PC daemon's state after 11:33:33Z was not read. C2 of the act
  keeps it to the session the Founder started it in; this receipt
  states nothing about it now.

## Provenance and transport

| Step | Identity |
|---|---|
| The act, the ruling, the mint, the enrollment, the confirmation, the B3 to B6 reads on the PC, the registry query, the FounderOS merge | the Founder (`decivantiq`) |
| The commands, the query text, GitHub and Railway reads, `/health` reads, the FounderOS rows, this record | the builder session, under the act |
| Transport | files written by the builder from the GitHub API and from the Founder's in-session deliveries, ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: C1 of
`FOUNDER-ACT-20261013-BR-PC-GATEWAY-ENROLLMENT`. Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
