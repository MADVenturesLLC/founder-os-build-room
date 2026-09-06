# Prerequisite C C2 — Worker IPC Contract (bounded remediation)

**Status:** BOUNDED PREREQUISITE-C REMEDIATION IMPLEMENTATION — NOT WIRED TO
PRODUCTION GATEWAY.

Authorized by the Founder-confirmed R4 changed-path manifest (2026-09-04)
under the Prerequisite C remediation commission. This document is the IPC
contract deliverable for the Gateway ↔ Worker boundary of the FDR-C C2
architecture:

**COHESIVE SOCKETLESS SUPERVISED BUN BROKER/LEDGER WORKER**

---

## 1. Transport — truthful characterization (R4)

Per the Founder transport clarification
(`SHA-256 6a5dd5aeee056deb18c4ea49912565b9fd5d5063402f166dce2e2adbf8ed0f43`,
BOUND), the transport is Node `child_process.spawn()` stdio pipe channels,
whose Unix/macOS implementation is:

**unnamed AF_UNIX / SOCK_STREAM socketpair descriptors, created internally
by Node/libuv.**

The two endpoints of each channel are created **connected to each other**.
They are NOT described as unconnected, and NOT described as pipe(2)/FIFO.

Permitted properties (all preserved by this implementation and proven by
`test/worker-supervisor.prereq-c.storage.test.ts`):

- unnamed — no filesystem pathname;
- no `bind()` broker endpoint;
- no `listen()` / `accept()` service;
- no TCP;
- no persistent/discoverable broker endpoint;
- not independently addressable by pathname/host/port;
- private descriptor custody only;
- subordinate to Gateway lifetime.

Still prohibited (enforced by review + socket audit):

- `broker.sock`;
- any filesystem Unix-domain socket;
- network listeners;
- Node child `'ipc'` channel;
- a second Gateway; an independent Worker daemon; independent Worker restart.

No direct application-level `socketpair()` call is made; Node/libuv creates
the descriptors internally as part of `spawn()` stdio plumbing.

---

## 2. Channel map (child-side fd numbers)

| child fd | direction          | purpose                                    | custody |
| -------- | ------------------ | ------------------------------------------ | ------- |
| 3        | Gateway → Worker   | control + request frames (multiplexed)     | Gateway holds the SOLE parent-side descriptor ownership (sole control-write capability) |
| 4        | Worker → Gateway   | response frames                            | parent read end |
| 5        | Worker → Gateway   | scrubbed diagnostics (JSON lines; never payloads, never secrets) | parent read end |

- fd 0/1/2 are NOT inherited by the Worker (`stdio: ['ignore', 'ignore', 'ignore', ...]`).
- Gateway is the sole writer of fd 3; Worker death or Gateway death closes
  the channel and the Worker exits on EOF (parent-death discipline — an OS
  descriptor property; no heartbeat substitute).

---

## 3. Framing

Every frame in both directions:

```
[4-byte big-endian unsigned payload length][UTF-8 JSON payload]
```

- Maximum payload: 1 MiB. A frame of length 0 or > 1 MiB is a transport
  violation: the Worker emits a best-effort `transport_broken` error frame
  and exits fail-closed (exit code 2); the Gateway rejects all in-flight
  requests and kills the worker.
- Undecodable JSON payload: same fail-closed treatment.
- The channel preserves byte order; frames are never reordered.

---

## 4. Request frames (Gateway → Worker, fd 3)

```json
{ "id": <positive integer>, "op": "<opcode>", "params": { ... } }
```

