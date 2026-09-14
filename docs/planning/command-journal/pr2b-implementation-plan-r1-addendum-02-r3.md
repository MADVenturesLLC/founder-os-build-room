# PR 2b — Implementation Plan r1, Addendum 02 r3 (Tranche B: a dormant redacting append caller, exact byte framing against SQL-owned `seq`, custody separated from execution)

Status: **ADVISORY SUCCESSOR to Addendum 02 r2. PROPOSED SCOPE ADDITIONS
FOR `br-architect` REVIEW. NO IMPLEMENTATION AUTHORITY IS CREATED,
IMPLIED, OR CARRIED BY THIS ARTIFACT. NOTHING HERE PAUSES, CONDITIONS, OR
AMENDS AN INDEPENDENTLY ISSUED GATE III EXECUTION.**

This artifact creates no code, test, PostgreSQL role, credential, token,
permission, GitHub environment, GitHub secret, repository setting, Railway
service, Railway variable, Neon object, migration, branch, commit, or PR.

Work ID: `BR-PR2B-IMPL-PLAN-R1-A02-R3`
Seat: drafted by `builder` at the Founder's request, 2026-09-14, revising
Addendum 02 r2 against the second `REQUEST-CHANGES` review addressed to
`br-architect`. The builder seat holds no plan authority.
Amends (proposed): r1 §4.2 and §5.2 **by addition only**. r1, Addendum 01,
Addendum 02 r1, and Addendum 02 r2 are preserved byte-for-byte; r2 is
superseded as a draft by this r3 and retained as the review record.
Next role: **`br-architect` review; custody seat for §1's access request;
Founder only for §10.**

---

## 0. Controlling stack and access limitation

Recomputed in this session against Build Room `origin/main` at `b25deb5`.

