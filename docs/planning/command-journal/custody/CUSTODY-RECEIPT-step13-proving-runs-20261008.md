# CUSTODY RECEIPT — Tranche C, cutover step 13: proving the administrative plane before Gate VI (2026-10-08)

**This receipt records the landing of two instruments: the Founder's act
for cutover step 13, two proving dispatches of the administrative
migration workflow meant to show PC-23, PC-27 and PC-28, and his
acceptance, which rules condition 4 of r6 section 15 observed. It also
records the Founder's read of the environment that shows PC-26 and
PC-29, the builder's reads, and that both proving runs were approved
when the act said to reject them. It authorizes nothing: no rotation of
`neondb_owner` (Gate VI), no migration, no change to the environment,
its reviewers, its secret or any workflow, no deploy, no merge, and no
change to any variable, role or database.** Each instrument's own text
governs.

## The instruments

Each file is the text of the Founder's message as recorded in the session
transcript, byte for byte, plus one final LF; neither post carried a
final newline.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-step13-proving-runs-20261008.txt` |
| Git blob id | `a5541f894a268237bf061c003452263e95b61de9` |
| SHA-256 | `3c15d2c137c44e91002f003e453607f6d716434aba669a7284290def17023d88` |
| Bytes | 3911 |
| Lines | 80 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's act for cutover step 13 at `main` `d4a75ef80efed0abe57d6556b02afb2c9ac2040c`: two dispatches of `DB Admin Migration` re-selecting the applied migration `0008_runtime_operational_grants`, P1 then P2, each to be rejected by `daley40-lab`. The Founder chose this route ("1 and 2", 16:16:03Z) after the builder set out the options for evidencing condition 4; the builder delivered the draft at 16:17Z, and he posted it in the builder session at 2026-10-08T16:19:29Z. The message's first line was `read`, the instruction for the act's step a, followed by one blank line; neither is part of the act and neither is preserved here. The posted text is byte-identical to the builder's draft. Spent by the acceptance below |

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-ACCEPTANCE-step13-proving-runs-20261008.txt` |
| Git blob id | `3670d96d9c66709f5334daac0313ef957cd8e211` |
| SHA-256 | `0ba257c0e30b4fa37409e9511925fdf989118de8acdd115564a1ad6c68230915` |
| Bytes | 1557 |
| Lines | 30 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | the Founder's acceptance, posted at 2026-10-08T20:27:56Z. It records the departure (both runs approved instead of rejected), records PC-27 and PC-28 as observed and PC-23 as observed in the held state only, rules condition 4 of r6 section 15 observed, spends the act, and declares neither custody remediated nor Gate VI authorized. Drafted by the builder at 20:26Z; the Founder posted it unchanged |

## The Founder's environment read (PC-26, PC-29)

The builder's session cannot read the environment, its secrets or the
repository and organization secret lists (the proxy returns 403), so
the Founder ran the builder's read-only `gh api` block in his own
terminal, as `decivantiq`, and pasted the output in session at
16:17:07Z. The block prints names, settings and dates, never values.
The output, read between 16:16:57Z and 16:16:59Z:

- environment `db-admin-migration`: `can_admins_bypass` false; one
  `required_reviewers` rule with `prevent_self_review` true and
  reviewers `decivantiq` and `daley40-lab`; no wait timer; a
  `branch_policy` rule with custom branch policies, the only policy
  being `main` (PC-29)
- environment secrets: `MIGRATE_ADMIN_DATABASE_URL`, `updated_at`
  `2026-09-30T08:40:13Z`, unchanged since the Gate IV reads
- repository secrets, by name: `ANTHROPIC_AUTH_TOKEN`,
  `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_REVIEWER_APP_ID`,
  `CLAUDE_REVIEWER_APP_PRIVATE_KEY`, `GEMINI_API_KEY`,
  `GEMINI_REVIEWER_APP_ID`, `GEMINI_REVIEWER_APP_PRIVATE_KEY`
- organization secrets, by name: `CLAUDE_CODE_OAUTH_TOKEN`

No repository or organization secret carries the administrative
credential's name (PC-26). This is a check by name: GitHub secrets are
write-only, so no read can show that a differently named secret does
not hold the same value. The builder read that only
`.github/workflows/db-admin-migration.yml` names the environment
(PC-30), and that the workflow file at `d4a75ef8` is git blob
`5061f1d50e0deb3c65bd9ca913dcfd75fc532e13`, the same blob as at
`1e53ca78`, where control run 36712705903 failed closed on a wrong SHA
(PC-25, recorded in the Gate IV receipt for 0006 and 0007).

## What happened, in order

All times are UTC on 2026-10-08. Session times are the transcript's;
GitHub times are its API's; database times are the database clock.

