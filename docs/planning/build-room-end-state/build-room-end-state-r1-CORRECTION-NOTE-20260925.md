# Build Room End State r1: correction note (2026-09-25)

**Status:** DRAFT correction note. Descriptive, not authoritative. It corrects
three claims in `build-room-end-state-r1.md`, which this note leaves
unchanged. Nothing here authorizes work, spend, provisioning, activation, or
merge.

**Evidence base:** `founder-os-build-room` `main` at
`57fbceabf448da5e64ff1183b44c4ae1e6da7d65` (2026-09-24), read 2026-09-25.
Labels follow r1's convention: **[Certain]** read directly from code, git, or
a dated record; **[Likely]** a strong inference; **[Guessing]** tentative.

**Paths named here that do not exist at the base** (required for files under
`docs/planning/`, which the path audit excludes): none. Every path below
exists at `57fbcea`.

---

## C1. §2 "What is live": the journal tables

**r1 said:** the deployed control plane runs "the ledger, gateway registry,
Phase 3 run routes and the journal tables" [Certain].

**Correction:** the journal tables are **not live**. Migration `0006` has not been
applied to production Neon. **Source:** the Founder, stating it in session on
2026-09-25 for this correction. This note did not query Neon itself. The
deployed control plane therefore has no `command_journal_events`,
`command_journal_chain_head`, or `command_journal_append` in production.

**Why the label was wrong.** The r1 claim rested on migration `0006` being
merged, and merging defines a migration. It does not apply one. What `main`
proves is narrower:

- Migration `0006_command_journal_authority_split` is defined in
  `packages/control-plane/src/migrations.ts` and is applied only by the
  one-shot admin runner `packages/control-plane/src/migrate-cli.ts` (PR #54).
  The service does not run DDL at boot (PR #27) [Certain].
- No production TypeScript code calls `command_journal_append`. Only the
  storage tests invoke it [Certain]. So even where the tables exist, nothing
  in the deployed service writes to them.

**A cross-check the Founder may want to run.** The boot preflight in
`packages/control-plane/src/schema-preflight.ts` requires every id in
`MIGRATIONS`, and that list includes `0006` (`REQUIRED_MIGRATION_IDS`). Any
control-plane revision at or after PR #54 therefore exits at boot unless
`0006` is recorded in production `schema_migrations` [Certain, from code].
With `0006` unapplied, the deployed service must be running a revision older
than PR #54, or it is failing to boot [Likely]. This note did not check which
revision Railway is running. That check is worth doing before anyone reads
"Phase 2 control plane live" as "current `main` live".

## C2. §8 "Custody": `br_app_runtime` at boot

**r1 said:** database administration is split from runtime by role, with
"`br_app_runtime` at boot with a read-only preflight" [Certain, migration
`0006`].

**Correction:** migration `0006` creates the `br_app_runtime` role and its
grants. It does not move the service onto that role. The runtime cutover
(changing Railway's `DATABASE_URL` to the `br_app_runtime` identity) is
Tranche D, and Tranche D is not done [Certain]. The code shows this directly:

- `packages/control-plane/src/schema-preflight.ts` declares
  `export type PrivilegeAuditStatus = 'pending_cutover';` and has no other
  value. The privilege audit only detects and reports. It never blocks boot.
- `packages/control-plane/src/main.ts` states that the audit "must not block
  boot while the documented owner-class runtime is in use", and that it
  becomes a hard failure only after the Tranche D cutover.

The read-only preflight part of r1's claim holds (PR #27). The part about
`br_app_runtime` at boot describes the planned Tranche D end state, not the
current one. This note did not check which identity the deployed
`DATABASE_URL` actually carries, so it makes no claim about it.

## C3. §11 Phase 4 "Missing": storage integration suite

**r1 said:** the Phase 4 "Missing" column lists "storage integration suite".

**Correction:** the journal storage integration suite exists on `main`
[Certain]:

- `test/journal-authority.storage.test.ts`
- `test/journal-append-atomicity.storage.test.ts`

Both came in with PR #54. They run against a real Postgres through
`npm run test:storage`, and CI's `storage-integration` job runs them (see
`.github/workflows/ci.yml`). They exercise migration `0006` and
`command_journal_append` directly. They do not prove a production caller,
because none exists (C1).

The rest of that §11 row is unchanged by this note: the HTTP journal route,
the governed loop, and the plan-decision endpoint remain listed as missing.

---

## Not corrected here

This note makes only the three corrections above. It does not revisit r1's
evidence pins or the rest of §2, §8, or §11. It also does not edit
`build-room-end-state-r1.md`.
