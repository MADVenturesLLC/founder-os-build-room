# worker-supervisor — contract v0 (ADR)

**Lane C of the OMP→MAD Evolve Pack v0** (Founder act of 2026-09-13,
"mechanism steal, not clone"). Status: controlled/fixture-honest work under
the AE-01 boundaries — NOT production, NOT live occupancy, NO provider
execution, NO Phase 2 claim. Merge is a separate Founder act.

## What is in this directory

| file | role | touched by Lane C |
|---|---|---|
| `src/index.ts` | Phase 1 C2 supervisor (FDR-C C2 boundary half, fixture-gated wiring) | **no** — SHA-256 pinned by the Lane C suite |
| `src/ipc-contract.md` | the C2 Worker IPC contract | **no** — pinned |
| `src/contract.ts` | the worker-supervisor CONTRACT: readiness, restart policy, ops surface, errors, non-goals | added |
| `src/contract-probes.ts` | default probes: `tcpPortProbe` (connects, never listens), `regexLogProbe` | added |
| `src/contract-stub.ts` | a minimal stub that proves the contract is loadable and fails closed; every impure thing injected | added |

The act described this package as "empty / stub". It is not: the Phase 1
C2 supervisor lives here. Lane C is therefore **additive** — the contract
and stub are siblings of `index.ts`, import nothing from it, and are not
re-exported from it. Still no `package.json`: the directory is not a
workspace member (Founder workspace/lockfile ruling, 2026-09-05) and the
lockfile is unchanged (AE-01 T18).

## Readiness semantics

A worker is **ready** when its log has matched the readiness regex **AND**
its loopback TCP port accepts a connection (`isReady` is the conjunction —
`log-regex AND tcp-port`, never either). Until then it is
`awaiting_readiness` and `send` is refused with `not_ready`. Readiness is
re-proven after every restart. A worker that does not reach readiness
within `deadlineMs` is SIGKILLed with `failure_reason:
readiness_deadline_exceeded`, and the exit goes through the same bounded
restart path as any other exit. The TCP probe throwing counts as "not
accepting". Bounds: `READINESS_BOUNDS` (deadline 100 ms – 300 s, probe
interval 10 ms – 10 s, loopback hosts only).

## Backoff bounds

`RestartPolicy = { maxRestarts, windowMs, backoff: { initialMs, multiplier,
maxMs } }`, refused at `start` (before any spawn) unless every field is
inside `RESTART_POLICY_BOUNDS`: `maxRestarts` 0–10, `windowMs` 1 s – 1 h,
`initialMs` 100 ms – 60 s, `multiplier` 1–4, `maxMs` 100 ms – 300 s,
`initialMs ≤ maxMs`, no unknown fields. Delay for attempt *n* is
`min(initialMs × multiplier^(n−1), maxMs)` — **no jitter**, so a replay is
exact. `NO_RESTART_POLICY` (never restart) is the default a caller opts out
of. Exhausting the budget within the window → `failed`, `failure_reason`
recorded, and no further spawn, ever.

## Stop guarantees

`stop(id, { graceMs })`: SIGTERM, then SIGKILL when `graceMs` elapses
without an exit; the promise resolves **only after the exit is observed**,
with `forced: true` when SIGKILL was sent. A second `stop` joins the first
(one SIGTERM). `stop` during a pending restart cancels the restart. A
stopped worker is never restarted, whatever its policy. `graceMs` is bounded
by `STOP_BOUNDS` (0 – 60 s); an unknown worker is `{ ok: false }`.

## Ops surface

Exactly `ps`, `logs`, `send`, `stop`. `logs` of an unknown worker throws
(`unknown_worker`) — an empty list would be a lie; the ring holds
`LOG_RING_LINES` (1 000) lines with a monotonic `seq` and an `afterSeq`
cursor. `send` refuses `unknown_worker`, `not_ready`, `stopping`,
`frame_too_large` (> 1 MiB), `write_failed`.

## Non-goals

- not an OMP process-supervisor clone: the contract is adopted, no OMP code
  is vendored;
- not the Phase 2 harness, and no Phase 2 claim;
- not a production start path; the Phase 1 C2 supervisor is untouched;
- no second daemon, no `broker.sock`, no `MADV_SOCKET_PATH` revival;
- no network listener of its own — the probe connects to a loopback port
  the worker opened (the suite's listener is a fixture in `test/`).

## Evolved from OMP vs invented here

- **Evolved (mechanism named in the act):** readiness as log-regex + TCP
  port, restart policies with backoff, the `ps / logs / send / stop`
  surface. No OMP code was read or vendored.
- **Invented here:** the AND-only readiness function, the readiness
  deadline as a kill-then-bounded-restart path, `RESTART_POLICY_BOUNDS` and
  refusal at `start`, jitter-free deterministic backoff, the exit-observed
  stop guarantee with join semantics, the injected adapter/scheduler/probe
  design that makes the suite deterministic, and the base-pin test that
  proves `index.ts` untouched.

## Verify

```sh
npm run build && node --test dist/test/worker-supervisor-contract.test.js
```
