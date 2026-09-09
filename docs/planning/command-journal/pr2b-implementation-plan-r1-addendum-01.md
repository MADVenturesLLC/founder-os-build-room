# PR 2b — Implementation Plan r1, Addendum 01 (FD-1 Base Disposition and Main-Base Rebind)

Status: **IMPLEMENTATION-PLAN-READY at the Founder-selected implementation base.
NO IMPLEMENTATION AUTHORITY IS CREATED, IMPLIED, OR CARRIED BY THIS ARTIFACT.**

This artifact creates no code, test, PostgreSQL role, credential, token,
permission, GitHub environment, GitHub secret, repository setting, Railway
service, Railway variable, Neon object, migration, branch, commit, or PR.

Work ID: `BR-PR2B-IMPL-PLAN-R1-A01`
Seat: `br-architect` (Plan Authority; no approval, build, operate, merge,
release, or risk-acceptance authority)
Amends: nothing. **Implementation-plan r1 is preserved byte-for-byte unchanged**
as historical evidence of the base-drift finding.
Next role: **Founder — Gate I (plan approval), then Gate II.**

---

## 0. Predecessor and controlling stack

| Artifact | Resolved path | SHA-256 | Verified |
|---|---|---|---|
| **Predecessor plan (r1), unmodified** | `/Users/michaeldaley/MADVenturesOPs/founder-os-build-room/docs/planning/command-journal/pr2b-implementation-plan-r1.md` | `08f3ea7418db7052ffd7fb4cf6df4672f169c95933a7c07c71ef637ae775b3ce` | **re-hashed after this rebind, MATCHES the binding header — r1 was not overwritten** (67,849 bytes, 974 lines) |
| Controlling architecture (r6, frozen) | `/Users/michaeldaley/MADVenturesOPs/founder-os-build-room/docs/planning/command-journal/pr2b-storage-architecture-r6.md` | `658daa9c0194d5f56d7506fb8ade05d24d413cd08b106a067ff9100ce5815954` | **MATCHES** |
| Journal contract v0.17 (S2 subject) | `docs/command-journal-contract.md` **at commit `6d6110d…`** | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` | **MATCHES — S2 NOT TRIGGERED at the selected base** |
| r1 provenance receipt (untouched) | `/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/PROVENANCE-br-architect-pr2b-implementation-plan-r1-20260905.md` | `efa6e7ea539bfd55cf7eb6d0f31e21b11851e6254fad08bc7a5634ad95e0f1f5` | not modified by this act |

r1 remains the authoritative plan body. This addendum changes **no** plan
content. It records the Founder's FD-1 ruling, the rebind evidence, and the
resulting status.

---

## 1. FD-1 — Founder disposition, recorded

`FD-1 — CLOSED BY FOUNDER`

**Selected implementation base:** `6d6110d41e65f7484a167d499141c639e6e403c2`

**Not selected:** `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`

**Founder's stated reason, carried:** PR 2b will begin from current governed
`main`, not from the divergent Prerequisite-C implementation line. The
unselected base belongs to the separate Prerequisite-C C2 broker/ledger-worker
line and must not become an implicit dependency of PR 2b.

**Scope limits carried verbatim in substance:** this ruling creates no authority
over Prerequisite C and creates no dependency from PR 2b upon that branch. PR 2b
must be planned and eventually implemented from the selected `main` ancestry
unless a later Founder act explicitly changes the base.

**Consequent supersession inside r1.** r1 §18 returned
`FOUNDER_DECISION_REQUIRED` for one reason only — FD-1. That reason is now
discharged. r1 §12's FD-1 row and r1 §10's row 3 ("Implementation base Git SHA:
**UNRESOLVED — FD-1**") are superseded by this section and read as
`6d6110d41e65f7484a167d499141c639e6e403c2`. No other r1 text is affected.

---

## 2. Base identity verification

| Check | Observed |
|---|---|
| Selected SHA resolves to a commit | `git cat-file -t` → `commit` |
| Full 40-hex identity | `6d6110d41e65f7484a167d499141c639e6e403c2` |
| Is it current `origin/main`? | **YES** — `git rev-parse origin/main` returns exactly this SHA |
| Tree hash at that commit | `faffbbb80e2d8d57d688cf9fc83502ec3281bef0` |
| Commit date | `2026-09-04 20:58:57 -0400` |
| Subject | `feat(seat-registry): V1.1 non-activating control-plane policy gate (unwired) (#23)` |

**Verification method.** A **disposable, detached, non-authoritative worktree**
was created at `/tmp/pr2b-rebind-6d6110d` via `git worktree add --detach`. It
carries no branch (`git symbolic-ref -q HEAD` returns nothing). Every check in
§3 was executed inside that clean view of the exact commit, not against the
session's own checkout, which remains at the unselected base. Disposition of the
worktree is recorded at §7.

---

## 3. Rebind verification at `6d6110d…`

Compatibility is **not** inferred from the earlier round's byte-identical
finding. Every path below was re-resolved to its blob at the selected commit and
every line-anchored claim in r1 was re-read from that commit's content.

### 3.1 Blob evidence at the selected base

| r1 reference | Path | Blob at `6d6110d…` | vs unselected base |
|---|---|---|---|
| A-M1 | `packages/control-plane/src/main.ts` | `a1c4319bb95a3be98782a73bd2654fb8c44607d4` | identical |
| B-M1, IF-1, IF-2 | `packages/control-plane/src/migrations.ts` | `da633c01f9c57105e9a1f7bb7445da6cdb42ff15` | identical |
| A-M3 | `packages/control-plane/src/db.ts` | `7fa0da937276ed25819aa7867d011c8f85642189` | identical |
| §4.1 context | `packages/control-plane/src/config.ts` | `9b6f634a5b566eaf5592ee2cdf36f932dea17a5e` | identical |
| **A-M2** | **`packages/control-plane/src/index.ts`** | **`ed1711f7374bccf468c9cc49cb72946bf201e95e`** | **DIFFERS — see §4.1** |
| D-F1 | `railway.toml` | `5980ce064e10c1fffbb288c7772752ab69ab2e57` | identical |
| **B-M2, A-M4** | **`package.json`** | **`c7bc8ab1788a0ea90d7aaacade862bcc30f656ef`** | **DIFFERS — see §4.2** |
| **B-M3, PO-4** | **`tsconfig.json`** | **`0a1721ecabdc53b00c3d174bba75f63af72ddd49`** | **DIFFERS — see §4.3** |
| B-M4, PO-1 | `.github/workflows/ci.yml` | `7e485bdf3764cf003909a0082264166e5f168cde` | identical |
| PC-30 scope | `.github/workflows/path-audit.yml` | `4d794620b5407d03ea581f00dab07f9aed9d5cb0` | identical |
| PC-30 scope | `.github/workflows/attribution-shape.yml` | `4efbfd8dd092adcc457e5a8d14311bbbe36b3374` | not previously compared; no r1 change proposed |
| PC-30 scope | `.github/workflows/claude-code-review.yml` | `362dcd19e37389c93784a5c8cff894e679ed2e46` | not previously compared; no r1 change proposed |
| §4.7 | `scripts/path-audit.sh` | `d8997db0dc0faf5c8833a49a373a3e8e615c1a52` | identical |
| I-3, S2 | `docs/command-journal-contract.md` | `f982b3d3cf94be0b682dde36fe292c5f60d2b0ef` | identical |
| §4.2.1 genesis | `packages/journal/src/chain.ts` | `a27bc2305f7f156e83d31f78fc1b7065c2b5fc48` | identical |
| journal surface | `packages/journal/src/index.ts` | `71cafa9e42f764b78cb06595faed19b604f4054f` | identical |
| §5 harness | `test/support/require-test-database-url.ts` | `8b937851c412b9922c83fce97a378b7bd3a5493e` | identical |
| IF-3 | `test/control-plane-postgres.storage.test.ts` | `29712cc4a371bcaa129696dffaf07aa80e8e9a21` | identical |
| IF-3 | `test/gateway-storage-helpers.ts` | `bb22df08205364624db0fee7f39127f38c86304f` | identical |
| IF-3 | `test/gateway-registry-immutability.storage.test.ts` | `4550614226dd2c6d1ad537c0f65556eb2fb4b798` | identical |
| §4.2 context | `test/phase3-run-events.storage.test.ts` | `8b6e1cafdfad315103cdd610272c1078741bb4d4` | identical |

### 3.2 Line-anchored claims, re-read at the selected commit

Every r1 citation that names a line number was re-read from `6d6110d…` content.
All hold exactly.

| r1 claim | Re-read result at `6d6110d…` |
|---|---|
| `main.ts:4–11` documents boot order `config → pool → migrate → listen` | **CONFIRMED** — line 4 `Order matters and is fail-closed throughout:`, line 6 `config → pool → migrate → listen` |
| `main.ts:22` `import { migrate } from './migrations.js';` | **CONFIRMED**, exact |
| `main.ts:39` `const migration = await migrate(pool);` | **CONFIRMED**, exact |
| `main.ts:40–43` the `boot.migrated` log | **CONFIRMED**, exact |
| `db.ts:90–93` states "The schema is proved at boot by the migrator" | **CONFIRMED** — the false-after-Tranche-A sentence sits at lines 90–91 inside the `probe()` doc comment |
| `migrations.ts:39` "Never edit a shipped migration — add another." | **CONFIRMED**, exact |
| `migrations.ts:42` `export const MIGRATIONS` | **CONFIRMED**, exact |
| `migrations.ts:478` id `0005_phase3_run_evidence` | **CONFIRMED**, exact |
| `migrations.ts:1362` `export async function migrate(pool: Pool)` | **CONFIRMED**, exact; sole definition |
| `migrations.ts:1402` bootstrap `CREATE TABLE IF NOT EXISTS schema_migrations` | **CONFIRMED**, exact |
| `migrations.ts:1411` `for (const migration of MIGRATIONS)` — the whole-array loop behind IF-2 | **CONFIRMED**, exact |
| `migrations.ts:1416–1422` per-migration `BEGIN` … `COMMIT` | **CONFIRMED** — supplies §6.2's single-transaction property |
| `migrations.ts:1438` guarded `ROLLBACK` | **CONFIRMED**, exact |
| `railway.toml:66` `healthcheckPath = "/health"` | **CONFIRMED**, exact |
| `railway.toml:73` `restartPolicyType = "ON_FAILURE"` | **CONFIRMED**, exact |
| `railway.toml:74` `restartPolicyMaxRetries = 3` | **CONFIRMED**, exact |
| `chain.ts:17` `GENESIS_CHAIN_HASH = '0'.repeat(64)` | **CONFIRMED**, exact — the §4.2.1 genesis binding holds |
| `ci.yml:73` `storage-integration:` job | **CONFIRMED**, exact |
| **IF-1** — `migrate()` has exactly one production call site | **CONFIRMED** — `main.ts:39` only |
| **IF-3** — four test call sites invoke `migrate()` directly | **CONFIRMED** — `control-plane-postgres.storage.test.ts:71`, `:81`, `gateway-registry-immutability.storage.test.ts:71`, `gateway-storage-helpers.ts:116` |
| Current migration numbering: `0001`–`0005`, `0006` free | **CONFIRMED** — five ids, `0006_command_journal_authority_split` collides with nothing |
| `.github/workflows/` contains exactly four workflows | **CONFIRMED** — `attribution-shape.yml`, `ci.yml`, `claude-code-review.yml`, `path-audit.yml`. `db-admin-migration.yml` absent |

### 3.3 New-file collision check at the selected base

Every path r1 proposes to create was tested for existence at `6d6110d…`.

| Proposed new file | Result |
|---|---|
| `packages/control-plane/src/schema-preflight.ts` | **free** |
| `packages/control-plane/src/migrate-cli.ts` | **free** |
| `.github/workflows/db-admin-migration.yml` | **free** |
| `test/schema-preflight.storage.test.ts` | **free** |
| `test/boot-no-ddl.storage.test.ts` | **free** |
| `test/journal-authority.storage.test.ts` | **free** |
| `test/journal-append-atomicity.storage.test.ts` | **free** |
| `test/migrate-cli.test.ts` | **free** |
| `test/admin-workflow-shape.test.ts` | **free** |
| `docs/planning/command-journal/pr2b-qualification-evidence.md` | **free** |

**Zero collisions.**

### 3.4 Insertion points and configuration assumptions

| Assumption | Verified at `6d6110d…` |
|---|---|
| Export insertion point (A-M2) | `index.ts:17` is `export { migrate, MIGRATIONS, type Migration, type MigrationResult } from './migrations.js';` — **unchanged and still line 17** |
| Test-script insertion point (B-M2) | `package.json` `scripts` block spans lines 14–32; `"start": "node dist/packages/control-plane/src/main.js"` at line 24 supplies the compiled-output pattern `migrate:admin` follows |
| TypeScript include coverage (PO-4) | `tsconfig.json:19` includes `packages/control-plane/src/**/*.ts`; `:24` includes `test/**/*.ts`. Both new source files and all new tests are **already covered by the existing globs** |
| Storage-suite discovery | `test:storage` globs `dist/test/*.storage.test.js`; the four new `*.storage.test.ts` files are picked up with no script change |
| Plain-suite discovery | `test` globs `dist/test/*.test.js`; `migrate-cli.test.ts` and `admin-workflow-shape.test.ts` are picked up with no script change |
| CI database identity (PO-1) | `ci.yml:78` `image: postgres:16`, `:80` `POSTGRES_PASSWORD: postgres`, `:113`/`:123` connect as user `postgres` — **a superuser**. PO-1 stands exactly as r1 stated it |
| Path-audit scope | `scripts/path-audit.sh:51` prunes `./docs/planning` — plan artifacts under `docs/planning/command-journal/` are out of audit scope; no audit change is provoked by this addendum or by r1 |

---

## 4. Changed assumptions

Three r1 assumptions are affected by the base selection. **None is material.
None requires a plan change.** Each is recorded because the Founder's rebind
instruction forbids inferring compatibility from the earlier comparison.

### 4.1 `packages/control-plane/src/index.ts` differs — and r1 never compared it

**This is a genuine gap in r1's own §1.3 evidence table.** r1 listed
`index.ts` as changed path A-M2, but omitted it from the byte-identity table,
so r1's claim that "every r1 surface is byte-identical at both bases" was
**over-stated by one file**. Recorded plainly rather than glossed.

Measured effect: at the selected base `index.ts` carries an **additional export
block at lines 27–47** re-exporting `createSeatPolicyGate`,
`DISPATCH_AT_MOST_ONCE`, `DISPATCH_PATH_OBLIGATIONS`, `DISPATCH_POLICY`,
`MP1_STATEMENT`, and thirteen seat-policy types from `./seat-policy.js`, a module
that exists at the selected base and does not exist at the unselected one.

Effect on the plan: **none.** A-M2's insertion point is line 17, which is
unchanged, and A-M2 appends an export rather than editing an existing one. The
seat-policy block is `DEC`-authorized non-activating work with no journal,
migration, role, or boot-path surface. It neither conflicts with nor is consumed
by any tranche.

**Verdict: NOT MATERIAL. A-M2 stands as written.**

### 4.2 `package.json` differs — the selected base lacks `test:prereq-c`

Measured delta: the unselected base adds one script line,
`"test:prereq-c": "npm run build && node dist/test/support/require-prereq-c-runtime.js && node --test dist/test/*.prereq-c.storage.test.js"`. The selected base does not have it.

Effect on the plan: **none, and mildly favorable.** B-M2 adds `migrate:admin` to
the same `scripts` block. At the selected base that block contains no
Prerequisite-C entry, so the Builder's diff touches only PR 2b's own line — which
is exactly the isolation the Founder's ruling intends. The `"start"` pattern
B-M2 follows is present and unchanged at line 24.

**Verdict: NOT MATERIAL. B-M2 stands as written.**

### 4.3 `tsconfig.json` differs — and this **closes PO-4**

Measured delta: the unselected base adds one include glob,
`"packages/worker-supervisor/src/**/*.ts"`. The selected base does not have it.

Effect on the plan: **PO-4 is resolved in the negative.** PO-4 asked whether
`tsconfig.json` needs a change for the new source file B-N1. It does not:
line 19's `packages/control-plane/src/**/*.ts` already covers both
`schema-preflight.ts` and `migrate-cli.ts`, and line 24's `test/**/*.ts` covers
every new test. **B-M3 is therefore expected to be a no-op and
`tsconfig.json` should be treated as out of scope for Tranches A and B** unless
the Builder discovers a concrete need, in which case it returns for a scope
decision rather than editing silently.

**Verdict: NOT MATERIAL. PO-4 CLOSED — no `tsconfig.json` change required.**

### 4.4 Files present at the selected base that are absent at the unselected one

`packages/control-plane/src/seat-policy.ts`,
`test/seat-registry-integration.test.ts`,
`test/seat-registry-integration-static.test.ts`, and two
`docs/planning/seat-registry-v1/` documents exist at the selected base. None is
an r1 surface, none is in any tranche's file map, and all are covered by r1
§4.7's prohibition on touching paths outside the enumerated maps.

Conversely, the Prerequisite-C and Phase-0 additions carried only by the
unselected base (`packages/worker-supervisor/**`, six `test/phase0-*.test.ts`,
three `test/support/*` helpers, `test/worker-supervisor.prereq-c.storage.test.ts`,
two `docs/planning/room-runtime-phase0/` documents) are **absent** from the
selected base. This is the intended effect of the ruling: PR 2b acquires no
dependency on that line.

---

## 5. Plan-content preservation test

The Founder directed me to test r1's assertion that its tranche design does not
change under either candidate base, and to preserve the plan if the assertion
holds. **The assertion holds**, subject to the one correction at §4.1 (r1's
identity table omitted `index.ts`; the omission changes no design).

| r1 element | Disposition |
|---|---|
| Tranches A–F | **PRESERVED UNCHANGED** |
| RED→GREEN matrix (§5, A-R1…F) | **PRESERVED UNCHANGED** |
| Database-object design (§4.2.1) | **PRESERVED UNCHANGED** |
| Migration ordering (§6, 16 steps) | **PRESERVED UNCHANGED** |
| GitHub workflow design (§7) | **PRESERVED UNCHANGED** |
| 14-step cutover (§8) | **PRESERVED UNCHANGED** |
| Gates I–VII (§9) | **PRESERVED UNCHANGED** |
| Rollback boundaries (§8.1, §8.2) | **PRESERVED UNCHANGED** |
| PC-0 – PC-31 mapping (§14.1) | **PRESERVED UNCHANGED** |
| S1 – S15 mapping (§14.2) | **PRESERVED UNCHANGED** |
| FD-2 | **PRESERVED, OPEN** |
| PO-1 – PO-7 | **PRESERVED**, with PO-4 closed at §4.3; PO-1, PO-2, PO-3, PO-5, PO-6, PO-7 remain open exactly as written |
| Frozen-architecture list (§2) | **PRESERVED UNCHANGED** — no r6 element redesigned |
| Plan-drift stop conditions (§15) | **PRESERVED UNCHANGED** |
| Non-activating scope claim (§16) | **PRESERVED UNCHANGED** |

**No redesign and no embellishment was performed.** The only substantive
additions in this addendum are the FD-1 record, the rebind evidence, and the
PO-4 closure that the evidence compels.

**No material contradiction, collision, missing prerequisite, or changed
implementation requirement was found at the selected base.**
`FOUNDER_DECISION_REQUIRED — MAIN-BASE REBIND CONFLICT` is **not** returned.

---

## 6. Implementation base semantics, restated at closure

r1 §10's five identifiers, with row 3 now resolved.

| # | Identifier | Value |
|---|---|---|
| 1 | Architecture artifact SHA-256 | `658daa9c…5954` |
| 2 | Plan artifact SHA-256 (r1) | `08f3ea74…b3ce`; this addendum's own hash at §8 |
| 3 | **Implementation base Git SHA** | **`6d6110d41e65f7484a167d499141c639e6e403c2` — RESOLVED by Founder ruling** |
| 4 | Migration authorized Git SHA | not yet determinable; comes into existence only after Tranche B merges; must be a commit on `main` per r6 §7.1 |
| 5 | Deployed Git SHA | not yet determinable; set by Railway's GitHub-push flow independently of #4 |

**Binding rule carried:** #1 and #2 are SHA-256 content hashes; #3, #4, #5 are
Git object SHAs; they are never substitutable. **No implementation authorization
may refer only to a branch name.** Gate II must name
`6d6110d41e65f7484a167d499141c639e6e403c2` explicitly.

**r1 §15 stop condition 1 remains live and now has a concrete referent:** if
`origin/main` advances past `6d6110d…` before the Builder's first edit, the
Builder stops and returns rather than re-basing on its own initiative.

---

## 7. Disposable verification worktree — disposition

| Field | Value |
|---|---|
| Path | `/tmp/pr2b-rebind-6d6110d` |
| Creation | `git worktree add --detach <path> 6d6110d41e65f7484a167d499141c639e6e403c2` |
| Branch created | **NONE** — detached HEAD; `git symbolic-ref -q HEAD` returns nothing |
| Authority | **NON-AUTHORITATIVE**, read-only verification view |
| Mutations performed inside it | **NONE** — only `git rev-parse`, `git cat-file`, `sed`, `grep`, `wc`, `shasum`, `test -e` |
| Disposition | **REMOVED** at the close of this act; removal confirmed by `git worktree list` no longer listing it |

The session's own checkout was **not** moved: it remains at
`75b52a23c1fe4bec02bdcb7257ac6273f4b4c242` on branch
`builder/prereq-c-c2-broker-ledger-worker`, with the same two untracked paths as
before. No ref, index, or worktree of the authoritative checkout was altered.

---

## 8. Attribution

Authored by the `br-architect` seat. No commit was produced, so no attribution
trailer is attached. If this file is later committed, the committing act carries
its own trailers per `DEC-20260718-05` and its own authorization.

Provenance receipt for this addendum is persisted outside the product repository
at `/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/PROVENANCE-br-architect-pr2b-implementation-plan-r1-a01-20260905.md`.

---

## 9. Status

`IMPLEMENTATION-PLAN-READY`

`IMPLEMENTATION BASE: 6d6110d41e65f7484a167d499141c639e6e403c2`

`FD-1 CLOSED. FD-2 REMAINS OPEN AND DOES NOT BLOCK GATE II.`

FD-2 (`FOUNDER DECISION REQUIRED — RECORDING THE NEW ADMINISTRATIVE CUSTODY
DOMAIN`) is not ruled by this act, is required before **Gate IV**, and carries no
canonical DEC identifier — none is allocated here.

**`IMPLEMENTATION-PLAN-READY` does not authorize implementation.** No
implementation authority exists. The next legitimate act is Founder approval at
Gate I, then a separate exact-SHA implementation authorization at Gate II naming
`6d6110d41e65f7484a167d499141c639e6e403c2`, its file scope, its commit subjects,
and its required outcomes.

**Nothing was created or modified.** No code, test, PostgreSQL role, credential,
GitHub environment, GitHub secret, Railway configuration, Neon object,
migration, branch, commit, or PR was created or modified in the production of
this artifact.
