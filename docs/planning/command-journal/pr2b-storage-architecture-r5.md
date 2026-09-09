# PR 2b — Command-Journal Storage Architecture, Revision 5 (Deployment Authority Split)

Status: **PROPOSED — advisory. Architecture only.** No implementation
authority exists. This artifact creates no code, role, credential, Railway
service, variable, Neon object, migration, branch, commit, or PR.

Work ID: `BR-PR2B-JOURNAL-STORE-R5`
Supersedes: `BR-PR2B-JOURNAL-STORE-R4` (r4 is retained as evidence, not as
current status)
Seat: `br-architect` (Plan Authority; no approval, build, operate, or
risk-acceptance authority)
Next role: **Founder decision on §4.5, then Founder approval, then
implementation authorization.**

---

## 0. Controlling inputs and hashes

| Input | Path / identity | SHA-256 |
|---|---|---|
| Founder ruling (controlling) | "BINDING EXECUTION HEADER — PR 2b FOUNDER DEPLOYMENT-AUTHORITY RULING / ARCHITECTURE ONLY", this session | not a file artifact; operative clauses quoted at §§1–3 |
| Live Neon preflight (accepted finding) | `/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/HANDOFF-operator-to-founder-pr2b-live-neon-preflight-20260905.md` | `f8f63cbccb5dcd69b3db07ed38927523130d0649094419d7d38d9844a4501a64` — **independently re-hashed, MATCHES** (19,030 bytes, 250 lines) |
| Prior revision | `docs/planning/command-journal/pr2b-storage-architecture-r4.md` | `c8146f3858df83c5bacbed878da10035849eeabe64b398a2925db3a75131317a` — **re-hashed, MATCHES** (30,113 bytes, 570 lines) |
| Journal contract v0.17 | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` |
| Revision r3 | `docs/planning/command-journal/pr2b-storage-architecture-r3.md` | `beeb47f79e50ee2b37f50a0bc9d9c827f4710f739836792f891b4965f53af0f5` |
| Revision r2 | `docs/planning/command-journal/pr2b-storage-architecture-r2.md` | `0af104ab5a3ad0bb710c7743269ee5e40f43b1f6df43ad3ff982c6bf3a93da46` |

Repository HEAD at binding: `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242` —
matches the preflight's `BASE_SHA`/`HEAD_SHA`. No drift.

Live state accepted from the preflight (not re-verified by me; I hold no Neon
authorization): Neon project `orange-art-29526355`, branch
`br-summer-sun-avroco6a`, database `neondb`, sole customer LOGIN
`neondb_owner`, which is `pg_database.datdba`, holds `CREATEROLE`,
`CREATEDB`, `REPLICATION`, `BYPASSRLS`, and carries
`INHERIT`+`SET` membership in `neon_superuser`.

S1, S9, and S10 are accepted as genuine. **PR 2b implementation is not
authorized.**

---

## 1. Exact runtime role model

### 1.1 Role name — specified, as required

**`br_app_runtime`**

Naming basis, stated so it can be checked rather than trusted: it follows the
`br_` prefix already used for this architecture's roles (`br_journal_owner`),
names the function rather than the product, and collides with no role observed
live in the preflight (`neondb_owner`, `cloud_admin`, `neon_service`,
`neon_superuser`, and the `pg_*` predefined groups).

### 1.2 Required attributes and privileges

| Property | Required value |
|---|---|
| `rolcanlogin` | **true** (it is the application's login) |
| `rolsuper` | false |
| `rolcreaterole` | **false** |
| `rolcreatedb` | **false** |
| `rolbypassrls` | **false** |
| `rolreplication` | **false** |
| `rolinherit` | true (irrelevant — it will hold no memberships) |
| Membership in `neon_superuser` | **none** |
| Membership in `br_journal_owner` | **none** — no modifier variant |
| Membership in `command_journal_writer` | **none** — no modifier variant |
| Membership in `neondb_owner` | **none** |
| Membership in any `pg_write_all_data` / `pg_read_all_data`-class role | **none** |
| Ownership of journal objects | **none** |
| Journal `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` | **none** |

**Complete journal privilege set** (carried unchanged from r4 R-2):

- `SELECT` on `command_journal_events` and `command_journal_chain_head` —
  justified specifically: required for `verify()` chain recomputation from
  genesis (contract §4.1) and for the §2 projection over events. Read is not
  a write path and is required for the tamper-evidence property to be
  exercisable by the application.
- `EXECUTE` on `public.command_journal_append(...)`.

Nothing else on journal objects. Non-journal operational privileges
(`build_room_events`, `gateway_registry_events`, `phase3_run_*`, etc.) are
whatever the application already requires — enumerated at implementation time
from the existing schema, granted explicitly, never by blanket `ALL`.

### 1.3 Membership rule (r4 R-1, restated and extended)

**RULE R-1 (binding).** `br_app_runtime` shall receive no membership edge in
`br_journal_owner`, `command_journal_writer`, `neondb_owner`, or
`neon_superuser` — **including `WITH INHERIT FALSE`, `WITH SET FALSE`, or
both.** Proven necessary in r4 by measurement: with `inherit=false set=true`
a runtime login was denied ambient privilege but still executed `SET ROLE`,
then disabled the append-only trigger, tampered a row, and truncated the
table. `SET FALSE` closes the hole only until one later plain `GRANT`
silently restores `SET TRUE`.

**RULE R-3 (binding, CI-enforced).** The negative suite asserts
`pg_auth_members` contains **zero** edges from `br_app_runtime` to any of the
four roles above, and asserts `rolcreaterole`/`rolcreatedb`/`rolbypassrls`/
`rolreplication` are all false. A modifier-based edge must fail the assertion
exactly as a plain edge does.

---

## 2. Exact admin role model

### 2.1 `neondb_owner` — repurposed, not replaced

| Property | Required value |
|---|---|
| Identity | the **existing** Neon project-owner credential — no new admin credential is created |
| LOGIN | true |
| Use | administrative/deployment **only** |
| Present in the application runtime service | **false** — removed at cutover |
| Present in ordinary request handling | **false** |
| Present in application boot migrations | **false** |
| Capability | owns, or can assign ownership of, every object required to establish the journal boundary |

The Founder's clause is explicit and is honored: **no second
project-owner/admin credential is created merely to satisfy this
architecture.** The existing owner credential changes *where it lives* and
*what may use it*, not what it is.

### 2.2 `br_journal_owner` — unchanged from r4

`NOLOGIN`. No credential exists for it. Owns `command_journal_events`,
`command_journal_chain_head`, `command_journal_immutable()`, and both
append-only triggers. Zero membership edges from any runtime login.

### 2.3 `command_journal_writer` — unchanged from r4

`NOLOGIN`. No credential exists for it. Owns **only** the narrowly scoped
`command_journal_append(...)` routine — deliberately not the tables, so the
routine's body cannot inherit trigger-disabling power (the r3 finding, §6.7).
Holds `SELECT, INSERT` on events and `SELECT, UPDATE` on head. Zero
membership edges from any runtime login.

### 2.4 The invariant

`runtime compromise != administrative database compromise`

Measured support (local PostgreSQL 18.4, r4 harness) for the *shape* of this
model once instantiated: with all membership revoked, the runtime login was
denied `SET ROLE` to both privileged roles, denied `SET SESSION
AUTHORIZATION`, denied trigger disable, denied direct DML, and denied
alteration of the definer routine — while still appending successfully
through the routine. Those are local proofs of the design; the live-platform
equivalents are the §5 post-cutover matrix.

---

## 3. Credential custody model

No credential value appears in this artifact. Nothing is created, rotated,
copied, or moved by it.

| Credential | Identity | Custodian / store | Consumers | Explicitly denied to |
|---|---|---|---|---|
| **Administrative** | `neondb_owner` (existing) | the administrative plane's secret store only (§4) | the administrative plane's one-shot migration execution | the Railway application service; any runtime process; boot migrations; ordinary request handling |
| **Runtime** | `br_app_runtime` (new, restricted) | Railway application service variables, **sealed** | the application service (build + runtime) | the administrative plane does not need it and should not hold it |

**Custody rules:**

1. The application service must **never** receive the administrative
   credential — not as a service variable, not as a shared variable, not as a
   reference variable, not in a pre-deploy command (§4.2).
2. Both values should be stored as Railway **sealed** variables where they
   live in Railway. Railway documents sealed variables as write-only:
   "provided to builds and deployments but never visible in the UI nor
   retrievable via the API." This protects the runtime credential against
   dashboard-session or API-token leakage.
3. **Railway shared variables must not be used for either credential.** A
   shared variable is referenceable by any service in the environment; that
   is the precise property this split exists to defeat.
4. Railway cross-service reference syntax (`${{ServiceName.VAR}}`) means
   Railway does not *enforce* one service's inability to reference another's
   variable — isolation here is configuration discipline plus review, not a
   platform guarantee. **Stated as a limitation, not papered over**; it is
   one of the reasons §4 does not place the admin credential in Railway at
   all under the recommended option.
5. Rotation of `neondb_owner` at cutover is a Founder act, out of scope, and
   **recommended** — it has been used as a runtime credential and should be
   treated as runtime-exposed history.

---

## 4. Administrative deployment-plane mechanism

### 4.1 Evaluation against the ten required properties

The ruling's preferred direction is a distinct Railway migration/deployment
service. I evaluated it against all ten properties from primary Railway
documentation.

| # | Required property | Distinct Railway service | Isolated CI job (GitHub Actions, environment-gated) |
|---|---|---|---|
| 1 | distinct from the application service | **PASS** | **PASS** (not a Railway service at all) |
| 2 | holds `neondb_owner` without exposing it to runtime | **PASS** — service-scoped variables are per-service | **PASS** — credential never enters Railway |
| 3 | no public ingress requirement | **PASS** — services have no public domain unless one is added | **PASS** |
| 4 | executes only explicitly authorized operations | **PASS** (code-defined) | **PASS** (workflow-defined, SHA-pinned) |
| 5 | **fails closed before runtime deployment proceeds** | **FAIL** | **PASS** |
| 6 | does not become a continuously exposed runtime | **PASS** with cron mode (service executes and exits) | **PASS** — job exits |
| 7 | auditable deployment evidence | **PASS** — deploy logs | **PASS** — run logs, commit SHA, deployment records, approver identity |
| 8 | never grants the runtime service access to its variables | **PARTIAL** — per-service isolation holds, but `${{Service.VAR}}` reference syntax is available; discipline, not enforcement | **PASS** — environment secrets are only exposed to jobs referencing that environment |
| 9 | introduces no additional privileged database credential | **PASS** | **PASS** |
| 10 | **permits exact-SHA Founder authorization of each privileged tranche** | **FAIL** | **PASS** |

### 4.2 Why same-service Railway pre-deploy is rejected

The Founder's prohibition is correct and is confirmed verbatim by Railway's
own documentation. Railway's pre-deploy command page states:

> They execute within your private network and **have access to your
> application's environment variables.**

A pre-deploy command therefore runs inside the application service's secret
boundary. Placing the administrative credential where a pre-deploy command
could use it necessarily places it in the application service's
variable set — which is exactly the deployment/runtime secret boundary the
split exists to separate. Every property in §2.1 that says "unavailable to
normal application runtime" would be false the moment the variable is
defined. The prohibition is upheld on primary evidence, not merely accepted.

### 4.3 Why a distinct Railway service fails properties 5 and 10

**Property 5 — fail closed before runtime deployment proceeds.** Railway
provides no cross-service deployment ordering or gating primitive. Railway's
own guidance states:

> You can't specify a strict deployment order for services in a Railway
> project. By design, Railway deploys all services in parallel... The
> recommended approach is to make each service resilient enough to wait for
> its dependencies.

"Make the service resilient enough to wait" is application-level tolerance,
not a deployment gate. A separate admin service redeploys in parallel with
the application; a cron-scheduled admin service is *time*-triggered, cannot be
tied to a deploy, has a 5-minute minimum interval, is skipped if a prior run
is still executing, and carries no execution-time guarantee. None of these
can express "the runtime deployment must not proceed because privileged
migration failed."

**Property 10 — exact-SHA Founder authorization per tranche.** Railway's
deployment "Needs approval" behavior is repository-access-based and, per
Railway's own support channel, "cannot be disabled... as long as someone on
the team has access to the repo, they can approve deployments." That is not a
Founder-scoped, per-tranche, exact-SHA authorization gate.

These are structural platform limits, not configuration gaps. **I am not
selecting an alternative for convenience** — the ruling's own conditional
("if a distinct Railway service cannot satisfy those properties cleanly,
compare the minimum alternative") is triggered by two clean failures.

### 4.4 Selected mechanism

**An isolated, environment-gated CI/deployment job (GitHub Actions), executing
one-shot administrative migrations, with `neondb_owner` held as a GitHub
Actions *Environment secret* protected by required-reviewer approval.**

How it satisfies the two properties Railway cannot:

- **Property 10 and property 2, jointly, by the same mechanism.** GitHub
  documents that environment secrets are "only available to workflow jobs
  that reference the environment," and that **"if the environment requires
  approval, a job cannot access environment secrets until one of the required
  reviewers approves it."** The administrative credential is therefore
  *cryptographically unreachable* until the Founder approves that specific
  run — and a workflow run is bound to an exact commit SHA. That is the
  ruling's "exact-SHA Founder authorization of each privileged migration
  tranche," enforced by the platform rather than by process. GitHub also
  offers "prevent self-review," which should be enabled.
- **Property 5.** The privileged migration job and the runtime-deploy trigger
  are ordered jobs in one workflow: the deploy step runs only on the
  migration job's success. A failed privileged migration fails the workflow
  and the runtime deployment never proceeds. Fail-closed is expressible here
  and is not expressible across Railway services.
- **Property 8, strengthened.** The administrative credential never enters
  Railway at all, so no Railway reference-variable path to it can exist.

Minimum surface: no new service, no new ingress, no new privileged database
credential, and the repository already runs GitHub Actions
(`.github/workflows/ci.yml`, `path-audit.yml`, `attribution-shape.yml`), so
this adds a workflow and an environment, not a platform.

### 4.5 The one Founder decision this creates — `FOUNDER_DECISION_REQUIRED`

Selecting §4.4 moves custody of `neondb_owner` from **Railway's secret store**
to **GitHub Actions Environment secrets**. That is a *materially different
custody model*, and the ruling reserves such choices to the Founder. I state
the trade honestly rather than absorbing it:

- **Option A — GitHub Actions environment-gated job (recommended).**
  Satisfies all ten properties. Cost: admin credential custody moves to
  GitHub; the Founder's approval gate lives in GitHub; GitHub becomes a
  second custody domain for a database credential.
- **Option B — distinct Railway service.** Keeps admin credential custody
  within Railway (no new custody domain). Cost: properties 5 and 10 are
  **not** satisfied — no fail-closed ordering before runtime deploy, and no
  Founder-scoped per-tranche gate. Approval and sequencing would be manual
  process, i.e. discipline rather than enforcement — the standard this whole
  line of revisions has rejected.
- **Option C — hybrid: GitHub-gated trigger, Railway-held credential.** A
  GitHub environment-gated job calls the Railway API to run the admin
  service. Keeps the DB credential in Railway and the gate in GitHub. Cost:
  requires a privileged **Railway API token** in GitHub — a new privileged
  credential of a different kind, which brushes against required property 9
  — and failure signalling back to the gate is indirect. Not recommended.
- **Option D — Founder-operated local `psql` / Neon console.** No new
  automation surface at all; the Founder runs each tranche by hand. Cost:
  properties 5 and 7 (auditable deployment evidence, fail-closed sequencing)
  become manual; it does not scale past a few tranches, but it is the
  smallest possible plane and is legitimate for a one-time cutover.

**Recommendation: Option A.** It is the only option where the ruling's
required properties are enforced by a platform mechanism rather than by
process. **This is a recommendation, not a decision** — §4.5 is returned as
`FOUNDER_DECISION_REQUIRED`.

---

## 5. Journal DDL removal from the boot-migration path

**RULE R-4 / R-5 (binding, carried from r4 and now extended beyond journal
DDL).**

1. Journal owner-class DDL never runs through
   `packages/control-plane/src/migrations.ts`'s boot-applied `MIGRATIONS`
   array.
2. **The stronger requirement the ruling adds:** the normal application
   process must not need project-owner authority to start, and a runtime
   deployment must be able to start and operate holding only
   `br_app_runtime`. This is a change to the boot sequence itself, not only
   to journal DDL.

**Current state (re-read, independently, and consistent with the preflight):**
`main.ts:39` calls `migrate(pool)` on the `DATABASE_URL` pool during boot
(`config → pool → migrate → listen`), and `migrations.ts` contains DDL
requiring ownership-class authority (`CREATE TABLE`, `CREATE FUNCTION`,
`CREATE TRIGGER`, `ALTER TABLE ... VALIDATE CONSTRAINT`). Under a restricted
runtime identity, **that call will fail** — so boot migration cannot simply
be left in place.

**Design:**

- **All** schema-mutating migrations move to the administrative plane.
  `MIGRATIONS` remains the ordered, append-only source of truth and remains
  in the repository; what changes is **who executes it and when** — the
  admin plane, before deploy, not the runtime at boot.
- `main.ts` replaces `migrate(pool)` with a **read-only boot preflight
  assertion** that fails closed: it verifies the expected schema version is
  present (`schema_migrations`) and that the runtime login holds none of the
  forbidden privileges, and exits non-zero otherwise. The existing boot
  contract — "the process does not begin serving until the schema is
  present," per that module's own header — is preserved; only the actor
  changes. A deploy that runs ahead of its migration fails visibly instead of
  serving a broken schema.
- Ordering becomes: **admin plane migrates → runtime deploys.** Enforced by
  §4.4's job ordering, which is precisely why property 5 was
  non-negotiable.

---

## 6. Cutover sequence (fail-closed)

No cutover implementation is authorized. Each step names its actor, its
proof, and its abort condition. **Any step that fails aborts the cutover at
that point; no later step proceeds.**

| # | Step | Actor | Proof required to proceed | Abort |
|---|---|---|---|---|
| 1 | Create `br_app_runtime` LOGIN with the §1.2 attributes; generate its credential | Founder / admin plane | `pg_roles` shows `rolcanlogin=t`, `rolcreaterole=f`, `rolcreatedb=f`, `rolbypassrls=f`, `rolreplication=f`, `rolsuper=f` | any attribute wrong |
| 2 | Grant `br_app_runtime` the enumerated non-journal operational privileges it needs; verify the app's existing suites pass against it in a non-production branch | admin plane | full existing test suite green under the restricted identity | any required privilege missing → enumerate, do not blanket-grant |
| 3 | Create `br_journal_owner` and `command_journal_writer` as `NOLOGIN` | admin plane | `rolcanlogin=f` for both; no password set | either can log in |
| 4 | Create journal objects owned by `br_journal_owner`; create the append routine owned by `command_journal_writer`; apply §2/§3 grants and revokes; initialize the singleton head row to `seq=0` + 64-zero genesis | admin plane | ownership confirmed via `pg_tables`/`pg_proc`; exactly one head row | any ownership lands on a runtime-reachable role |
| 5 | **Prove the runtime denial matrix** (§7 NP-8…NP-14, R-1/R-3) as `br_app_runtime` | admin plane / CI | every denial observed as an actual PostgreSQL error | any denial does not fire |
| 6 | **Prove the controlled append path** — `EXECUTE` succeeds, single-transaction lifecycle+journal COMMIT / ROLLBACK / journal-failure cases | CI | all three §8.2 outcomes reproduced live | any case diverges |
| 7 | Remove privileged DDL from the boot path; replace with the read-only preflight assertion (§5) | Builder (code change, separately authorized) | boot no longer issues DDL; preflight fails closed on missing schema | boot still requires owner authority |
| 8 | Switch the Railway application service's `DATABASE_URL` to the `br_app_runtime` identity (sealed variable) | Founder | staged change reviewed and deployed | — |
| 9 | **Prove application startup and required runtime behavior under the restricted identity** — boot completes, `/health` serves, room lifecycle writes succeed, journal append succeeds via the routine | Founder / CI | green | any runtime failure → roll `DATABASE_URL` back to the prior identity (still possible until step 10) |
| 10 | **Prove `neondb_owner` is absent from the application's environment** — no service variable, no shared variable, no reference variable resolves to it; move the admin credential to the §4.4 plane's secret store | Founder | variable audit shows no admin credential in the app service | any residue |
| 11 | **Prove zero runtime membership paths** to `br_journal_owner`, `command_journal_writer`, `neondb_owner`, `neon_superuser` — recursive `pg_auth_members` walk from `br_app_runtime` | CI | zero edges at any depth | any edge |
| 12 | Rotate `neondb_owner` (recommended — it has runtime-exposed history) | Founder | rotation recorded | — |

**Rollback posture during cutover.** Steps 1–7 are additive and reversible:
the application is still running as `neondb_owner` and nothing has been taken
away. **Step 8 is the first irreversible-in-practice step** for runtime
behavior, and step 10 is the point after which admin authority is no longer
in the runtime environment. Rollback before step 8 is configuration-only.
After step 10, rollback means re-provisioning admin custody, which is a
Founder act.

**Journal-history rollback boundary (unchanged from r4, not weakened):**
before the first append, removal may be permissible with the
`count(*) = 0` precondition **checked, not assumed**; after the first
appended event, dropping journal history is destruction of governed records,
not ordinary rollback, and is unavailable to the Builder or Operator.
The safe reversal after first write is `REVOKE EXECUTE` on the append routine
— which fails dispatch closed per contract §5.1 — never a drop.

---

## 7. Post-cutover Neon verification matrix

The preflight is **not to be rerun unchanged**. Its NP checks returned
`NOT-PROVABLE-READ-ONLY` because the objects did not exist and mutation was
forbidden. They become provable only after cutover steps 1–4, executed by the
authorized admin plane. This matrix defines what must pass before
implementation may be certified.

**Group A — the S9 gate, re-asked (must pass first):**

| ID | Check | Pass criterion |
|---|---|---|
| **PC-0** | The role in the application's `DATABASE_URL` is `br_app_runtime`, **not** `neondb_owner` | distinct; `current_user` = `br_app_runtime` from the app's own connection |
| **PC-1** | `br_app_runtime` is not the database owner | `pg_database.datdba` ≠ `br_app_runtime` |
| **PC-2** | `br_app_runtime` has no membership in `neon_superuser` at any depth | recursive `pg_auth_members` walk returns zero; `pg_has_role(..., 'neon_superuser', 'USAGE'/'MEMBER'/'SET')` all false |
| **PC-3** | `br_app_runtime` attributes | `rolcreaterole=f`, `rolcreatedb=f`, `rolbypassrls=f`, `rolreplication=f`, `rolsuper=f` |
| **PC-4** | `br_app_runtime` holds no `pg_write_all_data` / `pg_read_all_data` class membership | zero |

**Group B — previously unprovable NP checks, now executable:**

| ID | Former NP | Check | Pass criterion |
|---|---|---|---|
| PC-5 | NP-1/NP-2 | `br_journal_owner`, `command_journal_writer` exist as `NOLOGIN` | `rolcanlogin=f` both |
| PC-6 | NP-3/NP-5 | Journal tables owned by `br_journal_owner` | `pg_tables.tableowner` confirms both |
| PC-7 | NP-4 | Append routine owned by `command_journal_writer`, **not** the table owner | `pg_proc.proowner` confirms |
| PC-8 | NP-6 | No sequence exists for the journal (design assigns `seq` in the routine); if any is introduced it is owned by `br_journal_owner` | confirmed |
| PC-9 | NP-7 | `command_journal_immutable()` and both triggers owned by `br_journal_owner` | confirmed |
| PC-10 | NP-8/NP-9 | Runtime cannot `SET ROLE` to either privileged role | `permission denied to set role`, both |
| PC-11 | — | Runtime cannot `SET SESSION AUTHORIZATION` to either | `permission denied`, both |
| PC-12 | NP-10 | Runtime denied `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on both journal tables | eight distinct `permission denied for table` |
| PC-13 | NP-11 | Runtime cannot disable, drop, or add journal triggers | `must be owner of table` |
| PC-14 | NP-12 | Runtime cannot `ALTER`/`CREATE OR REPLACE` the routine or change its owner | `must be owner of function` |
| PC-15 | NP-13 | Runtime cannot `SET session_replication_role='replica'` | `permission denied to set parameter` |
| PC-16 | NP-14 | No Neon-managed role silently grants broader privilege: full `pg_auth_members` audit plus `pg_default_acl` review for `br_app_runtime` | zero unexpected edges or default grants |
| PC-17 | NP-15 | Positive path intact: runtime `EXECUTE`s the routine and `SELECT`s both tables | succeeds |
| PC-18 | NP-16 | Routine ACL carries no `PUBLIC` execute entry | `proacl` has no bare `=X/` |

