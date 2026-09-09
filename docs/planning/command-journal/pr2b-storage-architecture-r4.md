# PR 2b — Command-Journal Storage Architecture, Revision 4 (Out-of-Band Ownership Plane)

Status: **PROPOSED — advisory. Docs-only revision.** No implementation
authority exists. This artifact creates no code, migration, database object,
PostgreSQL role, credential, branch, commit, PR, or Neon mutation.

Work ID: `BR-PR2B-JOURNAL-STORE-R4`
Supersedes: `BR-PR2B-JOURNAL-STORE-R3`
Seat: `br-architect` (Plan Authority; no approval, build, operate, or
risk-acceptance authority)
Next role: **Founder approval, then live Neon preflight, then Builder.**

---

## 0. Controlling inputs and hashes

| Input | Path / identity | SHA-256 |
|---|---|---|
| Founder ruling (controlling) | "BINDING EXECUTION HEADER — FOUNDER ARCHITECTURE RULING / DOCS-ONLY REVISION", this session | not a file artifact; operative clauses quoted in §1 |
| Prior revision (ruled upon) | `docs/planning/command-journal/pr2b-storage-architecture-r3.md` | `beeb47f79e50ee2b37f50a0bc9d9c827f4710f739836792f891b4965f53af0f5` (38,040 bytes, 753 lines) |
| Journal contract v0.17 | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` |
| Revision r2 (superseded) | `docs/planning/command-journal/pr2b-storage-architecture-r2.md` | `0af104ab5a3ad0bb710c7743269ee5e40f43b1f6df43ad3ff982c6bf3a93da46` |
| Live migrations | `packages/control-plane/src/migrations.ts` | `924d8e30663a677967e455e1d8332106d6e3ee8e55b3a57e61322bcc71793745` |
| Live store | `packages/control-plane/src/store.ts` | `53df2679817d7d66c4f1a194cb8db23d4531fcad11e837ccc0978144188d0b74` |

Repository state at binding: branch `builder/prereq-c-c2-broker-ledger-worker`,
HEAD `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`. No drift from r3.

Governance re-read at FounderOS `8198ecf002324cc4e00cf035c7cb98c6de0bc746`.

---

## 1. U1 — exact disposition

### 1.1 The ruling, bound

The Founder **rejected** r3's recommended path
(`GRANT br_journal_owner TO <runtime login> WITH INHERIT FALSE`) as the final
security architecture, on the ground that `INHERIT FALSE` prevents ambient
inheritance but does not prevent `SET ROLE` when membership carries
`SET TRUE`.

**The ruling's premise is correct and is now measured, not merely accepted.**
Run against PostgreSQL 18.4 with membership granted exactly as r3 proposed:

```
membership: inherit=false set=true          <- SET defaults to TRUE

[DENY ] U1-2a runtime ambient UPDATE journal rows   | ERROR: permission denied for table
[DENY ] U1-2b runtime ambient DISABLE TRIGGER       | ERROR: must be owner of table
[ALLOW] U1-1  runtime SET ROLE br_journal_owner     | br_journal_owner
[ALLOW] U1-3  runtime SET ROLE -> DISABLE TRIGGER   | TRIGGER-DISABLED-BY-RUNTIME-LOGIN
[ALLOW] U1-2c runtime SET ROLE -> UPDATE a row      | SET-ROLE-TAMPER
[ALLOW] U1-5  runtime SET ROLE -> TRUNCATE          | TRUNCATE-PERMITTED
```

`INHERIT FALSE` did exactly what r3 claimed — it blocked ambient privilege —
**and it was irrelevant to the attack.** One `SET ROLE` restored full owner
authority to the runtime login, which then disabled the append-only trigger,
tampered a row, and truncated the table. The Founder's rejection is upheld on
evidence; r3's recommendation was insufficient and is withdrawn.

**`SET FALSE` was also tested and is likewise rejected as an architecture:**

```
[DENY ] SET ROLE with INHERIT FALSE, SET FALSE  | ERROR: permission denied to set role
        ...but the membership edge still exists : 1 row
