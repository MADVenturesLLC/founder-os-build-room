# PR 2b — Implementation Plan r1, Addendum 02 r5 (Tranche B: SQL encodes the envelope and the row from validated fields; a fixed three-argument append routine with no clock seam)

Status: **ADVISORY SUCCESSOR to Addendum 02 r4. PROPOSED SCOPE ADDITIONS
FOR `br-architect` REVIEW. NO IMPLEMENTATION AUTHORITY IS CREATED,
IMPLIED, OR CARRIED BY THIS ARTIFACT. NOTHING HERE PAUSES, CONDITIONS, OR
AMENDS AN INDEPENDENTLY ISSUED GATE III EXECUTION.**

This artifact creates no code, test, PostgreSQL role, credential, token,
permission, GitHub environment, GitHub secret, repository setting, Railway
service, Railway variable, Neon object, migration, branch, commit, or PR.

Work ID: `BR-PR2B-IMPL-PLAN-R1-A02-R5`
Seat: drafted by `builder` at the Founder's request, 2026-09-14, revising
Addendum 02 r4 against the fourth `CHANGES-REQUESTED` review addressed to
`br-architect`. The builder seat holds no plan authority.
Amends (proposed): r1 §4.2 and §5.2 **by addition only**. r1, Addendum 01,
and Addendum 02 r1–r4 are preserved byte-for-byte; r4 is superseded as a
draft by this r5 and retained as the review record.
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
| Addendum 02 r4, unmodified (uncommitted draft) | `…/pr2b-implementation-plan-r1-addendum-02-r4.md` | `05600e40828c5bacbe254c6794e450840626de12fb45d9385ddd7ccfbd246d63` |
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

## 2. Interface resolution: SQL encodes the envelope and the row from validated fields

### 2.1 What r4 got wrong, stated from the code

r4 accepted `p_envelope bytea` as opaque spec (a) bytes and claimed T4-9
could pass those bytes back into the row encoder. Two facts defeat it:

- `encodeCommandEventRow` takes `commandEnvelope: NormalizedCommandEnvelope`
  (the five-field object) and calls `encodeEnvelope` on it itself; it
  also recomputes `envelopeDigest` and throws on mismatch
  (`event-row.ts`, `validateRow`). No public function accepts pre-encoded
  envelope bytes, and no decoder exists. r4 §2.5's "the pre-encoded
  nested bytes the encoder accepts" was false.
- With no decoder, a `bytea` parameter is unverifiable at the routine:
  any bytes that a caller labels "envelope" would be hashed, digested,
  and stored, and nothing persisted could rebuild the normalized object.

Both are removed by giving the routine the **normalized envelope fields**
instead of bytes, letting SQL encode spec (a) itself, and persisting the
five normalized components so that reconstruction is total. There is now
exactly one encoder of every hashed byte in the row, and it is the
routine.

### 2.2 Ownership, resolved

| Concern | Owner | Basis |
|---|---|---|
| Field values of the record, **including the five envelope fields** | supplied by the caller, **after redaction**, as typed input; validated by the routine | contract §2, §6.1 |
| `command_envelope` canonical bytes (spec (a)) | **SQL**: encoded inside the routine from the validated envelope fields; persisted as derived bytes; hashed as the nested field of spec (c) | contract §6.2(a) |
| `envelope_digest` | **SQL**: `encode(pg_catalog.sha256(command_envelope), 'hex')` over the bytes it just encoded. No digest parameter exists | contract §6.2(a); r6 §16.5 |
| `seq` | **SQL**: `head.seq + 1` after the head lock and tail verification | contract §4.1 |
| `recorded_at` | **SQL**: `pg_catalog.clock_timestamp()` read inside the routine, rendered once as canonical RFC 3339 UTC text with six fractional digits; the rendered text is hashed and persisted. **No parameter, setting, or session value influences it** (§2.7) | contract §2 element 11 ("server-generated") |
| Canonical row bytes (spec (c) or (d)) | **SQL**: encoded inside the routine from the same PL/pgSQL variables that are inserted as columns | contract §6.2 |
| `chain_hash` | **SQL**: `encode(pg_catalog.sha256(convert_to(prior_chain_hash,'UTF8') || row_bytes),'hex')` against the verified tail | contract §4.1; r6 §16.5 |
| Head lock, tail verification, insert, head advance | **SQL** | contract §4.1 |