| Time | Event | Source |
|---|---|---|
| 16:19:29Z | act posted, prefixed `read` | session |
| 16:19:52Z to 16:20:04Z | step a: every condition holds. `main` at `d4a75ef8`, workflow blob `5061f1d5`; no run of the workflow queued, waiting or in progress; `schema_migrations` 0001 to 0008 | GitHub, Neon `run_sql` |
| 16:20:17Z | P1, run 37807986274, dispatched by the builder as `decivantiq` with `founder_authorized_sha` `d4a75ef80efed0abe57d6556b02afb2c9ac2040c` and `tranche_id` `0008_runtime_operational_grants` | GitHub API |
| 16:20:23Z to 16:20:26Z | P1 `preflight` passes: input shape valid, SHA match | GitHub API |
| 16:20:36Z | P1 `waiting`; its pending deployment lists reviewers `decivantiq` and `daley40-lab`, `wait_timer` 0, and `current_user_can_approve` false for `decivantiq` | GitHub API |
| 16:20:46Z | P2, run 37808049907, dispatched by the builder with the same inputs | GitHub API |
| 16:21:17Z | P2 `pending` with no job started, held by the concurrency group `pr2b-admin-migration` while P1 waits; P1 still `waiting` | GitHub API |
| 16:21Z | the builder asks the Founder to reject P1 as `daley40-lab` (step c) | session |
| about 16:23Z | **P1 approved** by `daley40-lab`; its `migrate` job runs 16:23:23Z to 16:23:42Z, every step succeeding, the apply step a recorded no-op | GitHub API, job log |
| 16:23:45Z to 16:23:48Z | P2 released by the group: `preflight` passes; `migrate` `waiting`; its pending deployment again says `current_user_can_approve` false for `decivantiq` | GitHub API |
| 16:24:08Z | the Founder: "it shows approved..." | session |
| 16:24Z to 16:25Z | the builder's reads: P1 complete and `success`, one approval record, `approved` by `daley40-lab`; production unchanged (below) | GitHub API, Neon |
| 16:26Z | the builder reports the ABORT case, recommends continuing with P2's rejection, and gives the reject instruction naming the grey Reject button | session |
| 17:15:42Z | the Founder: "rejected P2 and how do we continue" | session |
| 19:15:31Z | the builder's read: P2 still `waiting`, no approval record, one pending deployment; the rejection had not registered. The builder asks for the account to be checked and the rejection repeated | GitHub API; session |
| 19:59:32Z to 19:59:56Z | **P2 approved** by `daley40-lab`; its `migrate` job runs, every step succeeding, the apply step a recorded no-op | GitHub API |
| 20:23:43Z | the Founder: "Green check mark on migrate" | session |
| 20:23:56Z to 20:24:59Z | the builder's reads: P2 complete and `success`, one approval record, `approved` by `daley40-lab`, no pending deployment; production unchanged | GitHub API, Neon |
| 20:26Z | the builder's report and the acceptance draft, with the choice to accept or stop | session |
| 20:27:56Z | acceptance posted | session |

## Production, as read by the builder

| Read at (database clock) | `schema_migrations` | `0008` `applied_at` | journal | sessions |
|---|---|---|---|---|
| 16:20:04Z (step a) | 0001 to 0008 | not read | not read | `br_app_runtime` 2; builder's read 1 |
| 16:25:03Z (after P1) | 0001 to 0008, eight rows | `2026-10-04T21:08:29.242754Z` | 0 rows | `br_app_runtime` 2, newest 14:37:33Z; builder's read 1 |
| 20:24:59Z (after P2) | 0001 to 0008, eight rows | `2026-10-04T21:08:29.242Z` | 0 rows | `br_app_runtime` 2, newest 14:37:33Z; builder's read 1 |

Neither approved run changed production: no row was added, `0008`'s
`applied_at` is unchanged, and no `neondb_owner` session from a GitHub
runner was present at either read (the runner's connection had ended by
then). The runner records re-selection of an applied migration as a
no-op success (`packages/control-plane/src/migrate-cli.ts`, rule 5).
`main` stayed at `d4a75ef8` throughout (read at 16:19:52Z, 19:15:30Z
and 20:23:56Z).

## What the runs showed, against the act's three checks

- **PC-27, overlapping dispatches queue.** P2 sat `pending` with no job
  while P1 waited; neither dispatch cancelled the other; P2's
  `preflight` started at 16:23:45Z, after P1 completed at 16:23:42Z.
  Observed.
- **PC-28, the dispatcher cannot approve.** Both pending-deployment
  records denied approval to `decivantiq`, the dispatching account
  (`current_user_can_approve` false, read at 16:20:36Z and 16:23:48Z),
  and each approval is recorded under `daley40-lab`, the
  non-dispatching account. Observed, in both halves.
