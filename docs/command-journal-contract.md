# Build Room Canonical Command Journal — Contract v0.7 (PROPOSED)

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
2. There is exactly one canonical governed command history. No planner,
   gateway, adapter, CLI, TUI, provider integration, local process,
   evidence recorder, or other component may establish a second
   authoritative command journal. Local diagnostic logs, provider logs,
   process output, evidence records, and telemetry are not substitutes.
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
     defined normatively as the pair **(`room_id`, `seq`)** — the lifecycle
     log's own declared primary key — never a copy of the lifecycle row's
     content. `event_id` is deliberately **not** the reference key: the
     live schema places no uniqueness constraint on it, so adopting it
     would import the very reconciliation ambiguity this boundary exists
     to prevent, and imposing a new constraint on `build_room_events`
     would alter the lifecycle log's schema, which this contract's own
     boundary forbids. The pair's exact shape is part of the canonical
     event-row encoding (§6.2(c)).
   - A disagreement between the two stores on a shared fact is a
     reconciliation `mismatch`: surfaced, never auto-resolved in either
     direction, and never silently overwritten in either store.
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
| 7 | governing authorization or approval | `authorization_ref` | e.g. the plan-approval record |
| 8 | dispatch state | derived from the latest event (§5) | never a stored mutable column |
| 9 | terminal outcome | derived from the terminal event (§5) | never a stored mutable column |
| 10 | resulting evidence references | `evidence_refs` | pointers into the evidence store; payloads never inlined |
| 11 | timestamps and ordering | `recorded_at`, `seq` | server-generated; sufficient to reconstruct command history |

Any change to the elements above after ratification is a contract
amendment, not a refactor.

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
     chain-head row (current tail `seq` and chain hash), assigns
     `seq = head + 1`, computes the chain hash against the locked tail,
     inserts the event, and advances the head — so concurrent
     control-plane requests serialize and a fork is impossible by
     construction, not merely detectable after the fact.
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
2. **Closed event vocabulary** (one appended row each): `journaled` (the
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
   - `completed` requires a prior `dispatched`; observed identity remains
     mandatory for `completed` (§2).
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
   envelope. Three serialization contracts, each versioned with golden
   vectors and ratified **before** the corresponding hashing
   implementation:
   (a) the normalized command envelope; (b) the plan digest; and (c) the
   **complete event row** the chain hash covers — field presence and
   order, scalar encodings, collection ordering (`evidence_refs` hashed in
   recorded order, never re-sorted), and the chain framing (how the prior
   row's chain hash is combined with the row bytes). Two conforming
   implementations must produce byte-identical canonical forms and
   identical chain hashes for the same events, so a benign serializer
   difference can never masquerade as — or mask — tampering. Hash values
   are generated by implementation against the specs, never hand-authored
   into this document.
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
   hash, timestamps) before it takes effect. **The credential is ruled:
   the existing `PHASE3_ADJUDICATION_TOKEN`.** No new secret —
   `PHASE4_FOUNDER_TOKEN` or otherwise — is created. The enforcing
   configuration surface is `packages/control-plane/src/config.ts`, where
   the token today is optional and resolves to null when absent (minimum
   32 characters, required distinct from `CONTROL_PLANE_TOKEN`, never
   echoed): this contract makes it **required for the plan-decision
   endpoint** as a configuration requirement, not a new credential — with
   the token unset, the plan-decision endpoint refuses and the approval
   path is disabled, fail closed; no fallback to `CONTROL_PLANE_TOKEN` or
   any other credential. `DEC-20260815-07`'s step-up authentication
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
| 8 identity/scope/authorization binding | §2, §7 |
| 9 fail-closed interruption/ambiguity | §5 |
| 10 reconstruction without duplicate authority | §4, §5 |

Items 11–13 (repository gates, exact-head Tier-2, counted runs) bind the
pull requests and runs, not this document. The repository's required
status-check contexts on `main`, read from the rulesets API on 2026-08-31:
`path-audit`, `attribution-shape`, `CodeRabbit`, `build-and-test`.

## 11. Citation basis

The FounderOS decisions this contract relies on in §3 and §8 —
`DEC-20260815-02` (evidence custody, Option A), `DEC-20260815-08` (the
two-store split), `DEC-20260820-01` clause 7 (the local ledger not
authorized as a custody domain), and `DEC-20260815-07` (authentication
proposals unbound) — were read at the pinned controlling FounderOS head
`6f5f4405da40c90028df0c1efefed2f44da65b1c` on 2026-08-31 (named check:
files read at that commit, not from memory). The lifecycle guard texts
quoted in §7 match `packages/contracts/src/transitions.ts` at this
repository's base `ad23c6e`.

## Changelog

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
  across this contract's own boundary. Rulings: §3 taken as proposed
  (§1.4 affirmed as ruled text; the `DEC-20260820-01` citation now names
  §6, the direct custody prohibition, alongside clause 7); §8.2 taken as
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
