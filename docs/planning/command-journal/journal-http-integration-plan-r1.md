# Command Journal HTTP Integration — Implementation Plan, Revision 1

Status: **IMPLEMENTATION PLAN — ADVISORY UNTIL FOUNDER APPROVAL. NO
IMPLEMENTATION AUTHORITY IS CREATED, IMPLIED, OR CARRIED BY THIS ARTIFACT.**

This artifact creates no code, test, PostgreSQL role, credential, token,
permission, GitHub environment, GitHub secret, repository setting, Railway
service, Railway variable, Neon object, migration, branch, commit, or PR.

Work ID: `BR-JOURNAL-HTTP-INTEGRATION-PLAN-R1`
Seat: `br-architect` (Plan Authority; no approval, build, operate, merge,
release, or risk-acceptance authority)
Next role: **Founder disposition of §3 and §5 (the open architecture
question and the preconditions this plan does not resolve), then a
separate exact-SHA implementation authorization, then Builder.**

---

## 0. Controlling inputs and their hashes

Every hash below was recomputed live in this session with `shasum -a 256`
against the path shown, at repository HEAD `524186fae290fec7cc5992ce6304f5ce3c2b2ae9`
(`origin/main`, fast-forwarded into the local branch this session; no local
commit exists ahead of it). No hash is carried from the prior session's
memory or from a document's own citation of itself.

