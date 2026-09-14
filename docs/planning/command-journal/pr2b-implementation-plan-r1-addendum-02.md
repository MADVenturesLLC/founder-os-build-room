# PR 2b — Implementation Plan r1, Addendum 02 (Tranche B: the runtime append caller and the redaction boundary at the journal write)

Status: **DRAFT — ADVISORY. FOUNDER_DECISION_REQUIRED (FD-3). NO
IMPLEMENTATION AUTHORITY IS CREATED, IMPLIED, OR CARRIED BY THIS ARTIFACT.**

This artifact creates no code, test, PostgreSQL role, credential, token,
permission, GitHub environment, GitHub secret, repository setting, Railway
service, Railway variable, Neon object, migration, branch, commit, or PR.

Work ID: `BR-PR2B-IMPL-PLAN-R1-A02`
Seat: drafted by `builder` at the Founder's request in session, 2026-09-14,
for Founder and `br-architect` review. The builder seat holds no plan
authority; this addendum becomes plan content only on Founder approval.
Amends: r1 §4.2 (Tranche B file map) and §5.2 (Tranche B tests) **by
addition only**. r1 and Addendum 01 are preserved byte-for-byte.
Next role: **Founder — Gate I (still unrecorded in-repo), FD-3 disposition,
then Gate III naming the amended Tranche B scope.**

---

## 0. Predecessor and controlling stack

Every hash below was recomputed in this session against `origin/main` at
`b25deb5`.