**Group C — the split itself:**

| ID | Check | Pass criterion |
|---|---|---|
| PC-19 | The Railway application service holds no administrative credential in any form (service, shared, or reference variable) | variable audit clean |
| PC-20 | The application boots and serves holding only `br_app_runtime` | boot completes, `/health` 200 |
| PC-21 | Boot issues no DDL | preflight-assertion path only |
| PC-22 | Privileged migration failure blocks runtime deployment | deliberately failed migration ⇒ deploy does not proceed |
| PC-23 | The administrative plane's secret is inaccessible without Founder approval | unapproved run cannot read the environment secret |

**Group D — retained:**

| ID | Check | Status |
|---|---|---|
| PC-24 | U3 — pool `search_path` does not alter resolution of the schema-qualified call site | **Already PASSED** in the preflight: repo pool sets only `statement_timeout`; live pooled and unpooled `search_path` both `"$user", public`. Re-confirm once post-cutover, as the pool identity changes. |

**Disposition:** any Group A failure ⇒ `FOUNDER_DECISION_REQUIRED` (S9
persists). Any Group B ownership failure prohibited by Neon ⇒ **S3**, return
`FOUNDER_DECISION_REQUIRED`, do not redesign around the limitation. Any Group
C failure ⇒ cutover is incomplete; do not certify.