TypeScript encodes nothing and predicts nothing. B-N2 does not call
`encodeEnvelope`, `envelopeDigest`, `encodeCommandEventRow`,
`encodeDecisionRecordRow`, or `chainHash`; those remain test-scoped
oracles (§2.5). It learns `seq`, `recorded_at`, `envelope_digest`, and
`chain_hash` from the routine's return, after the fact.

### 2.3 The objects: one append routine, one pure encoder

r6 §3.3/§4.3 and r1 §4.2.1 name a single routine,
`public.command_journal_append(...)`, and state the object set as
complete. This addendum proposes, as B-M1 content, that the encoding
logic live in a **pure function** the append routine calls, so that the
same bytes can be produced with a supplied `seq` and `recorded_at` in a
test without any clock seam in the append routine:

```
-- Writes. SECURITY DEFINER per r1 B-H1/B-H2. Exactly these three
-- arguments; no overload; no other signature may exist (§2.7).
public.command_journal_append(
  p_record_class  text,    -- 'command' | 'decision'
  p_fields        jsonb,   -- closed key set per class (§2.4); strings and string arrays only
  p_envelope      jsonb    -- normalized envelope fields (§2.4a); non-NULL iff the row carries an envelope
) RETURNS TABLE (seq bigint, recorded_at text, envelope_digest text, chain_hash text)

-- Pure. IMMUTABLE, no table access, no SECURITY DEFINER, no side effect.
-- The only encoder of spec (a), (c), and (d) bytes in the database.
public.command_journal_encode_row(
  p_record_class  text,
  p_fields        jsonb,
  p_envelope      jsonb,
  p_seq           bigint,
  p_recorded_at   text     -- must already be canonical; the function re-checks and raises
) RETURNS TABLE (row_bytes bytea, command_envelope bytea, envelope_digest text)
```

`command_journal_encode_row` cannot append: it names no table, holds no
privilege, and returns bytes only. The append routine is the only object
that reads or writes the journal tables. A test calling the pure encoder
with a vector's `seq` and `recorded_at` exercises the identical code path
the append routine uses; nothing about that call reaches production
behaviour. This is why the proposal does not put a deterministic clock in
a CI-only schema copy of the routine: a copy would test the copy.

`jsonb` is chosen because every hashed field is a UTF-8 string or an
ordered string array, both of which `jsonb` preserves exactly (key order
is irrelevant: the routine reads keys by name; array order is preserved).
PostgreSQL rejects a `jsonb` literal carrying a lone surrogate escape
(`\ud800`) and, with `server_encoding = UTF8`, rejects invalid UTF-8
input at the wire, which is the server-side counterpart of `utf8()`'s
well-formedness check in `bytes.ts`; T4-11 asserts both (§2.6). A
composite-type pair is an acceptable implementer alternative with the
same closed-key discipline; the choice is B-M1's.

**The append routine, in order:** (1) `p_record_class` in the closed set,
else raise; (2) `p_fields` keys exactly the closed set for that class,
required keys present, optional keys present-or-absent, every value a
string (or string array where the spec says so), else raise; (3)
per-event legality transcribed from the encoder's `EVENT_SHAPES`
(`event-row.ts`) and the decision encoder's rules: which optional fields
each `event_type` requires and allows, `identity_bound` binding at least
one identity and carrying no `evidence_refs`, `event_type` in the closed
set, `command_id` carrying `cmd_` with a non-empty remainder, every
present string non-empty, hex-64 where required, `plan_hash` presence per
the plan-bearing derivation for decision rows, else raise; (4)
`p_envelope`: NULL iff the row does not carry an envelope (for command
rows: present iff `event_type = 'journaled'`, mirroring `EVENT_SHAPES`;
for decision rows: always NULL), and when present validated per §2.4a,
else raise; (5) lock the head, verify it against the recomputed tail,
abort on divergence; (6) `seq := head.seq + 1`; (7) `recorded_at` from
`clock_timestamp()` rendered canonically; (8) call
`command_journal_encode_row` with the validated inputs, `seq`, and
`recorded_at`, receiving `row_bytes`, `command_envelope`,
`envelope_digest`; (9) `chain_hash`; (10) insert the columns of §2.4
**and** `row_bytes` **and** `chain_hash`; (11) advance the head; (12)
return. Steps 1–4 raise before step 5, so a malformed input touches
neither the head nor the table. `search_path` pinned, no dynamic SQL,
`pg_catalog.sha256` only (r1 B-H1/B-H2). The pure encoder repeats the
validation of steps 1–4 on its own inputs so that it is safe to call
directly.

