# HANDOFF — Lane 1: completion gate (`build/completion-gate-v0`)

Commission: Founder Act "MiMo→MAD Long-Horizon Core v0" (2026-09-15), Lane 1 —
when a seat/agent attempts to stop or claims done, an INDEPENDENT verifier
judges completion against a BOUND success contract, not natural-language
vibes. Evolve the "MiMo Goal verifier" mechanism, MAD-shaped.

Authorized: implement + commit + push on `build/completion-gate-v0` only.
NOT authorized and NOT claimed: merge, PR creation, production/live
occupancy, daemon boot/dispatch hooks, live gateway wiring, governance
doctrine changes, Max Mode / best-of-N, continuous advisor chat,
Dream/Distill.

## Identity

| field | value |
|---|---|
| Repository | `MADVenturesLLC/founder-os-build-room` |
| Branch | `build/completion-gate-v0` |
| origin/main at act start (base pin) | `1f8328cce68a35e2b5014693d8138380b9e54734` |
| Head SHA | the commit that adds this file (branch head; reported in the session handoff) |
| Package | `packages/completion-gate` (new sibling package; choice recorded below) |
| Actor | `session:kimi-code/mimo-evolve-v0-lane1`, surface `kimi-code-cli`, role `builder` |

Note: at handoff time `origin/main` had advanced 13 commits beyond the
act-start pin (observed via `git status` after a fetch elsewhere). The branch
was deliberately NOT rebased: the act pins the base above, and any move onto
the newer main is a separate decision.

## Changed paths

- `packages/completion-gate/package.json` (ADD — act-directed manifest)
- `packages/completion-gate/README.md` (ADD)
- `packages/completion-gate/src/contract.ts` (ADD — `success-contract/v1` IR)
- `packages/completion-gate/src/evidence.ts` (ADD — `evidence-bundle/v1`)
- `packages/completion-gate/src/handoff-schemas.ts` (ADD — schema id registry)
- `packages/completion-gate/src/verify.ts` (ADD — the verifier seat)
- `packages/completion-gate/src/index.ts` (ADD — public entry)
- `test/completion-gate.test.ts` (ADD — 39 tests)
- `tsconfig.json` (MODIFY — one include line)
- `package-lock.json` (MODIFY — workspace link entries only; see below)
- `test/room-runtime-phase1-acceptance-gateway.test.ts` (MODIFY — T18
  lockfile regression pin updated under its own documented mechanism; see
  below)
- `docs/planning/mimo-evolve-v0/HANDOFF-completion-gate.md` (ADD — this file)

Not changed: `packages/seat-registry/**`, `packages/seat-output-schema/**`
(both imported through their public entries only), root `package.json` (no
new script, no dependency), `AGENTS.md`, `README.md`, CI workflows, any
daemon / control-plane / run-harness / gateway source.

Paths named in this file that do not exist at the base: every path under
`packages/completion-gate/`, `test/completion-gate.test.ts`, and this
directory — all added by this lane.

## Package choice — the act's preferred sibling placement, with a manifest

The act preferred a new sibling package. Chosen: `packages/completion-gate`,
following the `packages/journal` manifest shape (`@build-room/completion-gate`,
`private`, `0.0.0`, `type: module`, `main`/`types: src/index.ts`,
`UNLICENSED`, zero runtime dependencies — `@build-room/contracts` was not
needed; nothing in the lifecycle vocabulary is reused).

