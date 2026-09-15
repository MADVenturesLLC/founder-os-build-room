# founder-os-build-room

MAD Ventures OS Build Room — agent orchestration runtime.

Standalone product repository created under `DEC-20260815-01` (ratified `active` 2026-08-15).

> **This README is descriptive documentation. It reflects Founder decisions
> recorded in FounderOS; it does not create authority of its own.** Where
> this file and a controlling FounderOS decision disagree, the FounderOS
> decision governs, and this file is stale until corrected. `AGENTS.md`
> states the same relationship for repository conventions.

## Structure

Monorepo. Present today:

**Pure — zero I/O, zero credentials, enforced by a static test:**

- `packages/contracts` — the lifecycle as types and data: 17 states, 29 events, the T1–T22 transition table, the G1–G22 guards.
- `packages/ledger` — the reducer that enforces that lifecycle and its four core invariants.
- `packages/cost-meter` — the ratified spend rule as a function. Carries no rate data; the canonical price table lives in `founder-os-console` (`DEC-20260722-01`).
- `packages/gateway-protocol` — the shared signed-message protocol: canonical bytes, envelope validation, bounds, encodings, and the clock-reliability evaluator. Zero dependencies, so both sides of the wire derive signed bytes from one implementation.
- `packages/gateway-registry` — the gateway lifecycle vocabulary and the pure projection reducer.
- `packages/journal` — the four ratified command-journal canonical serialization contracts (envelope, plan digest, command-event row, decision record row) and chain framing, per `docs/command-journal-contract.md` §6.2. Pure, zero I/O.

**Impure by design:**

- `packages/control-plane` — the single writer to the durable ledger: Postgres storage, the HTTP surface, the boot sequence.
- `packages/run-harness` — performs the Phase 2 run cycle, judges it against the Founder's three conditions, and emits the evidence bundle.
- `packages/gateway-daemon` — the macOS-local gateway host: Keychain custody through `/usr/bin/security`, two identity lanes, timers, an IPC socket and a ring buffer.
- `packages/gateway-cli` — the `buildroom` five-verb surface: `enroll`, `status`, `doctor`, `providers`, `tail`.

The web surface is not created (`DEC-20260815-08`), and remains deferred. `DEC-20260815-01` clause 2 fixes the repository identity, not the internal layout, and defers the exact package boundaries to later Step 2 decisions.

## Status

**Phase 1 (pure protocol/ledger) — complete.** Founder-confirmed 2026-08-16 at `main@4155761` under `DEC-20260815-17` clause 2.

**Phase 2 (cloud skeleton) — complete.** Authorized by the Founder **in session on 2026-08-17** as the full arc *provision → wire → run three times → return at the stop gate*, on the bound reduced stack: **Railway** control plane plus **Neon** operational Postgres. The web tier and Redis/queue are deferred and are not authorized. Stop gate confirmed by the Founder 2026-08-18 (`DEC-20260815-17`, *Founder Confirmation — Phase 2 Stop Gate (2026-08-18)*).

> **The workflow record has not been reconciled with that authorization, and that is flagged here rather than smoothed over.** The WF-04 Sentinel record still reads `Ready-to-start` with last activity 2026-07-19, and the last authorization recorded there covers WF-04 Step 3 **Slice 1**, dated 2026-08-16 — no separate full-Phase-2 authorization dated 2026-08-17 appears in it. The sentence above therefore rests on a Founder direction given in session and recorded in this repository, not on the workflow record, and the two disagree.
>
> Raised by CodeRabbit on PR #2 against those records. **Reconciling them is a Founder act.** Either the WF-04 record is updated to carry the 2026-08-17 authorization, or this claim is narrowed to what the record holds — and `builder` may do neither: writing an authorization into the record would be manufacturing one, and narrowing a Founder's stated scope would be overriding them. Until it is reconciled, read this line as *what the Founder directed in session* and the WF-04 record as *not yet updated*.
>
> **Historical note, added so this paragraph is not read as describing the current phase.** This disagreement concerns Phase 2, which closed its stop gate 2026-08-18. Phase 3 has since closed (2026-08-31) and Phase 4 is authorized (2026-08-31, see below); the reconciliation question above was never revisited and is left as the unreconciled historical record it was when written.

What is built here: the control plane, the cost meter, and the run harness. What is **not** claimed by the code alone — provisioning, deployment, three-run evidence, and the Founder-confirmed stop gate that closes the phase. Architecture §3.17: *"Completing three runs authorizes nothing."*