### 2.4 Persisted columns, closed, one per hashed field

So that reconstruction from persisted columns is total, the events table
persists exactly the hashed fields as typed columns, plus the derived
values, plus the bytes:

| Column | Class | Hashed | Derived by SQL |
|---|---|---|---|
| `seq` (PK) | both | yes | yes |
| `record_class` | both | yes | from `p_record_class` |
| `event_type`, `command_id`, `room_id`, `run_id`, `execution_id`, `actor_id`, `role_id`, `repository`, `scope_ref`, `authorization_ref`, `intended_provider`, `intended_model`, `intended_surface`, `provider`, `model`, `execution_surface`, `failure_classification`, `resolution_determination`, `resolution_semantics`, `lifecycle_room_id`, `lifecycle_event_id`, `evidence_refs text[]` | command | yes | from `p_fields` |
| `envelope_version`, `envelope_command_kind`, `envelope_argv text[]`, `envelope_target_repository`, `envelope_scope_ref` (§2.4a) | command | yes (as the content of the nested spec (a) bytes) | from `p_envelope`, verbatim |
| `command_envelope bytea` | command | yes (the nested spec (a) bytes) | **yes**, encoded by the routine from the five columns above |
| `envelope_digest` | command | yes | yes |
| `decision`, `actor_id`, `recorded_state`, `prior_state`, `plan_hash`, `authorization_ref`, `lifecycle_room_id`, `lifecycle_event_id` | decision | yes | from `p_fields` |
| `recorded_at_canonical text` | both | yes | yes (the hashed rendering); a `timestamptz` shadow column may exist for queries but is never hashed or reconstructed from |
| `row_bytes bytea` | both | is the hashed input | yes |
| `chain_hash` (unique) | both | — | yes |

No second representation of any hashed field is persisted (in particular
no `jsonb` copy of `p_fields` or `p_envelope`), so no column can disagree
with the bytes except by tampering, which the chain detects.
`command_envelope` is a derived column, not an input: it is what the
routine encoded from the five components, kept so that the nested bytes
the chain covers are inspectable without re-encoding.

**2.4a The envelope input and its validation.** `p_envelope` carries
exactly the keys of `NormalizedCommandEnvelope` (`envelope.ts`), in the
contract's snake-case names: `envelope_version` (string, must equal
`'1'`), `command_kind` (string, non-empty after trim), `argv` (array of
strings, may be empty, order preserved), `target_repository` (optional
string, non-empty after trim when present), `scope_ref` (optional
string, non-empty after trim when present). Any other key, any non-string
element, a missing `argv`, or a `jsonb` scalar, array, or NULL where an
object is required raises at step 4. The routine's spec (a) encoding is
the byte grammar of `bytes.ts` and the tag order of `envelope.ts`
(`lpString('BRJ:a:1')`, then tags `0x01`–`0x05` with presence byte,
`u32be` length prefixes, and `u32be` array count), proven against
`vectors/envelope.json` by T4-10.

### 2.5 Reconstruction obligation (T4-9 and T4-10)

**T4-9, from persisted columns only.** For every persisted row: `SELECT`
the columns of §2.4; rebuild the `CommandEventRow` or
`DecisionRecordRow` value **from those columns**, including a
`NormalizedCommandEnvelope` rebuilt from the five `envelope_*` columns
and `envelopeDigest` taken from the persisted `envelope_digest`; call the
public `encodeCommandEventRow` / `encodeDecisionRecordRow` (which
re-encodes the envelope and re-checks the digest itself); assert
byte-equality with the persisted `row_bytes`; additionally assert
`encodeEnvelope(rebuilt) ==` persisted `command_envelope` and
`sha256(persisted command_envelope) ==` persisted `envelope_digest`;
fold `chainHash` from genesis in `seq` order and assert equality with
every persisted `chain_hash` and with the head. The input the test
submitted is not consulted. The reference functions are test-scoped
oracles; no runtime `verify()` or recovery consumer is added.