- **PC-23, an unapproved run cannot read the secret.** P2's `migrate`
  job ran no step from 16:23:47Z until its approval at 19:59:32Z, so
  the secret was in no step's environment while the run was
  unapproved. The rejected state, which the act planned, was not
  exercised. The acceptance records this as observed in the held state
  only and accepts it as sufficient; what held the job was the
  environment's approval gate, which does not depend on whether a
  reviewer later approves or rejects.

With these, the acceptance rules r6 section 15 condition 4 observed:
PC-23 (held state), PC-25, PC-26, PC-27, PC-28, PC-29 and PC-30.

## Departures and findings

1. **Both runs were approved, not rejected.** The act said "I then
   reject both deployments as daley40-lab" and "Neither run is to be
   approved", and its ABORT clause names an approval as a stop. P1 was
   approved at about 16:23Z and P2 at about 19:59Z, each after the
   builder's instruction named the grey Reject button and warned
   against the green Approve button. The Founder states each time he
   meant to reject. The acceptance records both as a departure. The
   act's own fallback, that an approved run re-selecting the applied
   `0008` is a recorded no-op, is what kept production unchanged; Gate
   VI has no such fallback.
2. **The ABORT clause was applied twice, and the Founder continued.**
   After P1's approval the builder reported the stop case and
   recommended continuing with P2's rejection; the Founder continued.
   After P2's approval the builder put the choice to accept or stop;
   the Founder accepted.
3. **The first reported rejection of P2 had not happened.** At
   17:15:42Z the Founder reported P2 rejected; at 19:15:31Z GitHub
   showed it still waiting with no review record. The builder cannot
   tell what was clicked; its guesses (the dialog on P1's page, a
   closed dialog, or the `decivantiq` session) are guesses.
4. **PC-23 is observed in the held state only.** See above. A later
   act may exercise the rejected state; nothing here requires it.
5. **The secret reached two approved runs.** In each, the apply step
   received `MIGRATE_ADMIN_DATABASE_URL` masked, under a reviewer's
   approval recorded by the platform. That is the environment working
   as designed, and the same as the three Gate IV runs; it is recorded
   because the act did not intend it.
6. **Review-bot credentials sit at repository scope.** The Founder's
   read lists four repository secrets for the Claude and Gemini
   reviewer apps and a Claude token at repository and organization
   scope. By name none is an administrative or approval-capable
   credential; by name is all the read can show. The advisory review
   workflows that use them have been disabled since 2026-09-21. Their
   removal or retention is the Founder's, outside this act.
7. **The builder's container clock drifted.** Its `date` read 17:15:56Z
   when GitHub's server time was 19:15:31Z; the receipt's times for
   that read use GitHub's clock. Earlier and later reads agreed with
   the database clock to within seconds.

## What the builder verified and what it did not

- Verified against live systems, read-only: `main`'s tip and the
  workflow blob (git); the runs, jobs, steps, approvals and pending
  deployments (GitHub API); P1's `migrate` job log (GitHub API);
  `schema_migrations`, the journal and sessions (Neon `run_sql` as
  `neondb_owner`).
- Dispatched by the builder, under the act: P1 and P2, through the
  GitHub API as `decivantiq`. The builder approved or rejected nothing
  and holds no credential that can.
- On the Founder's word: the environment read's output (pasted by him;
  the builder cannot make that read); that he meant to reject each
  time; that he acted as `daley40-lab` (the approval records name that
  account).
- Not read by the builder: the environment, its secret or the
  repository and organization secret lists (403); any secret value;
  P2's `migrate` job log and both runs' Summary pages.

## What this landing does not do

- It edits no code, no workflow and no other custody file. It touches
  `README.md` only to record step 13 and point at this receipt, and to
  restate what is not done.
- It authorizes nothing: no Gate VI, no migration, no change to the
  environment, its reviewers or its secret, no change to any repository
  or organization secret, no deploy, no merge.

## Provenance and transport

| Step | Identity |
|---|---|
| Act and acceptance drafted | the `builder` seat, in session, after the Founder's "1 and 2" (16:16:03Z) |
| Act and acceptance posted | the Founder, in session, at 16:19:29Z and 20:27:56Z |
| Environment read | the Founder, in his own terminal as `decivantiq`, 16:16:57Z to 16:16:59Z |
| Dispatches | the builder session, through the GitHub API as `decivantiq`, 16:20:17Z and 16:20:46Z |
| Approvals | `daley40-lab`, on the run pages, recorded by the platform |
| Reads | the builder session, read-only, through the GitHub and Neon APIs and Neon `run_sql` as `neondb_owner` |
| Transport | files written by the builder from the session texts as recorded in the session transcript, each ending with a single LF; pins above computed by the builder over the landed files |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: the act's CUSTODY clause (posted
2026-10-08T16:19:29Z) and the acceptance (20:27:56Z). Merge is a separate
exact-SHA Founder act under DEC-20260718-04; this receipt asserts none.
