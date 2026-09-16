# HANDOFF — Room Status IR + projection (Superlogical→MAD Session Operability v0, Lane 1)

- **Act:** FOUNDER ACT — Commission Superlogical→MAD Session Operability v0 (2026-09-15)
- **Branch:** `build/room-status-ir-v0`
- **Base / act-start `origin/main`:** `bcc68b4363d05f7c81949d76d2dd842f7c1c74b4`
- **Source role:** `builder` (founder-directed task assignment, this act)
- **Receiving role:** `independent-reviewer` (review), then Founder (merge is a separate Founder act naming the exact head SHA)
- **Status:** implement + commit + push only. **No merge authorized by this act.**

## Objective

Expose closed, evidence-backed room/agent states so operators are not guessing "still thinking?" — a versioned RoomStatus IR with single-writer publishing, an AE-01 projection adapter, and tests that pin every honesty invariant.

## Evolved-from-Superlogical vs invented

| Mechanism | Provenance |
| --- | --- |
| Server-authoritative durable state read by clients (snapshot/subscribe) | **Evolved from Superlogical** (durable server-owned sessions); here the store is a read model over Gateway-owned facts — Gateway remains sole local authority |
| Multi-participant attach (per-room slot phases) | **Evolved from Superlogical** multi-participant sessions; slot model follows AE-01's "exactly two execution streams" cardinality |
| Agent-aware session state (`agentPhase`, `verifying` as undecided-after-exit) | **Invented (MAD)** — Superlogical has no agent-phase axis; the `EXITED → verifying` honesty rule is MAD |
| Closed block-reason vocabulary (`human_hold`, `completion_gap`, …) | **Invented (MAD)** — deliberately NOT the AE-01 plumbing vocabulary; mapping is total and documented |
| Evidence-ref requirement for `completed` under strict mode | **Invented (MAD)** — enforcement of the commission's "no decorative green" bar |
| `observedSeq` clock-free ordering | **Evolved** from the protocol package's existing purity discipline (no clock, no randomness) |

No Superlogical code, config, or libghostty bytes were vendored or consulted as source. Superlogical is referenced only as the commission's named mechanism source.

## Files changed (exact)

- `packages/room-status/src/vocabulary.ts` — NEW: closed sets (`ROOM_STATUS_IR_VERSIONS`, `ROOM_OCCUPANCY`, `AGENT_PHASES`, `ROOM_BLOCK_REASONS`, `EVIDENCE_REF_KINDS`) + guards
- `packages/room-status/src/status.ts` — NEW: `RoomStatus` IR v1, `parseRoomStatus` (fail-closed, deep-frozen), invariants, `aggregateAgentPhase` precedence, `roomStatusEqual`
- `packages/room-status/src/store.ts` — NEW: `RoomStatusStore` (read-only public surface), `bindPublisher` (one store ⇒ one writer; second bind throws `PublisherAlreadyBoundError`), subscribe/diff read model
- `packages/room-status/src/projection.ts` — NEW: `projectRoomSnapshot` (AE-01 `RoomSnapshotBody` → RoomStatus), total mapping tables typed over the protocol's closed vocabularies
- `packages/room-status/src/index.ts` — NEW: package entry
- `packages/room-status/fixtures/room-status-projection-fixtures.json` — NEW: six synthetic fixture cases (all room ids `fixture-*`; no production occupancy claim)
- `test/room-status-ir.test.ts` — NEW: focused suite (16 tests)
- `tsconfig.json` — added `packages/room-status/src/**/*.ts` to `include`

## Load-bearing decisions

