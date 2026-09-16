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
| Head SHA | the correction commit at branch head (reported in the session handoff) |
| Package | `packages/completion-gate` (new sibling directory; placement recorded below) |
| Actor | `session:kimi-code/mimo-evolve-v0-lane1`, surface `kimi-code-cli`, role `builder` |

Note: at handoff time `origin/main` had advanced beyond the act-start pin
(observed via `git status` after a fetch elsewhere). The branch was
deliberately NOT rebased: the act pins the base above, and any move onto the
newer main is a separate decision. The two files this lane once touched and
then restored (`package-lock.json`, the T18 test file) are byte-identical on
both the pin and the advanced `origin/main`.

## Changed paths (net diff vs the base pin, final)

- `packages/completion-gate/README.md` (ADD)
- `packages/completion-gate/src/contract.ts` (ADD — `success-contract/v1` IR)
- `packages/completion-gate/src/evidence.ts` (ADD — `evidence-bundle/v1`)
- `packages/completion-gate/src/handoff-schemas.ts` (ADD — schema id registry)
- `packages/completion-gate/src/verify.ts` (ADD — the verifier seat)
- `packages/completion-gate/src/index.ts` (ADD — public entry)
- `test/completion-gate.test.ts` (ADD — 39 tests)
- `tsconfig.json` (MODIFY — one include line)
- `docs/planning/mimo-evolve-v0/HANDOFF-completion-gate.md` (ADD — this file)

Byte-identical to the base (net zero diff): `package-lock.json`,
`test/room-runtime-phase1-acceptance-gateway.test.ts`, root `package.json`,
`packages/seat-registry/**`, `packages/seat-output-schema/**` (both imported
through their public entries only), `AGENTS.md`, `README.md`, CI workflows,
any daemon / control-plane / run-harness / gateway source.

Paths named in this file that do not exist at the base: every path under
`packages/completion-gate/`, `test/completion-gate.test.ts`, and this
directory — all added by this lane.

## Placement — seat-registry pattern; correction chronology (kept honest)

The act preferred a new sibling package. Final placement:
`packages/completion-gate` as a **tsconfig-include directory with NO package
manifest and NO workspace registration** — the `packages/seat-registry`
pattern (fixtures/src only, compiled via the root tsconfig `include`, zero
package-lock.json entries), consumed through relative source imports.
`@build-room/contracts` was not needed; nothing in the lifecycle vocabulary
is reused.

Chronology, because the first revision was wrong and the record should say so:

1. **First revision (commits `5cb866e`, `6dfe23a`, `375c33d`):** this lane
   read the act's "run `npm install`; commit the resulting
   `package-lock.json` (minimal link entries)" line as directing workspace
   registration, added `packages/completion-gate/package.json`
   (`@build-room/completion-gate`), committed the two resulting lockfile
   link entries, and updated the T18 regression pin for
   `package-lock.json` — reading the pin comment's "later, separately
   authorized change" clause as satisfied by the act.
2. **Review finding:** the act's discipline is "prefer byte-identical lock
   unless act requires otherwise — match recent pack practice", and the act
   does not require lock changes. Recent pack practice on `origin/main`:
   `packages/seat-registry` has no manifest and zero lockfile entries;
   `build/spend-broker-v0` committed zero lockfile delta; Lane 2 of this
   same act (checkpoint-writer) shipped no manifest and a byte-identical
   lock. The act never names T18 or lockfile-pin updates, so it is not the
   "separately authorized change" the pin comment reserves; updating the pin
   was inventing policy.
3. **Correction (the head commit):** manifest deleted; `package-lock.json`
   restored byte-identical (sha256
   `82a2ff7c9bb9430571fcb0180ea9cb270d30c098a020b97e45827a53169c2c38`,
   verified with `shasum -a 256`); the T18 test file restored byte-identical
   to the base; the README, package entry header, and the static-surface
   test now describe and assert the no-manifest pattern (the test asserts
   `packages/completion-gate/package.json` does NOT exist, mirroring Lane
   A's assertion for `seat-output-schema`). History was not rewritten: the
   correction is one new commit on top of the pushed branch.

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

## Test evidence (final, on the correction commit)

Focused (`npm run build && node --test dist/test/completion-gate.test.js`):

```
tests 39 · pass 39 · fail 0
```

The T18 file (`node --test dist/test/room-runtime-phase1-acceptance-gateway.test.js`,
run with `TMPDIR=/tmp`):

```
tests 29 · suites 12 · pass 29 · fail 0
```

Full suite on this branch (`TMPDIR=/tmp npm test`, credential-free; storage
cases self-skip without `TEST_DATABASE_URL`, as on main):

```
tests 1019 · suites 359 · pass 1019 · fail 0
```

Without the `TMPDIR=/tmp` workaround, 3 gateway-daemon lifecycle tests
(`the-entry-point-boots-and-serves-ipc`,
`sigterm-stops-the-timers-closes-the-socket-and-exits-zero`,
`sigint-is-the-same-clean-shutdown`) fail on 10-second timeouts in this
environment — IDENTICALLY on the untouched act-start base `1f8328c`
(verified by `git stash -u`, rebuild, re-run; local node is v26.5.1 while
`engines` pins `^22.13.0`). They do not import or touch this package, and
they pass with the workaround.

Gates run locally on the final tree:

```
npm run gate:path-audit           PASS
npm run gate:verify-check         PASS (3/3: path-audit, attribution-selftest, typecheck)
npm run gate:secret-scan          PASS (gitleaks 8.30.1 via homebrew; no leaks found)
attribution-shape-check.sh pr 1f8328c… HEAD build/completion-gate-v0  PASS
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
daemon boot, no hook, no control-plane route. The net diff adds only the new
directory, its test, this document, and one `tsconfig.json` include line;
every pre-existing file is byte-identical to the base. No production logic
in `test/`.

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
- ~~The 3 daemon-lifecycle tests are environment-sensitive locally (fail on
  10 s timeouts without `TMPDIR=/tmp`; pass with it), on the base and on
  this branch alike — flagged for whoever owns that environment question.~~
  **CLOSED** by PR #63, on `main` at
  `e251c146a1e4a6c4a97bda306253c0fabc107d2e` (2026-09-16). It was not an
  environment question, and `TMPDIR=/tmp` was a workaround rather than a
  fix. The socket path this suite builds is `os.tmpdir()` plus an 85-byte
  fixed tail; on macOS the default base is 48 bytes, so the path came to 133
  and `bind` returned `EINVAL` against Darwin's 104-byte `sun_path` field
  (which includes the terminating NUL). `waitForIpc` then polled 100 times
  at 100 ms against a daemon that could never answer — the 10 seconds,
  exactly. It never reproduced on Linux CI because Linux truncates rather
  than refusing, and truncates `bind` and `connect` identically, so an
  over-long path appears to work until two paths alias. The observation
  recorded above was accurate; only its diagnosis was wrong, and the
  diagnosis is what this entry had handed forward. PR #63 adds
  `assertSocketPathFits` in the daemon's own IPC layer and has the suite
  choose and assert a base that fits, so a future overgrowth fails in one
  sentence naming the length instead of three silent timeouts. Nothing here
  needs `TMPDIR` set.
- Merge remains a separate Founder act naming the exact head SHA.
