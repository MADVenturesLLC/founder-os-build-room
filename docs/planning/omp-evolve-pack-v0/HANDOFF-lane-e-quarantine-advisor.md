# HANDOFF — Lane E: pre-dispatch quarantine advisor (`build/quarantine-advisor-v0`)

Commission: FOUNDER ACT — Commission OMP→MAD Evolve Pack v0 (mechanism steal,
not clone), 2026-09-13. Authorized: implement + commit + push on the named
branch. NOT authorized and NOT claimed: merge, Phase 0 reopen, Phase 2,
production/live occupancy, provider execution, MadBridge unfreeze.

Boundaries (AE-01 still bind): controlled/fixture-honest work — NOT
production, NOT live occupancy, NO provider execution, NO Phase 2 claim.
Lane D's hard locks carry over unchanged.

## Identity

| field | value |
|---|---|
| Repository | `MADVenturesLLC/founder-os-build-room` |
| Branch | `build/quarantine-advisor-v0` — **stacked on Lane D** (which stacks on Lane A) |
| Stack base | Lane D head `fcbbe54e82104b762208779778f783c9480aef75` (`build/gateway-hooks-v0`) |
| Base pin (`origin/main` at act time) | `736b12b33a20dd055d88ba0ec1e30621797cc959` |
| Implementation commit | `d995d69659e8eec03dfc4d7c88866c0274f49d95` |
| Head SHA | the commit that adds this file (branch head; reported in the session handoff) |
| Package | `packages/quarantine-advisor` |
| Actor | `session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`, surface `claude-code`, role `builder` |

The act sequences E "AFTER D only"; this branch's Lane E delta is exactly
the two commits after `fcbbe54`. Until Lanes A and D merge, the diff
against `main` includes their commits.

## Changed paths (Lane E delta)

- `packages/quarantine-advisor/src/verdict.ts` (ADD)
- `packages/quarantine-advisor/src/rate-limit.ts` (ADD)
- `packages/quarantine-advisor/src/advisor.ts` (ADD)
- `packages/quarantine-advisor/src/quarantine-hook.ts` (ADD)
- `packages/quarantine-advisor/src/index.ts` (ADD)
- `packages/quarantine-advisor/README.md` (ADD)
- `test/quarantine-advisor.test.ts` (ADD)
- `tsconfig.json` (MODIFY — one include entry)
- `docs/planning/omp-evolve-pack-v0/HANDOFF-lane-e-quarantine-advisor.md` (ADD — this file)

Not changed: any existing package source, `packages/gateway-daemon/**`
(the Lane D hooks barrel is imported, not edited), `package.json`,
`package-lock.json`, CI.

Paths named in this file that do not exist at the base: everything under
`packages/quarantine-advisor/`, the test file, and (at `main`) the Lane A
and Lane D surfaces this branch stacks on.

## What was built (scope → where)

- Independent reviewer seat consumes transcript/delta BATCHES (not a
  continuous chat whisperer) → `QuarantineAdvisor.submit(batch)` over an
  injected `ReviewerSeat`; no provider adapter ships.
- Closed enum `nit | concern | blocker` → `ADVISOR_SEVERITIES` and the
  strict `parseAdvisorOutput`.
- Blockers quarantine pre-dispatch via Lane D hooks → `quarantinePreHook`
  returns a Lane D `PreHook`; `QuarantineAdvisor.decide(call)` blocks on a
  quarantined scope, on an open blocker targeting the call (scope-wide,
  tool pattern, or call id), and by default on an unreviewed or deferred
  scope.
- Rate-limited → `SlidingWindowLimiter` with an injected clock and
  enforced bounds; over-limit batches are deferred and coalesced into the
  next permitted review (nothing dropped).
- Unsafe / unparseable advisor output quarantined, never auto-PASS → any
  parser deviation or a throwing seat sets the scope `quarantined`; a
  later clean review does not lift it; only a recorded `liftQuarantine`
  does. Blockers clear only by a recorded `resolveFinding`.

## Test evidence

Focused:

```
npm run build && node --test dist/test/quarantine-advisor.test.js
# tests 13 · pass 13 · fail 0
```

Success criteria → tests: rate-limit test ("rate limit" — bounds, N per
window, deferral, coalescing, window roll); blocker → dispatch blocked
("blocker → dispatch blocked" — Lane D interceptor with a counting
dispatcher, count 0 while blocked, scope / tool / call targets, explicit
resolution); malformed advisor → quarantine ("malformed or failing
advisor → quarantine" — unparseable output, unknown severity, extra
verdict key, throwing seat; blocked; not lifted by a clean review; lifted
only by a recorded act).

Full suite on this branch (`npm test`, credential-free; storage cases
self-skip as on `main`):

```
# tests 915 · suites 334 · pass 915 · fail 0
# = Lane D head 902 + 13 Lane E tests   (main baseline: 855 / 316 / 855 / 0)
```

Gates run locally on the implementation commit: `npm run typecheck` PASS,
`npm run gate:path-audit` PASS, `npm run gate:attribution-selftest` PASS,
`eslint` on the new files 0 findings, `git diff --check` clean, secret
scan (gitleaks 8.30.1, checksum-verified, scoped to this lane's commit) no
leaks.

## Evolved from OMP vs invented

- Evolved (mechanism named in the act): an independent reviewer that
  classifies `nit | concern | blocker` and can hold a dispatch. No OMP
  code, prompt, or hub was read or vendored.
- Invented here: batch (not stream) consumption with rate-limit
  coalescing; the strict parser with quarantine-as-a-state and its size /
  count / target bounds; the per-scope state machine with the fail-closed
  `require_review` default; recorded-only resolution and lift; the binding
  to Lane D's interceptor so a block is a block, not a log line.

## Blast radius

Zero edits to existing source. One include line in `tsconfig.json`.
Imports only `packages/gateway-daemon/src/hooks/index.js` (the Lane D
barrel — types and `matchTool`), so no socket, custody, or IPC module
enters this package's graph. Nothing consumes the advisor yet.

## Open items / decisions

- The fail-closed default (`require_review: true`: an unreviewed scope
  blocks dispatch) is a mechanism default, not doctrine. If the Founder
  wants unreviewed scopes to dispatch by default, the flag exists and the
  suite covers both settings; the choice is recorded here, not decided.
- Merge remains a separate Founder act naming the exact head SHA; Lanes A
  and D must land first or be merged together in stack order.