```

It closes the hole while it lasts, but leaves an edge in `pg_auth_members`
whose only protection is a modifier: a single later plain
`GRANT br_journal_owner TO <runtime login>` silently restores `SET TRUE`.
That is discipline, not enforcement — the standard contract §3 rejects.

### 1.2 Disposition

**U1 is RESOLVED BY FOUNDER RULING. The runtime/control-plane login holds no
membership in `br_journal_owner` — none, with no modifier variant accepted.**
Journal-object creation, ownership assignment, and all future journal DDL move
to an out-of-band administrative/deployment plane (§3).

The r3 option (a) is withdrawn. The r3 option (b) is now the ruled
architecture. The r3 option (c) remains rejected.

### 1.3 The ruled invariant, measured

Target invariant: **`runtime compromise != journal owner compromise`.**

With all membership revoked — the ruled final state:

```
membership edges for the runtime login: 0

[DENY ] U1-6  runtime SET ROLE br_journal_owner        | ERROR: permission denied to set role
[DENY ] U1-7  runtime SET ROLE command_journal_writer  | ERROR: permission denied to set role
[DENY ] U1-8  runtime SET SESSION AUTHORIZATION owner  | ERROR: permission denied to set session authorization
[DENY ] U1-9  runtime DISABLE journal trigger          | ERROR: must be owner of table
[DENY ] U1-10 runtime direct DML on journal            | ERROR: permission denied for table
[DENY ] U1-11 runtime ALTER the SECURITY DEFINER routine | ERROR: must be owner of function
[ALLOW] U1-12 runtime appends via the routine          | seq 21
```

The runtime login retains exactly one journal capability — invoking the
append routine — and no path to owner authority.

---

## 2. Runtime-to-owner membership rule (exact)

**RULE R-1 (binding).** No runtime application login and no runtime
control-plane login shall be granted, by any mechanism or modifier:

1. `INHERIT` access to `br_journal_owner`;
2. `SET ROLE` access to `br_journal_owner`;
3. any membership edge in `br_journal_owner`, including
   `WITH INHERIT FALSE`, `WITH SET FALSE`, or both;
4. membership in `command_journal_writer`;
5. direct DML (`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`) on any journal table;
6. ownership authority over any journal object (table, trigger, trigger
   function, append routine, sequence);
7. `CREATEROLE`, `ADMIN OPTION` on either privileged role, or any privilege
   permitting self-grant.

**RULE R-2 (binding).** The runtime login's complete journal privilege set is
exactly:

- `SELECT` on `command_journal_events` and `command_journal_chain_head`
  (for `verify()` and projections);
- `EXECUTE` on `command_journal_append(...)`.

Nothing else. Any addition is plan drift (stop condition S5).

**RULE R-3 (binding, CI-enforced).** The negative suite must assert
`pg_auth_members` contains **zero** edges from the runtime login to either
privileged role. This is the regression test for the defect this ruling
exists to prevent; a modifier-based edge must fail the assertion just as a
plain edge does.

**Verified privilege snapshot of the ruled state:**

```
runtime SELECT on events   = true      runtime INSERT on events = false
runtime EXECUTE on append  = true      runtime CREATE on public = (its own migrations only)
writer  CREATE on public   = false     owner   CREATE on public = false
append routine owner       = command_journal_writer   secdef = true
append routine ACL         = {writer=X/writer, runtime=X/writer}   <- no PUBLIC entry
membership edges among the three roles = (none)
```

---

## 3. Out-of-band DDL rule (exact)

**RULE R-4 (binding).** Journal-object creation, ownership assignment, and all
future journal DDL execute through an **out-of-band administrative/deployment
plane**, never through the runtime login and never through the application's
boot-migration path.

**RULE R-5 (binding).** Journal DDL is therefore **excluded from
`packages/control-plane/src/migrations.ts`'s boot-applied `MIGRATIONS` array.**
This is a structural change from r3 and is the ruling's direct consequence.

### 3.1 Current-state finding — there is no such plane today

Fresh read-only inspection establishes, as fact, that **this repository has no
out-of-band DDL plane at present**:

- `railway.toml` `[deploy]` declares `startCommand = "npm start"` and a
  healthcheck. There is **no** `releaseCommand`, `preDeployCommand`, or any
  other pre-start hook.
- `npm start` runs `dist/packages/control-plane/src/main.js`, whose boot
  sequence is `config → pool → migrate → listen` (`main.ts:39` calls
  `migrate(pool)`), on the pool built from **`DATABASE_URL`** — the runtime
  credential.
- `.env.example` declares exactly one database variable, `DATABASE_URL`. There
  is no admin/owner connection string.
- No script under `scripts/`, `packages/`, or `.github/` connects with a
  non-runtime database role.

**Consequence:** today, all DDL runs as the runtime login at boot. The ruled
architecture cannot be implemented by editing `migrations.ts` alone. A
deployment-plane change is required, and it is not in this tranche's scope.

### 3.2 The candidate plane, and the clause-5 stop

The Founder's clause 4 does **not** authorize a new migration credential, and
clause 5 requires a stop if the existing administrative plane cannot perform
the ownership operations without one.

The candidate is the **Neon project's pre-existing owner/admin role**,
operated by the Founder through the Neon console SQL editor or a
Founder-operated `psql` session. If that role already exists and is already
held by the Founder, using it introduces **no new credential** — it is an
existing administrative credential being used for its ordinary purpose, and
clause 5's stop is not triggered.

**This is a candidate, not a verified fact, and I do not assume it.** Two
questions must be answered on the live platform before implementation (§4):

- **Q1:** does a Neon owner/admin role exist that is **distinct from** the
  role in `DATABASE_URL`?
- **Q2 (critical):** is the `DATABASE_URL` role *itself* the Neon project
  owner? Neon commonly provisions a single project-owner role (e.g.
  `neondb_owner`) and applications are frequently configured with it.

**If Q2 is true, the ruled invariant is already violated before any journal
object exists** — the runtime login would hold owner authority over everything
in the database, `br_journal_owner` would be creatable and assumable by it,
and `runtime compromise == journal owner compromise` by construction. In that
case the remedy is to provision a *reduced-privilege runtime role* and move
the application to it — which is a change to the existing runtime credential
and a security-posture change, both reserved to the Founder. That is a
**`FOUNDER_DECISION_REQUIRED`** outcome, not something to design around
(§7, S3/S9).

### 3.3 Operational consequence, stated

Splitting journal DDL out of boot migration means:

- journal schema changes are a **deliberate Founder-operated act**, not an
  automatic consequence of deploy;
- a deploy whose code expects journal objects that the admin plane has not yet
  created will fail closed at first append (`ERROR: relation does not exist`),
  which is the correct direction of failure but must be sequenced: **admin
  plane first, deploy second**;
- the boot migrator continues to own all non-journal tables unchanged.

This cost is the price of the ruled invariant and is recorded as accepted by
the ruling, not re-argued here.

---

## 4. U2 — narrowed to live Neon ownership / managed-role verification

r3's U2 asked broadly whether Neon supports NOLOGIN roles. The Founder has
narrowed it: public capability establishes NOLOGIN support, so the remaining
work is **live-platform verification on the actual target Neon environment.**

**This artifact does NOT mark any Neon verification complete.** Nothing below
has been executed against Neon. All r4 measurements are local PostgreSQL 18.4
(§9). The checks below are a preflight the Builder must execute and record
before implementation.

### 4.1 Required live checks

| ID | Check | Pass criterion | Fail |
|---|---|---|---|
| **NP-0** | Identify the role in `DATABASE_URL` and the Neon project owner role; determine whether they are the same (§3.2 Q1/Q2) | they are **distinct**, and the runtime role is not the project owner | `FOUNDER_DECISION_REQUIRED` (S9) |
| **NP-1** | `CREATE ROLE br_journal_owner NOLOGIN` behaves as required | role created, cannot authenticate | S3 |
| **NP-2** | `CREATE ROLE command_journal_writer NOLOGIN` | same | S3 |
| **NP-3** | The existing authorized administrative role can create the journal tables **owned by** `br_journal_owner` | ownership lands on the NOLOGIN role | S3 |
| **NP-4** | `ALTER FUNCTION command_journal_append(...) OWNER TO command_journal_writer` | function owner is the writer, not the table owner | S3 |
| **NP-5** | Table ownership assignment (`ALTER TABLE ... OWNER TO br_journal_owner`) for both journal tables | owner confirmed via `pg_tables` | S3 |
| **NP-6** | Sequence ownership, **if applicable** — the design uses no sequence (`seq` is assigned by the routine, not a `serial`), so this check confirms *no sequence exists*; if any identity/serial column is introduced, its sequence must be owned by `br_journal_owner` | no sequence, or sequence owned correctly | S3 |
| **NP-7** | Trigger and trigger-function ownership: `command_journal_immutable()` and both triggers owned by `br_journal_owner`; trigger ownership follows the table | confirmed via `pg_proc` / `pg_trigger` | S3 |
| **NP-8** | Runtime login **cannot** `SET ROLE br_journal_owner` | permission denied | S3 |
| **NP-9** | Runtime login **cannot** `SET ROLE command_journal_writer` | permission denied | S3 |
| **NP-10** | Runtime login **cannot** perform journal DML directly (INSERT/UPDATE/DELETE/TRUNCATE, both tables) | permission denied, all eight | S3 |
| **NP-11** | Runtime login **cannot** disable, drop, or add journal triggers | must be owner of table | S3 |
| **NP-12** | Runtime login **cannot** alter or `CREATE OR REPLACE` the SECURITY DEFINER routine, nor change its owner | must be owner of function | S3 |
| **NP-13** | Runtime login **cannot** `SET session_replication_role='replica'` | permission denied to set parameter | S3 |
| **NP-14** | No Neon-managed role behavior silently grants broader privilege than assumed — audit `pg_auth_members` for **all** edges touching the three roles, and audit default-privilege grants (`pg_default_acl`) and any Neon-injected role (e.g. a `neon_superuser`-class role) that the runtime login may belong to | zero unexpected edges; runtime login is not a member of any role carrying owner authority | S3 / S9 |
| **NP-15** | Runtime login **can** still `EXECUTE` the append routine and `SELECT` both tables | positive path intact | S3 |
| **NP-16** | The append routine's ACL carries **no** `PUBLIC` execute entry after creation on Neon | `proacl` has no bare `=X/` entry | S3 |

**NP-14 is not boilerplate.** Managed Postgres platforms commonly place
customer roles in a platform-managed group. If the runtime login is a member
of any role that owns or can assume ownership of customer objects, the
invariant fails on the real platform even though every check above passes in
isolation.

### 4.2 Disposition rule

If **any** required ownership operation (NP-1 through NP-7) is prohibited by
Neon: **STOP CONDITION S3**, return `FOUNDER_DECISION_REQUIRED`, and **do not
redesign around the limitation without Founder authority.**

If NP-0 or NP-14 shows the runtime login already holds or can reach owner
authority: **return `FOUNDER_DECISION_REQUIRED` (S9).** Do not weaken the owner
boundary and do not invent a credential to work around it.

---

## 5. U3 — retained, unchanged

**Status: OPEN, low risk, pre-implementation verification.**

Confirm on the actual pool that the control-plane connection does not set a
`search_path` that would change resolution of the `command_journal_append`
call site. Risk is low because the call site is schema-qualified
(`public.command_journal_append(...)`) and the routine itself pins
`search_path = pg_catalog, pg_temp`.

**No architecture expansion is authorized by U3.** It is a verification, not a
design question.

---

## 6. Preserved r3 findings — none weakened

All r3 security properties are carried forward unchanged and remain measured
facts on PostgreSQL 18.4.

**6.1 Single-connection transactional atomicity.** The runtime login performs
the lifecycle insert and calls the append routine on **one connection, in one
transaction**. No second pool, no second login, no two-phase commit.

**6.2 COMMIT / ROLLBACK / journal-failure proofs.**

```
COMMIT   : lifecycle rows=1  journal refs=1        (both persisted)
ROLLBACK : lifecycle rows=0  journal refs=0        (neither persisted)
           head after rollback=3  tail=3           (latch did not advance)
