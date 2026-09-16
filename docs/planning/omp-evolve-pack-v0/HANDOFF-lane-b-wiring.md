# HANDOFF — Lane B wiring: the redaction boundary under the run-harness writers (v0)

Commission: FOUNDER ACT — Commission Lane B wiring, 2026-09-14 (issued in
session with the two fills below), on the OMP→MAD Evolve Pack v0 Lane B
package merged at `6ef7d120626163a48f0bc22ac3efbf4904256fb0` (PR #34).

Paths named in this file that do not exist at the base
(`6ef7d12`): `packages/run-harness/src/redaction-boundary.ts`,
`packages/run-harness/src/phase3/redacted-evidence.ts`,
`test/run-harness-redaction-wiring.test.ts`, and this file.

## Identity

- Branch: `build/secret-boundary-wiring-v0`
- Base pin: `6ef7d120626163a48f0bc22ac3efbf4904256fb0` (origin/main, Lane B merge)
- Implementation commit: `900bccfaa046d03b45b5b8bd8aa9bb5357b3e773`
- Head (this handoff): named in the PR body
- Role-Id `builder`; Actor-Id `session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`;
  Execution-Surface `claude-code`

## Founder fills, as received (2026-09-14)

- **Host placement:** darwin gateway host; both the Phase 2 and Phase 3
  harnesses are operator-invoked there. Ubuntu CI and Railway are
  refusal-only in v1; no key is provisioned there. (No workflow in
  `.github/workflows/` runs either harness — verified by grep at the base.)
- **Rotation ruling:** (a) — key rotation is a recorded custody act;
  evidence written under different keys is not byte-comparable, and
  decision records cite the key fingerprint in prose. No evidence-shape
  change in v1.

## Act corrections accepted before implementation

An external review of the draft act (relayed by the Founder before "issue
the act") raised seven points. Each was checked against the code at the
base before being taken:

1. Fills blank — already answered by the Founder; recorded above.
2. **Taken.** `CONTROL_PLANE_TOKEN` matches the `TOKEN` heuristic, so a
   heuristic load followed by a manifest load registered it twice; the
   second is a `duplicate_name` refusal, and the boundary would then refuse
   every write. Manifest names are now excluded from the heuristic scan.
3. **Taken, with one change.** A refusal exits with one line,
   `redaction refused: <code>`, before any collaborator exists. The exit
   code is **3**, not the draft's 2: the Phase 3 harness already returns 2
   for `awaiting_adjudication`. Post-boundary errors leave through the
   boundary's redacting error path; pre-boundary configuration errors carry
   variable names only and keep their exit 1.
4. **Taken.** Narrow injection seams: `keyCustody`, `streams`,
   `writeBundle`, `deps` (Phase 2); `keyCustody`, `streams`,
   `reserveEvidenceFile`, `clients`, `buildRoomPath` (Phase 3); a `write`
   parameter on the Phase 3 evidence wrapper. Fixture custody is constructed
   only by tests.
5. **Taken.** Every environment value is trimmed before registration, so
   the registry holds exactly the token the client sends.
6. **Taken.** Boundary wording: "NO PHASE 2 AUTHORIZATION, ACTIVATION, OR
   GOVERNANCE CLAIM. T6 is fixture-only writer acceptance, not a counted
   Phase 2 run."
7. **Taken.** The key fingerprint is the first 8 hex of SHA-256 over the
   decoded 32 raw key bytes, not the 64-character hex string:
   `security find-generic-password -a hmac-v1 -s mad.redaction.hmac -w | xxd -r -p | shasum -a 256 | cut -c1-8`.

One ordering decision beyond the review: the Phase 3 loader opens the
boundary **after** its pure validation (plan read and checks, path
containment) and **before** its first side effect (evidence directory,
reservation), rather than before the plan is read. A keyless host still
learns about a broken plan; nothing is created or reserved on refusal. The
test pins both halves.

## Changed paths

- `packages/run-harness/src/redaction-boundary.ts` — new: manifest,
  heuristic scan with manifest names ignored, value trimming, custody by
  platform (Keychain on darwin; refusal elsewhere), refusal line, exit code,
  redacted stream helpers. Imports nothing from `packages/gateway-daemon`.
- `packages/run-harness/src/cli.ts` — Phase 2: environment passed in;
  boundary opened after configuration and before any collaborator; bundle
  written through `EvidenceBundleWriter`; stdout, runner log, and errors
  through the boundary; refusal → exit 3.
- `packages/run-harness/src/phase3/cli-config.ts` — boundary opened before
  the evidence directory and the reservation; `redaction` carried in the
  config; reservation injectable.
- `packages/run-harness/src/phase3/cli.ts` — refusal → exit 3 before any
  client; clients constructed by an injectable factory; evidence written
  through the redacting wrapper; stdout and stderr through the boundary.
- `packages/run-harness/src/phase3/redacted-evidence.ts` — new: redact the
  evidence tree, then the untouched `writePhase3Evidence`.
- `packages/redaction/README.md` — "Not wired" section replaced by the wired
  state. `packages/redaction/src/**` is unchanged and hash-pinned by test.
- `test/run-harness-redaction-wiring.test.ts` — new, 14 tests (T1–T4).
- `test/phase3-cli-config.test.ts` — the three tests that reach the
  reservation now pass fixture custody; the rest are unchanged.
- This file.

Not changed: `package.json`, `package-lock.json` (byte-identical; AE-01 T18
pin holds), `tsconfig.json`, anything under `packages/gateway-daemon/`,
anything under `packages/redaction/src/`.

## Test evidence

- `node --test dist/test/run-harness-redaction-wiring.test.js` — 14/14
- `node --test dist/test/phase3-cli-config.test.js` — 11/11 (unchanged count)
- full suite at the implementation commit: 978 PASS / 0 FAIL
- eslint on every changed `.ts`: clean; `git diff --check`: clean;
  `scripts/path-audit.sh`: PASS; `scripts/attribution-shape-check.sh`: PASS
  on each commit; gitleaks scoped to this branch's commits: no leaks found (gitleaks 8.30.1, base..HEAD)

Mapping to the act's tests:

- **T1** — Phase 2 with the fixture token (surrounded by whitespace) in the
  environment and deliberately placed in `PHASE2_ENVIRONMENT`: the bundle
  file contains the token 0 times and `[REDACTED:CONTROL_PLANE_TOKEN:`;
  stdout contains no token; the client received the trimmed token.
- **T2** — `UnavailableHmacKeyCustody` → exit 3, stderr exactly
  `redaction refused: key_unavailable\n`, no evidence directory, zero
  collaborators, zero writes; `key_absent` and `registry_unloadable`
  likewise; stderr never carries the value.
- **T3** — Phase 3 loader on a valid plan: refusal after validation, zero
  reservations, no evidence directory; the same environment with a broken
  plan reports the plan. `main` with a refused boundary: exit 3, one line,
  zero reservations, zero client constructions. Ready path: the writer
  receives an already-redacted tree (both occurrences replaced); under a
  refused boundary the writer is never called; the real write path
  (reservation, closed shape, read-back) produces bytes identical to
  `serializePhase3Evidence`.
- **T4** — the factory and the evidence wrapper import nothing from the
  daemon (import specifiers checked, not prose); the five files under
  `packages/redaction/src/` match their SHA-256 at `6ef7d12`; none reads
  the process environment.
- **T5** — full suite and lockfile, above.
- **T6** — darwin acceptance with the real Keychain item: **performed by
  the Founder on `MikeMacBook.local`, 2026-09-14T10:40:34Z**, from a
  worktree of `main` at `61f4bc4` (the wiring merge). Fixture-only writer
  acceptance, not a counted Phase 2 run: `CONTROL_PLANE_URL` pointed at a
  closed local port, a throwaway `fixture-<random>` value as
  `CONTROL_PLANE_TOKEN` and inside `PHASE2_ENVIRONMENT`, one attempt,
  1 ms windows. Observed: the boundary opened under the real Keychain item
  (no refusal line); exit 1 (gate unsatisfied, as expected with no control
  plane); one evidence file written; `grep -c` of the fixture value in the
  file = 0; `grep -c 'REDACTED:CONTROL_PLANE_TOKEN'` = 1; the stdout
  summary printed the environment already redacted. Pasted into the
  session by the Founder; recorded here from that paste.

## Fail-closed contract, as built

- No key, unloadable registry, or unwired mode → exit 3, one line naming
  the code, no run, no request, no reservation, no file.
- An inner writer failure surfaces as the package's `SinkWriteError`
  through the redacting error path; exit 1.
- No flag, variable, or config field turns the boundary off. Fixture
  custody has no production constructor path: the CLIs' entrypoints pass no
  options.

## Evolved from Lane B vs invented here

- Evolved: everything the package already defined — registry, manifest,
  sinks, custody, refusal codes, token format. The wiring adds no
  redaction semantics.
- Invented here: manifest-name exclusion from the heuristic scan; value
  trimming; platform custody choice; exit 3 and the single refusal line;
  the Phase 3 "validate, then open, then reserve" ordering; the redacted
  stream helper (`HarnessLogSink` v0 has no plain-text stderr path, so
  plain stderr text goes through the boundary's redactor directly — a
  package v0 gap to close in a later package revision, not in this lane,
  since the package is pinned).

## Observations for the Founder

- Every valid Phase 3 evidence shape is closed and regex-bound; no field
  admits free text, so a secret could not survive the shape check there.
  The boundary is applied anyway — the write path is the named control,
  and the two are independent.
- The Phase 2 harness gate wants three consecutive passes; a one-run
  invocation exits 1 with the bundle written. Unchanged behaviour, noted
  because the first version of T1 tripped on it.

## F1 — custody record

- Act: `security add-generic-password -a hmac-v1 -s mad.redaction.hmac -w "$(openssl rand -hex 32)"`,
  performed by the Founder (`Actor-Id: founder`) on `MikeMacBook.local`,
  reported in session on 2026-09-14 shortly before 10:40Z; the exact mint
  timestamp was not captured. The T6 run at 10:40:34Z is the live check
  that the item existed and decoded to a 32-byte key at that time.
- Key fingerprint (first 8 hex of SHA-256 over the decoded 32 raw bytes,
  per correction 7): `db68febb`. Cite this fingerprint in prose in any
  decision record that hashes evidence written under this key (rotation
  ruling (a)).
- The value was never printed, copied, or seen by the agent; only the
  fingerprint was reported.

## Open items

- ~~F1 and T6~~ — done, above.
- ~~A package revision adding a plain-text stderr path to `HarnessLogSink`~~ —
  done, landed on `main` as `57690fb` (`sinks.ts` gains `err(text)`, redacting
  plain text to the err stream under the same `guarded` boundary as `log`), with
  its own handoff at `HANDOFF-redaction-v0.1-stderr-path.md`.
- Journal sink: parked until the command-journal **write path** exists (PR2b
  Tranche D). **`packages/journal` existing is not that dependency** — as of
  `d01742c7` it is the record model only (`event-row`, `decision-row`,
  `envelope`, `chain`, `bytes`, `plandoc`) and exports no append/write/insert;
  `packages/journal/src/envelope.ts` says so itself: "Redaction enforcement
  belongs to the write path (2b and later)." The earlier wording here — "when a
  journal store exists" — reads as satisfied by that package and is not. There
  is nothing for a redaction sink to attach to until the write path lands.
- Merge is a separate exact-SHA Founder act; this file asserts none.

Attribution: Role-Id builder; Actor-Id
session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp; Execution-Surface
claude-code.