**Gateway Enrollment Pairing (Phase 3's first authorized mechanism) — merged to `main` in [PR #3](https://github.com/MADVenturesLLC/founder-os-build-room/pull/3).** This work is authorized by its own commissioning contract — Gateway Enrollment Pairing Rev 4.7 — not by the Phase 2 authorization above: the three-act pairing (mint → redeem → confirm) with code-only redemption authentication, migration `0003_gateway_registry`, the control-plane side of the signed-message protocol, fenced leadership with published challenges, signed session-start and heartbeat with replay discipline, the macOS daemon with Keychain custody and two identity lanes, and the `buildroom` five-verb CLI. The merged PR records the correction, review, and test evidence for this mechanism. **Nothing here claims the Phase 3 stop gate.** The Founder-reserved Phase 3 run definition is untouched by this branch, and completing the mechanism authorizes nothing.

**Phase 3 counted-run harness — implementation commissioned, no run authorized.**
The Founder adopted the counted-run addendum in FounderOS PR #289 and separately
commissioned this code slice against Build Room
`5df7bd222a99e49c5f5a8ea449ffa2ef28a14de4`. The slice adds a sibling Phase 3
runner, deterministic data-only fixture adapter, migration
`0005_phase3_run_evidence`, bounded signed-heartbeat evidence and redacted
export. It does not add a sixth `buildroom` verb, change Phase 2 evidence, or
authorize `Phase3-CR1`; see `docs/phase3-counted-run-harness.md`.

Phases 3 through 7 carried no authorization beyond the pairing mechanism and
the counted-run harness commission above. That was the state as of the
counted-run harness commission; it is stated here as a dated historical
record, not as the current position. Neither mechanism authorized a counted
run then, and every phase carries a stop gate that must be Founder-confirmed
before the next begins, and no phase ships in the same PR as its predecessor.
The later Founder rulings below close Phase 3 (2026-08-31) and authorize
Phase 4 (2026-08-31, journal-first), superseding this sentence's scope.

**Phase 3 stop gate — durably closed 2026-08-31.** After a 2026-08-27
reconciliation ruling that rescinded an earlier closure conclusion and named
three conditions, the Founder ruled the Phase 3 stop gate satisfied on
2026-08-31 (`DEC-20260815-17`, *Founder Ruling — Phase 3 Stop-Gate Closure
(2026-08-31)*). The original seven Phase 3 exit criteria and the CR1 → CR2 →
CR3 passed counted-run sequence remain intact and unaltered. This closure
authorizes nothing beyond itself — no Phase 4 work, deployment, provisioning,
or spend followed automatically from it.

**Phase 4 (Planner Loop) — authorized 2026-08-31, journal-first.** The
Founder authorized Phase 4 the same day, from Build Room `main` at
`ad23c6ea6117a54bce5be7208a5a5768ec5bfbc9` (`DEC-20260815-17`, *Founder
Authorization — Phase 4 (Planner Loop) (2026-08-31)*). The implementation
order is fixed: establish the command-journal contract and invariants first;
implement and independently test the journal foundation; integrate the
already-authorized consumed capabilities; implement the governed planner
loop; test the integrated lifecycle; prepare for separately authorized
counted runs. No governed Planner command may execute until the journal
foundation is present and passes its required tests. Journal-first step 1
(the contract) and step 2 (serialization contracts and golden vectors) are
both merged to `main` — `docs/command-journal-contract.md` (v0.17, merged
under a SHA-named Founder merge authorization at exact head `b92889e`) and
`packages/journal`. The contract document's own header still reads "Status:
proposed" by its own internal convention (an implementation contract states
what it fixes for the implementation, not a governance ratification label);
that it is merged and in force for Phase 4 implementation is recorded here,
not by editing the contract's own wording. Phase 5 remains unauthorized, and
the three counted Phase 4 runs require separate Founder entry authorization.

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
npm run gate:verify-check           # required check — unverified checks count as failing (docs/verify-gate-integrity.md)
```

### Not a required check

```bash
# The custody pin gate. The records under
# docs/planning/command-journal/custody/ cite each other by blob id, SHA-256,
# byte and line count, and one publishes a sed recipe for a hash-pinned
# extract. All of it is hand-maintained and all of it fails silently — a stale
# pin still looks like a pin. This recomputes every declaration from the file
# it names, and fails rather than passing if it finds records but reads no
# pins. It is deliberately NOT a required check: making it one is a
# repository-settings change and a Founder act.
npm run gate:custody-pin-check

# The checker's own parser regression cases: synthetic records in a
# throwaway repo, asserting that a moved format, an ambiguous record and
# a hostile sed recipe each fail. Runs in CI ahead of the check above.
npm run gate:custody-pin-selftest

# Both of the above are Linux/GNU-only and exit 2 elsewhere. They execute
# the sed recipe a record publishes rather than reimplementing it, which
# needs GNU sed's --sandbox (a BSD/macOS sed cannot run them safely and
# would read a GNU recipe differently anyway); the selftest fixtures also
# use coreutils sha256sum. On macOS, run them in CI rather than locally.
```

### Takes an argument, or is not a CI step

```bash
# The contract integrity gate. It scans the authorizing contract DOCUMENT,
# which lives outside this repository, so it takes the path explicitly and is
# not a CI step.
npm run gate:integrity -- <contract-path>

# Local CLI smoke: the five verbs against a throwaway HOME, contacting no
# control plane and performing no Founder act.
npm run smoke:gateway
```

The Phase 3 implementation also exposes `npm run phase3:counted-run`. Do not run
it without a separate Founder entry authorization and a complete nonsecret plan.

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
