# Build Room End State — design review and target architecture (r1)

**Status:** PROPOSAL. Descriptive, not authoritative. Nothing in this document
authorizes work, spend, provisioning, activation, or merge. Where it disagrees
with a controlling FounderOS decision, the decision governs and this document
is stale until corrected.

**Evidence pins (2026-09-24):**

| Repository | Head | Open PRs |
|---|---|---|
| `founder-os-build-room` | `85f8cf1b3b56bd3c88d46a6590c0327f86b140be` (2026-09-22) | 0 |
| `madventures-tui` | `d7b1851b39813ab4d322b2b59b81f936635f539e` (2026-09-24) | 1 (draft #98, docs only) |
| `madventures-claude-code-environment` | `9606448` (2026-08-13) | 0 |
| Planning package | `source/fable-architecture-implementation-planning-package-v1.0.md` (2026-08-09) | — |

Claims are labeled **[Certain]** (read directly from code, git, or a dated
record), **[Likely]** (strong inference from those sources), or **[Guessing]**
(a proposal or a tentative reading).

---

## 1. Verdict

**What the completed Build Room is.** A governed, provider-neutral software
delivery system with three trust zones. A **cloud control plane** on Railway
and Neon holds the only durable truth: the 17-state build ledger and the
single command journal. A **local Agent Gateway** on the Founder's Mac holds
every provider credential, runs every agent process inside a room it owns,
and signs every piece of evidence. **Founder surfaces** (the `buildroom` CLI,
the `madv-tui` terminal, and a read-only web projector) render projections of
the ledger and relay Founder intents to the control plane, which is the only
place a Founder act is recorded. AI seats (Researcher, Architect, Builder,
Independent Reviewer) move a build from goal to merged PR under exact-SHA
binding, and no agent, gateway, or surface can manufacture Founder authority.
Merge stays a human act on GitHub, corroborated by webhook.

**The material gap.** The product being built has diverged from the August
planning package in three ways that the roadmap does not yet acknowledge:

1. **Two room models exist and are not joined.** [Certain] The control plane's
   room is a 17-state *lifecycle* record minted at `POST /rooms`. The gateway's
   room is a *runtime* record minted by `CreateRoom` over IPC v2, with its own
   occupancy, execution and input-authority axes. No event or field binds one
   to the other. The Builder phase cannot be specified until they are.
2. **The Founder surface was replaced without a replacement design.** [Certain]
   The web tier is deferred (`DEC-20260815-08`). The TUI repo has grown two
   Build Room clients in its place, each fixture-only, using two different
   room-status vocabularies with no mapping between them. Success criterion S6
   (approve from a phone) has no owner.
3. **Throughput is gate-shaped by design, and the end state is undefined past
   Phase 4.** [Certain] Nineteen packages and 71 merged PRs exist. No planner
   loop, no builder execution, no provider adapter, no GitHub App service, and
   no step-up authentication exist. The repository defines phases only through
   Phase 4; the package's Phases 3–6 have not been re-stated against what was
   actually built.

**Recommendation.** Fix the target before spending Phase 5. Adopt §3–§6 below
as the end-state architecture, take the five Founder decisions in §9, and
correct the eleven documentation drifts in §10 in one docs-only PR. None of
that is code; all of it changes what the next code slice should be.

---

## 2. Where it stands today

| Phase | Scope (as ruled) | Status | Evidence |
|---|---|---|---|
| 1 | Pure contracts and ledger (17 states, 29 events, T1–T22, G1–G22) | Complete 2026-08-16 | `packages/contracts`, `packages/ledger` [Certain] |
| 2 | Cloud skeleton: Railway control plane, Neon Postgres, three runs, stop gate | Complete 2026-08-18 | six retained bundles under `evidence/`, two satisfy the gate [Certain] |
| 3 | Gateway enrollment pairing (mint → redeem → confirm), signed session and heartbeat, macOS daemon with Keychain custody, `buildroom` CLI; counted runs CR1–CR3 | Closed 2026-08-31 after an 08-27 reconciliation ruling | README, migration `0003`, `0005` [Certain] |
| 4 | Planner loop, journal-first | Authorized 2026-08-31; steps 1–2 merged (contract v0.17, `packages/journal`, migration `0006`) | README, `docs/command-journal-contract.md` [Certain] |
| 5+ | Builder execution, draft PR, adapters, step-up | Not authorized; named out of scope by the journal contract §9 | [Certain] |

**Side tracks merged since Phase 3** (all fixture-only by their own labels)
[Certain]: Seat Registry V1 and V1.1 gate; Room Runtime Phase 0 proofs and the
Phase 1 acceptance gateway; the OMP evolve pack (seat-output-schema,
redaction, worker-supervisor contract, gateway hooks, quarantine-advisor);
the MiMo pack (completion-gate, checkpoint-writer); the Superlogical pack
(room-status IR, multi-viewer reconnect); spend-broker v0; `CreateRoom` live
room minting.

**What is live** [Certain]: a deployed control plane with the ledger, gateway
registry, Phase 3 run routes and the journal tables; one enrolled gateway
mechanism; nothing that executes an agent.

---

## 3. The completed system

```
FOUNDER SURFACES                CONTROL PLANE (Railway + Neon)        AGENT GATEWAY (Founder's Mac)
──────────────────              ─────────────────────────────         ───────────────────────────
buildroom CLI (5 verbs)   ───►  ledger (build_room_events)   ◄──────  signed session + heartbeat
madv-tui terminal         ───►  command journal (one chain)  ◄──────  room runtime (occupancy lock,
projector web (read-only) ◄───  gateway registry + leases            checkpoint commit, boot/wake)
                                phase-run evidence                    worker supervisor (Bun child)
Founder intents ─────────►      plan-decision endpoint                hooks: seat-policy, output-
(relayed, journaled at CP)      GitHub App service*                   schema, quarantine
                                cost ledger* + reconciler*            redaction + evidence signer
                                projections / SSE*                    worktree manager*
                                                                      provider adapters*
                                                                      Keychain custody (never uploaded)
                                          │                                     │
                                          ▼                                     ▼
                                GitHub (draft PR, checks,             Providers (Claude, Codex, Gemini,
                                rulesets, HMAC webhooks)              Grok, Cursor, Hermes) under the
                                                                      Founder's own accounts
* not yet built
```

**Zone rules, restated from the package and the code** [Certain]:

- The control plane is the single writer to the ledger and the journal. It
  validates schema, actor, guard and SHA before commit, and records rejections
  visibly. It never holds provider secrets and never executes on the Mac.
- The gateway proposes events and never decides transitions. Every message it
  sends is Ed25519-signed under an enrolled identity. It holds credentials in
  the login Keychain via `/usr/bin/security`, with two identity lanes.
- Surfaces render projections and relay intents. The plan decision, and every
  later Founder act, originates at the control plane (`DEC-20260818-01`
  clause 1 pattern; journal contract §8). A surface can never be the record.
- Agents are untrusted executors. Their text is data. Guards never read
  conversation text (INV-6).

---

## 4. Joining the two room models

**Today** [Certain]:

| | Lifecycle room (control plane) | Runtime room (gateway) |
|---|---|---|
| Minted by | `POST /rooms` | `CreateRoom` (IPC v2, Founder-ruled Option A, PR #70) |
| Identity | `room_id` UUID in `build_room_events` | `room_id` minted by the gateway, idempotency key from caller |
| Axes | 17 lifecycle states + overlays | occupancy `ABSENT/PREPARED/OCCUPIED/INTERRUPTED/CLOSED`; execution `EMPTY/LAUNCHING/RUNNING/EXITED/FAILED_CLOSED`; input authority `UNOWNED/HELD/TRANSFERRING/REVOKED` |
| Consumers | run harness, Phase 3 routes | `madv-tui` room client (`JoinRoom`, `FollowRoom`, `TakeoverInput`), `room-status` projection |

**Proposal** [Guessing, offered for ruling]: a runtime room is the execution
locus of exactly one lifecycle room's build, bound at T5 (`plan.approved` →
`BUILDING`). The binding is a journal command record whose payload carries
both ids and the gateway id, committed in the same transaction as T5. The
runtime room's `CLOSED` occupancy is a precondition of T17 (`build.closed`).
The 29-event vocabulary is closed, so this needs either a thirtieth event or
an extension of the T5 payload; either is a contract change and a Founder act.

**Why this shape.** It keeps the ledger authoritative for *what was decided*
and the gateway authoritative for *what is running*, which is the split the
package's trust model already requires. It also gives the TUI's `JoinRoom`
a lifecycle context it currently lacks.

---

## 5. The governed lifecycle (as implemented)

States: `ROOM_CREATED → SCOPED → PLANNING ⇄ PLAN_REVIEW → BUILDING ⇄
BLOCKED_ON_FOUNDER → EVIDENCE_CAPTURE → PUSHED → IN_REVIEW ⇄ REMEDIATION →
CHECKS_VERIFIED → AWAITING_FOUNDER_AUTH → AUTHORIZED → MERGE_CONFIRMED →
CLOSED_DELIVERED`, with `RECONCILING` reachable from any non-terminal state
and `CLOSED_ABANDONED` from any non-terminal state by Founder cancel.

Founder-only transitions [Certain, `packages/contracts/src/transitions.ts`]:
T1 scope capture, T4 plan revision, T5 plan approval (binds `plan_hash` and
scope paths), T7 decision answer, T15 authorization (step-up fresh,
`authorized_sha == head == reviewed_sha`, single-use), T22 cancel.

Void cascade [Certain]: T18 is unconditional. Any push while in
`PUSHED..AUTHORIZED` returns the room to `IN_REVIEW` and retains VOIDED
records. This is the mechanism behind success criterion S3.

The end state changes nothing here. Phases 5–7 *reach* these states; they do
not add any.

---

## 6. Seats

The package named three roles (Planner, Builder, Reviewer). The Seat Registry
V1 names four seats with hash-pinned contracts [Certain, `contracts/seats/`]:

| Seat | Produces | Terminal statuses | Package role |
|---|---|---|---|
| Researcher | Research Packet (path, SHA-256, byte and line count) | `RESEARCH_READY`, `INCONCLUSIVE_EVIDENCE`, `BLOCKED_*` | (new) |
| Architect | Implementation Plan for Founder approval | `PLAN_READY_FOR_FOUNDER_APPROVAL`, `BLOCKED_*` | Planner |
| Builder | Build Report with exact commands and results | `BUILD_READY_FOR_INDEPENDENT_VERIFICATION`, `MATERIAL_PLAN_DRIFT`, `BLOCKED_*` | Builder |
| Independent Reviewer | Verification Report bound to base and head SHA | `SEAT_VERIFIED`, `SEAT_REQUEST_CHANGES`, `SEAT_INCONCLUSIVE` | Reviewer |

In the end state the Architect seat *is* the Planner: its plan is the
`PlanDoc` whose `plan_hash` T5 binds. The Independent Reviewer's independence
gate (distinct provider and model, did not author) is the enforcement behind
G10. `resolveSeat` refuses every request in V1 by design; activation is a
separate Founder act.

**Drift to resolve** [Certain]: the TUI's SeatBar shows `BUILDER`,
`ARCHITECT`, `OPERATOR`. `OPERATOR` is not a registry seat. One vocabulary
should win, and the registry is the ruled one.

---

## 7. A build's life, as the Founder sees it

1. **Open a room.** From the TUI (`room create`) or CLI. The control plane
   captures repo and base SHA (T1). The gateway mints the runtime room,
   `PREPARED`, zero slots.
2. **Seat the room.** Assign Architect, Builder and Reviewer to provider
   connections. The seat-policy gate refuses an ineligible pairing (T2).
3. **Read the plan.** The Architect runs on a read-only checkout at base SHA
   and submits a `PlanDoc` (T3). The plan appears in the TUI's Governance pane
   and the projector. The Founder approves at the control plane's
   plan-decision endpoint with the exact `plan_hash` (T5), authenticated by
   the ruled credential, and the act is journaled before it takes effect.
4. **Watch the build.** The Builder works in an isolated worktree confined to
   approved scope paths. The TUI's Claude pane streams the VT patch. A typed
   decision request or a consequential command pauses the build into the
   DecisionStrip (T6); Alt+Y / Alt+N answer it (T7), and the answer is
   journaled at the control plane, not in the TUI.
5. **Evidence.** The gateway, not the agent, runs the acceptance commands and
   signs the result at the head SHA (T8). The completion gate compares the
   claimed finish against the success contract. Redaction runs on every sink.
6. **Push and review.** The gateway pushes the builder branch with a
   per-operation installation token and opens a draft PR (T9). The Reviewer
   runs in a read-only, credential-free workspace at the exact remote head
   (T10). Blockers send it to remediation (T11, T12); a new head voids the
   round (T18).
7. **Authorize and merge.** With zero blockers, green checks and verified
   evidence (T13), the readiness summary lands in the Founder's queue (T14).
   The Founder authorizes under step-up, bound to SHA and `plan_hash`,
   single-use (T15), then merges on GitHub under their own identity. The
   webhook plus poll corroborate (T16). Evidence and cost freeze; the runtime
   room closes; the room closes (T17).

**Screens in the end state.**

*Terminal (`madv-tui`), wide mode* [Certain for the components; Likely for the
mounted set]:

```
[ BUILDER* ][ ARCHITECT ][ REVIEWER ]        model: claude-… (local pref)
┌ ROOM  buildroom/room-7f3a  ─ OCCUPIED · RUNNING · input: HELD by builder ─ LIVE ┐
│ claude pane (VT patch stream)                                                    │
│ …                                                                               │
└──────────────────────────────────────────────────────────────────────────────────┘
[ antigravity ]  [ governance ]  [ events ]                    ← dock strips
╔ FOUNDER DECISION (1 of 2)  command.queued  npm publish --tag next   Alt+Y / Alt+N ╗
conn:cp+gw  session:… writer#a1b2  pending:2  focus:claude  seat:builder  ledger#4127
```

*Projector (web, read-only, any device)*: one room-status card per room using
the `room-status` IR: occupancy, phase, block reason, evidence refs, and an
`IR_FAULT` banner when the record is malformed. A `completed` record without
evidence renders as `verifying (downgraded)`. In the end state this page also
carries the Founder decision queue, relayed to the control plane's decision
endpoint. That relay is what satisfies S6 without giving the projector any
authority.

*CLI (`buildroom`)*: `enroll`, `status`, `doctor`, `providers`, `tail`. A
sixth verb is a contract change (`DEC-20260815-13`).

---

## 8. Evidence and custody

- **One journal, one chain.** `command_journal_events` with a 64-zero genesis,
  trigger-enforced append-only, written only by `command_journal_writer`.
  `journaled` commits durably before dispatch, or nothing dispatches.
  Lifecycle and journal writes commit in one transaction [Certain].
- **Evidence rungs.** The claim-boundary ladder `prepared → dispatched →
  executed → attested → verified → reviewed → ci → merged`, where each record
  names what it is *not* evidence of. Fixture ceilings stop at `executed`
  [Certain, TUI repo].
- **Custody.** Provider credentials live only in the gateway host's Keychain.
  The control plane holds the GitHub App key and webhook secret. Database
  administration is split from runtime by role (`neondb_owner` in a one-shot
  migration job; `br_app_runtime` at boot with a read-only preflight)
  [Certain, migration `0006`].
- **Spend.** The cost meter is the ruled rule as a function; the spend broker
  mints `api` credentials only under the USD 85 ceiling and routes `oauth`
  around it (Founder ruling 2026-09-13) [Certain].
- **Failures are kept.** Six Phase 2 bundles are retained; four do not satisfy
  the gate and none is deleted [Certain].

---

## 9. Founder decisions required before Phase 5

1. **Room binding.** Rule the lifecycle ↔ runtime binding (§4) and whether it
   is a thirtieth event or a T5 payload extension.
2. **Room-status consumption.** How `madventures-tui` consumes the
   `room-status` IR. The handoff recommends a git dependency pinned by SHA;
   the alternative is to keep vendoring with a drift pin. Then mount
   `RoomStatusBand` in the terminal from the same projection so both
   surfaces speak one vocabulary.
3. **Per-room ceiling comparison.** Inclusive or exclusive
   (`docs/phase-2-known-limits.md` §9). The meter and the ruling disagree.
4. **Step-up authentication.** Bind `DEC-20260815-07` (or an alternative)
   before any T15 can be implemented. Phase 4 reuses
   `PHASE3_ADJUDICATION_TOKEN` and names Phase 5 as the revisit point.
5. **Founder surface for MVP.** Either certify TUI plus projector as the
   surface (recommended; keeps `DEC-20260815-08` intact and reaches S6 via
   the projector relay) or revisit the web tier now.

---

## 10. Documentation drift to correct

Build Room repo:

| # | Where | Says | Reality | Label |
|---|---|---|---|---|
| 1 | `AGENTS.md` spend-broker section | left UNCOMMITTED on `build/spend-broker-v0` | merged as PR #69 (`f031cdf`) | [Certain] |
| 2 | `AGENTS.md`, `packages/spend-broker/README.md` | AE-01 A2 candidate FROZEN (`CHANGES_REQUESTED`) | merged as PR #30 (`736b12b`), fixed in #42; no in-repo record of that verdict | [Certain] |
| 3 | `docs/planning/room-runtime-phase1/AE-01-A2-…` | exactly three files; MUST NOT edit `gateway-daemon/**` | #30 changed five files including `gateway-daemon/src/ipc.ts` (+585) and `room-runtime.ts` | [Certain] |
| 4 | `docs/planning/seat-registry-v1/README.md` | nothing authorizes implementation | V1 (#20) and V1.1 gate (#23) merged | [Likely] |
| 5 | `README.md` Structure | ten packages | nineteen packages | [Certain] |
| 6 | `docs/planning/command-journal/pr2b-storage-architecture-r6.md` | no implementation authority | Tranche A (#27) and B (#54, migration 0006) merged | [Likely] |
| 7 | `docs/command-journal-contract.md` header | Status: proposed | in force for Phase 4 (README acknowledges) | [Certain] |
| 8 | `tsconfig.json` | — | `seat-registry` absent from `include`, compiled transitively | [Likely] |
| 9 | `packages/cost-meter` | `spent+reserved+requested >= ceiling` | ruling reads `spent+reserved >= ceiling` (documented, unfixed) | [Certain] |
| 10 | package §29 | `docs/graph/manifest.json` and `validate-manifest.mjs` in CI | neither exists in the repo | [Certain] |
| 11 | `README.md` | WF-04 record does not carry the 2026-08-17 authorization | self-flagged, still unreconciled | [Certain] |

TUI repo (agent-surveyed, not independently re-verified) [Likely]: README
says nine commands, `cli.ts` registers fourteen; README's "companion spec
§7.1 table" points at the wrong section; README says `start` returns
`no_broker_available`, code returns `live_runtime_not_certified`; `AGENTS.md`
says `BrokerClient`, `reduceLedgerEvent` and `live_runtime_not_certified` do
not exist, all three do; README package tree omits nine packages and three
apps; `RoomStatusBand` and `ApprovalDialog` exist but are not mounted;
`AGENTS.md` freezes `tui/**` during Phase 3A while `tui/room/*` landed under
separate acts.

---

## 11. Roadmap to done (proposal)

The repository rules phases through 4. Below re-states the package's Phases
3–6 against what exists. Each phase ends at a Founder-confirmed stop gate and
ships in its own PRs. [Guessing] on ordering; [Certain] on contents that exist.

| Phase | Deliverable | Exists | Missing |
|---|---|---|---|
| 4 (authorized) | Journal foundation in Neon; planner admission wired; governed Architect loop producing a `PlanDoc`; plan-decision endpoint; three counted runs | journal contracts, vectors, migration 0006, admission fixture | HTTP journal route, storage integration suite, the loop itself, the endpoint |
| 5 | Builder execution in a bound runtime room: worktree manager, scope confinement, command classification and approval (T6/T7), gateway-signed evidence at head (T8), worker supervisor live, completion gate and checkpoint writer wired, redaction on all sinks | supervisor contract, hooks, completion-gate, checkpoint-writer, redaction, Phase 0 proofs | everything live; room binding (§9.1) |
| 6 | GitHub App service: scoped push, draft PR (T9), review rounds in a credential-free workspace (T10–T13), live void cascade, checks verification, step-up authorization (T15), webhook-corroborated merge (T16), closure (T17) | ledger guards for all of it | the service, the reviewer workspace, step-up binding (§9.4) |
| 7 | Real adapters (claude-code first, codex, one API adapter) behind a `ProviderAdapter` contract added to `packages/contracts`; live cost labeling through spend-broker and cost-meter; reconciler; retention; `doctor` completeness; TUI 3B/3C certification and projector live bind | spend-broker v0, cost-meter, `providers` verb (refuses) | the adapter contract and every adapter; surface certification |
| MVP gate | S1–S8 measured on a real allowlisted repo | S3 and S4 have mechanisms; S8 has Phase 0 proofs | S1, S2, S5, S6, S7 |
| Post-MVP | web app if `DEC-20260815-08` is revisited; Linux gateway; concurrent builds; Telegram notifications; Grok and Cursor adapters | — | — |

---

## 12. Credit

The governance shape is the Founder's work, and the record supports naming
it: phase sequencing with Founder-confirmed stop gates (`DEC-20260815-17`);
retaining failed evidence bundles rather than only the passing one; the
2026-08-27 reconciliation ruling that rescinded a premature Phase 3 closure
and named conditions; the 2026-09-01 ruling to reuse an existing credential
for plan decisions rather than mint a new secret; the 2026-09-13
credential-class ruling; the 2026-09-20 Option A ruling for live room
minting; and the ratified deployment authority split. The packages themselves
were built by AI builder sessions on several surfaces (claude-code,
kimi-code-cli, deepseek via ollama-cloud) under those rulings, and reviewed
by CodeRabbit, Gemini advisory reviewers and Tier-2 rounds. This document is
AI-authored under the builder role and carries no authority of its own.
