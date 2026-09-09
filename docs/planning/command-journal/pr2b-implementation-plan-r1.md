# PR 2b — Implementation Plan, Revision 1 (Authority-Split Execution Plan)

Status: **IMPLEMENTATION PLAN — ADVISORY UNTIL FOUNDER APPROVAL. NO
IMPLEMENTATION AUTHORITY IS CREATED, IMPLIED, OR CARRIED BY THIS ARTIFACT.**

This artifact creates no code, test, PostgreSQL role, credential, token,
permission, GitHub environment, GitHub secret, repository setting, Railway
service, Railway variable, Neon object, migration, branch, commit, or PR.

Work ID: `BR-PR2B-IMPL-PLAN-R1`
Seat: `br-architect` (Plan Authority; no approval, build, operate, merge,
release, or risk-acceptance authority)
Next role: **Founder approval (Gate I), then a separate exact-SHA
implementation authorization per tranche, then Builder.**

---

## 0. Controlling inputs and their hashes

Every input below was re-hashed live in this session by `shasum -a 256` against
the resolved absolute path shown. No hash is carried on trust from a prior
session or from a document's own citation list.

| # | Input | Resolved path | SHA-256 | Verification |
|---|---|---|---|---|
| I-1 | Controlling architecture (frozen) | `/Users/michaeldaley/MADVenturesOPs/founder-os-build-room/docs/planning/command-journal/pr2b-storage-architecture-r6.md` | `658daa9c0194d5f56d7506fb8ade05d24d413cd08b106a067ff9100ce5815954` | **MATCHES** the binding header. 60,715 bytes, 1,108 lines |
| I-2 | Independent architecture review (`PASS`) | `/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/HANDOFF-operator-to-founder-pr2b-r6-architecture-review-20260905.md` | `91b9c36eb10852113e381b5848c3091593163e739399fdf7532210f3346cc8ad` | **MATCHES** the binding header |
| I-3 | Journal contract v0.17 (S2 subject) | `/Users/michaeldaley/MADVenturesOPs/founder-os-build-room/docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` | **MATCHES** r6 §0 and §17 S2. 67,497 bytes, 1,048 lines. **S2 NOT TRIGGERED** |
| I-4 | Repository conduct rules | `/Users/michaeldaley/MADVenturesOPs/founder-os-build-room/AGENTS.md` | read at this session's HEAD | approval gates §"Approval gates" bind Tranches C, D, E |

**Architecture status carried from the binding header:**
`ARCHITECTURE-READY — IMPLEMENTATION REQUIRES EXACT-SHA FOUNDER AUTHORIZATION`.

---

## 1. Implementation base assessment (§1 rebind)

### 1.1 Observed live repository state

All values below are from fresh read-only `git` inspection in this session, not
from memory or from the workspace snapshot.

| Fact | Observed value |
|---|---|
| Local HEAD | `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242` |
| Local branch | `builder/prereq-c-c2-broker-ledger-worker` |
| `origin/main` | `6d6110d41e65f7484a167d499141c639e6e403c2` |
| Merge base of the two | `fccd56616f4be1609d02c5844dd97074aafa68ca` |
| HEAD is an ancestor of `origin/main` | **NO** (`git merge-base --is-ancestor` returns non-zero) |
| HEAD ahead of `origin/main` | 3 commits |
| HEAD behind `origin/main` | 7 commits |
| Worktree status | clean of modifications; exactly 2 untracked paths: `.worktrees/`, `docs/planning/command-journal/` |
| `origin` fetch state | `git fetch --dry-run origin` produced no output — no unfetched refs |
| Architecture base `75b52a2…` still resolvable | **YES**, it is the current local HEAD |

### 1.2 The divergence, characterized exactly

The architecture base and the repository's integration line have **diverged**.
`75b52a2…` is not on `origin/main`. This is not a fast-forward relationship in
either direction.

The 7 commits on `origin/main` that `75b52a2…` does not contain:

```
6d6110d feat(seat-registry): V1.1 non-activating control-plane policy gate (unwired) (#23)
427119e fix(seat-registry): V1.1 Copilot findings — seam comment accuracy and T10 predicate assertion
656cbee feat(seat-registry): V1.1 non-activating control-plane policy gate (unwired)
693964c docs(seat-registry): file V1.1 non-activating integration plan (#22)
87870ce docs(seat-registry): correct V1.1 plan Copilot findings (typed decision branch, prose split, heading typo)
be46b1d docs(seat-registry): correct V1.1 plan command-journal citations (section 1 to 5)
7b0995c docs(seat-registry): file V1.1 non-activating integration plan
```

The 3 commits on `75b52a2…` that `origin/main` does not contain:

```
75b52a2 test(prereq-c): C2 socketless supervised Bun broker/ledger worker — Gateway half
a375d3a docs(phase0): correct evidence record to independently verified observations
499da26 test(phase0): Room Runtime Phase 0 occupancy/containment proofs (r4 stack)
```

### 1.3 Implementation-relevant drift: measured per file, not inferred

Path-set intersection is a screen, not a verdict. Every file this plan proposes
to modify was compared by **blob object hash** at both `6d6110d…` and
`75b52a2…`. Identical blob hash means byte-identical content.

| File this plan touches | Blob at `origin/main` | Blob at architecture base | Verdict |
|---|---|---|---|
| `packages/control-plane/src/main.ts` | `a1c4319bb95a3be98782a73bd2654fb8c44607d4` | `a1c4319bb95a3be98782a73bd2654fb8c44607d4` | **IDENTICAL** |
| `packages/control-plane/src/migrations.ts` | `da633c01f9c57105e9a1f7bb7445da6cdb42ff15` | `da633c01f9c57105e9a1f7bb7445da6cdb42ff15` | **IDENTICAL** |
| `packages/control-plane/src/db.ts` | `7fa0da9372…` | `7fa0da9372…` | **IDENTICAL** |
| `packages/control-plane/src/config.ts` | `9b6f634a5b…` | `9b6f634a5b…` | **IDENTICAL** |
| `railway.toml` | `5980ce064e10c1fffbb288c7772752ab69ab2e57` | `5980ce064e10c1fffbb288c7772752ab69ab2e57` | **IDENTICAL** |
| `docs/command-journal-contract.md` | `f982b3d3cf94be0b682dde36fe292c5f60d2b0ef` | `f982b3d3cf94be0b682dde36fe292c5f60d2b0ef` | **IDENTICAL** |
| `.github/workflows/ci.yml` | `7e485bdf37…` | `7e485bdf37…` | **IDENTICAL** |
| `.github/workflows/path-audit.yml` | `4d794620b5…` | `4d794620b5…` | **IDENTICAL** |
| `scripts/path-audit.sh` | `d8997db0dc…` | `d8997db0dc…` | **IDENTICAL** |
| `packages/journal/src/chain.ts` | `a27bc2305f…` | `a27bc2305f…` | **IDENTICAL** |
| `test/support/require-test-database-url.ts` | `8b937851c4…` | `8b937851c4…` | **IDENTICAL** |
| **`package.json`** | `c7bc8ab178…` | `609a872f76…` | **DIFFERS** |
| **`tsconfig.json`** | `0a1721ecab…` | `c6ac255a4a…` | **DIFFERS** |

Every r6 assumption about the code under change holds identically at both
candidate bases. The two files that differ (`package.json`, `tsconfig.json`)
differ because `75b52a2…` adds the `worker-supervisor` package reference and the
`test:prereq-c` script — additive project wiring, not a change to any surface
r6 reasons about. **But this plan must add an npm script and (per §4) a new
source file, so both files are in this plan's changed-path set, and the base
choice therefore materially determines the diff the Builder produces.**

Additionally, `origin/main` deletes two files present at the architecture base
(`packages/control-plane/src/seat-policy.ts` is *added* on main and *absent*
at the base; `test/seat-registry-integration*.test.ts` likewise), and the base
deletes planning docs main retains. None of these are r6 surfaces, but they
change the tree the Builder would check out.

### 1.4 Disposition of the drift

r6 §0 recorded "Repository HEAD at binding: `75b52a2…` … No drift across r5,
A01, A02, or this artifact." That statement was true of the *authoring session's
checkout*. It did not, and could not, assert that `75b52a2…` is the repository's
integration line. It is not: it is a builder branch that is 7 commits behind
`origin/main` and was never merged.