| # | Input | Path | SHA-256 |
|---|---|---|---|
| I-1 | Command journal contract | `docs/command-journal-contract.md` | `eaeb61789dcb40090e2384c04405f2b1a6b475c071bbf4e0cb50787cd5193e52` |
| I-2 | Storage architecture (frozen, r6) | `docs/planning/command-journal/pr2b-storage-architecture-r6.md` | `658daa9c0194d5f56d7506fb8ade05d24d413cd08b106a067ff9100ce5815954` |
| I-3 | r6 status note (Tranche A/B landed) | `docs/planning/command-journal/pr2b-storage-architecture-r6-STATUS-NOTE-20260924.md` | `9c84dfc37012971bd03b5b4a21311e5831e29d8a57ef7ebf8d61138eed6853ba` |
| I-4 | Build Room end-state review r1 | `docs/planning/build-room-end-state/build-room-end-state-r1.md` | `f02c8efbfee22769662da673f83b86857acbcf74eb1a0c2eb14f50f4191c898b` |
| I-5 | End-state r1 correction note (2026-09-25) | `docs/planning/build-room-end-state/build-room-end-state-r1-CORRECTION-NOTE-20260925.md` | `a5b5629b06af821ef05f9d729def356a3970da28dadac4b22de96a7b8ad5f123` |
| I-6 | Repository README | `README.md` | `88a8d22961bb6421e49b06ad66338a8b1f10e04d6ffaf6cbf79926ad7aa30974` |
| I-7 | Repository conduct rules | `AGENTS.md` | `1d63e2c81f89a2c0adbe6fa734c896d4e73d1771617074b93ced4deeedae2957` |
| I-8 | Phase 2 known limits ledger | `docs/phase-2-known-limits.md` | `b27512264df8a6f5555aaaeed0c8cc7d234f74cc6e78493cf32ac0d095cba19a` |
| I-9 | `packages/journal` dispatch (§7.2 proof) | `packages/journal/src/dispatch.ts` | `b97c54ababaa95ae19dc0a21f08b9c2a44bda7eac664b688d4844a7b463282c9` |
| I-10 | `packages/journal` store (§7.1 proof, in-memory) | `packages/journal/src/store.ts` | `e2f93e211b93446a3d390391c09a10925f46b42bb9559afe5df63a606b91d371` |
| I-11 | `packages/journal` public export surface | `packages/journal/src/index.ts` | `c727a6f2f90471cd6cf5ecca92b13fcaf737cf265341f740d478c7697fdaa023` |
| I-12 | `packages/journal` canonical row encoder | `packages/journal/src/event-row.ts` | not tabulated as a whole file; the two clauses cited in §3 and §4.2 were read directly and are quoted verbatim there |
| I-13 | Migration `0006` (SQL append routine + grants) | `packages/control-plane/src/migrations.ts` | `5c6e6862d1adb0aa2aadadb9d56e8958b1ab3eea165009b5e837fa766d07b7f7` |
| I-14 | Route-pattern precedent (PR #74) | `packages/control-plane/src/gate-run-routes.ts` | `bb489d76ab26d61275cd1eb4945fb60fbe0c92d82de503feb28b9982fbb26019` |
| I-15 | Store-pattern precedent (PR #74) | `packages/control-plane/src/store.ts` | `8bd5ea60e315b6d8d1782745ffaea28befeb9d760fd6bc1bc075a552bb1b58ec` |
| I-16 | Boot preflight (privilege-audit status) | `packages/control-plane/src/schema-preflight.ts` | `48348962d58565ecf42c6fd3bddcca21784a6f067a0f8bc2a99275e64164b825` |
| I-17 | Boot sequence | `packages/control-plane/src/main.ts` | `00d00b407ecc3dffa400bc07e383740548b2f778f6f74cee037a079cb77837d0` |
| I-18 | Journal storage integration proofs | `test/journal-append-atomicity.storage.test.ts`, `test/journal-authority.storage.test.ts` | not tabulated; both read in full and cited in §2 and §4.3 |

---

## 1. What this plan is, and what it is not

**Scope.** `README.md`'s own status line for Phase 4 fixes the implementation
order: *contract → serialization/golden vectors → journal foundation
implemented and tested → integrate the already-authorized consumed
capabilities → governed planner loop → integrated-lifecycle testing → counted
runs.* The first three rungs are done. `README.md` §"Not done" names the next
rung exactly: **"No production TypeScript caller of `command_journal_append`
exists (only the storage tests invoke it)"**, and the 2026-09-24 status note
(I-3) adds that no HTTP journal route exists in `packages/control-plane`
either. `build-room-end-state-r1.md` §11's Phase 4 row lists the same gap
under "Missing": *"HTTP journal route, ... the loop itself, the endpoint."*
Its correction note (I-5, C3) narrows that row by one item — the storage
integration suite it also listed as missing in fact already exists on
`main` — but leaves the HTTP route, the loop, and the plan-decision endpoint
standing as missing, unchanged.

This plan's scope is **only** the first of those three: an HTTP-reachable
production caller of `command_journal_append`, inside
`packages/control-plane`. It is not:

- **The governed planner loop.** `README.md`'s fixed order places the loop
  *after* this rung. No loop exists to call the route this plan proposes;
  its only callers at merge time would be its own test suite, exactly as
  `gate-run-routes.ts` had none but its own harness at merge (I-14, I-15).
- **The plan-decision endpoint (T5).** `docs/command-journal-contract.md`
  §8-area text (I-1, lines ~547-562) describes a distinct Founder-authenticated
  plan-approval endpoint, gated on a credential ruling that is itself a named
  open Founder decision (`build-room-end-state-r1.md` §9 item 4). This plan
  does not touch it.
- **Tranche C or Tranche D.** Defined and named in `pr2b-implementation-plan-r1.md`
  and restated in `README.md`'s "Not done" line: Tranche C is the
  administrative migration workflow that applies a migration to production
  Neon (`.github/workflows/db-admin-migration.yml`, which does not exist at
  this HEAD); Tranche D is the runtime cutover of the control plane's live
  `DATABASE_URL` identity to `br_app_runtime`. Both are Founder
  provisioning/custody acts under `AGENTS.md`'s approval gates ("Provisioning
  infrastructure", "Changing the repository's security posture"), squarely
  outside `builder`'s authority and outside this plan. §2 explains why both
  matter to this plan anyway.

---

## 2. Preconditions this plan depends on and does not resolve

**P-1: migration `0006` is not applied to production Neon.** The Founder
stated this directly, in session, on 2026-09-25, recorded in
`build-room-end-state-r1-CORRECTION-NOTE-20260925.md` (I-5, §C1). That note's
own reasoning holds: merging a migration's definition (`packages/control-plane/src/migrations.ts`,
I-13) is not applying it; the only production application path is the
one-shot admin runner `packages/control-plane/src/migrate-cli.ts`, which is a
Tranche C act. Consequence for this plan: `command_journal_events`,
`command_journal_chain_head`, and the `command_journal_append` routine
**do not exist in production** as of this writing. A route this plan builds
cannot be exercised against production until a Tranche C act applies `0006`
there — an act this plan does not authorize, perform, or schedule.

**P-2: the runtime cutover to `br_app_runtime` (Tranche D) is not done.**
Same correction note, §C2, backed directly by code: `packages/control-plane/src/schema-preflight.ts`
(I-16) declares `PrivilegeAuditStatus = 'pending_cutover'` with no other
value, and `packages/control-plane/src/main.ts` (I-17) states the privilege
audit "must not block boot while the documented owner-class runtime is in
use," becoming a hard failure only after the Tranche D cutover. Consequence:
even after P-1 clears, migration `0006`'s grants (I-13, statements 10-11)
revoke `PUBLIC` and grant `EXECUTE` on `command_journal_append` to
**`br_app_runtime` only**. Whatever identity the deployed control-plane's
`DATABASE_URL` currently carries, it is — by the correction note's own
finding — not yet `br_app_runtime`. A caller this plan builds, deployed
before Tranche D completes, will fail closed in production with a
permission-denied error, regardless of how correctly it is written.

**What this plan can do despite both.** Neither precondition blocks
*building and proving* this rung today. `test/journal-authority.storage.test.ts`
and `test/journal-append-atomicity.storage.test.ts` (I-18) already provision
their own exclusively-owned, disposable Postgres instance, run the full
canonical migration sequence through `0006` on it, and authenticate a second
connection as `br_app_runtime` under a per-run ephemeral password set by the
fixture's own superuser (I-18, header comment) — i.e., the exact roles and
grants this plan's caller needs already exist, provably, in a fixture the
Builder can extend. This plan's code, and its own test suite, can be written,
merged, and CI-proven against that fixture with **zero dependency on P-1 or
P-2 clearing first.** What cannot happen first is a live deployment of the
route that actually succeeds end-to-end against production — that is
downstream of Founder acts this plan does not perform. The plan doc for
those acts, if and when commissioned, is separate from this one.

---

## 3. Open architecture question: extend `packages/journal`'s dispatch abstraction, or bypass it

`README.md`'s own gap description bundles "a production caller" and "an HTTP
route" together, but does not say *how* the caller reaches the database. Two
paths exist, and choosing between them is an architecture decision this plan
poses rather than makes — consistent with `br-architect`'s seat having plan
authority and no approval or build authority.

### 3.1 What "wrap the existing abstraction" would actually require

`packages/journal/src/dispatch.ts`'s `dispatchGovernedCommand` (I-9) is the
package's own sole fail-closed entry point (§7.2 proof) — but it is wired to
one concrete class, not an interface:

- `packages/journal/src/store.ts` (I-10) declares `let ACTIVE_JOURNAL:
  MemoryCommandJournal | null = null;` — typed to the concrete
  `MemoryCommandJournal` class, not to any `CommandJournal` interface. No
  such interface is exported from `packages/journal/src/index.ts` (I-11).
- `MemoryCommandJournal`'s own constructor self-registers into that module
  singleton (`if (ACTIVE_JOURNAL !== null) throw ...; ACTIVE_JOURNAL =
  journal;`) — there is no separate `setActiveJournal(...)` entry point a
  different backing implementation could call instead. The only other
  mutator, `resetActiveJournalForTests`, is deliberately not re-exported
  (I-11's own comment: re-exporting it "would undercut the §1 claim this
  package makes").
- `dispatchGovernedCommand` calls `getActiveJournal()` unconditionally and
  throws `journal_unavailable` if it is `null` (I-9, lines 157-163). It takes
  no journal instance as a parameter.

So "wrap the abstraction with a `PostgresCommandJournal`" is not a matter of
writing a new class against an existing seam — no such seam exists. It would
require modifying `packages/journal/src/store.ts` itself: introducing an
interface, widening `ACTIVE_JOURNAL`'s type, and giving a Postgres-backed
implementation a way to register itself the way `MemoryCommandJournal` does.
That is a change to package files whose §7.1-7.3 proofs are already ratified
and merged, not an additive change beside them.

Running an in-process `MemoryCommandJournal` as the control-plane's *actual*
production journal is not a serious alternative: it holds no state across a
restart and no state shared between horizontally-scaled instances, which
defeats the entire reason `docs/command-journal-contract.md` §3 rules the
Postgres locus (I-1) in the first place. So Option W below means *extending*
the package, not *reusing it unmodified as-is*.

### 3.2 Option W — Wrap: extend `packages/journal` with a Postgres-backed implementation

Add a `CommandJournal` interface capturing `MemoryCommandJournal`'s
public shape, widen `ACTIVE_JOURNAL`'s type to it, add a way for a
Postgres-backed implementation to install itself, and write a
`PostgresCommandJournal` (new module, new Postgres dependency the pure
`packages/journal` package does not currently carry). The HTTP route then
calls `dispatchGovernedCommand` exactly as any future in-process caller
would.

- **Reuses** the literal, already-tested §7.2 fail-closed proof: "journals
  first, permit only after `journaled` is durably committed" becomes true of
  the production path by construction, not by a second implementation
  aiming for the same property.
- **Costs**: a change to already-ratified, independently-reviewed package
  internals (the same package whose Tranche B design needed an independent
  architecture review before implementation, per `pr2b-implementation-plan-r1.md`
  I-2/I-4 citations in that document). By this repo's own demonstrated
  pattern, a change of that shape would plausibly need a review round of its
  own before a Builder touches it.

### 3.3 Option B — Bypass: a direct `packages/control-plane` caller, `store.ts`-pattern

Add an HTTP route and a `PostgresLedgerStore` method (or a sibling store)
that calls `command_journal_append` directly, exactly as `appendGateRun` /
`gate-run-routes.ts` (I-14, I-15) already do for the persisted gate-run
sequence — reusing `packages/journal`'s **pure encoders only**
(`encodeCommandEventRow`, `envelopeDigest`, `chainHash`, `GENESIS_CHAIN_HASH`
from I-11), never `dispatch.ts` or `store.ts`'s stateful proof code.

- **This is not hypothetical** — it is already proven to work.
  `test/journal-append-atomicity.storage.test.ts` (I-18) imports exactly
  those four pure exports from `packages/journal/src/index.js`, builds a row,
  and calls `command_journal_append` over a real `pg` connection
  authenticated as `br_app_runtime`. Productionizing this plan's caller is
  extending that already-working pattern into `packages/control-plane`, not
  inventing a new one.
- **Reuses** the migration's own stated design intent: `migrations.ts`
  (I-13)'s comment on the append routine is explicit — *"`packages/journal`
  remains the sole encoder and vector source (draft §9: 'no alternate
  journal implementation')"* — which this option honors literally: one
  encoder, `packages/journal`; one production writer path, SQL.
- **Costs**: does not reuse `dispatchGovernedCommand`'s literal fail-closed
  *proof* — a new, narrower fail-closed guarantee ("this HTTP handler does
  not answer success before `command_journal_append`'s row is committed")
  has to be written and tested again at the control-plane boundary, even
  though the property it establishes is the same one §7.2 already proved for
  the in-memory case.

### 3.4 Recommendation (advisory; Founder disposition required)

Lean Option B. Reasons: it touches none of the already-ratified `packages/journal`
proof code; its core mechanism is not proposed but already merged and
running in `test/journal-append-atomicity.storage.test.ts`; and it matches
this repository's own recent precedent (PR #74's gate-run persistence) file
for file — new route module, new store methods, same token guard, same
`asyncRoute`/`answerStoreFailure` shape. Option W is not wrong, but its cost
(reopening ratified package internals) is disproportionate to what this rung
needs, unless a future rung's requirements (e.g., the governed planner loop
itself, which may want in-process dispatch semantics for reasons this plan
cannot see yet) make the wrap unavoidable.

This is offered as a recommendation from a seat with no approval authority.
Given this repository's pattern of requiring independent architecture review
before a comparably-shaped storage decision (Tranche B), the Founder may
want the same bar applied here before naming either option as the
implementation base.

---

## 4. Design sketch if Option B is authorized (non-binding)

Offered only to make §3's tradeoff concrete, not as a spec Builder should
treat as settled — that requires the Founder act named in §3.4 and §6.

### 4.1 New files, by direct analogy to PR #74

| Role | Precedent (I-14/I-15) | Proposed |
|---|---|---|
| Route module | `gate-run-routes.ts` | `journal-routes.ts` |
| Store methods | `appendGateRun` / `listGateRuns` on `PostgresLedgerStore` | `appendCommandEvent` / `listCommandEvents` (or a sibling store, if journal isolation is preferred — a second open question, not resolved here) |
| Store errors | `GateRunStoreUnavailableError` (→503) / `GateRunConflictError` (→409) | `JournalStoreUnavailableError` (→503) / a class for the seq-race case (§4.2) |
| Server wiring | `server.ts` imports `gateRunRouter` (I-15, line 30) | analogous import/mount for a `journalRouter` |

### 4.2 A concurrency hazard specific to this routine, not present in `appendGateRun`

`appendGateRun`'s sequencing is a single `INSERT ... SELECT COALESCE(MAX(seq),0)+1`
statement — self-contained, no read-then-write gap. `command_journal_append`
is different by design: the **caller** supplies `p_seq`, so the caller must
first read the current head (`SELECT seq FROM command_journal_chain_head
WHERE head_id = 1`, which `br_app_runtime` has `SELECT` grant for per
migration `0006` statement 12) and compute `head + 1` before calling the
routine. Between that read and the call, a concurrent append can advance the
head first.

The routine (I-13, lines 1508-1518) raises `ERRCODE = 'integrity_constraint_violation'`
(SQLSTATE `23000`) for **three different conditions**, and gives the caller
no other structured signal to tell them apart:

1. `"seq % is not the next position"` — a benign race with another writer;
   retryable (re-read head, retry).
2. `"chain head divergence from events tail"` — a real integrity finding;
   must not be retried or swallowed.
3. `"chain head row is absent (integrity finding)"` — likewise a real
   integrity finding.

All three share one SQLSTATE, so the caller can only distinguish them today
by matching the exception's message text — fragile, but it is what the
routine currently gives. This plan names it as an implementation requirement
(the caller must not treat all three alike) and a candidate follow-up (a
later migration could give condition 1 its own SQLSTATE, distinct from 2 and
3), which is a schema change and out of this plan's own scope.

A second, sharper hazard: the canonical row bytes the caller builds
(`encodeCommandEventRow`, per `packages/journal/src/event-row.ts`) embed
`seq` as a required field of the encoding itself (`TAG_SEQ`, validated by
`isCanonicalSeq`) — the SQL routine does not cross-check that the `seq`
inside `p_row_bytes` matches `p_seq`; it trusts the caller. **A retry after
condition 1 must re-encode the row with the new `seq`, not resubmit the same
bytes with a bumped `p_seq` parameter** — doing the latter would persist a
row whose own canonical content disagrees with the position it was inserted
at. This plan requires a test for exactly that case, in the shape of the
existing atomicity suite's head-divergence-rollback case (I-18).

### 4.3 Route shape (illustrative only)

`POST /journal/commands` (append one command-class event; body shaped like
`GovernedCommandRequest` minus the server-assigned `seq` and `recordedAt`,
mirroring `dispatch.ts`'s own field split, I-9) and `GET /journal/commands`
or `/journal/events` (read, for a future verify/projection consumer), behind
the same shared token guard `gate-run-routes.ts` and the room routes already
use (`deps.requireToken`, I-14). Both are illustrative; the exact shape is
Builder-and-review territory once §3 is dispositioned, not fixed here.

---

## 5. What this plan does not decide

- Whether the route's first real caller is the governed planner loop or
  something narrower built expressly to prove this rung — `README.md`'s
  fixed order places the loop after this rung, so at merge time this route
  would have no caller but its own test suite, same as `gate-run-routes.ts`
  had at its own merge.
- Whether the store method lives on `PostgresLedgerStore` or a dedicated
  journal store class — noted as open in §4.1, not resolved.
- §3's wrap-vs-bypass question itself.
- Any Tranche C or Tranche D act (§2).
- The plan-decision endpoint's design (§1) — a distinct, separately-gated
  piece of Phase 4.

---

## 6. Next role

Founder disposition of §3 (which option) and acknowledgment of §2's two
preconditions (which this plan does not resolve and does not schedule) is
the next act. Only after that does a separate, exact-SHA implementation
authorization become possible, naming the chosen option and the base SHA —
per this repository's own rule that no implementation authorization may name
only a branch. Builder work begins only under that authorization, not under
this document.
