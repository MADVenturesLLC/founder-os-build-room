# PR 2b — Command-Journal Storage Architecture, Revision 3 (Same-Connection SECURITY DEFINER)

Status: **PROPOSED — advisory until Founder approval.** Read-only planning
artifact. No code, migration, role, credential, branch, commit, PR, or
database object in the repository or the bound Neon project is created by this
document.

Work ID: `BR-PR2B-JOURNAL-STORE-R3`
Supersedes: `BR-PR2B-JOURNAL-STORE-R2`
Seat: `br-architect` (Plan Authority; no approval, build, operate, or
risk-acceptance authority)
Next role: **Founder approval, then Builder.**

---

## 0. Controlling inputs and hashes

Bound by fresh read-only inspection on 2026-09-05.

| Input | Path | SHA-256 |
|---|---|---|
| Founder disposition (controlling direction) | this session, "FOUNDER DISPOSITION — PR 2b WRITER-BOUNDARY REVISION REQUIRED" | not a file artifact; quoted verbatim in §1.1 |
| Journal contract v0.17 | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` |
| Prior revision (accepted as rejection of the original) | `docs/planning/command-journal/pr2b-storage-architecture-r2.md` | `0af104ab5a3ad0bb710c7743269ee5e40f43b1f6df43ad3ff982c6bf3a93da46` |
| Live migrations | `packages/control-plane/src/migrations.ts` | `924d8e30663a677967e455e1d8332106d6e3ee8e55b3a57e61322bcc71793745` |
| Live store | `packages/control-plane/src/store.ts` | `53df2679817d7d66c4f1a194cb8db23d4531fcad11e837ccc0978144188d0b74` |

Repository state at binding: branch `builder/prereq-c-c2-broker-ledger-worker`,
HEAD `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`. Contract file byte-identical
to `main`. No repository drift from r2.

Governance re-read at FounderOS `8198ecf002324cc4e00cf035c7cb98c6de0bc746`.

---

## 1. What changed from r2, and why

### 1.1 The Founder's direction, as bound

The Founder accepted r2 as a rejection of the original `SET LOCAL ROLE`
design, authorized no implementation, and directed the resolution of U1:

> Revise the architecture to adopt a same-connection, narrowly scoped
> `SECURITY DEFINER` append routine.

with a required ownership model of two NOLOGIN privileged roles
(`br_journal_owner` owning tables/triggers, `command_journal_writer` owning
the append routine and owning no tables), the ordinary control-plane login
receiving `EXECUTE` only, and — decisively — **no second database login or
credential for this tranche.**

### 1.2 Consequence: r2's U1 and §11 blockers are both dissolved

- **U1 (two pools cannot share a transaction) is resolved.** With no second
  login, there is one connection. The lifecycle insert and the journal append
  execute in the *caller's* transaction, on the caller's connection, with the
  privilege elevation supplied by function ownership rather than by
  connection identity. Proven in §5.
- **§11's credential blocker is dissolved.** r2 was blocked because
  `DEC-20260815-17` §6 lists "new credentials" as NOT AUTHORIZED and Design A
  required two new logins. This tranche creates **zero** logins and **zero**
  secrets. See §9.

The Founder's direction is architecturally superior to r2's Design A, not
merely a governance workaround: it removes a credential, removes a connection
pool, and removes the two-phase-commit question, while *strengthening* the
boundary — the app now cannot even reach the tables by direct DML.

---

## 2. Role, ownership, and grant model (exact)

### 2.1 Three roles, one of them pre-existing

| Role | LOGIN | Owns | Holds | New secret |
|---|---|---|---|---|
| `br_journal_owner` | **NOLOGIN** | journal tables, chain-head table, immutability trigger function, triggers | inherent owner rights | **none** |
| `command_journal_writer` | **NOLOGIN** | the append routine **only** — no tables, no triggers | `SELECT, INSERT` on events; `SELECT, UPDATE` on head | **none** |
| the existing control-plane login | LOGIN (pre-existing `DATABASE_URL`) | its own operational tables | `SELECT` on journal tables; `EXECUTE` on the append routine | **none** |

Both privileged roles are NOLOGIN: **no credential exists for either, so
neither can be authenticated as, ever.** They are reachable only through
object ownership semantics — the owner role by the migration session that
holds membership in it, the writer role only by PostgreSQL's own
`SECURITY DEFINER` mechanism during a call to the append routine.

**No membership edges.** The control-plane login is a member of neither
privileged role. Verified: `pg_auth_members` returns `(none)` for all three
roles (§10, matrix).

**Migration ownership.** Journal objects must be created owned by
`br_journal_owner`. The migration session (the existing control-plane login at
boot, per `main.ts:39`) does `SET ROLE br_journal_owner` before creating
journal objects and `RESET ROLE` after. This requires the control-plane login
to hold **membership in `br_journal_owner`** — which is a real, stated
consequence and the one place the model concedes an edge. See §8, U1, for the
alternative and the residual risk.

### 2.2 The grant/revoke posture

```sql
-- Roles: NOLOGIN, no passwords, no credentials.
CREATE ROLE br_journal_owner       NOLOGIN;
CREATE ROLE command_journal_writer NOLOGIN;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT  USAGE  ON SCHEMA public TO br_journal_owner, command_journal_writer;

