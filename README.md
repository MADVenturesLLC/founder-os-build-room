# founder-os-build-room

MAD Ventures OS Build Room — agent orchestration runtime.

Standalone product repository created under `DEC-20260815-01` (ratified `active` 2026-08-15).

## Structure

Monorepo. Present today:

**Pure — zero I/O, zero credentials, enforced by a static test:**

- `packages/contracts` — the lifecycle as types and data: 17 states, 29 events, the T1–T22 transition table, the G1–G22 guards.
- `packages/ledger` — the reducer that enforces that lifecycle and its four core invariants.
- `packages/cost-meter` — the ratified spend rule as a function. Carries no rate data; the canonical price table lives in `founder-os-console` (`DEC-20260722-01`).

**Impure by design:**

- `packages/control-plane` — the single writer to the durable ledger: Postgres storage, the HTTP surface, the boot sequence.
- `packages/run-harness` — performs the Phase 2 run cycle, judges it against the Founder's three conditions, and emits the evidence bundle.

Not yet created: the gateway and web surfaces (`DEC-20260815-08`), both deferred out of Phase 2. `DEC-20260815-01` clause 2 fixes the repository identity, not the internal layout, and defers the exact package boundaries to later Step 2 decisions.

## Status

**Phase 1 (pure protocol/ledger) — complete.** Founder-confirmed 2026-08-16 at `main@4155761` under `DEC-20260815-17` clause 2.

**Phase 2 (cloud skeleton) — in progress.** Authorized by the Founder 2026-08-17 as the full arc *provision → wire → run three times → return at the stop gate*, on the bound reduced stack: **Railway** control plane plus **Neon** operational Postgres. The web tier, gateway platform and Redis/queue are deferred and are not authorized.

What is built here: the control plane, the cost meter, and the run harness. What is **not** claimed by the code alone — provisioning, deployment, three-run evidence, and the Founder-confirmed stop gate that closes the phase. Architecture §3.17: *"Completing three runs authorizes nothing."*

Phases 3 through 7 are not authorized. Every phase carries a stop gate that must be Founder-confirmed before the next begins, and no phase ships in the same PR as its predecessor.

## Verifying

```sh
npm install
npm test                            # build + the acceptance-criteria suite
npm run gate:path-audit             # required check
npm run gate:attribution-selftest   # required check, parser regression cases
```

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
- `DEC-20260815-09` / `DEC-20260815-16` — cost ceilings; the **open** recognition choice is documented, and deliberately not selected, in `docs/cost-recognition-choice.md`
- `DEC-20260815-11` — the concrete lifecycle this slice implements (v0.10)
- `DEC-20260815-17` — phase sequencing and stop gates
- `DEC-20260815-18` — attribution and gate conventions
- WF-04 — PRD to Build workflow
- WF-17 — Repository onboarding
