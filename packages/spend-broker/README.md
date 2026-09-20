# `@build-room/spend-broker` — v0

Work ID `GLM-20260913-SPEND-BROKER-V0`. OFF-ROADMAP Build Room side bet
(Open-Inspect S3 evolved). A library that **refuses to hand an LLM provider a
usable credential when the room/run is at or over its spend ceiling**, and
interrupts an in-flight turn when a refresh would breach.

Allowed claim language: `SPEND_BROKER_V0`, `COST_CEILING_ENFORCEMENT`. Nothing
else. See "What this is NOT" below — the list is also exported from
`src/claims.ts` and printed in every CLI report.

## Name choice

The commission offered `token-broker` or `spend-broker`. **`spend-broker` was
chosen**: the package's product is ceiling ENFORCEMENT — spend is the governed
quantity, tokens are the meter's reservation unit, and naming the package
after the unit would put the mechanism where the mission belongs. The work ID
already carries the same word, so the claim and the artifact stay legible
together.

## Architecture (prose)

Every live dependency is a port; v0 ships fixtures for all of them plus one
real adapter.

```
caller ──mint(request)──▶ SpendBroker
                            │ 1. per-runId single-flight lock (queue | reject)
                            │ 2. CostMeterPort.checkCeiling ──▶ verdict
                            │      └─ MeterCeilingPort ──▶ @build-room/cost-meter
                            │           evaluateDispatch()  (the ratified rule,
                            │           imported read-only — no second meter)
                            │ 3a. denial ──▶ InterruptSink.emit(InterruptFrame)
                            │        + MintResult{ok:false, spend_ceiling_exceeded, detail}
                            │ 3b. permit ──▶ GatewayPort.mintProviderAuth ──▶ OpaqueToken
                            │ 4. success ──▶ ReservationLedger.record (tokens, expiresAt)
                            └──▶ MintResult{ok:true, token, expiresAt, budgetRemaining}
```

Modules and the one thing each owns:

- `types.ts` — the commissioned shapes (`MintRequest`, `MintResult`,
  `InterruptFrame`), a branded `OpaqueToken`, and the two recorded additions
  (`detail` on denials; `estimatedCost` measured in TOKENS — the meter's
  reservation unit — because converting a dollar estimate to tokens would
  require inventing pricing this package must not own).
- `ports.ts` — `CostMeterPort` ("spent + reserved vs ceiling", verdict-only),
  `GatewayPort` (`mintProviderAuth`, commissioned verbatim), `GatewayError`
  with a typed refusal kind.
- `single-flight.ts` — `RunKeyLocks`, a promise-chain queue keyed per
  **runId** (the commission offers runId or roomId; runId is documented in
  the module — a refresh carries the runId, and cross-run serialization would
  couple unrelated turns; the room ceiling is still protected across runs
  because every check sees the reservations already recorded).
- `reservations.ts` — the in-process ledger that layers broker-issued
  reservations on top of the meter's counters (usage is reported post-hoc,
  `-16` clause 3). Mint STACKS per issuance; `refresh`/`release` REPLACES the
  run's reservations. Reservations expire with the token lifetime. The
  parallel-mints test caught a one-slot-per-runId draft that understated held
  budget — the stacking semantics are pinned by tests.
- `broker.ts` — the flow: check ceiling → deny+interrupt or mint → record.
  Any unexpected gateway throw denies as `provider_unavailable`; silent
  success on a throw is the one direction this package never goes.
- `cost-meter-adapter.ts` — the ONLY code that touches the live meter, via
  its public API (`evaluateDispatch`) and nothing else. Layers
  `reservedTokensForRoom` onto `RoomBudget.tokensReserved`; denies fail-closed
  on missing roomId / unbound room; reports `remainingTokens` from the same
  projected numbers it assembled. The ceiling RULE is never re-implemented
  here.
- `fixtures.ts` — `FixtureGatewayPort` (`fix_…` deterministic handles),
  `FailGatewayPort`, `NotAuthorizedGatewayPort`, `StaticCostMeterPort`,
  `RecordingInterruptSink`.
- `cli.ts` — `status | mint | deny-demo` (+ `gateway-fail`,
  `gateway-not-authorized`), table-dispatched, JSON out.
- `claims.ts` — allowed/forbidden claim lists and the JSON report block.

## Ceiling semantics — read, not invented

The live meter's boundary semantics are used as-is:

- Monthly limb pauses strictly **above** USD 85 (`DEC-20260815-09` clause 2);
  exactly at USD 85 permits — pinned by a test.
- Per-room limb refuses when spent + reserved + requested is **≥** the token
  ceiling (`DEC-20260815-16` clause 2, as the meter mechanizes it). The meter
  source records, at `perRoomTokenLimb`, that this projected reading is an
  open `FOUNDER_DECISION_REQUIRED` question relative to the clause as
  written. **This package does not settle that question** — it asks the
  meter, and the tests pin the live behavior whatever the Founder rules.
- UNKNOWN spend pauses (fail-closed) — pinned by a test with an unbucketable
  run.
- The monthly dollar limb sees the ledger snapshot supplied to the adapter.
  Broker reservations are tokens and are NOT converted to dollars (rates live
  elsewhere by design, `DEC-20260722-01` clause 1); the reservation layer
  guards the per-room token ceiling exactly, and monthly spend lands when the
  snapshot's owner refreshes the ledger — the same post-hoc honesty `-16`
  clause 3 already names.