| Artifact | Path | SHA-256 |
|---|---|---|
| Plan r1, unmodified | `docs/planning/command-journal/pr2b-implementation-plan-r1.md` | `08f3ea7418db7052ffd7fb4cf6df4672f169c95933a7c07c71ef637ae775b3ce` |
| Addendum 01, unmodified | `docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-01.md` | `91c0133448dc632ee269313fc56092dad95b3fedc7d41d65baf29297dfd1dc87` |
| Addendum 02 r1, unmodified (uncommitted draft) | `docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-02.md` | `689ed7aad0f441470a2acd0f96ea71cb7fc519cc3d92be39a566ecaf1c8cb355` |
| Addendum 02 r2, unmodified (uncommitted draft) | `docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-02-r2.md` | `522fb0d392e2ad9da1380b3ea0b989fc2c05fdfa286cbb3e37787d4ac0b4d626` |
| Architecture r6, frozen | `docs/planning/command-journal/pr2b-storage-architecture-r6.md` | `658daa9c0194d5f56d7506fb8ade05d24d413cd08b106a067ff9100ce5815954` |
| Journal contract v0.17 | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` |
| Canonical encoders (spec (a), (c), (d), chain framing) | `packages/journal/src/{bytes,envelope,event-row,decision-row,chain}.ts` at `b25deb5` | read directly; §2 quotes them |

**Instruments named by the review, with the custody locations supplied:**

| Instrument | Supplied path | Supplied SHA-256 | This surface |
|---|---|---|---|
| Reviewed Gate III r3 (draft act) | `/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/DRAFT-founder-authorization-pr2b-gate3-trancheB-journal-authority-r3-20260913.md` | `d024e508d77169c5d85d323fb28f32c6ea5c2b709d2e12cc3470f0bde37f5945` | **inaccessible**: the path is on the Founder's macOS host; this session runs in a remote container with no mount of it. Searched all four scoped repositories for the file name and hash: absent |
| Controlling Founder ruling | `/Users/michaeldaley/MADVenturesOPs/hermes-profile-suite/FOUNDER-RULING-pr2b-gate3-trancheB-complete-replacement-source-20260913.txt` | `2431c6338d45d2eea074d2fe0ac797f70f0a555e78d80b005a2ee2924a9dcd6d` | **inaccessible**, same reason; absent from the repositories |
| Any effective Gate III issuance | not named | — | none found in either repository, in PR comments, or in `main` history. **A reviewed draft act is not issuance.** No inference is drawn either way |

**Access request to the custody seat (`hermes-profile-suite`):** supply the
two files above, verified against the supplied hashes, plus any issuance
receipt for Gate III and the Gate I approval instrument, into this session
or into a repository path this session can read. Until then §1 states what
the repositories show and stops.

---

## 1. Authority stack, reconciled to what is readable here

| Instrument | Transcribed in a repository | Status as readable from this surface |
|---|---|---|
| FD-1 | yes (Addendum 01 §1) | closed; base `6d6110d…` |
| Gate I | no | not determined; the draft act named above is the likely carrier and is unreadable here |
| Gate II (Tranche A) | PR #27 merged `f21693e` under comment 5654523254, with its historical authority disclosure and F1/F2 correction record | effective per that record |
| FD-2 | Addendum 01 §9: open, required before Gate IV | open |
| Gate III r3 (reviewed draft), controlling ruling, FD-B1–B4 | no | content unreadable here; their existence is recorded from the review's citation and the supplied hashes, nothing more |
| Gate III effective issuance | no | not located; not inferred |

**Operating consequence.** The SQL tranche (r1 §4.2 rows B-M1, B-N1,
B-M2, B-M3, B-T1, B-T2, B-T3, B-M4) proceeds under whatever issuance
actually governs it. This addendum adds nothing to its prerequisites,
asserts nothing about its base, and is not a condition on it. The additions
below are a separate proposed amendment that can be reviewed while that
tranche moves.

---

## 2. Interface resolution: canonical bytes versus SQL-owned `seq` and head

### 2.1 The dependency, stated from the encoders

Contract §4.1 gives SQL, inside `command_journal_append(...)`, the head
lock, the tail verification, `seq = head + 1`, the chain hash, the insert,
and the head advance. Contract §6.2(c) requires the chain hash to cover the
complete row's canonical bytes. Those bytes, per `packages/journal`, are:

```
encodeCommandEventRow(row) =
  lpString('BRJ:c:1')                       -- spec id
  || stringField(0x01, 'command')           -- record class
  || stringField(0x02, row.seq)             -- seq: canonical ASCII decimal
  || stringField(0x03, row.eventType)
  || stringField(0x04, row.commandId)
  || … 22 further tagged fields …
  || stringField(0x1a, row.recordedAt)
```

and `encodeDecisionRecordRow(row)` has the same head with
`lpString('BRJ:d:1')`, `stringField(0x01, 'decision')`,
`stringField(0x02, row.seq)`, then its own fields. `seq` is a required
field of both row types and is the **third tagged field** of the canonical
bytes. Therefore the complete canonical row cannot be produced in
TypeScript before SQL assigns `seq`, and TypeScript must not predict `seq`
or the head.

### 2.2 The exact framing that resolves it: SQL splices the one field it owns

Every field is independently encoded and concatenated (`concatBytes`).
`stringField(tag, value)` is exactly:

```
tag (1 byte) || 0x01 (PRESENT) || u32be(byteLength(utf8(value))) || utf8(value)
```

So the canonical bytes of any row split into three contiguous parts:

```
ROW_BYTES = PREFIX || SEQ_FIELD(seq) || SUFFIX

PREFIX          = lpString(spec_id) || stringField(0x01, record_class)
                  -- constant per record class; TypeScript-encoded
SEQ_FIELD(seq)  = 0x02 || 0x01 || u32be(len(seq_ascii)) || seq_ascii
                  -- the only part that depends on SQL state
SUFFIX          = every field from tag 0x03 onward, in spec order
                  -- TypeScript-encoded from the redacted record
