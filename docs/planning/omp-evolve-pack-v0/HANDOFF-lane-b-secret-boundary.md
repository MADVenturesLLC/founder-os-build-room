# HANDOFF — Lane B: secret boundary / redaction (`build/secret-boundary-v0`)

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
| Branch | `build/secret-boundary-v0` |
| Base pin (`git rev-parse origin/main` at act time) | `736b12b33a20dd055d88ba0ec1e30621797cc959` |
| Implementation commit | `0ab17ed2a74c57abb48f037daadf07f2ba1f6075` |
| Head SHA | the commit that adds this file (branch head; reported in the session handoff) |
| Package | `packages/redaction` (name chosen and kept; no `secret-boundary` alias) |
| Key custody name | Keychain service `mad.redaction.hmac`, account `hmac-v1`, hex value ≥ 32 bytes |
| Actor | `session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`, surface `claude-code`, role `builder` |

## History note — one rewrite before any review

This branch was force-pushed once, before any PR or review existed. The
first push carried implementation commit `6d9423f2f108db3e82da25c33d17c8329bfe6bc0`
and handoff commit `7b9591df5ac2e14b9cf864f321621ea3b45d5f0c`. A local run of
`scripts/secret-scan.sh` (gitleaks 8.30.1) on that history reported one
finding: `test/redaction.test.ts:57`, rule `generic-api-key` — a fixture
password written as a literal credential-shaped assignment. A test that
trips the repository's verification layer while proving the control layer
is self-defeating, so the fixture strings are now assembled at runtime.
Because the scan reads commits, a follow-up commit would not have cleared
it; the implementation commit was rebuilt as `0ab17ed…` (package sources and
`tsconfig.json` byte-identical to `6d9423f…`; only the test file differs)
and the branch re-pushed with `--force-with-lease`. The superseded SHAs are
recorded here so the audit trail is complete. `origin/main` was never
touched.

## Changed paths

- `packages/redaction/src/registry.ts` (ADD)
- `packages/redaction/src/redactor.ts` (ADD)
- `packages/redaction/src/key-custody.ts` (ADD)
- `packages/redaction/src/sinks.ts` (ADD)
- `packages/redaction/src/index.ts` (ADD)
- `packages/redaction/README.md` (ADD)
- `test/redaction.test.ts` (ADD)
- `tsconfig.json` (MODIFY — one include entry)
- `docs/planning/omp-evolve-pack-v0/HANDOFF-lane-b-secret-boundary.md` (ADD — this file)

Not changed: `packages/gateway-daemon/**` (custody and signing untouched,
not imported), `scripts/secret-scan.sh`, `package.json`,
`package-lock.json`, CI, `AGENTS.md`, `README.md`.

Paths named in this file that do not exist at the base: every path under
`packages/redaction/`, `test/redaction.test.ts`, and this directory.

## What was built (scope items → where)

- SecretRegistry: env-name heuristics + manifest + optional built-in
  shapes → `registry.ts` (`loadFromEnv`, `loadFromManifest`,
  `enableShape`, `BUILTIN_SHAPES`).
- Register secrets at generation time, fixture passwords ≥ 16 chars →
  `generateFixturePassword` / `registerGenerated` (refuse and discard
  under 16).
- Modes `replace` (one-way, deterministic) and `obfuscate` (reversible):
  both declared in `RedactionMode`; ONLY `replace` wired
  (`WIRED_REDACTION_MODES`); `obfuscate` construction throws.
- Sinks wrapping writers, not call sites → `sinks.ts`: `JournalAppendSink`,
  `EvidenceBundleWriter`, `HarnessLogSink` (log + error), each built only
  from a `RedactionBoundary`.
- HMAC key in a separate Keychain custody item → `key-custody.ts`
  (`KeychainHmacKeyCustody`, read-only; the daemon's
  `com.madventures.buildroom.gateway` custody is not touched).
- Fail-closed: registry/key unloadable → refuse write → `RedactionBoundary`
  states and `RedactionRefusedError` on every sink.
- `scripts/secret-scan.sh` / gitleaks kept as verification, not sole
  control (unchanged; the package README says so).

## Test evidence

Focused:

```
npm run build && node --test dist/test/redaction.test.js
# tests 27 · pass 27 · fail 0
```

Success criteria → tests: determinism (4 tests, "determinism of replace
mode"), irreversibility (6 tests, "irreversibility of replace mode"),
error-path redaction (3 tests, "error paths are write paths"), fail-closed
writer (4 tests, "fail-closed writers" — registry unloadable, key absent /
unavailable / custody throwing, key too short, obfuscate not wired; inner
writer count 0 in every refused case).

Full suite on this branch at the rebuilt implementation commit (`npm test`,
credential-free; storage cases self-skip without `TEST_DATABASE_URL`, as on
`main`):

```
# tests 882 · suites 323 · pass 882 · fail 0    (main baseline: 855 / 316 / 855 / 0)
```

Gates run locally on the implementation commit: `npm run typecheck` PASS,
`npm run gate:path-audit` PASS, `npm run gate:attribution-selftest` PASS,
`eslint` on the new files 0 findings, `git diff --check` clean, secret scan
(gitleaks 8.30.1, checksum-verified) scoped to this branch's commits: no
leaks.

## Evolved from OMP vs invented

- Evolved (mechanism named in the act): a secret registry fed by env-name
  heuristics, a manifest, and built-in shapes; `replace` and `obfuscate`
  modes; redaction at the sinks. No OMP code was read or vendored.
- Invented here: the keyed, truncated HMAC token with a stable name label
  (correlatable across sinks, not invertible); the loadability rule
  (refusals block the boundary until ignored by name, visible in the load
  report); manifests that name but never carry values; generation-time
  registration with the 16-character floor; the boundary/sink split with
  fail-closed writers and the redacted `SinkWriteError` re-throw; the
  separate read-only Keychain item.

## Blast radius

Zero edits to existing source. One include line in `tsconfig.json`. No
manifest, no workspace membership, lockfile byte-identical (AE-01 T18 pin
holds). Nothing consumes the package yet.

## FOUNDER_DECISION_REQUIRED — key provisioning and wiring

The act's fail-closed rule ("registry/key unloadable → refuse write") is
implemented. Installing the sinks under live writers therefore needs a
key, and minting one is a custody act this session may not perform
(AGENTS.md: no self-provisioned secrets). Options:

1. Authorize creation of the `mad.redaction.hmac` / `hmac-v1` Keychain
   item on the darwin gateway host (a Founder custody act; the package
   README carries the one-line `security add-generic-password` form), then
   commission wiring of `EvidenceBundleWriter` under the run-harness CLI,
   `HarnessLogSink` under the AE-01 fixture runner, and
   `JournalAppendSink` under the journal store when that layer lands.
2. Additionally rule on a non-Keychain key source for the ubuntu CI and
   Railway runtimes (an injected fixture key for CI only; a refusal on
   Railway), since Keychain does not exist there and the boundary will
   refuse every write without a key.
3. Keep the writers unwired (current state) until the fixture-password work
   the act anticipates actually starts.

No option is taken here. Merge remains a separate Founder act naming the
exact head SHA.
