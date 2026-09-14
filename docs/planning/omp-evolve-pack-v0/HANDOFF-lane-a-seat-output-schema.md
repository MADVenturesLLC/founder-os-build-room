# HANDOFF — Lane A: structured seat outputs (`build/seat-output-schema-v0`)

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
| Branch | `build/seat-output-schema-v0` |
| Base pin (`git rev-parse origin/main` at act time) | `736b12b33a20dd055d88ba0ec1e30621797cc959` (= AE-01 A2 merge, PR #30) |
| Implementation commit | `c54ba51637f7aeda2ac585f3180b9b3570da1a69` |
| Head SHA | the commit that adds this file (branch head; reported in the session handoff) |
| Package | `packages/seat-output-schema` (additive sibling; choice recorded below) |
| Actor | `session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`, surface `claude-code`, role `builder` |

## Changed paths

- `packages/seat-output-schema/src/schema.ts` (ADD)
- `packages/seat-output-schema/src/structured-handoff.ts` (ADD)
- `packages/seat-output-schema/src/dogfood.ts` (ADD)
- `packages/seat-output-schema/src/index.ts` (ADD)
- `packages/seat-output-schema/fixtures/builder-verification-handoff.valid.json` (ADD)
- `packages/seat-output-schema/fixtures/builder-verification-handoff.invalid.json` (ADD)
- `packages/seat-output-schema/README.md` (ADD)
- `test/seat-output-schema.test.ts` (ADD)
- `tsconfig.json` (MODIFY — one include entry)
- `docs/planning/omp-evolve-pack-v0/HANDOFF-lane-a-seat-output-schema.md` (ADD — this file)

Not changed: `packages/seat-registry/**`, `package.json`, `package-lock.json`,
CI, `AGENTS.md`, `README.md`, any daemon or control-plane source.

Paths named in this file that do not exist at the base: every path under
`packages/seat-output-schema/`, `test/seat-output-schema.test.ts`, and this
directory — all added by this lane.

## Package choice — additive sibling, not `packages/seat-registry`

The act preferred `packages/seat-registry` "or additive sibling if registry
ownership forbids — document choice". Chosen: sibling. Evidence: the
registry package is the ratified V1 under DEC-20260902-02 and the r7 plan,
with fixture and contract SHA-256 pins (`conditions.ts`, test 3) and a
static test that names `packages/seat-registry/src` "V1, frozen"
(`test/seat-registry-integration-static.test.ts`); the V1.1 integration
placed its gate in `control-plane/src/seat-policy.ts` rather than inside the
package and described itself as additive-only. Adding mechanism modules to
the ratified doctrine-mirror package would blend ratified content with new
mechanism under one pin. The sibling imports the registry only through its
public entry (plan F8 / T11) and re-derives nothing the registry owns.

## What was built

- `outputSchema` + `schemaMode: strict | permissive` on a Seat Registry V1
  handoff (`StructuredHandoff`), and `evaluateStructuredHandoff` producing
  a closed verdict `accepted | accepted_with_flags | rejected` with `clean`
  true only for `accepted`.
- Invalid results are flagged, never silently accepted: strict rejects,
  permissive returns `accepted_with_flags` (never `clean`), and unknown
  mode / defective schema / refused V1 record / malformed candidate are all
  `rejected`. No default mode exists.
- One dogfood seat path: the builder seat's terminal handoff
  `BUILD_READY_FOR_INDEPENDENT_VERIFICATION` as a strict machine-checkable
  handoff whose schema is derived from the Build Report fields in
  `contracts/seats/builder.md`, with `claims.{merge_authorized, production,
  provider_execution}` pinned to `false`.
- Fixture pair proving invalid schema ≠ accepted verdict under both modes.

## Test evidence

Focused:

```
npm run build && node --test dist/test/seat-output-schema.test.js
# tests 28 · pass 28 · fail 0
```

Full suite on this branch (`npm test`, credential-free; storage cases
self-skip without `TEST_DATABASE_URL`, as on `main`):

```
# tests 883 · suites 323 · pass 883 · fail 0    (main baseline: 855 / 316 / 855 / 0)
```

Gates run locally on the implementation commit: `npm run typecheck` PASS,
`npm run gate:path-audit` PASS, `npm run gate:attribution-selftest` PASS,
`npm run gate:verify-check` PASS (3/3), `scripts/attribution-shape-check.sh
pr origin/main HEAD build/seat-output-schema-v0` PASS, `eslint` on the new
files 0 findings, `git diff --check` clean.

## Evolved from OMP vs invented

- Evolved (mechanism named in the act): per-result `outputSchema` with
  `strict | permissive` mode on spawned-agent results. No OMP code, UI, or
  schema dialect was read or vendored for this lane; the mechanism was taken
  from its description in the act.
- Invented here: the closed verdict enum with `clean` as the only PASS;
  fail-closed handling of unknown modes and defective schemas; the schema
  well-formedness pass with depth and pattern bounds; binding the record to
  the registry's own `validateHandoff`; the contract-derived builder schema;
  the pinned-false `claims` block.

## Blast radius

Zero edits to existing source. One include line in `tsconfig.json`. No
manifest, no workspace membership, lockfile byte-identical (AE-01 T18 pin
holds). Nothing consumes the package yet; Lane D depends on it (stacked
branch).

## Open items / decisions

None blocking. Lane D (`build/gateway-hooks-v0`) is stacked on this
branch's head by the act's stated preference ("prefer depend on A"); its PR
will show this lane's diff until this lane merges. Merge remains a separate
Founder act naming the exact head SHA.