**T4-10, golden-vector conformance of the SQL encoder.** (i) For every
vector in `vectors/envelope.json`: call `command_journal_encode_row`
with a minimal `journaled` field set and the vector's envelope, and
assert the returned `command_envelope` equals the vector's
`canonical_hex` and `envelope_digest` equals its `sha256`. (ii) For every
row in `vectors/chain.json` and `vectors/decision-row.json`: call
`command_journal_encode_row` with the vector's fields, envelope, `seq`,
and `recordedAt`, and assert `row_bytes` equals the vector's
`canonical_hex` byte for byte. (iii) The append routine's chain
arithmetic is proven by the T4-9 fold over rows it actually persisted
under the server clock, and by asserting that `command_journal_append`'s
persisted `row_bytes` equals `command_journal_encode_row` called
afterwards with the persisted columns, `seq`, and
`recorded_at_canonical`. No clock is injected anywhere; no vector is
replayed through the append routine. This is the contract's byte-identity
requirement for a second implementation (§6.2), proven against the
ratified vectors.

### 2.6 Adversarial cases (no row, no head advance)

| Case | Expected |
|---|---|
| `p_fields` with an extra key, a missing required key, a non-string value, an `event_type` outside the closed set, a `command_id` without `cmd_` or equal to `cmd_`, an empty present string, a malformed `plan_hash`, `plan_hash` presence contradicting the plan-bearing derivation, an optional field the event type does not carry, `identity_bound` binding nothing or carrying `evidence_refs` | raise at step 2/3; zero rows; head unchanged; the head row was never locked |
| `p_envelope` NULL on a `journaled` row; non-NULL on any other command event or on a `decision` row | raise at step 4 |
| `p_envelope` with an extra key; `envelope_version` other than `'1'`; empty `command_kind`; `argv` absent, not an array, or containing a non-string; `target_repository` or `scope_ref` present and empty; a `jsonb` scalar or array instead of an object | raise at step 4 |
| a `jsonb` input carrying a lone-surrogate escape (`"\ud800"`) in any string, or invalid UTF-8 on the wire | rejected by PostgreSQL before or at input parsing; the test asserts the raise and asserts `SHOW server_encoding` is `UTF8` on the CI database |
| a caller attempting to supply `seq`, `recorded_at`, `envelope_digest`, `command_envelope` bytes, `row_bytes`, or `chain_hash` | structurally impossible: no such parameter (§2.7) |
| **differential acceptance:** for a generated set of candidate rows spanning every `event_type` × every optional field present/absent, and decision rows spanning every `decision` × plan-bearing state | the routine raises **iff** the TypeScript encoder throws on the same row; the oracle is the encoder itself, so no shape table is exported or duplicated in the test |
| concurrent append against a stale head | abort at step 5 (contract §4.1); already r1 B-A5 |

### 2.7 No clock seam, no override, asserted (T4-12)

The r4 "test-only GUC" is withdrawn. A session setting is caller-writable
by any role, so a routine that reads one would let a runtime role choose
its own `recorded_at`; and the override conflicted with the fixed
signature. The production routine has **no** path by which any caller
input, argument, session setting, or table content selects `recorded_at`
or `seq`. T4-12 asserts, by catalog query on the CI database after the
migration:

- exactly one `pg_proc` row named `command_journal_append` in `public`,
  with `pronargs = 3` and `proargtypes` exactly `(text, jsonb, jsonb)`;
  no overload;
- its `prosrc` contains none of `current_setting`, `set_config`,
  `pg_settings`, or a reference to a fourth argument; and contains
  `clock_timestamp`;
- `prosecdef` true and `proconfig` pins `search_path` (r1 B-H1/B-H2);
- exactly one `pg_proc` row named `command_journal_encode_row`, with
  `provolatile = 'i'`, `prosecdef` false, and a `prosrc` that names no
  table and no `clock_timestamp`/`now`/`current_setting`;
