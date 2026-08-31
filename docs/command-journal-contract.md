# Build Room Canonical Command Journal — Contract v0.3 (PROPOSED)

Status: **proposed** — Phase 4 journal-first implementation order, step 1
("establish the command-journal contract and invariants"). Two clauses are
Founder rulings brought as builder proposals on the `DEC-20260818-01`
pattern and are marked **[FOUNDER PROPOSAL]**; no write-path or
approval-path code is implemented before those rulings. Everything else
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
     corresponds to a lifecycle transition carries a
     `lifecycle_event_ref` (`room_id` + that log's event identity) —
     a reference, never a copy of the lifecycle row's content.
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
relationship elements below. Identity-bearing fields (elements 1–7) are
carried on the command's first event (`journaled`) and are **immutable for
the command**: a later event for the same `command_id` either omits them or
must carry byte-identical values — a divergence is a chain-integrity
failure, not an update.

| # | Ruled element | Field(s) | Notes |
|---|---|---|---|
| 1 | command identity | `command_id` | dedicated `cmd_` namespace; generator never shared with another kind |
| 2 | room / run / execution identity | `room_id`, `run_id`, `execution_id` | where applicable; null only before the identity exists, never backfilled with a guess |
| 3 | actor and role | `actor_id`, `role_id` | registry-valid values only |
| 4 | actual provider, model, execution surface | `provider`, `model`, `execution_surface` | recorded truthfully at dispatch from observed identity, never from configuration intent |
| 5 | repository and governed scope | `repository`, `scope_ref` | the run's immutable scope input |
| 6 | authorized command / normalized envelope | `command_envelope`, `envelope_digest` | §6 normalization; raw commands that would expose secrets are never stored |
| 7 | governing authorization or approval | `authorization_ref` | e.g. the plan-approval record |
| 8 | dispatch state | derived from the latest event (§5) | never a stored mutable column |
| 9 | terminal outcome | derived from the terminal event (§5) | never a stored mutable column |
| 10 | resulting evidence references | `evidence_refs` | pointers into the evidence store; payloads never inlined |
| 11 | timestamps and ordering | `recorded_at`, `seq` | server-generated; sufficient to reconstruct command history |

Any change to the elements above after ratification is a contract
amendment, not a refactor.

## 3. Storage locus and sole writer — [FOUNDER PROPOSAL]

**Proposal: the journal lives in the Build Room's existing Neon-hosted
Postgres as dedicated append-only journal tables, and the sole writer is
the Build Room control plane through a single journal module.**

- Tables: `command_journal_events` (one appended row per command event,
  §5) plus its hash-chain column(s); no other table or component holds
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
plane, and `DEC-20260820-01` clause 7 already declined to authorize the
local ledger as a custody domain. The Founder may nevertheless rule the
alternative; this clause takes effect only on the Founder's ruling.

## 4. Append-only and tamper evidence

1. Journal event rows are hash-chained: each row's chain hash covers its
   canonical complete-row serialization (§6.2(c)) framed with the prior
   row's chain hash. `verify()`
   over the chain detects tamper and divergence. Because the model is
   event-sourced (§5), no row is ever updated or deleted — database-layer
   enforcement (no `UPDATE`/`DELETE` for any application role,
   trigger-enforced) and the chain protect the same invariant, and
   reconstruction replays events in `seq` order.
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
   pre-dispatch record, carrying §2 elements 1–7), `dispatched`, then
   exactly one of `completed` | `failed` | `unresolved`, and — only after
   `unresolved` — `resolved` (carrying the reconciled terminal
   determination, `completed` or `failed`, with its reconciliation
   evidence under the consumed 3.5 semantics: `reconciled` / `ambiguous` /
   `mismatch`, where `ambiguous` never resolves silently).
3. **Ordering invariants** (enforced, and verified on rebuild):
   `journaled` first and exactly once per `command_id`; `dispatched` at
   most once, only after `journaled`; exactly one of
   `completed`/`failed`/`unresolved`, only after `dispatched`; `resolved`
   only after `unresolved`, at most once; no event after
   `completed`/`failed`/`resolved`. A sequence violating these is a
   journal-integrity failure.
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
   (guard: roles assigned; reviewer ≠ builder; gateway online), T3
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
2. **[FOUNDER PROPOSAL] Authentication of the Founder at the control plane
   for the plan decision, stated as a requirement, not a description of
   current configuration: the plan-decision endpoint shall require a
   Founder-held control-plane credential — the same class of credential
   posture the Phase 3 counted runs operated under — and shall
   additionally require the exact `plan_hash` being decided, with the act
   journaled (actor `founder`, the decision, the hash, timestamps) before
   it takes effect.** `DEC-20260815-07`'s step-up authentication remains
   an unbound proposal and is not activated by this contract.
   **Alternative considered and not proposed:** a dedicated Founder
   Ed25519 keypair signing each decision payload (the gateway-identity
   pattern applied to the Founder). Stronger cryptographic binding, more
   custody surface; deferred unless the Founder rules it. This clause
   takes effect only on the Founder's ruling.

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
