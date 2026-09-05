# Room Runtime Phase 0 — proof scope, manifest, and AT mapping

Repository: `MADVenturesLLC/founder-os-build-room`
Branch: `builder/room-runtime-phase0`
Base: HEAD `fccd56616f4be1609d02c5844dd97074aafa68ca`, tree
`93133af03ded3d554142b95254038bddf37f9320` (Founder-authorized, act of
2026-09-04).

This tranche implements the Founder Phase 0 authorization ("FOUNDER
AUTHORIZATION — ROOM RUNTIME PHASE 0 PROOF COMMISSION", 2026-09-04) with
its confirmed 20-path changed-path manifest and all of its stop
conditions. This file is the scope + mapping record (evidence item 7).
The observed evidence lives in `phase0-evidence.md` in this directory.

## Controlling architecture

r4 as corrected by r4.1 + r4.2 + r4.3 + r4.4, under freeze receipt
`2026-09-03-room-runtime-r4-stack-FREEZE.md` (all ten controlling-document
SHA-256 identities re-verified exact at execution time). Phase 0 is
proof-only: no production `start`, no public interface, no Gateway-IPC v2
production, no Phase 1 authority.

## Changed-path manifest (this repository — 10 of 20)

All NEW files. Zero production-package edits. Zero
package.json/lockfile/tsconfig/CI changes. `test/*.test.ts` files are
picked up by the existing root-tsconfig include and `npm test` glob;
`test/support/` files are compiled fixtures (spawned-child precedent:
`enroll-child.ts`). `docs/planning/` is path-audit-excluded under the
standing 2026-09-01 Founder ruling recorded in `scripts/path-audit.sh`.

| # | Path | Class | Covers |
|---|---|---|---|
| 1 | `test/phase0-occupancy-lock.test.ts` | test | items 5.7, 5.18; AT-R4-22 + occupancy-lock proof |
| 2 | `test/support/phase0-lock-child.ts` | test (spawned fixture child) | real-process lock proof |
| 3 | `test/phase0-checkpoint-commit.test.ts` | test | items 5.12, 5.14; AT-R4-39, AT-R4-34 |
| 4 | `test/support/phase0-checkpoint-child.ts` | test (persisting/crash child) | real crash-state injection at each write boundary (named-boundary self-exit leaving real partial on-disk state) |
| 5 | `test/phase0-boot-wake-expiry.test.ts` | test | item 5.16; AT-R4-15a, AT-R4-15b |
| 6 | `test/phase0-activity-result.test.ts` | test | item 5.17; freeze-receipt durability note; r4.1 §6.2 |
| 7 | `test/phase0-filesystem-boundary.test.ts` | test | item 5.20; AT-R4-13 |
| 8 | `test/phase0-dispatch-gate.test.ts` | test | AT-R4-19a; r4.1 §2 / r4.2 §5 |
| 9 | `docs/planning/room-runtime-phase0/README.md` | documentation/evidence | this file |
| 10 | `docs/planning/room-runtime-phase0/phase0-evidence.md` | documentation/evidence | evidence packet items 1–5, 8–20 |

The other 10 paths are in `MADVenturesLLC/madventures-tui` (spike
fixtures and tests under `test/phase0/`, the Prerequisite-C load spike,
and the proof record under `docs/verification/`).

## Frozen AT mapping (requirement → implementation → test → observed result)

| Frozen requirement | Implementation | Test | Observed (2026-09-04, this host) |
|---|---|---|---|
| AT-R4-22 — second Gateway refused; OS-held lock; no unlink-then-bind takeover | `test/support/phase0-lock-child.ts` (macOS `O_EXLOCK` 0x20 via `open(2)`; proof-mechanism-only per the Founder confirmation boundary 1) | `phase0-occupancy-lock.test.ts` | PASS — exclusive acquisition; contender refused with EAGAIN (the darwin name for EWOULDBLOCK, errno 11); holder socket untouched; kernel release on SIGKILL; rebind unlinks stale socket only after re-acquiring the lock; lock fd not inherited by a spawned probe (lsof audit, 0 leak lines); ipc.sock bound only under the lock |
| Occupancy-lock proof (act §6) | same | same | PASS (macOS-gated: BR CI is ubuntu-only; run locally under Node 22.23.2 — environment-gated coverage, reported per evidence item 19) |
| AT-R4-39 — crash at each write boundary (r4.3 §3 order) | `test/support/phase0-checkpoint-child.ts` persists raw ring → blob → `CheckpointCommit` → index with named crash boundaries; the child stops persisting at the named boundary and self-exits (`process.exit(9)`), leaving the real partial on-disk state for the recovery checker (a defensive parent-side SIGKILL timer exists only as a linger backstop — it is not the operative mechanism and did not fire in any recorded run) | `phase0-checkpoint-commit.test.ts` | PASS — after-raw-ring / after-blob crashes recover `checkpoint_unavailable` (blob without commit discarded); after-commit-record crash recovers the complete verified commit; index-ahead state is discarded; recovery never reuses a half-written blob or digest-mismatched commit |
| AT-R4-34 — in-memory checkpoint ahead of ring not reused | hand-crafted commit-ahead state in the test | `phase0-checkpoint-commit.test.ts` | PASS — `commit-ahead-of-raw-ring` is a stop-class observable (exit 10), never silently reused |
| AT-R4-15a — boot re-check before recovery actions | `boot()` state-machine + real M19 kill of a recorded writer PGID | `phase0-boot-wake-expiry.test.ts` | PASS — expired-at-boot fences and SIGTERM→SIGKILLs the real writer group within bound; recovery-mode spawn denied; no dispatch until a new envelope |
| AT-R4-15b — wake re-check before input; not a boot | `wake()` state machine | `phase0-boot-wake-expiry.test.ts` | PASS — wall-expired envelope on a living process denies input; never labeled reconstruction |
| Item 5.17 / freeze note — `ActivityResult` only after durable; else `ExitUnknown` | `publishExit()` + fsync'd receipt ledger | `phase0-activity-result.test.ts` | PASS — publish only after durable fsync; Gateway-crash and persist-failure paths emit `ExitUnknown`; `ExitUnknown` never displays `executed` |
| AT-R4-13 — unmediated write is an enforcement limit, never sandboxed | real `/bin/sh` unmediated write + honest classification | `phase0-filesystem-boundary.test.ts` | PASS — the write succeeds through ordinary syscalls; the record classifies it `mediated_governance_only`; no sandbox claim appears |
| AT-R4-19a — pre-integration dispatch: envelope + policy; SR not consulted | `computeGate()` derived outcome; real spawned child on dispatchable | `phase0-dispatch-gate.test.ts` | PASS — valid envelope + policy dispatches (real child spawned); expired/absent envelope denies with no child; intake widening is not the accepted envelope; paused/ineligible produce prepare_only/choice_required |

The TUI-side ATs (01, 02, 03, 35, 36, 37, 38-as-r4.4) are proven in
`madventures-tui` `test/phase0/` and recorded in its proof record
(`docs/verification/2026-09-04-room-runtime-phase0.md`).

## Coverage and environment-gating statement (evidence item 19)

- BR CI is ubuntu-only: the macOS-gated proof in path 1 (O_EXLOCK) runs
  locally on this darwin host under Node 22.23.2 and is reported as
  environment-gated for CI purposes.
- All other BR Phase 0 tests are platform-independent (no kernel-lock
  dependency) and will run in CI as-is.
- No test was redefined to make implementation pass (act §6).

## Stop conditions checked

All 13 act §11 conditions were monitored; none fired. No second owner, no
surviving child beyond contract, no broker.sock, no r3/r4 modification, no
base drift (bases re-verified at branch time), no scope expansion (exactly
the 20 confirmed paths; the one path-shape correction during execution —
the lock-refusal errno name EAGAIN on darwin — is an implementation detail
of the same proof, not a new path).