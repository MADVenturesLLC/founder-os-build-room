FOUNDER-ACT-20261027-BUILDROOM-PHASE4-ONE-SHOT-BUILD: the Phase 4 single-run build to the stop gate

> **Status:** ISSUED — signed by the Founder 2026-10-27. See `## Founder Signature`.
> **Repository:** `MADVenturesLLC/founder-os-build-room`
> **`origin/main` when drafted:** `ef25da8e79dde59f7390911f426955032783f2d2`
> **Binding base:** the `origin/main` commit the builder prompt names, which must contain this act **and** the merge of pull request 131
> **Read with:** `AGENTS.md`; `docs/phase4-stop-gate-test-map.md`; `docs/command-journal-contract.md` §10; FounderOS `DEC-20260815-17` §7 (the Phase 4 authorization and stop gate), `DEC-20260815-08`; `FOUNDER-RULING-20261026-BR-PLANNER-EXECUTOR` and its Amendments 1 to 5; `DEC-20261020-01` clauses 3 to 5

I, Michael Daley, Founder of MAD Ventures, rule as follows.

## Part A: Basis

A1. **What this act can and cannot hand over.** `docs/phase4-stop-gate-test-map.md` states, verbatim:

> Items 11 to 13 (repository gates, exact-head Tier-2, three counted runs) bind the pull request and the runs, not tests, and are not mapped.

and, in its own header:

> Phase 4 closes only through a separate Founder stop-gate ruling after the Founder reviews the evidence (§7); this map is an index to some of it.

So the *body* of Phase 4 is test-evidenced and can be driven to completion by one agent. **Items 11 to 13 cannot**: two counted-run sequences and an exact-head Tier-2 are acts and executions, not code. This act authorizes the body and reserves the gate.

