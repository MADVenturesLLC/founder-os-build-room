# founder-os-build-room

MAD Ventures OS Build Room — agent orchestration runtime.

Standalone product repository created under `DEC-20260815-01` (ratified `active` 2026-08-15).

## Structure

Monorepo. Present today:

**Pure — zero I/O, zero credentials, enforced by a static test:**

- `packages/contracts` — the lifecycle as types and data: 17 states, 29 events, the T1–T22 transition table, the G1–G22 guards.
- `packages/ledger` — the reducer that enforces that lifecycle and its four core invariants.
- `packages/cost-meter` — the ratified spend rule as a function. Carries no rate data; the canonical price table lives in `founder-os-console` (`DEC-20260722-01`).
- `packages/gateway-protocol` — the shared signed-message protocol: canonical bytes, envelope validation, bounds, encodings, and the clock-reliability evaluator. Zero dependencies, so both sides of the wire derive signed bytes from one implementation.
- `packages/gateway-registry` — the gateway lifecycle vocabulary and the pure projection reducer.

**Impure by design:**

- `packages/control-plane` — the single writer to the durable ledger: Postgres storage, the HTTP surface, the boot sequence.
- `packages/run-harness` — performs the Phase 2 run cycle, judges it against the Founder's three conditions, and emits the evidence bundle.
- `packages/gateway-daemon` — the macOS-local gateway host: Keychain custody through `/usr/bin/security`, two identity lanes, timers, an IPC socket and a ring buffer.
- `packages/gateway-cli` — the `buildroom` five-verb surface: `enroll`, `status`, `doctor`, `providers`, `tail`.

The web surface is not created (`DEC-20260815-08`), and remains deferred. `DEC-20260815-01` clause 2 fixes the repository identity, not the internal layout, and defers the exact package boundaries to later Step 2 decisions.

## Status

**Phase 1 (pure protocol/ledger) — complete.** Founder-confirmed 2026-08-16 at `main@4155761` under `DEC-20260815-17` clause 2.

**Phase 2 (cloud skeleton) — in progress.** Authorized by the Founder **in session on 2026-08-17** as the full arc *provision → wire → run three times → return at the stop gate*, on the bound reduced stack: **Railway** control plane plus **Neon** operational Postgres. The web tier and Redis/queue are deferred and are not authorized.

> **The workflow record has not been reconciled with that authorization, and that is flagged here rather than smoothed over.** The WF-04 Sentinel record still reads `Ready-to-start` with last activity 2026-07-19, and the last authorization recorded there covers WF-04 Step 3 **Slice 1**, dated 2026-08-16 — no separate full-Phase-2 authorization dated 2026-08-17 appears in it. The sentence above therefore rests on a Founder direction given in session and recorded in this repository, not on the workflow record, and the two disagree.
>
> Raised by CodeRabbit on PR #2 against those records. **Reconciling them is a Founder act.** Either the WF-04 record is updated to carry the 2026-08-17 authorization, or this claim is narrowed to what the record holds — and `builder` may do neither: writing an authorization into the record would be manufacturing one, and narrowing a Founder's stated scope would be overriding them. Until it is reconciled, read this line as *what the Founder directed in session* and the WF-04 record as *not yet updated*.

What is built here: the control plane, the cost meter, and the run harness. What is **not** claimed by the code alone — provisioning, deployment, three-run evidence, and the Founder-confirmed stop gate that closes the phase. Architecture §3.17: *"Completing three runs authorizes nothing."*