```

**Ownership, resolved:**

| Part | Produced by | From |
|---|---|---|
| `PREFIX` | TypeScript (B-N2) | the record class |
| `SEQ_FIELD(seq)` | **SQL, inside the routine**, after the head lock and tail verification, from `seq := head.seq + 1` | SQL state only |
| `SUFFIX` | TypeScript (B-N2) | the **redacted** record, via the spec encoders |
| `ROW_BYTES` | SQL: `PREFIX || SEQ_FIELD || SUFFIX` | — |
| `chain_hash` | SQL: `encode(pg_catalog.sha256(convert_to(prior_chain_hash, 'UTF8') || ROW_BYTES), 'hex')` | contract §4.1 framing; r6 §16.5 builtin binding |
| `envelope_digest` | TypeScript (`envelopeDigest` over the redacted envelope), carried inside `SUFFIX` at tag 0x0d | contract §6.2(a) |

The SQL side of `SEQ_FIELD` is four operations on a `bytea`: two literal
bytes, a big-endian 4-byte length (`int4send(octet_length(seq_text))`
yields exactly `u32be`), and the ASCII decimal (`convert_to(seq_text,
'UTF8')`). No encoder logic beyond that one field moves into SQL.

**Proposed routine surface (Tranche B design input, not a settled
interface):** `command_journal_append(p_record_class text, p_prefix bytea,
p_suffix bytea, p_command_id text, p_event_type text, …)` returning the
assigned `seq` and `chain_hash`. The scalar arguments exist only so the
schema's uniqueness constraints (`(command_id, event_type)` for the
at-most-once event types, contract §4.1) can be enforced on columns; they
never feed the hash. r6 §3.3/§4.3 name the routine as
`command_journal_append(...)` without fixing its arguments, so this is a
proposal to the Tranche B implementer, not an architecture change.

**What TypeScript learns and when.** The routine's return carries the
assigned `seq` and `chain_hash` **after** assignment. B-N2 may use them for
its own assertions and for the caller's response; it never computes or
predicts either.

### 2.3 Proof obligation that the splice equals the spec encoder

Because SQL assembles `ROW_BYTES` from parts and TypeScript owns the spec
encoders, equality must be proven, not assumed. T4-9 (§6) re-encodes the
full row in TypeScript with the returned `seq` and asserts, per row:
`encodeCommandEventRow(rowWithSeq)` equals the persisted or recomputed
`ROW_BYTES`, and `chainHash(prior, thoseBytes)` equals the persisted
`chain_hash`. If the events table does not persist `ROW_BYTES`, the test
recomputes them from the persisted columns through the same encoder; the
equality obligation is identical. The reference framing `chainHash` in
`packages/journal/src/chain.ts` is used as a **test-scoped** oracle only;
no runtime `verify()` or recovery consumer is added (r2 §5 preserved).

---

## 3. Transaction and error ownership

**Transaction owner.** In the control plane today the owner is the store's
transaction wrapper: `PostgresLedgerStore.append` (`store.ts`: `BEGIN`,
body, `COMMIT`; on throw `ROLLBACK`, rethrow, release) and the identical
private `transaction()` helper in `phase3-run.ts`. B-N2 is a **body-level
function** that receives that owner's `PoolClient`. It does not begin,
commit, or roll back anything, and it does not catch the owner's errors.

**Guarantees, bound to the component that gives them:**

| Guarantee | Given by | Statement |
|---|---|---|
| Refusal **before any journal SQL** | B-N2 | when the boundary is refused, B-N2 throws before issuing any statement of its own. It makes no claim about SQL the body issued earlier |
| Rollback of the whole transaction on refusal or on routine failure | the transaction owner | B-N2 rethrows; the owner's `catch` issues `ROLLBACK`. A lifecycle insert issued earlier in the same body is rolled back by the owner, not by B-N2 |
| Names-only content of B-N2's own errors | `packages/redaction` | `RedactionRefusedError.detail` carries variable names and codes; the package's refusal paths never carry values (`key-custody.ts`, `sinks.ts` at `main`) |
| Content of Postgres errors from the routine | not B-N2 | such errors propagate unchanged. Because the record was redacted before any bytes reached SQL, a value the registry knows cannot appear in them unless it was outside the redacted tree. B-N2 claims nothing about other errors in the body |
| HTTP surface | `server.ts` unhandled-error handler | logs the message with an incident id and returns `internal_error` with the id; the message is never returned. Pre-existing; unchanged by this proposal; B-N2 adds no sanitization at this layer and claims none |

**What B-N2 is not.** It is not a lifecycle coordinator. It does not order
the lifecycle insert relative to the append, does not decide what else the
body does, and does not wrap or translate the owner's errors. r2's T4-5,
which expected B-N2 to sanitize a lifecycle operation's error, is
withdrawn.

---

## 4. Proposed additions (r1 §4.2 and §5.2, by addition)

| Id | Action | Path | Change | Basis |
|---|---|---|---|---|
| B-N2 (proposed) | NEW | `packages/control-plane/src/journal-append.ts` | Body-level function `appendJournalRecord(client, boundary, record)`: (1) `boundary.require()`; refused → throw before any SQL of its own; (2) `redactValue(record)`; (3) encode `PREFIX` and `SUFFIX` with the spec encoders over the redacted record, computing `envelopeDigest` over the redacted envelope; (4) `EXECUTE` the routine with `PREFIX`, `SUFFIX`, and the constraint scalars on the caller's `client`; (5) return the routine's assigned `seq` and `chain_hash`. Never assigns `seq`, reads the head, or computes `chain_hash`. **Dormant on merge: no route or store calls it** | contract §3, §4.1, §6.1, §6.2 |
| B-N3 (proposed) | NEW | `packages/control-plane/src/redaction-boundary.ts` | Factory `openControlPlaneRedactionBoundary(environment, { keyCustody })`: registry from the environment with manifest names (`CONTROL_PLANE_TOKEN`, `DATABASE_URL`) excluded from the heuristic scan and registered once, values trimmed; key custody **injected**; key-representation registration per §5; opens the package boundary. Imports nothing from `packages/gateway-daemon`. No switch turns it off | contract §6.1 |
| B-T4 (proposed) | NEW | `test/journal-redaction.storage.test.ts` | the §6 matrix, composed with a transaction owner of the store's exact shape and B-N2, under fixture custody, against the CI Postgres | contract §6.1, §6.3, §4.1 |

Unchanged: every existing r1 Tranche B row, its FORBIDDEN list, and its
external-effect statements. B-M3 (`tsconfig.json`) is still expected to
need no change; both directories are already in the root include.

---

## 5. Key registration and protection, bounded to the mechanism

### 5.1 How both custody kinds obtain the protected representation

The package's `RedactionBoundary.open` loads the key from custody and
builds the redactor from the registry as it stands at that moment; the
package is byte-pinned and not changed here. B-N3 therefore performs the
key load itself, once, before opening:

1. `loaded = await keyCustody.load()` (fixture or production custody,
   injected).
2. If `loaded.kind !== 'loaded'`: open the boundary with that custody as
   is; it refuses (`key_absent` / `key_unavailable`). No registration
   happens; nothing is protected because nothing is written.
3. If loaded: register three representations of `loaded.key` under
   reserved names, source `generated`: lowercase hex, uppercase hex, and
   standard base64. Each is at least 44 characters, above the registry's
   8-character floor. A registration failure of any kind (duplicate name,
   registry error) is a refusal: B-N3 opens the boundary with
   `UnavailableHmacKeyCustody` so it refuses with a names-only detail.
4. Open the boundary with `new InMemoryHmacKeyCustody(loaded.key)`. The
   custody kind that was injected (fixture, Keychain, or a future
   environment-variable class) determined the key; the in-memory wrapper
   only carries the already-loaded bytes into the package's open sequence.

Fixture and production custody therefore reach the same protected state
by the same path; no environment variable is required for the fixture
case, and the production key variable (when one exists) is **not** listed
in the manifest, so its raw value is never registered twice.

### 5.2 What is covered, and what is not

| Representation of the key | Covered by registration | Proven by |
|---|---|---|
| lowercase hex (64 chars) | yes | T4-6a |
| uppercase hex | yes | T4-6b |
| standard base64 (44 chars) | yes | T4-6c |
| raw bytes in a binary column; base64url; hex with separators; URL-encoded; any partial substring shorter than the full value | **not covered** | — |

The redactor matches exact substrings of registered values
(`redactor.ts`: longest-first `split`/`join`); anything not an exact
substring of a registered representation is outside the mechanism. This
addendum claims protection only for the three registered representations
in text fields of the redacted tree.

### 5.3 The replacement token, stated without a cryptographic claim

The package replaces a registered value with
`[REDACTED:<name>:<hmac16>]`, where `hmac16` is the first 16 hex
characters of HMAC-SHA256 keyed with the redaction key over the value's
UTF-8 bytes (`redactor.ts` at `main`). For the key's own representations
the keyed input is the key's encoding. This addendum states only what the
tests establish: the registered representations do not appear in persisted
bytes, and the token has the package's standard shape. It makes no
statement about what the token does or does not disclose.

### 5.4 Error paths

B-N3 refusals and B-N2 throws carry names and codes (§3). The package's
custody classes never render key bytes in a detail string. Postgres errors
after a redacted append cannot carry a registered value that was inside the
redacted tree. No claim is made about log lines written by components
outside B-N2 and B-N3.

---

## 6. B-T4 as a matrix, bound to real composition

Composition for every row: a transaction owner with the store's exact
shape (`BEGIN` / body / `COMMIT`, `catch` → `ROLLBACK`, rethrow), whose
body performs a lifecycle-shaped insert into a test table and then calls
B-N2; fixture custody injected into B-N3; the CI Postgres of r1 B-M4.

| Row | Seeded where | Value class | Expected |
|---|---|---|---|
| T4-1 | envelope free-text field | manifest value (`CONTROL_PLANE_TOKEN` fixture) | 0 occurrences in the persisted row; token present; `envelope_digest` equals the digest of the redacted envelope's canonical bytes |
| T4-2 | envelope nested field | heuristic value (a `*_TOKEN` fixture variable) | as T4-1 |
| T4-3 | decision-class record field | manifest value | as T4-1 over the decision encoder |
| T4-4 | `evidence_refs` entry | manifest value | as T4-1; recorded order preserved (§6.2(c)) |
| T4-5 | body: lifecycle insert succeeds, then B-N2 is called under a **refused** boundary | — | B-N2 throws before any journal SQL; the **owner** rolls back; the lifecycle row is absent after the transaction; zero journal rows; head unchanged; the thrown error's text contains no seeded value |
| T4-6a/b/c | envelope free-text field | the key's lowercase hex / uppercase hex / base64 | 0 occurrences of that representation; a token present |
| T4-7 | envelope free-text field | `DATABASE_URL` fixture value | as T4-1 |
| T4-8 | refused boundary: `key_absent`, `key_unavailable`, registration failure, `registry_unloadable` (each) | — | refusal before any journal SQL; names-only detail; the owner rolls back |
| T4-9 | equality and chain oracle | — | per row: `encodeCommandEventRow(row with the returned seq)` equals the persisted or recomputed `ROW_BYTES`; `chainHash(prior, bytes)` folded from genesis equals every persisted `chain_hash` and the head. Test-scoped oracle; no runtime consumer |

No test count is prescribed; rows may be combined or split as the
implementer finds clearest, provided each expectation above is asserted
against the real composition.

---

## 7. Custody, execution, and enforcement — kept apart

| Concern | Content | Tranche / act | Authority needed now |
|---|---|---|---|
| Fixture custody | in the package already; injected by tests | Tranche B (with D-1) | none beyond D-1 |
| Dormant caller qualification | B-N2, B-N3, B-T4 under fixture custody | Tranche B (with D-1) | D-1 |
| Linux custody implementation | a custody class reading a named environment variable; qualification standard: absent → `key_absent`; non-hex, odd length, or under 32 decoded bytes → `key_unavailable` with names-only detail; explicit backend selection; no inner call on any refusal; key encodings absent from errors and rows by the T4-6 method | separate redaction v0.2 act | none now |
| Dispatch integration (a route or store calling B-N2 inside its lifecycle transaction) | **not proposed here.** Any placement, in Tranche D or elsewhere, amends that tranche's authorized file map and scope and is a separate proposed amendment with its own review | separate amendment | none now |
| Production key provisioning | a sealed Railway variable; Founder custody act; recording per FD-2's determination | Tranche D or later | none now |

**Dormant status, stated plainly.** Merging B-N2 connects nothing.
Production dispatch neither gains nor loses fail-closed behaviour from it;
no claim that dispatch "fails closed through the boundary" is made or
implied until dispatch integration and provisioning have both been
authorized and landed. r2's statement that moving this work to Tranche D
changes "only the tranche id" is withdrawn.

---

## 8. `JournalAppendSink` (unchanged from r2, restated briefly)

The package's `JournalAppendSink` emits `JSON.stringify(redactValue(record))`
as one line; that is not the §6.2(c) encoding. B-N2 uses the boundary's
redactor and the spec encoders directly. `packages/redaction/src/**` is not
modified.

---

## 9. Drift and execution language (unchanged from r2)

S2 is the contract-hash stop only. Code-merge and execution SHAs have
different roles and may identify the same commit. FD-B1's fixture
exception and FD-B3's drift assessment are governing instruments this
surface cannot read; nothing here restates or narrows them.

---

## 10. Decisions requiring new Founder authority

- **D-1.** Whether B-N2, B-N3, and the B-T4 matrix (§4, §6) are accepted
  as a Tranche B scope amendment for the governing Gate III instrument to
  name, on the ownership resolution of §2 and the dormant status of §7.
  Accepting D-1 selects no base, provisions nothing, integrates nothing,
  and touches neither FD-2 nor any Gate III execution already issued.

Nothing else is asked. The Linux custody design, dispatch integration, and
provisioning each arrive as their own proposals when raised; FD-2 keeps its
r1 §12 scope, "RECORDING THE NEW ADMINISTRATIVE CUSTODY DOMAIN", and is
not conflated with any of them.

---

## 11. Change table from Addendum 02 r2

| r2 statement | r3 disposition |
|---|---|
| Ownership table: TypeScript supplies the complete canonical row; SQL assigns `seq` | resolved in §2: `seq` is the third tagged field of both row specs; the row splits into `PREFIX || SEQ_FIELD(seq) || SUFFIX`; SQL splices `SEQ_FIELD` (`0x02 0x01 u32be(len) ascii`) after assignment; TypeScript never predicts `seq` or the head; T4-9 proves splice equals encoder |
| "A refused boundary throws before any SQL; the surrounding transaction rolls back" | narrowed in §3: before any **journal** SQL; rollback is the transaction owner's (`PostgresLedgerStore.append` shape), B-N2 rethrows only |
| T4-5 expected B-N2 to sanitize a lifecycle error | withdrawn; §6 T4-5 exercises the real owner + B-N2 composition and asserts only what each gives |
| Key variable "registered as a protected value through the manifest"; token "discloses nothing" | replaced by §5: the factory loads the key once and registers three representations regardless of custody kind; coverage table names what is and is not covered; the token described by its construction with no disclosure claim |
| "Moving to Tranche D changes only the tranche id"; production "fails closed" once B-N2 merges | withdrawn; §7: dispatch integration is a separate amendment to the placing tranche's file map; B-N2 is dormant; no enforcement claim |
| Gate III r3, FD-B1–B4 "not transcribed" | §0/§1: custody paths and hashes recorded as supplied; files inaccessible from this surface; access request to the custody seat; no inference; no pause on any issued execution |
| D-2 (placement) and D-3 (custody design) as current decisions | removed; only D-1 remains |

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

**Nothing was created or modified.** Addendum 02 r1 and r2 are preserved
unchanged as the review record.
