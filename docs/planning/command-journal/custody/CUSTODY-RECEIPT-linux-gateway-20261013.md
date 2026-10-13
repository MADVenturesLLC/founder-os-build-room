# CUSTODY RECEIPT — the Linux Gateway: design note, implementation, certification and merge (2026-10-13)

**This receipt records the landing of six Founder instruments and the
evidence for the acts they authorized: his ratification of the Linux
Gateway design note and his authorization of its merge (PR #111), his
act implementing the Linux Gateway, his two rulings on the Mac half of
its certification, and his authorization of its merge (PR #112). It
files the PC preflight (B2) and the certifying runs (B4) the
implementation act requires, records the builder's reads and four
findings, and authorizes nothing.** Each instrument's own text governs.
The filing is ordered by C2 of the ratification and C2 of the
implementation act; each says the record needs the Founder's separate
authorization.

## The instruments

Each file is the comment's body as the GitHub API returns it, with CR
bytes removed, plus one final LF; the comments carried no final
newline. None was edited after posting. Each is byte-identical, after
that normalization, to the builder's draft.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-linux-gateway-design-note-ratification-20261012.txt` |
| Git blob id | `a24f13d8a650f0ef3ef50957d2d11c166ac1fcf3` |
| SHA-256 | `f0dca16b55d9edab7c25d204065ab4a7f7bb0f3d4ea367e2712431ae80262729` |
| Bytes | 3865 |
| Lines | 32 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261012-BR-LINUX-DESIGN-NOTE-RATIFICATION`, comment 6117149364 on PR #111, posted 2026-10-12T03:21:46Z from `decivantiq` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-linux-gateway-design-note-merge-20261012.txt` |
| Git blob id | `eda06192fd28273657587ae1121f80e766dd71a6` |
| SHA-256 | `9d08590bac56598c5ea9273edcec57782257471673a526a6a0084054f81454b5` |
| Bytes | 2719 |
| Lines | 48 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the SHA-named authorization to merge PR #111 at head `60c1128122a8c3b8957a52b0abcea0e71dbe6758`, comment 6117192672 on PR #111, posted 2026-10-12T03:26:36Z from `decivantiq` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-linux-gateway-implementation-20261012.txt` |
| Git blob id | `4e88367ae834e3cb3a5ca501ac0fe3ed9e385da8` |
| SHA-256 | `7282f9c9af1ecae082833a91fd0452349f5ebd33235c4626ebf1cd5f8b874565` |
| Bytes | 5882 |
| Lines | 33 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261012-BR-LINUX-GATEWAY-IMPLEMENTATION`, comment 6121186623 on PR #111, posted 2026-10-12T09:09:21Z from `decivantiq` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-linux-gateway-mac-smoke-92e253b-20261012.txt` |
| Git blob id | `dbd0a0f55d435dfe18b8f7579685c35e6e26ec1e` |
| SHA-256 | `aa4f859bfa65db7c845bae6b797ad4fcde6fb93410a610db9e2140431f588c66` |
| Bytes | 1912 |
| Lines | 15 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-RULING-20261012-BR112-MAC-SMOKE`, comment 6131817329 on PR #112, posted 2026-10-12T20:11:50Z from `decivantiq`. It certified head `92e253b`, which the PR then moved past; it certifies nothing at the merged head and is filed as a record |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-RULING-linux-gateway-mac-a521b19-20261013.txt` |
| Git blob id | `d4672ab6fff088643012a9f1ff37bf147ea4b68b` |
| SHA-256 | `22c0f2217f81ecefde5b02d8b1c96ce0220897921a5dbbbc642a1e56e3e8a065` |
| Bytes | 2025 |
| Lines | 15 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-RULING-20261013-BR112-MAC-A521B19`, comment 6136380880 on PR #112, posted 2026-10-13T01:55:54Z from `decivantiq`: the Mac half of B4 at the merged head |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-linux-gateway-merge-20261013.txt` |
| Git blob id | `193398f2e80e0d89a5442a2e5646402f911e163a` |
| SHA-256 | `70e645d9a08218a46ba04c8e32061fb3356bb46175902ce77e4c4fc2fc0f1aed` |
| Bytes | 3626 |
| Lines | 67 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the SHA-named authorization to merge PR #112 at head `a521b198df8c124eed56736cf5f101adaceef153`, comment 6136669369 on PR #112, posted 2026-10-13T02:10:26Z from `decivantiq`. It also accepts the third pin change and rules the Cursor security agent out of that head's review bar |

## The evidence

The three Founder outputs are as he delivered them in this session,
plus one final LF (finding 1).

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/LINUX-GATEWAY-EVIDENCE-pc-preflight-b2-20261012.txt` |
| Git blob id | `e303c84b23dbfd0315f74e600607c09380e887a1` |
| SHA-256 | `17dc42b39bc3b194f62ec9326e63a8bb66ecd96f0f3482ab8fcaf32fc4492e8b` |
| Bytes | 1295 |
| Lines | 40 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | B2: the read-only commands the builder gave and their output on the PC, delivered at 2026-10-12T09:28:00Z. systemd 259; the TPM seen; `--with-key=tpm2` refused in uid-scoped mode; `--with-key=host+tpm2` round trip exit 0 0 0. The builder fixed the key mode at `host+tpm2` from it |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/LINUX-GATEWAY-EVIDENCE-buildroom-cert-script-20261012.txt` |
| Git blob id | `78acd7fabee075beb6349889639170722d6ed5c1` |
| SHA-256 | `1917b097b6be60516035446b9f192077b964a22f1e51795b5675c911de6cad66` |
| Bytes | 7175 |
| Lines | 172 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the certification script the builder gave for B4, `buildroom-cert.sh`, filed as text so it is not run from here. Both machines checked this SHA-256 before running it (Mac at 2026-10-12T15:52Z, PC at 23:43Z, in the Founder's deliveries) |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/LINUX-GATEWAY-EVIDENCE-pc-cert-a521b19-20261013.txt` |
| Git blob id | `c758c3d5120fc9466a798a6d008f6adfa90352c1` |
| SHA-256 | `3137784511e67a58ed3e53cbfac6850f79c9c7f0553711795e154abf966c6aa7` |
| Bytes | 3903 |
| Lines | 84 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | B4 on the PC, delivered at 2026-10-13T01:36:15Z: the run that started 20261013T012557Z at head `a521b19`, every step PASS, the real `systemd-creds` custody suite 7 of 7 |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/LINUX-GATEWAY-EVIDENCE-mac-cert-a521b19-20261013.txt` |
| Git blob id | `ca243d72b925bb277734765ad44d49a4124543fe` |
| SHA-256 | `8fbe5c954f6033bbc2425d4c6038db6c1361562db50c4de820fd7602c9404d00` |
| Bytes | 5075 |
| Lines | 118 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | B4 on the Mac, delivered at 2026-10-13T01:54:21Z: the run that started 20261013T014705Z at head `a521b19`, every step PASS but `gateway-smoke.sh` (finding 2), then the smoke script at the same head with its throwaway HOME at `/tmp/brsmoke.lDgxXp`, every check ok |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/LINUX-GATEWAY-EVIDENCE-deploy-46f14278-health-polls-20261013.txt` |
| Git blob id | `f88d3d92d8af8100800ffc8953ecbc6ea36713fc` |
| SHA-256 | `54c56659a90ac3474e0574047cf9b9b2f69608fa022d7d0226ad64fd73ee9180` |
| Bytes | 420 |
| Lines | 30 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's polls of public `/health`, 15 seconds apart, from 02:13:50Z to 02:21:18Z on 2026-10-13, one line each, status only |

## What happened, in order

All times are UTC.

| Time | Event | Source |
|---|---|---|
| 2026-10-12 03:21:46Z | the ratification posted | GitHub API |
| 03:26:36Z | the authorization to merge PR #111 posted | GitHub API |
| 03:27:15Z | PR #111 merged by the Founder; merge commit `85c2a1451a933afca3a8c147e34bb336fd554cd9`, parents `0d2b97b1` and `60c11281`, tree `adc8110ea51f39ceddba17b4cbb366d17b02dec8`, the authorized tree | GitHub API, git |
| 03:27:17Z | deployment `a1bc8fb9` at `85c2a145` created; SUCCESS | Railway API |
| 09:09:21Z | the implementation act posted | GitHub API |
| 09:28:00Z | the PC preflight delivered (B2) | session |
| 2026-10-12 to 10-13 | PR #112 built from `85c2a145`: twelve commits, nine Copilot rounds, CI green on every head; `main` did not move, so no merge from it | GitHub API |
| 2026-10-12 15:43Z to 20:11Z | at head `92e253b`: Mac runs passing every step but the smoke script; the short-path smoke passing; the ruling of 20:11:50Z certifying the Mac half at that head | session, GitHub API |
| 2026-10-12 23:00Z | at head `92e253b`: the PC run failing the socket proof (`ss` output past the 1 MiB buffer), custody 7 of 7. Fixed in `aefa86a`; the head then moved to `a521b19` through two more review rounds | session, git |
| 2026-10-13 01:25:57Z to 01:32:13Z | the certifying PC run at `a521b19` | the filed output |
| 01:47:05Z to 01:53:38Z | the certifying Mac run at `a521b19`, then the short-path smoke | the filed output |
| 01:55:54Z | the Mac ruling at `a521b19` posted | GitHub API |
| 01:58Z | checks on `a521b19` read: build-and-test, build-and-test-macos, storage-integration, custody-pin-check, path-audit, hygiene, CodeQL and both Analyze jobs green; `attribution-shape` green on the run started 01:17:58Z, after the body was set; six of six review threads resolved; `/health` 200 at 01:58:13Z. Railway read at 01:57Z: `a1bc8fb9` SUCCESS, nothing staged, nothing building | GitHub and Railway APIs, public `/health` |
| 02:10:26Z | the authorization to merge PR #112 posted | GitHub API |
| 02:10:28Z to 02:12:30Z | a Cursor security agent run on `a521b19`, started by that comment, completed `neutral`: "Security Review run encountered an error", no annotation (finding 3) | Checks API, run 115094920645 |
| 02:12:56Z | head `a521b19`, `main` `85c2a145`, the PR body unchanged and `founder-authorization` green, re-read | GitHub API |
| 02:13:03Z | PR #112 merged by the builder as `decivantiq` with `expectedHeadSha`; merge commit `feed9ef24ac3112e2b0112939df9640a746e76f6`, parents `85c2a145` and `a521b198`, tree `3244564d5f66f4df87b522b478848014f6595a8d`, the authorized tree; trailers intact; `attribution-shape-check.sh main` PASS | GitHub API, git |
| 02:13:05Z | deployment `46f14278` at `feed9ef2` created | Railway API |
| 02:13:45Z | `46f14278` SUCCESS; `a1bc8fb9` REMOVED at 02:13:49Z | Railway API |
| 02:13:50Z to 02:21:18Z | `/health` 200 on all 30 polls | public `/health` |

## Findings

**1. The B2 and B4 outputs were delivered in session, not posted.** B2
and B4 of the implementation act say the Founder posts the output. He
pasted each into this session instead, and the builder files those
deliveries. The Mac ruling restates its run's results in a posted
comment; the PC preflight and the PC run have no posted copy. No
Founder-side hash was supplied for any of the three.

**2. The smoke script failed on the Mac, and a ruling certifies the
Mac half.** In the certifying Mac run, `scripts/gateway-smoke.sh`
failed one check: its throwaway HOME under the Mac's per-user temporary
directory makes the Gateway socket path longer than the 104 bytes macOS
allows, and the socket-path guard reports that, as designed. The same
check fails at `main` `85c2a145` on that Mac. The Founder's ruling of
01:55:54Z certifies the Mac half by that run together with the smoke
script at the same head with a short HOME, which passed every check.
The script is unchanged; changing it needs a separate act.

**3. No security agent reviewed the last three commits.** The Cursor
security agent passed on every head it reviewed through `aefa86a` and
posted no run on `a31d9f7`, `35d6541` or `a521b19` before the
authorization. The run the authorization started errored and reported
nothing. The authorization rules Cursor out of that head's review bar
and voids only on a merge-blocking finding, so the merge went ahead.
Those commits include `a521b19`, which gives the `systemd-creds` helper
an allowlist of non-secret environment variables; before it the helper
inherited the caller's environment, `CONTROL_PLANE_TOKEN` included.
Copilot reviewed them, CodeQL scanned them, and each change has a test
that fails on the old code.

**4. Certification output that does not certify is not filed.** B4
says a run that fails, or is at another head, does not certify. The
runs at `92e253b` on both machines, and a second PC run at `a521b19`
(20261013T013739Z, the Mac command block run on the PC, every step
PASS), are listed above and not filed. The Mac ruling at `92e253b` is
filed because it is a Founder instrument.

None of the findings was corrected.

## What the builder read and did not do

- Every check, review and merge fact above was read from the GitHub
  API; every deployment fact from the Railway API, listing deployments
  and staged changes only.
- The builder did not read the deployment's logs; the boot is shown by
  Railway's SUCCESS and the health polls.
- The builder holds no connection string, password or key, and called
  no tool that returns a variable's value.
- No key was minted, moved or read. No Gateway was enrolled, revoked or
  given a pairing code; production still has one enrolled Gateway.
  Nothing else was deployed, redeployed or rolled back.

## Provenance and transport

| Step | Identity |
|---|---|
| The six instruments, B2 and B4 runs, merge of PR #111 | the Founder (`decivantiq`) |
| PR #112, the certification script, the merge of PR #112, GitHub and Railway reads, health polls | the builder session, under the implementation act and the merge authorization |
| Transport | files written by the builder from the GitHub API and from the Founder's in-session deliveries, ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: C2 of the ratification and C2 of
the implementation act. Merge is a separate exact-SHA Founder act under
DEC-20260718-04; this receipt asserts none.
