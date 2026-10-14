# CUSTODY RECEIPT — the merge of PR #116, the smoke and certification scripts custody record (2026-10-14)

**This receipt records the landing of the Founder's authorization of
the merge of PR #116 and files the builder's polls of `/health` across
the deployment that merge started. It authorizes nothing.** The
instrument's own text governs. The filing was directed by the Founder
in session on 2026-10-14; no act orders it, and its merge needs his
separate SHA-named authorization.

## The instrument

The file is the comment's body as the GitHub API returns it, with CR
bytes removed, plus one final LF; the comment carried no final newline.
It was not edited after posting. It is byte-identical, after that
normalization, to the builder's draft.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-smoke-cert-custody-merge-20261014.txt` |
| Git blob id | `4567565101eb9cdf4608e06fff0caa2c3542e6cc` |
| SHA-256 | `fe6a0d30e30b7a9c1e12a57745695e5a54c1f244edd447cbe407fb60839d7a35` |
| Bytes | 2319 |
| Lines | 45 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the SHA-named authorization to merge PR #116 at head `84774d289fe38719ddc9ae9ab045152b377fd5f8`, comment 6167089753 on PR #116, posted 2026-10-14T11:15:52Z from `decivantiq` |

## The evidence

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/SMOKE-CERT-EVIDENCE-deploy-03ac35f8-health-polls-20261014.txt` |
| Git blob id | `bbb50e6ddbff551abf6e580d4fc3023347f7e2df` |
| SHA-256 | `c72665607e6530d94a07ee5c960501028c146b405ace98f9d55640371ad4fc0d` |
| Bytes | 420 |
| Lines | 30 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the builder's polls of public `/health`, 15 seconds apart, from 11:17:23Z to 11:24:52Z on 2026-10-14, one line each, status only |

## What happened, in order

All times are UTC, on 2026-10-14.

| Time | Event | Source |
|---|---|---|
| 11:07:19Z | the PR #116 body set; `attribution-shape` green on the run started at 11:07:26Z | GitHub API |
| 11:06Z to 11:08Z | `9f4d66a0` SUCCESS at `2db15255`, nothing staged, nothing building; `main` at `2db15255`; `/health` 200 at 11:08:13Z | Railway API, GitHub API, public `/health` |
| 11:15:52Z | the merge authorization posted (comment 6167089753) | GitHub API |
| 11:16:02Z | `founder-authorization` green: "Authorized at head 84774d2 by comment 6167089753" | GitHub API |
| 11:16:18Z | the same authorization posted a second time (comment 6167096876) | GitHub API |
| 11:16Z | re-read: the head still `84774d2`, the body unchanged, `main` still `2db15255`, Railway as at 11:06Z, `/health` 200 at 11:16:22Z | GitHub and Railway APIs, public `/health` |
| 11:17:11Z | PR #116 merged by the builder as `decivantiq` with `expectedHeadSha`; merge commit `85e236e75c095c76ec597569aa882e4397d5b93d`, parents `2db15255` and `84774d28`, tree `8c4c596f3cf5876aa57f79dd7512ff1fd109cad8`, the authorized tree; trailers intact; `attribution-shape-check.sh main` PASS | GitHub API, git |
| 11:17:12Z | deployment `03ac35f8` at `85e236e7` created | Railway API |
| 11:18:00Z | `03ac35f8` SUCCESS; `9f4d66a0` REMOVED at 11:18:04Z | Railway API |
| 11:17:23Z to 11:24:52Z | `/health` 200 on all 30 polls | public `/health` |
| after 11:17Z | every check on `85e236e7` green, `attribution-shape` included | Checks API |

## Findings

**1. The authorization was posted twice.** Comment 6167096876 was
posted 26 seconds after comment 6167089753. Its body, normalized the
same way, is byte-identical to the filed file (SHA-256 `fe6a0d30…`),
and neither comment was edited after posting. The first is filed; the
second names the same head and adds nothing.

**2. This filing is not ordered by an act.** The Founder directed it in
session. The smoke and certification act's C2 ordered the record filed
in PR #116, which could not carry the authorization of its own merge.

**3. The merge of this record's pull request starts another
deployment.** Its polls are not filed here; they belong to the next
custody record.

None of the findings was corrected.

## What the builder read and did not do

- Every comment, check and merge fact above was read from the GitHub
  API; every deployment fact from the Railway API, listing deployments
  and staged changes only.
- The builder holds no connection string, password or key, and called
  no tool that returns a variable's value.
- No Gateway was enrolled, revoked, denied or given a pairing code; no
  key was minted, moved or read; no certification was run. Nothing else
  was deployed, redeployed or rolled back.

## Provenance and transport

| Step | Identity |
|---|---|
| The merge authorization | the Founder (`decivantiq`) |
| The merge of PR #116, GitHub and Railway reads, health polls, this record | the builder session, under the merge authorization and the Founder's direction in session |
| Transport | files written by the builder from the GitHub API and from its own polls, ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction in session on 2026-10-14. Merge is a
separate exact-SHA Founder act under DEC-20260718-04; this receipt
asserts none.
