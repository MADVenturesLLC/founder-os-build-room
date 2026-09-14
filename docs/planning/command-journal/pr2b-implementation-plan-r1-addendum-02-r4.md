# PR 2b — Implementation Plan r1, Addendum 02 r4 (Tranche B: SQL as the sole row encoder; a dormant redacting caller that supplies fields, never bytes)

Status: **ADVISORY SUCCESSOR to Addendum 02 r3. PROPOSED SCOPE ADDITIONS
FOR `br-architect` REVIEW. NO IMPLEMENTATION AUTHORITY IS CREATED,
IMPLIED, OR CARRIED BY THIS ARTIFACT. NOTHING HERE PAUSES, CONDITIONS, OR
AMENDS AN INDEPENDENTLY ISSUED GATE III EXECUTION.**

This artifact creates no code, test, PostgreSQL role, credential, token,
permission, GitHub environment, GitHub secret, repository setting, Railway
service, Railway variable, Neon object, migration, branch, commit, or PR.

Work ID: `BR-PR2B-IMPL-PLAN-R1-A02-R4`
Seat: drafted by `builder` at the Founder's request, 2026-09-14, revising
Addendum 02 r3 against the third `CHANGES-REQUESTED` review addressed to
`br-architect`. The builder seat holds no plan authority.
Amends (proposed): r1 §4.2 and §5.2 **by addition only**. r1, Addendum 01,
and Addendum 02 r1–r3 are preserved byte-for-byte; r3 is superseded as a
draft by this r4 and retained as the review record.
Next role: **`br-architect` review; custody seat for §0's access request;
Founder only for §10.**

---

## 0. Controlling stack and access limitation

Recomputed in this session against Build Room `origin/main` at `b25deb5`.