-- Journal objects owned by br_journal_owner.
--   (migration runs: SET ROLE br_journal_owner; ...; RESET ROLE)
--   command_journal_events, command_journal_chain_head,
--   command_journal_immutable(), and both triggers.

REVOKE ALL ON command_journal_events, command_journal_chain_head FROM PUBLIC;

-- The writer role: exactly enough to append, and it owns no table.
GRANT SELECT, INSERT ON command_journal_events     TO command_journal_writer;
GRANT SELECT, UPDATE ON command_journal_chain_head TO command_journal_writer;
-- Deliberately NOT granted to the writer:
--   UPDATE/DELETE/TRUNCATE on events; INSERT/DELETE/TRUNCATE on head;
--   ownership of any table; CREATE on schema public (revoked post-migration).

-- The control-plane login: read + execute. No DML. No membership.
GRANT SELECT  ON command_journal_events, command_journal_chain_head TO <app>;
GRANT EXECUTE ON FUNCTION command_journal_append(...)               TO <app>;
REVOKE ALL    ON FUNCTION command_journal_append(...)               FROM PUBLIC;
```

**Ordering constraint, found by testing and easy to get wrong:** the blanket
`REVOKE CREATE ON SCHEMA public FROM PUBLIC` must come *after* — or be paired
with an explicit `GRANT CREATE` to — the roles that still need to create
objects. My first harness build failed outright (`ERROR: permission denied for
schema public`) because the revoke preceded the NOLOGIN owner's `CREATE TABLE`.
The migration must grant `CREATE` to `br_journal_owner` and
`command_journal_writer` for the duration of object creation, then revoke it.
Post-migration state verified: `CREATE on public` is `false` for both
privileged roles while all grants remain intact and appends keep working.

---

## 3. Hardened `SECURITY DEFINER` design

### 3.1 The five required hardening properties

| Requirement | Implementation | Verified |
|---|---|---|
| Safe pinned `search_path` | `SET search_path = pg_catalog, pg_temp` on the function. `public` deliberately **absent**. | `proconfig = search_path=pg_catalog, pg_temp` |
| Fully qualified object names | Every reference in the body is `public.command_journal_events`, `public.command_journal_chain_head`. No bare identifiers. | body inspected; shadowing tests pass |
| `PUBLIC EXECUTE` revoked | `REVOKE ALL ON FUNCTION ... FROM PUBLIC` then a single explicit `GRANT EXECUTE`. | ACL = `{writer=X/writer, app=X/writer}` — no `=X/` PUBLIC entry |
| No untrusted dynamic SQL | Body is static SQL/PLpgSQL. No `EXECUTE format(...)`, no string-built identifiers. Inputs are bound parameters only. | body inspected |
| No shadowing path | Pinned path excludes `public`; hash uses the `pg_catalog` builtin `sha256()`. | §3.3 |

`pg_temp` is placed **last** and is unavoidable (PostgreSQL always searches it),
but it is inert here because every object reference is schema-qualified.

### 3.2 The routine

```sql
CREATE FUNCTION public.command_journal_append(
    p_record_class   text,   p_command_id text,  p_event_type text,
    p_lifecycle_room text,   p_lifecycle_event text,
    p_canonical_row  bytea             -- canonical bytes per contract §6.2(c)/(d)
) RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_head_seq bigint; v_head_hash text;
  v_tail_seq bigint; v_tail_hash text;
  v_seq bigint;      v_hash text;
