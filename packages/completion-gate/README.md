# @build-room/completion-gate

Completion gate v0 — the independent completion verifier. Founder Act
"MiMo→MAD Long-Horizon Core v0" (2026-09-15), Lane 1.

When a seat attempts to stop or claims done, `verifyCompletion(contract,
bundle)` judges the claim against a bound `success-contract/v1`:

- **contract** (`src/contract.ts`) — closed-field IR: `required_tests`
  (command + `expect: "exit_0"`, or a named `skip_policy`),
  `required_artifacts` (path + optional pinned sha256), `required_handoff`
  (seat-output-schema id + `schema_mode: "strict"`, closed), and
  `forbidden_claims` (`merge_authorized` / `production` /
  `provider_execution` must not be asserted unless the act says otherwise).
  Optional `argus_packet` / `single_verdict` bind an independent-reviewer
  packet. Unknown fields, wrong types, bad enums, wrong version, or a
  vacuous contract (no clause at all) are schema rejects.
- **evidence bundle** (`src/evidence.ts`) — `evidence-bundle/v1`, a
  schema-bound tool-trace summary: harness-produced `observations`
  (commands+exit codes, artifacts+sha256, skip records), the worker's
  self-`claims` (checked, never accepted), the terminal `handoff` (payload
  only — the contract picks the schema), and an optional `argus_packet`.
- **verdict** (`src/verify.ts`) — closed enum `pass | gap | impossible` with
  structured `gaps` (`{code, detail, evidence_pointer}`). Never a prose-only
  PASS: `pass` is the empty gap list over `requirements_checked >= 1`.
  Malformed inputs are a `schema_reject` outcome, not a verdict. A forbidden
  claim asserted `true` is `impossible` — no worker work can rescue a
  submission that asserts authority only the Founder holds.

The verifier seat id `completion-gate-verifier` is exported from
`src/verify.ts`. It is not a Seat Registry V1 seat and never modifies
`packages/seat-registry` or `packages/seat-output-schema` — both are
imported through their public entries only.

Library-only: callable from tests and the run-harness; **not** wired to
gateway dispatch, daemon boot, or any hook. Pure: no I/O, no clock, no env,
no dependencies.

Blast radius, test counts, and the evolved-vs-invented statement:
`docs/planning/mimo-evolve-v0/HANDOFF-completion-gate.md`.
