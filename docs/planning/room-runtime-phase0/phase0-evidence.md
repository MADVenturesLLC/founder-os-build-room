# Room Runtime Phase 0 — evidence packet (BR side)

Repository: `MADVenturesLLC/founder-os-build-room`
Branch: `builder/room-runtime-phase0`
Base: HEAD `fccd56616f4be1609d02c5844dd97074aafa68ca`, tree
`93133af03ded3d554142b95254038bddf37f9320`.
Candidate identities: see the handoff — this file records the
observations; the exact ending HEAD/tree identities are in the candidate
readback that accompanies this packet.

This is evidence items 1–5, 8–20 of the act §12 list, BR side. Items 6–7
are in `README.md` in this directory.

## 2. Verification gates run before any edit

- Base re-verified exactly (HEAD + tree + clean tracked/index + untracked
  `.worktrees/` only) at branch creation, after the Founder's
  checkout-pointer authorization.
- All 10 controlling-document SHA-256 identities re-hashed and matched
  (freeze afa84477…, r4 e6e601ca…, r4.1 78ebeb50…, r4.2 ef1d38be…,
  r4.3 d4a05625…, r4.4 e4f6de8e…, r3 91be2aef…, roadmap 9054dc06…,
  D-V2-WM-1 1126085f…, Altitude disposition 0da4a9f3…).
- The parallel `builder/seat-registry-v1.1-plan-filing` branch (head
  `87870ce9…`) was verified untouched.

## 3. Test commands and complete results (evidence item 6)

All under nvm Node 22.23.2 (the Founder-confirmed proof runtime):

- `npm run build` — exit 0.
- `node --test dist/test/phase0-*.test.js` — 19 tests, 19 pass, 0 fail.
- Full suite `npm test` — 725 tests, 725 pass, 0 fail, 0 skipped (one
  earlier run showed 6 transient subtest failures under parallel-load
  contention; two subsequent full runs were clean 725/725 — the flaky
  run is disclosed here honestly rather than hidden).
- `npm run typecheck` — exit 0.
- `npm run lint` — 32 pre-existing errors in files this tranche does not
  touch (out of scope; no unrelated cleanup is authorized) and 0 errors
  in any Phase 0 path (the one Phase 0 lint finding — an unused import —
  was fixed before this record).
- `bash scripts/path-audit.sh` — PASS.
- `bash scripts/attribution-shape-check.sh selftest` — PASS.

## 4. Process-tree / PGID evidence (item 8)

The M19 ladder in `phase0-boot-wake-expiry.test.ts` operates on a REAL
spawned writer process group: `ps -o lstart=` starttime identity verified
before kill; SIGTERM (trapped/ignored by the fixture writer) confirmed
insufficient; SIGKILL escalation reaped the group; gone-within-bound
confirmed. The parent-death/grandchild-reap evidence with the full real
process tree (Gateway → pty-host → agent+grandchild) is TUI-side (r4 §9
assigns that proof to the pty-host fixture) and is recorded in the TUI
proof record.

## 5. Filesystem-enforcement-boundary statement (item 18)

A real `/bin/sh` child performed an unmediated `open`/`write` against a
worktree path under a recorded deny-glob policy. The write SUCCEEDED
through ordinary syscalls. The record classifies this as the documented
ENFORCEMENT LIMIT: the worktree lease is governance for Gateway-mediated
actions, not OS-level syscall containment. No sandbox, jail, or
path-enforcement claim is made or implied anywhere in this tranche
(AT-R4-13; r4 Table 6).

## 6. Prerequisite C — BR-side note (item 17)

The Prerequisite C inventory/load proof runs against the TUI's broker and
ledger entry points (r4 §9 names that repository's subset) and is recorded
in the TUI proof record. BR-side Node 22 load of the Gateway's own
packages is proven by this tranche itself: the full BR test suite
(including all Phase 0 proofs) ran green under Node 22.23.2.

## 7. Environment-gated or skipped coverage (item 19)

- `phase0-occupancy-lock.test.ts` (O_EXLOCK) is darwin-gated and ran
  locally on this host; BR CI (ubuntu-only) will skip it. Reported as
  environment-gated, not as CI-passed.
- No other skips.

## 8. Known residuals (item 20)

- The `O_EXLOCK` proof mechanism is Phase-0-only per the Founder
  confirmation boundary 1: a successful proof does not select the
  production occupancy-lock implementation. `fd-lock` or another native
  mechanism remains outside this tranche.
- Pre-existing lint debt (32 errors) in non-Phase-0 test files is
  unchanged and out of scope.
- `phase0-boot-wake-expiry.test.ts` proves the boot/wake expiry state
  machine and the M19 ladder against a real process; the OS-resume
  (monotonic-jump) detection itself is a macOS host event the fixture
  models by input, matching the frozen contract's input-driven AT
  definition (AT-R4-15b's setup is "envelope expires during OS sleep",
  which the fixture reproduces by deadline, not by host sleep).

## 9. No-prohibited-content confirmation (item 21)

The diff contains only the 10 confirmed BR paths (tests, fixture children,
two docs). No Altitude Runtime, ClaimSheet, ClaimCommit, ProbeLedger,
FogLedger, CapabilityCommit, deriveAltitude, AltitudeFact, RunSteward,
work_mode, PlanEnvelope, lease_denied_plan_mode, RoomHud,
OccupancyStaySwitch, ClaimBoundaryField, AttestedResumePlan,
provider-native resume, MessageDelta, dual streams, ReviewDecision,
RoomPrProjector, SameBrainIngress, PublishBoundary, KnowledgeArchive,
IntentBrief, OS sandbox Layer 2, second daemon/Gateway, broker.sock, new
coding agent, worktree farm, or any Phase 1+ capability. No production
package path was touched.

## 10. Untracked-material confirmation (item 22)

The pre-existing untracked `.worktrees/` was never staged, modified,
depended upon, or cited as evidence. All proof artifacts (temp dirs, FIFOs,
lock files) were created under `os.tmpdir()` and removed by the tests.