A2. **Precondition.** Pull request 131 (the Planner's `agy` executor) is open and is not part of this build. Its merge must be in the binding base before the build starts. If 131 has not merged, this act authorizes nothing and the build does not start.

A3. **What was checked.** The drafting assistant read, at the commit in the header: `docs/phase4-stop-gate-test-map.md` in full (labels 1 to 10, the §12-a to §12-d, §2-a, §2-b and §5.3 rows, the unmapped-items note), `docs/command-journal-contract.md` §10's row count, `AGENTS.md`, and the repository's CI job list. It ran no test.

A4. **The drafting assistant.** It drafted this act. That is not an independent review.

## Part B: Founder rulings

B1. **One run, one branch, one pull request.** This act authorizes the Phase 4 body — every label in `docs/phase4-stop-gate-test-map.md` from 1 to 10, together with the §12-a to §12-d, §2-a, §2-b and §5.3 rows — as **one continuous build** on branch `build/phase4-stop-gate`, delivered as **one pull request**, reviewed once at its final head. It does not authorize items 11 to 13.

B2. **The draft PR opens on day one**, so CI runs on every push. A draft pull request is not an authorization to merge.

B3. **Who pushes.** The builder may push **only** to `build/phase4-stop-gate`. It may not push to `main`, open or merge a pull request, post a comment, or run any `gh` command. Opening the draft pull request and posting the final review are the operator's acts.

B4. **Machine gates run inside the loop.** The default suite (`npm test`), the storage suites (`npm run test:storage`, `npm run test:storage:runtime-role`), typecheck, the served-model check and the map's own integrity test (`test/phase4-stop-gate-map.test.ts`) run as the build proceeds. A red gate stops that work item, not the build.

B5. **The map is the contract, not the plan.** Where `docs/phase4-stop-gate-test-map.md`, `docs/command-journal-contract.md` §10 and `DEC-20260815-17` §7 differ, the map's own header governs: the stop gate and the contract win. The build may not weaken a cited test's assertion to make it pass; a test whose title no longer matches its cited line is a B6 item 3 halt.

B6. **What must still stop.** Closed and exhaustive. The build halts and returns to the Founder when, and only when:

1. **Governing text conflicts** — the map, the contract and the Phase 4 authorization disagree on what a label means.
2. **A stop-gate label cannot be evidenced by a test** without changing the contract or the gate's meaning.
3. **Scope would expand** beyond the journal, planner and stop-gate surfaces this phase owns — a new dependency, a schema change outside the contract's rows, or any change to `docs/phase4-stop-gate-test-map.md` itself.
4. **A credential, spend, provisioning, deployment, migration or security-posture act is required**, including any application of a migration through the protected environment `db-admin-migration`.
5. **A Gateway, Neon or Railway live dependency is required to make a test pass.** The storage suites may run against a local Postgres the CI job provides; they may not reach production.
6. **A Tier-2 verdict is FAIL** and the finding cannot be remedied inside the single correction round of B8.

Everything else proceeds.

B7. **One review at the end.** The build is reviewed once, by an independent Tier-2 reviewer on a surface other than the builder's, at the pull request's final exact head. The reviewer receives the build log of B9, the diff by file, and the command log — not a summary written by the builder.

B8. **One correction round**, then B6 item 6.

B9. **The build log is the record and the resume point.** The builder appends to `docs/verification/phase4-build-log.md` after every work item: label or contract row, base SHA, head SHA, commands with exit status, the test file and title that evidences it, deviations, and any halt with its B6 class. A build that dies resumes from this log.

B10. **The stop gate stays closed.** This act authorizes building to the gate, not through it. Phase 4 closes only by the separate Founder stop-gate ruling that `DEC-20260815-17` §7 requires, after the Founder reviews the evidence. Nothing here certifies Phase 4, activates anything, or authorizes a counted run.

B11. **Not authorized.** No item 11, 12 or 13. No counted run, no Gateway bring-up, no production deployment, no migration apply, no credential provisioning, no ruleset or required-check change. No merge.

## Part C: Stop contract

The build is complete — and only then does it report done — when all of the following hold at one head:

1. Every label 1 to 10 and every §12-a to §12-d, §2-a, §2-b and §5.3 row in `docs/phase4-stop-gate-test-map.md` is evidenced by the exact test title the map cites, in the exact file, and that test passes.
2. `test/phase4-stop-gate-map.test.ts` passes unmodified: every cited title still opens an `it(` in the cited file, the S/D marks still match, and the contract still has the 15 rows the map was built against.
3. The default suite and both storage suites pass with 0 fail at the final head.
4. No file outside the journal, planner and stop-gate surfaces is modified, apart from recorded Deviations.
5. The build log is complete and its counts match a live run.

A build that cannot meet every line reports which line it cannot meet and stops.

## Part D: Filing

D1. One docs-only pull request files this act. The build starts only after it merges and after pull request 131 merges.

## Part E: Signature

Signed by the Founder, date and identity to be completed at signature. This draft carries no authority until then. The drafting assistant may not sign it, post it as signed, or treat this file as effective.

## Founder Signature (2026-10-27)

**Signed, verbatim:** "signed and approved. open PR" — the Founder's instruction
in session on 2026-10-27, given in reply to the three acts presented together: this
one, `ISSUED-FOUNDER-ACT-20261027-M23-M26-ONE-SHOT-BUILD.md` and
`ISSUED-FOUNDER-ACT-20261027-MADMIK3-CLOSEOUT.md`.

**Bound identity.** The text signed is the draft as presented to him: file
SHA-256 `a771ee69c0de9f5198d780826ed7eb7d48b3598e3c2e0c844ea64fdcb59cbe8e`,
7434 bytes, 82 lines, `status: FOR SIGNATURE`. The file was renamed to the
`ISSUED-` prefix at signature; no clause was amended.

**What the instruction authorises.** "open PR" authorises filing this act through
its own pull request. It does not start the build: B2 requires pull request 131
merged into the binding base first, and B1 authorises the run only from that base.

**Mechanism.** Conveyed in session, not as a GitHub comment. This section is the
recording act, performed by `strategist` (Hermes agent) at the Founder's direction.
**The recorder does not sign.** This section records a ruling and creates no
authority of its own.

— Drafted for signature by `strategist` (Hermes agent), `hermes-local-code`, 2026-10-27, at the Founder's direction "i want the same for the buildroom, madmik3 as well".