BEGIN
  -- 1. Serialize on the singleton latch.
  SELECT head_seq, head_hash INTO v_head_seq, v_head_hash
    FROM public.command_journal_chain_head WHERE head_id = 1 FOR UPDATE;

  -- 2. Verify the locked head against the event tail BEFORE writing (§4.1).
  SELECT COALESCE(max(seq), 0) INTO v_tail_seq FROM public.command_journal_events;
  SELECT COALESCE((SELECT chain_hash FROM public.command_journal_events
                    WHERE seq = v_tail_seq), repeat('0', 64))
    INTO v_tail_hash;
  IF v_head_seq <> v_tail_seq OR v_head_hash <> v_tail_hash THEN
    RAISE EXCEPTION 'command journal chain-head divergence: head=(%,%) tail=(%,%)',
      v_head_seq, left(v_head_hash, 8), v_tail_seq, left(v_tail_hash, 8);
  END IF;

  -- 3. Assign and chain. sha256() is a pg_catalog builtin (§3.3).
  v_seq  := v_head_seq + 1;
  v_hash := encode(sha256(convert_to(v_head_hash, 'UTF8') || p_canonical_row), 'hex');

  -- 4. Append.
  INSERT INTO public.command_journal_events
     (seq, chain_hash, record_class, command_id, event_type,
      lifecycle_room, lifecycle_event, canonical_row)
  VALUES (v_seq, v_hash, p_record_class, p_command_id, p_event_type,
          p_lifecycle_room, p_lifecycle_event, p_canonical_row);

  -- 5. Advance the latch.
  UPDATE public.command_journal_chain_head
     SET head_seq = v_seq, head_hash = v_hash
   WHERE head_id = 1;

  RETURN v_seq;
END $$;