FAILURE  : duplicate command_id inside the act -> lifecycle rows=0
```

**6.3 A journal failure cannot orphan a lifecycle insertion.** The third case
above is the governance-critical one: when the journal append fails, the
lifecycle insert does not persist. The act does not take effect.

**6.4 `session_replication_role='replica'` attack denied.**

```
[DENY ] runtime SET session_replication_role='replica' | ERROR: permission denied to set parameter
```

**6.5 Builtin `pg_catalog.sha256()` binding.** `sha256(bytea)` is a
`pg_catalog` builtin; a non-superuser cannot create `pg_catalog.sha256`
(`permission denied for schema pg_catalog`), and a `pg_temp` overload does not
capture resolution — verified against the NIST vector for `"abc"`
(`ba7816bf…15ad`).

**6.6 Prohibition on user-defined hash-helper substitution.** The design
**must not** introduce a user-defined hash helper (including pgcrypto
`digest()`). A helper reopens the overload-hijack vector demonstrated in r3;
the builtin under a pinned `pg_catalog` path does not. Stop condition S6.

**6.7 SECURITY DEFINER containment.**

```
inside the routine : current_user = command_journal_writer / session = runtime login
after the call     : current_user = runtime login          (elevation does not persist)
after the call     : runtime INSERT still denied
SET ROLE inside a definer function -> ERROR: cannot set parameter "role" within security-definer function
```

Per the ruling, the `SET ROLE`-refusal fact is **retained but not relied upon
as a substitute** for removing runtime membership. Removal (R-1) is the
control; this is defense in depth.

**6.8 Runtime app cannot directly INSERT.** Confirmed before and after the
membership revocation, and after invoking the routine.

**6.9 Owner/superuser tamper remains possible but detectable.**

```
owner disabled trigger and edited row 1 -> payload='TAMPERED'
recomputed-chain check                  -> MISMATCH-DETECTED
owner TRUNCATE                          -> PERMITTED (bypasses row triggers)
```

**6.10 The claim remains: tamper-evident, not tamper-proof.** No PR body, test
name, or status line may assert journal history is immutable or tamper-proof.
The defensible claim is: append-only enforced against every non-owner role;
owner-level and superuser-level tampering remains possible and is detectable
by `verify()`. The r4 ruling *narrows who holds owner authority* — it does not
eliminate the owner bypass, and does not change this statement.

**6.11 Append correctness (unchanged from r3).** Singleton initialization by
the admin plane; `SELECT ... FOR UPDATE` on the sole head row; pre-write
verification of head against tail on **both** `seq` and `chain_hash`;
12-way concurrency producing `rows=16 distinct_seq=16 distinct_hash=16 gaps=0`
with head==tail; duplicate `(command_id, event_type)` rejected by partial
unique index; head divergence aborting with row count unchanged
(`before=16 after=16`).

---

## 7. Stop conditions (preserved and extended)

- **S1** — the out-of-band administrative plane cannot perform the required
  ownership operations without a **new login or credential**. Per the ruling's
  clause 5: **stop, return `FOUNDER_DECISION_REQUIRED`.** Do not invent a
  credential; do not weaken the owner boundary.
- **S2** — the controlling contract hash changes from `eaeb6178…9e52`.
- **S3** — any required Neon ownership operation (NP-1…NP-7) is prohibited, or
  any runtime-denial check (NP-8…NP-14) fails on the live platform. Return
  `FOUNDER_DECISION_REQUIRED`; do not redesign around the limitation.
- **S4** — CI cannot run the negative matrix as a non-superuser login. An
  unenforceable claim must not merge as an enforced one.
- **S5** — any design change granting the runtime login direct journal DML,
  membership in either privileged role (**with or without `INHERIT FALSE` /
  `SET FALSE`**), or ownership authority over journal objects. This is the
  r4 ruling's own regression condition.
- **S6** — any implementation substituting a user-defined hash helper for the
  `pg_catalog` builtin `sha256()`.
- **S7** — implementation would write a real control-plane act, activating
  contract §1.4; outside this tranche's scope (§8).
- **S8** — a second database login or credential is proposed for this tranche.
- **S9 (new)** — live preflight shows the `DATABASE_URL` role **is** the Neon
  project owner, or reaches owner authority through a platform-managed role
  (NP-0 / NP-14). The ruled invariant is then already violated independently
  of this design. Return `FOUNDER_DECISION_REQUIRED`.
- **S10 (new)** — journal DDL is placed into the boot-applied `MIGRATIONS`
  array, contrary to R-4/R-5.

---

## 8. Non-activating scope claim (preserved)

1. Permitted in this tranche, **once authorized**: journal tables, singleton
   chain-head row and its genesis initialization, immutability triggers, the
   two NOLOGIN roles, grants/revokes, the append routine, and tests.
2. **This tranche does not claim to satisfy contract §1.4's dual-write rule.**
   §6.2 proves the *mechanism* can carry a lifecycle insert and a journal
   append in one transaction. §1.4 is satisfied only when a **later authorized
   dispatch integration performs both writes in one transaction as a real
   control-plane act.** That act does not exist here, and no test may be
   represented as proving it.
3. No dispatch path is activated; contract §5.1's pre-dispatch fail-closed
   rule is not exercised.
4. Phase 4 stop-gate items 2 and 4–10 are not discharged. Storage-layer
   evidence contributes to items 1 and 3 only.
5. Any PR-body statement that this tranche "implements the journal" or
   "satisfies §1.4" misrepresents this plan.

---

## 9. Rollback boundary (preserved)

**Before the first append.** `SELECT count(*) FROM command_journal_events`
returns `0` and the head sits at `seq=0` with the genesis hash. Removal may be
permissible: the admin plane drops the tables, routine, roles, and grants.
**The precondition is checked, never assumed.**

**After the first appended event.** The journal holds governed command history
and is append-only by ruling. **Dropping journal history is destruction of
governed records, not ordinary rollback, and is not available to the Builder
or the Operator under any circumstance.** Available reversals:

- disable the write path (deploy/config revert); rows remain;
- **`REVOKE EXECUTE`** on the append routine — the journal becomes read-only
  and dispatch fails closed per contract §5.1, the designed safe state. Under
  r4 this revoke is itself an admin-plane act, not a runtime one;
- forward-only correction by appending compensating events;
- additive schema changes only.

Destroying journal rows after first write requires an explicit Founder
decision and is a records/custody act, not an engineering rollback.

---

## 10. Governance re-evaluation

**No change from r3's determination, and the ruling strengthens it.**

- **Storage locus and sole-writer rule:** already ruled —
  `DEC-20260827-01` §10; contract §3 **[RULED]** (Founder, 2026-09-01),
  requiring a writer role "distinct from any role the control plane uses for
  operational tables" and enforcement "by grant, not by discipline." R-1/R-2
  implement those words more strictly than r3 did.
- **No new credential:** both privileged roles are NOLOGIN with no password
  and no connection string; no environment variable is added. The ruling's
  clause 4 forbids a new migration credential, and this design proposes none.
  `DEC-20260815-17` §6's "new credentials" prohibition is not engaged —
  **subject to S1**, which stops the work rather than inventing one.
- **No new custody domain:** `DEC-20260827-01` §10 "Security and custody"
  holds existing custody and sole-writer authority controlling; contract §3
  confirms no new custody domain. With no secret introduced, no
  `DEC-20260815-02` custody trigger arises.
- **No new infrastructure:** the store is the already-bound Neon project
  (contract §3; `DEC-20260815-08`).
- **Freeze:** per `DEC-20260827-01`'s recorded freeze disposition, this work is
  demanded by a shipping build (the Build Room v1 slice, clause 7's freeze-exit
  criterion); `DEC-20260814-03` clause 2 does not reach it, no clause 4
  exception claimed.
- **`SECURITY DEFINER` is not a new enforcement mechanism** requiring a DEC:
  it is `EXECUTE` privilege plus function ownership, both ordinary GRANT-system
  constructs, implementing the boundary contract §3 already ruled.

**Security-posture note.** r3 flagged that granting the runtime login owner
membership would be a security-posture change requiring an `AGENTS.md`
approval gate. **The Founder's ruling removes that membership entirely, so the
gate is no longer engaged by this design.** Moving journal DDL to an
out-of-band plane is a deployment-process change, which the Founder has
directed; it is not a governance change and creates no rule.

**Determination:** the r4 design remains **within existing rulings and
requires only a future exact-SHA Founder implementation authorization — no
DEC, no credential-custody trigger** — conditional on the live preflight (§4)
not triggering S1, S3, or S9.

---

## 11. Expected paths (proposed, not created)

| Path | Action |
|---|---|
| **out-of-band admin plane** (Founder-operated; not a repository file) | Journal DDL: roles, tables, singleton + genesis row, triggers, grants, append routine, ownership assignment. **Not** in `migrations.ts` (R-4/R-5). |
| `packages/control-plane/src/migrations.ts` | **UNCHANGED for journal DDL.** May gain a read-only *preflight assertion* that journal objects exist and that the runtime login holds no forbidden privilege — failing closed at boot if the admin plane has not run. |
| `packages/journal/src/journal-store.ts` | CREATE — thin caller of `command_journal_append(...)` on the **existing** pool. No new pool. |
| `packages/journal/src/index.ts` | MODIFY — export the store surface. |
| `test/command-journal.storage.test.ts` | CREATE — positive, concurrency, rollback, divergence, duplicate-id. |
| `test/command-journal.permissions.test.ts` | CREATE — the negative matrix incl. R-3's `pg_auth_members` assertion. |
| `.github/workflows/ci.yml` | MODIFY — `storage-integration` must provision the roles **as the admin plane would** and run the negative suite as a **non-superuser** login. |
| `docs/planning/command-journal/pr2b-storage-architecture-r4.md` | CREATE — this artifact. |

**CI note, load-bearing:** the existing `storage-integration` job runs
`postgres:16` as the `postgres` superuser and would pass every negative test
vacuously. It must run the negative suite over a non-superuser connection.
Coverage that depends on the superuser is precisely the lapse that job's own
comment (`ci.yml:69–72`) exists to prevent.

---

## 12. Architecture status

**ARCHITECTURE-READY — IMPLEMENTATION BLOCKED ON LIVE NEON PREFLIGHT.**

The U1 ruling is incorporated; runtime membership in `br_journal_owner` is
removed as an accepted architecture and its insufficiency is proven, not
merely accepted. Out-of-band administrative DDL is named as the controlling
ownership path, with a clause-5 stop retained if that path would require a new
credential. U2 is narrowed to live Neon ownership/managed-role verification
and is **not** marked complete. U3 is retained unchanged. All r3 security
properties are preserved, none weakened.

U2 and U3 are treated here as **pre-implementation verification gates**, not
unresolved architecture design choices — which is the condition the ruling
attaches to this status wording.

**No implementation authority exists.** This plan is advisory until the
Founder approves it and issues an exact-SHA implementation authorization, and
until the §4 preflight is executed and recorded on the live target
environment.

---

## Appendix A — verification provenance

r4-specific measurements (U1-1 … U1-13, and the `SET FALSE` probe) are real
output from **PostgreSQL 18.4** (Homebrew, `aarch64-apple-darwin25.6.0`) on
2026-09-05, scratch database `cjp4`, roles `br_journal_owner_r3` (NOLOGIN),
`command_journal_writer_r3` (NOLOGIN), `br_app_r3` (LOGIN). Every runtime-side
check ran over the runtime login's own connection (`psql -U br_app_r3`).
Harness: `/tmp/br-journal-proof/r4-u1.sh` plus the saved follow-up script.

r3 measurements carried forward in §6 come from the same cluster and database;
harnesses `r3-setup.sql`, `r3-verify.sh`, `r3-harden.sh`, `r3-harden2.sh`,
`r3-harden3.sh`.

**Method notes, recorded because they invalidated intermediate readings:**

1. `SET ROLE` privilege is evaluated against the **session** user; a superuser
   session cannot prove a boundary. All results use real per-role logins.
2. The first U1-2 reading referenced a column (`canonical_row`) that does not
   exist in the harness schema, producing a schema error rather than a
   permission result. It was re-run against a real column (`payload`); the
   corrected readings are U1-2a/2b/2c.
3. Earlier r3-era invalidations (revoke-before-create ordering; probe
   functions authored after `CREATE` had been revoked; the md5 stand-in
   helper's overload surface) are documented in the r3 artifact and drove the
   §6.5/§6.6 binding to the builtin.

**Fidelity limit, stated plainly.** Every measurement in this artifact is
local PostgreSQL 18.4. **No verification has been performed against Neon.**
The bound store is Neon (Postgres 16 in CI). Neon's managed role model,
platform-injected roles, and ownership permissions are **unverified** — that
is exactly what §4 exists to resolve, and why the status is
IMPLEMENTATION BLOCKED ON LIVE NEON PREFLIGHT.