One deliberate divergence from the nearest sibling precedent:
`packages/seat-output-schema` carries no manifest ("workspace membership
needs its own authorization", Founder workspace/lockfile ruling 2026-09-05).
THIS act supplies that authorization explicitly: it directs a named manifest
and an `npm install` to register the workspace, committing the resulting
lockfile. The diff is the expected minimal shape — two entries
(`node_modules/@build-room/completion-gate` link + `packages/completion-gate`),
9 insertions, nothing else. (`build/spend-broker-v0`, cited by the act as the
shape precedent, added a manifest with NO lockfile diff; this lane followed
the act's explicit npm-install instruction instead, and `npm ci --dry-run`
confirms the locked install stays in sync for CI.)

Consequence: the T18 regression test
(`test/room-runtime-phase1-acceptance-gateway.test.ts`) pins
`package-lock.json` by SHA-256 at the AE-01 A2 execution base, with the
comment "a later, separately authorized change to any of these updates its
pin deliberately in the same change." This act is that separate
authorization, so the pin was updated in this change
(`82a2ff7c…` → `b54d74b5…`), with the comment extended to record the
authorizing act. No other REGRESSION_PINS entry moved.

## What was built

- **`success-contract/v1` IR** — closed fields only: `required_tests`
  (`command` + `expect: "exit_0"`, or `command` + a named `skip_policy` from
  the closed set `not_applicable | environment_unavailable`),
  `required_artifacts` (`path` + optional pinned `sha256`),
  `required_handoff` (`seat_output_schema_id` + `schema_mode` closed to
  exactly `"strict"`), `forbidden_claims` (closed vocabulary:
  `merge_authorized | production | provider_execution`), optional
  `argus_packet` (pin by packet SHA-256) and `single_verdict` (checked
  against the Seat Registry's own independent-reviewer terminal statuses).
  Hand-rolled validation (no zod, no new dependency): unknown fields, wrong
  types, bad enums, wrong version are defects; a defective contract is
  refused, never partially applied. A contract binding NO clause at all is
  rejected — a PASS can never be decorative.
- **`evidence-bundle/v1`** — the schema-bound tool-trace summary:
  harness-produced `observations` (commands + exit codes, artifacts always
  SHA-256-hashed, recorded skip decisions), the worker's self-`claims`
  (data to be checked, never proof), the terminal `handoff` (payload only —
  the CONTRACT names the schema by id and the mode, so the claimant cannot
  pick its own yardstick), optional `argus_packet` observation. Closed-field
  validation, same fail-closed discipline.
- **The verifier** — `verifyCompletion(contract, bundle)`, a pure function
  (no I/O, no clock, no env) under the separate seat id
  `completion-gate-verifier` (NOT a Seat Registry V1 seat; the registry is
  untouched). Output is a closed enum — `pass | gap | impossible` — with
  structured `gaps` (`{code, detail, evidence_pointer}`, 14 closed codes) and
  `requirements_checked` (≥ 1 on any pass). Malformed inputs return a
  `schema_reject` outcome with stage and defects — a refusal, never a
  verdict. Handoff clauses are judged by the ratified Lane A evaluator
  (`evaluateStructuredHandoff`, strict mode). `impossible` is reserved for a
  submission asserting a forbidden claim: no worker work can rescue a
  completion that asserts authority only the Founder holds. A `done: true`
  self-claim contradicted by evidence adds `worker_claim_contradicted`; a
  green bundle passes with `done: false` — the narrative is never an input.
- **Dogfood fixtures in tests** — the act's three: (a) claims done with
  failing tests ⇒ `gap`; (b) green suite + valid strict handoff ⇒ `pass`;
  (c) contradictions ⇒ artifact sha256 mismatch `gap`, forbidden claim
  asserted `impossible`. Schema-reject paths covered for both inputs.

## Test evidence

Focused (`npm run build && node --test dist/test/completion-gate.test.js`):

```
tests 39 · pass 39 · fail 0
```

Full suite on this branch (`npm test`, credential-free; storage cases
self-skip without `TEST_DATABASE_URL`, as on main):

```
tests 1019 · suites 359 · pass 1016 · fail 3
```

The 3 failures are the gateway-daemon lifecycle tests
(`the-entry-point-boots-and-serves-ipc`, `sigterm-stops-the-timers-closes-the-socket-and-exits-zero`,
`sigint-is-the-same-clean-shutdown`), each a 10-second timeout. They fail
IDENTICALLY on the untouched act-start base `1f8328c` in this environment
(verified by `git stash -u`, rebuild, re-run: same 3 failures; local node is
v26.5.1 while `engines` pins `^22.13.0`). They do not import or touch this
package. The fourth earlier failure (T18 lockfile pin) is resolved by the
authorized pin update above and now passes.

Gates run locally:

```
npm run typecheck                 PASS
npm run gate:path-audit           PASS
npm run gate:attribution-selftest PASS
npm run gate:verify-check         PASS (3/3: path-audit, attribution-selftest, typecheck)
npm ci --dry-run                  PASS (lockfile in sync for the CI locked install)
npm run gate:secret-scan          PASS (gitleaks 8.30.1 via homebrew; no leaks found)
npx eslint <new and touched files> 0 findings
npm run lint (whole repo)         32 errors, ALL pre-existing on the base in
                                  files this lane did not touch (CI runs lint
                                  advisory, continue-on-error, for exactly
                                  this reason); none in completion-gate files
git diff --check                  clean
```

`npm run gate:integrity` was not run: it scans the authorizing contract
DOCUMENT, which lives outside this repository and must be given an explicit
path; it is deliberately not a CI step (ci.yml records it as pre-PR with the
artifact SHA-256 recorded in the PR body). No secrets, keys, or tokens were
added by this lane.

## Evolved from MiMo vs invented

No MiMo/OpenCode source was available locally and none was vendored, read,
or ported. The mechanism follows the act's DESCRIPTION of MiMo's Goal
verifier: an independent verifier judges a stop/completion claim against a
bound success contract rather than the worker's narrative.

Evolved (mechanism named in the act): the independent verifier seat; the
bound success contract as the completion yardstick; the closed
`pass | gap | impossible` verdict shape with a gap list.

MAD-invented here (this repository's own, none of it MiMo's):

- the `success-contract/v1` and `evidence-bundle/v1` IR shapes and their
  closed-field hand-rolled validators, including the non-vacuous rule;
- the 14 gap codes, the `requirements_checked` counter, and
  `schema_reject` as a distinct non-verdict outcome;
- the skip-policy vocabulary and the skip-record evidence requirement;
- the forbidden-claim semantics (`impossible` when asserted) and the
  `worker_claim_contradicted` gap — the "self-claims are data" rule made
  structural;
- the handoff-schema id registry binding contracts to the ratified Lane A
  `seat-output-schema` machinery in strict mode;
- the `argus_packet` / `single_verdict` bind shapes, vocabulary-aligned to
  the Seat Registry's independent-reviewer terminal statuses;
- last-observation-wins trace semantics for re-runs.

## Blast radius

Library-only. The package is imported by its test and is callable from
run-harness/tests; it is wired to NOTHING live — no gateway dispatch, no
daemon boot, no hook, no control-plane route. Zero edits to existing package
sources; the only pre-existing file touched beyond `tsconfig.json` and the
lockfile is the T18 pin comment+hash under its own documented update
mechanism. No production logic in `test/`.

## Open items / decisions

- Provenance boundary (documented, not a defect): the verifier trusts the
  bundle's `observations` as harness-produced; WHO assembles the bundle from
  a real tool trace is a later lane's wiring decision, deliberately not made
  here.
- `single_verdict` accepts any independent-reviewer terminal status (the
  contract author chooses the binding); only `SEAT_VERIFIED` is a
  completion-shaped bind, but closing that further is a policy choice for
  the act author, not for this package.
- Registering additional seat-output-schema ids is a code change to
  `handoff-schemas.ts` under a future act.
- The 3 pre-existing daemon-lifecycle failures in this environment (node
  26.5.1 vs `engines ^22.13.0`) are unchanged by this lane and are flagged
  for whoever owns that environment question.
- Merge remains a separate Founder act naming the exact head SHA.