1. **Manifest-less sibling package.** `packages/room-status` carries no package manifest and is not a workspace member (same as `seat-output-schema`, `redaction`): the lockfile is pinned by AE-01 T18 and workspace membership needs its own authorization (Founder workspace/lockfile ruling, 2026-09-05). Owned via root tsconfig include + relative source imports. If the Founder wants a manifest, that is a separate authorization.
2. **`EXITED` → `verifying`, never `completed`.** There is no completion gate on main (checked `origin/main` `bcc68b4`; `build/completion-gate-v0` contains no gate implementation) and `EXITED` carries no success semantic. The projection is structurally incapable of emitting `completed`; only a caller carrying gate/handoff evidence refs can publish it, and strict mode throws without evidence — loudly, no soft downgrade.
3. **Closed MAD block-reason vocabulary** is operator-level (`policy_deny | completion_gap | backpressure | hook_error | human_hold | other_named`). `WAITING_FOUNDER → human_hold`; every AE-01 plumbing fault → `other_named`; the AE-01 name stays in the source snapshot. Mapping tables are total `Record`s, so a future protocol vocabulary addition breaks THIS package's typecheck instead of silently re-interpreting.
4. **Block reason wins over slot aggregation.** A Gateway-level block reason is authoritative even when no execution facts survive (INTERRUPTED + `ADAPTER_HUNG` + zero facts → `blocked`/`other_named`, not a guess).
5. **Interrupted room with no facts → `unknown`** (fail closed); quiet non-interrupted rooms with zero executions → `idle`.
6. **Viewer backpressure is intentionally NOT a room block reason.** Room-level status describes agent work, not viewer transport health; conflating them would lie to operators. (Lane 2 keeps backpressure disconnects truthful at the transport layer.)

## Verification

- Focused: `node --test dist/test/room-status-ir.test.js` → **16/16 pass**
- Full: `node --test dist/test/*.test.js` → **996/996 pass, 0 fail, 0 skipped** (with `TMPDIR=/tmp/bt-buildroom`; see environment note)
- `npm run build` (tsc) clean; `eslint` clean on all new files
- Gates: `gate:secret-scan` PASS, `gate:path-audit` PASS, `gate:attribution-selftest` PASS

### Environment note (pre-existing, not introduced here)

`test/gateway-daemon-lifecycle.test.js` (3 tests) fails on this machine with the default `/var/folders/...` TMPDIR: the daemon socket path exceeds macOS's 104-character `sun_path` limit (`listen EINVAL`). With a short `TMPDIR` the same untouched tests pass 3/3 in ~107 ms. `git diff origin/main -- test/gateway-daemon-lifecycle.test.ts packages/gateway-daemon/` is empty — this branch changes nothing in the daemon. A future act may want the daemon bootstrap to prefer a shorter socket directory; out of scope here.

Founder disposition (2026-09-15, verbatim): "Park: TMPDIR=/tmp/bt-buildroom (or /tmp) for lifecycle tests — separate tiny fix act, not these branches."

## Blast radius

Additive only. New package + new test file + one tsconfig `include` line. No existing module, protocol vocabulary, daemon behavior, lockfile, or CI definition is modified. Nothing here is wired to the live daemon, the projector, or any hook — installing status as UI without evidence remains out of scope per the act.

## Acceptance criteria (from the act) — met

- Enum reject ✔ · snapshot determinism ✔ · blocked+reason ✔ · completed requires evidence_ref under strict ✔
- Single-writer rules ✔ (uniqueness-enforced publisher; frozen snapshots; re-validation at the write path)
- Library API: read snapshot + subscribe/diff suitable for projector (poll or push) ✔
- Fixtures prove enum exhaustiveness ✔ (closed-set membership tests + total `Record` mapping tables pinned to the AE-01 closed vocabularies)
- Dogfood: fixture maps AE-01-style room projection → RoomStatus without claiming production occupancy ✔
- Full suite green ✔ (with the documented TMPDIR environment note)

## Risks / open questions

- `aggregateAgentPhase` precedence (failed > blocked > waiting_approval > running > verifying; all-completed ⇒ completed; mixed idle/completed ⇒ idle; else unknown) is a product judgment — the Founder may want a different precedence; it is one function, one test, cheap to change before merge.
- `roomStatusEqual` uses stable-key-order JSON comparison. Records produced by `parseRoomStatus` always share key order, so this is deterministic today; if hand-built records ever enter (they cannot — write path re-validates), revisit.
- Lane 3 (projector widgets) was NOT commissioned under the act's default SKIP and is not started.

## Next action

`independent-reviewer` review of `build/room-status-ir-v0` head; merge only via a separate Founder act naming the exact head SHA.

## Attribution

```
Role-Id: builder
Actor-Id: GLM-20260915-SUPERLOGICAL-OP-V0
Execution-Surface: claude-code
```
