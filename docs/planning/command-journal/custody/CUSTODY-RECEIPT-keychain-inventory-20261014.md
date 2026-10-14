# CUSTODY RECEIPT — the Gateway's Keychain inventory reads no secret, and the merge of PR #117 (2026-10-14)

**This receipt records the landing of three Founder instruments: his
act `FOUNDER-ACT-20261014-BR-KEYCHAIN-INVENTORY`; his authorization of
the merge of PR #118, which carried that act's changes; and his
authorization of the merge of PR #117, the custody record of the merge
of PR #116. It files the builder's polls of `/health` across the two
deployments those merges started, records five findings, and
authorizes nothing.** Each instrument's own text governs. The filing of
the act and of the PR #118 authorization is ordered by C2 of the act;
the filing of the PR #117 authorization and its deployment's polls is
at the Founder's direction in session on 2026-10-14. The merge of this
record needs his separate SHA-named authorization.

## The instruments

Each file is the comment's body as the GitHub API returns it, with CR
bytes removed, plus one final LF; the comments carried no final
newline. None was edited after posting. Each is byte-identical, after
that normalization, to the builder's draft.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-keychain-inventory-20261014.txt` |
| Git blob id | `65c4b26e39da987eb64cd9e27e6a836db03169ca` |
| SHA-256 | `cfa7fb5b94f2fc0ff7cc817075191744453e10fee67a76bccfccddaad7610f43` |
| Bytes | 4331 |
| Lines | 23 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261014-BR-KEYCHAIN-INVENTORY`, comment 6167387072 on PR #117, posted 2026-10-14T11:34:02Z from `decivantiq` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-keychain-inventory-merge-20261014.txt` |
| Git blob id | `3ba19dbf53e7951a2736b249fbc887b03c1890a9` |
| SHA-256 | `331a8c7a2b3dae0ec451d940643723d67c94bf3dc52ceba7983e38587631109d` |
| Bytes | 2340 |
| Lines | 44 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the SHA-named authorization to merge PR #118 at head `8d3ac6c564bd2a0347c0370a0953dc3df57df4fc`, comment 6167824573 on PR #118, posted 2026-10-14T11:59:25Z from `decivantiq` |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-smoke-cert-custody-record-merge-20261014.txt` |
| Git blob id | `876ce9a5e31793213cb22d1bcda1778670e6169d` |
| SHA-256 | `058967b6654bfcf20aa8d900ecc88d07f54d29e3770200776b49c3e7402813fd` |
| Bytes | 2326 |
| Lines | 45 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the SHA-named authorization to merge PR #117 at head `f444e41d0c247a6093a9def556a209860ab5e948`, comment 6167631623 on PR #117, posted 2026-10-14T11:48:02Z from `decivantiq` |

## The evidence

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/SMOKE-CERT-EVIDENCE-deploy-3a6cc4e1-health-polls-20261014.txt` |
| Git blob id | `0e3973059dfa612675dd2056e7b7a5a525ef06e1` |
| SHA-256 | `c1f11412d5f50a681f31df2a5c68e82c6a818376227fd6ef743e1286db047b02` |
| Bytes | 420 |
| Lines | 30 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's polls of public `/health` across deployment `3a6cc4e1` (the merge of PR #117), 15 seconds apart, from 11:48:56Z to 11:56:24Z on 2026-10-14, one line each, status only |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/KEYCHAIN-INVENTORY-EVIDENCE-deploy-e0f4445a-health-polls-20261014.txt` |
| Git blob id | `8ffac14545c638c4450744b4ba6467fe3ab6d2c2` |
| SHA-256 | `18a17093cb11d7bc17a55169496b1010015a7fe2914b599d1dccd09fe3680092` |
| Bytes | 420 |
| Lines | 30 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's polls of public `/health` across deployment `e0f4445a` (the merge of PR #118), 15 seconds apart, from 12:00:19Z to 12:07:47Z on 2026-10-14, one line each, status only |

## What happened, in order

All times are UTC, on 2026-10-14.

