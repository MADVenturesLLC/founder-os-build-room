# PR 2b — Command-Journal Storage Architecture, Revision 2 (Writer Boundary)

Status: **PROPOSED — advisory until Founder approval.** Read-only planning
artifact. No code, migration, role, credential, or PR is created by this
document.

Work ID: `BR-PR2B-JOURNAL-STORE-R2`
Seat: `br-architect` (Plan Authority; no approval, build, or operate authority)
Next role: **Founder approval, then Builder.**

---

## 0. Controlling inputs and hashes

Bound by fresh read-only inspection on 2026-09-05, not from memory.

| Input | Path | SHA-256 |
|---|---|---|
| Journal contract v0.17 (controlling) | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` |
| Live migrations (current state) | `packages/control-plane/src/migrations.ts` | `924d8e30663a677967e455e1d8332106d6e3ee8e55b3a57e61322bcc71793745` |
| Live store (current writer) | `packages/control-plane/src/store.ts` | `53df2679817d7d66c4f1a194cb8db23d4531fcad11e837ccc0978144188d0b74` |

Repository state at binding: branch `builder/prereq-c-c2-broker-ledger-worker`,
HEAD `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`, working tree clean except
untracked `.worktrees/`. The contract file on disk is byte-identical to
`main`'s copy (verified by `git show main:… | shasum`), so there is no
contract drift between the branch and `main`.

Governance sources re-read at FounderOS `8198ecf002324cc4e00cf035c7cb98c6de0bc746`:
`DEC-20260827-01` §10 (command-journal ruling, incl. "Security and custody"
and the freeze disposition), `DEC-20260815-17` "Founder Authorization —
Phase 4" §§2–7, `DEC-20260815-02`, `DEC-20260815-08`, `DEC-20260814-03`.

**Input gap, stated:** no PR 2b proposal artifact exists on disk in this
repository or any attached worktree (`search_files` for `journal-store`,
`SET LOCAL ROLE`, `PR 2b` returns nothing outside unrelated seat-registry
plans). This revision therefore binds to the contract v0.17 text and to the
reviewer's quoted design, not to a hashed proposal document. **If a PR 2b
artifact exists elsewhere, it must be supplied and re-hashed before this
plan is approved** — see stop condition S1.

---

## 1. The reviewer is correct, and the proof is stronger than stated

### 1.1 What was tested

The critique was verified empirically against **PostgreSQL 18.4** (local
Homebrew cluster), not by reasoning alone. Method matters here: `SET ROLE`
privilege is evaluated against the **session user**, and a superuser session
that does `SET ROLE app` retains superuser SET-ROLE power. In-session role
switching therefore *cannot* prove a boundary. Every check below ran over its
**own login connection** as the role under test (`psql -U <role>`), which is
the only valid method.

Scratch database `cjp3`, three real login roles: `owner_role` (table owner),
`writer_role` (`command_journal_writer` analogue), `app_role` (ordinary
control-plane login).

### 1.2 Result — the proposed design is worse than "unenforced"

With `GRANT writer_role TO app_role` (the design under review):

```
[ALLOW] A1 app: SET ROLE writer_role                  -> writer_role
[ALLOW] A2 app: INSERT with NO SET ROLE (inherited)   -> seq 901
[ALLOW] A3 app: UPDATE cj_head with NO SET ROLE       -> ok
[ALLOW] A4 app: SET LOCAL ROLE; COMMIT; then INSERT   -> seq 902
```

Three findings, of which the second is the one that kills the design:

1. **A1 confirms the reviewer's stated critique**: membership permits
   `SET ROLE`, so `journal-store.ts` holds no exclusive capability.
2. **A2 is worse than the critique.** Default membership is
   `WITH INHERIT TRUE`, so `app_role` inserted into the journal table
   **without issuing `SET ROLE` at all**. `SET LOCAL ROLE` in
   `journal-store.ts` is not merely unenforced — it is *decorative*. The
   privilege is already live on every ordinary control-plane connection.
3. **A4 shows the latch does not close.** `SET LOCAL ROLE` reverts at
   `COMMIT`, but the inherited privilege survives it, so a post-commit write
   succeeds anyway.

PostgreSQL's own documentation states the rule A1 exercises: "The current
session user must have the `SET` option for the specified role_name... If the
session user role has been granted memberships `WITH INHERIT TRUE`, it
automatically has all the privileges of every such role."
(`postgresql.org/docs/18/sql-set-role.html`.)

**Verdict on the writer-role design as proposed: rejected on evidence.**

### 1.3 A partial fix exists but is not chosen

PG16+ `GRANT ... WITH INHERIT FALSE, SET FALSE` does close both holes:

```
[DENY ] B1 app: SET ROLE writer_role   -> permission denied to set role "writer_role"
[DENY ] B2 app: INSERT (INHERIT FALSE) -> permission denied for table cj_events
[DENY ] B3 app: SET SESSION AUTHORIZATION writer_role -> permission denied
```

This is recorded as **considered and not adopted**: it makes the boundary
depend on a non-default grant option that a later `GRANT writer_role TO
app_role` (default `INHERIT TRUE`) silently reverses, and it leaves a
membership edge in `pg_auth_members` whose only protection is a modifier.
A design whose safety depends on nobody re-issuing a plain `GRANT` is
discipline, not enforcement — the exact standard §3 of the contract rejects.

---

## 2. Revised design — DESIGN A (dedicated credential), hardened by ownership split

**Chosen: a dedicated writer connection/credential used only by the journal
component, with NO role membership between the application login and the
writer login, plus a third role that owns the objects.**

### 2.1 Four roles, three of them login-less or purpose-bound

| Role | Login | Purpose | Holder of secret |
|---|---|---|---|
| `br_journal_owner` | **NOLOGIN** | Owns journal tables, triggers, functions. Cannot be connected as. | none |
| `br_migrator` | LOGIN | Runs migrations; member of `br_journal_owner`. Used by the migration job only. | migration credential |
| `command_journal_writer` | LOGIN | The journal component's *only* identity. `INSERT` on events, `UPDATE` on head. | `JOURNAL_DATABASE_URL` |
| `br_app` (the existing control-plane login) | LOGIN | Everything else. `SELECT` only on journal tables. | `DATABASE_URL` |

`br_journal_owner` being **NOLOGIN** is load-bearing: the role with
trigger-disabling power has no credential at all and is reachable only by a
role explicitly granted membership in it (`br_migrator`), whose credential is
held by the migration surface, not the runtime.

### 2.2 Proof that the normal application role cannot write

Measured with **no membership** between `app_role` and `writer_role` — the
proposed posture. Every line is real `psql` output:

```
[DENY ] C1  app INSERT cj_events            | ERROR: permission denied for table cj_events
[DENY ] C2  app UPDATE cj_events            | ERROR: permission denied for table cj_events
[DENY ] C3  app DELETE cj_events            | ERROR: permission denied for table cj_events
[DENY ] C4  app SET ROLE writer_role        | ERROR: permission denied to set role "writer_role"
[DENY ] C5  app SET SESSION AUTHORIZATION   | ERROR: permission denied to set session authorization "writer_role"
[DENY ] C6  app UPDATE cj_head              | ERROR: permission denied for table cj_head
[ALLOW] C7  app SELECT cj_events            | 2        (read is intentionally granted)
[DENY ] C8  app CREATE SECURITY DEFINER fn  | ERROR: permission denied for schema public
[DENY ] C9  app ALTER TABLE DISABLE TRIGGER | ERROR: must be owner of table cj_events
[DENY ] C10 app GRANT writer_role to self   | ERROR: permission denied to grant role "writer_role"
```

This is the requested proof, and it covers the four named verbs plus the
three escalation paths a reviewer should have asked about:

- **INSERT / UPDATE / DELETE** — denied by absent grant (C1–C3).
- **SET ROLE** — denied because there is no membership (C4). This is the
  clause the original design got wrong.
- **SET SESSION AUTHORIZATION** — denied; checked against the *authenticated*
  user, so it is not an alternate route (C5).
- **Self-escalation by re-granting** — denied; `br_app` holds neither
  `CREATEROLE` nor `ADMIN OPTION` on the writer role (C10). This closes the
  "app just grants itself back in" objection.
- **Escalation by authoring a `SECURITY DEFINER` function** — denied by
  `REVOKE CREATE ON SCHEMA public FROM PUBLIC` (C8). Without this revoke the
  whole model is defeatable; it is therefore a required migration statement,
  not an optional hardening.
- **Escalation by disabling the append-only trigger** — denied; requires
  ownership (C9).

### 2.3 The writer role is itself constrained

`command_journal_writer` is not a superuser-by-another-name:

```
[DENY ] D1 writer UPDATE cj_events        | ERROR: permission denied for table cj_events
[DENY ] D2 writer DELETE cj_events        | ERROR: permission denied for table cj_events
[DENY ] D3 writer INSERT 2nd head row     | ERROR: permission denied for table cj_head
[DENY ] D4 writer DELETE head row         | ERROR: permission denied for table cj_head
[DENY ] D5 writer ALTER TABLE DISABLE TRIGGER | ERROR: must be owner of table cj_events
[DENY ] D6 writer SET ROLE owner_role     | ERROR: permission denied to set role "owner_role"
[DENY ] E5 writer TRUNCATE cj_events      | ERROR: permission denied for table cj_events
[DENY ] E6 writer ALTER TABLE OWNER TO writer | ERROR: must be owner of table cj_events
```

Note D3/D4 discharge contract §4.1's requirement that `INSERT` and `DELETE`
on the head table be denied to **every** application role,
`command_journal_writer` included. The writer may only `UPDATE` the existing
singleton row. The singleton itself is constraint-backed: a second row
violates `CHECK (head_id = 1)` even for the owner.

### 2.4 SECURITY DEFINER considered, and why it is the *second* mechanism

Design B (a narrowly permissioned `SECURITY DEFINER` function) was built and
measured too. It works:

```
[ALLOW] app CALL cj_append(...)      -> appends, running as the function owner
[DENY ] app direct INSERT            -> permission denied
[DENY ] app direct UPDATE/DELETE     -> permission denied
[DENY ] app SET ROLE writer_role     -> permission denied
```

But it carries a trap that must be stated: **a `SECURITY DEFINER` function
executes as its owner, so if the function is owned by the table owner, the
function's body inherits trigger-disabling power.** In run 1 of the harness a
deliberately hostile helper owned by the table owner did exactly that and
tampered a row. The mitigation, verified in run 2, is to **own the function
with `command_journal_writer`, not with `br_journal_owner`** — the function
then runs with exactly the writer's grants and nothing more, and its owner
still cannot disable a trigger (`E6`).

**Disposition:** Design A is the boundary. Design B is adopted *additionally
and optionally* as the append entry point, because its transaction body is the
natural home for the §4.1 algorithm and it makes the algorithm
un-bypassable even by the writer credential. If Design B is used, the function
**must** be owned by `command_journal_writer`. It is not a substitute for
Design A: without A, `br_app` would still hold direct table grants.

### 2.5 The residual bypass, stated rather than hidden

```
[DENY ] E1 owner UPDATE, trigger ENABLED       | ERROR: append-only: UPDATE rejected
[DENY ] E2 owner DELETE, trigger ENABLED       | ERROR: append-only: DELETE rejected
[ALLOW] E3 owner DISABLE TRIGGER then UPDATE   | OWNER-TAMPER
[ALLOW] E4 owner TRUNCATE (rolled back in txn) | truncate_ok=0
```

**The table owner can defeat the append-only trigger, and `TRUNCATE` bypasses
row-level triggers entirely.** This is a property of PostgreSQL, not of this
design, and no grant configuration removes it — ownership is inherent and
non-revocable (`GRANT` docs: "The right to drop an object, or to alter its
definition in any way, is not treated as a grantable privilege; it is inherent
in the owner"). E1/E2 do show the trigger fires against the owner while
enabled, so it is not a no-op for owners — it is a barrier the owner can lower
deliberately, not one they cross by accident.

Consequences that must be carried into the plan rather than glossed:

- Ownership is the real trust boundary. It is minimized by making
  `br_journal_owner` **NOLOGIN** and granting membership only to
  `br_migrator`.
- The database is therefore **tamper-evident, not tamper-proof.** The
  hash chain — not the trigger — is what detects owner-level tampering, which
  is precisely why contract §4.1 requires `verify()` to recompute from
  genesis and never to trust the head.
- Neon's platform-level roles are outside this repository's control. Whether
  the Neon project's owner/admin role is separable from `br_migrator` is an
  **open question for the Founder** (see §7, item U2).

---

## 3. Privilege and ownership model

### 3.1 Exact posture

```
-- Roles (created by migration; secrets provisioned OUT OF BAND by the Founder)
br_journal_owner        NOLOGIN                     -- owns objects
br_migrator             LOGIN, member of br_journal_owner
command_journal_writer  LOGIN                       -- journal component only
br_app                  LOGIN                       -- existing control-plane login

