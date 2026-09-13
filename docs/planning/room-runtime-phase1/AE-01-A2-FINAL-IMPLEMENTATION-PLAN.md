# AE-01 A2 FINAL IMPLEMENTATION PLAN

## 1. Work ID
AE-01 A2

## 2. Objective
Enable Founder Acceptance Run 02 so the Founder can manually interact with the already-landed Room Runtime Phase 1 through its real Gateway-owned IPC boundary, using an isolated temporary root, real GatewayDaemon, and a synthetic fixture Room containing exactly two execution identities (slot-a, slot-b). 

## 3. Controlling inputs and their hashes
- `origin/main` (Build Room controlling base): `ef7a47920b8a2a022f9e6bf26ce22119fe466217`
- TUI acceptance consumer observation pin: `14466fc7d3741cbfb16ce7a649a0d104cb09d4d3` (observation only, not a base; the consumer surface `apps/madbridge/**`, `bin/**`, `packages/protocol/**` is byte-identical at TUI `main` `d3f22b60625443d5a3ef22a33a932678e13d3441`)
- `package.json` base hash: `0f86e32610eadf8c0654991806f9cc86761c1971c6ca7eb5f318e126f482ee0d`
- Controlling Architecture: `ROOM-RUNTIME-PHASE1-ACCEPTANCE-ENABLEMENT-01 (AE-01 A2)`

## 4. Current-state assessment
- `origin/main` hash is `ef7a47920b8a2a022f9e6bf26ce22119fe466217`. 
- No repository drift detected.
- `GatewayDaemon` and `RoomRuntime` are fully present and unmodified from Phase 1.
- `package.json` contains no existing acceptance command for Phase 1 fixtures.

## 5. Constraints
- The implementation MUST NOT edit `packages/gateway-daemon/**` or `packages/gateway-protocol/**`.
- The implementation MUST NOT touch the production Gateway directory (`~/Library/Application Support/founder-os/gateway/`).
- No production control-plane network calls.
- No real Keychain access.
- Only exact two execution streams: `slot-a` and `slot-b`.
- Must construct real `GatewayDaemon` but NEVER call `GatewayDaemon.start()`.
- Must NOT directly invoke `tick()` (heartbeat cadence shall never start).
- Must NOT use `MADV_SOCKET_PATH` or `broker.sock`.
- Must NOT use TCP listeners (strictly local UNIX socket only).
- Must NOT provide a plaintext fallback.
- Must NOT construct `SecurityCommandRunner`; custody is `new Custody(new AcceptanceKeychainRunner())` and nothing else.
- Must NOT perform network I/O: the `ControlPlaneClient` is constructed with a dead-end loopback base URL and an injected `fetchImpl` that throws `network_forbidden` and counts invocations (required count: 0).
- Must NOT read or write the TUI session file; the runner only reserves and prints a disposable session path under the temporary root.

## 6. Non-goals
- No authorization of Room Runtime Phase 2.
- No production activation, live provider execution, or real agent execution.
- No TUI source modifications.
- No new generic Room-creation interface.

## 7. Architecture decision
Implement a standalone Node process in `test/support/phase1-acceptance-gateway.ts` that acts as the isolated environment runner. It provisions a temporary root with `mkdtemp(join(os.tmpdir(), "gateway-ae01-"))`, builds `GatewayDaemonDeps` exactly as `{ paths: gatewayPaths(tempRoot), clock: createDaemonClock(), custody: new Custody(new AcceptanceKeychainRunner()), client: new ControlPlaneClient(deadEndUrl, forbiddenFetch), heartbeatCadenceMs: <any positive integer; inert because start() is never called> }`, creates and occupies `fixture-room` (which registers exactly `slot-a` and `slot-b`), calls `boot()` to start IPC without `start()` or `tick()`, and emits bounded deterministic text updates to the `RoomRuntime` output buffer at a fixed 500ms cadence.

## 8. Alternatives considered
- **Using a mocked IPC server:** Rejected by spec. The real `GatewayDaemon` must own the IPC listener.
- **Using the production socket:** Rejected by spec. Must use a host-isolated temporary root.
- **Using generic test helpers for custody:** Rejected. `SecurityCommandRunner` MUST NOT be constructed to guarantee exact fail-closed behavior for AE-01.

## 9. Components and boundaries
- **Runner Script:** `test/support/phase1-acceptance-gateway.ts`. Owns process lifecycle, temporary root, and DI orchestration.
- **Fixture Room:** Exact ID `fixture-room`. 
- **Custody:** `new Custody(new AcceptanceKeychainRunner())`; `AcceptanceKeychainRunner implements KeychainRunner` and lives within the support file.
  - `find-generic-password` → `ITEM_NOT_FOUND_EXIT (44)`
  - all add/write operations → throw/fail closed
  - all delete operations → throw/fail closed
  - unknown command shape → throw/fail closed
  - Counters tracked: `reads`, `writes`, `deletes`.
  - `SecurityCommandRunner` MUST NOT be constructed.