- **clock bracket:** on one connection, `t0 := clock_timestamp()`, call
  the append routine, `t1 := clock_timestamp()`; parse the returned
  `recorded_at`; assert `t0 - 1µs <= recorded_at <= t1`, and assert the
  text satisfies `isCanonicalRecordedAt`. Repeat inside one transaction
  for two consecutive appends and assert the second `recorded_at` is
  greater than or equal to the first (which `now()` could not guarantee
  and which makes the clock source observable).

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
| Content of routine errors | not B-N2; a registry-known value cannot appear in them because the record was redacted before any value reached SQL |
| HTTP surface: message logged with an incident id, never returned | `server.ts`, pre-existing; B-N2 adds nothing |

---

## 4. Proposed additions (r1 §4.2 and §5.2, by addition)

| Id | Action | Path | Change | Basis |
|---|---|---|---|---|
| B-N2 (proposed) | NEW | `packages/control-plane/src/journal-append.ts` | `appendJournalRecord(client, boundary, record)`: (1) `boundary.require()`, refused → throw before any SQL of its own; (2) `redactValue(record)`; (3) build the closed-key `p_fields` object and, for a `journaled` row, the closed-key `p_envelope` object (§2.4a) from the redacted record, snake-cased by a fixed name map; (4) `EXECUTE public.command_journal_append(class, fields, envelope)` on the caller's `client`; (5) return the routine's `seq`, `recorded_at`, `envelope_digest`, `chain_hash`. Encodes nothing; imports nothing from `packages/journal` except types. **Dormant on merge: nothing calls it** | contract §3, §4.1, §6.1, §6.2 |
| B-N3 (proposed) | NEW | `packages/control-plane/src/redaction-boundary.ts` | as r3 §5: factory with injected custody, manifest names excluded from the heuristic scan, values trimmed, key-representation registration (§5), no switch | contract §6.1 |
| B-T4 (proposed) | NEW | `test/journal-redaction.storage.test.ts` | the §6 matrix, composed with a transaction owner of the store's exact shape and B-N2, fixture custody, CI Postgres | contract §6.1, §6.3, §4.1, §6.2 |

**Consequence for B-M1 (the migration text).** The two objects of §2.3,
their validation steps, the persisted column set (§2.4, §2.4a), and the
SQL encoding of spec (a), (c), and (d) are Tranche B implementation
content that this addendum proposes; r6 does not fix them and r1 leaves
them to B-M1. The pure encoder is one object beyond r6's stated set; it
is proposed here because it is the only way to prove the routine's bytes
against fixed-timestamp vectors without a clock seam. Whether the SQL
tranche adopts §2.3–§2.4 is for the governing Gate III instrument and the
implementer; **without an encoder in the routine, this addendum's caller
cannot exist**, and the caller is then withdrawn rather than re-shaped
around a divergent input.

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
fixture custody injected into B-N3; the CI Postgres of r1 B-M4; the two
objects of §2.3 applied by the tranche's migration into the test
database.

| Row | Seeded where | Value class | Expected |
|---|---|---|---|
| T4-1 | envelope `argv` entry | manifest value (`CONTROL_PLANE_TOKEN` fixture) | 0 occurrences in `row_bytes`, `command_envelope`, `envelope_argv`, and every column; token present; persisted `envelope_digest` = `sha256(persisted command_envelope)` |
| T4-2 | envelope `command_kind` / `scope_ref` | heuristic value | as T4-1 |
| T4-3 | decision record field (`authorization_ref`) | manifest value | as T4-1 over a `decision` row |
| T4-4 | `evidence_refs` entry | manifest value | as T4-1; persisted array order equals submitted order; same for `envelope_argv` |
| T4-5 | body: lifecycle insert, then B-N2 under a **refused** boundary | — | throw before any journal SQL; the **owner** rolls back; lifecycle row absent; zero journal rows; head unchanged; error text carries no seeded value |
| T4-6a/b/c | envelope `argv` entry | key hex / HEX / base64 | 0 occurrences; token present |
| T4-7 | envelope `argv` entry | `DATABASE_URL` fixture value | as T4-1 |
| T4-8 | refused boundary: `key_absent`, `key_unavailable`, registration failure, `registry_unloadable` | — | refusal before any journal SQL; names-only detail; owner rolls back |
| T4-9 | reconstruction from persisted columns | — | §2.5, first paragraph |
| T4-10 | golden-vector conformance | — | §2.5, second paragraph: envelope vectors and row vectors through the pure encoder; append routine's bytes equal the pure encoder over persisted columns |
| T4-11 | adversarial inputs, including malformed and noncanonical envelope inputs and the differential acceptance sweep | — | every row of §2.6: zero rows, head unchanged |
| T4-12 | routine shape and clock source | — | §2.7 |

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