-- No membership edge between br_app and command_journal_writer. Ever.
-- No membership edge between command_journal_writer and br_journal_owner.

REVOKE CREATE ON SCHEMA public FROM PUBLIC;         -- REQUIRED (closes C8)
GRANT  USAGE  ON SCHEMA public TO command_journal_writer, br_app;

-- Ownership: every journal object owned by br_journal_owner
ALTER TABLE    command_journal_events     OWNER TO br_journal_owner;
ALTER TABLE    command_journal_chain_head OWNER TO br_journal_owner;
ALTER FUNCTION command_journal_immutable() OWNER TO br_journal_owner;
-- (trigger ownership follows the table)

REVOKE ALL ON command_journal_events, command_journal_chain_head FROM PUBLIC;

-- command_journal_writer: the minimum that permits an append and nothing else
GRANT SELECT, INSERT ON command_journal_events     TO command_journal_writer;
GRANT SELECT, UPDATE ON command_journal_chain_head TO command_journal_writer;
-- deliberately NOT granted: UPDATE/DELETE/TRUNCATE on events;
--                           INSERT/DELETE/TRUNCATE on head.

-- br_app: read-only, so projections/verify can run on the ordinary connection
GRANT SELECT ON command_journal_events, command_journal_chain_head TO br_app;

