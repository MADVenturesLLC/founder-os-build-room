# seat-output-schema — structured seat outputs (v0)

**Lane A of the OMP→MAD Evolve Pack v0** (Founder act of 2026-09-13,
"mechanism steal, not clone"). Status: controlled/fixture-honest work under
the AE-01 boundaries — NOT production, NOT live occupancy, NO provider
execution, NO Phase 2 claim. Merge is a separate Founder act.

## What it is

A seat or spawned-agent handoff carries an `output_schema` and a
`schema_mode`, and an evaluator turns the candidate into a closed verdict:

| verdict | meaning | `clean` |
|---|---|---|
| `accepted` | the output conforms | `true` — the only PASS-shaped value |
| `accepted_with_flags` | permissive mode; violations carried as flags | `false` |
| `rejected` | strict violation, or anything the evaluator cannot judge | `false` |

Rules the evaluator enforces:

- `strict` rejects on any violation; `permissive` flags and never reports
  `clean`. There is no third mode and no default: an unknown or absent mode
  is `rejected` (`invalid_schema_mode`).
- A defective schema is `rejected` (`malformed_schema`) before any output is
  looked at. A schema is never read as "accepts anything".
- The Seat Registry V1 handoff record is validated by the registry's own
  `validateHandoff` first; a refused record is `rejected` (`invalid_handoff`)
  and the output is not judged.
- The evaluator never throws; a malformed candidate is `rejected`
  (`malformed_candidate`).

## Placement — additive sibling, by choice

The act preferred `packages/seat-registry`. This lane ships a sibling
instead, and records why: the registry package is the ratified V1
(DEC-20260902-02; r7 plan; fixture and contract SHA-256 pins; its static test
names the source "V1, frozen"), and the V1.1 precedent placed its gate
outside the package too. This package imports the registry only through its
public entry (plan F8 / T11) and re-derives nothing the registry owns.

No `package.json`: like `seat-registry` and `worker-supervisor` the directory
is not a workspace member and the lockfile is unchanged (AE-01 T18 pins it;
workspace membership needs its own authorization under the Founder
workspace/lockfile ruling of 2026-09-05). Consumed via the root `tsconfig.json`
include and relative source imports.

## Schema language

Closed and small, on purpose — no JSON Schema, no `$ref`, no vendored
validator: `string` (pattern / length / enum), `integer`, `number`, `boolean`
(with `const`), `null`, `array` (items / bounds), `object` (properties /
required / `additional_properties` with no default). Nesting is bounded at
32; patterns at 512 characters and must compile. `checkSchema` returns every
defect; `validateOutput` returns every violation with a JSON-pointer-like
path.

## Dogfood path

`builderVerificationHandoff(...)` returns the `builder` seat's terminal
handoff (`BUILD_READY_FOR_INDEPENDENT_VERIFICATION`) as a strict structured
handoff. Its schema mirrors the machine-checkable core of the Build Report
that `contracts/seats/builder.md` already requires (work ID, plan path +
SHA-256, repository, branch, base and head SHA, changed paths, commands with
exact results, acceptance matrix, unresolved issues, next role). The `claims`
block pins `merge_authorized`, `production`, and `provider_execution` to
`false`, so a handoff asserting any of them is schema-invalid by
construction.

`fixtures/builder-verification-handoff.valid.json` and `.invalid.json` are the
vendored pair the suite uses to prove **invalid schema ≠ accepted verdict**
under both modes.

## Evolved from OMP vs invented here

- **Evolved (mechanism named in the act):** a per-result `outputSchema` with a
  `strict | permissive` mode on spawned-agent results. No OMP code, UI, or
  schema dialect was read or vendored for this lane; the mechanism was taken
  from its description in the act.
- **Invented here:** the closed verdict enum with `clean` as the only PASS,
  fail-closed handling of unknown modes and defective schemas, the
  well-formedness pass, binding the record to the Seat Registry V1 validator,
  the contract-derived builder schema, and the pinned-false `claims` block.

## Verify

```sh
npm run build && node --test dist/test/seat-output-schema.test.js
```
