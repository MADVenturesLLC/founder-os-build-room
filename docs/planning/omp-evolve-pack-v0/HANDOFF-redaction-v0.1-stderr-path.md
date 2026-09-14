# HANDOFF — redaction package v0.1: plain-text stderr path on `HarnessLogSink`

Commission: FOUNDER ACT — Commission redaction package v0.1, 2026-09-14,
issued in session. Closes the one package gap the Lane B wiring handoff
recorded: `HarnessLogSink` v0 had a flattened-error path to stderr but no
plain-text one, so the run-harness stream helper redacted plain stderr
text through the boundary's redactor directly.

Paths named in this file that do not exist at the base (`d052cb4`): this
file.

## Identity

- Branch: `build/redaction-stderr-path-v0`
- Base pin: `d052cb4649c97e19add3a90d224f8eede7bc73af` (origin/main, PR #39 merge)
- Implementation commit: `57690fb9a5e4c0e2ab37e7869f7dfbeba8de5e2f`
- Head (this handoff): named in the PR body
- Role-Id `builder`; Actor-Id `session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`;
  Execution-Surface `claude-code`

## Scope, as built (exactly the act)

- `packages/redaction/src/sinks.ts` — `HarnessLogSink.err(text)`: redacted
  plain text to the inner err stream, guarded exactly like `log` (the
  boundary's `require()` runs before the inner call; a refused boundary
  throws `RedactionRefusedError` and the inner stream is never invoked;
  an inner throw surfaces as `SinkWriteError` with redacted text). Class
  doc comment updated. No other change in the package: registry, redactor
  token format, custody, refusal codes, and the other three sinks are
  byte-identical to `d052cb4`.
- `packages/run-harness/src/redaction-boundary.ts` — `redactedHarnessStreams.err`
  now calls `sink.err`; the direct `boundary.require().redactString(...)`
  call is gone. The helper's three paths all go through `HarnessLogSink`.
- `test/redaction.test.ts` — one test: ready boundary → the token is
  replaced on stderr; refused boundary (`key_absent`) →
  `RedactionRefusedError` before the inner call, inner call count 0.
- `test/run-harness-redaction-wiring.test.ts` — the five
  `packages/redaction/src` digests re-pinned at this head (only
  `sinks.ts` changed); the "no process environment read" check is
  unchanged.
- `packages/redaction/README.md` — one line in the sinks table row.
- This file.

Not changed: `package.json`, `package-lock.json` (byte-identical),
`tsconfig.json`, anything under `packages/gateway-daemon/`, the Phase 2
and Phase 3 CLIs (they already consumed the helper's `err`).

## Test evidence

- `node --test dist/test/redaction.test.js` — 28/28 (27 + the new one)
- `node --test dist/test/run-harness-redaction-wiring.test.js` — 14/14
- `node --test dist/test/phase3-cli-config.test.js` — 11/11
- full suite at the implementation commit: 979 PASS / 0 FAIL
- eslint on every changed `.ts`: clean; `git diff --check`: clean;
  `scripts/path-audit.sh`: PASS; `scripts/attribution-shape-check.sh`:
  PASS on each commit; gitleaks scoped to this branch's commits: no leaks found (gitleaks 8.30.1, base..HEAD)

## Behaviour change for operators

None visible. Phase 2 and Phase 3 stderr text was already redacted by the
helper; it is now redacted by the sink. Refusal semantics, exit codes, and
the refusal line are unchanged.

## Open items

- Journal sink: parked until the command-journal write path exists
  (PR2b Tranche D, per `docs/planning/command-journal/pr2b-implementation-plan-r1.md`).
- Merge is a separate exact-SHA Founder act; this file asserts none.

Attribution: Role-Id builder; Actor-Id
session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp; Execution-Surface
claude-code.
