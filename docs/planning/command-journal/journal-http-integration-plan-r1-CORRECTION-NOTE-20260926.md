# Journal HTTP integration plan r1: correction note (2026-09-26)

**Status:** DRAFT correction note. Descriptive, not authoritative. It corrects
and supplements `journal-http-integration-plan-r1.md`, which this note leaves
unchanged. That file's bytes are left alone because its SHA-256
(`938611e0b5b5694bdf1b1313d9b5554453936b52ba3dd1243c869f82c20e1b12` at
`41de91d`) has already been quoted as a controlling input outside this
repository. Nothing here authorizes work, spend, provisioning, activation,
dispatch, or merge.

**Evidence base:** `founder-os-build-room` `main` at
`41de91d9a61b6c4453570370adff60dc005be32c` (the merge of PR #75), read
2026-09-26. The Railway and GitHub Actions observations below were read on the
same day and say so where they are used. Labels follow the plan's convention:
**[Certain]** read directly from code, git, a dated record, or a live read-only
check; **[Likely]** a strong inference; **[Guessing]** tentative.

**Paths named here that do not exist at the base.** The path audit excludes
`docs/planning/`, so these are listed rather than left to be discovered:

- `packages/control-plane/src/journal-append.ts` and
  `packages/control-plane/src/redaction-boundary.ts`. These are D-1's proposed
  B-N2 and B-N3. They were never created (see C1).
- `test/journal-redaction.storage.test.ts`, D-1's proposed B-T4. It was never
  created either.
- `.github/workflows/db-admin-migration.yml`. It exists only on the unmerged
  PR #76 branch.

Every other path below exists at `41de91d`.

---

## C1. §3 and §4 omitted a Founder ruling on this same write path

**r1 said:** §3 posed the caller design as a choice between two options. Option W
extends `packages/journal`. Option B adds a direct `packages/control-plane`
caller that supplies `packages/journal`'s canonical bytes to the landed
five-argument `command_journal_append`. §3.4 recommended Option B. Neither
section mentioned any prior ruling on the caller.

**Correction:** a Founder ruling on the caller already existed, and r1 should
have named it.

- The D-1 scope ruling of 2026-09-14,
  `docs/planning/command-journal/custody/FOUNDER-RULING-pr2b-D1-scope-amendment-20260914.txt`
  (SHA-256 `da1b3b5f7814f6cdfb623945028d12484e379f94997c768f42edb9885dff3e33`),
  conditionally accepted a different caller design. That design comes from
  `pr2b-implementation-plan-r1-addendum-02-r6.md` [Certain]:
  - B-N2 `packages/control-plane/src/journal-append.ts`, "the bounded append
    client", which "encodes nothing; imports nothing from `packages/journal`
    except types";
  - B-N3 `packages/control-plane/src/redaction-boundary.ts`;
  - B-T4, a redaction storage test;
  - a SQL-side encoder;
  - a three-argument routine: B-N2 executes
    `public.command_journal_append(class, fields, envelope)`.
- The ruling's own sentence 3 makes r6's signatures supersede FD-B5's delegated
  choice "for this D-1 scope amendment only." [Certain]
- Its acceptance was conditional: "on the governing Gate III instrument adopting
  r6 §2.3's interface and on B-M4 ... clearing plan r1 stop condition S4 ...
  Otherwise the caller is withdrawn." [Certain]
- PR #54, which landed Tranche B, names its operative issuance as the r3 draft
  act. r3 is dated 2026-09-13, the day before the ruling. PR #54 states:
  "Excluded: Addendum 02 / D-1 implementation scope (B-N2, B-N3, B-T4,
  redaction-custody revision)." [Certain]
- Migration `0006` landed with the FD-B5 interface: five arguments, with the
  caller supplying the bytes. [Certain]

**What this establishes, and what it does not:**

- [Likely] D-1 lapsed under its own "otherwise withdrawn" condition, since the
  instrument that governed what landed predates the ruling and D-1 scope was
  excluded.
- It is not [Certain]. PR #54 also cites a supplementary "Addendum-02
  disposition" ruling (msg 9052) whose text is not in this repository. This
  note has not read it.
- Whether D-1 is withdrawn, superseded, or revivable is therefore the Founder's
  to state, not this note's.

**Effect on r1's recommendation:** Option B remains the option that needs no
new migration and matches the routine that actually landed. But it is not a
choice made on a blank slate. Adopting it sets D-1's design aside for this
write path. Reviving D-1 instead would need a new migration, because D-1's
sentence 2 bars extending `0006`. Production cannot currently apply even the
migrations it already lacks (C2).

## C2. §2 P-1 understated what production is missing

**r1 said:** P-1: "migration `0006` is not applied to production Neon."

**Correction:** production lacks `0007_gate_runs` as well, and the gap already
stops the service from deploying. r1 was hashed at `524186f`, which already
contained `0007` from PR #74, and did not say so.

- [Certain] Checked read-only against Railway on 2026-09-26: project
  `compassionate-happiness`, service `rare-enjoyment`. The deployment of
  `41de91d` (id `e76c4212-a696-4f08-b2fa-eb338c7a53b4`) failed at boot at
  2026-09-26T20:03:32Z with:
  "schema preflight failed: required migration id(s) absent from
  schema_migrations: 0006_command_journal_authority_split, 0007_gate_runs —
  the runtime does not repair schema; the administrative plane must migrate
  this database before the runtime may serve".