| Artifact | Path (repository-relative) | SHA-256 | Verified |
|---|---|---|---|
| Predecessor plan (r1), unmodified | `docs/planning/command-journal/pr2b-implementation-plan-r1.md` | `08f3ea7418db7052ffd7fb4cf6df4672f169c95933a7c07c71ef637ae775b3ce` | MATCHES Addendum 01 §0 |
| Addendum 01, unmodified | `docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-01.md` | `91c0133448dc632ee269313fc56092dad95b3fedc7d41d65baf29297dfd1dc87` | — |
| Controlling architecture (r6, frozen) | `docs/planning/command-journal/pr2b-storage-architecture-r6.md` | `658daa9c0194d5f56d7506fb8ade05d24d413cd08b106a067ff9100ce5815954` | MATCHES r1 §0 I-1 |
| Journal contract v0.17 (S2 subject) | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` | MATCHES r1 §0 I-3 — **S2 NOT TRIGGERED** |

New since r1 was authored (r1 predates all three; none is cited by r1):

| Artifact | Landed on `main` | Merge commit |
|---|---|---|
| `packages/redaction` (OMP Evolve Pack Lane B) | 2026-09-14 | `6ef7d120626163a48f0bc22ac3efbf4904256fb0` (PR #34) |
| Lane B wiring under the run-harness writers | 2026-09-14 | `61f4bc45c44c9b8c22cb1ccb5f0e9f495d267c38` (PR #38) |
| redaction v0.1 (plain-text stderr path) | 2026-09-14 | `b25deb53ec604e5248a66bbc731b0f9162e76e82` (PR #40) |

---

## 1. Why this addendum exists

r1 was authored before `packages/redaction` existed and mentions redaction
nowhere. Two ratified contract clauses bind the journal write path
directly (`docs/command-journal-contract.md` §6):

- **§6.1** — "Redaction runs before the journal write, never after." Where a
  raw command would expose secret material, the journal stores the safe
  normalized representation plus digest and evidence reference.
- **§6.3** — security-negative obligation: "seeded credential-shaped values
  in command envelopes must never reach a persisted row (stop-gate §7.3)."

Tranche B is where the append path is created. A Tranche B built to r1's
file map as written satisfies r1 and does not demonstrate §6.1 or §6.3.
Tranche F's qualification would then find the gap after the migration has
executed. This addendum moves the gap in front of Gate III.

---

## 2. Finding IF-4 — r1 names no row for the runtime append caller

r1 §5.2 tests B-A1 through B-A5 require "journal append and lifecycle
insert share **one connection, one transaction**" and that "a journal
failure cannot orphan a lifecycle insertion." Those tests exercise
application code that calls `public.command_journal_append(...)` from
inside the lifecycle transaction. **No row in r1 §4.2 creates that code.**
B-N1 is the administrative migration CLI; B-M1 is the migration text; the
remaining rows are tests and CI. Tranche D creates nothing (r1 §4.4:
"Database objects affected by D: none created").

Resolution: the runtime append caller is Tranche B content, because B's
own atomicity proofs require it. It is added below as **B-N2**. This is an
addition to r1's file map, not a reinterpretation of any existing row.

---

## 3. Tranche B file-map additions (r1 §4.2, by addition)

| Id | Action | Path | Change | Required by |
|---|---|---|---|---|
| B-N2 | NEW | `packages/control-plane/src/journal-append.ts` | The runtime append caller. Takes the open transaction and the normalized command envelope (or decision record); **first** passes the tree through the redaction boundary's `redactValue`; **then** canonicalizes with `packages/journal` (`encodeEnvelope`, `envelopeDigest`, `encodeCommandEventRow` / the decision-row encoder, `chainHash`); **then** `EXECUTE`s `public.command_journal_append(...)` on the same connection. Redaction precedes canonicalization so the chain hash covers redacted bytes and only redacted bytes. A refused boundary throws before any SQL; the caller's transaction rolls back (B-A3's shape) | contract §6.1, §6.2, §4.1; r6 §16.1–16.3; IF-4 |
| B-N3 | NEW | `packages/control-plane/src/redaction-boundary.ts` | The control-plane side of the secret boundary, the same shape as `packages/run-harness/src/redaction-boundary.ts`: registry from the control plane's environment with the manifest names excluded from the heuristic scan, values trimmed, manifest naming `CONTROL_PLANE_TOKEN` and `DATABASE_URL` (the two secrets the control plane is known to hold), key custody per **FD-3**. Imports nothing from `packages/gateway-daemon`. No switch turns the boundary off | contract §6.1; Lane B wiring handoff |
| B-T4 | NEW | `test/journal-redaction.storage.test.ts` | The §6.3 negative obligation and the §6.1 ordering: (i) an envelope seeded with a credential-shaped value that matches the registry is appended through B-N2 under fixture custody; the persisted row, its `envelope_digest`, and its `chain_hash` are computed over the redacted bytes; a `SELECT` of the row contains the seeded value 0 times; (ii) the same append under a refused boundary throws `RedactionRefusedError` before any SQL, the lifecycle insert in the same transaction is rolled back, and the chain head is unchanged; (iii) `verify()` recomputes the chain from genesis over the persisted redacted rows and passes | contract §6.1, §6.3, §4.1; r6 §16.2 |

Consequential edits to existing rows, stated so Gate III can name them:

- **B-T2** (`journal-append-atomicity.storage.test.ts`) exercises B-N2, not a
  test-local caller. B-A3's "journal failure" cases include a redaction
  refusal.
- **B-M3** (`tsconfig.json`): still expected to need no change.
  `packages/control-plane/src/**` and `packages/redaction/src/**` are both
  already in the root include at `main`; B-N2 and B-N3 are new files in an
  included directory. `PLAN-OPEN — VERIFY BEFORE AUTHORIZATION` stands.
- **FORBIDDEN in B** is unchanged: `packages/control-plane/src/main.ts`,
  `railway.toml`, executing SQL against Neon, creating a GitHub environment
  or secret. B-N3 is constructed by B-N2's caller at request time, not at
  boot, so `main.ts` stays untouched in B. Where the boundary is opened at
  boot instead is a Tranche D question and is not decided here.

---

## 4. `JournalAppendSink` is not the writer here, and why

`packages/redaction` ships a `JournalAppendSink` that serializes a record
with `JSON.stringify` and hands one line to an inner writer. **B-N2 does not
use it.** The journal's row bytes are canonical, spec-versioned, and
chain-hashed (contract §6.2, `packages/journal`). If the sink's own
serialization were persisted, the bytes on disk would not be the bytes the
chain hash covers, and `verify()` would fail on every row.

The correct composition is the one the Lane B wiring act already used for
Phase 3 evidence: `redactor.redactValue(tree)` first, then the canonical
serializer, then the write. B-N2 goes through `RedactionBoundary.require()`
and the redactor directly; the boundary's refusal semantics are unchanged.
`packages/redaction/src/**` is not modified by Tranche B unless FD-3 option
(a) is taken, and in that case the change is a separate, named package
revision (v0.2), not Tranche B content. The digest pins in
`test/run-harness-redaction-wiring.test.ts` are re-pinned only by that
revision.

---

## 5. FD-3 — FOUNDER DECISION REQUIRED: the key source where the control plane runs

The control plane runs on Railway (linux). `packages/redaction` v0.1 has one
key source, macOS Keychain, and refuses on every other platform. The Lane B
wiring disposition (2026-09-14) expressly deferred "a non-Keychain key
source for the ubuntu CI and Railway runtimes" to a separate Founder
commission. Tranche B is that moment: **without a key source on Railway,
B-N2 refuses every journal append, and Phase 4 cannot journal.**

| Option | What it is | Consequence | Custody effect |
|---|---|---|---|
| **(a) Sealed Railway variable, read by a new custody class** | A `REDACTION_HMAC_KEY` (64 hex, 32 bytes) stored as a Railway **sealed** variable on the application service (r6 §5.1 rule 2 treats sealed variables as the runtime's custody store); `packages/redaction` v0.2 adds `EnvHmacKeyCustody` (fail-closed: absent, non-hex, or short → `key_unavailable`); B-N3 selects it when the variable is present and Keychain otherwise. CI tests use fixture custody and need no variable | Journal redaction works on Railway; one new package revision before or alongside Gate III | Creates a new custody entry in the runtime's sealed store. **Falls under FD-2's determination** (whether recording a custody domain needs a DEC or a comment) |
| (b) Normalization only in B; HMAC boundary deferred | B-N2 relies on `packages/journal`'s envelope normalizer to omit secret material and on B-T4(i) to prove §6.3; the boundary is wired in a later act | §6.1's "redaction runs before the write" would be met only if the normalizer stripped secret material. **It does not**: `packages/journal/src/envelope.ts` carries no redaction logic, and its own header states the envelope is "the post-redaction safe representation" and that "redaction enforcement belongs to the write path (2b and later)". The normalizer assumes redaction already happened; it is not the place it happens. This option therefore rests on B-T4(i) alone and leaves no keyed boundary at the writer | none now; the custody question returns at the deferred act |
| (c) Refuse on Railway (v1 posture, unchanged) | No key on Railway; B-N2 refuses | **Not viable**: the journal never writes in production | none |

**Recommendation: (a).** It is the only option that puts a keyed,
fail-closed boundary at the writer the contract names, and it does so with
one custody entry the plan already knows how to classify. Sequence: rule
FD-3(a) and FD-2 together (the same custody-domain question, asked once),
commission redaction v0.2 (`EnvHmacKeyCustody`, one test, re-pin) as its
own act, then Gate III names Tranche B against a base that carries v0.2.
The Railway variable itself is a Founder custody act at Tranche D time,
alongside `DATABASE_URL`; B never holds or moves it (r1 §4.2 "External
secret/custody effect: none" continues to hold for B).

Two notes on (a):

- The Railway key and the darwin Keychain key are different keys for
  different writers. Journal rows and harness evidence are never compared
  byte-for-byte across the two, so the rotation ruling (a) of the Lane B
  wiring act applies to each independently.
- A key present in the environment is itself a secret. B-N3's manifest
  excludes the key variable's name from redaction registration (a key is
  not a value that appears in output), and B-T4 asserts the key bytes never
  appear in a persisted row.

---

## 6. Gate III — what the amended scope must name

Gate III (r1 §9) names the migration-authorized Git SHA and the tranche id.
With this addendum, the Gate III act should also name:

1. The Tranche B file map **as amended**: r1 §4.2 rows plus B-N2, B-N3, B-T4,
   and the B-T2 consequential edit.
2. FD-3's disposition, and FD-2's if ruled together.
3. The implementation base for Tranche B. Addendum 01 selected `6d6110d…`
   for the plan; every r6 surface is byte-identical at any later `main`
   commit unless S2 fires. **Constraint:** B-N3 imports `packages/redaction`,
   which exists only at `main` ≥ `6ef7d12`, and under FD-3(a) only at a
   base carrying v0.2. The base is the Founder's to name; this addendum
   records the constraint, not a selection.
4. The two-SHA distinction r1 §9.1 already requires: the SHA at which B's
   code merges, and the `founder_authorized_sha` the migration run asserts.

Gate III's preconditions are unchanged: Gate II merged (PR #27,
`f21693e`), and Gate IV complete before B **executes**. B's code may merge
before Gate IV.

---

## 7. What this addendum does not do

- It does not approve the plan (Gate I remains the Founder's, and as of this
  draft no Gate I record exists in either repository; see the gate-status
  report of 2026-09-14).
- It does not select a base, rule FD-2 or FD-3, or authorize any tranche.
- It does not change r1's database object set (§4.2.1), denial matrix
  (§5.2), migration order (§6), or rollback boundaries (§8).
- It does not modify `packages/redaction`; a v0.2 revision, if FD-3(a) is
  taken, is a separate named act.

---

## 8. Attribution

Drafted by the `builder` seat (Actor-Id
`session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`, Execution-Surface
`claude-code`) at the Founder's request. No commit was produced by this
draft. If this file is later committed, the committing act carries its own
trailers per `DEC-20260718-05` and its own authorization. The `br-architect`
seat has not reviewed this draft; Founder approval may route it there first.

---

## 9. Status

`DRAFT — FOUNDER_DECISION_REQUIRED (FD-3)`

Open before Gate III: Gate I on the record; FD-3 ruled (FD-2 with it if the
Founder so chooses); if FD-3(a), redaction v0.2 commissioned and merged;
then Gate III naming the amended Tranche B scope and its base.

**Nothing was created or modified.** No code, test, PostgreSQL role,
credential, GitHub environment, GitHub secret, Railway configuration, Neon
object, migration, branch, commit, or PR was created or modified in the
production of this artifact.