This is **not** a case of r6's technical assumptions having gone stale — §1.3
proves every implementation-relevant file is byte-identical at both bases. It is
a case of the plan having **two candidate implementation bases and no Founder
act selecting one**. Choosing one is a Founder disposition, not an architecture
inference, for three reasons:

1. **The Founder's own §10 rule forbids me resolving it.** "No implementation
   authorization may refer only to a branch name" and the plan must distinguish
   the *implementation base Git SHA* from the *migration authorized Git SHA*.
   Selecting which of two diverged SHAs becomes the implementation base is
   precisely the act §10 reserves.
2. **The deployment branch policy makes the choice operationally binding.**
   r6 §7.1 restricts the protected environment's deployment branch policy to
   `main`. A migration tranche can therefore only be dispatched against a commit
   on `main`. An implementation base of `75b52a2…` cannot reach the
   administrative plane without first being merged to `main` — which is a merge
   act requiring CI and separate Founder authorization under `AGENTS.md`
   "Approval gates", and which would produce a *third* SHA that neither r6 nor
   the review examined.
3. **The header's own instruction.** "Documentation-only movement may be
   analyzed separately, but no new implementation base may be invented without
   Founder disposition." The movement here is **not** documentation-only:
   `packages/control-plane/src/index.ts`, `packages/control-plane/src/seat-policy.ts`,
   `package.json`, and `tsconfig.json` all differ. I therefore may not invent
   the base.

**Returned as required by §1:**

`FOUNDER_DECISION_REQUIRED — IMPLEMENTATION BASE DRIFT`

The exact diff and risk are stated in §1.2 and §1.3. The Founder disposition
required is recorded as `FD-1` in §12.

**What this does not do.** It does not stop the plan. Every tranche below is
written base-agnostically: no tranche's design depends on which base is
selected, because §1.3 proves the r6 surfaces are identical at both. The base
selection determines only the SHA each authorization gate names and the
`package.json` / `tsconfig.json` merge context. The plan is complete and
reviewable now; it is executable only after `FD-1` and Gate I.

---

## 2. Frozen architecture — what this plan may not touch

Per §2 of the commission, r6 is binding. This plan **does not redesign** and
contains no alternative to: `br_app_runtime`; `br_journal_owner`;
`command_journal_writer`; the GitHub protected admin plane; C1 exact-SHA
control; C2 serialized migration control; credential custody; owner rotation;
boot migration removal; the same-connection journal transaction; the
`SECURITY DEFINER` design; S1–S15; PC-0–PC-31.

**No genuine contradiction with r6 was found during implementation analysis.**
Three items are recorded as *implementation facts r6 did not enumerate*, none of
which contradicts r6 or requires architectural repair:

- **IF-1 — the administrative plane has no executable entrypoint.** `migrate()`
  is exported from `packages/control-plane/src/migrations.ts:1362` and is
  invoked from exactly one production call site, `main.ts:39`. There is no CLI,
  no npm script, and no binary that runs migrations outside boot. r6 §10 stage 4
  says "Apply exactly the authorized tranche from `MIGRATIONS`" without naming
  the mechanism. That mechanism **does not exist and must be built** (Tranche B,
  file `NEW-B1`). This is additive work r6 implies; it is not a contradiction.
- **IF-2 — `migrate()` cannot apply "exactly one tranche".** The loop at
  `migrations.ts:1411` iterates the whole `MIGRATIONS` array and applies every
  unapplied entry. r6 §10 stage 4 requires "one tranche per run". The admin CLI
  must therefore take a tranche selector; whether that is a new parameter on
  `migrate()` or a wrapper is an implementation choice, recorded in Tranche B.
- **IF-3 — four test call sites invoke `migrate()` directly**
  (`test/control-plane-postgres.storage.test.ts:71,81`,
  `test/gateway-registry-immutability.storage.test.ts:71`,
  `test/gateway-storage-helpers.ts:116`). R-4 binds the **boot-applied** path
  (`main.ts` → `migrate`). Tests bootstrapping a local throwaway database are
  acting as the admin plane against a test instance, which R-4 does not reach.
  These call sites are **not** removed. Stated so no reviewer reads their
  survival as an R-4 violation.

If execution reveals a contradiction not listed above, the Builder returns
`FOUNDER_DECISION_REQUIRED` and does not repair the architecture in place.

---

## 3. Tranche map

Six tranches, each independently authorizable. Approval of one **never** implies
the next (§9).

| Tranche | Title | Authority class required | Reversible? | Founder gate |
|---|---|---|---|---|
| **A** | Runtime schema/readiness refactor | ordinary code change; no DB authority | fully (code revert) | Gate II |
| **B** | Database migration package + admin runner | code change + later privileged execution | code fully; execution partially | Gate III |
| **C** | GitHub administrative migration plane | repository security posture | configuration-only | Gate IV |
| **D** | Application runtime cutover | Railway variable + Founder deploy | until D-6; see §8 | Gate V |
| **E** | Owner credential rotation | credential custody | **NO** | Gate VI |
| **F** | Final qualification (PC-0–PC-31, S1–S15) | verification only | n/a | Gate VII |

### 3.1 Dependency ordering (hard edges)

```
A ──┬─────────────────────────────► D ──► E ──► F
    │                               ▲      ▲     ▲
B ──┴──► C ──► (B executes here) ───┘      │     │
                                           │     │
         (E requires D proven) ────────────┘     │
         (F requires A,B,C,D,E) ─────────────────┘
```

- **A before D.** D switches `DATABASE_URL` to a role that cannot run DDL. If
  boot still calls `migrate()`, the restricted runtime fails at
  `migrations.ts:1411` on the first `CREATE TABLE`. r6 §13 step 7 places the
  boot change before step 8 for exactly this reason. Reversing this order
  produces a hard boot failure, not a degradation.
- **C before B executes.** B's *code* can land without C. B's *execution* is the
  privileged migration, and r6 §11.2 forbids every plane except the protected
  environment. Executing B's SQL by any other route is an unauthorized
  migration regardless of outcome.
- **D before E.** r6 §15 conditions 1–3: rotation may not occur until the
  runtime has switched away from `neondb_owner` and `neondb_owner` is absent
  from the application environment. Rotating first strands the running service
  on a dead credential.
- **A and B are order-independent as code**, but B's execution must follow C.

### 3.2 Tranches deliberately not collapsed

A and B are separable because A changes no database authority and is fully
revertible by `git revert`; B's execution is not. C is separable because it is a
repository security-posture change under `AGENTS.md` and involves no code. E is
separable because r6 §2.2 and §15 require it to be "separately authorized" in
express terms. Collapsing any pair would make one authorization carry an
authority the Founder ruled must be granted on its own.

---

## 4. File-level implementation map

Exact paths throughout. Where a path cannot be determined without an act I am
not authorized to perform, it is marked `PLAN-OPEN — VERIFY BEFORE
AUTHORIZATION` rather than guessed.

Legend: `MOD` = existing file modified; `NEW` = file created; `FORBIDDEN` = must
not be touched in this tranche.

### 4.1 Tranche A — runtime schema/readiness refactor

| Id | Action | Path | Change | Required by |
|---|---|---|---|---|
| A-M1 | MOD | `packages/control-plane/src/main.ts` | Replace the `migrate(pool)` call at line 39 and the `boot.migrated` log at 40–43 with a call to the new read-only preflight; replace the `import { migrate }` at line 22; correct the file header comment at lines 4–11, which currently documents the boot order as `config → pool → migrate → listen` | r6 §2.8, §12, R-4/R-5 |
| A-N1 | NEW | `packages/control-plane/src/schema-preflight.ts` | Read-only, fail-closed boot assertion. Verifies expected `schema_migrations` ids are present, and asserts the connected role holds none of the forbidden privileges. Never issues DDL, never repairs | r6 §12, §2.8, PC-21, PC-22 |
| A-M2 | MOD | `packages/control-plane/src/index.ts` | Export the preflight's public symbols alongside the existing `migrate` / `MIGRATIONS` export at line 17. `migrate` and `MIGRATIONS` remain exported: `MIGRATIONS` stays the in-repository source of truth per r6 §2.8, and Tranche B's runner and the existing test call sites (IF-3) consume both | r6 §2.8 |
| A-M3 | MOD | `packages/control-plane/src/db.ts` | Correct the `probe()` doc comment at lines 90–93, which states "The schema is proved at boot by the migrator". After A that sentence is false. Comment-only; no behavior change | accuracy; prevents a false claim surviving in the runtime source |
| A-M4 | MOD | `package.json` | No new dependency. Only if a preflight-only script is added; otherwise unchanged. `PLAN-OPEN — VERIFY BEFORE AUTHORIZATION`: whether A needs a script entry depends on whether the preflight is exercised standalone in CI | — |
| A-T1 | NEW | `test/schema-preflight.storage.test.ts` | RED-first suite for §5.1 | r6 PC-21, PC-22 |
| A-T2 | NEW | `test/boot-no-ddl.storage.test.ts` | Asserts the boot path issues no DDL | PC-21 |