- **Control plane:** the real `ControlPlaneClient` class constructed with a dead-end loopback base URL and an injected throwing `fetchImpl`; no request may complete.
- **GatewayDaemon:** The real Phase 1 daemon handling IPC and state projection.

## 10. Interfaces and contracts
- **CLI Command:** `npm run phase1:fixture` starting the runner.
- **TUI Connection:** Requires explicit `--socket` and `--session` pointing to the temporary root printed in the runner's READY block. The four frozen verbs are `rooms`, `join`, `follow`, `leave`. Input ownership and takeover are HARNESS ONLY in Run 02: at the observation pin the TUI CLI exposes no takeover verb (`takeoverInput` exists only as a client method with no CLI entry).
- **Output:** Output text must use `emitFixturePatch(roomId, executionId, text)` at a `FIXTURE_INTERVAL_MS = 500` cadence. Each interval emits exactly:
  `slot-a fixture tick <000N>`
  `slot-b fixture tick <000N>`
  (using zero-padded four-digit sequence numbers).

## 11. Data flow
1. Runner creates the temporary root with `mkdtemp(join(os.tmpdir(), "gateway-ae01-"))`.
2. Runner injects paths into `GatewayDaemon`.
3. Runner injects `new Custody(new AcceptanceKeychainRunner())` and the network-forbidden `ControlPlaneClient`.
4. Runner creates and occupies `fixture-room`.
5. Runner boots daemon (IPC opens).
6. Runner emits synthetic tick output every 500ms using `emitFixturePatch`.
7. TUI connects via IPC; `GatewayDaemon` projects state and output buffers.

## 12. Trust and security boundaries
- No real network I/O.
- No real Keychain I/O (enforced by `AcceptanceKeychainRunner` isolating reads/writes/deletes).
- Strict isolation of `.sock` and `.json` session state.
- Does not hold or create any real credentials.

## 13. Expected files to create/modify/delete
- **CREATE:** `test/support/phase1-acceptance-gateway.ts`
- **CREATE:** `test/room-runtime-phase1-acceptance-gateway.test.ts`
- **MODIFY:** `package.json` (add `"phase1:fixture": "npm run build && node dist/test/support/phase1-acceptance-gateway.js"` to scripts)
- **NO OTHER FILES MAY BE MODIFIED.**

## 14. Migration or compatibility requirements
- None. This is an isolated, ephemeral acceptance harness.

## 15. Error and failure behavior
- **Normal SIGINT/SIGTERM:**
  stop output timer → await `daemon.stop()` if booted → remove session file if present → remove temp root → exit 0.
- **Second-signal behavior:**
  A second signal during cleanup SHALL not trigger a second conflicting daemon stop or resource-removal sequence.
- **Startup/runtime failure before READY:**
  same cleanup path → print `CONTROLLED FIXTURE ACCEPTANCE — FAILED` → exit non-zero.
- **Constraints:**
  - Cleanup must be idempotent and owned by exactly one function.
  - Prohibit `process.exit()` until async `daemon.stop()` has settled.

## 16. Observability
- The script prints a READY block ONLY when startup is fully successful. The READY output SHALL contain EXACTLY:
```text
CONTROLLED FIXTURE ACCEPTANCE
NOT PRODUCTION
NOT LIVE OCCUPANCY
NO PROVIDER EXECUTION

STATUS: READY
ROOM: fixture-room
EXECUTION 1: slot-a
EXECUTION 2: slot-b
SOCKET: <absolute disposable socket path>
SESSION: <absolute disposable session path>
```
- It SHALL also print literal command examples for Founder Acceptance Run 02 using the printed paths (`rooms --json`, `join --room fixture-room`, `follow --json`, `leave`, each with `--socket <SOCKET> --session <SESSION>`).
- The runner never creates the session file; the TUI creates it on first use at the printed path.

