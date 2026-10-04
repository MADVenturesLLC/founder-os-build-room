# redaction — the secret boundary (v0)

> **Amendment above v0.1 — `BUILTIN_SHAPES` anchoring.** Every prefixed shape
> (`openai-style-sk`, `github-pat`, `aws-access-key-id`, `slack-token`, `jwt`)
> was anchored on `\b`. A JavaScript word boundary does not fire between `_`
> and a letter, so all five missed a token glued after a namespace prefix —
> `ghp_…` was caught, `anything_ghp_…` was not. They now use a negative
> lookbehind for `[A-Za-z0-9]`. **These shapes match strictly more input than
> at v0.1**: a consumer holding snapshots over redacted output may see new
> redactions. `pem-private-key` is unchanged. `src/registry.ts` is re-pinned
> above the v0.1 base in `test/run-harness-redaction-wiring.test.ts`; every
> other source file stays at its v0.1 digest.


**Lane B of the OMP→MAD Evolve Pack v0** (Founder act of 2026-09-13,
"mechanism steal, not clone"). Status: controlled/fixture-honest work under
the AE-01 boundaries — NOT production, NOT live occupancy, NO provider
execution, NO Phase 2 claim. Merge is a separate Founder act.

## What it is

A control layer at the **writers**. `scripts/secret-scan.sh` (gitleaks)
stays the verification layer; neither is the sole control.

| piece | file | rule |
|---|---|---|
| `SecretRegistry` | `src/registry.ts` | knows what is secret: env-name heuristics over a caller-supplied env map, a manifest that names (never carries) secrets and enables built-in shapes, and generation-time registration |
| `generateFixturePassword` | `src/registry.ts` | mints and registers in one call; refuses and discards anything under 16 characters |
| `createRedactor` | `src/redactor.ts` | `replace` mode: `[REDACTED:<name>:<hmac16>]`, deterministic under the key, one-way. `obfuscate` is declared and **not wired** — construction throws |
| `KeychainHmacKeyCustody` | `src/key-custody.ts` | read-only custody of the HMAC key in its own item, service `mad.redaction.hmac`, account `hmac-v1` |
| `RedactionBoundary` + sinks | `src/sinks.ts` | journal append, evidence bundle, harness log + plain-text stderr (v0.1) + flattened-error paths — writers, not call sites; refuse every write when the boundary is not ready |

## Fail-closed, by construction

`RedactionBoundary.open()` never throws; it returns `ready` or `refused`
with a code (`registry_unloadable`, `key_absent`, `key_unavailable`,
`mode_not_wired`, `redactor_unbuildable`). Every sink built over a refused
boundary throws `RedactionRefusedError` before touching its inner writer.
A registry that refused any entry (a credential-shaped env var with a value
under 8 characters, a manifest-named secret that is unset) is not loadable
until the entry is explicitly ignored by name, which the load report shows.

Errors are write paths too: the harness error sink flattens and redacts
message, stack, code, and cause; an inner writer that throws is re-thrown as
`SinkWriteError` carrying only redacted text.

## Key custody — separate item, never self-provisioned

The key is read from Keychain with exactly
`find-generic-password -a hmac-v1 -s mad.redaction.hmac -w` (hex, ≥ 32
bytes). This package never runs `add-`, `delete-`, or `-U`, and it does not
import or modify `packages/gateway-daemon/**` custody or signing. Creating
the item is a custody act performed by the Founder or under a Founder
authorization; until it exists, the boundary refuses to write. Fixture
custody classes (`InMemoryHmacKeyCustody`, `UnavailableHmacKeyCustody`)
exist for tests and controlled fixtures only.

## Wired under the run-harness (v0, Lane B wiring act of 2026-09-14)

The sinks are installed under the two evidence writers that exist:

- Phase 2 bundle write — `packages/run-harness/src/cli.ts` writes through
  `EvidenceBundleWriter`; its stdout, stderr, and runner log go through the
  boundary (`HarnessLogSink` for stdout and flattened errors).
- Phase 3 evidence — `packages/run-harness/src/phase3/redacted-evidence.ts`
  redacts the evidence tree before `writePhase3Evidence` (reservation,
  closed-shape check, byte read-back untouched); the CLI's stdout and stderr
  go through the boundary.

The registry, custody choice, and refusal line live in one place,
`packages/run-harness/src/redaction-boundary.ts`: `CONTROL_PLANE_TOKEN` is
named by a manifest and excluded from the heuristic scan (one registration,
never two), every value is trimmed to match what the client sends, and the
key comes from Keychain on darwin only. Every other platform refuses in v1.
A refused boundary makes either harness exit **3** with one line,
`redaction refused: <code>`, before any request, reservation, or write.
There is no switch that turns the boundary off.

Not wired, by ruling: `JournalAppendSink`. The Founder's ruling of
2026-10-04 (C3 — RULING, landed at
`docs/planning/command-journal/custody/FOUNDER-RULING-journal-redaction-C3-FD3-20261003.txt`)
designates the §6.1 pre-write guard in `packages/journal/src/redact.ts`,
applied in the control plane's `JournalStore` before any database contact,
as the redaction boundary of the production journal write path. This sink is
not wired into the journal store and is never stacked on that guard; a keyed
boundary may replace the guard only under a later act that names it. The
same ruling resolves FD-3: no HMAC key is provisioned for the journal write
path, so the fail-closed rule in `src/sinks.ts` (no key, no write) never
meets a journal writer. The guard's detection list is held to this package's
`BUILTIN_SHAPES` by `test/journal-redaction-registry-parity.test.ts`: a shape
added here that the guard does not detect fails that test.
The Keychain item `mad.redaction.hmac` / `hmac-v1` is a Founder custody act;
until it exists on the gateway host, the wired harnesses refuse there.

## Known limits (v0)

- Exact-substring and enabled-shape matching only. Encoded forms (base64,
  URL-encoded, split across lines) are not caught; the verification layer
  still applies.
- Object keys are redacted as strings; a secret used as a Map key is
  stringified first.

## Evolved from OMP vs invented here

- **Evolved (mechanism named in the act):** a secret registry fed by
  env-name heuristics, a manifest, and built-in shapes; `replace` and
  `obfuscate` modes; redaction at the sinks. No OMP code was read or
  vendored; the mechanism was taken from its description in the act.
- **Invented here:** the keyed, truncated HMAC token with a stable name
  label; the loadability rule (refusals block the boundary until ignored by
  name); generation-time registration with the 16-character floor; the
  boundary/sink split with fail-closed writers and redacted error re-throw;
  the separate read-only Keychain custody item.

## Verify

```sh
npm run build && node --test dist/test/redaction.test.js
```
