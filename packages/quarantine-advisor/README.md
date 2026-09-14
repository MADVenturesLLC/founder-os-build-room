# quarantine-advisor — pre-dispatch quarantine advisor (v0)

**Lane E of the OMP→MAD Evolve Pack v0** (Founder act of 2026-09-13,
"mechanism steal, not clone"). Stacked on Lane D (gateway hooks) and Lane A.
Status: controlled/fixture-honest work under the AE-01 boundaries — NOT
production, NOT live occupancy, NO provider execution, NO Phase 2 claim.
Merge is a separate Founder act.

## What it is

An **independent reviewer seat** consumes transcript/delta **batches** (not
a continuous chat stream) and emits findings in a closed enum:
`nit | concern | blocker`. The advisor keeps per-scope state; the Lane D
pre-hook turns that state into a dispatch decision, so a blocker
**quarantines pre-dispatch** — the interceptor never reaches the dispatcher.

| scope state | meaning | dispatch (default) |
|---|---|---|
| `unreviewed` | no review covers the scope | blocked (`advisor_review_pending`) |
| `deferred` | a batch is held by the rate limit, unreviewed | blocked (`advisor_review_pending`) |
| `clear` | reviewed, nothing open | allowed |
| `concerns` | reviewed, concerns and/or nits open | allowed (visible in `status`) |
| `blocked` | an open blocker | blocked (`advisor_blocker:<id>`) for what the blocker targets |
| `quarantined` | seat output unparseable/unsafe or seat threw | blocked (`advisor_quarantined`) |

`require_review: false` lets unreviewed/deferred scopes dispatch; blockers
and quarantine still block. The default is the fail-closed one.

## Rules

- **Unsafe / unparseable advisor output is quarantined, never auto-PASS.**
  The parser accepts exactly `{ findings: [{ finding_id, severity, summary,
  target }] }` with severity in the closed enum and target in
  `scope | tool(pattern) | call(id)`; anything else (unknown severity, extra
  keys, non-JSON, > 64 KiB, > 50 findings, duplicate ids, malformed target)
  quarantines the scope. A later clean review does **not** lift a
  quarantine; a recorded `liftQuarantine(by, note)` does.
- **Blockers are cleared only by a recorded `resolveFinding(by, note)`.**
- **Rate-limited.** A sliding window (`max_reviews_per_window` 1–100,
  `window_ms` 1 s – 1 h, bounds enforced) with an injected clock. Over-limit
  batches are deferred and coalesced into the next permitted review of the
  scope — nothing is dropped, and nothing is reviewed more often than the
  policy says.
- **The reviewer seat is injected** (`ReviewerSeat`). This package ships no
  provider adapter and performs no provider execution.

## Out of scope (act)

Always-on continuous injection; an IRC-style hub; any provider adapter.

## Evolved from OMP vs invented here

- **Evolved (mechanism named in the act):** an independent reviewer that
  classifies `nit | concern | blocker` and can hold a dispatch. No OMP code
  was read or vendored.
- **Invented here:** batch (not stream) consumption with rate-limit
  coalescing, the strict parser with quarantine-as-a-state, the per-scope
  state machine and its fail-closed default, recorded-only resolution and
  lift, and the binding to Lane D's interceptor so a block is a block.

## Verify

```sh
npm run build && node --test dist/test/quarantine-advisor.test.js
```
