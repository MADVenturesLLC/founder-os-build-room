# CUSTODY RECEIPT — the smoke script's short sandbox and a certification script in the repository (2026-10-14)

**This receipt records the landing of three Founder instruments: his
act ordering the smoke-script fix, the macOS CI smoke step and a
certification script in the repository; his amendment allowing four
more changes to that script; and his authorization of the merge of
PR #115. It files the builder's polls of `/health` across the
deployment that merge started, records two notes the act orders and
three findings, and authorizes nothing.** Each instrument's own text
governs. The filing is ordered by C2 of the act, which says this pull
request needs the Founder's separate authorization.

## The instruments

Each file is the comment's body as the GitHub API returns it, with CR
bytes removed, plus one final LF; the comments carried no final
newline. None was edited after posting. Each is byte-identical, after
that normalization, to the builder's draft.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-smoke-cert-scripts-20261014.txt` |
| Git blob id | `4318a9e1a375fa322231bccb64e73c518fa73335` |
| SHA-256 | `c7d2ccb09c8c1aa7bc5a339dd2642bc997b7387cb6a157ce0ac88248084d32ff` |
| Bytes | 4273 |
| Lines | 23 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261014-BR-SMOKE-CERT-SCRIPTS`, comment 6160133718 on PR #114, posted 2026-10-14T03:20:58Z from `decivantiq` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-smoke-cert-scripts-amendment-1-20261014.txt` |
| Git blob id | `5b56afc3dcc4c00b1f2c6be04e5f6ca6006ea9fb` |
| SHA-256 | `d68b263cd2c7f93246b29ec9404bb3d9cf1fc8f0af95327df2824f9519f038ca` |
| Bytes | 2347 |
| Lines | 15 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261014-BR-SMOKE-CERT-SCRIPTS-AMENDMENT-1`, comment 6160541878 on PR #115, posted 2026-10-14T03:57:02Z from `decivantiq`: four more changes to `scripts/gateway-cert.sh` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-smoke-cert-scripts-merge-20261014.txt` |
| Git blob id | `4e93040cc9870394fdb054d448b7e3627821ba3e` |
| SHA-256 | `dc9b9e428088541b8e8a99801ae272165c6c57695c8763b7a58cd3c69eed1ac5` |
| Bytes | 2596 |
| Lines | 49 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the SHA-named authorization to merge PR #115 at head `5ca6106307b2cd953a21159fa4b3c940b13e3470`, comment 6165878279 on PR #115, posted 2026-10-14T10:05:15Z from `decivantiq`. It accepts Copilot's finding r4266646576 and the `cert.log` note as left for a separate act |