-- If Design B is adopted:
ALTER FUNCTION command_journal_append(...) OWNER TO command_journal_writer;  -- NOT the table owner
REVOKE ALL ON FUNCTION command_journal_append(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION command_journal_append(...) TO command_journal_writer;
```

### 3.2 Answers to the six specified points

1. **Migration-owner role:** `br_migrator`, a login role that is a member of
   `br_journal_owner` and does `SET ROLE br_journal_owner` before creating
   journal objects, so ownership lands on the NOLOGIN role rather than on the
   migrator itself.
2. **Table / function / trigger owner:** `br_journal_owner` (NOLOGIN) for
   tables, the immutability trigger function, and triggers. If the Design-B
   append function is adopted, that one function is owned by
   `command_journal_writer` instead — deliberately, per §2.4.
3. **`command_journal_writer` permissions:** `SELECT, INSERT` on
   `command_journal_events`; `SELECT, UPDATE` on
   `command_journal_chain_head`; `USAGE` on schema. Nothing else. Verified
   denied: UPDATE/DELETE/TRUNCATE on events, INSERT/DELETE on head, trigger
   disable, ownership change, `SET ROLE` to the owner.
4. **Normal application-role permissions:** `SELECT` on both journal tables.
   No INSERT/UPDATE/DELETE, no `SET ROLE`, no `SET SESSION AUTHORIZATION`, no
   `CREATE` in schema `public`, no `ADMIN OPTION`.
5. **Which roles may bypass, and why:** only `br_journal_owner` (via
   `ALTER TABLE ... DISABLE TRIGGER` or `TRUNCATE`), reachable only by
   `br_migrator`, plus any Neon platform superuser/admin outside repository
   control. Justification: PostgreSQL makes ownership rights inherent and
   non-revocable; schema evolution requires *some* role to hold them. The
   bypass is bounded by (a) NOLOGIN on the owner, (b) the migrator credential
   being a migration-surface secret not present in the runtime process, and
   (c) the hash chain making any such tamper detectable by `verify()`.
6. **CI proof of allowed and denied paths:** see §5 and §6. Both directions
   are asserted; a permission test that only proves the happy path is not
   accepted as coverage.

### 3.3 Connection separation in the process

- The journal component opens its **own `pg.Pool`** from
  `JOURNAL_DATABASE_URL`, distinct from the existing `createPool(config)` pool
  built from `DATABASE_URL` (`packages/control-plane/src/db.ts:21`).
- **Consequence that must be designed for, not discovered later:** contract
  §1.4 requires the journal event and the lifecycle event to commit in **one
  transaction**. Two pools cannot share a transaction. Resolution options are
  enumerated in §7 (U1) as an unresolved Founder/architecture decision,
  because each has a governance-visible cost. This is the single largest
  consequence of the writer-separation fix and it is surfaced, not buried.

---

## 4. Append concurrency algorithm

Specified exactly, and measured. Executed inside one transaction on the
journal connection (or inside the Design-B function body, which is the same
transaction).

```
BEGIN;                                            -- READ COMMITTED is sufficient
  -- 1. Serialize: exclusive row lock on the sole head row.
  SELECT head_seq, head_hash
    FROM command_journal_chain_head
   WHERE head_id = 1
     FOR UPDATE;                                  -- blocks all other appenders

  -- 2. Verify head against the event tail BEFORE writing (contract §4.1).
  --    Compares both position and hash; either mismatch aborts.
  tail_seq  := COALESCE((SELECT max(seq) FROM command_journal_events), 0);
  tail_hash := COALESCE((SELECT chain_hash FROM command_journal_events
                          WHERE seq = tail_seq), 64-ASCII-zero-genesis);
  IF head_seq <> tail_seq OR head_hash <> tail_hash THEN
     RAISE;                                       -- abort: no insert, no advance
  END IF;

  -- 3. Assign and compute.
  new_seq  := head_seq + 1;
  new_hash := sha256( head_hash_as_64_hex_ascii || canonical_row_bytes );

  -- 4. Insert the event row.
  INSERT INTO command_journal_events (seq, chain_hash, ...) VALUES (new_seq, new_hash, ...);

  -- 5. Advance the latch.
  UPDATE command_journal_chain_head
     SET head_seq = new_seq, head_hash = new_hash
   WHERE head_id = 1;

  -- 6. (§1.4) Any lifecycle event written by the same control-plane act
  --    is inserted in THIS transaction — see §7 U1.
COMMIT;
```

**Chain-head row initialization.** Migration act only, never an append. The
migration inserts exactly one row `(head_id=1, head_seq=0, head_hash=`64
ASCII zeros`)` before any event exists. `INSERT`/`DELETE` on the head table
are denied to every application role including the writer (verified D3/D4), so
that migration insert is the table's only insert, ever. `CHECK (head_id = 1)`
makes a second row unrepresentable — verified: a second row is rejected even
when attempted by the owner.

**Locking behavior.** `SELECT ... FOR UPDATE` on the singleton. Because the
`CHECK` constraint makes exactly one row exist, two concurrent appenders
cannot lock different rows; the second blocks until the first commits.
`READ COMMITTED` suffices — the lock, not the isolation level, provides the
serialization, so no `SERIALIZABLE` retry loop is required.

**Tail recomputation.** Step 2 recomputes the tail from
`command_journal_events` and compares **both** `seq` and `chain_hash`. The
reviewer's point that "a singleton head row alone is not sufficient evidence
of strict serialized append" is accepted: the head provides mutual exclusion,
the step-2 verification provides correctness, and only the two together make a
fork impossible. A head that agrees on `seq` but disagrees on `chain_hash`
(the tamper case) is caught by the hash limb.

**Divergence handling.** `RAISE` → transaction aborts → no insert, no head
advance. Per contract §5.1 this is a **named fail-closed condition**: the
journal is unavailable for dispatch until the divergence is resolved as an
integrity finding. It is not retried automatically.

**Measured — 12 simultaneous appends over 12 real parallel login connections:**

```
returned seqs: 4 10 12 11 3 1 5 7 2 6 9 8
integrity:     rows=12 distinct_seq=12 min=1 max=12 distinct_hash=12
head:          12
gaps:          0
```

Twelve concurrent appenders produced a gapless 1..12 sequence, twelve distinct
chain hashes, no duplicate `seq`, and a head exactly equal to the tail.
Completion order was interleaved (4,10,12,…) while assignment stayed strictly
serialized — which is the property claimed, demonstrated rather than asserted.

**Idempotency / duplicate-event behavior.** Enforced in schema, not in
application code:

```
[DENY ] re-append an existing command_id | ERROR: duplicate key value violates unique constraint
[ALLOW] append a fresh command_id        | seq 13
```

Per contract §4.1 the production constraints are `seq` primary key,
`chain_hash` unique, and `(command_id, event_type)` unique for the
at-most-once event types (`journaled`, `identity_bound`, `dispatched`,
`resolved`). A duplicate append raises a unique violation, which aborts the
transaction — so a retried append **cannot** produce a second row or advance
the head.

**Rollback semantics.** All five steps are one transaction. Any failure —
divergence, unique violation, serialization error, lifecycle-write failure,
connection loss — rolls back the insert *and* the head advance together. The
head can never advance without its event row, and an event row can never exist
without the matching head. Verified on the divergence path:

```
[DENY ] append against diverged head | ERROR: chain-head divergence: head=999 tail=13
rows before=13 after=13   (equal — nothing was inserted)
```

---

## 5. Expected paths

Proposed, not created. Nothing below exists yet.

| Path | Action | Notes |
|---|---|---|
| `packages/control-plane/src/migrations.ts` | MODIFY | Append migration `000N_command_journal` — tables, singleton head + genesis row, immutability triggers, roles, grants, `REVOKE CREATE ON SCHEMA public FROM PUBLIC`. Never edit a shipped migration (module header rule). |
| `packages/journal/src/journal-store.ts` | CREATE | The sole writer. Owns the journal pool and the §4 append transaction. |
| `packages/journal/src/journal-pool.ts` | CREATE | `JOURNAL_DATABASE_URL` pool, separate from `db.ts`'s. |
| `packages/journal/src/index.ts` | MODIFY | Export the store surface. |
| `packages/control-plane/src/config.ts` | MODIFY | Require/validate `JOURNAL_DATABASE_URL`; never echo it. |
| `.env.example` | MODIFY | Document `JOURNAL_DATABASE_URL` (name only, no value). |
| `test/command-journal.storage.test.ts` | CREATE | Allowed-path + concurrency + rollback suite. |
| `test/command-journal.permissions.test.ts` | CREATE | **Negative** permission suite (§6). Must run as real distinct logins. |
| `.github/workflows/ci.yml` | MODIFY | `storage-integration` job provisions the four roles so the negative suite can run. |
| `docs/planning/command-journal/pr2b-storage-architecture-r2.md` | CREATE | This artifact. |

---

## 6. Acceptance-test matrix and negative permission tests

### 6.1 Allowed paths

| ID | Assertion | Expected |
|---|---|---|
| A-1 | writer appends a `journaled` event | row committed, `seq=head+1` |
| A-2 | 12 concurrent appends | gapless 1..N, no dup `seq`, no dup `chain_hash`, head==tail (**measured: pass**) |
| A-3 | `verify()` recomputes from genesis over a mixed command/decision chain | passes |
| A-4 | migration is idempotent on re-run | no second head row, no error |
| A-5 | `br_app` reads events and head | `SELECT` succeeds (**measured: pass**) |
| A-6 | head initialized by migration to `seq=0`, 64-zero hash | exactly one row |

### 6.2 Negative permission tests — each MUST fail, and CI must assert the failure

Run as real distinct logins. A test that runs these as the superuser proves
nothing (the harness's own first run made this error and was discarded).

| ID | Actor | Attempt | Expected error | Measured |
|---|---|---|---|---|
| N-1 | `br_app` | `INSERT INTO command_journal_events` | permission denied for table | **pass** |
| N-2 | `br_app` | `UPDATE command_journal_events` | permission denied for table | **pass** |
| N-3 | `br_app` | `DELETE FROM command_journal_events` | permission denied for table | **pass** |
| N-4 | `br_app` | `SET ROLE command_journal_writer` | permission denied to set role | **pass** |
| N-5 | `br_app` | `SET SESSION AUTHORIZATION command_journal_writer` | permission denied | **pass** |
| N-6 | `br_app` | `UPDATE command_journal_chain_head` | permission denied for table | **pass** |
| N-7 | `br_app` | `GRANT command_journal_writer TO br_app` | permission denied to grant role | **pass** |
| N-8 | `br_app` | `CREATE FUNCTION ... SECURITY DEFINER` | permission denied for schema | **pass** |
| N-9 | `br_app` | `ALTER TABLE ... DISABLE TRIGGER` | must be owner of table | **pass** |
| N-10 | `writer` | `UPDATE command_journal_events` | permission denied for table | **pass** |
| N-11 | `writer` | `DELETE FROM command_journal_events` | permission denied for table | **pass** |
| N-12 | `writer` | `TRUNCATE command_journal_events` | permission denied for table | **pass** |
| N-13 | `writer` | `INSERT` second head row | permission denied for table | **pass** |
| N-14 | `writer` | `DELETE` head row | permission denied for table | **pass** |
| N-15 | `writer` | `ALTER TABLE ... DISABLE TRIGGER` | must be owner | **pass** |
| N-16 | `writer` | `SET ROLE br_journal_owner` | permission denied to set role | **pass** |
| N-17 | `writer` | `ALTER TABLE ... OWNER TO` | must be owner | **pass** |
| N-18 | owner | `UPDATE` with trigger enabled | append-only: UPDATE rejected | **pass** |
| N-19 | owner | `DELETE` with trigger enabled | append-only: DELETE rejected | **pass** |
| N-20 | any | second head row (`head_id=2`) | CHECK constraint violation | **pass** |
| N-21 | writer | re-append an existing `(command_id, event_type)` | unique violation, no head advance | **pass** |
| N-22 | writer | append against a tampered head | divergence abort, row count unchanged | **pass** |
| N-23 | — | membership audit: `pg_auth_members` has NO edge `br_app → command_journal_writer` | zero rows | **required, not yet run in CI** |

N-23 is the regression test for the defect this revision fixes: it fails if
anyone later re-introduces the membership the original design assumed.

### 6.3 CI requirement

The existing `storage-integration` job (`.github/workflows/ci.yml:73`) runs
`postgres:16` as `postgres` superuser and would pass every negative test
vacuously. The job **must** be extended to create the four roles and run the
negative suite over per-role connection strings. Without that change the
negative matrix is not covered, and coverage that depends on the superuser is
the same class of lapse the job's own comment (lines 69–72) was written to
prevent.

---

## 7. Unresolved — requires Founder decision

**U1 — the two-pool vs one-transaction collision (blocking).** Contract §1.4
requires a journal event and its lifecycle event to commit in one transaction.
Separating the writer credential means two pools, and two pools cannot share a
transaction. Three resolutions, each with a governance-visible cost, none of
which the Architect may choose:

- (a) **Design-B `SECURITY DEFINER` append function.** `br_app` keeps one
  connection and one transaction, calling `command_journal_append(...)`, which
  executes with the writer's privileges. Preserves §1.4 atomicity exactly;
  cost is that the enforcement mechanism becomes a database function rather
  than a connection boundary (see U3).
- (b) **Journal connection owns the transaction**, with the lifecycle insert
  moved onto the journal connection for decision acts. Preserves atomicity;
  cost is that `command_journal_writer` must then hold `INSERT` on
  `build_room_events`, widening the writer role beyond journal tables and
  crossing the §1.4 store boundary.
- (c) **Two-phase commit (`PREPARE TRANSACTION`).** Preserves both boundaries;
  cost is operational complexity and Neon 2PC support is unverified.

Recommendation: **(a)**, because it is the only option that keeps both the
credential boundary and the §1.4 atomicity without widening any grant. It is
recorded as a recommendation, not a decision.

**U2 — Neon platform role custody.** Whether the Neon project's
owner/admin role can be held separately from `br_migrator`, and who holds each
credential, is outside this repository's control and is a custody question.

**U3 — mechanism choice.** Whether the enforcement mechanism is the
connection boundary alone (Design A) or the connection boundary plus the
`SECURITY DEFINER` function (A+B). Coupled to U1.

**U4 — credential provisioning.** Two new database logins
(`command_journal_writer`, `br_migrator`) require secret values. This
plan does not create, rotate, or place them. See §9.

---

## 8. Non-activating scope claim (stated precisely, as requested)

PR 2b **may create dormant journal primitives only.** Precisely:

1. PR 2b may create the journal tables, the singleton chain-head row, the
   immutability triggers, the database roles and grants, and the
   `journal-store.ts` append implementation with its tests.
2. **PR 2b does not claim to satisfy contract §1.4's dual-write rule.** The
   §1.4 rule is satisfied only when a *real control-plane act* writes both the
   journal event and its lifecycle event in **one transaction**, and that act
   does not exist in PR 2b. Until then the dual-write requirement is
   **unimplemented and untested against a real act**, and no test in PR 2b may
   be represented as proving it.
3. PR 2b activates no dispatch path. The contract §5.1 fail-closed
   pre-dispatch rule is not exercised because no governed command dispatches.
4. PR 2b does not discharge Phase 4 stop-gate items 2, 4–10. It contributes
   evidence toward item 1 (append-only, tamper-evident, reconstructable,
   singular) and item 3 (no secrets persisted) **for the storage layer only**.
5. Any statement in a PR body that PR 2b "implements the journal" or
   "satisfies §1.4" is a misrepresentation of this plan.

---

## 9. Rollback boundary

The reviewer's objection is accepted in full: dropping journal tables and
roles is **not** a routine rollback once events exist.

**Posture 1 — before the first append (no event rows).** The journal is
genuinely dormant: `command_journal_events` is empty and the head row is at
`seq=0` with the genesis hash. Rollback may drop the tables, the roles, and
the grants, and revert the migration. Nothing governed is lost because no
governed fact was ever recorded. **Precondition, checked not assumed:**
`SELECT count(*) FROM command_journal_events` returns `0`. This is the only
window in which a destructive rollback is legitimate.

**Posture 2 — after the first appended event.** The journal holds governed
command history and is append-only by ruling. **Dropping the tables is
destruction of governed records, not rollback, and is not available to the
Builder or the Operator under any circumstance.** The available reversals are:

- **Disable the write path** — stop the control plane from appending
  (configuration/deploy revert). The rows remain. This is the normal reversal.
- **Revoke the writer credential** — the journal becomes read-only and
  dispatch fails closed per §5.1, which is the designed safe state.
- **Forward-only correction** — errors are corrected by appending
  compensating events, never by editing or deleting rows. This follows from
  append-only, not from preference.
- **Schema-level changes** — additive migrations only.

Destroying journal rows after first write requires an explicit Founder
decision and is a records/custody act, not an engineering rollback. Any
rollback plan in a future PR body that says "drop the journal tables" without
distinguishing these two postures should be rejected on sight.

---

## 10. Stop conditions (plan-drift)

The Builder stops and returns to the Founder if:

- **S1** — a PR 2b proposal artifact is produced whose content differs from
  the design in this revision, or the controlling contract hash changes from
  `eaeb6178…9e52`.
- **S2** — U1 is not decided before implementation begins. The transaction
  model determines the store's public API; building either way first
  guarantees rework.
- **S3** — credential provisioning for `command_journal_writer` or
  `br_migrator` is required and no Founder authorization exists (§11).
- **S4** — Neon cannot support the role/ownership model (e.g. object
  ownership is not assignable to a NOLOGIN role on the bound project). The
  enforcement claim would then be false and must not be asserted.
- **S5** — CI cannot run the negative matrix as distinct non-superuser
  logins. An unenforceable claim must not be merged as an enforced one.
- **S6** — any design change that would grant `br_app` membership in
  `command_journal_writer`, or grant the writer any privilege on
  `build_room_events`, reintroduces the defect this revision exists to fix.
- **S7** — implementation would write a real control-plane act (activating
  §1.4) — that is outside PR 2b's scope per §8.

---

## 11. Governance determination — re-verified from primary sources

Re-read at FounderOS `8198ecf002324cc4e00cf035c7cb98c6de0bc746`.

**What is already ruled.** `DEC-20260827-01` §10 rules the canonical command
journal and, in "Security and custody," states that "Existing evidence-store
custody and sole-writer authority remain controlling. This ruling does not
transfer evidence custody or create a new unrestricted storage authority."
Contract §3 is marked **[RULED]** by the Founder on 2026-09-01 and rules, in
terms, that "a dedicated database role, `command_journal_writer`, distinct
from any role the control plane uses for operational tables, is the only role
granted `INSERT`," and that "every other application role is **explicitly
revoked** on both tables — a second writer is prevented by grant, not by
discipline."

**Determination on the mechanism.** The revised design does **not** introduce a
new security boundary or a new enforcement mechanism. It is the *first
correct implementation* of the boundary §3 already ruled. The originally
proposed `SET LOCAL ROLE` design failed to deliver the ruled property (proven
in §1.2); removing the membership edge is what makes the ruled words true.
Mechanism choice between "connection boundary" and "connection boundary plus
`SECURITY DEFINER`" is implementation detail beneath a ruled requirement, on
the same footing as the trigger-based append-only enforcement the corpus
already uses. **No DEC is required for the mechanism.**

**Determination on credentials — this is the part that is NOT covered, and
"exact-SHA authorization only" is the wrong answer.** The design requires
**two new database login roles with new secret values**
(`command_journal_writer`, `br_migrator`). The Phase 4 authorization
(`DEC-20260815-17` §6) lists **"new credentials"** under **NOT AUTHORIZED**,
without qualification. Contract §9 repeats "new ... credentials" as out of
scope, and this repository's `AGENTS.md` makes self-provisioning credentials
a prohibited act and provisioning an approval gate.

There is a genuine tension worth stating rather than resolving unilaterally:
contract §3 (ruled) requires a role distinct from the control plane's, and a
distinct login role necessarily has a distinct secret. One reading is that
ruling §3 impliedly authorized the credential it requires; the opposite
reading is that §6's flat prohibition governs and the ruling addressed the
grant model, not custody. **The Architect does not resolve this.**

**Exact governance mechanism required:**

- **Not** a new DEC for the *architecture*. The storage locus, sole-writer
  rule, and grant-enforced boundary are ruled by `DEC-20260827-01` §10 and
  contract §3 [RULED]; this revision implements them.
- **A Founder authorization is required for the credentials**, because
  `DEC-20260815-17` §6 bars "new credentials" outright and the plain text
  controls over an implication. The lightest sufficient instrument is a
  **Founder authorization comment on the PR** that (i) names
  `command_journal_writer` and `br_migrator`, (ii) states that creating these
  two database logins is within Phase 4's already-ruled §3 sole-writer
  requirement and is not "new credentials" in §6's sense — or, if the Founder
  reads it otherwise, grants a narrow exception, (iii) states who holds each
  secret, and (iv) confirms neither is a provider or spend credential.
- **A DEC becomes required** if the Founder determines this creates a **new
  credential custody domain** — i.e. if custody of the journal writer secret
  sits with a party or surface not already covered by `DEC-20260815-02` or the
  existing control-plane secret custody. That is a records/custody posture
  question, and `DEC-20260815-02` assigns custody decisions to the Founder.
- **Freeze:** consistent with `DEC-20260827-01`'s recorded freeze disposition,
  this work is demanded by a shipping build (the Build Room v1 slice), so
  `DEC-20260814-03` clause 2 does not reach it and no clause 4 exception is
  claimed.

**Bottom line:** the architecture is ruled; **the credentials are not.** Do
not proceed on an "exact-SHA authorization only" theory — that theory
authorizes a diff, not a credential.

---

## 12. Verdict

**REQUEST-CHANGES** — on the *original* proposal, which is rejected on
measured evidence (§1.2): its `SET LOCAL ROLE` boundary is not merely
unenforced, it is decorative, because default `INHERIT TRUE` grants the write
privilege on every ordinary connection without any `SET ROLE` at all.

The revised design in §§2–6 is technically **architecture-ready** — its
boundary claims are proven, not asserted — but it is **not** cleared to
implement, because two gates are open and neither belongs to the Architect:

1. **U1** (transaction model vs. §1.4 atomicity) must be decided first; it
   determines the store's public API.
2. **§11** — Founder authorization for the two new database logins, given
   `DEC-20260815-17` §6's flat "new credentials" prohibition.

Status: **BLOCKED_FOUNDER_DECISION** pending U1 and §11. On those two
answers, this becomes PLAN_READY_FOR_FOUNDER_APPROVAL without further
architecture work.

---

## Appendix A — verification provenance

All `[ALLOW]`/`[DENY]` lines are real output from PostgreSQL 18.4 (Homebrew,
`aarch64-apple-darwin25.6.0`) on 2026-09-05, scratch database `cjp3`, roles
`owner_role` / `writer_role` / `app_role`, each check over its own login
connection via `psql -U <role>`. Harness: `/tmp/br-journal-proof/verify.sh`,
`/tmp/br-journal-proof/setup2.sql`.

Method note, recorded because it invalidated a first attempt: an initial
harness performed `SET ROLE` inside a superuser session and appeared to show
`SET ROLE` succeeding where it should fail. `SET ROLE` privilege is evaluated
against the **session** user, and a superuser may assume any role. That run
was discarded; every result above uses real per-role logins.

Two contaminated intermediate readings were also discarded and re-run: one
where an owner `UPDATE` targeted a non-existent row (0 rows affected, which is
not a permission result), and one where a timed-out cell left an append-only
trigger disabled. The final run re-seeds a known row and verifies trigger
state before asserting.