- [Certain] The eight most recent deployments of that service, 2026-09-18
  through 2026-09-26, all have status `FAILED`. PR #73 recorded the last
  success as 2026-09-16, at `0edf260`; this note did not re-read that.
- [Certain] `packages/control-plane/src/migrate-cli.ts` applies exactly one
  migration per invocation and refuses when more than one unapplied migration
  precedes or equals the selector. Closing P-1 therefore takes two separate
  executions through the Tranche C plane, `0006` then `0007`, each needing its
  own Founder act naming SHA and migration.
- [Likely] No execution authorization for `0007` exists. This note found none
  in `docs/planning/command-journal/custody/` or in PR #74.

P-2 (Tranche D) is unchanged.

## C3. §5 did not name the redaction-boundary question

**r1 said:** §4.1 and §3.3 treated `packages/journal`'s pure exports as
sufficient for the production write path. §5 ("What this plan does not
decide") did not mention redaction.

**Correction:** where redaction is enforced on the production journal write
path is an open, named question in the code itself. r1 should have listed it.
[Certain]

- `packages/journal/src/envelope.ts`, lines 9–10: "Redaction enforcement
  belongs to the write path (2b and later); this module defines the canonical
  bytes only."
- `packages/journal/src/redact.ts`'s header says its guard is "the §6.1
  pre-write guard the stop-gate proofs need". It "does NOT replace, wrap, or
  reimplement" the `packages/redaction` `JournalAppendSink` boundary. It also
  says: "whoever is authorized to wire `JournalAppendSink` into the journal
  store must reconcile them rather than stack them. That reconciliation is a
  Founder act, not a refactor."
- `packages/redaction/README.md`: `JournalAppendSink` is "still not wired".
  Wiring it without a provisioned HMAC key "would make the journal write path
  refuse every write, a behaviour change no act has authorized."

The consequence for any Option B implementation: a route using only
`normalizeForJournal` and `containsCredentialMaterial` has the §6.1 pre-write
guard, not the write-path redaction boundary that `envelope.ts` assigns to it.
Whether that is acceptable for a first, non-live slice, or whether the
reconciliation and key custody (FD-3) must come first, is a Founder
disposition. This note does not make it.

## C4. Provenance: PR #75 merged without the repository's hosted checks having run

This does not correct r1's content. It corrects the record of how r1 reached
`main`.

- [Certain] Every GitHub Actions run in this repository from 2026-09-26T17:11:15Z
  onward concluded `startup_failure` under a synthetic, nameless workflow
  record (`path: BuildFailed`). That covers every push and `pull_request` run
  on PR #75's two commits (`da0a540`, `619289d`), the push of the merge commit
  `41de91d` to `main`, and Copilot's agent-review run. None of `ci.yml`,
  `path-audit.yml`, `attribution-shape.yml` or `custody-pin-check.yml` executed
  for PR #75 or its merge. The only check runs recorded on PR #75's head were
  Cursor Bugbot and Cursor Security Agent.
- The builder session that authored PR #75 (this note's author) read those
  failures as residue of a deleted workflow and advised the Founder that
  nothing was gating the merge. That reading was wrong.
- The Tranche C builder session reported, in its work on PR #76, that the
  failure is org-wide and began before 17:11Z. This note has verified only the
  repository-level fact above.
- Cause and response, added 2026-09-27. The Founder reported the
  organization's 2,000-minute Actions quota as exhausted ("my action minutes
  are used up 2k/2k") and made this repository public. [Certain] Its
  visibility read back as `public` through the GitHub API at
  2026-09-27T02:35Z, with the repository last updated at 02:26:03Z. The
  startup-failure runs cannot be retried: GitHub answers 403, "This workflow
  run cannot be retried". So whether hosted checks run again is shown by the
  runs on the commit that adds this bullet, not by this note.
- Local substitutes that did run:
  - before merge, at PR #75's heads: `gate:path-audit`, `gate:secret-scan`,
    `gate:custody-pin-check`, `gate:attribution-selftest`, and
    `attribution-shape-check.sh pr` mode — all PASS;
  - after merge, on 2026-09-26: `attribution-shape-check.sh main 41de91d...`
    PASS and `gate:path-audit` PASS at `41de91d`.

  These are local runs of the same scripts. They are not the hosted checks.
- `AGENTS.md` lists "Merging to main without required CI checks" as an approval
  gate. Whether this merge needs a retroactive disposition is the Founder's
  call.

---

## Not corrected here

This note makes only the four corrections above. It does not edit r1. It does
not revisit r1's hashes, its §1 scope, or §4.2's two hazards, which remain
accurate. It rules on none of D-1, FD-3, the redaction reconciliation, or the
execution of `0006`/`0007`. PR 2b `FD-2` is not open: FounderOS
`DEC-20260917-01`, ratified 2026-09-18 (decision-log v4.67), discharged it.
An earlier revision of this sentence listed it among the open items.