**Gateway Enrollment Pairing (Phase 3's first authorized mechanism) — built on this branch, awaiting independent retest.** This work is authorized by its own commissioning contract — Gateway Enrollment Pairing Rev 4.7 — not by the Phase 2 authorization above: the three-act pairing (mint → redeem → confirm) with code-only redemption authentication, migration `0003_gateway_registry`, the control-plane side of the signed-message protocol, fenced leadership with published challenges, signed session-start and heartbeat with replay discipline, the macOS daemon with Keychain custody and two identity lanes, and the `buildroom` five-verb CLI. An independent test pass against the delivered build returned `TEST_FAIL — REQUEST CHANGES`; its ten findings (B1–B6, T1–T4) are corrected on this branch, and a fresh independent retest is pending. **Nothing here claims the Phase 3 stop gate.** The Founder-reserved Phase 3 run definition is untouched by this branch, and completing the mechanism authorizes nothing.

Phases 3 through 7 carry no authorization beyond that commission — the Gateway Enrollment Pairing mechanism above is the full extent of authorized Phase 3 work. Every phase carries a stop gate that must be Founder-confirmed before the next begins, and no phase ships in the same PR as its predecessor.

## Verifying

```sh
npm install
npm test                            # build + the acceptance-criteria suite

# The Postgres integration suite runs only when TEST_DATABASE_URL is set, and
# says so when it skips. It is deliberately NOT keyed on DATABASE_URL — that is
# the variable the deployed service reads, and a shell carrying the production
# value would point the suite at the live ledger.
TEST_DATABASE_URL=postgresql://…/buildroom_test npm test

# The strict storage command. Unlike `npm test`, it REFUSES to start without a
# database — a command whose job is to exercise Postgres must not be able to
# report success by skipping everything.
TEST_DATABASE_URL=postgresql://…/buildroom_test npm run test:storage

# The real-Keychain suite. Darwin only, opt-in only, synthetic item, never in
# CI: touching a developer's login Keychain because they typed `npm test` would
# be a surprising thing for a test suite to do.
npm run test:custody:macos

npm run gate:path-audit             # required check
npm run gate:attribution-selftest   # required check, parser regression cases

# The contract integrity gate. It scans the authorizing contract DOCUMENT,
# which lives outside this repository, so it takes the path explicitly and is
# not a CI step.
npm run gate:integrity -- <contract-path>

# Local CLI smoke: the five verbs against a throwaway HOME, contacting no
# control plane and performing no Founder act.
npm run smoke:gateway
```

Gateway enrolment is documented in `docs/gateway-ops-actions-log-runbook.md`,
which covers the manual same-day ops-actions-log obligation that attaches when a
live mint, confirm or revoke is performed.

## Running the Phase 2 gate

Against a deployed control plane. The evidence bundle is written whether or
not the gate passes — a failed sequence is exactly what exit criterion 4 wants
retained — and the exit code follows the gate.

### Dry run, against a local Postgres

The gate can be exercised end to end with no deployed service and no provider
account, which is how the harness gets tested before it is pointed at real
infrastructure:

```sh
# a throwaway Postgres, then:
export DATABASE_URL=postgresql://…/buildroom_dev
export CONTROL_PLANE_TOKEN="$(openssl rand -hex 24)"   # ≥32 chars; the room
                                                       # endpoints demand it
npm run build && ./scripts/local-control-plane.sh start

export CONTROL_PLANE_URL=http://127.0.0.1:8080
export PHASE2_RESTART_COMMAND="$PWD/scripts/local-control-plane.sh restart"
export PHASE2_ACTOR_ID=… PHASE2_ACTUAL_MODEL=…
export PHASE2_ENVIRONMENT=local-dry-run   # so the bundle cannot be mistaken
export PHASE2_EVIDENCE_PATH=/tmp/dry-run  # for Phase 2 evidence
npm run phase2:runs
```

A dry run on 2026-08-17 is what caught the harness sending a verification event
the ledger refused — every stubbed test passed while all three real runs failed.
Write the bundle outside the repository and label the environment, so a dry run
is never mistaken for the gate's evidence.

### Against a deployed control plane

```sh
export CONTROL_PLANE_URL=https://…      # the deployed control plane
export CONTROL_PLANE_TOKEN=…            # the same secret the service runs with
export PHASE2_ACTOR_ID=…                # who is running this; never inferred
export PHASE2_ACTUAL_MODEL=…            # the model that actually did the work
# optional: PHASE2_RESTART_COMMAND, else the restart is recorded as external
npm run build && npm run phase2:runs
```

## Ownership

- **Founder:** Michael Daley (MAD Ventures Holdings LLC)
- **Builder:** execution surface per `DEC-20260718-05`
- **Repository:** private, MADVenturesLLC

## Related

- `DEC-20260815-01` — repository creation authority
- `DEC-20260815-08` — hosting/runtime stack
- `DEC-20260815-09` / `DEC-20260815-16` — cost ceilings; the recognition choice is selected and recorded in `docs/cost-recognition-choice.md`
- `DEC-20260815-11` — the concrete lifecycle this slice implements (v0.10)
- `DEC-20260815-17` — phase sequencing and stop gates
- `DEC-20260815-18` — attribution and gate conventions
- `docs/phase-2-provider-controls.md` — provider spend controls and the Founder-accepted Neon gap
- `docs/phase-2-known-limits.md` — review findings recorded rather than fixed in this phase
- WF-04 — PRD to Build workflow
- WF-17 — Repository onboarding