---

## 8. Preserved invariants — none weakened

**8.1 Same-connection journal atomicity.** The runtime performs the lifecycle
insert and calls the append routine on **one connection, in one transaction**.
No second pool, no second runtime login, no two-phase commit. The
authority split changes *which* login the runtime uses, not how many.

**8.2 COMMIT / ROLLBACK / journal-failure proofs** (r3/r4, local PG 18.4):

```
COMMIT   : lifecycle rows=1  journal refs=1     (both persisted)
ROLLBACK : lifecycle rows=0  journal refs=0     (neither persisted; head did not advance)
FAILURE  : duplicate command_id inside the act -> lifecycle rows=0
```

A journal failure cannot orphan a lifecycle insertion. The act does not take
effect.

**8.3 `SECURITY DEFINER` hardening.** Pinned `search_path = pg_catalog,
pg_temp` (`public` deliberately absent); fully qualified object names;
`PUBLIC EXECUTE` revoked with a single explicit grant; no dynamic SQL; no
shadowing path. Containment measured: inside the routine `current_user` is
the writer, after the call it is the runtime login, and the runtime still
cannot `INSERT`. `SET ROLE` inside a definer function is refused by
PostgreSQL — **retained as defense in depth, never as a substitute for
removing membership.**

**8.4 Zero runtime membership edges.** §1.3 R-1/R-3, verified by PC-2, PC-10,
PC-11, PC-16.

