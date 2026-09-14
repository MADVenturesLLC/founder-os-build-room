# HANDOFF — Lane D: cancelable hooks + policy bundles (`build/gateway-hooks-v0`)

Commission: FOUNDER ACT — Commission OMP→MAD Evolve Pack v0 (mechanism steal,
not clone), 2026-09-13. Authorized: implement + commit + push on the named
branch. NOT authorized and NOT claimed: merge, Phase 0 reopen, Phase 2,
production/live occupancy, provider execution, MadBridge unfreeze.

Hard locks (act, Lane D): no second daemon, no `broker.sock`, no
`MADV_SOCKET_PATH` revival; no production occupancy claim; no provider
execution; no Phase 2. All honoured and asserted by the suite's static
tests.

## Identity

| field | value |
|---|---|
| Repository | `MADVenturesLLC/founder-os-build-room` |
| Branch | `build/gateway-hooks-v0` — **stacked on Lane A** |
| Stack base | Lane A head `fc8d187d7a1bf88ba64410010b612010b058de7b` (`build/seat-output-schema-v0`) |
| Base pin (`origin/main` at act time) | `736b12b33a20dd055d88ba0ec1e30621797cc959` |
| Implementation commit | `8fe942f24f57cf019d89d972dfb9eb60a1662776` |
| Head SHA | the commit that adds this file (branch head; reported in the session handoff) |
| Actor | `session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`, surface `claude-code`, role `builder` |

The act's dependency clause reads "prefer depend on A"; this branch takes
that option. Until Lane A merges, this branch's diff against `main`
includes Lane A's commits (`c54ba51`, `fc8d187`); the Lane D delta is
exactly the two commits after `fc8d187`.

## Exact changed paths (Lane D delta)

- `packages/gateway-daemon/src/hooks/tool-call-hooks.ts` (ADD)
- `packages/gateway-daemon/src/hooks/policy-bundles.ts` (ADD)
- `packages/gateway-daemon/src/hooks/seat-policy-hook.ts` (ADD)
- `packages/gateway-daemon/src/hooks/output-schema-hook.ts` (ADD)
- `packages/gateway-daemon/src/hooks/index.ts` (ADD)
- `packages/gateway-daemon/src/index.ts` (MODIFY — one appended export block)
- `test/gateway-hooks.test.ts` (ADD)
- `docs/planning/omp-evolve-pack-v0/HANDOFF-lane-d-gateway-hooks.md` (ADD — this file)

Not changed: `daemon.ts`, `ipc.ts`, `room-runtime.ts`, `custody.ts`,
`lanes.ts`, `signing.ts`, `state.ts` (every existing daemon module);
`packages/gateway-daemon/package.json` (dependencies still exactly
`@build-room/gateway-protocol`); `packages/seat-registry/**`;
`packages/control-plane/**` (the V1.1 gate is imported, not edited);
`package.json`, `package-lock.json`, `tsconfig.json`, CI.

Paths named in this file that do not exist at the base: everything under
`packages/gateway-daemon/src/hooks/`, the test file, and (at `main`) the
Lane A package this branch stacks on.

## What was built (scope → where)

- `tool_call` interception: pre-hook can block | revise args; post-hook
  observes; fail-closed on hook error → `ToolCallInterceptor`
  (`tool-call-hooks.ts`). Timeouts block; out-of-enum decisions block;
  identity fields are never taken from a revise; an empty gate cannot be
  built.
- Seat-registry policy through hooks → `seatPolicyHook` consumes the V1.1
  `createSeatPolicyGate`; a refusal is a block.
- Approval tiers → policy bundles → `PolicyBundleSet` / `policyBundleHook`
  (`gate | tranche` tiers, read/write/exec rules, per-tool patterns,
  grants per scope; deny wins; default deny).
- Lane A dependency → `outputSchemaPostHook` (strict rejects, permissive
  flags).

## Evidence that a seat-registry deny prevents dispatch (not log-only)

`test/gateway-hooks.test.ts`, "a seat-registry deny prevents dispatch":
the interceptor is built with the PRODUCTION binding (`seatPolicyHook()`
with no options) and a dispatcher that counts invocations. For each of the
four seats the resolver's own refusal (`resolveSeat(seat)`) is compared to
the hook's block code and reason; for an unknown seat, an unbound seat,
and a temporary-task-assignment authorization the block codes are
asserted; **the dispatcher count is 0 at the end**. The positive control
uses the V1.1 gate's documented test seam: an allowed resolution dispatches
exactly once. A third test composes seat policy with policy bundles and
shows both must allow.

## Test evidence

Focused:

```
npm run build && node --test dist/test/gateway-hooks.test.js
# tests 19 · pass 19 · fail 0
```

Full suite on this branch (`npm test`, credential-free; storage cases
self-skip as on `main`):

```
# tests 902 · suites 328 · pass 902 · fail 0
# = Lane A head 883 + 19 Lane D tests   (main baseline: 855 / 316 / 855 / 0)
```

Gates run locally on the implementation commit: `npm run typecheck` PASS,
`npm run gate:path-audit` PASS, `npm run gate:attribution-selftest` PASS,
`eslint` on the new files 0 findings, `git diff --check` clean. The AE-01
regression pins (T17/T18) pass unchanged within the full suite.

## Blast-radius note

- `packages/gateway-daemon/src/index.ts`: one appended `export *` block.
  No existing export changed. The AE-01 runner (`test/support/
  phase1-acceptance-gateway.ts`) imports this entry read-only; its T17
  import assertion still passes (verified in the full suite).
- New import boundary: `hooks/seat-policy-hook.ts` →
  `packages/control-plane/src/seat-policy.ts` (that one module; it imports
  only the Seat Registry public entry). The control-plane package ENTRY is
  not imported, so no Postgres/HTTP module enters the daemon graph.
  Alternative considered and not taken: duplicating the gate in the daemon
  (drift risk) or moving `seat-policy.ts` to a shared package (edits the
  V1.1 surface, outside this act).
- New import boundary: `hooks/output-schema-hook.ts` →
  `packages/seat-output-schema/src/index.js` (Lane A public entry).
- Runtime wiring: none. No daemon code path calls the interceptor; nothing
  changes for `boot()`, `start()`, IPC, custody, or rooms.

## Evolved from OMP vs invented

- Evolved (mechanisms named in the act): cancelable pre/post tool-call
  hooks that can block or revise arguments; approval tiers mapped to
  pre-approved tool-class bundles. No OMP code, hook API, or UI was read or
  vendored.
- Invented here: the closed decision/outcome enums with `dispatched` as the
  only clean outcome; identity-immutable revise; timeouts and invalid
  results as blocks; the no-empty-gate rule; segment-wise tool patterns
  with deny-wins/default-deny and construction-time refusal of malformed
  bundles; binding the V1.1 seat gate as a hook; the Lane A post-hook.

## Open items / decisions

None blocking. Lane E (`build/quarantine-advisor-v0`) stacks on this
branch's head. Merge remains a separate Founder act naming the exact head
SHA; Lane A must land first or be merged together in stack order.
