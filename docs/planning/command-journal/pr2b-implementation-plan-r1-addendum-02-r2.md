# PR 2b — Implementation Plan r1, Addendum 02 r2 (Tranche B: redaction at the journal write, proposed scope additions, key custody separated from Gate III)

Status: **ADVISORY SUCCESSOR to Addendum 02 r1. PROPOSED SCOPE ADDITIONS
FOR FOUNDER AND `br-architect` REVIEW. NO IMPLEMENTATION AUTHORITY IS
CREATED, IMPLIED, OR CARRIED BY THIS ARTIFACT.**

This artifact creates no code, test, PostgreSQL role, credential, token,
permission, GitHub environment, GitHub secret, repository setting, Railway
service, Railway variable, Neon object, migration, branch, commit, or PR.

Work ID: `BR-PR2B-IMPL-PLAN-R1-A02-R2`
Seat: drafted by `builder` at the Founder's request, 2026-09-14, revising
Addendum 02 r1 against a `REQUEST-CHANGES` review addressed to
`br-architect`. The builder seat holds no plan authority; nothing here is
plan content until approved.
Amends (proposed): r1 §4.2 (Tranche B file map) and §5.2 (Tranche B tests)
**by addition only**. r1, Addendum 01, and Addendum 02 r1 are preserved
byte-for-byte; r1 is superseded as a draft by this r2 and retained as the
review record.
Next role: **`br-architect` review; Founder disposition of the decisions in
§10 only.**

---

## 0. Predecessor and controlling stack

Every hash below was recomputed in this session against `origin/main` at
`b25deb5`.

