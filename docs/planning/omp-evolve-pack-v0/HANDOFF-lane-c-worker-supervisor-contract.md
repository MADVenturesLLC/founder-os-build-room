# HANDOFF — Lane C: worker-supervisor contract (`build/worker-supervisor-contract-v0`)

Commission: FOUNDER ACT — Commission OMP→MAD Evolve Pack v0 (mechanism steal,
not clone), 2026-09-13. Authorized: implement + commit + push on the named
branch. NOT authorized and NOT claimed: merge, Phase 0 reopen, Phase 2,
production/live occupancy, provider execution, MadBridge unfreeze.

Boundaries (AE-01 still bind): controlled/fixture-honest work — NOT
production, NOT live occupancy, NO provider execution, NO Phase 2 claim.

## Identity

| field | value |
|---|---|
| Repository | `MADVenturesLLC/founder-os-build-room` |
| Branch | `build/worker-supervisor-contract-v0` |
| Base pin (`git rev-parse origin/main` at act time) | `736b12b33a20dd055d88ba0ec1e30621797cc959` |
| Implementation commit | `ba63ca7ed24bb648b903cbbeb6d1dc9fc28eff26` |
| Head SHA | the commit that adds this file (branch head; reported in the session handoff) |
| Contract path | `packages/worker-supervisor/src/contract.ts` (+ `contract-probes.ts`, `contract-stub.ts`) |
| Actor | `session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`, surface `claude-code`, role `builder` |

## Correction to the act's premise

The act says "Package: `packages/worker-supervisor` (fill empty / stub
package)". At the base the package is not empty: `src/index.ts` (778
lines) is the Phase 1 C2 supervisor — the Gateway half of the FDR-C C2
boundary with the ExecutionStreamRegistry and C2RoomBinding fixture-gated
wiring — and `src/ipc-contract.md` is its IPC contract. Rewriting or
re-exporting from that file would touch Phase 1 wiring the act did not
open. Lane C is therefore additive: three sibling modules and a README,
zero bytes changed in `index.ts` / `ipc-contract.md` (SHA-256 pinned by
the suite at `be7450db…` and `4c54c27a…`).

## Changed paths

- `packages/worker-supervisor/src/contract.ts` (ADD)
- `packages/worker-supervisor/src/contract-probes.ts` (ADD)
- `packages/worker-supervisor/src/contract-stub.ts` (ADD)
- `packages/worker-supervisor/README.md` (ADD — the in-package ADR)
- `test/worker-supervisor-contract.test.ts` (ADD)
- `docs/planning/omp-evolve-pack-v0/HANDOFF-lane-c-worker-supervisor-contract.md` (ADD — this file)

Not changed: `packages/worker-supervisor/src/index.ts`,
`packages/worker-supervisor/src/ipc-contract.md`, `packages/gateway-daemon/**`
(zero daemon touch), `tsconfig.json` (the existing
`packages/worker-supervisor/src/**` include already covers the new
files), `package.json`, `package-lock.json`, CI.

Paths named in this file that do not exist at the base: the three
`contract*.ts` files, the package README, the test file, and this
directory.

## What was built (scope → where)

- Readiness = log-regex AND TCP port → `ReadinessSpec`, `isReady`
  (conjunction only), `READINESS_BOUNDS`, `validateReadinessSpec`;
  probes in `contract-probes.ts`.
- Restart policies with bounded backoff → `RestartPolicy`,
  `RESTART_POLICY_BOUNDS`, `validateRestartPolicy` (refused at `start`
  before any spawn), `computeBackoffMs` (deterministic, capped, no jitter),
  `NO_RESTART_POLICY`.
- Ops surface ps / logs / send / stop → `WorkerOps` with named refusals;
  `ContractStubSupervisor` implements it.
- Non-goals documented → README "Non-goals" and `WORKER_SUPERVISOR_NON_GOALS`
  (asserted by the suite).
- Stop guarantees → SIGTERM → grace → SIGKILL, resolves only after the
  observed exit, joins a concurrent stop, cancels a pending restart, never
  restarts after.

## Test evidence

Focused:

```
npm run build && node --test dist/test/worker-supervisor-contract.test.js
# tests 21 · pass 21 · fail 0
```

Full suite on this branch (`npm test`, credential-free; storage and
prereq-c cases self-skip as on `main`):

```
# tests 876 · suites 323 · pass 876 · fail 0    (main baseline: 855 / 316 / 855 / 0)
```

Gates run locally on the implementation commit: `npm run typecheck` PASS,
`npm run gate:path-audit` PASS, `npm run gate:attribution-selftest` PASS,
`eslint` on the new files 0 findings, `git diff --check` clean.

One suite opens a loopback TCP listener as a FIXTURE (in `test/`, not in
package source) to prove `tcpPortProbe`; the package itself never listens
and the static test asserts no listener token in the contract files.

## Evolved from OMP vs invented

- Evolved (mechanism named in the act): readiness as log-regex + TCP port,
  restart policies with backoff, the `ps / logs / send / stop` surface. No
  OMP code was read or vendored.
- Invented here: the AND-only readiness function and loopback-only rule;
  the readiness deadline as a kill-then-bounded-restart path;
  `RESTART_POLICY_BOUNDS` with refusal at `start`; jitter-free
  deterministic backoff; the exit-observed stop guarantee with join and
  restart-cancel semantics; the injected adapter/scheduler/probe design
  that makes the suite deterministic; the base-pin test that proves the
  Phase 1 files untouched.

## Blast radius

Zero edits to existing source. Zero daemon touch. No manifest, no
workspace membership, lockfile byte-identical. Nothing consumes the
contract yet; a future production supervisor would implement `WorkerOps`
against it.

## Open items / decisions

None blocking. Whether the Phase 1 C2 supervisor should eventually
implement this contract (it predates it and uses a different readiness
model: handshake over stdio, no TCP) is a design question for a later act,
not this lane. Merge remains a separate Founder act naming the exact head
SHA.
