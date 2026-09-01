# Build Room Canonical Command Journal — Contract v0.15 (PROPOSED)

Status: **proposed** — Phase 4 journal-first implementation order, step 1
("establish the command-journal contract and invariants"). The two clauses
brought as builder proposals on the `DEC-20260818-01` pattern (§3 store and
sole writer; §8.2 plan-decision authentication) were **ruled by the Founder
on 2026-09-01** in the Founder ruling comment on PR #11; both are marked
**[RULED]** at their clauses and the write and approval paths are
unblocked by those rulings once this contract merges. Everything else
binds the implementation once this contract merges under the repository's
gates and the Founder's SHA-named merge authorization.

**Authority derivation — this document is an implementation contract, not
governance doctrine.** Its entire authority derives from the FounderOS
rulings named below; it creates none of its own. Governance doctrine lives
in FounderOS (per this repository's own AGENTS.md); this document exists
in the implementation home because the Founder's journal-first order makes
"establish the command-journal contract and invariants" implementation
step 1, and `DEC-20260827-01` Section 10 itself names "the Phase 4 step-1
journal contract" as where the journal's concrete store and sole writer
are proposed for ruling. Where this document says a choice is "fixed" or
"binds," that is binding on the implementation under the named rulings'
authority — never a new rule of governance. Any conflict with a FounderOS
ruling resolves in FounderOS's favor, and changes to ruled substance
follow the rulings' own amendment paths.

**Row model, fixed by this contract for implementation: the journal is
event-sourced.** One
appended row per command *event*; nothing on a journal row is ever
updated. The eleven-element record contract (§2) is a projection over a
command's events; dispatch state is derived from the latest event, never
stored as a mutable column (§5). This resolves the v0.1 contradiction
between §4's database-enforced append-only rule and §5's state
transitions, in favor of the model every existing append surface in this
repository and the consumed MadBridge `Ledger` already use.

Governing authority: the command-journal Phase 4 ruling
(`FounderOS/07-decisions/DEC-20260827-01` Section 10, 2026-08-31) and the
Phase 4 Founder Authorization
(`FounderOS/07-decisions/DEC-20260815-17`, `## Founder Authorization —
Phase 4 (Planner Loop) (2026-08-31)`). Implementation base: Build Room
`main` at `ad23c6ea6117a54bce5be7208a5a5768ec5bfbc9`.

## 1. Authority and singularity

1. The canonical command journal belongs to the Build Room governance
   authority. MadBridge contributes implementation primitives only; no
   authority over command history transfers (BR-Authority Principle,
   `DEC-20260827-01` §2).
2. There is exactly one canonical governed command history: **one
   canonical journal, one chain, one `seq` space, two record classes**
   (`command` and `decision`, per the Founder ruling of 2026-09-01 —
   §12). A record class is not a second journal, and nothing permits a
   second chain. No planner, gateway, adapter, CLI, TUI, provider
   integration, local process, evidence recorder, or other component may
   establish a second authoritative command journal. Local diagnostic
   logs, provider logs, process output, evidence records, and telemetry
   are not substitutes.
3. Singularity is tested, not asserted: the Phase 4 suite must demonstrate
   that every governed-command dispatch path reaches the journal module and
   that no second write path to journal state exists
   (stop-gate items §7.1–7.2).
4. **Authority boundary with the lifecycle event log
   (`build_room_events`).** The closest existing structure to a command
   history in this repository is `build_room_events` — the ratified
   `DEC-20260815-11` lifecycle machine's own event log — and roughly six
   of §2's eleven elements have counterparts there (actor, attribution,
   scope, outcome, evidence, ordering). The boundary is therefore stated,
   not left to co-location:
   - `build_room_events` remains authoritative for **lifecycle facts**: a
     room's state transitions, the transition's actor, guard, and
     resulting state. Nothing in this contract moves, duplicates, or
     re-derives lifecycle authority.
   - The command journal is authoritative for **governed-command facts**:
     command identity, the normalized envelope and digest, the governing
     authorization binding, dispatch state, the command's terminal
     outcome, and the provider, model, and surface that actually executed
     the command.
   - Where an element appears in both, each store carries it **in its own
     scope**: `build_room_events.actor` is the actor of a transition; the
     journal's `actor_id` is the actor of a command. A journal event that
     corresponds to a lifecycle transition carries a `lifecycle_event_ref`,
     defined normatively as the pair **(`room_id`, `event_id`)** — never a
     copy of the lifecycle row's content. The pair is constraint-backed in
     the live schema (`build_room_events_event_id_unique UNIQUE (room_id,
     event_id)`, alongside the `(room_id, seq)` primary key) and is a
     stable business identifier rather than a positional one. The pair's
     exact shape is part of the canonical event-row encoding (§6.2(c)).
   - **Commit boundary, resolved as option (a) — one transaction.**
     Where a single control-plane act writes both a journal event and
     the lifecycle event it references (`lifecycle_event_ref` present
     and created by the same act — the §8 decision acts foremost), both
     writes execute in **one Neon transaction**: the pair commits or
     neither does. An act "takes effect" only at that commit; a failure
     of either write aborts both, fail closed. The contract chooses (a)
     over durable pending/apply states because both stores live in the
     same bound database, the append protocol already runs in a
     transaction the lifecycle insert joins, and (a) adds no member to
     the closed vocabulary.
   - A disagreement between the two stores on a shared fact is a
     reconciliation `mismatch`: surfaced, never auto-resolved in either
     direction, and never silently overwritten in either store. With the
     atomic commit boundary above, such a mismatch can arise only
     outside that boundary (tamper, partial restore, an act that
     references a pre-existing lifecycle event); the rule remains as
     defense in depth, not as the happy path's failure mode.
   - Co-location in one database is not co-authority. The journal must be
     independently reconstructable as command history from its own rows
     (§4); lifecycle references are for cross-verification, not
     reconstruction dependencies.

## 2. Journal record contract (projection over events)