## 17. Test strategy
TDD RED-first methodology via focused incremental slices. The 18 mandated RED suites (T1-T18), all in `test/room-runtime-phase1-acceptance-gateway.test.ts`:
- **Slice A — isolation and dependencies (T1-T7):** T1 temporary root is under `os.tmpdir()` and is never the canonical Gateway directory; T2 `GatewayPaths` (socket, state, staging lock) all resolve under the temporary root; T3 custody is `Custody` over `AcceptanceKeychainRunner` and `SecurityCommandRunner` is never constructed; T4 `find-generic-password` returns exit 44 and only `reads` increments; T5 add/write, delete, and unknown command shapes throw and `writes`/`deletes` stay 0; T6 the injected `fetchImpl` is never invoked through `boot()` (count 0) and throws `network_forbidden` if called; T7 `GatewayDaemon.start()` and `tick()` are never invoked (heartbeat cadence never starts).
- **Slice B — Room and IPC (T8-T11):** T8 `fixture-room` is created and occupied with exactly `slot-a` and `slot-b`; T9 `boot()` opens a UNIX-domain socket at the temporary `socketPath` with mode 0600 and no TCP listener exists; T10 IPC `status` and `rooms` answer over the temporary socket; T11 a third execution is refused (harness only).
- **Slice C — fixture output (T12):** T12 each 500ms interval emits exactly `slot-a fixture tick <000N>` and `slot-b fixture tick <000N>` with zero-padded four-digit sequence numbers via `emitFixturePatch`.
- **Slice D — lifecycle cleanup (T13-T16):** T13 SIGINT stops the timer, awaits `daemon.stop()`, removes the session file if present and the temporary root, exits 0; T14 SIGTERM behaves identically; T15 a second signal during cleanup triggers no second stop or removal sequence; T16 a failure before READY runs the same cleanup, prints `CONTROLLED FIXTURE ACCEPTANCE — FAILED`, exits non-zero, and `process.exit()` is not reached before `daemon.stop()` settles.
- **Slice E — prohibited mechanisms and regression (T17-T18):** T17 the support file references no `MADV_SOCKET_PATH`, `broker.sock`, TCP listener, or plaintext custody fallback; T18 existing Phase 1 suites and `package-lock.json` are unchanged.

## 18. Acceptance criteria
1. Real GatewayDaemon is used over temporary IPC (no TCP).
2. Canonical Gateway path untouched.
3. Network and Keychain untouched.
4. Two synthetic output streams visible in TUI.
5. Clean shutdown leaves no orphaned sockets or temp roots, safely handles double-signals.
6. All T1–T18 acceptance requirements PASS. No requirement for a numerical line/branch coverage percentage is introduced by AE-01.

## 19. Implementation sequence
1. Reverify exact base `ef7a47920b8a2a022f9e6bf26ce22119fe466217` before first edit.
2. Create isolated Builder branch/worktree.
3. Capture baseline.
4. Record the verified Run 02 capability matrix: `rooms`, `join`, `follow`, `leave`, and two streams are MANUAL; input ownership and takeover are HARNESS ONLY (no CLI verb at the observation pin). No downgrade decision remains with the Builder.
5. Implement Slice A RED tests (isolation/dependencies: T1–T7), then GREEN.
6. Implement Slice B RED tests (Room/IPC: T8–T11), then GREEN.
7. Implement Slice C RED test (fixture output: T12), then GREEN.
8. Implement Slice D RED tests (lifecycle cleanup: T13–T16), then GREEN.
9. Implement Slice E RED tests (prohibited mechanisms + regression: T17–T18), then GREEN.
10. Exact 3-path diff check.
11. Focused AE-01 tests PASS.
12. Existing Phase 1 tests PASS.
13. Full Build Room suite PASS.
14. Typecheck PASS.
15. `git diff --check` PASS.
16. Path audit PASS.
17. Attribution self-test PASS.
18. Secret scan PASS.
19. Verify gate where applicable.
20. Prove `package-lock.json` unchanged.
21. Prove canonical Gateway path unchanged.
22. Prove network calls 0.
23. Prove real Keychain calls 0.
24. Prove custody writes/deletes 0.
25. Freeze candidate SHA/tree.
26. Builder handoff.
27. Fresh br-operator review.
28. Only after independent verdict, return to Founder for publication authority.

## 20. Rollback plan
- implementation occurs only on the authorized isolated candidate branch/worktree;
- `origin/main` remains untouched;
- if the candidate is rejected, preserve its SHA as historical evidence and abandon/delete only the isolated candidate worktree/branch under separate cleanup authority as applicable;
- never rewrite or reset ordinary checkouts to perform rollback.

## 21. Dependency ordering
1. TUI capability matrix as recorded in section 19 step 4 (already verified; no Builder decision).
2. RED tests (T1-T18) via Slices A-E.
3. Runner implementation incrementally.
4. Verification battery.

## 22. Known risks
- Process termination via `SIGKILL` (-9) could strand a socket in a temporary root. Every start creates a fresh `mkdtemp` root and `IpcServer.start()` unlinks its own socket path before listening, so a stranded socket can never collide with a later run; the stranded directory is inert and outside the canonical Gateway directory.

## 23. Unresolved Founder decisions
- None. Durable placement of this final revision and the implementation authorization bound to its exact identity are settled by the Founder finalization act (Option C, AE-01 A2 controlling-plan identity ruling).

## 24. Plan-drift stop conditions
- ANY required modification under `packages/gateway-daemon/**` or `packages/gateway-protocol/**`.
- ANY modification to TUI source, lockfiles, TS configs, CI, or AGENTS.md.
- TUI CLI no longer supporting `--socket` and `--session`.
- Base SHA drift before implementation starts.

## 25. Next Role
Founder approval, then Builder.