## The evidence

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/SMOKE-CERT-EVIDENCE-deploy-9f4d66a0-health-polls-20261014.txt` |
| Git blob id | `edb725c9ad23b217447e41d4b59e4025b6bc6e11` |
| SHA-256 | `6fc3aaee928128a1a09fffd419f725f06c0885fdfac763d3a49783a3d6dbf444` |
| Bytes | 420 |
| Lines | 30 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's polls of public `/health`, 15 seconds apart, from 10:06:50Z to 10:14:17Z on 2026-10-14, one line each, status only |

## What happened, in order

All times are UTC, on 2026-10-14.

| Time | Event | Source |
|---|---|---|
| 03:20:58Z | the act posted | GitHub API |
| 03:38:23Z | `b02c794` committed: B1, B2 and B3; PR #115 opened at 03:38:31Z | git, GitHub API |
| 03:41:38Z | Copilot on `b02c794`: three findings in `gateway-cert.sh` (branch not tied to the head; test counts; untracked files in the Build Room checkout) | GitHub API |
| 03:42:29Z | `dc4a5cb`: the named branch must carry the head, within B3 change (1); the other two put to the Founder as outside B3 | git |
| 03:45:12Z | `build-and-test-macos` on `b02c794` green, the new "Gateway CLI smoke (throwaway HOME)" step passing | Checks API |
| 03:53:11Z | Copilot on `dc4a5cb`: an unguarded `mktemp`, and in its summary the fixed port 55432; both outside B3 | GitHub API |
| 03:57:02Z | the amendment posted | GitHub API |
| 03:59:40Z | `5ca6106`: the amendment's changes (4) to (7) | git |
| 04:03:57Z | Copilot on `5ca6106`: r4266646576, the smoke's `doctor` reads the real macOS Keychain service (finding 1); in its summary, `cert.log` hashed while being written (finding 2) | GitHub API |
| 04:06:44Z | `build-and-test-macos` on `5ca6106` green | Checks API |
| 04:08:09Z | the PR body set; `attribution-shape` green on the run started at 04:08:14Z | GitHub API |
| 04:09Z | `1f5d5eb8` SUCCESS at `ce32005d`, nothing staged, nothing building; `/health` 200 at 04:09:12Z | Railway API, public `/health` |
| 10:05:15Z | the merge authorization posted; `founder-authorization` green at 10:05:30Z | GitHub API |
| 10:06Z | re-read: the head still `5ca6106`, the body unchanged, `main` still `ce32005d`, Railway as at 04:09Z, `/health` 200 at 10:06:18Z | GitHub and Railway APIs, public `/health` |
| 10:06:38Z | PR #115 merged by the builder as `decivantiq` with `expectedHeadSha`; merge commit `2db15255b33221c79dd94fb63b4f85506e5a9b92`, parents `ce32005d` and `5ca61063`, tree `cf3a69eeb990860f95f54e99b7ee4ff27873135f`, the authorized tree; trailers intact; `attribution-shape-check.sh main` PASS | GitHub API, git |
| 10:06:40Z | deployment `9f4d66a0` at `2db15255` created | Railway API |
| 10:07:18Z | `9f4d66a0` SUCCESS; `1f5d5eb8` REMOVED at 10:07:22Z | Railway API |
| 10:06:50Z to 10:14:17Z | `/health` 200 on all 30 polls | public `/health` |

## Notes the act orders (C2)

**The `sslmode=verify-full` act was closed with no act issued.** On
2026-10-14 the Founder closed the act drafted on 2026-10-10 to set
`DATABASE_URL` to `sslmode=verify-full`. PR #107 had made it
unnecessary: `packages/control-plane/src/pg-tls.ts` removes every
`ssl*` parameter from the connection string before node-postgres reads
it and decides TLS in code, and the boot log of deployment `1f5d5eb8`
carries no `SECURITY WARNING`. The variable was not changed.

**A clause of the enrollment act excluded nothing.** C2 of
`FOUNDER-ACT-20261013-BR-PC-GATEWAY-ENROLLMENT` lists moving the hermes
worker among the things it does not authorize. B10 of
`FOUNDER-ACT-20261010-BUILD-ROOM-LINUX-GATEWAY` had already moved it to
the PC, as `DEC-20260815-08` on FounderOS `main` records. The builder
drafted that clause on a misreading of B10.

## Findings

**1. On macOS the smoke script reads the real Gateway Keychain items.**
`doctor` builds the production custody backend; on macOS its
`inventory()` runs `security find-generic-password -w` for `primary`
and `staging` under the service `com.madventures.buildroom.gateway`,
which loads each secret to answer present or absent. A throwaway
`HOME` does not reach the Keychain. On the hosted CI runner there is no
Gateway item; on a Mac with an enrolled Gateway every run of
`smoke:gateway`, and every `doctor`, has read the real items into the
process, printing only present or absent. The script's own header says
it cannot touch real Gateway state, which is not true on macOS. The
fix is Gateway code, which C3 of the act excludes; the Founder's merge
authorization leaves it for a separate act. Found by Copilot
(r4266646576).

**2. `gateway-cert.sh` hashes `cert.log` while still writing it.** The
summary's checksum of `cert.log` is printed before the last lines are
appended, so it can never match the final file. The line is carried
unchanged from the filed script; the merge authorization leaves it for
a separate act. Noted in Copilot's summary of `5ca6106`.

**3. The demonstrations ran here, not on a certifying machine.** The
proofs of B4 and of the amendment's B2 ran in the builder's session, as
an unprivileged user against local mirrors and stub outputs, with
PostgreSQL 16, Node v22.23.2 and Bun 1.4.2. No certification was run
on the PC or a Mac; the act does not authorize one.

None of the findings was corrected.

## What the builder read and did not do

- Every comment, check, review and merge fact above was read from the
  GitHub API; every deployment fact from the Railway API, listing
  deployments and staged changes only.
- The builder holds no connection string, password or key, and called
  no tool that returns a variable's value.
- No Gateway was enrolled, revoked, denied or given a pairing code; no
  key was minted, moved or read; no certification was run. Nothing else
  was deployed, redeployed or rolled back.

## Provenance and transport

| Step | Identity |
|---|---|
| The act, the amendment, the merge authorization | the Founder (`decivantiq`) |
| PR #115, the merge of PR #115, GitHub and Railway reads, health polls, this record | the builder session, under the act and the merge authorization |
| Transport | files written by the builder from the GitHub API and from its own polls, ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: C2 of
`FOUNDER-ACT-20261014-BR-SMOKE-CERT-SCRIPTS`. Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