| Time | Event | Source |
|---|---|---|
| 11:34:02Z | the act posted on PR #117 | GitHub API |
| 11:45:55Z | the PR #117 body set; `attribution-shape` green on the run started at 11:46:01Z | GitHub API |
| 11:48:02Z | the PR #117 merge authorization posted | GitHub API |
| 11:48Z | re-read: the head still `f444e41`, the body unchanged, `main` still `85e236e7`, `03ac35f8` SUCCESS, nothing staged, `/health` 200 at 11:48:33Z; `founder-authorization` green at 11:48:14Z | GitHub and Railway APIs, public `/health` |
| 11:48:48Z | PR #117 merged by the builder as `decivantiq` with `expectedHeadSha`; merge commit `463bd4f71c0bd0eb9f5015d7e14b3c1520ebb95d`, parents `85e236e7` and `f444e41d`, tree `693605fe684f1699cf7e572381b691583e2e8e72`, the authorized tree; trailers intact; `attribution-shape-check.sh main` PASS | GitHub API, git |
| 11:48:50Z | deployment `3a6cc4e1` at `463bd4f7` created; SUCCESS at 11:49:32Z | Railway API |
| 11:48:56Z to 11:56:24Z | `/health` 200 on all 30 polls | public `/health` |
| 11:49:35Z | PR #118 opened at `8d3ac6c`: B1 to B3, three commits built before PR #117 merged and placed on `463bd4f7` | GitHub API, git |
| 11:56Z | `build-and-test-macos` on `8d3ac6c` green: `test:custody:macos` 8 of 8, none skipped, with the B4 case; the CLI smoke passing | Checks API, job log |
| 11:57:44Z | the PR #118 body set; `attribution-shape` green on the run started at 11:57:50Z | GitHub API |
| 11:59:25Z | the PR #118 merge authorization posted | GitHub API |
| 11:59Z | re-read: the head still `8d3ac6c`, the body unchanged, `main` still `463bd4f7`, `3a6cc4e1` SUCCESS, nothing staged, `/health` 200 at 11:59:56Z; `founder-authorization` green at 11:59:48Z | GitHub and Railway APIs, public `/health` |
| 12:00:11Z | PR #118 merged by the builder as `decivantiq` with `expectedHeadSha`; merge commit `ef63501dbea76f74e292343b063fab4b31cae0d2`, parents `463bd4f7` and `8d3ac6c5`, tree `cb2f96b56ca7dd6f0b61d24a9631d9a8baa507a7`, the authorized tree; trailers intact; `attribution-shape-check.sh main` PASS | GitHub API, git |
| 12:00:12Z | deployment `e0f4445a` at `ef63501d` created; SUCCESS at 12:01:06Z; `3a6cc4e1` REMOVED at 12:01:11Z | Railway API |
| 12:00:19Z to 12:07:47Z | `/health` 200 on all 30 polls | public `/health` |

## Findings

**1. The fix reaches no machine.** C3 of the act does not authorize
updating the Gateway code on any machine. Until a Mac's Gateway
checkout is updated under a separate act, its `doctor`, its `enroll`
and the smoke script run there still read the Gateway's Keychain
items with `-w`.

**2. The inventory was not tried against a locked Keychain.** Without
`-w`, `find-generic-password` may answer for an item's existence when
a read of its secret would fail. If so, `doctor` would report a
locked item as present, and `enroll` would stop later, at the
read-back of its staging write, rather than at the inventory; it still
fails closed. The real-Keychain suite ran on an unlocked runner
Keychain only.

**3. The B3 proof ran here, not on a certifying machine.** It ran in
the builder's session, on stub outputs, as was done for the act of
2026-10-14 that brought the script into the repository. No
certification was run.

**4. Two items here are not ordered by the act.** The PR #117 merge
authorization and the polls of deployment `3a6cc4e1` are filed at the
Founder's direction in session, as finding 3 of
`CUSTODY-RECEIPT-smoke-cert-custody-merge-20261014.md` anticipated.

**5. The merge of this record's pull request starts another
deployment.** Its polls are not filed here; they belong to the next
custody record.

None of the findings was corrected.

## What the builder read and did not do

- Every comment, check and merge fact above was read from the GitHub
  API; every deployment fact from the Railway API, listing deployments
  and staged changes only.
- The builder holds no connection string, password or key, and called
  no tool that returns a variable's value.
- No Gateway was updated, restarted, enrolled, revoked, denied or given
  a pairing code; no key was minted, moved or read; no certification
  was run. Nothing else was deployed, redeployed or rolled back.

## Provenance and transport

| Step | Identity |
|---|---|
| The act and both merge authorizations | the Founder (`decivantiq`) |
| PR #118, the merges of PR #117 and PR #118, GitHub and Railway reads, health polls, this record | the builder session, under the act, the merge authorizations and the Founder's direction in session |
| Transport | files written by the builder from the GitHub API and from its own polls, ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: C2 of
`FOUNDER-ACT-20261014-BR-KEYCHAIN-INVENTORY`, and his direction in
session on 2026-10-14. Merge is a separate exact-SHA Founder act under
DEC-20260718-04; this receipt asserts none.