**8.5 Builtin `pg_catalog.sha256()` binding.** `sha256(bytea)` is a
`pg_catalog` builtin; a non-superuser cannot create `pg_catalog.sha256`, and a
`pg_temp` overload does not capture resolution (verified against the NIST
vector for `"abc"`). **No user-defined hash helper may be substituted** —
including pgcrypto `digest()` — because a helper reopens the overload-hijack
vector demonstrated in r3. Stop condition S6.

**8.6 Trigger-bypass protections.** Append-only triggers on
`command_journal_events`; `session_replication_role` denied to the runtime at
parameter level; trigger disable requires ownership the runtime does not
hold.

**8.7 Tamper-evident, not tamper-proof.** Owner and superuser can still
disable triggers or `TRUNCATE`. Demonstrated: owner tamper succeeded and the
recomputed chain returned `MISMATCH-DETECTED`. **The authority split narrows
who holds owner authority; it does not eliminate the owner bypass.** No PR
body, test name, or status line may claim journal history is immutable or
tamper-proof.

**8.8 No second journal chain.** One canonical journal, one chain, one `seq`
space, two record classes (contract §1.2). Nothing in this revision creates,
permits, or implies a second authoritative command history.

**8.9 No runtime owner authority.** The whole purpose of this revision.

---

## 9. Stop conditions