Not the journal writer; B-N2 uses the boundary's redactor only.
`packages/redaction/src/**` and `packages/journal/src/**` are not
modified; B-N2 imports types only from `packages/journal`.

---

## 9. Drift and execution language (unchanged from r2/r3)

S2 is the contract-hash stop only. Code-merge and execution SHAs have
different roles and may identify the same commit. FD-B1 and FD-B3 are
governing instruments this surface cannot read; nothing here restates or
narrows them.

---

## 10. Decisions requiring new Founder authority

- **D-1.** Whether B-N2, B-N3, and the B-T4 matrix (§4, §6), on the
  interface of §2 (SQL as the sole encoder of spec (a), (c), and (d)
  from validated fields; one three-argument append routine with no clock
  or sequence seam; one pure encoder function; persisted columns exactly
  the hashed fields including the five envelope components), are
  accepted as a Tranche B scope amendment for the governing Gate III
  instrument to name. Accepting D-1 selects no base, provisions nothing,
  integrates nothing, and touches neither FD-2 nor any issued Gate III
  execution. If the SQL tranche's routine takes a different input shape,
  D-1 is declined and the caller is withdrawn.

Nothing else is asked.

---

## 11. Change table from Addendum 02 r4

| r4 statement | r5 disposition |
|---|---|
| `p_envelope bytea`: opaque spec (a) bytes encoded by TypeScript via `encodeEnvelope`, persisted verbatim | withdrawn: `p_envelope jsonb` carries the five normalized fields (§2.4a); the routine validates them and encodes spec (a) itself; `command_envelope` becomes a derived column; no bytes parameter of any kind remains (§2.2–§2.4) |
| T4-9 passes persisted envelope bytes "as the pre-encoded nested bytes the encoder accepts" | corrected as false: the encoder takes the normalized object and re-encodes; T4-9 rebuilds the object from the five persisted `envelope_*` columns and additionally checks `encodeEnvelope(rebuilt)` against the persisted bytes (§2.5) |
| No negative coverage for malformed or noncanonical envelope input | added: §2.6 rows for envelope shape, version, emptiness, `argv` typing, extra keys, lone-surrogate escapes and invalid UTF-8, plus the differential acceptance sweep against the TypeScript encoder; T4-11 |
| `p_recorded_at_override` behind a "test-only GUC" as an implementer option; T4-10 replays vectors through the append routine | withdrawn: a session setting is caller-writable and conflicted with the fixed signature; the append routine keeps exactly three arguments and reads `clock_timestamp()` with no override path (§2.7) |
| T4-10 needs a clock for fixed-timestamp vectors | resolved: the encoding logic is a pure `command_journal_encode_row(…, p_seq, p_recorded_at)` the append routine calls; vectors replay through the pure function; the append routine's persisted bytes are cross-checked against the pure function over persisted columns (§2.3, §2.5) |
| No assertion that production has no seam | added: T4-12 catalog assertions (one 3-argument routine, no overload, no `current_setting`/`set_config`, pure encoder immutable and table-free) and a clock bracket on the returned `recorded_at` (§2.7) |
| B-N2 calls `encodeEnvelope` | corrected: B-N2 encodes nothing and imports types only (§4, §8) |
| `p_envelope` "required for command rows that carry an envelope" | made exact: non-NULL iff `event_type = 'journaled'`, mirroring `EVENT_SHAPES`; NULL for decisions (§2.3 step 4) |

Retained from r4 unchanged: SQL as row encoder, one discriminated append
routine, closed-key validation, persisted `row_bytes`, reconstruction
from persisted columns, the adversarial matrix, and B-N2's dormant
status.

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

**Nothing was created or modified.** Addendum 02 r1, r2, r3, and r4 are
preserved unchanged as the review record.
