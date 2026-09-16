# HANDOFF — Multi-viewer reconnect / attach operability (Superlogical→MAD Session Operability v0, Lane 2)

- **Act:** FOUNDER ACT — Commission Superlogical→MAD Session Operability v0 (2026-09-15)
- **Branch:** `build/multi-viewer-reconnect-v0`
- **Base / act-start `origin/main`:** `bcc68b4363d05f7c81949d76d2dd842f7c1c74b4`
- **Source role:** `builder` (founder-directed task assignment, this act)
- **Receiving role:** `independent-reviewer` (review), then Founder (merge is a separate Founder act naming the exact head SHA)
- **Status:** implement + commit + push only. **No merge authorized by this act.**
- **Lanes:** landed independently of Lane 1 (`build/room-status-ir-v0`) — no cross-branch dependency; RoomStatus transition emission on attach/detach was the act's OPTIONAL item and is deliberately NOT wired here.

## Objective

Prove and harden: server-authoritative room survives client disconnect; multiple viewers attach without forking work; detach ≠ interrupt; replacement ownership holds (old socket, dead or alive, never steals the new binding); backpressure disconnects stay truthful.

## What was already proven on main (reproved here as focused tests)

| Behavior | Existing pin | New focused proof |
| --- | --- | --- |
| Reconnect with valid capability resumes the SAME Gateway-minted identity | r4.1 §5; XG1 (acceptance) | R1 |
| Old socket death without leave never detaches the replacement | XG1 | R4 (second half) |
| Occupied-room reconnect is LIVE_REATTACH, missed range → explicit Gap + ring fill | runtime tests (C/F slices) | R1 |
| Second viewer attach coexists | runtime tests (B slice) | R2 |
| Detach ≠ interrupt (viewer leaving never stops occupancy/executions) | AT-R4-01 | R3 |
| Backpressure: Gap then DISCONNECTED_BACKPRESSURE, source and siblings unaffected | R5 slices + runtime E | R5 |

## Gap found and hardened (the one code change)

**Finding:** `ConnectionState.pump()` drained the viewer's shared runtime outbox without checking viewer OWNERSHIP. The ownership map (`claimViewer`/`ownerOf`/`releaseViewer`, R5 §5) protected the close path (only the owner's close calls `viewerQuit`) — but while BOTH sockets were alive across a replacement, `deliverRoom` pumped the superseded connection too, and whoever pumped first drained frames that belonged to the owner binding. The XG1 test on main did not catch this because it destroys the old socket BEFORE the replacement joins (acceptance `XG1`, lines 1170–1202).

**Hardening** (`packages/gateway-daemon/src/ipc.ts`, `pump()`): a superseded connection — one whose (room, viewer) binding is currently owned by a different connection — returns immediately without draining. One guard, one comment. A stale socket keeps answering only its OWN requests; it can no longer steal the new binding's delivery. TDD evidence: R4 is RED on the unhardened tree (stolen frame = the owner's patch), GREEN after the guard; all pre-existing phase1 suites (runtime, ipc, protocol, acceptance incl. T17/T18 and the R5 slices) stay green (69/69).

**Known boundary, NOT changed (documented risk):** capabilities remain bearer tokens at the RUNTIME layer (r4.1 §5 — a surviving join re-presents the same capability). A superseded socket that still holds the capability can still issue runtime verbs (e.g. `LeaveRoom`, `InputFrame` within the lease epoch) until the epoch/occupancy moves. Fixing that means capability rotation on replacement — an authority-semantics change needing its own design and Founder decision; out of scope for "tests + minimal code".

## Files changed (exact)

- `packages/gateway-daemon/src/ipc.ts` — 1 guard added in `pump()` (superseded-connection check, 7 lines incl. comment)
- `test/multi-viewer-reconnect.test.ts` — NEW: 5 focused proofs (R1 reconnect+Gap+fill, R2 dual-viewer, R3 detach-isolation, R4 replacement ownership both-alive + old-death, R5 truthful backpressure + ring retention)
- `docs/planning/superlogical-evolve-v0/HANDOFF-multi-viewer-reconnect.md` — NEW (this file, incl. attach contract)

## Verification