| Artifact | Path | SHA-256 |
|---|---|---|
| Plan r1, unmodified | `docs/planning/command-journal/pr2b-implementation-plan-r1.md` | `08f3ea7418db7052ffd7fb4cf6df4672f169c95933a7c07c71ef637ae775b3ce` |
| Addendum 01, unmodified | `docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-01.md` | `91c0133448dc632ee269313fc56092dad95b3fedc7d41d65baf29297dfd1dc87` |
| Addendum 02 r1, unmodified (uncommitted draft) | `…/pr2b-implementation-plan-r1-addendum-02.md` | `689ed7aad0f441470a2acd0f96ea71cb7fc519cc3d92be39a566ecaf1c8cb355` |
| Addendum 02 r2, unmodified (uncommitted draft) | `…/pr2b-implementation-plan-r1-addendum-02-r2.md` | `522fb0d392e2ad9da1380b3ea0b989fc2c05fdfa286cbb3e37787d4ac0b4d626` |
| Addendum 02 r3, unmodified (uncommitted draft) | `…/pr2b-implementation-plan-r1-addendum-02-r3.md` | `8bdcb90ba23cdcfe1bcd08caa37298248bd5c0d1b5bdb4d18d5b342a3734a6ee` |
| Architecture r6, frozen | `docs/planning/command-journal/pr2b-storage-architecture-r6.md` | `658daa9c0194d5f56d7506fb8ade05d24d413cd08b106a067ff9100ce5815954` |
| Journal contract v0.17 | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` |
| Canonical encoders and golden vectors | `packages/journal/src/{bytes,envelope,event-row,decision-row,chain}.ts`, `packages/journal/vectors/{envelope,plandoc,decision-row,chain}.json`, `test/journal-vectors.test.ts` at `b25deb5` | read directly; §2 relies on them |

**Instruments named by the earlier review, unchanged from r3:** the
reviewed Gate III r3 draft act (`d024e508…`) and the controlling Founder
ruling (`2431c633…`) sit under `/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/`,
a macOS host this remote session cannot read; neither is present in any of
the four scoped repositories. A reviewed draft act is not issuance; no
issuance instrument was located; nothing is inferred. **Access request to
the custody seat stands:** supply both files verified against the supplied
hashes, plus any Gate III issuance receipt and the Gate I instrument, into
this session or a readable repository path.

---

## 1. Authority stack, unchanged from r3

| Instrument | Transcribed in a repository | Status readable from this surface |
|---|---|---|
| FD-1 | yes (Addendum 01 §1) | closed; base `6d6110d…` |
| Gate I | no | not determined; likely carried by the unreadable draft act |
| Gate II (Tranche A) | PR #27 merged `f21693e` under comment 5654523254, with its authority disclosure and F1/F2 correction record | effective per that record |
| FD-2 | Addendum 01 §9: open, before Gate IV | open |
| Gate III r3 (reviewed draft), controlling ruling, FD-B1–B4 | no | unreadable here; existence recorded from the review's citation |
| Gate III effective issuance | no | not located; not inferred |

The SQL tranche (r1 §4.2 rows B-M1, B-N1, B-M2, B-M3, B-T1, B-T2, B-T3,
B-M4) proceeds under whatever issuance governs it. This addendum adds
nothing to its prerequisites and is not a condition on it.

---

## 2. Interface resolution: SQL is the sole encoder of the hashed row

### 2.1 What r3 got wrong, stated from the code

r3 proposed that TypeScript encode `PREFIX` and `SUFFIX` and pass
constraint scalars alongside. Two facts defeat it:

- `packages/journal` exports only whole-row encoders
  (`encodeCommandEventRow`, `encodeDecisionRecordRow`, `encodeEnvelope`,
  `envelopeDigest`, `chainHash`). The field tags and the
  `stringField`/`bytesField`/`arrayField`/`pairField` primitives are
  module-private (`bytes.ts`, `event-row.ts`, `decision-row.ts` at
  `b25deb5`). A caller cannot produce a suffix without copying encoder
  logic, which would be a second, ungoverned implementation.
- Scalars passed beside pre-encoded bytes are a second input. Anything
  persisted from the scalars could diverge from what the chain hash
  covers, which violates the complete-row requirement (contract §6.2(c)).

Both are removed by giving the routine **one input** and letting it derive
everything it persists and everything it hashes from that input.

### 2.2 Ownership, resolved

| Concern | Owner | Basis |
|---|---|---|
| Field values of the record (every column of §2.4 except those below) | supplied by the caller, **after redaction**, as one typed input | contract §2, §6.1 |
| `command_envelope` canonical bytes (spec (a)) | TypeScript via the public `encodeEnvelope`, passed as opaque bytes; persisted exactly as passed; covered by the hash exactly as passed | contract §6.2(a) |
| `envelope_digest` | **SQL**: `encode(pg_catalog.sha256(command_envelope), 'hex')`. No digest parameter exists; a caller cannot assert one | contract §6.2(a); r6 §16.5 |
| `seq` | **SQL**: `head.seq + 1` after the head lock and tail verification | contract §4.1 |
| `recorded_at` | **SQL**: server clock, rendered once as the canonical RFC 3339 UTC text with six fractional digits; the rendered text is what is hashed and what is persisted | contract §2 element 11 ("server-generated") |
| Canonical row bytes (spec (c) or (d)) | **SQL**: encoded inside the routine from the same PL/pgSQL variables that are inserted as columns | contract §6.2 ("two conforming implementations must produce byte-identical canonical forms") |
| `chain_hash` | **SQL**: `encode(pg_catalog.sha256(convert_to(prior_chain_hash,'UTF8') || row_bytes),'hex')` against the verified tail | contract §4.1; r6 §16.5 |
| Head lock, tail verification, insert, head advance | **SQL** | contract §4.1 |

TypeScript predicts nothing. It learns `seq`, `recorded_at`,
`envelope_digest`, and `chain_hash` from the routine's return, after the
fact.

### 2.3 The routine, one name, one object, two record classes

r6 §3.3/§4.3 and r1 §4.2.1 name a single routine,
`public.command_journal_append(...)`, and the object set is stated as
complete. Overloading would add a second function object. The proposal
therefore keeps **one function** and discriminates the record class by
argument:

```
public.command_journal_append(
  p_record_class  text,    -- 'command' | 'decision'
  p_fields        jsonb,   -- closed key set per class (§2.4); strings and string arrays only
  p_envelope      bytea    -- spec (a) canonical bytes; required for 'command' rows that carry
                           -- an envelope, must be NULL for 'decision' rows
) RETURNS TABLE (seq bigint, recorded_at text, envelope_digest text, chain_hash text)
```

`jsonb` is chosen because every hashed field is a UTF-8 string or an
ordered string array, both of which `jsonb` preserves exactly (key order
is irrelevant: the routine reads keys by name; array order is preserved).
A composite-type pair is an acceptable implementer alternative with the
same closed-key discipline; the choice is B-M1's.

The routine, in order: (1) `p_record_class` in the closed set, else raise;
(2) `p_fields` keys exactly the closed set for that class, no extra key,
required keys present, optional keys present-or-absent as the spec
defines, every value a string (or string array where the spec says so),
else raise; (3) per-field vocabulary checks the encoder already enforces
in TypeScript (`event_type` in the closed set, `command_id` carries the
`cmd_` prefix, hex-64 where required, `plan_hash` presence per the
plan-bearing derivation for decision rows), else raise; (4) lock the head,
verify it against the recomputed tail, abort on divergence; (5) `seq`,
`recorded_at`; (6) `envelope_digest` from `p_envelope`; (7) encode
`row_bytes` per spec (c) or (d) from the same variables; (8) `chain_hash`;
(9) insert the columns **and** `row_bytes` **and** `chain_hash`; (10)
advance the head; (11) return. Steps 1–3 raise before step 4, so a
malformed input touches neither the head nor the table. `search_path`
pinned, no dynamic SQL, `pg_catalog.sha256` only (r1 B-H1/B-H2).

### 2.4 Persisted columns, closed, one per hashed field

So that reconstruction from persisted columns is total, the events table
persists exactly the hashed fields as typed columns, plus the derived
values, plus the bytes:

| Column | Class | Hashed | Derived by SQL |
|---|---|---|---|
| `seq` (PK) | both | yes | yes |
| `record_class` | both | yes | from `p_record_class` |
| `event_type`, `command_id`, `room_id`, `run_id`, `execution_id`, `actor_id`, `role_id`, `repository`, `scope_ref`, `authorization_ref`, `intended_provider`, `intended_model`, `intended_surface`, `provider`, `model`, `execution_surface`, `failure_classification`, `resolution_determination`, `resolution_semantics`, `lifecycle_room_id`, `lifecycle_event_id`, `evidence_refs text[]` | command | yes | from `p_fields` |
| `command_envelope bytea` | command | yes (nested spec (a) bytes) | from `p_envelope`, verbatim |
| `envelope_digest` | command | yes | yes |
| `decision`, `actor_id`, `recorded_state`, `prior_state`, `plan_hash`, `authorization_ref`, `lifecycle_room_id`, `lifecycle_event_id` | decision | yes | from `p_fields` |
| `recorded_at_canonical text` | both | yes | yes (the hashed rendering); a `timestamptz` shadow column may exist for queries but is never hashed or reconstructed from |
| `row_bytes bytea` | both | is the hashed input | yes |
| `chain_hash` (unique) | both | — | yes |

No second representation of any hashed field is persisted (in particular
no `jsonb` copy of the envelope), so no column can disagree with the bytes
except by tampering, which the chain detects.

### 2.5 Reconstruction obligation (T4-9 and T4-10)

**T4-9, from persisted columns only.** For every persisted row: `SELECT`
the columns of §2.4; rebuild the `CommandEventRow` or `DecisionRecordRow`
value **from those columns** (`seq` rendered as canonical decimal text,
`recorded_at_canonical` as-is, `command_envelope` decoded only to the
extent of being passed as the pre-encoded nested bytes the encoder
accepts); call the public `encodeCommandEventRow` /
`encodeDecisionRecordRow`; assert byte-equality with the persisted
`row_bytes`; fold `chainHash` from genesis in `seq` order and assert
equality with every persisted `chain_hash` and with the head. The input
draft the test submitted is not consulted. Both reference functions are
test-scoped oracles; no runtime `verify()` or recovery consumer is added.

**T4-10, golden-vector conformance of the SQL encoder.** Replay the
committed vectors in `packages/journal/vectors/chain.json` and
`decision-row.json` through the routine on an empty journal in vector
order, and assert the persisted `row_bytes` and `chain_hash` equal the
vectors' bytes and hashes exactly. This is the contract's own
byte-identity requirement for a second implementation (§6.2), proven
against the ratified vectors rather than against this document. Where a
vector fixes `recorded_at`, the routine's clock is injected for the test
(a `p_recorded_at_override` accepted **only** when a test-only GUC set by
the suite is present is one implementer option; a clock-injection seam
that does not exist in production is required, and its absence in
production is itself asserted by T4-10's companion negative case).

### 2.6 Adversarial mismatch cases (no row, no head advance)

| Case | Expected |
|---|---|
| `p_fields` with an extra key, a missing required key, a non-string value, an `event_type` outside the closed set, a `command_id` without `cmd_`, a malformed `plan_hash`, or `plan_hash` presence contradicting the plan-bearing derivation | raise at step 2/3; zero rows; head unchanged; the head row was never locked |
| `p_envelope` supplied for a `decision` row, or absent for a `command` row that names an envelope-bearing event | raise before step 4 |
| a caller attempting to supply `seq`, `recorded_at`, `envelope_digest`, `row_bytes`, or `chain_hash` | structurally impossible: no such parameter; the test asserts the routine signature by catalog query |
| concurrent append against a stale head | abort at step 4 (contract §4.1); already r1 B-A5 |

---

## 3. Transaction and error ownership (unchanged from r3, restated)

The transaction owner is the store's wrapper (`PostgresLedgerStore.append`
shape, and the identical private `transaction()` in `phase3-run.ts`):
`BEGIN`, body, `COMMIT`; on throw `ROLLBACK`, rethrow, release. B-N2 is a
body-level function on the owner's `PoolClient`; it begins, commits, and
rolls back nothing and catches none of the owner's errors.

| Guarantee | Given by |
|---|---|
| Refusal **before any journal SQL** when the boundary is refused | B-N2 |
| Rollback of the whole transaction on refusal or routine failure | the owner |
| Names-only content of B-N2's own errors | `packages/redaction` |
| Content of routine errors | not B-N2; a registry-known value cannot appear in them because the record was redacted before any bytes reached SQL |
| HTTP surface: message logged with an incident id, never returned | `server.ts`, pre-existing; B-N2 adds nothing |

---

## 4. Proposed additions (r1 §4.2 and §5.2, by addition)

| Id | Action | Path | Change | Basis |
|---|---|---|---|---|
| B-N2 (proposed) | NEW | `packages/control-plane/src/journal-append.ts` | `appendJournalRecord(client, boundary, record)`: (1) `boundary.require()`, refused → throw before any SQL of its own; (2) `redactValue(record)`; (3) for command records, `encodeEnvelope(redacted.commandEnvelope)` via the public encoder; (4) build the closed-key `p_fields` object from the redacted record; (5) `EXECUTE public.command_journal_append(class, fields, envelope)` on the caller's `client`; (6) return the routine's `seq`, `recorded_at`, `envelope_digest`, `chain_hash`. Supplies fields, never row bytes; predicts nothing. **Dormant on merge: nothing calls it** | contract §3, §4.1, §6.1, §6.2 |
| B-N3 (proposed) | NEW | `packages/control-plane/src/redaction-boundary.ts` | as r3 §5: factory with injected custody, manifest names excluded from the heuristic scan, values trimmed, key-representation registration (§5), no switch | contract §6.1 |
| B-T4 (proposed) | NEW | `test/journal-redaction.storage.test.ts` | the §6 matrix, composed with a transaction owner of the store's exact shape and B-N2, fixture custody, CI Postgres | contract §6.1, §6.3, §4.1, §6.2 |

**Consequence for B-M1 (the migration text).** The routine's input shape
(§2.3), its validation steps, the persisted column set (§2.4), and the
SQL encoding of spec (c)/(d) are Tranche B implementation content that
this addendum proposes; r6 does not fix them and r1 leaves them to B-M1.
Whether the SQL tranche adopts §2.3–§2.4 is for the governing Gate III
instrument and the implementer; **without an encoder in the routine, this
addendum's caller cannot exist**, and the caller is then withdrawn rather
than re-shaped around a divergent input.

Unchanged: every existing r1 Tranche B row, its FORBIDDEN list, and its
external-effect statements. B-M3 (`tsconfig.json`) still expected to need
no change.

---

## 5. Key registration and protection (unchanged from r3 §5)

The factory loads the key once from the injected custody; if loaded, it
registers lowercase hex, uppercase hex, and standard base64 of the key
bytes under reserved names (source `generated`), refuses on any
registration failure, and opens the package boundary with an in-memory
custody carrying the already-loaded bytes. Coverage is exactly those three
representations as exact substrings of text fields in the redacted tree;
raw bytes, base64url, separated or URL-encoded forms, and partial
substrings are not covered. The replacement token is the package's
standard shape (first 16 hex of HMAC-SHA256 keyed with the key over the
value's UTF-8 bytes); no statement is made about what it discloses.
Refusal details carry names and codes only.

---

## 6. B-T4 as a matrix, bound to the real composition

Composition: a transaction owner with the store's exact shape whose body
performs a lifecycle-shaped insert into a test table and then calls B-N2;
fixture custody injected into B-N3; the CI Postgres of r1 B-M4; a
routine implementing §2.3 in the test schema.

| Row | Seeded where | Value class | Expected |
|---|---|---|---|
| T4-1 | envelope free-text field | manifest value (`CONTROL_PLANE_TOKEN` fixture) | 0 occurrences in `row_bytes`, `command_envelope`, and every column; token present; persisted `envelope_digest` = `sha256(persisted command_envelope)` |
| T4-2 | envelope nested field | heuristic value | as T4-1 |
| T4-3 | decision record field (`authorization_ref`) | manifest value | as T4-1 over a `decision` row |
| T4-4 | `evidence_refs` entry | manifest value | as T4-1; persisted array order equals submitted order |
| T4-5 | body: lifecycle insert, then B-N2 under a **refused** boundary | — | throw before any journal SQL; the **owner** rolls back; lifecycle row absent; zero journal rows; head unchanged; error text carries no seeded value |
| T4-6a/b/c | envelope free-text field | key hex / HEX / base64 | 0 occurrences; token present |
| T4-7 | envelope free-text field | `DATABASE_URL` fixture value | as T4-1 |
| T4-8 | refused boundary: `key_absent`, `key_unavailable`, registration failure, `registry_unloadable` | — | refusal before any journal SQL; names-only detail; owner rolls back |
| T4-9 | reconstruction from persisted columns | — | §2.5, first paragraph |
| T4-10 | golden-vector replay through the routine | — | §2.5, second paragraph, plus the negative case that no clock or `seq` override exists outside the test seam |
| T4-11 | adversarial inputs | — | every row of §2.6: zero rows, head unchanged |

No test count is prescribed.

---

## 7. Custody, execution, and enforcement (unchanged from r3 §7)

Fixture custody qualifies Tranche B; a Linux custody implementation is a
separate redaction v0.2 act; dispatch integration is a separate amendment
to whichever tranche places it; production key provisioning is a Founder
custody act at Tranche D or later. B-N2 is dormant on merge; no
enforcement claim is made or implied until integration and provisioning
are both authorized and landed.

---

## 8. `JournalAppendSink` (unchanged)

Not the journal writer; B-N2 uses the boundary's redactor and the public
`encodeEnvelope` only. `packages/redaction/src/**` is not modified.

---

## 9. Drift and execution language (unchanged from r2/r3)

S2 is the contract-hash stop only. Code-merge and execution SHAs have
different roles and may identify the same commit. FD-B1 and FD-B3 are
governing instruments this surface cannot read; nothing here restates or
narrows them.

---

## 10. Decisions requiring new Founder authority

- **D-1.** Whether B-N2, B-N3, and the B-T4 matrix (§4, §6), on the
  interface of §2 (SQL as sole encoder, one routine, one typed input,
  persisted columns exactly the hashed fields), are accepted as a Tranche
  B scope amendment for the governing Gate III instrument to name.
  Accepting D-1 selects no base, provisions nothing, integrates nothing,
  and touches neither FD-2 nor any issued Gate III execution. If the SQL
  tranche's routine takes a different input shape, D-1 is declined and the
  caller is withdrawn.

Nothing else is asked.

---

## 11. Change table from Addendum 02 r3

| r3 statement | r4 disposition |
|---|---|
| TypeScript encodes `PREFIX`/`SUFFIX` "with the spec encoders"; SQL splices `SEQ_FIELD` | withdrawn: the field primitives are private; §2 makes SQL the sole encoder of spec (c)/(d) from one typed input; TypeScript supplies fields and the public spec (a) envelope bytes only |
| Constraint scalars passed beside bytes, "never feed the hash" | withdrawn: no bytes parameter, no scalar side channel; every persisted column and every hashed byte derive from the same routine variables (§2.2–§2.4); adversarial cases in §2.6 and T4-11 |
| `envelope_digest` computed in TypeScript and carried in the suffix | corrected: derived in SQL from the persisted envelope bytes; no digest parameter (§2.2) |
| `recorded_at` supplied by the caller | corrected: server-generated in SQL per contract §2 element 11; the hashed rendering is persisted as `recorded_at_canonical` |
| Routine shape command-specific while T4-3 promised decision rows | resolved: one routine, `p_record_class` discriminator, closed key set per class, `p_envelope` NULL for decisions (§2.3); T4-3 kept |
| T4-9 re-encodes "the row with the returned seq" | corrected: reconstruction from persisted columns only (§2.5); T4-10 adds golden-vector replay through the routine |
| Persisted column set unstated | stated closed (§2.4): exactly the hashed fields, plus derived values and `row_bytes`; no second representation |

---

## 12. Attribution

Drafted by the `builder` seat (Actor-Id
`session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`, Execution-Surface
`claude-code`). No commit was produced. If committed later, the committing
act carries its own trailers per `DEC-20260718-05` and its own
authorization.

---

## 13. Status

`ADVISORY SUCCESSOR — PROPOSED SCOPE AMENDMENT; ACCESS REQUEST OPEN (§0)`

**Nothing was created or modified.** Addendum 02 r1, r2, and r3 are
preserved unchanged as the review record.