Carried from r4 and extended.

- **S1** — the administrative plane would require a **new privileged
  credential**. *Status: resolved in principle by this ruling for the runtime
  identity only* — one new **restricted runtime** credential is approved; no
  new admin/owner credential is permitted. If the selected plane would need a
  second privileged credential (e.g. Option C's Railway API token), **stop:
  `FOUNDER_DECISION_REQUIRED`.**
- **S2** — controlling contract hash changes from `eaeb6178…9e52`.
- **S3** — any required Neon ownership operation (PC-5…PC-9) is prohibited by
  the platform. Return `FOUNDER_DECISION_REQUIRED`; do not redesign around it.
- **S4** — CI cannot run the negative matrix as a non-superuser login.
- **S5** — any design change granting a runtime login direct journal DML,
  membership in a privileged role (**with or without `INHERIT FALSE` /
  `SET FALSE`**), or ownership of journal objects.
- **S6** — substituting a user-defined hash helper for the builtin `sha256()`.
- **S7** — implementation would write a real control-plane act, activating
  contract §1.4 (out of scope, §10).
- **S8** — a second *privileged* database login is proposed. The one new
  **restricted runtime** login is approved by this ruling and is not an S8
  trigger.
- **S9** — the runtime login is, or can reach, the Neon project owner.
  **Currently TRIGGERED**; cleared only by PC-0…PC-4 passing post-cutover.
- **S10** — privileged DDL remains in the boot-applied path, or the
  application requires project-owner authority to start. **Currently
  TRIGGERED**; cleared by cutover step 7 and PC-20/PC-21.
- **S11 (new)** — the administrative credential is found in the application
  service's variable set in any form. Cutover step 10 / PC-19.
- **S12 (new)** — the administrative plane cannot block runtime deployment on
  privileged-migration failure (required property 5). PC-22.

---

## 10. Non-activating scope claim (preserved)

1. Permitted once authorized: journal tables, singleton head row and genesis
   initialization, immutability triggers, the two `NOLOGIN` roles, the
   restricted runtime role, grants/revokes, the append routine, and tests.
2. **This tranche does not claim to satisfy contract §1.4's dual-write rule.**
   §8.2 proves the *mechanism* can carry a lifecycle insert and a journal
   append in one transaction. §1.4 is satisfied only when a **later
   authorized dispatch integration performs both writes in one transaction as
   a real control-plane act.** That act does not exist here.
3. No dispatch path is activated; contract §5.1's pre-dispatch fail-closed
   rule is not exercised.
4. Phase 4 stop-gate items 2 and 4–10 are not discharged; storage-layer
   evidence contributes to items 1 and 3 only.

---

## 11. Governance

- **Storage locus and sole-writer rule:** already ruled —
  `DEC-20260827-01` §10; contract §3 **[RULED]**. This revision implements
  them.
- **Credentials:** the Founder has expressly approved **one new restricted
  runtime credential** and expressly forbidden a second admin credential.
  `DEC-20260815-17` §6's "new credentials" prohibition is addressed by that
  ruling, not by my inference. The two privileged database roles remain
  `NOLOGIN` with no credential.
- **Custody:** §3 describes both credentials' custody without values. The
  custody-domain question raised by §4.5 (Railway vs GitHub for the admin
  credential) is returned to the Founder rather than decided. Under
  `DEC-20260815-02`, custody posture is a Founder act.
- **Security posture:** moving admin authority out of the runtime service is a
  security-posture change and an `AGENTS.md` approval gate — the Founder has
  directed it, which supplies the authority.
- **Freeze:** per `DEC-20260827-01`'s recorded freeze disposition, the work is
  demanded by a shipping build; `DEC-20260814-03` clause 2 does not reach it,
  no clause 4 exception claimed.
- **Determination:** no DEC required for the *architecture*. A DEC may be
  required if the Founder determines that §4.5's custody move constitutes a
  **new credential custody domain** — that determination is the Founder's.

---

## 12. Remaining Founder questions

1. **§4.5 — administrative-plane custody model.** Options A–D with
   recommendation A. `FOUNDER_DECISION_REQUIRED`.
2. **Runtime role name ratification.** `br_app_runtime` is specified as
   required; confirm or substitute before implementation.
3. **`neondb_owner` rotation at cutover** (step 12) — recommended, since the
   credential has runtime-exposed history. Founder act.

---

## 13. Architecture status

**ARCHITECTURE DIRECTION APPROVED — DEPLOYMENT AUTHORITY SPLIT REQUIRES
DESIGN.**

The deployment authority split is now designed: runtime role model (§1), admin
role model (§2), credential custody (§3), administrative plane evaluated
against all ten required properties from primary documentation with two clean
Railway failures and a selected alternative (§4), journal and privileged DDL
removed from boot (§5), a twelve-step fail-closed cutover (§6), and a
twenty-four-check post-cutover verification matrix (§7).

It does **not** advance to `ARCHITECTURE-READY — IMPLEMENTATION REQUIRES
EXACT-SHA FOUNDER AUTHORIZATION`, because that transition requires the
administrative plane and cutover to be *fully specified* **and independently
reviewed**, and because §4.5 remains an open Founder decision on custody. One
material choice is unsettled by the ruling and is returned rather than
absorbed.

**No implementation authority exists.**

---

## Appendix A — verification provenance

**Re-verified in this session:** the preflight artifact's SHA-256
(`f8f63cbc…01a64`, 19,030 bytes, 250 lines) and r4's SHA-256
(`c8146f38…31317a`, 30,113 bytes, 570 lines) both match the values named in
the ruling. Repository HEAD `75b52a23…` matches the preflight's recorded SHA.
Repository re-read confirms `railway.toml` has no `releaseCommand`/
`preDeployCommand`, `main.ts:39` calls `migrate(pool)` at boot, and
`.env.example` declares a single `DATABASE_URL`.

**Platform claims in §4** come from primary vendor documentation retrieved
this session: Railway pre-deploy ("have access to your application's
environment variables"), Railway deployment ordering ("You can't specify a
strict deployment order... Railway deploys all services in parallel"), Railway
sealed variables (write-only, not retrievable via API), Railway cron jobs
(one-shot execution, 5-minute minimum, skipped if overlapping), and GitHub
Actions environments (environment secrets unavailable until a required
reviewer approves; required reviewers; prevent self-review).

**Database behavior claims in §§1, 2, 8** are measured facts from
**PostgreSQL 18.4** local harnesses across r2–r4
(`/tmp/br-journal-proof/`), each check executed over the tested role's own
login connection. Method note retained: `SET ROLE` privilege is evaluated
against the **session** user, so a superuser session cannot prove a boundary;
an early harness that did so was discarded.

**Live-platform fidelity limit, stated plainly.** The live Neon environment is
PostgreSQL 18.6 and is described here only via the accepted preflight report.
**I performed no Neon access in this session and hold no Neon authorization.**
Every post-cutover claim in §7 is a check to be executed, not a result.
