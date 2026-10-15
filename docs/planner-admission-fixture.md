# Planner Admission Fixture (A1 — Background-Agents work package A, first slice)

Commission: FOUNDER COMMISSION — BACKGROUND-AGENT ADAPTATION: A0 / A1 ONLY
(2026-09-12), over `BR-Builder-Background-Agents-Handoff-r2.md` (PROCEED-WITH-PLAN
plan review). Base `ef7a47920b8a2a022f9e6bf26ce22119fe466217`, branch
`builder/background-agents-a1-admission-fixture`.

## What this is

`packages/run-harness/src/planner-admission-fixture.ts` exports one function,
`runPlannerAdmissionFixture(request, deps)`, that:

1. evaluates an injected fixture policy verdict (`deps.policy()`);
2. evaluates the REAL existing cost meter (`evaluateDispatch` from
   `@build-room/cost-meter`) against the request;
3. preserves BOTH decisions in the result;
4. refuses invocation when either gate refuses (`outcome: 'refused'`);
5. invokes ONLY the injected fake callback (`deps.invokeFixture`) when both
   permit.

It is a test harness for the future governed Planner admission path. It is
fixture-only:

- every result carries `fixture: true`;
- a synthetic positive policy verdict must carry `source:
  'synthetic-fixture'` — it is explicitly labelled test authority, never a
  production grant (the real registry binding's positive resolution is
  unreachable in Seat Registry V1 by design);
- `completed` means the fake callback completed — never that a production
  command or phase completed;
- `trace` is an in-memory test trace (`policy_evaluated`,
  `cost_evaluated`, `fixture_invoked`), not an audit journal or durability
  receipt;
- an invocation failure returns `failed` without serializing raw error
  text (no message, name, or stack — proven by the FAKE_SECRET_SENTINEL
  test);
- policy or meter exceptions propagate BEFORE invocation (never converted
  into admission outcomes, never reaching the fake callback).

## Import boundary (deliberate)

This module is NOT exported from any package index (`packages/run-harness/src/index.ts`
does not reference it) and is not wired to any CLI, production runner,
control-plane route, Gateway, or provider adapter.
`test/planner-admission-fixture.test.ts` includes a detector that scans the
production locations — `packages/control-plane/src`, `packages/gateway-daemon/src`,
`packages/gateway-cli/src`, and the run-harness production sources (everything
under `packages/run-harness/src` except this fixture) — for runtime
(non-type-only) imports of `planner-admission-fixture`, and rejects any hit.
The detector is proven against a synthetic forbidden import (built under the
OS temp dir) so an empty scan is not the only evidence it works.

## Cost-meter ceiling comparison (corrected under the 2026-08-29 ruling)

The real meter's per-room limb (`packages/cost-meter/src/meter.ts`,
`perRoomTokenLimb`) refuses when `spent + reserved >= ceiling`, the
comparison `DEC-20260815-16` §Ceiling Inclusivity Clarified (2026-08-29)
rules. Until the WF-04 Step 3 meter correction it refused when `spent +
reserved + requested >= ceiling` (exclusive), as recorded in
`docs/phase-2-known-limits.md` §9, now closed.

Test 8 holds the ruled comparison with `tokensSpent: 700, tokensReserved: 0,
tokenCeiling: 1000, requestedTokens: 300, perRunTokenCap: 300`: the per-room
limb admits (700 < 1000) and so does the per-run cap (300 > 300 is false).
Before the correction this case pinned the exclusive limb's refusal; the
correction updated the expectation within its own scope, as this note
required. It must not be reverted to the exclusive reading.

## Unimplemented production dependencies (deliberate)

Nothing here implements or qualifies:

- the command journal (durable pre-dispatch recording; A2 dependency —
  the PR #27 lane, Tranche A schema preflight, merged 2026-09-13 and is no
  longer an active writer; the journal schema came later with Tranche B,
  PR #54, and no production caller of `command_journal_append` exists);
- budget reservation or settlement (A3; blocked pending a landed, qualified,
  separately assigned WF-04 Step 3 inclusive-meter correction, or an
  explicit Founder exception — neither exists at this base);
- any provider adapter, credential path, Keychain access, Gateway startup,
  or lifecycle change;
- seat-registry activation (the real registry refusal is preserved exactly
  as the V1 registry produces it).

## Running

```bash
npm run build
node --test dist/test/planner-admission-fixture.test.js dist/test/cost-meter.test.js dist/test/seat-registry-integration.test.js
```

No provider, database, Keychain, or daemon is required or contacted.