The journal stores **events** (§5); this section defines the **projection**:
for every governed command, the set of journal events sharing its
`command_id`, ordered by `seq`, must establish the eleven ruled
relationship elements below. Identity-bearing fields for elements 1, 3, and 5–7 are
carried on the command's first event (`journaled`) and are **immutable for
the command**: a later event for the same `command_id` either omits them or
must carry byte-identical values — a divergence is a chain-integrity
failure, not an update. Element 2's identities (`room_id`, `run_id`,
`execution_id`) are **set-once**: each may be null on `journaled` only
while that identity does not yet exist, is recorded exactly once — on the
dedicated one-time `identity_bound` event (§5.2), or on `dispatched` where
the identity first exists there — and is immutable from that recording,
never backfilled with a guess, never changed once set. Element 4 splits by observability: `journaled`
carries the **intended** routing identity, labeled as intent; the
**observed actual** identity is recorded on `dispatched` (the first event
at which it can be truthfully observed), is authoritative for element 4,
and is immutable once recorded. A command may not be represented as
`completed` while its observed identity is absent, and an
intended-vs-observed divergence is surfaced (identity mismatch is a named
fail-closed condition of the authorization's Section 5), never silently
reconciled.

| # | Ruled element | Field(s) | Notes |
|---|---|---|---|
| 1 | command identity | `command_id` | dedicated `cmd_` namespace; generator never shared with another kind |
| 2 | room / run / execution identity | `room_id`, `run_id`, `execution_id` | where applicable; null only before the identity exists, never backfilled with a guess |
| 3 | actor and role | `actor_id`, `role_id` | registry-valid values only |
| 4 | actual provider, model, execution surface | `intended_provider`, `intended_model`, `intended_surface` on `journaled`; `provider`, `model`, `execution_surface` on `dispatched` | intent labeled as intent pre-dispatch; the observed actual identity is recorded on `dispatched`, is authoritative for this element, and is never backfilled from configuration |
| 5 | repository and governed scope | `repository`, `scope_ref` | the run's immutable scope input |
| 6 | authorized command / normalized envelope | `command_envelope`, `envelope_digest` | §6 normalization; raw commands that would expose secrets are never stored |
| 7 | governing authorization or approval | `authorization_ref` | e.g. the plan-approval decision record; must be **resolvable**, not merely well-formed (§5.3) |
| 8 | dispatch state | derived from the latest event (§5) | never a stored mutable column |
| 9 | terminal outcome | derived from the terminal event (§5) | never a stored mutable column |
| 10 | resulting evidence references | `evidence_refs` | pointers into the evidence store; payloads never inlined |
| 11 | timestamps and ordering | `recorded_at`, `seq` | server-generated; sufficient to reconstruct command history |

Any change to the elements above after ratification is a contract
amendment, not a refactor.

**Decision-class records (Founder ruling, 2026-09-01 — §12, option (b)).**
Founder decision acts (T4 `plan.revision_requested`, T5 `plan.approved`,
T22 `founder.cancel`) are journaled as a distinct `decision` record
class on the same chain. A decision record is a **single event, terminal
by construction, with no state machine**: it commits atomically with its
lifecycle event under §1.4 or it does not happen. Its element set is
closed: actor `founder`, the decision, the **recorded lifecycle state at
the decision** (the state the act fired from), `plan_hash` **where a
plan exists at the decision**, `authorization_ref`,
`lifecycle_event_ref`, and timestamps.

**`plan_hash` conditionality (Founder ruling, 2026-09-01, v0.14).** T4
and T5 fire only from `PLAN_REVIEW`; a plan always exists at those
decisions and `plan_hash` is always required. T22 `founder.cancel`
fires from any non-terminal state, including `ROOM_CREATED`, `SCOPED`,
and `PLANNING`, where no operative PlanDoc is bound at the decision — a
plan first exists at T3, whose guard computes `plan_hash`. For a
decision record, `plan_hash` is **absent** exactly when the recorded
lifecycle state at the decision is `ROOM_CREATED`, `SCOPED`, or
`PLANNING`, and **required** in every other state a decision act can
fire from; in `PLANNING` reached by a T4 return this means the returned
submission's hash is not carried — the prior PlanDoc is no longer
operative at the decision. The no-plan condition is carried as a
**positive verifiable fact — the recorded lifecycle state at the
decision** — never inferred from the field's absence, and no sentinel
value ever stands in for an absent hash. The recorded state must agree
with the lifecycle event named by `lifecycle_event_ref`; a divergence
is a chain-integrity failure. The ruling declines a pre-plan sub-class:
there is one `decision` record class, with `plan_hash` presence
governed by the recorded state.

**§2's elements 4, 8, and 9 are
not applicable to the class** — stated here rather than left absent by
omission: a decision record has no execution identity, no
`dispatch_state`, and no reconciliation path. Element 1's `command_id`
is likewise not applicable — a decision is not a command; the record is
identified on the chain by its `seq` and bound to its room by
`lifecycle_event_ref` — so the §4 command-scoped uniqueness constraints
are class-scoped to command records. The record class is an explicit
field on every row and part of the canonical byte input to the row hash
(§6.2): a verifier must never infer a record's class from which fields
happen to be absent.

## 3. Storage locus and sole writer — [RULED]

**Ruled by the Founder, 2026-09-01 (PR #11 ruling comment), taken as
proposed; §1.4 is affirmed as ruled text.** The journal lives in the Build Room's existing Neon-hosted
Postgres as dedicated append-only journal tables, and the sole writer is
the Build Room control plane through a single journal module.**

- Tables: `command_journal_events` (one appended row per command event,
  §5) plus its hash-chain column(s), and the singleton
  `command_journal_chain_head` serialization row (§4.1) — which holds no
  journal state, only the append latch. No other table or component holds
  journal state.
- Append-only is enforced at the database layer (no `UPDATE`/`DELETE` for
  any application role on journal tables, trigger-enforced), following the
  corpus's ratified append-only pattern — enforcement by construction, not
  by convention.
- **Sole-writer is enforced by grant, to the same standard.** A dedicated
  database role, `command_journal_writer`, distinct from any role the
  control plane uses for operational tables, is the only role granted
  `INSERT` on `command_journal_events` and the only role granted `UPDATE`
  on `command_journal_chain_head`. No application role holds `UPDATE` or
  `DELETE` on `command_journal_events` (the append-only clause above),
  and every other application role is **explicitly revoked** on both
  tables — a second writer is prevented by grant, not by discipline.
  Naming note, stated as a diff-fact: at base `ad23c6e` the repository's
  migrations declare no database roles, so the name follows the corpus's
  dedicated-writer convention (the `evidence_writer` / `console_reader`
  class) rather than inventing a scheme.
- No new infrastructure: the store is the already-bound Neon project the
  control plane writes today (`build_room_events`,
  `gateway_registry_events`, `phase3_run_*` establish the pattern and the
  writer). No new custody domain is created; `DEC-20260815-02` custody and
  sole-writer rules are untouched, and evidence custody is unchanged —
  journal rows reference evidence, they do not store it.
- Distinction preserved from `DEC-20260815-08`'s two-store split: the
  journal is neither the mutable operational room state nor the evidence
  store. It is its own governed contract hosted on the bound project with
  stricter (append-only, chained) guarantees than the operational tables
  around it.

**Alternative considered and not proposed:** a gateway-local SQLite journal
on the MadBridge ledger primitive. Declined in this proposal because the
governed dispatch decision and the Founder plan decision are recorded at
the control plane, so a gateway-local journal would make the fail-closed
pre-dispatch rule depend on the partition state between gateway and control
plane, and `DEC-20260820-01` declines a gateway-local custody domain twice
over — §6 ("custody selection or a third custody domain ... not authorized
as a permanent custody domain"), the direct prohibition, carried by clause
7. Recorded as the alternative considered; the Founder ruled the proposal
as written.

## 4. Append-only and tamper evidence

1. Journal event rows are hash-chained: each row's chain hash covers its
   canonical complete-row serialization (§6.2(c)) framed with the prior
   row's chain hash. `verify()`
   over the chain detects tamper and divergence. Because the model is
   event-sourced (§5), no row is ever updated or deleted — database-layer
   enforcement (no `UPDATE`/`DELETE` for any application role,
   trigger-enforced) and the chain protect the same invariant, and
   reconstruction replays events in `seq` order.
   **Chain scope, genesis, and append serialization (contract-level, not
   implementation detail):**
   - The chain is **one global chain** across all of
     `command_journal_events`, ordered by `seq` — not partitioned per
     command, room, or run. A single chain gives `verify()` one
     deterministic predecessor everywhere and makes cross-command
     ordering itself tamper-evident.
   - **Genesis:** the first row's prior-hash input is the constant of 64
     ASCII `0` characters. `verify()` recomputes from genesis in global
     `seq` order.
   - **Append serialization:** every append executes in a single database
     transaction that acquires an exclusive lock on the single
     chain-head row (current tail `seq` and chain hash), **verifies the
     locked head against the event rows before writing** — the head's
     `seq` and chain hash must equal the recomputed tail of
     `command_journal_events`; on any divergence the transaction aborts
     with no insert and no head advance — then assigns `seq = head + 1`,
     computes the chain hash against the verified tail, inserts the
     event, and advances the head. Concurrent control-plane requests
     serialize and a fork is impossible by construction; a stale or
     corrupted head can never be appended against. The abort is a named
     fail-closed condition (§5.1): the journal is unavailable for
     dispatch until the divergence is resolved as an integrity finding.
   - **Chain-head storage, defined:** the head lives in a dedicated
     singleton table, `command_journal_chain_head`, in the same Neon
     Postgres database — exactly one row, initialized once by the schema
     migration to `seq = 0` and the 64-zero genesis constant, before any
     event row exists; genesis initialization is a migration act, never
     an event-append. The head row is **mutable by design and is not
     journal state**: it is a serialization latch, updatable only by the
     sole writer inside the append transaction, fully derivable from the
     event rows, and carrying no authority — `verify()` and rebuild
     recompute the chain from the events alone and never trust the head;
     a head that disagrees with the recomputed tail is an integrity
     finding, surfaced, never adopted. The append-only rule and its
     database-layer enforcement apply to `command_journal_events`; the
     head row is the one deliberate, named exception, on its own table
     with its own grants.
   - **Singleton, enforced in schema — the §3 enforcement-by-grant
     standard applied here too:** the table carries a fixed singleton
     key with a check constraint pinning it (`head_id` primary key,
     `CHECK (head_id = 1)`), so a second row is unrepresentable;
     `INSERT` and `DELETE` are denied to every application role,
     `command_journal_writer` included — row creation belongs to
     migrations alone, and the migration-initialized genesis row is the
     table's sole insert, ever. Two concurrent writers therefore cannot
     lock different head rows: there is exactly one row to lock, by
     constraint, not by convention.
   - **Uniqueness, enforced in schema:** `seq` primary key; `chain_hash`
     unique; `(command_id, event_type)` unique for the at-most-once
     event types (`journaled`, `identity_bound`, `dispatched`,
     `resolved`); the exactly-one-terminal rule is verified on rebuild.
2. Primitive reuse: the Build Room `packages/ledger` implementation and the
   consumed MadBridge contracts (`DEC-20260827-01` §5, rows 3.3 and 3.5:
   `Ledger`/`LedgerRow`/`VerifyResult`; `rebuildState`, reconciliation
   semantics) are reused where their frozen contracts permit, at the pinned
   TUI head `7d37a61dcaeaef77c55013c7620deb8445726788`. Before consumption,
   the pinned blobs are re-resolved per `DEC-20260827-01`'s named drift
   procedure; a materially changed consumed interface stops implementation
   pending amendment and Founder ruling.
3. Reuse does not make the evidence ledger the journal: the journal is a
   separately defined governed contract with its own chain
   (`DEC-20260827-01` Section 10).
4. Implementation-order reading, recorded: step 2 (journal foundation) may
   itself consume rows 3.3/3.5 primitives as the ruling's reuse clause
   permits; step 3 covers the remaining consumed capabilities for the
   planner path (3.1 worktree/sandbox, 3.4 adapter lifecycle, and any
   3.3/3.5 surface not already integrated).

## 5. Command events, derived state, and the fail-closed rule

1. Pre-dispatch: a governed command may not be dispatched unless its
   `journaled` event is durably committed. Journal write failure, timeout,
   or unavailability means no dispatch — fail closed, never journal-after.
   A chain-head/event-tail divergence detected inside the append
   transaction (§4.1) is one of these fail-closed conditions by name: the
   append aborts, nothing is inserted, and dispatch is blocked until the
   divergence is resolved as an integrity finding.
2. **Closed event vocabulary** (one appended row each), **closed over
   command-class records**. Decision-class records are not events in
   this vocabulary: each is a single terminal record defined in §2 under
   the §12 ruling, chained on the same `seq` space, with no state
   machine, no `dispatch_state`, and no reconciliation path. For command
   records: `journaled` (the
   pre-dispatch record, carrying §2 elements 1, 3, and 5–7, any element-2
   identities that already exist, and the intended routing identity);
   `identity_bound` (at most once, only between `journaled` and
   `dispatched`: the one-time binding of element-2 identities that did not
   yet exist at `journaled` — it carries only those identities, an
   `identity_bound` with nothing to bind is invalid, and it is chained and
   hash-covered like every event); `dispatched` (carrying the observed
   actual provider, model, and execution surface); then
   exactly one of `completed` | `failed` | `unresolved`, and — only after
   `unresolved` — `resolved` (carrying the reconciled terminal
   determination, `completed` or `failed`, with its reconciliation
   evidence under the consumed 3.5 semantics: `reconciled` / `ambiguous` /
   `mismatch`, where `ambiguous` never resolves silently).
3. **Ordering invariants** (enforced, and verified on rebuild):
   `journaled` first and exactly once per `command_id`; `identity_bound`
   at most once, only after `journaled` and before `dispatched`;
   `dispatched` at most once, only after `journaled`; exactly one of
   `completed`/`failed`/`unresolved`; `resolved` only after `unresolved`,
   at most once; no event after `completed`/`failed`/`resolved`. A
   sequence violating these is a journal-integrity failure.
   **The failure and ambiguity paths split on one question: can provider
   contact be ruled out?**
   - `completed` requires a prior `dispatched`, an observed identity
     (§2), **that the observed identity matches the journaled intended
     routing identity**, and — on **every** path to a `completed`
     determination, the direct equal-route path included (Founder
     ruling, 2026-09-01) — that `authorization_ref` **resolves** to an
     authorization that exists, is valid, and is applicable to the
     command's repository, scope, and run, whose granted scope
     **covers** the observed `(provider, model, execution_surface)`.
     Coverage may be by set or roster and need not enumerate the
     intended-to-observed pair — but **silence is not coverage**: an
     authorization that does not speak to the observed route does not
     cover it. Matching intended and observed identities do not exempt
     a command from this test. A coverage failure bars `completed`:
     the determination is `failed` where the evidence is sufficient to
     conclude non-coverage, and stays `unresolved` where the evidence
     is indeterminate. **A citation alone never reaches `completed`.**
     This is the one statement of the authorization test; every other
     clause applies it by reference and never restates it. An
     intended-vs-observed divergence bars `completed` and every
     success representation by the vocabulary itself: a divergent
     command routes to `failed` or `unresolved`, and may reach a
     `completed` determination only through `resolved`, which
     **inherits this completion requirement** — a reconciled
     `completed` applies the test above to the observed identity, the
     intended-to-observed substitution itself covered by the resolved
     authorization's granted scope. This closes §2's identity-mismatch
     fail-closed condition in the event rules, not only in prose.
   - `failed` may follow `dispatched`, or may follow `journaled` /
     `identity_bound` directly **only where the attempt provably never
     left the gateway boundary** — policy rejection, local validation
     failure, send never attempted. It carries a failure classification;
     pre-send `failed` carries no observed identity.
   - Where provider contact **cannot be ruled out** — transport timeout,
     credential rejection that may have followed a received request,
     crash mid-send — the command appends `unresolved` (legal after
     `journaled`, `identity_bound`, or `dispatched`) and reaches a
     terminal determination only through `resolved` under the
     reconciliation protocol below. A cannot-rule-out failure never uses
     the direct `failed` path.
   **Dispatch idempotency and crash recovery (the journal-to-dispatch
   boundary):**
   - `command_id` is the end-to-end idempotency key: the dispatch path
     presents it to the gateway and adapter, which must enforce
     at-most-once execution per `command_id`. A retry is safe only
     because of this binding, and no dispatch integration that cannot
     honor it is a conforming dispatch path.
   - On recovery, a command whose latest event is `journaled` or
     `identity_bound` enters **dispatch-attempt reconciliation before any
     retry**: the downstream is queried by `command_id`. If the command
     was accepted, `dispatched` is appended carrying the observed
     identity from the reconciliation evidence — never a re-execution.
     If it provably never reached the provider, the command may append
     pre-send `failed` or proceed to a governed dispatch attempt. If the
     answer is indeterminate, `unresolved` is appended and the
     reconciliation protocol owns the outcome. Recovery never
     re-dispatches on the strength of a missing `dispatched` event alone
     (stop-gate item 10: reconstruction creates no duplicate dispatch).
4. **Derived state — the two views cannot disagree by construction.**
   `dispatch_state` is the latest event's type; the command's `outcome` is
   the terminal determination (`completed`/`failed`, directly or via
   `resolved`), `unresolved` while an `unresolved` event is unreconciled,
   and pending otherwise. Both are computed from the same event sequence;
   neither is stored independently, so no invariant between two stored
   columns is needed — there is one source and two readings of it.
5. `unresolved` blocks any success claim, any retry, and any
   representation of completion until `resolved`. No component represents
   an unreconciled outcome as success. All user-visible state
   distinguishes observed, failed, unavailable, pending, rejected, and
   unresolved rather than fabricating completion.
6. Fault-injection obligations: journal store down, gateway loss
   mid-dispatch, crash between `journaled` and dispatch, duplicate replay
   after restart — no duplicate dispatch, no duplicate authority, no
   silent success (stop-gate items §7.9–7.10).

## 6. Secrets and normalization

1. Never persisted: provider credentials, authentication tokens, secret
   environment values, private keys, or other credential material. Where a
   raw command would expose secret material, the journal stores the safe
   normalized representation plus digest and evidence reference. Redaction
   runs before the journal write, never after.
2. Spec-before-hashing applies to **every** hashed surface, not only the
   envelope. Four serialization contracts, each versioned with golden
   vectors and ratified **before** the corresponding hashing
   implementation:
   (a) the normalized command envelope; (b) the plan digest; (c) the
   **complete command-class event row** the chain hash covers — field
   presence and order, scalar encodings, collection ordering
   (`evidence_refs` hashed in recorded order, never re-sorted), and the
   chain framing (how the prior row's chain hash is combined with the row
   bytes); and (d) the **complete decision-class record row** (Founder
   ruling, 2026-09-01), with exact byte inputs stated for the decision
   shape and **its own golden vector**, chained over the one `seq` space
   by the same framing; the (d) specification **states the canonical
   encoding of field presence**, so that a record with `plan_hash`
   present and one with it legitimately absent (a pre-plan T22
   cancellation, §2) produce distinct, unambiguous canonical bytes,
   with golden vectors covering both presence shapes — absence is
   encoded structurally by the specification, never by a sentinel
   value, and presence is verified against the recorded lifecycle
   state (§2), never the reverse. **The record class is an explicit field in the
   canonical byte input to the row hash for both classes** — never
   inferred from absent fields. Two conforming
   implementations must produce byte-identical canonical forms and
   identical chain hashes for the same events, so a benign serializer
   difference can never masquerade as — or mask — tampering. Hash values
   are generated by implementation against the specs, never hand-authored
   into this document.
   **Algorithm and encoding, fixed for all four:** SHA-256, stored and
   compared as 64-character lowercase hexadecimal with no prefix and no
   separators — following the corpus's existing convention for ratified
   artifact pins rather than introducing a new one. Exact byte inputs:
   - `envelope_digest` = SHA-256 over the canonical byte sequence of the
     normalized command envelope per the (a) specification;
   - `plan_hash` = SHA-256 over the canonical byte sequence of the
     PlanDoc per the (b) specification;
   - `chain_hash` = SHA-256 over the concatenation of the prior row's
     `chain_hash` rendered as its 64 lowercase-hex ASCII bytes (the
     64-ASCII-zero genesis constant for the first row) followed by the
     row's canonical byte sequence per the (c) or (d) specification as
     the row's record class determines.
   The golden vectors for each specification verify against exactly
   these definitions.
3. Security-negative obligation: seeded credential-shaped values in
   command envelopes must never reach a persisted row (stop-gate §7.3).
4. Committed exports or diagnostics derived from the journal follow the
   repository's existing redaction practice.

## 7. Planner lifecycle binding

1. States and events are the ratified `DEC-20260815-11` set, unmodified.
   Phase 4 uses T1 `scope.captured`, T2 `task.dispatched.planner`
   (guard: roles assigned; reviewer≠builder; gateway online), T3
   `plan.submitted` (PlanDoc schema; plan_hash computed), T4
   `plan.revision_requested`, T5 `plan.approved` (guard: plan_hash match;
   scope paths canonical), T22 `founder.cancel`.
2. Rejection binds to T4 or T22 only. No `plan.rejected` event, no
   rejected terminal state, no third path; any addition requires a
   `DEC-20260815-11` lifecycle amendment ruled before implementation.
3. T5 enters BUILDING and dispatches nothing: the approved-plan record
   only — no Builder execution, no target-repository modification, no
   runtime draft-PR (Phase 4 authorization, Section 2).
4. A modified plan invalidates prior approval unless byte- or
   digest-equivalence is proven under §6's serialization discipline.
5. Enforcement obligations: the Planner cannot self-approve; an unapproved
   or invalidated plan cannot progress; identity, role, provider, model,
   surface, scope, authorization, journal, and evidence stay bound through
   every transition (stop-gate §7.6–7.8).

## 8. Founder plan-decision origination and authentication

1. Ruled and binding: the plan decision originates at the control plane on
   the `DEC-20260818-01` clause 1 pattern — the client surface may render
   the plan and relay the request; the authority-bearing act is recorded at
   the control plane. Neither the CLI (`DEC-20260815-13` clause 2) nor the
   web tier may originate it. Any other origination surface requires a
   separate Founder ruling before implementation.
2. **[RULED] Authentication of the Founder at the control plane for the
   plan decision — ruled by the Founder 2026-09-01 (PR #11 ruling
   comment), expressly scoped to Phase 4 with Phase 5 named as the
   revisit point.** The plan-decision endpoint shall require a
   Founder-held control-plane credential and the exact `plan_hash` being
   decided, with the act journaled (actor `founder`, the decision, the
   hash, timestamps) before it takes effect — where "before" is the §1.4
   atomic commit boundary: the decision's journal record — a
   `decision`-class record per §2 and the §12 ruling — and its
   lifecycle event (T5, T4, or T22) commit in one transaction, and the
   decision has taken effect only when that transaction commits. **The credential is ruled:
   the existing `PHASE3_ADJUDICATION_TOKEN`.** No new secret —
   `PHASE4_FOUNDER_TOKEN` or otherwise — is created. The enforcing
   configuration surface is `packages/control-plane/src/config.ts`: the
   plan-decision endpoint **shall require the credential to be configured
   and present** — a configuration requirement, not a new credential —
   and the credential shall be at least 32 characters, distinct from
   `CONTROL_PLANE_TOKEN`, and never echoed. With the token unset, the
   plan-decision endpoint refuses and the approval path is disabled, fail
   closed; no fallback to `CONTROL_PLANE_TOKEN` or any other credential.
   The Founder ruling comment on PR #11 carries the dated observation of
   the credential's pre-existing optionality; this contract states only
   the requirement. `DEC-20260815-07`'s step-up authentication
   remains an unbound proposal and is not activated by this contract.
   **Alternative considered, not adopted:** a dedicated Founder Ed25519
   keypair signing each decision payload — recorded as considered; the
   Founder ruled the credential binding above.

## 9. Out of scope

Phase 5 Builder execution; runtime draft-PR creation; autonomous merge;
deployment; activation; new infrastructure, credentials, providers, or
spend; `build-room-web`; evidence-custody changes; modification of the
frozen consumed contracts; any second authoritative command journal.
Counted Phase 4 runs require their own Founder entry authorization, which
defines the Phase 4 run unit and its per-run-vs-set granularity.

## 10. Test map to the Phase 4 stop gate

| Stop-gate item (Phase 4 authorization §7) | Contract section |
|---|---|
| 1 append-only / tamper-evident / reconstructable / singular | §1, §4 |
| 2 no bypass of the journal path | §1, §5 |
| 3 no secrets persisted | §6 |
| 4–5 goal → planner → durable plan | §7 |
| 6–7 approval/rejection enforced; no progress from unapproved | §7, §8 |
| 8 identity/scope/authorization binding | §2, §7 — including the negative case: a citation resolving to an authorization that does not cover the observed route must not reach `completed` (§5.3) |
| §12 conditions: a decision record cannot carry elements 4, 8, or 9 | §2 |
| §12 conditions: a command record cannot use the decision shape | §2, §6.2 |
| §12 conditions: a decision record whose lifecycle write fails commits nothing | §1.4, §2 |
| §12 conditions: rebuild over a mixed chain reproduces both classes and their order | §4, §6.2 |
| §2 `plan_hash` rule: a pre-plan T22 cancellation record — lifecycle state at the decision recorded, `plan_hash` absent — verifies | §2, §6.2 |
| §2 `plan_hash` rule: a post-plan decision record missing `plan_hash` fails | §2, §6.2 |
| §5.3 completion test: matching intended and observed identities with a non-covering authorization does not reach `completed` | §5.3 |
| 9 fail-closed interruption/ambiguity | §5 |
| 10 reconstruction without duplicate authority | §4, §5 |

Items 11–13 (repository gates, exact-head Tier-2, counted runs) bind the
pull requests and runs, not this document. The repository's required
status-check contexts on `main`, read from the rulesets API on 2026-08-31:
`path-audit`, `attribution-shape`, `CodeRabbit`, `build-and-test`.

## 11. Citation basis

Every FounderOS decision cited anywhere in this contract, audited in
full, with the exact clauses relied on:

- `DEC-20260815-17` — `## Founder Authorization — Phase 4 (Planner Loop)
  (2026-08-31)`: Sections 2 (base pin, boundary), 3 (journal-first
  order), 5 (planner-loop requirements; identity-mismatch and journal
  fail-closed conditions), 6 (scope lists), 7 (stop gate; required-check
  and three-run limbs) — the governing authorization, relied on in the
  preamble and §§1, 5, 9, 10.
- `DEC-20260827-01` — Section 10 (the command-journal ruling this
  contract implements); §2 (BR-Authority Principle, relied on in §1.1);
  §§3.3 and 3.5 with Sections 4–5 (frozen-consumption contract and pins
  at TUI head `7d37a61dcaeaef77c55013c7620deb8445726788`, relied on
  in §4.2).
- `DEC-20260815-11` — the ratified 17-state / 29-event lifecycle and
  T1–T22 transition table with guards, relied on in §7 in full;
  rejection bound to T4/T22 only.
- `DEC-20260815-02` — evidence custody Option A and sole-writer rules,
  controlling, relied on in §§3 and 9.
- `DEC-20260815-08` — the operational-store vs evidence-store split,
  relied on in §3.
- `DEC-20260820-01` — §6 (the direct custody prohibition: "custody
  selection or a third custody domain ... not authorized as a permanent
  custody domain") and §7 (the local-ledger limb), relied on in §3.
- `DEC-20260818-01` — clause 1 (the ruled mint-and-confirm pattern for
  Founder acts at the control plane), relied on in §8.1.
- `DEC-20260815-13` — clause 2 (no CLI command originates an
  authority-bearing act), relied on in §8.1.
- `DEC-20260815-07` — authentication proposals unbound; step-up not
  activated by this contract, relied on in §8.2.

All were read at the pinned controlling FounderOS head
`6f5f4405da40c90028df0c1efefed2f44da65b1c` on 2026-08-31, and the §3/§8
rulings at the Founder ruling comment on PR #11 (2026-09-01) — named
checks, not memory. The lifecycle guard texts quoted in §7 match
`packages/contracts/src/transitions.ts` at this repository's base
`ad23c6e`.

## 12. Founder ruling — terminal semantics for non-dispatch authority acts — [RULED]

**[RULED by the Founder, 2026-09-01, on this PR: option (b), the
decision record class. Option (a) is declined. The operative content is
folded into §§1.2, 2, 5, 6.2, 8.2, and 10; the decision-act write path
is unblocked. A further Founder ruling of 2026-09-01 (v0.14) amended
the class's element set: `plan_hash` is conditional per §2 — required
where a plan exists at the decision, absent where none does. The
option drafts below predate that amendment and are preserved
unrevised. The collision analysis and both option drafts are
preserved below as the record of why this clause exists.]**

**The collision.** The §8 ruling requires the Founder plan decision
journaled before it takes effect. But T5 enters BUILDING and dispatches
nothing, and §5.3 permits `completed` only after `dispatched` with the
observed provider, model, and surface present. A successful Founder
approval therefore has **no legal terminal event** in the closed
vocabulary — the happy path does not exist. This is a collision between
the §8 ruling and a vocabulary designed for dispatched commands: an
authority act that dispatches nothing does not fit a shape built around
dispatch. **T22 (`founder.cancel`) and T4 (`plan.revision_requested`)
carry the same defect** — every §8-class Founder decision act dispatches
nothing, so none can terminate under §5.3 as written; the defect is the
class, not the one transition the review named.

**Option (a) — a control-plane terminal event.** Add `applied` to the
closed vocabulary: a terminal for authority acts executed by the control
plane itself, ordered `journaled` → `applied` (at most once, no
`dispatched` required, no observed execution identity — element 4 for
such acts records the control plane as the executing surface, intent
and observed identical by construction), hash-chained like every event,
committing atomically with its lifecycle event per §1.4.
*Consequences:* the §5 closed enum grows by one member; `verify()` and
rebuild admit a second terminal shape; the element-4 identity rules gain
a named carve-out for control-plane acts; T5, T4, and T22 all terminate
via `applied`; the dispatch-command rules of §5.3 are untouched.

**Option (b) — a decision-record class outside the dispatch
vocabulary.** Journal Founder decision acts as a distinct event class
(`decision`) on the **same chain**: its own required elements (actor
`founder`, the decision, `plan_hash`, `authorization_ref`,
`lifecycle_event_ref`, timestamps), its own projection, with §2's
elements 4, 8, and 9 not applicable to the class.
*Consequences:* the dispatched-command vocabulary is untouched; the
journal carries two event classes on one chain — singularity is
preserved and must be stated (one canonical journal, two record shapes,
never a second journal); rebuild projects two record types; the §1.4
atomic commit boundary applies identically; T5, T4, and T22 are all
`decision`-class records.

Under either option the §8.2 requirement and the §1.4 atomicity stand
unchanged. The choice shapes the closed enum, the rebuild model, and the
identity rules — a contract-shape decision downstream of a Founder
ruling, reserved to the Founder and not made here.

**Disposition (Founder ruling, 2026-09-01, recorded verbatim on this
PR).** Option (b) ruled; option (a) declined, for the ruling's four
stated reasons: §1.4 already draws the boundary and (a) forces an
authority act into a shape defined by exactly the fields it lacks;
carve-outs inside a closed vocabulary are where the next defect lives;
(a)'s carve-out falls on the identity-binding rules, the surface a
review had just breached, which the Founder declined to widen in the
same revision that repairs it; and (b) dissolves the question — a
terminal event is only needed by something with an in-flight period,
and a decision act has none, committing atomically under §1.4 or not
happening. The ruling covers the class: T4, T5, and T22 are all
`decision`-class records. Five conditions ride with the ruling and are
folded normatively: singularity restated (§1.2); the class
discriminator as an explicit field inside the canonical byte input
(§6.2); a decision-class canonical encoding and golden vector over the
one `seq` space (§6.2(d)); §5 closed over command records with the
decision class carrying its own closed element set and elements 4, 8,
and 9 stated as not applicable (§2); and four new §10 cases. The
decision-act write path is unblocked by those landings.

## Changelog

- **v0.15 (2026-09-01):** the resolve-and-cover authorization test
  moves onto `completed` itself, per the Founder ruling posted on this
  PR. A command reaches `completed` only with a prior `dispatched`, an
  observed identity, the observed identity matching the journaled
  intended identity, **and** `authorization_ref` resolving to a valid,
  applicable authorization whose granted scope covers the observed
  `(provider, model, execution_surface)` — on every path, the direct
  equal-route path included. Coverage rules unchanged: set or roster,
  no pair enumeration, silence is not coverage; coverage failure bars
  `completed` (`failed` on proven non-coverage, `unresolved` when
  indeterminate). Reconciliation **inherits** the test — the `resolved`
  clause now applies the §5.3 completion requirement to the observed
  identity, the substitution itself covered, leaving **one copy of the
  test in one place**; two copies drift, which is how this gap opened.
  Finding credit: **Greptile** (P1/security at `22d6cc7`, "Direct
  completion skips authorization coverage"): the direct equal-route
  path required only prior dispatch, an observed identity, and
  identity equality, with route coverage required only for mismatch
  reconciliation. The too-narrow scope came from the Founder ruling of
  05:42:44Z, which placed the test in the reconciliation path — not a
  builder draft; its correction is likewise ruled. §10 gains the
  reproduced case (matching identities, non-covering authorization,
  no `completed`). **Declined in the same round** (Founder
  disposition, with evidence): Greptile's standing T22 pre-plan
  `plan_hash` thread ("Pre-plan cancellation lacks representation",
  P1 filed at `244b9b2`) — stale at `22d6cc7`: it asserts `plan_hash`
  is required on every decision record, false since v0.14, whose §2
  reads "`plan_hash` where a plan exists at the decision" with the
  absent set enumerated (`ROOM_CREATED`, `SCOPED`, `PLANNING`). It was
  correct at `244b9b2` and was taken there as v0.14; dispositioned on
  its thread as already resolved, no revision taken for it.
- **v0.14 (2026-09-01):** `plan_hash` in the decision-class element set
  is now conditional — required where a plan exists at the decision,
  absent where none does — per the Founder ruling posted on this PR
  (2026-09-01). Finding credit: **Greptile** (P1 at `244b9b2`,
  "Pre-plan cancellation lacks representation"): T22 `founder.cancel`
  fires from any non-terminal state
  (`packages/contracts/src/transitions.ts`,
  `anyNonTerminalExcluding('CLOSED_ABANDONED')`), including
  `ROOM_CREATED`, `SCOPED`, and `PLANNING` where no PlanDoc yet exists,
  so the previously unconditional `plan_hash` could not be satisfied by
  a pre-plan cancellation. The element set the finding corrects was
  fixed by the Founder ruling of 2026-09-01 recorded in §12, not a
  builder draft; its correction is likewise ruled, not drafted. Landed:
  §2 (conditional element; the recorded lifecycle state at the decision
  as the positive verifiable fact; no sentinel; no pre-plan sub-class —
  the ruling declines one), §6.2(d) (canonical field-presence encoding
  so present-vs-absent hash unambiguously, vectors for both shapes),
  §10 (two cases: a pre-plan T22 cancellation verifies; a post-plan
  decision record missing `plan_hash` fails), §12 header (amendment
  note; the option drafts are preserved unrevised).
- **v0.13 (2026-09-01):** four line-level fixes, no new sections, no
  reopened clauses. (1) §6.2 "Three serialization contracts" corrected
  to four — (a) through (d) — found by CodeRabbit. (2) "fixed for all
  three" corrected to all four in the same section — the same slip,
  found by the Founder (CodeRabbit had flagged only the first
  instance). (3) The `chain_hash` byte-input rule named only the (c)
  command-class canonical byte sequence, leaving a decision-class row
  with no chain-hash definition in the exact-byte-inputs list — the
  other half of the discriminator condition, found by the Founder;
  neither review bot caught it. It now takes the (c) or (d) canonical
  byte sequence as the row's record class determines. (4) §11's
  U+2026-abbreviated TUI pin replaced with the full 40-character pin,
  found by the Founder by direct grep — it was the file's only
  Unicode ellipsis.
- **v0.12 (2026-09-01):** two Founder rulings (posted on PR #11,
  2026-09-01T05:42:44Z) landed in one revision. **Ruling 1 — §12
  resolved as option (b), the decision record class; option (a)
  declined** for the ruling's four recorded reasons (the §1.4 boundary
  already excludes decision acts from the command shape; carve-outs in a
  closed vocabulary breed the next defect; (a)'s carve-out would widen
  the identity-binding rules in the same revision that repairs them; a
  decision act has no in-flight period, so (b) dissolves the terminal
  question rather than answering it). The ruling covers T4, T5, and T22
  as a class. Its five riding conditions are folded normatively:
  §1.2 singularity restated (one journal, one chain, one `seq` space,
  two record classes); the record-class discriminator as an explicit
  field inside the canonical byte input to the row hash, never inferred
  from absent fields (§6.2); a decision-class canonical encoding with
  its own golden vector over the one `seq` space (§6.2(d)); §5 restated
  as closed over command records, with the decision class's own closed
  element set in §2 and elements 4, 8, and 9 stated as not applicable
  rather than absent by omission (element 1 likewise n/a — a decision is
  not a command — so the §4 command-scoped constraints are class-scoped);
  and four new §10 cases. §12 is retained as a [RULED] record with the
  collision analysis and both drafts preserved. The decision-act write
  path is unblocked. **Ruling 2 — §5.3 reconciliation must resolve the
  authorization, not cite it:** `authorization_ref` must resolve to an
  authorization that exists, is valid, and is applicable to the
  command's repository, scope, and run, whose granted scope covers the
  observed `(provider, model, execution_surface)`; coverage may be by
  set or roster and need not enumerate the intended-to-observed pair
  (the reviewer's "explicitly permits the exact substitution" phrasing
  declined as failing ordinary roster-scoped authorizations for no
  security gain); **silence is not coverage**; non-coverage proven is
  `failed`, indeterminate stays `unresolved`, and a citation alone
  never reaches `completed`. Element 7's note gains resolvability;
  §10's identity/scope/authorization map gains the negative case.
- **v0.11 (2026-09-01):** CodeRabbit round at `283fccd` (three Majors,
  all Founder-confirmed as blocking; the 04:38:24Z Founder merge
  authorization is void under `DEC-20260801-02` and stands unedited as
  the audit record). (1) TAKEN, resolved as option (a): a journal event
  and the lifecycle event created by the same act commit in one Neon
  transaction — the pair or neither — so the §1.4 mismatch rule becomes
  defense in depth rather than the happy path's failure mode; §8.2's
  "before it takes effect" is defined as that atomic commit. Same shape
  as round 4's chain-head finding: "first" now says "atomically."
  (2) TAKEN: the chain head is a schema-enforced singleton — fixed
  `head_id = 1` check constraint, `INSERT`/`DELETE` denied to every
  application role, migrations own the sole genesis insert — the §3
  enforcement-by-grant standard applied to the head. (3) ESCALATED, not
  implemented: §12 drafts both candidate resolutions for the missing
  terminal of non-dispatch authority acts (T5 approval has no legal
  terminal; **T4 and T22 carry the same defect**, stated rather than
  fixing only the named path) — a control-plane `applied` terminal, or
  a `decision` record class on the same chain — with consequences for
  the closed enum, verify()/rebuild, and identity rules, as a Founder
  ruling request. The decision-act write path is blocked until ruled.
  The step-2 closure assessment is re-derived, not carried forward: see
  the PR record.
- **v0.10 (2026-09-01):** Tier-2 round 4 dispositions (CodeRabbit at
  `ab11ae5`, four findings, all Founder-confirmed and TAKEN). (1) MAJOR:
  sole-writer is now enforced by grant to the same standard §3 already
  applied to append-only — dedicated `command_journal_writer` role, sole
  `INSERT` on the events table and sole `UPDATE` on the chain head,
  explicit revocation for every other application role; the name follows
  the corpus's dedicated-writer convention (`evidence_writer` class),
  the repository's own migrations declaring no roles at base. (2) MAJOR:
  the append transaction now verifies the locked head against the
  recomputed event tail before writing and aborts on divergence — a
  named fail-closed condition (§5.1) — so append can never write against
  a stale or corrupted head. (3) MAJOR: the digest algorithm and
  encoding are fixed for `chain_hash`, `envelope_digest`, and
  `plan_hash`: SHA-256, 64-character lowercase hexadecimal, with the
  exact byte input stated for each — following the corpus's existing
  convention for ratified artifact pins (64-char lowercase hex SHA-256)
  rather than introducing a new one; the golden vectors verify against
  these definitions. (4) MINOR: §11 was **audited in full** rather than
  patched — its second completeness miss — and now lists every decision
  cited anywhere in the document with the exact clauses relied on,
  adding the previously missing `DEC-20260818-01` clause 1,
  `DEC-20260815-13` clause 2, `DEC-20260815-17`, `DEC-20260827-01`, and
  `DEC-20260815-11` entries.
- **v0.9 (2026-09-01):** Founder-found correction to the historical
  record, builder-applied. The v0.6 changelog entry still asserted, in
  its own voice and present tense, the false schema premise ("that
  column carries no uniqueness constraint") that v0.8 removed from the
  operative text — a false statement about `migrations.ts` standing
  unmarked in a durable artifact. The entry is **marked, not rewritten**,
  per the same convention as the §11 omission: the sentence is preserved
  as the record of what that revision decided and why, with the true
  constraint named at its source
  (`build_room_events_event_id_unique UNIQUE (room_id, event_id)`,
  `migrations.ts` line 85). No operative clause changes.
- **v0.8 (2026-09-01):** Tier-2 round 3 dispositions (`gemini-3.1-pro`,
  FAIL at `2df2093`, confirmed by two independent executions of the same
  roster reviewer), all four findings TAKEN. (1) MAJOR: the §1.4
  justification for refusing `event_id` — "the live schema places no
  uniqueness constraint on it" — **was factually wrong about the schema
  from v0.4 through v0.7**: `build_room_events_event_id_unique UNIQUE
  (room_id, event_id)` has existed in the live schema throughout. The
  false sentence is deleted, not softened, and `lifecycle_event_ref` is
  redefined as **(`room_id`, `event_id`)** — restoring the originally
  proposed key, constraint-backed and a stable business identifier rather
  than a positional one. (2) MAJOR: §5.3's completion rule now requires
  the observed identity to match the journaled intent; a divergence bars
  `completed` by the vocabulary itself, routing to `failed`/`unresolved`
  with `completed` reachable only through `resolved` citing the governing
  authorization for the substitution — closing §2's fail-closed condition
  in the event rules, not only in prose. (3) MINOR: §11 now names
  `DEC-20260820-01` §6 alongside §7, and the v0.6 changelog entry is
  corrected to say what actually happened (§3's inline text was updated;
  §11 was not) rather than what was intended. (4) MINOR: §8.2's
  live-configuration phrasing is removed; the contract states the
  requirement, and the dated observation of pre-existing optionality
  lives in the Founder ruling comment on PR #11, where dated observations
  belong.
- **v0.7 (2026-09-01):** CodeRabbit follow-up Major at `9e3ee44`, TAKEN:
  v0.6 required locking and advancing a chain-head row while §3 admitted
  only append-only journal tables — the head had no defined home. Defined:
  the singleton `command_journal_chain_head` table in the same database,
  initialized by migration to `seq = 0` and the genesis constant (a
  migration act, separate from event-append rules), mutable only by the
  sole writer inside the append transaction, holding no journal state and
  no authority — `verify()` and rebuild recompute from events alone and a
  disagreeing head is an integrity finding, never adopted. §3's table
  list names it as the one deliberate append-only exception, on its own
  table with its own grants.
- **v0.6 (2026-09-01):** the two Founder rulings recorded, and the four
  CodeRabbit Majors (CHANGES_REQUESTED at `cc5e6b9`) plus its follow-up
  Major at `a4b982c` taken — **which are one theme, not five defects: the
  event model stated its invariants but did not close them.** Immutability
  was declared without an identity-binding event to carry a later-arriving
  identity; the chain was declared without a scope, genesis, or append
  serialization protocol; fail-closed ordering was declared without a
  crash-recovery path across the journal-to-dispatch boundary. The
  identity contradiction's origin is named rather than patched silently:
  it was introduced by the v0.1→v0.4 conversion to event-sourcing, which
  added an immutability rule without reconciling it against the
  pre-existing null-until-it-exists rule — that is what a model change
  costs. Fixes: `identity_bound` one-time event added to the closed
  vocabulary with ordering and hash rules; one global chain with a
  64-zero genesis constant, head-locked transactional appends, and schema
  uniqueness; `command_id` as the end-to-end dispatch idempotency key
  with mandatory dispatch-attempt reconciliation before any retry; the
  direct `journaled`→`failed` path restricted to provably-pre-send
  failures, with cannot-rule-out-contact cases going to `unresolved`
  (now legal pre-`dispatched`) and terminal only via `resolved`.
  `lifecycle_event_ref` is defined normatively as (`room_id`, `seq`) —
  the finding was right that the key was undefined, but its proposed
  `event_id` key is refused: that column carries no uniqueness
  constraint, and constraining it would alter the lifecycle log's schema
  across this contract's own boundary. **That schema premise was false,
  and is corrected at v0.8:** the constraint
  `build_room_events_event_id_unique UNIQUE (room_id, event_id)` is
  declared at `packages/control-plane/src/migrations.ts` line 85, inside
  the same `CREATE TABLE` as the primary key. The sentence above is
  preserved as the record of what this revision decided and why, and
  marked rather than rewritten — the same convention applied to the §11
  omission below. Its reasoning rested on a false reading of the schema;
  v0.8 redefines the key as (`room_id`, `event_id`). Rulings: §3 taken as proposed
  (§1.4 affirmed as ruled text; the `DEC-20260820-01` §6 citation was
  added to §3's inline text — §11 was intended to be updated as well and
  was not, corrected at v0.8); §8.2 taken as
  proposed, scoped to Phase 4 with Phase 5 the revisit point, credential
  ruled as the existing `PHASE3_ADJUDICATION_TOKEN` made
  endpoint-required at `packages/control-plane/src/config.ts` — a
  configuration requirement, not a new secret. The round-2 Tier-2 PASS
  bound to `a4b982c` is void on this push; a fresh round is required at
  this head.
- **v0.5 (2026-08-31):** Tier-2 round 1 dispositions (`gemini-3.1-pro`,
  FAIL at `cc5e6b9`), all three findings TAKEN. (1) MAJOR: `failed` may
  now follow `journaled` directly for pre-dispatch failures, carrying a
  failure classification and no observed identity, so gateway-offline
  and provider-auth failures record as failed instead of masquerading
  as pending; observed identity remains mandatory for `completed`.
  (2) MAJOR: element 2's identities are set-once (null until the
  identity exists, immutable from first recording), resolving the
  contradiction with the elements-1–3 immutability rule; the v0.4
  changelog's "execution identity" conflation is corrected in place
  (unmerged document) to name element 4's provider/model/surface.
  (3) MINOR: the T2 guard quote corrected to the byte-exact
  `reviewer≠builder`. FOUNDER PROPOSAL clauses unchanged in substance.
- **v0.4 (2026-08-31):** review-input disposition (Greptile, advisory),
  TAKEN: element 4's provider, model, and surface identity cannot be
  observed before dispatch, so
  element 4 splits — intended routing identity on `journaled`, labeled as
  intent; observed actual identity on `dispatched`, authoritative and
  immutable once recorded; no `completed` representation without observed
  identity; intended-vs-observed divergence surfaces as the
  authorization's named identity-mismatch fail-closed condition. Elements
  1–3 and 5–7 remain immutable from `journaled`.

- **v0.3 (2026-08-31):** review-input dispositions (Greptile, advisory).
  TAKEN: the chain hash now requires a ratified versioned canonical
  encoding of the **complete event row** — field order, scalar encodings,
  `evidence_refs` in recorded order, chain framing — with golden vectors,
  before any chain-hash implementation (§4.1, §6.2(c)); v0.2 required
  spec-before-hashing only for the envelope and plan digest. TAKEN IN
  PART: the authority-derivation preamble now states this is an
  implementation contract whose entire authority derives from the named
  FounderOS rulings, creating no governance authority, with conflicts
  resolving in FounderOS's favor; the finding's move-to-FounderOS limb is
  DECLINED on the rulings' own text — the journal-first order makes the
  contract implementation step 1 and `DEC-20260827-01` Section 10 names
  the step-1 contract as where store and writer are proposed. RESOLVED
  PREVIOUSLY: the transition-persistence finding was the v0.1 row-model
  contradiction, closed at v0.2 by the event-sourced model.
- **v0.2 (2026-08-31):** four Founder findings applied. (1) Row model
  ruled event-sourced, resolving the v0.1 contradiction between §4's
  DB-enforced append-only rule and §5's mutable dispatch_state — §2 is now
  a projection contract, §5 a closed event vocabulary with ordering
  invariants. (2) §1.4 added: the authority boundary against
  `build_room_events`, per-element, with reference-not-copy and
  mismatch-surfacing rules — co-location is not co-authority. (3) The
  dispatch_state/outcome overlap dissolved by construction: both are
  readings of one event sequence, neither stored. (4) §8.2 rephrased from
  a description of live configuration to a requirement. Citation basis
  (§11) added with the pinned head named. The two [FOUNDER PROPOSAL]
  clauses remain open for ruling; their substance is unchanged.
- **v0.1 (2026-08-31):** initial proposed contract.
