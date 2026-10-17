# madbridge-consumed

The MadBridge capabilities Build Room consumes for Phase 4, in their
`7d37a61dcaeaef77c55013c7620deb8445726788` form.

## Authority

- `DEC-20260827-01` §§3.1, 3.3, 3.4 and 3.5 (CONSUME), §4 (the frozen
  consumption contract) and §5 (the thirteen pinned files and their
  consumed exports and invariants).
- `DEC-20260815-17`, Phase 4 authorization §4: Build Room implements those
  rulings for the planner path, at the pinned head, with read-only
  inspection of MadBridge.
- The Founder's direction "GO" of 2026-10-15 (plan r1 Q1): each consumed
  interface is reimplemented in Build Room, as source with no package
  manifest, so the lockfile and workspace are unchanged.
- The Founder's ruling of 2026-10-15: "Consume the unpinned dependencies at
  7d37a61, blob ids recorded".

Build Room remains the governing authority. Consuming this code transfers no
authority and selects no evidence custody.

## What is here

`PROVENANCE.json` lists all 34 files of the pinned closure (the 13 pinned
files and the 21 MadBridge files they import), each with its blob id and one
of four statuses:

- **consumed**: the source with only its import specifiers changed to
  Build Room module paths. The test checks this byte for byte when a
  MadBridge checkout is available.
- **adapted**: consumed with a stated change.
  - `protocol/crypto.ts` hashes with `node:crypto` instead of
    `Bun.CryptoHasher`, giving the same digest.
  - `ledger/ledger.ts` keeps its rows in memory instead of `bun:sqlite`.
    §3.5 consumes persistence, rebuild and reconciliation semantics, "not
    storage medium or write path".
  - `ledger/index.ts` drops the `SCHEMA_SQL` export for the same reason.
  - `adapter/adapter-v1.ts` takes only the `AdapterV1` contract from the two
    adapter files.
- **excluded**: `ledger/src/schema.ts`, the SQLite schema, which is the
  storage medium.
- **deferred**, each with its reason:
  - the two concrete adapters and their shell, attestation and config
    modules. The Founder's Q2a answer names Antigravity, on the active
    model, but §3.4 authorizes no provider binding, so neither is
    consumed. The Gateway's planner worker takes an injected executor
    instead (`gateway-daemon/src/planner-worker.ts`, plan r1 Q2b).
  - `evaluateAction` and its egress, review and command policies govern
    Builder actions, which are Phase 5. The planner path does not call
    them.

Every source file carries a header naming its MadBridge path, its blob and
the changes made.

## Checking for drift

```
MADBRIDGE_CHECKOUT=/path/to/madventures-tui npm test
```

With the variable set, `test/madbridge-consumed.test.ts` re-resolves every
recorded blob at the pin and compares each consumed file with its source.
Without it, those two cases are skipped and say so. The other cases hold the
§5 invariants of each row.

A changed MadBridge interface is not consumed until a Build Room amendment
and a Founder ruling record it (§4).