**FORBIDDEN in A:** every path under `.github/workflows/`; `railway.toml`; any
SQL that creates roles; `packages/control-plane/src/migrations.ts`'s
`MIGRATIONS` array contents (A must not add, remove, or edit a migration).

**Database objects affected by A:** none created or altered. A reads
`schema_migrations`, `pg_roles`, and `pg_auth_members`.
**GitHub configuration affected:** none. **Railway configuration affected:**
none. **External secret/custody effect:** none.

### 4.2 Tranche B — database migration package + administrative runner

| Id | Action | Path | Change | Required by |
|---|---|---|---|---|
| B-M1 | MOD | `packages/control-plane/src/migrations.ts` | Append migration id `0006_command_journal_authority_split` to the `MIGRATIONS` array. The array currently ends at `0005_phase3_run_evidence` (line 478); `0006` is the next free id, verified by enumerating the five existing ids. **Never edit a shipped migration** (the module's own rule, line 39) | r6 §2.8, §18.1, contract §3 |
| B-N1 | NEW | `packages/control-plane/src/migrate-cli.ts` | The administrative-plane entrypoint. Closes IF-1. Accepts a tranche selector (closes IF-2), connects with the administrative credential from the environment, applies exactly the named tranche, and emits the r6 §10 stage-5 evidence to stdout as JSON. Refuses to run if more than one tranche would be applied | r6 §10 stages 4–5 |
| B-M2 | MOD | `package.json` | Add script `migrate:admin` invoking B-N1's compiled output, matching the existing `start` pattern (`node dist/packages/control-plane/src/…`) | r6 §10 stage 4 |
| B-M3 | MOD | `tsconfig.json` | Only if B-N1 requires a project-reference or include change. `PLAN-OPEN — VERIFY BEFORE AUTHORIZATION`: `packages/control-plane` is already built; a new file in an existing package likely needs no change | — |
| B-T1 | NEW | `test/journal-authority.storage.test.ts` | The §5.2 negative/denial matrix (PC-5–PC-18) | r6 §14 Group B |
| B-T2 | NEW | `test/journal-append-atomicity.storage.test.ts` | The §5.3 three-direction atomicity proofs | r6 §16.1, §16.2 |
| B-T3 | NEW | `test/migrate-cli.test.ts` | Tranche-selector and evidence-shape tests | IF-2, r6 §10 stage 5 |
| B-M4 | MOD | `.github/workflows/ci.yml` | Extend the `storage-integration` job (line 73) so the new suites run. The job already provisions `postgres:16` and sets `TEST_DATABASE_URL`. **`PLAN-OPEN — VERIFY BEFORE AUTHORIZATION`**: the denial matrix requires a *second, non-superuser* login inside the CI Postgres. The current job connects as `postgres`, a superuser, against which every denial assertion would falsely fail. Whether this is solved by a bootstrap step in the job or by the suite creating its own role must be settled before authorization. **S4 is the stop condition if CI cannot run the negative matrix as a non-superuser login** | r6 S4, R-3 |

**FORBIDDEN in B:** `packages/control-plane/src/main.ts`; `railway.toml`;
executing any SQL against Neon; creating a GitHub environment or secret.

**GitHub configuration affected by B:** `ci.yml` only. **Railway configuration
affected:** none. **External secret/custody effect:** none — B writes SQL text;
it does not hold or move a credential.

#### 4.2.1 Database objects affected by B (the complete set)

Roles created:

| Object | Kind | Attributes | r6 basis |
|---|---|---|---|
| `br_app_runtime` | LOGIN role | `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT` | §3.2 |
| `br_journal_owner` | role | `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`; no password | §4.2, PC-5 |
| `command_journal_writer` | role | `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`; no password | §4.3, PC-5 |

Objects created:

| Object | Kind | Owner | r6 basis |
|---|---|---|---|
| `command_journal_events` | table | `br_journal_owner` | §4.2, PC-6, contract §3 |
| `command_journal_chain_head` | singleton table | `br_journal_owner` | §4.2, PC-6, contract §3/§4.1 |
| `command_journal_immutable()` | trigger function | `br_journal_owner` | §4.2, PC-9 |
| append-only trigger on `command_journal_events` | trigger | `br_journal_owner` | §4.2, §16.6, PC-9 |
| append-only trigger on `command_journal_chain_head` | trigger | `br_journal_owner` | §4.2, PC-9 |
| `public.command_journal_append(...)` | `SECURITY DEFINER` function | **`command_journal_writer`, deliberately not the table owner** | §4.3, §16.3, PC-7 |
| genesis head row | data | — | §13 step 4: `seq=0`, 64-zero chain hash, exactly one row |

The genesis constant is already implemented in-repository as
`GENESIS_CHAIN_HASH = '0'.repeat(64)` at `packages/journal/src/chain.ts:17`, and
contract §4.1 fixes it as "the constant of 64 ASCII `0` characters". The
migration's literal must equal that value; a test asserts the equality rather
than restating the constant.

No sequence is created for `seq` (r6 PC-8: the routine assigns it).

### 4.3 Tranche C — GitHub administrative migration plane

| Id | Action | Path / object | Change | Required by |
|---|---|---|---|---|
| C-N1 | NEW | `.github/workflows/db-admin-migration.yml` | The administrative workflow. Full design at §7. **Verified absent**: the repository has exactly four workflows — `attribution-shape.yml`, `ci.yml`, `claude-code-review.yml`, `path-audit.yml` | r6 §10, §8, §9 |
| C-X1 | CONFIG | GitHub environment `db-admin-migration` | Created per r6 §7.1. Not a repository file | r6 §7.1 |
| C-X2 | CONFIG | Environment-scoped secret carrying the `neondb_owner` connection string | Placed at environment scope only | r6 §7.1, S11, PC-26 |
| C-X3 | CONFIG | Required reviewers `decivantiq` and `daley40-lab`; `prevent_self_review` enabled; administrator bypass disabled; deployment branch policy restricted to `main`; no wait timer | r6 §7.1 | PC-28, PC-29 |
| C-T1 | NEW | `test/admin-workflow-shape.test.ts` | Static assertions over C-N1's YAML: exact concurrency group, `cancel-in-progress: false`, `queue: max`, the 40-hex validation, the SHA comparison ordering, and that the preflight job declares no `environment:` key. Follows the existing static-analysis test convention already in the suite | PC-25, PC-27, PC-30 |

**FORBIDDEN in C:** any change to `ci.yml`, `path-audit.yml`,
`attribution-shape.yml`, or `claude-code-review.yml` that would make them
reference `db-admin-migration` (r6 §7.1 "Normal CI access: none", PC-30);
placing the administrative credential in repository or organization secrets
(S11); placing any approval-capable credential in an agent environment (S14).

**Database objects affected by C:** none. **Railway configuration affected:**
none.
**External secret/custody effect:** **this is the custody-domain move.** The
administrative credential's custodian becomes the GitHub protected environment.
r6 §19 records that the Founder ratified the move and that "A DEC may still be
required to *record* the new custody domain; that determination is the
Founder's." Recorded as `FD-2` in §12.

### 4.4 Tranche D — application runtime cutover

| Id | Action | Path / object | Change | Required by |
|---|---|---|---|---|
| D-X1 | CONFIG | Railway service variable `DATABASE_URL` | Value changed from the `neondb_owner` identity to the `br_app_runtime` identity. Stored as a **sealed** variable | r6 §5.1 rule 2, §13 step 8 |
| D-X2 | CONFIG | Railway variable audit | Confirm no service variable, no shared variable, and no `${{Service.VAR}}` reference variable resolves to the administrative credential | r6 §5.1 rules 1 and 3, PC-19, S11 |
| D-F1 | FORBIDDEN | `railway.toml` | **No change.** The file contains no credential and states so at lines 7–10. `healthcheckPath = "/health"` (line 66), `restartPolicyType = "ON_FAILURE"` (line 73), and `restartPolicyMaxRetries = 3` (line 74) are the exact settings r6 §11.3 relies on for fail-closed-on-serving. Modifying them would weaken the mechanism | r6 §11.3 |
| D-F2 | FORBIDDEN | Railway pre-deploy command | **Prohibited outright.** r6 §11.2: pre-deploy commands "execute within your private network and have access to your application's environment variables" | r6 §11.2 |

**Database objects affected by D:** none created. D exercises `br_app_runtime`.
**GitHub configuration affected:** none. **External secret/custody effect:** the
runtime credential enters Railway sealed storage; the administrative credential
leaves the Railway environment.

### 4.5 Tranche E — owner credential rotation

| Id | Action | Object | Change | Required by |
|---|---|---|---|---|
| E-X1 | CONFIG | `neondb_owner` credential | Rotated | r6 §2.2, §15 |
| E-X2 | CONFIG | The `db-admin-migration` environment secret | Updated to the replacement value | r6 §15 condition 7 |
| E-X3 | EVIDENCE | Rotation record; a refused authentication attempt with the superseded credential; a custody audit showing the replacement at environment scope only | r6 §15 conditions 5–7 |

**No repository file changes in E.** No code, no test, no workflow. Any proposal
to add one is out of tranche.

### 4.6 Tranche F — final qualification

| Id | Action | Path | Change |
|---|---|---|---|
| F-N1 | NEW | `docs/planning/command-journal/pr2b-qualification-evidence.md` | The executed PC-0–PC-31 results and S1–S15 dispositions, with literal tool output |
| F-N2 | NEW | provenance receipt for F-N1, outside the product repository (§11) | — |

**FORBIDDEN in F:** any change that would make a failing check pass. F records
results; it does not repair.

### 4.7 Paths explicitly prohibited across every tranche

`.env` and any credential file; `docs/command-journal-contract.md` (amending it
triggers S2); `packages/journal/src/chain.ts` (the genesis constant and
`chainHash` are the contract's, not this tranche's); any FounderOS path
(different repository, no authority); any `/tmp/build-room-*` worktree not named
and validated in a work authorization; `.worktrees/**` (five stale worktrees
observed — `build-room-audit-remediation-integration`,
`builder-seat-registry-v1-implementation`, `repo-audit`,
`seat-registry-v1.1-integration`, `seat-registry-v1.1-plan-filing` — all
untracked and out of scope).

---

## 5. Test / RED evidence plan

Every production behavior change gets a RED test first. The repository's harness
is `node --test` over compiled output (`npm test`), with a storage suite gated
on `TEST_DATABASE_URL` (`npm run test:storage`) that CI runs twice against a
`postgres:16` service to prove re-runnability. New suites follow that convention:
`*.storage.test.ts` for anything needing a database.

**Global RED discipline.** A test is admitted as RED only when it has been
*observed failing* with the recorded message before implementation. A test that
passes before implementation is proving nothing and must be rewritten.

### 5.1 Tranche A tests

| # | Test | RED (before) | GREEN (after) | Class |
|---|---|---|---|---|
| A-R1 | Boot preflight fails closed when a required `schema_migrations` id is absent | fails: `migrate()` **creates** the schema, so the missing-schema condition cannot be reached | preflight exits non-zero without issuing DDL | positive/negative |
| A-R2 | Boot issues no DDL | fails: boot runs `CREATE TABLE IF NOT EXISTS` unconditionally at `migrations.ts:1402` | zero DDL statements observed on the boot connection | **PC-21** |
| A-R3 | Runtime cannot perform schema DDL | fails today: the runtime is `neondb_owner` and DDL succeeds | `permission denied` / `must be owner of` from PostgreSQL | **security** |
| A-R4 | Incompatible runtime schema fails boot rather than mutating schema | fails: boot repairs the schema | process exits non-zero; schema unchanged; verified by comparing catalog state before and after | **PC-22**, S10 |
| A-R5 | Preflight never repairs | fails: no preflight exists | a deliberately damaged schema is left exactly as found | r6 §12 |
| A-R6 | Health/deploy behavior on preflight failure | n/a until D | preflight exit non-zero → healthcheck never answers → deploy recorded failed → prior revision continues serving | **PC-22**, rollback |

### 5.2 Tranche B tests — the denial matrix

Every row is executed as `br_app_runtime` against a live instance, and records
**literal PostgreSQL output**, not prose. Reasoning about grants confirms the
author's mental model while missing mechanisms that do nothing.

| # | Test | Expected literal denial | PC |
|---|---|---|---|
| B-R1 | Runtime `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on both journal tables | eight distinct `permission denied for table …` | **PC-12** |
| B-R2 | Runtime `SET ROLE br_journal_owner` and `SET ROLE command_journal_writer` | `permission denied to set role …`, both | **PC-10** |
| B-R3 | Runtime `SET SESSION AUTHORIZATION` to either | `permission denied`, both | **PC-11** |
| B-R4 | Runtime cannot reach `neon_superuser` | recursive `pg_auth_members` walk returns zero rows; `pg_has_role(...,'USAGE'/'MEMBER'/'SET')` all false | **PC-2** |
| B-R5 | Runtime cannot disable, drop, or add journal triggers | `must be owner of table …` | **PC-13**, §16.6 |
| B-R6 | `SET session_replication_role='replica'` bypass fails | `permission denied to set parameter "session_replication_role"` | **PC-15** |
| B-R7 | Runtime cannot `ALTER` / `CREATE OR REPLACE` the append routine or change its owner | `must be owner of function …` | **PC-14** |
| B-R8 | Zero membership edges, including modifier variants | `pg_auth_members` recursive walk from `br_app_runtime` to all four roles returns **zero** at any depth. A `WITH INHERIT FALSE` or `WITH SET FALSE` edge must fail the assertion exactly as a plain edge does | **R-1, R-3, PC-2** |
| B-R9 | Role attributes | `rolcreaterole=f`, `rolcreatedb=f`, `rolbypassrls=f`, `rolreplication=f`, `rolsuper=f` | **PC-3, R-3** |
| B-R10 | No `pg_write_all_data` / `pg_read_all_data` class membership | zero | **PC-4** |
| B-R11 | `pg_default_acl` review | no default grant reaches the runtime | **PC-16** |
| B-R12 | Routine ACL carries no `PUBLIC` execute entry | `proacl` has no bare `=X/` | **PC-18** |
| B-R13 | Ownership placement | tables and triggers owned by `br_journal_owner`; the routine owned by `command_journal_writer`, **not** the table owner | **PC-6, PC-7, PC-9** |
| B-R14 | Both privileged roles are `NOLOGIN` | `rolcanlogin=f` both; no password set | **PC-5** |
| B-R15 | No journal sequence exists | catalog confirms none | **PC-8** |

**Positive path:**

| # | Test | GREEN criterion | PC |
|---|---|---|---|
| B-P1 | `SECURITY DEFINER` append succeeds | runtime `EXECUTE`s the routine and the row lands | **PC-17** |
| B-P2 | Runtime `SELECT` on both tables succeeds | required for `verify()` chain recomputation from genesis (contract §4.1) | **PC-17**, r6 §3.3 |
| B-P3 | Containment | inside the routine `current_user` is the writer; after the call it is the runtime login; the runtime still cannot `INSERT` | §16.3 |

**Atomicity — proven in three directions, not one:**

| # | Test | Criterion | Basis |
|---|---|---|---|
| B-A1 | COMMIT | journal append and lifecycle insert share **one connection, one transaction**: lifecycle rows=1, journal refs=1 | §16.1, §16.2 |
| B-A2 | ROLLBACK | neither persists; **chain head unchanged** — the head latch did not advance | §16.2 |
| B-A3 | Journal failure rolls back the lifecycle insert | duplicate `command_id` inside the act → lifecycle rows=0. **The governance-critical case**: a journal failure cannot orphan a lifecycle insertion | §16.2 |
| B-A4 | Duplicate command ID handling | the duplicate is refused by constraint, not silently reconciled | §16.2, contract §2 |
| B-A5 | Head divergence rollback | a concurrent append that would diverge the head is refused and rolls back; the chain head is left at its pre-transaction value | §4.1, contract §4.1 |

**Hash-binding security test:**

| # | Test | Criterion | Basis |
|---|---|---|---|
| B-H1 | A user-defined hash helper cannot shadow `pg_catalog.sha256()` | a non-superuser cannot create `pg_catalog.sha256`; a `pg_temp` overload does not capture resolution; verified against the NIST vector for `"abc"`. No pgcrypto `digest()` substitution | **§16.5, S6** |
| B-H2 | `search_path` hardening | the routine pins `search_path = pg_catalog, pg_temp` with `public` **absent**; all non-builtin references fully qualified; no dynamic SQL | §16.3 |
| B-H3 | Pool `search_path` does not alter resolution of the schema-qualified call site | re-confirm post-cutover, as the pool identity changes | **PC-24** |

### 5.3 Tranche C tests

| # | Test | RED | GREEN | PC |
|---|---|---|---|---|
| C-R1 | Wrong authorized SHA fails **before** any privileged migration | fails: no workflow exists | run exits `FAIL CLOSED — UNAUTHORIZED SHA` in the ungated preflight job, before any secret access, recording **both** expected and observed SHA | **PC-25** |
| C-R2 | Malformed `founder_authorized_sha` fails closed | — | anything other than exactly 40 lowercase hex characters fails before any other step | r6 §8.2 step 2 |
| C-R3 | The same authenticated session cannot initiate and release the environment deployment under the normal path | — | `prevent_self_review` refuses the initiating identity's approval; the non-initiating Founder-controlled identity can approve; the approver identity appears in the evidence | **PC-28** |
| C-R4 | Two privileged migrations cannot execute concurrently | — | two overlapping dispatches → one executing, one **queued**; the queued run is not canceled by the newer dispatch; no in-progress run is canceled | **PC-27** |
| C-R5 | An unapproved run cannot read the environment secret | — | secret unreachable before approval | **PC-23** |
| C-R6 | No repository-wide or organization-wide copy of the administrative credential | — | repository and organization secret listings contain no administrative entry | **PC-26, S11** |
| C-R7 | Environment configuration reads back as specified | — | reviewers, `prevent_self_review`, disabled administrator bypass, branch policy | **PC-29** |
| C-R8 | No normal CI path to the environment | — | no workflow other than `db-admin-migration.yml` references `db-admin-migration` | **PC-30** |
| C-R9 | Agent credential boundary | — | no approval-capable credential in any agent environment, repository secret, or Railway variable; the dispatch automation credential cannot approve | **PC-31, S14** |

C-R3 through C-R5, C-R7, and C-R9 are **live-platform checks, not unit tests.**
No GitHub protection rule has ever been configured on this repository — both
existing environments (`compassionate-happiness / production` and `copilot`)
have empty `protection_rules`. The platform behavior therefore rests on plan
entitlement plus published documentation and has **not been observed in place**.
C-R1, C-R2, C-R4, and C-R8 are additionally assertable statically from the YAML
(test C-T1) before any environment exists, and should be, because a static
assertion catches a mis-specified concurrency group without spending a
privileged run.

### 5.4 Tranche D tests

| # | Test | GREEN | PC |
|---|---|---|---|
| D-R1 | The role in the application's `DATABASE_URL` is `br_app_runtime` | `current_user` = `br_app_runtime` from the app's own connection | **PC-0** |
| D-R2 | `br_app_runtime` is not the database owner | `pg_database.datdba` is not `br_app_runtime` | **PC-1** |
| D-R3 | The application boots and serves holding only `br_app_runtime` | boot completes; `/health` 200; room lifecycle writes succeed; journal append succeeds via the routine | **PC-20**, §13 step 9 |
| D-R4 | Railway holds no administrative credential in any form | service, shared, and reference variable audit clean | **PC-19, S11** |
| D-R5 | Rollback test | rolling `DATABASE_URL` back to the prior identity restores service | §13 step 9 abort |

**Non-journal privilege enumeration.** r6 §3.3 requires the runtime's
non-journal operational privileges be "enumerated at implementation time from
the existing schema, granted explicitly, never by blanket `ALL`." The existing
suite is the enumeration instrument: run the full suite as `br_app_runtime`
against a non-production branch, and every `permission denied` names a privilege
to add explicitly. `PLAN-OPEN — VERIFY BEFORE AUTHORIZATION`: the exact
privilege list cannot be produced without executing that run, which requires
Tranche B. It must not be guessed, and a blanket grant must not be used to avoid
producing it (§13 step 2 abort condition).

### 5.5 Tranche E and F

E is proven by evidence, not tests: rotation recorded; an authentication attempt
with the superseded credential **refused**; a custody audit showing the
replacement at environment scope only (r6 §15 conditions 5–7). F re-runs the
complete PC-0–PC-31 matrix and dispositions S1–S15.

---

## 6. Migration / ownership order

The exact SQL dependency order. **Specified, not executed.** No SQL in this plan
is run against any database.

### 6.1 Ordered steps

| # | Operation | Why this position | Failure behavior |
|---|---|---|---|
| 1 | `CREATE ROLE br_journal_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION` | Objects cannot be owned by a role that does not exist | abort; nothing created |
| 2 | `CREATE ROLE command_journal_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION` | Same | abort |
| 3 | `CREATE ROLE br_app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT` | Must exist before any grant names it | abort |
| 4 | Create `command_journal_events` and `command_journal_chain_head`, then `ALTER TABLE … OWNER TO br_journal_owner` | Created by the executing admin identity, ownership transferred immediately in the same transaction. **Ownership must never rest, even transiently across a commit boundary, on a runtime-reachable role** | abort; transaction rolls back, no half-owned table |
| 5 | Create `command_journal_immutable()`, `ALTER FUNCTION … OWNER TO br_journal_owner` | The trigger function must be owned by the table owner so trigger management stays with the owner | abort |
| 6 | Create both append-only triggers | Triggers are owned by the table's owner implicitly; creating them after step 4's ownership transfer makes that automatic rather than a separate act | abort |
| 7 | `REVOKE ALL ON command_journal_events, command_journal_chain_head FROM PUBLIC` | **Before any grant.** Revoking after granting risks a window where `PUBLIC` holds access | abort |
| 8 | `GRANT SELECT, INSERT ON command_journal_events TO command_journal_writer`; `GRANT SELECT, UPDATE ON command_journal_chain_head TO command_journal_writer` | The minimum the routine's body needs. Not `ALL` | abort |
| 9 | Create `public.command_journal_append(...)` as `SECURITY DEFINER`, `SET search_path = pg_catalog, pg_temp`, then `ALTER FUNCTION … OWNER TO command_journal_writer` | **Owner is the writer, not the table owner.** A function owned by the table owner inherently possesses `TRUNCATE`, `DROP`, and trigger-alteration power — the r3 finding at r6 §4.3. `public` is absent from `search_path`; `pg_temp` is last | abort |
| 10 | `REVOKE ALL ON FUNCTION public.command_journal_append(...) FROM PUBLIC` | PostgreSQL grants `EXECUTE` to `PUBLIC` by default on function creation. **This revoke is mandatory and must precede the grant** | abort |
| 11 | `GRANT EXECUTE ON FUNCTION public.command_journal_append(...) TO br_app_runtime` | The single explicit grant | abort |
| 12 | `GRANT SELECT ON command_journal_events, command_journal_chain_head TO br_app_runtime` | `SELECT` only, justified by `verify()` chain recomputation (r6 §3.3) | abort |
| 13 | Insert the singleton genesis head row: `seq=0`, chain hash = 64 ASCII zeros | Exactly one row (§13 step 4) | abort |
| 14 | Grant enumerated non-journal operational privileges to `br_app_runtime`, explicitly, never blanket | Depends on §5.4's enumeration | abort; **never resolve by blanket `ALL`** |
| 15 | `ALTER DEFAULT PRIVILEGES` review | Confirm no default privilege silently grants the runtime future journal objects | abort |
| 16 | Assert zero `pg_auth_members` edges from `br_app_runtime`, recursively | The closing assertion | **abort and do not certify** |

### 6.2 Transaction boundaries

Steps 4–13 are the ownership-and-grant establishment and must be **one
transaction**. Rationale: a commit between object creation and the `OWNER TO`
of step 4, or between step 9's creation and step 10's `REVOKE ALL FROM PUBLIC`,
leaves a durable window in which the objects are owned by the admin identity
with `PUBLIC EXECUTE` live. The existing migrator already wraps each migration's
statements in `BEGIN`/`COMMIT` (`migrations.ts:1416–1422`) with a guarded
`ROLLBACK` on failure (line 1438), so this property is supplied by the existing
mechanism provided `0006` is a single migration entry.

`CREATE ROLE` (steps 1–3) is transactional in PostgreSQL and may be included.
**`PLAN-OPEN — VERIFY BEFORE AUTHORIZATION`:** whether Neon's managed control
plane permits `CREATE ROLE` inside the same transaction as the object DDL, and
whether it permits `ALTER … OWNER TO` a role the executing identity created, is
platform behavior that has **not been verified** — r6 Appendix A states no Neon
access was performed. If either is prohibited, that is **S3**: return
`FOUNDER_DECISION_REQUIRED` and do not redesign around the limitation.

### 6.3 No intermediate state leaves the runtime with owner authority

At no ordered position does `br_app_runtime` own a journal object, hold a
membership edge, or hold `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`. Its first and
only privileges arrive at steps 11, 12, and 14, all `EXECUTE` or `SELECT` or
enumerated non-journal operational grants. The runtime is created at step 3
holding nothing and never passes through a broader state on its way to its final
one.

---

## 7. Administrative workflow design

Specified as design. **No workflow file is created by this artifact.** No secret
value appears anywhere in this plan.

| Element | Specified value |
|---|---|
| Path | `.github/workflows/db-admin-migration.yml` |
| Trigger | `workflow_dispatch` only. No `push`, no `pull_request`, no `schedule` |
| Input 1 | `founder_authorized_sha` — **required**, exact 40-character lowercase hexadecimal |
| Input 2 | `tranche_id` — **required** |
| Input 3 | the migration range or identifier being applied — **required** |
| Concurrency group | the constant string `pr2b-admin-migration`, **not** interpolated with the SHA or ref |
| `cancel-in-progress` | **`false`**, explicit |
| Queue behavior | `queue: max` |
| Permissions | least privilege; `contents: read` at most, matching the existing workflows' `permissions: contents: read` convention |

### 7.1 Job shape

**Job 1 — `preflight` (ungated).** No `environment:` key. No secret access.

1. Validate `founder_authorized_sha` against `^[0-9a-f]{40}$`. Anything else
   fails closed **before any other step**.
2. Compare the run's immutable execution SHA to the input.
3. Print **both** expected and observed SHA to the run summary, whether or not
   they match.
4. On mismatch: exit non-zero with `FAIL CLOSED — UNAUTHORIZED SHA`. No
   privileged database action may execute.

**Job 2 — `migrate` (gated).** `needs: preflight`.
`environment: db-admin-migration`. Waits for a Founder-controlled approver
identity. The secret is unreachable until approval.

5. **Re-assert** the SHA equality inside the gated job, defending against any
   state change between stages.
6. `actions/checkout` **pinned to the asserted SHA**, not to a ref, so the
   migration content is the authorized tree and not a ref tip resolved later.
   Pin the action itself by commit SHA, matching the existing convention
   (`actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0` in
   `ci.yml`).
7. Migration command: `npm run migrate:admin` (Tranche B, B-M2), applying
   **exactly the authorized tranche**, one tranche per run.
8. Emit evidence: expected SHA, observed SHA, tranche id, applied migration ids,
   `schema_migrations` state **before and after**, approver identity, run id,
   and timestamps. Evidence is platform-generated, not self-reported.

**Stop behavior.** Any failure at any step exits non-zero and applies no further
migration. The environment is **not blanket authority**: a run approved without
a corresponding Founder authorization act naming that exact SHA and tranche
scope is an unauthorized migration regardless of the platform's verdict.

### 7.2 What C1 does and does not close, restated so no reader overreads it

C1 closes ref-tip drift between authorization and dispatch, mis-dispatch against
the wrong ref, and any run that would migrate a tree the Founder never named.
C1 **alone does not close** a dispatcher that controls both the ref and the
input: it can dispatch ref X while passing X's tip, and the assertion passes.
C1 verifies internal consistency; it cannot by itself know what the Founder
authorized. What closes it is the combination of the approval gate, the
deployment branch policy, and the agent credential boundary. **The workflow
must never be described as making the migration self-authorizing.**

---

## 8. Cutover plan

r6 §13's fourteen steps, translated to executable implementation steps. Any step
that fails **aborts the cutover at that point; no later step proceeds.**

| # | Actor | Authority / credential class | Precondition | Mutation | Verification | Rollback | Stop condition |
|---|---|---|---|---|---|---|---|
| 1 | admin plane | `neondb_owner` via protected environment | Gate III; C complete | `CREATE ROLE br_app_runtime` + credential generated | `pg_roles`: `rolcanlogin=t`, all four privilege attrs and `rolsuper` false | `DROP ROLE` | any attribute wrong |
| 2 | admin plane | same | step 1 | enumerated non-journal grants | full existing suite green under the restricted identity, non-production branch | `REVOKE` | any required privilege missing → **enumerate, never blanket-grant** |
| 3 | admin plane | same | step 2 | `CREATE ROLE` ×2 `NOLOGIN` | `rolcanlogin=f` both; no password | `DROP ROLE` | either can log in |
| 4 | admin plane | same | step 3 | journal objects, ownership, grants/revokes, genesis row (§6.1 steps 4–13) | `pg_tables` / `pg_proc` ownership; exactly one head row | drop, **only while `count(*)=0`** | any ownership lands on a runtime-reachable role |
| 5 | admin plane / CI | `br_app_runtime` | step 4 | none | every §5.2 denial observed as an actual PostgreSQL error | n/a | any denial does not fire |
| 6 | CI | `br_app_runtime` | step 5 | test rows only | all three §5.2 atomicity outcomes reproduced live | n/a | any case diverges |
| 7 | Builder | ordinary code authority | Gate II | Tranche A merged | boot issues no DDL; preflight fails closed | `git revert` | boot still requires owner authority |
| 8 | **Founder** | Railway sealed variable | Gate V; steps 1–7 | **`DATABASE_URL` → `br_app_runtime`** | staged change reviewed and deployed | roll `DATABASE_URL` back — **available until step 10** | deploy fails |
| 9 | Founder / CI | `br_app_runtime` | step 8 | none | boot completes; `/health` serves; room lifecycle writes succeed; journal append succeeds via the routine | roll back to prior identity | any runtime failure |
| 10 | Founder | Railway config | step 9 | remove every trace of the admin credential | variable audit clean: no service, shared, or reference variable | **re-provisioning admin custody — a Founder act** | any residue |
| 11 | CI | read-only | step 10 | none | recursive `pg_auth_members` walk from `br_app_runtime` returns zero at any depth | n/a | any edge |
| 12 | **Founder** | GitHub admin | Gate IV | establish `db-admin-migration`; place the credential | environment reports the §7.1 reviewers, `prevent_self_review`, disabled admin bypass, branch policy; secret at environment scope only | delete environment/secret | any deviation from §7.1 |
| 13 | Founder / CI | dispatch + approval | step 12 | one proving migration | PC-23, PC-25, PC-27, PC-28 pass | n/a | any control does not fire |
| 14 | **Founder** | credential custody | Gate VI; §15's seven conditions in order | **rotate `neondb_owner`** | rotation recorded; superseded credential no longer authenticates; replacement exists only in the protected custody plane | **NONE** | rotation incomplete → custody is not remediated |

### 8.1 Rollback boundaries, named exactly

- **Last fully reversible point: the completion of step 7.** Steps 1–7 are
  additive: the application still runs as `neondb_owner` and nothing has been
  taken away. Reversal is `DROP ROLE` plus `git revert`.
- **First operationally irreversible point: step 8.** This is the first step
  that changes what the running service is. Rollback after step 8 is still
  configuration-only *until step 10*, but the service has already been observed
  in the new posture.
- **Point where Railway `DATABASE_URL` changes: step 8.**
- **Point where `neondb_owner` disappears from runtime custody: step 10.**
  After step 10, rollback means re-provisioning admin custody, which is a
  Founder act, not engineering rollback.
- **Point where owner credential rotation occurs: step 14.** Irreversible by
  construction. The superseded credential is intended never to authenticate
  again.

### 8.2 The journal-history rollback boundary

**Before the first append**, removal may be permissible with the `count(*) = 0`
precondition **checked, not assumed**. **After the first appended event**,
dropping journal history is destruction of governed records, not ordinary
rollback, and is unavailable to the Builder or the Operator. The safe reversal
after first write is `REVOKE EXECUTE` on the append routine, which fails
dispatch closed per contract §5.1 — **never a drop**.

### 8.3 What fail-closed actually means here, stated without overclaim

Fail-closed is enforced at the **runtime boundary**, not the deployment
boundary. The runtime deploy is triggered by Railway on GitHub push, not by the
administrative workflow, so no workflow ordering gates it. A revision that fails
its preflight never becomes healthy, is recorded as a failed deploy, and the
previous healthy revision continues serving.

**Residual, stated:** this is fail-closed on *serving*, not on *deploy
initiation*. A runtime deploy will still start and then fail its healthcheck.
Nothing serves a mismatched schema; something does briefly attempt to boot.

---

## 9. Founder authorization gates

Approval of one gate **never** implies the next. Every execution gate names the
exact repository SHA it authorizes. A gate that names only a branch is void
(§10).

| Gate | Authorizes | Must name | Preconditions | Does **not** authorize |
|---|---|---|---|---|
| **I** | This implementation plan | this plan's artifact SHA-256; the disposition of `FD-1` | plan artifact verified on disk | any implementation whatsoever |
| **II** | Tranche A code/runtime refactor | the **implementation base Git SHA**; the A file map; commit subjects | Gate I; `FD-1` resolved | any database act; any workflow file; Tranche B |
| **III** | Tranche B database role/schema migration | the **migration authorized Git SHA** (40 hex); the tranche id | Gate II merged; Gate IV complete (the plane must exist to execute through) | rotation; runtime cutover; a second privileged credential (S1/S8) |
| **IV** | Tranche C protected-environment and secret configuration | the workflow file's Git SHA | Gate I; `FD-2` dispositioned | any migration execution; blanket migration authority (§7.3) |
| **V** | Tranche D runtime `DATABASE_URL` cutover | the deployed Git SHA | steps 1–7 proven; PC-0–PC-18 pass | rotation; removal of admin custody beyond step 10 |
| **VI** | Tranche E owner credential rotation | n/a (no repository change) | §15 conditions 1–4 hold **in order** | declaring custody remediated before all seven conditions (S13) |
| **VII** | Final qualification / activation disposition | the qualification artifact's SHA-256 | all of A–E | activating dispatch; satisfying contract §1.4 (§18.2) |

### 9.1 Gate III's ordering, stated because it is counter-intuitive

Gate III authorizes the migration, but the migration cannot **execute** until
Gate IV's plane exists. The code of Tranche B can be authorized and merged
before Gate IV; only its execution waits. Two SHAs are therefore in play at
Gate III and must not be conflated: the SHA at which B's code merged, and the
SHA the migration run asserts as `founder_authorized_sha`. Under r6 §7.1's
branch policy the latter must be a commit on `main`.

---

## 10. Implementation base semantics

Five distinct identifiers. This plan does not conflate them, and no
authorization may.

| # | Identifier | Value at this writing | Definition |
|---|---|---|---|
| 1 | **Architecture artifact SHA** | `658daa9c…5954` | SHA-256 of `pr2b-storage-architecture-r6.md`. Content hash of a document |
| 2 | **Plan artifact SHA** | see §14 | SHA-256 of this file. Content hash of a document |
| 3 | **Implementation base Git SHA** | **UNRESOLVED — `FD-1`** | The Git commit the Builder branches from. Candidates: `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242` (architecture base) or `6d6110d41e65f7484a167d499141c639e6e403c2` (`origin/main`) |
| 4 | **Migration authorized Git SHA** | not yet determinable | The exact 40-hex value passed as `founder_authorized_sha`. Comes into existence only after Tranche B merges. Under r6 §7.1 it must be a commit on `main` |
| 5 | **Deployed Git SHA** | not yet determinable | The commit Railway builds and serves. Set by Railway's GitHub-push flow, independently of #4 — which is precisely why fail-closed lives at the runtime boundary (§8.3) |

**Binding rule.** #1 and #2 are SHA-256 content hashes; #3, #4, and #5 are Git
object SHAs. They are different kinds of identifier and are never substitutable.
**No implementation authorization may refer only to a branch name.** A branch
name is not an authorization boundary: `workflow_dispatch` is ref-addressed, and
a tip can move between the Founder naming it and the run starting.

---

## 11. Provenance receipt

Persisted **outside the product repository**, at:

`/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/PROVENANCE-br-architect-pr2b-implementation-plan-r1-20260905.md`

That location is the existing Build Room handoff/evidence store — it already
holds the bound architecture review (I-2) and the live Neon preflight r6 cites.
No controlling governance requires another location. The receipt records:
artifact path; artifact SHA-256; Role-Id; Actor-Id; provider; exact model;
session ID; execution surface; timestamp.

**The r6 historical provenance gap is not repeated.** Every implementation and
review artifact produced downstream of this plan carries the same receipt, and
an artifact without one is not admissible as evidence.

---

## 12. Unresolved Founder decisions

Placeholder identifiers only. Canonical decision IDs are assigned by the Founder
under the applicable decision-record namespace rule; I do not allocate them.

| Id | `FOUNDER DECISION REQUIRED — [TOPIC]` | Why it is the Founder's | Latest required decision point |
|---|---|---|---|
| **FD-1** | `FOUNDER DECISION REQUIRED — PR2B IMPLEMENTATION BASE SELECTION` | The architecture base `75b52a2…` and `origin/main` `6d6110d…` have diverged (3 ahead / 7 behind, merge base `fccd566…`). Every r6 surface is byte-identical at both (§1.3), but `package.json` and `tsconfig.json` differ and both are in this plan's changed-path set. r6 §7.1's branch policy means only a commit on `main` can reach the administrative plane. Selecting the base is the §10 act reserved to the Founder | **Before Gate II.** No implementation may be authorized against an unselected base |
| **FD-2** | `FOUNDER DECISION REQUIRED — RECORDING THE NEW ADMINISTRATIVE CUSTODY DOMAIN` | r6 §19: the custody move is ratified, but "A DEC may still be required to *record* the new custody domain; that determination is the Founder's and is not an architecture question." Under `DEC-20260815-02` custody posture is a Founder act. Lightest sufficient instrument: a Founder authorization comment. **Escalates to a new DEC** if the Founder judges that creating a custody domain — which this is — requires a recorded decision | **Before Gate IV.** The environment and secret are the custody domain |

No other Founder decision is manufactured. Every remaining item below is
verification, not decision.

---

## 13. Unresolved plan items (`PLAN-OPEN — VERIFY BEFORE AUTHORIZATION`)

These are **empirical verifications**, not design questions. Each names the act
that would resolve it and the stop condition if it fails.

| Id | Item | Resolving act | Stop condition if it fails |
|---|---|---|---|
| **PO-1** | Whether CI can run the denial matrix as a **non-superuser** login. The `storage-integration` job connects as `postgres`, a superuser, against which every denial assertion would falsely pass or falsely fail | Extend the job (B-M4) and observe an actual denial | **S4** |
| **PO-2** | Whether Neon permits `CREATE ROLE`, `ALTER … OWNER TO`, and the §6.2 transaction shape. r6 Appendix A: no Neon access was performed and no Neon authorization is held | The Tranche B execution itself, or a separately authorized Neon preflight | **S3** — return `FOUNDER_DECISION_REQUIRED`; do **not** redesign around it |
| **PO-3** | The exact enumerated non-journal privilege list for `br_app_runtime` (r6 §3.3) | Run the existing suite as `br_app_runtime`; each `permission denied` names one grant | Resolving by blanket `ALL` is a **plan-drift stop** (§15) |
| **PO-4** | Whether `tsconfig.json` needs a change for B-N1 | Inspect at the selected base after `FD-1` | none; low risk |
| **PO-5** | Whether Tranche A needs a `package.json` script entry | Settled when the preflight's CI invocation is designed | none; low risk |
| **PO-6** | Whether `migrate()` gains a tranche parameter or is wrapped (IF-2) | Builder's choice within Tranche B, subject to review | none — both satisfy r6 §10 stage 4 |
| **PO-7** | The observed behavior of GitHub protection rules on this repository. **No protection rule has ever been configured here**; both existing environments have empty `protection_rules`. The capability rests on plan entitlement plus published documentation | Tranche C, then C-R3/C-R5/C-R7 | If required reviewers or `prevent_self_review` do not behave as documented, the approval gate is not the control r6 assumes → **`FOUNDER_DECISION_REQUIRED`** |

---

## 14. PC / S mapping — every requirement traced

### 14.1 PC-0 through PC-31

| PC | Tranche | Verification vehicle |
|---|---|---|
| PC-0, PC-1 | D | D-R1, D-R2 |
| PC-2 | B | B-R4, B-R8 |
| PC-3 | B | B-R9 |
| PC-4 | B | B-R10 |
| PC-5 | B | B-R14 |
| PC-6 | B | B-R13 |
| PC-7 | B | B-R13 |
| PC-8 | B | B-R15 |
| PC-9 | B | B-R13 |
| PC-10 | B | B-R2 |
| PC-11 | B | B-R3 |
| PC-12 | B | B-R1 |
| PC-13 | B | B-R5 |
| PC-14 | B | B-R7 |
| PC-15 | B | B-R6 |
| PC-16 | B | B-R4, B-R11 |
| PC-17 | B | B-P1, B-P2 |
| PC-18 | B | B-R12 |
| PC-19 | D | D-R4 |
| PC-20 | D | D-R3 |
| PC-21 | A | A-R2 |
| PC-22 | A, D | A-R4, A-R6 |
| PC-23 | C | C-R5 |
| PC-24 | B, D | B-H3 (re-confirmed post-cutover) |
| PC-25 | C | C-R1, C-T1 |
| PC-26 | C | C-R6 |
| PC-27 | C | C-R4, C-T1 |
| PC-28 | C | C-R3 |
| PC-29 | C | C-R7 |
| PC-30 | C | C-R8, C-T1 |
| PC-31 | C | C-R9 |

**Disposition rules carried from r6 §14:** any Group A (PC-0–PC-4) failure means
`FOUNDER_DECISION_REQUIRED` and S9 persists. Any Group B ownership failure
prohibited by Neon is **S3**. Any Group C or Group E failure means the cutover is
incomplete: **do not certify.**

### 14.2 S1 through S15

| S | Statement | Status entering implementation | Cleared by |
|---|---|---|---|
| S1 | admin plane would require a **new privileged credential** | not triggered; one restricted runtime credential is approved | remains a live stop across every tranche |
| S2 | contract hash changes from `eaeb6178…9e52` | **NOT TRIGGERED** — re-hashed live this session, matches | re-verify at every gate |
| S3 | a required Neon ownership operation is prohibited by the platform | **UNKNOWN** — PO-2 | Tranche B execution |
| S4 | CI cannot run the negative matrix as a non-superuser login | **UNKNOWN** — PO-1 | B-M4 |
| S5 | any design change granting the runtime direct journal DML, privileged membership (**with or without `INHERIT FALSE` / `SET FALSE`**), or journal ownership | not triggered | live across A–F |
| S6 | substituting a user-defined hash helper for builtin `sha256()` | not triggered | B-H1 |
| S7 | implementation would write a real control-plane act, activating contract §1.4 | not triggered; §18.2 keeps it out of scope | live |
| S8 | a second **privileged** database login is proposed | not triggered | live |
| S9 | the runtime login is, or can reach, the Neon project owner | **CURRENTLY TRIGGERED** | PC-0–PC-4 post-cutover (Tranche D) |
| S10 | privileged DDL remains in the boot path, or the app needs owner authority to start | **CURRENTLY TRIGGERED** | Tranche A (step 7) + PC-20/PC-21 |
| S11 | the admin credential is found in the app service's variables, or in repository- or organization-wide secrets | not triggered | PC-19, PC-26 |
| S12 | the admin plane cannot fail closed on privileged-migration failure | not triggered | PC-22 |
| S13 | custody declared remediated before all seven §15 conditions hold | not triggered | Gate VI evidence |
| S14 | an approval-capable credential is placed in an agent environment, repository secrets, or Railway, or environment approval is performed as an agent action | not triggered | PC-31 |
| S15 | environment or ruleset bypass is used for a normal privileged migration | not triggered | separate Founder emergency act + its own evidence |

**Two stop conditions are triggered right now** (S9, S10). That is the expected
entry state: they are what this work exists to clear.

---

## 15. Plan-drift stop conditions

The Builder halts and returns to the Founder — **without** repairing the
architecture in place — on any of:

1. The selected implementation base moves before the Builder's first edit.
2. Any r6 surface listed in §1.3 as `IDENTICAL` is found modified at the
   selected base.
3. The contract hash (I-3) changes — **S2**.
4. A required privilege cannot be enumerated and the only path forward is a
   blanket `ALL` grant — violates r6 §3.3 and §13 step 2.
5. Any membership edge to `br_journal_owner`, `command_journal_writer`,
   `neondb_owner`, or `neon_superuser` is proposed for `br_app_runtime`, in any
   form including `WITH INHERIT FALSE` / `WITH SET FALSE` — **S5**.
6. A second privileged database login is proposed — **S1 / S8**.
7. A user-defined hash helper is proposed in place of `pg_catalog.sha256()` —
   **S6**.
8. Any privileged migration is proposed for execution outside the protected
   environment — r6 §11.2, §7.3.
9. Any approval-capable credential is proposed for an agent environment —
   **S14**.
10. Environment or ruleset bypass is proposed for a normal migration — **S15**.
11. A tranche's scope expands beyond its §4 file map without a new gate.
12. A test is modified to make a failing assertion pass. **Tests are not
    implementation and may not be edited to fit the code.**

---

## 16. Non-activating scope claim, carried forward

Carried verbatim in substance from r6 §18 so no reader mistakes this plan's
completion for contract satisfaction:

1. Permitted once authorized: journal tables, singleton head row and genesis
   initialization, immutability triggers, the two `NOLOGIN` roles, the
   restricted runtime role, grants and revokes, the append routine, and tests.
2. **This tranche does not claim to satisfy contract §1.4's dual-write rule.**
   §5.2's atomicity tests prove the *mechanism* can carry a lifecycle insert and
   a journal append in one transaction. §1.4 is satisfied only when a **later
   authorized dispatch integration performs both writes in one transaction as a
   real control-plane act.** That act does not exist here. A dormant primitive
   is not an activated contract, and **no PR body, test name, or status line may
   claim otherwise.**
3. No dispatch path is activated; contract §5.1's pre-dispatch fail-closed rule
   is not exercised.
4. Phase 4 stop-gate items 2 and 4–10 are not discharged; storage-layer evidence
   contributes to items 1 and 3 only.

**Tamper-evident, not tamper-proof.** Owner and superuser can still disable
triggers or `TRUNCATE`. The authority split **narrows who holds owner
authority; it does not eliminate the owner bypass.** No PR body, test name, or
status line may claim journal history is immutable or tamper-proof.

**Vocabulary, binding.** `daley40-lab` is a Founder-controlled identity, never
"an independent reviewer". The guarantee is exactly: *a privileged migration
cannot be initiated and released by the same authenticated GitHub session*. It
is `separation of execution identities`, **not** independent human review, two-
person control, four-eyes, or dual-human control. The permitted residual claim
is `platform-enforced against ordinary execution identities; residual Founder
platform authority remains`.

---

## 17. Attribution

Authored by the `br-architect` seat. No commit was produced, so no attribution
trailer is attached. If this file is later committed, the committing act carries
its own trailers per `DEC-20260718-05` and its own authorization.

---

## 18. Plan status

`FOUNDER_DECISION_REQUIRED`

Returned for one reason, recorded as **FD-1**: the architecture base
`75b52a23c1fe4bec02bdcb7257ac6273f4b4c242` and `origin/main`
`6d6110d41e65f7484a167d499141c639e6e403c2` have diverged, and §1 of the
commission requires this exact return with the exact diff and risk rather than
silent planning against a stale path.

The plan itself is complete: every tranche, file, database object, test, gate,
and rollback boundary is specified, and none of it changes under either base
selection (§1.3 proves the r6 surfaces are byte-identical at both). On the
Founder's disposition of FD-1, this artifact becomes
`IMPLEMENTATION-PLAN-READY` without redesign.

**`IMPLEMENTATION-PLAN-READY` would not authorize implementation, and this
status certainly does not.** No implementation authority exists. The next
legitimate act is a Founder disposition of FD-1, then Gate I.