- Focused: `node --test dist/test/multi-viewer-reconnect.test.js` → **5/5 pass**
- Phase1 regression: ipc + runtime + protocol + acceptance-gateway (incl. **AE-01 T17/T18** and all R5 slices) → **69/69 pass**
- Full: `node --test dist/test/*.test.js` → **985/985 pass, 0 fail** (`TMPDIR=/tmp/bt-buildroom`; the 3 gateway-daemon-lifecycle tests need a short TMPDIR on this Mac — pre-existing 104-char `sun_path` limitation, see the Lane 1 handoff's environment note; this branch changes nothing in the daemon lifecycle)
- `npm run build` clean; `eslint` clean on changed files; `gate:secret-scan` PASS; `gate:path-audit` PASS

## PR #42 non-scope (commission ordering)

PR #42 (`builder/ae01-run02-harness-correction-r1`, still OPEN) owns the Run02 harness viewer-gate: `test/support/phase1-acceptance-gateway.ts` + its describe block. This branch touches NEITHER file. No harness timing was altered; no fixture-output gating duplicated. If PR #42 merges later, no conflict arises with this branch (disjoint files).

## Operator-facing attach contract (controlled fixture ONLY)

The disposable fixture gateway is the AE-01 controlled fixture — never a production occupancy claim:

1. Boot it: `npm run phase1:fixture` (builds, then runs `dist/test/support/phase1-acceptance-gateway.js`). It creates a temp root, binds the ONE canonical socket at `<tempRoot>/ipc.sock` (mode 0600 via `gatewayPaths()`), prints a READY block, and cleans up fully on SIGINT/SIGTERM.
2. Attach from another terminal using the printed literal paths — the flags are explicit, never defaults: `--socket <printed socket path> --session <printed session path>`.
3. The verb family (frozen r4 §7.15): `madv-tui rooms --json` (list) · `join --room fixture-room` (mint/attach) · `follow --json` (snapshot + live stream) · `leave` (detach). Rooms are fixture rooms; the VT codec is `fixture-vt/1`; receipts ceiling `executed`.
4. Programmatic equivalent: instantiate `RoomRuntime` + `IpcServer` with `gatewayPaths(tempDir)` (as `test/multi-viewer-reconnect.test.ts` does) — the same IpcServer the daemon boots, on a disposable path.
5. Negative controls remain pinned: no second daemon, no `broker.sock`, no `MADV_SOCKET_PATH`, no TCP listener (acceptance Slice E, T17/T18).

## Evolved-from-Superlogical vs invented

- **Evolved:** server-authoritative room surviving client disconnect; multi-viewer attach without work forking — Superlogical's durable-session mechanisms, realized through the existing AE-01 room runtime (no Superlogical bytes).
- **Invented (this lane):** the superseded-connection pump guard (delivery-side ownership); the R4 both-alive proof shape; the attach contract write-up.
- **Invented (MAD, pre-existing, reverified):** connection-token ownership, Gap/truthful-backpressure semantics (r4/r5 lineage).

## Blast radius

One guard in the daemon's per-connection pump path + one new test file + this handoff. No protocol vocabulary change, no frame format change, no lockfile change, no harness change. The guard only affects connections whose viewer binding was replaced — the ordinary single-viewer path is provably untouched (69/69 phase1 regression).

## Risks / open questions

- **Capability rotation on replacement** (bearer-token boundary above) — needs a Founder decision if the act's threat model requires it; current state is unchanged from main and documented.
- The `stale_viewer` disconnect on superseded sockets was considered and NOT added — silently inert is fail-closed and avoids inventing new disconnect semantics; revisit if operators need the signal.
- Full-suite count difference vs Lane 1 branch (985 vs 996) reflects each branch's own test additions over the same baseline; both share the identical baseline behavior.

## Next action

`independent-reviewer` review of `build/multi-viewer-reconnect-v0` head; merge only via a separate Founder act naming the exact head SHA.

## Founder disposition (recorded 2026-09-15, appended before branch commit)

The Founder ruled on this handoff's open question the same day. Verbatim:

> FOUNDER_DECISION_REQUIRED — capability epoch on viewer replacement
> Options:
> 1) Rotate capability on replacement join (old socket verbs fail-closed immediately)
> 2) Keep bearer until occupancy/epoch naturally moves (current); document as known limit
> 3) Hybrid: rotate only for WRITE/runtime verbs; READ/catch-up stays briefly
> Default recommend: (1) for production-bound rooms; (2) OK while fixture-only.
> Not in Superlogical v0 merge.

Effect on this branch: **no code change** — option 2 (current behavior) stands while rooms are fixture-only; option 1 is the standing recommendation IF/WHEN rooms become production-bound, and is explicitly **not in the Superlogical v0 merge**. The known-limit text in "Known boundary, NOT changed" above remains the accurate description of shipped behavior.

## Attribution

```
Role-Id: builder
Actor-Id: GLM-20260915-SUPERLOGICAL-OP-V0
Execution-Surface: claude-code
```