| Artifact | Path (repository-relative) | SHA-256 | Note |
|---|---|---|---|
| Plan r1, unmodified | `docs/planning/command-journal/pr2b-implementation-plan-r1.md` | `08f3ea7418db7052ffd7fb4cf6df4672f169c95933a7c07c71ef637ae775b3ce` | matches Addendum 01 §0 |
| Addendum 01, unmodified | `docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-01.md` | `91c0133448dc632ee269313fc56092dad95b3fedc7d41d65baf29297dfd1dc87` | FD-1 closed; base `6d6110d…` |
| Addendum 02 r1 (superseded draft, unmodified) | `docs/planning/command-journal/pr2b-implementation-plan-r1-addendum-02.md` | `689ed7aad0f441470a2acd0f96ea71cb7fc519cc3d92be39a566ecaf1c8cb355` | uncommitted draft; the review record |
| Controlling architecture (r6, frozen) | `docs/planning/command-journal/pr2b-storage-architecture-r6.md` | `658daa9c0194d5f56d7506fb8ade05d24d413cd08b106a067ff9100ce5815954` | matches r1 §0 I-1 |
| Journal contract v0.17 | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` | matches r1 §0 I-3; r6 S2 (a change to **this** hash) has not fired |

Instruments the review cites that are **not transcribed in either
repository** as of this draft (`FounderOS` `main` at `b43c96c`, Build Room
`main` at `b25deb5`; searched by identifier): the reviewed **Gate III r3**,
**FD-B1 through FD-B4**, and **any issued Gate III act**. The 2026-09-11
Tranche A act, its receipt, and the F1/F2 correction authorization are named
in PR #27's body and merge commit `f21693e` as off-repository files under
`hermes-profile-suite`. This addendum does not infer the content of any of
these instruments and does not infer their absence. Where a section below
depends on one, it says so and stops.

Landed on `main` after r1 was authored, and cited by r1 nowhere:

| Artifact | Merge commit |
|---|---|
| `packages/redaction` (Lane B) | `6ef7d120626163a48f0bc22ac3efbf4904256fb0` (PR #34) |
| Lane B wiring under the run-harness writers | `61f4bc45c44c9b8c22cb1ccb5f0e9f495d267c38` (PR #38) |
| redaction v0.1 | `b25deb53ec604e5248a66bbc731b0f9162e76e82` (PR #40) |

---

## 1. Authority stack — transcription versus effective authority

Addendum 02 r1 wrote "Gate I remains unrecorded" and listed Gate I as a
prerequisite. That conflated two different facts. Restated:

| Instrument | In-repository transcription | Effective authority |
|---|---|---|
| FD-1 | transcribed (Addendum 01 §1) | closed |
| Gate I (plan approval naming the plan artifact SHA-256) | **not transcribed** in either repository | **not determined here.** May rest in the off-repository draft act and receipt named by PR #27. Reconciliation requires those instruments; see §10 item R-1 |
| Gate II (Tranche A) | executed: PR #27 merged at `f21693e` under comment 5654523254; the PR body carries a historical authority disclosure and names an F1/F2 correction authorization | effective per that record, subject to the disclosure it carries |
| FD-2 | open (Addendum 01 §9); required before Gate IV | open |
| Gate III r3 (reviewed), FD-B1–B4, any issued Gate III act | **not transcribed** | **not determined here**; see §10 item R-1 |

Consequence for this addendum: it proposes scope additions to Tranche B for
whichever Gate III instrument governs. It does not state prerequisites for
Gate III beyond r1 §9's own, and it does not describe Gate I as missing.

---

## 2. Why an amendment is warranted (contract basis, not plan gap)

Two ratified contract clauses bind the journal write path
(`docs/command-journal-contract.md` §6):

- **§6.1** — "Redaction runs before the journal write, never after."
- **§6.3** — "seeded credential-shaped values in command envelopes must
  never reach a persisted row (stop-gate §7.3)."

r1 predates `packages/redaction` and mentions redaction nowhere. Nothing in
r1's Tranche B file map creates an application-side redaction step, and
`packages/journal/src/envelope.ts` is not that step: its header states the
envelope is "the post-redaction safe representation" and that "redaction
enforcement belongs to the write path (2b and later)". The normalizer
assumes redaction already happened. So at `main` today there is no code
that performs §6.1's redaction before a journal write, and no test that
demonstrates §6.3 against the journal. That is the gap this addendum
proposes to close, and it is the only reason for the additions below.

---

## 3. The append caller — a proposed scope addition, not a plan defect

Addendum 02 r1 called the absence of a runtime append caller in r1 §4.2 a
finding ("IF-4") and asserted B-A1–A5 could not run without it. Withdrawn.
r1's atomicity proofs (§5.2 B-A1–A5) can exercise the SQL primitive
directly: a test can open one connection, begin a transaction, perform the
lifecycle insert, `EXECUTE` `public.command_journal_append(...)`, and prove
COMMIT, ROLLBACK, and journal-failure-rolls-back-lifecycle without any
production TypeScript caller. Tranche B as written is complete for its
stated purpose.

What this addendum proposes instead is an **application-boundary
integration** — the place where §6.1's redaction is enforced before the
control plane, the contract's sole writer (§3), calls the routine. It is
proposed content, justified by §6.1/§6.3, and separable from the SQL
qualification in §5.2. If the Founder prefers the boundary to land with
Tranche D's runtime work rather than B, the proposal moves with no change
to its content; §10 item D-2 puts that choice to the Founder.

---

## 4. Proposed additions to Tranche B (r1 §4.2 and §5.2, by addition)

| Id | Action | Path | Change | Basis |
|---|---|---|---|---|
| B-N2 (proposed) | NEW | `packages/control-plane/src/journal-append.ts` | The application-side append caller. Given an open transaction and a normalized command envelope or decision record: (1) redacts the tree through the boundary's `redactValue`; (2) produces the canonical bytes with `packages/journal` (`encodeEnvelope`, `envelopeDigest`, `encodeCommandEventRow` or the decision-row encoder); (3) `EXECUTE`s `public.command_journal_append(...)` on the same connection, passing the canonical row bytes and digest. It does **not** assign `seq`, read or trust the head, or compute `chain_hash` — see §5. A refused boundary throws before any SQL; the surrounding transaction rolls back | contract §3, §6.1, §6.2; r6 §16.1 |
| B-N3 (proposed) | NEW | `packages/control-plane/src/redaction-boundary.ts` | The control-plane side of the boundary, the same shape as `packages/run-harness/src/redaction-boundary.ts`: registry from the control plane's environment; manifest names `CONTROL_PLANE_TOKEN`, `DATABASE_URL`, and the key variable itself (see §6) and excludes those names from the heuristic scan so each is registered once; values trimmed; key custody **injected** — production selection per §7, fixture custody in tests. Imports nothing from `packages/gateway-daemon`. No switch turns the boundary off | contract §6.1; Lane B wiring handoff |
| B-T4 (proposed) | NEW | `test/journal-redaction.storage.test.ts` | The §6 negative qualification as a matrix, §6 below, over B-N2 under fixture custody against the CI Postgres | contract §6.1, §6.3, §4.1 |

Consequential notes on existing rows:

- **B-T2** is unchanged in purpose. It may exercise the SQL primitive
  directly (§3) or through B-N2; if through B-N2, B-A3's "journal failure"
  set gains one case: a redaction refusal before SQL.
- **B-M3** (`tsconfig.json`): both `packages/control-plane/src/**` and
  `packages/redaction/src/**` are already in the root include at `main`;
  new files under an included directory need no change. r1's
  `PLAN-OPEN — VERIFY BEFORE AUTHORIZATION` marker stands.
- **FORBIDDEN in B** is unchanged. B-N3 is constructed by the caller at
  request time, not at boot; `packages/control-plane/src/main.ts` is not
  touched. Boot-time construction is a Tranche D matter and is not decided
  here.
- **Base constraint (statement, not selection):** B-N3 imports
  `packages/redaction`, present on `main` from `6ef7d12`. Tranche B's base
  is the Founder's to name at Gate III; this row only records that a base
  earlier than `6ef7d12` cannot build B-N3.

---

## 5. Ownership: what SQL owns, what TypeScript owns

Stated from contract §4.1 and §6.2 and r6 §16.3/§16.5, so no layer is
assigned a duty the architecture gives to another.

| Concern | Owner | Source |
|---|---|---|
| Sequence (`seq = head + 1`) | **SQL**, inside `command_journal_append` | contract §4.1 "assigns `seq = head + 1`" |
| Prior head: lock, verify against the recomputed tail, advance | **SQL**, inside the routine; abort on divergence, no insert, no advance | contract §4.1 "acquires an exclusive lock on the single chain-head row … verifies the locked head against the event rows before writing" |
| `chain_hash` | **SQL**, inside the routine, using builtin `pg_catalog.sha256()` under the pinned `search_path` | contract §4.1 "computes the chain hash against the verified tail"; r6 §16.3, §16.5; r1 B-H1/B-H2 |
| Canonical bytes of the envelope and of the complete row (spec (a), (c), (d)) | **TypeScript**, `packages/journal` encoders, produced by B-N2 and passed to the routine as `bytea` | contract §6.2; `packages/journal/src/{envelope,event-row,decision-row}.ts` |
| `envelope_digest` | **TypeScript** (`envelopeDigest`), carried in the row's canonical bytes | contract §6.2 |
| Redaction of the tree | **TypeScript**, B-N2, before canonicalization | contract §6.1 |
| Validation of the chain (recomputation from genesis) | **not a runtime consumer in Tranche B.** `packages/journal` exports `chainHash` (the reference framing used by the golden vectors) and no `verify()`; contract §4.2 reserves `verify()`/rebuild to the `packages/ledger` primitives at the pinned TUI head under the drift procedure. B-T4 uses a **test-scoped recomputation** (see §6) and adds no runtime `verify()` or recovery consumer; that exclusion is preserved | contract §4.1, §4.2; `packages/journal/src/chain.ts` |

Consequence for B-N2: the redaction step must precede the canonical
encoding, because the routine hashes the bytes it receives. Redacting after
encoding would leave the secret inside the hashed bytes; redacting before
means the chain covers redacted bytes and only those.

---

## 6. Protection of the HMAC key and of every persisted field

Addendum 02 r1 wrote "a key is not a value that appears in output" and
excluded the key variable from registration. That assumed the property the
boundary exists to enforce. Corrected by separating two things:

**Exclusion from heuristic scanning** is a registration-hygiene rule: a
name listed in the manifest is skipped by the heuristic pass so it is not
registered twice (a duplicate is a refusal). It says nothing about
protection.

**Protection** is what the registry does with a value once registered. The
key variable's **hex value is registered as a protected value** through the
manifest, exactly like `CONTROL_PLANE_TOKEN`. If the key's hex string ever
appears in an envelope, a decision record, an error message, or metadata,
the redactor replaces it. The replacement token is an HMAC of the key's hex
under the key itself, which discloses nothing about the key. Custody classes
hold the decoded bytes and never render them; every refusal detail in the
package carries names, never values (`key-custody.ts`, `sinks.ts` at
`main`).

**B-T4 as a matrix**, each row run through B-N2 under fixture custody
against the CI Postgres, with the persisted row read back by `SELECT` and
searched for the seeded value:

| Row | Seeded where | Seeded value class | Expected |
|---|---|---|---|
| T4-1 | envelope free-text argument | manifest-registered value (`CONTROL_PLANE_TOKEN` fixture) | 0 occurrences in the row; replacement token present; `envelope_digest` equals the digest of the redacted envelope's canonical bytes |
| T4-2 | envelope nested field | heuristic-registered value (a `*_TOKEN` fixture variable) | as T4-1 |
| T4-3 | decision-class record field | manifest-registered value | as T4-1, over the decision-row encoder |
| T4-4 | `evidence_refs` entry | manifest-registered value | as T4-1; ordering of `evidence_refs` preserved (§6.2(c)) |
| T4-5 | error path: the lifecycle insert fails with the secret in its message after redaction opened | manifest-registered value | the surfaced error carries the token, not the value; no journal row; head unchanged |
| T4-6 | envelope free-text argument | **the HMAC key's own hex** | 0 occurrences; a replacement token present; the persisted bytes contain neither the hex nor the raw key bytes |
| T4-7 | envelope free-text argument | `DATABASE_URL` fixture value | as T4-1 |
| T4-8 | refused boundary (`key_absent`, `key_unavailable`, `registry_unloadable`, each) | any | `RedactionRefusedError` before any SQL; lifecycle insert rolled back; head unchanged; zero journal rows |
| T4-9 | chain recomputation | — | a test-scoped helper (`chainHash` from `packages/journal` folded from genesis over the `SELECT`ed rows in `seq` order) equals the persisted `chain_hash` on every row and the persisted head; this helper is test code, not a runtime consumer |

Rows T4-1 through T4-7 are the §6.3 obligation stated over every persisted
field class the contract names (§2's elements, `evidence_refs`, decision
records, error surfaces), not over one seeded registry value.

---

## 7. Custody: fixture, Linux implementation, production provisioning — three separate things

Addendum 02 r1 made a Railway key source a Gate III dependency. Withdrawn.
The three are separable, and only the first is Tranche B content:

| Layer | What | When | Authority |
|---|---|---|---|
| **Fixture custody** | `InMemoryHmacKeyCustody` / `UnavailableHmacKeyCustody`, already in the package; injected into B-N3 by tests | Tranche B qualification (B-T4, B-T2). No production key, variable, or platform is involved | within Tranche B's code authorization |
| **Linux custody implementation** | a custody class that reads a key from a named environment variable, fail-closed | a separate redaction package revision (v0.2), authorized on its own; **not a Gate III prerequisite** | separate Founder act; design approval is §10 item D-3 |
| **Production provisioning** | the variable's existence on the Railway application service as a sealed variable | Tranche D, alongside `DATABASE_URL` (r6 §5.1 rule 2, §13 step 8) | Founder custody act at Tranche D; recording format per FD-2's determination |

Production posture until all three exist: **fail-closed and unauthorized.**
With B-N2 merged and no key on the runtime host, every append refuses
before SQL, the journal is unavailable, and dispatch fails closed — the
named condition of contract §5.1, not a degraded mode. That is the intended
state until Tranche D provisions the key. Nothing in Tranche B makes Railway
readiness a prerequisite.

**Qualification of the Linux custody implementation** (for the v0.2 act, so
the standard is on record now; no test count is prescribed): absent
variable → `key_absent`; non-hex or odd-length value → `key_unavailable`
with a names-only detail; decoded length under 32 bytes →
`key_unavailable`; backend selection is explicit (variable present → env
custody; darwin without the variable → Keychain; neither → unavailable),
never inferred from a partial state; every refusal path invokes no inner
writer; the key's hex and bytes appear in no error, log line, or persisted
row, proven by the same seeded-value method as T4-6.

---

## 8. `JournalAppendSink` is not the journal writer — grounded

`packages/redaction`'s `JournalAppendSink.append(record)` emits
`JSON.stringify(redactValue(record))` as one line to an inner writer
(`sinks.ts` at `main`). Contract §6.2(c) requires the chain hash to cover
"the complete command-class event row" in the canonical form of
specification (c), whose encoder is `packages/journal`'s
`encodeCommandEventRow`, with golden vectors. The sink's line is not the
specification (c) encoding. Therefore the sink's output cannot be the
persisted row bytes without violating §6.2(c) by construction. Addendum 02
r1's claim that verification "would fail on every row" is withdrawn as
unsupported; the grounded statement is the one above. B-N2 uses the
boundary's redactor directly, then the canonical encoders. The sink class
stays in the package unused by the journal; `packages/redaction/src/**` is
not modified by Tranche B.

---

## 9. Drift and execution language, corrected

- **S2** (r6 §17) fires when the controlling contract's hash changes from
  `eaeb6178…9e52`. It is not a general drift stop for architecture or
  implementation surfaces. Addendum 02 r1's "byte-identical at any later
  `main` commit unless S2 fires" is withdrawn. Drift between the selected
  base and any later base is assessed under the plan's own procedure and,
  where the review indicates, **FD-B3's drift assessment — an instrument
  not transcribed in-repository; this addendum applies nothing from it
  and notes that it governs where it exists** (§10 item R-1).
- **Code-merge SHA and execution SHA** have different roles (r1 §9.1) and
  **may identify the same commit**. The first is the commit at which B's
  code merges; the second is the `founder_authorized_sha` a migration run
  asserts, which must be a commit on `main`.
- **Execution before Gate IV.** r1 §3.1 forbids executing B's SQL against
  Neon by any route except the protected plane. It does not speak to
  disposable qualification execution under fixture custody. The review
  names **FD-B1's fixture exception** as the governing instrument for
  that; it is not transcribed in-repository, and this addendum neither
  restates nor narrows it. B-T4 and B-T2 run against the CI Postgres as r1
  B-M4 already provides; that is not a Neon execution.

---

## 10. What remains genuinely for the Founder

Reconciliation requests (transcription, not decisions):

- **R-1.** Supply, or point this session at, the off-repository
  instruments: the Gate I approval (if issued), reviewed Gate III r3,
  FD-B1 through FD-B4, and any issued Gate III act. On receipt, §1 and §9
  are reconciled against them and this addendum is re-issued as r3 if
  anything changes. Until then §1 and §9 stand as written: no inference
  either way.

Decisions:

- **D-1.** Whether the §4 additions (B-N2, B-N3, B-T4 as a matrix) are
  accepted as Tranche B scope, for the governing Gate III instrument to
  name. Accepting them does not select a base, provision anything, or
  touch FD-2.
- **D-2.** Placement: the application-boundary integration lands in
  Tranche B (this proposal) or with Tranche D's runtime work. Content is
  identical either way; only the tranche id in the gate act changes.
- **D-3.** Approval of the Linux custody **design** for a separate
  redaction v0.2 act: a named environment variable holding the key as hex,
  read by a fail-closed custody class, selected explicitly, qualified per
  §7. This is not a Gate III prerequisite and does not provision anything.

Kept distinct and **not** asked here: FD-2, whose exact scope is
"RECORDING THE NEW ADMINISTRATIVE CUSTODY DOMAIN" (r1 §12), required before
Gate IV. FD-2 decides the recording instrument for a custody domain r6 §19
already ratified. It neither authorizes nor forbids a new secret or custody
mechanism; D-3 is a separate approval even if the Founder issues both in
one act.

---

## 11. Change table from Addendum 02 r1

| r1 statement | r2 disposition |
|---|---|
| "Gate I remains unrecorded" as a prerequisite | replaced by §1: not transcribed in-repository; effective authority not determined here; reconciliation request R-1 |
| IF-4: atomicity tests require a production caller | withdrawn; §3: B-N2 is a proposed application-boundary addition justified by §6.1/§6.3; SQL qualification stands alone |
| Key variable excluded from registration; "a key is not a value that appears in output" | withdrawn; §6: scanning-exclusion separated from protection; the key's hex is a registered protected value; T4-6 proves it |
| Railway key source as a Gate III prerequisite; "commission v0.2 then Gate III" | withdrawn; §7: fixture custody suffices for qualification; Linux custody and provisioning are separate; production stays fail-closed |
| FD-3 recommended "ruled together with FD-2" | withdrawn; §10: FD-2's scope quoted; D-3 kept separate |
| B-N2 "canonicalizes … `chainHash`"; B-T4 "`verify()` recomputes" | corrected; §5 ownership table: SQL owns seq, head, chain hash; TypeScript owns canonical bytes and digest; no runtime `verify()`; T4-9 is a test-scoped helper |
| "byte-identical at any later `main` unless S2 fires"; "Gate IV before B executes" | corrected; §9: S2 is the contract-hash stop only; disposable execution and FD-B1/FD-B3 named as untranscribed governing instruments |
| "`verify()` would fail on every row" | withdrawn; §8 grounds the exclusion in §6.2(c) |
| "one test" for the custody class | replaced; §7 states the qualification standard without a count |
| FD-3 as a Founder decision inside this addendum | replaced by D-3 (design approval for a separate act) |

---

## 12. Attribution

Drafted by the `builder` seat (Actor-Id
`session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`, Execution-Surface
`claude-code`) at the Founder's request. No commit was produced by this
draft. If committed later, the committing act carries its own trailers per
`DEC-20260718-05` and its own authorization. `br-architect` review is the
named next role.

---

## 13. Status

`ADVISORY SUCCESSOR — PROPOSED SCOPE ADDITIONS; RECONCILIATION R-1 OPEN`

**Nothing was created or modified.** No code, test, PostgreSQL role,
credential, GitHub environment, GitHub secret, Railway configuration, Neon
object, migration, branch, commit, or PR was created or modified in the
production of this artifact. Addendum 02 r1 is preserved unchanged as the
review record.