| opcode              | params                                                                 | behavior |
| ------------------- | ---------------------------------------------------------------------- | -------- |
| `hello`             | `{ generation: string }`                                               | handshake; Worker accepts the Gateway-minted opaque generation and echoes it in every subsequent response. Correlation ONLY — no authority semantics. Required before any other op. |
| `ping`              | `{}`                                                                    | liveness; returns `{ pong: true }`. |
| `appendEvent`       | `{ event: BridgeEventV1 }`                                             | real durable append through the existing `Ledger` (bun:sqlite, BEGIN IMMEDIATE ... COMMIT). Response is written ONLY after the commit returns. |
| `appendIncident`    | `{ event: BridgeEventV1 }`                                             | same real durable path (used for the incident event returned by `interrupt`). |
| `interrupt`         | `{ reason, currentWriterToken, sessionState, now?, detail? }`          | invokes the EXISTING `packages/broker/src/reconciliation.ts::interruptSession` (+ `session-machine.ts::transitionSession`) over the real committed ledger rows. Returns `InterruptResult`. Invalid transitions throw in the seam and are surfaced fail-closed as `invalid_transition`. |
| `rowsSince`         | `{ since: integer ≥ 0 }`                                               | read committed rows with sequence > since. |
| `verify`            | `{}`                                                                    | real `Ledger.verify()` hash-chain verification. |
| `storageFaultProbe` | `{ kind: "duplicate_event_id", event: BridgeEventV1 }`                 | deterministic real-storage failure: re-appending a committed event_id hits the `events.event_id` UNIQUE constraint inside the real transaction; the ledger rolls back and throws. Proves storage failure is never reported as success. |
| `shutdown`          | `{}`                                                                    | graceful exit: ack, close ledger, exit 0. |

`interrupt` reason vocabulary: `cli_exit | adapter_disconnect | broker_restart | broken_chain`.
`sessionState.kind` vocabulary: `starting | active | paused | interrupted | reconciling | closing | closed`.

## 5. Response frames (Worker → Gateway, fd 4)

Success:

```json
{ "ok": true, "id": <number>, "generation": <string|null>, "result": { ... } }
```

Failure (fail-closed; never silent success):

```json
{ "ok": false, "id": <number|null>, "generation": <string|null>, "error": { "code": "...", "message": "..." } }
```

Error codes: `handshake_required`, `handshake_invalid`, `request_invalid`,
`append_failed`, `invalid_transition`, `interrupt_failed`,
`probe_not_faulted`, `unknown_op`, `transport_broken`.

## 6. Gateway-side correlation and fencing (Gateway-owned)

- Requests are correlated by `id` (positive integer, unique per supervisor).
- Responses carrying an `id` with no outstanding request are never honored.
- Responses must echo the CURRENT Gateway-minted `generation`. A response
  carrying any other generation is stale or forged: the matching pending
  request is rejected fail-closed with `stale_generation`, and the event is
  emitted. The Worker never determines which generation is authoritative.
- Duplicate-worker prevention is a Gateway-side occupancy registry keyed by
  the Gateway's occupancy key; the Worker never participates.
- Worker generation is minted by the Gateway (`gen-<uuid>`), stored only
  Gateway-side, and is an opaque correlation value.

## 7. Worker exit codes

| code | meaning |
| ---- | ------- |
| 0    | control-channel EOF (parent death) or graceful `shutdown` |
| 2    | transport broken (framing/decode violation) — fail closed |
| 3    | startup invalid (missing/invalid bounded environment contract) |
| 4    | control-channel read error — fail closed |

## 8. Credential boundary

**WORKER CREDENTIAL ACCESS: NONE.** The worker environment carries exactly
one variable: `PREREQC_WORKER_DB_PATH`. No provider credential or Founder
secret enters argv, environment, frames, diagnostics, or persistence.

## 9. Determinism policy

The existing broker seam legitimately generates `event_id` via
`crypto.randomUUID()` (and the ledger hashes those identifiers). Proofs
assert deterministic SEMANTICS/INVARIANTS — never byte-identical values for
legitimately generated identifiers or hashes derived from them.

## 10. Supervisor classification

`packages/worker-supervisor` is a BOUNDED PREREQUISITE-C REMEDIATION
IMPLEMENTATION — NOT WIRED TO PRODUCTION GATEWAY. It is not imported by
`gateway-daemon` or any production path. Zero dependencies (Node 22
stdlib only).

Per the Founder workspace/lockfile ruling (2026-09-05), the package
manifest for this bounded proof tranche is WITHDRAWN: the directory is
NOT an npm workspace member, holds no package identity, and requires no
lockfile change. It is consumed only through the authorized root
`tsconfig.json` include entry and a bounded relative-source import. This
absence does not establish the eventual Phase 1 production packaging
model; any future production package identity, workspace membership,
dependency declaration, or lockfile change requires separate
authorization.