ALTER FUNCTION public.command_journal_append(...) OWNER TO command_journal_writer;
REVOKE ALL   ON FUNCTION public.command_journal_append(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.command_journal_append(...) TO <control-plane login>;
```

The chain framing must match contract §6.2's fixed definition: SHA-256 over
the prior `chain_hash` rendered as its 64 lowercase-hex ASCII bytes,
concatenated with the row's canonical byte sequence. `convert_to(..., 'UTF8')`
renders those 64 hex characters as ASCII bytes. The Builder must verify this
against the ratified serialization spec's golden vectors before shipping —
this document does not hand-author hash values (contract §6.2).

### 3.3 The helper-function attack, found and closed

A `SECURITY DEFINER` body that calls a helper can be hijacked if an attacker
defines a better-matching overload. I probed this: with an md5-based stand-in
helper owned by the journal owner, the app **could** create a
`digest_stub(varchar)` overload (it could not replace the exact-match
`(text)` version — `ERROR: must be owner of function digest_stub`), and could
create a `pg_temp` overload. Neither hijacked the hash in practice, but the
vector is real and should not be left to luck.

**It is closed by construction in production:** `sha256(bytea)` is a
**`pg_catalog` builtin** (PostgreSQL 11+). Verified:

```
sha256_exists=1 schema=pg_catalog
demo=ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad   (correct NIST vector for "abc")

non-superuser CREATE FUNCTION pg_catalog.sha256(bytea) -> ERROR: permission denied for schema pg_catalog
app CREATE FUNCTION pg_temp.sha256(bytea) then call    -> resolves to the BUILTIN, not the temp overload
```

So the design **must use the `pg_catalog` builtin `sha256()` and must not
introduce a user-defined hash helper**. That is a binding implementation
constraint, not a preference: a user-defined helper reopens the overload
vector, a builtin in a pinned `pg_catalog` path does not. `pgcrypto`'s
`digest()` is **not** to be used for the chain hash for this reason.

---

## 4. Negative permission tests (requirement 3) — all measured

Every check below ran over the ordinary control-plane login's **own login
connection** against PostgreSQL 18.4. Real output.

### 4.1 Cannot INSERT / UPDATE / DELETE / TRUNCATE journal tables

```
[DENY ] N-1  app INSERT command_journal_events    | ERROR: permission denied for table command_journal_events
[DENY ] N-2  app UPDATE command_journal_events    | ERROR: permission denied for table command_journal_events
[DENY ] N-3  app DELETE command_journal_events    | ERROR: permission denied for table command_journal_events
[DENY ] N-4  app TRUNCATE command_journal_events  | ERROR: permission denied for table command_journal_events
[DENY ] N-5  app INSERT chain_head                | ERROR: permission denied for table command_journal_chain_head
[DENY ] N-6  app UPDATE chain_head                | ERROR: permission denied for table command_journal_chain_head
[DENY ] N-7  app DELETE chain_head                | ERROR: permission denied for table command_journal_chain_head
[DENY ] N-8  app TRUNCATE chain_head              | ERROR: permission denied for table command_journal_chain_head
```

### 4.2 Cannot assume writer or owner roles; cannot change session authorization

```
[DENY ] N-9  app SET ROLE command_journal_writer          | ERROR: permission denied to set role "command_journal_writer_r3"
[DENY ] N-10 app SET ROLE br_journal_owner                | ERROR: permission denied to set role "br_journal_owner_r3"
[DENY ] N-11 app SET SESSION AUTHORIZATION writer         | ERROR: permission denied to set session authorization
[DENY ] N-12 app SET SESSION AUTHORIZATION owner          | ERROR: permission denied to set session authorization "br_journal_owner_r3"
```

### 4.3 Cannot self-grant

```
[DENY ] N-13 app GRANT writer TO self      | ERROR: permission denied to grant role "command_journal_writer_r3"
[DENY ] N-14 app GRANT owner TO self       | ERROR: permission denied to grant role "br_journal_owner_r3"
[DENY ] N-15 app ALTER ROLE self SUPERUSER | ERROR: permission denied to alter role
[DENY ] N-16 app CREATE ROLE               | ERROR: permission denied to create role
```

### 4.4 Cannot create a `SECURITY DEFINER` escalation route

```
[ALLOW] N-24 app creates its own SECURITY DEFINER function
[DENY ] N-25 app INVOKES it  | ERROR: permission denied for table command_journal_events
[DENY ] H-15 same, re-confirmed after post-migration lockdown | ERROR: permission denied for table command_journal_events
```

This is the correct and important result. The control-plane login *can* author
a definer function (it needs `CREATE` for its own migrations), but the function
executes **as the app role itself**, which holds no journal DML — so the
escalation route yields nothing. Escalation would require owning the function
*as a privileged role*, which requires membership the app does not have (N-13,
N-14).

### 4.5 Cannot alter or disable journal triggers

```
[DENY ] N-17 app DISABLE append-only trigger  | ERROR: must be owner of table command_journal_events
[DENY ] N-18 app DROP trigger                 | ERROR: must be owner of relation command_journal_events
[DENY ] N-19 app ALTER TABLE OWNER TO self    | ERROR: must be owner of table command_journal_events
[DENY ] N-20 app DROP journal table           | ERROR: must be owner of table command_journal_events
[DENY ] N-21 app REPLACE immutability fn      | ERROR: must be owner of function command_journal_immutable
[DENY ] N-22 app REPLACE the append routine   | ERROR: must be owner of function command_journal_append
[DENY ] N-23 app ALTER append routine owner   | ERROR: must be owner of function command_journal_append
[DENY ] H-6  app CREATE TRIGGER on journal    | ERROR: permission denied for table command_journal_events
[DENY ] H-7  app CREATE RULE on journal       | ERROR: must be owner of table command_journal_events
[DENY ] H-8  app SET session_replication_role='replica' | ERROR: permission denied to set parameter "session_replication_role"
```

H-8 deserves emphasis: `session_replication_role = 'replica'` is the classic
way to silently disable triggers. It is **denied at the parameter level** —
setting it requires superuser (or an explicit `GRANT SET ON PARAMETER`), which
the app does not have. That closes a bypass most designs overlook.

### 4.6 Shadowing and privilege-leak probes

```
[DENY ] H-3  app CREATE SCHEMA evil                   | ERROR: permission denied for database
[ALLOW] N-26 app creates pg_temp shadow table, then appends -> real rows +1, temp_rows=0
[ALLOW] H-5  app sets search_path=evil,public, appends      -> writes to the REAL table
[DENY ] H-14 definer body attempts SET ROLE owner     | ERROR: cannot set parameter "role" within security-definer function
[ALLOW] H-12 identity INSIDE definer  -> command_journal_writer / session=app
[ALLOW] H-13 identity AFTER the call  -> app  (elevation does not persist)
[DENY ] H-13b app INSERT after calling the routine    | ERROR: permission denied for table command_journal_events
```

H-13/H-13b are the containment proof: the elevation exists only for the
duration of the call, and the caller emerges with exactly the privileges it
started with. H-14 is PostgreSQL refusing `SET ROLE` inside a definer function
by design — so the routine cannot be used as a role-escalation primitive.

---

## 5. Positive test (requirement 4) — the app invokes only the routine, in its own transaction

```
[ALLOW] P-1 app SELECT journal (read allowed)  | 1
[ALLOW] P-2 app calls append routine           | seq 2
```

### 5.1 The §1.4 mechanism, demonstrated on one connection

This is the whole point of the Founder's direction, so it is proven in all
three directions, not just the happy path:

```
7a. COMMIT   : BEGIN; INSERT lifecycle; SELECT command_journal_append(...); COMMIT;
               -> lifecycle rows=1   journal refs=1        (both persisted)

7b. ROLLBACK : BEGIN; INSERT lifecycle; SELECT command_journal_append(...); ROLLBACK;
               -> lifecycle rows=0   journal refs=0        (neither persisted)
               -> head after rollback=3  tail=3            (latch did not advance)

7c. FAIL-CLOSED: BEGIN; INSERT lifecycle; append with a DUPLICATE command_id; COMMIT;
               -> lifecycle rows=0                          (journal failure aborted the entire act)
```

7c is the governance-critical case: a journal failure does not leave a
lifecycle event orphaned. The act does not take effect. That is contract
§1.4's "the pair commits or neither does," demonstrated rather than asserted.

**Scope discipline:** this proves the *mechanism* is capable of §1.4 atomicity.
It does **not** claim §1.4 is satisfied — see §7.

---

## 6. Append correctness (requirement 5) — all measured

**Singleton initialization.** Migration act only: one row
`(head_id=1, head_seq=0, head_hash=`64 ASCII zeros`)` inserted before any
event exists. `INSERT`/`DELETE` on the head table are denied to the app
(N-5, N-7) and to the writer (r2 measurements D3/D4). A second row is
unrepresentable even for the owner:

```
[DENY ] C-1  second head row (app)   | ERROR: permission denied for table command_journal_chain_head
       owner attempt                 | ERROR: new row violates check constraint "command_journal_chain_head_singleton"
```

**Row locking.** `SELECT ... FOR UPDATE` on the singleton, inside the caller's
transaction. `READ COMMITTED` suffices; the lock provides serialization, so no
`SERIALIZABLE` retry loop is needed.

**Pre-write tail verification.** Both `seq` **and** `chain_hash` are compared
against the recomputed tail before any write. A head that agrees on position
but not on hash — the tamper case — is caught.

**Concurrent append — 12 simultaneous appends over 12 parallel app logins:**

```
returned:  5 11 12 13 6 14 9 7 10 8 16 15
integrity: rows=16  distinct_seq=16  distinct_hash=16  min=1  max=16
head=16    gaps=0
```

Interleaved completion order, strictly serialized assignment, gapless
sequence, no duplicate `seq` or `chain_hash`, head exactly equal to tail.

**Duplicate `command_id`.**

```
[DENY ] C-2 duplicate (cmd-A, journaled)          | ERROR: duplicate key value violates unique constraint "command_journal_once"
[ALLOW] C-3 same command_id, different event_type | seq 4
```

The partial unique index is `(command_id, event_type)` over the at-most-once
types (`journaled`, `identity_bound`, `dispatched`, `resolved`) per contract
§4.1 — so a retry cannot duplicate an event, while a legitimate second event
for the same command proceeds.

**Head-divergence rollback with unchanged row count.**

```
[DENY ] C-4 append against diverged head | ERROR: command journal chain-head divergence: head=(9999,...) tail=(16,...)
        rows before=16  after=16         (unchanged)
```

Per contract §5.1 this is a **named fail-closed condition**: nothing is
inserted, the head does not advance, and dispatch is blocked until the
divergence is resolved as an integrity finding. Not auto-retried.

**Final integrity after the entire attack battery:** `rows=20 head=20 tail=20
gaps=0`.

---

## 7. Non-activating scope claim

PR 2b may create **dormant journal primitives only**:

1. Permitted: the journal tables, the singleton chain-head row, the
   immutability triggers, the two NOLOGIN roles, the grants, the append
   routine, and their tests.
2. **PR 2b does not claim to satisfy contract §1.4's dual-write rule.** §5.1
   proves the *mechanism* can carry a lifecycle insert and a journal append in
   one transaction. §1.4 is satisfied only when a **later authorized dispatch
   integration performs both writes in one transaction as a real control-plane
   act.** That act does not exist in this tranche, and no test here may be
   represented as proving it.
3. PR 2b activates no dispatch path; contract §5.1's pre-dispatch fail-closed
   rule is not exercised because no governed command dispatches.
4. PR 2b does not discharge Phase 4 stop-gate items 2 and 4–10. It contributes
   storage-layer evidence toward item 1 and item 3 only.
5. Any PR-body statement that PR 2b "implements the journal" or "satisfies
   §1.4" misrepresents this plan.

---

## 8. Residual risk (requirement 6) — stated plainly

**The database is tamper-evident, not tamper-proof.**

Measured, on the model as specified:

```
owner DISABLE TRIGGER + UPDATE  : PERMITTED
owner TRUNCATE                  : PERMITTED  (TRUNCATE bypasses row triggers entirely)
writer DISABLE TRIGGER          : ERROR: must be owner of table
writer TRUNCATE                 : ERROR: permission denied for table
writer UPDATE / DELETE events   : ERROR: permission denied for table
app    (everything)             : denied — §4
```

Tamper-evidence, demonstrated end to end:

```
owner disabled the trigger and edited row 1 -> payload='TAMPERED'
recomputed-chain check                      -> MISMATCH-DETECTED
```

The hash chain caught what the trigger could not prevent. That is precisely
why contract §4.1 requires `verify()` to recompute from genesis and never
trust the head.

**Who can still bypass, and why it cannot be eliminated:**

- **`br_journal_owner`** — ownership rights are inherent and non-revocable in
  PostgreSQL ("The right to drop an object, or to alter its definition in any
  way, is not treated as a grantable privilege; it is inherent in the owner" —
  `GRANT` docs). Some role must hold them to evolve the schema. Mitigated by
  NOLOGIN: no credential exists for it.
- **Superuser / Neon platform admin** — outside this repository's control.
- **The migration path (U1 below)** — the control-plane login needs membership
  in `br_journal_owner` to create objects owned by it, and membership means it
  can `SET ROLE br_journal_owner` at any time, which re-opens the owner
  bypass *from the runtime login*. **This is the single most important
  residual risk in the r3 model and it is not hidden.** Mitigations in U1.

**Consequence for claims:** no PR body, test name, or status line may assert
that journal history is immutable or tamper-proof. The defensible claim is:
"append-only enforced against every non-owner role; owner-level and
superuser-level tampering remains possible and is detectable by `verify()`."

---

## 9. Rollback boundary (requirement 7)

**Posture 1 — before the first append.** `SELECT count(*) FROM
command_journal_events` returns `0` and the head is at `seq=0` with the
genesis hash. The journal is genuinely dormant and no governed fact was ever
recorded. Removal may be permissible: drop the tables, the routine, the two
roles, and the grants; revert the migration. **The precondition is checked,
never assumed** — this is the only window in which destructive rollback is
legitimate.

**Posture 2 — after the first appended event.** The journal holds governed
command history and is append-only by ruling. **Dropping journal history is
destruction of governed records, not ordinary rollback, and is not available
to the Builder or the Operator under any circumstance.** Available reversals:

- **Disable the write path** — configuration/deploy revert; rows remain. The
  normal reversal.
- **Revoke `EXECUTE`** on the append routine — the journal becomes read-only
  and dispatch fails closed per §5.1, which is the designed safe state. Note
  this is *cleaner* than r2's credential revocation: one `REVOKE` statement,
  no secret rotation.
- **Forward-only correction** — append compensating events; never edit or
  delete rows.
- **Schema changes** — additive migrations only.

Destroying journal rows after first write requires an explicit Founder
decision and is a records/custody act, not an engineering rollback.

---

## 10. Expected paths and grant matrix

Proposed, not created.

| Path | Action |
|---|---|
| `packages/control-plane/src/migrations.ts` | MODIFY — append migration `000N_command_journal` (tables, singleton + genesis row, triggers, two NOLOGIN roles, grants/revokes, append routine, post-migration `CREATE` lockdown). Never edit a shipped migration. |
| `packages/journal/src/journal-store.ts` | CREATE — thin caller of `command_journal_append(...)` on the **existing** pool. No new pool. |
| `packages/journal/src/index.ts` | MODIFY — export the store surface. |
| `test/command-journal.storage.test.ts` | CREATE — positive, concurrency, rollback, divergence, duplicate-id. |
| `test/command-journal.permissions.test.ts` | CREATE — the §4 negative matrix. |
| `.github/workflows/ci.yml` | MODIFY — `storage-integration` must create the roles and run the negative suite as a **non-superuser** login. |
| `docs/planning/command-journal/pr2b-storage-architecture-r3.md` | CREATE — this artifact. |

**Measured final matrix** (`_r3` suffixes are harness role names):

```
br_app_r3                   command_journal_chain_head  SELECT
br_app_r3                   command_journal_events      SELECT
command_journal_writer_r3   command_journal_chain_head  SELECT, UPDATE
command_journal_writer_r3   command_journal_events      SELECT, INSERT
br_journal_owner_r3         (owner rights on both tables)

command_journal_append   owner=command_journal_writer_r3  secdef=true
                         acl={writer=X/writer, br_app_r3=X/writer}   <- no PUBLIC entry
command_journal_immutable owner=br_journal_owner_r3       secdef=false

role membership edges: (none)
post-lockdown: writer CREATE on public=false, owner CREATE on public=false
               app EXECUTE on append=true, app INSERT on events=false, app SELECT=true
```

**CI requirement, restated because it is load-bearing:** the existing
`storage-integration` job runs `postgres:16` as the `postgres` superuser, which
would pass every negative test vacuously. The job must create the roles and run
the negative suite over a non-superuser connection. Coverage that depends on
the superuser is exactly the lapse that job's own comment (ci.yml:69–72) was
written to prevent.

---

## 11. Governance re-evaluation (requirement 8) — cited, not assumed

Re-read from primary sources at FounderOS `8198ecf002324cc4e00cf035c7cb98c6de0bc746`.

**(a) The storage locus and sole-writer rule are already ruled.**
`DEC-20260827-01` §10 rules that "BUILD ROOM SHALL ESTABLISH ONE CANONICAL
COMMAND JOURNAL" and that it "shall be append-only and tamper-evident."
Contract §3 is marked **[RULED]** (Founder, 2026-09-01) and rules the Neon
store, the dedicated `command_journal_writer` role "distinct from any role the
control plane uses for operational tables," and enforcement "by grant, not by
discipline." The r3 model implements those ruled words more faithfully than
the original proposal did.

**(b) No new credential is created — the r2 blocker is gone.**
`DEC-20260815-17` §6 lists "new credentials" under NOT AUTHORIZED. r2 was
blocked because Design A required two new logins. **r3 creates two NOLOGIN
roles with no passwords and no connection strings, and adds no environment
variable.** A NOLOGIN role is a privilege container, not a credential: nothing
can authenticate as it. On the plain text of §6, no new credential exists, so
the prohibition is not engaged.

**(c) No new custody domain.** `DEC-20260827-01` §10 "Security and custody"
holds that "Existing evidence-store custody and sole-writer authority remain
controlling. This ruling does not transfer evidence custody or create a new
unrestricted storage authority." Contract §3 confirms "No new custody domain
is created." r3 introduces no secret to hold, so there is no custody question
to answer and **no `DEC-20260815-02` custody trigger.**

**(d) No new infrastructure.** The store is the already-bound Neon project
(contract §3; `DEC-20260815-08`). No provisioning.

**(e) Freeze.** Consistent with `DEC-20260827-01`'s recorded freeze
disposition, this work is demanded by a shipping build (the Build Room v1
slice, clause 7's own freeze-exit criterion), so `DEC-20260814-03` clause 2
does not reach it and no clause 4 exception is claimed.

**(f) Is `SECURITY DEFINER` a "new enforcement mechanism" needing a DEC?**
No. Contract §3 ruled the *property* (sole writer enforced by grant) and left
the mechanism to implementation, exactly as the corpus already leaves
trigger-based append-only enforcement to `migrations.ts`. A definer function
is a grant-based mechanism: it is `EXECUTE` privilege plus function ownership,
both ordinary GRANT-system constructs. It creates no credential, no custody
domain, and no new security boundary — it implements the boundary §3 already
ruled.

**Determination:** the r3 design **remains within existing rulings and
requires only a future exact-SHA Founder implementation authorization.** No
DEC is required. No credential-custody trigger is engaged.

**One caveat that must not be buried (U1).** If the Founder resolves U1 by
granting the control-plane login membership in `br_journal_owner`, that
membership lets the runtime login `SET ROLE br_journal_owner` and thereby
disable triggers — narrowing the practical distance between "app" and "owner."
That is a **security-posture** question, and `AGENTS.md` lists "changing the
repository's security posture" as an approval gate. It does not create a
credential or a custody domain, so it is still not a DEC trigger, but it is a
Founder decision and is listed in §12.

---

## 12. Unresolved — requires Founder decision

**U1 — how journal objects come to be owned by `br_journal_owner` (blocking
implementation, not architecture).** Objects must be created *as* the owner,
but the owner is NOLOGIN. Three routes:

- **(a) Grant the existing control-plane login membership in
  `br_journal_owner`**, used only inside the migration (`SET ROLE` /
  `RESET ROLE`). Simplest; no new credential. **Cost:** the runtime login can
  assume the owner role at any time, re-opening the owner bypass from the
  runtime process (§8). Mitigable by `GRANT ... WITH INHERIT FALSE` (so the
  power is never ambient) and by an N-23-style CI assertion that the app holds
  no *ambient* owner privilege — but the `SET ROLE` capability itself remains.
- **(b) Run journal migrations out-of-band** as the Neon project owner, from a
  Founder-operated surface, leaving the runtime login with no membership at
  all. **Strongest boundary; cost:** journal DDL leaves the automatic boot
  migration path, which is an operational change and touches deploy process.
- **(c) Let the control-plane login own the journal tables** and drop
  `br_journal_owner` entirely. **Rejected by the Founder's direction** — it
  contradicts the required ownership model — and recorded only for
  completeness.

Recommendation: **(a) with `INHERIT FALSE`** for this tranche, because it
keeps boot migrations working and the residual risk is documented and
detectable; **(b)** if the Founder wants the strongest posture and accepts the
operational change. This is a recommendation, not a decision.

**U2 — Neon platform capability.** Whether the bound Neon project permits
`CREATE ROLE ... NOLOGIN`, `ALTER FUNCTION ... OWNER TO`, and object ownership
by a NOLOGIN role. All measured facts here come from PostgreSQL 18.4 locally;
Neon's managed role model may differ. Must be verified before implementation —
stop condition S3.

**U3 — `search_path` on the existing pool.** Confirmation that the
control-plane connection does not set a `search_path` that would change
resolution of the unqualified `command_journal_append` call site. Low risk
(the function is schema-qualified at the call site), but stated.

---

## 13. Stop conditions (plan-drift)

- **S1** — U1 is not decided before implementation begins; the migration
  cannot be written without knowing how ownership is established.
- **S2** — the controlling contract hash changes from `eaeb6178…9e52`.
- **S3** — Neon cannot support NOLOGIN role ownership or `ALTER FUNCTION ...
  OWNER TO` (U2). The enforcement claims in §4 would then be false on the real
  platform and must not be asserted.
- **S4** — CI cannot run the §4 negative matrix as a non-superuser login. An
  unenforceable claim must not merge as an enforced one.
- **S5** — any design change that grants the control-plane login direct DML on
  journal tables, membership in `command_journal_writer`, or ambient owner
  privilege reintroduces the defect this line of revisions exists to fix.
- **S6** — any implementation that introduces a **user-defined hash helper**
  instead of the `pg_catalog` builtin `sha256()`, reopening the overload
  vector closed in §3.3.
- **S7** — implementation would write a real control-plane act, activating
  §1.4; that is outside PR 2b's scope (§7).
- **S8** — a second database login or credential is proposed for this tranche,
  contrary to the Founder's direction and to §11(b).

---

## 14. Verdict

**ARCHITECTURE-READY.**

The Founder's directed model is specified exactly and its security claims are
proven, not asserted: 40+ measured checks over real non-superuser login
connections against PostgreSQL 18.4, covering all six negative categories
required, the positive single-transaction path in all three of its commit /
rollback / fail-closed directions, and the full append-correctness battery
including 12-way concurrency.

The r2 blockers are both dissolved: U1 (two pools vs §1.4 atomicity) is
resolved by construction, and the credential blocker is gone because this
tranche creates **no login and no secret**. Governance re-evaluation from
primary sources finds the design **within existing rulings, requiring only a
future exact-SHA Founder implementation authorization — no DEC, no
credential-custody trigger.**

Three items remain open and none is architectural: **U1** (how ownership is
established at migration time — a security-posture choice reserved to the
Founder), **U2** (Neon platform verification, a factual check the Builder
performs before coding), and **U3** (a low-risk confirmation).

Implementation remains **unauthorized**. This plan is advisory until the
Founder approves it and issues an exact-SHA implementation authorization.

---

## Appendix A — verification provenance

All `[ALLOW]`/`[DENY]` lines are real output from **PostgreSQL 18.4**
(Homebrew, `aarch64-apple-darwin25.6.0`) on 2026-09-05, scratch database
`cjp4`, roles `br_journal_owner_r3` (NOLOGIN), `command_journal_writer_r3`
(NOLOGIN), `br_app_r3` (LOGIN). Every app-side check ran over the app's own
login connection (`psql -U br_app_r3`).

Harness files: `/tmp/br-journal-proof/r3-setup.sql`,
`r3-verify.sh`, `r3-harden.sh`, `r3-harden2.sh`, `r3-harden3.sh`.

**Method notes, recorded because they invalidated intermediate readings:**

1. `SET ROLE` privilege is evaluated against the **session** user. An earlier
   r2-era harness performed `SET ROLE` inside a superuser session and appeared
   to show denials succeeding; that run was discarded. All results use real
   per-role logins.
2. The first r3 setup failed outright because `REVOKE CREATE ON SCHEMA public
   FROM PUBLIC` preceded the NOLOGIN owner's `CREATE TABLE`. The fix became a
   stated migration ordering constraint (§2.2) rather than a silent patch.
3. The H5/H6 probes initially returned "function does not exist" because an
   earlier lockdown step had already revoked `CREATE` from the writer role —
   the probes could not be authored. They were re-run with `CREATE`
   temporarily restored, then revoked again; the reported H-12/H-13/H-14
   results are from that corrected run.
4. The `digest_stub` overload probe used an md5-based stand-in. Its finding
   (a partial hijack surface) is what drove the §3.3 requirement to use the
   `pg_catalog` builtin `sha256()`, which was then separately verified as
   non-shadowable.

**Fidelity limits.** These results are from PostgreSQL 18.4 local; the bound
store is Neon (Postgres 16 in CI). Role-management behavior on Neon's managed
platform is **not** verified here — U2/S3.
