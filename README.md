# founder-os-build-room

MAD Ventures OS Build Room — agent orchestration runtime.

Standalone product repository created under `DEC-20260815-01` (ratified `active` 2026-08-15).

## Structure

Monorepo. Present today:

- `packages/contracts` — the lifecycle as types and data: 17 states, 29 events, the T1–T22 transition table, the G1–G22 guards. Pure, zero I/O.
- `packages/ledger` — the pure reducer that enforces that lifecycle and its four core invariants. Pure, zero I/O.

Not yet created: the application packages for the control plane, gateway, and web surfaces (`DEC-20260815-08`). `DEC-20260815-01` clause 2 fixes the repository identity, not the internal layout, and defers the exact package boundaries to later Step 2 decisions.

## Status

**WF-04 Step 3, Slice 1 (contracts/ledger core) — implemented.**

Authorized by the Founder on 2026-08-16 as pure TypeScript packages with zero I/O, zero credentials, and zero infrastructure.

No implementation beyond that slice, and no infrastructure, credentials, provider access, deployment, or activation, is authorized. Those remain gated by later phases under `DEC-20260815-17` and separate Founder authorization. Every phase carries a stop gate that must be Founder-confirmed before the next phase begins, and no phase ships in the same PR as its predecessor.

## Verifying

```
npm install
npm test                            # build + the acceptance-criteria suite
npm run gate:path-audit             # required check
npm run gate:attribution-selftest   # required check, parser regression cases
```

## Ownership

- **Founder:** Michael Daley (MAD Ventures Holdings LLC)
- **Builder:** execution surface per `DEC-20260718-05`
- **Repository:** private, MADVenturesLLC

## Related

- `DEC-20260815-01` — repository creation authority
- `DEC-20260815-08` — hosting/runtime stack
- `DEC-20260815-09` / `DEC-20260815-16` — cost ceilings; recognition choice recorded in `docs/cost-recognition-choice.md`
- `DEC-20260815-11` — the concrete lifecycle this slice implements (v0.10)
- `DEC-20260815-17` — phase sequencing and stop gates
- `DEC-20260815-18` — attribution and gate conventions
- WF-04 — PRD to Build workflow
- WF-17 — Repository onboarding