## Credential classes — api gated, oauth unlimited

Founder ruling on this work, 2026-09-13, recorded verbatim:

> Only API ceiling is $85. OAuth should be unlimited.

Implemented as a routing decision on `MintRequest.credentialKind`:

- `'api'` (the **default**, so an unmarked mint is the metered kind):
  ceiling-gated exactly as described above — breach denies and emits an
  interrupt frame.
- `'oauth'`: **no meter call, no reservation, no spend-ground interrupt**. The
  mint proceeds to the gateway regardless of any ceiling. Gateway refusals
  (`not_authorized`, `unavailable`, unexpected crashes) still deny — unlimited
  is not ungated from the gateway. A successful oauth mint reports **no
  `budgetRemaining`** — no budget was consulted, so no budget figure is
  reported rather than a misleading one.

Scope of the ruling, stated plainly: this is a broker-routing decision inside
this side-bet package. It does not amend the meter, the monthly ledger, or
`DEC-20260815-09`'s USD 85 total-spend ceiling — the meter is untouched and
still counts whatever its ledger contains. Reconciling subscription-backed
(OAuth) provider access with the ratified monthly total remains governed by
the decision corpus, not by this package.

## What this is NOT

Passing the test suite is evidence of fixture-level behavior only. It is
**not evidence of**:

- `PHASE_0`
- `OCCUPANCY_PROOF`
- `GATEWAY_HONESTY`
- `ROOM_RUNTIME`
- `AE01_FIX`
- `PRODUCTION_MERGE_AUTHORITY`

`packages/gateway-daemon/**` was not modified and is not integrated — it is
the AE-01 A2 candidate and is FROZEN (`CHANGES_REQUESTED`). No socketpair, no
Keychain, no real GatewayDaemon calls, no network in v0.

## Usage

```ts
import { SpendBroker, MeterCeilingPort, FixtureGatewayPort, RecordingInterruptSink } from '@build-room/spend-broker';

const broker = new SpendBroker({
  gateway: new FixtureGatewayPort(),          // real gateway = v1, separately authorized
  meter: new MeterCeilingPort({ snapshot, reservedTokensForRoom: (roomId) => ledger.activeTokens(roomId, now) }),
  sink: new RecordingInterruptSink(),
  tokenTtlMs: 60_000,                          // broker-assigned expiry in v0 — see caveat
});

// API credential — ceiling-gated; breach denies + interrupts.
const gated = await broker.mint({ runId, roomId, provider, purpose, estimatedCost: 300, credentialKind: 'api' });
if (!gated.ok && gated.reason === 'spend_ceiling_exceeded') {
  // gated.interrupt was already emitted to the sink
}

// OAuth credential — unlimited (Founder ruling 2026-09-13): no meter call,
// no reservation; only the gateway itself can refuse it.
const oauth = await broker.mint({ runId, provider, purpose, credentialKind: 'oauth' });
```

CLI (one-command founder demos — all fixture-only):

```bash
npm run spend-broker:demo          # builds, then: node dist/packages/spend-broker/src/cli.js deny-demo
node dist/packages/spend-broker/src/cli.js status
node dist/packages/spend-broker/src/cli.js mint --run-id r1 --tokens 300
node dist/packages/spend-broker/src/cli.js mint --run-id r2 --kind oauth   # unlimited
node dist/packages/spend-broker/src/cli.js oauth-unlimited   # api denied over a breached ceiling, oauth unlimited, same room
node dist/packages/spend-broker/src/cli.js gateway-fail
node dist/packages/spend-broker/src/cli.js gateway-not-authorized
```

Every command prints one JSON document including the `claims` block, and
exits 0 when it ran — a denied mint is the product working, not a CLI
failure.

### v0 caveat: expiry is broker-assigned

The commissioned `GatewayPort` returns only a token, so `expiresAt` (and the
matching reservation lifetime) is assigned by the broker from `tokenTtlMs`,
and the fixture gateway issues handles under that convention. A real gateway
that reports its own expiry needs a port change — a v1 decision, recorded
here rather than smuggled into the commissioned shape.

## Tests

`test/spend-broker.test.ts` — fixture-only, no network (by construction:
nothing in the package imports a network module). The suite pins, among
others: mint under ceiling; deny + one interrupt frame at and over the
ceiling (including the live ≥ boundary); two parallel mints serialize and
cannot both succeed past the remaining budget; two parallel mints that fit
stack their reservations; refresh replaces and the breaching refresh
interrupts with nothing left reserved; `provider_unavailable` /
`not_authorized` / unexpected-crash mappings; the monthly strictly-above-$85
boundary and UNKNOWN-is-absorbing through the real adapter; reservation
expiry; and the CLI demo end to end. The 2026-09-13 credential-class ruling
is pinned separately: an oauth mint succeeds over a breached ceiling where
the api mint is denied, the meter is never consulted for oauth (call-count
fixture), oauth records no reservation and leaves api budget untouched,
gateway refusals still deny oauth, and the unmarked default is api.

## Blast radius

New package only: `packages/spend-broker/**`, `test/spend-broker.test.ts`,
one `include` line in `tsconfig.json`, one script in the root `package.json`,
one section in `AGENTS.md`. Zero edits to `packages/gateway-daemon/**`, the
freeze stack, or `test/phase0/**`.
