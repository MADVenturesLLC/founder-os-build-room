# Build Room Canonical Command Journal — Foundation Contract (Phase 4 §7.1–7.3)

Status: **proposed foundation at pin** — implements stop-gate items §7.1–7.3
only, on isolated branch from authorized base
`ad23c6ea6117a54bce5be7208a5a5768ec5bfbc9`. This is **not** a rebased port of
later `main` journal PRs (#11/#12/#27/#54). Mechanisms (hash framing, envelope
encoding, singularity, fail-closed dispatch, secret redaction) are adapted
from the ruled contract lineage for what this pin tree can support.

**Authority derivation.** Entire authority derives from:

- `DEC-20260827-01` Section 10 (command-journal Phase 4 ruling)
- `DEC-20260815-17` `## Founder Authorization — Phase 4 (Planner Loop) (2026-08-31)` §§3, 6–7
- Hand-off `HO-20260831-01`

This document creates no governance doctrine. Conflicts resolve in FounderOS.

## Scope of this foundation

| Stop-gate | Proof obligation |
|---|---|
| §7.1 | Canonical journal is append-only, tamper-evident, reconstructable, and singular |
| §7.2 | Governed commands cannot bypass the required journal path (fail-closed) |
| §7.3 | Secrets and credentials are not persisted in journal records |

Out of scope here (later Phase 4 steps / separate Founder acts): Neon
sole-writer migrations, full §6.2(c)/(d) row schemas as ratified on later
main, planner loop, Builder execution, counted runs, draft-PR-by-agent
runtime.

## 1. Singularity

Exactly one canonical governed command history: one journal module, one chain,
one `seq` space. `MemoryCommandJournal.open()` fails closed if a second
authoritative journal is requested while one is active. Local logs, provider
logs, evidence, and telemetry are not substitutes.

## 2. Append-only and tamper evidence

- Rows are never updated or deleted; `tryUpdate` / `tryDelete` refuse.
- Each row's `chain_hash` = SHA-256 over prior `chain_hash` (64 lowercase-hex
  ASCII bytes; genesis = 64 ASCII `0`s) concatenated with the row's canonical
  bytes.
- `verify()` recomputes from genesis in `seq` order and never trusts a stored
  head. Tamper fails closed.
- `reconstruct()` returns history only after `verify()` succeeds.

## 3. Fail-closed dispatch

`dispatchGovernedCommand` is the sole governed-command entry point. It:

1. requires the singular journal to be open;
2. normalizes and redacts the envelope;
3. appends a `journaled` event;
4. returns an execution permit only after the journal append commits.

`executeWithoutJournal` always throws `bypass_forbidden`. A missing journal
is `journal_unavailable`, never silent success.

## 4. Secrets and normalization

Never persisted: provider credentials, authentication tokens, secret env
values, private keys, or other credential material. Redaction runs before the
journal write. Seeded credential-shaped values in argv must never reach a
persisted row (security-negative tests).

Envelope digest = SHA-256 over canonical envelope bytes (spec `BRJ:a:1`).

## 5. Package map

| Path | Role |
|---|---|
| `packages/journal/src/bytes.ts` | Shared canonical byte grammar |
| `packages/journal/src/chain.ts` | Genesis + chain framing |
| `packages/journal/src/envelope.ts` | Normalized envelope (a) |
| `packages/journal/src/row.ts` | Minimal command-row encoding (c-min) |
| `packages/journal/src/redact.ts` | Secret redaction |
| `packages/journal/src/store.ts` | Singular append-only in-memory journal |
| `packages/journal/src/dispatch.ts` | Fail-closed governed dispatch |
| `packages/journal/vectors/` | Implementation-generated golden vectors |
| `test/journal-*.test.ts` | §7.1–7.3 proofs + honesty tests |

## 6. One-command verify

```bash
npm ci && npm run test:journal
```

Honesty rule: tests bind status to real evidence — removing an append-only,
singularity, fail-closed, or redaction guard must turn green proofs red.

## Changelog

- **v0.1-foundation (this PR):** §7.1–7.3 proofs at pin `ad23c6e`; in-memory
  singular journal; fail-closed dispatch; secret redaction; golden vectors.
  Neon production store and full (c)/(d) schemas deferred.
